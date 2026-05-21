'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { JSONContent } from '@tiptap/react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'
import MeetingSidebar from './MeetingSidebar'
import MeetingHeaderBar, { type MeetingMeta } from './MeetingHeaderBar'
import TiptapEditor from './TiptapEditor'
import AutoSaveIndicator, { type SaveStatus } from './AutoSaveIndicator'
import AttendeeManager from './AttendeeManager'
import ActionItemList from './ActionItemList'
import PersonalNoteEditor from './PersonalNoteEditor'
import MeetingPermissionsPanel from './MeetingPermissionsPanel'
import { v1ToV2Body, appendV1ToBody } from './v1ToV2Body'

// ═══════════════════════════════════════════════════════════════
// MeetingsLayoutV2 — V2 Split view 컨테이너 (PR-V2-A)
//   · 좌측 sidebar + 우측 본문 (본문/참석자/액션/V1 legacy 탭)
//   · 자동 저장: meta blur 즉시 / body debounce 1.5s / attendees·actions debounce 1s
//   · 권한: admin/master/organizer/created_by/page_perm
// ═══════════════════════════════════════════════════════════════

interface Props {
  meetingId: string         // 필수 — /meetings/new 는 POST 후 [id] 로 redirect
  initialTab?: 'body' | 'attendees' | 'actions' | 'note' | 'permissions' | 'legacy'
}

interface CurrentUser {
  id: string
  role?: string
  [k: string]: any
}

type Tab = 'body' | 'attendees' | 'actions' | 'note' | 'permissions' | 'legacy'

const EMPTY_META: MeetingMeta = {
  title: '', type: 'specific',
  meeting_date: new Date().toISOString().slice(0, 16),
  duration_min: 60, location: '',
  organizer_id: null, department: '', status: 'draft',
  visibility: 'attendees',
}

export default function MeetingsLayoutV2({ meetingId, initialTab = 'body' }: Props) {
  const router = useRouter()

  // ── 사용자 / 권한 ─────────────────────────────────────────────
  const [user, setUser] = useState<CurrentUser | null>(null)
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('fmi_user') : null
      if (raw) setUser(JSON.parse(raw))
    } catch {}
  }, [])

  // ── 상태 ──────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [meta, setMeta] = useState<MeetingMeta>(EMPTY_META)
  const [createdBy, setCreatedBy] = useState<string | null>(null)
  const [body, setBody] = useState<JSONContent | null>(null)
  const [bodyVersion, setBodyVersion] = useState<number>(1)
  const [bodyMigrationPending, setBodyMigrationPending] = useState(false)
  const [attendees, setAttendees] = useState<any[]>([])
  const [actionItems, setActionItems] = useState<any[]>([])
  const [minutes, setMinutes] = useState<any[]>([])      // V1 legacy read-only
  const [employees, setEmployees] = useState<any[]>([])

  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // 자동 저장 상태
  const [bodySaveStatus, setBodySaveStatus] = useState<SaveStatus>('idle')
  const [bodyLastSavedAt, setBodyLastSavedAt] = useState<Date | null>(null)
  const [bodyError, setBodyError] = useState<string | undefined>(undefined)
  const [metaSaveStatus, setMetaSaveStatus] = useState<SaveStatus>('idle')

  // 권한
  const canEdit = useMemo(() => {
    if (!user) return false
    if (user.role === 'admin' || user.role === 'master') return true
    if (meta.organizer_id === user.id) return true
    if (createdBy === user.id) return true
    return false
  }, [user, meta.organizer_id, createdBy])

  // ── 로드 ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setNotFound(false)
    try {
      // 회의 메타 + 자식 데이터
      const { ok, json } = await fetchWithAuth(`/api/meetings?id=${meetingId}`)
      if (!ok || !json?.data) {
        setNotFound(true); setLoading(false); return
      }
      const m = json.data.meeting
      if (!m) { setNotFound(true); setLoading(false); return }
      setMeta({
        title: m.title || '',
        type: m.type || 'specific',
        meeting_date: m.meeting_date ? String(m.meeting_date).slice(0, 16) : '',
        duration_min: m.duration_min || null,
        location: m.location || '',
        organizer_id: m.organizer_id || null,
        department: m.department || '',
        status: m.status || 'draft',
        visibility: m.visibility || 'attendees',
      })
      setCreatedBy(m.created_by || null)
      setAttendees(json.data.attendees || [])
      setActionItems(json.data.action_items || [])
      setMinutes(json.data.minutes || [])

      // body 로드
      const { json: bodyJson } = await fetchWithAuth(`/api/meetings/${meetingId}/body`)
      if (bodyJson?._migration_pending) {
        setBodyMigrationPending(true)
        setBody(null); setBodyVersion(1)
        setBodySaveStatus('migration')
      } else if (bodyJson?.data) {
        setBody(bodyJson.data.body || null)
        setBodyVersion(Number(bodyJson.data.body_version || 1))
        setBodyLastSavedAt(bodyJson.data.body_updated_at ? new Date(bodyJson.data.body_updated_at) : null)
        setBodyMigrationPending(false)
        setBodySaveStatus('idle')
      }
    } finally {
      setLoading(false)
    }
  }, [meetingId])

  const [employeesEmpty, setEmployeesEmpty] = useState(false)
  const loadEmployees = useCallback(async () => {
    // PR-V2-Ride-2: profiles → ride_employees (인사 마스터)
    // 응답: [{ id, name, department, position, employment_type, color_tone, group_label, profile_id }]
    try {
      const { json } = await fetchWithAuth('/api/meetings/mentions/employees?limit=200')
      const data = Array.isArray(json?.data) ? json.data : []
      setEmployees(data)
      setEmployeesEmpty(data.length === 0)
    } catch (e) {
      console.warn('[loadEmployees]', e)
      setEmployees([])
      setEmployeesEmpty(true)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadEmployees() }, [loadEmployees])

  // ── 자동 저장: body (debounce 1.5s) ───────────────────────────
  const bodyTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingBodyRef = useRef<JSONContent | null>(null)

  const flushBody = useCallback(async () => {
    if (bodyMigrationPending) return
    const next = pendingBodyRef.current
    if (next === null || next === undefined) return
    pendingBodyRef.current = null
    setBodySaveStatus('saving')
    try {
      const { ok, json, status } = await fetchWithAuth(`/api/meetings/${meetingId}/body`, {
        method: 'PATCH',
        body: { body: next, body_version: bodyVersion },
      })
      if (ok && json?.data) {
        setBodyVersion(Number(json.data.body_version || bodyVersion + 1))
        setBodyLastSavedAt(new Date())
        setBodySaveStatus('saved')
        setBodyError(undefined)
      } else if (status === 409 && json?.error === 'version_conflict') {
        setBodySaveStatus('conflict')
        setBodyError(json.message || '버전 충돌 — 새로고침')
        // server 본문으로 reset (PR-V2-E 협업 도입 후 더 정교한 reconcile)
        if (json?.data?.body !== undefined) {
          setBody(json.data.body)
          setBodyVersion(Number(json.data.body_version || 1))
        }
      } else if (status === 503 && json?._migration_pending) {
        setBodyMigrationPending(true)
        setBodySaveStatus('migration')
      } else {
        setBodySaveStatus('error')
        setBodyError(json?.error || '저장 실패')
      }
    } catch (e: any) {
      setBodySaveStatus('error')
      setBodyError(e?.message || '네트워크 오류')
    }
  }, [meetingId, bodyVersion, bodyMigrationPending])

  const onBodyChange = useCallback((json: JSONContent) => {
    if (!canEdit) return
    pendingBodyRef.current = json
    setBody(json)
    setBodySaveStatus('pending')
    if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current)
    bodyTimerRef.current = setTimeout(() => { void flushBody() }, 1500)
  }, [canEdit, flushBody])

  // unmount 시 미저장분 flush (best-effort)
  useEffect(() => {
    return () => {
      if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current)
      if (pendingBodyRef.current) { void flushBody() }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 자동 저장: meta (즉시) ───────────────────────────────────
  // hotfix #4 — meta 저장 성공 시 사이드바 refetch (제목 변경 즉시 반영)
  const [sidebarReloadKey, setSidebarReloadKey] = useState(0)
  const saveMeta = useCallback(async (patch: Partial<MeetingMeta>) => {
    if (!canEdit) return
    setMetaSaveStatus('saving')
    try {
      const { ok, json } = await fetchWithAuth(`/api/meetings?id=${meetingId}`, {
        method: 'PATCH',
        body: { meeting: { ...meta, ...patch } },
      })
      if (ok) {
        setMetaSaveStatus('saved')
        // 제목/유형/상태 등 사이드바 표시 항목 변경 시 사이드바 갱신
        setSidebarReloadKey(k => k + 1)
      } else {
        setMetaSaveStatus('error')
        console.warn('[saveMeta] 실패:', json?.error)
      }
    } catch (e) {
      setMetaSaveStatus('error')
    }
  }, [canEdit, meetingId, meta])

  const onMetaChange = useCallback((patch: Partial<MeetingMeta>) => {
    setMeta(prev => ({ ...prev, ...patch }))
    // title 은 blur 시 commit (HeaderBar 가 책임), 그 외는 즉시
    void saveMeta(patch)
  }, [saveMeta])

  // ── 자동 저장: attendees + actions (debounce 1s) ─────────────
  const childTimerRef = useRef<NodeJS.Timeout | null>(null)
  const saveChildren = useCallback(async (a: any[], ai: any[]) => {
    if (!canEdit) return
    try {
      await fetchWithAuth(`/api/meetings?id=${meetingId}`, {
        method: 'PATCH',
        body: { attendees: a, action_items: ai },
      })
    } catch {}
  }, [canEdit, meetingId])

  const onAttendeesChange = useCallback((next: any[]) => {
    setAttendees(next)
    if (childTimerRef.current) clearTimeout(childTimerRef.current)
    childTimerRef.current = setTimeout(() => { void saveChildren(next, actionItems) }, 1000)
  }, [actionItems, saveChildren])

  const onActionsChange = useCallback((next: any[]) => {
    setActionItems(next)
    if (childTimerRef.current) clearTimeout(childTimerRef.current)
    childTimerRef.current = setTimeout(() => { void saveChildren(attendees, next) }, 1000)
  }, [attendees, saveChildren])

  // ── 개인 메모 (PR-MTG-V2-Note) ───────────────────────────────
  const [noteBody, setNoteBody] = useState<JSONContent | null>(null)
  const [noteMigrationPending, setNoteMigrationPending] = useState(false)
  const [noteSaveStatus, setNoteSaveStatus] = useState<SaveStatus>('idle')
  const [noteLastSavedAt, setNoteLastSavedAt] = useState<Date | null>(null)
  const [noteError, setNoteError] = useState<string | undefined>(undefined)
  const noteTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingNoteRef = useRef<{ body: JSONContent; text: string } | null>(null)

  const loadNote = useCallback(async () => {
    try {
      const { json } = await fetchWithAuth(`/api/meetings/${meetingId}/personal-note`)
      if (json?._migration_pending) {
        setNoteMigrationPending(true)
        setNoteBody(null)
        setNoteSaveStatus('migration')
        return
      }
      if (json?.data) {
        setNoteBody(json.data.body || null)
        setNoteLastSavedAt(json.data.updated_at ? new Date(json.data.updated_at) : null)
        setNoteSaveStatus('idle')
        setNoteMigrationPending(false)
      }
    } catch (e) {
      console.warn('[loadNote]', e)
    }
  }, [meetingId])
  useEffect(() => { void loadNote() }, [loadNote])

  const flushNote = useCallback(async () => {
    if (noteMigrationPending) return
    const pending = pendingNoteRef.current
    if (!pending) return
    pendingNoteRef.current = null
    setNoteSaveStatus('saving')
    try {
      const { ok, json, status } = await fetchWithAuth(`/api/meetings/${meetingId}/personal-note`, {
        method: 'PUT',
        body: { body: pending.body, body_text: pending.text },
      })
      if (ok) {
        setNoteLastSavedAt(new Date())
        setNoteSaveStatus('saved')
        setNoteError(undefined)
      } else if (status === 503 && json?._migration_pending) {
        setNoteMigrationPending(true)
        setNoteSaveStatus('migration')
      } else {
        setNoteSaveStatus('error')
        setNoteError(json?.error || '저장 실패')
      }
    } catch (e: any) {
      setNoteSaveStatus('error')
      setNoteError(e?.message || '네트워크 오류')
    }
  }, [meetingId, noteMigrationPending])

  const onNoteChange = useCallback((json: JSONContent, text: string) => {
    pendingNoteRef.current = { body: json, text }
    setNoteBody(json)
    setNoteSaveStatus('pending')
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current)
    noteTimerRef.current = setTimeout(() => { void flushNote() }, 1500)
  }, [flushNote])

  useEffect(() => {
    return () => {
      if (noteTimerRef.current) clearTimeout(noteTimerRef.current)
      if (pendingNoteRef.current) { void flushNote() }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── V1 → V2 본문 변환 (PR-MTG-V2-F) ─────────────────────────
  const [convertingV1, setConvertingV1] = useState(false)
  const onConvertV1 = useCallback(async () => {
    if (!canEdit) return
    if (!minutes || minutes.length === 0) return
    if (bodyMigrationPending) {
      alert('DB 마이그 미적용 상태 — 본문 저장 불가 (먼저 migrations/2026-05-13_meetings_v2.sql 적용 요청)')
      return
    }
    const hasExistingBody = !!body && Array.isArray(body.content) && body.content.some(
      (n: any) => n.type !== 'paragraph' || (n.content && n.content.length > 0)
    )
    let nextBody
    if (hasExistingBody) {
      const choice = confirm(
        `현재 본문이 비어있지 않습니다.\n\n[확인] V1 섹션을 본문 끝에 추가\n[취소] 작업 취소\n\n` +
        `※ 새 본문으로 교체하려면 본문 탭에서 직접 비운 후 다시 시도하세요.`
      )
      if (!choice) return
      nextBody = appendV1ToBody(body, minutes)
    } else {
      nextBody = v1ToV2Body(minutes)
    }
    setConvertingV1(true)
    setBody(nextBody)
    // onBodyChange 와 같은 흐름 — debounce 우회하여 즉시 PATCH 가능하지만,
    // 통일성 위해 같은 debounce 경로 사용 (사용자가 「✓ 저장됨」 명시적 확인)
    pendingBodyRef.current = nextBody
    setBodySaveStatus('pending')
    if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current)
    bodyTimerRef.current = setTimeout(() => { void flushBody() }, 300)  // 빠르게 저장
    // 본문 탭으로 자동 이동
    setActiveTab('body')
    setConvertingV1(false)
  }, [canEdit, minutes, body, bodyMigrationPending, flushBody])

  // ── 삭제 ─────────────────────────────────────────────────────
  const onDelete = useCallback(async () => {
    if (!confirm(`「${meta.title || '제목 없음'}」 회의를 삭제할까요?`)) return
    const { ok, json } = await fetchWithAuth(`/api/meetings?id=${meetingId}`, { method: 'DELETE' })
    if (ok) {
      router.push('/meetings')
    } else {
      alert(`삭제 실패: ${json?.error || '알 수 없는 오류'}`)
    }
  }, [meetingId, meta.title, router])

  // ── 렌더 ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
        <MeetingSidebar activeId={meetingId} collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(v => !v)} />
        <main style={{ flex: 1, padding: 40, textAlign: 'center', color: COLORS.textMuted }}>
          불러오는 중...
        </main>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
        <MeetingSidebar activeId={meetingId} collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(v => !v)} />
        <main style={{ flex: 1, padding: 40 }}>
          <div style={{
            ...GLASS.L4, borderRadius: 14, padding: 40, textAlign: 'center',
            border: '1px solid rgba(239,68,68,0.3)',
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#b91c1c', marginBottom: 6 }}>
              회의를 찾을 수 없습니다
            </div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 14 }}>
              삭제되었거나 잘못된 ID 입니다.
            </div>
            <button onClick={() => router.push('/meetings')}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 700, borderRadius: 8,
                background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer',
              }}>회의록 목록으로</button>
          </div>
        </main>
      </div>
    )
  }

  const hasLegacy = (minutes?.length || 0) > 0

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
      <MeetingSidebar
        activeId={meetingId}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed(v => !v)}
        reloadKey={sidebarReloadKey}
      />
      <main style={{ flex: 1, padding: '20px 32px 60px', minWidth: 0, maxWidth: 1080 }}>
        {/* 마이그 미적용 배너 (Rule 23) */}
        {bodyMigrationPending && (
          <div style={{
            ...GLASS.L3, border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 14,
            color: '#b91c1c', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            ⚠ DB 마이그 미적용 — 본문 저장 불가. 관리자에게 <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 4 }}>migrations/2026-05-13_meetings_v2.sql</code> 적용 요청.
          </div>
        )}

        {/* ride_employees 비어있을 때 배너 (hotfix #2 — Rule 23 graceful) */}
        {employeesEmpty && (
          <div style={{
            ...GLASS.L3, border: '1px solid rgba(245,158,11,0.40)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 14,
            color: '#b45309', fontSize: 12, fontWeight: 600,
          }}>
            ⚠ 인사마스터 직원 데이터 없음 — 참석자/담당자 선택 불가.
            <br />
            관리자에게 <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 4 }}>migrations/2026-05-03_ride_employees_init.sql</code> 적용 + <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 4 }}>/hr/people</code> 에서 직원 등록 요청.
          </div>
        )}

        {/* 「← 목록으로」 버튼 (hotfix #1 → hotfix #2 강조) */}
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => router.push('/meetings')}
            title="회의록 목록으로 돌아가기 (sidebar 외 명시 경로)"
            style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 700, borderRadius: 8,
              background: GLASS.L4.background,
              color: COLORS.primary,
              border: `1px solid ${COLORS.primary}40`,
              cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              boxShadow: `0 1px 3px ${COLORS.primary}20`,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${COLORS.primary}1A`
              e.currentTarget.style.boxShadow = `0 2px 6px ${COLORS.primary}40`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = GLASS.L4.background
              e.currentTarget.style.boxShadow = `0 1px 3px ${COLORS.primary}20`
            }}>
            ← 회의록 목록으로
          </button>
        </div>

        {/* 헤더 */}
        <MeetingHeaderBar
          meta={meta}
          onMetaChange={onMetaChange}
          editable={canEdit}
          employees={employees}
          metaSaveStatus={metaSaveStatus}
          trailing={
            <>
              <AutoSaveIndicator
                status={bodySaveStatus}
                lastSavedAt={bodyLastSavedAt}
                message={bodyError}
              />
              {canEdit && (
                <button onClick={onDelete}
                  title="회의 삭제 (soft delete)"
                  style={{
                    padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                    background: 'rgba(239,68,68,0.10)', color: '#b91c1c',
                    border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>삭제</button>
              )}
            </>
          }
        />

        {/* 탭 */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          <TabBtn label="📝 본문"        active={activeTab === 'body'} onClick={() => setActiveTab('body')} />
          <TabBtn label={`👥 참석자 ${attendees.length}`} active={activeTab === 'attendees'} onClick={() => setActiveTab('attendees')} />
          <TabBtn label={`✓ 액션 ${actionItems.length}`}  active={activeTab === 'actions'}   onClick={() => setActiveTab('actions')} />
          <TabBtn label="📓 내 메모"     active={activeTab === 'note'}     onClick={() => setActiveTab('note')} />
          <TabBtn label="🔒 권한"        active={activeTab === 'permissions'} onClick={() => setActiveTab('permissions')} />
          {hasLegacy && (
            <TabBtn label="📎 V1 섹션 (legacy)" active={activeTab === 'legacy'} onClick={() => setActiveTab('legacy')} />
          )}
        </div>

        {/* 탭 컨텐츠 */}
        {activeTab === 'body' && (
          <TiptapEditor
            value={body}
            onChange={onBodyChange}
            editable={canEdit && !bodyMigrationPending}
          />
        )}

        {activeTab === 'attendees' && (
          <AttendeeManager
            attendees={attendees}
            onChange={onAttendeesChange}
            employees={employees}
            department={meta.department}
            showAutoFill={!!meta.department?.trim()}  /* PR-V2-Dept — type 무관, 부서 있으면 노출 */
            editable={canEdit}
          />
        )}

        {activeTab === 'actions' && (
          <ActionItemList
            items={actionItems}
            onChange={onActionsChange}
            employees={employees}
            editable={canEdit}
          />
        )}

        {activeTab === 'note' && (
          <div>
            {noteMigrationPending && (
              <div style={{
                ...GLASS.L3, border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 10, padding: '10px 14px', marginBottom: 10,
                color: '#b91c1c', fontSize: 12, fontWeight: 600,
              }}>
                ⚠ DB 마이그 미적용 — 개인 메모 저장 불가. 관리자에게 <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 4 }}>migrations/2026-05-16_meeting_personal_notes.sql</code> 적용 요청.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
              <AutoSaveIndicator
                status={noteSaveStatus}
                lastSavedAt={noteLastSavedAt}
                message={noteError}
              />
            </div>
            <PersonalNoteEditor
              value={noteBody}
              onChange={onNoteChange}
              editable={!noteMigrationPending}
            />
          </div>
        )}

        {activeTab === 'permissions' && (
          <MeetingPermissionsPanel
            meetingId={meetingId}
            meta={meta}
            onVisibilityChange={(v) => onMetaChange({ visibility: v })}
            employees={employees}
            canManage={canEdit}
          />
        )}

        {activeTab === 'legacy' && hasLegacy && (
          <div style={{ ...GLASS.L3, padding: 14, borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, margin: 0, whiteSpace: 'nowrap' }}>
                📎 V1 섹션 (read-only — 변환 후 정리 권장)
              </h3>
              {canEdit && !bodyMigrationPending && (
                <button onClick={onConvertV1} disabled={convertingV1}
                  title="V1 섹션 (안건/결정/메모/첨부) 을 V2 본문으로 변환 — body 비어있으면 자동 / 있으면 append 확인"
                  style={{
                    padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6,
                    background: `linear-gradient(135deg, ${COLORS.primary}, #5a8fd4)`,
                    color: '#fff', border: 'none', cursor: convertingV1 ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap', boxShadow: `0 2px 6px ${COLORS.primary}4D`,
                  }}>
                  {convertingV1 ? '변환 중...' : '✨ V2 본문으로 옮기기'}
                </button>
              )}
            </div>
            <div style={{
              padding: '8px 12px', borderRadius: 8, marginBottom: 10,
              background: `${COLORS.primary}0A`,
              color: COLORS.textSecondary, fontSize: 11,
            }}>
              💡 「V2 본문으로 옮기기」 → 안건/결정/메모/첨부 섹션이 본문 탭에 H2/H3/단락 블록으로 추가됩니다.
              V1 데이터는 그대로 보존되며, 본문 탭에서 추가 편집 가능합니다.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {minutes.map((m, i) => (
                <div key={m.id || i} style={{ ...GLASS.L4, padding: 10, borderRadius: 8 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                      background: 'rgba(59,130,246,0.12)', color: '#1d4ed8', whiteSpace: 'nowrap',
                    }}>
                      {m.section_type === 'agenda' ? '안건' : m.section_type === 'decision' ? '결정' : m.section_type === 'attachment' ? '첨부' : '메모'}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>
                      {m.title || '(제목 없음)'}
                    </span>
                  </div>
                  {m.content && (
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {m.content}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!canEdit && (
          <div style={{
            marginTop: 14, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(245,158,11,0.08)', color: '#b45309',
            border: '1px solid rgba(245,158,11,0.30)',
            fontSize: 12, fontWeight: 600,
          }}>
            🔒 읽기 전용 — 편집 권한은 주관자 / 작성자 / admin / master 만 가능합니다.
          </div>
        )}
      </main>
    </div>
  )
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 8, border: 'none',
      fontSize: 12, fontWeight: 700,
      background: active ? '#0f2440' : GLASS.L1.background,
      color: active ? '#fff' : COLORS.textSecondary,
      cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
      transition: 'all 0.15s',
    }}>
      {label}
    </button>
  )
}
