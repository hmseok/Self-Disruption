'use client'
// ═══════════════════════════════════════════════════════════════════
// EmployeeRequestsPanel — 직원 요청 통합 (휴가 + 시프트 교체)
// REFACTORING.md A-1: 매니저 [⋯] 메뉴에서 한 곳으로 처리
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '../utils/palette'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { ColorTone, SpecialCode } from '../utils/types'
import { SPECIAL_LABEL } from '../utils/types'

interface Props {
  open: boolean
  onClose: () => void
  scheduleId: string
  onChanged: () => void  // 승인/반려 후 부모 reload
}

interface PendingLeave {
  id: string
  worker_id: string
  worker_name: string
  worker_tone: ColorTone
  group_label: string | null
  leave_type: string
  start_date: string
  end_date: string
  am_pm: 'full' | 'am' | 'pm'
  reason: string | null
  status: string
  created_at: string
}

interface PendingSwap {
  id: string
  worker_id: string
  worker_name: string
  worker_tone: ColorTone
  group_label: string | null
  request_date: string
  reason: string | null
  status: string
  created_at: string
}

const LEAVE_LABEL: Record<string, string> = {
  annual: '연차', familyday: '패밀리데이', sick: '병가', unpaid: '무급',
  family: '경조', holiday: '공휴일 휴무', other: '기타',
}
const AM_PM_LABEL: Record<string, string> = { full: '종일', am: '오전반차', pm: '오후반차' }

export default function EmployeeRequestsPanel({ open, onClose, scheduleId, onChanged }: Props) {
  const [tab, setTab] = useState<'leave' | 'swap'>('leave')
  const [leaves, setLeaves] = useState<PendingLeave[]>([])
  const [swaps, setSwaps] = useState<PendingSwap[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [noteFor, setNoteFor] = useState<{ kind: 'leave' | 'swap'; id: string; action: 'approve' | 'reject' } | null>(null)
  const [noteText, setNoteText] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const auth = await getAuthHeader()
      const [lRes, sRes] = await Promise.all([
        fetch(`/api/call-scheduler/leaves?status=pending`, { headers: auth }),
        fetch(`/api/call-scheduler/swap-requests?status=pending&schedule_id=${scheduleId}`, { headers: auth }),
      ])
      const lJ = await lRes.json()
      const sJ = await sRes.json()
      if (lRes.ok) setLeaves(lJ.data || [])
      if (sRes.ok) setSwaps(sJ.data || [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { if (open) load() }, [open, scheduleId])

  if (!open) return null

  const total = leaves.length + swaps.length

  const resolve = async (kind: 'leave' | 'swap', id: string, action: 'approve' | 'reject', note?: string) => {
    setBusy(`${kind}-${id}-${action}`); setMsg(null)
    try {
      const auth = await getAuthHeader()
      const url = kind === 'leave'
        ? `/api/call-scheduler/leaves/${id}`
        : `/api/call-scheduler/swap-requests/${id}`
      const status = action === 'approve' ? 'approved' : 'rejected'
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ status, resolution_note: note ?? null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '처리 실패')
      setMsg({
        ok: true,
        text: `${kind === 'leave' ? '휴가' : '시프트 교체'} ${action === 'approve' ? '승인' : '반려'} 완료`,
      })
      await load()
      onChanged()
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || '오류' })
    } finally {
      setBusy(null)
      setNoteFor(null); setNoteText('')
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...GLASS.L4, width: 720, maxWidth: '94vw', maxHeight: '90vh',
        borderRadius: 16, padding: 22, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
              📥 직원 요청 ({total}건 대기)
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
              승인 시 자동으로 캘린더에 반영됩니다.
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'transparent', border: `1px solid ${COLORS.borderFaint}`,
            cursor: 'pointer', color: COLORS.textSecondary, fontSize: 16,
          }}>×</button>
        </div>

        {/* 탭 */}
        <div style={{
          display: 'flex', borderBottom: `1px solid ${COLORS.borderFaint}`, gap: 4,
        }}>
          <button onClick={() => setTab('leave')}
                  style={{
                    padding: '8px 14px', fontSize: 13, fontWeight: 700,
                    background: 'transparent', border: 'none',
                    color: tab === 'leave' ? COLORS.primary : COLORS.textSecondary,
                    borderBottom: `2px solid ${tab === 'leave' ? COLORS.primary : 'transparent'}`,
                    cursor: 'pointer', marginBottom: -1,
                  }}>
            📋 휴가 신청 ({leaves.length})
          </button>
          <button onClick={() => setTab('swap')}
                  style={{
                    padding: '8px 14px', fontSize: 13, fontWeight: 700,
                    background: 'transparent', border: 'none',
                    color: tab === 'swap' ? COLORS.primary : COLORS.textSecondary,
                    borderBottom: `2px solid ${tab === 'swap' ? COLORS.primary : 'transparent'}`,
                    cursor: 'pointer', marginBottom: -1,
                  }}>
            🙋 시프트 교체 ({swaps.length})
          </button>
        </div>

        {msg && (
          <div style={{
            ...GLASS.L3,
            background: msg.ok ? COLORS.bgGreen : COLORS.bgRed,
            border: `1px solid ${msg.ok ? COLORS.borderGreen : COLORS.borderRed}`,
            borderRadius: 8, padding: '8px 14px',
            fontSize: 13, fontWeight: 700,
            color: msg.ok ? COLORS.success : COLORS.danger,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{msg.ok ? '✅ ' : '❌ '}{msg.text}</span>
            <button onClick={() => setMsg(null)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer', color: COLORS.textMuted,
            }}>×</button>
          </div>
        )}

        {/* 본문 */}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tab === 'leave' && (
              leaves.length === 0 ? (
                <EmptyState text="대기 중인 휴가 신청이 없습니다." />
              ) : (
                leaves.map(l => (
                  <RequestRow key={l.id}
                              busy={busy === `leave-${l.id}-approve` || busy === `leave-${l.id}-reject`}
                              worker={{ name: l.worker_name, tone: l.worker_tone, group: l.group_label }}
                              title={`${LEAVE_LABEL[l.leave_type] || l.leave_type} · ${AM_PM_LABEL[l.am_pm]}`}
                              dateRange={l.start_date === l.end_date ? l.start_date : `${l.start_date} ~ ${l.end_date}`}
                              reason={l.reason}
                              createdAt={l.created_at}
                              onApprove={() => resolve('leave', l.id, 'approve')}
                              onReject={() => { setNoteFor({ kind: 'leave', id: l.id, action: 'reject' }); setNoteText('') }}
                  />
                ))
              )
            )}
            {tab === 'swap' && (
              swaps.length === 0 ? (
                <EmptyState text="대기 중인 시프트 교체 요청이 없습니다." />
              ) : (
                swaps.map(s => (
                  <RequestRow key={s.id}
                              busy={busy === `swap-${s.id}-approve` || busy === `swap-${s.id}-reject`}
                              worker={{ name: s.worker_name, tone: s.worker_tone, group: s.group_label }}
                              title="🔄 시프트 교체 요청"
                              dateRange={s.request_date}
                              reason={s.reason}
                              createdAt={s.created_at}
                              onApprove={() => resolve('swap', s.id, 'approve')}
                              onReject={() => { setNoteFor({ kind: 'swap', id: s.id, action: 'reject' }); setNoteText('') }}
                  />
                ))
              )
            )}
          </div>
        )}
      </div>

      {/* 반려 메모 모달 */}
      {noteFor && (
        <div onClick={() => setNoteFor(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            ...GLASS.L4, width: 420, borderRadius: 12, padding: 18,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
              반려 사유 (선택)
            </div>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
                      rows={3}
                      style={{
                        ...GLASS.L1, padding: '8px 12px', borderRadius: 8,
                        fontSize: 13, color: COLORS.textPrimary, outline: 'none',
                        resize: 'vertical', fontFamily: 'inherit',
                      }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button onClick={() => setNoteFor(null)} style={{
                ...BTN.sm, background: 'transparent', color: COLORS.textSecondary,
                border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
              }}>취소</button>
              <button onClick={() => resolve(noteFor.kind, noteFor.id, 'reject', noteText.trim() || undefined)}
                      style={{
                        ...BTN.sm, background: COLORS.danger, color: '#fff',
                        border: 'none', cursor: 'pointer',
                      }}>
                반려
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RequestRow({
  busy, worker, title, dateRange, reason, createdAt, onApprove, onReject,
}: {
  busy: boolean
  worker: { name: string; tone: ColorTone; group: string | null }
  title: string
  dateRange: string
  reason: string | null
  createdAt: string
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div style={{
      ...GLASS.L1, borderRadius: 10, padding: 12,
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{
            color: TONE_TEXT[worker.tone], fontWeight: 700, fontSize: 13,
            background: TONE_BG[worker.tone] !== 'transparent' ? TONE_BG[worker.tone] : undefined,
            padding: '2px 8px', borderRadius: 4,
          }}>{worker.name}</span>
          {worker.group && (
            <span style={{ fontSize: 10, color: COLORS.textMuted }}>{worker.group}</span>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>{title}</div>
        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2, fontFamily: 'monospace' }}>
          {dateRange}
        </div>
        {reason && (
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4, fontStyle: 'italic' }}>
            "{reason}"
          </div>
        )}
        <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>
          신청 {new Date(createdAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexDirection: 'column' }}>
        <button onClick={onApprove} disabled={busy}
                style={{
                  ...BTN.sm, background: COLORS.success, color: '#fff', border: 'none',
                  cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}>
          ✓ 승인
        </button>
        <button onClick={onReject} disabled={busy}
                style={{
                  ...BTN.sm, background: 'transparent', color: COLORS.danger,
                  border: `1px solid ${COLORS.borderRed}`,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}>
          ✗ 반려
        </button>
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: 30, textAlign: 'center', fontSize: 12, color: COLORS.textMuted,
      background: COLORS.bgGray, borderRadius: 8,
    }}>
      {text}
    </div>
  )
}
