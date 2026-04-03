import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ============================================================
// Codef 동기화 API (Prisma)
// POST: 모든 연동 계좌/카드 일괄 동기화
// GET: 싱크 로그 조회
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const { startDate, endDate } = await req.json()

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

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
            headers: { 'Content-Type': 'application/json' },
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
