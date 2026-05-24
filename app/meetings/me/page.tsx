'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'
import DcStatStrip, { StatItem } from '@/app/components/DcStatStrip'
import DcToolbar from '@/app/components/DcToolbar'
import TodoListView, { type TodoItem, type EditDraft } from '../_components/TodoListView'
import TodoCalendarView from '../_components/TodoCalendarView'

// ═══════════════════════════════════════════════════════════════
// 내 TODO 대시보드 — /meetings/me (PR-MTG-V2-Me → Todo-A/B/C)
//
// 회의 액션 (meeting_action_items) + 개인 TODO (personal_todos) 통합.
// PR-V2-Todo-C: 표(NeuDataTable) → 체크리스트 리스트 (TodoListView) + 인라인 편집.
// ═══════════════════════════════════════════════════════════════

// 개인 TODO 기본 카테고리 (자유 입력 — 칩/datalist 제안)
const TODO_CATEGORIES = ['개인', '업무', '스케줄', '회의준비', '학습', '약속', '건강', '거래처', '기타']

// tags(쉼표구분 문자열) → 배열 정규화
function parseTags(raw: any): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean)
  return String(raw).split(',').map(s => s.trim()).filter(Boolean)
}

type Toast = { id: number; tone: 'success' | 'error'; text: string }
let __toastId = 0

export default function MyTodoPage() {
  const router = useRouter()
  const [items, setItems] = useState<TodoItem[]>([])
  const [stats, setStats] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open' | 'done' | 'dropped' | 'all'>('open')
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'meeting' | 'personal'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [migrationPending, setMigrationPending] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')

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
    const [actionsRes, todosRes] = await Promise.all([
      fetchWithAuth(`/api/meetings/me/actions?${params}`),
      fetchWithAuth(`/api/meetings/me/todos?${params}`),
    ])
    const actions: TodoItem[] = (actionsRes.json?.data || []).map((a: any) => ({
      source: 'meeting' as const,
      id: a.id, content: a.content, due_date: a.due_date, status: a.status,
      meeting_id: a.meeting_id, meeting_title: a.meeting_title,
      meeting_type: a.meeting_type, organizer_name: a.organizer_name,
    }))
    const todos: TodoItem[] = (todosRes.json?.data || []).map((t: any) => ({
      source: 'personal' as const,
      id: t.id, content: t.content, due_date: t.due_date, status: t.status,
      category: t.category, priority: t.priority, memo: t.memo,
      tags: parseTags(t.tags),
    }))
    setMigrationPending(!!todosRes.json?._migration_pending)
    setItems([...actions, ...todos])
    const aS = actionsRes.json?.stats || {}
    const tS = todosRes.json?.stats || {}
    setStats({
      open: Number(aS.open_cnt || 0) + Number(tS.open_cnt || 0),
      done: Number(aS.done_cnt || 0) + Number(tS.done_cnt || 0),
      dropped: Number(aS.dropped_cnt || 0) + Number(tS.dropped_cnt || 0),
      total: Number(aS.total || 0) + Number(tS.total || 0),
      overdue: Number(aS.overdue_cnt || 0),
      due_week: Number(aS.due_week_cnt || 0),
      meeting_cnt: Number(aS.total || 0),
      personal_cnt: Number(tS.total || 0),
    })
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  // 사용 중 카테고리
  const usedCategories = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      if (it.source === 'personal' && it.category && it.category.trim()) set.add(it.category.trim())
    }
    return Array.from(set).sort()
  }, [items])

  // 사용 중 해시태그
  const usedTags = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      if (it.source === 'personal' && it.tags) {
        for (const t of it.tags) if (t.trim()) set.add(t.trim())
      }
    }
    return Array.from(set).sort()
  }, [items])

  // 검색 + source + category 필터
  const filtered = useMemo(() => {
    let r = items
    if (sourceFilter !== 'all') r = r.filter(x => x.source === sourceFilter)
    if (categoryFilter !== 'all') {
      r = r.filter(x => x.source === 'personal' && (x.category || '') === categoryFilter)
    }
    if (tagFilter !== 'all') {
      r = r.filter(x => x.source === 'personal' && (x.tags || []).includes(tagFilter))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter(x =>
        (x.content || '').toLowerCase().includes(q)
        || (x.meeting_title || '').toLowerCase().includes(q)
        || (x.category || '').toLowerCase().includes(q)
        || (x.organizer_name || '').toLowerCase().includes(q)
        || (x.tags || []).join(' ').toLowerCase().includes(q)
      )
    }
    return r
  }, [items, search, sourceFilter, categoryFilter, tagFilter])

  // ── 콜백 ─────────────────────────────────────────────────────
  const toggleStatus = useCallback(async (item: TodoItem, newStatus: 'open' | 'done' | 'dropped') => {
    const url = item.source === 'meeting' ? '/api/meetings/me/actions' : '/api/meetings/me/todos'
    const body = item.source === 'meeting'
      ? { action_id: item.id, status: newStatus }
      : { id: item.id, status: newStatus }
    const { ok, json } = await fetchWithAuth(url, { method: 'PATCH', body })
    if (ok) {
      showToast('success', newStatus === 'done' ? '✓ 완료' : newStatus === 'open' ? '↺ 진행중' : '✗ 취소')
      await load()
    } else {
      showToast('error', `실패: ${json?.error || '오류'}`)
    }
  }, [load, showToast])

  const createTodo = useCallback(async (draft: EditDraft) => {
    const { ok, json } = await fetchWithAuth('/api/meetings/me/todos', {
      method: 'POST',
      body: {
        content: draft.content.trim(),
        due_date: draft.due_date || null,
        category: draft.category.trim() || null,
        priority: draft.priority || null,
        memo: draft.memo.trim() || null,
        tags: draft.tags.length ? draft.tags.join(',') : null,
      },
    })
    if (ok) { showToast('success', '✓ 개인 TODO 추가됨'); await load() }
    else if (json?._migration_pending) showToast('error', 'DB 마이그 미적용 — 관리자 문의')
    else showToast('error', `추가 실패: ${json?.error || '오류'}`)
  }, [load, showToast])

  const updateTodo = useCallback(async (id: string, draft: EditDraft) => {
    const { ok, json } = await fetchWithAuth('/api/meetings/me/todos', {
      method: 'PATCH',
      body: {
        id,
        content: draft.content.trim(),
        due_date: draft.due_date || null,
        category: draft.category.trim() || null,
        priority: draft.priority || null,
        memo: draft.memo.trim() || null,
        tags: draft.tags.length ? draft.tags.join(',') : null,
      },
    })
    if (ok) { showToast('success', '✓ 개인 TODO 수정됨'); await load() }
    else showToast('error', `수정 실패: ${json?.error || '오류'}`)
  }, [load, showToast])

  const deleteTodo = useCallback(async (item: TodoItem) => {
    if (item.source !== 'personal') return
    if (!confirm(`「${item.content}」 개인 TODO 를 삭제할까요?`)) return
    const { ok, json } = await fetchWithAuth(`/api/meetings/me/todos?id=${item.id}`, { method: 'DELETE' })
    if (ok) { showToast('success', '✓ 삭제됨'); await load() }
    else showToast('error', `삭제 실패: ${json?.error || '오류'}`)
  }, [load, showToast])

  const statItems: StatItem[] = useMemo(() => ([
    { label: '진행중',    value: Number(stats.open || 0),     icon: '✓', tint: 'blue' },
    { label: '마감 임박', value: Number(stats.due_week || 0), icon: '⏱', tint: 'amber' },
    { label: '지연',      value: Number(stats.overdue || 0),  icon: '⚠', tint: 'red' },
    { label: '완료',      value: Number(stats.done || 0),     icon: '☑', tint: 'green' },
    { label: '전체',      value: Number(stats.total || 0),    icon: '∑', tint: 'slate' },
  ]), [stats])

  const filterItems = useMemo(() => ([
    { key: 'open',    label: '진행중', count: Number(stats.open || 0) },
    { key: 'done',    label: '완료',   count: Number(stats.done || 0) },
    { key: 'dropped', label: '취소',   count: Number(stats.dropped || 0) },
    { key: 'all',     label: '전체',   count: Number(stats.total || 0) },
  ]), [stats])

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh' }}>
      <DcStatStrip stats={statItems} />

      {migrationPending && (
        <div style={{
          ...GLASS.L3, border: '1px solid rgba(245,158,11,0.40)', borderRadius: 10,
          padding: '10px 14px', marginBottom: 14, color: '#b45309', fontSize: 12, fontWeight: 600,
        }}>
          ⚠ 개인 TODO DB 마이그 미적용 — 회의 액션만 표시됨. 관리자에게 <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 4 }}>migrations/2026-05-16_personal_todos.sql</code> 적용 요청.
        </div>
      )}

      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="할 일 / 회의 / 분류 검색"
        filters={filterItems}
        activeFilter={filter}
        onFilterChange={(k) => setFilter(k as any)}
        trailing={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as any)}
              style={selStyle}>
              <option value="all">전체 ({stats.total || 0})</option>
              <option value="meeting">📋 회의 액션 ({stats.meeting_cnt || 0})</option>
              <option value="personal">📌 개인 TODO ({stats.personal_cnt || 0})</option>
            </select>
            {usedCategories.length > 0 && (
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                title="개인 TODO 카테고리 필터" style={selStyle}>
                <option value="all">📂 분류: 전체</option>
                {usedCategories.map(c => <option key={c} value={c}>📂 {c}</option>)}
              </select>
            )}
            {usedTags.length > 0 && (
              <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}
                title="개인 TODO 해시태그 필터" style={selStyle}>
                <option value="all"># 태그: 전체</option>
                {usedTags.map(t => <option key={t} value={t}># {t}</option>)}
              </select>
            )}
            {/* 리스트 / 캘린더 토글 */}
            <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(0,0,0,0.04)' }}>
              {([['list', '📋 리스트'], ['calendar', '📅 캘린더']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setViewMode(v)}
                  style={{
                    padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6,
                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    background: viewMode === v ? '#fff' : 'transparent',
                    color: viewMode === v ? COLORS.primary : COLORS.textMuted,
                    boxShadow: viewMode === v ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {viewMode === 'calendar' ? (
        <TodoCalendarView
          items={filtered}
          onItemClick={(it) => {
            if (it.source === 'meeting' && it.meeting_id) router.push(`/meetings/${it.meeting_id}`)
            else if (it.source === 'personal') setViewMode('list')
          }}
        />
      ) : (
        <TodoListView
          items={filtered}
          loading={loading}
          emptyMessage={filter === 'open' ? '진행중 할 일 없음 — 모두 완료!' : '데이터 없음'}
          categories={TODO_CATEGORIES}
          onToggleStatus={toggleStatus}
          onMeetingOpen={(id) => router.push(`/meetings/${id}`)}
          onCreate={createTodo}
          onUpdate={updateTodo}
          onDelete={deleteTodo}
        />
      )}

      {/* 토스트 */}
      <div style={{
        position: 'fixed', right: 20, bottom: 20, zIndex: 1100,
        display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
      }}>
        {toasts.map(t => {
          const tone = t.tone === 'success'
            ? { bg: 'rgba(34,197,94,0.92)',  border: 'rgba(34,197,94,0.5)' }
            : { bg: 'rgba(239,68,68,0.92)', border: 'rgba(239,68,68,0.5)' }
          return (
            <div key={t.id} style={{
              ...GLASS.L4, background: tone.bg, border: `1px solid ${tone.border}`,
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

const selStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 12, borderRadius: 8,
  border: `1px solid ${COLORS.borderSubtle}`, background: GLASS.L1.background,
  color: COLORS.textPrimary, cursor: 'pointer', whiteSpace: 'nowrap',
}
