import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ============================================
// 수금 확인 API
// POST → 입금 확인 처리 (transactions 생성 + schedule 매칭)
// ============================================

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.sub || payload.user_id || null
  } catch { return null }
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const userId = getUserIdFromToken(token)
  if (!userId) return null
  // TODO: Phase 5 - Replace with Firebase Auth verification
  const profiles = await prisma.$queryRaw<any[]>`SELECT * FROM profiles WHERE id = ${userId} LIMIT 1`
  const profile = profiles[0]
  if (!profile || !['admin', 'master'].includes(profile.role)) return null
  return { id: userId, ...profile }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

    const body = await request.json()
    const {
      schedule_id,
      actual_amount,
      payment_date,
      payment_method = '계좌이체',
      memo = '',
    } = body

    if (!schedule_id || !actual_amount || !payment_date) {
      return NextResponse.json({ error: 'schedule_id, actual_amount, payment_date 필수' }, { status: 400 })
    }

    // 1. 스케줄 조회
    const schedules = await prisma.$queryRaw<any[]>`SELECT * FROM expected_payment_schedules WHERE id = ${schedule_id} LIMIT 1`
    const schedule = schedules[0]

    if (!schedule) {
      return NextResponse.json({ error: '결제 스케줄을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (schedule.status === 'completed') {
      return NextResponse.json({ error: '이미 수금 완료된 건입니다.' }, { status: 409 })
    }

    // 2. 계약 정보 조회 (고객명)
    const tableName = schedule.contract_type === 'jiip' ? 'jiip_contracts' : 'general_investments'
    const nameField = 'investor_name'
    const contracts = await prisma.$queryRaw<any[]>`SELECT investor_name FROM ${tableName} WHERE id = ${schedule.contract_id} LIMIT 1`
    const contract = contracts[0]

    const clientName = contract?.investor_name || '고객'
    const companyId = schedule.company_id

    // 3. 거래 내역 생성 (transactions)
    const monthStr = new Date(schedule.payment_date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })
    const txId = await prisma.$queryRaw<any[]>`
      INSERT INTO transactions (
        transaction_date, type, status, category, client_name, description, amount, payment_method, related_type, related_id
      ) VALUES (
        ${payment_date}, 'income', 'completed', ${schedule.contract_type === 'jiip' ? '지입수입' : '금융수입'}, ${clientName},
        ${`${monthStr} ${clientName} ${schedule.contract_type === 'jiip' ? '관리비' : '이자'} 수금${memo ? ` (${memo})` : ''}`},
        ${actual_amount}, ${payment_method}, ${schedule.contract_type}, ${schedule.contract_id}
      )
    `

    if (!txId) {
      console.error('[collections/confirm] 거래 생성 실패')
      return NextResponse.json({ error: '거래 내역 생성 실패' }, { status: 500 })
    }

    const tx = { id: txId[0]?.id || '' }

    // 4. 스케줄 업데이트 (매칭)
    const newStatus = actual_amount >= schedule.expected_amount ? 'completed' : 'partial'
    try {
      await prisma.$executeRaw`
        UPDATE expected_payment_schedules
        SET actual_amount = ${actual_amount}, status = ${newStatus}, matched_transaction_id = ${tx.id}, updated_at = ${new Date().toISOString()}
        WHERE id = ${schedule_id}
      `
    } catch (updateErr: any) {
      console.error('[collections/confirm] 스케줄 업데이트 실패:', updateErr)
      return NextResponse.json({ error: '스케줄 업데이트 실패: ' + updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      transaction_id: tx.id,
      schedule_id,
      status: newStatus,
      actual_amount,
    })
  } catch (err: any) {
    console.error('[collections/confirm] 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
