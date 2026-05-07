import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/freelancers
//   ?order=name|created_at (default name)
//   ?active=true|false
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const order = searchParams.get('order') === 'created_at' ? 'created_at DESC' : 'name ASC'
    const active = searchParams.get('active')

    const conditions: string[] = []
    if (active === 'true') conditions.push('is_active = 1')
    else if (active === 'false') conditions.push('is_active = 0')
    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const data = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM freelancers ${whereSql} ORDER BY ${order}`,
    )
    return NextResponse.json({ data: serialize(data || []), error: null })
  } catch (e: any) {
    console.error('[freelancers GET]', e)
    return NextResponse.json({ data: [], error: e.message })
  }
}

// POST /api/freelancers — 신규 등록 (또는 동일 (name, phone) UPSERT)
const FIELDS = [
  'name', 'phone', 'email', 'bank_name', 'account_number', 'account_holder',
  'reg_number', 'tax_type', 'service_type', 'is_active', 'memo', 'linked_profile_id',
]

// POST UPSERT 동작 (PR-B12, 2026-05-07):
//   - 같은 (name, phone) row 있으면 → UPDATE (계좌번호/은행 등 갱신)
//   - 없으면 → INSERT
//   - body.upsert === false 면 강제 INSERT (옛 동작)
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    if (!body.name) return NextResponse.json({ error: '이름은 필수입니다.' }, { status: 400 })

    // 실재 컬럼 감지 (스키마 드리프트 대응)
    const existingCols: string[] = (await prisma.$queryRawUnsafe<any[]>(
      `SHOW COLUMNS FROM freelancers`
    )).map((c: any) => c.Field)

    const name = String(body.name).trim()
    const phone = body.phone ? String(body.phone).trim() : null
    const upsert = body.upsert !== false  // default ON — 동일 이름+전화 갱신

    // 1) 기존 row 검색 (이름+전화번호 매칭)
    let existingId: string | null = null
    if (upsert) {
      const params: any[] = [name]
      let phoneClause = ''
      if (phone) {
        phoneClause = ' AND (phone = ? OR phone IS NULL OR phone = "")'
        params.push(phone)
      }
      const found = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM freelancers WHERE name = ?${phoneClause} ORDER BY phone IS NULL ASC, created_at DESC LIMIT 1`,
        ...params,
      )
      if (found && found.length > 0) existingId = String(found[0].id)
    }

    // 2) 갱신 또는 신규 INSERT
    if (existingId) {
      // UPDATE — 화이트리스트 컬럼만
      const sets: string[] = []
      const vals: any[] = []
      for (const f of FIELDS) {
        if (!existingCols.includes(f)) continue
        if (!(f in body)) continue
        let v = body[f]
        if (v === '') v = null
        if (typeof v === 'boolean') v = v ? 1 : 0
        sets.push(`${f} = ?`)
        vals.push(v)
      }
      if (existingCols.includes('updated_at')) sets.push('updated_at = NOW()')
      if (sets.length > 0) {
        vals.push(existingId)
        await prisma.$executeRawUnsafe(
          `UPDATE freelancers SET ${sets.join(', ')} WHERE id = ?`,
          ...vals,
        )
      }
      const updated = await prisma.$queryRaw<any[]>`SELECT * FROM freelancers WHERE id = ${existingId} LIMIT 1`
      return NextResponse.json({ data: serialize(updated[0]), error: null, upserted: 'updated' }, { status: 200 })
    }

    // INSERT
    const id = randomUUID()
    const cols: string[] = ['id']
    const placeholders: string[] = ['?']
    const values: any[] = [id]

    for (const f of FIELDS) {
      if (!existingCols.includes(f)) continue
      if (!(f in body)) continue
      cols.push(f)
      placeholders.push('?')
      let v = body[f]
      if (v === '') v = null
      if (typeof v === 'boolean') v = v ? 1 : 0
      values.push(v)
    }
    if (existingCols.includes('created_at')) {
      cols.push('created_at'); placeholders.push('NOW()')
    }
    if (existingCols.includes('updated_at')) {
      cols.push('updated_at'); placeholders.push('NOW()')
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO freelancers (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
      ...values,
    )
    const created = await prisma.$queryRaw<any[]>`SELECT * FROM freelancers WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null, upserted: 'inserted' }, { status: 201 })
  } catch (e: any) {
    console.error('[freelancers POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
