import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── 엑셀 기준 데이터 임포트 API ──
// POST: 엑셀 파싱 데이터를 받아서
//   1) transactions 테이블에 매칭되는 건 → 업데이트 (날짜시간, 거래처명, 적요)
//   2) 매칭 안 되는 건 → classification_queue에 pending 삽입

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// 전체 데이터 페이지네이션 조회
async function fetchAll(sb: ReturnType<typeof getSupabaseAdmin>, table: string, company_id: string, select: string) {
  const PAGE = 1000
  let all: any[] = []
  let offset = 0
  while (true) {
    const { data, error } = await sb
      .from(table)
      .select(select)
      .eq('company_id', company_id)
      .is('deleted_at', null)
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    offset += data.length
    if (data.length < PAGE) break
  }
  return all
}

export async function POST(request: NextRequest) {
  try {
    const { company_id, excel_rows } = await request.json()
    if (!company_id || !excel_rows?.length) {
      return NextResponse.json({ error: 'company_id와 excel_rows 필요' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // 1) 기존 transactions 조회
    const transactions = await fetchAll(sb, 'transactions', company_id,
      'id, transaction_date, client_name, amount, description, payment_method')

    // 2) 기존 classification_queue의 confirmed 건 조회 (이미 확정된 건)
    const { data: confirmedQueue } = await sb
      .from('classification_queue')
      .select('id, source_data, status')
      .eq('company_id', company_id)
      .is('deleted_at', null)
      .in('status', ['confirmed', 'auto_confirmed'])

    // 3) transactions를 (date, abs_amount) → 배열로 그룹핑
    const txMap = new Map<string, any[]>()
    for (const tx of transactions) {
      const d = (tx.transaction_date || '').substring(0, 10)
      const a = Math.abs(Number(tx.amount || 0))
      const key = `${d}|${a}`
      if (!txMap.has(key)) txMap.set(key, [])
      txMap.get(key)!.push({ ...tx, _matched: false })
    }

    // 4) 엑셀 행을 순회하며 매칭
    const matched: { txId: string; excelRow: any }[] = []
    const unmatched: any[] = []

    for (const row of excel_rows) {
      const dateOnly = (row.date || '').substring(0, 10)
      const absAmt = Math.abs(Number(row.amount || 0))
      const key = `${dateOnly}|${absAmt}`

      const candidates = txMap.get(key) || []
      // 아직 매칭 안 된 첫 번째 트랜잭션 찾기
      const unmatchedTx = candidates.find((c: any) => !c._matched)

      if (unmatchedTx) {
        unmatchedTx._matched = true
        matched.push({ txId: unmatchedTx.id, excelRow: row })
      } else {
        unmatched.push(row)
      }
    }

    // 5) 매칭된 건: transactions 업데이트 (엑셀 원본 데이터로)
    let updatedCount = 0
    const updateErrors: string[] = []
    for (let i = 0; i < matched.length; i += 50) {
      const batch = matched.slice(i, i + 50)
      for (const { txId, excelRow } of batch) {
        const updateData: any = {}
        // 날짜+시간 업데이트 (엑셀에 시간 정보가 있으면)
        if (excelRow.datetime && excelRow.datetime.length > 10) {
          updateData.transaction_date = excelRow.datetime
        }
        // description 업데이트: 적요 + 거래처명
        const desc = `${(excelRow.summary || '').trim()} ${(excelRow.client || '').trim()}`.trim()
        if (desc) {
          updateData.description = desc
        }

        if (Object.keys(updateData).length > 0) {
          const { error } = await sb
            .from('transactions')
            .update(updateData)
            .eq('id', txId)
          if (!error) updatedCount++
          else updateErrors.push(`${txId}: ${error.message}`)
        }
      }
    }

    // 6) 엑셀에 없는 확정건 soft-delete (매칭 안 된 transactions)
    const unmatchedTxIds: string[] = []
    for (const [, txGroup] of txMap) {
      for (const tx of txGroup) {
        if (!tx._matched) {
          unmatchedTxIds.push(tx.id)
        }
      }
    }
    let deletedTxCount = 0
    if (unmatchedTxIds.length > 0) {
      const now = new Date().toISOString()
      for (let i = 0; i < unmatchedTxIds.length; i += 50) {
        const batch = unmatchedTxIds.slice(i, i + 50)
        const { error } = await sb
          .from('transactions')
          .update({ deleted_at: now })
          .in('id', batch)
        if (!error) deletedTxCount += batch.length
        else console.error('Delete tx error:', error.message)
      }
    }

    // 7) 매칭 안 된 엑셀 건: classification_queue에 삽입
    let insertedCount = 0
    for (let i = 0; i < unmatched.length; i += 50) {
      const batch = unmatched.slice(i, i + 50)
      const inserts = batch.map((row: any) => ({
        company_id,
        status: 'pending',
        source_data: {
          transaction_date: row.datetime || row.date,
          client_name: row.client || '',
          amount: row.amount,
          description: `${(row.summary || '').trim()} ${(row.client || '').trim()}`.trim(),
          payment_method: '통장',
          memo: row.memo || '',
          source: 'excel_import',
        },
        created_at: new Date().toISOString(),
      }))

      const { error } = await sb
        .from('classification_queue')
        .insert(inserts)
      if (!error) insertedCount += inserts.length
      else console.error('Insert error:', error.message)
    }

    return NextResponse.json({
      total_excel: excel_rows.length,
      total_transactions: transactions.length,
      matched: matched.length,
      updated: updatedCount,
      unmatched_excel: unmatched.length,
      inserted: insertedCount,
      unmatched_tx: unmatchedTxIds.length,
      deleted_tx: deletedTxCount,
      summary: `엑셀 ${excel_rows.length}건: ${matched.length}건 매칭(업데이트), ${unmatched.length}건 신규(분류대기), ${deletedTxCount}건 기존확정 삭제`,
    })

  } catch (error: any) {
    console.error('Import error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
