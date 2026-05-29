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

// ─── 컬럼 존재 여부 헬퍼 ─────────────────────────────────────────
async function hasColumn(table: string, column: string): Promise<boolean> {
  const rows = await withTimeout(
    prisma.$queryRaw<any[]>`
      SELECT COUNT(*) AS cnt FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ${table}
        AND column_name = ${column}
    `
  )
  return !!(rows && Number(rows[0]?.cnt || 0) > 0)
}

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
// PR-HR-23d hotfix (2026-05-29) — departments.company_id 컬럼 미존재 대응:
//   사용자 진단 결과 (5/29 21:12): Error 1054 Unknown column 'd.company_id'.
//   → departments 가 multi-tenancy 마이그 안 됨 (단일 회사 시대 그대로).
//   → company_id 컬럼 존재 체크 후 SELECT/WHERE 분기 (Rule 23 graceful + Rule 13 호환성).
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const companyId = searchParams.get('company_id')
    const companyKey = searchParams.get('company_key')
    const treeMode = searchParams.get('tree') === '1'

    // 컬럼 존재 확인 — parent_id (PR-HR-23d 마이그) + company_id (multi-tenancy)
    const [hasParentId, hasCompanyId, hasColorTone, hasSortOrder] = await Promise.all([
      hasColumn('departments', 'parent_id'),
      hasColumn('departments', 'company_id'),
      hasColumn('departments', 'color_tone'),
      hasColumn('departments', 'sort_order'),
    ])

    // company_key → company_id 변환 (company_id 컬럼 있을 때만 의미)
    let resolvedCompanyId: string | null = companyId
    if (!resolvedCompanyId && companyKey && hasCompanyId) {
      const cRows = await withTimeout(
        prisma.$queryRaw<any[]>`SELECT id FROM companies WHERE company_key = ${companyKey} LIMIT 1`
      )
      resolvedCompanyId = cRows?.[0]?.id || null
    }

    // SELECT 컬럼 동적 build (존재하는 컬럼만)
    const cols = ['id', 'name']
    if (hasParentId) cols.push('parent_id')
    if (hasColorTone) cols.push('color_tone')
    if (hasSortOrder) cols.push('sort_order')
    if (hasCompanyId) cols.push('company_id')
    cols.push('created_at', 'updated_at')

    let query = `SELECT ${cols.join(', ')} FROM departments`
    const params: any[] = []

    // WHERE company_id — 컬럼 존재 + companyId resolve 됐을 때만
    if (resolvedCompanyId && hasCompanyId) {
      query += ' WHERE company_id = ?'
      params.push(resolvedCompanyId)
    }
    // company_id 컬럼 없으면 단일 회사 가정 — 모든 부서 반환 (graceful fallback)
    // → 사용자가 FMI 토글이어도 모든 departments 보임 (multi-tenancy 마이그 전까지)

    query += hasParentId
      ? ' ORDER BY sort_order ASC, created_at ASC'
      : ' ORDER BY created_at DESC'

    const rawData = await withTimeout(prisma.$queryRawUnsafe<any[]>(query, ...params))

    if (rawData === null) {
      console.warn('[departments GET] DB 조회 실패 또는 타임아웃 — 빈 배열 반환')
      return NextResponse.json({
        data: [],
        error: null,
        _migration_pending: !hasParentId,
        _multi_tenancy_pending: !hasCompanyId,
      })
    }

    const data = serialize(rawData)

    // ?tree=1 + parent_id 있음 → 재귀 트리 변환
    if (treeMode && hasParentId) {
      return NextResponse.json({
        data: buildTree(data),
        error: null,
        _migration_pending: false,
        _multi_tenancy_pending: !hasCompanyId,
      })
    }

    // ?tree=1 인데 parent_id 없음 → graceful: 평면 응답 + _migration_pending
    if (treeMode && !hasParentId) {
      return NextResponse.json({
        data: data.map((r: any) => ({ ...r, parent_id: null, children: [] })),
        error: null,
        _migration_pending: true,
        _multi_tenancy_pending: !hasCompanyId,
      })
    }

    // 일반 평면 응답
    return NextResponse.json({
      data,
      error: null,
      _migration_pending: !hasParentId,
      _multi_tenancy_pending: !hasCompanyId,
    })
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

    // 컬럼 존재 확인 후 INSERT 컬럼 분기
    const [hasParentId, hasCompanyId, hasColorTone, hasSortOrder] = await Promise.all([
      hasColumn('departments', 'parent_id'),
      hasColumn('departments', 'company_id'),
      hasColumn('departments', 'color_tone'),
      hasColumn('departments', 'sort_order'),
    ])

    if (hasParentId && hasColorTone && hasSortOrder) {
      await prisma.$executeRaw`
        INSERT INTO departments (id, name, parent_id, color_tone, sort_order, created_at, updated_at)
        VALUES (${id}, ${name}, ${parentId}, ${colorTone}, ${sortOrder}, NOW(), NOW())
      `
    } else {
      // graceful fallback — 옛 단순 INSERT
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
