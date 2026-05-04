'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ───────────────────────────────────────────────────────────────
// FMI ERP 사이드바 — 실제 운영 시스템 구조와 1:1 일치 (2026-04-30 기준)
// 협력공장 지도/목록은 "Employee of Ride Inc." 그룹 하위에 배치.
// 본 ERP 이식 시: 사이드바 NAV 정의에서 동일 그룹 items 배열에 두 항목만 추가.
// ───────────────────────────────────────────────────────────────

type Item = { href: string; emoji: string; label: string }
type Group = { label: string; items: Item[] }

const NAV: Group[] = [
  {
    label: '자산',
    items: [
      { href: '/cars', emoji: '🚗', label: '차량' },
      { href: '/loans', emoji: '💰', label: '대출' },
      { href: '/insurance', emoji: '🛡', label: '보험' },
    ],
  },
  {
    label: '운영',
    items: [
      { href: '/maintenance', emoji: '🔧', label: '정비' },
      { href: '/operations', emoji: '📅', label: '차량 일정' },
      { href: '/operations/intake', emoji: '📋', label: '접수/오더' },
    ],
  },
  {
    label: '재무',
    items: [
      { href: '/finance/bank-card', emoji: '💳', label: '통장/카드' },
      { href: '/finance/fleet', emoji: '📊', label: '차량 손익' },
      { href: '/finance/settlement', emoji: '💵', label: '정산/수금' },
      { href: '/finance/investor', emoji: '👥', label: '투자자 정산' },
      { href: '/finance/cost-analysis', emoji: '📈', label: '원가 분석' },
      { href: '/finance/classify', emoji: '🏷', label: '거래 분류' },
      { href: '/finance/sms', emoji: '📨', label: 'SMS 수집' },
      { href: '/quotes', emoji: '📝', label: '견적 관리' },
      { href: '/quotes/operational-learning', emoji: '📚', label: '운영학습' },
      { href: '/contracts', emoji: '📑', label: '계약/고객' },
    ],
  },
  {
    label: '관리',
    items: [
      { href: '/admin/payroll', emoji: '💼', label: '급여 관리' },
    ],
  },
  // ── 협력공장 지도/목록 이식 대상 그룹 ────────────────────────
  {
    label: 'Employee of Ride Inc.',
    items: [
      { href: '/work-essentials/my-info', emoji: '👤', label: '내 정보' },
      { href: '/work-essentials/receipts', emoji: '🧾', label: '영수증제출' },
      { href: '/meetings', emoji: '📋', label: '회의록' },
      // ── 신규: Ride OP ──
      { href: '/fleet/factory-map', emoji: '🗺️', label: '협력공장 지도' },
      { href: '/fleet/factory-mgmt', emoji: '🔧', label: '협력공장 목록' },
      { href: '/claims/intake', emoji: '🚨', label: '사고 접수 추천' },
      { href: '/admin/groups', emoji: '🧩', label: '그룹 셋팅' },
    ],
  },
  {
    label: '설정',
    items: [
      { href: '/db/codes', emoji: '🏢', label: '회사 정보' },
      { href: '/admin/employees', emoji: '🧑‍💼', label: '조직/권한 관리' },
      { href: '/admin/contract-terms', emoji: '📜', label: '계약 약관 관리' },
      { href: '/admin/message-templates', emoji: '💬', label: '메시지 센터' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex flex-col bg-white border-r border-slate-200 w-[var(--sidebar-w)] flex-shrink-0 fixed inset-y-0 left-0 z-30">
      {/* 브랜드 */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="text-[18px] font-bold text-blue-600 tracking-tight">FMI ERP</div>
      </div>

      {/* 회사 카드 */}
      <div className="px-3 pt-4">
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-slate-700 truncate">주식회사 에프엠아이</span>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 ring-1 ring-blue-100 rounded-md px-1.5 py-0.5">FMI</span>
          </div>
          <div className="mt-1 inline-flex items-center text-[10px] text-slate-500 bg-white ring-1 ring-slate-200 rounded-md px-1.5 py-0.5">
            관리자
          </div>
        </div>
      </div>

      {/* 빠른 메뉴 + 메뉴 트리 */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        <Link href="/"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all
            ${pathname === '/' ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}`}>
          <span>🏠</span><span>대시보드</span>
        </Link>
        <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm hover:from-emerald-600 hover:to-emerald-700">
          <span>⚡</span><span>빠른 입력</span>
        </button>

        {NAV.map(group => (
          <div key={group.label}>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
              {group.label}
            </div>
            <ul className="space-y-0.5">
              {group.items.map(it => {
                const active = pathname === it.href || pathname?.startsWith(it.href + '/')
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all
                        ${active
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}`}
                    >
                      <span>{it.emoji}</span>
                      <span className="truncate">{it.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 사용자 */}
      <div className="px-3 py-3 border-t border-slate-100">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50">
          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[11px] font-bold">
            S
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-slate-700 truncate">sukhomin87@gmail.com</div>
            <div className="text-[10px] text-slate-400">로그아웃</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
