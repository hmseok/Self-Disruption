'use client'

// ═══════════════════════════════════════════════════════════════
// 손익 — 차량별·회사 전체 (REDESIGN 5단계, 2026-08-01 백지 재작성)
//   계산은 전부 공통 엔진(lib/pnl-engine → /api/pnl) — 화면은 소비만.
//   미귀속 거래(차량 연결 안 된 입출금)를 계기판으로 노출해
//   "연결할수록 손익이 정확해지는" 구조를 보이게 한다.
// ═══════════════════════════════════════════════════════════════

import { Fragment, useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { COLORS } from '@/app/utils/ui-tokens'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type CarPnl = {
  carId: string
  number: string | null
  brand: string | null
  model: string | null
  status: string | null
  ownershipType: string | null
  revenue: number
  rentalRevenue: number
  expense: number
  settlementPayout: number
  netProfit: number
  profitRate: number | null
  txCount: number
  byCategory: Record<string, number>
}
type PnlData = {
  from: string; to: string
  cars: CarPnl[]
  totals: { revenue: number; expense: number; settlementPayout: number; netProfit: number; profitRate: number | null; excludedCapital: number }
  unassigned: { revenue: number; expense: number; count: number }
}

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
// 소속 = 차량 마스터 ownership_type 단일 기준 (청구/입금/카드와 동일)
const OWNERSHIP_LABEL: Record<string, string> = { company: 'FMI 직영', '빌려타': '빌려타 지입', jiip: '지입', invest: '투자', lease: '임차' }
const classOf = (o: string | null) => o === '빌려타' ? 'ride' : o === 'company' ? 'own' : 'unknown'

type PeriodKey = 'this' | 'last' | '3m' | 'year'
function periodRange(k: PeriodKey): { from: string; to: string; label: string } {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  if (k === 'this') return { from: `${today.slice(0, 7)}-01`, to: today, label: '이번 달' }
  if (k === 'last') {
    const p = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last = new Date(p.getFullYear(), p.getMonth() + 1, 0).getDate()
    return { from: `${ym(p)}-01`, to: `${ym(p)}-${last}`, label: '지난달' }
  }
  if (k === '3m') {
    const p = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    return { from: `${ym(p)}-01`, to: today, label: '최근 3개월' }
  }
  return { from: `${now.getFullYear()}-01-01`, to: today, label: '올해' }
}

export default function PnlPage() {
  const router = useRouter()
  const [period, setPeriod] = useState<PeriodKey>('this')
  const [data, setData] = useState<PnlData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [lossOnly, setLossOnly] = useState(false)
  const [cls, setCls] = useState<'all' | 'ride' | 'own'>('all') // 소속 (지입 빌려타/직영 FMI)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { from, to } = periodRange(period)
      const headers = await getAuthHeader()
      const res = await fetch(`/api/pnl?from=${from}&to=${to}`, { headers })
      const json = await res.json().catch(() => ({}))
      if (json?.data) setData(json.data)
    } finally { setLoading(false) }
  }, [period])
  useEffect(() => { load() }, [load])

  const t = data?.totals
  const lossCars = useMemo(() => (data?.cars || []).filter(c => c.netProfit < 0), [data])
  const rows = useMemo(() => {
    let list = data?.cars || []
    if (cls !== 'all') list = list.filter(c => classOf(c.ownershipType) === cls)
    if (lossOnly) list = lossCars.filter(c => cls === 'all' || classOf(c.ownershipType) === cls)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        (c.number || '').toLowerCase().includes(q) ||
        (c.model || '').toLowerCase().includes(q) ||
        (c.brand || '').toLowerCase().includes(q))
    }
    return list
  }, [data, lossOnly, lossCars, search, cls])

  // 소속별 소계 (지입/직영 손익 비교)
  const classSummary = useMemo(() => {
    const mk = () => ({ n: 0, revenue: 0, expense: 0, payout: 0, net: 0 })
    const s = { ride: mk(), own: mk() }
    for (const c of data?.cars || []) {
      const k = classOf(c.ownershipType)
      if (k !== 'ride' && k !== 'own') continue
      s[k].n++; s[k].revenue += c.revenue; s[k].expense += c.expense
      s[k].payout += c.settlementPayout; s[k].net += c.netProfit
    }
    return s
  }, [data])

  const cardStyle: React.CSSProperties = {
    background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12,
    padding: '14px 16px', boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, color: COLORS.textPrimary, fontSize: 14 }}>
      {/* 헤더 + 기간 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 21, letterSpacing: '-0.02em', fontWeight: 700 }}>손익</h1>
          <p style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 3 }}>차량별·회사 전체 손익 — 계산 기준은 공통 엔진 한 곳입니다</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['this', '이번 달'], ['last', '지난달'], ['3m', '3개월'], ['year', '올해']] as const).map(([k, label]) => {
            const on = period === k
            return (
              <button key={k} onClick={() => setPeriod(k)}
                style={{ padding: '6px 13px', borderRadius: 99, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                  border: `1px solid ${on ? '#1a1d23' : COLORS.borderSubtle}`,
                  background: on ? '#1a1d23' : '#fff', color: on ? '#fff' : COLORS.textSecondary }}>{label}</button>
            )
          })}
        </div>
      </div>

      {/* 미귀속 계기판 — 연결할수록 정확해짐 */}
      {!loading && data && data.unassigned.count > 0 && (
        <div style={{ background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`, color: '#8a5a10', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>
            <b>차량 미귀속 거래 {data.unassigned.count.toLocaleString()}건</b> — 수입 {won(data.unassigned.revenue)}원 / 지출 {won(data.unassigned.expense)}원이 어느 차량 손익에도 잡히지 않았습니다. 장부에서 차량을 연결할수록 손익이 정확해집니다.
          </span>
          <button onClick={() => router.push('/finance/bank-card')}
            style={{ marginLeft: 'auto', border: `1px solid ${COLORS.borderAmber}`, background: '#fff', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#8a5a10', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            장부에서 연결하기
          </button>
        </div>
      )}

      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.success, display: 'inline-block' }} />총 매출 (차량 귀속)
          </div>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 5, color: COLORS.success }}>{loading ? '—' : won(t?.revenue || 0)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.danger, display: 'inline-block' }} />총 비용
          </div>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 5 }}>{loading ? '—' : won((t?.expense || 0) + (t?.settlementPayout || 0))}</div>
          <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>
            정산 지급 {loading ? '—' : won(t?.settlementPayout || 0)} 포함 · 자본성 {loading ? '—' : won(t?.excludedCapital || 0)} 제외
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.info, display: 'inline-block' }} />영업이익
          </div>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 5, color: (t?.netProfit || 0) >= 0 ? COLORS.info : COLORS.danger }}>{loading ? '—' : won(t?.netProfit || 0)}</div>
          <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>{!loading && t?.profitRate != null ? `이익률 ${t.profitRate}%` : ''}</div>
        </div>
        <div onClick={() => setLossOnly(v => !v)}
          style={{ ...cardStyle, cursor: 'pointer', border: lossOnly ? `1.5px solid ${COLORS.danger}` : cardStyle.border }}>
          <div style={{ fontSize: 12.5, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.danger, display: 'inline-block' }} />적자 차량
          </div>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 5, color: COLORS.danger }}>{loading ? '—' : `${lossCars.length}대`}</div>
          <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>클릭하면 해당 차량만 표시</div>
        </div>
      </div>

      {/* 소속별 소계 — 지입 vs 직영 손익 비교 (2026-08-05 사용자 요청) */}
      {!loading && (classSummary.ride.n > 0 || classSummary.own.n > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          {([['ride', '빌려타 지입', '#6d28d9', '#ede9fe'], ['own', 'FMI 직영', '#1d4ed8', '#dbeafe']] as const).map(([k, label, fg, bg]) => {
            const s = classSummary[k]
            return (
              <div key={k} onClick={() => setCls(cls === k ? 'all' : k)}
                style={{ background: '#fff', border: `1.5px solid ${cls === k ? fg : COLORS.borderSubtle}`, borderRadius: 12, padding: '12px 15px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2.5px 9px', borderRadius: 6, background: bg, color: fg }}>{label}</span>
                  <span style={{ fontSize: 12, color: COLORS.textMuted }}>{s.n}대</span>
                  <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 800, color: s.net >= 0 ? COLORS.success : COLORS.danger, fontVariantNumeric: 'tabular-nums' }}>{won(s.net)}원</span>
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>
                  매출 {won(s.revenue)} − 비용 {won(s.expense)}{s.payout > 0 ? ` − 정산지급 ${won(s.payout)}` : ''}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 테이블 */}
      <div style={{ background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12, boxShadow: '0 1px 2px rgba(16,24,40,0.05)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: `1px solid ${COLORS.borderFaint}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 8, padding: '6px 11px', background: COLORS.bgGray, flex: '0 1 240px' }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="차량번호, 모델 검색..."
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          </div>
          {/* 소속 필터 */}
          <div style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: COLORS.borderFaint }}>
            {([['all', '전체'], ['ride', '지입'], ['own', '직영']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setCls(k)}
                style={{ padding: '4px 11px', fontSize: 12, fontWeight: 600, borderRadius: 7, cursor: 'pointer',
                  border: cls === k ? `1px solid ${COLORS.borderSubtle}` : '1px solid transparent',
                  background: cls === k ? '#fff' : 'transparent', color: cls === k ? COLORS.textPrimary : COLORS.textMuted }}>{label}</button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: COLORS.textMuted }}>수익률 낮은 순 · 거래가 귀속된 차량만 표시 · 차량번호 ↗ = 차량 상세</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['차량', '소유', '매출', '비용', '정산 지급', '순이익', '수익률'].map((h, i) => (
                  <th key={h} style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600, textAlign: i >= 2 ? 'right' : 'left', padding: '10px 14px', borderBottom: `1px solid ${COLORS.borderFaint}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ padding: 36, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>계산 중...</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 36, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>
                  {lossOnly ? '적자 차량이 없습니다' : '이 기간에 차량 귀속 거래가 없습니다 — 장부에서 거래에 차량을 연결해 주세요'}
                </td></tr>
              )}
              {rows.map(c => (
                <Fragment key={c.carId}>
                  <tr onClick={() => setExpanded(expanded === c.carId ? null : c.carId)}
                    style={{ borderBottom: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer' }}>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <b style={{ fontSize: 13.5 }}>{c.number || '—'}</b>
                      <span style={{ color: COLORS.textMuted, fontSize: 12.5 }}> {[c.brand, c.model].filter(Boolean).join(' ')}</span>
                      <button onClick={(e) => { e.stopPropagation(); router.push(`/cars/${c.carId}`) }}
                        title="차량 상세로"
                        style={{ marginLeft: 6, border: 'none', background: 'none', cursor: 'pointer', color: COLORS.primary, fontSize: 12, fontWeight: 700, padding: 0 }}>↗</button>
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      {classOf(c.ownershipType) === 'ride'
                        ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2.5px 8px', borderRadius: 6, background: '#ede9fe', color: '#6d28d9' }}>빌려타 지입</span>
                        : classOf(c.ownershipType) === 'own'
                          ? <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2.5px 8px', borderRadius: 6, background: '#dbeafe', color: '#1d4ed8' }}>FMI 직영</span>
                          : <span style={{ fontSize: 12, color: COLORS.textMuted }}>{OWNERSHIP_LABEL[c.ownershipType || ''] || c.ownershipType || '—'}</span>}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{won(c.revenue)}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{won(c.expense)}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.settlementPayout > 0 ? won(c.settlementPayout) : '—'}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13.5, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: c.netProfit >= 0 ? COLORS.textPrimary : COLORS.danger }}>{won(c.netProfit)}</td>
                    <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, textAlign: 'right', color: c.profitRate == null ? COLORS.textDim : c.profitRate >= 20 ? COLORS.success : c.profitRate >= 0 ? COLORS.warning : COLORS.danger }}>
                      {c.profitRate != null ? `${c.profitRate}%` : '—'}
                    </td>
                  </tr>
                  {expanded === c.carId && (
                    <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}`, background: COLORS.bgGray }}>
                      <td colSpan={7} style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5 }}>
                          <span style={{ color: COLORS.textMuted }}>거래 {c.txCount}건</span>
                          {c.rentalRevenue > 0 && <span>대차 매출 <b>{won(c.rentalRevenue)}</b></span>}
                          {Object.entries(c.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => (
                            <span key={k}>{k} <b>{won(v)}</b></span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
