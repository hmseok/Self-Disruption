// ═══════════════════════════════════════════════════════════
// 거래 자동 분류 엔진 (PHASE 3)
//
// 1차: 규칙 기반 (가맹점명/적요 키워드 매칭)
// 2차: AI (Gemini) — 미분류 건 배치 처리
// 3차: 수동 확인 — 자동 불가 건 사용자 확정
//
// 3-tier 신뢰도:
//   auto   (≥80) → 자동 확정
//   review (60-79) → 관리자 검토 필요
//   manual (<60) → 수동 분류 필수
// ═══════════════════════════════════════════════════════════

export type ClassificationTier = 'auto' | 'review' | 'manual'

export interface RuleClassifyResult {
  category: string
  confidence: number
  tier: ClassificationTier
}

// ── 세무사 기준 분류 규칙 (법인 전체 계정과목) ──
// classify/route.ts의 CATEGORY_RULES와 동일하게 유지
const CATEGORY_RULES: Array<{
  category: string
  type: 'income' | 'expense'
  keywords: string[]
}> = [
  // ═══ 수입 (매출/영업외수익) ═══
  { category: '렌트/운송수입', type: 'income', keywords: ['매출', '정산', '운송료', '운임', '렌트료', '화물', '운반비', '배송료', '용차료'] },
  { category: '지입 관리비/수수료', type: 'income', keywords: ['지입료', '관리비수입', '번호판사용료', '차량관리수수료'] },
  { category: '투자원금 입금', type: 'income', keywords: ['투자', '증자', '자본', '출자', '출자금'] },
  { category: '지입 초기비용/보증금', type: 'income', keywords: ['지입보증금', '인수금', '초기비용', '입주보증금'] },
  { category: '렌터카 보증금(입금)', type: 'income', keywords: ['렌터카', '렌트카', '장기렌트', '렌트보증금'] },
  { category: '대출 실행(입금)', type: 'income', keywords: ['대출입금', '대출실행', '론실행', '여신실행'] },
  { category: '이자/잡이익', type: 'income', keywords: ['이자수입', '환급', '캐시백', '이자입금', '잡이익'] },
  { category: '보험금 수령', type: 'income', keywords: ['보험금', '보상금', '사고보상', '보험수령'] },
  { category: '매각/처분수입', type: 'income', keywords: ['차량매각', '매각대금', '처분대금', '중고매각'] },
  { category: '기타수입', type: 'income', keywords: ['잡수입', '기타수입'] },

  // ═══ 지출 (매출원가/판관비/영업외비용) ═══
  // 운송업 원가
  { category: '지입 수익배분금(출금)', type: 'expense', keywords: ['수익배분', '정산금', '배분금', '지입대금', '지입정산'] },
  { category: '유류비', type: 'expense', keywords: ['주유', '가스', '엘피지', 'gs칼텍스', 'sk에너지', 's-oil', '충전', '연료', 'lpg', 'cng', '알뜰주유', '현대오일뱅크', '에쓰오일', '셀프주유', '에너지', '삼표에너지', '에너비즈', '가스충전', '오일뱅크', '일렉링크', '차지비', '지에스차지비', '환경협', '자동차환경협', 'kepco', '한국전력공사', '전기차충전', 'ev충전'] },
  { category: '정비/수리비', type: 'expense', keywords: ['정비', '모터스', '타이어', '공업사', '수리', '부품', '오토', '정비소', '엔진오일', '세차', '카센터', '브레이크', '배터리'] },
  { category: '차량보험료', type: 'expense', keywords: ['손해보험', '화재보험', 'kb손해', '현대해상', 'db손해', '보험료', '자동차보험', '메리츠', '한화손해', '삼성화재', '흥국화재'] },
  { category: '자동차세/공과금', type: 'expense', keywords: ['자동차세', '과태료', '범칙금', '검사', '도로공사', '하이패스', '통행료', '교통벌금', '차량등록', '번호판', '한국도로', '고속도로', '고속화', '의왕고속', '과천의왕', '도시고속', '화성도시', '톨게이트', '용인서울', '일산퇴계원'] },
  { category: '주차/시설이용료', type: 'expense', keywords: ['시설관리공단', '주차장공단', '송파구시설', '서울특별시송파구시설', '공영주차', '주차공단', '공항공사', '공영자전거', 'km파크', '아마노코리아', '아마노', '주차'] },
  { category: '차량할부/리스료', type: 'expense', keywords: ['캐피탈', '파이낸셜', '할부', '리스료', '오토리스', '약정', '여신금융', '할부금'] },
  { category: '화물공제/적재물보험', type: 'expense', keywords: ['화물공제', '적재물', '화물보험', '공제조합', '화물연대'] },

  // 인건비
  { category: '급여(정규직)', type: 'expense', keywords: ['급여', '월급', '상여금', '퇴직금', '임금', '성과급'] },
  { category: '일용직급여', type: 'expense', keywords: ['일용', '일당', '아르바이트', '파트타임', '알바'] },
  { category: '용역비(3.3%)', type: 'expense', keywords: ['용역', '프리랜서', '3.3', '탁송', '대리운전', '외주', '도급', '위탁', '하청'] },
  { category: '4대보험(회사부담)', type: 'expense', keywords: ['국민연금', '건강보험', '고용보험', '산재보험', '4대보험', '사회보험'] },

  // 세금/금융
  { category: '원천세/부가세', type: 'expense', keywords: ['원천세', '부가세', '부가가치세', '예정신고', '확정신고'] },
  { category: '법인세/지방세', type: 'expense', keywords: ['법인세', '지방세', '지방소득세', '법인지방소득세'] },
  { category: '세금/공과금', type: 'expense', keywords: ['세무서', '국세청', '국세', '재산세', '종합부동산세', '취득세', '인지세'] },
  { category: '이자비용(대출/투자)', type: 'expense', keywords: ['이자', '금융비용', '이자지급', '대출이자'] },
  { category: '원금상환', type: 'expense', keywords: ['원금상환', '원리금', '대출상환'] },
  { category: '수수료/카드수수료', type: 'expense', keywords: ['수수료', '카드수수료', '송금수수료', '이체수수료', '중개수수료', 'pg수수료'] },

  // 일반관리비
  { category: '임차료/사무실', type: 'expense', keywords: ['월세', '임대료', '관리비', '사무실', '임차', '부동산', '건물관리'] },
  { category: '통신비', type: 'expense', keywords: ['kt', 'skt', 'lg유플러스', '통신', '전화', '알뜰폰', '티플러스'] },
  { category: '소모품/사무용품', type: 'expense', keywords: ['다이소', '문구', '사무용품', '토너', '복사', '프린터'] },
  { category: '복리후생(식대)', type: 'expense', keywords: ['식당', '카페', '커피', '마트', '식사', '편의점', '배달', '음식', '도시락', '푸드', '치킨', '피자', '한식', '중식', '일식', '분식', '국밥', '해장국', '막국수', '냉면', '삼겹살', '고기', '백반', '김밥', '떡볶이', '라멘', '초밥', '돈까스', '짜장', '짬뽕', '족발', '보쌈', '갈비', '순대', '수제비', '칼국수', '설렁탕', '곰탕', '감자탕', '찌개', '정식', '뷔페', '횟집', '스시', '우동', '소바', '빵집', '베이커리', '아이스크림', '더벤티', '벤티', '메가커피', '컴포즈', '빽다방', '이디야', '투썸', '파스쿠찌', '폴바셋', '스타벅스', '쿠팡이츠', '배달의민족', '배민', '요기요', '명동', '봄날', '설렁탕', '소길국수', '딤딤섬', '쉼', '루이', '서울판지'] },
  { category: '접대비', type: 'expense', keywords: ['접대', '골프', '선물', '경조사', '화환', '축의금', '부조'] },
  { category: '여비교통비', type: 'expense', keywords: ['택시', '기차', 'ktx', '고속버스', '시외버스', '항공', '비행기', '숙박', '호텔', '모텔', '파킹', '카카오모빌', '카카오t', '카카오택시', '모바일티머니', '티머니', '지하철', '시내버스', '광역버스', '버스카드', '한국공항공사', '청주공항', '인천공항', '김포공항'] },
  { category: '교육/훈련비', type: 'expense', keywords: ['교육', '훈련', '연수', '세미나', '학원', '자격증'] },
  { category: '광고/마케팅', type: 'expense', keywords: ['광고', '마케팅', '홍보', '네이버광고', '구글애즈', '페이스북', '인스타그램'] },
  { category: '보험료(일반)', type: 'expense', keywords: ['생명보험', '상해보험', '단체보험', '배상책임'] },
  { category: '감가상각비', type: 'expense', keywords: ['감가상각', '상각비'] },
  { category: '수선/유지비', type: 'expense', keywords: ['수선비', '유지보수', '시설보수'] },
  { category: '전기/수도/가스', type: 'expense', keywords: ['전기요금', '수도요금', '가스요금', '한국전력', '도시가스'] },
  { category: '도서/신문', type: 'expense', keywords: ['도서', '서적', '신문', '구독'] },
  { category: '경비/보안', type: 'expense', keywords: ['경비', 'cctv', '보안', '에스원', 'adt', '경호'] },
  { category: '쇼핑/온라인구매', type: 'expense', keywords: ['쿠팡', '쿠페이', '쿠팡로지', '네이버', '11번가', 'g마켓', '옥션', '아마존', '알리', '테무', '마켓컬리', '컬리', 'wemakeprice', '위메프', '티몬', '인터파크'] },
  { category: '결제대행/PG수수료', type: 'expense', keywords: ['nhnkcp', 'kcp', '결제대행', 'inicis', '이니시스', '토스페이먼츠', 'pg수수료'] },
  { category: '카드대금결제', type: 'expense', keywords: ['kb카드출금', '우리카드결제', '신한카드결제', '카드대금', '국민카드결제', '현대카드결제', '롯데카드결제', '삼성카드결제'] },
  { category: '국고/세금납부', type: 'expense', keywords: ['국고_', '국고주식회사', '국고 ', '세무서', '국세청', '농협경기연천군', '지자체세입', '법원행정처', '농협-주식회사'] },
  { category: '기타', type: 'expense', keywords: [] },
]

// ── 카테고리 목록 (AI용) ──
export const ALL_CATEGORIES = CATEGORY_RULES.filter(r => r.keywords.length > 0).map(r => r.category)

// ── 수입 카테고리 목록 (방향 검증용) ──
export const INCOME_CATEGORIES = CATEGORY_RULES.filter(r => r.type === 'income').map(r => r.category)

/**
 * 규칙 기반 분류: 가맹점명/적요에서 키워드 매칭
 *
 * @param merchant  가맹점명 또는 적요 (SMS에서 파싱된 값)
 * @param txType    거래 유형 ('income' | 'expense')
 * @returns         분류 결과 (category, confidence, tier) 또는 null (매칭 없음)
 */
export function classifyByRules(
  merchant: string | null,
  txType: 'income' | 'expense'
): RuleClassifyResult | null {
  if (!merchant) return null

  const text = merchant.replace(/\s/g, '').toLowerCase()
  if (!text) return null

  // 방향에 맞는 규칙만 필터
  const rules = CATEGORY_RULES.filter(r => r.type === txType && r.keywords.length > 0)

  let bestMatch: { category: string; matchCount: number; keywordLen: number } | null = null

  for (const rule of rules) {
    let matchCount = 0
    let totalKeywordLen = 0

    for (const kw of rule.keywords) {
      if (text.includes(kw.toLowerCase())) {
        matchCount++
        totalKeywordLen += kw.length
      }
    }

    if (matchCount > 0) {
      // 더 긴 키워드 매칭이 더 정확 (예: "gs칼텍스" > "가스")
      if (!bestMatch || totalKeywordLen > bestMatch.keywordLen ||
          (totalKeywordLen === bestMatch.keywordLen && matchCount > bestMatch.matchCount)) {
        bestMatch = { category: rule.category, matchCount, keywordLen: totalKeywordLen }
      }
    }
  }

  if (!bestMatch) return null

  // 신뢰도 계산: 키워드 길이 + 매칭 수 기반
  let confidence: number
  if (bestMatch.keywordLen >= 6 || bestMatch.matchCount >= 2) {
    confidence = 90  // 긴 키워드 or 다중 매칭 → 높은 신뢰도
  } else if (bestMatch.keywordLen >= 3) {
    confidence = 75  // 중간 키워드
  } else {
    confidence = 55  // 짧은 키워드 (1-2글자) → 낮은 신뢰도
  }

  const tier: ClassificationTier = confidence >= 80 ? 'auto' : confidence >= 60 ? 'review' : 'manual'

  return { category: bestMatch.category, confidence, tier }
}

/**
 * 거래 방향 검증: AI 분류 결과가 입출금 방향과 맞는지 확인
 */
export function validateDirection(
  category: string,
  txType: 'income' | 'expense'
): boolean {
  const isIncomeCat = INCOME_CATEGORIES.includes(category)
  if (txType === 'expense' && isIncomeCat) return false
  if (txType === 'income' && !isIncomeCat) return false
  return true
}

/**
 * 분류 결과를 tier로 변환
 */
export function getTier(confidence: number): ClassificationTier {
  if (confidence >= 80) return 'auto'
  if (confidence >= 60) return 'review'
  return 'manual'
}
