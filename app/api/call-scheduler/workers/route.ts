// ═══════════════════════════════════════════════════════════════════
// GET  /api/call-scheduler/workers — 근무자 목록
// POST /api/call-scheduler/workers — 신규 근무자
// PR-2QQ-a 14색 / PR-2QQ-b is_external / PR-2QQ-d-1 priority + 제약
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

const COLOR_TONES = [
  'blue', 'gray', 'green', 'amber', 'violet', 'red', 'none',
  'indigo', 'sky', 'teal', 'lime', 'orange', 'pink', 'slate',
] as const
type Tone = typeof COLOR_TONES[number]

interface FeatureFlags {
  hasExternal: boolean
  hasConstraints: boolean
}

async function detectFeatures(): Promise<FeatureFlags> {
  let hasExternal = true, hasConstraints = true
  try {
    await prisma.$queryRaw<any[]>`SELECT is_external FROM cs_workers LIMIT 1`
  } catch { hasExternal = false }
  try {
    await prisma.$queryRaw<any[]>`SELECT priority_level, preferred_dow_avoid, work_pattern_text FROM cs_workers LIMIT 1`
  } catch { hasConstraints = false }
  return { hasExternal, hasConstraints }
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { hasExternal, hasConstraints } = await detectFeatures()
    let rows: any[]
    if (hasConstraints) {
      rows = await prisma.$queryRaw<any[]>`
        SELECT id, name, profile_id, color_tone, group_label, phone, email, is_active,
               is_external, external_pattern,
               priority_level, preferred_dow_avoid,
               required_days_per_month, max_days_per_month,
               work_pattern_text
        FROM cs_workers
        WHERE is_active = 1
        ORDER BY priority_level ASC, is_external DESC, group_label DESC, name ASC
      `
    } else if (hasExternal) {
      rows = await prisma.$queryRaw<any[]>`
        SELECT id, name, profile_id, color_tone, group_label, phone, email, is_active,
               is_external, external_pattern
        FROM cs_workers
        WHERE is_active = 1
        ORDER BY is_external DESC, group_label DESC, name ASC
      `
    } else {
      rows = await prisma.$queryRaw<any[]>`
        SELECT id, name, profile_id, color_tone, group_label, phone, email, is_active
        FROM cs_workers
        WHERE is_active = 1
        ORDER BY group_label DESC, name ASC
      `
    }
    const data = rows.map(r => ({
      ...r,
      is_active: Boolean(r.is_active),
      is_external: hasExternal ? Boolean(r.is_external) : false,
      external_pattern: hasExternal ? (r.external_pattern ?? null) : null,
      priority_level: hasConstraints ? Number(r.priority_level || 2) : 2,
      preferred_dow_avoid: hasConstraints ? (r.preferred_dow_avoid ?? null) : null,
      required_days_per_month: hasConstraints && r.required_days_per_month != null
        ? Number(r.required_days_per_month) : null,
      max_days_per_month: hasConstraints && r.max_days_per_month != null
        ? Number(r.max_days_per_month) : null,
      work_pattern_text: hasConstraints ? (r.work_pattern_text ?? null) : null,
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
    if (!name) return NextResponse.json({ error: '이름은 필수' }, { status: 400 })

    const tone: Tone = COLOR_TONES.includes(body?.color_tone) ? body.color_tone : 'none'
    const group_label: string | null = body?.group_label ?? null
    const phone: string | null = body?.phone ?? null
    const email: string | null = body?.email ?? null
    const profile_id: string | null = body?.profile_id ?? null

    const { hasExternal, hasConstraints } = await detectFeatures()
    const id = crypto.randomUUID()

    if (hasConstraints) {
      const is_external: number = body?.is_external ? 1 : 0
      const priority_level: number = Math.min(3, Math.max(1, Number(body?.priority_level) || 2))
      const preferred_dow_avoid: string | null = body?.preferred_dow_avoid ?? null
      const required_days: number | null = body?.required_days_per_month != null
        ? Number(body.required_days_per_month) : null
      const max_days: number | null = body?.max_days_per_month != null
        ? Number(body.max_days_per_month) : null
      const work_pattern: string | null = body?.work_pattern_text ?? null
      await prisma.$executeRaw`
        INSERT INTO cs_workers
          (id, name, profile_id, color_tone, group_label, phone, email, is_active,
           is_external, priority_level, preferred_dow_avoid,
           required_days_per_month, max_days_per_month, work_pattern_text,
           created_at, updated_at)
        VALUES
          (${id}, ${name}, ${profile_id}, ${tone}, ${group_label}, ${phone}, ${email}, 1,
           ${is_external}, ${priority_level}, ${preferred_dow_avoid},
           ${required_days}, ${max_days}, ${work_pattern},
           NOW(), NOW())
      `
    } else if (hasExternal) {
      const is_external: number = body?.is_external ? 1 : 0
      await prisma.$executeRaw`
        INSERT INTO cs_workers
          (id, name, profile_id, color_tone, group_label, phone, email, is_active,
           is_external, created_at, updated_at)
        VALUES
          (${id}, ${name}, ${profile_id}, ${tone}, ${group_label}, ${phone}, ${email}, 1,
           ${is_external}, NOW(), NOW())
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO cs_workers
          (id, name, profile_id, color_tone, group_label, phone, email, is_active, created_at, updated_at)
        VALUES
          (${id}, ${name}, ${profile_id}, ${tone}, ${group_label}, ${phone}, ${email}, 1, NOW(), NOW())
      `
    }

    return NextResponse.json({
      data: serialize({ id, name, color_tone: tone, group_label, phone, email, is_active: true }),
      error: null,
    }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
