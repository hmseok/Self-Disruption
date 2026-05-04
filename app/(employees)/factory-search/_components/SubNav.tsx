'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ───────────────────────────────────────────────────────────────
// SubNav — factory-search 4개 페이지 공통 탭 라인
// 지도 / 목록 / 사고 추천 / 분류 셋팅
// 활성 탭은 파란 underline 강조
// ───────────────────────────────────────────────────────────────

const TABS = [
  { href: '/factory-search',         label: '지도',       emoji: '🗺️' },
  { href: '/factory-search/mgmt',    label: '목록',       emoji: '🔧' },
  { href: '/factory-search/intake',  label: '사고 추천',  emoji: '🚨' },
  { href: '/factory-search/groups',  label: '분류 셋팅',  emoji: '🧩' },
]

export default function SubNav() {
  const pathname = usePathname()
  return (
    <div className="px-6 pb-1">
      <div className="flex gap-0 border-b border-slate-200 -mb-px">
        {TABS.map(tab => {
          const isActive = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold transition-colors border-b-2 -mb-px
                ${isActive
                  ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}
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
