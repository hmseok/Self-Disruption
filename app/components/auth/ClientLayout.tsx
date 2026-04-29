'use client'
import { auth } from '@/lib/auth-client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useApp } from '../../context/AppContext'
import { usePermission } from '../../hooks/usePermission'
import { UploadProvider, useUpload } from '@/app/context/UploadContext'
import PageTitle from '../PageTitle'
import QuickTxModal from '../QuickTxModal'
import { getAuthHeader } from '@/app/utils/auth-client'

// ============================================
// 아이콘
// ============================================
const Icons: any = {
  Menu: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  Home: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  Car: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10H8s-1.5-.1-3.5 1.5S2 15 2 15v1c0 .6.4 1 1 1h1" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 17a2 2 0 104 0 2 2 0 00-4 0zM14 17a2 2 0 104 0 2 2 0 00-4 0z" /></svg>,
  Truck: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>,
  Doc: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Setting: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Admin: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>,
  Users: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  Shield: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  Database: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>,
  Money: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Clipboard: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  Building: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  Chart: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  Wrench: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  WrenchScrewdriver: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" /></svg>,
  ExclamationTriangle: () => <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>,
}

// ============================================
// 메뉴 설정
// ============================================

// ═══════════════════════════════════════════════════════════════════
// ⚠️ 사이드바 메뉴 추가 가이드 — 4곳 동기화 필수
// ═══════════════════════════════════════════════════════════════════
// 새 메뉴를 추가하려면 다음 4곳을 모두 갱신해야 사이드바에 표시됩니다.
// 한 곳이라도 누락되면 사이드바에서 사라집니다.
//
//   1. /api/system_modules/route.ts → DEFAULT_MODULES 에 entry 추가
//   2. ClientLayout HIDDEN_PATHS 에서 제거 확인 (없어야 함)
//   3. ClientLayout PATH_TO_GROUP 에 path → group 매핑 추가
//   4. (선택) ClientLayout NAME_OVERRIDES 에 표시 이름 (없으면 system_modules.name 사용)
//
// 정합성 검증: ClientLayout 마운트 시 console.warn 로 누락 자동 감지 (아래)
// ═══════════════════════════════════════════════════════════════════

// 동적 메뉴 → 그룹 매핑 (v3 — HIDDEN_PATHS에 해당하는 dead 항목 제거)
const PATH_TO_GROUP: Record<string, string> = {
  // ── 차량관리 ──
  '/cars': 'vehicle', '/registration': 'vehicle',
  '/operations': 'vehicle', '/operations/intake': 'vehicle', '/maintenance': 'vehicle',
  // ── 영업/계약 ──
  '/quotes': 'sales', '/quotes/operational-learning': 'sales',
  '/contracts': 'sales', '/finance/settlement': 'sales',
  // ── 재무 ──
  '/finance/bank-card': 'finance', '/loans': 'finance',
  '/finance/cost-analysis': 'finance',
  '/finance/classify': 'finance',
  '/finance/investor': 'finance',
  '/finance/sms': 'finance',
  '/insurance': 'finance',
  '/finance/fleet': 'vehicle',
  // ── 관리 ──
  '/admin/payroll': 'admin',
}

// 메뉴명 오버라이드 (v3 — dead 항목 제거, 활성 경로만)
const NAME_OVERRIDES: Record<string, string> = {
  // 차량관리 그룹
  '/cars': '차량 관리',
  '/registration': '차량 등록증',
  '/operations': '차량운영',
  '/operations/intake': '접수/오더',
  '/maintenance': '정비/유지보수',
  // 영업/계약 그룹
  '/quotes': '견적 관리',
  '/quotes/operational-learning': '운영학습',
  '/contracts': '계약/고객',
  '/finance/settlement': '정산/수금',
  // 재무 그룹
  '/finance/bank-card': '통장/카드 관리',
  '/finance/cost-analysis': '원가 분석',
  '/finance/classify': '거래 분류',
  '/finance/investor': '투자자 정산',
  '/finance/sms': 'SMS 수집',
  '/loans': '대출 관리',
  '/insurance': '🛡 보험 관리',
  // 차량관리 그룹
  '/finance/fleet': '차량 수익',
  // 관리 그룹
  '/admin/payroll': '급여 관리',
}

// 숨길 메뉴 경로 (v3 — 삭제된 모듈 + 미사용 메뉴 제거)
const HIDDEN_PATHS = new Set([
  // ── 삭제된 모듈 (코드 제거됨) ──
  '/jiip',                   // 삭제됨
  '/invest',                 // 삭제됨
  '/accidents',              // 삭제됨
  '/rental',                 // 삭제됨
  // '/insurance',           // 2026-04-29 부활 — 보험 청약서 기반 다중 차량 분배 시스템
  '/claims/accident-mgmt',   // 삭제됨
  '/claims/billing-mgmt',    // 삭제됨
  '/claims/intake', '/claims/investigation',
  '/claims/assessment', '/claims/billing', '/claims/rental',
  '/fleet/factory-mgmt',     // 삭제됨
  '/fleet/vehicle-lookup',   // 삭제됨
  '/db/depreciation', '/db/maintenance', '/db/models', // 삭제됨
  // ── 중복/통합 완료 ──
  '/e-contract',             // → 계약 관리에 흡수
  '/quotes/pricing',         // → /quotes/create 통합
  '/quotes/short-term',      // → /quotes/create 통합
  '/customers',              // → 계약 관리 탭으로 통합
  '/finance/collections',    // → 정산 관리 탭으로 통합
  '/db/pricing-standards',   // → 견적 허브 요율 관리 탭으로 통합
  '/finance',                // → /finance/bank-card 통합
  '/finance/transactions',   // → /finance/bank-card 통합 (입출금+분류+매칭)
  '/finance/upload',         // → /finance/bank-card 엑셀 업로드로 통합
  '/finance/uploads',        // → /finance/bank-card 엑셀 업로드로 통합
  '/finance/codef',          // → /finance/bank-card 자동수집으로 통합
  '/finance/cards',          // → /finance/bank-card 카드 거래 탭으로 통합
  // '/finance/sms',         // 2026-04-29 활성화 — system_modules에 등록되어 있고 페이지 실재
  '/finance/openbanking',    // → /finance/bank-card 통장 탭으로 통합
  '/db/lotte',               // → 미사용 (경쟁사 벤치마크)
  '/admin/code-master',      // → 미사용 (기초코드)
  '/db/codes',               // → 미사용
  // ── 통합/축소 ──
  '/finance/tax',              // → 세금: 추후 별도 구성 예정
  '/report',                   // → 보고서: 추후 별도 구성 예정
  // ── 미사용/불필요 ──
  '/finance/review', '/finance/freelancers', '/admin/freelancers',
  // ★ FMI 단일회사 — 플랫폼 관리 메뉴 숨김
  '/system-admin',           // 모듈 구독관리
  '/admin/developer',        // 개발자 도구
  '/admin/contracts',        // 회사/가입 관리 (플랫폼)
])

// 비즈니스 그룹 (v4 — 4그룹)
const BUSINESS_GROUPS = [
  { id: 'vehicle', label: '차량관리' },
  { id: 'sales', label: '영업/계약' },
  { id: 'finance', label: '재무' },
  { id: 'admin', label: '관리' },
]

// 직장인필수 메뉴 (모든 로그인 사용자에게 표시)
const WORK_ESSENTIALS_MENUS = [
  { name: '내 정보', path: '/work-essentials/my-info', iconKey: 'Users' },
  { name: '영수증제출', path: '/work-essentials/receipts', iconKey: 'Clipboard' },
]

// admin 전용 설정 메뉴
const SETTINGS_MENUS_BASE = [
  { name: '조직/권한 관리', path: '/admin/employees', iconKey: 'Users' },
  { name: '계약 약관 관리', path: '/admin/contract-terms', iconKey: 'Doc' },
  { name: '메시지 센터', path: '/admin/message-templates', iconKey: 'Clipboard' },
]
const COMPANY_INFO_MENU = { name: '회사 정보', path: '/db/codes', iconKey: 'Setting' }

// ============================================
// 메뉴 아이템 렌더링 헬퍼
// ============================================
function MenuItem({ item, pathname, accent, allPaths }: { item: { name: string; path: string; iconKey: string }; pathname: string; accent?: boolean; allPaths?: string[] }) {
  const Icon = Icons[item.iconKey] || Icons.Doc
  // "longest match wins" — 더 긴 경로의 메뉴가 있으면 상위 경로는 비활성
  const hasMoreSpecificMatch = allPaths?.some(p => p !== item.path && p.length > item.path.length && pathname.startsWith(p) && p.startsWith(item.path))
  const isActive = pathname === item.path ||
    (!hasMoreSpecificMatch && pathname.startsWith(item.path + '/'))

  return (
    <Link
      href={item.path}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[13px] font-medium ${
        isActive
          ? 'text-white border border-transparent'
          : 'text-slate-600 hover:text-slate-800 border border-transparent'
      }`}
      style={isActive ? {
        background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)',
        boxShadow: '3px 3px 8px rgba(140,170,210,0.19), -1px -1px 4px rgba(255,255,255,0.47)',
      } : {}}
      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.03)' }}
      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <Icon />
      <span>{item.name}</span>
    </Link>
  )
}

// ============================================
// ClientLayout
// ============================================
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <UploadProvider>
      <ClientLayoutInner>{children}</ClientLayoutInner>
    </UploadProvider>
  )
}

function ClientLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, role, position, permissions, loading, menuRefreshKey } = useApp()
  const { hasPageAccess } = usePermission()

  const [dynamicMenus, setDynamicMenus] = useState<any[]>([])
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  // Phase I (#85) — 전역 "빠른 입력" 모달 상태
  const [quickOpen, setQuickOpen] = useState(false)

  // 데스크톱에서는 사이드바 기본 열림
  useEffect(() => {
    const isDesktop = window.innerWidth >= 1024
    setIsSidebarOpen(isDesktop)
  }, [])

  // ★ 앱 셸 활성화 시 body에 클래스 추가 (로그인 페이지 제외)
  const isGuestPage = pathname.startsWith('/sign')
  const isAuthPage = pathname === '/' || pathname.startsWith('/auth') || pathname.startsWith('/public') || pathname.startsWith('/invite') || isGuestPage
  useEffect(() => {
    if (!isAuthPage) {
      document.body.classList.add('app-shell')
    }
    return () => {
      document.body.classList.remove('app-shell')
    }
  }, [isAuthPage])

  // 모바일에서 메뉴 클릭 시 사이드바 닫기
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false)
    }
  }, [pathname])

  // Phase I (#85) — Alt+N 단축키로 빠른 입력 모달 오픈
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        const target = e.target as HTMLElement
        const tag = target?.tagName?.toLowerCase()
        // 인풋/에디터 포커스 중에는 무시
        if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return
        e.preventDefault()
        setQuickOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ★ 메뉴 로드 (단일회사 — system_modules 직접 + 직원별 권한 필터)
  useEffect(() => {
    const fetchMenus = async () => {
      try {
        const headers = await getAuthHeader()
        const res = await fetch('/api/system_modules', { headers })

        if (res.ok) {
          const json = await res.json()
          const data = Array.isArray(json) ? json : (json.data || [])

          // ── 정합성 자가 검증: 4곳 동기화 누락 자동 감지 ──
          if (typeof window !== 'undefined' && (process.env.NODE_ENV !== 'production' || (window as any).__DEBUG_SIDEBAR__)) {
            const conflicts = data.filter((m: any) => HIDDEN_PATHS.has(m.path))
            const missingGroup = data.filter((m: any) => !HIDDEN_PATHS.has(m.path) && !PATH_TO_GROUP[m.path])
            if (conflicts.length > 0) {
              console.warn('[Sidebar 정합성] system_modules ↔ HIDDEN_PATHS 충돌:',
                conflicts.map((c: any) => c.path))
            }
            if (missingGroup.length > 0) {
              console.warn('[Sidebar 정합성] PATH_TO_GROUP 매핑 누락 → 사이드바 미표시:',
                missingGroup.map((m: any) => m.path))
            }
          }

          const seen = new Set<string>()
          const allMenus = data
            .filter((item: any) => {
              if (seen.has(item.path)) return false
              if (HIDDEN_PATHS.has(item.path)) return false
              seen.add(item.path)
              return true
            })
            .map((item: any) => ({
              id: item.id,
              name: NAME_OVERRIDES[item.path] || item.name,
              path: item.path,
              iconKey: item.icon_key,
            }))

          // admin → 전체 메뉴, user → 권한 있는 메뉴만
          setDynamicMenus(
            role === 'admin'
              ? allMenus
              : allMenus.filter((m: any) => hasPageAccess(m.path))
          )
        }
      } catch (error) {
        console.error('Failed to load menus:', error)
      }
    }
    if (!loading) {
      fetchMenus()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, role, menuRefreshKey])

  // 로그아웃 상태 → 로그인 페이지로 즉시 이동 (useEffect로 감싸서 렌더링 중 setState 방지)
  useEffect(() => {
    if (!loading && !user && pathname !== '/' && !pathname.startsWith('/auth') && !pathname.startsWith('/public') && !pathname.startsWith('/invite') && !pathname.startsWith('/sign')) {
      router.replace('/')
    }
  }, [loading, user, pathname, router])

  // 로그인/인증 페이지 제외
  if (isAuthPage) return <>{children}</>

  // 로딩 중 → 깔끔한 스플래시 (빈 레이아웃 깨짐 방지)
  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100dvh', background: '#f2f1ef' }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-slate-500 font-medium">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 로그아웃 상태 → 빈 화면 (useEffect에서 리디렉트 처리)
  if (!user) {
    return null
  }

  // 비즈니스 그룹별 메뉴 빌드
  const businessGroups = BUSINESS_GROUPS
    .map(group => ({
      ...group,
      items: dynamicMenus
        .filter(m => PATH_TO_GROUP[m.path] === group.id)
        .map(m => ({ name: m.name, path: m.path, iconKey: m.iconKey })),
    }))
    .filter(g => g.items.length > 0)

  // 모든 메뉴 경로 (longest match 계산용)
  const allMenuPaths = dynamicMenus.map(m => m.path)

  const showSettings = role === 'admin'

  return (
    <div className="print:!h-auto print:!overflow-visible print:!block" style={{ display: 'flex', height: '100dvh', background: '#f2f1ef', overflowX: 'hidden', overflowY: 'hidden' }}>
      {/* 모바일 상단 고정 바 — 햄버거 + 업체선택 */}
      {!isSidebarOpen && (
        <div className="fixed top-0 left-0 right-0 z-30 lg:hidden safe-top" style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 12px rgba(140,170,210,0.15)' }}>
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
            {/* 햄버거 */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="text-slate-600 p-1.5 rounded-lg hover:bg-black/5 transition-colors flex-shrink-0"
            >
              <Icons.Menu />
            </button>

            {/* 로고 */}
            <span className="text-sm font-bold tracking-tight flex-shrink-0" style={{ color: '#3b6eb5' }}>FMI ERP</span>

            {/* FMI 단일회사 표시 */}
            <span className="ml-auto text-xs font-medium truncate" style={{ color: '#64748b' }}>주식회사 에프엠아이</span>
          </div>
        </div>
      )}

      {/* 모바일 오버레이 (사이드바 열릴 때) */}
      <div
        className={`sidebar-overlay lg:hidden ${isSidebarOpen ? 'active' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* 사이드바 */}
      <aside className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-60 transition-transform duration-300 overflow-hidden flex flex-col fixed h-full z-20 lg:translate-x-0`} style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRight: '1px solid rgba(255,255,255,0.30)', boxShadow: '4px 0 12px rgba(140,170,210,0.12)', color: '#1e293b' }}>
        <div className="w-60 flex flex-col h-full">

          {/* 로고 */}
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <span className="tracking-tight cursor-pointer" onClick={() => router.push('/dashboard')} style={{ fontSize: 18, fontWeight: 900, background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              FMI ERP
            </span>
            <button onClick={() => setIsSidebarOpen(false)} className="text-slate-400 hover:text-slate-700 lg:hidden">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* 워크스페이스 */}
          <div className="px-3 py-3">
            <div className="rounded-lg px-3 py-3" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: 'inset 2px 2px 6px rgba(140,170,210,0.08), inset -2px -2px 6px rgba(255,255,255,0.25)' }}>
              {/* 회사명 + 플랜 뱃지 */}
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-sm truncate" style={{ color: '#0f2440' }}>주식회사 에프엠아이</div>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)' }}>FMI</span>
              </div>
              {/* 역할 + 직급 */}
              <div className="mt-2 flex gap-1 flex-wrap">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  role === 'admin' ? 'text-blue-700' :
                  'text-slate-500'
                }`} style={{ background: role === 'admin' ? '#dbeafe' : '#f1f5f9', border: role === 'admin' ? '1px solid rgba(59,130,246,0.15)' : '1px solid rgba(0,0,0,0.06)' }}>
                  {role === 'admin' ? '관리자' : '직원'}
                </span>
                {position && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ color: '#166534', background: '#d1fae5', border: '1px solid rgba(34,197,94,0.15)' }}>
                    {position.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* FMI 단일회사 */}

          {/* 메뉴 영역 */}
          <nav className="flex-1 px-3 pb-4 overflow-y-auto">

            {/* 대시보드 */}
            <div className="mb-2">
              <Link
                href="/dashboard"
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[13px] font-medium ${
                  pathname === '/dashboard'
                    ? 'text-white border border-transparent'
                    : 'text-slate-600 hover:text-slate-800 border border-transparent'
                }`}
                style={pathname === '/dashboard' ? {
                  background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)',
                  boxShadow: '3px 3px 8px rgba(140,170,210,0.19), -1px -1px 4px rgba(255,255,255,0.47)',
                } : {}}
              >
                <Icons.Home />
                대시보드
              </Link>
            </div>

            {/* Phase I (#85) — 빠른 입금/출금 입력 (전역 진입점) */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setQuickOpen(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[13px] font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  boxShadow: '3px 3px 8px rgba(16,185,129,0.22), -1px -1px 4px rgba(255,255,255,0.47)',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
                  ;(e.currentTarget as HTMLButtonElement).style.boxShadow =
                    '4px 4px 12px rgba(16,185,129,0.30), -1px -1px 4px rgba(255,255,255,0.55)'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'none'
                  ;(e.currentTarget as HTMLButtonElement).style.boxShadow =
                    '3px 3px 8px rgba(16,185,129,0.22), -1px -1px 4px rgba(255,255,255,0.47)'
                }}
                aria-label="빠른 입력"
                title="어느 페이지에서든 바로 거래를 기록 (Alt+N)"
              >
                <span style={{ fontSize: 15, lineHeight: 1 }}>⚡</span>
                <span>빠른 입력</span>
              </button>
            </div>

            {/* 비즈니스 메뉴 그룹 */}
            {businessGroups.map(group => (
              <div key={group.id} className="mb-3">
                <div className="px-3 mb-1">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{group.label}</span>
                </div>
                <div className="space-y-0.5">
                  {group.items.map(item => (
                    <MenuItem key={item.path} item={item} pathname={pathname} allPaths={allMenuPaths} />
                  ))}
                </div>
              </div>
            ))}

            {/* 직장인필수 */}
            <div className="mb-3">
              <div className="px-3 mb-1">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Employee of Ride Inc.</span>
              </div>
              <div className="space-y-0.5">
                {WORK_ESSENTIALS_MENUS.map(item => (
                  <MenuItem key={item.path} item={item} pathname={pathname} allPaths={allMenuPaths} />
                ))}
              </div>
            </div>

            {/* 구분선 + 관리 영역 */}
            {showSettings && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="mb-3">
                  <div className="px-3 mb-1">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">설정</span>
                  </div>
                  <div className="space-y-0.5">
                    <MenuItem item={COMPANY_INFO_MENU} pathname={pathname} allPaths={allMenuPaths} />
                    {SETTINGS_MENUS_BASE.map(item => (
                      <MenuItem key={item.path} item={item} pathname={pathname} allPaths={allMenuPaths} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </nav>

          {/* 유저 정보 */}
          <div className="p-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white" style={{ background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', boxShadow: '2px 2px 6px rgba(140,170,210,0.19)' }}>
                {user?.email?.[0]?.toUpperCase()}
              </div>
              <div className="overflow-hidden flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: '#475569' }}>{user?.email}</p>
                <button
                  onClick={() => auth.signOut().then(() => router.push('/'))}
                  className="text-[10px] text-slate-500 hover:text-red-500 transition-colors"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>

        </div>
      </aside>

      {/* 메인 콘텐츠 — 앱 셸: 내부 스크롤 */}
      <main
        className="flex-1 transition-all duration-300 print:!ml-0 print:!h-auto print:!overflow-visible print:!block"
        style={{
          height: '100dvh',
          overflow: 'hidden',
          width: isSidebarOpen ? 'calc(100% - 240px)' : '100%',
          minWidth: 0,
          marginLeft: isSidebarOpen ? 240 : 0,
        }}
      >
        <div
          className="print:!pt-0 print:!h-auto print:!overflow-visible print:!block"
          style={{
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            overscrollBehavior: 'none',
            maxWidth: '100%',
            paddingTop: isSidebarOpen ? 0 : 48,
            paddingBottom: 24,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* ═══ 프리뷰 스타일 글래스 프레임 ═══ */}
          <div style={{
            margin: '16px 20px 0',
            background: '#f2f1ef',
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: '12px 12px 30px rgba(140,170,210,0.25), -8px -8px 20px rgba(255,255,255,0.5)',
            border: '1px solid rgba(0,0,0,0.06)',
            minHeight: 'calc(100dvh - 100px)',
          }}>
            {/* 프레임 헤더 — 브레드크럼 */}
            <PageTitle />
            {/* 프레임 콘텐츠 */}
            <div style={{ padding: '0 4px 24px' }}>
              {children}
            </div>
          </div>
        </div>
      </main>

      {/* 플로팅 업로드 진행률 위젯 */}
      <UploadProgressWidget />

      {/* Phase I (#85) — 전역 빠른 입력 모달 (Alt+N / 사이드바 버튼) */}
      <QuickTxModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onSaved={() => setQuickOpen(false)}
        initialStatus="completed"
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 플로팅 업로드 진행률 위젯 (페이지 이동 시에도 유지)
// ═══════════════════════════════════════════════════════════════
function UploadProgressWidget() {
  const pathname = usePathname()
  const [dismissed, setDismissed] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [pos, setPos] = useState({ x: 210, y: -1 }) // y=-1 → bottom 기반 초기 위치
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const widgetRef = useRef<HTMLDivElement>(null)

  let uploadContext: ReturnType<typeof useUpload> | null = null
  try { uploadContext = useUpload() } catch { return null }
  if (!uploadContext) return null

  const { status, progress, currentFileIndex, totalFiles, currentFileName, logs } = uploadContext

  if (pathname === '/finance/upload') return null

  const hasResults = uploadContext.results && uploadContext.results.length > 0
  const totalResultCount = hasResults ? uploadContext.results.length : 0
  const isProcessing = status === 'processing' || status === 'paused'

  if (!isProcessing && !hasResults) return null
  if (pathname === '/finance/review' || pathname === '/finance/upload') return null
  if (dismissed && !isProcessing) return null

  // 드래그 핸들러
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    const rect = widgetRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy })
    }
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // 초기 위치 설정 (bottom: 24 → top 좌표로 변환)
  const posStyle = pos.y === -1
    ? { position: 'fixed' as const, bottom: 24, left: pos.x, zIndex: 9999 }
    : { position: 'fixed' as const, top: pos.y, left: pos.x, zIndex: 9999 }

  // 최소화 상태
  if (minimized) {
    return (
      <div ref={widgetRef} style={{ ...posStyle, cursor: 'default' }}>
        <div
          onMouseDown={onDragStart}
          onClick={() => setMinimized(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: isProcessing ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : 'linear-gradient(135deg, #d97706, #f59e0b)',
            padding: '8px 14px', borderRadius: 24, cursor: 'grab',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)', color: '#fff', userSelect: 'none',
          }}
        >
          {isProcessing ? (
            <>
              <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>{progress}%</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 13 }}>📋</span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{totalResultCount}건 대기</span>
            </>
          )}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div ref={widgetRef} style={{
      ...posStyle, width: 300, borderRadius: 14, overflow: 'hidden',
      background: 'rgba(22,32,54,0.97)', backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
    }}>
      {/* 헤더 (드래그 핸들) */}
      <div
        onMouseDown={onDragStart}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px',
          background: isProcessing ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : 'linear-gradient(135deg, #d97706, #f59e0b)',
          cursor: 'grab', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isProcessing ? (
            <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          ) : (
            <span style={{ fontSize: 14 }}>📋</span>
          )}
          <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>
            {isProcessing ? (status === 'processing' ? '파일 분석 중' : '일시정지') : '분류 확정 대기'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {isProcessing && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 10, marginRight: 4 }}>
              {totalFiles > 0 ? `${currentFileIndex + 1}/${totalFiles}` : `${progress}%`}
            </span>
          )}
          {!isProcessing && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.25)', padding: '2px 8px', borderRadius: 10, marginRight: 4 }}>
              {totalResultCount}건
            </span>
          )}
          <button onClick={(e) => { e.stopPropagation(); setMinimized(true) }}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '2px 6px', color: '#fff', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center' }}
            title="최소화">
            ─
          </button>
          {!isProcessing && (
            <button onClick={(e) => { e.stopPropagation(); setDismissed(true) }}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '2px 6px', color: '#fff', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center' }}
              title="닫기">
              ×
            </button>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div style={{ padding: '12px 14px' }}>
        {isProcessing && (
          <>
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 6, height: 5, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg, #1e40af, #60a5fa)', borderRadius: 6, transition: 'width 0.5s', width: `${progress}%` }} />
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {logs || currentFileName || '처리 중...'}
            </p>
          </>
        )}
        {!isProcessing && hasResults && (
          <a href="/finance/upload" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                분류 완료된 <strong style={{ color: '#fbbf24' }}>{totalResultCount}건</strong>이 확정을 기다리고 있습니다
              </p>
            </div>
            <div style={{ flexShrink: 0, background: '#f59e0b', color: '#fff', fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 8 }}>
              확인 →
            </div>
          </a>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
