import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/utils/auth-guard'
import { prisma } from '@/lib/prisma'

/**
 * 견적서 공유 링크 생성 API (인증 필요)
 * POST /api/quotes/[id]/share
 *
 * 직원이 견적서를 고객에게 공유할 때 사용
 * - 공유 토큰 생성
 * - quotes.shared_at 업데이트
 * - 반환: { token, shareUrl, expiresAt }
 */

// MySQL DATETIME 형식 변환
function toMySQLDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

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

    // 1. 견적 존재 확인
    const quote = await prisma.$queryRaw<any[]>`
      SELECT id, status, customer_name, rent_fee FROM quotes WHERE id = ${quoteId} LIMIT 1
    `

    if (!quote || quote.length === 0) {
      return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (quote[0].status === 'archived') {
      return NextResponse.json({ error: '보관된 견적서는 공유할 수 없습니다.' }, { status: 400 })
    }

    // 2. 기존 활성 토큰 확인 (이미 있으면 재사용)
    const expiresAtThreshold = toMySQLDatetime(new Date())
    const existingToken = await prisma.$queryRaw<any[]>`
      SELECT * FROM quote_share_tokens
      WHERE quote_id = ${quoteId} AND status = 'active' AND expires_at > ${expiresAtThreshold}
      ORDER BY created_at DESC LIMIT 1
    `

    if (existingToken && existingToken.length > 0) {
      const origin = process.env.NEXT_PUBLIC_BASE_URL || req.headers.get('origin') || ''
      return NextResponse.json({
        token: existingToken[0].token,
        shareUrl: `${origin}/sign/${existingToken[0].token}`,
        expiresAt: existingToken[0].expires_at,
        isExisting: true
      })
    }

    // 3. 새 토큰 생성
    const token = generateToken(32)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiryDays)

    const tokenId = Date.now().toString()
    await prisma.$executeRaw`
      INSERT INTO quote_share_tokens
      (id, quote_id, token, status, expires_at, created_at)
      VALUES (${tokenId}, ${quoteId}, ${token}, 'active', ${toMySQLDatetime(expiresAt)}, NOW())
    `

    // 4. quotes.shared_at 업데이트
    await prisma.$executeRaw`
      UPDATE quotes SET shared_at = NOW() WHERE id = ${quoteId}
    `

    const origin = process.env.NEXT_PUBLIC_BASE_URL || req.headers.get('origin') || ''
    const shareUrl = `${origin}/sign/${token}`

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

    // 공유 토큰 목록
    const tokens = await prisma.$queryRaw<any[]>`
      SELECT * FROM quote_share_tokens WHERE quote_id = ${quoteId}
      ORDER BY created_at DESC
    `

    // 서명 목록
    const signatures = await prisma.$queryRaw<any[]>`
      SELECT * FROM customer_signatures WHERE quote_id = ${quoteId}
      ORDER BY created_at DESC
    `

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

    // 해당 견적의 모든 활성 토큰 비활성화
    await prisma.$executeRaw`
      UPDATE quote_share_tokens SET status = 'revoked'
      WHERE quote_id = ${quoteId} AND status = 'active'
    `

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[quotes/share DELETE] 에러:', e.message)
    return NextResponse.json({ error: '토큰 비활성화 오류' }, { status: 500 })
  }
}
