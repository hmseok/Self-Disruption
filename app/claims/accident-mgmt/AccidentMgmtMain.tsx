'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

// ============================================
// Type
// ============================================
type Accident = Record<string, string>
type Memo = { content: string; createdBy: string; createdDate: string; createdTime: string; memoType: string }

// ============================================
// Constants
// ============================================
// picbscdm OTPTSTAT — 실제 DB 코드
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  '1': { label: '접수', color: 'bg-green-600 text-white' },
  '2': { label: '입고', color: 'bg-blue-500 text-white' },
  '3': { label: '출고', color: 'bg-emerald-500 text-white' },
  '4': { label: '결재요청', color: 'bg-orange-500 text-white' },
  '5': { label: '지급요청', color: 'bg-amber-500 text-white' },
  '6': { label: '지급완료', color: 'bg-purple-500 text-white' },
  '9': { label: '미종결', color: 'bg-red-500 text-white' },
  'A': { label: '기안요청', color: 'bg-cyan-500 text-white' },
  'B': { label: '기안처리중', color: 'bg-yellow-600 text-white' },
  'C': { label: '지급요청', color: 'bg-lime-600 text-white' },
}

// picbscdm CARSTYPE — 실비/턴키 구분
const CATEGORY_MAP: Record<string, string> = {
  S: '실비', T: '턴키',
}

// picbscdm PMOACBN — 사고지점(사고유형)
const BRANCH_MAP: Record<string, string> = {
  E: '긴출', G: '가해', J: '자차', K: '과실', P: '피해', B: 'B', D: 'D', M: 'M',
}

// picbscdm FACTGUBN — 등록유형
const REGTYPE_MAP: Record<string, string> = {
  '1': '법정검사', '2': '사고접수', '3': '정기점검', '4': '기타', 'I': '사고접수',
}

// picbscdm FACTTYPE — 대차/공장 유형
const RENTAL_TYPE_MAP: Record<string, string> = {
  A: '공장(일반)', B: '공장(P)', C: '정비업체(일반)', D: '정비업체(정기점검)',
}

// regStatus
const REGSTATUS_MAP: Record<string, string> = {
  R: '렌터카', C: 'C',
}

// ============================================
// Helpers
// ============================================
const fD = (d?: string | null) => {
  if (!d || d.length < 8) return '-'
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`
}
const fT = (t?: string | null) => {
  if (!t || t.length < 4) return ''
  return `${t.slice(0, 2)}:${t.slice(2, 4)}`
}
const fDT = (d?: string | null, t?: string | null) => {
  const dd = fD(d); const tt = fT(t)
  return tt ? `${dd} ${tt}` : dd
}
const fYN = (v?: string | null) => (!v ? '' : v === 'Y' ? 'Y' : v === 'N' ? 'N' : v)
const fWon = (v?: string | null) => {
  if (!v || !v.trim()) return ''
  const n = parseInt(v)
  return isNaN(n) ? v : n.toLocaleString()
}

// ============================================
// Field display component (ERP 스타일)
// ============================================
function F({ label, value, w, bold, accent }: {
  label: string; value?: string | null; w?: string; bold?: boolean; accent?: boolean
}) {
  return (
    <div className={`flex items-baseline gap-1 ${w || ''}`}>
      <span className="text-[11px] text-slate-500 whitespace-nowrap flex-shrink-0">{label}</span>
      <span className={`text-[13px] ${bold ? 'font-bold' : ''} ${accent ? 'text-blue-700' : 'text-slate-900'} truncate`}>
        {value?.trim() || '-'}
      </span>
    </div>
  )
}

// Section title (ERP 스타일 ▶ 헤더)
function Sec({ title, icon, children, open = true }: {
  title: string; icon?: string; children: React.ReactNode; open?: boolean
}) {
  const [isOpen, setIsOpen] = useState(open)
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 transition-colors text-left"
      >
        <span className="text-[10px] text-slate-400">{isOpen ? '▼' : '▶'}</span>
        {icon && <span className="text-sm">{icon}</span>}
        <span className="text-xs font-bold text-slate-700">{title}</span>
      </button>
      {isOpen && <div className="px-3 py-2 bg-white">{children}</div>}
    </div>
  )
}

// ============================================
// Detail Panel — ERP 기준 사고접수 상세
// ============================================
function AccidentDetail({ a, memos, memosLoading }: {
  a: Accident; memos: Memo[]; memosLoading: boolean
}) {
  return (
    <div className="bg-white border border-slate-200 border-t-0 rounded-b-lg">
      {/* ── 2컬럼 레이아웃: 좌측=상세, 우측=상담내역 ── */}
      <div className="flex flex-col lg:flex-row">
        {/* ===== 좌측: 사고 상세 ===== */}
        <div className="flex-1 p-3 space-y-0 lg:border-r lg:border-slate-200 min-w-0">

          {/* ── 사고상세내역 ── */}
          <Sec title="사고상세내역" icon="🚗">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
              <F label="사고일시" value={fDT(a.accidentDate, a.accidentTime)} bold accent />
              <F label="수변호" value={a.accidentNo} bold />
              <F label="상태" value={STATUS_MAP[a.status]?.label || a.status} bold />
              <F label="대차" value={a.rentalStatus ? '대차사용' : '대차미사용'} />
              <F label="과실" value={a.faultRate ? `${a.faultRate}%` : ''} bold />
            </div>
            {/* 사고유형 표시: 사고지점(PMOACBN) 기반 */}
            <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-1">
              {Object.entries(BRANCH_MAP).map(([code, label]) => {
                const isActive = a.accidentBranch === code
                return (
                  <label key={code} className="flex items-center gap-1 text-xs">
                    <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center text-[9px] ${isActive ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-transparent'}`}>✓</span>
                    <span className={isActive ? 'font-bold text-slate-900' : 'text-slate-500'}>{label}</span>
                  </label>
                )
              })}
            </div>
            <div className="mt-1.5 space-y-1">
              <F label="사고장소" value={a.accidentLocation} bold />
              <F label="사고지점" value={BRANCH_MAP[a.accidentBranch] || a.accidentBranch} />
              <F label="사고원인" value={fYN(a.accidentReason)} />
              <F label="사고구분" value={fYN(a.accidentDi)} />
              <F label="사고피해" value={fYN(a.accidentDamage)} />
            </div>
            {a.accidentMemo && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-slate-800">
                <span className="text-[10px] text-yellow-700 font-bold">사고내용: </span>
                {a.accidentMemo}
              </div>
            )}
          </Sec>

          {/* ── 계약/차량 정보 ── */}
          <Sec title="계약/차량 정보" icon="📋">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
              <F label="등록상태" value={REGSTATUS_MAP[a.regStatus] || a.regStatus} />
              <F label="등록유형" value={REGTYPE_MAP[a.regType] || a.regType} />
              <F label="사고구분플래그" value={fYN(a.adFlag)} />
              <F label="접수자" value={a.createdBy} />
              <F label="접수일시" value={fDT(a.createdDate, a.createdTime)} />
              <F label="담당자ID" value={a.staffId} />
              <F label="그룹ID" value={a.groupId} />
              <F label="채널ID" value={a.channelId} />
            </div>
          </Sec>

          {/* ── 당사차 (운전자/통보자) ── */}
          <Sec title="당사차 운전자/연락처" icon="👤">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
              <F label="사고자HP" value={a.accidentMobile} bold />
              <F label="사고자전화" value={a.accidentTel} />
              <F label="사고관할" value={a.accidentJc} />
              <F label="사고관할서" value={a.accidentJs} />
            </div>
            {a.accidentEtc && (
              <div className="mt-1.5">
                <F label="기타" value={a.accidentEtc} />
              </div>
            )}
          </Sec>

          {/* ── 상대차량 ── */}
          <Sec title="상대차량" icon="🚙">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
              <F label="운전자" value={a.counterpartName} bold />
              <F label="연락처" value={a.counterpartPhone} bold />
              <F label="차량번호" value={a.counterpartVehicle} />
              <F label="차량정보" value={a.counterpartVehicleDesc} />
              <F label="보험사" value={a.counterpartInsurance} bold />
              <F label="상대과실" value={fYN(a.counterpartFault)} />
            </div>
          </Sec>

          {/* ── 대차관리 ── */}
          <Sec title="대차관리" icon="🚛">
            {!a.rentalStatus ? (
              <p className="text-xs text-slate-400 italic">대차 데이터 없음</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                <F label="대차상태" value={STATUS_MAP[a.rentalStatus]?.label || a.rentalStatus} />
                <F label="대차종류" value={RENTAL_TYPE_MAP[a.rentalType] || a.rentalType} bold />
                <F label="대차업체" value={a.rentalFactory} bold />
                <F label="대차차량" value={a.rentalCarNo ? `${a.rentalCarModel || ''} ${a.rentalCarNo}` : ''} />
                <F label="시작일" value={`${fD(a.rentalFromDate)} ${fT(a.rentalFromTime)}`} />
                <F label="종료일" value={`${fD(a.rentalToDate)} ${fT(a.rentalToTime)}`} />
                <F label="이용자" value={a.rentalUser} />
                <F label="이용자HP" value={a.rentalUserPhone} />
                {a.rentalMemo && <F label="메모" value={a.rentalMemo} w="col-span-2" />}
              </div>
            )}
          </Sec>

          {/* ── 공장배정 ── */}
          <Sec title="공장배정 (공장)" icon="🔧">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
              <F label="공장명" value={a.repairShopName} bold accent />
              <F label="공장코드" value={a.repairShopCode} />
              <F label="대표" value={a.repairShopRep} />
              <F label="사업자번호" value={a.repairShopLicense} />
              <F label="전화" value={a.repairShopPhone} />
              <F label="팩스" value={a.repairShopVp} />
              <F label="주소" value={a.repairShopAddr} w="col-span-2" />
              <F label="담당자" value={a.repairShopUser} />
              <F label="담당전화" value={a.repairShopTel} />
              <F label="은행" value={a.repairShopBh} />
              <F label="계좌" value={a.repairShopBn} />
              <F label="결과" value={a.repairShopRs} />
            </div>
            {a.repairShopMemo && (
              <div className="mt-1.5"><F label="탁송메모" value={a.repairShopMemo} /></div>
            )}
          </Sec>

          {/* ── 인수자/보상 ── */}
          <Sec title="인수자 / 보상처리" icon="🤝" open={false}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
              <F label="인수자" value={a.handoverName} />
              <F label="전화" value={a.handoverPhone} />
              <F label="담당" value={a.handoverUser} />
              <F label="은행" value={a.handoverBm} />
              <F label="계좌" value={a.handoverBn} />
              <F label="예금주" value={a.handoverBu} />
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                <F label="보상번호" value={a.bdNo} bold />
                <F label="보상명" value={a.bdName} />
                <F label="파손부위" value={a.damageArea} bold accent />
                <F label="예상금액" value={fWon(a.estimatedCost) ? `₩${fWon(a.estimatedCost)}` : ''} bold accent />
                <F label="목표금액" value={a.targetAmount === 'D' ? '대물' : a.targetAmount === 'C' ? '대인' : a.targetAmount} />
                <F label="검사일자" value={fD(a.examDate)} />
                <F label="정산" value={fYN(a.settlementYn)} />
                <F label="면책" value={fYN(a.deductYn)} />
                <F label="완료" value={fYN(a.completeYn)} />
                <F label="반납" value={fYN(a.returnYn)} />
                <F label="보험구분" value={a.insuranceFlag} />
                <F label="보험담당" value={a.insuranceUser} />
              </div>
            </div>
          </Sec>
        </div>

        {/* ===== 우측: 상담내역 ===== */}
        <div className="lg:w-80 flex-shrink-0 p-3 border-t lg:border-t-0 border-slate-200">
          <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1">
            <span>💬</span> 상담내용
          </div>
          {memosLoading ? (
            <p className="text-xs text-slate-400">로딩중...</p>
          ) : memos.length === 0 ? (
            <p className="text-xs text-slate-400 italic">상담 이력이 없습니다.</p>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {memos.map((m, i) => (
                <div key={i} className="bg-slate-50 border border-slate-100 rounded p-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-bold text-blue-700">{m.createdBy || '-'}</span>
                    <span className="text-[10px] text-slate-400">{fDT(m.createdDate, m.createdTime)}</span>
                  </div>
                  <p className="text-xs text-slate-800 whitespace-pre-wrap">{m.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* 기타파손부위 */}
          {a.damageArea && (
            <div className="mt-4">
              <div className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <span>🔴</span> 기타파손부위
              </div>
              <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800 font-medium">
                {a.damageArea}
              </div>
            </div>
          )}

          {/* 수정이력 */}
          <div className="mt-4">
            <div className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <span>📋</span> 수정이력
            </div>
            <div className="text-[11px] text-slate-500 space-y-0.5">
              <p>등록: {a.createdBy} {fDT(a.createdDate, a.createdTime)}</p>
              {a.updatedBy && <p>수정: {a.updatedBy} {fDT(a.updatedDate, a.updatedTime)}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Main
// ============================================
export default function AccidentMgmtMain() {
  const { user } = useApp()
  const [accidents, setAccidents] = useState<Accident[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [memos, setMemos] = useState<Memo[]>([])
  const [memosLoading, setMemosLoading] = useState(false)

  // Load accidents
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/cafe24/accidents?limit=500`)
      const json = await res.json()
      if (json.success) setAccidents(json.data || [])
    } catch (e) {
      console.error('사고접수 로드 에러:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Load memos when expanding
  const loadMemos = useCallback(async (staffId: string, receiptDate: string, seqNo: string) => {
    setMemosLoading(true)
    setMemos([])
    try {
      const p = new URLSearchParams({ staffId, receiptDate, seqNo })
      const res = await fetch(`/api/cafe24/consultations?${p}`)
      const json = await res.json()
      if (json.success) {
        setMemos((json.data || []).map((m: any) => ({
          content: m.memoContent || m.content || '',
          createdBy: m.createdBy || '',
          createdDate: m.createdDate || '',
          createdTime: m.createdTime || '',
          memoType: m.memoType || '',
        })))
      }
    } catch {
      // ignore
    } finally {
      setMemosLoading(false)
    }
  }, [])

  // Filter & sort
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
        a.damageArea?.toLowerCase().includes(s) ||
        a.counterpartVehicle?.toLowerCase().includes(s)
      )
    }
    result.sort((a, b) => {
      const da = (a.accidentDate || a.receiptDate || '') + (a.accidentTime || a.createdTime || '')
      const db = (b.accidentDate || b.receiptDate || '') + (b.accidentTime || b.createdTime || '')
      return db.localeCompare(da)
    })
    return result
  }, [accidents, search])

  // Stats — 실제 OTPTSTAT 코드 기반
  const stats = useMemo(() => ({
    전체: accidents.length,
    접수: accidents.filter(a => a.status === '1').length,
    공장: accidents.filter(a => ['2', '3'].includes(a.status)).length,
    완료: accidents.filter(a => a.status === '6').length,
  }), [accidents])

  const getRowId = (a: Accident) => a.accidentNo || `${a.staffId}-${a.receiptDate}-${a.seqNo}`

  const handleExpand = (a: Accident) => {
    const id = getRowId(a)
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      if (a.staffId && a.receiptDate && a.seqNo) {
        loadMemos(a.staffId, a.receiptDate, a.seqNo)
      }
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              사고관리
              <span className="text-xs font-normal text-slate-400 ml-2">w_acr0101a</span>
            </h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span>전체 <b className="text-slate-900">{stats.전체}</b></span>
            <span>접수 <b className="text-red-600">{stats.접수}</b></span>
            <span>공장 <b className="text-blue-600">{stats.공장}</b></span>
            <span>완료 <b className="text-green-600">{stats.완료}</b></span>
          </div>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-4 py-2 flex-shrink-0 bg-white border-b border-slate-200">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="차량번호, 고객명, 연락처 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={load}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700"
          >
            조회
          </button>
        </div>
      </div>

      {/* ── 사고 목록 테이블 + 상세 ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">로딩중...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-400 text-sm">데이터가 없습니다</div>
        ) : (
          <div>
            {/* ── Table header ── */}
            <div className="sticky top-0 z-10 bg-slate-100 border-b border-slate-300 px-4 py-1.5 grid grid-cols-12 gap-1 text-[11px] font-bold text-slate-600">
              <span className="col-span-1">상태</span>
              <span className="col-span-2">사고일시</span>
              <span className="col-span-2">사고번호</span>
              <span className="col-span-2">장소</span>
              <span className="col-span-1">과실</span>
              <span className="col-span-2">상대방</span>
              <span className="col-span-2">공장/대차</span>
            </div>

            {/* ── Rows ── */}
            {filtered.map((a, idx) => {
              const id = getRowId(a) || `row-${idx}`
              const isExpanded = expandedId === id
              const st = STATUS_MAP[a.status]

              return (
                <div key={id}>
                  {/* Row */}
                  <div
                    onClick={() => handleExpand(a)}
                    className={`px-4 py-2 grid grid-cols-12 gap-1 items-center cursor-pointer border-b border-slate-100 hover:bg-blue-50 transition-colors text-xs ${isExpanded ? 'bg-blue-50 border-blue-200' : ''}`}
                  >
                    <span className="col-span-1">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${st?.color || 'bg-gray-400 text-white'}`}>
                        {st?.label || a.status}
                      </span>
                    </span>
                    <span className="col-span-2 text-slate-700">
                      {fD(a.accidentDate)} {fT(a.accidentTime)}
                    </span>
                    <span className="col-span-2 font-mono text-slate-900 font-medium truncate">
                      {a.accidentNo || '-'}
                    </span>
                    <span className="col-span-2 text-slate-600 truncate">
                      {a.accidentLocation || '-'}
                    </span>
                    <span className="col-span-1 text-slate-700">
                      {a.faultRate ? `${a.faultRate}%` : '-'}
                    </span>
                    <span className="col-span-2 text-slate-600 truncate">
                      {a.counterpartName || '-'}
                      {a.counterpartInsurance ? ` (${a.counterpartInsurance})` : ''}
                    </span>
                    <span className="col-span-2 text-slate-600 truncate">
                      {a.repairShopName || '-'}
                      {a.rentalStatus && <span className="text-green-600 ml-1 font-bold">[대차]</span>}
                    </span>
                  </div>

                  {/* Detail panel */}
                  {isExpanded && (
                    <AccidentDetail a={a} memos={memos} memosLoading={memosLoading} />
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
