import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// PATCH /api/transactions/[id]
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const { id } = params
    const body = await request.json()
    const { status, category, amount, client_name, description, related_type, related_id } = body

    // Build dynamic update
    const updates: string[] = []
    if (status !== undefined)       updates.push(`status = '${status}'`)
    if (category !== undefined)     updates.push(`category = '${category.replace(/'/g, "''")}'`)
    if (amount !== undefined)       updates.push(`amount = ${Number(amount)}`)
    if (client_name !== undefined)  updates.push(`client_name = '${client_name.replace(/'/g, "''")}'`)
    if (description !== undefined)  updates.push(`description = '${description.replace(/'/g, "''")}'`)
    if (related_type !== undefined) updates.push(`related_type = ${related_type ? `'${related_type}'` : 'NULL'}`)
    if (related_id !== undefined)   updates.push(`related_id = ${related_id ? `'${related_id}'` : 'NULL'}`)

    if (updates.length === 0) return NextResponse.json({ error: '업데이트할 필드 없음' }, { status: 400 })

    updates.push('updated_at = NOW()')
    await prisma.$executeRawUnsafe(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`, id)

    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[PATCH /api/transactions/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/transactions/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const { id } = params
    await prisma.$executeRaw`DELETE FROM transactions WHERE id = ${id}`
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[DELETE /api/transactions/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
