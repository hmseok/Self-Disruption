import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const termsId = searchParams.get('termsId')

    if (!termsId) {
      return NextResponse.json({ error: 'termsId 파라미터가 필요합니다.' }, { status: 400 })
    }

    const data = await prisma.$queryRaw<any[]>`
      SELECT article_number, title, content
      FROM contract_term_articles
      WHERE terms_id = ${termsId}
      ORDER BY article_number ASC
    `

    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
