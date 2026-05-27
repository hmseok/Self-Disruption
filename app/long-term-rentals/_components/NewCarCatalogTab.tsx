'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// 신차 카탈로그 목록 탭 (PR-Q4-2)
//
// 사용자 명시: 모달 X → 페이지로
//   「+ 신차 등록」 → /long-term-rentals/catalog/new
//   「✎ 편집」      → /long-term-rentals/catalog/[id]
// 목록만 유지 (등록/편집/삭제 모달 모두 제거).
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type CatalogRow = {
  id: string
  brand: string
  model: string
  year: number
  source: string | null
  price_data: any
  created_at: string
  updated_at: string
}

type FilterKey = 'all' | 'gasoline' | 'diesel' | 'hybrid' | 'ev'

const FUEL_LABEL: Record<string, string> = {
  gasoline: '가솔린', diesel: '디젤', hybrid: '하이브리드', ev: '전기',
}

function fmtWon(n: number | null | undefined): string {
  if (n == null) return '-'
  return `${Number(n).toLocaleString('ko-KR')}원`
}
function firstFuel(pd: any): string {
  return pd?.variants?.[0]?.fuel_type || '-'
}
function firstTrimPrice(pd: any): number | null {
  const t = pd?.variants?.[0]?.trims?.[0]
  return t?.base_price || null
}
function trimCount(pd: any): number {
  return (pd?.variants || []).reduce((s: number, v: any) => s + (v.trims?.length || 0), 0)
}
function fuelMatches(pd: any, fuel: FilterKey): boolean {
  if (fuel === 'all') return true
  const target = FUEL_LABEL[fuel]
  return (pd?.variants || []).some((v: any) => String(v.fuel_type || '').includes(target))
}

export default function NewCarCatalogTab() {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<CatalogRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/new-car-prices', { headers })
      const json = await res.json().catch(() => ({}))
      if (Array.isArray(json?.data)) setRows(json.data as CatalogRow[])
      else { setRows([]); if (json?.error) setErr(json.error) }
    } catch (e) {
      setRows([]); setErr((e as Error)?.message || 'fetch 실패')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (rows === null && !loading) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(() => { setRows(null); fetchAll() }, [fetchAll])

  // PR-Q4-2: 모달 → 풀 페이지
  const openCreate = useCallback(() => router.push('/long-term-rentals/catalog/new'), [router])
  const openEdit = useCallback((r: CatalogRow) => router.push(`/long-term-rentals/catalog/${r.id}`), [router])

  const allRows = rows || []
  const filteredByFuel = useMemo(() => {
    if (filter === 'all') return allRows
    return allRows.filter((r) => fuelMatches(r.price_data, filter))
  }, [allRows, filter])
  const filtered = useMemo(() => {
    if (!search.trim()) return filteredByFuel
    const q = search.toLowerCase()
    return filteredByFuel.filter((r) =>
      (r.brand || '').toLowerCase().includes(q) ||
      (r.model || '').toLowerCase().includes(q),
    )
  }, [filteredByFuel, search])

  const counts = useMemo(() => {
    const c = { all: allRows.length, gasoline: 0, diesel: 0, hybrid: 0, ev: 0 }
    for (const r of allRows) {
      for (const v of (r.price_data?.variants || [])) {
        const ft = String(v.fuel_type || '')
        if (ft.includes('가솔린')) c.gasoline++
        else if (ft.includes('디젤')) c.diesel++
        else if (ft.includes('하이브리드') || ft.includes('하브')) c.hybrid++
        else if (ft.includes('전기') || ft.includes('EV') || ft.includes('Electric')) c.ev++
      }
    }
    return c
  }, [allRows])

  const statItems: StatItem[] = [
    { label: '🚗 전체 차종', value: counts.all, unit: '건', tint: 'blue' },
    { label: '⛽ 가솔린 trim', value: counts.gasoline, unit: '건', tint: 'amber' },
    { label: '🛢 디젤 trim', value: counts.diesel, unit: '건', tint: 'red' },
    { label: '🔋 하이브리드', value: counts.hybrid, unit: '건', tint: 'green' },
    { label: '⚡ 전기', value: counts.ev, unit: '건', tint: 'purple' },
  ]
  const statActions: ActionButton[] = [
    { label: '신차 등록', onClick: openCreate, variant: 'primary', icon: '➕' },
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  const filterItems: FilterItem[] = [
    { key: 'all', label: '전체', count: counts.all },
    { key: 'gasoline', label: '가솔린', count: counts.gasoline },
    { key: 'diesel', label: '디젤', count: counts.diesel },
    { key: 'hybrid', label: '하이브리드', count: counts.hybrid },
    { key: 'ev', label: '전기', count: counts.ev },
  ]

  const columns: TableColumn<CatalogRow>[] = [
    { key: 'brand', label: '브랜드', width: 90, sortBy: (r) => r.brand,
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#0f2440', fontSize: 12 }}>{r.brand}</span>,
    },
    { key: 'model', label: '모델', width: 160, sortBy: (r) => r.model,
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#1e293b', fontWeight: 600 }}>{r.model}</span>,
    },
    { key: 'year', label: '연식', width: 64, align: 'center', sortBy: (r) => r.year,
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: '#475569' }}>{r.year}년</span>,
    },
    { key: 'fuel', label: '연료', width: 100, align: 'center', sortBy: (r) => firstFuel(r.price_data),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11, color: '#475569' }}>{firstFuel(r.price_data)}</span>,
    },
    { key: 'trims', label: '트림 수', width: 70, align: 'center', sortBy: (r) => trimCount(r.price_data),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: COLORS.primary }}>{trimCount(r.price_data)}개</span>,
    },
    { key: 'price', label: '대표가 (VAT 포함)', width: 130, align: 'right', sortBy: (r) => firstTrimPrice(r.price_data) || 0,
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: '#0f2440' }}>{fmtWon(firstTrimPrice(r.price_data))}</span>,
    },
    { key: 'source', label: '등록 방식', width: 110, align: 'center', sortBy: (r) => r.source || '',
      render: (r) => {
        const isAi = (r.source || '').toLowerCase().includes('ai')
        return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
          background: isAi ? 'rgba(124,58,237,0.14)' : 'rgba(148,163,184,0.18)',
          color: isAi ? '#5b21b6' : '#475569' }}>
          {isAi ? '🤖 AI' : '✍️ 수동'}
        </span>
      },
    },
    { key: 'actions', label: '액션', width: 70, align: 'center',
      render: (r) => (
        <button onClick={(e) => { e.stopPropagation(); openEdit(r) }}
          style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${COLORS.borderBlue}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>✎ 편집</button>
      ),
    },
  ]

  const mobileCard: MobileCardConfig<CatalogRow> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>{r.brand} {r.model} ({r.year})</span>,
    subtitle: (r) => `${firstFuel(r.price_data)} · 트림 ${trimCount(r.price_data)}개 · ${fmtWon(firstTrimPrice(r.price_data))}`,
  }

  return (
    <>
      <DcStatStrip stats={statItems} actions={statActions} />
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="브랜드 / 모델 검색…"
        filters={filterItems}
        activeFilter={filter}
        onFilterChange={(k) => setFilter(k as FilterKey)}
      />
      {err && (
        <div style={{ ...GLASS.L3, marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#991b1b' }}>
          ⚠ {err}
        </div>
      )}
      <NeuDataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        onRowClick={openEdit}
        loading={loading}
        emptyIcon="🚗"
        emptyMessage="등록된 신차 카탈로그가 없습니다 — 「신차 등록」으로 시작하세요"
        mobileCard={mobileCard}
        defaultSort={{ key: 'updated_at', dir: 'desc' }}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
        💡 영업이 한 번 등록한 신차는 견적 작성 시 카탈로그 픽커에서 재사용됩니다. AI 캡쳐 후 자동으로 쌓입니다.
      </div>
    </>
  )
}
