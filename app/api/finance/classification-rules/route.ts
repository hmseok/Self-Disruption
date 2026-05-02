import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * /api/finance/classification-rules
 *
 * GET     — 전체 룰 목록
 * POST    — 신규 룰 추가 (사용자 룰)
 * PATCH   — 룰 수정 (시스템 룰도 수정 가능, 단 is_system 플래그 변경 X)
 * DELETE  — 룰 삭제 (사용자 룰 only — is_system=1 보호)
 */

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

const VALID_CONFIDENCE = new Set(['high', 'medium', 'low'])
const VALID_TX_TYPE = new Set(['income', 'expense', null, ''])

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const rows = await prisma.$queryRaw`
      SELECT id, pattern, category, subcategory, match_car, confidence,
             amount_max, amount_min, tx_type, is_system, is_active, notes,
             created_at, updated_at
      FROM classification_rules
      ORDER BY is_system DESC, category ASC, confidence ASC, pattern ASC
    `
    return NextResponse.json({ data: serialize(rows), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { pattern, category, subcategory, match_car, confidence,
            amount_max, amount_min, tx_type, notes } = body

    if (!pattern || !category) {
      return NextResponse.json({ error: 'pattern + category 필수' }, { status: 400 })
    }
    if (confidence && !VALID_CONFIDENCE.has(confidence)) {
      return NextResponse.json({ error: 'confidence 는 high/medium/low' }, { status: 400 })
    }
    if (tx_type && !VALID_TX_TYPE.has(tx_type)) {
      return NextResponse.json({ error: 'tx_type 는 income/expense/null' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    await prisma.$executeRaw`
      INSERT INTO classification_rules
        (id, pattern, category, subcategory, match_car, confidence,
         amount_max, amount_min, tx_type, is_system, is_active, notes)
      VALUES
        (${id}, ${pattern}, ${category}, ${subcategory || null},
         ${match_car ? 1 : 0}, ${confidence || 'medium'},
         ${amount_max ? Number(amount_max) : null},
         ${amount_min ? Number(amount_min) : null},
         ${tx_type || null}, 0, 1, ${notes || null})
    `
    return NextResponse.json({ ok: true, id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { id, pattern, category, subcategory, match_car, confidence,
            amount_max, amount_min, tx_type, is_active, notes } = body

    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    // 존재 확인
    const existing = await prisma.$queryRaw<any[]>`
      SELECT id, is_system FROM classification_rules WHERE id = ${id}
    `
    if (!existing[0]) {
      return NextResponse.json({ error: '룰 없음' }, { status: 404 })
    }

    // 동적 SET — undefined 는 변경 안 함
    const setParts: string[] = []
    const values: any[] = []
    if (pattern !== undefined) { setParts.push('pattern = ?'); values.push(pattern) }
    if (category !== undefined) { setParts.push('category = ?'); values.push(category) }
    if (subcategory !== undefined) { setParts.push('subcategory = ?'); values.push(subcategory || null) }
    if (match_car !== undefined) { setParts.push('match_car = ?'); values.push(match_car ? 1 : 0) }
    if (confidence !== undefined) {
      if (!VALID_CONFIDENCE.has(confidence)) {
        return NextResponse.json({ error: 'confidence 잘못됨' }, { status: 400 })
      }
      setParts.push('confidence = ?'); values.push(confidence)
    }
    if (amount_max !== undefined) { setParts.push('amount_max = ?'); values.push(amount_max ? Number(amount_max) : null) }
    if (amount_min !== undefined) { setParts.push('amount_min = ?'); values.push(amount_min ? Number(amount_min) : null) }
    if (tx_type !== undefined) { setParts.push('tx_type = ?'); values.push(tx_type || null) }
    if (is_active !== undefined) { setParts.push('is_active = ?'); values.push(is_active ? 1 : 0) }
    if (notes !== undefined) { setParts.push('notes = ?'); values.push(notes || null) }

    if (setParts.length === 0) {
      return NextResponse.json({ error: '변경 항목 없음' }, { status: 400 })
    }

    const sql = `UPDATE classification_rules SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = ?`
    await prisma.$executeRawUnsafe(sql, ...values, id)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    // 시스템 룰은 삭제 X — is_active=0 으로 비활성화 권장
    const existing = await prisma.$queryRaw<Array<{ is_system: number }>>`
      SELECT is_system FROM classification_rules WHERE id = ${id}
    `
    if (!existing[0]) {
      return NextResponse.json({ error: '룰 없음' }, { status: 404 })
    }
    if (existing[0].is_system === 1) {
      return NextResponse.json({
        error: '시스템 룰은 삭제할 수 없습니다. 비활성화(is_active=0)로 변경하세요.'
      }, { status: 403 })
    }

    await prisma.$executeRaw`DELETE FROM classification_rules WHERE id = ${id} AND is_system = 0`
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
