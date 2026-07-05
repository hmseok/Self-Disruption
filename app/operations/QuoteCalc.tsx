'use client'

import { useEffect, useMemo, useState } from 'react'
import { GLASS } from '@/app/utils/ui-tokens'
import { LOTTE_SHORT_TERM_RATES, computeLotteClaim } from '@/lib/lotte-short-term-rates'

// ═══════════════════════════════════════════════════════════════════
// QuoteCalc — 롯데 단기 요금 산출기 (공용)
//
// PR-QUOTE (2026-07-04) — 청구액 변수(차종군·일수·과실·청구율)는 상담 단계에 확정.
//   상담(배차하기) · 배차 드로어 · 청구 카드가 같은 산출기를 쓴다 (규칙 14 동형).
//   산식: 구간일요금 × 일수 × 과실% × 청구율% (VAT 포함).
// ═══════════════════════════════════════════════════════════════════

export type QuoteResult = {
  rateIdx: number
  categoryLabel: string        // 요금표 행 라벨 (vehicle_names)
  days: number
  faultPct: number
  claimPct: number
  amount: number               // 최종 산출액 (VAT 포함)
  formula: string              // 사람이 읽는 산식 한 줄
}

/** 대여일수 자동 — 출고~반납 (올림, 최소 1일) */
export function calcRentalDays(dispatch: string | null | undefined, ret: string | null | undefined): number | null {
  if (!dispatch || !ret) return null
  const a = new Date(dispatch).getTime()
  const b = new Date(ret).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return Math.max(1, Math.ceil((b - a) / 86400000))
}

/** 롯데 요금표 차종 자동 매칭 — 차종 문자열 ↔ vehicle_names 부분 일치 (가장 긴 이름 우선) */
export function matchLotteRateIdx(carType: string | null | undefined): number {
  if (!carType) return -1
  const t = String(carType).replace(/\s+/g, '').toLowerCase()
  if (!t) return -1
  let best = -1
  let bestLen = 0
  LOTTE_SHORT_TERM_RATES.forEach((r, idx) => {
    for (const raw of r.vehicle_names.split(',')) {
      const name = raw.trim().split('(')[0].replace(/\s+/g, '').toLowerCase()
      if (!name) continue
      if ((t.includes(name) || name.includes(t)) && name.length > bestLen) {
        best = idx
        bestLen = name.length
      }
    }
  })
  return best
}

export default function QuoteCalc({
  carType,
  initialDays,
  initialFaultRate,
  initialClaimRate,
  initialCategoryLabel,
  onResult,
  onDraft,
}: {
  /** 대차 차종 문자열 — 요금표 자동 매칭 초기값 */
  carType?: string | null
  initialDays?: number | string | null
  initialFaultRate?: number | string | null
  initialClaimRate?: number | string | null
  /** 저장된 견적 차종 라벨 — 있으면 자동 매칭보다 우선 */
  initialCategoryLabel?: string | null
  /** 산출 결과 변경 시 부모에 통지 (null = 미완성) */
  onResult: (r: QuoteResult | null) => void
  /** 입력값 변경 시 통지 — 산출 미완성이어도 일수·과실·청구율 저장용 */
  onDraft?: (d: { days: string; faultRate: string; claimRate: string; rateIdx: number }) => void
}) {
  const initIdx = useMemo(() => {
    if (initialCategoryLabel) {
      const i = LOTTE_SHORT_TERM_RATES.findIndex((r) => r.vehicle_names === initialCategoryLabel)
      if (i >= 0) return i
    }
    return matchLotteRateIdx(carType)
  }, [initialCategoryLabel, carType])

  const [rateIdx, setRateIdx] = useState<number>(initIdx)
  const [days, setDays] = useState<string>(initialDays != null && initialDays !== '' ? String(initialDays) : '')
  const [faultRate, setFaultRate] = useState<string>(initialFaultRate != null && initialFaultRate !== '' ? String(Number(initialFaultRate)) : '')
  const [claimRate, setClaimRate] = useState<string>(initialClaimRate != null && initialClaimRate !== '' ? String(Number(initialClaimRate)) : '')

  const groups = useMemo(() => {
    const out: { cat: string; rows: { idx: number; label: string }[] }[] = []
    LOTTE_SHORT_TERM_RATES.forEach((r, idx) => {
      let g = out.find((x) => x.cat === r.category)
      if (!g) { g = { cat: r.category, rows: [] }; out.push(g) }
      g.rows.push({ idx, label: r.vehicle_names })
    })
    return out
  }, [])

  const result: QuoteResult | null = useMemo(() => {
    if (rateIdx < 0) return null
    const rate = LOTTE_SHORT_TERM_RATES[rateIdx]
    const d = Number(days)
    if (!rate || !d || d < 1) return null
    const base = computeLotteClaim(rate, d)
    const fr = faultRate === '' ? 100 : Number(faultRate)
    const cr = claimRate === '' ? 100 : Number(claimRate)
    const faultPct = Number.isFinite(fr) && fr >= 0 ? fr : 100
    const claimPct = Number.isFinite(cr) && cr >= 0 ? cr : 100
    const amount = Math.round(base.total * (faultPct / 100) * (claimPct / 100))
    const extra = (faultPct !== 100 || claimPct !== 100) ? ` × 과실 ${faultPct}% × 청구율 ${claimPct}%` : ''
    return {
      rateIdx,
      categoryLabel: rate.vehicle_names,
      days: d,
      faultPct,
      claimPct,
      amount,
      formula: `[${base.tierLabel}] ${base.dailyRate.toLocaleString('ko-KR')}원/일 × ${d}일${extra} = ${amount.toLocaleString('ko-KR')}원`,
    }
  }, [rateIdx, days, faultRate, claimRate])

  useEffect(() => { onResult(result) }, [result, onResult])
  useEffect(() => { onDraft?.({ days, faultRate, claimRate, rateIdx }) }, [days, faultRate, claimRate, rateIdx, onDraft])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select
          value={rateIdx}
          onChange={(e) => setRateIdx(Number(e.target.value))}
          style={{ ...GLASS.L1, flex: '1 1 200px', padding: '8px 10px', borderRadius: 8, fontSize: 12, color: '#1e293b' }}
        >
          <option value={-1}>— 대차차량 차종 선택 —</option>
          {groups.map((g) => (
            <optgroup key={g.cat} label={g.cat}>
              {g.rows.map((r) => <option key={r.idx} value={r.idx}>{r.label}</option>)}
            </optgroup>
          ))}
        </select>
        <div style={{ ...GLASS.L1, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8 }}>
          <input type="number" value={days} onChange={(e) => setDays(e.target.value)} placeholder="일수"
            style={{ border: 'none', background: 'transparent', fontSize: 12, color: '#1e293b', fontWeight: 700, outline: 'none', width: 46 }} />
          <span style={{ fontSize: 11, color: '#94a3b8' }}>일</span>
        </div>
        <div style={{ ...GLASS.L1, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>과실</span>
          <input type="number" value={faultRate} onChange={(e) => setFaultRate(e.target.value)} placeholder="100"
            style={{ border: 'none', background: 'transparent', fontSize: 12, color: '#1e293b', fontWeight: 700, outline: 'none', width: 40 }} />
          <span style={{ fontSize: 11, color: '#94a3b8' }}>%</span>
        </div>
        <div style={{ ...GLASS.L1, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>청구율</span>
          <input type="number" value={claimRate} onChange={(e) => setClaimRate(e.target.value)} placeholder="100"
            style={{ border: 'none', background: 'transparent', fontSize: 12, color: '#1e293b', fontWeight: 700, outline: 'none', width: 40 }} />
          <span style={{ fontSize: 11, color: '#94a3b8' }}>%</span>
        </div>
      </div>
      {result ? (
        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
          {result.formula.replace(/= [\d,]+원$/, '= ')}
          <b style={{ color: '#0f2440', fontSize: 13 }}>{result.amount.toLocaleString('ko-KR')}원</b>
          <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 5 }}>VAT 포함</span>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#94a3b8' }}>차종·일수를 넣으면 요금이 산출됩니다 (구간일요금 × 일수 × 과실율 × 청구율, VAT 포함)</div>
      )}
    </div>
  )
}
