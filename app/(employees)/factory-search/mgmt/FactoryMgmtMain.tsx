'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCodeMaster } from '../_hooks/useCodeMaster'
import { Cell, KpiCard, KpiRow, PageHeader, ScreenWrap, Spinner, Toolbar } from '../_components/ui'
import SubNav from '../_components/SubNav'
import { fPhone } from '../_lib/format'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Factory = Record<string, any>

export default function FactoryMgmtMain() {
  const { decode } = useCodeMaster()
  const [factories, setFactories] = useState<Factory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [expandedCode, setExpandedCode] = useState<string | null>(null)
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })

  const load = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(pg), limit: '100' })
      if (search) p.set('search', search)
      if (selectedType) p.set('factType', selectedType)
      const res = await fetch(`/factory-search/api/factories?${p}`)
      const json = await res.json()
      if (json.success) {
        setFactories(json.data || [])
        setPagination(json.pagination || { page: pg, total: 0, totalPages: 0 })
      }
    } finally {
      setLoading(false)
    }
  }, [search, selectedType])

  useEffect(() => { load() }, [load])

  const stats = useMemo(() => ({
    전체: pagination.total,
    작업있음: factories.filter(f => (f.orderCount || 0) > 0).length,
  }), [factories, pagination.total])

  return (
    <ScreenWrap>
      <PageHeader
        breadcrumb={['Employee of Ride Inc.', '협력공장 목록']}
        title="협력공장 목록"
        emoji="🔧"
      />
      <SubNav />

      <KpiRow>
        <KpiCard label="전체 업체" value={stats.전체} tone="emerald" icon="🔧" />
        <KpiCard label="작업중" value={stats.작업있음} tone="violet" icon="⚙️" />
      </KpiRow>

      <Toolbar>
        <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
          className="px-3 py-2.5 text-[13px] bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/30 min-w-[180px]">
          <option value="">전체 유형</option>
          {['A','B','C','D','E','F','G','H','I','J','K','L','M','N'].map(t => (
            <option key={t} value={t}>{t} - {decode('FACTTYPE', t)}</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[280px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="공장명, 코드, 연락처, 주소 검색..."
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-400" />
        </div>
        <button onClick={() => load()} className="px-5 py-2.5 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700">조회</button>
      </Toolbar>

      <div className="px-6 pb-6">
        {loading ? (
          <Spinner label="공장 목록 불러오는 중..." />
        ) : factories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400">
            <span className="text-sm">검색 결과가 없습니다</span>
          </div>
        ) : (
          <div className="bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden">
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
                  <div onClick={() => setExpandedCode(isExpanded ? null : f.factcode)}
                    className={`px-5 py-3 grid grid-cols-12 gap-2 items-center cursor-pointer border-b border-slate-100 transition-all text-[13px]
                      ${isExpanded ? 'bg-blue-50 border-l-[3px] border-l-blue-600' : 'hover:bg-slate-50 border-l-[3px] border-l-transparent'}`}>
                    <span className="col-span-2 font-bold text-slate-800 truncate">{f.factname || '-'}</span>
                    <span className="col-span-1 font-mono text-[11px] text-slate-500">{f.factcode}</span>
                    <span className="col-span-2">
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 ring-1 ring-amber-200">{decode('FACTTYPE', f.facttype)}</span>
                    </span>
                    <span className="col-span-2 text-blue-700">{fPhone(f.facthpno) || fPhone(f.facttelo) || '-'}</span>
                    <span className="col-span-1 text-slate-600">{f.factusnm || '-'}</span>
                    <span className="col-span-3 text-slate-500 truncate text-[12px]">{f.factaddr || '-'}</span>
                    <span className="col-span-1 text-center">
                      {(f.orderCount || 0) > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 bg-red-50 text-red-700 ring-1 ring-red-200 text-[10px] font-bold rounded-full">{f.orderCount}</span>
                      ) : <span className="text-slate-300">-</span>}
                    </span>
                  </div>
                  {isExpanded && (
                    <div className="bg-slate-50/50 border-b border-slate-200 p-5 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
                      <Cell label="사업자번호">{f.factregi || '-'}</Cell>
                      <Cell label="휴대전화">{fPhone(f.facthpno) || '-'}</Cell>
                      <Cell label="유선전화">{fPhone(f.facttelo) || '-'}</Cell>
                      <Cell label="팩스">{fPhone(f.factfaxo) || '-'}</Cell>
                      <Cell label="은행">{f.factbknm || '-'}</Cell>
                      <Cell label="계좌">{f.factbkno || '-'}</Cell>
                      <Cell label="예금주">{f.factbkus || '-'}</Cell>
                      <Cell label="좌표">{typeof f.lat === 'number' ? `${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}` : '미등록'}</Cell>
                    </div>
                  )}
                </div>
              )
            })}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-2.5 text-[11px] text-slate-500 flex justify-between items-center">
              <span>총 <b className="text-slate-700">{pagination.total.toLocaleString()}</b>개 업체</span>
              <div className="flex gap-1">
                {pagination.page > 1 && <button onClick={() => load(pagination.page - 1)} className="px-3 py-1 bg-white border border-slate-200 rounded hover:bg-slate-100">이전</button>}
                <span className="px-3 py-1 bg-slate-900 text-white rounded font-bold">{pagination.page}</span>
                <span className="px-2 py-1 text-slate-400">/ {pagination.totalPages}</span>
                {pagination.page < pagination.totalPages && <button onClick={() => load(pagination.page + 1)} className="px-3 py-1 bg-white border border-slate-200 rounded hover:bg-slate-100">다음</button>}
              </div>
            </div>
          </div>
        )}
      </div>
    </ScreenWrap>
  )
}
