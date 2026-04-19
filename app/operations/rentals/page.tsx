'use client'

import { useEffect, useMemo, useState } from 'react'

// ═══════════════════════════════════════════════════════════════
// 배반차 스케줄 대시보드
//   fmi_rentals (배차 + 반차) 현황을 Soft Ice Glass 스타일로 렌더링
//   - 상단: 스탯 4개 (전체/운용중/연체/완료)
//   - 필터: 상태 / 플릿 / 검색
//   - 테이블: 고객차/우리차/보험사/기간/상태/액션
// ═══════════════════════════════════════════════════════════════

type Rental = {
  id: string
  rental_no: string | null
  customer_name: string
  customer_phone: string | null
  customer_car_number: string | null
  customer_car_type: string | null
  vehicle_car_number: string | null
  vehicle_car_type: string | null
  insurance_company: string | null
  insurance_claim_no: string | null
  adjuster_name: string | null
  adjuster_phone: string | null
  dispatch_date: string | null
  expected_return_date: string | null
  actual_return_date: string | null
  rental_days: number | null
  daily_rate: number | null
  total_rental_fee: number | null
  final_claim_amount: number | null
  status: string
  handler_name: string | null
  dispatcher_name: string | null
  notes: string | null
  fleet_group: string | null
  vehicle_status: string | null
}

type Stats = {
  total: number
  by_status: Array<{ status: string; count: number }>
  by_fleet: Array<{ fleet_group: string; count: number }>
  active: number
  overdue: number
}

const STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  dispatched: '배차중',
  returned: '반차완료',
  claiming: '청구중',
  settled: '정산완료',
  cancelled: '취소',
}

const STATUS_COLOR: Record<string, string> = {
  dispatched: 'bg-blue-100 text-blue-700 border-blue-200',
  returned: 'bg-amber-100 text-amber-700 border-amber-200',
  claiming: 'bg-violet-100 text-violet-700 border-violet-200',
  settled: 'bg-green-100 text-green-700 border-green-200',
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
}

function fmtDate(d: string | null) {
  if (!d) return '-'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '-'
  return dt.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }).replace(/\s+/g, '')
}
function fmtMoney(v: number | null) {
  if (v === null || v === undefined) return '-'
  return v.toLocaleString('ko-KR')
}

export default function RentalsDashboardPage() {
  const [rentals, setRentals] = useState<Rental[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [fleetFilter, setFleetFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  async function load() {
    try {
      setLoading(true)
      setError(null)
      const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
      const params = new URLSearchParams({ include_stats: '1', limit: '500' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (fleetFilter !== 'all') params.set('fleet_group', fleetFilter)
      if (search.trim()) params.set('q', search.trim())

      const res = await fetch(`/api/fmi-rentals?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)
      setRentals(json.data || [])
      setStats(json.stats || null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter, fleetFilter])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    load()
  }

  const isOverdue = (r: Rental) => {
    if (r.actual_return_date) return false
    if (!r.expected_return_date) return false
    return new Date(r.expected_return_date) < new Date() && ['dispatched', 'claiming'].includes(r.status)
  }

  const statCards = useMemo(() => {
    if (!stats) return []
    return [
      { label: '전체 배차', value: stats.total, color: 'blue', hint: '필터 결과' },
      { label: '운용 중', value: stats.active, color: 'green', hint: '배차중 + 청구중' },
      { label: '연체', value: stats.overdue, color: 'red', hint: '예정일 지남 & 미반납' },
      { label: '정산 완료', value: stats.by_status.find(s => s.status === 'settled')?.count || 0, color: 'violet', hint: '누적' },
    ]
  }, [stats])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-4 sm:p-6">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">배반차 스케줄</h1>
            <p className="text-xs text-slate-500 mt-1">fmi_rentals — 배차·반차·청구·정산 통합 현황</p>
          </div>
          <div className="flex gap-2">
            <a href="/operations/intake-bulk"
               className="px-3 py-1.5 text-xs rounded-lg bg-white/60 border border-black/[0.06] hover:bg-white/80 text-slate-700 font-medium">
              📥 엑셀 일괄 업로드
            </a>
            <a href="/operations"
               className="px-3 py-1.5 text-xs rounded-lg bg-white/60 border border-black/[0.06] hover:bg-white/80 text-slate-700 font-medium">
              ← 배차 스케줄
            </a>
          </div>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statCards.map((card) => {
            const border =
              card.color === 'blue' ? 'border-blue-100/80' :
              card.color === 'green' ? 'border-green-100/80' :
              card.color === 'red' ? 'border-red-100/80' :
              card.color === 'violet' ? 'border-violet-100/80' : 'border-slate-100/80'
            const accent =
              card.color === 'blue' ? 'text-blue-600' :
              card.color === 'green' ? 'text-green-600' :
              card.color === 'red' ? 'text-red-600' :
              card.color === 'violet' ? 'text-violet-600' : 'text-slate-600'
            return (
              <div key={card.label}
                   className={`bg-white/60 rounded-xl border ${border} p-4 shadow-sm`}
                   style={{ backdropFilter: 'blur(8px)' }}>
                <div className="text-[11px] text-slate-500">{card.label}</div>
                <div className={`text-2xl font-bold mt-1 ${accent}`}>{card.value.toLocaleString()}</div>
                <div className="text-[10px] text-slate-400 mt-1">{card.hint}</div>
              </div>
            )
          })}
        </div>

        {/* 필터 */}
        <div className="bg-white/72 rounded-xl border border-black/[0.06] p-3 shadow-sm"
             style={{ backdropFilter: 'blur(12px)' }}>
          <div className="flex flex-wrap gap-2 items-center">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-white/40 border border-black/[0.05]">
              <option value="all">상태 전체</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select value={fleetFilter} onChange={e => setFleetFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-white/40 border border-black/[0.05]">
              <option value="all">플릿 전체</option>
              <option value="마춤카">마춤카</option>
              <option value="빌려타">빌려타</option>
              <option value="부가세(캐피탈)">부가세(캐피탈)</option>
              <option value="따봉">따봉</option>
            </select>
            <form onSubmit={handleSearch} className="flex gap-1 flex-1 min-w-[200px]">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                     placeholder="고객명·차량번호 검색"
                     className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-white/40 border border-black/[0.05]" />
              <button type="submit"
                      className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-white hover:bg-slate-900">
                검색
              </button>
            </form>
            <button onClick={load}
                    className="px-3 py-1.5 text-xs rounded-lg bg-white/40 border border-black/[0.05] hover:bg-white/60">
              🔄 새로고침
            </button>
          </div>
          {stats && stats.by_fleet.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 text-[10px]">
              {stats.by_fleet.map((f: any) => (
                <span key={f.fleet_group}
                      className="px-2 py-0.5 bg-white/40 border border-black/[0.05] rounded-full text-slate-600">
                  {f.fleet_group}: <b>{f.count}</b>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 리스트 */}
        <div className="bg-white/72 rounded-xl border border-black/[0.06] shadow-sm overflow-hidden"
             style={{ backdropFilter: 'blur(12px)' }}>
          {error && (
            <div className="p-4 text-xs text-red-600 bg-red-50">오류: {error}</div>
          )}
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">로딩 중...</div>
          ) : rentals.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              배차 내역이 없습니다.{' '}
              <a href="/operations/intake-bulk" className="text-blue-600 underline">엑셀 업로드</a>로
              데이터를 DB화 해보세요.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50/80 text-slate-600 text-[11px]">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">플릿</th>
                    <th className="px-2 py-2 text-left font-semibold">우리 차량</th>
                    <th className="px-2 py-2 text-left font-semibold">고객차량</th>
                    <th className="px-2 py-2 text-left font-semibold">고객</th>
                    <th className="px-2 py-2 text-left font-semibold">보험사</th>
                    <th className="px-2 py-2 text-center font-semibold">출고</th>
                    <th className="px-2 py-2 text-center font-semibold">반납예정</th>
                    <th className="px-2 py-2 text-center font-semibold">실제반납</th>
                    <th className="px-2 py-2 text-right font-semibold">청구금</th>
                    <th className="px-2 py-2 text-center font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rentals.map((r) => {
                    const overdue = isOverdue(r)
                    return (
                      <tr key={r.id}
                          className={`border-t border-black/[0.04] hover:bg-blue-50/50 ${overdue ? 'bg-red-50/40' : ''}`}>
                        <td className="px-2 py-2 text-slate-700">{r.fleet_group || '-'}</td>
                        <td className="px-2 py-2 font-mono text-slate-800">
                          {r.vehicle_car_number || '-'}
                          {r.vehicle_car_type && <div className="text-[10px] text-slate-400">{r.vehicle_car_type}</div>}
                        </td>
                        <td className="px-2 py-2 font-mono text-slate-700">
                          {r.customer_car_number || '-'}
                          {r.customer_car_type && <div className="text-[10px] text-slate-400">{r.customer_car_type}</div>}
                        </td>
                        <td className="px-2 py-2 text-slate-700">
                          {r.customer_name}
                          {r.customer_phone && <div className="text-[10px] text-slate-400">{r.customer_phone}</div>}
                        </td>
                        <td className="px-2 py-2 text-slate-700">
                          {r.insurance_company || '-'}
                          {r.insurance_claim_no && <div className="text-[10px] text-slate-400">#{r.insurance_claim_no}</div>}
                        </td>
                        <td className="px-2 py-2 text-center text-slate-600">{fmtDate(r.dispatch_date)}</td>
                        <td className={`px-2 py-2 text-center ${overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                          {fmtDate(r.expected_return_date)}
                          {overdue && <div className="text-[10px] text-red-500">⚠️ 연체</div>}
                        </td>
                        <td className="px-2 py-2 text-center text-slate-600">{fmtDate(r.actual_return_date)}</td>
                        <td className="px-2 py-2 text-right text-slate-800 font-medium">
                          {fmtMoney(r.final_claim_amount)}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] border ${STATUS_COLOR[r.status] || 'bg-slate-100 border-slate-200'}`}>
                            {STATUS_LABEL[r.status] || r.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="text-[10px] text-slate-400 text-center pt-2">
          fmi_rentals {rentals.length}건 표시 · 상태/플릿/검색 필터 적용 결과
        </div>
      </div>
    </div>
  )
}
