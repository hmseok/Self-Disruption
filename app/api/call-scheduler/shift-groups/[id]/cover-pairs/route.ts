// ═══════════════════════════════════════════════════════════════════
// N-57 — 그룹 커버 페어 API
//
// GET  /api/call-scheduler/shift-groups/[id]/cover-pairs
//   source_group_id = [id] 인 모든 cover_pairs 조회
//
// PUT  /api/call-scheduler/shift-groups/[id]/cover-pairs
//   body: { pairs: [{ cover_group_id, priority?, memo?, is_active? }, ...] }
//   동작: source=id 인 페어 전체를 받은 배열로 set (delete + insert)
//
// DELETE  /api/call-scheduler/shift-groups/[id]/cover-pairs/[pair_id]
//   (구현: 별도 [pair_id] route — 추후)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

async function tableExists(): Promise<boolean> {
  try {
    await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_group_cover_pairs LIMIT 1`
    return true
  } catch {
    return false
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    if (!(await tableExists())) {
      return NextResponse.json({ data: [], error: null, _migration_pending: true })
    }
    const rows = await prisma.$queryRaw<any[]>`
      SELECT p.id, p.source_group_id, p.cover_group_id, p.priority, p.is_active, p.memo,
             sg.name AS cover_group_name, sg.category AS cover_group_category
      FROM cs_group_cover_pairs p
      LEFT JOIN cs_shift_groups sg ON sg.id = p.cover_group_id
      WHERE p.source_group_id = ${id}
        AND p.is_active = 1
      ORDER BY p.priority ASC, sg.name ASC
    `
    const data = rows.map(r => ({
      ...r,
      priority: r.priority != null ? Number(r.priority) : 1,
      is_active: Boolean(r.is_active),
    }))
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    const body = await request.json()
    if (!(await tableExists())) {
      return NextResponse.json({ error: '마이그 미적용 — cs_group_cover_pairs 생성 필요' }, { status: 503 })
    }

    const pairs: any[] = Array.isArray(body?.pairs) ? body.pairs : []

    // 그룹 존재 확인
    const exists = await prisma.$queryRaw<any[]>`
      SELECT id FROM cs_shift_groups WHERE id = ${id} LIMIT 1
    `
    if (exists.length === 0) {
      return NextResponse.json({ error: 'source 그룹 없음' }, { status: 404 })
    }

    // 기존 페어 삭제 (source=id)
    await prisma.$executeRaw`DELETE FROM cs_group_cover_pairs WHERE source_group_id = ${id}`

    // 새 페어 INSERT
    for (const p of pairs) {
      const coverId = String(p?.cover_group_id || '').trim()
      if (!coverId || coverId === id) continue   // self-pair 금지
      const priority = Math.min(3, Math.max(1, Number(p?.priority) || 1))
      const memo = p?.memo ? String(p.memo).slice(0, 200) : null
      const isActive = p?.is_active === false ? 0 : 1
      const pairId = crypto.randomUUID()
      try {
        await prisma.$executeRaw`
          INSERT INTO cs_group_cover_pairs
            (id, source_group_id, cover_group_id, priority, is_active, memo, created_at, updated_at)
          VALUES
            (${pairId}, ${id}, ${coverId}, ${priority}, ${isActive}, ${memo}, NOW(), NOW())
        `
      } catch (e: any) {
        // 중복 unique key — graceful (이미 같은 source+cover 페어 INSERT)
      }
    }

    // 반환
    const out = await prisma.$queryRaw<any[]>`
      SELECT p.id, p.source_group_id, p.cover_group_id, p.priority, p.is_active, p.memo,
             sg.name AS cover_group_name, sg.category AS cover_group_category
      FROM cs_group_cover_pairs p
      LEFT JOIN cs_shift_groups sg ON sg.id = p.cover_group_id
      WHERE p.source_group_id = ${id}
      ORDER BY p.priority ASC, sg.name ASC
    `
    const data = out.map(r => ({
      ...r,
      priority: r.priority != null ? Number(r.priority) : 1,
      is_active: Boolean(r.is_active),
    }))
    return NextResponse.json({ data: serialize({ source_group_id: id, pairs: data }), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
