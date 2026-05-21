// ═══════════════════════════════════════════════════════════════════
// /api/call-scheduler/kpi/wfm-config — WFM 필요인원 산정 기준 CRUD
//   KPI-DESIGN.md §3-4 / §6 — cs_wfm_config (단일 행, 팀 기준)
//
//   GET  : cs_wfm_config 1행 반환 (없으면 기본값)
//   POST : 목표 응대율·응대시간·부재율·인터벌·점유율 갱신
//          (1행 UPDATE, 행 없으면 INSERT)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

interface WfmConfig {
  target_service_level_pct: number
  target_answer_sec: number
  shrinkage_pct: number
  interval_minutes: number
  max_occupancy_pct: number
}
const DEFAULT_CONFIG: WfmConfig = {
  target_service_level_pct: 80,
  target_answer_sec: 20,
  shrinkage_pct: 30,
  interval_minutes: 60,
  max_occupancy_pct: 85,
}

// 정수 클램프 — min~max 범위로 보정 (NaN 시 fallback)
function clampInt(v: any, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

// ───────────────────────────── GET ─────────────────────────────
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, target_service_level_pct, target_answer_sec,
             shrinkage_pct, interval_minutes, max_occupancy_pct, updated_at
      FROM cs_wfm_config
      ORDER BY updated_at DESC
      LIMIT 1
    `
    if (rows.length === 0) {
      // 행 없음 — 기본값 반환 (UI 가 그대로 표시·편집 가능)
      return NextResponse.json({
        data: serialize({ id: null, ...DEFAULT_CONFIG, updated_at: null }),
        error: null,
      })
    }
    const r = rows[0]
    return NextResponse.json({
      data: serialize({
        id: r.id,
        target_service_level_pct: Number(r.target_service_level_pct ?? 80),
        target_answer_sec: Number(r.target_answer_sec ?? 20),
        shrinkage_pct: Number(r.shrinkage_pct ?? 30),
        interval_minutes: Number(r.interval_minutes ?? 60),
        max_occupancy_pct: Number(r.max_occupancy_pct ?? 85),
        updated_at: r.updated_at,
      }),
      error: null,
    })
  } catch (e: any) {
    // cs_wfm_config 미적재 — graceful 기본값
    return NextResponse.json({
      data: serialize({ id: null, ...DEFAULT_CONFIG, updated_at: null, _migration_pending: true }),
      error: null,
    })
  }
}

// ───────────────────────────── POST ────────────────────────────
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()

    // 입력 검증 + 클램프
    const slPct = clampInt(body?.target_service_level_pct, 1, 100, 80)
    const answerSec = clampInt(body?.target_answer_sec, 1, 600, 20)
    const shrinkPct = clampInt(body?.shrinkage_pct, 0, 90, 30)
    let intervalMin = clampInt(body?.interval_minutes, 30, 60, 60)
    // 인터벌은 30 / 60 만 허용
    if (![30, 60].includes(intervalMin)) intervalMin = 60
    const maxOccPct = clampInt(body?.max_occupancy_pct, 1, 100, 85)

    // 기존 1행 확인
    let existingId: string | null = null
    try {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT id FROM cs_wfm_config ORDER BY updated_at DESC LIMIT 1
      `
      if (rows.length > 0) existingId = String(rows[0].id)
    } catch { /* graceful — 미적재 시 INSERT 로 진행 */ }

    if (existingId) {
      // 1행 UPDATE
      await prisma.$executeRaw`
        UPDATE cs_wfm_config
        SET target_service_level_pct = ${slPct},
            target_answer_sec        = ${answerSec},
            shrinkage_pct            = ${shrinkPct},
            interval_minutes         = ${intervalMin},
            max_occupancy_pct        = ${maxOccPct},
            updated_at               = NOW()
        WHERE id = ${existingId}
      `
    } else {
      // 행 없음 — INSERT
      const id = crypto.randomUUID()
      await prisma.$executeRaw`
        INSERT INTO cs_wfm_config
          (id, target_service_level_pct, target_answer_sec,
           shrinkage_pct, interval_minutes, max_occupancy_pct, updated_at)
        VALUES
          (${id}, ${slPct}, ${answerSec},
           ${shrinkPct}, ${intervalMin}, ${maxOccPct}, NOW())
      `
      existingId = id
    }

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, target_service_level_pct, target_answer_sec,
             shrinkage_pct, interval_minutes, max_occupancy_pct, updated_at
      FROM cs_wfm_config WHERE id = ${existingId} LIMIT 1
    `
    const saved = rows[0]
      ? {
          id: rows[0].id,
          target_service_level_pct: Number(rows[0].target_service_level_pct),
          target_answer_sec: Number(rows[0].target_answer_sec),
          shrinkage_pct: Number(rows[0].shrinkage_pct),
          interval_minutes: Number(rows[0].interval_minutes),
          max_occupancy_pct: Number(rows[0].max_occupancy_pct),
          updated_at: rows[0].updated_at,
        }
      : { id: existingId, target_service_level_pct: slPct, target_answer_sec: answerSec,
          shrinkage_pct: shrinkPct, interval_minutes: intervalMin, max_occupancy_pct: maxOccPct,
          updated_at: null }

    return NextResponse.json({ data: serialize(saved), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
