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
  // P2.1c-1 — cafe24 acrotpth 키 (dispatch 상세 link 용)
  cafe24_otpt_idno?: string | null
  cafe24_otpt_mddt?: string | null
  cafe24_otpt_srno?: number | null
  // ride_accidents JOIN 결과 (있으면)
  acc_id?: number | null
  acc_date?: string | null
  acc_location?: string | null
  acc_driver_name?: string | null
  acc_driver_phone?: string | null
  acc_insurance_company?: string | null
  acc_claim_no?: string | null
  acc_stage?: string | null
  acc_car_id?: string | null
  acc_created_at?: string | null
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
  // P2.1b 풍성화 (mgcap/api_accident.php SQL 검증 후 12 컬럼)
  otptdsli: string | null    // 운전자면허 (코드)
  otptdsbh: string | null    // 생년월일
  otptdsbn: string | null    // 보험접수번호 (당사)
  otptdsre: string | null    // 계약자와의관계
  otptcare: string | null    // 운전자관계
  otptacrn: string | null    // 운행가능여부 Y/N
  otptadfg: string | null    // 공장입고여부 Y/N
  otptbdnm: string | null    // 사고장소 (정식)
  otptpknm: string | null    // 수리희망지
  otptdsus: string | null    // 대물담당자
  otptdstl: string | null    // 대물담당자 HP
  otptpart: string | null    // 파손부위 (acrparth + comcbsdm subquery)
  // 배정공장 (ajaoderh + pmcfactm subquery — 활성 oderstat<>'X' 만, ','로 join)
  factory_names: string | null
  // P2.1a-pivot-B2 — 차량 계약 정보 (pmccarsm) + 코드→한글 매핑 (comcbsdm)
  cars_vin: string | null          // 차대번호 (VIN)
  cars_contract_no: string | null  // 계약번호
  cars_start_date: string | null   // 차량등록일 (raw YYYYMMDD[HHMI] — 사용자 확정 2026-05-16)
  cars_use_from: string | null     // 계약 사용 시작
  cars_use_to: string | null       // 계약 사용 종료
  cars_user_hp: string | null      // 계약자 휴대폰
  otptdsli_label: string | null    // 운전자면허 한글 (1B → 1종 보통)
  otptacbn_label: string | null    // 사고구분 한글
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

// P2.1a-pivot-B2 — cafe24 raw 날짜 (YYYYMMDD 8자리 또는 YYYYMMDDHHMI 12자리) → YYYY-MM-DD
// pmccarsm 의 carsstdt/carscofr/carscoto 등 계약 관련 컬럼 표시용
export function fmtCafe24DateOnly(raw: string | null | undefined): string {
  if (!raw) return '-'
  const digits = String(raw).replace(/[^0-9]/g, '')
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  }
  return raw  // 비정상 길이 raw 보존
}

// P2.1a-pivot-B3.1 — cafe24 SMS 본문 sanitize (사용자 명시 2026-05-16):
//   「특수문자로 줄바꿈 한것같은데 문자 폼모양으로 보여주고
//    개발시 들어간 특수문자나 이런것들은 안보여주면 좋겠는데」
//   추가 (사용자 스크린샷 2026-05-16):
//     실제 cafe24/아리고 본문에 @^* (필드 구분자) + @^ (줄바꿈 marker) 가
//     그대로 포함됨. 단순 HTML/엔티티 처리만으론 부족.
//
// 처리 대상 마커:
//   @^*                      → \n  (필드 구분 — cafe24 템플릿 변수 구분자)
//   @^                       → \n  (줄바꿈 marker)
//   <br>, <br/>, <br />      → \n
//   \r\n, \r                 → \n  정규화
//   &nbsp; &amp; &lt; &gt;   → 일반 문자 환원
//   기타 HTML 태그            → strip
//   다중 개행 3개+            → 2개로 축소
//   앞뒤 공백/개행 trim
//   각 줄 trailing 공백 제거
//
// 보존:
//   [#XX#] 같은 미치환 변수 (디버깅용)
//   ■ 같은 강조 marker (제목 표시)
export function sanitizeSmsBody(raw: string | null | undefined): string {
  if (!raw) return ''
  let s = String(raw)
  // 1. cafe24/아리고 특수 마커 (3글자 @^* 먼저 → 2글자 @^ 나중)
  //    순서 중요: @^* 를 먼저 매칭해야 @^ 로 잘리지 않음
  s = s.replace(/@\^\*/g, '\n')
  s = s.replace(/@\^/g, '\n')
  // 2. <br> 변형 모두 → \n
  s = s.replace(/<br\s*\/?>/gi, '\n')
  // 3. 개행 정규화 (\r\n / \r → \n)
  s = s.replace(/\r\n?/g, '\n')
  // 4. 나머지 HTML 태그 제거
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '')
  // 5. HTML 엔티티 환원 (자주 쓰이는 것만)
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  // 6. 각 줄 trailing 공백 제거 + leading 공백도 (필드 구분 후 자주 발생)
  s = s.split('\n').map((line) => line.replace(/[ \t]+$/, '').replace(/^[ \t]+/, '')).join('\n')
  // 7. 다중 개행 3개+ → 2개로 (가독성, 의도된 단락 구분 유지)
  s = s.replace(/\n{3,}/g, '\n\n')
  // 8. 앞뒤 trim
  return s.trim()
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

// /api/operations/cafe24-sms-history 응답 (문자 발송 이력 + 발송문구) — PR-B3 (2026-05-16)
// crmsendh (본체) + crmsmsgh (템플릿) + picuserm (발송자)
export type Cafe24SmsRow = {
  sendseqn: number
  sendidno: string
  sendmddt: string
  sendsrno: number
  sendsndt: string | null     // 발송일자 (YYYYMMDD)
  sendsntm: string | null     // 발송시간 (HHMMSS)
  sendhpdt: string | null     // 예약 발송일자
  sendhptm: string | null     // 예약 발송시간
  sendresv: string | null     // 예약 Y/N
  sendmobl: string | null     // 수신자 번호
  sendmesg: string | null     // 발송 본문
  sendsbjt: string | null     // 제목
  sendstat: string | null     // Y(완료) / N(대기) / F(실패) / X(취소)
  sendrslt: string | null     // 결과 메시지
  sendtype: string | null     // SMS / LMS / MMS / KAKAO
  sendcust: string | null
  sendgubn: string | null
  sendcode: string | null
  sendgnus: string | null
  user_name: string | null    // picuserm.username
  smsgdesc: string | null     // 템플릿 설명 (crmsmsgh)
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
