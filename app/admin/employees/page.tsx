'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import type { Position, Department } from '../../types/rbac'
import InviteModal from '../../components/InviteModal'

// ============================================
// 조직/권한 통합 관리 페이지 (2-Tab 구조)
// Tab 1: 조직 관리 (직원, 직급, 부서, 초대)
// Tab 2: 페이지 권한 (사용자별 직접 설정)
// master/god_admin만 접근 가능
// ============================================

const DATA_SCOPES = [
  { value: 'all', label: '전체 데이터' },
  { value: 'department', label: '부서만' },
  { value: 'own', label: '본인만' },
]

type ActiveModule = { path: string; name: string; group: string }

const MODULE_GROUPS: Record<string, string> = {
  '/registration': '차량 자산', '/insurance': '차량 자산',
  '/quotes': '대고객 영업', '/customers': '대고객 영업', '/contracts': '대고객 영업',
  '/jiip': '파트너 자금', '/invest': '파트너 자금', '/loans': '파트너 자금',
  '/finance': '경영 지원', '/finance/upload': '경영 지원',
}

type UserPermMap = {
  [pagePath: string]: {
    can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean
    data_scope: string; id?: string
  }
}

const ROLE_LABELS: Record<string, { label: string; bg: string }> = {
  god_admin: { label: 'GOD ADMIN', bg: 'bg-sky-100 text-sky-700' },
  master:    { label: '관리자', bg: 'bg-steel-100 text-steel-700' },
  user:      { label: '직원', bg: 'bg-slate-100 text-slate-600' },
}

export default function OrgManagementPage() {
  const { user, company, role, adminSelectedCompanyId } = useApp()

  // 기본 데이터
  const [employees, setEmployees] = useState<any[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeModules, setActiveModules] = useState<ActiveModule[]>([])
  const [invitations, setInvitations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 탭 상태
  const [activeTab, setActiveTab] = useState<'organization' | 'permissions'>('organization')

  // === Tab 1: 조직 관리 ===
  const [editingEmp, setEditingEmp] = useState<any | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [loadingInvitations, setLoadingInvitations] = useState(false)
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const [newPositionName, setNewPositionName] = useState('')
  const [newPositionLevel, setNewPositionLevel] = useState(4)
  const [newDeptName, setNewDeptName] = useState('')

  // === Tab 2: 페이지 권한 (좌우 분할) ===
  // allUserPerms: { [userId]: { [pagePath]: UserPermMap } }
  const [allUserPerms, setAllUserPerms] = useState<Record<string, UserPermMap>>({})
  const [savingPermsFor, setSavingPermsFor] = useState<string | null>(null)
  const [selectedPermUserId, setSelectedPermUserId] = useState<string | null>(null)

  const activeCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  useEffect(() => {
    if (role === 'god_admin') {
      if (adminSelectedCompanyId) {
        loadAll()
      } else {
        setEmployees([])
        setPositions([])
        setDepartments([])
        setActiveModules([])
        setInvitations([])
        setLoading(false)
      }
    } else if (company) {
      loadAll()
    }
  }, [company, role, adminSelectedCompanyId])

  useEffect(() => {
    if (activeTab === 'organization' && activeCompanyId && ['god_admin', 'master'].includes(role || '')) {
      loadInvitations()
    }
  }, [activeTab, activeCompanyId, role])

  // 권한 탭 진입 시 전체 직원 권한 로드
  useEffect(() => {
    if (activeTab === 'permissions' && activeCompanyId) {
      loadAllUserPermissions()
    }
  }, [activeTab, activeCompanyId])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([
      loadEmployees(),
      loadPositions(),
      loadDepartments(),
      loadModules(),
    ])
    setLoading(false)
  }

  const loadEmployees = async () => {
    if (!activeCompanyId) return
    const { data } = await supabase
      .from('profiles')
      .select('*, companies(*), position:positions(*), department:departments(*)')
      .eq('company_id', activeCompanyId)
      .order('created_at', { ascending: false })
    setEmployees(data || [])
  }

  const loadPositions = async () => {
    if (!activeCompanyId) return
    const { data } = await supabase.from('positions').select('*').eq('company_id', activeCompanyId).order('level')
    setPositions(data || [])
  }

  const loadDepartments = async () => {
    if (!activeCompanyId) return
    const { data } = await supabase.from('departments').select('*').eq('company_id', activeCompanyId).order('name')
    setDepartments(data || [])
  }

  const loadModules = async () => {
    if (!activeCompanyId) return
    const { data } = await supabase
      .from('company_modules')
      .select('module:system_modules(path, name)')
      .eq('company_id', activeCompanyId)
      .eq('is_active', true)

    if (data) {
      const modules: ActiveModule[] = data
        .filter((m: any) => m.module?.path)
        .map((m: any) => ({
          path: m.module.path,
          name: m.module.name,
          group: MODULE_GROUPS[m.module.path] || '기타',
        }))
      setActiveModules(modules)
    }
  }

  // ===== 전체 직원 권한 로드 =====
  const loadAllUserPermissions = async () => {
    if (!activeCompanyId) return
    const { data } = await supabase
      .from('user_page_permissions')
      .select('*')
      .eq('company_id', activeCompanyId)

    const permsMap: Record<string, UserPermMap> = {}
    data?.forEach((p: any) => {
      if (!permsMap[p.user_id]) permsMap[p.user_id] = {}
      permsMap[p.user_id][p.page_path] = {
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete,
        data_scope: p.data_scope || 'all',
        id: p.id,
      }
    })
    setAllUserPerms(permsMap)
  }

  // ===== 특정 직원 권한 저장 =====
  const saveUserPerms = async (userId: string) => {
    if (!activeCompanyId) return
    setSavingPermsFor(userId)

    try {
      await supabase.from('user_page_permissions').delete().eq('user_id', userId)

      const userMap = allUserPerms[userId] || {}
      const toInsert = Object.entries(userMap)
        .filter(([_, p]) => p.can_view || p.can_create || p.can_edit || p.can_delete)
        .map(([pagePath, p]) => ({
          company_id: activeCompanyId,
          user_id: userId,
          page_path: pagePath,
          can_view: p.can_view,
          can_create: p.can_create,
          can_edit: p.can_edit,
          can_delete: p.can_delete,
          data_scope: p.data_scope,
        }))

      if (toInsert.length > 0) {
        const { error } = await supabase.from('user_page_permissions').insert(toInsert)
        if (error) throw error
      }
      alert('권한이 저장되었습니다.')
    } catch (error: any) {
      alert('저장 실패: ' + error.message)
    } finally {
      setSavingPermsFor(null)
    }
  }

  // 매트릭스 뷰: 페이지 ON/OFF
  const matrixTogglePage = (userId: string, pagePath: string) => {
    setAllUserPerms(prev => {
      const userMap = { ...(prev[userId] || {}) }
      if (userMap[pagePath]?.can_view) {
        delete userMap[pagePath]
      } else {
        userMap[pagePath] = { can_view: true, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
      }
      return { ...prev, [userId]: userMap }
    })
  }

  // 상세 CRUD 토글
  const matrixTogglePerm = (userId: string, pagePath: string, field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete') => {
    setAllUserPerms(prev => {
      const userMap = { ...(prev[userId] || {}) }
      const current = userMap[pagePath] || { can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
      userMap[pagePath] = { ...current, [field]: !current[field] }
      return { ...prev, [userId]: userMap }
    })
  }

  // 데이터 범위 변경
  const matrixChangeScope = (userId: string, pagePath: string, scope: string) => {
    setAllUserPerms(prev => {
      const userMap = { ...(prev[userId] || {}) }
      const current = userMap[pagePath] || { can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
      userMap[pagePath] = { ...current, data_scope: scope }
      return { ...prev, [userId]: userMap }
    })
  }

  // ===== 초대 관리 =====
  // ★ 세션 토큰 안전하게 가져오기 (만료 시 자동 갱신)
  const getAccessToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) return session.access_token
    // 세션 없으면 갱신 시도
    const { data: { session: refreshed } } = await supabase.auth.refreshSession()
    return refreshed?.access_token || ''
  }

  const loadInvitations = async () => {
    if (!activeCompanyId || !['god_admin', 'master'].includes(role || '')) return
    setLoadingInvitations(true)
    try {
      const token = await getAccessToken()
      if (!token) { console.error('No valid session token'); setInvitations([]); return }
      const response = await fetch(`/api/member-invite?company_id=${activeCompanyId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const result = await response.json()
      if (response.ok) setInvitations(result.data || [])
      else { console.error('Failed to load invitations:', response.status, result.error); setInvitations([]) }
    } catch (error) {
      console.error('Error loading invitations:', error)
      setInvitations([])
    } finally {
      setLoadingInvitations(false)
    }
  }

  const cancelInvitation = async (id: string) => {
    if (!confirm('이 초대를 취소하시겠습니까?')) return
    setCancelingId(id)
    try {
      const token = await getAccessToken()
      const response = await fetch(`/api/member-invite?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (response.ok) loadInvitations()
      else alert('초대 취소 실패: ' + response.statusText)
    } catch (error) {
      alert('초대 취소 중 오류가 발생했습니다.')
    } finally {
      setCancelingId(null)
    }
  }

  // ===== 직원 수정 모달 =====
  const openEditModal = (emp: any) => {
    setEditingEmp(emp)
    setEditForm({
      employee_name: emp.employee_name || '',
      phone: emp.phone || '',
      position_id: emp.position_id || '',
      department_id: emp.department_id || '',
      role: emp.role || 'user',
      is_active: emp.is_active !== false,
    })
  }

  const closeEditModal = () => {
    setEditingEmp(null)
    setEditForm({})
    setSavingEdit(false)
  }

  const saveEdit = async () => {
    if (!editingEmp) return
    if (role === 'master' && editForm.role === 'god_admin') {
      alert('god_admin 권한은 부여할 수 없습니다.')
      return
    }
    setSavingEdit(true)

    const payload = {
      ...editForm,
      position_id: editForm.position_id || null,
      department_id: editForm.department_id || null,
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', editingEmp.id)
      .select()

    if (error) {
      alert('저장 실패: ' + error.message)
      setSavingEdit(false)
    } else if (!data || data.length === 0) {
      alert('저장 실패: 권한이 없거나 대상을 찾을 수 없습니다.')
      setSavingEdit(false)
    } else {
      closeEditModal()
      loadEmployees()
    }
  }

  // ===== 직원 탈퇴 =====
  const withdrawEmployee = async (deleteAuth: boolean) => {
    if (!editingEmp) return
    const name = editingEmp.employee_name || editingEmp.email
    const confirmMsg = deleteAuth
      ? `⚠️ ${name} 직원을 완전 탈퇴(계정 삭제) 처리하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`
      : `${name} 직원을 탈퇴 처리하시겠습니까?\n\n회사 연결이 해제되고 비활성 상태로 변경됩니다.`

    if (!confirm(confirmMsg)) return
    setWithdrawing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/employees/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ employee_id: editingEmp.id, delete_auth: deleteAuth }),
      })
      const result = await res.json()
      if (res.ok) {
        alert(result.message || '탈퇴 처리가 완료되었습니다.')
        closeEditModal()
        loadEmployees()
      } else {
        alert('탈퇴 실패: ' + (result.error || '알 수 없는 오류'))
      }
    } catch (error: any) {
      alert('탈퇴 처리 중 오류: ' + error.message)
    } finally {
      setWithdrawing(false)
    }
  }

  // ===== 직급 관리 =====
  const addPosition = async () => {
    if (!newPositionName.trim() || !activeCompanyId) return
    const { error } = await supabase.from('positions').insert({
      company_id: activeCompanyId, name: newPositionName.trim(), level: newPositionLevel,
    })
    if (error) alert('직급 추가 실패: ' + error.message)
    else { setNewPositionName(''); setNewPositionLevel(4); loadPositions() }
  }

  const deletePosition = async (id: string) => {
    if (!confirm('이 직급을 삭제하시겠습니까?')) return
    await supabase.from('positions').delete().eq('id', id)
    loadPositions()
  }

  // ===== 부서 관리 =====
  const addDepartment = async () => {
    if (!newDeptName.trim() || !activeCompanyId) return
    const { error } = await supabase.from('departments').insert({
      company_id: activeCompanyId, name: newDeptName.trim(),
    })
    if (error) alert('부서 추가 실패: ' + error.message)
    else { setNewDeptName(''); loadDepartments() }
  }

  const deleteDepartment = async (id: string) => {
    if (!confirm('이 부서를 삭제하시겠습니까?')) return
    await supabase.from('departments').delete().eq('id', id)
    loadDepartments()
  }

  // 날짜 포맷
  const formatDate = (d: string) => {
    if (!d) return '-'
    return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600"></div>
      </div>
    )
  }

  const pendingInvitationCount = invitations.filter((inv: any) => inv.status === 'pending').length
  const moduleGroups = [...new Set(activeModules.map(m => m.group))]

  // 선택 가능한 직원 목록 (god_admin/master 제외 - 이미 전체 접근)
  const assignableEmployees = employees.filter(e => e.role === 'user' && e.is_active !== false)

  const TABS = [
    { key: 'organization' as const, label: '조직 관리', count: employees.length },
    { key: 'permissions' as const, label: '페이지 권한', count: assignableEmployees.length },
  ]

  // ── 직원 카드 (공용 컴포넌트) ──
  const EmployeeCard = ({ emp }: { emp: any }) => {
    const r = ROLE_LABELS[emp.role] || ROLE_LABELS.user
    return (
      <div
        className="flex items-center gap-3 p-3 md:p-4 hover:bg-slate-50/70 transition-colors cursor-pointer group"
        onClick={() => openEditModal(emp)}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0 ${
          emp.role === 'god_admin' ? 'bg-sky-500' :
          emp.role === 'master' ? 'bg-steel-600' :
          'bg-slate-400'
        }`}>
          {(emp.employee_name || emp.email || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-slate-900 truncate">{emp.employee_name || '(이름 미설정)'}</span>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${r.bg}`}>{r.label}</span>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${emp.is_active !== false ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              {emp.is_active !== false ? '활성' : '비활성'}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5 truncate">{emp.email}</div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {emp.position?.name && (
              <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{emp.position.name}</span>
            )}
            {emp.department?.name && (
              <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{emp.department.name}</span>
            )}
            {emp.phone && (
              <span className="text-xs text-slate-400">{emp.phone}</span>
            )}
          </div>
        </div>
        <div className="hidden md:block text-right flex-shrink-0">
          <div className="text-xs text-slate-400">{formatDate(emp.created_at)}</div>
        </div>
        <div className="text-slate-300 group-hover:text-steel-500 transition-colors flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">

        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'left' }}>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">🏢 조직/권한 관리</h1>
            <p className="text-gray-500 text-sm mt-1">직원 관리 및 페이지 권한 설정</p>
          </div>
        </div>
        {role === 'god_admin' && !adminSelectedCompanyId && (
          <div className="mt-4 p-4 bg-steel-50 border border-steel-200 rounded-xl">
            <p className="text-sm font-bold text-steel-700">사이드바에서 회사를 선택해주세요.</p>
            <p className="text-xs text-steel-500 mt-1">조직/권한 관리는 특정 회사를 선택한 상태에서 이용 가능합니다.</p>
          </div>
        )}

        {role === 'god_admin' && !adminSelectedCompanyId ? null : (
          <>
            {/* 탭 */}
            <div className="flex gap-1.5 md:gap-2 mb-5 md:mb-6">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 md:gap-2 whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'bg-steel-900 text-white'
                      : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'
                  }`}>{tab.count}</span>
                </button>
              ))}
            </div>

            {/* ================================================================ */}
            {/* Tab 1: 조직 관리 (직원, 직급, 부서, 초대) */}
            {/* ================================================================ */}
            {activeTab === 'organization' && (
              <div className="space-y-4 md:space-y-6">
                {/* 직원 목록 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 md:p-5 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h2 className="text-base md:text-lg font-bold text-slate-900">직원 목록</h2>
                  <p className="text-xs text-slate-400 mt-0.5">총 {employees.length}명 · 클릭하여 수정</p>
                </div>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="px-4 py-2.5 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-colors flex items-center gap-2 active:scale-95"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  초대
                </button>
                </div>

                <div className="hidden md:flex items-center px-4 py-2 bg-slate-50/80 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <div className="w-10 mr-3"></div>
                  <div className="flex-1">이름 / 이메일 / 소속</div>
                  <div className="w-24 text-right mr-8">가입일</div>
                  <div className="w-4"></div>
                </div>

                <div className="divide-y divide-slate-100">
                  {employees.map(emp => (
                    <EmployeeCard key={emp.id} emp={emp} />
                  ))}
                  {employees.length === 0 && (
                    <div className="p-10 text-center text-slate-400 text-sm">등록된 직원이 없습니다.</div>
                  )}
                </div>
              </div>

              {/* 직급 · 부서 관리 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* 직급 관리 */}
                <div className="space-y-3 md:space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5">
                    <h2 className="text-sm md:text-base font-bold mb-3">직급 추가</h2>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 min-w-0">
                        <label className="text-xs font-bold text-slate-400 block mb-1">직급명</label>
                        <input value={newPositionName} onChange={e => setNewPositionName(e.target.value)}
                          className="w-full border rounded-xl px-3 py-2.5 text-sm focus:border-steel-400 focus:ring-1 focus:ring-steel-400 outline-none transition-colors" placeholder="예: 과장" />
                      </div>
                      <div className="w-20 md:w-24">
                        <label className="text-xs font-bold text-slate-400 block mb-1">레벨</label>
                        <input type="number" min={1} max={10} value={newPositionLevel}
                          onChange={e => setNewPositionLevel(Number(e.target.value))}
                          className="w-full border rounded-xl px-3 py-2.5 text-sm focus:border-steel-400 focus:ring-1 focus:ring-steel-400 outline-none transition-colors" />
                      </div>
                      <button onClick={addPosition} className="py-2.5 px-5 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-colors flex-shrink-0 active:scale-95">
                        추가
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="p-3 md:p-4 border-b border-slate-100">
                      <h3 className="text-xs md:text-sm font-bold text-slate-500">직급 목록 ({positions.length})</h3>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {positions.map(pos => (
                        <div key={pos.id} className="flex items-center justify-between px-3 md:px-4 py-2.5 md:py-3 hover:bg-slate-50/50">
                          <div className="flex items-center gap-2 md:gap-3">
                            <span className="bg-steel-100 text-steel-700 text-xs font-bold px-2 py-0.5 rounded w-12 text-center">Lv.{pos.level}</span>
                            <span className="font-bold text-sm text-slate-800">{pos.name}</span>
                          </div>
                          <button onClick={() => deletePosition(pos.id)} className="text-xs font-bold text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg active:scale-95 transition-all">삭제</button>
                        </div>
                      ))}
                      {positions.length === 0 && (
                        <div className="p-6 text-center text-slate-400 text-sm">직급이 없습니다.</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 부서 관리 */}
                <div className="space-y-3 md:space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5">
                    <h2 className="text-sm md:text-base font-bold mb-3">부서 추가</h2>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 min-w-0">
                        <label className="text-xs font-bold text-slate-400 block mb-1">부서명</label>
                        <input value={newDeptName} onChange={e => setNewDeptName(e.target.value)}
                          className="w-full border rounded-xl px-3 py-2.5 text-sm focus:border-steel-400 focus:ring-1 focus:ring-steel-400 outline-none transition-colors" placeholder="예: 영업팀" />
                      </div>
                      <button onClick={addDepartment} className="py-2.5 px-5 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-colors flex-shrink-0 active:scale-95">
                        추가
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="p-3 md:p-4 border-b border-slate-100">
                      <h3 className="text-xs md:text-sm font-bold text-slate-500">부서 목록 ({departments.length})</h3>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {departments.map(dept => (
                        <div key={dept.id} className="flex items-center justify-between px-3 md:px-4 py-2.5 md:py-3 hover:bg-slate-50/50">
                          <span className="font-bold text-sm text-slate-800">{dept.name}</span>
                          <button onClick={() => deleteDepartment(dept.id)} className="text-xs font-bold text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg active:scale-95 transition-all">삭제</button>
                        </div>
                      ))}
                      {departments.length === 0 && (
                        <div className="p-6 text-center text-slate-400 text-sm">부서가 없습니다.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 초대 관리 */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 md:p-5 border-b border-slate-100">
                  <h2 className="text-base md:text-lg font-bold text-slate-900">초대 관리</h2>
                  <p className="text-xs text-slate-400 mt-0.5">총 {invitations.length}개 · 대기중: {pendingInvitationCount}개</p>
                </div>

                {loadingInvitations ? (
                  <div className="p-10 text-center">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-steel-600"></div>
                    <p className="text-slate-400 text-sm mt-2">초대 정보를 불러오는 중...</p>
                  </div>
                ) : invitations.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 text-sm">초대된 회원이 없습니다.</div>
                ) : (
                  <>
                    <div className="hidden md:flex items-center px-4 py-2 bg-slate-50/80 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                      <div className="flex-1">이메일</div>
                      <div className="w-24">부서</div>
                      <div className="w-20">직급</div>
                      <div className="w-16">역할</div>
                      <div className="w-20">상태</div>
                      <div className="w-28">생성일</div>
                      <div className="w-28">만료일</div>
                      <div className="w-16">작업</div>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {invitations.map((inv: any) => {
                        const STATUS_MAP: Record<string, { label: string; color: string }> = {
                          pending: { label: '대기중', color: 'bg-yellow-100 text-yellow-700' },
                          accepted: { label: '수락', color: 'bg-green-100 text-green-700' },
                          expired: { label: '만료', color: 'bg-red-100 text-red-700' },
                          canceled: { label: '취소', color: 'bg-gray-100 text-gray-700' },
                        }
                        const statusInfo = STATUS_MAP[inv.status] || { label: inv.status, color: 'bg-gray-100 text-gray-700' }
                        return (
                          <div key={inv.id} className="flex items-center gap-3 p-3 md:p-4 hover:bg-slate-50/70 transition-colors">
                            {/* 모바일 */}
                            <div className="md:hidden flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                <span className="font-bold text-sm text-slate-900 truncate">{inv.email}</span>
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${statusInfo.color}`}>{statusInfo.label}</span>
                              </div>
                              <div className="text-xs text-slate-600 space-y-1">
                                {inv.department?.name && <div>부서: {inv.department.name}</div>}
                                {inv.position?.name && <div>직급: {inv.position.name}</div>}
                                <div>역할: {ROLE_LABELS[inv.role]?.label || inv.role}</div>
                                <div className="text-slate-400">생성: {formatDate(inv.created_at)} · 만료: {formatDate(inv.expires_at)}</div>
                              </div>
                              {inv.status === 'pending' && (
                                <button onClick={() => cancelInvitation(inv.id)} disabled={cancelingId === inv.id}
                                  className="mt-2 text-xs font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg active:scale-95 transition-all disabled:opacity-50">
                                  {cancelingId === inv.id ? '취소 중...' : '취소'}
                                </button>
                              )}
                            </div>
                            {/* 데스크톱 */}
                            <div className="hidden md:contents">
                              <div className="flex-1"><span className="text-sm font-bold text-slate-900">{inv.email}</span></div>
                              <div className="w-24"><span className="text-xs text-slate-600">{inv.department?.name || '-'}</span></div>
                              <div className="w-20"><span className="text-xs text-slate-600">{inv.position?.name || '-'}</span></div>
                              <div className="w-16"><span className="text-xs font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{ROLE_LABELS[inv.role]?.label || inv.role}</span></div>
                              <div className="w-20"><span className={`text-xs font-bold px-1.5 py-0.5 rounded ${statusInfo.color}`}>{statusInfo.label}</span></div>
                              <div className="w-28"><span className="text-xs text-slate-600">{formatDate(inv.created_at)}</span></div>
                              <div className="w-28"><span className="text-xs text-slate-600">{formatDate(inv.expires_at)}</span></div>
                              <div className="w-16">
                                {inv.status === 'pending' && (
                                  <button onClick={() => cancelInvitation(inv.id)} disabled={cancelingId === inv.id}
                                    className="text-xs font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg active:scale-95 transition-all disabled:opacity-50">
                                    {cancelingId === inv.id ? '취소 중...' : '취소'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
            )}

            {/* ================================================================ */}
            {/* Tab 2: 페이지 권한 (좌우 분할 마스터-디테일) */}
            {/* ================================================================ */}
            {activeTab === 'permissions' && (
              <div className="space-y-4">
                {assignableEmployees.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 md:p-12 text-center">
                    <p className="text-slate-400 text-sm">권한을 설정할 일반 직원이 없습니다.</p>
                    <p className="text-xs text-slate-300 mt-1">관리자(master)와 GOD ADMIN은 항상 전체 접근 권한을 가집니다.</p>
                  </div>
                ) : activeModules.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                    <p className="text-slate-400 text-sm">활성화된 모듈이 없습니다.</p>
                  </div>
                ) : (
                  <div className="flex flex-col lg:flex-row gap-4 lg:gap-0 lg:h-[calc(100vh-200px)]">

                    {/* ── 좌측: 직원 목록 (고정) ── */}
                    <div className="lg:w-72 xl:w-80 flex-shrink-0 bg-white rounded-2xl lg:rounded-r-none border border-slate-200 overflow-hidden flex flex-col">
                      <div className="p-4 border-b border-slate-100 flex-shrink-0">
                        <h3 className="text-sm font-bold text-slate-900">직원 목록</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{assignableEmployees.length}명 · 클릭하여 권한 설정</p>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        {assignableEmployees.map(emp => {
                          const userMap = allUserPerms[emp.id] || {}
                          const enabledCount = Object.values(userMap).filter(p => p.can_view).length
                          const isSelected = selectedPermUserId === emp.id
                          return (
                            <div
                              key={emp.id}
                              onClick={() => setSelectedPermUserId(emp.id)}
                              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all border-b border-slate-50 ${
                                isSelected
                                  ? 'bg-steel-50 border-l-[3px] border-l-steel-600'
                                  : 'hover:bg-slate-50/70 border-l-[3px] border-l-transparent'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs flex-shrink-0 ${
                                isSelected ? 'bg-steel-600' : 'bg-slate-400'
                              }`}>
                                {(emp.employee_name || emp.email || '?')[0].toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-bold text-sm truncate ${isSelected ? 'text-steel-900' : 'text-slate-700'}`}>
                                    {emp.employee_name || '(미설정)'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {emp.department?.name && (
                                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded truncate max-w-[60px]">{emp.department.name}</span>
                                  )}
                                  {emp.position?.name && (
                                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded truncate max-w-[60px]">{emp.position.name}</span>
                                  )}
                                </div>
                              </div>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                                enabledCount > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                              }`}>
                                {enabledCount}/{activeModules.length}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* ── 우측: 권한 설정 패널 (스크롤) ── */}
                    <div className="flex-1 bg-white rounded-2xl lg:rounded-l-none border border-slate-200 lg:border-l-0 overflow-hidden flex flex-col">
                      {!selectedPermUserId ? (
                        <div className="flex-1 flex items-center justify-center p-8">
                          <div className="text-center">
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                              <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                              </svg>
                            </div>
                            <p className="text-sm font-bold text-slate-400">좌측에서 직원을 선택하세요</p>
                            <p className="text-xs text-slate-300 mt-1">페이지별 접근 권한을 설정할 수 있습니다</p>
                          </div>
                        </div>
                      ) : (() => {
                        const emp = assignableEmployees.find(e => e.id === selectedPermUserId)
                        if (!emp) return null
                        const userMap = allUserPerms[emp.id] || {}
                        const enabledCount = Object.values(userMap).filter(p => p.can_view).length

                        return (
                          <>
                            {/* 선택된 직원 헤더 */}
                            <div className="p-4 border-b border-slate-100 flex-shrink-0 bg-slate-50/50">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm bg-steel-600 flex-shrink-0">
                                    {(emp.employee_name || emp.email || '?')[0].toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-base text-slate-900">{emp.employee_name || '(이름 미설정)'}</span>
                                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                        enabledCount > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                                      }`}>
                                        {enabledCount}/{activeModules.length} 페이지
                                      </span>
                                    </div>
                                    <div className="text-xs text-slate-400 mt-0.5">{emp.email}</div>
                                  </div>
                                </div>
                                <button onClick={() => saveUserPerms(emp.id)}
                                  disabled={savingPermsFor === emp.id}
                                  className="px-5 py-2 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 disabled:bg-slate-300 transition-colors active:scale-95">
                                  {savingPermsFor === emp.id ? '저장 중...' : '저장'}
                                </button>
                              </div>
                            </div>

                            {/* 권한 설정 영역 (스크롤) */}
                            <div className="flex-1 overflow-y-auto">
                              {moduleGroups.map(group => (
                                <div key={group}>
                                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{group}</span>
                                  </div>
                                  <div className="divide-y divide-slate-50">
                                    {activeModules.filter(m => m.group === group).map(mod => {
                                      const perm = userMap[mod.path]
                                      const isOn = !!perm?.can_view
                                      return (
                                        <div key={mod.path} className="px-4 py-3 hover:bg-slate-50/50 transition-colors">
                                          <div className="flex items-center gap-3">
                                            <button onClick={() => matrixTogglePage(emp.id, mod.path)}
                                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
                                                isOn ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                              }`}>
                                              {isOn ? 'ON' : 'OFF'}
                                            </button>
                                            <span className="font-bold text-sm text-slate-800 flex-1">{mod.name}</span>
                                          </div>

                                          {/* CRUD + 범위 (ON일 때 아래로) */}
                                          {isOn && (
                                            <div className="flex items-center gap-3 mt-2 ml-[52px]">
                                              {(['can_view', 'can_create', 'can_edit', 'can_delete'] as const).map(f => (
                                                <label key={f} className="flex items-center gap-1 cursor-pointer text-xs">
                                                  <input type="checkbox" checked={perm?.[f] || false}
                                                    onChange={() => matrixTogglePerm(emp.id, mod.path, f)}
                                                    className="w-3.5 h-3.5 rounded border-slate-300 text-steel-600" />
                                                  <span className="font-bold text-slate-600">
                                                    {f === 'can_view' ? '조회' : f === 'can_create' ? '생성' : f === 'can_edit' ? '수정' : '삭제'}
                                                  </span>
                                                </label>
                                              ))}
                                              <select value={perm?.data_scope || 'all'}
                                                onChange={e => matrixChangeScope(emp.id, mod.path, e.target.value)}
                                                className="text-xs border rounded-lg px-1.5 py-0.5 bg-white font-bold ml-auto">
                                                {DATA_SCOPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                              </select>
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                )}

                {/* 안내 */}
                <div className="p-3 md:p-4 bg-steel-50 rounded-xl border border-steel-100">
                  <p className="text-[11px] md:text-xs text-steel-700">
                    <strong>권한 안내:</strong> GOD ADMIN과 관리자(master)는 이 설정과 무관하게 항상 전체 접근 권한을 가집니다.
                    일반 직원만 이 페이지에서 개별 권한을 설정할 수 있습니다.
                  </p>
                </div>
              </div>
            )}

          </>
        )}
      </div>

      {/* 초대 모달 */}
      {activeCompanyId && (
        <InviteModal
          companyName={company?.name || ''}
          companyId={activeCompanyId}
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => { loadEmployees(); loadInvitations() }}
        />
      )}

      {/* 직원 수정 모달 */}
      {editingEmp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeEditModal}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900">직원 정보 수정</h3>
                <p className="text-xs text-slate-400 mt-0.5">{editingEmp.email}</p>
              </div>
              <button onClick={closeEditModal} className="text-2xl font-light text-slate-400 hover:text-slate-900 transition-colors">&times;</button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">이름</label>
                <input value={editForm.employee_name} onChange={e => setEditForm({ ...editForm, employee_name: e.target.value })}
                  className="w-full p-3 border rounded-xl text-sm font-bold focus:border-steel-400 focus:ring-1 focus:ring-steel-400 outline-none transition-colors" placeholder="직원 이름" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">연락처</label>
                <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full p-3 border rounded-xl text-sm focus:border-steel-400 focus:ring-1 focus:ring-steel-400 outline-none transition-colors" placeholder="010-0000-0000" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">역할</label>
                  <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                    className="w-full p-3 border rounded-xl text-sm bg-white focus:border-steel-400 focus:ring-1 focus:ring-steel-400 outline-none transition-colors">
                    <option value="user">직원</option>
                    <option value="master">관리자</option>
                    {role === 'god_admin' && <option value="god_admin">GOD ADMIN</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">상태</label>
                  <select value={editForm.is_active ? 'active' : 'inactive'} onChange={e => setEditForm({ ...editForm, is_active: e.target.value === 'active' })}
                    className="w-full p-3 border rounded-xl text-sm bg-white focus:border-steel-400 focus:ring-1 focus:ring-steel-400 outline-none transition-colors">
                    <option value="active">활성</option>
                    <option value="inactive">비활성</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">직급</label>
                  <select value={editForm.position_id} onChange={e => setEditForm({ ...editForm, position_id: e.target.value })}
                    className="w-full p-3 border rounded-xl text-sm bg-white focus:border-steel-400 focus:ring-1 focus:ring-steel-400 outline-none transition-colors">
                    <option value="">미지정</option>
                    {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">부서</label>
                  <select value={editForm.department_id} onChange={e => setEditForm({ ...editForm, department_id: e.target.value })}
                    className="w-full p-3 border rounded-xl text-sm bg-white focus:border-steel-400 focus:ring-1 focus:ring-steel-400 outline-none transition-colors">
                    <option value="">미지정</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">이메일</span>
                  <span className="text-slate-600 font-medium">{editingEmp.email}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">가입일</span>
                  <span className="text-slate-600 font-medium">{formatDate(editingEmp.created_at)}</span>
                </div>
              </div>
            </div>

            {/* 직원 탈퇴 */}
            {editingEmp.id !== user?.id && editingEmp.role !== 'god_admin' && (
              <div className="px-6 py-3 border-t border-red-100 bg-red-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-red-600">직원 탈퇴</p>
                    <p className="text-xs text-red-400 mt-0.5">회사에서 직원을 제거합니다.</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => withdrawEmployee(false)} disabled={withdrawing}
                      className="px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 bg-white rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
                      {withdrawing ? '처리 중...' : '비활성화'}
                    </button>
                    <button onClick={() => withdrawEmployee(true)} disabled={withdrawing}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                      {withdrawing ? '처리 중...' : '완전 삭제'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="px-6 py-4 border-t bg-slate-50 flex gap-3">
              <button onClick={closeEditModal}
                className="flex-1 py-2.5 border border-gray-200 bg-white text-gray-600 rounded-xl hover:bg-gray-50 font-bold text-sm transition-colors">
                취소
              </button>
              <button onClick={saveEdit} disabled={savingEdit}
                className="flex-1 py-2.5 bg-steel-600 text-white rounded-xl hover:bg-steel-700 disabled:bg-slate-300 font-bold text-sm transition-colors">
                {savingEdit ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
