import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { codefRequest } from '../lib/auth'

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

    const cleanAccount = account.replace(/-/g, '')
    const fmtStart = startDate.replace(/-/g, '')
    const fmtEnd = endDate.replace(/-/g, '')

    const result = await codefRequest('/v1/kr/bank/b/account/transaction-list', {
      organization: orgCode,
      connectedId,
      account: cleanAccount,
      startDate: fmtStart,
      endDate: fmtEnd,
      orderBy: '0',
      inquiryType: '1',
    })

    console.log('[Codef Bank] 응답:', JSON.stringify(result).slice(0, 500))

    if (result?.result?.code !== 'CF-00000') {
      await prisma.codefSyncLog.create({
        data: {
          sync_type: 'bank',
          org_name: BANK_CODES[orgCode as keyof typeof BANK_CODES],
          fetched: 0,
          inserted: 0,
          status: 'error',
          error_message: result?.result?.message || JSON.stringify(result?.result),
        },
      })
      return NextResponse.json({
        error: result?.result?.message || '거래내역 조회 실패',
        code: result?.result?.code,
      }, { status: 400 })
    }

    const txList: any[] = result.resTrHistoryList || []
    let insertedCount = 0

    for (const tx of txList) {
      const txDate = tx.resAccountTrDate
        ? `${tx.resAccountTrDate.slice(0, 4)}-${tx.resAccountTrDate.slice(4, 6)}-${tx.resAccountTrDate.slice(6)}`
        : null

      const outAmt = Number(tx.resAccountOut || 0)
      const inAmt = Number(tx.resAccountIn || 0)
      const amount = outAmt > 0 ? outAmt : inAmt
      const type = inAmt > 0 ? 'income' : 'expense'

      try {
        // transactions 테이블은 Prisma 스키마 외 테이블 → raw insert
        await prisma.$executeRaw`
          INSERT INTO transactions
            (transaction_date, type, amount, client_name, description, category,
             payment_method, status, imported_from, codef_org_code, raw_data)
          VALUES
            (${txDate}, ${type}, ${amount},
             ${tx.resAccountDesc1 || tx.resAccountDesc2 || '미상'},
             ${[tx.resAccountDesc1, tx.resAccountDesc2, tx.resAccountDesc3].filter(Boolean).join(' / ')},
             ${'Import - Bank'}, ${BANK_CODES[orgCode as keyof typeof BANK_CODES]},
             ${'completed'}, ${'codef_bank'}, ${orgCode},
             ${JSON.stringify(tx)})
        `
        insertedCount++
      } catch {
        // 중복 등 에러 무시
      }
    }

    await prisma.codefSyncLog.create({
      data: {
        sync_type: 'bank',
        org_name: BANK_CODES[orgCode as keyof typeof BANK_CODES],
        fetched: txList.length,
        inserted: insertedCount,
        status: 'success',
      },
    })

    return NextResponse.json({
      success: true,
      fetched: txList.length,
      inserted: insertedCount,
    }, { status: 200 })

  } catch (error) {
    console.error('Bank fetch error:', error)
    await prisma.codefSyncLog.create({
      data: {
        sync_type: 'bank',
        status: 'error',
        fetched: 0,
        inserted: 0,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      },
    }).catch(() => {})
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
