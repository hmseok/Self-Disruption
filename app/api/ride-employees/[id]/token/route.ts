// ═══════════════════════════════════════════════════════════════════
// POST   /api/ride-employees/[id]/token  — 토큰 발급/재발급
// DELETE /api/ride-employees/[id]/token  — 토큰 폐기 (revoke)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { sendKakaoOrSms, buildScheduleLinkMessage } from '@/lib/notification'
import crypto from 'crypto'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params

    // 존재 확인
    const exists = await prisma.$queryRaw<any[]>`
      SELECT id FROM ride_employees WHERE id = ${id} LIMIT 1
    `
    if (exists.length === 0) {
      return NextResponse.json({ error: '직원을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 새 토큰 생성 — 32자 hex
    const token = crypto.randomBytes(16).toString('hex')

    await prisma.$executeRaw`
      UPDATE ride_employees
      SET public_token = ${token},
          public_token_issued_at = NOW(),
          updated_at = NOW()
      WHERE id = ${id}
    `

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, phone, public_token, public_token_issued_at
      FROM ride_employees WHERE id = ${id} LIMIT 1
    `

    // N-53 — 토큰 발급 후 카카오 알림톡 / SMS 자동 발송
    //   환경변수 미설정 시 graceful — 토큰만 발급 + 응답에 notify_result 포함
    let notifyResult: any = null
    const employee = rows[0]
    if (employee?.phone && employee?.public_token) {
      const origin = request.headers.get('origin')
        || request.headers.get('referer')?.match(/^https?:\/\/[^/]+/)?.[0]
        || 'https://hmseok.com'
      const url = `${origin}/CallScheduler/e/${employee.public_token}`
      const message = buildScheduleLinkMessage({
        workerName: employee.name,
        url,
        companyName: '주식회사 에프엠아이',
      })
      try {
        notifyResult = await sendKakaoOrSms({
          toPhone: employee.phone,
          text: message,
          templateVars: {
            '#{이름}': employee.name,
            '#{링크}': url,
            '#{회사명}': '주식회사 에프엠아이',
          },
        })
      } catch (e: any) {
        notifyResult = { success: false, channel: 'skipped', error: e?.message || String(e) }
      }
    } else if (!employee?.phone) {
      notifyResult = { success: false, channel: 'skipped', reason: '전화번호 미등록' }
    }

    return NextResponse.json({
      data: { ...serialize(employee), notify_result: notifyResult },
      error: null,
    }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    await prisma.$executeRaw`
      UPDATE ride_employees
      SET public_token = NULL,
          public_token_issued_at = NULL,
          updated_at = NOW()
      WHERE id = ${id}
    `
    return NextResponse.json({ data: { id, revoked: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
