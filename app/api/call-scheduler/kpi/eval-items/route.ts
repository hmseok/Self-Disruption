// ═══════════════════════════════════════════════════════════════════
// /api/call-scheduler/kpi/eval-items — CX KPI 커스텀 평가 항목 CRUD
//
//   GET    : { items:[...], _migration_pending }
//   POST   : body { id?, name, description?, max_score?, weight?,
//                    sort_order?, is_active? } → 생성(id 없음) 또는 수정
//   DELETE : ?id= → 항목 + 해당 항목 점수(cs_kpi_eval_scores) 삭제
//
//   매니저가 「KPI 설정」 탭에서 친절도·모니터링 점수 등 평가 항목을 직접 생성.
//   호환: MySQL 8.0 / $queryRaw tagged template / graceful try-catch
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// ───────────────────────────── GET ─────────────────────────────
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  let items: any[] = []
  let migrationPending = false
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, description, max_score, weight, sort_order, is_active
      FROM cs_kpi_eval_items
      ORDER BY sort_order ASC, name ASC
    `
    items = rows.map(r => ({
      id: String(r.id),
      name: String(r.name || ''),
      description: r.description ? String(r.description) : '',
      max_score: Number(r.max_score) || 100,
      weight: Number(r.weight) || 0,
      sort_order: Number(r.sort_order) || 0,
      is_active: Number(r.is_active) ? 1 : 0,
    }))
  } catch {
    // cs_kpi_eval_items 미적용 — graceful
    migrationPending = true
  }

  return NextResponse.json({
    data: serialize({ items, _migration_pending: migrationPending }),
    error: null,
  })
}

// ───────────────────────────── POST ────────────────────────────
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const name = String(body?.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: '항목명을 입력하세요.' }, { status: 400 })
    }
    if (name.length > 40) {
      return NextResponse.json({ error: '항목명은 40자 이내여야 합니다.' }, { status: 400 })
    }
    const description = String(body?.description || '').trim().slice(0, 200) || null
    let maxScore = Number(body?.max_score)
    if (!Number.isFinite(maxScore) || maxScore <= 0) maxScore = 100
    if (maxScore > 100000) maxScore = 100000
    maxScore = Math.round(maxScore)
    let weight = Number(body?.weight)
    if (!Number.isFinite(weight) || weight < 0) weight = 0
    if (weight > 1000) weight = 1000
    weight = Math.round(weight)
    let sortOrder = Number(body?.sort_order)
    if (!Number.isFinite(sortOrder)) sortOrder = 0
    sortOrder = Math.round(sortOrder)
    const isActive = Number(body?.is_active ?? 1) ? 1 : 0
    const id = body?.id ? String(body.id) : null

    if (id) {
      // 수정 — 이름 중복(다른 항목) 검증
      const dup = await prisma.$queryRaw<any[]>`
        SELECT id FROM cs_kpi_eval_items WHERE name = ${name} AND id <> ${id} LIMIT 1
      `
      if (dup.length > 0) {
        return NextResponse.json(
          { error: `「${name}」 항목명이 이미 있습니다.` }, { status: 400 },
        )
      }
      const affected = await prisma.$executeRaw`
        UPDATE cs_kpi_eval_items
           SET name = ${name}, description = ${description},
               max_score = ${maxScore}, weight = ${weight},
               sort_order = ${sortOrder}, is_active = ${isActive}
         WHERE id = ${id}
      `
      if (Number(affected) === 0) {
        return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 })
      }
      return NextResponse.json({ data: { id, updated: true }, error: null })
    }

    // 생성 — 이름 중복 검증
    const dup = await prisma.$queryRaw<any[]>`
      SELECT id FROM cs_kpi_eval_items WHERE name = ${name} LIMIT 1
    `
    if (dup.length > 0) {
      return NextResponse.json(
        { error: `「${name}」 항목명이 이미 있습니다.` }, { status: 400 },
      )
    }
    await prisma.$executeRaw`
      INSERT INTO cs_kpi_eval_items
        (id, name, description, max_score, weight, sort_order, is_active)
      VALUES
        (UUID(), ${name}, ${description}, ${maxScore}, ${weight},
         ${sortOrder}, ${isActive})
    `
    return NextResponse.json({ data: { created: true }, error: null })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'DB error' }, { status: 500 },
    )
  }
}

// ──────────────────────────── DELETE ───────────────────────────
export async function DELETE(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 })
    }
    // 점수 먼저 삭제 (FK 없음 — 수동 정리)
    await prisma.$executeRaw`DELETE FROM cs_kpi_eval_scores WHERE item_id = ${id}`
    const affected = await prisma.$executeRaw`
      DELETE FROM cs_kpi_eval_items WHERE id = ${id}
    `
    return NextResponse.json({
      data: { deleted: Number(affected) > 0 }, error: null,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'DB error' }, { status: 500 },
    )
  }
}
