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

    // Fetch approval list from Codef
    const result = await codefRequest('/v1/kr/card/p/account/approval-list', {
      connectedId,
      organization: orgCode,
      startDate: startDate.replace(/-/g, ''),
      endDate: endDate.replace(/-/g, ''),
    })

    if (result.code !== '0') {
      return NextResponse.json({ error: result.message || 'Failed to fetch approvals' }, { status: 400 })
    }

    // Transform and store approvals
    const approvals = result.data?.list || []
    const storedApprovals = []

    for (const approval of approvals) {
      const txData = {
        transaction_date: approval.approvalDate ? `${approval.approvalDate.slice(0, 4)}-${approval.approvalDate.slice(4, 6)}-${approval.approvalDate.slice(6)}` : null,
        type: 'expense',
        amount: Math.abs(approval.approvalAmount || 0),
        client_name: approval.merchantName || 'Unknown',
        description: approval.approvalDetails || approval.merchantName || '',
        category: 'Import - Card',
        payment_method: `${CARD_CODES[orgCode as keyof typeof CARD_CODES]}`,
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

    // Log sync
    await getSupabase().from('codef_sync_logs').insert({
      sync_type: 'card',
      org_name: CARD_CODES[orgCode as keyof typeof CARD_CODES],
      fetched: approvals.length,
      inserted: storedApprovals.length,
      status: 'success',
    })

    return NextResponse.json(
      {
        success: true,
        fetched: approvals.length,
        inserted: storedApprovals.length,
        approvals: storedApprovals,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Card fetch error:', error)

    await getSupabase().from('codef_sync_logs').insert({
      sync_type: 'card',
      status: 'error',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
