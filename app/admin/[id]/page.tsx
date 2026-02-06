'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabase';
import { useParams, useRouter } from 'next/navigation';

export default function CompanyDetail() {
  const params = useParams();
  const router = useRouter();
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCompanyDetail() {
      if (!params?.id) return;

      // 1. 회사 기본 정보 가져오기
      const { data: companyData, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error) {
        alert('회사를 찾을 수 없습니다.');
        router.push('/admin');
        return;
      }
      setCompany(companyData);
      setLoading(false);
    }
    fetchCompanyDetail();
  }, [params.id]);

  const updatePlan = async (newPlan: string) => {
    const { error } = await supabase
      .from('companies')
      .update({ plan: newPlan })
      .eq('id', company.id);

    if (!error) {
      setCompany({ ...company, plan: newPlan });
      alert('요금제가 변경되었습니다! 💵');
    }
  };

  if (loading) return <div className="p-10">로딩 중...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <button onClick={() => router.back()} className="text-gray-500 mb-4 hover:underline">
        ← 목록으로 돌아가기
      </button>

      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{company.name}</h1>
            <p className="text-gray-500">사업자번호: {company.business_number || '미등록'}</p>
          </div>
          <span className={`px-4 py-2 rounded-full font-bold ${company.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {company.is_active ? '정상 이용 중' : '이용 정지됨'}
          </span>
        </div>

        <div className="my-8 border-t border-gray-200" />

        {/* ⚡️ 슈퍼 관리자 전용 컨트롤 패널 */}
        <h2 className="text-lg font-bold mb-4">👑 관리자 제어판</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* 1. 요금제 변경 */}
          <div className="bg-gray-50 p-5 rounded-lg">
            <h3 className="font-semibold mb-3">요금제 등급 변경</h3>
            <div className="flex gap-2">
              {['free', 'pro', 'master'].map((plan) => (
                <button
                  key={plan}
                  onClick={() => updatePlan(plan)}
                  className={`flex-1 py-2 rounded text-sm font-medium transition-colors
                    ${company.plan === plan
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white border hover:bg-gray-100 text-gray-700'}`}
                >
                  {plan.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* 2. 강제 접속 (준비 중) */}
          <div className="bg-gray-50 p-5 rounded-lg">
            <h3 className="font-semibold mb-3">긴급 조치</h3>
            <button className="w-full py-2 bg-red-100 text-red-600 rounded border border-red-200 hover:bg-red-200 font-medium">
              ⛔️ 서비스 이용 정지시키기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}