'use client'
// ═══════════════════════════════════════════════════════════════════
// LeaveBulkUploadDialog — 휴가 엑셀 일괄 업로드
//   1. [📥 샘플 다운로드] — 빈 .xlsx 받기
//   2. 매니저가 채워서 업로드
//   3. 클라이언트 xlsx 파싱 → 서버 검증 (preview)
//   4. 결과 확인 후 [✓ 적용]
// ═══════════════════════════════════════════════════════════════════
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

interface Props {
  open: boolean
  onClose: () => void
  onCompleted: () => void
}

interface PlanRow {
  index: number
  raw: any
  status: 'ok' | 'skip-empty' | 'error'
  errors: string[]
  parsed?: {
    worker_id: string
    worker_name: string
    leave_type: string
    start_date: string
    end_date: string
    am_pm: 'full' | 'am' | 'pm'
    reason: string | null
  }
}

interface PreviewResult {
  mode: string
  summary: { total: number; ok: number; empty: number; error: number }
  plan: PlanRow[]
  inserted?: number
}

const TYPE_LABEL: Record<string, string> = {
  annual: '연차', familyday: '패밀리데이', sick: '병가',
  unpaid: '무급', family: '경조', holiday: '공휴일', other: '기타',
}

export default function LeaveBulkUploadDialog({ open, onClose, onCompleted }: Props) {
  const [busy, setBusy] = useState(false)
  const [parsedRows, setParsedRows] = useState<any[]>([])
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const downloadTemplate = async () => {
    setBusy(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/leaves/template', { headers: auth })
      if (!res.ok) throw new Error('샘플 다운로드 실패')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cs_leaves_template_${new Date().toISOString().substring(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setBusy(false) }
  }

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError(null); setApplied(false)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
      // 첫 시트
      const sheetName = wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      // header: 1 = 첫 row 가 헤더
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' })
      if (rows.length < 2) {
        setError('빈 시트 또는 데이터 없음')
        setBusy(false); return
      }
      // 첫 row 헤더 → 컬럼 인덱스 매핑
      const header = rows[0].map((h: any) => String(h || '').trim())
      const idxName = header.findIndex(h => /이름/.test(h))
      const idxStart = header.findIndex(h => /시작/.test(h))
      const idxEnd = header.findIndex(h => /종료/.test(h))
      const idxType = header.findIndex(h => /종류/.test(h))
      const idxAmPm = header.findIndex(h => /시간단위|반차/.test(h))
      const idxHours = header.findIndex(h => /^시간$/.test(h) || /custom.*시간|hours/.test(h))
      const idxReason = header.findIndex(h => /사유|메모/.test(h))

      const dataRows: any[] = []
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]
        if (!r) continue
        dataRows.push({
          name: idxName >= 0 ? String(r[idxName] || '').trim() : '',
          start_date: idxStart >= 0 ? String(r[idxStart] || '').trim() : '',
          end_date: idxEnd >= 0 ? String(r[idxEnd] || '').trim() : '',
          type: idxType >= 0 ? String(r[idxType] || '').trim() : '',
          am_pm: idxAmPm >= 0 ? String(r[idxAmPm] || 'full').trim() : 'full',
          hours: idxHours >= 0 ? r[idxHours] : undefined,
          reason: idxReason >= 0 ? String(r[idxReason] || '').trim() : '',
        })
      }
      setParsedRows(dataRows)
      // 자동으로 preview 호출
      await runValidate(dataRows)
    } catch (e: any) {
      setError(e?.message || '파일 읽기 실패')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const runValidate = async (rowsToCheck = parsedRows) => {
    if (rowsToCheck.length === 0) return
    setBusy(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/leaves/bulk-upload', {
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
    if (!preview || preview.summary.ok === 0) return
    setBusy(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/leaves/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ mode: 'apply', rows: parsedRows }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '적용 실패')
      setPreview(json.data)
      setApplied(true)
      onCompleted()
    } catch (e: any) {
      setError(e?.message || '오류')
    } finally { setBusy(false) }
  }

  const close = () => {
    setParsedRows([]); setPreview(null); setApplied(false); setError(null)
    onClose()
  }

  return (
    <div onClick={close} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...GLASS.L4, width: 800, maxWidth: '94vw', maxHeight: '90vh',
        borderRadius: 16, padding: 22, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
            📤 휴가 일괄 업로드
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
            샘플 .xlsx 다운로드 → 채워서 업로드 → 검증 후 일괄 적용
          </div>
        </div>

        {/* Step 1 — 샘플 다운로드 */}
        <div style={{
          ...GLASS.L1, borderRadius: 8, padding: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
              ① 샘플 엑셀 받기
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
              현재 활성 워커 16명 + 컬럼 안내가 미리 채워져 있습니다.
            </div>
          </div>
          <button onClick={downloadTemplate} disabled={busy}
                  style={{
                    ...BTN.md, background: COLORS.bgGreen, color: COLORS.success,
                    border: `1px solid ${COLORS.borderGreen}`, cursor: busy ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}>
            📥 샘플 다운로드
          </button>
        </div>

        {/* Step 2 — 업로드 */}
        <div style={{
          ...GLASS.L1, borderRadius: 8, padding: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
              ② 채운 엑셀 업로드
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
              .xlsx / .xls 파일. 첫 시트 자동 인식.
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
                 onChange={onFileSelected} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={busy}
                  style={{
                    ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
                    cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                  }}>
            📤 파일 선택
          </button>
        </div>

        {/* Step 3 — 검증 결과 */}
        {preview && (
          <div style={{
            ...GLASS.L3,
            background: applied ? COLORS.bgGreen
              : preview.summary.error > 0 ? COLORS.bgAmber
              : COLORS.bgBlue,
            border: `1px solid ${applied ? COLORS.borderGreen
              : preview.summary.error > 0 ? COLORS.borderAmber
              : COLORS.borderBlue}`,
            borderRadius: 12, padding: 12,
          }}>
            <div style={{
              fontSize: 13, fontWeight: 800, marginBottom: 8,
              color: applied ? COLORS.success
                : preview.summary.error > 0 ? COLORS.warning
                : COLORS.info,
            }}>
              {applied ? `✅ 적용 완료 — ${preview.inserted}건 INSERT`
                : preview.summary.error > 0 ? `⚠ 일부 오류 발견`
                : '🔍 검증 결과'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              <Stat label="전체" value={preview.summary.total} tone="neutral" />
              <Stat label="✓ 정상" value={preview.summary.ok} tone="success" />
              <Stat label="⚠ 오류" value={preview.summary.error} tone={preview.summary.error > 0 ? 'danger' : 'neutral'} />
              <Stat label="○ 빈 행" value={preview.summary.empty} tone="neutral" />
            </div>
          </div>
        )}

        {/* 행별 미리보기 (오류 + 정상 일부) */}
        {preview && preview.plan.length > 0 && (
          <div style={{ ...GLASS.L4, borderRadius: 12, padding: 8, maxHeight: 320, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                  <th style={th}>#</th>
                  <th style={th}>이름</th>
                  <th style={th}>기간</th>
                  <th style={th}>종류</th>
                  <th style={th}>반차</th>
                  <th style={th}>상태</th>
                </tr>
              </thead>
              <tbody>
                {preview.plan
                  .filter(p => p.status !== 'skip-empty')
                  .slice(0, 100)
                  .map(p => (
                  <tr key={p.index} style={{
                    borderBottom: `1px solid ${COLORS.borderFaint}`,
                    background: p.status === 'error' ? COLORS.bgRed : 'transparent',
                  }}>
                    <td style={td}>{p.index}</td>
                    <td style={td}>{p.parsed?.worker_name || p.raw?.name || '·'}</td>
                    <td style={td}>
                      {p.parsed
                        ? (p.parsed.start_date === p.parsed.end_date
                          ? p.parsed.start_date
                          : `${p.parsed.start_date}~${p.parsed.end_date}`)
                        : `${p.raw?.start_date || ''} ~ ${p.raw?.end_date || ''}`}
                    </td>
                    <td style={td}>
                      {p.parsed ? TYPE_LABEL[p.parsed.leave_type] : (p.raw?.type || '·')}
                    </td>
                    <td style={td}>
                      {p.parsed?.am_pm === 'am' ? '오전' : p.parsed?.am_pm === 'pm' ? '오후' : '종일'}
                    </td>
                    <td style={td}>
                      {p.status === 'ok'
                        ? <span style={pillStyle('success')}>✓ 정상</span>
                        : <span style={pillStyle('danger')} title={p.errors.join(', ')}>
                            ⚠ {p.errors[0]}
                          </span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            color: COLORS.danger, fontSize: 12,
          }}>❌ {error}</div>
        )}

        {/* 액션 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={close} disabled={busy}
                  style={{
                    ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                    border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                  }}>
            {applied ? '닫기' : '취소'}
          </button>
          {preview && !applied && preview.summary.ok > 0 && (
            <button onClick={apply} disabled={busy}
                    style={{
                      ...BTN.lg, background: COLORS.success, color: '#fff', border: 'none',
                      cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
                    }}>
              {busy ? '적용 중...' : `✓ ${preview.summary.ok}건 적용`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: {
  label: string; value: number
  tone: 'success' | 'danger' | 'neutral'
}) {
  const tintMap = {
    success: { bg: COLORS.bgGreen, color: COLORS.success },
    danger:  { bg: COLORS.bgRed, color: COLORS.danger },
    neutral: { bg: 'rgba(255,255,255,0.6)', color: COLORS.textPrimary },
  }[tone]
  return (
    <div style={{
      background: tintMap.bg, borderRadius: 6, padding: 8, textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, color: COLORS.textSecondary, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: tintMap.color, lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '4px 6px', textAlign: 'left',
  color: COLORS.textMuted, fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '4px 6px', whiteSpace: 'nowrap', fontSize: 11, color: COLORS.textPrimary,
}
