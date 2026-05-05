import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// 갱신 가능 컬럼 화이트리스트 — 직접 매핑하여 SQL injection 회피
const UPDATABLE = new Set([
  'base_salary', 'allowances', 'deduction_overrides', 'payment_day', 'tax_type',
  'bank_name', 'account_number', 'account_holder', 'is_active',
  'employment_type', 'salary_type', 'annual_salary', 'hourly_rate', 'daily_rate',
  'working_hours_per_week', 'dependents_count', 'net_salary_mode', 'target_net_salary',
  'custom_deductions', 'expanded_allowances',
])

// JSON 직렬화 필요 컬럼
const JSON_COLS = new Set(['allowances', 'deduction_overrides', 'custom_deductions', 'expanded_allowances'])

// PATCH /api/employee_salaries/[id]
// body: 갱신할 필드만 (부분 갱신 — partial update)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const body = await request.json()

    // 갱신 가능 컬럼만 추출
    const sets: string[] = []
    const vals: any[] = []
    for (const [k, v] of Object.entries(body)) {
      if (!UPDATABLE.has(k)) continue
      if (JSON_COLS.has(k)) {
        sets.push(`${k} = ?`)
        vals.push(v == null ? null : JSON.stringify(v))
      } else if (typeof v === 'boolean') {
        sets.push(`${k} = ?`)
        vals.push(v ? 1 : 0)
      } else {
        sets.push(`${k} = ?`)
        vals.push(v ?? null)
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: '갱신할 필드가 없습니다' }, { status: 400 })
    }

    sets.push('updated_at = NOW()')
    vals.push(id)

    await prisma.$executeRawUnsafe(
      `UPDATE employee_salaries SET ${sets.join(', ')} WHERE id = ?`,
      ...vals,
    )

    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM employee_salaries WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(updated[0]), error: null })
  } catch (e: any) {
    console.error('[employee_salaries PATCH]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/employee_salaries/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    await prisma.$executeRaw`
      DELETE FROM employee_salaries WHERE id = ${id}
    `

    return NextResponse.json({ error: null }, { status: 204 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
