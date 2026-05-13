'use client'
import { useState, useEffect, useImperativeHandle, forwardRef, useMemo } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════
// SlashCommandMenu — PR-MTG-V2-B 슬래시 명령 메뉴 UI
//   · TipTap Suggestion 의 render 안에서 ReactRenderer 로 마운트
//   · forwardRef + useImperativeHandle 로 onKeyDown 노출 (↑/↓/Enter/Esc)
// ═══════════════════════════════════════════════════════════════

export interface SlashItem {
  key: string
  title: string
  description?: string
  icon: string
  category?: '기본' | '미디어' | '임베드' | 'ERP'
  command: (props: { editor: any; range: any }) => void
}

interface Props {
  items: SlashItem[]
  command: (item: SlashItem) => void
}

export interface SlashCommandMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const SlashCommandMenu = forwardRef<SlashCommandMenuRef, Props>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // items 변경 시 선택 reset
  useEffect(() => { setSelectedIndex(0) }, [items])

  // ── 카테고리별 그룹 ─────────────────────────────────────────
  const grouped = useMemo(() => {
    const order = ['기본', '미디어', '임베드', 'ERP'] as const
    const map = new Map<string, SlashItem[]>()
    for (const it of items) {
      const cat = it.category || '기본'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(it)
    }
    const result: { category: string; items: SlashItem[]; startIndex: number }[] = []
    let start = 0
    for (const cat of order) {
      const arr = map.get(cat)
      if (arr && arr.length > 0) {
        result.push({ category: cat, items: arr, startIndex: start })
        start += arr.length
      }
    }
    return result
  }, [items])

  // ── 키보드 ───────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
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

  if (items.length === 0) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textMuted, marginBottom: 4 }}>
          🔍 일치 항목 없음
        </div>
        <div style={{ fontSize: 11, color: COLORS.textMuted }}>
          다른 키워드 시도: 제목 / 체크 / 표 / 이미지 / 인용
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={{ padding: '8px 12px 4px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, letterSpacing: '0.04em' }}>
          ✨ 블록 추가
        </div>
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto', padding: '4px 0' }}>
        {grouped.map(g => (
          <div key={g.category}>
            <div style={{
              padding: '6px 12px 2px', fontSize: 10, fontWeight: 700,
              color: COLORS.textMuted, letterSpacing: '0.04em', whiteSpace: 'nowrap',
            }}>{g.category}</div>
            {g.items.map((it, i) => {
              const globalIdx = g.startIndex + i
              const active = globalIdx === selectedIndex
              return (
                <button key={it.key}
                  onClick={() => command(it)}
                  onMouseEnter={() => setSelectedIndex(globalIdx)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px',
                    background: active ? `${COLORS.primary}1A` : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'inherit',
                  }}>
                  <span style={{
                    fontSize: 18, width: 26, height: 26, lineHeight: '26px',
                    textAlign: 'center', borderRadius: 6,
                    background: active ? '#fff' : 'rgba(0,0,0,0.04)',
                    flexShrink: 0,
                  }}>{it.icon}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {it.title}
                    </div>
                    {it.description && (
                      <div style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {it.description}
                      </div>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div style={{ padding: '6px 12px', borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span style={hintStyle}>↑↓ 이동</span>
        <span style={hintStyle}>Enter 선택</span>
        <span style={hintStyle}>Esc 닫기</span>
        <span style={{ ...hintStyle, marginLeft: 'auto', color: COLORS.primary }}>
          @멘션 (V2-C) · ERP 임베드 (V2-D)
        </span>
      </div>
    </div>
  )
})

SlashCommandMenu.displayName = 'SlashCommandMenu'

export default SlashCommandMenu

// ── 스타일 ──────────────────────────────────────────────────────
const containerStyle: React.CSSProperties = {
  // L5 + 추가 blur — popup 가독성 우선
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
const emptyStyle: React.CSSProperties = {
  ...containerStyle,
  padding: '14px 16px',
  textAlign: 'center',
}
const hintStyle: React.CSSProperties = {
  fontSize: 10,
  color: COLORS.textMuted,
  whiteSpace: 'nowrap',
}
