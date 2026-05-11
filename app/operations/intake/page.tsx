'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import DcStatStrip, { StatItem, ActionButton } from '../../components/DcStatStrip'
import DcToolbar, { FilterItem } from '../../components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../../components/NeuDataTable'
import { GLASS } from '../../utils/ui-tokens'
import IntakeModalV2 from './IntakeModalV2'
import type { Cafe24Accident, DispatchOrder, MergedRow, ResultMsg } from './types'

// ═══════════════════════════════════════════════════════════════════
// /operations/intake — 접수/오더 (PR-OPS-REDESIGN Phase 1.3)
//
// 외부 카페24 사고 데이터 + 우리 operations_dispatch_orders 통합.
// 배차담당자 워크플로우:
//   1. 신규 대차요청 (cafe24 사고 stage='replacement_requested' / 'accident_reported')
//   2. 상담 진행 (dispatch_order.status='new'|'consulting')
//   3. 배차 예정 (dispatch_order.status='scheduled')
//   4. 배차 확정 (dispatch_order.status='dispatched', fmi_rentals 연결)
//   5. 종결 (done / cancelled / cafe24 closed)
//
// 디자인 표준: PageTitle 자동 / DcStatStrip / DcToolbar / NeuDataTable
// Rule 17 모듈 책임 / Rule 18 sortBy 의무 / Rule 19 줄바꿈 최소화 / Rule 20 결과 글래스 패널
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

// ── Types ─── ./types.ts 에서 공유 ───────────────────────────────

const STAGE_LABEL: Record<string, string> = {
  new: '🆕 신규',
  consulting: '📞 상담중',
  scheduled: '📅 배차예정',
  dispatched: '🚐 배차완료',
  done: '✅ 종결',
}

const STAGE_TINT: Record<string, string> = {
  new: '#ef4444',
  consulting: '#f97316',
  scheduled: '#eab308',
  dispatched: '#3b82f6',
  done: '#10b981',
}

// ═══ Page ══════════════════════════════════════════════════════════
export default function OperationsIntakePage() {
  const { company, role } = useApp()
  const [cafe24Accidents, setCafe24Accidents] = useState<Cafe24Accident[]>([])
  const [dispatchOrders, setDispatchOrders] = useState<DispatchOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedRow, setSelectedRow] = useState<MergedRow | null>(null)
  const [resultMsg, setResultMsg] = useState<ResultMsg | null>(null)

  // ── Fetch ────────────────────────────────────────────────────────
  // cafe24 응답 (PR-OPS-REDESIGN P1.3 hotfix):
  //   { success: true, data: AccidentRow[] }
  //   AccidentRow: { esosidno, esosmddt, esossrno, esosacdt, esosactm,
  //                  esosrgst, esosrslt, esosrstx, esostypp, esosgnus,
  //                  cars_no, cars_model }
  //   detail endpoint (/api/cafe24/accidents/detail) 에서 위치/요청자 등 30+ 필드 가능
  const fetchCafe24 = useCallback(async () => {
    try {
      // limit 최대 200, from/to 는 YYYYMMDD
      const today = new Date()
      const oneYearAgo = new Date(today.getTime() - 365 * 24 * 3600 * 1000)
      const fmtYMD = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
      const params = new URLSearchParams({
        from: fmtYMD(oneYearAgo),
        to: fmtYMD(today),
        limit: '200',
      })
      const headers = await getAuthHeader()
      const res = await fetch(`/api/cafe24/accidents?${params}`, { headers })
      if (!res.ok) { setCafe24Accidents([]); return }
      const json = await res.json()
      const records = json?.data || []
      const fmtDate = (s: string) => s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : (s || '')
      const fmtTime = (s: string) => s && s.length >= 4 ? `${s.slice(0, 2)}:${s.slice(2, 4)}` : ''
      const mapped: Cafe24Accident[] = records.map((r: any, idx: number) => {
        const idno = String(r.esosidno || '')
        const idnoInt = parseInt(idno.replace(/[^0-9]/g, '').slice(0, 9) || '0', 10) || (idx + 1)
        // PR-OPS-1.4b — detail/memos 호출 키 보존
        const mddt = String(r.esosmddt || '')
        const srno = Number(r.esossrno || 0)
        return {
          id: idnoInt,
          esosidno: idno,
          esosmddt: mddt,
          esossrno: srno,
          accidentNo: idno || `pseudo-${idx}`,
          accident_date: fmtDate(r.esosacdt || r.esosmddt || ''),
          accident_time: fmtTime(r.esosactm || ''),
          accident_location: '',  // detail 호출 시 채움
          driver_name: '',  // detail 호출 시 채움
          driver_phone: '',
          customer_car_number: r.cars_no || '',
          rental_car_number: r.cars_no || '',
          rental_car_model: r.cars_model || '',
          insurance_company: '',  // cafe24 미보유 — dispatch_order 폼에서 매뉴얼
          insurance_claim_no: idno,
          repair_shop_name: '',
          rental_from_date: '',
          rental_to_date: '',
          workflow_stage: r.esosrgst || r.esosrslt || '',
          notes: r.esosrstx || '',
        }
      })
      setCafe24Accidents(mapped)
    } catch (e) {
      console.error('[intake fetchCafe24]', e)
      setCafe24Accidents([])
    }
  }, [])

  const fetchDispatchOrders = useCallback(async () => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/operations/dispatch-orders', { headers })
      const json = await res.json()
      setDispatchOrders(json.data || [])
    } catch (e) {
      console.error('[intake fetchDispatchOrders]', e)
      setDispatchOrders([])
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchCafe24(), fetchDispatchOrders()])
    setLoading(false)
  }, [fetchCafe24, fetchDispatchOrders])

  useEffect(() => { refresh() }, [refresh])

  // ── Merged data ──────────────────────────────────────────────────
  const merged: MergedRow[] = useMemo(() => {
    const dispatchByAcc = new Map<number, DispatchOrder>()
    dispatchOrders.forEach(d => dispatchByAcc.set(d.ride_accident_id, d))

    return cafe24Accidents.map(acc => {
      const dispatch = dispatchByAcc.get(acc.id)
      let unified_stage: MergedRow['unified_stage'] = 'new'
      if (dispatch) {
        if (dispatch.status === 'consulting') unified_stage = 'consulting'
        else if (dispatch.status === 'scheduled') unified_stage = 'scheduled'
        else if (dispatch.status === 'dispatched') unified_stage = 'dispatched'
        else if (dispatch.status === 'done' || dispatch.status === 'cancelled') unified_stage = 'done'
        else unified_stage = 'consulting'  // 'new' status = 상담 시작
      } else if (acc.workflow_stage === 'closed' || acc.workflow_stage === '90') {
        unified_stage = 'done'
      }
      return { ...acc, dispatch_order: dispatch, unified_stage }
    })
  }, [cafe24Accidents, dispatchOrders])

  // ── Stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const counts: Record<string, number> = { new: 0, consulting: 0, scheduled: 0, dispatched: 0, done: 0 }
    merged.forEach(r => { counts[r.unified_stage] = (counts[r.unified_stage] || 0) + 1 })
    return counts
  }, [merged])

  // ── Filtered ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = merged
    if (stageFilter !== 'all') list = list.filter(r => r.unified_stage === stageFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        (r.driver_name || '').toLowerCase().includes(q) ||
        (r.insurance_company || '').toLowerCase().includes(q) ||
        (r.customer_car_number || '').toLowerCase().includes(q) ||
        (r.accidentNo || '').toLowerCase().includes(q) ||
        (r.rental_car_number || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [merged, stageFilter, search])

  // ── Stat items + Actions ────────────────────────────────────────
  const statItems: StatItem[] = [
    { label: '🆕 신규 대차요청', value: stats.new || 0, unit: '건', tint: 'red' },
    { label: '📞 상담 진행', value: stats.consulting || 0, unit: '건', tint: 'amber' },
    { label: '📅 배차 예정', value: stats.scheduled || 0, unit: '건', tint: 'amber' },
    { label: '🚐 배차 완료', value: stats.dispatched || 0, unit: '건', tint: 'blue' },
    { label: '✅ 종결', value: stats.done || 0, unit: '건', tint: 'green' },
  ]

  const statActions: ActionButton[] = [
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]

  // ── Toolbar filters ─────────────────────────────────────────────
  const filterItems: FilterItem[] = [
    { key: 'all', label: '전체', count: merged.length },
    { key: 'new', label: '🆕 신규', count: stats.new || 0 },
    { key: 'consulting', label: '📞 상담중', count: stats.consulting || 0 },
    { key: 'scheduled', label: '📅 배차예정', count: stats.scheduled || 0 },
    { key: 'dispatched', label: '🚐 배차완료', count: stats.dispatched || 0 },
    { key: 'done', label: '✅ 종결', count: stats.done || 0 },
  ]

  // ── Table columns ───────────────────────────────────────────────
  const columns: TableColumn<MergedRow>[] = [
    {
      key: 'accident_date',
      label: '사고일',
      width: 110,
      sortBy: (r) => r.accident_date || '',
      render: (r) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{r.accident_date || '-'}</span>
          {r.accident_time && (
            <span style={{ marginLeft: 6, fontSize: 11, color: '#64748b' }}>{r.accident_time}</span>
          )}
        </div>
      ),
    },
    {
      key: 'accidentNo',
      label: '접수번호',
      width: 130,
      sortBy: (r) => r.accidentNo || '',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#0f2440', whiteSpace: 'nowrap' }}>
          {r.accidentNo || '-'}
        </span>
      ),
    },
    {
      key: 'driver',
      label: '고객',
      width: 160,
      sortBy: (r) => r.driver_name || '',
      render: (r) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 700, color: '#1e293b' }}>{r.driver_name || '-'}</span>
          {r.driver_phone && (
            <span style={{ marginLeft: 6, fontSize: 11, color: '#64748b' }}>{r.driver_phone}</span>
          )}
        </div>
      ),
    },
    {
      key: 'customer_car_number',
      label: '사고차량',
      width: 110,
      sortBy: (r) => r.customer_car_number || '',
      render: (r) => (
        <span style={{ fontWeight: 600, color: '#0f2440', whiteSpace: 'nowrap' }}>
          🚗 {r.customer_car_number || '-'}
        </span>
      ),
    },
    {
      key: 'insurance',
      label: '보험사',
      width: 120,
      sortBy: (r) => r.insurance_company || '',
      render: (r) => (
        <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
          🛡 {r.insurance_company || '-'}
        </span>
      ),
    },
    {
      key: 'stage',
      label: '처리 상태',
      width: 120,
      align: 'center',
      sortBy: (r) => r.unified_stage,
      render: (r) => (
        <span
          style={{
            display: 'inline-block',
            padding: '4px 10px',
            borderRadius: 8,
            background: STAGE_TINT[r.unified_stage] + '22',
            color: STAGE_TINT[r.unified_stage],
            fontWeight: 700,
            fontSize: 12,
            whiteSpace: 'nowrap',
          }}
        >
          {STAGE_LABEL[r.unified_stage]}
        </span>
      ),
    },
    {
      key: 'expected_dispatch',
      label: '예상 배차일',
      width: 110,
      sortBy: (r) => r.dispatch_order?.expected_dispatch_date || '',
      render: (r) => (
        <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
          {r.dispatch_order?.expected_dispatch_date || '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '액션',
      width: 80,
      align: 'center',
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); setSelectedRow(r) }}
          style={{
            padding: '4px 10px',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: 11,
            whiteSpace: 'nowrap',
          }}
        >
          처리
        </button>
      ),
    },
  ]

  // ── Mobile Card ─────────────────────────────────────────────────
  const mobileCard: MobileCardConfig<MergedRow> = {
    title: (r) => (
      <span style={{ whiteSpace: 'nowrap' }}>
        🚗 {r.customer_car_number || r.driver_name || r.accidentNo}
      </span>
    ),
    subtitle: (r) => `${r.accident_date} · ${r.insurance_company || '-'}`,
    trailing: (r) => (
      <span style={{ color: STAGE_TINT[r.unified_stage], fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>
        {STAGE_LABEL[r.unified_stage]}
      </span>
    ),
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="page-bg">
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">
        {/* DcStatStrip */}
        <DcStatStrip stats={statItems} actions={statActions} />

        {/* 결과 메시지 — Rule 20 글래스 패널 */}
        {resultMsg && (
          <div
            style={{
              marginBottom: 16,
              padding: 14,
              background: resultMsg.type === 'ok' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${resultMsg.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span style={{ fontWeight: 700, color: resultMsg.type === 'ok' ? '#065f46' : '#991b1b' }}>
              {resultMsg.type === 'ok' ? '✅' : '⚠️'} {resultMsg.text}
            </span>
            <button
              onClick={() => setResultMsg(null)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#64748b' }}
            >
              ×
            </button>
          </div>
        )}

        {/* DcToolbar */}
        <DcToolbar
          search={search}
          onSearchChange={setSearch}
          placeholder="고객명 / 차량번호 / 접수번호 / 보험사 검색..."
          filters={filterItems}
          activeFilter={stageFilter}
          onFilterChange={setStageFilter}
        />

        {/* NeuDataTable */}
        <NeuDataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.accidentNo}
          onRowClick={(r) => setSelectedRow(r)}
          loading={loading}
          emptyIcon="📋"
          emptyMessage="조건에 맞는 대차요청이 없습니다"
          mobileCard={mobileCard}
          defaultSort={{ key: 'accident_date', dir: 'desc' }}
        />

        {/* 모달 v2 — A 사고상세 / B 콜센터메모 / C 상담히스토리 / D 새상담 / E dispatch_order */}
        {selectedRow && (
          <IntakeModalV2
            row={selectedRow}
            onClose={() => setSelectedRow(null)}
            onResult={(msg) => { setResultMsg(msg); refresh() }}
          />
        )}
      </div>
    </div>
  )
}

