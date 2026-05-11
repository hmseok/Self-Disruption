'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { GLASS } from '../../utils/ui-tokens'
import type {
  MergedRow,
  DispatchOrder,
  Consultation,
  ConsultationCategory,
  Cafe24Detail,
  Cafe24Memo,
  ResultMsg,
} from './types'
import { CATEGORY_META } from './types'

// ═══════════════════════════════════════════════════════════════════
// IntakeModalV2 — PR-OPS-1.4b 상담원 기록 스타일
//
// 5 섹션:
//   A 사고 상세 (cafe24 detail fetch — 위치/요청자/메모)
//   B 콜센터 메모 timeline (cafe24 memos read-only)
//   C 상담 히스토리 (operations_consultations DESC)
//   D 새 상담 입력 (POST → C 에 prepend)
//   E dispatch_order 기본 (status / 일정 / 저장 / 배차 확정)
//
// 원칙:
//   - cafe24 미연결 시 graceful 안내 (모달 자체는 정상 동작)
//   - dispatch_order 미생성 시 C/D 비활성 + 안내
//   - operations_consultations 마이그 미적용 시 C/D 안내
//   - Ctrl/Cmd + Enter → 새 상담 POST
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

// YYYYMMDD + HHMMSS → "2026-05-11 14:30" 변환
function fmtCafe24DateTime(d: string | null, t: string | null): string {
  if (!d || d.length !== 8) return ''
  const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
  if (!t || t.length < 4) return date
  const hh = t.slice(0, 2)
  const mm = t.slice(2, 4)
  return `${date} ${hh}:${mm}`
}

// ISO timestamp → "MM-DD HH:mm"
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

// concat 위치 (null skip)
function joinAddr(...parts: Array<string | null>): string {
  return parts.filter((p) => p && p.trim()).join(' ')
}

// ═══ Component ═══════════════════════════════════════════════════
export default function IntakeModalV2({
  row,
  onClose,
  onResult,
}: {
  row: MergedRow
  onClose: () => void
  onResult: (msg: ResultMsg) => void
}) {
  const existing = row.dispatch_order

  // ── E 섹션 (dispatch_order 기본) ──
  const [expDispatch, setExpDispatch] = useState(existing?.expected_dispatch_date || '')
  const [expReturn, setExpReturn] = useState(existing?.expected_return_date || '')
  const [status, setStatus] = useState<DispatchOrder['status']>(existing?.status || 'consulting')
  const [busy, setBusy] = useState(false)

  // ── A/B 섹션 (cafe24 detail/memos) ──
  const [detail, setDetail] = useState<Cafe24Detail | null>(null)
  const [detailErr, setDetailErr] = useState<string | null>(null)
  const [memos, setMemos] = useState<Cafe24Memo[]>([])
  const [memosErr, setMemosErr] = useState<string | null>(null)
  const [cafe24Loading, setCafe24Loading] = useState(true)

  // ── C 섹션 (consultations) ──
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [consultationsErr, setConsultationsErr] = useState<string | null>(null)
  const [migrationPending, setMigrationPending] = useState(false)
  const [consultationsLoading, setConsultationsLoading] = useState(false)

  // ── D 섹션 (새 상담 입력) ──
  const [newNote, setNewNote] = useState('')
  const [newCategory, setNewCategory] = useState<ConsultationCategory>('followup')
  const [posting, setPosting] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement | null>(null)

  // ── A/B Fetch — 마운트 시 병렬 ──
  const fetchCafe24 = useCallback(async () => {
    if (!row.esosidno || !row.esosmddt || !row.esossrno) {
      setCafe24Loading(false)
      setDetailErr('cafe24 키 없음 (idno/mddt/srno)')
      return
    }
    setCafe24Loading(true)
    const params = new URLSearchParams({
      idno: row.esosidno,
      mddt: row.esosmddt,
      srno: String(row.esossrno),
    })
    const headers = await getAuthHeader()
    try {
      const [detailRes, memosRes] = await Promise.all([
        fetch(`/api/cafe24/accidents/detail?${params}`, { headers }),
        fetch(`/api/cafe24/accidents/memos?${params}`, { headers }),
      ])
      const detailJson = await detailRes.json().catch(() => ({}))
      const memosJson = await memosRes.json().catch(() => ({}))

      if (detailJson?.success && detailJson.data) {
        setDetail(detailJson.data as Cafe24Detail)
        setDetailErr(null)
      } else {
        setDetail(null)
        setDetailErr(detailJson?.error || 'cafe24 detail 미연결')
      }

      if (memosJson?.success && Array.isArray(memosJson.data)) {
        setMemos(memosJson.data as Cafe24Memo[])
        setMemosErr(null)
      } else {
        setMemos([])
        setMemosErr(memosJson?.error || 'cafe24 memos 미연결')
      }
    } catch (e: any) {
      setDetail(null)
      setMemos([])
      setDetailErr(e?.message || 'cafe24 호출 실패')
      setMemosErr(e?.message || 'cafe24 호출 실패')
    } finally {
      setCafe24Loading(false)
    }
  }, [row.esosidno, row.esosmddt, row.esossrno])

  // ── C Fetch — dispatch_order 있을 때만 ──
  const fetchConsultations = useCallback(async () => {
    if (!existing?.id) {
      setConsultations([])
      return
    }
    setConsultationsLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(
        `/api/operations/consultations?dispatch_order_id=${existing.id}`,
        { headers },
      )
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
      setConsultations([])
    } finally {
      setConsultationsLoading(false)
    }
  }, [existing?.id])

  useEffect(() => {
    fetchCafe24()
    fetchConsultations()
  }, [fetchCafe24, fetchConsultations])

  // ── D Submit (새 상담 POST) ──
  const submitConsultation = useCallback(async () => {
    if (!existing?.id) {
      onResult({ type: 'err', text: '먼저 dispatch_order 를 저장 후 상담 추가 가능' })
      return
    }
    const note = newNote.trim()
    if (!note) {
      onResult({ type: 'err', text: '상담 내용을 입력하세요' })
      return
    }
    if (note.length > 5000) {
      onResult({ type: 'err', text: '상담 내용은 5000자 이내' })
      return
    }
    setPosting(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch('/api/operations/consultations', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          dispatch_order_id: existing.id,
          note,
          category: newCategory,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (json?._migration_pending) {
        setMigrationPending(true)
        onResult({ type: 'err', text: 'operations_consultations 테이블 미적용 — 마이그 SQL 실행 필요' })
        return
      }
      if (json?.error) {
        onResult({ type: 'err', text: json.error })
        return
      }
      // 낙관적 prepend
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
      // textarea 포커스 유지 (연속 입력)
      setTimeout(() => noteRef.current?.focus(), 50)
    } catch (e: any) {
      onResult({ type: 'err', text: e?.message || '상담 추가 실패' })
    } finally {
      setPosting(false)
    }
  }, [existing?.id, newNote, newCategory, onResult])

  // ── E Save (dispatch_order PATCH/POST) ──
  const saveDispatch = async () => {
    if (busy) return
    setBusy(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      if (existing) {
        const res = await fetch(`/api/operations/dispatch-orders/${existing.id}`, {
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
            ride_accident_id: row.id,
            expected_dispatch_date: expDispatch || null,
            expected_return_date: expReturn || null,
            status,
          }),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        onResult({ type: 'ok', text: 'dispatch_order 신설 완료 — 이제 상담 추가 가능' })
      }
      onClose()
    } catch (e: any) {
      onResult({ type: 'err', text: e?.message || '저장 실패' })
    } finally {
      setBusy(false)
    }
  }

  // ── E Confirm (배차 확정 → fmi_rentals) ──
  const confirmDispatch = async () => {
    if (!existing) {
      onResult({ type: 'err', text: '먼저 저장 후 배차 확정 가능' })
      return
    }
    if (!window.confirm('배차 확정 시 fmi_rentals 신규 row 가 생성됩니다. 진행할까요?')) return
    setBusy(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/operations/dispatch-orders/${existing.id}/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer_name: row.driver_name,
          customer_phone: row.driver_phone,
          customer_car_number: row.customer_car_number,
          insurance_company: row.insurance_company,
          insurance_claim_no: row.insurance_claim_no || row.accidentNo,
          dispatch_date: expDispatch || new Date().toISOString().slice(0, 10),
          expected_return_date: expReturn || null,
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      onResult({
        type: 'ok',
        text: `배차 확정 완료 — fmi_rental ${json.mode === 'create' ? '신설' : '갱신'}`,
      })
      onClose()
    } catch (e: any) {
      onResult({ type: 'err', text: e?.message || '배차 확정 실패' })
    } finally {
      setBusy(false)
    }
  }

  // ── 키보드: Ctrl/Cmd + Enter → 상담 POST ──
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      submitConsultation()
    }
  }

  // ── 자동 포커스 ──
  useEffect(() => {
    if (existing?.id) {
      setTimeout(() => noteRef.current?.focus(), 100)
    }
  }, [existing?.id])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,36,64,0.4)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.L4,
          borderRadius: 18,
          padding: 24,
          maxWidth: 760,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 60px rgba(15,36,64,0.25)',
        }}
      >
        {/* ── Header ─────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#0f2440', margin: 0, whiteSpace: 'nowrap' }}>
              🚗 {row.customer_car_number || row.driver_name || row.accidentNo}
            </h2>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, whiteSpace: 'nowrap' }}>
              사고일 {row.accident_date} · 접수번호 {row.accidentNo} · {row.insurance_company || '-'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, color: '#64748b' }}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* ── A. 사고 상세 (cafe24 detail) ──────────────── */}
        <SectionTitle icon="📋" title="사고 상세 (cafe24)" trailing={
          <button
            onClick={fetchCafe24}
            disabled={cafe24Loading}
            style={subtleBtnStyle}
          >
            ↻ 새로고침
          </button>
        } />
        <SectionBody>
          {cafe24Loading ? (
            <PlaceholderText>cafe24 조회 중…</PlaceholderText>
          ) : detailErr ? (
            <PlaceholderText warn>⚠ cafe24 미연결 — 메모/상담만 입력 가능</PlaceholderText>
          ) : detail ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: 12 }}>
              <Lbl>📍 위치</Lbl>      <Val>{joinAddr(detail.esosaddr, detail.esosadnm, detail.esosadtl) || '-'}</Val>
              <Lbl>🧍 요청자</Lbl>    <Val>{detail.esosusnm || '-'} {detail.esosustl ? `· ${detail.esosustl}` : ''}</Val>
              <Lbl>🚗 사고차</Lbl>    <Val>{detail.cars_no || detail.esosusvp || '-'} {detail.cars_model || detail.esosusvd || ''}</Val>
              {detail.esosrstx && (<><Lbl>📝 사고 메모</Lbl> <Val style={{ whiteSpace: 'pre-wrap' }}>{detail.esosrstx}</Val></>)}
              {detail.esosmemo && (<><Lbl>💭 상담 메모</Lbl> <Val style={{ whiteSpace: 'pre-wrap' }}>{detail.esosmemo}</Val></>)}
              {detail.esosinft && (<><Lbl>ℹ️ 추가</Lbl>      <Val style={{ whiteSpace: 'pre-wrap' }}>{detail.esosinft}</Val></>)}
              <Lbl>🕓 등록</Lbl>      <Val>{fmtCafe24DateTime(detail.esosgndt, detail.esosgntm) || '-'} {detail.esosgnus ? `· ${detail.esosgnus}` : ''}</Val>
            </div>
          ) : (
            <PlaceholderText>사고 상세 없음</PlaceholderText>
          )}
        </SectionBody>

        {/* ── B. 콜센터 메모 timeline (cafe24 memos) ───── */}
        <SectionTitle icon="📞" title={`콜센터 메모 (${memos.length})`} />
        <SectionBody>
          {cafe24Loading ? (
            <PlaceholderText>cafe24 메모 조회 중…</PlaceholderText>
          ) : memosErr ? (
            <PlaceholderText warn>⚠ {memosErr}</PlaceholderText>
          ) : memos.length === 0 ? (
            <PlaceholderText>콜센터 메모 없음</PlaceholderText>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {memos.map((m) => (
                <div
                  key={`${m.memosort}-${m.memonums}`}
                  style={{
                    ...GLASS.L3,
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid rgba(0,0,0,0.04)',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4, color: '#64748b', fontSize: 11, whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700 }}>#{m.memosort}-{m.memonums}</span>
                    <span>{fmtCafe24DateTime(m.memogndt, m.memogntm)}</span>
                    {m.memognus && <span>· {m.memognus}</span>}
                  </div>
                  {m.memotitl && (
                    <div style={{ fontWeight: 700, color: '#0f2440', marginBottom: 2 }}>
                      {m.memotitl}
                    </div>
                  )}
                  {m.memotext && (
                    <div style={{ color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                      {m.memotext}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionBody>

        {/* ── C. 상담 히스토리 (operations_consultations) ── */}
        <SectionTitle icon="💬" title={`상담 히스토리 (${consultations.length})`} trailing={
          existing?.id && (
            <button onClick={fetchConsultations} disabled={consultationsLoading} style={subtleBtnStyle}>
              ↻ 새로고침
            </button>
          )
        } />
        <SectionBody>
          {!existing ? (
            <PlaceholderText warn>먼저 [💾 저장] 으로 dispatch_order 를 만들어주세요. 그 후 상담 추가 가능.</PlaceholderText>
          ) : migrationPending ? (
            <PlaceholderText warn>⚠ operations_consultations 테이블 미적용 — 마이그 SQL 실행 필요</PlaceholderText>
          ) : consultationsErr ? (
            <PlaceholderText warn>⚠ {consultationsErr}</PlaceholderText>
          ) : consultations.length === 0 ? (
            <PlaceholderText>상담 기록 없음 — 아래에서 첫 상담을 추가하세요</PlaceholderText>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
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

        {/* ── D. 새 상담 입력 ───────────────────────────── */}
        <SectionTitle icon="✍️" title="새 상담 추가" />
        <SectionBody>
          <textarea
            ref={noteRef}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!existing || migrationPending || posting}
            placeholder={
              !existing ? 'dispatch_order 먼저 저장…'
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
              opacity: !existing || migrationPending ? 0.5 : 1,
            }}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as ConsultationCategory)}
              disabled={!existing || migrationPending || posting}
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
            <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
              {newNote.length}/5000
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={submitConsultation}
              disabled={!existing || migrationPending || posting || !newNote.trim()}
              style={{
                padding: '8px 16px',
                background: (!existing || migrationPending || posting || !newNote.trim())
                  ? '#94a3b8'
                  : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                cursor: (!existing || migrationPending || posting || !newNote.trim()) ? 'not-allowed' : 'pointer',
                fontWeight: 800,
                fontSize: 12,
                whiteSpace: 'nowrap',
              }}
            >
              💬 상담 추가
            </button>
          </div>
        </SectionBody>

        {/* ── E. dispatch_order 기본 (status / 일정) ───── */}
        <SectionTitle icon="📅" title="배차 일정 / 상태" />
        <SectionBody>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <SmallField label="상태">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DispatchOrder['status'])}
                style={{ ...inputStyle }}
              >
                <option value="new">🆕 신규</option>
                <option value="consulting">📞 상담중</option>
                <option value="scheduled">📅 배차예정</option>
                <option value="done">✅ 종결</option>
                <option value="cancelled">✗ 취소</option>
              </select>
            </SmallField>
            <SmallField label="예상 배차일">
              <input
                type="date"
                value={expDispatch}
                onChange={(e) => setExpDispatch(e.target.value)}
                style={inputStyle}
              />
            </SmallField>
            <SmallField label="예상 반납일">
              <input
                type="date"
                value={expReturn}
                onChange={(e) => setExpReturn(e.target.value)}
                style={inputStyle}
              />
            </SmallField>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
            <button onClick={onClose} disabled={busy} style={cancelBtnStyle}>
              취소
            </button>
            <button onClick={saveDispatch} disabled={busy} style={primaryBtnStyle(busy)}>
              💾 저장
            </button>
            {existing && existing.status !== 'dispatched' && existing.status !== 'done' && (
              <button onClick={confirmDispatch} disabled={busy} style={successBtnStyle(busy)}>
                🚀 배차 확정
              </button>
            )}
          </div>
        </SectionBody>
      </div>
    </div>
  )
}

// ═══ Section helpers ════════════════════════════════════════════════
function SectionTitle({ icon, title, trailing }: { icon: string; title: string; trailing?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 6 }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0f2440', margin: 0, whiteSpace: 'nowrap' }}>
        {icon} {title}
      </h3>
      <div style={{ flex: 1 }} />
      {trailing}
    </div>
  )
}

function SectionBody({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'rgba(248,250,252,0.7)',
        border: '1px solid rgba(0,0,0,0.05)',
        borderRadius: 12,
        padding: 12,
      }}
    >
      {children}
    </div>
  )
}

function PlaceholderText({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div style={{ fontSize: 12, color: warn ? '#b45309' : '#94a3b8', padding: 4 }}>
      {children}
    </div>
  )
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
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4, whiteSpace: 'nowrap' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

// ═══ Style tokens (modal-local) ═════════════════════════════════════
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  fontSize: 12,
  color: '#1e293b',
  ...GLASS.L1,
}

const subtleBtnStyle: React.CSSProperties = {
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

const cancelBtnStyle: React.CSSProperties = {
  padding: '10px 18px',
  background: 'transparent',
  border: '1px solid rgba(0,0,0,0.1)',
  borderRadius: 10,
  cursor: 'pointer',
  color: '#475569',
  fontWeight: 700,
  fontSize: 13,
}

function primaryBtnStyle(busy: boolean): React.CSSProperties {
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

function successBtnStyle(busy: boolean): React.CSSProperties {
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
