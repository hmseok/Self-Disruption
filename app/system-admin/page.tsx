'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'

// ============================================
// 구독/모듈 관리 (god_admin 전용)
// 전체 모듈 풀 + 플랜별 배분 + 회사별 ON/OFF
// ============================================

const PLANS = [
  { key: 'free', label: '무료', color: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400', headerBg: 'bg-slate-50 border-slate-200', headerText: 'text-slate-700', selectBg: 'bg-slate-100' },
  { key: 'basic', label: '베이직', color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500', headerBg: 'bg-green-50 border-green-200', headerText: 'text-green-800', selectBg: 'bg-green-100' },
  { key: 'pro', label: '프로', color: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500', headerBg: 'bg-blue-50 border-blue-200', headerText: 'text-blue-800', selectBg: 'bg-blue-100' },
  { key: 'max', label: '맥스', color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500', headerBg: 'bg-amber-50 border-amber-200', headerText: 'text-amber-800', selectBg: 'bg-amber-100' },
]

const PLAN_KEYS = PLANS.map(p => p.key)

function getPlanInfo(plan: string) {
  return PLANS.find(p => p.key === plan) || PLANS[0]
}

function getPlanIndex(plan: string) {
  const idx = PLAN_KEYS.indexOf(plan)
  return idx >= 0 ? idx : 0
}

const ICON_OPTIONS = ['Doc', 'Car', 'Truck', 'Shield', 'Money', 'Clipboard', 'Building', 'Chart', 'Wrench', 'Database', 'Users']

export default function SystemAdminPage() {
  const router = useRouter()
  const { role, loading: appLoading, triggerMenuRefresh } = useApp()

  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<any[]>([])
  const [modules, setModules] = useState<any[]>([])
  const [matrix, setMatrix] = useState<any>({})
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [tab, setTab] = useState<'plans' | 'companies'>('plans')
  const [editingModule, setEditingModule] = useState<any>(null)
  const [moduleForm, setModuleForm] = useState({ name: '', path: '', icon_key: 'Doc', description: '', plan_group: 'free' })

  useEffect(() => {
    if (!appLoading && role === 'god_admin') loadData()
    else if (!appLoading && role !== 'god_admin') {
      alert('접근 권한이 없습니다.')
      router.replace('/dashboard')
    }
  }, [appLoading, role])

  const loadData = async () => {
    setLoading(true)
    const { data: compData } = await supabase.from('companies').select('*').order('name')
    const { data: modData } = await supabase.from('system_modules').select('*').order('path')
    const { data: activeData } = await supabase.rpc('get_all_company_modules')

    if (compData && modData) {
      setCompanies(compData)
      setModules(modData)
      const statusMap: any = {}
      if (activeData) {
        activeData.forEach((item: any) => {
          statusMap[`${item.company_id}_${item.module_id}`] = item.is_active
        })
      }
      setMatrix(statusMap)
    }
    setLoading(false)
  }

  // 모듈 수정
  const saveEditModule = async () => {
    if (!editingModule) return
    const { error } = await supabase.from('system_modules')
      .update({
        name: moduleForm.name, path: moduleForm.path, icon_key: moduleForm.icon_key,
        description: moduleForm.description || null, plan_group: moduleForm.plan_group,
      })
      .eq('id', editingModule.id)
    if (error) { alert('수정 실패: ' + error.message); return }
    setEditingModule(null)
    setModuleForm({ name: '', path: '', icon_key: 'Doc', description: '', plan_group: 'free' })
    loadData()
  }

  // 모듈 편집 시작
  const startEditModule = (mod: any) => {
    setEditingModule(mod)
    setModuleForm({ name: mod.name, path: mod.path, icon_key: mod.icon_key || 'Doc', description: mod.description || '', plan_group: mod.plan_group || 'free' })
  }

  // 모듈 플랜 그룹 변경 (전체 모듈 카드에서 드롭다운으로)
  const updateModulePlan = async (moduleId: string, newPlan: string) => {
    setModules(prev => prev.map(m => m.id === moduleId ? { ...m, plan_group: newPlan } : m))
    const { data, error } = await supabase.rpc('update_module_plan_group', {
      target_module_id: moduleId,
      new_plan_group: newPlan,
    })
    if (error || (data && !data.success)) {
      alert('저장 실패: ' + (error?.message || data?.error))
      loadData()
    }
  }

  // 회사 플랜 변경
  const updateCompanyPlan = async (companyId: string, newPlan: string) => {
    if (!confirm(`이 회사의 플랜을 "${getPlanInfo(newPlan).label}"로 변경하시겠습니까?\n해당 플랜의 모듈이 자동으로 활성화됩니다.`)) return
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, plan: newPlan } : c))
    const { data, error } = await supabase.rpc('update_company_plan', {
      target_company_id: companyId,
      new_plan: newPlan,
    })
    if (error || (data && !data.success)) {
      alert('변경 실패: ' + (error?.message || data?.error))
      loadData()
    } else {
      triggerMenuRefresh()
      loadData()
    }
  }

  // 단일 모듈 토글
  const toggleModule = async (companyId: string, moduleId: string, currentStatus: boolean) => {
    const key = `${companyId}_${moduleId}`
    setMatrix((prev: any) => ({ ...prev, [key]: !currentStatus }))
    const { data, error } = await supabase.rpc('toggle_company_module', {
      target_company_id: companyId,
      target_module_id: moduleId,
      new_active: !currentStatus,
    })
    if (error || (data && !data.success)) {
      alert('설정 실패: ' + (error?.message || data?.error))
      setMatrix((prev: any) => ({ ...prev, [key]: currentStatus }))
    } else {
      triggerMenuRefresh()
    }
  }

  // 전체 ON/OFF
  const toggleAllForCompany = async (companyId: string, enable: boolean) => {
    const newMatrix = { ...matrix }
    modules.forEach(mod => { newMatrix[`${companyId}_${mod.id}`] = enable })
    setMatrix(newMatrix)
    const { data, error } = await supabase.rpc('toggle_all_company_modules', {
      target_company_id: companyId, new_active: enable,
    })
    if (error || (data && !data.success)) {
      alert('일괄 설정 실패')
      loadData()
    } else {
      triggerMenuRefresh()
    }
  }

  const filteredCompanies = filter === 'active'
    ? companies.filter(c => c.is_active) : companies

  const getActiveCount = (companyId: string) =>
    modules.filter(m => matrix[`${companyId}_${m.id}`]).length

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">

        {/* 헤더 */}
        <div className="mb-5 md:mb-6">
          <h1 className="text-xl md:text-3xl font-extrabold text-slate-900">구독/모듈 관리</h1>
          <p className="text-slate-500 mt-1 text-xs md:text-sm">전체 모듈 풀에서 플랜별로 배분하고, 회사별 모듈을 관리합니다.</p>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl w-fit">
          {[
            { key: 'plans' as const, label: '플랜/모듈 설정' },
            { key: 'companies' as const, label: '회사별 관리' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ========== 탭 1: 플랜/모듈 설정 ========== */}
        {tab === 'plans' && (
          <div>
            {/* 안내 */}
            <div className="mb-5 p-3 bg-steel-50 rounded-xl border border-steel-100">
              <p className="text-[11px] md:text-xs text-steel-700">
                <strong>플랜 계층 구조:</strong> 상위 플랜은 하위 플랜의 모듈을 모두 포함합니다.
                무료 → 베이직 → 프로 → 맥스 순으로, 맥스는 모든 모듈을 이용할 수 있습니다.
              </p>
            </div>

            {/* ★ 전체 모듈 카드 (모듈 풀) */}
            <div className="mb-5 bg-white rounded-2xl border-2 border-slate-200 overflow-hidden">
              <div className="p-4 border-b-2 border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
                  </svg>
                  <span className="text-lg font-black text-slate-800">전체 모듈</span>
                  <span className="text-xs text-slate-400 ml-1">({modules.length}개)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">개발된 모듈이 자동으로 여기에 표시됩니다. 각 모듈의 플랜을 선택해 배분하세요.</p>
              </div>
              <div className="p-3 md:p-4">
                {modules.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">등록된 모듈이 없습니다.</p>
                ) : (
                  <>
                    {/* Desktop: 테이블 형태 */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase w-12">아이콘</th>
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase">모듈명</th>
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase">경로</th>
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase">설명</th>
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase w-24 text-center">플랜</th>
                            <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase w-12"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {modules.map(mod => {
                            const modPlan = getPlanInfo(mod.plan_group || 'free')
                            return (
                              <tr key={mod.id} className="border-b border-slate-50 hover:bg-slate-50/50 group">
                                <td className="px-3 py-2.5">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${modPlan.color}`}>
                                    <span className="text-[10px] font-black">{mod.icon_key?.slice(0, 2) || '?'}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="text-sm font-bold text-slate-800">{mod.name}</span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="text-xs text-slate-400 font-mono">{mod.path}</span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="text-xs text-slate-400">{mod.description || '-'}</span>
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <select
                                    value={mod.plan_group || 'free'}
                                    onChange={(e) => updateModulePlan(mod.id, e.target.value)}
                                    className={`text-[10px] font-black px-2.5 py-1 rounded-lg border cursor-pointer focus:outline-none focus:ring-1 focus:ring-steel-400 ${modPlan.color}`}
                                  >
                                    {PLANS.map(p => (
                                      <option key={p.key} value={p.key}>{p.label}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-3 py-2.5">
                                  <button
                                    onClick={() => startEditModule(mod)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all"
                                    title="모듈 수정"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile: 카드 형태 */}
                    <div className="md:hidden space-y-2">
                      {modules.map(mod => {
                        const modPlan = getPlanInfo(mod.plan_group || 'free')
                        return (
                          <div key={mod.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="flex items-center gap-3 mb-2">
                              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${modPlan.color}`}>
                                <span className="text-[11px] font-black">{mod.icon_key?.slice(0, 2) || '?'}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-slate-800">{mod.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{mod.path}</div>
                              </div>
                              <button
                                onClick={() => startEditModule(mod)}
                                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 flex-shrink-0"
                                title="모듈 수정"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                                </svg>
                              </button>
                            </div>
                            <div className="flex items-center justify-between">
                              {mod.description && (
                                <span className="text-[11px] text-slate-400 flex-1 mr-2">{mod.description}</span>
                              )}
                              <select
                                value={mod.plan_group || 'free'}
                                onChange={(e) => updateModulePlan(mod.id, e.target.value)}
                                className={`text-[10px] font-black px-2.5 py-1.5 rounded-lg border cursor-pointer focus:outline-none ${modPlan.color} flex-shrink-0`}
                              >
                                {PLANS.map(p => (
                                  <option key={p.key} value={p.key}>{p.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 모듈 수정 모달 */}
            {editingModule && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditingModule(null)}>
                <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-black text-slate-900 mb-4">모듈 수정</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">모듈 이름</label>
                      <input value={moduleForm.name} onChange={(e) => setModuleForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-steel-500" placeholder="예: 차량 관리" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">경로 (path)</label>
                      <input value={moduleForm.path} onChange={(e) => setModuleForm(f => ({ ...f, path: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-steel-500" placeholder="예: /cars" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">아이콘</label>
                        <select value={moduleForm.icon_key} onChange={(e) => setModuleForm(f => ({ ...f, icon_key: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-steel-500">
                          {ICON_OPTIONS.map(icon => <option key={icon} value={icon}>{icon}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">플랜 그룹</label>
                        <select value={moduleForm.plan_group} onChange={(e) => setModuleForm(f => ({ ...f, plan_group: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-steel-500">
                          {PLANS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">설명 (선택)</label>
                      <input value={moduleForm.description} onChange={(e) => setModuleForm(f => ({ ...f, description: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-steel-500" placeholder="모듈 설명" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-5">
                    <button onClick={() => setEditingModule(null)}
                      className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200">취소</button>
                    <button onClick={saveEditModule}
                      className="flex-1 px-4 py-2.5 bg-steel-600 text-white rounded-xl text-sm font-bold hover:bg-steel-700">저장</button>
                  </div>
                </div>
              </div>
            )}

            {/* ★ 플랜별 배분 결과 카드 */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
              {PLANS.map(plan => {
                const planModules = modules.filter(m => (m.plan_group || 'free') === plan.key)
                const planIdx = getPlanIndex(plan.key)
                const cumulativeCount = modules.filter(m => getPlanIndex(m.plan_group || 'free') <= planIdx).length

                return (
                  <div key={plan.key} className={`rounded-2xl border-2 overflow-hidden ${plan.headerBg}`}>
                    {/* 플랜 헤더 */}
                    <div className={`p-3 md:p-4 border-b-2 ${plan.headerBg}`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-full ${plan.dot}`}></span>
                        <span className={`text-base md:text-lg font-black ${plan.headerText}`}>{plan.label}</span>
                      </div>
                      <div className="text-[10px] md:text-[11px] text-slate-500">
                        고유 <strong>{planModules.length}개</strong>
                        {planIdx > 0 && (
                          <span className="ml-1.5">/ 누적 <strong>{cumulativeCount}개</strong></span>
                        )}
                      </div>
                    </div>

                    {/* 이 플랜 고유 모듈 */}
                    <div className="p-2 md:p-3 bg-white/80">
                      {planModules.length === 0 ? (
                        <p className="text-[11px] text-slate-400 py-3 text-center">배분된 모듈 없음</p>
                      ) : (
                        <div className="space-y-1.5">
                          {planModules.map(mod => (
                            <div key={mod.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-slate-100 hover:border-slate-200 transition-all group">
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] md:text-xs font-bold text-slate-800 leading-snug">{mod.name}</div>
                                <div className="text-[9px] md:text-[10px] text-slate-400 font-mono leading-tight">{mod.path}</div>
                              </div>
                              <button onClick={() => startEditModule(mod)}
                                className="p-1 rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" title="수정">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 하위 플랜에서 상속받는 모듈 */}
                      {planIdx > 0 && (() => {
                        const inherited = modules.filter(m => getPlanIndex(m.plan_group || 'free') < planIdx)
                        return inherited.length > 0 ? (
                          <div className="mt-2 pt-2 border-t border-slate-100">
                            <div className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase mb-1.5">하위 플랜 포함</div>
                            <div className="flex flex-wrap gap-1">
                              {inherited.map(mod => (
                                <span key={mod.id} className="text-[9px] md:text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium leading-tight">
                                  {mod.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null
                      })()}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ========== 탭 2: 회사별 관리 ========== */}
        {tab === 'companies' && (
          <div>
            {/* 필터 */}
            <div className="flex items-center gap-2 md:gap-4 mb-5">
              {[
                { key: 'active' as const, label: '승인된 회사', count: companies.filter(c => c.is_active).length },
                { key: 'all' as const, label: '전체', count: companies.length },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${
                    filter === f.key ? 'bg-steel-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {f.label} ({f.count})
                </button>
              ))}
              <span className="ml-auto text-[10px] md:text-xs text-slate-400">{modules.length}개 모듈</span>
            </div>

            {/* 회사 카드 */}
            <div className="space-y-4">
              {filteredCompanies.map(comp => {
                const activeCount = getActiveCount(comp.id)
                const planInfo = getPlanInfo(comp.plan || 'free')
                return (
                  <div key={comp.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
                    !comp.is_active ? 'border-yellow-300 opacity-60' : 'border-slate-200'
                  }`}>
                    {/* 회사 헤더 */}
                    <div className="p-3 md:p-5 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0 ${
                          comp.is_active ? 'bg-steel-600' : 'bg-yellow-500'
                        }`}>
                          {comp.name[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-sm md:text-base">{comp.name}</span>
                            {/* 플랜 선택 드롭다운 */}
                            <select
                              value={comp.plan || 'free'}
                              onChange={(e) => updateCompanyPlan(comp.id, e.target.value)}
                              className={`text-[10px] font-black px-2 py-0.5 rounded border cursor-pointer focus:outline-none ${planInfo.color}`}
                            >
                              {PLANS.map(p => (
                                <option key={p.key} value={p.key}>{p.label.toUpperCase()}</option>
                              ))}
                            </select>
                            {!comp.is_active && (
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">승인 대기</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            활성: <strong className="text-steel-600">{activeCount}</strong>/{modules.length}
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => toggleAllForCompany(comp.id, true)}
                            className="px-2.5 md:px-3 py-1.5 text-[11px] md:text-xs font-bold bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors active:scale-95"
                          >
                            전체 ON
                          </button>
                          <button
                            onClick={() => toggleAllForCompany(comp.id, false)}
                            className="px-2.5 md:px-3 py-1.5 text-[11px] md:text-xs font-bold bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors active:scale-95"
                          >
                            전체 OFF
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 모듈 그리드 (플랜 뱃지 포함) */}
                    <div className="p-2 md:p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                      {modules.map(mod => {
                        const isActive = !!matrix[`${comp.id}_${mod.id}`]
                        const modPlan = getPlanInfo(mod.plan_group || 'free')
                        return (
                          <button
                            key={mod.id}
                            onClick={() => toggleModule(comp.id, mod.id, isActive)}
                            className={`relative p-2.5 md:p-3 rounded-xl border-2 text-left transition-all active:scale-95 ${
                              isActive
                                ? 'border-steel-400 bg-steel-50'
                                : 'border-slate-200 bg-slate-50 opacity-50 hover:opacity-80'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5 mb-1.5">
                              <span className="text-[11px] md:text-sm font-bold text-slate-800 leading-tight break-keep">{mod.name}</span>
                              <div className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 ${isActive ? 'bg-steel-500' : 'bg-slate-300'}`}>
                                {isActive && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] md:text-[10px] text-slate-400 font-mono">{mod.path}</span>
                              <span className={`text-[8px] md:text-[9px] font-black px-1 py-0.5 rounded ${modPlan.color}`}>
                                {modPlan.label}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {filteredCompanies.length === 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <p className="text-slate-400 font-bold">해당 조건의 회사가 없습니다</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 안내 */}
        <div className="mt-6 p-3 md:p-4 bg-steel-50 rounded-xl border border-steel-100">
          <p className="text-[11px] md:text-xs text-steel-700">
            <strong>플랜 계층:</strong> 무료 → 베이직 → 프로 → 맥스. 상위 플랜은 하위 플랜의 모든 모듈을 포함합니다.
            회사 플랜을 변경하면 해당 플랜의 모듈이 자동으로 활성화됩니다. 개별 모듈을 수동으로 오버라이드할 수 있습니다.
          </p>
        </div>

      </div>
    </div>
  )
}
