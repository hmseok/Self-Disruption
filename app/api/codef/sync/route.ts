import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const { startDate, endDate } = await req.json()

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // Fetch all connected accounts
    const { data: connections, error: connError } = await getSupabase()
      .from('codef_connections')
      .select('*')
      .eq('is_active', true)

    if (connError) {
      return NextResponse.json({ error: connError.message }, { status: 500 })
    }

    const summary = {
      totalBankFetched: 0,
      totalBankInserted: 0,
      totalCardFetched: 0,
      totalCardInserted: 0,
      errors: [] as string[],
    }

    // Sync bank accounts
    const bankConnections = connections?.filter((c) => c.org_type === 'bank') || []
    for (const connection of bankConnections) {
      try {
        const res = await fetch(new URL('/api/codef/bank', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectedId: connection.connected_id,
            orgCode: connection.org_code,
            account: connection.account_number,
            startDate,
            endDate,
          }),
        })

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

    // Sync card accounts
    const cardConnections = connections?.filter((c) => c.org_type === 'card') || []
    for (const connection of cardConnections) {
      try {
        const res = await fetch(new URL('/api/codef/card', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectedId: connection.connected_id,
            orgCode: connection.org_code,
            startDate,
            endDate,
          }),
        })

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

    return NextResponse.json(
      {
        success: true,
        summary: {
          banks: {
            fetched: summary.totalBankFetched,
            inserted: summary.totalBankInserted,
          },
          cards: {
            fetched: summary.totalCardFetched,
            inserted: summary.totalCardInserted,
          },
          errors: summary.errors,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}

// GET: Fetch sync logs
export async function GET(req: NextRequest) {
  try {
    const limit = req.nextUrl.searchParams.get('limit') || '20'

    const { data, error } = await getSupabase()
      .from('codef_sync_logs')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(parseInt(limit))

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ logs: data }, { status: 200 })
  } catch (error) {
    console.error('Sync logs fetch error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
