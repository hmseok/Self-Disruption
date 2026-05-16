'use client'
// ───────────────────────────────────────────────────────────────
// SubNav — CallScheduler 모듈 공통 탭 (N-24-a: 블루 pill — 사용자 선택)
//   활성: 블루 배경 #2563eb + 흰 글씨
//   비활성: 투명 + 회색 #64748b + 호버 시 보더
// ───────────────────────────────────────────────────────────────
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { COLORS } from '@/app/utils/ui-tokens'

// N-14 — 운영 vs 설정 분류 (사용자 의도)
//   운영 (자주 보는 영역, 상위): 대시보드 / 직원 요청
//   설정 (모든 셋팅, ⚙ 안): 시간 / 그룹 / 워커 / 공휴일 / 휴가
const TABS: Array<{ href: string; label: string; matchSettings?: boolean }> = [
  { href: '/CallScheduler',                          label: '📊 대시보드' },
  { href: '/CallScheduler/requests',                 label: '📋 직원 요청' },
  { href: '/CallScheduler/settings?tab=shifts',      label: '⚙ 설정',       matchSettings: true },
]

export default function SubNav() {
  const pathname = usePathname()

  const isActive = (tab: typeof TABS[number]): boolean => {
    if (tab.matchSettings) {
      // ⚙ 설정 — settings 페이지의 어떤 탭이든 활성
      return pathname === '/CallScheduler/settings'
    }
    if (tab.href === '/CallScheduler') {
      return pathname === '/CallScheduler' || (pathname?.startsWith('/CallScheduler/') && !pathname.startsWith('/CallScheduler/settings') && !pathname.startsWith('/CallScheduler/requests'))
    }
    return pathname === tab.href
  }

  return (
    <div style={{ display: 'flex', gap: 8, padding: '12px 24px 0', flexWrap: 'wrap' }}>
      {TABS.map(tab => {
        const active = isActive(tab)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              padding: '8px 16px', borderRadius: 99,
              fontSize: 13, fontWeight: 700,
              textDecoration: 'none',
              background: active ? COLORS.primary : 'transparent',
              color: active ? '#fff' : COLORS.textSecondary,
              border: active ? `1px solid ${COLORS.primary}` : `1px solid ${COLORS.borderFaint}`,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              boxShadow: active ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
