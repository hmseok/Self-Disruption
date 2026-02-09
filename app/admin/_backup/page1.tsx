'use client'
import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function AdminPage() {
  const [companies, setCompanies] = useState<any[]>([])
  const [newCompanyName, setNewCompanyName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchCompanies()
  }, [])

  const fetchCompanies = async () => {
    // 내가 소속된 회사 목록 가져오기
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // company_members 테이블을 통해 회사 정보 조회
    const { data, error } = await supabase
      .from('company_members')
      .select('role, company:companies(*)')
      .eq('user_id', user.id);

    if (data) {
        // 데이터 구조 평탄화
        const myCompanies = data.map((item: any) => ({
            ...item.company,
            my_role: item.role
        }));
        setCompanies(myCompanies);
    }
  }

  const createCompany = async () => {
    if (!newCompanyName) return alert('회사 이름을 입력해주세요.');
    setLoading(true);

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('로그인이 필요합니다.');

        // 1. 회사 생성
        const { data: company, error: compError } = await supabase
            .from('companies')
            .insert({ name: newCompanyName })
            .select()
            .single();

        if (compError) throw compError;

        // 2. 나를 그 회사의 관리자(admin)로 등록
        const { error: memberError } = await supabase
            .from('company_members')
            .insert({
                company_id: company.id,
                user_id: user.id,
                role: 'admin'
            });

        if (memberError) throw memberError;

        alert('회사가 생성되었습니다!');
        setNewCompanyName('');
        fetchCompanies(); // 목록 갱신

        // 페이지 새로고침하여 사이드바에도 반영
        window.location.reload();

    } catch (e: any) {
        alert('오류 발생: ' + e.message);
    } finally {
        setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 animate-fade-in-up">
      <h1 className="text-3xl font-black text-gray-900 mb-8">⚙️ 환경 설정 (Admin)</h1>

      {/* 회사 생성 카드 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-4">🏢 새 사업장 추가</h2>
        <div className="flex gap-3">
            <input
                type="text"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="(주)새로운회사 이름 입력"
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors"
            />
            <button
                onClick={createCompany}
                disabled={loading}
                className="bg-indigo-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-indigo-700 transition-colors disabled:bg-gray-400"
            >
                {loading ? '생성 중...' : '+ 추가하기'}
            </button>
        </div>
        <p className="text-sm text-gray-500 mt-3">
            * 회사를 생성하면 자동으로 해당 회사의 <strong>관리자(Admin)</strong>가 됩니다.<br/>
            * 사이드바 상단에서 회사를 전환하여 업무를 분리할 수 있습니다.
        </p>
      </div>

      {/* 내 회사 목록 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-800">📋 내 사업장 목록</h2>
        </div>
        <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-500 font-bold text-sm">
                <tr>
                    <th className="p-4">회사명</th>
                    <th className="p-4">내 권한</th>
                    <th className="p-4">생성일</th>
                    <th className="p-4 text-right">관리</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {companies.map((comp) => (
                    <tr key={comp.id} className="hover:bg-gray-50">
                        <td className="p-4 font-bold text-gray-800">{comp.name}</td>
                        <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${comp.my_role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                                {comp.my_role.toUpperCase()}
                            </span>
                        </td>
                        <td className="p-4 text-gray-500 text-sm">{new Date(comp.created_at).toLocaleDateString()}</td>
                        <td className="p-4 text-right">
                            {comp.my_role === 'admin' && (
                                <button className="text-xs font-bold text-gray-400 hover:text-indigo-600 border border-gray-200 px-3 py-1.5 rounded-lg">
                                    설정
                                </button>
                            )}
                        </td>
                    </tr>
                ))}
                {companies.length === 0 && (
                    <tr>
                        <td colSpan={4} className="p-8 text-center text-gray-400">소속된 회사가 없습니다.</td>
                    </tr>
                )}
            </tbody>
        </table>
      </div>
    </div>
  )
}