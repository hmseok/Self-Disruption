'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import DcStatStrip, { StatItem, ActionButton } from '../../components/DcStatStrip'
import DcToolbar, { FilterItem } from '../../components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../../components/NeuDataTable'
import { GLASS } from '../../utils/ui-tokens'

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

// ── Types ─────────────────────────────────────────────────────────
type Cafe24Accident = {
  id: number              // negative pseudo id
  accidentNo: string
  accident_date: string
  accident_time: string
  accident_location: string
  driver_name: string
  driver_phone: string
  customer_car_number: string
  rental_car_number: string
  rental_car_model: string
  insurance_company: string
  insurance_claim_no: string
  repair_shop_name: string
  rental_from_date: string
  rental_to_date: string
  workflow_stage: string  // cafe24 mapping
  notes: string
}

type DispatchOrder = {
  id: string
  ride_accident_id: number
  consultation_note: string | null
  customer_request: string | null
  expected_dispatch_date: string | null
  expected_return_date: string | null
  status: 'new' | 'consulting' | 'scheduled' | 'dispatched' | 'done' | 'cancelled'
  assigned_to: string | null
  fmi_rental_id: string | null
  created_at: string
  updated_at: string
}

type MergedRow = Cafe24Accident & {
  dispatch_order?: DispatchOrder
  unified_stage: 'new' | 'consulting' | 'scheduled' | 'dispatched' | 'done'
}

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
  const [resultMsg, setResultMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // ── Fetch ────────────────────────────────────────────────────────
  const fetchCafe24 = useCallback(async () => {
    try {
      const params = new URLSearchParams({ days: '90', limit: '500' })
      const res = await fetch(`/api/cafe24/accidents?${params}`)
      if (!res.ok) { setCafe24Accidents([]); return }
      const data = await res.json()
      const records = Array.isArray(data) ? data : (data.records || data.data || [])
      const mapped: Cafe24Accident[] = records.map((r: any, idx: number) => {
        const fmtDate = (s: string) => s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : (s || '')
        const accNo = String(r.accidentNo || `pseudo-${idx}`)
        // ride_accident_id 매핑용 INT 추출 — accidentNo 의 숫자만
        const accNoInt = parseInt(accNo.replace(/[^0-9]/g, '').slice(0, 9) || '0', 10) || (idx + 1)
        return {
          id: accNoInt,
          accidentNo: accNo,
          accident_date: fmtDate(r.accidentDate || ''),
          accident_time: r.accidentTime ? `${r.accidentTime.slice(0, 2)}:${r.accidentTime.slice(2, 4)}` : '',
          accident_location: r.accidentLocation || '',
          driver_name: r.counterpartName || '',
          driver_phone: r.counterpartPhone || '',
          customer_car_number: r.counterpartVehicle || '',
          rental_car_number: r.rentalCarNo || '',
          rental_car_model: r.rentalCarModel || '',
          insurance_company: r.counterpartInsurance || '',
          insurance_claim_no: r.accidentNo || '',
          repair_shop_name: r.repairShopName || '',
          rental_from_date: fmtDate(r.rentalFromDate || ''),
          rental_to_date: fmtDate(r.rentalToDate || ''),
          workflow_stage: r.status || '',
          notes: r.accidentMemo || '',
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

        {/* 모달 — 사고 상세 + dispatch_order 폼 */}
        {selectedRow && (
          <IntakeModal
            row={selectedRow}
            onClose={() => setSelectedRow(null)}
            onResult={(msg) => { setResultMsg(msg); refresh() }}
          />
        )}
      </div>
    </div>
  )
}

// ═══ Modal Component ═════════════════════════════════════════════
function IntakeModal({
  row,
  onClose,
  onResult,
}: {
  row: MergedRow
  onClose: () => void
  onResult: (msg: { type: 'ok' | 'err'; text: string }) => void
}) {
  const existing = row.dispatch_order
  const [consultation, setConsultation] = useState(existing?.consultation_note || '')
  const [customerReq, setCustomerReq] = useState(existing?.customer_request || '')
  const [expDispatch, setExpDispatch] = useState(existing?.expected_dispatch_date || '')
  const [expReturn, setExpReturn] = useState(existing?.expected_return_date || '')
  const [status, setStatus] = useState<DispatchOrder['status']>(existing?.status || 'consulting')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      if (existing) {
        // PATCH
        const res = await fetch(`/api/operations/dispatch-orders/${existing.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            consultation_note: consultation,
            customer_request: customerReq,
            expected_dispatch_date: expDispatch || null,
            expected_return_date: expReturn || null,
            status,
          }),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        onResult({ type: 'ok', text: 'dispatch_order 수정 완료' })
      } else {
        // POST 신규
        const res = await fetch(`/api/operations/dispatch-orders`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ride_accident_id: row.id,
            consultation_note: consultation,
            customer_request: customerReq,
            expected_dispatch_date: expDispatch || null,
            expected_return_date: expReturn || null,
            status,
          }),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        onResult({ type: 'ok', text: 'dispatch_order 신설 완료' })
      }
      onClose()
    } catch (e: any) {
      onResult({ type: 'err', text: e.message || '저장 실패' })
    } finally {
      setBusy(false)
    }
  }

  const confirmDispatch = async () => {
    if (!existing) {
      onResult({ type: 'err', text: '먼저 저장 후 배차 확정 가능합니다' })
      return
    }
    if (!window.confirm('배차 확정 시 fmi_rentals 신규 row 가 생성됩니다. 진행할까요?')) return
    setBusy(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/operations/dispatch-orders/${existing.id}/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer_name: row.driver_name,
          customer_phone: row.driver_phone,
          customer_car_number: row.customer_car_number,
          insurance_company: row.insurance_company,
          insurance_claim_no: row.insurance_claim_no || row.accidentNo,
          dispatch_date: expDispatch || new Date().toISOString().slice(0, 10),
          expected_return_date: expReturn || null,
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      onResult({ type: 'ok', text: `배차 확정 완료 — fmi_rental ${json.mode === 'create' ? '신설' : '갱신'}` })
      onClose()
    } catch (e: any) {
      onResult({ type: 'err', text: e.message || '배차 확정 실패' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,36,64,0.4)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.L4,
          borderRadius: 18,
          padding: 24,
          maxWidth: 720,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 60px rgba(15,36,64,0.25)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#0f2440', margin: 0 }}>
              🚗 {row.customer_car_number || row.driver_name || row.accidentNo}
            </h2>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              사고일 {row.accident_date} · 접수번호 {row.accidentNo} · {row.insurance_company || '-'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, color: '#64748b' }}
          >
            ×
          </button>
        </div>

        {/* 사고 정보 read-only */}
        <div
          style={{
            background: 'rgba(248,250,252,0.8)',
            border: '1px solid rgba(0,0,0,0.05)',
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
            fontSize: 12,
            color: '#475569',
          }}
        >
          <Field label="고객" value={`${row.driver_name || '-'} · ${row.driver_phone || ''}`} />
          <Field label="사고 위치" value={row.accident_location || '-'} />
          <Field label="청구번호" value={row.insurance_claim_no || row.accidentNo} />
          {row.rental_car_number && (
            <Field label="기존 배차 (cafe24)" value={`${row.rental_car_number} ${row.rental_car_model || ''}`} />
          )}
          {row.notes && <Field label="메모" value={row.notes} />}
        </div>

        {/* dispatch_order 폼 */}
        <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0f2440', marginBottom: 10 }}>
          📝 상담 / 일정 입력
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <Input
            label="상담 내용"
            value={consultation}
            onChange={setConsultation}
            placeholder="고객 통화 내용 / 진행 상황"
            multiline
            cols={2}
          />
          <Input
            label="고객 요청사항"
            value={customerReq}
            onChange={setCustomerReq}
            placeholder="요청 차종 / 특이사항"
            multiline
            cols={2}
          />
          <Input label="예상 배차일" value={expDispatch} onChange={setExpDispatch} type="date" />
          <Input label="예상 반납일" value={expReturn} onChange={setExpReturn} type="date" />
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              상태
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as DispatchOrder['status'])}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 10,
                fontSize: 13,
                color: '#1e293b',
                ...GLASS.L1,
              }}
            >
              <option value="new">🆕 신규</option>
              <option value="consulting">📞 상담중</option>
              <option value="scheduled">📅 배차예정</option>
              <option value="done">✅ 종결</option>
              <option value="cancelled">✗ 취소</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 10,
              cursor: busy ? 'not-allowed' : 'pointer',
              color: '#475569',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={busy}
            style={{
              padding: '10px 18px',
              background: busy ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            💾 저장
          </button>
          {existing && existing.status !== 'dispatched' && existing.status !== 'done' && (
            <button
              onClick={confirmDispatch}
              disabled={busy}
              style={{
                padding: '10px 18px',
                background: busy ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                cursor: busy ? 'not-allowed' : 'pointer',
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              🚀 배차 확정
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══ Small UI helpers ═══════════════════════════════════════════
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'baseline' }}>
      <span style={{ minWidth: 100, color: '#94a3b8', fontWeight: 700 }}>{label}</span>
      <span style={{ color: '#1e293b', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  multiline,
  cols = 1,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'date'
  placeholder?: string
  multiline?: boolean
  cols?: number
}) {
  const baseStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 10,
    fontSize: 13,
    color: '#1e293b',
    ...GLASS.L1,
  }
  return (
    <div style={{ gridColumn: cols > 1 ? `span ${cols}` : undefined }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          style={{ ...baseStyle, resize: 'vertical', minHeight: 56 }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={baseStyle}
        />
      )}
    </div>
  )
}
