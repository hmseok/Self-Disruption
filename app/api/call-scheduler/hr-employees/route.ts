// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/hr-employees — 인사마스터 직원 조회
//   Phase WHR-A (2026-05-24) — 워커 ↔ 인사마스터 연동
//   profiles(is_active=1) 직원 목록 + cs_workers.profile_id 사용 여부.
//   직원 선택 모달이 사용: 워커 생성/연결 시 후보 직원 표시.
//   정렬: CX팀 우선 → 이름순. 부서 하드 필터 X (프론트 검색/필터).
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
    // 1) 인사마스터 직원 (재직자만)
    const profiles = await prisma.$queryRaw<any[]>`
      SELECT id, name, phone, department, position
      FROM profiles
      WHERE is_active = 1
      ORDER BY (department = 'CX팀') DESC, name ASC
    `

    // 2) cs_workers 가 이미 사용 중인 profile_id 집합 (graceful)
    const linked = new Set<string>()
    try {
      const linkedRows = await prisma.$queryRaw<any[]>`
        SELECT DISTINCT profile_id
        FROM cs_workers
        WHERE profile_id IS NOT NULL AND is_active = 1
      `
      for (const r of linkedRows) {
        if (r.profile_id) linked.add(String(r.profile_id))
      }
    } catch { /* graceful — profile_id 컬럼 없을 때 */ }

    const data = profiles.map(p => ({
      id: p.id,
      name: p.name ?? '',
      phone: p.phone ?? null,
      department: p.department ?? null,
      position: p.position ?? null,
      already_linked: linked.has(String(p.id)),
    }))

    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
