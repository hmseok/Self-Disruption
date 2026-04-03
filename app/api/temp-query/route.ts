import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')

  if (action === 'payment_dates_2026') {
    try {
      const data = await prisma.$queryRaw<any[]>`
        SELECT id, car_id, insurance_company_billing, insurance_payment_date,
               insurance_billing_status, replacement_start_date, replacement_end_date,
               notes, repair_shop_name
        FROM vehicle_operations
        WHERE insurance_payment_date >= '2026-01-01'
          AND insurance_payment_date <= '2026-12-31'
        ORDER BY insurance_payment_date ASC
      `
      return NextResponse.json({ count: data.length, data, error: null })
    } catch (error: any) {
      return NextResponse.json({ count: 0, data: null, error: error.message })
    }
  }

  if (action === 'unconnected_transactions') {
    try {
      const data = await prisma.$queryRaw<any[]>`
        SELECT id, transaction_date, counterpart, description, amount, category,
               sub_category, related_type, related_id, memo
        FROM transactions
        WHERE type = 'income' AND related_id IS NULL
        ORDER BY transaction_date DESC
        LIMIT 50
      `
      return NextResponse.json({ count: data.length, data, error: null })
    } catch (error: any) {
      return NextResponse.json({ count: 0, data: null, error: error.message })
    }
  }

  if (action === 'income_transactions') {
    try {
      const data = await prisma.$queryRaw<any[]>`
        SELECT id, transaction_date, counterpart, description, amount, category,
               sub_category, related_type, related_id, memo
        FROM transactions
        WHERE type = 'income'
        ORDER BY transaction_date DESC
        LIMIT 100
      `
      return NextResponse.json({ count: data.length, data, error: null })
    } catch (error: any) {
      return NextResponse.json({ count: 0, data: null, error: error.message })
    }
  }

  if (action === 'cars') {
    try {
      const data = await prisma.$queryRaw<any[]>`
        SELECT id, number, brand, model FROM cars
      `
      return NextResponse.json({ data, error: null })
    } catch (error: any) {
      return NextResponse.json({ data: null, error: error.message })
    }
  }

  if (action === 'update_transaction') {
    try {
      const txId = req.nextUrl.searchParams.get('tx_id')
      const carId = req.nextUrl.searchParams.get('car_id')
      if (!txId || !carId) {
        return NextResponse.json({ error: 'tx_id and car_id required' })
      }
      await prisma.$executeRaw`
        UPDATE transactions
        SET related_type = 'car', related_id = ${carId}
        WHERE id = ${txId}
      `
      const data = await prisma.$queryRaw<any[]>`SELECT * FROM transactions WHERE id = ${txId}`
      return NextResponse.json({ data, error: null })
    } catch (error: any) {
      return NextResponse.json({ data: null, error: error.message })
    }
  }

  if (action === 'all_ops') {
    try {
      const data = await prisma.$queryRaw<any[]>`
        SELECT id, car_id, insurance_company_billing, insurance_payment_date,
               insurance_billing_status, replacement_start_date, replacement_end_date,
               notes, repair_shop_name
        FROM vehicle_operations
        ORDER BY scheduled_date DESC
        LIMIT 500
      `
      return NextResponse.json({ count: data.length, data, error: null })
    } catch (error: any) {
      return NextResponse.json({ count: 0, data: null, error: error.message })
    }
  }

  if (action === 'search_notes') {
    try {
      const refs = req.nextUrl.searchParams.get('refs')?.split(',') || []
      const data = await prisma.$queryRaw<any[]>`
        SELECT id, car_id, insurance_company_billing, insurance_payment_date,
               replacement_start_date, replacement_end_date, notes, repair_shop_name
        FROM vehicle_operations
        LIMIT 500
      `

      const results: Record<string, any> = {}
      for (const ref of refs) {
        const match = data.find(rec => rec.notes && rec.notes.includes(ref))
        results[ref] = match || null
      }
      return NextResponse.json(results)
    } catch (error: any) {
      return NextResponse.json({ error: error.message })
    }
  }

  if (action === 'find_tables') {
    const tables = ['classification_queue', 'bank_statements', 'raw_transactions', 'bank_transactions']
    const results: Record<string, any> = {}
    for (const t of tables) {
      try {
        const data = await prisma.$queryRaw<any[]>`SELECT * FROM ${Prisma.raw(t)} LIMIT 1`
        results[t] = {
          exists: true,
          columns: data.length > 0 ? Object.keys(data[0]) : [],
          error: null
        }
      } catch (error: any) {
        results[t] = { exists: false, columns: [], error: error.message.substring(0, 80) }
      }
    }
    return NextResponse.json(results)
  }

  if (action === 'cq_data') {
    try {
      const data = await prisma.$queryRaw<any[]>`
        SELECT * FROM classification_queue LIMIT 10
      `
      return NextResponse.json({
        count: data.length,
        columns: data.length > 0 ? Object.keys(data[0]) : [],
        data: data.slice(0, 3),
        error: null
      })
    } catch (error: any) {
      return NextResponse.json({ count: 0, columns: [], data: null, error: error.message })
    }
  }

  if (action === 'tx_by_amounts') {
    try {
      const amounts = [631800, 600600, 519920, 878000, 142590, 442810, 1029600, 423300, 607750, 1027190, 1239730, 805560]
      const data = await prisma.$queryRaw<any[]>`
        SELECT id, transaction_date, client_name, description, amount, type, category, related_type, related_id, memo
        FROM transactions
        WHERE amount IN (${Prisma.join(amounts)})
        ORDER BY transaction_date DESC
      `
      return NextResponse.json({ count: data.length, data, error: null })
    } catch (error: any) {
      return NextResponse.json({ count: 0, data: null, error: error.message })
    }
  }

  if (action === 'tx_recent_income') {
    try {
      const data = await prisma.$queryRaw<any[]>`
        SELECT id, transaction_date, client_name, description, amount, type, category, related_type, related_id
        FROM transactions
        WHERE type = 'income' AND transaction_date >= '2026-01-01'
        ORDER BY transaction_date DESC
        LIMIT 30
      `
      return NextResponse.json({ count: data.length, data, error: null })
    } catch (error: any) {
      return NextResponse.json({ count: 0, data: null, error: error.message })
    }
  }

  if (action === 'tx_schema') {
    try {
      const data = await prisma.$queryRaw<any[]>`
        SELECT * FROM transactions LIMIT 3
      `
      return NextResponse.json({
        columns: data.length > 0 ? Object.keys(data[0]) : [],
        sample: data.length > 0 ? data[0] : null,
        error: null
      })
    } catch (error: any) {
      return NextResponse.json({
        columns: [],
        sample: null,
        error: error.message
      })
    }
  }

  if (action === 'tx_insurance') {
    try {
      const data = await prisma.$queryRaw<any[]>`
        SELECT id, transaction_date, client_name, description, amount, type, category, related_type, related_id, memo
        FROM transactions
        WHERE client_name LIKE '%삼성%'
           OR client_name LIKE '%현대%'
           OR client_name LIKE '%메츠%'
           OR client_name LIKE '%DB손보%'
           OR client_name LIKE '%메리츠%'
           OR client_name LIKE '%디비%'
        ORDER BY transaction_date DESC
        LIMIT 30
      `
      return NextResponse.json({ count: data.length, data, error: null })
    } catch (error: any) {
      return NextResponse.json({ count: 0, data: null, error: error.message })
    }
  }

  if (action === 'cq_raw') {
    try {
      const data = await prisma.$queryRaw<any[]>`
        SELECT * FROM classification_queue
        WHERE final_matched_type = 'car'
        LIMIT 1
      `
      return NextResponse.json({ data: data.length > 0 ? data[0] : null, error: null })
    } catch (error: any) {
      return NextResponse.json({ data: null, error: error.message })
    }
  }

  if (action === 'cq_car_linked') {
    try {
      const data = await prisma.$queryRaw<any[]>`
        SELECT id, status, final_matched_type, final_matched_id, source_data, alternatives
        FROM classification_queue
        WHERE final_matched_type = 'car'
        LIMIT 20
      `
      const mapped = data.map(d => {
        const alternatives = typeof d.alternatives === 'string' ? JSON.parse(d.alternatives) : d.alternatives
        const sourceData = typeof d.source_data === 'string' ? JSON.parse(d.source_data) : d.source_data
        return {
          id: d.id,
          type: d.final_matched_type,
          mid: d.final_matched_id,
          ai_type: d.ai_matched_type,
          ai_id: d.ai_matched_id,
          client: alternatives?.source_data?.client_name || sourceData?.client_name
        }
      })
      return NextResponse.json({ count: data.length, data: mapped, error: null })
    } catch (error: any) {
      return NextResponse.json({ count: 0, data: null, error: error.message })
    }
  }

  if (action === 'cq_insurance') {
    try {
      const data = await prisma.$queryRaw<any[]>`
        SELECT id, status, ai_category, final_matched_type, final_matched_id, transaction_id, source_data, alternatives
        FROM classification_queue
        WHERE final_matched_id IS NULL
        LIMIT 50
      `
      return NextResponse.json({ count: data.length, data, error: null })
    } catch (error: any) {
      return NextResponse.json({ count: 0, data: null, error: error.message })
    }
  }

  if (action === 'update_cq') {
    try {
      const cqId = req.nextUrl.searchParams.get('cq_id')
      const carId = req.nextUrl.searchParams.get('car_id')
      if (!cqId || !carId) {
        return NextResponse.json({ error: 'cq_id and car_id required' })
      }
      await prisma.$executeRaw`
        UPDATE classification_queue
        SET final_matched_type = 'car', final_matched_id = ${carId}
        WHERE id = ${cqId}
      `
      const data = await prisma.$queryRaw<any[]>`
        SELECT id, final_matched_type, final_matched_id
        FROM classification_queue
        WHERE id = ${cqId}
      `
      return NextResponse.json({ data, error: null })
    } catch (error: any) {
      return NextResponse.json({ data: null, error: error.message })
    }
  }

  if (action === 'batch_update_cq') {
    try {
      const mappings = req.nextUrl.searchParams.get('mappings')?.split(',') || []
      const results: any[] = []
      for (const m of mappings) {
        const [cqId, carId] = m.split(':')
        if (!cqId || !carId) continue
        await prisma.$executeRaw`
          UPDATE classification_queue
          SET final_matched_type = 'car', final_matched_id = ${carId},
              ai_matched_type = 'car', ai_matched_id = ${carId}
          WHERE id = ${cqId}
        `
        const data = await prisma.$queryRaw<any[]>`
          SELECT id, final_matched_type, final_matched_id, ai_matched_type, ai_matched_id
          FROM classification_queue
          WHERE id = ${cqId}
        `
        results.push({ cqId, carId, data, error: null })
      }
      return NextResponse.json({ results })
    } catch (error: any) {
      return NextResponse.json({ results: [], error: error.message })
    }
  }

  return NextResponse.json({
    actions: [
      'payment_dates_2026', 'all_ops', 'search_notes', 'unconnected_transactions',
      'income_transactions', 'cars', 'update_transaction', 'tx_schema', 'tx_insurance',
      'cq_insurance', 'update_cq', 'batch_update_cq', 'cq_car_linked', 'cq_raw',
      'tx_by_amounts', 'tx_recent_income', 'cq_data', 'find_tables'
    ]
  })
}
