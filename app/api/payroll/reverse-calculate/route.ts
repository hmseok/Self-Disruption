import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reverseCalculatePayroll } from '../../../utils/payroll-calc'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { target_net_salary, allowances, tax_type, dependents_count, custom_deductions, meal_excess_deduction } = body

    if (!target_net_salary || target_net_salary <= 0) {
      return NextResponse.json({ error: '목표 실수령액을 입력해주세요' }, { status: 400 })
    }

    const result = reverseCalculatePayroll(
      target_net_salary,
      allowances || {},
      tax_type || '근로소득',
      dependents_count || 1,
      custom_deductions,
      meal_excess_deduction,
    )

    return NextResponse.json({
      base_salary: result.baseSalary,
      calculated_net: result.calculatedNet,
      difference: result.difference,
      full_calculation: result.fullCalc,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
