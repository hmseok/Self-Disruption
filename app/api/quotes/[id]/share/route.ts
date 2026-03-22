import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/utils/auth-guard'
import { createClient } from '@supabase/supabase-js'
import { recordLifecycleEvent } from '@/app/utils/lifecycle-events'

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
      .select('id, status, customer_name, rent_fee')
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
      // 기존 토큰 재사용 시에도 shared 이벤트 기록 (company_id 확인 필요)
      // Note: quote.company_id removed from quotes table, using existingToken company info if available
      return NextResponse.json({
        token: existingToken.token,
        shareUrl: `${origin}/sign/${existingToken.token}`,
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
    const shareUrl = `${origin}/sign/${token}`

    // 라이프사이클 이벤트 기록
    // Note: company_id removed from quotes table, skipping lifecycle event
    // recordLifecycleEvent({
    //   companyId: quote.company_id,
    //   quoteId,
    //   eventType: 'shared',
    //   channel: 'link',
    //   actorId: auth.userId || null,
    // })

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

    // 라이프사이클 이벤트 기록
    // Note: company_id removed from quotes table, cannot record lifecycle event
    // const { data: rQuote } = await supabase.from('quotes').select('company_id').eq('id', quoteId).single()
    // if (rQuote) {
    //   recordLifecycleEvent({
    //     companyId: rQuote.company_id,
    //     quoteId,
    //     eventType: 'revoked',
    //     actorId: auth.userId || null,
    //   })
    // }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: '토큰 비활성화 오류' }, { status: 500 })
  }
}
