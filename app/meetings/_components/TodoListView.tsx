'use client'
import { useState, useCallback } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { fmtDate } from '@/lib/format'

// ═══════════════════════════════════════════════════════════════
// TodoListView — 내 TODO 체크리스트 리스트 (PR-MTG-V2-Todo-C)
//   · 표(NeuDataTable) 대신 가벼운 체크리스트 — TODO 다운 UI
//   · 회의 액션 + 개인 TODO 통합
//   · 개인 TODO 인라인 편집 / 인라인 추가 (상단 큰 폼 X)
// ═══════════════════════════════════════════════════════════════

export interface TodoItem {
  source: 'meeting' | 'personal'
  id: string
  content: string
  due_date: string | null
  status: string
  meeting_id?: string
  meeting_title?: string
  meeting_type?: string
  organizer_name?: string | null
  category?: string | null
  priority?: string | null
  memo?: string | null
}

export interface EditDraft {
  content: string
  due_date: string
  category: string
  priority: string
  memo: string
}

interface Props {
  items: TodoItem[]
  loading?: boolean
  emptyMessage?: string
  categories: string[]
  onToggleStatus: (item: TodoItem, newStatus: 'open' | 'done' | 'dropped') => void
  onMeetingOpen: (meetingId: string) => void
  onCreate: (draft: EditDraft) => Promise<void>
  onUpdate: (id: string, draft: EditDraft) => Promise<void>
  onDelete: (item: TodoItem) => void
}

const TYPE_EMOJI: Record<string, string> = {
  regular: '📅', specific: '📋', one_on_one: '👥', department: '🏢',
}
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  open:    { label: '진행중', color: '#1d4ed8', bg: 'rgba(59,130,246,0.12)' },
  done:    { label: '완료',   color: '#15803d', bg: 'rgba(34,197,94,0.12)' },
  dropped: { label: '취소',   color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
}
const EMPTY_DRAFT: EditDraft = { content: '', due_date: '', category: '', priority: 'normal', memo: '' }

export default function TodoListView({
  items, loading, emptyMessage = '할 일이 없습니다',
  categories, onToggleStatus, onMeetingOpen, onCreate, onUpdate, onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft>(EMPTY_DRAFT)
  const [showNew, setShowNew] = useState(false)
  const [busy, setBusy] = useState(false)

  const startEdit = useCallback((it: TodoItem) => {
    setShowNew(false)
    setEditingId(it.id)
    setDraft({
      content: it.content || '',
      due_date: it.due_date || '',
      category: it.category || '',
      priority: it.priority || 'normal',
      memo: it.memo || '',
    })
  }, [])
  const cancelEdit = useCallback(() => { setEditingId(null); setDraft(EMPTY_DRAFT) }, [])
  const startNew = useCallback(() => {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setShowNew(true)
  }, [])

  const saveEdit = useCallback(async () => {
    if (!draft.content.trim() || !editingId) return
    setBusy(true)
    try { await onUpdate(editingId, draft); setEditingId(null); setDraft(EMPTY_DRAFT) }
    finally { setBusy(false) }
  }, [draft, editingId, onUpdate])
  const saveNew = useCallback(async () => {
    if (!draft.content.trim()) return
    setBusy(true)
    try { await onCreate(draft); setShowNew(false); setDraft(EMPTY_DRAFT) }
    finally { setBusy(false) }
  }, [draft, onCreate])

  return (
    <div style={{ ...GLASS.L4, borderRadius: 16, padding: 8 }}>
      {/* 인라인 추가 */}
      {showNew ? (
        <EditForm draft={draft} setDraft={setDraft} categories={categories}
          onSave={saveNew} onCancel={() => setShowNew(false)} busy={busy} mode="new" />
      ) : (
        <button onClick={startNew}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '10px 14px', borderRadius: 10, marginBottom: 4,
            background: 'transparent', border: `1px dashed ${COLORS.borderSubtle}`,
            cursor: 'pointer', color: COLORS.textMuted, fontSize: 13, fontWeight: 600,
            fontFamily: 'inherit',
          }}>
          <span style={{ fontSize: 16 }}>＋</span> 새 개인 TODO 추가
        </button>
      )}

      {loading && (
        <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
          불러오는 중...
        </div>
      )}

      {!loading && items.length === 0 && (
        <div style={{ padding: 36, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
          <div style={{ fontSize: 13, color: COLORS.textMuted }}>{emptyMessage}</div>
        </div>
      )}

      {/* 항목 리스트 */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map(it => {
          if (editingId === it.id) {
            return (
              <EditForm key={it.id} draft={draft} setDraft={setDraft} categories={categories}
                onSave={saveEdit} onCancel={cancelEdit} busy={busy} mode="edit" />
            )
          }
          return <TodoRow key={`${it.source}-${it.id}`} item={it}
            onToggleStatus={onToggleStatus} onMeetingOpen={onMeetingOpen}
            onEdit={startEdit} onDelete={onDelete} />
        })}
      </div>
    </div>
  )
}

// ── 항목 1줄 ─────────────────────────────────────────────────────
function TodoRow({ item, onToggleStatus, onMeetingOpen, onEdit, onDelete }: {
  item: TodoItem
  onToggleStatus: (it: TodoItem, s: 'open' | 'done' | 'dropped') => void
  onMeetingOpen: (id: string) => void
  onEdit: (it: TodoItem) => void
  onDelete: (it: TodoItem) => void
}) {
  const [hover, setHover] = useState(false)
  const done = item.status === 'done'
  const dropped = item.status === 'dropped'
  const isPersonal = item.source === 'personal'

  // 마감일 색상
  let dueColor: string = COLORS.textMuted
  let dueExtra = ''
  if (item.due_date) {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const diff = Math.floor((new Date(item.due_date).getTime() - today.getTime()) / 86400000)
    if (item.status === 'open' && diff < 0) { dueColor = '#b91c1c'; dueExtra = `⚠${Math.abs(diff)}일` }
    else if (item.status === 'open' && diff <= 3) { dueColor = '#b45309'; dueExtra = `D-${diff}` }
    else dueColor = COLORS.textSecondary
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px', borderRadius: 10,
        borderBottom: '1px solid rgba(0,0,0,0.04)',
        background: hover ? 'rgba(0,0,0,0.02)' : 'transparent',
        opacity: dropped ? 0.55 : 1,
      }}>
      {/* 체크박스 */}
      <button onClick={() => !dropped && onToggleStatus(item, done ? 'open' : 'done')}
        disabled={dropped}
        title={done ? '완료 해제' : '완료'}
        style={{
          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
          cursor: dropped ? 'default' : 'pointer',
          background: done ? '#15803d' : 'transparent',
          border: `2px solid ${done ? '#15803d' : COLORS.borderSubtle}`,
          color: '#fff', fontSize: 12, fontWeight: 800, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}>
        {done ? '✓' : ''}
      </button>

      {/* 내용 + 메타 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: done ? COLORS.textMuted : COLORS.textPrimary,
          textDecoration: done ? 'line-through' : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {isPersonal && item.priority === 'high' && <span style={{ color: '#b91c1c', marginRight: 4 }}>❗</span>}
          {item.content || '(내용 없음)'}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 출처 */}
          {item.source === 'meeting' ? (
            <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
              {TYPE_EMOJI[item.meeting_type || ''] || '📋'} {item.meeting_title}
            </span>
          ) : (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99,
              background: 'rgba(124,58,237,0.12)', color: '#7c3aed', whiteSpace: 'nowrap',
            }}>
              📌 개인{item.category ? ` · ${item.category}` : ''}
            </span>
          )}
          {/* 마감일 */}
          {item.due_date && (
            <span style={{ fontSize: 11, color: dueColor, fontWeight: dueExtra ? 700 : 500, whiteSpace: 'nowrap' }}>
              ⏱ {fmtDate(item.due_date)}{dueExtra && ` ${dueExtra}`}
            </span>
          )}
        </div>
      </div>

      {/* 상태 배지 */}
      <span style={{
        flexShrink: 0, padding: '2px 8px', borderRadius: 6,
        fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
        background: (STATUS_META[item.status] || STATUS_META.open).bg,
        color: (STATUS_META[item.status] || STATUS_META.open).color,
      }}>
        {(STATUS_META[item.status] || STATUS_META.open).label}
      </span>

      {/* 액션 (hover) */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0, visibility: hover ? 'visible' : 'hidden' }}>
        {item.source === 'meeting' ? (
          <button onClick={() => item.meeting_id && onMeetingOpen(item.meeting_id)}
            title="회의록 열기"
            style={actionBtn(COLORS.primary)}>회의록</button>
        ) : (
          <>
            <button onClick={() => onEdit(item)} title="편집" style={actionBtn('#1d4ed8')}>편집</button>
            <button onClick={() => onDelete(item)} title="삭제" style={actionBtn('#b91c1c')}>×</button>
          </>
        )}
      </div>
    </div>
  )
}

// ── 인라인 편집/추가 폼 ──────────────────────────────────────────
function EditForm({ draft, setDraft, categories, onSave, onCancel, busy, mode }: {
  draft: EditDraft
  setDraft: (d: EditDraft) => void
  categories: string[]
  onSave: () => void
  onCancel: () => void
  busy: boolean
  mode: 'new' | 'edit'
}) {
  const set = (patch: Partial<EditDraft>) => setDraft({ ...draft, ...patch })
  return (
    <div style={{
      ...GLASS.L3, borderRadius: 10, padding: 12, marginBottom: 4,
      border: `1px solid ${COLORS.primary}40`,
    }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input value={draft.content} onChange={e => set({ content: e.target.value })}
          placeholder={mode === 'new' ? '새 할 일 내용' : '할 일 내용'}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
          style={{ ...inp, flex: 1 }} />
        <input type="date" value={draft.due_date} onChange={e => set({ due_date: e.target.value })}
          title="마감일" style={{ ...inp, width: 140 }} />
        <select value={draft.priority} onChange={e => set({ priority: e.target.value })}
          style={{ ...inp, width: 90 }}>
          <option value="high">❗ 높음</option>
          <option value="normal">보통</option>
          <option value="low">낮음</option>
        </select>
      </div>
      {/* 분류 칩 */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
        {categories.map(c => (
          <button key={c} onClick={() => set({ category: draft.category === c ? '' : c })}
            style={{
              padding: '2px 9px', fontSize: 11, fontWeight: 600, borderRadius: 99,
              cursor: 'pointer', border: 'none', whiteSpace: 'nowrap',
              background: draft.category === c ? '#7c3aed' : 'rgba(124,58,237,0.10)',
              color: draft.category === c ? '#fff' : '#7c3aed',
            }}>{c}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input value={draft.memo} onChange={e => set({ memo: e.target.value })}
          placeholder="비고 (선택)" style={{ ...inp, flex: 1 }} />
        <button onClick={onCancel} disabled={busy}
          style={{ padding: '6px 14px', fontSize: 12, borderRadius: 8, background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, color: COLORS.textSecondary, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          취소
        </button>
        <button onClick={onSave} disabled={busy}
          style={{ padding: '6px 16px', fontSize: 12, fontWeight: 700, borderRadius: 8, background: COLORS.primary, color: '#fff', border: 'none', cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
          {mode === 'new' ? '추가' : '수정'}
        </button>
      </div>
    </div>
  )
}

function actionBtn(color: string): React.CSSProperties {
  return {
    padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 6,
    background: `${color}1A`, color, border: `1px solid ${color}40`,
    cursor: 'pointer', whiteSpace: 'nowrap',
  }
}
const inp: React.CSSProperties = {
  padding: '6px 10px', fontSize: 12, borderRadius: 8,
  border: `1px solid ${COLORS.borderSubtle}`,
  background: GLASS.L1.background, color: COLORS.textPrimary,
  outline: 'none', fontFamily: 'inherit',
}
