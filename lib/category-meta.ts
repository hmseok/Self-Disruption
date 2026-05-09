// ════════════════════════════════════════════════════════════════
// category-meta — 카테고리 분류 메타데이터 (PR-UX3, 2026-05-09)
// ════════════════════════════════════════════════════════════════
//
// 사용자 멘탈 모델:
//   "분류는 매칭 대상이냐 아니냐로 정리, 매칭 대상은 매칭+검수,
//    나머지는 분류로 마무리"
//
// 분류:
//   REQUIRES_MATCHING — entity (사람/차량/계약) 추적 필요 → 매처 큐 → 검수 → 확정
//   AUTO_FINAL        — 일반 운영비/세금/수수료 → 분류만 되면 final (검수 X)
// ════════════════════════════════════════════════════════════════

/**
 * 매칭 대상 카테고리 — 사람/차량/계약 entity 추적 필요
 * (lib/transaction-classifier.ts 의 CATEGORY_RULES 카테고리명과 정확히 일치)
 */
export const REQUIRES_MATCHING_CATEGORIES = new Set<string>([
  // ── 사람 매칭 (직원/투자자/지입자/프리랜서) ──
  '급여(정규직)',
  '일용직급여',
  '용역비(3.3%)',
  '4대보험(회사부담)',
  '복리후생(식대)',           // 직원 식대 지원 → 직원 매칭
  '투자원금 입금',
  '지입 초기비용/보증금',
  '지입 수익배분금(출금)',
  '이자/잡이익',              // 투자자 이자 입금
  '이자비용(대출/투자)',       // 투자자 이자 지급

  // ── 차량 매칭 ──
  '유류비',
  '정비/수리비',
  '차량보험료',
  '자동차세/공과금',
  '차량할부/리스료',
  '화물공제/적재물보험',
  '매각/처분수입',
  '주차/시설이용료',          // 차량별 추적 필요 시

  // ── 대차건 매칭 ──
  '보험금 수령',              // 보험사 대차건

  // ── 대출 계약 매칭 ──
  '대출 실행(입금)',
  '원금상환',
])

/**
 * 일반 카테고리 — 분류만 되면 자동 final (검수 X)
 * (REQUIRES_MATCHING 에 없는 모든 카테고리는 자동 AUTO_FINAL)
 */
export const AUTO_FINAL_CATEGORIES = new Set<string>([
  // 일반 매출/수입
  '렌트/운송수입',
  '지입 관리비/수수료',
  '렌터카 보증금(입금)',
  '기타수입',

  // 세금/금융
  '원천세/부가세',
  '법인세/지방세',
  '세금/공과금',
  '국고/세금납부',
  '수수료/카드수수료',
  '결제대행/PG수수료',
  '카드대금결제',

  // 일반 운영
  '임차료/사무실',
  '통신비',
  '소모품/사무용품',
  '접대비',
  '여비교통비',
  '교육/훈련비',
  '광고/마케팅',
  '보험료(일반)',
  '감가상각비',
  '수선/유지비',
  '전기/수도/가스',
  '도서/신문',
  '경비/보안',
  '쇼핑/온라인구매',

  '기타',
])

/**
 * 카테고리가 매칭 대상인지 판정
 *  - 매칭 대상 → entity 매칭 + 사용자 검수 필요
 *  - 비대상   → 분류만 되면 final (자동 확정)
 */
export function categoryRequiresMatching(category: string | null | undefined): boolean {
  if (!category) return false
  return REQUIRES_MATCHING_CATEGORIES.has(category)
}

/**
 * SQL용 매칭 대상 카테고리 목록 (' 로 quoted)
 *  사용 예: WHERE category IN (${getMatchingCategoriesSql()})
 */
export function getMatchingCategoriesSqlList(): string {
  return Array.from(REQUIRES_MATCHING_CATEGORIES).map(c => `'${c.replace(/'/g, "''")}'`).join(',')
}
