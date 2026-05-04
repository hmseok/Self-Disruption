// ═══════════════════════════════════════════════════════════════════
// POST /api/call-scheduler/distributions — 배포(공지) 기록 생성
//   body: { schedule_id, channel, recipient_ids[], message? }
//   동작: 수신자 스냅샷 + recipient_count 저장. 실제 외부 전송은 Phase 2.
// GET  /api/call-scheduler/distributions?schedule_id=... — 이력 조회
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

const CHANNELS = ['jandi', 'email', 'link', 'manual'] as const
type Channel = typeof CHANNELS[number]

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const body = await request.json()
    const schedule_id: string = String(body?.schedule_id || '')
    const channel: Channel = CHANNELS.includes(body?.channel) ? body.channel : 'manual'
    const recipientIds: string[] = Array.isArray(body?.recipient_ids) ? body.recipient_ids : []
    const message: string | null = typeof body?.message === 'string' ? body.message : null

    if (!schedule_id) return NextResponse.json({ error: 'schedule_id 필수' }, { status: 400 })

    // 스케줄 검증
    const sched = await prisma.$queryRaw<any[]>`
      SELECT id, year, month, status FROM cs_schedules WHERE id = ${schedule_id} LIMIT 1
    `
    if (sched.length === 0) {
      return NextResponse.json({ error: '스케줄을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 수신자 스냅샷 (요청에서 받은 worker id 들로 lookup)
    let snapshot: any[] = []
    if (recipientIds.length > 0) {
      const placeholders = recipientIds.map((_, i) => `?`).join(',')
      // Tagged template 으로는 in (...) 동적 처리 어려움 → Unsafe 사용
      const sql = `SELECT id, name, phone, email, color_tone, group_label
                   FROM cs_workers WHERE id IN (${placeholders})`
      const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...recipientIds)
      snapshot = rows
    }

    const id = crypto.randomUUID()
    const recipient_count = snapshot.length
    const responseMeta = { message, requested_at: new Date().toISOString() }

    // status는 우선 'queued' (실제 전송 미구현)
    await prisma.$executeRaw`
      INSERT INTO cs_distributions
        (id, schedule_id, channel, recipient_count, recipients_snapshot,
         status, response_meta, sent_at, sent_by, created_at)
      VALUES
        (${id}, ${schedule_id}, ${channel}, ${recipient_count},
         ${JSON.stringify(snapshot)},
         ${channel === 'manual' || channel === 'link' ? 'sent' : 'queued'},
         ${JSON.stringify(responseMeta)},
         ${channel === 'manual' || channel === 'link' ? new Date() : null},
         ${user.id}, NOW())
    `

    // 'manual' / 'link' 는 수동/링크 공유라 즉시 sent. Phase 2에서 jandi/email 실제 전송 추가.
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, schedule_id, channel, recipient_count, recipients_snapshot, status,
             response_meta, sent_at, sent_by, created_at
      FROM cs_distributions WHERE id = ${id} LIMIT 1
    `
    const created = rows[0]
      ? { ...rows[0], recipient_count: Number(rows[0].recipient_count || 0) }
      : null
    return NextResponse.json({ data: serialize(created), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const schedule_id = request.nextUrl.searchParams.get('schedule_id')
    if (!schedule_id) {
      return NextResponse.json({ error: 'schedule_id 쿼리 필수' }, { status: 400 })
    }
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, schedule_id, channel, recipient_count, recipients_snapshot, status,
             response_meta, sent_at, sent_by, created_at
      FROM cs_distributions
      WHERE schedule_id = ${schedule_id}
      ORDER BY created_at DESC
    `
    const data = rows.map(r => ({
      ...r,
      recipient_count: Number(r.recipient_count || 0),
    }))
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
