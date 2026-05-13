'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { GLASS } from '../../utils/ui-tokens'
import type {
  DispatchRequestRow,
  Consultation,
  ConsultationCategory,
  Cafe24Memo,
  ResultMsg,
  DispatchOrder,
} from './types'
import { CATEGORY_META, describeAccidentTypes, fmtCafe24DateTime } from './types'

// ═══════════════════════════════════════════════════════════════════
// DispatchRequestFullscreen — PR-OPS-1.5b
//
// 「대차접수 탭」 행 클릭 시 풀스크린 모달.
// 사용자 sample 메시지 형식 그대로 + 우리 dispatch_order 관리.
//
// 5 섹션:
//   A 대차요청 정보 (sample 메시지 형식 그대로)
//   B 콜센터 메모 timeline (cafe24 memos read-only)
//   C 우리 상담 히스토리 (operations_consultations)
//   D 새 상담 입력 (POST → C prepend)
//   E 우리 dispatch_order (status / 일정 / 저장 / 배차 확정)
//
// JOIN 키 — DispatchRequestRow.otptidno+mddt+srno = ride_accident_id 매핑 안내:
//   본 모달은 cafe24 사고 1건당 dispatch_order 1건 관리.
//   ride_accident_id (INT) = otptidno 의 숫자 부분 (Phase 1.3 호환).
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
  } catch {
    return iso.slice(0, 16)
  }
}

// otptidno (string) → ride_accident_id (INT) — Phase 1.3 호환
function rideAccidentIdFromIdno(idno: string): number {
  return parseInt(String(idno).replace(/[^0-9]/g, '').slice(0, 9) || '0', 10)
}

export default function DispatchRequestFullscreen({
  row,
  onClose,
  onResult,
}: {
  row: DispatchRequestRow
  onClose: () => void
  onResult: (msg: ResultMsg) => void
}) {
  const rideAccidentId = rideAccidentIdFromIdno(row.otptidno)

  // ── E 섹션 (dispatch_order) ──
  const [dispatchOrder, setDispatchOrder] = useState<DispatchOrder | null>(null)
  const [orderLoading, setOrderLoading] = useState(true)
  const [expDispatch, setExpDispatch] = useState('')
  const [expReturn, setExpReturn] = useState('')
  const [status, setStatus] = useState<DispatchOrder['status']>('consulting')
  const [busy, setBusy] = useState(false)

  // ── B 섹션 (cafe24 memos) ──
  const [memos, setMemos] = useState<Cafe24Memo[]>([])
  const [memosLoading, setMemosLoading] = useState(true)
  const [memosErr, setMemosErr] = useState<string | null>(null)

  // ── C 섹션 (consultations) ──
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [consultationsErr, setConsultationsErr] = useState<string | null>(null)
  const [migrationPending, setMigrationPending] = useState(false)
  const [consultationsLoading, setConsultationsLoading] = useState(false)

  // ── D 섹션 (새 상담) ──
  const [newNote, setNewNote] = useState('')
  const [newCategory, setNewCategory] = useState<ConsultationCategory>('followup')
  const [posting, setPosting] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement | null>(null)

  // ── Fetch — dispatch_order (있을 수도, 없을 수도) ──
  const fetchOrder = useCallback(async () => {
    setOrderLoading(true)
    try {
      const headers = await getAuthHeader()
      // ride_accident_id 로 GET — Phase 1.3 dispatch-orders 안 LIST 에서 매칭
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
    } catch (e) {
      console.error('[DispatchReqFullscreen fetchOrder]', e)
    } finally {
      setOrderLoading(false)
    }
  }, [rideAccidentId])

  // ── Fetch — cafe24 memos ──
  const fetchMemos = useCallback(async () => {
    setMemosLoading(true)
    setMemosErr(null)
    try {
      const params = new URLSearchParams({
        idno: row.otptidno,
        mddt: row.otptmddt,
        srno: String(row.otptsrno),
      })
      const headers = await getAuthHeader()
      const res = await fetch(`/api/cafe24/accidents/memos?${params}`, { headers })
      const json = await res.json().catch(() => ({}))
      if (json?.success && Array.isArray(json.data)) {
        setMemos(json.data as Cafe24Memo[])
      } else {
        setMemos([])
        setMemosErr(json?.error || 'cafe24 memos 미연결')
      }
    } catch (e: any) {
      setMemosErr(e?.message || 'memos 호출 실패')
    } finally {
      setMemosLoading(false)
    }
  }, [row.otptidno, row.otptmddt, row.otptsrno])

  // ── Fetch — consultations (dispatch_order 있을 때만) ──
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
        setMigrationPending(false)
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

  useEffect(() => { fetchOrder(); fetchMemos() }, [fetchOrder, fetchMemos])
  useEffect(() => { fetchConsultations() }, [fetchConsultations])
  useEffect(() => {
    if (dispatchOrder?.id) setTimeout(() => noteRef.current?.focus(), 100)
  }, [dispatchOrder?.id])

  // ── 새 상담 POST ──
  const submitConsultation = useCallback(async () => {
    if (!dispatchOrder?.id) {
      onResult({ type: 'err', text: '먼저 dispatch_order 저장 후 상담 추가' })
      return
    }
    const note = newNote.trim()
    if (!note) return onResult({ type: 'err', text: '상담 내용을 입력하세요' })
    if (note.length > 5000) return onResult({ type: 'err', text: '5000자 이내' })
    setPosting(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch('/api/operations/consultations', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          dispatch_order_id: dispatchOrder.id,
          note,
          category: newCategory,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (json?._migration_pending) {
        setMigrationPending(true)
        onResult({ type: 'err', text: 'consultations 테이블 미적용' })
        return
      }
      if (json?.error) return onResult({ type: 'err', text: json.error })
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
      onResult({ type: 'ok', text: '상담 추가 완료' })
      setTimeout(() => noteRef.current?.focus(), 50)
    } catch (e: any) {
      onResult({ type: 'err', text: e?.message || '상담 추가 실패' })
    } finally {
      setPosting(false)
    }
  }, [dispatchOrder?.id, newNote, newCategory, onResult])

  // ── dispatch_order 저장 ──
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
        onResult({ type: 'ok', text: 'dispatch_order 수정 완료' })
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
        onResult({ type: 'ok', text: 'dispatch_order 신설 완료' })
        await fetchOrder()
        return
      }
      onClose()
    } catch (e: any) {
      onResult({ type: 'err', text: e?.message || '저장 실패' })
    } finally {
      setBusy(false)
    }
  }

  // ── 배차 확정 ──
  const confirmDispatch = async () => {
    if (!dispatchOrder) return onResult({ type: 'err', text: '먼저 저장 후 배차 확정' })
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
      onResult({ type: 'ok', text: `배차 확정 완료 — fmi_rental ${json.mode === 'create' ? '신설' : '갱신'}` })
      onClose()
    } catch (e: any) {
      onResult({ type: 'err', text: e?.message || '배차 확정 실패' })
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

  const accidentTypes = describeAccidentTypes(row)
  const insuranceCompanyOther = row.otpttobm || '미확인'
  const insuranceClaimOther = row.otpttobn || '-'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,36,64,0.5)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.L4,
          borderRadius: 18,
          padding: 24,
          maxWidth: 1280,
          width: '100%',
          minHeight: 'calc(100vh - 40px)',
          boxShadow: '0 25px 60px rgba(15,36,64,0.25)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0f2440', margin: 0, whiteSpace: 'nowrap' }}>
              🚗 {row.cars_no || row.otptcanm || row.otptidno}
              <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginLeft: 8 }}>
                {row.cars_model || ''}
              </span>
            </h2>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, whiteSpace: 'nowrap' }}>
              대차접수 · 접수 {fmtCafe24DateTime(row.otptacdt, row.otptactm)} ·
              <span style={{ marginLeft: 6, color: '#0f2440', fontWeight: 700 }}>{row.rental_vendor || '-'}</span>
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 22, color: '#64748b' }}>×</button>
        </div>

        {/* A. 대차요청 정보 — 사용자 sample 메시지 형식 그대로 */}
        <SectionTitle icon="📋" title="대차요청 정보 (잔디 메시지 형식)" />
        <SectionBody>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px 1fr', gap: '8px 16px', fontSize: 12 }}>
            <Lbl>*대차업체</Lbl>
            <Val>{row.rental_vendor || '-'}{row.rental_hp ? ` (${row.rental_hp})` : ''}</Val>
            <Lbl>*캐피탈사</Lbl>
            <Val>{row.capital_co_name || row.capital_co_code || '-'}</Val>
            <Lbl>*차량번호,차종</Lbl>
            <Val style={{ gridColumn: 'span 3' }}>
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
            <Val style={{ gridColumn: 'span 3' }}>
              {accidentTypes.length > 0 ? accidentTypes.join(' · ') : '-'}
            </Val>
            <Lbl>*사고내용</Lbl>
            <Val style={{ gridColumn: 'span 3', whiteSpace: 'pre-wrap' }}>{row.otptacmo || '-'}</Val>
            <Lbl>*사고위치</Lbl>
            <Val style={{ gridColumn: 'span 3', whiteSpace: 'pre-wrap' }}>{row.otptacad || '-'}</Val>
            <Lbl>*상대 보험사</Lbl>
            <Val>{insuranceCompanyOther}</Val>
            <Lbl>*상대 접수번호</Lbl>
            <Val>{insuranceClaimOther}</Val>
            {(row.otpttonm || row.otpttohp) && (
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
        </SectionBody>

        {/* B. 콜센터 메모 */}
        <SectionTitle icon="📞" title={`콜센터 메모 (${memos.length})`} trailing={
          <button onClick={fetchMemos} disabled={memosLoading} style={subtleBtn}>↻ 새로고침</button>
        } />
        <SectionBody>
          {memosLoading ? (
            <Placeholder>cafe24 메모 조회 중…</Placeholder>
          ) : memosErr ? (
            <Placeholder warn>⚠ {memosErr}</Placeholder>
          ) : memos.length === 0 ? (
            <Placeholder>콜센터 메모 없음</Placeholder>
          ) : (
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
        </SectionBody>

        {/* C. 우리 상담 히스토리 */}
        <SectionTitle icon="💬" title={`상담 히스토리 (${consultations.length})`} trailing={
          dispatchOrder?.id && (
            <button onClick={fetchConsultations} disabled={consultationsLoading} style={subtleBtn}>↻ 새로고침</button>
          )
        } />
        <SectionBody>
          {orderLoading ? (
            <Placeholder>dispatch_order 확인 중…</Placeholder>
          ) : !dispatchOrder ? (
            <Placeholder warn>먼저 아래 [💾 저장] 으로 dispatch_order 를 만들어주세요.</Placeholder>
          ) : migrationPending ? (
            <Placeholder warn>⚠ operations_consultations 테이블 미적용 — 마이그 SQL 실행 필요</Placeholder>
          ) : consultationsErr ? (
            <Placeholder warn>⚠ {consultationsErr}</Placeholder>
          ) : consultations.length === 0 ? (
            <Placeholder>상담 기록 없음 — 아래에서 첫 상담을 추가하세요</Placeholder>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
              {consultations.map((c) => {
                const meta = CATEGORY_META[c.category] || CATEGORY_META.other
                return (
                  <div
                    key={c.id}
                    style={{
                      padding: '8px 10px',
                      background: `${meta.tint}11`,
                      borderLeft: `3px solid ${meta.tint}`,
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, marginBottom: 3, fontSize: 11, whiteSpace: 'nowrap' }}>
                      <span style={{ color: meta.tint, fontWeight: 800 }}>{meta.emoji} {meta.label}</span>
                      <span style={{ color: '#64748b' }}>{fmtIsoShort(c.created_at)}</span>
                      {c.created_by && <span style={{ color: '#94a3b8' }}>· {c.created_by}</span>}
                    </div>
                    <div style={{ color: '#1e293b', whiteSpace: 'pre-wrap' }}>{c.note}</div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionBody>

        {/* D. 새 상담 입력 */}
        <SectionTitle icon="✍️" title="새 상담 추가" />
        <SectionBody>
          <textarea
            ref={noteRef}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!dispatchOrder || migrationPending || posting}
            placeholder={
              !dispatchOrder ? 'dispatch_order 먼저 저장…'
                : migrationPending ? '마이그 SQL 실행 후 사용 가능'
                : '상담 내용 (Ctrl+Enter 로 전송)'
            }
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              fontSize: 13,
              color: '#1e293b',
              ...GLASS.L1,
              resize: 'vertical',
              minHeight: 70,
              opacity: !dispatchOrder || migrationPending ? 0.5 : 1,
            }}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as ConsultationCategory)}
              disabled={!dispatchOrder || migrationPending || posting}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                fontSize: 12,
                color: '#1e293b',
                ...GLASS.L1,
                whiteSpace: 'nowrap',
              }}
            >
              {(Object.keys(CATEGORY_META) as ConsultationCategory[]).map((k) => (
                <option key={k} value={k}>{CATEGORY_META[k].emoji} {CATEGORY_META[k].label}</option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{newNote.length}/5000</span>
            <div style={{ flex: 1 }} />
            <button
              onClick={submitConsultation}
              disabled={!dispatchOrder || migrationPending || posting || !newNote.trim()}
              style={{
                padding: '8px 16px',
                background: (!dispatchOrder || migrationPending || posting || !newNote.trim())
                  ? '#94a3b8'
                  : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                cursor: (!dispatchOrder || migrationPending || posting || !newNote.trim()) ? 'not-allowed' : 'pointer',
                fontWeight: 800,
                fontSize: 12,
                whiteSpace: 'nowrap',
              }}
            >
              💬 상담 추가
            </button>
          </div>
        </SectionBody>

        {/* E. dispatch_order */}
        <SectionTitle icon="📅" title="배차 일정 / 상태" />
        <SectionBody>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <SmallField label="상태">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DispatchOrder['status'])}
                style={inputStyle}
              >
                <option value="new">🆕 신규</option>
                <option value="consulting">📞 상담중</option>
                <option value="scheduled">📅 배차예정</option>
                <option value="done">✅ 종결</option>
                <option value="cancelled">✗ 취소</option>
              </select>
            </SmallField>
            <SmallField label="예상 배차일">
              <input type="date" value={expDispatch} onChange={(e) => setExpDispatch(e.target.value)} style={inputStyle} />
            </SmallField>
            <SmallField label="예상 반납일">
              <input type="date" value={expReturn} onChange={(e) => setExpReturn(e.target.value)} style={inputStyle} />
            </SmallField>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
            <button onClick={onClose} disabled={busy} style={cancelBtn}>취소</button>
            <button onClick={saveOrder} disabled={busy} style={primaryBtn(busy)}>💾 저장</button>
            {dispatchOrder && dispatchOrder.status !== 'dispatched' && dispatchOrder.status !== 'done' && (
              <button onClick={confirmDispatch} disabled={busy} style={successBtn(busy)}>🚀 배차 확정</button>
            )}
          </div>
        </SectionBody>
      </div>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────
function SectionTitle({ icon, title, trailing }: { icon: string; title: string; trailing?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 6 }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0f2440', margin: 0, whiteSpace: 'nowrap' }}>{icon} {title}</h3>
      <div style={{ flex: 1 }} />
      {trailing}
    </div>
  )
}

function SectionBody({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(248,250,252,0.7)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 12, padding: 14 }}>
      {children}
    </div>
  )
}

function Placeholder({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return <div style={{ fontSize: 12, color: warn ? '#b45309' : '#94a3b8', padding: 4 }}>{children}</div>
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <span style={{ color: '#94a3b8', fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>
}

function Val({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span style={{ color: '#1e293b', fontWeight: 600, ...style }}>{children}</span>
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
  padding: '4px 10px',
  background: 'transparent',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 6,
  cursor: 'pointer',
  color: '#64748b',
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const cancelBtn: React.CSSProperties = {
  padding: '10px 18px',
  background: 'transparent',
  border: '1px solid rgba(0,0,0,0.1)',
  borderRadius: 10,
  cursor: 'pointer',
  color: '#475569',
  fontWeight: 700,
  fontSize: 13,
}

function primaryBtn(busy: boolean): React.CSSProperties {
  return {
    padding: '10px 18px',
    background: busy ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    cursor: busy ? 'not-allowed' : 'pointer',
    fontWeight: 700,
    fontSize: 13,
  }
}

function successBtn(busy: boolean): React.CSSProperties {
  return {
    padding: '10px 18px',
    background: busy ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    cursor: busy ? 'not-allowed' : 'pointer',
    fontWeight: 800,
    fontSize: 13,
  }
}
