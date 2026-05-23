'use client'

import { useState, useEffect } from 'react'
import ClaimsTab from './_tabs/ClaimsTab'
import WaitingTab from './_tabs/WaitingTab'
import RentalWorkTab, { RentalWorkView } from './_tabs/RentalWorkTab'

// ═══════════════════════════════════════════════════════════════════
// /operations — Phase 2 통합 페이지 (P2.1a)
//
// 운영 라이프사이클:
//   사고접수 → 대차접수(상담/스케줄) → 배차관리 → 회차/청구 → 대기차량
//
// PR-N1 (2026-05-22) — 「대차리스트」 탭 추가 (fmi_rentals 원장)
// PR-N5 (2026-05-22) — 「배차스케줄」 탭 폐기 → 대차리스트가 상담중까지 흡수
// PR-W  (2026-05-23) — 사용자 명시: 「사고접수를 없애고 대차업무 안에
//   사고접수리스트를 넣는게」 → 「사고접수」 독립탭 폐기.
//   대차리스트 → 「대차업무」 로 격상, 서브탭(대차진행/사고접수) 보유.
//   탭 3개로 단순화: 대기차량 → 대차업무(default) → 청구관리
// ═══════════════════════════════════════════════════════════════════

type SubTab = 'waiting' | 'claims' | 'rentals'

const TAB_LIST: Array<{ key: SubTab; label: string; icon: string }> = [
  { key: 'waiting', label: '대기차량', icon: '🛠' },
  { key: 'rentals', label: '대차업무', icon: '🚗' },
  { key: 'claims',  label: '청구관리', icon: '💰' },
]

const TAB_KEYS: SubTab[] = ['waiting', 'claims', 'rentals']

export default function OperationsPage() {
  const [tab, setTab] = useState<SubTab>('rentals')  // default: 대차업무
  const [rentalView, setRentalView] = useState<RentalWorkView>('rental')

  // ?tab= 쿼리로 초기 탭 지정 (배차 상세 「← 대차리스트」 복귀 등)
  //   legacy: ?tab=schedule → 대차업무, ?tab=accident → 대차업무 > 사고접수 서브탭
  useEffect(() => {
    let t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'schedule') t = 'rentals'
    if (t === 'accident') { setTab('rentals'); setRentalView('accident'); return }
    if (t && (TAB_KEYS as string[]).includes(t)) setTab(t as SubTab)
  }, [])

  return (
    <div className="page-bg">
      <div className="max-w-[1800px] mx-auto py-4 px-4 md:py-5 md:px-6">
        {/* Sub-tab nav */}
        <div style={{
          display: 'flex',
          gap: 6,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}>
          {TAB_LIST.map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: active ? 800 : 600,
                  whiteSpace: 'nowrap',
                  background: active ? '#0f2440' : 'transparent',
                  color: active ? '#fff' : '#475569',
                  boxShadow: active ? '0 4px 12px rgba(15,36,64,0.2)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                {t.icon} {t.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        {tab === 'rentals' && <RentalWorkTab view={rentalView} onViewChange={setRentalView} />}

        {tab === 'claims' && <ClaimsTab />}

        {tab === 'waiting' && <WaitingTab />}
      </div>
    </div>
  )
}
