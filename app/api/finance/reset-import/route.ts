import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST: 기존 데이터 soft-delete + 새 데이터 삽입
export async function POST(request: NextRequest) {
  try {
    const { company_id, transactions } = await request.json()
    if (!company_id) return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ error: 'transactions 배열 필요' }, { status: 400 })
    }

    const now = new Date().toISOString()

    // 1) Soft-delete ALL existing classification_queue items
    try {
      await prisma.$executeRaw`
        UPDATE classification_queue SET deleted_at = ${now} WHERE deleted_at IS NULL
      `
    } catch (qDelErr) {
      console.error('Queue soft-delete error:', qDelErr)
    }

    // 2) Soft-delete ALL existing transactions
    try {
      await prisma.$executeRaw`
        UPDATE transactions SET deleted_at = ${now} WHERE deleted_at IS NULL
      `
    } catch (txDelErr) {
      console.error('Tx soft-delete error:', txDelErr)
    }

    // 3) Insert new classification_queue items in batches
    let inserted = 0
    const BATCH = 50
    for (let i = 0; i < transactions.length; i += BATCH) {
      const batch = transactions.slice(i, i + BATCH)
      for (const t of batch) {
        const sourceData = JSON.stringify({
          transaction_date: t.transaction_date,
          client_name: t.client_name,
          description: t.description,
          amount: t.amount,
          type: t.type,
          payment_method: t.payment_method || '통장',
        })

        try {
          await prisma.$executeRaw`
            INSERT INTO classification_queue
            (company_id, source_data, source_type, ai_category, ai_confidence, status, created_at)
            VALUES (
              ${company_id},
              ${sourceData},
              'bank_statement',
              '미분류',
              0,
              'pending',
              NOW()
            )
          `
          inserted += 1
        } catch (insErr) {
          console.error(`Insert error:`, insErr)
        }
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
