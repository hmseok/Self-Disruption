import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 계약 상태 관리 API
// POST → 상태 변경 + 이력 기록
// GET  → 상태 변경 이력 조회
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

const VALID_TRANSITIONS: Record<string, string[]> = {
  active: ['expired', 'terminated'],
  expired: ['renewed', 'terminated'],
  terminated: [],
  renewed: ['expired', 'terminated'],
}

// POST: 상태 변경
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { contract_type, contract_id, new_status, reason } = body

  if (!contract_type || !contract_id || !new_status) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  }
  if (!['jiip', 'invest'].includes(contract_type)) {
    return NextResponse.json({ error: '유효하지 않은 계약 유형' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const tableName = contract_type === 'jiip' ? 'jiip_contracts' : 'general_investments'

  // 현재 상태 조회
  const { data: contract, error: fetchErr } = await sb
    .from(tableName).select('status, company_id').eq('id', contract_id).single()

  if (fetchErr || !contract) {
    return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 전환 유효성 검사
  const currentStatus = contract.status || 'active'
  const allowed = VALID_TRANSITIONS[currentStatus] || []
  if (!allowed.includes(new_status)) {
    return NextResponse.json({
      error: `'${currentStatus}' → '${new_status}' 상태 전환이 허용되지 않습니다. 가능: ${allowed.join(', ') || '없음'}`,
    }, { status: 400 })
  }

  // 상태 업데이트
  const { error: updateErr } = await sb
    .from(tableName).update({ status: new_status }).eq('id', contract_id)

  if (updateErr) {
    return NextResponse.json({ error: '상태 업데이트 실패: ' + updateErr.message }, { status: 500 })
  }

  // 이력 기록
  const { error: historyErr } = await sb
    .from('contract_status_history')
    .insert({
      company_id: contract.company_id,
      contract_type,
      contract_id,
      old_status: currentStatus,
      new_status,
      change_reason: reason || `manual_${new_status}`,
      changed_by: admin.id,
    })

  if (historyErr) {
    console.error('이력 기록 실패:', historyErr.message)
  }

  return NextResponse.json({ success: true, old_status: currentStatus, new_status })
}

// GET: 상태 변경 이력
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const contractType = searchParams.get('contract_type')
  const contractId = searchParams.get('contract_id')

  if (!contractType || !contractId) {
    return NextResponse.json({ error: 'contract_type, contract_id 필수' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('contract_status_history')
    .select('*, changer:changed_by(employee_name)')
    .eq('contract_type', contractType)
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
