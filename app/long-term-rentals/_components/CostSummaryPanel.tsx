'use client'

import { useState } from 'react'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// CostSummaryPanel — 실시간 원가 산출 결과 패널 (PR-Q4-1 / PR-Q5 보강)
//
// 적정 월 렌트료 강조 + 시장 표준가 비교 + 7대 원가 + 원가 상세(접기) + 분석
// 「↓ 이 가격으로 적용」 → 부모 form 의 monthly_fee 자동 채움
// PR-Q5: 시장 참고가 / 원가 상세 산출근거 접기 박스 / 항목 표시 토글
// ═══════════════════════════════════════════════════════════════════

export type CalcResult = {
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
  cost_detail?: Array<{ key: string; label: string; monthly: number; formula: string; source: string }>
  market_reference?: { monthly: number; monthly_with_vat: number; ratio_pct: number; diff_pct: number }
}

interface Props {
  result: CalcResult | null
  loading?: boolean
  err?: string | null
  onApply?: () => void
}

const DOT: Record<string, string> = {
  depreciation: '#3b6eb5', finance: '#6366f1', insurance: '#10b981',
  maintenance: '#f59e0b', tax_inspection: '#ef4444', risk: '#a855f7',
  overhead: '#64748b', discount: '#34d399',
}
const SOURCE_LABEL: Record<string, string> = {
  db: 'DB 기준', calc: '계산', fallback: '기본값', manual: '직접입력',
}

export default function CostSummaryPanel({ result, loading, err, onApply }: Props) {
  const [detailOpen, setDetailOpen] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const toggleHidden = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  // 원가 구성 항목 (cost_detail 우선, 없으면 cost_breakdown 폴백)
  const items = result?.cost_detail && result.cost_detail.length > 0
    ? result.cost_detail
    : result
      ? ([
          { key: 'depreciation', label: '감가상각', monthly: result.cost_breakdown.depreciation, formula: '', source: '' },
          { key: 'finance', label: '금융비용', monthly: result.cost_breakdown.finance, formula: '', source: '' },
          { key: 'insurance', label: '보험료', monthly: result.cost_breakdown.insurance, formula: '', source: '' },
          { key: 'maintenance', label: '정비비', monthly: result.cost_breakdown.maintenance, formula: '', source: '' },
          { key: 'tax_inspection', label: '세금·검사', monthly: result.cost_breakdown.tax_inspection, formula: '', source: '' },
          { key: 'risk', label: '리스크', monthly: result.cost_breakdown.risk, formula: '', source: '' },
          { key: 'overhead', label: '간접비', monthly: result.cost_breakdown.overhead, formula: '', source: '' },
        ])
      : []

  const mref = result?.market_reference
  const diff = mref?.diff_pct ?? 0
  const diffColor = diff <= 0 ? '#065f46' : diff <= 10 ? '#b45309' : '#991b1b'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.primary, display: 'flex', alignItems: 'center', gap: 6 }}>
        📊 실시간 원가 산출
        {loading && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>(계산 중…)</span>}
      </div>

      {!result && !err && (
        <div style={{ ...GLASS.L3, padding: 14, borderRadius: 10, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
          매입가 / 브랜드 / 모델 / 연료 / CC / 기간 / 주행거리 입력 시 자동 산출
        </div>
      )}

      {err && (
        <div style={{ ...GLASS.L3, padding: 11, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontSize: 11, color: '#991b1b' }}>
          ⚠ {err}
        </div>
      )}

      {result && (
        <>
          <div style={{ padding: 14, borderRadius: 12, background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff' }}>
            <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 700 }}>적정 월 렌트료 (VAT 포함)</div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 2 }}>{result.suggested_rent_with_vat.toLocaleString('ko-KR')}원</div>
            <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>VAT 별도: {result.suggested_rent.toLocaleString('ko-KR')}원</div>
            {onApply && (
              <button onClick={onApply}
                style={{ marginTop: 10, padding: '8px 12px', background: '#fff', color: COLORS.primary, border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 800, width: '100%' }}>
                ↓ 이 가격으로 적용
              </button>
            )}
          </div>

          {/* 시장 표준가 참고 */}
          {mref && mref.monthly_with_vat > 0 && (
            <div style={{ ...GLASS.L3, padding: 11, borderRadius: 10, border: `1px solid ${diff <= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: '#475569' }}>📐 시장 평균 (참고)</span>
                <span style={{ fontWeight: 700, color: '#1e293b' }}>{mref.monthly_with_vat.toLocaleString('ko-KR')}원</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, marginTop: 5 }}>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>우리 견적 대비 (업계평균 {mref.ratio_pct}%/월 기준)</span>
                <span style={{ fontWeight: 800, color: diffColor }}>
                  {diff > 0 ? '+' : ''}{diff.toFixed(1)}% {diff <= 0 ? '저렴' : '비쌈'}
                </span>
              </div>
            </div>
          )}

          <div style={{ ...GLASS.L3, padding: 11, borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#475569' }}>원가 구성 (월)</div>
              <button onClick={() => setDetailOpen((v) => !v)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: COLORS.primary }}>
                {detailOpen ? '상세 접기 ▴' : '상세·산출근거 ▾'}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {items.filter((it) => !hidden.has(it.key)).map((it) => (
                <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: DOT[it.key] || '#64748b' }} />
                  <span style={{ color: it.key === 'discount' ? '#065f46' : '#475569', flex: 1 }}>{it.label}</span>
                  <span style={{ fontWeight: 700, color: it.key === 'discount' ? '#065f46' : '#1e293b' }}>{it.monthly.toLocaleString('ko-KR')}원</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px dashed rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ fontWeight: 800, color: '#0f2440' }}>합계 (원가)</span>
              <span style={{ fontWeight: 800, color: '#0f2440' }}>{result.cost_breakdown.total.toLocaleString('ko-KR')}원</span>
            </div>

            {/* 상세 — 산출근거 + 표시 토글 (작성자 전용) */}
            {detailOpen && (
              <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 9, color: '#94a3b8' }}>체크 해제 시 위 목록에서 숨김 (작성자 보기 전용 — 합계·계산엔 영향 없음)</div>
                {items.map((it) => (
                  <div key={it.key} style={{ ...GLASS.L1, padding: '7px 9px', borderRadius: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={!hidden.has(it.key)} onChange={() => toggleHidden(it.key)}
                        style={{ width: 13, height: 13, cursor: 'pointer', accentColor: COLORS.primary }} />
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: DOT[it.key] || '#64748b' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', flex: 1 }}>{it.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>{it.monthly.toLocaleString('ko-KR')}원</span>
                      {it.source && (
                        <span style={{ fontSize: 9, color: '#64748b', background: 'rgba(0,0,0,0.04)', padding: '1px 5px', borderRadius: 4 }}>{SOURCE_LABEL[it.source] || it.source}</span>
                      )}
                    </div>
                    {it.formula && (
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, lineHeight: 1.4, wordBreak: 'keep-all' }}>{it.formula}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ ...GLASS.L3, padding: 11, borderRadius: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', marginBottom: 7 }}>분석</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11 }}>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 10 }}>마진율</div>
                <div style={{ fontWeight: 800, color: result.margin_rate >= 10 ? '#065f46' : result.margin_rate >= 5 ? '#b45309' : '#991b1b' }}>{result.margin_rate.toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 10 }}>연 IRR</div>
                <div style={{ fontWeight: 800, color: '#0f2440' }}>{result.irr_annual.toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 10 }}>손익분기</div>
                <div style={{ fontWeight: 800, color: '#0f2440' }}>{result.breakeven_months}개월</div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 10 }}>경쟁력</div>
                <div style={{ fontWeight: 800, color: result.competitive_index <= 1.0 ? '#065f46' : '#b45309' }}>{result.competitive_index.toFixed(2)}</div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ color: '#94a3b8', fontSize: 10 }}>취득원가 합계</div>
                <div style={{ fontWeight: 800, color: '#0f2440' }}>{result.acquisition_total.toLocaleString('ko-KR')}원</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
