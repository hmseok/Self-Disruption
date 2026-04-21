// POST /api/loans/backtrace/rollback
// 특정 backtrace 실행 결과를 통째로 롤백
//
// Request body:
//   { run_id: string }   // backtrace_at DATETIME 값 (ISO "YYYY-MM-DD HH:MM:SS")
//
// 동작:
//   1. 해당 run_id 로 auto_generated=1 인 loans 조회
//   2. 각 loan 의 source_transaction_ids 파싱 → transactions.related_type/related_id 해제
//   3. loans 삭제
//
// Response:
//   { data: { loans_deleted, transactions_unlinked }, error: null }
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface LoanRow {
  id: string | number | bigint   // bigint 로 저장, Prisma 에서 BigInt/number/string 반환
  source_transaction_ids: string | null  // MySQL JSON 으로 저장, 문자열로 올 수 있음
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const runId: string = body.run_id
    if (!runId) return NextResponse.json({ error: 'run_id 필수' }, { status: 400 })

    // 해당 run 의 자동 생성 loans 조회
    const loans = await prisma.$queryRaw<LoanRow[]>`
      SELECT id, source_transaction_ids
      FROM loans
      WHERE auto_generated = 1 AND backtrace_at = ${runId}
    `

    if (loans.length === 0) {
      return NextResponse.json({
        data: { loans_deleted: 0, transactions_unlinked: 0 },
        error: null,
      })
    }

    // 트랜잭션 역참조 해제
    let unlinked = 0
    for (const loan of loans) {
      let txIds: string[] = []
      if (loan.source_transaction_ids) {
        try {
          const parsed = typeof loan.source_transaction_ids === 'string'
            ? JSON.parse(loan.source_transaction_ids)
            : loan.source_transaction_ids
          if (Array.isArray(parsed)) txIds = parsed.filter(x => typeof x === 'string')
        } catch { /* ignore parse error */ }
      }
      if (txIds.length > 0) {
        const placeholders = txIds.map(() => '?').join(',')
        const loanIdStr = String(loan.id)
        const result = await prisma.$executeRawUnsafe(
          `UPDATE transactions SET related_type = NULL, related_id = NULL
           WHERE related_type = 'loan' AND related_id = ? AND id IN (${placeholders})`,
          loanIdStr,
          ...txIds
        )
        unlinked += Number(result) || 0
      }
    }

    // loans 삭제
    const deleteResult = await prisma.$executeRaw`
      DELETE FROM loans WHERE auto_generated = 1 AND backtrace_at = ${runId}
    `

    return NextResponse.json({
      data: {
        loans_deleted: Number(deleteResult),
        transactions_unlinked: unlinked,
        run_id: runId,
      },
      error: null,
    })
  } catch (e: any) {
    console.error('[POST /api/loans/backtrace/rollback]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
