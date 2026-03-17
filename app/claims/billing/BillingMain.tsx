'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

// ============================================
// Types
// ============================================
type Accident = {
  staffId: string
  receiptDate: string
  seqNo: string
  accidentNo: string
  accidentDate: string
  accidentTime: string
  accidentLocation: string
  accidentMemo: string
  faultRate: string
  otptstat: string
  otptmage: string
  vehicleNo: string
  vehicleName: string
  insuranceCode: string
  insuranceName: string
  repairShopName: string
  repairShopPhone: string
  settlementYn: string
  createdBy: string
  createdDate: string
  createdTime: string
}

// ============================================
// Constants
// ============================================
const STATUS_MAP: Record<string, { label: string; bg: string }> = {
  '70': { label: '청구중', bg: 'bg-amber-100 text-amber-700' },
  '80': { label: '손해사정', bg: 'bg-orange-100 text-orange-700' },
  '85': { label: '지급대기', bg: 'bg-yellow-100 text-yellow-700' },
  '90': { label: '종결', bg: 'bg-green-100 text-green-700' },
}

const FILTER_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: '70', label: '청구중' },
  { key: '80', label: '손해사정' },
  { key: '85', label: '지급대기' },
  { key: '90', label: '종결' },
]

// ============================================
// Helpers
// ============================================
const fD = (d: string | null) => {
  if (!d || d.length < 8) return '-'
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}
const fT = (t: string | null) => {
  if (!t || t.length < 4) return ''
  return `${t.slice(0, 2)}:${t.slice(2, 4)}`
}
const fDT = (d: string | null, t: string | null) => {
  const dd = fD(d)
  const tt = fT(t)
  return tt ? `${dd} ${tt}` : dd
}
const fmtPrice = (p: string | null) => {
  if (!p || !p.trim()) return '-'
  return `₩${parseInt(p).toLocaleString()}`
}

// ============================================
// Main Component
// ============================================
export default function BillingMain() {
  const { user } = useApp()
  const [accidents, setAccidents] = useState<Accident[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Accident | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Load accidents for billing (status 70, 80, 85, 90)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: '500' })
      const res = await fetch(`/api/cafe24/accidents?${p}`)
      const json = await res.json()
      if (json.success) {
        const filtered = (json.data || []).filter((a: Accident) =>
          ['70', '80', '85', '90'].includes(a.otptstat)
        )
        setAccidents(filtered)
      }
    } catch (e) {
      console.error('보험청구 목록 에러:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Filter by status
  const filtered = useMemo(() => {
    let result = [...accidents]

    if (statusFilter !== 'all') {
      result = result.filter(a => a.otptstat === statusFilter)
    }

    if (search) {
      const s = search.toLowerCase()
      result = result.filter(
        a =>
          a.accidentNo?.toLowerCase().includes(s) ||
          a.vehicleNo?.toLowerCase().includes(s) ||
          a.insuranceName?.toLowerCase().includes(s)
      )
    }

    return result
  }, [accidents, statusFilter, search])

  // Stats
  const stats = useMemo(() => {
    const total = accidents.length
    const settled = accidents.filter(a => a.settlementYn === 'Y').length
    const notSettled = total - settled

    return {
      청구건수: total,
      미정산: notSettled,
      정산완료: settled,
      종결: accidents.filter(a => a.otptstat === '90').length,
    }
  }, [accidents])

  // Cost summary
  const costSummary = useMemo(() => {
    const total = accidents.reduce((sum, a) => {
      const amount = parseInt(a.otptmage) || 0
      return sum + amount
    }, 0)
    return {
      총청구액: total,
      avgCost: Math.round(total / (accidents.length || 1)),
    }
  }, [accidents])

  // ============================================
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex-shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
              보험청구
            </span>
            <span className="text-xs font-normal text-slate-400 hidden sm:inline">
              Insurance Claims & Billing
            </span>
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            보험청구, 지급추적, 사건 종결
          </p>
        </div>
      </div>

      {/* ── Stats & Cost Summary ── */}
      <div className="px-4 sm:px-6 py-4 flex-shrink-0">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            { label: '청구건수', value: stats.청구건수, color: 'from-amber-500' },
            { label: '미정산', value: stats.미정산, color: 'from-red-500' },
            { label: '정산완료', value: stats.정산완료, color: 'from-green-500' },
            { label: '종결', value: stats.종결, color: 'from-blue-500' },
          ].map((stat, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-[11px] text-slate-500 font-medium">{stat.label}</p>
              <p
                className={`text-xl font-bold bg-gradient-to-r ${stat.color} to-blue-500 bg-clip-text text-transparent`}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Cost Summary */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-amber-600 font-medium">총 청구액</p>
              <p className="text-lg font-bold text-amber-700">
                {fmtPrice(costSummary.총청구액.toString())}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-amber-600 font-medium">평균 청구액</p>
              <p className="text-lg font-bold text-amber-700">
                {fmtPrice(costSummary.avgCost.toString())}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Search & Filter ── */}
      <div className="px-4 sm:px-6 py-3 flex-shrink-0 border-b border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="사고번호, 차량번호, 보험사 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <div className="flex gap-1 flex-wrap">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setStatusFilter(opt.key)}
                className={`px-3 py-2 text-xs rounded-lg transition-colors ${
                  statusFilter === opt.key
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-400">
            로딩중...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-400">
            데이터가 없습니다
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((a, idx) => (
              <div key={`${a.staffId}-${a.receiptDate}-${a.seqNo}`}>
                <div
                  onClick={() =>
                    setExpandedId(
                      expandedId === `${a.staffId}-${a.receiptDate}-${a.seqNo}`
                        ? null
                        : `${a.staffId}-${a.receiptDate}-${a.seqNo}`
                    )
                  }
                  className="bg-white border border-slate-200 rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-900 text-sm">
                          {a.accidentNo}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            STATUS_MAP[a.otptstat]?.bg || 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {STATUS_MAP[a.otptstat]?.label || a.otptstat}
                        </span>
                        {a.settlementYn === 'Y' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                            정산완료
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mb-1">
                        사고: {fDT(a.accidentDate, a.accidentTime)}
                      </p>
                      <p className="text-sm text-slate-700 mb-1">
                        {a.vehicleName} ({a.vehicleNo})
                      </p>
                      <p className="text-xs text-slate-600">
                        보험: {a.insuranceName}
                      </p>
                      <p className="text-xs text-slate-600 font-semibold text-orange-600">
                        청구액: {fmtPrice(a.otptmage)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Detail Panel */}
                {expandedId === `${a.staffId}-${a.receiptDate}-${a.seqNo}` && (
                  <div className="bg-slate-50 border border-slate-200 border-t-0 rounded-b-lg p-4 text-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-slate-500 font-medium">
                          차량 정보
                        </p>
                        <p className="text-slate-700">
                          {a.vehicleName} / {a.vehicleNo}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium">
                          보험사
                        </p>
                        <p className="text-slate-700">
                          {a.insuranceName} ({a.insuranceCode})
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium">
                          청구상태
                        </p>
                        <p className="text-slate-700">
                          {STATUS_MAP[a.otptstat]?.label || a.otptstat}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium">
                          정산여부
                        </p>
                        <p
                          className={`text-slate-700 font-semibold ${
                            a.settlementYn === 'Y'
                              ? 'text-green-600'
                              : 'text-orange-600'
                          }`}
                        >
                          {a.settlementYn === 'Y' ? '정산완료' : '미정산'}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs text-slate-500 font-medium">
                          청구 금액
                        </p>
                        <p className="text-lg font-bold text-orange-600">
                          {fmtPrice(a.otptmage)}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs text-slate-500 font-medium">
                          수리공장
                        </p>
                        <p className="text-slate-700">
                          {a.repairShopName || '-'}{' '}
                          {a.repairShopPhone && `(${a.repairShopPhone})`}
                        </p>
                      </div>
                      {a.accidentMemo && (
                        <div className="sm:col-span-2">
                          <p className="text-xs text-slate-500 font-medium">
                            사고 메모
                          </p>
                          <p className="text-slate-700">{a.accidentMemo}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
