import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { suggestBusinessRules } from '@/lib/rent-calc-engine'
import { rowToCalcSnapshot, serialize } from '@/lib/operational-learning-helpers'

// ═══════════════════════════════════════════════════════════════
// BusinessRules 자동 추천 API
//   POST /api/operational-learning/suggest-rules
//     body: { from?, to?, vehicle_class?, contract_type? }  — 필터
//     → calc_snapshots 필터 조회 → suggestBusinessRules() 호출
//     → 현재 BusinessRules 값으로 current_value 채움 후 반환
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { from, to, vehicle_class, contract_type } = body

    const wheres: string[] = []
    const params: any[] = []
    if (from) { wheres.push('snapshot_date >= ?'); params.push(from + ' 00:00:00') }
    if (to) { wheres.push('snapshot_date <= ?'); params.push(to + ' 23:59:59') }
    if (vehicle_class) { wheres.push('vehicle_class = ?'); params.push(vehicle_class) }
    if (contract_type) { wheres.push('contract_type = ?'); params.push(contract_type) }

    const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : ''
    const sql = `SELECT * FROM calc_snapshots ${whereClause} ORDER BY snapshot_date DESC LIMIT 500`

    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params)
    const snapshots = rows.map(rowToCalcSnapshot).filter((s): s is NonNullable<typeof s> => s !== null)

    const result = suggestBusinessRules(snapshots)

    // current_value 채우기: business_rules에서 각 key의 현재 값 조회
    // NOTE: 실제 컬럼명은 `key` / `value` (value는 JSON). key는 MySQL 예약어라 backtick 필수.
    if (result.suggestions.length > 0) {
      const keys = result.suggestions.map(s => s.key)
      const placeholders = keys.map(() => '?').join(',')
      const rulesWithId = await prisma.$queryRawUnsafe<any[]>(
        'SELECT id, `key`, `value` FROM business_rules WHERE `key` IN (' + placeholders + ')',
        ...keys
      )
      const ruleMap = new Map<string, { id: string; value: number }>()
      for (const r of rulesWithId) {
        let v = r.value
        if (typeof v === 'string') { try { v = JSON.parse(v) } catch {} }
        ruleMap.set(r.key, { id: r.id, value: Number(v) })
      }

      result.suggestions = result.suggestions.map(s => ({
        ...s,
        current_value: ruleMap.get(s.key)?.value ?? 0,
        rule_id: ruleMap.get(s.key)?.id ?? null,
      })) as any
    }

    return NextResponse.json({
      data: {
        ...result,
        filter: { from, to, vehicle_class, contract_type },
        total_snapshots_in_db: rows.length,
      },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
