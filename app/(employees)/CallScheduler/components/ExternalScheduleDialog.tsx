'use client'
// ═══════════════════════════════════════════════════════════════════
// ExternalScheduleDialog — 외부 직원 일정 엑셀 업로드 (PR-2QQ-b)
// 1) 템플릿 다운로드
// 2) 채워서 업로드 → preview 확인
// 3) 적용 → manual_lock=1 INSERT (자동 생성이 보존)
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

interface Props {
  open: boolean
  onClose: () => void
  scheduleId: string
  onApplied: () => void
}

interface UploadRow {
  worker_name: string
  work_date: string
  slot_code: string
  note?: string
}

interface PlanItem {
  worker_name: string
  work_date: string
  slot_code: string
  action: 'insert' | 'update' | 'error'
  error?: string
  is_external?: boolean
}

interface Summary {
  total: number
  valid: number
  errors: number
  external_workers?: string[]
  applied_insert?: number
  applied_update?: number
  mode: 'preview' | 'apply'
}

export default function ExternalScheduleDialog({ open, onClose, scheduleId, onApplied }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<UploadRow[]>([])
  const [fileName, setFileName] = useState<string>('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [plans, setPlans] = useState<PlanItem[]>([])
  const [applied, setApplied] = useState(false)

  if (!open) return null

  const close = () => {
    setRows([]); setFileName(''); setSummary(null); setPlans([]); setError(null); setApplied(false)
    onClose()
  }

  const downloadTemplate = async () => {
    const auth = await getAuthHeader()
    const res = await fetch(`/api/call-scheduler/schedules/${scheduleId}/external-schedule`, {
      headers: auth,
    })
    if (!res.ok) {
      setError('템플릿 다운로드 실패')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `external-schedule-template.xlsx`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  const handleFile = async (file: File) => {
    setError(null); setSummary(null); setPlans([]); setApplied(false)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets['외부일정'] || wb.Sheets[wb.SheetNames[0]]
      if (!ws) { setError('"외부일정" 시트가 없습니다'); return }
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false })
      // 1행 헤더 건너뜀
      const dataRows = aoa.slice(1)
      const parsed: UploadRow[] = []
      for (const r of dataRows) {
        if (!r || r.length === 0) continue
        const [workerName, workDate, slotCode, note] = r
        if (!workerName && !workDate && !slotCode) continue  // 빈 행
        parsed.push({
          worker_name: String(workerName || '').trim(),
          work_date: normalizeDate(workDate),
          slot_code: String(slotCode || '').trim(),
          note: note ? String(note) : undefined,
        })
      }
      setRows(parsed)
      setFileName(file.name)
      // 자동 preview
      await runMode('preview', parsed)
    } catch (e: any) {
      setError(e?.message || '파일 파싱 실패')
    }
  }

  const runMode = async (mode: 'preview' | 'apply', useRows?: UploadRow[]) => {
    setBusy(true); setError(null)
    if (mode === 'preview') setApplied(false)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/schedules/${scheduleId}/external-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ mode, rows: useRows || rows }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실행 실패')
      setSummary(json.data.summary)
      setPlans(json.data.plans || [])
      if (mode === 'apply') {
        setApplied(true)
        onApplied()
      }
    } catch (e: any) {
      setError(e?.message || '오류')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div onClick={close}
         style={{
           position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
           display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
         }}>
      <div onClick={(e) => e.stopPropagation()}
           style={{
             ...GLASS.L4, width: 720, maxWidth: '94vw', maxHeight: '90vh',
             borderRadius: 16, padding: 22, overflowY: 'auto',
             display: 'flex', flexDirection: 'column', gap: 14,
           }}>
        {/* 헤더 */}
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
            🔒 외부 직원 일정 업로드
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
            엑셀로 외부 직원 일정 일괄 등록 — manual_lock=1 으로 자동 생성이 보존합니다.
          </div>
        </div>

        {/* 1단계 — 템플릿 다운로드 */}
        <div style={{
          ...GLASS.L1, borderRadius: 8, padding: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
              1️⃣ 템플릿 다운로드
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
              워커명 / 날짜 / 슬롯코드 / 비고 — 4 컬럼
            </div>
          </div>
          <button type="button" onClick={downloadTemplate}
                  style={{
                    ...BTN.sm, background: 'transparent', color: COLORS.info,
                    border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer',
                  }}>
            📥 템플릿
          </button>
        </div>

        {/* 2단계 — 파일 선택 */}
        <div style={{
          ...GLASS.L1, borderRadius: 8, padding: 12,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 6 }}>
            2️⃣ 채운 엑셀 업로드
          </div>
          <input type="file" accept=".xlsx,.xls"
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                 style={{ fontSize: 12 }} />
          {fileName && (
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
              📄 {fileName} — {rows.length}행
            </div>
          )}
        </div>

        {/* 3단계 — 결과 */}
        {summary && (
          <div style={{
            ...GLASS.L3,
            background: applied ? COLORS.bgGreen : COLORS.bgBlue,
            border: `1px solid ${applied ? COLORS.borderGreen : COLORS.borderBlue}`,
            borderRadius: 12, padding: 14,
          }}>
            <div style={{
              fontSize: 13, fontWeight: 800, marginBottom: 10,
              color: applied ? COLORS.success : COLORS.info,
            }}>
              {applied ? '✅ 적용 완료' : '🔍 미리보기'}
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10,
            }}>
              <Tile label="전체" value={summary.total} tone="neutral" />
              <Tile label="정상" value={summary.valid} tone="success" />
              <Tile label="오류" value={summary.errors} tone={summary.errors > 0 ? 'danger' : 'neutral'} />
            </div>
            {summary.external_workers && summary.external_workers.length > 0 && (
              <div style={{ fontSize: 11, color: COLORS.textSecondary, marginBottom: 6 }}>
                외부 직원: {summary.external_workers.join(', ')}
              </div>
            )}
            {applied && summary.applied_insert !== undefined && (
              <div style={{ fontSize: 11, color: COLORS.success, fontWeight: 700 }}>
                신규 {summary.applied_insert}건 / 갱신 {summary.applied_update}건 적용
              </div>
            )}
          </div>
        )}

        {/* 오류 행 상세 */}
        {plans.length > 0 && summary && summary.errors > 0 && (
          <div style={{
            ...GLASS.L1, borderRadius: 8, padding: 12, maxHeight: 200, overflowY: 'auto',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.danger, marginBottom: 6 }}>
              오류 행 ({summary.errors}건)
            </div>
            {plans.filter(p => p.action === 'error').slice(0, 20).map((p, i) => (
              <div key={i} style={{
                fontSize: 11, padding: '3px 0',
                borderBottom: `1px solid ${COLORS.borderFaint}`,
              }}>
                <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>
                  {p.worker_name || '(이름 없음)'} · {p.work_date} · {p.slot_code}
                </span>
                <span style={{ color: COLORS.danger, marginLeft: 8 }}>
                  → {p.error}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            color: COLORS.danger, fontSize: 13,
          }}>❌ {error}</div>
        )}

        {/* 액션 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button type="button" onClick={close} disabled={busy} style={{
            ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
            border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
          }}>
            {applied ? '닫기' : '취소'}
          </button>
          {summary && summary.valid > 0 && !applied && (
            <button type="button" onClick={() => runMode('apply')} disabled={busy} style={{
              ...BTN.lg, background: COLORS.success, color: '#fff',
              border: 'none', cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}>
              {busy ? '적용 중...' : `🔒 ${summary.valid}건 적용 (lock)`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, tone }: {
  label: string; value: number; tone: 'success' | 'info' | 'danger' | 'neutral'
}) {
  const map = {
    success: { bg: COLORS.bgGreen, color: COLORS.success },
    info:    { bg: COLORS.bgBlue,  color: COLORS.info },
    danger:  { bg: COLORS.bgRed,   color: COLORS.danger },
    neutral: { bg: COLORS.bgGray,  color: COLORS.textSecondary },
  }[tone]
  return (
    <div style={{
      background: map.bg, borderRadius: 8, padding: '8px 10px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, color: COLORS.textSecondary, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: map.color, lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}

// 엑셀에서 날짜가 숫자(serial)로 들어올 수 있어 정규화
function normalizeDate(v: any): string {
  if (!v) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') {
    // Excel serial date (1900 epoch)
    const d = new Date((v - 25569) * 86400 * 1000)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  return String(v)
}
