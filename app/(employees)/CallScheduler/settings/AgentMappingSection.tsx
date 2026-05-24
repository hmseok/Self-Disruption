'use client'
// ═══════════════════════════════════════════════════════════════════
// 상담원 ID 매칭 — 콜센터 워커 ↔ 외부 식별자(KT/Cafe24)
//   WHR-B2 (2026-05-24) — 별도 워커 목록 폐기, WorkersTab 의 워커 표
//   「편집」 펼침에 통합. (위/아래 중복 목록 제거 — 사용자 지시)
//
//   구성:
//     · useAgentMatching()  — 매칭 데이터·draft·저장 로직 훅 (WorkersTab 1회 호출)
//     · MatchingTopBar      — 미매칭 요약 + 전체 자동 매칭 + 일괄 저장 (표 상단)
//     · WorkerMatchEditor   — per-워커 KT/Cafe24 드롭다운 (워커 편집 펼침)
//     · MatchStatusDots     — 행 접힘 상태의 KT/Cafe24 매칭 상태 칩
//   API: kpi/agent-mapping (GET/POST) — 변경 없음.
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

interface SaveResult { ok: boolean; text: string; detail?: string; at: string }
const nowLabel = () =>
  new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

export interface KtAgent {
  kt_id: string
  agent_name: string
  call_rows: number
  prod_rows: number
  total_rows: number
  active: boolean
}
export interface Cafe24User {
  user_id: string
  name: string
  intake_count: number
}
interface MappingWorker {
  id: string
  name: string
  kt_id: string | null
  cafe24_user_id: string | null
}

// ═══════════════════════════════════════════════════════════════════
// useAgentMatching — 매칭 데이터·상태·저장 훅
//   WorkersTab 이 1회 호출하고, 반환 객체를 하위 컴포넌트에 prop 전달.
// ═══════════════════════════════════════════════════════════════════
export interface AgentMatching {
  loading: boolean
  saving: boolean
  ktAgents: KtAgent[]
  cafe24Users: Cafe24User[]
  cafe24Ok: boolean
  workers: MappingWorker[]
  draftKt: Record<string, string>
  draftCafe24: Record<string, string>
  result: SaveResult | null
  setResult: (r: SaveResult | null) => void
  recommendKtFor: (workerName: string) => KtAgent | null
  recommendCafe24For: (workerName: string) => Cafe24User | null
  assignKt: (workerId: string, ktId: string) => void
  assignCafe24: (workerId: string, userId: string) => void
  resetWorker: (workerId: string) => void
  autoMatchAll: () => void
  saveAll: () => Promise<void>
  saveWorker: (workerId: string) => Promise<{ ok: boolean; detail: string }>
}

export function useAgentMatching(): AgentMatching {
  const [ktAgents, setKtAgents] = useState<KtAgent[]>([])
  const [cafe24Users, setCafe24Users] = useState<Cafe24User[]>([])
  const [cafe24Ok, setCafe24Ok] = useState(true)
  const [workers, setWorkers] = useState<MappingWorker[]>([])
  // 편집 중 매핑 — worker_id → 식별자 ('' = 매칭 해제). KT·Cafe24 각각 별도 draft.
  const [draftKt, setDraftKt] = useState<Record<string, string>>({})
  const [draftCafe24, setDraftCafe24] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/kpi/agent-mapping', { headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '조회 실패')
      const d = json?.data || {}
      const agents: KtAgent[] = Array.isArray(d.kt_agents) ? d.kt_agents : []
      const cafe: Cafe24User[] = Array.isArray(d.cafe24_users) ? d.cafe24_users : []
      const wks: MappingWorker[] = Array.isArray(d.workers) ? d.workers : []
      setKtAgents(agents)
      setCafe24Users(cafe)
      setCafe24Ok(d.cafe24_ok !== false)
      setWorkers(wks)
      // draft 초기화 — 현재 저장된 식별자로
      const initKt: Record<string, string> = {}
      const initCafe: Record<string, string> = {}
      for (const w of wks) {
        initKt[w.id] = w.kt_id || ''
        initCafe[w.id] = w.cafe24_user_id || ''
      }
      setDraftKt(initKt)
      setDraftCafe24(initCafe)
    } catch (e: any) {
      setResult({ ok: false, text: '❌ 상담원 매칭 조회 실패', detail: e?.message, at: nowLabel() })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── KT 자동 추천: 워커 이름 == agent_name, 활성 우선 → 데이터 최다 ──
  const recommendKtFor = useCallback((workerName: string): KtAgent | null => {
    const name = (workerName || '').trim()
    if (!name) return null
    const cands = ktAgents.filter(a => (a.agent_name || '').trim() === name)
    if (cands.length === 0) return null
    const sorted = [...cands].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1
      return b.total_rows - a.total_rows
    })
    return sorted[0] || null
  }, [ktAgents])

  // ── Cafe24 자동 추천: 워커 이름 == user name, 접수건수 최다 우선 ──
  const recommendCafe24For = useCallback((workerName: string): Cafe24User | null => {
    const name = (workerName || '').trim()
    if (!name) return null
    const cands = cafe24Users.filter(u => (u.name || '').trim() === name)
    if (cands.length === 0) return null
    const sorted = [...cands].sort((a, b) => b.intake_count - a.intake_count)
    return sorted[0] || null
  }, [cafe24Users])

  // 한 워커에 식별자 배정 — 같은 값 쓰던 다른 워커 draft 는 비움 (1:1 보장)
  const assignKt = useCallback((workerId: string, ktId: string) => {
    setDraftKt(prev => {
      const next = { ...prev }
      if (ktId) {
        for (const wid of Object.keys(next)) {
          if (wid !== workerId && next[wid] === ktId) next[wid] = ''
        }
      }
      next[workerId] = ktId
      return next
    })
  }, [])
  const assignCafe24 = useCallback((workerId: string, userId: string) => {
    setDraftCafe24(prev => {
      const next = { ...prev }
      if (userId) {
        for (const wid of Object.keys(next)) {
          if (wid !== workerId && next[wid] === userId) next[wid] = ''
        }
      }
      next[workerId] = userId
      return next
    })
  }, [])

  // 편집 취소 시 — 그 워커 draft 를 서버 저장값으로 되돌림
  const resetWorker = useCallback((workerId: string) => {
    const w = workers.find(x => x.id === workerId)
    setDraftKt(prev => ({ ...prev, [workerId]: w?.kt_id || '' }))
    setDraftCafe24(prev => ({ ...prev, [workerId]: w?.cafe24_user_id || '' }))
  }, [workers])

  // 전체 자동 매칭 — 이름 일치 식별자 일괄 임시 배정 (중복 시 데이터 최다 우선)
  const autoMatchAll = useCallback(() => {
    const nextKt: Record<string, string> = {}
    for (const w of workers) nextKt[w.id] = draftKt[w.id] || ''
    const ktByKey = new Map<string, { workerId: string; rows: number }>()
    for (const w of workers) {
      const rec = recommendKtFor(w.name)
      if (!rec) continue
      const cur = ktByKey.get(rec.kt_id)
      if (!cur || rec.total_rows > cur.rows) {
        ktByKey.set(rec.kt_id, { workerId: w.id, rows: rec.total_rows })
      }
    }
    for (const [ktId, owner] of ktByKey) nextKt[owner.workerId] = ktId
    setDraftKt(nextKt)

    let cafeMatched = 0
    if (cafe24Ok) {
      const nextCafe: Record<string, string> = {}
      for (const w of workers) nextCafe[w.id] = draftCafe24[w.id] || ''
      const cafeByKey = new Map<string, { workerId: string; rows: number }>()
      for (const w of workers) {
        const rec = recommendCafe24For(w.name)
        if (!rec) continue
        const cur = cafeByKey.get(rec.user_id)
        if (!cur || rec.intake_count > cur.rows) {
          cafeByKey.set(rec.user_id, { workerId: w.id, rows: rec.intake_count })
        }
      }
      for (const [userId, owner] of cafeByKey) nextCafe[owner.workerId] = userId
      setDraftCafe24(nextCafe)
      cafeMatched = cafeByKey.size
    }

    setResult({
      ok: true, text: '🔗 전체 자동 매칭 적용',
      detail: `KT ${ktByKey.size}건` +
        (cafe24Ok ? ` · Cafe24 ${cafeMatched}건` : ' · Cafe24 미연결 (제외)') +
        ' — 이름 일치 식별자를 임시 배정했습니다. 「✓ 매칭 저장」 으로 확정하세요.',
      at: nowLabel(),
    })
  }, [workers, draftKt, draftCafe24, cafe24Ok, recommendKtFor, recommendCafe24For])

  // 일괄 저장 — 모든 워커 draft 를 POST
  const saveAll = useCallback(async () => {
    setSaving(true); setResult(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/kpi/agent-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          mappings: workers.map(w => ({
            worker_id: w.id,
            kt_id: draftKt[w.id] || '',
            cafe24_user_id: draftCafe24[w.id] || '',
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      const d = json.data || {}
      const errs: string[] = Array.isArray(d.errors) ? d.errors : []
      const ktLinked = Object.values(draftKt).filter(Boolean).length
      const cafeLinked = Object.values(draftCafe24).filter(Boolean).length
      setResult({
        ok: errs.length === 0,
        text: errs.length === 0 ? '🔗 상담원 매칭 저장 완료' : '⚠ 상담원 매칭 일부 저장',
        detail: `갱신 ${Number(d.updated || 0)}건 · 해제 ${Number(d.cleared || 0)}건` +
          (Number(d.released || 0) > 0 ? ` · 중복 해제 ${Number(d.released)}건` : '') +
          ` · KT 연결 ${ktLinked}명 · Cafe24 연결 ${cafeLinked}명` +
          (errs.length > 0 ? ` · 실패 ${errs.length}건 (${errs.slice(0, 3).join(' / ')})` : '') +
          ' — KPI 집계에 이 매칭이 반영됩니다.',
        at: nowLabel(),
      })
      await load()
    } catch (e: any) {
      setResult({ ok: false, text: '❌ 상담원 매칭 저장 실패', detail: e?.message, at: nowLabel() })
    } finally {
      setSaving(false)
    }
  }, [workers, draftKt, draftCafe24, load])

  // 단일 워커 저장 — 워커 「편집」 저장 시 호출 (WorkersTab.saveEdit)
  const saveWorker = useCallback(async (workerId: string) => {
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/kpi/agent-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          mappings: [{
            worker_id: workerId,
            kt_id: draftKt[workerId] || '',
            cafe24_user_id: draftCafe24[workerId] || '',
          }],
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '매칭 저장 실패')
      await load()
      return { ok: true, detail: 'KT·Cafe24 매칭 반영됨' }
    } catch (e: any) {
      return { ok: false, detail: e?.message || '매칭 저장 실패' }
    } finally {
      setSaving(false)
    }
  }, [draftKt, draftCafe24, load])

  return {
    loading, saving, ktAgents, cafe24Users, cafe24Ok, workers,
    draftKt, draftCafe24, result, setResult,
    recommendKtFor, recommendCafe24For,
    assignKt, assignCafe24, resetWorker, autoMatchAll, saveAll, saveWorker,
  }
}

// ═══════════════════════════════════════════════════════════════════
// MatchingTopBar — 미매칭 요약 + 전체 자동 매칭 + 일괄 저장 (워커 표 상단)
// ═══════════════════════════════════════════════════════════════════
export function MatchingTopBar({ matching: m }: { matching: AgentMatching }) {
  const usedKtIds = new Set(Object.values(m.draftKt).filter(Boolean))
  const usedCafe24 = new Set(Object.values(m.draftCafe24).filter(Boolean))
  const unmatchedWorkersKt = m.workers.filter(w => !m.draftKt[w.id])
  const unmatchedKt = m.ktAgents.filter(a => !usedKtIds.has(a.kt_id))
  const unmatchedWorkersCafe24 = m.workers.filter(w => !m.draftCafe24[w.id])
  const unmatchedCafe24 = m.cafe24Users.filter(u => !usedCafe24.has(u.user_id))
  const anyUnmatched =
    unmatchedWorkersKt.length > 0 || unmatchedKt.length > 0 ||
    (m.cafe24Ok && (unmatchedWorkersCafe24.length > 0 || unmatchedCafe24.length > 0))
  // 미저장 변경(draft ≠ 서버값) 있는지 — 저장 버튼 활성 기준
  const dirty = m.workers.some(w =>
    (m.draftKt[w.id] || '') !== (w.kt_id || '') ||
    (m.draftCafe24[w.id] || '') !== (w.cafe24_user_id || ''))
  const noData = m.ktAgents.length === 0 && m.cafe24Users.length === 0

  return (
    <div style={{ marginBottom: 12 }}>
      <ResultPanel result={m.result} onClose={() => m.setResult(null)} />

      {/* Cafe24 미연결 안내 */}
      {!m.cafe24Ok && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 8,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
          fontSize: 11, color: COLORS.warning, fontWeight: 700,
        }}>
          ⚠ Cafe24 ERP 에 연결하지 못했습니다 — 접수자 매칭은 표시할 수 없습니다.
          KT 상담사 매칭은 정상 동작합니다.
        </div>
      )}
      {m.ktAgents.length === 0 && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 8,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
          fontSize: 11, color: COLORS.warning,
        }}>
          ⚠ KT 상담이력·생산성 데이터가 아직 없습니다 — 엑셀 업로드 후 매칭할 수 있습니다.
        </div>
      )}

      {/* 미매칭 요약 + 액션 */}
      <div style={{
        ...GLASS.L3,
        background: anyUnmatched ? COLORS.bgRed : COLORS.bgGreen,
        border: `1px solid ${anyUnmatched ? COLORS.borderRed : COLORS.borderGreen}`,
        borderRadius: 10, padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 12, fontWeight: 800,
          color: anyUnmatched ? COLORS.danger : COLORS.success,
        }}>
          🔗 {anyUnmatched ? '상담원 ID 미매칭 있음' : '상담원 ID 전부 매칭됨'}
        </span>
        <span style={{ fontSize: 11, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
          {`KT — 워커 미매칭 ${unmatchedWorkersKt.length}명 · 미사용 ID ${unmatchedKt.length}개`}
        </span>
        <span style={{ fontSize: 11, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
          {m.cafe24Ok
            ? `Cafe24 — 워커 미매칭 ${unmatchedWorkersCafe24.length}명 · 미사용 접수자 ${unmatchedCafe24.length}명`
            : 'Cafe24 — 미연결'}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={m.autoMatchAll} disabled={noData}
          style={{
            ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none',
            cursor: noData ? 'not-allowed' : 'pointer', opacity: noData ? 0.5 : 1,
            whiteSpace: 'nowrap',
          }}>
          ✨ 전체 자동 매칭
        </button>
        <button type="button" onClick={m.saveAll} disabled={m.saving || !dirty}
          style={{
            ...BTN.sm, background: COLORS.success, color: '#fff', border: 'none',
            cursor: (m.saving || !dirty) ? 'not-allowed' : 'pointer',
            opacity: (m.saving || !dirty) ? 0.5 : 1, whiteSpace: 'nowrap',
          }}>
          {m.saving ? '저장 중...' : '✓ 매칭 저장'}
        </button>
      </div>

      {/* 미사용 식별자 참조 — 어떤 워커에도 안 묶인 KT ID / Cafe24 접수자 */}
      {unmatchedKt.length > 0 && (
        <div style={{
          ...GLASS.L1, borderRadius: 8, padding: '6px 12px', marginTop: 8,
          border: `1px solid ${COLORS.borderRed}`,
        }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: COLORS.danger }}>
            안 묶인 KT ID {unmatchedKt.length}개 ·{' '}
          </span>
          <span style={{ fontSize: 11, color: COLORS.textSecondary }}>
            {unmatchedKt.slice(0, 16)
              .map(a => `${a.agent_name || '?'}(${a.kt_id})·${a.total_rows}건`)
              .join('  /  ')}
            {unmatchedKt.length > 16 && `  …외 ${unmatchedKt.length - 16}개`}
          </span>
        </div>
      )}
      {m.cafe24Ok && unmatchedCafe24.length > 0 && (
        <div style={{
          ...GLASS.L1, borderRadius: 8, padding: '6px 12px', marginTop: 8,
          border: `1px solid ${COLORS.borderRed}`,
        }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: COLORS.danger }}>
            안 묶인 Cafe24 접수자 {unmatchedCafe24.length}명 ·{' '}
          </span>
          <span style={{ fontSize: 11, color: COLORS.textSecondary }}>
            {unmatchedCafe24.slice(0, 16)
              .map(u => `${u.name || '?'}(${u.user_id})·${u.intake_count}건`)
              .join('  /  ')}
            {unmatchedCafe24.length > 16 && `  …외 ${unmatchedCafe24.length - 16}명`}
          </span>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// MatchStatusDots — 워커 행(접힘)의 KT/Cafe24 매칭 상태 칩
// ═══════════════════════════════════════════════════════════════════
export function MatchStatusDots({ workerId, matching: m }: {
  workerId: string; matching: AgentMatching
}) {
  const loading = m.loading && m.workers.length === 0
  const hasKt = !!(m.draftKt[workerId])
  const hasCafe = !!(m.draftCafe24[workerId])
  const chip = (label: string, ok: boolean, muted: boolean) => (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 4,
      whiteSpace: 'nowrap',
      background: muted ? COLORS.bgGray : ok ? COLORS.bgGreen : COLORS.bgRed,
      color: muted ? COLORS.textMuted : ok ? COLORS.success : COLORS.danger,
      border: `1px solid ${muted ? COLORS.borderFaint : ok ? COLORS.borderGreen : COLORS.borderRed}`,
    }}>{label}</span>
  )
  return (
    <span style={{ display: 'inline-flex', gap: 3, marginLeft: 6, verticalAlign: 'middle' }}
      title="KT 상담사 ID · Cafe24 접수자 매칭 상태">
      {chip('KT', hasKt, loading)}
      {chip('C24', hasCafe, loading || !m.cafe24Ok)}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════
// WorkerMatchEditor — 워커 「편집」 펼침의 per-워커 KT/Cafe24 매칭 패널
// ═══════════════════════════════════════════════════════════════════
export function WorkerMatchEditor({ workerId, workerName, matching: m }: {
  workerId: string; workerName: string; matching: AgentMatching
}) {
  const curKt = m.draftKt[workerId] || ''
  const curCafe = m.draftCafe24[workerId] || ''
  const recKt = m.recommendKtFor(workerName)
  const recCafe = m.recommendCafe24For(workerName)
  const isRecKt = !!recKt && curKt === recKt.kt_id
  const isRecCafe = !!recCafe && curCafe === recCafe.user_id
  const matchedAgent = m.ktAgents.find(a => a.kt_id === curKt)
  const matchedCafe = m.cafe24Users.find(u => u.user_id === curCafe)

  const selStyle: React.CSSProperties = {
    ...GLASS.L1, flex: 1, minWidth: 200, boxSizing: 'border-box',
    padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
    fontFamily: 'inherit',
  }
  const badge = (text: string, bg: string, bd: string, color: string) => (
    <span style={{
      fontSize: 10, fontWeight: 800, color, background: bg,
      border: `1px solid ${bd}`, borderRadius: 6, padding: '3px 7px',
      width: 52, textAlign: 'center', whiteSpace: 'nowrap',
    }}>{text}</span>
  )

  return (
    <div style={{
      ...GLASS.L3, background: COLORS.bgBlue,
      border: `1px solid ${COLORS.borderBlue}`,
      borderRadius: 10, padding: 12, marginTop: 8,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 4,
      }}>
        🔗 상담원 ID 매칭
      </div>
      <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 10 }}>
        KT 상담사 ID(생산성·상담이력) · Cafe24 접수자(사고·긴급출동 접수 귀속) 연결 —
        「저장」 시 워커 정보와 함께 반영됩니다.
      </div>

      {/* KT 매칭 행 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {badge('KT', COLORS.bgBlue, COLORS.borderBlue, COLORS.primary)}
        <select value={curKt} onChange={(e) => m.assignKt(workerId, e.target.value)}
          style={{ ...selStyle, color: curKt ? COLORS.textPrimary : COLORS.textMuted, cursor: 'pointer' }}>
          <option value="">— 매칭 해제 (KT ID 없음) —</option>
          {m.ktAgents.map(a => (
            <option key={a.kt_id} value={a.kt_id}>
              {`${a.agent_name || '?'}(${a.kt_id}) · 데이터 ${a.total_rows}건`}
              {a.active ? ' · 활성' : ''}
            </option>
          ))}
        </select>
        {recKt && !isRecKt && (
          <button type="button" onClick={() => m.assignKt(workerId, recKt.kt_id)}
            style={{
              ...BTN.sm, background: 'transparent', color: COLORS.primary,
              border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            💡 추천 {recKt.kt_id}
          </button>
        )}
        {isRecKt && (
          <span style={{
            fontSize: 10, fontWeight: 800, color: COLORS.success,
            background: COLORS.bgGreen, border: `1px solid ${COLORS.borderGreen}`,
            borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap',
          }}>✓ 추천 일치</span>
        )}
        <span style={{
          fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
          color: curKt ? COLORS.textMuted : COLORS.danger,
        }}>
          {curKt ? (matchedAgent ? `${matchedAgent.total_rows}건` : 'KT 데이터 없음') : '미매칭'}
        </span>
      </div>

      {/* Cafe24 매칭 행 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {badge('Cafe24', COLORS.bgViolet, COLORS.borderViolet, COLORS.primaryDark)}
        <select value={curCafe} disabled={!m.cafe24Ok}
          onChange={(e) => m.assignCafe24(workerId, e.target.value)}
          style={{
            ...selStyle, color: curCafe ? COLORS.textPrimary : COLORS.textMuted,
            cursor: m.cafe24Ok ? 'pointer' : 'not-allowed', opacity: m.cafe24Ok ? 1 : 0.5,
          }}>
          <option value="">— 매칭 해제 —</option>
          {m.cafe24Users.map(u => (
            <option key={u.user_id} value={u.user_id}>
              {`${u.name || '?'}(${u.user_id}) · 접수 ${u.intake_count}건`}
            </option>
          ))}
        </select>
        {m.cafe24Ok && recCafe && !isRecCafe && (
          <button type="button" onClick={() => m.assignCafe24(workerId, recCafe.user_id)}
            style={{
              ...BTN.sm, background: 'transparent', color: COLORS.primaryDark,
              border: `1px solid ${COLORS.borderViolet}`, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            💡 추천 {recCafe.user_id}
          </button>
        )}
        {m.cafe24Ok && isRecCafe && (
          <span style={{
            fontSize: 10, fontWeight: 800, color: COLORS.success,
            background: COLORS.bgGreen, border: `1px solid ${COLORS.borderGreen}`,
            borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap',
          }}>✓ 추천 일치</span>
        )}
        <span style={{
          fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
          color: !m.cafe24Ok ? COLORS.textMuted : curCafe ? COLORS.textMuted : COLORS.danger,
        }}>
          {!m.cafe24Ok
            ? '미연결'
            : curCafe ? (matchedCafe ? `${matchedCafe.intake_count}건` : '접수 데이터 없음') : '미매칭'}
        </span>
      </div>
    </div>
  )
}

// ── 저장 결과 글래스 패널 (규칙 20 — alert 금지) ──────────────────
function ResultPanel({ result, onClose }: {
  result: SaveResult | null; onClose: () => void
}) {
  if (!result) return null
  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 8,
      border: `1px solid ${result.ok ? COLORS.borderGreen : COLORS.borderRed}`,
      background: result.ok ? COLORS.bgGreen : COLORS.bgRed,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 13, fontWeight: 800,
          color: result.ok ? COLORS.success : COLORS.danger,
        }}>
          {result.text}
          <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginLeft: 6 }}>
            {result.at}
          </span>
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 13, color: COLORS.textMuted, fontWeight: 700,
          }}>× 닫기</button>
      </div>
      {result.detail && (
        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 6 }}>
          {result.detail}
        </div>
      )}
    </div>
  )
}
