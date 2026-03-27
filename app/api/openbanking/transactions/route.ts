import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST: 거래내역 조회 및 저장
export async function POST(req: NextRequest) {
  try {
    const { startDate, endDate } = await req.json()
    const apiHost = process.env.OPENBANKING_API_HOST || 'https://testapi.openbanking.or.kr'
    const supabase = getSupabase()

    // 등록된 모든 계좌 조회
    const { data: accounts, error } = await supabase
      .from('openbanking_accounts')
      .select('*')
      .eq('is_active', true)

    if (error) throw error
    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: '연동된 계좌가 없습니다.' }, { status: 400 })
    }

    let totalFetched = 0
    let totalInserted = 0
    const errors: string[] = []

    for (const account of accounts) {
      try {
        // 날짜 형식 변환 (YYYY-MM-DD → YYYYMMDD)
        const fromDate = startDate.replace(/-/g, '')
        const toDate = endDate.replace(/-/g, '')

        const params = new URLSearchParams({
          bank_tran_id: `${process.env.OPENBANKING_CLIENT_ID!.replace(/-/g, '').slice(0, 10)}U${Date.now()}`,
          fintech_use_num: account.fin_use_num,
          inquiry_type: 'A',       // A: 전체
          inquiry_base: 'D',       // D: 일자 기준
          from_date: fromDate,
          to_date: toDate,
          sort_order: 'D',         // D: 내림차순
          tran_dtime: new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14),
        })

        const txRes = await fetch(
          `${apiHost}/v2.0/account/transaction/list/fin_use_num?${params}`,
          {
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              'Content-Type': 'application/json; charset=UTF-8',
            },
          }
        )

        const txData = await txRes.json()

        if (txData.rsp_code !== 'A0000') {
          errors.push(`${account.bank_name} ${account.account_num_masked}: [${txData.rsp_code}] ${txData.rsp_message}`)
          continue
        }

        const transactions = txData.res_list || []
        totalFetched += transactions.length

        for (const tx of transactions) {
          const { error: insertError } = await supabase
            .from('openbanking_transactions')
            .upsert({
              fin_use_num: account.fin_use_num,
              bank_code: account.bank_code,
              bank_name: account.bank_name,
              account_num_masked: account.account_num_masked,
              tran_date: tx.tran_date,
              tran_time: tx.tran_time,
              tran_type: tx.tran_type,        // 1: 입금, 2: 출금
              tran_type_name: tx.tran_type_name,
              tran_amt: parseInt(tx.tran_amt || '0'),
              after_balance_amt: parseInt(tx.after_balance_amt || '0'),
              print_content: tx.print_content,
              branch_name: tx.branch_name,
              unique_tran_no: tx.unique_tran_no,
            }, { onConflict: 'unique_tran_no' })

          if (!insertError) totalInserted++
        }
      } catch (err) {
        errors.push(`${account.bank_name}: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
      }
    }

    return NextResponse.json({
      success: true,
      fetched: totalFetched,
      inserted: totalInserted,
      errors,
    })
  } catch (err) {
    console.error('OpenBanking transactions error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
