'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'
import ConsultationTimeline from './ConsultationTimeline'

// ═══════════════════════════════════════════════════════════════════
// RentalDrawer — 배차중 리스트 우측 드로어 (PR-UX-DRAWER, 2026-07-04)
//
// 배차중 탭에서 행 클릭 시 페이지 이동 없이:
//   상담 기록(즉시 저장) · 반납예정/담당자 수정 · 반납 처리 · 전체 편집 링크
// 데이터: GET/PATCH /api/fmi-rentals/[id] (기존 API 재사용, DB 변경 없음)
// ═══════════════════════════════════════════════════════════════════

const STATUS_LABEL: Record<string, string> = {
  pending: '배차예정', dispatched: '배차완료', returned: '회차완료', claiming: '청구중', settled: '정산완료',
}

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

function fmtDt(d: any): string {
  if (!d) return '-'
  const s = String(d)
  if (s.includes('T')) return s.slice(0, 16).replace('T', ' ')
  return s.slice(0, 16)
}
// datetime-local input 용 — 'YYYY-MM-DDTHH:mm'
function toLocalInput(d: any): string {
  if (!d) return ''
  const s = String(d)
  if (s.includes('T')) return s.slice(0, 16)
  if (s.length >= 16) return s.slice(0, 10) + 'T' + s.slice(11, 16)
  return ''
}

export default function RentalDrawer({
  rentalId,
  onClose,
  onChanged,
  onRequestReturn,
}: {
  rentalId: string | null
  onClose: () => void
  /** 저장 성공 시 — 부모 리스트 갱신 */
  onChanged: () => void
  /** 반납 버튼 — 부모의 반납 모달 열기 */
  onRequestReturn: (detail: any) => void
}) {
  const router = useRouter()
  const [f, setF] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  // 일정/담당 편집 state
  const [retDate, setRetDate] = useState('')
  const [adjName, setAdjName] = useState('')
  const [adjPhone, setAdjPhone] = useState('')
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
    if (!rentalId) return
    setLoading(true); setErr(null); setF(null); setDirty(false)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/fmi-rentals/${rentalId}`, { headers })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j?.error || !j?.data) throw new Error(j?.error || '불러오기 실패')
      setF(j.data)
      setRetDate(toLocalInput(j.data.expected_return_date))
      setAdjName(j.data.adjuster_name || '')
      setAdjPhone(j.data.adjuster_phone || '')
    } catch (e: any) { setErr(e?.message || '오류') }
    finally { setLoading(false) }
  }, [rentalId])

  useEffect(() => { load() }, [load])

  // ESC 로 닫기
  useEffect(() => {
    if (!rentalId) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [rentalId, onClose])

  const patch = useCallback(async (body: Record<string, any>, okMsg: string) => {
    if (!rentalId) return false
    setBusy(true); setErr(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/fmi-rentals/${rentalId}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j?.error) throw new Error(j?.error || '저장 실패')
      if (j?.data) setF(j.data)
      setSavedMsg(okMsg)
      setTimeout(() => setSavedMsg(null), 3000)
      onChanged()
      return true
    } catch (e: any) { setErr(e?.message || '저장 오류'); return false }
    finally { setBusy(false) }
  }, [rentalId, onChanged])

  // 상담 기록 — 즉시 저장
  const appendNote = useCallback(async (next: string) => {
    const ok = await patch({ consultation_note: next }, '상담 기록됨')
    if (!ok) throw new Error('저장 실패')
  }, [patch])

  // 일정/담당 저장
  const saveSchedule = useCallback(async () => {
    const ok = await patch({
      expected_return_date: retDate || null,
      adjuster_name: adjName || null,
      adjuster_phone: adjPhone || null,
    }, '일정·담당 저장됨')
    if (ok) setDirty(false)
  }, [patch, retDate, adjName, adjPhone])

  if (!rentalId) return null

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 13, color: '#1e293b', background: '#fff' } as const
  const lab = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 } as const
  const secTitle = { fontSize: 12, fontWeight: 800, marginBottom: 10 } as const

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 48, background: 'rgba(15,23,42,0.35)', display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.L5, backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
          width: 'min(440px, 100vw)', height: '100dvh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-18px 0 50px rgba(15,23,42,0.22)',
          borderLeft: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            🚗 {f?.vehicle_car_number || '…'}
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}> ↔ 사고 {f?.customer_car_number || '-'}</span>
          </div>
          {f?.status && (
            <span style={{ fontSize: 11, fontWeight: 800, color: COLORS.primary, background: COLORS.bgBlue, padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
              {STATUS_LABEL[f.status] || f.status}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} aria-label="닫기"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 17, color: '#64748b', padding: 4 }}>✕</button>
        </div>

        {/* 본문 (스크롤) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
          {loading && <div style={{ fontSize: 13, color: '#64748b', padding: 20 }}>불러오는 중…</div>}
          {err && (
            <div style={{ ...GLASS.L3, padding: 10, borderRadius: 9, border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#991b1b', marginBottom: 12 }}>⚠ {err}</div>
          )}
          {savedMsg && (
            <div style={{ ...GLASS.L3, padding: 10, borderRadius: 9, border: '1px solid rgba(16,185,129,0.4)', fontSize: 12, fontWeight: 700, color: '#065f46', marginBottom: 12 }}>✅ {savedMsg}</div>
          )}

          {f && (
            <>
              {/* 요약 (읽기) */}
              <div style={{ ...GLASS.L3, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <div style={{ ...secTitle, color: '#1d4ed8' }}>👤 고객 · 보험</div>
                <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr', rowGap: 5, fontSize: 12.5 }}>
                  <span style={{ color: '#94a3b8', fontWeight: 700 }}>고객</span>
                  <span style={{ color: '#1e293b', fontWeight: 700 }}>{f.customer_name || '-'}{f.customer_phone ? ` · ${f.customer_phone}` : ''}</span>
                  <span style={{ color: '#94a3b8', fontWeight: 700 }}>보험사</span>
                  <span style={{ color: '#1e293b' }}>{f.insurance_company || '-'}{f.insurance_claim_no ? ` · #${f.insurance_claim_no}` : ''}</span>
                  <span style={{ color: '#94a3b8', fontWeight: 700 }}>입고공장</span>
                  <span style={{ color: '#1e293b' }}>{f.repair_factory ? `🔧 ${f.repair_factory}` : '-'}</span>
                  <span style={{ color: '#94a3b8', fontWeight: 700 }}>출고</span>
                  <span style={{ color: '#1e293b' }}>{fmtDt(f.dispatch_date)}</span>
                </div>
              </div>

              {/* 상담 타임라인 — 즉시 저장 */}
              <div style={{ ...GLASS.L3, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <div style={{ ...secTitle, color: '#0f2440' }}>💬 상담 기록</div>
                <ConsultationTimeline value={f.consultation_note} onAppend={appendNote} busy={busy} />
              </div>

              {/* 일정 / 담당 편집 */}
              <div style={{ ...GLASS.L3, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                <div style={{ ...secTitle, color: '#065f46' }}>📅 일정 · 담당</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={lab}>반납예정</label>
                    <input type="datetime-local" value={retDate}
                      onChange={(e) => { setRetDate(e.target.value); setDirty(true) }} style={inp} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={lab}>담당자</label>
                      <input value={adjName} onChange={(e) => { setAdjName(e.target.value); setDirty(true) }} style={inp} />
                    </div>
                    <div>
                      <label style={lab}>담당 연락처</label>
                      <input value={adjPhone} onChange={(e) => { setAdjPhone(e.target.value); setDirty(true) }} style={inp} />
                    </div>
                  </div>
                  {dirty && (
                    <button onClick={saveSchedule} disabled={busy}
                      style={{ alignSelf: 'flex-end', padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', cursor: busy ? 'wait' : 'pointer', fontWeight: 800, fontSize: 12, opacity: busy ? 0.5 : 1 }}>
                      {busy ? '저장 중…' : '💾 일정·담당 저장'}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 푸터 */}
        {f && (
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid rgba(0,0,0,0.06)', flexShrink: 0 }}>
            {f.status === 'dispatched' && !f.actual_return_date && (
              <button
                onClick={() => { onClose(); onRequestReturn(f) }}
                style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.1)', color: '#b45309', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}
              >🏁 반납</button>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={() => router.push(`/operations/rentals/${rentalId}?from=dispatched`)}
              style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}
            >전체 편집 →</button>
          </div>
        )}
      </div>
    </div>
  )
}
