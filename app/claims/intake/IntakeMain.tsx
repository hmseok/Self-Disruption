'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

// ============================================
// Types — acrotpth 전체 필드 + acrrentm JOIN 필드
// ============================================
type Accident = {
  // 키/식별
  staffId: string
  receiptDate: string
  seqNo: string
  accidentNo: string
  status: string
  regStatus: string
  category: string
  regType: string

  // 사고 기본정보
  accidentDate: string
  accidentTime: string
  accidentLocation: string
  accidentMemo: string
  faultRate: string
  accidentBranch: string
  accidentReason: string
  accidentDi: string
  accidentDamage: string
  accidentJc: string
  accidentJs: string
  accidentMobile: string
  accidentTel: string
  accidentPhoto: string
  accidentEtc: string
  adFlag: string

  // 정비공장
  repairShopName: string
  repairShopRep: string
  repairShopLicense: string
  repairShopPhone: string
  repairShopVp: string
  repairShopAddr: string
  repairShopBh: string
  repairShopBn: string
  repairShopUser: string
  repairShopTel: string
  repairShopRe: string
  repairShopCode: string
  repairShopRs: string
  repairShopPk: string
  repairShopMemo: string

  // 견인
  towingYn: string
  towingCompany: string
  towingPhone: string

  // 상대방
  counterpartName: string
  counterpartPhone: string
  counterpartVehicle: string
  counterpartVehicleDesc: string
  counterpartInsurance: string
  counterpartFault: string

  // 인수자
  handoverName: string
  handoverPhone: string
  handoverUser: string
  handoverMemo: string
  handoverBm: string
  handoverBn: string
  handoverBu: string
  handoverBh: string

  // 보상/처리
  settlementYn: string
  rentalYn: string
  returnYn: string
  completeYn: string
  deductYn: string
  bdNo: string
  bdName: string
  pkNo: string
  pkName: string
  targetAmount: string
  examDate: string
  estimatedCost: string
  damageArea: string
  insuranceFlag: string
  insuranceTime: string
  insuranceUser: string

  // 기타
  thYn: string
  groupId: string
  channelId: string
  createdBy: string
  createdDate: string
  createdTime: string
  updatedBy: string
  updatedDate: string
  updatedTime: string

  // 대차(JOIN) 필드
  rentalStatus: string
  rentalFromDate: string
  rentalFromTime: string
  rentalToDate: string
  rentalToTime: string
  rentalUser: string
  rentalUserPhone: string
  rentalType: string
  rentalCarNo: string
  rentalCarModel: string
  rentalFactory: string
  rentalMemo: string
}

// ============================================
// Constants
// ============================================
const STATUS_MAP: Record<string, { label: string; bg: string }> = {
  '10': { label: '접수대기', bg: 'bg-red-100 text-red-700' },
  '15': { label: '담당자배정', bg: 'bg-orange-100 text-orange-700' },
  '20': { label: '검수중', bg: 'bg-yellow-100 text-yellow-700' },
  '30': { label: '공장배정', bg: 'bg-blue-100 text-blue-700' },
  '40': { label: '공장입고', bg: 'bg-purple-100 text-purple-700' },
  '45': { label: '수리중', bg: 'bg-indigo-100 text-indigo-700' },
  '50': { label: '수리완료', bg: 'bg-cyan-100 text-cyan-700' },
  '55': { label: '출고', bg: 'bg-teal-100 text-teal-700' },
  '60': { label: '사정완료', bg: 'bg-green-100 text-green-700' },
  '70': { label: '청구중', bg: 'bg-amber-100 text-amber-700' },
  '80': { label: '청구완료', bg: 'bg-lime-100 text-lime-700' },
  '85': { label: '정산대기', bg: 'bg-emerald-100 text-emerald-700' },
  '90': { label: '완료', bg: 'bg-green-200 text-green-800' },
}

const CATEGORY_MAP: Record<string, string> = {
  A: '자차', B: '대물', C: '대인', D: '자손', E: '무보험',
}

const FILTER_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: '10', label: '접수대기' },
  { key: '15', label: '담당자배정' },
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
  const dd = fD(d)
  const tt = fT(t)
  return tt ? `${dd} ${tt}` : dd
}
const fYN = (v: string | null) => {
  if (!v) return '-'
  return v === 'Y' ? '예' : v === 'N' ? '아니오' : v
}

// 필드 라벨-값 쌍 렌더
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

// 섹션 헤더
function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-3 mb-2 first:mt-0">
      <span className="text-sm">{icon}</span>
      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{title}</span>
      <div className="flex-1 h-px bg-slate-200 ml-1" />
    </div>
  )
}

// ============================================
// Main Component
// ============================================
export default function IntakeMain() {
  const { user } = useApp()
  const [accidents, setAccidents] = useState<Accident[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Load ALL accidents (filter on client for flexible status viewing)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: '500' })
      const res = await fetch(`/api/cafe24/accidents?${p}`)
      const json = await res.json()
      if (json.success) {
        setAccidents(json.data || [])
      }
    } catch (e) {
      console.error('사고접수 목록 에러:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Filter
  const filtered = useMemo(() => {
    let result = [...accidents]

    // Default: show intake statuses (10, 15). 'all' shows everything.
    if (statusFilter === 'all') {
      result = result.filter(a => ['10', '15'].includes(a.status))
    } else {
      result = result.filter(a => a.status === statusFilter)
    }

    if (search) {
      const s = search.toLowerCase()
      result = result.filter(
        a =>
          a.accidentNo?.toLowerCase().includes(s) ||
          a.counterpartName?.toLowerCase().includes(s) ||
          a.accidentLocation?.toLowerCase().includes(s) ||
          a.accidentMobile?.toLowerCase().includes(s) ||
          a.repairShopName?.toLowerCase().includes(s)
      )
    }

    return result
  }, [accidents, statusFilter, search])

  // Stats
  const stats = useMemo(() => {
    const intakeAll = accidents.filter(a => ['10', '15'].includes(a.status))
    const now = new Date()
    const today = now.toISOString().slice(0, 10).replace(/-/g, '')

    return {
      전체접수: intakeAll.length,
      오늘접수: intakeAll.filter(a => a.createdDate === today).length,
      접수대기: intakeAll.filter(a => a.status === '10').length,
      담당배정: intakeAll.filter(a => a.status === '15').length,
    }
  }, [accidents])

  // ============================================
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex-shrink-0">
        <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
          <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
            사고접수
          </span>
          <span className="text-xs font-normal text-slate-400 hidden sm:inline">
            Accident Registration
          </span>
        </h1>
        <p className="text-[11px] text-slate-400 mt-0.5">
          새로운 사고 등록 및 초기 데이터 입력 · Cafe24 ERP 전체 필드 연동
        </p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 sm:px-6 py-3 flex-shrink-0">
        {[
          { label: '전체접수', value: stats.전체접수, color: 'from-blue-500' },
          { label: '오늘접수', value: stats.오늘접수, color: 'from-green-500' },
          { label: '접수대기', value: stats.접수대기, color: 'from-red-500' },
          { label: '담당배정', value: stats.담당배정, color: 'from-orange-500' },
        ].map((stat, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-[11px] text-slate-500 font-medium">{stat.label}</p>
            <p className={`text-xl font-bold bg-gradient-to-r ${stat.color} to-blue-500 bg-clip-text text-transparent`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Search & Filter ── */}
      <div className="px-4 sm:px-6 py-3 flex-shrink-0 border-b border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="사고번호, 상대방, 장소, 연락처, 공장명 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <div className="flex gap-1 flex-wrap">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setStatusFilter(opt.key)}
                className={`px-3 py-2 text-xs rounded-lg transition-colors ${
                  statusFilter === opt.key
                    ? 'bg-red-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-400">
            로딩중...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-400">
            데이터가 없습니다
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => {
              const id = `${a.staffId}-${a.receiptDate}-${a.seqNo}`
              const isExpanded = expandedId === id

              return (
                <div key={id}>
                  {/* ── Card Header ── */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : id)}
                    className={`bg-white border border-slate-200 ${isExpanded ? 'rounded-t-lg border-b-0' : 'rounded-lg'} p-3 cursor-pointer hover:shadow-md transition-shadow`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">
                            {a.accidentNo || '-'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_MAP[a.status]?.bg || 'bg-gray-100 text-gray-700'}`}>
                            {STATUS_MAP[a.status]?.label || a.status}
                          </span>
                          {a.category && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                              {CATEGORY_MAP[a.category] || a.category}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-600">
                          <p>접수: {fDT(a.createdDate, a.createdTime)} ({a.createdBy || '-'})</p>
                          <p>사고: {fDT(a.accidentDate, a.accidentTime)}</p>
                          <p>위치: {a.accidentLocation || '-'}</p>
                          <p>과실: {a.faultRate || '-'}%</p>
                          <p>상대방: {a.counterpartName || '-'} {a.counterpartPhone || ''}</p>
                          <p>연락처: {a.accidentMobile || a.accidentTel || '-'}</p>
                        </div>

                        {/* Quick flags */}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {a.towingYn === 'Y' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">견인</span>
                          )}
                          {a.rentalYn === 'Y' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">대차</span>
                          )}
                          {a.repairShopName && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">공장:{a.repairShopName}</span>
                          )}
                          {a.damageArea && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">파손:{a.damageArea}</span>
                          )}
                          {a.estimatedCost && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">예상:₩{parseInt(a.estimatedCost).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-slate-400 text-lg ml-2">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* ── Expanded Detail ── */}
                  {isExpanded && (
                    <div className="bg-white border border-slate-200 border-t-0 rounded-b-lg p-4 text-sm space-y-1">

                      {/* 사고 기본정보 */}
                      <SectionHeader icon="🚗" title="사고 기본정보" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
                        <InfoRow label="사고번호" value={a.accidentNo} highlight />
                        <InfoRow label="상태" value={STATUS_MAP[a.status]?.label || a.status} />
                        <InfoRow label="사고유형" value={a.category ? (CATEGORY_MAP[a.category] || a.category) : null} />
                        <InfoRow label="등록상태" value={a.regStatus} />
                        <InfoRow label="등록유형" value={a.regType} />
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
                        <InfoRow label="사고구분플래그" value={a.adFlag} />
                        <InfoRow label="파손부위" value={a.damageArea} highlight />
                        <InfoRow label="예상금액" value={a.estimatedCost ? `₩${parseInt(a.estimatedCost).toLocaleString()}` : null} highlight />
                      </div>
                      {(a.accidentMemo || a.accidentEtc) && (
                        <div className="mt-2 space-y-1">
                          {a.accidentMemo && (
                            <div>
                              <p className="text-[11px] text-slate-400 font-medium">사고내용</p>
                              <p className="text-sm text-slate-700 bg-slate-50 p-2 rounded">{a.accidentMemo}</p>
                            </div>
                          )}
                          {a.accidentEtc && (
                            <div>
                              <p className="text-[11px] text-slate-400 font-medium">사고기타</p>
                              <p className="text-sm text-slate-700 bg-slate-50 p-2 rounded">{a.accidentEtc}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 상대방 정보 */}
                      <SectionHeader icon="👤" title="상대방 정보" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                        <InfoRow label="상대방성명" value={a.counterpartName} />
                        <InfoRow label="상대방전화" value={a.counterpartPhone} />
                        <InfoRow label="상대방차량번호" value={a.counterpartVehicle} />
                        <InfoRow label="상대방차량정보" value={a.counterpartVehicleDesc} />
                        <InfoRow label="상대방보험사" value={a.counterpartInsurance} />
                        <InfoRow label="상대과실여부" value={fYN(a.counterpartFault)} />
                      </div>

                      {/* 견인 정보 */}
                      <SectionHeader icon="🚛" title="견인 정보" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                        <InfoRow label="견인여부" value={fYN(a.towingYn)} />
                        <InfoRow label="견인업체" value={a.towingCompany} />
                        <InfoRow label="견인전화" value={a.towingPhone} />
                      </div>

                      {/* 대차 정보 */}
                      <SectionHeader icon="🚙" title="대차 정보" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                        <InfoRow label="대차여부" value={fYN(a.rentalYn)} />
                        <InfoRow label="대차상태" value={a.rentalStatus} />
                        <InfoRow label="대차기간" value={
                          a.rentalFromDate
                            ? `${fD(a.rentalFromDate)} ${fT(a.rentalFromTime)} ~ ${fD(a.rentalToDate)} ${fT(a.rentalToTime)}`
                            : null
                        } />
                        <InfoRow label="대차차량" value={a.rentalCarNo ? `${a.rentalCarModel || ''} (${a.rentalCarNo})` : null} />
                        <InfoRow label="대차유형" value={a.rentalType} />
                        <InfoRow label="대차업체" value={a.rentalFactory} />
                        <InfoRow label="이용자" value={a.rentalUser} />
                        <InfoRow label="이용자연락처" value={a.rentalUserPhone} />
                        <InfoRow label="대차메모" value={a.rentalMemo} />
                      </div>

                      {/* 정비공장 정보 */}
                      <SectionHeader icon="🔧" title="정비공장 정보" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                        <InfoRow label="공장명" value={a.repairShopName} highlight />
                        <InfoRow label="공장코드" value={a.repairShopCode} />
                        <InfoRow label="공장대표" value={a.repairShopRep} />
                        <InfoRow label="사업자번호" value={a.repairShopLicense} />
                        <InfoRow label="공장전화" value={a.repairShopPhone} />
                        <InfoRow label="공장팩스" value={a.repairShopVp} />
                        <InfoRow label="공장주소" value={a.repairShopAddr} />
                        <InfoRow label="공장담당자" value={a.repairShopUser} />
                        <InfoRow label="담당자전화" value={a.repairShopTel} />
                        <InfoRow label="은행" value={a.repairShopBh} />
                        <InfoRow label="계좌" value={a.repairShopBn} />
                        <InfoRow label="공장결과" value={a.repairShopRs} />
                        <InfoRow label="주차" value={a.repairShopPk} />
                        <InfoRow label="비고" value={a.repairShopRe} />
                        <InfoRow label="탁송메모" value={a.repairShopMemo} />
                      </div>

                      {/* 인수자 정보 */}
                      <SectionHeader icon="🤝" title="인수자 정보" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                        <InfoRow label="인수자성명" value={a.handoverName} />
                        <InfoRow label="인수자전화" value={a.handoverPhone} />
                        <InfoRow label="인수자담당" value={a.handoverUser} />
                        <InfoRow label="인수은행" value={a.handoverBm} />
                        <InfoRow label="인수계좌" value={a.handoverBn} />
                        <InfoRow label="예금주" value={a.handoverBu} />
                        <InfoRow label="은행전화" value={a.handoverBh} />
                        <InfoRow label="인수자메모" value={a.handoverMemo} />
                      </div>

                      {/* 보상/처리 */}
                      <SectionHeader icon="💰" title="보상/처리 현황" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
                        <InfoRow label="정산여부" value={fYN(a.settlementYn)} />
                        <InfoRow label="반납여부" value={fYN(a.returnYn)} />
                        <InfoRow label="완료여부" value={fYN(a.completeYn)} />
                        <InfoRow label="면책여부" value={fYN(a.deductYn)} />
                        <InfoRow label="보상번호" value={a.bdNo} />
                        <InfoRow label="보상명" value={a.bdName} />
                        <InfoRow label="목표금액" value={a.targetAmount ? `₩${parseInt(a.targetAmount).toLocaleString()}` : null} />
                        <InfoRow label="검사일자" value={fD(a.examDate)} />
                        <InfoRow label="보험구분" value={a.insuranceFlag} />
                        <InfoRow label="보험시간" value={a.insuranceTime} />
                        <InfoRow label="보험담당" value={a.insuranceUser} />
                      </div>

                      {/* 기타 */}
                      <SectionHeader icon="📋" title="등록/수정 이력" />
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                        <InfoRow label="등록자" value={a.createdBy} />
                        <InfoRow label="등록일시" value={fDT(a.createdDate, a.createdTime)} />
                        <InfoRow label="수정자" value={a.updatedBy} />
                        <InfoRow label="수정일시" value={fDT(a.updatedDate, a.updatedTime)} />
                        <InfoRow label="담당자ID" value={a.staffId} />
                        <InfoRow label="그룹ID" value={a.groupId} />
                        <InfoRow label="채널ID" value={a.channelId} />
                        <InfoRow label="TH여부" value={fYN(a.thYn)} />
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
