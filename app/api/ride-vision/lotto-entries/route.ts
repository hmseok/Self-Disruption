/**
 * /api/ride-vision/lotto-entries
 *
 * GET  — 로그인 사용자 본인 구매 게임 목록
 * POST — 구매 게임 기록 (1~N 게임 일괄, body: { draw_no, games: number[][] })
 *
 * 인증: verifyUser. 데이터는 user_id 로 본인 것만 조회/생성.
 * RideVision 세션 — PR-VISION-2b
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

interface EntryRow {
  id: string
  draw_no: number
  n1: number
  n2: number
  n3: number
  n4: number
  n5: number
  n6: number
  amount: number
  source: string
  created_at: string
}

const ENTRY_AMOUNT = 1000 // 로또 1게임 = 1,000원
const MAX_GAMES = 5 // 1회 등록 상한 (1 슬립 = 5게임)
const MAX_PER_ROUND = 5 // 회차당 최대 게임 수 (현실 로또 1매 = A~E 5게임)

function isMissingTable(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e)
  return /doesn't exist|Unknown table|no such table/i.test(msg)
}

// 게임 유효성: 1~45 중복 없는 6개 → 오름차순 반환, 아니면 null
function validGame(g: unknown): number[] | null {
  if (!Array.isArray(g) || g.length !== 6) return null
  const nums = g.map(x => Number(x))
  if (nums.some(n => !Number.isInteger(n) || n < 1 || n > 45)) return null
  if (new Set(nums).size !== 6) return null
  return [...nums].sort((a, b) => a - b)
}

// ─── GET — 내 구매 기록 ─────────────────────────────────────────────
export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })
  }

  try {
    const rows = await prisma.$queryRaw<EntryRow[]>`
      SELECT id, draw_no, n1, n2, n3, n4, n5, n6, amount, source,
             DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
        FROM ride_lotto_entries
       WHERE user_id = ${user.id}
       ORDER BY draw_no DESC, created_at DESC
    `
    return NextResponse.json({ success: true, data: rows, meta: { count: rows.length } })
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { _migration_pending: true, migration: 'migrations/2026-05-24_ride_vision_lotto.sql' },
      })
    }
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-vision/lotto-entries GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: [], error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

// ─── POST — 구매 게임 기록 ──────────────────────────────────────────
export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const drawNo = parseInt(String(body.draw_no ?? ''), 10)
  if (!Number.isInteger(drawNo) || drawNo < 1) {
    return NextResponse.json({ success: false, error: '회차(draw_no) 필요 (양의 정수)' }, { status: 400 })
  }

  const rawGames = Array.isArray(body.games) ? body.games : []
  if (rawGames.length === 0) {
    return NextResponse.json({ success: false, error: '게임 1개 이상 필요' }, { status: 400 })
  }
  if (rawGames.length > MAX_GAMES) {
    return NextResponse.json(
      { success: false, error: `한 번에 최대 ${MAX_GAMES}게임` },
      { status: 400 }
    )
  }

  const games: number[][] = []
  for (const g of rawGames) {
    const v = validGame(g)
    if (!v) {
      return NextResponse.json(
        { success: false, error: '게임은 1~45 중복 없는 6개 숫자여야 합니다' },
        { status: 400 }
      )
    }
    games.push(v)
  }

  try {
    // 회차당 최대 5게임 제한 (이미 기록된 게임 수 + 신규 ≤ 5)
    const cntRows = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) AS cnt FROM ride_lotto_entries
       WHERE user_id = ${user.id} AND draw_no = ${drawNo}
    `
    const existing = Number(cntRows[0]?.cnt || 0)
    if (existing + games.length > MAX_PER_ROUND) {
      return NextResponse.json(
        {
          success: false,
          error: `회차당 최대 ${MAX_PER_ROUND}게임 — ${drawNo}회차에 이미 ${existing}게임 기록됨`,
          existing,
        },
        { status: 400 }
      )
    }

    const ids: string[] = []
    for (const g of games) {
      const id = randomUUID()
      await prisma.$executeRaw`
        INSERT INTO ride_lotto_entries
          (id, user_id, draw_no, n1, n2, n3, n4, n5, n6, amount, source)
        VALUES
          (${id}, ${user.id}, ${drawNo},
           ${g[0]}, ${g[1]}, ${g[2]}, ${g[3]}, ${g[4]}, ${g[5]},
           ${ENTRY_AMOUNT}, 'extractor')
      `
      ids.push(id)
    }
    return NextResponse.json({ success: true, count: ids.length, ids, draw_no: drawNo })
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json(
        {
          success: false,
          error: 'migration 미적용 — migrations/2026-05-24_ride_vision_lotto.sql 실행 필요',
        },
        { status: 503 }
      )
    }
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-vision/lotto-entries POST]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
