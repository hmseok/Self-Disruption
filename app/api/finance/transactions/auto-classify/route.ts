import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { classifyByRules, ALL_CATEGORIES } from '@/lib/transaction-classifier'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

/**
 * POST /api/finance/transactions/auto-classify
 * 미분류 거래 전체를 대상으로 규칙 기반 자동 분류 실행
 *
 * 분류 전략 (순서대로 시도):
 *   1) client_name 키워드 매칭 (가장 정확)
 *   2) description 키워드 매칭 (적요 기반)
 *   3) client_name + description 결합 매칭
 *   4) 금액 패턴 인식 (반복 동일 금액 → 급여/할부/임대료 추정)
 *
 * Body: { minConfidence?: number, dryRun?: boolean }
 *   minConfidence: 자동 확정 최소 신뢰도 (기본 60, 80이면 auto tier만)
 *   dryRun: true면 실제 업데이트 없이 미리보기만
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const minConfidence = body.minConfidence || 60
    const dryRun = body.dryRun === true

    // 미분류 거래 전체 조회
    const transactions = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, transaction_date, type, amount, description, client_name,
             bank_name, card_company, imported_from
      FROM transactions
      WHERE deleted_at IS NULL
        AND (category IS NULL OR category = '' OR category = '미분류')
      ORDER BY transaction_date DESC
      LIMIT 15000
    `)

    if (transactions.length === 0) {
      return NextResponse.json({
        data: serialize({
          totalScanned: 0,
          classified: 0,
          skipped: 0,
          breakdown: [],
          message: '미분류 거래가 없습니다',
        }),
        error: null,
      })
    }

    // 분류 결과 집계
    const categoryBatch = new Map<string, string[]>() // category → [ids]
    const classifiedDetails: Array<{
      id: string
      category: string
      confidence: number
      matchedOn: 'client_name' | 'description' | 'combined' | 'amount_pattern'
      matchedText: string
    }> = []
    let skipped = 0

    // ── 1단계: 규칙 기반 분류 (client_name → description → 결합) ──
    for (const tx of transactions) {
      const clientName = (tx.client_name || '').trim()
      const desc = (tx.description || '').trim()
      const txType = (tx.type || 'expense') as 'income' | 'expense'

      let result = null
      let matchedOn: 'client_name' | 'description' | 'combined' = 'client_name'
      let matchedText = ''

      // 1) client_name으로 시도
      if (clientName) {
        result = classifyByRules(clientName, txType)
        if (result && result.confidence >= minConfidence) {
          matchedOn = 'client_name'
          matchedText = clientName
        } else {
          result = null
        }
      }

      // 2) description으로 시도
      if (!result && desc) {
        result = classifyByRules(desc, txType)
        if (result && result.confidence >= minConfidence) {
          matchedOn = 'description'
          matchedText = desc
        } else {
          result = null
        }
      }

      // 3) client_name + description 결합으로 시도
      if (!result && (clientName || desc)) {
        const combined = `${clientName} ${desc}`.trim()
        result = classifyByRules(combined, txType)
        if (result && result.confidence >= minConfidence) {
          matchedOn = 'combined'
          matchedText = combined
        } else {
          result = null
        }
      }

      if (result) {
        classifiedDetails.push({
          id: tx.id,
          category: result.category,
          confidence: result.confidence,
          matchedOn,
          matchedText,
        })
        if (!categoryBatch.has(result.category)) categoryBatch.set(result.category, [])
        categoryBatch.get(result.category)!.push(tx.id)
      } else {
        skipped++
      }
    }

    // ── 2단계: 금액 패턴 분류 (반복 동일 금액) ──
    // 미분류로 남은 거래 중 반복 패턴 탐색
    const unclassifiedIds = new Set(
      transactions
        .filter(tx => !classifiedDetails.some(d => d.id === tx.id))
        .map(tx => tx.id)
    )
    const unclassifiedTxs = transactions.filter(tx => unclassifiedIds.has(tx.id))

    // 금액별 그룹화: 같은 금액이 3회 이상 반복 = 정기 거래 추정
    const amountGroups = new Map<string, any[]>() // "amount|type" → txs
    for (const tx of unclassifiedTxs) {
      const amt = Math.abs(Number(tx.amount || 0))
      if (amt === 0) continue
      const key = `${amt}|${tx.type}`
      if (!amountGroups.has(key)) amountGroups.set(key, [])
      amountGroups.get(key)!.push(tx)
    }

    const amountPatterns: Array<{
      amount: number
      type: string
      count: number
      suggestedCategory: string
      ids: string[]
    }> = []

    for (const [key, txs] of amountGroups) {
      if (txs.length < 3) continue // 3회 미만은 패턴으로 보지 않음

      const [amtStr, type] = key.split('|')
      const amount = Number(amtStr)

      // 금액 범위별 카테고리 추정
      let suggestedCategory = ''
      if (type === 'expense') {
        if (amount >= 1000000 && amount <= 10000000) {
          // 월 100만~1000만원 반복 출금 → 급여 또는 임대료
          suggestedCategory = txs.length >= 6 ? '급여(정규직)' : '임차료/사무실'
        } else if (amount >= 100000 && amount < 1000000) {
          // 10만~100만원 반복 → 할부/리스/보험
          suggestedCategory = '차량할부/리스료'
        } else if (amount >= 10000 && amount < 100000) {
          // 1만~10만원 반복 → 통신비/공과금
          suggestedCategory = '통신비'
        }
      } else if (type === 'income') {
        if (amount >= 1000000) {
          suggestedCategory = '렌트/운송수입'
        }
      }

      if (suggestedCategory) {
        amountPatterns.push({
          amount,
          type,
          count: txs.length,
          suggestedCategory,
          ids: txs.map(t => t.id),
        })
      }
    }

    // ── 실제 DB 업데이트 (dryRun이 아닌 경우) ──
    let totalUpdated = 0
    if (!dryRun) {
      for (const [category, ids] of categoryBatch) {
        // 1000건씩 배치 처리
        for (let i = 0; i < ids.length; i += 1000) {
          const batch = ids.slice(i, i + 1000)
          const placeholders = batch.map(() => '?').join(',')
          const result = await prisma.$executeRawUnsafe(
            `UPDATE transactions SET category = ?, final_category = ?, updated_at = NOW()
             WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
            category, category, ...batch
          )
          totalUpdated += Number(result)
        }
      }
    }

    // 카테고리별 분류 통계
    const breakdown = Array.from(categoryBatch.entries())
      .map(([category, ids]) => ({ category, count: ids.length }))
      .sort((a, b) => b.count - a.count)

    // 매칭 방법별 통계
    const matchMethodStats = {
      client_name: classifiedDetails.filter(d => d.matchedOn === 'client_name').length,
      description: classifiedDetails.filter(d => d.matchedOn === 'description').length,
      combined: classifiedDetails.filter(d => d.matchedOn === 'combined').length,
    }

    return NextResponse.json({
      data: serialize({
        totalScanned: transactions.length,
        classified: classifiedDetails.length,
        updated: dryRun ? 0 : totalUpdated,
        skipped,
        dryRun,
        breakdown,
        matchMethodStats,
        amountPatterns: amountPatterns.slice(0, 20), // 상위 20개만
        message: dryRun
          ? `${classifiedDetails.length}건 분류 가능 (미리보기)`
          : `${totalUpdated}건 자동 분류 완료`,
      }),
      error: null,
    })
  } catch (e: any) {
    console.error('[POST /api/finance/transactions/auto-classify]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
