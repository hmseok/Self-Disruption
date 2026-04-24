import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// DB 타임아웃 래퍼
const withTimeout = <T>(promise: Promise<T>, ms = 5000): Promise<T | null> =>
  Promise.race([
    promise.catch(() => null),
    new Promise<null>(r => setTimeout(() => r(null), ms))
  ])

// GET /api/user_page_permissions?user_id=xxx
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const userId = searchParams.get('user_id')

    let data: any[] | null

    if (userId) {
      data = await withTimeout(prisma.$queryRaw<any[]>`
        SELECT * FROM user_page_permissions WHERE user_id = ${userId}
      `)
    } else {
      // 전체 조회 (admin/master만)
      if (!['admin', 'master'].includes(user.role)) {
        return NextResponse.json({ error: '권한 없음' }, { status: 403 })
      }
      data = await withTimeout(prisma.$queryRaw<any[]>`
        SELECT * FROM user_page_permissions ORDER BY user_id, page_path
      `)
    }

    if (data === null) {
      return NextResponse.json({ data: [], error: null })
    }

    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    console.error('[user_page_permissions GET]', e.message)
    return NextResponse.json({ data: [], error: null })
  }
}

// POST /api/user_page_permissions — 배열로 여러 권한 일괄 저장
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user || !['admin', 'master'].includes(user.role)) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 })
    }

    const body = await request.json()
    const permissions = Array.isArray(body) ? body : [body]

    if (permissions.length === 0) {
      return NextResponse.json({ data: [], error: null })
    }

    // 각 권한을 UPSERT (ON DUPLICATE KEY UPDATE)
    for (const perm of permissions) {
      const id = crypto.randomUUID()
      const userId = perm.user_id
      const pagePath = perm.page_path
      const canView = perm.can_view ? 1 : 0
      const canCreate = perm.can_create ? 1 : 0
      const canEdit = perm.can_edit ? 1 : 0
      const canDelete = perm.can_delete ? 1 : 0
      const dataScope = perm.data_scope || 'all'

      if (!userId || !pagePath) continue

      await prisma.$executeRaw`
        INSERT INTO user_page_permissions (id, user_id, page_path, can_view, can_create, can_edit, can_delete, data_scope, created_at, updated_at)
        VALUES (${id}, ${userId}, ${pagePath}, ${canView}, ${canCreate}, ${canEdit}, ${canDelete}, ${dataScope}, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          can_view = VALUES(can_view),
          can_create = VALUES(can_create),
          can_edit = VALUES(can_edit),
          can_delete = VALUES(can_delete),
          data_scope = VALUES(data_scope),
          updated_at = NOW()
      `
    }

    return NextResponse.json({ success: true, count: permissions.length, error: null }, { status: 201 })
  } catch (e: any) {
    console.error('[user_page_permissions POST]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/user_page_permissions?user_id=xxx — 특정 유저의 권한 전체 삭제
export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user || !['admin', 'master'].includes(user.role)) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 })
    }

    const { searchParams } = request.nextUrl
    const userId = searchParams.get('user_id')

    if (!userId) {
      return NextResponse.json({ error: 'user_id가 필요합니다.' }, { status: 400 })
    }

    await prisma.$executeRaw`
      DELETE FROM user_page_permissions WHERE user_id = ${userId}
    `

    return NextResponse.json({ success: true, error: null })
  } catch (e: any) {
    console.error('[user_page_permissions DELETE]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
