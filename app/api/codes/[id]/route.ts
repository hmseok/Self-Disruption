import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const id = params.id
    const body = await request.json()

    const updated = await prisma.$queryRaw<any[]>`
      UPDATE common_codes
      SET ${Object.entries(body).map(([k, v]) => `${k} = ${typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v}`).join(', ')}
      WHERE id = ${id}
    `

    const result = await prisma.$queryRaw<any[]>`
      SELECT * FROM common_codes WHERE id = ${id} LIMIT 1
    `

    return NextResponse.json({
      data: serialize(result[0] || null),
      error: null
    })
  } catch (e: any) {
    console.error('PATCH /api/codes/[id]:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const id = params.id

    await prisma.$executeRaw`
      DELETE FROM common_codes WHERE id = ${id}
    `

    return NextResponse.json({
      data: null,
      error: null
    })
  } catch (e: any) {
    console.error('DELETE /api/codes/[id]:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
