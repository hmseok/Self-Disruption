// Token cache (in-memory, reuse across requests)
let cachedToken: { token: string; expiresAt: number } | null = null

export async function getCodefToken(): Promise<string> {
  // Return cached token if still valid (with 1hr buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 3600000) {
    return cachedToken.token
  }

  const clientId = process.env.CODEF_CLIENT_ID!
  const clientSecret = process.env.CODEF_CLIENT_SECRET!
  const tokenUrl = process.env.CODEF_TOKEN_URL || 'https://oauth.codef.io/oauth/token'

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=read',
  })

  if (!res.ok) {
    throw new Error(`Codef token error: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()
  const expiresIn = data.expires_in || 604800 // 7 days default

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  }

  return cachedToken.token
}

export async function codefRequest(endpoint: string, body: object): Promise<any> {
  const token = await getCodefToken()
  const apiHost = process.env.CODEF_API_HOST || 'https://development.codef.io'

  const res = await fetch(`${apiHost}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  // Codef API는 성공(200)이어도 에러일 수 있으므로 일단 텍스트로 읽음
  const rawText = await res.text()

  // Codef API 응답은 URL 인코딩된 JSON으로 옴 (%7B%22result%22... 형태)
  let parsed: any
  try {
    const decoded = decodeURIComponent(rawText)
    parsed = JSON.parse(decoded)
  } catch {
    // URL 인코딩이 아닌 경우 그대로 파싱 시도
    try {
      parsed = JSON.parse(rawText)
    } catch {
      throw new Error(`Codef API 응답 파싱 실패: ${rawText.slice(0, 200)}`)
    }
  }

  if (!res.ok) {
    throw new Error(`Codef API error: ${res.status} ${JSON.stringify(parsed)}`)
  }

  return parsed
}
