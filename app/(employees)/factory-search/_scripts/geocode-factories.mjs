// ─────────────────────────────────────────────────────────────────
// data/factories-merged.json 의 주소 → 좌표 일괄 변환
// 카카오 REST API 사용 (.env.local 의 KAKAO_REST_API_KEY)
//
// 실행:
//   node scripts/geocode-factories.mjs
//
// 동작:
//   - 이미 lat/lng 가 있는 항목은 건너뜀 (idempotent)
//   - 우선 도로명/지번 직접 검색 (address API)
//   - 실패 시 키워드 검색 (cleanName 으로 fallback)
//   - 약 ~150ms 인터벌로 요청 (rate limit 보호)
// ─────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA = join(ROOT, 'data', 'factories-merged.json')

// .env.local 직접 파싱 (간단)
function loadEnv() {
  try {
    const text = readFileSync(join(ROOT, '.env.local'), 'utf8')
    const env = {}
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
    return env
  } catch { return {} }
}

const env = { ...loadEnv(), ...process.env }
const KEY = env.KAKAO_REST_API_KEY

if (!KEY) {
  console.error('❌ .env.local 에 KAKAO_REST_API_KEY 가 없습니다.')
  console.error('   카카오 디벨로퍼스 → 앱 키 → REST API 키 를 추가하세요.')
  process.exit(1)
}

const HEAD = { Authorization: `KakaoAK ${KEY}` }

async function searchAddress(q) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}`
  const r = await fetch(url, { headers: HEAD })
  if (!r.ok) throw new Error(`address ${r.status}`)
  const j = await r.json()
  const doc = j.documents?.[0]
  if (!doc) return null
  return { lat: Number(doc.y), lng: Number(doc.x), source: 'address' }
}

async function searchKeyword(q) {
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}`
  const r = await fetch(url, { headers: HEAD })
  if (!r.ok) throw new Error(`keyword ${r.status}`)
  const j = await r.json()
  const doc = j.documents?.[0]
  if (!doc) return null
  return { lat: Number(doc.y), lng: Number(doc.x), source: 'keyword' }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function geocodeOne(rec) {
  // 1) 주소 직접 검색
  if (rec.address) {
    try {
      const r = await searchAddress(rec.address)
      if (r) return r
    } catch (e) { /* fall through */ }
  }
  // 2) 키워드 검색 — 정제된 이름 + 주소 시도
  const candidates = [
    rec.cleanName,
    `${rec.cleanName} ${rec.address}`,
    rec.address,
  ].filter(Boolean)
  for (const q of candidates) {
    try {
      const r = await searchKeyword(q)
      if (r) return r
    } catch (e) { /* */ }
  }
  return null
}

async function main() {
  const json = JSON.parse(readFileSync(DATA, 'utf8'))
  const list = json.factories
  let ok = 0, miss = 0, skip = 0
  for (let i = 0; i < list.length; i++) {
    const rec = list[i]
    if (typeof rec.lat === 'number' && typeof rec.lng === 'number') { skip++; continue }
    const r = await geocodeOne(rec)
    if (r) {
      rec.lat = r.lat
      rec.lng = r.lng
      rec.geoSource = r.source
      ok++
      process.stdout.write(`✓ [${i + 1}/${list.length}] ${rec.cleanName.slice(0, 30)}  (${r.source})\n`)
    } else {
      miss++
      process.stdout.write(`✗ [${i + 1}/${list.length}] ${rec.cleanName.slice(0, 30)}  ← 좌표 못 찾음\n`)
    }
    await sleep(150)
  }
  // 통계 갱신
  json.stats.geocoded = list.filter(r => typeof r.lat === 'number').length
  json.stats.geocodeMiss = list.filter(r => typeof r.lat !== 'number').length
  writeFileSync(DATA, JSON.stringify(json, null, 2), 'utf8')
  console.log(`\n완료: ✓${ok} 신규 / ↺${skip} 기존 / ✗${miss} 실패`)
  console.log(`현재 좌표 있음: ${json.stats.geocoded}/${list.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
