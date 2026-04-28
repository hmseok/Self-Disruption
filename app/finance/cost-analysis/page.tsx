'use client'

import { useEffect, useMemo, useState } from 'react'
import { getAuthHeader } from '@/app/utils/pricing-standards'

// ============================================================
// 차량별 통합 원가 분석 — 시장/우리/실제/편차 한 화면
// 의사결정 도구: 차량 선택 → 6컴포넌트 비교 → 영업가 시뮬
// ============================================================

interface CarItem {
  id: string
  number: string
  brand: string
  model: string
  year?: number
  fuel_type?: string
  vehicle_class?: string
}

interface Component {
  component: string
  label: string
  unit: string
  market_value: number | null
  market_monthly: number | null
  our_value: number | null
  our_monthly: number | null
  actual_monthly: number | null
  market_vs_our_pct: number | null
  our_vs_actual_pct: number | null
  scope_type: 'model' | 'class' | null
  sample_count: number
  market_synced_at: string | null
  our_updated_at: string | null
}

interface Analysis {
  car: any
  matched_scopes: Array<{ type: string; label: string }>
  components: Component[]
  actuals: { sample_count: number; from_month?: string; to_month?: string }
  presets: any[]
}

function fmtMoney(n: number | null): string {
  if (n === null || n === undefined) return '—'
  return Math.round(n).toLocaleString('ko-KR')
}
function fmtPct(p: number | null, withSign = true): string {
  if (p === null || p === undefined) return '—'
  const sign = withSign && p > 0 ? '+' : ''
  return `${sign}${p.toFixed(1)}%`
}
function pctColor(p: number | null): string {
  if (p === null) return '#94a3b8'
  if (Math.abs(p) < 5) return '#16a34a'
  if (Math.abs(p) < 15) return '#d97706'
  return '#dc2626'
}

export default function CostAnalysisPage() {
  const [cars, setCars] = useState<CarItem[]>([])
  const [search, setSearch] = useState('')
  const [carId, setCarId] = useState<string>('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(false)

  // 차량 목록 로드
  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeader()
        const res = await fetch('/api/cars', { headers })
        const json = await res.json()
        setCars(json.data || [])
      } catch (e) { console.error(e) }
    })()
  }, [])

  // 차량 선택 시 분석 로드
  useEffect(() => {
    if (!carId) { setAnalysis(null); return }
    (async () => {
      setLoading(true)
      try {
        const headers = await getAuthHeader()
        const res = await fetch(`/api/cost-standards/vehicle-analysis?car_id=${carId}`, { headers })
        const json = await res.json()
        if (res.ok && json.ok) setAnalysis(json)
        else { alert(`로드 실패: ${json.error}`); setAnalysis(null) }
      } catch (e: any) {
        alert(`오류: ${e.message}`)
      } finally { setLoading(false) }
    })()
  }, [carId])

  const filtered = useMemo(() => {
    if (!search) return cars
    const q = search.toLowerCase()
    return cars.filter(c =>
      (c.number || '').toLowerCase().includes(q)
      || (c.brand || '').toLowerCase().includes(q)
      || (c.model || '').toLowerCase().includes(q)
    )
  }, [cars, search])

  // 합계 — 월 비용 추정
  const totals = useMemo(() => {
    if (!analysis) return null
    const sumMonthly = (key: 'market_monthly' | 'our_monthly' | 'actual_monthly') => {
      let s = 0
      for (const c of analysis.components) {
        if (c.unit === 'percent') continue  // 금리는 직접 합산 X
        const v = c[key]
        if (v != null) s += v
      }
      return s
    }
    return {
      market: sumMonthly('market_monthly'),
      our: sumMonthly('our_monthly'),
      actual: sumMonthly('actual_monthly'),
    }
  }, [analysis])

  return (
    <div className="page-bg">
      <div className="max-w-[1600px] mx-auto py-4 px-4 md:py-5 md:px-6">

        {/* 헤더 */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-slate-800">💰 차량별 원가 분석</h1>
          <p className="text-xs text-slate-500 mt-1">
            시장원가(Gemini AI) ↔ 우리원가(운영실적) ↔ 실제 운영 평균 비교 · 의사결정 지원
          </p>
        </div>

        {/* 차량 선택 */}
        <div style={{
          background: 'rgba(255,255,255,0.72)', borderRadius: 14,
          border: '1px solid rgba(0,0,0,0.06)', padding: 16, marginBottom: 16,
          boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="차량번호/브랜드/모델 검색..."
              style={{
                flex: '1 1 250px', padding: '8px 12px', fontSize: 13,
                borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)',
                background: 'rgba(255,255,255,0.5)', outline: 'none',
              }}
            />
            <select
              value={carId}
              onChange={e => setCarId(e.target.value)}
              style={{
                flex: '1 1 320px', padding: '8px 12px', fontSize: 13,
                borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)',
                background: 'rgba(255,255,255,0.5)', outline: 'none',
              }}
            >
              <option value="">— 차량 선택 —</option>
              {filtered.map(c => (
                <option key={c.id} value={c.id}>
                  {c.number} | {c.brand} {c.model} {c.year ? `(${c.year})` : ''}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">{filtered.length}대</span>
          </div>
        </div>

        {loading && <div className="text-center text-sm text-slate-500 py-8">분석 로드 중...</div>}

        {!loading && analysis && (
          <>
            {/* 차량 정보 + 매칭 스코프 */}
            <div style={{
              background: 'rgba(255,255,255,0.72)', borderRadius: 14,
              border: '1px solid rgba(0,0,0,0.06)', padding: 16, marginBottom: 16,
            }}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-800">
                    🚗 {analysis.car.number} — {analysis.car.brand} {analysis.car.model}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {analysis.car.year}년 · {analysis.car.vehicle_class || '-'} · {analysis.car.fuel_type || '-'} · {analysis.car.displacement || '-'}cc
                  </div>
                </div>
                <div className="flex flex-col items-end text-xs">
                  <div className="text-slate-500">매칭 스코프:</div>
                  <div className="flex gap-2 mt-1">
                    {analysis.matched_scopes.length === 0 && <span className="text-amber-600">⚠ 매칭 스코프 없음</span>}
                    {analysis.matched_scopes.map((s, i) => (
                      <span key={i} style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: s.type === 'model' ? 'rgba(139,92,246,0.12)' : 'rgba(59,130,246,0.12)',
                        color: s.type === 'model' ? '#6d28d9' : '#1e40af',
                      }}>
                        {s.type === 'model' ? '🚘 모델' : '🏷️ 클래스'} · {s.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {analysis.actuals.sample_count > 0 && (
                <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-black/5">
                  📊 운영 실적 표본: {analysis.actuals.sample_count}건 ({analysis.actuals.from_month} ~ {analysis.actuals.to_month})
                </div>
              )}
            </div>

            {/* 6컴포넌트 비교 표 */}
            <div style={{
              background: 'rgba(255,255,255,0.72)', borderRadius: 14,
              border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden',
            }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr 100px 100px',
                gap: 8, padding: '12px 16px', fontSize: 11, fontWeight: 700,
                color: '#475569', borderBottom: '1px solid rgba(0,0,0,0.06)',
                background: 'rgba(248,250,252,0.5)',
              }}>
                <div>원가 항목</div>
                <div className="text-right">시장원가 (월)</div>
                <div className="text-right">우리원가 (월)</div>
                <div className="text-right">실제 평균 (월)</div>
                <div className="text-right">시장↔우리</div>
                <div className="text-right">우리↔실제</div>
              </div>
              {analysis.components.map(c => (
                <div key={c.component} style={{
                  display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr 100px 100px',
                  gap: 8, padding: '12px 16px', alignItems: 'center', fontSize: 13,
                  borderBottom: '1px solid rgba(0,0,0,0.04)',
                }}>
                  <div className="font-bold text-slate-800">{c.label}</div>
                  <div className="text-right" style={{ color: c.market_monthly !== null ? '#1e293b' : '#cbd5e1' }}>
                    {c.unit === 'percent'
                      ? (c.market_value !== null ? `${c.market_value.toFixed(2)}%` : '—')
                      : `${fmtMoney(c.market_monthly)}원`}
                  </div>
                  <div className="text-right" style={{ color: c.our_monthly !== null ? '#1e293b' : '#cbd5e1', fontWeight: 600 }}>
                    {c.unit === 'percent'
                      ? (c.our_value !== null ? `${c.our_value.toFixed(2)}%` : '—')
                      : `${fmtMoney(c.our_monthly)}원`}
                    {c.sample_count > 0 && <div className="text-[10px] text-slate-400">표본 {c.sample_count}</div>}
                  </div>
                  <div className="text-right" style={{ color: c.actual_monthly !== null ? '#1e293b' : '#cbd5e1' }}>
                    {c.actual_monthly !== null ? `${fmtMoney(c.actual_monthly)}원` : '—'}
                  </div>
                  <div className="text-right font-bold" style={{ color: pctColor(c.market_vs_our_pct), fontSize: 12 }}>
                    {fmtPct(c.market_vs_our_pct)}
                  </div>
                  <div className="text-right font-bold" style={{ color: pctColor(c.our_vs_actual_pct), fontSize: 12 }}>
                    {fmtPct(c.our_vs_actual_pct)}
                  </div>
                </div>
              ))}

              {/* 월 합계 */}
              {totals && (
                <div style={{
                  display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr 100px 100px',
                  gap: 8, padding: '14px 16px', fontWeight: 800, fontSize: 13,
                  background: 'rgba(241,245,249,0.6)', borderTop: '2px solid rgba(0,0,0,0.06)',
                }}>
                  <div className="text-slate-700">월 운영원가 합계 (금리 제외)</div>
                  <div className="text-right text-slate-800">{fmtMoney(totals.market)}원</div>
                  <div className="text-right text-slate-900">{fmtMoney(totals.our)}원</div>
                  <div className="text-right text-slate-800">{totals.actual > 0 ? `${fmtMoney(totals.actual)}원` : '—'}</div>
                  <div></div><div></div>
                </div>
              )}
            </div>

            {/* 영업프리셋 — 영업가 시뮬 */}
            {totals && totals.our > 0 && analysis.presets.length > 0 && (
              <div style={{
                marginTop: 16, background: 'rgba(255,255,255,0.72)', borderRadius: 14,
                border: '1px solid rgba(0,0,0,0.06)', padding: 16,
              }}>
                <div className="text-sm font-bold text-slate-800 mb-3">🎯 영업가 시뮬레이션 (월 운영원가 기반)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                  {analysis.presets.map((p: any) => {
                    const margin = Number(p.margin_rate || 0)
                    const sales = Math.round(totals.our * (1 + margin / 100))
                    return (
                      <div key={p.id} style={{
                        padding: 12, borderRadius: 10,
                        background: p.is_default ? 'rgba(59,130,246,0.08)' : 'rgba(248,250,252,0.6)',
                        border: `1px solid ${p.is_default ? 'rgba(59,130,246,0.25)' : 'rgba(0,0,0,0.05)'}`,
                      }}>
                        <div className="text-xs text-slate-500 font-bold">{p.name}</div>
                        <div className="text-sm font-bold text-slate-800 mt-1">{p.label}</div>
                        <div className="text-[10px] text-slate-400 mt-1">마진 {margin}%</div>
                        <div className="text-lg font-extrabold text-slate-900 mt-2">{fmtMoney(sales)}원</div>
                        <div className="text-[10px] text-slate-500">월 영업가 (제안)</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 가이드 */}
            <div style={{
              marginTop: 16, padding: 12, borderRadius: 10, fontSize: 11,
              background: 'rgba(59,130,246,0.06)', color: '#475569', lineHeight: 1.7,
            }}>
              💡 <b>편차 색상</b> — 초록(±5% 정상) / 주황(±15% 주의) / 빨강(15% 초과) ·
              <b> 시장↔우리</b>: 우리 원가가 시장 대비 얼마나 떨어져 있는가 ·
              <b> 우리↔실제</b>: 운영학습이 우리 원가를 얼마나 따라잡았는가 (음수면 실제가 우리보다 적음 = 좋음)
            </div>
          </>
        )}

        {!loading && !analysis && (
          <div style={{
            background: 'rgba(255,255,255,0.72)', borderRadius: 14, padding: 60,
            border: '1px solid rgba(0,0,0,0.06)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👆</div>
            <div className="text-sm text-slate-500">위에서 차량을 선택하세요</div>
          </div>
        )}
      </div>
    </div>
  )
}
