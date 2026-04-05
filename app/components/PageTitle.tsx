'use client'
import { usePathname } from 'next/navigation'

// ═══════════════════════════════════════════════════════════════
// P3-C 페이지 타이틀 컴포넌트
// 도트 마커 + 1행 브레드크럼 + 솔리드 라인
// ═══════════════════════════════════════════════════════════════

// 경로 → 비즈니스 그룹 매핑 (v2 — ClientLayout 3그룹과 동기화)
const PATH_TO_GROUP: Record<string, string> = {
  // ── 차량관리 (차량 + 운영 + 사고 통합) ──
  '/cars': 'vehicle', '/insurance': 'vehicle', '/registration': 'vehicle',
  '/fleet/vehicle-lookup': 'vehicle',
  '/operations': 'vehicle', '/operations/intake': 'vehicle', '/maintenance': 'vehicle',
  '/fleet/factory-mgmt': 'vehicle',
  '/claims/accident-mgmt': 'vehicle', '/claims/billing-mgmt': 'vehicle',
  // ── 영업/계약 (견적→계약→수금→정산 파이프라인) ──
  '/quotes': 'sales', '/quotes/create': 'sales',
  '/contracts': 'sales', '/customers': 'sales',
  '/finance/collections': 'sales', '/finance/settlement': 'sales',
  '/db/pricing-standards': 'sales',
  // ── 재무/경영 ──
  '/finance': 'finance', '/finance/fleet': 'finance', '/finance/tax': 'finance',
  '/finance/upload': 'finance', '/finance/cards': 'finance', '/finance/codef': 'finance',
  '/admin/payroll': 'finance', '/report': 'finance', '/loans': 'finance',
  '/db/lotte': 'finance',
  // ── 기타 ──
  '/work-essentials/my-info': 'work',
  '/work-essentials/receipts': 'work',
}

// 그룹 ID → 섹션 라벨
const GROUP_LABELS: Record<string, string> = {
  vehicle: '차량관리',
  sales: '영업/계약',
  finance: '재무/경영',
  work: '직장인필수',
  settings: '설정',
}

// 경로 → 페이지 이름 (사이드바 NAME_OVERRIDES와 동기화)
const PAGE_NAMES: Record<string, string> = {
  '/dashboard': '대시보드',
  // 차량관리
  '/cars': '차량 관리',
  '/registration': '차량 등록증',
  '/insurance': '보험/가입',
  '/fleet/vehicle-lookup': '거래처 차량조회',
  '/operations': '차량운영',
  '/operations/intake': '접수/오더',
  '/maintenance': '정비/유지보수',
  '/fleet/factory-mgmt': '공장/협력업체',
  '/claims/accident-mgmt': '사고관리',
  '/claims/billing-mgmt': '보험청구관리',
  // 영업/계약
  '/quotes': '견적 관리',
  '/quotes/create': '견적 작성',
  '/contracts': '계약 관리',
  '/customers': '고객 관리',
  '/finance/collections': '수금/회수',
  '/finance/settlement': '정산 관리',
  '/db/pricing-standards': '요금 기준표',
  // 재무/경영
  '/finance': '재무 대시보드',
  '/finance/fleet': '차량 수익',
  '/finance/tax': '세금 관리',
  '/finance/upload': '카드/통장 관리',
  '/finance/cards': '카드 관리',
  '/finance/codef': '은행/카드 자동연동',
  '/admin/payroll': '급여 관리',
  '/report': '보고서',
  '/loans': '대출 관리',
  '/db/lotte': '경쟁사 벤치마크',
  // 직장인필수
  '/work-essentials/my-info': '내 정보',
  '/work-essentials/receipts': '영수증제출',
  // 설정
  '/admin/employees': '조직/권한 관리',
  '/admin/contract-terms': '계약 약관 관리',
  '/admin/message-templates': '메시지 센터',
}

// 설정 그룹 매핑
const ADMIN_GROUP: Record<string, string> = {
  '/admin/employees': 'settings',
  '/admin/contract-terms': 'settings',
  '/admin/message-templates': 'settings',
}

/**
 * 동적 메뉴 이름으로 오버라이드 가능 (ClientLayout에서 전달)
 */
interface PageTitleProps {
  dynamicMenuName?: string
}

export default function PageTitle({ dynamicMenuName }: PageTitleProps) {
  const pathname = usePathname()

  // 매칭: 정확 매칭 → 가장 긴 prefix 매칭
  const findBestMatch = (map: Record<string, string>): string | null => {
    if (map[pathname]) return map[pathname]
    // 동적 경로 (예: /cars/abc123) → 부모 경로에서 찾기
    const segments = pathname.split('/')
    for (let i = segments.length - 1; i >= 2; i--) {
      const parent = segments.slice(0, i).join('/')
      if (map[parent]) return map[parent]
    }
    return null
  }

  const pageName = dynamicMenuName || findBestMatch(PAGE_NAMES)
  const groupId = findBestMatch(PATH_TO_GROUP) || findBestMatch(ADMIN_GROUP)
  const sectionLabel = groupId ? GROUP_LABELS[groupId] : null

  // 대시보드이거나 매칭 안 되면 표시 안 함
  if (!pageName || pathname === '/dashboard') return null

  return (
    <div style={{ marginBottom: 16 }}>
      {/* P3-C: 도트 마커 + 1행 브레드크럼 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 20px',
      }}>
        {/* 블루 도트 */}
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#2d5fa8',
          flexShrink: 0,
          boxShadow: '0 0 0 3px rgba(45,95,168,0.15)',
        }} />
        {/* 섹션 라벨 (브레드크럼) */}
        {sectionLabel && (
          <>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{sectionLabel}</span>
            <span style={{ color: '#cbd5e1', fontSize: 11 }}>&rsaquo;</span>
          </>
        )}
        {/* 페이지 이름 */}
        <span style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{pageName}</span>
      </div>
      {/* 1.5px 솔리드 라인 */}
      <div style={{ height: 1.5, background: '#2d5fa8' }} />
    </div>
  )
}
