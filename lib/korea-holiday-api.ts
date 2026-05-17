// ═══════════════════════════════════════════════════════════════════
// lib/korea-holiday-api.ts
//
//   N-22 — 한국천문연구원 특일 정보 API (data.go.kr)
//   대체공휴일 자동 채우기용 wrapper.
//
//   API 정보:
//   · Endpoint: https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService
//   · Operation: getRestDeInfo (국경일/공휴일)
//   · Response: XML
//   · 한도: 1일 10,000건 (개발계정 활용신청 시)
//
//   환경변수: KOREA_HOLIDAY_API_KEY
// ═══════════════════════════════════════════════════════════════════

export interface KoreaHoliday {
  date: string         // YYYY-MM-DD
  name: string         // 휴일 이름 (예: "설날", "대체공휴일(삼일절)")
  is_holiday: boolean  // true (응답이 'Y' 인 row 만 가져옴)
  is_substitute: boolean  // 대체공휴일 여부 — name 에 "대체공휴일" 포함
  date_kind: string    // 01 = 국경일 등
}

/**
 * XML 응답에서 item 들 추출 — 간단한 regex 파서.
 * 외부 라이브러리 없이 동작 (xml2js 등 install 불필요).
 */
function parseXmlItems(xml: string): Array<Record<string, string>> {
  const items: Array<Record<string, string>> = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null
  while ((match = itemRegex.exec(xml)) !== null) {
    const inner = match[1]
    const fields: Record<string, string> = {}
    const fieldRegex = /<(\w+)>([^<]*)<\/\1>/g
    let f: RegExpExecArray | null
    while ((f = fieldRegex.exec(inner)) !== null) {
      fields[f[1]] = f[2]
    }
    items.push(fields)
  }
  return items
}

/**
 * locdate (YYYYMMDD) → YYYY-MM-DD 변환
 */
function locdateToIso(locdate: string): string {
  const s = String(locdate || '').trim()
  if (!/^\d{8}$/.test(s)) return ''
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

/**
 * 한 해의 공휴일 + 대체공휴일 모두 조회.
 *
 * @param year — 4자리 연도 (예: 2026)
 * @returns 휴일 list (대체공휴일 포함, isHoliday=Y 인 row 만)
 *
 * 정책 (사용자 보고 「자동 휴일 적용 api 오류」 2026-05-17 응답):
 *   - API 키 있으면 공공데이터 API 우선 사용
 *   - API 키 없거나 API 호출 실패 시 → 하드코딩 fallback 사용 (502 회피)
 *   - fallback 데이터: 양력 고정 공휴일 8개 + 2025/2026 음력 + 대체공휴일
 *
 * @throws Error — fallback 데이터도 없는 연도 + API 실패 시
 */
export async function getKoreaHolidays(year: number): Promise<KoreaHoliday[]> {
  const apiKey = process.env.KOREA_HOLIDAY_API_KEY

  // API 키 없으면 즉시 fallback (502 회피)
  if (!apiKey) {
    const fb = getFallbackHolidays(year)
    if (fb.length === 0) {
      throw new Error(`KOREA_HOLIDAY_API_KEY 환경변수 미설정 + ${year}년 fallback 데이터 없음 (지원: 2025-2027)`)
    }
    return fb
  }
  if (!Number.isInteger(year) || year < 2010 || year > 2099) {
    throw new Error(`연도 범위 오류: ${year} (2010~2099)`)
  }

  const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo`
    + `?serviceKey=${encodeURIComponent(apiKey)}`
    + `&solYear=${year}`
    + `&numOfRows=100`

  // 외부 API 호출 — 실패 시 fallback 으로 graceful 처리
  let xml = ''
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
    })
    if (!res.ok) {
      const fb = getFallbackHolidays(year)
      if (fb.length > 0) return fb
      throw new Error(`공공데이터 API HTTP ${res.status}: ${await res.text().catch(() => '')}`)
    }
    xml = await res.text()
  } catch (e: any) {
    // network 에러 등도 fallback
    const fb = getFallbackHolidays(year)
    if (fb.length > 0) return fb
    throw e
  }

  // resultCode 검증 — 실패 시 fallback
  const resultCodeMatch = xml.match(/<resultCode>(\w+)<\/resultCode>/)
  const resultCode = resultCodeMatch?.[1] || ''
  if (resultCode && resultCode !== '00') {
    const fb = getFallbackHolidays(year)
    if (fb.length > 0) return fb
    const msgMatch = xml.match(/<resultMsg>([^<]+)<\/resultMsg>/)
    throw new Error(`공공데이터 API resultCode=${resultCode}: ${msgMatch?.[1] || '응답 오류'}`)
  }

  const items = parseXmlItems(xml)
  const result: KoreaHoliday[] = []
  for (const it of items) {
    if (it.isHoliday !== 'Y') continue  // 휴일만
    const iso = locdateToIso(it.locdate)
    if (!iso) continue
    const name = String(it.dateName || '').trim()
    result.push({
      date: iso,
      name,
      is_holiday: true,
      is_substitute: name.includes('대체공휴일'),
      date_kind: String(it.dateKind || '01'),
    })
  }
  // 날짜 + 이름 dedupe (seq=2 같이 중복 row 처리)
  const seen = new Set<string>()
  const dedupe: KoreaHoliday[] = []
  for (const h of result) {
    const key = `${h.date}_${h.name}`
    if (seen.has(key)) continue
    seen.add(key)
    dedupe.push(h)
  }
  // 날짜 오름차순
  dedupe.sort((a, b) => a.date.localeCompare(b.date))
  return dedupe
}

// ═══════════════════════════════════════════════════════════════════
// 하드코딩 fallback — 환경변수 미설정 또는 외부 API 실패 시 사용
//
// 데이터 출처: 한국천문연구원 + 공공데이터포털 발표 자료
// 정확성: 양력 고정 공휴일 100% / 음력 + 대체공휴일은 발표 기준
//         2025/2026 만 검증. 2027 이상은 추후 추가 또는 API 사용 권장.
// ═══════════════════════════════════════════════════════════════════
function getFallbackHolidays(year: number): KoreaHoliday[] {
  const fixedHolidays = [
    { md: '01-01', name: '신정' },
    { md: '03-01', name: '3·1절' },
    { md: '05-05', name: '어린이날' },
    { md: '06-06', name: '현충일' },
    { md: '08-15', name: '광복절' },
    { md: '10-03', name: '개천절' },
    { md: '10-09', name: '한글날' },
    { md: '12-25', name: '기독탄신일' },
  ]

  // 양력 고정 공휴일 (매년 동일)
  const result: KoreaHoliday[] = fixedHolidays.map(h => ({
    date: `${year}-${h.md}`,
    name: h.name,
    is_holiday: true,
    is_substitute: false,
    date_kind: '01',
  }))

  // 음력 기반 공휴일 + 대체공휴일 (연도별 발표)
  const lunarTable: Record<number, Array<{ date: string; name: string; is_substitute?: boolean }>> = {
    2025: [
      // 설날 연휴 (양력 1/28~1/30)
      { date: '2025-01-28', name: '설날' },
      { date: '2025-01-29', name: '설날' },
      { date: '2025-01-30', name: '설날' },
      // 부처님오신날 (양력 5/5 — 어린이날과 겹침) → 대체공휴일 5/6
      { date: '2025-05-05', name: '부처님오신날' },
      { date: '2025-05-06', name: '대체공휴일(부처님오신날/어린이날)', is_substitute: true },
      // 추석 연휴 (양력 10/5~10/7) + 10/8 대체
      { date: '2025-10-05', name: '추석' },
      { date: '2025-10-06', name: '추석' },
      { date: '2025-10-07', name: '추석' },
      { date: '2025-10-08', name: '대체공휴일(추석)', is_substitute: true },
    ],
    2026: [
      // 설날 연휴 (양력 2/16~2/18) — 설날 2/17 화
      { date: '2026-02-16', name: '설날' },
      { date: '2026-02-17', name: '설날' },
      { date: '2026-02-18', name: '설날' },
      // 3·1절 일요일 → 대체공휴일 3/2 (월)
      { date: '2026-03-02', name: '대체공휴일(3·1절)', is_substitute: true },
      // 부처님오신날 (양력 5/24 일) → 대체공휴일 5/25 (월)
      { date: '2026-05-24', name: '부처님오신날' },
      { date: '2026-05-25', name: '대체공휴일(부처님오신날)', is_substitute: true },
      // 추석 연휴 (양력 9/24~9/26) — 추석 9/25 금
      { date: '2026-09-24', name: '추석' },
      { date: '2026-09-25', name: '추석' },
      { date: '2026-09-26', name: '추석' },
    ],
  }

  const lunarForYear = lunarTable[year] || []
  for (const h of lunarForYear) {
    result.push({
      date: h.date,
      name: h.name,
      is_holiday: true,
      is_substitute: Boolean(h.is_substitute),
      date_kind: '01',
    })
  }

  // 양력 공휴일 + 대체공휴일 (양력 고정인 3·1절/어린이날 등이 주말이면 대체)
  // 2025/2026 만 발표 기준 적용. 위 lunarTable 에 포함된 대체공휴일은 중복 안 됨.

  // 날짜 오름차순 + dedupe
  const seen = new Set<string>()
  const dedupe: KoreaHoliday[] = []
  for (const h of result.sort((a, b) => a.date.localeCompare(b.date))) {
    const key = `${h.date}_${h.name}`
    if (seen.has(key)) continue
    seen.add(key)
    dedupe.push(h)
  }
  return dedupe
}
