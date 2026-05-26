/**
 * /api/ride-vision/lotto-all-entries
 *
 * GET — 갓 어드민(role=admin) 전용 — 전 직원 로또 구매·당첨 내역 전체 조회.
 *   ride_lotto_entries × profiles(name) × ride_lotto_results(추첨 결과) JOIN.
 *   응답에 직원별 게임 + 회차별 결과 + 등수 계산까지 포함 (UI 가공 최소화).
 *
 * 인증: verifyUser + role === 'admin'
 * 데이터 정합성: 손익 추적용 — 일반 직원은 자기 기록도 못 봄(개인정보 노출 차단).
 *
 * RideVision 세션 — PR-VISION-18
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { rankOf, netOf } from '@/lib/lotto-rank'

const ALLOWED_ROLES = ['admin'] // 갓 어드민(슈퍼어드민) 전용

interface JoinedRow {
  id: string
  user_id: string
  user_name: string | null
  user_email: string | null
  user_department: string | null
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
  r_n1: number | null
  r_n2: number | null
  r_n3: number | null
  r_n4: number | null
  r_n5: number | null
  r_n6: number | null
  r_bonus: number | null
  r_draw_date: string | null
}

interface EntryDto {
  id: string
  draw_no: number
  numbers: number[]
  amount: number
  source: string
  created_at: string
  drawn: boolean
  rank: number      // -1 미추첨 | 0 낙첨 | 1~5 등수
  matches: number
  net: number | null
  draw_date: string | null
}

interface UserSummaryDto {
  user_id: string
  name: string
  email: string | null
  department: string | null
  total_games: number
  total_amount: number
  pending_count: number
  win_count: number        // 1~5등 합산
  miss_count: number       // 낙첨
  rank_counts: Record<number, number> // {1:0, 2:0, 3:0, 4:0, 5:0}
  loss_sum: number         // 낙첨 손실 합 (양수)
  net: number              // 4·5등 손익 합 (1~3등은 별도)
  top_wins: number         // 1~3등 합 (당첨금 별도 표기)
  rounds: number           // 구매 회차 수
  entries: EntryDto[]
}

function isMissingTable(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message || e)
  return /doesn't exist|Unknown table|no such table/i.test(msg)
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json(
      { success: false, data: [], error: 'unauthorized' },
      { status: 401 }
    )
  }

  const role = String((user as { role?: string }).role || '')
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, data: [], error: '갓 어드민(admin) 전용 — 권한 없음' },
      { status: 403 }
    )
  }

  try {
    // entries × profiles × results LEFT JOIN
    // profiles.name 은 NULL 가능 → '(이름 미설정)' fallback (UI 가공)
    // ride_lotto_results NULL = 미추첨 회차
    const rows = await prisma.$queryRaw<JoinedRow[]>`
      SELECT
        e.id, e.user_id, e.draw_no,
        e.n1, e.n2, e.n3, e.n4, e.n5, e.n6,
        e.amount, e.source,
        DATE_FORMAT(e.created_at, '%Y-%m-%d %H:%i') AS created_at,
        p.name  AS user_name,
        p.email AS user_email,
        p.department AS user_department,
        r.n1 AS r_n1, r.n2 AS r_n2, r.n3 AS r_n3,
        r.n4 AS r_n4, r.n5 AS r_n5, r.n6 AS r_n6,
        r.bonus AS r_bonus,
        DATE_FORMAT(r.draw_date, '%Y-%m-%d') AS r_draw_date
      FROM ride_lotto_entries e
      LEFT JOIN profiles p           ON p.id = e.user_id
      LEFT JOIN ride_lotto_results r ON r.draw_no = e.draw_no
      ORDER BY e.draw_no DESC, e.user_id, e.created_at ASC
    `

    // 사용자별 그룹핑 + 등수 계산
    const byUser = new Map<string, UserSummaryDto>()
    const drawSet = new Set<number>()
    for (const row of rows) {
      drawSet.add(row.draw_no)
      const nums = [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6]
      const drawn = row.r_n1 != null
      let rk = -1
      let matches = 0
      let net: number | null = null
      if (drawn) {
        const { rank, matches: m } = rankOf(nums, {
          n1: row.r_n1!, n2: row.r_n2!, n3: row.r_n3!,
          n4: row.r_n4!, n5: row.r_n5!, n6: row.r_n6!,
          bonus: row.r_bonus!,
        })
        rk = rank
        matches = m
        net = netOf(rank, true, row.amount)
      }
      const entry: EntryDto = {
        id: row.id,
        draw_no: row.draw_no,
        numbers: nums,
        amount: row.amount,
        source: row.source,
        created_at: row.created_at,
        drawn,
        rank: rk,
        matches,
        net,
        draw_date: row.r_draw_date,
      }

      const key = row.user_id
      let u = byUser.get(key)
      if (!u) {
        u = {
          user_id: key,
          name: row.user_name || '(이름 미설정)',
          email: row.user_email,
          department: row.user_department,
          total_games: 0,
          total_amount: 0,
          pending_count: 0,
          win_count: 0,
          miss_count: 0,
          rank_counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          loss_sum: 0,
          net: 0,
          top_wins: 0,
          rounds: 0,
          entries: [],
        }
        byUser.set(key, u)
      }

      u.entries.push(entry)
      u.total_games += 1
      u.total_amount += row.amount
      if (!drawn) {
        u.pending_count += 1
      } else if (rk === 0) {
        u.miss_count += 1
        u.loss_sum += row.amount
        u.net += -row.amount
      } else if (rk >= 1 && rk <= 5) {
        u.win_count += 1
        u.rank_counts[rk] = (u.rank_counts[rk] || 0) + 1
        if (rk >= 1 && rk <= 3) u.top_wins += 1
        if (net != null) u.net += net
      }
    }

    // rounds(구매 회차 수) 채우기
    for (const u of byUser.values()) {
      u.rounds = new Set(u.entries.map(e => e.draw_no)).size
    }

    // 사용자 정렬 — 총 게임 많은 순 → 이름순
    const users = [...byUser.values()].sort(
      (a, b) => b.total_games - a.total_games || a.name.localeCompare(b.name)
    )

    return NextResponse.json({
      success: true,
      data: users,
      meta: {
        user_count: users.length,
        total_entries: rows.length,
        draw_count: drawSet.size,
      },
    })
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: {
          _migration_pending: true,
          migration: 'migrations/2026-05-24_ride_vision_lotto.sql',
        },
      })
    }
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-vision/lotto-all-entries GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: [], error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
