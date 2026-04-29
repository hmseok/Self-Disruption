'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'

// ═══════════════════════════════════════════════════════════════════
// 보험 관리 메인 페이지
//
// - 보험계약 목록 (만료일 기준 정렬)
// - 통계 카드 (진행/만기임박/만기/연 보험료)
// - 등록 모달 (직접 입력 / 청약서 OCR 업로드)
// - 차량별 분담 + 납입 스케줄 자동 계산 + 수동 편집
// ═══════════════════════════════════════════════════════════════════

const nf = (n: number | null | undefined) => (Number(n) || 0).toLocaleString()

interface Car { id: string; number: string; brand?: string; model?: string; vin?: string }
interface Allocation {
  car_id?: string | null
  vin?: string | null
  vehicle_label?: string | null
  premium_amount: number
  coverage_note?: string | null
}
interface Schedule {
  installment_no: number
  due_date: string
  amount: number
}

const COMMON_INSURERS = [
  '전국렌터카공제조합', '삼성화재', 'KB손해보험', 'DB손해보험',
  '현대해상', '메리츠화재', '한화손해보험', '롯데손해보험', '흥국화재', '기타',
]

export default function InsurancePage() {
  const [list, setList] = useState<any[]>([])
  const [stats, setStats] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [cars, setCars] = useState<Car[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [prefilledData, setPrefilledData] = useState<any>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [showReviewOnly, setShowReviewOnly] = useState(false)

  // 대량 OCR 상태
  const [bulkProgress, setBulkProgress] = useState<null | {
    running: boolean
    total: number
    processed: number
    autoSaved: number
    reviewNeeded: number
    duplicates: number
    failed: number
    failures: Array<{ name: string; reason: string }>
  }>(null)
  const [bulkDryRun, setBulkDryRun] = useState<null | {
    files: File[]
    firstResult: any
    firstFileName: string
  }>(null)
  const stopRef = useRef({ stop: false })

  const loadList = useCallback(async () => {
    setLoading(true)
    const { json } = await fetchWithAuth('/api/insurance')
    if (json?.data) setList(json.data)
    if (json?.stats) setStats(json.stats)
    setLoading(false)
  }, [])

  const loadCars = useCallback(async () => {
    const { json } = await fetchWithAuth('/api/finance-upload?table=cars')
    if (json?.data) setCars(json.data.map((c: any) => ({
      id: c.id, number: c.number || '', brand: c.brand || '', model: c.model || '', vin: c.vin || ''
    })))
  }, [])

  useEffect(() => { loadList(); loadCars() }, [loadList, loadCars])

  const totalAnnualPremium = Number(stats.total_premium_sum || 0)

  const openNew = () => { setEditingId(null); setPrefilledData(null); setShowModal(true) }
  const openEdit = (id: string) => { setEditingId(id); setPrefilledData(null); setShowModal(true) }

  const handleOcrUpload = async (file: File) => {
    setOcrLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      // fetchWithAuth 는 JSON 전용이므로 fetch + Bearer 헤더 직접
      const { getAuthHeader } = await import('@/app/utils/finance-upload')
      const headers = await getAuthHeader()
      const res = await fetch('/api/insurance/ocr', {
        method: 'POST',
        headers: headers as any,
        body: formData,
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        alert(`OCR 실패: ${json?.error || res.status}\n\n${json?.raw_text_sample ? `Raw: ${json.raw_text_sample.slice(0, 200)}` : ''}`)
        return
      }
      // 추출 데이터 → 모달에 prefill
      const ext = json.extracted
      const allocations = (ext.vehicles || []).map((v: any) => {
        // vin → cars 매칭 시도 (클라이언트 측)
        const matched = cars.find(c => c.vin === v.vin)
        return {
          car_id: matched?.id || null,
          vin: v.vin || null,
          vehicle_label: v.vehicle_label || null,
          premium_amount: Number(v.premium) || 0,
          coverage_note: v.coverage_note || null,
        }
      })
      const schedules = (ext.schedules || []).map((s: any) => ({
        installment_no: Number(s.installment_no),
        due_date: s.due_date,
        amount: Number(s.amount) || 0,
      }))
      setPrefilledData({
        contract: {
          insurance_company: ext.insurance_company || '',
          policy_number: ext.policy_number || '',
          design_number: ext.design_number || '',
          vehicle_class: ext.vehicle_class || '',
          start_date: ext.start_date || '',
          end_date: ext.end_date || '',
          total_premium: Number(ext.total_premium) || 0,
          contract_type: ext.contract_type === 'fleet' ? 'fleet' : 'individual',
          payment_type: ext.payment_type === 'installment' ? 'installment' : 'lump',
          installment_count: Number(ext.installment_count) || 1,
          memo: `OCR 추출 (신뢰도 ${json.confidence || 0}%)`,
        },
        allocations,
        schedules,
        confidence: json.confidence,
      })
      setEditingId(null)
      setShowModal(true)
    } catch (e: any) {
      alert(`OCR 오류: ${e?.message || String(e)}`)
    } finally {
      setOcrLoading(false)
    }
  }

  // ── 대량 OCR (옵션 C) ──
  // 1) 첫 파일 dry-run → 사용자 확인 → 나머지 일괄 처리
  // 2) 신뢰도 분기: ≥85 자동 저장 / 70~84 자동 저장 + 노란 플래그 / <70 실패 큐
  const callOcr = async (file: File): Promise<{ ok: boolean; extracted?: any; confidence?: number; error?: string }> => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { getAuthHeader } = await import('@/app/utils/finance-upload')
      const headers = await getAuthHeader()
      const res = await fetch('/api/insurance/ocr', { method: 'POST', headers: headers as any, body: formData })
      const json = await res.json()
      if (!res.ok || !json.ok) return { ok: false, error: json?.error || `HTTP ${res.status}` }
      return { ok: true, extracted: json.extracted, confidence: Number(json.confidence) || 0 }
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) }
    }
  }

  const saveExtracted = async (extracted: any, confidence: number, fileName: string): Promise<{ ok: boolean; error?: string; auto: boolean; duplicate?: boolean }> => {
    const allocations = (extracted.vehicles || []).map((v: any) => {
      const matched = cars.find(c => c.vin === v.vin)
      return {
        car_id: matched?.id || null,
        vin: v.vin || null,
        vehicle_label: v.vehicle_label || null,
        premium_amount: Number(v.premium) || 0,
        coverage_note: v.coverage_note || null,
      }
    })
    const schedules = (extracted.schedules || []).map((s: any) => ({
      installment_no: Number(s.installment_no),
      due_date: s.due_date,
      amount: Number(s.amount) || 0,
    }))
    const body = {
      contract: {
        insurance_company: extracted.insurance_company || '',
        policy_number: extracted.policy_number || '',
        design_number: extracted.design_number || '',
        vehicle_class: extracted.vehicle_class || '',
        start_date: extracted.start_date || '',
        end_date: extracted.end_date || '',
        total_premium: Number(extracted.total_premium) || 0,
        contract_type: extracted.contract_type === 'fleet' ? 'fleet' : 'individual',
        payment_type: extracted.payment_type === 'installment' ? 'installment' : 'lump',
        installment_count: Number(extracted.installment_count) || 1,
        ocr_confidence: confidence,
        memo: `일괄 OCR (신뢰도 ${confidence}%) — ${fileName}`,
      },
      allocations,
      schedules,
    }
    try {
      const { ok, status, json } = await fetchWithAuth('/api/insurance', { method: 'POST', body })
      if (!ok) {
        // 409 중복은 실패가 아닌 별도 카운트
        if (status === 409 && json?.duplicate) {
          return { ok: false, error: '중복 (이미 등록된 청약서)', auto: false, duplicate: true }
        }
        return { ok: false, error: json?.error || '저장 실패', auto: false }
      }
      return { ok: true, auto: confidence >= 85 }
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e), auto: false }
    }
  }

  const handleBulkUpload = async (rawFiles: FileList) => {
    const files = Array.from(rawFiles)
    if (files.length === 0) return
    if (files.length > 50) { alert(`최대 50장 (선택: ${files.length}장)`); return }

    // 첫 파일 dry-run
    setOcrLoading(true)
    const r1 = await callOcr(files[0])
    setOcrLoading(false)

    if (!r1.ok) {
      alert(`첫 번째 파일 OCR 실패: ${r1.error}\n\n일괄 처리를 시작하지 않습니다.\n파일 형식을 확인해 주세요.`)
      return
    }
    setBulkDryRun({ files, firstResult: { extracted: r1.extracted, confidence: r1.confidence }, firstFileName: files[0].name })
  }

  const proceedBulk = async () => {
    if (!bulkDryRun) return
    const { files, firstResult } = bulkDryRun
    const total = files.length
    setBulkDryRun(null)

    let autoSaved = 0
    let reviewNeeded = 0
    let duplicates = 0
    let failed = 0
    const failures: Array<{ name: string; reason: string }> = []
    stopRef.current.stop = false

    setBulkProgress({ running: true, total, processed: 0, autoSaved, reviewNeeded, duplicates, failed, failures: [] })

    // 첫 파일 (이미 OCR 완료) 저장
    const c1 = Number(firstResult.confidence) || 0
    if (c1 < 70) {
      failures.push({ name: files[0].name, reason: `신뢰도 ${c1}% < 70% (실패 큐)` })
      failed++
    } else {
      const sv = await saveExtracted(firstResult.extracted, c1, files[0].name)
      if (sv.duplicate) { duplicates++ }
      else if (!sv.ok) { failures.push({ name: files[0].name, reason: sv.error || '저장 실패' }); failed++ }
      else if (sv.auto) autoSaved++
      else reviewNeeded++
    }
    setBulkProgress({ running: true, total, processed: 1, autoSaved, reviewNeeded, duplicates, failed, failures: [...failures] })

    // 나머지 파일 — 병렬 3개씩
    const remaining = files.slice(1)
    const BATCH_SIZE = 3
    for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
      if (stopRef.current.stop) break
      const batch = remaining.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map(async (file) => {
        if (stopRef.current.stop) return
        const r = await callOcr(file)
        if (!r.ok) { failures.push({ name: file.name, reason: r.error || 'OCR 실패' }); failed++; return }
        const conf = r.confidence || 0
        if (conf < 70) { failures.push({ name: file.name, reason: `신뢰도 ${conf}% < 70%` }); failed++; return }
        const sv = await saveExtracted(r.extracted, conf, file.name)
        if (sv.duplicate) { duplicates++; return }
        if (!sv.ok) { failures.push({ name: file.name, reason: sv.error || '저장 실패' }); failed++; return }
        if (sv.auto) autoSaved++
        else reviewNeeded++
      }))
      setBulkProgress({
        running: !stopRef.current.stop,
        total,
        processed: 1 + Math.min(i + BATCH_SIZE, remaining.length),
        autoSaved, reviewNeeded, duplicates, failed, failures: [...failures],
      })
    }

    setBulkProgress(prev => prev ? { ...prev, running: false, autoSaved, reviewNeeded, duplicates, failed, failures: [...failures] } : null)
    await loadList()
  }

  const cancelBulk = () => { stopRef.current.stop = true }
  const dismissBulkProgress = () => setBulkProgress(null)

  const remove = async (id: string, label: string) => {
    if (!confirm(`「${label}」 보험계약을 삭제할까요?\n분담 정보 + 납입 스케줄도 모두 삭제됩니다.`)) return
    const { ok, json } = await fetchWithAuth(`/api/insurance?id=${id}`, { method: 'DELETE' })
    if (ok) await loadList()
    else alert(`삭제 실패: ${json?.error || '알 수 없는 오류'}`)
  }

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh' }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.textMuted, fontSize: 13 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24' }} />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} />
          <span style={{ marginLeft: 8 }}>재무/경영</span>
          <span>›</span>
          <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>보험 관리</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, marginTop: 8 }}>
          🛡️ 보험 관리
        </h1>
      </div>

      {/* 통계 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: '전체', value: stats.total || 0, tint: '#3b82f6', icon: '📊' },
          { label: '진행 중', value: stats.active || 0, tint: '#22c55e', icon: '✓' },
          { label: '만기 임박 (30일)', value: stats.expiring_soon || 0, tint: '#f59e0b', icon: '⚠️' },
          { label: '만기 지남', value: stats.expired || 0, tint: '#ef4444', icon: '⏰' },
          { label: '연 보험료', value: `${nf(totalAnnualPremium)}원`, tint: '#8b5cf6', icon: '💰' },
        ].map((s, i) => (
          <div key={i} style={{
            ...GLASS.L3,
            border: `1px solid ${s.tint}33`,
            borderRadius: 12, padding: 14,
          }}>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>
              {s.icon} {s.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.tint }}>
              {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* 액션 버튼 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLORS.textSecondary, cursor: 'pointer' }}>
          <input type="checkbox" checked={showReviewOnly} onChange={e => setShowReviewOnly(e.target.checked)} />
          검토 필요만 보기 (신뢰도 &lt;85% 또는 차량 미매칭)
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={openNew} style={{
          ...BTN.sm, padding: '8px 16px', fontSize: 13, fontWeight: 700,
          background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer',
        }}>
          + 보험 등록
        </button>
        <label style={{
          ...BTN.sm, padding: '8px 16px', fontSize: 13, fontWeight: 700,
          background: 'rgba(168,85,247,0.1)', color: '#7e22ce',
          border: '1px solid rgba(168,85,247,0.35)',
          cursor: (ocrLoading || bulkProgress?.running) ? 'wait' : 'pointer',
          opacity: (ocrLoading || bulkProgress?.running) ? 0.6 : 1, display: 'inline-block',
        }}>
          {ocrLoading ? '🤖 OCR 분석 중...' : '📤 청약서 OCR'}
          <input type="file" accept="application/pdf,image/*" disabled={ocrLoading || !!bulkProgress?.running}
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleOcrUpload(f)
              e.target.value = ''
            }}
          />
        </label>
        <label style={{
          ...BTN.sm, padding: '8px 16px', fontSize: 13, fontWeight: 700,
          background: 'rgba(236,72,153,0.1)', color: '#be185d',
          border: '1px solid rgba(236,72,153,0.35)',
          cursor: (ocrLoading || bulkProgress?.running) ? 'wait' : 'pointer',
          opacity: (ocrLoading || bulkProgress?.running) ? 0.6 : 1, display: 'inline-block',
        }}>
          📂 일괄 OCR (~50장)
          <input type="file" accept="application/pdf,image/*" multiple disabled={ocrLoading || !!bulkProgress?.running}
            style={{ display: 'none' }}
            onChange={(e) => {
              const fs = e.target.files
              if (fs && fs.length > 0) handleBulkUpload(fs)
              e.target.value = ''
            }}
          />
        </label>
        </div>
      </div>

      {/* 목록 */}
      <div style={{ ...GLASS.L4, border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12, overflow: 'auto' }}>
        {loading && <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>불러오는 중...</div>}
        {!loading && list.length === 0 && (
          <div style={{ padding: 60, textAlign: 'center', color: COLORS.textMuted }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🛡️</div>
            <div>등록된 보험계약이 없습니다</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>+ 보험 등록 버튼으로 시작하세요</div>
          </div>
        )}
        {!loading && list.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'rgba(0,0,0,0.02)' }}>
              <tr>
                {['보험사', '증권/설계번호', '차종', '기간', '차량수', '총 보험료', '납입방식', '다음 납입', '관리'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: COLORS.textSecondary, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list
                .filter((row: any) => {
                  if (!showReviewOnly) return true
                  const conf = row.ocr_confidence != null ? Number(row.ocr_confidence) : null
                  const lowConfidence = conf !== null && conf < 85
                  const hasUnmatched = Number(row.unmatched_count || 0) > 0
                  return lowConfidence || hasUnmatched
                })
                .map((row: any) => {
                const today = new Date().toISOString().slice(0, 10)
                const isExpired = row.end_date && String(row.end_date).slice(0, 10) < today
                const isExpiringSoon = !isExpired && row.end_date && new Date(row.end_date).getTime() - Date.now() < 30 * 86400 * 1000
                const conf = row.ocr_confidence != null ? Number(row.ocr_confidence) : null
                const needsReview = (conf !== null && conf < 85) || Number(row.unmatched_count || 0) > 0
                return (
                  <tr key={row.id} style={{
                    borderTop: '1px solid rgba(0,0,0,0.04)', cursor: 'pointer',
                    background: needsReview ? 'rgba(245,158,11,0.06)' : undefined,
                  }}
                      onClick={() => openEdit(row.id)}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: COLORS.textPrimary }}>
                      {row.insurance_company}
                      {needsReview && (
                        <span style={{ marginLeft: 6, ...pillStyle('warning'), fontSize: 10, padding: '1px 6px' }}>
                          {conf !== null && conf < 85 ? `검토 ${conf}%` : '차량 미매칭'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', color: COLORS.textSecondary, fontFamily: 'monospace', fontSize: 11 }}>
                      {row.policy_number || row.design_number || '-'}
                    </td>
                    <td style={{ padding: '10px 12px', color: COLORS.textSecondary }}>
                      {row.vehicle_class || '-'}
                    </td>
                    <td style={{ padding: '10px 12px', color: COLORS.textSecondary, fontSize: 12 }}>
                      {String(row.start_date || '').slice(0, 10)} ~ {String(row.end_date || '').slice(0, 10)}
                      {isExpired && <span style={{ marginLeft: 6, ...pillStyle('danger'), fontSize: 10, padding: '1px 6px' }}>만기</span>}
                      {isExpiringSoon && <span style={{ marginLeft: 6, ...pillStyle('warning'), fontSize: 10, padding: '1px 6px' }}>임박</span>}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {Number(row.vehicle_count || 0)}대
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                      {nf(row.total_premium)}원
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {row.payment_type === 'installment'
                        ? <span style={{ ...pillStyle('info'), fontSize: 10, padding: '1px 6px' }}>분할 {row.installment_count}회</span>
                        : <span style={{ ...pillStyle('neutral'), fontSize: 10, padding: '1px 6px' }}>일시납</span>}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12 }}>
                      {row.next_due_date
                        ? <span>{String(row.next_due_date).slice(0, 10)}<br /><span style={{ color: COLORS.textMuted }}>{nf(row.next_due_amount)}원</span></span>
                        : <span style={{ color: COLORS.textMuted }}>완료</span>}
                    </td>
                    <td style={{ padding: '10px 12px' }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openEdit(row.id)} style={{
                        ...BTN.sm, padding: '4px 10px', fontSize: 11,
                        background: 'rgba(59,130,246,0.1)', color: '#1d4ed8',
                        border: '1px solid rgba(59,130,246,0.35)',
                        cursor: 'pointer', marginRight: 4,
                      }}>수정</button>
                      <button onClick={() => remove(row.id, `${row.insurance_company} ${row.policy_number || ''}`)} style={{
                        ...BTN.sm, padding: '4px 10px', fontSize: 11,
                        background: 'rgba(239,68,68,0.1)', color: '#b91c1c',
                        border: '1px solid rgba(239,68,68,0.35)',
                        cursor: 'pointer',
                      }}>삭제</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 등록/수정 모달 */}
      {showModal && (
        <InsuranceFormModal
          contractId={editingId}
          cars={cars}
          prefill={prefilledData}
          onClose={() => { setShowModal(false); setEditingId(null); setPrefilledData(null) }}
          onSaved={() => { setShowModal(false); setEditingId(null); setPrefilledData(null); loadList() }}
        />
      )}

      {/* Bulk OCR — Dry-run 확인 모달 */}
      {bulkDryRun && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ ...GLASS.L4, borderRadius: 16, padding: 24, maxWidth: 720, width: '100%', maxHeight: '85vh', overflow: 'auto' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>🔍 첫 파일 OCR 결과 — 진행 확인</h3>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 }}>
              파일: <b>{bulkDryRun.firstFileName}</b> &nbsp;·&nbsp;
              총 <b>{bulkDryRun.files.length}장</b> 선택됨 (이 1장은 이미 처리됨, 나머지 {bulkDryRun.files.length - 1}장 진행 예정)
            </div>
            <div style={{ ...GLASS.L3, padding: 12, borderRadius: 10, marginBottom: 12, fontSize: 12 }}>
              <div><b>신뢰도:</b> {bulkDryRun.firstResult.confidence}%</div>
              <div><b>보험사:</b> {bulkDryRun.firstResult.extracted?.insurance_company || '-'}</div>
              <div><b>설계번호:</b> {bulkDryRun.firstResult.extracted?.design_number || '-'}</div>
              <div><b>차종:</b> {bulkDryRun.firstResult.extracted?.vehicle_class || '-'}</div>
              <div><b>기간:</b> {bulkDryRun.firstResult.extracted?.start_date} ~ {bulkDryRun.firstResult.extracted?.end_date}</div>
              <div><b>총 보험료:</b> {nf(bulkDryRun.firstResult.extracted?.total_premium)}원</div>
              <div><b>차량:</b> {(bulkDryRun.firstResult.extracted?.vehicles || []).length}대</div>
              <div><b>분납:</b> {(bulkDryRun.firstResult.extracted?.schedules || []).length}회</div>
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 16 }}>
              · 신뢰도 ≥85% → 자동 저장<br />
              · 70~84% → 자동 저장 (검토 필요 노란 플래그)<br />
              · &lt;70% → 실패 큐 (수동 처리)<br />
              · 병렬 3건씩 처리, 중지 가능
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setBulkDryRun(null)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, color: COLORS.textSecondary, cursor: 'pointer' }}>
                취소
              </button>
              <button onClick={proceedBulk} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: '#be185d', color: '#fff', border: 'none', cursor: 'pointer' }}>
                {bulkDryRun.files.length}장 일괄 처리 시작
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk OCR 진행 패널 */}
      {bulkProgress && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 1100,
          ...GLASS.L4, borderRadius: 12,
          border: `1px solid ${bulkProgress.running ? 'rgba(236,72,153,0.4)' : 'rgba(34,197,94,0.4)'}`,
          padding: 16, minWidth: 320, maxWidth: 400, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 13, color: bulkProgress.running ? '#be185d' : '#15803d' }}>
              {bulkProgress.running
                ? `🤖 OCR 처리 중... ${bulkProgress.processed}/${bulkProgress.total}`
                : `✓ OCR 완료 — ${bulkProgress.processed}/${bulkProgress.total}`}
            </strong>
            {!bulkProgress.running && (
              <button onClick={dismissBulkProgress} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
            )}
          </div>
          <div style={{ height: 6, background: 'rgba(0,0,0,0.05)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{
              width: `${(bulkProgress.processed / Math.max(1, bulkProgress.total)) * 100}%`,
              height: '100%',
              background: bulkProgress.running ? 'linear-gradient(90deg, #ec4899, #be185d)' : '#22c55e',
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, gap: 8, flexWrap: 'wrap' }}>
            <span>자동 <b style={{ color: '#15803d' }}>{bulkProgress.autoSaved}</b></span>
            <span>검토 <b style={{ color: '#d97706' }}>{bulkProgress.reviewNeeded}</b></span>
            <span>중복 <b style={{ color: '#6366f1' }}>{bulkProgress.duplicates}</b></span>
            <span>실패 <b style={{ color: '#dc2626' }}>{bulkProgress.failed}</b></span>
          </div>
          {bulkProgress.running && (
            <button onClick={cancelBulk} style={{
              width: '100%', marginTop: 8, padding: '6px', fontSize: 12, fontWeight: 600,
              background: '#fff', border: `1px solid ${COLORS.borderSubtle}`,
              color: COLORS.textSecondary, borderRadius: 6, cursor: 'pointer',
            }}>중지</button>
          )}
          {!bulkProgress.running && bulkProgress.failures.length > 0 && (
            <details style={{ marginTop: 10, fontSize: 11 }}>
              <summary style={{ cursor: 'pointer', color: '#dc2626', fontWeight: 600 }}>
                실패 {bulkProgress.failures.length}건 보기
              </summary>
              <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 6, padding: 6, background: 'rgba(239,68,68,0.05)', borderRadius: 6 }}>
                {bulkProgress.failures.map((f, i) => (
                  <div key={i} style={{ marginBottom: 4 }}>
                    <div style={{ fontWeight: 600, color: COLORS.textPrimary }}>{f.name}</div>
                    <div style={{ color: COLORS.textMuted, fontSize: 10 }}>{f.reason}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// 등록/수정 모달
// ═══════════════════════════════════════════════════════════════════

function InsuranceFormModal({ contractId, cars, prefill, onClose, onSaved }: {
  contractId: string | null
  cars: Car[]
  prefill?: any
  onClose: () => void
  onSaved: () => void
}) {
  const [contract, setContract] = useState(prefill?.contract || {
    insurance_company: '전국렌터카공제조합',
    policy_number: '',
    design_number: '',
    vehicle_class: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10),
    total_premium: 0,
    contract_type: 'individual' as 'individual' | 'fleet',
    payment_type: 'lump' as 'lump' | 'installment',
    installment_count: 1,
    memo: '',
  })
  const [allocations, setAllocations] = useState<Allocation[]>(prefill?.allocations || [])
  const [schedules, setSchedules] = useState<Schedule[]>(prefill?.schedules || [])
  const [saving, setSaving] = useState(false)
  const ocrConfidence = prefill?.confidence ?? null

  // 수정 모드 — 데이터 로드
  useEffect(() => {
    if (!contractId) return
    fetchWithAuth(`/api/insurance?id=${contractId}`).then(({ json }) => {
      if (!json?.data) return
      const c = json.data.contract
      setContract({
        insurance_company: c.insurance_company || '',
        policy_number: c.policy_number || '',
        design_number: c.design_number || '',
        vehicle_class: c.vehicle_class || '',
        start_date: String(c.start_date || '').slice(0, 10),
        end_date: String(c.end_date || '').slice(0, 10),
        total_premium: Number(c.total_premium || 0),
        contract_type: (c.contract_type === 'fleet' ? 'fleet' : 'individual'),
        payment_type: (c.payment_type === 'installment' ? 'installment' : 'lump'),
        installment_count: Number(c.installment_count || 1),
        memo: c.memo || '',
      })
      setAllocations((json.data.allocations || []).map((a: any) => ({
        car_id: a.car_id,
        vin: a.vin,
        vehicle_label: a.vehicle_label || (a.car_number ? `${a.car_number}${a.car_model ? ` (${a.car_model})` : ''}` : null),
        premium_amount: Number(a.premium_amount || 0),
        coverage_note: a.coverage_note,
      })))
      setSchedules((json.data.schedules || []).map((s: any) => ({
        installment_no: Number(s.installment_no),
        due_date: String(s.due_date || '').slice(0, 10),
        amount: Number(s.amount || 0),
      })))
    })
  }, [contractId])

  // 차량 분담 합계
  const allocSum = useMemo(() => allocations.reduce((s, a) => s + (Number(a.premium_amount) || 0), 0), [allocations])
  const scheduleSum = useMemo(() => schedules.reduce((s, x) => s + (Number(x.amount) || 0), 0), [schedules])
  const allocBalance = contract.total_premium - allocSum
  const scheduleBalance = contract.total_premium - scheduleSum

  // N등분 계산
  const splitEvenly = () => {
    if (allocations.length === 0 || contract.total_premium <= 0) return
    const each = Math.floor(contract.total_premium / allocations.length)
    const remainder = contract.total_premium - each * allocations.length
    setAllocations(allocations.map((a, i) => ({
      ...a,
      premium_amount: i === 0 ? each + remainder : each,
    })))
  }

  // 분납 스케줄 자동 생성
  const generateSchedule = () => {
    const n = contract.payment_type === 'lump' ? 1 : Math.max(1, contract.installment_count)
    const each = Math.floor(contract.total_premium / n)
    const remainder = contract.total_premium - each * n
    const start = new Date(contract.start_date)
    const newSchedules: Schedule[] = []
    for (let i = 0; i < n; i++) {
      const d = new Date(start)
      d.setMonth(d.getMonth() + i)
      newSchedules.push({
        installment_no: i + 1,
        due_date: d.toISOString().slice(0, 10),
        amount: i === 0 ? each + remainder : each,
      })
    }
    setSchedules(newSchedules)
  }

  // 차량 추가
  const addAllocation = (carId: string) => {
    if (allocations.find(a => a.car_id === carId)) return
    const car = cars.find(c => c.id === carId)
    setAllocations([...allocations, {
      car_id: carId,
      vin: car?.vin || null,
      vehicle_label: car ? `${car.number}${car.brand || car.model ? ` (${car.brand || ''} ${car.model || ''})`.trim() : ''}` : null,
      premium_amount: 0,
    }])
  }

  const removeAllocation = (i: number) => {
    setAllocations(allocations.filter((_, idx) => idx !== i))
  }

  const updateAllocation = (i: number, patch: Partial<Allocation>) => {
    setAllocations(allocations.map((a, idx) => idx === i ? { ...a, ...patch } : a))
  }

  const updateSchedule = (i: number, patch: Partial<Schedule>) => {
    setSchedules(schedules.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }

  const save = async () => {
    if (!contract.insurance_company) { alert('보험사 입력'); return }
    if (contract.total_premium <= 0) { alert('총 보험료 입력'); return }
    if (allocations.length === 0) { alert('차량 최소 1대 추가'); return }
    if (Math.abs(allocBalance) > 1) { alert(`차량 분담 합계 불일치: 차이 ${nf(allocBalance)}원`); return }
    if (schedules.length > 0 && Math.abs(scheduleBalance) > 1) {
      alert(`스케줄 합계 불일치: 차이 ${nf(scheduleBalance)}원`); return
    }

    setSaving(true)
    try {
      const body = { contract, allocations, schedules }
      const url = contractId ? `/api/insurance?id=${contractId}` : '/api/insurance'
      const method = contractId ? 'PATCH' : 'POST'
      const { ok, json } = await fetchWithAuth(url, { method, body })
      if (ok) onSaved()
      else alert(`저장 실패: ${json?.error || '알 수 없는 오류'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...GLASS.L4, borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
        width: '100%', maxWidth: 900, maxHeight: '90vh', overflow: 'auto', padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>
            {contractId ? '보험 수정' : prefill ? '🤖 OCR 결과 검토 후 등록' : '보험 등록'}
            {ocrConfidence !== null && (
              <span style={{
                marginLeft: 10, fontSize: 11, fontWeight: 600,
                padding: '2px 8px', borderRadius: 6,
                background: ocrConfidence >= 80 ? 'rgba(34,197,94,0.15)' : ocrConfidence >= 60 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                color: ocrConfidence >= 80 ? '#15803d' : ocrConfidence >= 60 ? '#b45309' : '#b91c1c',
              }}>OCR 신뢰도 {ocrConfidence}%</span>
            )}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: COLORS.textMuted }}>×</button>
        </div>

        {/* 계약 기본정보 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <Field label="보험사 *">
            <select value={contract.insurance_company}
              onChange={e => setContract({ ...contract, insurance_company: e.target.value })}
              style={inputStyle}>
              {COMMON_INSURERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="증권번호">
            <input value={contract.policy_number}
              onChange={e => setContract({ ...contract, policy_number: e.target.value })}
              style={inputStyle} placeholder="예: ABC123" />
          </Field>
          <Field label="설계번호 (KRMA 등)">
            <input value={contract.design_number}
              onChange={e => setContract({ ...contract, design_number: e.target.value })}
              style={inputStyle} placeholder="예: A1112601199701" />
          </Field>
          <Field label="차종 (청약서 표기)">
            <input value={contract.vehicle_class}
              onChange={e => setContract({ ...contract, vehicle_class: e.target.value })}
              style={inputStyle} placeholder="예: EV6 소형A" />
          </Field>
          <Field label="시작일 *">
            <input type="date" value={contract.start_date}
              onChange={e => setContract({ ...contract, start_date: e.target.value })}
              style={inputStyle} />
          </Field>
          <Field label="종료일 *">
            <input type="date" value={contract.end_date}
              onChange={e => setContract({ ...contract, end_date: e.target.value })}
              style={inputStyle} />
          </Field>
          <Field label="총 보험료 *">
            <input type="number" value={contract.total_premium || ''}
              onChange={e => setContract({ ...contract, total_premium: Number(e.target.value) || 0 })}
              style={inputStyle} placeholder="예: 1855410" />
          </Field>
          <Field label="계약 형태">
            <select value={contract.contract_type}
              onChange={e => setContract({ ...contract, contract_type: e.target.value as any })}
              style={inputStyle}>
              <option value="individual">차량별 (단독)</option>
              <option value="fleet">단체 (다중 차량)</option>
            </select>
          </Field>
          <Field label="납입 방식">
            <select value={contract.payment_type}
              onChange={e => setContract({ ...contract, payment_type: e.target.value as any })}
              style={inputStyle}>
              <option value="lump">일시납</option>
              <option value="installment">분할납</option>
            </select>
          </Field>
          {contract.payment_type === 'installment' && (
            <Field label="분할 횟수">
              <input type="number" min={2} max={12} value={contract.installment_count}
                onChange={e => setContract({ ...contract, installment_count: Number(e.target.value) || 1 })}
                style={inputStyle} />
            </Field>
          )}
        </div>

        {/* 차량 분담 */}
        <div style={{ marginBottom: 16, padding: 12, ...GLASS.L3, borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <strong>차량 분담</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <select onChange={e => { if (e.target.value) { addAllocation(e.target.value); e.target.value = '' } }}
                style={{ ...inputStyle, width: 200, padding: '4px 8px' }}>
                <option value="">+ 차량 추가</option>
                {cars.filter(c => !allocations.find(a => a.car_id === c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.number} ({c.brand} {c.model})</option>
                ))}
              </select>
              <button onClick={splitEvenly} disabled={allocations.length === 0 || contract.total_premium === 0}
                style={{ ...BTN.sm, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                N등분 자동
              </button>
            </div>
          </div>
          {allocations.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
              + 차량 추가 드롭다운으로 시작하세요
            </div>
          )}
          {allocations.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center', fontSize: 12 }}>
              <span style={{ flex: 1, color: COLORS.textPrimary }}>
                {a.vehicle_label || a.car_id || a.vin}
              </span>
              <input type="number" value={a.premium_amount || ''}
                onChange={e => updateAllocation(i, { premium_amount: Number(e.target.value) || 0 })}
                style={{ ...inputStyle, width: 130, padding: '4px 8px' }}
                placeholder="분담액" />
              <input value={a.coverage_note || ''}
                onChange={e => updateAllocation(i, { coverage_note: e.target.value })}
                style={{ ...inputStyle, width: 200, padding: '4px 8px' }}
                placeholder="담보 메모" />
              <button onClick={() => removeAllocation(i)} style={{
                ...BTN.sm, padding: '4px 8px', fontSize: 11,
                background: 'rgba(239,68,68,0.1)', color: '#b91c1c',
                border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer',
              }}>×</button>
            </div>
          ))}
          {allocations.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: Math.abs(allocBalance) > 1 ? '#dc2626' : '#15803d' }}>
              합계: {nf(allocSum)}원 / 총보험료: {nf(contract.total_premium)}원 — {Math.abs(allocBalance) > 1 ? `차이 ${nf(allocBalance)}원` : '✓ 일치'}
            </div>
          )}
        </div>

        {/* 납입 스케줄 */}
        <div style={{ marginBottom: 16, padding: 12, ...GLASS.L3, borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <strong>납입 스케줄</strong>
            <button onClick={generateSchedule} disabled={contract.total_premium === 0}
              style={{ ...BTN.sm, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
              자동 생성
            </button>
          </div>
          {schedules.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
              자동 생성 버튼으로 회차 생성 (수동 편집 가능)
            </div>
          )}
          {schedules.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center', fontSize: 12 }}>
              <span style={{ width: 50, color: COLORS.textSecondary }}>{s.installment_no}회</span>
              <input type="date" value={s.due_date}
                onChange={e => updateSchedule(i, { due_date: e.target.value })}
                style={{ ...inputStyle, width: 150, padding: '4px 8px' }} />
              <input type="number" value={s.amount || ''}
                onChange={e => updateSchedule(i, { amount: Number(e.target.value) || 0 })}
                style={{ ...inputStyle, flex: 1, padding: '4px 8px' }}
                placeholder="금액" />
            </div>
          ))}
          {schedules.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: Math.abs(scheduleBalance) > 1 ? '#dc2626' : '#15803d' }}>
              합계: {nf(scheduleSum)}원 — {Math.abs(scheduleBalance) > 1 ? `차이 ${nf(scheduleBalance)}원` : '✓ 일치'}
            </div>
          )}
        </div>

        {/* 메모 */}
        <Field label="메모">
          <textarea value={contract.memo}
            onChange={e => setContract({ ...contract, memo: e.target.value })}
            rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </Field>

        {/* 액션 */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} disabled={saving} style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 13,
            background: '#fff', border: `1px solid ${COLORS.borderSubtle}`,
            color: COLORS.textSecondary, cursor: 'pointer',
          }}>취소</button>
          <button onClick={save} disabled={saving} style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: COLORS.primary, color: '#fff', border: 'none',
            cursor: saving ? 'wait' : 'pointer',
          }}>{saving ? '저장 중...' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
  border: `1px solid ${COLORS.borderSubtle}`,
  background: 'rgba(255,255,255,0.6)',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  )
}
