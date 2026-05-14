import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════
// /api/meetings/mentions/entities — >ERP 엔티티 멘션 검색 (PR-MTG-V2-C-3)
//
// GET ?q=&limit= → [{ id, type, label, subtitle }]
//   type: contract | car | customer
//
// Promise.all 3 query — 각 max 5개 → 합쳐서 max 15개
// graceful — 한 테이블 실패해도 다른 결과 반환
// ═══════════════════════════════════════════════════════════════

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

interface EntityRow {
  id: string
  type: 'contract' | 'car' | 'customer'
  label: string
  subtitle?: string
}

async function searchContracts(q: string, limit: number): Promise<EntityRow[]> {
  try {
    const fuzzy = `%${q}%`
    // contracts: customer_name 검색 — Rule 11 확인 컬럼
    const rows = q
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, customer_name AS label
             FROM contracts
            WHERE customer_name LIKE ?
            ORDER BY id DESC
            LIMIT ?`,
          fuzzy, limit
        )
      : await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, customer_name AS label FROM contracts ORDER BY id DESC LIMIT ?`,
          limit
        )
    return rows.map(r => ({
      id: String(r.id), type: 'contract' as const,
      label: String(r.label || '(고객명 없음)'),
      subtitle: '계약',
    }))
  } catch (e: any) {
    console.warn('[entities/contracts]', e?.message)
    return []
  }
}

async function searchCars(q: string, limit: number): Promise<EntityRow[]> {
  try {
    const fuzzy = `%${q}%`
    // cars: number / brand / model — Rule 11 확인 컬럼
    const rows = q
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, number, brand, model
             FROM cars
            WHERE number LIKE ? OR brand LIKE ? OR model LIKE ?
            ORDER BY created_at DESC
            LIMIT ?`,
          fuzzy, fuzzy, fuzzy, limit
        )
      : await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, number, brand, model FROM cars ORDER BY created_at DESC LIMIT ?`,
          limit
        )
    return rows.map(r => ({
      id: String(r.id), type: 'car' as const,
      label: String(r.number || '(번호 없음)'),
      subtitle: [r.brand, r.model].filter(Boolean).join(' ') || '차량',
    }))
  } catch (e: any) {
    console.warn('[entities/cars]', e?.message)
    return []
  }
}

async function searchCustomers(q: string, limit: number): Promise<EntityRow[]> {
  try {
    const fuzzy = `%${q}%`
    // customers: name / phone / email — Rule 11 확인 컬럼
    const rows = q
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, name, phone
             FROM customers
            WHERE name LIKE ? OR phone LIKE ? OR email LIKE ?
            ORDER BY created_at DESC
            LIMIT ?`,
          fuzzy, fuzzy, fuzzy, limit
        )
      : await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, name, phone FROM customers ORDER BY created_at DESC LIMIT ?`,
          limit
        )
    return rows.map(r => ({
      id: String(r.id), type: 'customer' as const,
      label: String(r.name || '(이름 없음)'),
      subtitle: r.phone || '고객',
    }))
  } catch (e: any) {
    console.warn('[entities/customers]', e?.message)
    return []
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const q = (searchParams.get('q') || '').trim()
    const limit = Math.min(15, Math.max(3, parseInt(searchParams.get('limit') || '10', 10)))
    const perType = Math.max(2, Math.min(5, Math.ceil(limit / 3)))

    const [contracts, cars, customers] = await Promise.all([
      searchContracts(q, perType),
      searchCars(q, perType),
      searchCustomers(q, perType),
    ])

    // 합쳐서 type 순으로 정렬 (계약 → 차량 → 고객)
    const combined = [...contracts, ...cars, ...customers].slice(0, limit)
    return NextResponse.json({ data: serialize(combined), error: null })
  } catch (e: any) {
    console.error('[GET /api/meetings/mentions/entities]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
