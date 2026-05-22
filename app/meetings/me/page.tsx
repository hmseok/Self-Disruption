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
// 내 TODO 대시보드 — /meetings/me (PR-MTG-V2-Me → V2-Todo-A)
//
// 회의 액션 (meeting_action_items) + 개인 TODO (personal_todos) 통합.
// 개인 TODO: 회의 무관 — 「+ 개인 TODO 추가」 로 직접 생성.
// ═══════════════════════════════════════════════════════════════

const TYPE_EMOJI: Record<string, string> = {
  regular: '📅', specific: '📋', one_on_one: '👥', department: '🏢',
}
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  open:    { label: '진행중', color: '#1d4ed8', bg: 'rgba(59,130,246,0.12)' },
  done:    { label: '완료',   color: '#15803d', bg: 'rgba(34,197,94,0.12)' },
  dropped: { label: '취소',   color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
}
const PRIORITY_META: Record<string, { label: string; color: string }> = {
  high:   { label: '높음', color: '#b91c1c' },
  normal: { label: '보통', color: '#64748b' },
  low:    { label: '낮음', color: '#94a3b8' },
}

// 개인 TODO 기본 카테고리 (자유 입력 — datalist 제안)
const TODO_CATEGORIES = ['개인', '업무', '스케줄', '회의준비', '학습', '약속', '건강', '거래처', '기타']

interface UnifiedItem {
  source: 'meeting' | 'personal'
  id: string
  content: string
  due_date: string | null
  status: string
  // meeting 전용
  meeting_id?: string
  meeting_title?: string
  meeting_type?: string
  organizer_name?: string | null
  meeting_date?: any
  // personal 전용
  category?: string | null
  priority?: string | null
  memo?: string | null
}

type Toast = { id: number; tone: 'success' | 'error'; text: string }
let __toastId = 0

export default function MyTodoPage() {
  const router = useRouter()
  const [items, setItems] = useState<UnifiedItem[]>([])
  const [stats, setStats] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open' | 'done' | 'dropped' | 'all'>('open')
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'meeting' | 'personal'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [migrationPending, setMigrationPending] = useState(false)

  // 개인 TODO 추가/편집 폼 — editingId null = 신규, id = 편집
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newTodo, setNewTodo] = useState({ content: '', due_date: '', category: '', priority: 'normal', memo: '' })

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
    const actions: UnifiedItem[] = (actionsRes.json?.data || []).map((a: any) => ({
      source: 'meeting' as const,
      id: a.id, content: a.content, due_date: a.due_date, status: a.status,
      meeting_id: a.meeting_id, meeting_title: a.meeting_title,
      meeting_type: a.meeting_type, organizer_name: a.organizer_name, meeting_date: a.meeting_date,
    }))
    const todos: UnifiedItem[] = (todosRes.json?.data || []).map((t: any) => ({
      source: 'personal' as const,
      id: t.id, content: t.content, due_date: t.due_date, status: t.status,
      category: t.category, priority: t.priority, memo: t.memo,
    }))
    setMigrationPending(!!todosRes.json?._migration_pending)
    setItems([...actions, ...todos])
    // 통계 합산
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

  // 사용 중인 카테고리 목록 (개인 TODO 의 unique category)
  const usedCategories = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      if (it.source === 'personal' && it.category && it.category.trim()) set.add(it.category.trim())
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
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter(x =>
        (x.content || '').toLowerCase().includes(q)
        || (x.meeting_title || '').toLowerCase().includes(q)
        || (x.category || '').toLowerCase().includes(q)
        || (x.organizer_name || '').toLowerCase().includes(q)
      )
    }
    return r
  }, [items, search, sourceFilter, categoryFilter])

  // 상태 토글 — source 별 다른 API
  const toggleStatus = useCallback(async (item: UnifiedItem, newStatus: 'open' | 'done' | 'dropped') => {
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

  const deleteTodo = useCallback(async (item: UnifiedItem) => {
    if (item.source !== 'personal') return
    if (!confirm(`「${item.content}」 개인 TODO 를 삭제할까요?`)) return
    const { ok, json } = await fetchWithAuth(`/api/meetings/me/todos?id=${item.id}`, { method: 'DELETE' })
    if (ok) { showToast('success', '✓ 삭제됨'); await load() }
    else showToast('error', `삭제 실패: ${json?.error || '오류'}`)
  }, [load, showToast])

  const resetForm = useCallback(() => {
    setNewTodo({ content: '', due_date: '', category: '', priority: 'normal', memo: '' })
    setEditingId(null)
    setShowAdd(false)
  }, [])

  // 개인 TODO 편집 시작 — 폼에 값 채우고 열기
  const startEdit = useCallback((item: UnifiedItem) => {
    if (item.source !== 'personal') return
    setNewTodo({
      content: item.content || '',
      due_date: item.due_date || '',
      category: item.category || '',
      priority: item.priority || 'normal',
      memo: item.memo || '',
    })
    setEditingId(item.id)
    setShowAdd(true)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const submitNewTodo = useCallback(async () => {
    if (!newTodo.content.trim()) { showToast('error', '내용을 입력하세요'); return }
    const payload = {
      content: newTodo.content.trim(),
      due_date: newTodo.due_date || null,
      category: newTodo.category.trim() || null,
      priority: newTodo.priority || null,
      memo: newTodo.memo.trim() || null,
    }
    // editingId 있으면 PATCH, 없으면 POST
    const { ok, json } = editingId
      ? await fetchWithAuth('/api/meetings/me/todos', {
          method: 'PATCH', body: { id: editingId, ...payload },
        })
      : await fetchWithAuth('/api/meetings/me/todos', {
          method: 'POST', body: payload,
        })
    if (ok) {
      showToast('success', editingId ? '✓ 개인 TODO 수정됨' : '✓ 개인 TODO 추가됨')
      resetForm()
      await load()
    } else if (json?._migration_pending) {
      showToast('error', 'DB 마이그 미적용 — 관리자 문의')
    } else {
      showToast('error', `${editingId ? '수정' : '추가'} 실패: ${json?.error || '오류'}`)
    }
  }, [newTodo, editingId, load, showToast, resetForm])

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

  const columns: TableColumn<UnifiedItem>[] = useMemo(() => ([
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
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
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
            textDecoration: done ? 'line-through' : 'none', fontWeight: 600,
          }}>
            {r.source === 'personal' && r.priority === 'high' && (
              <span style={{ color: '#b91c1c', marginRight: 4 }}>❗</span>
            )}
            {r.content || '(내용 없음)'}
          </span>
        )
      },
    },
    {
      key: 'source', label: '출처', width: 200,
      sortBy: (r) => r.source === 'meeting' ? `1${r.meeting_title || ''}` : `0${r.category || ''}`,
      render: (r) => {
        if (r.source === 'meeting') {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span style={{ flexShrink: 0 }}>{TYPE_EMOJI[r.meeting_type || ''] || '📋'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.meeting_title}</span>
            </span>
          )
        }
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
            padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap',
            background: 'rgba(124,58,237,0.12)', color: '#7c3aed',
          }}>
            📌 개인{r.category ? ` · ${r.category}` : ''}
          </span>
        )
      },
    },
    {
      key: 'due_date', label: '마감일', width: 110,
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
      key: 'actions', label: '액션', width: 110, align: 'right',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
          {r.source === 'meeting' ? (
            <button onClick={(e) => { e.stopPropagation(); if (r.meeting_id) router.push(`/meetings/${r.meeting_id}`) }}
              title="회의록 열기"
              style={{
                padding: '3px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                background: `${COLORS.primary}1A`, color: COLORS.primary,
                border: `1px solid ${COLORS.primary}40`, cursor: 'pointer',
              }}>회의록</button>
          ) : (
            <>
              <button onClick={(e) => { e.stopPropagation(); startEdit(r) }}
                title="개인 TODO 수정"
                style={{
                  padding: '3px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                  background: 'rgba(59,130,246,0.10)', color: '#1d4ed8',
                  border: '1px solid rgba(59,130,246,0.35)', cursor: 'pointer',
                }}>편집</button>
              <button onClick={(e) => { e.stopPropagation(); deleteTodo(r) }}
                title="개인 TODO 삭제"
                style={{
                  padding: '3px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                  background: 'rgba(239,68,68,0.10)', color: '#b91c1c',
                  border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer',
                }}>×</button>
            </>
          )}
        </span>
      ),
    },
  ]), [router, toggleStatus, deleteTodo, startEdit])

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh' }}>
      <DcStatStrip
        stats={statItems}
        actions={[
          { label: '+ 개인 TODO 추가', onClick: () => setShowAdd(v => !v), variant: 'primary', icon: '📌' },
        ]}
      />

      {/* 개인 TODO 추가/편집 폼 */}
      {showAdd && (
        <div style={{ ...GLASS.L3, padding: 14, borderRadius: 12, marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, margin: 0, marginBottom: 10 }}>
            {editingId ? '✏️ 개인 TODO 수정' : '📌 개인 TODO 추가 — 회의와 무관한 개인 할 일 / 스케줄'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input value={newTodo.content} onChange={(e) => setNewTodo(p => ({ ...p, content: e.target.value }))}
              placeholder="할 일 내용 (필수)"
              onKeyDown={(e) => { if (e.key === 'Enter') void submitNewTodo() }}
              style={inputStyle} />
            <input type="date" value={newTodo.due_date} onChange={(e) => setNewTodo(p => ({ ...p, due_date: e.target.value }))}
              title="마감일" style={inputStyle} />
            <input value={newTodo.category} onChange={(e) => setNewTodo(p => ({ ...p, category: e.target.value }))}
              placeholder="분류 (자유 입력)" list="todo-categories" style={inputStyle} />
            <datalist id="todo-categories">
              {TODO_CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
            <select value={newTodo.priority} onChange={(e) => setNewTodo(p => ({ ...p, priority: e.target.value }))}
              style={inputStyle}>
              <option value="high">❗ 높음</option>
              <option value="normal">보통</option>
              <option value="low">낮음</option>
            </select>
          </div>
          {/* 카테고리 빠른 선택 칩 */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {TODO_CATEGORIES.map(c => (
              <button key={c} onClick={() => setNewTodo(p => ({ ...p, category: c }))}
                style={{
                  padding: '3px 10px', fontSize: 11, fontWeight: 600, borderRadius: 99,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  background: newTodo.category === c ? '#7c3aed' : 'rgba(124,58,237,0.10)',
                  color: newTodo.category === c ? '#fff' : '#7c3aed',
                  border: 'none',
                }}>
                {c}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={newTodo.memo} onChange={(e) => setNewTodo(p => ({ ...p, memo: e.target.value }))}
              placeholder="비고 (선택)" style={{ ...inputStyle, flex: 1 }} />
            <button onClick={resetForm}
              style={{ padding: '7px 14px', fontSize: 12, borderRadius: 8, background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, color: COLORS.textSecondary, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              취소
            </button>
            <button onClick={() => void submitNewTodo()}
              style={{ padding: '7px 16px', fontSize: 12, fontWeight: 700, borderRadius: 8, background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {editingId ? '수정' : '추가'}
            </button>
          </div>
        </div>
      )}

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
              style={{
                padding: '6px 10px', fontSize: 12, borderRadius: 8,
                border: `1px solid ${COLORS.borderSubtle}`, background: GLASS.L1.background,
                color: COLORS.textPrimary, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              <option value="all">전체 ({stats.total || 0})</option>
              <option value="meeting">📋 회의 액션 ({stats.meeting_cnt || 0})</option>
              <option value="personal">📌 개인 TODO ({stats.personal_cnt || 0})</option>
            </select>
            {usedCategories.length > 0 && (
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                title="개인 TODO 카테고리 필터"
                style={{
                  padding: '6px 10px', fontSize: 12, borderRadius: 8,
                  border: `1px solid ${COLORS.borderSubtle}`, background: GLASS.L1.background,
                  color: COLORS.textPrimary, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                <option value="all">📂 분류: 전체</option>
                {usedCategories.map(c => <option key={c} value={c}>📂 {c}</option>)}
              </select>
            )}
          </div>
        }
      />

      <NeuDataTable<UnifiedItem>
        columns={columns}
        data={filtered}
        rowKey={(r) => `${r.source}-${r.id}`}
        onRowClick={(r) => { if (r.source === 'meeting' && r.meeting_id) router.push(`/meetings/${r.meeting_id}`) }}
        loading={loading}
        emptyIcon="✓"
        emptyMessage={filter === 'open' ? '진행중 할 일 없음 — 모두 완료!' : '데이터 없음'}
        defaultSort={{ key: 'due_date', dir: 'asc' }}
        mobileCard={{
          title: (r) => r.content || '(내용 없음)',
          subtitle: (r) => r.source === 'meeting'
            ? `${TYPE_EMOJI[r.meeting_type || ''] || '📋'} ${r.meeting_title}`
            : `📌 개인${r.category ? ` · ${r.category}` : ''}`,
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
              {r.source === 'personal' && r.priority && PRIORITY_META[r.priority] && (
                <span style={{ fontSize: 11, color: PRIORITY_META[r.priority].color, whiteSpace: 'nowrap' }}>
                  {PRIORITY_META[r.priority].label}
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

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', fontSize: 12, borderRadius: 8,
  border: `1px solid ${COLORS.borderSubtle}`,
  background: GLASS.L1.background, color: COLORS.textPrimary,
  outline: 'none', fontFamily: 'inherit',
}
