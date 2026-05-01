import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

const ALLOWED_TABLES = [
  'cars',
  'classification_queue',
  'client_name_aliases',
  'contracts',
  'corporate_cards',
  'expected_payment_schedules',
  'finance_rules',
  'freelancers',
  'general_investments',
  'insurance_contracts',
  'jiip_contracts',
  'loans',
  'profiles',
  'transactions',
]

function validateTableName(table: string): boolean {
  return ALLOWED_TABLES.includes(table)
}

// GET - fetch data
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const table = searchParams.get('table')
    const action = searchParams.get('action')

    if (!table || !validateTableName(table)) {
      return NextResponse.json({ error: '잘못된 테이블' }, { status: 400 })
    }

    if (action === 'detail') {
      const id = searchParams.get('id')
      if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

      const data = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM ${table} WHERE id = ?`,
        [id]
      )
      return NextResponse.json({ data: serialize(data[0] || null), error: null })
    }

    // transactions: 카드 매칭 정보 (card_alias + 매칭된 차량/직원) JOIN
    if (table === 'transactions') {
      // bank_account_mappings 와 LEFT JOIN — 통장 매핑 정보 노출
      // 매칭: account_alias 정확 일치만 (last4 매칭은 backfill 시점에 처리)
      let data: any[] = []
      const baseQuery = `
        SELECT
          t.*,
          sms.card_alias         AS sms_card_alias,
          sms.card_id            AS sms_card_id,
          sms.transaction_type   AS sms_transaction_type,
          sms.merchant           AS sms_merchant,
          sms.holder_name        AS sms_holder,
          sms.parse_status       AS sms_parse_status,
          cc.card_alias          AS matched_card_alias,
          cc.holder_name         AS matched_holder_name,
          cc.assigned_employee_id AS matched_employee_id,
          cc.assigned_car_id     AS matched_car_id,
          car.number             AS matched_car_number,
          CONCAT_WS(' ', car.brand, car.model) AS matched_car_model,
          bam.account_alias      AS bank_account_alias,
          bam.account_holder     AS bank_account_holder,
          bam.purpose            AS bank_purpose,
          bam_car.number         AS bank_matched_car_number,
          CONCAT_WS(' ', bam_car.brand, bam_car.model) AS bank_matched_car_model
        FROM transactions t
        LEFT JOIN card_sms_transactions sms ON sms.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
        LEFT JOIN corporate_cards cc       ON cc.id COLLATE utf8mb4_unicode_ci = sms.card_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN cars car                 ON car.id COLLATE utf8mb4_unicode_ci = cc.assigned_car_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN bank_account_mappings bam
          ON (bam.account_alias = sms.card_alias
              OR (bam.account_number IS NOT NULL
                  AND sms.card_alias IS NOT NULL
                  AND CHAR_LENGTH(TRIM(bam.account_number)) >= 4
                  AND CHAR_LENGTH(TRIM(sms.card_alias)) >= 4
                  AND RIGHT(TRIM(bam.account_number), 4) = RIGHT(TRIM(sms.card_alias), 4)))
        LEFT JOIN cars bam_car             ON bam_car.id COLLATE utf8mb4_unicode_ci = bam.assigned_car_id COLLATE utf8mb4_unicode_ci
        WHERE t.deleted_at IS NULL
        ORDER BY t.created_at DESC
        LIMIT 5000
      `
      try {
        data = await prisma.$queryRawUnsafe<any[]>(baseQuery)
      } catch (e: any) {
        // 어떤 에러든 graceful — bank_account_mappings 자체 없는 환경 등
        console.warn('[finance-upload] full query 실패, simple fallback:', e?.message?.slice(0, 200))
        data = await prisma.$queryRawUnsafe<any[]>(`
          SELECT
            t.*,
            sms.card_alias         AS sms_card_alias,
            sms.card_id            AS sms_card_id,
            sms.transaction_type   AS sms_transaction_type,
            sms.merchant           AS sms_merchant,
            sms.holder_name        AS sms_holder,
            sms.parse_status       AS sms_parse_status,
            cc.card_alias          AS matched_card_alias,
            cc.holder_name         AS matched_holder_name,
            cc.assigned_employee_id AS matched_employee_id,
            cc.assigned_car_id     AS matched_car_id,
            car.number             AS matched_car_number,
            CONCAT_WS(' ', car.brand, car.model) AS matched_car_model
          FROM transactions t
          LEFT JOIN card_sms_transactions sms ON sms.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
          LEFT JOIN corporate_cards cc       ON cc.id COLLATE utf8mb4_unicode_ci = sms.card_id COLLATE utf8mb4_unicode_ci
          LEFT JOIN cars car                 ON car.id COLLATE utf8mb4_unicode_ci = cc.assigned_car_id COLLATE utf8mb4_unicode_ci
          WHERE t.deleted_at IS NULL
          ORDER BY t.created_at DESC
          LIMIT 5000
        `)
      }
      return NextResponse.json({ data: serialize(data), error: null })
    }

    // Default list — soft-delete된 행 제외
    const hasDeletedAt = ['transactions', 'contracts'].includes(table)
    const data = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM ${table}${hasDeletedAt ? ' WHERE deleted_at IS NULL' : ''} ORDER BY created_at DESC LIMIT 1000`
    )
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST - insert
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const table = searchParams.get('table')

    if (!table || !validateTableName(table)) {
      return NextResponse.json({ error: '잘못된 테이블' }, { status: 400 })
    }

    const body = await request.json()
    const rows = Array.isArray(body) ? body : [body]

    if (rows.length === 0) {
      return NextResponse.json({ error: '삽입할 행이 없습니다' }, { status: 400 })
    }

    // 컬럼명 화이트리스트 (SAFE_COL regex) + 파라미터 바인딩 — SQL Injection 방지
    const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_]*$/
    const columns = Object.keys(rows[0])
    const invalidCol = columns.find(c => !SAFE_COL.test(c))
    if (invalidCol) {
      return NextResponse.json({ error: `잘못된 컬럼명: ${invalidCol}` }, { status: 400 })
    }
    const columnStr = columns.map(c => `\`${c}\``).join(', ')

    const allValues: any[] = []
    const valueSets = rows.map((row: any) => {
      const placeholders = columns.map((col: string) => {
        const val = row[col]
        if (val === null || val === undefined) {
          allValues.push(null)
        } else if (typeof val === 'boolean') {
          allValues.push(val ? 1 : 0)
        } else {
          allValues.push(val)
        }
        return '?'
      }).join(', ')
      return `(${placeholders})`
    }).join(', ')

    const query = `INSERT INTO \`${table}\` (${columnStr}) VALUES ${valueSets}`
    const result = await prisma.$executeRawUnsafe(query, ...allValues)

    // 🪝 transactions insert 시 imported_from이 있으면 upload_batches 자동 upsert
    //    (기존 배치는 건드리지 않고, 신규만 메타데이터 오버레이 등록)
    if (table === 'transactions') {
      const batchIds = new Set<string>()
      for (const row of rows) {
        const impFrom = row.imported_from
        if (impFrom && typeof impFrom === 'string') batchIds.add(impFrom)
      }
      const uploadedBy = user.name || user.email || (user as any).id || null
      for (const batchId of batchIds) {
        try {
          // source_type 자동 감지 (prefix 기반)
          let sourceType = 'manual'
          if (batchId.startsWith('excel_bank_')) sourceType = 'excel_bank'
          else if (batchId.startsWith('excel_card_')) sourceType = 'excel_card'
          else if (batchId.startsWith('pdf_card_')) sourceType = 'pdf_card'
          else if (batchId.startsWith('codef_')) sourceType = 'codef_bank'
          await prisma.$executeRaw`
            INSERT INTO upload_batches (id, source_type, uploaded_by)
            VALUES (${batchId}, ${sourceType}, ${uploadedBy})
            ON DUPLICATE KEY UPDATE
              uploaded_by = COALESCE(uploaded_by, VALUES(uploaded_by))
          `
        } catch (e) {
          console.warn('[upload-batches auto-register]', batchId, e)
        }
      }
    }

    return NextResponse.json({ success: true, inserted: result, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH - update
export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const table = searchParams.get('table')
    const id = searchParams.get('id')

    if (!table || !id || !validateTableName(table)) {
      return NextResponse.json({ error: 'table과 id 파라미터 필수' }, { status: 400 })
    }

    const body = await request.json()
    const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_]*$/
    const entries = Object.entries(body).filter(([k]) => SAFE_COL.test(k))
    if (entries.length === 0) return NextResponse.json({ error: '수정할 항목 없음' }, { status: 400 })

    const setClause = entries.map(([k]) => `\`${k}\` = ?`).join(', ')
    const values = entries.map(([, v]) => (typeof v === 'boolean' ? (v ? 1 : 0) : v))
    // table은 위 validateTableName으로 화이트리스트 검증됨
    const query = `UPDATE \`${table}\` SET ${setClause} WHERE id = ?`
    await prisma.$executeRawUnsafe(query, ...values, id)

    return NextResponse.json({ success: true, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE - soft delete or hard delete
export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const table = searchParams.get('table')
    const id = searchParams.get('id')
    const softDelete = searchParams.get('soft') === 'true'

    if (!table || !id || !validateTableName(table)) {
      return NextResponse.json({ error: 'table과 id 파라미터 필수' }, { status: 400 })
    }

    if (softDelete) {
      // Soft delete - set deleted_at (table은 validateTableName 화이트리스트 통과)
      await prisma.$executeRawUnsafe(
        `UPDATE \`${table}\` SET deleted_at = NOW() WHERE id = ?`,
        id
      )
    } else {
      // Hard delete
      await prisma.$executeRawUnsafe(
        `DELETE FROM \`${table}\` WHERE id = ?`,
        id
      )
    }

    return NextResponse.json({ success: true, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
