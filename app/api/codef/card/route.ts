import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { codefRequest } from '../lib/auth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Card organization codes
const CARD_CODES = {
  '0019': '우리카드',
  '0381': '국민카드',
  '0041': '현대카드',
}

export async function POST(req: NextRequest) {
  try {
    const { connectedId, orgCode, startDate, endDate } = await req.json()

    if (!connectedId || !orgCode || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    if (!CARD_CODES[orgCode as keyof typeof CARD_CODES]) {
      return NextResponse.json({ error: 'Invalid card code' }, { status: 400 })
    }

    const fmtStart = startDate.replace(/-/g, '')
    const fmtEnd = endDate.replace(/-/g, '')

    // Codef 승인내역 API: /v1/kr/card/b/account/approval-list
    // inquiryType 필수값 (O): "0": 카드별, "1": 전체조회
    const result = await codefRequest('/v1/kr/card/b/account/approval-list', {
      organization: orgCode,
      connectedId,
      startDate: fmtStart,
      endDate: fmtEnd,
      orderBy: '0',       // 0: 최신순
      inquiryType: '1',   // 1: 전체조회 (필수)
      identity: '',
      loginTypeLevel: '2',
      clientType: '0',
      cardNo: '',
      departmentCode: '',
      transeType: '',
      cardName: '',
      duplicateCardIdx: '',
      applicationType: '0',
      memberStoreInfoType: '0',
    })

    console.log('[Codef Card] 응답:', JSON.stringify(result).slice(0, 500))

    if (result?.result?.code !== 'CF-00000') {
      await getSupabase().from('codef_sync_logs').insert({
        sync_type: 'card',
        org_name: CARD_CODES[orgCode as keyof typeof CARD_CODES],
        fetched: 0,
        inserted: 0,
        status: 'error',
        error_message: result?.result?.message || JSON.stringify(result?.result),
      })
      return NextResponse.json({
        error: result?.result?.message || '카드 승인내역 조회 실패',
        code: result?.result?.code,
      }, { status: 400 })
    }

    // 승인내역 파싱
    // 단건=객체, 다건=리스트 형태로 반환
    const rawList = result.resList || result.data || []
    const approvalList: any[] = Array.isArray(rawList) ? rawList : [rawList]
    const storedApprovals = []

    for (const approval of approvalList) {
      // resUsedDate: yyyyMMdd
      const usedDate = approval.resUsedDate
        ? `${approval.resUsedDate.slice(0, 4)}-${approval.resUsedDate.slice(4, 6)}-${approval.resUsedDate.slice(6)}`
        : null

      const txData = {
        transaction_date: usedDate,
        type: 'expense',
        amount: Math.abs(Number(approval.resUsedAmount || 0)),
        client_name: approval.resMemberStoreName || '미상',
        description: approval.resMemberStoreName || '',
        category: 'Import - Card',
        payment_method: CARD_CODES[orgCode as keyof typeof CARD_CODES],
        status: 'completed',
        imported_from: 'codef_card',
        codef_org_code: orgCode,
        raw_data: approval,
      }

      const { data, error } = await getSupabase().from('transactions').insert(txData).select()
      if (!error && data) {
        storedApprovals.push(data[0])
      }
    }

    await getSupabase().from('codef_sync_logs').insert({
      sync_type: 'card',
      org_name: CARD_CODES[orgCode as keyof typeof CARD_CODES],
      fetched: approvalList.length,
      inserted: storedApprovals.length,
      status: 'success',
    })

    return NextResponse.json({
      success: true,
      fetched: approvalList.length,
      inserted: storedApprovals.length,
      approvals: storedApprovals,
    }, { status: 200 })

  } catch (error) {
    console.error('Card fetch error:', error)
    await getSupabase().from('codef_sync_logs').insert({
      sync_type: 'card',
      status: 'error',
      fetched: 0,
      inserted: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
