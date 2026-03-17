'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

// ============================================
// Types — acrotpth 전체 + acrrentm JOIN
// ============================================
type Accident = Record<string, string>

// ============================================
// Constants
// ============================================
const STATUS_MAP: Record<string, { label: string; bg: string; step: number }> = {
  '10': { label: '접수대기', bg: 'bg-red-100 text-red-700', step: 1 },
  '15': { label: '담당배정', bg: 'bg-orange-100 text-orange-700', step: 1 },
  '20': { label: '검수중', bg: 'bg-yellow-100 text-yellow-700', step: 2 },
  '30': { label: '공장배정', bg: 'bg-blue-100 text-blue-700', step: 2 },
  '40': { label: '공장입고', bg: 'bg-purple-100 text-purple-700', step: 2 },
  '45': { label: '조사중', bg: 'bg-cyan-100 text-cyan-700', step: 3 },
  '50': { label: '수리중', bg: 'bg-violet-100 text-violet-700', step: 3 },
  '55': { label: '수리완료', bg: 'bg-blue-100 text-blue-700', step: 3 },
  '60': { label: '출고완료', bg: 'bg-emerald-100 text-emerald-700', step: 3 },
  '70': { label: '청구중', bg: 'bg-amber-100 text-amber-700', step: 4 },
  '80': { label: '손해사정', bg: 'bg-orange-100 text-orange-700', step: 4 },
  '85': { label: '지급대기', bg: 'bg-yellow-100 text-yellow-700', step: 4 },
  '90': { label: '종결', bg: 'bg-green-100 text-green-700', step: 4 },
}

const CATEGORY_MAP: Record<string, string> = {
  A: '자차', B: '대물', C: '대인', D: '자손', E: '무보험',
}

const TABS = [
  { key: 'intake', label: '접수', icon: '📋', color: 'bg-red-500' },
  { key: 'investigation', label: '조사', icon: '🔍', color: 'bg-yellow-500' },
  { key: 'assessment', label: '사정', icon: '🔧', color: 'bg-cyan-500' },
  { key: 'factory-pay', label: '공장지급', icon: '💰', color: 'bg-green-500' },
]

// ============================================
// Helpers
// ============================================
const fD = (d: string | null) => {
  if (!d || d.length < 8) return '-'
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}
const fT = (t: string | null) => {
  if (!t || t.length < 4) return ''
  return `${t.slice(0, 2)}:${t.slice(2, 4)}`
}
const fDT = (d: string | null, t: string | null) => {
  const dd = fD(d); const tt = fT(t)
  return tt ? `${dd} ${tt}` : dd
}
const fYN = (v: string | null) => (!v ? '-' : v === 'Y' ? '예' : v === 'N' ? '아니오' : v)
const fWon = (v: string | null) => {
  if (!v || !v.trim()) return '-'
  const n = parseInt(v)
  return isNaN(n) ? v : `₩${n.toLocaleString()}`
}

// Reusable UI components
function InfoRow({ label, value, highlight, className }: { label: string; value: string | null | undefined; highlight?: boolean; className?: string }) {
  const v = value?.trim() || '-'
  if (v === '-' && !highlight) return null
  return (
    <div className={className}>
      <p className="text-[11px] text-slate-400 font-medium">{label}</p>
      <p className={`text-sm ${highlight ? 'font-semibold text-blue-700' : 'text-slate-700'}`}>{v}</p>
    </div>
  )
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-4 mb-2 first:mt-0">
      <span className="text-sm">{icon}</span>
      <span className="text-xs font-bold text-slate-600 tracking-wide">{title}</span>
      <div className="flex-1 h-px bg-slate-200 ml-1" />
    </div>
  )
}

// Step progress indicator
function StepProgress({ status }: { status: string }) {
  const currentStep = STATUS_MAP[status]?.step || 1
  const steps = ['접수', '조사', '사정', '지급']
  return (
    <div className="flex items-center gap-1 text-[10px]">
      {steps.map((s, i) => {
        const step = i + 1
        const done = step < currentStep
        const active = step === currentStep
        return (
          <div key={s} className="flex items-center gap-1">
            {i > 0 && <span className={`w-3 h-px ${done ? 'bg-green-400' : 'bg-slate-300'}`} />}
            <span className={`px-1.5 py-0.5 rounded ${
              done ? 'bg-green-100 text-green-700' :
              active ? 'bg-blue-500 text-white font-bold' :
              'bg-slate-100 text-slate-400'
            }`}>{done ? '✓' : step} {s}</span>
          </div>
        )
      })}
    </div>
  )
}

// ============================================
// Tab Content Components
// ============================================
function TabIntake({ a }: { a: Accident }) {
  return (
    <div className="space-y-1">
      <SectionHeader icon="🚗" title="사고 기본정보" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
        <InfoRow label="사고번호" value={a.accidentNo} highlight />
        <InfoRow label="사고유형" value={a.category ? (CATEGORY_MAP[a.category] || a.category) : null} />
        <InfoRow label="등록유형" value={a.regType} />
        <InfoRow label="등록상태" value={a.regStatus} />
        <InfoRow label="사고일시" value={fDT(a.accidentDate, a.accidentTime)} />
        <InfoRow label="사고장소" value={a.accidentLocation} />
        <InfoRow label="사고지점" value={a.accidentBranch} />
        <InfoRow label="과실비율" value={a.faultRate ? `${a.faultRate}%` : null} />
        <InfoRow label="사고원인" value={a.accidentReason} />
        <InfoRow label="사고구분" value={a.accidentDi} />
        <InfoRow label="사고피해" value={a.accidentDamage} />
        <InfoRow label="사고관할" value={a.accidentJc} />
        <InfoRow label="사고관할서" value={a.accidentJs} />
        <InfoRow label="사고자핸드폰" value={a.accidentMobile} />
        <InfoRow label="사고자전화" value={a.accidentTel} />
        <InfoRow label="접수자" value={a.createdBy} />
        <InfoRow label="접수일시" value={fDT(a.createdDate, a.createdTime)} />
      </div>
      {(a.accidentMemo || a.accidentEtc) && (
        <div className="mt-2 space-y-1.5">
          {a.accidentMemo && <div><p className="text-[11px] text-slate-400 font-medium">사고내용</p><p className="text-sm text-slate-700 bg-slate-50 p-2 rounded">{a.accidentMemo}</p></div>}
          {a.accidentEtc && <div><p className="text-[11px] text-slate-400 font-medium">기타</p><p className="text-sm text-slate-700 bg-slate-50 p-2 rounded">{a.accidentEtc}</p></div>}
        </div>
      )}

      <SectionHeader icon="👤" title="상대방 정보" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <InfoRow label="성명" value={a.counterpartName} />
        <InfoRow label="전화" value={a.counterpartPhone} />
        <InfoRow label="차량번호" value={a.counterpartVehicle} />
        <InfoRow label="차량정보" value={a.counterpartVehicleDesc} />
        <InfoRow label="보험사" value={a.counterpartInsurance} />
        <InfoRow label="상대과실" value={fYN(a.counterpartFault)} />
      </div>

      <SectionHeader icon="🚛" title="견인" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <InfoRow label="견인여부" value={fYN(a.towingYn)} />
        <InfoRow label="견인업체" value={a.towingCompany} />
        <InfoRow label="견인전화" value={a.towingPhone} />
      </div>

      <SectionHeader icon="🚙" title="대차 요약" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <InfoRow label="대차여부" value={fYN(a.rentalYn)} />
        <InfoRow label="대차유형" value={a.rentalType} />
        <InfoRow label="대차업체" value={a.rentalFactory} />
        <InfoRow label="대차차량" value={a.rentalCarNo ? `${a.rentalCarModel || ''} (${a.rentalCarNo})` : null} />
        <InfoRow label="기간" value={a.rentalFromDate ? `${fD(a.rentalFromDate)} ~ ${fD(a.rentalToDate)}` : null} />
      </div>
    </div>
  )
}

function TabInvestigation({ a }: { a: Accident }) {
  return (
    <div className="space-y-1">
      <SectionHeader icon="🔍" title="파손/조사 정보" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
        <InfoRow label="파손부위" value={a.damageArea} highlight />
        <InfoRow label="예상금액" value={fWon(a.estimatedCost)} highlight />
        <InfoRow label="목표금액" value={fWon(a.targetAmount)} />
        <InfoRow label="검사일자" value={fD(a.examDate)} />
        <InfoRow label="보험구분" value={a.insuranceFlag} />
        <InfoRow label="보험시간" value={a.insuranceTime} />
        <InfoRow label="보험담당" value={a.insuranceUser} />
      </div>

      {/* AI 파손 시뮬레이션 placeholder */}
      {a.damageArea && (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-xs font-bold text-slate-600 mb-2">AI 파손부위 시뮬레이션</p>
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 240 100" className="w-48 h-20 text-slate-300">
              <rect x="30" y="15" width="180" height="50" rx="8" fill="none" stroke="currentColor" strokeWidth="2"/>
              <circle cx="65" cy="70" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
              <circle cx="175" cy="70" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
              <rect x="50" y="20" width="25" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1"/>
              <rect x="165" y="20" width="25" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1"/>
            </svg>
            <div className="text-sm text-slate-600">
              <p className="font-semibold text-red-600">{a.damageArea}</p>
              <p className="text-xs text-slate-400">상세 시뮬레이션 개발 예정</p>
            </div>
          </div>
        </div>
      )}

      <SectionHeader icon="🚗" title="사고 요약" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <InfoRow label="사고일시" value={fDT(a.accidentDate, a.accidentTime)} />
        <InfoRow label="사고장소" value={a.accidentLocation} />
        <InfoRow label="과실비율" value={a.faultRate ? `${a.faultRate}%` : null} />
        <InfoRow label="사고원인" value={a.accidentReason} />
        <InfoRow label="상대방" value={a.counterpartName} />
        <InfoRow label="상대보험" value={a.counterpartInsurance} />
      </div>
    </div>
  )
}

function TabAssessment({ a }: { a: Accident }) {
  return (
    <div className="space-y-1">
      <SectionHeader icon="🔧" title="정비공장 상세" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
        <InfoRow label="공장명" value={a.repairShopName} highlight />
        <InfoRow label="공장코드" value={a.repairShopCode} />
        <InfoRow label="대표" value={a.repairShopRep} />
        <InfoRow label="사업자번호" value={a.repairShopLicense} />
        <InfoRow label="전화" value={a.repairShopPhone} />
        <InfoRow label="팩스" value={a.repairShopVp} />
        <InfoRow label="주소" value={a.repairShopAddr} />
        <InfoRow label="담당자" value={a.repairShopUser} />
        <InfoRow label="담당자전화" value={a.repairShopTel} />
        <InfoRow label="공장결과" value={a.repairShopRs} />
        <InfoRow label="주차" value={a.repairShopPk} />
        <InfoRow label="비고" value={a.repairShopRe} />
      </div>
      {a.repairShopMemo && (
        <div className="mt-2"><p className="text-[11px] text-slate-400 font-medium">탁송메모</p><p className="text-sm text-slate-700 bg-slate-50 p-2 rounded">{a.repairShopMemo}</p></div>
      )}

      <SectionHeader icon="📊" title="손해사정" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
        <InfoRow label="파손부위" value={a.damageArea} highlight />
        <InfoRow label="예상금액" value={fWon(a.estimatedCost)} highlight />
        <InfoRow label="목표금액" value={fWon(a.targetAmount)} />
        <InfoRow label="면책여부" value={fYN(a.deductYn)} />
        <InfoRow label="완료여부" value={fYN(a.completeYn)} />
        <InfoRow label="반납여부" value={fYN(a.returnYn)} />
      </div>
    </div>
  )
}

function TabFactoryPay({ a }: { a: Accident }) {
  return (
    <div className="space-y-1">
      <SectionHeader icon="💰" title="공장 지급 정보" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
        <InfoRow label="공장명" value={a.repairShopName} highlight />
        <InfoRow label="은행" value={a.repairShopBh} highlight />
        <InfoRow label="계좌" value={a.repairShopBn} highlight />
        <InfoRow label="예상수리비" value={fWon(a.estimatedCost)} highlight />
        <InfoRow label="정산여부" value={fYN(a.settlementYn)} />
        <InfoRow label="면책여부" value={fYN(a.deductYn)} />
        <InfoRow label="보상번호" value={a.bdNo} />
        <InfoRow label="보상명" value={a.bdName} />
      </div>

      <SectionHeader icon="🤝" title="인수자 정보" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <InfoRow label="성명" value={a.handoverName} />
        <InfoRow label="전화" value={a.handoverPhone} />
        <InfoRow label="담당" value={a.handoverUser} />
        <InfoRow label="은행" value={a.handoverBm} />
        <InfoRow label="계좌" value={a.handoverBn} />
        <InfoRow label="예금주" value={a.handoverBu} />
        <InfoRow label="은행전화" value={a.handoverBh} />
        <InfoRow label="메모" value={a.handoverMemo} />
      </div>

      <SectionHeader icon="📋" title="등록/수정 이력" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <InfoRow label="등록자" value={a.createdBy} />
        <InfoRow label="등록일시" value={fDT(a.createdDate, a.createdTime)} />
        <InfoRow label="수정자" value={a.updatedBy} />
        <InfoRow label="수정일시" value={fDT(a.updatedDate, a.updatedTime)} />
        <InfoRow label="그룹ID" value={a.groupId} />
        <InfoRow label="채널ID" value={a.channelId} />
      </div>
    </div>
  )
}

// ============================================
// Main Component
// ============================================
export default function AccidentMgmtMain() {
  const { user } = useApp()
  const [accidents, setAccidents] = useState<Accident[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('intake')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/cafe24/accidents?limit=500`)
      const json = await res.json()
      if (json.success) setAccidents(json.data || [])
    } catch (e) {
      console.error('사고관리 로드 에러:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let result = [...accidents]
    if (search) {
      const s = search.toLowerCase()
      result = result.filter(a =>
        a.accidentNo?.toLowerCase().includes(s) ||
        a.counterpartName?.toLowerCase().includes(s) ||
        a.accidentLocation?.toLowerCase().includes(s) ||
        a.accidentMobile?.toLowerCase().includes(s) ||
        a.repairShopName?.toLowerCase().includes(s) ||
        a.damageArea?.toLowerCase().includes(s)
      )
    }
    // Sort by latest receipt date
    result.sort((a, b) => (b.receiptDate || '').localeCompare(a.receiptDate || ''))
    return result
  }, [accidents, search])

  // Stats
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    return {
      전체: accidents.length,
      접수: accidents.filter(a => ['10', '15'].includes(a.status)).length,
      조사중: accidents.filter(a => ['20', '30', '40'].includes(a.status)).length,
      수리중: accidents.filter(a => ['45', '50', '55', '60'].includes(a.status)).length,
      청구이후: accidents.filter(a => parseInt(a.status) >= 70).length,
    }
  }, [accidents])

  const handleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      // Auto-select tab based on status
      const acc = accidents.find(a => `${a.staffId}-${a.receiptDate}-${a.seqNo}` === id)
      if (acc) {
        const step = STATUS_MAP[acc.status]?.step || 1
        setActiveTab(TABS[Math.min(step - 1, 3)].key)
      }
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex-shrink-0">
        <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
          <span className="bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
            사고관리
          </span>
          <span className="text-xs font-normal text-slate-400 hidden sm:inline">
            접수 → 조사 → 손해사정 → 공장지급
          </span>
        </h1>
        <p className="text-[11px] text-slate-400 mt-0.5">Cafe24 ERP 전체 필드 연동 · 탭 전환으로 단계별 정보 확인</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-2 px-4 sm:px-6 py-3 flex-shrink-0">
        {[
          { label: '전체', value: stats.전체, color: 'from-slate-500 to-slate-600' },
          { label: '접수', value: stats.접수, color: 'from-red-500 to-red-600' },
          { label: '조사중', value: stats.조사중, color: 'from-yellow-500 to-yellow-600' },
          { label: '수리중', value: stats.수리중, color: 'from-cyan-500 to-cyan-600' },
          { label: '청구이후', value: stats.청구이후, color: 'from-green-500 to-green-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-lg p-2 sm:p-3">
            <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">{s.label}</p>
            <p className={`text-lg sm:text-xl font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="px-4 sm:px-6 py-2 flex-shrink-0 border-b border-slate-200 bg-white">
        <input
          type="text"
          placeholder="사고번호, 상대방, 장소, 연락처, 공장명, 파손부위 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-400">로딩중...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-400">데이터가 없습니다</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => {
              const id = `${a.staffId}-${a.receiptDate}-${a.seqNo}`
              const isExpanded = expandedId === id
              const statusInfo = STATUS_MAP[a.status]

              return (
                <div key={id}>
                  {/* Card */}
                  <div
                    onClick={() => handleExpand(id)}
                    className={`bg-white border border-slate-200 ${isExpanded ? 'rounded-t-lg border-b-0' : 'rounded-lg'} p-3 cursor-pointer hover:shadow-md transition-shadow`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        {/* Row 1: ID + badges */}
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{a.accidentNo || '-'}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusInfo?.bg || 'bg-gray-100 text-gray-700'}`}>
                            {statusInfo?.label || a.status}
                          </span>
                          {a.category && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                              {CATEGORY_MAP[a.category] || a.category}
                            </span>
                          )}
                        </div>

                        {/* Row 2: Key info grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-xs text-slate-600">
                          <span>접수: {fDT(a.createdDate, a.createdTime)}</span>
                          <span>사고: {fDT(a.accidentDate, a.accidentTime)}</span>
                          <span>위치: {a.accidentLocation || '-'}</span>
                          <span>상대: {a.counterpartName || '-'}</span>
                          <span>과실: {a.faultRate || '-'}%</span>
                          <span>연락: {a.accidentMobile || a.accidentTel || '-'}</span>
                        </div>

                        {/* Row 3: Tags + Step progress */}
                        <div className="flex items-center justify-between mt-1.5">
                          <div className="flex flex-wrap gap-1">
                            {a.towingYn === 'Y' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">견인</span>}
                            {a.rentalYn === 'Y' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">대차</span>}
                            {a.repairShopName && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">공장:{a.repairShopName}</span>}
                            {a.damageArea && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">파손:{a.damageArea}</span>}
                            {a.estimatedCost && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">{fWon(a.estimatedCost)}</span>}
                          </div>
                          <StepProgress status={a.status} />
                        </div>
                      </div>
                      <span className="text-slate-400 text-lg ml-2 flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded Detail with Tabs */}
                  {isExpanded && (
                    <div className="bg-white border border-slate-200 border-t-0 rounded-b-lg overflow-hidden">
                      {/* Tab bar */}
                      <div className="flex border-b border-slate-200 bg-slate-50">
                        {TABS.map(tab => (
                          <button
                            key={tab.key}
                            onClick={(e) => { e.stopPropagation(); setActiveTab(tab.key) }}
                            className={`flex-1 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
                              activeTab === tab.key
                                ? 'bg-white text-blue-700 border-b-2 border-blue-500 -mb-px'
                                : 'text-slate-500 hover:bg-slate-100'
                            }`}
                          >
                            <span>{tab.icon}</span>
                            <span>{tab.label}</span>
                          </button>
                        ))}
                      </div>

                      {/* Tab content */}
                      <div className="p-4">
                        {activeTab === 'intake' && <TabIntake a={a} />}
                        {activeTab === 'investigation' && <TabInvestigation a={a} />}
                        {activeTab === 'assessment' && <TabAssessment a={a} />}
                        {activeTab === 'factory-pay' && <TabFactoryPay a={a} />}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
