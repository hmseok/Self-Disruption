// ═══════════════════════════════════════════════════════════════════
// GET  /api/call-scheduler/shift-groups — 그룹 목록 + 멤버 카운트
// POST /api/call-scheduler/shift-groups — 신규 그룹 생성
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

const PATTERNS = ['all_days', 'all_weekdays', 'weekends_only', 'custom'] as const
const STRATEGIES = ['all_members', 'rotation'] as const
const COLOR_TONES = ['blue', 'gray', 'green', 'amber', 'violet', 'red', 'none'] as const

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT g.id, g.name, g.shift_slot_id, g.pattern_type, g.custom_days,
             g.generation_strategy, g.rotation_size, g.rotation_period_days,
             g.color_tone, g.description, g.sort_order, g.is_active,
             g.created_at, g.updated_at,
             s.code AS slot_code, s.label AS slot_label,
             TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
             TIME_FORMAT(s.end_time, '%H:%i') AS end_time,
             s.is_overnight,
             (SELECT COUNT(*) FROM cs_group_members m WHERE m.group_id = g.id) AS member_count
      FROM cs_shift_groups g
      JOIN cs_shift_slots s ON s.id = g.shift_slot_id
      WHERE g.is_active = 1
      ORDER BY g.sort_order ASC, g.name ASC
    `
    const data = rows.map(r => ({
      ...r,
      is_active: Boolean(r.is_active),
      is_overnight: Boolean(r.is_overnight),
      rotation_size: r.rotation_size != null ? Number(r.rotation_size) : null,
      rotation_period_days: Number(r.rotation_period_days || 1),
      member_count: Number(r.member_count || 0),
    }))
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const body = await request.json()
    const name: string = String(body?.name || '').trim()
    const shift_slot_id: string = String(body?.shift_slot_id || '')
    if (!name) return NextResponse.json({ error: '이름 필수' }, { status: 400 })
    if (!shift_slot_id) return NextResponse.json({ error: '시프트 필수' }, { status: 400 })

    const pattern_type: string = PATTERNS.includes(body?.pattern_type) ? body.pattern_type : 'all_weekdays'
    const generation_strategy: string = STRATEGIES.includes(body?.generation_strategy) ? body.generation_strategy : 'all_members'
    const color_tone: string = COLOR_TONES.includes(body?.color_tone) ? body.color_tone : 'none'
    const custom_days: string | null = pattern_type === 'custom' ? (body?.custom_days || null) : null
    const rotation_size: number | null = generation_strategy === 'rotation' ? (Number(body?.rotation_size) || 1) : null
    const rotation_period_days: number = Number(body?.rotation_period_days) || 1
    const description: string | null = body?.description ?? null
    const sort_order: number = Number(body?.sort_order) || 0

    const id = crypto.randomUUID()
    await prisma.$executeRaw`
      INSERT INTO cs_shift_groups
        (id, name, shift_slot_id, pattern_type, custom_days,
         generation_strategy, rotation_size, rotation_period_days,
         color_tone, description, sort_order, is_active, created_at, updated_at)
      VALUES
        (${id}, ${name}, ${shift_slot_id}, ${pattern_type}, ${custom_days},
         ${generation_strategy}, ${rotation_size}, ${rotation_period_days},
         ${color_tone}, ${description}, ${sort_order}, 1, NOW(), NOW())
    `

    // 초기 멤버 (옵션)
    const initialMembers: string[] = Array.isArray(body?.member_ids) ? body.member_ids : []
    for (let i = 0; i < initialMembers.length; i++) {
      const wId = initialMembers[i]
      await prisma.$executeRaw`
        INSERT INTO cs_group_members (id, group_id, worker_id, priority, created_at)
        VALUES (${crypto.randomUUID()}, ${id}, ${wId}, ${i}, NOW())
      `
    }

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, shift_slot_id, pattern_type, custom_days,
             generation_strategy, rotation_size, rotation_period_days,
             color_tone, description, sort_order, is_active, created_at, updated_at
      FROM cs_shift_groups WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json({ data: serialize(rows[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
