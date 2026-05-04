// ─────────────────────────────────────────────────────────────────
// 카카오맵 즐겨찾기 6개 그룹 JSON → 통합 factories-merged.json
//
// 실행:
//   node scripts/build-factories-from-favorites.mjs
//
// 출력:
//   data/factories-merged.json
// ─────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const FAV_DIR = join(ROOT, 'data', 'kakao-favorites')
const OUT = join(ROOT, 'data', 'factories-merged.json')

// ── 그룹 라벨 매핑 (folderId → 사람이 보는 라벨) ────────────────────
const GROUP_LABEL = {
  '19480500': 'mg-only',          // MG실비입고가능
  '19480490': 'main-incoming',    // 메인 (가장 큰 통합 즐겨찾기, 65개)
  '19391198': 'backup-list',      // 백업/구버전 (41개)
  '19211384': 'autohands',        // 오토핸즈입고가능
  '7482597':  'meritz-only',      // 메리츠실비/메리츠실비만 입고O
  '14405773': 'terminated',       // 종료공장
}

// ── 인라인 파서 (TS 미러) ─────────────────────────────────────────
const KW = {
  mg: /(엠실비|MG\s*실비)/i,
  turnkey: /턴키/,
  meritz: /메리츠(실비)?/,
  autohands: /오토핸즈/,
}
function extractMetaSegments(name) {
  const parens = []
  const re = /\(([^)]+)\)/g
  let m
  while ((m = re.exec(name))) parens.push(m[1])
  const tail = name.split('(')[0]
  const slashSegments = tail.split('/').slice(1).map(s => s.trim()).filter(Boolean)
  return [...parens, ...slashSegments]
}
function parseSegmentInsurance(segment, into) {
  const parts = segment.split('/').map(s => s.trim()).filter(Boolean)
  for (const part of parts) {
    const trimmed = part.replace(/\s+/g, '')
    let polarity = null
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
  }
}
function parseSpecialTags(name) {
  const tags = new Set()
  if (/\*외제차만입고\*/.test(name)) tags.add('foreign-only')
  if (/\*배정불가\*|배정불가/.test(name)) tags.add('unassignable')
  if (/테슬라전용/.test(name)) tags.add('tesla-only')
  if (/삼성카드/.test(name)) tags.add('samsung-card')
  if (/삼성반납/.test(name)) tags.add('samsung-return')
  if (/평택캠퍼스/.test(name)) tags.add('samsung-pyeongtaek')
  if (/현대자동차블루핸즈|블루핸즈/.test(name)) tags.add('hyundai-bluehands')
  if (/기아오토큐|기아\s*오토큐/.test(name)) tags.add('kia-autoq')
  return [...tags]
}
function makeCleanName(name) {
  let n = name
  n = n.replace(/\([^)]*\)/g, '')
  n = n.replace(/\*[^*]+\*/g, '')
  n = n.split('/')[0]
  return n.trim()
}

// ── 메인 빌드 ────────────────────────────────────────────────────
function build() {
  const files = readdirSync(FAV_DIR).filter(f => f.endsWith('.json') && f.startsWith('group-'))
  const byPlace = new Map() // placeId → factory record

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(FAV_DIR, file), 'utf8'))
    const groupLabel = GROUP_LABEL[String(data.folderId)] || `unknown-${data.folderId}`

    for (const it of data.items) {
      if (!it.placeId) continue
      const id = String(it.placeId)
      let rec = byPlace.get(id)
      if (!rec) {
        const insurance = { mg: null, turnkey: null, meritz: null, autohands: null }
        rec = {
          placeId: id,
          name: it.name,
          cleanName: makeCleanName(it.name),
          address: it.address,
          insurance,
          specialTags: new Set(),
          groups: new Set(),
          aliases: new Set(),
        }
        byPlace.set(id, rec)
      }
      rec.groups.add(groupLabel)
      rec.aliases.add(it.name)
      // 이번 항목의 이름에서 메타 다시 파싱 (그룹별 이름이 다를 수 있음)
      for (const seg of extractMetaSegments(it.name)) {
        parseSegmentInsurance(seg, rec.insurance)
      }
      parseSpecialTags(it.name).forEach(t => rec.specialTags.add(t))
    }
  }

  // ── 2차 dedup: 같은 공장이 여러 placeId 로 등록된 경우 병합 ─
  // 키 = (정규화 cleanName 첫 8자) + '|' + (정규화 주소 핵심부)
  const normalizeName = (s) => (s || '').replace(/[\s\d().,/*]/g, '').toLowerCase().slice(0, 8)
  const normalizeAddr = (s) => (s || '').replace(/[\s().,]/g, '').replace(/\d/g, '').slice(0, 24)
  const dedupKey = (rec) => `${normalizeName(rec.cleanName)}|${normalizeAddr(rec.address)}`

  const merged = new Map()
  for (const rec of byPlace.values()) {
    const key = dedupKey(rec)
    let m = merged.get(key)
    if (!m) {
      m = {
        ...rec,
        // 추가 추적용
        allPlaceIds: new Set([rec.placeId]),
        rawNames: new Set([rec.name]),
        addresses: new Set([rec.address]),
      }
      merged.set(key, m)
    } else {
      // 그룹/태그 union, 보험 OR
      rec.groups.forEach(g => m.groups.add(g))
      rec.specialTags.forEach(t => m.specialTags.add(t))
      rec.aliases.forEach(a => m.aliases.add(a))
      m.allPlaceIds.add(rec.placeId)
      m.rawNames.add(rec.name)
      m.addresses.add(rec.address)
      for (const k of ['mg', 'turnkey', 'meritz', 'autohands']) {
        if (rec.insurance[k] === true) m.insurance[k] = true
        else if (rec.insurance[k] === false && m.insurance[k] === null) m.insurance[k] = false
      }
      // 더 긴/풍부한 cleanName/address 사용
      if ((rec.cleanName?.length || 0) > (m.cleanName?.length || 0)) m.cleanName = rec.cleanName
      if ((rec.address?.length || 0) > (m.address?.length || 0)) m.address = rec.address
    }
  }

  // Set → Array 직렬화 + 그룹 라벨에서 파생되는 추론
  const out = []
  for (const rec of merged.values()) {
    const groups = [...rec.groups]
    if (groups.includes('mg-only') && rec.insurance.mg !== false) rec.insurance.mg = true
    if (groups.includes('autohands') && rec.insurance.autohands !== false) rec.insurance.autohands = true
    if (groups.includes('meritz-only') && rec.insurance.meritz !== false) rec.insurance.meritz = true

    out.push({
      placeId: rec.placeId,                       // 대표 placeId (가장 처음 본 것)
      allPlaceIds: [...rec.allPlaceIds],          // 합쳐진 모든 placeId 들
      name: rec.name,
      cleanName: rec.cleanName,
      address: rec.address,
      aliases: [...rec.aliases].filter(a => a !== rec.name),
      addresses: [...rec.addresses].filter(a => a !== rec.address),
      insurance: rec.insurance,
      tags: [...rec.specialTags],
      groups,
      terminated: groups.includes('terminated'),
    })
  }

  // factcode 자동 생성 (placeId 기반)
  for (const r of out) r.factcode = `K${r.placeId.slice(-7)}`

  out.sort((a, b) => a.cleanName.localeCompare(b.cleanName, 'ko'))

  // 통계
  const stats = {
    total: out.length,
    byGroup: {},
    insurance: { mgOk: 0, turnkeyOk: 0, meritzOk: 0, autohandsOk: 0, allOk: 0 },
    tags: {},
    terminated: out.filter(r => r.terminated).length,
  }
  for (const r of out) {
    for (const g of r.groups) stats.byGroup[g] = (stats.byGroup[g] || 0) + 1
    if (r.insurance.mg) stats.insurance.mgOk++
    if (r.insurance.turnkey) stats.insurance.turnkeyOk++
    if (r.insurance.meritz) stats.insurance.meritzOk++
    if (r.insurance.autohands) stats.insurance.autohandsOk++
    if (r.insurance.mg && r.insurance.turnkey && r.insurance.meritz && r.insurance.autohands) stats.insurance.allOk++
    for (const t of r.tags) stats.tags[t] = (stats.tags[t] || 0) + 1
  }

  writeFileSync(OUT, JSON.stringify({ stats, factories: out }, null, 2), 'utf8')
  console.log('✅ Wrote', OUT)
  console.log(JSON.stringify(stats, null, 2))
}

build()
