import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyUser } from '@/lib/auth-server'

// GET: 오픈뱅킹 OAuth 인증 페이지로 리다이렉트
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const clientId = process.env.OPENBANKING_CLIENT_ID!
  const redirectUri = process.env.OPENBANKING_REDIRECT_URI!
  const apiHost = process.env.OPENBANKING_API_HOST || 'https://testapi.openbanking.or.kr'

  // CSRF 방지용 state
  const state = crypto.randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'login inquiry',
    state,
    auth_type: '0',          // 0: 최초인증
    lang: 'kor',
  })

  const authUrl = `${apiHost}/oauth/2.0/authorize?${params.toString()}`

  return NextResponse.redirect(authUrl)
}
