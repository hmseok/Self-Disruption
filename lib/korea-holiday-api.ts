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
 * @throws Error — API 키 누락 또는 응답 에러
 */
export async function getKoreaHolidays(year: number): Promise<KoreaHoliday[]> {
  const apiKey = process.env.KOREA_HOLIDAY_API_KEY
  if (!apiKey) {
    throw new Error('KOREA_HOLIDAY_API_KEY 환경변수가 설정되지 않았습니다')
  }
  if (!Number.isInteger(year) || year < 2010 || year > 2099) {
    throw new Error(`연도 범위 오류: ${year} (2010~2099)`)
  }

  const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo`
    + `?serviceKey=${encodeURIComponent(apiKey)}`
    + `&solYear=${year}`
    + `&numOfRows=100`

  const res = await fetch(url, {
    method: 'GET',
    // Next.js 의 fetch — 캐싱 비활성화 (DB sync 액션이라 매번 fresh)
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`공공데이터 API HTTP ${res.status}: ${await res.text().catch(() => '')}`)
  }

  const xml = await res.text()

  // resultCode 검증
  const resultCodeMatch = xml.match(/<resultCode>(\w+)<\/resultCode>/)
  const resultCode = resultCodeMatch?.[1] || ''
  if (resultCode && resultCode !== '00') {
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
