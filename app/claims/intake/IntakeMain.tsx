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
  vehicleNo: string
  vehicleName: string
  counterpartName: string
  counterpartPhone: string
  counterpartVehicle: string
  counterpartInsurance: string
  towingYn: string
  towingCompany: string
  towingPhone: string
  rentalYn: string
  category: string
  insuranceCode: string
  insuranceName: string
  repairShopName: string
  repairShopPhone: string
  createdBy: string
  createdDate: string
  createdTime: string
}

// ============================================
// Constants
// ============================================
const STATUS_MAP: Record<string, { label: string; bg: string }> = {
  '10': { label: '접수대기', bg: 'bg-red-100 text-red-700' },
  '15': { label: '담당자배정', bg: 'bg-orange-100 text-orange-700' },
}

const FILTER_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: '10', label: '접수대기' },
  { key: '15', label: '담당자배정' },
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

// ============================================
// Main Component
// ============================================
export default function IntakeMain() {
  const { user } = useApp()
  const [accidents, setAccidents] = useState<Accident[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Accident | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Load accidents for intake (status 10, 15)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: '500' })
      const res = await fetch(`/api/cafe24/accidents?${p}`)
      const json = await res.json()
      if (json.success) {
        const filtered = (json.data || []).filter((a: Accident) =>
          ['10', '15'].includes(a.otptstat)
        )
        setAccidents(filtered)
      }
    } catch (e) {
      console.error('사고접수 목록 에러:', e)
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
          a.counterpartName?.toLowerCase().includes(s) ||
          a.accidentLocation?.toLowerCase().includes(s)
      )
    }

    return result
  }, [accidents, statusFilter, search])

  // Stats
  const stats = useMemo(() => {
    const now = new Date()
    const today = now.toISOString().slice(0, 10).replace(/-/g, '')

    return {
      전체접수: accidents.length,
      오늘접수: accidents.filter(a => a.receiptDate === today).length,
      미배정: accidents.filter(a => a.otptstat === '10').length,
      완료: accidents.filter(a => a.otptstat === '15').length,
    }
  }, [accidents])

  // ============================================
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex-shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
              사고접수
            </span>
            <span className="text-xs font-normal text-slate-400 hidden sm:inline">
              Accident Registration
            </span>
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            새로운 사고 등록 및 초기 데이터 입력
          </p>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 sm:px-6 py-4 flex-shrink-0">
        {[
          { label: '전체접수', value: stats.전체접수, color: 'from-blue-500' },
          { label: '오늘접수', value: stats.오늘접수, color: 'from-green-500' },
          { label: '미배정', value: stats.미배정, color: 'from-red-500' },
          { label: '완료', value: stats.완료, color: 'from-emerald-500' },
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

      {/* ── Search & Filter ── */}
      <div className="px-4 sm:px-6 py-3 flex-shrink-0 border-b border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="사고번호, 차량번호, 상대방명, 장소 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <div className="flex gap-1 flex-wrap">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setStatusFilter(opt.key)}
                className={`px-3 py-2 text-xs rounded-lg transition-colors ${
                  statusFilter === opt.key
                    ? 'bg-red-500 text-white'
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
                      </div>
                      <p className="text-xs text-slate-500 mb-1">
                        접수: {fDT(a.receiptDate, a.accidentTime)} | 사고:
                        {fDT(a.accidentDate, a.accidentTime)}
                      </p>
                      <p className="text-sm text-slate-700 mb-1">
                        {a.vehicleName} ({a.vehicleNo})
                      </p>
                      <p className="text-xs text-slate-600">
                        위치: {a.accidentLocation}
                      </p>
                      <p className="text-xs text-slate-600">
                        상대방: {a.counterpartName} {a.counterpartPhone}
                      </p>
                      <p className="text-xs text-slate-600">
                        과실: {a.faultRate}%
                      </p>
                      {a.towingYn === 'Y' && (
                        <p className="text-xs text-blue-600 font-medium">
                          ✓ 견인: {a.towingCompany} {a.towingPhone}
                        </p>
                      )}
                      {a.rentalYn === 'Y' && (
                        <p className="text-xs text-green-600 font-medium">
                          ✓ 대차 필요
                        </p>
                      )}
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
                          보험 정보
                        </p>
                        <p className="text-slate-700">
                          {a.insuranceName} ({a.insuranceCode})
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium">
                          상대방 차량
                        </p>
                        <p className="text-slate-700">{a.counterpartVehicle}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium">
                          상대방 보험
                        </p>
                        <p className="text-slate-700">
                          {a.counterpartInsurance}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs text-slate-500 font-medium">
                          사고 메모
                        </p>
                        <p className="text-slate-700">{a.accidentMemo}</p>
                      </div>
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
