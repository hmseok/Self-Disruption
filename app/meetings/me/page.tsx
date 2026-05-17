'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'
import { fmtDate } from '@/lib/format'
import DcStatStrip, { StatItem } from '@/app/components/DcStatStrip'
import DcToolbar from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn } from '@/app/components/NeuDataTable'

// ═══════════════════════════════════════════════════════════════
// 내 TODO 대시보드 — /meetings/me (PR-MTG-V2-Me)
//
// meeting_action_items WHERE assignee_id = user.id
// DcStatStrip (5 카드) + DcToolbar (검색 + 상태 필터) + NeuDataTable (8 컬럼 sortBy)
// 인라인 ☑ 토글 (open ↔ done)
// ═══════════════════════════════════════════════════════════════

const TYPE_META: Record<string, { emoji: string; label: string; color: string }> = {
  regular:    { emoji: '📅', label: '정기',    color: '#3b82f6' },
  specific:   { emoji: '📋', label: '특정',    color: '#64748b' },
  one_on_one: { emoji: '👥', label: '1:1',     color: '#10b981' },
  department: { emoji: '🏢', label: '부서별',  color: '#f59e0b' },
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  open:    { label: '진행중', color: '#1d4ed8', bg: 'rgba(59,130,246,0.12)' },
  done:    { label: '완료',   color: '#15803d', bg: 'rgba(34,197,94,0.12)' },
  dropped: { label: '취소',   color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
}

interface ActionRow {
  id: string
  content: string
  due_date: string | null
  status: string
  done_at: string | null
  done_note: string | null
  created_at: string
  meeting_id: string
  meeting_title: string
  meeting_date: any
  meeting_type: string
  organizer_name: string | null
}

type Toast = { id: number; tone: 'success' | 'error' | 'info'; text: string }
let __toastId = 0

export default function MyTodoPage() {
  const router = useRouter()
  const [rows, setRows] = useState<ActionRow[]>([])
  const [stats, setStats] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open' | 'done' | 'dropped' | 'all'>('open')
  const [search, setSearch] = useState('')

  const [toasts, setToasts] = useState<Toast[]>([])
  const showToast = useCallback((tone: Toast['tone'], text: string) => {
    const id = ++__toastId
    setToasts(t => [...t, { id, tone, text }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('status', filter)
    const { json } = await fetchWithAuth(`/api/meetings/me/actions?${params}`)
    if (json?.data) setRows(json.data)
    if (json?.stats) setStats(json.stats)
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  // 검색 필터 (client-side)
  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter(r =>
      (r.content || '').toLowerCase().includes(q)
      || (r.meeting_title || '').toLowerCase().includes(q)
      || (r.organizer_name || '').toLowerCase().includes(q)
    )
  }, [rows, search])

  const toggleStatus = useCallback(async (action: ActionRow, newStatus: 'open' | 'done' | 'dropped') => {
    const { ok, json } = await fetchWithAuth(`/api/meetings/me/actions`, {
      method: 'PATCH',
      body: { action_id: action.id, status: newStatus },
    })
    if (ok) {
      showToast('success', newStatus === 'done' ? '✓ 완료 처리' : newStatus === 'open' ? '↺ 진행중으로' : '✗ 취소')
      await load()
    } else {
      showToast('error', `실패: ${json?.error || '알 수 없는 오류'}`)
    }
  }, [load, showToast])

  // 통계 카드 5종
  const statItems: StatItem[] = useMemo(() => ([
    { label: '진행중',    value: Number(stats.open_cnt || 0),     icon: '✓', tint: 'blue' },
    { label: '마감 임박', value: Number(stats.due_week_cnt || 0), icon: '⏱', tint: 'amber' },
    { label: '지연',      value: Number(stats.overdue_cnt || 0),  icon: '⚠', tint: 'red' },
    { label: '완료',      value: Number(stats.done_cnt || 0),     icon: '☑', tint: 'green' },
    { label: '전체',      value: Number(stats.total || 0),        icon: '∑', tint: 'slate' },
  ]), [stats])

  // 필터 pills
  const filterItems = useMemo(() => ([
    { key: 'open',    label: '진행중', count: Number(stats.open_cnt || 0) },
    { key: 'done',    label: '완료',   count: Number(stats.done_cnt || 0) },
    { key: 'dropped', label: '취소',   count: Number(stats.dropped_cnt || 0) },
    { key: 'all',     label: '전체',   count: Number(stats.total || 0) },
  ]), [stats])

  // 테이블 컬럼 (Rule 18 — 모두 sortBy)
  const columns: TableColumn<ActionRow>[] = useMemo(() => ([
    {
      key: 'check', label: '✓', width: 36, align: 'center',
      sortBy: (r) => (r.status === 'done' ? 1 : r.status === 'open' ? 0 : 2),
      render: (r) => {
        const done = r.status === 'done'
        const dropped = r.status === 'dropped'
        return (
          <button onClick={(e) => { e.stopPropagation(); toggleStatus(r, done ? 'open' : 'done') }}
            disabled={dropped}
            title={done ? '완료 해제' : '완료'}
            style={{
              width: 22, height: 22, borderRadius: 5, cursor: dropped ? 'default' : 'pointer',
              background: done ? '#15803d' : 'transparent',
              border: `2px solid ${done ? '#15803d' : COLORS.borderSubtle}`,
              color: '#fff', fontSize: 14, fontWeight: 800, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}>
            {done ? '✓' : ''}
          </button>
        )
      },
    },
    {
      key: 'content', label: '할 일',
      sortBy: (r) => r.content || '',
      render: (r) => {
        const done = r.status === 'done'
        return (
          <span style={{
            color: done ? COLORS.textMuted : COLORS.textPrimary,
            textDecoration: done ? 'line-through' : 'none',
            fontWeight: 600,
          }}>{r.content || '(내용 없음)'}</span>
        )
      },
    },
    {
      key: 'meeting', label: '회의', width: 220,
      sortBy: (r) => r.meeting_title || '',
      render: (r) => {
        const tm = TYPE_META[r.meeting_type] || TYPE_META.specific
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            <span style={{ flexShrink: 0 }}>{tm.emoji}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.meeting_title}</span>
          </span>
        )
      },
    },
    {
      key: 'organizer', label: '주관자', width: 110,
      sortBy: (r) => r.organizer_name || '',
      render: (r) => (
        <span style={{ fontSize: 12, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
          {r.organizer_name || '—'}
        </span>
      ),
    },
    {
      key: 'meeting_date', label: '회의일', width: 100,
      sortBy: (r) => r.meeting_date ? new Date(r.meeting_date).getTime() : 0,
      render: (r) => (
        <span style={{ fontSize: 12, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
          {r.meeting_date ? fmtDate(r.meeting_date) : '—'}
        </span>
      ),
    },
    {
      key: 'due_date', label: '마감일', width: 100,
      sortBy: (r) => r.due_date ? new Date(r.due_date).getTime() : Number.MAX_SAFE_INTEGER,
      render: (r) => {
        if (!r.due_date) return <span style={{ color: COLORS.textMuted, fontSize: 11 }}>—</span>
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const due = new Date(r.due_date)
        const diff = Math.floor((due.getTime() - today.getTime()) / 86400000)
        const overdue = r.status === 'open' && diff < 0
        const soon = r.status === 'open' && diff >= 0 && diff <= 3
        const color = overdue ? '#b91c1c' : soon ? '#b45309' : COLORS.textSecondary
        return (
          <span style={{ fontSize: 12, color, fontWeight: overdue || soon ? 700 : 500, whiteSpace: 'nowrap' }}>
            {fmtDate(r.due_date)}
            {overdue && <span style={{ marginLeft: 4, fontSize: 10 }}>⚠ {Math.abs(diff)}일</span>}
            {soon && !overdue && <span style={{ marginLeft: 4, fontSize: 10 }}>(D-{diff})</span>}
          </span>
        )
      },
    },
    {
      key: 'status', label: '상태', width: 80, align: 'center',
      sortBy: (r) => r.status || '',
      render: (r) => {
        const sm = STATUS_META[r.status] || STATUS_META.open
        return (
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 6,
            fontSize: 11, fontWeight: 600, background: sm.bg, color: sm.color, whiteSpace: 'nowrap',
          }}>{sm.label}</span>
        )
      },
    },
    {
      key: 'actions', label: '액션', width: 100, align: 'right',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
          <button onClick={(e) => { e.stopPropagation(); router.push(`/meetings/${r.meeting_id}`) }}
            title="회의록 열기"
            style={{
              padding: '3px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
              background: `${COLORS.primary}1A`, color: COLORS.primary,
              border: `1px solid ${COLORS.primary}40`, cursor: 'pointer',
            }}>회의록</button>
          {r.status !== 'dropped' && (
            <button onClick={(e) => { e.stopPropagation(); toggleStatus(r, 'dropped') }}
              title="취소"
              style={{
                padding: '3px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                background: 'rgba(100,116,139,0.10)', color: '#475569',
                border: '1px solid rgba(100,116,139,0.30)', cursor: 'pointer',
              }}>×</button>
          )}
        </span>
      ),
    },
  ]), [router, toggleStatus])

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh' }}>
      {/* PageTitle 자동 */}

      <DcStatStrip stats={statItems} />

      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="할 일 / 회의 / 주관자 검색"
        filters={filterItems}
        activeFilter={filter}
        onFilterChange={(k) => setFilter(k as any)}
        trailing={
          <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
            💡 ☑ 체크박스 클릭 = 완료 토글 · 회의록 버튼 = 해당 회의로 이동
          </span>
        }
      />

      <NeuDataTable<ActionRow>
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/meetings/${r.meeting_id}`)}
        loading={loading}
        emptyIcon="✓"
        emptyMessage={filter === 'open' ? '진행중 액션 없음 — 모두 완료!' : '데이터 없음'}
        defaultSort={{ key: 'due_date', dir: 'asc' }}
        mobileCard={{
          title: (r) => r.content || '(내용 없음)',
          subtitle: (r) => `${TYPE_META[r.meeting_type]?.emoji || '📋'} ${r.meeting_title}`,
          trailing: (r) => {
            const sm = STATUS_META[r.status] || STATUS_META.open
            return (
              <span style={{
                padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                background: sm.bg, color: sm.color, whiteSpace: 'nowrap',
              }}>{sm.label}</span>
            )
          },
          badges: (r) => (
            <>
              {r.due_date && (
                <span style={{ fontSize: 11, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
                  ⏱ {fmtDate(r.due_date)}
                </span>
              )}
              {r.organizer_name && (
                <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
                  👤 {r.organizer_name}
                </span>
              )}
            </>
          ),
        }}
      />

      {/* 토스트 */}
      <div style={{
        position: 'fixed', right: 20, bottom: 20, zIndex: 1100,
        display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
      }}>
        {toasts.map(t => {
          const tone = t.tone === 'success'
            ? { bg: 'rgba(34,197,94,0.92)',  border: 'rgba(34,197,94,0.5)' }
            : t.tone === 'error'
              ? { bg: 'rgba(239,68,68,0.92)', border: 'rgba(239,68,68,0.5)' }
              : { bg: 'rgba(59,130,246,0.92)', border: 'rgba(59,130,246,0.5)' }
          return (
            <div key={t.id} style={{
              ...GLASS.L4,
              background: tone.bg, border: `1px solid ${tone.border}`,
              borderRadius: 12, padding: '10px 16px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              color: '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            }}>{t.text}</div>
          )
        })}
      </div>
    </div>
  )
}
