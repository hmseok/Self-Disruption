// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/shift-groups/[id]/min-coverage
//   해당 그룹의 (dow + min_workers) 행 모두 반환
// PUT /api/call-scheduler/shift-groups/[id]/min-coverage
//   body: { coverage: [{dow: null|0~6, min_workers: int}] }
//   → 일괄 upsert + 미언급 dow 삭제 (그룹 전체 재정의)
//
// PR-2QQ-d-2 — graceful: 마이그 미적용 시 빈 배열 / 무시
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
    await prisma.$queryRaw<any[]>`SELECT id FROM cs_group_min_coverage LIMIT 1`
    return true
  } catch { return false }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id: groupId } = await context.params
    if (!await tableExists()) {
      return NextResponse.json({ data: [], error: null, _migration_pending: true })
    }
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, group_id, dow, min_workers
      FROM cs_group_min_coverage
      WHERE group_id = ${groupId}
      ORDER BY dow IS NULL DESC, dow ASC
    `
    const data = rows.map(r => ({
      ...r,
      dow: r.dow == null ? null : Number(r.dow),
      min_workers: Number(r.min_workers),
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
    const { id: groupId } = await context.params
    if (!await tableExists()) {
      return NextResponse.json({
        error: '마이그레이션이 적용되지 않았습니다 (cs_group_min_coverage)',
      }, { status: 400 })
    }

    const body = await request.json()
    const coverage: Array<{ dow: number | null; min_workers: number }>
      = Array.isArray(body?.coverage) ? body.coverage : []

    // 검증 + 정규화 + dedup
    const seen = new Set<string>()
    const normalized: Array<{ dow: number | null; min_workers: number }> = []
    for (const row of coverage) {
      const dow = row.dow == null ? null
        : Math.max(0, Math.min(6, Math.floor(Number(row.dow))))
      const min = Math.max(0, Math.min(99, Math.floor(Number(row.min_workers) || 0)))
      if (min === 0) continue  // 0 인 행은 저장 안 함 (의미 없음)
      const key = dow == null ? 'null' : String(dow)
      if (seen.has(key)) continue
      seen.add(key)
      normalized.push({ dow, min_workers: min })
    }

    // 기존 모두 삭제 후 새로 삽입 (그룹 전체 재정의 패턴)
    await prisma.$executeRaw`DELETE FROM cs_group_min_coverage WHERE group_id = ${groupId}`
    for (const row of normalized) {
      await prisma.$executeRaw`
        INSERT INTO cs_group_min_coverage (id, group_id, dow, min_workers, created_at, updated_at)
        VALUES (${crypto.randomUUID()}, ${groupId}, ${row.dow}, ${row.min_workers}, NOW(), NOW())
      `
    }

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, group_id, dow, min_workers
      FROM cs_group_min_coverage
      WHERE group_id = ${groupId}
      ORDER BY dow IS NULL DESC, dow ASC
    `
    const data = rows.map(r => ({
      ...r,
      dow: r.dow == null ? null : Number(r.dow),
      min_workers: Number(r.min_workers),
    }))
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
