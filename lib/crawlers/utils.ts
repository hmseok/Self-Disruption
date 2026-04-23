/**
 * 크롤러 공유 유틸리티
 */

// 브라우저 User-Agent
export const CRAWLER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

/**
 * 재시도 포함 HTTP fetch
 * @param url 대상 URL
 * @param retries 재시도 횟수 (기본 2)
 * @param extraHeaders 추가 헤더
 */
export async function fetchWithRetry(
  url: string,
  retries = 2,
  extraHeaders: Record<string, string> = {},
): Promise<Response | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': CRAWLER_UA,
          'Accept': 'text/html,application/xhtml+xml,application/json',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          ...extraHeaders,
        },
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) return res
    } catch {
      if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
  return null
}
