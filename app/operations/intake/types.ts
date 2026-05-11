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
