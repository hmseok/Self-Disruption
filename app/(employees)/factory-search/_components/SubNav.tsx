'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { COLORS } from '@/app/utils/ui-tokens'

// ───────────────────────────────────────────────────────────────
// SubNav — factory-search 5개 페이지 공통 탭 라인 (메인 ui-tokens)
//   공장 추천(메인) / 지도 / 공장 목록 / 그룹 구성 / 매핑
//   활성 탭은 primary underline + 연한 배경 강조
// ───────────────────────────────────────────────────────────────

const TABS = [
  { href: '/factory-search',          label: '공장 추천', emoji: '🚨' },  // 메인
  { href: '/factory-search/map',      label: '지도',      emoji: '🗺️' },
  { href: '/factory-search/mgmt',     label: '공장 목록', emoji: '🔧' },
  { href: '/factory-search/groups',   label: '그룹 구성', emoji: '🏷' },
  { href: '/factory-search/mapping',  label: '매핑',      emoji: '🔗' },
  { href: '/factory-search/cafe24-import', label: '카페24 가져오기', emoji: '📥' },  // PR-6.12.b
]

export default function SubNav() {
  const pathname = usePathname()
  return (
    <div style={{ padding: '0 24px', borderBottom: `1px solid ${COLORS.borderSubtle}` }}>
      <div style={{ display: 'flex', gap: 0, marginBottom: -1 }}>
        {TABS.map(tab => {
          const isActive = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 16px',
                fontSize: 13, fontWeight: 700,
                textDecoration: 'none',
                borderBottom: `2px solid ${isActive ? COLORS.primary : 'transparent'}`,
                color: isActive ? COLORS.primary : COLORS.textSecondary,
                background: isActive ? COLORS.bgBlue : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
