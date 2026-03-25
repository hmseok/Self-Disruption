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
    const { connectedId, orgCode, startDate, endDate } = await req.json()

    if (!connectedId || !orgCode || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    if (!BANK_CODES[orgCode as keyof typeof BANK_CODES]) {
      return NextResponse.json({ error: 'Invalid bank code' }, { status: 400 })
    }

    // Fetch transaction list from Codef
    const result = await codefRequest('/v1/kr/bank/p/account/transaction-list', {
      connectedId,
      organization: orgCode,
      startDate: startDate.replace(/-/g, ''),
      endDate: endDate.replace(/-/g, ''),
    })

    if (result.code !== '0') {
      return NextResponse.json({ error: result.message || 'Failed to fetch transactions' }, { status: 400 })
    }

    // Transform and store transactions
    const transactions = result.data?.list || []
    const storedTransactions = []

    for (const tx of transactions) {
      const txData = {
        transaction_date: tx.transactionDate ? `${tx.transactionDate.slice(0, 4)}-${tx.transactionDate.slice(4, 6)}-${tx.transactionDate.slice(6)}` : null,
        type: tx.transactionType === '입금' || tx.transactionAmount < 0 ? 'income' : 'expense',
        amount: Math.abs(tx.transactionAmount || 0),
        client_name: tx.memo || 'Unknown',
        description: tx.transactionDetails || tx.memo || '',
        category: 'Import - Bank',
        payment_method: `${BANK_CODES[orgCode as keyof typeof BANK_CODES]}`,
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

    // Log sync
    await getSupabase().from('codef_sync_logs').insert({
      sync_type: 'bank',
      org_name: BANK_CODES[orgCode as keyof typeof BANK_CODES],
      fetched: transactions.length,
      inserted: storedTransactions.length,
      status: 'success',
    })

    return NextResponse.json(
      {
        success: true,
        fetched: transactions.length,
        inserted: storedTransactions.length,
        transactions: storedTransactions,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Bank fetch error:', error)

    await getSupabase().from('codef_sync_logs').insert({
      sync_type: 'bank',
      status: 'error',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
