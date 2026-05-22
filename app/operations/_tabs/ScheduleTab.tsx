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
// ScheduleTab — PR-C1 (2026-05-16) 배차스케줄 list 모니터
//
// 사용자 명시:
//   「대차사용에서 사고내용을 보면서 상담을 이어나가면서
//    출고일정을 입력하는 과정이 UI/UX 적으로 심도 있는 고민 필요」
//   「C1, C2 쯤에 고객상담을 하는 내용도 있겠네요」
//
// PR-C1 범위 — list + 화면 골격만 (사용자 검수 후 PR-C2 진입):
//   - dispatch_orders 전체 fetch (cafe24 키 포함)
//   - cafe24-dispatch-requests fetch (dcyn=all, rgst=R, 7일)
//   - client side join: dispatch_order.cafe24_otpt_(idno+mddt+srno) → 사고 정보
//   - 상태별 필터: 전체 / 상담중 / 배차예정 / 배차완료
//   - 행 클릭 → /operations/dispatch/[idno]/[mddt]/[srno] (상세 페이지 재사용)
//
// PR-C2+ 단계 (다음 PR):
//   - 대기차량 선택 + 연결
//   - 사고요약 + 상담 + 일정폼 통합 화면
//   - 출고 처리 (사진/주행거리/메모)
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type FilterKey = 'all' | 'consulting' | 'scheduled' | 'dispatched'

// PR-C1 — 「회차완료(done)」 는 청구관리 탭 영역, 신규(new)/취소(cancelled) 는 별도
const VISIBLE_STAGES: DispatchOrder['status'][] = ['consulting', 'scheduled', 'dispatched']

const STATUS_META: Record<DispatchOrder['status'], { label: string; bg: string; fg: string }> = {
  new:        { label: '🆕 신규',     bg: 'rgba(148,163,184,0.15)', fg: '#475569' },
  consulting: { label: '📞 상담중',   bg: 'rgba(245,158,11,0.12)',  fg: '#b45309' },
  scheduled:  { label: '📅 배차예정', bg: 'rgba(99,102,241,0.12)',  fg: '#4338ca' },
  dispatched: { label: '🚐 배차완료', bg: 'rgba(34,197,94,0.12)',   fg: '#15803d' },
  done:       { label: '✅ 회차완료', bg: 'rgba(148,163,184,0.15)', fg: '#475569' },
  cancelled:  { label: '✗ 취소',      bg: 'rgba(239,68,68,0.12)',   fg: '#991b1b' },
}

// 사고 ↔ dispatch_order 결합 row (client side join)
type MergedRow = {
  order: DispatchOrder
  cafe24: DispatchRequestRow | null  // 매칭 안 되면 null
  // 표시용 derived
  key: string
}

export default function ScheduleTab() {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')

  const [orders, setOrders] = useState<DispatchOrder[] | null>(null)
  const [accidents, setAccidents] = useState<DispatchRequestRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const todayYmd = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const monthAgoYmd = useMemo(() => {
    const d = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const [fromDate, setFromDate] = useState<string>(monthAgoYmd)  // 배차는 더 긴 기간 — 30일 기본
  const [toDate, setToDate] = useState<string>(todayYmd)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const headers = await getAuthHeader()
      const from = fromDate.replace(/-/g, '')
      const to = toDate.replace(/-/g, '')
      // dispatch_orders 는 limit 500 충분
      // cafe24 는 ScheduleTab 의 기간 (30일) 으로
      const [r1, r2] = await Promise.all([
        fetch('/api/operations/dispatch-orders?limit=500', { headers }).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/operations/cafe24-dispatch-requests?from=${from}&to=${to}&dcyn=all&rgst=all&limit=2000`, { headers }).then((r) => r.json()).catch(() => ({})),
      ])
      setOrders(Array.isArray(r1?.data) ? r1.data : [])
      if (r2?.success && Array.isArray(r2.data)) {
        setAccidents(r2.data)
      } else {
        setAccidents([])
        if (r2?.error) setErr(`cafe24: ${r2.error}`)
      }
    } catch (e: any) {
      setErr(e?.message || 'fetch 실패')
      setOrders([])
      setAccidents([])
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate])

  useEffect(() => {
    if (orders === null && !loading) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(() => {
    setOrders(null); setAccidents(null)
    fetchAll()
  }, [fetchAll])

  const applyDate = useCallback((from: string, to: string) => {
    setFromDate(from); setToDate(to)
    setOrders(null); setAccidents(null)
  }, [])

  useEffect(() => {
    if (orders === null && accidents === null) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate])

  // client side join — cafe24_otpt_(idno+mddt+srno) 키로 매칭
  const merged = useMemo<MergedRow[]>(() => {
    if (!orders) return []
    const accMap = new Map<string, DispatchRequestRow>()
    for (const a of accidents || []) {
      const k = `${a.otptidno}|${a.otptmddt}|${a.otptsrno}`
      accMap.set(k, a)
    }
    return orders
      .filter((o) => VISIBLE_STAGES.includes(o.status))
      .map((o) => {
        const k = `${o.cafe24_otpt_idno || ''}|${o.cafe24_otpt_mddt || ''}|${o.cafe24_otpt_srno || ''}`
        return {
          order: o,
          cafe24: accMap.get(k) || null,
          key: o.id,
        }
      })
  }, [orders, accidents])

  // 4-way client filter
  const data = useMemo(() => {
    return {
      all: merged,
      consulting: merged.filter((r) => r.order.status === 'consulting'),
      scheduled:  merged.filter((r) => r.order.status === 'scheduled'),
      dispatched: merged.filter((r) => r.order.status === 'dispatched'),
    }
  }, [merged])

  const activeData = data[filter]
  const filtered = useMemo(() => {
    if (!search.trim()) return activeData
    const q = search.toLowerCase()
    return activeData.filter((r) =>
      (r.cafe24?.cars_no || '').toLowerCase().includes(q) ||
      (r.cafe24?.otptcanm || '').toLowerCase().includes(q) ||
      (r.cafe24?.otptdsnm || '').toLowerCase().includes(q) ||
      (r.cafe24?.cars_user || '').toLowerCase().includes(q) ||
      (r.cafe24?.rental_vendor || '').toLowerCase().includes(q) ||
      (r.cafe24?.otptacmo || '').toLowerCase().includes(q) ||
      (r.order.consultation_note || '').toLowerCase().includes(q),
    )
  }, [activeData, search])

  const counts = {
    all: merged.length,
    consulting: data.consulting.length,
    scheduled: data.scheduled.length,
    dispatched: data.dispatched.length,
  }

  const statItems: StatItem[] = [
    { label: '📋 진행 중 전체', value: counts.all, unit: '건', tint: 'blue' },
    { label: '📞 상담중', value: counts.consulting, unit: '건', tint: 'amber' },
    { label: '📅 배차예정', value: counts.scheduled, unit: '건', tint: 'purple' },
    { label: '🚐 배차완료', value: counts.dispatched, unit: '건', tint: 'green' },
    { label: '🔍 검색결과', value: filtered.length, unit: '건', tint: 'blue' },
  ]
  const statActions: ActionButton[] = [
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  const filterItems: FilterItem[] = [
    { key: 'all', label: '📋 전체', count: counts.all },
    { key: 'consulting', label: '📞 상담중', count: counts.consulting },
    { key: 'scheduled', label: '📅 배차예정', count: counts.scheduled },
    { key: 'dispatched', label: '🚐 배차완료', count: counts.dispatched },
  ]

  const columns: TableColumn<MergedRow>[] = [
    {
      key: 'created', label: '접수일시', width: 130,
      sortBy: (r) => `${r.cafe24?.otptacdt || ''}${r.cafe24?.otptactm || ''}${r.order.created_at}`,
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#1e293b', fontSize: 12 }}>
        {fmtCafe24DateTime(r.cafe24?.otptacdt ?? null, r.cafe24?.otptactm ?? null) || (r.order.created_at?.slice(0, 16).replace('T', ' ')) || '-'}
      </span>,
    },
    {
      key: 'status', label: '상태', width: 110, align: 'center',
      sortBy: (r) => r.order.status,
      render: (r) => {
        const meta = STATUS_META[r.order.status]
        return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: meta.bg, color: meta.fg }}>{meta.label}</span>
      },
    },
    {
      key: 'cars_no', label: '차량번호', width: 100,
      sortBy: (r) => r.cafe24?.cars_no || '',
      render: (r) => <span style={{ fontWeight: 700, color: '#0f2440', whiteSpace: 'nowrap' }}>🚗 {r.cafe24?.cars_no || '-'}</span>,
    },
    {
      key: 'cars_model', label: '차종', width: 220,
      sortBy: (r) => r.cafe24?.cars_model || '',
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 220 }}>{r.cafe24?.cars_model || '-'}</span>,
    },
    {
      key: 'cars_user', label: '고객', width: 140,
      sortBy: (r) => r.cafe24?.cars_user || '',
      render: (r) => <span style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 140 }}>{r.cafe24?.cars_user || '-'}</span>,
    },
    {
      key: 'exp_dispatch', label: '출고예상', width: 110,
      sortBy: (r) => r.order.expected_dispatch_date || '9999',
      render: (r) => r.order.expected_dispatch_date
        ? <span style={{ fontSize: 12, color: '#0f2440', whiteSpace: 'nowrap', fontWeight: 600 }}>{r.order.expected_dispatch_date.slice(0, 10)}</span>
        : <span style={{ fontSize: 11, color: '#cbd5e1', whiteSpace: 'nowrap' }}>미정</span>,
    },
    {
      key: 'exp_return', label: '반납예상', width: 110,
      sortBy: (r) => r.order.expected_return_date || '9999',
      render: (r) => r.order.expected_return_date
        ? <span style={{ fontSize: 12, color: '#0f2440', whiteSpace: 'nowrap', fontWeight: 600 }}>{r.order.expected_return_date.slice(0, 10)}</span>
        : <span style={{ fontSize: 11, color: '#cbd5e1', whiteSpace: 'nowrap' }}>미정</span>,
    },
    {
      key: 'rental_vendor', label: '대차업체', width: 130,
      sortBy: (r) => r.cafe24?.rental_vendor || '',
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{r.cafe24?.rental_vendor || '-'}</span>,
    },
    {
      key: 'summary', label: '사고요약', width: 280,
      sortBy: (r) => r.cafe24?.otptacmo || '',
      render: (r) => <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 280 }}>
        {r.cafe24?.otptacmo || r.order.consultation_note || '-'}
      </span>,
    },
  ]

  const mobileCard: MobileCardConfig<MergedRow> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>🚗 {r.cafe24?.cars_no || r.cafe24?.otptcanm || r.order.id.slice(0, 8)}</span>,
    subtitle: (r) => `${STATUS_META[r.order.status].label} · ${r.cafe24?.cars_model || ''}`,
  }

  return (
    <div>
      <DcStatStrip stats={statItems} actions={statActions} />
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="차량번호 / 통보자 / 운전자 / 고객 / 대차업체 / 사고내용 / 상담메모 검색…"
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
          </div>
        }
      />
      {err && (
        <div style={{ ...GLASS.L3, marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(245,158,11,0.3)', fontSize: 12, color: '#b45309' }}>
          ⚠ 일부 정보 표시 제한: {err} (배차 진행 건은 정상 표시됩니다)
        </div>
      )}
      <NeuDataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.key}
        onRowClick={(r) => {
          // PR-C1 단계 — 행 클릭 시 사고 상세 페이지로 이동 (PR-C2 에서 배차 처리 화면 신설 예정)
          const idno = r.order.cafe24_otpt_idno || r.cafe24?.otptidno
          const mddt = r.order.cafe24_otpt_mddt || r.cafe24?.otptmddt
          const srno = r.order.cafe24_otpt_srno || r.cafe24?.otptsrno
          if (idno && mddt && srno) {
            // PR-C2a: ?mode=schedule 로 진입 시 하단 sticky 배차 처리 패널 자동 펼침
            router.push(`/operations/dispatch/${idno}/${mddt}/${srno}?mode=schedule`)
          }
        }}
        loading={loading}
        emptyIcon="📅"
        emptyMessage="진행 중인 배차 일정이 없습니다"
        mobileCard={mobileCard}
        defaultSort={{ key: 'created', dir: 'desc' }}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
        💡 행을 클릭하면 사고 상세 화면이 열리고, 하단 배차 처리 패널에서 대기차량 배정·상담·일정을 이어서 진행할 수 있습니다.
      </div>
    </div>
  )
}
