import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── 중복 거래 감지 & 삭제 API ──
// GET: 중복 건수 조회
// DELETE: 중복 건 삭제 (가장 먼저 등록된 것만 남기고 나머지 삭제)

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// 중복 감지: 날짜 + 거래처 + 금액 + 결제수단이 동일한 건
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const company_id = searchParams.get('company_id')
    if (!company_id) return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })

    const sb = getSupabaseAdmin()

    const { data: allTxs, error } = await sb
      .from('transactions')
      .select('id, transaction_date, client_name, amount, payment_method, created_at')
      .eq('company_id', company_id)
      .order('created_at', { ascending: true })

    if (error) throw error

    // 해시로 그룹핑
    const groups: Record<string, any[]> = {}
    for (const tx of allTxs || []) {
      const key = `${tx.transaction_date}|${tx.client_name}|${tx.amount}|${tx.payment_method}`
      if (!groups[key]) groups[key] = []
      groups[key].push(tx)
    }

    // 2건 이상인 그룹 = 중복
    const duplicateGroups = Object.entries(groups).filter(([, txs]) => txs.length > 1)
    const duplicateIds: string[] = []
    const samples: any[] = []

    for (const [key, txs] of duplicateGroups) {
      // 첫 번째 제외하고 나머지가 중복
      const extras = txs.slice(1)
      duplicateIds.push(...extras.map(t => t.id))
      samples.push({
        key,
        count: txs.length,
        keepId: txs[0].id,
        removeIds: extras.map(t => t.id),
        sample: txs[0],
      })
    }

    return NextResponse.json({
      totalTransactions: (allTxs || []).length,
      duplicateCount: duplicateIds.length,
      groupCount: duplicateGroups.length,
      duplicateIds,
      samples: samples.slice(0, 20), // 상위 20개 샘플
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { company_id } = await request.json()
    if (!company_id) return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })

    const sb = getSupabaseAdmin()

    // 모든 거래 조회
    const { data: allTxs, error } = await sb
      .from('transactions')
      .select('id, transaction_date, client_name, amount, payment_method, created_at')
      .eq('company_id', company_id)
      .order('created_at', { ascending: true })

    if (error) throw error

    // 해시로 그룹핑
    const groups: Record<string, any[]> = {}
    for (const tx of allTxs || []) {
      const key = `${tx.transaction_date}|${tx.client_name}|${tx.amount}|${tx.payment_method}`
      if (!groups[key]) groups[key] = []
      groups[key].push(tx)
    }

    // 중복 ID 수집 (첫 번째 제외)
    const idsToDelete: string[] = []
    for (const [, txs] of Object.entries(groups)) {
      if (txs.length > 1) {
        idsToDelete.push(...txs.slice(1).map(t => t.id))
      }
    }

    if (idsToDelete.length === 0) {
      return NextResponse.json({ message: '중복 거래가 없습니다.', deleted: 0 })
    }

    // 50건씩 배치 삭제
    let totalDeleted = 0
    for (let i = 0; i < idsToDelete.length; i += 50) {
      const batch = idsToDelete.slice(i, i + 50)
      const { error: delErr } = await sb
        .from('transactions')
        .delete()
        .in('id', batch)

      if (!delErr) totalDeleted += batch.length
      else console.error('Delete batch error:', delErr.message)
    }

    return NextResponse.json({
      message: `${totalDeleted}건 중복 거래 삭제 완료`,
      deleted: totalDeleted,
      remaining: (allTxs || []).length - totalDeleted,
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
