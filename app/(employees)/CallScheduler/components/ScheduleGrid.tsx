'use client'
// ═══════════════════════════════════════════════════════════════════
// ScheduleGrid — 메인 캘린더 그리드 (슬롯 행 × 일자 열)
// 가로 스크롤 (반응형, CLAUDE.md 규칙 19)
// ═══════════════════════════════════════════════════════════════════
import { useMemo, useState, useEffect, Fragment } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import AssignmentCell from './AssignmentCell'
import WorkerPicker from './WorkerPicker'
import { monthDays, dowIndex, DOW_LABEL, isOnExternalDuty } from '../utils/hours'
import { getAuthHeader } from '@/app/utils/auth-client'
import type {
  ScheduleDetail, Assignment, ShiftSlot, Worker, SpecialCode,
  GroupMemberSkipDate, SkipStatus,
} from '../utils/types'

interface Props {
  detail: ScheduleDetail
  onChanged: () => void  // 변경 후 부모에 reload 트리거
  myWorkerId?: string    // L-2 — 본인 워커 ID (있으면 「내것만」 토글 활성)
}

export default function ScheduleGrid({ detail, onChanged, myWorkerId }: Props) {
  const { schedule, slots, workers, assignments } = detail
  const days = useMemo(
    () => monthDays(schedule.year, schedule.month),
    [schedule.year, schedule.month],
  )

  // (date, slot_id, group_id) → assignment[] 매핑
  // N-25 Step B — group_id 포함 키 (같은 시프트가 여러 그룹에 있어도 분리)
  // N-25 Step A — 워커 name 사전순 sort (매일 같은 순서)
  // group_id 없는 옛 데이터는 (date, slot_id) 키로 backward compat
  const cellMap = useMemo(() => {
    const m = new Map<string, Assignment[]>()
    for (const a of assignments) {
      // group_id 있으면 (date, slot, group) 키 / 없으면 (date, slot) 키
      const k = a.group_id
        ? `${a.work_date}_${a.shift_slot_id}_${a.group_id}`
        : `${a.work_date}_${a.shift_slot_id}`
      const arr = m.get(k) || []
      arr.push(a)
      m.set(k, arr)
    }
    // 셀 내 worker chip sort — worker_id 의 그룹 priority 기준
    // workers 배열은 priority 정보 직접 없음 — name 사전순 sort 로 fallback (안정적)
    for (const [, arr] of m) {
      arr.sort((x, y) => {
        // 1) null worker (빈 셀) 는 뒤로
        if (!x.worker_id && y.worker_id) return 1
        if (x.worker_id && !y.worker_id) return -1
        if (!x.worker_id && !y.worker_id) return 0
        // 2) worker name 사전순 (안정 정렬 — 매일 같은 순서)
        const xName = workers.find(w => w.id === x.worker_id)?.name || ''
        const yName = workers.find(w => w.id === y.worker_id)?.name || ''
        return xName.localeCompare(yName, 'ko')
      })
    }
    return m
  }, [assignments, workers])

  const workerMap = useMemo(() => {
    const m = new Map<string, Worker>()
    for (const w of workers) m.set(w.id, w)
    return m
  }, [workers])

  // PR-2RR-a — 외부 cycle 정의된 워커들 (외부 직원 + cycle 셋팅)
  const externalCycleWorkers = useMemo(
    () => workers.filter(w =>
      w.is_external && w.cycle_days_on && w.cycle_start_date
    ),
    [workers],
  )

  // PR-2SS-Phase-J — 슬롯 → 그룹 매핑 (시간대 + 그룹 같이 표출)
  const [slotGroups, setSlotGroups] = useState<Record<string, { id: string; name: string; category: string; tone?: string; member_ids: string[] }>>({})
  // PR-2SS-Phase-J-3 — 그룹 멤버 매핑 (그룹별 회피/cycle 행 분리용)
  // N-25 — rotation_enabled + rotation_shifts 추가 (sequence 펼침용)
  const [allGroups, setAllGroups] = useState<Array<{
    id: string; name: string; category: string; shift_slot_id: string; member_ids: string[]
    rotation_enabled: boolean
    rotation_shifts: Array<{ shift_slot_id: string; sort_order: number }>
  }>>([])
  // K-3 — 그룹 × 워커 멤버 cfg (priority_level, dow prefer/avoid) — 색상 layer + 툴팁용
  const [memberCfgMap, setMemberCfgMap] = useState<Map<string, { priority_level: number; preferred_dow_prefer: string | null; preferred_dow_avoid: string | null }>>(new Map())
  useEffect(() => {
    let abort = false
    ;(async () => {
      try {
        const auth = await getAuthHeader()
        const res = await fetch('/api/call-scheduler/shift-groups', { headers: auth })
        const json = await res.json()
        if (abort) return
        if (res.ok && Array.isArray(json.data)) {
          const map: Record<string, { id: string; name: string; category: string; tone?: string; member_ids: string[] }> = {}
          const groupList: Array<{
            id: string; name: string; category: string; shift_slot_id: string; member_ids: string[]
            rotation_enabled: boolean
            rotation_shifts: Array<{ shift_slot_id: string; sort_order: number }>
          }> = []
          const cfgMap = new Map<string, { priority_level: number; preferred_dow_prefer: string | null; preferred_dow_avoid: string | null }>()
          for (const g of json.data) {
            if (!g.is_active) continue
            const memberIds = Array.isArray(g.members) ? g.members.map((m: any) => m.id) : []
            const rotationShifts = Array.isArray(g.rotation_shifts)
              ? g.rotation_shifts.map((rs: any) => ({
                  shift_slot_id: String(rs.shift_slot_id),
                  sort_order: Number(rs.sort_order || 0),
                }))
              : []
            groupList.push({
              id: g.id,
              name: g.name,
              category: g.category || 'general',
              shift_slot_id: g.shift_slot_id,
              member_ids: memberIds,
              rotation_enabled: Boolean(g.rotation_enabled),
              rotation_shifts: rotationShifts,
            })
            if (!map[g.shift_slot_id]) {
              map[g.shift_slot_id] = {
                id: g.id,
                name: g.name,
                category: g.category || 'general',
                tone: g.color_tone,
                member_ids: memberIds,
              }
            }
            // K-3 — 그룹 × 워커 cfg
            if (Array.isArray(g.members)) {
              for (const m of g.members) {
                cfgMap.set(`${g.id}_${m.id}`, {
                  priority_level: Number(m.priority_level || 2),
                  preferred_dow_prefer: m.preferred_dow_prefer ?? null,
                  preferred_dow_avoid: m.preferred_dow_avoid ?? null,
                })
              }
            }
          }
          setSlotGroups(map)
          setAllGroups(groupList)
          setMemberCfgMap(cfgMap)
        }
      } catch { /* graceful */ }
    })()
    return () => { abort = true }
  }, [schedule.id])

  // PR-2SS-h-4 — 회피일 fetch (월간 통합)
  const [skipDates, setSkipDates] = useState<GroupMemberSkipDate[]>([])
  useEffect(() => {
    let abort = false
    ;(async () => {
      try {
        const auth = await getAuthHeader()
        const monthStart = `${schedule.year}-${String(schedule.month).padStart(2, '0')}-01`
        const lastDay = new Date(schedule.year, schedule.month, 0).getDate()
        const monthEnd = `${schedule.year}-${String(schedule.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        const res = await fetch(
          `/api/call-scheduler/skip-dates?from=${monthStart}&to=${monthEnd}&status=approved,requested`,
          { headers: auth },
        )
        const json = await res.json()
        if (abort) return
        if (res.ok && Array.isArray(json.data)) {
          setSkipDates(json.data)
        }
      } catch { /* graceful */ }
    })()
    return () => { abort = true }
  }, [schedule.id, schedule.year, schedule.month, schedule.updated_at])

  // PR-2SS-h-4 — (worker_id, isoDate) → SkipStatus 매핑 + 사유
  const skipMap = useMemo(() => {
    const m = new Map<string, { status: SkipStatus; reason: string | null; group_name?: string }>()
    for (const s of skipDates) {
      const start = new Date(s.start_date + 'T00:00:00')
      const end = new Date(s.end_date + 'T00:00:00')
      const cur = new Date(start)
      while (cur <= end) {
        const iso = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
        const key = `${s.worker_id}_${iso}`
        // 기존 값이 approved 면 유지 (requested 우선순위 낮음)
        const existing = m.get(key)
        if (!existing || (existing.status === 'requested' && s.status === 'approved')) {
          m.set(key, {
            status: s.status,
            reason: s.reason,
            group_name: (s as any).group_name,
          })
        }
        cur.setDate(cur.getDate() + 1)
      }
    }
    return m
  }, [skipDates])

  // PR-2SS-h-4 — 회피일 신청한 워커들 (행 표출용)
  const skipWorkers = useMemo(() => {
    const ids = new Set(skipDates.map(s => s.worker_id))
    return workers.filter(w => ids.has(w.id))
  }, [skipDates, workers])

  // PR-2SS-Phase-E — 가드 위반 검사 (clientside)
  //   1) 시간 겹침: 같은 워커 같은 날 두 슬롯 시간 겹침
  //   2) 익일 휴식: overnight 슬롯 종료 시각 + slot.next_day_blocking_hours > 다음날 슬롯 시작
  //   3) 연속 한도: 워커별 N일 연속 근무 한도 도달
  const slotById = useMemo(() => {
    const m = new Map<string, ShiftSlot>()
    for (const s of slots) m.set(s.id, s)
    return m
  }, [slots])

  // (worker_id, date) → violation type set
  const violationMap = useMemo(() => {
    const m = new Map<string, Set<'time_conflict' | 'next_day_block' | 'consec_limit'>>()
    const add = (wId: string, date: string, type: 'time_conflict' | 'next_day_block' | 'consec_limit') => {
      const k = `${wId}_${date}`
      const s = m.get(k) || new Set()
      s.add(type); m.set(k, s)
    }

    // 워커별 일자별 assignments 인덱스
    const byWorkerDate = new Map<string, Array<{ a: Assignment; slot: ShiftSlot }>>()
    for (const a of assignments) {
      if (!a.worker_id) continue
      const slot = slotById.get(a.shift_slot_id)
      if (!slot) continue
      const k = `${a.worker_id}_${a.work_date}`
      const arr = byWorkerDate.get(k) || []
      arr.push({ a, slot })
      byWorkerDate.set(k, arr)
    }

    // 1) 시간 겹침 — 같은 워커 같은 날 두 슬롯
    const toMin = (t: string) => { const [h,m] = t.split(':').map(Number); return h*60 + m }
    for (const [key, arr] of byWorkerDate) {
      if (arr.length < 2) continue
      const [wId, date] = key.split('_')
      const ranges = arr.map(({ a, slot }) => {
        const start = toMin(slot.start_time)
        let end = toMin(slot.end_time)
        if (slot.is_overnight) end += 1440
        return { a, slot, start, end }
      })
      for (let i = 0; i < ranges.length; i++) {
        for (let j = i+1; j < ranges.length; j++) {
          const x = ranges[i], y = ranges[j]
          if (x.start < y.end && y.start < x.end) {
            add(wId, date, 'time_conflict')
          }
        }
      }
    }

    // 2) 익일 휴식 — 워커별 일자 정렬 후 인접 day 비교
    const byWorker = new Map<string, Array<{ a: Assignment; slot: ShiftSlot; date: string }>>()
    for (const a of assignments) {
      if (!a.worker_id || a.special_code === 'off') continue
      const slot = slotById.get(a.shift_slot_id)
      if (!slot) continue
      const arr = byWorker.get(a.worker_id) || []
      arr.push({ a, slot, date: a.work_date })
      byWorker.set(a.worker_id, arr)
    }
    for (const [wId, arr] of byWorker) {
      arr.sort((x, y) => x.date.localeCompare(y.date) || toMin(x.slot.start_time) - toMin(y.slot.start_time))
      for (let i = 0; i < arr.length - 1; i++) {
        const cur = arr[i], next = arr[i+1]
        const blocking = Number(cur.slot.next_day_blocking_hours || 0)
        if (blocking <= 0) continue
        // 종료 절대 분
        const curEnd = new Date(cur.date + 'T00:00:00').getTime() / 60000
          + toMin(cur.slot.end_time)
          + (cur.slot.is_overnight ? 1440 : 0)
        const nextStart = new Date(next.date + 'T00:00:00').getTime() / 60000
          + toMin(next.slot.start_time)
        const gap = (nextStart - curEnd) / 60
        if (gap < blocking) {
          add(wId, next.date, 'next_day_block')
        }
      }
    }

    // 3) 연속 한도 — 워커별 연속 근무일 카운트
    for (const [wId, arr] of byWorker) {
      const dates = Array.from(new Set(arr.map(x => x.date))).sort()
      let streak = 1
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i-1] + 'T00:00:00')
        const cur = new Date(dates[i] + 'T00:00:00')
        const diff = Math.round((cur.getTime() - prev.getTime()) / 86400000)
        if (diff === 1) streak += 1
        else streak = 1
        // worker / slot 한도 — 가장 작은 max_consecutive_days 적용
        const slotMaxes = arr.filter(x => x.date === dates[i]).map(x => x.slot.max_consecutive_days || 0).filter(n => n > 0)
        const slotMax = slotMaxes.length > 0 ? Math.min(...slotMaxes) : 0
        if (slotMax > 0 && streak > slotMax) {
          add(wId, dates[i], 'consec_limit')
        }
      }
    }

    return m
  }, [assignments, slotById])

  // N-25 Step B — slots → (group, slot) 단위 row 산출
  // N-40 — 매트릭스 뷰 모드 (카테고리 그룹 / 평면 시간순) 토글
  //   디폴트 'category' — 24/365 운영에서 주간/야간 분리 검수
  //   localStorage 로 사용자 선택 유지 (SSR-safe — 첫 mount 후 동기화)
  const [viewMode, setViewMode] = useState<'category' | 'flat'>('category')
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cs-matrix-view-mode')
      if (saved === 'flat' || saved === 'category') setViewMode(saved as 'category' | 'flat')
    }
  }, [])
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('cs-matrix-view-mode', viewMode)
    }
  }, [viewMode])
  // 카테고리 정렬 순서 (운영 흐름에 맞춰)
  const CATEGORY_ORDER: Record<string, number> = {
    '주간': 1, '저녁': 2, '야간': 3, '특수': 4, 'general': 5, '일반': 5,
  }
  const CATEGORY_LABEL: Record<string, string> = {
    '주간': '☀️ 주간', '저녁': '🌆 저녁', '야간': '🌙 야간',
    '특수': '🎌 특수', 'general': '📁 일반', '일반': '📁 일반',
  }

  // N-26 — row 를 시작 시간 순으로 정렬 (그룹과 무관 — 사용자 의도)
  // N-40 — viewMode='category' 면 카테고리 우선 → 안에서 시간순
  // rotation_enabled 그룹은 rotation_shifts 의 모든 시프트를 sub-row 로 펼침
  // 일반 그룹은 g.shift_slot_id 단일 row
  // 그룹 없는 slot 은 groupInfo=null
  type GroupInfo = { id: string; name: string; category: string; member_ids: string[] }
  const slotsByGroup = useMemo(() => {
    const rows: Array<{ slot: ShiftSlot; groupInfo: GroupInfo | null; rotationOrder: number }> = []
    const seenPairs = new Set<string>()  // group_id + slot_id 중복 방지
    // 1) 활성 그룹별 row 생성 (rotation 은 sequence 펼침)
    for (const g of allGroups) {
      const groupInfo: GroupInfo = {
        id: g.id, name: g.name, category: g.category, member_ids: g.member_ids,
      }
      if (g.rotation_enabled && g.rotation_shifts.length > 0) {
        // rotation sequence 모두 row
        const sorted = [...g.rotation_shifts].sort((a, b) => a.sort_order - b.sort_order)
        for (let i = 0; i < sorted.length; i++) {
          const slot = slots.find(s => s.id === sorted[i].shift_slot_id)
          if (slot) {
            const key = `${g.id}_${slot.id}`
            if (!seenPairs.has(key)) {
              rows.push({ slot, groupInfo, rotationOrder: i + 1 })
              seenPairs.add(key)
            }
          }
        }
      } else {
        const slot = slots.find(s => s.id === g.shift_slot_id)
        if (slot) {
          const key = `${g.id}_${slot.id}`
          if (!seenPairs.has(key)) {
            rows.push({ slot, groupInfo, rotationOrder: 0 })
            seenPairs.add(key)
          }
        }
      }
    }
    // 2) 그룹 없는 slot — 별도 row (groupInfo=null)
    const usedSlotIds = new Set(rows.map(r => r.slot.id))
    for (const s of slots) {
      if (!usedSlotIds.has(s.id)) {
        rows.push({ slot: s, groupInfo: null, rotationOrder: 0 })
      }
    }
    // N-40 — viewMode='category' 면 카테고리 우선, 'flat' 이면 시간순만
    rows.sort((a, b) => {
      if (viewMode === 'category') {
        const aCat = CATEGORY_ORDER[a.groupInfo?.category || 'general'] || 99
        const bCat = CATEGORY_ORDER[b.groupInfo?.category || 'general'] || 99
        if (aCat !== bCat) return aCat - bCat
      }
      // 시작 시간 ASC (overnight 도 자기 start_time 기준)
      const toMin = (t: string) => {
        const [h, m] = t.split(':').map(Number)
        return (h || 0) * 60 + (m || 0)
      }
      const aMin = toMin(a.slot.start_time)
      const bMin = toMin(b.slot.start_time)
      if (aMin !== bMin) return aMin - bMin
      // 동시간이면 slot.code 사전순
      return a.slot.code.localeCompare(b.slot.code)
    })
    return rows
  }, [allGroups, slots, viewMode])

  const [pickerSlot, setPickerSlot] = useState<ShiftSlot | null>(null)
  const [pickerDate, setPickerDate] = useState<string>('')
  // PR-2OO: 편집 중인 assignment id (null=새 워커 추가, 존재=기존 row 수정)
  const [pickerAssignmentId, setPickerAssignmentId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // 빈자리 강조 모드 (PR-2S)
  const [emptyOnly, setEmptyOnly] = useState(false)
  // 시프트 교체 모드 (PR-2R) — 두 셀 선택 후 swap
  const [swapMode, setSwapMode] = useState(false)
  const [swapFirst, setSwapFirst] = useState<{ a: Assignment | null; slotId: string; date: string } | null>(null)
  // PR-2SS-Phase-J-2C — 외부/회피 행 매니저 전용 토글 (기본 숨김 — 다른 직원 시야 차단)
  const [showPrivate, setShowPrivate] = useState(false)
  // L-2 — 「내것만 보기」 토글 (myWorkerId 있을 때만)
  const [meOnly, setMeOnly] = useState(false)

  // PR-2OO: 멀티 워커 — pickerAssignmentId 로 특정 row 추적
  const currentAssignment = pickerSlot && pickerDate && pickerAssignmentId
    ? (cellMap.get(`${pickerDate}_${pickerSlot.id}`) || []).find(a => a.id === pickerAssignmentId) || null
    : null

  const handleSave = async (workerId: string | null, special: SpecialCode) => {
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          schedule_id: schedule.id,
          work_date: pickerDate,
          shift_slot_id: pickerSlot!.id,
          worker_id: workerId,
          special_code: special,
          // PR-2OO: 기존 row 명시 (수정 모드)
          assignment_id: pickerAssignmentId || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      onChanged()
    } catch (e: any) {
      alert(e?.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!currentAssignment) return
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(
        `/api/call-scheduler/assignments?id=${currentAssignment.id}`,
        { method: 'DELETE', headers: auth },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '삭제 실패')
      onChanged()
    } catch (e: any) {
      alert(e?.message || '삭제 실패')
    } finally {
      setSaving(false)
    }
  }

  // PR-2R 워커 swap — 두 셀의 worker_id 교환 (PR-2OO: 특정 row id 기준)
  const handleSwap = async (
    second: { a: Assignment | null; slotId: string; date: string },
  ) => {
    if (!swapFirst) return
    const first = swapFirst
    setSwapFirst(null)
    if (!first.a || !second.a) {
      alert('swap 은 두 워커가 모두 배정된 셀끼리만 가능합니다.')
      return
    }
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      // first row 에 second 워커, second row 에 first 워커
      await fetch('/api/call-scheduler/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          schedule_id: schedule.id,
          work_date: first.date,
          shift_slot_id: first.slotId,
          worker_id: second.a.worker_id,
          special_code: second.a.special_code,
          assignment_id: first.a.id,
        }),
      })
      await fetch('/api/call-scheduler/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          schedule_id: schedule.id,
          work_date: second.date,
          shift_slot_id: second.slotId,
          worker_id: first.a.worker_id,
          special_code: first.a.special_code,
          assignment_id: second.a.id,
        }),
      })
      onChanged()
    } catch (e: any) {
      alert(e?.message || 'swap 실패')
    } finally {
      setSaving(false)
    }
  }

  // PR-2Z 빠른 처리 (우클릭) — 셀의 special_code 만 즉석 변경
  const handleQuickAction = async (
    a: Assignment | null,
    slot: ShiftSlot,
    workDate: string,
    action: 'off' | 'am_half' | 'pm_half' | 'am_free' | 'pm_free' | 'clear',
  ) => {
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      if (action === 'clear') {
        if (!a) return
        const res = await fetch(`/api/call-scheduler/assignments?id=${a.id}`, {
          method: 'DELETE', headers: auth,
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '삭제 실패')
      } else {
        // workerId 는 기존 유지 (없으면 null) — PR-2OO: 특정 row id 기준
        const res = await fetch('/api/call-scheduler/assignments', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({
            schedule_id: schedule.id,
            work_date: workDate,
            shift_slot_id: slot.id,
            worker_id: a?.worker_id || null,
            special_code: action,
            assignment_id: a?.id,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '저장 실패')
      }
      onChanged()
    } catch (e: any) {
      alert(e?.message || '오류')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      ...GLASS.L4,
      borderRadius: 12,
      padding: 8,
      overflowX: 'auto',
    }}>
      {/* 상단 헬퍼 — 빈자리 강조 / swap 모드 / 카운트 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 6px 8px', flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontSize: 11, color: COLORS.textMuted }}>
          {(() => {
            // 빈 슬롯 카운트: 슬롯 × 일자 × 모든 셀 중 worker_id NULL 또는 special=off 면 '안 채워진' 으로 카운트
            // 실제로는 cs_assignments INSERT 안 된 (date, slot) 조합도 빈자리
            const totalCells = days.length * slots.length
            const filled = assignments.filter(a => a.worker_id && a.special_code !== 'off').length
            const empty = totalCells - filled
            return (
              <>
                전체 {totalCells} 셀 ·{' '}
                <span style={{ color: COLORS.success, fontWeight: 700 }}>채움 {filled}</span> ·{' '}
                <span style={{ color: empty > 0 ? COLORS.danger : COLORS.textMuted, fontWeight: 700 }}>
                  비어있음 {empty}
                </span>
              </>
            )
          })()}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button"
                  onClick={() => setEmptyOnly(o => !o)}
                  style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: emptyOnly ? COLORS.bgRed : 'transparent',
                    color: emptyOnly ? COLORS.danger : COLORS.textSecondary,
                    border: `1px solid ${emptyOnly ? COLORS.borderRed : COLORS.borderFaint}`,
                    cursor: 'pointer',
                  }}
                  title="빈 셀만 빨간색으로 강조 표시">
            {emptyOnly ? '🔍 빈자리 강조 ON' : '👀 빈자리 강조'}
          </button>
          <button type="button"
                  onClick={() => { setSwapMode(s => !s); setSwapFirst(null) }}
                  style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: swapMode ? COLORS.bgViolet : 'transparent',
                    color: swapMode ? '#7c3aed' : COLORS.textSecondary,
                    border: `1px solid ${swapMode ? COLORS.borderViolet : COLORS.borderFaint}`,
                    cursor: 'pointer',
                  }}
                  title="두 셀 클릭 → 워커 교체">
            {swapMode
              ? (swapFirst ? `🔄 두 번째 셀 선택` : '🔄 swap: 첫 셀 선택')
              : '🔄 시프트 교체'}
          </button>
          {/* L-2 — 「내것만 보기」 토글 (myWorkerId 있을 때만 노출) */}
          {myWorkerId && (
            <button type="button"
                    onClick={() => setMeOnly(m => !m)}
                    style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: meOnly ? COLORS.bgGreen : 'transparent',
                      color: meOnly ? COLORS.success : COLORS.textSecondary,
                      border: `1px solid ${meOnly ? COLORS.borderGreen : COLORS.borderFaint}`,
                      cursor: 'pointer',
                    }}
                    title="본인 셀만 강조 (다른 워커 흐림)">
              {meOnly ? '🙋 내것만 ON' : '🙋 내것만'}
            </button>
          )}
          {/* J-2C — 외부/회피 행 토글 (매니저 전용, 기본 숨김) */}
          <button type="button"
                  onClick={() => setShowPrivate(p => !p)}
                  style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: showPrivate ? COLORS.bgAmber : 'transparent',
                    color: showPrivate ? COLORS.warning : COLORS.textSecondary,
                    border: `1px solid ${showPrivate ? COLORS.borderAmber : COLORS.borderFaint}`,
                    cursor: 'pointer',
                  }}
                  title="외부 근무 / 회피일 행 보기 (매니저 계획용 — 다른 직원 시야엔 기본 숨김)">
            {showPrivate ? '👁 외부/회피 표시' : '🙈 외부/회피 숨김'}
          </button>
          {/* N-40 — 매트릭스 정렬 모드 토글 (카테고리 / 평면 시간순) */}
          <button type="button"
                  onClick={() => setViewMode(m => m === 'category' ? 'flat' : 'category')}
                  style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: viewMode === 'category' ? COLORS.bgBlue : 'transparent',
                    color: viewMode === 'category' ? COLORS.info : COLORS.textSecondary,
                    border: `1px solid ${viewMode === 'category' ? COLORS.borderBlue : COLORS.borderFaint}`,
                    cursor: 'pointer',
                  }}
                  title="카테고리(주간/야간/특수) 별로 그룹핑 ↔ 평면 시간순">
            {viewMode === 'category' ? '🗂 카테고리 그룹' : '⏱ 평면 시간순'}
          </button>
        </div>
      </div>
      <table style={{
        width: 'max-content',
        borderCollapse: 'separate',
        borderSpacing: 1,
        fontSize: 11,
      }}>
        <thead>
          <tr>
            <th style={{
              minWidth: 100, padding: '4px 6px', position: 'sticky', left: 0,
              background: COLORS.bgGray, color: COLORS.textSecondary,
              textAlign: 'left', fontWeight: 700, borderRadius: 4, zIndex: 2,
              fontSize: 11,
            }}>
              시프트
            </th>
            {days.map(d => {
              const dow = dowIndex(d)
              const day = Number(d.split('-')[2])
              const isWeekend = dow === 0 || dow === 6
              return (
                <th
                  key={d}
                  style={{
                    minWidth: 48, padding: '4px 2px', textAlign: 'center',  // J-2B — 56 → 48 (너비 축소)
                    background: isWeekend ? COLORS.bgRed : COLORS.bgGray,
                    color: dow === 0 ? COLORS.danger : (dow === 6 ? COLORS.info : COLORS.textSecondary),
                    fontWeight: 700, borderRadius: 4,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 500, lineHeight: 1.1 }}>
                    {DOW_LABEL[dow]}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.2 }}>{day}</div>
                </th>
              )
            })}
          </tr>
          {/* PR-2RR-a — 외부 직원 cycle 시각화 행 (그룹 미배정 워커만 — 그룹별 행은 tbody 섹션에서) */}
          {/* J-2C — 매니저 토글 (showPrivate) 켜졌을 때만 표출 */}
          {showPrivate && externalCycleWorkers.filter(ew => {
            // 어느 그룹의 멤버인지 — 그룹별 행에서 표시되므로 여기는 미배정만
            return !allGroups.some(g => g.member_ids.includes(ew.id))
          }).map(ew => (
            <tr key={`ext-${ew.id}`}>
              <td style={{
                padding: '2px 6px', position: 'sticky', left: 0,
                background: 'rgba(243,244,246,0.95)',
                color: COLORS.textSecondary, fontWeight: 600,
                borderRadius: 4, whiteSpace: 'nowrap', zIndex: 1,
                fontSize: 10,
              }}>
                <span style={{ marginRight: 4 }}>🏢</span>
                {ew.name} <span style={{ fontSize: 9, color: COLORS.textMuted }}>외부</span>
              </td>
              {days.map(d => {
                const onDuty = isOnExternalDuty(ew, d)
                return (
                  <td key={d} style={{
                    padding: 0, minWidth: 48, height: 14,
                    background: onDuty ? '#9ca3af' : 'transparent',
                    borderTop: `1px solid ${COLORS.borderFaint}`,
                    borderBottom: `1px solid ${COLORS.borderFaint}`,
                    cursor: 'help',
                  }}
                  title={onDuty
                    ? `${ew.name} 외부 근무 (당사 X) — ${d}`
                    : `${ew.name} 외부 휴무 (당사 가능) — ${d}`} />
                )
              })}
            </tr>
          ))}
          {/* PR-2SS-h-4 → J-3 — 회피일 시각화 행 (그룹 미배정 워커만 — 그룹별 행은 tbody 섹션에서) */}
          {/* J-2C — 매니저 토글 (showPrivate) 켜졌을 때만 표출 */}
          {showPrivate && skipWorkers.filter(sw => !allGroups.some(g => g.member_ids.includes(sw.id))).map(sw => (
            <tr key={`skip-${sw.id}`}>
              <td style={{
                padding: '2px 6px', position: 'sticky', left: 0,
                background: 'rgba(254,243,199,0.85)',
                color: COLORS.warning, fontWeight: 600,
                borderRadius: 4, whiteSpace: 'nowrap', zIndex: 1,
                fontSize: 10,
              }}>
                <span style={{ marginRight: 4 }}>🛌</span>
                {sw.name} <span style={{ fontSize: 9, color: COLORS.textMuted }}>회피</span>
              </td>
              {days.map(d => {
                const skip = skipMap.get(`${sw.id}_${d}`)
                if (!skip) {
                  return (
                    <td key={d} style={{
                      padding: 0, minWidth: 48, height: 14,
                      borderTop: `1px solid ${COLORS.borderFaint}`,
                      borderBottom: `1px solid ${COLORS.borderFaint}`,
                    }} />
                  )
                }
                const isApproved = skip.status === 'approved'
                return (
                  <td key={d} style={{
                    padding: 0, minWidth: 48, height: 14,
                    background: isApproved ? COLORS.bgAmber : COLORS.bgRed,
                    color: isApproved ? COLORS.warning : COLORS.danger,
                    borderTop: `1px solid ${COLORS.borderFaint}`,
                    borderBottom: `1px solid ${COLORS.borderFaint}`,
                    fontSize: 9, textAlign: 'center', fontWeight: 700,
                    cursor: 'help',
                  }}
                  title={`${sw.name} ${isApproved ? '회피 (승인)' : '회피 신청 (대기)'}${skip.group_name ? ' [' + skip.group_name + ']' : ''}${skip.reason ? ' — ' + skip.reason : ''} — ${d}`}
                  >
                    {isApproved ? '🛌' : '⏳'}
                  </td>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {/* PR-2SS-Phase-J-3 — DISABLED 복잡 구조 (Fragment 인라인으로 대체) */}
          {false && (() => {
            const sections: any[] = []
            return sections.flatMap((section: any) => {
              const cat = section.category
              const sectionColor = cat === '야간' ? COLORS.bgViolet : cat === '저녁' ? COLORS.bgAmber
                                 : cat === '주간' ? COLORS.bgBlue : cat === '특수' ? COLORS.bgRed : COLORS.bgGray
              const sectionBorder = cat === '야간' ? COLORS.borderViolet : cat === '저녁' ? COLORS.borderAmber
                                  : cat === '주간' ? COLORS.borderBlue : cat === '특수' ? COLORS.borderRed : COLORS.borderFaint
              const sectionExt = externalCycleWorkers.filter(ew => section.memberIds.includes(ew.id))
              const sectionSkip = skipWorkers.filter(sw => section.memberIds.includes(sw.id))
              const out: React.ReactNode[] = []
              // 그룹 헤더
              out.push(
                <tr key={`gh-${section.key}`}>
                  <td colSpan={days.length + 1} style={{
                    padding: '6px 12px', position: 'sticky', left: 0,
                    background: sectionColor, color: COLORS.textPrimary,
                    fontWeight: 800, fontSize: 12,
                    borderTop: `2px solid ${sectionBorder}`,
                    borderBottom: `1px solid ${sectionBorder}`,
                  }}>
                    🚧 {section.groupName}
                    <span style={{ fontSize: 10, fontWeight: 500, color: COLORS.textMuted, marginLeft: 8 }}>
                      {cat} · 슬롯 {section.slots.length} · 멤버 {section.memberIds.length}명
                    </span>
                  </td>
                </tr>
              )
              // 그룹 멤버 외부 cycle 행
              for (const ew of sectionExt) {
                out.push(
                  <tr key={`gex-${section.key}-${ew.id}`}>
                    <td style={{
                      padding: '2px 6px 2px 22px', position: 'sticky', left: 0,
                      background: 'rgba(243,244,246,0.92)', color: COLORS.textSecondary,
                      fontWeight: 600, borderRadius: 4, whiteSpace: 'nowrap', zIndex: 1, fontSize: 10,
                    }}>
                      🏢 {ew.name} <span style={{ fontSize: 9, color: COLORS.textMuted }}>외부</span>
                    </td>
                    {days.map(d => {
                      const onDuty = isOnExternalDuty(ew, d)
                      return (
                        <td key={d} style={{
                          padding: 0, minWidth: 48, height: 14,
                          background: onDuty ? '#9ca3af' : 'transparent',
                          borderTop: `1px solid ${COLORS.borderFaint}`,
                          borderBottom: `1px solid ${COLORS.borderFaint}`,
                          cursor: 'help',
                        }} title={onDuty ? `${ew.name} 외부 근무 (당사 X) — ${d}` : `${ew.name} 외부 휴무 — ${d}`} />
                      )
                    })}
                  </tr>
                )
              }
              // 그룹 멤버 회피 행
              for (const sw of sectionSkip) {
                out.push(
                  <tr key={`gsk-${section.key}-${sw.id}`}>
                    <td style={{
                      padding: '2px 6px 2px 22px', position: 'sticky', left: 0,
                      background: 'rgba(254,243,199,0.85)', color: COLORS.warning,
                      fontWeight: 600, borderRadius: 4, whiteSpace: 'nowrap', zIndex: 1, fontSize: 10,
                    }}>
                      🛌 {sw.name} <span style={{ fontSize: 9, color: COLORS.textMuted }}>회피</span>
                    </td>
                    {days.map(d => {
                      const skip = skipMap.get(`${sw.id}_${d}`)
                      if (!skip) return <td key={d} style={{ padding: 0, minWidth: 56, height: 14, borderTop: `1px solid ${COLORS.borderFaint}`, borderBottom: `1px solid ${COLORS.borderFaint}` }} />
                      const ok = skip.status === 'approved'
                      return (
                        <td key={d} style={{
                          padding: 0, minWidth: 48, height: 14,
                          background: ok ? COLORS.bgAmber : COLORS.bgRed,
                          color: ok ? COLORS.warning : COLORS.danger,
                          borderTop: `1px solid ${COLORS.borderFaint}`,
                          borderBottom: `1px solid ${COLORS.borderFaint}`,
                          fontSize: 9, textAlign: 'center', fontWeight: 700, cursor: 'help',
                        }} title={`${sw.name} ${ok ? '회피 (승인)' : '회피 신청 (대기)'}${skip.reason ? ' — ' + skip.reason : ''} — ${d}`}>
                          {ok ? '🛌' : '⏳'}
                        </td>
                      )
                    })}
                  </tr>
                )
              }
              return out
            })
          })()}
          {/* 슬롯 행 (그룹 헤더 사이에 끼움 — index 비교로 그룹 변경 시 헤더 추가) */}
          {/* N-25 Step B — slotsByGroup 으로 변경 (rotation 그룹은 sequence 펼침) */}
          {/* N-40 — viewMode='category' 면 카테고리 변경 시 섹션 헤더 row 삽입 */}
          {slotsByGroup.map(({ slot, groupInfo, rotationOrder }, slotIdx) => {
            // N-40 — 카테고리 섹션 헤더 row (카테고리 모드 + 카테고리 첫 등장 시)
            const prevRow = slotIdx > 0 ? slotsByGroup[slotIdx - 1] : null
            const curCat = groupInfo?.category || 'general'
            const prevCat = prevRow ? (prevRow.groupInfo?.category || 'general') : null
            const isNewCategoryHeader = viewMode === 'category' && curCat !== prevCat
            const catLabel = CATEGORY_LABEL[curCat] || `📁 ${curCat}`
            // PR-2SS-Phase-J-3 — 그룹 변경 시 헤더 + 그룹 멤버 cycle/회피 행 inline
            // N-25 Step B — groupInfo 우선 (없으면 slotGroups[slot.id] fallback)
            // N-26 — 시간순 정렬이라 같은 그룹이 비연속적 — 그룹 헤더 row 비활성 (isNewGroupSection=false)
            const curGrp = groupInfo || slotGroups[slot.id] || null
            const isNewGroupSection = false  // N-26 — 시간순 view 라 그룹 헤더 row 표시 X
            // J-2C — 매니저 토글 OFF 면 그룹 섹션 안 외부/회피 행 모두 빈 배열 (다른 직원 시야 차단)
            const sectionExt = (showPrivate && isNewGroupSection && curGrp)
              ? externalCycleWorkers.filter(ew => curGrp.member_ids.includes(ew.id))
              : []
            const sectionSkip = (showPrivate && isNewGroupSection && curGrp)
              ? skipWorkers.filter(sw => curGrp.member_ids.includes(sw.id))
              : []
            const cat = curGrp?.category || 'general'
            const headerColor = cat === '야간' ? COLORS.bgViolet : cat === '저녁' ? COLORS.bgAmber
                              : cat === '주간' ? COLORS.bgBlue : cat === '특수' ? COLORS.bgRed : COLORS.bgGray
            const headerBorder = cat === '야간' ? COLORS.borderViolet : cat === '저녁' ? COLORS.borderAmber
                               : cat === '주간' ? COLORS.borderBlue : cat === '특수' ? COLORS.borderRed : COLORS.borderFaint
            const _slotRow = (() => {
            // Phase J-2B — 그룹 + 24h 시간 막대 (항상 24h 스케일 + 익일 wrap 분리)
            const grp = slotGroups[slot.id]
            const toMin = (t: string) => { const [h,m] = t.split(':').map(Number); return h*60 + m }
            const startMin = toMin(slot.start_time)
            const rawEndMin = toMin(slot.end_time)
            const isOvernight = slot.is_overnight
            const BAR_TOTAL = 1440  // 항상 24h
            // overnight: [start → 24:00] + [00:00 → end] 두 segment 로 wrap 표출
            const seg1Left = startMin
            const seg1Width = isOvernight ? (1440 - startMin) : (rawEndMin - startMin)
            const seg2Width = isOvernight ? rawEndMin : 0
            const seg1LeftPct = (seg1Left / BAR_TOTAL) * 100
            const seg1WidthPct = (seg1Width / BAR_TOTAL) * 100
            const seg2WidthPct = (seg2Width / BAR_TOTAL) * 100
            // 그룹 카테고리별 색
            const grpTone = grp?.category === '야간' ? COLORS.bgViolet
                          : grp?.category === '저녁' ? COLORS.bgAmber
                          : grp?.category === '주간' ? COLORS.bgBlue
                          : grp?.category === '특수' ? COLORS.bgRed
                          : COLORS.bgGray
            const grpBorder = grp?.category === '야간' ? COLORS.borderViolet
                            : grp?.category === '저녁' ? COLORS.borderAmber
                            : grp?.category === '주간' ? COLORS.borderBlue
                            : grp?.category === '특수' ? COLORS.borderRed
                            : COLORS.borderFaint
            return (
            // N-25 Step B — key 에 group_id 포함 (같은 slot 이 여러 그룹 row 에)
            <tr key={`${curGrp?.id || 'nogrp'}_${slot.id}`}>
              <td style={{
                padding: '4px 6px', position: 'sticky', left: 0,
                background: 'rgba(255,255,255,0.95)',
                color: COLORS.textPrimary, fontWeight: 600,
                borderRadius: 4, whiteSpace: 'nowrap', zIndex: 1,
                fontSize: 11, minWidth: 148, maxWidth: 168,  // J-2B — 200~220 → 148~168
                borderLeft: `3px solid ${grpBorder}`,
              }}>
                {/* 1행: 슬롯 코드 + 시간 + 그룹 라벨 (N-26 — 시간순 view 라 라벨 inline) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  <span style={{
                    fontSize: 9, color: COLORS.textMuted, fontFamily: 'monospace', fontWeight: 700,
                  }}>{slot.code}</span>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>
                    {slot.start_time.substring(0,5)}~{slot.end_time.substring(0,5)}
                    {isOvernight && <span style={{ fontSize: 8, color: COLORS.warning, marginLeft: 2 }}>익</span>}
                  </span>
                  {curGrp && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: COLORS.textSecondary,
                      background: headerColor, padding: '1px 5px', borderRadius: 4,
                      border: `1px solid ${headerBorder}`,
                      marginLeft: 'auto',
                    }} title={`그룹: ${curGrp.name}${rotationOrder > 0 ? ` (rotation ${rotationOrder}번)` : ''}`}>
                      {curGrp.name}
                      {rotationOrder > 0 && <span style={{ marginLeft: 2, opacity: 0.7 }}>·{rotationOrder}</span>}
                    </span>
                  )}
                </div>
                {/* 2행: 24h 시간 막대 (항상 24h, 익일 wrap 분리) */}
                <div style={{
                  position: 'relative', width: '100%', height: 12,
                  background: 'rgba(0,0,0,0.04)', borderRadius: 3, overflow: 'hidden',
                  border: '1px solid rgba(0,0,0,0.06)',
                }} title={`${slot.start_time.substring(0,5)} ~ ${slot.end_time.substring(0,5)}${isOvernight ? ' (익일 wrap)' : ''}`}>
                  {/* 6시간 눈금 (0/6/12/18/24) */}
                  {[0, 6, 12, 18, 24].map(h => (
                    <div key={h} style={{
                      position: 'absolute',
                      left: `${(h*60/BAR_TOTAL)*100}%`,
                      top: 0, bottom: 0, width: 1,
                      background: h === 12 ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.08)',
                    }} />
                  ))}
                  {/* Segment 1: 시작 → (익일이면 24:00, 아니면 종료) */}
                  {seg1WidthPct > 0 && (
                    <div style={{
                      position: 'absolute',
                      left: `${seg1LeftPct}%`,
                      width: `${seg1WidthPct}%`,
                      height: '100%',
                      background: grpBorder,
                      borderRadius: isOvernight ? '2px 0 0 2px' : 2,
                    }} />
                  )}
                  {/* Segment 2: 익일 0:00 → 종료 (overnight wrap) */}
                  {seg2WidthPct > 0 && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      width: `${seg2WidthPct}%`,
                      height: '100%',
                      background: grpBorder,
                      borderRadius: '0 2px 2px 0',
                      opacity: 0.65,
                      borderLeft: `1px dashed rgba(255,255,255,0.7)`,
                    }} />
                  )}
                </div>
                {/* 3행: 시간 라벨 (0/6/12/18/24) */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 7, color: COLORS.textMuted, marginTop: 1,
                  fontFamily: 'monospace', lineHeight: 1,
                }}>
                  <span>0</span><span>6</span><span>12</span><span>18</span><span>24</span>
                </div>
              </td>
              {days.map(d => {
                // PR-2OO: 1셀에 N워커 가능 — 모든 row 표시
                // N-25 Step B — group_id 포함 키 우선, fallback 으로 옛 키 + 그룹 멤버 필터
                const arrWithGroup = curGrp?.id
                  ? cellMap.get(`${d}_${slot.id}_${curGrp.id}`) || []
                  : []
                const arrLegacy = cellMap.get(`${d}_${slot.id}`) || []
                // 그룹 row 인데 group_id 채워진 데이터가 있으면 그것만 사용
                // 그룹 row + group_id 없는 옛 데이터면 그룹 멤버로 필터
                // 그룹 없는 row 면 그대로 모든 worker
                const arr = curGrp
                  ? (arrWithGroup.length > 0
                      ? arrWithGroup
                      : arrLegacy.filter(a => !a.worker_id || curGrp.member_ids.includes(a.worker_id)))
                  : arrLegacy
                const isEmpty = arr.length === 0
                  || arr.every(a => !a.worker_id && a.special_code !== 'off')
                // J-2B — 셀 td 너비 56 → 48 (화면 너비 축소)
                // L-2 — meOnly 모드: 본인 워커 없는 셀 흐림
                const hasMe = myWorkerId && arr.some(a => a.worker_id === myWorkerId)
                const meDim: React.CSSProperties = (meOnly && myWorkerId && !hasMe)
                  ? { opacity: 0.25 } : {}
                const cellTdStyle: React.CSSProperties = emptyOnly && isEmpty ? {
                  padding: 1, minWidth: 48, verticalAlign: 'top',
                  background: COLORS.bgRed,
                  border: `2px dashed ${COLORS.borderRed}`,
                  borderRadius: 4,
                  ...meDim,
                } : { padding: 1, minWidth: 48, verticalAlign: 'top', ...meDim }
                const isSwapFirst = swapFirst && swapFirst.slotId === slot.id && swapFirst.date === d
                const finalCellStyle: React.CSSProperties = isSwapFirst
                  ? { ...cellTdStyle, background: COLORS.bgViolet, border: `2px solid #7c3aed`, borderRadius: 4 }
                  : cellTdStyle
                // Phase D — dow 계산 (요일 색상 layer 용)
                const cellDow = dowIndex(d)
                // Phase F — 빈 셀 사유 (이 일자에 회피 신청한 워커 정보)
                const dateSkippers = skipDates
                  .filter(s => d >= s.start_date && d <= s.end_date)
                  .map(s => `${(s as any).worker_name || s.worker_id.slice(0,4)}${s.status === 'requested' ? '⏳' : ''}`)
                const emptyReasonText = dateSkippers.length > 0
                  ? `회피: ${dateSkippers.join(', ')}`
                  : ''
                return (
                  <td key={d} style={finalCellStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {arr.length === 0 ? (
                        <AssignmentCell
                          assignment={null}
                          worker={null}
                          onClick={() => {
                            if (swapMode) return  // 빈 셀 swap 비활성
                            setPickerSlot(slot); setPickerDate(d); setPickerAssignmentId(null)
                          }}
                          onQuickAction={undefined}
                          dow={cellDow}
                          emptyReason={emptyReasonText}
                        />
                      ) : (
                        arr.map(a => {
                          const w = a.worker_id ? workerMap.get(a.worker_id) || null : null
                          // Phase E — 워커 가드 위반 검사
                          const violations = a.worker_id
                            ? violationMap.get(`${a.worker_id}_${d}`)
                            : undefined
                          // K-3 — 슬롯의 그룹에서 그 워커의 멤버 cfg lookup → 색상 layer
                          const slotGrp = slotGroups[slot.id]
                          const memberCfg = (slotGrp && a.worker_id)
                            ? memberCfgMap.get(`${slotGrp.id}_${a.worker_id}`)
                            : undefined
                          return (
                            <AssignmentCell
                              key={a.id}
                              assignment={a}
                              worker={w}
                              onClick={() => {
                                if (swapMode) {
                                  if (!swapFirst) {
                                    setSwapFirst({ a, slotId: slot.id, date: d })
                                  } else {
                                    handleSwap({ a, slotId: slot.id, date: d })
                                  }
                                } else {
                                  setPickerSlot(slot); setPickerDate(d); setPickerAssignmentId(a.id)
                                }
                              }}
                              onQuickAction={swapMode ? undefined : (action) => handleQuickAction(a, slot, d, action)}
                              dow={cellDow}
                              memberPreferDow={memberCfg?.preferred_dow_prefer || null}
                              memberAvoidDow={memberCfg?.preferred_dow_avoid || null}
                              violations={violations}
                            />
                          )
                        })
                      )}
                      {/* 워커 추가 버튼 — 항상 노출 (1셀 N워커) */}
                      {!swapMode && arr.length > 0 && (
                        <button type="button"
                          onClick={() => { setPickerSlot(slot); setPickerDate(d); setPickerAssignmentId(null) }}
                          style={{
                            height: 14, padding: 0, border: `1px dashed ${COLORS.borderFaint}`,
                            background: 'transparent', borderRadius: 3, cursor: 'pointer',
                            fontSize: 9, color: COLORS.textMuted, lineHeight: 1,
                          }}
                          title="워커 추가">
                          +
                        </button>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
            )
            })()
            // PR-2SS-Phase-J-3 — 그룹 헤더 + 멤버 cycle/회피 행 + 슬롯 행 묶음
            // N-40 fix — Fragment key 강화 (group_id + slot_id + idx) — 카테고리 모드 중복 방지
            return (
              <Fragment key={`${curGrp?.id || 'nogrp'}_${slot.id}_${slotIdx}`}>
                {/* N-40 — 카테고리 섹션 헤더 (viewMode='category' + 카테고리 변경 시) */}
                {isNewCategoryHeader && (
                  <tr key={`cathdr-${slotIdx}-${curCat}`}>
                    <td colSpan={days.length + 1} style={{
                      padding: '8px 14px', position: 'sticky', left: 0,
                      background: curCat === '주간' ? COLORS.bgBlue
                                : curCat === '저녁' ? COLORS.bgAmber
                                : curCat === '야간' ? COLORS.bgViolet
                                : curCat === '특수' ? COLORS.bgRed
                                : COLORS.bgGray,
                      color: curCat === '주간' ? COLORS.info
                           : curCat === '저녁' ? COLORS.warning
                           : curCat === '야간' ? '#7c3aed'
                           : curCat === '특수' ? COLORS.danger
                           : COLORS.textSecondary,
                      fontWeight: 800, fontSize: 13,
                      borderTop: `4px solid ${
                        curCat === '주간' ? COLORS.borderBlue
                        : curCat === '저녁' ? COLORS.borderAmber
                        : curCat === '야간' ? COLORS.borderViolet
                        : curCat === '특수' ? COLORS.borderRed
                        : COLORS.borderFaint}`,
                      borderBottom: `1px solid ${COLORS.borderFaint}`,
                      letterSpacing: '0.3px',
                    }}>
                      {catLabel}
                    </td>
                  </tr>
                )}
                {isNewGroupSection && curGrp && (
                  <tr key={`gh-${slot.id}`}>
                    <td colSpan={days.length + 1} style={{
                      padding: '6px 12px', position: 'sticky', left: 0,
                      background: headerColor, color: COLORS.textPrimary,
                      fontWeight: 800, fontSize: 12,
                      borderTop: `3px solid ${headerBorder}`,
                      borderBottom: `1px solid ${headerBorder}`,
                    }}>
                      🚧 {curGrp.name}
                      <span style={{ fontSize: 10, fontWeight: 500, color: COLORS.textMuted, marginLeft: 8 }}>
                        {cat} · 멤버 {curGrp.member_ids.length}명
                      </span>
                    </td>
                  </tr>
                )}
                {sectionExt.map(ew => (
                  <tr key={`gex-${slot.id}-${ew.id}`}>
                    <td style={{
                      padding: '2px 6px 2px 22px', position: 'sticky', left: 0,
                      background: 'rgba(243,244,246,0.92)', color: COLORS.textSecondary,
                      fontWeight: 600, borderRadius: 4, whiteSpace: 'nowrap', zIndex: 1, fontSize: 10,
                    }}>
                      🏢 {ew.name} <span style={{ fontSize: 9, color: COLORS.textMuted }}>외부</span>
                    </td>
                    {days.map(d => {
                      const onDuty = isOnExternalDuty(ew, d)
                      return (
                        <td key={d} style={{
                          padding: 0, minWidth: 48, height: 14,
                          background: onDuty ? '#9ca3af' : 'transparent',
                          borderTop: `1px solid ${COLORS.borderFaint}`,
                          borderBottom: `1px solid ${COLORS.borderFaint}`,
                          cursor: 'help',
                        }} title={onDuty ? `${ew.name} 외부 근무 (당사 X) — ${d}` : `${ew.name} 외부 휴무 — ${d}`} />
                      )
                    })}
                  </tr>
                ))}
                {sectionSkip.map(sw => (
                  <tr key={`gsk-${slot.id}-${sw.id}`}>
                    <td style={{
                      padding: '2px 6px 2px 22px', position: 'sticky', left: 0,
                      background: 'rgba(254,243,199,0.85)', color: COLORS.warning,
                      fontWeight: 600, borderRadius: 4, whiteSpace: 'nowrap', zIndex: 1, fontSize: 10,
                    }}>
                      🛌 {sw.name} <span style={{ fontSize: 9, color: COLORS.textMuted }}>회피</span>
                    </td>
                    {days.map(d => {
                      const skip = skipMap.get(`${sw.id}_${d}`)
                      if (!skip) return <td key={d} style={{ padding: 0, minWidth: 56, height: 14, borderTop: `1px solid ${COLORS.borderFaint}`, borderBottom: `1px solid ${COLORS.borderFaint}` }} />
                      const ok = skip.status === 'approved'
                      return (
                        <td key={d} style={{
                          padding: 0, minWidth: 48, height: 14,
                          background: ok ? COLORS.bgAmber : COLORS.bgRed,
                          color: ok ? COLORS.warning : COLORS.danger,
                          borderTop: `1px solid ${COLORS.borderFaint}`,
                          borderBottom: `1px solid ${COLORS.borderFaint}`,
                          fontSize: 9, textAlign: 'center', fontWeight: 700, cursor: 'help',
                        }} title={`${sw.name} ${ok ? '회피 (승인)' : '회피 신청 (대기)'}${skip.reason ? ' — ' + skip.reason : ''} — ${d}`}>
                          {ok ? '🛌' : '⏳'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {_slotRow}
              </Fragment>
            )
          })}
        </tbody>
      </table>

      <WorkerPicker
        open={!!pickerSlot}
        onClose={() => { setPickerSlot(null); setPickerDate(''); setPickerAssignmentId(null) }}
        workers={workers}
        slot={pickerSlot}
        workDate={pickerDate}
        current={currentAssignment}
        onSave={handleSave}
        onClear={handleClear}
      />

      {saving && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 1100,
          ...GLASS.L4, padding: '8px 14px', borderRadius: 8,
          color: COLORS.textSecondary, fontSize: 12, fontWeight: 600,
        }}>
          저장 중...
        </div>
      )}
    </div>
  )
}
