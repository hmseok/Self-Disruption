'use client'
// ═══════════════════════════════════════════════════════════════════
// GroupsTab — 시프트 그룹 목록 + 추가 + 편집 + 정렬 + 카드 상세
// PR-2QQ-a — 카테고리 필터 + 멤버 chip + 색상 미리보기 + 정렬 컨트롤
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_BORDER, TONE_TEXT, TONE_SOLID } from '@/app/(employees)/CallScheduler/utils/palette'
import { getAuthHeader } from '@/app/utils/auth-client'
import GroupEditor from './GroupEditor'
import type { ShiftSlot, Worker, ColorTone } from '@/app/(employees)/CallScheduler/utils/types'

interface GroupMemberChip {
  id: string
  name: string
  color_tone: ColorTone
  priority: number
}

export interface ShiftGroup {
  id: string
  name: string
  category: string  // PR-2QQ-a — 주간/야간/특수/general
  shift_slot_id: string
  pattern_type: 'all_days' | 'all_weekdays' | 'weekends_only' | 'custom'
  custom_days: string | null
  generation_strategy: 'all_members' | 'rotation'
  rotation_size: number | null
  rotation_period_days: number
  color_tone: ColorTone
  description: string | null
  sort_order: number
  is_active: boolean
  // join 컬럼
  slot_code: string
  slot_label: string
  start_time: string
  end_time: string
  is_overnight: boolean
  member_count: number
  members: GroupMemberChip[]  // PR-2QQ-a — 워커 chip 정보
}

const PATTERN_LABEL: Record<ShiftGroup['pattern_type'], string> = {
  all_days: '매일',
  all_weekdays: '평일만',
  weekends_only: '주말만',
  custom: '요일 지정',
}

const STRATEGY_LABEL: Record<ShiftGroup['generation_strategy'], string> = {
  all_members: '전원 동시',
  rotation: '로테이션',
}

const DOW_LABEL = ['일', '월', '화', '수', '목', '금', '토']

// 카테고리 자동 분류 (마이그레이션 후 사용자가 수정 가능)
const AUTO_CATEGORIES = ['주간', '야간', '특수', 'general'] as const

type SortKey = 'sort_order' | 'name' | 'slot_time' | 'members'

export default function GroupsTab() {
  const [groups, setGroups] = useState<ShiftGroup[]>([])
  const [slots, setSlots] = useState<ShiftSlot[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('sort_order')
  const [reordering, setReordering] = useState(false)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const [gRes, sRes, wRes] = await Promise.all([
        fetch('/api/call-scheduler/shift-groups', { headers: auth }),
        fetch('/api/call-scheduler/shift-slots', { headers: auth }),
        fetch('/api/call-scheduler/workers', { headers: auth }),
      ])
      const gJ = await gRes.json(); if (!gRes.ok) throw new Error(gJ?.error || '그룹 조회 실패')
      const sJ = await sRes.json(); if (!sRes.ok) throw new Error(sJ?.error || '슬롯 조회 실패')
      const wJ = await wRes.json(); if (!wRes.ok) throw new Error(wJ?.error || '워커 조회 실패')
      setGroups(gJ.data); setSlots(sJ.data); setWorkers(wJ.data)
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // 카테고리 인덱스 (실재하는 카테고리만 필터 노출)
  const categoryStats = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of groups) m.set(g.category || 'general', (m.get(g.category || 'general') || 0) + 1)
    const arr = Array.from(m.entries()).sort((a, b) => {
      const ai = AUTO_CATEGORIES.indexOf(a[0] as any)
      const bi = AUTO_CATEGORIES.indexOf(b[0] as any)
      if (ai >= 0 && bi >= 0) return ai - bi
      if (ai >= 0) return -1
      if (bi >= 0) return 1
      return a[0].localeCompare(b[0])
    })
    return arr
  }, [groups])

  // 필터 + 정렬
  const visible = useMemo(() => {
    const filtered = filterCategory === 'all'
      ? groups
      : groups.filter(g => (g.category || 'general') === filterCategory)
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'name': return a.name.localeCompare(b.name)
        case 'slot_time': return a.start_time.localeCompare(b.start_time)
        case 'members': return b.member_count - a.member_count
        case 'sort_order':
        default:
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
          return a.name.localeCompare(b.name)
      }
    })
    return sorted
  }, [groups, filterCategory, sortKey])

  // 카테고리 그룹핑 (정렬 모드 X 일 때 시각적 묶음)
  const visibleByCategory = useMemo(() => {
    const m = new Map<string, ShiftGroup[]>()
    for (const g of visible) {
      const cat = g.category || 'general'
      const arr = m.get(cat) || []
      arr.push(g)
      m.set(cat, arr)
    }
    return m
  }, [visible])

  // 정렬 변경 (sort_order 재계산)
  const moveGroup = async (groupId: string, dir: 'up' | 'down') => {
    const idx = visible.findIndex(g => g.id === groupId)
    if (idx < 0) return
    const target = dir === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= visible.length) return
    setReordering(true)
    try {
      const auth = await getAuthHeader()
      // 두 그룹의 sort_order 교환
      const a = visible[idx], b = visible[target]
      await Promise.all([
        fetch(`/api/call-scheduler/shift-groups/${a.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ sort_order: b.sort_order }),
        }),
        fetch(`/api/call-scheduler/shift-groups/${b.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ sort_order: a.sort_order }),
        }),
      ])
      await load()
    } catch (e: any) {
      alert(e?.message || '순서 변경 실패')
    } finally {
      setReordering(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
  }
  if (error) {
    return (
      <div style={{
        padding: 12, background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
        borderRadius: 8, color: COLORS.danger, fontSize: 13,
      }}>❌ {error}</div>
    )
  }

  if (editingId !== null) {
    return (
      <GroupEditor
        groupId={editingId === 'new' ? null : editingId}
        slots={slots}
        workers={workers}
        onClose={() => setEditingId(null)}
        onSaved={() => { setEditingId(null); load() }}
      />
    )
  }

  return (
    <div>
      {/* 헤더 — 카운트 + 추가 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontSize: 13, color: COLORS.textSecondary }}>
          시프트 그룹 {groups.length}개 — 자동 생성에 사용됩니다.
        </div>
        <button type="button" onClick={() => setEditingId('new')}
                style={{
                  ...BTN.md, background: COLORS.primary, color: '#fff',
                  border: 'none', cursor: 'pointer',
                }}>
          + 그룹 추가
        </button>
      </div>

      {/* 필터 + 정렬 컨트롤 */}
      {groups.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          marginBottom: 12, padding: '8px 12px',
          ...GLASS.L1, borderRadius: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700 }}>카테고리:</span>
            <CategoryPill active={filterCategory === 'all'} onClick={() => setFilterCategory('all')}>
              전체 ({groups.length})
            </CategoryPill>
            {categoryStats.map(([cat, cnt]) => (
              <CategoryPill
                key={cat}
                active={filterCategory === cat}
                onClick={() => setFilterCategory(cat)}
              >
                {cat === 'general' ? '일반' : cat} ({cnt})
              </CategoryPill>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700 }}>정렬:</span>
            <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
                    style={{
                      padding: '4px 8px', borderRadius: 6, border: `1px solid ${COLORS.borderFaint}`,
                      fontSize: 12, background: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                    }}>
              <option value="sort_order">순서 (커스텀)</option>
              <option value="slot_time">시작 시간</option>
              <option value="name">이름</option>
              <option value="members">멤버 수</option>
            </select>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div style={{
          ...GLASS.L4, borderRadius: 12, padding: 60, textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 12 }}>
            아직 그룹이 없습니다.
          </div>
          <button type="button" onClick={() => setEditingId('new')}
                  style={{
                    ...BTN.md, background: COLORS.primary, color: '#fff',
                    border: 'none', cursor: 'pointer',
                  }}>
            + 첫 그룹 만들기
          </button>
        </div>
      ) : sortKey === 'sort_order' && filterCategory === 'all' ? (
        // 카테고리별 섹션 표시
        <>
          {Array.from(visibleByCategory.entries()).map(([cat, arr]) => (
            <div key={cat} style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 12, fontWeight: 800, color: COLORS.textSecondary,
                marginBottom: 8, padding: '0 4px',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span>{cat === 'general' ? '일반' : cat}</span>
                <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 600 }}>
                  ({arr.length}그룹 · {arr.reduce((s, g) => s + g.member_count, 0)}명)
                </span>
              </div>
              <GroupGrid
                groups={arr}
                onEdit={setEditingId}
                onMove={moveGroup}
                reordering={reordering}
                showOrderControls={sortKey === 'sort_order'}
              />
            </div>
          ))}
        </>
      ) : (
        <GroupGrid
          groups={visible}
          onEdit={setEditingId}
          onMove={moveGroup}
          reordering={reordering}
          showOrderControls={sortKey === 'sort_order'}
        />
      )}
    </div>
  )

  // ── 헬퍼 컴포넌트 ────────────────────────────────────────────────

  function CategoryPill({ active, onClick, children }: {
    active: boolean
    onClick: () => void
    children: React.ReactNode
  }) {
    return (
      <button type="button" onClick={onClick}
              style={{
                padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                background: active ? COLORS.primary : 'rgba(255,255,255,0.8)',
                color: active ? '#fff' : COLORS.textSecondary,
                border: `1px solid ${active ? COLORS.primary : COLORS.borderFaint}`,
                cursor: 'pointer',
              }}>
        {children}
      </button>
    )
  }
}

function GroupGrid({ groups, onEdit, onMove, reordering, showOrderControls }: {
  groups: ShiftGroup[]
  onEdit: (id: string | 'new') => void
  onMove: (id: string, dir: 'up' | 'down') => void
  reordering: boolean
  showOrderControls: boolean
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
      {groups.map((g, idx) => (
        <GroupCard
          key={g.id}
          g={g}
          onEdit={() => onEdit(g.id)}
          onMoveUp={idx > 0 && showOrderControls ? () => onMove(g.id, 'up') : undefined}
          onMoveDown={idx < groups.length - 1 && showOrderControls ? () => onMove(g.id, 'down') : undefined}
          reordering={reordering}
        />
      ))}
    </div>
  )
}

function GroupCard({ g, onEdit, onMoveUp, onMoveDown, reordering }: {
  g: ShiftGroup
  onEdit: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  reordering: boolean
}) {
  // 색상 토큰 — 그룹 자체 색
  const tone = g.color_tone || 'none'
  const cardBg = tone !== 'none' ? TONE_BG[tone] : 'rgba(255,255,255,0.72)'
  const cardBorder = tone !== 'none' ? TONE_BORDER[tone] : COLORS.borderFaint
  const accent = TONE_SOLID[tone]

  // 패턴 상세 — custom 일 때 요일 명시
  const patternDetail = g.pattern_type === 'custom' && g.custom_days
    ? g.custom_days.split(',').map(s => DOW_LABEL[Number(s.trim())] || '').filter(Boolean).join('·')
    : null

  return (
    <div style={{
      ...GLASS.L4,
      borderRadius: 12, padding: 0, textAlign: 'left',
      border: `1px solid ${cardBorder}`,
      background: cardBg,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* 좌측 색상 바 */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 4, background: accent,
      }} />

      {/* 헤더 — 이름 + 멤버수 + 정렬 컨트롤 */}
      <div style={{
        padding: '12px 14px 8px 18px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 800, color: TONE_TEXT[tone],
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: accent, flexShrink: 0,
            }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {g.name}
            </span>
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontWeight: 600 }}>
            {(g.category && g.category !== 'general') ? g.category : '일반'}
            {' · '}
            <span style={{ color: COLORS.textSecondary }}>{g.slot_code}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{
            ...pillStyle('neutral'),
            background: 'rgba(255,255,255,0.85)',
            border: `1px solid ${COLORS.borderFaint}`,
          }}>
            {g.member_count}명
          </span>
          {(onMoveUp || onMoveDown) && (
            <div style={{ display: 'flex', gap: 2 }}>
              <button type="button"
                      onClick={(e) => { e.stopPropagation(); onMoveUp?.() }}
                      disabled={!onMoveUp || reordering}
                      style={iconBtnStyle(!!onMoveUp && !reordering)}
                      title="위로 이동">▲</button>
              <button type="button"
                      onClick={(e) => { e.stopPropagation(); onMoveDown?.() }}
                      disabled={!onMoveDown || reordering}
                      style={iconBtnStyle(!!onMoveDown && !reordering)}
                      title="아래로 이동">▼</button>
            </div>
          )}
        </div>
      </div>

      {/* 본문 — 시간 / 패턴 / 전략 */}
      <div style={{ padding: '0 14px 8px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 12, color: COLORS.textPrimary, fontWeight: 600 }}>
          🕐 {g.start_time} ~ {g.end_time}
          {g.is_overnight && (
            <span style={{
              marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4,
              background: COLORS.bgViolet, color: '#7c3aed', fontWeight: 700,
            }}>익일</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span style={pillStyle('info')}>
            {PATTERN_LABEL[g.pattern_type]}
            {patternDetail && ` (${patternDetail})`}
          </span>
          <span style={pillStyle('primary')}>
            {STRATEGY_LABEL[g.generation_strategy]}
            {g.generation_strategy === 'rotation' && g.rotation_size
              ? ` ${g.rotation_size}명/${g.rotation_period_days}일`
              : ''}
          </span>
        </div>
      </div>

      {/* 멤버 chip 영역 */}
      {g.members && g.members.length > 0 && (
        <div style={{
          padding: '8px 14px 10px 18px',
          borderTop: `1px solid ${COLORS.borderFaint}`,
          background: 'rgba(255,255,255,0.4)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, marginBottom: 4 }}>
            멤버 ({g.members.length}명)
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {g.members.slice(0, 12).map(m => (
              <span key={m.id} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 99,
                background: TONE_BG[m.color_tone] !== 'transparent' ? TONE_BG[m.color_tone] : 'rgba(255,255,255,0.7)',
                color: TONE_TEXT[m.color_tone],
                border: `1px solid ${TONE_BORDER[m.color_tone]}`,
                fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                {m.name}
              </span>
            ))}
            {g.members.length > 12 && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 99,
                background: 'rgba(0,0,0,0.05)', color: COLORS.textMuted, fontWeight: 600,
              }}>
                +{g.members.length - 12}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 설명 */}
      {g.description && (
        <div style={{
          padding: '6px 14px 8px 18px',
          fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic',
          borderTop: `1px solid ${COLORS.borderFaint}`,
        }}>
          {g.description}
        </div>
      )}

      {/* 편집 버튼 */}
      <button type="button" onClick={onEdit}
              style={{
                margin: '0 12px 12px 18px', padding: '6px 10px',
                borderRadius: 6, border: `1px solid ${COLORS.borderFaint}`,
                background: 'rgba(255,255,255,0.7)', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, color: COLORS.textSecondary,
              }}>
        ✏️ 편집 / 멤버 관리
      </button>
    </div>
  )
}

function iconBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    width: 22, height: 22, padding: 0,
    border: `1px solid ${COLORS.borderFaint}`,
    background: enabled ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)',
    color: enabled ? COLORS.textSecondary : COLORS.textMuted,
    fontSize: 9, fontWeight: 700, borderRadius: 4,
    cursor: enabled ? 'pointer' : 'not-allowed',
    lineHeight: 1,
  }
}
