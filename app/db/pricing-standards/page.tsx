'use client'

import { useState } from 'react'
import dynamicImport from 'next/dynamic'

// 탭 설정 — 각 탭에 설명 추가
const tabs = [
  { id: 'depreciation', label: '감가기준', icon: '📉', desc: '차량 잔존가치율' },
  { id: 'insurance', label: '보험료', icon: '🛡️', desc: '보험료 기준표' },
  { id: 'maintenance', label: '정비비', icon: '🔧', desc: '월 정비비 기준' },
  { id: 'inspection', label: '검사비', icon: '🔍', desc: '차량 검사비용' },
  { id: 'tax', label: '자동차세', icon: '🏛️', desc: '법정 세율 기준' },
  { id: 'finance', label: '금융금리', icon: '🏦', desc: '금융상품 요율' },
  { id: 'registration', label: '등록비용', icon: '📋', desc: '취등록 비용' },
  { id: 'rules', label: '기본설정', icon: '⚙️', desc: '시스템 파라미터' },
]

// 동적 탭 컴포넌트 로딩
function TabPlaceholder() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <div className="text-6xl mb-4">⚙️</div>
      <h3 className="text-lg font-bold text-gray-700 mb-2">개발 예정</h3>
      <p className="text-sm text-gray-500">이 탭은 아직 구현되지 않았습니다.</p>
    </div>
  )
}

const TabComponents: Record<string, React.ComponentType<any>> = {
  depreciation: dynamicImport(() => import('./DepreciationTab').catch(() => TabPlaceholder), { ssr: false }),
  insurance: dynamicImport(() => import('./InsuranceTab').catch(() => TabPlaceholder), { ssr: false }),
  maintenance: dynamicImport(() => import('./MaintenanceTab').catch(() => TabPlaceholder), { ssr: false }),
  inspection: dynamicImport(() => import('./InspectionTab').catch(() => TabPlaceholder), { ssr: false }),
  tax: dynamicImport(() => import('./TaxTab').catch(() => TabPlaceholder), { ssr: false }),
  finance: dynamicImport(() => import('./FinanceTab').catch(() => TabPlaceholder), { ssr: false }),
  registration: dynamicImport(() => import('./RegistrationTab').catch(() => TabPlaceholder), { ssr: false }),
  rules: dynamicImport(() => import('./BusinessRulesTab').catch(() => TabPlaceholder), { ssr: false }),
}

export default function PricingStandardsPage() {
  const [activeTab, setActiveTab] = useState<string>('depreciation')
  const [showGuide, setShowGuide] = useState(true)

  const getCurrentTabComponent = () => {
    const TabComponent = TabComponents[activeTab] || TabPlaceholder
    return <TabComponent tabId={activeTab} />
  }

  return (
    <div className="page-bg">
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">

        {/* 헤더 */}
        <div className="bg-gray-50 border-b border-black/[0.06] sticky top-0 z-40 -mx-4 -mt-4 px-4 md:px-6 py-5 md:rounded-t-xl">
          <div className="max-w-[1400px] mx-auto flex items-start justify-between">
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">📊 산출 기준 관리</h2>
              <p className="text-slate-400 mt-1 text-sm">
                렌트료 산출에 필요한 기본 데이터와 시장 가격 기준을 관리합니다
              </p>
            </div>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-black/[0.06] text-slate-400 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
            >
              {showGuide ? '가이드 숨기기' : '가이드 보기'}
              <span className="text-slate-400">💡</span>
            </button>
          </div>
        </div>
      </div>

      {/* 초보자 가이드 배너 */}
      {showGuide && (
        <div className="bg-gradient-to-r from-white/5 to-white/[0.02] border-b border-black/[0.06]">
          <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="flex items-start gap-3 p-3 bg-gray-100 rounded-xl">
                <span className="text-xl flex-shrink-0">📊</span>
                <div>
                  <p className="font-bold text-slate-800 mb-1">기준 데이터란?</p>
                  <p className="text-slate-600 leading-relaxed">
                    렌트료를 산출할 때 필요한 감가율, 보험료, 정비비, 세금, 금리 등의 기초 데이터입니다.
                    대형 렌터카사(롯데·SK·현대캐피탈)도 동일한 구조의 기준표를 관리합니다.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-100 rounded-xl">
                <span className="text-xl flex-shrink-0">🔍</span>
                <div>
                  <p className="font-bold text-slate-800 mb-1">실시간 검증이란?</p>
                  <p className="text-slate-600 leading-relaxed">
                    각 탭 오른쪽의 검증 패널에서 Gemini AI로 현재 시장 데이터를 실시간 조회합니다.
                    우리 기준표와 시장가를 비교해 적정성을 판단할 수 있습니다.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-100 rounded-xl">
                <span className="text-xl flex-shrink-0">🏢</span>
                <div>
                  <p className="font-bold text-slate-800 mb-1">업계 비교 기준</p>
                  <p className="text-slate-600 leading-relaxed">
                    롯데렌탈·SK렌터카·현대캐피탈 등 대형사 기준을 참고합니다.
                    소규모 렌터카도 동일 원가구조를 이해하면 전문가 수준의 산출이 가능합니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 탭 바 */}
      <div className="bg-gray-50 border-b border-black/[0.06]">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6">
          <div className="flex gap-1.5 overflow-x-auto py-3 scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap transition-all text-xs font-semibold min-w-fit
                  ${
                    activeTab === tab.id
                      ? 'bg-white/20 text-white shadow-md shadow-white/10'
                      : 'bg-gray-100 text-slate-400 hover:bg-gray-100'
                  }
                `}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {activeTab === tab.id && (
                  <span className="text-slate-400 text-[10px] hidden sm:inline">
                    {tab.desc}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 탭 컨텐츠 */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6">
        {getCurrentTabComponent()}
      </div>
    </div>
  )
}
