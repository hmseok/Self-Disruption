// ═══════════════════════════════════════════════════════════════════
// GET  /api/call-scheduler/workers — 근무자 목록 (정체성만)
// POST /api/call-scheduler/workers — 신규 근무자
// Phase K (2026-05-09) — 그룹 중심 재구성
//   priority_level / preferred_dow_* / 일수 한도 / 슬롯 거부 / 패턴 메모
//   → cs_group_members 로 이동. 워커는 정체성만 (이름/색/외부여부/외부cycle).
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
  hasExternal: boolean    // is_external + external_pattern
  hasCycle: boolean       // cycle_days_on/off/start
}

async function detectFeatures(): Promise<FeatureFlags> {
  let hasExternal = true, hasCycle = true
  try {
    await prisma.$queryRaw<any[]>`SELECT is_external FROM cs_workers LIMIT 1`
  } catch { hasExternal = false }
  try {
    await prisma.$queryRaw<any[]>`SELECT cycle_days_on FROM cs_workers LIMIT 1`
  } catch { hasCycle = false }
  return { hasExternal, hasCycle }
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { hasExternal, hasCycle } = await detectFeatures()
    let rows: any[]
    if (hasCycle) {
      rows = await prisma.$queryRaw<any[]>`
        SELECT id, name, profile_id, color_tone, group_label, phone, email, is_active,
               is_external, external_pattern,
               cycle_days_on, cycle_days_off,
               DATE_FORMAT(cycle_start_date, '%Y-%m-%d') AS cycle_start_date
        FROM cs_workers
        WHERE is_active = 1
        ORDER BY is_external DESC, group_label DESC, name ASC
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
      // Phase K — 외부 cycle (워커 글로벌 — 모든 그룹 공통 일정)
      cycle_days_on: hasCycle && r.cycle_days_on != null ? Number(r.cycle_days_on) : null,
      cycle_days_off: hasCycle && r.cycle_days_off != null ? Number(r.cycle_days_off) : null,
      cycle_start_date: hasCycle ? (r.cycle_start_date ?? null) : null,
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

    const { hasExternal } = await detectFeatures()
    const id = crypto.randomUUID()

    // Phase K — INSERT 단순화 (정체성만, 그룹별 설정은 cs_group_members 로 별도 PUT)
    if (hasExternal) {
      const is_external: number = body?.is_external ? 1 : 0
      const external_pattern: string | null = body?.external_pattern ?? null
      await prisma.$executeRaw`
        INSERT INTO cs_workers
          (id, name, profile_id, color_tone, group_label, phone, email, is_active,
           is_external, external_pattern, created_at, updated_at)
        VALUES
          (${id}, ${name}, ${profile_id}, ${tone}, ${group_label}, ${phone}, ${email}, 1,
           ${is_external}, ${external_pattern}, NOW(), NOW())
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
