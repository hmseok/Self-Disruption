'use client'
// ───────────────────────────────────────────────────────────────
// SubNav — CallScheduler 모듈 공통 탭 line (factory-search 와 같은 패턴)
//   매니저 영역만 표출. 직원 본인 페이지 (/me, /e/[token]) 는 별개 layout.
// ───────────────────────────────────────────────────────────────
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { COLORS } from '@/app/utils/ui-tokens'

const TABS: Array<{ href: string; label: string; emoji: string; matchTab?: string }> = [
  { href: '/CallScheduler',                          label: '대시보드',  emoji: '📊' },
  { href: '/CallScheduler/requests',                 label: '직원 요청', emoji: '📋' },
  { href: '/CallScheduler/settings?tab=shifts',      label: '시프트',    emoji: '🕐', matchTab: 'shifts' },
  { href: '/CallScheduler/settings?tab=groups',      label: '그룹',      emoji: '🚧', matchTab: 'groups' },
  { href: '/CallScheduler/settings?tab=workers',     label: '워커',      emoji: '👥', matchTab: 'workers' },
  { href: '/CallScheduler/settings?tab=holidays',    label: '공휴일',    emoji: '🎌', matchTab: 'holidays' },
  { href: '/CallScheduler/settings?tab=leaves',      label: '휴가',      emoji: '💼', matchTab: 'leaves' },
]

export default function SubNav() {
  const pathname = usePathname()
  const sp = useSearchParams()
  const currentTab = sp?.get('tab')

  // 활성 탭 결정: settings 페이지는 ?tab= 매칭, 그 외 pathname 매칭
  const isActive = (tab: typeof TABS[number]): boolean => {
    if (tab.matchTab) {
      return pathname === '/CallScheduler/settings' && currentTab === tab.matchTab
    }
    if (tab.href === '/CallScheduler') {
      return pathname === '/CallScheduler' || (pathname?.startsWith('/CallScheduler/') && !pathname.startsWith('/CallScheduler/settings') && !pathname.startsWith('/CallScheduler/requests'))
    }
    return pathname === tab.href
  }

  return (
    <div style={{ padding: '0 24px', borderBottom: `1px solid ${COLORS.borderFaint}`, background: 'rgba(255,255,255,0.6)' }}>
      <div style={{ display: 'flex', gap: 0, marginBottom: -1, flexWrap: 'wrap' }}>
        {TABS.map(tab => {
          const active = isActive(tab)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 16px',
                fontSize: 13, fontWeight: 700,
                textDecoration: 'none',
                borderBottom: `2px solid ${active ? COLORS.primary : 'transparent'}`,
                color: active ? COLORS.primary : COLORS.textSecondary,
                background: active ? COLORS.bgBlue : 'transparent',
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
