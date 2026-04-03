import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET: OAuth 콜백 — code를 access_token으로 교환 후 계좌 목록 저장
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/finance/openbanking?error=${error || 'no_code'}`
    )
  }

  try {
    const clientId = process.env.OPENBANKING_CLIENT_ID!
    const clientSecret = process.env.OPENBANKING_CLIENT_SECRET!
    const redirectUri = process.env.OPENBANKING_REDIRECT_URI!
    const apiHost = process.env.OPENBANKING_API_HOST || 'https://testapi.openbanking.or.kr'

    // 1. Authorization code → Access Token 교환
    const tokenRes = await fetch(`${apiHost}/oauth/2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      throw new Error(`Token exchange failed: ${errText}`)
    }

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, expires_in, user_seq_no } = tokenData

    // 2. 사용자 계좌 목록 조회
    const accountRes = await fetch(
      `${apiHost}/v2.0/user/me?user_seq_no=${user_seq_no}`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      }
    )

    const accountData = await accountRes.json()
    const accounts = accountData.res_list || []

    // 3. MySQL에 토큰 + 계좌 저장 (openbanking_accounts)
    const expiresAt = new Date(Date.now() + expires_in * 1000)

    for (const account of accounts) {
      await prisma.$executeRaw`
        INSERT INTO openbanking_accounts
          (id, user_seq_no, fin_use_num, bank_code, bank_name,
           account_num_masked, account_holder_name,
           access_token, refresh_token, token_expires_at, is_active,
           created_at, updated_at)
        VALUES
          (UUID(), ${user_seq_no}, ${account.fintech_use_num},
           ${account.bank_code_std}, ${account.bank_name},
           ${account.account_num_masked}, ${account.account_holder_name},
           ${access_token}, ${refresh_token}, ${expiresAt},
           TRUE, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          access_token = VALUES(access_token),
          refresh_token = VALUES(refresh_token),
          token_expires_at = VALUES(token_expires_at),
          bank_name = VALUES(bank_name),
          account_holder_name = VALUES(account_holder_name),
          is_active = TRUE,
          updated_at = NOW()
      `
    }

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/finance/openbanking?success=true&count=${accounts.length}`
    )
  } catch (err) {
    console.error('OpenBanking callback error:', err)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/finance/openbanking?error=callback_failed`
    )
  }
}
