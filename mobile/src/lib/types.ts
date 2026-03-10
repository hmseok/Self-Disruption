// ============================================
// 타입 정의 (웹과 공유)
// ============================================

export interface Position {
  id: string
  company_id: string
  name: string
  level: number
  description?: string
  created_at: string
  updated_at: string
}

export interface Department {
  id: string
  company_id: string
  name: string
  description?: string
  created_at: string
  updated_at: string
}

export interface Company {
  id: string
  name: string
  business_number?: string
  plan: string
  owner_id: string
  is_active: boolean
  created_at: string
}

export interface Profile {
  id: string
  email?: string
  company_id: string
  role: 'god_admin' | 'master' | 'user'
  is_super_admin: boolean
  position_id?: string
  department_id?: string
  employee_name?: string
  phone?: string
  is_active: boolean
  avatar_url?: string
  created_at?: string
  position?: Position
  department?: Department
  companies?: Company
}

export interface PagePermission {
  id: string
  company_id: string
  position_id: string
  page_path: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  data_scope: 'all' | 'department' | 'own'
  created_at: string
  updated_at: string
}

export interface Car {
  id: number
  created_at?: string
  company_id?: string
  number: string
  vin?: string
  brand: string
  model: string
  trim?: string
  year?: number
  fuel?: string
  status: 'available' | 'rented' | 'maintenance' | 'sold'
  location?: string
  mileage?: number
  image_url?: string
  purchase_price: number
  acq_date?: string
  owner_id?: string
}

export interface InsuranceContract {
  id: number
  company_id?: string
  car_id?: number
  insurance_company?: string
  policy_number?: string
  start_date?: string
  end_date?: string
  premium?: number
  coverage_type?: string
  status?: string
  created_at?: string
  cars?: Car
}

export interface Quote {
  id: number
  company_id?: string
  customer_name?: string
  car_id?: number
  start_date?: string
  end_date?: string
  monthly_cost?: number
  status?: string
  created_at?: string
  cars?: Car
}

export interface Customer {
  id: number
  company_id?: string
  name: string
  phone?: string
  type?: '개인' | '법인' | '외국인'
  memo?: string
  created_at?: string
}

export interface Transaction {
  id: number
  company_id?: string
  transaction_date: string
  type: string
  client_name: string
  description: string
  amount: number
  payment_method: string
  category: string
  related_id?: string
  related_type?: string
  status: string
  created_at?: string
}

export interface Loan {
  id: number
  company_id?: string
  car_id?: number
  bank_name?: string
  loan_amount?: number
  interest_rate?: number
  monthly_payment?: number
  start_date?: string
  end_date?: string
  status?: string
  created_at?: string
  cars?: Car
}

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete'
export type DataScope = 'all' | 'department' | 'own'

// ============================================
// 현장직원용 타입 정의
// ============================================

// ── 사진 메타데이터 ─────────────────────────

export type PhotoType = 'vehicle_inspection' | 'accident' | 'maintenance' | 'handover' | 'general'

export interface PhotoMetadata {
  id?: string
  uri: string
  publicUrl?: string
  type: PhotoType
  label?: string               // 예: '전면', '후면', '좌측', '우측', '실내', '주행거리'
  car_id?: number
  related_id?: string          // 관련 레코드 ID (사고접수ID, 인수인계ID 등)
  latitude?: number
  longitude?: number
  timestamp: string
  uploaded: boolean
}

// ── 차량 인수인계 ───────────────────────────

export type HandoverDirection = 'delivery' | 'return'    // 인도 / 반납
export type HandoverStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface DamageCheckItem {
  part: string               // 예: '전면 범퍼', '좌측 도어', '후면 유리' 등
  hasDamage: boolean
  description?: string
  photoIndex?: number        // photos 배열 내 인덱스
}

export interface VehicleHandover {
  id?: string
  company_id: string
  car_id: number
  contract_id?: string
  direction: HandoverDirection
  status: HandoverStatus
  handover_date: string
  handler_id: string          // 현장직원 user_id
  customer_name?: string
  customer_phone?: string

  // 차량 상태
  mileage: number
  fuel_level?: number         // 0~100 %
  exterior_condition?: string
  interior_condition?: string

  // 손상 점검
  damage_checklist: DamageCheckItem[]
  existing_damage_notes?: string

  // 사진 (6방향 + 주행거리 + 손상부위)
  photos: PhotoMetadata[]

  // 서명
  customer_signature_url?: string
  handler_signature_url?: string

  notes?: string
  created_at?: string
  updated_at?: string

  // 조인 데이터
  car?: Car
}

// ── 정비 요청 ───────────────────────────────

export type MaintenanceIssueType =
  | 'engine'          // 엔진 이상
  | 'tire'            // 타이어
  | 'brake'           // 브레이크
  | 'warning_light'   // 경고등
  | 'electrical'      // 전기/전자
  | 'body_damage'     // 외관 손상
  | 'oil_change'      // 오일 교환
  | 'air_filter'      // 에어필터
  | 'other'           // 기타

export type MaintenancePriority = 'low' | 'medium' | 'high' | 'critical'
export type MaintenanceStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'

export interface MaintenanceRequest {
  id?: string
  company_id: string
  car_id: number
  reporter_id: string         // 접수한 직원 user_id
  issue_type: MaintenanceIssueType
  priority: MaintenancePriority
  status: MaintenanceStatus
  title: string
  description: string
  mileage?: number

  // 사진
  photos: PhotoMetadata[]

  // 정비소 정보
  repair_shop_name?: string
  repair_shop_phone?: string
  preferred_date?: string

  // 처리 결과
  assigned_to?: string
  resolved_at?: string
  resolution_notes?: string
  actual_cost?: number

  created_at?: string
  updated_at?: string

  // 조인 데이터
  car?: Car
}

// ── 사고 접수 ───────────────────────────────

export type AccidentType =
  | 'collision'         // 충돌
  | 'property_damage'   // 재물 손괴
  | 'theft'             // 도난
  | 'vandalism'         // 파손
  | 'natural_disaster'  // 자연재해
  | 'hit_and_run'       // 뺑소니
  | 'single_vehicle'    // 자차 사고
  | 'other'             // 기타

export type AccidentSeverity = 'minor' | 'moderate' | 'severe' | 'total_loss'
export type AccidentReportStatus = 'reported' | 'under_review' | 'insurance_filed' | 'resolved' | 'closed'

export interface WitnessInfo {
  name: string
  phone: string
  relationship?: string        // 목격자 관계 (행인, 동승자 등)
}

export interface CounterpartInfo {
  name?: string
  phone?: string
  vehicle_number?: string
  insurance_company?: string
}

export interface AccidentReport {
  id?: string
  company_id: string
  car_id: number
  contract_id?: string
  reporter_id: string

  // 사고 정보
  accident_date: string
  accident_time: string
  accident_type: AccidentType
  severity: AccidentSeverity
  status: AccidentReportStatus

  // 위치
  accident_location: string    // 주소 텍스트
  latitude?: number
  longitude?: number

  // 상세
  description: string
  fault_ratio?: number          // 과실비율 0~100

  // 관련자
  driver_name: string
  driver_phone: string
  witnesses: WitnessInfo[]
  counterpart?: CounterpartInfo

  // 경찰/보험
  police_reported: boolean
  police_report_no?: string
  insurance_company?: string
  insurance_claim_no?: string

  // 사진
  photos: PhotoMetadata[]

  // 비용
  estimated_repair_cost?: number
  actual_repair_cost?: number

  notes?: string
  created_at?: string
  updated_at?: string

  // 조인 데이터
  car?: Car
}

// ── 배차/일정 ───────────────────────────────

export type ScheduleTaskType =
  | 'pickup'          // 차량 픽업
  | 'delivery'        // 차량 배달
  | 'inspection'      // 차량 검수
  | 'maintenance'     // 정비 확인
  | 'accident_check'  // 사고 현장 확인
  | 'return'          // 반납 처리
  | 'other'           // 기타

export type ScheduleStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'rescheduled'

export interface Schedule {
  id?: string
  company_id: string
  user_id: string              // 배정된 직원
  task_type: ScheduleTaskType
  status: ScheduleStatus
  title: string
  description?: string

  // 일정
  scheduled_date: string
  scheduled_time?: string
  estimated_duration?: number   // 분 단위

  // 차량/고객
  car_id?: number
  contract_id?: string
  customer_name?: string
  customer_phone?: string

  // 위치
  location_name?: string
  location_address?: string
  latitude?: number
  longitude?: number

  // 실행 추적
  started_at?: string
  completed_at?: string
  arrival_latitude?: number
  arrival_longitude?: number
  proof_photos?: PhotoMetadata[]

  notes?: string
  created_at?: string
  updated_at?: string

  // 조인 데이터
  car?: Car
}

// ── 경비 영수증 ───────────────────────────────

export type ExpenseCategory =
  | '주유비'
  | '충전'
  | '주차비'
  | '접대'
  | '식비'
  | '회식비'
  | '야근식대'
  | '외근식대'
  | '교통비'
  | '사무용품'
  | '택배비'
  | '기타'

export interface ExpenseReceipt {
  id?: string
  company_id: string
  user_id: string
  user_name?: string

  // 지출 상세
  expense_date: string
  card_number?: string
  category: ExpenseCategory
  merchant: string              // 가맹점명
  item_name?: string            // 품명/내용
  customer_team?: string        // 고객명/팀원
  amount: number

  // 영수증 이미지
  receipt_url?: string

  // 차량 관련 (선택)
  car_id?: number

  created_at?: string
  updated_at?: string

  // 조인 데이터
  car?: Car
}

// ── 공통 헬퍼 타입 ──────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface FilterOptions {
  status?: string
  dateFrom?: string
  dateTo?: string
  carId?: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}
