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

// GET /api/profiles — 프로필 목록 (단독 ERP: company_id 불필요)
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const isActive = searchParams.get('is_active')

    // profiles 기본 SELECT + positions/departments LEFT JOIN
    // UI는 emp.position?.name / emp.department?.name 형태를 기대하므로 서브오브젝트로 감싼다.
    const conditions: string[] = []
    if (isActive === 'true') conditions.push('p.is_active = 1')
    else if (isActive === 'false') conditions.push('p.is_active = 0')
    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // JOIN 쿼리 시도 (타임아웃 포함)
    //   PR-HR-7 (2026-05-26) — LEFT JOIN companies 추가, company_key 노출.
    //     메인 PR-MULTI-BRAND P3+b 의존 — getSoSokType 가 dept.name 문자열 매칭
    //     ('라이드' / '라이드주식회사') 대신 company_key === 'RIDE' 로 분기.
    //     graceful fallback (Rule 23): companies 컬럼 미적용 시 JOIN 자체 실패 →
    //     아래 SELECT * 폴백 (company_key 없음, page.tsx 가 FMI 디폴트 처리).
    let data = await withTimeout(prisma.$queryRawUnsafe<any[]>(`
      SELECT p.*,
             pos.id   AS _pos_id,   pos.name   AS _pos_name,   pos.level AS _pos_level,
             dept.id  AS _dept_id,  dept.name  AS _dept_name,
             c.id     AS _company_id, c.company_key AS _company_key, c.name AS _company_name
      FROM profiles p
      LEFT JOIN positions   pos  ON p.position_id   = pos.id
      LEFT JOIN departments dept ON p.department_id = dept.id
      LEFT JOIN companies   c    ON c.id            = p.company_id
      ${whereSql}
      ORDER BY COALESCE(p.employee_name, p.name, p.email)
    `))

    // JOIN 실패 시 기본 SELECT 폴백 (타임아웃 포함)
    if (data === null) {
      console.warn('[profiles] JOIN 실패 또는 타임아웃, 기본 SELECT 폴백 시도')
      const fallbackSql = `SELECT * FROM profiles ${whereSql.replace(/\bp\./g,'')} ORDER BY COALESCE(employee_name, name, email)`
      data = await withTimeout(prisma.$queryRawUnsafe<any[]>(fallbackSql))
    }

    // 폴백도 실패 시 빈 배열 반환
    if (data === null) {
      console.warn('[profiles] DB 완전 실패 — 빈 배열 반환')
      return NextResponse.json({ data: [], error: null })
    }

    const mapped = (data || []).map((p: any) => {
      // display_name: 화면 표시용 (폴백 포함)
      // employee_name: DB 원본 값 유지 (편집 시 실제 이름 vs 폴백 구분용)
      const rawName = p.employee_name || p.name || null
      const displayName = rawName || (p.email ? String(p.email).split('@')[0] : '(이름 미설정)')
      const position = p._pos_id ? { id: p._pos_id, name: p._pos_name, level: p._pos_level } : null
      const department = p._dept_id ? { id: p._dept_id, name: p._dept_name } : null
      // PR-HR-7 — companies 객체 + company_key 평탄화 (page.tsx getSoSokType 편의)
      const company = p._company_id ? { id: p._company_id, key: p._company_key, name: p._company_name } : null
      // 언더스코어 임시 필드 제거
      const { _pos_id, _pos_name, _pos_level, _dept_id, _dept_name, _company_id, _company_key, _company_name, ...rest } = p
      return {
        ...rest,
        employee_name: rawName,
        display_name: displayName,
        position,
        department,
        company,
        company_key: p._company_key || null,  // PR-HR-7 평탄화 — getSoSokType 직접 분기
      }
    })
    return NextResponse.json({ data: serialize(mapped), error: null })
  } catch (e: any) {
    console.error('[profiles GET] 예외:', e.message)
    return NextResponse.json({ data: [], error: null })
  }
}

// POST /api/profiles
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = crypto.randomUUID()

    const fields = ['email', 'name', 'phone', 'position', 'department', 'role', 'is_active']
    const cols = ['id', ...fields.filter(f => body[f] !== undefined)]
    const vals = [id, ...fields.filter(f => body[f] !== undefined).map(f => body[f] ?? null)]

    await prisma.$executeRawUnsafe(
      `INSERT INTO profiles (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, NOW(), NOW())`,
      ...vals
    )

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM profiles WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
