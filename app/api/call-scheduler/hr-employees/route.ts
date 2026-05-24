// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/hr-employees — 인사마스터(라이드 직원) 조회
//   Phase WHR-A (2026-05-24) — 워커 ↔ 인사마스터 연동
//   WHR-A-fix (2026-05-24) — 인사마스터 = ride_employees (profiles 아님).
//     CallScheduler 워커의 인사 출처는 ride_employees(콜센터 직원).
//     cs_workers.employee_id → ride_employees.id 가 정식 연결.
//   직원 선택 모달이 사용: 워커 생성/연결 시 후보 직원 표시.
//   정렬: 콜센터 우선 → 이름순. 부서 하드 필터 X (프론트 검색/필터).
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    // 1) 인사마스터(라이드 직원) — 재직자만. 콜센터 우선 정렬.
    const employees = await prisma.$queryRaw<any[]>`
      SELECT id, name, phone, department, position
      FROM ride_employees
      WHERE is_active = 1
      ORDER BY (department = '콜센터') DESC, name ASC
    `

    // 2) cs_workers 가 이미 사용 중인 employee_id 집합 (graceful)
    const linked = new Set<string>()
    try {
      const linkedRows = await prisma.$queryRaw<any[]>`
        SELECT DISTINCT employee_id
        FROM cs_workers
        WHERE employee_id IS NOT NULL AND is_active = 1
      `
      for (const r of linkedRows) {
        if (r.employee_id) linked.add(String(r.employee_id))
      }
    } catch { /* graceful — employee_id 컬럼 없을 때 */ }

    const data = employees.map(e => ({
      id: e.id,
      name: e.name ?? '',
      phone: e.phone ?? null,
      department: e.department ?? null,
      position: e.position ?? null,
      already_linked: linked.has(String(e.id)),
    }))

    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
