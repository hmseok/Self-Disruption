import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.sub || payload.user_id || null
  } catch { return null }
}

async function verifyUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    const token = authHeader.replace('Bearer ', '')
    const userId = getUserIdFromToken(token)
    if (!userId) return null
    const profiles = await prisma.$queryRaw<any[]>`SELECT id, role, company_id FROM profiles WHERE id = ${userId} LIMIT 1`
    const profile = profiles[0]
    return profile ? { id: userId, ...profile } : null
  } catch { return null }
}

// PATCH /api/contract_terms/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = params.id

    await prisma.$executeRaw`
      UPDATE contract_terms SET
        version = COALESCE(${body.version || null}, version),
        title = COALESCE(${body.title || null}, title),
        description = COALESCE(${body.description || null}, description),
        status = COALESCE(${body.status || null}, status),
        pdf_defaults = COALESCE(${body.pdf_defaults ? JSON.stringify(body.pdf_defaults) : null}, pdf_defaults),
        effective_from = COALESCE(${body.effective_from || null}, effective_from),
        effective_to = COALESCE(${body.effective_to || null}, effective_to),
        insurance_coverage = COALESCE(${body.insurance_coverage ? JSON.stringify(body.insurance_coverage) : null}, insurance_coverage),
        quote_notices = COALESCE(${body.quote_notices ? JSON.stringify(body.quote_notices) : null}, quote_notices),
        calc_params = COALESCE(${body.calc_params ? JSON.stringify(body.calc_params) : null}, calc_params),
        updated_at = NOW()
      WHERE id = ${id}
    `

    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM contract_terms WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(updated[0]), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/contract_terms/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const id = params.id

    await prisma.$executeRaw`
      DELETE FROM contract_terms WHERE id = ${id}
    `

    return NextResponse.json({ error: null }, { status: 204 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
