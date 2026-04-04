import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/company?id=xxx — 회사 정보 조회 (단독 ERP)
export async function GET(req: NextRequest) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    // companies 테이블 존재 여부에 따라 분기
    try {
      const data = await prisma.$queryRawUnsafe<any[]>('SELECT * FROM companies LIMIT 1')
      if (data && data.length > 0) {
        return NextResponse.json(serialize(data[0]))
      }
    } catch {
      // 테이블 없으면 기본 회사 정보 반환
    }

    // 기본 단독 회사 정보 반환
    return NextResponse.json({
      id: 'fmi-single',
      name: '주식회사 에프엠아이',
      business_number: '',
      representative: '',
      address: '',
      phone: '',
      email: '',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/company — 회사 정보 수정
export async function PATCH(req: NextRequest) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await req.json()
    const { id, ...fields } = body

    if (!id) {
      return NextResponse.json({ error: '회사 ID가 필요합니다.' }, { status: 400 })
    }

    // companies 테이블 존재 확인
    try {
      const current = await prisma.$queryRawUnsafe<any[]>('SELECT * FROM companies WHERE id = ?', id)

      if (!current || current.length === 0) {
        return NextResponse.json({ error: '회사를 찾을 수 없습니다.' }, { status: 404 })
      }

      const existingColumns = Object.keys(current[0])
      const updatePayload: Record<string, any> = {}
      for (const [key, value] of Object.entries(fields)) {
        if (existingColumns.includes(key)) {
          updatePayload[key] = value
        }
      }

      const missingColumns = Object.keys(fields).filter(k => !existingColumns.includes(k))

      if (Object.keys(updatePayload).length === 0) {
        return NextResponse.json({ error: '업데이트할 필드가 없습니다.', missingColumns }, { status: 400 })
      }

      const setClauses = Object.keys(updatePayload).map(k => `${k} = ?`).join(', ')
      const values = [...Object.values(updatePayload), id]
      await prisma.$executeRawUnsafe(`UPDATE companies SET ${setClauses} WHERE id = ?`, ...values)

      return NextResponse.json({ success: true, updated: Object.keys(updatePayload), missingColumns })
    } catch (e: any) {
      if (e.message?.includes("doesn't exist")) {
        return NextResponse.json({ error: 'companies 테이블이 존재하지 않습니다.' }, { status: 500 })
      }
      throw e
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
