'use client'

import { GLASS, COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// CostSummaryPanel — 실시간 원가 산출 결과 패널 (PR-Q4-1)
//
// 적정 월 렌트료 강조 + 7대 원가 + 분석 (마진/IRR/손익분기/경쟁력)
// 「↓ 이 가격으로 적용」 → 부모 form 의 monthly_fee 자동 채움
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
}

interface Props {
  result: CalcResult | null
  loading?: boolean
  err?: string | null
  onApply?: () => void
}

export default function CostSummaryPanel({ result, loading, err, onApply }: Props) {
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

          <div style={{ ...GLASS.L3, padding: 11, borderRadius: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', marginBottom: 7 }}>원가 구성 (월)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { label: '감가상각', value: result.cost_breakdown.depreciation, dot: '#3b6eb5' },
                { label: '금융비용', value: result.cost_breakdown.finance, dot: '#6366f1' },
                { label: '보험료', value: result.cost_breakdown.insurance, dot: '#10b981' },
                { label: '정비비', value: result.cost_breakdown.maintenance, dot: '#f59e0b' },
                { label: '세금·검사', value: result.cost_breakdown.tax_inspection, dot: '#ef4444' },
                { label: '리스크', value: result.cost_breakdown.risk, dot: '#a855f7' },
                { label: '간접비', value: result.cost_breakdown.overhead, dot: '#64748b' },
              ].map((it) => (
                <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: it.dot }} />
                  <span style={{ color: '#475569', flex: 1 }}>{it.label}</span>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{it.value.toLocaleString('ko-KR')}원</span>
                </div>
              ))}
              {result.cost_breakdown.discount < 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
                  <span style={{ color: '#065f46', flex: 1 }}>할인</span>
                  <span style={{ fontWeight: 700, color: '#065f46' }}>{result.cost_breakdown.discount.toLocaleString('ko-KR')}원</span>
                </div>
              )}
            </div>
            <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px dashed rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ fontWeight: 800, color: '#0f2440' }}>합계 (원가)</span>
              <span style={{ fontWeight: 800, color: '#0f2440' }}>{result.cost_breakdown.total.toLocaleString('ko-KR')}원</span>
            </div>
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
