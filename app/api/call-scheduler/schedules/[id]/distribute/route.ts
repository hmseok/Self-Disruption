// ═══════════════════════════════════════════════════════════════════
// POST /api/call-scheduler/schedules/[id]/distribute — 근무표 SMS 배포
//
// 한 달 근무표(cs_schedules)를 배정된 직원에게 알리고 SMS 로 발송.
// 직원별 메시지 = 요약(근무일수·첫근무일) + 본인 일정 공개 링크.
//
// body { mode: 'preview' | 'test' | 'send' }
//   · preview — 발송 안 함, 수신자·메시지 목록만 반환 (매니저 확인용)
//   · test    — 알리고 testmode_yn=Y (검증만, 실발송·과금 없음 — dry-run)
//   · send    — 실제 발송 + cs_distributions 이력 기록
//
// 안전장치 (규칙 3): test 우선 권장, send 는 명시 mode, 수신자 한도,
//   잘못된/없는 전화번호 제외·보고, 전 단계 graceful try/catch.
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import {
  sendMass, aligoConfigured, isValidPhone, normalizePhone,
  ALIGO_MAX_RECIPIENTS,
} from '@/lib/aligo'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://hmseok.com'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

interface Recipient {
  worker_id: string
  name: string
  phone: string
  phone_valid: boolean
  work_days: number
  first_day: string | null   // M/D
  token: string
  message: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const { id: scheduleId } = await params
    const body = await request.json().catch(() => ({}))
    const mode = ['preview', 'test', 'send'].includes(body?.mode)
      ? body.mode as 'preview' | 'test' | 'send'
      : 'preview'

    // ── 스케줄 조회 ──
    const schedRows = await prisma.$queryRaw<any[]>`
      SELECT id, year, month, status FROM cs_schedules WHERE id = ${scheduleId} LIMIT 1
    `
    if (schedRows.length === 0) {
      return NextResponse.json({ error: '근무표를 찾을 수 없습니다.' }, { status: 404 })
    }
    const sched = schedRows[0]
    const year = Number(sched.year)
    const month = Number(sched.month)

    // ── 배정된 워커 + 근무 요약 ──
    // 근무일수 = special_code='none' 셀 수, 첫 근무일 = MIN(work_date)
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        w.id                                   AS worker_id,
        w.name                                 AS name,
        w.phone                                AS phone,
        w.view_token                           AS view_token,
        COUNT(CASE WHEN a.special_code = 'none' THEN 1 END) AS work_days,
        DATE_FORMAT(MIN(a.work_date), '%c/%e')  AS first_day
      FROM cs_assignments a
      JOIN cs_workers w ON w.id = a.worker_id
      WHERE a.schedule_id = ${scheduleId}
        AND a.worker_id IS NOT NULL
      GROUP BY w.id, w.name, w.phone, w.view_token
      ORDER BY w.name ASC
    `
    if (rows.length === 0) {
      return NextResponse.json(
        { error: '이 근무표에 배정된 직원이 없습니다.' }, { status: 400 },
      )
    }

    // ── view_token 없는 워커 토큰 생성 (멱등) ──
    for (const r of rows) {
      if (!r.view_token || String(r.view_token).trim() === '') {
        const tok = randomUUID().replace(/-/g, '')
        try {
          await prisma.$executeRaw`
            UPDATE cs_workers SET view_token = ${tok}, updated_at = NOW()
            WHERE id = ${String(r.worker_id)}
          `
          r.view_token = tok
        } catch { /* graceful — 토큰 생성 실패 시 링크 빈값 */ }
      }
    }

    // ── 수신자별 메시지 빌드 ──
    const recipients: Recipient[] = rows.map((r) => {
      const name = String(r.name || '')
      const token = String(r.view_token || '')
      const workDays = Number(r.work_days || 0)
      const firstDay = r.first_day ? String(r.first_day) : null
      const phone = normalizePhone(r.phone)
      const link = token ? `${BASE_URL}/call-scheduler/${token}` : `${BASE_URL}`
      const message =
        `[에프엠아이] ${month}월 근무표 안내\n` +
        `${name}님, ${month}월 근무표가 확정되었습니다.\n` +
        `· 배정 근무일: ${workDays}일\n` +
        (firstDay ? `· 첫 근무일: ${firstDay}\n` : '') +
        `본인 일정 확인: ${link}\n` +
        `문의는 담당 매니저에게 연락 바랍니다.`
      return {
        worker_id: String(r.worker_id),
        name,
        phone,
        phone_valid: isValidPhone(phone),
        work_days: workDays,
        first_day: firstDay,
        token,
        message,
      }
    })

    const sendable = recipients.filter(r => r.phone_valid)
    const invalid = recipients.filter(r => !r.phone_valid)

    // ── preview — 발송 없이 목록만 ──
    if (mode === 'preview') {
      return NextResponse.json({
        data: serialize({
          mode, year, month,
          aligo_configured: aligoConfigured(),
          total: recipients.length,
          sendable_count: sendable.length,
          invalid_count: invalid.length,
          recipients,
          max_recipients: ALIGO_MAX_RECIPIENTS,
        }),
        error: null,
      })
    }

    // ── test / send — 알리고 발송 ──
    if (!aligoConfigured()) {
      return NextResponse.json({
        error: '알리고 환경변수(ALIGO_API_KEY / ALIGO_USER_ID / ALIGO_SENDER)가 설정되지 않았습니다.',
      }, { status: 400 })
    }
    if (sendable.length === 0) {
      return NextResponse.json({
        error: '발송 가능한 전화번호가 없습니다 — 직원 전화번호를 먼저 등록하세요.',
      }, { status: 400 })
    }

    const testmode = mode === 'test'
    let sendResult
    try {
      sendResult = await sendMass(
        sendable.map(r => ({ phone: r.phone, message: r.message })),
        { title: `${month}월 근무표 안내`, testmode },
      )
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || '알리고 발송 실패' }, { status: 502 })
    }

    // ── 실제 발송(send) — cs_distributions 이력 기록 ──
    if (mode === 'send') {
      const status = sendResult.ok
        ? (sendResult.error_cnt > 0 ? 'partial' : 'sent')
        : 'failed'
      try {
        await prisma.$executeRaw`
          INSERT INTO cs_distributions
            (id, schedule_id, channel, recipient_count,
             recipients_snapshot, status, response_meta, sent_at, sent_by)
          VALUES
            (${randomUUID()}, ${scheduleId}, 'sms', ${sendable.length},
             ${JSON.stringify(sendable.map(r => ({
               worker_id: r.worker_id, name: r.name, phone: r.phone,
             })))},
             ${status},
             ${JSON.stringify({
               result_code: sendResult.result_code,
               message: sendResult.message,
               success_cnt: sendResult.success_cnt,
               error_cnt: sendResult.error_cnt,
             })},
             NOW(), ${String(user.id)})
        `
      } catch { /* graceful — 이력 기록 실패해도 발송 결과는 반환 */ }
    }

    return NextResponse.json({
      data: serialize({
        mode, year, month,
        ok: sendResult.ok,
        testmode: sendResult.testmode,
        result_code: sendResult.result_code,
        message: sendResult.message,
        success_cnt: sendResult.success_cnt,
        error_cnt: sendResult.error_cnt,
        sent_count: sendable.length,
        invalid_count: invalid.length,
      }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
