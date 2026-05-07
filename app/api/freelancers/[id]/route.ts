import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const UPDATABLE = new Set([
  'name', 'phone', 'email', 'bank_name', 'account_number', 'account_holder',
  'reg_number', 'tax_type', 'service_type', 'is_active', 'memo', 'linked_profile_id',
])

// PATCH /api/freelancers/[id] — 부분 갱신 (실재 컬럼만)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const body = await request.json()
    const existingCols: string[] = (await prisma.$queryRawUnsafe<any[]>(
      `SHOW COLUMNS FROM freelancers`
    )).map((c: any) => c.Field)

    const sets: string[] = []
    const values: any[] = []
    for (const k of Object.keys(body)) {
      if (!UPDATABLE.has(k)) continue
      if (!existingCols.includes(k)) continue
      let v = body[k]
      if (v === '') v = null
      if (typeof v === 'boolean') v = v ? 1 : 0
      sets.push(`${k} = ?`)
      values.push(v)
    }
    if (sets.length === 0) return NextResponse.json({ data: { id }, error: null })
    if (existingCols.includes('updated_at')) sets.push('updated_at = NOW()')
    values.push(id)

    await prisma.$executeRawUnsafe(
      `UPDATE freelancers SET ${sets.join(', ')} WHERE id = ?`,
      ...values,
    )
    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM freelancers WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(updated[0]), error: null })
  } catch (e: any) {
    console.error('[freelancers PATCH]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/freelancers/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    await prisma.$executeRaw`DELETE FROM freelancers WHERE id = ${id}`
    return NextResponse.json({ error: null }, { status: 204 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
