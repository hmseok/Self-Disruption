'use client'

import { useState } from 'react'
import dynamicImport from 'next/dynamic'

// 탭 설정
const tabs = [
  { id: 'codes', label: '공통 코드', icon: '🏷️', desc: '드롭다운·상태값 코드 관리' },
  { id: 'company', label: '회사 설정', icon: '🏢', desc: '사업자 정보·기본값' },
  { id: 'modules', label: '모듈 관리', icon: '🧩', desc: '시스템 기능 모듈' },
]

// 동적 탭 컴포넌트 로딩
function TabPlaceholder() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <div className="text-6xl mb-4">⚙️</div>
      <h3 className="text-lg font-bold text-gray-700 mb-2">로딩 중...</h3>
      <p className="text-sm text-gray-500">잠시만 기다려주세요.</p>
    </div>
  )
}

const TabComponents: Record<string, React.ComponentType<any>> = {
  codes: dynamicImport(() => import('./CommonCodesTab').catch(() => TabPlaceholder), { ssr: false }),
  company: dynamicImport(() => import('./CompanySettingsTab').catch(() => TabPlaceholder), { ssr: false }),
  modules: dynamicImport(() => import('./SystemModulesTab').catch(() => TabPlaceholder), { ssr: false }),
}

export default function CodesSettingsPage() {
  const [activeTab, setActiveTab] = useState<string>('codes')
  const [showGuide, setShowGuide] = useState(true)

  const getCurrentTabComponent = () => {
    const TabComponent = TabComponents[activeTab] || TabPlaceholder
    return <TabComponent />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-black text-gray-900">환경설정</h1>
              <p className="text-xs text-gray-500 mt-1">
                공통 코드, 회사 정보, 시스템 모듈을 관리합니다
              </p>
            </div>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
            >
              {showGuide ? '가이드 숨기기' : '가이드 보기'}
              <span className="text-blue-500">💡</span>
            </button>
          </div>
        </div>
      </div>

      {/* 초보자 가이드 배너 */}
      {showGuide && (
        <div className="bg-gradient-to-r from-slate-50 to-zinc-50 border-b border-slate-200">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="flex items-start gap-3 p-3 bg-white/70 rounded-xl">
                <span className="text-xl flex-shrink-0">🏷️</span>
                <div>
                  <p className="font-bold text-gray-800 mb-1">공통 코드</p>
                  <p className="text-gray-600 leading-relaxed">
                    시스템 전체에서 사용하는 드롭다운 항목, 상태값, 분류 코드를 관리합니다.
                    차량 상태, 계약 유형, 연료 종류 등을 코드로 체계화합니다.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white/70 rounded-xl">
                <span className="text-xl flex-shrink-0">🏢</span>
                <div>
                  <p className="font-bold text-gray-800 mb-1">회사 설정</p>
                  <p className="text-gray-600 leading-relaxed">
                    사업자 정보와 렌터카 견적 기본값을 설정합니다.
                    여기서 설정한 기본값이 견적서·계약서에 자동으로 반영됩니다.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white/70 rounded-xl">
                <span className="text-xl flex-shrink-0">🧩</span>
                <div>
                  <p className="font-bold text-gray-800 mb-1">모듈 관리</p>
                  <p className="text-gray-600 leading-relaxed">
                    회사별로 사용할 수 있는 ERP 기능 모듈을 확인합니다.
                    구독 플랜에 따라 활성화 가능한 모듈이 달라집니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 탭 네비게이션 */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                <span className="text-sm">{tab.icon}</span>
                <span>{tab.label}</span>
                <span className={`text-[10px] hidden sm:inline ${
                  activeTab === tab.id ? 'text-gray-300' : 'text-gray-400'
                }`}>
                  {tab.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        {getCurrentTabComponent()}
      </div>
    </div>
  )
}
