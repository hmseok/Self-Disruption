import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// DB 타임아웃 래퍼: DB 오류 또는 타임아웃 시 null 반환
const withTimeout = <T>(promise: Promise<T>, ms = 5000): Promise<T | null> =>
  Promise.race([
    promise.catch(() => null),
    new Promise<null>(r => setTimeout(() => r(null), ms))
  ])

// ─── 평면 → 트리 변환 (재귀 build) ──────────────────────────────
function buildTree(rows: any[]): any[] {
  const map = new Map<string, any>()
  const roots: any[] = []
  for (const r of rows) {
    map.set(r.id, { ...r, children: [] })
  }
  for (const r of rows) {
    const node = map.get(r.id)
    if (r.parent_id && map.has(r.parent_id)) {
      map.get(r.parent_id).children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

// GET /api/departments
// PR-HR-23d (2026-05-29) — ?tree=1 / ?company_key= 옵션 + graceful fallback
//   parent_id 컬럼 미적용 시 평면 응답 + _migration_pending: true (Rule 23)
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const companyId = searchParams.get('company_id')
    const companyKey = searchParams.get('company_key')
    const treeMode = searchParams.get('tree') === '1'

    // PR-HR-23d — parent_id 컬럼 존재 여부 확인 (graceful)
    const colCheck = await withTimeout(
      prisma.$queryRaw<any[]>`
        SELECT COUNT(*) AS cnt FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'departments'
          AND column_name = 'parent_id'
      `
    )
    const hasParentId = !!(colCheck && Number(colCheck[0]?.cnt || 0) > 0)

    // company_key → company_id 변환 (선택)
    let resolvedCompanyId = companyId
    if (!resolvedCompanyId && companyKey) {
      const cRows = await withTimeout(
        prisma.$queryRaw<any[]>`SELECT id FROM companies WHERE company_key = ${companyKey} LIMIT 1`
      )
      resolvedCompanyId = cRows?.[0]?.id || null
    }

    // SELECT 쿼리 — parent_id 있으면 포함
    const selectCols = hasParentId
      ? 'id, name, parent_id, color_tone, sort_order, company_id, created_at, updated_at'
      : 'id, name, company_id, created_at, updated_at'

    let query = `SELECT ${selectCols} FROM departments`
    const params: any[] = []

    if (resolvedCompanyId) {
      query += ' WHERE company_id = ?'
      params.push(resolvedCompanyId)
    }

    query += hasParentId
      ? ' ORDER BY sort_order ASC, created_at ASC'
      : ' ORDER BY created_at DESC'

    const rawData = await withTimeout(prisma.$queryRawUnsafe<any[]>(query, ...params))

    if (rawData === null) {
      console.warn('[departments GET] DB 조회 실패 또는 타임아웃 — 빈 배열 반환')
      return NextResponse.json({ data: [], error: null, _migration_pending: !hasParentId })
    }

    const data = serialize(rawData)

    // ?tree=1 + parent_id 있음 → 재귀 트리 변환
    if (treeMode && hasParentId) {
      return NextResponse.json({ data: buildTree(data), error: null, _migration_pending: false })
    }

    // ?tree=1 인데 parent_id 없음 → graceful: 평면 응답 + _migration_pending
    if (treeMode && !hasParentId) {
      return NextResponse.json({
        data: data.map((r: any) => ({ ...r, parent_id: null, children: [] })),
        error: null,
        _migration_pending: true,
      })
    }

    // 일반 평면 응답
    return NextResponse.json({ data, error: null, _migration_pending: !hasParentId })
  } catch (e: any) {
    console.error('[departments GET] 예외:', e.message)
    return NextResponse.json({ data: [], error: null, _migration_pending: true })
  }
}

// POST /api/departments
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = crypto.randomUUID()
    const name = body.name || ''
    const parentId = body.parent_id || null
    const colorTone = body.color_tone || null
    const sortOrder = Number(body.sort_order || 0)

    // PR-HR-23d — parent_id 컬럼 있는지 확인 후 분기
    const colCheck = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) AS cnt FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'departments'
        AND column_name = 'parent_id'
    `
    const hasParentId = Number(colCheck?.[0]?.cnt || 0) > 0

    if (hasParentId) {
      await prisma.$executeRaw`
        INSERT INTO departments (id, name, parent_id, color_tone, sort_order, created_at, updated_at)
        VALUES (${id}, ${name}, ${parentId}, ${colorTone}, ${sortOrder}, NOW(), NOW())
      `
    } else {
      // graceful fallback — parent_id 컬럼 없을 때 기존 패턴
      await prisma.$executeRaw`
        INSERT INTO departments (id, name, created_at, updated_at)
        VALUES (${id}, ${name}, NOW(), NOW())
      `
    }

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM departments WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
