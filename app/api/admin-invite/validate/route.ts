import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 초대 코드 검증 API (공개 — 회원가입 시 사용)
// POST { code: "XXXX-XXXX" } → { valid: true/false }
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: NextRequest) {
  const { code } = await request.json()
  if (!code) return NextResponse.json({ valid: false, error: '코드를 입력하세요.' })

  const { data, error } = await supabaseAdmin
    .from('admin_invite_codes')
    .select('id, description, expires_at')
    .eq('code', code.trim().toUpperCase())
    .is('used_by', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ valid: false, error: '유효하지 않거나 만료된 초대 코드입니다.' })
  }

  return NextResponse.json({ valid: true, description: data.description })
}
