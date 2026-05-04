'use client'
// ═══════════════════════════════════════════════════════════════════
// LeaveRequestDialog — 직원 마이페이지 휴가 신청 모달
//   토큰 모드: status='pending' 자동 (매니저 승인 필요)
//   로그인 모드: status='approved' (매니저 직접 등록)
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import { LEAVE_DEFAULTS, QUICK_PRESETS, type LeaveType, type AmPm } from '../utils/leaveDefaults'

interface Props {
  open: boolean
  onClose: () => void
  workerId: string
  workerName: string
  scheduleYear?: number  // default: 현재 년도
  scheduleMonth?: number  // default: 현재 월
  token?: string  // 토큰 모드면 status='pending'
  onCompleted: () => void
}

const TYPE_LABEL: Record<LeaveType, string> = {
  annual: '연차',
  familyday: '패밀리데이',
  sick: '병가',
  unpaid: '무급',
  family: '경조',
  holiday: '공휴일',
  other: '기타',
}

export default function LeaveRequestDialog({
  open, onClose, workerId, workerName, scheduleYear, scheduleMonth, token, onCompleted,
}: Props) {
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const [leaveType, setLeaveType] = useState<LeaveType>('annual')
  const [startDate, setStartDate] = useState(todayIso)
  const [endDate, setEndDate] = useState(todayIso)
  const [amPm, setAmPm] = useState<AmPm>('full')
  const [hours, setHours] = useState(8)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  if (!open) return null

  const applyType = (t: LeaveType) => {
    const def = LEAVE_DEFAULTS[t]
    setLeaveType(t)
    setAmPm(def.am_pm)
    setHours(def.hours)
  }

  const submit = async () => {
    setBusy(true); setResult(null)
    try {
      const url = token
        ? `/api/call-scheduler/leaves?token=${encodeURIComponent(token)}`
        : '/api/call-scheduler/leaves'
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (!token) {
        const auth = await getAuthHeader()
        Object.assign(headers, auth)
      }
      const res = await fetch(url, {
        method: 'POST', headers,
        body: JSON.stringify({
          worker_id: workerId,
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate,
          am_pm: amPm,
          hours: amPm === 'custom' ? hours : undefined,
          reason: reason.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '신청 실패')
      const isPending = token ? true : false
      setResult({
        ok: true,
        text: isPending
          ? `✅ 신청 접수됨 — 매니저 승인 대기`
          : `✅ 등록 완료 (즉시 적용)`,
      })
      onCompleted()
      // 3초 후 자동 닫기
      setTimeout(() => onClose(), 2500)
    } catch (e: any) {
      setResult({ ok: false, text: e?.message || '오류' })
    } finally { setBusy(false) }
  }

  const calcDays = () => {
    if (amPm === 'am' || amPm === 'pm') return 0.5
    if (amPm === 'custom') return Math.round((hours / 8) * 100) / 100
    // full
    const s = new Date(startDate + 'T00:00:00')
    const e = new Date(endDate + 'T00:00:00')
    return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...GLASS.L4, width: 480, maxWidth: '94vw', maxHeight: '90vh',
        borderRadius: 16, padding: 22, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
            🙋 휴가 신청
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
            {workerName} · {token ? '신청 후 매니저 승인 대기' : '즉시 적용 (매니저 권한)'}
          </div>
        </div>

        {/* 종류 */}
        <Field label="종류">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(['annual', 'familyday', 'sick', 'unpaid', 'family', 'holiday', 'other'] as LeaveType[]).map(t => (
              <button key={t} type="button" onClick={() => applyType(t)}
                      style={{
                        padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6,
                        background: leaveType === t ? COLORS.bgBlue : 'transparent',
                        color: leaveType === t ? COLORS.info : COLORS.textSecondary,
                        border: `1px solid ${leaveType === t ? COLORS.borderBlue : COLORS.borderFaint}`,
                        cursor: 'pointer',
                      }}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>
            💡 {LEAVE_DEFAULTS[leaveType]?.description}
          </div>
        </Field>

        {/* 기간 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="시작일">
            <input type="date" value={startDate}
                   onChange={(e) => {
                     setStartDate(e.target.value)
                     if (e.target.value > endDate) setEndDate(e.target.value)
                   }}
                   style={inputStyle} />
          </Field>
          <Field label="종료일">
            <input type="date" value={endDate} min={startDate}
                   onChange={(e) => setEndDate(e.target.value)}
                   style={inputStyle} />
          </Field>
        </div>

        {/* 시간 단위 — 빠른 프리셋 */}
        <Field label="시간 단위">
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
            {QUICK_PRESETS.map(p => (
              <button key={p.label} type="button"
                      onClick={() => { setAmPm(p.am_pm); setHours(p.hours) }}
                      style={{
                        padding: '3px 8px', fontSize: 10, fontWeight: 700, borderRadius: 999,
                        background: 'transparent', color: COLORS.textSecondary,
                        border: `1px dashed ${COLORS.borderFaint}`, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['full', 'am', 'pm', 'custom'] as AmPm[]).map(v => {
              const lbl = v === 'full' ? '종일 (8h)'
                : v === 'am' ? '오전 (4h)'
                : v === 'pm' ? '오후 (4h)'
                : '시간 지정'
              return (
                <button key={v} type="button" onClick={() => setAmPm(v)}
                        style={{
                          flex: 1, padding: '6px 4px', fontSize: 10, fontWeight: 700, borderRadius: 6,
                          background: amPm === v ? COLORS.bgBlue : 'transparent',
                          color: amPm === v ? COLORS.info : COLORS.textSecondary,
                          border: `1px solid ${amPm === v ? COLORS.borderBlue : COLORS.borderFaint}`,
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}>
                  {lbl}
                </button>
              )
            })}
          </div>
          {amPm === 'custom' && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" step={0.5} min={0.5} max={24} value={hours}
                     onChange={(e) => setHours(Number(e.target.value))}
                     style={{ ...inputStyle, flex: 1 }} />
              <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 700 }}>시간</span>
            </div>
          )}
        </Field>

        {/* 사유 */}
        <Field label="사유 (선택)">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                    rows={2} placeholder="가족 행사, 병원 예약 등"
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </Field>

        {/* 차감 계산 */}
        <div style={{
          ...GLASS.L1, borderRadius: 6, padding: '6px 10px', fontSize: 11,
          color: COLORS.info,
        }}>
          📊 차감: <strong>{calcDays()}일</strong>
          {amPm === 'custom' && ` (${hours}시간 = ${(hours / 8).toFixed(2)}일)`}
        </div>

        {result && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: result.ok ? COLORS.bgGreen : COLORS.bgRed,
            border: `1px solid ${result.ok ? COLORS.borderGreen : COLORS.borderRed}`,
            color: result.ok ? COLORS.success : COLORS.danger, fontSize: 13, fontWeight: 700,
          }}>
            {result.text}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={busy}
                  style={{
                    ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                    border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                  }}>
            {result?.ok ? '닫기' : '취소'}
          </button>
          {!result?.ok && (
            <button onClick={submit} disabled={busy}
                    style={{
                      ...BTN.md, background: COLORS.warning, color: '#fff', border: 'none',
                      cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
                    }}>
              {busy ? '신청 중...' : (token ? '🙋 신청' : '✓ 등록')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  ...GLASS.L1, padding: '7px 10px', borderRadius: 8,
  fontSize: 13, color: COLORS.textPrimary, outline: 'none', width: '100%',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}
