'use client'

/**
 * 심플 견적 작성 페이지 (유일한 견적 작성 UI)
 *  - 8개 필드만 입력 → 실시간 월 렌트료 산출 → 1클릭 저장 + 상세 이동
 *  - 저장 시 operational-learning snapshot 자동 훅
 *  - 편집 모드: ?quote_id=... 쿼리로 진입 시 기존 견적 로드 후 PATCH
 *  - 사전선택: ?car_id=... 쿼리로 진입 시 차량 자동선택
 *  - 소프트아이스 Level 4 + 색상 틴트 Level 3
 */

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { calculateRentCost, type CalcInput, type CalcResult } from '@/lib/rent-calc-engine'

// ─── 유틸 ──────────────────────────────────────────────────
async function getAuth(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {}
  const token = window.localStorage.getItem('fmi_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiGet(path: string): Promise<any> {
  const h = await getAuth()
  const res = await fetch(path, { headers: h })
  if (!res.ok) return { data: [] }
  return res.json()
}

// ─── 폼 상태 ───────────────────────────────────────────────
type MaintenancePackage = 'self' | 'basic' | 'standard' | 'premium'
type DriverAge = '만21세미만' | '만21세이상' | '만23세이상' | '만26세이상'

interface Form {
  carId: string
  brand: string
  model: string
  purchasePrice: number
  year: number
  fuel: string
  termMonths: number
  annualMileage: number          // 만km
  contractType: 'return' | 'buyout'
  // #39 Phase 1c 신규 필드
  presetId: string               // sales_presets.id ("" = 표준 기본)
  maintenancePackage: MaintenancePackage
  driverAge: DriverAge
  depositAmount: number          // 원
  prepaymentAmount: number       // 원
  customerName: string
  customerPhone: string
}

const DEFAULT_FORM: Form = {
  carId: '',
  brand: '',
  model: '',
  purchasePrice: 0,
  year: new Date().getFullYear(),
  fuel: '가솔린',
  termMonths: 36,
  annualMileage: 2,
  contractType: 'return',
  presetId: '',
  maintenancePackage: 'basic',
  driverAge: '만26세이상',
  depositAmount: 0,
  prepaymentAmount: 0,
  customerName: '',
  customerPhone: '',
}

// ─── Ref 테이블 로드 ───────────────────────────────────────
interface SalesPreset {
  id: string
  name: string
  label: string
  is_default: number | boolean
  loan_interest_rate: number | null
  margin_rate: number | null
  overhead_rate: number | null
  risk_reserve_rate: number | null
  deposit_discount_rate: number | null
  prepayment_discount_rate: number | null
  default_deposit: number | null
  sort_order: number
}

interface RefTables {
  ready: boolean
  rules: Record<string, number>
  cars: any[]
  depRates: any[]
  depAdj: any[]
  depDb: any[]
  ins: any[]
  maint: any[]
  tax: any[]
  fin: any[]
  reg: any[]
  inspC: any[]
  inspS: any[]
  insBase: any[]
  insOwn: any[]
  vmp: any[]
  presets: SalesPreset[]
}

// 프리셋 → 숫자 안전 변환 (DECIMAL 컬럼은 문자열로 오므로 Number 캐스팅)
function normalizePreset(raw: any): SalesPreset {
  const num = (v: any) => (v == null ? null : Number(v))
  return {
    id: String(raw.id),
    name: String(raw.name || ''),
    label: String(raw.label || raw.name || ''),
    is_default: !!raw.is_default,
    loan_interest_rate: num(raw.loan_interest_rate),
    margin_rate: num(raw.margin_rate),
    overhead_rate: num(raw.overhead_rate),
    risk_reserve_rate: num(raw.risk_reserve_rate),
    deposit_discount_rate: num(raw.deposit_discount_rate),
    prepayment_discount_rate: num(raw.prepayment_discount_rate),
    default_deposit: num(raw.default_deposit),
    sort_order: Number(raw.sort_order ?? 0),
  }
}

function useRefTables(): RefTables & { error: string | null } {
  const [state, setState] = useState<RefTables>({
    ready: false, rules: {}, cars: [], depRates: [], depAdj: [], depDb: [],
    ins: [], maint: [], tax: [], fin: [], reg: [], inspC: [], inspS: [],
    insBase: [], insOwn: [], vmp: [], presets: [],
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [rules, cars, depRates, depAdj, depDb, ins, maint, tax, fin, reg, inspC, inspS, insBase, insOwn, vmp, presets] = await Promise.all([
          apiGet('/api/business-rules'),
          apiGet('/api/cars'),
          apiGet('/api/pricing-standards?table=depreciation_rates'),
          apiGet('/api/pricing-standards?table=depreciation_adjustments'),
          apiGet('/api/pricing-standards?table=depreciation_db'),
          apiGet('/api/pricing-standards?table=insurance_rate_table'),
          apiGet('/api/pricing-standards?table=maintenance_cost_table'),
          apiGet('/api/pricing-standards?table=vehicle_tax_table'),
          apiGet('/api/pricing-standards?table=finance_rate_table'),
          apiGet('/api/pricing-standards?table=registration_cost_table'),
          apiGet('/api/pricing-standards?table=inspection_cost_table'),
          apiGet('/api/pricing-standards?table=inspection_schedule_table'),
          apiGet('/api/pricing-standards?table=insurance_base_premium'),
          apiGet('/api/pricing-standards?table=insurance_own_vehicle_rate'),
          apiGet('/api/pricing-standards?table=vehicle_market_price'),
          apiGet('/api/pricing-standards?table=sales_presets'),
        ])

        const ruleMap: Record<string, number> = {}
        for (const r of rules.data || []) {
          let v = r.value
          if (typeof v === 'string') { try { v = JSON.parse(v) } catch {} }
          if (typeof v === 'number') ruleMap[r.key] = v
          else if (typeof v === 'string' && !isNaN(Number(v))) ruleMap[r.key] = Number(v)
        }

        setState({
          ready: true,
          rules: ruleMap,
          cars: cars.data || [],
          depRates: depRates.data || [],
          depAdj: depAdj.data || [],
          depDb: depDb.data || [],
          ins: ins.data || [],
          maint: maint.data || [],
          tax: tax.data || [],
          fin: fin.data || [],
          reg: reg.data || [],
          inspC: inspC.data || [],
          inspS: inspS.data || [],
          insBase: insBase.data || [],
          insOwn: insOwn.data || [],
          vmp: vmp.data || [],
          presets: (presets.data || []).map(normalizePreset),
        })
      } catch (e: any) {
        setError(e?.message || '기준표 로딩 실패')
      }
    })()
  }, [])

  return { ...state, error }
}

// ─── CalcInput 빌더 ────────────────────────────────────────
//
// 프리셋/business_rules/보유차 데이터를 읽어 하드코딩 없이 엔진 입력을 구성한다.
//  - 프리셋 값이 있으면 우선 적용 (NULL이면 business_rules 폴백)
//  - 보유차 선택 시 cars.year / cars.mileage 기반으로 연식 자동 판별
//  - 신차 카탈로그 조회 시 vehicle_market_price에서 엔진 CC 보정
function pickPreset(f: Form, r: RefTables): SalesPreset | null {
  if (f.presetId) {
    const found = r.presets.find((p) => p.id === f.presetId)
    if (found) return found
  }
  return r.presets.find((p) => p.is_default) || r.presets[0] || null
}

// 프리셋 > business_rules 폴백 — 값은 % 단위 숫자 (소수 아님)
function resolveOverhead(f: Form, r: RefTables): number {
  const preset = pickPreset(f, r)
  if (preset?.overhead_rate != null) return preset.overhead_rate
  const R = r.rules
  return R.OVERHEAD_RATE && R.OVERHEAD_RATE < 1 ? R.OVERHEAD_RATE * 100 : (R.OVERHEAD_RATE || 8)
}

function resolveMargin(f: Form, r: RefTables): number {
  const preset = pickPreset(f, r)
  if (preset?.margin_rate != null) return preset.margin_rate
  return r.rules.DEFAULT_MARGIN_RATE || 10
}

function resolveRiskRate(f: Form, r: RefTables): number {
  const preset = pickPreset(f, r)
  if (preset?.risk_reserve_rate != null) return preset.risk_reserve_rate
  const v = r.rules.RISK_RESERVE_RATE
  return v && v < 1 ? v * 100 : (v || 2)
}

function resolveLoanRate(f: Form, r: RefTables): number {
  const preset = pickPreset(f, r)
  if (preset?.loan_interest_rate != null) return preset.loan_interest_rate
  return r.rules.LOAN_INTEREST_RATE || 5.5
}

function resolveResidualRate(f: Form, r: RefTables): number {
  return f.contractType === 'buyout'
    ? (r.rules.DEFAULT_RESIDUAL_RATE_BUYOUT ?? 30)
    : (r.rules.DEFAULT_RESIDUAL_RATE_RETURN ?? 0)
}

// 보유차 선택 시 연식 자동 판별
function computeCarAge(f: Form, r: RefTables): { mode: 'new' | 'used'; age: number; mileage: number } {
  if (!f.carId) return { mode: 'new', age: 0, mileage: 0 }
  const car = r.cars.find((c: any) => String(c.id) === f.carId)
  if (!car) return { mode: 'new', age: 0, mileage: 0 }
  const currentYear = new Date().getFullYear()
  const carYear = Number(car.year) || currentYear
  const age = Math.max(0, currentYear - carYear)
  const mileage = Number(car.mileage || car.total_mileage || 0)
  return { mode: age > 0 ? 'used' : 'new', age, mileage }
}

// 엔진 CC — 신차 카탈로그 우선, 없으면 2000 폴백, 전기/하이브리드는 0
function resolveEngineCC(f: Form, r: RefTables): number {
  if (f.fuel === '전기') return 0
  // 신차 카탈로그에서 브랜드·모델 일치 항목 조회
  const match = r.vmp.find((v: any) =>
    v.brand === f.brand && v.model === f.model && (!f.year || Number(v.year) === f.year)
  )
  const cc = Number(match?.engine_cc || match?.displacement || 0)
  return cc > 0 ? cc : 2000
}

function buildCalcInput(f: Form, r: RefTables): CalcInput {
  const R = r.rules
  const preset = pickPreset(f, r)
  const carAge = computeCarAge(f, r)
  const engineCC = resolveEngineCC(f, r)

  return {
    vehicle: {
      brand: f.brand || '미지정',
      model: f.model || '미지정',
      fuel: f.fuel,
      year: f.year,
      engine_cc: engineCC,
      factory_price: f.purchasePrice,
      purchase_price: f.purchasePrice,
      mileage: carAge.mileage,
      is_commercial: true,
    },
    contract: {
      term_months: f.termMonths,
      car_age_mode: carAge.mode,
      custom_car_age: carAge.age,
      contract_type: f.contractType,
      residual_rate: resolveResidualRate(f, r),
      buyout_premium: 0,
      annual_mileage: f.annualMileage,
      baseline_km: 2,
      contract_source: 'owned',
      rental_term: 'longterm',
      utilization_rate: 100,
    },
    depreciation: {
      curve_preset: 'neutral' as any,
      popularity_grade: 'B등급 (일반)',
    },
    finance: {
      loan_amount: Math.round(f.purchasePrice * 0.9),
      loan_rate: resolveLoanRate(f, r),
      investment_rate: R.INVESTMENT_RETURN_RATE || 3,
    },
    insurance: {
      auto_mode: true,
      monthly_cost: 0,
      driver_age: f.driverAge as any,
      deductible: R.DEDUCTIBLE_AMOUNT || 500000,
      own_damage_ratio: R.OWN_DAMAGE_RATIO || 60,
    },
    maintenance: {
      package: f.maintenancePackage as any,
      oil_change_freq: 1,
      monthly_cost: 0, // 엔진이 maintenance_cost_table에서 package 기준 조회
    },
    tax: {
      annual_tax: 0,
      engine_cc: engineCC,
      registration_region: '서울',
    },
    risk: {
      rate: resolveRiskRate(f, r),
    },
    overhead: {
      overhead_rate: resolveOverhead(f, r),
      margin: resolveMargin(f, r),
      insurance_loading: 0,
    },
    deposit_prepay: {
      deposit: f.depositAmount,
      prepayment: f.prepaymentAmount,
      deposit_discount_rate: preset?.deposit_discount_rate ?? (R.DEPOSIT_DISCOUNT_RATE || 0),
      prepayment_discount_rate: preset?.prepayment_discount_rate ?? (R.PREPAYMENT_DISCOUNT_RATE || 0),
    },
    acquisition: {
      total_cost: 0, acquisition_tax: 0, bond_cost: 0, delivery_fee: 0, misc_fee: 0,
    },
    reference: {
      dep_rates: r.depRates,
      dep_adjustments: r.depAdj,
      dep_db: r.depDb,
      tax_rates: r.tax,
      reg_costs: r.reg,
      inspection_costs: r.inspC,
      inspection_schedules: r.inspS,
      ins_base_premiums: r.insBase,
      ins_own_rates: r.insOwn,
      insurance_rates: r.ins,
      finance_rates: r.fin,
      maintenance_costs: r.maint,
      vehicle_market_prices: r.vmp,
    },
    rules: R,
  }
}

// ─── 저장 ────────────────────────────────────────────────
async function saveSimpleQuote(
  f: Form,
  result: CalcResult,
  input: CalcInput,
  editingQuoteId?: string | null,
): Promise<string | number> {
  if (!f.customerName) throw new Error('고객명을 입력하세요')
  if (!result?.suggested_rent) throw new Error('계산 결과가 없습니다')

  const h = await getAuth()

  // 1) 견적 저장 — editingQuoteId 있으면 PATCH, 없으면 POST
  const method = editingQuoteId ? 'PATCH' : 'POST'
  const url = editingQuoteId ? `/api/quotes/${editingQuoteId}` : '/api/quotes'
  const qRes = await fetch(url, {
    method,
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_name: f.customerName,
      status: 'draft',
      rent_fee: result.suggested_rent,
      quote_detail: {
        source: 'simple',
        manual_customer: {
          name: f.customerName,
          phone: f.customerPhone,
          email: '',
          business_number: '',
        },
        car_info: {
          brand: f.brand,
          model: f.model,
          year: f.year,
          fuel: f.fuel,
        },
        car_id: f.carId || null,
        contract_type: f.contractType,
        purchase_price: f.purchasePrice,
        factory_price: f.purchasePrice,
        term_months: f.termMonths,
        annualMileage: f.annualMileage,
        baselineKm: 2,
        // #39 Phase 1c 신규 필드 영속화
        preset_id: f.presetId || null,
        maintenance_package: f.maintenancePackage,
        driver_age: f.driverAge,
        deposit_amount: f.depositAmount,
        prepayment_amount: f.prepaymentAmount,
        loan_amount: input.finance.loan_amount,
        loan_rate: input.finance.loan_rate,
        monthly_rent: result.suggested_rent,
        monthly_rent_with_vat: result.rent_with_vat,
        total_monthly_cost: result.total_monthly_cost,
        margin_rate: result.market_analysis?.margin_rate || 0,
        cost_breakdown: {
          depreciation: result.breakdown.depreciation.monthly,
          finance: result.breakdown.finance.monthly,
          insurance: result.breakdown.insurance.monthly,
          maintenance: result.breakdown.maintenance.monthly,
          tax_inspection: result.breakdown.tax_inspection.monthly,
          risk: result.breakdown.risk.monthly,
          overhead: result.breakdown.overhead.monthly,
        },
      },
    }),
  })
  const json = await qRes.json().catch(() => ({}))
  if (!qRes.ok) throw new Error(json.error || `HTTP ${qRes.status}`)
  const quoteId = editingQuoteId || json.data?.id || json.data?.quote_id || json.data

  // 2) operational-learning 스냅샷 훅 (논블로킹)
  fetch('/api/operational-learning/snapshots', {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quote_id: quoteId,
      purchase_price: f.purchasePrice,
      term_months: f.termMonths,
      contract_type: f.contractType,
      annual_mileage: f.annualMileage,
      loan_rate: input.finance.loan_rate,
      vehicle_class: 'auto',
      calc_result: result,
    }),
  }).catch((e) => console.warn('[snapshot 훅 실패 — 비차단]', e?.message))

  return quoteId
}

// ─── 메인 컴포넌트 (Inner — useSearchParams 를 위해 Suspense 분리) ────────
function SimpleQuotePageInner() {
  const router = useRouter()
  const search = useSearchParams()
  const editingQuoteId = search.get('quote_id') || null
  const prefillCarId = search.get('car_id') || null

  const ref = useRefTables()
  const [form, setForm] = useState<Form>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadingExisting, setLoadingExisting] = useState(!!editingQuoteId)

  // 기존 견적 로드 (편집 모드)
  useEffect(() => {
    if (!editingQuoteId) return
    ;(async () => {
      try {
        const h = await getAuth()
        const res = await fetch(`/api/quotes/${editingQuoteId}`, { headers: h })
        const j = await res.json().catch(() => ({}))
        const q = j?.data || j
        const det = q?.quote_detail || {}
        setForm((prev) => ({
          ...prev,
          carId: det.car_id ? String(det.car_id) : prev.carId,
          brand: det.car_info?.brand || prev.brand,
          model: det.car_info?.model || prev.model,
          purchasePrice: Number(det.purchase_price || det.factory_price || 0) || prev.purchasePrice,
          year: Number(det.car_info?.year || prev.year),
          fuel: det.car_info?.fuel || prev.fuel,
          termMonths: Number(det.term_months || prev.termMonths),
          annualMileage: Number(det.annualMileage || det.annual_mileage || prev.annualMileage),
          contractType: det.contract_type === 'buyout' ? 'buyout' : 'return',
          presetId: det.preset_id ? String(det.preset_id) : prev.presetId,
          maintenancePackage: (det.maintenance_package as MaintenancePackage) || prev.maintenancePackage,
          driverAge: (det.driver_age as DriverAge) || prev.driverAge,
          depositAmount: Number(det.deposit_amount ?? 0) || prev.depositAmount,
          prepaymentAmount: Number(det.prepayment_amount ?? 0) || prev.prepaymentAmount,
          customerName: det.manual_customer?.name || q?.customer_name || prev.customerName,
          customerPhone: det.manual_customer?.phone || prev.customerPhone,
        }))
      } catch (e) {
        console.warn('[편집 로드 실패]', e)
      } finally {
        setLoadingExisting(false)
      }
    })()
  }, [editingQuoteId])

  // URL car_id prefill (신규 작성 + 차량 사전선택)
  useEffect(() => {
    if (editingQuoteId || !prefillCarId) return
    setForm((f) => ({ ...f, carId: prefillCarId }))
  }, [prefillCarId, editingQuoteId])

  // 차량 선택 시 자동 필드 채우기
  useEffect(() => {
    if (!form.carId) return
    const car = ref.cars.find((c: any) => String(c.id) === form.carId)
    if (!car) return
    setForm((f) => ({
      ...f,
      brand: car.brand || f.brand,
      model: car.model || f.model,
      purchasePrice: Number(car.purchase_price) || f.purchasePrice,
      year: Number(car.year) || f.year,
      fuel: car.fuel || car.fuel_type || f.fuel,
    }))
  }, [form.carId, ref.cars])

  // 프리셋이 로드되었는데 아직 미선택이면 기본 프리셋 자동 지정 + 기본 보증금 적용
  useEffect(() => {
    if (!ref.ready || ref.presets.length === 0) return
    if (form.presetId) return // 사용자가 이미 선택한 경우 유지
    const def = ref.presets.find((p) => p.is_default) || ref.presets[0]
    if (!def) return
    setForm((f) => ({
      ...f,
      presetId: def.id,
      depositAmount: f.depositAmount || def.default_deposit || 0,
    }))
  }, [ref.ready, ref.presets, form.presetId])

  // 사용자가 프리셋을 바꾸면 해당 프리셋의 기본 보증금을 반영 (사용자가 수동 편집한 경우 보존)
  const handlePresetChange = (presetId: string) => {
    const preset = ref.presets.find((p) => p.id === presetId)
    setForm((f) => ({
      ...f,
      presetId,
      // 현재 보증금이 NULL/0이면 프리셋 기본값 자동 적용, 그 외에는 유지
      depositAmount: f.depositAmount === 0 && preset?.default_deposit != null ? preset.default_deposit : f.depositAmount,
    }))
  }

  // 실시간 계산
  const { result, error: calcError } = useMemo(() => {
    if (!ref.ready) return { result: null as CalcResult | null, error: null as string | null }
    if (!form.purchasePrice || form.purchasePrice < 1_000_000) {
      return { result: null, error: null }
    }
    try {
      const input = buildCalcInput(form, ref)
      return { result: calculateRentCost(input), error: null }
    } catch (e: any) {
      return { result: null, error: e?.message || '계산 오류' }
    }
  }, [form, ref])

  const input = ref.ready ? buildCalcInput(form, ref) : null

  const canSave = !!result && !!form.customerName && !saving

  async function handleSave() {
    if (!result || !input) return
    setSaving(true); setSaveError(null)
    try {
      const id = await saveSimpleQuote(form, result, input, editingQuoteId)
      router.push(`/quotes/${id}`)
    } catch (e: any) {
      setSaveError(e?.message || '저장 실패')
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f0f4ff 0%, #fdf4ff 100%)', padding: '20px 16px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        {/* 헤더 */}
        <div style={{ ...glassLevel4, padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>⚡ 심플 견적 작성</h1>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              영업 프리셋 + 필수 입력만으로 빠른 견적 산출. 감가·보험·세금·등록비는 기준표 DB에서 자동 조회됩니다.
              <Link href="/db/pricing-standards" style={{ marginLeft: 8, color: '#be123c', textDecoration: 'underline', fontSize: 11 }}>
                기준값 편집 →
              </Link>
            </p>
          </div>
          <Link href="/quotes" style={{ ...btnGhost }}>← 견적 목록</Link>
        </div>

        {ref.error && (
          <div style={{ ...glassLevel4, padding: 16, marginBottom: 16, border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626' }}>
            ❌ 기준표 로딩 실패: {ref.error}
          </div>
        )}

        {/* 2-column 레이아웃 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
          {/* 좌측: 입력 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* 영업 프리셋 (#39 Phase 1c) */}
            <section style={{ ...glassLevel3Rose, padding: 18 }}>
              <h2 style={sectionTitle('#be123c')}>🎯 영업 프리셋</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginTop: 10, alignItems: 'end' }}>
                <label style={labelStyle}>
                  <span>가격 정책 선택</span>
                  <select
                    value={form.presetId}
                    onChange={(e) => handlePresetChange(e.target.value)}
                    style={inputStyle}
                  >
                    {ref.presets.length === 0 && <option value="">(프리셋 없음 — business_rules 기본값 적용)</option>}
                    {ref.presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}{p.is_default ? ' ⭐' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <Link href="/db/pricing-standards"
                  style={{ ...btnGhost, fontSize: 10, whiteSpace: 'nowrap' }}
                  title="영업 프리셋 관리 페이지로 이동"
                >
                  ⚙️ 프리셋 편집
                </Link>
              </div>
              {form.presetId && (() => {
                const p = ref.presets.find((x) => x.id === form.presetId)
                if (!p) return null
                return (
                  <div style={{ marginTop: 10, padding: 10, background: 'rgba(255,255,255,0.6)', borderRadius: 10, fontSize: 11, color: '#475569' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      <div><strong style={{ color: '#be123c' }}>마진</strong> {p.margin_rate ?? '—'}%</div>
                      <div><strong style={{ color: '#be123c' }}>관리비</strong> {p.overhead_rate ?? '—'}%</div>
                      <div><strong style={{ color: '#be123c' }}>리스크</strong> {p.risk_reserve_rate ?? '—'}%</div>
                      <div><strong style={{ color: '#be123c' }}>기본보증</strong> {p.default_deposit ? p.default_deposit.toLocaleString() : 0}원</div>
                    </div>
                  </div>
                )
              })()}
            </section>

            {/* 차량 */}
            <section style={{ ...glassLevel3Blue, padding: 18 }}>
              <h2 style={sectionTitle('#1d4ed8')}>🚗 차량</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <label style={labelStyle}>
                  <span>보유 차량 선택 (선택)</span>
                  <select value={form.carId} onChange={(e) => setForm((f) => ({ ...f, carId: e.target.value }))} style={inputStyle}>
                    <option value="">수동 입력</option>
                    {ref.cars.map((c: any) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.brand} {c.model} {c.year || ''} ({c.vehicle_number || c.number || '번호없음'})
                      </option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  <span>연식</span>
                  <input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span>브랜드</span>
                  <input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} placeholder="예: 기아" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span>모델</span>
                  <input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="예: EV4" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span>연료</span>
                  <select value={form.fuel} onChange={(e) => setForm((f) => ({ ...f, fuel: e.target.value }))} style={inputStyle}>
                    {['가솔린', '디젤', '하이브리드', '전기', 'LPG'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label style={labelStyle}>
                  <span>매입가 (원) *</span>
                  <input
                    type="number"
                    value={form.purchasePrice || ''}
                    onChange={(e) => setForm((f) => ({ ...f, purchasePrice: Number(e.target.value) }))}
                    placeholder="40,000,000"
                    style={inputStyle}
                  />
                </label>
              </div>
            </section>

            {/* 계약 */}
            <section style={{ ...glassLevel3Violet, padding: 18 }}>
              <h2 style={sectionTitle('#6d28d9')}>📝 계약 조건</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
                <label style={labelStyle}>
                  <span>기간 (개월)</span>
                  <select value={form.termMonths} onChange={(e) => setForm((f) => ({ ...f, termMonths: Number(e.target.value) }))} style={inputStyle}>
                    {[12, 24, 36, 48, 60].map((v) => <option key={v} value={v}>{v}개월</option>)}
                  </select>
                </label>
                <label style={labelStyle}>
                  <span>연 주행거리 (만km)</span>
                  <select value={form.annualMileage} onChange={(e) => setForm((f) => ({ ...f, annualMileage: Number(e.target.value) }))} style={inputStyle}>
                    {[1, 1.5, 2, 2.5, 3].map((v) => <option key={v} value={v}>{v}만km</option>)}
                  </select>
                </label>
                <label style={labelStyle}>
                  <span>계약 유형</span>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, contractType: 'return' }))}
                      style={toggleBtn(form.contractType === 'return')}
                    >
                      반납형
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, contractType: 'buyout' }))}
                      style={toggleBtn(form.contractType === 'buyout')}
                    >
                      인수형
                    </button>
                  </div>
                </label>
              </div>
              {/* 보유차 선택 시 연식 자동 판별 힌트 */}
              {(() => {
                if (!form.carId) return null
                const car = ref.cars.find((c: any) => String(c.id) === form.carId)
                if (!car) return null
                const currentYear = new Date().getFullYear()
                const age = Math.max(0, currentYear - (Number(car.year) || currentYear))
                if (age === 0) return null
                return (
                  <div style={{ marginTop: 10, padding: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 10, fontSize: 11, color: '#991b1b' }}>
                    ⚠️ 연식차량 감지 — <strong>{age}년차</strong> 중고 재임대로 자동 산출됩니다 (주행거리 {Number(car.mileage || 0).toLocaleString()}km 반영)
                  </div>
                )
              })()}
            </section>

            {/* 상품·보험 (#39 Phase 1c) */}
            <section style={{ ...glassLevel3Teal, padding: 18 }}>
              <h2 style={sectionTitle('#0f766e')}>🔧 상품·보험</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <label style={labelStyle}>
                  <span>정비 패키지</span>
                  <select
                    value={form.maintenancePackage}
                    onChange={(e) => setForm((f) => ({ ...f, maintenancePackage: e.target.value as MaintenancePackage }))}
                    style={inputStyle}
                  >
                    <option value="self">자체부담 (고객이 정비비 별도 부담)</option>
                    <option value="basic">기본형 (엔진오일·소모품)</option>
                    <option value="standard">표준형 (+ 소모 부품·타이어)</option>
                    <option value="premium">프리미엄 (전체 정비·소모품 커버)</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  <span>운전자 연령</span>
                  <select
                    value={form.driverAge}
                    onChange={(e) => setForm((f) => ({ ...f, driverAge: e.target.value as DriverAge }))}
                    style={inputStyle}
                  >
                    <option value="만21세미만">만21세 미만 (할증 큼)</option>
                    <option value="만21세이상">만21세 이상</option>
                    <option value="만23세이상">만23세 이상</option>
                    <option value="만26세이상">만26세 이상 (표준)</option>
                  </select>
                </label>
              </div>
              <p style={{ fontSize: 10, color: '#64748b', marginTop: 8 }}>
                보험료는 기준표(insurance_base_premium)에서 연령·차량가 기준 자동 산출, 자차 면책 비율은 business_rules ({ref.rules.OWN_DAMAGE_RATIO || 60}%)를 적용합니다.
              </p>
            </section>

            {/* 보증금·선납 (#39 Phase 1c) */}
            <section style={{ ...glassLevel3Orange, padding: 18 }}>
              <h2 style={sectionTitle('#c2410c')}>💵 보증금·선납금</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <label style={labelStyle}>
                  <span>보증금 (원)</span>
                  <input
                    type="number"
                    value={form.depositAmount || ''}
                    onChange={(e) => setForm((f) => ({ ...f, depositAmount: Number(e.target.value) || 0 }))}
                    placeholder="0"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  <span>선납금 (원)</span>
                  <input
                    type="number"
                    value={form.prepaymentAmount || ''}
                    onChange={(e) => setForm((f) => ({ ...f, prepaymentAmount: Number(e.target.value) || 0 }))}
                    placeholder="0"
                    style={inputStyle}
                  />
                </label>
              </div>
              <p style={{ fontSize: 10, color: '#64748b', marginTop: 8 }}>
                입력한 금액 × 프리셋 할인율이 월 렌트료에서 차감됩니다.
              </p>
            </section>

            {/* 고객 */}
            <section style={{ ...glassLevel3Green, padding: 18 }}>
              <h2 style={sectionTitle('#047857')}>👤 고객</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <label style={labelStyle}>
                  <span>고객명 *</span>
                  <input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="홍길동" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span>연락처</span>
                  <input value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} placeholder="010-0000-0000" style={inputStyle} />
                </label>
              </div>
            </section>
          </div>

          {/* 우측: 실시간 결과 (sticky) */}
          <aside style={{ position: 'sticky', top: 16, alignSelf: 'flex-start' }}>
            <div style={{ ...glassLevel3Amber, padding: 18 }}>
              <h2 style={sectionTitle('#b45309')}>💰 월 렌트료</h2>

              {!ref.ready && <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 12 }}>기준표 로딩 중...</p>}

              {ref.ready && calcError && (
                <p style={{ color: '#dc2626', fontSize: 12, marginTop: 12 }}>❌ {calcError}</p>
              )}

              {ref.ready && !result && !calcError && (
                <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 12 }}>매입가를 입력하면 즉시 계산됩니다.</p>
              )}

              {result && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: '#1e293b', letterSpacing: -1 }}>
                    {Math.round(result.suggested_rent).toLocaleString()}
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#64748b', marginLeft: 4 }}>원/월</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    VAT 포함 {Math.round(result.rent_with_vat).toLocaleString()}원
                  </div>

                  <div style={{ marginTop: 14, padding: 12, background: 'rgba(255,255,255,0.6)', borderRadius: 10 }}>
                    <div style={rowStyle}><span style={rowLabel}>총 원가</span><span style={rowVal}>{Math.round(result.total_monthly_cost).toLocaleString()}원</span></div>
                    <div style={rowStyle}><span style={rowLabel}>감가</span><span style={rowVal}>{Math.round(result.breakdown.depreciation.monthly).toLocaleString()}원</span></div>
                    <div style={rowStyle}><span style={rowLabel}>금융</span><span style={rowVal}>{Math.round(result.breakdown.finance.monthly).toLocaleString()}원</span></div>
                    <div style={rowStyle}><span style={rowLabel}>보험</span><span style={rowVal}>{Math.round(result.breakdown.insurance.monthly).toLocaleString()}원</span></div>
                    <div style={rowStyle}><span style={rowLabel}>정비</span><span style={rowVal}>{Math.round(result.breakdown.maintenance.monthly).toLocaleString()}원</span></div>
                    <div style={rowStyle}><span style={rowLabel}>세금·검사</span><span style={rowVal}>{Math.round(result.breakdown.tax_inspection.monthly).toLocaleString()}원</span></div>
                    <div style={rowStyle}><span style={rowLabel}>간접비</span><span style={rowVal}>{Math.round(result.breakdown.overhead.monthly).toLocaleString()}원</span></div>
                    <div style={rowStyle}><span style={rowLabel}>리스크</span><span style={rowVal}>{Math.round(result.breakdown.risk.monthly).toLocaleString()}원</span></div>
                    <div style={{ ...rowStyle, borderTop: '1px solid rgba(0,0,0,0.08)', marginTop: 6, paddingTop: 6 }}>
                      <span style={{ ...rowLabel, fontWeight: 700, color: '#b45309' }}>마진율</span>
                      <span style={{ ...rowVal, color: '#b45309', fontWeight: 800 }}>
                        {((result.market_analysis?.margin_rate ?? 0)).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {saveError && (
                <p style={{ color: '#dc2626', fontSize: 11, marginTop: 10 }}>❌ {saveError}</p>
              )}

              <button
                onClick={handleSave}
                disabled={!canSave}
                style={{
                  marginTop: 14, width: '100%', padding: '11px 14px', fontSize: 13, fontWeight: 800,
                  borderRadius: 12, border: '1px solid rgba(59,130,246,0.4)',
                  background: canSave ? 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)' : 'rgba(226,232,240,0.8)',
                  color: canSave ? '#fff' : '#94a3b8', cursor: canSave ? 'pointer' : 'not-allowed',
                  boxShadow: canSave ? '0 4px 12px rgba(59,130,246,0.3)' : 'none',
                }}
              >
                {saving ? '저장 중...' : '💾 견적 저장 + 상세 이동'}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

// ─── Suspense 래퍼 (useSearchParams 용) ─────────────────────
export default function SimpleQuotePage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontSize: 13, color: '#64748b' }}>견적 페이지 로딩중...</div>}>
      <SimpleQuotePageInner />
    </Suspense>
  )
}

// ─── 스타일 ────────────────────────────────────────────────
const glassLevel4: React.CSSProperties = {
  background: 'rgba(255,255,255,0.72)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: 16,
  boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)',
}
const glassLevel3Blue: React.CSSProperties = {
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(191,219,254,0.80)',
  borderRadius: 14,
}
const glassLevel3Green: React.CSSProperties = {
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(187,247,208,0.80)',
  borderRadius: 14,
}
const glassLevel3Violet: React.CSSProperties = {
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(221,214,254,0.80)',
  borderRadius: 14,
}
const glassLevel3Amber: React.CSSProperties = {
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(253,230,138,0.80)',
  borderRadius: 14,
}
const glassLevel3Rose: React.CSSProperties = {
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(254,205,211,0.85)',
  borderRadius: 14,
}
const glassLevel3Teal: React.CSSProperties = {
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(153,246,228,0.80)',
  borderRadius: 14,
}
const glassLevel3Orange: React.CSSProperties = {
  background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(254,215,170,0.85)',
  borderRadius: 14,
}
const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.55)',
  border: '1px solid rgba(0,0,0,0.05)',
  borderRadius: 10,
  padding: '7px 10px',
  fontSize: 12,
  width: '100%',
  boxShadow: 'inset 2px 2px 4px rgba(140,170,210,0.08), inset -1px -1px 2px rgba(255,255,255,0.5)',
  outline: 'none',
}
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontSize: 11, fontWeight: 700, color: '#475569',
}
function sectionTitle(color: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 800, color, letterSpacing: -0.2 }
}
function toggleBtn(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '7px 10px', fontSize: 11, fontWeight: 700, borderRadius: 10,
    border: active ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(0,0,0,0.06)',
    background: active ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.55)',
    color: active ? '#6d28d9' : '#64748b',
    cursor: 'pointer',
  }
}
const btnGhost: React.CSSProperties = {
  padding: '6px 12px', fontSize: 11, fontWeight: 700, borderRadius: 10,
  border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.6)',
  color: '#475569', cursor: 'pointer', textDecoration: 'none',
}
const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  fontSize: 11, padding: '3px 0',
}
const rowLabel: React.CSSProperties = { color: '#64748b' }
const rowVal: React.CSSProperties = { color: '#1e293b', fontWeight: 700 }
