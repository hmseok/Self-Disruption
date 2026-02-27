import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '../../../utils/auth-guard'
import { getSupabaseAdmin } from '../../../utils/supabase-admin'

// ═══ GET: 특이건 목록 조회 ═══
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company_id')
  const status = searchParams.get('status') // pending, approved, personal_confirmed, dismissed
  const flagType = searchParams.get('flag_type')
  const cardId = searchParams.get('card_id')
  const employeeId = searchParams.get('employee_id')
  const limit = Math.min(Number(searchParams.get('limit')) || 100, 500)
  const offset = Number(searchParams.get('offset')) || 0

  if (!companyId) {
    return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  let query = sb
    .from('transaction_flags')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    if (status === 'unresolved') {
      query = query.in('status', ['pending', 'reviewing'])
    } else {
      query = query.eq('status', status)
    }
  }
  if (flagType) query = query.eq('flag_type', flagType)
  if (cardId) query = query.eq('card_id', cardId)
  if (employeeId) query = query.eq('employee_id', employeeId)

  const { data, error } = await query

  if (error) {
    console.error('[flags GET] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 통계
  const { data: stats } = await sb
    .from('transaction_flags')
    .select('status')
    .eq('company_id', companyId)

  const summary = {
    total: stats?.length || 0,
    pending: stats?.filter(s => s.status === 'pending').length || 0,
    reviewing: stats?.filter(s => s.status === 'reviewing').length || 0,
    approved: stats?.filter(s => s.status === 'approved').length || 0,
    personal_confirmed: stats?.filter(s => s.status === 'personal_confirmed').length || 0,
    dismissed: stats?.filter(s => s.status === 'dismissed').length || 0,
  }

  return NextResponse.json({ items: data || [], summary })
}

// ═══ POST: 특이건 플래그 생성 (자동/수동) ═══
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const body = await request.json()
  const { company_id, flags } = body

  if (!company_id || !flags || !Array.isArray(flags)) {
    return NextResponse.json({ error: 'company_id, flags 배열 필요' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // 중복 플래그 방지: 같은 transaction_id + flag_type 조합 체크
  const newFlags = []
  for (const flag of flags) {
    if (flag.transaction_id) {
      const { data: existing } = await sb
        .from('transaction_flags')
        .select('id')
        .eq('transaction_id', flag.transaction_id)
        .eq('flag_type', flag.flag_type)
        .maybeSingle()

      if (existing) continue // 이미 존재하면 스킵
    }

    newFlags.push({
      company_id,
      transaction_id: flag.transaction_id || null,
      queue_id: flag.queue_id || null,
      flag_type: flag.flag_type,
      flag_reason: flag.flag_reason || null,
      severity: flag.severity || 'medium',
      status: 'pending',
      transaction_date: flag.transaction_date || null,
      client_name: flag.client_name || null,
      amount: flag.amount || 0,
      card_id: flag.card_id || null,
      employee_id: flag.employee_id || null,
      employee_name: flag.employee_name || null,
    })
  }

  if (newFlags.length === 0) {
    return NextResponse.json({ created: 0, message: '새로운 플래그 없음 (중복 제외)' })
  }

  const { data, error } = await sb
    .from('transaction_flags')
    .insert(newFlags)
    .select()

  if (error) {
    console.error('[flags POST] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ created: data?.length || 0, items: data })
}

// ═══ PATCH: 특이건 상태 업데이트 (검토 처리) ═══
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const body = await request.json()
  const { flag_ids, status: newStatus, reviewer_note, create_salary_adjustment } = body

  if (!flag_ids || !Array.isArray(flag_ids) || !newStatus) {
    return NextResponse.json({ error: 'flag_ids, status 필요' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const updateData: any = {
    status: newStatus,
    reviewer_id: auth.userId,
    reviewer_note: reviewer_note || null,
    resolved_at: ['approved', 'personal_confirmed', 'dismissed'].includes(newStatus) ? new Date().toISOString() : null,
  }

  const { data, error } = await sb
    .from('transaction_flags')
    .update(updateData)
    .in('id', flag_ids)
    .select()

  if (error) {
    console.error('[flags PATCH] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 개인 사용 확정 시 급여 조정 자동 생성
  if (newStatus === 'personal_confirmed' && create_salary_adjustment !== false) {
    const adjustments = []
    for (const flag of (data || [])) {
      if (!flag.employee_id || !flag.amount) continue

      const yearMonth = flag.transaction_date
        ? new Date(flag.transaction_date).toISOString().slice(0, 7)
        : new Date().toISOString().slice(0, 7)

      adjustments.push({
        company_id: flag.company_id,
        employee_id: flag.employee_id,
        year_month: yearMonth,
        adjustment_type: 'deduct',
        amount: flag.amount,
        reason: `법인카드 개인사용 - ${flag.client_name || ''} (${flag.transaction_date || ''})`,
        source_transaction_id: flag.transaction_id || null,
        source_flag_id: flag.id,
        status: 'pending',
      })
    }

    if (adjustments.length > 0) {
      const { data: adjData, error: adjError } = await sb
        .from('salary_adjustments')
        .insert(adjustments)
        .select()

      if (adjError) {
        console.error('[flags PATCH] salary_adjustment insert error:', adjError)
      } else if (adjData) {
        // 플래그에 salary_adjustment_id 연결
        for (const adj of adjData) {
          if (adj.source_flag_id) {
            await sb.from('transaction_flags')
              .update({ salary_adjustment_id: adj.id })
              .eq('id', adj.source_flag_id)
          }
        }
      }
    }
  }

  return NextResponse.json({ updated: data?.length || 0, items: data })
}
