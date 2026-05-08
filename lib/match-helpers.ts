// ════════════════════════════════════════════════════════════════
// match-helpers — 자동 매칭 공통 함수 (M-V2, 2026-05-08)
// ════════════════════════════════════════════════════════════════
//
// 사용처: auto-match-employee, auto-match-investor-jiip,
//        auto-match-freelancer, auto-match-fmi-rental
//
// 핵심:
//  - normName: 이름 정규화 + 은행 prefix 자동 제거
//  - 「국민강민우」 → 「강민우」 → 사전 매칭 hit
//  - 메타 거래 (공용/급여/3.3 등) skip
//  - 한국 차량번호 패턴 추출
// ════════════════════════════════════════════════════════════════

// 은행 prefix 사전 (긴 것 우선 매칭)
export const BANK_PREFIXES = [
  '카카오뱅크', '케이뱅크', '토스뱅크',
  '국민', '농협', '기업', '하나', '우리', '신한', '제주', 'IBK',
  'KB', 'kb', 'MG', 'NH', 'DGB', 'BNK',
  '대구', '부산', '경남', '광주', '전북',
  '카카오', '케이',
].sort((a, b) => b.length - a.length)

// 메타 거래 키워드 — client_name 안에 포함되면 매칭 skip
export const META_KEYWORDS = [
  '공용', '급여', '대출상환', '당직비', '정산',
  '주유비', '예금결산이자', '계약금', '근로',
  '국세', '국고', '환급', '이전비', 'CMS', '카드입금', '카드출금',
  '카드자동집금', '카드사', '뱅킹', '펌뱅킹', '타행',
  '인터넷', '모바일', '모바일이체', '업무폰',
  '네이버페이', '페이코', '페이플',
  '3.3', '8.8',
]

// 보험사 약어 (NON_INSURER 와 중복 — auto-match-fmi-rental 에서만 처리)
export const INSURER_KEYWORDS = [
  'DB', '디비', '현대', '삼성', '메리츠', '메츠',
  '롯데', '흥국', '악사', 'AXA', '한화', '캐롯', '한화캐롯',
  '택공', '택시공제', '렌공', '공제', '화물공제', '버스공제', '배달공제',
]

/**
 * 은행 prefix 제거 — 「국민강민우」 → 「강민우」
 * 단, prefix 만 있고 뒤에 이름 없으면 (예: 「국민」 단독) 그대로 반환
 */
export function stripBankPrefix(s: string): string {
  if (!s) return ''
  const trimmed = s.trim()
  for (const prefix of BANK_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      const rest = trimmed.slice(prefix.length).replace(/^[\s\-_]+/, '')
      // 최소 2글자 (한글 이름) 이상 남으면 prefix 제거
      // 1글자만 남으면 (예: 「국민A」) 의미 없음 — 원본 유지
      if (rest.length >= 2) {
        return rest
      }
    }
  }
  return trimmed
}

/**
 * 메타 거래 (공용/급여/대출상환 등) 여부 — 매칭 skip
 */
export function isMetaTransaction(s: string): boolean {
  if (!s) return false
  const trimmed = s.trim()
  // 단순 startsWith 또는 includes
  for (const kw of META_KEYWORDS) {
    if (trimmed.includes(kw)) return true
  }
  return false
}

/**
 * 통합 이름 정규화 — 매칭 사전과 비교용
 *  - trim, 공백 제거
 *  - (주)/주식회사 제거
 *  - 은행 prefix 제거
 *  - lowercase
 */
export function normName(s: string | null | undefined): string {
  if (!s) return ''
  let r = String(s).trim()
    .replace(/\s+/g, '')
    .replace(/\(주\)|주식회사|㈜/g, '')
  r = stripBankPrefix(r)
  return r.toLowerCase()
}

/**
 * 한국 차량번호 패턴 추출
 * 예: 「농협125하4228」 → { vehicle: '125하4228', last4: '4228' }
 */
export function extractCarNumber(s: string): { vehicle: string; last4: string } | null {
  if (!s) return null
  // 패턴: (\d{2,3})([가-힣])(\d{4})  — 예: 125하4228 / 47하9606
  const m = s.match(/(\d{2,3}[가-힣]\d{4})/)
  if (m) {
    const vehicle = m[1]
    const last4 = vehicle.slice(-4)
    return { vehicle, last4 }
  }
  return null
}
