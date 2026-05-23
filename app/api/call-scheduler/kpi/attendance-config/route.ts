// ═══════════════════════════════════════════════════════════════════
// /api/call-scheduler/kpi/attendance-config — CX KPI 근태 판정 기준
//
//   GET  : { grace_minutes, _migration_pending }
//   POST : body { grace_minutes } → cs_kpi_attendance_config UPDATE (단일 행)
//
//   grace_minutes — 지각·조퇴 유예 분. 정시 ±grace 이내는 정상.
//   「KPI 설정」 탭에서 편집 → attendance API 가 읽음.
//   호환: MySQL 8.0 / $queryRaw tagged template / graceful try-catch
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// ───────────────────────────── GET ─────────────────────────────
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  let grace = 0
  let migrationPending = false
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT grace_minutes FROM cs_kpi_attendance_config LIMIT 1
    `
    if (rows.length > 0) grace = Number(rows[0].grace_minutes) || 0
    // 행이 없으면 기본 0 (시드 누락 — 저장 시 INSERT)
  } catch {
    // 테이블 미적용 — graceful (기본값 표시)
    migrationPending = true
  }

  return NextResponse.json({
    data: { grace_minutes: grace, _migration_pending: migrationPending },
    error: null,
  })
}

// ───────────────────────────── POST ────────────────────────────
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    let grace = Number(body?.grace_minutes)
    if (!Number.isFinite(grace) || grace < 0) grace = 0
    if (grace > 120) grace = 120
    grace = Math.round(grace)

    // 단일 행 upsert — 있으면 UPDATE, 없으면 INSERT
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id FROM cs_kpi_attendance_config LIMIT 1
    `
    if (rows.length > 0) {
      await prisma.$executeRaw`
        UPDATE cs_kpi_attendance_config
           SET grace_minutes = ${grace}
         WHERE id = ${String(rows[0].id)}
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO cs_kpi_attendance_config (id, grace_minutes)
        VALUES (UUID(), ${grace})
      `
    }

    return NextResponse.json({ data: { grace_minutes: grace }, error: null })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'DB error' },
      { status: 500 },
    )
  }
}
