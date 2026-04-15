'use client'
/**
 * Option H: 스프레드시트 킬러판 - 상단 컨트롤 패널
 * ─ 프리셋 3버튼 (보수/표준/공격) + 비교모드 바
 * ─ 🎯 목표 렌트가 역산 + 시중가 칩 (롯데/SK/현대/KB/AJ/평균/최저)
 *
 * RentPricingBuilder의 analysis 탭 상단에 마운트.
 * 계산 로직은 부모의 calculations prop을 통해 전달받음.
 */

import { useState, useEffect, useMemo } from 'react'
import { f, formatWonCompact, safeNum } from '@/lib/quote-utils'
import { getAuthHeader } from '@/app/utils/auth-client'

export type PresetMode = 'conservative' | 'standard' | 'aggressive' | 'custom'

export interface OptionHBaseline {
  monthlyTotalCost: number
  monthlyRentWithVat: number
  capturedAt: string
}

interface Props {
  // 현재 계산값 (부모의 useMemo calculations에서 전달)
  monthlyTotalCost: number
  monthlyRentWithVat: number
  // 차량 정보 (시중가 조회용)
  brand?: string
  model?: string
  year?: number
  termMonths: number
  annualMileage: number // 만km/년
  // 프리셋 적용 콜백 (부모의 setState 들을 묶어서 호출)
  onApplyPreset?: (preset: PresetMode) => void
  // 목표 렌트가로 역산 실행 콜백
  onReverseSolve?: (targetMonthlyRent: number) => void
  // 비교 기준 저장/해제
  onCaptureBaseline?: () => OptionHBaseline | null
}

export default function OptionHPanel(props: Props) {
  const {
    monthlyTotalCost,
    monthlyRentWithVat,
    brand, model, year,
    termMonths, annualMileage,
    onApplyPreset,
    onReverseSolve,
    onCaptureBaseline,
  } = props

  const [presetMode, setPresetMode] = useState<PresetMode>('standard')
  const [baseline, setBaseline] = useState<OptionHBaseline | null>(null)
  const [targetRent, setTargetRent] = useState<string>('')
  const [marketRows, setMarketRows] = useState<any[]>([])
  const [marketSummary, setMarketSummary] = useState<{ avg: number; min: number; max: number; count: number }>({ avg: 0, min: 0, max: 0, count: 0 })

  // 시중가 조회
  useEffect(() => {
    if (!brand || !model) { setMarketRows([]); return }
    const ctrl = new AbortController()
    const annualKm = Math.max(2, annualMileage) * 10000 // 만km → km
    const params = new URLSearchParams({
      brand, model,
      ...(year ? { year: String(year) } : {}),
      term_months: String(termMonths),
      annual_km: String(annualKm),
    })
    ;(async () => {
      try {
        const headers = await getAuthHeader()
        const r = await fetch(`/api/market-prices?${params.toString()}`, { headers, signal: ctrl.signal })
        const j = await r.json()
        setMarketRows(Array.isArray(j.data) ? j.data : [])
        setMarketSummary(j.summary || { avg: 0, min: 0, max: 0, count: 0 })
      } catch {/* silent */}
    })()
    return () => ctrl.abort()
  }, [brand, model, year, termMonths, annualMileage])

  const applyPreset = (mode: PresetMode) => {
    setPresetMode(mode)
    onApplyPreset?.(mode)
  }

  const captureBaseline = () => {
    if (baseline) { setBaseline(null); return } // 토글 해제
    const snap = onCaptureBaseline?.() ?? {
      monthlyTotalCost,
      monthlyRentWithVat,
      capturedAt: new Date().toISOString(),
    }
    setBaseline(snap)
  }

  const delta = baseline ? monthlyRentWithVat - baseline.monthlyRentWithVat : 0
  const deltaPct = baseline && baseline.monthlyRentWithVat > 0 ? (delta / baseline.monthlyRentWithVat) * 100 : 0

  // 기업별 대표 한 건씩 pick
  const byCompany = useMemo(() => {
    const map = new Map<string, any>()
    marketRows.forEach(r => { if (!map.has(r.company)) map.set(r.company, r) })
    return ['롯데', 'SK', '현대', 'KB', 'AJ'].map(c => ({ company: c, row: map.get(c) }))
  }, [marketRows])

  const handleChipClick = (price: number) => {
    setTargetRent(f(price))
  }

  const handleReverseSolve = () => {
    const tgt = safeNum(targetRent)
    if (tgt > 0) onReverseSolve?.(tgt)
  }

  const presetBtnCls = (mode: PresetMode, base: string) =>
    `px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
      presetMode === mode ? `${base} ring-2 ring-offset-1` : 'bg-white/60 text-slate-600 hover:bg-white/80'
    }`

  return (
    <div className="mb-4 space-y-3">
      {/* 상단: 프리셋 + 비교모드 */}
      <div className="glass3 rounded-xl p-3 flex items-center gap-3 flex-wrap"
        style={{ background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(0,0,0,0.05)' }}
      >
        <div className="flex gap-1">
          <button className={presetBtnCls('conservative', 'bg-slate-200 text-slate-800 ring-slate-400')}
            onClick={() => applyPreset('conservative')}>🐢 보수적</button>
          <button className={presetBtnCls('standard', 'bg-indigo-100 text-indigo-700 ring-indigo-400')}
            onClick={() => applyPreset('standard')}>⚖️ 표준</button>
          <button className={presetBtnCls('aggressive', 'bg-rose-100 text-rose-700 ring-rose-400')}
            onClick={() => applyPreset('aggressive')}>🔥 공격적</button>
        </div>

        {baseline ? (
          <div className="rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs"
            style={{ background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(0,0,0,0.05)' }}>
            <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black">비교 ON</span>
            <span className="text-slate-500">기준 <span className="tabular-nums font-black">{f(baseline.monthlyRentWithVat)}</span></span>
            <span className="text-slate-300">→</span>
            <span className={`tabular-nums font-black ${delta < 0 ? 'text-rose-600' : delta > 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
              {f(monthlyRentWithVat)}
            </span>
            <span className={`text-[10px] font-bold ${delta < 0 ? 'text-rose-500' : delta > 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
              ({delta >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
            </span>
            <button onClick={captureBaseline} className="text-slate-400 hover:text-rose-500 font-bold text-[10px]">해제</button>
          </div>
        ) : (
          <button onClick={captureBaseline}
            className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-white/80"
            style={{ background: 'rgba(255,255,255,0.50)', border: '1px dashed rgba(0,0,0,0.15)' }}>
            📊 비교모드 켜기 <span className="text-[10px] text-slate-400">(현재값을 기준으로 저장)</span>
          </button>
        )}

        <div className="ml-auto flex items-baseline gap-2">
          <span className="text-[10px] text-slate-500 font-bold">월 렌트가 (VAT)</span>
          <span className="text-lg font-black tabular-nums" style={{ color: '#3b6eb5' }}>
            {formatWonCompact(monthlyRentWithVat)}
          </span>
        </div>
      </div>

      {/* 하단: 역산 + 시중가 */}
      <div className="glass3 rounded-xl p-3 space-y-2"
        style={{ background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-black text-slate-700 whitespace-nowrap">🎯 목표 렌트가 역산</span>
          <input
            type="text"
            value={targetRent}
            onChange={e => setTargetRent(e.target.value.replace(/[^\d,]/g, ''))}
            placeholder="700,000"
            className="rounded px-3 py-1.5 text-sm font-bold tabular-nums w-32 text-right"
            style={{ background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(0,0,0,0.05)', boxShadow: 'inset 2px 2px 4px rgba(140,170,210,0.10)' }}
          />
          <span className="text-[10px] text-slate-400">원 / 월</span>
          <span className="text-slate-300">·</span>
          <span className="text-[10px] text-slate-500">🔓 해제된 레버(할인·잔가·마진)로 자동 맞춤</span>
          <button onClick={handleReverseSolve}
            className="ml-auto px-4 py-1.5 rounded-lg bg-slate-800 text-white text-[11px] font-black hover:bg-slate-700 disabled:opacity-40"
            disabled={!targetRent || safeNum(targetRent) <= 0}>
            역산 실행 →
          </button>
        </div>

        {/* 시중가 칩 한 줄 */}
        {marketSummary.count > 0 && (
          <div className="pt-2 border-t flex items-center gap-2 flex-wrap" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
            <span className="text-[10px] font-black text-slate-600 whitespace-nowrap">📊 시중가</span>
            {byCompany.map(({ company, row }) => row ? (
              <button key={company} onClick={() => handleChipClick(Number(row.monthly_price))}
                className="inline-flex items-baseline gap-1 px-2 py-1 rounded-md hover:ring-1 hover:ring-indigo-300 transition-all text-[11px]"
                style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,0,0,0.05)' }}
                title={`${row.company}${row.product_name ? ' · ' + row.product_name : ''}`}>
                <span className="text-slate-500 font-bold">{company}</span>
                <span className="tabular-nums font-black">{f(Number(row.monthly_price))}</span>
              </button>
            ) : (
              <span key={company} className="inline-flex items-baseline gap-1 px-2 py-1 rounded-md text-[11px] opacity-40"
                style={{ background: 'rgba(255,255,255,0.30)', border: '1px dashed rgba(0,0,0,0.08)' }}>
                <span className="text-slate-400 font-bold">{company}</span>
                <span className="tabular-nums">-</span>
              </span>
            ))}
            <button onClick={() => handleChipClick(marketSummary.avg)}
              className="inline-flex items-baseline gap-1 px-2 py-1 rounded-md bg-slate-800 text-white hover:bg-slate-700 text-[11px]">
              <span className="font-bold">⭐평균</span>
              <span className="tabular-nums font-black">{f(marketSummary.avg)}</span>
            </button>
            <button onClick={() => handleChipClick(marketSummary.min)}
              className="inline-flex items-baseline gap-1 px-2 py-1 rounded-md hover:ring-1 hover:ring-rose-300 text-[11px]"
              style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <span className="text-rose-600 font-bold">🏆최저</span>
              <span className="tabular-nums font-black text-rose-700">{f(marketSummary.min)}</span>
            </button>
            <span className="ml-auto text-[9px] text-slate-400 whitespace-nowrap">
              {termMonths}개월·{annualMileage}만km ({marketSummary.count}개 샘플)
            </span>
          </div>
        )}
        {marketSummary.count === 0 && brand && model && (
          <div className="pt-2 border-t text-[10px] text-slate-400" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
            ※ {brand} {model} {year || ''}의 시중가 샘플이 아직 등록되지 않았습니다. 관리자 페이지에서 추가하거나 수동으로 목표가를 입력하세요.
          </div>
        )}
      </div>
    </div>
  )
}
