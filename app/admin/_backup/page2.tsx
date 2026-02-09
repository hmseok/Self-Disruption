'use client'
import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useApp } from '../context/AppContext'
import InviteModal from '../components/InviteModal'

// 아이콘 컴포넌트
const Icons = {
  Badge: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>,
  Trash: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  Building: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
}

export default function AdminPage() {
  const supabase = createClientComponentClient()
  const { currentCompany } = useApp()

  // --- 상태 관리 ---
  const [members, setMembers] = useState<any[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [isInviteOpen, setIsInviteOpen] = useState(false) // 모달 상태

  const [companies, setCompanies] = useState<any[]>([])
  const [newCompanyName, setNewCompanyName] = useState('')
  const [loadingCompany, setLoadingCompany] = useState(false)

  // --- 초기 데이터 로드 ---
  useEffect(() => {
    fetchCompanies()
  }, [])

  useEffect(() => {
    if (currentCompany) {
      fetchMembers()
    }
  }, [currentCompany])


  // --- 기능 1: 직원 관리 ---
  const fetchMembers = async () => {
    if (!currentCompany) return
    setLoadingMembers(true)

    const { data, error } = await supabase
      .from('company_members')
      .select(`*, profile:profiles ( name, email, phone )`)
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: true })

    if (error) console.error('직원 로딩 실패:', error)
    else setMembers(data || [])

    setLoadingMembers(false)
  }

  const updateRole = async (memberId: string, newRole: string) => {
    if (!confirm(`권한을 '${newRole}'(으)로 변경하시겠습니까?`)) return
    const { error } = await supabase.from('company_members').update({ role: newRole }).eq('id', memberId)
    if (error) alert('변경 실패: ' + error.message)
    else {
      alert('권한이 변경되었습니다.')
      fetchMembers()
    }
  }

  const removeMember = async (memberId: string) => {
    if (!confirm('정말 이 직원을 회사에서 내보내시겠습니까?')) return
    const { error } = await supabase.from('company_members').delete().eq('id', memberId)
    if (error) alert('삭제 실패: ' + error.message)
    else {
      alert('삭제되었습니다.')
      fetchMembers()
    }
  }


  // --- 기능 2: 회사 관리 ---
  const fetchCompanies = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('company_members')
      .select('role, company:companies(*)')
      .eq('user_id', user.id);

    if (data) {
        const myCompanies = data.map((item: any) => ({
            ...item.company,
            my_role: item.role
        }));
        setCompanies(myCompanies);
    }
  }

  const createCompany = async () => {
    if (!newCompanyName) return alert('회사 이름을 입력해주세요.');
    setLoadingCompany(true);

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('로그인이 필요합니다.');

        const { data: company, error: compError } = await supabase
            .from('companies')
            .insert({ name: newCompanyName })
            .select().single();
        if (compError) throw compError;

        const { error: memberError } = await supabase
            .from('company_members')
            .insert({ company_id: company.id, user_id: user.id, role: 'admin' });
        if (memberError) throw memberError;

        alert('회사가 생성되었습니다!');
        setNewCompanyName('');
        fetchCompanies();
        window.location.reload();
    } catch (e: any) {
        alert('오류 발생: ' + e.message);
    } finally {
        setLoadingCompany(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-6 animate-fade-in-up space-y-12">

      {/* 헤더 */}
      <div>
        <h1 className="text-3xl font-black text-gray-900">⚙️ 환경 설정 (Admin)</h1>
        <p className="text-gray-500 mt-2">직원 권한 관리 및 사업장 설정을 할 수 있습니다.</p>
      </div>

      {/* --- 섹션 1: 직원 관리 --- */}
      <section>
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
           <div className="flex items-center gap-2">
             <span className="text-indigo-600 bg-indigo-50 p-2 rounded-lg"><Icons.Badge /></span>
             <h2 className="text-2xl font-bold text-gray-800">
               <span className="text-indigo-600 mr-2">{currentCompany?.name}</span>
               직원 명부 관리
             </h2>
           </div>

           {/* 초대 버튼 (우측 정렬) */}
           <button
             onClick={() => setIsInviteOpen(true)}
             className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
           >
              <span>+ 직원 초대하기</span>
           </button>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="p-5 font-bold">이름 / 이메일</th>
                  <th className="p-5 font-bold">연락처</th>
                  <th className="p-5 font-bold">권한 (Role)</th>
                  <th className="p-5 font-bold text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loadingMembers ? (
                  <tr><td colSpan={4} className="p-10 text-center text-gray-400 font-bold">로딩 중...</td></tr>
                ) : members.length === 0 ? (
                  <tr><td colSpan={4} className="p-10 text-center text-gray-400 font-bold">등록된 직원이 없습니다.</td></tr>
                ) : (
                  members.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-5">
                          <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                                  {member.profile?.name?.[0] || 'U'}
                              </div>
                              <div>
                                  <p className="font-bold text-gray-900">{member.profile?.name || '이름 없음'}</p>
                                  <p className="text-xs text-gray-400">{member.profile?.email || '-'}</p>
                              </div>
                          </div>
                      </td>
                      <td className="p-5 text-sm font-bold text-gray-600">{member.profile?.phone || '-'}</td>
                      <td className="p-5">
                          <select
                              value={member.role}
                              onChange={(e) => updateRole(member.id, e.target.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 outline-none cursor-pointer transition-colors
                                  ${member.role === 'admin' ? 'border-red-100 bg-red-50 text-red-600' :
                                    member.role === 'manager' ? 'border-indigo-100 bg-indigo-50 text-indigo-600' :
                                    'border-gray-100 bg-gray-50 text-gray-500'}
                              `}
                          >
                              <option value="admin">👑 최고 관리자</option>
                              <option value="manager">🛠️ 매니저</option>
                              <option value="staff">👤 일반 직원</option>
                              <option value="driver">🚗 드라이버</option>
                          </select>
                      </td>
                      <td className="p-5 text-center">
                          <button onClick={() => removeMember(member.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="퇴사 처리">
                              <Icons.Trash />
                          </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* --- 섹션 2: 회사 관리 --- */}
      <section className="pt-8 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-6">
           <span className="text-gray-600 bg-gray-100 p-2 rounded-lg"><Icons.Building /></span>
           <h2 className="text-xl font-bold text-gray-700">사업장(회사) 관리</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 h-fit">
                <h3 className="font-bold text-gray-800 mb-3">🏢 새 사업장 추가</h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newCompanyName}
                        onChange={(e) => setNewCompanyName(e.target.value)}
                        placeholder="새 회사 이름"
                        className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                    <button
                        onClick={createCompany}
                        disabled={loadingCompany}
                        className="bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm disabled:bg-gray-400"
                    >
                        추가
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">* 생성 즉시 관리자(Admin) 권한을 갖습니다.</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-200 font-bold text-sm text-gray-600">내 소속 사업장 목록</div>
                <ul className="divide-y divide-gray-100">
                    {companies.map((comp) => (
                        <li key={comp.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                            <span className="font-bold text-gray-800 text-sm">{comp.name}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${comp.my_role === 'admin' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                                {comp.my_role.toUpperCase()}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
      </section>

      {/* 모달: 맨 아래에 위치 (렌더링 순서상 중요) */}
      {currentCompany && (
        <InviteModal
          companyId={currentCompany.id}
          isOpen={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
          onSuccess={() => {
            alert('초대장이 발송되었습니다.');
            // 실제로는 여기서 메일 API 호출 등을 함
          }}
        />
      )}

    </div>
  )
}