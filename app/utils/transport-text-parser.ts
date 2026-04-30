// ═══════════════════════════════════════════════════════════════════
// 탁송 요청 텍스트 paste → 구조화 파서
//
// 지원 양식:
//   양식 1: ★/* 패턴 (라이드탁송 표준 양식)
//   양식 2: 키워드 자유 형식 (출발지/도착지/경유지/연락처/차량 키워드 인식)
//   양식 3: 단순 화살표 (A → B / 010-... / 차량번호)
//
// 매칭 실패 라인은 unmatched_lines 에 보존 → notes 에 자동 추가 (사용자 검토 가능)
// ═══════════════════════════════════════════════════════════════════

export type ParsedStop = {
  stop_order: number
  stop_type: 'departure' | 'waypoint' | 'destination'
  location_name?: string
  address?: string
  contact_name?: string
  contact_phone?: string
  car_pickup_external?: string  // 차량번호 텍스트 (이후 cars 테이블 매칭은 호출자가)
  car_dropoff_external?: string
  notes?: string
}

export type ParsedRequest = {
  service_type: 'accident_repair' | 'dispatch' | 'return' | 'maint_in' | 'maint_out' | 'sale' | 'general'
  trip_type: 'one_way' | 'round_trip'
  route_summary?: string
  photo_required: boolean
  photo_target_phone?: string
  notes?: string
  stops: ParsedStop[]
  unmatched_lines: string[]
  confidence: 'high' | 'medium' | 'low'  // 매칭 품질
}

// ─── 헬퍼 ────────────────────────────────────────────────────────

const PHONE_RE = /(\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4})/
const CAR_NUMBER_RE = /(\d{2,3}[가-힣]\s?\d{4}|\d{2,3}[호하]\s?\d{4})/

function normalizePhone(s: string): string {
  return s.replace(/\s+/g, '').replace(/-+/g, '-')
}

function extractPhone(line: string): string | undefined {
  const m = line.match(PHONE_RE)
  return m ? normalizePhone(m[1]) : undefined
}

function extractCarNumber(line: string): string | undefined {
  const m = line.match(CAR_NUMBER_RE)
  return m ? m[1].replace(/\s+/g, '') : undefined
}

// "라이드탁송(사고수리/편도/경유지 1)" → 분류 추출
function parseHeader(text: string): { service_type?: ParsedRequest['service_type']; trip_type?: ParsedRequest['trip_type']; waypoint_count?: number } {
  const m = text.match(/[가-힣]*탁송\s*\(([^)]+)\)/) || text.match(/^([^\n]+)\(([^)]+)\)/)
  if (!m) return {}
  const inner = m[m.length - 1]
  const parts = inner.split(/[\/,]/).map(p => p.trim())
  const out: ReturnType<typeof parseHeader> = {}

  for (const p of parts) {
    // service_type
    if (/사고수리|사고|수리/.test(p)) out.service_type = 'accident_repair'
    else if (/배차|배달|delivery/.test(p)) out.service_type = 'dispatch'
    else if (/회수|반납/.test(p)) out.service_type = 'return'
    else if (/정비.*입고|입고/.test(p)) out.service_type = 'maint_in'
    else if (/정비.*출고|출고/.test(p)) out.service_type = 'maint_out'
    else if (/매매|판매|sale/.test(p)) out.service_type = 'sale'

    // trip_type
    if (/편도|one[-\s]?way/i.test(p)) out.trip_type = 'one_way'
    else if (/왕복|round[-\s]?trip/i.test(p)) out.trip_type = 'round_trip'

    // waypoint count
    const wm = p.match(/경유지?\s*(\d+)/)
    if (wm) out.waypoint_count = Number(wm[1])
  }

  return out
}

// "이동 동선 / A→B→C" → ["A","B","C"]
function parseRouteSummary(text: string): { summary?: string; nodes: string[] } {
  const m = text.match(/(?:★|☆|■|이동\s*동선|동선)\s*[\/:：]?\s*([^\n]+)/)
  if (!m) return { nodes: [] }
  const raw = m[1].trim()
  const nodes = raw.split(/[→\->]+|>+/).map(s => s.trim()).filter(Boolean)
  return { summary: nodes.join('→'), nodes }
}

// "출발지 주소 :" / "*출발지 주소 :" / "출발 :" 등의 키 정규식
const KEY_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: 'departure_address',   re: /(?:^|\n)\s*\*?\s*(?:출발(?:지)?|시작)\s*(?:주소)?\s*[:：]\s*([^\n]+)/ },
  { key: 'departure_phone',     re: /(?:^|\n)\s*\*?\s*(?:출발(?:지)?|시작)\s*(?:연락처|전화|번호)\s*[:：]\s*([^\n]+)/ },
  { key: 'departure_car',       re: /(?:^|\n)\s*\*?\s*(?:출발|시작|픽업)?\s*차량\s*(?:번호)?\s*[:：]\s*([^\n]+)/ },
  { key: 'waypoint_address',    re: /(?:^|\n)\s*\*?\s*(?:경유(?:지)?|중간)\s*(?:주소)?\s*[:：]\s*([^\n]+)/ },
  { key: 'waypoint_phone',      re: /(?:^|\n)\s*\*?\s*(?:경유(?:지)?|중간)\s*(?:연락처|전화|번호)\s*[:：]\s*([^\n]+)/ },
  { key: 'waypoint_car_swap',   re: /(?:^|\n)\s*\*?\s*차량\s*(?:교체|체인지|change)\s*[:：]\s*([^\n]+)/ },
  { key: 'destination_address', re: /(?:^|\n)\s*\*?\s*(?:도착(?:지)?|종료|최종)\s*(?:주소)?\s*[:：]\s*([^\n]+)/ },
  { key: 'destination_phone',   re: /(?:^|\n)\s*\*?\s*(?:도착(?:지)?|종료|최종)\s*(?:연락처|전화|번호)\s*[:：]\s*([^\n]+)/ },
  { key: 'photo_request',       re: /(?:^|\n)\s*[★☆■*]?\s*내?\/?외관?\s*사진[^0-9\n]*?(\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4})/ },
]

// "라벨 / 주소" 형식 분해 (예: "문정현대지식산업센터 B동 지하4층 / 서울 송파구 법원로 11길 11")
function splitLabelAddress(raw: string): { label?: string; address?: string } {
  const trimmed = raw.trim()
  if (!trimmed.includes('/')) return { address: trimmed }
  const idx = trimmed.indexOf('/')
  const left = trimmed.slice(0, idx).trim()
  const right = trimmed.slice(idx + 1).trim()
  // 오른쪽이 한국 주소 패턴(시/도 시작)이면 right=address
  if (/^(서울|경기|인천|부산|대구|대전|광주|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)/.test(right)) {
    return { label: left, address: right }
  }
  return { address: trimmed }
}

// ─── 메인 파서 ──────────────────────────────────────────────────
export function parseTransportText(raw: string): ParsedRequest {
  const result: ParsedRequest = {
    service_type: 'general',
    trip_type: 'one_way',
    photo_required: false,
    stops: [],
    unmatched_lines: [],
    confidence: 'low',
  }

  if (!raw || !raw.trim()) return result

  const text = raw.replace(/\r\n/g, '\n').trim()
  const usedRanges: Array<[number, number]> = []  // 매칭된 라인 추적

  // ── 1. 헤더 분석 ──
  const header = parseHeader(text)
  if (header.service_type) result.service_type = header.service_type
  if (header.trip_type) result.trip_type = header.trip_type

  // ── 2. 이동 동선 추출 ──
  const route = parseRouteSummary(text)
  if (route.summary) result.route_summary = route.summary

  // ── 3. 키워드 매칭 ──
  const fields: Record<string, string | undefined> = {}
  for (const { key, re } of KEY_PATTERNS) {
    const m = text.match(re)
    if (m) {
      fields[key] = m[1].trim()
      // 매칭 라인 범위 기록
      const idx = text.indexOf(m[0])
      if (idx >= 0) usedRanges.push([idx, idx + m[0].length])
    }
  }

  // ── 4. Stops 구성 ──
  // departure
  if (fields.departure_address || fields.departure_car || fields.departure_phone) {
    const { label, address } = splitLabelAddress(fields.departure_address || '')
    const carNum = fields.departure_car ? extractCarNumber(fields.departure_car) : undefined
    result.stops.push({
      stop_order: 1,
      stop_type: 'departure',
      location_name: label,
      address,
      contact_phone: fields.departure_phone ? extractPhone(fields.departure_phone) : undefined,
      car_pickup_external: carNum,
    })
  }

  // waypoint(들) — 양식 1은 단일 경유지 가정
  if (fields.waypoint_address || fields.waypoint_phone || fields.waypoint_car_swap) {
    const { label, address } = splitLabelAddress(fields.waypoint_address || '')
    const swapCar = fields.waypoint_car_swap ? extractCarNumber(fields.waypoint_car_swap) : undefined
    const departureCar = result.stops[0]?.car_pickup_external
    result.stops.push({
      stop_order: 2,
      stop_type: 'waypoint',
      location_name: label,
      address,
      contact_phone: fields.waypoint_phone ? extractPhone(fields.waypoint_phone) : undefined,
      // 차량 교체: 출발지 차량을 drop, 새 차량 pickup
      car_dropoff_external: departureCar,
      car_pickup_external: swapCar,
    })
  }

  // destination
  if (fields.destination_address || fields.destination_phone) {
    const { label, address } = splitLabelAddress(fields.destination_address || '')
    const order = result.stops.length + 1
    // 마지막 stop의 pickup 차량을 도착지에서 drop
    const lastPickup = [...result.stops].reverse().find(s => s.car_pickup_external)?.car_pickup_external
    result.stops.push({
      stop_order: order,
      stop_type: 'destination',
      location_name: label,
      address,
      contact_phone: fields.destination_phone ? extractPhone(fields.destination_phone) : undefined,
      car_dropoff_external: lastPickup,
    })
  }

  // ── 5. 사진 요청 ──
  if (fields.photo_request || /사진\s*촬영/.test(text)) {
    result.photo_required = true
    if (fields.photo_request) {
      result.photo_target_phone = normalizePhone(fields.photo_request)
    } else {
      // 폴백: 출발지 연락처 사용
      result.photo_target_phone = result.stops[0]?.contact_phone
    }
  }

  // ── 6. fallback: 양식 2 (키워드 매칭 약했을 때) ──
  if (result.stops.length === 0) {
    // 단순 화살표 파싱 시도: "A → B" + 차량번호 + 연락처
    const arrowMatch = text.match(/([가-힣A-Za-z0-9\s]+?)\s*[→\->]+\s*([가-힣A-Za-z0-9\s]+)/)
    if (arrowMatch) {
      const [, from, to] = arrowMatch
      result.stops.push({ stop_order: 1, stop_type: 'departure', location_name: from.trim() })
      result.stops.push({ stop_order: 2, stop_type: 'destination', location_name: to.trim() })

      // 전체 텍스트에서 차량번호/전화번호 모두 수집
      const carNums = Array.from(text.matchAll(new RegExp(CAR_NUMBER_RE, 'g'))).map(m => m[1].replace(/\s+/g, ''))
      const phones = Array.from(text.matchAll(new RegExp(PHONE_RE, 'g'))).map(m => normalizePhone(m[1]))
      if (carNums[0]) result.stops[0].car_pickup_external = carNums[0]
      if (carNums[carNums.length - 1] && carNums.length > 1) {
        result.stops[result.stops.length - 1].car_dropoff_external = carNums[carNums.length - 1]
      } else if (carNums[0]) {
        result.stops[result.stops.length - 1].car_dropoff_external = carNums[0]
      }
      if (phones[0]) result.stops[0].contact_phone = phones[0]
      if (phones[phones.length - 1]) result.stops[result.stops.length - 1].contact_phone = phones[phones.length - 1]
    }
  }

  // route_summary 폴백: stops 기반 자동 생성
  if (!result.route_summary && result.stops.length > 0) {
    result.route_summary = result.stops
      .map(s => s.location_name || s.address?.split(' ').slice(0, 2).join(' ') || '?')
      .join('→')
  }

  // ── 7. unmatched_lines 추출 ──
  const lines = text.split('\n')
  let cursor = 0
  for (const line of lines) {
    const lineStart = text.indexOf(line, cursor)
    cursor = lineStart + line.length
    const lineEnd = lineStart + line.length
    const matched = usedRanges.some(([s, e]) => lineStart < e && lineEnd > s)
    const trimmed = line.trim()
    if (!matched && trimmed && !/^[★☆■]/.test(trimmed) && !/탁송\(/.test(trimmed) && !/이동\s*동선/.test(trimmed)) {
      result.unmatched_lines.push(trimmed)
    }
  }

  // ── 8. 신뢰도 산정 ──
  const stopCount = result.stops.length
  const fieldsFilled = result.stops.reduce((acc, s) =>
    acc + (s.address ? 1 : 0) + (s.contact_phone ? 1 : 0) + (s.car_pickup_external || s.car_dropoff_external ? 1 : 0)
  , 0)
  if (stopCount >= 2 && fieldsFilled >= stopCount * 2) result.confidence = 'high'
  else if (stopCount >= 2) result.confidence = 'medium'
  else result.confidence = 'low'

  // 매칭 못한 라인은 notes로 합쳐서 노출
  if (result.unmatched_lines.length > 0) {
    result.notes = result.unmatched_lines.join('\n')
  }

  return result
}
