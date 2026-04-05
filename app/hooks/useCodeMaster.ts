'use client'

import { useEffect, useState, useCallback } from 'react'

type CodeMap = Record<string, Record<string, string>>

// 캐시 (페이지 전환 시에도 유지)
let _cache: CodeMap | null = null
let _loading = false
let _listeners: (() => void)[] = []

// 기본 코드맵 (API 조회 실패 시 fallback)
const FALLBACK: CodeMap = {
  OTPTSTAT: { '1': '접수', '2': '입고', '3': '수리중', '4': '출고' },
  OTPTACBN: { B: '보물', D: '단독', E: '기타', G: '가해', H: '긴출', J: '자차', K: '과실', M: '면책', O: '정비', P: '피해', Q: '검사', S: '긴출' },
  BHNAME: { N01: '렌터카공제조합', N02: '메리츠화재', N03: '삼성화재', N04: '흥국화재', N05: '악사다이렉트', N06: '현대해상', N07: 'DB', N99: '보험사없음' },
  OTPTDSLI: { '1B': '1종보통', '1D': '1종대형', '2A': '2종오토', '2B': '2종보통' },
  OTPTACRN: { Y: '운행가능', N: '운행불가능' },
  CARSSTAT: { R: '이용중', H: '해지', L: '반납' },
  CARSTYPE: { S: '실비', T: '턴키' },
  BHJAGB: { '-': '모름', A: '정액', B: '정율', C: '모름' },
  BHJACHA: { A01: '메리츠캐피탈', A02: '스카이오토서비스', A03: 'GS엠비즈', A04: '효성캐피탈', A05: '렌터카공제조합(자차)', a06: '삼성화재', A07: '라이드(주)', A99: '없음' },
  FACTTYPE: { A: '공장(일반)', B: '공장(P)', C: '정비업체(일반)', D: '정비업체(정기점검)', E: '자동차부품', F: '타이어', G: '기타(임시)', H: '법정검사', I: '렌터카(대차)', J: '정비업체(미션)', K: '자동차유리', L: '정비업체(순회)', M: '탁송', N: '자동차유리' },
  FACTGUBN: { '1': '법정검사', '2': '사고접수', '3': '정기점검', '4': '기타', I: '사고접수' },
  CAMOLEVL: { '1': '좋음', '2': '보통', '3': '나쁨' },
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
    const res = await fetch('/api/codes')
    const json = await res.json()
    if (json.success && json.codeMap) {
      // API 데이터를 fallback과 병합 (API 우선)
      _cache = { ...FALLBACK, ...json.codeMap }
    } else {
      _cache = FALLBACK
    }
  } catch {
    _cache = FALLBACK
  } finally {
    _loading = false
    _listeners.forEach(fn => fn())
    _listeners = []
  }
  return _cache || FALLBACK
}

// React Hook
export function useCodeMaster() {
  const [codes, setCodes] = useState<CodeMap>(_cache || FALLBACK)
  const [loading, setLoading] = useState(!_cache)

  useEffect(() => {
    if (_cache) { setCodes(_cache); setLoading(false); return }
    loadCodes().then(c => { setCodes(c); setLoading(false) })
  }, [])

  // 코드 해석 함수
  const decode = useCallback((group: string, code: string | null | undefined): string => {
    if (!code) return '-'
    return codes[group]?.[code] || code
  }, [codes])

  // 특정 그룹의 전체 코드 목록
  const getGroup = useCallback((group: string): Record<string, string> => {
    return codes[group] || {}
  }, [codes])

  // 캐시 새로고침
  const refresh = useCallback(async () => {
    _cache = null
    setLoading(true)
    const c = await loadCodes()
    setCodes(c)
    setLoading(false)
  }, [])

  return { codes, loading, decode, getGroup, refresh }
}
