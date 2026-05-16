// ═══════════════════════════════════════════════════════════════════
// POST /api/call-scheduler/holidays/sync?year=YYYY
//
//   N-22 — 공공데이터 API 에서 해당 연도 공휴일 + 대체공휴일 가져와
//   cs_holidays 에 멱등 INSERT (INSERT IGNORE — 이미 있는 (date, name) 은 skip).
//
//   응답: { data: { inserted, skipped, total }, error: null }
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { getKoreaHolidays } from '@/lib/korea-holiday-api'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const url = new URL(request.url)
    const yearStr = url.searchParams.get('year') || ''
    const year = parseInt(yearStr, 10)
    if (!Number.isInteger(year) || year < 2010 || year > 2099) {
      return NextResponse.json({ error: '연도 파라미터 필수 (?year=YYYY, 2010~2099)' }, { status: 400 })
    }

    // 외부 API 호출 (Rule 13 — 외부 시스템 호환성)
    let holidays
    try {
      holidays = await getKoreaHolidays(year)
    } catch (e: any) {
      return NextResponse.json({
        error: `공공데이터 API 오류: ${e?.message || String(e)}`,
      }, { status: 502 })
    }

    if (holidays.length === 0) {
      return NextResponse.json({
        data: { inserted: 0, skipped: 0, total: 0, year },
        error: null,
      })
    }

    // 멱등 INSERT (UNIQUE KEY uq_cs_holiday_date_name 활용 — INSERT IGNORE)
    let inserted = 0
    let skipped = 0
    for (const h of holidays) {
      try {
        const id = crypto.randomUUID()
        // type='national' (공휴일), exclude_auto=1 (자동 생성 제외), is_paid=1, color_tone='red'
        const result = await prisma.$executeRaw`
          INSERT IGNORE INTO cs_holidays
            (id, holiday_date, name, type, is_paid, exclude_auto, color_tone, memo, created_at, updated_at)
          VALUES
            (${id}, ${h.date}, ${h.name}, 'national', 1, 1, 'red',
             ${'공공데이터 API 자동 동기화'}, NOW(), NOW())
        `
        // executeRaw 의 result = affected rows. 1 = INSERT, 0 = IGNORE (이미 있음)
        if (Number(result) > 0) inserted++
        else skipped++
      } catch {
        skipped++
      }
    }

    return NextResponse.json({
      data: { inserted, skipped, total: holidays.length, year },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
