import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { serialize } from '@/lib/operational-learning-helpers'

// ═══════════════════════════════════════════════════════════════
// BusinessRules 추천 적용 API
//   POST /api/operational-learning/apply-rule
//     body: { rule_key, new_value, reason?, confidence?, sample_size? }
//     → business_rules 업데이트 (컬럼: key/value — value는 JSON)
//     → rule_suggestion_logs에 이력 기록
//
// NOTE:
//   business_rules 실제 컬럼은 `key` (text), `value` (json).
//   `key`는 MySQL 예약어라 backtick 필수.
//   `value`는 JSON 컬럼이라 JSON 텍스트(`'2'`)로 바인딩해야 함.
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { rule_key, new_value, reason, confidence, sample_size } = body

    if (!rule_key || new_value === undefined || new_value === null) {
      return NextResponse.json({ error: 'rule_key, new_value 필수' }, { status: 400 })
    }
    if (isNaN(Number(new_value))) {
      return NextResponse.json({ error: 'new_value는 숫자' }, { status: 400 })
    }

    // 1. 기존 rule 조회 (key는 예약어 → backtick)
    const existing = await prisma.$queryRawUnsafe<any[]>(
      'SELECT id, `value` FROM business_rules WHERE `key` = ? LIMIT 1',
      rule_key
    )
    if (existing.length === 0) {
      return NextResponse.json({ error: `BusinessRule '${rule_key}' 없음` }, { status: 404 })
    }
    const oldRaw = existing[0].value
    const oldValue = typeof oldRaw === 'string' ? Number(oldRaw) : Number(oldRaw ?? 0)
    const newValueNum = Number(new_value)

    // 2. 업데이트 — JSON 컬럼이므로 JSON 텍스트(숫자 literal)로 바인딩
    const jsonVal = JSON.stringify(newValueNum)
    await prisma.$executeRawUnsafe(
      'UPDATE business_rules SET `value` = ?, updated_at = NOW() WHERE id = ?',
      jsonVal, existing[0].id
    )

    // 3. 이력 기록
    const logId = crypto.randomUUID()
    await prisma.$executeRaw`
      INSERT INTO rule_suggestion_logs (
        id, rule_key, old_value, new_value, reason, confidence, sample_size, applied_by, applied_at
      ) VALUES (
        ${logId}, ${rule_key}, ${oldValue}, ${newValueNum},
        ${reason || null}, ${confidence || null}, ${sample_size || null},
        ${user.id}, NOW()
      )
    `

    return NextResponse.json({
      data: {
        rule_key,
        old_value: oldValue,
        new_value: newValueNum,
        log_id: logId,
      },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// 적용 이력 조회
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const ruleKey = searchParams.get('rule_key')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

    let rows: any[]
    if (ruleKey) {
      rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM rule_suggestion_logs WHERE rule_key = ? ORDER BY applied_at DESC LIMIT ${limit}`,
        ruleKey
      )
    } else {
      rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM rule_suggestion_logs ORDER BY applied_at DESC LIMIT ${limit}`
      )
    }
    return NextResponse.json({ data: serialize(rows), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
