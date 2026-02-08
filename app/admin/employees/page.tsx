'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import type { Position, Department } from '../../types/rbac'

// ============================================
// 조직/권한 통합 관리 페이지
// master/god_admin만 접근 가능
// ============================================

const DATA_SCOPES = [
  { value: 'all', label: '전체 데이터' },
  { value: 'department', label: '부서만' },
  { value: 'own', label: '본인만' },
]

type ActiveModule = { path: string; name: string; group: string }

// 모듈 path → 그룹 매핑
const MODULE_GROUPS: Record<string, string> = {
  '/registration': '차량 자산', '/insurance': '차량 자산',
  '/quotes': '대고객 영업', '/customers': '대고객 영업', '/contracts': '대고객 영업',
  '/jiip': '파트너 자금', '/invest': '파트너 자금', '/loans': '파트너 자금',
  '/finance': '경영 지원', '/finance/upload': '경영 지원',
}

type PermMatrix = {
  [key: string]: {
    can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean
    data_scope: string; id?: string
  }
}

export default function OrgManagementPage() {
  const { company, role, adminSelectedCompanyId } = useApp()

  const [employees, setEmployees] = useState<any[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeModules, setActiveModules] = useState<ActiveModule[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})

  // 탭
  const [activeTab, setActiveTab] = useState<'employees' | 'org' | 'permissions'>('employees')

  // 직급/부서 추가 폼
  const [newPositionName, setNewPositionName] = useState('')
  const [newPositionLevel, setNewPositionLevel] = useState(4)
  const [newDeptName, setNewDeptName] = useState('')

  // 권한 매트릭스
  const [matrix, setMatrix] = useState<PermMatrix>({})
  const [selectedPosition, setSelectedPosition] = useState<string>('')
  const [saving, setSaving] = useState(false)

  // 사이드바 회사 선택 기준으로 activeCompanyId 결정
  const activeCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  useEffect(() => {
    if (role === 'god_admin') {
      if (adminSelectedCompanyId) {
        setSelectedPosition('')
        loadAll()
      } else {
        // 회사 미선택 시 초기화
        setEmployees([])
        setPositions([])
        setDepartments([])
        setActiveModules([])
        setLoading(false)
      }
    } else if (company) {
      loadAll()
    }
  }, [company, role, adminSelectedCompanyId])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([loadEmployees(), loadPositions(), loadDepartments(), loadModules(), loadPermissions()])
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
    if (data && data.length > 0 && !selectedPosition) setSelectedPosition(data[0].id)
  }

  const loadDepartments = async () => {
    if (!activeCompanyId) return
    const { data } = await supabase.from('departments').select('*').eq('company_id', activeCompanyId).order('name')
    setDepartments(data || [])
  }

  // 회사에 활성화된 모듈만 로드
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

  const loadPermissions = async () => {
    if (!activeCompanyId) return
    const { data } = await supabase.from('page_permissions').select('*').eq('company_id', activeCompanyId)
    const m: PermMatrix = {}
    data?.forEach((p: any) => {
      const key = `${p.position_id}_${p.page_path}`
      m[key] = {
        can_view: p.can_view, can_create: p.can_create,
        can_edit: p.can_edit, can_delete: p.can_delete,
        data_scope: p.data_scope || 'all', id: p.id,
      }
    })
    setMatrix(m)
  }

  // ===== 직원 수정 =====
  const startEdit = (emp: any) => {
    setEditingId(emp.id)
    setEditForm({
      employee_name: emp.employee_name || '',
      phone: emp.phone || '',
      position_id: emp.position_id || '',
      department_id: emp.department_id || '',
      role: emp.role || 'user',
      is_active: emp.is_active !== false,
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    if (role === 'master' && editForm.role === 'god_admin') {
      alert('god_admin 권한은 부여할 수 없습니다.')
      return
    }
    const { error } = await supabase.from('profiles').update(editForm).eq('id', editingId)
    if (error) alert('저장 실패: ' + error.message)
    else { setEditingId(null); loadEmployees() }
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

  // ===== 권한 매트릭스 =====
  const togglePerm = (posId: string, pagePath: string, field: string) => {
    const key = `${posId}_${pagePath}`
    const current = matrix[key] || { can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
    setMatrix(prev => ({ ...prev, [key]: { ...current, [field]: !(current as any)[field] } }))
  }

  const changeScope = (posId: string, pagePath: string, scope: string) => {
    const key = `${posId}_${pagePath}`
    const current = matrix[key] || { can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
    setMatrix(prev => ({ ...prev, [key]: { ...current, data_scope: scope } }))
  }

  const toggleAll = (field: string, value: boolean) => {
    if (!selectedPosition) return
    const newMatrix = { ...matrix }
    activeModules.forEach(mod => {
      const key = `${selectedPosition}_${mod.path}`
      const current = newMatrix[key] || { can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
      newMatrix[key] = { ...current, [field]: value }
    })
    setMatrix(newMatrix)
  }

  const savePermissions = async () => {
    if (!selectedPosition || !activeCompanyId) { alert('직급을 선택해주세요.'); return }
    setSaving(true)

    const upserts: any[] = []
    activeModules.forEach(mod => {
      const key = `${selectedPosition}_${mod.path}`
      const perm = matrix[key]
      if (perm) {
        upserts.push({
          company_id: activeCompanyId, position_id: selectedPosition, page_path: mod.path,
          can_view: perm.can_view, can_create: perm.can_create,
          can_edit: perm.can_edit, can_delete: perm.can_delete, data_scope: perm.data_scope,
        })
      }
    })

    if (upserts.length > 0) {
      const { error } = await supabase
        .from('page_permissions')
        .upsert(upserts, { onConflict: 'company_id, position_id, page_path' })
      if (error) alert('저장 실패: ' + error.message)
      else { alert('권한이 저장되었습니다.'); loadPermissions() }
    }
    setSaving(false)
  }

  // 그룹별 모듈 분류
  const moduleGroups = [...new Set(activeModules.map(m => m.group))]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600"></div>
      </div>
    )
  }

  const TABS = [
    { key: 'employees' as const, label: '직원', count: employees.length },
    { key: 'org' as const, label: '직급 · 부서', count: positions.length + departments.length },
    { key: 'permissions' as const, label: '페이지 권한', count: activeModules.length },
  ]

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto">

        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold text-slate-900">조직/권한 관리</h1>
          <p className="text-slate-500 mt-1">직원, 직급/부서, 페이지 접근 권한을 한곳에서 관리합니다.</p>
          {role === 'god_admin' && !adminSelectedCompanyId && (
            <div className="mt-4 p-4 bg-sky-50 border border-sky-200 rounded-xl">
              <p className="text-sm font-bold text-sky-700">사이드바에서 회사를 선택해주세요.</p>
              <p className="text-xs text-sky-500 mt-1">조직/권한 관리는 특정 회사를 선택한 상태에서 이용 가능합니다.</p>
            </div>
          )}
        </div>

        {/* god_admin 회사 미선택 시 여기서 멈춤 */}
        {role === 'god_admin' && !adminSelectedCompanyId ? null : (<>

        {/* 탭 */}
        <div className="flex gap-2 mb-6">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                activeTab === tab.key
                  ? 'bg-slate-900 text-white shadow-lg'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {tab.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
              }`}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* ================================================================ */}
        {/* 직원 목록 탭 */}
        {/* ================================================================ */}
        {activeTab === 'employees' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">직원 목록</h2>
                <p className="text-sm text-slate-400 mt-0.5">총 {employees.length}명</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">이름/이메일</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">역할</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">직급</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">부서</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">상태</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => (
                    <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      {editingId === emp.id ? (
                        <>
                          <td className="p-4">
                            <input value={editForm.employee_name} onChange={e => setEditForm({...editForm, employee_name: e.target.value})} className="border rounded px-2 py-1 text-sm w-full" placeholder="이름" />
                            <div className="text-xs text-slate-400 mt-1">{emp.email}</div>
                          </td>
                          <td className="p-4">
                            <select value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value})} className="border rounded px-2 py-1 text-sm">
                              <option value="user">직원</option>
                              <option value="master">관리자</option>
                              {role === 'god_admin' && <option value="god_admin">GOD ADMIN</option>}
                            </select>
                          </td>
                          <td className="p-4">
                            <select value={editForm.position_id} onChange={e => setEditForm({...editForm, position_id: e.target.value || null})} className="border rounded px-2 py-1 text-sm">
                              <option value="">미지정</option>
                              {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </td>
                          <td className="p-4">
                            <select value={editForm.department_id} onChange={e => setEditForm({...editForm, department_id: e.target.value || null})} className="border rounded px-2 py-1 text-sm">
                              <option value="">미지정</option>
                              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                          </td>
                          <td className="p-4">
                            <label className="flex items-center gap-2 text-sm">
                              <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm({...editForm, is_active: e.target.checked})} />
                              활성
                            </label>
                          </td>
                          <td className="p-4 text-right space-x-2">
                            <button onClick={saveEdit} className="text-sm font-bold text-blue-600 hover:underline">저장</button>
                            <button onClick={() => setEditingId(null)} className="text-sm font-bold text-slate-400 hover:underline">취소</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-4">
                            <div className="font-bold text-slate-900">{emp.employee_name || '(이름 미설정)'}</div>
                            <div className="text-xs text-slate-400 mt-0.5">{emp.email}</div>
                          </td>
                          <td className="p-4">
                            <span className={`text-xs font-bold px-2 py-1 rounded ${
                              emp.role === 'god_admin' ? 'bg-sky-100 text-sky-700' :
                              emp.role === 'master' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>{emp.role === 'god_admin' ? 'GOD ADMIN' : emp.role === 'master' ? '관리자' : '직원'}</span>
                          </td>
                          <td className="p-4 text-sm text-slate-600">{emp.position?.name || '-'}</td>
                          <td className="p-4 text-sm text-slate-600">{emp.department?.name || '-'}</td>
                          <td className="p-4">
                            <span className={`text-xs font-bold px-2 py-1 rounded ${emp.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {emp.is_active !== false ? '활성' : '비활성'}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <button onClick={() => startEdit(emp)} className="text-sm font-bold text-blue-600 hover:underline">수정</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {employees.length === 0 && (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-400">직원이 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* 직급 · 부서 탭 */}
        {/* ================================================================ */}
        {activeTab === 'org' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 직급 관리 */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h2 className="text-base font-bold mb-3">직급 추가</h2>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">직급명</label>
                    <input value={newPositionName} onChange={e => setNewPositionName(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="예: 과장" />
                  </div>
                  <div className="w-24">
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">레벨</label>
                    <input type="number" min={1} max={10} value={newPositionLevel}
                      onChange={e => setNewPositionLevel(Number(e.target.value))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <button onClick={addPosition} className="px-4 py-2 bg-slate-900 text-white rounded-lg font-bold text-sm hover:bg-slate-800 flex-shrink-0">
                    추가
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-500">직급 목록 ({positions.length})</h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {positions.map(pos => (
                    <div key={pos.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/50">
                      <div className="flex items-center gap-3">
                        <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded w-12 text-center">
                          Lv.{pos.level}
                        </span>
                        <span className="font-bold text-sm text-slate-800">{pos.name}</span>
                      </div>
                      <button onClick={() => deletePosition(pos.id)} className="text-xs font-bold text-red-400 hover:text-red-600">삭제</button>
                    </div>
                  ))}
                  {positions.length === 0 && (
                    <div className="p-6 text-center text-slate-400 text-sm">직급이 없습니다.</div>
                  )}
                </div>
              </div>
            </div>

            {/* 부서 관리 */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h2 className="text-base font-bold mb-3">부서 추가</h2>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">부서명</label>
                    <input value={newDeptName} onChange={e => setNewDeptName(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="예: 영업팀" />
                  </div>
                  <button onClick={addDepartment} className="px-4 py-2 bg-slate-900 text-white rounded-lg font-bold text-sm hover:bg-slate-800 flex-shrink-0">
                    추가
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-500">부서 목록 ({departments.length})</h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {departments.map(dept => (
                    <div key={dept.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/50">
                      <span className="font-bold text-sm text-slate-800">{dept.name}</span>
                      <button onClick={() => deleteDepartment(dept.id)} className="text-xs font-bold text-red-400 hover:text-red-600">삭제</button>
                    </div>
                  ))}
                  {departments.length === 0 && (
                    <div className="p-6 text-center text-slate-400 text-sm">부서가 없습니다.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* 페이지 권한 탭 */}
        {/* ================================================================ */}
        {activeTab === 'permissions' && (
          <div>
            {/* 직급 선택 + 저장 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2 flex-wrap">
                {positions.map(pos => (
                  <button
                    key={pos.id}
                    onClick={() => setSelectedPosition(pos.id)}
                    className={`px-4 py-2 rounded-lg font-bold text-xs transition-all ${
                      selectedPosition === pos.id
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Lv.{pos.level} {pos.name}
                  </button>
                ))}
              </div>
              <button
                onClick={savePermissions}
                disabled={saving || !selectedPosition}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:bg-slate-300 transition-colors shadow-md"
              >
                {saving ? '저장 중...' : '변경사항 저장'}
              </button>
            </div>

            {positions.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <p className="text-slate-400">직급이 없습니다. &quot;직급 · 부서&quot; 탭에서 먼저 직급을 추가해주세요.</p>
              </div>
            ) : activeModules.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <p className="text-slate-400">활성화된 모듈이 없습니다.</p>
                <p className="text-slate-400 text-sm mt-1">구독 관리에서 모듈을 활성화해주세요.</p>
              </div>
            ) : (
              <>
                {/* 일괄 설정 */}
                <div className="bg-white rounded-t-2xl border border-b-0 border-slate-200 p-3 flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400">일괄:</span>
                  {[
                    { field: 'can_view', label: '조회' },
                    { field: 'can_create', label: '생성' },
                    { field: 'can_edit', label: '수정' },
                    { field: 'can_delete', label: '삭제' },
                  ].map(item => (
                    <div key={item.field} className="flex items-center gap-1">
                      <button onClick={() => toggleAll(item.field, true)}
                        className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold hover:bg-green-200">
                        {item.label} ON
                      </button>
                      <button onClick={() => toggleAll(item.field, false)}
                        className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold hover:bg-red-200">
                        OFF
                      </button>
                    </div>
                  ))}
                </div>

                {/* 권한 매트릭스 */}
                <div className="bg-white rounded-b-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="p-3 text-xs font-bold text-slate-500 min-w-[180px]">페이지</th>
                          <th className="p-3 text-xs font-bold text-slate-500 text-center w-16">조회</th>
                          <th className="p-3 text-xs font-bold text-slate-500 text-center w-16">생성</th>
                          <th className="p-3 text-xs font-bold text-slate-500 text-center w-16">수정</th>
                          <th className="p-3 text-xs font-bold text-slate-500 text-center w-16">삭제</th>
                          <th className="p-3 text-xs font-bold text-slate-500 text-center min-w-[120px]">데이터 범위</th>
                        </tr>
                      </thead>
                      <tbody>
                        {moduleGroups.map(group => (
                          <React.Fragment key={`group-${group}`}>
                            <tr className="bg-slate-100/70">
                              <td colSpan={6} className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{group}</td>
                            </tr>
                            {activeModules.filter(m => m.group === group).map(mod => {
                              const key = `${selectedPosition}_${mod.path}`
                              const perm = matrix[key] || { can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
                              return (
                                <tr key={mod.path} className="border-b border-slate-50 hover:bg-blue-50/30">
                                  <td className="p-3">
                                    <div className="font-bold text-sm text-slate-800">{mod.name}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">{mod.path}</div>
                                  </td>
                                  {['can_view', 'can_create', 'can_edit', 'can_delete'].map(field => (
                                    <td key={field} className="p-3 text-center">
                                      <input
                                        type="checkbox"
                                        checked={(perm as any)[field]}
                                        onChange={() => togglePerm(selectedPosition, mod.path, field)}
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer"
                                      />
                                    </td>
                                  ))}
                                  <td className="p-3 text-center">
                                    <select
                                      value={perm.data_scope}
                                      onChange={e => changeScope(selectedPosition, mod.path, e.target.value)}
                                      className="text-xs border rounded-lg px-2 py-1 bg-white"
                                    >
                                      {DATA_SCOPES.map(s => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              )
                            })}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 안내 */}
                <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <p className="text-xs text-blue-700">
                    <strong>안내:</strong> god_admin과 관리자(master)는 항상 전체 권한을 가집니다. 이 설정은 일반 직원의 직급별 권한을 제어합니다.
                    활성화된 모듈만 표시됩니다.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        </>)}
      </div>
    </div>
  )
}
