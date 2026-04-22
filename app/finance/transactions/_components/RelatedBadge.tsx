'use client'

// ═══════════════════════════════════════════════════════════
// RelatedBadge — 연결 대상 팝오버 배지 (Phase H2 이월 #90)
//   · 구 /finance/upload/page.tsx의 renderRelatedBadge closure 승격
//   · 상태는 부모 소유 — 이 컴포넌트는 프레젠테이션만 담당
//   · 카테고리별 필터링된 연결 대상 그룹 표시
// ═══════════════════════════════════════════════════════════

import React from 'react'

/** getRelatedDisplay 가 반환하는 형태 */
export type RelatedDisplay = {
  icon: string
  label: string
  detail?: string
  color?: string
}

/** relatedOptions useMemo 가 반환하는 그룹 구조 */
export type RelatedOptionGroup = {
  group: string
  icon: string
  items: Array<{
    value: string
    label: string
    sub: string
    color: string
  }>
}

export type RelatedBadgeProps = {
  /** 거래 아이템 — related_type/related_id 참조 */
  item: { id: number; related_type?: string | null; related_id?: string | null; category?: string | null; [key: string]: unknown }
  /** 부모에서 계산된 연결 대상 옵션 */
  relatedOptions: RelatedOptionGroup[]
  /** 부모에서 계산된 카테고리 필터 — null이면 전체 허용 */
  filteredRelatedGroups: string[] | null
  /** 현재 연결된 대상의 표시 정보 (없으면 null) */
  relatedDisplay: RelatedDisplay | null
  /** 팝오버 열림 여부 */
  isOpen: boolean
  /** 팝오버 fixed 위치 — right 기준 */
  popoverPos: { top: number; right: number; maxH?: number } | null
  /** 배지 클릭 토글 — 부모가 위치 계산 */
  onToggle: (el: HTMLElement) => void
  /** 연결 대상 선택 (value: "type_id" 형태) */
  onSelect: (value: string) => void
  /** 연결 해제 */
  onClear: () => void
  /** 팝오버 닫기 */
  onClose: () => void
}

export default function RelatedBadge({
  item,
  relatedOptions,
  filteredRelatedGroups,
  relatedDisplay,
  isOpen,
  popoverPos,
  onToggle,
  onSelect,
  onClear,
  onClose,
}: RelatedBadgeProps) {
  const rd = relatedDisplay
  const hasRelOpts = !filteredRelatedGroups || relatedOptions.some(rg => filteredRelatedGroups.includes(rg.group))

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={e => {
          if (!hasRelOpts && !rd) return
          onToggle(e.currentTarget)
        }}
        style={{
          width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px',
          fontSize: 13, background: rd ? '#f8fafc' : '#fff', color: '#4b5563',
          cursor: (!hasRelOpts && !rd) ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, textAlign: 'left', outline: 'none', minHeight: 32,
        }}
      >
        {rd ? (
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: rd.color || '#374151', whiteSpace: 'nowrap' }}>
              {rd.icon} {rd.label}
            </div>
            {rd.detail && <div style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>{rd.detail}</div>}
          </div>
        ) : (
          <span style={{ flex: 1, color: hasRelOpts ? '#f59e0b' : '#d1d5db', fontSize: 13, fontWeight: hasRelOpts ? 600 : 400 }}>
            {hasRelOpts ? '⚠ 연결 없음' : '—'}
          </span>
        )}
        {(hasRelOpts || rd) && <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>▼</span>}
      </button>
      {isOpen && popoverPos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={onClose} />
          <div style={{
            position: 'fixed', top: popoverPos.top, right: popoverPos.right, zIndex: 99,
            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px) saturate(150%)',
            WebkitBackdropFilter: 'blur(16px) saturate(150%)', border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: 8, boxShadow: '0 20px 48px rgba(30,41,59,0.12), 0 4px 16px rgba(30,41,59,0.08)',
            minWidth: 240, maxWidth: 320, maxHeight: popoverPos.maxH || 320, overflowY: 'auto',
          }}>
            <button
              onClick={onClear}
              style={{
                width: '100%', padding: '8px 12px', border: 'none',
                background: !rd ? '#f1f5f9' : 'transparent', cursor: 'pointer',
                textAlign: 'left', fontSize: 13, color: '#6b7280',
                display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #f1f5f9',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => { e.currentTarget.style.background = !rd ? '#f1f5f9' : 'transparent' }}
            >
              <span style={{ fontSize: 12 }}>✕</span> 연결 해제
            </button>
            {relatedOptions
              .filter(rg => !filteredRelatedGroups || filteredRelatedGroups.includes(rg.group))
              .map(group => (
                <div key={group.group}>
                  <div style={{
                    padding: '6px 12px', fontSize: 12, fontWeight: 800, color: '#94a3b8',
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                    background: '#f8fafc', borderTop: '1px solid #f1f5f9',
                  }}>
                    {group.icon} {group.group}
                  </div>
                  {group.items.map(opt => {
                    const selected = item.related_id
                      ? `${item.related_type}_${item.related_id}` === opt.value
                      : false
                    return (
                      <button
                        key={opt.value}
                        onClick={() => onSelect(opt.value)}
                        style={{
                          width: '100%', padding: '6px 12px', border: 'none',
                          background: selected ? '#eff6ff' : 'transparent',
                          cursor: 'pointer', textAlign: 'left',
                          display: 'flex', alignItems: 'center', gap: 8,
                          borderLeft: selected ? `3px solid ${opt.color}` : '3px solid transparent',
                        }}
                        onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#f8fafc' }}
                        onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
                      >
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {opt.label}
                          </div>
                          <div style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {opt.sub}
                          </div>
                        </div>
                        {selected && <span style={{ fontSize: 13, color: opt.color }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}
