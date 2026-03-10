import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// ============================================
// 정산 상세 공유 생성 API
// POST → 공유 토큰 생성 및 링크 반환
// ============================================

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await getSupabaseAdmin()
    .from('profiles').select('role, company_id').eq('id', user.id).single()
  if (!profile || !['god_admin', 'master'].includes(profile.role)) return null
  return { ...user, role: profile.role, company_id: profile.company_id }
}

type SettlementItem = {
  type: 'jiip' | 'invest'
  monthLabel: string
  amount: number
  detail: string
  carNumber?: string
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

type CreateShareRequest = {
  recipient_name: string
  settlement_month: string
  payment_date?: string
  total_amount: number
  items: SettlementItem[]
  breakdown?: Record<string, any>
  message?: string
  company_id: string
}

function generateToken(): string {
  // 12글자 nanoid 스타일 토큰 생성
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
      settlement_month,
      payment_date,
      total_amount,
      items,
      breakdown,
      message,
      company_id
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
    if (!company_id?.trim()) {
      return NextResponse.json({ error: 'company_id 필수' }, { status: 400 })
    }

    // 회사 권한 확인
    if (admin.company_id !== company_id) {
      return NextResponse.json({ error: '해당 회사에 대한 권한 없음' }, { status: 403 })
    }

    const sb = getSupabaseAdmin()
    const token = generateToken()

    // 공유 레코드 생성
    const { data, error } = await sb
      .from('settlement_shares')
      .insert({
        token,
        company_id,
        recipient_name: recipient_name.trim(),
        settlement_month: settlement_month.trim(),
        payment_date: payment_date?.trim() || null,
        total_amount: total_amount || 0,
        items: items,
        breakdown: breakdown || null,
        message: message?.trim() || null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        view_count: 0,
      })
      .select()
      .single()

    if (error) {
      console.error('[settlement/share] 삽입 오류:', error)
      return NextResponse.json({ error: '공유 생성 실패' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      token,
      url: `/settlement/view/${token}`,
      data
    })
  } catch (err: any) {
    console.error('[settlement/share] 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
