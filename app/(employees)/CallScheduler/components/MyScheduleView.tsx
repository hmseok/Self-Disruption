'use client'
// ═══════════════════════════════════════════════════════════════════
// MyScheduleView — 직원 본인 시간표 (마이페이지 + 토큰 링크 공용)
//
// 두 진입점이 같은 본문 사용:
//   /CallScheduler/me            로그인 (인증 헤더로 본인 자동 추출 / 매니저는 워커 선택)
//   /CallScheduler/e/[token]     비로그인 영구 링크 (published 스케줄만)
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState, useCallback } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_BORDER, TONE_TEXT } from '../utils/palette'
import { monthDays, dowIndex, DOW_LABEL } from '../utils/hours'
import { SPECIAL_LABEL } from '../utils/types'
import { getAuthHeader } from '@/app/utils/auth-client'
import { buildIcs, downloadIcs } from '../utils/icalExport'
import LeaveRequestDialog from './LeaveRequestDialog'
import SkipRequestDialog from './SkipRequestDialog'
import type { ColorTone, SpecialCode } from '../utils/types'

interface ScheduleMeta {
  id: string
  year: number
  month: number
  title: string | null
  status: 'draft' | 'published' | 'archived'
  published_at: string | null
}

interface WorkerInfo {
  worker_id: string
  worker_name: string
  color_tone: ColorTone
  group_label: string | null
  employee_id: string | null
  employee_name: string | null
  department: string | null
  position: string | null
  phone: string | null
  email: string | null
}

interface AssignmentRow {
  id: string
  work_date: string
  shift_slot_id: string
  special_code: SpecialCode
  computed_hours: number
  slot_code: string
  slot_label: string
  start_time: string
  end_time: string
  is_overnight: boolean
}

interface Stats {
  shift_count: number
  total_hours: number
  overnight_count: number
  half_count: number
  free_count: number
  off_count: number
}

interface ApiResponse {
  worker: WorkerInfo | null
  schedule: ScheduleMeta | null
  assignments: AssignmentRow[]
  stats: Stats | null
  public_mode?: boolean
}

interface Props {
  /** 비로그인 영구 링크 모드 — 토큰 문자열 */
  token?: string
}

export default function MyScheduleView({ token }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [yearMonth, setYearMonth] = useState<{ year: number; month: number } | null>(null)
  const [leaveRequestOpen, setLeaveRequestOpen] = useState(false)
  const [skipRequestOpen, setSkipRequestOpen] = useState(false)  // Phase G — 회피 신청
  // L-2 — 뷰 모드 (직원이 본인 일정을 월/주/일 중 선택)
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month')

  const isPublic = !!token

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const sp = new URLSearchParams()
      if (token) sp.set('token', token)
      if (yearMonth) {
        sp.set('year', String(yearMonth.year))
        sp.set('month', String(yearMonth.month))
      }
      const url = `/api/call-scheduler/me${sp.toString() ? '?' + sp.toString() : ''}`
      const headers: Record<string, string> = {}
      if (!token) {
        const auth = await getAuthHeader()
        Object.assign(headers, auth)
      }
      const res = await fetch(url, { headers })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '조회 실패')
      setData(json.data as ApiResponse)
    } catch (e: any) {
      setError(e?.message || '오류')
    } finally {
      setLoading(false)
    }
  }, [token, yearMonth])

  useEffect(() => { load() }, [load])

  if (loading && !data) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: COLORS.textMuted }}>
        로딩 중...
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
        <div style={{
          padding: 16, borderRadius: 12,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger,
        }}>
          ❌ {error}
        </div>
      </div>
    )
  }

  if (!data) return null
  const { worker, schedule, assignments, stats } = data

  if (!worker) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: COLORS.textMuted }}>
        본인의 워커 매핑이 없어 시간표를 표시할 수 없습니다.
        <div style={{ marginTop: 8, fontSize: 12 }}>
          관리자에게 문의해주세요.
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* 인사 헤더 */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: COLORS.textMuted }}>
          {isPublic ? '📌 영구 링크 — 공지된 스케줄만 표시' : 'My Schedule'}
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 800, margin: '4px 0 0',
          color: TONE_TEXT[worker.color_tone],
          display: 'inline-block',
          background: TONE_BG[worker.color_tone],
          padding: '4px 14px', borderRadius: 8,
        }}>
          안녕하세요, {worker.employee_name || worker.worker_name} 님
        </h1>
        <div style={{ marginTop: 6, fontSize: 12, color: COLORS.textSecondary, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {worker.department && <span>{worker.department}</span>}
          {worker.position && <span>· {worker.position}</span>}
          {worker.group_label && <span style={pillStyle('neutral')}>{worker.group_label}</span>}
        </div>
      </div>

      {/* 스케줄 메타 */}
      {schedule ? (
        <div style={{
          ...GLASS.L4, borderRadius: 12, padding: '12px 16px', marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{schedule.year}년 {schedule.month}월 근무표</span>
              {(() => {
                if (!schedule.published_at) return null
                const publishedAt = new Date(schedule.published_at)
                const now = new Date()
                const daysAgo = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24)
                if (daysAgo <= 7) {
                  return (
                    <span style={{
                      ...pillStyle('success'),
                      animation: 'pulse 2s ease-in-out infinite',
                    }}>
                      🆕 새 공지
                    </span>
                  )
                }
                return null
              })()}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
              {schedule.published_at
                ? `공지일: ${new Date(schedule.published_at).toLocaleDateString('ko-KR', {
                    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}`
                : '아직 공지 안 됨'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* N-2 — 시원시원: BTN.sm → BTN.md, 보더 1.5px */}
            <button type="button" onClick={() => setLeaveRequestOpen(true)}
                    style={{
                      ...BTN.md, background: COLORS.bgAmber, color: COLORS.warning,
                      border: `1.5px solid ${COLORS.borderAmber}`,
                      cursor: 'pointer', fontWeight: 800,
                    }}
                    title={isPublic ? '휴가 신청 — 매니저 승인 대기' : '휴가 등록 (즉시 적용)'}>
              🙋 휴가 신청
            </button>
            {/* Phase G — 회피일 신청 */}
            <button type="button" onClick={() => setSkipRequestOpen(true)}
                    style={{
                      ...BTN.md, background: COLORS.bgRed, color: COLORS.danger,
                      border: `1.5px solid ${COLORS.borderRed}`,
                      cursor: 'pointer', fontWeight: 800,
                    }}
                    title="회피일 신청 — 정식 휴가 X, 단순 빠지고 싶은 날">
              🛌 회피 신청
            </button>
            <button type="button" onClick={() => {
              const ics = buildIcs({
                workerName: worker.employee_name || worker.worker_name,
                year: schedule.year,
                month: schedule.month,
                assignments: assignments.map(a => ({
                  id: a.id,
                  work_date: a.work_date,
                  start_time: a.start_time,
                  end_time: a.end_time,
                  is_overnight: a.is_overnight,
                  slot_code: a.slot_code,
                  slot_label: a.slot_label,
                  special_code: a.special_code,
                  computed_hours: a.computed_hours,
                })),
              })
              const safeName = (worker.employee_name || worker.worker_name).replace(/[^\w가-힣]/g, '_')
              downloadIcs(
                `${safeName}_${schedule.year}-${String(schedule.month).padStart(2, '0')}.ics`,
                ics,
              )
            }}
                    style={{
                      ...BTN.md, background: COLORS.bgGreen, color: COLORS.success,
                      border: `1.5px solid ${COLORS.borderGreen}`,
                      cursor: 'pointer', fontWeight: 800,
                    }}
                    title="iCal (.ics) 다운로드 — 휴대폰 캘린더에 import 가능">
              📥 캘린더 다운로드
            </button>
            <button type="button" onClick={() => setYearMonth({
              year: schedule.month === 1 ? schedule.year - 1 : schedule.year,
              month: schedule.month === 1 ? 12 : schedule.month - 1,
            })} style={navBtn}>← 이전 달</button>
            <button type="button" onClick={() => setYearMonth(null)} style={navBtnActive}>이번 달</button>
            <button type="button" onClick={() => setYearMonth({
              year: schedule.month === 12 ? schedule.year + 1 : schedule.year,
              month: schedule.month === 12 ? 1 : schedule.month + 1,
            })} style={navBtn}>다음 달 →</button>
          </div>
        </div>
      ) : (
        <div style={{
          ...GLASS.L4, borderRadius: 12, padding: 60, textAlign: 'center',
          color: COLORS.textMuted, marginBottom: 14,
        }}>
          {isPublic
            ? '아직 공지된 근무표가 없습니다. 매니저가 공지하면 자동으로 표시됩니다.'
            : '아직 작성된 근무표가 없습니다.'}
        </div>
      )}

      {/* KPI */}
      {stats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
          marginBottom: 14,
        }}>
          <Tile label="근무 일수" value={stats.shift_count.toString()} sub={`${assignments.length}개 배정`} tone="blue" />
          <Tile label="총 근무시간" value={`${stats.total_hours}h`} sub={`평균 ${stats.shift_count > 0 ? Math.round(stats.total_hours / stats.shift_count * 10) / 10 : 0}h/일`} tone="green" />
          <Tile label="야간 근무" value={stats.overnight_count.toString()} sub="익일 종료" tone="amber" />
          <Tile label="반차·F" value={(stats.half_count + stats.free_count).toString()} sub={`반차 ${stats.half_count} · F ${stats.free_count}`} tone="violet" />
        </div>
      )}

      {/* L-2 — 뷰 모드 토글 (월 / 주 / 일) */}
      {schedule && (
        <div style={{
          display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 4,
        }}>
          {([
            { v: 'month', label: '📅 월간', title: '한 달 전체 카드 그리드' },
            { v: 'week',  label: '📆 주간', title: '이번 주 7일 카드' },
            { v: 'day',   label: '📋 오늘', title: '오늘 또는 가장 가까운 일자' },
          ] as const).map(opt => (
            <button key={opt.v} type="button"
                    onClick={() => setViewMode(opt.v)}
                    title={opt.title}
                    style={{
                      padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 800,
                      background: viewMode === opt.v ? COLORS.primary : 'rgba(255,255,255,0.7)',
                      color: viewMode === opt.v ? '#fff' : COLORS.textSecondary,
                      border: `2px solid ${viewMode === opt.v ? COLORS.primary : COLORS.borderFaint}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      boxShadow: viewMode === opt.v ? '0 2px 6px rgba(59,130,246,0.25)' : 'none',
                    }}>
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* 캘린더 */}
      {schedule && (
        <CalendarView
          year={schedule.year}
          month={schedule.month}
          assignments={assignments}
          tone={worker.color_tone}
          scheduleId={schedule.id}
          token={token}
          myWorkerId={worker.worker_id}
          viewMode={viewMode}
        />
      )}

      {/* 시간표 리스트 + 교체 요청 (PR-2Y) */}
      {schedule && assignments.length > 0 && (
        <ScheduleList
          assignments={assignments}
          scheduleId={schedule.id}
          workerId={worker.worker_id}
          token={token}
        />
      )}

      {/* 푸터 */}
      <div style={{
        marginTop: 18, paddingTop: 12,
        borderTop: `1px solid ${COLORS.borderFaint}`,
        fontSize: 11, color: COLORS.textMuted, textAlign: 'center',
      }}>
        {isPublic
          ? '이 페이지는 매니저가 발급한 영구 링크입니다. 본인 외 공유하지 마세요.'
          : 'CallScheduler · Employee of Ride Inc.'}
      </div>

      <LeaveRequestDialog
        open={leaveRequestOpen}
        onClose={() => setLeaveRequestOpen(false)}
        workerId={worker.worker_id}
        workerName={worker.employee_name || worker.worker_name}
        token={token}
        onCompleted={() => load()}
      />
      {/* Phase G — 회피일 신청 (그룹 차원) */}
      <SkipRequestDialog
        open={skipRequestOpen}
        onClose={() => setSkipRequestOpen(false)}
        workerId={worker.worker_id}
        workerName={worker.employee_name || worker.worker_name}
        token={token}
        onCompleted={() => load()}
      />
    </div>
  )
}

// ── 캘린더 그리드 (직원 입장 — 본인 일정 + 같은 날 동료 보기) ─────
function CalendarView({ year, month, assignments, tone, scheduleId, token, myWorkerId, viewMode = 'month' }: {
  year: number; month: number
  assignments: AssignmentRow[]
  tone: ColorTone
  scheduleId: string
  token?: string
  myWorkerId: string
  viewMode?: 'month' | 'week' | 'day'  // L-2
}) {
  const allDays = useMemo(() => monthDays(year, month), [year, month])
  // L-2 — 뷰 모드별 days 필터
  const days = useMemo(() => {
    if (viewMode === 'month') return allDays
    const today = new Date()
    const todayIso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
    if (viewMode === 'day') {
      // 오늘 또는 첫 일자 1개
      const target = allDays.includes(todayIso) ? todayIso : allDays[0]
      return target ? [target] : []
    }
    // week — 오늘 (또는 첫 일자) 포함 주 (일~토)
    const baseIso = allDays.includes(todayIso) ? todayIso : allDays[0]
    if (!baseIso) return []
    const base = new Date(baseIso + 'T00:00:00')
    const dow = base.getDay()
    base.setDate(base.getDate() - dow)
    const weekDays: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(base); d.setDate(base.getDate() + i)
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      // 이 달 범위 안만 표시 (월 경계 일자는 흐릿)
      weekDays.push(iso)
    }
    return weekDays
  }, [allDays, viewMode])
  const byDate = useMemo(() => {
    const m = new Map<string, AssignmentRow>()
    for (const a of assignments) m.set(a.work_date, a)
    return m
  }, [assignments])

  const [pickedDate, setPickedDate] = useState<string | null>(null)
  // L-2 — month 모드만 firstDow 빈칸 (week/day 는 1행)
  const firstDow = viewMode === 'month' && days.length > 0 ? dowIndex(days[0]) : 0

  return (
    <>
      <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            🧑‍🤝‍🧑 일자 클릭 시 그날 같이 근무하는 동료가 표시됩니다.
          </div>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4,
        }}>
          {DOW_LABEL.map((d, i) => (
            <div key={d} style={{
              fontSize: 11, fontWeight: 700, textAlign: 'center', padding: '6px 0',
              color: i === 0 ? COLORS.danger : i === 6 ? COLORS.info : COLORS.textMuted,
            }}>{d}</div>
          ))}
          {Array.from({ length: firstDow }, (_, i) => <div key={`e-${i}`} />)}
          {days.map(d => {
            const a = byDate.get(d)
            const day = Number(d.split('-')[2])
            const dow = dowIndex(d)
            const isOff = a?.special_code === 'off'
            const isWork = a && !isOff
            return (
              <button key={d} type="button"
                      onClick={() => setPickedDate(d)}
                      style={{
                        minHeight: 64, padding: 6, borderRadius: 8,
                        background: isWork ? TONE_BG[tone] : isOff ? COLORS.bgGray : 'transparent',
                        border: `1px solid ${isWork ? TONE_BORDER[tone] : COLORS.borderFaint}`,
                        display: 'flex', flexDirection: 'column', gap: 2,
                        textAlign: 'left', cursor: 'pointer',
                        transition: 'transform 0.1s, box-shadow 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
                        e.currentTarget.style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = ''
                        e.currentTarget.style.transform = ''
                      }}>
                <div style={{
                  fontSize: 12, fontWeight: 700,
                  color: dow === 0 ? COLORS.danger : dow === 6 ? COLORS.info : COLORS.textPrimary,
                }}>
                  {day}
                </div>
                {a && a.special_code !== 'off' && (
                  <>
                    <div style={{
                      fontSize: 10, fontWeight: 700,
                      color: TONE_TEXT[tone], lineHeight: 1.2,
                    }}>
                      {a.start_time}~{a.end_time.substring(0, 5)}
                    </div>
                    <div style={{ fontSize: 9, color: COLORS.textMuted }}>
                      {a.slot_code}
                    </div>
                    {a.special_code !== 'none' && (
                      <div style={{
                        ...pillStyle(a.special_code.endsWith('_half') ? 'warning' : 'info'),
                        fontSize: 9, padding: '0 4px',
                      }}>
                        {SPECIAL_LABEL[a.special_code]}
                      </div>
                    )}
                  </>
                )}
                {isOff && (
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>휴무</div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {pickedDate && (
        <DayRosterModal
          date={pickedDate}
          scheduleId={scheduleId}
          token={token}
          myWorkerId={myWorkerId}
          onClose={() => setPickedDate(null)}
        />
      )}
    </>
  )
}

// ── 시프트 교체 요청 (PR-2Y) — 직원이 본인 시간표에서 신청 ──────
async function requestSwap(params: {
  scheduleId: string
  assignmentId: string
  workerId: string
  date: string
  reason: string
  token?: string
}) {
  const url = params.token
    ? `/api/call-scheduler/swap-requests?token=${encodeURIComponent(params.token)}`
    : '/api/call-scheduler/swap-requests'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!params.token) {
    const auth = await getAuthHeader()
    Object.assign(headers, auth)
  }
  const res = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({
      schedule_id: params.scheduleId,
      assignment_id: params.assignmentId,
      worker_id: params.workerId,
      request_date: params.date,
      reason: params.reason,
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || '신청 실패')
  return json.data
}

// ── 같은 날 동료 모달 (PR-2W) ───────────────────────────────────
interface RosterSlot {
  slot_id: string
  code: string
  label: string
  start_time: string
  end_time: string
  is_overnight: boolean
  workers: Array<{
    assignment_id: string
    worker_id: string
    name: string
    color_tone: ColorTone
    group_label: string | null
    special_code: SpecialCode
    computed_hours: number
  }>
}

function DayRosterModal({ date, scheduleId, token, myWorkerId, onClose }: {
  date: string
  scheduleId: string
  token?: string
  myWorkerId: string
  onClose: () => void
}) {
  const [slots, setSlots] = useState<RosterSlot[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let abort = false
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const sp = new URLSearchParams()
        sp.set('date', date)
        sp.set('schedule_id', scheduleId)
        if (token) sp.set('token', token)
        const headers: Record<string, string> = {}
        if (!token) {
          const auth = await getAuthHeader()
          Object.assign(headers, auth)
        }
        const res = await fetch(`/api/call-scheduler/day-roster?${sp.toString()}`, { headers })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '조회 실패')
        if (!abort) setSlots(json.data.slots)
      } catch (e: any) {
        if (!abort) setError(e?.message || '오류')
      } finally {
        if (!abort) setLoading(false)
      }
    })()
    return () => { abort = true }
  }, [date, scheduleId, token])

  const dow = dowIndex(date)
  const day = Number(date.split('-')[2])
  const month = Number(date.split('-')[1])
  const year = Number(date.split('-')[0])

  const totalCount = slots?.reduce((s, sl) => s + sl.workers.filter(w => w.special_code !== 'off').length, 0) || 0

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...GLASS.L4, width: 520, maxWidth: '94vw', maxHeight: '88vh',
        borderRadius: 16, padding: 20, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
              {year}년 {month}월 {day}일
              <span style={{
                marginLeft: 8, fontSize: 14,
                color: dow === 0 ? COLORS.danger : dow === 6 ? COLORS.info : COLORS.textSecondary,
              }}>
                ({DOW_LABEL[dow]})
              </span>
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
              🧑‍🤝‍🧑 같이 근무하는 동료 — 총 {totalCount}명
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'transparent', border: `1px solid ${COLORS.borderFaint}`,
            cursor: 'pointer', color: COLORS.textSecondary, fontSize: 16,
          }}>×</button>
        </div>

        {loading && (
          <div style={{ padding: 30, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
        )}
        {error && (
          <div style={{
            padding: 12, borderRadius: 8,
            background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            color: COLORS.danger, fontSize: 12,
          }}>❌ {error}</div>
        )}
        {!loading && !error && slots && (
          slots.length === 0 ? (
            <div style={{
              padding: 30, textAlign: 'center', color: COLORS.textMuted, fontSize: 12,
              background: COLORS.bgGray, borderRadius: 8,
            }}>
              이 날 배정된 인원이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {slots.map(sl => (
                <div key={sl.slot_id} style={{ ...GLASS.L1, borderRadius: 8, padding: 10 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 6,
                  }}>
                    <div>
                      <span style={{ fontSize: 11, color: COLORS.textMuted, marginRight: 6, fontFamily: 'monospace' }}>
                        {sl.code}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                        {sl.start_time}~{sl.end_time}
                        {sl.is_overnight && (
                          <span style={{ marginLeft: 4, fontSize: 10, color: COLORS.warning }}>(익일)</span>
                        )}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                      {sl.workers.filter(w => w.special_code !== 'off').length}명
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {sl.workers.length === 0 ? (
                      <span style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' }}>
                        비어있음
                      </span>
                    ) : (
                      sl.workers.map(w => {
                        const isMe = w.worker_id === myWorkerId
                        return (
                          <div key={w.assignment_id} style={{
                            padding: '4px 10px', borderRadius: 6,
                            background: TONE_BG[w.color_tone] !== 'transparent' ? TONE_BG[w.color_tone] : COLORS.bgGray,
                            color: TONE_TEXT[w.color_tone],
                            fontSize: 12, fontWeight: 700,
                            display: 'flex', alignItems: 'center', gap: 4,
                            opacity: w.special_code === 'off' ? 0.4 : 1,
                            textDecoration: w.special_code === 'off' ? 'line-through' : 'none',
                            border: isMe ? `2px solid ${COLORS.primary}` : `1px solid transparent`,
                          }}>
                            {isMe && <span style={{ fontSize: 10 }}>👤</span>}
                            <span>{w.name}</span>
                            {w.special_code !== 'none' && (
                              <span style={{
                                ...pillStyle(
                                  w.special_code === 'off' ? 'neutral'
                                  : w.special_code.endsWith('_half') ? 'warning' : 'info'
                                ),
                                fontSize: 9, padding: '0 4px',
                              }}>
                                {SPECIAL_LABEL[w.special_code]}
                              </span>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

// ── 작은 KPI 타일 ────────────────────────────────────────────────
function Tile({ label, value, sub, tone }: {
  label: string; value: string; sub: string
  tone: 'blue' | 'green' | 'amber' | 'violet'
}) {
  const tintMap = {
    blue:   { bg: COLORS.bgBlue,   border: COLORS.borderBlue,   color: COLORS.info },
    green:  { bg: COLORS.bgGreen,  border: COLORS.borderGreen,  color: COLORS.success },
    amber:  { bg: COLORS.bgAmber,  border: COLORS.borderAmber,  color: COLORS.warning },
    violet: { bg: COLORS.bgViolet, border: COLORS.borderViolet, color: '#7c3aed' },
  }[tone]
  return (
    <div style={{
      ...GLASS.L3, background: tintMap.bg, border: `1px solid ${tintMap.border}`,
      borderRadius: 12, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: tintMap.color, lineHeight: 1.1, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6,
  background: 'transparent', color: COLORS.textSecondary,
  border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
}
const navBtnActive: React.CSSProperties = {
  ...navBtn, background: COLORS.bgBlue, color: COLORS.info,
  border: `1px solid ${COLORS.borderBlue}`,
}
const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left',
  color: COLORS.textSecondary, fontWeight: 700, whiteSpace: 'nowrap', fontSize: 12,
}
const tdStyle: React.CSSProperties = {
  padding: '8px 10px', whiteSpace: 'nowrap', color: COLORS.textPrimary,
}

// ── 시간표 리스트 + 교체 요청 (PR-2Y) ─────────────────────────────
function ScheduleList({ assignments, scheduleId, workerId, token }: {
  assignments: AssignmentRow[]
  scheduleId: string
  workerId: string
  token?: string
}) {
  const [requesting, setRequesting] = useState<AssignmentRow | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async () => {
    if (!requesting) return
    setBusy(true); setMsg(null)
    try {
      await requestSwap({
        scheduleId,
        assignmentId: requesting.id,
        workerId,
        date: requesting.work_date,
        reason: reason.trim(),
        token,
      })
      setMsg({ ok: true, text: `${requesting.work_date} 교체 요청 접수됨 — 매니저 처리 대기` })
      setRequesting(null); setReason('')
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || '오류' })
    } finally { setBusy(false) }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 8 }}>
        상세 시간표 ({assignments.filter(a => a.special_code !== 'off').length}일 근무)
      </div>
      {msg && (
        <div style={{
          ...GLASS.L3,
          background: msg.ok ? COLORS.bgGreen : COLORS.bgRed,
          border: `1px solid ${msg.ok ? COLORS.borderGreen : COLORS.borderRed}`,
          borderRadius: 8, padding: '8px 12px', marginBottom: 8,
          fontSize: 12, fontWeight: 700,
          color: msg.ok ? COLORS.success : COLORS.danger,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{msg.ok ? '✅ ' : '❌ '}{msg.text}</span>
          <button onClick={() => setMsg(null)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: COLORS.textMuted }}>×</button>
        </div>
      )}
      <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
              <th style={thStyle}>날짜</th>
              <th style={thStyle}>요일</th>
              <th style={thStyle}>시간</th>
              <th style={thStyle}>구분</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>시간</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>액션</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map(a => {
              const dow = dowIndex(a.work_date)
              const dowLabel = DOW_LABEL[dow]
              const dowColor = dow === 0 ? COLORS.danger : dow === 6 ? COLORS.info : COLORS.textSecondary
              const canRequest = a.special_code !== 'off'
              return (
                <tr key={a.id} style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                  <td style={tdStyle}>{a.work_date.substring(5)}</td>
                  <td style={{ ...tdStyle, color: dowColor, fontWeight: 700 }}>{dowLabel}</td>
                  <td style={tdStyle}>
                    {a.start_time}~{a.end_time}
                    {a.is_overnight && (
                      <span style={{ marginLeft: 4, fontSize: 10, color: COLORS.warning }}>(익일)</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {a.special_code === 'none' ? (
                      <span style={{ color: COLORS.textPrimary }}>일반 근무</span>
                    ) : a.special_code === 'off' ? (
                      <span style={pillStyle('neutral')}>휴무</span>
                    ) : a.special_code.endsWith('_half') ? (
                      <span style={pillStyle('warning')}>{SPECIAL_LABEL[a.special_code]}</span>
                    ) : (
                      <span style={pillStyle('info')}>{SPECIAL_LABEL[a.special_code]}</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                    {Number(a.computed_hours) > 0 ? `${a.computed_hours}h` : '-'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {canRequest && (
                      <button type="button" onClick={() => { setRequesting(a); setReason('') }}
                              style={{
                                ...BTN.sm, background: 'transparent', color: COLORS.warning,
                                border: `1px solid ${COLORS.borderAmber}`, cursor: 'pointer',
                              }}>
                        🙋 교체 요청
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 교체 요청 모달 */}
      {requesting && (
        <div onClick={() => setRequesting(null)}
             style={{
               position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
               display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
             }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            ...GLASS.L4, width: 460, maxWidth: '94vw', borderRadius: 16, padding: 20,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>
                🙋 시프트 교체 요청
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                매니저에게 신청서를 보냅니다. 확정 전에는 시간표가 그대로 유지됩니다.
              </div>
            </div>

            <div style={{ ...GLASS.L1, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary }}>
                {requesting.work_date} ({DOW_LABEL[dowIndex(requesting.work_date)]})
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                {requesting.slot_code} · {requesting.start_time}~{requesting.end_time}
                {requesting.is_overnight && (
                  <span style={{ marginLeft: 4, color: COLORS.warning }}>(익일)</span>
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
                사유 (선택)
              </div>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                        rows={3} placeholder="예: 가족 행사, 병원 예약 등"
                        style={{
                          ...GLASS.L1, width: '100%', borderRadius: 8, padding: '8px 12px',
                          fontSize: 13, color: COLORS.textPrimary, outline: 'none',
                          resize: 'vertical', fontFamily: 'inherit',
                        }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setRequesting(null)}
                      style={{
                        ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                        border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                      }}>취소</button>
              <button type="button" onClick={submit} disabled={busy}
                      style={{
                        ...BTN.md, background: COLORS.warning, color: '#fff', border: 'none',
                        cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
                      }}>
                {busy ? '신청 중...' : '🙋 매니저에게 신청'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
