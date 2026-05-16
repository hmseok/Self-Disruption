// ═══════════════════════════════════════════════════════════════════
// POST /api/call-scheduler/cron/auto-generate-monthly
//
//   N-21-c — Cron 자동 다음 달 스케줄 생성 (Cloud Scheduler 트리거)
//
//   동작:
//   · 다음 달 (현재 시점 기준 N+1 월) cs_schedules 가 없으면 status='draft' 로 생성
//   · 이미 있으면 skip
//   · 자동 생성 알고리즘 (auto-generate) 호출 X — draft 만 만들고 매니저가 검토 후 publish
//     (자동 생성은 사용자가 직접 트리거 — 운영 안전성)
//
//   인증:
//   · CRON_SECRET 환경변수와 일치하는 ?secret= 쿼리 또는 Authorization 헤더
//   · 또는 GCP Cloud Scheduler 의 OIDC 토큰 (X-CloudScheduler-Jobname 헤더 확인)
//
//   호출 예시 (Cloud Scheduler):
//     POST https://hmseok.com/api/call-scheduler/cron/auto-generate-monthly?secret=XXX
//     Cron: 0 6 1 * *   (매월 1일 새벽 6시)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    // ── 인증 ──
    const secret = process.env.CRON_SECRET
    if (!secret) {
      return NextResponse.json({
        error: 'CRON_SECRET 환경변수 미설정 — Cloud Run 변수 추가 필요',
      }, { status: 500 })
    }
    const url = new URL(request.url)
    const querySecret = url.searchParams.get('secret')
    const authHeader = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const cloudSchedulerJob = request.headers.get('x-cloudscheduler-jobname')
    const providedSecret = querySecret || authHeader
    if (!cloudSchedulerJob && providedSecret !== secret) {
      return NextResponse.json({ error: '인증 실패' }, { status: 401 })
    }

    // ── 다음 달 계산 (KST 기준 가정 — 서버 timezone 무관) ──
    const targetParam = url.searchParams.get('target')  // 옵션: 'YYYY-MM' 수동 지정
    let year: number, month: number
    if (targetParam && /^\d{4}-\d{2}$/.test(targetParam)) {
      year = Number(targetParam.slice(0, 4))
      month = Number(targetParam.slice(5, 7))
    } else {
      const now = new Date()
      // 다음 달
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      year = nextMonth.getFullYear()
      month = nextMonth.getMonth() + 1
    }
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: '연도/월 계산 오류' }, { status: 400 })
    }

    // ── 중복 체크 ──
    const exists = await prisma.$queryRaw<any[]>`
      SELECT id, status FROM cs_schedules
      WHERE year = ${year} AND month = ${month} LIMIT 1
    `
    if (exists.length > 0) {
      return NextResponse.json({
        data: {
          year, month,
          action: 'skip-already-exists',
          schedule_id: String(exists[0].id),
          status: String(exists[0].status),
        },
        error: null,
      })
    }

    // ── 생성 ──
    const id = crypto.randomUUID()
    const title = `${year}년 ${month}월 근무표 (자동 생성)`
    const note = `Cron 자동 생성 — ${new Date().toISOString()}`
    await prisma.$executeRaw`
      INSERT INTO cs_schedules
        (id, year, month, title, status, source, note, created_at, updated_at)
      VALUES
        (${id}, ${year}, ${month}, ${title}, 'draft', 'cron', ${note}, NOW(), NOW())
    `

    return NextResponse.json({
      data: {
        year, month,
        action: 'created',
        schedule_id: id,
        status: 'draft',
        note: '매니저가 검토 후 자동 생성 (auto-generate) 실행 및 publish 필요',
      },
      error: null,
    }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

// GET — 상태 확인용 (사용자가 브라우저에서 직접 호출 가능, 인증 동일)
export async function GET(request: NextRequest) {
  return POST(request)
}
