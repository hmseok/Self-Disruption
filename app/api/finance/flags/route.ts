import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '../../../utils/auth-guard'

// ═══ GET: 특이건 목록 조회 ═══
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company_id')
  const status = searchParams.get('status') // pending, approved, personal_confirmed, dismissed
  const flagType = searchParams.get('flag_type')
  const cardId = searchParams.get('card_id')
  const employeeId = searchParams.get('employee_id')
  const limit = Math.min(Number(searchParams.get('limit')) || 100, 500)
  const offset = Number(searchParams.get('offset')) || 0

  if (!companyId) {
    return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })
  }

  // Build dynamic WHERE clause
  let whereClause = 'WHERE 1=1'
  const params: any[] = []

  if (status) {
    if (status === 'unresolved') {
      whereClause += ` AND status IN ('pending', 'reviewing')`
    } else {
      whereClause += ` AND status = ?`
      params.push(status)
    }
  }
  if (flagType) {
    whereClause += ` AND flag_type = ?`
    params.push(flagType)
  }
  if (cardId) {
    whereClause += ` AND card_id = ?`
    params.push(cardId)
  }
  if (employeeId) {
    whereClause += ` AND employee_id = ?`
    params.push(employeeId)
  }

  const data = await prisma.$queryRaw<any[]>(
    `SELECT * FROM transaction_flags ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?` as any,
    ...params,
    limit,
    offset
  )

  // 통계
  const stats = await prisma.$queryRaw<any[]>`
    SELECT status FROM transaction_flags
  `

  const summary = {
    total: stats?.length || 0,
    pending: stats?.filter(s => s.status === 'pending').length || 0,
    reviewing: stats?.filter(s => s.status === 'reviewing').length || 0,
    approved: stats?.filter(s => s.status === 'approved').length || 0,
    personal_confirmed: stats?.filter(s => s.status === 'personal_confirmed').length || 0,
    dismissed: stats?.filter(s => s.status === 'dismissed').length || 0,
  }

  return NextResponse.json({ items: data || [], summary })
}

// ═══ POST: 특이건 플래그 생성 (자동/수동) ═══
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const body = await request.json()
  const { company_id, flags } = body

  if (!company_id || !flags || !Array.isArray(flags)) {
    return NextResponse.json({ error: 'company_id, flags 배열 필요' }, { status: 400 })
  }

  // 중복 플래그 방지: 같은 transaction_id + flag_type 조합 체크
  const newFlags = []
  for (const flag of flags) {
    if (flag.transaction_id) {
      const existing = await prisma.$queryRaw<any[]>`
        SELECT id FROM transaction_flags
        WHERE transaction_id = ${flag.transaction_id} AND flag_type = ${flag.flag_type}
        LIMIT 1
      `

      if (existing.length > 0) continue // 이미 존재하면 스킵
    }

    newFlags.push({
      company_id,
      transaction_id: flag.transaction_id || null,
      queue_id: flag.queue_id || null,
      flag_type: flag.flag_type,
      flag_reason: flag.flag_reason || null,
      severity: flag.severity || 'medium',
      status: 'pending',
      transaction_date: flag.transaction_date || null,
      client_name: flag.client_name || null,
      amount: flag.amount || 0,
      card_id: flag.card_id || null,
      employee_id: flag.employee_id || null,
      employee_name: flag.employee_name || null,
    })
  }

  if (newFlags.length === 0) {
    return NextResponse.json({ created: 0, message: '새로운 플래그 없음 (중복 제외)' })
  }

  const createdItems = []
  for (const flag of newFlags) {
    try {
      await prisma.$executeRaw`
        INSERT INTO transaction_flags
        (company_id, transaction_id, queue_id, flag_type, flag_reason, severity, status,
         transaction_date, client_name, amount, card_id, employee_id, employee_name, created_at)
        VALUES (
          ${flag.company_id}, ${flag.transaction_id}, ${flag.queue_id}, ${flag.flag_type},
          ${flag.flag_reason}, ${flag.severity}, ${flag.status},
          ${flag.transaction_date}, ${flag.client_name}, ${flag.amount},
          ${flag.card_id}, ${flag.employee_id}, ${flag.employee_name}, NOW()
        )
      `
      createdItems.push(flag)
    } catch (e) {
      console.error('[flags POST] insert error:', e)
    }
  }

  return NextResponse.json({ created: createdItems.length, items: createdItems })
}

// ═══ PATCH: 특이건 상태 업데이트 (검토 처리) ═══
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const body = await request.json()
  const { flag_ids, status: newStatus, reviewer_note, create_salary_adjustment } = body

  if (!flag_ids || !Array.isArray(flag_ids) || !newStatus) {
    return NextResponse.json({ error: 'flag_ids, status 필요' }, { status: 400 })
  }

  const resolvedAt = ['approved', 'personal_confirmed', 'dismissed'].includes(newStatus) ? new Date().toISOString() : null

  // Update flags
  for (const flagId of flag_ids) {
    await prisma.$executeRaw`
      UPDATE transaction_flags SET
        status = ${newStatus},
        reviewer_id = ${auth.userId},
        reviewer_note = ${reviewer_note || null},
        resolved_at = ${resolvedAt}
      WHERE id = ${flagId}
    `
  }

  // Get updated flags
  const data = await prisma.$queryRaw<any[]>`
    SELECT * FROM transaction_flags WHERE id IN (${flag_ids.join(',')})
  `

  // 개인 사용 확정 시 급여 조정 자동 생성
  if (newStatus === 'personal_confirmed' && create_salary_adjustment !== false) {
    const adjustments = []
    for (const flag of (data || [])) {
      if (!flag.employee_id || !flag.amount) continue

      const yearMonth = flag.transaction_date
        ? new Date(flag.transaction_date).toISOString().slice(0, 7)
        : new Date().toISOString().slice(0, 7)

      adjustments.push({
        employee_id: flag.employee_id,
        year_month: yearMonth,
        adjustment_type: 'deduct',
        amount: flag.amount,
        reason: `법인카드 개인사용 - ${flag.client_name || ''} (${flag.transaction_date || ''})`,
        source_transaction_id: flag.transaction_id || null,
        source_flag_id: flag.id,
      })
    }

    if (adjustments.length > 0) {
      for (const adj of adjustments) {
        await prisma.$executeRaw`
          INSERT INTO salary_adjustments
          (employee_id, year_month, adjustment_type, amount, reason,
           source_transaction_id, source_flag_id, status, created_at)
          VALUES (
            ${adj.employee_id}, ${adj.year_month}, ${adj.adjustment_type}, ${adj.amount},
            ${adj.reason}, ${adj.source_transaction_id}, ${adj.source_flag_id}, 'pending', NOW()
          )
        `
      }

      // Get the newly created adjustments and link them to flags
      for (const adj of adjustments) {
        const adjId = await prisma.$queryRaw<any[]>`
          SELECT id FROM salary_adjustments
          WHERE source_flag_id = ${adj.source_flag_id}
          LIMIT 1
        `

        if (adjId.length > 0) {
          await prisma.$executeRaw`
            UPDATE transaction_flags SET salary_adjustment_id = ${adjId[0].id}
            WHERE id = ${adj.source_flag_id}
          `
        }
      }
    }
  }

  return NextResponse.json({ updated: data?.length || 0, items: data })
}
