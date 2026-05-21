'use client'
// ═══════════════════════════════════════════════════════════════════
// InfoLine — 설정 탭 공통 안내 (N-58 단순화)
//   한 줄 요약 + ⓘ 클릭 시 상세 펼침. 기본은 접힘 — 공간 절약.
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { COLORS } from '@/app/utils/ui-tokens'

export default function InfoLine({
  summary,
  children,
}: {
  summary: string
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const hasDetail = !!children
  return (
    <div style={{
      marginBottom: 10, fontSize: 12, color: COLORS.textSecondary,
      display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap',
      lineHeight: 1.5,
    }}>
      <span style={{ flexShrink: 0 }}>💡</span>
      <span style={{ flex: 1, minWidth: 200 }}>
        {summary}
        {hasDetail && open && (
          <span style={{ color: COLORS.textMuted }}> — {children}</span>
        )}
      </span>
      {hasDetail && (
        <button type="button" onClick={() => setOpen(o => !o)}
                style={{
                  flexShrink: 0, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                  borderRadius: 99, cursor: 'pointer',
                  background: 'transparent', color: COLORS.textMuted,
                  border: `1px solid ${COLORS.borderFaint}`,
                }}
                title={open ? '접기' : '자세히'}>
          {open ? 'ⓘ 접기' : 'ⓘ 자세히'}
        </button>
      )}
    </div>
  )
}
