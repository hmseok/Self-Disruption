import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * /api/finance/auto-match-schedule/run
 *
 * cron 외부 트리거 endpoint (PR-UX4 — 2026-05-09).
 *
 * GCP Cloud Scheduler / Vercel Cron 가 매분 호출 →
 *   - enabled=1
 *   - 현재 시각이 schedule_hour:schedule_minute 와 일치 (분 단위 ±1)
 *   → run-workflow 자동 실행
 *
 * 인증: X-Cron-Secret 헤더 (env CRON_SECRET 와 일치)
 *
 * 호출 예:
 *   curl -X POST https://hmseok.com/api/finance/auto-match-schedule/run \
 *        -H "X-Cron-Secret: <SECRET>"
 *
 * 또는 사용자 즉시 실행 (Bearer 토큰):
 *   POST {force: true} → 시간 검사 skip + run-workflow 즉시 실행
 */
export const maxDuration = 600
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // 인증 — X-Cron-Secret 또는 Bearer (사용자 즉시 실행)
    const cronSecret = request.headers.get('x-cron-secret') || ''
    const expectedSecret = process.env.CRON_SECRET || ''
    const authHeader = request.headers.get('authorization') || ''

    const isCron = expectedSecret && cronSecret === expectedSecret
    const isUser = authHeader.startsWith('Bearer ')

    if (!isCron && !isUser) {
      return NextResponse.json({ error: 'unauthorized — X-Cron-Secret 또는 Authorization 필요' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const force = body.force === true && isUser  // 사용자만 force 가능

    // 스케줄 조회
    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM auto_match_schedule LIMIT 1`,
    ).catch(() => [])

    if (!rows || rows.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'no schedule configured' })
    }
    const sched = rows[0]

    if (!sched.enabled && !force) {
      return NextResponse.json({ skipped: true, reason: 'schedule disabled' })
    }

    // 시간 매칭 — KST 기준
    if (!force) {
      const now = new Date()
      const kstOffset = 9 * 60 // KST = UTC+9
      const kst = new Date(now.getTime() + kstOffset * 60_000)
      const curHour = kst.getUTCHours()
      const curMin = kst.getUTCMinutes()
      const targetHour = Number(sched.schedule_hour)
      const targetMin = Number(sched.schedule_minute)
      // ±1분 tolerance (cron jitter)
      const targetTotal = targetHour * 60 + targetMin
      const curTotal = curHour * 60 + curMin
      const diff = Math.abs(targetTotal - curTotal)
      if (diff > 1 && diff < 1438) { // 24시간 = 1440분, 양쪽 ±1
        return NextResponse.json({
          skipped: true,
          reason: `not time yet — current ${String(curHour).padStart(2, '0')}:${String(curMin).padStart(2, '0')} KST, target ${String(targetHour).padStart(2, '0')}:${String(targetMin).padStart(2, '0')}`,
        })
      }
    }

    // last_run_status='running' 마킹 (중복 실행 방지)
    await prisma.$executeRawUnsafe(
      `UPDATE auto_match_schedule SET last_run_status = 'running', last_run_at = NOW() WHERE id = ?`,
      sched.id,
    )

    // steps 파싱
    let steps: string[] = []
    try {
      steps = typeof sched.steps === 'string' ? JSON.parse(sched.steps) : (sched.steps || [])
    } catch { steps = [] }
    if (sched.auto_confirm) steps = [...steps, 'auto-confirm']

    // run-workflow 호출 (self HTTP)
    const proto = request.headers.get('x-forwarded-proto') || 'https'
    const host = request.headers.get('host') || request.headers.get('x-forwarded-host') || ''
    const baseUrl = `${proto}://${host}`

    let workflowResult: any = null
    let runStatus: 'success' | 'partial' | 'failed' = 'success'
    try {
      const res = await fetch(`${baseUrl}/api/finance/transactions/run-workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // cron 호출은 사용자 토큰 없음 — 내부 API 가 verifyUser 통과해야 하는데 없음
          // 임시: 사용자 호출 시 Authorization 그대로 forward / cron 시 service-account 토큰 필요
          ...(authHeader ? { Authorization: authHeader } : {}),
          ...(cronSecret ? { 'X-Cron-Secret': cronSecret } : {}),
        },
        body: JSON.stringify({ steps }),
      })
      workflowResult = await res.json().catch(() => ({}))
      if (!res.ok) {
        runStatus = 'failed'
      } else {
        const okCount = (workflowResult.steps || []).filter((s: any) => s.ok).length
        const total = (workflowResult.steps || []).length
        if (okCount === total) runStatus = 'success'
        else if (okCount > 0) runStatus = 'partial'
        else runStatus = 'failed'
      }
    } catch (e: any) {
      runStatus = 'failed'
      workflowResult = { error: e?.message || String(e) }
    }

    // 결과 기록
    await prisma.$executeRawUnsafe(
      `UPDATE auto_match_schedule
          SET last_run_status = ?, last_run_result = ?, updated_at = NOW()
        WHERE id = ?`,
      runStatus, JSON.stringify(workflowResult).slice(0, 8000), sched.id,
    )

    return NextResponse.json({
      ok: true,
      run_status: runStatus,
      result: workflowResult,
      forced: force,
    })
  } catch (e: any) {
    console.error('[auto-match-schedule/run POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
