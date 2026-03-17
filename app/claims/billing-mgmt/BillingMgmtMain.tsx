'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

// ============================================
// Types
// ============================================
type Accident = Record<string, string>

// ============================================
// Constants
// ============================================
const STATUS_MAP: Record<string, { label: string; bg: string }> = {
  '10': { label: '접수대기', bg: 'bg-red-100 text-red-700' },
  '15': { label: '담당배정', bg: 'bg-orange-100 text-orange-700' },
  '20': { label: '검수중', bg: 'bg-yellow-100 text-yellow-700' },
  '30': { label: '공장배정', bg: 'bg-blue-100 text-blue-700' },
  '40': { label: '공장입고', bg: 'bg-purple-100 text-purple-700' },
  '45': { label: '조사중', bg: 'bg-cyan-100 text-cyan-700' },
  '50': { label: '수리중', bg: 'bg-violet-100 text-violet-700' },
  '55': { label: '수리완료', bg: 'bg-blue-100 text-blue-700' },
  '60': { label: '출고완료', bg: 'bg-emerald-100 text-emerald-700' },
  '70': { label: '청구중', bg: 'bg-amber-100 text-amber-700' },
  '80': { label: '손해사정', bg: 'bg-orange-100 text-orange-700' },
  '85': { label: '지급대기', bg: 'bg-yellow-100 text-yellow-700' },
  '90': { label: '종결', bg: 'bg-green-100 text-green-700' },
}

const CATEGORY_MAP: Record<string, string> = {
  A: '자차', B: '대물', C: '대인', D: '자손', E: '무보험',
}

const TABS = [
  { key: 'rental', label: '대차관리', icon: '🚙' },
  { key: 'billing', label: '보험/일반청구', icon: '💰' },
  { key: 'closure', label: '종결', icon: '✅' },
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

function InfoRow({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  const v = value?.trim() || '-'
  if (v === '-' && !highlight) return null
  return (
    <div>
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

// ============================================
// Tab Content Components
// ============================================
function TabRental({ a }: { a: Accident }) {
  // 대차 기간 계산
  const calcDays = () => {
    if (!a.rentalFromDate || !a.rentalToDate || a.rentalFromDate.length < 8 || a.rentalToDate.length < 8) return null
    const from = new Date(`${a.rentalFromDate.slice(0,4)}-${a.rentalFromDate.slice(4,6)}-${a.rentalFromDate.slice(6,8)}`)
    const to = new Date(`${a.rentalToDate.slice(0,4)}-${a.rentalToDate.slice(4,6)}-${a.rentalToDate.slice(6,8)}`)
    const diff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
    return diff >= 0 ? diff : null
  }
  const days = calcDays()

  return (
    <div className="space-y-1">
      <SectionHeader icon="🚙" title="대차 상세 정보" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
        <InfoRow label="대차여부" value={fYN(a.rentalYn)} highlight />
        <InfoRow label="대차상태" value={a.rentalStatus} />
        <InfoRow label="대차유형" value={a.rentalType} highlight />
        <InfoRow label="대차업체" value={a.rentalFactory} highlight />
        <InfoRow label="대차차량" value={a.rentalCarNo ? `${a.rentalCarModel || ''} (${a.rentalCarNo})` : null} />
        <InfoRow label="시작일" value={a.rentalFromDate ? `${fD(a.rentalFromDate)} ${fT(a.rentalFromTime)}` : null} />
        <InfoRow label="종료일" value={a.rentalToDate ? `${fD(a.rentalToDate)} ${fT(a.rentalToTime)}` : null} />
        {days !== null && <InfoRow label="대차일수" value={`${days}일`} highlight />}
        <InfoRow label="이용자" value={a.rentalUser} />
        <InfoRow label="이용자연락처" value={a.rentalUserPhone} />
        <InfoRow label="요청일" value={fD(a.requestDate)} />
      </div>
      {a.rentalMemo && (
        <div className="mt-2"><p className="text-[11px] text-slate-400 font-medium">대차메모</p><p className="text-sm text-slate-700 bg-slate-50 p-2 rounded">{a.rentalMemo}</p></div>
      )}

      <SectionHeader icon="🚗" title="관련 사고 요약" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <InfoRow label="사고번호" value={a.accidentNo} />
        <InfoRow label="사고일시" value={fDT(a.accidentDate, a.accidentTime)} />
        <InfoRow label="장소" value={a.accidentLocation} />
        <InfoRow label="과실" value={a.faultRate ? `${a.faultRate}%` : null} />
        <InfoRow label="상대방" value={a.counterpartName} />
        <InfoRow label="보험사" value={a.counterpartInsurance} />
        <InfoRow label="파손부위" value={a.damageArea} />
        <InfoRow label="예상금액" value={fWon(a.estimatedCost)} />
        <InfoRow label="공장" value={a.repairShopName} />
      </div>
    </div>
  )
}

function TabBilling({ a }: { a: Accident }) {
  return (
    <div className="space-y-1">
      <SectionHeader icon="💰" title="보험/일반 청구" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
        <InfoRow label="보상번호" value={a.bdNo} highlight />
        <InfoRow label="보상명" value={a.bdName} />
        <InfoRow label="청구금액" value={fWon(a.estimatedCost)} highlight />
        <InfoRow label="목표금액" value={fWon(a.targetAmount)} />
        <InfoRow label="과실비율" value={a.faultRate ? `${a.faultRate}%` : null} />
        <InfoRow label="정산여부" value={fYN(a.settlementYn)} />
        <InfoRow label="면책여부" value={fYN(a.deductYn)} />
        <InfoRow label="보험구분" value={a.insuranceFlag} />
        <InfoRow label="보험시간" value={a.insuranceTime} />
        <InfoRow label="보험담당" value={a.insuranceUser} />
        <InfoRow label="검사일자" value={fD(a.examDate)} />
      </div>

      <SectionHeader icon="🔧" title="공장 정보" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <InfoRow label="공장명" value={a.repairShopName} />
        <InfoRow label="공장코드" value={a.repairShopCode} />
        <InfoRow label="전화" value={a.repairShopPhone} />
        <InfoRow label="은행" value={a.repairShopBh} />
        <InfoRow label="계좌" value={a.repairShopBn} />
        <InfoRow label="결과" value={a.repairShopRs} />
      </div>

      <SectionHeader icon="👤" title="상대방/보험사" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <InfoRow label="상대방" value={a.counterpartName} />
        <InfoRow label="전화" value={a.counterpartPhone} />
        <InfoRow label="차량" value={a.counterpartVehicle} />
        <InfoRow label="보험사" value={a.counterpartInsurance} />
        <InfoRow label="상대과실" value={fYN(a.counterpartFault)} />
      </div>
    </div>
  )
}

function TabClosure({ a }: { a: Accident }) {
  const isClosed = a.status === '90'
  return (
    <div className="space-y-1">
      {/* 종결 상태 배너 */}
      <div className={`p-3 rounded-lg text-center ${isClosed ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
        <span className={`text-lg font-bold ${isClosed ? 'text-green-700' : 'text-amber-700'}`}>
          {isClosed ? '✅ 종결 완료' : '⏳ 미종결'}
        </span>
        <p className={`text-xs mt-1 ${isClosed ? 'text-green-600' : 'text-amber-600'}`}>
          {isClosed ? '이 사고건은 종결 처리되었습니다.' : '아직 처리 중인 사고건입니다.'}
        </p>
      </div>

      <SectionHeader icon="📊" title="최종 정산 현황" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
        <InfoRow label="현재 상태" value={STATUS_MAP[a.status]?.label || a.status} highlight />
        <InfoRow label="청구금액" value={fWon(a.estimatedCost)} highlight />
        <InfoRow label="목표금액" value={fWon(a.targetAmount)} />
        <InfoRow label="정산여부" value={fYN(a.settlementYn)} />
        <InfoRow label="면책여부" value={fYN(a.deductYn)} />
        <InfoRow label="완료여부" value={fYN(a.completeYn)} />
        <InfoRow label="반납여부" value={fYN(a.returnYn)} />
        <InfoRow label="보상번호" value={a.bdNo} />
      </div>

      <SectionHeader icon="🤝" title="인수자 최종 정보" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <InfoRow label="성명" value={a.handoverName} />
        <InfoRow label="전화" value={a.handoverPhone} />
        <InfoRow label="담당" value={a.handoverUser} />
        <InfoRow label="은행" value={a.handoverBm} />
        <InfoRow label="계좌" value={a.handoverBn} />
        <InfoRow label="예금주" value={a.handoverBu} />
        <InfoRow label="메모" value={a.handoverMemo} />
      </div>

      <SectionHeader icon="📋" title="처리 이력" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <InfoRow label="등록자" value={a.createdBy} />
        <InfoRow label="등록일시" value={fDT(a.createdDate, a.createdTime)} />
        <InfoRow label="수정자" value={a.updatedBy} />
        <InfoRow label="수정일시" value={fDT(a.updatedDate, a.updatedTime)} />
      </div>
    </div>
  )
}

// ============================================
// Main Component
// ============================================
export default function BillingMgmtMain() {
  const { user } = useApp()
  const [accidents, setAccidents] = useState<Accident[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('rental')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/cafe24/accidents?limit=500`)
      const json = await res.json()
      if (json.success) setAccidents(json.data || [])
    } catch (e) {
      console.error('청구관리 로드 에러:', e)
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
        a.counterpartInsurance?.toLowerCase().includes(s) ||
        a.rentalFactory?.toLowerCase().includes(s) ||
        a.bdNo?.toLowerCase().includes(s) ||
        a.counterpartName?.toLowerCase().includes(s) ||
        a.rentalCarNo?.toLowerCase().includes(s)
      )
    }
    result.sort((a, b) => (b.receiptDate || '').localeCompare(a.receiptDate || ''))
    return result
  }, [accidents, search])

  const stats = useMemo(() => {
    return {
      전체: accidents.length,
      대차진행: accidents.filter(a => a.rentalYn === 'Y').length,
      청구중: accidents.filter(a => ['70', '80', '85'].includes(a.status)).length,
      종결: accidents.filter(a => a.status === '90').length,
      미정산: accidents.filter(a => a.settlementYn !== 'Y' && parseInt(a.status) >= 70).length,
    }
  }, [accidents])

  // 총 청구액
  const totalCost = useMemo(() => {
    return accidents
      .filter(a => parseInt(a.status) >= 70)
      .reduce((sum, a) => sum + (parseInt(a.estimatedCost) || 0), 0)
  }, [accidents])

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex-shrink-0">
        <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
          <span className="bg-gradient-to-r from-amber-500 to-green-500 bg-clip-text text-transparent">
            청구관리
          </span>
          <span className="text-xs font-normal text-slate-400 hidden sm:inline">
            대차관리 → 보험/일반청구 → 종결
          </span>
        </h1>
        <p className="text-[11px] text-slate-400 mt-0.5">대차운영, 보험청구, 종결 처리 통합 관리</p>
      </div>

      {/* Stats */}
      <div className="px-4 sm:px-6 py-3 flex-shrink-0">
        <div className="grid grid-cols-5 gap-2 mb-2">
          {[
            { label: '전체', value: stats.전체, color: 'from-slate-500 to-slate-600' },
            { label: '대차진행', value: stats.대차진행, color: 'from-blue-500 to-blue-600' },
            { label: '청구중', value: stats.청구중, color: 'from-amber-500 to-amber-600' },
            { label: '종결', value: stats.종결, color: 'from-green-500 to-green-600' },
            { label: '미정산', value: stats.미정산, color: 'from-red-500 to-red-600' },
          ].map((s, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg p-2 sm:p-3">
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">{s.label}</p>
              <p className={`text-lg sm:text-xl font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.value}</p>
            </div>
          ))}
        </div>
        {totalCost > 0 && (
          <div className="bg-gradient-to-r from-amber-50 to-green-50 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between">
            <span className="text-xs text-amber-700 font-medium">총 청구액</span>
            <span className="text-lg font-bold text-amber-700">₩{totalCost.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-4 sm:px-6 py-2 flex-shrink-0 border-b border-slate-200 bg-white">
        <input
          type="text"
          placeholder="사고번호, 보험사, 대차업체, 보상번호, 상대방, 차량번호 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                  <div
                    onClick={() => {
                      if (isExpanded) { setExpandedId(null) }
                      else {
                        setExpandedId(id)
                        // Auto-select: 대차 있으면 대차탭, 청구 이후면 청구탭, 종결이면 종결탭
                        if (a.status === '90') setActiveTab('closure')
                        else if (parseInt(a.status) >= 70) setActiveTab('billing')
                        else setActiveTab('rental')
                      }
                    }}
                    className={`bg-white border border-slate-200 ${isExpanded ? 'rounded-t-lg border-b-0' : 'rounded-lg'} p-3 cursor-pointer hover:shadow-md transition-shadow`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{a.accidentNo || '-'}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusInfo?.bg || 'bg-gray-100 text-gray-700'}`}>
                            {statusInfo?.label || a.status}
                          </span>
                          {a.category && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{CATEGORY_MAP[a.category] || a.category}</span>}
                          {a.settlementYn === 'Y' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">정산완료</span>}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-xs text-slate-600">
                          <span>사고: {fDT(a.accidentDate, a.accidentTime)}</span>
                          <span>상대방: {a.counterpartName || '-'}</span>
                          <span>보험: {a.counterpartInsurance || '-'}</span>
                          {a.rentalYn === 'Y' && <span className="text-blue-600 font-medium">대차: {a.rentalFactory || '-'} / {a.rentalType || '-'}</span>}
                          {a.estimatedCost && <span className="text-amber-600 font-semibold">청구: {fWon(a.estimatedCost)}</span>}
                          {a.bdNo && <span>보상번호: {a.bdNo}</span>}
                        </div>

                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {a.rentalYn === 'Y' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">대차:{a.rentalFactory || '있음'}</span>}
                          {a.rentalCarNo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">{a.rentalCarModel} ({a.rentalCarNo})</span>}
                          {a.deductYn === 'Y' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">면책</span>}
                        </div>
                      </div>
                      <span className="text-slate-400 text-lg ml-2 flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="bg-white border border-slate-200 border-t-0 rounded-b-lg overflow-hidden">
                      <div className="flex border-b border-slate-200 bg-slate-50">
                        {TABS.map(tab => (
                          <button
                            key={tab.key}
                            onClick={(e) => { e.stopPropagation(); setActiveTab(tab.key) }}
                            className={`flex-1 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
                              activeTab === tab.key
                                ? 'bg-white text-amber-700 border-b-2 border-amber-500 -mb-px'
                                : 'text-slate-500 hover:bg-slate-100'
                            }`}
                          >
                            <span>{tab.icon}</span>
                            <span>{tab.label}</span>
                          </button>
                        ))}
                      </div>

                      <div className="p-4">
                        {activeTab === 'rental' && <TabRental a={a} />}
                        {activeTab === 'billing' && <TabBilling a={a} />}
                        {activeTab === 'closure' && <TabClosure a={a} />}
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
