'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import type { Position, Department } from '../../types/rbac'
import InviteModal from '../../components/InviteModal'
import DcStatStrip, { StatItem, ActionButton } from '../../components/DcStatStrip'
import DcToolbar, { FilterItem } from '../../components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../../components/NeuDataTable'
import { auth } from '@/lib/auth-client'

// ────────────────────────────────────────────────────────────────
// Auth Helper
// ────────────────────────────────────────────────────────────────
async function getAuthHeader(): Promise<Record<string, string>> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ============================================
// 조직/권한 통합 관리 페이지 (리뉴얼 v2)
// Tab 1: 조직 관리 (직원, 직급, 부서, 초대)
// Tab 2: 페이지 권한 (사용자별 직접 설정)
// master/admin만 접근 가능
// ============================================

const DATA_SCOPES = [
  { value: 'all', label: '전체 데이터' },
  { value: 'department', label: '부서만' },
  { value: 'own', label: '본인만' },
]

type ActiveModule = { path: string; name: string; group: string }

const NAME_OVERRIDES: Record<string, string> = {
  '/invest': '투자 정산 관리',
  '/insurance': '보험/가입',
  '/finance/upload': '카드/통장 관리',
  '/admin/payroll': '급여 관리',
  '/quotes': '견적 관리',
  '/quotes/create': '견적 작성',
}

const MODULE_GROUPS: Record<string, string> = {
  '/cars': '차량 자산', '/registration': '차량 자산', '/insurance': '차량 자산',
  '/operations': '차량 운영', '/maintenance': '차량 운영', '/accidents': '차량 운영',
  '/quotes': '대고객 영업', '/quotes/create': '대고객 영업',
  '/customers': '대고객 영업', '/contracts': '대고객 영업', '/e-contract': '대고객 영업',
  '/finance': '경영 지원', '/finance/collections': '경영 지원', '/finance/settlement': '경영 지원',
  '/finance/upload': '경영 지원', '/finance/review': '경영 지원', '/finance/freelancers': '경영 지원',
  '/finance/cards': '경영 지원', '/admin/payroll': '경영 지원', '/report': '경영 지원',
  '/jiip': '파트너 자금', '/invest': '파트너 자금', '/loans': '파트너 자금',
  '/db/pricing-standards': '데이터 관리', '/db/lotte': '데이터 관리',
}

type UserPermMap = {
  [pagePath: string]: {
    can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean
    data_scope: string; id?: string
  }
}

const ROLE_LABELS: Record<string, { label: string }> = {
  admin: { label: 'GOD ADMIN' },
  master: { label: '관리자' },
  user: { label: '직원' },
}
const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin: { bg: '#e0f2fe', color: '#0284c7' },
  master: { bg: 'rgba(59,130,246,0.12)', color: '#2563eb' },
  user: { bg: 'rgba(0,0,0,0.04)', color: '#64748b' },
}

export default function OrgManagementPage() {
  const { user, company, role } = useApp()

  // 기본 데이터
  const [employees, setEmployees] = useState<any[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeModules, setActiveModules] = useState<ActiveModule[]>([])
  const [invitations, setInvitations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 검색 + 필터
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

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
  // 직급/부서 인라인 편집
  const [editingPosId, setEditingPosId] = useState<string | null>(null)
  const [editPosName, setEditPosName] = useState('')
  const [editPosLevel, setEditPosLevel] = useState(0)
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null)
  const [editDeptName, setEditDeptName] = useState('')

  // === Tab 2: 페이지 권한 ===
  const [allUserPerms, setAllUserPerms] = useState<Record<string, UserPermMap>>({})
  const [savingPermsFor, setSavingPermsFor] = useState<string | null>(null)
  const [selectedPermUserId, setSelectedPermUserId] = useState<string | null>(null)

  const activeCompanyId = company?.id

  useEffect(() => { loadAll() }, [company])
  useEffect(() => {
    if (activeTab === 'organization' && ['admin', 'master'].includes(role || '')) loadInvitations()
  }, [activeTab, role])
  useEffect(() => {
    if (activeTab === 'permissions') loadAllUserPermissions()
  }, [activeTab])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([loadEmployees(), loadPositions(), loadDepartments(), loadModules()])
    setLoading(false)
  }

  const loadEmployees = async () => {
    try {
      const res = await fetch('/api/profiles', { headers: await getAuthHeader() })
      if (!res.ok) { setEmployees([]); return }
      const json = await res.json()
      setEmployees(json.data || [])
    } catch { setEmployees([]) }
  }

  const loadPositions = async () => {
    try {
      const res = await fetch('/api/positions', { headers: await getAuthHeader() })
      if (!res.ok) { setPositions([]); return }
      const json = await res.json()
      setPositions(json.data || [])
    } catch { setPositions([]) }
  }

  const loadDepartments = async () => {
    try {
      const res = await fetch('/api/departments', { headers: await getAuthHeader() })
      if (!res.ok) { setDepartments([]); return }
      const json = await res.json()
      setDepartments(json.data || [])
    } catch { setDepartments([]) }
  }

  const loadModules = async () => {
    try {
      const res = await fetch('/api/system_modules', { headers: await getAuthHeader() })
      const json = await res.json()
      const data = Array.isArray(json) ? json : (json.data || [])
      if (data.length > 0) {
        setActiveModules(data.filter((m: any) => m.path).map((m: any) => ({
          path: m.path, name: NAME_OVERRIDES[m.path] || m.name,
          group: MODULE_GROUPS[m.path] || '기타',
        })))
        return
      }
    } catch {}
    setActiveModules(Object.entries(MODULE_GROUPS).map(([path, group]) => ({
      path, name: NAME_OVERRIDES[path] || path.split('/').pop() || path, group,
    })))
  }

  const loadAllUserPermissions = async () => {
    try {
      const res = await fetch('/api/user_page_permissions', { headers: await getAuthHeader() })
      if (!res.ok) return
      const json = await res.json()
      const all = json.data || []
      const permsMap: Record<string, UserPermMap> = {}
      all.forEach((p: any) => {
        if (!permsMap[p.user_id]) permsMap[p.user_id] = {}
        permsMap[p.user_id][p.page_path] = {
          can_view: !!p.can_view, can_create: !!p.can_create,
          can_edit: !!p.can_edit, can_delete: !!p.can_delete,
          data_scope: p.data_scope || 'all', id: p.id,
        }
      })
      setAllUserPerms(permsMap)
    } catch {}
  }

  // ===== 검색 + 필터 로직 =====
  const filteredEmployees = useMemo(() => {
    let list = employees
    if (statusFilter === 'active') list = list.filter(e => e.is_active !== false)
    else if (statusFilter === 'inactive') list = list.filter(e => e.is_active === false)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      list = list.filter(e =>
        (e.employee_name || '').toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q) ||
        (e.position?.name || '').toLowerCase().includes(q) ||
        (e.department?.name || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [employees, searchTerm, statusFilter])

  const activeCount = employees.filter(e => e.is_active !== false).length
  const inactiveCount = employees.filter(e => e.is_active === false).length
  const pendingInvitationCount = invitations.filter((inv: any) => inv.status === 'pending').length

  // ===== 필터 탭 =====
  const FILTER_ITEMS: FilterItem[] = [
    { key: 'all', label: '전체', count: employees.length },
    { key: 'active', label: '활성', count: activeCount },
    { key: 'inactive', label: '비활성', count: inactiveCount },
  ]

  // ===== 직원 초대 =====
  const getAccessToken = async (): Promise<string> => {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
    return token || ''
  }

  const loadInvitations = async () => {
    if (!['admin', 'master'].includes(role || '')) return
    setLoadingInvitations(true)
    try {
      const token = await getAccessToken()
      if (!token) { setInvitations([]); return }
      const response = await fetch('/api/member-invite', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const result = await response.json()
      if (response.ok) setInvitations(result.data || [])
      else setInvitations([])
    } catch { setInvitations([]) }
    finally { setLoadingInvitations(false) }
  }

  const cancelInvitation = async (id: string) => {
    if (!confirm('이 초대를 취소하시겠습니까?')) return
    setCancelingId(id)
    try {
      const token = await getAccessToken()
      const response = await fetch(`/api/member-invite?id=${id}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` },
      })
      if (response.ok) loadInvitations()
      else alert('초대 취소 실패')
    } catch { alert('초대 취소 중 오류') }
    finally { setCancelingId(null) }
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
  const closeEditModal = () => { setEditingEmp(null); setEditForm({}); setSavingEdit(false) }

  const saveEdit = async () => {
    if (!editingEmp) return
    setSavingEdit(true)
    try {
      const payload = { ...editForm, position_id: editForm.position_id || null, department_id: editForm.department_id || null }
      const res = await fetch(`/api/profiles/${editingEmp.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.error) { alert('저장 실패: ' + json.error); setSavingEdit(false) }
      else { closeEditModal(); loadEmployees() }
    } catch (e: any) { alert('저장 실패: ' + e.message); setSavingEdit(false) }
  }

  // ===== 직원 탈퇴 =====
  const withdrawEmployee = async (deleteAuth: boolean) => {
    if (!editingEmp) return
    const name = editingEmp.employee_name || editingEmp.email
    const msg = deleteAuth
      ? `${name} 직원을 완전 탈퇴(계정 삭제) 처리하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`
      : `${name} 직원을 비활성화하시겠습니까?`
    if (!confirm(msg)) return
    setWithdrawing(true)
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
      const res = await fetch('/api/employees/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token || ''}` },
        body: JSON.stringify({ employee_id: editingEmp.id, delete_auth: deleteAuth }),
      })
      const result = await res.json()
      if (res.ok) { alert(result.message || '탈퇴 처리 완료'); closeEditModal(); loadEmployees() }
      else alert('탈퇴 실패: ' + (result.error || '알 수 없는 오류'))
    } catch { alert('탈퇴 처리 중 오류') }
    finally { setWithdrawing(false) }
  }

  // ===== 직급 관리 =====
  const addPosition = async () => {
    if (!newPositionName.trim()) return
    try {
      const res = await fetch('/api/positions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ name: newPositionName.trim(), level: newPositionLevel }),
      })
      const json = await res.json()
      if (json.error) alert('직급 추가 실패: ' + json.error)
      else { setNewPositionName(''); setNewPositionLevel(4); loadPositions() }
    } catch { alert('직급 추가 실패') }
  }
  const deletePosition = async (id: string) => {
    if (!confirm('이 직급을 삭제하시겠습니까?')) return
    await fetch(`/api/positions/${id}`, { method: 'DELETE', headers: await getAuthHeader() })
    loadPositions()
  }
  const savePosition = async (id: string) => {
    try {
      await fetch(`/api/positions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ name: editPosName, level: editPosLevel }),
      })
      setEditingPosId(null); loadPositions()
    } catch { alert('직급 수정 실패') }
  }

  // ===== 부서 관리 =====
  const addDepartment = async () => {
    if (!newDeptName.trim()) return
    try {
      const res = await fetch('/api/departments', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ name: newDeptName.trim() }),
      })
      const json = await res.json()
      if (json.error) alert('부서 추가 실패: ' + json.error)
      else { setNewDeptName(''); loadDepartments() }
    } catch { alert('부서 추가 실패') }
  }
  const deleteDepartment = async (id: string) => {
    if (!confirm('이 부서를 삭제하시겠습니까?')) return
    await fetch(`/api/departments/${id}`, { method: 'DELETE', headers: await getAuthHeader() })
    loadDepartments()
  }
  const saveDepartment = async (id: string) => {
    try {
      await fetch(`/api/departments/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ name: editDeptName }),
      })
      setEditingDeptId(null); loadDepartments()
    } catch { alert('부서 수정 실패') }
  }

  // ===== 권한 저장 =====
  const saveUserPerms = async (userId: string) => {
    setSavingPermsFor(userId)
    try {
      await fetch(`/api/user_page_permissions?user_id=${userId}`, { method: 'DELETE', headers: await getAuthHeader() })
      const userMap = allUserPerms[userId] || {}
      const toInsert = Object.entries(userMap)
        .filter(([_, p]) => p.can_view || p.can_create || p.can_edit || p.can_delete)
        .map(([pagePath, p]) => ({
          user_id: userId, page_path: pagePath,
          can_view: p.can_view, can_create: p.can_create,
          can_edit: p.can_edit, can_delete: p.can_delete, data_scope: p.data_scope,
        }))
      if (toInsert.length > 0) {
        const res = await fetch('/api/user_page_permissions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
          body: JSON.stringify(toInsert),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
      }
      alert('권한이 저장되었습니다.')
    } catch (e: any) { alert('저장 실패: ' + e.message) }
    finally { setSavingPermsFor(null) }
  }

  const matrixTogglePage = (userId: string, pagePath: string) => {
    setAllUserPerms(prev => {
      const userMap = { ...(prev[userId] || {}) }
      if (userMap[pagePath]?.can_view) delete userMap[pagePath]
      else userMap[pagePath] = { can_view: true, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
      return { ...prev, [userId]: userMap }
    })
  }

  const matrixTogglePerm = (userId: string, pagePath: string, field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete') => {
    setAllUserPerms(prev => {
      const userMap = { ...(prev[userId] || {}) }
      const current = userMap[pagePath] || { can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
      userMap[pagePath] = { ...current, [field]: !current[field] }
      return { ...prev, [userId]: userMap }
    })
  }

  const matrixChangeScope = (userId: string, pagePath: string, scope: string) => {
    setAllUserPerms(prev => {
      const userMap = { ...(prev[userId] || {}) }
      const current = userMap[pagePath] || { can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
      userMap[pagePath] = { ...current, data_scope: scope }
      return { ...prev, [userId]: userMap }
    })
  }

  // ===== 날짜 포맷 =====
  const formatDate = (d: string) => {
    if (!d) return '-'
    return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  // ===== 로딩 =====
  if (loading) {
    return (
      <div className="page-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(0,0,0,0.06)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ===== NeuDataTable 컬럼 정의 =====
  const employeeColumns: TableColumn<any>[] = [
    {
      key: 'name', label: '직원', width: '35%',
      render: (emp) => {
        const rc = ROLE_COLORS[emp.role] || ROLE_COLORS.user
        const avatarBg = emp.role === 'admin' ? '#0ea5e9' : emp.role === 'master' ? '#2563eb' : '#94a3b8'
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13, flexShrink: 0, background: avatarBg }}>
              {(emp.employee_name || emp.email || '?')[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {emp.employee_name || '(이름 미설정)'}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {emp.email}
              </div>
            </div>
          </div>
        )
      },
    },
    {
      key: 'role', label: '역할', width: 100, align: 'center',
      render: (emp) => {
        const rc = ROLE_COLORS[emp.role] || ROLE_COLORS.user
        const rl = ROLE_LABELS[emp.role] || ROLE_LABELS.user
        return (
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: rc.bg, color: rc.color }}>
            {rl.label}
          </span>
        )
      },
    },
    {
      key: 'position', label: '직급', width: 100,
      render: (emp) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>{emp.position?.name || '-'}</span>
      ),
    },
    {
      key: 'department', label: '부서', width: 100,
      render: (emp) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>{emp.department?.name || '-'}</span>
      ),
    },
    {
      key: 'status', label: '상태', width: 80, align: 'center',
      render: (emp) => (
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
          background: emp.is_active !== false ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: emp.is_active !== false ? '#16a34a' : '#dc2626',
        }}>
          {emp.is_active !== false ? '활성' : '비활성'}
        </span>
      ),
    },
    {
      key: 'created_at', label: '가입일', width: 120, align: 'right', hideOnMobile: true,
      render: (emp) => <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(emp.created_at)}</span>,
    },
  ]

  const employeeMobileCard: MobileCardConfig<any> = {
    title: (emp) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600 }}>{emp.employee_name || '(이름 미설정)'}</span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
          background: (ROLE_COLORS[emp.role] || ROLE_COLORS.user).bg,
          color: (ROLE_COLORS[emp.role] || ROLE_COLORS.user).color,
        }}>{(ROLE_LABELS[emp.role] || ROLE_LABELS.user).label}</span>
      </div>
    ),
    subtitle: (emp) => (
      <span style={{ fontSize: 12, color: '#94a3b8' }}>
        {[emp.position?.name, emp.department?.name].filter(Boolean).join(' · ') || emp.email}
      </span>
    ),
    trailing: (emp) => (
      <span style={{
        fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
        background: emp.is_active !== false ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        color: emp.is_active !== false ? '#16a34a' : '#dc2626',
      }}>
        {emp.is_active !== false ? '활성' : '비활성'}
      </span>
    ),
  }

  // 초대 테이블 컬럼
  const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
    pending: { label: '대기중', bg: 'rgba(251,191,36,0.15)', color: '#a16207' },
    accepted: { label: '수락', bg: 'rgba(34,197,94,0.15)', color: '#16a34a' },
    expired: { label: '만료', bg: 'rgba(239,68,68,0.15)', color: '#dc2626' },
    canceled: { label: '취소', bg: 'rgba(0,0,0,0.04)', color: '#94a3b8' },
  }

  const inviteColumns: TableColumn<any>[] = [
    { key: 'email', label: '이메일', width: '30%', render: (inv) => <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{inv.email}</span> },
    { key: 'department', label: '부서', width: 100, render: (inv) => <span style={{ fontSize: 12, color: '#64748b' }}>{inv.department?.name || '-'}</span> },
    { key: 'position', label: '직급', width: 80, render: (inv) => <span style={{ fontSize: 12, color: '#64748b' }}>{inv.position?.name || '-'}</span> },
    {
      key: 'role', label: '역할', width: 80, align: 'center',
      render: (inv) => {
        const rc = ROLE_COLORS[inv.role] || ROLE_COLORS.user
        return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: rc.bg, color: rc.color }}>{ROLE_LABELS[inv.role]?.label || inv.role}</span>
      },
    },
    {
      key: 'status', label: '상태', width: 80, align: 'center',
      render: (inv) => {
        const s = STATUS_STYLE[inv.status] || { label: inv.status, bg: 'rgba(0,0,0,0.04)', color: '#94a3b8' }
        return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: s.bg, color: s.color }}>{s.label}</span>
      },
    },
    { key: 'created', label: '생성일', width: 110, align: 'right', hideOnMobile: true, render: (inv) => <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(inv.created_at)}</span> },
    { key: 'expires', label: '만료일', width: 110, align: 'right', hideOnMobile: true, render: (inv) => <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(inv.expires_at)}</span> },
    {
      key: 'action', label: '', width: 60, align: 'center',
      render: (inv) => inv.status === 'pending' ? (
        <button onClick={(e) => { e.stopPropagation(); cancelInvitation(inv.id) }}
          disabled={cancelingId === inv.id}
          style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>
          {cancelingId === inv.id ? '...' : '취소'}
        </button>
      ) : null,
    },
  ]

  const inviteMobileCard: MobileCardConfig<any> = {
    title: (inv) => <span style={{ fontWeight: 600 }}>{inv.email}</span>,
    subtitle: (inv) => <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(inv.created_at)} ~ {formatDate(inv.expires_at)}</span>,
    trailing: (inv) => {
      const s = STATUS_STYLE[inv.status] || { label: inv.status, bg: 'rgba(0,0,0,0.04)', color: '#94a3b8' }
      return <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: s.bg, color: s.color }}>{s.label}</span>
    },
  }

  const assignableEmployees = employees.filter(e => e.role === 'user' && e.is_active !== false)

  const TAB_FILTERS: FilterItem[] = [
    { key: 'organization', label: '조직 관리', count: employees.length },
    { key: 'permissions', label: '페이지 권한', count: assignableEmployees.length },
  ]

  const GROUP_ORDER = ['차량 자산', '차량 운영', '대고객 영업', '경영 지원', '파트너 자금', '데이터 관리', '기타']
  const moduleGroups = GROUP_ORDER.filter(g => activeModules.some(m => m.group === g))

  // ===== Glass 스타일 상수 =====
  const glassCard: React.CSSProperties = {
    background: 'rgba(255,255,255,0.72)',
    borderRadius: 16,
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '6px 6px 18px rgba(140,170,210,0.14), -6px -6px 18px rgba(255,255,255,0.47)',
    overflow: 'hidden',
  }
  const glassCardInner: React.CSSProperties = { ...glassCard, padding: 20 }
  const sectionHeader: React.CSSProperties = {
    padding: '14px 20px',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
    background: 'rgba(255,255,255,0.40)',
  }

  return (
    <div className="page-bg">
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">

      {/* Stats */}
      <DcStatStrip
        stats={[
          { label: '전체 직원', value: employees.length, tint: 'blue' },
          { label: '활성', value: activeCount, tint: 'green' },
          { label: '비활성', value: inactiveCount, tint: 'red' },
          { label: '대기중 초대', value: pendingInvitationCount, tint: 'amber' },
        ]}
        actions={[
          { label: '직원 초대', onClick: () => setShowInviteModal(true), variant: 'primary', icon: '+' },
        ]}
      />

      {/* 탭 전환 */}
      <DcToolbar
        search=""
        onSearchChange={() => {}}
        noSearch
        filters={TAB_FILTERS}
        activeFilter={activeTab}
        onFilterChange={(key) => setActiveTab(key as 'organization' | 'permissions')}
      />

      {/* ================================================================ */}
      {/* Tab 1: 조직 관리 */}
      {/* ================================================================ */}
      {activeTab === 'organization' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* 직원 목록 — NeuDataTable + 검색/필터 */}
          <div>
            <DcToolbar
              search={searchTerm}
              onSearchChange={setSearchTerm}
              placeholder="이름, 이메일, 부서, 직급 검색..."
              filters={FILTER_ITEMS}
              activeFilter={statusFilter}
              onFilterChange={setStatusFilter}
            />
            <NeuDataTable
              columns={employeeColumns}
              data={filteredEmployees}
              rowKey={(emp) => emp.id}
              onRowClick={openEditModal}
              emptyMessage="직원이 없습니다"
              mobileCard={employeeMobileCard}
              loading={false}
            />
          </div>

          {/* 직급 · 부서 관리 — 2열 (모바일 1열) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 직급 관리 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={glassCardInner}>
                <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1e293b' }}>직급 추가</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>직급명</label>
                    <input value={newPositionName} onChange={e => setNewPositionName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addPosition()}
                      style={{ width: '100%', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} placeholder="예: 과장" />
                  </div>
                  <div style={{ width: 72 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>레벨</label>
                    <input type="number" min={1} max={10} value={newPositionLevel}
                      onChange={e => setNewPositionLevel(Number(e.target.value))}
                      style={{ width: '100%', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} />
                  </div>
                  <button onClick={addPosition} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', flexShrink: 0 }}>추가</button>
                </div>
              </div>
              <div style={glassCard}>
                <div style={sectionHeader}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: '#64748b', margin: 0 }}>직급 목록 ({positions.length})</h3>
                </div>
                <div>
                  {positions.map(pos => (
                    <div key={pos.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                      {editingPosId === pos.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                          <input value={editPosName} onChange={e => setEditPosName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && savePosition(pos.id)}
                            style={{ flex: 1, border: '1px solid rgba(59,130,246,0.4)', borderRadius: 6, padding: '4px 8px', fontSize: 13, outline: 'none' }} autoFocus />
                          <input type="number" min={1} max={10} value={editPosLevel}
                            onChange={e => setEditPosLevel(Number(e.target.value))}
                            style={{ width: 48, border: '1px solid rgba(59,130,246,0.4)', borderRadius: 6, padding: '4px 8px', fontSize: 13, outline: 'none' }} />
                          <button onClick={() => savePosition(pos.id)} style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>저장</button>
                          <button onClick={() => setEditingPosId(null)} style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                            onClick={() => { setEditingPosId(pos.id); setEditPosName(pos.name); setEditPosLevel(pos.level || 0) }}>
                            <span style={{ background: 'rgba(59,130,246,0.1)', color: '#2563eb', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, width: 48, textAlign: 'center', display: 'inline-block' }}>Lv.{pos.level}</span>
                            <span style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>{pos.name}</span>
                          </div>
                          <button onClick={() => deletePosition(pos.id)} style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>삭제</button>
                        </>
                      )}
                    </div>
                  ))}
                  {positions.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>직급이 없습니다.</div>}
                </div>
              </div>
            </div>

            {/* 부서 관리 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={glassCardInner}>
                <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1e293b' }}>부서 추가</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>부서명</label>
                    <input value={newDeptName} onChange={e => setNewDeptName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addDepartment()}
                      style={{ width: '100%', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} placeholder="예: 영업팀" />
                  </div>
                  <button onClick={addDepartment} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', flexShrink: 0 }}>추가</button>
                </div>
              </div>
              <div style={glassCard}>
                <div style={sectionHeader}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: '#64748b', margin: 0 }}>부서 목록 ({departments.length})</h3>
                </div>
                <div>
                  {departments.map(dept => (
                    <div key={dept.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                      {editingDeptId === dept.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                          <input value={editDeptName} onChange={e => setEditDeptName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveDepartment(dept.id)}
                            style={{ flex: 1, border: '1px solid rgba(59,130,246,0.4)', borderRadius: 6, padding: '4px 8px', fontSize: 13, outline: 'none' }} autoFocus />
                          <button onClick={() => saveDepartment(dept.id)} style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>저장</button>
                          <button onClick={() => setEditingDeptId(null)} style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>취소</button>
                        </div>
                      ) : (
                        <>
                          <span style={{ fontWeight: 600, fontSize: 13, color: '#334155', cursor: 'pointer' }}
                            onClick={() => { setEditingDeptId(dept.id); setEditDeptName(dept.name) }}>
                            {dept.name}
                          </span>
                          <button onClick={() => deleteDepartment(dept.id)} style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>삭제</button>
                        </>
                      )}
                    </div>
                  ))}
                  {departments.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>부서가 없습니다.</div>}
                </div>
              </div>
            </div>
          </div>

          {/* 초대 관리 */}
          <div>
            <div style={{ ...sectionHeader, ...glassCard, borderBottom: 'none', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', margin: 0 }}>초대 관리</h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>총 {invitations.length}개 · 대기중 {pendingInvitationCount}개</p>
              </div>
            </div>
            <NeuDataTable
              columns={inviteColumns}
              data={invitations}
              rowKey={(inv) => inv.id}
              emptyMessage="초대 내역이 없습니다"
              mobileCard={inviteMobileCard}
              loading={loadingInvitations}
            />
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Tab 2: 페이지 권한 (좌우 분할 마스터-디테일) */}
      {/* ================================================================ */}
      {activeTab === 'permissions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {assignableEmployees.length === 0 ? (
            <div style={{ ...glassCardInner, textAlign: 'center', padding: '32px 48px' }}>
              <p style={{ color: '#64748b', fontSize: 14 }}>권한을 설정할 일반 직원이 없습니다.</p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>관리자(master)와 GOD ADMIN은 항상 전체 접근 권한을 가집니다.</p>
            </div>
          ) : activeModules.length === 0 ? (
            <div style={{ ...glassCardInner, textAlign: 'center', padding: 32 }}>
              <p style={{ color: '#64748b', fontSize: 14 }}>활성화된 모듈이 없습니다.</p>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row" style={{ gap: 0, minHeight: 'calc(100vh - 240px)' }}>

              {/* 좌측: 직원 목록 */}
              <div className="w-full md:w-72" style={{ ...glassCard, borderRadius: '16px 16px 0 0', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: 16, borderBottom: '1px solid rgba(0,0,0,0.06)', flexShrink: 0 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>직원 목록</h3>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{assignableEmployees.length}명</p>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {assignableEmployees.map(emp => {
                    const userMap = allUserPerms[emp.id] || {}
                    const enabledCount = Object.values(userMap).filter(p => p.can_view).length
                    const isSelected = selectedPermUserId === emp.id
                    return (
                      <div key={emp.id} onClick={() => setSelectedPermUserId(emp.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer',
                          borderBottom: '1px solid rgba(0,0,0,0.04)',
                          borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
                          background: isSelected ? 'rgba(59,130,246,0.06)' : 'transparent',
                        }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontWeight: 800, fontSize: 12, flexShrink: 0,
                          background: isSelected ? '#3b82f6' : '#94a3b8',
                        }}>
                          {(emp.employee_name || emp.email || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: isSelected ? '#1e3a5f' : '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {emp.employee_name || '(미설정)'}
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                            {emp.department?.name && <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(0,0,0,0.04)', padding: '1px 4px', borderRadius: 4 }}>{emp.department.name}</span>}
                            {emp.position?.name && <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(0,0,0,0.04)', padding: '1px 4px', borderRadius: 4 }}>{emp.position.name}</span>}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, flexShrink: 0,
                          background: enabledCount > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.04)',
                          color: enabledCount > 0 ? '#16a34a' : '#94a3b8',
                        }}>
                          {enabledCount}/{activeModules.length}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 우측: 권한 설정 패널 */}
              <div className="flex-1" style={{ ...glassCard, borderRadius: '0 0 16px 16px', borderLeft: 0, display: 'flex', flexDirection: 'column' }}>
                {!selectedPermUserId ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <svg style={{ width: 28, height: 28, color: '#94a3b8' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                        </svg>
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>좌측에서 직원을 선택하세요</p>
                      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>페이지별 접근 권한을 설정합니다</p>
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
                      <div style={{ ...sectionHeader, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14, background: '#3b82f6', flexShrink: 0 }}>
                            {(emp.employee_name || emp.email || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>{emp.employee_name || '(이름 미설정)'}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: enabledCount > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.04)', color: enabledCount > 0 ? '#16a34a' : '#94a3b8' }}>
                                {enabledCount}/{activeModules.length}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{emp.email}</div>
                          </div>
                        </div>
                        <button onClick={() => saveUserPerms(emp.id)}
                          disabled={savingPermsFor === emp.id}
                          style={{ padding: '8px 20px', background: savingPermsFor === emp.id ? '#94a3b8' : '#3b82f6', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: savingPermsFor === emp.id ? 'not-allowed' : 'pointer' }}>
                          {savingPermsFor === emp.id ? '저장 중...' : '저장'}
                        </button>
                      </div>

                      {/* 권한 설정 영역 */}
                      <div style={{ flex: 1, overflowY: 'auto' }}>
                        {moduleGroups.map(group => (
                          <div key={group}>
                            <div style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.40)', borderBottom: '1px solid rgba(0,0,0,0.06)', position: 'sticky', top: 0, zIndex: 10 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group}</span>
                            </div>
                            <div>
                              {activeModules.filter(m => m.group === group).map(mod => {
                                const perm = userMap[mod.path]
                                const isOn = !!perm?.can_view
                                return (
                                  <div key={mod.path} style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <button onClick={() => matrixTogglePage(emp.id, mod.path)}
                                        style={{
                                          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
                                          background: isOn ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.04)',
                                          color: isOn ? '#16a34a' : '#94a3b8',
                                        }}>
                                        {isOn ? 'ON' : 'OFF'}
                                      </button>
                                      <span style={{ fontWeight: 600, fontSize: 13, color: '#334155', flex: 1 }}>{mod.name}</span>
                                    </div>
                                    {isOn && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, marginLeft: 52, flexWrap: 'wrap' }}>
                                        {(['can_view', 'can_create', 'can_edit', 'can_delete'] as const).map(f => (
                                          <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12 }}>
                                            <input type="checkbox" checked={perm?.[f] || false}
                                              onChange={() => matrixTogglePerm(emp.id, mod.path, f)}
                                              style={{ width: 14, height: 14, borderRadius: 4, accentColor: '#3b82f6' }} />
                                            <span style={{ fontWeight: 600, color: '#334155' }}>
                                              {f === 'can_view' ? '조회' : f === 'can_create' ? '생성' : f === 'can_edit' ? '수정' : '삭제'}
                                            </span>
                                          </label>
                                        ))}
                                        <select value={perm?.data_scope || 'all'}
                                          onChange={e => matrixChangeScope(emp.id, mod.path, e.target.value)}
                                          style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, padding: '2px 6px', background: 'rgba(255,255,255,0.8)', fontWeight: 600, marginLeft: 'auto' }}>
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
          <div style={{ padding: '12px 16px', background: 'rgba(59,130,246,0.08)', borderRadius: 12, border: '1px solid rgba(59,130,246,0.2)' }}>
            <p style={{ fontSize: 12, color: '#2563eb', margin: 0 }}>
              <strong>권한 안내:</strong> GOD ADMIN과 관리자(master)는 이 설정과 무관하게 항상 전체 접근 권한을 가집니다.
            </p>
          </div>
        </div>
      )}

      {/* 초대 모달 */}
      {showInviteModal && (
        <InviteModal
          companyName={company?.name || '주식회사 에프엠아이'}
          companyId={activeCompanyId || ''}
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => { loadEmployees(); loadInvitations() }}
        />
      )}

      {/* 직원 수정 모달 — Glass Level 4 */}
      {editingEmp && (
        <div onClick={closeEditModal}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'rgba(255,255,255,0.92)', borderRadius: 20, width: '100%', maxWidth: 520, boxShadow: '0 25px 50px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>

            {/* 모달 헤더 — Glass */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.40)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 600, color: '#1e293b', margin: 0 }}>직원 정보 수정</h3>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{editingEmp.email}</p>
              </div>
              <button onClick={closeEditModal} style={{ fontSize: 22, fontWeight: 300, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
            </div>

            <div style={{ padding: 24, maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>이름</label>
                  <input value={editForm.employee_name} onChange={e => setEditForm({ ...editForm, employee_name: e.target.value })}
                    style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} placeholder="직원 이름" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>연락처</label>
                  <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                    style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} placeholder="010-0000-0000" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>역할</label>
                    <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                      style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, background: 'rgba(255,255,255,0.6)', outline: 'none' }}>
                      <option value="user">직원</option>
                      <option value="master">관리자</option>
                      {role === 'admin' && <option value="admin">GOD ADMIN</option>}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>상태</label>
                    <select value={editForm.is_active ? 'active' : 'inactive'} onChange={e => setEditForm({ ...editForm, is_active: e.target.value === 'active' })}
                      style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, background: 'rgba(255,255,255,0.6)', outline: 'none' }}>
                      <option value="active">활성</option>
                      <option value="inactive">비활성</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>직급</label>
                    <select value={editForm.position_id} onChange={e => setEditForm({ ...editForm, position_id: e.target.value })}
                      style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, background: 'rgba(255,255,255,0.6)', outline: 'none' }}>
                      <option value="">미지정</option>
                      {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>부서</label>
                    <select value={editForm.department_id} onChange={e => setEditForm({ ...editForm, department_id: e.target.value })}
                      style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, background: 'rgba(255,255,255,0.6)', outline: 'none' }}>
                      <option value="">미지정</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
                {/* 정보 카드 — Glass Level 1 */}
                <div style={{ background: 'rgba(255,255,255,0.40)', borderRadius: 10, padding: 12, border: '1px solid rgba(0,0,0,0.05)', boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: '#94a3b8' }}>이메일</span>
                    <span style={{ color: '#334155', fontWeight: 500 }}>{editingEmp.email}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#94a3b8' }}>가입일</span>
                    <span style={{ color: '#334155', fontWeight: 500 }}>{formatDate(editingEmp.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 직원 탈퇴 */}
            {editingEmp.id !== user?.uid && editingEmp.role !== 'admin' && (
              <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(239,68,68,0.2)', background: 'rgba(254,242,242,0.6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', margin: 0 }}>직원 탈퇴</p>
                    <p style={{ fontSize: 11, color: '#f87171', marginTop: 2 }}>회사에서 직원을 제거합니다.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => withdrawEmployee(false)} disabled={withdrawing}
                      style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#dc2626', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(255,255,255,0.8)', borderRadius: 8, cursor: withdrawing ? 'not-allowed' : 'pointer', opacity: withdrawing ? 0.5 : 1 }}>
                      {withdrawing ? '처리 중...' : '비활성화'}
                    </button>
                    <button onClick={() => withdrawEmployee(true)} disabled={withdrawing}
                      style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#fff', background: '#dc2626', border: 'none', borderRadius: 8, cursor: withdrawing ? 'not-allowed' : 'pointer', opacity: withdrawing ? 0.5 : 1 }}>
                      {withdrawing ? '처리 중...' : '완전 삭제'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 모달 푸터 — Glass */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.40)', display: 'flex', gap: 12 }}>
              <button onClick={closeEditModal}
                style={{ flex: 1, padding: '10px 0', border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', color: '#64748b', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                취소
              </button>
              <button onClick={saveEdit} disabled={savingEdit}
                style={{ flex: 1, padding: '10px 0', background: savingEdit ? '#94a3b8' : '#3b82f6', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 14, border: 'none', cursor: savingEdit ? 'not-allowed' : 'pointer' }}>
                {savingEdit ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
    </div>
  )
}
