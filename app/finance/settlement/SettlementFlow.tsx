'use client'

// ═══════════════════════════════════════════════════════════════
// 정산 — 4단계 흐름 (REDESIGN 3장: "매월 N일, 버튼 몇 번으로 끝나는 정산")
//   ① 계산 → ② 검토 → ③ 확정(정산서 발송) → ④ 지급 (이체·완료 처리)
//   2026-07-30 rebuild-fresh: 흐름 셸·계산·검토는 백지 재작성.
//   계산 로직은 기존 settlement-builder/useSettlementData 재사용 (숫자 동일).
//   ③④의 실작업(발송·이체 파일·지급)은 검증된 구 화면(/finance/settlement/execute)
//   으로 연결 — 이후 단계에서 흡수 예정.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../../context/AppContext'
import { COLORS } from '@/app/utils/ui-tokens'
import { useSettlementData } from './hooks/useSettlementData'
import ContractsTab from './ContractsTab'
import type { SettlementItem } from './lib/types'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

type StepKey = 1 | 2 | 3 | 4

const STEPS: Array<{ n: StepKey; label: string }> = [
  { n: 1, label: '계산' },
  { n: 2, label: '검토' },
  { n: 3, label: '확정' },
  { n: 4, label: '지급' },
]

// 확인 필요 판정 — 매출 0 / 지급액 0 이하 / 연체 표시
function needsReview(i: SettlementItem): string | null {
  if (i.breakdown && i.breakdown.revenue === 0) return '매출 0원'
  if (i.amount <= 0) return '지급액 0원 이하'
  if (i.isOverdue) return '지급일 경과'
  return null
}

const TYPE_LABEL: Record<string, string> = { jiip: '지입', invest: '투자', loan: '대출' }

export default function SettlementFlow() {
  const router = useRouter()
  const { company, role } = useApp()
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [step, setStep] = useState<StepKey>(2)
  const [typeFilter, setTypeFilter] = useState<'all' | 'jiip' | 'invest' | 'review'>('all')

  // 연도 보기 (2026-07-30 사용자 요청) — 12개월 발송/지급 현황 한눈에
  // 'contracts' — 지입·투자 계약 원장 (2026-08-05 사용자 요청: 계약 페이지 복원, ContractsTab 재사용)
  const [view, setView] = useState<'month' | 'year' | 'contracts'>('month')
  const [year, setYear] = useState(new Date().getFullYear())
  const [yearShares, setYearShares] = useState<Array<{ settlement_month: string; total_amount: number; paid_at: string | null }> | null>(null)
  const [yearLoading, setYearLoading] = useState(false)

  useEffect(() => {
    if (view !== 'year') return
    let cancelled = false
    ;(async () => {
      setYearLoading(true)
      try {
        const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).join(',')
        const headers = await getAuthHeader()
        const res = await fetch(`/api/settlement/shares?months=${months}`, { headers })
        const json = await res.json().catch(() => ({}))
        if (!cancelled) setYearShares(Array.isArray(json?.data) ? json.data : [])
      } catch {
        if (!cancelled) setYearShares([])
      } finally {
        if (!cancelled) setYearLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [view, year])

  const yearByMonth = useMemo(() => {
    const map = new Map<string, { count: number; paidCount: number; total: number; paidTotal: number }>()
    for (const s of yearShares || []) {
      const m = String(s.settlement_month || '')
      if (!m) continue
      const cur = map.get(m) || { count: 0, paidCount: 0, total: 0, paidTotal: 0 }
      cur.count += 1
      cur.total += Number(s.total_amount) || 0
      if (s.paid_at) { cur.paidCount += 1; cur.paidTotal += Number(s.total_amount) || 0 }
      map.set(m, cur)
    }
    return map
  }, [yearShares])

  const {
    settlementItems, shareHistory, jiips, investors, transactions,
    allJiipContracts, allInvestContracts, contractsSettleTxs, allPaidShares,
    loading, refresh,
  } = useSettlementData(month, company?.id, role)

  const jiipItems = useMemo(() => settlementItems.filter(i => i.type === 'jiip'), [settlementItems])
  const investItems = useMemo(() => settlementItems.filter(i => i.type === 'invest'), [settlementItems])
  const reviewItems = useMemo(() => settlementItems.filter(i => needsReview(i)), [settlementItems])
  const totalPayout = useMemo(() => settlementItems.reduce((s, i) => s + Math.max(i.amount, 0), 0), [settlementItems])

  const sentNames = useMemo(() => new Set(shareHistory.map(s => s.recipient_name)), [shareHistory])
  const unpaidShares = useMemo(() => shareHistory.filter(s => !s.paid_at), [shareHistory])
  const paidShares = useMemo(() => shareHistory.filter(s => s.paid_at), [shareHistory])
  const unsent = useMemo(() => settlementItems.filter(i => i.status === 'pending' && !sentNames.has(i.name)), [settlementItems, sentNames])

  // 단계 진행 상태 — 데이터 기준 자동 판정
  const stepDone: Record<StepKey, boolean> = {
    1: !loading && settlementItems.length > 0,
    2: !loading && reviewItems.length === 0 && settlementItems.length > 0,
    3: !loading && settlementItems.length > 0 && unsent.length === 0,
    4: !loading && shareHistory.length > 0 && unpaidShares.length === 0,
  }

  // 월 이동
  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const isCurrentMonth = month === new Date().toISOString().slice(0, 7)
  const monthLabel = `${Number(month.split('-')[0])}년 ${Number(month.split('-')[1])}월`

  // 검토 테이블 필터
  const tableItems = useMemo(() => {
    if (typeFilter === 'jiip') return jiipItems
    if (typeFilter === 'invest') return investItems
    if (typeFilter === 'review') return reviewItems
    return settlementItems
  }, [typeFilter, settlementItems, jiipItems, investItems, reviewItems])

  const panelStyle: React.CSSProperties = {
    background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12,
    boxShadow: '0 1px 2px rgba(16,24,40,0.05)', overflow: 'hidden',
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, color: COLORS.textPrimary, fontSize: 14 }}>
      {/* 페이지 헤더 + 월 선택 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 21, letterSpacing: '-0.02em', fontWeight: 700 }}>정산 — {monthLabel}</h1>
          <p style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 3 }}>
            {loading ? '계산 중...' : `지입 차주 ${jiipItems.length}명 · 투자자 ${investItems.length}명 · 총 지급 예정 ${won(totalPayout)}원`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* 월/연도 보기 토글 */}
          <div style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: COLORS.borderFaint }}>
            {([['month', '월 보기'], ['year', '연도 보기'], ['contracts', '계약']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setView(k)}
                style={{
                  padding: '5px 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 7, cursor: 'pointer',
                  border: view === k ? `1px solid ${COLORS.borderSubtle}` : '1px solid transparent',
                  background: view === k ? '#fff' : 'transparent',
                  color: view === k ? COLORS.textPrimary : COLORS.textMuted,
                }}>{label}</button>
            ))}
          </div>
          {view === 'month' ? (
            <>
              <button onClick={() => shiftMonth(-1)}
                style={{ border: `1px solid ${COLORS.borderSubtle}`, background: '#fff', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, cursor: 'pointer' }}>
                ◀ 이전 달
              </button>
              <button onClick={() => shiftMonth(1)} disabled={isCurrentMonth}
                style={{ border: `1px solid ${COLORS.borderSubtle}`, background: '#fff', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, cursor: isCurrentMonth ? 'default' : 'pointer', opacity: isCurrentMonth ? 0.45 : 1 }}>
                다음 달 ▶
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setYear(y => y - 1)}
                style={{ border: `1px solid ${COLORS.borderSubtle}`, background: '#fff', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, cursor: 'pointer' }}>
                ◀ {year - 1}년
              </button>
              <button onClick={() => setYear(y => y + 1)} disabled={year >= new Date().getFullYear()}
                style={{ border: `1px solid ${COLORS.borderSubtle}`, background: '#fff', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, cursor: year >= new Date().getFullYear() ? 'default' : 'pointer', opacity: year >= new Date().getFullYear() ? 0.45 : 1 }}>
                {year + 1}년 ▶
              </button>
            </>
          )}
        </div>
      </div>

      {view === 'month' && (<>
      {/* 스테퍼 */}
      <div style={{ display: 'flex', marginBottom: 20 }}>
        {STEPS.map((s, i) => {
          const now = step === s.n
          const done = stepDone[s.n]
          return (
            <button key={s.n} onClick={() => setStep(s.n)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
                background: now ? COLORS.bgBlue : '#fff',
                border: `1px solid ${COLORS.borderSubtle}`, borderRight: i < STEPS.length - 1 ? 'none' : `1px solid ${COLORS.borderSubtle}`,
                borderRadius: i === 0 ? '12px 0 0 12px' : i === STEPS.length - 1 ? '0 12px 12px 0' : 0,
                color: now ? COLORS.primary : done ? COLORS.success : COLORS.textMuted,
                fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
              }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0, fontWeight: 700,
                background: now ? COLORS.primary : done ? COLORS.bgGreen : COLORS.borderFaint,
                color: now ? '#fff' : done ? COLORS.success : COLORS.textMuted,
              }}>{done && !now ? '✓' : s.n}</span>
              {s.n}. {s.label}
            </button>
          )
        })}
      </div>

      {/* ── ① 계산 ── */}
      {step === 1 && (
        <div style={panelStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, padding: '13px 16px', borderBottom: `1px solid ${COLORS.borderFaint}` }}>
            {monthLabel} 정산 계산 — 자동으로 집계됩니다
          </div>
          {[
            { k: '집계 거래', v: loading ? '—' : `${transactions.length.toLocaleString()}건` },
            { k: '지입 계약 (운영중)', v: loading ? '—' : `${jiips.length}건 → 정산 대상 ${jiipItems.length}명` },
            { k: '투자 계약 (운영중)', v: loading ? '—' : `${investors.length}건 → 정산 대상 ${investItems.length}명` },
            { k: '총 지급 예정액', v: loading ? '—' : `${won(totalPayout)}원` },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', fontSize: 13.5, borderBottom: `1px solid ${COLORS.borderFaint}` }}>
              <span style={{ color: COLORS.textSecondary }}>{row.k}</span><b>{row.v}</b>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, padding: '13px 16px', justifyContent: 'flex-end' }}>
            <button onClick={refresh}
              style={{ border: `1px solid ${COLORS.borderSubtle}`, background: '#fff', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, cursor: 'pointer' }}>
              다시 계산
            </button>
            <button onClick={() => setStep(2)}
              style={{ border: 'none', background: COLORS.primary, borderRadius: 9, padding: '8px 18px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
              검토로 이동
            </button>
          </div>
        </div>
      )}

      {/* ── ② 검토 ── */}
      {step === 2 && (
        <>
          {reviewItems.length > 0 && (
            <div style={{ background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`, color: '#8a5a10', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, marginBottom: 14 }}>
              확인이 필요한 대상이 {reviewItems.length}명 있습니다 — 아래 「확인 필요」 필터로 살펴보고 이상 없으면 확정 단계로 진행하세요.
            </div>
          )}
          <div style={panelStyle}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${COLORS.borderFaint}`, flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: `전체 ${settlementItems.length}` },
                { key: 'jiip', label: `지입 ${jiipItems.length}` },
                { key: 'invest', label: `투자 ${investItems.length}` },
                { key: 'review', label: `확인 필요 ${reviewItems.length}` },
              ].map(f => {
                const on = typeFilter === f.key
                return (
                  <button key={f.key} onClick={() => setTypeFilter(f.key as any)}
                    style={{
                      padding: '6px 13px', borderRadius: 99, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                      border: `1px solid ${on ? '#1a1d23' : COLORS.borderSubtle}`,
                      background: on ? '#1a1d23' : '#fff',
                      color: on ? '#fff' : f.key === 'review' && reviewItems.length > 0 ? COLORS.danger : COLORS.textSecondary,
                    }}>{f.label}</button>
                )
              })}
              <span style={{ flex: 1 }} />
              <button onClick={() => setStep(3)}
                style={{ border: 'none', background: COLORS.primary, borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
                이상 없음 — 확정으로
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['대상자', '구분', '차량', '수입', '비용', '지입비', '배분율', '지급액', '확인'].map((h, i) => (
                      <th key={h} style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600, textAlign: i >= 3 && i <= 7 ? 'right' : 'left', padding: '10px 14px', borderBottom: `1px solid ${COLORS.borderFaint}`, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={9} style={{ padding: 36, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>계산 중...</td></tr>}
                  {!loading && tableItems.length === 0 && <tr><td colSpan={9} style={{ padding: 36, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>해당하는 정산 대상이 없습니다</td></tr>}
                  {tableItems.map(item => {
                    const b = item.breakdown
                    const warn = needsReview(item)
                    return (
                      <tr key={item.id} style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                        <td style={{ padding: '11px 14px', fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{item.name}</td>
                        <td style={{ padding: '11px 14px', fontSize: 12.5, whiteSpace: 'nowrap' }}>{TYPE_LABEL[item.type] || item.type}</td>
                        <td style={{ padding: '11px 14px', fontSize: 12.5, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>{item.carNumber || '—'}</td>
                        <td style={{ padding: '11px 14px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b ? won(b.revenue) : '—'}</td>
                        <td style={{ padding: '11px 14px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b ? won(b.expense) : '—'}</td>
                        <td style={{ padding: '11px 14px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b?.adminFee ? won(b.adminFee) : '—'}</td>
                        <td style={{ padding: '11px 14px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b ? `${Math.round((b.shareRatio || 0) * 100)}%` : '—'}</td>
                        <td style={{ padding: '11px 14px', fontSize: 13.5, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{won(item.amount)}</td>
                        <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                          {warn
                            ? <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: COLORS.bgRed, color: COLORS.danger }}>확인 필요 · {warn}</span>
                            : item.status === 'paid'
                              ? <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: COLORS.bgGreen, color: COLORS.success }}>지급완료</span>
                              : <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: COLORS.bgGreen, color: COLORS.success }}>정상</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── ③ 확정 (정산서 발송) ── */}
      {step === 3 && (
        <div style={panelStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, padding: '13px 16px', borderBottom: `1px solid ${COLORS.borderFaint}` }}>
            확정 — 대상자에게 정산서를 보내고 지급을 준비합니다
          </div>
          {[
            { k: '발송 대기', v: `${unsent.length}명`, tone: unsent.length > 0 ? COLORS.warning : COLORS.success },
            { k: '발송 완료', v: `${shareHistory.length}건`, tone: COLORS.textPrimary },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', fontSize: 13.5, borderBottom: `1px solid ${COLORS.borderFaint}` }}>
              <span style={{ color: COLORS.textSecondary }}>{row.k}</span><b style={{ color: row.tone as string }}>{row.v}</b>
            </div>
          ))}
          <div style={{ padding: '13px 16px', fontSize: 12.5, color: COLORS.textMuted }}>
            정산서 생성·문자 발송·개별 확인은 확정 작업 화면에서 진행합니다. 완료되면 이 화면의 단계 표시가 자동으로 바뀝니다.
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px', justifyContent: 'flex-end' }}>
            <button onClick={() => router.push('/finance/settlement/execute')}
              style={{ border: 'none', background: COLORS.primary, borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
              확정 작업 열기 — 정산서 발송
            </button>
          </div>
        </div>
      )}

      {/* ── ④ 지급 ── */}
      {step === 4 && (
        <div style={panelStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, padding: '13px 16px', borderBottom: `1px solid ${COLORS.borderFaint}` }}>
            지급 — 이체 파일을 내려받아 이체하고, 완료 처리합니다
          </div>
          {[
            { k: '지급 대기', v: `${unpaidShares.length}건 · ${won(unpaidShares.reduce((s, x) => s + (Number(x.total_amount) || 0), 0))}원`, tone: unpaidShares.length > 0 ? COLORS.warning : COLORS.success },
            { k: '지급 완료', v: `${paidShares.length}건 · ${won(paidShares.reduce((s, x) => s + (Number(x.total_amount) || 0), 0))}원`, tone: COLORS.success },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', fontSize: 13.5, borderBottom: `1px solid ${COLORS.borderFaint}` }}>
              <span style={{ color: COLORS.textSecondary }}>{row.k}</span><b style={{ color: row.tone as string }}>{row.v}</b>
            </div>
          ))}
          <div style={{ padding: '13px 16px', fontSize: 12.5, color: COLORS.textMuted }}>
            이체 파일 다운로드와 지급 완료 표시는 지급 작업 화면에서 진행합니다. 지급이 끝나면 이번 달 정산이 마무리됩니다.
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px', justifyContent: 'flex-end' }}>
            <button onClick={() => router.push('/finance/settlement/execute')}
              style={{ border: 'none', background: COLORS.primary, borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
              지급 작업 열기 — 이체·완료 처리
            </button>
          </div>
        </div>
      )}
      </>)}

      {/* ── 계약 원장 — 지입·투자 계약 (구 대시보드 ContractsTab 재사용) ── */}
      {view === 'contracts' && (
        <ContractsTab
          jiipList={allJiipContracts}
          investList={allInvestContracts}
          settleTxs={contractsSettleTxs}
          shareHistory={allPaidShares}
          loading={loading}
        />
      )}

      {/* ── 연도 보기 — 12개월 발송/지급 현황 ── */}
      {view === 'year' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {Array.from({ length: 12 }, (_, i) => {
            const m = `${year}-${String(i + 1).padStart(2, '0')}`
            const stat = yearByMonth.get(m)
            const isFuture = m > new Date().toISOString().slice(0, 7)
            return (
              <div key={m}
                onClick={() => { if (!isFuture) { setMonth(m); setView('month'); setStep(2) } }}
                style={{
                  background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12,
                  padding: '14px 16px', boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
                  cursor: isFuture ? 'default' : 'pointer', opacity: isFuture ? 0.45 : 1,
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <b style={{ fontSize: 14 }}>{Number(m.split('-')[1])}월</b>
                  {yearLoading
                    ? <span style={{ fontSize: 11, color: COLORS.textMuted }}>집계 중...</span>
                    : !stat
                      ? <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: COLORS.borderFaint, color: COLORS.textMuted }}>정산 없음</span>
                      : stat.paidCount >= stat.count
                        ? <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: COLORS.bgGreen, color: COLORS.success }}>지급 완료</span>
                        : <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: COLORS.bgAmber, color: COLORS.warning }}>대기 {stat.count - stat.paidCount}건</span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: COLORS.textSecondary, marginBottom: 3 }}>
                  <span>발송</span><b style={{ color: COLORS.textPrimary }}>{stat ? `${stat.count}건 · ${won(stat.total)}원` : '—'}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: COLORS.textSecondary }}>
                  <span>지급 완료</span><b style={{ color: stat && stat.paidCount > 0 ? COLORS.success : COLORS.textPrimary }}>{stat ? `${stat.paidCount}건 · ${won(stat.paidTotal)}원` : '—'}</b>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
