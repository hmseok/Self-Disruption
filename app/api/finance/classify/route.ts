import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// AI 통합 분류 API v3.0
// POST: 거래 배열 → 규칙 매칭 + Gemini AI 분류 + 계약 매칭
// 3-tier 신뢰도: auto(≥80) / review(60-79) / manual(<60)
// ============================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// ── Gemini AI 분류 함수 (미분류 건 일괄 처리) ──
async function classifyWithGemini(
  unclassified: Array<{ idx: number; client_name: string; description: string; amount: number; type: string; payment_method: string; transaction_date: string }>,
  categoryList: string[]
): Promise<Array<{ idx: number; category: string; confidence: number }>> {
  if (!GEMINI_API_KEY || unclassified.length === 0) return []

  // 최대 50건씩 배치
  const batches: typeof unclassified[] = []
  for (let i = 0; i < unclassified.length; i += 50) {
    batches.push(unclassified.slice(i, i + 50))
  }

  const allResults: Array<{ idx: number; category: string; confidence: number }> = []

  for (const batch of batches) {
    const txLines = batch.map((tx, i) =>
      `${i + 1}. [${tx.type === 'income' ? '입금' : '출금'}] ${tx.transaction_date} | ${tx.client_name} | ${tx.description} | ${Math.abs(tx.amount).toLocaleString()}원 | ${tx.payment_method}`
    ).join('\n')

    const prompt = `당신은 한국 법인(운송/지입 업종) 세무사·회계사입니다. 아래 법인 통장/카드 거래내역을 한국 세무 회계 기준에 맞는 계정과목으로 분류해주세요.

## 사용 가능한 카테고리 (세무 기준)
${categoryList.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## 카테고리 그룹 구조
- 매출(영업수익): 렌트/운송수입, 지입 관리비/수수료, 보험금 수령, 매각/처분수입, 이자/잡이익
- 자본변동: 투자원금 입금, 지입 초기비용/보증금, 렌터카 보증금(입금), 대출 실행(입금)
- 영업비용-차량: 유류비, 정비/수리비, 차량보험료, 자동차세/공과금, 차량할부/리스료, 화물공제/적재물보험
- 영업비용-금융: 이자비용(대출/투자), 원금상환, 지입 수익배분금(출금), 수수료/카드수수료
- 영업비용-인건비: 급여(정규직), 일용직급여, 용역비(3.3%), 4대보험(회사부담)
- 영업비용-관리: 복리후생(식대), 접대비, 여비교통비, 임차료/사무실, 통신비, 소모품/사무용품, 교육/훈련비, 광고/마케팅, 보험료(일반), 전기/수도/가스, 경비/보안
- 세금/공과: 원천세/부가세, 법인세/지방세, 세금/공과금
- 기타: 쇼핑/온라인구매, 도서/신문, 감가상각비, 수선/유지비, 기타수입, 기타

## 분류 규칙
### 입금(income) 거래
- 렌트/운송수입: 매출, 운송료, 화물, 정산, 운반비, 배송료, 용차료
- 지입 관리비/수수료: 지입료, 관리비수입, 번호판사용료
- 보험금 수령: 보험금, 보상금, 사고보상
- 매각/처분수입: 차량매각, 처분대금, 중고매각
- 이자/잡이익: 이자수입, 환급, 캐시백, 잡이익
- 투자원금 입금: 투자, 증자, 출자금
- 지입 초기비용/보증금: 지입보증금, 인수금, 초기비용
- 렌터카 보증금(입금): 렌터카, 렌트카, 장기렌트, 렌트보증금, 보증금(차량 관련)
- 대출 실행(입금): 대출입금, 여신실행, 론실행
- 기타수입: 잡수입, 기타수입

### 출금(expense) 거래
- 유류비: 주유소, GS칼텍스, SK에너지, S-OIL, LPG, CNG, 현대오일뱅크, 알뜰주유
- 정비/수리비: 정비소, 타이어, 공업사, 카센터, 세차, 엔진오일, 브레이크, 배터리
- 차량보험료: XX손해보험, 삼성화재, 현대해상, DB손해, 메리츠, 한화손해, 흥국화재
- 자동차세/공과금: 자동차세, 과태료, 범칙금, 하이패스, 통행료, 차량등록
- 차량할부/리스료: 캐피탈, 파이낸셜, 할부금, 리스료, 오토리스
- 화물공제/적재물보험: 화물공제, 적재물, 화물보험, 공제조합
- 이자비용(대출/투자): 대출이자, 금융비용, 이자지급
- 원금상환: 원금상환, 원리금, 대출상환
- 지입 수익배분금(출금): 수익배분, 정산금, 배분금, 지입대금
- 수수료/카드수수료: 이체수수료, 카드수수료, 송금수수료, PG수수료
- 급여(정규직): 급여, 월급, 상여금, 퇴직금
- 일용직급여: 일용, 일당, 아르바이트, 파트타임
- 용역비(3.3%): 프리랜서, 탁송, 외주, 대리운전, 도급, 하청
- 4대보험(회사부담): 국민연금, 건강보험, 고용보험, 산재보험
- 복리후생(식대): 식당, 카페, 편의점, 배달, 음식, 마트
- 접대비: 골프, 선물, 경조사, 화환, 축의금
- 여비교통비: 택시, KTX, 숙박, 호텔, 주차비, 항공, 고속버스
- 임차료/사무실: 월세, 임대료, 건물관리
- 통신비: KT, SKT, LG유플러스, 전화요금, 회선료
- 소모품/사무용품: 다이소, 문구, 사무용품, 토너, 복사
- 교육/훈련비: 교육, 훈련, 연수, 세미나, 자격증
- 광고/마케팅: 광고, 마케팅, 홍보, 네이버광고
- 보험료(일반): 생명보험, 상해보험, 단체보험, 배상책임
- 전기/수도/가스: 전기요금, 수도요금, 가스요금, 한국전력
- 경비/보안: 경비, CCTV, 에스원, ADT
- 원천세/부가세: 원천세, 부가세, 부가가치세
- 법인세/지방세: 법인세, 지방소득세, 법인지방소득세
- 세금/공과금: 세무서, 국세청, 재산세, 취득세
- 쇼핑/온라인구매: 쿠팡, 네이버, 11번가, G마켓, 옥션

### 카드/통장 구분 힌트
- 결제수단이 "카드"인 경우: 대부분 일반 경비(복리후생, 유류비, 접대비 등)
- 결제수단이 "이체/통장"인 경우: 급여, 원금상환, 보험료, 세금 등 정기 지출 가능성 높음
- "카드자동집금", "카드대금" → 수수료/카드수수료

### 중요 주의사항
- 비고/메모의 "인터넷", "모바일", "폰뱅킹", "서수원지점" 등은 **이체 수단/채널**이지 거래 목적이 아님. 분류 근거로 사용 금지!
- "인터넷" = 인터넷뱅킹 이체 → 통신비가 아님. 거래처명(사람이름/회사명)으로 판단할 것
- 거래처명이 "[은행명]+사람이름" 패턴(예: 기업윤민진, 국민석호민, 신한이승훈)이면 → 급여(정규직) 또는 용역비(3.3%)로 분류
- 사람 이름만 있는 출금 → 급여(정규직) 또는 용역비(3.3%)로 추정 (맥락상 판단)

### 추가 규칙
- 사람 이름만 있는 입금/출금 → 맥락상 추정 (투자, 급여, 용역비 등)
- 확실하지 않으면 confidence를 낮게 (50 이하)
- 운송/지입 업종 특성상 유류비·정비비·차량관련 비용 우선 고려

## 거래내역
${txLines}

## 응답 형식 (JSON 배열만, 설명 없이)
[{"no":1,"category":"유류비","confidence":85},{"no":2,"category":"급여(정규직)","confidence":70}]`

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          }),
        }
      )

      if (!res.ok) {
        console.error('Gemini API error:', res.status, await res.text())
        continue
      }

      const data = await res.json()
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

      // JSON 파싱 (Gemini는 responseMimeType으로 JSON 직접 반환)
      let parsed: any[]
      try {
        parsed = JSON.parse(content)
      } catch {
        // fallback: JSON 배열 추출
        const jsonMatch = content.match(/\[[\s\S]*\]/)
        if (!jsonMatch) continue
        parsed = JSON.parse(jsonMatch[0])
      }

      // 수입 카테고리 목록 (입금 거래에만 허용)
      const INCOME_CATEGORIES = [
        '렌트/운송수입', '지입 관리비/수수료', '보험금 수령', '매각/처분수입',
        '이자/잡이익', '투자원금 입금', '지입 초기비용/보증금', '렌터카 보증금(입금)', '대출 실행(입금)', '기타수입'
      ]

      for (const item of parsed) {
        const no = item.no - 1 // 0-indexed
        if (no >= 0 && no < batch.length && categoryList.includes(item.category)) {
          const tx = batch[no]
          let category = item.category
          let confidence = Math.min(item.confidence || 60, 90)

          // ★ 입출금 방향 검증: 출금인데 수입 카테고리이거나, 입금인데 지출 카테고리이면 보정
          const isIncomeCat = INCOME_CATEGORIES.includes(category)
          if (tx.type === 'expense' && isIncomeCat) {
            // 출금인데 수입 카테고리 → 미분류로 강등
            console.warn(`⚠️ [분류검증] 출금인데 수입 카테고리 감지: ${tx.client_name} → ${category} → 미분류 처리`)
            category = '미분류'
            confidence = 30
          } else if (tx.type === 'income' && !isIncomeCat) {
            // 입금인데 지출 카테고리 → 미분류로 강등
            console.warn(`⚠️ [분류검증] 입금인데 지출 카테고리 감지: ${tx.client_name} → ${category} → 미분류 처리`)
            category = '미분류'
            confidence = 30
          }

          allResults.push({
            idx: tx.idx,
            category,
            confidence,
          })
        }
      }
    } catch (e) {
      console.error('Gemini classify error:', e)
    }
  }

  return allResults
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── 세무사 기준 분류 규칙 (법인 전체 계정과목 기준 확장) ──
const CATEGORY_RULES = [
  // ═══ 수입 (매출/영업외수익) ═══
  { category: '렌트/운송수입', type: 'income', keywords: ['매출', '정산', '운송료', '운임', '렌트료', '화물', '운반비', '배송료', '용차료'] },
  { category: '지입 관리비/수수료', type: 'income', keywords: ['지입료', '관리비수입', '번호판사용료', '차량관리수수료'] },
  { category: '투자원금 입금', type: 'income', keywords: ['투자', '증자', '자본', '출자', '출자금'] },
  { category: '지입 초기비용/보증금', type: 'income', keywords: ['지입보증금', '인수금', '초기비용', '입주보증금'] },
  { category: '렌터카 보증금(입금)', type: 'income', keywords: ['렌터카', '렌트카', '장기렌트', '렌트보증금', '보증금입금', '보증금'] },
  { category: '대출 실행(입금)', type: 'income', keywords: ['대출입금', '대출실행', '론실행', '여신실행'] },
  { category: '이자/잡이익', type: 'income', keywords: ['이자수입', '환급', '캐시백', '이자입금', '이자지급', '잡이익'] },
  { category: '보험금 수령', type: 'income', keywords: ['보험금', '보상금', '사고보상', '보험수령'] },
  { category: '매각/처분수입', type: 'income', keywords: ['차량매각', '매각대금', '처분대금', '중고매각'] },
  { category: '기타수입', type: 'income', keywords: ['잡수입', '기타수입'] },

  // ═══ 지출 (매출원가/판관비/영업외비용) ═══
  // 운송업 원가
  { category: '지입 수익배분금(출금)', type: 'expense', keywords: ['수익배분', '정산금', '배분금', '지입대금', '지입정산'] },
  { category: '유류비', type: 'expense', keywords: ['주유', '가스', '엘피지', 'gs칼텍스', 'sk에너지', 's-oil', '충전', '연료', 'lpg', 'cng', '알뜰주유', '현대오일뱅크', '에쓰오일', '셀프주유', '에너지', '삼표에너지', '에너비즈', '가스충전', '오일뱅크'] },
  { category: '정비/수리비', type: 'expense', keywords: ['정비', '모터스', '타이어', '공업사', '수리', '부품', '오토', '정비소', '엔진오일', '세차', '카센터', '브레이크', '배터리'] },
  { category: '차량보험료', type: 'expense', keywords: ['손해보험', '화재보험', 'kb손해', '현대해상', 'db손해', '보험료', '자동차보험', '메리츠', '한화손해', '삼성화재', '흥국화재'] },
  { category: '자동차세/공과금', type: 'expense', keywords: ['자동차세', '과태료', '범칙금', '검사', '도로공사', '하이패스', '통행료', '교통벌금', '차량등록', '번호판'] },
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
  { category: '통신비', type: 'expense', keywords: ['kt', 'skt', 'lg유플러스', '인터넷', '통신', '전화', '알뜰폰', '티플러스'] },
  { category: '소모품/사무용품', type: 'expense', keywords: ['다이소', '문구', '사무용품', '토너', '복사', '프린터'] },
  { category: '복리후생(식대)', type: 'expense', keywords: ['식당', '카페', '커피', '마트', '식사', '편의점', '배달', '음식', '도시락', '푸드', '치킨', '피자', '한식', '중식', '일식', '분식', '국밥', '해장국', '막국수', '냉면', '삼겹살', '고기', '백반', '김밥', '떡볶이', '라멘', '초밥', '돈까스', '짜장', '짬뽕', '족발', '보쌈', '갈비', '순대', '수제비', '칼국수', '설렁탕', '곰탕', '감자탕', '찌개', '정식', '뷔페', '횟집', '스시', '우동', '소바', '빵집', '베이커리', '아이스크림'] },
  { category: '접대비', type: 'expense', keywords: ['접대', '골프', '선물', '경조사', '화환', '축의금', '부조'] },
  { category: '여비교통비', type: 'expense', keywords: ['택시', '기차', 'ktx', '고속버스', '시외버스', '항공', '비행기', '숙박', '호텔', '모텔', '주차비', '주차장', '주차', '파킹'] },
  { category: '교육/훈련비', type: 'expense', keywords: ['교육', '훈련', '연수', '세미나', '학원', '자격증'] },
  { category: '광고/마케팅', type: 'expense', keywords: ['광고', '마케팅', '홍보', '네이버광고', '구글애즈', '페이스북', '인스타그램'] },
  { category: '보험료(일반)', type: 'expense', keywords: ['생명보험', '상해보험', '단체보험', '배상책임'] },
  { category: '감가상각비', type: 'expense', keywords: ['감가상각', '상각비'] },
  { category: '수선/유지비', type: 'expense', keywords: ['수선비', '유지보수', '시설보수'] },
  { category: '전기/수도/가스', type: 'expense', keywords: ['전기요금', '수도요금', '가스요금', '한국전력', '도시가스'] },
  { category: '도서/신문', type: 'expense', keywords: ['도서', '서적', '신문', '구독'] },
  { category: '경비/보안', type: 'expense', keywords: ['경비', 'cctv', '보안', '에스원', 'adt', '경호'] },
  { category: '쇼핑/온라인구매', type: 'expense', keywords: ['쿠팡', '네이버', '11번가', 'g마켓', '옥션', '아마존', '알리', '테무'] },
  { category: '기타', type: 'expense', keywords: [] },
]

// ── 은행명 접두어 제거 ──
const BANK_PREFIXES = [
  '기업', '신한', '국민', '하나', '우리', '농협', '카카오', '토스', '케이',
  '신협', '수협', '부산', '대구', '광주', '전북', '경남', '제주', '산업',
  '씨티', '새마을', '우체국', '저축', 'nh', 'ibk', 'kb', 'sc',
]

function stripBankPrefix(name: string): string {
  if (!name) return ''
  let stripped = name.replace(/\s/g, '').toLowerCase()
  for (const prefix of BANK_PREFIXES) {
    if (stripped.startsWith(prefix) && stripped.length > prefix.length + 1) {
      stripped = stripped.slice(prefix.length)
      break
    }
  }
  return stripped
}

// ── 유사도 함수들 ──
function nameSimilarity(txName: string, targetName: string): number {
  if (!txName || !targetName) return 0
  const a = txName.replace(/\s/g, '').toLowerCase()
  const b = targetName.replace(/\s/g, '').toLowerCase()
  if (a === b) return 100

  // 은행명 접두어 제거 후 비교 (includes보다 먼저 체크)
  const aStripped = stripBankPrefix(a)
  const bStripped = stripBankPrefix(b)
  if (aStripped && bStripped) {
    if (aStripped === bStripped) return 95  // "기업윤민진" → "윤민진" === "윤민진"
    if (aStripped.includes(bStripped) || bStripped.includes(aStripped)) return 85
  }

  // 일반 포함 관계
  if (a.includes(b) || b.includes(a)) return 80

  const minLen = Math.min(a.length, b.length)
  if (minLen < 2) return 0
  let matched = 0
  for (let i = 0; i <= a.length - 2; i++) {
    if (b.includes(a.substring(i, i + 2))) matched++
  }
  return Math.round((matched / Math.max(a.length - 1, 1)) * 60)
}

function amountSimilarity(txAmount: number, targetAmount: number): number {
  if (!txAmount || !targetAmount) return 0
  const diff = Math.abs(txAmount - targetAmount)
  const tolerance = targetAmount * 0.05
  if (diff <= tolerance) return 100
  if (diff <= targetAmount * 0.15) return 50
  if (diff <= targetAmount * 0.30) return 20
  return 0
}

function dateSimilarity(txDate: string, paymentDay: number): number {
  if (!txDate || !paymentDay) return 0
  const day = new Date(txDate).getDate()
  const diff = Math.abs(day - paymentDay)
  if (diff <= 2) return 100
  if (diff <= 5) return 50
  return 0
}

// ── 매칭 대상 통합 인터페이스 ──
interface MatchTarget {
  id: string
  type: 'jiip' | 'invest' | 'loan' | 'salary' | 'freelancer' | 'insurance' | 'car'
  name: string
  monthlyAmount: number
  paymentDay: number
  defaultCategory: string
  txType: 'income' | 'expense' | 'both'
  extra?: Record<string, any>
}

interface ScheduleInfo {
  id: string
  contract_type: string
  contract_id: string
  payment_date: string
  expected_amount: number
  status: string
}

interface ClassifyResult {
  category: string
  confidence: number
  classification_tier: 'auto' | 'review' | 'manual'
  related_type: string | null
  related_id: string | null
  matched_schedule_id: string | null
  match_score: number
  matched_name: string | null
  alternatives: Array<{ category: string; confidence: number; related_type?: string; related_id?: string }>
}

export async function POST(request: NextRequest) {
  try {
    const { transactions, company_id } = await request.json()

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json({ error: '거래 배열이 필요합니다.' }, { status: 400 })
    }
    if (!company_id) {
      return NextResponse.json({ error: 'company_id가 필요합니다.' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // ── 1. 모든 매칭 데이터 병렬 로딩 (테이블 없어도 에러 안 남) ──
    const safeQuery = async (query: any) => {
      try {
        const result = await query
        if (result?.error) {
          console.warn('[safeQuery] DB 에러 (무시):', result.error?.message || result.error)
          return { data: [], error: result.error }
        }
        return result
      } catch (e: any) {
        console.warn('[safeQuery] 예외 (무시):', e?.message || e)
        return { data: [], error: null }
      }
    }

    const [
      jiipRes, investRes, loanRes, rulesRes, scheduleRes,
      salaryRes, freelancerRes, insuranceRes, carRes, cardRes, cardHistoryRes
    ] = await Promise.all([
      safeQuery(sb.from('jiip_contracts').select('*').eq('company_id', company_id)),
      safeQuery(sb.from('general_investments').select('*').eq('company_id', company_id)),
      safeQuery(sb.from('loans').select('*').eq('company_id', company_id)),
      safeQuery(sb.from('finance_rules').select('*')),
      safeQuery(sb.from('expected_payment_schedules').select('*').eq('company_id', company_id)),
      safeQuery(sb.from('employee_salaries').select('*').eq('company_id', company_id)),
      safeQuery(sb.from('freelancers').select('*').eq('company_id', company_id)),
      safeQuery(sb.from('insurance_contracts').select('*').eq('company_id', company_id)),
      safeQuery(sb.from('cars').select('*').eq('company_id', company_id)),
      safeQuery(sb.from('corporate_cards').select('*').eq('company_id', company_id)),
      safeQuery(sb.from('card_assignment_history').select('*')),
    ])

    // ── 2. 통합 매칭 대상 생성 (JS에서 status 필터링 — 컬럼 없을 수 있음) ──
    const filterActive = (arr: any[]) => arr.filter(r => !r.status || r.status === 'active')
    const targets: MatchTarget[] = []

    // 지입 계약
    for (const c of filterActive(jiipRes.data || [])) {
      targets.push({
        id: c.id, type: 'jiip',
        name: c.investor_name || c.investor_name || '',
        monthlyAmount: Number(c.admin_fee) || 0,
        paymentDay: Number(c.payout_day) || 10,
        defaultCategory: '지입 관리비/수수료',
        txType: 'both',
      })
    }

    // 투자 계약
    for (const c of filterActive(investRes.data || [])) {
      const monthlyInterest = Math.round((Number(c.invest_amount) || 0) * (Number(c.interest_rate) || 0) / 100 / 12)
      targets.push({
        id: c.id, type: 'invest',
        name: c.investor_name || '',
        monthlyAmount: monthlyInterest,
        paymentDay: Number(c.payment_day) || 10,
        defaultCategory: '이자비용(대출/투자)',
        txType: 'both',
      })
    }

    // 대출
    for (const c of filterActive(loanRes.data || [])) {
      targets.push({
        id: c.id, type: 'loan',
        name: c.finance_name || '',
        monthlyAmount: Number(c.monthly_payment) || 0,
        paymentDay: Number(c.payment_date) || 10,
        defaultCategory: '차량할부/리스료',
        txType: 'expense',
      })
    }

    // 직원 급여
    for (const s of (salaryRes.data || []).filter((r: any) => r.is_active !== false)) {
      const profileData = s.profiles as any
      const empName = profileData?.name || s.name || ''
      targets.push({
        id: s.employee_id || s.id, type: 'salary',
        name: empName,
        monthlyAmount: Number(s.base_salary || s.salary) || 0,
        paymentDay: Number(s.pay_day || s.payment_day) || 25,
        defaultCategory: '급여(정규직)',
        txType: 'expense',
        extra: { employee_id: s.employee_id },
      })
    }

    // 프리랜서
    for (const f of filterActive(freelancerRes.data || [])) {
      targets.push({
        id: f.id, type: 'freelancer',
        name: f.name || '',
        monthlyAmount: Number(f.default_fee) || 0,
        paymentDay: 0, // 프리랜서는 정기 지급일 없음
        defaultCategory: '용역비(3.3%)',
        txType: 'expense',
        extra: { service_type: f.service_type },
      })
    }

    // 보험
    for (const ins of insuranceRes.data || []) {
      const monthlyPremium = Math.round((Number(ins.total_premium) || 0) / 12)
      targets.push({
        id: ins.id, type: 'insurance',
        name: ins.company || ins.product_name || '',
        monthlyAmount: monthlyPremium,
        paymentDay: 0,
        defaultCategory: '차량보험료',
        txType: 'expense',
        extra: { car_id: ins.car_id },
      })
    }

    const filterPending = (arr: any[]) => arr.filter(r => !r.status || r.status === 'pending')
    const schedules: ScheduleInfo[] = filterPending(scheduleRes.data || []) as ScheduleInfo[]
    const dbRules = (rulesRes.data || []) as any[]
    // 카드는 status 필터 없이 전체 로드 (status 컬럼이 없을 수 있음)
    const cards = (cardRes.data || []) as any[]
    const cars = (carRes.data || []) as any[]

    // 디버그: 로드된 매칭 데이터 확인
    console.log(`[classify] 매칭 데이터 로드: 법인카드 ${cards.length}장, 차량 ${cars.length}대, 지입 ${targets.filter(t=>t.type==='jiip').length}건, 투자 ${targets.filter(t=>t.type==='invest').length}건, 대출 ${targets.filter(t=>t.type==='loan').length}건`)
    if (cards.length > 0) {
      console.log(`[classify] 카드 목록:`, cards.map((c: any) => `${c.card_company} ${(c.card_number||'').slice(-4)} (ID:${c.id})`))
    }
    if (cardRes.error) {
      console.error('[classify] corporate_cards 쿼리 에러:', cardRes.error)
    }

    // ── 3. 각 거래 분석 ──
    const enriched = transactions.map((tx: any) => {
      const clientName = tx.client_name || ''
      const description = tx.description || ''
      const searchText = `${clientName} ${description}`.toLowerCase()
      const amount = Math.abs(Number(tx.amount) || 0)
      const txType = tx.type || 'expense'

      const result: ClassifyResult = {
        category: '미분류',
        confidence: 0,
        classification_tier: 'manual',
        related_type: null,
        related_id: null,
        matched_schedule_id: null,
        match_score: 0,
        matched_name: null,
        alternatives: [],
      }

      // ── 3a. DB 학습 규칙 우선 적용 ──
      const INCOME_CATS = [
        '렌트/운송수입', '지입 관리비/수수료', '보험금 수령', '매각/처분수입',
        '이자/잡이익', '투자원금 입금', '지입 초기비용/보증금', '렌터카 보증금(입금)', '대출 실행(입금)', '기타수입'
      ]
      for (const rule of dbRules) {
        const keyword = (rule.key || rule.keyword || '').toLowerCase()
        if (keyword && searchText.includes(keyword)) {
          const ruleCategory = rule.value?.category || rule.category || ''
          // ★ 입출금 방향 검증: 학습 규칙도 txType과 일치하는지 확인
          const isIncomeCat = INCOME_CATS.includes(ruleCategory)
          if ((txType === 'expense' && isIncomeCat) || (txType === 'income' && !isIncomeCat && ruleCategory !== '미분류')) {
            continue // 방향 불일치 규칙은 스킵
          }
          result.category = ruleCategory
          result.related_type = rule.related_type || null
          result.related_id = rule.related_id || null
          result.confidence = 95 // 학습된 규칙은 높은 신뢰도
          break
        }
      }

      // ── 3b. 카드 결제 매칭 (법인카드) — 다중 전략 + 이전 카드번호 포함 ──
      const pmLower = (tx.payment_method || '').toLowerCase()
      const isCard = pmLower === '카드' || pmLower === 'card' || pmLower.includes('카드') || pmLower.includes('card')
      if (isCard) {
        const rawCardNum = (tx.card_number || '').replace(/[\s-]/g, '')
        const digitsOnly = rawCardNum.replace(/\D/g, '')
        if (digitsOnly.length > 0) {
          console.log(`[classify] 카드 매칭 시도: tx.card_number="${tx.card_number}", digits="${digitsOnly}", 등록카드 ${cards.length}장`)
        }

        // 카드의 모든 번호 (현재 + 이전) 가져오기
        const getAllCardDigits = (c: any): string[] => {
          const nums = [(c.card_number || '')]
          const prev = c.previous_card_numbers || []
          for (const p of prev) { if (p) nums.push(p) }
          return nums.map((n: string) => n.replace(/\D/g, '')).filter((n: string) => n.length > 0)
        }

        // 전략 1: 뒷4자리 매칭 (현재 + 이전 번호)
        if (digitsOnly.length >= 4) {
          const last4 = digitsOnly.slice(-4)
          const matchedCard = cards.find((c: any) =>
            getAllCardDigits(c).some((d: string) => d.endsWith(last4))
          )
          if (matchedCard) tx.card_id = matchedCard.id
        }

        // 전략 2: 앞4자리로 매칭 (현재 + 이전 번호)
        if (!tx.card_id && digitsOnly.length >= 4) {
          const first4 = digitsOnly.slice(0, 4)
          const matchedCard = cards.find((c: any) =>
            getAllCardDigits(c).some((d: string) => d.startsWith(first4))
          )
          if (matchedCard) tx.card_id = matchedCard.id
        }

        // 전략 3: 부분 포함 매칭 (현재 + 이전 번호)
        if (!tx.card_id && rawCardNum.length >= 3) {
          const matchedCard = cards.find((c: any) => {
            const allNums = [(c.card_number || ''), ...(c.previous_card_numbers || [])]
              .map((n: string) => (n || '').replace(/[\s-]/g, '')).filter(Boolean)
            return allNums.some((cNum: string) =>
              cNum.includes(rawCardNum) || rawCardNum.includes(cNum.slice(-4))
            )
          })
          if (matchedCard) tx.card_id = matchedCard.id
        }
      }

      // 카드 매칭 결과 로그
      if (isCard && tx.card_id) {
        console.log(`[classify] ✅ 카드 매칭 성공: ${tx.card_number} → card_id=${tx.card_id}`)
      } else if (isCard && !tx.card_id && (tx.card_number || '').length > 0) {
        console.log(`[classify] ❌ 카드 매칭 실패: ${tx.card_number}`)
      }

      // ── 3b-2. 카드 배정 이력 기반 사용자 매칭 ──
      if (tx.card_id) {
        const cardHistory = (cardHistoryRes.data || []).filter((h: any) => h.card_id === tx.card_id)
        const txDate = tx.transaction_date ? new Date(tx.transaction_date) : null
        if (txDate && cardHistory.length > 0) {
          // 거래 날짜가 어느 배정 기간에 속하는지 확인
          const matchedHistory = cardHistory.find((h: any) => {
            const assignedAt = new Date(h.assigned_at)
            const unassignedAt = h.unassigned_at ? new Date(h.unassigned_at) : new Date('2099-12-31')
            return txDate >= assignedAt && txDate <= unassignedAt
          })
          if (matchedHistory) {
            tx.matched_employee_id = matchedHistory.employee_id
            tx.matched_employee_name = matchedHistory.employee_name
          }
        }
        // 히스토리에서 못 찾으면 현재 카드 배정자 사용
        if (!tx.matched_employee_id) {
          const card = cards.find((c: any) => c.id === tx.card_id)
          if (card?.assigned_employee_id) {
            tx.matched_employee_id = card.assigned_employee_id
            // 카드 별칭이나 holder_name 사용
            tx.matched_employee_name = card.holder_name || card.card_alias || null
          }
        }
      }

      // ── 3c. 키워드 기반 분류 (미분류인 경우) ──
      if (result.category === '미분류') {
        for (const rule of CATEGORY_RULES) {
          if (rule.type !== txType) continue
          if (rule.keywords.length === 0) continue // '기타'는 스킵
          for (const kw of rule.keywords) {
            if (searchText.includes(kw)) {
              result.category = rule.category
              result.confidence = 70
              break
            }
          }
          if (result.category !== '미분류') break
        }
      }

      // ── 3c-2. 양방향 키워드 매칭 (income/expense 무관 키워드도 체크) ──
      if (result.category === '미분류') {
        for (const rule of CATEGORY_RULES) {
          if (rule.keywords.length === 0) continue
          for (const kw of rule.keywords) {
            if (searchText.includes(kw)) {
              result.category = rule.category
              result.confidence = 55 // 방향 불일치로 낮은 신뢰도
              break
            }
          }
          if (result.category !== '미분류') break
        }
      }

      // ── 3d. 계약/급여/프리랜서/보험 매칭 (점수제) ──
      const matchCandidates: Array<{ target: MatchTarget; score: number }> = []

      for (const target of targets) {
        // 타입 방향 필터링
        if (target.txType !== 'both') {
          if (target.txType === 'income' && txType !== 'income') continue
          if (target.txType === 'expense' && txType !== 'expense') continue
        }

        let score = 0

        // 이름 유사도 — client_name + description 모두 검사
        const nameScore1 = nameSimilarity(clientName, target.name)
        const nameScore2 = nameSimilarity(description, target.name)
        const nameScore = Math.max(nameScore1, nameScore2)

        // 프리랜서/급여는 이름이 가장 중요 → 이름 가중치 강화
        const isPersonMatch = target.type === 'freelancer' || target.type === 'salary'
        if (isPersonMatch) {
          // 이름 매칭: 최대 65점 (기존 50점 → 강화)
          score += nameScore * 0.65
          // 이름 정확 매칭(≥90) 시 추가 보너스 20점
          if (nameScore >= 90) score += 20
          // 금액 근접도: 최대 25점 (기존 40점 → 축소)
          if (target.monthlyAmount > 0) {
            score += amountSimilarity(amount, target.monthlyAmount) * 0.25
          }
          // 날짜 근접도: 최대 10점
          if (target.paymentDay > 0) {
            score += dateSimilarity(tx.transaction_date, target.paymentDay) * 0.1
          }
        } else {
          // 계약/대출/보험 등은 기존 가중치 유지
          score += nameScore * 0.5
          if (target.monthlyAmount > 0) {
            score += amountSimilarity(amount, target.monthlyAmount) * 0.4
          }
          if (target.paymentDay > 0) {
            score += dateSimilarity(tx.transaction_date, target.paymentDay) * 0.1
          }
        }

        // 보너스: 키워드 타입별 추가 점수
        if (target.type === 'insurance' && searchText.match(/보험|손해|화재|해상/)) score += 15
        if (target.type === 'loan' && searchText.match(/캐피탈|파이낸셜|할부|대출|약정/)) score += 15
        if (target.type === 'salary' && searchText.match(/급여|월급|임금/)) score += 15
        if (target.type === 'freelancer' && searchText.match(/용역|외주|3\.3/)) score += 15

        if (score > 20) {
          matchCandidates.push({ target, score })
        }
      }

      // 점수순 정렬
      matchCandidates.sort((a, b) => b.score - a.score)

      // 최고 매칭
      if (matchCandidates.length > 0) {
        const best = matchCandidates[0]
        result.related_type = best.target.type
        result.related_id = best.target.id
        result.match_score = Math.round(best.score)
        result.matched_name = best.target.name

        // 매칭으로 카테고리 보정: 매칭 대상의 기본 카테고리 결정
        const getTargetCategory = (t: MatchTarget, dir: string) => {
          if (t.type === 'invest') return dir === 'income' ? '투자원금 입금' : '이자비용(대출/투자)'
          if (t.type === 'jiip') return dir === 'income' ? '지입 관리비/수수료' : '지입 수익배분금(출금)'
          return t.defaultCategory
        }
        const expectedCategory = getTargetCategory(best.target, txType)

        // ★ 카테고리-연결 일관성 검증: 매칭 대상과 AI 카테고리가 불일치하면 강제 보정
        // 예: 프리랜서가 매칭됐는데 '통신비'로 분류된 경우 → 용역비(3.3%)로 교정
        const CATEGORY_TYPE_MAP: Record<string, string[]> = {
          'freelancer': ['용역비(3.3%)', '일용직급여'],
          'salary': ['급여(정규직)', '4대보험(회사부담)'],
          'loan': ['차량할부/리스료', '원금상환', '이자비용(대출/투자)'],
          'invest': ['이자비용(대출/투자)', '투자원금 입금', '원금상환'],
          'jiip': ['지입 관리비/수수료', '지입 수익배분금(출금)', '지입 초기비용/보증금'],
          'insurance': ['차량보험료', '보험료(일반)', '화물공제/적재물보험'],
        }
        const allowedCats = CATEGORY_TYPE_MAP[best.target.type] || []
        const categoryMismatch = allowedCats.length > 0 && !allowedCats.includes(result.category)

        if (result.category === '미분류' || result.confidence < 70 || (categoryMismatch && best.score >= 50)) {
          // 매칭 점수가 충분하면 카테고리를 매칭 대상 기준으로 보정
          console.log(`[분류보정] ${tx.client_name}: "${result.category}" → "${expectedCategory}" (매칭: ${best.target.type}/${best.target.name}, 점수: ${Math.round(best.score)})`)
          result.category = expectedCategory
          result.confidence = Math.max(result.confidence, Math.min(best.score, 95))
        }

        // 차순위 후보 (alternatives)
        for (let i = 1; i < Math.min(matchCandidates.length, 4); i++) {
          const alt = matchCandidates[i]
          result.alternatives.push({
            category: alt.target.defaultCategory,
            confidence: Math.round(alt.score),
            related_type: alt.target.type,
            related_id: alt.target.id,
          })
        }
      }

      // ── 3e. 차량 매칭 (차번호 포함 여부) ──
      if (!result.related_id || result.related_type === 'insurance') {
        for (const car of cars) {
          const carNum = (car.number || '').replace(/\s/g, '')
          if (carNum && searchText.includes(carNum.toLowerCase())) {
            // 차량 직접 매칭
            if (!result.related_id) {
              result.related_type = 'car'
              result.related_id = car.id
              result.matched_name = car.number
              result.confidence = Math.max(result.confidence, 75)
            }
            break
          }
        }
      }

      // ── 3f. 스케줄 매칭 ──
      if (result.related_id && result.related_type && ['jiip', 'invest', 'loan'].includes(result.related_type)) {
        const candidateSchedules = schedules.filter(s =>
          s.contract_type === result.related_type &&
          s.contract_id === result.related_id &&
          s.status === 'pending'
        )

        if (candidateSchedules.length > 0) {
          const txDate = new Date(tx.transaction_date).getTime()
          candidateSchedules.sort((a, b) => {
            const diffA = Math.abs(new Date(a.payment_date).getTime() - txDate)
            const diffB = Math.abs(new Date(b.payment_date).getTime() - txDate)
            return diffA - diffB
          })
          result.matched_schedule_id = candidateSchedules[0].id
          // 스케줄이 연결되면 신뢰도 추가 보너스
          result.confidence = Math.min(result.confidence + 10, 100)
        }
      }

      // 신뢰도/등급은 GPT 분류 후 재계산
      return {
        ...tx,
        category: result.category,
        confidence: result.confidence,
        classification_tier: result.classification_tier,
        related_type: result.related_type,
        related_id: result.related_id,
        matched_schedule_id: result.matched_schedule_id,
        match_score: result.match_score,
        matched_contract_name: result.matched_name,
        alternatives: result.alternatives,
        card_id: tx.card_id || null,
      }
    })

    // ── 3h. Gemini AI 분류 (미분류 & 낮은 신뢰도 건) ──
    const unclassifiedItems = enriched
      .map((tx: any, idx: number) => ({ ...tx, _idx: idx }))
      .filter((tx: any) => tx.category === '미분류' || tx.category === '기타' || tx.confidence < 50)
      .map((tx: any) => ({
        idx: tx._idx,
        client_name: tx.client_name || '',
        description: tx.description || '',
        amount: tx.amount || 0,
        type: tx.type || 'expense',
        payment_method: tx.payment_method || '',
        transaction_date: tx.transaction_date || '',
      }))

    if (unclassifiedItems.length > 0) {
      const allCats = CATEGORY_RULES.map(r => r.category)
      const uniqueCats = [...new Set(allCats)]
      const gptResults = await classifyWithGemini(unclassifiedItems, uniqueCats)

      for (const gr of gptResults) {
        if (enriched[gr.idx]) {
          enriched[gr.idx].category = gr.category
          enriched[gr.idx].confidence = gr.confidence
          enriched[gr.idx].classification_tier = gr.confidence >= 80 ? 'auto' : gr.confidence >= 60 ? 'review' : 'manual'
        }
      }
    }

    // ── 3i. 최종 등급 결정 (GPT 미처리 건 포함) ──
    for (const tx of enriched) {
      if (!tx.classification_tier || tx.classification_tier === 'manual') {
        if (tx.confidence >= 80) tx.classification_tier = 'auto'
        else if (tx.confidence >= 60) tx.classification_tier = 'review'
        else tx.classification_tier = 'manual'
      }
    }

    // ── 3j. 디버그 로깅 ──
    console.log(`[classify] 총 ${enriched.length}건 처리 완료`)
    console.log(`[classify] 카테고리 분포:`, enriched.reduce((acc: Record<string, number>, t: any) => {
      acc[t.category] = (acc[t.category] || 0) + 1; return acc
    }, {}))
    console.log(`[classify] 연결대상 매칭:`, enriched.filter((t: any) => t.related_id).length, '건')
    console.log(`[classify] 카드 매칭:`, enriched.filter((t: any) => t.card_id).length, '건')

    // ── 4. 요약 통계 ──
    const summary = {
      total: enriched.length,
      auto: enriched.filter((t: any) => t.classification_tier === 'auto').length,
      review: enriched.filter((t: any) => t.classification_tier === 'review').length,
      manual: enriched.filter((t: any) => t.classification_tier === 'manual').length,
      matched: enriched.filter((t: any) => t.related_id).length,
      categorized: enriched.filter((t: any) => t.category !== '미분류').length,
      scheduleLinked: enriched.filter((t: any) => t.matched_schedule_id).length,
    }

    // ── 5. 모든 분류 결과를 classification_queue에 저장 (phase1 스키마) ──
    // phase1 컬럼: company_id, transaction_id, ai_category, ai_confidence,
    //   ai_matched_type, ai_matched_id, ai_matched_name, alternatives,
    //   final_category, final_matched_type, final_matched_id, status
    const queueItems = enriched.map((t: any) => ({
      company_id,
      ai_category: t.category,
      ai_confidence: t.confidence || 0,
      ai_matched_type: t.related_type || null,
      ai_matched_id: t.related_id || null,
      ai_matched_name: t.matched_contract_name || null,
      alternatives: {
        candidates: t.alternatives || [],
        source_data: {
          transaction_date: t.transaction_date,
          client_name: t.client_name,
          description: t.description,
          amount: t.amount,
          type: t.type,
          payment_method: t.payment_method,
          card_number: t.card_number || '',
          is_cancel: t.is_cancel || false,
          card_id: t.card_id || null,
          matched_employee_id: t.matched_employee_id || null,
          matched_employee_name: t.matched_employee_name || null,
          matched_contract_name: t.matched_contract_name || null,
          approval_number: t.approval_number || '',
          currency: t.currency || 'KRW',
          original_amount: t.original_amount || null,
        },
      },
      status: 'pending',
    }))

    // queue에 저장하고 ID 반환
    const insertedQueueIds: string[] = []
    if (queueItems.length > 0) {
      for (let i = 0; i < queueItems.length; i += 50) {
        const batch = queueItems.slice(i, i + 50)
        const { data: inserted, error } = await sb.from('classification_queue').insert(batch).select('id')
        if (error) console.error('Classification queue insert error:', error.message)
        if (inserted) insertedQueueIds.push(...inserted.map((r: any) => r.id))
      }
    }

    // enriched에 queue_id 매핑
    for (let i = 0; i < enriched.length; i++) {
      if (insertedQueueIds[i]) {
        enriched[i]._queue_id = insertedQueueIds[i]
      }
    }

    return NextResponse.json({ transactions: enriched, summary })

  } catch (error: any) {
    console.error('Classify API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── GET: 분류 검토 조회 (classification_queue 우선, fallback: transactions) ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const company_id = searchParams.get('company_id')
    const status = searchParams.get('status') || 'pending'
    const limit = Number(searchParams.get('limit') || 50)

    if (!company_id) {
      return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // ── 1차: classification_queue에서 조회 ──
    // Supabase 기본 제한이 1000행이므로, limit > 1000이면 페이지네이션으로 가져옴
    const fetchAllFromQueue = async () => {
      let baseQuery = sb
        .from('classification_queue')
        .select('*', { count: 'exact' })
        .eq('company_id', company_id)

      if (status === 'pending') {
        baseQuery = baseQuery.in('status', ['pending', 'auto_confirmed'])
      } else if (status === 'confirmed') {
        baseQuery = baseQuery.eq('status', 'confirmed')
      }

      if (limit <= 1000) {
        const { data, error, count } = await baseQuery
          .order('created_at', { ascending: false })
          .limit(limit)
        return { data, error, count }
      }

      // 페이지네이션: 1000건씩 가져오기
      let allData: any[] = []
      let totalCount = 0
      let page = 0
      const pageSize = 1000

      while (allData.length < limit) {
        const from = page * pageSize
        const to = Math.min(from + pageSize - 1, limit - 1)

        let pageQuery = sb
          .from('classification_queue')
          .select('*', { count: 'exact' })
          .eq('company_id', company_id)

        if (status === 'pending') {
          pageQuery = pageQuery.in('status', ['pending', 'auto_confirmed'])
        } else if (status === 'confirmed') {
          pageQuery = pageQuery.eq('status', 'confirmed')
        }

        const { data, error, count } = await pageQuery
          .order('created_at', { ascending: false })
          .range(from, to)

        if (error) return { data: null, error, count: 0 }
        totalCount = count || 0
        if (!data || data.length === 0) break
        allData = [...allData, ...data]
        if (data.length < pageSize) break // 더 이상 데이터 없음
        page++
      }

      return { data: allData, error: null, count: totalCount }
    }

    const { data: queueData, error: queueError, count: queueCount } = await fetchAllFromQueue()

    console.log(`[GET classify] status=${status}, queueData=${queueData?.length || 0}건, queueCount=${queueCount}, error=${queueError?.message || 'none'}`)
    if (status === 'confirmed' && queueData) {
      console.log(`[GET classify] confirmed 항목 상세:`, queueData.map((q: any) => `${q.id.substring(0,8)}(status=${q.status}, cat=${q.final_category})`))
    }

    if (!queueError && queueData && queueData.length > 0) {
      // 디버깅: 첫 번째 레코드의 alternatives 구조 확인
      const firstQ = queueData[0]
      console.log('[GET classify] 첫 번째 레코드 디버깅:')
      console.log('  alternatives type:', typeof firstQ.alternatives)
      console.log('  alternatives value (100자):', JSON.stringify(firstQ.alternatives)?.substring(0, 200))
      console.log('  source_data 존재:', !!firstQ.source_data)
      console.log('  컬럼 키 목록:', Object.keys(firstQ).join(', '))

      const items = queueData.map((q: any) => {
        // ── alternatives에서 source_data 추출 (다양한 형식 대응) ──
        let altData: any = {}
        let sd: any = {}
        let candidates: any[] = []

        // 1) alternatives 파싱
        const rawAlt = q.alternatives
        if (typeof rawAlt === 'string') {
          try {
            const parsed = JSON.parse(rawAlt)
            // 2중 stringify 대비: 파싱 결과가 또 문자열이면 한번 더 파싱
            altData = typeof parsed === 'string' ? JSON.parse(parsed) : parsed
          } catch (e) {
            console.warn('[GET classify] alternatives JSON.parse 실패:', e)
            altData = {}
          }
        } else if (rawAlt && typeof rawAlt === 'object') {
          altData = rawAlt
        }

        // 2) source_data 찾기 (여러 경로 시도)
        if (q.source_data && typeof q.source_data === 'object' && Object.keys(q.source_data).length > 0) {
          // 055 스키마: source_data 컬럼이 직접 존재
          sd = q.source_data
        } else if (altData.source_data && typeof altData.source_data === 'object') {
          // phase1 스키마: alternatives.source_data
          sd = altData.source_data
        } else if (altData.transaction_date || altData.client_name || altData.amount) {
          // alternatives 자체가 source_data인 경우
          sd = altData
        }

        // 3) candidates 찾기
        if (Array.isArray(altData.candidates)) {
          candidates = altData.candidates
        } else if (Array.isArray(altData)) {
          candidates = altData
        } else if (Array.isArray(q.alternatives)) {
          candidates = q.alternatives
        }

        // 디버깅 (첫 건만)
        if (q.id === firstQ.id) {
          console.log('  추출된 sd 키:', Object.keys(sd).join(', '))
          console.log('  sd.transaction_date:', sd.transaction_date)
          console.log('  sd.client_name:', sd.client_name)
          console.log('  sd.amount:', sd.amount)
          console.log('  sd.payment_method:', sd.payment_method)
        }

        return {
          id: q.id,
          company_id: q.company_id,
          transaction_id: q.transaction_id,
          source_type: q.source_type || (sd.payment_method === '카드' ? 'card_statement' : 'bank_statement'),
          source_data: {
            transaction_date: sd.transaction_date || '',
            client_name: sd.client_name || '',
            description: sd.description || '',
            amount: sd.amount || 0,
            type: sd.type || 'expense',
            payment_method: sd.payment_method || '',
            card_number: sd.card_number || '',
            card_id: sd.card_id || null,
            is_cancel: sd.is_cancel || false,
            matched_employee_id: sd.matched_employee_id || null,
            matched_employee_name: sd.matched_employee_name || null,
          },
          ai_category: q.ai_category || q.final_category || '미분류',
          ai_confidence: q.ai_confidence || 0,
          ai_related_type: q.ai_matched_type || null,
          ai_related_id: q.ai_matched_id || null,
          ai_matched_name: q.ai_matched_name || null,
          alternatives: candidates,
          status: q.status,
          final_category: q.final_category || null,
          is_cancel: sd.is_cancel || false,
          card_id: sd.card_id || null,
          card_number: sd.card_number || '',
          matched_employee_id: sd.matched_employee_id || null,
          matched_employee_name: sd.matched_employee_name || null,
          matched_contract_name: sd.matched_contract_name || q.ai_matched_name || null,
          _source: 'queue',
        }
      })
      return NextResponse.json({ items, total: queueCount || 0, source: 'classification_queue' })
    }

    // ── 2차 fallback: transactions 테이블에서 조회 ──
    // category 컬럼 존재 여부를 먼저 확인
    let txQuery = sb
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('company_id', company_id)

    // category 컬럼 필터는 사용하지 않음 (존재하지 않을 수 있음)
    // 카운트 정확성을 위해 전체 로드 후 앱 레벨에서 필터링
    const { data: txData, error: txError, count: txCount } = await txQuery
      .order('created_at', { ascending: false })
      .limit(5000)

    if (txError) throw txError

    const allItems = (txData || []).map((tx: any) => {
      const cat = tx.category || '미분류'
      const isPending = !tx.category || tx.category === '미분류' || tx.category === '기타' || tx.category === ''
      return {
        id: tx.id,
        company_id: tx.company_id,
        source_data: {
          transaction_date: tx.transaction_date || '',
          client_name: tx.client_name || '',
          description: tx.description || '',
          amount: tx.amount || 0,
          type: tx.type || 'expense',
          payment_method: tx.payment_method || '',
          card_number: tx.card_number || '',
        },
        ai_category: cat,
        ai_confidence: tx.confidence || 0,
        ai_related_type: tx.related_type || null,
        ai_related_id: tx.related_id || null,
        alternatives: [],
        status: isPending ? 'pending' : 'confirmed',
        final_category: isPending ? null : cat,
        is_cancel: tx.is_cancel || false,
        _source: 'transactions',
      }
    })

    // 전체 데이터에서 정확한 카운트 계산
    const pendingCount = allItems.filter((i: any) => i.status === 'pending').length
    const confirmedCount = allItems.filter((i: any) => i.status === 'confirmed').length

    // status 필터링
    const filtered = status === 'all' ? allItems :
      allItems.filter((i: any) => {
        if (status === 'pending') return i.status === 'pending'
        if (status === 'confirmed') return i.status === 'confirmed'
        return true
      })

    return NextResponse.json({
      items: filtered.slice(0, limit),
      total: status === 'pending' ? pendingCount : status === 'confirmed' ? confirmedCount : (txCount || 0),
      source: 'transactions',
    })
  } catch (error: any) {
    console.error('GET classify error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── PUT: 재매칭 (classification_queue 항목의 연결만 다시 실행) ──
export async function PUT(request: NextRequest) {
  try {
    const { company_id } = await request.json()
    if (!company_id) return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })

    const sb = getSupabaseAdmin()

    // 1. classification_queue에서 pending 항목 가져오기
    // 주의: transaction_date 등은 직접 컬럼이 아니라 alternatives->source_data 안에 있음
    const { data: queueItems, error: qErr } = await sb
      .from('classification_queue')
      .select('*')
      .eq('company_id', company_id)
      .in('status', ['pending', 'auto_confirmed'])
      .order('created_at', { ascending: false })

    if (qErr) throw qErr
    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({ message: '재매칭할 항목이 없습니다.', updated: 0, total: 0 })
    }

    // 2. 매칭 대상 데이터 로드
    const safeQ = async (query: any) => {
      try { const r = await query; return r?.error ? { data: [] } : r } catch { return { data: [] } }
    }
    const [jiipRes, investRes, loanRes, salaryRes, freelancerRes, insuranceRes, carRes] = await Promise.all([
      safeQ(sb.from('jiip_contracts').select('*').eq('company_id', company_id)),
      safeQ(sb.from('general_investments').select('*').eq('company_id', company_id)),
      safeQ(sb.from('loans').select('*').eq('company_id', company_id)),
      safeQ(sb.from('employee_salaries').select('*').eq('company_id', company_id)),
      safeQ(sb.from('freelancers').select('*').eq('company_id', company_id)),
      safeQ(sb.from('insurance_contracts').select('*').eq('company_id', company_id)),
      safeQ(sb.from('cars').select('*').eq('company_id', company_id)),
    ])

    const filterActive = (arr: any[]) => arr.filter(r => !r.status || r.status === 'active')
    const targets: MatchTarget[] = []

    for (const c of filterActive(jiipRes.data || [])) {
      targets.push({ id: c.id, type: 'jiip', name: c.investor_name || '', monthlyAmount: Number(c.admin_fee) || 0, paymentDay: Number(c.payout_day) || 10, defaultCategory: '지입 관리비/수수료', txType: 'both' })
    }
    for (const c of filterActive(investRes.data || [])) {
      const mi = Math.round((Number(c.invest_amount) || 0) * (Number(c.interest_rate) || 0) / 100 / 12)
      targets.push({ id: c.id, type: 'invest', name: c.investor_name || '', monthlyAmount: mi, paymentDay: Number(c.payment_day) || 10, defaultCategory: '이자비용(대출/투자)', txType: 'both' })
    }
    for (const c of filterActive(loanRes.data || [])) {
      targets.push({ id: c.id, type: 'loan', name: c.finance_name || '', monthlyAmount: Number(c.monthly_payment) || 0, paymentDay: Number(c.payment_date) || 10, defaultCategory: '차량할부/리스료', txType: 'expense' })
    }
    for (const s of (salaryRes.data || []).filter((r: any) => r.is_active !== false)) {
      const empName = (s.profiles as any)?.name || s.name || ''
      targets.push({ id: s.employee_id || s.id, type: 'salary', name: empName, monthlyAmount: Number(s.base_salary || s.salary) || 0, paymentDay: Number(s.pay_day || s.payment_day) || 25, defaultCategory: '급여(정규직)', txType: 'expense', extra: { employee_id: s.employee_id } })
    }
    for (const f of filterActive(freelancerRes.data || [])) {
      targets.push({ id: f.id, type: 'freelancer', name: f.name || '', monthlyAmount: Number(f.default_fee) || 0, paymentDay: 0, defaultCategory: '용역비(3.3%)', txType: 'expense', extra: { service_type: f.service_type } })
    }
    for (const ins of insuranceRes.data || []) {
      targets.push({ id: ins.id, type: 'insurance', name: ins.company || ins.product_name || '', monthlyAmount: Math.round((Number(ins.total_premium) || 0) / 12), paymentDay: 0, defaultCategory: '차량보험료', txType: 'expense', extra: { car_id: ins.car_id } })
    }
    const cars = (carRes.data || []) as any[]

    // 3. 각 큐 항목에 대해 재매칭
    // classification_queue의 거래 데이터는 alternatives.source_data 안에 저장됨
    let updated = 0
    for (const item of queueItems) {
      const srcData = item.alternatives?.source_data || {}
      const clientName = srcData.client_name || ''
      const description = srcData.description || ''
      const searchText = `${clientName} ${description}`.toLowerCase()
      const amount = Math.abs(Number(srcData.amount) || 0)
      const txType = srcData.type || 'expense'
      const txDate = srcData.transaction_date || ''

      const matchCandidates: Array<{ target: MatchTarget; score: number }> = []

      for (const target of targets) {
        if (target.txType !== 'both') {
          if (target.txType === 'income' && txType !== 'income') continue
          if (target.txType === 'expense' && txType !== 'expense') continue
        }

        let score = 0
        const nameScore1 = nameSimilarity(clientName, target.name)
        const nameScore2 = nameSimilarity(description, target.name)
        const nameScore = Math.max(nameScore1, nameScore2)

        const isPersonMatch = target.type === 'freelancer' || target.type === 'salary'
        if (isPersonMatch) {
          score += nameScore * 0.65
          if (nameScore >= 90) score += 20
          if (target.monthlyAmount > 0) score += amountSimilarity(amount, target.monthlyAmount) * 0.25
          if (target.paymentDay > 0 && txDate) score += dateSimilarity(txDate, target.paymentDay) * 0.1
        } else {
          score += nameScore * 0.5
          if (target.monthlyAmount > 0) score += amountSimilarity(amount, target.monthlyAmount) * 0.4
          if (target.paymentDay > 0 && txDate) score += dateSimilarity(txDate, target.paymentDay) * 0.1
        }

        if (target.type === 'insurance' && searchText.match(/보험|손해|화재|해상/)) score += 15
        if (target.type === 'loan' && searchText.match(/캐피탈|파이낸셜|할부|대출|약정/)) score += 15
        if (target.type === 'salary' && searchText.match(/급여|월급|임금/)) score += 15
        if (target.type === 'freelancer' && searchText.match(/용역|외주|3\.3/)) score += 15

        if (score > 20) matchCandidates.push({ target, score })
      }

      matchCandidates.sort((a, b) => b.score - a.score)

      // 차량 매칭
      let carMatch: { type: string; id: string; name: string } | null = null
      for (const car of cars) {
        const carNum = (car.number || '').replace(/\s/g, '')
        if (carNum && searchText.includes(carNum.toLowerCase())) {
          carMatch = { type: 'car', id: car.id, name: car.number }
          break
        }
      }

      const best = matchCandidates.length > 0 ? matchCandidates[0] : null
      const newRelType = best ? best.target.type : carMatch ? carMatch.type : null
      const newRelId = best ? best.target.id : carMatch ? carMatch.id : null
      const newMatchScore = best ? Math.round(best.score) : carMatch ? 75 : 0
      const newMatchedName = best ? best.target.name : carMatch ? carMatch.name : null

      // ★ 카테고리-연결 일관성 보정 (재매칭 시에도 카테고리 교정)
      const CATEGORY_TYPE_MAP_RE: Record<string, string[]> = {
        'freelancer': ['용역비(3.3%)', '일용직급여'],
        'salary': ['급여(정규직)', '4대보험(회사부담)'],
        'loan': ['차량할부/리스료', '원금상환', '이자비용(대출/투자)'],
        'invest': ['이자비용(대출/투자)', '투자원금 입금', '원금상환'],
        'jiip': ['지입 관리비/수수료', '지입 수익배분금(출금)', '지입 초기비용/보증금'],
        'insurance': ['차량보험료', '보험료(일반)', '화물공제/적재물보험'],
      }
      let newCategory: string | null = null
      if (best && best.score >= 50) {
        const currentCat = item.ai_category || item.final_category || ''
        const allowedCats = CATEGORY_TYPE_MAP_RE[best.target.type] || []
        if (allowedCats.length > 0 && !allowedCats.includes(currentCat)) {
          // 카테고리가 매칭 대상과 불일치 → 기본 카테고리로 보정
          newCategory = best.target.defaultCategory
          console.log(`[재매칭-보정] ${clientName}: "${currentCat}" → "${newCategory}" (매칭: ${best.target.type}/${best.target.name})`)
        }
      }

      // 기존 연결과 다르거나 카테고리 보정 필요시 업데이트
      if (newRelType && newRelId && (item.ai_matched_type !== newRelType || item.ai_matched_id !== newRelId || newCategory)) {
        const updateData: any = {
          ai_matched_type: newRelType,
          ai_matched_id: newRelId,
          ai_matched_name: newMatchedName,
        }
        if (newCategory) {
          updateData.ai_category = newCategory
        }
        const { error: upErr } = await sb
          .from('classification_queue')
          .update(updateData)
          .eq('id', item.id)

        if (!upErr) updated++
      }
    }

    console.log(`[재매칭] ${queueItems.length}건 중 ${updated}건 업데이트`)
    return NextResponse.json({ message: `${updated}건 재매칭 완료`, updated, total: queueItems.length })
  } catch (error: any) {
    console.error('재매칭 API 오류:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── PATCH: 분류 확정 (classification_queue 업데이트) ──
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()

    // ★ 일괄분류 + 학습: bulk_classify 모드
    if (body.bulk_classify && Array.isArray(body.queue_ids) && body.final_category) {
      const sb = getSupabaseAdmin()
      const { queue_ids, final_category, save_rules } = body
      const PENDING_CATS = ['기타', '미분류', '']
      const newStatus = PENDING_CATS.includes(final_category) ? 'pending' : 'confirmed'

      // 일괄 카테고리 업데이트
      const { error: bulkErr } = await sb
        .from('classification_queue')
        .update({ final_category, status: newStatus })
        .in('id', queue_ids)
      if (bulkErr) throw bulkErr

      // 학습 규칙 저장 (save_rules가 true이고 keywords 배열이 있을 때)
      let rulesSaved = 0
      if (save_rules && Array.isArray(body.keywords)) {
        const uniqueKeywords = [...new Set(body.keywords.filter((k: string) => k && k.trim()))] as string[]
        for (const keyword of uniqueKeywords) {
          try {
            await sb.from('finance_rules').upsert({
              keyword: keyword.toLowerCase().trim(),
              category: final_category,
              related_type: body.final_related_type || null,
              related_id: body.final_related_id || null,
            }, { onConflict: 'keyword' })
            rulesSaved++
          } catch (e) {
            console.error('Rule save error for keyword:', keyword, e)
          }
        }
      }

      console.log(`[PATCH classify] 일괄분류: ${queue_ids.length}건 → ${final_category} (status: ${newStatus}), 규칙 ${rulesSaved}개 저장`)
      return NextResponse.json({ success: true, updated: queue_ids.length, rules_saved: rulesSaved })
    }

    const { queue_id, final_category, final_related_type, final_related_id, save_as_rule, rule_keyword } = body

    if (!queue_id || !final_category) {
      return NextResponse.json({ error: 'queue_id, final_category 필요' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // classification_queue 업데이트 — 카테고리에 따라 status 결정
    const PENDING_CATS = ['기타', '미분류', '']
    const newStatus = PENDING_CATS.includes(final_category) ? 'pending' : 'confirmed'
    const updateData: Record<string, any> = {
      final_category,
      status: newStatus,
    }
    // ★ final_related_type/id가 있으면 classification_queue에도 저장
    if (final_related_type !== undefined) updateData.final_related_type = final_related_type || null
    if (final_related_id !== undefined) updateData.final_related_id = final_related_id || null

    console.log(`[PATCH classify] queue_id=${queue_id}, final_category=${final_category}, newStatus=${newStatus}, related_type=${final_related_type}, related_id=${final_related_id}`)

    const { data: updated, error: updateErr } = await sb
      .from('classification_queue')
      .update(updateData)
      .eq('id', queue_id)
      .select()
      .maybeSingle()

    if (updateErr) throw updateErr
    if (!updated) {
      console.log(`[PATCH classify] queue_id=${queue_id} 레코드를 찾을 수 없음`)
      return NextResponse.json({ error: `queue_id ${queue_id} 레코드를 찾을 수 없습니다` }, { status: 404 })
    }

    // 업데이트 후 confirmed 총 수 확인 (디버깅)
    try {
      const { count: confirmedTotal } = await sb
        .from('classification_queue')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', updated.company_id)
        .eq('status', 'confirmed')
      console.log(`[PATCH classify] 업데이트 완료. updated.status=${updated.status}, DB confirmed 총 수=${confirmedTotal}`)
    } catch (e) {
      console.log(`[PATCH classify] 업데이트 완료. updated.status=${updated.status} (count 쿼리 실패)`)
    }

    // 규칙 학습 (선택적)
    if (save_as_rule && rule_keyword) {
      try {
        await sb.from('finance_rules').upsert({
          keyword: rule_keyword.toLowerCase(),
          category: final_category,
          related_type: final_related_type || null,
          related_id: final_related_id || null,
        }, { onConflict: 'keyword' })
      } catch (e) {
        console.error('Rule save error:', e)
      }
    }

    // ★ 되돌리기(pending) 시 → transactions 테이블에서 매칭 거래 삭제 + 투자/지입 금액 재계산
    if (newStatus === 'pending' && updated) {
      // 되돌리기 대상의 related_type/related_id 파악 (ai_matched 또는 final_related)
      const revertRelatedType = updated.ai_matched_type || final_related_type || null
      const revertRelatedId = updated.ai_matched_id || final_related_id || null

      try {
        // alternatives에서 source_data 추출 (다양한 형식 대응)
        let sd: any = {}
        if (updated.source_data && typeof updated.source_data === 'object' && Object.keys(updated.source_data).length > 0) {
          sd = updated.source_data
        } else if (updated.alternatives) {
          const alt = typeof updated.alternatives === 'string' ? JSON.parse(updated.alternatives) : updated.alternatives
          if (alt?.source_data) sd = alt.source_data
          else if (alt?.transaction_date) sd = alt
        }

        const txDate = sd?.transaction_date || updated.transaction_date
        const clientName = sd?.client_name || updated.client_name
        const amount = Math.abs(Number(sd?.amount || updated.amount || 0))
        const companyId = updated.company_id

        if (txDate && companyId) {
          // 날짜+거래처+금액으로 매칭되는 transactions 삭제
          // related_type/related_id가 있으면 더 정확한 매칭으로 삭제
          let deleteQuery = sb
            .from('transactions')
            .delete()
            .eq('company_id', companyId)
            .eq('transaction_date', txDate)
            .eq('client_name', clientName || '')
            .eq('amount', amount)

          if (revertRelatedType && revertRelatedId) {
            deleteQuery = deleteQuery
              .eq('related_type', revertRelatedType)
              .eq('related_id', revertRelatedId)
          }

          const { error: delErr } = await deleteQuery

          if (delErr) console.error('[classify PATCH] 되돌리기 transactions 삭제 오류:', delErr)
          else console.log(`[classify PATCH] 되돌리기: transactions에서 ${txDate}/${clientName}/${amount} (${revertRelatedType || 'no-type'}/${revertRelatedId || 'no-id'}) 삭제`)
        }
      } catch (e) {
        console.error('[classify PATCH] 되돌리기 transactions 삭제 처리 오류:', e)
      }

      // ★ 되돌리기 후 투자자 금액 재계산
      if (revertRelatedType === 'invest' && revertRelatedId) {
        try {
          const { data: allTxs } = await sb
            .from('transactions')
            .select('amount, type')
            .eq('related_type', 'invest')
            .eq('related_id', revertRelatedId)
          const netAmount = (allTxs || []).reduce((acc: number, cur: any) => {
            return acc + (cur.type === 'income' ? Math.abs(cur.amount || 0) : -Math.abs(cur.amount || 0))
          }, 0)
          await sb.from('general_investments')
            .update({ invest_amount: netAmount })
            .eq('id', revertRelatedId)
          console.log(`[classify PATCH] 되돌리기: 투자자 ${revertRelatedId} 순합계 재계산: ${netAmount}`)
        } catch (e) {
          console.error('[classify PATCH] 되돌리기 투자자 금액 재계산 오류:', e)
        }
      }

      // ★ 되돌리기 후 지입 계약 금액 재계산
      if (revertRelatedType === 'jiip' && revertRelatedId) {
        try {
          const { data: allTxs } = await sb
            .from('transactions')
            .select('amount, type')
            .eq('related_type', 'jiip')
            .eq('related_id', revertRelatedId)
          const netAmount = (allTxs || []).reduce((acc: number, cur: any) => {
            return acc + (cur.type === 'income' ? Math.abs(cur.amount || 0) : -Math.abs(cur.amount || 0))
          }, 0)
          await sb.from('jiip_contracts')
            .update({ invest_amount: netAmount })
            .eq('id', revertRelatedId)
          console.log(`[classify PATCH] 되돌리기: 지입 ${revertRelatedId} 순합계 재계산: ${netAmount}`)
        } catch (e) {
          console.error('[classify PATCH] 되돌리기 지입 금액 재계산 오류:', e)
        }
      }
    }

    // ★ 확정 시 → 매칭되는 transaction의 category/related_type/related_id 업데이트
    if (newStatus === 'confirmed' && updated) {
      try {
        // source_data에서 거래 정보 추출
        let sd: any = {}
        if (updated.source_data && typeof updated.source_data === 'object' && Object.keys(updated.source_data).length > 0) {
          sd = updated.source_data
        } else if (updated.alternatives) {
          const alt = typeof updated.alternatives === 'string' ? JSON.parse(updated.alternatives) : updated.alternatives
          if (alt?.source_data) sd = alt.source_data
          else if (alt?.transaction_date) sd = alt
        }

        const txDate = sd?.transaction_date || updated.transaction_date
        const clientName = sd?.client_name || updated.client_name
        const amount = Math.abs(Number(sd?.amount || updated.amount || 0))
        const companyId = updated.company_id

        if (txDate && companyId) {
          const txUpdateData: Record<string, any> = { category: final_category }
          if (final_related_type !== undefined) txUpdateData.related_type = final_related_type || null
          if (final_related_id !== undefined) txUpdateData.related_id = final_related_id || null

          const { error: txUpdateErr, count: txUpdated } = await sb
            .from('transactions')
            .update(txUpdateData)
            .eq('company_id', companyId)
            .eq('transaction_date', txDate)
            .eq('client_name', clientName || '')
            .eq('amount', amount)

          if (txUpdateErr) console.error('[classify PATCH] 확정: transactions 업데이트 오류:', txUpdateErr)
          else console.log(`[classify PATCH] 확정: transactions 업데이트 (${txDate}/${clientName}/${amount}) → category=${final_category}, related=${final_related_type}/${final_related_id}, count=${txUpdated}`)
        }
      } catch (e) {
        console.error('[classify PATCH] 확정: transactions 업데이트 처리 오류:', e)
      }
    }

    // ★ 투자 연결 거래 확정 시 → 투자자 순합계(입금-출금) 재계산
    if (newStatus === 'confirmed' && final_related_type === 'invest' && final_related_id) {
      try {
        const { data: allTxs } = await sb
          .from('transactions')
          .select('amount, type')
          .eq('related_type', 'invest')
          .eq('related_id', final_related_id)
        if (allTxs && allTxs.length > 0) {
          const netAmount = allTxs.reduce((acc: number, cur: any) => {
            return acc + (cur.type === 'income' ? Math.abs(cur.amount || 0) : -Math.abs(cur.amount || 0))
          }, 0)
          await sb.from('general_investments')
            .update({ invest_amount: netAmount })
            .eq('id', final_related_id)
          console.log(`[classify PATCH] 투자자 ${final_related_id} 순합계 업데이트: ${netAmount}`)
        }
      } catch (e) {
        console.error('[classify PATCH] 투자자 금액 업데이트 오류:', e)
      }
    }

    // ★ 지입 연결 거래 확정 시 → 지입 계약 순합계 재계산
    if (newStatus === 'confirmed' && final_related_type === 'jiip' && final_related_id) {
      try {
        const { data: allTxs } = await sb
          .from('transactions')
          .select('amount, type')
          .eq('related_type', 'jiip')
          .eq('related_id', final_related_id)
        if (allTxs && allTxs.length > 0) {
          const netAmount = allTxs.reduce((acc: number, cur: any) => {
            return acc + (cur.type === 'income' ? Math.abs(cur.amount || 0) : -Math.abs(cur.amount || 0))
          }, 0)
          await sb.from('jiip_contracts')
            .update({ invest_amount: netAmount })
            .eq('id', final_related_id)
          console.log(`[classify PATCH] 지입 ${final_related_id} 순합계 업데이트: ${netAmount}`)
        }
      } catch (e) {
        console.error('[classify PATCH] 지입 금액 업데이트 오류:', e)
      }
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (error: any) {
    console.error('PATCH classify error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── DELETE: 분류 항목 일괄 삭제 (classification_queue + transactions 양쪽) ──
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { company_id, status, ids } = body

    if (!company_id) {
      return NextResponse.json({ error: 'company_id is required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    let deleted = 0

    // 삭제된 transactions의 related 정보를 수집하여 금액 재계산에 사용
    const affectedRelated = new Map<string, { type: string; id: string }>()

    if (ids && Array.isArray(ids) && ids.length > 0) {
      // 특정 ID들만 삭제 — 양쪽 테이블에서 시도
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50)

        // classification_queue에서 삭제 전 related 정보 수집
        const { data: queueItems } = await sb.from('classification_queue')
          .select('id, ai_matched_type, ai_matched_id')
          .eq('company_id', company_id)
          .in('id', batch)
        if (queueItems) {
          for (const q of queueItems) {
            if (q.ai_matched_type && q.ai_matched_id && ['invest', 'jiip'].includes(q.ai_matched_type)) {
              affectedRelated.set(`${q.ai_matched_type}:${q.ai_matched_id}`, { type: q.ai_matched_type, id: q.ai_matched_id })
            }
          }
        }

        // classification_queue에서 삭제
        const { data: qd } = await sb.from('classification_queue')
          .delete()
          .eq('company_id', company_id)
          .in('id', batch)
          .select('id')
        deleted += (qd?.length || 0)

        // transactions에서 삭제 전 related 정보 수집
        const { data: txItems } = await sb.from('transactions')
          .select('id, related_type, related_id')
          .eq('company_id', company_id)
          .in('id', batch)
        if (txItems) {
          for (const t of txItems) {
            if (t.related_type && t.related_id && ['invest', 'jiip'].includes(t.related_type)) {
              affectedRelated.set(`${t.related_type}:${t.related_id}`, { type: t.related_type, id: t.related_id })
            }
          }
        }

        // transactions에서 삭제
        const { data: td } = await sb.from('transactions')
          .delete()
          .eq('company_id', company_id)
          .in('id', batch)
          .select('id')
        deleted += (td?.length || 0)
      }
    } else {
      // 전체 삭제
      if (status === 'pending') {
        // classification_queue pending 삭제
        const { data: qd } = await sb.from('classification_queue')
          .delete()
          .eq('company_id', company_id)
          .in('status', ['pending', 'auto_confirmed'])
          .select('id')
        deleted += (qd?.length || 0)

        // transactions 전체 삭제 (category 컬럼 없으면 모두 pending으로 간주)
        const { data: td } = await sb.from('transactions')
          .delete()
          .eq('company_id', company_id)
          .select('id')
        deleted += (td?.length || 0)
      } else if (status === 'confirmed') {
        // classification_queue confirmed 삭제
        const { data: qd } = await sb.from('classification_queue')
          .delete()
          .eq('company_id', company_id)
          .eq('status', 'confirmed')
          .select('id')
        deleted += (qd?.length || 0)

        // transactions에서도 confirmed 항목 삭제 (category가 있는 건)
        try {
          const { data: td } = await sb.from('transactions')
            .delete()
            .eq('company_id', company_id)
            .select('id')
          deleted += (td?.length || 0)
        } catch (e) {
          console.error('transactions confirmed delete error:', e)
        }
      } else {
        // all: 양쪽 테이블 모두 삭제
        const { data: qd } = await sb.from('classification_queue')
          .delete()
          .eq('company_id', company_id)
          .select('id')
        deleted += (qd?.length || 0)

        const { data: td } = await sb.from('transactions')
          .delete()
          .eq('company_id', company_id)
          .select('id')
        deleted += (td?.length || 0)
      }
    }

    // ★ 삭제 후 영향받은 투자/지입 금액 재계산
    for (const [key, rel] of affectedRelated.entries()) {
      try {
        const { data: allTxs } = await sb
          .from('transactions')
          .select('amount, type')
          .eq('related_type', rel.type)
          .eq('related_id', rel.id)
        const netAmount = (allTxs || []).reduce((acc: number, cur: any) => {
          return acc + (cur.type === 'income' ? Math.abs(cur.amount || 0) : -Math.abs(cur.amount || 0))
        }, 0)
        const table = rel.type === 'invest' ? 'general_investments' : 'jiip_contracts'
        const updatePayload: Record<string, any> = { invest_amount: netAmount }
        // jiip_contracts와 general_investments 모두 updated_at 컬럼 없음
        await sb.from(table)
          .update(updatePayload)
          .eq('id', rel.id)
        console.log(`[classify DELETE] ${rel.type} ${rel.id} 순합계 재계산: ${netAmount}`)
      } catch (e) {
        console.error(`[classify DELETE] ${rel.type} ${rel.id} 금액 재계산 오류:`, e)
      }
    }

    return NextResponse.json({ deleted, remaining: 0 })
  } catch (error: any) {
    console.error('DELETE classify error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
