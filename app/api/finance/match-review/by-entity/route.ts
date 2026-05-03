import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/finance/match-review/by-entity
 *
 * 매칭 검수 — entity 중심 grouping (5차원 분리 원칙).
 *
 * 응답 구조:
 *   {
 *     entities: {
 *       car: [{ id, label, count, totalAmount, categories: { 유류비: 5, 정비: 2, ... }, byMonth: [...] }],
 *       employee: [...],
 *       invest: [...],
 *       jiip: [...],
 *       insurance: [...],
 *       loan: [...],
 *     },
 *     unmatched: { count, totalAmount },
 *     summary: { totalEntities, totalMatched, totalUnmatched },
 *   }
 *
 * 데이터 소스:
 *   1. transaction_assignments (다중 매칭)
 *   2. transactions.related_type / related_id (legacy 단일)
 *   둘 다 통합 — UNIQUE (transaction_id, entity_type, entity_id) 로 중복 제거
 */

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

const ENTITY_LABELS: Record<string, { table: string; nameCol: string; extraCol?: string; emoji: string; ko: string }> = {
  car:        { table: 'cars',                  nameCol: 'number',         extraCol: "CONCAT_WS(' ', brand, model)", emoji: '🚗', ko: '차량' },
  employee:   { table: 'profiles',              nameCol: 'name',           emoji: '👤', ko: '직원' },
  salary:     { table: 'profiles',              nameCol: 'name',           emoji: '💰', ko: '급여 (직원)' },
  insurance:  { table: 'insurance_contracts',   nameCol: 'insurance_company', emoji: '📄', ko: '보험' },
  loan:       { table: 'loans',                 nameCol: 'finance_name',   emoji: '💳', ko: '대출' },
  jiip:       { table: 'jiip_contracts',        nameCol: 'investor_name',  emoji: '🤝', ko: '지입' },
  invest:     { table: 'general_investments',   nameCol: 'investor_name',  emoji: '📈', ko: '투자' },
  fmi_rental: { table: 'fmi_rentals',           nameCol: 'customer_name',  emoji: '🏷️', ko: '렌탈' },
  contract:   { table: 'contracts',             nameCol: 'customer_name',  emoji: '📝', ko: '계약' },
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    // 1) transaction_assignments + legacy 통합 → 매칭 정보 수집
    //    한 거래가 여러 entity 에 매칭됐을 수 있음 (다중 슬롯)
    const matchedRows = await prisma.$queryRawUnsafe<Array<any>>(`
      SELECT
        t.id           AS tx_id,
        t.transaction_date,
        t.amount,
        t.type,
        t.category,
        t.client_name,
        t.description,
        ta.assignment_type AS entity_type,
        ta.assignment_id   AS entity_id
      FROM transactions t
      INNER JOIN transaction_assignments ta
        ON ta.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
      WHERE t.deleted_at IS NULL

      UNION ALL

      SELECT
        t.id           AS tx_id,
        t.transaction_date,
        t.amount,
        t.type,
        t.category,
        t.client_name,
        t.description,
        t.related_type AS entity_type,
        t.related_id   AS entity_id
      FROM transactions t
      WHERE t.deleted_at IS NULL
        AND t.related_type IS NOT NULL
        AND t.related_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM transaction_assignments ta2
          WHERE ta2.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
            AND ta2.assignment_type = t.related_type
            AND ta2.assignment_id COLLATE utf8mb4_unicode_ci = t.related_id COLLATE utf8mb4_unicode_ci
        )
    `)

    // 2) entity 별 group + 통계 계산
    const entityMap: Record<string, Map<string, any>> = {}
    for (const row of matchedRows) {
      const type = String(row.entity_type || '')
      const id = String(row.entity_id || '')
      if (!type || !id) continue
      if (!entityMap[type]) entityMap[type] = new Map()
      const m = entityMap[type]
      if (!m.has(id)) {
        m.set(id, {
          id,
          count: 0,
          totalAmount: 0,
          categories: {} as Record<string, number>,
          txIds: new Set<string>(),
        })
      }
      const e = m.get(id)
      // 같은 거래 중복 카운트 방지 (legacy + assignments 양쪽 다 있을 수 있음)
      if (e.txIds.has(row.tx_id)) continue
      e.txIds.add(row.tx_id)
      e.count++
      e.totalAmount += Math.abs(Number(row.amount || 0))
      const cat = row.category || '미분류'
      e.categories[cat] = (e.categories[cat] || 0) + 1
    }

    // 3) entity 이름 조회 — type 별 batch
    const entities: Record<string, any[]> = {}
    for (const [type, idMap] of Object.entries(entityMap)) {
      const cfg = ENTITY_LABELS[type]
      if (!cfg) {
        // 알 수 없는 type — 그대로 id 만 표시
        entities[type] = Array.from(idMap.entries()).map(([id, e]: any) => ({
          ...e, id, label: id.slice(0, 8), txIds: undefined,
          type, typeLabel: type,
        })).sort((a, b) => b.count - a.count)
        continue
      }
      const ids = Array.from(idMap.keys())
      if (ids.length === 0) continue
      const placeholders = ids.map(() => '?').join(',')
      let nameRows: Array<any> = []
      try {
        const extraSelect = cfg.extraCol ? `, ${cfg.extraCol} AS extra` : ''
        nameRows = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT id, ${cfg.nameCol} AS name${extraSelect} FROM ${cfg.table} WHERE id IN (${placeholders})`,
          ...ids
        )
      } catch (e: any) {
        console.warn(`[match-review/by-entity] ${type} 이름 조회 실패:`, e?.message)
      }
      const nameMap = new Map(nameRows.map(r => [String(r.id), { name: r.name, extra: r.extra }]))

      entities[type] = Array.from(idMap.entries()).map(([id, e]: any) => {
        const info = nameMap.get(id)
        const name = info?.name || id.slice(0, 8)
        const extra = info?.extra
        return {
          ...e,
          id,
          label: extra ? `${name} (${extra})` : name,
          type,
          typeLabel: `${cfg.emoji} ${cfg.ko}`,
          txIds: undefined,
        }
      }).sort((a, b) => b.count - a.count)
    }

    // 4) 미매칭 거래 (분류된 거래 중 어느 entity 에도 매칭 안 된 것)
    //    카테고리 = 미분류 가 아닌 거래 중 transaction_assignments / related_id 둘 다 없는 것
    const unmatchedRows = await prisma.$queryRawUnsafe<Array<any>>(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(ABS(amount)), 0) AS total
      FROM transactions t
      WHERE t.deleted_at IS NULL
        AND t.category IS NOT NULL AND t.category != '' AND t.category != '미분류'
        AND (t.related_type IS NULL OR t.related_id IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM transaction_assignments ta WHERE ta.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
        )
    `)
    const unmatched = {
      count: Number(unmatchedRows[0]?.cnt || 0),
      totalAmount: Number(unmatchedRows[0]?.total || 0),
    }

    // 5) summary
    let totalEntities = 0
    let totalMatched = 0
    for (const arr of Object.values(entities)) {
      totalEntities += arr.length
      totalMatched += arr.reduce((s, e) => s + e.count, 0)
    }

    return NextResponse.json({
      entities: serialize(entities),
      unmatched,
      summary: {
        totalEntities,
        totalMatched,
        totalUnmatched: unmatched.count,
      },
    })
  } catch (e: any) {
    console.error('[match-review/by-entity GET]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
