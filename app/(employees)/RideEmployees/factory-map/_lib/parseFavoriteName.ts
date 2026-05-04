// ───────────────────────────────────────────────────────────────
// 카카오맵 즐겨찾기 공장명 메타 파서
// 예: "퍼펙트모터스(엠실비,턴키,메리츠실비O/오토핸즈X)"
//     "효성1급자동차공업사(엠실비,턴키,메리츠,오토핸즈O)"
//     "*외제차만입고*와이에이치모터스엔오토파츠(엠실비,턴키O/메리츠,오토핸즈X)"
//     "스마일카관리서비스/전체입고O/오토핸즈입고가능"
//     "신성모터스(삼성전자 평택캠퍼스차량만 배정)"
// ───────────────────────────────────────────────────────────────

/** 보험사/입고 종류 — 가능(true) / 불가(false) / 미명시(null) */
export type InsuranceTriState = true | false | null

export interface InsuranceFlags {
  mg: InsuranceTriState        // MG손해보험 실비 (=엠실비)
  turnkey: InsuranceTriState   // 턴키
  meritz: InsuranceTriState    // 메리츠 / 메리츠실비
  autohands: InsuranceTriState // 오토핸즈
}

export interface ParsedName {
  cleanName: string                    // 메타 제거된 짧은 이름
  rawName: string                      // 원본
  insurance: InsuranceFlags
  specialTags: string[]                // foreign-only, tesla-only, unassignable, samsung-card 등
}

const KW = {
  mg: /(엠실비|MG\s*실비)/i,
  turnkey: /턴키/,
  meritz: /메리츠(실비)?/,
  autohands: /오토핸즈/,
}

function extractMetaSegments(name: string): string[] {
  const parens: string[] = []
  const re = /\(([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(name))) parens.push(m[1])

  const tail = name.split('(')[0]
  const slashSegments = tail.split('/').slice(1).map(s => s.trim()).filter(Boolean)

  return [...parens, ...slashSegments]
}

function parseSegmentInsurance(segment: string, into: InsuranceFlags) {
  const parts = segment.split('/').map(s => s.trim()).filter(Boolean)

  for (const part of parts) {
    const trimmed = part.replace(/\s+/g, '')
    let polarity: boolean | null = null
    if (/입고가능|입고O\b|^전체입고O$|만입고O$/.test(trimmed)) polarity = true
    else if (/O[)\s]*$/.test(trimmed)) polarity = true
    else if (/X[)\s]*$/.test(trimmed)) polarity = false
    if (polarity === null) continue

    if (KW.mg.test(trimmed)) into.mg = polarity
    if (KW.turnkey.test(trimmed)) into.turnkey = polarity
    if (KW.meritz.test(trimmed)) into.meritz = polarity
    if (KW.autohands.test(trimmed)) into.autohands = polarity
    if (/전체입고/.test(trimmed) && polarity === true) {
      into.mg = into.turnkey = into.meritz = into.autohands = true
    }
    if (/실비제외전체입고/.test(trimmed) && polarity === true) {
      into.turnkey = into.autohands = true
    }
  }
}

function parseSpecialTags(name: string, _addr: string): string[] {
  const tags = new Set<string>()
  if (/\*외제차만입고\*/.test(name)) tags.add('foreign-only')
  if (/\*배정불가\*/.test(name) || /배정불가/.test(name)) tags.add('unassignable')
  if (/테슬라전용/.test(name)) tags.add('tesla-only')
  if (/삼성카드/.test(name)) tags.add('samsung-card')
  if (/삼성반납/.test(name)) tags.add('samsung-return')
  if (/삼성전자\s*평택|평택캠퍼스/.test(name)) tags.add('samsung-pyeongtaek')
  if (/현대자동차블루핸즈|블루핸즈/.test(name)) tags.add('hyundai-bluehands')
  if (/기아오토큐|기아\s*오토큐/.test(name)) tags.add('kia-autoq')
  return [...tags]
}

function makeCleanName(name: string): string {
  let n = name
  n = n.replace(/\([^)]*\)/g, '')
  n = n.replace(/\*[^*]+\*/g, '')
  n = n.split('/')[0]
  return n.trim()
}

export function parseFavoriteName(rawName: string, address = ''): ParsedName {
  const insurance: InsuranceFlags = { mg: null, turnkey: null, meritz: null, autohands: null }
  for (const seg of extractMetaSegments(rawName)) {
    parseSegmentInsurance(seg, insurance)
  }
  return {
    rawName,
    cleanName: makeCleanName(rawName),
    insurance,
    specialTags: parseSpecialTags(rawName, address),
  }
}
