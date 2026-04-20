'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'

// 동적 import — 각 탭별 기존 페이지를 컴포넌트로 재사용
const CodefPage = dynamic(() => import('../codef/page'), { ssr: false, loading: () => <TabLoading /> })
const UploadPage = dynamic(() => import('../upload/page'), { ssr: false, loading: () => <TabLoading /> })
const LedgerPage = dynamic(() => import('../page'), { ssr: false, loading: () => <TabLoading /> })
const UploadsHistoryPage = dynamic(() => import('../uploads/page'), { ssr: false, loading: () => <TabLoading /> })

function TabLoading() {
  return (
    <div style={{ padding: 80, textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>
      데이터를 불러오는 중...
    </div>
  )
}

type Tab = 'dashboard' | 'classify' | 'uploads' | 'codef'

export default function TransactionsHub() {
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as Tab) || 'dashboard'
  const [tab, setTab] = useState<Tab>(
    ['dashboard', 'classify', 'uploads', 'codef'].includes(initialTab) ? initialTab : 'dashboard'
  )

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: '📊 입출금 대시보드' },
    { key: 'classify', label: '🏷️ 거래 분류 매칭' },
    { key: 'uploads', label: '📂 업로드 이력' },
    { key: 'codef', label: '🔌 Codef 자동연동' },
  ]

  return (
    <>
      {/* ── 메인 탭 바 ── */}
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
              onClick={() => setTab(t.key)}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? '#1e293b' : '#64748b',
                background: tab === t.key ? 'rgba(255,255,255,0.85)' : 'transparent',
                border: tab === t.key ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: tab === t.key
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
      {tab === 'dashboard' && <LedgerPage />}
      {tab === 'classify' && <UploadPage />}
      {tab === 'uploads' && <UploadsHistoryPage />}
      {tab === 'codef' && <CodefPage />}
    </>
  )
}
