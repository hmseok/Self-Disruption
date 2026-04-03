import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.sub || payload.user_id || null
  } catch { return null }
}

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const userId = getUserIdFromToken(token)
  if (!userId) return null
  const profiles = await prisma.$queryRaw<any[]>`SELECT role, employee_name FROM profiles WHERE id = ${userId} LIMIT 1`
  const profile = profiles[0]
  return profile ? { id: userId, role: profile.role, employee_name: profile.employee_name } : null
}

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
        if (row.expense_date) monthSet.add(String(row.expense_date).slice(0, 7))
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

    // ── 중복 체크: 같은 날짜 + 사용처 + 금액이 이미 있으면 스킵 ──
    const duplicateChecks = await Promise.all(
      items.map(async (item) => {
        const existing = await prisma.$queryRaw<any[]>`
          SELECT id FROM expense_receipts
          WHERE user_id = ${user.id}
          AND expense_date = ${item.expense_date}
          AND merchant = ${item.merchant}
          AND amount = ${item.amount}
          LIMIT 1
        `
        return { item, isDuplicate: !!(existing && existing.length > 0) }
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

    const makeInsertData = (withMemo: boolean) => newItems.map(item => {
      const row: Record<string, any> = {
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
        await prisma.$executeRaw`
          INSERT INTO expense_receipts (
            user_id, user_name, expense_date, card_number, category, merchant,
            item_name, customer_team, amount, receipt_url, memo, created_at, updated_at
          ) VALUES (
            ${row.user_id}, ${row.user_name}, ${row.expense_date}, ${row.card_number},
            ${row.category}, ${row.merchant}, ${row.item_name}, ${row.customer_team},
            ${row.amount}, ${row.receipt_url}, ${row.memo || ''}, NOW(), NOW()
          )
        `
        // Re-fetch inserted row
        const result = await prisma.$queryRaw<any[]>`
          SELECT * FROM expense_receipts
          WHERE user_id = ${row.user_id}
          AND expense_date = ${row.expense_date}
          AND merchant = ${row.merchant}
          AND amount = ${row.amount}
          ORDER BY created_at DESC LIMIT 1
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
              user_id, user_name, expense_date, card_number, category, merchant,
              item_name, customer_team, amount, receipt_url, created_at, updated_at
            ) VALUES (
              ${row.user_id}, ${row.user_name}, ${row.expense_date}, ${row.card_number},
              ${row.category}, ${row.merchant}, ${row.item_name}, ${row.customer_team},
              ${row.amount}, ${row.receipt_url}, NOW(), NOW()
            )
          `
          const result = await prisma.$queryRaw<any[]>`
            SELECT * FROM expense_receipts
            WHERE user_id = ${row.user_id}
            AND expense_date = ${row.expense_date}
            AND merchant = ${row.merchant}
            AND amount = ${row.amount}
            ORDER BY created_at DESC LIMIT 1
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

    let error: any = null
    try {
      // Build dynamic UPDATE query
      const setClause: string[] = []
      if (updateData.category !== undefined) setClause.push(`category = ${JSON.stringify(updateData.category)}`)
      if (updateData.item_name !== undefined) setClause.push(`item_name = ${JSON.stringify(updateData.item_name)}`)
      if (updateData.customer_team !== undefined) setClause.push(`customer_team = ${JSON.stringify(updateData.customer_team)}`)
      if (updateData.memo !== undefined) setClause.push(`memo = ${JSON.stringify(updateData.memo)}`)

      const idPlaceholders = ids.map(id => `'${id}'`).join(',')
      const query = `UPDATE expense_receipts SET ${setClause.join(', ')}, updated_at = NOW() WHERE id IN (${idPlaceholders}) AND user_id = '${user.id}'`

      await prisma.$executeRawUnsafe(query)
    } catch (e: any) {
      // memo 컬럼 없으면 memo 제외하고 재시도
      if (updateData.memo !== undefined && (e.message?.includes('memo') || e.message?.includes('column'))) {
        delete updateData.memo
        if (Object.keys(updateData).length === 0) {
          return NextResponse.json({ success: true, updated: 0, note: 'memo 컬럼 미존재' })
        }
        const setClause2: string[] = []
        if (updateData.category !== undefined) setClause2.push(`category = ${JSON.stringify(updateData.category)}`)
        if (updateData.item_name !== undefined) setClause2.push(`item_name = ${JSON.stringify(updateData.item_name)}`)
        if (updateData.customer_team !== undefined) setClause2.push(`customer_team = ${JSON.stringify(updateData.customer_team)}`)

        const idPlaceholders = ids.map(id => `'${id}'`).join(',')
        const query2 = `UPDATE expense_receipts SET ${setClause2.join(', ')}, updated_at = NOW() WHERE id IN (${idPlaceholders}) AND user_id = '${user.id}'`
        await prisma.$executeRawUnsafe(query2)
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
