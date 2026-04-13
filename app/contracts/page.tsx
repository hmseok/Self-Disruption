'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import ContractListMain from './ContractListMain'

const CustomerPage = dynamic(() => import('../customers/CustomerList'), { ssr: false })

export default function ContractsHub() {
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab') === 'customers' ? 'customers' : 'contracts'
  const [mainTab, setMainTab] = useState<'contracts' | 'customers'>(initialTab)

  const tabs = [
    { key: 'contracts' as const, label: '📋 계약 목록' },
    { key: 'customers' as const, label: '👥 고객 관리' },
  ]

  return (
    <>
      {/* ── 메인 탭 (page-bg 위에 오버레이) ── */}
      <div className="max-w-[1400px] mx-auto pt-4 px-4 md:pt-5 md:px-6" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'flex',
          gap: 4,
          marginBottom: -8,
          background: 'rgba(255,255,255,0.50)',
          borderRadius: 12,
          padding: 4,
          border: '1px solid rgba(0,0,0,0.05)',
        }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setMainTab(t.key)}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: mainTab === t.key ? 700 : 500,
                color: mainTab === t.key ? '#1e293b' : '#64748b',
                background: mainTab === t.key ? 'rgba(255,255,255,0.85)' : 'transparent',
                border: mainTab === t.key ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: mainTab === t.key
                  ? '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)'
                  : 'none',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 탭 콘텐츠 ── */}
      {mainTab === 'contracts' && <ContractListMain />}
      {mainTab === 'customers' && <CustomerPage />}
    </>
  )
}
