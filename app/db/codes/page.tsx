'use client'

import dynamicImport from 'next/dynamic'

function TabPlaceholder() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <div className="text-6xl mb-4">🏢</div>
      <h3 className="text-lg font-bold text-gray-700 mb-2">로딩 중...</h3>
      <p className="text-sm text-gray-500">잠시만 기다려주세요.</p>
    </div>
  )
}

const CompanySettings = dynamicImport(() => import('./CompanySettingsTab').catch(() => TabPlaceholder), { ssr: false })

export default function CompanyInfoPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-5">
          <h1 className="text-2xl font-black text-gray-900">회사 정보</h1>
          <p className="text-xs text-gray-500 mt-1">
            정산서, 견적서, 계약서에 표시되는 회사 정보를 관리합니다
          </p>
        </div>
      </div>
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-6">
        <CompanySettings />
      </div>
    </div>
  )
}
