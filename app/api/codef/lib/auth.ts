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

  if (!res.ok) {
    throw new Error(`Codef API error: ${res.status} ${await res.text()}`)
  }

  return res.json()
}
