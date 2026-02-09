'use client'
import { useApp } from './context/AppContext'

export default function Dashboard() {
  const { user, currentCompany } = useApp()

  return (
    <div className="p-8">
      {/* 환영 헤더 */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-900">
          반갑습니다, {user?.user_metadata?.name || '대표'}님! 👋
        </h1>
        <p className="text-gray-500 mt-2">
          오늘도 <span className="text-indigo-600 font-bold">{currentCompany?.name || 'Sideline'}</span> 관리를 시작해볼까요?
        </p>
      </div>

      {/* 요약 카드들 (샘플) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <h3 className="text-gray-400 text-sm font-bold mb-2">총 운영 자금</h3>
          <p className="text-3xl font-black text-gray-900">₩ 0</p>
          <div className="mt-4 text-xs font-medium text-gray-400">이번 달 입출금 내역이 없습니다.</div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <h3 className="text-gray-400 text-sm font-bold mb-2">보유 차량</h3>
          <p className="text-3xl font-black text-gray-900">0대</p>
          <div className="mt-4 text-xs font-medium text-indigo-500 cursor-pointer hover:underline">+ 차량 등록하기</div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <h3 className="text-gray-400 text-sm font-bold mb-2">미해결 업무</h3>
          <p className="text-3xl font-black text-gray-900">0건</p>
          <div className="mt-4 text-xs font-medium text-green-500">모든 업무가 처리되었습니다! 🎉</div>
        </div>
      </div>

      {/* 빈 상태 안내 */}
      <div className="mt-12 text-center py-12 bg-gray-50 rounded-3xl border border-dashed border-gray-300">
          <p className="text-gray-400 font-medium">아직 데이터가 없습니다.</p>
          <button className="mt-4 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors">
            첫 데이터 등록하기
          </button>
      </div>
    </div>
  )
}