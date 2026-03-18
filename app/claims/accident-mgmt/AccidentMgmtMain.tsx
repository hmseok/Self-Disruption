'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════
type Accident = Record<string, string>
type Memo = { content: string; createdBy: string; createdDate: string; createdTime: string; memoType: string }

// ═══════════════════════════════════════════════
// Code Maps (picbscdm 기반)
// ═══════════════════════════════════════════════
const STATUS_MAP: Record<string, { label: string; dot: string; bg: string }> = {
  '1': { label: '접수', dot: 'bg-emerald-400', bg: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  '2': { label: '입고', dot: 'bg-blue-400', bg: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  '3': { label: '출고', dot: 'bg-cyan-400', bg: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200' },
  '4': { label: '결재요청', dot: 'bg-orange-400', bg: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
  '5': { label: '지급요청', dot: 'bg-amber-400', bg: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  '6': { label: '지급완료', dot: 'bg-violet-400', bg: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  '9': { label: '미종결', dot: 'bg-red-400', bg: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  'A': { label: '기안요청', dot: 'bg-sky-400', bg: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
  'B': { label: '기안처리중', dot: 'bg-yellow-400', bg: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200' },
  'C': { label: '지급요청', dot: 'bg-lime-400', bg: 'bg-lime-50 text-lime-700 ring-1 ring-lime-200' },
}
const CATEGORY_MAP: Record<string, string> = { S: '실비', T: '턴키' }

// OTPTACBN — 사고구분 (★ ERP 기초코드관리에서 확인)
const ACCIDENT_TYPE_MAP: Record<string, string> = {
  B: '보물', D: '단독', E: '기타', G: '가해', H: '긴출',
  J: '자차', K: '과실', M: '면책', O: '정비', P: '피해', Q: '검사', S: '긴출',
}

// OTPTDSLI — 운전자면허종류 (★ 사업자번호가 아님!)
const LICENSE_MAP: Record<string, string> = { '1B': '1종보통', '1D': '1종대형', '2A': '2종오토', '2B': '2종보통' }

// OTPTACRN — 차량운행상태 (★ 사고원인이 아님!)
const VEHICLE_RUN_MAP: Record<string, string> = { Y: '운행가능', N: '운행불가' }

const REGTYPE_MAP: Record<string, string> = { '1': '법정검사', '2': '사고접수', '3': '정기점검', '4': '기타', 'I': '사고접수' }
const RENTAL_TYPE_MAP: Record<string, string> = { A: '공장(일반)', B: '공장(P)', C: '정비업체(일반)', D: '정비업체(정기점검)' }
const REGSTATUS_MAP: Record<string, string> = { R: '렌터카', C: 'C' }

// BHNAME — 보험사
const INSURANCE_MAP: Record<string, string> = {
  N01: '렌터카공제조합', N02: '메리츠화재', N03: '삼성화재', N04: '흥국화재',
  N05: '악사다이렉트', N06: '현대해상', N07: 'DB', N99: '보험사없음',
}

// CARSSTAT — 차량이용상태
const CAR_STATUS_MAP: Record<string, string> = { R: '이용중', H: '해지', L: '반납' }

// UCMTEDFG — 입금관리상태
const PAYMENT_MAP: Record<string, string> = { '-': '지급요청', P: '지급중', Y: '지급완료' }

// CAMOLEVL — 고객성향
const CUSTOMER_LEVEL_MAP: Record<string, string> = { '1': '좋음', '2': '보통', '3': '나쁨' }

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════
const fD = (d?: string | null) => { if (!d || d.length < 8) return ''; return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` }
const fT = (t?: string | null) => { if (!t || t.length < 4) return ''; return `${t.slice(0, 2)}:${t.slice(2, 4)}` }
const fDT = (d?: string | null, t?: string | null) => { const dd = fD(d); const tt = fT(t); return tt ? `${dd} ${tt}` : dd }

// ═══════════════════════════════════════════════
// Sub Components
// ═══════════════════════════════════════════════

// 필드 (테이블 셀 스타일)
function Cell({ label, children, span = 1 }: { label: string; children?: React.ReactNode; span?: number }) {
  return (
    <div className={`${span > 1 ? 'col-span-' + span : ''}`}>
      <div className="text-[10px] font-medium text-slate-400 mb-0.5 tracking-wide uppercase">{label}</div>
      <div className="text-[13px] text-slate-800 font-medium leading-snug min-h-[18px]">{children || <span className="text-slate-300">-</span>}</div>
    </div>
  )
}

// 섹션 헤더 (좌측 컬러 바)
function Section({ title, color = 'border-slate-300', children, defaultOpen = true }: {
  title: string; color?: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`border-l-[3px] ${color} bg-white rounded-r-lg shadow-sm mb-3 overflow-hidden`}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
        <span className="text-[13px] font-bold text-slate-700 tracking-tight">{title}</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-3 pt-1">{children}</div>}
    </div>
  )
}

// 상태 뱃지
function StatusBadge({ status }: { status: string }) {
  const st = STATUS_MAP[status]
  if (!st) return <span className="text-xs text-slate-400">{status}</span>
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${st.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
      {st.label}
    </span>
  )
}

// KPI 카드
function KpiCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div className={`flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm hover:shadow-md transition-shadow`}>
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center text-white text-lg`}>{icon}</div>
      <div>
        <div className="text-[22px] font-bold text-slate-900 leading-none">{value.toLocaleString()}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// Detail Panel
// ═══════════════════════════════════════════════
function AccidentDetail({ a, memos, memosLoading }: { a: Accident; memos: Memo[]; memosLoading: boolean }) {
  const branchLabel = ACCIDENT_TYPE_MAP[a.accidentType] || a.accidentType || '-'

  return (
    <div className="bg-gradient-to-b from-slate-50 to-white border-x border-b border-slate-200 rounded-b-xl">
      {/* 요약 배너 */}
      <div className="px-5 py-3 bg-slate-800 text-white flex items-center gap-6 text-xs flex-wrap">
        <div><span className="text-slate-400">차량번호</span> <span className="font-bold text-cyan-300 ml-1 text-sm">{a.carPlateNo || '-'}</span></div>
        <div><span className="text-slate-400">차량코드</span> <span className="font-mono ml-1">{a.carId}</span></div>
        <div><span className="text-slate-400">접수번호</span> <span className="font-mono font-bold ml-1">{a.accidentNo}</span></div>
        <div><span className="text-slate-400">사고일시</span> <span className="font-bold ml-1">{fDT(a.accidentDate, a.accidentTime)}</span></div>
        <div><span className="text-slate-400">과실</span> <span className="font-bold text-amber-300 ml-1">{a.faultRate ? `${a.faultRate}%` : '-'}</span></div>
        <div><span className="text-slate-400">유형</span> <span className="ml-1">{CATEGORY_MAP[a.category] || a.category}</span></div>
        <div><span className="text-slate-400">지점</span> <span className="ml-1">{branchLabel}</span></div>
        <div className="ml-auto"><StatusBadge status={a.status} /></div>
      </div>

      <div className="flex flex-col xl:flex-row">
        {/* ===== 좌측: 상세 정보 ===== */}
        <div className="flex-1 p-4 space-y-0 min-w-0">

          {/* 사고상세 */}
          <Section title="사고 상세내역" color="border-red-500">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-5 gap-y-3">
              <Cell label="사고일">{fDT(a.accidentDate, a.accidentTime)}</Cell>
              <Cell label="접수번호"><span className="font-mono">{a.accidentNo}</span></Cell>
              <Cell label="과실"><span className="text-red-600 font-bold">{a.faultRate ? `${a.faultRate}%` : '-'}</span></Cell>
              <Cell label="구분">{branchLabel}</Cell>
              <Cell label="서비스유형">{CATEGORY_MAP[a.category] || a.category}</Cell>
              <Cell label="대차여부">{a.rentalStatus ? <span className="text-emerald-600 font-bold">사용</span> : <span className="text-slate-400">미사용</span>}</Cell>
            </div>
            {/* 구분 체크 */}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <span className="text-[10px] text-slate-400 font-medium mr-1">구분</span>
              {Object.entries(ACCIDENT_TYPE_MAP).map(([code, label]) => {
                const active = a.accidentType === code
                return (
                  <div key={code} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors
                    ${active ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                    {active && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                    {label}
                  </div>
                )
              })}
            </div>
            {/* ★ 보험유형 체크박스 (소스코드 확인: 각 Y/N 플래그) */}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <span className="text-[10px] text-slate-400 font-medium mr-1">사고구분</span>
              {[
                { key: 'chkBodyInjury', label: '대인' },
                { key: 'chkProperty', label: '대물' },
                { key: 'chkOwnCar', label: '자차' },
                { key: 'chkOwnLoss', label: '자손' },
                { key: 'chkUninsured', label: '무보험' },
                { key: 'chkOnScene', label: '현장출동' },
                { key: 'chkEmergTow', label: '긴급견인' },
              ].map(({ key, label }) => {
                const checked = a[key] === 'Y'
                return (
                  <div key={key} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors
                    ${checked ? 'bg-red-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400'}`}>
                    {checked && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                    {label}
                  </div>
                )
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-2">
              <Cell label="사고장소" span={2}>{a.accidentLocation}</Cell>
              <Cell label="차량상태">{VEHICLE_RUN_MAP[a.vehicleRunnable] || a.vehicleRunnable || '-'}</Cell>
              <Cell label="사고기타">{a.accidentEtc || '-'}</Cell>
            </div>
            {a.accidentMemo && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-[13px] text-amber-900 leading-relaxed">
                <span className="font-bold text-amber-700 mr-1">사고내용</span>
                {a.accidentMemo}
              </div>
            )}
          </Section>

          {/* 계약/차량 — pmccarsm + pmccustm */}
          <Section title="차량 / 계약 정보" color="border-blue-500">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-5 gap-y-3">
              <Cell label="차량번호"><span className="text-blue-700 font-bold text-[15px]">{a.carPlateNo || '-'}</span></Cell>
              <Cell label="차량명">{a.carModelName || '-'}</Cell>
              <Cell label="이용상태">{CAR_STATUS_MAP[a.carStatus] || a.carStatus || '-'}</Cell>
              <Cell label="서비스유형">{CATEGORY_MAP[a.carType] || a.carType || CATEGORY_MAP[a.category] || a.category}</Cell>
            </div>
            <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-x-5 gap-y-3">
              <Cell label="계약자">{a.carOwner || '-'}</Cell>
              <Cell label="고객사">{a.custName || '-'}</Cell>
              <Cell label="연락처">{a.carContactPhone || a.custPhone || '-'}</Cell>
              <Cell label="주소">{a.carAddress || a.custAddr || '-'}</Cell>
            </div>
            <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-x-5 gap-y-3">
              <Cell label="보험사">{INSURANCE_MAP[a.carInsCode] || a.carInsCode || '-'}</Cell>
              <Cell label="면책금">{a.carDeductMin ? `${Number(a.carDeductMin).toLocaleString()}원` : '-'}</Cell>
              <Cell label="연령한정">{a.carAgeLimit ? `${a.carAgeLimit}세` : '-'}</Cell>
              <Cell label="계약기간">{a.carContractFrom ? `${fD(a.carContractFrom)} ~ ${fD(a.carContractTo)}` : '-'}</Cell>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 sm:grid-cols-4 gap-x-5 gap-y-3">
              <Cell label="등록상태">{REGSTATUS_MAP[a.regStatus] || a.regStatus}</Cell>
              <Cell label="등록유형">{REGTYPE_MAP[a.regType] || a.regType}</Cell>
              <Cell label="접수자">{a.createdBy || '-'}</Cell>
              <Cell label="접수일시">{fDT(a.createdDate, a.createdTime) || '-'}</Cell>
            </div>
          </Section>

          {/* 당사차 운전자 */}
          <Section title="당사차 운전자 / 통보자" color="border-indigo-500">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
              <Cell label="운전자"><span className="font-bold">{a.driverName || '-'}</span></Cell>
              <Cell label="연락처"><span className="text-blue-700 font-bold">{a.driverPhone || '-'}</span></Cell>
              <Cell label="면허종류">{LICENSE_MAP[a.driverLicense] || a.driverLicense || '-'}</Cell>
              <Cell label="생년월일">{a.driverBirth || '-'}</Cell>
              <Cell label="계약자관계">{a.driverRelation || '-'}</Cell>
              <Cell label="통보자">{a.notifierName || '-'}</Cell>
              <Cell label="통보자연락처">{a.notifierPhone || '-'}</Cell>
              <Cell label="운전자관계">{a.driverRelType || '-'}</Cell>
            </div>
          </Section>

          {/* 상대차량 */}
          <Section title="상대차량" color="border-orange-500">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3">
              <Cell label="차량번호">{a.oppCarNo || '-'}</Cell>
              <Cell label="차량정보">{a.oppCarInfo || '-'}</Cell>
              <Cell label="보험접수번호">{a.insuranceAccNo || '-'}</Cell>
              <Cell label="대물담당자">{a.propDamageStaff || '-'}</Cell>
              <Cell label="대물담당자HP"><span className="text-blue-700">{a.propDamagePhone || '-'}</span></Cell>
              <Cell label="공장입고여부">{a.factoryInYn === 'Y' ? '입고' : '미입고'}</Cell>
            </div>
          </Section>

          {/* 기존 상대차량 섹션은 위 운전자/통보자 + 상대차량으로 재구성됨 */}

          {/* 대차관리 */}
          <Section title="대차관리" color="border-emerald-500" defaultOpen={!!a.rentalStatus}>
            {!a.rentalStatus ? (
              <div className="text-xs text-slate-400 py-2 text-center">대차 데이터 없음</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3">
                <Cell label="대차상태"><StatusBadge status={a.rentalStatus} /></Cell>
                <Cell label="대차종류"><span className="font-bold">{RENTAL_TYPE_MAP[a.rentalType] || a.rentalType}</span></Cell>
                <Cell label="대차업체"><span className="font-bold">{a.rentalFactory}</span></Cell>
                <Cell label="대차차량">{a.rentalCarNo ? `${a.rentalCarModel || ''} ${a.rentalCarNo}` : '-'}</Cell>
                <Cell label="시작일">{fDT(a.rentalFromDate, a.rentalFromTime)}</Cell>
                <Cell label="종료일">{fDT(a.rentalToDate, a.rentalToTime)}</Cell>
                <Cell label="이용자">{a.rentalUser}</Cell>
                <Cell label="이용자HP">{a.rentalUserPhone}</Cell>
              </div>
            )}
          </Section>

          {/* 공장배정 */}
          <Section title="공장배정 (정비)" color="border-yellow-500">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3">
              <Cell label="공장코드">{a.repairShopCode || '-'}</Cell>
              <Cell label="공장입고">{a.factoryInYn === 'Y' ? '입고완료' : '미입고'}</Cell>
              <Cell label="수리희망지">{a.repairLocation || '-'}</Cell>
              <Cell label="처리결과">{a.repairShopResult || '-'}</Cell>
            </div>
          </Section>

          {/* 인수자/보상 */}
          <Section title="인수자 / 보상처리" color="border-purple-500" defaultOpen={false}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3">
              <Cell label="인수자">{a.handoverName}</Cell>
              <Cell label="전화">{a.handoverPhone}</Cell>
              <Cell label="담당">{a.handoverUser}</Cell>
              <Cell label="은행">{a.handoverBm}</Cell>
              <Cell label="계좌">{a.handoverBn}</Cell>
              <Cell label="예금주">{a.handoverBu}</Cell>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
              <Cell label="보상번호">{a.bdNo}</Cell>
              <Cell label="보상명">{a.bdName}</Cell>
              <Cell label="목표금액">{a.targetAmount === 'D' ? '대물' : a.targetAmount === 'C' ? '대인' : a.targetAmount}</Cell>
              <Cell label="검사일자">{fD(a.examDate)}</Cell>
              <Cell label="정산">{a.settlementYn === 'Y' ? <span className="text-emerald-600 font-bold">완료</span> : '미완료'}</Cell>
              <Cell label="면책">{a.deductYn === 'Y' ? '적용' : '-'}</Cell>
              <Cell label="완료">{a.completeYn === 'Y' ? <span className="text-emerald-600 font-bold">완료</span> : '미완료'}</Cell>
              <Cell label="반납">{a.returnYn === 'Y' ? '완료' : '-'}</Cell>
            </div>
          </Section>
        </div>

        {/* ===== 우측: 상담내역 + 이력 ===== */}
        <div className="xl:w-[340px] flex-shrink-0 p-4 border-t xl:border-t-0 xl:border-l border-slate-200 bg-slate-50/50">
          {/* 상담내용 */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-blue-500 rounded-full" />
              <span className="text-[13px] font-bold text-slate-700">상담내용</span>
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">{memos.length}</span>
            </div>
            {memosLoading ? (
              <div className="flex items-center gap-2 py-6 justify-center text-slate-400 text-xs">
                <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                불러오는 중...
              </div>
            ) : memos.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-6 bg-white rounded-lg border border-dashed border-slate-200">상담 이력이 없습니다</div>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {memos.map((m, i) => (
                  <div key={i} className="bg-white rounded-lg border border-slate-200 p-3 hover:shadow-sm transition-shadow">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{m.createdBy || '-'}</span>
                      <span className="text-[10px] text-slate-400 font-medium">{fDT(m.createdDate, m.createdTime)}</span>
                    </div>
                    <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 파손부위 */}
          {a.damageArea && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-red-500 rounded-full" />
                <span className="text-[13px] font-bold text-slate-700">파손부위</span>
              </div>
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-800 font-medium">{a.damageArea}</div>
            </div>
          )}

          {/* 수정이력 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-4 bg-slate-400 rounded-full" />
              <span className="text-[13px] font-bold text-slate-700">수정이력</span>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-3 text-[11px] text-slate-500 space-y-1">
              {a.createdBy && <div className="flex justify-between"><span>등록: <b className="text-slate-700">{a.createdBy}</b></span><span>{fDT(a.createdDate, a.createdTime)}</span></div>}
              {a.updatedBy && <div className="flex justify-between"><span>수정: <b className="text-slate-700">{a.updatedBy}</b></span><span>{fDT(a.updatedDate, a.updatedTime)}</span></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════
export default function AccidentMgmtMain() {
  const { user } = useApp()
  const [accidents, setAccidents] = useState<Accident[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [memos, setMemos] = useState<Memo[]>([])
  const [memosLoading, setMemosLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/cafe24/accidents?limit=500`)
      const json = await res.json()
      if (json.success) setAccidents(json.data || [])
    } catch (e) { console.error('사고접수 로드 에러:', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const loadMemos = useCallback(async (carId: string, receiptDate: string, seqNo: string) => {
    setMemosLoading(true); setMemos([])
    try {
      const p = new URLSearchParams({ staffId: carId, receiptDate, seqNo })
      const res = await fetch(`/api/cafe24/consultations?${p}`)
      const json = await res.json()
      if (json.success) {
        setMemos((json.data || []).map((m: any) => ({
          content: m.memoContent || m.content || '',
          createdBy: m.createdBy || '', createdDate: m.createdDate || '',
          createdTime: m.createdTime || '', memoType: m.memoType || '',
        })))
      }
    } catch { /* ignore */ }
    finally { setMemosLoading(false) }
  }, [])

  const filtered = useMemo(() => {
    let result = [...accidents]
    if (search) {
      const s = search.toLowerCase()
      result = result.filter(a =>
        a.accidentNo?.toLowerCase().includes(s) || a.counterpartName?.toLowerCase().includes(s) ||
        a.accidentLocation?.toLowerCase().includes(s) ||
        a.repairShopName?.toLowerCase().includes(s) || a.counterpartVehicle?.toLowerCase().includes(s) ||
        a.carPlateNo?.toLowerCase().includes(s) || a.carModelName?.toLowerCase().includes(s) ||
        a.custName?.toLowerCase().includes(s) || a.carOwner?.toLowerCase().includes(s)
      )
    }
    // 접수일시 기준 정렬 (otptgndt + otptgntm)
    result.sort((a, b) => {
      const da = (a.createdDate || '') + (a.createdTime || '')
      const db = (b.createdDate || '') + (b.createdTime || '')
      return db.localeCompare(da)
    })
    return result
  }, [accidents, search])

  const stats = useMemo(() => ({
    전체: accidents.length,
    접수: accidents.filter(a => a.status === '1').length,
    입고: accidents.filter(a => a.status === '2').length,
    완료: accidents.filter(a => a.status === '6').length,
  }), [accidents])

  const getRowId = (a: Accident) => a.accidentNo || `${a.carId}-${a.receiptDate}-${a.seqNo}`
  const handleExpand = (a: Accident) => {
    const id = getRowId(a)
    if (expandedId === id) { setExpandedId(null) }
    else { setExpandedId(id); if (a.carId && a.receiptDate && a.seqNo) loadMemos(a.carId, a.receiptDate, a.seqNo) }
  }

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* ═══ Header ═══ */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 px-6 py-4 flex-shrink-0 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">사고관리</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">Accident Management System</p>
          </div>
          <div className="flex gap-3">
            <KpiCard label="전체 사고" value={stats.전체} color="bg-slate-600" icon="Σ" />
            <KpiCard label="접수" value={stats.접수} color="bg-emerald-600" icon="▶" />
            <KpiCard label="입고" value={stats.입고} color="bg-blue-600" icon="⬇" />
            <KpiCard label="지급완료" value={stats.완료} color="bg-violet-600" icon="✓" />
          </div>
        </div>
      </div>

      {/* ═══ Search Bar ═══ */}
      <div className="px-6 py-3 flex-shrink-0 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" placeholder="사고번호, 고객명, 차량번호, 장소 검색..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 placeholder:text-slate-400 transition-all"
            />
          </div>
          <button onClick={load}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            조회
          </button>
        </div>
      </div>

      {/* ═══ Data Grid ═══ */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-8 h-8 border-3 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm text-slate-500">데이터를 불러오는 중...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <span className="text-sm">검색 결과가 없습니다</span>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Table Header */}
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 grid grid-cols-12 gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <span className="col-span-1">상태</span>
              <span className="col-span-2">접수일시</span>
              <span className="col-span-2">사고번호</span>
              <span className="col-span-1">차량번호</span>
              <span className="col-span-1">유형</span>
              <span className="col-span-2">장소</span>
              <span className="col-span-1 text-center">과실</span>
              <span className="col-span-1">운전자</span>
              <span className="col-span-1">거래처</span>
            </div>

            {/* Table Rows */}
            {filtered.map((a, idx) => {
              const id = getRowId(a) || `row-${idx}`
              const isExpanded = expandedId === id

              return (
                <div key={id}>
                  <div onClick={() => handleExpand(a)}
                    className={`px-5 py-3 grid grid-cols-12 gap-2 items-center cursor-pointer border-b border-slate-100 transition-all text-[13px]
                      ${isExpanded ? 'bg-blue-50 border-l-[3px] border-l-blue-600' : 'hover:bg-slate-50 border-l-[3px] border-l-transparent'}
                      ${idx % 2 === 0 && !isExpanded ? 'bg-white' : !isExpanded ? 'bg-slate-50/40' : ''}`}>
                    <span className="col-span-1"><StatusBadge status={a.status} /></span>
                    <span className="col-span-2 text-slate-700 font-medium">{fD(a.createdDate)} <span className="text-slate-400">{fT(a.createdTime)}</span></span>
                    <span className="col-span-2 font-mono text-slate-800 font-semibold text-[12px]">{a.accidentNo || '-'}</span>
                    <span className="col-span-1 text-blue-700 font-bold text-[12px] truncate">{a.carPlateNo || '-'}</span>
                    <span className="col-span-1 text-[11px]">{CATEGORY_MAP[a.category] || a.category}</span>
                    <span className="col-span-2 text-slate-600 truncate">{a.accidentLocation || '-'}</span>
                    <span className="col-span-1 text-center">
                      <span className={`font-bold ${parseInt(a.faultRate) >= 100 ? 'text-red-600' : parseInt(a.faultRate) >= 50 ? 'text-orange-600' : 'text-slate-600'}`}>
                        {a.faultRate ? `${a.faultRate}%` : '-'}
                      </span>
                    </span>
                    <span className="col-span-1 text-slate-700 truncate font-medium">{a.driverName || '-'}</span>
                    <span className="col-span-1 text-slate-600 truncate text-[11px]">{a.custName || a.carOwner || '-'}</span>
                  </div>
                  {isExpanded && <AccidentDetail a={a} memos={memos} memosLoading={memosLoading} />}
                </div>
              )
            })}

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-2.5 text-[11px] text-slate-500 flex justify-between items-center">
              <span>총 <b className="text-slate-700">{filtered.length.toLocaleString()}</b>건</span>
              <span>최근 갱신: {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
