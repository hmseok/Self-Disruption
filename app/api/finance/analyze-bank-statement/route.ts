import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 통장 거래 자동 분석 & 계약 매칭 API
// POST: 파싱된 거래 배열 → 세무사 분류 + 계약 매칭
// ============================================

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── 세무사 기준 분류 규칙 ──
const CATEGORY_RULES = [
  // 수입
  { category: '렌트/운송수입', type: 'income', keywords: ['매출', '정산', '운송료', '운임'] },
  { category: '지입 관리비/수수료', type: 'income', keywords: ['지입료', '관리비', '수수료'] },
  { category: '투자원금 입금', type: 'income', keywords: ['투자', '증자', '자본'] },
  { category: '대출 실행(입금)', type: 'income', keywords: ['대출입금', '대출실행'] },
  { category: '이자/잡이익', type: 'income', keywords: ['이자수입', '환급', '캐시백'] },
  // 지출
  { category: '지입 수익배분금(출금)', type: 'expense', keywords: ['수익배분', '정산금', '배분금', '지입대금'] },
  { category: '유류비', type: 'expense', keywords: ['주유', '가스', '엘피지', 'GS칼텍스', 'SK에너지', 'S-OIL', '충전'] },
  { category: '정비/수리비', type: 'expense', keywords: ['정비', '모터스', '타이어', '공업사', '수리', '부품', '오토'] },
  { category: '차량보험료', type: 'expense', keywords: ['손해보험', '화재보험', 'KB손해', '현대해상', 'DB손해', '보험료'] },
  { category: '자동차세/공과금', type: 'expense', keywords: ['자동차세', '과태료', '범칙금', '검사', '도로공사', '하이패스', '통행료'] },
  { category: '차량할부/리스료', type: 'expense', keywords: ['캐피탈', '파이낸셜', '할부', '리스료', '오토리스'] },
  { category: '이자비용(대출/투자)', type: 'expense', keywords: ['이자', '금융비용'] },
  { category: '원금상환', type: 'expense', keywords: ['원금상환', '원리금'] },
  { category: '급여(정규직)', type: 'expense', keywords: ['급여', '월급', '상여금', '퇴직금'] },
  { category: '용역비(3.3%)', type: 'expense', keywords: ['용역', '프리랜서', '3.3', '탁송', '대리운전'] },
  { category: '복리후생(식대)', type: 'expense', keywords: ['식당', '카페', '커피', '마트', '식사', '편의점', '배달'] },
  { category: '임차료/사무실', type: 'expense', keywords: ['월세', '임대료', '관리비', '주차'] },
  { category: '통신/소모품', type: 'expense', keywords: ['KT', 'SKT', 'LG', '인터넷', '다이소', '문구', '쿠팡', '네이버'] },
]

// ── 문자열 유사도 (포함/부분 일치) ──
function nameSimilarity(txName: string, contractName: string): number {
  if (!txName || !contractName) return 0
  const a = txName.replace(/\s/g, '').toLowerCase()
  const b = contractName.replace(/\s/g, '').toLowerCase()

  // 완전 일치
  if (a === b) return 100
  // 포함 관계
  if (a.includes(b) || b.includes(a)) return 80
  // 2글자 이상 공통 부분 찾기
  const minLen = Math.min(a.length, b.length)
  if (minLen < 2) return 0
  let matched = 0
  for (let i = 0; i <= a.length - 2; i++) {
    if (b.includes(a.substring(i, i + 2))) matched++
  }
  const ratio = matched / (a.length - 1)
  return Math.round(ratio * 60)
}

// ── 금액 근접도 (5% 오차) ──
function amountSimilarity(txAmount: number, contractAmount: number): number {
  if (!txAmount || !contractAmount) return 0
  const diff = Math.abs(txAmount - contractAmount)
  const tolerance = contractAmount * 0.05
  if (diff <= tolerance) return 100
  if (diff <= contractAmount * 0.15) return 50
  return 0
}

// ── 날짜 근접도 ──
function dateSimilarity(txDate: string, paymentDay: number): number {
  if (!txDate || !paymentDay) return 0
  const day = new Date(txDate).getDate()
  const diff = Math.abs(day - paymentDay)
  if (diff <= 2) return 100
  if (diff <= 5) return 50
  return 0
}

interface ContractInfo {
  id: string
  type: 'jiip' | 'invest' | 'loan'
  name: string
  monthlyAmount: number
  paymentDay: number
  status: string
}

interface ScheduleInfo {
  id: string
  contract_type: string
  contract_id: string
  payment_date: string
  expected_amount: number
  status: string
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

    // ── 1. 회사의 활성 계약 전체 조회 ──
    const [jiipRes, investRes, loanRes, rulesRes, scheduleRes] = await Promise.all([
      sb.from('jiip_contracts').select('id, investor_name, admin_fee, payout_day, status')
        .eq('company_id', company_id).eq('status', 'active'),
      sb.from('general_investments').select('id, investor_name, invest_amount, interest_rate, payment_day, status')
        .eq('company_id', company_id).eq('status', 'active'),
      sb.from('loans').select('id, finance_name, monthly_payment, payment_date, status')
        .eq('company_id', company_id).eq('status', 'active'),
      sb.from('finance_rules').select('*'),
      sb.from('expected_payment_schedules').select('id, contract_type, contract_id, payment_date, expected_amount, status')
        .eq('company_id', company_id).eq('status', 'pending'),
    ])

    // 계약 통합 리스트 생성
    const contracts: ContractInfo[] = [
      ...(jiipRes.data || []).map(c => ({
        id: c.id,
        type: 'jiip' as const,
        name: c.investor_name || '',
        monthlyAmount: Number(c.admin_fee) || 0,
        paymentDay: Number(c.payout_day) || 10,
        status: c.status,
      })),
      ...(investRes.data || []).map(c => ({
        id: c.id,
        type: 'invest' as const,
        name: c.investor_name || '',
        monthlyAmount: Math.round((Number(c.invest_amount) || 0) * (Number(c.interest_rate) || 0) / 100 / 12),
        paymentDay: Number(c.payment_day) || 10,
        status: c.status,
      })),
      ...(loanRes.data || []).map(c => ({
        id: c.id,
        type: 'loan' as const,
        name: c.finance_name || '',
        monthlyAmount: Number(c.monthly_payment) || 0,
        paymentDay: Number(c.payment_date) || 10,
        status: c.status,
      })),
    ]

    const schedules: ScheduleInfo[] = (scheduleRes.data || []) as ScheduleInfo[]
    const dbRules = (rulesRes.data || []) as any[]

    // ── 2. 각 거래 분석 ──
    const enriched = transactions.map((tx: any) => {
      const clientName = tx.client_name || ''
      const description = tx.description || ''
      const searchText = `${clientName} ${description}`.toLowerCase()
      const amount = Math.abs(Number(tx.amount) || 0)
      const txType = tx.type || 'expense'

      // ── 2a. 카테고리 자동 분류 ──
      let category = '미분류'
      let confidence = 0

      // DB 규칙 우선 적용
      for (const rule of dbRules) {
        const keyword = (rule.key || rule.keyword || '').toLowerCase()
        if (keyword && searchText.includes(keyword)) {
          category = rule.value?.category || rule.category || category
          confidence = 90
          break
        }
      }

      // 기본 규칙으로 분류
      if (category === '미분류') {
        for (const rule of CATEGORY_RULES) {
          if (rule.type !== txType) continue
          for (const kw of rule.keywords) {
            if (searchText.includes(kw.toLowerCase())) {
              category = rule.category
              confidence = 70
              break
            }
          }
          if (category !== '미분류') break
        }
      }

      // ── 2b. 계약 매칭 ──
      let bestMatch: { contract: ContractInfo; score: number } | null = null

      for (const contract of contracts) {
        let score = 0

        // 이름 유사도 (최대 50점)
        const nameScore = nameSimilarity(clientName, contract.name)
        score += nameScore * 0.5

        // 금액 근접도 (최대 40점)
        const amtScore = amountSimilarity(amount, contract.monthlyAmount)
        score += amtScore * 0.4

        // 날짜 근접도 (최대 10점)
        const dateScore = dateSimilarity(tx.transaction_date, contract.paymentDay)
        score += dateScore * 0.1

        if (score > 30 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { contract, score }
        }
      }

      // ── 2c. 스케줄 매칭 ──
      let matchedScheduleId: string | null = null

      if (bestMatch) {
        // 같은 계약의 pending 스케줄 중 날짜가 가장 가까운 것
        const candidateSchedules = schedules.filter(s =>
          s.contract_type === bestMatch!.contract.type &&
          s.contract_id === bestMatch!.contract.id &&
          s.status === 'pending'
        )

        if (candidateSchedules.length > 0) {
          const txDate = new Date(tx.transaction_date).getTime()
          candidateSchedules.sort((a, b) => {
            const diffA = Math.abs(new Date(a.payment_date).getTime() - txDate)
            const diffB = Math.abs(new Date(b.payment_date).getTime() - txDate)
            return diffA - diffB
          })
          matchedScheduleId = candidateSchedules[0].id
        }

        // 매칭된 계약으로 카테고리 보정
        if (category === '미분류') {
          if (bestMatch.contract.type === 'invest' && txType === 'income') category = '투자원금 입금'
          else if (bestMatch.contract.type === 'invest' && txType === 'expense') category = '이자비용(대출/투자)'
          else if (bestMatch.contract.type === 'jiip' && txType === 'income') category = '지입 관리비/수수료'
          else if (bestMatch.contract.type === 'jiip' && txType === 'expense') category = '지입 수익배분금(출금)'
          else if (bestMatch.contract.type === 'loan') category = '차량할부/리스료'
          confidence = Math.max(confidence, 60)
        }
      }

      return {
        ...tx,
        category,
        confidence,
        related_type: bestMatch?.contract.type || null,
        related_id: bestMatch?.contract.id || null,
        matched_schedule_id: matchedScheduleId,
        match_score: bestMatch?.score ? Math.round(bestMatch.score) : 0,
        matched_contract_name: bestMatch?.contract.name || null,
      }
    })

    // ── 3. 요약 통계 ──
    const summary = {
      total: enriched.length,
      matched: enriched.filter((t: any) => t.related_id).length,
      categorized: enriched.filter((t: any) => t.category !== '미분류').length,
      scheduleLinked: enriched.filter((t: any) => t.matched_schedule_id).length,
    }

    return NextResponse.json({ transactions: enriched, summary })

  } catch (error: any) {
    console.error('Bank statement analysis error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
