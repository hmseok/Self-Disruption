'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'
import { fmtDate } from '@/lib/format'

// ═══════════════════════════════════════════════════════════════
// MeetingSidebar — V2 Split view 좌측 패널 (PR-V2-A → PR-V2-Tree-1)
//   · 컴팩트 검색 + 5 type 필터 + 회의 카드 리스트
//   · 클릭 시 router.push(/meetings/[id])
//   · 접기 가능 (collapsed prop)
//   · PR-V2-Tree-1 — 그룹화 (유형/부서/주관자/월별) + 그룹 collapse
// ═══════════════════════════════════════════════════════════════

const TYPE_META: Record<string, { emoji: string; label: string; color: string }> = {
  regular:    { emoji: '📅', label: '정기',    color: '#3b82f6' },
  specific:   { emoji: '📋', label: '특정',    color: '#64748b' },
  one_on_one: { emoji: '👥', label: '1:1',     color: '#10b981' },
  department: { emoji: '🏢', label: '부서별',  color: '#f59e0b' },
}

interface Meeting {
  id: string; title: string; type: string;
  meeting_date: any; status: string;
  department: string | null;
  organizer_name: string | null;
  open_action_count: number;
  action_count: number;
}

type GroupBy = 'none' | 'type' | 'department' | 'organizer' | 'month'

const GROUP_LABEL: Record<GroupBy, string> = {
  none: '그룹 없음',
  type: '유형별',
  department: '부서별',
  organizer: '주관자별',
  month: '월별',
}

interface Props {
  /** 현재 선택된 회의 id (highlight) */
  activeId?: string | null
  /** 접힘 상태 */
  collapsed?: boolean
  /** 접기 토글 */
  onToggleCollapsed?: () => void
  /** 새 회의 만들기 클릭 */
  onNewClick?: () => void
}

// localStorage key — 사이드바 그룹/접힘 상태 보존
const LS_KEY_GROUP = 'meetings.sidebar.groupBy'
const LS_KEY_COLLAPSED = 'meetings.sidebar.collapsedGroups'

export default function MeetingSidebar({ activeId, collapsed, onToggleCollapsed, onNewClick }: Props) {
  const router = useRouter()
  const [list, setList] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'regular' | 'specific' | 'one_on_one' | 'department'>('all')
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())

  // localStorage 복원
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const g = window.localStorage.getItem(LS_KEY_GROUP) as GroupBy | null
      if (g && ['none', 'type', 'department', 'organizer', 'month'].includes(g)) setGroupBy(g)
      const c = window.localStorage.getItem(LS_KEY_COLLAPSED)
      if (c) setCollapsedGroups(new Set(JSON.parse(c)))
    } catch {}
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(LS_KEY_GROUP, groupBy) } catch {}
  }, [groupBy])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(LS_KEY_COLLAPSED, JSON.stringify(Array.from(collapsedGroups))) } catch {}
  }, [collapsedGroups])

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('type', filter)
    if (search) params.set('search', search)
    const { json } = await fetchWithAuth(`/api/meetings?${params}`)
    if (json?.data) setList(json.data)
    setLoading(false)
  }, [filter, search])

  useEffect(() => { load() }, [load])

  const items = useMemo(() => list, [list])

  // 그룹화
  type Group = { key: string; label: string; icon?: string; items: Meeting[] }
  const groups: Group[] = useMemo(() => {
    if (groupBy === 'none') return [{ key: '__all', label: '', items }]
    const map = new Map<string, Meeting[]>()
    for (const m of items) {
      let key = ''
      if (groupBy === 'type') key = m.type || 'specific'
      else if (groupBy === 'department') key = m.department || '미분류'
      else if (groupBy === 'organizer') key = m.organizer_name || '미배정'
      else if (groupBy === 'month') {
        key = m.meeting_date ? String(m.meeting_date).slice(0, 7) : '날짜 미정'
      }
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    const arr = Array.from(map.entries())
    // 정렬: 월별은 desc, 유형은 정해진 순, 나머지는 alphabetic
    if (groupBy === 'month') arr.sort(([a], [b]) => b.localeCompare(a))
    else if (groupBy === 'type') {
      const order = ['regular', 'specific', 'one_on_one', 'department']
      arr.sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    } else arr.sort(([a], [b]) => a.localeCompare(b))
    return arr.map(([key, items]) => {
      let label = key
      let icon = ''
      if (groupBy === 'type') {
        const tm = TYPE_META[key]
        if (tm) { label = tm.label; icon = tm.emoji }
      } else if (groupBy === 'department') icon = '🏢'
      else if (groupBy === 'organizer') icon = '👤'
      else if (groupBy === 'month') icon = '📅'
      return { key, label, icon, items }
    })
  }, [items, groupBy])

  if (collapsed) {
    return (
      <aside style={{
        width: 48,
        flexShrink: 0,
        ...GLASS.L2,
        borderRight: '1px solid rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '14px 0',
      }}>
        <button onClick={onToggleCollapsed}
          title="회의록 목록 펼치기"
          style={{ ...iconBtn }}>📋</button>
        <button onClick={onNewClick ?? (() => router.push('/meetings/new'))}
          title="새 회의록"
          style={{ ...iconBtn, background: COLORS.primary, color: '#fff', border: 'none' }}>+</button>
      </aside>
    )
  }

  return (
    <aside style={{
      width: 320,
      flexShrink: 0,
      ...GLASS.L2,
      borderRight: '1px solid rgba(0,0,0,0.05)',
      display: 'flex',
      flexDirection: 'column',
      maxHeight: '100vh',
    }}>
      {/* 헤더 */}
      <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>
          🗓 회의록
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onNewClick ?? (() => router.push('/meetings/new'))}
            title="새 회의록"
            style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6,
              background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}>+ 새 회의</button>
          {onToggleCollapsed && (
            <button onClick={onToggleCollapsed} title="접기" style={iconBtn}>‹</button>
          )}
        </div>
      </div>

      {/* 검색 */}
      <div style={{ padding: '0 14px 8px' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 제목/안건 검색"
          style={{
            width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 8,
            border: `1px solid ${COLORS.borderSubtle}`, background: GLASS.L1.background,
            color: COLORS.textPrimary, outline: 'none',
          }} />
      </div>

      {/* 그룹 select */}
      <div style={{ padding: '0 14px 6px', display: 'flex', gap: 4, alignItems: 'center' }}>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          title="회의록 그룹화 방식"
          style={{
            width: '100%', padding: '4px 8px', fontSize: 11, borderRadius: 6,
            border: `1px solid ${COLORS.borderSubtle}`, background: GLASS.L1.background,
            color: COLORS.textPrimary, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
          {Object.entries(GROUP_LABEL).map(([k, v]) => (
            <option key={k} value={k}>📂 그룹: {v}</option>
          ))}
        </select>
      </div>

      {/* 타입 필터 pills */}
      <div style={{ padding: '0 14px 10px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {([
          { k: 'all',        label: '전체' },
          { k: 'regular',    label: '📅' },
          { k: 'specific',   label: '📋' },
          { k: 'one_on_one', label: '👥' },
          { k: 'department', label: '🏢' },
        ] as const).map(b => (
          <button key={b.k} onClick={() => setFilter(b.k)}
            title={b.k === 'all' ? '전체' : TYPE_META[b.k]?.label}
            style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
              cursor: 'pointer', whiteSpace: 'nowrap',
              background: filter === b.k ? '#0f2440' : 'transparent',
              color: filter === b.k ? '#fff' : '#64748b',
              border: filter === b.k ? 'none' : `1px solid ${COLORS.borderSubtle}`,
            }}>
            {b.label}
          </button>
        ))}
      </div>

      {/* 회의 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 14px' }}>
        {loading && (
          <div style={{ padding: 20, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
            불러오는 중...
          </div>
        )}
        {!loading && items.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
            등록된 회의 없음
          </div>
        )}
        {groups.map(g => {
          const showHeader = groupBy !== 'none'
          const isCollapsed = collapsedGroups.has(g.key)
          return (
            <div key={g.key}>
              {showHeader && (
                <button onClick={() => toggleGroup(g.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    width: '100%', padding: '6px 10px', marginTop: 6, marginBottom: 2,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: COLORS.textSecondary, fontSize: 11, fontWeight: 700,
                    whiteSpace: 'nowrap', fontFamily: 'inherit', textAlign: 'left',
                  }}>
                  <span style={{ fontSize: 9, color: COLORS.textMuted, width: 10 }}>
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                  <span>{g.icon} {g.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: COLORS.textMuted, fontWeight: 600 }}>
                    {g.items.length}
                  </span>
                </button>
              )}
              {(!showHeader || !isCollapsed) && g.items.map((m) => {
                const isActive = activeId === m.id
                const tm = TYPE_META[m.type] || TYPE_META.specific
                const openCount = Number(m.open_action_count || 0)
                return (
                  <div key={m.id}
                    onClick={() => router.push(`/meetings/${m.id}`)}
                    style={{
                      padding: '10px 12px', borderRadius: 10, cursor: 'pointer', marginBottom: 4,
                      marginLeft: showHeader ? 12 : 0,
                      background: isActive ? `${COLORS.primary}1A` : 'transparent',
                      border: isActive ? `1px solid ${COLORS.primary}` : '1px solid transparent',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.03)' }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: `${tm.color}1A`, color: tm.color, fontWeight: 700, flexShrink: 0 }}>
                        {tm.emoji}
                      </span>
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: COLORS.textPrimary,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
                      }}>{m.title}</span>
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {fmtDate(m.meeting_date)} · {m.organizer_name || '미정'}
                      {openCount > 0 && (
                        <span style={{ marginLeft: 6, color: '#b45309', fontWeight: 600 }}>· ✓ {openCount}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

const iconBtn: React.CSSProperties = {
  padding: '4px 8px', fontSize: 12, fontWeight: 600,
  borderRadius: 6, cursor: 'pointer',
  background: 'transparent', color: COLORS.textSecondary,
  border: `1px solid ${COLORS.borderSubtle}`,
  whiteSpace: 'nowrap',
}
