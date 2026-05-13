'use client'
import { usePathname } from 'next/navigation'
import { GLASS } from '../utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════
// PageTitle — Neumorphism (Style E) 페이지 타이틀 컴포넌트
// 블루 도트 + 1행 브레드크럼 + 뉴모피즘 디바이더
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
  '/quotes': 'sales', '/quotes/create': 'sales', '/quotes/operational-learning': 'sales',
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
  '/meetings': 'work',
  // ── 관리자 운영 (admin-ops) ── (PR-6.13.c)
  '/RideVehicleRegistry':       'admin-ops',
  '/RideCustomerData':          'admin-ops',
  '/RideSettlements':           'admin-ops',
  '/RideAccidents':             'admin-ops',
  '/RideAccidentReports':       'admin-ops',
  // ── CX팀 (콜센터 등) — Phase N-12 ──
  '/CallScheduler':                                'cx',
  '/CallScheduler/new':                            'cx',
  '/CallScheduler/settings':                       'cx',
  '/CallScheduler/requests':                       'cx',
  '/CallScheduler/skips':                          'cx',
  '/CallScheduler/me':                             'cx',
  // ── MT팀 운영 — PR-MT-OPS (2026-05-11) ──
  '/RideMTOps/maintenance-tours':                  'mt-team',
  '/RideMTOps/legal-inspections':                  'mt-team',
  '/RideMTOps/chargers':                           'mt-team',
}

// 그룹 ID → 섹션 라벨
const GROUP_LABELS: Record<string, string> = {
  vehicle: '차량관리',
  sales: '영업/계약',
  finance: '재무/경영',
  work: 'Employee of Ride Inc.',
  settings: '설정',
  'admin-ops': '관리자 운영',  // PR-6.13.c
  cx: 'CX팀',                  // N-12 — CallScheduler 등
  'mt-team': 'MT팀',           // PR-MT-OPS (2026-05-11)
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
  '/quotes/operational-learning': '운영학습',
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
  '/meetings': '회의록',
  // 설정
  '/admin/employees': '조직/권한 관리',
  '/admin/contract-terms': '계약 약관 관리',
  '/admin/message-templates': '메시지 센터',
  // 관리자 운영 (PR-6.13.c)
  '/RideVehicleRegistry':  '라이드 운영',
  '/RideCustomerData':     '라이드 고객사 데이터',
  '/RideSettlements':      '고객사 마감자료',
  '/RideAccidents':        '라이드 긴급출동',
  '/RideAccidentReports':  '라이드 사고접수',
  // CX팀 (Phase N-12)
  '/CallScheduler':                  '근무시간표 분석 & 배포',
  '/CallScheduler/new':              '새 월 만들기',
  '/CallScheduler/settings':         '설정',
  '/CallScheduler/requests':         '직원 요청 검토',
  '/CallScheduler/skips':            '회피일 검토',
  '/CallScheduler/me':               '내 시간표',
  // MT팀 운영 (PR-MT-OPS — 2026-05-11)
  '/RideMTOps/maintenance-tours':    '순회정비',
  '/RideMTOps/legal-inspections':    '법정검사',
  '/RideMTOps/chargers':             '충전기',
}

// 설정 그룹 매핑
const ADMIN_GROUP: Record<string, string> = {
  '/admin/employees': 'settings',
  '/admin/contract-terms': 'settings',
  '/admin/message-templates': 'settings',
}

interface PageTitleProps {
  dynamicMenuName?: string
}

export default function PageTitle({ dynamicMenuName }: PageTitleProps) {
  const pathname = usePathname()

  const findBestMatch = (map: Record<string, string>): string | null => {
    if (map[pathname]) return map[pathname]
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

  if (!pageName || pathname === '/dashboard') return null

  return (
    <div style={{
      background: GLASS.L5.background,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      padding: '14px 24px',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      {/* 컬러 도트 (맥 윈도우 스타일) */}
      <div style={{ display: 'flex', gap: 6, marginRight: 4 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f87171' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fbbf24' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#34d399' }} />
      </div>
      {/* 브레드크럼 */}
      {sectionLabel && (
        <>
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{sectionLabel}</span>
          <span style={{ color: '#94a3b8', fontSize: 11 }}>›</span>
        </>
      )}
      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f2440' }}>{pageName}</span>
    </div>
  )
}
