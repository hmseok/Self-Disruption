/**
 * 운영학습 (Operational Learning) 공통 헬퍼
 * - DB row ↔ CalcSnapshot 변환
 * - 실적 데이터 집계 유틸
 */

import type { CalcSnapshot, CalcResult } from './rent-calc-engine'

// ────────────────────────────────────────────────────────────────
// DB row 타입 (calc_snapshots 테이블)
// ────────────────────────────────────────────────────────────────
export interface CalcSnapshotRow {
  id: string
  quote_id: string
  vehicle_id: string | null
  contract_id: string | null
  purchase_price: number | bigint
  term_months: number
  contract_type: 'return' | 'buyout' | null
  annual_mileage: number | null
  loan_rate: number | string | null
  vehicle_class: string | null
  predicted_depreciation: number | bigint | null
  predicted_insurance: number | bigint | null
  predicted_maintenance: number | bigint | null
  predicted_tax: number | bigint | null
  predicted_accident_cost: number | bigint | null
  predicted_overhead: number | bigint | null
  predicted_margin: number | bigint | null
  predicted_rent: number | bigint | null
  result_json: string | null
  snapshot_date: Date | string
  created_at: Date | string
}

// ────────────────────────────────────────────────────────────────
// operational_actuals 테이블 row
// ────────────────────────────────────────────────────────────────
export interface ActualRow {
  id: string
  snapshot_id: string | null
  contract_id: string | null
  recorded_month: string
  actual_depreciation: number | bigint | null
  actual_insurance: number | bigint | null
  actual_maintenance: number | bigint | null
  actual_tax: number | bigint | null
  actual_accident_cost: number | bigint | null
  source: string
  notes: string | null
  created_at: Date | string
  updated_at: Date | string
}

// ────────────────────────────────────────────────────────────────
// 변환: DB row → 엔진의 CalcSnapshot (suggestBusinessRules 호출용)
// ────────────────────────────────────────────────────────────────
export function rowToCalcSnapshot(row: CalcSnapshotRow): CalcSnapshot | null {
  if (!row.result_json) return null
  let result: CalcResult
  try {
    result = JSON.parse(row.result_json)
  } catch {
    return null
  }
  return {
    quote_id: row.quote_id,
    vehicle_id: row.vehicle_id || '',
    created_at: typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString(),
    input_hash: row.id,
    result,
    input_summary: {
      purchase_price: Number(row.purchase_price),
      term_months: Number(row.term_months),
      contract_type: (row.contract_type || 'return') as 'return' | 'buyout',
      annual_mileage: Number(row.annual_mileage || 20000),
      loan_rate: Number(row.loan_rate || 0),
      vehicle_class: row.vehicle_class || 'auto',
    },
  }
}

// ────────────────────────────────────────────────────────────────
// 실적 평균 계산 (여러 월 → 평균값)
// ────────────────────────────────────────────────────────────────
export function averageActuals(rows: ActualRow[]): {
  depreciation?: number
  insurance?: number
  maintenance?: number
  tax?: number
  accident_cost?: number
} {
  if (rows.length === 0) return {}

  const sum = (key: keyof ActualRow): number => {
    const vals = rows
      .map(r => (r[key] !== null && r[key] !== undefined ? Number(r[key]) : null))
      .filter((v): v is number => v !== null && !isNaN(v))
    if (vals.length === 0) return NaN
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  const out: any = {}
  const dep = sum('actual_depreciation'); if (!isNaN(dep)) out.depreciation = dep
  const ins = sum('actual_insurance'); if (!isNaN(ins)) out.insurance = ins
  const mnt = sum('actual_maintenance'); if (!isNaN(mnt)) out.maintenance = mnt
  const tax = sum('actual_tax'); if (!isNaN(tax)) out.tax = tax
  const acc = sum('actual_accident_cost'); if (!isNaN(acc)) out.accident_cost = acc
  return out
}

// ────────────────────────────────────────────────────────────────
// BigInt 안전 직렬화 (prisma raw 결과용)
// ────────────────────────────────────────────────────────────────
export function serialize<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_, v) => {
      if (typeof v === 'bigint') return v.toString()
      if (v instanceof Date) return v.toISOString()
      return v
    })
  )
}

// ────────────────────────────────────────────────────────────────
// YYYY-MM 월 범위 생성 (예: "2026-01" → "2026-06" 까지의 배열)
// ────────────────────────────────────────────────────────────────
export function monthRange(fromMonth: string, toMonth: string): string[] {
  const [fy, fm] = fromMonth.split('-').map(Number)
  const [ty, tm] = toMonth.split('-').map(Number)
  const out: string[] = []
  let y = fy, m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}
