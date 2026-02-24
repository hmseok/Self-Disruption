import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 급여 설정 CRUD API
// GET  → 직원별 급여 설정 목록
// POST → 급여 설정 생성/수정 (upsert)
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

// GET: 급여 설정 목록
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company_id') || admin.company_id

  if (admin.role === 'master' && companyId !== admin.company_id) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const sb = getSupabaseAdmin()

  // 급여 설정 + 직원 프로필 조인
  const { data, error } = await sb
    .from('employee_salaries')
    .select(`
      *,
      employee:employee_id(id, employee_name, email, phone,
        position:position_id(name),
        department:department_id(name)
      )
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST: 급여 설정 생성/수정 (upsert)
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const {
    company_id,
    employee_id,
    base_salary,
    allowances = {},
    deduction_overrides = {},
    payment_day = 25,
    tax_type = '근로소득',
    bank_name,
    account_number,
    account_holder,
    is_active = true,
  } = body

  if (!company_id || !employee_id) {
    return NextResponse.json({ error: '회사 ID와 직원 ID가 필요합니다.' }, { status: 400 })
  }
  if (admin.role === 'master' && company_id !== admin.company_id) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const sb = getSupabaseAdmin()

  const { data, error } = await sb
    .from('employee_salaries')
    .upsert({
      company_id,
      employee_id,
      base_salary: base_salary || 0,
      allowances,
      deduction_overrides,
      payment_day,
      tax_type,
      bank_name: bank_name || null,
      account_number: account_number || null,
      account_holder: account_holder || null,
      is_active,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'company_id,employee_id',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
