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

const ICON_OPTIONS = ['Doc', 'Car', 'Truck', 'Shield', 'Money', 'Clipboard', 'Building', 'Chart', 'Wrench', 'Database', 'Users', 'Admin', 'Setting']

// ── 그룹 정의 (사이드바와 동일 구조) ──
const MODULE_GROUPS = [
  { id: 'vehicle', label: '차량', emoji: '🚗' },
  { id: 'ops', label: '차량운영', emoji: '🔧' },
  { id: 'sales', label: '영업', emoji: '📋' },
  { id: 'finance', label: '재무', emoji: '💰' },
  { id: 'invest', label: '투자', emoji: '📈' },
  { id: 'data', label: '데이터 관리', emoji: '🗄️' },
  { id: 'work', label: '직장인필수', emoji: '👤' },
  { id: 'platform', label: '플랫폼', emoji: '⚙️' },
  { id: 'settings', label: '설정', emoji: '🛠️' },
  { id: 'etc', label: '기타', emoji: '📁' },
]

// ── 경로 → 그룹 매핑 (사이드바 PATH_TO_GROUP 확장) ──
const PATH_TO_GROUP: Record<string, string> = {
  '/cars': 'vehicle', '/insurance': 'vehicle', '/registration': 'vehicle',
  '/operations': 'ops', '/maintenance': 'ops', '/accidents': 'ops',
  '/quotes': 'sales', '/quotes/pricing': 'sales', '/quotes/short-term': 'sales',
  '/contracts': 'sales', '/customers': 'sales', '/e-contract': 'sales',
  '/finance': 'finance', '/finance/collections': 'finance', '/finance/settlement': 'finance',
  '/finance/upload': 'finance', '/finance/review': 'finance', '/finance/freelancers': 'finance',
  '/finance/cards': 'finance', '/admin/payroll': 'finance', '/report': 'finance', '/loans': 'finance',
  '/invest': 'invest', '/jiip': 'invest',
  '/db/pricing-standards': 'data', '/db/lotte': 'data',
  '/work-essentials/my-info': 'work', '/work-essentials/receipts': 'work',
  '/admin': 'platform', '/system-admin': 'platform', '/admin/developer': 'platform',
  '/admin/employees': 'settings', '/admin/contract-terms': 'settings', '/admin/message-templates': 'settings',
}

function getModuleGroup(path: string): string {
  return PATH_TO_GROUP[path] || 'etc'
}

// ── 마스터 모듈 목록 (사이드바 표시명 기준, 프로젝트 전체 페이지) ──
const MASTER_MODULE_LIST = [
  // 차량
  { path: '/cars', name: '전체 차량 대장', icon_key: 'Car', description: '등록 차량 목록 및 상태 관리' },
  { path: '/insurance', name: '보험/가입', icon_key: 'Shield', description: '차량 보험 관리' },
  { path: '/registration', name: '등록 관리', icon_key: 'Doc', description: '차량 등록 관리' },
  // 차량운영
  { path: '/operations', name: '운영 관리', icon_key: 'Truck', description: '차량 운영 및 배정 관리' },
  { path: '/maintenance', name: '정비/검사 관리', icon_key: 'Wrench', description: '차량 정비 및 검사 이력' },
  { path: '/accidents', name: '사고 관리', icon_key: 'Shield', description: '사고 접수, 보험 처리, 수리 진행 관리' },
  { path: '/operations/intake', name: '접수/오더', icon_key: 'Clipboard', description: '잔디 접수 및 오더 관리' },
  // 영업
  { path: '/quotes', name: '견적 관리', icon_key: 'Doc', description: '견적 목록 및 관리' },
  { path: '/quotes/pricing', name: '견적 작성', icon_key: 'Doc', description: '렌트가 산출 및 견적서 작성' },
  { path: '/quotes/short-term', name: '단기 견적', icon_key: 'Doc', description: '단기 렌트 견적 작성' },
  { path: '/contracts', name: '계약 관리', icon_key: 'Clipboard', description: '렌트 계약 체결 및 수납 관리' },
  { path: '/customers', name: '고객 관리', icon_key: 'Users', description: '고객 정보 관리' },
  { path: '/e-contract', name: '전자계약서', icon_key: 'Doc', description: '단기 임대차 전자계약서 작성/발송/서명' },
  // 재무
  { path: '/finance', name: '재무 관리', icon_key: 'Money', description: '재무 대시보드 및 종합 관리' },
  { path: '/finance/collections', name: '수금 관리', icon_key: 'Money', description: '미수금 수금 관리' },
  { path: '/finance/settlement', name: '정산 관리', icon_key: 'Money', description: '정산 내역 관리' },
  { path: '/finance/fleet', name: '차량 수익', icon_key: 'Chart', description: '차량별 수익 현황 분석' },
  { path: '/finance/upload', name: '카드/통장 관리', icon_key: 'Money', description: '카드·통장 매입 데이터 업로드' },
  { path: '/finance/review', name: '재무 검토', icon_key: 'Money', description: '재무 검토 및 승인' },
  { path: '/finance/freelancers', name: '프리랜서 관리', icon_key: 'Users', description: '프리랜서 급여 및 세금 관리' },
  { path: '/finance/cards', name: '법인카드 관리', icon_key: 'Money', description: '법인카드 사용내역 관리' },
  { path: '/admin/payroll', name: '급여 관리', icon_key: 'Money', description: '직원 급여 대장 · 급여 설정 · 4대보험/세금 자동 계산 · 장부 연동' },
  { path: '/report', name: '리포트', icon_key: 'Chart', description: '매출/수익 리포트' },
  { path: '/loans', name: '론 관리', icon_key: 'Money', description: '대출/론 관리' },
  // 투자
  { path: '/invest', name: '투자 정산 관리', icon_key: 'Chart', description: '투자 정산 내역 관리' },
  { path: '/jiip', name: '지입 관리', icon_key: 'Truck', description: '지입 차량 관리' },
  // 데이터 관리
  { path: '/db/pricing-standards', name: '산출 기준 관리', icon_key: 'Database', description: '렌트가 산출에 사용되는 감가/보험/세금/금융/등록비 기준 데이터' },
  { path: '/db/lotte', name: '벤치마크 비교', icon_key: 'Chart', description: '외부 시세 참조 데이터' },
  // 직장인필수
  { path: '/work-essentials/my-info', name: '내 정보', icon_key: 'Users', description: '개인 정보 및 법인카드 관리' },
  { path: '/work-essentials/receipts', name: '영수증제출', icon_key: 'Clipboard', description: '법인카드 영수증 OCR 제출' },
  // 플랫폼
  { path: '/admin', name: '회사/가입 관리', icon_key: 'Building', description: '회사 등록 및 가입 승인 관리' },
  { path: '/system-admin', name: '구독 관리', icon_key: 'Setting', description: '모듈 플랜 배분 및 회사별 구독 관리' },
  { path: '/admin/developer', name: '개발자 모드', icon_key: 'Database', description: '시스템 개발자 도구' },
  // 설정
  { path: '/admin/employees', name: '조직/권한 관리', icon_key: 'Users', description: '직원 조직도 및 권한 설정' },
  { path: '/admin/contract-terms', name: '계약 약관 관리', icon_key: 'Doc', description: '렌트 계약 약관 템플릿 관리' },
  { path: '/admin/message-templates', name: '메시지 센터', icon_key: 'Clipboard', description: 'SMS/알림톡 메시지 템플릿 관리' },
]

// path → 마스터 이름 매핑 (DB 이름 동기화용)
const MASTER_NAME_MAP: Record<string, string> = {}
MASTER_MODULE_LIST.forEach(m => { MASTER_NAME_MAP[m.path] = m.name })

// Color constants for clean design
const COLORS = {
  pageBackground: '#f8fafc',
  cardBackground: '#ffffff',
  cardBorder: '#e2e8f0',
  borderRadius: 16,
  primaryText: '#1e293b',
  secondaryText: '#475569',
  tertiaryText: '#94a3b8',
  activeChip: '#2d5fa8',
  inactiveChip: '#f3f4f6',
  inactiveChipText: '#6b7280',
}

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
  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<string>>(new Set())
  const [bulkPlan, setBulkPlan] = useState<string>('free')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!appLoading && role === 'god_admin') loadData()
    else if (!appLoading && role !== 'god_admin') {
      alert('접근 권한이 없습니다.')
      router.replace('/dashboard')
    }
  }, [appLoading, role])

  // Refresh data when tab changes
  useEffect(() => {
    if (!appLoading && role === 'god_admin') {
      loadData()
    }
  }, [tab, appLoading, role])

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

  // ── 빠진 모듈 자동 동기화 ──
  const syncMissingModules = async () => {
    const existingPaths = new Set(modules.map(m => m.path))
    const missing = MASTER_MODULE_LIST.filter(m => !existingPaths.has(m.path))

    if (missing.length === 0) {
      alert('모든 모듈이 등록되어 있습니다.')
      return
    }

    if (!confirm(`${missing.length}개의 빠진 모듈을 추가하시겠습니까?\n\n${missing.map(m => `• ${m.name} (${m.path})`).join('\n')}`)) return

    setSyncing(true)
    const inserts = missing.map(m => ({
      name: m.name,
      path: m.path,
      icon_key: m.icon_key,
      description: m.description,
      plan_group: 'free',
    }))

    const { error } = await supabase.from('system_modules').insert(inserts)
    if (error) {
      alert('추가 실패: ' + error.message)
    } else {
      alert(`${missing.length}개 모듈이 추가되었습니다.`)
      await loadData()
    }
    setSyncing(false)
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

  // 모듈 선택 토글
  const toggleSelectModule = (moduleId: string) => {
    setSelectedModuleIds(prev => {
      const next = new Set(prev)
      if (next.has(moduleId)) next.delete(moduleId)
      else next.add(moduleId)
      return next
    })
  }
  const toggleSelectAllModules = () => {
    if (selectedModuleIds.size === modules.length) {
      setSelectedModuleIds(new Set())
    } else {
      setSelectedModuleIds(new Set(modules.map(m => m.id)))
    }
  }

  // 그룹 내 전체 선택 토글
  const toggleSelectGroup = (groupModules: any[]) => {
    const groupIds = new Set(groupModules.map(m => m.id))
    const allSelected = groupModules.every(m => selectedModuleIds.has(m.id))
    setSelectedModuleIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        groupIds.forEach(id => next.delete(id))
      } else {
        groupIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  // 일괄 플랜 변경
  const handleBulkPlanChange = async () => {
    if (selectedModuleIds.size === 0) return
    const planLabel = getPlanInfo(bulkPlan).label
    if (!confirm(`선택된 ${selectedModuleIds.size}개 모듈을 "${planLabel}" 플랜으로 일괄 변경하시겠습니까?`)) return

    setModules(prev => prev.map(m => selectedModuleIds.has(m.id) ? { ...m, plan_group: bulkPlan } : m))

    const ids = Array.from(selectedModuleIds)
    const results = await Promise.all(
      ids.map(id =>
        supabase.from('system_modules').update({ plan_group: bulkPlan }).eq('id', id)
      )
    )
    const failed = results.filter(r => r.error)
    if (failed.length > 0) {
      alert(`${failed.length}개 모듈 변경 실패`)
      loadData()
    }
    setSelectedModuleIds(new Set())
  }

  // 모듈 플랜 그룹 변경
  const updateModulePlan = async (moduleId: string, newPlan: string) => {
    setModules(prev => prev.map(m => m.id === moduleId ? { ...m, plan_group: newPlan } : m))
    const { error } = await supabase
      .from('system_modules')
      .update({ plan_group: newPlan })
      .eq('id', moduleId)
    if (error) {
      alert('저장 실패: ' + error.message)
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

  // ── 그룹별 모듈 분류 ──
  const groupedModules = MODULE_GROUPS.map(group => ({
    ...group,
    items: modules.filter(m => getModuleGroup(m.path) === group.id),
  })).filter(g => g.items.length > 0)

  // 빠진 모듈 수
  const existingPaths = new Set(modules.map(m => m.path))
  const missingCount = MASTER_MODULE_LIST.filter(m => !existingPaths.has(m.path)).length

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.pageBackground }}>
        <div style={{ animation: 'spin 1s linear infinite', width: 32, height: 32, borderRadius: '50%', borderWidth: 2, borderColor: COLORS.cardBorder, borderTopColor: COLORS.primaryText }}></div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: COLORS.pageBackground, padding: '20px 32px 40px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        {/* 헤더 */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: COLORS.primaryText, marginBottom: 8 }}>구독/모듈 관리</h1>
          <p style={{ fontSize: 14, color: COLORS.secondaryText }}>전체 모듈 풀에서 플랜별로 배분하고, 회사별 모듈을 관리합니다.</p>
        </div>

        {/* 언더라인 탭 스타일 */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderBottom: `2px solid ${COLORS.cardBorder}` }}>
          {[
            { key: 'plans' as const, label: '플랜/모듈 설정' },
            { key: 'companies' as const, label: '회사별 관리' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '12px 24px',
                fontSize: 15,
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? COLORS.primaryText : COLORS.tertiaryText,
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: tab === t.key ? `2px solid ${COLORS.primaryText}` : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginBottom: -2
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ========== 탭 1: 플랜/모듈 설정 ========== */}
        {tab === 'plans' && (
          <div>
            {/* 전체 모듈 카드 (그룹별) */}
            <div style={{ marginBottom: 28, backgroundColor: COLORS.cardBackground, borderRadius: COLORS.borderRadius, border: `1px solid ${COLORS.cardBorder}`, overflow: 'hidden' }}>
              <div style={{ padding: 20, borderBottom: `1px solid ${COLORS.cardBorder}`, backgroundColor: COLORS.pageBackground, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: COLORS.primaryText, marginBottom: 4 }}>전체 모듈</h2>
                  <p style={{ fontSize: 13, color: COLORS.secondaryText }}>사이드바와 동일한 그룹 구조로 모듈을 관리합니다. ({modules.length}개)</p>
                </div>
                {/* 빠진 모듈 동기화 버튼 */}
                {missingCount > 0 && (
                  <button
                    onClick={syncMissingModules}
                    disabled={syncing}
                    style={{
                      padding: '8px 16px',
                      fontSize: 13,
                      fontWeight: 600,
                      backgroundColor: '#fbbf24',
                      color: '#78350f',
                      border: 'none',
                      borderRadius: 8,
                      cursor: syncing ? 'not-allowed' : 'pointer',
                      opacity: syncing ? 0.6 : 1,
                      transition: 'background-color 0.2s',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                    onMouseEnter={(e) => !syncing && (e.currentTarget.style.backgroundColor = '#f59e0b')}
                    onMouseLeave={(e) => !syncing && (e.currentTarget.style.backgroundColor = '#fbbf24')}
                  >
                    {syncing ? '동기화 중...' : `빠진 모듈 ${missingCount}개 추가`}
                  </button>
                )}
              </div>

              <div style={{ padding: 20 }}>
                {/* 일괄 변경 액션 바 */}
                {selectedModuleIds.size > 0 && (
                  <div style={{
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    backgroundColor: COLORS.pageBackground,
                    border: `1px solid ${COLORS.cardBorder}`,
                    borderRadius: 12,
                    padding: '12px 16px',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.primaryText }}>
                      {selectedModuleIds.size}개 선택됨
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                      <select
                        value={bulkPlan}
                        onChange={(e) => setBulkPlan(e.target.value)}
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: `1px solid ${COLORS.cardBorder}`,
                          cursor: 'pointer',
                          backgroundColor: 'white',
                          color: COLORS.primaryText
                        }}
                      >
                        {PLANS.map(p => (
                          <option key={p.key} value={p.key}>{p.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleBulkPlanChange}
                        style={{
                          padding: '8px 16px',
                          fontSize: 13,
                          fontWeight: 600,
                          backgroundColor: COLORS.secondaryText,
                          color: 'white',
                          border: 'none',
                          borderRadius: 8,
                          cursor: 'pointer',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = COLORS.secondaryText)}
                      >
                        일괄 변경
                      </button>
                      <button
                        onClick={() => setSelectedModuleIds(new Set())}
                        style={{
                          padding: '8px 16px',
                          fontSize: 13,
                          fontWeight: 600,
                          backgroundColor: COLORS.cardBorder,
                          color: COLORS.secondaryText,
                          border: 'none',
                          borderRadius: 8,
                          cursor: 'pointer',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#cbd5e1')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = COLORS.cardBorder)}
                      >
                        선택 해제
                      </button>
                    </div>
                  </div>
                )}

                {modules.length === 0 ? (
                  <p style={{ fontSize: 14, color: COLORS.tertiaryText, padding: '32px 0', textAlign: 'center' }}>등록된 모듈이 없습니다.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {groupedModules.map(group => {
                      const allGroupSelected = group.items.every(m => selectedModuleIds.has(m.id))
                      return (
                        <div key={group.id} style={{ border: `1px solid ${COLORS.cardBorder}`, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.cardBackground }}>
                          {/* 그룹 헤더 */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', backgroundColor: COLORS.pageBackground, borderBottom: `1px solid ${COLORS.cardBorder}` }}>
                            <input
                              type="checkbox"
                              checked={allGroupSelected && group.items.length > 0}
                              onChange={() => toggleSelectGroup(group.items)}
                              style={{ width: 16, height: 16, cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: 15 }}>{group.emoji}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.primaryText }}>{group.label}</span>
                            <span style={{ fontSize: 12, color: COLORS.tertiaryText, fontWeight: 500, marginLeft: 'auto' }}>{group.items.length}개</span>
                          </div>

                          {/* 그룹 내 모듈 테이블 */}
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                              <tbody>
                                {group.items.map(mod => {
                                  const modPlan = getPlanInfo(mod.plan_group || 'free')
                                  const isSelected = selectedModuleIds.has(mod.id)
                                  return (
                                    <tr key={mod.id} style={{
                                      borderBottom: `1px solid ${COLORS.cardBorder}`,
                                      backgroundColor: isSelected ? COLORS.pageBackground : COLORS.cardBackground,
                                      transition: 'background-color 0.2s'
                                    }}
                                      onMouseEnter={(e) => !isSelected && (e.currentTarget.style.backgroundColor = COLORS.pageBackground)}
                                      onMouseLeave={(e) => !isSelected && (e.currentTarget.style.backgroundColor = COLORS.cardBackground)}
                                    >
                                      <td style={{ padding: '12px 16px', width: 40 }}>
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleSelectModule(mod.id)}
                                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                                        />
                                      </td>
                                      <td style={{ padding: '12px 12px', width: 50 }}>
                                        <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.pageBackground }}>
                                          <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.secondaryText }}>{mod.icon_key?.slice(0, 2) || '?'}</span>
                                        </div>
                                      </td>
                                      <td style={{ padding: '12px 12px', minWidth: 140 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.primaryText, lineHeight: 1.4 }}>{mod.name}</span>
                                      </td>
                                      <td style={{ padding: '12px 12px', minWidth: 140 }}>
                                        <span style={{ fontSize: 13, color: COLORS.tertiaryText, fontFamily: 'monospace' }}>{mod.path}</span>
                                      </td>
                                      <td style={{ padding: '12px 12px', flex: 1 }}>
                                        <span style={{ fontSize: 13, color: COLORS.secondaryText, lineHeight: 1.4 }}>{mod.description || '-'}</span>
                                      </td>
                                      <td style={{ padding: '12px 12px', width: 120, textAlign: 'center' }}>
                                        <select
                                          value={mod.plan_group || 'free'}
                                          onChange={(e) => updateModulePlan(mod.id, e.target.value)}
                                          style={{
                                            fontSize: 12,
                                            fontWeight: 600,
                                            padding: '6px 10px',
                                            borderRadius: 6,
                                            border: `1px solid ${COLORS.cardBorder}`,
                                            cursor: 'pointer',
                                            backgroundColor: 'white',
                                            color: COLORS.primaryText
                                          }}
                                        >
                                          {PLANS.map(p => (
                                            <option key={p.key} value={p.key}>{p.label}</option>
                                          ))}
                                        </select>
                                      </td>
                                      <td style={{ padding: '12px 12px', width: 44 }}>
                                        <button
                                          onClick={() => startEditModule(mod)}
                                          style={{
                                            padding: 8,
                                            borderRadius: 6,
                                            color: COLORS.cardBorder,
                                            backgroundColor: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = COLORS.pageBackground
                                            e.currentTarget.style.color = COLORS.secondaryText
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent'
                                            e.currentTarget.style.color = COLORS.cardBorder
                                          }}
                                          title="모듈 수정"
                                        >
                                          <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 모듈 수정 모달 */}
            {editingModule && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setEditingModule(null)}>
                <div style={{ backgroundColor: COLORS.cardBackground, width: '100%', maxWidth: 480, borderRadius: COLORS.borderRadius, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: 28 }} onClick={(e) => e.stopPropagation()}>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: COLORS.primaryText, marginBottom: 20 }}>모듈 수정</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: COLORS.secondaryText, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>모듈 이름</label>
                      <input value={moduleForm.name} onChange={(e) => setModuleForm(f => ({ ...f, name: e.target.value }))}
                        style={{ width: '100%', padding: '10px 12px', border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, fontSize: 14, color: COLORS.primaryText }} placeholder="예: 차량 관리" />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: COLORS.secondaryText, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>경로 (path)</label>
                      <input value={moduleForm.path} onChange={(e) => setModuleForm(f => ({ ...f, path: e.target.value }))}
                        style={{ width: '100%', padding: '10px 12px', border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, fontSize: 14, fontFamily: 'monospace', color: COLORS.primaryText }} placeholder="예: /cars" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: COLORS.secondaryText, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>아이콘</label>
                        <select value={moduleForm.icon_key} onChange={(e) => setModuleForm(f => ({ ...f, icon_key: e.target.value }))}
                          style={{ width: '100%', padding: '10px 12px', border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, fontSize: 14, color: COLORS.primaryText }}>
                          {ICON_OPTIONS.map(icon => <option key={icon} value={icon}>{icon}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: COLORS.secondaryText, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>플랜 그룹</label>
                        <select value={moduleForm.plan_group} onChange={(e) => setModuleForm(f => ({ ...f, plan_group: e.target.value }))}
                          style={{ width: '100%', padding: '10px 12px', border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, fontSize: 14, color: COLORS.primaryText }}>
                          {PLANS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: COLORS.secondaryText, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>설명 (선택)</label>
                      <input value={moduleForm.description} onChange={(e) => setModuleForm(f => ({ ...f, description: e.target.value }))}
                        style={{ width: '100%', padding: '10px 12px', border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, fontSize: 14, color: COLORS.primaryText }} placeholder="모듈 설명" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                    <button onClick={() => setEditingModule(null)}
                      style={{ flex: 1, padding: '12px 16px', backgroundColor: COLORS.pageBackground, color: COLORS.secondaryText, borderRadius: 8, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'background-color 0.2s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = COLORS.cardBorder)}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = COLORS.pageBackground)}
                    >취소</button>
                    <button onClick={saveEditModule}
                      style={{ flex: 1, padding: '12px 16px', backgroundColor: COLORS.secondaryText, color: 'white', borderRadius: 8, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'background-color 0.2s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = COLORS.secondaryText)}
                    >저장</button>
                  </div>
                </div>
              </div>
            )}

            {/* 플랜별 배분 결과 카드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginTop: 32 }}>
              {PLANS.map(plan => {
                const planModules = modules.filter(m => (m.plan_group || 'free') === plan.key)
                const planIdx = getPlanIndex(plan.key)
                const cumulativeCount = modules.filter(m => getPlanIndex(m.plan_group || 'free') <= planIdx).length

                return (
                  <div key={plan.key} style={{ borderRadius: COLORS.borderRadius, border: `1px solid ${COLORS.cardBorder}`, overflow: 'hidden', backgroundColor: COLORS.cardBackground }}>
                    {/* 플랜 헤더 */}
                    <div style={{ padding: 16, borderBottom: `1px solid ${COLORS.cardBorder}`, backgroundColor: COLORS.pageBackground }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: COLORS.primaryText }}></span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.primaryText }}>{plan.label}</span>
                      </div>
                      <div style={{ fontSize: 13, color: COLORS.secondaryText, lineHeight: 1.5 }}>
                        고유 <strong>{planModules.length}개</strong>
                        {planIdx > 0 && (
                          <span style={{ marginLeft: 12 }}>/ 누적 <strong>{cumulativeCount}개</strong></span>
                        )}
                      </div>
                    </div>

                    {/* 이 플랜 고유 모듈 */}
                    <div style={{ padding: 16, backgroundColor: COLORS.cardBackground }}>
                      {planModules.length === 0 ? (
                        <p style={{ fontSize: 13, color: COLORS.tertiaryText, padding: '16px 0', textAlign: 'center' }}>배분된 모듈 없음</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {planModules.map(mod => (
                            <div key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, backgroundColor: COLORS.pageBackground, border: `1px solid ${COLORS.cardBorder}`, transition: 'all 0.2s' }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = COLORS.pageBackground)}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.primaryText, lineHeight: 1.3 }}>{mod.name}</div>
                                <div style={{ fontSize: 12, color: COLORS.tertiaryText, fontFamily: 'monospace', lineHeight: 1.2 }}>{mod.path}</div>
                              </div>
                              <button onClick={() => startEditModule(mod)}
                                style={{ padding: 6, borderRadius: 6, color: COLORS.cardBorder, backgroundColor: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s' }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = COLORS.pageBackground
                                  e.currentTarget.style.color = COLORS.secondaryText
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent'
                                  e.currentTarget.style.color = COLORS.cardBorder
                                }}
                                title="수정">
                                <svg style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 하위 플랜에서 상속받는 모듈 */}
                      {planIdx > 0 && (() => {
                        const inherited = modules.filter(m => getPlanIndex(m.plan_group || 'free') < planIdx)
                        return inherited.length > 0 ? (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${COLORS.cardBorder}` }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.tertiaryText, textTransform: 'uppercase', marginBottom: 8 }}>하위 플랜 포함</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {inherited.map(mod => (
                                <span key={mod.id} style={{ fontSize: 12, padding: '5px 10px', backgroundColor: COLORS.pageBackground, color: COLORS.secondaryText, borderRadius: 6, fontWeight: 500, lineHeight: 1, border: `1px solid ${COLORS.cardBorder}` }}>
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
            {/* 필터 칩 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
              {[
                { key: 'active' as const, label: '승인된 회사', count: companies.filter(c => c.is_active).length },
                { key: 'all' as const, label: '전체', count: companies.length },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 20,
                    fontSize: 13,
                    fontWeight: 600,
                    backgroundColor: filter === f.key ? COLORS.activeChip : COLORS.inactiveChip,
                    color: filter === f.key ? 'white' : COLORS.inactiveChipText,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {f.label} <strong style={{ marginLeft: 4 }}>({f.count})</strong>
                </button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 13, color: COLORS.secondaryText }}>{modules.length}개 모듈</span>
            </div>

            {/* 회사 카드 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {filteredCompanies.map(comp => {
                const activeCount = getActiveCount(comp.id)
                const planInfo = getPlanInfo(comp.plan || 'free')
                const companyPlanIdx = getPlanIndex(comp.plan || 'free')

                return (
                  <div key={comp.id} style={{
                    backgroundColor: COLORS.cardBackground,
                    borderRadius: COLORS.borderRadius,
                    border: !comp.is_active ? '2px solid #fcd34d' : `1px solid ${COLORS.cardBorder}`,
                    overflow: 'hidden',
                    opacity: !comp.is_active ? 0.65 : 1
                  }}>
                    {/* 회사 헤더 */}
                    <div style={{ padding: 20, borderBottom: `1px solid ${COLORS.cardBorder}`, backgroundColor: COLORS.pageBackground }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                        <div style={{
                          width: 48,
                          height: 48,
                          borderRadius: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 800,
                          fontSize: 18,
                          flexShrink: 0,
                          backgroundColor: comp.is_active ? COLORS.secondaryText : '#eab308'
                        }}>
                          {comp.name[0]}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, color: COLORS.primaryText, fontSize: 16 }}>{comp.name}</span>
                            {/* 플랜 선택 드롭다운 */}
                            <select
                              value={comp.plan || 'free'}
                              onChange={(e) => updateCompanyPlan(comp.id, e.target.value)}
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: `1px solid ${COLORS.cardBorder}`,
                                cursor: 'pointer',
                                backgroundColor: 'white',
                                color: COLORS.primaryText
                              }}
                            >
                              {PLANS.map(p => (
                                <option key={p.key} value={p.key}>{p.label}</option>
                              ))}
                            </select>
                            {!comp.is_active && (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 6, backgroundColor: '#fef3c7', color: '#92400e' }}>승인 대기</span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, color: COLORS.secondaryText, fontWeight: 500 }}>
                            활성 모듈: <strong style={{ color: COLORS.primaryText }}>{activeCount}</strong>/{modules.length}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                          <button
                            onClick={() => toggleAllForCompany(comp.id, true)}
                            style={{
                              padding: '8px 14px',
                              fontSize: 12,
                              fontWeight: 600,
                              backgroundColor: '#dcfce7',
                              color: '#166534',
                              borderRadius: 6,
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s',
                              whiteSpace: 'nowrap'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#bbf7d0')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#dcfce7')}
                          >
                            전체 ON
                          </button>
                          <button
                            onClick={() => toggleAllForCompany(comp.id, false)}
                            style={{
                              padding: '8px 14px',
                              fontSize: 12,
                              fontWeight: 600,
                              backgroundColor: '#fee2e2',
                              color: '#991b1b',
                              borderRadius: 6,
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s',
                              whiteSpace: 'nowrap'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fecaca')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fee2e2')}
                          >
                            전체 OFF
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 모듈 그리드 (그룹별) */}
                    <div style={{ padding: 20 }}>
                      {groupedModules.map(group => (
                        <div key={group.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: group.id === groupedModules[groupedModules.length - 1].id ? 'none' : `1px solid ${COLORS.cardBorder}` }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.secondaryText, textTransform: 'uppercase', marginBottom: 12, paddingLeft: 0 }}>{group.emoji} {group.label}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                            {group.items.map(mod => {
                              const isActive = !!matrix[`${comp.id}_${mod.id}`]
                              const modPlan = getPlanInfo(mod.plan_group || 'free')
                              const modulePlanIdx = getPlanIndex(mod.plan_group || 'free')
                              const planIncluded = modulePlanIdx <= companyPlanIdx

                              // Determine status
                              let statusColor = '#e2e8f0'
                              let statusBg = 'white'
                              let statusOpacity = 0.5
                              let statusLabel = ''

                              if (planIncluded && isActive) {
                                // Module ON and included in plan (expected)
                                statusColor = '#3b82f6'
                                statusBg = '#eff6ff'
                                statusOpacity = 1
                                statusLabel = '정상'
                              } else if (planIncluded && !isActive) {
                                // Module OFF but included in plan (warning)
                                statusColor = '#dc2626'
                                statusBg = '#fef2f2'
                                statusOpacity = 1
                                statusLabel = '⚠ 미활성'
                              } else if (!planIncluded && isActive) {
                                // Module ON but not in plan (override)
                                statusColor = '#f97316'
                                statusBg = '#fff7ed'
                                statusOpacity = 1
                                statusLabel = '수동활성'
                              } else {
                                // Module OFF and not in plan (normal)
                                statusColor = '#cbd5e1'
                                statusBg = '#f1f5f9'
                                statusOpacity = 0.5
                                statusLabel = ''
                              }

                              return (
                                <button
                                  key={mod.id}
                                  onClick={() => toggleModule(comp.id, mod.id, isActive)}
                                  style={{
                                    padding: 12,
                                    borderRadius: 10,
                                    border: `2px solid ${statusColor}`,
                                    backgroundColor: statusBg,
                                    textAlign: 'left',
                                    transition: 'all 0.2s',
                                    opacity: statusOpacity,
                                    cursor: 'pointer',
                                    color: COLORS.primaryText
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                  onMouseLeave={(e) => (e.currentTarget.style.opacity = String(statusOpacity))}
                                >
                                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.primaryText, lineHeight: 1.3 }}>{mod.name}</span>
                                    <div style={{
                                      width: 18,
                                      height: 18,
                                      borderRadius: '50%',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      backgroundColor: statusColor,
                                      flexShrink: 0,
                                      marginTop: 1
                                    }}>
                                      {isActive && <svg style={{ width: 11, height: 11, color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, color: COLORS.tertiaryText, fontFamily: 'monospace' }}>{mod.path}</span>
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, backgroundColor: COLORS.pageBackground, color: COLORS.secondaryText, display: 'inline-block' }}>
                                    {modPlan.label}
                                  </span>
                                  {statusLabel && (
                                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6, color: statusColor }}>
                                      {statusLabel}
                                    </div>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {filteredCompanies.length === 0 && (
                <div style={{ backgroundColor: COLORS.cardBackground, borderRadius: COLORS.borderRadius, border: `1px solid ${COLORS.cardBorder}`, padding: 48, textAlign: 'center' }}>
                  <p style={{ color: COLORS.tertiaryText, fontWeight: 600, fontSize: 14 }}>해당 조건의 회사가 없습니다</p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

