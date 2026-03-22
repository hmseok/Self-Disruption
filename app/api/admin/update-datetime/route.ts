import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 엑셀 시간 데이터로 확정 트랜잭션 업데이트 API
// POST: 엑셀 데이터 받아서 매칭 → 업데이트
// ============================================

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const COMPANY_ID = '971784ff-f42c-49cf-a4b5-32ce7883c00a'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, excelRows } = body

    const sb = getSupabaseAdmin()

    if (action === 'analyze') {
      // Step 1: Query all transactions for this company
      const { data: txs, error: txErr } = await sb
        .from('transactions')
        .select('id, transaction_date, client_name, amount, type, category, description, related_type, related_id, status')
        .order('transaction_date', { ascending: true })

      if (txErr) {
        return NextResponse.json({ error: txErr.message }, { status: 500 })
      }

      // Build matching index: (date, client, abs_amount, type) -> [tx]
      const txIndex = new Map<string, any[]>()
      for (const tx of txs || []) {
        const dateOnly = (tx.transaction_date || '').substring(0, 10)
        const client = (tx.client_name || '').trim()
        const absAmt = Math.abs(Number(tx.amount || 0))
        const key = `${dateOnly}|${client}|${absAmt}|${tx.type}`
        if (!txIndex.has(key)) txIndex.set(key, [])
        txIndex.get(key)!.push(tx)
      }

      // Match Excel rows
      const matchedTxIds = new Set<string>()
      const matched: any[] = []
      const unmatchedExcel: any[] = []

      for (const row of excelRows) {
        const dateOnly = row.date
        const client = (row.description || '').trim()
        const absAmt = Math.abs(row.amount)
        const key = `${dateOnly}|${client}|${absAmt}|${row.type}`
        const candidates = txIndex.get(key) || []

        let found: any = null
        for (const c of candidates) {
          if (!matchedTxIds.has(c.id)) {
            found = c
            break
          }
        }

        if (found) {
          matched.push({
            txId: found.id,
            oldDate: found.transaction_date,
            newDatetime: row.datetime,
            client,
            amount: row.amount,
            excelRow: row.row,
            excelBalance: row.balance,
            relatedType: found.related_type,
            relatedId: found.related_id,
          })
          matchedTxIds.add(found.id)
        } else {
          unmatchedExcel.push(row)
        }
      }

      // Find unmatched DB transactions
      const unmatchedDb = (txs || []).filter(t => !matchedTxIds.has(t.id))

      // Balance-as-amount check
      const balanceIssues: any[] = []
      for (const m of matched) {
        const absAmt = Math.abs(m.amount)
        const absBal = Math.abs(m.excelBalance)
        if (absAmt === absBal && absAmt > 1000000) {
          balanceIssues.push({
            txId: m.txId,
            amount: m.amount,
            balance: m.excelBalance,
            client: m.client,
            datetime: m.newDatetime,
          })
        }
      }

      // Check DB transactions: are any amounts suspiciously equal to a nearby balance?
      const dbBalanceIssues: any[] = []
      for (const tx of txs || []) {
        const amt = Math.abs(Number(tx.amount || 0))
        // Flag transactions with amount > 50M (likely balance, not amount)
        if (amt > 50_000_000) {
          dbBalanceIssues.push({
            txId: tx.id,
            amount: tx.amount,
            client: tx.client_name,
            date: tx.transaction_date,
            type: tx.type,
            relatedType: tx.related_type,
          })
        }
      }

      return NextResponse.json({
        totalExcel: excelRows.length,
        totalDb: txs?.length || 0,
        matched: matched.length,
        unmatchedExcel: unmatchedExcel.length,
        unmatchedDb: unmatchedDb.length,
        balanceIssues,
        dbBalanceIssues,
        unmatchedExcelRows: unmatchedExcel,
        unmatchedDbRows: unmatchedDb.slice(0, 30),
        matchedSample: matched.slice(0, 5),
        allMatched: matched,
      })
    }

    if (action === 'update') {
      // Step 2: Actually update transaction_date with full datetime
      const { matchedItems } = body
      let updateCount = 0
      let errorCount = 0
      const errors: string[] = []

      // Batch update in groups of 50
      for (let i = 0; i < matchedItems.length; i++) {
        const item = matchedItems[i]
        const { error } = await sb
          .from('transactions')
          .update({ transaction_date: item.newDatetime })
          .eq('id', item.txId)

        if (error) {
          errorCount++
          if (errors.length < 10) errors.push(`${item.txId}: ${error.message}`)
        } else {
          updateCount++
        }
      }

      return NextResponse.json({
        success: true,
        updateCount,
        errorCount,
        errors,
      })
    }

    if (action === 'insert_unmatched') {
      // Step 3: Insert unmatched Excel rows into classification_queue
      const { unmatchedRows } = body
      const queueItems = unmatchedRows.map((row: any) => ({
        ai_category: '미분류',
        ai_confidence: 0,
        ai_matched_type: null,
        ai_matched_id: null,
        ai_matched_name: null,
        alternatives: {
          candidates: [],
          source_data: {
            transaction_date: row.datetime,
            client_name: row.description || '',
            description: row.summary || '',
            amount: row.amount,
            type: row.type,
            payment_method: 'bank_transfer',
            card_number: '',
            is_cancel: false,
            card_id: null,
            matched_employee_id: null,
            matched_employee_name: null,
            matched_contract_name: null,
            approval_number: '',
            currency: 'KRW',
            original_amount: null,
            bank_name: '우리은행',
            balance: row.balance,
            memo: row.memo || '',
          },
        },
        status: 'pending',
      }))

      if (queueItems.length === 0) {
        return NextResponse.json({ success: true, insertCount: 0 })
      }

      // Insert in batches of 100
      let insertCount = 0
      for (let i = 0; i < queueItems.length; i += 100) {
        const batch = queueItems.slice(i, i + 100)
        const { error } = await sb
          .from('classification_queue')
          .insert(batch)
        if (error) {
          return NextResponse.json({ error: `Insert failed at batch ${i}: ${error.message}` }, { status: 500 })
        }
        insertCount += batch.length
      }

      return NextResponse.json({ success: true, insertCount })
    }

    if (action === 'check_duplicates') {
      // Find duplicate items in classification_queue
      const { data: queueItems, error: qErr } = await sb
        .from('classification_queue')
        .select('id, alternatives, status, created_at')
        .in('status', ['pending', 'confirmed', 'auto_confirmed'])
        .order('created_at', { ascending: false })

      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

      // Build fingerprint map: date|client|amount|type
      const fpMap = new Map<string, any[]>()
      for (const item of queueItems || []) {
        const sd = item.alternatives?.source_data
        if (!sd) continue
        const dateOnly = (sd.transaction_date || '').substring(0, 10)
        const client = (sd.client_name || '').trim()
        const amt = Math.abs(Number(sd.amount || 0))
        const type = sd.type || ''
        const fp = `${dateOnly}|${client}|${amt}|${type}`
        if (!fpMap.has(fp)) fpMap.set(fp, [])
        fpMap.get(fp)!.push({
          id: item.id,
          status: item.status,
          created_at: item.created_at,
          date: sd.transaction_date,
          client,
          amount: sd.amount,
          type,
        })
      }

      // Find duplicates (same fingerprint, more than 1 pending)
      const duplicates: any[] = []
      const pendingDupIds: string[] = []
      for (const [fp, items] of fpMap) {
        const pendingItems = items.filter(i => i.status === 'pending')
        if (pendingItems.length > 1) {
          // Keep the first (oldest), mark rest as duplicates
          duplicates.push({ fingerprint: fp, count: pendingItems.length, items: pendingItems })
          for (let i = 1; i < pendingItems.length; i++) {
            pendingDupIds.push(pendingItems[i].id)
          }
        }
        // Also check if a pending item duplicates a confirmed item
        const confirmedItems = items.filter(i => i.status !== 'pending')
        if (confirmedItems.length > 0 && pendingItems.length > 0) {
          // Pending items that already have confirmed versions
          for (const p of pendingItems) {
            duplicates.push({ fingerprint: fp, reason: 'already_confirmed', pending: p, confirmed: confirmedItems[0] })
            pendingDupIds.push(p.id)
          }
        }
      }

      return NextResponse.json({
        totalQueue: queueItems?.length || 0,
        uniqueFingerprints: fpMap.size,
        duplicateGroups: duplicates.length,
        pendingDupIds,
        duplicates: duplicates.slice(0, 20),
      })
    }

    if (action === 'check_confirmed_duplicates') {
      // Check for duplicates within confirmed transactions
      const { data: txs, error: txErr } = await sb
        .from('transactions')
        .select('id, transaction_date, client_name, amount, type, category, related_type, related_id, description, status')
        .order('transaction_date', { ascending: true })

      if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })

      // Build fingerprint map: date(10char)|client|absAmount|type
      const fpMap = new Map<string, any[]>()
      for (const tx of txs || []) {
        const dateOnly = (tx.transaction_date || '').substring(0, 10)
        const client = (tx.client_name || '').trim()
        const amt = Math.abs(Number(tx.amount || 0))
        const fp = `${dateOnly}|${client}|${amt}|${tx.type}`
        if (!fpMap.has(fp)) fpMap.set(fp, [])
        fpMap.get(fp)!.push(tx)
      }

      const duplicates: any[] = []
      let totalDupCount = 0
      for (const [fp, items] of fpMap) {
        if (items.length > 1) {
          // Check if they have the same time (true dup) or different times (real different txs)
          const times = items.map((i: any) => (i.transaction_date || '').substring(11))
          const uniqueTimes = new Set(times)
          // If all have same time (or no time), likely duplicates
          // If different times, they're different transactions
          const allSameTime = uniqueTimes.size <= 1
          duplicates.push({
            fingerprint: fp,
            count: items.length,
            allSameTime,
            items: items.map((i: any) => ({
              id: i.id,
              date: i.transaction_date,
              client: i.client_name,
              amount: i.amount,
              type: i.type,
              category: i.category,
              related_type: i.related_type,
              related_id: i.related_id,
            }))
          })
          totalDupCount += items.length - 1
        }
      }

      // Sort by count descending
      duplicates.sort((a, b) => b.count - a.count)

      return NextResponse.json({
        totalTransactions: txs?.length || 0,
        uniqueFingerprints: fpMap.size,
        duplicateGroups: duplicates.length,
        totalExtraItems: totalDupCount,
        trueDuplicates: duplicates.filter(d => d.allSameTime),
        differentTimeDups: duplicates.filter(d => !d.allSameTime).slice(0, 10),
      })
    }

    if (action === 'delete_duplicates') {
      const { ids } = body
      if (!ids || ids.length === 0) {
        return NextResponse.json({ error: 'No IDs to delete' }, { status: 400 })
      }

      let deleteCount = 0
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50)
        const { error } = await sb
          .from('classification_queue')
          .delete()
          .in('id', batch)
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
        deleteCount += batch.length
      }

      return NextResponse.json({ success: true, deleteCount })
    }

    if (action === 'delete_confirmed_duplicates') {
      const { ids } = body
      if (!ids || ids.length === 0) {
        return NextResponse.json({ error: 'No IDs to delete' }, { status: 400 })
      }

      let deleteCount = 0
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50)
        const { error } = await sb
          .from('transactions')
          .delete()
          .in('id', batch)
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
        deleteCount += batch.length
      }

      return NextResponse.json({ success: true, deleteCount })
    }

    if (action === 'alter_column_type') {
      // Change transaction_date from date to timestamptz
      const { data, error } = await sb.rpc('exec_sql', {
        query: "ALTER TABLE transactions ALTER COLUMN transaction_date TYPE timestamptz USING transaction_date::timestamptz"
      })

      if (error) {
        // Try direct SQL via supabase-js
        // Supabase doesn't support rpc exec_sql by default, let's use the REST API
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

        const sqlRes = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ query: "ALTER TABLE transactions ALTER COLUMN transaction_date TYPE timestamptz USING transaction_date::timestamptz" })
        })

        const sqlResult = await sqlRes.text()
        return NextResponse.json({
          method: 'rest_rpc',
          status: sqlRes.status,
          result: sqlResult,
          originalError: error.message
        })
      }

      return NextResponse.json({ success: true, data })
    }

    if (action === 'check_column_type') {
      // Check the actual DB column type and raw values
      const { data: sample, error: sErr } = await sb
        .from('transactions')
        .select('id, transaction_date')
        .limit(5)

      // Try to update one specific record and read it back
      const testId = sample?.[0]?.id
      const testDatetime = '2026-02-25 16:45:06'

      const { error: uErr } = await sb
        .from('transactions')
        .update({ transaction_date: testDatetime })
        .eq('id', testId)

      const { data: afterUpdate, error: aErr } = await sb
        .from('transactions')
        .select('id, transaction_date')
        .eq('id', testId)
        .single()

      // Also try with timestamptz format
      const { error: uErr2 } = await sb
        .from('transactions')
        .update({ transaction_date: '2026-02-25T16:45:06+09:00' })
        .eq('id', testId)

      const { data: afterUpdate2 } = await sb
        .from('transactions')
        .select('id, transaction_date')
        .eq('id', testId)
        .single()

      return NextResponse.json({
        sampleBefore: sample,
        testId,
        updateError: uErr?.message,
        afterPlainDatetime: afterUpdate,
        updateError2: uErr2?.message,
        afterTimestamptz: afterUpdate2,
      })
    }

    if (action === 'update_queue_time') {
      // Update classification_queue source_data.transaction_date with time from excelRows
      const { data: queue, error: qErr } = await sb
        .from('classification_queue')
        .select('id, alternatives, status')

      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

      // Build excel index: date|client|absAmount|type -> excelRow (with time)
      const excelIndex = new Map<string, any[]>()
      for (const row of excelRows) {
        const dateOnly = row.date
        const client = (row.description || '').trim()
        const absAmt = Math.abs(row.amount)
        const key = `${dateOnly}|${client}|${absAmt}|${row.type}`
        if (!excelIndex.has(key)) excelIndex.set(key, [])
        excelIndex.get(key)!.push(row)
      }

      const matchedExcelRows = new Set<number>()
      let updateCount = 0
      let noMatchCount = 0

      for (const item of queue || []) {
        const sd = item.alternatives?.source_data
        if (!sd) continue

        const dateOnly = (sd.transaction_date || '').substring(0, 10)
        const client = (sd.client_name || '').trim()
        const absAmt = Math.abs(Number(sd.amount || 0))
        const type = sd.type || ''
        const key = `${dateOnly}|${client}|${absAmt}|${type}`

        const candidates = excelIndex.get(key) || []
        let found: any = null
        for (const c of candidates) {
          if (!matchedExcelRows.has(c.row)) {
            found = c
            break
          }
        }

        if (found && found.time) {
          matchedExcelRows.add(found.row)
          // Update source_data.transaction_date with full datetime
          const newAlternatives = {
            ...item.alternatives,
            source_data: {
              ...sd,
              transaction_date: found.datetime,
            }
          }
          const { error: uErr } = await sb
            .from('classification_queue')
            .update({ alternatives: newAlternatives })
            .eq('id', item.id)
          if (!uErr) updateCount++
        } else {
          noMatchCount++
        }
      }

      return NextResponse.json({
        totalQueue: queue?.length || 0,
        updated: updateCount,
        noMatch: noMatchCount,
      })
    }

    if (action === 'diagnose') {
      // 전체 DB 상태 진단
      const { data: txs, error: txErr } = await sb
        .from('transactions')
        .select('id, transaction_date, client_name, amount, type, status')

      const { data: queue, error: qErr } = await sb
        .from('classification_queue')
        .select('id, status, alternatives, created_at')

      if (txErr || qErr) return NextResponse.json({ error: txErr?.message || qErr?.message }, { status: 500 })

      // 시간 적용 상태 확인
      const withTime = (txs || []).filter(t => (t.transaction_date || '').length > 10)
      const withoutTime = (txs || []).filter(t => (t.transaction_date || '').length <= 10)

      // classification_queue 상태별 카운트
      const queueByStatus: Record<string, number> = {}
      for (const q of queue || []) {
        queueByStatus[q.status] = (queueByStatus[q.status] || 0) + 1
      }

      // 시간 없는 거래 샘플
      const noTimeSample = withoutTime.slice(0, 10).map(t => ({
        id: t.id,
        date: t.transaction_date,
        client: t.client_name,
        amount: t.amount,
        type: t.type,
      }))

      // classification_queue 샘플 (pending)
      const pendingSample = (queue || [])
        .filter(q => q.status === 'pending')
        .slice(0, 5)
        .map(q => ({
          id: q.id,
          status: q.status,
          source_data: q.alternatives?.source_data,
        }))

      // classification_queue에서 confirmed 항목의 source_data 시간 체크
      const confirmedQueue = (queue || []).filter(q => q.status === 'confirmed' || q.status === 'auto_confirmed')
      const confirmedWithTime = confirmedQueue.filter(q => {
        const dt = q.alternatives?.source_data?.transaction_date || ''
        return dt.length > 10
      })

      return NextResponse.json({
        transactions: {
          total: txs?.length || 0,
          withTime: withTime.length,
          withoutTime: withoutTime.length,
          noTimeSample,
        },
        classificationQueue: {
          total: queue?.length || 0,
          byStatus: queueByStatus,
          confirmedWithTime: confirmedWithTime.length,
          confirmedTotal: confirmedQueue.length,
          pendingSample,
        },
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
