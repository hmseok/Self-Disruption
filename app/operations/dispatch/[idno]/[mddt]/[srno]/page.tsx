'use client'

import { useState, useEffect, useCallback, useRef, use, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GLASS } from '@/app/utils/ui-tokens'
import type {
  DispatchRequestRow,
  Consultation,
  ConsultationCategory,
  Cafe24Memo,
  ResultMsg,
  DispatchOrder,
} from '@/app/operations/intake/types'
import { CATEGORY_META, describeAccidentTypes, fmtCafe24DateTime } from '@/app/operations/intake/types'

// ═══════════════════════════════════════════════════════════════════
// /operations/dispatch/[idno]/[mddt]/[srno] — PR-OPS-1.5c
//
// 대차접수 상세페이지 (P1.5b 풀스크린 모달 대체).
// 사용자 명시: 「모달 한계 — 상세페이지 구성으로 보는 것이 좋을 듯, 상담 구성 약함」
//
// 구조:
//   ┌─ MAIN (2/3) ─────────────────────────┐ ┌─ SIDE (1/3) ─┐
//   │ A 대차요청 정보 (잔디 메시지 형식)     │ │ 상태 배지     │
//   │ B 콜센터 메모 timeline               │ │ 대차업체      │
//   │ C 상담 히스토리 (큰 영역)            │ │ 차량 마스터   │
//   │ D 새 상담 입력 (큰 textarea + 카테고리)│ │ 상대차량      │
//   │ E dispatch_order (status/일정/배차)   │ │ 등록자        │
//   └──────────────────────────────────────┘ └─────────────┘
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

function fmtIsoShort(iso: string): string {
  try {
    const d = new Date(iso)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${mm}-${dd} ${hh}:${mi}`
  } catch { return iso.slice(0, 16) }
}

function fmtIsoFull(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
  } catch { return iso.slice(0, 16) }
}

function rideAccidentIdFromIdno(idno: string): number {
  return parseInt(String(idno).replace(/[^0-9]/g, '').slice(0, 9) || '0', 10)
}

const DISPATCH_STATUS_LABEL: Record<DispatchOrder['status'], string> = {
  new: '🆕 신규',
  consulting: '📞 상담중',
  scheduled: '📅 배차예정',
  dispatched: '🚐 배차완료',
  done: '✅ 종결',
  cancelled: '✗ 취소',
}

export default function DispatchDetailPage({
  params,
}: {
  params: Promise<{ idno: string; mddt: string; srno: string }>
}) {
  const { idno, mddt, srno } = use(params)
  const router = useRouter()
  const rideAccidentId = useMemo(() => rideAccidentIdFromIdno(idno), [idno])

  // ── 대차접수 row ──
  const [row, setRow] = useState<DispatchRequestRow | null>(null)
  const [rowLoading, setRowLoading] = useState(true)
  const [rowError, setRowError] = useState<string | null>(null)

  // ── 콜센터 메모 ──
  const [memos, setMemos] = useState<Cafe24Memo[]>([])
  const [memosLoading, setMemosLoading] = useState(true)

  // ── dispatch_order ──
  const [dispatchOrder, setDispatchOrder] = useState<DispatchOrder | null>(null)
  const [orderLoading, setOrderLoading] = useState(true)
  const [expDispatch, setExpDispatch] = useState('')
  const [expReturn, setExpReturn] = useState('')
  const [status, setStatus] = useState<DispatchOrder['status']>('consulting')
  const [busy, setBusy] = useState(false)

  // ── 상담 ──
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [consultationsErr, setConsultationsErr] = useState<string | null>(null)
  const [migrationPending, setMigrationPending] = useState(false)
  const [consultationsLoading, setConsultationsLoading] = useState(false)

  // ── 새 상담 입력 ──
  const [newNote, setNewNote] = useState('')
  const [newCategory, setNewCategory] = useState<ConsultationCategory>('followup')
  const [posting, setPosting] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement | null>(null)

  // ── 공통 결과 토스트 ──
  const [resultMsg, setResultMsg] = useState<ResultMsg | null>(null)
  const showResult = (msg: ResultMsg) => {
    setResultMsg(msg)
    setTimeout(() => setResultMsg(null), 5000)
  }

  // ── Fetch row (cafe24 dispatch-requests — 키로 1건 lookup) ──
  const fetchRow = useCallback(async () => {
    setRowLoading(true)
    setRowError(null)
    try {
      const headers = await getAuthHeader()
      // 시간 범위 좁혀서 1건 매칭 — mddt 같은 범위
      const params = new URLSearchParams({
        from: mddt,
        to: mddt,
        limit: '200',
      })
      const res = await fetch(`/api/operations/cafe24-dispatch-requests?${params}`, { headers })
      const json = await res.json().catch(() => ({}))
      const list: DispatchRequestRow[] = Array.isArray(json?.data) ? json.data : []
      const found = list.find((r) => r.otptidno === idno && r.otptmddt === mddt && String(r.otptsrno) === srno) || null
      if (found) {
        setRow(found)
      } else {
        setRow(null)
        setRowError('해당 대차접수 데이터를 찾을 수 없습니다 (cafe24 측 row 부재)')
      }
    } catch (e: any) {
      setRowError(e?.message || 'fetch 실패')
    } finally {
      setRowLoading(false)
    }
  }, [idno, mddt, srno])

  const fetchMemos = useCallback(async () => {
    setMemosLoading(true)
    try {
      const params = new URLSearchParams({ idno, mddt, srno })
      const headers = await getAuthHeader()
      const res = await fetch(`/api/cafe24/accidents/memos?${params}`, { headers })
      const json = await res.json().catch(() => ({}))
      setMemos((json?.success && Array.isArray(json.data)) ? json.data : [])
    } catch {
      setMemos([])
    } finally {
      setMemosLoading(false)
    }
  }, [idno, mddt, srno])

  const fetchOrder = useCallback(async () => {
    setOrderLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/operations/dispatch-orders', { headers })
      const json = await res.json().catch(() => ({}))
      const orders: DispatchOrder[] = Array.isArray(json?.data) ? json.data : []
      const found = orders.find((o) => o.ride_accident_id === rideAccidentId) || null
      setDispatchOrder(found)
      if (found) {
        setExpDispatch(found.expected_dispatch_date || '')
        setExpReturn(found.expected_return_date || '')
        setStatus(found.status)
      }
    } finally {
      setOrderLoading(false)
    }
  }, [rideAccidentId])

  const fetchConsultations = useCallback(async () => {
    if (!dispatchOrder?.id) {
      setConsultations([])
      return
    }
    setConsultationsLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/operations/consultations?dispatch_order_id=${dispatchOrder.id}`, { headers })
      const json = await res.json().catch(() => ({}))
      if (json?._migration_pending) {
        setMigrationPending(true)
        setConsultations([])
        setConsultationsErr(null)
      } else if (json?.error) {
        setConsultationsErr(json.error)
        setConsultations([])
      } else {
        setConsultations((json?.data || []) as Consultation[])
        setConsultationsErr(null)
        setMigrationPending(false)
      }
    } catch (e: any) {
      setConsultationsErr(e?.message || 'consultations 호출 실패')
    } finally {
      setConsultationsLoading(false)
    }
  }, [dispatchOrder?.id])

  useEffect(() => { fetchRow(); fetchMemos(); fetchOrder() }, [fetchRow, fetchMemos, fetchOrder])
  useEffect(() => { fetchConsultations() }, [fetchConsultations])
  useEffect(() => {
    if (dispatchOrder?.id) setTimeout(() => noteRef.current?.focus(), 150)
  }, [dispatchOrder?.id])

  // ── 새 상담 POST ──
  const submitConsultation = useCallback(async () => {
    if (!dispatchOrder?.id) return showResult({ type: 'err', text: '먼저 dispatch_order 저장 후 상담 추가' })
    const note = newNote.trim()
    if (!note) return showResult({ type: 'err', text: '상담 내용을 입력하세요' })
    if (note.length > 5000) return showResult({ type: 'err', text: '5000자 이내' })
    setPosting(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch('/api/operations/consultations', {
        method: 'POST',
        headers,
        body: JSON.stringify({ dispatch_order_id: dispatchOrder.id, note, category: newCategory }),
      })
      const json = await res.json().catch(() => ({}))
      if (json?._migration_pending) {
        setMigrationPending(true)
        return showResult({ type: 'err', text: 'consultations 테이블 미적용' })
      }
      if (json?.error) return showResult({ type: 'err', text: json.error })
      const newRow: Consultation = {
        id: json.id,
        dispatch_order_id: json.dispatch_order_id,
        note: json.note,
        category: json.category,
        created_at: json.created_at,
        created_by: json.created_by ?? null,
      }
      setConsultations((prev) => [newRow, ...prev])
      setNewNote('')
      showResult({ type: 'ok', text: '상담 추가 완료' })
      setTimeout(() => noteRef.current?.focus(), 50)
    } catch (e: any) {
      showResult({ type: 'err', text: e?.message || '상담 추가 실패' })
    } finally {
      setPosting(false)
    }
  }, [dispatchOrder?.id, newNote, newCategory])

  const saveOrder = async () => {
    if (busy) return
    setBusy(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      if (dispatchOrder) {
        const res = await fetch(`/api/operations/dispatch-orders/${dispatchOrder.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            expected_dispatch_date: expDispatch || null,
            expected_return_date: expReturn || null,
            status,
          }),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        showResult({ type: 'ok', text: 'dispatch_order 수정 완료' })
        await fetchOrder()
      } else {
        const res = await fetch('/api/operations/dispatch-orders', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ride_accident_id: rideAccidentId,
            expected_dispatch_date: expDispatch || null,
            expected_return_date: expReturn || null,
            status,
          }),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        showResult({ type: 'ok', text: 'dispatch_order 신설 완료 — 이제 상담 추가 가능' })
        await fetchOrder()
      }
    } catch (e: any) {
      showResult({ type: 'err', text: e?.message || '저장 실패' })
    } finally {
      setBusy(false)
    }
  }

  const confirmDispatch = async () => {
    if (!dispatchOrder || !row) return
    if (!window.confirm('배차 확정 시 fmi_rentals 신규 row 가 생성됩니다. 진행할까요?')) return
    setBusy(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/operations/dispatch-orders/${dispatchOrder.id}/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer_name: row.cars_user || row.otptcanm,
          customer_phone: row.otptcahp,
          customer_car_number: row.cars_no,
          insurance_company: row.otpttobm,
          insurance_claim_no: row.otpttobn || row.otptacbn,
          dispatch_date: expDispatch || new Date().toISOString().slice(0, 10),
          expected_return_date: expReturn || null,
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      showResult({ type: 'ok', text: `배차 확정 완료 — fmi_rental ${json.mode === 'create' ? '신설' : '갱신'}` })
      await fetchOrder()
    } catch (e: any) {
      showResult({ type: 'err', text: e?.message || '배차 확정 실패' })
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      submitConsultation()
    }
  }

  const accidentTypes = row ? describeAccidentTypes(row) : []
  const insuranceCompanyOther = row?.otpttobm || '미확인'
  const insuranceClaimOther = row?.otpttobn || '-'

  return (
    <div className="page-bg">
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f2440', margin: 0, whiteSpace: 'nowrap' }}>
              🚗 {row?.cars_no || row?.otptcanm || idno}
              <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginLeft: 8 }}>
                {row?.cars_model || ''}
              </span>
            </h1>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, whiteSpace: 'nowrap' }}>
              대차접수 · 접수 {fmtCafe24DateTime(row?.otptacdt || null, row?.otptactm || null)} ·
              {row?.rental_vendor && <span style={{ marginLeft: 6, color: '#0f2440', fontWeight: 700 }}>🏢 {row.rental_vendor}</span>}
              <span style={{ marginLeft: 6, color: '#94a3b8' }}>{idno}/{mddt}/{srno}</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => router.back()} style={ghostBtn}>← 목록</button>
            <button onClick={() => { fetchRow(); fetchMemos(); fetchOrder(); fetchConsultations() }} disabled={rowLoading} style={subtleBtn}>↻ 새로고침</button>
            <Link href={`/operations/accident/${idno}/${mddt}/${srno}`} style={{ ...secondaryBtn, textDecoration: 'none' }}>
              📋 사고접수 보기
            </Link>
          </div>
        </div>

        {/* Toast */}
        {resultMsg && (
          <div
            style={{
              marginBottom: 16,
              padding: 14,
              background: resultMsg.type === 'ok' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${resultMsg.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              color: resultMsg.type === 'ok' ? '#065f46' : '#991b1b',
            }}
          >
            {resultMsg.type === 'ok' ? '✅' : '⚠️'} {resultMsg.text}
          </div>
        )}

        {rowLoading ? (
          <Place>대차접수 정보 조회 중…</Place>
        ) : rowError || !row ? (
          <Place warn>⚠ {rowError || '데이터 없음'}</Place>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
            {/* MAIN COLUMN */}
            <div>
              {/* A. 대차요청 정보 (잔디 메시지 형식) */}
              <Section icon="📋" title="대차요청 정보 (잔디 메시지 형식)">
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px 1fr', gap: '8px 16px', fontSize: 12 }}>
                  <Lbl>*대차업체</Lbl>
                  <Val>{row.rental_vendor || '-'}{row.rental_hp ? ` (${row.rental_hp})` : ''}</Val>
                  <Lbl>*캐피탈사</Lbl>
                  <Val>{row.capital_co_name || row.capital_co_code || '-'}</Val>
                  <Lbl>*차량번호,차종</Lbl>
                  <Val span={3}>
                    <span style={{ fontWeight: 800 }}>{row.cars_no || '-'}</span>
                    {row.cars_model && <span style={{ marginLeft: 6, color: '#475569' }}>{row.cars_model}</span>}
                  </Val>
                  <Lbl>*접수일시</Lbl>
                  <Val>{fmtCafe24DateTime(row.otptacdt, row.otptactm) || '-'}</Val>
                  <Lbl>*고객명</Lbl>
                  <Val>{row.cars_user || '-'}</Val>
                  <Lbl>*통보자</Lbl>
                  <Val>{row.otptcanm || '-'}{row.otptcahp ? ` / ${row.otptcahp}` : ''}</Val>
                  <Lbl>*운전자</Lbl>
                  <Val>{row.otptdsnm || '-'}{row.otptdshp ? ` / ${row.otptdshp}` : ''}</Val>
                  <Lbl>*사고종류</Lbl>
                  <Val span={3}>
                    {accidentTypes.length > 0
                      ? accidentTypes.map((t: string) => (
                          <span key={t} style={{ display: 'inline-block', marginRight: 6, padding: '2px 8px', background: 'rgba(99,102,241,0.12)', color: '#4338ca', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{t}</span>
                        ))
                      : '-'}
                  </Val>
                  <Lbl>*사고내용</Lbl>
                  <Val span={3} preWrap>{row.otptacmo || '-'}</Val>
                  <Lbl>*사고위치</Lbl>
                  <Val span={3} preWrap>{row.otptacad || '-'}</Val>
                  <Lbl>*상대 보험사</Lbl>
                  <Val>{insuranceCompanyOther}</Val>
                  <Lbl>*상대 접수번호</Lbl>
                  <Val>{insuranceClaimOther}</Val>
                  {(row.otpttonm || row.otpttohp || row.otpttonu) && (
                    <>
                      <Lbl>*상대차량 운전자</Lbl>
                      <Val>{row.otpttonm || '-'}{row.otpttohp ? ` / ${row.otpttohp}` : ''}</Val>
                      <Lbl>*상대차량 번호</Lbl>
                      <Val>{row.otpttonu || '-'}{row.otpttomd ? ` (${row.otpttomd})` : ''}</Val>
                    </>
                  )}
                  <Lbl>*대차요청날짜</Lbl>
                  <Val>{row.rent_rsdt || '협의필요'}</Val>
                  <Lbl>*접수자</Lbl>
                  <Val>{row.gnus_name || row.otptgnus || '-'}</Val>
                </div>
              </Section>

              {/* B. 콜센터 메모 */}
              <Section icon="📞" title={`콜센터 메모 (${memos.length})`}>
                {memosLoading ? <Place>cafe24 메모 조회 중…</Place>
                  : memos.length === 0 ? <Place>콜센터 메모 없음</Place>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {memos.map((m) => (
                        <div
                          key={`${m.memosort}-${m.memonums}`}
                          style={{ ...GLASS.L3, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.04)', fontSize: 12 }}
                        >
                          <div style={{ display: 'flex', gap: 8, marginBottom: 4, color: '#64748b', fontSize: 11, whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 700 }}>#{m.memosort}-{m.memonums}</span>
                            <span>{fmtCafe24DateTime(m.memogndt, m.memogntm)}</span>
                            {m.memognus && <span>· {m.memognus}</span>}
                          </div>
                          {m.memotitl && <div style={{ fontWeight: 700, color: '#0f2440', marginBottom: 2 }}>{m.memotitl}</div>}
                          {m.memotext && <div style={{ color: '#1e293b', whiteSpace: 'pre-wrap' }}>{m.memotext}</div>}
                        </div>
                      ))}
                    </div>
                  )}
              </Section>

              {/* C+D. 상담 (히스토리 + 새 입력) — 큰 영역 */}
              <Section icon="💬" title={`상담 히스토리 (${consultations.length})`}>
                {orderLoading ? <Place>dispatch_order 확인 중…</Place>
                  : !dispatchOrder ? <Place warn>먼저 우측 「📅 배차 일정 / 상태」 에서 [💾 저장] 하면 상담 추가 가능합니다.</Place>
                  : migrationPending ? <Place warn>⚠ operations_consultations 테이블 미적용</Place>
                  : (
                    <>
                      {/* 상담 히스토리 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxHeight: 500, overflowY: 'auto' }}>
                        {consultationsErr && <Place warn>⚠ {consultationsErr}</Place>}
                        {consultations.length === 0 && !consultationsErr && (
                          <Place>상담 기록 없음 — 아래에서 첫 상담을 추가하세요</Place>
                        )}
                        {consultations.map((c) => {
                          const meta = CATEGORY_META[c.category] || CATEGORY_META.other
                          return (
                            <div
                              key={c.id}
                              style={{
                                padding: '10px 12px',
                                background: `${meta.tint}11`,
                                borderLeft: `4px solid ${meta.tint}`,
                                borderRadius: 8,
                                fontSize: 13,
                              }}
                            >
                              <div style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 11, alignItems: 'center', whiteSpace: 'nowrap' }}>
                                <span style={{ color: meta.tint, fontWeight: 800, padding: '2px 8px', background: '#fff', borderRadius: 6 }}>
                                  {meta.emoji} {meta.label}
                                </span>
                                <span style={{ color: '#64748b' }}>{fmtIsoFull(c.created_at)}</span>
                                {c.created_by && <span style={{ color: '#94a3b8' }}>· 👤 {c.created_by}</span>}
                              </div>
                              <div style={{ color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{c.note}</div>
                            </div>
                          )
                        })}
                      </div>

                      {/* 새 상담 입력 — 큰 영역 */}
                      <div style={{ borderTop: '1px dashed rgba(0,0,0,0.1)', paddingTop: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0f2440', marginBottom: 6 }}>✍️ 새 상담 추가</div>
                        <textarea
                          ref={noteRef}
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          onKeyDown={onKeyDown}
                          disabled={!dispatchOrder || migrationPending || posting}
                          placeholder="상담 내용을 입력하세요 (Ctrl/Cmd + Enter 로 전송)"
                          rows={5}
                          style={{
                            width: '100%',
                            padding: '12px 14px',
                            borderRadius: 10,
                            fontSize: 13,
                            color: '#1e293b',
                            ...GLASS.L1,
                            resize: 'vertical',
                            minHeight: 100,
                            lineHeight: 1.5,
                          }}
                        />
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, whiteSpace: 'nowrap' }}>카테고리:</span>
                          {(Object.keys(CATEGORY_META) as ConsultationCategory[]).map((k) => {
                            const meta = CATEGORY_META[k]
                            const active = newCategory === k
                            return (
                              <button
                                key={k}
                                onClick={() => setNewCategory(k)}
                                disabled={!dispatchOrder || migrationPending || posting}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 8,
                                  border: `1px solid ${active ? meta.tint : 'rgba(0,0,0,0.1)'}`,
                                  background: active ? meta.tint : 'transparent',
                                  color: active ? '#fff' : meta.tint,
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                  fontSize: 11,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {meta.emoji} {meta.label}
                              </button>
                            )
                          })}
                          <div style={{ flex: 1 }} />
                          <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{newNote.length}/5000</span>
                          <button
                            onClick={submitConsultation}
                            disabled={!dispatchOrder || migrationPending || posting || !newNote.trim()}
                            style={{
                              padding: '10px 18px',
                              background: (!dispatchOrder || migrationPending || posting || !newNote.trim())
                                ? '#94a3b8'
                                : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 10,
                              cursor: (!dispatchOrder || migrationPending || posting || !newNote.trim()) ? 'not-allowed' : 'pointer',
                              fontWeight: 800,
                              fontSize: 13,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            💬 상담 추가
                          </button>
                        </div>
                      </div>
                    </>
                  )}
              </Section>
            </div>

            {/* SIDE COLUMN */}
            <div>
              {/* E. dispatch_order */}
              <Section icon="📅" title="배차 일정 / 상태">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <SmallField label="상태">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as DispatchOrder['status'])}
                      style={inputStyle}
                    >
                      {(Object.keys(DISPATCH_STATUS_LABEL) as DispatchOrder['status'][]).map((k) => (
                        <option key={k} value={k}>{DISPATCH_STATUS_LABEL[k]}</option>
                      ))}
                    </select>
                  </SmallField>
                  <SmallField label="예상 배차일">
                    <input type="date" value={expDispatch} onChange={(e) => setExpDispatch(e.target.value)} style={inputStyle} />
                  </SmallField>
                  <SmallField label="예상 반납일">
                    <input type="date" value={expReturn} onChange={(e) => setExpReturn(e.target.value)} style={inputStyle} />
                  </SmallField>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button onClick={saveOrder} disabled={busy} style={{ ...primaryBtnFull, opacity: busy ? 0.5 : 1 }}>
                      💾 {dispatchOrder ? '수정' : '저장'}
                    </button>
                    {dispatchOrder && dispatchOrder.status !== 'dispatched' && dispatchOrder.status !== 'done' && (
                      <button onClick={confirmDispatch} disabled={busy} style={{ ...successBtnFull, opacity: busy ? 0.5 : 1 }}>
                        🚀 배차 확정
                      </button>
                    )}
                  </div>
                </div>
              </Section>

              {/* 사이드 정보 — 차량 마스터 */}
              <Section icon="🚗" title="차량 마스터">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <Row><Lbl>차량번호</Lbl><Val>{row.cars_no || '-'}</Val></Row>
                  <Row><Lbl>차종</Lbl><Val>{row.cars_model || '-'}</Val></Row>
                  <Row><Lbl>고객</Lbl><Val>{row.cars_user || '-'}</Val></Row>
                  <Row><Lbl>캐피탈사</Lbl><Val>{row.capital_co_name || row.capital_co_code || '-'}</Val></Row>
                </div>
              </Section>

              {/* 사이드 정보 — 대차업체 */}
              <Section icon="🏢" title="대차업체">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <Row><Lbl>업체명</Lbl><Val>{row.rental_vendor || '-'}</Val></Row>
                  <Row><Lbl>전화</Lbl><Val>{row.rental_hp || '-'}</Val></Row>
                  <Row><Lbl>코드</Lbl><Val>{row.rent_facd || '-'}</Val></Row>
                </div>
              </Section>

              {/* 사이드 정보 — 상대차량 */}
              {(row.otpttonm || row.otpttohp || row.otpttobm) && (
                <Section icon="🚙" title="상대차량">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                    {row.otpttonm && <Row><Lbl>운전자</Lbl><Val>{row.otpttonm}</Val></Row>}
                    {row.otpttohp && <Row><Lbl>전화</Lbl><Val>{row.otpttohp}</Val></Row>}
                    {row.otpttonu && <Row><Lbl>차량번호</Lbl><Val>{row.otpttonu}</Val></Row>}
                    {row.otpttomd && <Row><Lbl>차종</Lbl><Val>{row.otpttomd}</Val></Row>}
                    {row.otpttobm && <Row><Lbl>보험사</Lbl><Val>{row.otpttobm}</Val></Row>}
                    {row.otpttobn && <Row><Lbl>접수번호</Lbl><Val>{row.otpttobn}</Val></Row>}
                  </div>
                </Section>
              )}

              {/* 사이드 정보 — 등록자 */}
              <Section icon="👤" title="등록자">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <Row><Lbl>접수자</Lbl><Val>{row.gnus_name || row.otptgnus || '-'}</Val></Row>
                  <Row><Lbl>접수번호</Lbl><Val>{row.otptidno}/{row.otptmddt}/{row.otptsrno}</Val></Row>
                </div>
              </Section>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────
function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0f2440', margin: 0, whiteSpace: 'nowrap' }}>{icon} {title}</h3>
      </div>
      <div style={{ ...GLASS.L4, border: '1px solid rgba(0,0,0,0.05)', borderRadius: 12, padding: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Place({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return <div style={{ fontSize: 12, color: warn ? '#b45309' : '#94a3b8', padding: 4 }}>{children}</div>
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <span style={{ color: '#94a3b8', fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>
}

function Val({ children, span, preWrap }: { children: React.ReactNode; span?: number; preWrap?: boolean }) {
  return (
    <span style={{
      color: '#1e293b',
      fontWeight: 600,
      gridColumn: span ? `span ${span}` : undefined,
      whiteSpace: preWrap ? 'pre-wrap' : undefined,
    }}>{children}</span>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>{children}</div>
}

function SmallField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4, whiteSpace: 'nowrap' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  fontSize: 12,
  color: '#1e293b',
  ...GLASS.L1,
}

const subtleBtn: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 8,
  cursor: 'pointer',
  color: '#64748b',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const ghostBtn: React.CSSProperties = {
  ...subtleBtn,
  color: '#475569',
}

const secondaryBtn: React.CSSProperties = {
  display: 'inline-block',
  padding: '8px 14px',
  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 12,
  whiteSpace: 'nowrap',
}

const primaryBtnFull: React.CSSProperties = {
  flex: 1,
  padding: '10px 14px',
  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: 12,
  whiteSpace: 'nowrap',
}

const successBtnFull: React.CSSProperties = {
  flex: 1,
  padding: '10px 14px',
  background: 'linear-gradient(135deg, #10b981, #059669)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: 12,
  whiteSpace: 'nowrap',
}
