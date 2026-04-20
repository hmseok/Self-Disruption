import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/upload-batches/[id]/rollback
 * 업로드 배치 일괄 롤백 — 연결된 transactions 전체 소프트 삭제
 *
 * Body (선택):
 *   - hard=false : 소프트 삭제 (기본) — deleted_at 설정
 *   - hard=true  : 물리 삭제 (권장 X, 관리자만)
 *
 * 반환: { affected: N }
 *
 * 재분류 흐름:
 *   1) 이 엔드포인트로 기존 거래 제거
 *   2) 동일 파일 다시 업로드 → 분류
 *   3) 원본 upload_batches 행은 rolled_back_at 타임스탬프 표시
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    if (id === '__manual__') {
      return NextResponse.json(
        { error: '수기 입력분은 롤백할 수 없습니다' },
        { status: 400 }
      )
    }

    let body: any = {}
    try { body = await request.json() } catch { /* empty body ok */ }
    const hard = body?.hard === true

    const rolledBackBy = user.name || user.email || (user as any).id || 'unknown'

    // 1) 연결된 거래 수 조회
    const countRows = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) AS n
      FROM transactions
      WHERE imported_from = ${id}
        AND deleted_at IS NULL
    `
    const before = Number(countRows?.[0]?.n || 0)

    if (before === 0) {
      // 거래가 없어도 배치 자체는 롤백 표시
      await prisma.$executeRaw`
        UPDATE upload_batches
        SET rolled_back_at = NOW(3), rolled_back_by = ${rolledBackBy}
        WHERE id = ${id}
      `
      return NextResponse.json({
        data: { affected: 0, mode: hard ? 'hard' : 'soft' },
        error: null,
      })
    }

    // 2) 거래 일괄 삭제
    if (hard) {
      await prisma.$executeRaw`
        DELETE FROM transactions WHERE imported_from = ${id}
      `
    } else {
      await prisma.$executeRaw`
        UPDATE transactions
        SET deleted_at = NOW(3)
        WHERE imported_from = ${id}
          AND deleted_at IS NULL
      `
    }

    // 3) 배치 롤백 타임스탬프 기록
    await prisma.$executeRaw`
      UPDATE upload_batches
      SET rolled_back_at = NOW(3), rolled_back_by = ${rolledBackBy}
      WHERE id = ${id}
    `

    return NextResponse.json({
      data: { affected: before, mode: hard ? 'hard' : 'soft' },
      error: null,
    })
  } catch (e: any) {
    console.error('[POST /api/upload-batches/[id]/rollback]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * DELETE /api/upload-batches/[id]/rollback
 * 롤백 복원 — rolled_back_at 해제 + 거래 복원 (소프트 삭제 되었던 것만)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params

    // 배치 상태 확인
    const batchRows = await prisma.$queryRaw<any[]>`
      SELECT rolled_back_at FROM upload_batches WHERE id = ${id} LIMIT 1
    `
    if (!batchRows?.[0]) {
      return NextResponse.json({ error: '배치를 찾을 수 없습니다' }, { status: 404 })
    }
    if (!batchRows[0].rolled_back_at) {
      return NextResponse.json({ error: '롤백되지 않은 배치입니다' }, { status: 400 })
    }

    const rolledBackAt = batchRows[0].rolled_back_at as Date

    // 롤백 시점 근처(±60s)에 삭제된 거래만 복원 — 그 이후 수동 삭제는 건드리지 않음
    const result = await prisma.$executeRaw`
      UPDATE transactions
      SET deleted_at = NULL
      WHERE imported_from = ${id}
        AND deleted_at IS NOT NULL
        AND ABS(TIMESTAMPDIFF(SECOND, deleted_at, ${rolledBackAt})) < 60
    `

    await prisma.$executeRaw`
      UPDATE upload_batches
      SET rolled_back_at = NULL, rolled_back_by = NULL
      WHERE id = ${id}
    `

    return NextResponse.json({
      data: { restored: Number(result) },
      error: null,
    })
  } catch (e: any) {
    console.error('[DELETE /api/upload-batches/[id]/rollback]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
