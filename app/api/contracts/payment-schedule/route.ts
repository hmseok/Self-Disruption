import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// ============================================
// 결제 스케줄 API
// POST → 월별 예상 결제 스케줄 자동 생성
// GET  → 스케줄 목록 + 실제 입금 현황
// ============================================

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')

  // TODO: Phase 5 Firebase Auth - JWT decode to get userId
  // For now, extract userId from token (simple base64 decode)
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString())
    const userId = decoded.sub || decoded.user_id
    if (!userId) return null

    const profile = await prisma.$queryRaw<any[]>`
      SELECT role FROM profiles WHERE id = ${userId} LIMIT 1
    `
    if (!profile || profile.length === 0 || !['admin', 'master'].includes(profile[0].role)) {
      return null
    }
    return { id: userId, role: profile[0].role }
  } catch {
    return null
  }
}

// POST: 결제 스케줄 생성
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { contract_type, contract_id } = body

  if (!contract_type || !contract_id) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  }

  const tableName = contract_type === 'jiip' ? 'jiip_contracts' : 'general_investments'

  try {
    // 계약 정보 조회
    const contract = await prisma.$queryRaw<any[]>`
      SELECT * FROM ${Prisma.raw(tableName)} WHERE id = ${contract_id} LIMIT 1
    `

    if (!contract || contract.length === 0) {
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (!contract[0].contract_start_date || !contract[0].contract_end_date) {
      return NextResponse.json({ error: '계약 시작일/종료일이 필요합니다.' }, { status: 400 })
    }

    // 기존 스케줄 삭제 (재생성)
    await prisma.$executeRaw`
      DELETE FROM expected_payment_schedules
      WHERE contract_type = ${contract_type} AND contract_id = ${contract_id}
    `

    // 월별 스케줄 생성
    const startDate = new Date(contract[0].contract_start_date)
    const endDate = new Date(contract[0].contract_end_date)
    const payDay = contract_type === 'jiip' ? (contract[0].payout_day || 10) : (contract[0].payment_day || 10)

    // 월별 예상 금액 계산
    let monthlyAmount: number
    if (contract_type === 'jiip') {
      monthlyAmount = contract[0].admin_fee || 0
    } else {
      // 일반투자: 월 이자 = 투자금 × 연이자율 / 12
      const amount = Number(contract[0].invest_amount || 0)
      const rate = Number(contract[0].interest_rate || 0)
      monthlyAmount = Math.round(amount * rate / 100 / 12)
    }

    const schedules: any[] = []
    let paymentNumber = 1
    const current = new Date(startDate.getFullYear(), startDate.getMonth(), payDay)

    // 시작일 이전이면 다음달로
    if (current < startDate) {
      current.setMonth(current.getMonth() + 1)
    }

    while (current <= endDate) {
      schedules.push({
        contract_type,
        contract_id,
        payment_date: current.toISOString().split('T')[0],
        payment_number: paymentNumber,
        expected_amount: monthlyAmount,
        status: 'pending',
      })
      paymentNumber++
      current.setMonth(current.getMonth() + 1)
    }

    if (schedules.length === 0) {
      return NextResponse.json({ error: '생성할 스케줄이 없습니다.' }, { status: 400 })
    }

    // 일괄 삽입
    for (const schedule of schedules) {
      await prisma.$executeRaw`
        INSERT INTO expected_payment_schedules
        (contract_type, contract_id, payment_date, payment_number, expected_amount, status)
        VALUES (${schedule.contract_type}, ${schedule.contract_id}, ${schedule.payment_date}, ${schedule.payment_number}, ${schedule.expected_amount}, ${schedule.status})
      `
    }

    return NextResponse.json({
      success: true,
      count: schedules.length,
      monthly_amount: monthlyAmount,
      total_expected: monthlyAmount * schedules.length,
    })
  } catch (e: any) {
    console.error('[payment-schedule POST] 에러:', e.message)
    return NextResponse.json({ error: '스케줄 생성 실패: ' + e.message }, { status: 500 })
  }
}

// GET: 스케줄 목록 + 실제 입금 현황
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const contractType = searchParams.get('contract_type')
  const contractId = searchParams.get('contract_id')
  const idsParam = searchParams.get('ids') || ''

  // Support rental contracts with payment_schedules table
  if (idsParam) {
    // Handle comma-separated contract IDs for rental contracts
    const ids = idsParam.split(',').filter(id => id.trim())
    if (ids.length === 0) {
      return NextResponse.json({ data: [], error: null })
    }
    try {
      const placeholders = ids.map(() => '?').join(',')
      const schedules = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM payment_schedules WHERE contract_id IN (${placeholders}) ORDER BY contract_id, round_number ASC`,
        ...ids
      )
      return NextResponse.json({ data: schedules, error: null })
    } catch (e: any) {
      console.error('[payment-schedule GET ids]', e.message)
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  if (!contractType || !contractId) {
    return NextResponse.json({ error: 'contract_type, contract_id 필수' }, { status: 400 })
  }

  try {
    // 스케줄 조회
    const schedules = await prisma.$queryRaw<any[]>`
      SELECT * FROM expected_payment_schedules
      WHERE contract_type = ${contractType} AND contract_id = ${contractId}
      ORDER BY payment_number ASC
    `

    // 실제 입금 내역 조회 (jiip은 jiip + jiip_share 모두 포함)
    const relatedTypes = contractType === 'jiip' ? ['jiip', 'jiip_share'] : [contractType!]
    let transactions: any[] = []

    if (relatedTypes.length === 1) {
      transactions = await prisma.$queryRaw<any[]>`
        SELECT id, amount, type, created_at, transaction_date, description, related_type
        FROM transactions
        WHERE related_type = ${relatedTypes[0]} AND related_id = ${contractId}
        ORDER BY transaction_date ASC
      `
    } else {
      transactions = await prisma.$queryRaw<any[]>`
        SELECT id, amount, type, created_at, transaction_date, description, related_type
        FROM transactions
        WHERE related_type IN (${Prisma.raw(relatedTypes.map(t => `'${t}'`).join(','))})
        AND related_id = ${contractId}
        ORDER BY transaction_date ASC
      `
    }

    // 요약 계산
    const totalExpected = (schedules || []).reduce((sum, s) => sum + (s.expected_amount || 0), 0)
    const incomeTxs = (transactions || []).filter((t: any) => t.type === 'income')
    const expenseTxs = (transactions || []).filter((t: any) => t.type === 'expense')
    const totalIncome = incomeTxs.reduce((sum: number, t: any) => sum + Math.abs(t.amount || 0), 0)
    const totalExpenseAmt = expenseTxs.reduce((sum: number, t: any) => sum + Math.abs(t.amount || 0), 0)
    const completedCount = (schedules || []).filter(s => s.status === 'completed').length
    const overdueCount = (schedules || []).filter(s => {
      return s.status === 'pending' && new Date(s.payment_date) < new Date()
    }).length

    return NextResponse.json({
      schedules: schedules || [],
      transactions: transactions || [],
      summary: {
        total_months: schedules?.length || 0,
        completed: completedCount,
        overdue: overdueCount,
        total_expected: totalExpected,
        total_income: totalIncome,
        total_expense: totalExpenseAmt,
        total_actual: totalIncome,
        balance: totalExpected - totalIncome,
      },
    })
  } catch (e: any) {
    console.error('[payment-schedule GET] 에러:', e.message)
    return NextResponse.json({ error: '조회 실패: ' + e.message }, { status: 500 })
  }
}
