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
// 회의록 목록 페이지 — /meetings
// PR-MTG-1 (2026-05-13) — 디자인 표준 리뉴얼:
//   · PageTitle 자동 / DcStatStrip 5 카드 / DcToolbar / NeuDataTable + sortBy
//   · 권한 UI conditional / 글래스 토스트
// PR-MTG-V2-A (2026-05-13) — V2 풀페이지 통합:
//   · 모달 제거 — 「+ 회의 등록」 → router.push('/meetings/new')
//   · 행 클릭 / 「열기」 → router.push(`/meetings/${id}`)
//   · 본문은 V2 라우트 (TipTap) 에서 편집, 목록은 메타/통계만
// ═══════════════════════════════════════════════════════════════

const TYPE_META: Record<string, { label: string; emoji: string; color: string }> = {
  regular:    { label: '정기',    emoji: '📅', color: '#3b82f6' },
  specific:   { label: '특정',    emoji: '📋', color: '#64748b' },
  one_on_one: { label: '1:1 면담', emoji: '👥', color: '#10b981' },
  department: { label: '부서별',  emoji: '🏢', color: '#f59e0b' },
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: '✏️ 작성중', color: '#b91c1c', bg: 'rgba(239,68,68,0.12)' },
  published: { label: '✓ 공개',   color: '#15803d', bg: 'rgba(34,197,94,0.12)' },
  archived:  { label: '📦 보관',  color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
}

interface Meeting {
  id: string; title: string; type: string;
  meeting_date: any; duration_min: number | null; location: string | null;
  organizer_id: string | null; organizer_name: string | null;
  department: string | null; status: string;
  created_by: string | null;
  attendee_count: number; action_count: number; open_action_count: number;
  created_at: string;
}

interface CurrentUser { id: string; role?: string; [k: string]: any }

function canEditMeeting(m: Meeting, u: CurrentUser | null): boolean {
  if (!u) return false
  if (u.role === 'admin' || u.role === 'master') return true
  if (m.organizer_id === u.id) return true
  if (m.created_by === u.id) return true
  return false
}

type Toast = { id: number; tone: 'success' | 'error' | 'info'; text: string }
let __toastId = 0

export default function MeetingsPage() {
  const router = useRouter()

  const [list, setList] = useState<Meeting[]>([])
  const [stats, setStats] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [filter, setFilter] = useState<'all' | 'regular' | 'specific' | 'one_on_one' | 'department'>('all')
  const [search, setSearch] = useState('')
  const [showMine, setShowMine] = useState(false)
  const [groupBy, setGroupBy] = useState<'none' | 'department' | 'organizer'>('none')

  const [toasts, setToasts] = useState<Toast[]>([])
  const showToast = useCallback((tone: Toast['tone'], text: string) => {
    const id = ++__toastId
    setToasts(t => [...t, { id, tone, text }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('fmi_user') : null
      if (raw) setUser(JSON.parse(raw))
    } catch {}
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('type', filter)
    if (search) params.set('search', search)
    if (showMine) params.set('mine', 'true')
    const { json } = await fetchWithAuth(`/api/meetings?${params}`)
    if (json?.data) setList(json.data)
    if (json?.stats) setStats(json.stats)
    setLoading(false)
  }, [filter, search, showMine])

  useEffect(() => { loadList() }, [loadList])

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: '', label: '', items: list }]
    const map = new Map<string, Meeting[]>()
    for (const m of list) {
      const key = groupBy === 'department'
        ? (m.department || '미분류')
        : (m.organizer_name || '미배정')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, label: key, items }))
  }, [list, groupBy])

  const openNew = useCallback(() => router.push('/meetings/new'), [router])
  const openDetail = useCallback((id: string) => router.push(`/meetings/${id}`), [router])

  const remove = useCallback(async (m: Meeting) => {
    if (!confirm(`「${m.title}」 회의를 삭제할까요?`)) return
    const { ok, json } = await fetchWithAuth(`/api/meetings?id=${m.id}`, { method: 'DELETE' })
    if (ok) {
      showToast('success', `✓ 「${m.title}」 삭제됨`)
      await loadList()
    } else {
      showToast('error', `삭제 실패: ${json?.error || '알 수 없는 오류'}`)
    }
  }, [loadList, showToast])

  const statItems: StatItem[] = useMemo(() => ([
    { label: '정기',    value: Number(stats.regular_count || 0),    icon: '📅', tint: 'blue' },
    { label: '특정',    value: Number(stats.specific_count || 0),   icon: '📋', tint: 'slate' },
    { label: '1:1 면담', value: Number(stats.one_on_one_count || 0), icon: '👥', tint: 'green' },
    { label: '부서별',  value: Number(stats.department_count || 0), icon: '🏢', tint: 'amber' },
    { label: '작성중',  value: Number(stats.draft_count || 0),       icon: '✏️', tint: 'red' },
  ]), [stats])

  const filterItems = useMemo(() => ([
    { key: 'all',        label: '전체',     count: Number(stats.total || 0) },
    { key: 'regular',    label: '📅 정기',   count: Number(stats.regular_count || 0) },
    { key: 'specific',   label: '📋 특정',   count: Number(stats.specific_count || 0) },
    { key: 'one_on_one', label: '👥 1:1',    count: Number(stats.one_on_one_count || 0) },
    { key: 'department', label: '🏢 부서별', count: Number(stats.department_count || 0) },
  ]), [stats])

  const columns: TableColumn<Meeting>[] = useMemo(() => ([
    {
      key: 'date', label: '일시', width: 130,
      sortBy: (r) => r.meeting_date ? new Date(r.meeting_date).getTime() : 0,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
          {r.meeting_date ? fmtDate(r.meeting_date) : '—'}
          {r.duration_min && <span style={{ color: COLORS.textMuted, marginLeft: 4 }}>· {r.duration_min}분</span>}
        </span>
      ),
    },
    {
      key: 'type', label: '유형', width: 80, align: 'center',
      sortBy: (r) => TYPE_META[r.type]?.label || r.type,
      render: (r) => {
        const tm = TYPE_META[r.type] || TYPE_META.specific
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: `${tm.color}1A`, color: tm.color, whiteSpace: 'nowrap',
          }}>{tm.emoji} {tm.label}</span>
        )
      },
    },
    {
      key: 'title', label: '제목',
      sortBy: (r) => r.title || '',
      render: (r) => (
        <span style={{ fontWeight: 600, color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: '100%' }}>
          {r.title}
          {r.location && <span style={{ color: COLORS.textMuted, fontWeight: 400, marginLeft: 6, fontSize: 11 }}>📍 {r.location}</span>}
        </span>
      ),
    },
    {
      key: 'organizer', label: '주관자 / 부서', width: 140,
      sortBy: (r) => `${r.organizer_name || ''} ${r.department || ''}`,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
          {r.organizer_name || <span style={{ color: COLORS.textMuted }}>미정</span>}
          {r.department && <span style={{ color: COLORS.textMuted, marginLeft: 4 }}>· {r.department}</span>}
        </span>
      ),
    },
    {
      key: 'attendees', label: '참석', width: 60, align: 'center',
      sortBy: (r) => Number(r.attendee_count || 0),
      render: (r) => (
        <span style={{ fontSize: 12, color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>
          👥 {Number(r.attendee_count || 0)}
        </span>
      ),
    },
    {
      key: 'actions_progress', label: '액션 진행', width: 100, align: 'center',
      sortBy: (r) => {
        const total = Number(r.action_count || 0)
        if (total === 0) return -1
        return (total - Number(r.open_action_count || 0)) / total
      },
      render: (r) => {
        const total = Number(r.action_count || 0)
        if (total === 0) return <span style={{ color: COLORS.textMuted, fontSize: 11 }}>—</span>
        const done = total - Number(r.open_action_count || 0)
        const pct = Math.round((done / total) * 100)
        const tone = pct === 100 ? '#15803d' : pct >= 50 ? '#1d4ed8' : '#b45309'
        return (
          <span style={{ fontSize: 12, fontWeight: 600, color: tone, whiteSpace: 'nowrap' }}>
            ✓ {done}/{total} <span style={{ fontSize: 10, opacity: 0.7 }}>({pct}%)</span>
          </span>
        )
      },
    },
    {
      key: 'status', label: '상태', width: 80, align: 'center',
      sortBy: (r) => r.status || '',
      render: (r) => {
        const sm = STATUS_META[r.status] || STATUS_META.draft
        return (
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 6,
            fontSize: 11, fontWeight: 600, background: sm.bg, color: sm.color, whiteSpace: 'nowrap',
          }}>{sm.label}</span>
        )
      },
    },
    {
      key: 'rowActions', label: '액션', width: 110, align: 'right',
      render: (r) => {
        const editable = canEditMeeting(r, user)
        return (
          <span style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
            <button onClick={(e) => { e.stopPropagation(); openDetail(r.id) }}
              style={{
                padding: '3px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                background: 'rgba(59,130,246,0.10)', color: '#1d4ed8',
                border: '1px solid rgba(59,130,246,0.35)', cursor: 'pointer',
              }}>열기</button>
            {editable && (
              <button onClick={(e) => { e.stopPropagation(); remove(r) }}
                style={{
                  padding: '3px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                  background: 'rgba(239,68,68,0.10)', color: '#b91c1c',
                  border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer',
                }}>×</button>
            )}
          </span>
        )
      },
    },
  ]), [user, openDetail, remove])

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh' }}>
      {/* PageTitle 자동 */}

      {/* DcStatStrip 5 카드 + 액션 */}
      <DcStatStrip
        stats={statItems}
        actions={[
          { label: '+ 회의 등록', onClick: openNew, variant: 'primary', icon: '🗓' },
        ]}
      />

      {/* DcToolbar */}
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="제목/안건/요약 검색"
        filters={filterItems}
        activeFilter={filter}
        onFilterChange={(k) => setFilter(k as any)}
        trailing={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}
              style={{
                padding: '6px 10px', fontSize: 12, borderRadius: 8,
                border: `1px solid ${COLORS.borderSubtle}`, background: GLASS.L1.background,
                color: COLORS.textPrimary, fontFamily: 'inherit', cursor: 'pointer',
              }}>
              <option value="none">그룹: 없음</option>
              <option value="department">그룹: 부서별</option>
              <option value="organizer">그룹: 주관자별</option>
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: COLORS.textSecondary, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={showMine} onChange={(e) => setShowMine(e.target.checked)} />
              내 회의만
            </label>
          </div>
        }
      />

      {/* 데이터 영역 */}
      {grouped.map(g => (
        <div key={g.key} style={{ marginBottom: g.label ? 20 : 0 }}>
          {g.label && (
            <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, margin: '12px 4px 8px' }}>
              {groupBy === 'department' ? '🏢' : '👤'} {g.label}
              <span style={{ color: COLORS.textMuted, fontWeight: 500, marginLeft: 6 }}>({g.items.length})</span>
            </h3>
          )}
          <NeuDataTable<Meeting>
            columns={columns}
            data={g.items}
            rowKey={(r) => r.id}
            onRowClick={(r) => openDetail(r.id)}
            loading={loading}
            emptyIcon="🗓"
            emptyMessage="등록된 회의록이 없습니다 — 「+ 회의 등록」 버튼으로 시작하세요"
            defaultSort={{ key: 'date', dir: 'desc' }}
            mobileCard={{
              title: (r) => `${TYPE_META[r.type]?.emoji || '📋'} ${r.title}`,
              subtitle: (r) => `${fmtDate(r.meeting_date)} · ${r.organizer_name || '주관자 미정'}`,
              trailing: (r) => {
                const sm = STATUS_META[r.status] || STATUS_META.draft
                return (
                  <span style={{
                    padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                    background: sm.bg, color: sm.color, whiteSpace: 'nowrap',
                  }}>{sm.label}</span>
                )
              },
              badges: (r) => {
                const total = Number(r.action_count || 0)
                const done = total - Number(r.open_action_count || 0)
                return (
                  <>
                    <span style={{ fontSize: 11, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>👥 {r.attendee_count || 0}</span>
                    {total > 0 && <span style={{ fontSize: 11, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>✓ {done}/{total}</span>}
                    {r.department && <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>🏢 {r.department}</span>}
                  </>
                )
              },
            }}
          />
        </div>
      ))}

      {/* 글래스 토스트 */}
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
              background: tone.bg,
              border: `1px solid ${tone.border}`,
              borderRadius: 12, padding: '10px 16px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{t.text}</div>
          )
        })}
      </div>
    </div>
  )
}
