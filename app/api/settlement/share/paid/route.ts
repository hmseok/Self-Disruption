import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 정산 지급완료 처리 API
// PATCH → settlement_shares의 paid_at 업데이트
//       + transactions 레코드 생성 (지급완료 시)
//       + transactions 레코드 삭제 (취소 시)
// ============================================

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await getSupabaseAdmin()
    .from('profiles').select('role, company_id').eq('id', user.id).single()
  if (!profile || !['god_admin', 'master'].includes(profile.role)) return null
  return { ...user, role: profile.role, company_id: profile.company_id }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

    const { share_ids, action } = await request.json() as {
      share_ids: string[]
      action: 'mark_paid' | 'unmark_paid'
    }

    if (!Array.isArray(share_ids) || share_ids.length === 0) {
      return NextResponse.json({ error: 'share_ids 필수' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const now = new Date().toISOString()
    const todayStr = now.slice(0, 10)

    if (action === 'mark_paid') {
      // ── 1. settlement_shares paid_at 업데이트 ──
      const { data: updatedShares, error: updateErr } = await sb
        .from('settlement_shares')
        .update({ paid_at: now })
        .in('id', share_ids)
        .eq('company_id', admin.company_id)
        .select('id, paid_at, items, total_amount, recipient_name, settlement_month, company_id')

      if (updateErr) {
        console.error('[settlement/share/paid] 업데이트 오류:', updateErr)
        return NextResponse.json({ error: '업데이트 실패' }, { status: 500 })
      }

      // ── 2. 각 share의 items를 파싱하여 transactions 생성 ──
      const txInserts: any[] = []

      for (const share of (updatedShares || [])) {
        const items = share.items as any[]
        if (!items || !Array.isArray(items)) continue

        for (const item of items) {
          // item: { type, relatedId, monthLabel, amount, detail, carNumber, carId, breakdown }
          const amount = item.amount || item.breakdown?.netPayout || 0
          if (amount <= 0) continue

          const relatedType = item.type === 'jiip' ? 'jiip_share' : item.type === 'invest' ? 'invest' : null
          const relatedId = item.relatedId || null

          if (!relatedType) continue

          const desc = item.type === 'jiip'
            ? `지입정산 ${share.recipient_name} ${item.monthLabel || ''}월분`
            : `투자이자 ${share.recipient_name} ${item.monthLabel || ''}월분`

          txInserts.push({
            company_id: share.company_id,
            transaction_date: todayStr,
            type: 'expense',
            status: 'completed',
            category: item.type === 'jiip' ? '지입정산' : '투자이자',
            client_name: share.recipient_name,
            description: desc,
            amount: amount,
            payment_method: '이체',
            related_type: relatedType,
            related_id: relatedId,
            // settlement_share_id를 description에 포함하여 취소 시 찾기 쉽게
            memo: `settlement_share:${share.id}`,
          })
        }

        // items에 개별 항목이 없거나 relatedId가 없는 경우 → 총액으로 1건 생성
        if (txInserts.filter(t => t.memo === `settlement_share:${share.id}`).length === 0 && share.total_amount > 0) {
          txInserts.push({
            company_id: share.company_id,
            transaction_date: todayStr,
            type: 'expense',
            status: 'completed',
            category: '정산지급',
            client_name: share.recipient_name,
            description: `정산 지급 ${share.recipient_name} ${share.settlement_month}월분`,
            amount: share.total_amount,
            payment_method: '이체',
            related_type: null,
            related_id: null,
            memo: `settlement_share:${share.id}`,
          })
        }
      }

      // ── 3. transactions 일괄 삽입 ──
      if (txInserts.length > 0) {
        const { error: txErr } = await sb.from('transactions').insert(txInserts)
        if (txErr) {
          console.error('[settlement/share/paid] 트랜잭션 생성 오류:', txErr)
          // 트랜잭션 생성 실패해도 paid_at은 유지 (로그만 기록)
        }
      }

      return NextResponse.json({
        success: true,
        updated: updatedShares,
        transactions_created: txInserts.length,
      })

    } else {
      // ── unmark_paid: paid_at 초기화 + 관련 transactions 삭제 ──

      // 1. paid_at 초기화
      const { data, error } = await sb
        .from('settlement_shares')
        .update({ paid_at: null })
        .in('id', share_ids)
        .eq('company_id', admin.company_id)
        .select('id, paid_at')

      if (error) {
        console.error('[settlement/share/paid] 오류:', error)
        return NextResponse.json({ error: '업데이트 실패' }, { status: 500 })
      }

      // 2. 해당 share에서 생성된 transactions 삭제
      for (const shareId of share_ids) {
        const memoPattern = `settlement_share:${shareId}`
        await sb
          .from('transactions')
          .delete()
          .eq('company_id', admin.company_id)
          .eq('memo', memoPattern)
      }

      return NextResponse.json({ success: true, updated: data })
    }
  } catch (err: any) {
    console.error('[settlement/share/paid] 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
