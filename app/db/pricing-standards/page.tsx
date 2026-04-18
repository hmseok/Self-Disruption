'use client'

import { useState } from 'react'
import dynamicImport from 'next/dynamic'
import DcToolbar from '../../components/DcToolbar'

// 탭 설정 — 각 탭에 설명 추가
const tabs = [
  { id: 'market', label: '차량시세', icon: '🚗', desc: '외부+자체 블렌드' },
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
  market: dynamicImport(() => import('./MarketPriceTab').catch(() => TabPlaceholder), { ssr: false }),
  depreciation: dynamicImport(() => import('./DepreciationTab').catch(() => TabPlaceholder), { ssr: false }),
  insurance: dynamicImport(() => import('./InsuranceTab').catch(() => TabPlaceholder), { ssr: false }),
  maintenance: dynamicImport(() => import('./MaintenanceTab').catch(() => TabPlaceholder), { ssr: false }),
  inspection: dynamicImport(() => import('./InspectionTab').catch(() => TabPlaceholder), { ssr: false }),
  tax: dynamicImport(() => import('./TaxTab').catch(() => TabPlaceholder), { ssr: false }),
  finance: dynamicImport(() => import('./FinanceTab').catch(() => TabPlaceholder), { ssr: false }),
  registration: dynamicImport(() => import('./RegistrationTab').catch(() => TabPlaceholder), { ssr: false }),
  rules: dynamicImport(() => import('./BusinessRulesTab').catch(() => TabPlaceholder), { ssr: false }),
}

const SimulationPanel = dynamicImport(() => import('./SimulationPanel'), { ssr: false })

export default function PricingStandardsPage() {
  const [activeTab, setActiveTab] = useState<string>('market')
  const [showGuide, setShowGuide] = useState(true)
  const [showSimulation, setShowSimulation] = useState(true)

  const getCurrentTabComponent = () => {
    const TabComponent = TabComponents[activeTab] || TabPlaceholder
    return <TabComponent tabId={activeTab} />
  }

  return (
    <div className="page-bg">
      <div className="max-w-[1800px] mx-auto py-4 px-4 md:py-5 md:px-6">

        {/* ═══ Toolbar with tab filters ═══ */}
        <DcToolbar
          search=""
          onSearchChange={() => {}}
          placeholder=""
          filters={tabs.map(tab => ({ key: tab.id, label: `${tab.icon} ${tab.label}` }))}
          activeFilter={activeTab}
          onFilterChange={(key) => setActiveTab(key)}
          trailing={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSimulation(!showSimulation)}
                style={{
                  padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 8,
                  border: '1px solid rgba(0,0,0,0.06)',
                  background: showSimulation ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.6)',
                  color: showSimulation ? '#3b82f6' : '#64748b',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                🧮 {showSimulation ? '시뮬레이션' : '시뮬레이션'}
              </button>
              <button
                onClick={() => setShowGuide(!showGuide)}
                style={{
                  padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 8,
                  border: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.6)',
                  color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                💡 {showGuide ? '가이드 숨기기' : '가이드 보기'}
              </button>
            </div>
          }
        />

        {/* 초보자 가이드 배너 */}
        {showGuide && (
          <div style={{
            background: 'rgba(255,255,255,0.72)',
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
            border: '1px solid rgba(0,0,0,0.05)',
            boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)',
          }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="flex items-start gap-3 p-3 bg-white/60 rounded-xl">
                <span className="text-xl flex-shrink-0">📊</span>
                <div>
                  <p className="font-bold text-slate-800 mb-1">기준 데이터란?</p>
                  <p className="text-slate-600 leading-relaxed">
                    렌트료를 산출할 때 필요한 감가율, 보험료, 정비비, 세금, 금리 등의 기초 데이터입니다.
                    대형 렌터카사(롯데·SK·현대캐피탈)도 동일한 구조의 기준표를 관리합니다.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white/60 rounded-xl">
                <span className="text-xl flex-shrink-0">🔍</span>
                <div>
                  <p className="font-bold text-slate-800 mb-1">실시간 검증이란?</p>
                  <p className="text-slate-600 leading-relaxed">
                    각 탭 오른쪽의 검증 패널에서 Gemini AI로 현재 시장 데이터를 실시간 조회합니다.
                    우리 기준표와 시장가를 비교해 적정성을 판단할 수 있습니다.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white/60 rounded-xl">
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
        )}

        {/* 메인 레이아웃: 탭 콘텐츠 + 시뮬레이션 사이드패널 */}
        <div className="flex gap-5">
          {/* 좌측: 탭 콘텐츠 영역 */}
          <div className={`${showSimulation ? 'flex-1 min-w-0' : 'w-full'}`}>
            {getCurrentTabComponent()}
          </div>

          {/* 우측: 실시간 시뮬레이션 사이드 패널 */}
          {showSimulation && (
            <div className="hidden xl:block w-[340px] flex-shrink-0">
              <div className="sticky top-4">
                <SimulationPanel />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
