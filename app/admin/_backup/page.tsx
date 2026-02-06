'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase'; // 점 두개 확인!
// 👇 [추가 1] 모달 불러오기 (점 하나)
import AddCompanyModal from '../components/admin/AddCompanyModal';

type Company = {
  id: string;
  name: string;
  business_number: string | null;
  plan: string;
  is_active: boolean;
  created_at: string;
};

export default function AdminDashboard() {
   const [companies, setCompanies] = useState<Company[]>([]);
   const [loading, setLoading] = useState(true);
   // 👇 [추가 2] 모달 상태 관리
   const [isModalOpen, setIsModalOpen] = useState(false);

   useEffect(() => {
     fetchCompanies();
   }, []);

   const fetchCompanies = async () => {
     try {
       const { data, error } = await supabase
         .from('companies')
         .select('*')
         .order('created_at', { ascending: false });

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      // alert('데이터를 불러오지 못했습니다.'); // 에러 알림은 너무 자주 뜨면 귀찮으니 주석 처리
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-10 text-center">로딩 중... ⏳</div>;

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">👑 Super Admin</h1>
          <p className="text-gray-500 mt-1">전체 회사 및 고객사 현황 관리</p>
        </div>
        <button
          // 👇 [추가 3] 버튼 누르면 모달 열기
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-sm transition-colors"
        >
          + 회사 강제 등록
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="text-gray-500 text-sm">총 가입 회사</div>
          <div className="text-3xl font-bold mt-2">{companies.length}개</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="text-gray-500 text-sm">활성 구독 (유료)</div>
          <div className="text-3xl font-bold mt-2 text-indigo-600">
            {companies.filter(c => c.plan !== 'free').length}개
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="text-gray-500 text-sm">이번 달 신규</div>
          <div className="text-3xl font-bold mt-2 text-green-600">0개</div>
        </div>
      </div>

      {/* 회사 목록 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h2 className="font-semibold text-gray-800">등록된 회사 목록</h2>
          <span className="text-xs text-gray-500">Total: {companies.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-medium">
              <tr>
                <th className="px-6 py-3">회사명</th>
                <th className="px-6 py-3">사업자번호</th>
                <th className="px-6 py-3">플랜(Plan)</th>
                <th className="px-6 py-3">상태</th>
                <th className="px-6 py-3">가입일</th>
                <th className="px-6 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {companies.map((company) => (
                <tr key={company.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {company.name}
                  </td>
                  <td className="px-6 py-4">{company.business_number || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium
                      ${company.plan === 'master' ? 'bg-purple-100 text-purple-700' :
                        company.plan === 'pro' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {(company.plan || 'free').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {company.is_active ? (
                      <span className="inline-flex items-center text-green-600 font-medium text-xs">
                        <span className="w-2 h-2 bg-green-500 rounded-full mr-1.5"></span>
                        정상
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-red-600 font-medium text-xs">
                        <span className="w-2 h-2 bg-red-500 rounded-full mr-1.5"></span>
                        정지됨
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-400">
                    {new Date(company.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-indigo-600 hover:text-indigo-900 font-medium text-xs hover:underline">
                      상세보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {companies.length === 0 && (
            <div className="p-10 text-center text-gray-400">
              아직 등록된 회사가 없습니다.
            </div>
          )}
        </div>
      </div>

      {/* 👇 [추가 4] 모달 컴포넌트 실제 배치 */}
      <AddCompanyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchCompanies} // 성공하면 목록 새로고침
      />
    </div>
  );
}