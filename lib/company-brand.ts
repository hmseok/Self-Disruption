// ═══════════════════════════════════════════════════════════════
// PR-MULTI-BRAND P3 — 회사별 브랜드 설정
// 설계서: _docs/MULTI-BRAND-DESIGN.md
// ───────────────────────────────────────────────────────────────
// 회사 키('FMI'|'RIDE') → 브랜드(회사명·색상·로고·심볼).
// 회사 키는 P2 미들웨어가 서브도메인 보고 세팅한 company_key 쿠키에서 읽음.
//   ride.hmseok.com → RIDE / 그 외 → FMI (기본)
// 로그인 전(pre-auth) 페이지가 빠르게 쓰도록 코드 상수 — DB 조회 불필요.
//
// P3.2 — RIDE 공식 브랜드 키트 반영 (Brand-Identity-Guidelines_V1.0.pdf):
//   · accent  : 보조 강조색 (Spark Blue)
//   · symbol  : 심볼 단독 로고 (어두운/흰색)
//   · favicon : 정적 파비콘 PNG
//   · RIDE_THEME : 공식 Foundation 팔레트(2차색·그레이) + 타이포 스펙
// ═══════════════════════════════════════════════════════════════

export type CompanyKey = 'FMI' | 'RIDE'

export interface CompanyBrand {
  key: CompanyKey
  name: string        // 정식 회사명 (라이드 주식회사 / 주식회사 에프엠아이)
  shortName: string   // 짧은 표기 (RIDE / FMI)
  primary: string     // 브랜드 primary 색상 (hex)
  accent: string      // 보조 강조색 (hex)
  logo: string        // 밝은 배경용 가로 로고 (없으면 '' → 텍스트 워드마크)
  logoWhite: string   // 어두운 배경용 가로 로고
  symbol: string      // 심볼 단독 로고 — 어두운 색 (없으면 '')
  symbolWhite: string // 심볼 단독 로고 — 흰색
  favicon: string     // 정적 파비콘 PNG (없으면 '' → 코드가 이니셜 배지 생성)
}

export const COMPANY_BRANDS: Record<CompanyKey, CompanyBrand> = {
  FMI: {
    key: 'FMI',
    name: '주식회사 에프엠아이',
    shortName: 'FMI',
    primary: '#3b6eb5',
    accent: '#5b8def',
    logo: '',
    logoWhite: '',
    symbol: '',
    symbolWhite: '',
    favicon: '',
  },
  RIDE: {
    key: 'RIDE',
    name: '라이드 주식회사',
    shortName: 'RIDE',
    primary: '#0C0C30',        // Prestige Navy (공식)
    accent: '#0A93FF',         // Spark Blue (공식)
    logo: '/brand/ride-logo.png',
    logoWhite: '/brand/ride-logo-white.png',
    symbol: '/brand/ride-symbol.png',
    symbolWhite: '/brand/ride-symbol-white.png',
    favicon: '/brand/ride-favicon.png',
  },
}

// ── RIDE Brand Identity Guidelines V1.0 — Foundation 팔레트/타이포 ──
//   출처: Brand-Identity-Guidelines_V1.0.pdf (공식). RIDE 전용 디자인 표준.
//   ※ 앱 전역 기본 폰트는 현재 'IBM Plex Sans KR' — Pretendard 전역 교체는 별도 작업.
export const RIDE_THEME = {
  primary: {
    navy: '#0C0C30',       // Prestige Navy
    sparkBlue: '#0A93FF',  // Spark Blue
  },
  secondary: {
    indigo: '#333354',     // Stability Indigo
    red: '#D64C4C',        // Impact Red
    yellow: '#FFCC00',     // Focus Yellow
    green: '#15BD66',      // Growth Green
    purple: '#9238DA',     // Innovation Purple
  },
  gray: {
    100: '#F1F5F9', 200: '#E2E8F0', 300: '#CBD5E1',
    400: '#94A3B8', 500: '#64748B', 600: '#475569',
    700: '#334155', 800: '#1E293B', 900: '#0F172A',
  },
  font: { family: 'Pretendard', headingWeight: 700, bodyWeight: 400 },
} as const

// 클라이언트: company_key 쿠키 → CompanyKey (P2 미들웨어가 세팅)
export function readCompanyKey(): CompanyKey {
  if (typeof document === 'undefined') return 'FMI'
  const m = document.cookie.match(/(?:^|;\s*)company_key=([^;]+)/)
  return m && m[1] === 'RIDE' ? 'RIDE' : 'FMI'
}

// 현재 회사 브랜드 (인자 없으면 쿠키에서 자동 판별)
export function getCompanyBrand(key?: CompanyKey): CompanyBrand {
  return COMPANY_BRANDS[key || readCompanyKey()]
}
