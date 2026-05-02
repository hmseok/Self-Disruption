import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/finance/auto-classify/dry-run
 *
 * 미분류 거래에 classification_rules 매칭 시도 → HIGH/MEDIUM/LOW 그룹 분류.
 * DB 변경 없음 — 사용자 검수 후 /apply 호출.
 *
 * body:
 *   {
 *     source?: 'card' | 'bank' | 'all'  (default 'all')
 *     limit?: number                     (default 5000)
 *     onlyUnclassified?: boolean         (default true — category 가 NULL/빈값 인 것만)
 *   }
 *
 * 응답:
 *   {
 *     counts: { high, medium, low, total },
 *     groups: {
 *       high:   [{ id, description, amount, ruleId, category, subcategory, related_type, related_id, ... }],
 *       medium: [...],
 *       low:    [...]
 *     }
 *   }
 */

interface ClassificationRule {
  id: string
  pattern: string
  category: string
  subcategory: string | null
  match_car: number
  confidence: 'high' | 'medium' | 'low'
  amount_max: string | null
  amount_min: string | null
  tx_type: string | null
  is_active: number
}

interface Tx {
  id: string
  description: string | null
  amount: string | null
  type: string | null
  imported_from: string | null
  category: string | null
  related_type: string | null
  related_id: string | null
  // 카드 매칭 정보 (corporate_cards 조인)
  card_assigned_car_id: string | null
  card_assigned_employee_id: string | null
  card_holder_name: string | null
  card_company: string | null
  card_alias: string | null
}

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const source: 'card' | 'bank' | 'all' = body.source || 'all'
    const limit = Math.min(Math.max(Number(body.limit) || 5000, 1), 10000)
    const onlyUnclassified = body.onlyUnclassified !== false

    // 1) 활성 룰 모두 로드
    const rules = await prisma.$queryRaw<ClassificationRule[]>`
      SELECT id, pattern, category, subcategory, match_car, confidence,
             amount_max, amount_min, tx_type, is_active
      FROM classification_rules
      WHERE is_active = 1
      ORDER BY confidence ASC, LENGTH(pattern) DESC
    `

    if (rules.length === 0) {
      return NextResponse.json({
        counts: { high: 0, medium: 0, low: 0, total: 0 },
        groups: { high: [], medium: [], low: [] },
        warning: 'classification_rules 가 비어있음 — 마이그레이션 필요',
      })
    }

    // 2) 거래 + 카드 정보 로드 (description 매칭용 + 차량 자동 매칭용)
    let txs: Tx[] = []
    try {
      txs = await prisma.$queryRawUnsafe<Tx[]>(`
        SELECT
          t.id, t.description, t.amount, t.type, t.imported_from,
          t.category, t.related_type, t.related_id,
          cc.assigned_car_id      AS card_assigned_car_id,
          cc.assigned_employee_id AS card_assigned_employee_id,
          cc.holder_name          AS card_holder_name,
          t.card_company,
          sms.card_alias
        FROM transactions t
        LEFT JOIN card_sms_transactions sms ON sms.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
        LEFT JOIN corporate_cards cc       ON cc.id COLLATE utf8mb4_unicode_ci = sms.card_id COLLATE utf8mb4_unicode_ci
        WHERE t.deleted_at IS NULL
          ${onlyUnclassified ? "AND (t.category IS NULL OR t.category = '')" : ''}
          ${source === 'card' ? "AND (t.imported_from = 'sms' OR t.imported_from LIKE 'excel_card%' OR t.imported_from LIKE 'pdf_card%')" : ''}
          ${source === 'bank' ? "AND (t.imported_from = 'sms_bank' OR t.imported_from LIKE 'excel_bank%' OR t.imported_from LIKE 'codef%')" : ''}
        ORDER BY t.created_at DESC
        LIMIT ${limit}
      `)
    } catch (e: any) {
      // card_company 컬럼 없는 환경 (legacy) — fallback
      console.warn('[auto-classify dry-run] full query 실패, simple fallback:', e?.message?.slice(0, 200))
      txs = await prisma.$queryRawUnsafe<Tx[]>(`
        SELECT t.id, t.description, t.amount, t.type, t.imported_from,
               t.category, t.related_type, t.related_id,
               NULL AS card_assigned_car_id,
               NULL AS card_assigned_employee_id,
               NULL AS card_holder_name,
               NULL AS card_company,
               NULL AS card_alias
        FROM transactions t
        WHERE t.deleted_at IS NULL
          ${onlyUnclassified ? "AND (t.category IS NULL OR t.category = '')" : ''}
        ORDER BY t.created_at DESC
        LIMIT ${limit}
      `)
    }

    // 3) 룰 매칭
    const groups = { high: [] as any[], medium: [] as any[], low: [] as any[] }

    for (const tx of txs) {
      const desc = String(tx.description || '')
      const amount = Number(tx.amount || 0)
      let matched: ClassificationRule | null = null

      for (const rule of rules) {
        // tx_type 필터
        if (rule.tx_type && tx.type && rule.tx_type !== tx.type) continue
        // amount 필터
        if (rule.amount_max != null && amount > Number(rule.amount_max)) continue
        if (rule.amount_min != null && amount < Number(rule.amount_min)) continue
        // pattern 매칭 (case-insensitive contains)
        if (desc.toLowerCase().includes(rule.pattern.toLowerCase())) {
          matched = rule
          break // 첫 매칭 (룰 정렬 순서대로 — 긴 패턴 우선)
        }
      }

      // 매칭 안 됨 → LOW (직원 카드 + 작은 금액 = 개인사용 추정)
      if (!matched) {
        const isEmployeeCard = !!tx.card_assigned_employee_id && !tx.card_assigned_car_id
        const isSmallAmount = amount > 0 && amount < 50000
        const candidate = {
          id: tx.id,
          description: desc,
          amount: tx.amount,
          type: tx.type,
          card_holder_name: tx.card_holder_name,
          card_company: tx.card_company,
          card_alias: tx.card_alias,
          rule_id: null,
          category: isEmployeeCard && isSmallAmount ? '미분류' : '미분류',
          subcategory: isEmployeeCard && isSmallAmount ? '개인사용 추정' : '검토 필요',
          confidence: 'low',
          related_type: null as string | null,
          related_id: null as string | null,
          reason: isEmployeeCard
            ? (isSmallAmount ? '직원 카드 + 작은 금액 → 개인사용 추정' : '직원 카드 + 큰 금액 → 검토 필요')
            : '룰 매칭 안 됨',
        }
        groups.low.push(candidate)
        continue
      }

      // 매칭됨 → 차량 자동 매칭 결정
      let related_type: string | null = tx.related_type || null
      let related_id: string | null = tx.related_id || null
      let confidence: 'high' | 'medium' | 'low' = matched.confidence
      let reason = `룰 매칭: "${matched.pattern}"`

      if (matched.match_car === 1) {
        if (tx.card_assigned_car_id) {
          // 차량 카드 → 자동 차량 매칭
          related_type = 'car'
          related_id = tx.card_assigned_car_id
          reason += ' + 차량 카드 자동 매칭'
        } else if (tx.card_assigned_employee_id) {
          // 직원 카드 → 차량 미할당 → 검수 필요 (HIGH → MEDIUM 격하)
          confidence = 'medium'
          reason += ' (직원 카드 — 어느 차량 지원인지 검수 필요)'
        } else {
          // 통장 또는 카드 매핑 없음 → 차량 매칭 보류
          confidence = matched.confidence === 'high' ? 'medium' : matched.confidence
          reason += ' (차량 미매칭 — 검토 필요)'
        }
      }

      const candidate = {
        id: tx.id,
        description: desc,
        amount: tx.amount,
        type: tx.type,
        card_holder_name: tx.card_holder_name,
        card_company: tx.card_company,
        card_alias: tx.card_alias,
        rule_id: matched.id,
        category: matched.category,
        subcategory: matched.subcategory,
        confidence,
        related_type,
        related_id,
        reason,
      }

      groups[confidence].push(candidate)
    }

    return NextResponse.json({
      counts: {
        high: groups.high.length,
        medium: groups.medium.length,
        low: groups.low.length,
        total: groups.high.length + groups.medium.length + groups.low.length,
      },
      groups: serialize(groups),
      rules_count: rules.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 })
  }
}
