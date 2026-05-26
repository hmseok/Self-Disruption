'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// 장기렌트 견적 V3 (PR-Q2-4)
//
// 사용자 결정 사항 반영:
//   - lt_quotes 별도 테이블 (PR-Q1 long_term_quotes 폐기)
//   - 영업 동선: 매입가 + 차종 + 기간 입력 → 우측 7대 원가 실시간 자동 산출
//   - 「이 가격으로 적용」 → 좌측 monthly_fee 자동 채움 → 협상 수정 가능
//   - 신차 입력 3가지: 기존 차량 / 신차 카탈로그 / 신차 AI 캡쳐
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type QuoteRow = {
  id: string
  quote_no: string | null
  status: string
  contract_type: string
  rent_type: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  customer_company: string | null
  vehicle_id: string | null
  vehicle_car_number: string | null
  vehicle_brand: string | null
  vehicle_model: string | null
  vehicle_trim: string | null
  vehicle_year: number | null
  vehicle_fuel: string | null
  vehicle_engine_cc: number | null
  vehicle_color_ext: string | null
  vehicle_color_int: string | null
  vehicle_options_text: string | null
  new_car_price_id: string | null
  purchase_price: number | null
  market_price: number | null
  start_date: string | null
  months: number | null
  end_date: string | null
  annual_km: number | null
  residual_rate: number | null
  monthly_fee: number | null
  deposit: number | null
  upfront_months: number | null
  delivery_fee: number | null
  insurance_option: string | null
  cost_breakdown_json: unknown
  suggested_rent: number | null
  suggested_rent_with_vat: number | null
  margin_rate: number | null
  irr_annual: number | null
  breakeven_months: number | null
  competitive_index: number | null
  acquisition_total: number | null
  sent_at: string | null
  valid_until: string | null
  owner_id: string | null
  owner_name: string | null
  share_token: string | null
  share_views: number
  share_last_viewed_at: string | null
  converted_to_rental_id: string | null
  converted_at: string | null
  memo: string | null
  created_at: string
  updated_at: string
}

type CalcResult = {
  cost_breakdown: {
    depreciation: number; finance: number; insurance: number;
    maintenance: number; tax_inspection: number; risk: number;
    overhead: number; discount: number; total: number
  }
  suggested_rent: number
  suggested_rent_with_vat: number
  vat_amount: number
  margin_rate: number
  irr_annual: number
  breakeven_months: number
  competitive_index: number
  rent_to_price_ratio: number
  acquisition_total: number
}

type VehicleSource = 'existing' | 'catalog' | 'ai'
type FilterKey = 'all' | 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted'

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  draft:     { label: '✏️ 작성중',  bg: 'rgba(148,163,184,0.18)', fg: '#475569' },
  sent:      { label: '📤 발송됨',  bg: COLORS.bgBlue,            fg: COLORS.primary },
  accepted:  { label: '✅ 수락',    bg: 'rgba(16,185,129,0.14)',  fg: '#065f46' },
  rejected:  { label: '✗ 거부',     bg: 'rgba(239,68,68,0.12)',   fg: '#991b1b' },
  expired:   { label: '⏰ 만료',    bg: 'rgba(245,158,11,0.12)',  fg: '#b45309' },
  converted: { label: '🔗 계약',    bg: 'rgba(124,58,237,0.14)',  fg: '#5b21b6' },
}

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

function fmtWon(n: number | null | undefined): string {
  if (n == null) return '-'
  return `${Number(n).toLocaleString('ko-KR')}원`
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return '-'
  return String(s).slice(0, 10)
}

const emptyForm = {
  quote_no: '',
  contract_type: '기존차량',
  rent_type: 'return',
  customer_name: '', customer_phone: '', customer_email: '', customer_company: '',
  // 차량
  vehicle_id: '',
  vehicle_car_number: '',
  vehicle_brand: '', vehicle_model: '', vehicle_trim: '',
  vehicle_year: '', vehicle_fuel: 'gasoline', vehicle_engine_cc: '',
  vehicle_color_ext: '', vehicle_color_int: '', vehicle_options_text: '',
  new_car_price_id: '',
  purchase_price: '', market_price: '',
  // 계약
  start_date: '', months: '36', end_date: '',
  annual_km: '20000', residual_rate: '',
  // 영업
  monthly_fee: '', deposit: '', upfront_months: '', delivery_fee: '',
  insurance_option: '',
  // 발송
  valid_until: '', owner_name: '',
  memo: '',
}

export default function QuotesTab() {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<QuoteRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editRow, setEditRow] = useState<QuoteRow | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [vehicleSource, setVehicleSource] = useState<VehicleSource>('existing')
  const [saving, setSaving] = useState(false)
  const [modalMsg, setModalMsg] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  // 우측 실시간 산출
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [calcErr, setCalcErr] = useState<string | null>(null)
  const calcDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // AI 캡쳐
  const [aiUploading, setAiUploading] = useState(false)
  const [aiResult, setAiResult] = useState<any | null>(null)
  const [aiErr, setAiErr] = useState<string | null>(null)

  // 삭제 확인
  const [delTarget, setDelTarget] = useState<QuoteRow | null>(null)
  const [delBusy, setDelBusy] = useState(false)

  // 토스트
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const showToast = useCallback((m: { type: 'ok' | 'err'; text: string }) => {
    setToast(m)
    setTimeout(() => setToast(null), 4500)
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/lt-quotes?status=all', { headers })
      const json = await res.json().catch(() => ({}))
      if (Array.isArray(json?.data)) setRows(json.data as QuoteRow[])
      else { setRows([]); if (json?.error) setErr(json.error) }
    } catch (e) {
      setRows([]); setErr((e as Error)?.message || 'fetch 실패')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (rows === null && !loading) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(() => { setRows(null); fetchAll() }, [fetchAll])

  // ── 실시간 원가 산출 (디바운스 300ms) ──
  const runCalculate = useCallback(async (input: {
    purchase_price?: number; brand?: string; model?: string;
    fuel?: string; engine_cc?: number; term_months?: number;
    annual_km?: number; rent_type?: string;
  }) => {
    // 필수 입력 검증
    if (!input.purchase_price || !input.brand || !input.model ||
        !input.fuel || !input.engine_cc || !input.term_months ||
        !input.annual_km || !input.rent_type) {
      setCalcResult(null); setCalcErr(null); return
    }
    setCalcLoading(true); setCalcErr(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch('/api/lt-quotes/calculate', {
        method: 'POST', headers,
        body: JSON.stringify({
          purchase_price: input.purchase_price,
          brand: input.brand,
          model: input.model,
          fuel: input.fuel,
          engine_cc: input.engine_cc,
          term_months: input.term_months,
          annual_km: input.annual_km,
          rent_type: input.rent_type,
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
  }, [])

  // form 변경 시 자동 산출 (300ms 디바운스)
  useEffect(() => {
    if (!modalOpen) return
    if (calcDebounceRef.current) clearTimeout(calcDebounceRef.current)
    calcDebounceRef.current = setTimeout(() => {
      runCalculate({
        purchase_price: Number(form.purchase_price) || 0,
        brand: form.vehicle_brand,
        model: form.vehicle_model,
        fuel: form.vehicle_fuel,
        engine_cc: Number(form.vehicle_engine_cc) || 0,
        term_months: Number(form.months) || 0,
        annual_km: Number(form.annual_km) || 0,
        rent_type: form.rent_type,
      })
    }, 300)
    return () => { if (calcDebounceRef.current) clearTimeout(calcDebounceRef.current) }
  }, [modalOpen, form.purchase_price, form.vehicle_brand, form.vehicle_model,
       form.vehicle_fuel, form.vehicle_engine_cc, form.months, form.annual_km,
       form.rent_type, runCalculate])

  const openCreate = useCallback(() => {
    setEditRow(null); setForm({ ...emptyForm }); setModalMsg(null)
    setVehicleSource('existing'); setCalcResult(null); setCalcErr(null)
    setAiResult(null); setAiErr(null)
    setModalOpen(true)
  }, [])

  const openEdit = useCallback((r: QuoteRow) => {
    setEditRow(r)
    setForm({
      quote_no: r.quote_no || '',
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
      valid_until: r.valid_until ? String(r.valid_until).slice(0, 10) : '',
      owner_name: r.owner_name || '',
      memo: r.memo || '',
    })
    setVehicleSource(r.vehicle_id ? 'existing' : (r.new_car_price_id ? 'catalog' : 'ai'))
    setModalMsg(null); setCalcResult(null); setCalcErr(null)
    setAiResult(null); setAiErr(null)
    setModalOpen(true)
  }, [])

  // ── 저장 ──
  const save = useCallback(async () => {
    if (!form.customer_name.trim()) { setModalMsg('고객명은 필수입니다'); return }
    setSaving(true); setModalMsg(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const body: Record<string, unknown> = {
        quote_no: form.quote_no.trim() || null,
        contract_type: form.contract_type || '기존차량',
        rent_type: form.rent_type || 'return',
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
      // 자동 산출 결과도 같이 저장
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
      const url = editRow ? `/api/lt-quotes/${editRow.id}` : '/api/lt-quotes'
      const res = await fetch(url, { method: editRow ? 'PATCH' : 'POST', headers, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '저장 실패')
      if (!editRow && json?.data) setEditRow(json.data as QuoteRow)
      showToast({ type: 'ok', text: editRow ? '견적 수정 완료' : '견적 등록 완료' })
      refresh()
    } catch (e) {
      setModalMsg((e as Error)?.message || '저장 오류')
    } finally { setSaving(false) }
  }, [form, editRow, calcResult, refresh, showToast])

  // ── 액션: 발송 / 상태변경 / convert ──
  const runSend = useCallback(async () => {
    if (!editRow) return
    setActionBusy('send')
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/lt-quotes/${editRow.id}/send`, { method: 'POST', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '발송 실패')
      setEditRow(json.data as QuoteRow)
      showToast({ type: 'ok', text: '발송 완료 — 공유 링크 생성됨' })
      refresh()
    } catch (e) {
      showToast({ type: 'err', text: (e as Error)?.message || '발송 오류' })
    } finally { setActionBusy(null) }
  }, [editRow, refresh, showToast])

  const runStatus = useCallback(async (next: 'accepted' | 'rejected' | 'expired') => {
    if (!editRow) return
    setActionBusy(next)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/lt-quotes/${editRow.id}`, {
        method: 'PATCH', headers, body: JSON.stringify({ status: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '상태 변경 실패')
      setEditRow(json.data as QuoteRow)
      showToast({ type: 'ok', text: `상태가 ${STATUS_META[next]?.label || next} 로 변경됨` })
      refresh()
    } catch (e) {
      showToast({ type: 'err', text: (e as Error)?.message || '상태 변경 오류' })
    } finally { setActionBusy(null) }
  }, [editRow, refresh, showToast])

  const runConvert = useCallback(async () => {
    if (!editRow) return
    if (!confirm(`「${editRow.customer_name}」 견적을 장기렌트 계약으로 전환합니다.\n계속할까요?`)) return
    setActionBusy('convert')
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/lt-quotes/${editRow.id}/convert`, { method: 'POST', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '계약 전환 실패')
      const rentalId = json?.data?.rental?.id
      showToast({ type: 'ok', text: `계약 전환 완료 — ${String(rentalId).slice(0, 8)}` })
      setModalOpen(false); setEditRow(null); refresh()
    } catch (e) {
      showToast({ type: 'err', text: (e as Error)?.message || '계약 전환 오류' })
    } finally { setActionBusy(null) }
  }, [editRow, refresh, showToast])

  // ── 공유 링크 복사 + PDF ──
  const copyShareLink = useCallback(async () => {
    if (!editRow?.share_token) return
    const url = `${window.location.origin}/public/lt-quote/${editRow.share_token}`
    try {
      await navigator.clipboard.writeText(url)
      showToast({ type: 'ok', text: '공유 링크가 클립보드에 복사됨' })
    } catch {
      prompt('공유 링크를 복사해주세요:', url)
    }
  }, [editRow, showToast])

  const openPrint = useCallback(() => {
    if (!editRow?.share_token) return
    const url = `${window.location.origin}/public/lt-quote/${editRow.share_token}?print=1`
    window.open(url, '_blank', 'noopener')
  }, [editRow])

  // ── 「이 가격으로 적용」 — 좌측 monthly_fee 채움 ──
  const applyCalcRent = useCallback(() => {
    if (!calcResult) return
    setForm((f) => ({ ...f, monthly_fee: String(calcResult.suggested_rent_with_vat) }))
    showToast({ type: 'ok', text: `월 ${calcResult.suggested_rent_with_vat.toLocaleString('ko-KR')}원 적용` })
  }, [calcResult, showToast])

  // ── AI 캡쳐 (parse-quote 호출) ──
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
      showToast({ type: 'ok', text: 'AI 파싱 완료 — 트림/색상 선택 후 적용' })
    } catch (e) {
      setAiErr((e as Error)?.message || 'AI 파싱 오류')
    } finally { setAiUploading(false) }
  }, [showToast])

  // AI 결과에서 트림 선택 시 form 채움
  const applyAiTrim = useCallback((variantIdx: number, trimIdx: number) => {
    if (!aiResult) return
    const variant = aiResult.variants?.[variantIdx]
    const trim = variant?.trims?.[trimIdx]
    if (!variant || !trim) return
    setForm((f) => ({
      ...f,
      vehicle_brand: aiResult.brand || f.vehicle_brand,
      vehicle_model: aiResult.model || f.vehicle_model,
      vehicle_trim: trim.name || f.vehicle_trim,
      vehicle_year: String(aiResult.year || f.vehicle_year),
      vehicle_fuel: mapFuelToKey(variant.fuel_type) || f.vehicle_fuel,
      vehicle_engine_cc: String(variant.engine_cc || f.vehicle_engine_cc),
      market_price: String(trim.base_price || f.market_price),
      purchase_price: f.purchase_price || String(trim.base_price || ''),
    }))
    showToast({ type: 'ok', text: `${trim.name} 적용` })
  }, [aiResult, showToast])

  // ── 삭제 ──
  const runDelete = useCallback(async () => {
    if (!delTarget) return
    setDelBusy(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/lt-quotes/${delTarget.id}`, { method: 'DELETE', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '삭제 실패')
      setDelTarget(null)
      showToast({ type: 'ok', text: '견적 삭제 완료' })
      refresh()
    } catch (e) {
      showToast({ type: 'err', text: (e as Error)?.message || '삭제 오류' })
    } finally { setDelBusy(false) }
  }, [delTarget, refresh, showToast])

  // ── 데이터/필터 ──
  const allRows = rows || []
  const data = useMemo(() => ({
    all: allRows,
    draft: allRows.filter((r) => r.status === 'draft'),
    sent: allRows.filter((r) => r.status === 'sent'),
    accepted: allRows.filter((r) => r.status === 'accepted'),
    rejected: allRows.filter((r) => r.status === 'rejected'),
    expired: allRows.filter((r) => r.status === 'expired'),
    converted: allRows.filter((r) => r.status === 'converted'),
  }), [allRows])

  const activeData = data[filter]
  const filtered = useMemo(() => {
    if (!search.trim()) return activeData
    const q = search.toLowerCase()
    return activeData.filter((r) =>
      (r.customer_name || '').toLowerCase().includes(q) ||
      (r.vehicle_car_number || '').toLowerCase().includes(q) ||
      (r.vehicle_brand || '').toLowerCase().includes(q) ||
      (r.vehicle_model || '').toLowerCase().includes(q) ||
      (r.quote_no || '').toLowerCase().includes(q) ||
      (r.customer_phone || '').toLowerCase().includes(q),
    )
  }, [activeData, search])

  const counts = {
    all: data.all.length, draft: data.draft.length, sent: data.sent.length,
    accepted: data.accepted.length, converted: data.converted.length,
  }

  const statItems: StatItem[] = [
    { label: '📋 전체', value: counts.all, unit: '건', tint: 'blue' },
    { label: '✏️ 작성중', value: counts.draft, unit: '건', tint: 'purple' },
    { label: '📤 발송', value: counts.sent, unit: '건', tint: 'amber' },
    { label: '✅ 수락', value: counts.accepted, unit: '건', tint: 'green' },
    { label: '🔗 계약전환', value: counts.converted, unit: '건', tint: 'red' },
  ]
  const statActions: ActionButton[] = [
    { label: '견적 작성', onClick: openCreate, variant: 'primary', icon: '➕' },
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  const filterItems: FilterItem[] = [
    { key: 'all', label: '📋 전체', count: counts.all },
    { key: 'draft', label: '✏️ 작성중', count: counts.draft },
    { key: 'sent', label: '📤 발송', count: counts.sent },
    { key: 'accepted', label: '✅ 수락', count: counts.accepted },
    { key: 'converted', label: '🔗 계약전환', count: counts.converted },
  ]

  const columns: TableColumn<QuoteRow>[] = [
    { key: 'status', label: '상태', width: 92, align: 'center', sortBy: (r) => r.status || '',
      render: (r) => {
        const m = STATUS_META[r.status] || { label: r.status, bg: 'rgba(148,163,184,0.15)', fg: '#475569' }
        return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: m.bg, color: m.fg }}>{m.label}</span>
      },
    },
    { key: 'contract_type', label: '유형', width: 70, align: 'center', sortBy: (r) => r.contract_type || '',
      render: (r) => {
        const isNew = r.contract_type === '신차구입'
        return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap',
          background: isNew ? 'rgba(245,158,11,0.14)' : COLORS.bgBlue,
          color: isNew ? '#b45309' : COLORS.primary }}>
          {isNew ? '🆕 신차' : '🚗 기존'}
        </span>
      },
    },
    { key: 'customer', label: '고객', width: 160, sortBy: (r) => r.customer_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 160, fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: '#1e293b' }}>{r.customer_name}</span>
        {r.customer_company ? <span style={{ color: '#94a3b8' }}> · {r.customer_company}</span> : null}
      </span>,
    },
    { key: 'vehicle', label: '차량', width: 200, sortBy: (r) => r.vehicle_car_number || `${r.vehicle_brand} ${r.vehicle_model}`,
      render: (r) => {
        const spec = [r.vehicle_brand, r.vehicle_model, r.vehicle_trim].filter(Boolean).join(' ')
        return <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 200, fontSize: 12 }}>
          {r.vehicle_car_number
            ? <><span style={{ fontWeight: 800, color: '#0f2440' }}>🚗 {r.vehicle_car_number}</span>{spec ? <span style={{ color: '#94a3b8' }}> · {spec}</span> : null}</>
            : spec
              ? <span style={{ color: '#b45309', fontWeight: 600 }}>🚚 {spec}</span>
              : <span style={{ color: '#cbd5e1' }}>미지정</span>}
        </span>
      },
    },
    { key: 'months', label: '기간', width: 64, align: 'center', sortBy: (r) => Number(r.months || 0),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: '#475569' }}>{r.months ? `${r.months}개월` : '-'}</span>,
    },
    { key: 'monthly_fee', label: '월 렌트료', width: 116, align: 'right', sortBy: (r) => Number(r.monthly_fee || 0),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: '#0f2440' }}>{fmtWon(r.monthly_fee)}</span>,
    },
    { key: 'margin', label: '마진율', width: 70, align: 'center', sortBy: (r) => Number(r.margin_rate || 0),
      render: (r) => r.margin_rate != null
        ? <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: r.margin_rate >= 10 ? '#065f46' : r.margin_rate >= 5 ? '#b45309' : '#991b1b' }}>{r.margin_rate.toFixed(1)}%</span>
        : <span style={{ color: '#cbd5e1' }}>-</span>,
    },
    { key: 'owner', label: '담당', width: 80, align: 'center', sortBy: (r) => r.owner_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#475569' }}>{r.owner_name || '-'}</span>,
    },
    { key: 'sent_at', label: '발송', width: 84, align: 'center', sortBy: (r) => r.sent_at || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: '#94a3b8' }}>{fmtDate(r.sent_at)}</span>,
    },
    { key: 'views', label: '조회', width: 56, align: 'center', sortBy: (r) => Number(r.share_views || 0),
      render: (r) => r.share_views > 0
        ? <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: COLORS.primary }}>👁 {r.share_views}</span>
        : <span style={{ color: '#cbd5e1', fontSize: 11 }}>-</span>,
    },
    { key: 'actions', label: '액션', width: 80, align: 'center',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
          <button onClick={(e) => { e.stopPropagation(); openEdit(r) }}
            style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${COLORS.borderBlue}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>✎ 상세</button>
          <button onClick={(e) => { e.stopPropagation(); setDelTarget(r) }}
            style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#991b1b', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>🗑</button>
        </span>
      ),
    },
  ]

  const mobileCard: MobileCardConfig<QuoteRow> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>{STATUS_META[r.status]?.label || r.status} · {r.customer_name}</span>,
    subtitle: (r) => `${[r.vehicle_brand, r.vehicle_model].filter(Boolean).join(' ') || r.vehicle_car_number || '미지정'} · ${r.months || '-'}개월 · ${fmtWon(r.monthly_fee)}/월`,
  }

  const fld = (k: keyof typeof emptyForm, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const inputStyle = { ...GLASS.L1, width: '100%', padding: '8px 11px', borderRadius: 8, fontSize: 12, color: '#1e293b' } as const
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 } as const

  const shareUrl = editRow?.share_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/public/lt-quote/${editRow.share_token}`
    : null

  return (
    <>
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

      <DcStatStrip stats={statItems} actions={statActions} />
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="고객 / 차량 / 견적번호 검색…"
        filters={filterItems}
        activeFilter={filter}
        onFilterChange={(k) => setFilter(k as FilterKey)}
      />
      {err && (
        <div style={{ ...GLASS.L3, marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#991b1b' }}>
          ⚠ {err} — lt_quotes 마이그레이션이 적용됐는지 확인해주세요.
        </div>
      )}
      <NeuDataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        onRowClick={openEdit}
        loading={loading}
        emptyIcon="📝"
        emptyMessage="견적이 없습니다 — 「견적 작성」으로 추가하세요"
        mobileCard={mobileCard}
        defaultSort={{ key: 'updated_at', dir: 'desc' }}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
        💡 매입가 + 차종 + 기간 입력 시 우측에서 7대 원가·마진·IRR 실시간 자동 산출. 「이 가격으로 적용」으로 협상 출발.
      </div>

      {modalOpen && (
        <QuoteModal
          form={form} setForm={setForm} fld={fld}
          inputStyle={inputStyle} labelStyle={labelStyle}
          editRow={editRow} saving={saving} modalMsg={modalMsg}
          calcResult={calcResult} calcLoading={calcLoading} calcErr={calcErr}
          actionBusy={actionBusy}
          vehicleSource={vehicleSource} setVehicleSource={setVehicleSource}
          aiUploading={aiUploading} aiResult={aiResult} aiErr={aiErr}
          shareUrl={shareUrl}
          onClose={() => !saving && !actionBusy && setModalOpen(false)}
          onSave={save}
          onApplyCalc={applyCalcRent}
          onSend={runSend} onStatus={runStatus} onConvert={runConvert}
          onCopyLink={copyShareLink} onPrint={openPrint}
          onAiUpload={handleAiUpload} onApplyAiTrim={applyAiTrim}
        />
      )}

      {delTarget && (
        <div onClick={() => !delBusy && setDelTarget(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ ...GLASS.L5, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', width: 'min(400px, 96vw)', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px 14px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', margin: 0 }}>🗑 견적 삭제</h3>
              <div style={{ ...GLASS.L1, marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: 12, color: '#1e293b' }}>
                📝 {delTarget.quote_no || delTarget.id.slice(0, 8)} · {delTarget.customer_name}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: '#991b1b' }}>이 견적을 삭제합니다. 되돌릴 수 없습니다.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '12px 20px 16px' }}>
              <button onClick={() => !delBusy && setDelTarget(null)}
                style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#475569' }}>닫기</button>
              <button onClick={runDelete} disabled={delBusy}
                style={{ flex: 1, padding: '10px', color: '#fff', border: 'none', borderRadius: 9, cursor: delBusy ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 800, opacity: delBusy ? 0.5 : 1, background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                {delBusy ? '처리 중…' : '🗑 삭제하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── 헬퍼: AI fuel_type 한국어 → ENUM ───
function mapFuelToKey(fuelType: string | null | undefined): string {
  if (!fuelType) return ''
  const s = String(fuelType).toLowerCase()
  if (s.includes('전기') || s.includes('ev') || s.includes('electric')) return 'ev'
  if (s.includes('하이브리드') || s.includes('hybrid')) return 'hybrid'
  if (s.includes('디젤') || s.includes('diesel')) return 'diesel'
  return 'gasoline'
}

// ═══════════════════════════════════════════════════════════════════
// 견적 모달 (좌:입력 / 우:실시간 원가)
// ═══════════════════════════════════════════════════════════════════
function QuoteModal(props: {
  form: typeof emptyForm
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>
  fld: (k: keyof typeof emptyForm, v: string) => void
  inputStyle: React.CSSProperties
  labelStyle: React.CSSProperties
  editRow: QuoteRow | null
  saving: boolean
  modalMsg: string | null
  calcResult: CalcResult | null
  calcLoading: boolean
  calcErr: string | null
  actionBusy: string | null
  vehicleSource: VehicleSource
  setVehicleSource: React.Dispatch<React.SetStateAction<VehicleSource>>
  aiUploading: boolean
  aiResult: any | null
  aiErr: string | null
  shareUrl: string | null
  onClose: () => void
  onSave: () => void
  onApplyCalc: () => void
  onSend: () => void
  onStatus: (s: 'accepted' | 'rejected' | 'expired') => void
  onConvert: () => void
  onCopyLink: () => void
  onPrint: () => void
  onAiUpload: (f: File) => void
  onApplyAiTrim: (vIdx: number, tIdx: number) => void
}) {
  const { form, fld, inputStyle, labelStyle, editRow, saving, modalMsg,
          calcResult, calcLoading, calcErr, actionBusy,
          vehicleSource, setVehicleSource,
          aiUploading, aiResult, aiErr, shareUrl,
          onClose, onSave, onApplyCalc, onSend, onStatus, onConvert,
          onCopyLink, onPrint, onAiUpload, onApplyAiTrim } = props

  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ ...GLASS.L5, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', width: 'min(1200px, 98vw)', maxHeight: '95vh', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', margin: 0 }}>
            📝 장기렌트 견적 {editRow ? '상세' : '작성'}
          </h3>
          {editRow && (
            <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800,
              background: STATUS_META[editRow.status]?.bg || 'rgba(148,163,184,0.15)',
              color: STATUS_META[editRow.status]?.fg || '#475569' }}>
              {STATUS_META[editRow.status]?.label || editRow.status}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
        </div>

        {/* 본문 — 좌/우 2분할 */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 0 }}>
          {/* 좌측 — 입력 */}
          <div style={{ padding: '14px 18px', borderRight: '1px solid rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 11 }}>
            {/* 기본 */}
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

            {/* 고객 */}
            <div style={{ ...GLASS.L3, padding: 11, borderRadius: 10, border: `1px solid ${COLORS.borderBlue}` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.primary, marginBottom: 7 }}>👤 고객 정보</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelStyle}>고객명 *</label>
                  <input value={form.customer_name} onChange={(e) => fld('customer_name', e.target.value)} placeholder="필수" style={inputStyle} /></div>
                <div><label style={labelStyle}>연락처</label>
                  <input value={form.customer_phone} onChange={(e) => fld('customer_phone', e.target.value)} placeholder="010-…" style={inputStyle} /></div>
                <div><label style={labelStyle}>이메일</label>
                  <input value={form.customer_email} onChange={(e) => fld('customer_email', e.target.value)} placeholder="선택" style={inputStyle} /></div>
                <div><label style={labelStyle}>회사 / 소속</label>
                  <input value={form.customer_company} onChange={(e) => fld('customer_company', e.target.value)} placeholder="선택" style={inputStyle} /></div>
              </div>
            </div>

            {/* 차량 — 3가지 진입 탭 */}
            <div style={{ ...GLASS.L3, padding: 11, borderRadius: 10, border: '1px solid rgba(245,158,11,0.25)' }}>
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
                    <input value={form.vehicle_car_number} onChange={(e) => fld('vehicle_car_number', e.target.value)} placeholder="예: 12가3456" style={inputStyle} /></div>
                  <div><label style={labelStyle}>브랜드</label>
                    <input value={form.vehicle_brand} onChange={(e) => fld('vehicle_brand', e.target.value)} placeholder="현대" style={inputStyle} /></div>
                  <div><label style={labelStyle}>모델</label>
                    <input value={form.vehicle_model} onChange={(e) => fld('vehicle_model', e.target.value)} placeholder="쏘나타" style={inputStyle} /></div>
                  <div><label style={labelStyle}>연식</label>
                    <input type="number" value={form.vehicle_year} onChange={(e) => fld('vehicle_year', e.target.value)} placeholder="2024" style={inputStyle} /></div>
                  <div><label style={labelStyle}>연료</label>
                    <select value={form.vehicle_fuel} onChange={(e) => fld('vehicle_fuel', e.target.value)} style={inputStyle}>
                      {FUELS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select></div>
                  <div><label style={labelStyle}>배기량 (CC)</label>
                    <input type="number" value={form.vehicle_engine_cc} onChange={(e) => fld('vehicle_engine_cc', e.target.value)} placeholder="1999" style={inputStyle} /></div>
                </div>
              )}
              {vehicleSource === 'catalog' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div><label style={labelStyle}>브랜드</label>
                    <input value={form.vehicle_brand} onChange={(e) => fld('vehicle_brand', e.target.value)} placeholder="현대" style={inputStyle} /></div>
                  <div><label style={labelStyle}>모델</label>
                    <input value={form.vehicle_model} onChange={(e) => fld('vehicle_model', e.target.value)} placeholder="쏘나타" style={inputStyle} /></div>
                  <div><label style={labelStyle}>트림</label>
                    <input value={form.vehicle_trim} onChange={(e) => fld('vehicle_trim', e.target.value)} placeholder="프리미엄" style={inputStyle} /></div>
                  <div><label style={labelStyle}>연식</label>
                    <input type="number" value={form.vehicle_year} onChange={(e) => fld('vehicle_year', e.target.value)} placeholder="2026" style={inputStyle} /></div>
                  <div><label style={labelStyle}>연료</label>
                    <select value={form.vehicle_fuel} onChange={(e) => fld('vehicle_fuel', e.target.value)} style={inputStyle}>
                      {FUELS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select></div>
                  <div><label style={labelStyle}>배기량 (CC)</label>
                    <input type="number" value={form.vehicle_engine_cc} onChange={(e) => fld('vehicle_engine_cc', e.target.value)} placeholder="1999" style={inputStyle} /></div>
                  <div><label style={labelStyle}>외장</label>
                    <input value={form.vehicle_color_ext} onChange={(e) => fld('vehicle_color_ext', e.target.value)} placeholder="흰색" style={inputStyle} /></div>
                  <div><label style={labelStyle}>내장</label>
                    <input value={form.vehicle_color_int} onChange={(e) => fld('vehicle_color_int', e.target.value)} placeholder="검정" style={inputStyle} /></div>
                  <div style={{ gridColumn: 'span 3' }}><label style={labelStyle}>옵션 패키지</label>
                    <input value={form.vehicle_options_text} onChange={(e) => fld('vehicle_options_text', e.target.value)} placeholder="선루프, HUD, 통풍시트…" style={inputStyle} /></div>
                </div>
              )}
              {vehicleSource === 'ai' && (
                <div>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onAiUpload(f) }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <button onClick={() => fileRef.current?.click()} disabled={aiUploading}
                      style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${COLORS.borderBlue}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: aiUploading ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700 }}>
                      {aiUploading ? '🔄 파싱 중…' : '📷 견적서 PDF/이미지 업로드'}
                    </button>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>Gemini Vision · 약 ₩1~3/회</span>
                  </div>
                  {aiErr && <div style={{ fontSize: 11, color: '#991b1b', marginBottom: 6 }}>⚠ {aiErr}</div>}
                  {aiResult?.variants?.length > 0 && (
                    <div style={{ ...GLASS.L1, padding: 10, borderRadius: 8, fontSize: 11 }}>
                      <div style={{ fontWeight: 700, color: '#0f2440', marginBottom: 6 }}>{aiResult.brand} {aiResult.model} ({aiResult.year})</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                        {aiResult.variants.map((v: any, vi: number) =>
                          v.trims?.map((t: any, ti: number) => (
                            <button key={`${vi}-${ti}`} onClick={() => onApplyAiTrim(vi, ti)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 11, textAlign: 'left' }}>
                              <span style={{ fontWeight: 600, color: '#475569', minWidth: 80 }}>{v.fuel_type}</span>
                              <span style={{ flex: 1, color: '#1e293b' }}>{t.name}</span>
                              <span style={{ fontWeight: 700, color: COLORS.primary }}>{(t.base_price || 0).toLocaleString('ko-KR')}원</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                  {/* AI 채움 후 영업이 수정 가능한 필드 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
                    <div><label style={labelStyle}>브랜드</label>
                      <input value={form.vehicle_brand} onChange={(e) => fld('vehicle_brand', e.target.value)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>모델</label>
                      <input value={form.vehicle_model} onChange={(e) => fld('vehicle_model', e.target.value)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>트림</label>
                      <input value={form.vehicle_trim} onChange={(e) => fld('vehicle_trim', e.target.value)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>연료</label>
                      <select value={form.vehicle_fuel} onChange={(e) => fld('vehicle_fuel', e.target.value)} style={inputStyle}>
                        {FUELS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select></div>
                    <div><label style={labelStyle}>배기량 (CC)</label>
                      <input type="number" value={form.vehicle_engine_cc} onChange={(e) => fld('vehicle_engine_cc', e.target.value)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>연식</label>
                      <input type="number" value={form.vehicle_year} onChange={(e) => fld('vehicle_year', e.target.value)} style={inputStyle} /></div>
                  </div>
                </div>
              )}
            </div>

            {/* 매입가 / 시장가 — 원가 산출 핵심 */}
            <div style={{ ...GLASS.L3, padding: 11, borderRadius: 10, border: '1px solid rgba(16,185,129,0.25)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#065f46', marginBottom: 7 }}>💵 매입가 (원가 산출 핵심)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={labelStyle}>매입가 (원, VAT 포함) *</label>
                  <input type="number" value={form.purchase_price} onChange={(e) => fld('purchase_price', e.target.value)} placeholder="할인 후 실제 매입가" style={inputStyle} /></div>
                <div><label style={labelStyle}>시장가 (참조)</label>
                  <input type="number" value={form.market_price} onChange={(e) => fld('market_price', e.target.value)} placeholder="출고가" style={inputStyle} /></div>
              </div>
            </div>

            {/* 계약 조건 */}
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

            {/* 영업 협상 입력 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <div><label style={labelStyle}>월 렌트료 (VAT 포함)</label>
                <input type="number" value={form.monthly_fee} onChange={(e) => fld('monthly_fee', e.target.value)} placeholder="우측 산출가 또는 협상가" style={inputStyle} /></div>
              <div><label style={labelStyle}>보증금</label>
                <input type="number" value={form.deposit} onChange={(e) => fld('deposit', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>선납월수</label>
                <input type="number" value={form.upfront_months} onChange={(e) => fld('upfront_months', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>인도비</label>
                <input type="number" value={form.delivery_fee} onChange={(e) => fld('delivery_fee', e.target.value)} style={inputStyle} /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>보험 옵션</label>
                <input value={form.insurance_option} onChange={(e) => fld('insurance_option', e.target.value)} placeholder="자차/대물/대인" style={inputStyle} /></div>
              <div><label style={labelStyle}>잔존가율 (%)</label>
                <input type="number" value={form.residual_rate} onChange={(e) => fld('residual_rate', e.target.value)} placeholder="인수형" style={inputStyle} /></div>
              <div><label style={labelStyle}>유효기간</label>
                <input type="date" value={form.valid_until} onChange={(e) => fld('valid_until', e.target.value)} style={inputStyle} /></div>
            </div>

            <div><label style={labelStyle}>메모</label>
              <textarea value={form.memo} onChange={(e) => fld('memo', e.target.value)} rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} /></div>

            {/* 공유 영역 */}
            {editRow && shareUrl && (
              <div style={{ ...GLASS.L3, padding: 11, borderRadius: 10, border: `1px solid ${COLORS.borderBlue}` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.primary, marginBottom: 7 }}>🔗 공유 링크</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input readOnly value={shareUrl} style={{ ...inputStyle, fontSize: 11 }} onFocus={(e) => e.currentTarget.select()} />
                  <button onClick={onCopyLink}
                    style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${COLORS.borderBlue}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>📋 복사</button>
                  <button onClick={onPrint}
                    style={{ ...GLASS.L3, padding: '8px 12px', borderRadius: 8, color: '#475569', cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>🖨 PDF</button>
                </div>
                {editRow.share_views > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
                    👁 {editRow.share_views}회 조회 · 최근 {fmtDate(editRow.share_last_viewed_at)}
                  </div>
                )}
              </div>
            )}

            {modalMsg && <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b' }}>⚠️ {modalMsg}</div>}
          </div>

          {/* 우측 — 실시간 원가 산출 */}
          <div style={{ padding: '14px 18px', background: 'rgba(248,250,253,0.5)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.primary, display: 'flex', alignItems: 'center', gap: 6 }}>
              📊 실시간 원가 산출
              {calcLoading && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>(계산 중…)</span>}
            </div>

            {!calcResult && !calcErr && (
              <div style={{ ...GLASS.L3, padding: 14, borderRadius: 10, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
                매입가 / 브랜드 / 모델 / 연료 / CC / 기간 / 주행거리 입력 시 자동 산출
              </div>
            )}

            {calcErr && (
              <div style={{ ...GLASS.L3, padding: 11, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontSize: 11, color: '#991b1b' }}>
                ⚠ {calcErr}
              </div>
            )}

            {calcResult && (
              <>
                {/* 적정 월 렌트료 (강조) */}
                <div style={{ padding: 14, borderRadius: 12, background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff' }}>
                  <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 700 }}>적정 월 렌트료 (VAT 포함)</div>
                  <div style={{ fontSize: 24, fontWeight: 900, marginTop: 2 }}>{calcResult.suggested_rent_with_vat.toLocaleString('ko-KR')}원</div>
                  <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>VAT 별도: {calcResult.suggested_rent.toLocaleString('ko-KR')}원</div>
                  <button onClick={onApplyCalc}
                    style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.95)', color: COLORS.primary, border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 800, width: '100%' }}>
                    ↓ 이 가격으로 적용
                  </button>
                </div>

                {/* 7대 원가 */}
                <div style={{ ...GLASS.L3, padding: 11, borderRadius: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', marginBottom: 7 }}>원가 구성 (월)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[
                      { label: '감가상각', value: calcResult.cost_breakdown.depreciation, dot: '#3b6eb5' },
                      { label: '금융비용', value: calcResult.cost_breakdown.finance, dot: '#6366f1' },
                      { label: '보험료', value: calcResult.cost_breakdown.insurance, dot: '#10b981' },
                      { label: '정비비', value: calcResult.cost_breakdown.maintenance, dot: '#f59e0b' },
                      { label: '세금·검사', value: calcResult.cost_breakdown.tax_inspection, dot: '#ef4444' },
                      { label: '리스크', value: calcResult.cost_breakdown.risk, dot: '#a855f7' },
                      { label: '간접비', value: calcResult.cost_breakdown.overhead, dot: '#64748b' },
                    ].map((it) => (
                      <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: it.dot }} />
                        <span style={{ color: '#475569', flex: 1 }}>{it.label}</span>
                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{it.value.toLocaleString('ko-KR')}원</span>
                      </div>
                    ))}
                    {calcResult.cost_breakdown.discount < 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
                        <span style={{ color: '#065f46', flex: 1 }}>할인</span>
                        <span style={{ fontWeight: 700, color: '#065f46' }}>{calcResult.cost_breakdown.discount.toLocaleString('ko-KR')}원</span>
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px dashed rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ fontWeight: 800, color: '#0f2440' }}>합계 (원가)</span>
                    <span style={{ fontWeight: 800, color: '#0f2440' }}>{calcResult.cost_breakdown.total.toLocaleString('ko-KR')}원</span>
                  </div>
                </div>

                {/* 분석 */}
                <div style={{ ...GLASS.L3, padding: 11, borderRadius: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', marginBottom: 7 }}>분석</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11 }}>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: 10 }}>마진율</div>
                      <div style={{ fontWeight: 800, color: calcResult.margin_rate >= 10 ? '#065f46' : calcResult.margin_rate >= 5 ? '#b45309' : '#991b1b' }}>{calcResult.margin_rate.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: 10 }}>연 IRR</div>
                      <div style={{ fontWeight: 800, color: '#0f2440' }}>{calcResult.irr_annual.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: 10 }}>손익분기</div>
                      <div style={{ fontWeight: 800, color: '#0f2440' }}>{calcResult.breakeven_months}개월</div>
                    </div>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: 10 }}>경쟁력</div>
                      <div style={{ fontWeight: 800, color: calcResult.competitive_index <= 1.0 ? '#065f46' : '#b45309' }}>{calcResult.competitive_index.toFixed(2)}</div>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ color: '#94a3b8', fontSize: 10 }}>취득원가 합계</div>
                      <div style={{ fontWeight: 800, color: '#0f2440' }}>{calcResult.acquisition_total.toLocaleString('ko-KR')}원</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 풋터 */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderTop: '1px solid rgba(0,0,0,0.06)', flexWrap: 'wrap' }}>
          <button onClick={onClose}
            style={{ padding: '9px 14px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>닫기</button>
          <div style={{ flex: 1 }} />
          {editRow && editRow.status !== 'converted' && (
            <>
              {editRow.status === 'sent' && (
                <>
                  <button onClick={() => onStatus('rejected')} disabled={!!actionBusy}
                    style={{ padding: '9px 12px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, cursor: actionBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12, color: '#991b1b' }}>✗ 거부</button>
                  <button onClick={() => onStatus('accepted')} disabled={!!actionBusy}
                    style={{ padding: '9px 12px', background: 'rgba(16,185,129,0.12)', color: '#065f46', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 8, cursor: actionBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12 }}>✅ 수락</button>
                </>
              )}
              {(editRow.status === 'draft' || editRow.status === 'sent') && (
                <button onClick={onSend} disabled={!!actionBusy}
                  style={{ padding: '9px 12px', background: 'rgba(124,58,237,0.12)', color: '#5b21b6', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 8, cursor: actionBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12 }}>
                  {actionBusy === 'send' ? '발송 중…' : editRow.status === 'sent' ? '🔄 재발송' : '📤 발송'}
                </button>
              )}
              {editRow.status === 'accepted' && (
                <button onClick={onConvert} disabled={!!actionBusy}
                  style={{ padding: '9px 14px', background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', color: '#fff', border: 'none', borderRadius: 8, cursor: actionBusy ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 12 }}>
                  {actionBusy === 'convert' ? '전환 중…' : '🔗 계약 전환'}
                </button>
              )}
            </>
          )}
          <button onClick={onSave} disabled={saving || !!actionBusy}
            style={{ padding: '9px 18px', background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff', border: 'none', borderRadius: 8, cursor: (saving || actionBusy) ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, opacity: (saving || actionBusy) ? 0.5 : 1 }}>
            {saving ? '저장 중…' : editRow ? '✎ 수정 저장' : '➕ 견적 등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
