import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// BigInt / Decimal 객체 → 문자열로 정규화 (NextResponse.json 직렬화 실패 방지)
function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

// ═══════════════════════════════════════════════════════════
// 카드/통장 → 차량 매핑 관리 API (PHASE 2)
//
// GET  /api/finance/mappings          전체 매핑 목록 (카드+은행)
// POST /api/finance/mappings          매핑 추가/수정
// DELETE /api/finance/mappings?id=... 매핑 삭제
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
  // 법인카드 목록 (차량 정보 JOIN)
  const cards = await prisma.$queryRaw<any[]>`
    SELECT c.id, c.card_number, c.card_alias, c.card_issuer, c.holder_name,
           c.assigned_car_id, c.assigned_employee_id, c.status,
           car.number AS car_number, CONCAT_WS(' ', car.brand, car.model) AS car_model
    FROM corporate_cards c
    LEFT JOIN cars car ON c.assigned_car_id = car.id
    ORDER BY c.created_at DESC
  `

  // 은행계좌 매핑 (차량 정보 JOIN)
  let bankAccounts: any[] = []
  try {
    bankAccounts = await prisma.$queryRaw<any[]>`
      SELECT b.id, b.account_alias, b.bank_issuer, b.bank_name, b.account_holder,
             b.assigned_car_id, b.purpose, b.memo, b.status,
             car.number AS car_number, CONCAT_WS(' ', car.brand, car.model) AS car_model
      FROM bank_account_mappings b
      LEFT JOIN cars car ON b.assigned_car_id = car.id
      ORDER BY b.created_at DESC
    `
  } catch { /* 테이블 미존재 */ }

  // 차량 목록 (드롭다운용)
  const cars = await prisma.$queryRaw<any[]>`
    SELECT id, number, brand, model FROM cars WHERE status != 'deleted' ORDER BY number
  `

  // SMS에서 감지된 카드/은행 목록 (미등록 카드 찾기용)
  const smsAliases = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT card_alias, card_issuer
    FROM card_sms_transactions
    WHERE parse_status = 'parsed' AND card_alias IS NOT NULL
    ORDER BY card_issuer, card_alias
  `

  return NextResponse.json(serialize({
    cards,
    bankAccounts,
    cars,
    smsAliases,
  }))
  } catch (e: any) {
    console.error('[mappings GET] 실패:', e)
    return NextResponse.json({ error: e.message || '조회 실패', cards: [], bankAccounts: [], cars: [], smsAliases: [] }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { type, id, card_alias, card_issuer, holder_name, assigned_car_id,
          assigned_employee_id, status, card_type, card_holder_type,
          card_number,
          account_alias, bank_issuer, bank_name, account_holder, purpose, memo } = body

  if (type === 'card') {
    if (id) {
      // 수정 — 신규 메타필드(status/card_type/card_holder_type/assigned_employee_id) 포함
      await prisma.$executeRaw`
        UPDATE corporate_cards SET
          card_alias = ${card_alias || null},
          card_issuer = ${card_issuer || null},
          holder_name = ${holder_name || null},
          assigned_car_id = ${assigned_car_id || null},
          assigned_employee_id = ${assigned_employee_id || null},
          status = ${status || 'active'},
          card_type = ${card_type || null},
          card_holder_type = ${card_holder_type || null},
          updated_at = NOW()
        WHERE id = ${id}
      `
    } else {
      // 새 카드 등록
      await prisma.$executeRaw`
        INSERT INTO corporate_cards (id, card_number, card_alias, card_issuer, holder_name,
          assigned_car_id, assigned_employee_id, status, card_type, card_holder_type, created_at, updated_at)
        VALUES (${randomUUID()}, ${card_number || null}, ${card_alias}, ${card_issuer || null}, ${holder_name || null},
          ${assigned_car_id || null}, ${assigned_employee_id || null}, ${status || 'active'},
          ${card_type || '법인신용'}, ${card_holder_type || '무기명'}, NOW(), NOW())
      `
    }
  } else if (type === 'bank') {
    if (id) {
      await prisma.$executeRaw`
        UPDATE bank_account_mappings SET
          account_alias = ${account_alias || null},
          bank_issuer = ${bank_issuer || null},
          bank_name = ${bank_name || null},
          account_holder = ${account_holder || null},
          assigned_car_id = ${assigned_car_id || null},
          purpose = ${purpose || null},
          memo = ${memo || null},
          updated_at = NOW()
        WHERE id = ${id}
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO bank_account_mappings (id, account_alias, bank_issuer, bank_name, account_holder, assigned_car_id, purpose, memo, status, created_at, updated_at)
        VALUES (${randomUUID()}, ${account_alias}, ${bank_issuer || ''}, ${bank_name || null}, ${account_holder || null}, ${assigned_car_id || null}, ${purpose || null}, ${memo || null}, 'active', NOW(), NOW())
      `
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  const type = req.nextUrl.searchParams.get('type')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (type === 'bank') {
    await prisma.$executeRaw`DELETE FROM bank_account_mappings WHERE id = ${id}`
  } else {
    await prisma.$executeRaw`DELETE FROM corporate_cards WHERE id = ${id}`
  }

  return NextResponse.json({ ok: true })
}
