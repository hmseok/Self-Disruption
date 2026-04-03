import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const COMPANY_ID = '971784ff-f42c-49cf-a4b5-32ce7883c00a'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, excelRows } = body

    if (action === 'analyze') {
      try {
        // Step 1: Query all transactions
        const txs = await prisma.$queryRaw<any[]>`
          SELECT id, transaction_date, client_name, amount, type, category, description, related_type, related_id, status
          FROM transactions
          ORDER BY transaction_date ASC
        `

        // Build matching index
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

        // Check DB transactions for balance-like amounts
        const dbBalanceIssues: any[] = []
        for (const tx of txs || []) {
          const amt = Math.abs(Number(tx.amount || 0))
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
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    if (action === 'update') {
      try {
        // Step 2: Actually update transaction_date with full datetime
        const { matchedItems } = body
        let updateCount = 0
        let errorCount = 0
        const errors: string[] = []

        // Batch update in groups of 50
        for (let i = 0; i < matchedItems.length; i++) {
          const item = matchedItems[i]
          try {
            await prisma.$executeRaw`
              UPDATE transactions
              SET transaction_date = ${item.newDatetime}
              WHERE id = ${item.txId}
            `
            updateCount++
          } catch (error: any) {
            errorCount++
            if (errors.length < 10) errors.push(`${item.txId}: ${error.message}`)
          }
        }

        return NextResponse.json({
          success: true,
          updateCount,
          errorCount,
          errors,
        })
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    if (action === 'insert_unmatched') {
      try {
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
          for (const item of batch) {
            try {
              await prisma.$executeRaw`
                INSERT INTO classification_queue
                  (ai_category, ai_confidence, alternatives, status, created_at)
                VALUES
                  (${item.ai_category}, ${item.ai_confidence}, ${JSON.stringify(item.alternatives)}, ${item.status}, NOW())
              `
              insertCount++
            } catch (error: any) {
              console.error(`Insert failed for item:`, error.message)
            }
          }
        }

        return NextResponse.json({ success: true, insertCount })
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    if (action === 'check_duplicates') {
      try {
        // Find duplicate items in classification_queue
        const queueItems = await prisma.$queryRaw<any[]>`
          SELECT id, alternatives, status, created_at
          FROM classification_queue
          WHERE status IN ('pending', 'confirmed', 'auto_confirmed')
          ORDER BY created_at DESC
        `

        // Build fingerprint map: date|client|amount|type
        const fpMap = new Map<string, any[]>()
        for (const item of queueItems || []) {
          const alternatives = typeof item.alternatives === 'string' ? JSON.parse(item.alternatives) : item.alternatives
          const sd = alternatives?.source_data
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

        // Find duplicates
        const duplicates: any[] = []
        const pendingDupIds: string[] = []
        for (const [fp, items] of fpMap) {
          const pendingItems = items.filter(i => i.status === 'pending')
          if (pendingItems.length > 1) {
            duplicates.push({ fingerprint: fp, count: pendingItems.length, items: pendingItems })
            for (let i = 1; i < pendingItems.length; i++) {
              pendingDupIds.push(pendingItems[i].id)
            }
          }
          const confirmedItems = items.filter(i => i.status !== 'pending')
          if (confirmedItems.length > 0 && pendingItems.length > 0) {
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
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    if (action === 'check_confirmed_duplicates') {
      try {
        // Check for duplicates within confirmed transactions
        const txs = await prisma.$queryRaw<any[]>`
          SELECT id, transaction_date, client_name, amount, type, category, related_type, related_id, description, status
          FROM transactions
          ORDER BY transaction_date ASC
        `

        // Build fingerprint map
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
            const times = items.map((i: any) => (i.transaction_date || '').substring(11))
            const uniqueTimes = new Set(times)
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

        duplicates.sort((a, b) => b.count - a.count)

        return NextResponse.json({
          totalTransactions: txs?.length || 0,
          uniqueFingerprints: fpMap.size,
          duplicateGroups: duplicates.length,
          totalExtraItems: totalDupCount,
          trueDuplicates: duplicates.filter(d => d.allSameTime),
          differentTimeDups: duplicates.filter(d => !d.allSameTime).slice(0, 10),
        })
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    if (action === 'delete_duplicates') {
      try {
        const { ids } = body
        if (!ids || ids.length === 0) {
          return NextResponse.json({ error: 'No IDs to delete' }, { status: 400 })
        }

        let deleteCount = 0
        for (let i = 0; i < ids.length; i += 50) {
          const batch = ids.slice(i, i + 50)
          await prisma.$executeRaw`
            DELETE FROM classification_queue
            WHERE id IN (${Prisma.join(batch)})
          `
          deleteCount += batch.length
        }

        return NextResponse.json({ success: true, deleteCount })
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    if (action === 'delete_confirmed_duplicates') {
      try {
        const { ids } = body
        if (!ids || ids.length === 0) {
          return NextResponse.json({ error: 'No IDs to delete' }, { status: 400 })
        }

        let deleteCount = 0
        for (let i = 0; i < ids.length; i += 50) {
          const batch = ids.slice(i, i + 50)
          await prisma.$executeRaw`
            DELETE FROM transactions
            WHERE id IN (${Prisma.join(batch)})
          `
          deleteCount += batch.length
        }

        return NextResponse.json({ success: true, deleteCount })
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    if (action === 'alter_column_type') {
      // MySQL doesn't need timestamptz conversion like PostgreSQL
      // Schema migration should have already handled this
      return NextResponse.json({ success: true, message: 'MySQL에서는 불필요합니다.' })
    }

    if (action === 'check_column_type') {
      try {
        // Check the actual DB column type and raw values
        const sample = await prisma.$queryRaw<any[]>`
          SELECT id, transaction_date
          FROM transactions
          LIMIT 5
        `

        const testId = sample?.[0]?.id
        const testDatetime = '2026-02-25 16:45:06'

        // Try to update one specific record
        await prisma.$executeRaw`
          UPDATE transactions
          SET transaction_date = ${testDatetime}
          WHERE id = ${testId}
        `

        const afterUpdate = await prisma.$queryRaw<any[]>`
          SELECT id, transaction_date
          FROM transactions
          WHERE id = ${testId}
        `

        // Try with full ISO format
        await prisma.$executeRaw`
          UPDATE transactions
          SET transaction_date = '2026-02-25T16:45:06+09:00'
          WHERE id = ${testId}
        `

        const afterUpdate2 = await prisma.$queryRaw<any[]>`
          SELECT id, transaction_date
          FROM transactions
          WHERE id = ${testId}
        `

        return NextResponse.json({
          sampleBefore: sample,
          testId,
          afterPlainDatetime: afterUpdate,
          afterTimestamptz: afterUpdate2,
        })
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    if (action === 'update_queue_time') {
      try {
        // Update classification_queue source_data.transaction_date with time from excelRows
        const queue = await prisma.$queryRaw<any[]>`
          SELECT id, alternatives, status
          FROM classification_queue
        `

        // Build excel index
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
          const alternatives = typeof item.alternatives === 'string' ? JSON.parse(item.alternatives) : item.alternatives
          const sd = alternatives?.source_data
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
            const newAlternatives = {
              ...alternatives,
              source_data: {
                ...sd,
                transaction_date: found.datetime,
              }
            }
            try {
              await prisma.$executeRaw`
                UPDATE classification_queue
                SET alternatives = ${JSON.stringify(newAlternatives)}
                WHERE id = ${item.id}
              `
              updateCount++
            } catch (error: any) {
              console.error(`Update failed for item ${item.id}:`, error.message)
            }
          } else {
            noMatchCount++
          }
        }

        return NextResponse.json({
          totalQueue: queue?.length || 0,
          updated: updateCount,
          noMatch: noMatchCount,
        })
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    if (action === 'diagnose') {
      try {
        // 전체 DB 상태 진단
        const txs = await prisma.$queryRaw<any[]>`
          SELECT id, transaction_date, client_name, amount, type, status
          FROM transactions
        `

        const queue = await prisma.$queryRaw<any[]>`
          SELECT id, status, alternatives, created_at
          FROM classification_queue
        `

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
          .map(q => {
            const alternatives = typeof q.alternatives === 'string' ? JSON.parse(q.alternatives) : q.alternatives
            return {
              id: q.id,
              status: q.status,
              source_data: alternatives?.source_data,
            }
          })

        // classification_queue에서 confirmed 항목 체크
        const confirmedQueue = (queue || []).filter(q => q.status === 'confirmed' || q.status === 'auto_confirmed')
        const confirmedWithTime = confirmedQueue.filter(q => {
          const alternatives = typeof q.alternatives === 'string' ? JSON.parse(q.alternatives) : q.alternatives
          const dt = alternatives?.source_data?.transaction_date || ''
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
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
