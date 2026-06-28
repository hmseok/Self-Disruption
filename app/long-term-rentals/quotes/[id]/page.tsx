'use client'

import { useState, useEffect, useCallback, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'
import CatalogPicker from '../../_components/CatalogPicker'
import CostSummaryPanel, { CalcResult } from '../../_components/CostSummaryPanel'

// ═══════════════════════════════════════════════════════════════════
// /long-term-rentals/quotes/[id] — 견적 상세/편집 풀 페이지 (PR-Q4-1)
//
// new 페이지와 동일 레이아웃 + 발송/수락/거부/계약 전환 액션 + 공유 링크.
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

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  draft:     { label: '✏️ 작성중',  bg: 'rgba(148,163,184,0.18)', fg: '#475569' },
  sent:      { label: '📤 발송됨',  bg: COLORS.bgBlue,            fg: COLORS.primary },
  accepted:  { label: '✅ 수락',    bg: 'rgba(16,185,129,0.14)',  fg: '#065f46' },
  rejected:  { label: '✗ 거부',     bg: 'rgba(239,68,68,0.12)',   fg: '#991b1b' },
  expired:   { label: '⏰ 만료',    bg: 'rgba(245,158,11,0.12)',  fg: '#b45309' },
  converted: { label: '🔗 계약',    bg: 'rgba(124,58,237,0.14)',  fg: '#5b21b6' },
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '-'
  return String(s).slice(0, 10)
}

type FormState = {
  quote_no: string; status: string; contract_type: string; rent_type: string
  customer_name: string; customer_phone: string; customer_email: string; customer_company: string
  vehicle_id: string; vehicle_car_number: string
  vehicle_brand: string; vehicle_model: string; vehicle_trim: string
  vehicle_year: string; vehicle_fuel: string; vehicle_engine_cc: string
  vehicle_color_ext: string; vehicle_color_int: string; vehicle_options_text: string
  new_car_price_id: string
  purchase_price: string; market_price: string
  start_date: string; months: string; end_date: string
  annual_km: string; residual_rate: string
  monthly_fee: string; deposit: string; upfront_months: string; delivery_fee: string
  insurance_option: string; driver_age: string
  valid_until: string; owner_name: string
  memo: string
}

const emptyForm: FormState = {
  quote_no: '', status: 'draft', contract_type: '기존차량', rent_type: 'return',
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

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)

  const [row, setRow] = useState<any>(null)
  const [form, setForm] = useState<FormState>({ ...emptyForm })
  const [vehicleSource, setVehicleSource] = useState<VehicleSource>('existing')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // 산출
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [calcErr, setCalcErr] = useState<string | null>(null)
  const calcDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 토스트
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const showToast = useCallback((m: { type: 'ok' | 'err'; text: string }) => {
    setToast(m); setTimeout(() => setToast(null), 4500)
  }, [])

  // 견적 로드
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const headers = await getAuthHeader()
        const res = await fetch(`/api/lt-quotes/${id}`, { headers })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok || json?.error) {
          setMsg(json?.error || '견적을 찾을 수 없습니다')
        } else {
          const r = json.data
          setRow(r)
          setForm({
            quote_no: r.quote_no || '',
            status: r.status || 'draft',
            contract_type: r.contract_type || '기존차량',
            rent_type: r.rent_type || 'return',
            customer_name: r.customer_name || '',
            customer_phone: r.customer_phone || '',
            customer_email: r.customer_email || '',
            customer_company: r.customer_company || '',
            vehicle_id: r.vehicle_id || '',
            vehicle_car_number: r.vehicle_car_number || '',
            vehicle_brand: r.vehicle_brand || '',
            vehicle_model: r.vehicle_model || '',
            vehicle_trim: r.vehicle_trim || '',
            vehicle_year: r.vehicle_year != null ? String(r.vehicle_year) : '',
            vehicle_fuel: r.vehicle_fuel || 'gasoline',
            vehicle_engine_cc: r.vehicle_engine_cc != null ? String(r.vehicle_engine_cc) : '',
            vehicle_color_ext: r.vehicle_color_ext || '',
            vehicle_color_int: r.vehicle_color_int || '',
            vehicle_options_text: r.vehicle_options_text || '',
            new_car_price_id: r.new_car_price_id || '',
            purchase_price: r.purchase_price != null ? String(r.purchase_price) : '',
            market_price: r.market_price != null ? String(r.market_price) : '',
            start_date: r.start_date ? String(r.start_date).slice(0, 10) : '',
            months: r.months != null ? String(r.months) : '36',
            end_date: r.end_date ? String(r.end_date).slice(0, 10) : '',
            annual_km: r.annual_km != null ? String(r.annual_km) : '20000',
            residual_rate: r.residual_rate != null ? String(r.residual_rate) : '',
            monthly_fee: r.monthly_fee != null ? String(r.monthly_fee) : '',
            deposit: r.deposit != null ? String(r.deposit) : '',
            upfront_months: r.upfront_months != null ? String(r.upfront_months) : '',
            delivery_fee: r.delivery_fee != null ? String(r.delivery_fee) : '',
            insurance_option: r.insurance_option || '',
            driver_age: r.driver_age || '26세이상',
            valid_until: r.valid_until ? String(r.valid_until).slice(0, 10) : '',
            owner_name: r.owner_name || '',
            memo: r.memo || '',
          })
          setVehicleSource(r.vehicle_id ? 'existing' : (r.new_car_price_id ? 'catalog' : 'existing'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  // 실시간 산출
  const runCalculate = useCallback(async () => {
    if (!form.purchase_price || !form.vehicle_brand || !form.vehicle_model ||
        !form.vehicle_fuel || !form.vehicle_engine_cc || !form.months ||
        !form.annual_km || !form.rent_type) {
      setCalcResult(null); setCalcErr(null); return
    }
    setCalcLoading(true); setCalcErr(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch('/api/lt-quotes/calculate', {
        method: 'POST', headers,
        body: JSON.stringify({
          purchase_price: Number(form.purchase_price),
          brand: form.vehicle_brand, model: form.vehicle_model,
          fuel: form.vehicle_fuel, engine_cc: Number(form.vehicle_engine_cc),
          term_months: Number(form.months), annual_km: Number(form.annual_km),
          rent_type: form.rent_type,
          driver_age: form.driver_age || undefined,
          residual_rate: form.residual_rate !== '' ? Number(form.residual_rate) : undefined,
          deposit: form.deposit !== '' ? Number(form.deposit) : undefined,
          upfront_months: form.upfront_months !== '' ? Number(form.upfront_months) : undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) {
        setCalcResult(null); setCalcErr(json?.error || '산출 실패')
      } else {
        setCalcResult(json.data as CalcResult)
      }
    } catch (e) {
      setCalcResult(null); setCalcErr((e as Error)?.message || '산출 오류')
    } finally { setCalcLoading(false) }
  }, [form.purchase_price, form.vehicle_brand, form.vehicle_model, form.vehicle_fuel,
       form.vehicle_engine_cc, form.months, form.annual_km, form.rent_type,
       form.driver_age, form.residual_rate, form.deposit, form.upfront_months])

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

  // 저장 (PATCH)
  const save = useCallback(async () => {
    if (!form.customer_name.trim()) { setMsg('고객명은 필수입니다'); return }
    setSaving(true); setMsg(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const body: Record<string, unknown> = {
        quote_no: form.quote_no.trim() || null,
        contract_type: form.contract_type, rent_type: form.rent_type,
        customer_name: form.customer_name.trim(),
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
        purchase_price: form.purchase_price === '' ? null : Number(form.purchase_price),
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
        memo: form.memo.trim() || null,
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
      const res = await fetch(`/api/lt-quotes/${id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '저장 실패')
      setRow(json.data)
      showToast({ type: 'ok', text: '견적 수정 완료' })
    } catch (e) {
      setMsg((e as Error)?.message || '저장 오류')
    } finally { setSaving(false) }
  }, [form, calcResult, id, showToast])

  // 액션
  const runSend = useCallback(async () => {
    setActionBusy('send')
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/lt-quotes/${id}/send`, { method: 'POST', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '발송 실패')
      setRow(json.data); setForm((f) => ({ ...f, status: 'sent' }))
      showToast({ type: 'ok', text: '발송 완료 — 공유 링크 생성됨' })
    } catch (e) {
      showToast({ type: 'err', text: (e as Error)?.message || '발송 오류' })
    } finally { setActionBusy(null) }
  }, [id, showToast])

  const runStatus = useCallback(async (next: 'accepted' | 'rejected' | 'expired') => {
    setActionBusy(next)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/lt-quotes/${id}`, {
        method: 'PATCH', headers, body: JSON.stringify({ status: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '상태 변경 실패')
      setRow(json.data); setForm((f) => ({ ...f, status: next }))
      showToast({ type: 'ok', text: `${STATUS_META[next]?.label} 로 변경됨` })
    } catch (e) {
      showToast({ type: 'err', text: (e as Error)?.message || '상태 변경 오류' })
    } finally { setActionBusy(null) }
  }, [id, showToast])

  const runConvert = useCallback(async () => {
    if (!confirm(`「${row?.customer_name}」 견적을 장기렌트 계약으로 전환합니다.\n계속할까요?`)) return
    setActionBusy('convert')
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/lt-quotes/${id}/convert`, { method: 'POST', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '계약 전환 실패')
      const rentalId = json?.data?.rental?.id
      showToast({ type: 'ok', text: `계약 전환 완료 — ${String(rentalId).slice(0, 8)}` })
      setTimeout(() => router.push('/long-term-rentals'), 700)
    } catch (e) {
      showToast({ type: 'err', text: (e as Error)?.message || '계약 전환 오류' })
    } finally { setActionBusy(null) }
  }, [id, row, router, showToast])

  const shareUrl = row?.share_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/public/lt-quote/${row.share_token}`
    : null
  const copyShareLink = useCallback(async () => {
    if (!shareUrl) return
    try { await navigator.clipboard.writeText(shareUrl); showToast({ type: 'ok', text: '공유 링크 복사됨' }) }
    catch { prompt('공유 링크를 복사해주세요:', shareUrl) }
  }, [shareUrl, showToast])
  const openPrint = useCallback(() => {
    if (!shareUrl) return
    window.open(`${shareUrl}?print=1`, '_blank', 'noopener')
  }, [shareUrl])

  const fld = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const inputStyle = { ...GLASS.L1, width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#1e293b' } as const
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 5 } as const

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>견적 불러오는 중…</div>
  }
  if (!row) {
    return (
      <div style={{ padding: 40, maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#0f2440', marginBottom: 6 }}>견적을 찾을 수 없습니다</h1>
        <button onClick={() => router.push('/long-term-rentals')}
          style={{ marginTop: 12, padding: '10px 18px', background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>← 목록으로</button>
      </div>
    )
  }

  return (
    <div className="page-bg">
      <div className="py-4 px-4 md:py-5 md:px-6">
        {toast && (
          <div role="status" style={{
            position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
            maxWidth: 'min(520px, 92vw)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
            background: toast.type === 'ok' ? 'rgba(236,253,245,0.97)' : 'rgba(254,242,242,0.97)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${toast.type === 'ok' ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)'}`,
            borderRadius: 12, boxShadow: '0 14px 36px rgba(15,23,42,0.18)',
            fontSize: 13, fontWeight: 700, color: toast.type === 'ok' ? '#065f46' : '#991b1b',
          }}>
            <span>{toast.type === 'ok' ? '✅' : '⚠️'}</span>
            <span style={{ flex: 1 }}>{toast.text}</span>
            <button onClick={() => setToast(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 15 }}>×</button>
          </div>
        )}

        {/* 상단 상태 + 공유 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800,
            background: STATUS_META[form.status]?.bg || 'rgba(148,163,184,0.15)',
            color: STATUS_META[form.status]?.fg || '#475569' }}>
            {STATUS_META[form.status]?.label || form.status}
          </span>
          <span style={{ fontSize: 12, color: '#64748b' }}>견적번호: <strong style={{ color: '#0f2440' }}>{row.quote_no || row.id.slice(0, 8)}</strong></span>
          {row.sent_at && <span style={{ fontSize: 11, color: '#94a3b8' }}>발송: {fmtDate(row.sent_at)}</span>}
          {row.share_views > 0 && <span style={{ fontSize: 11, color: COLORS.primary, fontWeight: 700 }}>👁 {row.share_views}회</span>}
          <div style={{ flex: 1 }} />
          {shareUrl && (
            <>
              <button onClick={copyShareLink}
                style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${COLORS.borderBlue}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>📋 공유 링크</button>
              <button onClick={openPrint}
                style={{ ...GLASS.L3, padding: '7px 12px', borderRadius: 8, color: '#475569', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>🖨 PDF</button>
            </>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', gap: 16, alignItems: 'flex-start' }}>
          {/* 좌측 — 입력 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <div><label style={labelStyle}>견적번호</label>
                <input value={form.quote_no} onChange={(e) => fld('quote_no', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>계약 유형</label>
                <select value={form.contract_type} onChange={(e) => fld('contract_type', e.target.value)} style={inputStyle}>
                  {CONTRACT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select></div>
              <div><label style={labelStyle}>렌트 유형</label>
                <select value={form.rent_type} onChange={(e) => fld('rent_type', e.target.value)} style={inputStyle}>
                  {RENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select></div>
              <div><label style={labelStyle}>담당자</label>
                <input value={form.owner_name} onChange={(e) => fld('owner_name', e.target.value)} style={inputStyle} /></div>
            </div>

            <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10, border: `1px solid ${COLORS.borderBlue}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.primary, marginBottom: 8 }}>👤 고객 정보</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelStyle}>고객명 *</label>
                  <input value={form.customer_name} onChange={(e) => fld('customer_name', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>연락처</label>
                  <input value={form.customer_phone} onChange={(e) => fld('customer_phone', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>이메일</label>
                  <input value={form.customer_email} onChange={(e) => fld('customer_email', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>회사 / 소속</label>
                  <input value={form.customer_company} onChange={(e) => fld('customer_company', e.target.value)} style={inputStyle} /></div>
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

              {vehicleSource === 'existing' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div><label style={labelStyle}>차량번호</label>
                    <input value={form.vehicle_car_number} onChange={(e) => fld('vehicle_car_number', e.target.value)} style={inputStyle} /></div>
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
              ) : (
                <CatalogPicker form={form as any} setForm={setForm as any} inputStyle={inputStyle} labelStyle={labelStyle} />
              )}
            </div>

            <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10, border: '1px solid rgba(16,185,129,0.25)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#065f46', marginBottom: 8 }}>💵 매입가</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelStyle}>매입가 (VAT 포함) *</label>
                  <input type="number" value={form.purchase_price} onChange={(e) => fld('purchase_price', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>시장가</label>
                  <input type="number" value={form.market_price} onChange={(e) => fld('market_price', e.target.value)} style={inputStyle} /></div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <div><label style={labelStyle}>시작일</label>
                <input type="date" value={form.start_date} onChange={(e) => fld('start_date', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>개월수</label>
                <select value={form.months} onChange={(e) => fld('months', e.target.value)} style={inputStyle}>
                  {TERMS.map((m) => <option key={m} value={m}>{m}개월</option>)}
                </select></div>
              <div><label style={labelStyle}>주행거리</label>
                <select value={form.annual_km} onChange={(e) => fld('annual_km', e.target.value)} style={inputStyle}>
                  {ANNUAL_KMS.map((k) => <option key={k} value={k}>{k.toLocaleString()}km</option>)}
                </select></div>
              <div><label style={labelStyle}>만기일</label>
                <input type="date" value={form.end_date} onChange={(e) => fld('end_date', e.target.value)} style={inputStyle} /></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <div><label style={labelStyle}>월 렌트료 (VAT 포함)</label>
                <input type="number" value={form.monthly_fee} onChange={(e) => fld('monthly_fee', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>보증금</label>
                <input type="number" value={form.deposit} onChange={(e) => fld('deposit', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>선납월수</label>
                <input type="number" value={form.upfront_months} onChange={(e) => fld('upfront_months', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>인도비</label>
                <input type="number" value={form.delivery_fee} onChange={(e) => fld('delivery_fee', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>보험 옵션</label>
                <input value={form.insurance_option} onChange={(e) => fld('insurance_option', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>운전자 연령 (보험)</label>
                <select value={form.driver_age} onChange={(e) => fld('driver_age', e.target.value)} style={inputStyle}>
                  {DRIVER_AGES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select></div>
              <div><label style={labelStyle}>잔존가율 (%)</label>
                <input type="number" value={form.residual_rate} onChange={(e) => fld('residual_rate', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>유효기간</label>
                <input type="date" value={form.valid_until} onChange={(e) => fld('valid_until', e.target.value)} style={inputStyle} /></div>
            </div>

            <div><label style={labelStyle}>메모</label>
              <textarea value={form.memo} onChange={(e) => fld('memo', e.target.value)} rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} /></div>

            {msg && <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b' }}>⚠️ {msg}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <button onClick={() => router.push('/long-term-rentals')}
                style={{ padding: '10px 16px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>← 목록</button>
              <div style={{ flex: 1 }} />
              {form.status !== 'converted' && (
                <>
                  {form.status === 'sent' && (
                    <>
                      <button onClick={() => runStatus('rejected')} disabled={!!actionBusy}
                        style={{ padding: '9px 14px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, cursor: actionBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12, color: '#991b1b' }}>✗ 거부</button>
                      <button onClick={() => runStatus('accepted')} disabled={!!actionBusy}
                        style={{ padding: '9px 14px', background: 'rgba(16,185,129,0.12)', color: '#065f46', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 8, cursor: actionBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12 }}>✅ 수락</button>
                    </>
                  )}
                  {(form.status === 'draft' || form.status === 'sent') && (
                    <button onClick={runSend} disabled={!!actionBusy}
                      style={{ padding: '9px 14px', background: 'rgba(124,58,237,0.12)', color: '#5b21b6', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 8, cursor: actionBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12 }}>
                      {actionBusy === 'send' ? '발송 중…' : form.status === 'sent' ? '🔄 재발송' : '📤 발송'}
                    </button>
                  )}
                  {form.status === 'accepted' && (
                    <button onClick={runConvert} disabled={!!actionBusy}
                      style={{ padding: '9px 14px', background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', color: '#fff', border: 'none', borderRadius: 8, cursor: actionBusy ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13 }}>
                      {actionBusy === 'convert' ? '전환 중…' : '🔗 계약 전환'}
                    </button>
                  )}
                </>
              )}
              <button onClick={save} disabled={saving || !!actionBusy}
                style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff', border: 'none', borderRadius: 8, cursor: (saving || actionBusy) ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, opacity: (saving || actionBusy) ? 0.5 : 1 }}>
                {saving ? '저장 중…' : '✎ 수정 저장'}
              </button>
            </div>
          </div>

          {/* 우측 — 산출 */}
          <div style={{ position: 'sticky', top: 16, alignSelf: 'flex-start' }}>
            <CostSummaryPanel result={calcResult} loading={calcLoading} err={calcErr} onApply={applyCalc} />
          </div>
        </div>
      </div>
    </div>
  )
}
