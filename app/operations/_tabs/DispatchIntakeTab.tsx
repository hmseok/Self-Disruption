'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS } from '@/app/utils/ui-tokens'
import type { DispatchRequestRow, DispatchOrder } from '@/app/operations/intake/types'
import { fmtCafe24DateTime } from '@/app/operations/intake/types'

// ═══════════════════════════════════════════════════════════════════
// DispatchIntakeTab — P2.1c 재구성 (2026-05-16)
//
// 사용자 명시: 「대차접수에 대차요청건은 자동으로 다 리스트 표출」
//
// Source 변경:
//   기존: operations_dispatch_orders (우리 시스템 자체 등록만)
//   신:   cafe24-dispatch-requests?dcyn=Y (카페24 대차요청 전체)
//        + operations_dispatch_orders LEFT MERGE (우리 진행 상태 배지)
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

const STATUS_BADGE: Record<DispatchOrder['status'] | 'none', { label: string; bg: string; color: string }> = {
  none:       { label: '⏳ 미진행',      bg: 'rgba(148,163,184,0.15)', color: '#475569' },
  new:        { label: '🆕 신규',        bg: 'rgba(148,163,184,0.15)', color: '#475569' },
  consulting: { label: '📞 상담중',      bg: 'rgba(59,130,246,0.12)',  color: '#1d4ed8' },
  scheduled:  { label: '📅 배차예정',    bg: 'rgba(245,158,11,0.12)',  color: '#b45309' },
  dispatched: { label: '🚐 배차완료',    bg: 'rgba(34,197,94,0.12)',   color: '#15803d' },
  done:       { label: '✅ 종결',        bg: 'rgba(99,102,241,0.12)',  color: '#4338ca' },
  cancelled:  { label: '✗ 취소',         bg: 'rgba(239,68,68,0.12)',   color: '#991b1b' },
}

type DispatchRowMerged = DispatchRequestRow & {
  our_status: DispatchOrder['status'] | 'none'
}

export default function DispatchIntakeTab() {
  const router = useRouter()
  const [rows, setRows] = useState<DispatchRowMerged[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const todayYmd = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const weekAgoYmd = useMemo(() => {
    const d = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const [fromDate, setFromDate] = useState<string>(weekAgoYmd)
  const [toDate, setToDate] = useState<string>(todayYmd)
  const dateRange = useMemo(() => {
    const fmt = (s: string) => s.replace(/-/g, '')
    return { from: fmt(fromDate), to: fmt(toDate) }
  }, [fromDate, toDate])

  const fetchData = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const headers = await getAuthHeader()
      // 1. cafe24 대차요청 전체 (dcyn=Y)
      const params = new URLSearchParams({
        from: dateRange.from, to: dateRange.to, limit: '1000', dcyn: 'Y', rgst: 'R',
      })
      const [cafeRes, orderRes] = await Promise.all([
        fetch(`/api/operations/cafe24-dispatch-requests?${params}`, { headers }),
        fetch('/api/operations/dispatch-orders?limit=1000', { headers }),
      ])
      const cafeJson = await cafeRes.json().catch(() => ({}))
      const orderJson = await orderRes.json().catch(() => ({}))

      if (!cafeJson?.success) {
        setErr(cafeJson?.error || 'cafe24 미연결')
        setRows([])
        return
      }
      const cafeRows: DispatchRequestRow[] = Array.isArray(cafeJson.data) ? cafeJson.data : []
      const orders: DispatchOrder[] = Array.isArray(orderJson?.data) ? orderJson.data : []

      // 매핑: cafe24 row 의 ride_accident_id (idno 숫자 9자리) 와 매칭
      const orderByKey = new Map<string, DispatchOrder>()
      orders.forEach((o) => {
        if (o.cafe24_otpt_idno && o.cafe24_otpt_mddt && o.cafe24_otpt_srno) {
          // 정확 매칭 (cafe24 키)
          const k = `${o.cafe24_otpt_idno}/${o.cafe24_otpt_mddt}/${o.cafe24_otpt_srno}`
          orderByKey.set(k, o)
        }
        // fallback: ride_accident_id 만
        const idnoKey = `idno:${o.ride_accident_id}`
        if (!orderByKey.has(idnoKey)) orderByKey.set(idnoKey, o)
      })

      const merged: DispatchRowMerged[] = cafeRows.map((r) => {
        const k = `${r.otptidno}/${r.otptmddt}/${r.otptsrno}`
        const idnoKey = `idno:${parseInt(String(r.otptidno).replace(/[^0-9]/g, '').slice(0, 9) || '0', 10)}`
        const o = orderByKey.get(k) || orderByKey.get(idnoKey)
        return {
          ...r,
          our_status: o?.status || 'none',
        }
      })
      setRows(merged)
    } catch (e: any) {
      setErr(e?.message || 'fetch 실패')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => { fetchData() }, [fetchData])

  const applyDate = (from: string, to: string) => { setFromDate(from); setToDate(to) }

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((r) =>
      (r.cars_no || '').toLowerCase().includes(q) ||
      (r.otptcanm || '').toLowerCase().includes(q) ||
      (r.otptdsnm || '').toLowerCase().includes(q) ||
      (r.cars_user || '').toLowerCase().includes(q) ||
      (r.rental_vendor || '').toLowerCase().includes(q) ||
      (r.capital_co_name || '').toLowerCase().includes(q) ||
      (r.otptidno || '').toLowerCase().includes(q) ||
      (r.otptacmo || '').toLowerCase().includes(q),
    )
  }, [rows, search])

  const counts = useMemo(() => {
    const c = { total: rows.length, our_progress: 0, our_done: 0, our_none: 0 }
    rows.forEach((r) => {
      if (r.our_status === 'none') c.our_none += 1
      else if (r.our_status === 'done' || r.our_status === 'cancelled') c.our_done += 1
      else c.our_progress += 1
    })
    return c
  }, [rows])

  const statItems: StatItem[] = [
    { label: '🚗 대차요청 (cafe24)', value: counts.total, unit: '건', tint: 'red' },
    { label: '📞 우리 진행중', value: counts.our_progress, unit: '건', tint: 'amber' },
    { label: '✅ 우리 종결', value: counts.our_done, unit: '건', tint: 'green' },
    { label: '⏳ 우리 미진행', value: counts.our_none, unit: '건', tint: 'slate' },
    { label: '🔍 검색결과', value: filtered.length, unit: '건', tint: 'purple' },
  ]
  const statActions: ActionButton[] = [
    { label: '새로고침', onClick: fetchData, variant: 'secondary', icon: '🔄' },
  ]

  const columns: TableColumn<DispatchRowMerged>[] = [
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
      key: 'cars_model', label: '차종', width: 240,
      sortBy: (r) => r.cars_model || '',
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 240 }}>{r.cars_model || '-'}</span>,
    },
    {
      key: 'capital_co_name', label: '캐피탈사', width: 120,
      sortBy: (r) => r.capital_co_name || '',
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{r.capital_co_name || '-'}</span>,
    },
    {
      key: 'cars_user', label: '고객', width: 180,
      sortBy: (r) => r.cars_user || '',
      render: (r) => <span style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 180 }}>{r.cars_user || '-'}</span>,
    },
    {
      key: 'otptcanm', label: '통보자', width: 140,
      sortBy: (r) => r.otptcanm || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{r.otptcanm || '-'}{r.otptcahp && <span style={{ marginLeft: 4, fontSize: 11, color: '#64748b' }}>{r.otptcahp}</span>}</span>,
    },
    {
      key: 'rental_vendor', label: '대차업체', width: 140,
      sortBy: (r) => r.rental_vendor || '',
      render: (r) => <span style={{ fontSize: 12, color: '#0f2440', whiteSpace: 'nowrap' }}>{r.rental_vendor || '-'}</span>,
    },
    {
      key: 'our_status', label: '우리 진행', width: 110, align: 'center',
      sortBy: (r) => r.our_status,
      render: (r) => {
        const meta = STATUS_BADGE[r.our_status]
        return <span style={{
          display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800,
          background: meta.bg, color: meta.color, whiteSpace: 'nowrap',
        }}>{meta.label}</span>
      },
    },
    {
      key: 'otptacmo', label: '사고내용', width: 320,
      sortBy: (r) => r.otptacmo || '',
      render: (r) => <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 320 }}>{r.otptacmo || '-'}</span>,
    },
    {
      key: 'gnus_name', label: '접수자', width: 100,
      sortBy: (r) => r.gnus_name || '',
      render: (r) => <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{r.gnus_name || r.otptgnus || '-'}</span>,
    },
  ]

  const mobileCard: MobileCardConfig<DispatchRowMerged> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>🚗 {r.cars_no || r.otptcanm || r.otptidno}</span>,
    subtitle: (r) => `${fmtCafe24DateTime(r.otptacdt, r.otptactm)} · ${STATUS_BADGE[r.our_status].label} · ${r.rental_vendor || '-'}`,
  }

  return (
    <div>
      <DcStatStrip stats={statItems} actions={statActions} />
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="차량번호 / 통보자 / 운전자 / 고객 / 대차업체 / 사고내용 검색…"
        trailing={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#475569' }}>
            <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>📅</span>
            <input type="date" value={fromDate} onChange={(e) => applyDate(e.target.value, toDate)}
              style={{ ...GLASS.L1, padding: '6px 8px', borderRadius: 8, fontSize: 12, color: '#1e293b' }} />
            <span style={{ color: '#94a3b8' }}>~</span>
            <input type="date" value={toDate} onChange={(e) => applyDate(fromDate, e.target.value)}
              style={{ ...GLASS.L1, padding: '6px 8px', borderRadius: 8, fontSize: 12, color: '#1e293b' }} />
            <button onClick={() => applyDate(weekAgoYmd, todayYmd)}
              style={{ padding: '6px 10px', background: 'transparent', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
            >7일</button>
            <button onClick={() => {
                const d = new Date(Date.now() - 30 * 24 * 3600 * 1000)
                const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                applyDate(y, todayYmd)
              }}
              style={{ padding: '6px 10px', background: 'transparent', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
            >30일</button>
          </div>
        }
      />
      {err && (
        <div style={{ ...GLASS.L3, marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#991b1b' }}>
          ⚠ cafe24 미연결: {err}
        </div>
      )}
      <NeuDataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => `${r.otptidno}-${r.otptmddt}-${r.otptsrno}`}
        onRowClick={(r) => router.push(`/operations/dispatch/${r.otptidno}/${r.otptmddt}/${r.otptsrno}`)}
        loading={loading}
        emptyIcon="🚗"
        emptyMessage="조건에 맞는 대차요청이 없습니다"
        mobileCard={mobileCard}
        defaultSort={{ key: 'date', dir: 'desc' }}
      />
    </div>
  )
}
