/**
 * 크롤러 오케스트레이터 — Phase A (2026-04-23)
 *
 * 3개 소스 (KB차차차 / 엔카 / 제조사)를 병렬 실행하고
 * 결과를 vehicle_market_price 테이블에 UPSERT + crawl_log 기록.
 *
 * 사용처:
 *   - POST /api/crawl/market-prices (수동 트리거)
 *   - GET  /api/cron/crawl-prices   (주간 배치)
 */

import { prisma } from '@/lib/prisma'
import { kbChachaCrawler } from './kb-chacha'
import { encarCrawler } from './encar'
import { manufacturerCrawler } from './manufacturer'
import type { CrawlTarget, CrawlResult, CrawlLogEntry, CrawlerAdapter } from './types'
import { POPULAR_TARGETS } from './types'

// ── 소스 → 크롤러 매핑 ──
const CRAWLERS: Record<string, CrawlerAdapter> = {
  kb_chacha: kbChachaCrawler,
  encar: encarCrawler,
  manufacturer: manufacturerCrawler,
}

export type CrawlSource = 'kb_chacha' | 'encar' | 'manufacturer' | 'all'

export interface CrawlOptions {
  sources?: CrawlSource[]      // 기본값: ['all']
  targets?: CrawlTarget[]      // 기본값: POPULAR_TARGETS
  triggeredBy?: 'manual' | 'cron'
  onProgress?: (msg: string) => void
}

export interface CrawlSummary {
  totalResults: number
  upsertCount: number
  logs: CrawlLogEntry[]
  errors: string[]
}

/**
 * vehicle_market_price에 UPSERT
 * 복합키: brand + model + year + fuel_type + source_site
 */
async function upsertMarketPrice(result: CrawlResult): Promise<boolean> {
  try {
    // 기존 데이터 확인
    const existing = await prisma.$queryRaw<any[]>`
      SELECT id FROM vehicle_market_price
      WHERE brand = ${result.brand}
        AND model = ${result.model}
        AND year = ${result.year}
        AND source_site = ${result.sourceSite}
      LIMIT 1
    `

    if (existing.length > 0) {
      // UPDATE
      await prisma.$executeRaw`
        UPDATE vehicle_market_price
        SET market_price = ${result.marketPrice},
            min_price = ${result.minPrice ?? result.marketPrice},
            max_price = ${result.maxPrice ?? result.marketPrice},
            sample_count = ${result.sampleCount},
            source_url = ${result.sourceUrl ?? null},
            trim_name = ${result.trimName ?? null},
            note = ${result.note ?? null},
            crawled_at = NOW(),
            is_active = 1
        WHERE id = ${Number(existing[0].id)}
      `
    } else {
      // INSERT
      await prisma.$executeRaw`
        INSERT INTO vehicle_market_price
          (brand, model, trim_name, year, fuel_type, origin, vehicle_class,
           mileage_km, market_price, min_price, max_price, sample_count,
           source_site, source_url, crawled_at, is_active, note)
        VALUES
          (${result.brand}, ${result.model}, ${result.trimName ?? null},
           ${result.year}, ${result.fuelType}, ${result.origin}, ${result.vehicleClass ?? null},
           ${result.mileageKm ?? 0}, ${result.marketPrice},
           ${result.minPrice ?? result.marketPrice}, ${result.maxPrice ?? result.marketPrice},
           ${result.sampleCount}, ${result.sourceSite}, ${result.sourceUrl ?? null},
           NOW(), 1, ${result.note ?? null})
      `
    }
    return true
  } catch (err) {
    console.error(`[UPSERT 실패] ${result.brand} ${result.model} ${result.year}:`, err)
    return false
  }
}

/**
 * crawl_log 테이블에 실행 결과 기록
 */
async function writeCrawlLog(entry: CrawlLogEntry): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO crawl_log
        (source_site, total_targets, success_count, fail_count,
         duration_ms, error_summary, triggered_by, created_at)
      VALUES
        (${entry.sourceSite}, ${entry.totalTargets}, ${entry.successCount},
         ${entry.failCount}, ${entry.durationMs},
         ${entry.errorSummary ?? null}, ${entry.triggeredBy}, NOW())
    `
  } catch (err) {
    console.error('[crawl_log 기록 실패]', err)
  }
}

/**
 * DB에서 crawl_targets 테이블 조회 (있으면 사용, 없으면 POPULAR_TARGETS 폴백)
 */
async function loadTargetsFromDb(): Promise<CrawlTarget[]> {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT brand, model, year_from, year_to, fuel_type, origin, manufacturer_url, is_active
      FROM crawl_targets
      WHERE is_active = 1
      ORDER BY brand, model
    `
    if (rows.length > 0) {
      return rows.map(r => ({
        brand: r.brand,
        model: r.model,
        yearFrom: Number(r.year_from),
        yearTo: Number(r.year_to),
        fuelType: r.fuel_type || undefined,
        origin: r.origin || '국산',
        manufacturerUrl: r.manufacturer_url || undefined,
        isActive: !!r.is_active,
      }))
    }
  } catch {
    // 테이블 미존재 시 폴백
  }
  return POPULAR_TARGETS
}

/**
 * 메인 크롤링 실행 함수
 */
export async function runCrawl(options: CrawlOptions = {}): Promise<CrawlSummary> {
  const {
    sources = ['all'],
    triggeredBy = 'manual',
    onProgress,
  } = options

  // 타겟 로드
  const targets = options.targets || await loadTargetsFromDb()
  onProgress?.(`크롤링 대상 ${targets.length}개 차종 로드 완료`)

  // 실행할 소스 결정
  const activeSources = sources.includes('all')
    ? Object.keys(CRAWLERS)
    : sources.filter(s => s !== 'all')

  const summary: CrawlSummary = {
    totalResults: 0,
    upsertCount: 0,
    logs: [],
    errors: [],
  }

  // 소스별 크롤링 실행 (병렬)
  const crawlPromises = activeSources.map(async (sourceName) => {
    const crawler = CRAWLERS[sourceName]
    if (!crawler) {
      summary.errors.push(`알 수 없는 소스: ${sourceName}`)
      return
    }

    onProgress?.(`[${sourceName}] 크롤링 시작...`)
    const startTime = Date.now()
    let results: CrawlResult[] = []
    let errorMsg = ''

    try {
      results = await crawler.crawl(targets)
      onProgress?.(`[${sourceName}] ${results.length}건 수집 완료`)
    } catch (err: any) {
      errorMsg = err?.message || String(err)
      summary.errors.push(`[${sourceName}] ${errorMsg}`)
      onProgress?.(`[${sourceName}] 크롤링 실패: ${errorMsg}`)
    }

    // UPSERT
    let successCount = 0
    for (const result of results) {
      const ok = await upsertMarketPrice(result)
      if (ok) successCount++
    }

    const durationMs = Date.now() - startTime

    // 로그 기록
    const logEntry: CrawlLogEntry = {
      sourceSite: sourceName,
      totalTargets: targets.length,
      successCount,
      failCount: results.length - successCount,
      durationMs,
      errorSummary: errorMsg || undefined,
      triggeredBy,
    }
    await writeCrawlLog(logEntry)
    summary.logs.push(logEntry)
    summary.totalResults += results.length
    summary.upsertCount += successCount

    onProgress?.(`[${sourceName}] 완료 — ${successCount}건 저장 (${(durationMs / 1000).toFixed(1)}초)`)
  })

  await Promise.allSettled(crawlPromises)

  onProgress?.(`전체 완료: ${summary.upsertCount}건 저장, 에러 ${summary.errors.length}건`)
  return summary
}
