/**
 * lib/quote-cost-data.ts — PR-Q2-2
 *
 * 견적 원가 산출용 14개 기준표 fetch + 메모리 캐시.
 * 서버사이드 전용 (prisma 직접 호출).
 *
 * 사용:
 *   import { loadCostReference } from '@/lib/quote-cost-data'
 *   const ref = await loadCostReference()
 *   const result = calculateQuoteCost({ ... }, ref)
 *
 * 캐시:
 *   - 메모리 in-process 캐시 (Cloud Run 인스턴스 단위)
 *   - 5분 TTL (기준표 변경 즉시 반영 vs 부하 균형)
 *   - invalidateCostReference() 로 강제 무효화 가능
 *
 * 14개 테이블 (rent-calc-engine 의 CalcInput.reference 와 동일):
 *   business_rules + depreciation(3) + tax/registration + inspection(2) +
 *   insurance(3) + finance(1) + maintenance(1)
 */

import { prisma } from './prisma'

export interface CostReference {
  rules: Record<string, number>          // business_rules key=value
  dep_rates: any[]
  dep_adjustments: any[]
  dep_db: any[]
  tax_rates: any[]
  reg_costs: any[]
  inspection_costs: any[]
  inspection_schedules: any[]
  ins_base_premiums: any[]
  ins_own_rates: any[]
  insurance_rates: any[]
  finance_rates: any[]
  maintenance_costs: any[]
  loaded_at: number                       // Date.now()
}

// ── 메모리 캐시 ──────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000  // 5분
let _cache: CostReference | null = null

function isCacheValid(c: CostReference | null): c is CostReference {
  return !!c && (Date.now() - c.loaded_at) < CACHE_TTL_MS
}

export function invalidateCostReference(): void {
  _cache = null
}

// ── 안전 fetch (실패 시 빈 배열 fallback) ────────────────
async function safeRaw<T = any>(sql: string): Promise<T[]> {
  try {
    return await prisma.$queryRawUnsafe<T[]>(sql)
  } catch (e) {
    console.warn('[quote-cost-data] table missing:', sql.slice(0, 80), (e as Error)?.message?.slice(0, 100))
    return []
  }
}

// ── 메인 ──────────────────────────────────────────────
export async function loadCostReference(force = false): Promise<CostReference> {
  if (!force && isCacheValid(_cache)) return _cache

  const [
    rulesRows, depR, depA, depD, tax, reg, inspC, inspS, insB, insO, insR, fin, maint,
  ] = await Promise.all([
    safeRaw('SELECT `key`, value FROM business_rules'),
    safeRaw('SELECT * FROM depreciation_rates'),
    safeRaw('SELECT * FROM depreciation_adjustments'),
    safeRaw('SELECT * FROM depreciation_db'),
    safeRaw('SELECT * FROM vehicle_tax_table'),
    safeRaw('SELECT * FROM registration_cost_table'),
    safeRaw('SELECT * FROM inspection_cost_table'),
    safeRaw('SELECT * FROM inspection_schedule_table'),
    safeRaw('SELECT * FROM insurance_base_premium'),
    safeRaw('SELECT * FROM insurance_own_vehicle_rate'),
    safeRaw('SELECT * FROM insurance_rate_table'),
    safeRaw('SELECT * FROM finance_rate_table'),
    safeRaw('SELECT * FROM maintenance_cost_table'),
  ])

  // BigInt → Number 안전 변환 (PR-Q1 hotfix 동일 패턴)
  const sanitize = (arr: any[]) =>
    JSON.parse(JSON.stringify(arr, (_, v) => (typeof v === 'bigint' ? Number(v) : v)))

  const rulesMap: Record<string, number> = {}
  for (const r of (rulesRows as any[])) {
    const k = r.key || r.Key
    const v = Number(r.value || r.Value)
    if (k && Number.isFinite(v)) rulesMap[String(k)] = v
  }

  _cache = {
    rules: rulesMap,
    dep_rates: sanitize(depR),
    dep_adjustments: sanitize(depA),
    dep_db: sanitize(depD),
    tax_rates: sanitize(tax),
    reg_costs: sanitize(reg),
    inspection_costs: sanitize(inspC),
    inspection_schedules: sanitize(inspS),
    ins_base_premiums: sanitize(insB),
    ins_own_rates: sanitize(insO),
    insurance_rates: sanitize(insR),
    finance_rates: sanitize(fin),
    maintenance_costs: sanitize(maint),
    loaded_at: Date.now(),
  }
  return _cache
}

// ── 진단용 (smoke test / API 검증) ─────────────────────
export function describeCostReference(ref: CostReference): Record<string, number | string> {
  return {
    rules: Object.keys(ref.rules).length,
    dep_rates: ref.dep_rates.length,
    dep_adjustments: ref.dep_adjustments.length,
    dep_db: ref.dep_db.length,
    tax_rates: ref.tax_rates.length,
    reg_costs: ref.reg_costs.length,
    inspection_costs: ref.inspection_costs.length,
    inspection_schedules: ref.inspection_schedules.length,
    ins_base_premiums: ref.ins_base_premiums.length,
    ins_own_rates: ref.ins_own_rates.length,
    insurance_rates: ref.insurance_rates.length,
    finance_rates: ref.finance_rates.length,
    maintenance_costs: ref.maintenance_costs.length,
    loaded_at_iso: new Date(ref.loaded_at).toISOString(),
    cache_age_sec: Math.round((Date.now() - ref.loaded_at) / 1000),
  }
}
