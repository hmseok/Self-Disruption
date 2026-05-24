'use client'
// ═══════════════════════════════════════════════════════════════════
// AgentMappingSection — 콜센터 워커 ↔ 외부 식별자(KT/Cafe24) 매칭
//   WHR-B (2026-05-24) — KPI 설정 ④ 상담원 매칭에서 「설정 › 워커」로 이동.
//   워커 정체성이므로 ID 매칭도 워커 설정에 위치 (사용자 지시).
//   워커별 KT 상담사 ID·Cafe24 접수자 드롭다운 + 이름일치 자동추천 +
//   「전체 자동 매칭」 + 미매칭 요약. API: kpi/agent-mapping (GET/POST).
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

// 저장 결과 글래스 패널 데이터
interface SaveResult {
  ok: boolean
  text: string
  detail?: string
  at: string
}
const nowLabel = () =>
  new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

interface KtAgent {
  kt_id: string
  agent_name: string
  call_rows: number
  prod_rows: number
  total_rows: number
  active: boolean
}
interface Cafe24User {
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

export default function AgentMappingSection() {
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

  // ── KT 자동 추천: 워커 이름 == agent_name 이고 데이터 최다 활성 ID ──
  const recommendKtFor = useCallback((workerName: string): KtAgent | null => {
    const name = (workerName || '').trim()
    if (!name) return null
    const cands = ktAgents.filter(a => (a.agent_name || '').trim() === name)
    if (cands.length === 0) return null
    // 활성 우선 → 데이터(total_rows) 최다
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

  // 한 워커에 식별자 배정 — 같은 값 쓰던 다른 워커는 화면에서도 비움 (1:1 보장)
  const assignKt = (workerId: string, ktId: string) => {
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
  }
  const assignCafe24 = (workerId: string, userId: string) => {
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
  }

  // 전체 자동 매칭 — 이름 일치 식별자 일괄 적용 (중복 시 데이터 최다 우선)
  const autoMatchAll = () => {
    // ── KT ──
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

    // ── Cafe24 (연결됐을 때만) ──
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
        ' — 이름 일치 식별자를 워커에 임시 배정했습니다. 저장 버튼으로 확정하세요.',
      at: nowLabel(),
    })
  }

  const save = async () => {
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
  }

  // ── 미매칭 집계 (draft 기준 실시간) ────────────────────────────
  const usedKtIds = new Set(Object.values(draftKt).filter(Boolean))
  const usedCafe24 = new Set(Object.values(draftCafe24).filter(Boolean))
  const unmatchedWorkersKt = workers.filter(w => !draftKt[w.id])
  const unmatchedKt = ktAgents.filter(a => !usedKtIds.has(a.kt_id))
  const unmatchedWorkersCafe24 = workers.filter(w => !draftCafe24[w.id])
  const unmatchedCafe24 = cafe24Users.filter(u => !usedCafe24.has(u.user_id))
  // 요약 색상 — KT 미매칭은 항상, Cafe24 미매칭은 연결됐을 때만 경고
  const anyUnmatched =
    unmatchedWorkersKt.length > 0 || unmatchedKt.length > 0 ||
    (cafe24Ok && (unmatchedWorkersCafe24.length > 0 || unmatchedCafe24.length > 0))

  if (loading && workers.length === 0 && ktAgents.length === 0) {
    return <div style={{ fontSize: 12, color: COLORS.textMuted }}>조회 중...</div>
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>
        콜센터 워커를 KT 상담사 ID(생산성·상담이력) 와 Cafe24 접수자(사고·긴급출동 접수 귀속) 에
        각각 연결합니다 — 한 사람당 식별자가 여러 개일 수 있어, 데이터가 많은 활성 식별자를 선택하세요.
      </div>

      <ResultPanel result={result} onClose={() => setResult(null)} />

      {/* Cafe24 미연결 안내 */}
      {!cafe24Ok && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
          fontSize: 11, color: COLORS.warning, fontWeight: 700,
        }}>
          ⚠ Cafe24 ERP 에 연결하지 못했습니다 — 접수자 매칭을 표시할 수 없습니다.
          KT 상담사 매칭은 정상 동작합니다.
        </div>
      )}

      {/* 미매칭 요약 + 전체 자동 매칭 */}
      <div style={{
        ...GLASS.L3,
        background: anyUnmatched ? COLORS.bgRed : COLORS.bgGreen,
        border: `1px solid ${anyUnmatched ? COLORS.borderRed : COLORS.borderGreen}`,
        borderRadius: 10, padding: '8px 14px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 12, fontWeight: 800,
          color: anyUnmatched ? COLORS.danger : COLORS.success,
        }}>
          {anyUnmatched ? '미매칭 항목 있음' : '모든 워커·식별자가 매칭됨'}
        </span>
        <span style={{ fontSize: 11, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
          {`KT — 워커 미매칭 ${unmatchedWorkersKt.length}명 · 미사용 ID ${unmatchedKt.length}개`}
        </span>
        <span style={{ fontSize: 11, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
          {cafe24Ok
            ? `Cafe24 — 워커 미매칭 ${unmatchedWorkersCafe24.length}명 · 미사용 접수자 ${unmatchedCafe24.length}명`
            : 'Cafe24 — 미연결'}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={autoMatchAll}
          disabled={ktAgents.length === 0 && cafe24Users.length === 0}
          style={{
            ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none',
            cursor: (ktAgents.length === 0 && cafe24Users.length === 0)
              ? 'not-allowed' : 'pointer',
            opacity: (ktAgents.length === 0 && cafe24Users.length === 0) ? 0.5 : 1,
            whiteSpace: 'nowrap',
          }}>
          ✨ 전체 자동 매칭
        </button>
      </div>

      {ktAgents.length === 0 && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
          fontSize: 11, color: COLORS.warning,
        }}>
          ⚠ KT 상담이력·생산성 데이터가 아직 없습니다 — 엑셀 업로드 후 매칭할 수 있습니다.
        </div>
      )}

      {/* 워커 목록 표 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {workers.length === 0 && (
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            활성 콜센터 워커가 없습니다.
          </div>
        )}
        {workers.map((w) => {
          const curKt = draftKt[w.id] || ''
          const curCafe = draftCafe24[w.id] || ''
          const recKt = recommendKtFor(w.name)
          const recCafe = recommendCafe24For(w.name)
          const isRecKt = !!recKt && curKt === recKt.kt_id
          const isRecCafe = !!recCafe && curCafe === recCafe.user_id
          const ktUnmatched = !curKt
          const cafeUnmatched = !curCafe
          const matchedAgent = ktAgents.find(a => a.kt_id === curKt)
          const matchedCafe = cafe24Users.find(u => u.user_id === curCafe)
          // 행 강조 — KT 미매칭 또는 (Cafe24 연결됐는데) Cafe24 미매칭
          const rowUnmatched = ktUnmatched || (cafe24Ok && cafeUnmatched)
          return (
            <div key={w.id} style={{
              ...GLASS.L1, borderRadius: 8, padding: '10px 12px',
              display: 'flex', flexDirection: 'column', gap: 8,
              border: rowUnmatched ? `1px solid ${COLORS.borderRed}` : undefined,
            }}>
              {/* ── KT 매칭 행 ── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              }}>
                {/* 워커 이름 */}
                <div style={{
                  minWidth: 130, display: 'flex', alignItems: 'center', gap: 6,
                  whiteSpace: 'nowrap',
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: ktUnmatched ? COLORS.danger : COLORS.success,
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
                    {w.name}
                  </span>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 800, color: COLORS.primary, whiteSpace: 'nowrap',
                  background: COLORS.bgBlue, border: `1px solid ${COLORS.borderBlue}`,
                  borderRadius: 6, padding: '3px 7px', width: 48, textAlign: 'center',
                }}>
                  KT
                </span>
                {/* KT ID 드롭다운 */}
                <select
                  value={curKt}
                  onChange={(e) => assignKt(w.id, e.target.value)}
                  style={{
                    ...GLASS.L1, flex: 1, minWidth: 220, boxSizing: 'border-box',
                    padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    color: curKt ? COLORS.textPrimary : COLORS.textMuted,
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}>
                  <option value="">— 매칭 해제 (KT ID 없음) —</option>
                  {ktAgents.map((a) => (
                    <option key={a.kt_id} value={a.kt_id}>
                      {`${a.agent_name || '?'}(${a.kt_id}) · 데이터 ${a.total_rows}건`}
                      {a.active ? ' · 활성' : ''}
                    </option>
                  ))}
                </select>
                {/* KT 추천 배지 / 추천 적용 버튼 */}
                {recKt && !isRecKt && (
                  <button type="button" onClick={() => assignKt(w.id, recKt.kt_id)}
                    style={{
                      ...BTN.sm, background: 'transparent', color: COLORS.primary,
                      border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}>
                    💡 추천 {recKt.kt_id}
                  </button>
                )}
                {isRecKt && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: COLORS.success,
                    background: COLORS.bgGreen, border: `1px solid ${COLORS.borderGreen}`,
                    borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap',
                  }}>
                    ✓ 추천 일치
                  </span>
                )}
                {/* KT 매칭 상태 */}
                <span style={{
                  fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', width: 88,
                  textAlign: 'right',
                  color: ktUnmatched ? COLORS.danger : COLORS.textMuted,
                }}>
                  {ktUnmatched
                    ? '미매칭'
                    : matchedAgent
                      ? `${matchedAgent.total_rows}건`
                      : 'KT 데이터 없음'}
                </span>
              </div>

              {/* ── Cafe24 매칭 행 ── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              }}>
                {/* 좌측 정렬용 빈 칸 (이름 폭 맞춤) */}
                <div style={{
                  minWidth: 130, display: 'flex', alignItems: 'center', gap: 6,
                  whiteSpace: 'nowrap',
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: !cafe24Ok
                      ? COLORS.textMuted
                      : cafeUnmatched ? COLORS.danger : COLORS.success,
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>
                    접수자
                  </span>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 800, color: COLORS.primaryDark, whiteSpace: 'nowrap',
                  background: COLORS.bgViolet, border: `1px solid ${COLORS.borderViolet}`,
                  borderRadius: 6, padding: '3px 7px', width: 48, textAlign: 'center',
                }}>
                  Cafe24
                </span>
                {/* Cafe24 사용자 드롭다운 */}
                <select
                  value={curCafe}
                  disabled={!cafe24Ok}
                  onChange={(e) => assignCafe24(w.id, e.target.value)}
                  style={{
                    ...GLASS.L1, flex: 1, minWidth: 220, boxSizing: 'border-box',
                    padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    color: curCafe ? COLORS.textPrimary : COLORS.textMuted,
                    fontFamily: 'inherit',
                    cursor: cafe24Ok ? 'pointer' : 'not-allowed',
                    opacity: cafe24Ok ? 1 : 0.5,
                  }}>
                  <option value="">— 매칭 해제 —</option>
                  {cafe24Users.map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      {`${u.name || '?'}(${u.user_id}) · 접수 ${u.intake_count}건`}
                    </option>
                  ))}
                </select>
                {/* Cafe24 추천 배지 / 추천 적용 버튼 */}
                {cafe24Ok && recCafe && !isRecCafe && (
                  <button type="button" onClick={() => assignCafe24(w.id, recCafe.user_id)}
                    style={{
                      ...BTN.sm, background: 'transparent', color: COLORS.primaryDark,
                      border: `1px solid ${COLORS.borderViolet}`, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}>
                    💡 추천 {recCafe.user_id}
                  </button>
                )}
                {cafe24Ok && isRecCafe && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: COLORS.success,
                    background: COLORS.bgGreen, border: `1px solid ${COLORS.borderGreen}`,
                    borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap',
                  }}>
                    ✓ 추천 일치
                  </span>
                )}
                {/* Cafe24 매칭 상태 */}
                <span style={{
                  fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', width: 88,
                  textAlign: 'right',
                  color: !cafe24Ok
                    ? COLORS.textMuted
                    : cafeUnmatched ? COLORS.danger : COLORS.textMuted,
                }}>
                  {!cafe24Ok
                    ? '미연결'
                    : cafeUnmatched
                      ? '미매칭'
                      : matchedCafe
                        ? `${matchedCafe.intake_count}건`
                        : '접수 데이터 없음'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* 미사용 KT ID 안내 */}
      {unmatchedKt.length > 0 && (
        <div style={{
          ...GLASS.L1, borderRadius: 8, padding: '8px 12px', marginTop: 10,
          border: `1px solid ${COLORS.borderRed}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.danger, marginBottom: 4 }}>
            어떤 워커에도 안 묶인 KT ID {unmatchedKt.length}개
          </div>
          <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.6 }}>
            {unmatchedKt
              .slice(0, 20)
              .map(a => `${a.agent_name || '?'}(${a.kt_id})·${a.total_rows}건`)
              .join('  /  ')}
            {unmatchedKt.length > 20 && `  …외 ${unmatchedKt.length - 20}개`}
          </div>
        </div>
      )}

      {/* 미사용 Cafe24 접수자 안내 */}
      {cafe24Ok && unmatchedCafe24.length > 0 && (
        <div style={{
          ...GLASS.L1, borderRadius: 8, padding: '8px 12px', marginTop: 10,
          border: `1px solid ${COLORS.borderRed}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.danger, marginBottom: 4 }}>
            어떤 워커에도 안 묶인 Cafe24 접수자 {unmatchedCafe24.length}명
          </div>
          <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.6 }}>
            {unmatchedCafe24
              .slice(0, 20)
              .map(u => `${u.name || '?'}(${u.user_id})·${u.intake_count}건`)
              .join('  /  ')}
            {unmatchedCafe24.length > 20 && `  …외 ${unmatchedCafe24.length - 20}명`}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={save} disabled={saving || workers.length === 0}
          style={{
            ...BTN.md, background: COLORS.success, color: '#fff', border: 'none',
            cursor: (saving || workers.length === 0) ? 'not-allowed' : 'pointer',
            opacity: (saving || workers.length === 0) ? 0.6 : 1,
          }}>
          {saving ? '저장 중...' : '✓ 상담원 매칭 저장'}
        </button>
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
      ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 12,
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
