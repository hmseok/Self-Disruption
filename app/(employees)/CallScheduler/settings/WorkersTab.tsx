'use client'
// ═══════════════════════════════════════════════════════════════════
// WorkersTab — 콜센터 워커 관리 (Phase K: 정체성만)
//   2026-05-09 — 그룹 중심 재구성:
//     priority/dow/한도/일수/슬롯거부/패턴 → cs_group_members (그룹쪽 편집)
//   본 탭은 워커 정체성만:
//     · 색상 + 그룹 라벨 + 외부 직원 여부 + 외부 근무 cycle
//   그룹별 설정은 「그룹」 탭의 멤버 카드에서 편집
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState, Fragment } from 'react'
import Link from 'next/link'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '@/app/(employees)/CallScheduler/utils/palette'
import { COLOR_TONE_OPTIONS } from '@/app/(employees)/CallScheduler/utils/types'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { Worker, ColorTone, ShiftSlot } from '@/app/(employees)/CallScheduler/utils/types'

const GROUP_OPTIONS: (string | null)[] = [null, '주간', '야간', '저녁', '관리', '기타']

interface RideEmp {
  id: string
  name: string
  department: string | null
  position: string | null
  phone: string | null
  email: string | null
  color_tone: ColorTone
  group_label: string | null
  is_active: boolean
}

export default function WorkersTab() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [employees, setEmployees] = useState<RideEmp[]>([])
  const [slots, setSlots] = useState<ShiftSlot[]>([])  // N-29-b — 슬롯 거부 입력용
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Phase K — 정체성 편집 state (옮긴 필드 모두 제거)
  const [editTone, setEditTone] = useState<ColorTone>('none')
  const [editGroup, setEditGroup] = useState<string | null>(null)
  const [editIsExternal, setEditIsExternal] = useState(false)
  const [editCycleOn, setEditCycleOn] = useState<string>('')
  const [editCycleOff, setEditCycleOff] = useState<string>('')
  const [editCycleStart, setEditCycleStart] = useState<string>('')
  // N-29-b — 개인 한계 (그룹 무관 — 워커 단위)
  const [editMaxConsec, setEditMaxConsec] = useState<string>('')   // '' = 무제한
  const [editMaxDays, setEditMaxDays] = useState<string>('')       // '' = 무제한
  const [editMinDays, setEditMinDays] = useState<string>('')       // N-36 — '' = 무제한 (최소 보장 X)
  const [editBlockedSlots, setEditBlockedSlots] = useState<Set<string>>(new Set())
  const [editDowPrefer, setEditDowPrefer] = useState<Set<number>>(new Set())
  const [editDowAvoid, setEditDowAvoid] = useState<Set<number>>(new Set())
  // N-56-b — 비균등 cycle 패턴 은 그룹멤버 cfg 로 이동 (GroupEditor MemberCfgPanel)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const [wRes, eRes, sRes] = await Promise.all([
        fetch('/api/call-scheduler/workers', { headers: auth }),
        fetch('/api/ride-employees?include_inactive=0', { headers: auth }),
        fetch('/api/call-scheduler/shift-slots', { headers: auth }),  // N-29-b
      ])
      const wJ = await wRes.json(); if (!wRes.ok) throw new Error(wJ?.error || '워커 조회 실패')
      const eJ = await eRes.json(); if (!eRes.ok) throw new Error(eJ?.error || '직원 조회 실패')
      const sJ = sRes.ok ? await sRes.json() : { data: [] }
      setWorkers(wJ.data); setEmployees(eJ.data)
      setSlots(Array.isArray(sJ.data) ? sJ.data : [])
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // 콜센터 워커 + 라이드 직원 조인 (이름 또는 employee_id 기준)
  const rows = useMemo(() => {
    return workers.map(w => {
      const emp = employees.find(e => e.id === (w as any).employee_id) || employees.find(e => e.name === w.name)
      return { worker: w, employee: emp || null }
    })
  }, [workers, employees])

  const startEdit = (w: Worker) => {
    setEditingId(w.id); setEditTone(w.color_tone); setEditGroup(w.group_label)
    setEditIsExternal(!!w.is_external)
    setEditCycleOn(w.cycle_days_on != null ? String(w.cycle_days_on) : '')
    setEditCycleOff(w.cycle_days_off != null ? String(w.cycle_days_off) : '')
    setEditCycleStart(w.cycle_start_date || '')
    // N-29-b — 개인 한계 로드
    const wx = w as any
    setEditMaxConsec(wx.max_consecutive_work_days != null ? String(wx.max_consecutive_work_days) : '')
    setEditMaxDays(wx.max_days_per_month != null ? String(wx.max_days_per_month) : '')
    setEditMinDays(wx.min_days_per_month != null ? String(wx.min_days_per_month) : '')  // N-36
    setEditBlockedSlots(new Set(Array.isArray(wx.blocked_slot_ids) ? wx.blocked_slot_ids : []))
    setEditDowPrefer(new Set(
      typeof wx.preferred_dow_prefer === 'string'
        ? wx.preferred_dow_prefer.split(',').map((s: string) => Number(s.trim())).filter((n: number) => !isNaN(n) && n >= 0 && n <= 6)
        : []
    ))
    setEditDowAvoid(new Set(
      typeof wx.preferred_dow_avoid === 'string'
        ? wx.preferred_dow_avoid.split(',').map((s: string) => Number(s.trim())).filter((n: number) => !isNaN(n) && n >= 0 && n <= 6)
        : []
    ))
  }
  const cancelEdit = () => { setEditingId(null) }

  // N-50 — 영구 링크 토큰 발급/복사/폐기
  const handleTokenAction = async (w: Worker, emp: any) => {
    const currentToken = emp?.public_token
    const linkBase = typeof window !== 'undefined' ? window.location.origin : 'https://hmseok.com'
    const linkFor = (t: string) => `${linkBase}/CallScheduler/e/${t}`

    if (currentToken) {
      // 토큰 있음 — 복사 / 재발급 / 폐기 선택
      const url = linkFor(currentToken)
      const choice = window.prompt(
        `${w.name} 영구 링크\n\n${url}\n\n[OK] = 복사\n[취소] = 다른 액션 선택`,
        url,
      )
      if (choice !== null) {
        // 복사
        try {
          await navigator.clipboard.writeText(url)
          setActionMsg({ ok: true, text: `${w.name} 영구 링크 복사됨` })
        } catch {
          setActionMsg({ ok: false, text: '복사 실패 — 수동 복사' })
        }
        return
      }
      // 취소 → 추가 액션
      const nextAction = window.prompt(
        `${w.name}\n[r] 재발급 (기존 무효화)\n[d] 폐기\n[취소] = 닫기`,
        '',
      )
      if (nextAction === 'r') {
        // 재발급
        try {
          const auth = await getAuthHeader()
          const res = await fetch(`/api/ride-employees/${emp.id}/token`, { method: 'POST', headers: auth })
          const json = await res.json()
          if (!res.ok) throw new Error(json?.error || '재발급 실패')
          setActionMsg({ ok: true, text: `${w.name} 토큰 재발급` })
          await load()
        } catch (e: any) {
          setActionMsg({ ok: false, text: e?.message || '오류' })
        }
      } else if (nextAction === 'd') {
        // 폐기
        if (!confirm(`${w.name} 영구 링크 폐기 — 기존 링크 무효화. 계속?`)) return
        try {
          const auth = await getAuthHeader()
          const res = await fetch(`/api/ride-employees/${emp.id}/token`, { method: 'DELETE', headers: auth })
          const json = await res.json()
          if (!res.ok) throw new Error(json?.error || '폐기 실패')
          setActionMsg({ ok: true, text: `${w.name} 토큰 폐기` })
          await load()
        } catch (e: any) {
          setActionMsg({ ok: false, text: e?.message || '오류' })
        }
      }
    } else {
      // 토큰 없음 — 발급
      if (!confirm(`${w.name} 영구 링크 발급 + 자동 발송 (카카오/SMS). 계속?`)) return
      try {
        const auth = await getAuthHeader()
        const res = await fetch(`/api/ride-employees/${emp.id}/token`, { method: 'POST', headers: auth })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '발급 실패')
        const newToken = json.data?.public_token
        const url = newToken ? linkFor(newToken) : ''
        try {
          if (url) await navigator.clipboard.writeText(url)
        } catch { /* graceful */ }
        // N-53 — 발송 결과 안내
        const notify = json.data?.notify_result
        let notifyMsg = ''
        if (notify?.success) {
          notifyMsg = notify.channel === 'kakao' ? ' / 📱 카카오 알림톡 발송' : ' / 📱 SMS 발송'
        } else if (notify?.reason) {
          notifyMsg = ` / ⚠ 발송 skip: ${notify.reason}`
        } else if (notify?.error) {
          notifyMsg = ` / ❌ 발송 실패: ${notify.error}`
        }
        setActionMsg({ ok: true, text: `${w.name} 토큰 발급 + 링크 복사${notifyMsg}` })
        await load()
      } catch (e: any) {
        setActionMsg({ ok: false, text: e?.message || '오류' })
      }
    }
  }

  const saveEdit = async (w: Worker) => {
    setSaving(true); setActionMsg(null)
    try {
      const auth = await getAuthHeader()
      // 1. RideEmployees 마스터 (color/group) — 사람 정보
      const emp = employees.find(e => e.id === (w as any).employee_id) || employees.find(e => e.name === w.name)
      if (emp) {
        const res = await fetch(`/api/ride-employees/${emp.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ color_tone: editTone, group_label: editGroup }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'RideEmployees 저장 실패')
      }
      // 2. cs_workers (정체성 + 외부 cycle + N-29-b 개인 한계)
      const wRes = await fetch(`/api/call-scheduler/workers/${w.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          color_tone: editTone,
          group_label: editGroup,
          is_external: editIsExternal,
          cycle_days_on: editCycleOn ? Number(editCycleOn) : null,
          cycle_days_off: editCycleOff ? Number(editCycleOff) : null,
          cycle_start_date: editCycleStart || null,
          // N-29-b — 개인 한계
          max_consecutive_work_days: editMaxConsec ? Number(editMaxConsec) : null,
          max_days_per_month: editMaxDays ? Number(editMaxDays) : null,
          min_days_per_month: editMinDays ? Number(editMinDays) : null,  // N-36

          blocked_slot_ids: Array.from(editBlockedSlots),
          preferred_dow_prefer: editDowPrefer.size > 0
            ? Array.from(editDowPrefer).sort().join(',') : null,
          preferred_dow_avoid: editDowAvoid.size > 0
            ? Array.from(editDowAvoid).sort().join(',') : null,
          // N-56-b — work_cycle_pattern 은 그룹멤버 cfg 로 이동
        }),
      })
      const wJson = await wRes.json()
      if (!wRes.ok) throw new Error(wJson?.error || 'cs_workers 저장 실패')

      setActionMsg({ ok: true, text: `${w.name} 변경 저장됨` })
      setEditingId(null)
      await load()
    } catch (e: any) { setActionMsg({ ok: false, text: e?.message || '오류' }) }
    finally { setSaving(false) }
  }

  // 라이드 직원 중 콜센터 워커가 아닌 사람들 (활성화 후보)
  const candidates = useMemo(() => {
    return employees.filter(e =>
      e.is_active && !workers.some(w => (w as any).employee_id === e.id || w.name === e.name)
    )
  }, [employees, workers])

  return (
    <div>
      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger, fontSize: 13,
        }}>❌ {error}</div>
      )}
      {actionMsg && (
        <div style={{
          ...GLASS.L3,
          background: actionMsg.ok ? COLORS.bgGreen : COLORS.bgRed,
          border: `1px solid ${actionMsg.ok ? COLORS.borderGreen : COLORS.borderRed}`,
          borderRadius: 8, padding: '8px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{
            fontSize: 13, fontWeight: 700,
            color: actionMsg.ok ? COLORS.success : COLORS.danger,
          }}>
            {actionMsg.ok ? '✅ ' : '❌ '}{actionMsg.text}
          </div>
          <button onClick={() => setActionMsg(null)} style={{
            background: 'transparent', border: 'none',
            color: COLORS.textMuted, cursor: 'pointer', fontSize: 14,
          }}>×</button>
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
          콜센터 워커 <strong>{workers.length}명</strong>
          {' · '}
          라이드 직원 마스터 <strong>{employees.length}명</strong>
          {candidates.length > 0 && (
            <span style={{ marginLeft: 8 }}>
              <span style={pillStyle('warning')}>+ {candidates.length}명 미활성화</span>
            </span>
          )}
        </div>
        <Link href="/RideEmployees" style={{
          ...BTN.sm, background: 'transparent', color: COLORS.info,
          border: `1px solid ${COLORS.borderBlue}`, textDecoration: 'none',
        }}>
          → 라이드 직원 마스터로
        </Link>
      </div>

      {/* Phase K 안내 — 그룹별 설정은 그룹쪽에서 */}
      <div style={{
        ...GLASS.L3, background: COLORS.bgBlue, borderRadius: 10,
        padding: '10px 14px', marginBottom: 12,
        border: `1px solid ${COLORS.borderBlue}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 16 }}>💡</span>
        <div style={{ flex: 1, fontSize: 12, color: COLORS.textPrimary }}>
          <strong>본 탭은 워커 정체성만</strong> — 색상 / 그룹 라벨 / 외부 직원 / 외부 근무 cycle.
          {' '}
          <strong>우선순위 / 희망요일 / 한도 / 슬롯 거부 / 패턴 메모는 「그룹」 탭의 멤버 카드</strong>에서
          편집 (그룹마다 다르게 적용 가능).
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
      ) : (
        <>
          {/* 콜센터 워커 목록 */}
          <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12, marginBottom: 12, overflow: 'auto' }}>
            <div style={{
              fontSize: 13, fontWeight: 800, color: COLORS.textPrimary,
              padding: '4px 6px', marginBottom: 8,
            }}>
              📞 콜센터 워커 ({workers.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                  <th style={thStyle}>이름</th>
                  <th style={thStyle}>부서</th>
                  <th style={thStyle}>직급</th>
                  <th style={thStyle}>그룹 (콜센터)</th>
                  <th style={thStyle}>색상 (캘린더)</th>
                  <th style={thStyle}>연락처</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ worker, employee }) => {
                  const isEditing = editingId === worker.id
                  const tone = isEditing ? editTone : worker.color_tone
                  return (
                    <Fragment key={worker.id}>
                    <tr style={{ borderBottom: isEditing ? 'none' : `1px solid ${COLORS.borderFaint}` }}>
                      <td style={tdStyle}>
                        <span style={{
                          color: TONE_TEXT[tone],
                          background: TONE_BG[tone] !== 'transparent' ? TONE_BG[tone] : undefined,
                          padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                        }}>
                          {employee?.name || worker.name}
                        </span>
                        {!employee && (
                          <span style={{ marginLeft: 4, fontSize: 10, color: COLORS.warning }}>
                            ⚠ 라이드 직원 미연결
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: COLORS.textMuted, fontSize: 12 }}>
                        {employee?.department || '·'}
                      </td>
                      <td style={{ ...tdStyle, color: COLORS.textMuted, fontSize: 12 }}>
                        {employee?.position || '·'}
                      </td>
                      <td style={tdStyle}>
                        {isEditing ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {GROUP_OPTIONS.map((g, i) => {
                              const v = g
                              const label = v || '없음'
                              return (
                                <button key={i} type="button"
                                        onClick={() => setEditGroup(v)}
                                        style={{
                                          padding: '2px 8px', fontSize: 10, fontWeight: 700, borderRadius: 4,
                                          background: editGroup === v ? COLORS.bgBlue : 'transparent',
                                          color: editGroup === v ? COLORS.info : COLORS.textSecondary,
                                          border: `1px solid ${editGroup === v ? COLORS.borderBlue : COLORS.borderFaint}`,
                                          cursor: 'pointer',
                                        }}>{label}</button>
                              )
                            })}
                          </div>
                        ) : (
                          worker.group_label
                            ? <span style={pillStyle('neutral')}>{worker.group_label}</span>
                            : <span style={{ color: COLORS.textMuted, fontSize: 11 }}>·</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {isEditing ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {COLOR_TONE_OPTIONS.map(opt => {
                              const active = editTone === opt.value
                              return (
                                <button key={opt.value} type="button"
                                        onClick={() => setEditTone(opt.value)}
                                        title={opt.label}
                                        style={{
                                          width: 18, height: 18, borderRadius: '50%',
                                          background: opt.value === 'none' ? '#fff' : opt.hex,
                                          border: active ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.borderFaint}`,
                                          cursor: 'pointer', padding: 0,
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          fontSize: 10, color: '#fff', fontWeight: 700,
                                        }}>
                                  {active ? '✓' : ''}
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <span style={{
                            display: 'inline-block', width: 14, height: 14, borderRadius: 3,
                            background: TONE_BG[worker.color_tone] !== 'transparent' ? TONE_BG[worker.color_tone] : '#fff',
                            border: `1px solid ${COLORS.borderFaint}`, verticalAlign: 'middle',
                            marginRight: 6,
                          }} />
                        )}
                        {!isEditing && (
                          <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                            {worker.color_tone === 'none' ? '없음' : worker.color_tone}
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 11, color: COLORS.textMuted }}>
                        {employee?.phone || '·'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {isEditing ? (
                          <>
                            <button type="button" onClick={() => saveEdit(worker)} disabled={saving}
                                    style={{
                                      ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none',
                                      cursor: saving ? 'not-allowed' : 'pointer', marginRight: 4,
                                    }}>저장</button>
                            <button type="button" onClick={cancelEdit}
                                    style={{
                                      ...BTN.sm, background: 'transparent', color: COLORS.textSecondary,
                                      border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                                    }}>취소</button>
                          </>
                        ) : (
                          <button type="button" onClick={() => startEdit(worker)}
                                  style={{
                                    ...BTN.sm, background: 'transparent', color: COLORS.info,
                                    border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer',
                                  }}>편집</button>
                        )}
                        {/* N-50 — 영구 링크 토큰 발급/복사/폐기 */}
                        {!isEditing && employee && (
                          <button type="button"
                                  onClick={() => handleTokenAction(worker, employee)}
                                  title={(employee as any).public_token
                                    ? '영구 링크 발급됨 — 클릭: 복사 / 재발급 / 폐기'
                                    : '영구 링크 발급 (비로그인 본인 페이지 공유용)'}
                                  style={{
                                    ...BTN.sm, marginLeft: 4,
                                    background: (employee as any).public_token ? COLORS.bgGreen : 'transparent',
                                    color: (employee as any).public_token ? COLORS.success : COLORS.textSecondary,
                                    border: `1px solid ${(employee as any).public_token ? COLORS.borderGreen : COLORS.borderFaint}`,
                                    cursor: 'pointer',
                                  }}>
                            🔗 {(employee as any).public_token ? '링크' : '발급'}
                          </button>
                        )}
                        {!isEditing && worker.is_external && (
                          <span style={{
                            marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4,
                            background: COLORS.bgViolet, color: '#7c3aed', fontWeight: 800,
                          }} title="외부 직원">🔒 외부</span>
                        )}
                      </td>
                    </tr>
                    {/* Phase K — 편집 시 정체성 패널 (외부 + 외부 cycle 만) */}
                    {isEditing && (
                      <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}`, background: 'rgba(59,130,246,0.04)' }}>
                        <td colSpan={7} style={{ padding: '12px 14px' }}>
                          <IdentityPanel
                            isExternal={editIsExternal} setIsExternal={setEditIsExternal}
                            cycleOn={editCycleOn} setCycleOn={setEditCycleOn}
                            cycleOff={editCycleOff} setCycleOff={setEditCycleOff}
                            cycleStart={editCycleStart} setCycleStart={setEditCycleStart}
                          />
                          {/* N-29-b — 개인 한계 (그룹 무관) */}
                          <PersonalLimitsPanel
                            maxConsec={editMaxConsec} setMaxConsec={setEditMaxConsec}
                            maxDays={editMaxDays} setMaxDays={setEditMaxDays}
                            minDays={editMinDays} setMinDays={setEditMinDays}
                            blockedSlots={editBlockedSlots} setBlockedSlots={setEditBlockedSlots}
                            dowPrefer={editDowPrefer} setDowPrefer={setEditDowPrefer}
                            dowAvoid={editDowAvoid} setDowAvoid={setEditDowAvoid}
                            slots={slots}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 미활성화 후보 */}
          {candidates.length > 0 && (
            <div style={{
              ...GLASS.L4, borderRadius: 12, padding: 12,
              border: `1px dashed ${COLORS.borderAmber}`,
              background: COLORS.bgAmber,
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.warning, marginBottom: 6 }}>
                💡 라이드 직원 마스터에는 있지만 콜센터 워커가 아님 ({candidates.length}명)
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>
                콜센터 부서로 옮기거나, 별도 부서면 그대로 두세요.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {candidates.map(e => (
                  <Link key={e.id} href={`/RideEmployees/${e.id}`}
                        style={{
                          padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                          background: 'rgba(255,255,255,0.5)',
                          color: TONE_TEXT[e.color_tone],
                          border: `1px solid ${COLORS.borderFaint}`,
                          textDecoration: 'none', whiteSpace: 'nowrap',
                        }}>
                    {e.name} {e.department && <span style={{ color: COLORS.textMuted, marginLeft: 4 }}>· {e.department}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left',
  color: COLORS.textSecondary, fontWeight: 700, whiteSpace: 'nowrap', fontSize: 12,
}
const tdStyle: React.CSSProperties = {
  padding: '8px 10px', whiteSpace: 'nowrap', color: COLORS.textPrimary,
}

// Phase K — 워커 정체성 패널 (외부 직원 + 외부 근무 cycle)
// N-56-b — 비균등 cycle 패턴 은 그룹멤버 cfg 로 이동 (MemberCfgPanel)
function IdentityPanel({
  isExternal, setIsExternal,
  cycleOn, setCycleOn,
  cycleOff, setCycleOff,
  cycleStart, setCycleStart,
}: {
  isExternal: boolean; setIsExternal: (v: boolean) => void
  cycleOn: string; setCycleOn: (v: string) => void
  cycleOff: string; setCycleOff: (v: string) => void
  cycleStart: string; setCycleStart: (v: string) => void
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
      ...GLASS.L1, borderRadius: 8, padding: 12,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <FieldLabel>🔒 외부 직원</FieldLabel>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
            cursor: 'pointer', userSelect: 'none',
          }}>
            <input type="checkbox" checked={isExternal}
                   onChange={(e) => setIsExternal(e.target.checked)} />
            <span style={{ fontSize: 12, color: COLORS.textPrimary }}>
              외부 직원으로 표시 (🔒 아이콘 + 자동 P1 권장 — 그룹쪽 설정)
            </span>
          </label>
        </div>
      </div>

      {/* 외부 근무 cycle (정동민 같은 외부 일정 워커) */}
      <div style={{
        ...GLASS.L1, borderRadius: 8, padding: 10,
        background: COLORS.bgViolet, border: `1px solid ${COLORS.borderViolet}`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#7c3aed', marginBottom: 6 }}>
          🏢 외부 근무 cycle (당사 X)
        </div>
        <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 8 }}>
          다른 회사 근무 일정 — 외부 근무일은 자동 생성에서 당사 후보 제외
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <FieldLabel>외부 근무일</FieldLabel>
            <input type="number" min={0} value={cycleOn}
                   onChange={(e) => setCycleOn(e.target.value)}
                   placeholder="2"
                   style={inputStyle} />
          </div>
          <div>
            <FieldLabel>외부 휴무일</FieldLabel>
            <input type="number" min={0} value={cycleOff}
                   onChange={(e) => setCycleOff(e.target.value)}
                   placeholder="2"
                   style={inputStyle} />
          </div>
          <div>
            <FieldLabel>시작 기준일</FieldLabel>
            <input type="date" value={cycleStart}
                   onChange={(e) => setCycleStart(e.target.value)}
                   style={inputStyle} />
          </div>
        </div>
        <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 6 }}>
          예: 외부 근무 2일 / 외부 휴무 2일 / 시작 2026-05-01 → 5/1·2 외부 근무 (당사 X), 5/3·4 외부 휴무 (당사 가능)
        </div>
        <div style={{
          fontSize: 10, color: COLORS.info, marginTop: 8,
          padding: '6px 10px', borderRadius: 6,
          background: COLORS.bgBlue, border: `1px solid ${COLORS.borderBlue}`,
        }}>
          💡 당사 근무 cycle (예: 1,2,1,4 비균등) 은 「그룹 → 멤버 cfg」 에서 그룹별로 설정 (출발일 그룹마다 다름)
        </div>
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary }}>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', fontSize: 12,
  border: `1px solid ${COLORS.borderFaint}`, borderRadius: 6,
  background: 'rgba(255,255,255,0.6)', color: COLORS.textPrimary,
}

// N-29-b — 워커 개인 한계 패널 (그룹 무관 — 모든 그룹 합산 적용)
function PersonalLimitsPanel({
  maxConsec, setMaxConsec, maxDays, setMaxDays,
  minDays, setMinDays,  // N-36
  blockedSlots, setBlockedSlots,
  dowPrefer, setDowPrefer, dowAvoid, setDowAvoid,
  slots,
}: {
  maxConsec: string; setMaxConsec: (v: string) => void
  maxDays: string; setMaxDays: (v: string) => void
  minDays: string; setMinDays: (v: string) => void  // N-36
  blockedSlots: Set<string>; setBlockedSlots: (v: Set<string>) => void
  dowPrefer: Set<number>; setDowPrefer: (v: Set<number>) => void
  dowAvoid: Set<number>; setDowAvoid: (v: Set<number>) => void
  slots: ShiftSlot[]
}) {
  const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']
  const toggleSlot = (id: string) => {
    const next = new Set(blockedSlots)
    if (next.has(id)) next.delete(id); else next.add(id)
    setBlockedSlots(next)
  }
  const toggleDow = (set: Set<number>, setter: (v: Set<number>) => void, d: number) => {
    const next = new Set(set)
    if (next.has(d)) next.delete(d); else next.add(d)
    setter(next)
  }
  return (
    <div style={{
      ...GLASS.L3, background: COLORS.bgGreen,
      border: `1px solid ${COLORS.borderGreen}`,
      borderRadius: 10, padding: 12, marginTop: 8,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 800, color: COLORS.success, marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        🛡️ 개인 한계 (그룹 무관 — 모든 그룹 합산 적용)
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
            📅 연속 근무 한도 (일) <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>빈 칸 = 무제한</span>
          </div>
          <input type="number" min={1} max={14} value={maxConsec}
                 onChange={(e) => setMaxConsec(e.target.value)}
                 placeholder="예: 5"
                 style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
            📊 월 최소 일수 <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>모든 그룹 합산, 빈 칸 = 무제한</span>
          </div>
          <input type="number" min={0} max={31} value={minDays}
                 onChange={(e) => setMinDays(e.target.value)}
                 placeholder="예: 8 (외부인력)"
                 style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
            🔴 월 최대 일수 <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>빈 칸 = 무제한</span>
          </div>
          <input type="number" min={1} max={31} value={maxDays}
                 onChange={(e) => setMaxDays(e.target.value)}
                 placeholder="예: 15"
                 style={inputStyle} />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
          🌟 희망 요일 <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>매치 시 우선순위 ↑</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {DOW_LABELS.map((label, d) => {
            const active = dowPrefer.has(d)
            return (
              <button key={d} type="button"
                      onClick={() => toggleDow(dowPrefer, setDowPrefer, d)}
                      style={{
                        flex: 1, padding: '4px 8px', fontSize: 11, fontWeight: 700,
                        borderRadius: 6, cursor: 'pointer',
                        background: active ? COLORS.bgGreen : 'transparent',
                        color: active ? COLORS.success : COLORS.textMuted,
                        border: `1px solid ${active ? COLORS.borderGreen : COLORS.borderFaint}`,
                      }}>{label}</button>
            )
          })}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
          🚫 비선호 요일 <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>매치 시 후순위</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {DOW_LABELS.map((label, d) => {
            const active = dowAvoid.has(d)
            return (
              <button key={d} type="button"
                      onClick={() => toggleDow(dowAvoid, setDowAvoid, d)}
                      style={{
                        flex: 1, padding: '4px 8px', fontSize: 11, fontWeight: 700,
                        borderRadius: 6, cursor: 'pointer',
                        background: active ? COLORS.bgRed : 'transparent',
                        color: active ? COLORS.danger : COLORS.textMuted,
                        border: `1px solid ${active ? COLORS.borderRed : COLORS.borderFaint}`,
                      }}>{label}</button>
            )
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
          ⛔ 슬롯 거부 <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>절대 배정 X</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {slots.map(s => {
            const active = blockedSlots.has(s.id)
            return (
              <button key={s.id} type="button"
                      onClick={() => toggleSlot(s.id)}
                      style={{
                        padding: '4px 10px', fontSize: 11, fontWeight: 700,
                        borderRadius: 99, cursor: 'pointer',
                        background: active ? COLORS.bgRed : 'transparent',
                        color: active ? COLORS.danger : COLORS.textSecondary,
                        border: `1px solid ${active ? COLORS.borderRed : COLORS.borderFaint}`,
                        whiteSpace: 'nowrap',
                      }}>
                {s.code} {s.start_time?.substring(0,5)}~{s.end_time?.substring(0,5)}
              </button>
            )
          })}
          {slots.length === 0 && (
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>시프트 없음</span>
          )}
        </div>
      </div>
    </div>
  )
}

