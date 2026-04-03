import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

function getUserIdFromToken(token: string): string | null {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return p.sub || p.user_id || null
  } catch {
    return null
  }
}

async function verifyUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    const userId = getUserIdFromToken(authHeader.replace('Bearer ', ''))
    if (!userId) return null
    const profiles = await prisma.$queryRaw<any[]>`SELECT id, role, company_id FROM profiles WHERE id = ${userId} LIMIT 1`
    return profiles[0] ? { id: userId, ...profiles[0] } : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const data = await prisma.$queryRaw<any[]>`SELECT * FROM companies WHERE id = ${params.id} LIMIT 1`

    return NextResponse.json({ data: data[0] || null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const updates: string[] = []
    const values: any[] = []

    for (const [key, value] of Object.entries(body)) {
      updates.push(`${key} = ?`)
      values.push(value)
    }

    values.push(params.id)

    if (updates.length === 0) {
      const data = await prisma.$queryRaw<any[]>`SELECT * FROM companies WHERE id = ${params.id} LIMIT 1`
      return NextResponse.json({ data: serialize(data[0]), error: null })
    }

    await prisma.$executeRawUnsafe(
      `UPDATE companies SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      ...values
    )

    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM companies WHERE id = ${params.id} LIMIT 1`
    return NextResponse.json({ data: serialize(updated[0]), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    await prisma.$executeRaw`DELETE FROM companies WHERE id = ${params.id}`

    return NextResponse.json({ data: null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
