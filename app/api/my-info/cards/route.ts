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
    .from('profiles').select('role, company_id, employee_name').eq('id', user.id).single()
  return profile ? { ...user, role: profile.role, company_id: profile.company_id, employee_name: profile.employee_name } : null
}

// god_admin의 경우 company_id 오버라이드 가능
function getEffectiveCompanyId(user: any, requestCompanyId?: string | null): string {
  if (user.role === 'god_admin' && requestCompanyId) {
    return requestCompanyId
  }
  return user.company_id
}

// GET: 내 법인카드 목록
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  // 법인카드는 사용자 소속 — company_id와 무관하게 모든 내 카드 조회
  const { data, error } = await supabase
    .from('user_corporate_cards')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }

  return NextResponse.json({ data: data || [] })
}

// POST: 법인카드 등록
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const { card_name, card_number, card_company, is_default, company_id: bodyCompanyId } = body

  const companyId = getEffectiveCompanyId(user, bodyCompanyId)

  if (!card_number) {
    return NextResponse.json({ error: '카드번호는 필수입니다.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 기본 카드로 설정 시 기존 기본 카드 해제
  if (is_default) {
    await supabase
      .from('user_corporate_cards')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('is_default', true)
  }

  // 카드번호에서 뒤 4자리 추출
  const last4 = card_number.replace(/[^0-9]/g, '').slice(-4)

  const { data, error } = await supabase
    .from('user_corporate_cards')
    .insert({
      user_id: user.id,
      company_id: companyId,
      card_name: card_name || `법인카드 ${last4}`,
      card_number: card_number.trim(),
      card_last4: last4,
      card_company: card_company || '',
      is_default: is_default || false,
    })
    .select()
    .single()

  if (error) {
    console.error('카드 등록 실패:', error)
    return NextResponse.json({ error: '등록 실패', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

// DELETE: 법인카드 삭제
export async function DELETE(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID 필요' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('user_corporate_cards')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// PATCH: 법인카드 수정 (기본카드 설정 등)
export async function PATCH(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const { id, card_name, card_company, is_default } = body

  if (!id) return NextResponse.json({ error: 'ID 필요' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  // 기본 카드로 설정 시 기존 기본 카드 해제
  if (is_default) {
    await supabase
      .from('user_corporate_cards')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('is_default', true)
  }

  const updateData: Record<string, any> = {}
  if (card_name !== undefined) updateData.card_name = card_name
  if (card_company !== undefined) updateData.card_company = card_company
  if (is_default !== undefined) updateData.is_default = is_default

  const { data, error } = await supabase
    .from('user_corporate_cards')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
