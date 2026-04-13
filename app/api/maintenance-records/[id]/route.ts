import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { safeUpdateById } from '@/lib/sql-utils'

// 단독 회사 ERP — company_id 컬럼 제거됨
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params
    const body = await request.json()
    await safeUpdateById('maintenance_records', id, body)
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    return NextResponse.json({ data: null, error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params
    await prisma.$executeRaw`DELETE FROM maintenance_records WHERE id = ${id}`
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    return NextResponse.json({ data: null, error: e.message }, { status: 500 })
  }
}
