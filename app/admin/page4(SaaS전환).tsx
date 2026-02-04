'use client'
import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useApp } from '../context/AppContext'
import InviteModal from '../components/InviteModal'

// ✅ 시스템에 존재하는 모든 메뉴 목록 (ID는 ClientLayout과 맞춰야 함)
const ALL_MENUS = [
  { id: 'sales', label: '대고객 영업 (견적/CRM)' },
  { id: 'partners', label: '위수탁/자금 정산' },
  { id: 'assets', label: '차량 자산 관리 (등록/정비)' },
  { id: 'mgmt', label: '경영 지원 (장부/코드)' },
]

export default function AdminPage() {
  const supabase = createClientComponentClient()
  const { currentCompany } = useApp()

  // 탭: members(직원관리), roles(부서/권한설정)
  const [activeTab, setActiveTab] = useState('members')

  // 데이터 상태
  const [members, setMembers] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([]) // 커스텀 부서 목록
  const [isInviteOpen, setIsInviteOpen] = useState(false)

  // 부서 생성용 상태
  const [newRoleName, setNewRoleName] = useState('')

  useEffect(() => {
    if (currentCompany) {
      fetchMembers()
      fetchRoles()
    }
  }, [currentCompany])

  // 1. 직원 목록 불러오기
  const fetchMembers = async () => {
    if(!currentCompany) return
    const { data } = await supabase
      .from('company_members')
      .select(`*, profile:profiles(name, email), company_role:company_roles(name)`)
      .eq('company_id', currentCompany.id)
      .order('created_at')
    setMembers(data || [])
  }

  // 2. 부서(역할) 목록 불러오기
  const fetchRoles = async () => {
    if(!currentCompany) return
    const { data } = await supabase.from('company_roles').select('*').eq('company_id', currentCompany.id).order('created_at')
    setRoles(data || [])
  }

  // 3. 부서 생성 함수
  const createRole = async () => {
    if(!newRoleName) return
    await supabase.from('company_roles').insert({
      company_id: currentCompany?.id,
      name: newRoleName,
      allowed_menus: [] // 처음엔 아무 권한 없음
    })
    setNewRoleName('')
    fetchRoles()
  }

  // 4. 권한 토글 함수 (체크박스 누를 때)
  const togglePermission = async (roleId: string, currentMenus: string[], menuId: string) => {
    const hasMenu = currentMenus.includes(menuId)
    const newMenus = hasMenu
      ? currentMenus.filter(m => m !== menuId) // 있으면 제거
      : [...currentMenus, menuId] // 없으면 추가

    await supabase.from('company_roles').update({ allowed_menus: newMenus }).eq('id', roleId)
    fetchRoles() // 새로고침
  }

  // 5. 직원의 부서 변경
  const updateMemberRole = async (memberId: string, roleId: string) => {
    await supabase.from('company_members').update({ company_role_id: roleId }).eq('id', memberId)
    fetchMembers()
  }

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 animate-fade-in-up">
      <h1 className="text-3xl font-black text-gray-900 mb-2">⚙️ {currentCompany?.name} 관리자 설정</h1>
      <p className="text-gray-500 mb-8">직원 초대 및 부서별 메뉴 권한을 상세하게 설정합니다.</p>

      {/* 탭 버튼 */}
      <div className="flex border-b border-gray-200 mb-8">
        <button onClick={() => setActiveTab('members')} className={`px-6 py-3 font-bold ${activeTab === 'members' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}>👨‍💼 직원 관리</button>
        <button onClick={() => setActiveTab('roles')} className={`px-6 py-3 font-bold ${activeTab === 'roles' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}>🔐 부서/권한 설정</button>
      </div>

      {/* [탭 1] 직원 관리 */}
      {activeTab === 'members' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setIsInviteOpen(true)} className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg">+ 직원 초대하기</button>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase"><tr className="border-b"><th className="p-4">이름</th><th className="p-4">부서 배정</th><th className="p-4">관리</th></tr></thead>
              <tbody className="divide-y">
                {members.map(m => (
                  <tr key={m.id}>
                    <td className="p-4 font-bold">{m.profile?.name} <span className="text-gray-400 font-normal text-xs ml-2">{m.profile?.email}</span></td>
                    <td className="p-4">
                      <select
                        className="bg-gray-50 border border-gray-200 rounded px-3 py-2 font-bold text-sm"
                        value={m.company_role_id || ''}
                        onChange={(e) => updateMemberRole(m.id, e.target.value)}
                      >
                        <option value="">(부서 없음 - 메뉴 안보임)</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </td>
                    <td className="p-4 text-gray-400 text-sm">삭제/수정</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* [탭 2] 부서 및 권한 설정 (핵심 기능) */}
      {activeTab === 'roles' && (
        <div>
          {/* 부서 추가 입력창 */}
          <div className="bg-indigo-50 p-6 rounded-2xl mb-8 flex gap-4 items-center">
            <span className="font-bold text-indigo-900">✨ 새로운 부서 만들기:</span>
            <input
              type="text" placeholder="예: 영업 1팀, 회계팀"
              className="flex-1 px-4 py-2 rounded-lg border border-indigo-200 outline-none focus:border-indigo-500"
              value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
            />
            <button onClick={createRole} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700">생성</button>
          </div>

          {/* 권한 매트릭스 표 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-800 text-white">
                <tr>
                  <th className="p-4 w-1/4">부서명</th>
                  {ALL_MENUS.map(menu => <th key={menu.id} className="p-4 text-center text-xs opacity-80">{menu.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y font-bold text-gray-700">
                {roles.map(role => (
                  <tr key={role.id} className="hover:bg-gray-50">
                    <td className="p-4 border-r border-gray-100">{role.name}</td>
                    {ALL_MENUS.map(menu => {
                      const isAllowed = role.allowed_menus?.includes(menu.id)
                      return (
                        <td key={menu.id} className="p-4 text-center cursor-pointer hover:bg-indigo-50" onClick={() => togglePermission(role.id, role.allowed_menus || [], menu.id)}>
                          <div className={`w-6 h-6 mx-auto rounded border-2 flex items-center justify-center transition-all ${isAllowed ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'}`}>
                            {isAllowed && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {roles.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">등록된 부서가 없습니다. 위에서 먼저 생성해주세요.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-4 text-center">* 체크박스를 클릭하면 즉시 권한이 적용됩니다. (직원은 새로고침 필요)</p>
        </div>
      )}

      {/* 초대 모달 */}
      {currentCompany && <InviteModal companyId={currentCompany.id} companyName={currentCompany.name} isOpen={isInviteOpen} onClose={()=>setIsInviteOpen(false)} onSuccess={fetchMembers} />}
    </div>
  )
}