'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useApp } from '../context/AppContext'
import type { Position, Department } from '../types/rbac'
import InviteModal from '../components/InviteModal'
import DcStatStrip, { StatItem, ActionButton } from '../components/DcStatStrip'
import DcToolbar, { FilterItem } from '../components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../components/NeuDataTable'
import { auth } from '@/lib/auth-client'
import PayrollOps from './_components/PayrollOps'

// ────────────────────────────────────────────────────────────────
// Auth Helper
// ────────────────────────────────────────────────────────────────
async function getAuthHeader(): Promise<Record<string, string>> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ============================================
// /hr — 인사 마스터 (PR-B1, 2026-05-05) — 통합 페이지
// 사용자 명시: "한페이지를 해서 직원관리,초대관리,조직,권한,부서,직급,
//             직원 프리랜서 급여설정 기타 등등 한곳에서 기본설정값들"
// 4 탭: [직원 관리] [부서·직급] [초대 관리] [외부 인력]
// 직원 행 클릭 → 모달: § 기본 / § 급여 (user/master) / § 권한 (user)
// ============================================

const DATA_SCOPES = [
  { value: 'all', label: '전체 데이터' },
  { value: 'department', label: '부서만' },
  { value: 'own', label: '본인만' },
]

type ActiveModule = { path: string; name: string; group: string }

// menu-registry 단일 SOURCE — 그룹 라벨 / 매핑 / 표시명 자동 추출
// 새 페이지 추가 시 lib/menu-registry.ts MENUS 배열에만 entry 추가하면
// 본 권한 페이지에 자동 노출 (NAME_OVERRIDES / MODULE_GROUPS hardcoded 제거)
import { GROUPS as REGISTRY_GROUPS, MENUS as REGISTRY_MENUS } from '@/lib/menu-registry'

// path → 그룹 라벨 (menu-registry 자동 생성)
const PATH_TO_GROUP_LABEL: Record<string, string> = Object.fromEntries(
  REGISTRY_MENUS
    .filter(m => !m.hidden)
    .map(m => {
      const g = REGISTRY_GROUPS.find(gr => gr.id === m.group)
      return [m.path, g?.label || '기타']
    })
)

// path → 표시명 (displayName 우선)
const PATH_TO_NAME: Record<string, string> = Object.fromEntries(
  REGISTRY_MENUS.filter(m => !m.hidden).map(m => [m.path, m.displayName || m.name])
)

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

export default function HRMasterPage() {
  const { user, company, role } = useApp()
  const router = useRouter()
  const searchParams = useSearchParams()

  // 기본 데이터
  const [employees, setEmployees] = useState<any[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeModules, setActiveModules] = useState<ActiveModule[]>([])
  const [invitations, setInvitations] = useState<any[]>([])
  const [freelancers, setFreelancers] = useState<any[]>([])
  const [rideEmployees, setRideEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 검색 + 필터
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // 탭 상태 — 통합 페이지 5 탭 (모두 inline — PR-B7)
  type TopTab = 'employees' | 'org' | 'invitations' | 'external' | 'payroll'
  const TOP_TABS: TopTab[] = ['employees', 'org', 'invitations', 'external', 'payroll']
  const initialTab = (() => {
    const q = searchParams?.get('tab') as TopTab | null
    if (q && TOP_TABS.includes(q)) return q
    return 'employees' as TopTab
  })()
  const [topTab, setTopTab] = useState<TopTab>(initialTab)
  // querystring 변경 시 탭 동기화 + 탭 변경 시 querystring 반영
  useEffect(() => {
    const q = searchParams?.get('tab') as TopTab | null
    if (q && TOP_TABS.includes(q)) setTopTab(q)
  }, [searchParams])
  const changeTab = (next: TopTab) => {
    setTopTab(next)
    // querystring 부드럽게 반영 (페이지 reload 없음)
    const url = next === 'employees' ? '/hr' : `/hr?tab=${next}`
    if (typeof window !== 'undefined' && window.history) {
      window.history.replaceState({}, '', url)
    }
  }
  // 옛 권한 master-detail 잔여 코드 호환 (사용 X)
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
  // 섹션 접기/펼치기
  const [showPositionsDepts, setShowPositionsDepts] = useState(false)
  const [showInvitations, setShowInvitations] = useState(false)

  // === 모달 내부 — 통합 직원 편집 (기본정보 + 급여 + 권한) ===
  type EditSection = 'profile' | 'salary' | 'permissions'
  const [editSection, setEditSection] = useState<EditSection>('profile')

  // === 외부 인력 — 프리랜서 폼 (PR-B5 Q2a) ===
  const [showFreelancerForm, setShowFreelancerForm] = useState(false)
  const [editingFreelancerId, setEditingFreelancerId] = useState<string | null>(null)
  const FL_TAX_TYPES = ['사업소득(3.3%)', '기타소득(8.8%)', '세금계산서', '원천징수 없음']
  const FL_SERVICE_TYPES = ['탁송', '대리운전', '정비', '세차', '디자인', '개발', '법무/세무', '기타']
  const FL_BANKS = ['KB국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행', 'IBK기업은행', '카카오뱅크', '케이뱅크', '토스뱅크']
  const flEmpty = { name: '', phone: '', email: '', bank_name: 'KB국민은행', account_number: '', account_holder: '', reg_number: '', tax_type: '사업소득(3.3%)', service_type: '기타', is_active: true, memo: '' }
  const [freelancerForm, setFreelancerForm] = useState<any>(flEmpty)
  const [savingFreelancer, setSavingFreelancer] = useState(false)

  const openFreelancerForm = (f?: any) => {
    if (f) {
      setEditingFreelancerId(f.id)
      setFreelancerForm({
        name: f.name || '', phone: f.phone || '', email: f.email || '',
        bank_name: f.bank_name || 'KB국민은행', account_number: f.account_number || '',
        account_holder: f.account_holder || '', reg_number: f.reg_number || '',
        tax_type: f.tax_type || '사업소득(3.3%)', service_type: f.service_type || '기타',
        is_active: f.is_active !== false, memo: f.memo || '',
      })
    } else {
      setEditingFreelancerId(null)
      setFreelancerForm(flEmpty)
    }
    setShowFreelancerForm(true)
  }
  const closeFreelancerForm = () => { setShowFreelancerForm(false); setEditingFreelancerId(null); setFreelancerForm(flEmpty) }

  const saveFreelancer = async () => {
    if (!freelancerForm.name) { alert('이름은 필수입니다.'); return }
    setSavingFreelancer(true)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await getAuthHeader()) }
      if (editingFreelancerId) {
        const res = await fetch(`/api/freelancers/${editingFreelancerId}`, { method: 'PATCH', headers, body: JSON.stringify(freelancerForm) })
        if (!res.ok) { const j = await res.json().catch(() => ({})); alert('수정 실패: ' + (j.error || res.statusText)); return }
      } else {
        const res = await fetch('/api/freelancers', { method: 'POST', headers, body: JSON.stringify(freelancerForm) })
        if (!res.ok) { const j = await res.json().catch(() => ({})); alert('등록 실패: ' + (j.error || res.statusText)); return }
      }
      closeFreelancerForm()
      await loadExternal()
    } catch (e: any) {
      alert('저장 실패: ' + e.message)
    } finally {
      setSavingFreelancer(false)
    }
  }
  const toggleFreelancerActive = async (f: any) => {
    try {
      await fetch(`/api/freelancers/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ is_active: !f.is_active }),
      })
      await loadExternal()
    } catch {}
  }

  // § 급여 설정 — 동적 수당 (PR-B5 Q3γ)
  // 식대는 기본 노출 (가장 흔함) + 「+ 수당 추가」 버튼으로 다른 항목 동적 추가
  const ALLOWANCE_OPTIONS = [
    { key: 'meal_allowance', label: '식대', defaultAmount: 200000, hint: '비과세 한도 월 20만원' },
    { key: 'transport_allowance', label: '교통비', defaultAmount: 0, hint: '과세' },
    { key: 'self_drive_allowance', label: '자가운전보조금', defaultAmount: 0, hint: '비과세 한도 월 20만원' },
    { key: 'position_allowance', label: '직책수당', defaultAmount: 0, hint: '직급별 수당' },
    { key: 'family_allowance', label: '가족수당', defaultAmount: 0, hint: '부양가족 수당' },
    { key: 'night_allowance', label: '야간수당', defaultAmount: 0, hint: '22:00~06:00 150%' },
    { key: 'overtime_allowance', label: '연장수당', defaultAmount: 0, hint: '주 40h 초과 150%' },
    { key: 'annual_leave_allowance', label: '연차수당', defaultAmount: 0, hint: '미사용 연차 보상' },
    { key: 'bonus', label: '상여금', defaultAmount: 0, hint: '성과/명절' },
  ]
  const ALLOWANCE_LABELS: Record<string, string> = Object.fromEntries(ALLOWANCE_OPTIONS.map(o => [o.key, o.label]))

  const [salaryForm, setSalaryForm] = useState<{
    id: string | null
    base_salary: string
    meal_allowance: string                     // 기본 식대 (마스터 — 매월 동일)
    extra_allowances: Record<string, string>   // 추가 수당 (key=ALLOWANCE_OPTIONS.key, value=금액)
    bank_name: string
    account_number: string
    account_holder: string
    payment_day: string
    is_active: boolean
  }>({ id: null, base_salary: '', meal_allowance: '', extra_allowances: {}, bank_name: '', account_number: '', account_holder: '', payment_day: '25', is_active: true })
  const [savingSalary, setSavingSalary] = useState(false)
  const [showAddAllowance, setShowAddAllowance] = useState(false)

  // === Tab 2: 페이지 권한 ===
  const [allUserPerms, setAllUserPerms] = useState<Record<string, UserPermMap>>({})
  const [savingPermsFor, setSavingPermsFor] = useState<string | null>(null)
  const [selectedPermUserId, setSelectedPermUserId] = useState<string | null>(null)

  const activeCompanyId = company?.id

  useEffect(() => { loadAll() }, [company])
  useEffect(() => {
    if (topTab === 'invitations' && ['admin', 'master'].includes(role || '')) loadInvitations()
  }, [topTab, role])
  useEffect(() => {
    if (topTab === 'external') loadExternal()
  }, [topTab])
  // 모달의 § 페이지 권한 섹션이 처음 활성화되면 권한 데이터 prefetch
  useEffect(() => {
    if (editingEmp && editSection === 'permissions' && !allUserPerms[editingEmp.id]) {
      loadAllUserPermissions()
    }
  }, [editingEmp, editSection])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([loadEmployees(), loadPositions(), loadDepartments(), loadModules(), loadAllUserPermissions()])
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

  // 외부 인력 — freelancers (3.3% 사업소득) + ride_employees (라이드 인력)
  const loadExternal = async () => {
    try {
      const [flRes, riRes] = await Promise.all([
        fetch('/api/freelancers?order=name', { headers: await getAuthHeader() }),
        fetch('/api/ride-employees', { headers: await getAuthHeader() }),
      ])
      const flJson = await flRes.json().catch(() => ({}))
      const riJson = await riRes.json().catch(() => ({}))
      setFreelancers(flJson.data || [])
      setRideEmployees(riJson.data || [])
    } catch {
      setFreelancers([]); setRideEmployees([])
    }
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
          path: m.path,
          name: PATH_TO_NAME[m.path] || m.name,
          group: PATH_TO_GROUP_LABEL[m.path] || '기타',
        })))
        return
      }
    } catch {}
    // menu-registry 의 모든 권한 부여 대상 메뉴를 fallback 으로
    setActiveModules(REGISTRY_MENUS
      .filter(m => !m.hidden)
      .filter(m => ['asset', 'operation', 'finance', 'sales', 'hr', 'admin'].includes(m.group))
      .map(m => ({
        path: m.path,
        name: m.displayName || m.name,
        group: REGISTRY_GROUPS.find(g => g.id === m.group)?.label || '기타',
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

  // ===== 「소속 유형」 헬퍼 =====
  // FMI = 본 회사 정직원 (급여 모달 노출)
  // 외부 매니저 = 라이드주식회사 부서 (본 ERP 권한만, 급여 본 시스템 X)
  // 시스템 관리자 = role='admin' (GOD ADMIN — 급여 무관)
  type SoSokType = 'fmi' | 'external' | 'admin'
  const getSoSokType = (emp: any): SoSokType => {
    if (emp.role === 'admin') return 'admin'
    const dept = emp.department?.name || ''
    if (dept === '라이드주식회사' || /라이드/.test(dept)) return 'external'
    return 'fmi'
  }
  const SOSOK_LABEL: Record<SoSokType, string> = { fmi: 'FMI 직원', external: '외부 매니저', admin: '시스템 관리자' }
  const SOSOK_STYLE: Record<SoSokType, { bg: string; color: string }> = {
    fmi:      { bg: 'rgba(34,197,94,0.12)', color: '#16a34a' },
    external: { bg: 'rgba(168,85,247,0.12)', color: '#9333ea' },
    admin:    { bg: 'rgba(14,165,233,0.12)', color: '#0284c7' },
  }
  // 외부 매니저 + admin 은 급여 모달 § 급여 설정 노출 안 함
  const showSalaryTab = (emp: any) => getSoSokType(emp) === 'fmi' && (emp.role === 'user' || emp.role === 'master')

  // ===== 검색 + 필터 로직 =====
  // sosokFilter: all / fmi / external / admin (소속 유형)
  const [sosokFilter, setSosokFilter] = useState<'all' | SoSokType>('all')

  const filteredEmployees = useMemo(() => {
    let list = employees
    // 재직 상태 필터 (active / on_leave / resigned)
    if (statusFilter === 'active') list = list.filter(e => getEmpStatus(e) === 'active')
    else if (statusFilter === 'on_leave') list = list.filter(e => getEmpStatus(e) === 'on_leave')
    else if (statusFilter === 'resigned') list = list.filter(e => getEmpStatus(e) === 'resigned')
    else if (statusFilter === 'inactive') list = list.filter(e => !e.is_active) // 옛 호환
    if (sosokFilter !== 'all') list = list.filter(e => getSoSokType(e) === sosokFilter)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      list = list.filter(e =>
        (e.display_name || e.employee_name || '').toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q) ||
        (e.position?.name || '').toLowerCase().includes(q) ||
        (e.department?.name || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [employees, searchTerm, statusFilter, sosokFilter])

  // 재직 상태 헬퍼 (emp_status + 폴백 — 마이그레이션 미적용 환경 대응)
  type EmpStatus = 'active' | 'on_leave' | 'resigned'
  const getEmpStatus = (emp: any): EmpStatus => {
    const s = emp.emp_status as EmpStatus | null
    if (s === 'active' || s === 'on_leave' || s === 'resigned') return s
    // 폴백: emp_status 미사용 환경 → resign_date 또는 is_active 로 추정
    if (emp.resign_date) return 'resigned'
    if (!emp.is_active) return 'resigned'
    return 'active'
  }
  const STATUS_LABEL: Record<EmpStatus, string> = { active: '재직', on_leave: '휴직', resigned: '퇴사' }
  const STATUS_STYLE_EMP: Record<EmpStatus, { bg: string; color: string }> = {
    active:   { bg: 'rgba(34,197,94,0.12)', color: '#16a34a' },
    on_leave: { bg: 'rgba(251,191,36,0.18)', color: '#a16207' },
    resigned: { bg: 'rgba(239,68,68,0.12)', color: '#dc2626' },
  }

  const workingCount = employees.filter(e => getEmpStatus(e) === 'active').length
  const onLeaveCount = employees.filter(e => getEmpStatus(e) === 'on_leave').length
  const resignedCount = employees.filter(e => getEmpStatus(e) === 'resigned').length
  const pendingInvitationCount = invitations.filter((inv: any) => inv.status === 'pending').length
  const fmiCount = employees.filter(e => getSoSokType(e) === 'fmi').length
  const externalCount = employees.filter(e => getSoSokType(e) === 'external').length
  const adminSosokCount = employees.filter(e => getSoSokType(e) === 'admin').length

  // ===== 필터 탭 — 재직 상태 (재직 / 휴직 / 퇴사) =====
  const FILTER_ITEMS: FilterItem[] = [
    { key: 'all', label: '전체', count: employees.length },
    { key: 'active', label: '재직', count: workingCount },
    { key: 'on_leave', label: '휴직', count: onLeaveCount },
    { key: 'resigned', label: '퇴사', count: resignedCount },
  ]
  // 옛 active/inactive 값 호환
  const activeCount = workingCount
  const inactiveCount = employees.filter(e => !e.is_active).length
  // ===== 소속 유형 필터 =====
  const SOSOK_FILTER_ITEMS: FilterItem[] = [
    { key: 'all',      label: '전체 소속',     count: employees.length },
    { key: 'fmi',      label: '🏢 FMI 직원',   count: fmiCount },
    { key: 'external', label: '👥 외부 매니저', count: externalCount },
    { key: 'admin',    label: '🔧 시스템 관리자', count: adminSosokCount },
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
  const openEditModal = async (emp: any) => {
    setEditingEmp(emp)
    setEditSection('profile')
    setEditForm({
      employee_name: emp.employee_name || '',  // DB 원본 값 (null이면 빈 문자열)
      phone: emp.phone || '',
      position_id: emp.position_id || '',
      department_id: emp.department_id || '',
      role: emp.role || 'user',
      is_active: !!emp.is_active,
      // 2026-05-06 PR-B3 — 인사 정보
      hire_date: emp.hire_date ? String(emp.hire_date).slice(0, 10) : '',
      resign_date: emp.resign_date ? String(emp.resign_date).slice(0, 10) : '',
      resign_reason: emp.resign_reason || '',
      emp_status: emp.emp_status || 'active', // active / on_leave / resigned
    })
    // 급여 설정 prefetch
    try {
      const res = await fetch(`/api/employee_salaries?employee_id=${encodeURIComponent(emp.id)}`, { headers: await getAuthHeader() })
      const json = await res.json()
      const row = (json.data || [])[0]
      if (row) {
        // allowances JSON 파싱 — meal_allowance 는 분리, 나머지는 extra_allowances 로
        let mealAllow = ''
        const extras: Record<string, string> = {}
        try {
          const allowances = typeof row.allowances === 'string' ? JSON.parse(row.allowances) : (row.allowances || {})
          if (allowances && typeof allowances === 'object') {
            // 식대 — 우선순위 (legacy 호환)
            mealAllow = String(allowances.meal_allowance ?? allowances.식대 ?? allowances.meal ?? '')
            // legacy 한글 키 → 영문 키 매핑
            const LEGACY_MAP: Record<string, string> = {
              '교통비': 'transport_allowance', '자가운전보조금': 'self_drive_allowance',
              '직책수당': 'position_allowance', '가족수당': 'family_allowance',
              '야간수당': 'night_allowance', '연장수당': 'overtime_allowance',
              '연차수당': 'annual_leave_allowance', '상여금': 'bonus',
            }
            for (const [k, v] of Object.entries(allowances)) {
              if (k === 'meal_allowance' || k === '식대' || k === 'meal') continue
              const mappedKey = LEGACY_MAP[k] || k
              const amt = Number(v || 0)
              if (amt > 0) extras[mappedKey] = String(amt)
            }
          }
        } catch {}
        setSalaryForm({
          id: row.id,
          base_salary: row.base_salary != null ? String(row.base_salary) : '',
          meal_allowance: mealAllow,
          extra_allowances: extras,
          bank_name: row.bank_name || '',
          account_number: row.account_number || '',
          account_holder: row.account_holder || (emp.employee_name || ''),
          payment_day: row.payment_day != null ? String(row.payment_day) : '25',
          is_active: !!row.is_active,
        })
      } else {
        setSalaryForm({
          id: null, base_salary: '', meal_allowance: '', extra_allowances: {}, bank_name: '', account_number: '',
          account_holder: emp.employee_name || '', payment_day: '25', is_active: true,
        })
      }
    } catch {
      setSalaryForm({
        id: null, base_salary: '', meal_allowance: '', extra_allowances: {}, bank_name: '', account_number: '',
        account_holder: emp.employee_name || '', payment_day: '25', is_active: true,
      })
    }
    setShowAddAllowance(false)
  }
  const closeEditModal = () => { setEditingEmp(null); setEditForm({}); setSavingEdit(false); setEditSection('profile') }

  // ===== 급여 설정 저장 =====
  const saveSalary = async () => {
    if (!editingEmp) return
    setSavingSalary(true)
    try {
      const baseSalary = Number(salaryForm.base_salary || 0)
      const mealAmt = Number(salaryForm.meal_allowance || 0)
      const allowances: Record<string, number> = {}
      if (mealAmt > 0) allowances.meal_allowance = mealAmt
      // 추가 수당 병합 (Q3γ — 동적 수당)
      for (const [k, v] of Object.entries(salaryForm.extra_allowances)) {
        const amt = Number(v || 0)
        if (amt > 0) allowances[k] = amt
      }
      const payload = {
        employee_id: editingEmp.id,
        company_id: company?.id,
        base_salary: baseSalary,
        allowances,
        payment_day: Number(salaryForm.payment_day || 25),
        bank_name: salaryForm.bank_name || null,
        account_number: salaryForm.account_number || null,
        account_holder: salaryForm.account_holder || null,
        is_active: salaryForm.is_active,
      }
      // 신규 / 갱신 — POST UPSERT (ON DUPLICATE KEY UPDATE)
      const res = await fetch('/api/employee_salaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        alert('급여 설정 저장 실패: ' + (json.error || res.statusText))
      } else {
        // refresh — id 갱신
        if (json.data?.id) setSalaryForm(prev => ({ ...prev, id: json.data.id }))
        alert('급여 설정이 저장되었습니다.')
      }
    } catch (e: any) {
      alert('급여 설정 저장 실패: ' + e.message)
    } finally {
      setSavingSalary(false)
    }
  }

  const saveEdit = async () => {
    if (!editingEmp) return
    setSavingEdit(true)
    try {
      // emp_status === 'resigned' 면 is_active=false 자동 동기화 (계정 비활성)
      const isResigned = editForm.emp_status === 'resigned'
      const payload = {
        ...editForm,
        position_id: editForm.position_id || null,
        department_id: editForm.department_id || null,
        hire_date: editForm.hire_date || null,
        resign_date: editForm.resign_date || null,
        resign_reason: editForm.resign_reason || null,
        is_active: isResigned ? false : editForm.is_active,
      }
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
    const name = editingEmp.display_name || editingEmp.employee_name || editingEmp.email
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
      key: 'name', label: '직원', width: '32%',
      render: (emp) => {
        const sosok = getSoSokType(emp)
        const sty = SOSOK_STYLE[sosok]
        const avatarBg = sosok === 'admin' ? '#0ea5e9' : sosok === 'external' ? '#9333ea' : sosok === 'fmi' && emp.role === 'master' ? '#2563eb' : '#22c55e'
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13, flexShrink: 0, background: avatarBg }}>
              {(emp.display_name || emp.email || '?')[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: emp.employee_name ? '#1e293b' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {emp.display_name || '(이름 미설정)'}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: sty.bg, color: sty.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {SOSOK_LABEL[sosok]}
                </span>
                {!emp.employee_name && <span style={{ fontSize: 10, color: '#d97706', fontWeight: 500 }}>이름 미등록</span>}
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
      key: 'role', label: '권한', width: 90, align: 'center',
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
      key: 'status', label: '재직상태', width: 80, align: 'center',
      render: (emp) => {
        const s = getEmpStatus(emp)
        const sty = STATUS_STYLE_EMP[s]
        return (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
            background: sty.bg, color: sty.color,
          }}>
            {STATUS_LABEL[s]}
          </span>
        )
      },
    },
    {
      key: 'hire_date', label: '입사/퇴사', width: 130, align: 'center', hideOnMobile: true,
      render: (emp) => {
        if (!emp.hire_date && !emp.resign_date) return <span style={{ fontSize: 11, color: '#cbd5e1' }}>-</span>
        return (
          <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
            {emp.hire_date && <div>입사 {String(emp.hire_date).slice(0, 10)}</div>}
            {emp.resign_date && <div style={{ color: '#dc2626' }}>퇴사 {String(emp.resign_date).slice(0, 10)}</div>}
          </div>
        )
      },
    },
    {
      key: 'created_at', label: '가입일', width: 120, align: 'right', hideOnMobile: true,
      render: (emp) => <span style={{ fontSize: 12, color: '#94a3b8' }}>{formatDate(emp.created_at)}</span>,
    },
  ]

  const employeeMobileCard: MobileCardConfig<any> = {
    title: (emp) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600 }}>{emp.display_name || '(이름 미설정)'}</span>
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
        background: !!emp.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        color: !!emp.is_active ? '#16a34a' : '#dc2626',
      }}>
        {!!emp.is_active ? '활성' : '비활성'}
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

  const assignableEmployees = employees.filter(e => e.role === 'user' && !!e.is_active)

  const TAB_FILTERS: FilterItem[] = [
    { key: 'organization', label: '조직 관리', count: employees.length },
    { key: 'permissions', label: '페이지 권한', count: assignableEmployees.length },
  ]

  // menu-registry 의 모든 그룹 순서 (비즈니스 5 + 직장인필수 + CX팀 + 설정)
  // requirePermission=true 인 메뉴가 있는 그룹은 모두 권한 페이지에 표시
  const GROUP_ORDER = REGISTRY_GROUPS
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(g => g.label)
    .concat(['기타'])
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
          { label: '전체', value: employees.length, tint: 'blue' },
          { label: '재직', value: workingCount, tint: 'green' },
          { label: '휴직', value: onLeaveCount, tint: 'amber' },
          { label: '퇴사', value: resignedCount, tint: 'red' },
          { label: '대기중 초대', value: pendingInvitationCount, tint: 'amber' },
        ]}
        actions={[
          { label: '직원 초대', onClick: () => setShowInviteModal(true), variant: 'primary', icon: '+' },
        ]}
      />

      {/* 통합 페이지 4 탭 */}
      <DcToolbar
        search=""
        onSearchChange={() => {}}
        noSearch
        filters={[
          { key: 'employees', label: '👥 직원 관리', count: employees.length },
          { key: 'org', label: '🏢 부서 · 직급', count: positions.length + departments.length },
          { key: 'invitations', label: '✉️ 초대 관리', count: invitations.length },
          { key: 'external', label: '👤 외부 인력', count: freelancers.length + rideEmployees.length },
          { key: 'payroll', label: '💼 급여 운영' },
        ]}
        activeFilter={topTab}
        onFilterChange={(key) => changeTab(key as TopTab)}
      />

      {/* ─── 탭 1: 직원 관리 ─── */}
      {topTab === 'employees' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 소속 유형 필터 — FMI / 외부 매니저 / 시스템 관리자 구분 */}
          <DcToolbar
            search=""
            onSearchChange={() => {}}
            noSearch
            filters={SOSOK_FILTER_ITEMS}
            activeFilter={sosokFilter}
            onFilterChange={(key) => setSosokFilter(key as 'all' | SoSokType)}
          />
          {/* 검색 + 활성/비활성 필터 */}
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
            emptyMessage="직원이 없습니다 — 「✉️ 초대 관리」 탭에서 새 직원 초대"
            mobileCard={employeeMobileCard}
            loading={false}
          />
        </div>
      )}

      {/* ─── 탭 2: 부서 · 직급 ─── */}
      {topTab === 'org' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 직급 */}
          <div style={{ ...glassCard, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>📊 직급 ({positions.length})</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>직급명</label>
                <input value={newPositionName} onChange={e => setNewPositionName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addPosition()}
                  style={{ width: '100%', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} placeholder="예: 과장" />
              </div>
              <div style={{ width: 80 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>레벨</label>
                <input type="number" min={1} max={10} value={newPositionLevel}
                  onChange={e => setNewPositionLevel(Number(e.target.value))}
                  style={{ width: '100%', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} />
              </div>
              <button onClick={addPosition} style={{ padding: '8px 14px', background: '#3b82f6', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', flexShrink: 0 }}>+ 추가</button>
            </div>
            <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, overflow: 'hidden' }}>
              {positions.map(pos => (
                <div key={pos.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  {editingPosId === pos.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
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
              {positions.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>직급이 없습니다.</div>}
            </div>
          </div>

          {/* 부서 */}
          <div style={{ ...glassCard, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>🏢 부서 ({departments.length})</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>부서명</label>
                <input value={newDeptName} onChange={e => setNewDeptName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addDepartment()}
                  style={{ width: '100%', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} placeholder="예: 영업팀" />
              </div>
              <button onClick={addDepartment} style={{ padding: '8px 14px', background: '#3b82f6', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', flexShrink: 0 }}>+ 추가</button>
            </div>
            <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, overflow: 'hidden' }}>
              {departments.map(dept => (
                <div key={dept.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  {editingDeptId === dept.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
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
              {departments.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>부서가 없습니다.</div>}
            </div>
          </div>
        </div>
      )}

      {/* ─── 탭 3: 초대 관리 ─── */}
      {topTab === 'invitations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowInviteModal(true)}
              style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }}>
              + 직원 초대
            </button>
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
      )}

      {/* ─── 탭 4: 외부 인력 ─── */}
      {topTab === 'external' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 안내 */}
          <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: '8px 14px', fontSize: 12, color: '#2563eb' }}>
            💡 외부 인력은 직원 (profiles) 과 별개 — 시스템 권한/계정 X. <b>등록/수정은 여기서</b>, <b>월별 지급</b>은 「💼 급여 운영 → 프리랜서 지급」 탭.
          </div>

          {/* 프리랜서 */}
          <div style={{ ...glassCard, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>🤝 프리랜서 ({freelancers.length})</h3>
              <button onClick={() => openFreelancerForm()}
                style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#fff', background: '#3b82f6', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                + 프리랜서 추가
              </button>
            </div>
            <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10, overflow: 'hidden' }}>
              {freelancers.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  등록된 프리랜서 없음 — 「+ 프리랜서 추가」 버튼 클릭
                </div>
              )}
              {freelancers.map((f: any) => (
                <div key={f.id} onClick={() => openFreelancerForm(f)}
                  style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {f.service_type || '-'} · {f.tax_type || '-'} · {f.bank_name || '-'} {f.account_number || ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={(e) => { e.stopPropagation(); toggleFreelancerActive(f) }}
                      style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: f.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.04)', color: f.is_active ? '#16a34a' : '#94a3b8', border: 'none', cursor: 'pointer' }}>
                      {f.is_active ? '활성' : '비활성'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 라이드 직원 (조회 only — 매칭 사전용) */}
          <div style={{ ...glassCard, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>🚗 라이드 인력 ({rideEmployees.length}) — 조회 only</h3>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
              ※ 라이드주식회사 직원 — 본 ERP 시스템 계정 X. 매칭 사전 / 근무스케줄 페이지 (CallScheduler) 에서 관리.
            </div>
            <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10, overflow: 'hidden' }}>
              {rideEmployees.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  등록된 라이드 인력 없음
                </div>
              )}
              {rideEmployees.map((r: any) => (
                <div key={r.id} style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {r.department || '-'} · {r.position || '-'} · {r.employment_type || '-'}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: r.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.04)', color: r.is_active ? '#16a34a' : '#94a3b8' }}>
                    {r.is_active ? '활성' : '비활성'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── 탭 5: 💼 급여 운영 (PR-B7 — inline 컴포넌트 렌더) ─── */}
      {topTab === 'payroll' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <PayrollOps />
        </div>
      )}

      {/* === 옛날 탭들 (부서/직급 collapsible / 초대 / master-detail 권한) — /hr/org 로 이전 === */}
      {false && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 직원 목록 dummy — TS unused 경고 회피 */}
          <div>
            <DcToolbar
              search={searchTerm}
              onSearchChange={setSearchTerm}
              placeholder=""
              filters={FILTER_ITEMS}
              activeFilter={statusFilter}
              onFilterChange={setStatusFilter}
            />
            <NeuDataTable
              columns={employeeColumns}
              data={filteredEmployees}
              rowKey={(emp) => emp.id}
              onRowClick={openEditModal}
              emptyMessage=""
              mobileCard={employeeMobileCard}
              loading={false}
            />
          </div>

          {/* 직급 · 부서 관리 — 접기/펼치기 */}
          <div style={glassCard}>
            <div onClick={() => setShowPositionsDepts(!showPositionsDepts)}
              style={{ ...sectionHeader, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', margin: 0 }}>직급 · 부서 관리</h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>직급 {positions.length}개 · 부서 {departments.length}개</p>
              </div>
              <svg style={{ width: 20, height: 20, color: '#94a3b8', transform: showPositionsDepts ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {showPositionsDepts && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5" style={{ padding: 20 }}>
            {/* 직급 관리 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
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
              <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.40)' }}>
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
              <div>
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
              <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.40)' }}>
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
            )}
          </div>

          {/* 초대 관리 — 접기/펼치기 */}
          <div style={glassCard}>
            <div onClick={() => setShowInvitations(!showInvitations)}
              style={{ ...sectionHeader, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', margin: 0 }}>초대 관리</h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>총 {invitations.length}개 · 대기중 {pendingInvitationCount}개</p>
              </div>
              <svg style={{ width: 20, height: 20, color: '#94a3b8', transform: showInvitations ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {showInvitations && (
              <NeuDataTable
                columns={inviteColumns}
                data={invitations}
                rowKey={(inv) => inv.id}
                emptyMessage="초대 내역이 없습니다"
                mobileCard={inviteMobileCard}
                loading={loadingInvitations}
              />
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* OLD Tab 2 — 페이지 권한 master-detail view (모달이 대체) */}
      {/* /hr/people 에서는 모달의 § 페이지 권한 탭을 사용 */}
      {/* ================================================================ */}
      {false && activeTab === 'permissions' && (
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
                          {(emp.display_name || emp.email || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: isSelected ? '#1e3a5f' : '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {emp.display_name || '(미설정)'}
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
                            {(emp.display_name || emp.email || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>{emp.display_name || '(이름 미설정)'}</span>
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

      {/* 프리랜서 등록/수정 모달 (PR-B5 Q2a) */}
      {showFreelancerForm && (
        <div onClick={closeFreelancerForm}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'rgba(255,255,255,0.92)', borderRadius: 20, width: '100%', maxWidth: 560, boxShadow: '0 25px 50px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.40)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 }}>
                🤝 {editingFreelancerId ? '프리랜서 수정' : '프리랜서 등록'}
              </h3>
              <button onClick={closeFreelancerForm} style={{ fontSize: 22, fontWeight: 300, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, width: 32, height: 32 }}>×</button>
            </div>
            <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>이름 *</label>
                  <input value={freelancerForm.name} onChange={e => setFreelancerForm({ ...freelancerForm, name: e.target.value })}
                    placeholder="홍길동"
                    style={{ width: '100%', padding: 10, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>전화</label>
                  <input value={freelancerForm.phone} onChange={e => setFreelancerForm({ ...freelancerForm, phone: e.target.value })}
                    placeholder="010-1234-5678"
                    style={{ width: '100%', padding: 10, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>이메일</label>
                  <input value={freelancerForm.email} onChange={e => setFreelancerForm({ ...freelancerForm, email: e.target.value })}
                    style={{ width: '100%', padding: 10, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>주민/사업자</label>
                  <input value={freelancerForm.reg_number} onChange={e => setFreelancerForm({ ...freelancerForm, reg_number: e.target.value })}
                    style={{ width: '100%', padding: 10, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>업무 유형</label>
                  <select value={freelancerForm.service_type} onChange={e => setFreelancerForm({ ...freelancerForm, service_type: e.target.value })}
                    style={{ width: '100%', padding: 10, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)' }}>
                    {FL_SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>세금 처리</label>
                  <select value={freelancerForm.tax_type} onChange={e => setFreelancerForm({ ...freelancerForm, tax_type: e.target.value })}
                    style={{ width: '100%', padding: 10, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)' }}>
                    {FL_TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 14 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>계좌 정보</h4>
                <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>은행</label>
                    <select value={freelancerForm.bank_name} onChange={e => setFreelancerForm({ ...freelancerForm, bank_name: e.target.value })}
                      style={{ width: '100%', padding: 10, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)' }}>
                      {FL_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>예금주</label>
                    <input value={freelancerForm.account_holder} onChange={e => setFreelancerForm({ ...freelancerForm, account_holder: e.target.value })}
                      style={{ width: '100%', padding: 10, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>계좌번호</label>
                  <input value={freelancerForm.account_number} onChange={e => setFreelancerForm({ ...freelancerForm, account_number: e.target.value })}
                    style={{ width: '100%', padding: 10, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>메모</label>
                <textarea value={freelancerForm.memo} onChange={e => setFreelancerForm({ ...freelancerForm, memo: e.target.value })}
                  rows={2}
                  style={{ width: '100%', padding: 10, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.40)', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={closeFreelancerForm}
                style={{ flex: 1, padding: '10px 0', border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', color: '#64748b', borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                취소
              </button>
              <button onClick={saveFreelancer} disabled={savingFreelancer}
                style={{ flex: 2, padding: '10px 0', background: savingFreelancer ? '#94a3b8' : '#3b82f6', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 13, border: 'none', cursor: savingFreelancer ? 'not-allowed' : 'pointer' }}>
                {savingFreelancer ? '저장 중...' : (editingFreelancerId ? '수정 저장' : '등록')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 직원 수정 모달 — Glass Level 4 (통합) */}
      {editingEmp && (
        <div onClick={closeEditModal}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'rgba(255,255,255,0.92)', borderRadius: 20, width: '100%', maxWidth: 880, boxShadow: '0 25px 50px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>

            {/* 모달 헤더 — Glass */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.40)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: 14,
                  background: editingEmp.role === 'admin' ? '#0ea5e9' : editingEmp.role === 'master' ? '#2563eb' : '#94a3b8',
                }}>
                  {(editingEmp.display_name || editingEmp.email || '?')[0].toUpperCase()}
                </div>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 600, color: '#1e293b', margin: 0 }}>{editingEmp.display_name || '(이름 미설정)'}</h3>
                  <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{editingEmp.email}</p>
                </div>
              </div>
              <button onClick={closeEditModal} style={{ fontSize: 22, fontWeight: 300, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
            </div>

            {/* 섹션 탭 — 기본정보 / 급여설정 (FMI 직원만) / 페이지권한 (user 만) */}
            {/* 외부 매니저 (라이드주식회사) + admin (GOD) 은 § 급여 미노출 — 본 ERP 급여 받지 않음 */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.30)', flexShrink: 0 }}>
              {([
                { key: 'profile', label: '👤 기본정보' },
                ...(showSalaryTab(editingEmp) ? [{ key: 'salary', label: '💼 급여 설정' }] : []),
                ...(editingEmp.role === 'user' ? [{ key: 'permissions', label: '🔐 페이지 권한' }] : []),
              ] as Array<{ key: EditSection; label: string }>).map(t => (
                <button key={t.key} onClick={() => setEditSection(t.key)}
                  style={{
                    flex: 1, padding: '12px 16px', fontSize: 13, fontWeight: 600,
                    background: editSection === t.key ? 'rgba(59,130,246,0.08)' : 'transparent',
                    color: editSection === t.key ? '#2563eb' : '#64748b',
                    border: 'none', borderBottom: editSection === t.key ? '2px solid #3b82f6' : '2px solid transparent',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>

            {/* § 기본정보 */}
            {editSection === 'profile' && (
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
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>계정 활성</label>
                    <select value={editForm.is_active ? 'active' : 'inactive'} onChange={e => setEditForm({ ...editForm, is_active: e.target.value === 'active' })}
                      style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, background: 'rgba(255,255,255,0.6)', outline: 'none' }}>
                      <option value="active">로그인 가능</option>
                      <option value="inactive">로그인 차단</option>
                    </select>
                    <span style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginTop: 4 }}>※ 재직상태는 ↓ 인사 정보에서</span>
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
                {/* § 인사 정보 — 입사일 / 퇴사일 / 재직상태 (2026-05-06 PR-B3) */}
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    📅 인사 정보
                  </h4>
                  <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>입사일</label>
                      <input type="date" value={editForm.hire_date || ''}
                        onChange={e => setEditForm({ ...editForm, hire_date: e.target.value })}
                        style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>재직 상태</label>
                      <select value={editForm.emp_status || 'active'}
                        onChange={e => {
                          const v = e.target.value
                          setEditForm({
                            ...editForm,
                            emp_status: v,
                            // 퇴사 선택 시 퇴사일 자동 오늘 (이미 있으면 유지)
                            resign_date: v === 'resigned' ? (editForm.resign_date || new Date().toISOString().slice(0, 10)) : (v === 'active' ? '' : editForm.resign_date),
                          })
                        }}
                        style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, background: 'rgba(255,255,255,0.6)', outline: 'none' }}>
                        <option value="active">🟢 재직</option>
                        <option value="on_leave">🟡 휴직</option>
                        <option value="resigned">🔴 퇴사</option>
                      </select>
                    </div>
                  </div>
                  {/* 퇴사 선택 시 퇴사일 + 사유 입력 */}
                  {editForm.emp_status === 'resigned' && (
                    <div style={{ background: 'rgba(254,226,226,0.4)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>퇴사일</label>
                        <input type="date" value={editForm.resign_date || ''}
                          onChange={e => setEditForm({ ...editForm, resign_date: e.target.value })}
                          style={{ width: '100%', padding: 10, border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.8)', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>퇴사 사유</label>
                        <input value={editForm.resign_reason || ''}
                          onChange={e => setEditForm({ ...editForm, resign_reason: e.target.value })}
                          placeholder="예: 자진퇴사 / 이직 / 계약만료"
                          style={{ width: '100%', padding: 10, border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.8)', boxSizing: 'border-box' }} />
                      </div>
                      <p style={{ fontSize: 11, color: '#ef4444', margin: 0 }}>
                        ⚠ 퇴사 처리 시 자동으로 계정 비활성 (is_active = false) 됩니다.
                      </p>
                    </div>
                  )}
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
            )}

            {/* § 급여 설정 — 관리용 단순 버전 (세무 정밀계산은 외부 세무사) */}
            {editSection === 'salary' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#2563eb' }}>
                  💡 관리용 기본 정보 — 4대보험·소득세 정밀계산은 외부 세무사 영역
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>기본급 (월)</label>
                    <input type="number" value={salaryForm.base_salary}
                      onChange={e => setSalaryForm({ ...salaryForm, base_salary: e.target.value })}
                      placeholder="3000000"
                      style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums' }} />
                    {salaryForm.base_salary && Number(salaryForm.base_salary) > 0 && (
                      <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                        ₩ {Number(salaryForm.base_salary).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
                      식대 수당 (월 마스터)
                      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>비과세 한도 20만원</span>
                    </label>
                    <input type="number" value={salaryForm.meal_allowance}
                      onChange={e => setSalaryForm({ ...salaryForm, meal_allowance: e.target.value })}
                      placeholder="200000"
                      style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums' }} />
                    {salaryForm.meal_allowance && Number(salaryForm.meal_allowance) > 0 && (
                      <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                        ₩ {Number(salaryForm.meal_allowance).toLocaleString()} <span style={{ color: '#cbd5e1' }}>· 매월 동일 수당</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 추가 수당 — 동적 (Q3γ — 2026-05-06 PR-B5) */}
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>추가 수당 (선택)</h4>
                    <button
                      onClick={() => setShowAddAllowance(!showAddAllowance)}
                      style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, color: '#3b82f6', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, cursor: 'pointer' }}>
                      {showAddAllowance ? '✕ 닫기' : '+ 수당 추가'}
                    </button>
                  </div>
                  {/* 추가된 수당 목록 */}
                  {Object.keys(salaryForm.extra_allowances).length === 0 && !showAddAllowance && (
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>추가 수당 없음 — 「+ 수당 추가」 클릭</p>
                  )}
                  {Object.entries(salaryForm.extra_allowances).map(([k, v]) => {
                    const opt = ALLOWANCE_OPTIONS.find(o => o.key === k)
                    return (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: 8, background: 'rgba(255,255,255,0.4)', borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{ALLOWANCE_LABELS[k] || k}</div>
                          {opt?.hint && <div style={{ fontSize: 10, color: '#94a3b8' }}>{opt.hint}</div>}
                        </div>
                        <input type="number" value={v}
                          onChange={e => setSalaryForm({ ...salaryForm, extra_allowances: { ...salaryForm.extra_allowances, [k]: e.target.value } })}
                          placeholder="0"
                          style={{ width: 130, padding: 8, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.8)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }} />
                        <button
                          onClick={() => {
                            const next = { ...salaryForm.extra_allowances }
                            delete next[k]
                            setSalaryForm({ ...salaryForm, extra_allowances: next })
                          }}
                          style={{ width: 28, height: 28, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#dc2626', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                          ×
                        </button>
                      </div>
                    )
                  })}
                  {/* 「+ 수당 추가」 토글 시 사용 가능 수당 dropdown */}
                  {showAddAllowance && (
                    <div style={{ marginTop: 8, padding: 10, background: 'rgba(59,130,246,0.04)', border: '1px dashed rgba(59,130,246,0.3)', borderRadius: 10 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', marginBottom: 8, margin: 0 }}>추가할 수당 선택:</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {ALLOWANCE_OPTIONS
                          .filter(o => o.key !== 'meal_allowance' && !(o.key in salaryForm.extra_allowances))
                          .map(opt => (
                            <button key={opt.key}
                              onClick={() => {
                                setSalaryForm({
                                  ...salaryForm,
                                  extra_allowances: { ...salaryForm.extra_allowances, [opt.key]: String(opt.defaultAmount) },
                                })
                                setShowAddAllowance(false)
                              }}
                              style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#3b82f6', background: '#fff', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 6, cursor: 'pointer' }}>
                              + {opt.label}
                            </button>
                          ))}
                        {ALLOWANCE_OPTIONS.filter(o => o.key !== 'meal_allowance' && !(o.key in salaryForm.extra_allowances)).length === 0 && (
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>모든 수당이 추가됨</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>지급일</label>
                  <select value={salaryForm.payment_day}
                    onChange={e => setSalaryForm({ ...salaryForm, payment_day: e.target.value })}
                    style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, background: 'rgba(255,255,255,0.6)', outline: 'none' }}>
                    {[5, 10, 15, 20, 25, 28, 30].map(d => <option key={d} value={d}>매월 {d}일</option>)}
                  </select>
                </div>
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>계좌 정보</h4>
                  <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>은행</label>
                      <input value={salaryForm.bank_name}
                        onChange={e => setSalaryForm({ ...salaryForm, bank_name: e.target.value })}
                        placeholder="KB국민은행"
                        style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>예금주</label>
                      <input value={salaryForm.account_holder}
                        onChange={e => setSalaryForm({ ...salaryForm, account_holder: e.target.value })}
                        placeholder="홍길동"
                        style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>계좌번호</label>
                    <input value={salaryForm.account_number}
                      onChange={e => setSalaryForm({ ...salaryForm, account_number: e.target.value })}
                      placeholder="1234-5678-9012"
                      style={{ width: '100%', padding: 12, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.6)', boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums' }} />
                  </div>
                </div>
              </div>
            )}

            {/* § 페이지 권한 — 직원별 (role='user' 만 노출) */}
            {editSection === 'permissions' && editingEmp.role === 'user' && (() => {
              const userMap = allUserPerms[editingEmp.id] || {}
              const enabledCount = Object.values(userMap).filter(p => p.can_view).length
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10 }}>
                    <span style={{ fontSize: 12, color: '#2563eb' }}>
                      💡 활성화된 페이지: <strong>{enabledCount}</strong> / {activeModules.length}
                    </span>
                    <button onClick={() => saveUserPerms(editingEmp.id)}
                      disabled={savingPermsFor === editingEmp.id}
                      style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, color: '#fff', background: savingPermsFor === editingEmp.id ? '#94a3b8' : '#3b82f6', borderRadius: 8, border: 'none', cursor: 'pointer' }}>
                      {savingPermsFor === editingEmp.id ? '저장 중...' : '권한 저장'}
                    </button>
                  </div>
                  <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, overflow: 'hidden', maxHeight: '50vh', overflowY: 'auto' }}>
                    {moduleGroups.map(group => (
                      <div key={group}>
                        <div style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.40)', borderBottom: '1px solid rgba(0,0,0,0.06)', position: 'sticky', top: 0, zIndex: 5 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group}</span>
                        </div>
                        {activeModules.filter(m => m.group === group).map(mod => {
                          const perm = userMap[mod.path]
                          const isOn = !!perm?.can_view
                          return (
                            <div key={mod.path} style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <button onClick={() => matrixTogglePage(editingEmp.id, mod.path)}
                                  style={{
                                    padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', flexShrink: 0,
                                    background: isOn ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.04)',
                                    color: isOn ? '#16a34a' : '#94a3b8', minWidth: 36,
                                  }}>
                                  {isOn ? 'ON' : 'OFF'}
                                </button>
                                <span style={{ fontWeight: 600, fontSize: 13, color: '#334155', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mod.name}</span>
                              </div>
                              {isOn && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, marginLeft: 46, flexWrap: 'wrap' }}>
                                  {(['can_view', 'can_create', 'can_edit', 'can_delete'] as const).map(f => (
                                    <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 11 }}>
                                      <input type="checkbox" checked={perm?.[f] || false}
                                        onChange={() => matrixTogglePerm(editingEmp.id, mod.path, f)}
                                        style={{ width: 13, height: 13, accentColor: '#3b82f6' }} />
                                      <span style={{ fontWeight: 600, color: '#334155' }}>
                                        {f === 'can_view' ? '조회' : f === 'can_create' ? '생성' : f === 'can_edit' ? '수정' : '삭제'}
                                      </span>
                                    </label>
                                  ))}
                                  <select value={perm?.data_scope || 'all'}
                                    onChange={e => matrixChangeScope(editingEmp.id, mod.path, e.target.value)}
                                    style={{ fontSize: 11, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, padding: '2px 6px', background: 'rgba(255,255,255,0.8)', fontWeight: 600, marginLeft: 'auto' }}>
                                    {DATA_SCOPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            </div>

            {/* 직원 탈퇴 — § 기본정보 탭에서만 노출 */}
            {editSection === 'profile' && editingEmp.id !== user?.uid && editingEmp.role !== 'admin' && (
              <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(239,68,68,0.2)', background: 'rgba(254,242,242,0.6)', flexShrink: 0 }}>
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

            {/* 모달 푸터 — Glass — 섹션별 저장 버튼 */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.40)', display: 'flex', gap: 12, flexShrink: 0 }}>
              <button onClick={closeEditModal}
                style={{ flex: 1, padding: '10px 0', border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', color: '#64748b', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                닫기
              </button>
              {editSection === 'profile' && (
                <button onClick={saveEdit} disabled={savingEdit}
                  style={{ flex: 2, padding: '10px 0', background: savingEdit ? '#94a3b8' : '#3b82f6', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 14, border: 'none', cursor: savingEdit ? 'not-allowed' : 'pointer' }}>
                  {savingEdit ? '저장 중...' : '기본정보 저장'}
                </button>
              )}
              {editSection === 'salary' && (
                <button onClick={saveSalary} disabled={savingSalary}
                  style={{ flex: 2, padding: '10px 0', background: savingSalary ? '#94a3b8' : '#3b82f6', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 14, border: 'none', cursor: savingSalary ? 'not-allowed' : 'pointer' }}>
                  {savingSalary ? '저장 중...' : '급여 설정 저장'}
                </button>
              )}
              {editSection === 'permissions' && (
                <span style={{ flex: 2, padding: '10px 0', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
                  ↑ 권한 섹션 상단의 「권한 저장」 버튼으로 저장
                </span>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
    </div>
  )
}
