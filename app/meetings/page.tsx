'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'
import { fmtDate } from '@/lib/format'

// ═══════════════════════════════════════════════════════════════
// 회의록 메인 페이지 (목록 + 등록 모달 + 상세 패널)
// /meetings
// ═══════════════════════════════════════════════════════════════

const TYPE_META: Record<string, { label: string; emoji: string; tone: 'info' | 'success' | 'warning' | 'neutral' }> = {
  regular:    { label: '정기 회의', emoji: '📅', tone: 'info' },
  specific:   { label: '특정 회의', emoji: '📋', tone: 'neutral' },
  one_on_one: { label: '1:1 면담',  emoji: '👥', tone: 'success' },
  department: { label: '부서별',    emoji: '🏢', tone: 'warning' },
}

const STATUS_META: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  draft:     { label: '작성중', tone: 'warning' },
  published: { label: '공개',   tone: 'success' },
  archived:  { label: '보관',   tone: 'neutral' },
}

interface Meeting {
  id: string; title: string; type: string;
  meeting_date: any; duration_min: number | null; location: string | null;
  organizer_id: string | null; organizer_name: string | null;
  department: string | null; status: string;
  attendee_count: number; action_count: number; open_action_count: number;
  created_at: string;
}

export default function MeetingsPage() {
  const [list, setList] = useState<Meeting[]>([])
  const [stats, setStats] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<any[]>([])
  const [filter, setFilter] = useState<'all' | 'regular' | 'specific' | 'one_on_one' | 'department'>('all')
  const [search, setSearch] = useState('')
  const [showMine, setShowMine] = useState(false)
  const [groupBy, setGroupBy] = useState<'none' | 'department' | 'organizer'>('none')

  const [showEditor, setShowEditor] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

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

  const filteredList = useMemo(() => list, [list])

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: '', label: '', items: filteredList }]
    const map = new Map<string, Meeting[]>()
    for (const m of filteredList) {
      const key = groupBy === 'department'
        ? (m.department || '미분류')
        : (m.organizer_name || '미배정')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, label: key, items }))
  }, [filteredList, groupBy])

  const openNew = () => { setEditingId(null); setShowEditor(true) }
  const openEdit = (id: string) => { setEditingId(id); setShowEditor(true) }

  const remove = async (id: string, title: string) => {
    if (!confirm(`「${title}」 회의를 삭제할까요?`)) return
    const { ok, json } = await fetchWithAuth(`/api/meetings?id=${id}`, { method: 'DELETE' })
    if (ok) await loadList()
    else alert(`삭제 실패: ${json?.error}`)
  }

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh' }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.textMuted, fontSize: 13 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24' }} />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} />
          <span style={{ marginLeft: 8 }}>RIDE INC</span>
          <span>›</span>
          <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>회의록</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, marginTop: 8 }}>
          🗓 회의록
        </h1>
      </div>

      {/* 통계 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: '전체',       value: stats.total || 0,             tint: '#3b82f6', emoji: '📊' },
          { label: '정기 회의',  value: stats.regular_count || 0,     tint: '#3b82f6', emoji: '📅' },
          { label: '특정 회의',  value: stats.specific_count || 0,    tint: '#64748b', emoji: '📋' },
          { label: '1:1 면담',   value: stats.one_on_one_count || 0,  tint: '#10b981', emoji: '👥' },
          { label: '부서별',     value: stats.department_count || 0,  tint: '#f59e0b', emoji: '🏢' },
          { label: '작성중',     value: stats.draft_count || 0,       tint: '#ef4444', emoji: '✏️' },
        ].map((s, i) => (
          <div key={i} style={{
            ...GLASS.L3, border: `1px solid ${s.tint}33`,
            borderRadius: 12, padding: 14,
          }}>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>
              {s.emoji} {s.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.tint }}>
              {Number(s.value).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* 필터 + 액션 */}
      <div style={{
        ...GLASS.L3, borderRadius: 12, padding: 12, marginBottom: 12,
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 검색 */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 제목/안건/요약 검색"
            style={{
              padding: '6px 12px', fontSize: 12, borderRadius: 8,
              border: `1px solid ${COLORS.borderSubtle}`,
              background: 'rgba(255,255,255,0.7)', minWidth: 200,
            }}
          />
          {/* 유형 */}
          {([
            { k: 'all',        label: '전체' },
            { k: 'regular',    label: '📅 정기' },
            { k: 'specific',   label: '📋 특정' },
            { k: 'one_on_one', label: '👥 1:1' },
            { k: 'department', label: '🏢 부서별' },
          ] as const).map(b => (
            <button key={b.k} onClick={() => setFilter(b.k as any)}
              style={{
                padding: '5px 10px', fontSize: 11, fontWeight: 600,
                borderRadius: 6, cursor: 'pointer',
                background: filter === b.k ? COLORS.primary : '#fff',
                color: filter === b.k ? '#fff' : COLORS.textSecondary,
                border: `1px solid ${filter === b.k ? COLORS.primary : COLORS.borderSubtle}`,
              }}>
              {b.label}
            </button>
          ))}
          <span style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.08)', margin: '0 4px' }} />
          {/* 그룹화 */}
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}
            style={{ padding: '5px 10px', fontSize: 11, borderRadius: 6, border: `1px solid ${COLORS.borderSubtle}`, background: '#fff' }}>
            <option value="none">그룹: 없음</option>
            <option value="department">그룹: 부서별</option>
            <option value="organizer">그룹: 주관자별</option>
          </select>
          {/* 내 회의만 */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: COLORS.textSecondary, cursor: 'pointer' }}>
            <input type="checkbox" checked={showMine} onChange={(e) => setShowMine(e.target.checked)} />
            내 회의만
          </label>
        </div>
        <button onClick={openNew} style={{
          padding: '8px 16px', fontSize: 13, fontWeight: 700,
          background: COLORS.primary, color: '#fff', border: 'none',
          borderRadius: 8, cursor: 'pointer',
        }}>
          + 회의 등록
        </button>
      </div>

      {/* 목록 */}
      {loading && <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>불러오는 중...</div>}
      {!loading && list.length === 0 && (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 60, textAlign: 'center', color: COLORS.textMuted }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🗓</div>
          <div>등록된 회의록이 없습니다</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>+ 회의 등록 버튼으로 시작하세요</div>
        </div>
      )}
      {!loading && grouped.map(g => (
        <div key={g.key} style={{ marginBottom: g.label ? 20 : 0 }}>
          {g.label && (
            <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, margin: '12px 4px 8px' }}>
              {groupBy === 'department' ? '🏢' : '👤'} {g.label}
              <span style={{ color: COLORS.textMuted, fontWeight: 500, marginLeft: 6 }}>({g.items.length})</span>
            </h3>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
            {g.items.map((m) => {
              const tm = TYPE_META[m.type] || TYPE_META.specific
              const sm = STATUS_META[m.status] || STATUS_META.draft
              return (
                <div key={m.id}
                  onClick={() => openEdit(m.id)}
                  style={{
                    ...GLASS.L3,
                    border: `1px solid ${COLORS.borderSubtle}`,
                    borderRadius: 12, padding: 14, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = COLORS.primary}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = COLORS.borderSubtle}>
                  {/* 상단 — 유형/상태 배지 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ ...pillStyle(tm.tone), fontSize: 10, padding: '2px 8px' }}>
                      {tm.emoji} {tm.label}
                    </span>
                    <span style={{ ...pillStyle(sm.tone), fontSize: 10, padding: '2px 8px' }}>
                      {sm.label}
                    </span>
                  </div>
                  {/* 제목 */}
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 6, lineHeight: 1.3 }}>
                    {m.title}
                  </h4>
                  {/* 메타 */}
                  <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                    📆 {fmtDate(m.meeting_date)} {m.duration_min ? `· ${m.duration_min}분` : ''}<br />
                    👤 {m.organizer_name || '주관자 미정'} {m.department && `· ${m.department}`}<br />
                    👥 참석 {Number(m.attendee_count) || 0}명
                    {Number(m.action_count) > 0 && (
                      <> · ✓ TODO {Number(m.action_count) - Number(m.open_action_count)}/{Number(m.action_count)}</>
                    )}
                    {m.location && <><br />📍 {m.location}</>}
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button onClick={(e) => { e.stopPropagation(); openEdit(m.id) }}
                      style={{
                        padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                        background: 'rgba(59,130,246,0.1)', color: '#1d4ed8',
                        border: '1px solid rgba(59,130,246,0.35)', cursor: 'pointer',
                      }}>편집</button>
                    <button onClick={(e) => { e.stopPropagation(); remove(m.id, m.title) }}
                      style={{
                        padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                        background: 'rgba(239,68,68,0.1)', color: '#b91c1c',
                        border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer',
                      }}>삭제</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* 등록/편집 모달 */}
      {showEditor && (
        <MeetingEditor
          meetingId={editingId}
          employees={employees}
          onClose={() => { setShowEditor(false); setEditingId(null) }}
          onSaved={() => { setShowEditor(false); setEditingId(null); loadList() }}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 회의 등록/편집 모달 (회의록 본문 + 참석자 + 액션 아이템)
// ═══════════════════════════════════════════════════════════════
function MeetingEditor({ meetingId, employees, onClose, onSaved }: {
  meetingId: string | null
  employees: any[]
  onClose: () => void
  onSaved: () => void
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
    if (!meeting.title) { alert('제목 입력'); return }
    setSaving(true)
    try {
      const body = { meeting, attendees, minutes, action_items: actionItems }
      const url = meetingId ? `/api/meetings?id=${meetingId}` : '/api/meetings'
      const method = meetingId ? 'PATCH' : 'POST'
      const { ok, json } = await fetchWithAuth(url, { method, body })
      if (ok) onSaved()
      else alert(`저장 실패: ${json?.error}`)
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
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>
            {meetingId ? '🗓 회의 편집' : '🗓 새 회의 등록'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLORS.textMuted }}>×</button>
        </div>

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
            <h3 style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, margin: 0 }}>👥 참석자 ({attendees.length})</h3>
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
              <span style={{ flex: 1, color: COLORS.textPrimary, fontWeight: 600 }}>
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
            <h3 style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, margin: 0 }}>📝 회의록 본문 ({minutes.length})</h3>
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
                    background: `${b.color}1A`, color: b.color, border: `1px solid ${b.color}55`,
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
                <span style={{ ...pillStyle('info'), fontSize: 9, padding: '1px 6px' }}>
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
            <h3 style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, margin: 0 }}>✓ 액션 아이템 (TODO) — {actionItems.length}건</h3>
            <button onClick={addAction}
              style={{
                padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                background: 'rgba(34,197,94,0.1)', color: '#15803d', border: '1px solid rgba(34,197,94,0.35)',
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
            color: COLORS.textSecondary, cursor: 'pointer',
          }}>취소</button>
          <button onClick={save} disabled={saving} style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: COLORS.primary, color: '#fff', border: 'none',
            cursor: saving ? 'wait' : 'pointer',
          }}>{saving ? '저장 중...' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 12,
  border: `1px solid ${COLORS.borderSubtle}`,
  background: 'rgba(255,255,255,0.7)',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  )
}
