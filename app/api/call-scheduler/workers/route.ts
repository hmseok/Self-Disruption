// ═══════════════════════════════════════════════════════════════════
// GET  /api/call-scheduler/workers — 근무자 목록
// POST /api/call-scheduler/workers — 신규 근무자
// PR-2QQ-a 14색 / PR-2QQ-b is_external + external_pattern (graceful)
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

async function checkExternalCols(): Promise<boolean> {
  try {
    await prisma.$queryRaw<any[]>`SELECT is_external, external_pattern FROM cs_workers LIMIT 1`
    return true
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const hasExt = await checkExternalCols()
    const rows = hasExt
      ? await prisma.$queryRaw<any[]>`
          SELECT id, name, profile_id, color_tone, group_label, phone, email, is_active,
                 is_external, external_pattern
          FROM cs_workers
          WHERE is_active = 1
          ORDER BY is_external DESC, group_label DESC, name ASC
        `
      : await prisma.$queryRaw<any[]>`
          SELECT id, name, profile_id, color_tone, group_label, phone, email, is_active
          FROM cs_workers
          WHERE is_active = 1
          ORDER BY group_label DESC, name ASC
        `
    const data = rows.map(r => ({
      ...r,
      is_active: Boolean(r.is_active),
      is_external: hasExt ? Boolean(r.is_external) : false,
      external_pattern: hasExt ? (r.external_pattern ?? null) : null,
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
    const is_external: number = body?.is_external ? 1 : 0
    const external_pattern: string | null = body?.external_pattern ?? null

    const hasExt = await checkExternalCols()
    const id = crypto.randomUUID()
    if (hasExt) {
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
      data: serialize({ id, name, color_tone: tone, group_label, phone, email, is_active: true, is_external: !!is_external, external_pattern }),
      error: null,
    }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
