'use client'

// ═══════════════════════════════════════════════════════════
// CategoryBadge — 분류 팝오버 배지 (Phase H2 이월 #90)
//   · 구 /finance/upload/page.tsx의 renderCategoryBadge closure 승격
//   · 상태는 부모 소유 — 이 컴포넌트는 프레젠테이션만 담당
//   · 2단계 팝오버: ① 중그룹 선택 → ② 세부항목 선택
// ═══════════════════════════════════════════════════════════

import React from 'react'
import {
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  getMergedCategoryGroups,
  getCategoryParts,
  getItemsForGroup,
} from '@/app/utils/finance-categories'

export type CategoryBadgeProps = {
  /** 거래 아이템 — category 필드 읽기에 사용 */
  item: { id: number; category?: string | null; [key: string]: unknown }
  /** 분류 표시 모드 */
  categoryMode: 'accounting' | 'display'
  /** 사용자 커스텀 카테고리 */
  customCategories: Array<{ group: string; items: string[] }>
  /** 팝오버 열림 여부 */
  isOpen: boolean
  /** 팝오버 단계 (group → item) */
  popoverStep: 'group' | 'item'
  /** 팝오버 단계2에서 보여줄 그룹 */
  popoverGroup: string
  /** 팝오버 fixed 위치 */
  popoverPos: { top: number; left: number; maxH?: number } | null
  /** 클릭 시 호출 — 부모가 위치 계산 + 토글 */
  onToggle: (el: HTMLElement) => void
  /** 단계 전환 */
  onStepChange: (step: 'group' | 'item') => void
  /** 중그룹 선택 (단계 2로 이동) */
  onGroupSelect: (group: string) => void
  /** 세부항목 최종 선택 — null이면 중그룹만 지정 */
  onItemSelect: (item: string | null) => void
  /** 팝오버 닫기 */
  onClose: () => void
}

export default function CategoryBadge({
  item,
  categoryMode,
  customCategories,
  isOpen,
  popoverStep,
  popoverGroup,
  popoverPos,
  onToggle,
  onStepChange,
  onGroupSelect,
  onItemSelect,
  onClose,
}: CategoryBadgeProps) {
  const catParts = getCategoryParts(item.category, categoryMode, customCategories)
  const isUnclassified = !catParts.group
  const groupColor = catParts.group ? (CATEGORY_COLORS[catParts.group] || '#94a3b8') : ''
  const groupIcon = catParts.item ? (CATEGORY_ICONS[catParts.item] || '📋') : '❓'

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={e => onToggle(e.currentTarget)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 6px', cursor: 'pointer',
          border: isUnclassified ? '1.5px dashed #f87171' : '1px solid #e2e8f0',
          borderRadius: 6, background: isUnclassified ? '#fef2f2' : '#fff', transition: 'border-color 0.15s',
        }}
      >
        {isUnclassified ? (
          <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', flex: 1 }}>❓ 미분류</span>
        ) : (
          <>
            <span style={{ fontSize: 12, flexShrink: 0 }}>{groupIcon}</span>
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: groupColor, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {catParts.group.replace(/^[^\s]+\s/, '')}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                {catParts.item || '(미지정)'}
              </div>
            </div>
          </>
        )}
        <span style={{ fontSize: 8, color: '#94a3b8', flexShrink: 0 }}>▼</span>
      </div>
      {isOpen && popoverPos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={onClose} />
          <div style={{
            position: 'fixed', top: popoverPos.top, left: popoverPos.left, zIndex: 99,
            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px) saturate(150%)',
            WebkitBackdropFilter: 'blur(16px) saturate(150%)', border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: 10, boxShadow: '0 20px 48px rgba(30,41,59,0.12), 0 4px 16px rgba(30,41,59,0.08)',
            minWidth: 220, maxHeight: popoverPos.maxH || 340, overflowY: 'auto',
          }}>
            {popoverStep === 'group' ? (
              <>
                <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 800, color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  ① 중그룹 선택
                </div>
                {getMergedCategoryGroups(categoryMode, customCategories).map(g => (
                  <button
                    key={g.group}
                    onClick={() => onGroupSelect(g.group)}
                    style={{
                      width: '100%', padding: '8px 12px', border: 'none',
                      background: catParts.group === g.group ? '#eff6ff' : 'transparent',
                      cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b',
                      display: 'flex', alignItems: 'center', gap: 6,
                      borderLeft: catParts.group === g.group
                        ? `3px solid ${CATEGORY_COLORS[g.group] || '#94a3b8'}`
                        : '3px solid transparent',
                    }}
                    onMouseEnter={e => { if (catParts.group !== g.group) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { if (catParts.group !== g.group) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: CATEGORY_COLORS[g.group] || '#94a3b8', flexShrink: 0 }} />
                    {g.group}
                  </button>
                ))}
              </>
            ) : (
              <>
                <div style={{ padding: '6px 12px', fontSize: 12, fontWeight: 800, color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => onStepChange('group')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#3b6eb5', padding: 0 }}>←</button>
                  ② 세부항목
                </div>
                <button
                  onClick={() => onItemSelect(null)}
                  style={{
                    width: '100%', padding: '7px 12px', border: 'none',
                    background: !catParts.item ? '#fffbeb' : 'transparent', cursor: 'pointer',
                    textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#92400e',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  📂 중그룹만 (미지정)
                </button>
                {[...getItemsForGroup(popoverGroup, categoryMode), ...(customCategories.find(c => c.group === popoverGroup)?.items || [])].map(c => (
                  <button
                    key={c}
                    onClick={() => onItemSelect(c)}
                    style={{
                      width: '100%', padding: '7px 12px', border: 'none',
                      background: catParts.item === c ? '#eff6ff' : 'transparent',
                      cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b',
                      display: 'flex', alignItems: 'center', gap: 6,
                      borderLeft: catParts.item === c ? '3px solid #3b6eb5' : '3px solid transparent',
                    }}
                    onMouseEnter={e => { if (catParts.item !== c) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { if (catParts.item !== c) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: 12 }}>{CATEGORY_ICONS[c] || '📋'}</span>
                    {c}
                    {catParts.item === c && <span style={{ marginLeft: 'auto', color: '#3b6eb5', fontSize: 13 }}>✓</span>}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
