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
  customerName: '',
  customerPhone: '',
}

// ─── Ref 테이블 로드 ───────────────────────────────────────
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
}

function useRefTables(): RefTables & { error: string | null } {
  const [state, setState] = useState<RefTables>({
    ready: false, rules: {}, cars: [], depRates: [], depAdj: [], depDb: [],
    ins: [], maint: [], tax: [], fin: [], reg: [], inspC: [], inspS: [],
    insBase: [], insOwn: [], vmp: [],
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [rules, cars, depRates, depAdj, depDb, ins, maint, tax, fin, reg, inspC, inspS, insBase, insOwn, vmp] = await Promise.all([
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
        })
      } catch (e: any) {
        setError(e?.message || '기준표 로딩 실패')
      }
    })()
  }, [])

  return { ...state, error }
}

// ─── CalcInput 빌더 ────────────────────────────────────────
function buildCalcInput(f: Form, r: RefTables): CalcInput {
  const R = r.rules
  return {
    vehicle: {
      brand: f.brand || '미지정',
      model: f.model || '미지정',
      fuel: f.fuel,
      year: f.year,
      engine_cc: f.fuel === '전기' ? 0 : 2000,
      factory_price: f.purchasePrice,
      purchase_price: f.purchasePrice,
      mileage: 0,
      is_commercial: true,
    },
    contract: {
      term_months: f.termMonths,
      car_age_mode: 'new',
      custom_car_age: 0,
      contract_type: f.contractType,
      residual_rate: f.contractType === 'buyout' ? 30 : 0,
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
      loan_rate: R.LOAN_INTEREST_RATE || 5.5,
      investment_rate: R.INVESTMENT_RETURN_RATE || 3,
    },
    insurance: {
      auto_mode: true,
      monthly_cost: 0,
      driver_age: '26세이상' as any,
      deductible: R.DEDUCTIBLE_AMOUNT || 500000,
      own_damage_ratio: 60,
    },
    maintenance: {
      package: 'self' as any,
      oil_change_freq: 1,
      monthly_cost: 0,
    },
    tax: {
      annual_tax: 0,
      engine_cc: f.fuel === '전기' ? 0 : 2000,
      registration_region: '서울',
    },
    risk: {
      rate: R.RISK_RESERVE_RATE && R.RISK_RESERVE_RATE < 1 ? R.RISK_RESERVE_RATE * 100 : (R.RISK_RESERVE_RATE || 3),
    },
    overhead: {
      overhead_rate: R.OVERHEAD_RATE && R.OVERHEAD_RATE < 1 ? R.OVERHEAD_RATE * 100 : (R.OVERHEAD_RATE || 8),
      margin: R.DEFAULT_MARGIN_RATE || 150000,
      insurance_loading: 0,
    },
    deposit_prepay: {
      deposit: 0, prepayment: 0, deposit_discount_rate: 0, prepayment_discount_rate: 0,
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
              8개 필드로 빠른 견적 산출. 기본값은 기준표 DB에서 자동 조회.
              <Link href="/quotes/pricing" style={{ marginLeft: 8, color: '#3b82f6', textDecoration: 'underline' }}>
                상세 편집(5단계 빌더) →
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
