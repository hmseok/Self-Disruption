'use client'

import { supabase } from '../../utils/supabase'
import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../../context/AppContext'

// ── 분류 카테고리 옵션 ──
const CATEGORIES = [
  { group: '매출', items: ['렌트/운송수입', '지입 관리비/수수료', '투자원금 입금', '지입 초기비용/보증금', '대출 실행(입금)', '이자/잡이익', '보험금 수령'] },
  { group: '차량', items: ['유류비', '정비/수리비', '차량보험료', '자동차세/공과금', '차량할부/리스료'] },
  { group: '금융', items: ['이자비용(대출/투자)', '원금상환', '지입 수익배분금(출금)'] },
  { group: '인건비', items: ['급여(정규직)', '용역비(3.3%)', '4대보험(회사부담)'] },
  { group: '관리비', items: ['복리후생(식대)', '접대비', '임차료/사무실', '통신/소모품'] },
  { group: '세금', items: ['세금/공과금'] },
]

const ALL_CATEGORIES = CATEGORIES.flatMap(g => g.items)

// ── 연결 유형 라벨 ──
const TYPE_LABELS: Record<string, string> = {
  jiip: '지입',
  invest: '투자',
  loan: '대출',
  salary: '급여',
  freelancer: '프리랜서',
  insurance: '보험',
  car: '차량',
}

const TYPE_COLORS: Record<string, string> = {
  jiip: 'bg-slate-100 text-slate-700',
  invest: 'bg-blue-50 text-blue-600',
  loan: 'bg-amber-50 text-amber-700',
  salary: 'bg-emerald-50 text-emerald-600',
  freelancer: 'bg-violet-50 text-violet-600',
  insurance: 'bg-cyan-50 text-cyan-700',
  car: 'bg-orange-50 text-orange-600',
}

const nf = (n: number) => n ? Math.abs(n).toLocaleString() : '0'

const FILTER_TABS = [
  { key: 'pending' as const, label: '대기중', icon: '⏳' },
  { key: 'confirmed' as const, label: '확정됨', icon: '✓' },
  { key: 'all' as const, label: '전체', icon: '◎' },
]

export default function ClassificationReviewPage() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const companyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'confirmed' | 'all'>('pending')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategory, setBulkCategory] = useState('')
  const [stats, setStats] = useState({ pending: 0, confirmed: 0 })

  // 연결 대상 조회용
  const [jiips, setJiips] = useState<any[]>([])
  const [investors, setInvestors] = useState<any[]>([])
  const [freelancers, setFreelancers] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])

  const fetchItems = useCallback(async () => {
    if (!companyId) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/finance/classify?company_id=${companyId}&status=${filter}&limit=100`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
        setTotal(data.total || 0)
      }

      const [pRes, cRes] = await Promise.all([
        fetch(`/api/finance/classify?company_id=${companyId}&status=pending&limit=1`),
        fetch(`/api/finance/classify?company_id=${companyId}&status=confirmed&limit=1`),
      ])
      const pData = await pRes.json()
      const cData = await cRes.json()
      setStats({ pending: pData.total || 0, confirmed: cData.total || 0 })
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [companyId, filter])

  const fetchRelated = useCallback(async () => {
    if (!companyId) return
    const [j, i, f, e] = await Promise.all([
      supabase.from('jiip_contracts').select('id, investor_name, contractor_name').eq('company_id', companyId),
      supabase.from('general_investments').select('id, investor_name').eq('company_id', companyId),
      supabase.from('freelancers').select('id, name').eq('company_id', companyId),
      supabase.from('profiles').select('id, name').eq('company_id', companyId),
    ])
    setJiips(j.data || [])
    setInvestors(i.data || [])
    setFreelancers(f.data || [])
    setEmployees(e.data || [])
  }, [companyId])

  useEffect(() => { fetchItems() }, [fetchItems])
  useEffect(() => { fetchRelated() }, [fetchRelated])

  // ── 단건 확정 ──
  const handleConfirm = async (item: any, overrides?: { category?: string; related_type?: string; related_id?: string }) => {
    const category = overrides?.category || item.ai_category || item.final_category
    const related_type = overrides?.related_type || item.ai_related_type
    const related_id = overrides?.related_id || item.ai_related_id

    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          final_category: category,
          final_related_type: related_type,
          final_related_id: related_id,
          save_as_rule: false,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id))
        setStats(prev => ({ pending: prev.pending - 1, confirmed: prev.confirmed + 1 }))
      }
    } catch (e) {
      console.error(e)
    }
  }

  // ── 규칙 저장 + 확정 ──
  const handleConfirmWithRule = async (item: any, category: string) => {
    const keyword = item.source_data?.client_name || ''
    if (!keyword) return handleConfirm(item, { category })

    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          final_category: category,
          final_related_type: item.ai_related_type,
          final_related_id: item.ai_related_id,
          save_as_rule: true,
          rule_keyword: keyword,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id))
        setStats(prev => ({ pending: prev.pending - 1, confirmed: prev.confirmed + 1 }))
      }
    } catch (e) {
      console.error(e)
    }
  }

  // ── 일괄 확정 ──
  const handleBulkConfirm = async () => {
    if (selectedIds.size === 0) return
    const selected = items.filter(i => selectedIds.has(i.id))
    for (const item of selected) {
      await handleConfirm(item, bulkCategory ? { category: bulkCategory } : undefined)
    }
    setSelectedIds(new Set())
    fetchItems()
  }

  // ── 전체 자동 확정 (AI 추천 그대로) ──
  const handleAutoConfirmAll = async () => {
    if (!confirm(`AI 추천 기준으로 ${items.length}건을 일괄 확정하시겠습니까?`)) return
    for (const item of items) {
      await handleConfirm(item)
    }
    fetchItems()
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(i => i.id)))
    }
  }

  const getConfidenceColor = (conf: number) => {
    if (conf >= 80) return 'bg-emerald-50 text-emerald-600'
    if (conf >= 60) return 'bg-amber-50 text-amber-600'
    return 'bg-red-50 text-red-500'
  }

  const getConfidenceBar = (conf: number) => {
    if (conf >= 80) return 'bg-emerald-500'
    if (conf >= 60) return 'bg-amber-400'
    return 'bg-red-400'
  }

  if (!companyId && !loading) {
    return (
      <div className="max-w-6xl mx-auto py-6 px-4 md:py-8 md:px-6 bg-slate-50 min-h-screen pb-32">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">🤖 AI 분류 검토</h1>
            <p className="text-gray-500 text-sm mt-1">AI가 분류한 거래를 검토하고 확정합니다 · 확정 결과는 자동으로 장부에 반영됩니다</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm text-center py-20">
          <p className="text-4xl mb-3">🏢</p>
          <p className="font-semibold text-sm text-slate-500">좌측 상단에서 회사를 먼저 선택해주세요</p>
          <p className="text-xs text-slate-400 mt-1">회사 선택 후 AI 분류 검토를 진행할 수 있습니다</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 md:py-8 md:px-6 bg-slate-50 min-h-screen pb-32">

      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">🤖 AI 분류 검토</h1>
          <p className="text-gray-500 text-sm mt-1">AI가 분류한 거래를 검토하고 확정합니다 · 확정 결과는 자동으로 장부에 반영됩니다</p>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">검토 대기</p>
          <p className="text-xl font-bold text-amber-600">{stats.pending}<span className="text-xs font-normal text-slate-400 ml-0.5">건</span></p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">확정 완료</p>
          <p className="text-xl font-bold text-emerald-600">{stats.confirmed}<span className="text-xs font-normal text-slate-400 ml-0.5">건</span></p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">현재 조회</p>
          <p className="text-xl font-bold text-slate-900">{total}<span className="text-xs font-normal text-slate-400 ml-0.5">건</span></p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">선택됨</p>
          <p className="text-xl font-bold text-slate-900">{selectedIds.size}<span className="text-xs font-normal text-slate-400 ml-0.5">건</span></p>
        </div>
      </div>

      {/* 탭 + 액션 바 */}
      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200/80 shadow-sm">
          {FILTER_TABS.map(tab => (
            <button key={tab.key} onClick={() => { setFilter(tab.key); setSelectedIds(new Set()) }}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                filter === tab.key ? 'bg-steel-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}>
              <span className="text-xs">{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>

        {filter === 'pending' && items.length > 0 && (
          <div className="flex gap-2 items-center ml-auto">
            <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all">
              <option value="">AI 추천 그대로</option>
              {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={handleBulkConfirm} disabled={selectedIds.size === 0}
              className="bg-steel-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-steel-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              선택 확정 ({selectedIds.size})
            </button>
            <button onClick={handleAutoConfirmAll}
              className="bg-steel-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-steel-700 transition-colors">
              전체 AI확정
            </button>
          </div>
        )}
      </div>

      {/* 리스트 */}
      {loading ? (
        <div className="min-h-[300px] flex items-center justify-center">
          <div className="text-center">
            <div className="w-7 h-7 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto" />
            <p className="mt-3 text-sm text-slate-400 font-medium">로딩 중...</p>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <svg className="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <p className="font-semibold text-sm text-slate-500">
            {filter === 'pending' ? '검토 대기 항목이 없습니다' : '조회된 항목이 없습니다'}
          </p>
          <p className="text-xs text-slate-400 mt-1">업로드된 거래가 AI 분류되면 여기에 표시됩니다</p>
        </div>
      ) : (
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          {/* 전체 선택 헤더 */}
          {filter === 'pending' && (
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={selectedIds.size === items.length && items.length > 0}
                  onChange={toggleAll} className="w-4 h-4 rounded border-slate-300 text-steel-600 focus:ring-steel-500" />
                <span className="text-xs font-semibold text-slate-500">전체 선택</span>
              </label>
              <span className="text-[11px] text-slate-400">{items.length}건</span>
            </div>
          )}

          <div className="divide-y divide-slate-50">
            {items.map(item => {
              const src = item.source_data || {}
              const conf = item.ai_confidence || 0
              const isSelected = selectedIds.has(item.id)
              const isConfirmed = item.status === 'confirmed'

              return (
                <div key={item.id}
                  className={`px-6 py-4 transition-colors ${isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/50'} ${isConfirmed ? 'opacity-60' : ''}`}>

                  <div className="flex items-start gap-3">
                    {/* 체크박스 */}
                    {!isConfirmed && (
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)}
                        className="w-4 h-4 rounded border-slate-300 text-steel-600 focus:ring-steel-500 mt-1 flex-none" />
                    )}

                    {/* 메인 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="font-semibold text-slate-900">{src.client_name || '(미상)'}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${src.type === 'income' ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-100' : 'bg-red-50 text-red-500 ring-1 ring-red-100'}`}>
                          {src.type === 'income' ? '입금' : '출금'}
                        </span>
                        <span className="text-xs text-slate-400">{src.transaction_date}</span>
                        {src.payment_method && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">{src.payment_method}</span>
                        )}
                      </div>

                      {src.description && (
                        <p className="text-xs text-slate-400 mb-2 truncate">{src.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* AI 추천 카테고리 */}
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[11px] font-semibold">
                          {item.ai_category || '미분류'}
                        </span>

                        {/* 신뢰도 */}
                        <div className="flex items-center gap-1.5">
                          <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${getConfidenceBar(conf)}`} style={{ width: `${conf}%` }} />
                          </div>
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${getConfidenceColor(conf)}`}>
                            {conf}%
                          </span>
                        </div>

                        {/* 연결 대상 */}
                        {item.ai_related_type && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${TYPE_COLORS[item.ai_related_type] || 'bg-slate-100 text-slate-600'}`}>
                            {TYPE_LABELS[item.ai_related_type] || item.ai_related_type}
                          </span>
                        )}

                        {/* 확정 카테고리 */}
                        {isConfirmed && item.final_category && (
                          <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md text-[10px] font-semibold ring-1 ring-emerald-100">
                            확정: {item.final_category}
                          </span>
                        )}
                      </div>

                      {/* 대안 제시 */}
                      {!isConfirmed && (item.alternatives || []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="text-[10px] text-slate-400 leading-6">대안:</span>
                          {(item.alternatives || []).slice(0, 3).map((alt: any, i: number) => (
                            <button key={i}
                              onClick={() => handleConfirm(item, { category: alt.category, related_type: alt.related_type, related_id: alt.related_id })}
                              className="text-[10px] font-medium bg-slate-50 text-slate-500 px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                              {alt.category} ({alt.confidence}%)
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 금액 */}
                    <div className="text-right flex-none">
                      <p className={`text-base font-bold ${src.type === 'income' ? 'text-blue-600' : 'text-red-500'}`}>
                        {src.type === 'income' ? '+' : '-'}{nf(src.amount)}
                      </p>
                    </div>
                  </div>

                  {/* 액션 버튼 */}
                  {!isConfirmed && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                      <button onClick={() => handleConfirm(item)}
                        className="bg-steel-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-steel-700 transition-colors">
                        AI 추천 확정
                      </button>

                      <button onClick={() => handleConfirmWithRule(item, item.ai_category)}
                        className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors">
                        규칙 학습 + 확정
                      </button>

                      <select
                        defaultValue=""
                        onChange={e => {
                          if (e.target.value) handleConfirm(item, { category: e.target.value })
                        }}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white text-slate-500">
                        <option value="" disabled>카테고리 변경 확정...</option>
                        {CATEGORIES.map(g => (
                          <optgroup key={g.group} label={g.group}>
                            {g.items.map(c => <option key={c} value={c}>{c}</option>)}
                          </optgroup>
                        ))}
                      </select>

                      <select
                        defaultValue=""
                        onChange={e => {
                          if (!e.target.value) return
                          const [type, id] = e.target.value.split('_')
                          handleConfirm(item, { related_type: type, related_id: id })
                        }}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white text-slate-500">
                        <option value="" disabled>연결 변경...</option>
                        <optgroup label="지입">
                          {jiips.map(j => <option key={j.id} value={`jiip_${j.id}`}>{j.investor_name || j.contractor_name}</option>)}
                        </optgroup>
                        <optgroup label="투자">
                          {investors.map(i => <option key={i.id} value={`invest_${i.id}`}>{i.investor_name}</option>)}
                        </optgroup>
                        <optgroup label="프리랜서">
                          {freelancers.map(f => <option key={f.id} value={`freelancer_${f.id}`}>{f.name}</option>)}
                        </optgroup>
                        <optgroup label="직원">
                          {employees.map(e => <option key={e.id} value={`salary_${e.id}`}>{e.name}</option>)}
                        </optgroup>
                      </select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
