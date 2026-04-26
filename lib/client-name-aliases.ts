import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════
// 입금자 별칭 매핑 유틸리티
//
// 통장에 "박진숙"으로 입금되지만 실제 투자자는 "임성민"인 경우 등
// bank_name → actual_name 자동 변환
// ═══════════════════════════════════════════════════════════

interface AliasEntry {
  bank_name: string
  actual_name: string
}

let aliasCache: Map<string, string> | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5분

/**
 * 별칭 캐시 로드 (DB에서 active인 것만)
 */
async function loadAliases(): Promise<Map<string, string>> {
  const now = Date.now()
  if (aliasCache && now - cacheTime < CACHE_TTL) return aliasCache

  try {
    const rows = await prisma.$queryRaw<AliasEntry[]>`
      SELECT bank_name, actual_name FROM client_name_aliases WHERE status = 'active'
    `
    aliasCache = new Map(rows.map(r => [r.bank_name.trim(), r.actual_name.trim()]))
    cacheTime = now
  } catch {
    // 테이블이 없으면 빈 맵
    aliasCache = new Map()
    cacheTime = now
  }

  return aliasCache
}

/**
 * 입금자명을 실제 이름으로 변환
 * 별칭이 없으면 원본 반환
 */
export async function resolveClientName(bankName: string): Promise<string> {
  if (!bankName?.trim()) return bankName
  const aliases = await loadAliases()
  return aliases.get(bankName.trim()) || bankName
}

/**
 * 여러 이름을 한번에 변환
 */
export async function resolveClientNames(names: string[]): Promise<Map<string, string>> {
  const aliases = await loadAliases()
  const result = new Map<string, string>()
  for (const name of names) {
    const trimmed = name?.trim() || ''
    result.set(trimmed, aliases.get(trimmed) || trimmed)
  }
  return result
}

/**
 * 캐시 무효화 (별칭 추가/수정 시)
 */
export function invalidateAliasCache() {
  aliasCache = null
  cacheTime = 0
}
