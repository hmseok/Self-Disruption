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
  const [tab, setTab] = useState<'plans' | 'companies' | 'invites'>('plans')
  const [editingModule, setEditingModule] = useState<any>(null)
  const [moduleForm, setModuleForm] = useState({ name: '', path: '', icon_key: 'Doc', description: '', plan_group: 'free' })

  // Super God Admin 초대
  const [invites, setInvites] = useState<any[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteDesc, setInviteDesc] = useState('')
  const [newInviteCode, setNewInviteCode] = useState<string | null>(null)
  const [inviteEmailStatus, setInviteEmailStatus] = useState<'none' | 'sent' | 'error'>('none')

  useEffect(() => {
    if (!appLoading && role === 'god_admin') loadData()
    else if (!appLoading && role !== 'god_admin') {
      alert('접근 권한이 없습니다.')
      router.replace('/dashboard')
    }
  }, [appLoading, role])

  // 초대 탭 진입 시 목록 로드
  useEffect(() => {
    if (tab === 'invites' && role === 'god_admin') {
      (async () => {
        setInviteLoading(true)
        try {
          const session = await supabase.auth.getSession()
          const token = session.data.session?.access_token
          const res = await fetch('/api/admin-invite', { headers: { 'Authorization': `Bearer ${token}` } })
          const data = await res.json()
          if (Array.isArray(data)) setInvites(data)
        } catch {}
        setInviteLoading(false)
      })()
    }
  }, [tab, role])

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
            { key: 'invites' as const, label: 'Super God Admin' },
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                    {modules.map(mod => {
                      const modPlan = getPlanInfo(mod.plan_group || 'free')
                      return (
                        <div key={mod.id} className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all group">
                          {/* 아이콘 */}
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${modPlan.color}`}>
                            <span className="text-[11px] font-black">{mod.icon_key?.slice(0, 2) || '?'}</span>
                          </div>
                          {/* 정보 */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-800 truncate">{mod.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{mod.path}</div>
                          </div>
                          {/* 플랜 드롭다운 */}
                          <select
                            value={mod.plan_group || 'free'}
                            onChange={(e) => updateModulePlan(mod.id, e.target.value)}
                            className={`text-[10px] font-black px-2 py-1 rounded-lg border cursor-pointer focus:outline-none focus:ring-1 focus:ring-steel-400 ${modPlan.color}`}
                          >
                            {PLANS.map(p => (
                              <option key={p.key} value={p.key}>{p.label}</option>
                            ))}
                          </select>
                          {/* 수정 버튼 */}
                          <button
                            onClick={() => startEditModule(mod)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all"
                            title="모듈 수정"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                            </svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {PLANS.map(plan => {
                const planModules = modules.filter(m => (m.plan_group || 'free') === plan.key)
                const planIdx = getPlanIndex(plan.key)
                const cumulativeCount = modules.filter(m => getPlanIndex(m.plan_group || 'free') <= planIdx).length

                return (
                  <div key={plan.key} className={`rounded-2xl border-2 overflow-hidden ${plan.headerBg}`}>
                    {/* 플랜 헤더 */}
                    <div className={`p-4 border-b-2 ${plan.headerBg}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-3 h-3 rounded-full ${plan.dot}`}></span>
                        <span className={`text-lg font-black ${plan.headerText}`}>{plan.label}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        고유: <strong>{planModules.length}개</strong>
                        {planIdx > 0 && (
                          <span className="ml-2">누적: <strong>{cumulativeCount}개</strong></span>
                        )}
                      </div>
                    </div>

                    {/* 이 플랜 고유 모듈 */}
                    <div className="p-3 bg-white/80">
                      {planModules.length === 0 ? (
                        <p className="text-xs text-slate-400 py-4 text-center">배분된 모듈 없음</p>
                      ) : (
                        <div className="space-y-2">
                          {planModules.map(mod => (
                            <div key={mod.id} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-100 hover:border-slate-200 transition-all group">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-slate-800 truncate">{mod.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{mod.path}</div>
                              </div>
                              {/* 수정 버튼 */}
                              <button onClick={() => startEditModule(mod)}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition-opacity" title="수정">
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
                          <div className="mt-3 pt-3 border-t border-slate-100">
                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">하위 플랜 포함</div>
                            <div className="flex flex-wrap gap-1">
                              {inherited.map(mod => (
                                <span key={mod.id} className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">
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
                    <div className="p-2 md:p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
                      {modules.map(mod => {
                        const isActive = !!matrix[`${comp.id}_${mod.id}`]
                        const modPlan = getPlanInfo(mod.plan_group || 'free')
                        return (
                          <button
                            key={mod.id}
                            onClick={() => toggleModule(comp.id, mod.id, isActive)}
                            className={`relative p-3 rounded-xl border-2 text-left transition-all active:scale-95 ${
                              isActive
                                ? 'border-steel-400 bg-steel-50'
                                : 'border-slate-200 bg-slate-50 opacity-50 hover:opacity-80'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1 gap-1">
                              <span className="text-xs md:text-sm font-bold text-slate-800 truncate">{mod.name}</span>
                              <div className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${isActive ? 'bg-steel-500' : 'bg-slate-300'}`}>
                                {isActive && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] md:text-[11px] text-slate-400 font-mono">{mod.path}</span>
                              <span className={`text-[8px] font-black px-1 py-0.5 rounded ${modPlan.color}`}>
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

        {/* ========== 탭 3: Super God Admin ========== */}
        {tab === 'invites' && (
          <div>
            <div className="mb-5 flex flex-col sm:flex-row gap-3">
              <div className="flex-1 p-3 bg-sky-50 rounded-xl border border-sky-100">
                <p className="text-[11px] md:text-xs text-sky-700">
                  <strong>Super God Admin 초대:</strong> 이메일 주소를 입력하면 초대 코드가 발급되고 해당 이메일로 자동 발송됩니다.
                  수신자는 회원가입 시 "관리자" 탭에서 초대 코드를 입력해 플랫폼 관리자로 가입할 수 있습니다.
                  코드는 1회용이며 72시간 후 만료됩니다.
                </p>
              </div>
            </div>

            {/* 코드 발급 + 이메일 발송 */}
            <div className="bg-white rounded-2xl border-2 border-sky-200 overflow-hidden mb-5">
              <div className="p-4 border-b-2 border-sky-200 bg-sky-50">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  <span className="text-lg font-black text-sky-800">초대 코드 발급</span>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {/* 이메일 입력 */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">수신자 이메일 *</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-500"
                  />
                </div>
                {/* 설명 + 발급 버튼 */}
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">메모 (선택)</label>
                    <input
                      value={inviteDesc}
                      onChange={(e) => setInviteDesc(e.target.value)}
                      placeholder="예: 홍길동님 개발팀"
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
                        alert('이메일 주소를 입력해주세요.')
                        return
                      }
                      setInviteLoading(true)
                      try {
                        const session = await supabase.auth.getSession()
                        const token = session.data.session?.access_token
                        const res = await fetch('/api/admin-invite', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                          body: JSON.stringify({ email: inviteEmail.trim(), description: inviteDesc, validHours: 72 }),
                        })
                        const result = await res.json()
                        if (result.success) {
                          setNewInviteCode(result.code)
                          if (result.emailSent) {
                            setInviteEmailStatus('sent')
                          } else if (result.emailError) {
                            setInviteEmailStatus('error')
                            alert('코드는 발급되었으나 이메일 발송 실패: ' + result.emailError)
                          } else {
                            setInviteEmailStatus('none')
                          }
                          setInviteDesc('')
                          setInviteEmail('')
                          // 목록 새로고침
                          const listRes = await fetch('/api/admin-invite', { headers: { 'Authorization': `Bearer ${token}` } })
                          setInvites(await listRes.json())
                        } else {
                          alert('발급 실패: ' + result.error)
                        }
                      } catch (err: any) { alert('오류: ' + err.message) }
                      setInviteLoading(false)
                    }}
                    disabled={inviteLoading}
                    className="px-5 py-2.5 bg-sky-600 text-white rounded-xl text-sm font-bold hover:bg-sky-700 disabled:opacity-50 transition-all flex-shrink-0"
                  >
                    {inviteLoading ? '발급 중...' : '코드 발급 + 이메일 발송'}
                  </button>
                </div>

                {/* 새로 발급된 코드 표시 */}
                {newInviteCode && (
                  <div className="mt-2 p-4 bg-sky-50 rounded-xl border border-sky-200 text-center">
                    {inviteEmailStatus === 'sent' && (
                      <p className="text-[11px] text-green-600 font-bold mb-2">이메일 발송 완료!</p>
                    )}
                    {inviteEmailStatus === 'error' && (
                      <p className="text-[11px] text-red-500 font-bold mb-2">이메일 발송 실패 (코드는 발급됨)</p>
                    )}
                    <p className="text-[11px] text-sky-600 mb-2">발급된 초대 코드:</p>
                    <div className="text-2xl font-black text-sky-800 tracking-[0.3em] font-mono">{newInviteCode}</div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(newInviteCode); alert('복사되었습니다!') }}
                      className="mt-2 text-xs text-sky-500 hover:text-sky-700 font-bold"
                    >
                      클립보드에 복사
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 발급 이력 */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <span className="text-base font-bold text-slate-800">발급 이력</span>
                <button
                  onClick={async () => {
                    setInviteLoading(true)
                    try {
                      const session = await supabase.auth.getSession()
                      const token = session.data.session?.access_token
                      const res = await fetch('/api/admin-invite', { headers: { 'Authorization': `Bearer ${token}` } })
                      setInvites(await res.json())
                    } catch {}
                    setInviteLoading(false)
                  }}
                  className="text-xs text-steel-500 hover:text-steel-700 font-bold"
                >
                  새로고침
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {invites.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">
                    아직 발급된 초대 코드가 없습니다.
                  </div>
                ) : (
                  invites.map((inv: any) => {
                    const isUsed = !!inv.used_at
                    const isExpired = !isUsed && new Date(inv.expires_at) < new Date()
                    return (
                      <div key={inv.id} className={`p-4 flex items-center gap-4 ${isUsed ? 'bg-slate-50 opacity-60' : isExpired ? 'bg-red-50/50 opacity-60' : ''}`}>
                        <div className="font-mono text-lg font-black tracking-wider text-slate-700 flex-shrink-0">
                          {inv.code}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-slate-600">{inv.description || '(설명 없음)'}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            발급: {new Date(inv.created_at).toLocaleString('ko-KR')}
                            {' · '}만료: {new Date(inv.expires_at).toLocaleString('ko-KR')}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {isUsed ? (
                            <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-200 text-slate-500">
                              사용됨 ({inv.consumer?.employee_name || '알 수 없음'})
                            </span>
                          ) : isExpired ? (
                            <span className="text-[10px] font-bold px-2 py-1 rounded bg-red-100 text-red-500">만료됨</span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-1 rounded bg-green-100 text-green-600">사용 가능</span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
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
