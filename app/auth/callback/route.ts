import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const headersList = await headers()
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || requestUrl.host
  const protocol = headersList.get('x-forwarded-proto') || 'https'
  const origin = `${protocol}://${host}`

  // Firebase handles auth state client-side — just redirect to verified page
  return NextResponse.redirect(`${origin}/auth/verified`)
}
