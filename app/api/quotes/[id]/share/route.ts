import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/utils/auth-guard'
import { createClient } from '@supabase/supabase-js'

/**
 * 견적서 공유 링크 생성 API (인증 필요)
 * POST /api/quotes/[id]/share
 *
 * 직원이 견적서를 고객에게 공유할 때 사용
 * - 공유 토큰 생성
 * - quotes.shared_at 업데이트
 * - 반환: { token, shareUrl, expiresAt }
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// nanoid 대안: crypto로 안전한 랜덤 토큰 생성
function generateToken(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => chars[byte % chars.length]).join('')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 인증 확인
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  try {
    const { id: quoteId } = await params
    const body = await req.json().catch(() => ({}))
    const { expiryDays = 7, email } = body

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. 견적 존재 확인
    const { data: quote, error: quoteErr } = await supabase
      .from('quotes')
      .select('id, company_id, status, customer_name, rent_fee')
      .eq('id', quoteId)
      .single()

    if (quoteErr || !quote) {
      return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (quote.status === 'archived') {
      return NextResponse.json({ error: '보관된 견적서는 공유할 수 없습니다.' }, { status: 400 })
    }

    // 2. 기존 활성 토큰 확인 (이미 있으면 재사용)
    const { data: existingToken } = await supabase
      .from('quote_share_tokens')
      .select('*')
      .eq('quote_id', quoteId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existingToken) {
      const origin = process.env.NEXT_PUBLIC_BASE_URL || req.headers.get('origin') || ''
      return NextResponse.json({
        token: existingToken.token,
        shareUrl: `${origin}/public/quote/${existingToken.token}`,
        expiresAt: existingToken.expires_at,
        isExisting: true
      })
    }

    // 3. 새 토큰 생성
    const token = generateToken(32)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiryDays)

    const { data: shareToken, error: insertErr } = await supabase
      .from('quote_share_tokens')
      .insert([{
        quote_id: quoteId,
        company_id: quote.company_id,
        token,
        status: 'active',
        expires_at: expiresAt.toISOString()
      }])
      .select()
      .single()

    if (insertErr) throw insertErr

    // 4. quotes.shared_at 업데이트
    await supabase
      .from('quotes')
      .update({ shared_at: new Date().toISOString() })
      .eq('id', quoteId)

    const origin = process.env.NEXT_PUBLIC_BASE_URL || req.headers.get('origin') || ''
    const shareUrl = `${origin}/public/quote/${token}`

    return NextResponse.json({
      token,
      shareUrl,
      expiresAt: expiresAt.toISOString(),
      isExisting: false
    })

  } catch (e: any) {
    console.error('[quotes/share] 에러:', e.message)
    return NextResponse.json({ error: '공유 링크 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

// GET: 공유 상태 조회
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  try {
    const { id: quoteId } = await params
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 공유 토큰 목록
    const { data: tokens } = await supabase
      .from('quote_share_tokens')
      .select('*')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: false })

    // 서명 목록
    const { data: signatures } = await supabase
      .from('customer_signatures')
      .select('*')
      .eq('quote_id', quoteId)
      .order('signed_at', { ascending: false })

    return NextResponse.json({
      tokens: tokens || [],
      signatures: signatures || [],
    })
  } catch (e: any) {
    console.error('[quotes/share GET] 에러:', e.message)
    return NextResponse.json({ error: '조회 오류' }, { status: 500 })
  }
}

// DELETE: 토큰 비활성화
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  try {
    const { id: quoteId } = await params
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 해당 견적의 모든 활성 토큰 비활성화
    await supabase
      .from('quote_share_tokens')
      .update({ status: 'revoked' })
      .eq('quote_id', quoteId)
      .eq('status', 'active')

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: '토큰 비활성화 오류' }, { status: 500 })
  }
}
