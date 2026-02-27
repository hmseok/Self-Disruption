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
- 자본변동: 투자원금 입금, 지입 초기비용/보증금, 대출 실행(입금)
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
- 지입 초기비용/보증금: 보증금, 인수금, 입주보증금
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
- 통신비: KT, SKT, LG유플러스, 인터넷, 전화
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

      for (const item of parsed) {
        const no = item.no - 1 // 0-indexed
        if (no >= 0 && no < batch.length && categoryList.includes(item.category)) {
          allResults.push({
            idx: batch[no].idx,
            category: item.category,
            confidence: Math.min(item.confidence || 60, 90), // AI 분류는 최대 90%
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
  { category: '지입 초기비용/보증금', type: 'income', keywords: ['보증금', '인수금', '초기비용', '입주보증금'] },
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

// ── 유사도 함수들 ──
function nameSimilarity(txName: string, targetName: string): number {
  if (!txName || !targetName) return 0
  const a = txName.replace(/\s/g, '').toLowerCase()
  const b = targetName.replace(/\s/g, '').toLowerCase()
  if (a === b) return 100
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
      for (const rule of dbRules) {
        const keyword = (rule.key || rule.keyword || '').toLowerCase()
        if (keyword && searchText.includes(keyword)) {
          result.category = rule.value?.category || rule.category || result.category
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

        // 이름 유사도 — client_name + description 모두 검사 (최대 50점)
        const nameScore1 = nameSimilarity(clientName, target.name)
        const nameScore2 = nameSimilarity(description, target.name)
        const nameScore = Math.max(nameScore1, nameScore2)
        score += nameScore * 0.5

        // 금액 근접도 (최대 40점)
        if (target.monthlyAmount > 0) {
          const amtScore = amountSimilarity(amount, target.monthlyAmount)
          score += amtScore * 0.4
        }

        // 날짜 근접도 (최대 10점)
        if (target.paymentDay > 0) {
          const dateScore = dateSimilarity(tx.transaction_date, target.paymentDay)
          score += dateScore * 0.1
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

        // 매칭으로 카테고리 보정
        if (result.category === '미분류' || result.confidence < 70) {
          // 방향별 기본 카테고리 설정
          if (best.target.type === 'invest') {
            result.category = txType === 'income' ? '투자원금 입금' : '이자비용(대출/투자)'
          } else if (best.target.type === 'jiip') {
            result.category = txType === 'income' ? '지입 관리비/수수료' : '지입 수익배분금(출금)'
          } else {
            result.category = best.target.defaultCategory
          }
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

    if (queueItems.length > 0) {
      // 50건씩 배치 삽입
      for (let i = 0; i < queueItems.length; i += 50) {
        const batch = queueItems.slice(i, i + 50)
        const { error } = await sb.from('classification_queue').insert(batch)
        if (error) console.error('Classification queue insert error:', error.message)
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
    // 대신 classification_source로 구분하거나, 전체 반환
    const { data: txData, error: txError, count: txCount } = await txQuery
      .order('created_at', { ascending: false })
      .limit(limit)

    if (txError) throw txError

    const items = (txData || []).map((tx: any) => {
      // category 컬럼이 있으면 사용, 없으면 미분류
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

    // status 필터링 (DB에서 못했으니 앱 레벨에서)
    const filtered = status === 'all' ? items :
      items.filter((i: any) => {
        if (status === 'pending') return i.status === 'pending'
        if (status === 'confirmed') return i.status === 'confirmed'
        return true
      })

    const filteredTotal = status === 'all' ? (txCount || 0) : filtered.length
    // pending 총 수를 정확히 계산
    const pendingCount = items.filter((i: any) => i.status === 'pending').length
    const confirmedCount = items.filter((i: any) => i.status === 'confirmed').length

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

// ── PATCH: 분류 확정 (classification_queue 업데이트) ──
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
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

    // 055 스키마 컬럼 (존재할 수도 있음)
    // phase1 스키마에서는 final_matched_type/final_matched_id
    const { data: updated, error: updateErr } = await sb
      .from('classification_queue')
      .update(updateData)
      .eq('id', queue_id)
      .select()
      .single()

    if (updateErr) throw updateErr

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

    if (ids && Array.isArray(ids) && ids.length > 0) {
      // 특정 ID들만 삭제 — 양쪽 테이블에서 시도
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50)

        // classification_queue에서 삭제 시도
        const { data: qd } = await sb.from('classification_queue')
          .delete()
          .eq('company_id', company_id)
          .in('id', batch)
          .select('id')
        deleted += (qd?.length || 0)

        // transactions에서도 삭제 시도
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

    return NextResponse.json({ deleted, remaining: 0 })
  } catch (error: any) {
    console.error('DELETE classify error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
