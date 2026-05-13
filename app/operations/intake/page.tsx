'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import DcStatStrip, { StatItem, ActionButton } from '../../components/DcStatStrip'
import DcToolbar, { FilterItem } from '../../components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../../components/NeuDataTable'
import { GLASS } from '../../utils/ui-tokens'
import AccidentDetailFullscreen from './AccidentDetailFullscreen'
import DispatchRequestFullscreen from './DispatchRequestFullscreen'
import type {
  RichAccidentRow,
  DispatchRequestRow,
  ResultMsg,
} from './types'
import { fmtCafe24DateTime } from './types'

// ═══════════════════════════════════════════════════════════════════
// /operations/intake — 접수/오더 (PR-OPS-1.5b)
//
// Sub-tab 2개:
//   📋 사고접수 = /api/operations/cafe24-accidents (cafe24 어드민 전체 사고)
//   🚗 대차접수 = /api/operations/cafe24-dispatch-requests (otptdcyn='Y' 대차요청)
//
// 행 클릭:
//   사고접수 → AccidentDetailFullscreen (cafe24 어드민 스타일 read-only)
//   대차접수 → DispatchRequestFullscreen (sample 메시지 형식 + dispatch_order)
//
// 디자인 표준: PageTitle 자동 / DcStatStrip / DcToolbar / NeuDataTable
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

type SubTab = 'accidents' | 'dispatch'

const SUBTAB_LABEL: Record<SubTab, string> = {
  accidents: '📋 사고접수',
  dispatch: '🚗 대차접수',
}

// ═══ Page ══════════════════════════════════════════════════════════
export default function OperationsIntakePage() {
  const { company, role } = useApp()
  const [subTab, setSubTab] = useState<SubTab>('dispatch')   // 본업 대차접수 default

  // ── 사고접수 탭 state ──
  const [accidents, setAccidents] = useState<RichAccidentRow[]>([])
  const [accidentsLoading, setAccidentsLoading] = useState(false)
  const [accidentsErr, setAccidentsErr] = useState<string | null>(null)
  const [accidentsSearch, setAccidentsSearch] = useState('')
  const [selectedAccident, setSelectedAccident] = useState<RichAccidentRow | null>(null)

  // ── 대차접수 탭 state ──
  const [dispatches, setDispatches] = useState<DispatchRequestRow[]>([])
  const [dispatchesLoading, setDispatchesLoading] = useState(false)
  const [dispatchesErr, setDispatchesErr] = useState<string | null>(null)
  const [dispatchesSearch, setDispatchesSearch] = useState('')
  const [selectedDispatch, setSelectedDispatch] = useState<DispatchRequestRow | null>(null)

  // ── 공통 결과 메시지 ──
  const [resultMsg, setResultMsg] = useState<ResultMsg | null>(null)

  // ── Date range — 1년 ──
  const dateRange = useMemo(() => {
    const today = new Date()
    const oneYearAgo = new Date(today.getTime() - 365 * 24 * 3600 * 1000)
    const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    return { from: fmt(oneYearAgo), to: fmt(today) }
  }, [])

  // 탭별 fetch 완료 플래그 (무한 루프 회피)
  const [accidentsFetched, setAccidentsFetched] = useState(false)
  const [dispatchesFetched, setDispatchesFetched] = useState(false)

  // ── Fetch — 사고접수 ──
  const fetchAccidents = useCallback(async () => {
    setAccidentsLoading(true)
    setAccidentsErr(null)
    setAccidentsFetched(true)   // 무한 루프 회피
    try {
      const headers = await getAuthHeader()
      const params = new URLSearchParams({
        from: dateRange.from,
        to: dateRange.to,
        limit: '200',
      })
      const res = await fetch(`/api/operations/cafe24-accidents?${params}`, { headers })
      const json = await res.json().catch(() => ({}))
      if (json?.success && Array.isArray(json.data)) {
        setAccidents(json.data as RichAccidentRow[])
      } else {
        setAccidents([])
        setAccidentsErr(json?.error || 'cafe24 미연결')
      }
    } catch (e: any) {
      setAccidents([])
      setAccidentsErr(e?.message || 'fetch 실패')
    } finally {
      setAccidentsLoading(false)
    }
  }, [dateRange])

  // ── Fetch — 대차접수 ──
  const fetchDispatches = useCallback(async () => {
    setDispatchesLoading(true)
    setDispatchesErr(null)
    setDispatchesFetched(true)
    try {
      const headers = await getAuthHeader()
      const params = new URLSearchParams({
        from: dateRange.from,
        to: dateRange.to,
        limit: '200',
      })
      const res = await fetch(`/api/operations/cafe24-dispatch-requests?${params}`, { headers })
      const json = await res.json().catch(() => ({}))
      if (json?.success && Array.isArray(json.data)) {
        setDispatches(json.data as DispatchRequestRow[])
      } else {
        setDispatches([])
        setDispatchesErr(json?.error || 'cafe24 미연결')
      }
    } catch (e: any) {
      setDispatches([])
      setDispatchesErr(e?.message || 'fetch 실패')
    } finally {
      setDispatchesLoading(false)
    }
  }, [dateRange])

  // 탭별 lazy fetch — fetched flag 로 무한 루프 회피
  useEffect(() => {
    if (subTab === 'accidents' && !accidentsFetched) {
      fetchAccidents()
    } else if (subTab === 'dispatch' && !dispatchesFetched) {
      fetchDispatches()
    }
  }, [subTab, accidentsFetched, dispatchesFetched, fetchAccidents, fetchDispatches])

  // ── Filtered ──
  const filteredAccidents = useMemo(() => {
    let list = accidents
    if (accidentsSearch.trim()) {
      const q = accidentsSearch.toLowerCase()
      list = list.filter(r =>
        (r.cars_no || '').toLowerCase().includes(q) ||
        (r.esosusnm || '').toLowerCase().includes(q) ||
        (r.cars_user || '').toLowerCase().includes(q) ||
        (r.capital_co_name || '').toLowerCase().includes(q) ||
        (r.esosidno || '').toLowerCase().includes(q) ||
        (r.esosrstx || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [accidents, accidentsSearch])

  const filteredDispatches = useMemo(() => {
    let list = dispatches
    if (dispatchesSearch.trim()) {
      const q = dispatchesSearch.toLowerCase()
      list = list.filter(r =>
        (r.cars_no || '').toLowerCase().includes(q) ||
        (r.otptcanm || '').toLowerCase().includes(q) ||
        (r.otptdsnm || '').toLowerCase().includes(q) ||
        (r.cars_user || '').toLowerCase().includes(q) ||
        (r.rental_vendor || '').toLowerCase().includes(q) ||
        (r.capital_co_name || '').toLowerCase().includes(q) ||
        (r.otptidno || '').toLowerCase().includes(q) ||
        (r.otptacmo || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [dispatches, dispatchesSearch])

  // ── Stat items (활성 탭 기준) ──
  const statItems: StatItem[] = (subTab === 'accidents' ? [
    { label: '📋 사고접수 (1년)', value: accidents.length, unit: '건', tint: 'blue' },
    { label: '🚗 대차접수 (대조)', value: dispatches.length, unit: '건', tint: 'amber' },
    { label: '🔍 검색결과', value: filteredAccidents.length, unit: '건', tint: 'violet' },
  ] : [
    { label: '🚗 대차접수 (1년)', value: dispatches.length, unit: '건', tint: 'red' },
    { label: '📋 사고접수 (대조)', value: accidents.length, unit: '건', tint: 'blue' },
    { label: '🔍 검색결과', value: filteredDispatches.length, unit: '건', tint: 'violet' },
  ]) as StatItem[]

  const refreshActive = useCallback(() => {
    if (subTab === 'accidents') {
      setAccidentsFetched(false)
      fetchAccidents()
    } else {
      setDispatchesFetched(false)
      fetchDispatches()
    }
  }, [subTab, fetchAccidents, fetchDispatches])

  const statActions: ActionButton[] = [
    {
      label: '새로고침',
      onClick: refreshActive,
      variant: 'secondary',
      icon: '🔄',
    },
  ]

  const filterItems: FilterItem[] = [
    { key: 'accidents', label: SUBTAB_LABEL.accidents, count: accidents.length },
    { key: 'dispatch', label: SUBTAB_LABEL.dispatch, count: dispatches.length },
  ]

  // ── 사고접수 컬럼 (12 컬럼, Rule 18 sortBy 의무) ──
  const accidentColumns: TableColumn<RichAccidentRow>[] = [
    {
      key: 'date',
      label: '사고일시',
      width: 130,
      sortBy: (r) => `${r.esosacdt || ''}${r.esosactm || ''}`,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#1e293b', fontSize: 12 }}>
          {fmtCafe24DateTime(r.esosacdt, r.esosactm) || '-'}
        </span>
      ),
    },
    {
      key: 'esosidno',
      label: '접수번호',
      width: 100,
      sortBy: (r) => r.esosidno || '',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#0f2440', whiteSpace: 'nowrap' }}>
          {r.esosidno || '-'}
        </span>
      ),
    },
    {
      key: 'cars_no',
      label: '차량번호',
      width: 100,
      sortBy: (r) => r.cars_no || '',
      render: (r) => (
        <span style={{ fontWeight: 700, color: '#0f2440', whiteSpace: 'nowrap' }}>
          🚗 {r.cars_no || '-'}
        </span>
      ),
    },
    {
      key: 'cars_model',
      label: '차종',
      width: 180,
      sortBy: (r) => r.cars_model || '',
      render: (r) => (
        <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 180 }}>
          {r.cars_model || '-'}
        </span>
      ),
    },
    {
      key: 'capital_co_name',
      label: '캐피탈사',
      width: 120,
      sortBy: (r) => r.capital_co_name || '',
      render: (r) => (
        <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
          {r.capital_co_name || '-'}
        </span>
      ),
    },
    {
      key: 'cars_user',
      label: '고객',
      width: 160,
      sortBy: (r) => r.cars_user || '',
      render: (r) => (
        <span style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 160 }}>
          {r.cars_user || '-'}
        </span>
      ),
    },
    {
      key: 'esosusnm',
      label: '요청자',
      width: 130,
      sortBy: (r) => r.esosusnm || '',
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
          {r.esosusnm || '-'}
          {r.esosustl && <span style={{ marginLeft: 4, fontSize: 11, color: '#64748b' }}>{r.esosustl}</span>}
        </span>
      ),
    },
    {
      key: 'esosrstx',
      label: '사고메모',
      width: 200,
      sortBy: (r) => r.esosrstx || '',
      render: (r) => (
        <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 200 }}>
          {r.esosrstx || '-'}
        </span>
      ),
    },
    {
      key: 'esosrslt',
      label: '단계',
      width: 80,
      align: 'center',
      sortBy: (r) => r.esosrslt || '',
      render: (r) => {
        const label: Record<string, string> = { '1': '🆕 접수', '3': '✅ 종결' }
        return (
          <span style={{ fontSize: 11, color: '#0f2440', whiteSpace: 'nowrap', fontWeight: 700 }}>
            {label[r.esosrslt || ''] || r.esosrslt || '-'}
          </span>
        )
      },
    },
    {
      key: 'gnus_name',
      label: '등록자',
      width: 100,
      sortBy: (r) => r.gnus_name || '',
      render: (r) => (
        <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
          {r.gnus_name || r.esosgnus || '-'}
        </span>
      ),
    },
  ]

  // ── 대차접수 컬럼 (Rule 18 sortBy 의무) ──
  const dispatchColumns: TableColumn<DispatchRequestRow>[] = [
    {
      key: 'date',
      label: '접수일시',
      width: 130,
      sortBy: (r) => `${r.otptacdt || ''}${r.otptactm || ''}`,
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#1e293b', fontSize: 12 }}>
          {fmtCafe24DateTime(r.otptacdt, r.otptactm) || '-'}
        </span>
      ),
    },
    {
      key: 'otptidno',
      label: '접수번호',
      width: 100,
      sortBy: (r) => `${r.otptidno || ''}-${r.otptsrno}`,
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#0f2440', whiteSpace: 'nowrap' }}>
          {r.otptidno || '-'}/{r.otptsrno}
        </span>
      ),
    },
    {
      key: 'cars_no',
      label: '차량번호',
      width: 100,
      sortBy: (r) => r.cars_no || '',
      render: (r) => (
        <span style={{ fontWeight: 700, color: '#0f2440', whiteSpace: 'nowrap' }}>
          🚗 {r.cars_no || '-'}
        </span>
      ),
    },
    {
      key: 'cars_model',
      label: '차종',
      width: 180,
      sortBy: (r) => r.cars_model || '',
      render: (r) => (
        <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 180 }}>
          {r.cars_model || '-'}
        </span>
      ),
    },
    {
      key: 'capital_co_name',
      label: '캐피탈사',
      width: 120,
      sortBy: (r) => r.capital_co_name || '',
      render: (r) => (
        <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
          {r.capital_co_name || '-'}
        </span>
      ),
    },
    {
      key: 'cars_user',
      label: '고객',
      width: 160,
      sortBy: (r) => r.cars_user || '',
      render: (r) => (
        <span style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 160 }}>
          {r.cars_user || '-'}
        </span>
      ),
    },
    {
      key: 'otptcanm',
      label: '통보자',
      width: 130,
      sortBy: (r) => r.otptcanm || '',
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
          {r.otptcanm || '-'}
          {r.otptcahp && <span style={{ marginLeft: 4, fontSize: 11, color: '#64748b' }}>{r.otptcahp}</span>}
        </span>
      ),
    },
    {
      key: 'rental_vendor',
      label: '대차업체',
      width: 140,
      sortBy: (r) => r.rental_vendor || '',
      render: (r) => (
        <span style={{ fontSize: 12, color: '#0f2440', fontWeight: 700, whiteSpace: 'nowrap' }}>
          🏢 {r.rental_vendor || '-'}
        </span>
      ),
    },
    {
      key: 'otptacmo',
      label: '사고내용',
      width: 220,
      sortBy: (r) => r.otptacmo || '',
      render: (r) => (
        <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 220 }}>
          {r.otptacmo || '-'}
        </span>
      ),
    },
    {
      key: 'gnus_name',
      label: '접수자',
      width: 100,
      sortBy: (r) => r.gnus_name || '',
      render: (r) => (
        <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
          {r.gnus_name || r.otptgnus || '-'}
        </span>
      ),
    },
  ]

  // ── Mobile Card ──
  const accidentMobileCard: MobileCardConfig<RichAccidentRow> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>🚗 {r.cars_no || r.esosusnm || r.esosidno}</span>,
    subtitle: (r) => `${fmtCafe24DateTime(r.esosacdt, r.esosactm)} · ${r.capital_co_name || '-'}`,
  }

  const dispatchMobileCard: MobileCardConfig<DispatchRequestRow> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>🚗 {r.cars_no || r.otptcanm || r.otptidno}</span>,
    subtitle: (r) => `${fmtCafe24DateTime(r.otptacdt, r.otptactm)} · ${r.rental_vendor || '-'}`,
  }

  const activeLoading = subTab === 'accidents' ? accidentsLoading : dispatchesLoading
  const activeErr = subTab === 'accidents' ? accidentsErr : dispatchesErr
  const activeSearch = subTab === 'accidents' ? accidentsSearch : dispatchesSearch
  const setActiveSearch = subTab === 'accidents' ? setAccidentsSearch : setDispatchesSearch
  const placeholder = subTab === 'accidents'
    ? '차량번호 / 고객 / 요청자 / 캐피탈사 / 사고메모 검색…'
    : '차량번호 / 통보자 / 운전자 / 고객 / 대차업체 / 사고내용 검색…'

  return (
    <div className="page-bg">
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">
        {/* DcStatStrip */}
        <DcStatStrip stats={statItems} actions={statActions} />

        {/* Result Msg — Rule 20 글래스 패널 */}
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
            >×</button>
          </div>
        )}

        {/* Sub-tab via DcToolbar filters (검색 + 탭 통합) */}
        <DcToolbar
          search={activeSearch}
          onSearchChange={setActiveSearch}
          placeholder={placeholder}
          filters={filterItems}
          activeFilter={subTab}
          onFilterChange={(k) => setSubTab(k as SubTab)}
        />

        {/* 활성 탭 에러 */}
        {activeErr && (
          <div
            style={{
              ...GLASS.L3,
              marginBottom: 12,
              padding: 12,
              borderRadius: 10,
              border: '1px solid rgba(239,68,68,0.3)',
              fontSize: 12,
              color: '#991b1b',
            }}
          >
            ⚠ cafe24 미연결: {activeErr}
          </div>
        )}

        {/* 활성 탭 데이터 테이블 */}
        {subTab === 'accidents' ? (
          <NeuDataTable
            columns={accidentColumns}
            data={filteredAccidents}
            rowKey={(r) => `${r.esosidno}-${r.esossrno}`}
            onRowClick={(r) => setSelectedAccident(r)}
            loading={activeLoading}
            emptyIcon="📋"
            emptyMessage="조건에 맞는 사고접수가 없습니다"
            mobileCard={accidentMobileCard}
            defaultSort={{ key: 'date', dir: 'desc' }}
          />
        ) : (
          <NeuDataTable
            columns={dispatchColumns}
            data={filteredDispatches}
            rowKey={(r) => `${r.otptidno}-${r.otptmddt}-${r.otptsrno}`}
            onRowClick={(r) => setSelectedDispatch(r)}
            loading={activeLoading}
            emptyIcon="🚗"
            emptyMessage="조건에 맞는 대차접수가 없습니다"
            mobileCard={dispatchMobileCard}
            defaultSort={{ key: 'date', dir: 'desc' }}
          />
        )}

        {/* 풀스크린 모달 — 사고접수 */}
        {selectedAccident && (
          <AccidentDetailFullscreen
            row={selectedAccident}
            onClose={() => setSelectedAccident(null)}
          />
        )}

        {/* 풀스크린 모달 — 대차접수 */}
        {selectedDispatch && (
          <DispatchRequestFullscreen
            row={selectedDispatch}
            onClose={() => setSelectedDispatch(null)}
            onResult={(msg) => { setResultMsg(msg); setDispatchesFetched(false); fetchDispatches() }}
          />
        )}
      </div>
    </div>
  )
}
