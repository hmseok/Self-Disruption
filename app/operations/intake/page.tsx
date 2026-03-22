'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../utils/supabase'

// ============================================
// Types
// ============================================
type AccidentRecord = {
  id: number; company_id: string; car_id: number | null; contract_id: string | null
  customer_id: number | null; accident_date: string; accident_time: string | null
  accident_location: string; accident_type: string; fault_ratio: number
  description: string; status: string; driver_name: string; driver_phone: string
  driver_relation: string; counterpart_name: string; counterpart_phone: string
  counterpart_vehicle: string; counterpart_insurance: string
  insurance_company: string; insurance_claim_no: string
  insurance_filed_at: string | null; insurance_status: string | null
  police_reported: boolean; police_report_no: string | null
  repair_shop_name: string; repair_start_date: string | null; repair_end_date: string | null
  estimated_repair_cost: number; actual_repair_cost: number; insurance_payout: number
  customer_deductible: number; company_cost: number
  replacement_car_id: number | null; replacement_start: string | null
  replacement_end: string | null; replacement_cost: number | null
  vehicle_condition: string | null; notes: string
  handler_id: string | null; created_at: string; updated_at: string
  source: string | null; jandi_raw: string | null; jandi_topic: string | null
  workflow_stage?: string; workflow_checklist?: Record<string, boolean>
  mileage_at_accident?: number | null; photos?: string[] | null; documents?: string[] | null
  created_by?: string | null
  car?: { id: number; number: string; brand: string; model: string; status: string } | null
  replacement_car?: { id: number; number: string; brand: string; model: string } | null
}
type Car = { id: number; number: string; brand: string; model: string; status: string; ownership_type?: string; detailed_status?: string }
type VehicleOperation = {
  id: string; car_id: string; operation_type: string; status: string; scheduled_date: string
  dispatch_category?: string; insurance_billing_status?: string; insurance_daily_rate?: number
  insurance_billed_amount?: number; insurance_paid_amount?: number; accident_id?: number
  car?: { number: string; brand: string; model: string }
}
type CustomerNote = { id: number; customer_id: number; author_name: string; note_type: string; content: string; created_at: string }

// ============================================
// Constants & Mappings
// ============================================
const SOURCE_MAP: Record<string, { label: string; bg: string }> = {
  cafe24: { label: '구전산', bg: 'bg-purple-500' },
  manual: { label: '수동', bg: 'bg-gray-400' },
}
const STAGE_MAP: Record<string, { label: string; color: string }> = {
  accident_reported: { label: '사고접수', color: '#ef4444' },
  replacement_requested: { label: '대차요청', color: '#f97316' },
  customer_contacted: { label: '고객통화', color: '#eab308' },
  dispatch_preparing: { label: '배차준비', color: '#3b82f6' },
  dispatched: { label: '배차완료', color: '#6366f1' },
  in_transit_delivery: { label: '탁송', color: '#06b6d4' },
  in_repair: { label: '공장입고', color: '#a855f7' },
  repair_done: { label: '공장출고', color: '#8b5cf6' },
  returning: { label: '대차회수', color: '#14b8a6' },
  car_returned: { label: '차고복귀', color: '#10b981' },
  maintenance: { label: '세차/정비', color: '#84cc16' },
  standby: { label: '대기', color: '#6b7280' },
  billing: { label: '청구', color: '#f59e0b' },
  payment_confirmed: { label: '입금확인', color: '#22c55e' },
  closed: { label: '종결', color: '#64748b' },
}
const ACC_TYPE: Record<string, string> = { collision: '충돌', self_damage: '자손', hit_and_run: '뺑소니', theft: '도난', natural_disaster: '자연재해', vandalism: '파손', fire: '화재', other: '기타' }
const COND: Record<string, string> = { minor: '경미', repairable: '수리가능', total_loss: '전손' }
const INS_ST: Record<string, string> = { none: '미접수', filed: '접수', processing: '처리중', approved: '승인', denied: '거절', partial: '부분' }
const BILLING_ST: Record<string, { l: string; c: string }> = { none: { l: '미청구', c: 'text-gray-400' }, pending: { l: '청구대기', c: 'text-yellow-600' }, billed: { l: '청구완료', c: 'text-blue-600' }, approved: { l: '승인', c: 'text-cyan-600' }, paid: { l: '입금완료', c: 'text-green-600' }, partial: { l: '부분', c: 'text-amber-600' }, denied: { l: '거절', c: 'text-red-600' } }

// ============================================
// Helpers
// ============================================
const fmt = (d: string | null | undefined) => { if (!d) return '-'; try { return new Date(d).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) } catch { return d } }
const fmtFull = (d: string | null | undefined) => { if (!d) return '-'; try { return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return d } }
const fmtNum = (n: number | null | undefined) => n == null || n === 0 ? '-' : n.toLocaleString('ko-KR') + '원'
const daysDiff = (target: string | null) => { if (!target) return null; return Math.ceil((new Date(target).getTime() - Date.now()) / 86400000) }
const timeAgo = (d: string) => { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 60) return `${m}분전`; const h = Math.floor(m / 60); if (h < 24) return `${h}시간전`; return `${Math.floor(h / 24)}일전` }

function extractJandi(raw: string | null, notes: string | null) {
  const t = raw || notes || ''
  const cn = t.match(/\*차량번호\s*[:：]\s*([^\n*]+)/)?.[1]?.trim()
  const cm = t.match(/\*차종\s*[:：]\s*([^\n*]+)/)?.[1]?.trim()
  const cu = t.match(/\*고객명\s*[:：]\s*([^\n*]+)/)?.[1]?.trim().replace(/\[법인\]|\[개인\]/g, '').trim()
  const rn = t.match(/\*접수번호\s*[:：]\s*([^\n*]+)/)?.[1]?.trim()
  // fallback: 헤더 첫줄
  let carNum = cn || ''
  if (!carNum) { const fl = t.split('\n')[0] || ''; if (fl.includes('/') && !fl.startsWith('*')) carNum = fl.split('/')[0].trim() }
  return { carNumber: carNum, carModel: cm || '', customerName: cu || '', receiptNo: rn || '' }
}

// ============================================
// Main Component
// ============================================
export default function IntakePage() {
  const { user, company, role, adminSelectedCompanyId } = useApp()
  const companyId = role === 'admin' ? adminSelectedCompanyId : company?.id

  const [cafe24Records, setCafe24Records] = useState<AccidentRecord[]>([])
  const [cafe24Loading, setCafe24Loading] = useState(false)
  const [cars, setCars] = useState<Car[]>([])
  const [operations, setOperations] = useState<VehicleOperation[]>([])
  const [customerNotes, setCustomerNotes] = useState<CustomerNote[]>([])
  const [loading, setLoading] = useState(true)

  // UI state
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState<'date' | 'id'>('date')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [detailTab, setDetailTab] = useState<'info' | 'notes' | 'billing' | 'ai'>('info')
  const [showSmsModal, setShowSmsModal] = useState(false)
  // AI Analysis state
  const [aiAnalysis, setAiAnalysis] = useState<any>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [smsTarget, setSmsTarget] = useState<{ name: string; phone: string } | null>(null)
  const [smsMessage, setSmsMessage] = useState('')
  const [smsSending, setSmsSending] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // ── Fetch supporting data (cars, operations) ──
  const fetchSupportData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [carsR, opsR] = await Promise.all([
        supabase.from('cars')
          .select('id,number,brand,model,status,ownership_type,detailed_status')
          .eq('company_id', companyId).order('number'),
        supabase.from('vehicle_operations')
          .select('*,car:cars!vehicle_operations_car_id_fkey(number,brand,model)')
          .eq('company_id', companyId).in('status', ['scheduled', 'preparing', 'inspecting', 'in_transit']).limit(100),
      ])
      if (carsR.data) setCars(carsR.data)
      if (opsR.data) setOperations(opsR.data as any)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [companyId])

  // ── cafe24 사고접수 fetch (primary data source) ──
  const fetchCafe24 = useCallback(async () => {
    setCafe24Loading(true)
    try {
      const params = new URLSearchParams({ limit: '200' })
      const res = await fetch(`/api/cafe24/accidents?${params}`)
      if (!res.ok) { setCafe24Records([]); return }
      const json = await res.json()
      if (!json.success) { setCafe24Records([]); return }
      // cafe24 row를 AccidentRecord 호환으로 매핑
      const mapped: AccidentRecord[] = (json.data || []).map((r: any, idx: number) => {
        // 날짜 포맷 변환 (YYYYMMDD → YYYY-MM-DD)
        const fmtDate = (d: string | null) => {
          if (!d || d.length < 8) return ''
          return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
        }
        const accDate = fmtDate(r.accidentDate)
        const accTime = r.accidentTime ? `${r.accidentTime.slice(0, 2)}:${r.accidentTime.slice(2, 4)}` : ''

        // 상태 매핑
        const statusMap: Record<string, string> = {
          '10': 'accident_reported', '20': 'dispatch_preparing', '30': 'dispatched',
          '40': 'in_repair', '50': 'repair_done', '60': 'returning',
          '70': 'car_returned', '80': 'billing', '90': 'closed',
        }

        return {
          id: -(idx + 1), // negative ID to avoid collision with supabase
          company_id: '', car_id: null, contract_id: null, customer_id: null,
          accident_date: accDate, accident_time: accTime,
          accident_location: r.accidentLocation || '', accident_type: 'collision',
          fault_ratio: parseInt(r.faultRate) || 0,
          description: r.accidentMemo || '',
          status: r.status || '',
          driver_name: r.counterpartName || '', driver_phone: r.counterpartPhone || '',
          driver_relation: '', counterpart_name: r.counterpartName || '',
          counterpart_phone: r.counterpartPhone || '',
          counterpart_vehicle: r.counterpartVehicle || '',
          counterpart_insurance: r.counterpartInsurance || '',
          insurance_company: r.counterpartInsurance || '',
          insurance_claim_no: r.accidentNo || '',
          insurance_filed_at: null, insurance_status: null,
          police_reported: false, police_report_no: null,
          repair_shop_name: r.repairShopName || '',
          repair_start_date: null, repair_end_date: null,
          estimated_repair_cost: 0, actual_repair_cost: 0,
          insurance_payout: 0, customer_deductible: 0, company_cost: 0,
          replacement_car_id: null, replacement_start: r.rentalFromDate ? fmtDate(r.rentalFromDate) : null,
          replacement_end: r.rentalToDate ? fmtDate(r.rentalToDate) : null,
          replacement_cost: null,
          vehicle_condition: null,
          notes: `*접수번호: ${r.accidentNo || '-'}\n*배송처: ${r.repairShopName || '-'}\n*차량번호: ${r.rentalCarNo || '-'}\n*차종: ${r.rentalCarModel || '-'}`,
          handler_id: null,
          created_at: accDate ? `${accDate}T${accTime || '00:00'}:00` : '',
          updated_at: '',
          source: 'cafe24',
          jandi_raw: null,
          jandi_topic: null,
          workflow_stage: statusMap[r.status] || 'accident_reported',
          car: null, replacement_car: null,
        }
      })
      setCafe24Records(mapped)
    } catch (e) {
      console.error('cafe24 fetch error:', e)
      setCafe24Records([])
    } finally {
      setCafe24Loading(false)
    }
  }, [])

  // Load cafe24 and support data on mount
  useEffect(() => {
    fetchSupportData()
    fetchCafe24()
  }, [fetchSupportData, fetchCafe24])


  // ── Notes fetch ──
  useEffect(() => {
    if (!selectedId || !companyId) { setCustomerNotes([]); return }
    const rec = cafe24Records.find(r => r.id === selectedId)
    if (!rec?.customer_id) { setCustomerNotes([]); return }
    supabase.from('customer_notes').select('*').eq('customer_id', rec.customer_id).eq('company_id', companyId)
      .order('created_at', { ascending: false }).limit(30).then(({ data }) => { if (data) setCustomerNotes(data) })
  }, [selectedId, companyId, cafe24Records])

  // ── Computed ──
  const selected = useMemo(() => cafe24Records.find(r => r.id === selectedId) || null, [cafe24Records, selectedId])

  const filtered = useMemo(() => {
    let list = cafe24Records
    if (stageFilter !== 'all') {
      if (stageFilter === 'new') list = list.filter(r => ['accident_reported', 'replacement_requested'].includes(r.workflow_stage || 'accident_reported'))
      else if (stageFilter === 'progress') list = list.filter(r => ['customer_contacted', 'dispatch_preparing', 'dispatched', 'in_transit_delivery', 'in_repair', 'repair_done', 'returning', 'car_returned', 'maintenance', 'standby'].includes(r.workflow_stage || ''))
      else if (stageFilter === 'billing') list = list.filter(r => ['billing', 'payment_confirmed'].includes(r.workflow_stage || ''))
      else if (stageFilter === 'closed') list = list.filter(r => r.workflow_stage === 'closed')
      else list = list.filter(r => r.workflow_stage === stageFilter)
    }
    if (dateFrom) list = list.filter(r => r.accident_date >= dateFrom)
    if (dateTo) list = list.filter(r => r.accident_date <= dateTo)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => {
        const jd = extractJandi(r.jandi_raw, r.notes)
        return r.driver_name?.toLowerCase().includes(q) || r.insurance_company?.toLowerCase().includes(q) ||
          r.insurance_claim_no?.toLowerCase().includes(q) || jd.carNumber.toLowerCase().includes(q) ||
          jd.customerName.toLowerCase().includes(q) || jd.receiptNo.toLowerCase().includes(q) ||
          r.accident_location?.toLowerCase().includes(q) || String(r.id).includes(q)
      })
    }
    // sort
    list = [...list].sort((a, b) => {
      const va = sortKey === 'date' ? a.accident_date : String(a.id)
      const vb = sortKey === 'date' ? b.accident_date : String(b.id)
      return sortDir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb)
    })
    return list
  }, [cafe24Records, stageFilter, dateFrom, dateTo, search, sortKey, sortDir])

  // Stats by stage
  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {}
    cafe24Records.forEach(r => { const s = r.workflow_stage || 'accident_reported'; m[s] = (m[s] || 0) + 1 })
    return m
  }, [cafe24Records])

  const availableCarCount = useMemo(() => cars.filter(c => c.status === 'available' || c.detailed_status === 'available').length, [cars])

  // ── Actions ──
  const handleStageChange = async (id: number, stage: string) => {
    await supabase.from('accident_records').update({ workflow_stage: stage, updated_at: new Date().toISOString() }).eq('id', id)
    // Note: cafe24 records have negative IDs and cannot be updated in supabase
  }
  const openSms = (name: string, phone: string) => { setSmsTarget({ name, phone }); setSmsMessage(''); setShowSmsModal(true) }
  const sendSms = async () => {
    if (!smsTarget || !smsMessage.trim()) return
    setSmsSending(true)
    try {
      const res = await fetch('/api/send-sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: smsTarget.phone, message: smsMessage }) })
      if (res.ok) { alert('발송 완료'); setShowSmsModal(false) } else alert('발송 실패')
    } catch { alert('오류') }
    finally { setSmsSending(false) }
  }
  const addNote = async () => {
    if (!selected?.customer_id || !newNote.trim() || !companyId) return
    setSavingNote(true)
    await supabase.from('customer_notes').insert({ customer_id: selected.customer_id, company_id: companyId, author_name: user?.name || '시스템', note_type: '상담', content: newNote.trim() })
    setNewNote('')
    const { data } = await supabase.from('customer_notes').select('*').eq('customer_id', selected.customer_id).eq('company_id', companyId).order('created_at', { ascending: false }).limit(30)
    if (data) setCustomerNotes(data)
    setSavingNote(false)
  }
  const toggleSort = (key: 'date' | 'id') => { if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSortKey(key); setSortDir('desc') } }

  // ── AI Analysis ──
  const runAiAnalysis = async (record: AccidentRecord) => {
    setAiLoading(true); setAiError(null); setAiAnalysis(null)
    try {
      const res = await fetch('/api/ai/accident-analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accidentType: record.accident_type, description: record.description,
          faultRatio: record.fault_ratio, insuranceCompany: record.insurance_company,
          driverRelation: record.driver_relation, vehicleCondition: record.vehicle_condition,
          location: record.accident_location, accidentDate: record.accident_date,
          accidentTime: record.accident_time, counterpartVehicle: record.counterpart_vehicle,
          counterpartInsurance: record.counterpart_insurance,
          jandiRaw: record.jandi_raw, notes: record.notes,
          policeReported: record.police_reported, estimatedRepairCost: record.estimated_repair_cost,
        }),
      })
      const data = await res.json()
      if (data.success) setAiAnalysis(data.analysis)
      else setAiError(data.error || 'AI 분석 실패')
    } catch { setAiError('AI 서버 연결 실패') }
    finally { setAiLoading(false) }
  }

  // Reset AI when selection changes
  useEffect(() => { setAiAnalysis(null); setAiError(null) }, [selectedId])

  // ── Render ──
  if (!companyId) return <div className="p-8 text-center text-gray-500">회사 정보를 불러오는 중...</div>

  return (
    <div className="h-full flex flex-col" style={{ background: '#f8f9fb' }}>
      {/* ── Stage Pipeline ── */}
      <div style={{ borderBottom: '1px solid #e5e7eb', background: '#fff', padding: '12px 20px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', minWidth: 'max-content' }}>
          <PipeBtn label={`전체 ${cafe24Records.length}`} active={stageFilter === 'all'} color="#374151" onClick={() => setStageFilter('all')} />
          <PipeBtn label={`신규접수 ${(stageCounts['accident_reported'] || 0) + (stageCounts['replacement_requested'] || 0)}`} active={stageFilter === 'new'} color="#ef4444" onClick={() => setStageFilter('new')} />
          {(['customer_contacted', 'dispatch_preparing', 'dispatched', 'in_transit_delivery'] as const).map(s => {
            const st = STAGE_MAP[s]; const c = stageCounts[s] || 0
            return c > 0 ? <PipeBtn key={s} label={`${st.label} ${c}`} active={stageFilter === s} color={st.color} onClick={() => setStageFilter(s)} /> : null
          })}
          <PipeBtn label={`진행중 ${['in_repair', 'repair_done', 'returning', 'car_returned', 'maintenance', 'standby'].reduce((a, s) => a + (stageCounts[s] || 0), 0)}`} active={stageFilter === 'progress'} color="#8b5cf6" onClick={() => setStageFilter('progress')} />
          <PipeBtn label={`청구/입금 ${(stageCounts['billing'] || 0) + (stageCounts['payment_confirmed'] || 0)}`} active={stageFilter === 'billing'} color="#f59e0b" onClick={() => setStageFilter('billing')} />
          <PipeBtn label={`종결 ${stageCounts['closed'] || 0}`} active={stageFilter === 'closed'} color="#64748b" onClick={() => setStageFilter('closed')} />
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#22c55e', fontWeight: 600 }}>배차가능 {availableCarCount}대</span>
            <button onClick={() => { fetchSupportData(); fetchCafe24() }} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 11, color: '#6b7280' }}>새로고침</button>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '8px 20px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...selectStyle, width: 130 }} />
        <span style={{ color: '#9ca3af', fontSize: 12 }}>~</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...selectStyle, width: 130 }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="차량번호, 고객명, 접수번호, 보험사..." style={{ ...selectStyle, flex: 1, minWidth: 200 }} />
        {(dateFrom || dateTo || search) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); setSearch('') }} style={{ fontSize: 11, color: '#6b7280', cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline' }}>초기화</button>
        )}
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>{filtered.length}건</span>
      </div>

      {/* ── Main Split ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── Table ── */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 1 }}>
                <Th w={50} onClick={() => toggleSort('id')} active={sortKey === 'id'} dir={sortDir}>#</Th>
                <Th w={60}>소스</Th>
                <Th w={100} onClick={() => toggleSort('date')} active={sortKey === 'date'} dir={sortDir}>사고일</Th>
                <Th w={100}>차량번호</Th>
                <Th w={120}>차종</Th>
                <Th w={90}>고객/운전자</Th>
                <Th w={80}>보험사</Th>
                <Th w={50}>과실</Th>
                <Th w={90}>단계</Th>
                <Th w={70}>대차차량</Th>
                <Th w={60}>경과</Th>
              </tr>
            </thead>
            <tbody>
              {(loading || cafe24Loading) ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>데이터 불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>검색 결과 없음</td></tr>
              ) : filtered.map(r => {
                const jd = extractJandi(r.jandi_raw, r.notes)
                const stage = STAGE_MAP[r.workflow_stage || 'accident_reported']
                const src = SOURCE_MAP[r.source || 'manual']
                const isSel = r.id === selectedId
                const retDiff = r.replacement_end ? daysDiff(r.replacement_end) : null
                return (
                  <tr key={r.id} onClick={() => { setSelectedId(r.id); setDetailTab('info') }}
                    style={{ cursor: 'pointer', background: isSel ? '#eef2ff' : '#fff', borderBottom: '1px solid #f3f4f6', transition: 'background .1s' }}
                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#fafafa' }}
                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = '#fff' }}>
                    <Td style={{ fontWeight: 500, color: '#6b7280' }}>{r.source === 'cafe24' ? (r.insurance_claim_no || `C${-r.id}`) : r.id}</Td>
                    <Td><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, color: '#fff', background: src?.bg === 'bg-red-500' ? '#ef4444' : src?.bg === 'bg-orange-500' ? '#f97316' : src?.bg === 'bg-purple-500' ? '#8b5cf6' : '#9ca3af', whiteSpace: 'nowrap' }}>{src?.label}</span></Td>
                    <Td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(r.accident_date)}</Td>
                    <Td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{jd.carNumber || '-'}</Td>
                    <Td style={{ color: '#6b7280', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jd.carModel || '-'}</Td>
                    <Td>
                      <div style={{ lineHeight: 1.3 }}>
                        <div style={{ fontWeight: 500 }}>{jd.customerName || r.driver_name || '-'}</div>
                        {r.driver_name && jd.customerName && r.driver_name !== jd.customerName && (
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.driver_name}</div>
                        )}
                      </div>
                    </Td>
                    <Td style={{ color: '#6b7280' }}>{r.insurance_company || '-'}</Td>
                    <Td style={{ textAlign: 'center', color: r.fault_ratio === 100 ? '#ef4444' : r.fault_ratio === 0 ? '#22c55e' : '#6b7280' }}>{r.fault_ratio != null ? `${r.fault_ratio}%` : '-'}</Td>
                    <Td>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, border: `1px solid ${stage?.color || '#d1d5db'}`, color: stage?.color || '#6b7280', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {stage?.label || '-'}
                      </span>
                    </Td>
                    <Td style={{ fontFamily: 'monospace', fontSize: 12, color: '#6366f1' }}>{r.replacement_car?.number || '-'}</Td>
                    <Td style={{ fontSize: 11, color: '#9ca3af' }}>
                      {timeAgo(r.created_at)}
                      {retDiff !== null && retDiff >= 0 && retDiff <= 3 && (
                        <div style={{ fontSize: 10, color: retDiff === 0 ? '#ef4444' : '#f97316', fontWeight: 600 }}>반납 D{retDiff === 0 ? '-day' : `-${retDiff}`}</div>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Detail Panel ── */}
        {selected && (() => {
          const jd = extractJandi(selected.jandi_raw, selected.notes)
          const stage = STAGE_MAP[selected.workflow_stage || 'accident_reported']
          return (
            <div style={{ width: 400, borderLeft: '1px solid #e5e7eb', background: '#fff', overflow: 'auto', flexShrink: 0 }}>
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>#{selected.id} · {fmtFull(selected.created_at)}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>{jd.carNumber || '-'}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{jd.carModel}</div>
                    {jd.customerName && <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>{jd.customerName}</div>}
                  </div>
                  <select value={selected.workflow_stage || 'accident_reported'} onChange={e => handleStageChange(selected.id, e.target.value)}
                    style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: `1.5px solid ${stage?.color || '#d1d5db'}`, color: stage?.color, fontWeight: 600, background: '#fff', cursor: 'pointer' }}>
                    {Object.entries(STAGE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                {/* Quick actions */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selected.driver_phone && <QBtn label={`운전자 ${selected.driver_name}`} onClick={() => openSms(selected.driver_name, selected.driver_phone)} />}
                  {selected.driver_phone && <QBtn label="전화" onClick={() => window.open(`tel:${selected.driver_phone}`)} color="#059669" />}
                </div>
                {selected.replacement_car && (
                  <div style={{ marginTop: 8, padding: '6px 10px', background: '#eef2ff', borderRadius: 6, fontSize: 12, color: '#4f46e5', fontWeight: 500 }}>
                    대차: {selected.replacement_car.number} ({selected.replacement_car.brand} {selected.replacement_car.model})
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
                {([['info', '접수정보'], ['notes', '상담이력'], ['billing', '보험/청구'], ['ai', 'AI 분석']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setDetailTab(k)} style={{ flex: 1, padding: '10px 0', fontSize: 12, fontWeight: detailTab === k ? 600 : 400, color: detailTab === k ? '#4f46e5' : '#9ca3af', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: detailTab === k ? '#4f46e5' : 'transparent', cursor: 'pointer' }}>{l}</button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ padding: '16px 20px' }}>
                {detailTab === 'info' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <DSection title="사고">
                      <DRow l="사고일시" v={`${selected.accident_date || '-'} ${selected.accident_time || ''}`} />
                      <DRow l="장소" v={selected.accident_location} />
                      <DRow l="유형" v={ACC_TYPE[selected.accident_type] || selected.accident_type} />
                      <DRow l="차량상태" v={COND[selected.vehicle_condition || ''] || selected.vehicle_condition || '-'} />
                      <DRow l="내용" v={selected.description} />
                    </DSection>
                    <DSection title="운전자">
                      <DRow l="이름" v={selected.driver_name} />
                      <DRow l="연락처" v={selected.driver_phone} phone />
                      <DRow l="관계" v={selected.driver_relation} />
                    </DSection>
                    {(selected.counterpart_name || selected.counterpart_phone) && (
                      <DSection title="상대방">
                        <DRow l="이름" v={selected.counterpart_name} />
                        <DRow l="연락처" v={selected.counterpart_phone} phone />
                        <DRow l="차량" v={selected.counterpart_vehicle} />
                        <DRow l="보험사" v={selected.counterpart_insurance} />
                      </DSection>
                    )}
                    <DSection title="보험">
                      <DRow l="보험사" v={selected.insurance_company} />
                      <DRow l="접수번호" v={selected.insurance_claim_no || jd.receiptNo} />
                      <DRow l="과실" v={selected.fault_ratio != null ? `${selected.fault_ratio}%` : '-'} />
                      <DRow l="면책금" v={fmtNum(selected.customer_deductible)} />
                    </DSection>
                    <DSection title="대차">
                      <DRow l="대차차량" v={selected.replacement_car ? `${selected.replacement_car.number} (${selected.replacement_car.brand} ${selected.replacement_car.model})` : '미배정'} />
                      <DRow l="시작" v={fmt(selected.replacement_start)} />
                      <DRow l="종료" v={fmt(selected.replacement_end)} />
                    </DSection>
                    <DSection title="비용">
                      <DRow l="예상수리비" v={fmtNum(selected.estimated_repair_cost)} />
                      <DRow l="보험금" v={fmtNum(selected.insurance_payout)} />
                      <DRow l="대차비" v={fmtNum(selected.replacement_cost)} />
                    </DSection>
                    {selected.notes && <DSection title="메모"><p style={{ fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{selected.notes}</p></DSection>}
                  </div>
                )}
                {detailTab === 'notes' && (
                  <div>
                    {selected.customer_id ? (
                      <>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                          <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()}
                            placeholder="상담 메모..." style={{ flex: 1, padding: '8px 10px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none' }} />
                          <button onClick={addNote} disabled={savingNote || !newNote.trim()} style={{ padding: '8px 14px', fontSize: 12, background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', opacity: savingNote ? 0.5 : 1 }}>저장</button>
                        </div>
                        {customerNotes.length === 0 ? <p style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center', padding: 20 }}>이력 없음</p> :
                          customerNotes.map(n => (
                            <div key={n.id} style={{ padding: 10, marginBottom: 6, background: '#f9fafb', borderRadius: 6, border: '1px solid #f3f4f6' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>
                                <span style={{ fontWeight: 500, color: '#374151' }}>{n.author_name}</span>
                                <span>{fmtFull(n.created_at)}</span>
                              </div>
                              <p style={{ fontSize: 12, color: '#374151', margin: 0 }}>{n.content}</p>
                            </div>
                          ))
                        }
                      </>
                    ) : <p style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center', padding: 20 }}>고객 미연결</p>}
                  </div>
                )}
                {detailTab === 'billing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <DSection title="보험 처리">
                      <DRow l="보험사" v={selected.insurance_company || '-'} />
                      <DRow l="접수번호" v={selected.insurance_claim_no || '-'} />
                      <DRow l="접수일" v={fmt(selected.insurance_filed_at)} />
                      <DRow l="상태" v={INS_ST[selected.insurance_status || ''] || selected.insurance_status || '-'} />
                    </DSection>
                    <DSection title="청구/입금">
                      <DRow l="대차일수" v={selected.replacement_start && selected.replacement_end ? `${Math.ceil((new Date(selected.replacement_end).getTime() - new Date(selected.replacement_start).getTime()) / 86400000)}일` : '-'} />
                      <DRow l="대차비" v={fmtNum(selected.replacement_cost)} />
                      <DRow l="보험입금" v={fmtNum(selected.insurance_payout)} />
                      <DRow l="면책금" v={fmtNum(selected.customer_deductible)} />
                      <DRow l="수리비" v={fmtNum(selected.actual_repair_cost || selected.estimated_repair_cost)} />
                    </DSection>
                  </div>
                )}
                {detailTab === 'ai' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Analysis trigger */}
                    {!aiAnalysis && !aiLoading && (
                      <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
                        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>접수 내용을 AI가 분석합니다</p>
                        <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 16 }}>예상 과실비율, 유사 판례, 보험사기 의심 포인트를 확인합니다</p>
                        <button onClick={() => runAiAnalysis(selected)}
                          style={{ padding: '10px 24px', fontSize: 13, fontWeight: 600, background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                          AI 분석 시작
                        </button>
                        {aiError && <p style={{ marginTop: 12, fontSize: 12, color: '#ef4444' }}>{aiError}</p>}
                      </div>
                    )}
                    {aiLoading && (
                      <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <div style={{ fontSize: 24, marginBottom: 8, animation: 'spin 1s linear infinite' }}>⚙️</div>
                        <p style={{ fontSize: 13, color: '#6b7280' }}>AI 분석 중...</p>
                        <p style={{ fontSize: 11, color: '#9ca3af' }}>약 5-10초 소요</p>
                      </div>
                    )}
                    {aiAnalysis && (
                      <>
                        {/* 과실 분석 */}
                        <DSection title="⚖️ 예상 과실 분석">
                          <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>
                                우리측 과실 {aiAnalysis.faultAnalysis?.estimatedFaultRatio ?? '-'}%
                              </span>
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4,
                                background: aiAnalysis.faultAnalysis?.confidence === 'high' ? '#dcfce7' : aiAnalysis.faultAnalysis?.confidence === 'medium' ? '#fef9c3' : '#fee2e2',
                                color: aiAnalysis.faultAnalysis?.confidence === 'high' ? '#166534' : aiAnalysis.faultAnalysis?.confidence === 'medium' ? '#854d0e' : '#991b1b',
                                fontWeight: 600 }}>
                                신뢰도 {aiAnalysis.faultAnalysis?.confidence === 'high' ? '높음' : aiAnalysis.faultAnalysis?.confidence === 'medium' ? '보통' : '낮음'}
                              </span>
                            </div>
                            <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: 0 }}>{aiAnalysis.faultAnalysis?.reasoning}</p>
                          </div>
                          {aiAnalysis.faultAnalysis?.keyFactors?.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>핵심 판정 요소</div>
                              {aiAnalysis.faultAnalysis.keyFactors.map((f: string, i: number) => (
                                <div key={i} style={{ fontSize: 12, color: '#374151', padding: '3px 0', display: 'flex', gap: 6 }}>
                                  <span style={{ color: '#4f46e5' }}>•</span> {f}
                                </div>
                              ))}
                            </div>
                          )}
                          {aiAnalysis.faultAnalysis?.recommendation && (
                            <div style={{ padding: 10, background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe' }}>
                              <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 600, marginBottom: 2 }}>💡 협상 참고</div>
                              <p style={{ fontSize: 12, color: '#1e40af', margin: 0, lineHeight: 1.5 }}>{aiAnalysis.faultAnalysis.recommendation}</p>
                            </div>
                          )}
                        </DSection>

                        {/* 유사 판례 */}
                        {aiAnalysis.similarCases?.length > 0 && (
                          <DSection title="📚 유사 사례/판례">
                            {aiAnalysis.similarCases.map((c: any, i: number) => (
                              <div key={i} style={{ padding: 10, marginBottom: 6, background: '#f9fafb', borderRadius: 6, border: '1px solid #f3f4f6' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{c.title}</div>
                                <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px 0', lineHeight: 1.5 }}>{c.summary}</p>
                                <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                                  <span style={{ color: '#4f46e5', fontWeight: 500 }}>과실: {c.faultRatio}</span>
                                  <span style={{ color: '#6b7280' }}>{c.relevance}</span>
                                </div>
                              </div>
                            ))}
                          </DSection>
                        )}

                        {/* 보험사기 탐지 */}
                        <DSection title="🔍 보험사기 의심 분석">
                          <div style={{ padding: 12, borderRadius: 8, marginBottom: 8,
                            background: aiAnalysis.fraudDetection?.riskLevel === 'high' ? '#fef2f2' : aiAnalysis.fraudDetection?.riskLevel === 'medium' ? '#fffbeb' : '#f0fdf4',
                            border: `1px solid ${aiAnalysis.fraudDetection?.riskLevel === 'high' ? '#fecaca' : aiAnalysis.fraudDetection?.riskLevel === 'medium' ? '#fde68a' : '#bbf7d0'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 13, fontWeight: 700,
                                color: aiAnalysis.fraudDetection?.riskLevel === 'high' ? '#991b1b' : aiAnalysis.fraudDetection?.riskLevel === 'medium' ? '#92400e' : '#166534' }}>
                                위험도: {aiAnalysis.fraudDetection?.riskLevel === 'high' ? '높음 ⚠️' : aiAnalysis.fraudDetection?.riskLevel === 'medium' ? '보통 ⚡' : '낮음 ✅'}
                              </span>
                              <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace',
                                color: aiAnalysis.fraudDetection?.riskLevel === 'high' ? '#dc2626' : aiAnalysis.fraudDetection?.riskLevel === 'medium' ? '#d97706' : '#16a34a' }}>
                                {aiAnalysis.fraudDetection?.riskScore ?? '-'}점
                              </span>
                            </div>
                          </div>
                          {aiAnalysis.fraudDetection?.suspiciousPoints?.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              {aiAnalysis.fraudDetection.suspiciousPoints.map((p: any, i: number) => (
                                <div key={i} style={{ padding: 8, marginBottom: 4, borderRadius: 6, border: '1px solid #f3f4f6', background: '#fff' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                                      {p.severity === 'high' ? '🔴' : p.severity === 'medium' ? '🟡' : '🟢'} {p.point}
                                    </span>
                                  </div>
                                  <p style={{ fontSize: 11, color: '#6b7280', margin: 0, lineHeight: 1.4 }}>{p.detail}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {aiAnalysis.fraudDetection?.recommendation && (
                            <div style={{ padding: 10, background: '#fef3c7', borderRadius: 6, border: '1px solid #fde68a' }}>
                              <div style={{ fontSize: 11, color: '#92400e', fontWeight: 600, marginBottom: 2 }}>📋 조사팀 권고</div>
                              <p style={{ fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.5 }}>{aiAnalysis.fraudDetection.recommendation}</p>
                            </div>
                          )}
                        </DSection>

                        {/* 종합 의견 */}
                        {aiAnalysis.summary && (
                          <DSection title="📝 종합 의견">
                            <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: 0, padding: 10, background: '#f9fafb', borderRadius: 6 }}>{aiAnalysis.summary}</p>
                          </DSection>
                        )}

                        <button onClick={() => runAiAnalysis(selected)}
                          style={{ width: '100%', padding: '8px', fontSize: 12, color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', marginTop: 4 }}>
                          🔄 재분석
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── SMS Modal ── */}
      {showSmsModal && smsTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSmsModal(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>문자 발송</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>{smsTarget.name} ({smsTarget.phone})</p>
            <textarea value={smsMessage} onChange={e => setSmsMessage(e.target.value)} rows={4} placeholder="메시지..." style={{ width: '100%', padding: 10, fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'none', outline: 'none' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setShowSmsModal(false)} style={{ padding: '8px 16px', fontSize: 13, background: '#f3f4f6', border: 'none', borderRadius: 6, cursor: 'pointer' }}>취소</button>
              <button onClick={sendSms} disabled={smsSending || !smsMessage.trim()} style={{ padding: '8px 16px', fontSize: 13, background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', opacity: smsSending ? 0.5 : 1 }}>{smsSending ? '발송중...' : '발송'}</button>
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>빠른 템플릿</div>
              {['배차 일정 확인 부탁드립니다.', '대차 차량 반납 안내드립니다.', '보험 청구 관련 연락드립니다.'].map((t, i) => (
                <button key={i} onClick={() => setSmsMessage(`안녕하세요, 셀프디스럽션입니다. ${t}`)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 12, background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 4, cursor: 'pointer', marginBottom: 4, color: '#374151' }}>{t}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// Shared Style & Components
// ============================================
const selectStyle: React.CSSProperties = { padding: '6px 10px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none', background: '#fff', color: '#374151' }

function PipeBtn({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', fontSize: 12, fontWeight: active ? 600 : 400, borderRadius: 6,
      border: active ? `1.5px solid ${color}` : '1px solid #e5e7eb',
      background: active ? `${color}10` : '#fff', color: active ? color : '#6b7280',
      cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s',
    }}>{label}</button>
  )
}

function Th({ children, w, onClick, active, dir }: { children: React.ReactNode; w?: number; onClick?: () => void; active?: boolean; dir?: string }) {
  return (
    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', width: w, cursor: onClick ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap', background: '#f9fafb' }} onClick={onClick}>
      {children}{active && <span style={{ marginLeft: 2 }}>{dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: '10px 10px', ...style }}>{children}</td>
}
function QBtn({ label, onClick, color }: { label: string; onClick: () => void; color?: string }) {
  return <button onClick={onClick} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 4, border: `1px solid ${color || '#4f46e5'}22`, background: `${color || '#4f46e5'}08`, color: color || '#4f46e5', cursor: 'pointer', fontWeight: 500 }}>{label}</button>
}
function DSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>{children}</div>
}
function DRow({ l, v, phone }: { l: string; v: string | number | null | undefined; phone?: boolean }) {
  const d = v == null || v === '' ? '-' : String(v)
  return (
    <div style={{ display: 'flex', fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f9fafb' }}>
      <span style={{ width: 70, color: '#9ca3af', flexShrink: 0 }}>{l}</span>
      {phone && d !== '-' ? <a href={`tel:${d}`} style={{ color: '#4f46e5', textDecoration: 'none' }}>{d}</a> : <span style={{ color: '#374151' }}>{d}</span>}
    </div>
  )
}
