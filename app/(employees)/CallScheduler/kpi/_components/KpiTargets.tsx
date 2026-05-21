'use client'
// ═══════════════════════════════════════════════════════════════════
// CX KPI — 목표 설정 — KPI-DESIGN.md §5-3
//   · 연·월 선택
//   · 팀 목표 입력 (지표별 target_value)
//   · 상담원별 목표 입력 (선택)
//   · 저장 결과 = 글래스 패널 메시지 (CLAUDE.md 규칙 20 — alert 금지)
//   데이터: GET /api/call-scheduler/kpi/targets?year=&month=
//           POST /api/call-scheduler/kpi/targets
//           GET  /api/call-scheduler/kpi/dashboard (상담원 목록 — agent 행)
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

type PeriodKind = 'daily' | 'weekly' | 'monthly'

// KpiDashboard 가 표출하는 지표와 일치 (4종)
interface MetricDef {
  key: 'call_count' | 'aht' | 'login_sec' | 'work_hours'
  label: string
  unit: string
  hint: string
  /** 입력 단위 → DB 저장 단위 (login_sec 는 분 입력 → 초 저장) */
  inToDb: (v: number) => number
  dbToIn: (v: number) => number
}
const METRICS: MetricDef[] = [
  { key: 'call_count', label: '통화량', unit: '콜', hint: '기간 내 총 통화 건수',
    inToDb: (v) => v, dbToIn: (v) => v },
  { key: 'aht', label: '평균 통화시간 (AHT)', unit: '초', hint: 'MM:SS 의 초 환산값',
    inToDb: (v) => v, dbToIn: (v) => v },
  { key: 'login_sec', label: '로그인 시간', unit: '분', hint: '기간 내 누적 로그인(분)',
    inToDb: (v) => Math.round(v * 60), dbToIn: (v) => Math.round(v / 60) },
  { key: 'work_hours', label: '근무 시간', unit: '시간', hint: '기간 내 누적 근무(h)',
    inToDb: (v) => v, dbToIn: (v) => v },
]

interface TargetRow {
  id: string
  scope: string
  worker_id: string | null
  metric: string
  period_kind: string
  target_value: number
  year: number | null
  month: number | null
}
interface AgentLite { worker_id: string | null; name: string }

// 입력 키: `${scope}|${worker_id ?? ''}|${metric}`
const inputKey = (scope: string, workerId: string | null, metric: string) =>
  `${scope}|${workerId ?? ''}|${metric}`

const pad = (n: number) => String(n).padStart(2, '0')

export default function KpiTargets() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [periodKind, setPeriodKind] = useState<PeriodKind>('monthly')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 입력값 (문자열) — key → 입력 단위 값
  const [values, setValues] = useState<Record<string, string>>({})
  const [agents, setAgents] = useState<AgentLite[]>([])
  const [showAgents, setShowAgents] = useState(false)
  // 저장 결과 글래스 패널 (규칙 20)
  const [result, setResult] = useState<
    { ok: boolean; inserted: number; updated: number; skipped: number; errors: string[]; at: string } | null
  >(null)

  // 목표 행 + 상담원 목록 로드
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const [tRes, dRes] = await Promise.all([
        fetch(`/api/call-scheduler/kpi/targets?year=${year}&month=${month}`, { headers: auth }),
        fetch(`/api/call-scheduler/kpi/dashboard?granularity=month&date=${year}-${pad(month)}-01`, { headers: auth }),
      ])
      const tJson = await tRes.json()
      if (!tRes.ok) throw new Error(tJson?.error || '목표 조회 실패')
      const targets: TargetRow[] = tJson?.data?.targets ?? []

      // 입력값 채우기 — DB 저장 단위 → 입력 단위
      const next: Record<string, string> = {}
      for (const t of targets) {
        const def = METRICS.find(m => m.key === t.metric)
        if (!def) continue
        if (t.period_kind !== periodKind) continue
        next[inputKey(t.scope, t.worker_id, t.metric)] =
          String(def.dbToIn(Number(t.target_value || 0)))
      }
      setValues(next)

      // 상담원 목록 (대시보드 agents — worker_id 있는 사람만)
      const dJson = await dRes.json()
      const ag: AgentLite[] = ((dJson?.data?.agents ?? []) as any[])
        .filter(a => a?.worker_id)
        .map(a => ({ worker_id: String(a.worker_id), name: String(a.name || '미상') }))
      setAgents(ag)
    } catch (e: any) {
      setError(e?.message || '오류')
    } finally {
      setLoading(false)
    }
  }, [year, month, periodKind])

  useEffect(() => { load() }, [load])

  const setVal = (key: string, raw: string) => {
    setValues(v => ({ ...v, [key]: raw }))
  }

  // 저장 — 입력된 모든 셀을 targets[] 로 변환 POST
  const save = async () => {
    setSaving(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const targets: any[] = []
      // 팀 목표
      for (const m of METRICS) {
        const k = inputKey('team', null, m.key)
        const raw = values[k]
        if (raw === undefined || raw === '') {
          // 빈 입력 → 0 전송 시 서버가 기존 목표 삭제
          targets.push({ scope: 'team', worker_id: null, metric: m.key,
            period_kind: periodKind, target_value: 0, year, month })
          continue
        }
        const n = Number(raw)
        targets.push({
          scope: 'team', worker_id: null, metric: m.key, period_kind: periodKind,
          target_value: Number.isFinite(n) && n > 0 ? m.inToDb(n) : 0,
          year, month,
        })
      }
      // 상담원 목표 (입력된 셀만)
      for (const a of agents) {
        for (const m of METRICS) {
          const k = inputKey('agent', a.worker_id, m.key)
          const raw = values[k]
          if (raw === undefined || raw === '') continue
          const n = Number(raw)
          targets.push({
            scope: 'agent', worker_id: a.worker_id, metric: m.key,
            period_kind: periodKind,
            target_value: Number.isFinite(n) && n > 0 ? m.inToDb(n) : 0,
            year, month,
          })
        }
      }

      const res = await fetch('/api/call-scheduler/kpi/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ targets }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      const d = json.data || {}
      setResult({
        ok: true,
        inserted: Number(d.inserted || 0),
        updated: Number(d.updated || 0),
        skipped: Number(d.skipped || 0),
        errors: Array.isArray(d.errors) ? d.errors : [],
        at: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      })
      await load()
    } catch (e: any) {
      setResult({
        ok: false, inserted: 0, updated: 0, skipped: 0,
        errors: [e?.message || '오류'],
        at: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      })
    } finally {
      setSaving(false)
    }
  }

  const PERIOD_LABEL: Record<PeriodKind, string> = { daily: '일', weekly: '주', monthly: '월' }

  return (
    <div>
      {/* ── 연·월 + 기간 종류 ─────────────────────────────────── */}
      <div style={{
        ...GLASS.L1, borderRadius: 10, padding: '10px 14px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}
          style={selStyle}>
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
          style={selStyle}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{m}월</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['daily', 'weekly', 'monthly'] as PeriodKind[]).map((p) => {
            const active = p === periodKind
            return (
              <button key={p} type="button" onClick={() => setPeriodKind(p)}
                style={{
                  padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 13, fontWeight: 700,
                  background: active ? COLORS.primary : 'transparent',
                  color: active ? '#fff' : COLORS.textSecondary,
                  border: `1px solid ${active ? COLORS.primary : COLORS.borderFaint}`,
                }}>
                {PERIOD_LABEL[p]} 단위
              </button>
            )
          })}
        </div>
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>
          {year}년 {month}월 · {PERIOD_LABEL[periodKind]} 단위 목표
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={load} disabled={loading}
          style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: COLORS.bgGray, border: `1px solid ${COLORS.borderFaint}`,
            color: COLORS.textSecondary, cursor: loading ? 'not-allowed' : 'pointer',
          }}>
          {loading ? '조회 중...' : '↻ 새로고침'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger, fontSize: 12,
        }}>❌ {error}</div>
      )}

      {/* ── 저장 결과 글래스 패널 (규칙 20) ───────────────────── */}
      {result && (
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
              {result.ok ? '🎯 목표 저장 완료' : '❌ 목표 저장 실패'}
              <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginLeft: 6 }}>
                {result.at}
              </span>
            </span>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={() => setResult(null)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 13, color: COLORS.textMuted, fontWeight: 700,
              }}>× 닫기</button>
          </div>
          {result.ok && (
            <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 6 }}>
              신규 {result.inserted}건 · 갱신 {result.updated}건
              {result.skipped > 0 && ` · 비움/제외 ${result.skipped}건`}
            </div>
          )}
          {result.errors.length > 0 && (
            <div style={{ fontSize: 11, color: COLORS.danger, marginTop: 6 }}>
              {result.errors.slice(0, 6).join(' / ')}
              {result.errors.length > 6 ? ` 외 ${result.errors.length - 6}건` : ''}
            </div>
          )}
          {result.ok && (
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6 }}>
              📌 「📊 KPI 대시보드」 탭에서 목표 대비 달성률을 확인하세요.
            </div>
          )}
        </div>
      )}

      {/* ── 팀 목표 ───────────────────────────────────────────── */}
      <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 4 }}>
          🏢 팀 목표
        </div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10 }}>
          CX 팀 전체 합산 기준 목표치 — 빈칸으로 저장하면 해당 목표가 제거됩니다.
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10,
        }}>
          {METRICS.map((m) => (
            <TargetField key={m.key}
              label={m.label} unit={m.unit} hint={m.hint}
              value={values[inputKey('team', null, m.key)] ?? ''}
              onChange={(v) => setVal(inputKey('team', null, m.key), v)} />
          ))}
        </div>
      </div>

      {/* ── 상담원별 목표 (선택) ──────────────────────────────── */}
      <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
            👥 상담원별 목표 <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}>(선택)</span>
          </span>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={() => setShowAgents(o => !o)}
            disabled={agents.length === 0}
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              cursor: agents.length === 0 ? 'not-allowed' : 'pointer',
              background: showAgents ? COLORS.bgBlue : COLORS.bgGray,
              color: showAgents ? COLORS.primary : COLORS.textSecondary,
              border: `1px solid ${showAgents ? COLORS.borderBlue : COLORS.borderFaint}`,
            }}>
            {showAgents ? '접기' : `펼치기 (${agents.length}명)`}
          </button>
        </div>
        {agents.length === 0 && (
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8 }}>
            {year}년 {month}월에 집계된 상담원이 없습니다. KT 엑셀을 먼저 업로드하세요.
          </div>
        )}
        {showAgents && agents.length > 0 && (
          <div style={{ marginTop: 10, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: 120 }}>상담원</th>
                  {METRICS.map((m) => (
                    <th key={m.key} style={thStyle}>
                      {m.label}<span style={{ color: COLORS.textDim }}> ({m.unit})</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.worker_id} style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                    <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700, color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>
                      {a.name}
                    </td>
                    {METRICS.map((m) => {
                      const k = inputKey('agent', a.worker_id, m.key)
                      return (
                        <td key={m.key} style={tdStyle}>
                          <input type="number" min={0}
                            value={values[k] ?? ''}
                            placeholder="—"
                            onChange={(e) => setVal(k, e.target.value)}
                            style={{
                              ...GLASS.L1, width: 84, boxSizing: 'border-box',
                              padding: '5px 8px', borderRadius: 6, fontSize: 12,
                              fontWeight: 700, color: COLORS.textPrimary,
                              fontFamily: 'inherit', textAlign: 'right',
                            }} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 저장 버튼 ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button type="button" onClick={save} disabled={saving || loading}
          style={{
            ...BTN.lg, background: COLORS.success, color: '#fff', border: 'none',
            cursor: saving || loading ? 'not-allowed' : 'pointer',
            opacity: saving || loading ? 0.6 : 1,
          }}>
          {saving ? '저장 중...' : '🎯 목표 저장'}
        </button>
      </div>
    </div>
  )
}

const selStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
  border: `1px solid ${COLORS.borderFaint}`, color: COLORS.textPrimary,
  background: '#fff', fontFamily: 'inherit', cursor: 'pointer',
}
const thStyle: React.CSSProperties = {
  padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap',
  color: COLORS.textMuted, fontWeight: 700, fontSize: 11,
}
const tdStyle: React.CSSProperties = {
  padding: '6px 8px', textAlign: 'center', fontSize: 12, color: COLORS.textPrimary,
}

// ── 팀 목표 입력 필드 ──────────────────────────────────────────
function TargetField({ label, unit, hint, value, onChange }: {
  label: string; unit: string; hint: string
  value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="number" min={0} value={value} placeholder="—"
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...GLASS.L1, flex: 1, minWidth: 0, boxSizing: 'border-box',
            padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            color: COLORS.textPrimary, fontFamily: 'inherit', textAlign: 'right',
          }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
          {unit}
        </span>
      </div>
      <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>{hint}</div>
    </div>
  )
}
