'use client'

import { useState, useEffect, useCallback, useRef, use, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { GLASS } from '@/app/utils/ui-tokens'
import type {
  DispatchRequestRow,
  Consultation,
  ConsultationCategory,
  Cafe24Memo,
  ResultMsg,
  DispatchOrder,
  AcrMemoRow,
  FactoryAssignmentRow,
  Cafe24SmsRow,
} from '@/app/operations/intake/types'
import { CATEGORY_META, describeAccidentTypes, fmtCafe24DateTime, fmtCafe24DateOnly, sanitizeSmsBody } from '@/app/operations/intake/types'

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

// 사용자 명시 (2026-05-16): 「공장 사업자번호는 이상한데」
// 한국 사업자등록번호 = 10자리 (xxx-xx-xxxxx). cafe24 에 10자리 초과 raw 가 들어있을 수 있어
// 숫자만 추출 후 10자리면 표준 포맷, 아니면 raw 표시.
function formatBizNo(raw: string | null | undefined): string {
  if (!raw) return '-'
  const digits = String(raw).replace(/[^0-9]/g, '')
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
  }
  // 비정상 길이 (사업자번호 외 데이터일 수도) — raw 표시
  return raw
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

  // ── ACR 사고처리관리 상담내역 (acrmemoh — P1.5f) ──
  const [acrMemos, setAcrMemos] = useState<AcrMemoRow[]>([])
  const [acrMemosLoading, setAcrMemosLoading] = useState(true)

  // ── 공장배정 (ajaoderh — P1.5f) ──
  const [factories, setFactories] = useState<FactoryAssignmentRow[]>([])
  const [factoriesLoading, setFactoriesLoading] = useState(true)

  // ── 문자 발송 이력 (crmsendh + crmsmsgh — PR-B3) ──
  const [sms, setSms] = useState<Cafe24SmsRow[]>([])
  const [smsLoading, setSmsLoading] = useState(true)

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
      // dcyn=all + rgst=all — 사고접수/대차접수 모든 row (취소 포함)
      const params = new URLSearchParams({
        from: mddt,
        to: mddt,
        limit: '200',
        dcyn: 'all',
        rgst: 'all',
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

  // P1.5f — ACR 사고처리관리 상담내역 (acrmemoh)
  const fetchAcrMemos = useCallback(async () => {
    setAcrMemosLoading(true)
    try {
      const params = new URLSearchParams({ idno, mddt, srno })
      const headers = await getAuthHeader()
      const res = await fetch(`/api/operations/cafe24-acr-memos?${params}`, { headers })
      const json = await res.json().catch(() => ({}))
      setAcrMemos((json?.success && Array.isArray(json.data)) ? json.data : [])
    } catch {
      setAcrMemos([])
    } finally {
      setAcrMemosLoading(false)
    }
  }, [idno, mddt, srno])

  // P1.5f — 공장배정 (ajaoderh + pmcfactm)
  const fetchFactories = useCallback(async () => {
    setFactoriesLoading(true)
    try {
      const params = new URLSearchParams({ idno, mddt, srno })
      const headers = await getAuthHeader()
      const res = await fetch(`/api/operations/cafe24-factory-assignment?${params}`, { headers })
      const json = await res.json().catch(() => ({}))
      setFactories((json?.success && Array.isArray(json.data)) ? json.data : [])
    } catch {
      setFactories([])
    } finally {
      setFactoriesLoading(false)
    }
  }, [idno, mddt, srno])

  // PR-B3 — 문자 발송 이력 + 발송문구 (crmsendh + crmsmsgh)
  const fetchSms = useCallback(async () => {
    setSmsLoading(true)
    try {
      const params = new URLSearchParams({ idno, mddt, srno })
      const headers = await getAuthHeader()
      const res = await fetch(`/api/operations/cafe24-sms-history?${params}`, { headers })
      const json = await res.json().catch(() => ({}))
      setSms((json?.success && Array.isArray(json.data)) ? json.data : [])
    } catch {
      setSms([])
    } finally {
      setSmsLoading(false)
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

  useEffect(() => {
    fetchRow(); fetchMemos(); fetchOrder()
    fetchAcrMemos(); fetchFactories(); fetchSms()
  }, [fetchRow, fetchMemos, fetchOrder, fetchAcrMemos, fetchFactories, fetchSms])
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
            // P2.1c-1: cafe24 키 같이 send
            cafe24_otpt_idno: idno,
            cafe24_otpt_mddt: mddt,
            cafe24_otpt_srno: parseInt(srno, 10),
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
        {/* Header — 사용자 명시 (2026-05-16): 「목록 새로고침은 좌측이 편한데」 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={() => router.back()} style={ghostBtn}>← 목록</button>
          <button onClick={() => { fetchRow(); fetchMemos(); fetchOrder(); fetchConsultations(); fetchAcrMemos(); fetchFactories(); fetchSms() }} disabled={rowLoading} style={subtleBtn}>↻ 새로고침</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f2440', margin: 0, whiteSpace: 'nowrap' }}>
            🚗 {row?.cars_no || row?.otptcanm || idno}
            <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginLeft: 8 }}>
              {row?.cars_model || ''}
            </span>
          </h1>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, whiteSpace: 'nowrap' }}>
            {row?.otptdcyn === 'Y' ? '🚗 대차접수' : '📋 사고접수'} · 접수 {fmtCafe24DateTime(row?.otptacdt || null, row?.otptactm || null)} ·
            {row?.rental_vendor && <span style={{ marginLeft: 6, color: '#0f2440', fontWeight: 700 }}>🏢 {row.rental_vendor}</span>}
            <span style={{ marginLeft: 6, color: '#94a3b8' }}>{idno}/{mddt}/{srno}</span>
          </p>
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
              {/* 차량 정보 — P2.1a-pivot-B2 (사용자 명시 2026-05-16):
                  「계약기간 차량등록일 등 차량 계약관련 내용도 추가되어 들어오면 좋겠어요」
                  → cafe24 pmccarsm 의 차대번호/계약번호/계약시작일/사용기간 추가 표출 */}
              <Section icon="🚗" title="차량 정보">
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px 1fr', gap: '8px 16px', fontSize: 13 }}>
                  <Lbl>차량번호</Lbl>
                  <Val><span style={{ fontWeight: 800, fontSize: 14 }}>{row.cars_no || '-'}</span></Val>
                  <Lbl>차종</Lbl>
                  <Val>{row.cars_model || '-'}</Val>
                  <Lbl>고객</Lbl>
                  <Val>{row.cars_user || '-'}{row.cars_user_hp && row.cars_user_hp !== '-' ? ` / ${row.cars_user_hp}` : ''}</Val>
                  <Lbl>캐피탈사</Lbl>
                  <Val>{row.capital_co_name || row.capital_co_code || '-'}</Val>
                  {row.cars_vin && (<><Lbl>차대번호</Lbl><Val span={3}><span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{row.cars_vin}</span></Val></>)}
                  {row.cars_contract_no && (<><Lbl>계약번호</Lbl><Val>{row.cars_contract_no}</Val></>)}
                  {row.cars_start_date && (<><Lbl>차량등록일</Lbl><Val>{fmtCafe24DateOnly(row.cars_start_date)}</Val></>)}
                  {(row.cars_use_from || row.cars_use_to) && (<>
                    <Lbl>계약기간</Lbl>
                    <Val span={3}>
                      {fmtCafe24DateOnly(row.cars_use_from)} ~ {fmtCafe24DateOnly(row.cars_use_to)}
                    </Val>
                  </>)}
                </div>
              </Section>

              {/* 사고 정보 — 자체 구성 + P2.1b 풍성화 */}
              <Section icon="🚨" title="사고 정보">
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px 1fr', gap: '8px 16px', fontSize: 12 }}>
                  <Lbl>접수일시</Lbl>
                  <Val>{fmtCafe24DateTime(row.otptacdt, row.otptactm) || '-'}</Val>
                  <Lbl>접수자</Lbl>
                  <Val>{row.gnus_name || row.otptgnus || '-'}</Val>
                  <Lbl>사고 종류</Lbl>
                  <Val span={3}>
                    {accidentTypes.length > 0
                      ? accidentTypes.map((t: string) => (
                          <span key={t} style={{ display: 'inline-block', marginRight: 6, padding: '3px 10px', background: 'rgba(99,102,241,0.12)', color: '#4338ca', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{t}</span>
                        ))
                      : '-'}
                  </Val>
                  <Lbl>사고 내용</Lbl>
                  <Val span={3} preWrap>{row.otptacmo || '-'}</Val>
                  <Lbl>사고 위치</Lbl>
                  <Val span={3} preWrap>
                    {row.otptbdnm || row.otptacad || '-'}
                    {row.otptbdnm && row.otptacad && ` / ${row.otptacad}`}
                  </Val>
                  {row.otptpknm && (<><Lbl>수리희망지</Lbl><Val span={3} preWrap>{row.otptpknm}</Val></>)}
                  <Lbl>운행가능</Lbl>
                  <Val>
                    <span style={{ padding: '2px 8px', background: row.otptacrn === 'Y' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: row.otptacrn === 'Y' ? '#15803d' : '#991b1b', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                      {row.otptacrn === 'Y' ? '✅ 가능' : '❌ 불가'}
                    </span>
                  </Val>
                  <Lbl>공장입고</Lbl>
                  <Val>{row.otptadfg === 'Y' ? '✅ 입고됨' : '⏳ 미입고'}</Val>
                  {row.otptpart && (<><Lbl>파손부위</Lbl><Val span={3} preWrap>{row.otptpart}</Val></>)}
                </div>
              </Section>

              {/* 통보자 / 운전자 — P2.1b 풍성화 */}
              <Section icon="👥" title="당사 차량 (통보자/운전자)">
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px 1fr', gap: '8px 16px', fontSize: 12 }}>
                  <Lbl>통보자</Lbl>
                  <Val>{row.otptcanm || '-'}{row.otptcahp ? ` / ${row.otptcahp}` : ''}</Val>
                  {row.otptcare && (<><Lbl>운전자관계</Lbl><Val>{row.otptcare}</Val></>)}
                  <Lbl>운전자</Lbl>
                  <Val>{row.otptdsnm || '-'}{row.otptdshp ? ` / ${row.otptdshp}` : ''}</Val>
                  {row.otptdsre && (<><Lbl>계약자와의관계</Lbl><Val>{row.otptdsre}</Val></>)}
                  {row.otptdsli && (<><Lbl>운전자면허</Lbl><Val>{row.otptdsli_label || row.otptdsli}</Val></>)}
                  {row.otptdsbh && (<><Lbl>생년월일</Lbl><Val>{row.otptdsbh}</Val></>)}
                  {row.otptdsbn && (<><Lbl>보험접수번호 (당사)</Lbl><Val span={3}>{row.otptdsbn}</Val></>)}
                  {(row.otptdsus || row.otptdstl) && (<><Lbl>대물담당자</Lbl><Val span={3}>{row.otptdsus || '-'}{row.otptdstl ? ` / ${row.otptdstl}` : ''}</Val></>)}
                </div>
              </Section>

              {/* 상대 차량 / 보험 (있을 때만) */}
              {(row.otpttobm || row.otpttonm || row.otpttohp) && (
                <Section icon="🚙" title="상대 차량 / 보험">
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px 1fr', gap: '8px 16px', fontSize: 12 }}>
                    <Lbl>상대 보험사</Lbl>
                    <Val>{insuranceCompanyOther}</Val>
                    <Lbl>상대 접수번호</Lbl>
                    <Val>{insuranceClaimOther}</Val>
                    {(row.otpttonm || row.otpttohp) && (<>
                      <Lbl>상대 운전자</Lbl>
                      <Val>{row.otpttonm || '-'}{row.otpttohp ? ` / ${row.otpttohp}` : ''}</Val>
                      <Lbl>상대 차량번호</Lbl>
                      <Val>{row.otpttonu || '-'}{row.otpttomd ? ` (${row.otpttomd})` : ''}</Val>
                    </>)}
                  </div>
                </Section>
              )}

              {/* 대차 요청
                  사용자 명시 (2026-05-16): 「업체 코드 라벨 숨김」— raw 코드 노이즈 제거
                  사업자번호는 포맷 적용 */}
              <Section icon="🏢" title="대차 요청">
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px 1fr', gap: '8px 16px', fontSize: 12 }}>
                  <Lbl>대차업체</Lbl>
                  <Val>{row.rental_vendor || '-'}</Val>
                  <Lbl>대차업체 전화</Lbl>
                  <Val>{row.rental_hp || '-'}</Val>
                  <Lbl>대차요청날짜</Lbl>
                  <Val>{row.rent_rsdt || '협의필요'}</Val>
                  {row.rental_bdno && (<><Lbl>사업자번호</Lbl><Val>{formatBizNo(row.rental_bdno)}</Val></>)}
                </div>
              </Section>

              {/* 공장배정 (ajaoderh + pmcfactm) — P1.5f
                  사용자 명시 (2026-05-16): 「배정공장 관련 내용이 안나오고」
                  → 데이터 없어도 섹션 항상 노출 (placeholder) */}
              <Section icon="🔧" title={`공장배정 (${factories.length})`}>
                {factoriesLoading ? <Place>공장배정 조회 중…</Place>
                  : factories.length === 0 ? <Place>아직 배정된 공장이 없습니다</Place>
                  : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {factories.map((f) => (
                          <div
                            key={`${f.oderseqn}-${f.odermddt}`}
                            style={{ ...GLASS.L3, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.04)', fontSize: 12 }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 800, color: '#0f2440', fontSize: 13 }}>🏢 {f.factname || f.oderfact || '-'}</span>
                              <span style={{ padding: '2px 8px', background: 'rgba(34,197,94,0.12)', color: '#15803d', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                                진행중
                              </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 1fr', gap: '4px 12px', fontSize: 11 }}>
                              {f.facttelo && (<><Lbl>전화</Lbl><Val>{f.facttelo}</Val></>)}
                              {f.facthpno && (<><Lbl>휴대폰</Lbl><Val>{f.facthpno}</Val></>)}
                              {f.factbdno && (<><Lbl>사업자번호</Lbl><Val>{formatBizNo(f.factbdno)}</Val></>)}
                              {f.factaddr && (<><Lbl>주소</Lbl><Val span={3}>{f.factaddr}</Val></>)}
                              <Lbl>등록</Lbl>
                              <Val span={3}>
                                {fmtCafe24DateTime(f.odergndt, f.odergntm) || '-'}
                                {f.user_name && <span style={{ marginLeft: 6, color: '#94a3b8' }}>· {f.user_name}</span>}
                              </Val>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
              </Section>

              {/* PR-B3 — 카페24 문자 발송 이력 + 발송문구 (crmsendh + crmsmsgh)
                  사용자 명시 (2026-05-16): 「문자 발송이력과 발송문구 내용도 카페24 접수에 있긴한데」 */}
              <Section icon="📨" title={`문자 발송 이력 (${sms.length})`}>
                {smsLoading ? <Place>cafe24 문자 발송 이력 조회 중…</Place>
                  : sms.length === 0 ? <Place>발송된 문자가 없습니다</Place>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}>
                      {sms.map((m) => {
                        // 예약/즉시 분기 — 예약 Y 면 sendhpdt/hptm, 즉시 N 이면 sendsndt/sntm
                        const dt = m.sendresv === 'Y' ? m.sendhpdt : m.sendsndt
                        const tm = m.sendresv === 'Y' ? m.sendhptm : m.sendsntm
                        // 상태 색상: Y=성공(녹), N=대기(노), F=실패(빨), X=취소(회)
                        const statColor = m.sendstat === 'Y' ? { bg: 'rgba(34,197,94,0.12)', fg: '#15803d', txt: '✓ 발송완료' }
                          : m.sendstat === 'N' ? { bg: 'rgba(245,158,11,0.12)', fg: '#b45309', txt: '⏳ 대기' }
                          : m.sendstat === 'F' ? { bg: 'rgba(239,68,68,0.12)', fg: '#991b1b', txt: '✗ 실패' }
                          : m.sendstat === 'X' ? { bg: 'rgba(148,163,184,0.15)', fg: '#475569', txt: '× 취소' }
                          : { bg: 'rgba(148,163,184,0.15)', fg: '#475569', txt: m.sendstat || '-' }
                        // 발송 채널 배지: KAKAO 노랑 / SMS LMS MMS 파랑
                        const typeBadge = m.sendtype === 'KAKAO' ? { bg: '#FEE500', fg: '#3C1E1E' }
                          : { bg: 'rgba(14,165,233,0.12)', fg: '#0369a1' }
                        return (
                          <div
                            key={m.sendseqn}
                            style={{ ...GLASS.L3, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.04)', fontSize: 12 }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap', fontSize: 11 }}>
                              <span style={{ padding: '2px 8px', borderRadius: 6, background: typeBadge.bg, color: typeBadge.fg, fontWeight: 800 }}>
                                {m.sendtype || 'SMS'}
                              </span>
                              <span style={{ padding: '2px 8px', borderRadius: 6, background: statColor.bg, color: statColor.fg, fontWeight: 700 }}>
                                {statColor.txt}
                              </span>
                              {m.sendresv === 'Y' && (
                                <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.12)', color: '#4338ca', fontWeight: 700 }}>
                                  📅 예약
                                </span>
                              )}
                              <span style={{ color: '#64748b' }}>{fmtCafe24DateTime(dt, tm) || '-'}</span>
                              {m.sendmobl && <span style={{ color: '#475569', fontWeight: 700 }}>📱 {m.sendmobl}</span>}
                              {(m.user_name || m.sendgnus) && <span style={{ color: '#94a3b8' }}>· {m.user_name || m.sendgnus}</span>}
                            </div>
                            {(m.sendsbjt || m.smsgdesc) && (
                              <div style={{ fontWeight: 700, color: '#0f2440', marginBottom: 6, fontSize: 12 }}>
                                {m.sendsbjt || m.smsgdesc}
                              </div>
                            )}
                            {m.sendmesg && (
                              // P2.1a-pivot-B3.1 — 문자 폼 (말풍선) 스타일
                              // sanitizeSmsBody 로 <br>/\r\n/HTML 엔티티/태그 정리
                              <div style={{
                                color: '#0f2440',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                lineHeight: 1.55,
                                padding: '12px 14px',
                                background: m.sendtype === 'KAKAO' ? '#FFEB3B22' : 'rgba(14,165,233,0.08)',
                                border: m.sendtype === 'KAKAO' ? '1px solid #FFEB3B66' : '1px solid rgba(14,165,233,0.18)',
                                borderRadius: 12,
                                borderTopLeftRadius: 4,  // 말풍선 꼬리 위치
                                fontSize: 13,
                                fontFamily: '-apple-system, "Apple SD Gothic Neo", system-ui, "Segoe UI", Roboto, sans-serif',
                                maxWidth: '100%',
                              }}>
                                {sanitizeSmsBody(m.sendmesg)}
                              </div>
                            )}
                            {m.sendrslt && m.sendstat !== 'Y' && (
                              <div style={{ marginTop: 6, fontSize: 11, color: '#991b1b' }}>
                                결과: {m.sendrslt}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
              </Section>

              {/* 카페24 ACR 사고처리관리 상담내역 (acrmemoh) — P1.5f */}
              <Section icon="📒" title={`카페24 상담내역 (${acrMemos.length})`}>
                {acrMemosLoading ? <Place>cafe24 상담내역 조회 중…</Place>
                  : acrMemos.length === 0 ? <Place>카페24 측 상담내역 없음</Place>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
                      {acrMemos.map((m) => (
                        <div
                          key={`${m.memosort}-${m.memonums}`}
                          style={{
                            padding: '10px 12px',
                            background: 'rgba(245,158,11,0.06)',
                            borderLeft: '4px solid #f59e0b',
                            borderRadius: 6,
                            fontSize: 12,
                          }}
                        >
                          <div style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 11, alignItems: 'center', whiteSpace: 'nowrap', flexWrap: 'wrap' }}>
                            <span style={{ color: '#b45309', fontWeight: 700 }}>📒 카페24</span>
                            <span style={{ color: '#64748b' }}>{fmtCafe24DateTime(m.memogndt, m.memogntm)}</span>
                            {(m.user_name || m.memognus) && (
                              <span style={{ color: '#475569', fontWeight: 700 }}>👤 {m.user_name || m.memognus}</span>
                            )}
                          </div>
                          {m.memotitl && <div style={{ fontWeight: 700, color: '#0f2440', marginBottom: 2 }}>{m.memotitl}</div>}
                          {m.memotext && <div style={{ color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.memotext}</div>}
                        </div>
                      ))}
                    </div>
                  )}
              </Section>

              {/* B. 긴급출동 메모 (acememoh — ACE 모듈, 보조)
                  사용자 명시 (2026-05-16): 「사고 이니 긴급출동메모는 사고엔 없는게 맞고」
                  → 데이터 있을 때만 (또는 긴급출동/현장출동 Y 일 때만) 표출 */}
              {(memosLoading || memos.length > 0 || row.otptacph === 'Y' || row.otptacno === 'Y') && (
                <Section icon="📞" title={`긴급출동 메모 (${memos.length})`}>
                  {memosLoading ? <Place>cafe24 메모 조회 중…</Place>
                    : memos.length === 0 ? <Place>긴급출동 메모 없음</Place>
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
              )}

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

              {/* 사이드 정보 — 접수 정보 */}
              <Section icon="📌" title="접수 정보">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <Row><Lbl>접수자</Lbl><Val>{row.gnus_name || row.otptgnus || '-'}</Val></Row>
                  <Row><Lbl>접수번호</Lbl><Val style={{ fontFamily: 'monospace', fontSize: 11 }}>{row.otptidno}/{row.otptmddt}/{row.otptsrno}</Val></Row>
                  <Row><Lbl>등록상태</Lbl><Val>{row.otptrgst === 'R' ? '활성' : row.otptrgst === 'C' ? '취소' : row.otptrgst || '-'}</Val></Row>
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

function Val({ children, span, preWrap, style }: { children: React.ReactNode; span?: number; preWrap?: boolean; style?: React.CSSProperties }) {
  return (
    <span style={{
      color: '#1e293b',
      fontWeight: 600,
      gridColumn: span ? `span ${span}` : undefined,
      whiteSpace: preWrap ? 'pre-wrap' : undefined,
      ...style,
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
