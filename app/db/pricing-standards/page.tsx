'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

export const dynamic = 'force-dynamic'

// 🏷️ 탭 설정
const tabs = [
  { id: 'depreciation', label: '감가기준', icon: '📉' },
  { id: 'insurance', label: '보험료', icon: '🛡️' },
  { id: 'maintenance', label: '정비비', icon: '🔧' },
  { id: 'tax', label: '자동차세', icon: '🏛️' },
  { id: 'finance', label: '금융금리', icon: '🏦' },
  { id: 'registration', label: '등록비용', icon: '📋' },
  { id: 'rules', label: '기본설정', icon: '⚙️' },
]

// 🎯 동적 탭 컴포넌트 로딩
// 각 탭은 나중에 구현될 예정이므로, 지금은 플레이스홀더 사용
const TabComponents: Record<string, React.ComponentType<any>> = {
  depreciation: dynamic(() => import('./DepreciationTab').catch(() => TabPlaceholder), { ssr: false }),
  insurance: dynamic(() => import('./InsuranceTab').catch(() => TabPlaceholder), { ssr: false }),
  maintenance: dynamic(() => import('./MaintenanceTab').catch(() => TabPlaceholder), { ssr: false }),
  tax: dynamic(() => import('./TaxTab').catch(() => TabPlaceholder), { ssr: false }),
  finance: dynamic(() => import('./FinanceTab').catch(() => TabPlaceholder), { ssr: false }),
  registration: dynamic(() => import('./RegistrationTab').catch(() => TabPlaceholder), { ssr: false }),
  rules: dynamic(() => import('./BusinessRulesTab').catch(() => TabPlaceholder), { ssr: false }),
}

// 📋 탭 컴포넌트가 없을 때 플레이스홀더
function TabPlaceholder({ tabId }: { tabId?: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <div className="text-6xl mb-4">⚙️</div>
      <h3 className="text-lg font-bold text-gray-700 mb-2">개발 예정</h3>
      <p className="text-sm text-gray-500">
        이 탭은 아직 구현되지 않았습니다. 곧 추가될 예정입니다.
      </p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// 🎨 산출 기준 데이터 관리 — 메인 대시보드
// ────────────────────────────────────────────────────────────────
export default function PricingStandardsPage() {
  const [activeTab, setActiveTab] = useState<string>('depreciation')

  const getCurrentTabComponent = () => {
    const TabComponent = TabComponents[activeTab] || TabPlaceholder
    return <TabComponent tabId={activeTab} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <h1 className="text-3xl font-black text-gray-900">산출 기준 데이터 관리</h1>
          <p className="text-sm text-gray-500 mt-2">
            렌트료 산출에 필요한 기본 데이터와 시장 가격 기준을 관리합니다.
          </p>
        </div>
      </div>

      {/* 탭 바 */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-2 overflow-x-auto -mx-6 px-6 py-4 scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-4 py-2 rounded-full whitespace-nowrap transition-all text-sm font-semibold
                  ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                `}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 탭 컨텐츠 */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {getCurrentTabComponent()}
      </div>
    </div>
  )
}
