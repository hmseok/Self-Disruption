'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'
import { fmtDate } from '@/lib/format'

// ═══════════════════════════════════════════════════════════════
// MeetingSidebar — V2 Split view 좌측 패널 (PR-V2-A)
//   · 컴팩트 검색 + 5 type 필터 + 회의 카드 리스트
//   · 클릭 시 router.push(/meetings/[id])
//   · 접기 가능 (collapsed prop)
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
  organizer_name: string | null;
  open_action_count: number;
  action_count: number;
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

export default function MeetingSidebar({ activeId, collapsed, onToggleCollapsed, onNewClick }: Props) {
  const router = useRouter()
  const [list, setList] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'regular' | 'specific' | 'one_on_one' | 'department'>('all')
  const [search, setSearch] = useState('')

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
        {items.map((m) => {
          const isActive = activeId === m.id
          const tm = TYPE_META[m.type] || TYPE_META.specific
          const openCount = Number(m.open_action_count || 0)
          return (
            <div key={m.id}
              onClick={() => router.push(`/meetings/${m.id}`)}
              style={{
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer', marginBottom: 4,
                background: isActive ? 'rgba(59,110,181,0.10)' : 'transparent',
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
