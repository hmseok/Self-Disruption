'use client'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
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
  '/operations': 'vehicle', '/operations/intake': 'vehicle',
  '/operations/accident': 'vehicle', '/operations/dispatch': 'vehicle',
  '/long-term-rentals': 'vehicle',
  '/maintenance': 'vehicle',
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
  '/meetings/new': 'work',
  '/meetings/me': 'work',
  // ── 관리자 운영 (admin-ops) ── (PR-6.13.c)
  '/RideVehicleRegistry':       'admin-ops',
  '/RideCustomerData':          'admin-ops',
  '/RideSettlements':           'admin-ops',
  '/RideAccidents':             'admin-ops',
  '/RideAccidentReports':       'admin-ops',
  '/RideCompliance':            'admin-ops',  // PR-COMPLIANCE (2026-05-11)
  '/RideAssets':                'admin-ops',  // PR-ASSETS-1.0 (2026-05-14)
  // ── CX팀 (콜센터 등) — Phase N-12 ──
  '/CallScheduler':                                'cx',
  '/CallScheduler/schedules':                      'cx',
  '/CallScheduler/new':                            'cx',
  '/CallScheduler/settings':                       'cx',
  '/CallScheduler/requests':                       'cx',
  '/CallScheduler/skips':                          'cx',
  '/CallScheduler/me':                             'cx',
  '/CallScheduler/kpi':                            'cx',
  '/factory-search':                               'cx',  // PR-PT-COV (2026-05-24)
  '/RideEmployees':                                'cx',  // PR-PT-COV — 하위 경로 자동 커버
  // ── MT팀 운영 — PR-MT-OPS (2026-05-11) ──
  '/RideMTOps/maintenance-tours':                  'mt-team',
  '/RideMTOps/legal-inspections':                  'mt-team',
  '/RideMTOps/chargers':                           'mt-team',
  // ── 비전 — PR-VISION (2026-05-24) ──
  '/RideVision/lotto':                             'vision',
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
  vision: '비전',              // PR-VISION (2026-05-24)
}

// 경로 → 페이지 이름 (사이드바 NAME_OVERRIDES와 동기화)
const PAGE_NAMES: Record<string, string> = {
  '/dashboard': '대시보드',
  // 차량관리
  '/cars': '차량 관리',
  '/registration': '차량 등록증',
  '/insurance': '보험/가입',
  '/fleet/vehicle-lookup': '거래처 차량조회',
  '/operations': '차량 운영',
  '/long-term-rentals': '장기렌트',
  '/operations/intake': '접수/오더 (이전)',
  '/operations/accident': '사고 상세',
  '/operations/dispatch': '사고 상세',
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
  // PR-PT-COV2 (2026-05-24) — finance 메뉴 페이지 (부모 '재무 대시보드' 빌려쓰던 것 정정)
  '/finance/bank-card': '통장/카드',
  '/finance/investor': '투자자 정산',
  '/finance/cost-analysis': '원가 분석',
  '/finance/classify': '거래 분류',
  '/finance/sms': 'SMS 수집',
  '/admin/payroll': '급여 관리',
  '/report': '보고서',
  '/loans': '대출 관리',
  '/db/lotte': '경쟁사 벤치마크',
  // 직장인필수
  '/work-essentials/my-info': '내 정보',
  '/work-essentials/receipts': '영수증제출',
  '/meetings': '회의록',
  '/meetings/new': '회의록 · 새로 만들기',
  '/meetings/me': '내 TODO',
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
  '/RideAssets':           '라이드 자산',
  '/RideCompliance':       '정보보안',  // PR-COMPLIANCE (2026-05-11)
  // CX팀 (Phase N-12)
  '/CallScheduler':                  '스케줄 및 운영',
  '/CallScheduler/schedules':        '월별 스케줄',
  '/CallScheduler/new':              '새 월 만들기',
  '/CallScheduler/settings':         '설정',
  '/CallScheduler/requests':         '직원 요청 검토',
  '/CallScheduler/skips':            '회피일 검토',
  '/CallScheduler/me':               '내 시간표',
  '/CallScheduler/kpi':              'CX KPI',
  // MT팀 운영 (PR-MT-OPS — 2026-05-11)
  '/RideMTOps/maintenance-tours':    '순회정비',
  '/RideMTOps/legal-inspections':    '법정검사',
  '/RideMTOps/chargers':             '충전기',
  // 비전 (PR-VISION — 2026-05-24)
  '/RideVision/lotto':               '로또번호추출기',
  // PR-PT-COV (2026-05-24) — menu-registry 엔 있으나 PageTitle 누락이던 활성 페이지
  '/factory-search':                 '협력공장 추천',
  '/RideEmployees':                  '직원 마스터',
  '/hr':                             '인사 마스터',
  '/hr/payroll':                     '급여 운영',
  '/db/codes':                       '회사 정보',
}

// 설정 그룹 매핑
const ADMIN_GROUP: Record<string, string> = {
  '/admin/employees': 'settings',
  '/admin/contract-terms': 'settings',
  '/admin/message-templates': 'settings',
  // PR-PT-COV (2026-05-24) — 설정 그룹 활성 페이지 (PageTitle 누락분)
  '/hr': 'settings',
  '/hr/payroll': 'settings',
  '/db/codes': 'settings',
}

// 회사 식별 배지 (org-brand) — 로그인 회사 첫 글자.
// 솔리드 hex / linear-gradient 라 ui-token-lint(rgba 토큰) 무관.
const BRAND_BADGE: Record<string, { initial: string; gradient: string }> = {
  FMI:  { initial: 'F', gradient: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)' },
  RIDE: { initial: 'R', gradient: 'linear-gradient(135deg, #0d9488, #14b8a6)' },
}

interface PageTitleProps {
  dynamicMenuName?: string
  brand?: string         // 'FMI' | 'RIDE' — 로그인 회사 (org-brand)
  primaryLabel?: string  // 'FMI ERP' | 'RIDE CARE' — 탭 제목 base
}

export default function PageTitle({ dynamicMenuName, brand, primaryLabel }: PageTitleProps) {
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

  // ── 브라우저 탭 제목 동적화 (2026-05-24) ──
  //   사용자: 「탭이 여러 개 열리면 하위 페이지명만 보여 헷갈림 — 중간 그룹도」
  //   → 헤더 브레드크럼과 똑같은 「{그룹} › {페이지}」 포맷.
  //     그룹을 앞에 둬서 탭이 좁아 잘려도 어느 영역인지 먼저 보임.
  //     회사 식별은 favicon + 헤더 배지(F/R)가 담당 — 탭 제목은 최대한 짧게.
  useEffect(() => {
    document.title = pageName
      ? (sectionLabel ? `${sectionLabel} › ${pageName}` : pageName)
      : (primaryLabel || 'FMI ERP')
  }, [pageName, sectionLabel, primaryLabel])

  // ── favicon 동적화 (2026-05-24, hotfix 2026-05-24) ──
  //   사용자: 기본 삼각형 favicon 대신 헤더 배지처럼 회사 이니셜로.
  //   ⚠ 초판이 Next.js 가 관리하는 <link rel=icon> 을 .remove() 해서
  //     네비게이션 시 removeChild(null) 크래시 + 더블클릭 버그 유발.
  //   → append-only 로 수정: Next.js link 는 절대 안 건드리고, 자체 전용
  //     link(id=fmi-dynamic-favicon) 하나만 만들어 href 만 갱신.
  useEffect(() => {
    const b = brand === 'RIDE' ? { color: '#0d9488', initial: 'R' } : { color: '#3b6eb5', initial: 'F' }
    try {
      const cv = document.createElement('canvas')
      cv.width = 64; cv.height = 64
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = b.color
      ctx.beginPath(); ctx.arc(32, 32, 32, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 42px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(b.initial, 32, 35)
      const url = cv.toDataURL('image/png')
      // 자체 전용 link 하나만 유지 — Next.js 관리 link 는 제거 X (.remove 금지)
      let link = document.getElementById('fmi-dynamic-favicon') as HTMLLinkElement | null
      if (!link) {
        link = document.createElement('link')
        link.id = 'fmi-dynamic-favicon'
        link.rel = 'icon'
        link.type = 'image/png'
        document.head.appendChild(link)
      }
      link.href = url
    } catch { /* canvas 미지원 환경 — 기본 favicon 유지 */ }
  }, [brand])

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
      {/* 회사 식별 배지 — 로그인 회사 첫 글자 (org-brand) */}
      {(() => {
        const badge = BRAND_BADGE[brand || 'FMI'] || BRAND_BADGE.FMI
        return (
          <div title={primaryLabel || 'FMI ERP'} style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: badge.gradient,
            color: '#fff',
            fontSize: 12,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 4,
            flexShrink: 0,
            boxShadow: '2px 2px 5px rgba(140,170,210,0.30)',
          }}>
            {badge.initial}
          </div>
        )
      })()}
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
