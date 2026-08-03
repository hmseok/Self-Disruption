'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { COLORS } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'

// ═══════════════════════════════════════════════════════════════════
// CollectionTab — 장부 「수금」 (2026-08-03 사용자 확정, 목업 ar-collection)
//
// 회사 관점 채권 통합 1단계: 월별 수납 흐름(통장+빌려타 정산) ·
// 청구완료·입금대기 리스트(시트 플래그) · 채권 원장(소속/유형 필터).
// 청구액 입력이 쌓이면 금액 미수 KPI 가 자동으로 살아난다 (2단계).
// 업무 화면(단기·대차/장기계약)은 청구 작성·건별 입금 확인만 담당.
// ═══════════════════════════════════════════════════════════════════

type ArItem = {
  id: string
  customer_name: string | null
  customer_car_number: string | null
  vehicle_car_number: string | null
  insurance_company: string | null
  dispatch_date: string | null
  return_date: string | null
  status: string | null
  vehicle_class: 'ride' | 'own' | 'unknown'
  claim_amount: number | null
  bank_paid: number
  ride_paid: number
  received: number
  last_received: string | null
  sheet_billed: string | null
  sheet_paid: string | null
  ar_state: 'received' | 'paid_flag' | 'waiting' | 'unbilled'
  elapsed_days: number | null
}
type ArMonthly = { month: string; bank: number; bank_count: number; ride: number; ride_count: number }

const nf = (n: any) => Number(n || 0).toLocaleString('ko-KR')
const d10 = (s: any) => (s ? String(s).slice(0, 10) : '—')

const CLASS_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  ride: { label: '지입', bg: '#ede9fe', fg: '#6d28d9' },
  own: { label: '직접', bg: '#dbeafe', fg: '#1d4ed8' },
  unknown: { label: '미지정', bg: '#eef1f5', fg: '#667085' },
}
const STATE_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  received: { label: '수납', bg: COLORS.bgGreen, fg: COLORS.success },
  paid_flag: { label: '입금표기(시트)', bg: COLORS.bgBlue, fg: COLORS.primary },
  waiting: { label: '입금대기', bg: COLORS.bgRed, fg: COLORS.danger },
  unbilled: { label: '미청구', bg: COLORS.borderFaint, fg: COLORS.textMuted },
}

function Badge({ meta }: { meta: { label: string; bg: string; fg: string } }) {
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2.5px 8px', borderRadius: 6, background: meta.bg, color: meta.fg, whiteSpace: 'nowrap' }}>{meta.label}</span>
}

export default function CollectionTab() {
  const [monthly, setMonthly] = useState<ArMonthly[]>([])
  const [waiting, setWaiting] = useState<ArItem[]>([])
  const [ledger, setLedger] = useState<ArItem[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [cls, setCls] = useState<'all' | 'ride' | 'own'>('all')
  const [state, setState] = useState<'all' | 'waiting' | 'received' | 'unbilled'>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { json } = await fetchWithAuth('/api/finance/ar?months=6')
      if (json && !json.error) {
        setMonthly(json.monthly || [])
        setWaiting(json.waiting || [])
        setLedger(json.ledger || [])
        setSummary(json.summary || null)
      }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    let list = ledger
    if (cls !== 'all') list = list.filter((x) => x.vehicle_class === cls)
    if (state !== 'all') list = list.filter((x) => (state === 'received' ? (x.ar_state === 'received' || x.ar_state === 'paid_flag') : x.ar_state === state))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((x) =>
        String(x.customer_name || '').toLowerCase().includes(q) ||
        String(x.customer_car_number || '').toLowerCase().includes(q) ||
        String(x.vehicle_car_number || '').toLowerCase().includes(q) ||
        String(x.insurance_company || '').toLowerCase().includes(q))
    }
    return list.slice(0, 300)
  }, [ledger, cls, state, search])

  const maxMonthTotal = useMemo(() =>
    Math.max(1, ...monthly.map((m) => m.bank + m.ride)), [monthly])

  const card: React.CSSProperties = {
    background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12,
    boxShadow: '0 1px 2px rgba(16,24,40,0.05)', overflow: 'hidden',
  }
  const hd: React.CSSProperties = { padding: '12px 16px', fontSize: 13.5, fontWeight: 700, borderBottom: `1px solid ${COLORS.borderFaint}` }
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLORS.textMuted, padding: '9px 14px', borderBottom: `1.5px solid ${COLORS.borderSubtle}`, background: '#fafbfc', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '9px 14px', borderBottom: `1px solid ${COLORS.borderFaint}`, fontSize: 12.5, whiteSpace: 'nowrap' }

  return (
    <div>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: '이번 달 수납', value: summary?.month_now ? `${nf(summary.month_now.bank + summary.month_now.ride)}원` : '—',
            sub: summary?.month_now ? `통장 ${nf(summary.month_now.bank)} · 빌려타 ${nf(summary.month_now.ride)}` : '', dot: COLORS.primary },
          { label: '빌려타 정산 수령', value: summary?.ride_last ? `${nf(summary.ride_last.total)}원` : '—',
            sub: summary?.ride_last ? `${summary.ride_last.month} · ${summary.ride_last.count}건` : '정산 업로드 전', dot: '#8b5cf6' },
          { label: '청구완료 · 입금대기', value: summary ? `${summary.waiting_count}건` : '—',
            sub: summary ? `14일 경과 ${summary.waiting_over14}건` : '', dot: COLORS.warning },
          { label: '금액 미수', value: summary && summary.claim_outstanding > 0 ? `${nf(summary.claim_outstanding)}원` : '— 원',
            sub: summary ? `청구액 미입력 ${nf(summary.claim_missing)}건 — 입력분부터 집계` : '', dot: COLORS.danger },
        ].map((k, i) => (
          <div key={i} style={{ ...card, padding: '13px 15px', overflow: 'visible' }}>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: k.dot, display: 'inline-block' }} />{k.label}
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4, letterSpacing: '-0.02em' }}>{loading ? '…' : k.value}</div>
            {k.sub && <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 14, marginBottom: 14 }}>
        {/* 월별 수납 흐름 */}
        <div style={card}>
          <div style={hd}>월별 수납 흐름 <span style={{ fontSize: 11.5, fontWeight: 500, color: COLORS.textMuted }}>— 통장 매칭분 + 빌려타 정산분</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>월</th><th style={{ ...th, textAlign: 'right' }}>통장</th>
                <th style={{ ...th, textAlign: 'right' }}>빌려타 정산</th><th style={{ ...th, textAlign: 'right' }}>합계</th>
                <th style={{ ...th, width: '30%' }}>구성</th>
              </tr></thead>
              <tbody>
                {monthly.map((m) => {
                  const total = m.bank + m.ride
                  return (
                    <tr key={m.month}>
                      <td style={{ ...td, fontWeight: 700 }}>{m.month}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{nf(m.bank)}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#6d28d9' }}>{m.ride > 0 ? nf(m.ride) : '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{nf(total)}</td>
                      <td style={td}>
                        <div style={{ height: 8, borderRadius: 5, background: COLORS.borderFaint, overflow: 'hidden', display: 'flex', width: `${Math.round((total / maxMonthTotal) * 100)}%`, minWidth: 6 }}>
                          {m.bank > 0 && <span style={{ display: 'block', height: '100%', width: `${(m.bank / total) * 100}%`, background: COLORS.primary }} />}
                          {m.ride > 0 && <span style={{ display: 'block', height: '100%', width: `${(m.ride / total) * 100}%`, background: '#8b5cf6' }} />}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!loading && monthly.length === 0 && <tr><td style={td} colSpan={5}>수납 내역이 없습니다</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* 청구완료 · 입금대기 */}
        <div style={card}>
          <div style={hd}>청구완료 · 입금대기 <span style={{ fontSize: 11.5, fontWeight: 500, color: COLORS.textMuted }}>— 경과일 순</span></div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {waiting.slice(0, 30).map((w) => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{w.customer_name || '고객 미상'} <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>· {w.insurance_company || '보험사 미상'}</span></div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>{w.vehicle_car_number || '—'} · {d10(w.return_date || w.dispatch_date)} {w.return_date ? '반납' : '배차'}</div>
                </div>
                <Badge meta={CLASS_BADGE[w.vehicle_class]} />
                <span style={{ fontSize: 12, fontWeight: 700, color: (w.elapsed_days || 0) >= 14 ? COLORS.danger : COLORS.textSecondary, whiteSpace: 'nowrap' }}>D+{w.elapsed_days ?? '—'}</span>
              </div>
            ))}
            {!loading && waiting.length === 0 && <div style={{ padding: '22px 14px', fontSize: 12.5, color: COLORS.textMuted }}>청구완료 후 입금 대기 중인 건이 없습니다</div>}
          </div>
        </div>
      </div>

      {/* 채권 원장 */}
      <div style={card}>
        <div style={{ ...hd, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          채권 원장
          <span style={{ flex: 1 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="고객·차량·보험사 검색"
            style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`, fontSize: 12, outline: 'none', background: COLORS.bgGray, width: 180 }} />
          {([['all', '소속 전체'], ['ride', '지입'], ['own', '직접']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setCls(k)}
              style={{ padding: '5px 11px', fontSize: 11.5, fontWeight: 600, borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${cls === k ? COLORS.primary : COLORS.borderSubtle}`,
                background: cls === k ? COLORS.bgBlue : '#fff', color: cls === k ? COLORS.primary : COLORS.textSecondary }}>{label}</button>
          ))}
          {([['all', '상태 전체'], ['waiting', '입금대기'], ['received', '수납'], ['unbilled', '미청구']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setState(k)}
              style={{ padding: '5px 11px', fontSize: 11.5, fontWeight: 600, borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${state === k ? COLORS.primary : COLORS.borderSubtle}`,
                background: state === k ? COLORS.bgBlue : '#fff', color: state === k ? COLORS.primary : COLORS.textSecondary }}>{label}</button>
          ))}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>소속</th><th style={th}>발생일</th><th style={th}>건</th><th style={th}>거래처</th>
              <th style={{ ...th, textAlign: 'right' }}>청구액</th><th style={{ ...th, textAlign: 'right' }}>수납액</th>
              <th style={th}>경로</th><th style={{ ...th, textAlign: 'center' }}>상태</th>
            </tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id}>
                  <td style={td}><Badge meta={CLASS_BADGE[x.vehicle_class]} /></td>
                  <td style={td}>{d10(x.return_date || x.dispatch_date)}</td>
                  <td style={td}><b>{x.customer_name || '—'}</b> <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{x.vehicle_car_number || ''}</span></td>
                  <td style={{ ...td, color: COLORS.textSecondary }}>{x.insurance_company || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {x.claim_amount ? <b>{nf(x.claim_amount)}</b> : <span style={{ color: COLORS.textDim, fontSize: 11.5 }}>미입력</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {x.received > 0 ? <b style={{ color: x.ride_paid > 0 && x.bank_paid === 0 ? '#6d28d9' : COLORS.success }}>{nf(x.received)}</b> : <span style={{ color: COLORS.textDim }}>-</span>}
                  </td>
                  <td style={{ ...td, fontSize: 11, color: COLORS.textMuted }}>
                    {x.ride_paid > 0 && x.bank_paid > 0 ? '통장+빌려타'
                      : x.ride_paid > 0 ? `빌려타 정산 ${d10(x.last_received)}`
                      : x.bank_paid > 0 ? `통장 ${d10(x.last_received)}`
                      : x.vehicle_class === 'ride' ? '빌려타 정산 예정' : '통장 대기'}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}><Badge meta={STATE_BADGE[x.ar_state]} /></td>
                </tr>
              ))}
              {!loading && rows.length === 0 && <tr><td style={td} colSpan={8}>조건에 맞는 건이 없습니다</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 16px', fontSize: 11.5, color: COLORS.textMuted, borderTop: `1px solid ${COLORS.borderFaint}` }}>
          최근 12개월 배차건 기준 · 청구액은 단기·대차 청구 탭에서 입력한 건부터 집계됩니다 · 장기 렌트료 채권은 장기계약 백필 후 합류
        </div>
      </div>
    </div>
  )
}
