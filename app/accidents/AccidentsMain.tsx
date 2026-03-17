'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'

// ============================================
// Types
// ============================================
type Accident = {
  accidentNo: string; staffId: string; receiptDate: string; seqNo: string
  accidentDate: string; accidentTime: string; accidentLocation: string
  accidentMemo: string; faultRate: string; repairShopName: string; repairShopPhone: string
  deliveryMemo: string; counterpartName: string; counterpartPhone: string
  counterpartVehicle: string; counterpartInsurance: string
  towingYn: string; towingCompany: string; towingPhone: string
  handoverName: string; handoverPhone: string
  status: string; settlementYn: string; rentalYn: string; returnYn: string
  regStatus: string; category: string; regType: string; completeYn: string
  deductYn: string; createdBy: string; createdDate: string; createdTime: string
  updatedBy: string; updatedDate: string; updatedTime: string
  rentalCarNo: string; rentalCarModel: string; rentalFromDate: string
  rentalFromTime: string; rentalToDate: string; rentalToTime: string
  rentalStatus: string; rentalType: string; rentalFactory: string; rentalMemo: string
  rentalDailyCost: string; rentalTotalCost: string; rentalDays: string
  vehicleNo: string; vehicleName: string; insuranceCode: string; insuranceName: string
  examType: string; accidentNote: string; damageArea: string; damageDetail: string
  repairCost: string; insuranceCost: string
}

type ConsultMemo = {
  staffId: string; receiptDate: string; seqNo: string; lineNo: string
  memoDate: string; memoTime: string; memoType: string
  memoTitle: string; memoContent: string; createdBy: string
  createdDate: string; createdTime: string
}

// ============================================
// Constants
// ============================================
const STEPS = [
  { code: '10', label: '사고접수', icon: '📋', color: '#ef4444', desc: '사고 발생 정보 입력 및 접수' },
  { code: '15', label: '담당자배정', icon: '👤', color: '#f97316', desc: '현장/손사 담당자 배정' },
  { code: '20', label: '검수', icon: '🔍', color: '#eab308', desc: '운행가능 여부 판단' },
  { code: '40', label: '공장입고', icon: '🏭', color: '#3b82f6', desc: '수리 공장 배정 및 입고' },
  { code: '50', label: '수리진행', icon: '🔧', color: '#8b5cf6', desc: '차량 수리 및 상태 업데이트' },
  { code: '60', label: '출고', icon: '🚗', color: '#06b6d4', desc: '수리 완료 후 차량 출고' },
  { code: '70', label: '청구/사정', icon: '💰', color: '#f59e0b', desc: '보험 청구 및 손해사정' },
  { code: '90', label: '지급/종결', icon: '✅', color: '#22c55e', desc: '비용 지급 및 건 종결' },
]

const STATUS_MAP: Record<string, { label: string; bg: string }> = {
  '10': { label: '사고접수', bg: 'bg-red-50 text-red-700 ring-red-200' },
  '15': { label: '담당자배정', bg: 'bg-orange-50 text-orange-700 ring-orange-200' },
  '20': { label: '검수중', bg: 'bg-yellow-50 text-yellow-700 ring-yellow-200' },
  '30': { label: '공장배정', bg: 'bg-blue-50 text-blue-700 ring-blue-200' },
  '40': { label: '공장입고', bg: 'bg-blue-50 text-blue-700 ring-blue-200' },
  '45': { label: '조사중', bg: 'bg-purple-50 text-purple-700 ring-purple-200' },
  '50': { label: '수리중', bg: 'bg-violet-50 text-violet-700 ring-violet-200' },
  '55': { label: '수리완료', bg: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  '60': { label: '출고완료', bg: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  '70': { label: '청구중', bg: 'bg-amber-50 text-amber-700 ring-amber-200' },
  '80': { label: '손해사정', bg: 'bg-amber-50 text-amber-700 ring-amber-200' },
  '85': { label: '지급대기', bg: 'bg-lime-50 text-lime-700 ring-lime-200' },
  '90': { label: '종결', bg: 'bg-green-50 text-green-700 ring-green-200' },
}

const CAT_MAP: Record<string, string> = { 'A': '자차', 'B': '대물', 'C': '대인', 'D': '자손', 'E': '무보험', 'F': '도난' }

const MEMO_TYPE: Record<string, { label: string; icon: string; border: string }> = {
  'T': { label: '전화', icon: '📞', border: 'border-blue-200 bg-blue-50' },
  'V': { label: '방문', icon: '🏢', border: 'border-green-200 bg-green-50' },
  'S': { label: 'SMS', icon: '💬', border: 'border-purple-200 bg-purple-50' },
  'M': { label: '메모', icon: '📝', border: 'border-slate-200 bg-slate-50' },
  'E': { label: '이메일', icon: '📧', border: 'border-orange-200 bg-orange-50' },
  'K': { label: '카톡', icon: '💛', border: 'border-yellow-200 bg-yellow-50' },
}

const RENTAL_ST: Record<string, { label: string; color: string }> = {
  'R': { label: '대차요청', color: 'bg-orange-100 text-orange-700' },
  'C': { label: '계약작성', color: 'bg-blue-100 text-blue-700' },
  'D': { label: '배차완료', color: 'bg-indigo-100 text-indigo-700' },
  'U': { label: '운행중', color: 'bg-green-100 text-green-700' },
  'W': { label: '회차대기', color: 'bg-yellow-100 text-yellow-700' },
  'F': { label: '반납완료', color: 'bg-slate-100 text-slate-700' },
  'S': { label: '대기', color: 'bg-gray-100 text-gray-700' },
  'B': { label: '청구중', color: 'bg-amber-100 text-amber-700' },
  'Z': { label: '종결', color: 'bg-green-100 text-green-700' },
}

// ============================================
// Helpers
// ============================================
const fD = (d: string | null) => { if (!d || d.length < 8) return '-'; return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` }
const fT = (t: string | null) => { if (!t || t.length < 4) return ''; return `${t.slice(0,2)}:${t.slice(2,4)}` }
const fDT = (d: string | null, t: string | null) => { const dd = fD(d), tt = fT(t); return tt ? `${dd} ${tt}` : dd }
const daysSince = (d: string | null) => {
  if (!d || d.length < 8) return null
  const t = new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`)
  return Math.floor((Date.now() - t.getTime()) / 86400000)
}
const getStepIdx = (s: string) => {
  const n = parseInt(s || '10')
  if (n <= 10) return 0; if (n <= 15) return 1; if (n <= 20) return 2
  if (n <= 40) return 3; if (n <= 55) return 4; if (n <= 60) return 5
  if (n <= 80) return 6; return 7
}

function getChecklist(s: string): string[] {
  const n = parseInt(s || '10')
  if (n <= 10) return ['사고일시/장소 확인', '운전자 정보 확인', '상대방 정보 확인', '과실비율 확인', '견인 필요 여부', '고객 알림톡 발송']
  if (n <= 15) return ['현장담당자 배정', '손사담당자 배정', '담당자 알림 발송', '배정 확인']
  if (n <= 20) return ['운행가능 여부 판단', '견인/픽업 결정', '검수 결과 기록', '파손 상태 확인']
  if (n <= 40) return ['공장 선정', '견인/탁송 배정', '입고 사진 촬영', '서류 확인', '입고 확인 문자']
  if (n <= 55) return ['수리 기간 등록', '수리비 견적 등록', '수리 상태 업데이트', '부품 대기 확인']
  if (n <= 60) return ['수리 완료 확인', '품질 검수', '출고 안내 문자', '출고일시 기록']
  if (n <= 80) return ['청구 유형 확인', '손해사정 보고서', '과실 최종 확인', '구상처 확인']
  return ['지급 승인', '공장 지급', '고객 보상', '구상 조정', '종결 보고서']
}

// ============================================
// Main Component
// ============================================
export default function AccidentsMain() {
  const { user, role } = useApp()
  const [accidents, setAccidents] = useState<Accident[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Accident | null>(null)
  const [memos, setMemos] = useState<ConsultMemo[]>([])
  const [memosLoading, setMemosLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [detailTab, setDetailTab] = useState<'info'|'damage'|'timeline'|'rental'|'cost'|'docs'>('info')
  const [mobileShowDetail, setMobileShowDetail] = useState(false)

  const stats = useMemo(() => {
    const total = accidents.length
    const active = accidents.filter(a => parseInt(a.status) < 90).length
    const billing = accidents.filter(a => ['70','80','85'].includes(a.status)).length
    const closed = accidents.filter(a => a.status === '90').length
    const rental = accidents.filter(a => a.rentalYn === 'Y').length
    return { total, active, billing, closed, rental }
  }, [accidents])

  // Load
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: '500' })
      if (dateFrom) p.set('from', dateFrom)
      if (dateTo) p.set('to', dateTo)
      if (search) p.set('search', search)
      const res = await fetch(`/api/cafe24/accidents?${p}`)
      const json = await res.json()
      if (json.success) setAccidents(json.data || [])
    } catch (e) { console.error('사고 목록 에러:', e) }
    finally { setLoading(false) }
  }, [dateFrom, dateTo, search])

  useEffect(() => { load() }, [load])

  // Load memos
  const loadMemos = useCallback(async (acc: Accident) => {
    setMemosLoading(true)
    try {
      const p = new URLSearchParams({ staffId: acc.staffId, receiptDate: acc.receiptDate, seqNo: acc.seqNo })
      const res = await fetch(`/api/cafe24/consultations?${p}`)
      const json = await res.json()
      if (json.success) setMemos(json.data || [])
    } catch (e) { console.error('상담이력 에러:', e) }
    finally { setMemosLoading(false) }
  }, [])

  const handleSelect = (acc: Accident) => {
    setSelected(acc)
    setDetailTab('info')
    setMobileShowDetail(true)
    loadMemos(acc)
  }

  // Filter
  const filtered = useMemo(() => {
    return accidents.filter(a => {
      if (statusFilter === 'active') return parseInt(a.status) < 90
      if (statusFilter === 'billing') return ['70','80','85'].includes(a.status)
      if (statusFilter === 'closed') return a.status === '90'
      return true
    })
  }, [accidents, statusFilter])

  // ============================================
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">사고관리</span>
              <span className="text-xs font-normal text-slate-400 hidden sm:inline">Accident Compensation</span>
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">8단계 사고보상 프로세스 — 접수부터 지급/종결까지</p>
          </div>
          <button onClick={load} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-sm">🔄</button>
        </div>

        {/* Stats */}
        <div className="flex gap-2 mt-3 overflow-x-auto">
          {[
            { key: 'all', label: '전체', val: stats.total, c: 'bg-slate-50 text-slate-700 ring-slate-200' },
            { key: 'active', label: '진행중', val: stats.active, c: 'bg-red-50 text-red-600 ring-red-200' },
            { key: 'billing', label: '청구/사정', val: stats.billing, c: 'bg-amber-50 text-amber-600 ring-amber-200' },
            { key: 'closed', label: '종결', val: stats.closed, c: 'bg-green-50 text-green-600 ring-green-200' },
          ].map(s => (
            <button key={s.key} onClick={() => setStatusFilter(s.key)}
              className={`flex-1 min-w-[80px] rounded-xl px-3 py-2.5 transition-all ${s.c} ${statusFilter === s.key ? 'ring-2 ring-offset-1 shadow-sm scale-[1.02]' : 'hover:shadow-sm'}`}>
              <div className="text-xl font-bold">{s.val}</div>
              <div className="text-[10px] font-medium opacity-70">{s.label}</div>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <input type="text" placeholder="차량번호, 접수번호, 고객명, 보험사, 장소 검색..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-300 outline-none" />
            <span className="absolute left-2.5 top-2.5 text-slate-400 text-sm">🔍</span>
          </div>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-2 py-2 text-xs border border-slate-200 rounded-lg w-[130px]" />
          <span className="self-center text-slate-400 text-xs">~</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-2 py-2 text-xs border border-slate-200 rounded-lg w-[130px]" />
        </div>
      </div>

      {/* ── Main: Split View ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: List */}
        <div className={`${selected ? 'hidden lg:block lg:w-[420px] lg:border-r border-slate-200' : 'flex-1'} bg-white overflow-y-auto`}>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <span className="text-sm text-slate-500">사고 목록 로딩...</span>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <span className="text-4xl mb-2">📋</span>
              <p className="text-sm">조회된 사고건이 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((acc) => {
                const st = STATUS_MAP[acc.status] || STATUS_MAP['10']
                const days = daysSince(acc.accidentDate || acc.createdDate)
                const isActive = selected?.staffId === acc.staffId && selected?.receiptDate === acc.receiptDate && selected?.seqNo === acc.seqNo
                const si = getStepIdx(acc.status)

                return (
                  <div key={`${acc.staffId}-${acc.receiptDate}-${acc.seqNo}`}
                    onClick={() => handleSelect(acc)}
                    className={`px-4 py-3 cursor-pointer transition-all hover:bg-slate-50 ${isActive ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${st.bg}`}>{st.label}</span>
                        {acc.accidentNo && <span className="text-[10px] text-slate-400 font-mono">#{acc.accidentNo}</span>}
                        {acc.category && <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-500">{CAT_MAP[acc.category] || acc.category}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {acc.rentalYn === 'Y' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">🚗대차</span>}
                        {days !== null && days <= 3 && <span className="text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-600 font-bold animate-pulse">NEW</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="font-medium">{fD(acc.accidentDate)}</span>
                      <span className="text-slate-300">|</span>
                      <span>{acc.counterpartName || '상대미상'}</span>
                      {acc.counterpartInsurance && <><span className="text-slate-300">|</span><span className="text-slate-500">{acc.counterpartInsurance}</span></>}
                    </div>
                    {acc.accidentLocation && <div className="text-[10px] text-slate-400 mt-1 truncate">📍 {acc.accidentLocation}</div>}
                    {/* Mini progress bar */}
                    <div className="flex gap-0.5 mt-2">
                      {STEPS.map((step, i) => (
                        <div key={step.code} className="h-1 flex-1 rounded-full transition-all" style={{ backgroundColor: i <= si ? step.color : '#e2e8f0' }} />
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        {acc.repairShopName && <span>🏭 {acc.repairShopName}</span>}
                        {acc.faultRate && <span>⚖️ {acc.faultRate}%</span>}
                      </div>
                      {days !== null && <span className={`text-[10px] font-medium ${days > 30 ? 'text-red-500' : days > 14 ? 'text-amber-500' : 'text-slate-400'}`}>{days}일 경과</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: Detail */}
        {selected && (
          <div className={`${mobileShowDetail ? 'flex' : 'hidden'} lg:flex flex-1 flex-col overflow-y-auto bg-slate-50`}>
            {/* Detail Header */}
            <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setSelected(null); setMobileShowDetail(false) }} className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">←</button>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">{selected.accidentNo ? `사고 #${selected.accidentNo}` : '사고 상세'}</h2>
                    <p className="text-[11px] text-slate-500">{fDT(selected.accidentDate, selected.accidentTime)} · {selected.accidentLocation || '-'}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ring-1 ${(STATUS_MAP[selected.status] || STATUS_MAP['10']).bg}`}>
                  {(STATUS_MAP[selected.status] || STATUS_MAP['10']).label}
                </span>
              </div>

              {/* 8-Step Progress */}
              <div className="flex items-center gap-0 overflow-x-auto pb-2">
                {STEPS.map((step, i) => {
                  const ci = getStepIdx(selected.status)
                  const done = i < ci, active = i === ci, future = i > ci
                  return (
                    <div key={step.code} className="flex items-center flex-shrink-0">
                      {i > 0 && <div className="w-4 sm:w-8 h-0.5 flex-shrink-0" style={{ backgroundColor: done || active ? step.color : '#e2e8f0' }} />}
                      <div className="flex flex-col items-center group relative">
                        <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm transition-all flex-shrink-0 ${active ? 'ring-4 ring-offset-2 shadow-lg scale-110' : done ? 'opacity-90' : 'opacity-40'}`}
                          style={{ backgroundColor: future ? '#e2e8f0' : step.color, color: future ? '#94a3b8' : 'white' }}>
                          {done ? '✓' : step.icon}
                        </div>
                        <span className={`text-[9px] sm:text-[10px] mt-1 font-medium whitespace-nowrap ${active ? 'text-slate-900 font-bold' : done ? 'text-slate-500' : 'text-slate-400'}`}>
                          {step.label}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Guide Banner */}
            <div className="mx-4 sm:mx-6 mt-4 p-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg flex-shrink-0">
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">{STEPS[getStepIdx(selected.status)]?.icon}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm">현재 단계: {STEPS[getStepIdx(selected.status)]?.label}</h3>
                  <p className="text-xs text-blue-100 mt-0.5">{STEPS[getStepIdx(selected.status)]?.desc}</p>
                  <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {getChecklist(selected.status).map((item, i) => (
                      <label key={i} className="flex items-center gap-2 text-[11px] text-blue-100 bg-white/10 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-white/20 transition-colors">
                        <input type="checkbox" className="rounded border-white/30" />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-4 sm:px-6 mt-4 flex-shrink-0">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
                {([
                  { key: 'info', label: '📋 접수정보' },
                  { key: 'damage', label: '🚘 파손분석' },
                  { key: 'timeline', label: `💬 상담${memos.length > 0 ? ` (${memos.length})` : ''}` },
                  { key: 'rental', label: `🚗 대차${selected.rentalYn === 'Y' ? '' : ''}` },
                  { key: 'cost', label: '💰 청구' },
                  { key: 'docs', label: '📁 서류' },
                ] as const).map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)}
                    className={`flex-1 min-w-fit px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${detailTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="px-4 sm:px-6 py-4 flex-1">
              {detailTab === 'info' && <InfoTab a={selected} />}
              {detailTab === 'damage' && <DamageTab a={selected} />}
              {detailTab === 'timeline' && <TimelineTab memos={memos} loading={memosLoading} />}
              {detailTab === 'rental' && <RentalTab a={selected} />}
              {detailTab === 'cost' && <CostTab a={selected} />}
              {detailTab === 'docs' && <DocsTab />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// Info Tab
// ============================================
function InfoTab({ a }: { a: Accident }) {
  return (
    <div className="space-y-4">
      <Card title="📋 사고 기본정보">
        <div className="grid grid-cols-2 gap-4">
          <F label="사고일시" val={fDT(a.accidentDate, a.accidentTime)} />
          <F label="사고장소" val={a.accidentLocation || '-'} />
          <F label="사고번호" val={a.accidentNo || '-'} />
          <F label="접수일시" val={fDT(a.createdDate, a.createdTime)} />
          <F label="과실비율" val={a.faultRate ? `${a.faultRate}%` : '-'} hl />
          <F label="사고유형" val={CAT_MAP[a.category] || a.category || '-'} />
          <F label="견인여부" val={a.towingYn === 'Y' ? '✅ 필요' : '❌ 불요'} />
          <F label="면책여부" val={a.deductYn === 'Y' ? '면책적용' : '-'} />
        </div>
        {a.accidentMemo && <div className="mt-3 bg-slate-50 rounded-lg p-3 text-sm text-slate-600"><span className="text-xs font-medium text-slate-500 block mb-1">사고내용</span>{a.accidentMemo}</div>}
      </Card>

      <Card title="⚠️ 상대방 정보" headerColor="bg-red-50 border-red-100 text-red-700">
        <div className="grid grid-cols-2 gap-4">
          <F label="성명" val={a.counterpartName || '-'} />
          <F label="연락처" val={a.counterpartPhone || '-'} href={a.counterpartPhone ? `tel:${a.counterpartPhone}` : undefined} />
          <F label="차량" val={a.counterpartVehicle || '-'} />
          <F label="보험사" val={a.counterpartInsurance || '-'} hl />
        </div>
      </Card>

      <Card title="🏭 공장/수리 정보" headerColor="bg-blue-50 border-blue-100 text-blue-700">
        <div className="grid grid-cols-2 gap-4">
          <F label="정비공장" val={a.repairShopName || '-'} />
          <F label="공장 연락처" val={a.repairShopPhone || '-'} href={a.repairShopPhone ? `tel:${a.repairShopPhone}` : undefined} />
          {a.towingYn === 'Y' && <><F label="견인업체" val={a.towingCompany || '-'} /><F label="견인 연락처" val={a.towingPhone || '-'} /></>}
          <F label="인도자" val={a.handoverName || '-'} />
          <F label="인도자 연락처" val={a.handoverPhone || '-'} />
        </div>
        {a.deliveryMemo && <div className="mt-3 bg-blue-50 rounded-lg p-3 text-sm text-blue-700"><span className="text-xs font-medium text-blue-500 block mb-1">배송메모</span>{a.deliveryMemo}</div>}
      </Card>

      <Card title="👤 처리자 정보">
        <div className="grid grid-cols-2 gap-4">
          <F label="접수자" val={a.createdBy || '-'} />
          <F label="최종수정" val={a.updatedBy || '-'} />
          <F label="접수일시" val={fDT(a.createdDate, a.createdTime)} />
          <F label="수정일시" val={fDT(a.updatedDate, a.updatedTime)} />
        </div>
      </Card>
    </div>
  )
}

// ============================================
// Timeline Tab
// ============================================
function TimelineTab({ memos, loading }: { memos: ConsultMemo[]; loading: boolean }) {
  if (loading) return <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
  if (memos.length === 0) return (
    <div className="flex flex-col items-center justify-center h-40 text-slate-400">
      <span className="text-3xl mb-2">💬</span>
      <p className="text-sm">등록된 상담이력이 없습니다</p>
      <p className="text-[11px] mt-1">cafe24 ERP에 등록된 상담메모가 여기 표시됩니다</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 mb-2">총 <b>{memos.length}</b>건의 상담이력</div>
      <div className="relative">
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-200" />
        {memos.map((m, i) => {
          const mt = MEMO_TYPE[m.memoType] || MEMO_TYPE['M']
          return (
            <div key={`${m.lineNo}-${i}`} className="relative flex gap-3 pb-4">
              <div className={`relative z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 ${mt.border}`}>
                <span className="text-sm">{mt.icon}</span>
              </div>
              <div className={`flex-1 rounded-xl border p-3 shadow-sm ${mt.border}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/80 font-medium text-slate-600">{mt.label}</span>
                    {m.memoTitle && <span className="text-xs font-medium text-slate-700">{m.memoTitle}</span>}
                  </div>
                  <span className="text-[10px] text-slate-400">{fD(m.memoDate)} {fT(m.memoTime)}</span>
                </div>
                {m.memoContent && <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{m.memoContent}</p>}
                <div className="mt-2 text-[10px] text-slate-400">작성: {m.createdBy || '-'}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================
// Damage Tab (AI 파손 시뮬레이션)
// ============================================
function DamageTab({ a }: { a: Accident }) {
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set(a.damageArea ? a.damageArea.split(',').filter(Boolean) : []))

  const toggleZone = (zone: string) => {
    setSelectedZones(prev => {
      const next = new Set(prev)
      if (next.has(zone)) next.delete(zone); else next.add(zone)
      return next
    })
  }

  const zones = [
    { id: 'FL', label: '좌측 전방', x: 30, y: 15, w: 40, h: 35 },
    { id: 'FC', label: '전면 중앙', x: 75, y: 15, w: 50, h: 35 },
    { id: 'FR', label: '우측 전방', x: 130, y: 15, w: 40, h: 35 },
    { id: 'SL', label: '좌측면', x: 15, y: 55, w: 30, h: 90 },
    { id: 'SR', label: '우측면', x: 155, y: 55, w: 30, h: 90 },
    { id: 'RL', label: '좌측 후방', x: 30, y: 150, w: 40, h: 35 },
    { id: 'RC', label: '후면 중앙', x: 75, y: 150, w: 50, h: 35 },
    { id: 'RR', label: '우측 후방', x: 130, y: 150, w: 40, h: 35 },
    { id: 'RF', label: '지붕', x: 55, y: 65, w: 90, h: 70 },
    { id: 'HD', label: '후드(보닛)', x: 55, y: 22, w: 90, h: 28 },
    { id: 'TK', label: '트렁크', x: 55, y: 152, w: 90, h: 28 },
  ]

  const damageLevel = selectedZones.size === 0 ? '미확인' : selectedZones.size <= 2 ? '경미' : selectedZones.size <= 4 ? '보통' : '심각'
  const damageColor = selectedZones.size === 0 ? 'text-slate-500' : selectedZones.size <= 2 ? 'text-yellow-600' : selectedZones.size <= 4 ? 'text-orange-600' : 'text-red-600'

  return (
    <div className="space-y-4">
      {/* AI Analysis Summary */}
      <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-xl p-4 text-white shadow-lg">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🤖</span>
          <h3 className="font-bold text-sm">AI 사고 분석</h3>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-white/10 rounded-lg p-2 text-center">
            <div className="text-purple-200 text-[10px]">파손 정도</div>
            <div className={`font-bold text-sm mt-0.5 ${selectedZones.size <= 2 ? '' : 'text-yellow-300'}`}>{damageLevel}</div>
          </div>
          <div className="bg-white/10 rounded-lg p-2 text-center">
            <div className="text-purple-200 text-[10px]">파손 부위</div>
            <div className="font-bold text-sm mt-0.5">{selectedZones.size}개소</div>
          </div>
          <div className="bg-white/10 rounded-lg p-2 text-center">
            <div className="text-purple-200 text-[10px]">과실비율</div>
            <div className="font-bold text-sm mt-0.5">{a.faultRate || '0'}%</div>
          </div>
        </div>
        {a.accidentMemo && <p className="text-xs text-purple-100 mt-3 bg-white/10 rounded-lg p-2">{a.accidentMemo}</p>}
      </div>

      {/* Car Damage Simulation */}
      <Card title="🚘 파손부위 시뮬레이션 (클릭하여 선택)">
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 200 200" className="w-full max-w-[320px]" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.1))' }}>
            {/* Car body outline - top-down view */}
            <defs>
              <linearGradient id="carGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#e2e8f0', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: '#cbd5e1', stopOpacity: 1 }} />
              </linearGradient>
            </defs>

            {/* Main car body */}
            <rect x="45" y="10" width="110" height="180" rx="20" fill="url(#carGrad)" stroke="#94a3b8" strokeWidth="1.5" />
            {/* Windshield */}
            <rect x="55" y="50" width="90" height="8" rx="3" fill="#bfdbfe" stroke="#93c5fd" strokeWidth="0.5" />
            {/* Rear window */}
            <rect x="55" y="142" width="90" height="8" rx="3" fill="#bfdbfe" stroke="#93c5fd" strokeWidth="0.5" />
            {/* Side mirrors */}
            <ellipse cx="40" cy="55" rx="8" ry="5" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.5" />
            <ellipse cx="160" cy="55" rx="8" ry="5" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.5" />
            {/* Wheels */}
            <rect x="38" y="30" width="12" height="22" rx="4" fill="#475569" />
            <rect x="150" y="30" width="12" height="22" rx="4" fill="#475569" />
            <rect x="38" y="148" width="12" height="22" rx="4" fill="#475569" />
            <rect x="150" y="148" width="12" height="22" rx="4" fill="#475569" />
            {/* Headlights */}
            <circle cx="65" cy="16" r="4" fill="#fef08a" stroke="#eab308" strokeWidth="0.5" />
            <circle cx="135" cy="16" r="4" fill="#fef08a" stroke="#eab308" strokeWidth="0.5" />
            {/* Taillights */}
            <circle cx="65" cy="184" r="4" fill="#fca5a5" stroke="#ef4444" strokeWidth="0.5" />
            <circle cx="135" cy="184" r="4" fill="#fca5a5" stroke="#ef4444" strokeWidth="0.5" />

            {/* Clickable damage zones */}
            {zones.map(z => {
              const active = selectedZones.has(z.id)
              return (
                <g key={z.id} onClick={() => toggleZone(z.id)} style={{ cursor: 'pointer' }}>
                  <rect
                    x={z.x} y={z.y} width={z.w} height={z.h} rx={4}
                    fill={active ? 'rgba(239,68,68,0.4)' : 'transparent'}
                    stroke={active ? '#ef4444' : 'transparent'}
                    strokeWidth={active ? 2 : 0}
                    className="transition-all"
                  />
                  {active && (
                    <>
                      {/* Damage X marks */}
                      <line x1={z.x+4} y1={z.y+4} x2={z.x+z.w-4} y2={z.y+z.h-4} stroke="#ef4444" strokeWidth="2" opacity="0.6" />
                      <line x1={z.x+z.w-4} y1={z.y+4} x2={z.x+4} y2={z.y+z.h-4} stroke="#ef4444" strokeWidth="2" opacity="0.6" />
                    </>
                  )}
                </g>
              )
            })}

            {/* Direction labels */}
            <text x="100" y="7" textAnchor="middle" fontSize="7" fill="#64748b" fontWeight="bold">전면 ▲</text>
            <text x="100" y="198" textAnchor="middle" fontSize="7" fill="#64748b" fontWeight="bold">▼ 후면</text>
            <text x="8" y="103" textAnchor="middle" fontSize="7" fill="#64748b" fontWeight="bold" transform="rotate(-90, 8, 103)">좌측</text>
            <text x="192" y="103" textAnchor="middle" fontSize="7" fill="#64748b" fontWeight="bold" transform="rotate(90, 192, 103)">우측</text>
          </svg>

          {/* Selected zones list */}
          <div className="w-full mt-4">
            <div className="flex flex-wrap gap-1.5">
              {zones.map(z => (
                <button
                  key={z.id}
                  onClick={() => toggleZone(z.id)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                    selectedZones.has(z.id)
                      ? 'bg-red-50 text-red-700 border-red-300 ring-1 ring-red-200'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {selectedZones.has(z.id) ? '🔴 ' : '⚪ '}{z.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Damage Summary */}
        {selectedZones.size > 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-red-700">파손 요약</span>
              <span className={`text-xs font-bold ${damageColor}`}>{damageLevel} ({selectedZones.size}개소)</span>
            </div>
            <div className="text-xs text-red-600">
              파손부위: {Array.from(selectedZones).map(id => zones.find(z => z.id === id)?.label).join(', ')}
            </div>
          </div>
        )}
      </Card>

      {/* Damage Detail from DB */}
      {(a.damageDetail || a.damageArea) && (
        <Card title="📝 기존 파손 기록">
          <div className="grid grid-cols-2 gap-4">
            <F label="파손부위 코드" val={a.damageArea || '-'} />
            <F label="파손상세" val={a.damageDetail || '-'} />
          </div>
        </Card>
      )}

      {/* AI Estimate */}
      <Card title="🤖 AI 수리비 예상">
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <span className="text-sm text-slate-600">예상 수리비 범위</span>
            <span className="font-bold text-blue-600">
              {selectedZones.size === 0 ? '-' :
               selectedZones.size <= 2 ? '50만원 ~ 150만원' :
               selectedZones.size <= 4 ? '150만원 ~ 400만원' : '400만원 이상'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <span className="text-sm text-slate-600">예상 수리 기간</span>
            <span className="font-bold text-slate-700">
              {selectedZones.size === 0 ? '-' :
               selectedZones.size <= 2 ? '3~7일' :
               selectedZones.size <= 4 ? '7~14일' : '14일 이상'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 text-center">* AI 추정치이며, 실제 수리비는 공장 견적에 따라 다를 수 있습니다</p>
        </div>
      </Card>
    </div>
  )
}

// ============================================
// Rental Tab (대차업체/종류 포함)
// ============================================
const RENTAL_TYPE: Record<string, { label: string; color: string; desc: string }> = {
  'M': { label: '정비대차', color: 'bg-emerald-100 text-emerald-700', desc: '렌트상품 포함 (무상)' },
  'P': { label: '유상대차', color: 'bg-amber-100 text-amber-700', desc: '자차과실, 고객부담' },
  'V': { label: '피해대차', color: 'bg-red-100 text-red-700', desc: '상대과실, 보험사청구' },
}

function RentalTab({ a }: { a: Accident }) {
  if (a.rentalYn !== 'Y' || !a.rentalCarNo) return (
    <div className="flex flex-col items-center justify-center h-40 text-slate-400">
      <span className="text-3xl mb-2">🚗</span>
      <p className="text-sm">연결된 대차 정보가 없습니다</p>
    </div>
  )

  const rs = RENTAL_ST[a.rentalStatus] || { label: a.rentalStatus || '-', color: 'bg-slate-100 text-slate-700' }
  const rt = RENTAL_TYPE[a.rentalType] || null
  const rentalDays = (() => {
    if (!a.rentalFromDate || a.rentalFromDate.length < 8) return null
    const from = new Date(`${a.rentalFromDate.slice(0,4)}-${a.rentalFromDate.slice(4,6)}-${a.rentalFromDate.slice(6,8)}`)
    const to = a.rentalToDate && a.rentalToDate.length >= 8
      ? new Date(`${a.rentalToDate.slice(0,4)}-${a.rentalToDate.slice(4,6)}-${a.rentalToDate.slice(6,8)}`)
      : new Date()
    return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000))
  })()
  const daily = parseInt(a.rentalDailyCost) || 0
  const total = parseInt(a.rentalTotalCost) || (daily * (rentalDays || 0))

  return (
    <div className="space-y-4">
      {/* Rental Type Badge */}
      {rt && (
        <div className={`rounded-xl border p-4 ${rt.color.includes('emerald') ? 'border-emerald-200 bg-emerald-50' : rt.color.includes('amber') ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${rt.color}`}>{rt.label}</span>
            <span className="text-xs text-slate-500">{rt.desc}</span>
          </div>
        </div>
      )}

      {/* Main Rental Card */}
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-lg">{a.rentalCarNo}</h3>
            <p className="text-blue-100 text-sm">{a.rentalCarModel || '차종 미상'}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${rs.color}`}>{rs.label}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="bg-white/10 rounded-lg p-3">
            <div className="text-blue-200 text-xs">시작</div>
            <div className="font-semibold text-sm mt-0.5">{fDT(a.rentalFromDate, a.rentalFromTime)}</div>
          </div>
          <div className="bg-white/10 rounded-lg p-3">
            <div className="text-blue-200 text-xs">종료(예정)</div>
            <div className="font-semibold text-sm mt-0.5">{fDT(a.rentalToDate, a.rentalToTime)}</div>
          </div>
        </div>
        {rentalDays && (
          <div className="mt-3 bg-white/10 rounded-lg p-3 flex items-center justify-between">
            <span className="text-blue-200 text-xs">대차 기간</span>
            <span className="font-bold text-lg">{rentalDays}일</span>
          </div>
        )}
      </div>

      {/* Rental Details with Company & Type */}
      <Card title="📄 대차 상세정보">
        <div className="grid grid-cols-2 gap-4">
          <F label="대차 차량" val={a.rentalCarNo} hl />
          <F label="차종" val={a.rentalCarModel || '-'} />
          <F label="대차업체(공장)" val={a.rentalFactory || '-'} hl />
          <F label="대차종류" val={rt ? rt.label : a.rentalType || '-'} hl />
          <F label="진행상태" val={rs.label} />
          <F label="대차일수" val={a.rentalDays ? `${a.rentalDays}일` : rentalDays ? `${rentalDays}일` : '-'} />
          <F label="일 단가" val={daily > 0 ? `${daily.toLocaleString()}원` : '-'} />
          <F label="총 비용" val={total > 0 ? `${total.toLocaleString()}원` : '-'} hl />
        </div>
        {a.rentalMemo && <div className="mt-3 bg-blue-50 rounded-lg p-3 text-sm text-blue-700"><span className="text-xs font-medium text-blue-500 block mb-1">대차 메모</span>{a.rentalMemo}</div>}
      </Card>

      {/* Link to rental management */}
      <a href="/rental" className="block text-center py-3 text-sm text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors font-medium">
        🔗 대차관리 페이지에서 전체 보기 →
      </a>
    </div>
  )
}

// ============================================
// Cost Tab
// ============================================
function CostTab({ a }: { a: Accident }) {
  return (
    <div className="space-y-4">
      <Card title="💰 비용/정산" headerColor="bg-amber-50 border-amber-100 text-amber-700">
        <div className="grid grid-cols-2 gap-4">
          <F label="정산여부" val={a.settlementYn === 'Y' ? '✅ 정산완료' : '⏳ 미정산'} hl />
          <F label="면책여부" val={a.deductYn === 'Y' ? '면책적용' : '미적용'} />
          <F label="과실비율" val={a.faultRate ? `${a.faultRate}%` : '-'} />
          <F label="종결여부" val={a.completeYn === 'Y' ? '✅ 종결' : '진행중'} />
        </div>
        <div className="mt-4 p-4 bg-slate-50 rounded-lg">
          <h4 className="text-xs font-bold text-slate-600 mb-3">📊 청구 프로세스 안내</h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: '고객청구', desc: '면책금, 휴차료', icon: '👤' },
              { label: '고객실비', desc: '실제 발생 비용', icon: '💳' },
              { label: '캐피탈보상', desc: '리스/캐피탈사', icon: '🏦' },
              { label: '보험구상', desc: '상대 보험사', icon: '🛡️' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100">
                <span className="text-lg">{item.icon}</span>
                <div>
                  <div className="text-xs font-medium text-slate-700">{item.label}</div>
                  <div className="text-[10px] text-slate-400">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

// ============================================
// Docs Tab
// ============================================
function DocsTab() {
  const docs = [
    { name: '사고사진', icon: '📸', desc: '현장/파손 사진' },
    { name: '면허증', icon: '🪪', desc: '운전면허 사본' },
    { name: '보험증권', icon: '📄', desc: '자동차보험 증권' },
    { name: '수리견적', icon: '🔧', desc: '정비공장 견적서' },
    { name: '사고확인서', icon: '📋', desc: '교통사고 확인서' },
    { name: '진단서', icon: '🏥', desc: '상해 진단서' },
  ]
  return (
    <Card title="📁 서류/사진 관리">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {docs.map(d => (
          <div key={d.name} className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-blue-300 hover:bg-blue-50/50 transition-all cursor-pointer group">
            <span className="text-2xl block group-hover:scale-110 transition-transform">{d.icon}</span>
            <div className="text-xs font-medium text-slate-700 mt-2">{d.name}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{d.desc}</div>
            <div className="text-[10px] text-blue-500 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">클릭하여 업로드</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ============================================
// Shared: Card, Field
// ============================================
function Card({ title, headerColor, children }: { title: string; headerColor?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className={`px-4 py-3 border-b ${headerColor || 'bg-slate-50 border-slate-200 text-slate-700'}`}>
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function F({ label, val, hl, href }: { label: string; val: string; hl?: boolean; href?: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-400 font-medium mb-0.5">{label}</div>
      <div className="text-sm text-slate-700">
        {href ? <a href={href} className="text-blue-600 hover:underline">{val}</a> : <span className={hl ? 'font-bold text-blue-600' : ''}>{val}</span>}
      </div>
    </div>
  )
}
