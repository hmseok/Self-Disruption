'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

// ============================================
// Types — acrotpth 전체 필드
// ============================================
type Accident = {
  staffId: string; receiptDate: string; seqNo: string
  accidentNo: string; status: string; regStatus: string; category: string; regType: string
  accidentDate: string; accidentTime: string; accidentLocation: string; accidentMemo: string
  faultRate: string; accidentBranch: string; accidentReason: string; accidentDi: string
  accidentDamage: string; accidentJc: string; accidentJs: string
  accidentMobile: string; accidentTel: string; accidentEtc: string; adFlag: string
  repairShopName: string; repairShopRep: string; repairShopLicense: string; repairShopPhone: string
  repairShopVp: string; repairShopAddr: string; repairShopBh: string; repairShopBn: string
  repairShopUser: string; repairShopTel: string; repairShopRe: string; repairShopCode: string
  repairShopRs: string; repairShopPk: string; repairShopMemo: string
  towingYn: string; towingCompany: string; towingPhone: string
  counterpartName: string; counterpartPhone: string; counterpartVehicle: string
  counterpartVehicleDesc: string; counterpartInsurance: string; counterpartFault: string
  handoverName: string; handoverPhone: string; handoverUser: string; handoverMemo: string
  handoverBm: string; handoverBn: string; handoverBu: string; handoverBh: string
  settlementYn: string; rentalYn: string; returnYn: string; completeYn: string; deductYn: string
  bdNo: string; bdName: string; pkNo: string; pkName: string; targetAmount: string
  examDate: string; estimatedCost: string; damageArea: string
  insuranceFlag: string; insuranceTime: string; insuranceUser: string
  thYn: string; groupId: string; channelId: string
  createdBy: string; createdDate: string; createdTime: string
  updatedBy: string; updatedDate: string; updatedTime: string
  // 대차 JOIN
  rentalStatus: string; rentalFromDate: string; rentalFromTime: string
  rentalToDate: string; rentalToTime: string; rentalUser: string; rentalUserPhone: string
  rentalType: string; rentalCarNo: string; rentalCarModel: string
  rentalFactory: string; rentalMemo: string
}

const STATUS_MAP: Record<string, { label: string; bg: string }> = {
  '70': { label: '청구중', bg: 'bg-amber-100 text-amber-700' },
  '80': { label: '손해사정', bg: 'bg-orange-100 text-orange-700' },
  '85': { label: '지급대기', bg: 'bg-yellow-100 text-yellow-700' },
  '90': { label: '종결', bg: 'bg-green-100 text-green-700' },
}

const CATEGORY_MAP: Record<string, string> = {
  A: '자차', B: '대물', C: '대인', D: '자손', E: '무보험',
}

const FILTER_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: '70', label: '청구중' },
  { key: '80', label: '손해사정' },
  { key: '85', label: '지급대기' },
  { key: '90', label: '종결' },
]

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
    <div className="flex items-center gap-1.5 mt-3 mb-2 first:mt-0">
      <span className="text-sm">{icon}</span>
      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{title}</span>
      <div className="flex-1 h-px bg-slate-200 ml-1" />
    </div>
  )
}

export default function BillingMain() {
  const { user } = useApp()
  const [accidents, setAccidents] = useState<Accident[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/cafe24/accidents?limit=500`)
      const json = await res.json()
      if (json.success) setAccidents(json.data || [])
    } catch (e) {
      console.error('보험청구 목록 에러:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let result = [...accidents]
    if (statusFilter === 'all') {
      result = result.filter(a => ['70', '80', '85', '90'].includes(a.status))
    } else {
      result = result.filter(a => a.status === statusFilter)
    }
    if (search) {
      const s = search.toLowerCase()
      result = result.filter(a =>
        a.accidentNo?.toLowerCase().includes(s) ||
        a.counterpartInsurance?.toLowerCase().includes(s) ||
        a.repairShopName?.toLowerCase().includes(s) ||
        a.bdNo?.toLowerCase().includes(s)
      )
    }
    return result
  }, [accidents, statusFilter, search])

  const stats = useMemo(() => {
    const all = accidents.filter(a => ['70', '80', '85', '90'].includes(a.status))
    return {
      청구건수: all.length,
      미정산: all.filter(a => a.settlementYn !== 'Y').length,
      정산완료: all.filter(a => a.settlementYn === 'Y').length,
      종결: all.filter(a => a.status === '90').length,
    }
  }, [accidents])

  const costSummary = useMemo(() => {
    const all = accidents.filter(a => ['70', '80', '85', '90'].includes(a.status))
    const total = all.reduce((sum, a) => sum + (parseInt(a.estimatedCost) || 0), 0)
    return {
      총청구액: total,
      avgCost: Math.round(total / (all.length || 1)),
    }
  }, [accidents])

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex-shrink-0">
        <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
          <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">보험청구</span>
          <span className="text-xs font-normal text-slate-400 hidden sm:inline">Insurance Claims & Billing</span>
        </h1>
        <p className="text-[11px] text-slate-400 mt-0.5">보험청구, 지급추적, 사건 종결</p>
      </div>

      <div className="px-4 sm:px-6 py-3 flex-shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            { label: '청구건수', value: stats.청구건수, color: 'from-amber-500' },
            { label: '미정산', value: stats.미정산, color: 'from-red-500' },
            { label: '정산완료', value: stats.정산완료, color: 'from-green-500' },
            { label: '종결', value: stats.종결, color: 'from-blue-500' },
          ].map((stat, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-[11px] text-slate-500 font-medium">{stat.label}</p>
              <p className={`text-xl font-bold bg-gradient-to-r ${stat.color} to-blue-500 bg-clip-text text-transparent`}>{stat.value}</p>
            </div>
          ))}
        </div>
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-amber-600 font-medium">총 청구액</p>
              <p className="text-lg font-bold text-amber-700">{costSummary.총청구액 ? `₩${costSummary.총청구액.toLocaleString()}` : '-'}</p>
            </div>
            <div>
              <p className="text-[11px] text-amber-600 font-medium">평균 청구액</p>
              <p className="text-lg font-bold text-amber-700">{costSummary.avgCost ? `₩${costSummary.avgCost.toLocaleString()}` : '-'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-3 flex-shrink-0 border-b border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="text" placeholder="사고번호, 보험사, 공장명, 보상번호 검색..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <div className="flex gap-1 flex-wrap">
            {FILTER_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => setStatusFilter(opt.key)}
                className={`px-3 py-2 text-xs rounded-lg transition-colors ${statusFilter === opt.key ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-400">로딩중...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-400">데이터가 없습니다</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => {
              const id = `${a.staffId}-${a.receiptDate}-${a.seqNo}`
              const isExpanded = expandedId === id

              return (
                <div key={id}>
                  <div onClick={() => setExpandedId(isExpanded ? null : id)}
                    className={`bg-white border border-slate-200 ${isExpanded ? 'rounded-t-lg border-b-0' : 'rounded-lg'} p-3 cursor-pointer hover:shadow-md transition-shadow`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{a.accidentNo || '-'}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_MAP[a.status]?.bg || 'bg-gray-100 text-gray-700'}`}>
                            {STATUS_MAP[a.status]?.label || a.status}
                          </span>
                          {a.settlementYn === 'Y' && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">정산완료</span>}
                          {a.category && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{CATEGORY_MAP[a.category] || a.category}</span>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-600">
                          <p>사고: {fDT(a.accidentDate, a.accidentTime)}</p>
                          <p>보험: {a.counterpartInsurance || '-'}</p>
                          <p>보상번호: {a.bdNo || '-'}</p>
                          <p className="font-semibold text-orange-600">청구액: {a.estimatedCost ? `₩${parseInt(a.estimatedCost).toLocaleString()}` : '-'}</p>
                        </div>
                      </div>
                      <span className="text-slate-400 text-lg ml-2">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="bg-white border border-slate-200 border-t-0 rounded-b-lg p-4 text-sm space-y-1">
                      <SectionHeader icon="💰" title="청구/보상 현황" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
                        <InfoRow label="보상번호" value={a.bdNo} highlight />
                        <InfoRow label="보상명" value={a.bdName} />
                        <InfoRow label="청구금액" value={a.estimatedCost ? `₩${parseInt(a.estimatedCost).toLocaleString()}` : null} highlight />
                        <InfoRow label="목표금액" value={a.targetAmount ? `₩${parseInt(a.targetAmount).toLocaleString()}` : null} />
                        <InfoRow label="정산여부" value={fYN(a.settlementYn)} />
                        <InfoRow label="면책여부" value={fYN(a.deductYn)} />
                        <InfoRow label="완료여부" value={fYN(a.completeYn)} />
                        <InfoRow label="반납여부" value={fYN(a.returnYn)} />
                        <InfoRow label="보험구분" value={a.insuranceFlag} />
                        <InfoRow label="보험시간" value={a.insuranceTime} />
                        <InfoRow label="보험담당" value={a.insuranceUser} />
                        <InfoRow label="검사일자" value={fD(a.examDate)} />
                        <InfoRow label="과실비율" value={a.faultRate ? `${a.faultRate}%` : null} />
                      </div>

                      <SectionHeader icon="🔧" title="정비공장" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                        <InfoRow label="공장명" value={a.repairShopName} />
                        <InfoRow label="공장코드" value={a.repairShopCode} />
                        <InfoRow label="공장대표" value={a.repairShopRep} />
                        <InfoRow label="사업자번호" value={a.repairShopLicense} />
                        <InfoRow label="공장전화" value={a.repairShopPhone} />
                        <InfoRow label="공장주소" value={a.repairShopAddr} />
                        <InfoRow label="은행" value={a.repairShopBh} />
                        <InfoRow label="계좌" value={a.repairShopBn} />
                        <InfoRow label="결과" value={a.repairShopRs} />
                      </div>

                      <SectionHeader icon="🚗" title="사고 정보" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                        <InfoRow label="사고일시" value={fDT(a.accidentDate, a.accidentTime)} />
                        <InfoRow label="장소" value={a.accidentLocation} />
                        <InfoRow label="파손부위" value={a.damageArea} />
                        <InfoRow label="사고원인" value={a.accidentReason} />
                        <InfoRow label="사고유형" value={a.category ? (CATEGORY_MAP[a.category] || a.category) : null} />
                      </div>

                      <SectionHeader icon="👤" title="상대방" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                        <InfoRow label="성명" value={a.counterpartName} />
                        <InfoRow label="전화" value={a.counterpartPhone} />
                        <InfoRow label="차량번호" value={a.counterpartVehicle} />
                        <InfoRow label="차량정보" value={a.counterpartVehicleDesc} />
                        <InfoRow label="보험사" value={a.counterpartInsurance} />
                        <InfoRow label="상대과실" value={fYN(a.counterpartFault)} />
                      </div>

                      <SectionHeader icon="🤝" title="인수자" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                        <InfoRow label="성명" value={a.handoverName} />
                        <InfoRow label="전화" value={a.handoverPhone} />
                        <InfoRow label="은행" value={a.handoverBm} />
                        <InfoRow label="계좌" value={a.handoverBn} />
                        <InfoRow label="예금주" value={a.handoverBu} />
                        <InfoRow label="메모" value={a.handoverMemo} />
                      </div>

                      <SectionHeader icon="🚙" title="대차" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                        <InfoRow label="대차여부" value={fYN(a.rentalYn)} />
                        <InfoRow label="대차상태" value={a.rentalStatus} />
                        <InfoRow label="대차차량" value={a.rentalCarNo ? `${a.rentalCarModel || ''} (${a.rentalCarNo})` : null} />
                        <InfoRow label="대차유형" value={a.rentalType} />
                        <InfoRow label="대차업체" value={a.rentalFactory} />
                        <InfoRow label="기간" value={a.rentalFromDate ? `${fD(a.rentalFromDate)} ~ ${fD(a.rentalToDate)}` : null} />
                      </div>

                      <SectionHeader icon="📋" title="등록 이력" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                        <InfoRow label="등록자" value={a.createdBy} />
                        <InfoRow label="등록일시" value={fDT(a.createdDate, a.createdTime)} />
                        <InfoRow label="수정자" value={a.updatedBy} />
                        <InfoRow label="수정일시" value={fDT(a.updatedDate, a.updatedTime)} />
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
