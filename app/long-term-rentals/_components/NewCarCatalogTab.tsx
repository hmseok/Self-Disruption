'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// 신차 카탈로그 탭 (PR-Q3-1)
//
// 사용자 결정 (2026-05-26):
//   - 카탈로그를 별도 탭으로 (모달 안 X)
//   - 위치: /long-term-rentals 첫 탭 (작성중 앞)
//   - 등록 방식: AI 캡쳐 + 수동 동등
//   - 시드: 대표 5~10 차종 (별도 SQL)
//
// new_car_prices 테이블 활용:
//   id / brand / model / year / source / price_data JSON
//   price_data = NewCarResult (variants[].trims[].base_price + colors + options)
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type CatalogRow = {
  id: string
  brand: string
  model: string
  year: number
  source: string | null
  price_data: any  // NewCarResult JSON
  created_at: string
  updated_at: string
}

type FilterKey = 'all' | 'gasoline' | 'diesel' | 'hybrid' | 'ev'

const FUEL_LABEL: Record<string, string> = {
  gasoline: '가솔린', diesel: '디젤', hybrid: '하이브리드', ev: '전기',
}

function fmtWon(n: number | null | undefined): string {
  if (n == null) return '-'
  return `${Number(n).toLocaleString('ko-KR')}원`
}

// price_data 안 fuel_type 첫 variant 만 표시용
function firstFuel(pd: any): string {
  return pd?.variants?.[0]?.fuel_type || '-'
}
function firstTrimPrice(pd: any): number | null {
  const t = pd?.variants?.[0]?.trims?.[0]
  return t?.base_price || null
}
function trimCount(pd: any): number {
  return (pd?.variants || []).reduce((s: number, v: any) => s + (v.trims?.length || 0), 0)
}
function fuelMatches(pd: any, fuel: FilterKey): boolean {
  if (fuel === 'all') return true
  const target = FUEL_LABEL[fuel]
  return (pd?.variants || []).some((v: any) => String(v.fuel_type || '').includes(target))
}

const emptyForm = {
  brand: '', model: '', year: String(new Date().getFullYear()),
  source: '수동 입력',
  // 트림 1개 기본 (수동 등록 단순화)
  fuel_type: '가솔린',
  engine_cc: '',
  trim_name: '',
  base_price: '',
  exterior_colors: '',  // 콤마 구분
  interior_colors: '',
  options_text: '',
}

export default function NewCarCatalogTab() {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<CatalogRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // 등록/수정 모달
  const [modalOpen, setModalOpen] = useState(false)
  const [editRow, setEditRow] = useState<CatalogRow | null>(null)
  const [registerMode, setRegisterMode] = useState<'manual' | 'ai'>('manual')
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [modalMsg, setModalMsg] = useState<string | null>(null)

  // AI 캡쳐
  const [aiUploading, setAiUploading] = useState(false)
  const [aiResult, setAiResult] = useState<any | null>(null)
  const [aiErr, setAiErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 삭제
  const [delTarget, setDelTarget] = useState<CatalogRow | null>(null)
  const [delBusy, setDelBusy] = useState(false)

  // 토스트
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const showToast = useCallback((m: { type: 'ok' | 'err'; text: string }) => {
    setToast(m); setTimeout(() => setToast(null), 4500)
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/new-car-prices', { headers })
      const json = await res.json().catch(() => ({}))
      if (Array.isArray(json?.data)) setRows(json.data as CatalogRow[])
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

  const openCreate = useCallback(() => {
    setEditRow(null); setForm({ ...emptyForm }); setModalMsg(null)
    setRegisterMode('manual')
    setAiResult(null); setAiErr(null)
    setModalOpen(true)
  }, [])

  const openEdit = useCallback((r: CatalogRow) => {
    setEditRow(r)
    const pd = r.price_data || {}
    const v0 = pd.variants?.[0]
    const t0 = v0?.trims?.[0]
    setForm({
      brand: r.brand,
      model: r.model,
      year: String(r.year),
      source: r.source || '수동 입력',
      fuel_type: v0?.fuel_type || '가솔린',
      engine_cc: v0?.engine_cc != null ? String(v0.engine_cc) : '',
      trim_name: t0?.name || '',
      base_price: t0?.base_price != null ? String(t0.base_price) : '',
      exterior_colors: (t0?.exterior_colors || []).map((c: any) => c.name).join(', '),
      interior_colors: (t0?.interior_colors || []).map((c: any) => c.name).join(', '),
      options_text: (t0?.options || []).map((o: any) => o.name).join(', '),
    })
    setRegisterMode('manual')
    setAiResult(null); setAiErr(null)
    setModalMsg(null); setModalOpen(true)
  }, [])

  const save = useCallback(async () => {
    if (!form.brand.trim() || !form.model.trim() || !form.year) {
      setModalMsg('브랜드 / 모델 / 연식은 필수입니다'); return
    }
    setSaving(true); setModalMsg(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      // price_data 구성 (NewCarResult 형식)
      const priceData = aiResult || {
        brand: form.brand.trim(),
        model: form.model.trim(),
        year: Number(form.year),
        variants: [{
          variant_name: form.trim_name.trim() || '기본',
          fuel_type: form.fuel_type,
          engine_cc: Number(form.engine_cc) || 0,
          trims: [{
            name: form.trim_name.trim() || '기본 트림',
            base_price: Number(form.base_price) || 0,
            exterior_colors: form.exterior_colors
              .split(',').map((s) => s.trim()).filter(Boolean)
              .map((name) => ({ name, price: 0 })),
            interior_colors: form.interior_colors
              .split(',').map((s) => s.trim()).filter(Boolean)
              .map((name) => ({ name, price: 0 })),
            options: form.options_text
              .split(',').map((s) => s.trim()).filter(Boolean)
              .map((name) => ({ name, price: 0 })),
          }],
        }],
        available: true,
        source: form.source || 'manual',
      }
      const body = {
        brand: form.brand.trim(),
        model: form.model.trim(),
        year: Number(form.year),
        source: form.source || (aiResult ? 'ai-parse-quote' : '수동 입력'),
        price_data: priceData,
      }
      const url = editRow ? `/api/new-car-prices/${editRow.id}` : '/api/new-car-prices'
      const res = await fetch(url, { method: editRow ? 'PATCH' : 'POST', headers, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '저장 실패')
      setModalOpen(false)
      showToast({ type: 'ok', text: editRow ? '카탈로그 수정 완료' : '카탈로그 등록 완료' })
      refresh()
    } catch (e) {
      setModalMsg((e as Error)?.message || '저장 오류')
    } finally { setSaving(false) }
  }, [form, editRow, aiResult, refresh, showToast])

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
      const parsed = json.data || json
      setAiResult(parsed)
      // form 자동 채움 (사용자가 직접 저장 또는 수정 가능)
      setForm((f) => ({
        ...f,
        brand: parsed.brand || f.brand,
        model: parsed.model || f.model,
        year: String(parsed.year || f.year),
        source: 'ai-parse-quote',
        fuel_type: parsed.variants?.[0]?.fuel_type || f.fuel_type,
        engine_cc: String(parsed.variants?.[0]?.engine_cc || f.engine_cc),
        trim_name: parsed.variants?.[0]?.trims?.[0]?.name || f.trim_name,
        base_price: String(parsed.variants?.[0]?.trims?.[0]?.base_price || f.base_price),
      }))
      showToast({ type: 'ok', text: `AI 파싱 완료 — ${parsed.variants?.length || 0} variants` })
    } catch (e) {
      setAiErr((e as Error)?.message || 'AI 파싱 오류')
    } finally { setAiUploading(false) }
  }, [showToast])

  // 삭제
  const runDelete = useCallback(async () => {
    if (!delTarget) return
    setDelBusy(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/new-car-prices/${delTarget.id}`, { method: 'DELETE', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '삭제 실패')
      setDelTarget(null)
      showToast({ type: 'ok', text: '카탈로그 삭제 완료' })
      refresh()
    } catch (e) {
      showToast({ type: 'err', text: (e as Error)?.message || '삭제 오류' })
    } finally { setDelBusy(false) }
  }, [delTarget, refresh, showToast])

  // ── 데이터 ──
  const allRows = rows || []
  const filteredByFuel = useMemo(() => {
    if (filter === 'all') return allRows
    return allRows.filter((r) => fuelMatches(r.price_data, filter))
  }, [allRows, filter])
  const filtered = useMemo(() => {
    if (!search.trim()) return filteredByFuel
    const q = search.toLowerCase()
    return filteredByFuel.filter((r) =>
      (r.brand || '').toLowerCase().includes(q) ||
      (r.model || '').toLowerCase().includes(q),
    )
  }, [filteredByFuel, search])

  const counts = useMemo(() => {
    const c = { all: allRows.length, gasoline: 0, diesel: 0, hybrid: 0, ev: 0 }
    for (const r of allRows) {
      for (const v of (r.price_data?.variants || [])) {
        const ft = String(v.fuel_type || '')
        if (ft.includes('가솔린')) c.gasoline++
        else if (ft.includes('디젤')) c.diesel++
        else if (ft.includes('하이브리드') || ft.includes('하브')) c.hybrid++
        else if (ft.includes('전기') || ft.includes('EV') || ft.includes('Electric')) c.ev++
      }
    }
    return c
  }, [allRows])

  const statItems: StatItem[] = [
    { label: '🚗 전체 차종', value: counts.all, unit: '건', tint: 'blue' },
    { label: '⛽ 가솔린 trim', value: counts.gasoline, unit: '건', tint: 'amber' },
    { label: '🛢 디젤 trim', value: counts.diesel, unit: '건', tint: 'red' },
    { label: '🔋 하이브리드', value: counts.hybrid, unit: '건', tint: 'green' },
    { label: '⚡ 전기', value: counts.ev, unit: '건', tint: 'purple' },
  ]
  const statActions: ActionButton[] = [
    { label: '신차 등록', onClick: openCreate, variant: 'primary', icon: '➕' },
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  const filterItems: FilterItem[] = [
    { key: 'all', label: '전체', count: counts.all },
    { key: 'gasoline', label: '가솔린', count: counts.gasoline },
    { key: 'diesel', label: '디젤', count: counts.diesel },
    { key: 'hybrid', label: '하이브리드', count: counts.hybrid },
    { key: 'ev', label: '전기', count: counts.ev },
  ]

  const columns: TableColumn<CatalogRow>[] = [
    { key: 'brand', label: '브랜드', width: 90, sortBy: (r) => r.brand,
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#0f2440', fontSize: 12 }}>{r.brand}</span>,
    },
    { key: 'model', label: '모델', width: 160, sortBy: (r) => r.model,
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#1e293b', fontWeight: 600 }}>{r.model}</span>,
    },
    { key: 'year', label: '연식', width: 64, align: 'center', sortBy: (r) => r.year,
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: '#475569' }}>{r.year}년</span>,
    },
    { key: 'fuel', label: '연료', width: 100, align: 'center', sortBy: (r) => firstFuel(r.price_data),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: '#475569' }}>{firstFuel(r.price_data)}</span>,
    },
    { key: 'trims', label: '트림 수', width: 70, align: 'center', sortBy: (r) => trimCount(r.price_data),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: COLORS.primary }}>{trimCount(r.price_data)}개</span>,
    },
    { key: 'price', label: '대표가 (VAT 포함)', width: 130, align: 'right', sortBy: (r) => firstTrimPrice(r.price_data) || 0,
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: '#0f2440' }}>{fmtWon(firstTrimPrice(r.price_data))}</span>,
    },
    { key: 'source', label: '등록 방식', width: 110, align: 'center', sortBy: (r) => r.source || '',
      render: (r) => {
        const isAi = (r.source || '').toLowerCase().includes('ai')
        return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
          background: isAi ? 'rgba(124,58,237,0.14)' : 'rgba(148,163,184,0.18)',
          color: isAi ? '#5b21b6' : '#475569' }}>
          {isAi ? '🤖 AI' : '✍️ 수동'}
        </span>
      },
    },
    { key: 'actions', label: '액션', width: 80, align: 'center',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
          <button onClick={(e) => { e.stopPropagation(); openEdit(r) }}
            style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${COLORS.borderBlue}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>✎ 편집</button>
          <button onClick={(e) => { e.stopPropagation(); setDelTarget(r) }}
            style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#991b1b', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>🗑</button>
        </span>
      ),
    },
  ]

  const mobileCard: MobileCardConfig<CatalogRow> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>{r.brand} {r.model} ({r.year})</span>,
    subtitle: (r) => `${firstFuel(r.price_data)} · 트림 ${trimCount(r.price_data)}개 · ${fmtWon(firstTrimPrice(r.price_data))}`,
  }

  const fld = (k: keyof typeof emptyForm, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const inputStyle = { ...GLASS.L1, width: '100%', padding: '8px 11px', borderRadius: 8, fontSize: 12, color: '#1e293b' } as const
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 } as const

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
        placeholder="브랜드 / 모델 검색…"
        filters={filterItems}
        activeFilter={filter}
        onFilterChange={(k) => setFilter(k as FilterKey)}
      />
      {err && (
        <div style={{ ...GLASS.L3, marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#991b1b' }}>
          ⚠ {err}
        </div>
      )}
      <NeuDataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        onRowClick={openEdit}
        loading={loading}
        emptyIcon="🚗"
        emptyMessage="등록된 신차 카탈로그가 없습니다 — 「신차 등록」으로 시작하세요"
        mobileCard={mobileCard}
        defaultSort={{ key: 'updated_at', dir: 'desc' }}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
        💡 영업이 한 번 등록한 신차는 모든 견적에서 재사용됩니다. AI 캡쳐 후 자동으로 카탈로그에 쌓입니다.
      </div>

      {modalOpen && (
        <div onClick={() => !saving && setModalOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ ...GLASS.L5, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', width: 'min(720px, 96vw)', maxHeight: '92vh', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', margin: 0 }}>🚗 신차 카탈로그 {editRow ? '편집' : '등록'}</h3>
              {!editRow && (
                <div style={{ display: 'inline-flex', gap: 4, marginLeft: 10 }}>
                  {([
                    { k: 'manual' as const, label: '✍️ 수동 등록' },
                    { k: 'ai' as const, label: '🤖 AI 캡쳐' },
                  ]).map((t) => (
                    <button key={t.k} onClick={() => setRegisterMode(t.k)}
                      style={{ padding: '4px 9px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        border: registerMode === t.k ? `1px solid ${COLORS.borderBlue}` : '1px solid rgba(0,0,0,0.08)',
                        background: registerMode === t.k ? COLORS.bgBlue : GLASS.L2.background,
                        color: registerMode === t.k ? COLORS.primary : '#475569' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={() => !saving && setModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              {/* AI 캡쳐 영역 — registerMode='ai' 또는 편집 모드 X */}
              {!editRow && registerMode === 'ai' && (
                <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10, border: '1px solid rgba(124,58,237,0.25)' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#5b21b6', marginBottom: 8 }}>🤖 AI 견적서 파싱</div>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAiUpload(f) }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => fileRef.current?.click()} disabled={aiUploading}
                      style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${COLORS.borderBlue}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: aiUploading ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700 }}>
                      {aiUploading ? '🔄 파싱 중…' : '📷 PDF/이미지 업로드'}
                    </button>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>Gemini Vision · ~₩1~3/회</span>
                  </div>
                  {aiErr && <div style={{ fontSize: 11, color: '#991b1b', marginTop: 6 }}>⚠ {aiErr}</div>}
                  {aiResult && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#475569' }}>
                      ✓ 추출 완료 — {aiResult.brand} {aiResult.model} ({aiResult.year}) · variants {aiResult.variants?.length || 0}개 · 트림 {(aiResult.variants || []).reduce((s: number, v: any) => s + (v.trims?.length || 0), 0)}개
                      <br/><span style={{ color: '#94a3b8' }}>아래 필드 확인 후 「저장」</span>
                    </div>
                  )}
                </div>
              )}

              {/* 기본 정보 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div><label style={labelStyle}>브랜드 *</label>
                  <input value={form.brand} onChange={(e) => fld('brand', e.target.value)} placeholder="현대 / BMW…" style={inputStyle} /></div>
                <div><label style={labelStyle}>모델 *</label>
                  <input value={form.model} onChange={(e) => fld('model', e.target.value)} placeholder="쏘나타 / 520i…" style={inputStyle} /></div>
                <div><label style={labelStyle}>연식 *</label>
                  <input type="number" value={form.year} onChange={(e) => fld('year', e.target.value)} placeholder="2026" style={inputStyle} /></div>
              </div>

              {/* 트림 정보 (수동 등록 — 단순 1트림) */}
              <div style={{ ...GLASS.L3, padding: 11, borderRadius: 10, border: '1px solid rgba(245,158,11,0.25)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#b45309', marginBottom: 7 }}>🚗 대표 트림 (단순 등록)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div><label style={labelStyle}>연료</label>
                    <select value={form.fuel_type} onChange={(e) => fld('fuel_type', e.target.value)} style={inputStyle}>
                      <option value="가솔린">가솔린</option>
                      <option value="디젤">디젤</option>
                      <option value="하이브리드">하이브리드</option>
                      <option value="전기">전기</option>
                    </select></div>
                  <div><label style={labelStyle}>배기량 (CC)</label>
                    <input type="number" value={form.engine_cc} onChange={(e) => fld('engine_cc', e.target.value)} placeholder="1999" style={inputStyle} /></div>
                  <div><label style={labelStyle}>대표가 (VAT 포함)</label>
                    <input type="number" value={form.base_price} onChange={(e) => fld('base_price', e.target.value)} placeholder="35000000" style={inputStyle} /></div>
                  <div style={{ gridColumn: 'span 3' }}><label style={labelStyle}>트림명</label>
                    <input value={form.trim_name} onChange={(e) => fld('trim_name', e.target.value)} placeholder="프리미엄 / 디럭스…" style={inputStyle} /></div>
                  <div><label style={labelStyle}>외장 색상 (콤마 구분)</label>
                    <input value={form.exterior_colors} onChange={(e) => fld('exterior_colors', e.target.value)} placeholder="흰색, 검정, 회색" style={inputStyle} /></div>
                  <div><label style={labelStyle}>내장 색상 (콤마)</label>
                    <input value={form.interior_colors} onChange={(e) => fld('interior_colors', e.target.value)} placeholder="검정, 베이지" style={inputStyle} /></div>
                  <div><label style={labelStyle}>등록 방식</label>
                    <input value={form.source} onChange={(e) => fld('source', e.target.value)} placeholder="수동/카탈로그/공식" style={inputStyle} /></div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>옵션 패키지 (콤마 구분)</label>
                  <input value={form.options_text} onChange={(e) => fld('options_text', e.target.value)} placeholder="선루프, HUD, 통풍시트, 어라운드뷰" style={inputStyle} />
                </div>
              </div>

              {modalMsg && <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b' }}>⚠️ {modalMsg}</div>}
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                💡 복잡한 다중 트림 / variant 는 AI 캡쳐 사용 권장. 수동 등록은 대표 1트림 중심.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <button onClick={() => !saving && setModalOpen(false)}
                style={{ padding: '9px 14px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>닫기</button>
              <div style={{ flex: 1 }} />
              <button onClick={save} disabled={saving}
                style={{ padding: '9px 20px', background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, opacity: saving ? 0.5 : 1 }}>
                {saving ? '저장 중…' : editRow ? '✎ 수정 저장' : '➕ 등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {delTarget && (
        <div onClick={() => !delBusy && setDelTarget(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ ...GLASS.L5, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', width: 'min(400px, 96vw)', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px 14px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', margin: 0 }}>🗑 카탈로그 삭제</h3>
              <div style={{ ...GLASS.L1, marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: 12, color: '#1e293b' }}>
                🚗 {delTarget.brand} {delTarget.model} ({delTarget.year})
              </div>
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: '#991b1b' }}>이 카탈로그를 삭제합니다. 견적에 미리 선택된 row 는 영향 없습니다 (참조만 끊김).</div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '12px 20px 16px' }}>
              <button onClick={() => !delBusy && setDelTarget(null)}
                style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#475569' }}>닫기</button>
              <button onClick={runDelete} disabled={delBusy}
                style={{ flex: 1, padding: '10px', color: '#fff', border: 'none', borderRadius: 9, cursor: delBusy ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 800, opacity: delBusy ? 0.5 : 1, background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                {delBusy ? '처리 중…' : '🗑 삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
