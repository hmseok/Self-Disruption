import { NextRequest, NextResponse } from 'next/server'
import { runCrawl } from '@/lib/crawlers'

/**
 * GET /api/cron/crawl-prices
 *
 * 주간 배치 크롤링 — cron 스케줄러 또는 Cloud Scheduler에서 호출
 *
 * 보안: CRON_SECRET 헤더 검증 (환경변수 CRON_SECRET과 대조)
 *
 * 사용법 (Cloud Scheduler):
 *   URL: https://hmseok.com/api/cron/crawl-prices
 *   Method: GET
 *   Headers: { "x-cron-secret": "<CRON_SECRET>" }
 *   Schedule: 0 3 * * 1  (매주 월요일 새벽 3시)
 */
export async function GET(request: NextRequest) {
  try {
    // 보안 검증 — CRON_SECRET 미설정 시 접근 거부 (안전 우선)
    const cronSecret = process.env.CRON_SECRET
    const headerSecret = request.headers.get('x-cron-secret')

    if (!cronSecret || headerSecret !== cronSecret) {
      return NextResponse.json({ error: '인증 실패 — CRON_SECRET 필요' }, { status: 403 })
    }

    // 전체 소스 크롤링
    const summary = await runCrawl({
      sources: ['all'],
      triggeredBy: 'cron',
    })

    return NextResponse.json({
      ok: true,
      summary: {
        totalResults: summary.totalResults,
        upsertCount: summary.upsertCount,
        errorCount: summary.errors.length,
        logs: summary.logs.map(l => ({
          source: l.sourceSite,
          success: l.successCount,
          fail: l.failCount,
          duration: `${(l.durationMs / 1000).toFixed(1)}s`,
        })),
      },
    })
  } catch (e: any) {
    console.error('[Cron 크롤링 에러]', e)
    return NextResponse.json({ error: e.message || '크롤링 실패' }, { status: 500 })
  }
}
