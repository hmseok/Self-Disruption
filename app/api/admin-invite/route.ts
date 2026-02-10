import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// ============================================
// Super God Admin 초대 코드 API
// GET  → 초대 코드 목록 조회
// POST → 초대 코드 발급 + Resend 이메일 발송
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// 요청자의 role 확인 (JWT에서)
async function verifyPlatformAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'god_admin') return null
  return user
}

// GET: 초대 코드 목록
export async function GET(request: NextRequest) {
  const user = await verifyPlatformAdmin(request)
  if (!user) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('admin_invite_codes')
    .select(`
      id, code, description, created_at, expires_at, used_at,
      creator:created_by(employee_name),
      consumer:used_by(employee_name)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: 초대 코드 발급 + 이메일 발송
export async function POST(request: NextRequest) {
  const user = await verifyPlatformAdmin(request)
  if (!user) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const description = body.description || ''
  const recipientEmail = body.email || ''
  const validHours = body.validHours || 72

  // 8자리 코드 생성 (XXXX-XXXX)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-'
    code += chars[Math.floor(Math.random() * chars.length)]
  }

  const expiresAt = new Date(Date.now() + validHours * 60 * 60 * 1000).toISOString()

  // DB에 저장
  const { data, error } = await supabaseAdmin
    .from('admin_invite_codes')
    .insert({
      code,
      description: description || (recipientEmail ? `${recipientEmail} 초대` : ''),
      created_by: user.id,
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 이메일 발송 (이메일이 있는 경우)
  let emailSent = false
  let emailError = ''

  if (recipientEmail) {
    const apiKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@self-disruption.com'

    if (!apiKey) {
      emailError = 'RESEND_API_KEY가 설정되지 않았습니다.'
    } else {
      try {
        const resend = new Resend(apiKey)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        const expiresDate = new Date(expiresAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

        await resend.emails.send({
          from: `Self-Disruption <${fromEmail}>`,
          to: recipientEmail,
          subject: '[Self-Disruption] 플랫폼 관리자 초대 코드',
          html: `
            <div style="font-family: 'Apple SD Gothic Neo', -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 16px;">
              <h2 style="color: #0f172a; margin: 0 0 8px;">플랫폼 관리자 초대</h2>
              <p style="color: #64748b; font-size: 14px; margin: 0 0 24px;">Self-Disruption 플랫폼의 관리자로 초대되었습니다.</p>

              <div style="background: white; border: 2px solid #0ea5e9; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <p style="color: #64748b; font-size: 12px; margin: 0 0 8px;">초대 코드</p>
                <div style="font-size: 32px; font-weight: 900; color: #0369a1; letter-spacing: 0.2em; font-family: monospace;">${code}</div>
              </div>

              <div style="font-size: 13px; color: #64748b; margin-bottom: 24px;">
                <p style="margin: 4px 0;"><strong>만료:</strong> ${expiresDate}</p>
                ${description ? `<p style="margin: 4px 0;"><strong>메모:</strong> ${description}</p>` : ''}
              </div>

              <div style="background: #f0f9ff; border-radius: 8px; padding: 16px; font-size: 13px; color: #0c4a6e;">
                <strong>가입 방법:</strong><br/>
                1. <a href="${siteUrl}" style="color: #0284c7;">${siteUrl}</a> 접속<br/>
                2. 회원가입 → "관리자" 탭 선택<br/>
                3. 위 초대 코드 입력 후 가입
              </div>
            </div>
          `,
        })
        emailSent = true
      } catch (err: any) {
        emailError = err.message
      }
    }
  }

  return NextResponse.json({
    success: true,
    code,
    expires_at: expiresAt,
    id: data.id,
    emailSent,
    emailError: emailError || undefined,
  })
}
