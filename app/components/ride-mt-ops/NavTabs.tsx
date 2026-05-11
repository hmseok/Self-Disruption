'use client'

/**
 * MTOpsNavTabs — MT팀 sub-route SubNav
 *
 * 사이드바: 「🔧 MT팀」 1개 메뉴 → /RideMTOps/maintenance-tours 진입
 * 각 sub-page 헤더 위에 본 컴포넌트 노출
 *
 * PR-6.14.a
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

const TABS = [
  { href: '/RideMTOps/maintenance-tours',  label: '순회정비', emoji: '🔧' },
  { href: '/RideMTOps/legal-inspections',  label: '법정검사', emoji: '📋' },
  { href: '/RideMTOps/chargers',           label: '충전기',   emoji: '⚡' },
] as const

export default function MTOpsNavTabs() {
  const pathname = usePathname()

  return (
    <div
      style={{
        ...GLASS.L5,
        padding: '0 24px',
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: COLORS.textMuted,
            marginRight: 16,
            padding: '12px 0',
          }}
        >
          🔧 MT팀
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
                background: isActive ? COLORS.bgBlue : 'transparent',
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
