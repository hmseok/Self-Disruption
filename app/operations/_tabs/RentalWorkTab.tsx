'use client'

import RentalListTab from './RentalListTab'
import AccidentIntakeTab from './AccidentIntakeTab'

// ═══════════════════════════════════════════════════════════════════
// RentalWorkTab — 「대차업무」 (사고접수 + 대차진행 통합 컨테이너)
//
// PR-W (2026-05-23) — 사용자 명시:
//   「사고접수를 없애고 대차업무 안에 사고접수리스트를 넣는게」
//   → operations 상위탭에서 「사고접수」 독립탭 폐기.
//     대차리스트 탭 → 「대차업무」 로 격상, 그 안에 서브탭 2개:
//       · 대차진행 — RentalListTab  (상담미진행 → 배차완료)
//       · 사고접수 — AccidentIntakeTab (대차 미사용 건 수동 처리)
//
//   view / onViewChange 는 상위(page.tsx)가 제어 — ?tab=accident 레거시 링크
//   대응 + 대차전환 복귀 흐름에서 서브탭 지정 가능하게 controlled 로 둠.
// ═══════════════════════════════════════════════════════════════════

export type RentalWorkView = 'rental' | 'accident'

const SUB: Array<{ key: RentalWorkView; label: string; icon: string }> = [
  { key: 'rental',   label: '대차진행', icon: '🚗' },
  { key: 'accident', label: '사고접수', icon: '📋' },
]

export default function RentalWorkTab({
  view,
  onViewChange,
}: {
  view: RentalWorkView
  onViewChange: (v: RentalWorkView) => void
}) {
  return (
    <div>
      {/* 서브탭 nav — 상위 다크 탭과 위계 구분되도록 라이트 글래스 칩 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {SUB.map((s) => {
          const active = view === s.key
          return (
            <button
              key={s.key}
              onClick={() => onViewChange(s.key)}
              style={{
                padding: '7px 15px',
                borderRadius: 9,
                border: '1px solid',
                borderColor: active ? 'rgba(99,102,241,0.42)' : 'rgba(0,0,0,0.08)',
                background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                color: active ? '#4338ca' : '#64748b',
                fontWeight: active ? 800 : 600,
                fontSize: 12.5,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {s.icon} {s.label}
            </button>
          )
        })}
      </div>

      {view === 'rental' && <RentalListTab />}
      {view === 'accident' && <AccidentIntakeTab />}
    </div>
  )
}
