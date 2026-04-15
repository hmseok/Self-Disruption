/**
 * 견적 시스템 공유 유틸리티
 * - 포매터 (숫자, 날짜, 전화, 생년월일, 면허)
 * - 정비 패키지 상수
 * - 상태 배지 헬퍼
 * - 다음 주소검색 헬퍼
 *
 * ※ 보험/약관 상수는 lib/contract-terms.ts 사용
 * ※ 인증 헬퍼는 app/utils/auth-client.ts 사용
 */

// ============================================================================
// 숫자/날짜 포매터
// ============================================================================

/** 천단위 콤마 포매터 (반올림) */
export const f = (n: number) => Math.round(n || 0).toLocaleString()

/**
 * 억/조 자동 변환 포매터 (오버플로우 방지 + 시인성)
 * - 1조 이상: "1.23조"
 * - 1억 이상: "1.23억"
 * - 그 외: 천단위 콤마 (f)
 * - NaN/Infinity/null: "0"
 */
export const formatWonCompact = (n: number | null | undefined, opts?: { unit?: boolean }): string => {
  const unit = opts?.unit !== false
  const v = Number(n)
  if (!Number.isFinite(v) || v === 0) return unit ? '0원' : '0'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}조${unit ? '원' : ''}`
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)}억${unit ? '원' : ''}`
  return `${sign}${Math.round(abs).toLocaleString()}${unit ? '원' : ''}`
}

/**
 * 안전 숫자 파서: 빈 문자열/null/undefined/NaN → 0
 * - 과도한 값(1e15 이상)은 0으로 클램프 (오버플로우 방어)
 */
export const safeNum = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : Number(v)
  if (!Number.isFinite(n)) return fallback
  if (Math.abs(n) >= 1e15) return fallback // 오버플로우 방어
  return n
}

/**
 * 0-divide 방어 나눗셈
 */
export const safeDiv = (a: number, b: number, fallback = 0): number => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return fallback
  return a / b
}

/** 날짜 포매터 YYYY.MM.DD */
export const fDate = (d: string) => {
  if (!d) return '-'
  const dt = new Date(d)
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`
}

/** 날짜+시간 포매터 YYYY.MM.DD HH:MM */
export const fDateTime = (d: string) => {
  if (!d) return '-'
  const dt = new Date(d)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}.${pad(dt.getMonth() + 1)}.${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

/** parseNum: 문자열 → 숫자 (NaN → 0) */
export const parseNum = (v: string | number) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : v
  return isNaN(n) ? 0 : n
}

// ============================================================================
// 입력 포매터 (자동 하이픈)
// ============================================================================

/** 전화번호 자동 하이픈 (010-0000-0000) */
export const fmtPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

/** 주민번호 자동 하이픈 (900101-1******) */
export const fmtBirth = (v: string) => {
  const d = v.replace(/[^0-9*]/g, '').slice(0, 13)
  if (d.length <= 6) return d
  return `${d.slice(0, 6)}-${d.slice(6)}`
}

/** 면허번호 자동 하이픈 (00-00-000000-00) */
export const fmtLicense = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 12)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}-${d.slice(2)}`
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`
  return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 10)}-${d.slice(10)}`
}

// ============================================================================
// 정비 패키지 상수
// ============================================================================

export const MAINT_PACKAGE_LABELS: Record<string, string> = {
  self: '자가정비',
  oil_only: '엔진오일 교환',
  basic: '기본정비',
  full: '종합정비',
}

export const MAINT_PACKAGE_DESC: Record<string, string> = {
  self: '고객 직접 정비 (렌탈료 미포함)',
  oil_only: '엔진오일+필터 교환 포함',
  basic: '오일류+에어필터+점검+순회정비 포함',
  full: '오일류+필터+브레이크+타이어+배터리+와이퍼+냉각수 전항목 포함',
}

export const MAINT_ITEMS_MAP: Record<string, string[]> = {
  oil_only: ['엔진오일+필터 정기 교환'],
  basic: ['엔진오일+필터', '에어컨필터', '에어클리너', '와이퍼', '점화플러그', '순회정비(방문점검)'],
  full: ['엔진오일+필터', '에어컨필터', '에어클리너', '와이퍼', '점화플러그', '순회정비(방문점검)', '브레이크패드(전/후)', '타이어(4본)', '배터리', '미션오일', '냉각수/부동액'],
}

// ============================================================================
// 상태 배지 헬퍼
// ============================================================================

export type QuoteStatus = 'draft' | 'active' | 'shared' | 'signed' | 'contracted' | 'archived'

export const QUOTE_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: '임시저장', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  active: { label: '확정', bg: 'bg-green-100', text: 'text-green-700' },
  shared: { label: '발송됨', bg: 'bg-blue-100', text: 'text-blue-700' },
  signed: { label: '서명완료', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  contracted: { label: '계약전환', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  archived: { label: '보관', bg: 'bg-gray-100', text: 'text-gray-500' },
}

export const SHORT_TERM_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: '임시저장', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  sent: { label: '발송', bg: 'bg-blue-100', text: 'text-blue-700' },
  accepted: { label: '수락', bg: 'bg-green-100', text: 'text-green-700' },
  contracted: { label: '계약', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  cancelled: { label: '취소', bg: 'bg-red-100', text: 'text-red-600' },
}

// ============================================================================
// 다음 주소검색 헬퍼
// ============================================================================

/** 다음 주소검색 팝업 실행 */
export const openDaumPostcode = (callback: (address: string) => void) => {
  const run = () => {
    new (window as any).daum.Postcode({
      oncomplete: (data: any) => {
        callback(data.roadAddress || data.jibunAddress || data.address)
      },
    }).open()
  }

  if (!(window as any).daum?.Postcode) {
    const s = document.createElement('script')
    s.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
    s.onload = run
    document.head.appendChild(s)
  } else {
    run()
  }
}

// ============================================================================
// 타임라인 이벤트 설정
// ============================================================================

export const TIMELINE_EVENT_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string }> = {
  created: { icon: '📄', label: '견적 생성', color: '#6b7280', bg: 'rgba(0,0,0,0.04)' },
  shared: { icon: '🔗', label: '링크 공유', color: '#2d5a9e', bg: '#eff6ff' },
  sent: { icon: '📤', label: '견적 발송', color: '#7c3aed', bg: '#f5f3ff' },
  viewed: { icon: '👁️', label: '고객 열람', color: '#0891b2', bg: '#ecfeff' },
  signed: { icon: '✍️', label: '고객 서명', color: '#059669', bg: '#ecfdf5' },
  contract_created: { icon: '📋', label: '계약 생성', color: '#059669', bg: '#ecfdf5' },
  revoked: { icon: '🚫', label: '링크 비활성화', color: '#dc2626', bg: '#fef2f2' },
  pdf_stored: { icon: '💾', label: 'PDF 저장', color: '#0369a1', bg: '#f0f9ff' },
}
