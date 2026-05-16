'use client'
// ═══════════════════════════════════════════════════════════════════
// N-17 — 빈자리 알람 (이번 주 min_coverage 미달)
// ═══════════════════════════════════════════════════════════════════
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

export interface EmptySlot {
  date: string
  dow_label: string
  group_name: string
  slot_code: string
  min: number
  actual: number
}

export default function EmptySlotsAlert({ slots }: { slots: EmptySlot[] }) {
  if (slots.length === 0) {
    return (
      <div style={{
        ...GLASS.L4, borderRadius: 12, padding: '12px 16px', marginBottom: 12,
        border: `1px solid ${COLORS.borderGreen}`,
        background: COLORS.bgGreen,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 16 }}>✅</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.success }}>
          이번 주 빈자리 없음 — 최소 인원 충족
        </span>
      </div>
    )
  }
  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, padding: '14px 16px', marginBottom: 12,
      border: `1px solid ${COLORS.borderRed}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.danger }}>
          이번 주 빈자리 알람
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700, color: COLORS.danger,
          background: COLORS.bgRed, padding: '2px 10px', borderRadius: 99,
          border: `1px solid ${COLORS.borderRed}`,
        }}>{slots.length}건</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {slots.slice(0, 8).map((s, i) => {
          const md = s.date.slice(5).replace('-', '/')
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 6,
              background: COLORS.bgRed,
              border: `1px solid ${COLORS.borderRed}`,
              fontSize: 12,
            }}>
              <span style={{ fontWeight: 700, color: COLORS.danger, minWidth: 64 }}>
                {md} ({s.dow_label})
              </span>
              <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>
                {s.group_name}
              </span>
              <span style={{ color: COLORS.textMuted }}>
                {s.slot_code}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ color: COLORS.danger, fontWeight: 700 }}>
                {s.actual} / {s.min}명
              </span>
            </div>
          )
        })}
        {slots.length > 8 && (
          <div style={{
            fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginTop: 4,
          }}>
            외 {slots.length - 8}건
          </div>
        )}
      </div>
    </div>
  )
}
