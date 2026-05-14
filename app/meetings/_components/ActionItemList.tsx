'use client'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════
// ActionItemList — V2 액션 아이템 인라인 편집 (PR-V2-A → PR-V2-Ride-2)
//   · 담당자 데이터 소스: ride_employees (인사 마스터)
//   · controlled component (state는 부모)
//   · 인라인 체크: status open ↔ done
//   · content / assignee / due_date 인라인 편집
//
// 변경 이력:
//   · 2026-05-13 V2-A: profiles 기반 시작
//   · 2026-05-13 V2-Ride-2: ride_employees 기반 + profile_id 옵션 + external_assignee fallback
// ═══════════════════════════════════════════════════════════════

interface ActionItem {
  id?: string
  content: string
  assignee_id?: string | null
  external_assignee?: string | null
  due_date?: string | null
  status?: string                // open | done | dropped
  done_at?: string | null
  done_note?: string | null
}

interface Employee {
  /** ride_employees.id — UI select key */
  id: string
  /** profiles.id 옵션 FK */
  profile_id?: string | null
  name: string
  department?: string | null
  position?: string | null
  employment_type?: string | null
  group_label?: string | null
}

interface Props {
  items: ActionItem[]
  onChange: (next: ActionItem[]) => void
  employees: Employee[]
  editable?: boolean
}

export default function ActionItemList({ items, onChange, employees, editable = true }: Props) {
  const add = () => onChange([...items, { content: '', assignee_id: null, due_date: '', status: 'open' }])
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const update = (i: number, patch: Partial<ActionItem>) =>
    onChange(items.map((a, idx) => idx === i ? { ...a, ...patch } : a))

  const toggleDone = (i: number) => {
    const cur = items[i]
    if (cur.status === 'done') {
      update(i, { status: 'open', done_at: null })
    } else {
      update(i, { status: 'done', done_at: new Date().toISOString() })
    }
  }

  const totalDone = items.filter(a => a.status === 'done').length
  const progressPct = items.length === 0 ? 0 : Math.round((totalDone / items.length) * 100)

  return (
    <div style={{ ...GLASS.L3, padding: 14, borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, margin: 0, whiteSpace: 'nowrap' }}>
          ✓ 액션 아이템 ({totalDone}/{items.length}
          {items.length > 0 && <span style={{ color: COLORS.textMuted, fontWeight: 500 }}> · {progressPct}%</span>})
        </h3>
        {editable && (
          <button onClick={add}
            style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
              background: 'rgba(34,197,94,0.10)', color: '#15803d',
              border: '1px solid rgba(34,197,94,0.35)', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>+ 추가</button>
        )}
      </div>

      {items.length === 0 && (
        <div style={{ padding: 16, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
          액션 아이템 없음 — 회의 결과 후속 작업 추가
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((ai, i) => {
          const done = ai.status === 'done'
          const dropped = ai.status === 'dropped'
          return (
            <div key={ai.id || i}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 2fr 1fr 110px 90px 32px',
                gap: 6, alignItems: 'center', fontSize: 12,
                padding: '4px 0',
                opacity: dropped ? 0.5 : 1,
              }}>
              {/* 체크박스 */}
              <button onClick={() => editable && toggleDone(i)} disabled={!editable || dropped}
                title={done ? '완료 해제' : '완료'}
                style={{
                  width: 20, height: 20, borderRadius: 5, cursor: editable && !dropped ? 'pointer' : 'default',
                  background: done ? '#15803d' : 'transparent',
                  border: `2px solid ${done ? '#15803d' : COLORS.borderSubtle}`,
                  color: '#fff', fontSize: 13, fontWeight: 800, lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, padding: 0,
                }}>
                {done ? '✓' : ''}
              </button>

              {/* 내용 */}
              {editable ? (
                <input value={ai.content || ''}
                  onChange={(e) => update(i, { content: e.target.value })}
                  placeholder="할 일 내용"
                  style={{
                    ...cellInput,
                    textDecoration: done ? 'line-through' : 'none',
                    color: done ? COLORS.textMuted : COLORS.textPrimary,
                  }} />
              ) : (
                <span style={{
                  ...cellReadonly,
                  textDecoration: done ? 'line-through' : 'none',
                  color: done ? COLORS.textMuted : COLORS.textPrimary,
                }}>{ai.content}</span>
              )}

              {/* 담당자 — ride_employees 기반 */}
              {editable ? (
                <select
                  value={
                    ai.assignee_id
                      ? `pid:${ai.assignee_id}`
                      : ai.external_assignee
                        ? `ext:${ai.external_assignee}`
                        : ''
                  }
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) {
                      update(i, { assignee_id: null, external_assignee: null })
                      return
                    }
                    const [kind, ...rest] = v.split(':')
                    const value = rest.join(':')
                    if (kind === 'pid') {
                      update(i, { assignee_id: value, external_assignee: null })
                    } else if (kind === 'ext') {
                      update(i, { assignee_id: null, external_assignee: value })
                    }
                  }}
                  style={cellInput}>
                  <option value="">담당자</option>
                  {employees.map(e => {
                    const noProfile = !e.profile_id
                    const optKey = e.profile_id ? `pid:${e.profile_id}` : `ext:${e.name}`
                    const label = `${e.name}${noProfile ? ' (외부)' : ''}`
                    return <option key={e.id} value={optKey}>{label}</option>
                  })}
                </select>
              ) : (
                <span style={cellReadonly}>
                  {employees.find(e => e.profile_id && e.profile_id === ai.assignee_id)?.name
                    || ai.external_assignee
                    || '미정'}
                </span>
              )}

              {/* 마감일 */}
              {editable ? (
                <input type="date" value={ai.due_date || ''}
                  onChange={(e) => update(i, { due_date: e.target.value })}
                  style={cellInput} />
              ) : (
                <span style={cellReadonly}>{ai.due_date || '—'}</span>
              )}

              {/* 상태 */}
              {editable ? (
                <select value={ai.status || 'open'}
                  onChange={(e) => update(i, { status: e.target.value })}
                  style={cellInput}>
                  <option value="open">진행중</option>
                  <option value="done">완료</option>
                  <option value="dropped">취소</option>
                </select>
              ) : (
                <span style={cellReadonly}>{statusLabel(ai.status)}</span>
              )}

              {/* 제거 */}
              {editable ? (
                <button onClick={() => remove(i)} title="제거"
                  style={{
                    padding: '3px 8px', fontSize: 11, borderRadius: 4,
                    background: 'rgba(239,68,68,0.10)', color: '#b91c1c',
                    border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>×</button>
              ) : (
                <span />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const cellInput: React.CSSProperties = {
  padding: '4px 8px', fontSize: 12, borderRadius: 4,
  border: `1px solid ${COLORS.borderSubtle}`,
  background: GLASS.L1.background, color: COLORS.textPrimary,
  outline: 'none', cursor: 'text', fontFamily: 'inherit',
}
const cellReadonly: React.CSSProperties = {
  padding: '4px 8px', fontSize: 12,
  color: COLORS.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}
function statusLabel(s?: string) {
  if (s === 'done') return '완료'
  if (s === 'dropped') return '취소'
  return '진행중'
}
