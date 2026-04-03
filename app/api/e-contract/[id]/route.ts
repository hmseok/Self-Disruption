import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const data = await prisma.$queryRaw<any[]>`
      SELECT * FROM short_term_rental_contracts WHERE id = ${id} LIMIT 1
    `
    if (!data || data.length === 0) return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    return NextResponse.json(serialize(data[0]))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  try {
    const updateFields = Object.entries(body).map(([key, value]) => `${key} = '${value}'`).join(', ')
    await prisma.$executeRaw`
      UPDATE short_term_rental_contracts SET ${updateFields} WHERE id = ${id}
    `
    const data = await prisma.$queryRaw<any[]>`
      SELECT * FROM short_term_rental_contracts WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json(serialize(data[0]))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
