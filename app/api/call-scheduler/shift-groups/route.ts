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

const PATTERNS = ['all_days', 'all_weekdays', 'weekends_only', 'custom', 'holidays_only'] as const
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
    // N-16 — skip_on_holidays 컬럼 graceful
    let hasSkipOnHolidays = true
    try {
      await prisma.$queryRaw<any[]>`SELECT skip_on_holidays FROM cs_shift_groups LIMIT 1`
    } catch { hasSkipOnHolidays = false }
    // N-19-a — rotation 컬럼 + cs_group_shifts 테이블 graceful
    let hasRotation = true
    try {
      await prisma.$queryRaw<any[]>`SELECT rotation_enabled FROM cs_shift_groups LIMIT 1`
    } catch { hasRotation = false }
    let hasGroupShifts = true
    try {
      await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_group_shifts LIMIT 1`
    } catch { hasGroupShifts = false }
    let hasMemberRotation = true
    try {
      await prisma.$queryRaw<any[]>`SELECT rotation_start_date FROM cs_group_members LIMIT 1`
    } catch { hasMemberRotation = false }

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
    // N-16 — skip_on_holidays 별도 조회 (graceful)
    const skipHolidaysMap = new Map<string, boolean>()
    if (hasSkipOnHolidays && rows.length > 0) {
      const shRows = await prisma.$queryRaw<any[]>`
        SELECT id, skip_on_holidays FROM cs_shift_groups WHERE is_active = 1
      `
      for (const r of shRows) skipHolidaysMap.set(r.id, Boolean(r.skip_on_holidays))
    }
    // N-19-a — rotation 설정 별도 조회 (graceful)
    const rotationMap = new Map<string, {
      enabled: boolean; period_kind: string; period_days: number
    }>()
    if (hasRotation && rows.length > 0) {
      try {
        const rRows = await prisma.$queryRaw<any[]>`
          SELECT id, rotation_enabled, rotation_period_kind, rotation_custom_days
          FROM cs_shift_groups WHERE is_active = 1
        `
        for (const r of rRows) {
          rotationMap.set(r.id, {
            enabled: Boolean(r.rotation_enabled),
            period_kind: String(r.rotation_period_kind || 'monthly'),
            period_days: Number(r.rotation_custom_days || 30),
          })
        }
      } catch { /* graceful */ }
    }
    // N-19-a — cs_group_shifts (그룹 ↔ 시프트 1:N) 일괄 조회
    const groupShiftsMap = new Map<string, Array<{
      shift_slot_id: string; sort_order: number
      slot_code: string; slot_label: string
      start_time: string; end_time: string; is_overnight: boolean
    }>>()
    if (hasGroupShifts && rows.length > 0) {
      try {
        const gsRows = await prisma.$queryRaw<any[]>`
          SELECT gs.group_id, gs.shift_slot_id, gs.sort_order,
                 s.code AS slot_code, s.label AS slot_label,
                 TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
                 TIME_FORMAT(s.end_time, '%H:%i') AS end_time,
                 s.is_overnight
          FROM cs_group_shifts gs
          JOIN cs_shift_slots s ON s.id = gs.shift_slot_id
          ORDER BY gs.group_id, gs.sort_order ASC
        `
        for (const r of gsRows) {
          const arr = groupShiftsMap.get(r.group_id) || []
          arr.push({
            shift_slot_id: r.shift_slot_id,
            sort_order: Number(r.sort_order || 0),
            slot_code: String(r.slot_code),
            slot_label: String(r.slot_label || r.slot_code),
            start_time: r.start_time,
            end_time: r.end_time,
            is_overnight: Boolean(r.is_overnight),
          })
          groupShiftsMap.set(r.group_id, arr)
        }
      } catch { /* graceful */ }
    }

    // Phase K — cs_group_members 새 8 컬럼 존재 확인 (graceful)
    let hasMemberSettings = true
    try {
      await prisma.$queryRaw<any[]>`SELECT priority_level FROM cs_group_members LIMIT 1`
    } catch { hasMemberSettings = false }

    // 멤버 chip 일괄 조회 (그룹별 워커 이름 + color_tone + 8 멤버 설정 + N-19-a 로테이션 3)
    type MemberRow = {
      id: string; name: string; color_tone: string; priority: number;
      priority_level: number;
      preferred_dow_prefer: string | null; preferred_dow_avoid: string | null;
      max_consecutive_work_days: number | null;
      required_days_per_month: number | null; max_days_per_month: number | null;
      blocked_slot_ids: string[] | null; work_pattern_text: string | null;
      rotation_start_date: string | null; rotation_start_index: number;
      rotation_end_date: string | null;
    }
    const memberMap = new Map<string, MemberRow[]>()
    if (rows.length > 0) {
      const memRows = (hasMemberSettings && hasMemberRotation)
        ? await prisma.$queryRaw<any[]>`
            SELECT m.group_id, w.id AS worker_id, w.name, w.color_tone,
                   m.priority,
                   m.priority_level, m.preferred_dow_prefer, m.preferred_dow_avoid,
                   m.max_consecutive_work_days, m.required_days_per_month, m.max_days_per_month,
                   m.blocked_slot_ids, m.work_pattern_text,
                   DATE_FORMAT(m.rotation_start_date, '%Y-%m-%d') AS rotation_start_date,
                   m.rotation_start_index,
                   DATE_FORMAT(m.rotation_end_date, '%Y-%m-%d') AS rotation_end_date
            FROM cs_group_members m
            JOIN cs_workers w ON w.id = m.worker_id
            WHERE w.is_active = 1
            ORDER BY m.group_id, m.priority ASC
          `
        : hasMemberSettings
        ? await prisma.$queryRaw<any[]>`
            SELECT m.group_id, w.id AS worker_id, w.name, w.color_tone,
                   m.priority,
                   m.priority_level, m.preferred_dow_prefer, m.preferred_dow_avoid,
                   m.max_consecutive_work_days, m.required_days_per_month, m.max_days_per_month,
                   m.blocked_slot_ids, m.work_pattern_text
            FROM cs_group_members m
            JOIN cs_workers w ON w.id = m.worker_id
            WHERE w.is_active = 1
            ORDER BY m.group_id, m.priority ASC
          `
        : await prisma.$queryRaw<any[]>`
            SELECT m.group_id, w.id AS worker_id, w.name, w.color_tone, m.priority
            FROM cs_group_members m
            JOIN cs_workers w ON w.id = m.worker_id
            WHERE w.is_active = 1
            ORDER BY m.group_id, m.priority ASC
          `
      for (const r of memRows) {
        const arr = memberMap.get(r.group_id) || []
        const row: MemberRow = {
          id: r.worker_id,
          name: r.name,
          color_tone: r.color_tone || 'none',
          priority: Number(r.priority || 0),
          priority_level: hasMemberSettings ? Number(r.priority_level || 2) : 2,
          preferred_dow_prefer: hasMemberSettings ? (r.preferred_dow_prefer ?? null) : null,
          preferred_dow_avoid: hasMemberSettings ? (r.preferred_dow_avoid ?? null) : null,
          max_consecutive_work_days: hasMemberSettings && r.max_consecutive_work_days != null
            ? Number(r.max_consecutive_work_days) : null,
          required_days_per_month: hasMemberSettings && r.required_days_per_month != null
            ? Number(r.required_days_per_month) : null,
          max_days_per_month: hasMemberSettings && r.max_days_per_month != null
            ? Number(r.max_days_per_month) : null,
          blocked_slot_ids: hasMemberSettings && r.blocked_slot_ids != null
            ? (typeof r.blocked_slot_ids === 'string'
               ? (() => { try { return JSON.parse(r.blocked_slot_ids) } catch { return [] } })()
               : (Array.isArray(r.blocked_slot_ids) ? r.blocked_slot_ids : []))
            : null,
          work_pattern_text: hasMemberSettings ? (r.work_pattern_text ?? null) : null,
          rotation_start_date: hasMemberRotation ? (r.rotation_start_date ?? null) : null,
          rotation_start_index: hasMemberRotation ? Number(r.rotation_start_index || 0) : 0,
          rotation_end_date: hasMemberRotation ? (r.rotation_end_date ?? null) : null,
        }
        arr.push(row)
        memberMap.set(r.group_id, arr)
      }
    }

    const data = rows.map(r => {
      const rot = rotationMap.get(r.id)
      return {
        ...r,
        category: catMap.get(r.id) || CATEGORIES_FALLBACK,
        skip_on_holidays: skipHolidaysMap.get(r.id) || false,  // N-16
        is_active: Boolean(r.is_active),
        is_overnight: Boolean(r.is_overnight),
        rotation_size: r.rotation_size != null ? Number(r.rotation_size) : null,
        rotation_period_days: Number(r.rotation_period_days || 1),
        member_count: Number(r.member_count || 0),
        members: memberMap.get(r.id) || [],
        // N-19-a — 시프트 로테이션
        rotation_enabled: rot?.enabled || false,
        rotation_period_kind: rot?.period_kind || 'monthly',
        rotation_custom_days: rot?.period_days || 30,
        rotation_shifts: groupShiftsMap.get(r.id) || [],
      }
    })
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
    const skip_on_holidays: number = body?.skip_on_holidays ? 1 : 0  // N-16

    // category 컬럼 존재 여부 (graceful)
    let hasCategory = true
    try {
      await prisma.$queryRaw<any[]>`SELECT category FROM cs_shift_groups LIMIT 1`
    } catch {
      hasCategory = false
    }
    // N-16 — skip_on_holidays 컬럼 존재 여부 (graceful)
    let hasSkipOnHolidays = true
    try {
      await prisma.$queryRaw<any[]>`SELECT skip_on_holidays FROM cs_shift_groups LIMIT 1`
    } catch { hasSkipOnHolidays = false }

    const id = crypto.randomUUID()
    if (hasCategory && hasSkipOnHolidays) {
      await prisma.$executeRaw`
        INSERT INTO cs_shift_groups
          (id, name, category, shift_slot_id, pattern_type, custom_days,
           generation_strategy, rotation_size, rotation_period_days,
           color_tone, description, sort_order, skip_on_holidays,
           is_active, created_at, updated_at)
        VALUES
          (${id}, ${name}, ${category}, ${shift_slot_id}, ${pattern_type}, ${custom_days},
           ${generation_strategy}, ${rotation_size}, ${rotation_period_days},
           ${color_tone}, ${description}, ${sort_order}, ${skip_on_holidays},
           1, NOW(), NOW())
      `
    } else if (hasCategory) {
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
