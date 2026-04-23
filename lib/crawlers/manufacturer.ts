/**
 * 제조사 공식 사이트 크롤러 (현대/기아/제네시스)
 *
 * 신차 출고가를 수집하여 vehicle_market_price에 source_site='manufacturer'로 저장.
 * 출고가는 렌트 원가의 기준점 (감가 계산의 시작점).
 *
 * 전략:
 *   1. 현대/기아/제네시스 가격 페이지 HTML → cheerio 파싱
 *   2. 트림별 가격 추출 → 대표 트림(기본) 가격을 market_price로
 *   3. 수입차(BMW/벤츠/테슬라)는 공식 사이트 구조가 복잡 → 수동 또는 후속 Phase
 */

import * as cheerio from 'cheerio'
import type { CrawlerAdapter, CrawlTarget, CrawlResult } from './types'
import { fetchWithRetry } from './utils'

async function fetchPage(url: string): Promise<string | null> {
  const res = await fetchWithRetry(url, 2)
  if (!res) return null
  return await res.text()
}

// ── 현대 모델 URL 매핑 ──
const HYUNDAI_MODELS: Record<string, string> = {
  '아반떼': 'https://www.hyundai.com/kr/ko/vehicles/avante/price',
  '쏘나타': 'https://www.hyundai.com/kr/ko/vehicles/sonata/price',
  '그랜저': 'https://www.hyundai.com/kr/ko/vehicles/grandeur/price',
  '투싼': 'https://www.hyundai.com/kr/ko/vehicles/tucson/price',
  '싼타페': 'https://www.hyundai.com/kr/ko/vehicles/santa-fe/price',
  '코나': 'https://www.hyundai.com/kr/ko/vehicles/kona/price',
  '셀토스': 'https://www.hyundai.com/kr/ko/vehicles/celtos/price',
  '스타리아': 'https://www.hyundai.com/kr/ko/vehicles/staria/price',
  '아이오닉5': 'https://www.hyundai.com/kr/ko/vehicles/ioniq5/price',
  '아이오닉6': 'https://www.hyundai.com/kr/ko/vehicles/ioniq6/price',
}

// ── 기아 모델 URL 매핑 ──
const KIA_MODELS: Record<string, string> = {
  'K3': 'https://www.kia.com/kr/vehicles/k3/price',
  'K5': 'https://www.kia.com/kr/vehicles/k5/price',
  'K8': 'https://www.kia.com/kr/vehicles/k8/price',
  '스포티지': 'https://www.kia.com/kr/vehicles/sportage/price',
  '쏘렌토': 'https://www.kia.com/kr/vehicles/sorento/price',
  '카니발': 'https://www.kia.com/kr/vehicles/carnival/price',
  'EV6': 'https://www.kia.com/kr/vehicles/ev6/price',
  'EV9': 'https://www.kia.com/kr/vehicles/ev9/price',
  '모닝': 'https://www.kia.com/kr/vehicles/morning/price',
  '레이': 'https://www.kia.com/kr/vehicles/ray/price',
}

/**
 * HTML에서 가격 정보를 추출하는 공통 파서
 * 제조사 사이트의 가격 페이지에서 트림명+가격 쌍을 추출
 */
function extractPricesFromHtml(html: string): Array<{ trim: string; price: number }> {
  const $ = cheerio.load(html)
  const trims: Array<{ trim: string; price: number }> = []

  // 패턴 1: 가격표 테이블 형식
  $('table tr, .price-table tr, .trim-price').each((_, el) => {
    const cells = $(el).find('td, .trim-name, .price-value')
    if (cells.length >= 2) {
      const trimName = $(cells[0]).text().trim()
      const priceText = $(cells[cells.length - 1]).text().replace(/[^\d]/g, '')
      const price = Number(priceText)
      if (trimName && price > 1000) {
        // 만원 단위 → 원 단위 변환
        trims.push({ trim: trimName, price: price < 100000 ? price * 10000 : price })
      }
    }
  })

  // 패턴 2: 가격 카드/리스트 형식
  if (trims.length === 0) {
    $('[class*="price"], [class*="trim"], [data-trim]').each((_, el) => {
      const text = $(el).text()
      // "트림명 XX,XXX 만원" 또는 "XX,XXX,XXX원" 패턴 매칭
      const priceMatch = text.match(/(\d{1,3}[,.]?\d{3})\s*만?\s*원?/)
      if (priceMatch) {
        const rawPrice = Number(priceMatch[1].replace(/[,.]/g, ''))
        const trim = text.replace(priceMatch[0], '').trim().slice(0, 50)
        if (rawPrice > 0) {
          trims.push({
            trim: trim || '기본',
            price: rawPrice < 100000 ? rawPrice * 10000 : rawPrice,
          })
        }
      }
    })
  }

  // 패턴 3: JSON-LD 또는 스크립트 내 가격 데이터
  if (trims.length === 0) {
    $('script[type="application/ld+json"], script').each((_, el) => {
      const scriptContent = $(el).html() || ''
      try {
        // JSON-LD에서 offers/price 추출
        if (scriptContent.includes('"price"') || scriptContent.includes('"offers"')) {
          const json = JSON.parse(scriptContent)
          const offers = json?.offers || (Array.isArray(json) ? json : [json])
          for (const offer of Array.isArray(offers) ? offers : [offers]) {
            if (offer?.price) {
              trims.push({
                trim: offer.name || '기본',
                price: Number(offer.price) < 100000 ? Number(offer.price) * 10000 : Number(offer.price),
              })
            }
          }
        }
      } catch {
        // JSON 파싱 실패 무시
      }
    })
  }

  return trims
}

async function crawlManufacturerForTarget(target: CrawlTarget): Promise<CrawlResult[]> {
  const results: CrawlResult[] = []

  // URL 결정
  let url: string | undefined
  if (target.brand === '현대') {
    url = HYUNDAI_MODELS[target.model]
  } else if (target.brand === '기아') {
    url = KIA_MODELS[target.model]
  }

  // 수입차는 현재 Phase에서 스킵 (URL 매핑 없음)
  if (!url) {
    if (target.origin === '수입') {
      // 수입차는 note에 기록하고 스킵
      console.log(`[제조사크롤러] ${target.brand} ${target.model} — 수입차 공식 가격은 Phase B에서 지원`)
    }
    return results
  }

  try {
    const html = await fetchPage(url)
    if (!html) return results

    const trims = extractPricesFromHtml(html)

    if (trims.length > 0) {
      // 가격 순 정렬
      trims.sort((a, b) => a.price - b.price)
      const currentYear = new Date().getFullYear()

      results.push({
        brand: target.brand,
        model: target.model,
        year: currentYear,
        fuelType: target.fuelType || '가솔린',
        origin: target.origin,
        // 기본 트림 (최저가) = market_price, 전체 범위 = min~max
        marketPrice: trims[0].price,
        minPrice: trims[0].price,
        maxPrice: trims[trims.length - 1].price,
        sampleCount: trims.length,
        sourceSite: 'manufacturer',
        sourceUrl: url,
        trimName: trims[0].trim,
        note: `트림 ${trims.length}종: ${trims.map(t => `${t.trim}(${(t.price / 10000).toFixed(0)}만)`).join(', ')}`,
      })
    }
  } catch (err) {
    console.error(`[제조사크롤러] ${target.brand} ${target.model} 실패:`, err)
  }

  return results
}

export const manufacturerCrawler: CrawlerAdapter = {
  sourceSite: 'manufacturer',

  async crawl(targets: CrawlTarget[]): Promise<CrawlResult[]> {
    const allResults: CrawlResult[] = []
    // 제조사 사이트는 순차 요청 (부하 최소화)
    for (const target of targets) {
      const results = await crawlManufacturerForTarget(target)
      allResults.push(...results)
      // 1초 딜레이
      await new Promise(r => setTimeout(r, 1000))
    }
    return allResults
  },
}
