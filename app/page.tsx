'use client'
import { useApp } from './context/AppContext'

export default function Dashboard() {
  const { user, currentCompany } = useApp()

  return (
    <div className="p-8 space-y-8 animate-fade-in-up">
      {/* 👋 환영 헤더 */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
            <h1 className="text-3xl font-black text-gray-900 mb-2">
              반갑습니다, <span className="text-indigo-600">{user?.user_metadata?.name || '대표'}</span>님! 👋
            </h1>
            <p className="text-gray-500 font-medium">
              현재 <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded-lg mx-1">{currentCompany?.name || 'Sideline'}</span> 사업장을 관리 중입니다.
            </p>
        </div>
        <div className="text-right hidden md:block">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">TODAY</p>
            <p className="text-xl font-black text-gray-800">{new Date().toLocaleDateString()}</p>
        </div>
      </div>

      {/* 📊 요약 카드 (대시보드 느낌 물씬) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 카드 1: 자금 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-1 transition-all group cursor-pointer">
          <div className="flex justify-between items-start mb-4">
             <div className="p-3 bg-blue-50 rounded-xl text-2xl group-hover:scale-110 transition-transform">💰</div>
             <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">+2.5%</span>
          </div>
          <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">총 운영 자금</h3>
          <p className="text-3xl font-black text-gray-900">₩ 0</p>
        </div>

        {/* 카드 2: 차량 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-1 transition-all group cursor-pointer">
          <div className="flex justify-between items-start mb-4">
             <div className="p-3 bg-purple-50 rounded-xl text-2xl group-hover:scale-110 transition-transform">🚗</div>
             <span className="text-gray-300 text-xs font-bold">등록 필요</span>
          </div>
          <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">보유 차량</h3>
          <p className="text-3xl font-black text-gray-900">0 <span className="text-lg font-medium text-gray-400">대</span></p>
        </div>

        {/* 카드 3: 업무 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-1 transition-all group cursor-pointer">
          <div className="flex justify-between items-start mb-4">
             <div className="p-3 bg-orange-50 rounded-xl text-2xl group-hover:scale-110 transition-transform">🔥</div>
             <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded-full">New</span>
          </div>
          <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">미해결 업무</h3>
          <p className="text-3xl font-black text-gray-900">0 <span className="text-lg font-medium text-gray-400">건</span></p>
        </div>
      </div>

      {/* 🚧 빈 상태 안내 (데이터 없을 때) */}
      <div className="mt-8 text-center py-16 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 hover:border-indigo-200 transition-colors group">
          <div className="text-6xl mb-4 grayscale group-hover:grayscale-0 transition-all duration-500">🏗️</div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">아직 등록된 데이터가 없습니다.</h3>
          <p className="text-gray-500 mb-8 max-w-md mx-auto">
            차량, 자금, 직원 정보를 등록하고<br/>스마트한 관리를 시작해보세요!
          </p>
          <button className="bg-indigo-600 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:scale-105 transition-all">
            첫 데이터 등록하기 🚀
          </button>
      </div>
    </div>
  )
}