'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

// ============================================
// Types
// ============================================
type Rental = {
  staffId: string; receiptDate: string; seqNo: string
  rentalCarNo: string; rentalCarModel: string
  rentalFromDate: string; rentalFromTime: string
  rentalToDate: string; rentalToTime: string
  rentalStatus: string; rentalType: string
  rentalFactory: string; rentalMemo: string
  deliveryMethod: string; deliveryDate: string; deliveryTime: string
  returnDate: string; returnTime: string
  dailyCost: string; totalCost: string; rentalDays: string
  createdBy: string; createdDate: string; createdTime: string
  // Linked accident info
  accidentNo: string; accidentDate: string; accidentTime: string
  accidentLocation: string; accidentMemo: string; faultRate: string
  accidentStatus: string; repairShopName: string; repairShopPhone: string
  counterpartName: string; counterpartPhone: string; counterpartVehicle: string
  counterpartInsurance: string; towingYn: string; towingCompany: string; towingPhone: string
  category: string; rentalYn: string
  vehicleNo: string; vehicleName: string
  insuranceCode: string; insuranceName: string
  examType: string; accidentNote: string
  damageArea: string; damageDetail: string
  repairCost: string; insuranceCost: string
  deliveryMemo: string; handoverName: string; handoverPhone: string
  completeYn: string; deductYn: string; settlementYn: string; returnYn: string; regType: string
}

type ConsultMemo = {
  staffId: string; receiptDate: string; seqNo: string; lineNo: string
  memoDate: string; memoTime: string; memoType: string
  memoTitle: string; memoContent: string; createdBy: string
  createdDate: string; createdTime: string
}

// ============================================
// Constants
// ============================================
const KANBAN_COLS = [
  { key: 'R', label: '대차요청', icon: '📩', color: '#f97316', bgClass: 'bg-orange-50 border-orange-200' },
  { key: 'C', label: '계약작성', icon: '📝', color: '#3b82f6', bgClass: 'bg-blue-50 border-blue-200' },
  { key: 'D', label: '배차완료', icon: '🚗', color: '#6366f1', bgClass: 'bg-indigo-50 border-indigo-200' },
  { key: 'U', label: '운행중', icon: '🛣️', color: '#22c55e', bgClass: 'bg-green-50 border-green-200' },
  { key: 'W', label: '회차대기', icon: '⏳', color: '#eab308', bgClass: 'bg-yellow-50 border-yellow-200' },
  { key: 'F', label: '반납완료', icon: '🔄', color: '#06b6d4', bgClass: 'bg-cyan-50 border-cyan-200' },
  { key: 'B', label: '청구', icon: '💰', color: '#f59e0b', bgClass: 'bg-amber-50 border-amber-200' },
]

const STATUS_MAP: Record<string, { label: string; color: string; bgClass: string }> = {
  'R': { label: '대차요청', color: '#f97316', bgClass: 'bg-orange-100 text-orange-700' },
  'C': { label: '계약작성', color: '#3b82f6', bgClass: 'bg-blue-100 text-blue-700' },
  'D': { label: '배차완료', color: '#6366f1', bgClass: 'bg-indigo-100 text-indigo-700' },
  'U': { label: '운행중', color: '#22c55e', bgClass: 'bg-green-100 text-green-700' },
  'W': { label: '회차대기', color: '#eab308', bgClass: 'bg-yellow-100 text-yellow-700' },
  'F': { label: '반납완료', color: '#06b6d4', bgClass: 'bg-cyan-100 text-cyan-700' },
  'S': { label: '대기', color: '#6b7280', bgClass: 'bg-gray-100 text-gray-700' },
  'B': { label: '청구중', color: '#f59e0b', bgClass: 'bg-amber-100 text-amber-700' },
  'Z': { label: '종결', color: '#22c55e', bgClass: 'bg-green-100 text-green-700' },
}

const TYPE_MAP: Record<string, { label: string; color: string; desc: string }> = {
  'M': { label: '정비대차', color: 'bg-emerald-100 text-emerald-700', desc: '렌트상품 포함 (무상)' },
  'P': { label: '유상대차', color: 'bg-amber-100 text-amber-700', desc: '자차과실, 고객부담' },
  'V': { label: '피해대차', color: 'bg-red-100 text-red-700', desc: '상대과실, 보험사청구' },
}

const ACC_STATUS: Record<string, { label: string; bg: string }> = {
  '10': { label: '사고접수', bg: 'bg-red-100 text-red-700' },
  '20': { label: '검수중', bg: 'bg-yellow-100 text-yellow-700' },
  '40': { label: '공장입고', bg: 'bg-blue-100 text-blue-700' },
  '50': { label: '수리중', bg: 'bg-violet-100 text-violet-700' },
  '60': { label: '출고완료', bg: 'bg-cyan-100 text-cyan-700' },
  '70': { label: '청구중', bg: 'bg-amber-100 text-amber-700' },
  '90': { label: '종결', bg: 'bg-green-100 text-green-700' },
}

const MEMO_TYPE: Record<string, { label: string; icon: string; border: string }> = {
  'T': { label: '전화', icon: '📞', border: 'border-blue-200 bg-blue-50' },
  'V': { label: '방문', icon: '🏢', border: 'border-green-200 bg-green-50' },
  'S': { label: 'SMS', icon: '💬', border: 'border-purple-200 bg-purple-50' },
  'M': { label: '메모', icon: '📝', border: 'border-slate-200 bg-slate-50' },
  'E': { label: '이메일', icon: '📧', border: 'border-orange-200 bg-orange-50' },
  'K': { label: '카톡', icon: '💛', border: 'border-yellow-200 bg-yellow-50' },
}

// ============================================
// Helpers
// ============================================
const fD = (d: string | null) => { if (!d || d.length < 8) return '-'; return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` }
const fT = (t: string | null) => { if (!t || t.length < 4) return ''; return `${t.slice(0,2)}:${t.slice(2,4)}` }
const fDT = (d: string | null, t: string | null) => { const dd = fD(d), tt = fT(t); return tt ? `${dd} ${tt}` : dd }
const calcDays = (from: string | null, to: string | null) => {
  if (!from || from.length < 8) return null
  const f = new Date(`${from.slice(0,4)}-${from.slice(4,6)}-${from.slice(6,8)}`)
  const t = to && to.length >= 8 ? new Date(`${to.slice(0,4)}-${to.slice(4,6)}-${to.slice(6,8)}`) : new Date()
  return Math.max(1, Math.ceil((t.getTime() - f.getTime()) / 86400000))
}
const isOverdue = (toDate: string | null) => {
  if (!toDate || toDate.length < 8) return false
  const t = new Date(`${toDate.slice(0,4)}-${toDate.slice(4,6)}-${toDate.slice(6,8)}`)
  return t.getTime() < Date.now()
}

// ============================================
// Main Component
// ============================================
export default function RentalMain() {
  const { user } = useApp()
  const [rentals, setRentals] = useState<Rental[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Rental | null>(null)
  const [memos, setMemos] = useState<ConsultMemo[]>([])
  const [memosLoading, setMemosLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [detailTab, setDetailTab] = useState<'rental' | 'accident' | 'timeline' | 'cost'>('rental')

  // Load
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: '500' })
      if (search) p.set('search', search)
      if (typeFilter !== 'all') p.set('type', typeFilter)
      const res = await fetch(`/api/cafe24/rentals?${p}`)
      const json = await res.json()
      if (json.success) setRentals(json.data || [])
    } catch (e) { console.error('대차 목록 에러:', e) }
    finally { setLoading(false) }
  }, [search, typeFilter])

  useEffect(() => { load() }, [load])

  // Load memos for selected rental
  const loadMemos = useCallback(async (r: Rental) => {
    setMemosLoading(true)
    try {
      const p = new URLSearchParams({ staffId: r.staffId, receiptDate: r.receiptDate, seqNo: r.seqNo })
      const res = await fetch(`/api/cafe24/consultations?${p}`)
      const json = await res.json()
      if (json.success) setMemos(json.data || [])
    } catch (e) { console.error('상담이력 에러:', e) }
    finally { setMemosLoading(false) }
  }, [])

  const handleSelect = (r: Rental) => {
    setSelected(r)
    setDetailTab('rental')
    loadMemos(r)
  }

  // Group by status for Kanban
  const grouped = useMemo(() => {
    const map: Record<string, Rental[]> = {}
    KANBAN_COLS.forEach(c => { map[c.key] = [] })
    rentals.forEach(r => {
      const key = r.rentalStatus || 'R'
      if (map[key]) map[key].push(r)
      else {
        // S, Z goes to last column
        if (key === 'S' || key === 'Z') map['B']?.push(r)
        else map['R']?.push(r)
      }
    })
    return map
  }, [rentals])

  const stats = useMemo(() => ({
    total: rentals.length,
    active: rentals.filter(r => ['D','U','W'].includes(r.rentalStatus)).length,
    overdue: rentals.filter(r => r.rentalStatus === 'U' && isOverdue(r.rentalToDate)).length,
    billing: rentals.filter(r => r.rentalStatus === 'B').length,
  }), [rentals])

  // ============================================
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">대차관리</span>
              <span className="text-xs font-normal text-slate-400 hidden sm:inline">Rental Car Operations</span>
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">7단계 대차운영 프로세스 — 요청부터 청구까지</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-slate-100 p-0.5 rounded-lg">
              <button onClick={() => setViewMode('kanban')}
                className={`px-2.5 py-1 text-xs rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-slate-700 font-medium' : 'text-slate-500'}`}>
                📊 칸반
              </button>
              <button onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 text-xs rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-700 font-medium' : 'text-slate-500'}`}>
                📋 리스트
              </button>
            </div>
            <button onClick={load} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-sm">🔄</button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-2 mt-3">
          {[
            { label: '전체', val: stats.total, c: 'bg-slate-50 text-slate-700' },
            { label: '운행중', val: stats.active, c: 'bg-green-50 text-green-600' },
            { label: '연체', val: stats.overdue, c: stats.overdue > 0 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-red-50 text-red-600' },
            { label: '청구', val: stats.billing, c: 'bg-amber-50 text-amber-600' },
          ].map(s => (
            <div key={s.label} className={`flex-1 min-w-[70px] rounded-xl px-3 py-2 ${s.c}`}>
              <div className="text-xl font-bold">{s.val}</div>
              <div className="text-[10px] font-medium opacity-70">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search & Type Filter */}
        <div className="flex gap-2 mt-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <input type="text" placeholder="차량번호, 사고번호, 고객명 검색..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-300 outline-none" />
            <span className="absolute left-2.5 top-2.5 text-slate-400 text-sm">🔍</span>
          </div>
          <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
            {[
              { key: 'all', label: '전체' },
              { key: 'M', label: '정비' },
              { key: 'P', label: '유상' },
              { key: 'V', label: '피해' },
            ].map(t => (
              <button key={t.key} onClick={() => setTypeFilter(t.key)}
                className={`px-2.5 py-1 text-xs rounded-md transition-all ${typeFilter === t.key ? 'bg-white shadow-sm font-medium text-slate-700' : 'text-slate-500'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Kanban or List */}
        <div className={`${selected ? 'hidden lg:flex lg:flex-1' : 'flex-1'} overflow-hidden`}>
          {loading ? (
            <div className="flex items-center justify-center w-full h-64">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <span className="text-sm text-slate-500">대차 목록 로딩...</span>
              </div>
            </div>
          ) : viewMode === 'kanban' ? (
            /* Kanban Board */
            <div className="flex gap-3 p-4 overflow-x-auto w-full">
              {KANBAN_COLS.map(col => {
                const items = grouped[col.key] || []
                return (
                  <div key={col.key} className="flex-shrink-0 w-[250px] flex flex-col">
                    {/* Column Header */}
                    <div className={`rounded-t-xl px-3 py-2.5 border ${col.bgClass} flex items-center justify-between`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{col.icon}</span>
                        <span className="text-xs font-bold">{col.label}</span>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/60">{items.length}</span>
                    </div>
                    {/* Column Body */}
                    <div className="flex-1 bg-slate-50/50 border-x border-b border-slate-200 rounded-b-xl p-2 space-y-2 overflow-y-auto min-h-[200px]">
                      {items.length === 0 ? (
                        <div className="text-center text-[10px] text-slate-400 py-8">비어있음</div>
                      ) : items.map((r, i) => (
                        <KanbanCard key={`${r.staffId}-${r.seqNo}-${i}`} rental={r} onClick={() => handleSelect(r)} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* List View */
            <div className="bg-white overflow-y-auto w-full">
              <div className="divide-y divide-slate-100">
                {rentals.map((r, i) => (
                  <RentalListItem key={`${r.staffId}-${r.seqNo}-${i}`} rental={r} onClick={() => handleSelect(r)} isSelected={selected?.staffId === r.staffId && selected?.seqNo === r.seqNo} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Detail Panel */}
        {selected && (
          <div className="flex-1 lg:max-w-[600px] lg:border-l border-slate-200 flex flex-col overflow-y-auto bg-slate-50">
            {/* Detail Header */}
            <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelected(null)} className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">←</button>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      {selected.rentalCarNo || '차량미배정'}
                      {selected.rentalType && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${(TYPE_MAP[selected.rentalType] || {}).color || 'bg-slate-100'}`}>
                          {(TYPE_MAP[selected.rentalType] || {}).label || selected.rentalType}
                        </span>
                      )}
                    </h2>
                    <p className="text-[11px] text-slate-500">{selected.rentalCarModel || '-'} · {fDT(selected.rentalFromDate, selected.rentalFromTime)}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${(STATUS_MAP[selected.rentalStatus] || STATUS_MAP['R']).bgClass}`}>
                  {(STATUS_MAP[selected.rentalStatus] || STATUS_MAP['R']).label}
                </span>
              </div>

              {/* Rental Progress (7-step mini) */}
              <div className="flex gap-0.5">
                {KANBAN_COLS.map((col) => {
                  const colIdx = KANBAN_COLS.findIndex(c => c.key === col.key)
                  const currentIdx = KANBAN_COLS.findIndex(c => c.key === selected.rentalStatus)
                  const done = colIdx <= currentIdx
                  return (
                    <div key={col.key} className="flex-1 flex flex-col items-center">
                      <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: done ? col.color : '#e2e8f0' }} />
                      <span className="text-[8px] mt-0.5 text-slate-400">{col.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Duration Banner */}
            {selected.rentalFromDate && (
              <div className="mx-4 sm:mx-6 mt-4 flex-shrink-0">
                <div className={`p-4 rounded-xl shadow-lg text-white ${
                  isOverdue(selected.rentalToDate) && selected.rentalStatus === 'U'
                    ? 'bg-gradient-to-r from-red-500 to-red-600'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-600'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs opacity-80">대차 기간</div>
                      <div className="text-2xl font-bold">{calcDays(selected.rentalFromDate, selected.rentalToDate) || '-'}일</div>
                    </div>
                    {isOverdue(selected.rentalToDate) && selected.rentalStatus === 'U' && (
                      <div className="text-right">
                        <div className="text-xs font-bold bg-white/20 px-2 py-1 rounded animate-pulse">⚠️ 반납기한 초과</div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="bg-white/10 rounded-lg px-3 py-2">
                      <div className="text-[10px] opacity-70">시작</div>
                      <div className="text-xs font-medium">{fDT(selected.rentalFromDate, selected.rentalFromTime)}</div>
                    </div>
                    <div className="bg-white/10 rounded-lg px-3 py-2">
                      <div className="text-[10px] opacity-70">종료(예정)</div>
                      <div className="text-xs font-medium">{fDT(selected.rentalToDate, selected.rentalToTime)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="px-4 sm:px-6 mt-4 flex-shrink-0">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
                {([
                  { key: 'rental', label: '🚗 대차정보' },
                  { key: 'accident', label: `🚨 사고상세${selected.accidentNo ? '' : '(없음)'}` },
                  { key: 'timeline', label: `💬 상담${memos.length > 0 ? ` (${memos.length})` : ''}` },
                  { key: 'cost', label: '💰 비용' },
                ] as const).map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)}
                    className={`flex-1 min-w-fit px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${detailTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="px-4 sm:px-6 py-4 flex-1">
              {detailTab === 'rental' && <RentalDetailTab r={selected} />}
              {detailTab === 'accident' && <AccidentDetailTab r={selected} />}
              {detailTab === 'timeline' && <TimelineTab memos={memos} loading={memosLoading} />}
              {detailTab === 'cost' && <CostDetailTab r={selected} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// Kanban Card
// ============================================
function KanbanCard({ rental: r, onClick }: { rental: Rental; onClick: () => void }) {
  const type = TYPE_MAP[r.rentalType] || null
  const overdue = r.rentalStatus === 'U' && isOverdue(r.rentalToDate)
  const days = calcDays(r.rentalFromDate, r.rentalToDate)

  return (
    <div onClick={onClick}
      className={`bg-white rounded-lg border p-3 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${overdue ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200'}`}>
      {/* Top */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-slate-800">{r.rentalCarNo || '미배정'}</span>
        {overdue && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-bold animate-pulse">연체!</span>}
      </div>
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-[11px] text-slate-700 font-medium">{r.rentalCarModel || '-'}</span>
        {(() => { const lr = matchLotteRate(r.rentalCarModel); return lr ? <span className="text-[8px] px-1 py-0.5 rounded bg-blue-50 text-blue-500">{lr.group}</span> : null })()}
      </div>

      {/* Type badge */}
      {type && (
        <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full font-medium mb-2 ${type.color}`}>
          {type.label}
        </span>
      )}

      {/* Date */}
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>{fD(r.rentalFromDate)}</span>
        <span>→</span>
        <span>{fD(r.rentalToDate)}</span>
      </div>

      {/* Days & Cost estimate */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          {days && <span className="text-[10px] font-medium text-slate-500">{days}일</span>}
          {(() => {
            const lr = matchLotteRate(r.rentalCarModel)
            if (lr && days) {
              const est = Math.round(lr.daily24h * 0.7) * days
              return <span className="text-[9px] text-blue-500 font-medium">~{(est/10000).toFixed(0)}만</span>
            }
            return null
          })()}
        </div>
        {r.accidentNo && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-medium">🚨 #{r.accidentNo}</span>
        )}
      </div>

      {/* Counterpart */}
      {r.counterpartName && (
        <div className="text-[10px] text-slate-400 mt-1 truncate">👤 {r.counterpartName} {r.counterpartInsurance && `(${r.counterpartInsurance})`}</div>
      )}
    </div>
  )
}

// ============================================
// List Item
// ============================================
function RentalListItem({ rental: r, onClick, isSelected }: { rental: Rental; onClick: () => void; isSelected: boolean }) {
  const st = STATUS_MAP[r.rentalStatus] || STATUS_MAP['R']
  const type = TYPE_MAP[r.rentalType] || null
  const overdue = r.rentalStatus === 'U' && isOverdue(r.rentalToDate)
  const days = calcDays(r.rentalFromDate, r.rentalToDate)

  return (
    <div onClick={onClick}
      className={`px-4 py-3 cursor-pointer transition-all hover:bg-slate-50 ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.bgClass}`}>{st.label}</span>
          <span className="text-xs font-bold text-slate-800">{r.rentalCarNo || '미배정'}</span>
          {type && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${type.color}`}>{type.label}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {overdue && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-bold animate-pulse">연체!</span>}
          {r.accidentNo && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-500">🚨 #{r.accidentNo}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>{r.rentalCarModel || '-'}</span>
        <span className="text-slate-300">|</span>
        <span>{fD(r.rentalFromDate)} ~ {fD(r.rentalToDate)}</span>
        {days && <><span className="text-slate-300">|</span><span className="font-medium">{days}일</span></>}
      </div>
      {r.counterpartName && <div className="text-[10px] text-slate-400 mt-1">👤 {r.counterpartName} {r.counterpartInsurance && `· ${r.counterpartInsurance}`}</div>}
    </div>
  )
}

// ============================================
// Rental Detail Tab
// ============================================
function RentalDetailTab({ r }: { r: Rental }) {
  const type = TYPE_MAP[r.rentalType] || null
  return (
    <div className="space-y-4">
      {/* Type Info */}
      {type && (
        <div className={`rounded-xl border p-4 ${type.color.replace('text-', 'border-').replace('100', '200')}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${type.color}`}>{type.label}</span>
          </div>
          <p className="text-xs text-slate-600">{type.desc}</p>
        </div>
      )}

      <Card title="🚗 대차 차량 정보">
        <div className="grid grid-cols-2 gap-4">
          <F label="차량번호" val={r.rentalCarNo || '미배정'} hl />
          <F label="차종" val={r.rentalCarModel || '-'} />
          <F label="배차일시" val={fDT(r.rentalFromDate, r.rentalFromTime)} />
          <F label="반납예정" val={fDT(r.rentalToDate, r.rentalToTime)} />
          <F label="배차방법" val={r.deliveryMethod || '-'} />
          <F label="공장" val={r.rentalFactory || '-'} />
          <F label="접수자" val={r.createdBy || '-'} />
          <F label="접수일시" val={fDT(r.createdDate, r.createdTime)} />
        </div>
        {r.rentalMemo && <div className="mt-3 bg-slate-50 rounded-lg p-3 text-sm text-slate-600"><span className="text-xs font-medium text-slate-500 block mb-1">메모</span>{r.rentalMemo}</div>}
      </Card>

      {/* Checklist (step-specific) */}
      <Card title="✅ 현재 단계 체크리스트">
        <div className="grid grid-cols-1 gap-1.5">
          {getRentalChecklist(r.rentalStatus).map((item, i) => (
            <label key={i} className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors">
              <input type="checkbox" className="rounded border-slate-300" />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </Card>
    </div>
  )
}

function getRentalChecklist(status: string): string[] {
  switch (status) {
    case 'R': return ['대차 유형 확인 (정비/유상/피해)', '희망 차종/등급 확인', '대차 기간 확인', '인수 장소/방법 확인']
    case 'C': return ['계약서 작성', '대차 요금 확인', '보험 조건 확인', '면책 사항 안내', '전자서명 완료']
    case 'D': return ['차량 상태 점검', '출차 전 사진촬영 (4면)', '주행거리 기록', '연료량 기록', '배차완료 문자 발송']
    case 'U': return ['수리 진행 상태 확인', '대차 기간 연장 필요 확인', '고객 상황 안내']
    case 'W': return ['사고차 수리완료 확인', '반납 일정 조율', '고객 연락']
    case 'F': return ['차량 상태 점검', '반납 사진촬영 (4면)', '주행거리 기록', '연료량 확인', '파손 여부 확인', '반납확인 문자']
    case 'B': return ['청구 대상 확인', '임차료 계산 (일단가×일수)', '탁송비 확인', '유류비 차액 확인', '청구서 발행']
    default: return ['대차 상태 확인']
  }
}

// ============================================
// Accident Detail Tab (사고접수 상세 연동 — ERP 수준 상세)
// ============================================
const EXAM_MAP: Record<string, string> = { 'S': '자차', 'O': '상대', 'B': '쌍방', 'N': '무과실' }
const DAMAGE_LABELS: Record<string, string> = {
  'FL': '좌측 앞', 'FC': '앞면 중앙', 'FR': '우측 앞', 'SL': '좌측면', 'SR': '우측면',
  'RL': '좌측 뒤', 'RC': '뒷면 중앙', 'RR': '우측 뒤', 'RF': '지붕', 'HD': '후드', 'TK': '트렁크'
}

function AccidentDetailTab({ r }: { r: Rental }) {
  if (!r.accidentNo) return (
    <div className="flex flex-col items-center justify-center h-40 text-slate-400">
      <span className="text-3xl mb-2">🚨</span>
      <p className="text-sm">연결된 사고 정보가 없습니다</p>
    </div>
  )

  const accSt = ACC_STATUS[r.accidentStatus] || { label: r.accidentStatus || '-', bg: 'bg-slate-100 text-slate-700' }
  const repairAmt = parseInt(r.repairCost) || 0
  const insAmt = parseInt(r.insuranceCost) || 0

  return (
    <div className="space-y-4">
      {/* Accident Summary Header */}
      <div className="bg-gradient-to-br from-red-500 to-orange-500 rounded-xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-lg">사고 #{r.accidentNo}</h3>
            <p className="text-red-100 text-sm">{fDT(r.accidentDate, r.accidentTime)}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${accSt.bg}`}>{accSt.label}</span>
        </div>
        {/* Key stats row */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-white/15 rounded-lg px-3 py-2 text-center">
            <div className="text-[10px] opacity-70">과실비율</div>
            <div className="text-lg font-bold">{r.faultRate ? `${r.faultRate}%` : '-'}</div>
          </div>
          <div className="bg-white/15 rounded-lg px-3 py-2 text-center">
            <div className="text-[10px] opacity-70">사고유형</div>
            <div className="text-sm font-bold">{EXAM_MAP[r.examType] || r.examType || '-'}</div>
          </div>
          <div className="bg-white/15 rounded-lg px-3 py-2 text-center">
            <div className="text-[10px] opacity-70">정산</div>
            <div className="text-sm font-bold">{r.settlementYn === 'Y' ? '완료' : '미완료'}</div>
          </div>
        </div>
        {r.accidentLocation && (
          <div className="bg-white/10 rounded-lg p-3 mt-3">
            <div className="text-red-200 text-xs">사고장소</div>
            <div className="text-sm font-medium mt-0.5">📍 {r.accidentLocation}</div>
          </div>
        )}
      </div>

      {/* 사고 차량 정보 */}
      <Card title="🚗 사고 차량" headerColor="bg-slate-50 border-slate-200 text-slate-700">
        <div className="grid grid-cols-2 gap-4">
          <F label="차량번호" val={r.vehicleNo || '-'} hl />
          <F label="차량명" val={r.vehicleName || '-'} />
          <F label="보험사" val={r.insuranceName || '-'} hl />
          <F label="보험코드" val={r.insuranceCode || '-'} />
        </div>
      </Card>

      {/* 사고 접수정보 */}
      <Card title="🚨 사고 접수정보" headerColor="bg-red-50 border-red-100 text-red-700">
        <div className="grid grid-cols-2 gap-4">
          <F label="사고번호" val={`#${r.accidentNo}`} hl />
          <F label="사고일시" val={fDT(r.accidentDate, r.accidentTime)} />
          <F label="과실비율" val={r.faultRate ? `${r.faultRate}%` : '-'} hl />
          <F label="검사유형" val={EXAM_MAP[r.examType] || r.examType || '-'} />
          <F label="사고유형" val={r.category || '-'} />
          <F label="등록유형" val={r.regType || '-'} />
          <F label="대차여부" val={r.rentalYn === 'Y' ? '✅ 있음' : '❌ 없음'} />
          <F label="반납여부" val={r.returnYn === 'Y' ? '✅ 완료' : '⏳ 미반납'} />
          <F label="완료여부" val={r.completeYn === 'Y' ? '✅ 완료' : '⏳ 진행중'} />
          <F label="면책여부" val={r.deductYn === 'Y' ? '✅ 면책' : '❌ 해당없음'} />
        </div>
        {(r.accidentMemo || r.accidentNote) && (
          <div className="mt-3 bg-red-50/50 rounded-lg p-3">
            {r.accidentMemo && <div className="text-sm text-slate-600 mb-1"><span className="text-xs font-medium text-red-500">사고내용: </span>{r.accidentMemo}</div>}
            {r.accidentNote && <div className="text-sm text-slate-600"><span className="text-xs font-medium text-red-500">사고메모: </span>{r.accidentNote}</div>}
          </div>
        )}
      </Card>

      {/* 파손 부위 */}
      {(r.damageArea || r.damageDetail) && (
        <Card title="💥 파손 정보" headerColor="bg-violet-50 border-violet-100 text-violet-700">
          <div className="space-y-2">
            {r.damageArea && (
              <div>
                <div className="text-[10px] text-slate-400 mb-1">파손부위</div>
                <div className="flex flex-wrap gap-1">
                  {r.damageArea.split(',').map((area: string, i: number) => (
                    <span key={i} className="inline-flex items-center px-2 py-1 rounded-lg bg-violet-100 text-violet-700 text-xs font-medium">
                      {DAMAGE_LABELS[area.trim()] || area.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {r.damageDetail && (
              <div className="bg-violet-50/50 rounded-lg p-3">
                <div className="text-[10px] text-slate-400 mb-1">파손 상세</div>
                <div className="text-sm text-slate-600">{r.damageDetail}</div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 수리비/보험비 */}
      {(repairAmt > 0 || insAmt > 0) && (
        <Card title="💰 수리/보험 비용" headerColor="bg-amber-50 border-amber-100 text-amber-700">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <div className="text-[10px] text-slate-400">수리비</div>
              <div className="text-lg font-bold text-red-600">{repairAmt > 0 ? `${repairAmt.toLocaleString()}원` : '-'}</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="text-[10px] text-slate-400">보험처리금</div>
              <div className="text-lg font-bold text-blue-600">{insAmt > 0 ? `${insAmt.toLocaleString()}원` : '-'}</div>
            </div>
          </div>
          {repairAmt > 0 && insAmt > 0 && (
            <div className="mt-2 text-center text-xs text-slate-500">
              자기부담금 추정: <b className="text-orange-600">{(repairAmt - insAmt > 0 ? repairAmt - insAmt : 0).toLocaleString()}원</b>
            </div>
          )}
        </Card>
      )}

      {/* 수리공장 */}
      <Card title="🔧 수리공장" headerColor="bg-indigo-50 border-indigo-100 text-indigo-700">
        <div className="grid grid-cols-2 gap-4">
          <F label="공장명" val={r.repairShopName || '-'} hl />
          <F label="연락처" val={r.repairShopPhone || '-'} href={r.repairShopPhone ? `tel:${r.repairShopPhone}` : undefined} />
        </div>
        {r.deliveryMemo && (
          <div className="mt-3 bg-indigo-50/50 rounded-lg p-3 text-sm text-slate-600">
            <span className="text-xs font-medium text-indigo-500">탁송메모: </span>{r.deliveryMemo}
          </div>
        )}
      </Card>

      {/* 상대방 정보 */}
      <Card title="⚠️ 상대방 정보" headerColor="bg-orange-50 border-orange-100 text-orange-700">
        <div className="grid grid-cols-2 gap-4">
          <F label="성명" val={r.counterpartName || '-'} hl />
          <F label="연락처" val={r.counterpartPhone || '-'} href={r.counterpartPhone ? `tel:${r.counterpartPhone}` : undefined} />
          <F label="차량정보" val={r.counterpartVehicle || '-'} />
          <F label="보험사" val={r.counterpartInsurance || '-'} hl />
        </div>
      </Card>

      {/* 견인 정보 */}
      <Card title="🚛 견인 정보" headerColor="bg-cyan-50 border-cyan-100 text-cyan-700">
        <div className="grid grid-cols-2 gap-4">
          <F label="견인여부" val={r.towingYn === 'Y' ? '✅ 필요' : '❌ 불요'} hl />
          <F label="견인업체" val={r.towingCompany || '-'} />
          <F label="견인연락처" val={r.towingPhone || '-'} href={r.towingPhone ? `tel:${r.towingPhone}` : undefined} />
        </div>
      </Card>

      {/* 인수자 정보 */}
      {(r.handoverName || r.handoverPhone) && (
        <Card title="🤝 인수자 정보" headerColor="bg-teal-50 border-teal-100 text-teal-700">
          <div className="grid grid-cols-2 gap-4">
            <F label="인수자" val={r.handoverName || '-'} />
            <F label="연락처" val={r.handoverPhone || '-'} href={r.handoverPhone ? `tel:${r.handoverPhone}` : undefined} />
          </div>
        </Card>
      )}

      {/* Link to full accident page */}
      <a href={`/accidents`} className="block text-center py-3 text-sm text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors font-medium">
        🔗 사고관리 페이지에서 전체 상세 보기 →
      </a>
    </div>
  )
}

// ============================================
// Timeline Tab (상담이력)
// ============================================
function TimelineTab({ memos, loading }: { memos: ConsultMemo[]; loading: boolean }) {
  if (loading) return <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
  if (memos.length === 0) return (
    <div className="flex flex-col items-center justify-center h-40 text-slate-400">
      <span className="text-3xl mb-2">💬</span>
      <p className="text-sm">등록된 상담이력이 없습니다</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 mb-2">총 <b>{memos.length}</b>건의 상담이력</div>
      <div className="relative">
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-200" />
        {memos.map((m, i) => {
          const mt = MEMO_TYPE[m.memoType] || MEMO_TYPE['M']
          return (
            <div key={`${m.lineNo}-${i}`} className="relative flex gap-3 pb-4">
              <div className={`relative z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 ${mt.border}`}>
                <span className="text-sm">{mt.icon}</span>
              </div>
              <div className={`flex-1 rounded-xl border p-3 shadow-sm ${mt.border}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/80 font-medium text-slate-600">{mt.label}</span>
                    {m.memoTitle && <span className="text-xs font-medium text-slate-700">{m.memoTitle}</span>}
                  </div>
                  <span className="text-[10px] text-slate-400">{fD(m.memoDate)} {fT(m.memoTime)}</span>
                </div>
                {m.memoContent && <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{m.memoContent}</p>}
                <div className="mt-2 text-[10px] text-slate-400">작성: {m.createdBy || '-'}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================
// Lotte Rental Standard Rates (차종별 기준단가 — 롯데렌터카 기준)
// ============================================
const LOTTE_RATES: { group: string; models: string[]; daily24h: number; keywords: string[] }[] = [
  { group: '경형', models: ['모닝', '스파크', '레이', '캐스퍼'], daily24h: 53900, keywords: ['모닝','spark','스파크','레이','ray','캐스퍼','casper'] },
  { group: '소형', models: ['아반떼', 'K3'], daily24h: 66000, keywords: ['아반떼','avante','k3'] },
  { group: '준중형', models: ['쏘나타', 'K5', '아이오닉6'], daily24h: 83600, keywords: ['쏘나타','sonata','k5','아이오닉6','ioniq6'] },
  { group: '중형', models: ['그랜저', 'K8', '제네시스G70'], daily24h: 107800, keywords: ['그랜저','grandeur','k8','g70','제네시스'] },
  { group: '대형', models: ['제네시스G80', 'G90'], daily24h: 165000, keywords: ['g80','g90','제네시스g80','제네시스g90'] },
  { group: 'SUV 소형', models: ['코나', '셀토스', 'XM3'], daily24h: 72600, keywords: ['코나','kona','셀토스','seltos','xm3'] },
  { group: 'SUV 준중형', models: ['투싼', '스포티지', '니로'], daily24h: 92400, keywords: ['투싼','tucson','스포티지','sportage','니로','niro'] },
  { group: 'SUV 중형', models: ['싼타페', '쏘렌토'], daily24h: 112200, keywords: ['싼타페','santafe','쏘렌토','sorento'] },
  { group: 'SUV 대형', models: ['팰리세이드', '모하비', 'GV80'], daily24h: 143000, keywords: ['팰리세이드','palisade','모하비','mohave','gv80'] },
  { group: '승합', models: ['스타리아', '카니발'], daily24h: 121000, keywords: ['스타리아','staria','카니발','carnival'] },
  { group: '화물', models: ['포터', '봉고'], daily24h: 77000, keywords: ['포터','porter','봉고','bongo'] },
]

function matchLotteRate(carModel: string): typeof LOTTE_RATES[0] | null {
  if (!carModel) return null
  const lower = carModel.toLowerCase().replace(/\s/g, '')
  for (const rate of LOTTE_RATES) {
    for (const kw of rate.keywords) {
      if (lower.includes(kw.toLowerCase())) return rate
    }
  }
  return null
}

// 실시간 사용 시간 계산 (시간 단위 소수점)
function calcUsageHours(fromDate: string | null, fromTime: string | null, toDate: string | null, toTime: string | null): { hours: number; days: number; remainHours: number } | null {
  if (!fromDate || fromDate.length < 8) return null
  const fDStr = `${fromDate.slice(0,4)}-${fromDate.slice(4,6)}-${fromDate.slice(6,8)}`
  const fTStr = fromTime && fromTime.length >= 4 ? `${fromTime.slice(0,2)}:${fromTime.slice(2,4)}` : '00:00'
  const tDStr = toDate && toDate.length >= 8 ? `${toDate.slice(0,4)}-${toDate.slice(4,6)}-${toDate.slice(6,8)}` : new Date().toISOString().slice(0,10)
  const tTStr = toTime && toTime.length >= 4 ? `${toTime.slice(0,2)}:${toTime.slice(2,4)}` : new Date().toTimeString().slice(0,5)
  const from = new Date(`${fDStr}T${fTStr}:00`)
  const to = new Date(`${tDStr}T${tTStr}:00`)
  const diffMs = Math.max(0, to.getTime() - from.getTime())
  const totalHours = diffMs / (1000 * 60 * 60)
  const days = Math.floor(totalHours / 24)
  const remainHours = totalHours - (days * 24)
  return { hours: totalHours, days, remainHours }
}

// ============================================
// Cost Detail Tab (롯데렌터카 기준 실시간 요금 산정)
// ============================================
function CostDetailTab({ r }: { r: Rental }) {
  const [discountRate, setDiscountRate] = useState(30) // 기본 30% 할인율
  const [now, setNow] = useState(Date.now())

  // 실시간 업데이트 (운행중인 경우 매분 갱신)
  useEffect(() => {
    if (r.rentalStatus === 'U' || r.rentalStatus === 'D') {
      const iv = setInterval(() => setNow(Date.now()), 60000)
      return () => clearInterval(iv)
    }
  }, [r.rentalStatus])

  const type = TYPE_MAP[r.rentalType] || null
  const lotteRate = matchLotteRate(r.rentalCarModel)
  const daily = parseInt(r.dailyCost) || 0
  const usage = calcUsageHours(r.rentalFromDate, r.rentalFromTime, r.rentalToDate, r.rentalToTime)

  // 롯데 기준 요금 계산
  const lotteDaily = lotteRate?.daily24h || 0
  const discountedDaily = Math.round(lotteDaily * (1 - discountRate / 100))
  const usageDays = usage ? Math.ceil(usage.hours / 24) : (parseInt(r.rentalDays) || 0)
  const lotteTotal = discountedDaily * usageDays
  const registeredTotal = parseInt(r.totalCost) || (daily * usageDays)

  return (
    <div className="space-y-4">
      {/* 차종 & 매칭 정보 */}
      <Card title="🚗 대차 차종" headerColor="bg-slate-50 border-slate-200 text-slate-700">
        <div className="grid grid-cols-2 gap-4">
          <F label="차량번호" val={r.rentalCarNo || '미배정'} hl />
          <F label="차종" val={r.rentalCarModel || '-'} />
          <F label="대차유형" val={type ? type.label : '-'} />
          <F label="차량등급" val={lotteRate ? `${lotteRate.group} (${lotteRate.models[0]}급)` : '미분류'} hl />
        </div>
      </Card>

      {/* 실시간 사용기간 */}
      <Card title="⏱️ 사용기간 (실시간)" headerColor="bg-blue-50 border-blue-100 text-blue-700">
        <div className="grid grid-cols-2 gap-4 mb-3">
          <F label="시작" val={fDT(r.rentalFromDate, r.rentalFromTime)} />
          <F label="종료(예정)" val={fDT(r.rentalToDate, r.rentalToTime)} />
        </div>
        {usage && (
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-4 text-white">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-2xl font-bold">{usage.days}</div>
                <div className="text-[10px] opacity-70">일</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{Math.floor(usage.remainHours)}</div>
                <div className="text-[10px] opacity-70">시간</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{Math.round((usage.remainHours % 1) * 60)}</div>
                <div className="text-[10px] opacity-70">분</div>
              </div>
            </div>
            <div className="text-center mt-2 text-xs opacity-80">
              총 {usage.hours.toFixed(1)}시간 = <b>{usageDays}일</b> 기준 청구
            </div>
            {(r.rentalStatus === 'U' || r.rentalStatus === 'D') && (
              <div className="text-center mt-1 text-[10px] opacity-60 animate-pulse">실시간 갱신 중...</div>
            )}
          </div>
        )}
      </Card>

      {/* 롯데렌터카 기준 요금 */}
      <Card title="💰 롯데렌터카 기준 요금" headerColor="bg-amber-50 border-amber-100 text-amber-700">
        {lotteRate ? (
          <>
            {/* 할인율 슬라이더 */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-600">할인율 조정</span>
                <span className="text-sm font-bold text-amber-600">{discountRate}% 할인</span>
              </div>
              <input type="range" min={0} max={60} step={5} value={discountRate}
                onChange={e => setDiscountRate(parseInt(e.target.value))}
                className="w-full h-2 bg-amber-100 rounded-lg appearance-none cursor-pointer accent-amber-500" />
              <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                <span>0%</span>
                <span>15%</span>
                <span>30%</span>
                <span>45%</span>
                <span>60%</span>
              </div>
            </div>

            {/* 요금 비교 테이블 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-slate-500">롯데 정가 (24h)</span>
                <span className="text-slate-700">{lotteDaily.toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between text-sm bg-amber-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1">
                  <span className="text-amber-700 font-medium">할인 적용가 (24h)</span>
                  <span className="text-[9px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">-{discountRate}%</span>
                </div>
                <span className="text-amber-700 font-bold">{discountedDaily.toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-slate-500">사용일수</span>
                <span className="font-medium">{usageDays}일</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
                <span className="font-bold text-slate-700">롯데 기준 예상 청구액</span>
                <span className="font-bold text-xl text-blue-600">{lotteTotal.toLocaleString()}원</span>
              </div>
            </div>

            {/* DB 등록가 vs 롯데 기준 비교 */}
            {registeredTotal > 0 && (
              <div className="mt-4 bg-blue-50 rounded-lg p-3">
                <div className="text-xs font-medium text-blue-700 mb-2">📊 등록가 vs 롯데 기준 비교</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">시스템 등록가</span>
                  <span className="font-bold">{registeredTotal.toLocaleString()}원</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-slate-600">롯데 기준</span>
                  <span className="font-bold">{lotteTotal.toLocaleString()}원</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1 border-t border-blue-200 pt-1">
                  <span className="text-slate-600">차액</span>
                  <span className={`font-bold ${registeredTotal - lotteTotal > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {registeredTotal - lotteTotal > 0 ? '+' : ''}{(registeredTotal - lotteTotal).toLocaleString()}원
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-4 text-slate-400">
            <p className="text-sm">차종 "{r.rentalCarModel || '-'}" 매칭 불가</p>
            <p className="text-xs mt-1">시스템에 등록된 차종과 롯데 기준표가 매칭되지 않습니다</p>
          </div>
        )}
      </Card>

      {/* 청구 비용 종합 */}
      <Card title="📋 비용 종합" headerColor="bg-green-50 border-green-100 text-green-700">
        <div className="grid grid-cols-2 gap-4 mb-3">
          <F label="청구대상" val={
            r.rentalType === 'M' ? '무상 (렌트포함)' :
            r.rentalType === 'P' ? '고객 부담' :
            r.rentalType === 'V' ? '상대 보험사' : '-'
          } hl />
          <F label="등록 일 단가" val={daily > 0 ? `${daily.toLocaleString()}원` : '-'} />
        </div>
        <div className="bg-slate-50 rounded-lg p-4 space-y-2">
          {[
            { label: '대차 임차료', calc: `${(discountedDaily || daily).toLocaleString()}원 × ${usageDays}일`, val: lotteRate ? lotteTotal : registeredTotal },
            { label: '탁송비', calc: '-', val: 0 },
            { label: '유류비 차액', calc: '-', val: 0 },
            { label: '차량 파손', calc: '-', val: 0 },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-600">{item.label}</span>
                <span className="text-[10px] text-slate-400">{item.calc}</span>
              </div>
              <span className="font-medium">{item.val > 0 ? `${item.val.toLocaleString()}원` : '-'}</span>
            </div>
          ))}
          <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
            <span className="font-bold text-slate-700">총 청구 예상액</span>
            <span className="font-bold text-xl text-green-600">
              {(lotteRate ? lotteTotal : registeredTotal) > 0 ? `${(lotteRate ? lotteTotal : registeredTotal).toLocaleString()}원` : '-'}
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ============================================
// Shared
// ============================================
function Card({ title, headerColor, children }: { title: string; headerColor?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className={`px-4 py-3 border-b ${headerColor || 'bg-slate-50 border-slate-200 text-slate-700'}`}>
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function F({ label, val, hl, href }: { label: string; val: string; hl?: boolean; href?: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-400 font-medium mb-0.5">{label}</div>
      <div className="text-sm text-slate-700">
        {href ? <a href={href} className="text-blue-600 hover:underline">{val}</a> : <span className={hl ? 'font-bold text-blue-600' : ''}>{val}</span>}
      </div>
    </div>
  )
}
