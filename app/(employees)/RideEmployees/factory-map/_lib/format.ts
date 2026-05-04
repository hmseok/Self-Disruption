// ───────────────────────────────────────────────────────────────
// 표시 포맷 헬퍼 (RideEmployees/factory-map 격리 — FactoryMap 이식본)
// 날짜 'YYYYMMDD' → 'YYYY-MM-DD', 시간 'HHmm' → 'HH:mm'
// ───────────────────────────────────────────────────────────────

export const fD = (d?: string | null) => {
  if (!d) return ''
  if (/^\d{8}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
  return d
}

export const fT = (t?: string | null) => {
  if (!t || t.length < 4) return ''
  return `${t.slice(0, 2)}:${t.slice(2, 4)}`
}

export const fDT = (d?: string | null, t?: string | null) => {
  const dd = fD(d)
  const tt = fT(t)
  return tt ? `${dd} ${tt}` : dd
}

export const fNum = (n: number | string | null | undefined) => {
  if (n === null || n === undefined || n === '') return '-'
  const v = typeof n === 'string' ? Number(n) : n
  if (Number.isNaN(v)) return '-'
  return v.toLocaleString()
}

export const fPhone = (p?: string | null) => {
  if (!p) return ''
  const x = p.replace(/\D/g, '')
  if (x.length === 11) return `${x.slice(0, 3)}-${x.slice(3, 7)}-${x.slice(7)}`
  if (x.length === 10) return `${x.slice(0, 3)}-${x.slice(3, 6)}-${x.slice(6)}`
  return p
}
