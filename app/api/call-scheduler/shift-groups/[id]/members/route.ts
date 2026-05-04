// ═══════════════════════════════════════════════════════════════════
// PUT /api/call-scheduler/shift-groups/[id]/members
//   body: { worker_ids: [uuid, ...] (priority 순서)
//   동작: 그룹의 멤버 전체를 받은 배열로 set (delete + insert)
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

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    const body = await request.json()
    const workerIds: string[] = Array.isArray(body?.worker_ids) ? body.worker_ids : []

    // 그룹 존재 확인
    const exists = await prisma.$queryRaw<any[]>`
      SELECT id FROM cs_shift_groups WHERE id = ${id} LIMIT 1
    `
    if (exists.length === 0) {
      return NextResponse.json({ error: '그룹을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 기존 멤버 모두 삭제
    await prisma.$executeRaw`DELETE FROM cs_group_members WHERE group_id = ${id}`

    // 새 멤버 INSERT (priority = 배열 인덱스)
    for (let i = 0; i < workerIds.length; i++) {
      const wId = workerIds[i]
      await prisma.$executeRaw`
        INSERT INTO cs_group_members (id, group_id, worker_id, priority, created_at)
        VALUES (${crypto.randomUUID()}, ${id}, ${wId}, ${i}, NOW())
      `
    }

    // 새 멤버 목록 반환
    const members = await prisma.$queryRaw<any[]>`
      SELECT m.id, m.worker_id, m.priority,
             w.name AS worker_name, w.color_tone AS worker_tone, w.group_label
      FROM cs_group_members m
      JOIN cs_workers w ON w.id = m.worker_id
      WHERE m.group_id = ${id}
      ORDER BY m.priority ASC
    `
    return NextResponse.json({
      data: serialize({ group_id: id, members }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
