// ═══════════════════════════════════════════════════════════════
// PR-MULTI-BRAND P3 — 회사별 브랜드 설정
// 설계서: _docs/MULTI-BRAND-DESIGN.md
// ───────────────────────────────────────────────────────────────
// 회사 키('FMI'|'RIDE') → 브랜드(회사명·색상·로고).
// 회사 키는 P2 미들웨어가 서브도메인 보고 세팅한 company_key 쿠키에서 읽음.
//   ride.hmseok.com → RIDE / 그 외 → FMI (기본)
// 로그인 전(pre-auth) 페이지가 빠르게 쓰도록 코드 상수 — DB 조회 불필요.
// ═══════════════════════════════════════════════════════════════

export type CompanyKey = 'FMI' | 'RIDE'

export interface CompanyBrand {
  key: CompanyKey
  name: string        // 정식 회사명 (라이드주식회사 / 주식회사 에프엠아이)
  shortName: string   // 짧은 표기 (RIDE / FMI)
  primary: string     // 브랜드 primary 색상 (hex)
  logo: string        // 밝은 배경용 로고 (없으면 '' → 텍스트 워드마크)
  logoWhite: string   // 어두운 배경용 로고
}

export const COMPANY_BRANDS: Record<CompanyKey, CompanyBrand> = {
  FMI: {
    key: 'FMI',
    name: '주식회사 에프엠아이',
    shortName: 'FMI',
    primary: '#3b6eb5',
    logo: '',
    logoWhite: '',
  },
  RIDE: {
    key: 'RIDE',
    name: '라이드주식회사',
    shortName: 'RIDE',
    primary: '#0C0C30',
    logo: '/brand/ride-logo.png',
    logoWhite: '/brand/ride-logo-white.png',
  },
}

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
