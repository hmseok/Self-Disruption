import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const body = await request.json()
    const cols = Object.keys(body).map(k => `${k} = ${typeof body[k] === 'string' ? `'${body[k]}'` : body[k]}`).join(', ')
    await prisma.$queryRawUnsafe(`UPDATE car_costs SET ${cols}, updated_at = NOW() WHERE id = '${params.id}' AND company_id = '${user.company_id}'`)
    return NextResponse.json({ data: { id: params.id }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    await prisma.$queryRaw`DELETE FROM car_costs WHERE id = ${params.id} AND company_id = ${user.company_id}`
    return NextResponse.json({ data: { id: params.id }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
