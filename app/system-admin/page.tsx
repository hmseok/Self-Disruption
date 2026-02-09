'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'

// ============================================
// 구독/모듈 관리 (god_admin 전용)
// 회사별 모듈 ON/OFF 제어
// ============================================

export default function SystemAdminPage() {
  const router = useRouter()
  const { role, loading: appLoading, triggerMenuRefresh } = useApp()

  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<any[]>([])
  const [modules, setModules] = useState<any[]>([])
  const [matrix, setMatrix] = useState<any>({})
  const [filter, setFilter] = useState<'active' | 'all'>('active')

  useEffect(() => {
    if (!appLoading && role === 'god_admin') loadData()
    else if (!appLoading && role !== 'god_admin') {
      alert('접근 권한이 없습니다.')
      router.replace('/dashboard')
    }
  }, [appLoading, role])

  const loadData = async () => {
    setLoading(true)

    const { data: compData } = await supabase
      .from('companies').select('*').order('name')
    const { data: modData } = await supabase
      .from('system_modules').select('*').order('path')

    // RPC로 읽기 (RLS 우회)
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

  // 단일 모듈 토글 (RPC 사용 - RLS 우회)
  const toggleModule = async (companyId: string, moduleId: string, currentStatus: boolean) => {
    const key = `${companyId}_${moduleId}`
    setMatrix((prev: any) => ({ ...prev, [key]: !currentStatus }))

    const { data, error } = await supabase.rpc('toggle_company_module', {
      target_company_id: companyId,
      target_module_id: moduleId,
      new_active: !currentStatus,
    })

    if (error) {
      alert('설정 저장 실패: ' + error.message)
      setMatrix((prev: any) => ({ ...prev, [key]: currentStatus }))
    } else if (data && !data.success) {
      alert('설정 저장 실패: ' + (data.error || '알 수 없는 오류'))
      setMatrix((prev: any) => ({ ...prev, [key]: currentStatus }))
    } else {
      triggerMenuRefresh()
    }
  }

  // 전체 ON/OFF (RPC 사용 - RLS 우회)
  const toggleAllForCompany = async (companyId: string, enable: boolean) => {
    const newMatrix = { ...matrix }
    modules.forEach(mod => {
      newMatrix[`${companyId}_${mod.id}`] = enable
    })
    setMatrix(newMatrix)

    const { data, error } = await supabase.rpc('toggle_all_company_modules', {
      target_company_id: companyId,
      new_active: enable,
    })

    if (error) {
      alert('일괄 설정 실패: ' + error.message)
      loadData()
    } else if (data && !data.success) {
      alert('일괄 설정 실패: ' + (data.error || '알 수 없는 오류'))
      loadData()
    } else {
      triggerMenuRefresh()
    }
  }

  const filteredCompanies = filter === 'active'
    ? companies.filter(c => c.is_active)
    : companies

  const getActiveCount = (companyId: string) => {
    return modules.filter(m => matrix[`${companyId}_${m.id}`]).length
  }

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
          <p className="text-slate-500 mt-1 text-xs md:text-base">회사별 기능 모듈을 ON/OFF 제어합니다.</p>
        </div>

        {/* 필터 + 통계 */}
        <div className="flex items-center gap-2 md:gap-4 mb-5 md:mb-6">
          {[
            { key: 'active' as const, label: '승인된 회사', count: companies.filter(c => c.is_active).length },
            { key: 'all' as const, label: '전체', count: companies.length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${
                filter === tab.key
                  ? 'bg-steel-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
          <span className="ml-auto text-[10px] md:text-xs text-slate-400">
            {modules.length}개 모듈
          </span>
        </div>

        {/* 회사별 모듈 카드 */}
        <div className="space-y-4">
          {filteredCompanies.map(comp => {
            const activeCount = getActiveCount(comp.id)
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
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                          comp.plan === 'master' ? 'bg-yellow-100 text-yellow-700' :
                          comp.plan === 'pro' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {comp.plan?.toUpperCase() || 'FREE'}
                        </span>
                        {!comp.is_active && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">
                            승인 대기
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        활성: <strong className="text-steel-600">{activeCount}</strong>/{modules.length}
                      </div>
                    </div>
                    {/* 전체 ON/OFF */}
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

                {/* 모듈 토글 그리드 */}
                <div className="p-2 md:p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
                  {modules.map(mod => {
                    const isActive = !!matrix[`${comp.id}_${mod.id}`]
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
                        <div className="text-[10px] md:text-[11px] text-slate-400 font-mono">{mod.path}</div>
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

        {/* 안내 */}
        <div className="mt-6 p-3 md:p-4 bg-steel-50 rounded-xl border border-steel-100">
          <p className="text-[11px] md:text-xs text-steel-700">
            <strong>모듈 ON/OFF 연동:</strong> 모듈을 켜면 해당 회사의 사이드바와 대시보드에 즉시 반영됩니다. 모듈을 꺼도 데이터는 유지됩니다.
          </p>
        </div>

      </div>
    </div>
  )
}
