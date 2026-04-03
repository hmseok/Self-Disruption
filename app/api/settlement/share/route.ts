import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// ============================================
// 정산 상세 공유 생성 API (Prisma 버전)
// POST → 공유 토큰 생성 및 링크 반환
// ============================================

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')

  // TODO: Phase 5 - Replace with Firebase Auth
  // For now, extract userId from JWT payload (base64 decode)
  let userId: string | null = null
  try {
    const parts = token.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
      userId = payload.sub || payload.user_id
    }
  } catch {}

  if (!userId) return null

  const profiles = await prisma.$queryRaw<any[]>`
    SELECT role FROM profiles WHERE id = ${userId} LIMIT 1
  `

  if (profiles.length === 0 || !['admin', 'master'].includes(profiles[0].role)) return null
  return { id: userId, role: profiles[0].role }
}

type SettlementItem = {
  type: 'jiip' | 'invest'
  monthLabel: string
  amount: number
  detail: string
  carNumber?: string
  carId?: string
  breakdown?: {
    revenue?: number
    expense?: number
    adminFee?: number
    netProfit?: number
    distributable?: number
    shareRatio?: number
    investorPayout?: number
  }
}

type TransactionDetail = {
  date: string
  description: string
  amount: number
  type: 'income' | 'expense'
  category?: string
}

type BankInfo = {
  bank_name?: string
  account_holder?: string
  account_number?: string
}

type CreateShareRequest = {
  recipient_name: string
  recipient_phone?: string
  settlement_month: string
  payment_date?: string
  total_amount: number
  items: SettlementItem[]
  breakdown?: Record<string, any>
  transaction_details?: Record<string, TransactionDetail[]>  // carId_month → 거래내역[]
  bank_info?: BankInfo
  message?: string
}

function generateToken(): string {
  return crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, (c) => {
    const replacements: Record<string, string> = { '+': '-', '/': '_', '=': '' }
    return replacements[c] || c
  }).slice(0, 12)
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

    const body = await request.json() as CreateShareRequest
    const {
      recipient_name,
      recipient_phone,
      settlement_month,
      payment_date,
      total_amount,
      items,
      breakdown,
      transaction_details,
      bank_info,
      message
    } = body

    // 필드 검증
    if (!recipient_name?.trim()) {
      return NextResponse.json({ error: 'recipient_name 필수' }, { status: 400 })
    }
    if (!settlement_month?.trim()) {
      return NextResponse.json({ error: 'settlement_month 필수' }, { status: 400 })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items 배열 필수' }, { status: 400 })
    }

    const token = generateToken()
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

    // 공유 레코드 생성
    const insertData = {
      token,
      recipient_name: recipient_name.trim(),
      recipient_phone: recipient_phone?.replace(/[^0-9]/g, '') || null,
      settlement_month: settlement_month.trim(),
      payment_date: payment_date?.trim() || null,
      total_amount: total_amount || 0,
      items: JSON.stringify(items),
      breakdown: JSON.stringify(breakdown || null),
      transaction_details: JSON.stringify(transaction_details || null),
      bank_info: JSON.stringify(bank_info || null),
      message: message?.trim() || null,
      created_at: now,
      expires_at: expiresAt,
      view_count: 0,
    }

    try {
      await prisma.$executeRaw`
        INSERT INTO settlement_shares
        (token, recipient_name, recipient_phone, settlement_month, payment_date, total_amount,
         items, breakdown, transaction_details, bank_info, message, created_at, expires_at, view_count)
        VALUES (
          ${insertData.token}, ${insertData.recipient_name}, ${insertData.recipient_phone},
          ${insertData.settlement_month}, ${insertData.payment_date}, ${insertData.total_amount},
          ${insertData.items}, ${insertData.breakdown}, ${insertData.transaction_details},
          ${insertData.bank_info}, ${insertData.message}, ${insertData.created_at},
          ${insertData.expires_at}, ${insertData.view_count}
        )
      `
    } catch (error) {
      console.error('[settlement/share] 삽입 오류:', error)
      return NextResponse.json({ error: '공유 생성 실패' }, { status: 500 })
    }

    const data = await prisma.$queryRaw<any[]>`
      SELECT * FROM settlement_shares WHERE token = ${token} LIMIT 1
    `

    return NextResponse.json({
      success: true,
      token,
      url: `/settlement/view/${token}`,
      data: data.length > 0 ? data[0] : insertData
    })
  } catch (err: any) {
    console.error('[settlement/share] 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
