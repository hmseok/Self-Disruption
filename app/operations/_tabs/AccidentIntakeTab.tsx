'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS } from '@/app/utils/ui-tokens'
import type { DispatchRequestRow } from '@/app/operations/intake/types'
import { fmtCafe24DateTime } from '@/app/operations/intake/types'

// ═══════════════════════════════════════════════════════════════════
// AccidentIntakeTab — P2.1a
// /operations 메인 페이지의 「사고접수」 sub-tab.
// /operations/intake/page.tsx 의 단일 list 로직 이전 (P1.5e).
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type FilterKey = 'all' | 'dcyn_y' | 'dcyn_n' | 'closed'

const FILTER_QUERY: Record<FilterKey, { dcyn: string; rgst: string }> = {
  all:    { dcyn: 'all', rgst: 'R' },
  dcyn_y: { dcyn: 'Y',   rgst: 'R' },
  dcyn_n: { dcyn: 'N',   rgst: 'R' },
  closed: { dcyn: 'all', rgst: 'C' },
}

export default function AccidentIntakeTab() {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKey>('all')

  const [cache, setCache] = useState<Record<FilterKey, DispatchRequestRow[] | null>>({
    all: null, dcyn_y: null, dcyn_n: null, closed: null,
  })
  const [loadingMap, setLoadingMap] = useState<Record<FilterKey, boolean>>({
    all: false, dcyn_y: false, dcyn_n: false, closed: false,
  })
  const [errMap, setErrMap] = useState<Record<FilterKey, string | null>>({
    all: null, dcyn_y: null, dcyn_n: null, closed: null,
  })
  const [search, setSearch] = useState('')

  const todayYmd = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const monthAgoYmd = useMemo(() => {
    const d = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const [fromDate, setFromDate] = useState<string>(monthAgoYmd)
  const [toDate, setToDate] = useState<string>(todayYmd)
  const dateRange = useMemo(() => {
    const fmt = (s: string) => s.replace(/-/g, '')
    return { from: fmt(fromDate), to: fmt(toDate) }
  }, [fromDate, toDate])

  const fetchFilter = useCallback(async (key: FilterKey) => {
    setLoadingMap((m) => ({ ...m, [key]: true }))
    setErrMap((m) => ({ ...m, [key]: null }))
    try {
      const headers = await getAuthHeader()
      const q = FILTER_QUERY[key]
      const params = new URLSearchParams({
        from: dateRange.from, to: dateRange.to, limit: '200',
        dcyn: q.dcyn, rgst: q.rgst,
      })
      const res = await fetch(`/api/operations/cafe24-dispatch-requests?${params}`, { headers })
      const json = await res.json().catch(() => ({}))
      if (json?.success && Array.isArray(json.data)) {
        setCache((c) => ({ ...c, [key]: json.data as DispatchRequestRow[] }))
      } else {
        setCache((c) => ({ ...c, [key]: [] }))
        setErrMap((m) => ({ ...m, [key]: json?.error || 'cafe24 미연결' }))
      }
    } catch (e: any) {
      setCache((c) => ({ ...c, [key]: [] }))
      setErrMap((m) => ({ ...m, [key]: e?.message || 'fetch 실패' }))
    } finally {
      setLoadingMap((m) => ({ ...m, [key]: false }))
    }
  }, [dateRange])

  useEffect(() => {
    (Object.keys(FILTER_QUERY) as FilterKey[]).forEach((k) => {
      if (cache[k] === null && !loadingMap[k] && !errMap[k]) fetchFilter(k)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange])

  const refresh = useCallback(() => {
    setCache({ all: null, dcyn_y: null, dcyn_n: null, closed: null })
  }, [])
  const applyDate = useCallback((from: string, to: string) => {
    setFromDate(from); setToDate(to)
    setCache({ all: null, dcyn_y: null, dcyn_n: null, closed: null })
  }, [])

  const activeData = cache[filter] || []
  const activeLoading = loadingMap[filter]
  const activeErr = errMap[filter]

  const filtered = useMemo(() => {
    if (!search.trim()) return activeData
    const q = search.toLowerCase()
    return activeData.filter((r) =>
      (r.cars_no || '').toLowerCase().includes(q) ||
      (r.otptcanm || '').toLowerCase().includes(q) ||
      (r.otptdsnm || '').toLowerCase().includes(q) ||
      (r.cars_user || '').toLowerCase().includes(q) ||
      (r.rental_vendor || '').toLowerCase().includes(q) ||
      (r.capital_co_name || '').toLowerCase().includes(q) ||
      (r.otptidno || '').toLowerCase().includes(q) ||
      (r.otptacmo || '').toLowerCase().includes(q),
    )
  }, [activeData, search])

  const counts = {
    all: cache.all?.length ?? 0,
    dcyn_y: cache.dcyn_y?.length ?? 0,
    dcyn_n: cache.dcyn_n?.length ?? 0,
    closed: cache.closed?.length ?? 0,
  }

  const statItems: StatItem[] = [
    { label: '📋 전체 (활성)', value: counts.all, unit: '건', tint: 'blue' },
    { label: '🚗 대차 사용', value: counts.dcyn_y, unit: '건', tint: 'red' },
    { label: '🚙 대차 미사용', value: counts.dcyn_n, unit: '건', tint: 'amber' },
    { label: '✅ 종결', value: counts.closed, unit: '건', tint: 'green' },
    { label: '🔍 검색결과', value: filtered.length, unit: '건', tint: 'purple' },
  ]
  const statActions: ActionButton[] = [
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  const filterItems: FilterItem[] = [
    { key: 'all', label: '📋 전체', count: counts.all },
    { key: 'dcyn_y', label: '🚗 대차사용', count: counts.dcyn_y },
    { key: 'dcyn_n', label: '🚙 대차미사용', count: counts.dcyn_n },
    { key: 'closed', label: '✅ 종결', count: counts.closed },
  ]

  const columns: TableColumn<DispatchRequestRow>[] = [
    {
      key: 'date', label: '접수일시', width: 130,
      sortBy: (r) => `${r.otptacdt || ''}${r.otptactm || ''}`,
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#1e293b', fontSize: 12 }}>{fmtCafe24DateTime(r.otptacdt, r.otptactm) || '-'}</span>,
    },
    {
      key: 'cars_no', label: '차량번호', width: 100,
      sortBy: (r) => r.cars_no || '',
      render: (r) => <span style={{ fontWeight: 700, color: '#0f2440', whiteSpace: 'nowrap' }}>🚗 {r.cars_no || '-'}</span>,
    },
    {
      key: 'cars_model', label: '차종', width: 200,
      sortBy: (r) => r.cars_model || '',
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 200 }}>{r.cars_model || '-'}</span>,
    },
    {
      key: 'capital_co_name', label: '캐피탈사', width: 120,
      sortBy: (r) => r.capital_co_name || '',
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{r.capital_co_name || '-'}</span>,
    },
    {
      key: 'cars_user', label: '고객', width: 160,
      sortBy: (r) => r.cars_user || '',
      render: (r) => <span style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 160 }}>{r.cars_user || '-'}</span>,
    },
    {
      key: 'otptcanm', label: '통보자', width: 130,
      sortBy: (r) => r.otptcanm || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{r.otptcanm || '-'}{r.otptcahp && <span style={{ marginLeft: 4, fontSize: 11, color: '#64748b' }}>{r.otptcahp}</span>}</span>,
    },
    {
      key: 'otptdcyn', label: '대차', width: 100, align: 'center',
      sortBy: (r) => r.otptdcyn || '',
      render: (r) => {
        const isY = r.otptdcyn === 'Y'
        return (
          <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
            background: isY ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.15)',
            color: isY ? '#991b1b' : '#475569',
          }}>{isY ? '🚗 사용' : '🚙 미사용'}</span>
        )
      },
    },
    {
      key: 'rental_vendor', label: '대차업체', width: 140,
      sortBy: (r) => r.rental_vendor || '',
      render: (r) => <span style={{ fontSize: 12, color: '#0f2440', whiteSpace: 'nowrap' }}>{r.rental_vendor || '-'}</span>,
    },
    {
      key: 'otptacmo', label: '사고내용', width: 240,
      sortBy: (r) => r.otptacmo || '',
      render: (r) => <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 240 }}>{r.otptacmo || '-'}</span>,
    },
    {
      key: 'gnus_name', label: '접수자', width: 100,
      sortBy: (r) => r.gnus_name || '',
      render: (r) => <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{r.gnus_name || r.otptgnus || '-'}</span>,
    },
  ]

  const mobileCard: MobileCardConfig<DispatchRequestRow> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>🚗 {r.cars_no || r.otptcanm || r.otptidno}</span>,
    subtitle: (r) => `${fmtCafe24DateTime(r.otptacdt, r.otptactm)} · ${r.rental_vendor || (r.otptdcyn === 'Y' ? '대차사용' : '대차미사용')}`,
  }

  return (
    <div>
      <DcStatStrip stats={statItems} actions={statActions} />
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="차량번호 / 통보자 / 운전자 / 고객 / 대차업체 / 사고내용 검색…"
        filters={filterItems}
        activeFilter={filter}
        onFilterChange={(k) => setFilter(k as FilterKey)}
        trailing={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#475569' }}>
            <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>📅</span>
            <input type="date" value={fromDate} onChange={(e) => applyDate(e.target.value, toDate)}
              style={{ ...GLASS.L1, padding: '6px 8px', borderRadius: 8, fontSize: 12, color: '#1e293b' }} />
            <span style={{ color: '#94a3b8' }}>~</span>
            <input type="date" value={toDate} onChange={(e) => applyDate(fromDate, e.target.value)}
              style={{ ...GLASS.L1, padding: '6px 8px', borderRadius: 8, fontSize: 12, color: '#1e293b' }} />
            <button onClick={() => applyDate(monthAgoYmd, todayYmd)}
              style={{ padding: '6px 10px', background: 'transparent', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
            >최근 30일</button>
            <button onClick={() => {
                const d = new Date(Date.now() - 365 * 24 * 3600 * 1000)
                const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                applyDate(y, todayYmd)
              }}
              style={{ padding: '6px 10px', background: 'transparent', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
            >1년</button>
          </div>
        }
      />
      {activeErr && (
        <div style={{ ...GLASS.L3, marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#991b1b' }}>
          ⚠ cafe24 미연결: {activeErr}
        </div>
      )}
      <NeuDataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => `${r.otptidno}-${r.otptmddt}-${r.otptsrno}`}
        onRowClick={(r) => router.push(`/operations/dispatch/${r.otptidno}/${r.otptmddt}/${r.otptsrno}`)}
        loading={activeLoading}
        emptyIcon="📋"
        emptyMessage="조건에 맞는 사고가 없습니다"
        mobileCard={mobileCard}
        defaultSort={{ key: 'date', dir: 'desc' }}
      />
    </div>
  )
}
