import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

/**
 * GET /api/upload-batches/[id]
 * 배치 상세 + 포함된 거래 목록
 *
 * 특수 id:
 *   - __manual__ : imported_from IS NULL 인 수기 입력분 가상 배치
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const includeDeleted = searchParams.get('include_deleted') === '1'

    // 거래 목록 쿼리 조립
    const where: string[] = []
    const values: any[] = []

    if (id === '__manual__') {
      where.push('imported_from IS NULL')
    } else {
      where.push('imported_from = ?')
      values.push(id)
    }
    if (!includeDeleted) {
      where.push('deleted_at IS NULL')
    }

    const whereSql = `WHERE ${where.join(' AND ')}`
    const whereSqlAliased = `WHERE ${where.map(c => c.replace(/^(imported_from|deleted_at)/, 't.$1')).join(' AND ')}`

    // 실체 이름 LEFT JOIN — related_type별 분기하여 한 컬럼(related_name)으로 합침
    //   car → cars.number(+brand/model) · invest/jiip → investor_name
    //   employee/salary → profiles.name · freelancer → freelancers.name
    //   contract → contracts.customer_name · fmi_rental/rental → fmi_rentals.customer_name
    //   card → corporate_cards.card_alias · insurance → insurance_contracts.insurance_company
    //   loan → loans.finance_name
    const txSql = `
      SELECT
        t.id, t.transaction_date, t.type, t.status, t.category,
        t.client_name, t.description, t.amount, t.payment_method,
        t.related_type, t.related_id, t.memo, t.imported_from,
        t.created_at, t.updated_at, t.deleted_at,
        COALESCE(
          CASE WHEN t.related_type = 'car'        THEN CONCAT_WS(' · ', c.number, NULLIF(CONCAT_WS(' ', c.brand, c.model), '')) END,
          CASE WHEN t.related_type = 'invest'     THEN gi.investor_name END,
          CASE WHEN t.related_type = 'jiip'       THEN jc.investor_name END,
          CASE WHEN t.related_type IN ('employee', 'salary') THEN p.name END,
          CASE WHEN t.related_type = 'freelancer' THEN fl.name END,
          CASE WHEN t.related_type = 'contract'   THEN con.customer_name END,
          CASE WHEN t.related_type IN ('fmi_rental', 'rental') THEN fr.customer_name END,
          CASE WHEN t.related_type = 'card'       THEN cc.card_alias END,
          CASE WHEN t.related_type = 'insurance'  THEN ic.insurance_company END,
          CASE WHEN t.related_type = 'loan'       THEN ln.finance_name END,
          NULL
        ) AS related_name
      FROM transactions t
      LEFT JOIN cars c                 ON t.related_type = 'car'        AND t.related_id = c.id
      LEFT JOIN general_investments gi ON t.related_type = 'invest'     AND t.related_id = gi.id
      LEFT JOIN jiip_contracts jc      ON t.related_type = 'jiip'       AND t.related_id = jc.id
      LEFT JOIN profiles p             ON (t.related_type IN ('employee', 'salary')) AND t.related_id = p.id
      LEFT JOIN freelancers fl         ON t.related_type = 'freelancer' AND t.related_id = fl.id
      LEFT JOIN contracts con          ON t.related_type = 'contract'   AND t.related_id = con.id
      LEFT JOIN fmi_rentals fr         ON (t.related_type IN ('fmi_rental', 'rental')) AND t.related_id = fr.id
      LEFT JOIN corporate_cards cc     ON t.related_type = 'card'       AND t.related_id = cc.id
      LEFT JOIN insurance_contracts ic ON t.related_type = 'insurance'  AND t.related_id = ic.id
      LEFT JOIN loans ln               ON t.related_type = 'loan'       AND t.related_id = ln.id
      ${whereSqlAliased}
      ORDER BY t.transaction_date DESC, t.created_at DESC
      LIMIT 5000
    `
    let transactions: any[] = []
    try {
      transactions = await prisma.$queryRawUnsafe<any[]>(txSql, ...values)
    } catch (joinErr: any) {
      // 일부 테이블(loans, insurances 등)이 없는 환경이면 degrade — 기본 SELECT로 재시도
      console.warn('[upload-batches/[id]] JOIN 쿼리 실패, 기본 SELECT 로 폴백:', joinErr?.message)
      const fallbackSql = `
        SELECT id, transaction_date, type, status, category,
               client_name, description, amount, payment_method,
               related_type, related_id, memo, imported_from,
               created_at, updated_at, deleted_at,
               NULL AS related_name
        FROM transactions
        ${whereSql}
        ORDER BY transaction_date DESC, created_at DESC
        LIMIT 5000
      `
      transactions = await prisma.$queryRawUnsafe<any[]>(fallbackSql, ...values)
    }

    // 배치 메타데이터
    let batch: any = null
    if (id === '__manual__') {
      batch = {
        id: '__manual__',
        source_type: 'manual',
        institution: '수기',
        file_name: '수기 입력 (과거)',
        uploaded_at: null,
        memo: '과거 직접 입력 내역 / 출처 미상',
        deleted_at: null,
        rolled_back_at: null,
      }
    } else {
      const metaRows = await prisma.$queryRaw<any[]>`
        SELECT * FROM upload_batches WHERE id = ${id} LIMIT 1
      `
      batch = metaRows?.[0] || null
    }

    // 집계
    const txArr = transactions as any[]
    const stats = {
      live_count: txArr.filter(t => !t.deleted_at).length,
      deleted_count: txArr.filter(t => t.deleted_at).length,
      total_count: txArr.length,
      classified_count: txArr.filter(t => !t.deleted_at && t.category && t.category !== '미분류' && t.category !== '').length,
      unclassified_count: txArr.filter(t => !t.deleted_at && (!t.category || t.category === '미분류' || t.category === '')).length,
      income_sum: txArr
        .filter(t => !t.deleted_at && t.type === 'income')
        .reduce((s, t) => s + Number(t.amount || 0), 0),
      expense_sum: txArr
        .filter(t => !t.deleted_at && t.type === 'expense')
        .reduce((s, t) => s + Number(t.amount || 0), 0),
    }

    return NextResponse.json({
      data: serialize({ batch, stats, transactions }),
      error: null,
    })
  } catch (e: any) {
    console.error('[GET /api/upload-batches/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * PATCH /api/upload-batches/[id]
 * 배치 메타데이터 수정 (memo, file_name 등)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    if (id === '__manual__') {
      return NextResponse.json({ error: '가상 배치는 수정할 수 없습니다' }, { status: 400 })
    }

    const body = await request.json()
    const memo: string | null = body.memo ?? null
    const fileName: string | null = body.file_name ?? null
    const institution: string | null = body.institution ?? null

    // 동적 UPDATE — 전달된 필드만 수정
    const sets: string[] = []
    const values: any[] = []
    if ('memo' in body) { sets.push('memo = ?'); values.push(memo) }
    if ('file_name' in body) { sets.push('file_name = ?'); values.push(fileName) }
    if ('institution' in body) { sets.push('institution = ?'); values.push(institution) }
    if (sets.length === 0) {
      return NextResponse.json({ data: { id }, error: null })
    }
    values.push(id)

    await prisma.$executeRawUnsafe(
      `UPDATE upload_batches SET ${sets.join(', ')} WHERE id = ?`,
      ...values
    )

    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[PATCH /api/upload-batches/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * DELETE /api/upload-batches/[id]
 * 배치 자체를 소프트 삭제 (거래는 건드리지 않음 — rollback은 별도 엔드포인트)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    if (id === '__manual__') {
      return NextResponse.json({ error: '가상 배치는 삭제할 수 없습니다' }, { status: 400 })
    }

    await prisma.$executeRaw`
      UPDATE upload_batches SET deleted_at = NOW(3) WHERE id = ${id}
    `

    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[DELETE /api/upload-batches/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
