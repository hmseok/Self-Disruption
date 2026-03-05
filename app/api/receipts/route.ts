import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const supabase = getSupabaseAdmin()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, company_id, employee_name').eq('id', user.id).single()
  return profile ? { ...user, role: profile.role, company_id: profile.company_id, employee_name: profile.employee_name } : null
}

// god_admin의 경우 company_id 오버라이드 가능
function getEffectiveCompanyId(user: any, requestCompanyId?: string | null): string {
  if (user.role === 'god_admin' && requestCompanyId) {
    return requestCompanyId
  }
  return user.company_id
}

// GET: 영수증/지출내역 목록 조회
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { searchParams } = request.nextUrl
  const overrideCompanyId = searchParams.get('company_id')
  const companyId = getEffectiveCompanyId(user, overrideCompanyId)

  // god_admin인데 company_id가 없으면 차단
  if (user.role === 'god_admin' && !overrideCompanyId) {
    return NextResponse.json({ error: '회사를 선택해주세요', data: [], months: [] }, { status: 400 })
  }

  // list_months=true → DB에 데이터가 존재하는 월 목록 반환
  if (searchParams.get('list_months') === 'true') {
    const { data: allDates, error } = await supabase
      .from('expense_receipts')
      .select('expense_date')
      .eq('user_id', user.id)
      .eq('company_id', companyId)
      .order('expense_date', { ascending: false })
    if (error) return NextResponse.json({ months: [] })
    const monthSet = new Set<string>()
    allDates?.forEach(row => {
      if (row.expense_date) monthSet.add(String(row.expense_date).slice(0, 7))
    })
    return NextResponse.json({ months: Array.from(monthSet).sort((a, b) => b.localeCompare(a)) })
  }

  const month = searchParams.get('month') // YYYY-MM
  const year = searchParams.get('year')

  let query = supabase
    .from('expense_receipts')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .order('expense_date', { ascending: false })

  if (month) {
    const start = `${month}-01`
    const endDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0)
    const end = `${month}-${String(endDate.getDate()).padStart(2, '0')}`
    query = query.gte('expense_date', start).lte('expense_date', end)
  } else if (year) {
    query = query.gte('expense_date', `${year}-01-01`).lte('expense_date', `${year}-12-31`)
  }

  const { data, error } = await query
  if (error) {
    console.error('지출내역 조회 실패:', error)
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// POST: 지출내역 추가 (수동 입력 or OCR 결과)
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const { items, receipt_url, company_id: bodyCompanyId } = body as {
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
      company_id?: string
    }

    const companyId = getEffectiveCompanyId(user, bodyCompanyId)

    // god_admin인데 company_id가 없으면 차단
    if (user.role === 'god_admin' && !bodyCompanyId) {
      return NextResponse.json({ error: '회사를 선택해주세요' }, { status: 400 })
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: '항목이 필요합니다.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // ── 중복 체크: 같은 날짜 + 사용처 + 금액이 이미 있으면 스킵 ──
    const duplicateChecks = await Promise.all(
      items.map(async (item) => {
        const { data: existing } = await supabase
          .from('expense_receipts')
          .select('id')
          .eq('user_id', user.id)
          .eq('expense_date', item.expense_date)
          .eq('merchant', item.merchant)
          .eq('amount', item.amount)
          .limit(1)
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
        company_id: companyId,
        user_id: user.id,
        user_name: user.employee_name || user.email?.split('@')[0] || '',
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

    // memo 컬럼 포함하여 시도, 실패 시 memo 없이 재시도
    let { data, error } = await supabase
      .from('expense_receipts')
      .insert(makeInsertData(true))
      .select()

    if (error && (error.message?.includes('memo') || error.message?.includes('column'))) {
      console.log('memo 컬럼 미존재, memo 없이 재시도')
      const retry = await supabase
        .from('expense_receipts')
        .insert(makeInsertData(false))
        .select()
      data = retry.data
      error = retry.error
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

    const supabase = getSupabaseAdmin()
    const updateData: Record<string, any> = {}
    if (updates.category !== undefined) updateData.category = updates.category
    if (updates.item_name !== undefined) updateData.item_name = updates.item_name
    if (updates.customer_team !== undefined) updateData.customer_team = updates.customer_team
    if (updates.memo !== undefined) updateData.memo = updates.memo

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '수정할 항목 없음' }, { status: 400 })
    }

    let { error } = await supabase
      .from('expense_receipts')
      .update(updateData)
      .in('id', ids)
      .eq('user_id', user.id)

    // memo 컬럼 없으면 memo 제외하고 재시도
    if (error && updateData.memo !== undefined && (error.message?.includes('memo') || error.message?.includes('column'))) {
      delete updateData.memo
      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ success: true, updated: 0, note: 'memo 컬럼 미존재' })
      }
      const retry = await supabase
        .from('expense_receipts')
        .update(updateData)
        .in('id', ids)
        .eq('user_id', user.id)
      error = retry.error
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

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('expense_receipts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
