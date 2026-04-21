// GET /api/loans/backtrace/history
// auto_generated=1 인 loans 를 backtrace_at (run_id) 기준으로 그룹화하여 이력 조회
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface HistoryRow {
  run_id: Date | string
  loan_count: bigint | number
  total_amount: string | number | null
  min_confidence: string | number | null
  max_confidence: string | number | null
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const rows = await prisma.$queryRaw<HistoryRow[]>`
      SELECT
        backtrace_at AS run_id,
        COUNT(*)     AS loan_count,
        SUM(total_amount) AS total_amount,
        MIN(ai_confidence) AS min_confidence,
        MAX(ai_confidence) AS max_confidence
      FROM loans
      WHERE auto_generated = 1 AND backtrace_at IS NOT NULL
      GROUP BY backtrace_at
      ORDER BY backtrace_at DESC
      LIMIT 50
    `

    // bigint 직렬화 처리
    const data = rows.map(r => ({
      run_id: r.run_id instanceof Date ? r.run_id.toISOString().slice(0, 19).replace('T', ' ') : String(r.run_id),
      loan_count: Number(r.loan_count),
      total_amount: r.total_amount != null ? Number(r.total_amount) : null,
      min_confidence: r.min_confidence != null ? Number(r.min_confidence) : null,
      max_confidence: r.max_confidence != null ? Number(r.max_confidence) : null,
    }))

    return NextResponse.json({ data, error: null })
  } catch (e: any) {
    console.error('[GET /api/loans/backtrace/history]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
