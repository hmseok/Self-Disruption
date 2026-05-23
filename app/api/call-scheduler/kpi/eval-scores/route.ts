// ═══════════════════════════════════════════════════════════════════
// /api/call-scheduler/kpi/eval-scores — CX KPI 커스텀 평가 점수
//
//   GET  : ?granularity=day|week|month&date=YYYY-MM-DD
//          → { period_kind, period_label, items:[활성 항목], workers:[활성 워커],
//              scores:[{item_id, worker_id, score, note}] }
//   POST : body { granularity, date, scores:[{item_id, worker_id, score, note?}] }
//          → 해당 기간 점수 upsert (UNIQUE item+worker+period 덮어쓰기)
//
//   기간 키(period_kind/label)는 granularity+date 로 서버에서 산출 — lib/cs-kpi-period.
//   호환: MySQL 8.0 / $queryRaw tagged template / graceful try-catch
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { evalPeriodKey } from '@/lib/cs-kpi-period'

export const dynamic = 'force-dynamic'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

function readGranularity(url: URL): 'day' | 'week' | 'month' {
  const g = url.searchParams.get('granularity') || 'month'
  return (['day', 'week', 'month'].includes(g) ? g : 'month') as
    'day' | 'week' | 'month'
}

// ───────────────────────────── GET ─────────────────────────────
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const url = new URL(request.url)
  const granularity = readGranularity(url)
  const date = url.searchParams.get('date') || ''
  const { period_kind, period_label } = evalPeriodKey(granularity, date)

  let migrationPending = false

  // 활성 커스텀 항목
  let items: any[] = []
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, max_score, weight, sort_order
      FROM cs_kpi_eval_items
      WHERE is_active = 1
      ORDER BY sort_order ASC, name ASC
    `
    items = rows.map(r => ({
      id: String(r.id),
      name: String(r.name || ''),
      max_score: Number(r.max_score) || 100,
      weight: Number(r.weight) || 0,
      sort_order: Number(r.sort_order) || 0,
    }))
  } catch {
    migrationPending = true
  }

  // 활성 워커
  let workers: any[] = []
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name FROM cs_workers WHERE is_active = 1 ORDER BY name ASC
    `
    workers = rows.map(r => ({ id: String(r.id), name: String(r.name || '') }))
  } catch {
    workers = []
  }

  // 해당 기간 점수
  let scores: any[] = []
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT item_id, worker_id, score, note
      FROM cs_kpi_eval_scores
      WHERE period_kind = ${period_kind} AND period_label = ${period_label}
    `
    scores = rows.map(r => ({
      item_id: String(r.item_id),
      worker_id: String(r.worker_id),
      score: Number(r.score) || 0,
      note: r.note ? String(r.note) : '',
    }))
  } catch {
    migrationPending = true
  }

  return NextResponse.json({
    data: serialize({
      period_kind, period_label,
      items, workers, scores,
      _migration_pending: migrationPending,
    }),
    error: null,
  })
}

// ───────────────────────────── POST ────────────────────────────
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const granularity = (['day', 'week', 'month'].includes(body?.granularity)
      ? body.granularity : 'month') as 'day' | 'week' | 'month'
    const date = String(body?.date || '')
    const { period_kind, period_label } = evalPeriodKey(granularity, date)

    const input = Array.isArray(body?.scores) ? body.scores : []
    if (input.length === 0) {
      return NextResponse.json({ error: '저장할 점수가 없습니다.' }, { status: 400 })
    }

    let saved = 0
    const errors: string[] = []
    for (const s of input) {
      const itemId = String(s?.item_id || '').trim()
      const workerId = String(s?.worker_id || '').trim()
      if (!itemId || !workerId) continue
      let score = Number(s?.score)
      if (!Number.isFinite(score) || score < 0) score = 0
      if (score > 1_000_000) score = 1_000_000
      const note = String(s?.note || '').trim().slice(0, 200) || null
      try {
        // UNIQUE (item_id, worker_id, period_kind, period_label) → 덮어쓰기
        await prisma.$executeRaw`
          INSERT INTO cs_kpi_eval_scores
            (id, item_id, worker_id, period_kind, period_label, score, note)
          VALUES
            (UUID(), ${itemId}, ${workerId}, ${period_kind}, ${period_label},
             ${score}, ${note})
          ON DUPLICATE KEY UPDATE
            score = VALUES(score), note = VALUES(note)
        `
        saved++
      } catch (e: any) {
        errors.push(`${workerId}/${itemId}: ${e?.message || '저장 실패'}`)
      }
    }

    return NextResponse.json({
      data: { period_kind, period_label, saved, errors },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'DB error' }, { status: 500 },
    )
  }
}
