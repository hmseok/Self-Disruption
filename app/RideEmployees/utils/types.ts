// ═══════════════════════════════════════════════════════════════════
// RideEmployees 타입 정의
// ═══════════════════════════════════════════════════════════════════
import type { ColorTone } from '@/app/CallScheduler/utils/types'

export type EmploymentType = '정규' | '계약' | '파트' | '용역' | null

export interface RideEmployee {
  id: string
  name: string
  profile_id: string | null
  department: string | null
  position: string | null
  employment_type: string | null
  hire_date: string | null
  resign_date: string | null
  phone: string | null
  email: string | null
  color_tone: ColorTone
  group_label: string | null
  memo: string | null
  public_token: string | null
  public_token_issued_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export const DEPARTMENT_OPTIONS = [
  '콜센터',
  '운영',
  '정비',
  '영업',
  '관리',
  '기타',
]

export const POSITION_OPTIONS = [
  '대표',
  '이사',
  '부장',
  '차장',
  '과장',
  '대리',
  '주임',
  '사원',
]

export const EMPLOYMENT_TYPE_OPTIONS = [
  '정규',
  '계약',
  '파트',
  '용역',
]

export const GROUP_OPTIONS = [
  '주간',
  '야간',
  '저녁',
  '관리',
  '기타',
]
