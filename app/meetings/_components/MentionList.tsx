'use client'
import { useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════
// MentionList — @멘션 자동완성 메뉴 UI (PR-MTG-V2-C)
//   · TipTap Mention suggestion render 안에서 ReactRenderer 로 마운트
//   · forwardRef + useImperativeHandle 로 onKeyDown 노출 (↑/↓/Enter/Esc)
//   · 직원 / 회의 / ERP 엔티티 공용 (item 형식만 props로 결정)
// ═══════════════════════════════════════════════════════════════

export interface MentionItem {
  id: string
  label: string                          // 표시 라벨 (이름 / 제목)
  subtitle?: string                      // 부서 / 직책 / 일시 등
  icon?: string                          // 좌측 아이콘 (기본: 👤)
}

interface Props {
  items: MentionItem[]
  command: (item: MentionItem) => void
  loading?: boolean
  emptyHint?: string
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const MentionList = forwardRef<MentionListRef, Props>(({ items, command, loading, emptyHint }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  useEffect(() => { setSelectedIndex(0) }, [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) return false
      if (event.key === 'ArrowUp') {
        setSelectedIndex(i => (i + items.length - 1) % items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex(i => (i + 1) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        const it = items[selectedIndex]
        if (it) command(it)
        return true
      }
      return false
    },
  }), [items, selectedIndex, command])

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: '14px 16px', textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
          🔍 검색 중...
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: '14px 16px', textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
          {emptyHint || '🔍 일치 항목 없음'}
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={{ maxHeight: 280, overflowY: 'auto', padding: '4px 0' }}>
        {items.map((it, i) => {
          const active = i === selectedIndex
          return (
            <button key={it.id}
              onClick={() => command(it)}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px',
                background: active ? `${COLORS.primary}1A` : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit',
              }}>
              <span style={{
                fontSize: 14, width: 26, height: 26, lineHeight: '26px',
                textAlign: 'center', borderRadius: 6,
                background: active ? '#fff' : 'rgba(0,0,0,0.04)',
                flexShrink: 0,
              }}>{it.icon || '👤'}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: COLORS.textPrimary,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{it.label}</div>
                {it.subtitle && (
                  <div style={{
                    fontSize: 11, color: COLORS.textMuted,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{it.subtitle}</div>
                )}
              </span>
            </button>
          )
        })}
      </div>
      <div style={{ padding: '6px 12px', borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', gap: 10 }}>
        <span style={hintStyle}>↑↓ 이동</span>
        <span style={hintStyle}>Enter 선택</span>
        <span style={hintStyle}>Esc 닫기</span>
      </div>
    </div>
  )
})

MentionList.displayName = 'MentionList'

export default MentionList

const containerStyle: React.CSSProperties = {
  background: GLASS.L5.background,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 12,
  boxShadow: '0 10px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06)',
  width: 280,
  overflow: 'hidden',
  fontFamily: 'inherit',
}
const hintStyle: React.CSSProperties = {
  fontSize: 10,
  color: COLORS.textMuted,
  whiteSpace: 'nowrap',
}
