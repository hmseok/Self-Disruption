import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// GET: 영수증/지출내역 목록 조회
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = request.nextUrl

  try {
    // list_months=true → DB에 데이터가 존재하는 월 목록 반환
    if (searchParams.get('list_months') === 'true') {
      const allDates = await prisma.$queryRaw<any[]>`
        SELECT expense_date FROM expense_receipts
        WHERE user_id = ${user.id}
        ORDER BY expense_date DESC
      `
      const monthSet = new Set<string>()
      allDates?.forEach(row => {
        if (row.expense_date) {
          const d = row.expense_date instanceof Date
            ? row.expense_date.toISOString().slice(0, 7)
            : String(row.expense_date).slice(0, 10).replace(/(\d{4}).(\d{2}).*/, '$1-$2')
          if (/^\d{4}-\d{2}$/.test(d)) monthSet.add(d)
        }
      })
      return NextResponse.json({ months: Array.from(monthSet).sort((a, b) => b.localeCompare(a)) })
    }

    const month = searchParams.get('month') // YYYY-MM
    const year = searchParams.get('year')

    let data: any[]
    if (month) {
      const start = `${month}-01`
      const endDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0)
      const end = `${month}-${String(endDate.getDate()).padStart(2, '0')}`
      data = await prisma.$queryRaw<any[]>`
        SELECT * FROM expense_receipts
        WHERE user_id = ${user.id}
        AND expense_date >= ${start}
        AND expense_date <= ${end}
        ORDER BY expense_date DESC
      `
    } else if (year) {
      data = await prisma.$queryRaw<any[]>`
        SELECT * FROM expense_receipts
        WHERE user_id = ${user.id}
        AND expense_date >= ${year}-01-01
        AND expense_date <= ${year}-12-31
        ORDER BY expense_date DESC
      `
    } else {
      data = await prisma.$queryRaw<any[]>`
        SELECT * FROM expense_receipts
        WHERE user_id = ${user.id}
        ORDER BY expense_date DESC
      `
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('지출내역 조회 실패:', error)
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}

// POST: 지출내역 추가 (수동 입력 or OCR 결과)
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const { items, receipt_url } = body as {
      items: Array<{
        expense_date: string
        card_number?: string
        category: string
        merchant: string
        item_name: string
        customer_team?: string
        amount: number
        receipt_url?: string
        memo?: string
      }>
      receipt_url?: string
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: '항목이 필요합니다.' }, { status: 400 })
    }

    // ── 중복 체크 (PR-B13 강화): image_hash 우선, 그 다음 (date + merchant + amount) ──
    // image_hash 가 있으면 같은 이미지 두 번 업로드 차단 (이름 변형 무력화 방지)
    const duplicateChecks = await Promise.all(
      items.map(async (item: any) => {
        // 1) image_hash 매칭 (가장 정확 — 같은 영수증 이미지)
        if (item.image_hash) {
          try {
            const byHash = await prisma.$queryRaw<any[]>`
              SELECT id FROM expense_receipts
              WHERE user_id = ${user.id} AND image_hash = ${item.image_hash}
              LIMIT 1
            `
            if (byHash && byHash.length > 0) {
              return { item, isDuplicate: true, dupReason: 'image_hash' }
            }
          } catch { /* image_hash 컬럼 미적용 — 무시 */ }
        }
        // 2) 옛날 (date, merchant, amount) 매칭 — fallback
        const existing = await prisma.$queryRaw<any[]>`
          SELECT id FROM expense_receipts
          WHERE user_id = ${user.id}
          AND expense_date = ${item.expense_date}
          AND merchant = ${item.merchant}
          AND amount = ${item.amount}
          LIMIT 1
        `
        return { item, isDuplicate: !!(existing && existing.length > 0), dupReason: 'date_merchant_amount' }
      })
    )

    const newItems = duplicateChecks.filter(c => !c.isDuplicate).map(c => c.item)
    const skippedCount = duplicateChecks.filter(c => c.isDuplicate).length

    if (newItems.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        skipped: skippedCount,
        message: `${skippedCount}건 모두 이미 등록된 내역입니다.`,
      })
    }

    const makeInsertData = (withMemo: boolean) => newItems.map((item: any) => {
      const row: Record<string, any> = {
        id: crypto.randomUUID(),  // CHAR(36) PK 컬럼 (auto-gen 안 됨)
        user_id: user.id,
        user_name: user.employee_name || '',
        expense_date: item.expense_date,
        card_number: item.card_number || '',
        category: item.category,
        merchant: item.merchant,
        item_name: item.item_name,
        customer_team: item.customer_team || user.employee_name || '',
        amount: item.amount,
        receipt_url: item.receipt_url || receipt_url || '',
        image_hash: item.image_hash || null,  // PR-B13: 영수증 이미지 sha256 (자동 dedup)
      }
      if (withMemo) row.memo = item.memo || ''
      return row
    })

    // 항목 삽입 - memo 컬럼이 있다고 가정
    const insertData = makeInsertData(true)
    const data: any[] = []
    let error: any = null

    try {
      for (const row of insertData) {
        // PR-B13: image_hash 컬럼 동적 처리 — 마이그레이션 미적용 환경 graceful
        try {
          await prisma.$executeRaw`
            INSERT INTO expense_receipts (
              id, user_id, user_name, expense_date, card_number, category, merchant,
              item_name, customer_team, amount, receipt_url, memo, image_hash, created_at, updated_at
            ) VALUES (
              ${row.id}, ${row.user_id}, ${row.user_name}, ${row.expense_date}, ${row.card_number},
              ${row.category}, ${row.merchant}, ${row.item_name}, ${row.customer_team},
              ${row.amount}, ${row.receipt_url}, ${row.memo || ''}, ${row.image_hash}, NOW(), NOW()
            )
          `
        } catch (e: any) {
          // image_hash 컬럼 미적용 시 옛 INSERT (마이그레이션 적용 전 환경)
          if (e?.message?.includes('image_hash')) {
            await prisma.$executeRaw`
              INSERT INTO expense_receipts (
                id, user_id, user_name, expense_date, card_number, category, merchant,
                item_name, customer_team, amount, receipt_url, memo, created_at, updated_at
              ) VALUES (
                ${row.id}, ${row.user_id}, ${row.user_name}, ${row.expense_date}, ${row.card_number},
                ${row.category}, ${row.merchant}, ${row.item_name}, ${row.customer_team},
                ${row.amount}, ${row.receipt_url}, ${row.memo || ''}, NOW(), NOW()
              )
            `
          } else {
            throw e
          }
        }
        // 방금 INSERT한 row를 id로 정확히 조회 (날짜+가맹점+금액 매칭은 동일 거래 시 실수 위험)
        const result = await prisma.$queryRaw<any[]>`
          SELECT * FROM expense_receipts WHERE id = ${row.id} LIMIT 1
        `
        if (result[0]) data.push(result[0])
      }
    } catch (e: any) {
      console.log('memo 컬럼 오류, memo 없이 재시도')
      // Retry without memo
      try {
        const insertDataNoMemo = makeInsertData(false)
        for (const row of insertDataNoMemo) {
          await prisma.$executeRaw`
            INSERT INTO expense_receipts (
              id, user_id, user_name, expense_date, card_number, category, merchant,
              item_name, customer_team, amount, receipt_url, created_at, updated_at
            ) VALUES (
              ${row.id}, ${row.user_id}, ${row.user_name}, ${row.expense_date}, ${row.card_number},
              ${row.category}, ${row.merchant}, ${row.item_name}, ${row.customer_team},
              ${row.amount}, ${row.receipt_url}, NOW(), NOW()
            )
          `
          const result = await prisma.$queryRaw<any[]>`
            SELECT * FROM expense_receipts WHERE id = ${row.id} LIMIT 1
          `
          if (result[0]) data.push(result[0])
        }
      } catch (retryError: any) {
        error = retryError
      }
    }

    if (error) {
      console.error('지출내역 저장 실패:', error)
      return NextResponse.json({ error: '저장 실패', detail: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data,
      skipped: skippedCount,
      message: skippedCount > 0
        ? `${data?.length || 0}건 저장, ${skippedCount}건 중복 제외`
        : undefined,
    })
  } catch (e: any) {
    console.error('영수증 API 오류:', e.message)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

// PATCH: 일괄 수정
export async function PATCH(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const { ids, updates } = body as {
      ids: string[]
      updates: { category?: string; item_name?: string; customer_team?: string; memo?: string }
    }

    if (!ids || ids.length === 0 || !updates) {
      return NextResponse.json({ error: 'ids와 updates 필요' }, { status: 400 })
    }

    const { Prisma } = await import('@prisma/client')
    const idList = ids.map(id => id)

    const updateData: Record<string, any> = {}
    if (updates.category !== undefined) updateData.category = updates.category
    if (updates.item_name !== undefined) updateData.item_name = updates.item_name
    if (updates.customer_team !== undefined) updateData.customer_team = updates.customer_team
    if (updates.memo !== undefined) updateData.memo = updates.memo

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '수정할 항목 없음' }, { status: 400 })
    }

    // 안전한 파라미터 바인딩 + 컬럼 화이트리스트
    const ALLOWED = ['category', 'item_name', 'customer_team', 'memo'] as const
    const buildUpdate = (data: Record<string, any>) => {
      const entries = ALLOWED.filter(k => data[k] !== undefined).map(k => [k, data[k]] as [string, any])
      if (entries.length === 0) return null
      const setSql = entries.map(([k]) => `\`${k}\` = ?`).join(', ')
      const placeholders = ids.map(() => '?').join(',')
      const sql = `UPDATE expense_receipts SET ${setSql}, updated_at = NOW() WHERE id IN (${placeholders}) AND user_id = ?`
      const params = [...entries.map(([, v]) => v), ...ids, user.id]
      return { sql, params }
    }

    let error: any = null
    try {
      const q = buildUpdate(updateData)
      if (!q) return NextResponse.json({ error: '수정할 항목 없음' }, { status: 400 })
      await prisma.$executeRawUnsafe(q.sql, ...q.params)
    } catch (e: any) {
      // memo 컬럼 없으면 memo 제외하고 재시도
      if (updateData.memo !== undefined && (e.message?.includes('memo') || e.message?.includes('column'))) {
        delete updateData.memo
        if (Object.keys(updateData).length === 0) {
          return NextResponse.json({ success: true, updated: 0, note: 'memo 컬럼 미존재' })
        }
        const q2 = buildUpdate(updateData)
        if (q2) await prisma.$executeRawUnsafe(q2.sql, ...q2.params)
      } else {
        error = e
      }
    }

    if (error) throw error
    return NextResponse.json({ success: true, updated: ids.length })
  } catch (error: any) {
    return NextResponse.json({ error: '수정 실패: ' + error.message }, { status: 500 })
  }
}

// DELETE: 지출내역 삭제
export async function DELETE(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID 필요' }, { status: 400 })

  try {
    await prisma.$executeRaw`DELETE FROM expense_receipts WHERE id = ${id} AND user_id = ${user.id}`
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  }
}
