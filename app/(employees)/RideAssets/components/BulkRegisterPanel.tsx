'use client'

/**
 * BulkRegisterPanel — 자산 대량 등록 (인라인 리스트 + 엑셀 업로드)
 *
 * 방식 A: 인라인 리스트 — 「+ 행 추가」 → 셀 직접 입력 → 「일괄 저장」
 * 방식 B: 엑셀 — 템플릿 다운로드 → 채움 → 업로드 → 미리보기 → 확정 등록
 *
 * 둘 다 POST /api/ride-assets/bulk 로 전송.
 * 엑셀 파싱/템플릿 생성은 클라이언트사이드 xlsx 라이브러리.
 */
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { getStoredToken } from '@/lib/auth-client'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

interface Category {
  id: string
  code: string
  name: string
  emoji: string | null
  is_active: number
}

interface Assignee {
  kind: 'employee' | 'freelancer'
  id: string
  name: string
  sub: string | null
}

interface DraftRow {
  category_id: string
  name: string
  acquired_at: string
  acquired_cost: string
  assignee_key: string   // 'employee:uuid' | 'freelancer:uuid' | ''
  location: string
  notes: string
  _error?: string        // 엑셀 파싱 시 행 오류
}

interface Props {
  categories: Category[]
  assignees: Assignee[]
  onDone: (result: { created: number; failed: number; errors: { row: number; error: string }[] }) => void
}

const EMPTY_ROW: DraftRow = {
  category_id: '', name: '', acquired_at: '', acquired_cost: '',
  assignee_key: '', location: '', notes: '',
}

export default function BulkRegisterPanel({ categories, assignees, onDone }: Props) {
  const [mode, setMode] = useState<'inline' | 'excel'>('inline')
  const [rows, setRows] = useState<DraftRow[]>([{ ...EMPTY_ROW }])
  const [saving, setSaving] = useState(false)
  const [excelError, setExcelError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const activeCategories = categories.filter(c => c.is_active)

  function updateRow(idx: number, patch: Partial<DraftRow>) {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  function addRow() { setRows(prev => [...prev, { ...EMPTY_ROW }]) }
  function removeRow(idx: number) { setRows(prev => prev.filter((_, i) => i !== idx)) }

  // ── 일괄 저장 (인라인 + 엑셀 공통) ──
  async function handleSave() {
    const payload = rows
      .filter(r => r.category_id && r.name.trim())
      .map(r => {
        const [kind, id] = r.assignee_key ? r.assignee_key.split(':') : ['', '']
        return {
          category_id: r.category_id,
          name: r.name.trim(),
          acquired_at: r.acquired_at || null,
          acquired_cost: r.acquired_cost ? r.acquired_cost.replace(/,/g, '') : null,
          assigned_to_kind: kind || null,
          assigned_to_id: id || null,
          location: r.location.trim() || null,
          notes: r.notes || null,
        }
      })
    if (payload.length === 0) {
      setExcelError('등록할 유효한 행이 없습니다 (카테고리·자산명 필수).')
      return
    }
    setSaving(true)
    setExcelError(null)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-assets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ rows: payload }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setExcelError(json.error || `HTTP ${res.status}`)
        return
      }
      setRows([{ ...EMPTY_ROW }])
      if (fileRef.current) fileRef.current.value = ''
      onDone(json.data)
    } catch (e) {
      setExcelError(String(e))
    } finally {
      setSaving(false)
    }
  }

  // ── 엑셀 템플릿 다운로드 ──
  function downloadTemplate() {
    const headers = ['카테고리', '자산명', '취득일(YYYY-MM-DD)', '취득가', '사용자', '위치', '메모']
    const example = [
      ['IT장비', 'ThinkPad X1 Carbon', '2026-01-15', '2500000', '박지훈', '3F 개발팀', '신규 입고'],
      ['차량', '카니발 12가3456', '2025-08-01', '38000000', '', '본사 차고지', ''],
    ]
    const ws = XLSX.utils.aoa_to_sheet([headers, ...example])
    ws['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 20 }]
    // 참고 시트 — 카테고리 목록
    const catSheet = XLSX.utils.aoa_to_sheet([
      ['사용 가능 카테고리 (자산명 열의 카테고리에 아래 이름을 그대로 입력)'],
      ...activeCategories.map(c => [c.name]),
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '자산등록')
    XLSX.utils.book_append_sheet(wb, catSheet, '카테고리목록')
    XLSX.writeFile(wb, `라이드자산_등록양식_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── 엑셀 업로드 파싱 ──
  function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setExcelError(null)
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })
        if (aoa.length < 2) { setExcelError('데이터 행이 없습니다.'); return }

        // 카테고리 이름 → id, 사용자 이름 → assignee 매핑
        const catByName = new Map(activeCategories.map(c => [c.name.trim(), c.id]))
        const assigneeByName = new Map<string, Assignee[]>()
        assignees.forEach(a => {
          const list = assigneeByName.get(a.name.trim()) || []
          list.push(a)
          assigneeByName.set(a.name.trim(), list)
        })

        const parsed: DraftRow[] = []
        for (let i = 1; i < aoa.length; i++) {
          const r = aoa[i]
          const catName = String(r[0] ?? '').trim()
          const name = String(r[1] ?? '').trim()
          if (!catName && !name) continue  // 빈 행 skip

          const errs: string[] = []
          const catId = catByName.get(catName)
          if (!catId) errs.push(`카테고리 '${catName}' 없음`)

          let assigneeKey = ''
          const userName = String(r[4] ?? '').trim()
          if (userName) {
            const matches = assigneeByName.get(userName)
            if (!matches || matches.length === 0) errs.push(`사용자 '${userName}' 없음`)
            else if (matches.length > 1) errs.push(`'${userName}' 동명이인 — 화면에서 선택`)
            else assigneeKey = `${matches[0].kind}:${matches[0].id}`
          }
          if (!name) errs.push('자산명 누락')

          // 취득일 — 엑셀 날짜 직렬값 또는 문자열
          let acquiredAt = ''
          const rawDate = r[2]
          if (rawDate != null && rawDate !== '') {
            if (typeof rawDate === 'number') {
              const d = XLSX.SSF.parse_date_code(rawDate)
              if (d) acquiredAt = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
            } else {
              acquiredAt = String(rawDate).trim()
            }
          }

          parsed.push({
            category_id: catId || '',
            name,
            acquired_at: acquiredAt,
            acquired_cost: r[3] != null ? String(r[3]).trim() : '',
            assignee_key: assigneeKey,
            location: String(r[5] ?? '').trim(),
            notes: String(r[6] ?? '').trim(),
            _error: errs.length ? errs.join(', ') : undefined,
          })
        }
        if (parsed.length === 0) { setExcelError('읽을 데이터가 없습니다.'); return }
        setRows(parsed)
        setMode('inline')  // 미리보기 = 인라인 표에서 확인/수정
      } catch (err) {
        setExcelError('엑셀 파싱 실패: ' + String(err))
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const errorRowCount = rows.filter(r => r._error).length
  const validRowCount = rows.filter(r => r.category_id && r.name.trim() && !r._error).length

  return (
    <div style={{ ...GLASS.L4, borderRadius: 12, padding: 20 }}>
      {/* 모드 토글 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, marginRight: 8 }}>
          ➕ 대량 등록
        </h3>
        <button onClick={() => setMode('inline')}
          style={{ ...BTN.sm, cursor: 'pointer', border: 'none',
            background: mode === 'inline' ? COLORS.textPrimary : 'transparent',
            color: mode === 'inline' ? '#fff' : COLORS.textSecondary }}>
          📝 직접 입력
        </button>
        <button onClick={() => setMode('excel')}
          style={{ ...BTN.sm, cursor: 'pointer', border: 'none',
            background: mode === 'excel' ? COLORS.textPrimary : 'transparent',
            color: mode === 'excel' ? '#fff' : COLORS.textSecondary }}>
          📂 엑셀 업로드
        </button>
      </div>

      {excelError && (
        <div style={{ padding: 10, borderRadius: 8, marginBottom: 12,
          background: 'rgba(239,68,68,0.08)', color: COLORS.danger, fontSize: 12 }}>
          ❗ {excelError}
        </div>
      )}

      {/* 엑셀 모드 — 템플릿/업로드 */}
      {mode === 'excel' && (
        <div style={{ ...GLASS.L3, borderRadius: 8, padding: 16, marginBottom: 16,
          border: `1px solid ${COLORS.borderBlue}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={downloadTemplate}
            style={{ ...BTN.md, background: 'transparent', color: COLORS.primary,
              border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer' }}>
            📥 엑셀 템플릿 다운로드
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload}
            style={{ fontSize: 12, color: COLORS.textSecondary }} />
          <span style={{ fontSize: 11, color: COLORS.textMuted }}>
            업로드하면 아래 표에 미리보기 — 오류 행은 빨강 표시. 확인 후 「일괄 저장」.
          </span>
        </div>
      )}

      {/* 인라인 리스트 표 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: COLORS.bgGray }}>
              {['카테고리 *', '자산명 *', '취득일', '취득가', '사용자(매칭)', '위치', '메모', ''].map((h, i) => (
                <th key={i} style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 600,
                  color: COLORS.textSecondary, whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} style={{ borderBottom: `1px solid ${COLORS.borderSubtle}`,
                background: row._error ? 'rgba(239,68,68,0.06)' : 'transparent' }}>
                <td style={cell}>
                  <select value={row.category_id} onChange={e => updateRow(idx, { category_id: e.target.value, _error: undefined })}
                    style={inp}>
                    <option value="">선택</option>
                    {activeCategories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                  </select>
                </td>
                <td style={cell}>
                  <input value={row.name} onChange={e => updateRow(idx, { name: e.target.value, _error: undefined })}
                    placeholder="자산명" style={{ ...inp, minWidth: 140 }} />
                </td>
                <td style={cell}>
                  <input type="date" value={row.acquired_at} onChange={e => updateRow(idx, { acquired_at: e.target.value })}
                    style={inp} />
                </td>
                <td style={cell}>
                  <input value={row.acquired_cost} onChange={e => updateRow(idx, { acquired_cost: e.target.value })}
                    placeholder="0" style={{ ...inp, width: 90, textAlign: 'right' }} />
                </td>
                <td style={cell}>
                  <select value={row.assignee_key} onChange={e => updateRow(idx, { assignee_key: e.target.value })}
                    style={{ ...inp, minWidth: 130 }}>
                    <option value="">— 공통(미할당) —</option>
                    {assignees.map(a => (
                      <option key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>
                        {a.kind === 'employee' ? '[직원]' : '[외부]'} {a.name}{a.sub ? ` · ${a.sub}` : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={cell}>
                  <input value={row.location} onChange={e => updateRow(idx, { location: e.target.value })}
                    placeholder="위치" style={{ ...inp, minWidth: 100 }} />
                </td>
                <td style={cell}>
                  <input value={row.notes} onChange={e => updateRow(idx, { notes: e.target.value })}
                    placeholder="메모" style={{ ...inp, minWidth: 100 }} />
                </td>
                <td style={cell}>
                  <button onClick={() => removeRow(idx)} title="행 삭제"
                    style={{ ...BTN.sm, background: 'transparent', color: COLORS.danger,
                      border: 'none', cursor: 'pointer', padding: '2px 6px' }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 오류 행 안내 */}
      {errorRowCount > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: COLORS.danger }}>
          ⚠ 오류 행 {errorRowCount}개 — 빨강 표시된 행의 카테고리/사용자를 표에서 직접 선택해 고쳐주세요.
          {rows.filter(r => r._error).slice(0, 3).map((r, i) => (
            <div key={i} style={{ marginLeft: 12, color: COLORS.textMuted }}>· {r.name || '(이름없음)'}: {r._error}</div>
          ))}
        </div>
      )}

      {/* 액션 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
        <button onClick={addRow}
          style={{ ...BTN.sm, background: 'transparent', color: COLORS.primary,
            border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer' }}>
          + 행 추가
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: COLORS.textMuted }}>
          등록 가능 {validRowCount}건 {errorRowCount > 0 && `/ 오류 ${errorRowCount}건`}
        </span>
        <button onClick={handleSave} disabled={saving || validRowCount === 0}
          style={{ ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
            cursor: saving || validRowCount === 0 ? 'not-allowed' : 'pointer',
            opacity: saving || validRowCount === 0 ? 0.5 : 1 }}>
          {saving ? '저장 중...' : `일괄 저장 (${validRowCount}건)`}
        </button>
      </div>
    </div>
  )
}

const cell: React.CSSProperties = { padding: '4px 6px', verticalAlign: 'middle' }
const inp: React.CSSProperties = {
  ...GLASS.L1, borderRadius: 6, padding: '5px 7px', fontSize: 12,
  color: COLORS.textPrimary, outline: 'none', width: '100%', boxSizing: 'border-box',
}
