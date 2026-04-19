import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════
// business_rules CRUD
//   실제 컬럼: id, `key` (text), `value` (json), description, company_id,
//              created_at, updated_at
//   `key`는 MySQL 예약어 → backtick 필수
//   `value`는 JSON 컬럼 → JSON.stringify 로 직렬화해서 바인딩
// ═══════════════════════════════════════════════════════════════

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

function toJsonValue(v: any): string {
  // JSON 컬럼에 바인딩할 JSON 텍스트 생성
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'string') {
    // 이미 JSON 문자열이면 그대로, 아니면 문자열로 직렬화
    try { JSON.parse(v); return v } catch { return JSON.stringify(v) }
  }
  return JSON.stringify(v)
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const data = await prisma.$queryRaw<any[]>`SELECT * FROM business_rules ORDER BY created_at DESC`

    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    // 레거시 필드명 호환: rule_name/rule_value → key/value
    const keyVal = body.key ?? body.rule_name
    const valueRaw = body.value ?? body.rule_value
    const description = body.description ?? null

    if (!keyVal) {
      return NextResponse.json({ error: 'key(rule_name) 필수' }, { status: 400 })
    }
    const id = crypto.randomUUID()
    const valueJson = toJsonValue(valueRaw)

    await prisma.$executeRawUnsafe(
      'INSERT INTO business_rules (id, `key`, `value`, description, created_at, updated_at) VALUES (?, ?, CAST(? AS JSON), ?, NOW(), NOW())',
      id, keyVal, valueJson, description
    )

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM business_rules WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
