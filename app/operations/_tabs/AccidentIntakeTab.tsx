'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS } from '@/app/utils/ui-tokens'
import type { DispatchRequestRow, DispatchOrder } from '@/app/operations/intake/types'
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

type FilterKey = 'todo' | 'all' | 'dcyn_y' | 'dcyn_n' | 'closed'

// PR-F (2026-05-16) — 우리 진행 상태 배지 (operations_dispatch_orders.status)
const ORDER_STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  new:        { label: '🆕 신규',     bg: 'rgba(148,163,184,0.15)', fg: '#475569' },
  consulting: { label: '📞 상담중',   bg: 'rgba(245,158,11,0.12)',  fg: '#b45309' },
  scheduled:  { label: '📅 배차예정', bg: 'rgba(99,102,241,0.12)',  fg: '#4338ca' },
  dispatched: { label: '🚐 배차완료', bg: 'rgba(34,197,94,0.12)',   fg: '#15803d' },
  done:       { label: '✅ 회차완료', bg: 'rgba(148,163,184,0.15)', fg: '#475569' },
  cancelled:  { label: '✗ 취소',      bg: 'rgba(239,68,68,0.12)',   fg: '#991b1b' },
}

// cafe24 사고 idno → 내부 ride_accident_id (dispatch 상세 페이지와 동일 로직)
function rideAccidentIdFromIdno(idno: string): number {
  return parseInt(String(idno).replace(/[^0-9]/g, '').slice(0, 9) || '0', 10)
}

// 사용자 명시 (2026-05-16): 「리스트 조회 로딩이 좀 있네」 「사고전체 리스트가 좀 더디네」
// 원인: 4 fetch (all=R / Y=R / N=R / all=C) × 7일 = 무거움
// 개선: 단일 fetch (dcyn=all, rgst=all) + client side filter
//        디폴트 기간 7일 → 3일 → PR-Y1: 「오늘」 (조회 딜레이 해소)
//        기간 넓힐 땐 오늘/3일/7일/30일/1년 퀵버튼 사용
export default function AccidentIntakeTab() {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKey>('dcyn_y')  // PR-Y1.1: 기본 「대차요청」 (사용자 명시)

  const [allRows, setAllRows] = useState<DispatchRequestRow[] | null>(null)
  const [orders, setOrders] = useState<DispatchOrder[]>([])  // PR-F — 우리 진행 dispatch_orders
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [startingKey, setStartingKey] = useState<string | null>(null)  // PR-F — 진행 버튼 중복 클릭 방지

  const todayYmd = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const threeDaysAgoYmd = useMemo(() => {
    const d = new Date(Date.now() - 3 * 24 * 3600 * 1000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const weekAgoYmd = useMemo(() => {
    const d = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const monthAgoYmd = useMemo(() => {
    const d = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const [fromDate, setFromDate] = useState<string>(todayYmd)  // PR-Y1: 기본 「오늘」 (조회 딜레이 해소 — 사용자 명시)
  const [toDate, setToDate] = useState<string>(todayYmd)
  const dateRange = useMemo(() => {
    const fmt = (s: string) => s.replace(/-/g, '')
    return { from: fmt(fromDate), to: fmt(toDate) }
  }, [fromDate, toDate])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const headers = await getAuthHeader()
      const params = new URLSearchParams({
        from: dateRange.from, to: dateRange.to, limit: '2000',
        dcyn: 'all', rgst: 'all',
      })
      // PR-F — cafe24 사고 + 우리 dispatch_orders 동시 fetch
      const [r1, r2] = await Promise.all([
        fetch(`/api/operations/cafe24-dispatch-requests?${params}`, { headers }).then((r) => r.json()).catch(() => ({})),
        fetch('/api/operations/dispatch-orders?limit=500', { headers }).then((r) => r.json()).catch(() => ({})),
      ])
      if (r1?.success && Array.isArray(r1.data)) {
        setAllRows(r1.data as DispatchRequestRow[])
      } else {
        setAllRows([])
        setErr(r1?.error || 'cafe24 미연결')
      }
      setOrders(Array.isArray(r2?.data) ? r2.data : [])
    } catch (e: any) {
      setAllRows([])
      setErr(e?.message || 'fetch 실패')
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    if (allRows === null && !loading && !err) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange])

  const refresh = useCallback(() => {
    setAllRows(null)
  }, [])
  const applyDate = useCallback((from: string, to: string) => {
    setFromDate(from); setToDate(to)
    setAllRows(null)
  }, [])

  // PR-F — cafe24 사고 키 → 우리 dispatch_order 매칭 맵
  const orderMap = useMemo(() => {
    const m = new Map<string, DispatchOrder>()
    for (const o of orders) {
      if (o.cafe24_otpt_idno && o.cafe24_otpt_mddt && o.cafe24_otpt_srno != null) {
        m.set(`${o.cafe24_otpt_idno}|${o.cafe24_otpt_mddt}|${o.cafe24_otpt_srno}`, o)
      }
    }
    return m
  }, [orders])

  // client-side filter — PR-S: 기본 'todo' = 미진행 (대차전환 안 한 사고)
  const data = useMemo(() => {
    if (!allRows) return { todo: [], all: [], dcyn_y: [], dcyn_n: [], closed: [] }
    const active = allRows.filter((r) => r.otptrgst === 'R')
    return {
      todo: active.filter((r) => !orderMap.has(`${r.otptidno}|${r.otptmddt}|${r.otptsrno}`)),
      all: active,
      dcyn_y: active.filter((r) => r.otptdcyn === 'Y'),
      dcyn_n: active.filter((r) => r.otptdcyn === 'N'),
      closed: allRows.filter((r) => r.otptrgst === 'C'),
    }
  }, [allRows, orderMap])

  const activeData = data[filter]
  const activeLoading = loading
  const activeErr = err

  // PR-F — 진행 버튼: dispatch_order 없으면 생성 후, 배차 모드로 상세 진입
  const startDispatch = useCallback(async (r: DispatchRequestRow, e: React.MouseEvent) => {
    e.stopPropagation()
    const key = `${r.otptidno}|${r.otptmddt}|${r.otptsrno}`
    const detailUrl = `/operations/dispatch/${r.otptidno}/${r.otptmddt}/${r.otptsrno}?mode=schedule`
    // 이미 dispatch_order 있으면 바로 상세
    if (orderMap.has(key)) {
      router.push(detailUrl)
      return
    }
    setStartingKey(key)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch('/api/operations/dispatch-orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ride_accident_id: rideAccidentIdFromIdno(r.otptidno),
          status: 'consulting',
          cafe24_otpt_idno: r.otptidno,
          cafe24_otpt_mddt: r.otptmddt,
          cafe24_otpt_srno: typeof r.otptsrno === 'string' ? parseInt(r.otptsrno, 10) : r.otptsrno,
        }),
      })
      await res.json().catch(() => ({}))
      // 성공/실패 무관 — 상세 페이지에서 dispatch_order 재조회/생성 가능
      router.push(detailUrl)
    } catch {
      router.push(detailUrl)
    } finally {
      setStartingKey(null)
    }
  }, [orderMap, router])

  const filtered = useMemo(() => {
    if (!search.trim()) return activeData
    const q = search.toLowerCase()
    return activeData.filter((r) =>
      (r.cars_no || '').toLowerCase().includes(q) ||
      (r.otptcanm || '').toLowerCase().includes(q) ||
      (r.otptdsnm || '').toLowerCase().includes(q) ||
      (r.cars_user || '').toLowerCase().includes(q) ||
      (r.rental_vendor || '').toLowerCase().includes(q) ||
      (r.factory_names || '').toLowerCase().includes(q) ||
      (r.capital_co_name || '').toLowerCase().includes(q) ||
      (r.otptidno || '').toLowerCase().includes(q) ||
      (r.otptacmo || '').toLowerCase().includes(q),
    )
  }, [activeData, search])

  const counts = {
    todo: data.todo.length,
    all: data.all.length,
    dcyn_y: data.dcyn_y.length,
    dcyn_n: data.dcyn_n.length,
    closed: data.closed.length,
  }

  const statItems: StatItem[] = [
    { label: '📋 전체 (활성)', value: counts.all, unit: '건', tint: 'blue' },
    { label: '🚗 대차요청', value: counts.dcyn_y, unit: '건', tint: 'red' },
    { label: '🚙 대차미요청', value: counts.dcyn_n, unit: '건', tint: 'amber' },
    { label: '✅ 종결', value: counts.closed, unit: '건', tint: 'green' },
    { label: '🔍 검색결과', value: filtered.length, unit: '건', tint: 'purple' },
  ]
  const statActions: ActionButton[] = [
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  // PR-Y1.2 (2026-05-24) — 사용자 명시: 「사고접수전체, 대차요청 두 개 탭만」
  //   → 필터칩 2개로 단순화 (미요청/종결 건수는 stat strip 으로 확인)
  const filterItems: FilterItem[] = [
    { key: 'all', label: '📋 사고접수 전체', count: counts.all },
    { key: 'dcyn_y', label: '🚗 대차요청', count: counts.dcyn_y },
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
      key: 'cars_model', label: '차종', width: 170,
      sortBy: (r) => r.cars_model || '',
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 170 }}>{r.cars_model || '-'}</span>,
    },
    {
      key: 'cars_user', label: '고객', width: 160,
      sortBy: (r) => r.cars_user || '',
      render: (r) => <span style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 160 }}>{r.cars_user || '-'}</span>,
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
      // PR-F — 우리 진행 상태 / 진행 버튼
      key: 'progress', label: '진행', width: 130, align: 'center',
      sortBy: (r) => {
        const o = orderMap.get(`${r.otptidno}|${r.otptmddt}|${r.otptsrno}`)
        return o ? o.status : 'zzz'  // 미진행을 뒤로
      },
      render: (r) => {
        const key = `${r.otptidno}|${r.otptmddt}|${r.otptsrno}`
        const o = orderMap.get(key)
        if (o) {
          const meta = ORDER_STATUS_META[o.status] || { label: o.status, bg: 'rgba(148,163,184,0.15)', fg: '#475569' }
          return (
            <span style={{
              display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800,
              whiteSpace: 'nowrap', background: meta.bg, color: meta.fg,
            }}>{meta.label}</span>
          )
        }
        // 미진행 — 진행 버튼 (대차사용/미사용 따라 라벨)
        const isY = r.otptdcyn === 'Y'
        const busy = startingKey === key
        return (
          <button
            onClick={(e) => startDispatch(r, e)}
            disabled={busy}
            style={{
              padding: '4px 10px', borderRadius: 7, border: 'none', cursor: busy ? 'wait' : 'pointer',
              fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
              background: isY ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #3b6eb5, #5a8fd4)',
              color: '#fff', opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? '⏳' : isY ? '🚗 대차 진행' : '→ 대차 전환'}
          </button>
        )
      },
    },
    {
      key: 'otptacmo', label: '사고내용', width: 300,
      sortBy: (r) => r.otptacmo || '',
      render: (r) => <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 300 }}>{r.otptacmo || '-'}</span>,
    },
  ]
  // PR-UX-SIMPLE — 캐피탈사·통보자·대차업체·배정공장·접수자 컬럼 제거 (상세 화면에서 확인, 검색은 계속 지원)

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
        placeholder="차량번호 / 통보자 / 운전자 / 고객 / 대차업체 / 배정공장 / 사고내용 검색…"
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
            <button onClick={() => applyDate(todayYmd, todayYmd)}
              style={{ padding: '6px 10px', background: 'transparent', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
            >오늘</button>
            <button onClick={() => applyDate(threeDaysAgoYmd, todayYmd)}
              style={{ padding: '6px 10px', background: 'transparent', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
            >3일</button>
            <button onClick={() => applyDate(weekAgoYmd, todayYmd)}
              style={{ padding: '6px 10px', background: 'transparent', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
            >7일</button>
            <button onClick={() => applyDate(monthAgoYmd, todayYmd)}
              style={{ padding: '6px 10px', background: 'transparent', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
            >30일</button>
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
