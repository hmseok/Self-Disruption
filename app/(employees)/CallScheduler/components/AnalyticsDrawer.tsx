'use client'
// ═══════════════════════════════════════════════════════════════════
// AnalyticsDrawer — 우측에서 슬라이드 인, 분석 + 배포 이력 묶음
// 메인 캘린더가 풀폭을 쓰도록 분석을 토글로 분리 (v2 PR-2A)
// ═══════════════════════════════════════════════════════════════════
import { COLORS, GLASS, pillStyle } from '@/app/utils/ui-tokens'
import AnalyticsPanel from './AnalyticsPanel'
import type { ScheduleKpi, Distribution } from '../utils/types'

interface Props {
  open: boolean
  onClose: () => void
  kpi: ScheduleKpi
  distributions: Distribution[]
}

export default function AnalyticsDrawer({ open, onClose, kpi, distributions }: Props) {
  return (
    <>
      {/* 백드롭 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
          zIndex: 900, opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
      />
      {/* 드로어 본체 */}
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 420, maxWidth: '92vw',
          background: 'rgba(248,250,252,0.96)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          borderLeft: `1px solid ${COLORS.borderSubtle}`,
          boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
          zIndex: 950,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* 헤더 */}
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${COLORS.borderSubtle}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.textPrimary }}>
            📊 분석 & 배포 이력
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'transparent', border: `1px solid ${COLORS.borderFaint}`,
              cursor: 'pointer', color: COLORS.textSecondary, fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="닫기 (Esc)"
          >×</button>
        </div>

        {/* 본문 스크롤 영역 */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: 14,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <AnalyticsPanel workers={kpi.workers} />

          <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12 }}>
            <div style={{
              fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 8,
            }}>
              배포 이력
            </div>
            {distributions.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
                아직 배포된 적 없음
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {distributions.map(d => (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: 12, padding: '6px 8px', borderRadius: 6,
                    background: COLORS.bgGray,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={pillStyle(
                        d.status === 'sent' ? 'success' :
                        d.status === 'queued' ? 'info' :
                        d.status === 'partial' ? 'warning' : 'danger'
                      )}>
                        {d.channel}
                      </span>
                      <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>
                        {d.recipient_count}명
                      </span>
                    </div>
                    <span style={{ color: COLORS.textMuted, fontSize: 11, whiteSpace: 'nowrap' }}>
                      {new Date(d.sent_at || d.created_at).toLocaleString('ko-KR', {
                        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
