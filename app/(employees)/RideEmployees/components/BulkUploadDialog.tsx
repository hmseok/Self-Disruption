'use client'
// ═══════════════════════════════════════════════════════════════════
// BulkUploadDialog — 직원 마스터 엑셀 일괄 등록
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
  status: 'ok' | 'skip-empty' | 'skip-duplicate' | 'error'
  errors: string[]
  parsed?: {
    name: string
    department: string | null
    position: string | null
    employment_type: string | null
    hire_date: string | null
    phone: string | null
    email: string | null
    group_label: string | null
    color_tone: string
    memo: string | null
  }
}

interface PreviewResult {
  mode: string
  summary: { total: number; ok: number; empty: number; duplicate: number; error: number }
  plan: PlanRow[]
  inserted?: number
}

export default function BulkUploadDialog({ open, onClose, onCompleted }: Props) {
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
      const res = await fetch('/api/ride-employees/template', { headers: auth })
      if (!res.ok) throw new Error('샘플 다운로드 실패')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ride_employees_template_${new Date().toISOString().substring(0, 10)}.xlsx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
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
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' })
      if (rows.length < 2) { setError('빈 시트'); setBusy(false); return }
      const header = rows[0].map((h: any) => String(h || '').trim())
      const idx = (regex: RegExp) => header.findIndex(h => regex.test(h))
      const idxName = idx(/이름/)
      const idxDept = idx(/부서/)
      const idxPos = idx(/직급/)
      const idxEmpType = idx(/고용/)
      const idxHire = idx(/입사/)
      const idxPhone = idx(/전화|연락/)
      const idxEmail = idx(/이메일|email/i)
      const idxGroup = idx(/^그룹$|콜센터.*분류/)
      const idxColor = idx(/색상|tone/i)
      const idxMemo = idx(/메모/)
      const dataRows: any[] = []
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]
        if (!r) continue
        dataRows.push({
          name: idxName >= 0 ? String(r[idxName] || '').trim() : '',
          department: idxDept >= 0 ? String(r[idxDept] || '').trim() : '',
          position: idxPos >= 0 ? String(r[idxPos] || '').trim() : '',
          employment_type: idxEmpType >= 0 ? String(r[idxEmpType] || '').trim() : '',
          hire_date: idxHire >= 0 ? String(r[idxHire] || '').trim() : '',
          phone: idxPhone >= 0 ? String(r[idxPhone] || '').trim() : '',
          email: idxEmail >= 0 ? String(r[idxEmail] || '').trim() : '',
          group_label: idxGroup >= 0 ? String(r[idxGroup] || '').trim() : '',
          color_tone: idxColor >= 0 ? String(r[idxColor] || 'none').trim() : 'none',
          memo: idxMemo >= 0 ? String(r[idxMemo] || '').trim() : '',
        })
      }
      setParsedRows(dataRows)
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
      const res = await fetch('/api/ride-employees/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ mode: 'preview', rows: rowsToCheck }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '검증 실패')
      setPreview(json.data)
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setBusy(false) }
  }

  const apply = async () => {
    if (!preview || preview.summary.ok === 0) return
    setBusy(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/ride-employees/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ mode: 'apply', rows: parsedRows }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '적용 실패')
      setPreview(json.data)
      setApplied(true)
      onCompleted()
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setBusy(false) }
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
            📤 직원 마스터 일괄 등록
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
            샘플 .xlsx 받기 → 채우기 → 업로드 → 검증 → 적용 (이름 중복 시 자동 skip)
          </div>
        </div>

        <div style={{
          ...GLASS.L1, borderRadius: 8, padding: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
              ① 샘플 엑셀 받기
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
              컬럼 10개: 이름·부서·직급·고용형태·입사일·전화·이메일·그룹·색상·메모
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

        {preview && (
          <div style={{
            ...GLASS.L3,
            background: applied ? COLORS.bgGreen
              : preview.summary.error > 0 ? COLORS.bgAmber : COLORS.bgBlue,
            border: `1px solid ${applied ? COLORS.borderGreen
              : preview.summary.error > 0 ? COLORS.borderAmber : COLORS.borderBlue}`,
            borderRadius: 12, padding: 12,
          }}>
            <div style={{
              fontSize: 13, fontWeight: 800, marginBottom: 8,
              color: applied ? COLORS.success
                : preview.summary.error > 0 ? COLORS.warning : COLORS.info,
            }}>
              {applied ? `✅ 적용 완료 — ${preview.inserted}명 추가`
                : preview.summary.error > 0 ? '⚠ 일부 오류' : '🔍 검증 결과'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              <Stat label="전체" value={preview.summary.total} tone="neutral" />
              <Stat label="✓ 정상" value={preview.summary.ok} tone="success" />
              <Stat label="↻ 중복" value={preview.summary.duplicate} tone="warning" />
              <Stat label="⚠ 오류" value={preview.summary.error} tone={preview.summary.error > 0 ? 'danger' : 'neutral'} />
              <Stat label="○ 빈" value={preview.summary.empty} tone="neutral" />
            </div>
          </div>
        )}

        {preview && preview.plan.length > 0 && (
          <div style={{ ...GLASS.L4, borderRadius: 12, padding: 8, maxHeight: 300, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                  <th style={th}>#</th>
                  <th style={th}>이름</th>
                  <th style={th}>부서</th>
                  <th style={th}>직급</th>
                  <th style={th}>입사</th>
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
                    background: p.status === 'error' ? COLORS.bgRed
                      : p.status === 'skip-duplicate' ? COLORS.bgAmber : 'transparent',
                  }}>
                    <td style={td}>{p.index}</td>
                    <td style={td}>{p.parsed?.name || p.raw?.name || '·'}</td>
                    <td style={td}>{p.parsed?.department || p.raw?.department || '·'}</td>
                    <td style={td}>{p.parsed?.position || p.raw?.position || '·'}</td>
                    <td style={td}>{p.parsed?.hire_date || p.raw?.hire_date || '·'}</td>
                    <td style={td}>
                      {p.status === 'ok'
                        ? <span style={pillStyle('success')}>✓ 정상</span>
                        : p.status === 'skip-duplicate'
                        ? <span style={pillStyle('warning')}>↻ 중복</span>
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
              {busy ? '등록 중...' : `✓ ${preview.summary.ok}명 등록`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: {
  label: string; value: number
  tone: 'success' | 'danger' | 'warning' | 'neutral'
}) {
  const tintMap = {
    success: { bg: COLORS.bgGreen, color: COLORS.success },
    danger:  { bg: COLORS.bgRed, color: COLORS.danger },
    warning: { bg: COLORS.bgAmber, color: COLORS.warning },
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
