'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { getAuthHeader } from '@/app/utils/auth-client'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'

// ═══════════════════════════════════════════════════════════
// /finance/investor — PHASE 4 투자자 정산 대시보드
//
//   · 월간 전체 투자자 정산 현황 (지입 + 일반투자)
//   · 차량별 수입/지출/손익 요약
//   · 정산 완료/미완료 추적
//   · 월 선택으로 이전 월 조회
// ═══════════════════════════════════════════════════════════

type SettlementItem = {
  contractId: string
  contractType: 'jiip' | 'invest'
  investorName: string
  carId: string | null
  carNumber: string
  carModel: string
  vehicleRevenue: number
  vehicleExpense: number
  vehicleProfit: number
  settlementAmount: number
  paidAmount: number
  isPaid: boolean
  adminFee?: number
  shareRatio?: number
  investAmount?: number
  interestRate?: number
  monthlyInterest?: number
}

type Summary = {
  totalInvestors: number
  totalContracts: number
  jiipContracts: number
  investContracts: number
  totalSettlement: number
  totalPaid: number
  totalUnpaid: number
  completionRate: number
}

type VehiclePnl = {
  car_id: string
  car_number: string
  car_model: string
  revenue: number
  expense: number
  operatingProfit: number
  categories: Record<string, number>
  transactionCount: number
}

const nf = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString()

export default function InvestorPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [items, setItems] = useState<SettlementItem[]>([])
  const [vehiclePnl, setVehiclePnl] = useState<VehiclePnl[]>([])
  const [tab, setTab] = useState<'settlement' | 'vehicles' | 'reports'>('settlement')
  const [typeFilter, setTypeFilter] = useState<'' | 'jiip' | 'invest'>('')
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState<any>(null)
  const [reports, setReports] = useState<Array<{
    token: string; recipient_name: string; settlement_month: string
    total_amount: number; view_count: number; url: string; created_at: string
  }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    const h = getAuthHeader()
    try {
      const [settleRes, pnlRes, reportRes] = await Promise.all([
        fetch(`/api/finance/investor-settlement?month=${month}`, { headers: h }),
        fetch(`/api/finance/vehicle-pnl?month=${month}`, { headers: h }),
        fetch(`/api/finance/investor-report?month=${month}`, { headers: h }),
      ])

      if (settleRes.ok) {
        const data = await settleRes.json()
        setSummary(data.summary || null)
        setItems(data.items || [])
      }
      if (pnlRes.ok) {
        const data = await pnlRes.json()
        setVehiclePnl(data.vehicles || [])
      }
      if (reportRes.ok) {
        const data = await reportRes.json()
        setReports(data.reports || [])
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [month])

  // ── 리포트 일괄 생성 ──
  const generateReports = async () => {
    setGenerating(true)
    setGenerateResult(null)
    try {
      const res = await fetch('/api/finance/investor-report', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      })
      const data = await res.json()
      setGenerateResult(data)
      await load() // 새로고침
    } catch (e) {
      console.error(e)
    }
    setGenerating(false)
  }

  useEffect(() => { load() }, [load])

  const filteredItems = useMemo(() => {
    if (!typeFilter) return items
    return items.filter(i => i.contractType === typeFilter)
  }, [items, typeFilter])

  // ── 투자자별 그룹 ──
  const investorGroups = useMemo(() => {
    const map = new Map<string, SettlementItem[]>()
    for (const item of filteredItems) {
      const name = item.investorName || '미지정'
      if (!map.has(name)) map.set(name, [])
      map.get(name)!.push(item)
    }
    return Array.from(map.entries()).sort((a, b) => {
      const totalA = a[1].reduce((s, i) => s + i.settlementAmount, 0)
      const totalB = b[1].reduce((s, i) => s + i.settlementAmount, 0)
      return totalB - totalA
    })
  }, [filteredItems])

  const statItems: StatItem[] = useMemo(() => {
    if (!summary) return []
    return [
      { label: '투자자', value: String(summary.totalInvestors), color: 'blue' as const },
      { label: '지입 계약', value: String(summary.jiipContracts), color: 'green' as const },
      { label: '일반 투자', value: String(summary.investContracts), color: 'purple' as const },
      { label: '정산 예정', value: `${nf(summary.totalSettlement)}원`, color: 'amber' as const },
      { label: '정산 완료', value: `${summary.completionRate}%`, color: summary.completionRate >= 100 ? 'green' as const : 'red' as const },
    ]
  }, [summary])

  // 차량 P&L에서 거래 있는 것만
  const activeVehicles = useMemo(() =>
    vehiclePnl.filter(v => v.transactionCount > 0).sort((a, b) => b.operatingProfit - a.operatingProfit),
    [vehiclePnl]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">투자자 정산</h1>
          <p className="text-sm text-gray-500 mt-0.5">차량별 손익 기반 투자자 정산 현황</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-black/10 bg-white/60 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
        />
      </div>

      {/* ── 스탯 ── */}
      {statItems.length > 0 && <DcStatStrip items={statItems} />}

      {/* ── 탭 ── */}
      <div className="flex gap-1 bg-white/40 rounded-lg p-1 border border-black/[0.05] w-fit">
        {[
          { key: 'settlement' as const, label: '투자자 정산' },
          { key: 'vehicles' as const, label: '차량 손익' },
          { key: 'reports' as const, label: `리포트 (${reports.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white/80 text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 투자자 정산 탭 ── */}
      {tab === 'settlement' && (
        <div className="space-y-4">
          {/* 타입 필터 */}
          <div className="flex gap-2">
            {[
              { key: '' as const, label: '전체' },
              { key: 'jiip' as const, label: '지입' },
              { key: 'invest' as const, label: '일반투자' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setTypeFilter(f.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  typeFilter === f.key
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/50 text-gray-500 hover:bg-white/70 border border-black/[0.06]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* 투자자별 그룹 카드 */}
          {investorGroups.length === 0 ? (
            <div className="rounded-xl border border-black/[0.06] bg-white/60 p-12 text-center text-gray-400 text-sm">
              해당 월에 정산 대상이 없습니다
            </div>
          ) : (
            investorGroups.map(([name, contracts]) => {
              const totalSettlement = contracts.reduce((s, c) => s + c.settlementAmount, 0)
              const totalPaid = contracts.reduce((s, c) => s + c.paidAmount, 0)
              const allPaid = contracts.every(c => c.isPaid || c.settlementAmount === 0)

              return (
                <div key={name} className="rounded-xl border border-black/[0.06] bg-white/72 backdrop-blur-sm overflow-hidden">
                  {/* 투자자 헤더 */}
                  <div className="px-5 py-3 border-b border-black/[0.04] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100/80 flex items-center justify-center text-blue-600 text-sm font-bold">
                        {(name || '?')[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{name}</p>
                        <p className="text-xs text-gray-400">{contracts.length}건 계약</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-800">{nf(totalSettlement)}원</p>
                      <span className={`text-xs font-medium ${allPaid ? 'text-green-500' : 'text-amber-500'}`}>
                        {allPaid ? '정산완료' : `${nf(totalPaid)}원 지급`}
                      </span>
                    </div>
                  </div>

                  {/* 계약 목록 */}
                  <div className="divide-y divide-black/[0.03]">
                    {contracts.map(c => (
                      <div key={c.contractId} className="px-5 py-2.5 flex items-center gap-4 text-sm">
                        {/* 계약 타입 */}
                        <span className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium ${
                          c.contractType === 'jiip'
                            ? 'bg-green-50 text-green-600'
                            : 'bg-purple-50 text-purple-600'
                        }`}>
                          {c.contractType === 'jiip' ? '지입' : '투자'}
                        </span>

                        {/* 차량 */}
                        <span className="w-24 text-gray-700 font-medium truncate">{c.carNumber}</span>
                        <span className="w-28 text-gray-400 truncate hidden sm:block">{c.carModel}</span>

                        {/* 차량 손익 */}
                        <div className="flex-1 flex items-center gap-3 text-xs text-gray-500 hidden md:flex">
                          <span className="text-green-500">+{nf(c.vehicleRevenue)}</span>
                          <span className="text-red-400">-{nf(c.vehicleExpense)}</span>
                          <span className={c.vehicleProfit >= 0 ? 'text-blue-500 font-medium' : 'text-red-500 font-medium'}>
                            ={nf(c.vehicleProfit)}
                          </span>
                        </div>

                        {/* 정산액 */}
                        <div className="text-right min-w-[80px]">
                          <p className="font-medium text-gray-700">{nf(c.settlementAmount)}원</p>
                          {c.contractType === 'jiip' && c.shareRatio != null && (
                            <p className="text-xs text-gray-400">관리비 {nf(c.adminFee)} · FMI {c.shareRatio}%</p>
                          )}
                          {c.contractType === 'invest' && c.interestRate != null && (
                            <p className="text-xs text-gray-400">원금 {nf(c.investAmount)} · {c.interestRate}%</p>
                          )}
                        </div>

                        {/* 상태 */}
                        <span className={`flex-shrink-0 w-12 text-center text-xs font-medium rounded-full py-0.5 ${
                          c.isPaid
                            ? 'bg-green-50 text-green-600'
                            : c.settlementAmount === 0
                              ? 'bg-gray-50 text-gray-400'
                              : 'bg-amber-50 text-amber-600'
                        }`}>
                          {c.isPaid ? '완료' : c.settlementAmount === 0 ? '—' : '미정산'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── 차량 손익 탭 ── */}
      {tab === 'vehicles' && (
        <div className="rounded-xl border border-black/[0.06] bg-white/72 backdrop-blur-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] bg-white/40">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">차량</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">수입</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">지출</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">순이익</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 hidden md:table-cell">거래</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 hidden lg:table-cell">주요 비용</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.03]">
              {activeVehicles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    해당 월에 거래가 있는 차량이 없습니다
                  </td>
                </tr>
              ) : activeVehicles.map(v => {
                // 상위 3개 비용 카테고리
                const topCats = Object.entries(v.categories)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 3)

                return (
                  <tr key={v.car_id} className="hover:bg-white/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800">{v.car_number}</p>
                      <p className="text-xs text-gray-400">{v.car_model}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right text-green-600 tabular-nums">{nf(v.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-red-500 tabular-nums">{nf(v.expense)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                      v.operatingProfit >= 0 ? 'text-blue-600' : 'text-red-600'
                    }`}>
                      {v.operatingProfit >= 0 ? '+' : ''}{nf(v.operatingProfit)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-400 hidden md:table-cell">{v.transactionCount}</td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {topCats.map(([cat, amt]) => (
                          <span key={cat} className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
                            {cat} {nf(amt)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 리포트 탭 (PHASE 5) ── */}
      {tab === 'reports' && (
        <div className="space-y-4">
          {/* 리포트 생성 버튼 + 결과 */}
          <div className="flex items-center gap-4">
            <button
              onClick={generateReports}
              disabled={generating}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {generating ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                  생성 중...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  {month} 리포트 일괄 생성
                </>
              )}
            </button>
            {generateResult && generateResult.ok && (
              <span className="text-sm text-green-600 font-medium">
                {generateResult.generated}명 리포트 생성 완료
              </span>
            )}
          </div>

          {/* 생성된 리포트 목록 */}
          <div className="rounded-xl border border-black/[0.06] bg-white/72 backdrop-blur-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-black/[0.06]">
              <h3 className="text-sm font-semibold text-gray-700">
                생성된 리포트 ({reports.length}건)
              </h3>
            </div>

            {reports.length === 0 ? (
              <div className="px-5 py-12 text-center text-gray-400 text-sm">
                아직 생성된 리포트가 없습니다. 위 버튼으로 리포트를 생성하세요.
              </div>
            ) : (
              <div className="divide-y divide-black/[0.03]">
                {reports.map(r => (
                  <div key={r.token} className="px-5 py-3 flex items-center gap-4 hover:bg-white/40 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-indigo-100/80 flex items-center justify-center text-indigo-600 text-sm font-bold">
                      {(r.recipient_name || '?')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{r.recipient_name}</p>
                      <p className="text-xs text-gray-400">{r.settlement_month} · 조회 {r.view_count}회</p>
                    </div>
                    <p className="text-sm font-medium text-gray-700 tabular-nums">{nf(Number(r.total_amount))}원</p>
                    <button
                      onClick={() => window.open(r.url, '_blank')}
                      className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-md text-xs font-medium transition-colors"
                    >
                      보기
                    </button>
                    <button
                      onClick={() => {
                        const fullUrl = `${window.location.origin}${r.url}`
                        navigator.clipboard.writeText(fullUrl)
                        alert('링크가 복사되었습니다')
                      }}
                      className="px-3 py-1 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-md text-xs font-medium transition-colors"
                    >
                      링크복사
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
