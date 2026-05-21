'use client'
// ═══════════════════════════════════════════════════════════════════
// /CallScheduler/kpi — CX KPI (KPI-DESIGN.md §5)
//   · 대시보드 탭: 통합 KPI (통화·생산성·근무) — KPI-DESIGN.md §5-2
//   · 필요인원 탭: WFM Erlang C 산정 (시간대별 필요 vs 배정) — KPI-DESIGN.md §5-4
//   · 업로드 탭: KT 엑셀 업로드 (상담이력 / 생산성)
//   · 상담이력조회  → cs_call_records      (INSERT IGNORE)
//   · 생산성(상담사) → cs_agent_productivity (ON DUPLICATE UPDATE)
//   클라이언트 xlsx 파싱 → {mode:'preview'|'apply', rows} POST 패턴
//   (leaves/bulk-upload 패턴 재사용)
//   물량예측은 후속 단계 (KPI-DESIGN.md §5-5).
// ═══════════════════════════════════════════════════════════════════
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import KpiDashboard from './_components/KpiDashboard'
import KpiStaffing from './_components/KpiStaffing'

export const dynamic = 'force-dynamic'

type FileKind = 'call-records' | 'productivity'

const KIND_META: Record<FileKind, {
  label: string
  emoji: string
  uploadApi: string
  desc: string
}> = {
  'call-records': {
    label: '상담이력조회',
    emoji: '📞',
    uploadApi: '/api/call-scheduler/kpi/upload-call-records',
    desc: 'KT 포털 상담이력조회 엑셀 — 통화 1건 = 1행',
  },
  'productivity': {
    label: '생산성(상담사)',
    emoji: '📊',
    uploadApi: '/api/call-scheduler/kpi/upload-productivity',
    desc: 'KT 포털 생산성(상담사) 엑셀 — 상담원 × 기간 종합 실적',
  },
}

interface CallSummary {
  total: number; usable: number; empty: number
  duplicate: number; newRows: number
  matched: number; unmatched: number; unmatchedAgents: string[]
  periodFrom: string | null; periodTo: string | null
}
interface ProdSummary {
  total: number; usable: number; empty: number; ok: number; error: number
  active: number; inactive: number
  matched: number; unmatched: number; unmatchedAgents: string[]
  periods: string[]
}

interface PreviewResult {
  mode: string
  summary: any
  plan?: any[]
  inserted?: number
  skipped?: number
}

type KpiTab = 'dashboard' | 'staffing' | 'upload'

export default function KpiPage() {
  const [tab, setTab] = useState<KpiTab>('dashboard')
  const [kind, setKind] = useState<FileKind>('call-records')
  const [busy, setBusy] = useState(false)
  const [parsedRows, setParsedRows] = useState<any[]>([])
  const [fileName, setFileName] = useState<string>('')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const meta = KIND_META[kind]

  // 파일 종류 변경 — 진행 상태 리셋
  const switchKind = (k: FileKind) => {
    if (k === kind) return
    setKind(k)
    resetState()
  }
  const resetState = () => {
    setParsedRows([]); setFileName(''); setPreview(null)
    setApplied(false); setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // 양식 다운로드
  const downloadTemplate = async () => {
    setBusy(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/kpi/template?kind=${kind}`, { headers: auth })
      if (!res.ok) throw new Error('양식 다운로드 실패')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cs_kpi_${kind}_template_${new Date().toISOString().substring(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setBusy(false) }
  }

  // 파일 선택 → 클라이언트 파싱 → preview
  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError(null); setApplied(false); setPreview(null)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) throw new Error('시트를 찾을 수 없습니다.')
      // 0번 행을 헤더로 → object 배열 (서버가 헤더명으로 컬럼 인식)
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
      if (rows.length === 0) throw new Error('빈 시트 또는 데이터 없음')
      setParsedRows(rows)
      setFileName(file.name)
      await runPreview(rows)
    } catch (e: any) {
      setError(e?.message || '파일 읽기 실패')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const runPreview = async (rowsToCheck = parsedRows) => {
    if (rowsToCheck.length === 0) return
    setBusy(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(meta.uploadApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ mode: 'preview', rows: rowsToCheck }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '검증 실패')
      setPreview(json.data)
    } catch (e: any) {
      setError(e?.message || '오류')
    } finally { setBusy(false) }
  }

  const apply = async () => {
    if (!preview || parsedRows.length === 0) return
    setBusy(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(meta.uploadApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ mode: 'apply', rows: parsedRows }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '적용 실패')
      setPreview(json.data)
      setApplied(true)
    } catch (e: any) {
      setError(e?.message || '오류')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ padding: '16px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* PageTitle 자동 헤더 — 자체 헤더 없음 */}

      {/* ── 탭 (대시보드 / 업로드) ──────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {([
          { k: 'dashboard' as KpiTab, label: '📊 KPI 대시보드' },
          { k: 'staffing' as KpiTab, label: '🧮 필요인원 (WFM)' },
          { k: 'upload' as KpiTab, label: '📤 KT 엑셀 업로드' },
        ]).map(({ k, label }) => {
          const active = k === tab
          return (
            <button key={k} type="button" onClick={() => setTab(k)}
              style={{
                padding: '8px 18px', borderRadius: 10, cursor: 'pointer',
                fontSize: 13, fontWeight: 800,
                background: active ? COLORS.primary : 'transparent',
                color: active ? '#fff' : COLORS.textSecondary,
                border: `1px solid ${active ? COLORS.primary : COLORS.borderFaint}`,
              }}>
              {label}
            </button>
          )
        })}
      </div>

      {tab === 'dashboard' && <KpiDashboard />}

      {tab === 'staffing' && <KpiStaffing />}

      {tab === 'upload' && (
       <>
      {/* ── 파일 종류 선택 ──────────────────────────────────── */}
      <div style={{
        ...GLASS.L4, borderRadius: 12, padding: 16, marginBottom: 14,
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 10 }}>
          ① 업로드할 KT 엑셀 종류 선택
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(Object.keys(KIND_META) as FileKind[]).map((k) => {
            const m = KIND_META[k]
            const active = k === kind
            return (
              <button
                key={k}
                type="button"
                onClick={() => switchKind(k)}
                style={{
                  flex: '1 1 240px', textAlign: 'left',
                  padding: '12px 14px', borderRadius: 10,
                  cursor: 'pointer',
                  background: active ? COLORS.bgBlue : COLORS.bgGray,
                  border: `1px solid ${active ? COLORS.borderBlue : COLORS.borderFaint}`,
                  boxShadow: active ? '0 2px 8px rgba(37,99,235,0.18)' : 'none',
                }}
              >
                <div style={{
                  fontSize: 14, fontWeight: 800,
                  color: active ? COLORS.primary : COLORS.textSecondary,
                }}>
                  {m.emoji} {m.label}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 3 }}>
                  {m.desc}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 양식 다운로드 ───────────────────────────────────── */}
      <div style={{
        ...GLASS.L1, borderRadius: 8, padding: 12, marginBottom: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
            ② 업로드 양식 안내 (선택)
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
            KT 포털에서 받은 원본을 그대로 업로드하면 됩니다. 인식되는 컬럼 안내용 양식입니다.
          </div>
        </div>
        <button onClick={downloadTemplate} disabled={busy}
          style={{
            ...BTN.md, background: COLORS.bgGreen, color: COLORS.success,
            border: `1px solid ${COLORS.borderGreen}`,
            cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
          }}>
          📥 양식 다운로드
        </button>
      </div>

      {/* ── 파일 업로드 ─────────────────────────────────────── */}
      <div style={{
        ...GLASS.L1, borderRadius: 8, padding: 12, marginBottom: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
            ③ {meta.emoji} {meta.label} 엑셀 업로드
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
            {fileName
              ? <span>선택됨: <b style={{ color: COLORS.textSecondary }}>{fileName}</b></span>
              : '.xlsx / .xls — 첫 시트 자동 인식'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {parsedRows.length > 0 && (
            <button onClick={resetState} disabled={busy}
              style={{
                ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
              }}>
              초기화
            </button>
          )}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
            onChange={onFileSelected} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={busy}
            style={{
              ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
              opacity: busy ? 0.6 : 1,
            }}>
            {busy ? '처리 중...' : '📤 파일 선택'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger, fontSize: 12,
        }}>❌ {error}</div>
      )}

      {/* ── 미리보기 결과 ───────────────────────────────────── */}
      {preview && (
        kind === 'call-records'
          ? <CallPreview preview={preview} applied={applied} />
          : <ProdPreview preview={preview} applied={applied} />
      )}

      {/* ── 적용 버튼 ───────────────────────────────────────── */}
      {preview && !applied && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={apply} disabled={busy}
            style={{
              ...BTN.lg, background: COLORS.success, color: '#fff', border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
            }}>
            {busy ? '적용 중...' : '✓ DB 적용'}
          </button>
        </div>
      )}

      {/* 후속 단계 안내 */}
      <div style={{
        marginTop: 20, padding: 12, borderRadius: 8,
        background: COLORS.bgGray, border: `1px solid ${COLORS.borderFaint}`,
        fontSize: 11, color: COLORS.textMuted,
      }}>
        ℹ 적재한 상담이력으로 「필요인원(WFM)」 탭에서 Erlang C 산정이 가능합니다.
        물량 예측은 후속 단계에서 추가됩니다. (KPI-DESIGN.md §5-5)
      </div>
       </>
      )}
    </div>
  )
}

// ── 상담이력 미리보기 ─────────────────────────────────────────
function CallPreview({ preview, applied }: { preview: PreviewResult; applied: boolean }) {
  const s = preview.summary as CallSummary
  return (
    <div>
      <ResultBanner applied={applied}
        appliedText={`✅ 적용 완료 — ${preview.inserted ?? 0}건 INSERT (중복 ${preview.skipped ?? 0}건 제외)`}
        previewText="🔍 검증 결과" />
      <div style={{
        ...GLASS.L4, borderRadius: 12, padding: 12, marginTop: 10,
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8,
      }}>
        <Stat label="전체 행" value={s.total} tone="neutral" />
        <Stat label="유효 행" value={s.usable} tone="info" />
        <Stat label="신규" value={s.newRows} tone="success" />
        <Stat label="중복(제외)" value={s.duplicate} tone={s.duplicate > 0 ? 'warning' : 'neutral'} />
        <Stat label="콜키 빈 행" value={s.empty} tone="neutral" />
        <Stat label="상담원 매칭" value={s.matched} tone="success" />
        <Stat label="미매칭" value={s.unmatched} tone={s.unmatched > 0 ? 'danger' : 'neutral'} />
      </div>
      <PeriodLine from={s.periodFrom} to={s.periodTo} />
      <UnmatchedLine agents={s.unmatchedAgents} />
    </div>
  )
}

// ── 생산성 미리보기 ───────────────────────────────────────────
function ProdPreview({ preview, applied }: { preview: PreviewResult; applied: boolean }) {
  const s = preview.summary as ProdSummary
  return (
    <div>
      <ResultBanner applied={applied}
        appliedText={`✅ 적용 완료 — ${preview.inserted ?? 0}건 저장 (재업로드 시 덮어쓰기)`}
        previewText="🔍 검증 결과"
        hasError={s.error > 0} />
      <div style={{
        ...GLASS.L4, borderRadius: 12, padding: 12, marginTop: 10,
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8,
      }}>
        <Stat label="전체 행" value={s.total} tone="neutral" />
        <Stat label="유효 행" value={s.ok} tone="info" />
        <Stat label="오류 행" value={s.error} tone={s.error > 0 ? 'danger' : 'neutral'} />
        <Stat label="활성 계정" value={s.active} tone="success" />
        <Stat label="비활성(저장됨)" value={s.inactive} tone="neutral" />
        <Stat label="상담원 매칭" value={s.matched} tone="success" />
        <Stat label="미매칭" value={s.unmatched} tone={s.unmatched > 0 ? 'danger' : 'neutral'} />
      </div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8 }}>
        📅 기간: {s.periods.length > 0 ? s.periods.join(', ') : '—'}
      </div>
      <UnmatchedLine agents={s.unmatchedAgents} />
      {s.error > 0 && preview.plan && (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 8, marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                <th style={th}>#</th><th style={th}>상담원</th><th style={th}>오류</th>
              </tr>
            </thead>
            <tbody>
              {preview.plan.filter((p: any) => p.status === 'error').slice(0, 50).map((p: any) => (
                <tr key={p.index} style={{ borderBottom: `1px solid ${COLORS.borderFaint}`, background: COLORS.bgRed }}>
                  <td style={td}>{p.index}</td>
                  <td style={td}>{p.agent_name || '·'}{p.agent_kt_id ? ` (${p.agent_kt_id})` : ''}</td>
                  <td style={td}>{(p.errors || []).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ResultBanner({ applied, appliedText, previewText, hasError }: {
  applied: boolean; appliedText: string; previewText: string; hasError?: boolean
}) {
  const tone = applied ? 'success' : hasError ? 'warning' : 'info'
  const map = {
    success: { bg: COLORS.bgGreen, border: COLORS.borderGreen, color: COLORS.success },
    warning: { bg: COLORS.bgAmber, border: COLORS.borderAmber, color: COLORS.warning },
    info:    { bg: COLORS.bgBlue,  border: COLORS.borderBlue,  color: COLORS.info },
  }[tone]
  return (
    <div style={{
      background: map.bg, border: `1px solid ${map.border}`,
      borderRadius: 10, padding: '10px 14px',
      fontSize: 13, fontWeight: 800, color: map.color,
    }}>
      {applied ? appliedText : hasError ? `⚠ ${previewText} — 일부 오류` : previewText}
    </div>
  )
}

function PeriodLine({ from, to }: { from: string | null; to: string | null }) {
  return (
    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8 }}>
      📅 기간: {from && to ? (from === to ? from : `${from} ~ ${to}`) : '—'}
    </div>
  )
}

function UnmatchedLine({ agents }: { agents: string[] }) {
  if (!agents || agents.length === 0) return null
  return (
    <div style={{
      marginTop: 8, padding: '8px 12px', borderRadius: 8,
      background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
      fontSize: 11, color: COLORS.warning,
    }}>
      ⚠ 미매칭 상담원 {agents.length}명 (행은 저장되나 직원 연결 안 됨):{' '}
      {agents.slice(0, 12).join(', ')}{agents.length > 12 ? ` 외 ${agents.length - 12}명` : ''}
      <div style={{ color: COLORS.textMuted, marginTop: 3 }}>
        → 설정 &gt; 워커 에서 KT ID 를 등록하면 다음 업로드부터 자동 매칭됩니다.
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: {
  label: string; value: number
  tone: 'success' | 'danger' | 'warning' | 'info' | 'neutral'
}) {
  const tintMap = {
    success: { bg: COLORS.bgGreen, color: COLORS.success },
    danger:  { bg: COLORS.bgRed,   color: COLORS.danger },
    warning: { bg: COLORS.bgAmber, color: COLORS.warning },
    info:    { bg: COLORS.bgBlue,  color: COLORS.info },
    neutral: { bg: COLORS.bgGray, color: COLORS.textPrimary },
  }[tone]
  return (
    <div style={{ background: tintMap.bg, borderRadius: 8, padding: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: COLORS.textSecondary, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: tintMap.color, lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '4px 6px', textAlign: 'left',
  color: COLORS.textMuted, fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '4px 6px', fontSize: 11, color: COLORS.textPrimary,
}
