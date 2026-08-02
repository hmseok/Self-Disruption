'use client'

import { useState } from 'react'
import QuotesTab from '@/app/long-term-rentals/_components/QuotesTab'
import NeuFilterTabs from '@/app/components/NeuFilterTabs'
import { COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// 견적함 — 별도 페이지 (2026-08-02 사용자 확정)
//
// "견적은 별도 페이지랑 사이드메뉴로 빼는 게 낫다. 임시 견적들이니까
//  장기랑 단기도 견적 확인하는 건 별도로 있고, 그 이후에 장기계약이나
//  단기대차 쪽에서 필요시 불러와서 선택할 수 있게."
//
// 장기 견적 = lt_quotes (기존 QuotesTab 재사용 — 데이터 계층 동일)
// 단기 견적 = 데이터 모델 미확정 — 자리만 두고 안내
// ═══════════════════════════════════════════════════════════════════

export default function QuotesPage() {
  const [tab, setTab] = useState<'long' | 'short'>('long')

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, color: COLORS.textPrimary, fontSize: 14 }}>
      {/* 작성 버튼은 장기 견적 탭 안(QuotesTab)에 이미 있어 헤더에는 두지 않음 */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 21, letterSpacing: '-0.02em', fontWeight: 700 }}>견적</h1>
        <p style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 3 }}>
          임의 견적을 작성·보관하고, 고객이 확정되면 계약에서 불러와 연결합니다
        </p>
      </div>

      <NeuFilterTabs
        tabs={[
          { key: 'long', label: '장기 견적' },
          { key: 'short', label: '단기 견적' },
        ]}
        activeKey={tab}
        onSelect={(k) => setTab(k as 'long' | 'short')}
      />

      {tab === 'long' && <QuotesTab />}

      {tab === 'short' && (
        <div style={{
          background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12,
          boxShadow: '0 1px 2px rgba(16,24,40,0.05)', padding: '48px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🗒️</div>
          <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 6 }}>단기 견적은 준비 중입니다</div>
          <div style={{ fontSize: 12.5, color: COLORS.textMuted, lineHeight: 1.7 }}>
            단기·대차는 현재 구글시트 배차 운영과 병행 중이라 견적 양식을 확정하지 않았습니다.<br />
            일할 대차료 기준(요금 기준표)이 정리되면 이 탭에서 작성·보관할 수 있게 됩니다.
          </div>
        </div>
      )}
    </div>
  )
}
