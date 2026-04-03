import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST: 거래내역 조회 및 저장
export async function POST(req: NextRequest) {
  try {
    const { startDate, endDate } = await req.json()
    const apiHost = process.env.OPENBANKING_API_HOST || 'https://testapi.openbanking.or.kr'

    // 등록된 모든 계좌 조회
    const accounts = await prisma.$queryRaw<any[]>`
      SELECT * FROM openbanking_accounts WHERE is_active = TRUE
    `

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: '연동된 계좌가 없습니다.' }, { status: 400 })
    }

    let totalFetched = 0
    let totalInserted = 0
    const errors: string[] = []

    for (const account of accounts) {
      try {
        const fromDate = startDate.replace(/-/g, '')
        const toDate = endDate.replace(/-/g, '')

        const params = new URLSearchParams({
          bank_tran_id: `${process.env.OPENBANKING_CLIENT_ID!.replace(/-/g, '').slice(0, 10)}U${Date.now()}`,
          fintech_use_num: account.fin_use_num,
          inquiry_type: 'A',
          inquiry_base: 'D',
          from_date: fromDate,
          to_date: toDate,
          sort_order: 'D',
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
          try {
            await prisma.$executeRaw`
              INSERT INTO openbanking_transactions
                (id, account_id, fin_use_num, bank_code, bank_name,
                 account_num_masked, tran_date, tran_time, tran_type,
                 tran_type_name, tran_amt, after_balance_amt,
                 print_content, branch_name, unique_tran_no, created_at)
              VALUES
                (UUID(), ${account.id}, ${account.fin_use_num},
                 ${account.bank_code}, ${account.bank_name},
                 ${account.account_num_masked}, ${tx.tran_date}, ${tx.tran_time},
                 ${tx.tran_type}, ${tx.tran_type_name},
                 ${parseInt(tx.tran_amt || '0')}, ${parseInt(tx.after_balance_amt || '0')},
                 ${tx.print_content}, ${tx.branch_name}, ${tx.unique_tran_no},
                 NOW())
              ON DUPLICATE KEY UPDATE unique_tran_no = VALUES(unique_tran_no)
            `
            totalInserted++
          } catch {
            // 중복 등 에러 무시
          }
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
