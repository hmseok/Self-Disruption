// ───────────────────────────────────────────────────────────────
// 분류 축(CodeAxis) 정의 — 설정 페이지가 관리하는 모든 분류 체계
// 데이터 소스 / 편집 가능 범위 / 매핑 규칙을 한 곳에 모음
// ───────────────────────────────────────────────────────────────

// ── 메인/부가 영역 분리 (그룹 구성·매핑 페이지에서 공통 사용) ─────
// 메인 (공장 그룹화 핵심): 즐겨찾기 그룹 / 보험 입고 / 공장 유형 / 특수 태그 / 차량 분류
export const PRIMARY_AXIS_KEYS = new Set(['group', 'insurance', 'facttype', 'tag', 'vehicle'])
// 부가 (운영·사고 분류): 정산 / 고객사 / 관리유형 / 사고유형 / 처리상태 / 손해 / 견인 / 서비스
export const SECONDARY_AXIS_KEYS = new Set(['settlement', 'capital', 'manageType', 'accidentType', 'claimStatus', 'damage', 'towing', 'servicePlan'])

export type EditableLevel = 'all' | 'label-only' | 'readonly'

export type CodeItem = {
  key: string         // 데이터에서 매칭할 코드값 (변경 X — readonly part)
  label: string       // 표시 라벨 (편집 가능)
  color: string       // hex (편집 가능)
  emoji: string       // 라벨 앞 (편집 가능)
  hidden: boolean     // 표시 끄기 (편집 가능)
  description: string // 안내 텍스트
}

export type CodeAxis = {
  key: string                 // 'group' | 'insurance' | 'facttype' | 'vehicle' | 'tag' | 'settlement' | 'custom-axis-{ts}'
  title: string
  emoji: string
  description: string
  editable: EditableLevel     // 어디까지 편집 가능 (항목 단위)
  custom: boolean             // 항목 단위 추가 가능 (custom 축은 신규 항목 add/delete)
  match: 'groups' | 'insurance' | 'facttype' | 'tags' | 'custom'  // 데이터에서 어디 보고 카운트할지
  items: CodeItem[]
  // ── 축 자체 메타 (분류 셋팅 페이지에서 편집) ──
  axisHidden?: boolean        // 페이지 탭/패널에서 숨김 (기본 false = 노출)
  axisCustom?: boolean        // 사용자 정의 축 (true 면 삭제 버튼 노출, default 13축은 false)
}

// ── 1. 즐겨찾기 그룹 ─────────────────────────────────────────
export const DEFAULT_GROUP: CodeItem[] = [
  { key: 'mg-only',       label: 'MG실비 입고',     color: '#2563eb', emoji: '🛡', hidden: false, description: 'MG손해보험 실비 입고 가능 공장' },
  { key: 'main-incoming', label: '메인 입고',        color: '#10b981', emoji: '🏭', hidden: false, description: '전체 입고 가능 메인 통합 그룹 (가장 큼)' },
  { key: 'autohands',     label: '오토핸즈 입고',    color: '#16a34a', emoji: '🔧', hidden: false, description: '오토핸즈 입고 가능 공장' },
  { key: 'meritz-only',   label: '메리츠실비 전용',  color: '#f97316', emoji: '🚨', hidden: false, description: '메리츠실비만 입고 가능' },
  { key: 'backup-list',   label: '백업 리스트',      color: '#94a3b8', emoji: '📋', hidden: false, description: '구버전/백업 즐겨찾기' },
  { key: 'terminated',    label: '종료 공장',        color: '#64748b', emoji: '⛔', hidden: true,  description: '거래 종료된 공장' },
]

// ── 2. 보험 입고 (4축) ────────────────────────────────────────
export const DEFAULT_INSURANCE: CodeItem[] = [
  { key: 'mg',        label: 'MG실비',   color: '#2563eb', emoji: '🛡', hidden: false, description: 'MG손해보험 실비 입고 가능' },
  { key: 'turnkey',   label: '턴키',     color: '#7c3aed', emoji: '🗝',  hidden: false, description: '턴키 (정찰가) 입고 가능' },
  { key: 'meritz',    label: '메리츠',   color: '#f97316', emoji: '🟧', hidden: false, description: '메리츠화재 실비 입고 가능' },
  { key: 'autohands', label: '오토핸즈', color: '#16a34a', emoji: '🟩', hidden: false, description: '오토핸즈 입고 가능' },
]

// ── 3. 공장 유형 (FACTTYPE) ──────────────────────────────────
export const DEFAULT_FACTTYPE: CodeItem[] = [
  { key: 'A', label: '공장(일반)',           color: '#2563eb', emoji: '🔧', hidden: false, description: '일반 정비/판금 공장' },
  { key: 'B', label: '공장(P)',              color: '#1d4ed8', emoji: '🅿', hidden: false, description: '보험사 지정(P) 공장' },
  { key: 'C', label: '정비업체(일반)',        color: '#0891b2', emoji: '⚙', hidden: false, description: '일반 정비업체' },
  { key: 'D', label: '정비업체(정기점검)',    color: '#0e7490', emoji: '📅', hidden: false, description: '정기점검 전문' },
  { key: 'E', label: '자동차부품',            color: '#a16207', emoji: '🧰', hidden: false, description: '부품 공급' },
  { key: 'F', label: '타이어',                color: '#d97706', emoji: '🛞', hidden: false, description: '타이어 전문' },
  { key: 'G', label: '기타(임시)',            color: '#64748b', emoji: '➕', hidden: false, description: '기타 임시 분류' },
  { key: 'H', label: '법정검사',              color: '#9333ea', emoji: '🔍', hidden: false, description: '법정검사장' },
  { key: 'I', label: '렌터카(대차)',          color: '#db2777', emoji: '🚗', hidden: false, description: '대차 차량 렌터카' },
  { key: 'J', label: '정비업체(미션)',        color: '#ea580c', emoji: '⚡', hidden: false, description: '미션 전문' },
  { key: 'K', label: '자동차유리',            color: '#0d9488', emoji: '🪟', hidden: false, description: '유리 전문' },
  { key: 'L', label: '정비업체(순회)',        color: '#16a34a', emoji: '🚚', hidden: false, description: '출장/순회 정비' },
  { key: 'M', label: '탁송',                  color: '#dc2626', emoji: '🛻', hidden: false, description: '차량 탁송' },
  { key: 'N', label: '자동차유리(보조)',      color: '#0d9488', emoji: '🪟', hidden: false, description: '유리 보조' },
  { key: 'Z', label: '종료(가상)',            color: '#94a3b8', emoji: '⛔', hidden: true,  description: '거래 종료 가상 코드' },
]

// ── 4. 차량 분류 (custom 가능) ───────────────────────────────
export const DEFAULT_VEHICLE: CodeItem[] = [
  { key: 'domestic',     label: '국산차',    color: '#2563eb', emoji: '🚙', hidden: false, description: '국산 일반 차량' },
  { key: 'foreign-only', label: '수입차전용', color: '#7c3aed', emoji: '🚗', hidden: false, description: '수입차 전용 입고' },
  { key: 'tesla-only',   label: '테슬라전용', color: '#dc2626', emoji: '🔋', hidden: false, description: '테슬라 전용 입고' },
]

// ── 5. 특수 태그 (자동 추출되는 것들) ────────────────────────
export const DEFAULT_TAG: CodeItem[] = [
  { key: 'hyundai-bluehands',  label: '현대 블루핸즈',     color: '#06b6d4', emoji: '🛠', hidden: false, description: '현대자동차 블루핸즈 가맹점' },
  { key: 'kia-autoq',          label: '기아 오토큐',       color: '#d97706', emoji: '🛠', hidden: false, description: '기아자동차 오토큐 가맹점' },
  { key: 'samsung-card',       label: '삼성카드',          color: '#0ea5e9', emoji: '💳', hidden: false, description: '삼성카드 사고 처리' },
  { key: 'samsung-return',     label: '삼성반납',          color: '#0284c7', emoji: '↩', hidden: false, description: '삼성카드 반납차량' },
  { key: 'samsung-pyeongtaek', label: '삼성평택',          color: '#0369a1', emoji: '🏭', hidden: false, description: '삼성전자 평택캠퍼스' },
  { key: 'unassignable',       label: '배정불가',          color: '#64748b', emoji: '🚫', hidden: false, description: '현재 배정 불가 상태' },
]

// ── 6. 정산 구분 (custom — 사용자 정의, 신규) ───────────────
export const DEFAULT_SETTLEMENT: CodeItem[] = [
  { key: 'monthly',  label: '월정산',     color: '#2563eb', emoji: '📅', hidden: false, description: '매월 정산 마감' },
  { key: 'biweekly', label: '격주 정산',  color: '#10b981', emoji: '📆', hidden: false, description: '2주 단위 정산' },
  { key: 'percase',  label: '건별 정산',  color: '#f59e0b', emoji: '🧾', hidden: false, description: '사고 건별 즉시 정산' },
  { key: 'prepaid',  label: '선금 결제',  color: '#7c3aed', emoji: '💳', hidden: false, description: '입고 전 선결제' },
]

// ── 7. 고객사 (캐피탈사) — Ride-Platform 실데이터 기반 ───
export const DEFAULT_CAPITAL: CodeItem[] = [
  { key: 'machumcar',  label: '마춤카',       color: '#2563eb', emoji: '🏢', hidden: false, description: '마춤카 (캐피탈)' },
  { key: 'maeumcar',   label: '마음카',       color: '#0891b2', emoji: '🏢', hidden: false, description: '마음카 (캐피탈)' },
  { key: 'meritz-cap', label: '메리츠캐피탈', color: '#f97316', emoji: '🏢', hidden: false, description: '메리츠캐피탈' },
  { key: 'samsung-card', label: '삼성카드',    color: '#0ea5e9', emoji: '💳', hidden: false, description: '삼성카드 사고접수' },
  { key: 'kb-cap',     label: 'KB캐피탈',     color: '#facc15', emoji: '🏢', hidden: false, description: 'KB캐피탈' },
  { key: 'etc',        label: '기타',         color: '#94a3b8', emoji: '➕', hidden: false, description: '미지정/기타' },
]

// ── 8. 관리유형 (실비 / 턴키) — 차량 단위 분류 ─────────────
export const DEFAULT_MANAGE_TYPE: CodeItem[] = [
  { key: 'silbi',  label: '실비',  color: '#2563eb', emoji: '💵', hidden: false, description: '실비 청구 (실 비용 청구)' },
  { key: 'turnkey', label: '턴키', color: '#7c3aed', emoji: '🗝', hidden: false, description: '턴키 (정찰가)' },
  { key: 'mixed',  label: '혼합',  color: '#16a34a', emoji: '🔀', hidden: false, description: '혼합 운영' },
]

// ── 9. 사고 유형 (OTPTACBN) — 카페24 코드 ──────────────────
export const DEFAULT_ACCIDENT_TYPE: CodeItem[] = [
  { key: 'K', label: '과실',     color: '#dc2626', emoji: '⚠', hidden: false, description: '과실 사고' },
  { key: 'G', label: '가해',     color: '#ea580c', emoji: '🚗', hidden: false, description: '가해 사고' },
  { key: 'P', label: '피해',     color: '#0891b2', emoji: '💥', hidden: false, description: '피해 사고' },
  { key: 'D', label: '단독',     color: '#7c3aed', emoji: '🛣', hidden: false, description: '단독 사고' },
  { key: 'J', label: '자차',     color: '#2563eb', emoji: '🚙', hidden: false, description: '자차 처리' },
  { key: 'M', label: '면책',     color: '#94a3b8', emoji: '🛡', hidden: false, description: '면책 처리' },
  { key: 'O', label: '정비',     color: '#16a34a', emoji: '🔧', hidden: false, description: '정비 입고' },
  { key: 'Q', label: '검사',     color: '#9333ea', emoji: '🔍', hidden: false, description: '검사 입고' },
  { key: 'B', label: '보물',     color: '#facc15', emoji: '📦', hidden: false, description: '보물 (특수)' },
  { key: 'E', label: '기타',     color: '#64748b', emoji: '➕', hidden: false, description: '기타 사고 유형' },
  { key: 'H', label: '긴급출동', color: '#f97316', emoji: '🚨', hidden: false, description: '긴급 출동' },
  { key: 'S', label: '긴급출동(S)', color: '#dc2626', emoji: '🚨', hidden: false, description: '긴급 출동 보조' },
]

// ── 10. 사고 처리 상태 (Ride-Platform 4단계) ──────────────
export const DEFAULT_CLAIM_STATUS: CodeItem[] = [
  { key: 'received',     label: '접수',     color: '#3b82f6', emoji: '📥', hidden: false, description: '신규 접수' },
  { key: 'in-progress',  label: '진행',     color: '#0891b2', emoji: '⚙', hidden: false, description: '처리 진행 중' },
  { key: 'investigation', label: '조사',     color: '#f59e0b', emoji: '🔍', hidden: false, description: '현장/손해 조사' },
  { key: 'completed',    label: '완료',     color: '#10b981', emoji: '✅', hidden: false, description: '처리 완료' },
  { key: 'hold',         label: '보류',     color: '#94a3b8', emoji: '⏸', hidden: false, description: '보류 상태 (부가 마커)' },
]

// ── 11. 손해 구분 (5축 — 대인/대물/자차/자손/무보험) ─────
export const DEFAULT_DAMAGE: CodeItem[] = [
  { key: 'bodily',      label: '대인',     color: '#dc2626', emoji: '🤕', hidden: false, description: '대인 손해' },
  { key: 'property',    label: '대물',     color: '#f59e0b', emoji: '💥', hidden: false, description: '대물 손해' },
  { key: 'self-car',    label: '자차',     color: '#2563eb', emoji: '🚗', hidden: false, description: '자차 손해' },
  { key: 'self-injury', label: '자손',     color: '#7c3aed', emoji: '🩹', hidden: false, description: '자기신체 손해' },
  { key: 'uninsured',   label: '무보험',   color: '#64748b', emoji: '🚫', hidden: false, description: '무보험 사고' },
]

// ── 12. 견인 구분 (안함/함) ────────────────────────────────
export const DEFAULT_TOWING: CodeItem[] = [
  { key: 'none',  label: '안함', color: '#94a3b8', emoji: '🚫', hidden: false, description: '견인 없음' },
  { key: 'done',  label: '함',   color: '#dc2626', emoji: '🚛', hidden: false, description: '견인 처리됨 (기사명/연락처 필요)' },
]

// ── 13. 서비스 상품 (관리 계약 형태) ──────────────────────
export const DEFAULT_SERVICE_PLAN: CodeItem[] = [
  { key: 'mc-fix-6m',  label: 'MC_Fix(6개월)',  color: '#2563eb', emoji: '📦', hidden: false, description: '6개월 단위 고정 관리' },
  { key: 'mc-fix-12m', label: 'MC_Fix(12개월)', color: '#0891b2', emoji: '📦', hidden: false, description: '12개월 단위 고정 관리' },
  { key: 'mc-flex',    label: 'MC_Flex',        color: '#7c3aed', emoji: '🔄', hidden: false, description: '유연 관리 상품' },
  { key: 'spot',       label: '스팟',           color: '#f59e0b', emoji: '⚡', hidden: false, description: '단건 처리' },
]

// ── 모든 축 ──────────────────────────────────────────────────
export const DEFAULT_AXES: CodeAxis[] = [
  {
    key: 'group',
    title: '즐겨찾기 그룹',
    emoji: '🧩',
    description: '카카오맵 즐겨찾기에서 추출된 운영 그룹. 라벨/색상/표시 편집 가능.',
    editable: 'all',
    custom: true,
    match: 'groups',
    items: DEFAULT_GROUP,
  },
  {
    key: 'insurance',
    title: '보험 입고 / 입고 방식',
    emoji: '🛡',
    description: '한 공장이 여러 캐피탈을 받을 수 있음 (4축 boolean). 라벨만 편집 가능.',
    editable: 'all',
    custom: true,
    match: 'insurance',
    items: DEFAULT_INSURANCE,
  },
  {
    key: 'facttype',
    title: '공장 유형 (FACTTYPE)',
    emoji: '🏭',
    description: '카페24 ERP 호환 공장 유형 코드. 키는 변경 불가, 라벨만 편집.',
    editable: 'all',
    custom: true,
    match: 'facttype',
    items: DEFAULT_FACTTYPE,
  },
  {
    key: 'vehicle',
    title: '차량 분류',
    emoji: '🚗',
    description: '국산/수입/테슬라 등 차량 종류 분류. 사용자 정의 추가 가능.',
    editable: 'all',
    custom: true,
    match: 'tags',
    items: DEFAULT_VEHICLE,
  },
  {
    key: 'tag',
    title: '특수 태그',
    emoji: '🏷',
    description: '공장명에서 자동 추출되는 특성 태그. 라벨만 편집.',
    editable: 'all',
    custom: true,
    match: 'tags',
    items: DEFAULT_TAG,
  },
  {
    key: 'settlement',
    title: '정산 구분',
    emoji: '💵',
    description: '공장별 정산 방식 분류. 사용자 정의 (현재 데이터엔 미연결, 추후 매핑).',
    editable: 'all',
    custom: true,
    match: 'custom',
    items: DEFAULT_SETTLEMENT,
  },
  // ── Ride-Platform 매핑 (사고 접수 스키마) ──
  {
    key: 'capital',
    title: '고객사 (캐피탈사)',
    emoji: '🏢',
    description: '차량의 캐피탈/리스/카드사 운영 주체. Ride-Platform 의 "고객사" 필드와 매핑.',
    editable: 'all',
    custom: true,
    match: 'custom',
    items: DEFAULT_CAPITAL,
  },
  {
    key: 'manageType',
    title: '관리유형 (실비/턴키)',
    emoji: '💵',
    description: '차량 단위 비용 처리 방식. Ride-Platform "관리유형" 필드.',
    editable: 'all',
    custom: true,
    match: 'custom',
    items: DEFAULT_MANAGE_TYPE,
  },
  {
    key: 'accidentType',
    title: '사고 유형',
    emoji: '⚠',
    description: '카페24 ERP 코드(B/D/E/G/H/J/K/M/O/P/Q/S) 외에 운영 정의 사고 유형 추가 가능. 라벨/색상/이모지 모두 편집 가능.',
    editable: 'all',
    custom: true,
    match: 'custom',
    items: DEFAULT_ACCIDENT_TYPE,
  },
  {
    key: 'claimStatus',
    title: '사고 처리 상태',
    emoji: '📋',
    description: 'Ride-Platform 사고접수 4단계 상태 (접수/진행/조사/완료).',
    editable: 'all',
    custom: true,
    match: 'custom',
    items: DEFAULT_CLAIM_STATUS,
  },
  {
    key: 'damage',
    title: '손해 구분 (5축)',
    emoji: '💥',
    description: '대인/대물/자차/자손/무보험 — 사고 1건이 여러 축에 동시 표시될 수 있음.',
    editable: 'all',
    custom: true,
    match: 'custom',
    items: DEFAULT_DAMAGE,
  },
  {
    key: 'towing',
    title: '견인 구분',
    emoji: '🚛',
    description: '견인 발생 여부. "함" 이면 기사명/연락처 별도 보관.',
    editable: 'all',
    custom: true,
    match: 'custom',
    items: DEFAULT_TOWING,
  },
  {
    key: 'servicePlan',
    title: '서비스 상품',
    emoji: '📦',
    description: '계약 단위 관리 상품 (예: MC_Fix(6개월)).',
    editable: 'all',
    custom: true,
    match: 'custom',
    items: DEFAULT_SERVICE_PLAN,
  },
]
