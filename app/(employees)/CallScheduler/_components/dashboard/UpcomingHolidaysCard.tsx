'use client'
// ═══════════════════════════════════════════════════════════════════
// N-17 — 다가오는 휴일 (다음 14일)
// ═══════════════════════════════════════════════════════════════════
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

export interface Holiday {
  date: string
  name: string
  affected_groups: string[]
}

const DOW_KR = ['일','월','화','수','목','금','토']

export default function UpcomingHolidaysCard({ holidays }: { holidays: Holiday[] }) {
  if (holidays.length === 0) {
    return (
      <div style={{
        ...GLASS.L4, borderRadius: 12, padding: '12px 16px', marginBottom: 12,
        border: `1px solid ${COLORS.borderFaint}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 16 }}>🎌</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textMuted }}>
          다음 14일 휴일 없음
        </span>
      </div>
    )
  }
  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, padding: '14px 16px', marginBottom: 12,
      border: `1px solid ${COLORS.borderFaint}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>🎌</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
          다가오는 휴일 <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600 }}>(다음 14일)</span>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {holidays.map(h => {
          const d = new Date(h.date + 'T00:00:00')
          const md = h.date.slice(5).replace('-', '/')
          const dow = DOW_KR[d.getDay()]
          return (
            <div key={h.date} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 8,
              background: COLORS.bgRed,
              border: `1px solid ${COLORS.borderRed}`,
              fontSize: 12,
            }}>
              <span style={{ fontWeight: 700, color: COLORS.danger, minWidth: 70, whiteSpace: 'nowrap' }}>
                {md} ({dow})
              </span>
              <span style={{ color: COLORS.textPrimary, fontWeight: 700 }}>
                {h.name}
              </span>
              <div style={{ flex: 1 }} />
              {h.affected_groups.length > 0 && (
                <span style={{
                  fontSize: 10, color: COLORS.textMuted, fontWeight: 500,
                }}>
                  자동 제외: {h.affected_groups.slice(0, 3).join(', ')}
                  {h.affected_groups.length > 3 && ` 외 ${h.affected_groups.length - 3}`}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
