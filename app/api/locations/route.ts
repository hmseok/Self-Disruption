import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// ═══════════════════════════════════════════════════════════════════
// 위치 코드 관리 API
//   GET    /api/locations              전체 조회 (모든 직원 — 드롭다운용)
//   GET    /api/locations?id=...       단건 조회
//   POST   /api/locations              신규 등록 (admin)
//   PATCH  /api/locations?id=...       수정 (admin)
//   DELETE /api/locations?id=...       비활성화 (admin) — 실제 삭제 X
// ═══════════════════════════════════════════════════════════════════

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const ALLOWED_FIELDS = ['code', 'label', 'address', 'phone', 'category', 'sort_order', 'active', 'notes']
const ALLOWED_CATEGORIES = ['garage', 'branch', 'repair', 'partner', 'customer', 'other']

// ─── GET ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true'

  try {
    if (id) {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT * FROM location_codes WHERE id = ${id} LIMIT 1
      `
      return NextResponse.json({ data: serialize(rows[0] || null), error: null })
    }

    const rows = includeInactive
      ? await prisma.$queryRaw<any[]>`
          SELECT * FROM location_codes ORDER BY sort_order, label
        `
      : await prisma.$queryRaw<any[]>`
          SELECT * FROM location_codes WHERE active = 1 ORDER BY sort_order, label
        `

    return NextResponse.json({ data: serialize(rows), error: null })
  } catch (e: any) {
    console.error('[GET /api/locations]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─── POST ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 })

  try {
    const body = await req.json()
    const code = String(body.code || '').trim().toUpperCase()
    const label = String(body.label || '').trim()
    if (!code || !label) {
      return NextResponse.json({ error: 'code, label 필수' }, { status: 400 })
    }
    if (!/^[A-Z0-9_]{1,32}$/.test(code)) {
      return NextResponse.json({ error: 'code는 영대문자/숫자/_ 32자 이내' }, { status: 400 })
    }
    const category = ALLOWED_CATEGORIES.includes(body.category) ? body.category : 'garage'

    // 중복 검사
    const dup = await prisma.$queryRaw<any[]>`
      SELECT id FROM location_codes WHERE code = ${code} LIMIT 1
    `
    if (dup.length > 0) {
      return NextResponse.json({ error: `코드 "${code}" 가 이미 존재합니다` }, { status: 409 })
    }

    const id = randomUUID()
    await prisma.$executeRaw`
      INSERT INTO location_codes (
        id, code, label, address, phone, category, sort_order, active, notes
      ) VALUES (
        ${id}, ${code}, ${label},
        ${body.address || null}, ${body.phone || null},
        ${category},
        ${Number(body.sort_order) || 100},
        ${body.active === false ? 0 : 1},
        ${body.notes || null}
      )
    `
    return NextResponse.json({ data: { id }, error: null }, { status: 201 })
  } catch (e: any) {
    console.error('[POST /api/locations]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─── PATCH ───────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  try {
    const body = await req.json()
    const sets: string[] = []
    const params: any[] = []

    for (const k of ALLOWED_FIELDS) {
      if (body[k] === undefined) continue
      let v = body[k]
      if (k === 'code') {
        v = String(v).trim().toUpperCase()
        if (!/^[A-Z0-9_]{1,32}$/.test(v)) {
          return NextResponse.json({ error: 'code 형식 오류' }, { status: 400 })
        }
      }
      if (k === 'category' && !ALLOWED_CATEGORIES.includes(v)) {
        return NextResponse.json({ error: 'category 값 오류' }, { status: 400 })
      }
      if (k === 'active') v = v ? 1 : 0
      sets.push(`${k} = ?`)
      params.push(v)
    }
    if (sets.length === 0) return NextResponse.json({ error: '수정 필드 없음' }, { status: 400 })

    params.push(id)
    const sql = `UPDATE location_codes SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`
    await prisma.$executeRawUnsafe(sql, ...params)

    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[PATCH /api/locations]', e)
    if (String(e.message).includes('Duplicate entry')) {
      return NextResponse.json({ error: '코드 중복' }, { status: 409 })
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─── DELETE (비활성화만, 실제 삭제 X) ────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  try {
    await prisma.$executeRaw`
      UPDATE location_codes SET active = 0, updated_at = NOW() WHERE id = ${id}
    `
    return NextResponse.json({ data: { id, deactivated: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
