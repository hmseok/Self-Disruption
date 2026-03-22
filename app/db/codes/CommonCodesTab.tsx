'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useApp } from '../../context/AppContext'

interface CodeRecord {
  id: string
  group_code: string
  code: string
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
}

// 시스템 기본 그룹 (초기 안내용)
const DEFAULT_GROUPS = [
  { group_code: 'CAR_STATUS', desc: '차량 상태 (대기/운행/정비/폐차 등)' },
  { group_code: 'CONTRACT_TYPE', desc: '계약 유형 (운용리스/금융리스/렌탈 등)' },
  { group_code: 'FUEL_TYPE', desc: '연료 종류 (가솔린/디젤/전기/하이브리드)' },
  { group_code: 'INSURANCE_TYPE', desc: '보험 유형 (대인/대물/자차/자손 등)' },
  { group_code: 'PAYMENT_METHOD', desc: '결제 방법 (계좌이체/카드/현금)' },
  { group_code: 'CUSTOMER_TYPE', desc: '고객 유형 (개인/법인/개인사업자)' },
]

export default function CommonCodesTab() {
  const supabase = createClientComponentClient()
  const { role } = useApp()
  const isAdmin = role === 'admin'

  const [codes, setCodes] = useState<CodeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [groups, setGroups] = useState<string[]>([])
  const [showGuide, setShowGuide] = useState(true)

  // 새 코드 추가 폼
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCode, setNewCode] = useState({ group_code: '', code: '', name: '', sort_order: 0 })
  // 새 그룹 추가
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [newGroupCode, setNewGroupCode] = useState('')
  // 편집
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState({ name: '', sort_order: 0 })

  const loadCodes = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('common_codes')
        .select('*')
        .order('group_code')
        .order('sort_order')
        .order('code')
      if (error) throw error
      const rows = data || []
      setCodes(rows)
      const uniqueGroups = [...new Set(rows.map(r => r.group_code))].sort()
      setGroups(uniqueGroups)
      if (!selectedGroup && uniqueGroups.length > 0) {
        setSelectedGroup(uniqueGroups[0])
      }
    } catch (error) {
      console.error('공통코드 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, selectedGroup])

  useEffect(() => { loadCodes() }, [loadCodes])

  const filteredCodes = codes.filter(c => c.group_code === selectedGroup)

  const handleAdd = async () => {
    if (!newCode.code || !newCode.name) return
    const groupCode = showAddGroup ? newGroupCode : (newCode.group_code || selectedGroup)
    if (!groupCode) return

    try {
      const { error } = await supabase.from('common_codes').insert({
        group_code: groupCode.toUpperCase(),
        code: newCode.code.toUpperCase(),
        name: newCode.name,
        sort_order: newCode.sort_order || 0,
        is_active: true,
      })
      if (error) throw error
      setNewCode({ group_code: '', code: '', name: '', sort_order: 0 })
      setNewGroupCode('')
      setShowAddForm(false)
      setShowAddGroup(false)
      if (showAddGroup) setSelectedGroup(groupCode.toUpperCase())
      await loadCodes()
    } catch (error) {
      console.error('코드 추가 실패:', error)
      alert('코드 추가에 실패했습니다.')
    }
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabase.from('common_codes')
        .update({ is_active: !currentActive })
        .eq('id', id)
      if (error) throw error
      setCodes(codes.map(c => c.id === id ? { ...c, is_active: !currentActive } : c))
    } catch (error) {
      console.error('상태 변경 실패:', error)
    }
  }

  const handleStartEdit = (record: CodeRecord) => {
    setEditingId(record.id)
    setEditData({ name: record.name, sort_order: record.sort_order })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    try {
      const { error } = await supabase.from('common_codes')
        .update({ name: editData.name, sort_order: editData.sort_order })
        .eq('id', editingId)
      if (error) throw error
      setCodes(codes.map(c => c.id === editingId ? { ...c, ...editData } : c))
      setEditingId(null)
    } catch (error) {
      console.error('수정 실패:', error)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 코드를 삭제하시겠습니까?`)) return
    try {
      const { error } = await supabase.from('common_codes').delete().eq('id', id)
      if (error) throw error
      setCodes(codes.filter(c => c.id !== id))
    } catch (error) {
      console.error('삭제 실패:', error)
      alert('삭제에 실패했습니다. (사용 중인 코드일 수 있습니다)')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 가이드 배너 */}
      {showGuide && (
        <div className="bg-gradient-to-r from-slate-50 to-zinc-50 rounded-2xl p-5 border border-slate-200">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏷️</span>
              <h3 className="text-sm font-bold text-gray-900">공통 코드 관리</h3>
            </div>
            <button onClick={() => setShowGuide(false)} className="text-gray-400 hover:text-gray-600 text-xs">닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-white/70 rounded-xl p-3">
              <p className="font-bold text-gray-800 mb-1">공통 코드란?</p>
              <p className="text-gray-600 leading-relaxed">
                시스템 전체에서 드롭다운, 상태값, 분류 등에 사용하는 열거형 데이터입니다.
                그룹별로 코드를 관리하면 일관된 데이터를 유지할 수 있습니다.
              </p>
            </div>
            <div className="bg-white/70 rounded-xl p-3">
              <p className="font-bold text-gray-800 mb-1">그룹 코드</p>
              <p className="text-gray-600 leading-relaxed">
                왼쪽에서 그룹(예: CAR_STATUS)을 선택하면 해당 그룹의 코드 목록이 표시됩니다.
                새 그룹을 추가해 업무에 맞는 코드 체계를 구성하세요.
              </p>
            </div>
            <div className="bg-white/70 rounded-xl p-3">
              <p className="font-bold text-gray-800 mb-1">활성/비활성</p>
              <p className="text-gray-600 leading-relaxed">
                사용하지 않는 코드는 비활성으로 전환하세요. 삭제하지 않아도 드롭다운에서 숨겨집니다.
                기존 데이터는 영향받지 않습니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 메인 레이아웃: 좌측 그룹 선택 + 우측 코드 테이블 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 좌측 — 그룹 목록 */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-700">코드 그룹</h3>
              {isAdmin && (
                <button
                  onClick={() => { setShowAddGroup(true); setShowAddForm(true) }}
                  className="text-xs px-2 py-1 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                >
                  + 그룹
                </button>
              )}
            </div>
            <div className="space-y-1">
              {groups.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4">
                  <p className="mb-2">등록된 코드 그룹이 없습니다</p>
                  <div className="space-y-1 text-left">
                    {DEFAULT_GROUPS.map(g => (
                      <div key={g.group_code} className="flex items-center gap-2 p-1.5 rounded bg-gray-50">
                        <span className="font-mono text-[10px] text-gray-500">{g.group_code}</span>
                        <span className="text-[10px] text-gray-400">— {g.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                groups.map(g => {
                  const count = codes.filter(c => c.group_code === g).length
                  return (
                    <button
                      key={g}
                      onClick={() => setSelectedGroup(g)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                        selectedGroup === g
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono">{g}</span>
                        <span className={`text-[10px] ${selectedGroup === g ? 'text-gray-300' : 'text-gray-400'}`}>
                          {count}
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* 우측 — 코드 테이블 */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
            {/* 헤더 */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  {selectedGroup || '그룹을 선택하세요'}
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {filteredCodes.length}개 코드
                  {filteredCodes.filter(c => !c.is_active).length > 0 &&
                    ` (비활성 ${filteredCodes.filter(c => !c.is_active).length}개)`
                  }
                </p>
              </div>
              {isAdmin && selectedGroup && (
                <button
                  onClick={() => { setShowAddForm(true); setShowAddGroup(false); setNewCode({ ...newCode, group_code: selectedGroup }) }}
                  className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-semibold"
                >
                  + 코드 추가
                </button>
              )}
            </div>

            {/* 추가 폼 */}
            {showAddForm && isAdmin && (
              <div className="p-4 bg-blue-50/50 border-b border-blue-100">
                <div className="flex flex-wrap items-end gap-3">
                  {showAddGroup && (
                    <div>
                      <label className="block text-[10px] font-bold text-gray-600 mb-1">새 그룹 코드</label>
                      <input
                        type="text"
                        value={newGroupCode}
                        onChange={e => setNewGroupCode(e.target.value.toUpperCase())}
                        className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg w-40 focus:ring-1 focus:ring-gray-400 focus:outline-none"
                        placeholder="예: CAR_COLOR"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">코드</label>
                    <input
                      type="text"
                      value={newCode.code}
                      onChange={e => setNewCode({ ...newCode, code: e.target.value })}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg w-32 focus:ring-1 focus:ring-gray-400 focus:outline-none"
                      placeholder="예: ACTIVE"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">표시명</label>
                    <input
                      type="text"
                      value={newCode.name}
                      onChange={e => setNewCode({ ...newCode, name: e.target.value })}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg w-40 focus:ring-1 focus:ring-gray-400 focus:outline-none"
                      placeholder="예: 운행 중"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">정렬</label>
                    <input
                      type="number"
                      value={newCode.sort_order}
                      onChange={e => setNewCode({ ...newCode, sort_order: Number(e.target.value) })}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg w-16 focus:ring-1 focus:ring-gray-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAdd}
                      className="px-4 py-1.5 text-xs font-bold bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => { setShowAddForm(false); setShowAddGroup(false) }}
                      className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 테이블 */}
            {filteredCodes.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">
                {selectedGroup
                  ? '이 그룹에 등록된 코드가 없습니다.'
                  : '왼쪽에서 코드 그룹을 선택하거나, 새 그룹을 추가하세요.'
                }
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 font-semibold">
                      <th className="text-left px-4 py-2.5">코드</th>
                      <th className="text-left px-4 py-2.5">표시명</th>
                      <th className="text-center px-4 py-2.5">정렬</th>
                      <th className="text-center px-4 py-2.5">상태</th>
                      {isAdmin && <th className="text-center px-4 py-2.5">관리</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredCodes
                      .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
                      .map(record => (
                        <tr
                          key={record.id}
                          className={`hover:bg-gray-50/50 transition-colors ${!record.is_active ? 'opacity-50' : ''}`}
                        >
                          <td className="px-4 py-2.5 font-mono font-bold text-gray-800">{record.code}</td>
                          <td className="px-4 py-2.5 text-gray-700">
                            {editingId === record.id ? (
                              <input
                                type="text"
                                value={editData.name}
                                onChange={e => setEditData({ ...editData, name: e.target.value })}
                                className="px-2 py-1 border border-gray-200 rounded w-full focus:ring-1 focus:ring-gray-400 focus:outline-none"
                                autoFocus
                              />
                            ) : (
                              record.name
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center text-gray-500">
                            {editingId === record.id ? (
                              <input
                                type="number"
                                value={editData.sort_order}
                                onChange={e => setEditData({ ...editData, sort_order: Number(e.target.value) })}
                                className="px-2 py-1 border border-gray-200 rounded w-14 text-center focus:ring-1 focus:ring-gray-400 focus:outline-none"
                              />
                            ) : (
                              record.sort_order
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button
                              onClick={() => isAdmin && handleToggleActive(record.id, record.is_active)}
                              disabled={!isAdmin}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                record.is_active
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-gray-100 text-gray-500'
                              } ${isAdmin ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                            >
                              {record.is_active ? '활성' : '비활성'}
                            </button>
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-2.5 text-center">
                              {editingId === record.id ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={handleSaveEdit} className="px-2 py-0.5 bg-gray-900 text-white rounded text-[10px] font-bold">저장</button>
                                  <button onClick={() => setEditingId(null)} className="px-2 py-0.5 border border-gray-200 rounded text-[10px] text-gray-500">취소</button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => handleStartEdit(record)} className="px-2 py-0.5 border border-gray-200 rounded text-[10px] text-gray-500 hover:bg-gray-50">편집</button>
                                  <button onClick={() => handleDelete(record.id, record.name)} className="px-2 py-0.5 border border-red-100 rounded text-[10px] text-red-500 hover:bg-red-50">삭제</button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
