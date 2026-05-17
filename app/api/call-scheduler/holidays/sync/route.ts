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
        data: { inserted: 0, skipped: 0, replaced: 0, total: 0, year },
        error: null,
      })
    }

    // N-38 — 같은 날짜 + type='national' 기존 row 자동 대체
    //   사용자 보고: API 동기화 후 같은 날짜에 중복 휴일 row 발생
    //   ("설날 연휴" 수동 + "설날" API 동기화 둘 다 존재)
    //   결정: 「공식 공휴일 마스터 = API 데이터」 보장 — 같은 날짜 national 기존 row 삭제
    //   주의: type='company' (회사휴무) / 'etc' (기타) 는 보존 (운영자 명시 입력 데이터)
    const apiDates = Array.from(new Set(holidays.map(h => h.date)))
    let replaced = 0
    for (const date of apiDates) {
      try {
        const delResult = await prisma.$executeRaw`
          DELETE FROM cs_holidays
          WHERE holiday_date = ${date} AND type = 'national'
        `
        replaced += Number(delResult) || 0
      } catch { /* graceful */ }
    }

    // 새 INSERT (이제 같은 날짜에 national row 없으므로 IGNORE 불필요)
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
        if (Number(result) > 0) inserted++
        else skipped++
      } catch {
        skipped++
      }
    }

    return NextResponse.json({
      data: { inserted, skipped, replaced, total: holidays.length, year },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
