'use client'

/**
 * 카페24 코드 마스터 클라이언트 헬퍼
 *
 * - /api/cafe24/codes 한 번 fetch → 메모리 캐시
 * - useCafe24Codes() 훅 — 컴포넌트에서 코드 매핑 사용
 * - getCodeLabel(group, code) — code → 한국어 라벨
 *
 * 본 파일은 RideAccidents + RideAccidentReports 양쪽 페이지에서 import.
 */
import { useEffect, useState } from 'react'
import { getStoredToken } from '@/lib/auth-client'

export type CodeMap = Record<string, Record<string, string>>

let _cache: CodeMap | null = null
let _inflight: Promise<CodeMap> | null = null

async function fetchCodes(): Promise<CodeMap> {
  if (_cache) return _cache
  if (_inflight) return _inflight
  _inflight = (async () => {
    try {
      const token = getStoredToken()
      const res = await fetch('/api/cafe24/codes', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      const json = await res.json()
      const data = (json.success && json.data ? json.data : {}) as CodeMap
      _cache = data
      return data
    } catch {
      _cache = {}
      return {}
    } finally {
      _inflight = null
    }
  })()
  return _inflight
}

export function useCafe24Codes() {
  const [codes, setCodes] = useState<CodeMap>(_cache || {})
  useEffect(() => {
    if (_cache) {
      setCodes(_cache)
      return
    }
    fetchCodes().then((c) => setCodes(c))
  }, [])
  return codes
}

export function getCodeLabel(
  codes: CodeMap,
  group: string,
  code: string | null | undefined,
  fallback?: string
): string {
  if (!code) return fallback ?? '-'
  const grp = codes[group]
  if (!grp) return fallback ?? code
  return grp[code] ?? fallback ?? code
}

/**
 * Y/N 매핑 (PHP 측 패턴 — `if(otptacrn='Y','운행가능','운행불가능')`).
 * @param v 'Y' / 'N' / '' / null
 * @param yLabel Y 일 때 라벨 (예: '운행가능', '정상', '점검됨')
 * @param nLabel N 일 때 라벨 (예: '운행불가능', '문제')
 * @returns { label, color, bg }
 *
 * @example
 *   ynBadge(detail.otptacrn, '운행가능', '운행불가능')
 *   ynBadge(detail.esosbate, '체크됨', '문제')
 */
export function ynBadge(
  v: string | null | undefined,
  yLabel: string,
  nLabel: string,
  // 색상 커스터마이즈 (선택)
  yColor: 'success' | 'danger' | 'warning' = 'success',
  nColor: 'success' | 'danger' | 'warning' = 'danger'
): { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' } {
  if (v === 'Y') return { label: yLabel, tone: yColor }
  if (v === 'N') return { label: nLabel, tone: nColor }
  return { label: '-', tone: 'neutral' }
}
