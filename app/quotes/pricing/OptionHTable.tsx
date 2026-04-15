'use client'
/**
 * Option H: 스프레드시트 요약 테이블
 * ─ 모든 비용 행을 한 화면에 표시 (행별 색상 틴트)
 * ─ 🔒 락 컬럼 (락 상태 시각화)
 * ─ 변동 컬럼 (기준 대비 증감)
 */
import { useMemo } from 'react'
import { f, formatWonCompact } from '@/lib/quote-utils'

export interface HTableRow {
  id: string
  group: '취득' | '감가' | '금융' | '보험' | '세금' | '정비' | '보증금' | '합계'
  label: string
  detail?: string
  total?: number // 계약기간 총액
  monthly?: number // 월 환산
  share?: number // 비중 (%)
  baseline?: number // 비교모드 기준값 (월 환산 기준)
  tone?: 'blue' | 'violet' | 'amber' | 'emerald' | 'slate' | 'rose'
  locked?: boolean
  onToggleLock?: () => void
  strong?: boolean // 합계 행
}

interface Props {
  rows: HTableRow[]
  compactUnit?: boolean // 억/조 포매터 사용 여부
}

const TONE_MAP: Record<string, { bg: string; text: string; chip: string }> = {
  blue:    { bg: 'rgba(219,234,254,0.35)',  text: '#1d4ed8', chip: 'bg-blue-100 text-blue-700' },
  violet:  { bg: 'rgba(237,233,254,0.45)',  text: '#6d28d9', chip: 'bg-violet-100 text-violet-700' },
  amber:   { bg: 'rgba(254,243,199,0.45)',  text: '#a16207', chip: 'bg-amber-100 text-amber-700' },
  emerald: { bg: 'rgba(209,250,229,0.45)',  text: '#047857', chip: 'bg-emerald-100 text-emerald-700' },
  rose:    { bg: 'rgba(254,226,226,0.40)',  text: '#be123c', chip: 'bg-rose-100 text-rose-700' },
  slate:   { bg: 'rgba(241,245,249,0.50)',  text: '#475569', chip: 'bg-slate-100 text-slate-600' },
}

export default function OptionHTable({ rows, compactUnit = false }: Props) {
  const fmt = compactUnit ? (n: number) => formatWonCompact(n, { unit: false }) : f

  const grouped = useMemo(() => {
    // group 첫 행에만 group 라벨 표시 (rowspan 효과)
    const seen = new Set<string>()
    return rows.map(r => ({
      ...r,
      showGroup: (() => { if (seen.has(r.group)) return false; seen.add(r.group); return true })(),
    }))
  }, [rows])

  return (
    <div className="glass4 rounded-2xl p-3 mb-4 overflow-x-auto"
      style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-black text-slate-700">📊 원가 스프레드시트 (한눈에)</h3>
        <span className="text-[10px] text-slate-400">행 클릭 → 🔒 락 / 변동 컬럼 = 기준 대비</span>
      </div>
      <table className="w-full text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr className="text-slate-600" style={{ background: 'rgba(241,245,249,0.75)' }}>
            <th className="w-10 px-2 py-2 text-center font-black">🔒</th>
            <th className="text-left px-3 py-2 font-black w-16">구분</th>
            <th className="text-left px-3 py-2 font-black">항목</th>
            <th className="text-right px-3 py-2 font-black">총액</th>
            <th className="text-right px-3 py-2 font-black">월 환산</th>
            <th className="text-right px-3 py-2 font-black">비중</th>
            <th className="text-right px-3 py-2 font-black w-24">변동</th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
          {grouped.map(r => {
            const tone = TONE_MAP[r.tone || 'slate']
            const delta = r.baseline !== undefined && r.monthly !== undefined ? r.monthly - r.baseline : undefined
            return (
              <tr key={r.id}
                className={r.strong ? 'font-black' : ''}
                style={{ background: r.strong ? 'rgba(209,213,219,0.50)' : tone.bg }}
              >
                <td className="px-2 py-1.5 text-center">
                  {r.onToggleLock && !r.strong && (
                    <button
                      onClick={r.onToggleLock}
                      className="text-sm hover:scale-110 transition-transform"
                      title={r.locked ? '락 해제' : '이 항목 고정 (역산 시 변경 안됨)'}
                    >
                      {r.locked ? '🔒' : '🔓'}
                    </button>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {r.showGroup && <span style={{ color: tone.text }} className="font-bold">{r.group}</span>}
                </td>
                <td className="px-3 py-1.5">
                  <div>{r.label}</div>
                  {r.detail && <div className="text-[10px] text-slate-500">{r.detail}</div>}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {r.total !== undefined && r.total !== 0 ? fmt(r.total) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-1.5 text-right font-bold">
                  {r.monthly !== undefined ? (
                    <span className={r.monthly < 0 ? 'text-emerald-600' : ''}>{fmt(r.monthly)}</span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {r.share !== undefined && r.share !== 0 ? (
                    <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-black ${tone.chip}`}>
                      {r.share.toFixed(1)}%
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {delta !== undefined && Math.abs(delta) >= 1 ? (
                    <span className={`text-[11px] font-bold ${delta < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {delta < 0 ? '▼' : '▲'} {fmt(Math.abs(delta))}
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
