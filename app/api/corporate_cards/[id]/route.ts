import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// PATCH /api/corporate_cards/[id]
// 실제 DB 컬럼만: card_number, card_alias, holder_name, assigned_employee_id, assigned_car_id, status
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const body = await request.json()

    // 동적 UPDATE — 전달된 필드만
    const sets: string[] = []
    const values: any[] = []
    const allowed = ['card_number', 'card_alias', 'holder_name', 'assigned_employee_id', 'assigned_car_id', 'status']
    for (const key of allowed) {
      if (key in body) {
        // 화이트리스트 통과 필드만 컬럼명에 포함 — 백틱 이스케이프
        sets.push(`\`${key}\` = ?`)
        values.push(body[key] === '' ? null : body[key])
      }
    }
    if (sets.length === 0) {
      return NextResponse.json({ data: { id }, error: null })
    }
    sets.push('`updated_at` = NOW(3)')
    values.push(id)

    await prisma.$executeRawUnsafe(
      `UPDATE corporate_cards SET ${sets.join(', ')} WHERE id = ?`,
      ...values
    )

    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM corporate_cards WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(updated[0]), error: null })
  } catch (e: any) {
    console.error('[PATCH /api/corporate_cards/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/corporate_cards/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    await prisma.$executeRaw`DELETE FROM corporate_cards WHERE id = ${id}`
    return NextResponse.json({ data: null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
