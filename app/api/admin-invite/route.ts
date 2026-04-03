import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

// ============================================
// Platform Admin 초대 코드 API (Prisma 버전)
// GET    → 초대 코드 목록 조회
// POST   → 초대 코드 발급 + Resend 이메일 발송
// PATCH  → 초대 코드 즉시 만료 처리
// DELETE → 초대 코드 삭제
// ============================================

// 요청자의 role 확인 (JWT에서)
async function verifyPlatformAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.replace('Bearer ', '')

  // TODO: Phase 5 - Replace with Firebase Auth
  // For now, extract userId from JWT payload (base64 decode)
  let userId: string | null = null
  try {
    const parts = token.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
      userId = payload.sub || payload.user_id
    }
  } catch {}

  if (!userId) return null

  const profiles = await prisma.$queryRaw<any[]>`
    SELECT role FROM profiles WHERE id = ${userId} LIMIT 1
  `

  if (profiles.length === 0 || profiles[0].role !== 'admin') return null
  return { id: userId }
}

// GET: 초대 코드 목록
export async function GET(request: NextRequest) {
  const user = await verifyPlatformAdmin(request)
  if (!user) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const codes = await prisma.$queryRaw<any[]>`
    SELECT
      aic.id, aic.code, aic.description, aic.created_at, aic.expires_at, aic.used_at,
      aic.created_by, aic.used_by,
      pc.employee_name as creator_name,
      pu.employee_name as consumer_name
    FROM admin_invite_codes aic
    LEFT JOIN profiles pc ON aic.created_by = pc.id
    LEFT JOIN profiles pu ON aic.used_by = pu.id
    ORDER BY aic.created_at DESC
  `

  const data = codes.map(c => ({
    id: c.id,
    code: c.code,
    description: c.description,
    created_at: c.created_at,
    expires_at: c.expires_at,
    used_at: c.used_at,
    creator: c.creator_name ? { employee_name: c.creator_name } : null,
    consumer: c.consumer_name ? { employee_name: c.consumer_name } : null,
  }))

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
  await prisma.$executeRaw`
    INSERT INTO admin_invite_codes
    (code, description, created_by, expires_at, created_at)
    VALUES (
      ${code},
      ${description || (recipientEmail ? `${recipientEmail} 초대` : '')},
      ${user.id},
      ${expiresAt},
      NOW()
    )
  `

  // Get the inserted ID
  const inserted = await prisma.$queryRaw<any[]>`
    SELECT id FROM admin_invite_codes WHERE code = ${code} LIMIT 1
  `
  const codeId = inserted.length > 0 ? inserted[0].id : null

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
    id: codeId,
    emailSent,
    emailError: emailError || undefined,
  })
}

// PATCH: 초대 코드 즉시 만료 처리
export async function PATCH(request: NextRequest) {
  const user = await verifyPlatformAdmin(request)
  if (!user) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const codeId = body.id

  if (!codeId) return NextResponse.json({ error: '코드 ID가 필요합니다.' }, { status: 400 })

  const now = new Date().toISOString()
  await prisma.$executeRaw`
    UPDATE admin_invite_codes SET expires_at = ${now} WHERE id = ${codeId}
  `

  const updated = await prisma.$queryRaw<any[]>`
    SELECT * FROM admin_invite_codes WHERE id = ${codeId} LIMIT 1
  `

  const data = updated.length > 0 ? updated[0] : null
  return NextResponse.json({ success: true, data })
}

// DELETE: 초대 코드 삭제
export async function DELETE(request: NextRequest) {
  const user = await verifyPlatformAdmin(request)
  if (!user) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const codeId = searchParams.get('id')

  if (!codeId) return NextResponse.json({ error: '코드 ID가 필요합니다.' }, { status: 400 })

  await prisma.$executeRaw`
    DELETE FROM admin_invite_codes WHERE id = ${codeId}
  `

  return NextResponse.json({ success: true })
}
