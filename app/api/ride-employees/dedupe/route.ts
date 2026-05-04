// ═══════════════════════════════════════════════════════════════════
// POST /api/ride-employees/dedupe
//   같은 이름 중복 검출 + 정리
//
// body:
//   { mode: 'preview' | 'apply' }
//   preview: 검출된 중복 그룹만 반환 (변경 없음)
//   apply:   같은 이름 중 가장 오래된(MIN(created_at))만 남기고 나머지 비활성화
//            cs_workers.employee_id 도 keep_id 로 자동 통합
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
    const mode: 'preview' | 'apply' = body?.mode === 'apply' ? 'apply' : 'preview'

    // 1) 같은 이름 (TRIM 해서) 중복 검출 — 활성 직원만
    const dupRows = await prisma.$queryRaw<any[]>`
      SELECT TRIM(name) AS name, COUNT(*) AS cnt,
             GROUP_CONCAT(id ORDER BY created_at ASC) AS ids,
             MIN(id) AS keep_id_alpha
      FROM ride_employees
      WHERE is_active = 1
      GROUP BY TRIM(name)
      HAVING COUNT(*) > 1
      ORDER BY name ASC
    `

    if (dupRows.length === 0) {
      return NextResponse.json({
        data: { mode, groups: [], removed: 0, message: '중복 직원 없음' },
        error: null,
      })
    }

    // 2) 그룹별 상세
    const groups: any[] = []
    for (const d of dupRows) {
      const ids: string[] = String(d.ids).split(',')
      const detailRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, name, department, position, hire_date, phone, email, color_tone, group_label, public_token, created_at
         FROM ride_employees WHERE id IN (${ids.map(() => '?').join(',')})
         ORDER BY created_at ASC`,
        ...ids,
      )
      // 첫 번째 (가장 오래된) row 가 keep
      groups.push({
        name: d.name,
        count: Number(d.cnt),
        keep_id: detailRows[0]?.id,
        rows: detailRows,
      })
    }

    if (mode === 'preview') {
      return NextResponse.json({
        data: { mode, groups, removed: 0 },
        error: null,
      })
    }

    // 3) apply: 각 그룹의 keep_id 제외한 나머지 처리
    let removed = 0
    let workersUpdated = 0
    for (const g of groups) {
      const removeIds = g.rows.slice(1).map((r: any) => r.id)
      if (removeIds.length === 0) continue

      // ① cs_workers.employee_id 를 keep_id 로 통합
      for (const rid of removeIds) {
        const r = await prisma.$executeRaw`
          UPDATE cs_workers
          SET employee_id = ${g.keep_id}, updated_at = NOW()
          WHERE employee_id = ${rid}
        `
        workersUpdated += Number(r)
      }

      // ② 중복 ride_employees 비활성화 (soft delete)
      const placeholders = removeIds.map(() => '?').join(',')
      const sql = `UPDATE ride_employees
                   SET is_active = 0, resign_date = COALESCE(resign_date, CURDATE()),
                       memo = CONCAT(COALESCE(memo, ''), ' [중복 정리: ', NOW(), ']'),
                       updated_at = NOW()
                   WHERE id IN (${placeholders})`
      await prisma.$executeRawUnsafe(sql, ...removeIds)
      removed += removeIds.length
    }

    return NextResponse.json({
      data: {
        mode, groups,
        removed,
        cs_workers_updated: workersUpdated,
        message: `${removed}건 비활성화 (cs_workers ${workersUpdated}건 keep_id 로 통합)`,
      },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
