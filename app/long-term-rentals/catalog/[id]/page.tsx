'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// /long-term-rentals/catalog/[id] — 신차 카탈로그 편집 풀 페이지 (PR-Q4-2)
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

const emptyForm = {
  brand: '', model: '', year: '',
  source: '수동 입력',
  fuel_type: '가솔린',
  engine_cc: '',
  trim_name: '',
  base_price: '',
  exterior_colors: '',
  interior_colors: '',
  options_text: '',
}

export default function CatalogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)

  const [row, setRow] = useState<any>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [delBusy, setDelBusy] = useState(false)
  const [delConfirm, setDelConfirm] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const showToast = useCallback((m: { type: 'ok' | 'err'; text: string }) => {
    setToast(m); setTimeout(() => setToast(null), 4500)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const headers = await getAuthHeader()
        const res = await fetch(`/api/new-car-prices/${id}`, { headers })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok || json?.error) {
          setMsg(json?.error || '카탈로그를 찾을 수 없습니다')
        } else {
          const r = json.data
          setRow(r)
          const pd = r.price_data || {}
          const v0 = pd.variants?.[0]
          const t0 = v0?.trims?.[0]
          setForm({
            brand: r.brand || '',
            model: r.model || '',
            year: String(r.year || ''),
            source: r.source || '수동 입력',
            fuel_type: v0?.fuel_type || '가솔린',
            engine_cc: v0?.engine_cc != null ? String(v0.engine_cc) : '',
            trim_name: t0?.name || '',
            base_price: t0?.base_price != null ? String(t0.base_price) : '',
            exterior_colors: (t0?.exterior_colors || []).map((c: any) => c.name).join(', '),
            interior_colors: (t0?.interior_colors || []).map((c: any) => c.name).join(', '),
            options_text: (t0?.options || []).map((o: any) => o.name).join(', '),
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  const fld = (k: keyof typeof emptyForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const save = useCallback(async () => {
    if (!form.brand.trim() || !form.model.trim() || !form.year) {
      setMsg('브랜드 / 모델 / 연식은 필수입니다'); return
    }
    setSaving(true); setMsg(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const priceData = {
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
        source: form.source || '수동 입력',
        price_data: priceData,
      }
      const res = await fetch(`/api/new-car-prices/${id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '저장 실패')
      setRow(json.data)
      showToast({ type: 'ok', text: '카탈로그 수정 완료' })
    } catch (e) {
      setMsg((e as Error)?.message || '저장 오류')
    } finally { setSaving(false) }
  }, [form, id, showToast])

  const runDelete = useCallback(async () => {
    setDelBusy(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/new-car-prices/${id}`, { method: 'DELETE', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '삭제 실패')
      showToast({ type: 'ok', text: '카탈로그 삭제 완료' })
      setTimeout(() => router.push('/long-term-rentals'), 600)
    } catch (e) {
      showToast({ type: 'err', text: (e as Error)?.message || '삭제 오류' })
    } finally { setDelBusy(false); setDelConfirm(false) }
  }, [id, router, showToast])

  const inputStyle = { ...GLASS.L1, width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#1e293b' } as const
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 5 } as const

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>카탈로그 불러오는 중…</div>
  }
  if (!row) {
    return (
      <div style={{ padding: 40, maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🚗</div>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#0f2440', marginBottom: 6 }}>카탈로그를 찾을 수 없습니다</h1>
        <button onClick={() => router.push('/long-term-rentals')}
          style={{ marginTop: 12, padding: '10px 18px', background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>← 목록으로</button>
      </div>
    )
  }

  const isAi = String(row.source || '').toLowerCase().includes('ai')

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

        {/* 상단 정보 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0f2440', margin: 0 }}>🚗 카탈로그 편집</h2>
          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 800,
            background: isAi ? 'rgba(124,58,237,0.14)' : 'rgba(148,163,184,0.18)',
            color: isAi ? '#5b21b6' : '#475569' }}>
            {isAi ? '🤖 AI 등록' : '✍️ 수동 등록'}
          </span>
          <span style={{ fontSize: 12, color: '#64748b' }}>{row.brand} {row.model} ({row.year})</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 기본 정보 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div><label style={labelStyle}>브랜드 *</label>
              <input value={form.brand} onChange={(e) => fld('brand', e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>모델 *</label>
              <input value={form.model} onChange={(e) => fld('model', e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>연식 *</label>
              <input type="number" value={form.year} onChange={(e) => fld('year', e.target.value)} style={inputStyle} /></div>
          </div>

          {/* 트림 정보 */}
          <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10, border: '1px solid rgba(245,158,11,0.25)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#b45309', marginBottom: 8 }}>🚗 대표 트림</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div><label style={labelStyle}>연료</label>
                <select value={form.fuel_type} onChange={(e) => fld('fuel_type', e.target.value)} style={inputStyle}>
                  <option value="가솔린">가솔린</option>
                  <option value="디젤">디젤</option>
                  <option value="하이브리드">하이브리드</option>
                  <option value="전기">전기</option>
                </select></div>
              <div><label style={labelStyle}>배기량 (CC)</label>
                <input type="number" value={form.engine_cc} onChange={(e) => fld('engine_cc', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>대표가 (VAT 포함)</label>
                <input type="number" value={form.base_price} onChange={(e) => fld('base_price', e.target.value)} style={inputStyle} /></div>
              <div style={{ gridColumn: 'span 3' }}><label style={labelStyle}>트림명</label>
                <input value={form.trim_name} onChange={(e) => fld('trim_name', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>외장 색상 (콤마)</label>
                <input value={form.exterior_colors} onChange={(e) => fld('exterior_colors', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>내장 색상 (콤마)</label>
                <input value={form.interior_colors} onChange={(e) => fld('interior_colors', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>등록 방식</label>
                <input value={form.source} onChange={(e) => fld('source', e.target.value)} style={inputStyle} /></div>
              <div style={{ gridColumn: 'span 3' }}><label style={labelStyle}>옵션 패키지 (콤마)</label>
                <input value={form.options_text} onChange={(e) => fld('options_text', e.target.value)} style={inputStyle} /></div>
            </div>
          </div>

          {/* AI 원본 데이터 (있을 때) — 참조용 펼치기 */}
          {isAi && row.price_data?.variants?.length > 1 && (
            <details style={{ ...GLASS.L3, padding: 10, borderRadius: 10, fontSize: 11 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#5b21b6' }}>
                🤖 AI 원본 — variants {row.price_data.variants.length}개 / 트림 {(row.price_data.variants || []).reduce((s: number, v: any) => s + (v.trims?.length || 0), 0)}개
              </summary>
              <div style={{ marginTop: 8, maxHeight: 240, overflowY: 'auto' }}>
                {row.price_data.variants.map((v: any, vi: number) => (
                  <div key={vi} style={{ marginTop: 6, fontSize: 10 }}>
                    <div style={{ fontWeight: 700, color: '#475569' }}>{v.fuel_type} · {v.engine_cc}cc</div>
                    {v.trims?.map((t: any, ti: number) => (
                      <div key={ti} style={{ paddingLeft: 12, color: '#1e293b' }}>
                        · {t.name} — {(t.base_price || 0).toLocaleString('ko-KR')}원
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          )}

          {msg && <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b' }}>⚠️ {msg}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/long-term-rentals')}
              style={{ padding: '10px 16px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>← 목록</button>
            <button onClick={() => setDelConfirm(true)} disabled={delBusy}
              style={{ padding: '10px 14px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, cursor: delBusy ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, color: '#991b1b' }}>🗑 삭제</button>
            <div style={{ flex: 1 }} />
            <button onClick={save} disabled={saving}
              style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, opacity: saving ? 0.5 : 1 }}>
              {saving ? '저장 중…' : '✎ 수정 저장'}
            </button>
          </div>
        </div>

        {/* 삭제 확인 */}
        {delConfirm && (
          <div onClick={() => !delBusy && setDelConfirm(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ ...GLASS.L5, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', width: 'min(400px, 96vw)', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
              <div style={{ padding: '18px 20px 14px' }}>
                <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', margin: 0 }}>🗑 카탈로그 삭제</h3>
                <div style={{ ...GLASS.L1, marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: 12, color: '#1e293b' }}>
                  🚗 {row.brand} {row.model} ({row.year})
                </div>
                <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: '#991b1b' }}>이 카탈로그를 삭제합니다. 기존 견적의 참조만 끊깁니다.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '12px 20px 16px' }}>
                <button onClick={() => !delBusy && setDelConfirm(false)}
                  style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#475569' }}>닫기</button>
                <button onClick={runDelete} disabled={delBusy}
                  style={{ flex: 1, padding: '10px', color: '#fff', border: 'none', borderRadius: 9, cursor: delBusy ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 800, opacity: delBusy ? 0.5 : 1, background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                  {delBusy ? '처리 중…' : '🗑 삭제'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
