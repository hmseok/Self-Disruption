'use client'
import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useApp } from '../context/AppContext'
import InviteModal from '../components/InviteModal'

const Icons = {
  Badge: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>,
  Trash: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  Building: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  Lock: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
}

// 메뉴 권한 정의 (ClientLayout과 동기화된 가상의 데이터)
const PERMISSION_MATRIX = [
    { menu: '대고객 영업 (견적/CRM)', admin: true, manager: true, staff: true, driver: false },
    { menu: '위수탁/자금 정산', admin: true, manager: true, staff: false, driver: false },
    { menu: '차량 자산 관리', admin: true, manager: true, staff: false, driver: true },
    { menu: '경영 지원 (장부/설정)', admin: true, manager: false, staff: false, driver: false },
]

export default function AdminPage() {
  const supabase = createClientComponentClient()
  const { currentCompany } = useApp()

  // 탭 상태: 'staff'(직원관리) | 'permission'(권한설정) | 'company'(회사정보)
  const [activeTab, setActiveTab] = useState<'staff' | 'permission' | 'company'>('staff')

  const [members, setMembers] = useState<any[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [isInviteOpen, setIsInviteOpen] = useState(false)

  const [companies, setCompanies] = useState<any[]>([])
  const [newCompanyName, setNewCompanyName] = useState('')
  const [loadingCompany, setLoadingCompany] = useState(false)

  useEffect(() => { fetchCompanies() }, [])
  useEffect(() => { if (currentCompany) fetchMembers() }, [currentCompany])

  const fetchMembers = async () => {
    if (!currentCompany) return
    setLoadingMembers(true)
    const { data, error } = await supabase
      .from('company_members')
      .select(`*, profile:profiles ( name, email, phone )`)
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: true })
    if (!error) setMembers(data || [])
    setLoadingMembers(false)
  }

  const updateMember = async (id: string, field: string, value: string) => {
    // 즉시 업데이트 (Optimistic UI 적용 가능하지만 여기선 심플하게)
    const { error } = await supabase.from('company_members').update({ [field]: value }).eq('id', id)
    if (error) alert('수정 실패: ' + error.message)
    else fetchMembers()
  }

  const removeMember = async (memberId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    const { error } = await supabase.from('company_members').delete().eq('id', memberId)
    if (!error) { alert('삭제되었습니다.'); fetchMembers(); }
  }

  // 회사 관련 함수들
  const fetchCompanies = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('company_members').select('role, company:companies(*)').eq('user_id', user.id);
    if (data) setCompanies(data.map((item: any) => ({ ...item.company, my_role: item.role })));
  }

  const createCompany = async () => {
    if (!newCompanyName) return;
    setLoadingCompany(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: company } = await supabase.from('companies').insert({ name: newCompanyName }).select().single();
        if (company && user) {
            await supabase.from('company_members').insert({ company_id: company.id, user_id: user.id, role: 'admin' });
            alert('생성 완료!'); window.location.reload();
        }
    } catch(e) {} finally { setLoadingCompany(false); }
  }

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 animate-fade-in-up space-y-8">

      {/* 1. 상단 타이틀 & 탭 메뉴 */}
      <div>
        <h1 className="text-3xl font-black text-gray-900 mb-6">⚙️ 환경 설정 (Admin)</h1>

        <div className="flex border-b border-gray-200">
            <button onClick={() => setActiveTab('staff')} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'staff' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                직원 및 인사 관리
            </button>
            <button onClick={() => setActiveTab('permission')} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'permission' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                권한 및 메뉴 설정
            </button>
            <button onClick={() => setActiveTab('company')} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'company' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                사업장 관리
            </button>
        </div>
      </div>

      {/* 2. 탭 컨텐츠 */}

      {/* [TAB 1] 직원 관리 */}
      {activeTab === 'staff' && (
        <section className="animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <span className="text-indigo-600">{currentCompany?.name}</span> 구성원 명부
                </h2>
                <button onClick={() => setIsInviteOpen(true)} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all text-sm">
                    + 직원 초대하기
                </button>
            </div>

            <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wider">
                        <th className="p-5 font-bold">직원 정보</th>
                        <th className="p-5 font-bold">부서 / 직급</th>
                        <th className="p-5 font-bold">시스템 권한</th>
                        <th className="p-5 font-bold text-center">관리</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                    {members.map((member) => (
                        <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                                    {member.profile?.name?.[0] || 'U'}
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900">{member.profile?.name || '미가입'}</p>
                                    <p className="text-xs text-gray-400">{member.profile?.email || '-'}</p>
                                </div>
                            </div>
                        </td>
                        <td className="p-5">
                            <div className="flex gap-2">
                                <input type="text" className="w-20 bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs font-bold"
                                    defaultValue={member.department}
                                    onBlur={(e)=>updateMember(member.id, 'department', e.target.value)}
                                    placeholder="부서"
                                />
                                <input type="text" className="w-16 bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs font-bold"
                                    defaultValue={member.position}
                                    onBlur={(e)=>updateMember(member.id, 'position', e.target.value)}
                                    placeholder="직급"
                                />
                            </div>
                        </td>
                        <td className="p-5">
                            <select
                                value={member.role}
                                onChange={(e) => updateMember(member.id, 'role', e.target.value)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 outline-none cursor-pointer
                                    ${member.role === 'admin' ? 'border-red-100 bg-red-50 text-red-600' :
                                      member.role === 'manager' ? 'border-indigo-100 bg-indigo-50 text-indigo-600' :
                                      'border-gray-100 bg-gray-50 text-gray-500'}
                                `}
                            >
                                <option value="admin">👑 관리자</option>
                                <option value="manager">🛠️ 매니저</option>
                                <option value="staff">👤 직원</option>
                                <option value="driver">🚗 드라이버</option>
                            </select>
                        </td>
                        <td className="p-5 text-center">
                            <button onClick={() => removeMember(member.id)} className="text-gray-300 hover:text-red-500 transition-colors"><Icons.Trash /></button>
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            </div>
        </section>
      )}

      {/* [TAB 2] 권한 설정 매트릭스 */}
      {activeTab === 'permission' && (
        <section className="animate-fade-in">
            <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl mb-8 flex gap-4 items-start">
                <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><Icons.Lock /></div>
                <div>
                    <h3 className="font-bold text-blue-900 text-lg">권한 등급별 접근 제어</h3>
                    <p className="text-blue-700 text-sm mt-1">
                        각 직책(Role)별로 접근 가능한 메뉴를 확인하세요. <br/>
                        <span className="text-xs opacity-70">* 현재는 보안을 위해 시스템 코드에서 엄격하게 관리되고 있습니다. (조회 전용)</span>
                    </p>
                </div>
            </div>

            <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-center border-collapse">
                    <thead>
                        <tr className="bg-gray-800 text-white text-sm">
                            <th className="p-4 text-left pl-8">메뉴 그룹</th>
                            <th className="p-4 w-32 bg-red-500/90">Admin<br/><span className="text-[10px] opacity-70">최고 관리자</span></th>
                            <th className="p-4 w-32 bg-indigo-500/90">Manager<br/><span className="text-[10px] opacity-70">중간 관리자</span></th>
                            <th className="p-4 w-32 bg-green-500/90">Staff<br/><span className="text-[10px] opacity-70">일반 직원</span></th>
                            <th className="p-4 w-32 bg-gray-600/90">Driver<br/><span className="text-[10px] opacity-70">현장직</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-bold text-gray-600">
                        {PERMISSION_MATRIX.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                                <td className="p-5 text-left pl-8 text-gray-900">{row.menu}</td>
                                <td className="p-5 text-red-500">{row.admin ? 'O' : '-'}</td>
                                <td className="p-5 text-indigo-500">{row.manager ? 'O' : '-'}</td>
                                <td className="p-5 text-green-500">{row.staff ? 'O' : '-'}</td>
                                <td className="p-5 text-gray-400">{row.driver ? 'O' : '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
      )}

      {/* [TAB 3] 사업장 관리 (기존 유지) */}
      {activeTab === 'company' && (
        <section className="animate-fade-in grid md:grid-cols-2 gap-8">
            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 h-fit">
                <h3 className="font-bold text-gray-800 mb-3">🏢 새 사업장 추가</h3>
                <div className="flex gap-2">
                    <input type="text" value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="새 회사 이름" className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                    <button onClick={createCompany} disabled={loadingCompany} className="bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm disabled:bg-gray-400">추가</button>
                </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-200 font-bold text-sm text-gray-600">내 소속 사업장 목록</div>
                <ul className="divide-y divide-gray-100">
                    {companies.map((comp) => (
                        <li key={comp.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                            <span className="font-bold text-gray-800 text-sm">{comp.name}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${comp.my_role === 'admin' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>{comp.my_role.toUpperCase()}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
      )}

      {/* 모달 */}
      {currentCompany && (
        <InviteModal
          companyName={currentCompany.name}
          companyId={currentCompany.id}
          isOpen={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
          onSuccess={() => { fetchMembers(); }}
        />
      )}
    </div>
  )
}