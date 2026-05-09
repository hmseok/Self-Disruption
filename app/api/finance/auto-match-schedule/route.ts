import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * /api/finance/auto-match-schedule
 *
 * 자동 매칭 스케줄 설정 (PR-UX4 — 2026-05-09).
 *
 * GET — 현재 설정 + 마지막 실행 결과 조회
 * POST body: { enabled, schedule_hour, schedule_minute, steps[], auto_confirm }
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    let rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM auto_match_schedule LIMIT 1`,
    ).catch(() => [])

    // 테이블 없으면 (마이그레이션 미적용) — 빈 row 반환
    if (!rows || rows.length === 0) {
      return NextResponse.json({
        id: null,
        enabled: false,
        schedule_hour: 3,
        schedule_minute: 0,
        steps: ['classify-rule', 'classify-ai', 'match-fmi-rental', 'match-investor-jiip', 'match-employee', 'match-freelancer'],
        auto_confirm: false,
        last_run_at: null,
        last_run_status: null,
        last_run_result: null,
        next_run_at: null,
        _migration_pending: true,
      })
    }

    const r = rows[0]
    let steps: string[] = []
    try {
      steps = typeof r.steps === 'string' ? JSON.parse(r.steps) : (r.steps || [])
    } catch { steps = [] }
    let lastResult: any = null
    try {
      lastResult = typeof r.last_run_result === 'string' ? JSON.parse(r.last_run_result) : r.last_run_result
    } catch { lastResult = null }

    return NextResponse.json({
      id: r.id,
      enabled: !!r.enabled,
      schedule_hour: Number(r.schedule_hour),
      schedule_minute: Number(r.schedule_minute),
      steps,
      auto_confirm: !!r.auto_confirm,
      last_run_at: r.last_run_at,
      last_run_status: r.last_run_status,
      last_run_result: lastResult,
      next_run_at: r.next_run_at,
    })
  } catch (e: any) {
    console.error('[auto-match-schedule GET]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const enabled = body.enabled === true ? 1 : 0
    const hour = Math.max(0, Math.min(23, Number(body.schedule_hour) || 3))
    const minute = Math.max(0, Math.min(59, Number(body.schedule_minute) || 0))
    const stepsRaw = Array.isArray(body.steps) ? body.steps : []
    // 화이트리스트 필터
    const VALID_STEPS = ['classify-rule', 'classify-ai', 'match-fmi-rental', 'match-investor-jiip', 'match-employee', 'match-freelancer', 'auto-confirm']
    const steps = stepsRaw.filter((s: any) => typeof s === 'string' && VALID_STEPS.includes(s))
    const autoConfirm = body.auto_confirm === true ? 1 : 0

    // 다음 실행 시각 계산 (KST 기준)
    const now = new Date()
    const nextRun = new Date(now)
    nextRun.setHours(hour, minute, 0, 0)
    if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1)
    const nextRunStr = nextRun.toISOString().slice(0, 19).replace('T', ' ')

    // 기존 row 있으면 UPDATE, 없으면 INSERT (single-row)
    const existing = await prisma.$queryRawUnsafe<Array<any>>(`SELECT id FROM auto_match_schedule LIMIT 1`)
    if (existing && existing.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE auto_match_schedule
            SET enabled = ?, schedule_hour = ?, schedule_minute = ?,
                steps = ?, auto_confirm = ?, next_run_at = ?,
                updated_at = NOW()
          WHERE id = ?`,
        enabled, hour, minute, JSON.stringify(steps), autoConfirm, nextRunStr, existing[0].id,
      )
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO auto_match_schedule
           (id, enabled, schedule_hour, schedule_minute, steps, auto_confirm, next_run_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        randomUUID(), enabled, hour, minute, JSON.stringify(steps), autoConfirm, nextRunStr,
      )
    }

    return NextResponse.json({
      ok: true,
      enabled: !!enabled,
      schedule_hour: hour,
      schedule_minute: minute,
      steps,
      auto_confirm: !!autoConfirm,
      next_run_at: nextRunStr,
      message: enabled
        ? `✅ 자동 스케줄 활성화 — 매일 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} 실행`
        : '⏸ 자동 스케줄 비활성화',
    })
  } catch (e: any) {
    console.error('[auto-match-schedule POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
