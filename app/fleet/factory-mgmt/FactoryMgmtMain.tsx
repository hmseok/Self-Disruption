'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useCodeMaster } from '../../hooks/useCodeMaster'

type Factory = Record<string, any>
type Order = Record<string, any>

const fD = (d?: string) => { if (!d || d.length < 8) return '-'; return `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}` }
const fT = (t?: string) => { if (!t || t.length < 4) return ''; return `${t.slice(0,2)}:${t.slice(2,4)}` }

function Cell({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-slate-400 mb-0.5 tracking-wide">{label}</div>
      <div className="text-[13px] text-slate-800 font-medium min-h-[18px]">{children || <span className="text-slate-300">-</span>}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// Factory Detail
// ═══════════════════════════════════════════════
function FactoryDetail({ f, orders, loading, decode }: { f: Factory; orders: Order[]; loading: boolean; decode: (g:string,c:string)=>string }) {
  return (
    <div className="bg-gradient-to-b from-slate-50 to-white border-x border-b border-slate-200 rounded-b-xl">
      <div className="px-5 py-3 bg-slate-800 text-white flex items-center gap-6 text-xs flex-wrap">
        <div><span className="text-slate-400">공장명</span> <span className="font-bold text-cyan-300 text-sm ml-1">{f.factname}</span></div>
        <div><span className="text-slate-400">코드</span> <span className="font-mono ml-1">{f.factcode}</span></div>
        <div><span className="text-slate-400">유형</span> <span className="ml-1">{decode('FACTTYPE', f.facttype)}</span></div>
        <div><span className="text-slate-400">작업</span> <span className="font-bold text-amber-300 ml-1">{f.orderCount}건</span></div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
          <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
          불러오는 중...
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {/* 공장 기본정보 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-yellow-500 rounded-full" />
              <span className="text-[13px] font-bold text-slate-700">공장 정보</span>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
              <Cell label="공장명"><span className="font-bold text-blue-700">{f.factname}</span></Cell>
              <Cell label="공장코드">{f.factcode}</Cell>
              <Cell label="유형">{decode('FACTTYPE', f.facttype)}</Cell>
              <Cell label="사업자번호">{f.factregi || '-'}</Cell>
              <Cell label="연락처"><span className="text-blue-700">{f.facthpno || '-'}</span></Cell>
              <Cell label="전화">{f.facttelo || '-'}</Cell>
              <Cell label="팩스">{f.factfaxo || '-'}</Cell>
              <Cell label="담당자">{f.factusnm || '-'}</Cell>
              <Cell label="주소">{f.factaddr || '-'}</Cell>
              <Cell label="은행">{f.factbknm || '-'}</Cell>
              <Cell label="계좌">{f.factbkno || '-'}</Cell>
              <Cell label="예금주">{f.factbkus || '-'}</Cell>
            </div>
          </div>

          {/* 작업이력 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-red-500 rounded-full" />
              <span className="text-[13px] font-bold text-slate-700">배정 작업 이력</span>
              <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">{orders.length}</span>
            </div>
            {orders.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-lg">작업 이력 없음</div>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b px-4 py-2 grid grid-cols-8 gap-2 text-[10px] font-semibold text-slate-500 uppercase">
                  <span>상태</span><span>배정일</span><span>사고번호</span><span>차량번호</span><span>차량명</span><span>구분</span><span>과실</span><span>운전자</span>
                </div>
                {orders.map((o, i) => (
                  <div key={i} className="px-4 py-2 grid grid-cols-8 gap-2 text-xs border-b border-slate-100 hover:bg-slate-50">
                    <span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${o.orderStatus === 'C' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {o.orderStatus === 'C' ? '완료' : o.orderStatus || '진행'}
                      </span>
                    </span>
                    <span>{fD(o.orderDate)} {fT(o.orderTime)}</span>
                    <span className="font-mono text-[11px]">{o.accidentNo || '-'}</span>
                    <span className="text-blue-700 font-bold">{o.carPlateNo || '-'}</span>
                    <span className="truncate">{o.carModelName || '-'}</span>
                    <span>{decode('OTPTACBN', o.accidentType)}</span>
                    <span className={`font-bold ${parseInt(o.faultRate) >= 100 ? 'text-red-600' : 'text-slate-600'}`}>{o.faultRate ? `${o.faultRate}%` : '-'}</span>
                    <span>{o.driverName || '-'}</span>
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
export default function FactoryMgmtMain() {
  const { user } = useApp()
  const { decode } = useCodeMaster()
  const [factories, setFactories] = useState<Factory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [expandedCode, setExpandedCode] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<Factory | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })

  const load = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(pg), limit: '100' })
      if (search) p.set('search', search)
      if (selectedType) p.set('factType', selectedType)
      const res = await fetch(`/api/cafe24/factories?${p}`)
      const json = await res.json()
      if (json.success) { setFactories(json.data || []); setPagination(json.pagination || { page: pg, total: 0, totalPages: 0 }) }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [search, selectedType])

  useEffect(() => { load() }, [load])

  const loadDetail = useCallback(async (factCode: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/cafe24/factories?detail=true&factCode=${factCode}`)
      const json = await res.json()
      if (json.success) { setDetailData(json.data); setOrders(json.orders || []) }
    } catch { /* */ }
    finally { setDetailLoading(false) }
  }, [])

  const handleExpand = (f: Factory) => {
    if (expandedCode === f.factcode) { setExpandedCode(null) }
    else { setExpandedCode(f.factcode); loadDetail(f.factcode) }
  }

  const stats = useMemo(() => ({
    전체: pagination.total,
    작업있음: factories.filter(f => f.orderCount > 0).length,
  }), [factories, pagination.total])

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 px-6 py-4 flex-shrink-0 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">공장/협력업체 관리</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">Factory & Partner Management</p>
          </div>
          <div className="flex gap-3">
            <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-yellow-600 flex items-center justify-center text-white text-lg">🔧</div>
              <div>
                <div className="text-[22px] font-bold text-slate-900 leading-none">{stats.전체.toLocaleString()}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">전체 업체</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="px-6 py-3 flex-shrink-0 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
            className="px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/30 min-w-[160px]">
            <option value="">전체 유형</option>
            {['A','B','C','D','E','F','G','H','I','J','K','L','M','N'].map(t => (
              <option key={t} value={t}>{t} - {decode('FACTTYPE', t)}</option>
            ))}
          </select>
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="공장명, 코드, 연락처, 주소 검색..."
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400" />
          </div>
          <button onClick={() => load()} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 shadow-sm">조회</button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-8 h-8 border-3 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm text-slate-500">공장 목록 불러오는 중...</span>
          </div>
        ) : factories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400">
            <span className="text-sm">검색 결과가 없습니다</span>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 grid grid-cols-12 gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <span className="col-span-2">공장명</span>
              <span className="col-span-1">코드</span>
              <span className="col-span-2">유형</span>
              <span className="col-span-2">연락처</span>
              <span className="col-span-1">담당자</span>
              <span className="col-span-3">주소</span>
              <span className="col-span-1 text-center">작업</span>
            </div>

            {factories.map((f, idx) => {
              const isExpanded = expandedCode === f.factcode
              return (
                <div key={f.factcode + '-' + idx}>
                  <div onClick={() => handleExpand(f)}
                    className={`px-5 py-3 grid grid-cols-12 gap-2 items-center cursor-pointer border-b border-slate-100 transition-all text-[13px]
                      ${isExpanded ? 'bg-blue-50 border-l-[3px] border-l-blue-600' : 'hover:bg-slate-50 border-l-[3px] border-l-transparent'}
                      ${idx % 2 === 0 && !isExpanded ? 'bg-white' : !isExpanded ? 'bg-slate-50/40' : ''}`}>
                    <span className="col-span-2 font-bold text-slate-800 truncate">{f.factname || '-'}</span>
                    <span className="col-span-1 font-mono text-[11px] text-slate-500">{f.factcode}</span>
                    <span className="col-span-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-700">{decode('FACTTYPE', f.facttype)}</span>
                    </span>
                    <span className="col-span-2 text-blue-700">{f.facthpno || f.facttelo || '-'}</span>
                    <span className="col-span-1 text-slate-600">{f.factusnm || '-'}</span>
                    <span className="col-span-3 text-slate-500 truncate text-[12px]">{f.factaddr || '-'}</span>
                    <span className="col-span-1 text-center">
                      {f.orderCount > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full">{f.orderCount}</span>
                      ) : <span className="text-slate-300">-</span>}
                    </span>
                  </div>
                  {isExpanded && <FactoryDetail f={{...f, ...detailData}} orders={orders} loading={detailLoading} decode={decode} />}
                </div>
              )
            })}

            <div className="bg-slate-50 border-t border-slate-200 px-5 py-2.5 text-[11px] text-slate-500 flex justify-between items-center">
              <span>총 <b className="text-slate-700">{pagination.total.toLocaleString()}</b>개 업체</span>
              <div className="flex gap-1">
                {pagination.page > 1 && <button onClick={() => load(pagination.page - 1)} className="px-3 py-1 bg-white border border-slate-200 rounded hover:bg-slate-100">이전</button>}
                <span className="px-3 py-1 bg-blue-600 text-white rounded font-bold">{pagination.page}</span>
                <span className="px-2 py-1 text-slate-400">/ {pagination.totalPages}</span>
                {pagination.page < pagination.totalPages && <button onClick={() => load(pagination.page + 1)} className="px-3 py-1 bg-white border border-slate-200 rounded hover:bg-slate-100">다음</button>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
