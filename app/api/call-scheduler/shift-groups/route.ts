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
const COLOR_TONES = [
  'blue', 'gray', 'green', 'amber', 'violet', 'red', 'none',
  'indigo', 'sky', 'teal', 'lime', 'orange', 'pink', 'slate',
] as const
const CATEGORIES_FALLBACK = 'general'  // 마이그레이션 미적용 시 fallback

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    // PR-2QQ-a: category 컬럼 존재 여부 확인 (마이그레이션 미적용 graceful)
    let hasCategory = true
    try {
      await prisma.$queryRaw<any[]>`SELECT category FROM cs_shift_groups LIMIT 1`
    } catch {
      hasCategory = false
    }

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

    // category 별도 조회 (graceful — 컬럼 없어도 'general')
    const catMap = new Map<string, string>()
    if (hasCategory && rows.length > 0) {
      const catRows = await prisma.$queryRaw<any[]>`
        SELECT id, category FROM cs_shift_groups WHERE is_active = 1
      `
      for (const r of catRows) catMap.set(r.id, r.category || CATEGORIES_FALLBACK)
    }

    // 멤버 chip 일괄 조회 (그룹별 워커 이름 + color_tone)
    const memberMap = new Map<string, Array<{ id: string; name: string; color_tone: string; priority: number }>>()
    if (rows.length > 0) {
      const memRows = await prisma.$queryRaw<any[]>`
        SELECT m.group_id, w.id AS worker_id, w.name, w.color_tone, m.priority
        FROM cs_group_members m
        JOIN cs_workers w ON w.id = m.worker_id
        WHERE w.is_active = 1
        ORDER BY m.group_id, m.priority ASC
      `
      for (const r of memRows) {
        const arr = memberMap.get(r.group_id) || []
        arr.push({
          id: r.worker_id,
          name: r.name,
          color_tone: r.color_tone || 'none',
          priority: Number(r.priority || 0),
        })
        memberMap.set(r.group_id, arr)
      }
    }

    const data = rows.map(r => ({
      ...r,
      category: catMap.get(r.id) || CATEGORIES_FALLBACK,
      is_active: Boolean(r.is_active),
      is_overnight: Boolean(r.is_overnight),
      rotation_size: r.rotation_size != null ? Number(r.rotation_size) : null,
      rotation_period_days: Number(r.rotation_period_days || 1),
      member_count: Number(r.member_count || 0),
      members: memberMap.get(r.id) || [],
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
    const category: string = String(body?.category || CATEGORIES_FALLBACK).slice(0, 32)
    const custom_days: string | null = pattern_type === 'custom' ? (body?.custom_days || null) : null
    const rotation_size: number | null = generation_strategy === 'rotation' ? (Number(body?.rotation_size) || 1) : null
    const rotation_period_days: number = Number(body?.rotation_period_days) || 1
    const description: string | null = body?.description ?? null
    const sort_order: number = Number(body?.sort_order) || 0

    // category 컬럼 존재 여부 (graceful)
    let hasCategory = true
    try {
      await prisma.$queryRaw<any[]>`SELECT category FROM cs_shift_groups LIMIT 1`
    } catch {
      hasCategory = false
    }

    const id = crypto.randomUUID()
    if (hasCategory) {
      await prisma.$executeRaw`
        INSERT INTO cs_shift_groups
          (id, name, category, shift_slot_id, pattern_type, custom_days,
           generation_strategy, rotation_size, rotation_period_days,
           color_tone, description, sort_order, is_active, created_at, updated_at)
        VALUES
          (${id}, ${name}, ${category}, ${shift_slot_id}, ${pattern_type}, ${custom_days},
           ${generation_strategy}, ${rotation_size}, ${rotation_period_days},
           ${color_tone}, ${description}, ${sort_order}, 1, NOW(), NOW())
      `
    } else {
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
    }

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
