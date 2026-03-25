import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { codefRequest } from '../lib/auth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Bank organization codes
const BANK_CODES = {
  '0020': '우리은행',
  '0004': '국민은행',
}

export async function POST(req: NextRequest) {
  try {
    const { connectedId, orgCode, account, startDate, endDate } = await req.json()

    if (!connectedId || !orgCode || !account || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required parameters (connectedId, orgCode, account, startDate, endDate)' }, { status: 400 })
    }

    if (!BANK_CODES[orgCode as keyof typeof BANK_CODES]) {
      return NextResponse.json({ error: 'Invalid bank code' }, { status: 400 })
    }

    // 계좌번호 숫자만 (API 스펙: 숫자만 입력)
    const cleanAccount = account.replace(/-/g, '')

    // 날짜 YYYYMMDD 형식
    const fmtStart = startDate.replace(/-/g, '')
    const fmtEnd = endDate.replace(/-/g, '')

    // Codef 수시입출 거래내역 API: /v1/kr/bank/b/account/transaction-list
    const result = await codefRequest('/v1/kr/bank/b/account/transaction-list', {
      organization: orgCode,
      connectedId,
      account: cleanAccount,
      startDate: fmtStart,
      endDate: fmtEnd,
      orderBy: '0',      // 0: 최신순
      inquiryType: '1',  // 1: 포함 (계좌상세 포함)
    })

    console.log('[Codef Bank] 응답:', JSON.stringify(result).slice(0, 500))

    if (result?.result?.code !== 'CF-00000') {
      // 싱크 로그 실패 기록
      await getSupabase().from('codef_sync_logs').insert({
        sync_type: 'bank',
        org_name: BANK_CODES[orgCode as keyof typeof BANK_CODES],
        fetched: 0,
        inserted: 0,
        status: 'error',
        error_message: result?.result?.message || JSON.stringify(result?.result),
      })
      return NextResponse.json({
        error: result?.result?.message || '거래내역 조회 실패',
        code: result?.result?.code,
      }, { status: 400 })
    }

    // 거래내역 파싱 (resTrHistoryList)
    const txList: any[] = result.resTrHistoryList || []
    const storedTransactions = []

    for (const tx of txList) {
      // resAccountTrDate: YYYYMMDD, resAccountTrTime: HHmmss
      const txDate = tx.resAccountTrDate
        ? `${tx.resAccountTrDate.slice(0, 4)}-${tx.resAccountTrDate.slice(4, 6)}-${tx.resAccountTrDate.slice(6)}`
        : null

      const outAmt = Number(tx.resAccountOut || 0)
      const inAmt = Number(tx.resAccountIn || 0)
      const amount = outAmt > 0 ? outAmt : inAmt
      const type = inAmt > 0 ? 'income' : 'expense'

      const txData = {
        transaction_date: txDate,
        type,
        amount,
        client_name: tx.resAccountDesc1 || tx.resAccountDesc2 || '미상',
        description: [tx.resAccountDesc1, tx.resAccountDesc2, tx.resAccountDesc3]
          .filter(Boolean).join(' / '),
        category: 'Import - Bank',
        payment_method: BANK_CODES[orgCode as keyof typeof BANK_CODES],
        status: 'completed',
        imported_from: 'codef_bank',
        codef_org_code: orgCode,
        raw_data: tx,
      }

      const { data, error } = await getSupabase().from('transactions').insert(txData).select()
      if (!error && data) {
        storedTransactions.push(data[0])
      }
    }

    // 싱크 로그 성공 기록
    await getSupabase().from('codef_sync_logs').insert({
      sync_type: 'bank',
      org_name: BANK_CODES[orgCode as keyof typeof BANK_CODES],
      fetched: txList.length,
      inserted: storedTransactions.length,
      status: 'success',
    })

    return NextResponse.json({
      success: true,
      fetched: txList.length,
      inserted: storedTransactions.length,
      transactions: storedTransactions,
    }, { status: 200 })

  } catch (error) {
    console.error('Bank fetch error:', error)
    await getSupabase().from('codef_sync_logs').insert({
      sync_type: 'bank',
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
