'use client'

import { useOL, fmtWon, AnalysisItem } from './OperationalLearningContext'

// ═══════════════════════════════════════════════════════════════
// ComparisonDetail — 우측 상세 비교 패널 (Soft Ice Level 4)
// analyze API 결과 렌더 (items, overall_accuracy, recommendations)
// ═══════════════════════════════════════════════════════════════

export default function ComparisonDetail() {
  const { analysis, loadingAnalysis, selectedSnapshotId } = useOL()

  return (
    <aside style={{
      background: 'rgba(255,255,255,0.72)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(0,0,0,0.06)',
      borderRadius: 16,
      padding: 16,
      minWidth: 300,
      maxWidth: 360,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      boxShadow: '4px 4px 14px rgba(0,0,0,0.04)',
      height: 'fit-content',
      position: 'sticky',
      top: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>비교 상세</span>
        {analysis?.snapshot?.quote_id && (
          <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
            {analysis.snapshot.quote_id.slice(0, 8)}
          </span>
        )}
      </div>

      {!selectedSnapshotId && (
        <div style={{
          padding: '30px 10px',
          textAlign: 'center',
          color: '#94a3b8',
          fontSize: 12,
          lineHeight: 1.6,
        }}>
          좌측 목록에서 스냅샷을 선택하면<br />예측 vs 실적 상세 비교가<br />여기에 표시됩니다.
        </div>
      )}

      {selectedSnapshotId && loadingAnalysis && (
        <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
          분석 중…
        </div>
      )}

      {selectedSnapshotId && !loadingAnalysis && analysis && (
        <>
          {/* 요약 */}
          <div style={{
            background: 'rgba(248,250,252,0.8)',
            border: '1px solid rgba(0,0,0,0.05)',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 11,
            color: '#475569',
            lineHeight: 1.7,
          }}>
            <div><b>차종</b>: {analysis.snapshot.vehicle_class || '-'}</div>
            <div><b>계약</b>: {analysis.snapshot.contract_type === 'buyout' ? '인수' : '반환'} · {analysis.snapshot.term_months || '-'}개월</div>
            <div><b>예측 월임대료</b>: {fmtWon(analysis.snapshot.predicted_rent)}원</div>
            <div><b>실적 데이터</b>: {analysis.actuals?.length || 0}개월</div>
          </div>

          {/* 항목별 비교 테이블 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>항목별 비교</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'rgba(248,250,252,0.6)' }}>
                  <Th>항목</Th>
                  <Th align="right">예측</Th>
                  <Th align="right">실적</Th>
                  <Th align="right">편차</Th>
                </tr>
              </thead>
              <tbody>
                {analysis.analysis.items.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                      비교할 실적 데이터가 없습니다.
                    </td>
                  </tr>
                ) : analysis.analysis.items.map((it) => (
                  <ItemRow key={it.category} item={it} />
                ))}
              </tbody>
            </table>
          </div>

          {/* 전체 정확도 */}
          <div style={{
            background: accuracyBg(analysis.analysis.overall_accuracy),
            border: `1px solid ${accuracyBorder(analysis.analysis.overall_accuracy)}`,
            borderRadius: 10,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>전체 정확도</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: accuracyFg(analysis.analysis.overall_accuracy) }}>
              {analysis.analysis.overall_accuracy}%
            </span>
          </div>

          {/* 추천사항 */}
          {analysis.analysis.recommendations.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>💡 개선 추천</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {analysis.analysis.recommendations.map((r, i) => (
                  <div key={i} style={{
                    background: 'rgba(254,243,199,0.5)',
                    border: '1px solid rgba(253,230,138,0.7)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 11,
                    color: '#78350f',
                    lineHeight: 1.5,
                  }}>
                    {r}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  )
}

function ItemRow({ item }: { item: AnalysisItem }) {
  const colors = {
    accurate:      { fg: '#15803d', icon: '✅' },
    underestimate: { fg: '#b91c1c', icon: '⬆' },
    overestimate:  { fg: '#1d4ed8', icon: '⬇' },
  }
  const c = colors[item.status]
  return (
    <tr style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
      <td style={{ padding: '6px 8px', color: '#1e293b', fontWeight: 600 }}>{item.category}</td>
      <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>
        {fmtWon(item.predicted_monthly)}
      </td>
      <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#1e293b', fontWeight: 700 }}>
        {fmtWon(item.actual_monthly)}
      </td>
      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: c.fg, whiteSpace: 'nowrap' }}>
        {c.icon} {item.variance_pct > 0 ? '+' : ''}{item.variance_pct}%
      </td>
    </tr>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th style={{
      padding: '6px 8px',
      textAlign: align,
      fontSize: 10,
      fontWeight: 700,
      color: '#64748b',
      textTransform: 'uppercase',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
    }}>
      {children}
    </th>
  )
}

function accuracyBg(a: number): string {
  if (a >= 80) return 'rgba(220,252,231,0.6)'
  if (a >= 60) return 'rgba(254,243,199,0.6)'
  return 'rgba(254,226,226,0.6)'
}
function accuracyBorder(a: number): string {
  if (a >= 80) return 'rgba(134,239,172,0.8)'
  if (a >= 60) return 'rgba(253,230,138,0.8)'
  return 'rgba(252,165,165,0.8)'
}
function accuracyFg(a: number): string {
  if (a >= 80) return '#15803d'
  if (a >= 60) return '#b45309'
  return '#b91c1c'
}
