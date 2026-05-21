// ═══════════════════════════════════════════════════════════════════
// GET /api/ride-departments/tree — 계층 트리 + 부서별 활성 직원 수
// ═══════════════════════════════════════════════════════════════════
//
// 응답 구조:
//   {
//     data: [
//       { id, name, parent_id, leader_employee_id, leader_name,
//         color_tone, sort_order, description,
//         employee_count, total_count (자식 포함 누적),
//         children: [...]
//       },
//       ...
//     ],
//     error: null
//   }
//
// total_count: 자기 + 모든 자손의 active employee 합산
// employee_count: 자기 부서 active employee 만
//
// 사용처: /hr 통합 페이지 「외부 인력」 탭 좌측 부서 트리 렌더링.
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

type DeptRow = {
  id: string
  name: string
  parent_id: string | null
  leader_employee_id: string | null
  leader_name: string | null
  color_tone: string
  sort_order: number
  description: string | null
  is_active: boolean
  employee_count: number
}

type DeptNode = DeptRow & {
  children: DeptNode[]
  total_count: number
}

function migrationPending(err: any): boolean {
  const msg = String(err?.message || '')
  return /ride_departments.*doesn'?t exist/i.test(msg) || /Table.*ride_departments/i.test(msg)
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const sp = request.nextUrl.searchParams
    const includeInactive = sp.get('include_inactive') === '1'

    const where = includeInactive ? '' : 'WHERE rd.is_active = 1'

    const rows = await prisma.$queryRawUnsafe<DeptRow[]>(`
      SELECT
        rd.id, rd.name, rd.parent_id, rd.leader_employee_id,
        rd.color_tone, rd.sort_order, rd.description, rd.is_active,
        ldr.name AS leader_name,
        (
          SELECT COUNT(*) FROM ride_employees re
           WHERE re.department_id = rd.id AND re.is_active = 1
        ) AS employee_count
      FROM ride_departments rd
      LEFT JOIN ride_employees ldr ON ldr.id = rd.leader_employee_id
      ${where}
      ORDER BY rd.sort_order ASC, rd.name ASC
    `)

    // 트리 빌드 — map by id
    const byId = new Map<string, DeptNode>()
    const roots: DeptNode[] = []
    rows.forEach(r => {
      byId.set(r.id, {
        ...r,
        is_active: Boolean(r.is_active),
        employee_count: Number(r.employee_count || 0),
        total_count: Number(r.employee_count || 0),
        children: [],
      })
    })
    byId.forEach(node => {
      if (node.parent_id && byId.has(node.parent_id)) {
        byId.get(node.parent_id)!.children.push(node)
      } else {
        roots.push(node)
      }
    })

    // total_count 누적 — DFS post-order
    function accumulate(node: DeptNode): number {
      let total = node.employee_count
      for (const child of node.children) {
        total += accumulate(child)
      }
      node.total_count = total
      return total
    }
    roots.forEach(accumulate)

    return NextResponse.json({ data: serialize(roots), error: null })
  } catch (e: any) {
    if (migrationPending(e)) {
      return NextResponse.json({ data: [], error: null, _migration_pending: true })
    }
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
