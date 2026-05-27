'use client'

import { useMemo, useEffect, useState, useCallback } from 'react'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// CatalogPicker — 신차 카탈로그 캐스케이드 드롭다운 (PR-Q4-1)
//
// new_car_prices 테이블 기반 — 브랜드 → 모델 → 연식 → 트림 선택.
// 트림 선택 시 form 자동 채움 (brand/model/trim/fuel/cc + market_price).
// 카탈로그 비어있으면 「+ 카탈로그 등록」 페이지 안내.
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

export type CatalogRow = {
  id: string
  brand: string
  model: string
  year: number
  source: string | null
  price_data: any  // NewCarResult JSON
}

// AI fuel_type 한국어 → ENUM 매핑
function mapFuelToKey(fuelType: string | null | undefined): string {
  if (!fuelType) return ''
  const s = String(fuelType).toLowerCase()
  if (s.includes('전기') || s.includes('ev') || s.includes('electric')) return 'ev'
  if (s.includes('하이브리드') || s.includes('hybrid')) return 'hybrid'
  if (s.includes('디젤') || s.includes('diesel')) return 'diesel'
  return 'gasoline'
}

export type CatalogPickerForm = {
  vehicle_brand: string
  vehicle_model: string
  vehicle_year: string
  vehicle_trim: string
  vehicle_fuel: string
  vehicle_engine_cc: string
  vehicle_color_ext: string
  vehicle_color_int: string
  vehicle_options_text: string
  market_price: string
  purchase_price: string
  new_car_price_id: string
}

interface Props {
  form: CatalogPickerForm
  setForm: (updater: (f: any) => any) => void
  inputStyle: React.CSSProperties
  labelStyle: React.CSSProperties
}

export default function CatalogPicker({ form, setForm, inputStyle, labelStyle }: Props) {
  const [catalogRows, setCatalogRows] = useState<CatalogRow[]>([])
  const [loading, setLoading] = useState(false)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/new-car-prices', { headers })
      const json = await res.json().catch(() => ({}))
      if (Array.isArray(json?.data)) setCatalogRows(json.data as CatalogRow[])
    } catch { /* 무시 */ }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { refetch() }, [refetch])

  const selBrand = form.vehicle_brand
  const selModel = form.vehicle_model
  const selYear = form.vehicle_year

  const selectedRow = useMemo(() =>
    catalogRows.find((r) =>
      r.brand === selBrand && r.model === selModel && String(r.year) === String(selYear)
    ) || null,
  [catalogRows, selBrand, selModel, selYear])

  const brands = useMemo(() =>
    Array.from(new Set(catalogRows.map((r) => r.brand))).sort(),
  [catalogRows])
  const models = useMemo(() => {
    if (!selBrand) return []
    return Array.from(new Set(catalogRows.filter((r) => r.brand === selBrand).map((r) => r.model))).sort()
  }, [catalogRows, selBrand])
  const years = useMemo(() => {
    if (!selBrand || !selModel) return []
    return Array.from(new Set(catalogRows
      .filter((r) => r.brand === selBrand && r.model === selModel)
      .map((r) => r.year))).sort((a, b) => b - a)
  }, [catalogRows, selBrand, selModel])

  const variants = (selectedRow?.price_data?.variants || []) as any[]

  if (loading) {
    return <div style={{ ...GLASS.L1, padding: 14, borderRadius: 10, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>카탈로그 로딩…</div>
  }

  if (catalogRows.length === 0) {
    return (
      <div style={{ ...GLASS.L1, padding: 14, borderRadius: 10, textAlign: 'center', fontSize: 12 }}>
        <div style={{ color: '#475569', marginBottom: 8 }}>📭 카탈로그가 비어있습니다</div>
        <div style={{ color: '#94a3b8', marginBottom: 10, fontSize: 11 }}>
          상단 「🚗 신차 카탈로그」 탭에서 먼저 등록하세요.<br/>
          (AI 캡쳐로 견적서 PDF 한 번이면 자동 등록)
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>브랜드 <span style={{ color: '#94a3b8', fontWeight: 500 }}>({brands.length})</span></label>
          <select value={selBrand} onChange={(e) => {
            const v = e.target.value
            setForm((f: any) => ({ ...f, vehicle_brand: v, vehicle_model: '', vehicle_year: '', vehicle_trim: '', vehicle_engine_cc: '', vehicle_fuel: 'gasoline', market_price: '', purchase_price: '', new_car_price_id: '' }))
          }} style={inputStyle}>
            <option value="">— 선택 —</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>모델 <span style={{ color: '#94a3b8', fontWeight: 500 }}>({models.length})</span></label>
          <select value={selModel} onChange={(e) => {
            const v = e.target.value
            setForm((f: any) => ({ ...f, vehicle_model: v, vehicle_year: '', vehicle_trim: '', vehicle_engine_cc: '', market_price: '', purchase_price: '', new_car_price_id: '' }))
          }} disabled={!selBrand} style={inputStyle}>
            <option value="">— 선택 —</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>연식 <span style={{ color: '#94a3b8', fontWeight: 500 }}>({years.length})</span></label>
          <select value={selYear} onChange={(e) => {
            const v = e.target.value
            const row = catalogRows.find((r) => r.brand === selBrand && r.model === selModel && String(r.year) === v)
            setForm((f: any) => ({
              ...f, vehicle_year: v, vehicle_trim: '', vehicle_engine_cc: '',
              market_price: '', purchase_price: '',
              new_car_price_id: row?.id || '',
            }))
          }} disabled={!selModel} style={inputStyle}>
            <option value="">— 선택 —</option>
            {years.map((y) => <option key={y} value={String(y)}>{y}년</option>)}
          </select>
        </div>
      </div>

      {selectedRow && variants.length > 0 && (
        <div style={{ ...GLASS.L1, padding: 10, borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', marginBottom: 6 }}>
            트림 선택 ({variants.reduce((s, v) => s + (v.trims?.length || 0), 0)}개)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
            {variants.map((v: any, vi: number) =>
              v.trims?.map((t: any, ti: number) => {
                const fuelKey = mapFuelToKey(v.fuel_type)
                const active = form.vehicle_trim === t.name && form.vehicle_fuel === fuelKey
                return (
                  <button key={`${vi}-${ti}`} onClick={() => {
                    setForm((f: any) => ({
                      ...f,
                      vehicle_trim: t.name || '',
                      vehicle_fuel: fuelKey || f.vehicle_fuel,
                      vehicle_engine_cc: String(v.engine_cc || ''),
                      market_price: String(t.base_price || ''),
                      purchase_price: f.purchase_price || String(t.base_price || ''),
                    }))
                  }} style={{
                    ...GLASS.L3,
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px',
                    borderRadius: 6,
                    border: active ? `1px solid ${COLORS.borderBlue}` : '1px solid rgba(0,0,0,0.06)',
                    cursor: 'pointer', fontSize: 11, textAlign: 'left',
                    color: active ? COLORS.primary : '#1e293b',
                    fontWeight: active ? 700 : 500,
                  }}>
                    <span style={{ minWidth: 80, color: '#475569', fontSize: 10 }}>{v.fuel_type}</span>
                    <span style={{ flex: 1 }}>{t.name}</span>
                    <span style={{ fontWeight: 700, color: COLORS.primary }}>{(t.base_price || 0).toLocaleString('ko-KR')}원</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {selectedRow && form.vehicle_trim && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={labelStyle}>외장 색상</label>
            <input value={form.vehicle_color_ext} onChange={(e) => setForm((f: any) => ({ ...f, vehicle_color_ext: e.target.value }))} placeholder="흰색" style={inputStyle} /></div>
          <div><label style={labelStyle}>내장 색상</label>
            <input value={form.vehicle_color_int} onChange={(e) => setForm((f: any) => ({ ...f, vehicle_color_int: e.target.value }))} placeholder="검정" style={inputStyle} /></div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>옵션 패키지</label>
            <input value={form.vehicle_options_text} onChange={(e) => setForm((f: any) => ({ ...f, vehicle_options_text: e.target.value }))}
              placeholder="선루프, HUD, 통풍시트…" style={inputStyle} />
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: '#94a3b8' }}>
        💡 트림 선택 시 시장가(매장가)가 자동 채워집니다. 매입가는 영업이 할인 적용 후 수정하세요.
      </div>
    </div>
  )
}
