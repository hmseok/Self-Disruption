import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { classifyByRules, ALL_CATEGORIES } from '@/lib/transaction-classifier'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

/**
 * POST /api/finance/transactions/group-classify
 * 미분류 거래를 거래처(client_name / description)별로 그룹화하여 반환
 * 각 그룹에 규칙 기반 추천 카테고리 포함
 *
 * Body: { type?: 'all' | 'income' | 'expense', limit?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const typeFilter = body.type || 'all' // 'all', 'income', 'expense'
    const limit = Math.min(body.limit || 5000, 10000)

    // 미분류 거래 조회 (category가 없거나 빈 문자열)
    let whereClause = `WHERE deleted_at IS NULL AND (category IS NULL OR category = '' OR category = '미분류')`
    if (typeFilter === 'income') whereClause += ` AND type = 'income'`
    else if (typeFilter === 'expense') whereClause += ` AND type = 'expense'`

    const transactions = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, transaction_date, type, amount, description, client_name,
             bank_name, card_company, imported_from, category
      FROM transactions
      ${whereClause}
      ORDER BY transaction_date DESC
      LIMIT ?
    `, limit)

    // 거래처(client_name 우선, 없으면 description)별 그룹화
    const groups = new Map<string, {
      merchantKey: string
      merchantName: string
      type: 'income' | 'expense'
      count: number
      totalAmount: number
      avgAmount: number
      sampleDescriptions: string[]
      transactionIds: string[]
      suggestedCategory: string | null
      suggestedConfidence: number
      dateRange: { first: string; last: string }
    }>()

    for (const tx of transactions) {
      const name = (tx.client_name || '').trim()
      const desc = (tx.description || '').trim()
      const txType = tx.type || 'expense'
      // 그룹 키: client_name이 있으면 client_name + type, 없으면 description + type
      const merchantName = name || desc || '(미상)'
      const groupKey = `${merchantName}::${txType}`

      if (!groups.has(groupKey)) {
        // 규칙 기반 카테고리 추천
        const ruleResult = classifyByRules(merchantName, txType as 'income' | 'expense')
          || classifyByRules(desc, txType as 'income' | 'expense')

        groups.set(groupKey, {
          merchantKey: groupKey,
          merchantName,
          type: txType,
          count: 0,
          totalAmount: 0,
          avgAmount: 0,
          sampleDescriptions: [],
          transactionIds: [],
          suggestedCategory: ruleResult?.category || null,
          suggestedConfidence: ruleResult?.confidence || 0,
          dateRange: { first: '', last: '' },
        })
      }

      const g = groups.get(groupKey)!
      g.count++
      g.totalAmount += Math.abs(Number(tx.amount || 0))
      g.transactionIds.push(tx.id)

      const dateStr = tx.transaction_date
        ? (tx.transaction_date instanceof Date ? tx.transaction_date.toISOString().slice(0, 10) : String(tx.transaction_date).slice(0, 10))
        : ''
      if (dateStr) {
        if (!g.dateRange.first || dateStr < g.dateRange.first) g.dateRange.first = dateStr
        if (!g.dateRange.last || dateStr > g.dateRange.last) g.dateRange.last = dateStr
      }

      // 샘플 적요 (최대 3개, 중복 제거)
      if (desc && g.sampleDescriptions.length < 3 && !g.sampleDescriptions.includes(desc)) {
        g.sampleDescriptions.push(desc)
      }
    }

    // 평균 금액 계산 + 배열로 변환 + 건수 내림차순 정렬
    const result = Array.from(groups.values())
      .map(g => ({ ...g, avgAmount: Math.round(g.totalAmount / g.count) }))
      .sort((a, b) => b.count - a.count)

    const totalUnclassified = transactions.length
    const groupCount = result.length
    const withSuggestion = result.filter(g => g.suggestedCategory).length

    return NextResponse.json({
      data: serialize({
        totalUnclassified,
        groupCount,
        withSuggestion,
        categories: ALL_CATEGORIES,
        groups: result,
      }),
      error: null,
    })
  } catch (e: any) {
    console.error('[POST /api/finance/transactions/group-classify]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * PATCH /api/finance/transactions/group-classify
 * 거래처 그룹 일괄 카테고리 적용
 * Body: { transactionIds: string[], category: string, saveAsRule?: boolean, merchantName?: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { transactionIds, category, saveAsRule, merchantName } = body

    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return NextResponse.json({ error: 'transactionIds 필요' }, { status: 400 })
    }
    if (!category) {
      return NextResponse.json({ error: 'category 필요' }, { status: 400 })
    }

    // 배치로 카테고리 업데이트 (1000건씩)
    let updated = 0
    for (let i = 0; i < transactionIds.length; i += 1000) {
      const batch = transactionIds.slice(i, i + 1000)
      const placeholders = batch.map(() => '?').join(',')
      const result = await prisma.$executeRawUnsafe(
        `UPDATE transactions SET category = ?, final_category = ?, updated_at = NOW()
         WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
        category, category, ...batch
      )
      updated += Number(result)
    }

    // 규칙 저장 요청 시 → finance_rules 테이블에 추가 (선택적)
    if (saveAsRule && merchantName) {
      try {
        const ruleId = crypto.randomUUID()
        await prisma.$executeRawUnsafe(
          `INSERT INTO finance_rules (id, rule_type, match_field, match_value, action_field, action_value, priority, is_active, created_at, updated_at)
           VALUES (?, 'auto_classify', 'client_name', ?, 'category', ?, 50, 1, NOW(), NOW())
           ON DUPLICATE KEY UPDATE action_value = ?, updated_at = NOW()`,
          ruleId, merchantName, category, category
        )
      } catch (e) {
        console.warn('[group-classify] finance_rules 저장 실패:', e)
      }
    }

    return NextResponse.json({
      data: serialize({ updated, category }),
      error: null,
    })
  } catch (e: any) {
    console.error('[PATCH /api/finance/transactions/group-classify]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
