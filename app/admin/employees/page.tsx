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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#2d5fa8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
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
    const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
      god_admin: { bg: '#e0f2fe', color: '#0369a1' },
      master: { bg: '#e8eef7', color: '#2d5fa8' },
      user: { bg: '#f1f5f9', color: '#64748b' },
    }
    const rc = ROLE_COLORS[emp.role] || ROLE_COLORS.user
    const avatarBg = emp.role === 'god_admin' ? '#0ea5e9' : emp.role === 'master' ? '#2d5fa8' : '#94a3b8'
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}
        onClick={() => openEditModal(emp)}
        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 14, flexShrink: 0, background: avatarBg }}>
          {(emp.employee_name || emp.email || '?')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.employee_name || '(이름 미설정)'}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: rc.bg, color: rc.color }}>{r.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: emp.is_active !== false ? '#dcfce7' : '#fee2e2', color: emp.is_active !== false ? '#16a34a' : '#dc2626' }}>
              {emp.is_active !== false ? '활성' : '비활성'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.email}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' as const }}>
            {emp.position?.name && <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>{emp.position.name}</span>}
            {emp.department?.name && <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>{emp.department.name}</span>}
            {emp.phone && <span style={{ fontSize: 11, color: '#94a3b8' }}>{emp.phone}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(emp.created_at)}</div>
        </div>
        <div style={{ color: '#d1d5db', flexShrink: 0, fontSize: 14 }}>›</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px', minHeight: '100vh', background: '#f9fafb' }}>

      {/* ═══ 헤더 — 등록/제원 페이지 스타일 ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' as const, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.025em', margin: 0 }}>조직/권한 관리</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4, margin: '4px 0 0' }}>직원 관리 및 페이지 권한 설정</p>
        </div>
        {activeCompanyId && (
          <button onClick={() => setShowInviteModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2d5fa8', color: '#fff', padding: '10px 20px', fontSize: 14, borderRadius: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            + 직원 초대
          </button>
        )}
      </div>

      {role === 'god_admin' && !adminSelectedCompanyId && (
        <div style={{ padding: 20, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 16, marginBottom: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', margin: 0 }}>사이드바에서 회사를 선택해주세요.</p>
          <p style={{ fontSize: 12, color: '#3b82f6', marginTop: 4 }}>조직/권한 관리는 특정 회사를 선택한 상태에서 이용 가능합니다.</p>
        </div>
      )}

      {role === 'god_admin' && !adminSelectedCompanyId ? null : (
        <>
          {/* ═══ 통계 카드 ═══ */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <div style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e5e7eb', cursor: 'pointer' }} onClick={() => setActiveTab('organization')}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', margin: 0 }}>전체 직원</p>
              <p style={{ fontSize: 28, fontWeight: 900, color: '#111827', margin: '4px 0 0' }}>{employees.length}<span style={{ fontSize: 14, fontWeight: 500, color: '#9ca3af', marginLeft: 2 }}>명</span></p>
            </div>
            <div style={{ flex: 1, background: '#fffbeb', borderRadius: 12, padding: '16px 20px', border: '1px solid #fde68a', cursor: 'pointer' }} onClick={() => setActiveTab('organization')}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#d97706', margin: 0 }}>대기중 초대</p>
              <p style={{ fontSize: 28, fontWeight: 900, color: '#b45309', margin: '4px 0 0' }}>{pendingInvitationCount}<span style={{ fontSize: 14, fontWeight: 500, color: '#d97706', marginLeft: 2 }}>건</span></p>
            </div>
            <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 12, padding: '16px 20px', border: '1px solid #bbf7d0' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', margin: 0 }}>직급/부서</p>
              <p style={{ fontSize: 28, fontWeight: 900, color: '#15803d', margin: '4px 0 0' }}>{positions.length}<span style={{ fontSize: 14, fontWeight: 500, color: '#16a34a', marginLeft: 2 }}>직급</span> · {departments.length}<span style={{ fontSize: 14, fontWeight: 500, color: '#16a34a', marginLeft: 2 }}>부서</span></p>
            </div>
            <div style={{ flex: 1, background: '#eff6ff', borderRadius: 12, padding: '16px 20px', border: '1px solid #bfdbfe', cursor: 'pointer' }} onClick={() => setActiveTab('permissions')}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', margin: 0 }}>권한 설정 대상</p>
              <p style={{ fontSize: 28, fontWeight: 900, color: '#1d4ed8', margin: '4px 0 0' }}>{assignableEmployees.length}<span style={{ fontSize: 14, fontWeight: 500, color: '#2563eb', marginLeft: 2 }}>명</span></p>
            </div>
          </div>

          {/* ═══ 탭 ═══ */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  background: activeTab === tab.key ? '#2d5fa8' : '#fff',
                  color: activeTab === tab.key ? '#fff' : '#6b7280',
                  border: activeTab === tab.key ? 'none' : '1px solid #e5e7eb',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                {tab.label}
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: activeTab === tab.key ? 'rgba(255,255,255,0.2)' : '#f3f4f6', color: activeTab === tab.key ? '#fff' : '#9ca3af' }}>{tab.count}</span>
              </button>
            ))}
          </div>

          {/* ================================================================ */}
          {/* Tab 1: 조직 관리 (직원, 직급, 부서, 초대) */}
          {/* ================================================================ */}
          {activeTab === 'organization' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* 직원 목록 */}
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>직원 목록</h2>
                    <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>총 {employees.length}명 · 클릭하여 수정</p>
                  </div>
                </div>

                {/* 테이블 헤더 */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                  <div style={{ width: 40, marginRight: 12 }}></div>
                  <div style={{ flex: 1 }}>이름 / 이메일 / 소속</div>
                  <div style={{ width: 96, textAlign: 'right', marginRight: 24 }}>가입일</div>
                  <div style={{ width: 16 }}></div>
                </div>

                <div>
                  {employees.map(emp => <EmployeeCard key={emp.id} emp={emp} />)}
                  {employees.length === 0 && (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>등록된 직원이 없습니다.</div>
                  )}
                </div>
              </div>

              {/* 직급 · 부서 관리 — 2열 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* 직급 관리 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20 }}>
                    <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, margin: '0 0 12px' }}>직급 추가</h2>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>직급명</label>
                        <input value={newPositionName} onChange={e => setNewPositionName(e.target.value)}
                          style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none' }} placeholder="예: 과장" />
                      </div>
                      <div style={{ width: 80 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>레벨</label>
                        <input type="number" min={1} max={10} value={newPositionLevel}
                          onChange={e => setNewPositionLevel(Number(e.target.value))}
                          style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none' }} />
                      </div>
                      <button onClick={addPosition} style={{ padding: '8px 16px', background: '#2d5fa8', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', flexShrink: 0 }}>추가</button>
                    </div>
                  </div>
                  <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#64748b', margin: 0 }}>직급 목록 ({positions.length})</h3>
                    </div>
                    <div>
                      {positions.map(pos => (
                        <div key={pos.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #f8fafc' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ background: '#e8eef7', color: '#2d5fa8', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, width: 48, textAlign: 'center', display: 'inline-block' }}>Lv.{pos.level}</span>
                            <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{pos.name}</span>
                          </div>
                          <button onClick={() => deletePosition(pos.id)} style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>삭제</button>
                        </div>
                      ))}
                      {positions.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>직급이 없습니다.</div>}
                    </div>
                  </div>
                </div>

                {/* 부서 관리 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20 }}>
                    <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, margin: '0 0 12px' }}>부서 추가</h2>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>부서명</label>
                        <input value={newDeptName} onChange={e => setNewDeptName(e.target.value)}
                          style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none' }} placeholder="예: 영업팀" />
                      </div>
                      <button onClick={addDepartment} style={{ padding: '8px 16px', background: '#2d5fa8', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', flexShrink: 0 }}>추가</button>
                    </div>
                  </div>
                  <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#64748b', margin: 0 }}>부서 목록 ({departments.length})</h3>
                    </div>
                    <div>
                      {departments.map(dept => (
                        <div key={dept.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #f8fafc' }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{dept.name}</span>
                          <button onClick={() => deleteDepartment(dept.id)} style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>삭제</button>
                        </div>
                      ))}
                      {departments.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>부서가 없습니다.</div>}
                    </div>
                  </div>
                </div>
              </div>

              {/* 초대 관리 */}
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>초대 관리</h2>
                  <p className="text-xs text-slate-400 mt-0.5">총 {invitations.length}개 · 대기중: {pendingInvitationCount}개</p>
                </div>

                {loadingInvitations ? (
                  <div style={{ padding: 40, textAlign: 'center' }}>
                    <div style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid #e2e8f0', borderTopColor: '#2d5fa8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>초대 정보를 불러오는 중...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                  </div>
                ) : invitations.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>초대된 회원이 없습니다.</div>
                ) : (
                  <>
                    {/* 테이블 헤더 */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                      <div style={{ flex: 1 }}>이메일</div>
                      <div style={{ width: 96 }}>부서</div>
                      <div style={{ width: 80 }}>직급</div>
                      <div style={{ width: 64 }}>역할</div>
                      <div style={{ width: 80 }}>상태</div>
                      <div style={{ width: 112 }}>생성일</div>
                      <div style={{ width: 112 }}>만료일</div>
                      <div style={{ width: 64 }}>작업</div>
                    </div>

                    <div>
                      {invitations.map((inv: any) => {
                        const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
                          pending: { label: '대기중', bg: '#fef9c3', color: '#a16207' },
                          accepted: { label: '수락', bg: '#dcfce7', color: '#15803d' },
                          expired: { label: '만료', bg: '#fee2e2', color: '#b91c1c' },
                          canceled: { label: '취소', bg: '#f3f4f6', color: '#6b7280' },
                        }
                        const statusInfo = STATUS_STYLE[inv.status] || { label: inv.status, bg: '#f3f4f6', color: '#6b7280' }
                        return (
                          <div key={inv.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f1f5f9', gap: 8, transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{inv.email}</span>
                            </div>
                            <div style={{ width: 96 }}>
                              <span style={{ fontSize: 12, color: '#64748b' }}>{inv.department?.name || '-'}</span>
                            </div>
                            <div style={{ width: 80 }}>
                              <span style={{ fontSize: 12, color: '#64748b' }}>{inv.position?.name || '-'}</span>
                            </div>
                            <div style={{ width: 64 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>
                                {ROLE_LABELS[inv.role]?.label || inv.role}
                              </span>
                            </div>
                            <div style={{ width: 80 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: statusInfo.bg, color: statusInfo.color }}>
                                {statusInfo.label}
                              </span>
                            </div>
                            <div style={{ width: 112 }}>
                              <span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(inv.created_at)}</span>
                            </div>
                            <div style={{ width: 112 }}>
                              <span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(inv.expires_at)}</span>
                            </div>
                            <div style={{ width: 64 }}>
                              {inv.status === 'pending' && (
                                <button onClick={() => cancelInvitation(inv.id)} disabled={cancelingId === inv.id}
                                  style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                  {cancelingId === inv.id ? '취소 중...' : '취소'}
                                </button>
                              )}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {assignableEmployees.length === 0 ? (
                  <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '32px 48px', textAlign: 'center' }}>
                    <p style={{ color: '#94a3b8', fontSize: 14 }}>권한을 설정할 일반 직원이 없습니다.</p>
                    <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>관리자(master)와 GOD ADMIN은 항상 전체 접근 권한을 가집니다.</p>
                  </div>
                ) : activeModules.length === 0 ? (
                  <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 32, textAlign: 'center' }}>
                    <p style={{ color: '#94a3b8', fontSize: 14 }}>활성화된 모듈이 없습니다.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'row', gap: 0, height: 'calc(100vh - 200px)' }}>

                    {/* ── 좌측: 직원 목록 (고정) ── */}
                    <div style={{ width: 288, flexShrink: 0, background: '#fff', borderRadius: '16px 0 0 16px', border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ padding: 16, borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>직원 목록</h3>
                        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{assignableEmployees.length}명 · 클릭하여 권한 설정</p>
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto' }}>
                        {assignableEmployees.map(emp => {
                          const userMap = allUserPerms[emp.id] || {}
                          const enabledCount = Object.values(userMap).filter(p => p.can_view).length
                          const isSelected = selectedPermUserId === emp.id
                          return (
                            <div
                              key={emp.id}
                              onClick={() => setSelectedPermUserId(emp.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer',
                                borderBottom: '1px solid #f8fafc',
                                borderLeft: isSelected ? '3px solid #2d5fa8' : '3px solid transparent',
                                background: isSelected ? '#eef3fb' : 'transparent',
                              }}
                            >
                              <div style={{
                                width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontWeight: 900, fontSize: 12, flexShrink: 0,
                                background: isSelected ? '#2d5fa8' : '#94a3b8'
                              }}>
                                {(emp.employee_name || emp.email || '?')[0].toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isSelected ? '#1e3a5f' : '#334155' }}>
                                    {emp.employee_name || '(미설정)'}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                  {emp.department?.name && (
                                    <span style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', padding: '1px 4px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 60 }}>{emp.department.name}</span>
                                  )}
                                  {emp.position?.name && (
                                    <span style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', padding: '1px 4px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 60 }}>{emp.position.name}</span>
                                  )}
                                </div>
                              </div>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, flexShrink: 0,
                                background: enabledCount > 0 ? '#dcfce7' : '#f1f5f9',
                                color: enabledCount > 0 ? '#15803d' : '#94a3b8'
                              }}>
                                {enabledCount}/{activeModules.length}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* ── 우측: 권한 설정 패널 (스크롤) ── */}
                    <div style={{ flex: 1, background: '#fff', borderRadius: '0 16px 16px 0', border: '1px solid #e2e8f0', borderLeft: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      {!selectedPermUserId ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ width: 64, height: 64, borderRadius: 16, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                              <svg style={{ width: 32, height: 32, color: '#cbd5e1' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                              </svg>
                            </div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>좌측에서 직원을 선택하세요</p>
                            <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>페이지별 접근 권한을 설정할 수 있습니다</p>
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
                            <div style={{ padding: 16, borderBottom: '1px solid #f1f5f9', flexShrink: 0, background: '#fafbfc' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 14, background: '#2d5fa8', flexShrink: 0 }}>
                                    {(emp.employee_name || emp.email || '?')[0].toUpperCase()}
                                  </div>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>{emp.employee_name || '(이름 미설정)'}</span>
                                      <span style={{
                                        fontSize: 12, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                        background: enabledCount > 0 ? '#dcfce7' : '#f1f5f9',
                                        color: enabledCount > 0 ? '#15803d' : '#94a3b8'
                                      }}>
                                        {enabledCount}/{activeModules.length} 페이지
                                      </span>
                                    </div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{emp.email}</div>
                                  </div>
                                </div>
                                <button onClick={() => saveUserPerms(emp.id)}
                                  disabled={savingPermsFor === emp.id}
                                  style={{ padding: '8px 20px', background: savingPermsFor === emp.id ? '#cbd5e1' : '#2d5fa8', color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: 14, border: 'none', cursor: savingPermsFor === emp.id ? 'not-allowed' : 'pointer' }}>
                                  {savingPermsFor === emp.id ? '저장 중...' : '저장'}
                                </button>
                              </div>
                            </div>

                            {/* 권한 설정 영역 (스크롤) */}
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                              {moduleGroups.map(group => (
                                <div key={group}>
                                  <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, zIndex: 10 }}>
                                    <span style={{ fontSize: 10, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group}</span>
                                  </div>
                                  <div>
                                    {activeModules.filter(m => m.group === group).map(mod => {
                                      const perm = userMap[mod.path]
                                      const isOn = !!perm?.can_view
                                      return (
                                        <div key={mod.path} style={{ padding: '12px 16px', borderBottom: '1px solid #f8fafc' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <button onClick={() => matrixTogglePage(emp.id, mod.path)}
                                              style={{
                                                padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', flexShrink: 0,
                                                background: isOn ? '#dcfce7' : '#f1f5f9',
                                                color: isOn ? '#15803d' : '#94a3b8'
                                              }}>
                                              {isOn ? 'ON' : 'OFF'}
                                            </button>
                                            <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', flex: 1 }}>{mod.name}</span>
                                          </div>

                                          {/* CRUD + 범위 (ON일 때 아래로) */}
                                          {isOn && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, marginLeft: 52 }}>
                                              {(['can_view', 'can_create', 'can_edit', 'can_delete'] as const).map(f => (
                                                <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12 }}>
                                                  <input type="checkbox" checked={perm?.[f] || false}
                                                    onChange={() => matrixTogglePerm(emp.id, mod.path, f)}
                                                    style={{ width: 14, height: 14, borderRadius: 4 }} />
                                                  <span style={{ fontWeight: 700, color: '#475569' }}>
                                                    {f === 'can_view' ? '조회' : f === 'can_create' ? '생성' : f === 'can_edit' ? '수정' : '삭제'}
                                                  </span>
                                                </label>
                                              ))}
                                              <select value={perm?.data_scope || 'all'}
                                                onChange={e => matrixChangeScope(emp.id, mod.path, e.target.value)}
                                                style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: '2px 6px', background: '#fff', fontWeight: 700, marginLeft: 'auto' }}>
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
                <div style={{ padding: '12px 16px', background: '#eef3fb', borderRadius: 12, border: '1px solid #d4e0f0' }}>
                  <p style={{ fontSize: 12, color: '#2d5fa8' }}>
                    <strong>권한 안내:</strong> GOD ADMIN과 관리자(master)는 이 설정과 무관하게 항상 전체 접근 권한을 가집니다.
                    일반 직원만 이 페이지에서 개별 권한을 설정할 수 있습니다.
                  </p>
                </div>
              </div>
            )}

          </>
        )}

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
        <div onClick={closeEditModal}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 512, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>직원 정보 수정</h3>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{editingEmp.email}</p>
              </div>
              <button onClick={closeEditModal} style={{ fontSize: 24, fontWeight: 300, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>

            <div style={{ padding: 24, maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>이름</label>
                  <input value={editForm.employee_name} onChange={e => setEditForm({ ...editForm, employee_name: e.target.value })}
                    style={{ width: '100%', padding: 12, border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, fontWeight: 700, outline: 'none', boxSizing: 'border-box' as const }} placeholder="직원 이름" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>연락처</label>
                  <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                    style={{ width: '100%', padding: 12, border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} placeholder="010-0000-0000" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>역할</label>
                    <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                      style={{ width: '100%', padding: 12, border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, background: '#fff', outline: 'none' }}>
                      <option value="user">직원</option>
                      <option value="master">관리자</option>
                      {role === 'god_admin' && <option value="god_admin">GOD ADMIN</option>}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>상태</label>
                    <select value={editForm.is_active ? 'active' : 'inactive'} onChange={e => setEditForm({ ...editForm, is_active: e.target.value === 'active' })}
                      style={{ width: '100%', padding: 12, border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, background: '#fff', outline: 'none' }}>
                      <option value="active">활성</option>
                      <option value="inactive">비활성</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>직급</label>
                    <select value={editForm.position_id} onChange={e => setEditForm({ ...editForm, position_id: e.target.value })}
                      style={{ width: '100%', padding: 12, border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, background: '#fff', outline: 'none' }}>
                      <option value="">미지정</option>
                      {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>부서</label>
                    <select value={editForm.department_id} onChange={e => setEditForm({ ...editForm, department_id: e.target.value })}
                      style={{ width: '100%', padding: 12, border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 14, background: '#fff', outline: 'none' }}>
                      <option value="">미지정</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: '#94a3b8' }}>이메일</span>
                    <span style={{ color: '#475569', fontWeight: 500 }}>{editingEmp.email}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#94a3b8' }}>가입일</span>
                    <span style={{ color: '#475569', fontWeight: 500 }}>{formatDate(editingEmp.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 직원 탈퇴 */}
            {editingEmp.id !== user?.id && editingEmp.role !== 'god_admin' && (
              <div style={{ padding: '12px 24px', borderTop: '1px solid #fecaca', background: '#fef2f2' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', margin: 0 }}>직원 탈퇴</p>
                    <p style={{ fontSize: 12, color: '#f87171', marginTop: 2 }}>회사에서 직원을 제거합니다.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => withdrawEmployee(false)} disabled={withdrawing}
                      style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#dc2626', border: '1px solid #fecaca', background: '#fff', borderRadius: 8, cursor: withdrawing ? 'not-allowed' : 'pointer', opacity: withdrawing ? 0.5 : 1 }}>
                      {withdrawing ? '처리 중...' : '비활성화'}
                    </button>
                    <button onClick={() => withdrawEmployee(true)} disabled={withdrawing}
                      style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#fff', background: '#ef4444', border: 'none', borderRadius: 8, cursor: withdrawing ? 'not-allowed' : 'pointer', opacity: withdrawing ? 0.5 : 1 }}>
                      {withdrawing ? '처리 중...' : '완전 삭제'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', gap: 12 }}>
              <button onClick={closeEditModal}
                style={{ flex: 1, padding: '10px 0', border: '1px solid #e5e7eb', background: '#fff', color: '#4b5563', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                취소
              </button>
              <button onClick={saveEdit} disabled={savingEdit}
                style={{ flex: 1, padding: '10px 0', background: savingEdit ? '#cbd5e1' : '#2d5fa8', color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: 14, border: 'none', cursor: savingEdit ? 'not-allowed' : 'pointer' }}>
                {savingEdit ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
