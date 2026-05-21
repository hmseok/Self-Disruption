// ═══════════════════════════════════════════════════════════════════
// POST /api/ride-employees/bulk-assign — 일괄 부서 변경
// ═══════════════════════════════════════════════════════════════════
//
// body: { employee_ids: string[], department_id: string | null }
//   · department_id=null → 부서 해제 (미배정 상태로)
//   · employee_ids 가 비어있으면 400
//
// 응답: { data: { applied: N, total: M, failed: [{id, error}] }, error: null }
//
// Rule 10 — apply 후 자기 검증:
//   UPDATE 후 동일 SELECT 로 적용된 row 카운트 검증
//
// Rule 14 — 동형 패턴: ride-employees PATCH 와 같은 검증 흐름
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const employeeIds: string[] = Array.isArray(body?.employee_ids) ? body.employee_ids : []
    const departmentId: string | null = body?.department_id ?? null

    if (employeeIds.length === 0) {
      return NextResponse.json({ error: 'employee_ids 가 비어있습니다.' }, { status: 400 })
    }
    if (employeeIds.length > 200) {
      return NextResponse.json({ error: '한 번에 200명 이하만 변경 가능합니다.' }, { status: 400 })
    }

    // 부서 존재 검증 (NULL 이면 skip)
    if (departmentId) {
      const deptCheck = await prisma.$queryRaw<any[]>`
        SELECT id FROM ride_departments WHERE id = ${departmentId} AND is_active = 1 LIMIT 1
      `
      if (deptCheck.length === 0) {
        return NextResponse.json({ error: '대상 부서가 없거나 비활성 상태입니다.' }, { status: 404 })
      }
    }

    // 일괄 UPDATE — IN 절 동적 (employee_ids 길이 ≤ 200)
    const placeholders = employeeIds.map(() => '?').join(',')
    const sql = `
      UPDATE ride_employees
         SET department_id = ?, updated_at = NOW()
       WHERE id IN (${placeholders})
    `
    const params = [departmentId, ...employeeIds]
    await prisma.$executeRawUnsafe(sql, ...params)

    // Rule 10 — apply 후 검증
    const verifySql = `
      SELECT id, name, department_id FROM ride_employees WHERE id IN (${placeholders})
    `
    const verified = await prisma.$queryRawUnsafe<any[]>(verifySql, ...employeeIds)
    const applied = verified.filter(r => r.department_id === departmentId).length
    const failed = verified
      .filter(r => r.department_id !== departmentId)
      .map(r => ({ id: r.id, name: r.name, error: '적용 실패' }))

    return NextResponse.json({
      data: {
        applied,
        total: employeeIds.length,
        failed: serialize(failed),
        department_id: departmentId,
      },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
