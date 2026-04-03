import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  assignHandler,
  executeAssignment,
  suggestAssignment,
  type AccidentForAssignment,
} from '../lib/assignment-engine'

// ── Auth helpers
function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.sub || payload.user_id || null
  } catch { return null }
}

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const userId = getUserIdFromToken(token)
  if (!userId) return null
  // TODO: Phase 5 - Replace with Firebase Auth verification
  const profiles = await prisma.$queryRaw<any[]>`SELECT * FROM profiles WHERE id = ${userId} LIMIT 1`
  const profile = profiles[0]
  return profile ? { id: userId, ...profile } : null
}

// ── Serialize helper
function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ));
}

// ============================================
// GET — 배정 현황 조회
// ============================================
// ?action=workload    → 담당자별 워크로드
// ?action=rules       → 배정 룰 목록
// ?action=suggest&id= → 특정 사고건 배정 추천
// ?action=log&id=     → 배정 이력
// ?action=unassigned  → 미배정 건 목록
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'workload'
  const companyId = searchParams.get('company_id')
  const accidentId = searchParams.get('id')

  if (!companyId) {
    return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })
  }

  switch (action) {
    // ── 담당자별 워크로드
    case 'workload': {
      const handlers = await prisma.$queryRaw<any[]>`
        SELECT hc.*, p.id, p.employee_name, p.phone, p.avatar_url
        FROM handler_capacity hc
        LEFT JOIN profiles p ON hc.handler_id = p.id
        ORDER BY hc.created_at
      `

      if (!handlers) return NextResponse.json({ handlers: [] })

      // 각 담당자의 활성 건 수 조회
      const result = await Promise.all(handlers.map(async (h) => {
        const activeCountResult = await prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count
          FROM accident_records
          WHERE handler_id = ${h.handler_id}
          AND status IN ('reported', 'insurance_filed', 'repairing')
        `
        const activeCount = activeCountResult[0]?.count || 0

        const totalCountResult = await prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count
          FROM accident_records
          WHERE handler_id = ${h.handler_id}
        `
        const totalCount = totalCountResult[0]?.count || 0

        return {
          ...h,
          active_count: activeCount,
          total_count: totalCount,
          utilization: ((activeCount || 0) / (h.max_cases || 20) * 100).toFixed(0),
        }
      }))

      return NextResponse.json({ handlers: serialize(result) })
    }

    // ── 배정 룰 목록
    case 'rules': {
      const rules = await prisma.$queryRaw<any[]>`
        SELECT ar.*, p.id as handler_id, p.employee_name
        FROM assignment_rules ar
        LEFT JOIN profiles p ON ar.handler_id = p.id
        ORDER BY ar.priority, ar.rule_type
      `

      return NextResponse.json({ rules: serialize(rules || []) })
    }

    // ── 배정 추천
    case 'suggest': {
      if (!accidentId) {
        return NextResponse.json({ error: 'id (사고건 ID) 필요' }, { status: 400 })
      }

      const accidents = await prisma.$queryRaw<any[]>`
        SELECT *
        FROM accident_records
        WHERE id = ${parseInt(accidentId)}
        LIMIT 1
      `

      const accident = accidents[0]
      if (!accident) {
        return NextResponse.json({ error: '사고건을 찾을 수 없습니다' }, { status: 404 })
      }

      const suggestion = await suggestAssignment(accident as AccidentForAssignment)
      return NextResponse.json(serialize(suggestion))
    }

    // ── 배정 이력
    case 'log': {
      let query = `
        SELECT al.*, p.employee_name as handler_name, ap.employee_name as assigner_name
        FROM assignment_log al
        LEFT JOIN profiles p ON al.handler_id = p.id
        LEFT JOIN profiles ap ON al.assigned_by = ap.id
        ORDER BY al.created_at DESC
        LIMIT 50
      `

      if (accidentId) {
        query = `
          SELECT al.*, p.employee_name as handler_name, ap.employee_name as assigner_name
          FROM assignment_log al
          LEFT JOIN profiles p ON al.handler_id = p.id
          LEFT JOIN profiles ap ON al.assigned_by = ap.id
          WHERE al.accident_id = ${parseInt(accidentId)}
          ORDER BY al.created_at DESC
          LIMIT 50
        `
      }

      const logs = await prisma.$queryRawUnsafe<any[]>(query)
      return NextResponse.json({ logs: serialize(logs || []) })
    }

    // ── 미배정 건 목록
    case 'unassigned': {
      const unassigned = await prisma.$queryRaw<any[]>`
        SELECT ar.id, ar.accident_date, ar.accident_time, ar.accident_location,
               ar.client_name, ar.fault_type, ar.region_sido, ar.region_sigungu,
               ar.driver_name, ar.insurance_company, ar.status, ar.vehicle_condition,
               ar.repair_shop_name, ar.notes,
               c.number as car_number, c.brand as car_brand, c.model as car_model
        FROM accident_records ar
        LEFT JOIN cars c ON ar.car_id = c.id
        WHERE ar.handler_id IS NULL
        AND ar.status IN ('reported', 'insurance_filed', 'repairing')
        ORDER BY ar.accident_date DESC
      `

      return NextResponse.json({ accidents: serialize(unassigned || []) })
    }

    default:
      return NextResponse.json({ error: `알 수 없는 action: ${action}` }, { status: 400 })
  }
}

// ============================================
// POST — 수동 배정 / 룰 생성 / 담당자 등록
// ============================================
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action } = body

  switch (action) {
    // ── 수동 배정
    case 'assign': {
      const { accident_id, handler_id, assigned_by } = body

      if (!accident_id || !handler_id) {
        return NextResponse.json({ error: 'accident_id, handler_id 필요' }, { status: 400 })
      }

      const result = await executeAssignment(accident_id, handler_id, {
        match_type: 'manual',
        matched_rule: '수동 배정',
        is_auto: false,
        assigned_by,
      })

      if (result.success) {
        await prisma.$executeRaw`
          UPDATE accident_records
          SET assigned_at = NOW(), assignment_type = 'manual', assignment_rule = '수동 배정'
          WHERE id = ${accident_id}
        `
      }

      return NextResponse.json(result)
    }

    // ── 배정 룰 생성
    case 'create_rule': {
      const { company_id, rule_type, rule_value, handler_id, priority, description } = body

      if (!company_id || !rule_type || !rule_value || !handler_id) {
        return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })
      }

      try {
        const ruleId = require('crypto').randomUUID?.() || Math.random().toString(36).substring(7)
        await prisma.$executeRaw`
          INSERT INTO assignment_rules (id, company_id, rule_type, rule_value, handler_id, priority, description, is_active)
          VALUES (${ruleId}, ${company_id}, ${rule_type}, ${rule_value}, ${handler_id}, ${priority || 10}, ${description || ''}, 1)
        `

        const rules = await prisma.$queryRaw<any[]>`
          SELECT * FROM assignment_rules WHERE id = ${ruleId} LIMIT 1
        `
        const rule = rules[0]

        return NextResponse.json({ rule: serialize(rule) })
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
    }

    // ── 담당자 등록/수정
    case 'upsert_handler': {
      const { company_id, handler_id, max_cases, is_available, team, speciality, regions } = body

      if (!company_id || !handler_id) {
        return NextResponse.json({ error: 'company_id, handler_id 필요' }, { status: 400 })
      }

      try {
        // Check if exists
        const existing = await prisma.$queryRaw<any[]>`
          SELECT * FROM handler_capacity WHERE company_id = ${company_id} AND handler_id = ${handler_id} LIMIT 1
        `

        if (existing && existing.length > 0) {
          // UPDATE
          await prisma.$executeRaw`
            UPDATE handler_capacity
            SET max_cases = ${max_cases || 20}, is_available = ${is_available !== false ? 1 : 0}, team = ${team || 'accident'}, speciality = ${JSON.stringify(speciality || [])}, regions = ${JSON.stringify(regions || [])}
            WHERE company_id = ${company_id} AND handler_id = ${handler_id}
          `
        } else {
          // INSERT
          await prisma.$executeRaw`
            INSERT INTO handler_capacity (company_id, handler_id, max_cases, is_available, team, speciality, regions)
            VALUES (${company_id}, ${handler_id}, ${max_cases || 20}, ${is_available !== false ? 1 : 0}, ${team || 'accident'}, ${JSON.stringify(speciality || [])}, ${JSON.stringify(regions || [])})
          `
        }

        const handlers = await prisma.$queryRaw<any[]>`
          SELECT * FROM handler_capacity WHERE company_id = ${company_id} AND handler_id = ${handler_id} LIMIT 1
        `
        const handler = handlers[0]

        return NextResponse.json({ handler: serialize(handler) })
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
    }

    // ── 일괄 자동 배정 (미배정 건 전체)
    case 'auto_assign_all': {
      const unassigned = await prisma.$queryRaw<any[]>`
        SELECT * FROM accident_records
        WHERE handler_id IS NULL
        AND status IN ('reported', 'insurance_filed', 'repairing')
      `

      if (!unassigned || unassigned.length === 0) {
        return NextResponse.json({ message: '미배정 건 없음', assigned: 0 })
      }

      let assigned = 0
      const results: Array<{ id: number; handler: string | null; rule: string | null }> = []

      for (const acc of unassigned) {
        const result = await assignHandler(acc as AccidentForAssignment)

        if (result.handler_id) {
          await executeAssignment(acc.id, result.handler_id, {
            match_type: result.match_type,
            matched_rule: result.matched_rule,
            is_auto: true,
          })

          await prisma.$executeRaw`
            UPDATE accident_records
            SET assigned_at = NOW(), assignment_type = 'auto', assignment_rule = ${result.matched_rule || null}
            WHERE id = ${acc.id}
          `

          assigned++
        }

        results.push({
          id: acc.id,
          handler: result.handler_name,
          rule: result.matched_rule,
        })
      }

      return NextResponse.json({ assigned, total: unassigned.length, results })
    }

    default:
      return NextResponse.json({ error: `알 수 없는 action: ${action}` }, { status: 400 })
  }
}

// ============================================
// PUT — 룰 수정
// ============================================
export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  }

  try {
    // Build dynamic UPDATE query
    const updateFields = Object.entries(updates)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key} = '${value.replace(/'/g, "''")}'`
        } else if (typeof value === 'boolean') {
          return `${key} = ${value ? 1 : 0}`
        } else if (typeof value === 'number') {
          return `${key} = ${value}`
        } else {
          return `${key} = '${JSON.stringify(value).replace(/'/g, "''")}'`
        }
      })
      .join(', ')

    await prisma.$executeRaw`UPDATE assignment_rules SET ${updateFields} WHERE id = ${id}`

    const rules = await prisma.$queryRaw<any[]>`
      SELECT * FROM assignment_rules WHERE id = ${id} LIMIT 1
    `
    const rule = rules[0]

    return NextResponse.json({ rule: serialize(rule) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

// ============================================
// DELETE — 룰 삭제
// ============================================
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  }

  try {
    await prisma.$executeRaw`DELETE FROM assignment_rules WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
