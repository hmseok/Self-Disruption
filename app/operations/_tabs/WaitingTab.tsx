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
// WaitingTab — PR-G (2026-05-16) 대기차량 탭
//
// 사용자 명시: 「대기차량 — 정비/세차 완료 후 가용 상태」
//
// 데이터: /api/operations/waiting-vehicles (cars 마스터 + fmi_rentals)
//   status — PR-X (2026-05-23) 단일 출처화. API 가 도출해서 내려줌:
//     rented   배차중   = 진행 중(dispatched) fmi_rental 보유 ← 단일 출처
//     returned 반납·점검 = cars.status='returned' 이며 배차중 아님
//     available 사용가능 = 그 외 (배차 가능)
//   → import / 대량작업으로 cars.status 가 어긋나도 다시 틀어지지 않음.
//
// 기능:
//   - 상태별 list + 필터
//   - 정비·점검 ↔ 사용가능 전환 (cars.status PATCH — 배차중은 회차 시 자동)
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

// PR-Y2 — cafe24 사고 idno → 내부 ride_accident_id (dispatch 상세와 동일 로직)
function rideAccidentIdFromIdno(idno: string): number {
  return parseInt(String(idno).replace(/[^0-9]/g, '').slice(0, 9) || '0', 10)
}
// PR-Y2 — 사고 매칭 모달 cafe24 조회 기간 (YYYYMMDD)
function ymd(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 3600 * 1000)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

type WaitingVehicle = {
  id: string
  number: string | null
  brand: string | null
  model: string | null
  trim: string | null
  year: number | null
  image_url: string | null
  status: string
  location: string | null
  mileage: number | null
}

type FilterKey = 'all' | 'available' | 'rented' | 'returned'

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  available: { label: '🟢 사용가능',  bg: 'rgba(34,197,94,0.12)',   fg: '#15803d' },
  rented:    { label: '🚗 배차중',    bg: 'rgba(239,68,68,0.12)',   fg: '#991b1b' },
  returned:  { label: '🔧 반납·점검', bg: 'rgba(245,158,11,0.12)',  fg: '#b45309' },
}

// PR-Y1 (2026-05-23) — lockStatus prop:
//   미지정    = 전체 (사용가능/배차중/반납점검 필터칩)
//   'available' = 「사용가능」 탭 전용 — 사용가능 차량만, 필터칩 숨김
//   'returned'  = 「반납점검」 탭 전용 — 정비 중 차량만, 필터칩 숨김
export default function WaitingTab({ lockStatus }: { lockStatus?: 'available' | 'returned' }) {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKey>(lockStatus || 'all')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<WaitingVehicle[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // PR-Y2 — 「이 차로 배차」: 차량 먼저 선택 → 사고 매칭 모달
  const [pickFor, setPickFor] = useState<WaitingVehicle | null>(null)
  const [accidents, setAccidents] = useState<DispatchRequestRow[] | null>(null)
  const [accOrders, setAccOrders] = useState<DispatchOrder[]>([])
  const [accLoading, setAccLoading] = useState(false)
  const [accSearch, setAccSearch] = useState('')
  const [startingKey, setStartingKey] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/operations/waiting-vehicles?status=all', { headers })
      const json = await res.json().catch(() => ({}))
      if (json?.success && Array.isArray(json.data)) {
        setRows(json.data as WaitingVehicle[])
      } else {
        setRows([])
        setErr(json?.error || '차량 조회 실패')
      }
    } catch (e: any) {
      setRows([])
      setErr(e?.message || 'fetch 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (rows === null && !loading) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(() => {
    setRows(null)
    fetchAll()
  }, [fetchAll])

  // 상태 전환 — cars.status PATCH
  const changeStatus = useCallback(async (v: WaitingVehicle, next: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setBusyId(v.id)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/cars/${v.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (json?.error) throw new Error(json.error)
      refresh()
    } catch {
      // 실패해도 조용히 — refresh 로 실제 상태 재확인
      refresh()
    } finally {
      setBusyId(null)
    }
  }, [refresh])

  // PR-Y2 — 「이 차로 배차」: 차량 선택 → 사고 매칭 모달 열기 (cafe24 대차요청 7일)
  const openPick = useCallback(async (v: WaitingVehicle, e: React.MouseEvent) => {
    e.stopPropagation()
    setPickFor(v)
    setAccSearch('')
    setAccidents(null)
    setAccLoading(true)
    try {
      const headers = await getAuthHeader()
      const [cRes, oRes] = await Promise.all([
        fetch(`/api/operations/cafe24-dispatch-requests?from=${ymd(7)}&to=${ymd(0)}&dcyn=Y&rgst=R&limit=500`, { headers }).then((r) => r.json()).catch(() => ({})),
        fetch('/api/operations/dispatch-orders?limit=500', { headers }).then((r) => r.json()).catch(() => ({})),
      ])
      setAccidents(Array.isArray(cRes?.data) ? cRes.data : [])
      setAccOrders(Array.isArray(oRes?.data) ? oRes.data : [])
    } catch {
      setAccidents([])
    } finally {
      setAccLoading(false)
    }
  }, [])

  // cafe24 사고키 → 우리 dispatch_order 매칭 (중복 생성 방지)
  const accOrderMap = useMemo(() => {
    const m = new Map<string, DispatchOrder>()
    for (const o of accOrders) {
      if (o.cafe24_otpt_idno && o.cafe24_otpt_mddt && o.cafe24_otpt_srno != null) {
        m.set(`${o.cafe24_otpt_idno}|${o.cafe24_otpt_mddt}|${o.cafe24_otpt_srno}`, o)
      }
    }
    return m
  }, [accOrders])

  const accFiltered = useMemo(() => {
    const list = accidents || []
    if (!accSearch.trim()) return list
    const q = accSearch.toLowerCase()
    return list.filter((a) =>
      (a.cars_no || '').toLowerCase().includes(q) ||
      (a.cars_user || '').toLowerCase().includes(q) ||
      (a.otptcanm || '').toLowerCase().includes(q) ||
      (a.otptcahp || '').toLowerCase().includes(q),
    )
  }, [accidents, accSearch])

  // 사고 선택 → dispatch_order 확보 후 배차 상세로 (차량 사전선택 ?vehicle=)
  const chooseAccident = useCallback(async (a: DispatchRequestRow) => {
    if (!pickFor) return
    const key = `${a.otptidno}|${a.otptmddt}|${a.otptsrno}`
    const detailUrl = `/operations/dispatch/${a.otptidno}/${a.otptmddt}/${a.otptsrno}?mode=schedule&vehicle=${encodeURIComponent(pickFor.id)}`
    if (accOrderMap.has(key)) {
      router.push(detailUrl)
      return
    }
    setStartingKey(key)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      await fetch('/api/operations/dispatch-orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ride_accident_id: rideAccidentIdFromIdno(a.otptidno),
          status: 'consulting',
          cafe24_otpt_idno: a.otptidno,
          cafe24_otpt_mddt: a.otptmddt,
          cafe24_otpt_srno: typeof a.otptsrno === 'string' ? parseInt(a.otptsrno, 10) : a.otptsrno,
        }),
      }).catch(() => {})
      router.push(detailUrl)
    } catch {
      router.push(detailUrl)
    } finally {
      setStartingKey(null)
    }
  }, [pickFor, accOrderMap, router])

  const allRows = rows || []
  const data = useMemo(() => ({
    all: allRows,
    available: allRows.filter((r) => r.status === 'available'),
    rented: allRows.filter((r) => r.status === 'rented'),
    returned: allRows.filter((r) => r.status === 'returned'),
  }), [allRows])

  const activeData = data[filter]
  const filtered = useMemo(() => {
    if (!search.trim()) return activeData
    const q = search.toLowerCase()
    return activeData.filter((r) =>
      (r.number || '').toLowerCase().includes(q) ||
      (r.brand || '').toLowerCase().includes(q) ||
      (r.model || '').toLowerCase().includes(q) ||
      (r.location || '').toLowerCase().includes(q),
    )
  }, [activeData, search])

  const counts = {
    all: allRows.length,
    available: data.available.length,
    rented: data.rented.length,
    returned: data.returned.length,
  }

  const statItems: StatItem[] = [
    { label: '🚙 보유 차량 전체', value: counts.all, unit: '대', tint: 'blue' },
    { label: '🟢 사용가능 (대기)', value: counts.available, unit: '대', tint: 'green' },
    { label: '🚗 배차중', value: counts.rented, unit: '대', tint: 'red' },
    { label: '🔧 반납·점검', value: counts.returned, unit: '대', tint: 'amber' },
    { label: '🔍 검색결과', value: filtered.length, unit: '대', tint: 'purple' },
  ]
  const statActions: ActionButton[] = [
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  // PR-Y1 — lockStatus 면 필터칩 숨김 (해당 상태 한 뷰만)
  const filterItems: FilterItem[] = lockStatus
    ? []
    : [
        { key: 'all', label: '🚙 전체', count: counts.all },
        { key: 'available', label: '🟢 사용가능', count: counts.available },
        { key: 'rented', label: '🚗 배차중', count: counts.rented },
        { key: 'returned', label: '🔧 반납·점검', count: counts.returned },
      ]

  const columns: TableColumn<WaitingVehicle>[] = [
    {
      key: 'number', label: '차량번호', width: 110,
      sortBy: (r) => r.number || '',
      render: (r) => <span style={{ fontWeight: 700, color: '#0f2440', whiteSpace: 'nowrap' }}>🚗 {r.number || '-'}</span>,
    },
    {
      key: 'model', label: '차종', width: 260,
      sortBy: (r) => `${r.brand || ''} ${r.model || ''}`,
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 260 }}>
        {[r.brand, r.model, r.trim].filter(Boolean).join(' ') || '-'}
      </span>,
    },
    {
      key: 'year', label: '연식', width: 70, align: 'center',
      sortBy: (r) => r.year ?? 0,
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{r.year ? `${r.year}` : '-'}</span>,
    },
    {
      key: 'status', label: '상태', width: 110, align: 'center',
      sortBy: (r) => r.status,
      render: (r) => {
        const meta = STATUS_META[r.status] || { label: r.status, bg: 'rgba(148,163,184,0.15)', fg: '#475569' }
        return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: meta.bg, color: meta.fg }}>{meta.label}</span>
      },
    },
    {
      key: 'location', label: '위치', width: 160,
      sortBy: (r) => r.location || '',
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 160 }}>{r.location || '-'}</span>,
    },
    {
      key: 'mileage', label: '주행거리', width: 100, align: 'right',
      sortBy: (r) => r.mileage ?? 0,
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{r.mileage != null ? `${Number(r.mileage).toLocaleString('ko-KR')}km` : '-'}</span>,
    },
    {
      // 작업 — 「이 차로 배차」 / 정비 전환
      key: 'action', label: '작업', width: 210, align: 'center',
      render: (r) => {
        const busy = busyId === r.id
        if (r.status === 'rented') {
          return <span style={{ fontSize: 11, color: '#cbd5e1', whiteSpace: 'nowrap' }}>회차 시 자동</span>
        }
        if (r.status === 'returned') {
          return (
            <button
              onClick={(e) => changeStatus(r, 'available', e)}
              disabled={busy}
              style={{
                padding: '4px 10px', borderRadius: 7, border: 'none', cursor: busy ? 'wait' : 'pointer',
                fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
                background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', opacity: busy ? 0.5 : 1,
              }}
            >
              {busy ? '⏳' : '✅ 점검완료 → 사용가능'}
            </button>
          )
        }
        // available — 「이 차로 배차」 (vehicle-first 진입) + 정비
        return (
          <span style={{ display: 'inline-flex', gap: 6, whiteSpace: 'nowrap' }}>
            <button
              onClick={(e) => openPick(r, e)}
              style={{
                padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff',
              }}
            >🚗 이 차로 배차</button>
            <button
              onClick={(e) => changeStatus(r, 'returned', e)}
              disabled={busy}
              style={{
                padding: '5px 9px', borderRadius: 7, cursor: busy ? 'wait' : 'pointer',
                fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                background: 'transparent', border: '1px solid rgba(245,158,11,0.4)', color: '#b45309',
                opacity: busy ? 0.5 : 1,
              }}
            >{busy ? '⏳' : '🔧 정비'}</button>
          </span>
        )
      },
    },
  ]

  const mobileCard: MobileCardConfig<WaitingVehicle> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>🚗 {r.number || r.id.slice(0, 8)}</span>,
    subtitle: (r) => `${STATUS_META[r.status]?.label || r.status} · ${[r.brand, r.model].filter(Boolean).join(' ')}`,
  }

  return (
    <div>
      <DcStatStrip stats={statItems} actions={statActions} />
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="차량번호 / 브랜드 / 모델 / 위치 검색…"
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
        loading={loading}
        emptyIcon="🚙"
        emptyMessage="보유 차량이 없습니다"
        mobileCard={mobileCard}
        defaultSort={{ key: 'status', dir: 'asc' }}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
        💡 「🚗 이 차로 배차」 — 차량을 먼저 고른 뒤 사고를 매칭해 배차를 시작합니다. · 「배차중」은 진행 중 배차에서 자동 도출 — 출고하면 배차중, 반납하면 자동 해제. · 「정비」 버튼은 정비 상태만 전환합니다.
      </div>

      {/* PR-Y2 — 「이 차로 배차」 사고 선택 모달 */}
      {pickFor && (
        <div
          onClick={() => setPickFor(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...GLASS.L5, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', width: 'min(680px, 96vw)', maxHeight: '86vh', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', margin: 0 }}>🚗 이 차로 배차 — 사고 선택</h3>
              <div style={{ flex: 1 }} />
              <button onClick={() => setPickFor(null)} aria-label="닫기"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
            </div>
            <div style={{ ...GLASS.L1, margin: '12px 20px 0', padding: '9px 12px', borderRadius: 8, fontSize: 12, color: '#475569' }}>
              선택 차량 — <b style={{ color: '#0f2440' }}>🚗 {pickFor.number || '-'}</b>
              {(pickFor.brand || pickFor.model) ? <span style={{ color: '#94a3b8' }}> · {[pickFor.brand, pickFor.model].filter(Boolean).join(' ')}</span> : null}
            </div>
            <div style={{ padding: '10px 20px 6px' }}>
              <input
                value={accSearch}
                onChange={(e) => setAccSearch(e.target.value)}
                placeholder="차량번호 / 고객 / 통보자 검색…"
                style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 12, color: '#1e293b' }}
              />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }}>
                최근 7일 대차요청 사고 — 사고를 선택하면 상담·배차 화면으로 이동하며 이 차량이 미리 배정됩니다.
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px' }}>
              {accLoading ? (
                <div style={{ textAlign: 'center', padding: '30px 0', fontSize: 12, color: '#94a3b8' }}>불러오는 중…</div>
              ) : accFiltered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', fontSize: 12, color: '#94a3b8' }}>최근 7일 대차요청 사고가 없습니다</div>
              ) : accFiltered.map((a) => {
                const key = `${a.otptidno}|${a.otptmddt}|${a.otptsrno}`
                const o = accOrderMap.get(key)
                const busy = startingKey === key
                return (
                  <button
                    key={key}
                    onClick={() => chooseAccident(a)}
                    disabled={busy}
                    style={{
                      ...GLASS.L1,
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      padding: '10px 12px', marginBottom: 6, borderRadius: 9, cursor: busy ? 'wait' : 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>{fmtCafe24DateTime(a.otptacdt, a.otptactm) || '-'}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#0f2440', whiteSpace: 'nowrap' }}>🚗 {a.cars_no || '-'}</span>
                    <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                      {a.cars_user || a.otptcanm || '-'}{a.otptcanm && a.otptcanm !== a.cars_user ? ` · 통보 ${a.otptcanm}` : ''}
                    </span>
                    {o ? <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: 'rgba(245,158,11,0.14)', color: '#b45309', whiteSpace: 'nowrap' }}>진행중</span> : null}
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca', whiteSpace: 'nowrap' }}>{busy ? '⏳' : '선택 →'}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
