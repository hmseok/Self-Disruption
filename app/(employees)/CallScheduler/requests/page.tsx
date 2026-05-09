'use client'
// ═══════════════════════════════════════════════════════════════════
// /CallScheduler/requests — 매니저 직원 요청 통합 검토 페이지 (Phase M-1)
//   3가지 직원 요청을 한 페이지에서 일괄 검토:
//   · 🛌 회피일 (cs_group_member_skip_dates)
//   · 🙋 휴가 (cs_leaves)
//   · 🔄 시프트 교체 (cs_swap_requests)
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '../utils/palette'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { ColorTone, SpecialCode } from '../utils/types'
import { SPECIAL_LABEL } from '../utils/types'

export const dynamic = 'force-dynamic'

type Tab = 'skip' | 'leave' | 'swap'
type StatusFilter = 'pending' | 'approved' | 'all'

const LEAVE_LABEL: Record<string, string> = {
  annual: '연차', familyday: '패밀리데이', sick: '병가',
  unpaid: '무급', family: '경조', holiday: '공휴일 휴무', other: '기타',
}
const AM_PM_LABEL: Record<string, string> = { full: '종일', am: '오전반차', pm: '오후반차' }

interface SkipRow {
  id: string; group_id: string; worker_id: string
  start_date: string; end_date: string; reason: string | null
  status: 'requested' | 'approved' | 'rejected' | 'canceled'
  worker_name: string | null; worker_tone: ColorTone | null; group_name: string | null
}
interface LeaveRow {
  id: string; worker_id: string; worker_name: string; worker_tone: ColorTone
  group_label: string | null
  leave_type: string; start_date: string; end_date: string
  am_pm: 'full' | 'am' | 'pm'; reason: string | null
  status: string; created_at: string
}
interface SwapRow {
  id: string; worker_id: string; worker_name: string; worker_tone: ColorTone
  group_label: string | null
  request_date: string; reason: string | null
  status: string; created_at: string
  schedule_id?: string
  // 교체 대상 (있으면)
  shift_slot_id?: string
  preferred_swap?: string | null
}

export default function RequestsPage() {
  const [tab, setTab] = useState<Tab>('skip')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [skips, setSkips] = useState<SkipRow[]>([])
  const [leaves, setLeaves] = useState<LeaveRow[]>([])
  const [swaps, setSwaps] = useState<SwapRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const today = new Date()
      const monthStart = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`
      const future = new Date(today); future.setDate(future.getDate() + 90)
      const futureEnd = `${future.getFullYear()}-${String(future.getMonth()+1).padStart(2,'0')}-${String(future.getDate()).padStart(2,'0')}`

      // 회피일 — status 매핑 (skip 의 'requested' = pending)
      const skipStatusParam = statusFilter === 'pending' ? 'requested'
                            : statusFilter === 'approved' ? 'approved'
                            : 'requested,approved,rejected,canceled'
      // 휴가/교체 — status 그대로 (pending/approved/rejected)
      const leaveStatusParam = statusFilter === 'all' ? 'pending,approved,rejected' : statusFilter

      const [skipRes, leaveRes, swapRes] = await Promise.all([
        fetch(`/api/call-scheduler/skip-dates?from=${monthStart}&to=${futureEnd}&status=${skipStatusParam}`, { headers: auth }),
        fetch(`/api/call-scheduler/leaves?status=${leaveStatusParam}`, { headers: auth }),
        fetch(`/api/call-scheduler/swap-requests?status=${leaveStatusParam}`, { headers: auth }),
      ])
      const skipJ = await skipRes.json()
      const leaveJ = await leaveRes.json()
      const swapJ = await swapRes.json()
      if (skipRes.ok) setSkips(skipJ.data || [])
      if (leaveRes.ok) setLeaves(leaveJ.data || [])
      if (swapRes.ok) setSwaps(swapJ.data || [])
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [statusFilter])

  // 카운트
  const skipPending = skips.filter(s => s.status === 'requested').length
  const leavePending = leaves.filter(l => l.status === 'pending').length
  const swapPending = swaps.filter(s => s.status === 'pending').length
  const totalPending = skipPending + leavePending + swapPending

  // 회피 status 변경
  const updateSkip = async (skip: SkipRow, status: 'approved' | 'rejected') => {
    setBusy(`skip-${skip.id}`); setMsg(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/shift-groups/${skip.group_id}/skip-dates/${skip.id}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ status }) },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      setMsg({ ok: true, text: `${skip.worker_name || '워커'} 회피일 ${status === 'approved' ? '승인' : '거절'}` })
      load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || '오류' }) }
    finally { setBusy(null) }
  }

  // 휴가 / 교체 status 변경 (공통)
  const resolve = async (kind: 'leave' | 'swap', id: string, action: 'approve' | 'reject', name: string) => {
    setBusy(`${kind}-${id}`); setMsg(null)
    try {
      const auth = await getAuthHeader()
      const url = kind === 'leave'
        ? `/api/call-scheduler/leaves/${id}`
        : `/api/call-scheduler/swap-requests/${id}`
      const status = action === 'approve' ? 'approved' : 'rejected'
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ status, resolution_note: null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      setMsg({ ok: true, text: `${name} ${kind === 'leave' ? '휴가' : '교체'} ${action === 'approve' ? '승인' : '거절'}` })
      load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || '오류' }) }
    finally { setBusy(null) }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <Link href="/CallScheduler" style={{ fontSize: 12, color: COLORS.info, textDecoration: 'none' }}>
            ← 매트릭스로
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: '6px 0' }}>
            📋 직원 요청 통합 검토
            {totalPending > 0 && (
              <span style={{ ...pillStyle('warning'), fontSize: 12, marginLeft: 8 }}>
                대기 {totalPending}건
              </span>
            )}
          </h1>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            회피일 / 휴가 / 시프트 교체 — 한 화면에서 일괄 처리
          </div>
        </div>

        {/* 상태 필터 */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['pending', 'approved', 'all'] as const).map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
                    style={{
                      padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                      background: statusFilter === s ? COLORS.primary : 'rgba(255,255,255,0.6)',
                      color: statusFilter === s ? '#fff' : COLORS.textSecondary,
                      border: `1px solid ${statusFilter === s ? COLORS.primary : COLORS.borderFaint}`,
                      cursor: 'pointer',
                    }}>
              {s === 'pending' ? '⏳ 대기' : s === 'approved' ? '✓ 승인됨' : '전체'}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 12, padding: 4, borderRadius: 10,
        ...GLASS.L4, width: 'fit-content',
      }}>
        {([
          { v: 'skip',  emoji: '🛌', label: '회피일', count: skipPending },
          { v: 'leave', emoji: '🙋', label: '휴가',  count: leavePending },
          { v: 'swap',  emoji: '🔄', label: '교체',  count: swapPending },
        ] as const).map(t => (
          <button key={t.v} type="button" onClick={() => setTab(t.v)}
                  style={{
                    padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700,
                    background: tab === t.v ? COLORS.primary : 'transparent',
                    color: tab === t.v ? '#fff' : COLORS.textSecondary,
                    border: 'none', cursor: 'pointer',
                  }}>
            {t.emoji} {t.label}
            {t.count > 0 && (
              <span style={{
                marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 99, fontWeight: 800,
                background: tab === t.v ? 'rgba(255,255,255,0.25)' : COLORS.bgAmber,
                color: tab === t.v ? '#fff' : COLORS.warning,
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger, fontSize: 13,
        }}>❌ {error}</div>
      )}
      {msg && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: msg.ok ? COLORS.bgGreen : COLORS.bgRed,
          border: `1px solid ${msg.ok ? COLORS.borderGreen : COLORS.borderRed}`,
          color: msg.ok ? COLORS.success : COLORS.danger,
          fontSize: 13, display: 'flex', justifyContent: 'space-between',
        }}>
          <span>{msg.ok ? '✅' : '❌'} {msg.text}</span>
          <button onClick={() => setMsg(null)} style={{
            background: 'transparent', border: 'none', color: COLORS.textMuted,
            cursor: 'pointer', fontSize: 14,
          }}>×</button>
        </div>
      )}

      {loading ? (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 60, textAlign: 'center', color: COLORS.textMuted }}>
          로딩...
        </div>
      ) : (
        <>
          {/* 🛌 회피일 */}
          {tab === 'skip' && (
            skips.length === 0
              ? <EmptyHint text="회피일 신청이 없습니다." />
              : <SkipList rows={skips} busy={busy} onUpdate={updateSkip} />
          )}

          {/* 🙋 휴가 */}
          {tab === 'leave' && (
            leaves.length === 0
              ? <EmptyHint text="휴가 신청이 없습니다." />
              : <LeaveList rows={leaves} busy={busy} onResolve={resolve} />
          )}

          {/* 🔄 교체 */}
          {tab === 'swap' && (
            swaps.length === 0
              ? <EmptyHint text="시프트 교체 요청이 없습니다." />
              : <SwapList rows={swaps} busy={busy} onResolve={resolve} />
          )}
        </>
      )}
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, padding: 60, textAlign: 'center',
      color: COLORS.textMuted,
    }}>{text}</div>
  )
}

// ── 회피일 list ────────────────────────────────────────────────────
function SkipList({ rows, busy, onUpdate }: {
  rows: SkipRow[]
  busy: string | null
  onUpdate: (s: SkipRow, status: 'approved' | 'rejected') => void
}) {
  // 그룹별 묶기
  const byGroup = rows.reduce((acc: Record<string, SkipRow[]>, r) => {
    const k = r.group_name || '(이름없음)'
    acc[k] = acc[k] || []; acc[k].push(r); return acc
  }, {})
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Object.entries(byGroup).map(([groupName, list]) => (
        <div key={groupName} style={{ ...GLASS.L4, borderRadius: 12, padding: 14 }}>
          <div style={{
            fontSize: 14, fontWeight: 800, color: COLORS.textPrimary,
            marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${COLORS.borderFaint}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            🚧 {groupName}
            <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted }}>{list.length}건</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.map(r => {
              const isApproved = r.status === 'approved'
              const isPending = r.status === 'requested'
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 8,
                  background: isPending ? COLORS.bgAmber : isApproved ? COLORS.bgGreen : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${isPending ? COLORS.borderAmber : isApproved ? COLORS.borderGreen : COLORS.borderFaint}`,
                }}>
                  <span style={pillStyle(isPending ? 'warning' : isApproved ? 'success' : 'neutral')}>
                    {isPending ? '⏳ 대기' : isApproved ? '✓ 승인' : r.status === 'rejected' ? '✗ 거절' : '취소'}
                  </span>
                  {r.worker_tone && (
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 4,
                      background: TONE_BG[r.worker_tone] !== 'transparent' ? TONE_BG[r.worker_tone] : undefined,
                      color: TONE_TEXT[r.worker_tone] || COLORS.textPrimary,
                    }}>
                      {r.worker_name || '(이름없음)'}
                    </span>
                  )}
                  <span style={{ flex: 1, fontSize: 13, color: COLORS.textPrimary }}>
                    {r.start_date}{r.start_date !== r.end_date && ` ~ ${r.end_date}`}
                    {r.reason && (
                      <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 8, fontStyle: 'italic' }}>
                        — {r.reason}
                      </span>
                    )}
                  </span>
                  {isPending && (
                    <ResolveButtons
                      busyKey={busy === `skip-${r.id}`}
                      onApprove={() => onUpdate(r, 'approved')}
                      onReject={() => onUpdate(r, 'rejected')}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 휴가 list ──────────────────────────────────────────────────────
function LeaveList({ rows, busy, onResolve }: {
  rows: LeaveRow[]
  busy: string | null
  onResolve: (kind: 'leave' | 'swap', id: string, action: 'approve' | 'reject', name: string) => void
}) {
  return (
    <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(r => {
        const isPending = r.status === 'pending'
        const isApproved = r.status === 'approved'
        return (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 8,
            background: isPending ? COLORS.bgAmber : isApproved ? COLORS.bgGreen : 'rgba(0,0,0,0.03)',
            border: `1px solid ${isPending ? COLORS.borderAmber : isApproved ? COLORS.borderGreen : COLORS.borderFaint}`,
          }}>
            <span style={pillStyle(isPending ? 'warning' : isApproved ? 'success' : 'neutral')}>
              {isPending ? '⏳ 대기' : isApproved ? '✓ 승인' : '✗ 거절'}
            </span>
            <span style={{
              fontSize: 13, fontWeight: 700,
              padding: '2px 8px', borderRadius: 4,
              background: TONE_BG[r.worker_tone] !== 'transparent' ? TONE_BG[r.worker_tone] : undefined,
              color: TONE_TEXT[r.worker_tone] || COLORS.textPrimary,
            }}>
              {r.worker_name}
            </span>
            <span style={{
              fontSize: 11, padding: '2px 7px', borderRadius: 99, fontWeight: 700,
              background: COLORS.bgBlue, color: COLORS.info, border: `1px solid ${COLORS.borderBlue}`,
            }}>
              {LEAVE_LABEL[r.leave_type] || r.leave_type}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: COLORS.textPrimary }}>
              {r.start_date}{r.start_date !== r.end_date && ` ~ ${r.end_date}`}
              <span style={{ marginLeft: 6, fontSize: 11, color: COLORS.textMuted }}>
                ({AM_PM_LABEL[r.am_pm] || r.am_pm})
              </span>
              {r.reason && (
                <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 8, fontStyle: 'italic' }}>
                  — {r.reason}
                </span>
              )}
            </span>
            {isPending && (
              <ResolveButtons
                busyKey={busy === `leave-${r.id}`}
                onApprove={() => onResolve('leave', r.id, 'approve', r.worker_name)}
                onReject={() => onResolve('leave', r.id, 'reject', r.worker_name)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 교체 list ──────────────────────────────────────────────────────
function SwapList({ rows, busy, onResolve }: {
  rows: SwapRow[]
  busy: string | null
  onResolve: (kind: 'leave' | 'swap', id: string, action: 'approve' | 'reject', name: string) => void
}) {
  return (
    <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(r => {
        const isPending = r.status === 'pending'
        const isApproved = r.status === 'approved'
        return (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 8,
            background: isPending ? COLORS.bgAmber : isApproved ? COLORS.bgGreen : 'rgba(0,0,0,0.03)',
            border: `1px solid ${isPending ? COLORS.borderAmber : isApproved ? COLORS.borderGreen : COLORS.borderFaint}`,
          }}>
            <span style={pillStyle(isPending ? 'warning' : isApproved ? 'success' : 'neutral')}>
              {isPending ? '⏳ 대기' : isApproved ? '✓ 승인' : '✗ 거절'}
            </span>
            <span style={{
              fontSize: 13, fontWeight: 700,
              padding: '2px 8px', borderRadius: 4,
              background: TONE_BG[r.worker_tone] !== 'transparent' ? TONE_BG[r.worker_tone] : undefined,
              color: TONE_TEXT[r.worker_tone] || COLORS.textPrimary,
            }}>
              {r.worker_name}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: COLORS.textPrimary }}>
              {r.request_date}
              {r.preferred_swap && (
                <span style={{ fontSize: 11, color: COLORS.info, marginLeft: 6, fontWeight: 700 }}>
                  → 희망: {r.preferred_swap}
                </span>
              )}
              {r.reason && (
                <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 8, fontStyle: 'italic' }}>
                  — {r.reason}
                </span>
              )}
            </span>
            {isPending && (
              <ResolveButtons
                busyKey={busy === `swap-${r.id}`}
                onApprove={() => onResolve('swap', r.id, 'approve', r.worker_name)}
                onReject={() => onResolve('swap', r.id, 'reject', r.worker_name)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 공통 [✓ 승인] [✗ 거절] 버튼 ────────────────────────────────────
function ResolveButtons({ busyKey, onApprove, onReject }: {
  busyKey: boolean
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <>
      <button type="button" disabled={busyKey} onClick={onApprove}
              style={{
                ...BTN.md, background: COLORS.success, color: '#fff',
                border: 'none', cursor: busyKey ? 'not-allowed' : 'pointer',
                opacity: busyKey ? 0.6 : 1,
              }}>
        ✓ 승인
      </button>
      <button type="button" disabled={busyKey} onClick={onReject}
              style={{
                ...BTN.md, background: 'transparent', color: COLORS.danger,
                border: `1px solid ${COLORS.borderRed}`,
                cursor: busyKey ? 'not-allowed' : 'pointer',
                opacity: busyKey ? 0.6 : 1,
              }}>
        ✗ 거절
      </button>
    </>
  )
}
