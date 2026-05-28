'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// /long-term-rentals/catalog/new — 신차 카탈로그 등록 풀 페이지 (PR-Q4-2)
//
// 사용자 명시: 「신차등록 하고 견적작성 모달로 하기싫은데 페이지에서 구성하고 싶어요」
// → 모달 제거 → 풀 페이지.
//
// 좌측: 등록 모드 (수동 / AI 캡쳐) + 기본정보 + 트림 form
// 우측: AI 파싱 결과 트림 리스트 (sticky)
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

const emptyForm = {
  brand: '', model: '', year: String(new Date().getFullYear()),
  source: '수동 입력',
  fuel_type: '가솔린',
  engine_cc: '',
  trim_name: '',
  base_price: '',
  exterior_colors: '',
  interior_colors: '',
  options_text: '',
}

export default function NewCatalogPage() {
  const router = useRouter()
  const [registerMode, setRegisterMode] = useState<'manual' | 'ai' | 'research'>('manual')
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // AI 캡쳐 / 자동조사 공용 결과
  const [aiUploading, setAiUploading] = useState(false)
  const [aiResult, setAiResult] = useState<any | null>(null)
  const [aiErr, setAiErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // PR-Q5-1: AI 자동 조사 입력 (텍스트 only)
  const [researchBrand, setResearchBrand] = useState('')
  const [researchModel, setResearchModel] = useState('')
  const [researchYear, setResearchYear] = useState(String(new Date().getFullYear()))

  // 토스트
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const showToast = useCallback((m: { type: 'ok' | 'err'; text: string }) => {
    setToast(m); setTimeout(() => setToast(null), 4500)
  }, [])

  const fld = (k: keyof typeof emptyForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

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

  // PR-Q5-1: AI 자동 조사 (텍스트 입력 → Gemini)
  const runAiResearch = useCallback(async () => {
    if (!researchBrand.trim() || !researchModel.trim()) {
      setAiErr('브랜드 / 모델 필수'); return
    }
    setAiUploading(true); setAiErr(null); setAiResult(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch('/api/lookup-car-catalog', {
        method: 'POST', headers,
        body: JSON.stringify({
          brand: researchBrand.trim(),
          model: researchModel.trim(),
          year: Number(researchYear) || new Date().getFullYear(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || 'AI 조사 실패')
      const parsed = json.data || json
      if (parsed.available === false) {
        setAiErr(parsed.message || 'AI 가 차종 정보를 찾지 못했습니다')
        return
      }
      setAiResult(parsed)
      setForm((f) => ({
        ...f,
        brand: parsed.brand || researchBrand,
        model: parsed.model || researchModel,
        year: String(parsed.year || researchYear),
        source: 'ai-research',
        fuel_type: parsed.variants?.[0]?.fuel_type || f.fuel_type,
        engine_cc: String(parsed.variants?.[0]?.engine_cc || f.engine_cc),
        trim_name: parsed.variants?.[0]?.trims?.[0]?.name || f.trim_name,
        base_price: String(parsed.variants?.[0]?.trims?.[0]?.base_price || f.base_price),
      }))
      showToast({ type: 'ok', text: `AI 조사 완료 — ${parsed.variants?.length || 0} variants` })
    } catch (e) {
      setAiErr((e as Error)?.message || 'AI 조사 오류')
    } finally { setAiUploading(false) }
  }, [researchBrand, researchModel, researchYear, showToast])

  // 우측 트림 카드에서 클릭 → form 채움
  const applyAiTrim = useCallback((vIdx: number, tIdx: number) => {
    if (!aiResult) return
    const v = aiResult.variants?.[vIdx]
    const t = v?.trims?.[tIdx]
    if (!v || !t) return
    setForm((f) => ({
      ...f,
      fuel_type: v.fuel_type || f.fuel_type,
      engine_cc: String(v.engine_cc || f.engine_cc),
      trim_name: t.name || '',
      base_price: String(t.base_price || ''),
      exterior_colors: (t.exterior_colors || []).map((c: any) => c.name).join(', '),
      interior_colors: (t.interior_colors || []).map((c: any) => c.name).join(', '),
      options_text: (t.options || []).map((o: any) => o.name).join(', '),
    }))
    showToast({ type: 'ok', text: `${t.name} 적용` })
  }, [aiResult, showToast])

  const save = useCallback(async () => {
    if (!form.brand.trim() || !form.model.trim() || !form.year) {
      setMsg('브랜드 / 모델 / 연식은 필수입니다'); return
    }
    setSaving(true); setMsg(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
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
      const res = await fetch('/api/new-car-prices', { method: 'POST', headers, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '저장 실패')
      showToast({ type: 'ok', text: '카탈로그 등록 완료' })
      const newId = json.data?.id
      if (newId) {
        setTimeout(() => router.push(`/long-term-rentals/catalog/${newId}`), 700)
      } else {
        router.push('/long-term-rentals')
      }
    } catch (e) {
      setMsg((e as Error)?.message || '저장 오류')
    } finally { setSaving(false) }
  }, [form, aiResult, router, showToast])

  const inputStyle = { ...GLASS.L1, width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#1e293b' } as const
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 5 } as const

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

        {/* 상단 등록 모드 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0f2440', margin: 0 }}>🚗 신차 카탈로그 등록</h2>
          <div style={{ display: 'inline-flex', gap: 4, marginLeft: 12 }}>
            {([
              { k: 'manual' as const, label: '✍️ 수동 등록', hint: '필드 직접 입력' },
              { k: 'research' as const, label: '🔍 AI 자동 조사', hint: '차종명만 — Gemini 가 트림/가격 추출' },
              { k: 'ai' as const, label: '🤖 AI 캡쳐', hint: 'PDF/이미지 업로드' },
            ]).map((t) => (
              <button key={t.k} onClick={() => setRegisterMode(t.k)}
                title={t.hint}
                style={{ padding: '5px 11px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  border: registerMode === t.k ? `1px solid ${COLORS.borderBlue}` : '1px solid rgba(0,0,0,0.08)',
                  background: registerMode === t.k ? COLORS.bgBlue : GLASS.L2.background,
                  color: registerMode === t.k ? COLORS.primary : '#475569' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: (registerMode === 'ai' || registerMode === 'research') ? 'minmax(0, 1fr) 380px' : '1fr', gap: 16, alignItems: 'flex-start' }}>
          {/* 좌측 — 등록 폼 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* AI 자동 조사 모드 — 차종명 입력 */}
            {registerMode === 'research' && (
              <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10, border: '1px solid rgba(59,110,181,0.25)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.primary, marginBottom: 8 }}>🔍 AI 자동 조사 (Gemini)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
                  <div><label style={labelStyle}>브랜드 *</label>
                    <input value={researchBrand} onChange={(e) => setResearchBrand(e.target.value)} placeholder="현대 / BMW…" style={inputStyle}
                      onKeyDown={(e) => { if (e.key === 'Enter') runAiResearch() }} /></div>
                  <div><label style={labelStyle}>모델 *</label>
                    <input value={researchModel} onChange={(e) => setResearchModel(e.target.value)} placeholder="쏘나타 / 520i…" style={inputStyle}
                      onKeyDown={(e) => { if (e.key === 'Enter') runAiResearch() }} /></div>
                  <div><label style={labelStyle}>연식</label>
                    <input type="number" value={researchYear} onChange={(e) => setResearchYear(e.target.value)} placeholder="2026" style={inputStyle}
                      onKeyDown={(e) => { if (e.key === 'Enter') runAiResearch() }} /></div>
                  <button onClick={runAiResearch} disabled={aiUploading}
                    style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${COLORS.borderBlue}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: aiUploading ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {aiUploading ? '🔄 조사 중…' : '🔍 조사 시작'}
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>
                  💡 Gemini 2.0 Flash — 한국 시장 출고가 / 트림 / 색상 / 옵션 자동 추출 · ~₩1~3/회 · 결과는 영업 검토 후 저장
                </div>
                {aiErr && <div style={{ marginTop: 6, fontSize: 11, color: '#991b1b' }}>⚠ {aiErr}</div>}
                {aiResult && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#475569' }}>
                    ✓ {aiResult.brand} {aiResult.model} ({aiResult.year}) · variants {aiResult.variants?.length || 0}개 / 트림 {(aiResult.variants || []).reduce((s: number, v: any) => s + (v.trims?.length || 0), 0)}개
                    <br/><span style={{ color: '#94a3b8' }}>우측 패널의 트림 선택 → 자동 채움 (영업 검토 후 저장)</span>
                  </div>
                )}
              </div>
            )}

            {/* AI 캡쳐 모드 — 업로드 버튼 */}
            {registerMode === 'ai' && (
              <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10, border: '1px solid rgba(124,58,237,0.25)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#5b21b6', marginBottom: 8 }}>🤖 AI 견적서 파싱</div>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAiUpload(f) }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => fileRef.current?.click()} disabled={aiUploading}
                    style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${COLORS.borderBlue}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: aiUploading ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700 }}>
                    {aiUploading ? '🔄 파싱 중…' : '📷 PDF/이미지 업로드'}
                  </button>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>Gemini Vision · ~₩1~3/회</span>
                </div>
                {aiErr && <div style={{ fontSize: 11, color: '#991b1b', marginTop: 6 }}>⚠ {aiErr}</div>}
                {aiResult && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#475569' }}>
                    ✓ {aiResult.brand} {aiResult.model} ({aiResult.year}) · variants {aiResult.variants?.length || 0}개 / 트림 {(aiResult.variants || []).reduce((s: number, v: any) => s + (v.trims?.length || 0), 0)}개
                    <br/><span style={{ color: '#94a3b8' }}>우측 패널의 트림 선택 → 자동 채움</span>
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
                  <input type="number" value={form.engine_cc} onChange={(e) => fld('engine_cc', e.target.value)} placeholder="1999" style={inputStyle} /></div>
                <div><label style={labelStyle}>대표가 (VAT 포함)</label>
                  <input type="number" value={form.base_price} onChange={(e) => fld('base_price', e.target.value)} placeholder="35000000" style={inputStyle} /></div>
                <div style={{ gridColumn: 'span 3' }}><label style={labelStyle}>트림명</label>
                  <input value={form.trim_name} onChange={(e) => fld('trim_name', e.target.value)} placeholder="프리미엄 / 디럭스…" style={inputStyle} /></div>
                <div><label style={labelStyle}>외장 색상 (콤마)</label>
                  <input value={form.exterior_colors} onChange={(e) => fld('exterior_colors', e.target.value)} placeholder="흰색, 검정, 회색" style={inputStyle} /></div>
                <div><label style={labelStyle}>내장 색상 (콤마)</label>
                  <input value={form.interior_colors} onChange={(e) => fld('interior_colors', e.target.value)} placeholder="검정, 베이지" style={inputStyle} /></div>
                <div><label style={labelStyle}>등록 방식</label>
                  <input value={form.source} onChange={(e) => fld('source', e.target.value)} placeholder="수동/카탈로그/공식" style={inputStyle} /></div>
                <div style={{ gridColumn: 'span 3' }}><label style={labelStyle}>옵션 패키지 (콤마)</label>
                  <input value={form.options_text} onChange={(e) => fld('options_text', e.target.value)} placeholder="선루프, HUD, 통풍시트, 어라운드뷰" style={inputStyle} /></div>
              </div>
            </div>

            {msg && <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b' }}>⚠️ {msg}</div>}
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              💡 복잡한 다중 트림 / variant 는 AI 캡쳐 권장. 수동 등록은 대표 1트림 중심.
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => router.push('/long-term-rentals')}
                style={{ padding: '10px 16px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>← 목록으로</button>
              <div style={{ flex: 1 }} />
              <button onClick={save} disabled={saving}
                style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, opacity: saving ? 0.5 : 1 }}>
                {saving ? '저장 중…' : '➕ 카탈로그 등록'}
              </button>
            </div>
          </div>

          {/* 우측 — AI 결과 트림 리스트 (sticky, AI/자동조사 모드 공용) */}
          {(registerMode === 'ai' || registerMode === 'research') && (
            <div style={{ position: 'sticky', top: 16, alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.primary }}>📋 AI 추출 결과</div>
              {!aiResult && (
                <div style={{ ...GLASS.L3, padding: 14, borderRadius: 10, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
                  {registerMode === 'research'
                    ? <>좌측 차종명 입력 후<br/>「🔍 조사 시작」 클릭</>
                    : <>좌측 PDF/이미지 업로드 시<br/>추출된 트림 리스트가 여기 표시</>}
                </div>
              )}
              {aiResult?.variants?.length > 0 && (
                <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0f2440', marginBottom: 8 }}>
                    {aiResult.brand} {aiResult.model} ({aiResult.year})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                    {aiResult.variants.map((v: any, vi: number) =>
                      v.trims?.map((t: any, ti: number) => (
                        <button key={`${vi}-${ti}`} onClick={() => applyAiTrim(vi, ti)}
                          style={{ ...GLASS.L1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 11, textAlign: 'left' }}>
                          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{v.fuel_type} · {v.engine_cc}cc</span>
                          <span style={{ color: '#1e293b', fontWeight: 600 }}>{t.name}</span>
                          <span style={{ fontWeight: 800, color: COLORS.primary }}>{(t.base_price || 0).toLocaleString('ko-KR')}원</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
