'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useCodeMaster } from '../../hooks/useCodeMaster'

type Vehicle = Record<string, any>
type Customer = { custCode: string; custName: string; carCount: number }
type Accident = Record<string, any>

// 차량상태 뱃지 색상 (UI 전용)
const STATUS_COLORS: Record<string, string> = {
  R: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  H: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  L: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
}
const STATUS_DOTS: Record<string, string> = { R: 'bg-emerald-500', H: 'bg-red-500', L: 'bg-slate-400' }

const fD = (d?: string) => { if (!d || d.length < 8) return '-'; return `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}` }
const fT = (t?: string) => { if (!t || t.length < 4) return ''; return `${t.slice(0,2)}:${t.slice(2,4)}` }

function StatusBadge({ status, decode }: { status: string; decode: (g: string, c: string) => string }) {
  const color = STATUS_COLORS[status] || 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
  const dot = STATUS_DOTS[status] || 'bg-slate-400'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {decode('CARSSTAT', status)}
    </span>
  )
}

function Cell({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-slate-400 mb-0.5 tracking-wide">{label}</div>
      <div className="text-[13px] text-slate-800 font-medium min-h-[18px]">{children || <span className="text-slate-300">-</span>}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// Vehicle Detail Panel
// ═══════════════════════════════════════════════
function VehicleDetail({ v, historyData, accidents, loading, decode }: {
  v: Vehicle; historyData: Vehicle[]; accidents: Accident[]; loading: boolean; decode: (g: string, c: string) => string
}) {
  return (
    <div className="bg-gradient-to-b from-slate-50 to-white border-x border-b border-slate-200 rounded-b-xl">
      {/* 요약 배너 */}
      <div className="px-5 py-3 bg-slate-800 text-white flex items-center gap-6 text-xs flex-wrap">
        <div><span className="text-slate-400">차량번호</span> <span className="font-bold text-cyan-300 text-sm ml-1">{v.carPlateNo}</span></div>
        <div><span className="text-slate-400">차량코드</span> <span className="font-mono ml-1">{v.carIdno}</span></div>
        <div><span className="text-slate-400">차량명</span> <span className="ml-1">{v.carModelName}</span></div>
        <div><span className="text-slate-400">거래처</span> <span className="font-bold ml-1">{v.custName}</span></div>
        <div className="ml-auto"><StatusBadge status={v.carStatus} decode={decode} /></div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
          <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
          불러오는 중...
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {/* 차량 기본정보 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-blue-500 rounded-full" />
              <span className="text-[13px] font-bold text-slate-700">차량 / 계약 정보</span>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
              {/* 기본 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
                <Cell label="차량번호"><span className="text-blue-700 font-bold text-[15px]">{v.carPlateNo}</span></Cell>
                <Cell label="차량명">{v.carModelName}</Cell>
                <Cell label="이용상태"><StatusBadge status={v.carStatus} decode={decode} /></Cell>
                <Cell label="서비스유형"><span className={`px-2 py-0.5 rounded text-xs font-bold ${v.carType === 'T' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{decode('CARSTYPE', v.carType)}</span></Cell>
                <Cell label="차대번호">{v.carVin || '-'}</Cell>
                <Cell label="차량등록일">{fD(v.carRegDate)}</Cell>
                <Cell label="주행거리">{v.carMileage ? `${Number(v.carMileage).toLocaleString()}km` : '-'}</Cell>
                <Cell label="서비스상품">{v.carServiceType || '-'}</Cell>
              </div>
              {/* 계약/소유자 */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
                <Cell label="계약자/소유자"><span className="font-bold">{v.carOwner}</span></Cell>
                <Cell label="거래처"><span className="font-bold">{v.custName}</span></Cell>
                <Cell label="연락처"><span className="text-blue-700">{v.carContactPhone || v.custPhone || '-'}</span></Cell>
                <Cell label="담당자">{v.carContactName || '-'}</Cell>
                <Cell label="주소" >{v.carAddress || v.custAddr || '-'}</Cell>
                <Cell label="계약번호">{v.carContractNo || '-'}</Cell>
                <Cell label="계약기간(월)">{v.carContractMonths ? `${v.carContractMonths}개월` : '-'}</Cell>
                <Cell label="약정거리">{v.carContractKm ? `${Number(v.carContractKm).toLocaleString()}km` : '-'}</Cell>
                <Cell label="계약기간">{v.carContractFrom ? `${fD(v.carContractFrom)} ~ ${fD(v.carContractTo)}` : '-'}</Cell>
                <Cell label="이용기간">{v.carFromDate ? `${fD(v.carFromDate)} ~ ${fD(v.carToDate)}` : '-'}</Cell>
              </div>
              {/* 계약사항 체크 */}
              <div className="pt-3 border-t border-slate-100">
                <div className="text-[10px] text-slate-400 mb-2">계약사항</div>
                <div className="flex gap-3">
                  {[
                    { key: 'chkInspection', label: '정기점검' },
                    { key: 'chkAccident', label: '사고처리' },
                    { key: 'chkRental', label: '대차가능' },
                    { key: 'chkLegal', label: '법정검사' },
                  ].map(({ key, label }) => (
                    <div key={key} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs
                      ${v[key] === 'Y' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {v[key] === 'Y' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                      {label}
                    </div>
                  ))}
                </div>
              </div>
              {/* 보험 */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
                <Cell label="보험사"><span className="font-bold">{decode('BHNAME', v.carInsCode)}</span></Cell>
                <Cell label="보험가입일">{fD(v.carInsFrom)}</Cell>
                <Cell label="보험만료일">{fD(v.carInsTo)}</Cell>
                <Cell label="긴급출동">{v.carEmergency === 'Y' ? '유' : '무'}</Cell>
                <Cell label="연령한정">{v.carAgeLimit ? `${v.carAgeLimit}세` : '-'}</Cell>
                <Cell label="대인">{v.carInsDi || '-'}</Cell>
                <Cell label="대물">{v.carInsDm || '-'}</Cell>
                <Cell label="자손">{v.carInsJs || '-'}</Cell>
                <Cell label="자부담구분">{decode('BHJAGB', v.carInsGn)}</Cell>
                <Cell label="면책금(최소)">{v.carDeductMin ? `${Number(v.carDeductMin).toLocaleString()}원` : '-'}</Cell>
                <Cell label="면책금(최대)">{v.carDeductMax ? `${Number(v.carDeductMax).toLocaleString()}원` : '-'}</Cell>
                <Cell label="자기부담율">{v.carInsFC ? `${v.carInsFC}%` : '-'}</Cell>
                <Cell label="자차수리부담">{decode('BHJACHA', v.carInsClass)}</Cell>
              </div>
              {v.carInsEtc && (
                <div className="pt-2 grid grid-cols-1 gap-y-2">
                  <Cell label="기타특약"><span className="text-slate-700">{v.carInsEtc}</span></Cell>
                </div>
              )}
              {/* 금액 */}
              {(v.amtMaintenance || v.amtAccident || v.amtExam) && (
                <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-x-6 gap-y-4">
                  <Cell label="정비비">{v.amtMaintenance ? `${Number(v.amtMaintenance).toLocaleString()}원` : '-'}</Cell>
                  <Cell label="사고총당금">{v.amtAccident ? `${Number(v.amtAccident).toLocaleString()}원` : '-'}</Cell>
                  <Cell label="검사비">{v.amtExam ? `${Number(v.amtExam).toLocaleString()}원` : '-'}</Cell>
                </div>
              )}
            </div>
          </div>

          {/* 히스토리 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-purple-500 rounded-full" />
              <span className="text-[13px] font-bold text-slate-700">차량 히스토리</span>
              <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">{historyData.length}</span>
            </div>
            {historyData.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">히스토리 없음</div>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b px-4 py-2 grid grid-cols-6 gap-2 text-[10px] font-semibold text-slate-500 uppercase">
                  <span>시작일</span><span>종료일</span><span>상태</span><span>차량명</span><span>서비스형태</span><span>수정일</span>
                </div>
                {historyData.map((h, i) => (
                  <div key={i} className={`px-4 py-2 grid grid-cols-6 gap-2 text-xs border-b border-slate-100 ${i === 0 ? 'bg-blue-50' : ''}`}>
                    <span className="font-medium">{fD(h.carFromDate)}</span>
                    <span>{fD(h.carToDate)}</span>
                    <span><StatusBadge status={h.carStatus} decode={decode} /></span>
                    <span className="truncate">{h.carModelName}</span>
                    <span>{decode('CARSTYPE', h.carType)}</span>
                    <span className="text-slate-400">{fD(h.carFromDate)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 사고이력 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-red-500 rounded-full" />
              <span className="text-[13px] font-bold text-slate-700">사고 이력</span>
              <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">{accidents.length}</span>
            </div>
            {accidents.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">사고 이력 없음</div>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b px-4 py-2 grid grid-cols-7 gap-2 text-[10px] font-semibold text-slate-500 uppercase">
                  <span>상태</span><span>접수일</span><span>사고번호</span><span>구분</span><span>과실</span><span>장소</span><span>운전자</span>
                </div>
                {accidents.map((a, i) => (
                  <div key={i} className="px-4 py-2 grid grid-cols-7 gap-2 text-xs border-b border-slate-100 hover:bg-slate-50">
                    <span><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${a.status === '1' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{decode('OTPTSTAT', a.status)}</span></span>
                    <span>{fD(a.createdDate)} {fT(a.createdTime)}</span>
                    <span className="font-mono text-[11px]">{a.accidentNo}</span>
                    <span>{decode('OTPTACBN', a.accidentType)}</span>
                    <span className={`font-bold ${parseInt(a.faultRate) >= 100 ? 'text-red-600' : 'text-slate-600'}`}>{a.faultRate ? `${a.faultRate}%` : '-'}</span>
                    <span className="truncate">{a.accidentLocation}</span>
                    <span>{a.driverName}</span>
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

// ═══════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════
export default function VehicleLookupMain() {
  const { user } = useApp()
  const { decode } = useCodeMaster()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCust, setSelectedCust] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [historyData, setHistoryData] = useState<Vehicle[]>([])
  const [accidents, setAccidents] = useState<Accident[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })

  const load = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(pg), limit: '100' })
      if (search) p.set('search', search)
      if (selectedCust) p.set('custCode', selectedCust)
      if (selectedStatus) p.set('status', selectedStatus)
      const res = await fetch(`/api/cafe24/vehicles?${p}`)
      const json = await res.json()
      if (json.success) {
        setVehicles(json.data || [])
        setCustomers(json.customers || [])
        setPagination(json.pagination || { page: pg, total: 0, totalPages: 0 })
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [search, selectedCust, selectedStatus])

  useEffect(() => { load() }, [load])

  const loadHistory = useCallback(async (carId: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/cafe24/vehicles?history=true&carId=${carId}`)
      const json = await res.json()
      if (json.success) {
        setHistoryData(json.data || [])
        setAccidents(json.accidents || [])
      }
    } catch { /* */ }
    finally { setDetailLoading(false) }
  }, [])

  const handleExpand = (v: Vehicle) => {
    const id = v.carIdno
    if (expandedId === id) { setExpandedId(null) }
    else { setExpandedId(id); loadHistory(id) }
  }

  const stats = useMemo(() => ({
    전체: pagination.total,
    이용중: vehicles.filter(v => v.carStatus === 'R').length,
    해지: vehicles.filter(v => v.carStatus === 'H').length,
    반납: vehicles.filter(v => v.carStatus === 'L').length,
  }), [vehicles, pagination.total])

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 px-6 py-4 flex-shrink-0 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">거래처 차량조회</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">Vehicle Fleet Management</p>
          </div>
          <div className="flex gap-3">
            {[
              { label: '전체 차량', value: stats.전체, color: 'bg-slate-600', icon: 'Σ' },
              { label: '이용중', value: stats.이용중, color: 'bg-emerald-600', icon: '●' },
              { label: '해지', value: stats.해지, color: 'bg-red-600', icon: '×' },
              { label: '반납', value: stats.반납, color: 'bg-slate-500', icon: '↩' },
            ].map(kpi => (
              <div key={kpi.label} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
                <div className={`w-10 h-10 rounded-lg ${kpi.color} flex items-center justify-center text-white text-lg`}>{kpi.icon}</div>
                <div>
                  <div className="text-[22px] font-bold text-slate-900 leading-none">{kpi.value.toLocaleString()}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{kpi.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-6 py-3 flex-shrink-0 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          {/* 거래처 */}
          <select value={selectedCust} onChange={e => setSelectedCust(e.target.value)}
            className="px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/30 min-w-[180px]">
            <option value="">전체 거래처</option>
            {customers.map(c => (
              <option key={c.custCode} value={c.custCode}>{c.custName} ({c.carCount})</option>
            ))}
          </select>
          {/* 상태 */}
          <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
            className="px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/30">
            <option value="">전체 상태</option>
            <option value="R">이용중</option>
            <option value="H">해지</option>
            <option value="L">반납</option>
          </select>
          {/* 검색 */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="차량번호, 차량명, 계약자, 거래처명 검색..."
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400" />
          </div>
          <button onClick={() => load()}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 shadow-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            조회
          </button>
        </div>
      </div>

      {/* Data Grid */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-8 h-8 border-3 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm text-slate-500">차량 목록 불러오는 중...</span>
          </div>
        ) : vehicles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
            <span className="text-sm">검색 결과가 없습니다</span>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Table Header */}
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 grid grid-cols-12 gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <span className="col-span-1">상태</span>
              <span className="col-span-2">차량번호</span>
              <span className="col-span-3">차량명</span>
              <span className="col-span-1">유형</span>
              <span className="col-span-2">거래처</span>
              <span className="col-span-1">계약기간</span>
              <span className="col-span-1 text-center">사고</span>
              <span className="col-span-1 text-center">이력</span>
            </div>

            {vehicles.map((v, idx) => {
              const isExpanded = expandedId === v.carIdno
              return (
                <div key={v.carIdno + '-' + idx}>
                  <div onClick={() => handleExpand(v)}
                    className={`px-5 py-3 grid grid-cols-12 gap-2 items-center cursor-pointer border-b border-slate-100 transition-all text-[13px]
                      ${isExpanded ? 'bg-blue-50 border-l-[3px] border-l-blue-600' : 'hover:bg-slate-50 border-l-[3px] border-l-transparent'}
                      ${idx % 2 === 0 && !isExpanded ? 'bg-white' : !isExpanded ? 'bg-slate-50/40' : ''}`}>
                    <span className="col-span-1"><StatusBadge status={v.carStatus} decode={decode} /></span>
                    <span className="col-span-2 text-blue-700 font-bold">{v.carPlateNo || '-'}</span>
                    <span className="col-span-3 text-slate-700 truncate">{v.carModelName || '-'}</span>
                    <span className="col-span-1">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${v.carType === 'T' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {decode('CARSTYPE', v.carType)}
                      </span>
                    </span>
                    <span className="col-span-2 text-slate-600 truncate">{v.custName || v.carOwner || '-'}</span>
                    <span className="col-span-1 text-[11px] text-slate-500">{fD(v.carContractFrom)}</span>
                    <span className="col-span-1 text-center">
                      {v.accidentCount > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full">{v.accidentCount}</span>
                      ) : <span className="text-slate-300">-</span>}
                    </span>
                    <span className="col-span-1 text-center">
                      {v.historyCount > 1 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full">{v.historyCount}</span>
                      ) : <span className="text-slate-300">1</span>}
                    </span>
                  </div>
                  {isExpanded && <VehicleDetail v={v} historyData={historyData} accidents={accidents} loading={detailLoading} decode={decode} />}
                </div>
              )
            })}

            {/* Footer + Pagination */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-2.5 text-[11px] text-slate-500 flex justify-between items-center">
              <span>총 <b className="text-slate-700">{pagination.total.toLocaleString()}</b>대</span>
              <div className="flex gap-1">
                {pagination.page > 1 && (
                  <button onClick={() => load(pagination.page - 1)} className="px-3 py-1 bg-white border border-slate-200 rounded hover:bg-slate-100">이전</button>
                )}
                <span className="px-3 py-1 bg-blue-600 text-white rounded font-bold">{pagination.page}</span>
                <span className="px-2 py-1 text-slate-400">/ {pagination.totalPages}</span>
                {pagination.page < pagination.totalPages && (
                  <button onClick={() => load(pagination.page + 1)} className="px-3 py-1 bg-white border border-slate-200 rounded hover:bg-slate-100">다음</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
