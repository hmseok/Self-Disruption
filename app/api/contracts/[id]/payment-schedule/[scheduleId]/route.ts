import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string; scheduleId: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { scheduleId } = params
    const body = await request.json()

    const fields = Object.keys(body).filter(k => k !== 'id' && k !== 'contract_id')
    if (fields.length === 0) {
      return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 })
    }

    const setClause = fields.map(f => `${f} = ?`).join(', ')
    const vals = fields.map(f => body[f])

    await prisma.$executeRawUnsafe(
      `UPDATE payment_schedules SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      ...vals,
      scheduleId
    )

    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM payment_schedules WHERE id = ${scheduleId} LIMIT 1`
    return NextResponse.json({ data: serialize(updated[0]), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
