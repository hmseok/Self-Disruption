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
import KpiEvaluation from './_components/KpiEvaluation'
import KpiSettings from './_components/KpiSettings'

export const dynamic = 'force-dynamic'

type FileKind = 'call-records' | 'productivity' | 'response-ivr' | 'response-queue'

const KIND_META: Record<FileKind, {
  label: string
  emoji: string
  uploadApi: string
  desc: string
  // upload-response 처럼 body 에 kind 가 필요한 경우 지정
  responseKind?: 'ivr' | 'queue'
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
  'response-ivr': {
    label: '응대현황(IVR)',
    emoji: '📲',
    uploadApi: '/api/call-scheduler/kpi/upload-response',
    desc: 'KT 응대현황(IVR) 엑셀 — 일자 × 착신번호/시나리오',
    responseKind: 'ivr',
  },
  'response-queue': {
    label: '응대현황(큐)',
    emoji: '📡',
    uploadApi: '/api/call-scheduler/kpi/upload-response',
    desc: 'KT 응대현황(큐) 엑셀 — 일자 × 스킬 (응대율·서비스레벨)',
    responseKind: 'queue',
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
interface ResponseSummary {
  kind: 'ivr' | 'queue'
  total: number; usable: number; newRows: number; duplicate: number
  skippedTotal: number; skippedEmpty: number
  periodFrom: string | null; periodTo: string | null
}

interface PreviewResult {
  mode: string
  summary: any
  plan?: any[]
  inserted?: number
  skipped?: number
}

type KpiTab = 'dashboard' | 'staffing' | 'settings' | 'evaluation' | 'upload'

// ── 자동 종류 판별 ────────────────────────────────────────────────
// 1차 — 파일명 패턴 / 2차 — 헤더 컬럼. 둘 다 실패 시 null (수동 선택).
function detectByFileName(name: string): FileKind | null {
  const n = String(name || '')
  if (n.includes('상담이력')) return 'call-records'
  if (n.includes('응대현황')) {
    if (/ivr/i.test(n)) return 'response-ivr'
    if (n.includes('큐') || /queue/i.test(n)) return 'response-queue'
    return null
  }
  if (n.includes('생산성') && (n.includes('상담사') || !n.includes('그룹'))) return 'productivity'
  return null
}

function detectByHeader(headers: string[]): FileKind | null {
  // 공백 제거 후 비교 (헤더 변형 대비)
  const set = new Set(headers.map((h) => String(h).trim().replace(/\s+/g, '')))
  const has = (k: string) => set.has(k.replace(/\s+/g, ''))
  if (has('콜키') || has('상담유형1')) return 'call-records'
  if (has('상담사명(ID)') || has('이석사유1')) return 'productivity'
  if (has('착신전화번호') && has('시나리오명')) return 'response-ivr'
  if (has('스킬') && (has('서비스레벨(%)') || has('응대율(%)'))) return 'response-queue'
  return null
}

// 파일별 업로드 항목
interface UploadItem {
  id: string
  fileName: string
  rows: any[]
  headers: string[]
  kind: FileKind | null     // null = 미판별 (수동 선택 필요)
  detectedBy: 'filename' | 'header' | 'none'
  status: 'parsing' | 'previewing' | 'ready' | 'applying' | 'done' | 'error'
  preview: PreviewResult | null
  result: PreviewResult | null   // apply 결과
  error: string | null
}

export default function KpiPage() {
  const [tab, setTab] = useState<KpiTab>('dashboard')
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<UploadItem[]>([])
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [applyDone, setApplyDone] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = () => {
    setItems([]); setGlobalError(null); setApplyDone(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // 양식 다운로드 — 4종 각각
  const downloadTemplate = async (k: FileKind) => {
    setBusy(true); setGlobalError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/kpi/template?kind=${k}`, { headers: auth })
      if (!res.ok) throw new Error('양식 다운로드 실패')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cs_kpi_${k}_template_${new Date().toISOString().substring(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e: any) { setGlobalError(e?.message || '오류') }
    finally { setBusy(false) }
  }

  // upload-response 등 kind 가 필요한 API 는 body 에 kind 포함
  const buildBody = (k: FileKind, mode: 'preview' | 'apply', rows: any[]) => {
    const m = KIND_META[k]
    return m.responseKind ? { kind: m.responseKind, mode, rows } : { mode, rows }
  }

  // 한 파일 preview 실행 → 결과를 item 에 반영
  const previewItem = async (item: UploadItem): Promise<UploadItem> => {
    if (!item.kind) return { ...item, status: 'ready' }
    try {
      const auth = await getAuthHeader()
      const res = await fetch(KIND_META[item.kind].uploadApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(buildBody(item.kind, 'preview', item.rows)),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '검증 실패')
      return { ...item, status: 'ready', preview: json.data, error: null }
    } catch (e: any) {
      return { ...item, status: 'error', error: e?.message || '검증 오류' }
    }
  }

  // 파일 목록 처리 — 파싱 → 자동 판별 → preview
  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) =>
      /\.(xlsx|xls)$/i.test(f.name),
    )
    if (files.length === 0) {
      setGlobalError('.xlsx / .xls 파일만 업로드할 수 있습니다.')
      return
    }
    setBusy(true); setGlobalError(null); setApplyDone(false)

    // 1) 파싱 + 자동 판별
    const parsed: UploadItem[] = []
    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      try {
        const buffer = await file.arrayBuffer()
        const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        if (!ws) throw new Error('시트를 찾을 수 없습니다.')
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
        if (rows.length === 0) throw new Error('빈 시트 또는 데이터 없음')
        const headers = Object.keys(rows[0] || {})

        // 1차 파일명 → 2차 헤더
        let kind = detectByFileName(file.name)
        let detectedBy: UploadItem['detectedBy'] = kind ? 'filename' : 'none'
        if (!kind) {
          kind = detectByHeader(headers)
          if (kind) detectedBy = 'header'
        }

        parsed.push({
          id, fileName: file.name, rows, headers, kind, detectedBy,
          status: 'previewing', preview: null, result: null, error: null,
        })
      } catch (e: any) {
        parsed.push({
          id, fileName: file.name, rows: [], headers: [], kind: null,
          detectedBy: 'none', status: 'error', preview: null, result: null,
          error: e?.message || '파일 읽기 실패',
        })
      }
    }
    setItems(parsed)

    // 2) 종류가 판별된 파일은 preview 실행
    const previewed = await Promise.all(
      parsed.map((it) =>
        it.status === 'error' ? Promise.resolve(it) : previewItem(it),
      ),
    )
    setItems(previewed)
    setBusy(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  // 미판별 파일 — 수동 종류 선택 → 해당 파일만 preview 재실행
  const setItemKind = async (id: string, k: FileKind) => {
    let target: UploadItem | undefined
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it
      target = { ...it, kind: k, detectedBy: 'header', status: 'previewing' }
      return target
    }))
    if (!target) return
    const updated = await previewItem(target)
    setItems((prev) => prev.map((it) => (it.id === id ? updated : it)))
  }

  // 한 파일 제거
  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  // 전체 적용 — 종류 판별된 파일을 각 API 에 apply POST
  const applyAll = async () => {
    const targets = items.filter((it) => it.kind && it.status === 'ready')
    if (targets.length === 0) return
    setBusy(true); setGlobalError(null)

    // 적용 대상 표시
    setItems((prev) => prev.map((it) =>
      targets.some((t) => t.id === it.id) ? { ...it, status: 'applying' } : it,
    ))

    const results = await Promise.all(targets.map(async (it) => {
      try {
        const auth = await getAuthHeader()
        const res = await fetch(KIND_META[it.kind!].uploadApi, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify(buildBody(it.kind!, 'apply', it.rows)),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '적용 실패')
        return { id: it.id, ok: true, data: json.data as PreviewResult, error: null }
      } catch (e: any) {
        return { id: it.id, ok: false, data: null, error: e?.message || '적용 오류' }
      }
    }))

    setItems((prev) => prev.map((it) => {
      const r = results.find((x) => x.id === it.id)
      if (!r) return it
      return r.ok
        ? { ...it, status: 'done', result: r.data }
        : { ...it, status: 'error', error: r.error }
    }))
    setApplyDone(true)
    setBusy(false)
  }

  // ── 파생 상태 ──────────────────────────────────────────────────
  const readyCount = items.filter((it) => it.kind && it.status === 'ready').length
  const unresolvedCount = items.filter((it) => !it.kind && it.status !== 'error').length
  const doneCount = items.filter((it) => it.status === 'done').length
  const failCount = items.filter((it) => it.status === 'error').length

  return (
    <div style={{ padding: '16px 24px' }}>
      {/* PageTitle 자동 헤더 — 자체 헤더 없음 */}

      {/* ── 탭 (대시보드 / 업로드) ──────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {([
          { k: 'dashboard' as KpiTab, label: '📊 KPI 대시보드' },
          { k: 'staffing' as KpiTab, label: '🧮 필요인원 (WFM)' },
          { k: 'evaluation' as KpiTab, label: '🏅 평가' },
          { k: 'upload' as KpiTab, label: '📤 KT 엑셀 업로드' },
          { k: 'settings' as KpiTab, label: '⚙ 설정' },
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

      {tab === 'evaluation' && <KpiEvaluation />}

      {tab === 'settings' && <KpiSettings />}

      {tab === 'upload' && (
       <>
      {/* ── 드래그앤드롭 / 다중 파일 업로드 ─────────────────── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          ...GLASS.L1, borderRadius: 12, padding: '22px 16px', marginBottom: 14,
          border: `2px dashed ${dragOver ? COLORS.borderBlue : COLORS.borderFaint}`,
          background: dragOver ? COLORS.bgBlue : (GLASS.L1 as any).background,
          textAlign: 'center', transition: 'border-color .15s, background .15s',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
          KT 엑셀 파일을 한 번에 끌어다 놓으세요
        </div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
          상담이력조회 · 생산성(상담사) · 응대현황(IVR) · 응대현황(큐) — 종류는 자동으로 판별됩니다.
          여러 파일·여러 달치를 한꺼번에 올릴 수 있습니다.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple
            onChange={onFileSelected} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={busy}
            style={{
              ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
              opacity: busy ? 0.6 : 1,
            }}>
            {busy ? '처리 중...' : '📤 파일 선택 (다중)'}
          </button>
          {items.length > 0 && (
            <button onClick={resetState} disabled={busy}
              style={{
                ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
              }}>
              전체 초기화
            </button>
          )}
        </div>
      </div>

      {/* ── 양식 다운로드 (4종) ─────────────────────────────── */}
      <div style={{
        ...GLASS.L1, borderRadius: 8, padding: 10, marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary }}>
          📥 양식 안내 (선택):
        </span>
        {(Object.keys(KIND_META) as FileKind[]).map((k) => (
          <button key={k} onClick={() => downloadTemplate(k)} disabled={busy}
            style={{
              ...BTN.sm, background: COLORS.bgGreen, color: COLORS.success,
              border: `1px solid ${COLORS.borderGreen}`,
              cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
            }}>
            {KIND_META[k].emoji} {KIND_META[k].label}
          </button>
        ))}
      </div>

      {globalError && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger, fontSize: 12,
        }}>❌ {globalError}</div>
      )}

      {/* ── 파일별 미리보기 카드 ───────────────────────────── */}
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((it) => (
            <FileCard key={it.id} item={it}
              onSetKind={setItemKind} onRemove={removeItem} />
          ))}
        </div>
      )}

      {/* ── 전체 적용 바 ───────────────────────────────────── */}
      {items.length > 0 && !applyDone && (
        <div style={{
          ...GLASS.L4, borderRadius: 12, padding: 12, marginTop: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
            적용 가능 <b style={{ color: COLORS.success }}>{readyCount}</b>건
            {unresolvedCount > 0 && (
              <span style={{ color: COLORS.warning }}>
                {' '}· 종류 미정 {unresolvedCount}건 (이 파일들은 제외하고 적용됩니다)
              </span>
            )}
            {failCount > 0 && (
              <span style={{ color: COLORS.danger }}> · 실패 {failCount}건</span>
            )}
          </div>
          <button onClick={applyAll} disabled={busy || readyCount === 0}
            style={{
              ...BTN.lg, background: COLORS.success, color: '#fff', border: 'none',
              cursor: (busy || readyCount === 0) ? 'not-allowed' : 'pointer',
              opacity: (busy || readyCount === 0) ? 0.5 : 1, whiteSpace: 'nowrap',
            }}>
            {busy ? '적용 중...' : `✓ 전체 적용 (${readyCount}건)`}
          </button>
        </div>
      )}

      {/* ── 적용 완료 결과 패널 (규칙 20 — 글래스 패널) ───────── */}
      {applyDone && (
        <div style={{
          ...GLASS.L4, borderRadius: 12, padding: 14, marginTop: 14,
          border: `1px solid ${failCount > 0 ? COLORS.borderAmber : COLORS.borderGreen}`,
        }}>
          <div style={{
            fontSize: 14, fontWeight: 800,
            color: failCount > 0 ? COLORS.warning : COLORS.success,
          }}>
            {failCount > 0
              ? `⚠ 적용 완료 — 성공 ${doneCount}건 / 실패 ${failCount}건`
              : `✅ 전체 적용 완료 — ${doneCount}건`}
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
            파일별 결과는 위 카드에서 확인할 수 있습니다.
            {unresolvedCount > 0 && ` 종류 미정 ${unresolvedCount}건은 적용되지 않았습니다 — 종류를 선택한 후 다시 적용하세요.`}
          </div>
          <button onClick={resetState}
            style={{
              ...BTN.sm, marginTop: 8, background: 'transparent',
              color: COLORS.textSecondary, border: `1px solid ${COLORS.borderFaint}`,
              cursor: 'pointer',
            }}>
            새 업로드 시작
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

// ── 종류 배지 ─────────────────────────────────────────────────
function KindBadge({ kind, detectedBy }: {
  kind: FileKind; detectedBy: UploadItem['detectedBy']
}) {
  const m = KIND_META[kind]
  const byLabel = detectedBy === 'filename' ? '파일명'
    : detectedBy === 'header' ? '헤더 인식' : '수동'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
      background: COLORS.bgBlue, border: `1px solid ${COLORS.borderBlue}`,
      color: COLORS.primary, fontSize: 11, fontWeight: 800,
    }}>
      {m.emoji} {m.label}
      <span style={{ color: COLORS.textMuted, fontWeight: 600, fontSize: 10 }}>
        ({byLabel})
      </span>
    </span>
  )
}

// ── 파일별 카드 — 자동 판별 + 미리보기 + 결과 ─────────────────────
function FileCard({ item, onSetKind, onRemove }: {
  item: UploadItem
  onSetKind: (id: string, k: FileKind) => void
  onRemove: (id: string) => void
}) {
  const { kind, status } = item
  // 표시할 결과: 적용 완료면 result, 아니면 preview
  const shown = item.result || item.preview
  const applied = status === 'done'

  // 상태별 보더 색
  const borderColor = status === 'error' ? COLORS.borderRed
    : status === 'done' ? COLORS.borderGreen
    : !kind ? COLORS.borderAmber
    : COLORS.borderFaint

  return (
    <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12, border: `1px solid ${borderColor}` }}>
      {/* 헤더 — 파일명 / 배지 / 행수 / 제거 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 13, fontWeight: 800, color: COLORS.textPrimary,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 320,
        }}>
          📄 {item.fileName}
        </span>
        {kind
          ? <KindBadge kind={kind} detectedBy={item.detectedBy} />
          : status !== 'error' && (
            <span style={{
              padding: '3px 9px', borderRadius: 999,
              background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
              color: COLORS.warning, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
            }}>
              ⚠ 종류 미판별
            </span>
          )}
        {item.rows.length > 0 && (
          <span style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
            {item.rows.length}행
          </span>
        )}
        <span style={{ flex: 1 }} />
        {(status === 'previewing' || status === 'applying') && (
          <span style={{ fontSize: 11, color: COLORS.info, whiteSpace: 'nowrap' }}>
            {status === 'applying' ? '적용 중…' : '검증 중…'}
          </span>
        )}
        {status === 'done' && (
          <span style={{ fontSize: 11, fontWeight: 800, color: COLORS.success, whiteSpace: 'nowrap' }}>
            ✓ 적용됨
          </span>
        )}
        {status !== 'applying' && status !== 'done' && (
          <button onClick={() => onRemove(item.id)}
            style={{
              ...BTN.sm, background: 'transparent', color: COLORS.textMuted,
              border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
            }}>
            제거
          </button>
        )}
      </div>

      {/* 미판별 — 수동 종류 선택 드롭다운 */}
      {!kind && status !== 'error' && (
        <div style={{
          marginTop: 10, padding: 10, borderRadius: 8,
          background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
        }}>
          <div style={{ fontSize: 11, color: COLORS.warning, fontWeight: 700, marginBottom: 6 }}>
            파일 종류를 자동으로 판별하지 못했습니다. 직접 선택하세요.
          </div>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onSetKind(item.id, e.target.value as FileKind)
            }}
            style={{
              ...GLASS.L1, padding: '6px 10px', borderRadius: 8, fontSize: 12,
              color: COLORS.textPrimary, border: `1px solid ${COLORS.borderFaint}`,
            }}>
            <option value="">— 종류 선택 —</option>
            {(Object.keys(KIND_META) as FileKind[]).map((k) => (
              <option key={k} value={k}>{KIND_META[k].emoji} {KIND_META[k].label}</option>
            ))}
          </select>
        </div>
      )}

      {/* 오류 */}
      {status === 'error' && item.error && (
        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 8,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger, fontSize: 12,
        }}>
          ❌ {item.error}
        </div>
      )}

      {/* 미리보기 / 적용 결과 */}
      {kind && shown && (
        <div style={{ marginTop: 10 }}>
          {kind === 'call-records'
            ? <CallPreview preview={shown} applied={applied} />
            : kind === 'productivity'
              ? <ProdPreview preview={shown} applied={applied} />
              : <ResponsePreview preview={shown} applied={applied} />}
        </div>
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

// ── 응대현황(IVR / 큐) 미리보기 ───────────────────────────────
function ResponsePreview({ preview, applied }: { preview: PreviewResult; applied: boolean }) {
  const s = preview.summary as ResponseSummary
  const isIvr = s.kind === 'ivr'
  const unitLabel = isIvr ? '착신번호' : '스킬'
  return (
    <div>
      <ResultBanner applied={applied}
        appliedText={`✅ 적용 완료 — ${preview.inserted ?? 0}건 저장 (재업로드 시 덮어쓰기)`}
        previewText={`🔍 검증 결과 — 응대현황(${isIvr ? 'IVR' : '큐'})`} />
      <div style={{
        ...GLASS.L4, borderRadius: 12, padding: 12, marginTop: 10,
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8,
      }}>
        <Stat label="전체 행" value={s.total} tone="neutral" />
        <Stat label={`유효 행 (${unitLabel})`} value={s.usable} tone="info" />
        <Stat label="신규" value={s.newRows} tone="success" />
        <Stat label="중복(덮어씀)" value={s.duplicate} tone={s.duplicate > 0 ? 'warning' : 'neutral'} />
        <Stat label="합계 행(제외)" value={s.skippedTotal} tone="neutral" />
        <Stat label="빈 행(제외)" value={s.skippedEmpty} tone={s.skippedEmpty > 0 ? 'warning' : 'neutral'} />
      </div>
      <PeriodLine from={s.periodFrom} to={s.periodTo} />
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6 }}>
        ℹ {isIvr
          ? '일자 × 착신전화번호 단위로 저장됩니다 (UNIQUE = 일자+착신번호).'
          : '일자 × 스킬 단위로 저장됩니다 (UNIQUE = 일자+스킬). 대시보드·WFM 의 응대율·서비스레벨에 반영됩니다.'}
      </div>
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
