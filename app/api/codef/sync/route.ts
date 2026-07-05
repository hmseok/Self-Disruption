import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'
import { isCronAuthorized, cronForwardHeaders } from '@/lib/cron-auth'

// ============================================================
// Codef 동기화 API (Prisma)
// POST: 모든 연동 계좌/카드 일괄 동기화
// GET: 싱크 로그 조회
// ============================================================

export async function POST(req: NextRequest) {
  try {
    // PR-PAY-CRON — 사용자 토큰 또는 X-Cron-Secret (Cloud Scheduler 주기 동기화)
    const isCron = isCronAuthorized(req)
    const user = isCron ? null : await verifyUser(req)
    if (!user && !isCron) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    // cron 호출 시 날짜 미지정 → 최근 3일 (지연 입금 커버)
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')
    const today = new Date()
    const threeDaysAgo = new Date(today.getTime() - 3 * 86400000)
    const startDate = body.startDate || fmt(threeDaysAgo)
    const endDate = body.endDate || fmt(today)

    // 연동된 모든 계좌 조회
    const connections = await prisma.codefConnection.findMany({
      where: { is_active: true },
    })

    const summary = {
      totalBankFetched: 0,
      totalBankInserted: 0,
      totalCardFetched: 0,
      totalCardInserted: 0,
      errors: [] as string[],
    }

    const bankConnections = connections.filter(c => c.org_type === 'bank')
    for (const connection of bankConnections) {
      try {
        const res = await fetch(
          new URL('/api/codef/bank', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // PR-PAY-CRON — 인증 전달 (사용자 토큰 또는 cron 시크릿)
              ...(req.headers.get('authorization') ? { Authorization: req.headers.get('authorization')! } : {}),
              ...cronForwardHeaders(req),
            },
            body: JSON.stringify({
              connectedId: connection.connected_id,
              orgCode: connection.org_code,
              account: connection.account_number,
              startDate,
              endDate,
            }),
          }
        )
        const result = await res.json()
        if (result.success) {
          summary.totalBankFetched += result.fetched
          summary.totalBankInserted += result.inserted
        } else {
          summary.errors.push(`Bank ${connection.org_name}: ${result.error}`)
        }
      } catch (error) {
        summary.errors.push(`Bank ${connection.org_name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    const cardConnections = connections.filter(c => c.org_type === 'card')
    for (const connection of cardConnections) {
      try {
        const res = await fetch(
          new URL('/api/codef/card', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              connectedId: connection.connected_id,
              orgCode: connection.org_code,
              startDate,
              endDate,
            }),
          }
        )
        const result = await res.json()
        if (result.success) {
          summary.totalCardFetched += result.fetched
          summary.totalCardInserted += result.inserted
        } else {
          summary.errors.push(`Card ${connection.org_name}: ${result.error}`)
        }
      } catch (error) {
        summary.errors.push(`Card ${connection.org_name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        banks: { fetched: summary.totalBankFetched, inserted: summary.totalBankInserted },
        cards: { fetched: summary.totalCardFetched, inserted: summary.totalCardInserted },
        errors: summary.errors,
      },
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET: 싱크 로그 조회
export async function GET(req: NextRequest) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20')

    const logs = await prisma.codefSyncLog.findMany({
      orderBy: { synced_at: 'desc' },
      take: limit,
    })

    return NextResponse.json({ logs }, { status: 200 })
  } catch (error) {
    console.error('Sync logs fetch error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
