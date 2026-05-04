'use client'

import { useEffect, useState, useCallback } from 'react'

// ───────────────────────────────────────────────────────────────
// 코드 마스터 훅 (RideEmployees/factory-map 격리본)
// 메인 /api/codes 가 아닌 격리된 /RideEmployees/factory-map/api/codes 호출
// FALLBACK 코드는 풍부하게 내장 (DB 미연결에서도 동작)
// ───────────────────────────────────────────────────────────────

type CodeMap = Record<string, Record<string, string>>

let _cache: CodeMap | null = null
let _loading = false
let _listeners: (() => void)[] = []

const FALLBACK: CodeMap = {
  OTPTSTAT: { '1': '접수', '2': '입고', '3': '수리중', '4': '출고', '5': '청구', '9': '완료' },
  OTPTACBN: { B: '보물', D: '단독', E: '기타', G: '가해', H: '긴출', J: '자차', K: '과실', M: '면책', O: '정비', P: '피해', Q: '검사', S: '긴출' },
  FACTTYPE: {
    A: '공장(일반)', B: '공장(P)', C: '정비업체(일반)', D: '정비업체(정기점검)',
    E: '자동차부품', F: '타이어', G: '기타(임시)', H: '법정검사',
    I: '렌터카(대차)', J: '정비업체(미션)', K: '자동차유리', L: '정비업체(순회)',
    M: '탁송', N: '자동차유리',
  },
  FACTGUBN: { '1': '법정검사', '2': '사고접수', '3': '정기점검', '4': '기타', I: '사고접수' },
  BHNAME: { N01: '렌터카공제조합', N02: '메리츠화재', N03: '삼성화재', N04: '흥국화재', N05: '악사다이렉트', N06: '현대해상', N07: 'DB', N99: '보험사없음' },
  OTPTACRN: { Y: '운행가능', N: '운행불가능' },
  CARSSTAT: { R: '이용중', H: '해지', L: '반납' },
}

async function loadCodes(): Promise<CodeMap> {
  if (_cache) return _cache
  if (_loading) {
    return new Promise(resolve => {
      _listeners.push(() => resolve(_cache || FALLBACK))
    })
  }
  _loading = true
  try {
    const res = await fetch('/RideEmployees/factory-map/api/codes')
    const json = await res.json()
    _cache = json?.success && json?.codeMap ? { ...FALLBACK, ...json.codeMap } : FALLBACK
  } catch {
    _cache = FALLBACK
  } finally {
    _loading = false
    _listeners.forEach(fn => fn()); _listeners = []
  }
  return _cache as CodeMap
}

export function useCodeMaster() {
  const [codes, setCodes] = useState<CodeMap>(_cache || FALLBACK)
  const [loading, setLoading] = useState(!_cache)

  useEffect(() => {
    // 메인 useCodeMaster 와 동일 패턴 — _cache hit 시 동기 setState 로 첫 렌더 보정
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (_cache) { setCodes(_cache); setLoading(false); return }
    loadCodes().then(c => { setCodes(c); setLoading(false) })
  }, [])

  const decode = useCallback(
    (group: string, code: string | null | undefined): string => {
      if (!code) return '-'
      return codes[group]?.[code] || code
    },
    [codes],
  )

  const getGroup = useCallback(
    (group: string): Record<string, string> => codes[group] || {},
    [codes],
  )

  const refresh = useCallback(async () => {
    _cache = null
    setLoading(true)
    const c = await loadCodes()
    setCodes(c); setLoading(false)
  }, [])

  return { codes, loading, decode, getGroup, refresh }
}
