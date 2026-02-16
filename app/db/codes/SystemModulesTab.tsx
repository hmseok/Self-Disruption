'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useApp } from '../../context/AppContext'

interface SystemModule {
  id: string
  name: string
  path: string
  icon_key: string
  description?: string
  plan_group?: string
}

interface CompanyModule {
  company_id: string
  module_id: string
  is_active: boolean
}

const PLAN_ORDER = ['free', 'basic', 'pro', 'max']
const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-600',
  basic: 'bg-green-100 text-green-700',
  pro: 'bg-blue-100 text-blue-700',
  max: 'bg-yellow-100 text-yellow-700',
}

const ICON_MAP: Record<string, string> = {
  car: '🚗',
  users: '👥',
  receipt: '📋',
  calculator: '🧮',
  piggy_bank: '🏦',
  bus: '🚌',
  shield: '🛡️',
  credit_card: '💳',
  database: '💾',
  bar_chart: '📊',
  settings: '⚙️',
  truck: '🚛',
  tool: '🔧',
  file_text: '📄',
  dollar_sign: '💰',
  trending_up: '📈',
}

export default function SystemModulesTab() {
  const supabase = createClientComponentClient()
  const { role, company, allCompanies, adminSelectedCompanyId } = useApp()
  const isGodAdmin = role === 'god_admin'

  const [modules, setModules] = useState<SystemModule[]>([])
  const [companyModules, setCompanyModules] = useState<CompanyModule[]>([])
  const [loading, setLoading] = useState(true)
  const [showGuide, setShowGuide] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  const targetCompanyId = isGodAdmin ? adminSelectedCompanyId : company?.id

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const { data: sysModules, error: sysErr } = await supabase
        .from('system_modules')
        .select('*')
        .order('name')
      if (sysErr) throw sysErr
      setModules(sysModules || [])

      if (targetCompanyId) {
        const { data: compMods, error: compErr } = await supabase
          .from('company_modules')
          .select('*')
          .eq('company_id', targetCompanyId)
        if (compErr) throw compErr
        setCompanyModules(compMods || [])
      }
    } catch (error) {
      console.error('모듈 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, targetCompanyId])

  useEffect(() => { loadData() }, [loadData])

  const isModuleActive = (moduleId: string) => {
    const record = companyModules.find(cm => cm.module_id === moduleId)
    return record?.is_active ?? false
  }

  const handleToggle = async (moduleId: string) => {
    if (!isGodAdmin || !targetCompanyId) return
    try {
      setToggling(moduleId)
      const existing = companyModules.find(cm => cm.module_id === moduleId)
      if (existing) {
        const { error } = await supabase
          .from('company_modules')
          .update({ is_active: !existing.is_active })
          .eq('company_id', targetCompanyId)
          .eq('module_id', moduleId)
        if (error) throw error
        setCompanyModules(companyModules.map(cm =>
          cm.module_id === moduleId ? { ...cm, is_active: !cm.is_active } : cm
        ))
      } else {
        const { error } = await supabase
          .from('company_modules')
          .insert({ company_id: targetCompanyId, module_id: moduleId, is_active: true })
        if (error) throw error
        setCompanyModules([...companyModules, { company_id: targetCompanyId, module_id: moduleId, is_active: true }])
      }
    } catch (error) {
      console.error('모듈 토글 실패:', error)
    } finally {
      setToggling(null)
    }
  }

  const handleActivateAll = async () => {
    if (!isGodAdmin || !targetCompanyId) return
    if (!confirm('모든 모듈을 활성화하시겠습니까?')) return
    try {
      setLoading(true)
      for (const mod of modules) {
        const existing = companyModules.find(cm => cm.module_id === mod.id)
        if (existing) {
          if (!existing.is_active) {
            await supabase
              .from('company_modules')
              .update({ is_active: true })
              .eq('company_id', targetCompanyId)
              .eq('module_id', mod.id)
          }
        } else {
          await supabase
            .from('company_modules')
            .insert({ company_id: targetCompanyId, module_id: mod.id, is_active: true })
        }
      }
      await loadData()
    } catch (error) {
      console.error('전체 활성화 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
      </div>
    )
  }

  const activeCount = companyModules.filter(cm => cm.is_active).length

  return (
    <div className="space-y-4">
      {/* 가이드 배너 */}
      {showGuide && (
        <div className="bg-gradient-to-r from-slate-50 to-zinc-50 rounded-2xl p-5 border border-slate-200">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧩</span>
              <h3 className="text-sm font-bold text-gray-900">시스템 모듈 관리</h3>
              {isGodAdmin && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-600 rounded-full">GOD ADMIN</span>
              )}
            </div>
            <button onClick={() => setShowGuide(false)} className="text-gray-400 hover:text-gray-600 text-xs">닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-white/70 rounded-xl p-3">
              <p className="font-bold text-gray-800 mb-1">모듈이란?</p>
              <p className="text-gray-600 leading-relaxed">
                차량관리, 영업관리, 재무관리 등 ERP의 기능 단위입니다.
                구독 플랜에 따라 사용 가능한 모듈이 다릅니다.
              </p>
            </div>
            <div className="bg-white/70 rounded-xl p-3">
              <p className="font-bold text-gray-800 mb-1">활성화/비활성화</p>
              <p className="text-gray-600 leading-relaxed">
                {isGodAdmin
                  ? '각 회사별로 모듈을 개별 활성화/비활성화할 수 있습니다. 비활성 모듈은 해당 회사의 사이드바에서 숨겨집니다.'
                  : '현재 회사에 활성화된 모듈 목록입니다. 모듈 변경은 관리자에게 문의하세요.'
                }
              </p>
            </div>
            <div className="bg-white/70 rounded-xl p-3">
              <p className="font-bold text-gray-800 mb-1">플랜 그룹</p>
              <p className="text-gray-600 leading-relaxed">
                각 모듈이 어느 구독 플랜부터 사용 가능한지 표시합니다.
                FREE: 기본 기능, PRO: 고급 분석, MAX: 전체 기능.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 선택된 회사 정보 + 통계 */}
      {targetCompanyId && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-white text-lg">
                🧩
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">
                  {isGodAdmin
                    ? (allCompanies?.find((c: any) => c.id === targetCompanyId)?.name || '회사')
                    : (company?.name || '내 회사')
                  }
                </p>
                <p className="text-[10px] text-gray-400">
                  활성 모듈 {activeCount}개 / 전체 {modules.length}개
                </p>
              </div>
            </div>
            {isGodAdmin && (
              <button
                onClick={handleActivateAll}
                className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-semibold"
              >
                전체 활성화
              </button>
            )}
          </div>
        </div>
      )}

      {!targetCompanyId ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <span className="text-4xl block mb-3">🧩</span>
          <h3 className="text-sm font-bold text-gray-700 mb-1">회사를 선택하세요</h3>
          <p className="text-xs text-gray-400">
            {isGodAdmin
              ? '상단에서 회사를 선택하면 해당 회사의 모듈 현황을 관리할 수 있습니다.'
              : '회사에 소속된 후 모듈 목록을 확인할 수 있습니다.'
            }
          </p>
        </div>
      ) : (
        /* 모듈 그리드 */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map(mod => {
            const active = isModuleActive(mod.id)
            const icon = ICON_MAP[mod.icon_key] || '📦'
            const planGroup = mod.plan_group || 'free'

            return (
              <div
                key={mod.id}
                className={`bg-white rounded-2xl shadow-sm border p-4 transition-all ${
                  active
                    ? 'border-gray-200'
                    : 'border-gray-100 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{icon}</span>
                    <div>
                      <p className="text-xs font-bold text-gray-900">{mod.name}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{mod.path}</p>
                    </div>
                  </div>

                  {/* 토글 or 상태 뱃지 */}
                  {isGodAdmin ? (
                    <button
                      onClick={() => handleToggle(mod.id)}
                      disabled={toggling === mod.id}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        active ? 'bg-emerald-500' : 'bg-gray-300'
                      } ${toggling === mod.id ? 'opacity-50' : ''}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        active ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  ) : (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      active
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {active ? '활성' : '비활성'}
                    </span>
                  )}
                </div>

                {/* 하단 정보 */}
                <div className="mt-3 flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${PLAN_COLORS[planGroup] || PLAN_COLORS.free}`}>
                    {planGroup.toUpperCase()}+
                  </span>
                  {mod.description && (
                    <span className="text-[10px] text-gray-400 truncate">{mod.description}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
