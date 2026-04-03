import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { codefRequest } from '../lib/auth'

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

    const result = await codefRequest('/v1/kr/card/b/account/approval-list', {
      organization: orgCode,
      connectedId,
      startDate: fmtStart,
      endDate: fmtEnd,
      orderBy: '0',
      inquiryType: '1',
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
      await prisma.codefSyncLog.create({
        data: {
          sync_type: 'card',
          org_name: CARD_CODES[orgCode as keyof typeof CARD_CODES],
          fetched: 0,
          inserted: 0,
          status: 'error',
          error_message: result?.result?.message || JSON.stringify(result?.result),
        },
      })
      return NextResponse.json({
        error: result?.result?.message || '카드 승인내역 조회 실패',
        code: result?.result?.code,
      }, { status: 400 })
    }

    const rawList = result.resList || result.data || []
    const approvalList: any[] = Array.isArray(rawList) ? rawList : [rawList]
    let insertedCount = 0

    for (const approval of approvalList) {
      const usedDate = approval.resUsedDate
        ? `${approval.resUsedDate.slice(0, 4)}-${approval.resUsedDate.slice(4, 6)}-${approval.resUsedDate.slice(6)}`
        : null

      try {
        // transactions 테이블은 Prisma 스키마 외 테이블 → raw insert
        await prisma.$executeRaw`
          INSERT INTO transactions
            (transaction_date, type, amount, client_name, description, category,
             payment_method, status, imported_from, codef_org_code, raw_data)
          VALUES
            (${usedDate}, ${'expense'}, ${Math.abs(Number(approval.resUsedAmount || 0))},
             ${approval.resMemberStoreName || '미상'},
             ${approval.resMemberStoreName || ''},
             ${'Import - Card'}, ${CARD_CODES[orgCode as keyof typeof CARD_CODES]},
             ${'completed'}, ${'codef_card'}, ${orgCode},
             ${JSON.stringify(approval)})
        `
        insertedCount++
      } catch {
        // 중복 등 에러 무시
      }
    }

    await prisma.codefSyncLog.create({
      data: {
        sync_type: 'card',
        org_name: CARD_CODES[orgCode as keyof typeof CARD_CODES],
        fetched: approvalList.length,
        inserted: insertedCount,
        status: 'success',
      },
    })

    return NextResponse.json({
      success: true,
      fetched: approvalList.length,
      inserted: insertedCount,
    }, { status: 200 })

  } catch (error) {
    console.error('Card fetch error:', error)
    await prisma.codefSyncLog.create({
      data: {
        sync_type: 'card',
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
