// 재무 공용 타입 — 업로드/거래/큐 파싱에 사용
//
// 💡 UI 전반에서 any 남용 방지 용도 — 모든 필드가 선택적(optional)이거나 nullable로
//    기존 코드를 깨지 않게 설계. 점진적으로 `any` → 이 인터페이스로 교체.

/** transactions 테이블 행 — 주요 필드 */
export interface TransactionRow {
  id?: string
  transaction_date?: string | null
  client_name?: string | null
  description?: string | null
  amount?: number
  type?: 'income' | 'expense' | string
  payment_method?: string | null
  category?: string | null
  related_type?: string | null
  related_id?: string | null
  card_id?: string | null
  employee_id?: string | null
  employee_name?: string | null
  memo?: string | null
  status?: string | null
  confidence?: number
  classification_source?: string | null
  is_cancel?: boolean
  currency?: string | null
  original_amount?: number | null
  imported_from?: string | null
  deleted_at?: string | null
}

/** classification_queue 소스 데이터 (JSON 필드) */
export interface QueueSourceData {
  transaction_date?: string
  client_name?: string
  description?: string
  amount?: number
  type?: 'income' | 'expense' | string
  payment_method?: string
  category?: string
  card_id?: string | null
  card_number?: string | null
  memo?: string
  source?: string
  is_cancel?: boolean
  matched_employee_id?: string | null
  matched_employee_name?: string | null
  matched_contract_name?: string | null
  matched_schedule_id?: string | null
  // 업로드 파서 레거시 필드 (점진 정리)
  [key: string]: any
}

/** 분류 후보 (AI/규칙 기반) */
export interface ClassificationCandidate {
  category?: string
  related_type?: string | null
  related_id?: string | null
  confidence?: number
  reason?: string
  source?: 'ai' | 'rule' | 'manual' | string
}

/** classification_queue 행 — 파싱된 형태 */
export interface QueueItem {
  id: string
  transaction_id?: string | null
  source_type?: string
  source_data: QueueSourceData
  ai_category?: string | null
  ai_related_type?: string | null
  ai_related_id?: string | null
  final_category?: string | null
  final_matched_type?: string | null
  final_matched_id?: string | null
  status?: string
  candidates?: ClassificationCandidate[]
  alternatives?: any // JSON 원본 (레거시)
  _queue_id?: string
  _source?: 'queue' | 'transactions'
  // UI 파생 필드
  client_name?: string
  transaction_date?: string
  amount?: number
  type?: string
  description?: string
  payment_method?: string
  card_id?: string | null
}

/** 업로드 결과 항목 (UploadContext.results) — 분석 후 리뷰 대기 행 */
export interface UploadResultItem extends TransactionRow {
  _queue_id?: string
  _split_from?: string
  matched_schedule_id?: string | null
  matched_employee_id?: string | null
  matched_employee_name?: string | null
  ai_category?: string | null
  ai_related_type?: string | null
  ai_related_id?: string | null
  related_composite?: string
}

/** upload_batches 메타 행 */
export interface UploadBatch {
  id: string
  source_type: string
  institution?: string | null
  file_name?: string | null
  file_url?: string | null
  uploaded_at?: string | null
  uploaded_by?: string | null
  memo?: string | null
  rolled_back_at?: string | null
  deleted_at?: string | null
  // 집계 필드 (JOIN 후)
  live_count?: number
  live_classified?: number
  live_unclassified?: number
  live_income?: number
  live_expense?: number
  min_tx_date?: string | null
  max_tx_date?: string | null
}
