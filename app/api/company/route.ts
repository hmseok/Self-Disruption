import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// GET /api/company?id=xxx — 회사 정보 조회
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('id')
    if (!companyId) {
      return NextResponse.json({ error: '회사 ID가 필요합니다.' }, { status: 400 })
    }

    const data = await prisma.$queryRaw<any[]>`SELECT * FROM companies WHERE id = ${companyId}`

    if (!data || data.length === 0) {
      return NextResponse.json({ error: '회사를 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json(data[0])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/company — 회사 정보 수정 (존재하는 컬럼만 동적 업데이트)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...fields } = body

    if (!id) {
      return NextResponse.json({ error: '회사 ID가 필요합니다.' }, { status: 400 })
    }

    // 먼저 현재 데이터를 조회하여 실제 존재하는 컬럼만 업데이트
    const current = await prisma.$queryRaw<any[]>`SELECT * FROM companies WHERE id = ${id}`

    if (!current || current.length === 0) {
      return NextResponse.json({ error: '회사를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 실제 테이블에 존재하는 컬럼만 필터링
    const existingColumns = Object.keys(current[0])
    const updatePayload: Record<string, any> = {}
    for (const [key, value] of Object.entries(fields)) {
      if (existingColumns.includes(key)) {
        updatePayload[key] = value
      }
    }

    // 없는 컬럼: MySQL에서는 ALTER TABLE이 필요하므로 스킵하고 경고만 제공
    const missingColumns = Object.keys(fields).filter(k => !existingColumns.includes(k))
    if (missingColumns.length > 0) {
      console.warn(`[company PATCH] 다음 컬럼이 존재하지 않습니다 (수동 추가 필요): ${missingColumns.join(', ')}`)
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: '업데이트할 필드가 없습니다.', missingColumns }, { status: 400 })
    }

    // Build UPDATE query
    const setClauses = Object.entries(updatePayload)
      .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
      .join(', ')

    await prisma.$executeRawUnsafe(`UPDATE companies SET ${setClauses} WHERE id = ?`, id)

    return NextResponse.json({ success: true, updated: Object.keys(updatePayload), missingColumns })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
