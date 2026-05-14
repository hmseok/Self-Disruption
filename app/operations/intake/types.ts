// PR-OPS-1.4b — /operations/intake 타입 공유
// page.tsx 와 IntakeModalV2.tsx 가 동일 타입 사용.

export type Cafe24Accident = {
  id: number              // idnoInt (dispatch_order.ride_accident_id 매핑용)
  // detail/memos 호출 키 (raw cafe24)
  esosidno: string
  esosmddt: string        // YYYYMMDD
  esossrno: number
  // 표출 필드
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
  workflow_stage: string
  notes: string
}

export type DispatchOrder = {
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

export type MergedRow = Cafe24Accident & {
  dispatch_order?: DispatchOrder
  unified_stage: 'new' | 'consulting' | 'scheduled' | 'dispatched' | 'done'
}

export type ConsultationCategory =
  | 'intake'
  | 'followup'
  | 'status_change'
  | 'dispatch'
  | 'return'
  | 'billing'
  | 'other'

export type Consultation = {
  id: string
  dispatch_order_id: string
  note: string
  category: ConsultationCategory
  created_at: string
  created_by: string | null
}

export type ResultMsg = { type: 'ok' | 'err'; text: string }

// cafe24 /api/cafe24/accidents/detail 응답 (필요한 필드만)
export type Cafe24Detail = {
  esosidno: string
  esosmddt: string
  esossrno: number
  // 접수일시 (detail/route.ts 응답에 포함)
  esosacdt: string | null
  esosactm: string | null
  esosrgst: string | null
  esosrslt: string | null
  esostypp: string | null
  // 위치
  esosaddr: string | null
  esosadnm: string | null
  esosadtl: string | null
  // 요청자
  esosusnm: string | null
  esosustl: string | null
  esosusvp: string | null
  esosusvd: string | null
  // 메모
  esosrstx: string | null
  esosmemo: string | null
  esosinft: string | null
  // 등록
  esosgndt: string | null
  esosgntm: string | null
  esosgnus: string | null
  // 점검 (Y/N — accident/detail/route.ts 의 응답 필드)
  esosbate: string | null
  esostire: string | null
  esosoils: string | null
  esoslock: string | null
  esosmove: string | null
  esoshelp: string | null
  // 주행거리
  esoskilo: string | null
  // 차량 마스터 (조인)
  cars_no: string | null
  cars_model: string | null
}

// cafe24 /api/cafe24/accidents/memos 응답 (필요한 필드만)
export type Cafe24Memo = {
  memoidno: string
  memomddt: string
  memosrno: number
  memonums: number
  memosort: number
  memotitl: string | null
  memotext: string | null
  memognus: string | null
  memogndt: string | null
  memogntm: string | null
}

// ─── PR-OPS-1.5b 풍성화 ───────────────────────────────────────────

// /api/operations/cafe24-accidents 응답 (사고접수 탭 — 풍성화)
export type RichAccidentRow = {
  esosidno: string
  esosmddt: string
  esossrno: number
  esosacdt: string | null
  esosactm: string | null
  esosrgst: string | null
  esosrslt: string | null
  esosrstx: string | null
  esostypp: string | null
  esosgnus: string | null
  esosaddr: string | null
  esosadnm: string | null
  esosadtl: string | null
  esosusnm: string | null
  esosustl: string | null
  esoskilo: string | null
  cars_no: string | null
  cars_model: string | null
  cars_user: string | null
  capital_co_code: string | null
  capital_co_name: string | null
  gnus_name: string | null
}

// /api/operations/cafe24-dispatch-requests 응답 (대차접수 탭)
// 가설 J — acrotpth main + acrrentm 1:1 + pmccarsm + pmcfactm + pmccustm + picuserm
export type DispatchRequestRow = {
  // 사고차 출동 본체 (acrotpth)
  otptidno: string
  otptmddt: string
  otptsrno: number
  otptacdt: string | null
  otptactm: string | null
  otptacbn: string | null
  otptrgst: string | null
  otptrgtp: string | null
  otptgnus: string | null
  otptdcyn: string | null
  otptcanm: string | null
  otptcahp: string | null
  otptdsnm: string | null
  otptdshp: string | null
  otptacdi: string | null
  otptacdm: string | null
  otptacjc: string | null
  otptacjs: string | null
  otptacmb: string | null
  otptacno: string | null
  otptacph: string | null
  otptdsrp: string | null
  otptftyn: string | null
  otpttonm: string | null
  otpttohp: string | null
  otpttonu: string | null
  otpttomd: string | null
  otpttobm: string | null
  otpttobn: string | null
  otpttobu: string | null
  otptacad: string | null
  otptacmo: string | null
  otptacet: string | null
  // 대차요청 sub (acrrentm)
  rent_srno: number | string | null
  rent_seqn: number | null
  rent_stat: string | null
  rent_rsdt: string | null
  rent_frdt: string | null
  rent_frtm: string | null
  rent_todt: string | null
  rent_totm: string | null
  rent_user: string | null
  rent_ushp: string | null
  rent_nums: string | null
  rent_modl: string | null
  rent_facd: string | null
  rent_memo: string | null
  // 대차업체 (pmcfactm)
  rental_vendor: string | null
  rental_hp: string | null
  rental_bdno: string | null
  // 차량 마스터 (pmccarsm)
  cars_no: string | null
  cars_model: string | null
  cars_user: string | null
  capital_co_code: string | null
  capital_co_name: string | null
  // 등록자 (picuserm)
  gnus_name: string | null
}

// acrotpth Y/N flag → 사고 종류 라벨 매핑
// jandi_move.php:99-132 패턴 그대로
export function describeAccidentTypes(r: DispatchRequestRow): string[] {
  const types: string[] = []
  if (r.otptacdi === 'Y') types.push('대인')
  if (r.otptacdm === 'Y') types.push('대물')
  if (r.otptacjc === 'Y') types.push('자차')
  if (r.otptacjs === 'Y') types.push('자손')
  if (r.otptacmb === 'Y') types.push('무보험')
  if (r.otptacno === 'Y') types.push('현장출동')
  if (r.otptacph === 'Y') types.push('긴급견인')
  if (r.otptdsrp === 'Y') types.push('수리')
  return types
}

// YYYYMMDD + HHMM → 표시용 (페이지 + 모달 공유)
export function fmtCafe24DateTime(d: string | null, t: string | null): string {
  if (!d || d.length !== 8) return ''
  const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
  if (!t || t.length < 4) return date
  return `${date} ${t.slice(0, 2)}:${t.slice(2, 4)}`
}

// dispatch_order 가 가지는 대차접수 row 매핑용 키 — (idno, mddt, srno)
export type DispatchRequestKey = {
  idno: string
  mddt: string
  srno: number
}

// ─── PR-OPS-1.5f — ACR 측 추가 데이터 ──────────────────────────

// /api/operations/cafe24-acr-memos 응답 (ACR 사고처리관리 상담내역)
export type AcrMemoRow = {
  memoidno: string
  memomddt: string
  memosrno: number
  memonums: number
  memosort: number
  memotitl: string | null
  memotext: string | null
  memognus: string | null
  memogndt: string | null
  memogntm: string | null
  memoflag: string | null
  user_name: string | null
}

// /api/operations/cafe24-factory-assignment 응답 (공장배정)
export type FactoryAssignmentRow = {
  oderidno: string
  odermddt: string
  odersrno: number
  oderseqn: number | null
  oderfact: string | null
  odermscs: string | null
  odermetp: string | null
  oderstat: string | null
  odergnus: string | null
  odergndt: string | null
  odergntm: string | null
  factname: string | null
  factbdno: string | null
  facthpno: string | null
  facttelo: string | null
  factaddr: string | null
  user_name: string | null
}

// 카테고리 색상 + 라벨 (D/C 섹션 공유)
export const CATEGORY_META: Record<ConsultationCategory, { label: string; tint: string; emoji: string }> = {
  intake:        { label: '인테이크',  tint: '#ef4444', emoji: '🆕' },
  followup:      { label: '팔로업',    tint: '#3b82f6', emoji: '📞' },
  status_change: { label: '상태변경',  tint: '#f97316', emoji: '🔄' },
  dispatch:      { label: '출고',      tint: '#10b981', emoji: '🚀' },
  return:        { label: '반납',      tint: '#8b5cf6', emoji: '🔙' },
  billing:       { label: '청구',      tint: '#eab308', emoji: '💳' },
  other:         { label: '기타',      tint: '#64748b', emoji: '📝' },
}
