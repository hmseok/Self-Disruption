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
  // N-4 — 거절 사유 입력 모달
  const [rejectModal, setRejectModal] = useState<{
    kind: 'skip' | 'leave' | 'swap'
    name: string
    onConfirm: (note: string | null) => void
  } | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  // N-15 — 매니저 직접 등록 (회피일)
  const [workers, setWorkers] = useState<Array<{ id: string; name: string; color_tone: ColorTone }>>([])
  // N-59 — 같은 이름 그룹 구별을 위한 shift 정보 포함
  const [groups, setGroups] = useState<Array<{
    id: string; name: string; member_ids: string[]
    shift_code?: string | null; shift_start?: string | null; shift_end?: string | null
    category?: string | null
  }>>([])
  const [regWorkerId, setRegWorkerId] = useState<string>('')
  const [regGroupId, setRegGroupId] = useState<string>('')
  const [regStart, setRegStart] = useState<string>('')
  const [regEnd, setRegEnd] = useState<string>('')
  const [regReason, setRegReason] = useState<string>('')
  const [regBusy, setRegBusy] = useState(false)

  // N-15 — 워커/그룹 fetch (회피일 직접 등록용)
  useEffect(() => {
    let abort = false
    ;(async () => {
      try {
        const auth = await getAuthHeader()
        const [wR, gR] = await Promise.all([
          fetch('/api/call-scheduler/workers', { headers: auth }),
          fetch('/api/call-scheduler/shift-groups', { headers: auth }),
        ])
        if (abort) return
        const wJ = wR.ok ? await wR.json() : { data: [] }
        const gJ = gR.ok ? await gR.json() : { data: [] }
        setWorkers((wJ.data || []).map((w: any) => ({
          id: w.id, name: w.name, color_tone: w.color_tone || 'none',
        })))
        setGroups((gJ.data || []).filter((g: any) => g.is_active !== false).map((g: any) => ({
          id: g.id, name: g.name,
          member_ids: Array.isArray(g.members) ? g.members.map((m: any) => m.id) : [],
          // N-59 — 같은 이름 그룹 구별 위한 shift 정보
          shift_code: g.slot_code || null,
          shift_start: g.start_time || null,
          shift_end: g.end_time || null,
          category: g.category || null,
        })))
      } catch { /* graceful */ }
    })()
    return () => { abort = true }
  }, [])

  // N-15 — 워커 선택 시 그 워커가 속한 그룹만 자동 chip
  const regWorkerGroups = workers.length > 0 && regWorkerId
    ? groups.filter(g => g.member_ids.includes(regWorkerId))
    : []

  // N-49 — 휴가 직접 등록 (워커 + 일자 + 사유 → POST /api/.../leaves)
  const [regLeaveWorkerId, setRegLeaveWorkerId] = useState<string>('')
  const [regLeaveStart, setRegLeaveStart] = useState<string>('')
  const [regLeaveEnd, setRegLeaveEnd] = useState<string>('')
  const [regLeaveReason, setRegLeaveReason] = useState<string>('')
  const [regLeaveBusy, setRegLeaveBusy] = useState(false)
  const registerLeave = async () => {
    if (!regLeaveWorkerId || !regLeaveStart || !regLeaveEnd) {
      setMsg({ ok: false, text: '워커 / 시작일 / 종료일 모두 필수' })
      return
    }
    if (regLeaveStart > regLeaveEnd) {
      setMsg({ ok: false, text: '시작일이 종료일보다 이후입니다' })
      return
    }
    setRegLeaveBusy(true); setMsg(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/leaves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          worker_id: regLeaveWorkerId,
          leave_type: 'annual',
          start_date: regLeaveStart,
          end_date: regLeaveEnd,
          am_pm: 'full',
          reason: regLeaveReason.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '등록 실패')
      const wName = workers.find(w => w.id === regLeaveWorkerId)?.name || ''
      setMsg({ ok: true, text: `${wName} 연차 등록 — ${regLeaveStart}${regLeaveStart !== regLeaveEnd ? ` ~ ${regLeaveEnd}` : ''}` })
      setRegLeaveStart(''); setRegLeaveEnd(''); setRegLeaveReason('')
      load()
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || '오류' })
    } finally { setRegLeaveBusy(false) }
  }

  // N-15 + N-60 — 매니저 직접 등록 (글로벌 회피일 — 모든 그룹 적용)
  //   사용자 정책: "그룹별 없애고 직원 요청 통합 → 전역 셋팅"
  //   → /api/call-scheduler/skip-dates 글로벌 API 호출 (group_id=NULL)
  const registerSkip = async () => {
    if (!regWorkerId || !regStart || !regEnd) {
      setMsg({ ok: false, text: '워커 / 시작일 / 종료일 모두 필수' })
      return
    }
    if (regStart > regEnd) {
      setMsg({ ok: false, text: '시작일이 종료일보다 이후입니다' })
      return
    }
    setRegBusy(true); setMsg(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/skip-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          worker_id: regWorkerId,
          start_date: regStart,
          end_date: regEnd,
          reason: regReason.trim() || null,
          status: 'approved',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '등록 실패')
      const wName = workers.find(w => w.id === regWorkerId)?.name || ''
      setMsg({ ok: true, text: `${wName} 회피일 등록 (전역) — ${regStart}${regStart !== regEnd ? ` ~ ${regEnd}` : ''}` })
      // 폼 리셋 (워커는 유지 — 연속 입력 편의)
      setRegStart(''); setRegEnd(''); setRegReason('')
      load()
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || '오류' })
    } finally { setRegBusy(false) }
  }

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

  // N-50 — 회피일 「승인/거절 취소」 (대기로 되돌림) + 삭제
  const revertSkip = async (skip: SkipRow) => {
    if (!confirm(`${skip.worker_name || '워커'} 회피일 승인/거절 취소 (대기로 되돌림)?`)) return
    setBusy(`skip-${skip.id}`); setMsg(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/shift-groups/${skip.group_id}/skip-dates/${skip.id}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ status: 'requested' }) },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      setMsg({ ok: true, text: `${skip.worker_name || '워커'} 회피일 대기로 되돌림` })
      load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || '오류' }) }
    finally { setBusy(null) }
  }
  const deleteSkip = async (skip: SkipRow) => {
    if (!confirm(`${skip.worker_name || '워커'} 회피일 완전 삭제 — 되돌릴 수 없음. 계속?`)) return
    setBusy(`skip-${skip.id}`); setMsg(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/shift-groups/${skip.group_id}/skip-dates/${skip.id}`,
        { method: 'DELETE', headers: auth },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      setMsg({ ok: true, text: `${skip.worker_name || '워커'} 회피일 삭제` })
      load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || '오류' }) }
    finally { setBusy(null) }
  }
  // N-50 — 연차 「승인/거절 취소」 + 삭제
  const revertLeave = async (leave: LeaveRow) => {
    if (!confirm(`${leave.worker_name} 연차 승인/거절 취소 (대기로 되돌림)?`)) return
    setBusy(`leave-${leave.id}`); setMsg(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/leaves/${leave.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ status: 'pending' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      setMsg({ ok: true, text: `${leave.worker_name} 연차 대기로 되돌림` })
      load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || '오류' }) }
    finally { setBusy(null) }
  }
  const deleteLeave = async (leave: LeaveRow) => {
    if (!confirm(`${leave.worker_name} 연차 완전 삭제 — 되돌릴 수 없음. 계속?`)) return
    setBusy(`leave-${leave.id}`); setMsg(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/leaves/${leave.id}`, {
        method: 'DELETE', headers: auth,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      setMsg({ ok: true, text: `${leave.worker_name} 연차 삭제` })
      load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || '오류' }) }
    finally { setBusy(null) }
  }

  // 회피 status 변경
  const updateSkip = async (skip: SkipRow, status: 'approved' | 'rejected', note?: string | null) => {
    setBusy(`skip-${skip.id}`); setMsg(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/shift-groups/${skip.group_id}/skip-dates/${skip.id}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ status, ...(note != null ? { reason: note } : {}) }) },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      setMsg({ ok: true, text: `${skip.worker_name || '워커'} 회피일 ${status === 'approved' ? '승인' : '거절'}` })
      load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || '오류' }) }
    finally { setBusy(null) }
  }

  // 휴가 / 교체 status 변경 (공통, note 포함)
  const resolve = async (kind: 'leave' | 'swap', id: string, action: 'approve' | 'reject', name: string, note?: string | null) => {
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
        body: JSON.stringify({ status, resolution_note: note ?? null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      setMsg({ ok: true, text: `${name} ${kind === 'leave' ? '휴가' : '교체'} ${action === 'approve' ? '승인' : '거절'}` })
      load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || '오류' }) }
    finally { setBusy(null) }
  }

  // N-4 — 거절 시 사유 모달 띄움
  const openRejectModal = (kind: 'skip' | 'leave' | 'swap', name: string, onConfirm: (note: string | null) => void) => {
    setRejectNote('')
    setRejectModal({ kind, name, onConfirm })
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      {/* N-12 — 자체 헤더 제거 (PageTitle 자동) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        marginBottom: 12, flexWrap: 'wrap', gap: 8,
      }}>
        {/* 상태 필터 */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['pending', 'approved', 'all'] as const).map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
                    style={{
                      padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                      background: statusFilter === s ? COLORS.primary : COLORS.bgGray,
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
                background: tab === t.v ? COLORS.bgGray : COLORS.bgAmber,
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
          {/* 🛌 회피일 — 직원 신청 검토 + 매니저 직접 등록 (N-15 통합) */}
          {tab === 'skip' && (
            <>
              {/* 매니저 직접 등록 패널 */}
              <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f2440', marginBottom: 10 }}>
                  📝 매니저 직접 등록
                  <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted, marginLeft: 6 }}>
                    워커 선택 → 그룹 → 일자 → [+ 등록] (즉시 승인)
                  </span>
                </div>
                {/* 워커 chip 선택 */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
                    워커
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {workers.map(w => {
                      const active = regWorkerId === w.id
                      const tone = w.color_tone as keyof typeof TONE_BG
                      return (
                        <button key={w.id} type="button"
                                onClick={() => {
                                  setRegWorkerId(active ? '' : w.id)
                                  setRegGroupId('')  // 워커 바뀌면 그룹 reset
                                }}
                                style={{
                                  padding: '5px 11px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                                  background: active
                                    ? '#0f2440'
                                    : (TONE_BG[tone] !== 'transparent' ? TONE_BG[tone] : COLORS.bgGray),
                                  color: active ? '#fff' : (TONE_TEXT[tone] || COLORS.textPrimary),
                                  border: `1px solid ${active ? '#0f2440' : COLORS.borderFaint}`,
                                  cursor: 'pointer',
                                }}>
                          {w.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {/* N-60 — 회피일은 전역 적용 (모든 그룹) — 그룹 선택 UI 제거
                    안내 배너만 표시 */}
                {regWorkerId && (
                  <div style={{
                    marginBottom: 8, padding: '8px 12px', borderRadius: 8,
                    background: COLORS.bgBlue, border: `1px solid ${COLORS.borderBlue}`,
                    fontSize: 11, color: COLORS.info, lineHeight: 1.5,
                  }}>
                    🌐 <strong>전역 회피일</strong> — 이 워커가 속한 <strong>모든 활성 그룹</strong>에서 자동 제외됩니다 (그룹별 분리 없음).
                  </div>
                )}
                {/* 일자 + 사유 + 등록 */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
                      시작일
                    </div>
                    <input type="date" value={regStart}
                           onChange={(e) => {
                             setRegStart(e.target.value)
                             if (!regEnd || regEnd < e.target.value) setRegEnd(e.target.value)
                           }}
                           style={{
                             padding: '6px 10px', fontSize: 12, fontWeight: 600,
                             border: `1px solid ${COLORS.borderFaint}`, borderRadius: 6,
                             background: 'rgba(255,255,255,1)',
                           }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
                      종료일
                    </div>
                    <input type="date" value={regEnd}
                           onChange={(e) => setRegEnd(e.target.value)}
                           style={{
                             padding: '6px 10px', fontSize: 12, fontWeight: 600,
                             border: `1px solid ${COLORS.borderFaint}`, borderRadius: 6,
                             background: 'rgba(255,255,255,1)',
                           }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
                      사유 (선택)
                    </div>
                    <input type="text" value={regReason}
                           onChange={(e) => setRegReason(e.target.value)}
                           placeholder="예: 개인 사정 / 가족 행사 / ..."
                           style={{
                             width: '100%', padding: '6px 10px', fontSize: 12, fontWeight: 500,
                             border: `1px solid ${COLORS.borderFaint}`, borderRadius: 6,
                             background: 'rgba(255,255,255,1)',
                           }} />
                  </div>
                  <button type="button" onClick={registerSkip} disabled={regBusy}
                          style={{
                            padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 800,
                            background: '#0f2440', color: '#fff', border: 'none',
                            cursor: regBusy ? 'not-allowed' : 'pointer',
                            opacity: regBusy ? 0.6 : 1,
                          }}>
                    {regBusy ? '...' : '+ 등록'}
                  </button>
                </div>
              </div>

              {/* 직원 신청 검토 + 등록된 회피일 list */}
              {skips.length === 0
                ? <EmptyHint text="회피일 신청 / 등록 없음." />
                : <SkipList rows={skips} busy={busy}
                    onApprove={(s) => updateSkip(s, 'approved')}
                    onReject={(s) => openRejectModal('skip', s.worker_name || '워커',
                      (note) => updateSkip(s, 'rejected', note))}
                    onRevert={revertSkip}
                    onDelete={deleteSkip} />}
            </>
          )}

          {/* 🙋 휴가 — N-49: 직원 신청 검토 + 매니저 직접 등록 */}
          {tab === 'leave' && (
            <>
              {/* N-49 매니저 직접 등록 패널 */}
              <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f2440', marginBottom: 10 }}>
                  📝 매니저 직접 등록 (연차)
                  <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted, marginLeft: 6 }}>
                    워커 선택 → 일자 → [+ 등록] (전체 그룹 적용 / 즉시 승인)
                  </span>
                </div>
                {/* 워커 chip 선택 */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
                    워커
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {workers.map(w => {
                      const active = regLeaveWorkerId === w.id
                      const tone = w.color_tone as keyof typeof TONE_BG
                      return (
                        <button key={w.id} type="button"
                                onClick={() => setRegLeaveWorkerId(active ? '' : w.id)}
                                style={{
                                  padding: '5px 11px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                                  background: active
                                    ? '#0f2440'
                                    : (TONE_BG[tone] !== 'transparent' ? TONE_BG[tone] : COLORS.bgGray),
                                  color: active ? '#fff' : (TONE_TEXT[tone] || COLORS.textPrimary),
                                  border: `1px solid ${active ? '#0f2440' : COLORS.borderFaint}`,
                                  cursor: 'pointer',
                                }}>
                          {w.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {/* 일자 + 사유 + 등록 */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
                      시작일
                    </div>
                    <input type="date" value={regLeaveStart}
                           onChange={(e) => {
                             setRegLeaveStart(e.target.value)
                             if (!regLeaveEnd || regLeaveEnd < e.target.value) setRegLeaveEnd(e.target.value)
                           }}
                           style={{
                             padding: '6px 10px', fontSize: 12, fontWeight: 600,
                             border: `1px solid ${COLORS.borderFaint}`, borderRadius: 6,
                             background: 'rgba(255,255,255,1)',
                           }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
                      종료일
                    </div>
                    <input type="date" value={regLeaveEnd}
                           onChange={(e) => setRegLeaveEnd(e.target.value)}
                           style={{
                             padding: '6px 10px', fontSize: 12, fontWeight: 600,
                             border: `1px solid ${COLORS.borderFaint}`, borderRadius: 6,
                             background: 'rgba(255,255,255,1)',
                           }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
                      사유 (선택)
                    </div>
                    <input type="text" value={regLeaveReason}
                           onChange={(e) => setRegLeaveReason(e.target.value)}
                           placeholder="예: 개인 사정 / 가족 행사 / ..."
                           style={{
                             width: '100%', padding: '6px 10px', fontSize: 12, fontWeight: 500,
                             border: `1px solid ${COLORS.borderFaint}`, borderRadius: 6,
                             background: 'rgba(255,255,255,1)',
                           }} />
                  </div>
                  <button type="button" onClick={registerLeave} disabled={regLeaveBusy}
                          style={{
                            padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 800,
                            background: '#0f2440', color: '#fff', border: 'none',
                            cursor: regLeaveBusy ? 'not-allowed' : 'pointer',
                            opacity: regLeaveBusy ? 0.6 : 1,
                          }}>
                    {regLeaveBusy ? '...' : '+ 등록'}
                  </button>
                </div>
              </div>

              {/* 직원 신청 검토 + 등록된 휴가 list */}
              {leaves.length === 0
                ? <EmptyHint text="휴가 신청 / 등록 없음." />
                : <LeaveList rows={leaves} busy={busy}
                    onApprove={(r) => resolve('leave', r.id, 'approve', r.worker_name)}
                    onReject={(r) => openRejectModal('leave', r.worker_name,
                      (note) => resolve('leave', r.id, 'reject', r.worker_name, note))}
                    onRevert={revertLeave}
                    onDelete={deleteLeave} />}
            </>
          )}

          {/* 🔄 교체 */}
          {tab === 'swap' && (
            swaps.length === 0
              ? <EmptyHint text="시프트 교체 요청이 없습니다." />
              : <SwapList rows={swaps} busy={busy}
                  onApprove={(r) => resolve('swap', r.id, 'approve', r.worker_name)}
                  onReject={(r) => openRejectModal('swap', r.worker_name,
                    (note) => resolve('swap', r.id, 'reject', r.worker_name, note))} />
          )}
        </>
      )}

      {/* N-4 — 거절 사유 입력 모달 */}
      {rejectModal && (
        <div onClick={() => setRejectModal(null)}
             style={{
               position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
               display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
             }}>
          <div onClick={(e) => e.stopPropagation()}
               style={{
                 ...GLASS.L4, width: 480, maxWidth: '94vw', borderRadius: 16, padding: 24,
                 display: 'flex', flexDirection: 'column', gap: 14,
               }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
                ✗ {rejectModal.kind === 'skip' ? '회피일' : rejectModal.kind === 'leave' ? '휴가' : '시프트 교체'} 거절
              </div>
              <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 4 }}>
                <strong>{rejectModal.name}</strong> 님의 신청을 거절합니다. 사유를 입력하세요 (직원에게 전달).
              </div>
            </div>
            <textarea value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="예: 같은 날 다른 직원과 겹쳐서 / 인원 부족 / 등"
                      rows={4}
                      style={{
                        width: '100%', padding: '10px 14px', fontSize: 13,
                        border: `1.5px solid ${COLORS.borderFaint}`, borderRadius: 8,
                        background: 'rgba(255,255,255,1)', color: COLORS.textPrimary, outline: 'none',
                        resize: 'vertical', fontFamily: 'inherit',
                      }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setRejectModal(null)}
                      style={{
                        ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                        border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                      }}>
                취소
              </button>
              <button type="button"
                      onClick={() => {
                        rejectModal.onConfirm(rejectNote.trim() || null)
                        setRejectModal(null)
                      }}
                      style={{
                        ...BTN.md, background: COLORS.danger, color: '#fff',
                        border: 'none', cursor: 'pointer', fontWeight: 800,
                      }}>
                ✗ 거절 확정
              </button>
            </div>
          </div>
        </div>
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
function SkipList({ rows, busy, onApprove, onReject, onRevert, onDelete }: {
  rows: SkipRow[]
  busy: string | null
  onApprove: (s: SkipRow) => void
  onReject: (s: SkipRow) => void
  onRevert: (s: SkipRow) => void  // N-50 — 승인/거절 → 대기로 되돌리기
  onDelete: (s: SkipRow) => void  // N-50 — 완전 삭제
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
                      onApprove={() => onApprove(r)}
                      onReject={() => onReject(r)}
                    />
                  )}
                  {/* N-50 — 승인/거절 row 매니저 액션: 대기로 되돌리기 / 삭제 */}
                  {!isPending && (
                    <ManagerRowActions
                      busyKey={busy === `skip-${r.id}`}
                      onRevert={() => onRevert(r)}
                      onDelete={() => onDelete(r)}
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

// N-50 — 매니저 row 액션 (승인 취소 / 삭제)
function ManagerRowActions({ busyKey, onRevert, onDelete }: {
  busyKey: boolean
  onRevert: () => void
  onDelete: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button type="button" disabled={busyKey} onClick={onRevert}
              title="승인/거절 취소 — 대기 상태로 되돌리기"
              style={{
                ...BTN.sm,
                background: 'transparent', color: COLORS.textSecondary,
                border: `1px solid ${COLORS.borderFaint}`,
                cursor: busyKey ? 'not-allowed' : 'pointer',
                opacity: busyKey ? 0.5 : 1,
              }}>
        ↩ 취소
      </button>
      <button type="button" disabled={busyKey} onClick={onDelete}
              title="완전 삭제"
              style={{
                ...BTN.sm,
                background: 'transparent', color: COLORS.danger,
                border: `1px solid ${COLORS.borderRed}`,
                cursor: busyKey ? 'not-allowed' : 'pointer',
                opacity: busyKey ? 0.5 : 1,
              }}>
        🗑
      </button>
    </div>
  )
}

// ── 휴가 list ──────────────────────────────────────────────────────
function LeaveList({ rows, busy, onApprove, onReject, onRevert, onDelete }: {
  rows: LeaveRow[]
  busy: string | null
  onApprove: (r: LeaveRow) => void
  onReject: (r: LeaveRow) => void
  onRevert?: (r: LeaveRow) => void  // N-50
  onDelete?: (r: LeaveRow) => void  // N-50
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
                onApprove={() => onApprove(r)}
                onReject={() => onReject(r)}
              />
            )}
            {/* N-50 — 승인/거절 row 매니저 액션 */}
            {!isPending && onRevert && onDelete && (
              <ManagerRowActions
                busyKey={busy === `leave-${r.id}`}
                onRevert={() => onRevert(r)}
                onDelete={() => onDelete(r)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 교체 list ──────────────────────────────────────────────────────
function SwapList({ rows, busy, onApprove, onReject }: {
  rows: SwapRow[]
  busy: string | null
  onApprove: (r: SwapRow) => void
  onReject: (r: SwapRow) => void
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
                onApprove={() => onApprove(r)}
                onReject={() => onReject(r)}
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
