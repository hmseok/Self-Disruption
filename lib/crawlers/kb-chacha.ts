/**
 * KB차차차 (kbchachacha.com) 크롤러
 *
 * KB국민은행 운영 — 차량 시세 조회 표준.
 * 브랜드/모델/연식별 시세(최저~최고)를 수집하여 CrawlResult로 반환.
 *
 * 전략:
 *   1. 차량 시세 API 엔드포인트 호출 (JSON 응답)
 *   2. 실패 시 시세 페이지 HTML 파싱 (cheerio 폴백)
 *   3. 둘 다 실패 시 빈 결과 + 에러 로그
 */

import * as cheerio from 'cheerio'
import type { CrawlerAdapter, CrawlTarget, CrawlResult } from './types'
import { fetchWithRetry } from './utils'

// KB차차차 브랜드/모델 매핑 (사이트 내부 ID용)
const BRAND_MAP: Record<string, string> = {
  '현대': '현대',
  '기아': '기아',
  'BMW': 'BMW',
  '벤츠': '벤츠',
  '테슬라': '테슬라',
}

/**
 * KB차차차 시세 조회 페이지에서 가격 정보를 추출
 * URL 패턴: https://www.kbchachacha.com/public/search/main.kbc#!?brand=현대&model=아반떼
 *
 * KB차차차는 SPA이므로 직접 HTML 파싱보다는
 * 내부 API 호출로 시세 데이터를 가져오는 방식을 우선 시도합니다.
 */
async function crawlKbForTarget(target: CrawlTarget): Promise<CrawlResult[]> {
  const results: CrawlResult[] = []
  const brandName = BRAND_MAP[target.brand] || target.brand

  for (let year = target.yearFrom; year <= target.yearTo; year++) {
    try {
      // KB차차차 매물 검색 API 시도
      const searchUrl = `https://www.kbchachacha.com/public/search/list.kbc?brand=${encodeURIComponent(brandName)}&model=${encodeURIComponent(target.model)}&yearFrom=${year}&yearTo=${year}&page=1&sort=price`

      const res = await fetchWithRetry(searchUrl)
      if (!res) continue

      const contentType = res.headers.get('content-type') || ''

      if (contentType.includes('application/json')) {
        // JSON 응답 — 구조화된 데이터 파싱
        const json = await res.json()
        const items = json?.data?.list || json?.list || json?.results || []

        if (items.length > 0) {
          const prices = items
            .map((item: any) => Number(item.price || item.salePrice || item.carPrice || 0))
            .filter((p: number) => p > 0)

          if (prices.length > 0) {
            prices.sort((a: number, b: number) => a - b)
            results.push({
              brand: target.brand,
              model: target.model,
              year,
              fuelType: target.fuelType || '가솔린',
              origin: target.origin,
              marketPrice: Math.round(prices.reduce((s: number, p: number) => s + p, 0) / prices.length),
              minPrice: prices[0],
              maxPrice: prices[prices.length - 1],
              sampleCount: prices.length,
              sourceSite: 'kb_chacha',
              sourceUrl: searchUrl,
            })
            continue
          }
        }
      }

      // HTML 폴백 — cheerio로 가격 정보 추출
      const html = contentType.includes('json') ? '' : await res.text()
      if (html) {
        const $ = cheerio.load(html)
        const priceElements = $('.price, .carPrice, [data-price], .sell-price, .total-price')
        const prices: number[] = []

        priceElements.each((_, el) => {
          const text = $(el).text().replace(/[^\d]/g, '')
          const price = Number(text)
          // 만원 단위 → 원 단위 변환 (100만 이하면 만원 단위로 간주)
          if (price > 0 && price < 100000) {
            prices.push(price * 10000)
          } else if (price >= 100000) {
            prices.push(price)
          }
        })

        if (prices.length > 0) {
          prices.sort((a, b) => a - b)
          results.push({
            brand: target.brand,
            model: target.model,
            year,
            fuelType: target.fuelType || '가솔린',
            origin: target.origin,
            marketPrice: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
            minPrice: prices[0],
            maxPrice: prices[prices.length - 1],
            sampleCount: prices.length,
            sourceSite: 'kb_chacha',
            sourceUrl: searchUrl,
          })
        }
      }
    } catch (err) {
      // 개별 연식 실패는 건너뛰기
      console.error(`[KB크롤러] ${target.brand} ${target.model} ${year}년 실패:`, err)
    }
  }

  return results
}

export const kbChachaCrawler: CrawlerAdapter = {
  sourceSite: 'kb_chacha',

  async crawl(targets: CrawlTarget[]): Promise<CrawlResult[]> {
    const allResults: CrawlResult[] = []

    // 동시 요청 제한 (rate limiting) — 3개씩 병렬
    const BATCH_SIZE = 3
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(
        batch.map(t => crawlKbForTarget(t))
      )
      for (const r of batchResults) {
        if (r.status === 'fulfilled') allResults.push(...r.value)
      }
      // 배치 간 딜레이 (사이트 부담 줄이기)
      if (i + BATCH_SIZE < targets.length) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    return allResults
  },
}
