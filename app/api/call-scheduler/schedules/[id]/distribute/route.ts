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
import { sendEmail } from '@/app/utils/messaging'

// PR-2RR-h (2026-05-28) — channel 다중화: sms / email / link
type DistributeChannel = 'sms' | 'email' | 'link'

function isValidEmail(s: string | null | undefined): boolean {
  if (!s) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim())
}

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
  email: string | null
  email_valid: boolean
  work_days: number
  first_day: string | null   // M/D
  token: string
  link: string
  message: string         // SMS 본문 (간단)
  email_subject: string   // 메일 제목
  email_html: string      // 메일 HTML 본문
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
    // PR-2RR-h — channel 다중화 (default 'sms' — 하위 호환)
    const channel = (['sms', 'email', 'link'].includes(body?.channel)
      ? body.channel : 'sms') as DistributeChannel
    // PR-2RR-h — worker_ids 옵션 (단일 발송 또는 부분 발송 지원)
    const workerIdsFilter: string[] | null = Array.isArray(body?.worker_ids) && body.worker_ids.length > 0
      ? body.worker_ids.map(String)
      : null

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
    // PR-2RR-h — email 컬럼 graceful (구 schema 도 호환)
    let hasEmailColumn = true
    try {
      await prisma.$queryRaw<any[]>`SELECT email FROM cs_workers LIMIT 1`
    } catch { hasEmailColumn = false }
    const rows = hasEmailColumn
      ? await prisma.$queryRaw<any[]>`
          SELECT
            w.id                                   AS worker_id,
            w.name                                 AS name,
            w.phone                                AS phone,
            w.email                                AS email,
            w.view_token                           AS view_token,
            COUNT(CASE WHEN a.special_code = 'none' THEN 1 END) AS work_days,
            DATE_FORMAT(MIN(a.work_date), '%c/%e')  AS first_day
          FROM cs_assignments a
          JOIN cs_workers w ON w.id = a.worker_id
          WHERE a.schedule_id = ${scheduleId}
            AND a.worker_id IS NOT NULL
          GROUP BY w.id, w.name, w.phone, w.email, w.view_token
          ORDER BY w.name ASC
        `
      : await prisma.$queryRaw<any[]>`
          SELECT
            w.id                                   AS worker_id,
            w.name                                 AS name,
            w.phone                                AS phone,
            NULL                                   AS email,
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

    // ── 수신자별 메시지 빌드 (SMS 본문 + 메일 본문) ──
    let recipients: Recipient[] = rows.map((r) => {
      const name = String(r.name || '')
      const token = String(r.view_token || '')
      const workDays = Number(r.work_days || 0)
      const firstDay = r.first_day ? String(r.first_day) : null
      const phone = normalizePhone(r.phone)
      const email = (r.email ? String(r.email).trim() : null) || null
      const link = token ? `${BASE_URL}/call-scheduler/${token}` : `${BASE_URL}`
      // SMS 본문 (간단 — 80자 SMS 한도 고려)
      const message =
        `[에프엠아이] ${month}월 근무표 안내\n` +
        `${name}님, ${month}월 근무표가 확정되었습니다.\n` +
        `· 배정 근무일: ${workDays}일\n` +
        (firstDay ? `· 첫 근무일: ${firstDay}\n` : '') +
        `본인 일정 확인: ${link}\n` +
        `문의는 담당 매니저에게 연락 바랍니다.`
      // 메일 제목 + HTML 본문 (Resend)
      const emailSubject = `[에프엠아이] ${year}년 ${month}월 근무표 안내 — ${name}님`
      const emailHtml = `
<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Segoe UI',Helvetica,sans-serif;line-height:1.55;color:#0f2440;max-width:560px;margin:0 auto;padding:24px;">
  <div style="background:#fff;border-radius:14px;border:1px solid rgba(0,0,0,0.08);padding:22px 26px;">
    <div style="font-size:13px;color:#6b7280;font-weight:600;">에프엠아이</div>
    <h2 style="margin:6px 0 14px;font-size:18px;color:#0f2440;">${year}년 ${month}월 근무표 안내</h2>
    <p style="font-size:14px;margin:0 0 12px;">
      <strong>${name}</strong>님, ${month}월 근무표가 확정되었습니다.
    </p>
    <ul style="font-size:13px;color:#374151;padding-left:18px;margin:0 0 16px;line-height:1.85;">
      <li>배정 근무일: <strong>${workDays}일</strong></li>
      ${firstDay ? `<li>첫 근무일: <strong>${firstDay}</strong></li>` : ''}
    </ul>
    <a href="${link}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px;font-size:13px;">
      본인 일정 확인하기
    </a>
    <div style="font-size:11px;color:#9ca3af;margin-top:18px;border-top:1px solid #e5e7eb;padding-top:12px;">
      문의: 담당 매니저 · 이 메일은 발신 전용입니다.
    </div>
  </div>
</body></html>`.trim()
      return {
        worker_id: String(r.worker_id),
        name,
        phone,
        phone_valid: isValidPhone(phone),
        email,
        email_valid: isValidEmail(email),
        work_days: workDays,
        first_day: firstDay,
        token,
        link,
        message,
        email_subject: emailSubject,
        email_html: emailHtml,
      }
    })

    // PR-2RR-h — worker_ids 필터 (단일 발송 / 부분 발송)
    if (workerIdsFilter) {
      const set = new Set(workerIdsFilter)
      recipients = recipients.filter(r => set.has(r.worker_id))
      if (recipients.length === 0) {
        return NextResponse.json({
          error: '지정된 worker_ids 중 이 근무표에 배정된 인원이 없습니다.',
        }, { status: 400 })
      }
    }

    // 채널별 sendable / invalid 분리
    const sendable = recipients.filter(r =>
      channel === 'sms'   ? r.phone_valid
    : channel === 'email' ? r.email_valid
    : true /* link */
    )
    const invalid = recipients.filter(r =>
      channel === 'sms'   ? !r.phone_valid
    : channel === 'email' ? !r.email_valid
    : false
    )

    // 채널별 configured 상태
    const channelConfigured = {
      sms:   aligoConfigured(),
      email: !!process.env.RESEND_API_KEY,
      link:  true,  // 클라이언트에서 클립보드 복사 — 서버 환경변수 무관
    }

    // ── preview — 발송 없이 목록만 ──
    if (mode === 'preview') {
      return NextResponse.json({
        data: serialize({
          mode, year, month, channel,
          channel_configured: channelConfigured,
          aligo_configured: channelConfigured.sms,  // 하위 호환
          total: recipients.length,
          sendable_count: sendable.length,
          invalid_count: invalid.length,
          recipients,
          max_recipients: ALIGO_MAX_RECIPIENTS,
        }),
        error: null,
      })
    }

    // ────────────────────────────────────────────────────────────
    // channel === 'link' — 발송 없음 (클라이언트 클립보드 복사용 데이터 반환)
    // ────────────────────────────────────────────────────────────
    if (channel === 'link') {
      // 이력만 기록 (선택)
      if (mode === 'send') {
        try {
          await prisma.$executeRaw`
            INSERT INTO cs_distributions
              (id, schedule_id, channel, recipient_count,
               recipients_snapshot, status, response_meta, sent_at, sent_by)
            VALUES
              (${randomUUID()}, ${scheduleId}, 'link', ${sendable.length},
               ${JSON.stringify(sendable.map(r => ({
                 worker_id: r.worker_id, name: r.name, link: r.link,
               })))},
               'sent',
               ${JSON.stringify({ note: '링크 복사 — 클라이언트 처리' })},
               NOW(), ${String(user.id)})
          `
        } catch { /* graceful */ }
      }
      return NextResponse.json({
        data: serialize({
          mode, year, month, channel,
          ok: true, testmode: false,
          result_code: 0, message: 'link copy data',
          success_cnt: sendable.length, error_cnt: 0,
          sent_count: sendable.length, invalid_count: 0,
          links: sendable.map(r => ({
            worker_id: r.worker_id, name: r.name, link: r.link,
          })),
        }),
        error: null,
      })
    }

    // ────────────────────────────────────────────────────────────
    // channel === 'sms' (algo) 또는 'email' (Resend)
    // ────────────────────────────────────────────────────────────
    if (channel === 'sms' && !channelConfigured.sms) {
      return NextResponse.json({
        error: '알리고 환경변수(ALIGO_API_KEY / ALIGO_USER_ID / ALIGO_SENDER)가 설정되지 않았습니다.',
      }, { status: 400 })
    }
    if (channel === 'email' && !channelConfigured.email) {
      return NextResponse.json({
        error: 'Resend 환경변수(RESEND_API_KEY)가 설정되지 않았습니다.',
      }, { status: 400 })
    }
    if (sendable.length === 0) {
      const need = channel === 'sms' ? '전화번호' : '이메일'
      return NextResponse.json({
        error: `발송 가능한 ${need}가 없습니다 — 직원 ${need}을 먼저 등록하세요.`,
      }, { status: 400 })
    }

    const testmode = mode === 'test'

    // SMS — 알리고 (기존 흐름)
    if (channel === 'sms') {
      let sendResult
      try {
        sendResult = await sendMass(
          sendable.map(r => ({ phone: r.phone, message: r.message })),
          { title: `${month}월 근무표 안내`, testmode },
        )
      } catch (e: any) {
        return NextResponse.json({ error: e?.message || '알리고 발송 실패' }, { status: 502 })
      }
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
        } catch { /* graceful */ }
      }
      return NextResponse.json({
        data: serialize({
          mode, year, month, channel,
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
    }

    // Email — Resend
    // testmode = true 면 첫 번째 수신자만 + dry-run 표시
    let successCnt = 0, errorCnt = 0
    const errors: string[] = []
    const targets = testmode ? sendable.slice(0, 1) : sendable
    for (const r of targets) {
      try {
        const res = await sendEmail({
          to: r.email!,
          subject: r.email_subject,
          html: r.email_html,
        })
        if (res.success) successCnt++
        else { errorCnt++; errors.push(`${r.name}: ${res.error || '실패'}`) }
      } catch (e: any) {
        errorCnt++
        errors.push(`${r.name}: ${e?.message || 'send error'}`)
      }
    }
    if (mode === 'send') {
      const status = errorCnt === 0 ? 'sent' : (successCnt > 0 ? 'partial' : 'failed')
      try {
        await prisma.$executeRaw`
          INSERT INTO cs_distributions
            (id, schedule_id, channel, recipient_count,
             recipients_snapshot, status, response_meta, sent_at, sent_by)
          VALUES
            (${randomUUID()}, ${scheduleId}, 'email', ${sendable.length},
             ${JSON.stringify(sendable.map(r => ({
               worker_id: r.worker_id, name: r.name, email: r.email,
             })))},
             ${status},
             ${JSON.stringify({ success_cnt: successCnt, error_cnt: errorCnt, errors: errors.slice(0, 5) })},
             NOW(), ${String(user.id)})
        `
      } catch { /* graceful */ }
    }
    return NextResponse.json({
      data: serialize({
        mode, year, month, channel,
        ok: errorCnt === 0,
        testmode,
        result_code: errorCnt === 0 ? 0 : 1,
        message: testmode ? '메일 테스트 발송 (1건)' : `메일 발송 ${successCnt}/${targets.length}`,
        success_cnt: successCnt,
        error_cnt: errorCnt,
        sent_count: testmode ? 1 : sendable.length,
        invalid_count: invalid.length,
        errors: errors.slice(0, 5),
      }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
