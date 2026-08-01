'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'
import CatalogPicker from '../../_components/CatalogPicker'
import CostSummaryPanel, { CalcResult } from '../../_components/CostSummaryPanel'

// ═══════════════════════════════════════════════════════════════════
// /long-term-rentals/quotes/new — 견적 작성 풀 페이지 (PR-Q4-1)
//
// 사용자 명시: 「신차등록 하고 견적작성 모달로 하기싫은데 페이지에서 구성하고 싶어요」
// → 모달 1200px 좌/우 → 풀 페이지 좌/우.
//
// 동선:
//   /long-term-rentals 견적 탭 → 「+ 견적 작성」 클릭 → 본 페이지
//   본 페이지에서 입력 → 우측 실시간 산출 → 저장 → /long-term-rentals/quotes/[id] 로 이동
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type VehicleSource = 'existing' | 'catalog' | 'ai'

const CONTRACT_TYPES = [
  { value: '기존차량', label: '기존차량' },
  { value: '신차구입', label: '신차구입' },
]
const RENT_TYPES = [
  { value: 'return', label: '반납형' },
  { value: 'buyout', label: '인수형' },
]
const FUELS = [
  { value: 'gasoline', label: '가솔린' },
  { value: 'diesel', label: '디젤' },
  { value: 'hybrid', label: '하이브리드' },
  { value: 'ev', label: '전기' },
]
const TERMS = [24, 36, 48, 60]
const ANNUAL_KMS = [10000, 15000, 20000, 30000]
const DRIVER_AGES = [
  { value: '26세이상', label: '만 26세 이상 (표준)' },
  { value: '21세이상', label: '만 21세 이상 (+40%)' },
  { value: '전연령', label: '전 연령 (+65%)' },
]

const emptyForm = {
  quote_no: '', contract_type: '기존차량', rent_type: 'return',
  customer_name: '', customer_phone: '', customer_email: '', customer_company: '',
  vehicle_id: '', vehicle_car_number: '',
  vehicle_brand: '', vehicle_model: '', vehicle_trim: '',
  vehicle_year: '', vehicle_fuel: 'gasoline', vehicle_engine_cc: '',
  vehicle_color_ext: '', vehicle_color_int: '', vehicle_options_text: '',
  new_car_price_id: '',
  purchase_price: '', market_price: '',
  start_date: '', months: '36', end_date: '',
  annual_km: '20000', residual_rate: '',
  monthly_fee: '', deposit: '', upfront_months: '', delivery_fee: '',
  insurance_option: '', driver_age: '26세이상',
  valid_until: '', owner_name: '',
  memo: '',
}

export default function NewQuotePage() {
  const router = useRouter()
  const [form, setForm] = useState({ ...emptyForm })
  const [vehicleSource, setVehicleSource] = useState<VehicleSource>('existing')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // 실시간 산출
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [calcErr, setCalcErr] = useState<string | null>(null)
  const calcDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 중고 매입 (부가세 환급) — 실취득원가 = 입력 총액 / 1.1 (2026-08-01, QUOTE-ENGINE-NOTES)
  const [usedPurchase, setUsedPurchase] = useState(false)
  const effectivePurchase = (() => {
    const p = Number(form.purchase_price)
    if (!Number.isFinite(p) || p <= 0) return null
    return usedPurchase ? Math.round(p / 1.1) : p
  })()

  // 기간 구성 비교 (36/48/60 같은 조건)
  const [compareResults, setCompareResults] = useState<Array<{ term: number; rent: number | null; margin: number | null }> | null>(null)


  // AI 캡쳐
  const [aiUploading, setAiUploading] = useState(false)
  const [aiResult, setAiResult] = useState<any | null>(null)
  const [aiErr, setAiErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 토스트
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const showToast = useCallback((m: { type: 'ok' | 'err'; text: string }) => {
    setToast(m); setTimeout(() => setToast(null), 4500)
  }, [])

  // 빠른 시작 프리셋 — 최근 견적의 차량 구성 재사용 (2026-08-01 사용자 요청: 기본 세팅 선택)
  const [presets, setPresets] = useState<Array<{
    label: string; vehicle_brand: string; vehicle_model: string; vehicle_trim: string
    vehicle_fuel: string; vehicle_engine_cc: string; purchase_price: string; market_price: string
    months: string; annual_km: string; rent_type: string
  }>>([])
  useEffect(() => {
    ;(async () => {
      try {
        const headers = await getAuthHeader()
        const res = await fetch('/api/lt-quotes?status=all', { headers })
        const json = await res.json().catch(() => ({}))
        if (!Array.isArray(json?.data)) return
        const seen = new Set<string>()
        const list: typeof presets = []
        for (const q of json.data) {
          if (!q.vehicle_brand || !q.vehicle_model || !q.purchase_price) continue
          const key = `${q.vehicle_brand}|${q.vehicle_model}|${q.vehicle_trim || ''}`
          if (seen.has(key)) continue
          seen.add(key)
          list.push({
            label: `${q.vehicle_brand} ${q.vehicle_model}${q.vehicle_trim ? ' ' + q.vehicle_trim : ''}`,
            vehicle_brand: q.vehicle_brand, vehicle_model: q.vehicle_model, vehicle_trim: q.vehicle_trim || '',
            vehicle_fuel: q.vehicle_fuel || 'gasoline', vehicle_engine_cc: q.vehicle_engine_cc != null ? String(q.vehicle_engine_cc) : '',
            purchase_price: String(q.purchase_price), market_price: q.market_price != null ? String(q.market_price) : '',
            months: q.months != null ? String(q.months) : '36', annual_km: q.annual_km != null ? String(q.annual_km) : '20000',
            rent_type: q.rent_type || 'return',
          })
          if (list.length >= 6) break
        }
        setPresets(list)
      } catch { /* 프리셋 로드 실패 — 무시 */ }
    })()
  }, [])
  const applyPreset = useCallback((p: typeof presets[number]) => {
    setForm((f) => ({
      ...f,
      vehicle_brand: p.vehicle_brand, vehicle_model: p.vehicle_model, vehicle_trim: p.vehicle_trim,
      vehicle_fuel: p.vehicle_fuel, vehicle_engine_cc: p.vehicle_engine_cc,
      purchase_price: p.purchase_price, market_price: p.market_price,
      months: p.months, annual_km: p.annual_km, rent_type: p.rent_type,
    }))
    showToast({ type: 'ok', text: `${p.label} 구성을 불러왔습니다 — 고객 정보만 채우거나 그대로 보관하세요` })
  }, [showToast])

  // 실시간 자동 산출 (디바운스 300ms)
  const runCalculate = useCallback(async () => {
    if (!form.purchase_price || !form.vehicle_brand || !form.vehicle_model ||
        !form.vehicle_fuel || !form.vehicle_engine_cc || !form.months ||
        !form.annual_km || !form.rent_type) {
      setCalcResult(null); setCalcErr(null); setCompareResults(null); return
    }
    setCalcLoading(true); setCalcErr(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const p = Number(form.purchase_price)
      const effPrice = usedPurchase && Number.isFinite(p) && p > 0 ? Math.round(p / 1.1) : p
      const baseBody = {
        purchase_price: effPrice,
        brand: form.vehicle_brand,
        model: form.vehicle_model,
        fuel: form.vehicle_fuel,
        engine_cc: Number(form.vehicle_engine_cc),
        term_months: Number(form.months),
        annual_km: Number(form.annual_km),
        rent_type: form.rent_type,
        driver_age: form.driver_age || undefined,
        residual_rate: form.residual_rate !== '' ? Number(form.residual_rate) : undefined,
        deposit: form.deposit !== '' ? Number(form.deposit) : undefined,
        upfront_months: form.upfront_months !== '' ? Number(form.upfront_months) : undefined,
      }
      const res = await fetch('/api/lt-quotes/calculate', {
        method: 'POST', headers, body: JSON.stringify(baseBody),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) {
        setCalcResult(null); setCalcErr(json?.error || '산출 실패'); setCompareResults(null)
      } else {
        setCalcResult(json.data as CalcResult)
        // 기간 구성 비교 — 36/48/60 병렬 산출 (현재 기간은 방금 결과 재사용)
        const terms = [36, 48, 60]
        Promise.all(terms.map(async (t) => {
          if (t === Number(form.months)) {
            const d = json.data as CalcResult
            return { term: t, rent: d.suggested_rent_with_vat, margin: d.margin_rate }
          }
          try {
            const r = await fetch('/api/lt-quotes/calculate', {
              method: 'POST', headers, body: JSON.stringify({ ...baseBody, term_months: t }),
            })
            const j = await r.json().catch(() => ({}))
            if (!r.ok || j?.error) return { term: t, rent: null, margin: null }
            return { term: t, rent: (j.data as CalcResult).suggested_rent_with_vat, margin: (j.data as CalcResult).margin_rate }
          } catch { return { term: t, rent: null, margin: null } }
        })).then(setCompareResults)
      }
    } catch (e) {
      setCalcResult(null); setCalcErr((e as Error)?.message || '산출 오류'); setCompareResults(null)
    } finally { setCalcLoading(false) }
  }, [form.purchase_price, form.vehicle_brand, form.vehicle_model, form.vehicle_fuel,
       form.vehicle_engine_cc, form.months, form.annual_km, form.rent_type,
       form.driver_age, form.residual_rate, form.deposit, form.upfront_months, usedPurchase])

  useEffect(() => {
    if (calcDebounceRef.current) clearTimeout(calcDebounceRef.current)
    calcDebounceRef.current = setTimeout(runCalculate, 300)
    return () => { if (calcDebounceRef.current) clearTimeout(calcDebounceRef.current) }
  }, [runCalculate])

  const applyCalc = useCallback(() => {
    if (!calcResult) return
    setForm((f) => ({ ...f, monthly_fee: String(calcResult.suggested_rent_with_vat) }))
    showToast({ type: 'ok', text: `월 ${calcResult.suggested_rent_with_vat.toLocaleString('ko-KR')}원 적용` })
  }, [calcResult, showToast])

  // AI 캡쳐
  const handleAiUpload = useCallback(async (file: File) => {
    setAiUploading(true); setAiErr(null); setAiResult(null)
    try {
      const headers = await getAuthHeader()
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/parse-quote', { method: 'POST', headers, body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || 'AI 파싱 실패')
      setAiResult(json.data || json)
      showToast({ type: 'ok', text: 'AI 파싱 완료 — 트림 선택' })
    } catch (e) {
      setAiErr((e as Error)?.message || 'AI 파싱 오류')
    } finally { setAiUploading(false) }
  }, [showToast])

  const applyAiTrim = useCallback((vIdx: number, tIdx: number) => {
    if (!aiResult) return
    const v = aiResult.variants?.[vIdx]
    const t = v?.trims?.[tIdx]
    if (!v || !t) return
    const fuel = String(v.fuel_type || '').toLowerCase()
    const fuelKey = fuel.includes('전기') || fuel.includes('ev') ? 'ev'
      : fuel.includes('하이브리드') || fuel.includes('hybrid') ? 'hybrid'
      : fuel.includes('디젤') || fuel.includes('diesel') ? 'diesel'
      : 'gasoline'
    setForm((f) => ({
      ...f,
      vehicle_brand: aiResult.brand || f.vehicle_brand,
      vehicle_model: aiResult.model || f.vehicle_model,
      vehicle_trim: t.name || '',
      vehicle_year: String(aiResult.year || f.vehicle_year),
      vehicle_fuel: fuelKey,
      vehicle_engine_cc: String(v.engine_cc || ''),
      market_price: String(t.base_price || ''),
      purchase_price: f.purchase_price || String(t.base_price || ''),
    }))
    showToast({ type: 'ok', text: `${t.name} 적용` })
  }, [aiResult, showToast])

  // 저장 — 고객명 비우면 「미정」 임의 견적으로 보관 (2026-08-01 사용자 요청:
  //   금액만 알아보는 문의용 임의 견적 → 나중에 실제 고객과 매칭)
  const save = useCallback(async () => {
    setSaving(true); setMsg(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const body: Record<string, unknown> = {
        quote_no: form.quote_no.trim() || null,
        contract_type: form.contract_type, rent_type: form.rent_type,
        customer_name: form.customer_name.trim() || '미정',
        customer_phone: form.customer_phone.trim() || null,
        customer_email: form.customer_email.trim() || null,
        customer_company: form.customer_company.trim() || null,
        vehicle_id: form.vehicle_id || null,
        vehicle_car_number: form.vehicle_car_number.trim() || null,
        vehicle_brand: form.vehicle_brand.trim() || null,
        vehicle_model: form.vehicle_model.trim() || null,
        vehicle_trim: form.vehicle_trim.trim() || null,
        vehicle_year: form.vehicle_year === '' ? null : Number(form.vehicle_year),
        vehicle_fuel: form.vehicle_fuel || null,
        vehicle_engine_cc: form.vehicle_engine_cc === '' ? null : Number(form.vehicle_engine_cc),
        vehicle_color_ext: form.vehicle_color_ext.trim() || null,
        vehicle_color_int: form.vehicle_color_int.trim() || null,
        vehicle_options_text: form.vehicle_options_text.trim() || null,
        new_car_price_id: form.new_car_price_id || null,
        // 중고 매입 시 부가세 환급 반영한 실취득원가로 저장 (총액은 메모에 남김)
        purchase_price: form.purchase_price === '' ? null : (usedPurchase && effectivePurchase != null ? effectivePurchase : Number(form.purchase_price)),
        market_price: form.market_price === '' ? null : Number(form.market_price),
        start_date: form.start_date || null,
        months: form.months === '' ? null : Number(form.months),
        end_date: form.end_date || null,
        annual_km: form.annual_km === '' ? null : Number(form.annual_km),
        residual_rate: form.residual_rate === '' ? null : Number(form.residual_rate),
        monthly_fee: form.monthly_fee === '' ? null : Number(form.monthly_fee),
        deposit: form.deposit === '' ? null : Number(form.deposit),
        upfront_months: form.upfront_months === '' ? null : Number(form.upfront_months),
        delivery_fee: form.delivery_fee === '' ? null : Number(form.delivery_fee),
        insurance_option: form.insurance_option.trim() || null,
        valid_until: form.valid_until || null,
        owner_name: form.owner_name.trim() || null,
        memo: (usedPurchase && form.purchase_price !== ''
          ? `${form.memo.trim() ? form.memo.trim() + '\n' : ''}중고 매입 — 부가세 환급 반영 (매입 총액 ${Number(form.purchase_price).toLocaleString('ko-KR')}원)`
          : form.memo.trim()) || null,
      }
      if (calcResult) {
        body.cost_breakdown_json = calcResult.cost_breakdown
        body.suggested_rent = calcResult.suggested_rent
        body.suggested_rent_with_vat = calcResult.suggested_rent_with_vat
        body.margin_rate = calcResult.margin_rate
        body.irr_annual = calcResult.irr_annual
        body.breakeven_months = calcResult.breakeven_months
        body.competitive_index = calcResult.competitive_index
        body.acquisition_total = calcResult.acquisition_total
      }
      const res = await fetch('/api/lt-quotes', { method: 'POST', headers, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '저장 실패')
      const newId = json.data?.id
      showToast({ type: 'ok', text: '견적 등록 완료 — 상세 페이지로 이동' })
      if (newId) {
        setTimeout(() => router.push(`/long-term-rentals/quotes/${newId}`), 700)
      } else {
        router.push('/long-term-rentals')
      }
    } catch (e) {
      setMsg((e as Error)?.message || '저장 오류')
    } finally { setSaving(false) }
  }, [form, calcResult, router, showToast])

  const fld = (k: keyof typeof emptyForm, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const inputStyle = { ...GLASS.L1, width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#1e293b' } as const
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 5 } as const

  return (
    <div className="page-bg">
      <div className="py-4 px-4 md:py-5 md:px-6">
        {toast && (
          <div role="status" style={{
            position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
            maxWidth: 'min(520px, 92vw)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
            background: toast.type === 'ok' ? 'rgba(236,253,245,0.97)' : 'rgba(254,242,242,0.97)', WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${toast.type === 'ok' ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)'}`,
            borderRadius: 12, boxShadow: '0 14px 36px rgba(15,23,42,0.18)',
            fontSize: 13, fontWeight: 700, color: toast.type === 'ok' ? '#065f46' : '#991b1b',
          }}>
            <span>{toast.type === 'ok' ? '✅' : '⚠️'}</span>
            <span style={{ flex: 1 }}>{toast.text}</span>
            <button onClick={() => setToast(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 15 }}>×</button>
          </div>
        )}

        {/* 빠른 시작 — 최근 견적 구성 재사용 (외부 카탈로그·AI 조사 데이터는 차량 섹션에서) */}
        {presets.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: '#9aa1ad' }}>빠른 시작</span>
            {presets.map((p, i) => (
              <button key={i} onClick={() => applyPreset(p)}
                style={{ border: '1px solid #e6e8ec', background: '#fff', borderRadius: 99, padding: '6px 13px', fontSize: 12.5, fontWeight: 500, color: '#5b626e', cursor: 'pointer' }}>
                {p.label} · {Number(p.purchase_price).toLocaleString('ko-KR')}원
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', gap: 16, alignItems: 'flex-start' }}>
          {/* 좌측 — 입력 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <div><label style={labelStyle}>견적번호</label>
                <input value={form.quote_no} onChange={(e) => fld('quote_no', e.target.value)} placeholder="자동" style={inputStyle} /></div>
              <div><label style={labelStyle}>계약 유형</label>
                <select value={form.contract_type} onChange={(e) => fld('contract_type', e.target.value)} style={inputStyle}>
                  {CONTRACT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select></div>
              <div><label style={labelStyle}>렌트 유형</label>
                <select value={form.rent_type} onChange={(e) => fld('rent_type', e.target.value)} style={inputStyle}>
                  {RENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select></div>
              <div><label style={labelStyle}>담당자</label>
                <input value={form.owner_name} onChange={(e) => fld('owner_name', e.target.value)} placeholder="영업명" style={inputStyle} /></div>
            </div>

            <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10, border: `1px solid ${COLORS.borderBlue}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.primary, marginBottom: 8 }}>👤 고객 정보</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelStyle}>고객명 (비우면 임의 견적으로 보관)</label>
                  <input value={form.customer_name} onChange={(e) => fld('customer_name', e.target.value)} placeholder="미정이면 비워두세요" style={inputStyle} /></div>
                <div><label style={labelStyle}>연락처</label>
                  <input value={form.customer_phone} onChange={(e) => fld('customer_phone', e.target.value)} placeholder="010-…" style={inputStyle} /></div>
                <div><label style={labelStyle}>이메일</label>
                  <input value={form.customer_email} onChange={(e) => fld('customer_email', e.target.value)} placeholder="선택" style={inputStyle} /></div>
                <div><label style={labelStyle}>회사 / 소속</label>
                  <input value={form.customer_company} onChange={(e) => fld('customer_company', e.target.value)} placeholder="선택" style={inputStyle} /></div>
              </div>
            </div>

            <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10, border: '1px solid rgba(245,158,11,0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#b45309' }}>🚗 차량 / 스펙</div>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'inline-flex', gap: 3 }}>
                  {([
                    { k: 'existing' as const, label: '기존 차량' },
                    { k: 'catalog' as const, label: '신차 카탈로그' },
                    { k: 'ai' as const, label: '신차 AI 캡쳐' },
                  ]).map((t) => (
                    <button key={t.k} onClick={() => setVehicleSource(t.k)}
                      style={{ padding: '4px 9px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        border: vehicleSource === t.k ? `1px solid ${COLORS.borderBlue}` : '1px solid rgba(0,0,0,0.08)',
                        background: vehicleSource === t.k ? COLORS.bgBlue : GLASS.L2.background,
                        color: vehicleSource === t.k ? COLORS.primary : '#475569' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {vehicleSource === 'existing' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div><label style={labelStyle}>차량번호</label>
                    <input value={form.vehicle_car_number} onChange={(e) => fld('vehicle_car_number', e.target.value)} placeholder="12가3456" style={inputStyle} /></div>
                  <div><label style={labelStyle}>브랜드</label>
                    <input value={form.vehicle_brand} onChange={(e) => fld('vehicle_brand', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>모델</label>
                    <input value={form.vehicle_model} onChange={(e) => fld('vehicle_model', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>연식</label>
                    <input type="number" value={form.vehicle_year} onChange={(e) => fld('vehicle_year', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>연료</label>
                    <select value={form.vehicle_fuel} onChange={(e) => fld('vehicle_fuel', e.target.value)} style={inputStyle}>
                      {FUELS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select></div>
                  <div><label style={labelStyle}>배기량 (CC)</label>
                    <input type="number" value={form.vehicle_engine_cc} onChange={(e) => fld('vehicle_engine_cc', e.target.value)} style={inputStyle} /></div>
                </div>
              )}
              {vehicleSource === 'catalog' && (
                <CatalogPicker form={form as any} setForm={setForm as any} inputStyle={inputStyle} labelStyle={labelStyle} />
              )}
              {vehicleSource === 'ai' && (
                <div>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAiUpload(f) }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <button onClick={() => fileRef.current?.click()} disabled={aiUploading}
                      style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${COLORS.borderBlue}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: aiUploading ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700 }}>
                      {aiUploading ? '🔄 파싱 중…' : '📷 견적서 PDF/이미지 업로드'}
                    </button>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>Gemini Vision · ₩1~3/회</span>
                  </div>
                  {aiErr && <div style={{ fontSize: 11, color: '#991b1b', marginBottom: 6 }}>⚠ {aiErr}</div>}
                  {aiResult?.variants?.length > 0 && (
                    <div style={{ ...GLASS.L1, padding: 10, borderRadius: 8, fontSize: 11 }}>
                      <div style={{ fontWeight: 700, color: '#0f2440', marginBottom: 6 }}>{aiResult.brand} {aiResult.model} ({aiResult.year})</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                        {aiResult.variants.map((v: any, vi: number) =>
                          v.trims?.map((t: any, ti: number) => (
                            <button key={`${vi}-${ti}`} onClick={() => applyAiTrim(vi, ti)}
                              style={{ ...GLASS.L3, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11, textAlign: 'left' }}>
                              <span style={{ fontWeight: 600, color: '#475569', minWidth: 80 }}>{v.fuel_type}</span>
                              <span style={{ flex: 1, color: '#1e293b' }}>{t.name}</span>
                              <span style={{ fontWeight: 700, color: COLORS.primary }}>{(t.base_price || 0).toLocaleString('ko-KR')}원</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10, border: '1px solid rgba(16,185,129,0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#065f46' }}>매입가 (원가 산출 핵심)</div>
                <div style={{ flex: 1 }} />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#5b626e', cursor: 'pointer' }}>
                  <input type="checkbox" checked={usedPurchase} onChange={(e) => setUsedPurchase(e.target.checked)}
                    style={{ width: 13, height: 13, accentColor: '#2563eb', cursor: 'pointer' }} />
                  중고 매입 (부가세 환급 반영)
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelStyle}>매입가 (원, VAT 포함) *</label>
                  <input type="number" value={form.purchase_price} onChange={(e) => fld('purchase_price', e.target.value)} placeholder="할인 후 실제 매입가" style={inputStyle} /></div>
                <div><label style={labelStyle}>시장가 (참조)</label>
                  <input type="number" value={form.market_price} onChange={(e) => fld('market_price', e.target.value)} placeholder="출고가" style={inputStyle} /></div>
              </div>
              {usedPurchase && effectivePurchase != null && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: '#15803d', fontWeight: 600 }}>
                  환급 후 실취득원가 {effectivePurchase.toLocaleString('ko-KR')}원으로 계산합니다 (환급 예상 {(Number(form.purchase_price) - effectivePurchase).toLocaleString('ko-KR')}원)
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <div><label style={labelStyle}>시작일</label>
                <input type="date" value={form.start_date} onChange={(e) => fld('start_date', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>개월수</label>
                <select value={form.months} onChange={(e) => fld('months', e.target.value)} style={inputStyle}>
                  {TERMS.map((m) => <option key={m} value={m}>{m}개월</option>)}
                </select></div>
              <div><label style={labelStyle}>주행거리(km/년)</label>
                <select value={form.annual_km} onChange={(e) => fld('annual_km', e.target.value)} style={inputStyle}>
                  {ANNUAL_KMS.map((k) => <option key={k} value={k}>{k.toLocaleString()}km</option>)}
                </select></div>
              <div><label style={labelStyle}>만기일</label>
                <input type="date" value={form.end_date} onChange={(e) => fld('end_date', e.target.value)} style={inputStyle} /></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <div><label style={labelStyle}>월 렌트료 (VAT 포함)</label>
                <input type="number" value={form.monthly_fee} onChange={(e) => fld('monthly_fee', e.target.value)} placeholder="우측 산출 또는 협상가" style={inputStyle} /></div>
              <div><label style={labelStyle}>보증금</label>
                <input type="number" value={form.deposit} onChange={(e) => fld('deposit', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>선납월수</label>
                <input type="number" value={form.upfront_months} onChange={(e) => fld('upfront_months', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>인도비</label>
                <input type="number" value={form.delivery_fee} onChange={(e) => fld('delivery_fee', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>보험 옵션</label>
                <input value={form.insurance_option} onChange={(e) => fld('insurance_option', e.target.value)} placeholder="자차/대물/대인" style={inputStyle} /></div>
              <div><label style={labelStyle}>운전자 연령 (보험)</label>
                <select value={form.driver_age} onChange={(e) => fld('driver_age', e.target.value)} style={inputStyle}>
                  {DRIVER_AGES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select></div>
              <div><label style={labelStyle}>잔존가율 (%)</label>
                <input type="number" value={form.residual_rate} onChange={(e) => fld('residual_rate', e.target.value)} placeholder="인수형" style={inputStyle} /></div>
              <div><label style={labelStyle}>유효기간</label>
                <input type="date" value={form.valid_until} onChange={(e) => fld('valid_until', e.target.value)} style={inputStyle} /></div>
            </div>

            <div><label style={labelStyle}>메모</label>
              <textarea value={form.memo} onChange={(e) => fld('memo', e.target.value)} rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} /></div>

            {msg && <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b' }}>⚠️ {msg}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => router.push('/long-term-rentals')}
                style={{ padding: '10px 16px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>← 목록으로</button>
              <div style={{ flex: 1 }} />
              <button onClick={save} disabled={saving}
                style={{ padding: '10px 22px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, opacity: saving ? 0.5 : 1 }}>
                {saving ? '저장 중…' : '➕ 견적 등록'}
              </button>
            </div>
          </div>

          {/* 우측 — 실시간 산출 (sticky) */}
          <div style={{ position: 'sticky', top: 16, alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <CostSummaryPanel
              result={calcResult} loading={calcLoading} err={calcErr} onApply={applyCalc}
              negotiatedWithVat={form.monthly_fee !== '' ? Number(form.monthly_fee) : null}
            />

            {/* 기간 구성 비교 — 같은 조건으로 36/48/60개월 (2026-08-01) */}
            {compareResults && (
              <div style={{ background: '#fff', border: '1px solid #e6e8ec', borderRadius: 10, padding: 11, boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#5b626e', marginBottom: 7 }}>기간 구성 비교 (같은 조건)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr>
                    {['기간', '적정 월렌트료(VAT포함)', '마진'].map((h, i) => (
                      <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', color: '#9aa1ad', fontWeight: 600, paddingBottom: 5 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {compareResults.map((c) => (
                      <tr key={c.term} onClick={() => fld('months', String(c.term))}
                        style={{ cursor: 'pointer', background: String(c.term) === form.months ? '#eff4ff' : 'transparent' }}>
                        <td style={{ padding: '4px 4px', fontWeight: String(c.term) === form.months ? 700 : 500 }}>{c.term}개월{String(c.term) === form.months ? ' ←' : ''}</td>
                        <td style={{ padding: '4px 4px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {c.rent != null ? `${c.rent.toLocaleString('ko-KR')}원` : '—'}
                        </td>
                        <td style={{ padding: '4px 4px', textAlign: 'right', color: (c.margin ?? 0) >= 10 ? '#15803d' : (c.margin ?? 0) >= 5 ? '#b45309' : '#dc2626', fontWeight: 600 }}>
                          {c.margin != null ? `${c.margin.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 9.5, color: '#9aa1ad', marginTop: 5 }}>행 클릭 시 해당 기간으로 전환됩니다</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
