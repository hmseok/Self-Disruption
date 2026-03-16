import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST: 기존 데이터 soft-delete + 새 데이터 삽입
export async function POST(request: NextRequest) {
  try {
    const { company_id, transactions } = await request.json()
    if (!company_id) return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ error: 'transactions 배열 필요' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const now = new Date().toISOString()

    // 1) Soft-delete ALL existing classification_queue items
    const { error: qDelErr } = await sb
      .from('classification_queue')
      .update({ deleted_at: now })
      .eq('company_id', company_id)
      .is('deleted_at', null)
    if (qDelErr) console.error('Queue soft-delete error:', qDelErr.message)

    // 2) Soft-delete ALL existing transactions
    const { error: txDelErr } = await sb
      .from('transactions')
      .update({ deleted_at: now })
      .eq('company_id', company_id)
      .is('deleted_at', null)
    if (txDelErr) console.error('Tx soft-delete error:', txDelErr.message)

    // 3) Insert new classification_queue items in batches
    let inserted = 0
    const BATCH = 50
    for (let i = 0; i < transactions.length; i += BATCH) {
      const batch = transactions.slice(i, i + BATCH).map((t: any) => ({
        company_id,
        source_data: {
          transaction_date: t.transaction_date,
          client_name: t.client_name,
          description: t.description,
          amount: t.amount,
          type: t.type,
          payment_method: t.payment_method || '통장',
        },
        source_type: 'bank_statement',
        ai_category: '미분류',
        ai_confidence: 0,
        status: 'pending',
      }))
      const { error: insErr } = await sb.from('classification_queue').insert(batch)
      if (insErr) {
        console.error(`Insert batch error at ${i}:`, insErr.message)
      } else {
        inserted += batch.length
      }
    }

    return NextResponse.json({
      message: `리셋 완료: ${inserted}건 새로 등록`,
      deleted_queue: true,
      deleted_tx: true,
      inserted,
      total_received: transactions.length,
    })
  } catch (error: any) {
    console.error('Reset import error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
