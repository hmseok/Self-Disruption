'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import type { Position, Department, PagePermission } from '../../types/rbac'

// ============================================
// 권한 관리 페이지 (매트릭스 UI)
// 부서별 × (직급별) × 페이지별 권한을 한눈에 설정
// ============================================

// 시스템에서 관리하는 모든 페이지 경로
const ALL_PAGES = [
  { path: '/cars', name: '전체 차량 대장', group: '차량 자산' },
  { path: '/registration', name: '등록/제원 상세', group: '차량 자산' },
  { path: '/insurance', name: '보험/사고/정비', group: '차량 자산' },
  { path: '/quotes', name: '렌트 견적/계약', group: '대고객 영업' },
  { path: '/customers', name: '고객 관리', group: '대고객 영업' },
  { path: '/contracts', name: '계약서 관리', group: '대고객 영업' },
  { path: '/jiip', name: '위수탁(지입)', group: '파트너 자금' },
  { path: '/invest', name: '투자자/펀딩', group: '파트너 자금' },
  { path: '/loans', name: '대출/금융사', group: '파트너 자금' },
  { path: '/finance', name: '자금 장부', group: '경영 지원' },
  { path: '/finance/upload', name: '거래 업로드', group: '경영 지원' },
  { path: '/db/pricing-standards', name: '산출 기준 관리', group: '데이터 관리' },
  { path: '/db/lotte', name: '시세 참조', group: '데이터 관리' },
]

const DATA_SCOPES = [
  { value: 'all', label: '전체 데이터' },
  { value: 'department', label: '부서 데이터만' },
  { value: 'own', label: '본인 데이터만' },
]

type PermMatrix = {
  [key: string]: {  // key = `${department_id}_${position_id}_${page_path}`
    can_view: boolean
    can_create: boolean
    can_edit: boolean
    can_delete: boolean
    data_scope: string
    id?: string
  }
}

export default function PermissionsPage() {
  const { company, role } = useApp()

  const [positions, setPositions] = useState<Position[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [matrix, setMatrix] = useState<PermMatrix>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
  const [selectedPosition, setSelectedPosition] = useState<string>('')  // '' = 부서 기본 권한

  // god_admin 전용: 회사 선택
  const [allCompanies, setAllCompanies] = useState<any[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')

  // 실제 사용할 company_id
  const activeCompanyId = role === 'god_admin' ? selectedCompanyId : company?.id

  useEffect(() => {
    const init = async () => {
      if (role === 'god_admin') {
        const { data } = await supabase.from('companies').select('*').order('name')
        setAllCompanies(data || [])
        if (data && data.length > 0) {
          setSelectedCompanyId(data[0].id)
        } else {
          setLoading(false)
        }
      } else if (company) {
        loadData()
      }
    }
    init()
  }, [company, role])

  // god_admin: 회사 변경 시 재로드
  useEffect(() => {
    if (role === 'god_admin' && selectedCompanyId) {
      setSelectedDepartment('')
      setSelectedPosition('')
      loadData()
    }
  }, [selectedCompanyId])

  const loadData = async () => {
    if (!activeCompanyId) return
    setLoading(true)

    // 직급 목록
    const { data: posData } = await supabase
      .from('positions')
      .select('*')
      .eq('company_id', activeCompanyId)
      .order('level')
    setPositions(posData || [])

    // 부서 목록
    const { data: deptData } = await supabase
      .from('departments')
      .select('*')
      .eq('company_id', activeCompanyId)
      .order('name')
    setDepartments(deptData || [])
    if (deptData && deptData.length > 0 && !selectedDepartment) {
      setSelectedDepartment(deptData[0].id)
    }

    // 기존 권한 데이터
    const { data: permData } = await supabase
      .from('page_permissions')
      .select('*')
      .eq('company_id', activeCompanyId)

    // 매트릭스로 변환
    const m: PermMatrix = {}
    permData?.forEach((p: any) => {
      const key = `${p.department_id || ''}_${p.position_id || ''}_${p.page_path}`
      m[key] = {
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete,
        data_scope: p.data_scope || 'all',
        id: p.id,
      }
    })
    setMatrix(m)
    setLoading(false)
  }

  // 현재 선택 기준의 키 생성
  const getPermKey = (pagePath: string) => `${selectedDepartment}_${selectedPosition}_${pagePath}`

  // 체크박스 토글
  const togglePerm = (pagePath: string, field: string) => {
    const key = getPermKey(pagePath)
    const current = matrix[key] || { can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
    setMatrix(prev => ({
      ...prev,
      [key]: { ...current, [field]: !(current as any)[field] },
    }))
  }

  // 데이터 범위 변경
  const changeScope = (pagePath: string, scope: string) => {
    const key = getPermKey(pagePath)
    const current = matrix[key] || { can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
    setMatrix(prev => ({
      ...prev,
      [key]: { ...current, data_scope: scope },
    }))
  }

  // 일괄 저장
  const saveAll = async () => {
    if (!selectedDepartment || !activeCompanyId) {
      alert('부서를 선택해주세요.')
      return
    }
    setSaving(true)

    const deptId = selectedDepartment
    const posId = selectedPosition || null

    const upserts: any[] = []
    ALL_PAGES.forEach(page => {
      const key = getPermKey(page.path)
      const perm = matrix[key]
      if (perm) {
        upserts.push({
          company_id: activeCompanyId,
          department_id: deptId,
          position_id: posId,
          page_path: page.path,
          can_view: perm.can_view,
          can_create: perm.can_create,
          can_edit: perm.can_edit,
          can_delete: perm.can_delete,
          data_scope: perm.data_scope,
        })
      }
    })

    if (upserts.length > 0) {
      // 기존 해당 조합 삭제
      let deleteQuery = supabase
        .from('page_permissions')
        .delete()
        .eq('company_id', activeCompanyId)
        .eq('department_id', deptId)

      if (posId) {
        deleteQuery = deleteQuery.eq('position_id', posId)
      } else {
        deleteQuery = deleteQuery.is('position_id', null)
      }

      await deleteQuery

      // 새로 삽입
      const { error } = await supabase
        .from('page_permissions')
        .insert(upserts)

      if (error) {
        alert('저장 실패: ' + error.message)
      } else {
        alert('권한이 저장되었습니다.')
        loadData()
      }
    }

    setSaving(false)
  }

  // 전체 선택/해제
  const toggleAll = (field: string, value: boolean) => {
    if (!selectedDepartment) return
    const newMatrix = { ...matrix }
    ALL_PAGES.forEach(page => {
      const key = getPermKey(page.path)
      const current = newMatrix[key] || { can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
      newMatrix[key] = { ...current, [field]: value }
    })
    setMatrix(newMatrix)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600"></div>
      </div>
    )
  }

  // 그룹별로 페이지 분류
  const groups = [...new Set(ALL_PAGES.map(p => p.group))]

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="mb-5 md:mb-6 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">🔐 권한 설정</h1>
            <p className="text-xs text-slate-400 mt-1">부서별 · 부서의 직급별 페이지 접근 권한을 설정합니다</p>
          </div>
          <div className="flex items-center gap-3">
            {/* god_admin: 회사 선택 */}
            {role === 'god_admin' && allCompanies.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-bold text-slate-500">회사:</label>
                <select
                  value={selectedCompanyId}
                  onChange={e => setSelectedCompanyId(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold bg-white min-w-[200px]"
                >
                  {allCompanies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={saveAll}
              disabled={saving || !selectedDepartment}
              className="px-6 py-2.5 md:px-8 md:py-3 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 disabled:bg-slate-300 transition-colors shadow-lg"
            >
              {saving ? '저장 중...' : '변경사항 저장'}
            </button>
          </div>
        </div>

        {/* 부서 선택 */}
        <div className="mb-3">
          <label className="text-xs font-bold text-slate-500 mb-2 block">부서 선택</label>
          <div className="flex gap-1.5 md:gap-2 flex-wrap">
            {departments.map(dept => (
              <button
                key={dept.id}
                onClick={() => { setSelectedDepartment(dept.id); setSelectedPosition('') }}
                className={`px-3 md:px-5 py-2 md:py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all ${
                  selectedDepartment === dept.id
                    ? 'bg-steel-600 text-white shadow-lg'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {dept.name}
              </button>
            ))}
          </div>
        </div>

        {/* 직급 선택 (부서 선택 후) */}
        {selectedDepartment && (
          <div className="flex gap-1.5 md:gap-2 mb-5 md:mb-6 flex-wrap">
            <button
              onClick={() => setSelectedPosition('')}
              className={`px-3 md:px-5 py-2 md:py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all ${
                selectedPosition === ''
                  ? 'bg-teal-600 text-white shadow-lg'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              부서 기본
            </button>
            {positions.map(pos => (
              <button
                key={pos.id}
                onClick={() => setSelectedPosition(pos.id)}
                className={`px-3 md:px-5 py-2 md:py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all ${
                  selectedPosition === pos.id
                    ? 'bg-steel-600 text-white shadow-lg'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Lv.{pos.level} {pos.name}
              </button>
            ))}
          </div>
        )}

        {departments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 md:p-12 text-center">
            <p className="text-slate-400 text-sm">부서가 없습니다. 먼저 직원 관리에서 부서를 추가해주세요.</p>
          </div>
        ) : !selectedDepartment ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 md:p-12 text-center">
            <p className="text-slate-400 text-sm">위에서 부서를 선택해주세요.</p>
          </div>
        ) : (
          /* 권한 매트릭스 테이블 */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* 전체 선택 컨트롤 */}
            <div className="p-3 md:p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2 md:gap-4 flex-wrap">
              <span className="text-[10px] md:text-xs font-bold text-slate-400">일괄 설정:</span>
              <span className="text-xs font-bold text-steel-600 bg-steel-50 px-2 py-0.5 rounded">
                {departments.find(d => d.id === selectedDepartment)?.name}
                {selectedPosition ? ` · ${positions.find(p => p.id === selectedPosition)?.name}` : ' · 부서 기본'}
              </span>
              {['can_view', 'can_create', 'can_edit', 'can_delete'].map(field => (
                <div key={field} className="flex items-center gap-1">
                  <button onClick={() => toggleAll(field, true)} className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold hover:bg-green-200">
                    {field.replace('can_', '')} 전체 ON
                  </button>
                  <button onClick={() => toggleAll(field, false)} className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold hover:bg-red-200">
                    OFF
                  </button>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase sticky left-0 bg-slate-50 min-w-[200px]">페이지</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase text-center w-20">조회</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase text-center w-20">생성</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase text-center w-20">수정</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase text-center w-20">삭제</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase text-center min-w-[140px]">데이터 범위</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(group => (
                    <React.Fragment key={`group-${group}`}>
                      <tr className="bg-slate-100/70">
                        <td colSpan={6} className="px-4 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{group}</td>
                      </tr>
                      {ALL_PAGES.filter(p => p.group === group).map(page => {
                        const key = getPermKey(page.path)
                        const perm = matrix[key] || { can_view: false, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' }
                        return (
                          <tr key={page.path} className="border-b border-slate-50 hover:bg-steel-50/30">
                            <td className="p-4 sticky left-0 bg-white">
                              <div className="font-bold text-sm text-slate-800">{page.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{page.path}</div>
                            </td>
                            {['can_view', 'can_create', 'can_edit', 'can_delete'].map(field => (
                              <td key={field} className="p-4 text-center">
                                <input
                                  type="checkbox"
                                  checked={(perm as any)[field]}
                                  onChange={() => togglePerm(page.path, field)}
                                  className="w-5 h-5 rounded border-slate-300 text-steel-600 focus:ring-steel-500 cursor-pointer"
                                />
                              </td>
                            ))}
                            <td className="p-4 text-center">
                              <select
                                value={perm.data_scope}
                                onChange={e => changeScope(page.path, e.target.value)}
                                className="text-xs border rounded-lg px-2 py-1.5 bg-white"
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
        )}

        {/* 안내 */}
        <div className="mt-6 p-3 md:p-4 bg-steel-50 rounded-xl border border-steel-100">
          <p className="text-[11px] md:text-xs text-steel-700">
            <strong>권한 체계 안내:</strong> god_admin과 master(대표) 역할은 이 설정과 무관하게 항상 전체 접근 권한을 가집니다.
            일반 직원은 소속 부서+직급 조합의 권한이 우선 적용되며, 해당 조합에 설정이 없으면 부서 기본 권한이 적용됩니다.
          </p>
        </div>

      </div>
    </div>
  )
}
