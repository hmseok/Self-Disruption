'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link' // 👈 링크 이동을 위해 추가

// 🎨 탭 버튼
const TabButton = ({ active, label, icon, onClick }: any) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-5 py-3 rounded-t-xl font-bold transition-all border-b-2 ${
      active
        ? 'bg-white text-indigo-700 border-indigo-600 shadow-sm z-10'
        : 'bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100 hover:text-gray-700'
    }`}
  >
    <span>{icon}</span>
    {label}
  </button>
)

// 📊 현황판 카드
const StatCard = ({ title, value, sub, color }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
    <div>
      <p className="text-gray-500 text-sm font-bold uppercase tracking-wider">{title}</p>
      <h3 className="text-3xl font-black text-gray-900 mt-1 group-hover:scale-105 transition-transform origin-left">{value}</h3>
      <p className={`text-xs font-bold mt-2 ${color}`}>{sub}</p>
    </div>
    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${color.replace('text-', 'bg-').replace('600', '100')}`}>
      📊
    </div>
  </div>
)

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'company' | 'menu' | 'org'>('company')
  const supabase = createClientComponentClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    setLoading(true)
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  // 📂 시스템 모듈 정의 (경로 포함)
  const [features, setFeatures] = useState([
    { id: 'cars', name: '차량 통합 관리', path: '/cars', enabled: true, desc: '차량 조회, 등록, 배차 현황', icon: '🚙', color: 'bg-blue-50 text-blue-600' },
    { id: 'jiip', name: '지입/위수탁', path: '/jiip', enabled: true, desc: '지입 차주 및 수익금 정산', icon: '🚚', color: 'bg-orange-50 text-orange-600' },
    { id: 'finance', name: '재무/회계', path: '/finance', enabled: true, desc: '매출/매입 및 세무 처리', icon: '💰', color: 'bg-green-50 text-green-600' },
    { id: 'insurance', name: '보험/사고', path: '/insurance', enabled: true, desc: '사고 접수 및 보험 이력', icon: '🚑', color: 'bg-red-50 text-red-600' },
    { id: 'quotes', name: '견적/계약', path: '/quotes', enabled: true, desc: '고객 견적 및 전자 계약', icon: '📑', color: 'bg-purple-50 text-purple-600' },
    { id: 'invest', name: '투자 관리', path: '/invest', enabled: false, desc: '투자자 배당 및 수익 분석', icon: '📈', color: 'bg-teal-50 text-teal-600' },
  ])

  const toggleFeature = (id: string) => {
    setFeatures(features.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f))
  }

  return (
    <div className="min-h-screen bg-slate-50 animate-fade-in pb-20">

      {/* 👑 1. 상단 헤더 */}
      <div className="bg-slate-900 text-white pt-10 pb-32 px-8 shadow-xl">
        <div className="max-w-7xl mx-auto flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="bg-indigo-500 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest shadow-lg shadow-indigo-500/50">Master Admin</span>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
              <span className="text-green-400 text-xs font-bold">Online</span>
            </div>
            <h1 className="text-4xl font-black tracking-tight">System Control Tower</h1>
            <p className="text-slate-400 mt-2 font-medium">Sideline 전체 시스템 중앙 제어</p>
          </div>

          <button
            onClick={handleLogout}
            disabled={loading}
            className="bg-slate-800 border border-slate-700 hover:bg-red-600 hover:border-red-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 group"
          >
            {loading ? '종료 중...' : '로그아웃'}
          </button>
        </div>
      </div>

      {/* 🚀 2. 메인 컨텐츠 */}
      <div className="max-w-7xl mx-auto px-8 -mt-24">

        {/* ✨ [New] 서비스 바로가기 (이게 필요하셨습니다!) */}
        <div className="mb-10">
          <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
            🚀 어플리케이션 바로가기
            <span className="text-xs font-normal text-slate-300 bg-slate-800 px-2 py-0.5 rounded-full">업무 페이지 이동</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {features.map((feature) => (
              <Link
                href={feature.path}
                key={feature.id}
                className={`p-4 rounded-xl border shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl flex flex-col items-center text-center group bg-white ${!feature.enabled && 'opacity-50 grayscale cursor-not-allowed'}`}
                onClick={(e) => !feature.enabled && e.preventDefault()}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl mb-3 ${feature.color}`}>
                  {feature.icon}
                </div>
                <div className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{feature.name}</div>
                <div className="text-[10px] text-gray-400 mt-1">{feature.desc.split(' ')[0]}</div>
              </Link>
            ))}
          </div>
        </div>

        {/* 요약 현황판 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard title="전체 모듈" value={`${features.length}개`} sub="기능 탑재 완료" color="text-indigo-600" />
          <StatCard title="활성 상태" value={`${features.filter(f=>f.enabled).length}개`} sub="현재 사용 중" color="text-emerald-600" />
          <StatCard title="시스템 상태" value="정상" sub="Supabase Connected" color="text-blue-600" />
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex gap-2 border-b border-gray-200 mb-8 pl-2 mt-12">
           <TabButton active={activeTab === 'company'} onClick={() => setActiveTab('company')} label="기능 제어" icon="🧩" />
           <TabButton active={activeTab === 'menu'} onClick={() => setActiveTab('menu')} label="권한 설정" icon="🔒" />
           <TabButton active={activeTab === 'org'} onClick={() => setActiveTab('org')} label="조직 관리" icon="👥" />
        </div>

        {/* 탭 내용 영역 */}
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm min-h-[500px]">

          {/* [탭 1] 기능 모듈 제어 */}
          {activeTab === 'company' && (
            <div className="animate-fade-in">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">📦 모듈 ON/OFF 설정</h3>
                <span className="text-xs font-bold text-gray-400">비활성화 시 바로가기 접근 불가</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {features.map((feature) => (
                  <div key={feature.id} className={`p-5 rounded-2xl border-2 transition-all flex justify-between items-center group ${feature.enabled ? 'border-indigo-100 bg-indigo-50/30' : 'border-gray-100 bg-gray-50 opacity-70'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-sm bg-white`}>
                        {feature.icon}
                      </div>
                      <div>
                        <h4 className={`font-bold text-lg ${feature.enabled ? 'text-gray-900' : 'text-gray-500'}`}>{feature.name}</h4>
                        <p className="text-xs text-gray-500">{feature.desc}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleFeature(feature.id)}
                      className={`w-14 h-8 rounded-full transition-colors relative shadow-inner ${feature.enabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
                    >
                      <div className={`w-6 h-6 bg-white rounded-full absolute top-1 shadow-md transition-all ${feature.enabled ? 'left-7' : 'left-1'}`}></div>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* [탭 2, 3은 기존과 동일하므로 생략하지 않고 그대로 유지] */}
          {activeTab === 'menu' && (
             <div className="animate-fade-in">
             <h3 className="text-xl font-bold text-gray-900 mb-6">🚦 직급별 페이지 접근 제어</h3>
             <div className="overflow-hidden rounded-xl border border-gray-200">
               <table className="w-full text-left bg-white">
                 <thead>
                   <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
                     <th className="py-4 px-6 font-bold">메뉴명</th>
                     <th className="py-4 px-6 text-center w-32 border-l">사원</th>
                     <th className="py-4 px-6 text-center w-32 border-l">팀장</th>
                     <th className="py-4 px-6 text-center w-32 border-l bg-indigo-50 text-indigo-700">관리자</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100 text-gray-700 font-medium text-sm">
                   {features.map((row, idx) => (
                     <tr key={idx} className="hover:bg-gray-50 transition-colors">
                       <td className="py-4 px-6">{row.name}</td>
                       <td className="text-center border-l"><input type="checkbox" defaultChecked={true} className="w-5 h-5 accent-indigo-600 rounded" /></td>
                       <td className="text-center border-l"><input type="checkbox" defaultChecked={true} className="w-5 h-5 accent-indigo-600 rounded" /></td>
                       <td className="text-center border-l bg-indigo-50/30"><input type="checkbox" checked disabled className="w-5 h-5 accent-gray-400 cursor-not-allowed" /></td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           </div>
          )}

          {activeTab === 'org' && (
            <div className="animate-fade-in max-w-2xl">
              <h3 className="text-xl font-bold text-gray-900 mb-6">👥 관리자 계정</h3>
              <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">M</div>
                  <div>
                    <div className="font-bold text-gray-900">Admin</div>
                    <div className="text-xs text-indigo-600 font-bold">시스템 최고 관리자</div>
                  </div>
                </div>
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">접속 중</span>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}