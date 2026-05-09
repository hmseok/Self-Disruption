// ═══════════════════════════════════════════════════════════════════
// POST /factory-search/api/recommend
//   사고 컨텍스트 + 공장 매핑 + 거리 → 추천 공장 Top N
//   body: {
//     accident: {
//       address: string,           // esosaddr
//       lat?: number, lng?: number,
//       capitalKey?: string,       // axis 'capital' item.key (사고 고객사)
//       manageTypeKey?: string,    // axis 'manageType' item.key (상품)
//       vehicleKey?: string,       // axis 'vehicle' item.key (테슬라/외제 등)
//       accidentTypeKey?: string,  // axis 'accidentType' item.key (B/D/E/G/H/J/K/M/O/P/Q/S)
//       repairKeys?: string[],     // axis 'repair' item.key 배열 (battery/tire/...)
//     },
//     weights?: {
//       distance, capital, manageType, vehicle, accidentType, repair
//     },
//     limit?: number,
//   }
//   응답: { success, data: { factories: ScoredFactory[], summary } }
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import seed from '../../_data/factories.json'
import merged from '../../_data/factories-merged.json'

export const dynamic = 'force-dynamic'

const DEFAULT_WEIGHTS = {
  distance: 0.35,
  capital: 0.15,
  manageType: 0.15,
  vehicle: 0.10,
  accidentType: 0.10,
  repair: 0.15,
}

type Insurance = { mg: boolean | null; turnkey: boolean | null; meritz: boolean | null; autohands: boolean | null }
type FactoryFav = {
  placeId: string
  factcode: string
  name: string
  cleanName: string
  address: string
  insurance?: Insurance
  tags?: string[]
  groups?: string[]
  terminated?: boolean
  lat?: number
  lng?: number
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  try {
    const body = await request.json() as {
      accident: {
        address?: string
        lat?: number
        lng?: number
        capitalKey?: string
        manageTypeKey?: string
        vehicleKey?: string
        accidentTypeKey?: string
        repairKeys?: string[]
      }
      weights?: Partial<typeof DEFAULT_WEIGHTS>
      limit?: number
    }
    const { accident } = body
    const w = { ...DEFAULT_WEIGHTS, ...(body.weights || {}) }
    const limit = Math.max(1, Math.min(20, body.limit ?? 5))

    // ── 공장 후보 (좌표 등록 + 종료 X) ─────────────────
    const FAV_LIST = ((merged as { factories: FactoryFav[] }).factories || [])
      .filter(f => !f.terminated && typeof f.lat === 'number' && typeof f.lng === 'number')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SEED = (seed as any[]).filter(f => typeof f.lat === 'number' && typeof f.lng === 'number')
    const all = [...SEED, ...FAV_LIST]

    // ── 매핑 부여 데이터 (factory_classifications) 일괄 조회 ──
    // sql-lint-allow: factory_classifications/factcode/axis_key/item_key — Phase 5 마이그레이션 신규 테이블, prisma schema 미관리 (격리 영역 자체 운용)
    let mapping: Record<string, Record<string, Set<string>>> = {}
    try {
      const rows = await prisma.$queryRaw<{ factcode: string; axis_key: string; item_key: string }[]>`
        SELECT factcode, axis_key, item_key FROM factory_classifications
      `
      const grouped: Record<string, Record<string, Set<string>>> = {}
      for (const r of rows) {
        grouped[r.factcode] = grouped[r.factcode] || {}
        grouped[r.factcode][r.axis_key] = grouped[r.factcode][r.axis_key] || new Set()
        grouped[r.factcode][r.axis_key].add(r.item_key)
      }
      mapping = grouped
    } catch { /* 마이그레이션 미적용 — 빈 매핑 */ }

    // ── 점수 계산 ─────────────────────────────────────
    const origin = (typeof accident.lat === 'number' && typeof accident.lng === 'number')
      ? { lat: accident.lat, lng: accident.lng }
      : null

    // 거리 정규화 — 가장 먼 후보 기준 (또는 100km 캡)
    const MAX_KM = 100
    const scored = all.map(f => {
      const distanceKm = origin ? haversineKm(origin, { lat: f.lat as number, lng: f.lng as number }) : null
      const distanceScore = distanceKm === null ? 0 : Math.max(0, 1 - distanceKm / MAX_KM)

      const m = mapping[f.factcode] || {}
      const has = (axisKey: string, itemKey?: string) =>
        !!itemKey && (m[axisKey]?.has(itemKey) ?? false)
      const hasAny = (axisKey: string, itemKeys?: string[]) =>
        !!itemKeys && itemKeys.length > 0
        && itemKeys.some(k => m[axisKey]?.has(k))

      const sCapital      = has('capital',      accident.capitalKey)      ? 1 : 0
      const sManageType   = has('manageType',   accident.manageTypeKey)   ? 1 : 0
      const sVehicle      = has('vehicle',      accident.vehicleKey)      ? 1 : 0
      const sAccidentType = has('accidentType', accident.accidentTypeKey) ? 1 : 0
      // 정비 종류 — multi: 일치하는 항목 비율
      const repairTotal = accident.repairKeys?.length || 0
      const repairMatch = repairTotal === 0 ? 0
        : (accident.repairKeys || []).filter(k => m['repair']?.has(k)).length / repairTotal
      const sRepair = hasAny('repair', accident.repairKeys) ? repairMatch : 0

      const total =
          w.distance     * distanceScore
        + w.capital      * sCapital
        + w.manageType   * sManageType
        + w.vehicle      * sVehicle
        + w.accidentType * sAccidentType
        + w.repair       * sRepair

      return {
        factcode: f.factcode,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        factname: (f as any).factname ?? (f as any).name ?? '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        factaddr: (f as any).factaddr ?? (f as any).address ?? '',
        lat: f.lat,
        lng: f.lng,
        distanceKm,
        score: Number(total.toFixed(3)),
        breakdown: {
          distance:     Number((w.distance     * distanceScore).toFixed(3)),
          capital:      Number((w.capital      * sCapital).toFixed(3)),
          manageType:   Number((w.manageType   * sManageType).toFixed(3)),
          vehicle:      Number((w.vehicle      * sVehicle).toFixed(3)),
          accidentType: Number((w.accidentType * sAccidentType).toFixed(3)),
          repair:       Number((w.repair       * sRepair).toFixed(3)),
        },
        matched: {
          capital:      sCapital === 1,
          manageType:   sManageType === 1,
          vehicle:      sVehicle === 1,
          accidentType: sAccidentType === 1,
          repair:       sRepair > 0,
        },
      }
    })

    scored.sort((a, b) => b.score - a.score)

    return NextResponse.json({
      success: true,
      data: {
        factories: scored.slice(0, limit),
        summary: {
          totalCandidates: all.length,
          weights: w,
          mappingSize: Object.keys(mapping).length,
        },
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : 'recommend failed',
    }, { status: 500 })
  }
}
