import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// AI 통합 분류 API v2.0
// POST: 거래 배열 → 세무사 분류 + 계약/급여/프리랜서/보험/카드 매칭
// 3-tier 신뢰도: auto(≥80) / review(60-79) / manual(<60)
// ============================================

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── 세무사 기준 분류 규칙 (확장) ──
const CATEGORY_RULES = [
  // 수입
  { category: '렌트/운송수입', type: 'income', keywords: ['매출', '정산', '운송료', '운임', '렌트료', '화물'] },
  { category: '지입 관리비/수수료', type: 'income', keywords: ['지입료', '관리비', '번호판', '수수료'] },
  { category: '투자원금 입금', type: 'income', keywords: ['투자', '증자', '자본', '출자'] },
  { category: '지입 초기비용/보증금', type: 'income', keywords: ['보증금', '인수금', '초기비용'] },
  { category: '대출 실행(입금)', type: 'income', keywords: ['대출입금', '대출실행', '론실행'] },
  { category: '이자/잡이익', type: 'income', keywords: ['이자수입', '환급', '캐시백', '이자입금'] },
  { category: '보험금 수령', type: 'income', keywords: ['보험금', '보상금', '사고보상'] },
  // 지출
  { category: '지입 수익배분금(출금)', type: 'expense', keywords: ['수익배분', '정산금', '배분금', '지입대금'] },
  { category: '유류비', type: 'expense', keywords: ['주유', '가스', '엘피지', 'GS칼텍스', 'SK에너지', 'S-OIL', '충전', '연료'] },
  { category: '정비/수리비', type: 'expense', keywords: ['정비', '모터스', '타이어', '공업사', '수리', '부품', '오토', '정비소'] },
  { category: '차량보험료', type: 'expense', keywords: ['손해보험', '화재보험', 'KB손해', '현대해상', 'DB손해', '보험료', '자동차보험'] },
  { category: '자동차세/공과금', type: 'expense', keywords: ['자동차세', '과태료', '범칙금', '검사', '도로공사', '하이패스', '통행료'] },
  { category: '차량할부/리스료', type: 'expense', keywords: ['캐피탈', '파이낸셜', '할부', '리스료', '오토리스'] },
  { category: '이자비용(대출/투자)', type: 'expense', keywords: ['이자', '금융비용', '이자지급'] },
  { category: '원금상환', type: 'expense', keywords: ['원금상환', '원리금'] },
  { category: '급여(정규직)', type: 'expense', keywords: ['급여', '월급', '상여금', '퇴직금', '임금'] },
  { category: '용역비(3.3%)', type: 'expense', keywords: ['용역', '프리랜서', '3.3', '탁송', '대리운전', '외주'] },
  { category: '4대보험(회사부담)', type: 'expense', keywords: ['국민연금', '건강보험', '고용보험', '산재보험', '4대보험'] },
  { category: '세금/공과금', type: 'expense', keywords: ['원천세', '부가세', '법인세', '지방세', '세무서', '국세청'] },
  { category: '복리후생(식대)', type: 'expense', keywords: ['식당', '카페', '커피', '마트', '식사', '편의점', '배달', '음식'] },
  { category: '접대비', type: 'expense', keywords: ['접대', '골프', '선물', '경조사', '화환', '축의금'] },
  { category: '임차료/사무실', type: 'expense', keywords: ['월세', '임대료', '관리비', '주차', '사무실'] },
  { category: '통신/소모품', type: 'expense', keywords: ['KT', 'SKT', 'LG', '인터넷', '다이소', '문구', '쿠팡', '네이버', '사무용품'] },
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

    // ── 1. 모든 매칭 데이터 병렬 로딩 ──
    const [
      jiipRes, investRes, loanRes, rulesRes, scheduleRes,
      salaryRes, freelancerRes, insuranceRes, carRes, cardRes
    ] = await Promise.all([
      // 기존 계약
      sb.from('jiip_contracts').select('id, investor_name, contractor_name, admin_fee, payout_day, status')
        .eq('company_id', company_id).eq('status', 'active'),
      sb.from('general_investments').select('id, investor_name, invest_amount, interest_rate, payment_day, status')
        .eq('company_id', company_id).eq('status', 'active'),
      sb.from('loans').select('id, finance_name, monthly_payment, payment_date, status')
        .eq('company_id', company_id).eq('status', 'active'),
      // 학습 규칙
      sb.from('finance_rules').select('*'),
      // 결제 스케줄
      sb.from('expected_payment_schedules').select('id, contract_type, contract_id, payment_date, expected_amount, status')
        .eq('company_id', company_id).eq('status', 'pending'),
      // 급여
      sb.from('employee_salaries')
        .select('employee_id, base_salary, pay_day, is_active, profiles:employee_id(name)')
        .eq('company_id', company_id).eq('is_active', true),
      // 프리랜서
      sb.from('freelancers').select('id, name, bank_account, service_type, default_fee, status')
        .eq('company_id', company_id).eq('status', 'active'),
      // 보험
      sb.from('insurance_contracts').select('id, company, product_name, total_premium, start_date, end_date, car_id')
        .eq('company_id', company_id),
      // 차량
      sb.from('cars').select('id, number, model, brand')
        .eq('company_id', company_id),
      // 법인카드
      sb.from('corporate_cards').select('id, card_alias, card_company, card_number, assigned_employee_id, status')
        .eq('company_id', company_id).eq('status', 'active'),
    ])

    // ── 2. 통합 매칭 대상 생성 ──
    const targets: MatchTarget[] = []

    // 지입 계약
    for (const c of jiipRes.data || []) {
      targets.push({
        id: c.id, type: 'jiip',
        name: c.investor_name || c.contractor_name || '',
        monthlyAmount: Number(c.admin_fee) || 0,
        paymentDay: Number(c.payout_day) || 10,
        defaultCategory: '지입 관리비/수수료',
        txType: 'both',
      })
    }

    // 투자 계약
    for (const c of investRes.data || []) {
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
    for (const c of loanRes.data || []) {
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
    for (const s of salaryRes.data || []) {
      const profileData = s.profiles as any
      const empName = profileData?.name || ''
      targets.push({
        id: s.employee_id, type: 'salary',
        name: empName,
        monthlyAmount: Number(s.base_salary) || 0,
        paymentDay: Number(s.pay_day) || 25,
        defaultCategory: '급여(정규직)',
        txType: 'expense',
        extra: { employee_id: s.employee_id },
      })
    }

    // 프리랜서
    for (const f of freelancerRes.data || []) {
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

    const schedules: ScheduleInfo[] = (scheduleRes.data || []) as ScheduleInfo[]
    const dbRules = (rulesRes.data || []) as any[]
    const cards = (cardRes.data || []) as any[]
    const cars = (carRes.data || []) as any[]

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

      // ── 3b. 카드 결제 매칭 (법인카드) ──
      if (tx.payment_method === '카드' || tx.payment_method === 'Card') {
        // 카드번호 뒷자리로 매칭
        const cardNumHint = (tx.card_number || '').replace(/\D/g, '').slice(-4)
        if (cardNumHint) {
          const matchedCard = cards.find((c: any) => c.card_number?.endsWith(cardNumHint))
          if (matchedCard) {
            tx.card_id = matchedCard.id
          }
        }
      }

      // ── 3c. 키워드 기반 분류 (미분류인 경우) ──
      if (result.category === '미분류') {
        for (const rule of CATEGORY_RULES) {
          if (rule.type !== txType) continue
          for (const kw of rule.keywords) {
            if (searchText.includes(kw.toLowerCase())) {
              result.category = rule.category
              result.confidence = 70
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

        // 이름 유사도 (최대 50점)
        const nameScore = nameSimilarity(clientName, target.name)
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

        if (score > 25) {
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

      // ── 3g. 신뢰도 기반 분류 등급 결정 ──
      if (result.confidence >= 80) {
        result.classification_tier = 'auto'
      } else if (result.confidence >= 60) {
        result.classification_tier = 'review'
      } else {
        result.classification_tier = 'manual'
      }

      // 카테고리 대안 추가 (미분류인 경우 키워드 후보)
      if (result.category === '미분류') {
        // 가능한 카테고리 후보들 추가
        const possibles = CATEGORY_RULES
          .filter(r => r.type === txType)
          .slice(0, 3)
          .map(r => ({ category: r.category, confidence: 30 }))
        result.alternatives = [...result.alternatives, ...possibles].slice(0, 5)
      }

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

    // ── 5. review/manual 건은 classification_queue에 자동 삽입 ──
    const queueItems = enriched
      .filter((t: any) => t.classification_tier === 'review' || t.classification_tier === 'manual')
      .map((t: any) => ({
        company_id,
        source_type: t.payment_method === '카드' ? 'card_statement' : 'bank_statement',
        source_data: {
          transaction_date: t.transaction_date,
          client_name: t.client_name,
          description: t.description,
          amount: t.amount,
          type: t.type,
          payment_method: t.payment_method,
        },
        ai_category: t.category,
        ai_confidence: t.confidence,
        ai_related_type: t.related_type,
        ai_related_id: t.related_id,
        alternatives: t.alternatives || [],
        status: 'pending',
      }))

    if (queueItems.length > 0) {
      // 비동기로 큐 삽입 (실패해도 응답은 정상 반환)
      sb.from('classification_queue').insert(queueItems).then(({ error }) => {
        if (error) console.error('Classification queue insert error:', error.message)
      })
    }

    return NextResponse.json({ transactions: enriched, summary })

  } catch (error: any) {
    console.error('Classify API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── GET: 분류 큐 조회 (review 대시보드용) ──
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

    const { data, error, count } = await sb
      .from('classification_queue')
      .select('*', { count: 'exact' })
      .eq('company_id', company_id)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return NextResponse.json({ items: data || [], total: count || 0 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── PATCH: 분류 큐 항목 확정 (수동 결정) ──
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { queue_id, final_category, final_related_type, final_related_id, save_as_rule, rule_keyword } = body

    if (!queue_id || !final_category) {
      return NextResponse.json({ error: 'queue_id, final_category 필요' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // 1. 큐 항목 업데이트
    const { data: updated, error: updateErr } = await sb
      .from('classification_queue')
      .update({
        final_category,
        final_related_type: final_related_type || null,
        final_related_id: final_related_id || null,
        status: 'confirmed',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', queue_id)
      .select()
      .single()

    if (updateErr) throw updateErr

    // 2. 규칙 학습 (선택적)
    if (save_as_rule && rule_keyword) {
      const { error: ruleErr } = await sb.from('finance_rules').upsert({
        keyword: rule_keyword.toLowerCase(),
        category: final_category,
        related_type: final_related_type || null,
        related_id: final_related_id || null,
      }, { onConflict: 'keyword' })

      if (ruleErr) console.error('Rule save error:', ruleErr.message)
    }

    // 3. transactions 테이블에 확정 기록 생성 (선택적)
    if (updated?.source_data) {
      const src = updated.source_data as any
      const { error: txErr } = await sb.from('transactions').insert({
        company_id: updated.company_id,
        transaction_date: src.transaction_date,
        type: src.type || 'expense',
        client_name: src.client_name || '',
        description: src.description || '',
        amount: Number(src.amount) || 0,
        payment_method: src.payment_method || '통장',
        category: final_category,
        related_type: final_related_type || null,
        related_id: final_related_id || null,
        classification_source: 'manual_review',
        confidence: 100,
        status: 'completed',
      })

      if (txErr) console.error('Transaction insert error:', txErr.message)
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
