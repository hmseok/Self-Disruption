import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { runCrawl, type CrawlSource } from '@/lib/crawlers'

// 크롤링 쿨다운: 최소 5분 간격
const CRAWL_COOLDOWN_MS = 5 * 60 * 1000

/**
 * POST /api/crawl/market-prices
 *
 * 수동 트리거 — MarketPriceTab "시세 갱신" 버튼에서 호출
 * 관리자만 실행 가능 + 5분 쿨다운
 *
 * Body:
 *   sources?: ('kb_chacha' | 'encar' | 'manufacturer' | 'all')[]
 *     기본값: ['all']
 *
 * Response:
 *   { ok: true, summary: CrawlSummary }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request) as any
    if (!user) {
      return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    }

    // 관리자 권한 확인 (role=admin 또는 is_admin=1)
    if (user.role !== 'admin' && !user.is_admin) {
      return NextResponse.json({ error: '관리자만 시세 갱신이 가능합니다' }, { status: 403 })
    }

    // 쿨다운 체크 — 최근 5분 이내 실행 이력 확인
    try {
      const recentLogs = await prisma.$queryRaw<any[]>`
        SELECT id, created_at FROM crawl_log
        WHERE created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
        LIMIT 1
      `
      if (recentLogs.length > 0) {
        return NextResponse.json({
          error: '최근 5분 이내에 크롤링이 실행되었습니다. 잠시 후 다시 시도해주세요.',
        }, { status: 429 })
      }
    } catch {
      // crawl_log 테이블 미존재 시 스킵 (첫 실행)
    }

    const body = await request.json().catch(() => ({}))
    const sources: CrawlSource[] = body.sources || ['all']

    // 유효 소스 검증
    const validSources = new Set(['kb_chacha', 'encar', 'manufacturer', 'all'])
    const filteredSources = sources.filter(s => validSources.has(s))
    if (filteredSources.length === 0) {
      return NextResponse.json({ error: '유효한 소스를 지정하세요 (kb_chacha, encar, manufacturer, all)' }, { status: 400 })
    }

    const summary = await runCrawl({
      sources: filteredSources,
      triggeredBy: 'manual',
    })

    return NextResponse.json({
      ok: true,
      summary: {
        totalResults: summary.totalResults,
        upsertCount: summary.upsertCount,
        errors: summary.errors,
        logs: summary.logs.map(l => ({
          source: l.sourceSite,
          success: l.successCount,
          fail: l.failCount,
          duration: `${(l.durationMs / 1000).toFixed(1)}s`,
        })),
      },
    })
  } catch (e: any) {
    console.error('[크롤링 API 에러]', e)
    return NextResponse.json({ error: e.message || '크롤링 실패' }, { status: 500 })
  }
}

/**
 * GET /api/crawl/market-prices — 최근 크롤링 로그 조회
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) {
      return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    }

    // 최근 20건
    let logs: any[] = []
    try {
      logs = await prisma.$queryRaw<any[]>`
        SELECT id, source_site, total_targets, success_count, fail_count,
               duration_ms, error_summary, triggered_by, created_at
        FROM crawl_log
        ORDER BY created_at DESC
        LIMIT 20
      `
    } catch {
      // crawl_log 테이블 미존재 시 빈 배열
    }

    return NextResponse.json({
      data: JSON.parse(JSON.stringify(logs, (_, v) => typeof v === 'bigint' ? v.toString() : v)),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
