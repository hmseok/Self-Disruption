/**
 * 엔카 (encar.com) 크롤러
 *
 * 국내 최대 중고차 플랫폼 — 실매물 가격 통계.
 * 매물 검색 → 가격 목록 → 중앙값/최소/최대/매물수 산출.
 *
 * 전략:
 *   1. 엔카 검색 API 호출 (JSON)
 *   2. 실패 시 검색 결과 HTML 파싱 (cheerio)
 *   3. Rate limiting: 3개씩 병렬, 배치 간 2초 딜레이
 */

import * as cheerio from 'cheerio'
import type { CrawlerAdapter, CrawlTarget, CrawlResult } from './types'
import { fetchWithRetry } from './utils'

async function crawlEncarForTarget(target: CrawlTarget): Promise<CrawlResult[]> {
  const results: CrawlResult[] = []

  for (let year = target.yearFrom; year <= target.yearTo; year++) {
    try {
      // 엔카 검색 URL
      const searchUrl = `https://www.encar.com/dc/dc_carsearchlist.do?carType=kor&searchType=model&manufacturer=${encodeURIComponent(target.brand)}&model=${encodeURIComponent(target.model)}&yearFrom=${year}&yearTo=${year}&page=1&pageSize=50&order=price`

      const res = await fetchWithRetry(searchUrl, 2, { 'Referer': 'https://www.encar.com/' })
      if (!res) continue

      const contentType = res.headers.get('content-type') || ''

      if (contentType.includes('application/json')) {
        // JSON 응답
        const json = await res.json()
        const items = json?.data?.list || json?.SearchResults || json?.list || []

        if (items.length > 0) {
          const prices = items
            .map((item: any) => {
              const p = Number(item.Price || item.price || item.salePrice || 0)
              // 엔카는 만원 단위
              return p > 0 && p < 100000 ? p * 10000 : p
            })
            .filter((p: number) => p > 0)

          if (prices.length > 0) {
            prices.sort((a: number, b: number) => a - b)
            const median = prices[Math.floor(prices.length / 2)]
            results.push({
              brand: target.brand,
              model: target.model,
              year,
              fuelType: target.fuelType || '가솔린',
              origin: target.origin,
              marketPrice: median,
              minPrice: prices[0],
              maxPrice: prices[prices.length - 1],
              sampleCount: prices.length,
              sourceSite: 'encar',
              sourceUrl: searchUrl,
            })
            continue
          }
        }
      }

      // HTML 폴백
      const html = contentType.includes('json') ? '' : await res.text()
      if (html) {
        const $ = cheerio.load(html)
        const prices: number[] = []

        // 엔카 가격 셀렉터 (여러 패턴 시도)
        $('.price, .car_price, .item_price, [class*="price"]').each((_, el) => {
          const text = $(el).text().replace(/[^\d]/g, '')
          const price = Number(text)
          if (price > 0 && price < 100000) {
            prices.push(price * 10000)  // 만원 → 원
          } else if (price >= 1000000) {
            prices.push(price)
          }
        })

        if (prices.length > 0) {
          prices.sort((a, b) => a - b)
          const median = prices[Math.floor(prices.length / 2)]
          results.push({
            brand: target.brand,
            model: target.model,
            year,
            fuelType: target.fuelType || '가솔린',
            origin: target.origin,
            marketPrice: median,
            minPrice: prices[0],
            maxPrice: prices[prices.length - 1],
            sampleCount: prices.length,
            sourceSite: 'encar',
            sourceUrl: searchUrl,
          })
        }
      }
    } catch (err) {
      console.error(`[엔카크롤러] ${target.brand} ${target.model} ${year}년 실패:`, err)
    }
  }

  return results
}

export const encarCrawler: CrawlerAdapter = {
  sourceSite: 'encar',

  async crawl(targets: CrawlTarget[]): Promise<CrawlResult[]> {
    const allResults: CrawlResult[] = []
    const BATCH_SIZE = 3

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(
        batch.map(t => crawlEncarForTarget(t))
      )
      for (const r of batchResults) {
        if (r.status === 'fulfilled') allResults.push(...r.value)
      }
      if (i + BATCH_SIZE < targets.length) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    return allResults
  },
}
