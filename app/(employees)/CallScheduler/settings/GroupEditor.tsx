'use client'
// ═══════════════════════════════════════════════════════════════════
// GroupEditor — 그룹 신규/편집 + 멤버 매핑 (드래그/순서 조정)
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '@/app/(employees)/CallScheduler/utils/palette'
import { COLOR_TONE_OPTIONS } from '@/app/(employees)/CallScheduler/utils/types'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { ShiftSlot, Worker, ColorTone, GroupMemberSkipDate, SkipStatus } from '@/app/(employees)/CallScheduler/utils/types'

interface Props {
  groupId: string | null  // null = 신규
  slots: ShiftSlot[]
  workers: Worker[]
  onClose: () => void
  onSaved: () => void
}

const PATTERN_OPTIONS: { value: 'all_days' | 'all_weekdays' | 'weekends_only' | 'custom'; label: string; sub: string }[] = [
  { value: 'all_weekdays', label: '평일만',   sub: '월~금 매일' },
  { value: 'all_days',     label: '매일',     sub: '주말 포함' },
  { value: 'weekends_only',label: '주말만',   sub: '토·일' },
  { value: 'custom',       label: '요일 지정', sub: '체크 선택' },
]
const STRATEGY_OPTIONS: { value: 'all_members' | 'rotation'; label: string; sub: string }[] = [
  { value: 'all_members', label: '전원 동시', sub: '소속 멤버 모두 매일 출근' },
  { value: 'rotation',    label: '로테이션',  sub: '순서대로 일부만 — 야간조 등' },
]
const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export default function GroupEditor({ groupId, slots, workers, onClose, onSaved }: Props) {
  const isNew = groupId === null
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 폼 상태
  const [name, setName] = useState('')
  const [slotId, setSlotId] = useState(slots[0]?.id || '')
  const [pattern, setPattern] = useState<'all_days' | 'all_weekdays' | 'weekends_only' | 'custom'>('all_weekdays')
  const [customDays, setCustomDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]))
  const [strategy, setStrategy] = useState<'all_members' | 'rotation'>('all_members')
  const [rotationSize, setRotationSize] = useState(1)
  const [rotationPeriod, setRotationPeriod] = useState(1)
  const [colorTone, setColorTone] = useState<ColorTone>('none')
  const [description, setDescription] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  // K-2 — 멤버별 cfg (priority_level / dow / 한도 / 슬롯거부 / 패턴)
  interface MemberCfg {
    priority_level: number
    preferred_dow_prefer: Set<number>
    preferred_dow_avoid: Set<number>
    max_consecutive_work_days: string
    required_days_per_month: string
    max_days_per_month: string
    blocked_slot_ids: Set<string>
    work_pattern_text: string
  }
  const defaultMemberCfg = (): MemberCfg => ({
    priority_level: 2,
    preferred_dow_prefer: new Set(),
    preferred_dow_avoid: new Set(),
    max_consecutive_work_days: '',
    required_days_per_month: '',
    max_days_per_month: '',
    blocked_slot_ids: new Set(),
    work_pattern_text: '',
  })
  const [memberCfgs, setMemberCfgs] = useState<Record<string, MemberCfg>>({})
  const [expandedCfgWorkerId, setExpandedCfgWorkerId] = useState<string | null>(null)
  const updateMemberCfg = (wId: string, patch: Partial<MemberCfg>) => {
    setMemberCfgs(prev => ({ ...prev, [wId]: { ...(prev[wId] || defaultMemberCfg()), ...patch } }))
  }
  // PR-2QQ-a: 카테고리
  const [category, setCategory] = useState('general')
  // PR-2QQ-d-2: 최소 인원 (디폴트 + 요일별 예외)
  const [defaultMin, setDefaultMin] = useState<string>('')        // 매일 디폴트 (빈 문자열 = 미설정)
  const [dowMin, setDowMin] = useState<Record<number, string>>({}) // 요일별 예외 (0~6)
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [coverageMissing, setCoverageMissing] = useState(false)   // 마이그 미적용 시
  // N-5 — 최소 인원 collapsible
  const [coverageExpanded, setCoverageExpanded] = useState(false)
  // PR-2SS-h-1 → fix — 그룹 회피일 (인라인 펼침)
  const [skipDates, setSkipDates] = useState<GroupMemberSkipDate[]>([])
  const [skipMissing, setSkipMissing] = useState(false)
  const [expandedSkipWorkerId, setExpandedSkipWorkerId] = useState<string | null>(null)
  // 워커별 빠른 입력 폼 상태 (Map by workerId)
  const [skipForms, setSkipForms] = useState<Record<string, { start: string; end: string; reason: string; saving: boolean; error: string | null }>>({})
  const getSkipForm = (wId: string) => skipForms[wId] || { start: '', end: '', reason: '', saving: false, error: null }
  const setSkipForm = (wId: string, patch: Partial<{ start: string; end: string; reason: string; saving: boolean; error: string | null }>) => {
    setSkipForms(prev => ({ ...prev, [wId]: { ...getSkipForm(wId), ...patch } }))
  }

  // 기존 그룹 로드 + 최소 인원 셋팅 로드 (PR-2QQ-d-2) + 회피일 (PR-2SS-h-1)
  useEffect(() => {
    if (isNew) return
    let abort = false
    ;(async () => {
      try {
        const auth = await getAuthHeader()
        const [gRes, cRes, sRes] = await Promise.all([
          fetch(`/api/call-scheduler/shift-groups/${groupId}`, { headers: auth }),
          fetch(`/api/call-scheduler/shift-groups/${groupId}/min-coverage`, { headers: auth }),
          fetch(`/api/call-scheduler/shift-groups/${groupId}/skip-dates?status=all`, { headers: auth }),
        ])
        const json = await gRes.json()
        if (!gRes.ok) throw new Error(json?.error || '조회 실패')
        if (abort) return
        const { group, members } = json.data
        setName(group.name); setSlotId(group.shift_slot_id)
        setPattern(group.pattern_type)
        if (group.custom_days) {
          setCustomDays(new Set(
            String(group.custom_days).split(',').map(s => s.trim()).filter(s => s !== '').map(Number)
              .filter(n => !isNaN(n) && n >= 0 && n <= 6)
          ))
        }
        setStrategy(group.generation_strategy)
        setRotationSize(group.rotation_size || 1)
        setRotationPeriod(group.rotation_period_days || 1)
        setColorTone(group.color_tone)
        setDescription(group.description || '')
        setCategory(group.category || 'general')
        setMemberIds(members.map((m: any) => m.worker_id))
        // K-2 — 멤버 cfg 파싱
        const cfgs: Record<string, MemberCfg> = {}
        const parseCsv = (s: string | null | undefined): Set<number> => {
          if (!s) return new Set()
          return new Set(
            String(s).split(',').map(x => x.trim()).filter(x => x !== '')
              .map(Number).filter(n => !isNaN(n) && n >= 0 && n <= 6),
          )
        }
        for (const m of members) {
          cfgs[m.worker_id] = {
            priority_level: Number(m.priority_level || 2),
            preferred_dow_prefer: parseCsv(m.preferred_dow_prefer),
            preferred_dow_avoid: parseCsv(m.preferred_dow_avoid),
            max_consecutive_work_days: m.max_consecutive_work_days != null ? String(m.max_consecutive_work_days) : '',
            required_days_per_month: m.required_days_per_month != null ? String(m.required_days_per_month) : '',
            max_days_per_month: m.max_days_per_month != null ? String(m.max_days_per_month) : '',
            blocked_slot_ids: new Set(Array.isArray(m.blocked_slot_ids) ? m.blocked_slot_ids : []),
            work_pattern_text: m.work_pattern_text || '',
          }
        }
        setMemberCfgs(cfgs)
        // 최소 인원 (graceful — 마이그 미적용 시 빈 배열)
        const cJson = await cRes.json()
        if (cRes.ok && Array.isArray(cJson.data)) {
          if (cJson._migration_pending) setCoverageMissing(true)
          const dowMap: Record<number, string> = {}
          let def = ''
          for (const row of cJson.data) {
            if (row.dow == null) def = String(row.min_workers)
            else dowMap[row.dow] = String(row.min_workers)
          }
          setDefaultMin(def)
          setDowMin(dowMap)
        }
        // PR-2SS-h-1 — 그룹 회피일 (graceful)
        try {
          const sJson = await sRes.json()
          if (sRes.ok && Array.isArray(sJson.data)) {
            setSkipDates(sJson.data)
            if (sJson._migration_pending) setSkipMissing(true)
          } else if (sJson?._migration_pending) {
            setSkipMissing(true)
          }
        } catch { setSkipMissing(true) }
      } catch (e: any) { setError(e?.message || '오류') }
      finally { if (!abort) setLoading(false) }
    })()
    return () => { abort = true }
  }, [groupId, isNew])

  // PR-2SS-h-1 — 회피일 reload (변경 후)
  const reloadSkips = async () => {
    if (isNew || !groupId) return
    try {
      const auth = await getAuthHeader()
      const sRes = await fetch(`/api/call-scheduler/shift-groups/${groupId}/skip-dates?status=all`, { headers: auth })
      const sJson = await sRes.json()
      if (sRes.ok && Array.isArray(sJson.data)) setSkipDates(sJson.data)
    } catch { /* graceful */ }
  }

  // PR-2SS-h-1-fix — 인라인 빠른 입력 (매니저 즉시 승인)
  const addSkipInline = async (wId: string) => {
    if (isNew || !groupId) return
    const form = getSkipForm(wId)
    setSkipForm(wId, { error: null })
    if (!form.start || !form.end) {
      setSkipForm(wId, { error: '시작·종료 필수' }); return
    }
    if (form.start > form.end) {
      setSkipForm(wId, { error: '시작이 종료보다 이후' }); return
    }
    setSkipForm(wId, { saving: true })
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/shift-groups/${groupId}/skip-dates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          worker_id: wId,
          start_date: form.start,
          end_date: form.end,
          reason: form.reason.trim() || null,
          status: 'approved',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '추가 실패')
      setSkipForm(wId, { start: '', end: '', reason: '', saving: false })
      reloadSkips()
    } catch (e: any) {
      setSkipForm(wId, { error: e?.message || '오류', saving: false })
    }
  }

  // PR-2SS-h-1-fix — 인라인 status 변경 / 삭제
  const updateSkipStatus = async (skipId: string, status: SkipStatus) => {
    if (isNew || !groupId) return
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/shift-groups/${groupId}/skip-dates/${skipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      reloadSkips()
    } catch (e: any) { setError(e?.message || '오류') }
  }
  const removeSkip = async (skipId: string) => {
    if (isNew || !groupId) return
    if (!confirm('이 회피일을 삭제합니다. 계속할까요?')) return
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/shift-groups/${groupId}/skip-dates/${skipId}`, {
        method: 'DELETE', headers: auth,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      reloadSkips()
    } catch (e: any) { setError(e?.message || '오류') }
  }

  const toggleMember = (wId: string) => {
    setMemberIds(prev => prev.includes(wId) ? prev.filter(x => x !== wId) : [...prev, wId])
    // K-2 — 새 멤버 default cfg, 제외 시 cfg 정리
    setMemberCfgs(prev => {
      if (prev[wId]) { const next = { ...prev }; delete next[wId]; return next }
      return { ...prev, [wId]: defaultMemberCfg() }
    })
    // 새 멤버 추가 시 자동 펼침 (그 자리에서 cfg 입력)
    setExpandedCfgWorkerId(prev => prev === wId ? null : wId)
  }

  const moveMember = (wId: string, dir: -1 | 1) => {
    setMemberIds(prev => {
      const idx = prev.indexOf(wId)
      if (idx < 0) return prev
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const arr = [...prev]
      const [m] = arr.splice(idx, 1)
      arr.splice(next, 0, m)
      return arr
    })
  }

  const submit = async () => {
    if (!name.trim()) { setError('이름은 필수'); return }
    if (!slotId) { setError('시프트 선택 필수'); return }
    setError(null); setSaving(true)
    try {
      const auth = await getAuthHeader()
      const payload: any = {
        name: name.trim(),
        category: category.trim() || 'general',  // PR-2QQ-a
        shift_slot_id: slotId,
        pattern_type: pattern,
        custom_days: pattern === 'custom' ? Array.from(customDays).sort().join(',') : null,
        generation_strategy: strategy,
        rotation_size: strategy === 'rotation' ? rotationSize : null,
        rotation_period_days: rotationPeriod,
        color_tone: colorTone,
        description: description.trim() || null,
      }
      // K-2 — 멤버 PUT body (8 컬럼 포함)
      const buildMembersPayload = () => memberIds.map(wId => {
        const cfg = memberCfgs[wId] || defaultMemberCfg()
        return {
          worker_id: wId,
          priority_level: cfg.priority_level,
          preferred_dow_prefer: Array.from(cfg.preferred_dow_prefer).sort().join(',') || null,
          preferred_dow_avoid: Array.from(cfg.preferred_dow_avoid).sort().join(',') || null,
          max_consecutive_work_days: cfg.max_consecutive_work_days === '' ? null : Number(cfg.max_consecutive_work_days),
          required_days_per_month: cfg.required_days_per_month === '' ? null : Number(cfg.required_days_per_month),
          max_days_per_month: cfg.max_days_per_month === '' ? null : Number(cfg.max_days_per_month),
          blocked_slot_ids: Array.from(cfg.blocked_slot_ids),
          work_pattern_text: cfg.work_pattern_text.trim() || null,
        }
      })
      let id = groupId
      if (isNew) {
        payload.member_ids = memberIds
        const res = await fetch('/api/call-scheduler/shift-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '생성 실패')
        id = json.data.id
        // 신규 그룹: POST 후 멤버 cfg 별도 PUT (POST 가 priority 만 받음)
        if (memberIds.length > 0) {
          const mRes = await fetch(`/api/call-scheduler/shift-groups/${id}/members`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...auth },
            body: JSON.stringify({ members: buildMembersPayload() }),
          })
          const mJ = await mRes.json()
          if (!mRes.ok) throw new Error(mJ?.error || '멤버 cfg 저장 실패')
        }
      } else {
        // PATCH 본문 + 멤버 별도 PUT (K-2 새 형식)
        const res = await fetch(`/api/call-scheduler/shift-groups/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '저장 실패')
        const mRes = await fetch(`/api/call-scheduler/shift-groups/${id}/members`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ members: buildMembersPayload() }),
        })
        const mJ = await mRes.json()
        if (!mRes.ok) throw new Error(mJ?.error || '멤버 저장 실패')
      }
      // PR-2QQ-d-2 — 최소 인원 셋팅 저장 (신규/편집 공통)
      if (!coverageMissing && id) {
        const coverageRows: Array<{ dow: number | null; min_workers: number }> = []
        const defNum = defaultMin === '' ? 0 : Math.max(0, Math.floor(Number(defaultMin) || 0))
        if (defNum > 0) coverageRows.push({ dow: null, min_workers: defNum })
        for (const [dowStr, vStr] of Object.entries(dowMin)) {
          const dow = Number(dowStr)
          if (isNaN(dow) || dow < 0 || dow > 6) continue
          const n = vStr === '' ? 0 : Math.max(0, Math.floor(Number(vStr) || 0))
          if (n > 0) coverageRows.push({ dow, min_workers: n })
        }
        const cRes = await fetch(`/api/call-scheduler/shift-groups/${id}/min-coverage`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ coverage: coverageRows }),
        })
        const cJ = await cRes.json()
        if (!cRes.ok) {
          // graceful — 마이그 미적용 시 무시
          if (cJ?.error?.includes('마이그레이션')) {
            setCoverageMissing(true)
          } else {
            throw new Error(cJ?.error || '최소 인원 저장 실패')
          }
        }
      }
      onSaved()
    } catch (e: any) { setError(e?.message || '저장 실패') }
    finally { setSaving(false) }
  }

  const remove = async () => {
    if (!confirm('이 그룹을 삭제(비활성화) 합니다. 계속할까요?')) return
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/shift-groups/${groupId}`, {
        method: 'DELETE', headers: auth,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '삭제 실패')
      onSaved()
    } catch (e: any) { setError(e?.message || '오류'); setSaving(false) }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
  }

  const selectedWorkers = memberIds
    .map(id => workers.find(w => w.id === id))
    .filter((w): w is Worker => !!w)
  const availableWorkers = workers.filter(w => !memberIds.includes(w.id))

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <button type="button" onClick={onClose} style={{
          ...BTN.sm, background: 'transparent', color: COLORS.textSecondary,
          border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
        }}>
          ← 그룹 목록
        </button>
        <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.textPrimary }}>
          {isNew ? '신규 그룹 만들기' : '그룹 편집'}
        </div>
        {!isNew ? (
          <button type="button" onClick={remove} disabled={saving} style={{
            ...BTN.sm, background: 'transparent', color: COLORS.danger,
            border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer',
          }}>
            삭제
          </button>
        ) : <div style={{ width: 60 }} />}
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger, fontSize: 13,
        }}>❌ {error}</div>
      )}

      {/* N-5 — 2분할 → 수직 1컬럼 (의미있는 위계) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 1. 그룹 정의 (이름/카테고리/색상/시프트/패턴/전략) */}
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="그룹 이름" required>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                   style={inputStyle} placeholder="예: 주간 09-18" />
          </Field>

          {/* PR-2QQ-a — 카테고리 */}
          <Field label="카테고리" sub="그룹 분류 — 같은 카테고리끼리 묶여 표시됩니다">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['주간', '야간', '특수', 'general'].map(cat => (
                <button key={cat} type="button" onClick={() => setCategory(cat)}
                        style={{
                          padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                          background: category === cat ? COLORS.bgBlue : 'transparent',
                          border: `1px solid ${category === cat ? COLORS.borderBlue : COLORS.borderFaint}`,
                          color: category === cat ? COLORS.info : COLORS.textSecondary,
                          cursor: 'pointer',
                        }}>
                  {cat === 'general' ? '일반' : cat}
                </button>
              ))}
              <input type="text" value={!['주간','야간','특수','general'].includes(category) ? category : ''}
                     onChange={(e) => setCategory(e.target.value)}
                     placeholder="직접 입력..."
                     style={{
                       padding: '4px 10px', borderRadius: 999, fontSize: 11,
                       border: `1px solid ${COLORS.borderFaint}`,
                       background: !['주간','야간','특수','general'].includes(category) ? COLORS.bgBlue : 'transparent',
                       width: 100,
                     }} />
            </div>
          </Field>

          <Field label="시프트 (시간대)" required>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 4,
              maxHeight: 120, overflowY: 'auto',
              padding: 4, borderRadius: 8,
              border: `1px solid ${COLORS.borderFaint}`,
            }}>
              {slots.map(s => {
                const active = slotId === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSlotId(s.id)}
                    style={{
                      padding: '4px 8px', borderRadius: 6,
                      fontSize: 11, fontWeight: 600,
                      background: active ? COLORS.bgBlue : 'transparent',
                      color: active ? COLORS.info : COLORS.textSecondary,
                      border: `1px solid ${active ? COLORS.borderBlue : COLORS.borderFaint}`,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ color: COLORS.textMuted, marginRight: 4, fontFamily: 'monospace' }}>
                      {s.code}
                    </span>
                    {s.label}
                  </button>
                )
              })}
              {slots.length === 0 && (
                <div style={{ padding: 12, fontSize: 11, color: COLORS.textMuted }}>
                  시프트가 없습니다 — [시프트] 탭에서 먼저 추가하세요.
                </div>
              )}
            </div>
          </Field>

          <Field label="배정 패턴">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {PATTERN_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setPattern(opt.value)}
                        style={modeBtnStyle(pattern === opt.value)}>
                  <div style={{ fontWeight: 700, color: COLORS.textPrimary, fontSize: 12 }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>{opt.sub}</div>
                </button>
              ))}
            </div>
            {pattern === 'custom' && (
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                {DOW_LABELS.map((dow, i) => {
                  const on = customDays.has(i)
                  return (
                    <button key={i} type="button"
                            onClick={() => {
                              const next = new Set(customDays)
                              if (on) next.delete(i); else next.add(i)
                              setCustomDays(next)
                            }}
                            style={{
                              flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 700,
                              background: on ? COLORS.bgBlue : 'transparent',
                              border: `1px solid ${on ? COLORS.borderBlue : COLORS.borderFaint}`,
                              color: on ? COLORS.info : COLORS.textSecondary, cursor: 'pointer',
                            }}>
                      {dow}
                    </button>
                  )
                })}
              </div>
            )}
          </Field>

          <Field label="생성 전략">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {STRATEGY_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setStrategy(opt.value)}
                        style={modeBtnStyle(strategy === opt.value)}>
                  <div style={{ fontWeight: 700, color: COLORS.textPrimary, fontSize: 12 }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>{opt.sub}</div>
                </button>
              ))}
            </div>
            {strategy === 'rotation' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                <Field label="하루 인원" sub="rotation 시">
                  <input type="number" min={1} value={rotationSize}
                         onChange={(e) => setRotationSize(Number(e.target.value))}
                         style={inputStyle} />
                </Field>
                <Field label="로테이션 주기 (일)" sub="몇 일마다 교대">
                  <input type="number" min={1} value={rotationPeriod}
                         onChange={(e) => setRotationPeriod(Number(e.target.value))}
                         style={inputStyle} />
                </Field>
              </div>
            )}
          </Field>

          <Field label="식별 색상" sub="14개 색상 중 선택">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COLOR_TONE_OPTIONS.map(opt => {
                const active = colorTone === opt.value
                return (
                  <button key={opt.value} type="button" onClick={() => setColorTone(opt.value)}
                          title={opt.label}
                          style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: opt.value === 'none' ? '#fff' : opt.hex,
                            border: active
                              ? `3px solid ${COLORS.primary}`
                              : `1px solid ${COLORS.borderFaint}`,
                            boxShadow: active ? `0 0 0 2px rgba(255,255,255,0.9)` : 'none',
                            cursor: 'pointer', padding: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, color: opt.value === 'none' ? COLORS.textMuted : '#fff',
                            fontWeight: 700,
                          }}>
                    {opt.value === 'none' ? '∅' : (active ? '✓' : '')}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>
              현재: {COLOR_TONE_OPTIONS.find(o => o.value === colorTone)?.label || '없음'}
            </div>
          </Field>

          <Field label="설명">
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                   style={inputStyle} placeholder="자유 메모" />
          </Field>

          {/* N-5 — 최소 인원 collapsible (자주 안 만지는 셋팅 접기) */}
          <div>
            <button type="button"
                    onClick={() => setCoverageExpanded(p => !p)}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '8px 12px', borderRadius: 8,
                      background: coverageExpanded ? COLORS.bgBlue : 'rgba(0,0,0,0.03)',
                      border: `1px solid ${coverageExpanded ? COLORS.borderBlue : COLORS.borderFaint}`,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      fontSize: 12, fontWeight: 700,
                      color: coverageExpanded ? COLORS.info : COLORS.textPrimary,
                    }}>
              <span>⚖️ 최소 인원 (자동 생성용)</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted }}>
                {(() => {
                  const set = (defaultMin && Number(defaultMin) > 0)
                    || Object.values(dowMin).some(v => Number(v) > 0)
                  return set ? '셋팅됨' : '미설정'
                })()}
                {' '}{coverageExpanded ? '▼' : '▶'}
              </span>
            </button>
          </div>
          {coverageExpanded && (
          <Field label=""
                 sub="매일 디폴트를 입력하고, 요일별로 다르면 따로 입력. 빈 칸 = 디폴트 사용.">
            {coverageMissing ? (
              <div style={{
                padding: '8px 12px', borderRadius: 6, fontSize: 11,
                background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
                color: COLORS.warning,
              }}>
                ⚠ 마이그레이션이 적용되지 않았습니다 (cs_group_min_coverage)
              </div>
            ) : (
              <div style={{
                ...GLASS.L1, borderRadius: 8, padding: 10,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                {/* 매일 디폴트 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: COLORS.textPrimary, width: 60,
                  }}>매일</span>
                  <input type="number" min={0} max={99}
                         value={defaultMin}
                         onChange={(e) => setDefaultMin(e.target.value)}
                         placeholder="없음"
                         style={{
                           width: 60, padding: '4px 8px', borderRadius: 6, fontSize: 12,
                           border: `1px solid ${COLORS.borderFaint}`,
                           background: 'rgba(255,255,255,0.85)',
                         }} />
                  <span style={{ fontSize: 10, color: COLORS.textMuted }}>명 (디폴트)</span>
                </div>

                {/* 요일별 예외 */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4,
                }}>
                  {DOW_LABELS.map((label, dow) => {
                    const isWeekend = dow === 0 || dow === 6
                    return (
                      <div key={dow} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      }}>
                        <div style={{
                          fontSize: 10, fontWeight: 700,
                          color: dow === 0 ? COLORS.danger
                            : dow === 6 ? COLORS.info
                            : COLORS.textSecondary,
                        }}>
                          {label}
                        </div>
                        <input type="number" min={0} max={99}
                               value={dowMin[dow] || ''}
                               onChange={(e) => setDowMin({ ...dowMin, [dow]: e.target.value })}
                               placeholder="-"
                               style={{
                                 width: '100%', padding: '3px', borderRadius: 4, fontSize: 11,
                                 textAlign: 'center',
                                 border: `1px solid ${COLORS.borderFaint}`,
                                 background: isWeekend ? COLORS.bgGray : 'rgba(255,255,255,0.85)',
                               }} />
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: 10, color: COLORS.textMuted }}>
                  💡 빈 칸 = 매일 디폴트 적용. 예: 매일 2명 + 금요일 3명 + 일요일 1명
                </div>
              </div>
            )}
          </Field>
          )}

          {/* PR-2SS-Phase-I — 우선순위 정책 표출 (매니저 판단 도구) */}
          <div style={{
            ...GLASS.L1, borderRadius: 10, padding: 14,
            border: `1px solid ${COLORS.borderBlue}`,
            background: 'rgba(219,234,254,0.45)',
          }}>
            <div style={{
              fontSize: 13, fontWeight: 800, color: COLORS.textPrimary,
              marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              🎯 우선순위 정책 <span style={{
                fontSize: 10, fontWeight: 500, color: COLORS.textMuted,
                background: 'rgba(255,255,255,0.7)', padding: '1px 6px', borderRadius: 99,
              }}>자동 생성 시 적용</span>
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10 }}>
              이 그룹의 자동 생성은 다음 7단계 ranking 으로 워커를 결정합니다.
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.85)', borderRadius: 8, padding: 10,
              border: `1px solid ${COLORS.borderFaint}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.info, marginBottom: 6 }}>
                ✓ 채울 워커 결정 순서
              </div>
              <ol style={{
                margin: 0, paddingLeft: 20,
                fontSize: 12, color: COLORS.textPrimary, lineHeight: 1.7,
              }}>
                <li>P1 → P2 → P3 (워커 우선순위)</li>
                <li>희망 요일 매치 (워커 설정)</li>
                <li>비선호 요일 회피 (워커 설정)</li>
                <li>월 필수 일수 미달자 우선</li>
                <li>이 요일 적게 한 사람 (균등)</li>
                <li><strong>근무 시간 짧은 사람</strong> (월 누적)</li>
                <li><strong>가장 오래 근무 안한 사람</strong></li>
              </ol>
            </div>

            <div style={{
              marginTop: 10,
              background: 'rgba(254,226,226,0.5)', borderRadius: 8, padding: 10,
              border: `1px solid ${COLORS.borderRed}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.danger, marginBottom: 6 }}>
                ✗ 후보 제외 규칙 (hard exclude)
              </div>
              <ul style={{
                margin: 0, paddingLeft: 20,
                fontSize: 11, color: COLORS.textPrimary, lineHeight: 1.7,
              }}>
                <li><strong>그룹 회피일</strong> 승인됨 (위 멤버 패널 🛌 chip)</li>
                <li><strong>연차 종일</strong> (직원 휴가 탭 — 승인됨)</li>
                <li>외부 cycle 근무 phase (직원 탭)</li>
                <li>슬롯 거부 / 연속 한도 (직원 탭)</li>
                <li>익일 휴식 위반 / 시간 겹침 (시간 탭)</li>
                <li>월 최대 일수 초과 (직원 탭)</li>
              </ul>
            </div>

            <div style={{
              marginTop: 10, fontSize: 11, color: COLORS.textMuted,
              padding: '6px 10px', borderRadius: 6,
              background: 'rgba(255,255,255,0.5)',
              border: `1px dashed ${COLORS.borderFaint}`,
            }}>
              💡 정책 변경 위치:
              <div style={{ marginTop: 4, paddingLeft: 12, lineHeight: 1.6 }}>
                · 워커 우선순위 / 희망·비선호 / 외부 cycle / 슬롯 거부 / 연속 한도 → <strong>직원 탭</strong><br/>
                · 안전 가드 (익일 휴식 / 연속 한도 한도) → <strong>시간 탭</strong><br/>
                · 회피일 (승인) → 위 멤버 패널 <strong>🛌 chip</strong><br/>
                · 정식 휴가 → <strong>직원 휴가 탭</strong>
              </div>
            </div>
          </div>
        </div>

        {/* 2. 멤버 + 후보 (수직 1컬럼 — 가로 폭 넉넉) */}
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
            멤버 ({memberIds.length}명)
            <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted, marginLeft: 6 }}>
              순서 중요 — 로테이션은 위에서부터
            </span>
          </div>

          {/* 선택된 멤버 (순서) */}
          <div style={{ ...GLASS.L1, borderRadius: 8, padding: 8, minHeight: 80 }}>
            {selectedWorkers.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
                아래에서 워커를 클릭해 추가하세요.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {selectedWorkers.map((w, idx) => {
                  // PR-2SS-h-1 — 워커별 회피일 카운트
                  const wSkips = skipDates.filter(s => s.worker_id === w.id)
                  const approvedCount = wSkips.filter(s => s.status === 'approved').length
                  const requestedCount = wSkips.filter(s => s.status === 'requested').length
                  const isExpanded = expandedSkipWorkerId === w.id
                  const form = getSkipForm(w.id)
                  return (
                    <div key={w.id} style={{
                      display: 'flex', flexDirection: 'column', gap: 2,
                      padding: '4px 8px', borderRadius: 6,
                      background: TONE_BG[w.color_tone] !== 'transparent' ? TONE_BG[w.color_tone] : 'rgba(0,0,0,0.03)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: COLORS.textMuted, width: 18 }}>{idx + 1}.</span>
                        <span style={{ flex: 1, fontWeight: 700, color: TONE_TEXT[w.color_tone] }}>{w.name}</span>
                        {(() => {
                          // K-2 — 멤버 cfg 요약 칩
                          const cfg = memberCfgs[w.id] || defaultMemberCfg()
                          const chips: React.ReactNode[] = []
                          if (cfg.priority_level === 1) chips.push(<span key="p1" style={cfgChip('danger')}>P1</span>)
                          else if (cfg.priority_level === 3) chips.push(<span key="p3" style={cfgChip('neutral')}>P3</span>)
                          if (cfg.preferred_dow_prefer.size > 0)
                            chips.push(<span key="pf" style={cfgChip('success')} title={`희망: ${Array.from(cfg.preferred_dow_prefer).map(d => DOW_LABELS[d]).join(',')}`}>🌟{cfg.preferred_dow_prefer.size}</span>)
                          if (cfg.preferred_dow_avoid.size > 0)
                            chips.push(<span key="av" style={cfgChip('warning')} title={`비선호: ${Array.from(cfg.preferred_dow_avoid).map(d => DOW_LABELS[d]).join(',')}`}>🚫{cfg.preferred_dow_avoid.size}</span>)
                          if (cfg.max_consecutive_work_days)
                            chips.push(<span key="mc" style={cfgChip('warning')} title="연속 한도">🛡{cfg.max_consecutive_work_days}</span>)
                          if (cfg.blocked_slot_ids.size > 0)
                            chips.push(<span key="bs" style={cfgChip('danger')} title="슬롯 거부">🚷{cfg.blocked_slot_ids.size}</span>)
                          return chips
                        })()}
                        {w.group_label && (
                          <span style={{ fontSize: 10, color: COLORS.textMuted }}>{w.group_label}</span>
                        )}
                        {/* K-2 — 멤버 cfg 펼침 토글 */}
                        <button type="button"
                                onClick={() => setExpandedCfgWorkerId(expandedCfgWorkerId === w.id ? null : w.id)}
                                style={{
                                  fontSize: 10, padding: '2px 7px', borderRadius: 99,
                                  background: expandedCfgWorkerId === w.id ? COLORS.bgBlue : 'rgba(255,255,255,0.5)',
                                  color: expandedCfgWorkerId === w.id ? COLORS.info : COLORS.textMuted,
                                  border: `1px solid ${expandedCfgWorkerId === w.id ? COLORS.borderBlue : COLORS.borderFaint}`,
                                  fontWeight: 700, cursor: 'pointer',
                                }}
                                title="이 그룹 안 멤버 설정">
                          ⚙ {expandedCfgWorkerId === w.id ? '▼' : '▶'}
                        </button>
                        {/* PR-2SS-h-1-fix — 인라인 펼침 토글 (모달 → 클릭으로 펼침) */}
                        {!skipMissing && !isNew && (
                          <button type="button"
                                  onClick={() => setExpandedSkipWorkerId(isExpanded ? null : w.id)}
                                  style={{
                                    fontSize: 10, padding: '2px 7px', borderRadius: 99,
                                    background: requestedCount > 0 ? COLORS.bgAmber
                                              : approvedCount > 0 ? COLORS.bgRed
                                              : 'rgba(255,255,255,0.5)',
                                    color: requestedCount > 0 ? COLORS.warning
                                         : approvedCount > 0 ? COLORS.danger
                                         : COLORS.textMuted,
                                    border: `1px solid ${
                                      requestedCount > 0 ? COLORS.borderAmber
                                      : approvedCount > 0 ? COLORS.borderRed
                                      : COLORS.borderFaint
                                    }`,
                                    fontWeight: 700, cursor: 'pointer',
                                  }}
                                  title={`회피일 — 승인 ${approvedCount}건 / 신청 ${requestedCount}건`}>
                            🛌 {approvedCount}{requestedCount > 0 ? `+${requestedCount}대기` : ''} {isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                        <button type="button" onClick={() => moveMember(w.id, -1)} disabled={idx === 0}
                                style={miniBtn} title="위로">↑</button>
                        <button type="button" onClick={() => moveMember(w.id, 1)} disabled={idx === selectedWorkers.length - 1}
                                style={miniBtn} title="아래로">↓</button>
                        <button type="button" onClick={() => toggleMember(w.id)}
                                style={{ ...miniBtn, color: COLORS.danger }} title="제외">×</button>
                      </div>
                      {/* M-2 — 인라인 펼침 (회피일 목록 + 빠른 입력) 시원시원 */}
                      {isExpanded && !skipMissing && (
                        <div style={{
                          marginTop: 12, marginLeft: 12, marginRight: 4,
                          padding: 16, borderRadius: 12,
                          background: 'rgba(255,255,255,0.96)',
                          border: `2px solid ${COLORS.borderAmber}`,
                          boxShadow: '0 2px 8px rgba(245,158,11,0.08)',
                          display: 'flex', flexDirection: 'column', gap: 12,
                        }}>
                          {form.error && (
                            <div style={{
                              fontSize: 10, color: COLORS.danger,
                              padding: '3px 6px', borderRadius: 4,
                              background: COLORS.bgRed,
                              border: `1px solid ${COLORS.borderRed}`,
                            }}>❌ {form.error}</div>
                          )}
                          {/* 기존 목록 */}
                          {wSkips.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {wSkips.map(s => (
                                <div key={s.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 6,
                                  fontSize: 11, padding: '3px 6px', borderRadius: 4,
                                  background: 'rgba(0,0,0,0.03)',
                                }}>
                                  <span style={{
                                    fontSize: 9, padding: '1px 5px', borderRadius: 99, fontWeight: 700,
                                    background: s.status === 'approved' ? COLORS.bgGreen
                                              : s.status === 'requested' ? COLORS.bgAmber
                                              : COLORS.bgGray,
                                    color: s.status === 'approved' ? COLORS.success
                                         : s.status === 'requested' ? COLORS.warning
                                         : COLORS.textSecondary,
                                  }}>
                                    {s.status === 'approved' ? '✓승인' : s.status === 'requested' ? '⏳대기' : s.status === 'rejected' ? '✗거절' : '취소'}
                                  </span>
                                  <span style={{ flex: 1, color: COLORS.textPrimary, fontWeight: 600 }}>
                                    {s.start_date}{s.start_date !== s.end_date && ` ~ ${s.end_date}`}
                                    {s.reason && (
                                      <span style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 500, marginLeft: 4 }}>
                                        — {s.reason}
                                      </span>
                                    )}
                                  </span>
                                  {s.status === 'requested' && (
                                    <>
                                      <button type="button"
                                              onClick={() => updateSkipStatus(s.id, 'approved')}
                                              style={{
                                                fontSize: 9, padding: '1px 6px', borderRadius: 4,
                                                background: COLORS.success, color: '#fff',
                                                border: 'none', cursor: 'pointer', fontWeight: 700,
                                              }}>승인</button>
                                      <button type="button"
                                              onClick={() => updateSkipStatus(s.id, 'rejected')}
                                              style={{
                                                fontSize: 9, padding: '1px 6px', borderRadius: 4,
                                                background: 'transparent', color: COLORS.danger,
                                                border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer', fontWeight: 700,
                                              }}>거절</button>
                                    </>
                                  )}
                                  <button type="button"
                                          onClick={() => removeSkip(s.id)}
                                          style={{
                                            background: 'transparent', border: 'none',
                                            color: COLORS.textMuted, cursor: 'pointer',
                                            fontSize: 12, padding: 0, lineHeight: 1,
                                          }} title="삭제">×</button>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* 빠른 입력 한 줄 */}
                          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <input type="date" value={form.start}
                                   onChange={(e) => setSkipForm(w.id, {
                                     start: e.target.value,
                                     // 종료일이 비어있으면 시작일과 동일하게 (단일 일자 빠른 입력)
                                     end: form.end || e.target.value,
                                   })}
                                   style={skipInlineInputStyle} title="시작일" />
                            <span style={{ fontSize: 11, color: COLORS.textMuted, padding: '0 2px' }}>~</span>
                            <input type="date" value={form.end}
                                   onChange={(e) => setSkipForm(w.id, { end: e.target.value })}
                                   style={skipInlineInputStyle} title="종료일" />
                            <input type="text" value={form.reason}
                                   onChange={(e) => setSkipForm(w.id, { reason: e.target.value })}
                                   placeholder="사유 (선택)"
                                   style={{ ...skipInlineInputStyle, flex: 1, minWidth: 100 }} />
                            <button type="button" onClick={() => addSkipInline(w.id)} disabled={form.saving}
                                    style={{
                                      padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 800,
                                      background: COLORS.primary, color: '#fff', border: 'none',
                                      cursor: form.saving ? 'not-allowed' : 'pointer',
                                      opacity: form.saving ? 0.5 : 1,
                                    }}>
                              {form.saving ? '...' : '+ 추가'}
                            </button>
                          </div>
                        </div>
                      )}
                      {/* K-2 — 멤버 cfg 펼침 카드 */}
                      {expandedCfgWorkerId === w.id && (
                        <MemberCfgPanel
                          cfg={memberCfgs[w.id] || defaultMemberCfg()}
                          onChange={(patch) => updateMemberCfg(w.id, patch)}
                          slots={slots}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 후보 워커 */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
              + 추가 후보 ({availableWorkers.length}명)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {availableWorkers.map(w => (
                <button key={w.id} type="button" onClick={() => toggleMember(w.id)}
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          background: TONE_BG[w.color_tone] !== 'transparent' ? TONE_BG[w.color_tone] : 'transparent',
                          border: `1px dashed ${COLORS.borderFaint}`,
                          color: TONE_TEXT[w.color_tone] || COLORS.textPrimary, cursor: 'pointer',
                        }}>
                  + {w.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* PR-2SS-h-1-fix — 모달 폐기, 인라인 펼침으로 대체 */}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button type="button" onClick={onClose} style={{
          ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
          border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
        }}>취소</button>
        <button type="button" onClick={submit} disabled={saving} style={{
          ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
          cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? '저장 중...' : (isNew ? '생성' : '저장')}
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  ...GLASS.L1, padding: '7px 10px', borderRadius: 8,
  fontSize: 13, color: COLORS.textPrimary, outline: 'none', width: '100%',
}
// M-2 — 회피일 빠른 입력 (시원시원)
const skipInlineInputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  border: `1.5px solid ${COLORS.borderFaint}`,
  background: 'rgba(255,255,255,1)',
  outline: 'none',
}
const miniBtn: React.CSSProperties = {
  width: 22, height: 22, padding: 0, borderRadius: 4,
  background: 'transparent', border: `1px solid ${COLORS.borderFaint}`,
  color: COLORS.textSecondary, fontSize: 11, cursor: 'pointer',
}
const modeBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 10px', borderRadius: 8, textAlign: 'left',
  background: active ? COLORS.bgBlue : 'transparent',
  border: `1px solid ${active ? COLORS.borderBlue : COLORS.borderFaint}`,
  cursor: 'pointer',
})

function Field({ label, sub, required, children }: {
  label: string; sub?: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
        {label}{required && <span style={{ color: COLORS.danger, marginLeft: 2 }}>*</span>}
        {sub && <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 4 }}>{sub}</span>}
      </div>
      {children}
    </div>
  )
}

// K-2 — 멤버 cfg 칩 (행 헤더 요약)
function cfgChip(tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info'): React.CSSProperties {
  const palette = tone === 'success' ? { bg: COLORS.bgGreen, fg: COLORS.success, bd: COLORS.borderGreen }
                : tone === 'warning' ? { bg: COLORS.bgAmber, fg: COLORS.warning, bd: COLORS.borderAmber }
                : tone === 'danger'  ? { bg: COLORS.bgRed,   fg: COLORS.danger,  bd: COLORS.borderRed }
                : tone === 'info'    ? { bg: COLORS.bgBlue,  fg: COLORS.info,    bd: COLORS.borderBlue }
                : { bg: 'rgba(0,0,0,0.04)', fg: COLORS.textSecondary, bd: COLORS.borderFaint }
  return {
    fontSize: 9, padding: '1px 5px', borderRadius: 99, fontWeight: 700,
    background: palette.bg, color: palette.fg, border: `1px solid ${palette.bd}`,
  }
}

// K-2 — 멤버 cfg 펼침 카드
function MemberCfgPanel({
  cfg, onChange, slots,
}: {
  cfg: {
    priority_level: number
    preferred_dow_prefer: Set<number>
    preferred_dow_avoid: Set<number>
    max_consecutive_work_days: string
    required_days_per_month: string
    max_days_per_month: string
    blocked_slot_ids: Set<string>
    work_pattern_text: string
  }
  onChange: (patch: Partial<typeof cfg>) => void
  slots: ShiftSlot[]
}) {
  const DOW = ['일', '월', '화', '수', '목', '금', '토']
  const togglePrefer = (d: number) => {
    const next = new Set(cfg.preferred_dow_prefer)
    if (next.has(d)) next.delete(d); else next.add(d)
    const nextAvoid = new Set(cfg.preferred_dow_avoid)
    if (nextAvoid.has(d)) nextAvoid.delete(d)
    onChange({ preferred_dow_prefer: next, preferred_dow_avoid: nextAvoid })
  }
  const toggleAvoid = (d: number) => {
    const next = new Set(cfg.preferred_dow_avoid)
    if (next.has(d)) next.delete(d); else next.add(d)
    const nextPrefer = new Set(cfg.preferred_dow_prefer)
    if (nextPrefer.has(d)) nextPrefer.delete(d)
    onChange({ preferred_dow_avoid: next, preferred_dow_prefer: nextPrefer })
  }
  const toggleBlockedSlot = (slotId: string) => {
    const next = new Set(cfg.blocked_slot_ids)
    if (next.has(slotId)) next.delete(slotId); else next.add(slotId)
    onChange({ blocked_slot_ids: next })
  }
  // M-2 — 시원시원한 사이즈
  const dowBtn = (d: number, set: Set<number>, kind: 'prefer' | 'avoid') => (
    <button key={`${kind}-${d}`} type="button"
            onClick={() => kind === 'prefer' ? togglePrefer(d) : toggleAvoid(d)}
            style={{
              flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 800, borderRadius: 8,
              background: set.has(d)
                ? (kind === 'prefer' ? COLORS.bgGreen : COLORS.bgRed) : 'rgba(255,255,255,0.7)',
              color: set.has(d)
                ? (kind === 'prefer' ? COLORS.success : COLORS.danger) : COLORS.textSecondary,
              border: `1.5px solid ${set.has(d)
                ? (kind === 'prefer' ? COLORS.borderGreen : COLORS.borderRed) : COLORS.borderFaint}`,
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}>{DOW[d]}</button>
  )
  const cfgFieldLabel: React.CSSProperties = {
    fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 6,
    display: 'flex', alignItems: 'center', gap: 4,
  }
  const cfgInputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', fontSize: 14, fontWeight: 600,
    border: `1.5px solid ${COLORS.borderFaint}`, borderRadius: 8,
    background: 'rgba(255,255,255,1)', color: COLORS.textPrimary, outline: 'none',
  }
  return (
    <div style={{
      marginTop: 12, marginLeft: 12, marginRight: 4,
      padding: 18, borderRadius: 12,
      background: 'rgba(255,255,255,0.96)',
      border: `2px solid ${COLORS.borderBlue}`,
      boxShadow: '0 2px 8px rgba(59,130,246,0.08)',
      display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      {/* 1행 — 우선순위 (전체 폭) */}
      <div>
        <div style={cfgFieldLabel}>
          🏷 우선순위
          <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted }}>이 그룹 안 — 자동 생성 시 P1 부터 우선 배정</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 2, 3].map(n => (
            <button key={n} type="button" onClick={() => onChange({ priority_level: n })}
                    style={{
                      flex: 1, padding: '14px 8px', borderRadius: 10, fontSize: 14, fontWeight: 800,
                      background: cfg.priority_level === n
                        ? (n === 1 ? COLORS.bgRed : n === 2 ? COLORS.bgBlue : COLORS.bgGray)
                        : 'rgba(255,255,255,0.7)',
                      color: cfg.priority_level === n
                        ? (n === 1 ? COLORS.danger : n === 2 ? COLORS.info : COLORS.textSecondary)
                        : COLORS.textSecondary,
                      border: `2px solid ${
                        cfg.priority_level === n
                          ? (n === 1 ? COLORS.borderRed : n === 2 ? COLORS.borderBlue : COLORS.borderFaint)
                          : COLORS.borderFaint}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}>
              {n === 1 ? 'P1 최우선' : n === 2 ? 'P2 일반' : 'P3 백업'}
            </button>
          ))}
        </div>
      </div>

      {/* 2행 — 희망 / 비선호 요일 (큰 버튼) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={cfgFieldLabel}>
            🌟 희망 요일
            <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted }}>매치 시 ranking 우선</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0,1,2,3,4,5,6].map(d => dowBtn(d, cfg.preferred_dow_prefer, 'prefer'))}
          </div>
        </div>
        <div>
          <div style={cfgFieldLabel}>
            🚫 비선호 요일
            <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted }}>매치 시 후순위</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0,1,2,3,4,5,6].map(d => dowBtn(d, cfg.preferred_dow_avoid, 'avoid'))}
          </div>
        </div>
      </div>

      {/* 3행 — 일수 / 한도 (3 컬럼) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div>
          <div style={cfgFieldLabel}>📈 월 필수 일수</div>
          <input type="number" min={0} value={cfg.required_days_per_month}
                 onChange={(e) => onChange({ required_days_per_month: e.target.value })}
                 placeholder="비움 = 무관" style={cfgInputStyle} />
        </div>
        <div>
          <div style={cfgFieldLabel}>🛑 월 최대 일수</div>
          <input type="number" min={0} value={cfg.max_days_per_month}
                 onChange={(e) => onChange({ max_days_per_month: e.target.value })}
                 placeholder="비움 = 무제한" style={cfgInputStyle} />
        </div>
        <div>
          <div style={cfgFieldLabel}>🛡 연속 근무 한도</div>
          <input type="number" min={0} value={cfg.max_consecutive_work_days}
                 onChange={(e) => onChange({ max_consecutive_work_days: e.target.value })}
                 placeholder="비움 = 무제한" style={cfgInputStyle} />
        </div>
      </div>

      {/* 4행 — 슬롯 거부 (큼직 chip) */}
      <div>
        <div style={cfgFieldLabel}>
          🚷 슬롯 거부
          <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted }}>이 슬롯엔 절대 배정 X</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {slots.map(s => {
            const active = cfg.blocked_slot_ids.has(s.id)
            return (
              <button key={s.id} type="button" onClick={() => toggleBlockedSlot(s.id)}
                      style={{
                        padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 800,
                        background: active ? COLORS.bgRed : 'rgba(255,255,255,0.7)',
                        color: active ? COLORS.danger : COLORS.textSecondary,
                        border: `1.5px solid ${active ? COLORS.borderRed : COLORS.borderFaint}`,
                        cursor: 'pointer', fontFamily: 'monospace',
                        transition: 'all 0.12s',
                      }}>
                {active && '🚫 '}{s.code}
              </button>
            )
          })}
        </div>
      </div>

      {/* 5행 — 패턴 메모 */}
      <div>
        <div style={cfgFieldLabel}>
          📝 패턴 메모
          <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted }}>자유 — 알고리즘 영향 X (참고용)</span>
        </div>
        <input type="text" value={cfg.work_pattern_text}
               onChange={(e) => onChange({ work_pattern_text: e.target.value })}
               placeholder="예: 2-on-2-off / 야간 전담 / 주말 안 됨 등"
               style={cfgInputStyle} />
      </div>
    </div>
  )
}
