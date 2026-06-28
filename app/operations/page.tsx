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
//     반납·청구  → ClaimsTab (회차완료·청구중·정산완료)
//
// PR-Y3 (2026-05-24) — 사용자 명시: 반납점검 탭 제거 (정비는 대차업무 흐름 외).
// ═══════════════════════════════════════════════════════════════════

type SubTab = 'intake' | 'available' | 'dispatched' | 'claims'

// 업무 흐름: ① 접수·상담 → ② 배차중 → ③ 반납·청구 (사용가능 차량은 자원 뷰)
const FLOW_TABS: Array<{ key: SubTab; label: string; icon: string; step: number }> = [
  { key: 'intake',      label: '접수·상담', icon: '📋', step: 1 },
  { key: 'dispatched',  label: '배차중',   icon: '🚗', step: 2 },
  { key: 'claims',      label: '반납·청구', icon: '💰', step: 3 },
]

const TAB_KEYS: SubTab[] = ['intake', 'available', 'dispatched', 'claims']

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
        {/* 업무 흐름 탭 (① → ② → ③) + 사용가능 차량(자원) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {FLOW_TABS.map((t, i) => {
            const active = tab === t.key
            return (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <span style={{ color: '#cbd5e1', fontSize: 18, fontWeight: 700 }}>→</span>}
                <button onClick={() => setTab(t.key)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 12,
                  border: active ? 'none' : '1px solid rgba(0,0,0,0.08)', cursor: 'pointer',
                  fontSize: 13, fontWeight: active ? 800 : 600, whiteSpace: 'nowrap',
                  background: active ? 'linear-gradient(135deg, #3b6eb5, #5a8fd4)' : '#fff',
                  color: active ? '#fff' : '#475569',
                  boxShadow: active ? '0 6px 16px rgba(59,110,181,0.3)' : 'none', transition: 'all 0.2s',
                }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: active ? 'rgba(255,255,255,0.25)' : 'rgba(59,110,181,0.12)', color: active ? '#fff' : '#3b6eb5' }}>{t.step}</span>
                  {t.icon} {t.label}
                </button>
              </div>
            )
          })}
          <div style={{ width: 1, height: 26, background: 'rgba(0,0,0,0.1)', margin: '0 6px' }} />
          <button onClick={() => setTab('available')} style={{
            padding: '9px 16px', borderRadius: 12, cursor: 'pointer', fontSize: 13,
            fontWeight: tab === 'available' ? 800 : 600, whiteSpace: 'nowrap',
            border: tab === 'available' ? 'none' : '1px solid rgba(16,185,129,0.3)',
            background: tab === 'available' ? '#10b981' : 'rgba(16,185,129,0.06)',
            color: tab === 'available' ? '#fff' : '#047857', transition: 'all 0.2s',
          }}>🟢 사용가능 차량</button>
        </div>

        {/* Tab content */}
        {tab === 'intake' && <AccidentIntakeTab />}

        {tab === 'available' && <WaitingTab lockStatus="available" />}

        {tab === 'dispatched' && <RentalListTab scope="dispatch" />}

        {tab === 'claims' && <ClaimsTab />}
      </div>
    </div>
  )
}
