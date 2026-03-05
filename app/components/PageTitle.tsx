'use client'
import { usePathname } from 'next/navigation'

// ═══════════════════════════════════════════════════════════════
// P3-C 페이지 타이틀 컴포넌트
// 도트 마커 + 1행 브레드크럼 + 솔리드 라인
// ═══════════════════════════════════════════════════════════════

// 경로 → 비즈니스 그룹 매핑 (ClientLayout과 동기화)
const PATH_TO_GROUP: Record<string, string> = {
  '/cars': 'vehicle', '/insurance': 'vehicle', '/registration': 'vehicle',
  '/operations': 'ops', '/maintenance': 'ops', '/accidents': 'ops',
  '/quotes': 'sales', '/quotes/pricing': 'sales', '/quotes/short-term': 'sales', '/quotes/create': 'sales', '/customers': 'sales',
  '/contracts': 'sales', '/e-contract': 'sales', '/e-contract/create': 'sales',
  '/finance': 'finance', '/finance/collections': 'finance', '/finance/settlement': 'finance',
  '/finance/upload': 'finance', '/finance/review': 'finance', '/finance/freelancers': 'finance',
  '/finance/cards': 'finance', '/admin/payroll': 'finance', '/report': 'finance', '/loans': 'finance',
  '/invest': 'invest', '/jiip': 'invest',
  '/db/pricing-standards': 'data', '/db/lotte': 'data',
  '/work-essentials/my-info': 'work',
  '/work-essentials/receipts': 'work',
}

// 그룹 ID → 섹션 라벨
const GROUP_LABELS: Record<string, string> = {
  vehicle: '차량',
  ops: '차량운영',
  sales: '영업',
  finance: '재무',
  invest: '투자',
  data: '데이터 관리',
  work: '직장인필수',
  platform: '플랫폼',
  settings: '설정',
}

// 경로 → 페이지 이름 (사이드바와 동기화)
const PAGE_NAMES: Record<string, string> = {
  '/dashboard': '대시보드',
  // 차량
  '/cars': '차량 관리',
  '/insurance': '보험/가입',
  '/registration': '등록/이전',
  // 차량운영
  '/operations': '운행일지',
  '/maintenance': '정비 관리',
  '/accidents': '사고 관리',
  // 영업
  '/quotes': '견적 관리',
  '/quotes/pricing': '견적 작성',
  '/quotes/short-term': '단기 견적',
  '/customers': '고객 관리',
  '/contracts': '계약 관리',
  '/e-contract': '전자계약서',
  '/e-contract/create': '새 계약서 작성',
  // 재무
  '/finance': '장부/결산',
  '/finance/collections': '수금 관리',
  '/finance/settlement': '정산 관리',
  '/finance/upload': '카드/통장 관리',
  '/finance/review': '분류/확정',
  '/finance/freelancers': '프리랜서 관리',
  '/finance/cards': '법인카드',
  '/admin/payroll': '급여 관리',
  '/report': '경영보고서',
  '/loans': '대출 관리',
  // 투자
  '/invest': '투자 정산 관리',
  '/jiip': '투자 정산 관리',
  // 데이터 관리
  '/db/pricing-standards': '견적 단가표',
  '/db/lotte': '벤치마크',
  // 직장인필수
  '/work-essentials/my-info': '내 정보',
  '/work-essentials/receipts': '영수증제출',
  // 플랫폼 (god_admin)
  '/admin': '회사/가입 관리',
  '/system-admin': '구독 관리',
  '/admin/developer': '개발자 모드',
  // 설정
  '/admin/employees': '조직/권한 관리',
  '/admin/contract-terms': '계약 약관 관리',
  '/admin/message-templates': '메시지 센터',
}

// 설정/플랫폼 그룹 매핑
const ADMIN_GROUP: Record<string, string> = {
  '/admin': 'platform',
  '/system-admin': 'platform',
  '/admin/developer': 'platform',
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
