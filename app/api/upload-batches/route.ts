import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

/**
 * GET /api/upload-batches
 * 업로드 배치 목록 — upload_batches 테이블 + transactions 현재 집계
 *
 * Query:
 *  - include_rolled_back=1 : 롤백된 배치도 포함
 *  - source_type=excel_bank|excel_card|pdf_card|codef_bank
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const includeRolledBack = searchParams.get('include_rolled_back') === '1'
    const sourceType = searchParams.get('source_type')

    const where: string[] = []
    const values: any[] = []
    if (!includeRolledBack) {
      where.push('b.rolled_back_at IS NULL')
      where.push('b.deleted_at IS NULL')
    }
    if (sourceType) {
      where.push('b.source_type = ?')
      values.push(sourceType)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sql = `
      SELECT
        b.*,
        COALESCE(agg.live_count, 0) AS live_count,
        COALESCE(agg.live_classified, 0) AS live_classified,
        COALESCE(agg.live_unclassified, 0) AS live_unclassified,
        COALESCE(agg.live_income, 0) AS live_income,
        COALESCE(agg.live_expense, 0) AS live_expense,
        agg.min_tx_date,
        agg.max_tx_date
      FROM upload_batches b
      LEFT JOIN (
        SELECT
          imported_from,
          COUNT(*) AS live_count,
          SUM(CASE WHEN category IS NOT NULL AND category != '미분류' AND category != '' THEN 1 ELSE 0 END) AS live_classified,
          SUM(CASE WHEN category IS NULL OR category = '미분류' OR category = '' THEN 1 ELSE 0 END) AS live_unclassified,
          COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) AS live_income,
          COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS live_expense,
          MIN(transaction_date) AS min_tx_date,
          MAX(transaction_date) AS max_tx_date
        FROM transactions
        WHERE deleted_at IS NULL
          AND imported_from IS NOT NULL
        GROUP BY imported_from
      ) agg ON agg.imported_from = b.id
      ${whereSql}
      ORDER BY b.uploaded_at DESC
      LIMIT 500
    `
    const data = await prisma.$queryRawUnsafe<any[]>(sql, ...values)

    // 수기 입력분 (imported_from IS NULL) 가상 배치 추가
    const manualAgg = await prisma.$queryRaw<any[]>`
      SELECT
        COUNT(*) AS live_count,
        SUM(CASE WHEN category IS NOT NULL AND category != '미분류' AND category != '' THEN 1 ELSE 0 END) AS live_classified,
        SUM(CASE WHEN category IS NULL OR category = '미분류' OR category = '' THEN 1 ELSE 0 END) AS live_unclassified,
        COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) AS live_income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS live_expense,
        MIN(transaction_date) AS min_tx_date,
        MAX(transaction_date) AS max_tx_date
      FROM transactions
      WHERE deleted_at IS NULL
        AND imported_from IS NULL
    `
    const manualCount = Number(manualAgg?.[0]?.live_count || 0)
    const rows = [...data]
    if (manualCount > 0 && !sourceType) {
      rows.push({
        id: '__manual__',
        source_type: 'manual',
        institution: '수기',
        file_name: '수기 입력',
        uploaded_at: null,
        total_count: manualCount,
        classified_count: Number(manualAgg[0].live_classified || 0),
        unclassified_count: Number(manualAgg[0].live_unclassified || 0),
        income_sum: Number(manualAgg[0].live_income || 0),
        expense_sum: Number(manualAgg[0].live_expense || 0),
        memo: '과거 수기 입력 / 출처 미상',
        ...manualAgg[0],
        live_count: manualCount,
      })
    }

    return NextResponse.json({ data: serialize(rows), error: null })
  } catch (e: any) {
    console.error('[GET /api/upload-batches]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * POST /api/upload-batches
 * Body: { id, source_type, institution?, file_name?, file_url?, memo? }
 *   id = imported_from 문자열 (전역 유니크 권장)
 *
 * 기존 업로드 플로우에서 호출하여 배치 레코드 선행 생성 후
 * transactions.imported_from 에 동일 id 넣으면 자동 연결.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id: string = body.id || `manual_${Date.now()}`
    const sourceType: string = body.source_type || 'manual'
    const institution: string | null = body.institution || null
    const fileName: string | null = body.file_name || null
    const fileUrl: string | null = body.file_url || null
    const memo: string | null = body.memo || null

    const uploadedBy = user.name || user.email || (user as any).id || null

    await prisma.$executeRaw`
      INSERT INTO upload_batches (id, source_type, institution, file_name, file_url, uploaded_by, memo)
      VALUES (${id}, ${sourceType}, ${institution}, ${fileName}, ${fileUrl}, ${uploadedBy}, ${memo})
      ON DUPLICATE KEY UPDATE
        file_name = COALESCE(VALUES(file_name), file_name),
        file_url = COALESCE(VALUES(file_url), file_url),
        memo = COALESCE(VALUES(memo), memo)
    `

    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[POST /api/upload-batches]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
