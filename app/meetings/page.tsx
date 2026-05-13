'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'
import { fmtDate } from '@/lib/format'
import DcStatStrip, { StatItem } from '@/app/components/DcStatStrip'
import DcToolbar from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn } from '@/app/components/NeuDataTable'

// ═══════════════════════════════════════════════════════════════
// 회의록 메인 페이지 (목록 + 등록 모달 + 상세 패널)
// /meetings
// PR-MTG-1 (2026-05-13) — 디자인 표준 리뉴얼:
//   · PageTitle 자동 (자체 헤더 제거)
//   · DcStatStrip 5 카드 (정기/특정/1:1/부서별/작성중)
//   · DcToolbar (검색 + 필터 + trailing)
//   · NeuDataTable + sortBy (8 컬럼 모두 정렬, Rule 18)
//   · 권한 UI conditional (편집/삭제 버튼 — admin/master/organizer/created_by)
//   · 결과 메시지 글래스 토스트 (alert 최소화, Rule 20)
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
  created_by: string | null;            // PR-MTG-1 — 권한 UI 위해 추가
  attendee_count: number; action_count: number; open_action_count: number;
  created_at: string;
}

interface CurrentUser {
  id: string
  role?: string
  [k: string]: any
}

// 권한 헬퍼 — 편집/삭제 버튼 노출 결정 (API canEdit/canDelete 와 동일 조건)
function canEditMeeting(m: Meeting, u: CurrentUser | null): boolean {
  if (!u) return false
  if (u.role === 'admin' || u.role === 'master') return true
  if (m.organizer_id === u.id) return true
  if (m.created_by === u.id) return true
  return false
}

// 토스트 — 글래스 결과 메시지 (Rule 20)
type Toast = { id: number; tone: 'success' | 'error' | 'info'; text: string }
let __toastId = 0

export default function MeetingsPage() {
  const [list, setList] = useState<Meeting[]>([])
  const [stats, setStats] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<any[]>([])
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [filter, setFilter] = useState<'all' | 'regular' | 'specific' | 'one_on_one' | 'department'>('all')
  const [search, setSearch] = useState('')
  const [showMine, setShowMine] = useState(false)
  const [groupBy, setGroupBy] = useState<'none' | 'department' | 'organizer'>('none')

  const [showEditor, setShowEditor] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [toasts, setToasts] = useState<Toast[]>([])
  const showToast = useCallback((tone: Toast['tone'], text: string) => {
    const id = ++__toastId
    setToasts(t => [...t, { id, tone, text }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  // 현재 사용자 — localStorage (fmi_user)
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

  const loadEmployees = useCallback(async () => {
    const { json } = await fetchWithAuth('/api/finance-upload?table=profiles')
    if (json?.data) setEmployees(json.data.filter((p: any) => p.is_active !== false))
  }, [])

  useEffect(() => { loadList() }, [loadList])
  useEffect(() => { loadEmployees() }, [loadEmployees])

  // 그룹화
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

  const openNew = () => { setEditingId(null); setShowEditor(true) }
  const openEdit = (id: string) => { setEditingId(id); setShowEditor(true) }

  const remove = async (m: Meeting) => {
    if (!confirm(`「${m.title}」 회의를 삭제할까요?`)) return
    const { ok, json } = await fetchWithAuth(`/api/meetings?id=${m.id}`, { method: 'DELETE' })
    if (ok) {
      showToast('success', `✓ 「${m.title}」 삭제됨`)
      await loadList()
    } else {
      showToast('error', `삭제 실패: ${json?.error || '알 수 없는 오류'}`)
    }
  }

  // 통계 — DcStatStrip 5 카드 (정기 / 특정 / 1:1 / 부서별 / 작성중)
  const statItems: StatItem[] = useMemo(() => ([
    { label: '정기',    value: Number(stats.regular_count || 0),    icon: '📅', tint: 'blue' },
    { label: '특정',    value: Number(stats.specific_count || 0),   icon: '📋', tint: 'slate' },
    { label: '1:1 면담', value: Number(stats.one_on_one_count || 0), icon: '👥', tint: 'green' },
    { label: '부서별',  value: Number(stats.department_count || 0), icon: '🏢', tint: 'amber' },
    { label: '작성중',  value: Number(stats.draft_count || 0),       icon: '✏️', tint: 'red' },
  ]), [stats])

  // 필터 pills — DcToolbar
  const filterItems = useMemo(() => ([
    { key: 'all',        label: '전체',     count: Number(stats.total || 0) },
    { key: 'regular',    label: '📅 정기',   count: Number(stats.regular_count || 0) },
    { key: 'specific',   label: '📋 특정',   count: Number(stats.specific_count || 0) },
    { key: 'one_on_one', label: '👥 1:1',    count: Number(stats.one_on_one_count || 0) },
    { key: 'department', label: '🏢 부서별', count: Number(stats.department_count || 0) },
  ]), [stats])

  // 테이블 컬럼 — Rule 18 모든 컬럼 sortBy 의무
  const columns: TableColumn<Meeting>[] = useMemo(() => ([
    {
      key: 'date',
      label: '일시',
      width: 130,
      sortBy: (r) => r.meeting_date ? new Date(r.meeting_date).getTime() : 0,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
          {r.meeting_date ? fmtDate(r.meeting_date) : '—'}
          {r.duration_min && (
            <span style={{ color: COLORS.textMuted, marginLeft: 4 }}>· {r.duration_min}분</span>
          )}
        </span>
      ),
    },
    {
      key: 'type',
      label: '유형',
      width: 80,
      align: 'center',
      sortBy: (r) => TYPE_META[r.type]?.label || r.type,
      render: (r) => {
        const tm = TYPE_META[r.type] || TYPE_META.specific
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: `${tm.color}1A`, color: tm.color, whiteSpace: 'nowrap',
          }}>
            {tm.emoji} {tm.label}
          </span>
        )
      },
    },
    {
      key: 'title',
      label: '제목',
      sortBy: (r) => r.title || '',
      render: (r) => (
        <span style={{ fontWeight: 600, color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: '100%' }}>
          {r.title}
          {r.location && (
            <span style={{ color: COLORS.textMuted, fontWeight: 400, marginLeft: 6, fontSize: 11 }}>📍 {r.location}</span>
          )}
        </span>
      ),
    },
    {
      key: 'organizer',
      label: '주관자 / 부서',
      width: 140,
      sortBy: (r) => `${r.organizer_name || ''} ${r.department || ''}`,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
          {r.organizer_name || <span style={{ color: COLORS.textMuted }}>미정</span>}
          {r.department && (
            <span style={{ color: COLORS.textMuted, marginLeft: 4 }}>· {r.department}</span>
          )}
        </span>
      ),
    },
    {
      key: 'attendees',
      label: '참석',
      width: 60,
      align: 'center',
      sortBy: (r) => Number(r.attendee_count || 0),
      render: (r) => (
        <span style={{ fontSize: 12, color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>
          👥 {Number(r.attendee_count || 0)}
        </span>
      ),
    },
    {
      key: 'actions_progress',
      label: '액션 진행',
      width: 100,
      align: 'center',
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
      key: 'status',
      label: '상태',
      width: 80,
      align: 'center',
      sortBy: (r) => r.status || '',
      render: (r) => {
        const sm = STATUS_META[r.status] || STATUS_META.draft
        return (
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 6,
            fontSize: 11, fontWeight: 600, background: sm.bg, color: sm.color, whiteSpace: 'nowrap',
          }}>
            {sm.label}
          </span>
        )
      },
    },
    {
      key: 'rowActions',
      label: '액션',
      width: 100,
      align: 'right',
      // sortBy 미정의 — 액션 컬럼 (Rule 18 화이트리스트)
      render: (r) => {
        const editable = canEditMeeting(r, user)
        if (!editable) {
          return <span style={{ color: COLORS.textMuted, fontSize: 11 }}>—</span>
        }
        return (
          <span style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
            <button onClick={(e) => { e.stopPropagation(); openEdit(r.id) }}
              style={{
                padding: '3px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                background: 'rgba(59,130,246,0.1)', color: '#1d4ed8',
                border: '1px solid rgba(59,130,246,0.35)', cursor: 'pointer',
              }}>편집</button>
            <button onClick={(e) => { e.stopPropagation(); remove(r) }}
              style={{
                padding: '3px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                background: 'rgba(239,68,68,0.1)', color: '#b91c1c',
                border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer',
              }}>삭제</button>
          </span>
        )
      },
    },
  ]), [user])

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh' }}>
      {/* PageTitle 자동 표시 (ClientLayout) — 자체 헤더 제거 */}

      {/* DcStatStrip — 5 카드 + 액션 [+ 회의 등록] */}
      <DcStatStrip
        stats={statItems}
        actions={[
          { label: '+ 회의 등록', onClick: openNew, variant: 'primary', icon: '🗓' },
        ]}
      />

      {/* DcToolbar — 검색 + 필터 + trailing(그룹/내회의) */}
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

      {/* 데이터 영역 — NeuDataTable 그룹별 */}
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
            onRowClick={(r) => openEdit(r.id)}
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
                    <span style={{ fontSize: 11, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
                      👥 {r.attendee_count || 0}
                    </span>
                    {total > 0 && (
                      <span style={{ fontSize: 11, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
                        ✓ {done}/{total}
                      </span>
                    )}
                    {r.department && (
                      <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
                        🏢 {r.department}
                      </span>
                    )}
                  </>
                )
              },
            }}
          />
        </div>
      ))}

      {/* 토스트 — 글래스 결과 메시지 (Rule 20) */}
      <div style={{
        position: 'fixed', right: 20, bottom: 20, zIndex: 1100,
        display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
      }}>
        {toasts.map(t => {
          const tone = t.tone === 'success'
            ? { bg: 'rgba(34,197,94,0.92)',  border: 'rgba(34,197,94,0.5)',  color: '#fff' }
            : t.tone === 'error'
              ? { bg: 'rgba(239,68,68,0.92)', border: 'rgba(239,68,68,0.5)', color: '#fff' }
              : { bg: 'rgba(59,130,246,0.92)', border: 'rgba(59,130,246,0.5)', color: '#fff' }
          return (
            <div key={t.id} style={{
              ...GLASS.L4,
              background: tone.bg,
              border: `1px solid ${tone.border}`,
              borderRadius: 12, padding: '10px 16px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              color: tone.color, fontSize: 13, fontWeight: 600,
              maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {t.text}
            </div>
          )
        })}
      </div>

      {/* 등록/편집 모달 */}
      {showEditor && (
        <MeetingEditor
          meetingId={editingId}
          employees={employees}
          onClose={() => { setShowEditor(false); setEditingId(null) }}
          onSaved={() => { setShowEditor(false); setEditingId(null); loadList(); showToast('success', editingId ? '✓ 회의록 저장됨' : '✓ 새 회의 등록됨') }}
          onError={(msg) => showToast('error', `저장 실패: ${msg}`)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 회의 등록/편집 모달 (회의록 본문 + 참석자 + 액션 아이템)
// ═══════════════════════════════════════════════════════════════
function MeetingEditor({ meetingId, employees, onClose, onSaved, onError }: {
  meetingId: string | null
  employees: any[]
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [meeting, setMeeting] = useState<any>({
    title: '',
    type: 'specific',
    meeting_date: new Date().toISOString().slice(0, 16),
    duration_min: 60,
    location: '',
    organizer_id: null,
    department: '',
    status: 'draft',
    agenda: '',
    summary: '',
  })
  const [attendees, setAttendees] = useState<any[]>([])
  const [minutes, setMinutes] = useState<any[]>([])
  const [actionItems, setActionItems] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [titleError, setTitleError] = useState<string | null>(null)

  // 부서 목록 (employees에서 추출)
  const departments = useMemo(() => {
    const set = new Set<string>()
    employees.forEach((e: any) => e.department && set.add(e.department))
    return Array.from(set).sort()
  }, [employees])

  // 수정 모드 — 데이터 로드
  useEffect(() => {
    if (!meetingId) return
    fetchWithAuth(`/api/meetings?id=${meetingId}`).then(({ json }) => {
      if (!json?.data) return
      const m = json.data.meeting
      setMeeting({
        title: m.title || '',
        type: m.type || 'specific',
        meeting_date: m.meeting_date ? String(m.meeting_date).slice(0, 16) : '',
        duration_min: m.duration_min || 60,
        location: m.location || '',
        organizer_id: m.organizer_id || null,
        department: m.department || '',
        status: m.status || 'draft',
        agenda: m.agenda || '',
        summary: m.summary || '',
      })
      setAttendees(json.data.attendees || [])
      setMinutes(json.data.minutes || [])
      setActionItems(json.data.action_items || [])
    })
  }, [meetingId])

  // 부서 회의 — 부서원 자동 선택
  const autoFillDepartment = () => {
    if (!meeting.department) return
    const deptMembers = employees.filter((e: any) => e.department === meeting.department)
    setAttendees(deptMembers.map((e: any) => ({
      profile_id: e.id, profile_name: e.name, role: 'attendee', attendance: 'present',
    })))
  }

  const addAttendee = (profileId: string) => {
    if (attendees.find((a: any) => a.profile_id === profileId)) return
    const emp = employees.find((e: any) => e.id === profileId)
    setAttendees([...attendees, {
      profile_id: profileId, profile_name: emp?.name, role: 'attendee', attendance: 'present',
    }])
  }
  const removeAttendee = (i: number) => setAttendees(attendees.filter((_, idx) => idx !== i))
  const updateAttendee = (i: number, patch: any) => setAttendees(attendees.map((a, idx) => idx === i ? { ...a, ...patch } : a))

  const addMinute = (section_type: string) => {
    setMinutes([...minutes, { section_type, order_no: minutes.length + 1, title: '', content: '' }])
  }
  const removeMinute = (i: number) => setMinutes(minutes.filter((_, idx) => idx !== i))
  const updateMinute = (i: number, patch: any) => setMinutes(minutes.map((m, idx) => idx === i ? { ...m, ...patch } : m))

  const addAction = () => setActionItems([...actionItems, { content: '', assignee_id: null, due_date: '', status: 'open' }])
  const removeAction = (i: number) => setActionItems(actionItems.filter((_, idx) => idx !== i))
  const updateAction = (i: number, patch: any) => setActionItems(actionItems.map((a, idx) => idx === i ? { ...a, ...patch } : a))

  const save = async () => {
    if (!meeting.title) {
      setTitleError('제목을 입력하세요')
      return
    }
    setTitleError(null)
    setSaving(true)
    try {
      const body = { meeting, attendees, minutes, action_items: actionItems }
      const url = meetingId ? `/api/meetings?id=${meetingId}` : '/api/meetings'
      const method = meetingId ? 'PATCH' : 'POST'
      const { ok, json } = await fetchWithAuth(url, { method, body })
      if (ok) onSaved()
      else onError(json?.error || '알 수 없는 오류')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...GLASS.L4, borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
        width: '100%', maxWidth: 1000, maxHeight: '92vh', overflow: 'auto', padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {meetingId ? '🗓 회의 편집' : '🗓 새 회의 등록'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLORS.textMuted }}>×</button>
        </div>

        {/* 제목 에러 — 글래스 패널 (Rule 20) */}
        {titleError && (
          <div style={{
            ...GLASS.L3, border: '1px solid rgba(239,68,68,0.4)', borderRadius: 10,
            padding: '8px 12px', marginBottom: 12, color: '#b91c1c', fontSize: 12, fontWeight: 600,
          }}>
            ⚠️ {titleError}
          </div>
        )}

        {/* 기본 정보 */}
        <div style={{ ...GLASS.L3, padding: 14, borderRadius: 10, marginBottom: 14 }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 10 }}>기본 정보</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="제목 *">
              <input value={meeting.title} onChange={(e) => setMeeting({ ...meeting, title: e.target.value })}
                style={inputStyle} placeholder="예: 2026년 4월 정기회의" />
            </Field>
            <Field label="유형">
              <select value={meeting.type} onChange={(e) => setMeeting({ ...meeting, type: e.target.value })} style={inputStyle}>
                <option value="regular">📅 정기 회의</option>
                <option value="specific">📋 특정 회의</option>
                <option value="one_on_one">👥 1:1 면담</option>
                <option value="department">🏢 부서별 회의</option>
              </select>
            </Field>
            <Field label="회의 일시">
              <input type="datetime-local" value={meeting.meeting_date}
                onChange={(e) => setMeeting({ ...meeting, meeting_date: e.target.value })}
                style={inputStyle} />
            </Field>
            <Field label="진행 시간 (분)">
              <input type="number" value={meeting.duration_min || ''}
                onChange={(e) => setMeeting({ ...meeting, duration_min: Number(e.target.value) || null })}
                style={inputStyle} />
            </Field>
            <Field label="주관자">
              <select value={meeting.organizer_id || ''}
                onChange={(e) => setMeeting({ ...meeting, organizer_id: e.target.value || null })}
                style={inputStyle}>
                <option value="">미선택</option>
                {employees.map((e: any) => (
                  <option key={e.id} value={e.id}>{e.name} {e.department ? `(${e.department})` : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="부서 (부서별 회의 시)">
              <div style={{ display: 'flex', gap: 4 }}>
                <select value={meeting.department || ''}
                  onChange={(e) => setMeeting({ ...meeting, department: e.target.value })}
                  style={{ ...inputStyle, flex: 1 }}>
                  <option value="">미지정</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                {meeting.type === 'department' && meeting.department && (
                  <button onClick={autoFillDepartment}
                    style={{ padding: '4px 10px', fontSize: 10, borderRadius: 6, background: 'rgba(245,158,11,0.1)', color: '#b45309', border: '1px solid rgba(245,158,11,0.35)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    부서원 자동
                  </button>
                )}
              </div>
            </Field>
            <Field label="장소">
              <input value={meeting.location || ''} onChange={(e) => setMeeting({ ...meeting, location: e.target.value })}
                style={inputStyle} placeholder="예: 본사 회의실 / 화상" />
            </Field>
            <Field label="상태">
              <select value={meeting.status} onChange={(e) => setMeeting({ ...meeting, status: e.target.value })} style={inputStyle}>
                <option value="draft">✏️ 작성중</option>
                <option value="published">✓ 공개</option>
                <option value="archived">📦 보관</option>
              </select>
            </Field>
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="안건 (Agenda)">
              <textarea value={meeting.agenda || ''} onChange={(e) => setMeeting({ ...meeting, agenda: e.target.value })}
                rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="• 1번 안건&#10;• 2번 안건..." />
            </Field>
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="요약 (Summary)">
              <textarea value={meeting.summary || ''} onChange={(e) => setMeeting({ ...meeting, summary: e.target.value })}
                rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="회의 핵심 결과 요약" />
            </Field>
          </div>
        </div>

        {/* 참석자 */}
        <div style={{ ...GLASS.L3, padding: 14, borderRadius: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, margin: 0, whiteSpace: 'nowrap' }}>👥 참석자 ({attendees.length})</h3>
            <select onChange={(e) => { if (e.target.value) { addAttendee(e.target.value); e.target.value = '' } }}
              style={{ ...inputStyle, width: 240, padding: '4px 8px' }}>
              <option value="">+ 직원 추가</option>
              {employees.filter((e: any) => !attendees.find((a: any) => a.profile_id === e.id)).map((e: any) => (
                <option key={e.id} value={e.id}>{e.name} {e.department ? `(${e.department})` : ''}</option>
              ))}
            </select>
          </div>
          {attendees.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
              참석자 미등록 — 위에서 직원 선택
            </div>
          )}
          {attendees.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, fontSize: 12 }}>
              <span style={{ flex: 1, color: COLORS.textPrimary, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {a.profile_name || a.external_name || '(이름 없음)'}
                {a.profile_department && (
                  <span style={{ fontWeight: 400, color: COLORS.textMuted, marginLeft: 6 }}>({a.profile_department})</span>
                )}
              </span>
              <select value={a.role || 'attendee'} onChange={(e) => updateAttendee(i, { role: e.target.value })}
                style={{ ...inputStyle, width: 100, padding: '3px 6px' }}>
                <option value="organizer">주관</option>
                <option value="attendee">참석</option>
                <option value="observer">참관</option>
              </select>
              <select value={a.attendance || 'present'} onChange={(e) => updateAttendee(i, { attendance: e.target.value })}
                style={{ ...inputStyle, width: 100, padding: '3px 6px' }}>
                <option value="present">출석</option>
                <option value="absent">불참</option>
                <option value="excused">결석</option>
              </select>
              <button onClick={() => removeAttendee(i)} style={{
                padding: '3px 8px', fontSize: 11, background: 'rgba(239,68,68,0.1)',
                color: '#b91c1c', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 4, cursor: 'pointer',
              }}>×</button>
            </div>
          ))}
        </div>

        {/* 회의록 본문 */}
        <div style={{ ...GLASS.L3, padding: 14, borderRadius: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, margin: 0, whiteSpace: 'nowrap' }}>📝 회의록 본문 ({minutes.length})</h3>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { k: 'agenda',     label: '+ 안건',   color: '#3b82f6' },
                { k: 'decision',   label: '+ 결정',   color: '#10b981' },
                { k: 'note',       label: '+ 메모',   color: '#64748b' },
                { k: 'attachment', label: '+ 첨부',   color: '#f59e0b' },
              ].map(b => (
                <button key={b.k} onClick={() => addMinute(b.k)}
                  style={{
                    padding: '4px 10px', fontSize: 10, fontWeight: 600,
                    borderRadius: 6, cursor: 'pointer',
                    background: `${b.color}1A`, color: b.color, border: `1px solid ${b.color}55`, whiteSpace: 'nowrap',
                  }}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          {minutes.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
              섹션 추가 — 안건/결정/메모/첨부
            </div>
          )}
          {minutes.map((m, i) => (
            <div key={i} style={{ marginBottom: 8, padding: 8, ...GLASS.L4, borderRadius: 8 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                <span style={{
                  display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                  background: 'rgba(59,130,246,0.12)', color: '#1d4ed8', whiteSpace: 'nowrap',
                }}>
                  {m.section_type === 'agenda' ? '안건' : m.section_type === 'decision' ? '결정' : m.section_type === 'attachment' ? '첨부' : '메모'}
                </span>
                <input value={m.title || ''} onChange={(e) => updateMinute(i, { title: e.target.value })}
                  style={{ ...inputStyle, flex: 1, padding: '4px 8px' }} placeholder="제목" />
                <button onClick={() => removeMinute(i)} style={{
                  padding: '3px 8px', fontSize: 11, background: 'rgba(239,68,68,0.1)',
                  color: '#b91c1c', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 4, cursor: 'pointer',
                }}>×</button>
              </div>
              <textarea value={m.content || ''} onChange={(e) => updateMinute(i, { content: e.target.value })}
                rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="내용" />
            </div>
          ))}
        </div>

        {/* 액션 아이템 */}
        <div style={{ ...GLASS.L3, padding: 14, borderRadius: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, margin: 0, whiteSpace: 'nowrap' }}>✓ 액션 아이템 (TODO) — {actionItems.length}건</h3>
            <button onClick={addAction}
              style={{
                padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                background: 'rgba(34,197,94,0.1)', color: '#15803d', border: '1px solid rgba(34,197,94,0.35)', whiteSpace: 'nowrap',
              }}>+ 추가</button>
          </div>
          {actionItems.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
              회의 결과 후속 액션을 추가하세요
            </div>
          )}
          {actionItems.map((ai, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto auto', gap: 6, marginBottom: 4, alignItems: 'center', fontSize: 12 }}>
              <input value={ai.content || ''} onChange={(e) => updateAction(i, { content: e.target.value })}
                style={{ ...inputStyle, padding: '4px 8px' }} placeholder="할 일 내용" />
              <select value={ai.assignee_id || ''} onChange={(e) => updateAction(i, { assignee_id: e.target.value || null })}
                style={{ ...inputStyle, padding: '4px 8px' }}>
                <option value="">담당자</option>
                {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <input type="date" value={ai.due_date || ''} onChange={(e) => updateAction(i, { due_date: e.target.value })}
                style={{ ...inputStyle, padding: '4px 8px' }} />
              <select value={ai.status || 'open'} onChange={(e) => updateAction(i, { status: e.target.value })}
                style={{ ...inputStyle, padding: '4px 6px', width: 80 }}>
                <option value="open">진행중</option>
                <option value="done">완료</option>
                <option value="dropped">취소</option>
              </select>
              <button onClick={() => removeAction(i)} style={{
                padding: '3px 8px', fontSize: 11, background: 'rgba(239,68,68,0.1)',
                color: '#b91c1c', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 4, cursor: 'pointer',
              }}>×</button>
            </div>
          ))}
        </div>

        {/* 액션 */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <button onClick={onClose} disabled={saving} style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 13,
            background: '#fff', border: `1px solid ${COLORS.borderSubtle}`,
            color: COLORS.textSecondary, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>취소</button>
          <button onClick={save} disabled={saving} style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: COLORS.primary, color: '#fff', border: 'none',
            cursor: saving ? 'wait' : 'pointer', whiteSpace: 'nowrap',
          }}>{saving ? '저장 중...' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 12,
  border: `1px solid ${COLORS.borderSubtle}`,
  background: GLASS.L1.background,
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  )
}
