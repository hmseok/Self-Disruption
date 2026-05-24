'use client'

import { useState, useEffect } from 'react'
import AccidentIntakeTab from './_tabs/AccidentIntakeTab'
import WaitingTab from './_tabs/WaitingTab'
import RentalListTab from './_tabs/RentalListTab'
import ClaimsTab from './_tabs/ClaimsTab'

// ═══════════════════════════════════════════════════════════════════
// /operations — 「대차업무」 통합 페이지
//
// 운영 라이프사이클: 사고접수 → 상담 → 배차 → 반납 → 청구
//
// PR-W  (2026-05-23) — 사고접수 독립탭 폐기 → 대차업무 서브탭
// PR-Y1 (2026-05-23) — 사용자 명시: 「대차업무 안에 접수·상담 / 사용가능 /
//   배차중 / 반납점검 / 반납·청구 로 가면 되는데」
//   → 차량 상태축(사용가능·배차중·반납점검)과 업무 단계축(접수·상담 / 반납·청구)을
//     한 줄 하위탭으로 정렬. 상위 멀티탭 폐기, 5개 하위탭으로 단순화.
//
//   탭 ↔ 컴포넌트:
//     접수·상담  → AccidentIntakeTab (cafe24 사고 + 상담 진행상태, 기본 오늘)
//     사용가능   → WaitingTab lockStatus='available'
//     배차중     → RentalListTab scope='dispatch' (배차예정+배차완료)
//     반납점검   → WaitingTab lockStatus='returned'
//     반납·청구  → ClaimsTab (회차완료·청구중·정산완료)
// ═══════════════════════════════════════════════════════════════════

type SubTab = 'intake' | 'available' | 'dispatched' | 'maintenance' | 'claims'

const TAB_LIST: Array<{ key: SubTab; label: string; icon: string }> = [
  { key: 'intake',      label: '접수·상담', icon: '📋' },
  { key: 'available',   label: '사용가능', icon: '🟢' },
  { key: 'dispatched',  label: '배차중',   icon: '🚗' },
  { key: 'maintenance', label: '반납점검', icon: '🔧' },
  { key: 'claims',      label: '반납·청구', icon: '💰' },
]

const TAB_KEYS: SubTab[] = ['intake', 'available', 'dispatched', 'maintenance', 'claims']

export default function OperationsPage() {
  const [tab, setTab] = useState<SubTab>('intake')  // default: 접수·상담 (업무 진입점)

  // ?tab= 쿼리로 초기 탭 지정 — 레거시 링크 매핑
  //   schedule/rentals → 배차중,  accident → 접수·상담,  waiting → 사용가능
  useEffect(() => {
    let t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'schedule' || t === 'rentals') t = 'dispatched'
    if (t === 'accident') t = 'intake'
    if (t === 'waiting') t = 'available'
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
                  background: active ? '#3b6eb5' : 'transparent',
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
        {tab === 'intake' && <AccidentIntakeTab />}

        {tab === 'available' && <WaitingTab lockStatus="available" />}

        {tab === 'dispatched' && <RentalListTab scope="dispatch" />}

        {tab === 'maintenance' && <WaitingTab lockStatus="returned" />}

        {tab === 'claims' && <ClaimsTab />}
      </div>
    </div>
  )
}
