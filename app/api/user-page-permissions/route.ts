import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const userId = searchParams.get('user_id') || user.id

    const data = await prisma.$queryRaw<any[]>`
      SELECT * FROM user_page_permissions WHERE user_id = ${userId}
    `
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 })
    }

    const body = await request.json()
    const id = crypto.randomUUID()

    await prisma.$executeRaw`
      INSERT INTO user_page_permissions (id, user_id, page_key, can_view, can_edit, can_delete, created_at, updated_at)
      VALUES (${id}, ${body.user_id}, ${body.page_key}, ${body.can_view ?? true}, ${body.can_edit ?? false}, ${body.can_delete ?? false}, NOW(), NOW())
      ON DUPLICATE KEY UPDATE can_view = VALUES(can_view), can_edit = VALUES(can_edit), can_delete = VALUES(can_delete), updated_at = NOW()
    `
    return NextResponse.json({ data: { id }, error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
