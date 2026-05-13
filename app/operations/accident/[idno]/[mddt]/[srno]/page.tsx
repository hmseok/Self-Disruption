'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { GLASS } from '@/app/utils/ui-tokens'
import type { Cafe24Detail, Cafe24Memo, DispatchOrder } from '@/app/operations/intake/types'
import { fmtCafe24DateTime } from '@/app/operations/intake/types'

// ═══════════════════════════════════════════════════════════════════
// /operations/accident/[idno]/[mddt]/[srno] — PR-OPS-1.5c
//
// 사고접수 상세페이지 (P1.5b 모달 대체).
// 사용자 명시: 「모달로 하기에도 한계, 상세페이지 구성으로 보는 것이 좋을 듯」
//
// cafe24 detail 30+ 필드 + 메모 timeline + 차량 마스터 정보 + 「대차로 변환됨」 배지.
// 모듈: app/operations/* (Rule 21)
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

function joinAddr(...parts: Array<string | null>): string {
  return parts.filter((p) => p && p.trim()).join(' ')
}

function rideAccidentIdFromIdno(idno: string): number {
  return parseInt(String(idno).replace(/[^0-9]/g, '').slice(0, 9) || '0', 10)
}

const RSLT_LABEL: Record<string, string> = {
  '1': '🆕 접수',
  '2': '📞 진행중',
  '3': '✅ 종결',
}

const TYPP_LABEL: Record<string, string> = {
  B: '법정검사',
  J: '정비상담',
  I: '정비상담',
  P: '긴급출동',
  G: '긴급출동',
  K: '긴급출동',
  D: '사고접수',
}

export default function AccidentDetailPage({
  params,
}: {
  params: Promise<{ idno: string; mddt: string; srno: string }>
}) {
  const { idno, mddt, srno } = use(params)
  const router = useRouter()

  const [detail, setDetail] = useState<Cafe24Detail | null>(null)
  const [memos, setMemos] = useState<Cafe24Memo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dispatchOrder, setDispatchOrder] = useState<DispatchOrder | null>(null)
  const [proceedBusy, setProceedBusy] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // ── 우리 시스템에서 대차로 진행 (사용자 명시 — 카페24 외 자체 dispatch_order 생성) ──
  const proceedToDispatch = useCallback(async () => {
    if (proceedBusy) return
    if (!window.confirm('우리 시스템에 대차요청을 등록합니다. 진행할까요?')) return
    setProceedBusy(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch('/api/operations/dispatch-orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ride_accident_id: rideAccidentIdFromIdno(idno),
          status: 'consulting',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (json.error) throw new Error(json.error)
      // 새 dispatch_order 정보로 state 갱신
      setDispatchOrder({
        id: json.id,
        ride_accident_id: json.ride_accident_id,
        consultation_note: null,
        customer_request: null,
        expected_dispatch_date: null,
        expected_return_date: null,
        status: json.status || 'consulting',
        assigned_to: null,
        fmi_rental_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      setToast({ type: 'ok', text: '우리 시스템에 대차요청 등록됨' })
      setTimeout(() => setToast(null), 5000)
    } catch (e: any) {
      const msg = e?.message || '대차 진행 실패'
      // 이미 active dispatch_order 있는 경우 409 fallback
      if (msg.includes('이미 진행 중')) {
        setToast({ type: 'ok', text: '이미 대차 진행 중 — 새로고침 권장' })
      } else {
        setToast({ type: 'err', text: msg })
      }
      setTimeout(() => setToast(null), 5000)
    } finally {
      setProceedBusy(false)
    }
  }, [idno, proceedBusy])

  // ── Fetch detail + memos + dispatch_order (병렬) ──
  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ idno, mddt, srno })
    try {
      const headers = await getAuthHeader()
      const [detailRes, memosRes, ordersRes] = await Promise.all([
        fetch(`/api/cafe24/accidents/detail?${params}`, { headers }),
        fetch(`/api/cafe24/accidents/memos?${params}`, { headers }),
        fetch('/api/operations/dispatch-orders', { headers }),
      ])
      const detailJson = await detailRes.json().catch(() => ({}))
      const memosJson = await memosRes.json().catch(() => ({}))
      const ordersJson = await ordersRes.json().catch(() => ({}))

      if (detailJson?.success && detailJson.data) setDetail(detailJson.data as Cafe24Detail)
      else { setDetail(null); setError(detailJson?.error || 'cafe24 미연결') }

      setMemos((memosJson?.success && Array.isArray(memosJson.data)) ? memosJson.data : [])

      const rideAccidentId = rideAccidentIdFromIdno(idno)
      const orders: DispatchOrder[] = Array.isArray(ordersJson?.data) ? ordersJson.data : []
      setDispatchOrder(orders.find((o) => o.ride_accident_id === rideAccidentId) || null)
    } catch (e: any) {
      setError(e?.message || 'fetch 실패')
    } finally {
      setLoading(false)
    }
  }, [idno, mddt, srno])

  useEffect(() => { fetchAll() }, [fetchAll])

  // 점검 항목
  const checkItems: Array<[string, string | null]> = detail ? [
    ['🔋 배터리', detail.esosbate as any],
    ['🛞 타이어', detail.esostire as any],
    ['🛢 오일', detail.esosoils as any],
    ['🔒 잠금', detail.esoslock as any],
    ['🚛 이동', detail.esosmove as any],
    ['🚑 구난', detail.esoshelp as any],
  ] : []
  const activeChecks = checkItems.filter(([_, v]) => v === 'Y')

  return (
    <div className="page-bg">
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">
        {/* Header / breadcrumb (PageTitle 자동 외 추가 액션) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f2440', margin: 0, whiteSpace: 'nowrap' }}>
              🚨 {detail?.cars_no || idno}
              <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginLeft: 8 }}>
                {detail?.cars_model || ''}
              </span>
            </h1>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, whiteSpace: 'nowrap' }}>
              사고접수 · {fmtCafe24DateTime(detail?.esosacdt || null, detail?.esosactm || null)} ·
              접수번호 {idno} / {mddt} / {srno}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => router.back()} style={ghostBtn}>← 목록</button>
            <button onClick={fetchAll} disabled={loading} style={subtleBtn}>↻ 새로고침</button>
            {!dispatchOrder && (
              <button
                onClick={proceedToDispatch}
                disabled={proceedBusy}
                style={{ ...secondaryBtn, opacity: proceedBusy ? 0.5 : 1, cursor: proceedBusy ? 'wait' : 'pointer' }}
              >{proceedBusy ? '⏳ 처리 중…' : '🚗 대차로 진행'}</button>
            )}
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            style={{
              marginBottom: 16,
              padding: 14,
              background: toast.type === 'ok' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${toast.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              color: toast.type === 'ok' ? '#065f46' : '#991b1b',
            }}
          >
            {toast.type === 'ok' ? '✅' : '⚠️'} {toast.text}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          {/* MAIN COLUMN */}
          <div>
            {/* 사고 정보 — cafe24 detail */}
            <Section icon="📋" title="사고 정보 (cafe24 어드민)">
              {loading ? <Place>cafe24 조회 중…</Place>
                : error ? <Place warn>⚠ {error}</Place>
                : detail ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px 1fr', gap: '8px 16px', fontSize: 12 }}>
                    <Lbl>📍 위치</Lbl><Val span={3}>{joinAddr(detail.esosaddr, detail.esosadnm, detail.esosadtl) || '-'}</Val>
                    <Lbl>🧍 요청자</Lbl><Val>{detail.esosusnm || '-'}</Val>
                    <Lbl>📱 연락처</Lbl><Val>{detail.esosustl || '-'}</Val>
                    <Lbl>🚗 차량번호</Lbl><Val>{detail.cars_no || detail.esosusvp || '-'}</Val>
                    <Lbl>🚙 차종</Lbl><Val>{detail.cars_model || detail.esosusvd || '-'}</Val>
                    <Lbl>📏 주행거리</Lbl><Val>{detail.esoskilo ? `${detail.esoskilo} km` : '-'}</Val>
                    {activeChecks.length > 0 && (<>
                      <Lbl>🔧 점검</Lbl>
                      <Val span={3}>{activeChecks.map(([k]) => k).join(' · ')}</Val>
                    </>)}
                    {detail.esosrstx && (<>
                      <Lbl>📝 사고 메모</Lbl>
                      <Val span={3} preWrap>{detail.esosrstx}</Val>
                    </>)}
                    {detail.esosmemo && (<>
                      <Lbl>💭 상담 메모</Lbl>
                      <Val span={3} preWrap>{detail.esosmemo}</Val>
                    </>)}
                    {detail.esosinft && (<>
                      <Lbl>ℹ️ 추가 정보</Lbl>
                      <Val span={3} preWrap>{detail.esosinft}</Val>
                    </>)}
                    <Lbl>🕓 등록</Lbl>
                    <Val span={3}>
                      {fmtCafe24DateTime(detail.esosgndt, detail.esosgntm) || '-'}
                      {detail.esosgnus && <span style={{ marginLeft: 6, color: '#94a3b8' }}>· {detail.esosgnus}</span>}
                    </Val>
                  </div>
                ) : <Place>사고 상세 없음</Place>}
            </Section>

            {/* 콜센터 메모 */}
            <Section icon="📞" title={`콜센터 메모 (${memos.length})`}>
              {loading ? <Place>cafe24 메모 조회 중…</Place>
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
          </div>

          {/* SIDE COLUMN */}
          <div>
            {/* 상태 배지 */}
            <Section icon="🏷️" title="상태">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                <Row><Lbl>단계</Lbl><Val>{RSLT_LABEL[detail?.esosidno ? '1' : '1'] || '-'}</Val></Row>
                <Row><Lbl>등록상태</Lbl><Val>활성</Val></Row>
                <Row><Lbl>접수타입</Lbl><Val>{TYPP_LABEL[(detail as any)?.esostypp || ''] || (detail as any)?.esostypp || '-'}</Val></Row>
                {dispatchOrder && (
                  <Row>
                    <Lbl>우리 작업</Lbl>
                    <Val>
                      <span style={{ background: 'rgba(99,102,241,0.12)', color: '#4338ca', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                        🚗 대차 진행 중 ({dispatchOrder.status})
                      </span>
                    </Val>
                  </Row>
                )}
              </div>
            </Section>

            <Section icon="🚗" title="차량 마스터">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                <Row><Lbl>차량번호</Lbl><Val>{detail?.cars_no || '-'}</Val></Row>
                <Row><Lbl>차종</Lbl><Val>{detail?.cars_model || '-'}</Val></Row>
              </div>
            </Section>

            {dispatchOrder && (
              <Section icon="🚗" title="우리 대차 진행">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <Row><Lbl>상태</Lbl><Val>{dispatchOrder.status}</Val></Row>
                  <Row><Lbl>등록</Lbl><Val>{new Date(dispatchOrder.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</Val></Row>
                  {dispatchOrder.expected_dispatch_date && <Row><Lbl>예상 배차일</Lbl><Val>{dispatchOrder.expected_dispatch_date}</Val></Row>}
                  {dispatchOrder.expected_return_date && <Row><Lbl>예상 반납일</Lbl><Val>{dispatchOrder.expected_return_date}</Val></Row>}
                </div>
                <div style={{ marginTop: 10, padding: 10, background: 'rgba(99,102,241,0.08)', borderRadius: 8, fontSize: 11, color: '#4338ca', lineHeight: 1.5 }}>
                  📋 상담 / 일정 / 배차 확정은 본 화면 하단 (P1.5d-2 추가 예정) 또는 「대차접수」 탭에서 관리.
                </div>
              </Section>
            )}

            <div style={{ marginTop: 12, padding: 10, background: 'rgba(241,245,249,0.6)', borderRadius: 8, fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
              ℹ️ 사고접수 단계 — cafe24 데이터 read-only.<br />
              {!dispatchOrder && '우리 시스템에서 대차로 진행하려면 상단 [🚗 대차로 진행] 버튼.'}
            </div>
          </div>
        </div>
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

const primaryBtn: React.CSSProperties = {
  display: 'inline-block',
  padding: '8px 14px',
  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 12,
  whiteSpace: 'nowrap',
}

const secondaryBtn: React.CSSProperties = {
  ...primaryBtn,
  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
}
