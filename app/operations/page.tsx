'use client'

import { useState, useEffect } from 'react'
import AccidentIntakeTab from './_tabs/AccidentIntakeTab'
import ClaimsTab from './_tabs/ClaimsTab'
import WaitingTab from './_tabs/WaitingTab'
import RentalListTab from './_tabs/RentalListTab'

// ═══════════════════════════════════════════════════════════════════
// /operations — Phase 2 통합 페이지 (P2.1a)
//
// 사용자 명시 (2026-05-13):
//   「사고접수, 대차접수, 배차스케줄, 청구관리, 대기차량 — 한 페이지 통합」
//   「배차관리 / 회차관리 / 청구관리 / 대기차량관리 등등」
//
// 운영 라이프사이클:
//   사고접수 → 대차접수(상담/스케줄) → 배차관리 → 회차/청구 → 대기차량
//
// 기존 OperationsMain (1247줄, Calendar+FleetBoard+DispatchModal) 폐기.
// ═══════════════════════════════════════════════════════════════════

type SubTab = 'waiting' | 'accident' | 'claims' | 'rentals'

// 사용자 명시 (2026-05-16):
//   「사고접수를 살리고 그안에 대차쪽에 일부를 갖다붙히고 대차접수를 없애는게」
//   → 대차접수 탭 폐기, 사고접수 탭이 대차요청 처리까지 통합 담당
//   탭 순서: 대기차량(앞) → 사고접수(default) → 배차스케줄 → 청구관리
// PR-N1 (2026-05-22) — 「대차리스트」 탭 추가 (fmi_rentals 원장)
// PR-N5 (2026-05-22) — 「배차스케줄」 탭 폐기
//   사용자 명시: 「리스트가 많으니 상담도 대차로 넘기고 거기서 진행」
//   → 상담중 dispatch_order 까지 대차리스트가 흡수. 탭 4개로 단순화.
const TAB_LIST: Array<{ key: SubTab; label: string; icon: string }> = [
  { key: 'waiting',  label: '대기차량',    icon: '🛠' },
  { key: 'accident', label: '사고접수',    icon: '📋' },
  { key: 'rentals',  label: '대차리스트',  icon: '🚗' },
  { key: 'claims',   label: '청구관리',    icon: '💰' },
]

const TAB_KEYS: SubTab[] = ['waiting', 'accident', 'claims', 'rentals']

export default function OperationsPage() {
  const [tab, setTab] = useState<SubTab>('accident')  // default: 사고접수 (대차요청 진행처리 통합)

  // PR-N4/N5 (2026-05-22) — ?tab= 쿼리로 초기 탭 지정 (배차 상세 「← 대차리스트」 복귀 등)
  //   legacy ?tab=schedule 링크는 대차리스트로 매핑 (배차스케줄 탭 폐기)
  useEffect(() => {
    let t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'schedule') t = 'rentals'
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
        {tab === 'accident' && <AccidentIntakeTab />}

        {tab === 'rentals' && <RentalListTab />}

        {tab === 'claims' && <ClaimsTab />}

        {tab === 'waiting' && <WaitingTab />}
      </div>
    </div>
  )
}
