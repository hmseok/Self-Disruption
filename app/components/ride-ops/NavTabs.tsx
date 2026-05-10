'use client'

/**
 * RideOps NavTabs — 라이드 운영 통합 sub-route SubNav
 *
 * PR-6.13
 *
 * 사이드바: 「🚗 라이드 운영」 1개 메뉴 (path: /RideVehicleRegistry)
 * 각 sub-page (/RideVehicleRegistry, /RideCustomerData, /RideSettlements) 헤더 위에 본 컴포넌트 노출
 *
 * 사용:
 *   import RideOpsNavTabs from '@/app/components/ride-ops/NavTabs'
 *   ...
 *   return (
 *     <>
 *       <RideOpsNavTabs />
 *       <YourPageContent />
 *     </>
 *   )
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { COLORS } from '@/app/utils/ui-tokens'

const TABS = [
  { href: '/RideVehicleRegistry', label: '차량등록', emoji: '🚗' },
  { href: '/RideCustomerData',    label: '고객사 데이터', emoji: '🏢' },
  { href: '/RideSettlements',     label: '마감자료', emoji: '💰' },
  // PR-6.13.b 예정 — 메일 파싱
  // { href: '/RideMailImport',   label: '메일 파싱', emoji: '📧' },
] as const

export default function RideOpsNavTabs() {
  const pathname = usePathname()

  return (
    <div
      style={{
        padding: '0 24px',
        borderBottom: `1px solid ${COLORS.borderSubtle}`,
        background: 'rgba(255,255,255,0.45)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ display: 'flex', gap: 0, marginBottom: -1, alignItems: 'center' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: COLORS.textMuted,
            marginRight: 16,
            padding: '12px 0',
          }}
        >
          🚗 라이드 운영
        </span>
        {TABS.map(tab => {
          const isActive = pathname === tab.href || pathname?.startsWith(tab.href + '/')
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: isActive ? 700 : 600,
                color: isActive ? COLORS.primary : COLORS.textSecondary,
                background: isActive ? 'rgba(59,110,181,0.06)' : 'transparent',
                borderBottom: isActive ? `2px solid ${COLORS.primary}` : '2px solid transparent',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              {tab.emoji} {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
