/**
 * /api/ride-assets/assignee-options
 *
 * GET — 자산 매칭 대상 목록 (라이드 직원 + 외부인력 통합)
 *       등록/편집 모달의 매칭 드롭다운, 엑셀 이름 매칭에 사용.
 *
 * 응답: [{ kind: 'employee'|'freelancer', id, name, sub }]
 *   sub — 직원=부서 / 외부인력=서비스유형 (동명이인 구분 보조)
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface Option {
  kind: 'employee' | 'freelancer'
  id: string
  name: string
  sub: string | null
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })

  try {
    const emps = await prisma.$queryRaw<Array<{ id: string; name: string; department: string | null }>>`
      SELECT id, name, department FROM ride_employees
       WHERE is_active = 1 ORDER BY name
    `
    let frees: Array<{ id: string; name: string; service_type: string | null }> = []
    try {
      frees = await prisma.$queryRaw<Array<{ id: string; name: string; service_type: string | null }>>`
        SELECT id, name, service_type FROM freelancers
         WHERE is_active = 1 ORDER BY name
      `
    } catch { /* freelancers 없을 시 직원만 */ }

    const options: Option[] = [
      ...emps.map(e => ({ kind: 'employee' as const, id: e.id, name: e.name, sub: e.department })),
      ...frees.map(f => ({ kind: 'freelancer' as const, id: f.id, name: f.name, sub: f.service_type })),
    ]

    return NextResponse.json({
      success: true,
      data: options,
      meta: { employees: emps.length, freelancers: frees.length },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-assets/assignee-options GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}
