import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const supabase = getSupabaseAdmin()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  return profile ? { ...user, ...profile } : null
}

// GET: 내 프로필 정보 조회
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  // 법인카드 목록 조회
  const { data: cards } = await supabase
    .from('user_corporate_cards')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  return NextResponse.json({
    profile: {
      id: user.id,
      email: user.email,
      employee_name: user.employee_name,
      phone: user.phone,
      role: user.role,
    },
    cards: cards || [],
  })
}

// PATCH: 내 프로필 정보 수정
export async function PATCH(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const { employee_name, phone } = body

  const supabase = getSupabaseAdmin()
  const updateData: Record<string, any> = {}
  if (employee_name !== undefined) updateData.employee_name = employee_name
  if (phone !== undefined) updateData.phone = phone

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
