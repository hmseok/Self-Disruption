'use client'

import { useState, useEffect } from 'react'
import AccidentIntakeTab from './_tabs/AccidentIntakeTab'
import WaitingTab from './_tabs/WaitingTab'
import RentalListTab from './_tabs/RentalListTab'
import ClaimsTab from './_tabs/ClaimsTab'
import DepositsTab from './_tabs/DepositsTab'

// ═══════════════════════════════════════════════════════════════════
// /operations — 「단기·대차」 (A안 확정 2026-07-30, CONTRACT-UNIFY-A-PLAN)
//
// 운영 라이프사이클: 사고접수 → 상담 → 배차 → 반납 → 청구 → 입금
//
// 탭 구조는 2026-07-04 사용자 확정 「접수-배차-청구 로 깔끔하게」 흐름 유지.
// 2026-07-30 개편: 페이지 헤더 신설 + 플랫 스타일 (이모지·그림자 제거).
//   탭 ↔ 컴포넌트:
//     접수  → AccidentIntakeTab (사고 + 상담 진행상태, 기본 오늘)
//     배차  → RentalListTab scope='dispatch' (배차예정+배차완료)
//     청구  → ClaimsTab (회차완료·청구중·정산완료)
//     입금  → DepositsTab (렌터카통장 열람 + 연결)
//     (사용가능 차량 뷰는 ?tab=available 레거시 링크로만 접근)
// ═══════════════════════════════════════════════════════════════════

type SubTab = 'intake' | 'available' | 'dispatched' | 'claims' | 'deposits'

const FLOW_TABS: Array<{ key: SubTab; label: string; step: number }> = [
  { key: 'intake',      label: '접수', step: 1 },
  { key: 'dispatched',  label: '배차', step: 2 },
  { key: 'claims',      label: '청구', step: 3 },
  { key: 'deposits',    label: '입금', step: 4 },
]

const TAB_KEYS: SubTab[] = ['intake', 'available', 'dispatched', 'claims', 'deposits']

export default function OperationsPage() {
  const [tab, setTab] = useState<SubTab>('intake')  // default: 접수 (업무 진입점)

  // ?tab= 쿼리로 초기 탭 지정 — 레거시 링크 매핑
  //   schedule/rentals → 배차,  accident → 접수,  waiting → 사용가능
  useEffect(() => {
    let t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'schedule' || t === 'rentals') t = 'dispatched'
    if (t === 'accident') t = 'intake'
    if (t === 'waiting') t = 'available'
    if (t && (TAB_KEYS as string[]).includes(t)) setTab(t as SubTab)
  }, [])

  // PR-UX-CLAIM — 탭 내부에서 탭 전환 요청 (예: 반납 확정 → 청구 작성 직행)
  useEffect(() => {
    const h = (e: Event) => {
      const t = (e as CustomEvent)?.detail?.tab
      if (t && (TAB_KEYS as string[]).includes(t)) setTab(t as SubTab)
    }
    window.addEventListener('operations:switch-tab', h)
    return () => window.removeEventListener('operations:switch-tab', h)
  }, [])

  return (
    <div className="page-bg">
      <div className="max-w-[1800px] mx-auto py-4 px-4 md:py-5 md:px-6">
        {/* 페이지 헤더 */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 21, letterSpacing: '-0.02em', fontWeight: 700, color: '#1a1d23' }}>단기·대차</h1>
          <p style={{ color: '#5b626e', fontSize: 13, marginTop: 3 }}>사고대차와 단기렌트 — 접수부터 배차, 보험사 청구, 입금 확인까지</p>
        </div>

        {/* 업무 흐름 탭 (① → ② → ③ → ④) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {FLOW_TABS.map((t, i) => {
            const active = tab === t.key
            return (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <span style={{ color: '#cbd5e1', fontSize: 16, fontWeight: 600 }}>→</span>}
                <button onClick={() => setTab(t.key)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10,
                  border: `1px solid ${active ? '#2563eb' : '#e6e8ec'}`, cursor: 'pointer',
                  fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap',
                  background: active ? '#2563eb' : '#fff',
                  color: active ? '#fff' : '#5b626e',
                  transition: 'all 0.12s',
                }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: active ? 'rgba(255,255,255,0.22)' : '#eff4ff', color: active ? '#fff' : '#2563eb' }}>{t.step}</span>
                  {t.label}
                </button>
              </div>
            )
          })}
        </div>

        {/* Tab content */}
        {tab === 'intake' && <AccidentIntakeTab />}

        {tab === 'available' && <WaitingTab lockStatus="available" />}

        {tab === 'dispatched' && <RentalListTab />}

        {tab === 'claims' && <ClaimsTab />}

        {tab === 'deposits' && <DepositsTab />}
      </div>
    </div>
  )
}
