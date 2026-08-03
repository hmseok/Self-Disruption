import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════════
// 배차 차량 소속(운영 구분) 판정 — 단일 기준: 차량 마스터 cars.ownership_type
//   '빌려타'  → ride (라이드 소유 지입 — 입금은 라이드 월 정산)
//   'company' → own  (FMI 직접운영 — 입금은 우리 통장)
//   미등록    → unknown
//
// 2026-08-02 사용자 확정: 구분 기준은 차량 마스터에서 직접 지정·관리.
// fmi_rentals.fleet_group 은 시트 동기화가 일괄 '빌려타'로 넣어 신뢰 불가 — 쓰지 않는다.
// 번호판 하/허 오기 사례(125하2050 vs 125허2050)가 있어 숫자만으로 대조한다.
// ═══════════════════════════════════════════════════════════════════

export type VehicleClass = 'ride' | 'own' | 'unknown'

const digits = (s: unknown) => String(s || '').replace(/[^0-9]/g, '')

/** 차량번호(숫자 키) → 소속 매핑 로드. 호출측에서 요청당 1회 로드해 재사용. */
export async function loadVehicleClassMap(): Promise<Map<string, VehicleClass>> {
  const map = new Map<string, VehicleClass>()
  try {
    const cars = await prisma.$queryRaw<Array<{ number: string | null; ownership_type: string | null }>>`
      SELECT number, ownership_type FROM cars WHERE number IS NOT NULL`
    for (const c of cars) {
      const key = digits(c.number)
      if (!key) continue
      map.set(key, c.ownership_type === '빌려타' ? 'ride' : c.ownership_type === 'company' ? 'own' : 'unknown')
    }
  } catch { /* cars 조회 실패 — 전건 unknown */ }
  return map
}

export function classifyVehicle(map: Map<string, VehicleClass>, carNumber: unknown): VehicleClass {
  return map.get(digits(carNumber)) ?? 'unknown'
}
