'use client'

import { supabase } from '../../utils/supabase'
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../../context/AppContext'
import { useUpload } from '@/app/context/UploadContext'
// DarkHeader 제거 — A1 브랜드 스트라이프 디자인 적용

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 분류 카테고리 & 상수 (Both files)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

// ═══ 회계 기준 카테고리 (DB 저장용, select 드롭다운용) ═══
const CATEGORIES = [
  { group: '매출(영업수익)', items: ['렌트/운송수입', '지입 관리비/수수료', '보험금 수령', '매각/처분수입', '이자/잡이익'] },
  { group: '자본변동', items: ['투자원금 입금', '지입 초기비용/보증금', '대출 실행(입금)'] },
  { group: '영업비용-차량', items: ['유류비', '정비/수리비', '차량보험료', '자동차세/공과금', '차량할부/리스료', '화물공제/적재물보험'] },
  { group: '영업비용-금융', items: ['이자비용(대출/투자)', '원금상환', '지입 수익배분금(출금)', '수수료/카드수수료'] },
  { group: '영업비용-인건비', items: ['급여(정규직)', '일용직급여', '성과급지급', '용역비(3.3%)', '4대보험(회사부담)'] },
  { group: '영업비용-관리', items: ['복리후생(식대)', '접대비', '여비교통비', '임차료/사무실', '통신비', '소모품/사무용품', '교육/훈련비', '광고/마케팅', '보험료(일반)', '전기/수도/가스', '경비/보안'] },
  { group: '세금/공과', items: ['원천세/부가세', '법인세/지방세', '세금/공과금'] },
  { group: '기타', items: ['쇼핑/온라인구매', '도서/신문', '감가상각비', '수선/유지비', '기타수입', '기타'] },
]

// ═══ 용도별 카테고리 (사용자 화면 표시용 — 같은 업종/종류끼리 묶기) ═══
const DISPLAY_CATEGORIES = [
  { group: '💰 돈 들어오는 것', icon: '💰', items: ['렌트/운송수입', '지입 관리비/수수료', '보험금 수령', '매각/처분수입', '이자/잡이익', '기타수입'] },
  { group: '🏦 투자/대출 입출금', icon: '🏦', items: ['투자원금 입금', '지입 초기비용/보증금', '대출 실행(입금)', '이자비용(대출/투자)', '원금상환', '지입 수익배분금(출금)'] },
  { group: '🚛 차량 운영', icon: '🚛', items: ['유류비', '정비/수리비', '차량보험료', '자동차세/공과금', '차량할부/리스료', '화물공제/적재물보험'] },
  { group: '👨‍💼 급여/인건비', icon: '👨‍💼', items: ['급여(정규직)', '일용직급여', '성과급지급', '용역비(3.3%)', '4대보험(회사부담)'] },
  { group: '🏢 사무실/운영비', icon: '🏢', items: ['임차료/사무실', '통신비', '소모품/사무용품', '전기/수도/가스', '경비/보안', '수선/유지비'] },
  { group: '🍽️ 식비/접대/출장', icon: '🍽️', items: ['복리후생(식대)', '접대비', '여비교통비'] },
  { group: '💳 수수료/카드', icon: '💳', items: ['수수료/카드수수료'] },
  { group: '🏛️ 세금/공과금', icon: '🏛️', items: ['원천세/부가세', '법인세/지방세', '세금/공과금'] },
  { group: '📦 기타 지출', icon: '📦', items: ['쇼핑/온라인구매', '도서/신문', '교육/훈련비', '광고/마케팅', '보험료(일반)', '감가상각비', '기타'] },
]

const ALL_CATEGORIES = CATEGORIES.flatMap(g => g.items)

const CATEGORY_ICONS: Record<string, string> = {
  '렌트/운송수입': '🚛', '지입 관리비/수수료': '📋', '보험금 수령': '🛡️', '매각/처분수입': '🏷️', '이자/잡이익': '📈',
  '투자원금 입금': '💰', '지입 초기비용/보증금': '🔑', '대출 실행(입금)': '🏦',
  '유류비': '⛽', '정비/수리비': '🔧', '차량보험료': '🚗', '자동차세/공과금': '📄', '차량할부/리스료': '💳', '화물공제/적재물보험': '📦',
  '이자비용(대출/투자)': '📊', '원금상환': '💸', '지입 수익배분금(출금)': '🤝', '수수료/카드수수료': '🧾',
  '급여(정규직)': '👨‍💼', '일용직급여': '👤', '성과급지급': '🎯', '용역비(3.3%)': '👷', '4대보험(회사부담)': '🏥',
  '복리후생(식대)': '🍽️', '접대비': '🥂', '여비교통비': '🚕', '임차료/사무실': '🏢', '통신비': '📱', '소모품/사무용품': '🗃️',
  '교육/훈련비': '📚', '광고/마케팅': '📣', '보험료(일반)': '🛡️', '전기/수도/가스': '💡', '경비/보안': '🔒',
  '원천세/부가세': '🏛️', '법인세/지방세': '🏛️', '세금/공과금': '🏛️',
  '쇼핑/온라인구매': '🛒', '도서/신문': '📰', '감가상각비': '📉', '수선/유지비': '🔩', '기타수입': '📥', '기타': '📦', '미분류': '❓',
}

const CATEGORY_COLORS: Record<string, string> = {
  // 회계 기준
  '매출(영업수익)': '#3b82f6', '자본변동': '#6366f1', '영업비용-차량': '#f59e0b', '영업비용-금융': '#8b5cf6',
  '영업비용-인건비': '#10b981', '영업비용-관리': '#ec4899', '세금/공과': '#ef4444', '기타': '#94a3b8',
  // 용도별
  '💰 돈 들어오는 것': '#3b82f6', '🏦 투자/대출 입출금': '#6366f1', '🚛 차량 운영': '#f59e0b',
  '👨‍💼 급여/인건비': '#10b981', '🏢 사무실/운영비': '#8b5cf6', '🍽️ 식비/접대/출장': '#ec4899',
  '💳 수수료/카드': '#a855f7', '🏛️ 세금/공과금': '#ef4444', '📦 기타 지출': '#94a3b8',
}

const TYPE_LABELS: Record<string, string> = { jiip: '지입', invest: '투자', loan: '대출', salary: '급여', freelancer: '프리랜서', insurance: '보험', car: '차량', employee: '직원' }

// ═══ 카테고리 → 연결 대상 타입 매핑 ═══
// 각 세부항목이 어떤 연결 대상 그룹만 보여줄지 결정
// 'all' = 전체 표시, string[] = 해당 그룹명만 표시 (relatedOptions의 group명 기준)
const CATEGORY_RELATED_MAP: Record<string, string[] | 'all'> = {
  // ── 수입(매출) ──
  '렌트/운송수입': ['차량', '지입 차주'],
  '지입 관리비/수수료': ['지입 차주'],
  '보험금 수령': ['보험', '차량'],
  '매각/처분수입': ['차량'],
  '이자/잡이익': [],
  '기타수입': [],
  // ── 투자/대출 입출금 ──
  '투자원금 입금': ['투자자'],
  '지입 초기비용/보증금': ['지입 차주'],
  '대출 실행(입금)': ['대출'],
  '이자비용(대출/투자)': ['대출', '투자자'],
  '원금상환': ['대출'],
  '지입 수익배분금(출금)': ['지입 차주'],
  // ── 차량 운영 ──
  '유류비': ['차량'],
  '정비/수리비': ['차량'],
  '차량보험료': ['차량', '보험'],
  '자동차세/공과금': ['차량'],
  '차량할부/리스료': ['차량', '대출'],
  '화물공제/적재물보험': ['차량', '보험'],
  // ── 급여/인건비 ──
  '급여(정규직)': ['직원'],
  '일용직급여': ['직원'],
  '성과급지급': ['직원'],
  '용역비(3.3%)': ['직원'],
  '4대보험(회사부담)': ['직원'],
  // ── 사무실/운영비 (연결 불필요) ──
  '임차료/사무실': [],
  '통신비': [],
  '소모품/사무용품': [],
  '전기/수도/가스': [],
  '경비/보안': [],
  '수선/유지비': [],
  // ── 식비/접대/출장 (연결 불필요) ──
  '복리후생(식대)': [],
  '접대비': [],
  '여비교통비': [],
  // ── 수수료 ──
  '수수료/카드수수료': ['법인카드'],
  // ── 세금/공과금 (연결 불필요) ──
  '원천세/부가세': [],
  '법인세/지방세': [],
  '세금/공과금': [],
  // ── 보험 ──
  '보험료(일반)': ['보험'],
  // ── 기타 지출 (연결 불필요) ──
  '쇼핑/온라인구매': [],
  '도서/신문': [],
  '교육/훈련비': [],
  '광고/마케팅': [],
  '감가상각비': [],
  '기타': [],
}

const nf = (n: number) => n ? Math.abs(n).toLocaleString() : '0'

// 카드 vs 통장 금액 표시 헬퍼
const isCardItem = (item: any) => {
  const pm = (item.payment_method || item.source_data?.payment_method || '').toLowerCase()
  return pm === '카드' || pm === 'card' || !!item.card_number || !!item.card_id
}
// 카드: 결제=검정 양수, 취소=빨간 음수(-) | 통장: 입금=파란(+), 출금=빨간(-)
// + 외화: currency 뱃지 + 원금 서브텍스트 (런타임 감지 포함)
const getAmountDisplay = (item: any) => {
  const amt = item.amount || item.source_data?.amount || 0
  const absAmt = Math.abs(amt).toLocaleString()
  // 명시적 currency 또는 런타임 감지
  const detected = detectCurrency(item)
  const currency = detected.currency
  const isForeign = currency !== 'KRW'
  const originalAmt = item.original_amount || item.source_data?.original_amount || (isForeign ? detected.foreignAmt : null)

  let text = '', color = '', prefix = '', prefixColor = ''
  if (isCardItem(item)) {
    if (item.is_cancelled) { text = `-${absAmt}`; color = '#dc2626'; prefix = '취소 '; prefixColor = '#dc2626' }
    else { text = absAmt; color = '#111827' }
  } else {
    const isIncome = item.type === 'income' || item.source_data?.type === 'income'
    if (isIncome) { text = `+${absAmt}`; color = '#2563eb' }
    else { text = `-${absAmt}`; color = '#dc2626' }
  }

  const symbols: Record<string, string> = { USD: '$', EUR: '€', JPY: '¥', GBP: '£', CNY: '¥' }
  const sym = symbols[currency] || currency + ' '

  return {
    text, color, prefix, prefixColor,
    isForeign, currency,
    originalText: isForeign && originalAmt ? `${sym}${Math.abs(originalAmt).toLocaleString(undefined, { minimumFractionDigits: currency === 'JPY' ? 0 : 2, maximumFractionDigits: currency === 'JPY' ? 0 : 2 })}` : null,
  }
}

// 외화 감지 (currency 필드 없어도 description/금액으로 추론)
function detectCurrency(item: any): { currency: string; foreignAmt: number } {
  const explicit = item.currency || item.source_data?.currency
  if (explicit && explicit !== 'KRW') {
    const origAmt = item.original_amount || item.source_data?.original_amount || Math.abs(item.amount || item.source_data?.amount || 0)
    return { currency: explicit, foreignAmt: Math.abs(origAmt) }
  }
  // description에서 해외 결제 키워드 감지
  const desc = ((item.description || '') + ' ' + (item.source_data?.description || '') + ' ' + (item.source_data?.memo || '')).toLowerCase()
  const client = ((item.client_name || '') + ' ' + (item.source_data?.client_name || '')).toLowerCase()
  const allText = desc + ' ' + client
  const amt = Math.abs(item.amount || item.source_data?.amount || 0)
  // 해외 결제 패턴: "해외", "MS", "KEY-IN" + 소수점 금액 or 작은 금액
  const isForeignLikely = (allText.includes('해외') || allText.includes('foreign') || allText.includes('overseas'))
  const hasDecimal = amt > 0 && amt < 10000 && amt !== Math.floor(amt) // 소수점 있는 작은 금액
  const isVerySmall = amt > 0 && amt < 500 // 500원 미만이면 외화 가능성 높음
  if (isForeignLikely || hasDecimal || (isVerySmall && isForeignLikely)) {
    let cur = 'USD' // 기본 USD
    if (allText.includes('jpy') || allText.includes('엔화') || allText.includes('일본')) cur = 'JPY'
    else if (allText.includes('eur') || allText.includes('유로')) cur = 'EUR'
    else if (allText.includes('cny') || allText.includes('위안') || allText.includes('중국')) cur = 'CNY'
    if (isForeignLikely) return { currency: cur, foreignAmt: amt }
    if (hasDecimal) return { currency: cur, foreignAmt: amt }
  }
  return { currency: 'KRW', foreignAmt: 0 }
}

// 외화 금액 추적 헬퍼
function addForeignAmount(foreignAmounts: Record<string, number>, item: any) {
  const { currency, foreignAmt } = detectCurrency(item)
  if (currency !== 'KRW' && foreignAmt > 0) {
    if (!foreignAmounts[currency]) foreignAmounts[currency] = 0
    foreignAmounts[currency] += foreignAmt
  }
}

function formatForeignAmounts(foreignAmounts: Record<string, number>): string {
  const entries = Object.entries(foreignAmounts).filter(([, v]) => v > 0)
  if (entries.length === 0) return ''
  const symbols: Record<string, string> = { USD: '$', EUR: '€', JPY: '¥', GBP: '£', CNY: '¥' }
  return entries.map(([cur, amt]) => {
    const sym = symbols[cur] || cur + ' '
    return `${sym}${amt.toLocaleString(undefined, { minimumFractionDigits: cur === 'JPY' ? 0 : 2, maximumFractionDigits: cur === 'JPY' ? 0 : 2 })}`
  }).join(', ')
}

// 카테고리에 따라 연결 대상 옵션을 필터링
function getFilteredRelatedGroups(category: string | null | undefined): string[] | null {
  if (!category || category === '미분류') return null // null = 전체 표시
  // 세부항목 직접 매핑 확인
  const mapped = CATEGORY_RELATED_MAP[category]
  if (mapped === 'all') return null
  if (Array.isArray(mapped)) return mapped
  // 카테고리가 그룹명인 경우 → 그 그룹의 첫 번째 항목으로 매핑 시도
  for (const src of [DISPLAY_CATEGORIES, CATEGORIES]) {
    const grp = src.find(g => g.group === category)
    if (grp && grp.items.length > 0) {
      const firstItem = grp.items[0]
      const firstMapped = CATEGORY_RELATED_MAP[firstItem]
      if (firstMapped === 'all') return null
      if (Array.isArray(firstMapped)) return firstMapped
    }
  }
  return null // 매핑 없으면 전체 표시
}

function getCategoryGroup(cat: string, mode: 'accounting' | 'display' = 'accounting'): string {
  const source = mode === 'display' ? DISPLAY_CATEGORIES : CATEGORIES
  for (const g of source) {
    if (g.items.includes(cat)) return g.group
  }
  return mode === 'display' ? '📦 기타 지출' : '기타'
}

// ═══ 중그룹/하위그룹 분리 헬퍼 ═══
const ALL_ACCOUNTING_GROUPS = new Set(CATEGORIES.map(g => g.group))
const ALL_DISPLAY_GROUPS = new Set(DISPLAY_CATEGORIES.map(g => g.group))

function getCategoryParts(cat: string | null | undefined, mode: 'accounting' | 'display'): { group: string; item: string } {
  if (!cat || cat === '미분류') return { group: '', item: '' }
  const source = mode === 'display' ? DISPLAY_CATEGORIES : CATEGORIES
  const groupSet = mode === 'display' ? ALL_DISPLAY_GROUPS : ALL_ACCOUNTING_GROUPS
  // cat이 현재 모드의 그룹명인 경우
  if (groupSet.has(cat)) return { group: cat, item: '' }
  // cat이 다른 모드의 그룹명인 경우 → 현재 모드 그룹으로 매핑
  const otherSource = mode === 'display' ? CATEGORIES : DISPLAY_CATEGORIES
  const otherGroupSet = mode === 'display' ? ALL_ACCOUNTING_GROUPS : ALL_DISPLAY_GROUPS
  if (otherGroupSet.has(cat)) {
    const otherGrp = otherSource.find(g => g.group === cat)
    if (otherGrp && otherGrp.items.length > 0) {
      for (const sg of source) {
        if (sg.items.includes(otherGrp.items[0])) return { group: sg.group, item: '' }
      }
    }
    return { group: '', item: '' }
  }
  // cat이 세부항목인 경우 → 현재 모드의 그룹 찾기
  for (const g of source) {
    if (g.items.includes(cat)) return { group: g.group, item: cat }
  }
  return { group: '', item: cat }
}

function getItemsForGroup(groupName: string, mode: 'accounting' | 'display'): string[] {
  const source = mode === 'display' ? DISPLAY_CATEGORIES : CATEGORIES
  const grp = source.find(g => g.group === groupName)
  return grp?.items || []
}

const DEFAULT_RULES = [
  { group: '매출(영업수익)', label: '렌트/운송수입', type: 'income', keywords: ['매출', '정산', '운송료', '입금'] },
  { group: '매출(영업수익)', label: '지입 관리비/수수료', type: 'income', keywords: ['지입료', '관리비', '번호판', '수수료'] },
  { group: '자본변동(입금)', label: '투자원금 입금', type: 'income', keywords: ['투자', '증자', '자본'] },
  { group: '자본변동(입금)', label: '지입 초기비용/보증금', type: 'income', keywords: ['보증금', '인수금', '초기'] },
  { group: '자본변동(입금)', label: '대출 실행(입금)', type: 'income', keywords: ['대출입금', '론', '대출실행'] },
  { group: '기타수입', label: '이자/잡이익', type: 'income', keywords: ['이자', '환급', '캐시백'] },
  { group: '지입/운송원가', label: '지입 수익배분금(출금)', type: 'expense', keywords: ['수익배분', '정산금', '배분금', '지입대금'] },
  { group: '차량유지비', label: '유류비', type: 'expense', keywords: ['주유', '가스', '엘피지', 'GS', 'SK', 'S-OIL'] },
  { group: '차량유지비', label: '정비/수리비', type: 'expense', keywords: ['정비', '모터스', '타이어', '공업사', '수리', '부품'] },
  { group: '차량유지비', label: '차량보험료', type: 'expense', keywords: ['손해', '화재', 'KB', '현대', 'DB', '보험'] },
  { group: '차량유지비', label: '자동차세/공과금', type: 'expense', keywords: ['자동차세', '과태료', '범칙금', '검사', '도로공사', '하이패스'] },
  { group: '금융비용', label: '차량할부/리스료', type: 'expense', keywords: ['캐피탈', '파이낸셜', '할부', '리스'] },
  { group: '금융비용', label: '이자비용(대출/투자)', type: 'expense', keywords: ['이자'] },
  { group: '금융비용', label: '원금상환', type: 'expense', keywords: ['원금'] },
  { group: '인건비', label: '급여(정규직)', type: 'expense', keywords: ['급여', '월급', '상여'] },
  { group: '인건비', label: '성과급지급', type: 'expense', keywords: ['성과급', '인센티브', '보너스', '상여금'] },
  { group: '인건비', label: '용역비(3.3%)', type: 'expense', keywords: ['용역', '프리', '3.3', '탁송', '대리'] },
  { group: '일반관리', label: '복리후생(식대)', type: 'expense', keywords: ['식당', '카페', '커피', '마트', '식사', '음식', '편의점'] },
  { group: '일반관리', label: '임차료/사무실', type: 'expense', keywords: ['월세', '관리비', '주차'] },
  { group: '일반관리', label: '통신/소모품', type: 'expense', keywords: ['KT', 'SKT', 'LG', '인터넷', '다이소', '문구', '쿠팡', '네이버'] },
]

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// UploadContent Component (Merged logic)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

function UploadContent() {
  const router = useRouter()
  const { company, role, adminSelectedCompanyId } = useApp()

  // ── Upload Context ──
  const {
    results,
    status,
    progress,
    currentFileIndex,
    totalFiles,
    currentFileName,
    logs,
    addFiles,
    startProcessing,
    updateTransaction,
    deleteTransaction,
    removeResults,
    clearResults,
    setCompanyId,
    cardRegistrationResults,
    loadFromQueue,
  } = useUpload()

  // ── Upload UI State ──
  const [isDragging, setIsDragging] = useState(false)
  const [cars, setCars] = useState<any[]>([])
  const [investors, setInvestors] = useState<any[]>([])
  const [jiips, setJiips] = useState<any[]>([])
  const [corpCards, setCorpCards] = useState<any[]>([])
  const [loans, setLoans] = useState<any[]>([])
  const [insurances, setInsurances] = useState<any[]>([])
  const [bulkMode, setBulkMode] = useState(true)

  // ── Review Data State ──
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ pending: 0, confirmed: 0 })
  const [aiClassifying, setAiClassifying] = useState(false)
  const [aiResult, setAiResult] = useState<{ updated: number; total: number } | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [groupItemLimits, setGroupItemLimits] = useState<Record<string, number>>({})
  const [duplicateInfo, setDuplicateInfo] = useState<{ count: number; checking: boolean }>({ count: 0, checking: false })
  // 카테고리 뷰 모드: 회계 기준 vs 용도별
  const [categoryMode, setCategoryMode] = useState<'accounting' | 'display'>('display')

  // ── Related Data (Review) ──
  const [reviewJiips, setReviewJiips] = useState<any[]>([])
  const [reviewInvestors, setReviewInvestors] = useState<any[]>([])
  const [freelancers, setFreelancers] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])

  // ── Tab State ── (2탭 구조: 분류 관리 + 확정완료)
  const [activeTab, setActiveTab] = useState<'classify' | 'confirmed'>('classify')
  // classify 탭의 소스 필터 (칩): 전체/카드/통장/미분류
  const [sourceFilter, setSourceFilter] = useState<'all' | 'card' | 'bank' | 'unclassified'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [groupBy, setGroupBy] = useState<'category' | 'card' | 'bank' | 'vehicle' | 'user' | 'link' | 'date' | 'client' | 'income_expense'>('category')
  const [linkPopoverId, setLinkPopoverId] = useState<string | null>(null)
  const [linkPopoverTab, setLinkPopoverTab] = useState<'car' | 'jiip' | 'invest' | 'loan'>('car')
  const [linkPopoverSearch, setLinkPopoverSearch] = useState('')
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkModalTab, setLinkModalTab] = useState<'car' | 'jiip' | 'invest' | 'loan' | 'insurance'>('car')
  const [linkModalSelectedId, setLinkModalSelectedId] = useState<string | null>(null)

  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  // ── Initialize ──
  const hasLoadedFromQueue = useRef(false)

  useEffect(() => {
    fetchBasicData()
    fetchStats()  // 항상 통계 로드
    if (effectiveCompanyId) {
      setCompanyId(effectiveCompanyId)
      // 이미 저장된 confirmed queue 항목 정리 (탭 카운트 정확도 보장)
      cleanupStaleQueue()
      // 결과가 비어있고 처리 중이 아닐 때 → classification_queue에서 복원
      if (results.length === 0 && status !== 'processing' && !hasLoadedFromQueue.current) {
        hasLoadedFromQueue.current = true
        const timer = setTimeout(() => {
          loadFromQueue().then(count => {
            if (count > 0) {
              console.log(`[Upload] classification_queue에서 ${count}건 복원됨`)
              fetchStats()
            }
          })
        }, 300)
        return () => clearTimeout(timer)
      }
    }
  }, [company, effectiveCompanyId])

  useEffect(() => {
    if (activeTab === 'classify' || activeTab === 'confirmed') {
      fetchReviewItems()
      fetchReviewRelated()
    }
  }, [activeTab])

  // 탭 포커스 시 자동 새로고침
  useEffect(() => {
    const onFocus = () => {
      fetchStats()
      if (activeTab === 'classify' || activeTab === 'confirmed') fetchReviewItems()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [effectiveCompanyId, activeTab])

  // 팝오버 외부 클릭 시 닫기
  useEffect(() => {
    if (!linkPopoverId) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-link-popover]')) setLinkPopoverId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [linkPopoverId])

  const fetchBasicData = async () => {
    if (!effectiveCompanyId) return
    try {
      const [c, i, j, cc, lo, ins] = await Promise.all([
        supabase.from('cars').select('*').eq('company_id', effectiveCompanyId),
        supabase.from('general_investments').select('*').eq('company_id', effectiveCompanyId),
        supabase.from('jiip_contracts').select('*').eq('company_id', effectiveCompanyId),
        supabase.from('corporate_cards').select('*').eq('company_id', effectiveCompanyId),
        supabase.from('loans').select('*').eq('company_id', effectiveCompanyId),
        supabase.from('insurance_contracts').select('*').eq('company_id', effectiveCompanyId),
      ])
      setCars(c.data || [])
      setInvestors(i.data || [])
      setJiips(j.data || [])
      setCorpCards(cc.data || [])
      setLoans(lo.data || [])
      setInsurances(ins.data || [])
    } catch (err) {
      console.error('[fetchBasicData] error:', err)
    }
  }

  const fetchStats = useCallback(async () => {
    if (!effectiveCompanyId) return
    try {
      const [pRes, cRes] = await Promise.all([
        fetch(`/api/finance/classify?company_id=${effectiveCompanyId}&status=pending&limit=1`),
        fetch(`/api/finance/classify?company_id=${effectiveCompanyId}&status=confirmed&limit=1`),
      ])
      const pData = pRes.ok ? await pRes.json() : { total: 0 }
      const cData = cRes.ok ? await cRes.json() : { total: 0 }
      setStats({ pending: pData.total || 0, confirmed: cData.total || 0 })
    } catch (e) {
      console.error(e)
    }
  }, [effectiveCompanyId])

  // ── 초기 로드: 이미 저장된 confirmed queue 항목 자동 정리 ──
  // API를 사용하여 source_data를 정규화된 형태로 가져옴 (alternatives 내부 포함)
  const cleanupStaleQueue = useCallback(async () => {
    if (!effectiveCompanyId) return
    try {
      // API를 통해 confirmed 항목 조회 (source_data 정규화 처리됨)
      const res = await fetch(`/api/finance/classify?company_id=${effectiveCompanyId}&status=confirmed&limit=500`)
      if (!res.ok) return
      const json = await res.json()
      const confirmedItems = json.items || []
      if (confirmedItems.length === 0) return

      const dates = confirmedItems.map((q: any) => q.source_data?.transaction_date).filter(Boolean)
      if (dates.length === 0) return

      const sortedDates = [...dates].sort()
      const { data: existingTxs } = await supabase
        .from('transactions')
        .select('transaction_date, client_name, amount')
        .eq('company_id', effectiveCompanyId)
        .gte('transaction_date', sortedDates[0])
        .lte('transaction_date', sortedDates[sortedDates.length - 1])

      if (!existingTxs || existingTxs.length === 0) return

      const existingCounts = new Map<string, number>()
      for (const e of existingTxs) {
        const key = `${e.transaction_date}|${e.client_name}|${e.amount}`
        existingCounts.set(key, (existingCounts.get(key) || 0) + 1)
      }

      const usedCounts = new Map<string, number>()
      const staleIds: string[] = []

      for (const q of confirmedItems) {
        const sd = q.source_data || {}
        const key = `${sd.transaction_date}|${sd.client_name}|${Math.abs(Number(sd.amount || 0))}`
        const existCount = existingCounts.get(key) || 0
        const usedCount = usedCounts.get(key) || 0
        if (usedCount < existCount) {
          usedCounts.set(key, usedCount + 1)
          staleIds.push(q.id)
        }
      }

      if (staleIds.length > 0) {
        console.log(`[cleanupStaleQueue] 이미 저장된 confirmed ${staleIds.length}건 자동 삭제`)
        await fetch('/api/finance/classify', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_id: effectiveCompanyId, ids: staleIds })
        })
        await fetchStats()
      }
    } catch (e) {
      console.error('[cleanupStaleQueue] 오류:', e)
    }
  }, [effectiveCompanyId, fetchStats])

  const fetchReviewItems = useCallback(async () => {
    if (!effectiveCompanyId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      // classify 탭 = pending, confirmed 탭 = confirmed
      const status = activeTab === 'confirmed' ? 'confirmed' : 'pending'
      const res = await fetch(`/api/finance/classify?company_id=${effectiveCompanyId}&status=${status}&limit=2000`)
      if (res.ok) {
        const data = await res.json()
        let loadedItems = data.items || []

        // ── 확정완료 탭: 이미 transactions에 저장된 항목 자동 정리 ──
        if (activeTab === 'confirmed' && loadedItems.length > 0) {
          // 날짜 범위 추출
          const dates = loadedItems.map((i: any) => i.source_data?.transaction_date || i.transaction_date).filter(Boolean)
          if (dates.length > 0) {
            const sortedDates = [...dates].sort()
            const { data: existingTxs } = await supabase
              .from('transactions')
              .select('transaction_date, client_name, amount')
              .eq('company_id', effectiveCompanyId)
              .gte('transaction_date', sortedDates[0])
              .lte('transaction_date', sortedDates[sortedDates.length - 1])

            if (existingTxs && existingTxs.length > 0) {
              // 기존 거래 개수 카운트
              const existingCounts = new Map<string, number>()
              for (const e of existingTxs) {
                const key = `${e.transaction_date}|${e.client_name}|${e.amount}`
                existingCounts.set(key, (existingCounts.get(key) || 0) + 1)
              }

              // 이미 저장된 queue 항목 식별
              const usedCounts = new Map<string, number>()
              const staleIds: string[] = []
              const cleanItems: any[] = []

              for (const item of loadedItems) {
                const sd = item.source_data || {}
                const key = `${sd.transaction_date || item.transaction_date}|${sd.client_name || item.client_name}|${Math.abs(Number(sd.amount || item.amount || 0))}`
                const existCount = existingCounts.get(key) || 0
                const usedCount = usedCounts.get(key) || 0

                if (usedCount < existCount) {
                  // 이미 transactions에 존재 → 정리 대상
                  usedCounts.set(key, usedCount + 1)
                  if (item.id) staleIds.push(item.id)
                } else {
                  cleanItems.push(item)
                }
              }

              // 백그라운드에서 stale queue 항목 삭제 (API 사용)
              if (staleIds.length > 0) {
                console.log(`[fetchReviewItems] 확정완료 탭: 이미 저장된 ${staleIds.length}건 자동 정리`)
                try {
                  await fetch('/api/finance/classify', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ company_id: effectiveCompanyId, ids: staleIds })
                  })
                } catch (delErr) {
                  console.error('[auto-cleanup] queue 삭제 오류:', delErr)
                }
              }

              loadedItems = cleanItems
            }
          }
        }

        setItems(loadedItems)
        setTotal(loadedItems.length)
      }
      // stale 항목 삭제 후 stats 다시 가져오기 (탭 카운트 정확히 반영)
      await fetchStats()
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [effectiveCompanyId, activeTab, fetchStats])

  const fetchReviewRelated = useCallback(async () => {
    if (!effectiveCompanyId) return
    const [j, i, f, e] = await Promise.all([
      supabase.from('jiip_contracts').select('id, investor_name').eq('company_id', effectiveCompanyId),
      supabase.from('general_investments').select('id, investor_name').eq('company_id', effectiveCompanyId),
      supabase.from('freelancers').select('id, name').eq('company_id', effectiveCompanyId),
      supabase.from('profiles').select('id, employee_name, email, phone, position, department').eq('company_id', effectiveCompanyId),
    ])
    setReviewJiips(j.data || [])
    setReviewInvestors(i.data || [])
    setFreelancers(f.data || [])
    setEmployees(e.data || [])
  }, [effectiveCompanyId])

  // 법인카드 번호 매칭 헬퍼 (현재 + 과거 카드번호 모두 체크)
  const findCardByNumber = useCallback((cardNumber: string | null | undefined) => {
    if (!cardNumber) return null
    const digits = (cardNumber || '').replace(/\D/g, '')
    if (digits.length < 3) return null
    const last4 = digits.slice(-4)

    const getAllDigits = (c: any): string[] => {
      const nums = [(c.card_number || '')]
      const prev = c.previous_card_numbers || []
      for (const p of prev) { if (p) nums.push(p) }
      return nums.map((n: string) => n.replace(/\D/g, '')).filter((n: string) => n.length > 0)
    }

    if (last4.length === 4) {
      const match = corpCards.find(c => getAllDigits(c).some(d => d.endsWith(last4)))
      if (match) return match
    }
    if (digits.length >= 4) {
      const first4 = digits.slice(0, 4)
      const match = corpCards.find(c => getAllDigits(c).some(d => d.startsWith(first4)))
      if (match) return match
    }
    const match = corpCards.find(c => {
      const allNums = [(c.card_number || ''), ...(c.previous_card_numbers || [])].map((n: string) => (n || '').replace(/[\s-]/g, '')).filter(Boolean)
      return allNums.some((cNum: string) => cNum.includes(cardNumber!.replace(/[\s-]/g, '')) || cardNumber!.replace(/[\s-]/g, '').includes(cNum.slice(-4)))
    })
    return match || null
  }, [corpCards])

  // 법인카드→사용자 이름 매핑 헬퍼 (assigned_employee_id → 직원명 우선)
  const getCardUserName = useCallback((cardId: string | null | undefined) => {
    if (!cardId) return null
    const card = corpCards.find(c => c.id === cardId)
    if (!card) return null
    // assigned_employee_id가 있으면 직원명으로 표시
    if (card.assigned_employee_id) {
      const emp = employees.find((e: any) => e.id === card.assigned_employee_id)
      if (emp?.employee_name || emp?.name) return emp.employee_name || emp.name
    }
    return card.holder_name || card.card_alias || null
  }, [corpCards, employees])

  // 카드 객체에서 표시할 사용자 이름 (assigned_employee 우선)
  const getCardDisplayName = useCallback((card: any) => {
    if (!card) return '공용'
    if (card.assigned_employee_id) {
      const emp = employees.find((e: any) => e.id === card.assigned_employee_id)
      if (emp?.employee_name || emp?.name) return emp.employee_name || emp.name
    }
    return card.holder_name || card.card_alias || '공용'
  }, [employees])

  // ── 소스 필터 적용 (칩: 전체/카드/통장/미분류) ──
  const sourceFilteredItems = useMemo(() => {
    let filtered = items
    if (sourceFilter === 'card') filtered = items.filter(i => isCardItem(i))
    else if (sourceFilter === 'bank') filtered = items.filter(i => !isCardItem(i))
    else if (sourceFilter === 'unclassified') filtered = items.filter(i => !i.ai_category || i.ai_category === '미분류' || i.ai_category === '기타')
    // 검색어 필터
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase()
      filtered = filtered.filter(i => {
        const sd = i.source_data || {}
        const haystack = [
          sd.client_name, sd.description, sd.memo, sd.card_number,
          i.ai_category, i.matched_car_number, i.matched_employee_name,
          i.linked_name, sd.bank_name,
        ].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(q)
      })
    }
    return filtered
  }, [items, sourceFilter, searchTerm])

  const groupedItems = useMemo(() => {
    const groups: Record<string, { items: any[]; totalAmount: number; type: string; subGroups?: Record<string, { items: any[]; totalAmount: number }> }> = {}
    // 용도별 모드 매핑
    const catMap: Record<string, string> = {}
    if (categoryMode === 'display') {
      for (const dg of DISPLAY_CATEGORIES) {
        for (const it of dg.items) catMap[it] = dg.group
      }
    }
    for (const item of sourceFilteredItems) {
      let key = ''
      if (groupBy === 'category') {
        const rawCat = item.ai_category || '미분류'
        key = categoryMode === 'display' ? (catMap[rawCat] || '📦 기타 지출') : rawCat
      } else if (groupBy === 'card') {
        const sd = item.source_data || {}
        const cardNum = sd.card_number || ''
        const last4 = cardNum.replace(/\D/g, '').slice(-4)
        if (last4 && sd.payment_method !== '통장') {
          const matched = findCardByNumber(cardNum)
          key = matched ? `${matched.card_company} ****${last4} (${getCardDisplayName(matched)})` : `카드 ****${last4}`
        } else {
          key = sd.payment_method === '통장' ? '📋 통장 거래' : '💳 카드번호 없음'
        }
      } else if (groupBy === 'bank') {
        const sd = item.source_data || {}
        if (sd.payment_method === '카드' || sd.payment_method === 'Card') {
          key = '💳 카드 거래'
        } else {
          const desc = sd.description || sd.client_name || ''
          const bankMatch = desc.match(/(국민|신한|하나|우리|농협|기업|SC|IBK|카카오|토스|케이|수협|대구|부산|광주|전북|제주|산업)/)
          key = bankMatch ? `🏦 ${bankMatch[1]}은행` : '🏦 기타 통장'
        }
      } else if (groupBy === 'vehicle') {
        if (item.matched_car_number) {
          key = `🚙 ${item.matched_car_number}`
        } else {
          const sd = item.source_data || {}
          const desc = `${sd.client_name || ''} ${sd.description || ''}`
          const carMatch = cars.find((c: any) => c.number && desc.includes(c.number))
          key = carMatch ? `🚙 ${carMatch.number}` : '📋 차량 미매칭'
        }
      } else if (groupBy === 'user') {
        const sd = item.source_data || {}
        if (item.matched_employee_name) {
          key = `👤 ${item.matched_employee_name}`
        } else if (sd.card_number) {
          const matched = findCardByNumber(sd.card_number)
          key = matched ? `👤 ${getCardDisplayName(matched)}` : '👤 미확인'
        } else {
          key = '👤 미확인'
        }
      } else if (groupBy === 'link') {
        // 연결별: 지입/투자/대출/급여/차량/보험 등 연결 유형별
        if (item.linked_type && item.linked_id) {
          const typeLabel = TYPE_LABELS[item.linked_type] || item.linked_type
          const name = item.linked_name || item.linked_id
          key = `🔗 ${typeLabel}: ${name}`
        } else {
          key = '📋 미연결'
        }
      } else if (groupBy === 'date') {
        // 날짜별: 거래일 기준으로 그룹핑
        const sd = item.source_data || {}
        const dateStr = sd.date || sd.transaction_date || item.created_at || ''
        if (dateStr) {
          const d = new Date(dateStr)
          if (!isNaN(d.getTime())) {
            key = `📅 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          } else {
            key = '📅 날짜 없음'
          }
        } else {
          key = '📅 날짜 없음'
        }
      } else if (groupBy === 'client') {
        // 거래처별: client_name 기준
        const sd = item.source_data || {}
        const client = (sd.client_name || sd.description || '').trim()
        key = client ? `🏢 ${client}` : '🏢 거래처 없음'
      } else if (groupBy === 'income_expense') {
        // 입출금별: 입금/출금 분리
        const sd = item.source_data || {}
        const isIncome = item.type === 'income' || sd.type === 'income'
        key = isIncome ? '💰 입금' : '💸 출금'
      }
      if (!key) key = '미분류'
      if (!groups[key]) groups[key] = { items: [], totalAmount: 0, type: 'expense', foreignAmounts: {} }
      groups[key].items.push(item)
      groups[key].totalAmount += Math.abs(item.source_data?.amount || 0)
      if (item.source_data?.type === 'income') groups[key].type = 'income'
      const _cur = item.source_data?.currency || 'KRW'
      if (_cur !== 'KRW') {
        const _origAmt = item.source_data?.original_amount || 0
        if (_origAmt) { if (!(groups[key] as any).foreignAmounts[_cur]) (groups[key] as any).foreignAmounts[_cur] = 0; (groups[key] as any).foreignAmounts[_cur] += Math.abs(_origAmt) }
      }
      // 서브그룹 추적: 카테고리별이 아닌 경우 양쪽 모드 모두, 카테고리별+용도별일 때도
      if (groupBy !== 'category' || categoryMode === 'display') {
        const rawCat = item.ai_category || '미분류'
        let subKey: string
        if (groupBy === 'category') {
          // 카테고리별+용도별: 원본 카테고리로 서브그룹
          subKey = rawCat
        } else if (categoryMode === 'display') {
          // 기타 그룹+용도별: 용도별 그룹명으로 서브그룹
          subKey = catMap[rawCat] || '📦 기타 지출'
        } else {
          // 기타 그룹+회계기준: 회계 그룹명으로 서브그룹
          subKey = getCategoryGroup(rawCat, 'accounting')
        }
        if (!groups[key].subGroups) groups[key].subGroups = {}
        if (!groups[key].subGroups![subKey]) groups[key].subGroups![subKey] = { items: [], totalAmount: 0 }
        groups[key].subGroups![subKey].items.push(item)
        groups[key].subGroups![subKey].totalAmount += Math.abs(item.source_data?.amount || 0)
      }
    }
    // 용도별 모드: DISPLAY_CATEGORIES 순서 정렬
    if (categoryMode === 'display' && groupBy === 'category') {
      const order = DISPLAY_CATEGORIES.map(d => d.group)
      return Object.entries(groups).sort((a, b) => {
        const ai = order.indexOf(a[0]); const bi = order.indexOf(b[0])
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    }
    // 날짜별: 최신 날짜 우선 정렬
    if (groupBy === 'date') {
      return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
    }
    // 입출금별: 입금 먼저
    if (groupBy === 'income_expense') {
      return Object.entries(groups).sort((a, b) => {
        if (a[0].includes('입금')) return -1
        if (b[0].includes('입금')) return 1
        return 0
      })
    }
    // 거래처별: 거래처 없음은 맨 뒤
    if (groupBy === 'client') {
      return Object.entries(groups).sort((a, b) => {
        if (a[0].includes('거래처 없음')) return 1
        if (b[0].includes('거래처 없음')) return -1
        return b[1].items.length - a[1].items.length
      })
    }
    return Object.entries(groups).sort((a, b) => b[1].items.length - a[1].items.length)
  }, [sourceFilteredItems, groupBy, corpCards, cars, getCardDisplayName, categoryMode])

  // ── 리뷰 탭 미분류 통계 ──
  const reviewUnclassifiedCount = useMemo(() => {
    return items.filter(i => !i.ai_category || i.ai_category === '미분류' || i.ai_category === '기타').length
  }, [items])

  // ── B1 하단 요약바 데이터 ──
  const summaryTotals = useMemo(() => {
    const filtered = sourceFilteredItems
    let income = 0, expense = 0
    const foreignAmounts: Record<string, number> = {}
    for (const item of filtered) {
      const amt = Math.abs(item.source_data?.amount || item.amount || 0)
      if (item.type === 'income' || item.source_data?.type === 'income') {
        income += amt
      } else {
        expense += amt
      }
      const cur = item.source_data?.currency || (item as any).currency || 'KRW'
      if (cur !== 'KRW') {
        const origAmt = item.source_data?.original_amount || (item as any).original_amount || 0
        if (origAmt) { if (!foreignAmounts[cur]) foreignAmounts[cur] = 0; foreignAmounts[cur] += Math.abs(origAmt) }
      }
    }
    return { count: filtered.length, income, expense, net: income - expense, foreignText: formatForeignAmounts(foreignAmounts) }
  }, [sourceFilteredItems])

  // ── B2 선택 항목 합계 ──
  const selectionTotals = useMemo(() => {
    if (selectedIds.size === 0) return { count: 0, total: 0, foreignText: '' }
    let total = 0
    const foreignAmounts: Record<string, number> = {}
    for (const item of items) {
      if (selectedIds.has(item.id)) {
        total += Math.abs(item.source_data?.amount || item.amount || 0)
        const cur = item.source_data?.currency || (item as any).currency || 'KRW'
        if (cur !== 'KRW') {
          const origAmt = item.source_data?.original_amount || (item as any).original_amount || 0
          if (origAmt) { if (!foreignAmounts[cur]) foreignAmounts[cur] = 0; foreignAmounts[cur] += Math.abs(origAmt) }
        }
      }
    }
    return { count: selectedIds.size, total, foreignText: formatForeignAmounts(foreignAmounts) }
  }, [selectedIds, items])

  // ── 일괄 삭제 핸들러 ──
  const handleDeleteAll = async () => {
    if (!effectiveCompanyId) return
    const statusLabel = activeTab === 'confirmed' ? '확정 완료' : '분류 대기'
    if (!confirm(`${statusLabel} 항목 ${items.length}건을 모두 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return

    setDeleting(true)
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: effectiveCompanyId, status: activeTab === 'confirmed' ? 'confirmed' : 'pending' })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      alert(`${data.deleted}건 삭제 완료`)
      setItems([])
      setSelectedIds(new Set())
      fetchStats()
    } catch (e: any) {
      alert('삭제 실패: ' + e.message)
    }
    setDeleting(false)
  }

  const handleDeleteSelected = async () => {
    if (!effectiveCompanyId || selectedIds.size === 0) return
    if (!confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) return

    setDeleting(true)
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: effectiveCompanyId, ids: Array.from(selectedIds) })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      alert(`${data.deleted}건 삭제 완료`)
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)))
      setSelectedIds(new Set())
      fetchStats()
    } catch (e: any) {
      alert('삭제 실패: ' + e.message)
    }
    setDeleting(false)
  }

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(items.map(i => i.id)))
    else setSelectedIds(new Set())
  }

  const toggleSelectGroup = (groupItems: any[]) => {
    const groupItemIds = groupItems.map(i => i.id)
    const allSelected = groupItemIds.length > 0 && groupItemIds.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) groupItemIds.forEach(id => next.delete(id))
      else groupItemIds.forEach(id => next.add(id))
      return next
    })
  }

  // ── 연결 처리 (단건/일괄) ──
  const handleLinkItem = async (itemId: string, relatedType: string, relatedId: string) => {
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: itemId,
          final_related_type: relatedType,
          final_related_id: relatedId,
          save_as_rule: false,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, ai_related_type: relatedType, ai_related_id: relatedId } : i))
      }
    } catch (e) { console.error(e) }
  }

  const handleBulkLink = async (relatedType: string, relatedId: string) => {
    const targetItems = items.filter(i => selectedIds.has(i.id))
    for (const item of targetItems) {
      await handleLinkItem(item.id, relatedType, relatedId)
    }
    setSelectedIds(new Set())
    setLinkModalOpen(false)
    setLinkModalSelectedId(null)
  }

  // 연결 대상 표시 (리뷰탭용)
  const getReviewLinkDisplay = useCallback((item: any) => {
    const type = item.ai_related_type
    const id = item.ai_related_id
    if (!type || !id) return null
    if (type === 'car') {
      const c = cars.find(cc => cc.id === id)
      return c ? { icon: '🚗', label: c.number || '차량', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' } : null
    }
    if (type === 'jiip') {
      const j = (jiips || []).find((jj: any) => jj.id === id)
      return j ? { icon: '🚛', label: j.investor_name || '지입', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' } : null
    }
    if (type === 'invest') {
      const inv = (investors || []).find((ii: any) => ii.id === id)
      return inv ? { icon: '💰', label: inv.investor_name || '투자', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' } : null
    }
    if (type === 'loan') {
      const l = (loans || []).find((ll: any) => ll.id === id)
      return l ? { icon: '🏦', label: l.finance_name || '대출', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' } : null
    }
    if (type === 'insurance') {
      const ins = (insurances || []).find((ii: any) => ii.id === id)
      return ins ? { icon: '🛡️', label: ins.company || '보험', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' } : null
    }
    return { icon: '🔗', label: type, color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' }
  }, [cars, jiips, investors, loans, insurances])

  // 연결 팝오버용 옵션 (검색 포함)
  const linkOptions = useMemo(() => {
    const s = linkPopoverSearch.toLowerCase()
    return {
      car: cars.filter(c => !s || (c.number || '').toLowerCase().includes(s) || (c.brand || '').toLowerCase().includes(s) || (c.model || '').toLowerCase().includes(s)),
      jiip: (jiips || []).filter((j: any) => !s || (j.investor_name || '').toLowerCase().includes(s) || (j.vehicle_number || j.car_number || '').toLowerCase().includes(s)),
      invest: (investors || []).filter((i: any) => !s || (i.investor_name || '').toLowerCase().includes(s)),
      loan: (loans || []).filter((l: any) => !s || (l.finance_name || '').toLowerCase().includes(s)),
      insurance: (insurances || []).filter((i: any) => !s || (i.company || '').toLowerCase().includes(s)),
    }
  }, [cars, jiips, investors, loans, insurances, linkPopoverSearch])

  // ── Drag & Drop ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files))
      startProcessing()
    }
    e.target.value = ''
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files))
      startProcessing()
    }
  }

  // ── Upload Handlers ──
  const handleUpdateItem = (id: number, field: string, val: any, item: any) => {
    updateTransaction(id, field, val)
    if (bulkMode && field !== 'amount' && field !== 'transaction_date' && field !== 'description') {
      const sameClientItems = results.filter(r => r.client_name === item.client_name && r.id !== id)
      sameClientItems.forEach(r => updateTransaction(r.id, field, val))
    }
  }

  const handleBulkSave = async () => {
    // 확정된 항목만 저장
    const confirmedResults = results.filter(r => uploadConfirmedIds.has(r.id))
    if (confirmedResults.length === 0) return alert('확정된 항목이 없습니다.\n먼저 항목을 확정(✅)한 후 전체 저장해주세요.')
    if (!effectiveCompanyId) return alert('회사를 먼저 선택해주세요. 상단 메뉴에서 회사를 선택 후 저장하세요.')

    // ── 개수 기반 중복 체크 (같은 날짜+거래처+금액이 여러 건일 수 있으므로 Set이 아닌 개수로 비교) ──
    const dates = confirmedResults.map(r => r.transaction_date).filter(Boolean)
    const minDate = dates.length > 0 ? dates.sort()[0] : null
    const maxDate = dates.length > 0 ? dates.sort().reverse()[0] : null

    let duplicateCount = 0
    let uniqueResults = [...confirmedResults]

    if (minDate && maxDate) {
      const { data: existing } = await supabase
        .from('transactions')
        .select('transaction_date, client_name, amount, payment_method, description')
        .eq('company_id', effectiveCompanyId)
        .gte('transaction_date', minDate)
        .lte('transaction_date', maxDate)

      if (existing && existing.length > 0) {
        // 기존 거래의 키별 개수 카운트 (같은 사람이 같은 날 같은 금액으로 여러 건 가능)
        const existingCounts = new Map<string, number>()
        for (const e of existing) {
          const key = `${e.transaction_date}|${e.client_name}|${e.amount}|${e.payment_method}`
          existingCounts.set(key, (existingCounts.get(key) || 0) + 1)
        }

        // 확정 항목 중 기존 개수를 초과하는 것만 통과 (중복 아닌 것)
        const usedCounts = new Map<string, number>()
        const filtered: typeof confirmedResults = []
        for (const r of confirmedResults) {
          const key = `${r.transaction_date}|${r.client_name}|${r.amount}|${r.payment_method}`
          const existCount = existingCounts.get(key) || 0
          const usedCount = usedCounts.get(key) || 0
          if (usedCount < existCount) {
            // 이 항목은 기존에 이미 있음 → 중복
            usedCounts.set(key, usedCount + 1)
            duplicateCount++
          } else {
            // 기존 개수를 초과 → 새 거래
            filtered.push(r)
          }
        }
        uniqueResults = filtered
      }
    }

    // ── 중복 항목 자동 정리 (이미 저장된 항목은 queue에서 삭제 + 목록에서 제거) ──
    if (duplicateCount > 0) {
      const duplicateItems = confirmedResults.filter(r => !uniqueResults.includes(r))
      // classification_queue에서 중복 항목 삭제
      const dupQueueIds = duplicateItems.map(r => (r as any)._queue_id).filter(Boolean)
      if (dupQueueIds.length > 0) {
        try {
          await fetch('/api/finance/classify', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company_id: effectiveCompanyId, ids: dupQueueIds })
          })
          console.log(`[handleBulkSave] 중복 항목 ${dupQueueIds.length}건 classification_queue에서 삭제`)
        } catch (e) {
          console.error('[handleBulkSave] 중복 항목 queue 삭제 오류:', e)
        }
      }
      // 프론트엔드 목록에서 중복 항목 제거
      const dupIds = new Set(duplicateItems.map(r => r.id))
      removeResults(dupIds)
      setUploadConfirmedIds(prev => {
        const next = new Set(prev)
        dupIds.forEach(id => next.delete(id))
        return next
      })

      if (uniqueResults.length === 0) {
        alert(`✅ ${duplicateCount}건은 이미 저장된 거래입니다.\n목록에서 정리 완료했습니다.`)
        fetchStats()
        return
      }
      // 중복 아닌 항목이 있으면 계속 진행
      alert(`ℹ️ ${duplicateCount}건은 이미 저장된 거래 → 목록에서 정리됨\n나머지 ${uniqueResults.length}건을 저장합니다.`)
    }

    if (!confirm(`확정된 ${uniqueResults.length}건을 저장하시겠습니까?`)) return

    const scheduleLinks: { schedule_id: string; tx_index: number; amount: number }[] = []
    const payload = uniqueResults.map((item, idx) => {
      if (item.matched_schedule_id) {
        scheduleLinks.push({ schedule_id: item.matched_schedule_id, tx_index: idx, amount: item.amount })
      }
      return {
        company_id: effectiveCompanyId,
        transaction_date: item.transaction_date,
        client_name: item.client_name,
        amount: item.amount,
        type: item.type,
        payment_method: item.payment_method,
        description: item.description || '',
        memo: item.memo || null,
        status: item.status || 'pending',
        category: item.category || item.ai_category || '미분류',
        related_type: item.related_type || item.ai_related_type || null,
        related_id: item.related_id || item.ai_related_id || null,
        card_id: item.card_id || null,
        is_cancel: item.is_cancel || false,
        classification_source: item.classification_source || null,
        confidence: item.confidence || 0,
        employee_id: (() => {
          let empId = (item as any).matched_employee_id || null
          if (!empId && item.card_id) {
            const card = corpCards.find(c => c.id === item.card_id)
            if (card?.assigned_employee_id) empId = card.assigned_employee_id
          }
          return empId
        })(),
        employee_name: (() => {
          let empName = (item as any).matched_employee_name || null
          if (!empName && item.card_id) {
            const card = corpCards.find(c => c.id === item.card_id)
            if (card?.assigned_employee_id) {
              const emp = employees.find((e: any) => e.id === card.assigned_employee_id)
              empName = emp?.name || emp?.employee_name || null
            }
          }
          return empName
        })(),
        currency: (item as any).currency || 'KRW',
        original_amount: (item as any).original_amount || null,
      }
    })

    if (payload.length === 0) {
      return alert('저장할 내역이 없습니다.')
    }

    const { data: inserted, error } = await supabase.from('transactions').insert(payload).select('id')

    if (error) {
      alert('저장 실패: ' + error.message)
    } else {
      let linkedCount = 0
      if (inserted && scheduleLinks.length > 0) {
        for (const link of scheduleLinks) {
          const txId = inserted[link.tx_index]?.id
          if (txId) {
            const { error: schedErr } = await supabase.from('expected_payment_schedules')
              .update({ matched_transaction_id: txId, status: 'completed', actual_amount: link.amount })
              .eq('id', link.schedule_id)
            if (!schedErr) linkedCount++
          }
        }
      }

      // classification_queue 정리 — API를 통해 삭제 (RLS 우회, service_role_key 사용)
      if (effectiveCompanyId) {
        try {
          // 1) _queue_id가 있는 항목은 API DELETE로 직접 삭제
          const queueIds = uniqueResults.map(r => (r as any)._queue_id).filter(Boolean)
          if (queueIds.length > 0) {
            const delRes = await fetch('/api/finance/classify', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ company_id: effectiveCompanyId, ids: queueIds })
            })
            const delData = await delRes.json()
            console.log(`[handleBulkSave] API로 classification_queue ${delData.deleted || 0}건 삭제 (_queue_id 기반)`)
          }

          // 2) _queue_id가 없는 항목은 cleanupStaleQueue로 처리 (API 기반)
          const itemsWithoutQueueId = uniqueResults.filter(r => !(r as any)._queue_id)
          if (itemsWithoutQueueId.length > 0) {
            console.log(`[handleBulkSave] _queue_id 없는 항목 ${itemsWithoutQueueId.length}건 → API 매칭 삭제`)
            // GET API로 pending queue 조회 (source_data 정규화됨)
            const qRes = await fetch(`/api/finance/classify?company_id=${effectiveCompanyId}&status=pending&limit=2000`)
            if (qRes.ok) {
              const qData = await qRes.json()
              const qItems = qData.items || []

              if (qItems.length > 0) {
                const deleteIds: string[] = []
                const savedKeys = new Map<string, number>()
                for (const r of itemsWithoutQueueId) {
                  const key = `${r.transaction_date}|${r.client_name}|${Math.abs(Number(r.amount || 0))}`
                  savedKeys.set(key, (savedKeys.get(key) || 0) + 1)
                }
                const usedKeys = new Map<string, number>()

                for (const q of qItems) {
                  const sd = q.source_data || {}
                  const key = `${sd.transaction_date}|${sd.client_name}|${Math.abs(Number(sd.amount || 0))}`
                  const savedCount = savedKeys.get(key) || 0
                  const usedCount = usedKeys.get(key) || 0
                  if (savedCount > 0 && usedCount < savedCount) {
                    usedKeys.set(key, usedCount + 1)
                    deleteIds.push(q.id)
                  }
                }

                if (deleteIds.length > 0) {
                  await fetch('/api/finance/classify', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ company_id: effectiveCompanyId, ids: deleteIds })
                  })
                  console.log(`[handleBulkSave] API 매칭으로 classification_queue ${deleteIds.length}건 추가 삭제`)
                }
              }
            }
          }
        } catch (e) {
          console.error('[handleBulkSave] classification_queue 삭제 실패:', e)
        }
      }

      // ── 특이건 자동 플래그 ──
      let flagCount = 0
      if (inserted && inserted.length > 0) {
        const flags: any[] = []
        uniqueResults.forEach((item, idx) => {
          const txId = inserted[idx]?.id
          if (!txId) return

          const baseFlag = {
            transaction_id: txId,
            transaction_date: item.transaction_date,
            client_name: item.client_name,
            amount: item.amount,
            card_id: item.card_id || null,
            employee_id: (item as any).matched_employee_id || null,
            employee_name: (item as any).matched_employee_name || null,
          }

          // 1) AI 신뢰도 낮음 (< 50)
          if ((item.confidence || 0) < 50) {
            flags.push({ ...baseFlag, flag_type: 'low_confidence', flag_reason: `AI 신뢰도 ${item.confidence || 0}%`, severity: 'medium' })
          }

          // 2) 외화 결제
          if ((item as any).currency && (item as any).currency !== 'KRW') {
            flags.push({ ...baseFlag, flag_type: 'foreign_currency', flag_reason: `외화 결제 (${(item as any).currency})`, severity: 'medium' })
          }

          // 3) 고액 거래 (100만원 이상)
          if (item.amount >= 1000000) {
            flags.push({ ...baseFlag, flag_type: 'unusual_amount', flag_reason: `고액 거래 (${item.amount.toLocaleString()}원)`, severity: item.amount >= 5000000 ? 'high' : 'medium' })
          }

          // 4) 주말/심야 거래 (description에 시간 포함된 경우)
          const desc = (item.description || '').toLowerCase()
          const timeMatch = desc.match(/(\d{1,2}):(\d{2})/)
          if (timeMatch) {
            const hour = parseInt(timeMatch[1])
            if (hour >= 22 || hour < 5) {
              flags.push({ ...baseFlag, flag_type: 'unusual_time', flag_reason: `심야 거래 (${timeMatch[0]})`, severity: 'medium' })
            }
          }
          if (item.transaction_date) {
            const dow = new Date(item.transaction_date).getDay()
            if (dow === 0 || dow === 6) {
              flags.push({ ...baseFlag, flag_type: 'unusual_time', flag_reason: `주말 거래 (${dow === 0 ? '일' : '토'}요일)`, severity: 'low' })
            }
          }

          // 5) 개인 사용 의심 키워드
          const clientDesc = `${item.client_name || ''} ${item.description || ''}`.toLowerCase()
          const personalKeywords = ['편의점', '치킨', '배달', '술집', '노래방', '주점', '카페', '스타벅스', '이디야', '쿠팡', '배민', '요기요']
          const matchedKw = personalKeywords.find(kw => clientDesc.includes(kw))
          if (matchedKw && item.amount >= 30000) {
            flags.push({ ...baseFlag, flag_type: 'personal_use', flag_reason: `개인 사용 의심 (${matchedKw}, ${item.amount.toLocaleString()}원)`, severity: 'medium' })
          }
        })

        if (flags.length > 0) {
          try {
            const { data: { session: flagSession } } = await supabase.auth.getSession()
            const flagHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
            if (flagSession?.access_token) flagHeaders['Authorization'] = `Bearer ${flagSession.access_token}`
            const flagRes = await fetch('/api/finance/flags', {
              method: 'POST',
              headers: flagHeaders,
              body: JSON.stringify({ company_id: effectiveCompanyId, flags }),
            })
            if (flagRes.ok) {
              const flagData = await flagRes.json()
              flagCount = flagData.created || 0
            }
          } catch (e) {
            console.error('[handleBulkSave] 특이건 플래그 생성 오류:', e)
          }
        }
      }

      // ── 투자 연결 거래 → 투자자별 순합계 업데이트 ──
      let investUpdateCount = 0
      const investTxs = uniqueResults.filter(r => r.related_type === 'invest' && r.related_id)
      if (investTxs.length > 0) {
        // 투자자별 그룹화
        const investorMap = new Map<string, number[]>()
        investTxs.forEach(tx => {
          const list = investorMap.get(tx.related_id!) || []
          list.push(tx.type === 'income' ? Math.abs(tx.amount) : -Math.abs(tx.amount))
          investorMap.set(tx.related_id!, list)
        })

        // 각 투자자의 전체 거래 내역에서 순합계 계산 후 invest_amount 업데이트
        for (const [investorId] of investorMap) {
          const { data: allTxs } = await supabase
            .from('transactions')
            .select('amount, type')
            .eq('related_type', 'invest')
            .eq('related_id', investorId)
          if (allTxs) {
            const netAmount = allTxs.reduce((acc, cur) => {
              return acc + (cur.type === 'income' ? Math.abs(cur.amount || 0) : -Math.abs(cur.amount || 0))
            }, 0)
            const { error: upErr } = await supabase
              .from('general_investments')
              .update({ invest_amount: netAmount })
              .eq('id', investorId)
            if (!upErr) investUpdateCount++
          }
        }
      }

      let msg = `✅ ${uniqueResults.length}건 저장 완료!`
      if (duplicateCount > 0) msg += ` (${duplicateCount}건 중복 제외)`
      if (linkedCount > 0) msg += ` (${linkedCount}건 스케줄 자동 연결)`
      if (investUpdateCount > 0) msg += ` (${investUpdateCount}명 투자자 금액 업데이트)`
      if (flagCount > 0) msg += `\n⚠️ ${flagCount}건 특이건 감지됨 → 법인카드관리에서 확인 가능`
      alert(msg)
      // 저장된 확정 항목만 목록에서 제거, 나머지는 유지
      const savedIds = new Set(uniqueResults.map(r => r.id))
      removeResults(savedIds)
      setUploadConfirmedIds(prev => {
        const next = new Set(prev)
        savedIds.forEach(id => next.delete(id))
        return next
      })
      // 통계 새로고침 & 확정 완료 필터로 전환
      fetchStats()
      setActiveTab('confirmed')
    }
  }

  const saveRuleToDb = async (item: any) => {
    if (!item.client_name) return alert('키워드 없음')
    const keyword = prompt(`'${item.client_name}' 규칙 저장`, item.client_name)
    if (!keyword) return

    const { error } = await supabase.from('finance_rules').insert({
      keyword,
      category: item.category,
      related_id: item.related_id,
      related_type: item.related_type
    })

    if (error) {
      if (error.code === '23505') alert('이미 등록된 키워드입니다.')
      else alert(error.message)
    } else {
      alert('✅ 규칙 저장 완료!')
    }
  }

  // ── Review Handlers ──
  const handleConfirm = async (item: any, overrides?: { category?: string; related_type?: string; related_id?: string }) => {
    const category = overrides?.category || item.ai_category || item.final_category
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          final_category: category,
          final_related_type: overrides?.related_type || item.ai_related_type,
          final_related_id: overrides?.related_id || item.ai_related_id,
          save_as_rule: false,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id))
        setStats(prev => ({ pending: prev.pending - 1, confirmed: prev.confirmed + 1 }))
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleConfirmWithRule = async (item: any, category: string) => {
    const keyword = item.source_data?.client_name || ''
    if (!keyword) return handleConfirm(item, { category })
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          final_category: category,
          final_related_type: item.ai_related_type,
          final_related_id: item.ai_related_id,
          save_as_rule: true,
          rule_keyword: keyword,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id))
        setStats(prev => ({ pending: prev.pending - 1, confirmed: prev.confirmed + 1 }))
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleRevert = async (item: any) => {
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          final_category: '기타',
          final_related_type: null,
          final_related_id: null,
          save_as_rule: false,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id))
        setStats(prev => ({ pending: prev.pending + 1, confirmed: prev.confirmed - 1 }))
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleChangeCategory = async (item: any, newCategory: string) => {
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          final_category: newCategory,
          final_related_type: item.ai_related_type,
          final_related_id: item.ai_related_id,
          save_as_rule: false,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, ai_category: newCategory, final_category: newCategory } : i))
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleConfirmGroup = async (category: string, groupItems: any[]) => {
    if (!confirm(`"${category}" ${groupItems.length}건을 일괄 확정하시겠습니까?`)) return
    for (const item of groupItems) {
      await handleConfirm(item, { category: item.ai_category || '미분류' })
    }
    fetchReviewItems()
  }

  const handleRevertGroup = async (category: string, groupItems: any[]) => {
    if (!confirm(`"${category}" ${groupItems.length}건을 대기중으로 되돌리시겠습니까?`)) return
    for (const item of groupItems) {
      await handleRevert(item)
    }
    fetchReviewItems()
  }

  const handleRevertAll = async () => {
    if (!confirm(`현재 조회된 ${items.length}건 전체를 대기중으로 되돌리시겠습니까?`)) return
    for (const item of items) {
      await handleRevert(item)
    }
    fetchReviewItems()
  }

  const handleAutoConfirmAll = async () => {
    const pendingItems = items.filter(i => i.status === 'pending')
    if (!confirm(`AI 추천 기준으로 ${pendingItems.length}건을 일괄 확정하시겠습니까?`)) return
    for (const item of pendingItems) {
      await handleConfirm(item)
    }
    fetchReviewItems()
  }

  const handleAiReclassify = async () => {
    if (!effectiveCompanyId) return
    if (!confirm('미분류/기타 거래를 AI로 자동 분류하시겠습니까?\nGPT가 거래 내용을 분석하여 계정과목을 추천합니다.')) return
    setAiClassifying(true)
    setAiResult(null)
    try {
      const res = await fetch('/api/finance/reclassify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: effectiveCompanyId }),
      })
      if (res.ok) {
        const data = await res.json()
        setAiResult({ updated: data.updated, total: data.total })
        fetchReviewItems()
      } else {
        const err = await res.json()
        alert('AI 분류 실패: ' + (err.error || '알 수 없는 오류'))
      }
    } catch (e) {
      console.error(e)
      alert('AI 분류 요청 중 오류가 발생했습니다.')
    }
    setAiClassifying(false)
  }

  const handleCheckDuplicates = async () => {
    if (!effectiveCompanyId) return
    setDuplicateInfo({ count: 0, checking: true })
    try {
      const res = await fetch(`/api/finance/dedup?company_id=${effectiveCompanyId}`)
      if (res.ok) {
        const data = await res.json()
        setDuplicateInfo({ count: data.duplicateCount, checking: false })
        if (data.duplicateCount === 0) {
          alert('✅ 중복 거래가 없습니다!')
        } else if (confirm(`⚠️ ${data.duplicateCount}건의 중복 거래가 발견되었습니다.\n(${data.groupCount}개 그룹)\n\n중복 건을 삭제하시겠습니까? (먼저 저장된 1건만 유지)`)) {
          const delRes = await fetch('/api/finance/dedup', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company_id: effectiveCompanyId }),
          })
          if (delRes.ok) {
            const delData = await delRes.json()
            alert(`✅ ${delData.deleted}건 중복 삭제 완료! (${delData.remaining}건 남음)`)
            fetchReviewItems()
          }
        }
      }
    } catch (e) {
      console.error(e)
    }
    setDuplicateInfo(prev => ({ ...prev, checking: false }))
  }

  const GROUP_PAGE_SIZE = 50
  const toggleGroup = (cat: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
        // Reset pagination when collapsing
        setGroupItemLimits(prev => { const n = { ...prev }; delete n[cat]; return n })
      } else {
        next.add(cat)
        // Start with first page only
        setGroupItemLimits(prev => ({ ...prev, [cat]: GROUP_PAGE_SIZE }))
      }
      return next
    })
  }

  // ── Upload Results Confirmed (사용자가 AI분류 확인 완료한 항목) ──
  const [uploadConfirmedIds, setUploadConfirmedIds] = useState<Set<number>>(new Set())

  // ── Upload Results Selection ──
  const [uploadSelectedIds, setUploadSelectedIds] = useState<Set<number>>(new Set())
  const toggleUploadSelect = (id: number) => {
    setUploadSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleUploadSelectAll = () => {
    if (uploadSelectedIds.size === filteredResults.length) {
      setUploadSelectedIds(new Set())
    } else {
      setUploadSelectedIds(new Set(filteredResults.map(r => r.id)))
    }
  }

  // ── Upload Results Sub-filter & Grouping ──
  const [uploadSubFilter, setUploadSubFilter] = useState<'all' | 'card' | 'bank' | 'unclassified'>('all')
  const [uploadGroupBy, setUploadGroupBy] = useState<'none' | 'card_number' | 'category' | 'vehicle' | 'client' | 'income_expense' | 'date' | 'user'>('none')
  // 카드 전용 서브필터
  const [cardSubFilter, setCardSubFilter] = useState<'all' | 'matched' | 'unmatched' | 'by_company' | 'by_user'>('all')
  // 통장 전용 서브필터
  const [bankSubFilter, setBankSubFilter] = useState<'all' | 'income' | 'expense' | 'auto_transfer' | 'salary_tax'>('all')

  // 업로드 결과 필터링 (1차: 결제수단 + 검색)
  const filteredByPayment = useMemo(() => {
    let filtered = results
    if (uploadSubFilter === 'card') filtered = results.filter(r => r.payment_method === '카드' || r.payment_method === 'Card')
    else if (uploadSubFilter === 'bank') filtered = results.filter(r => r.payment_method === '통장' || r.payment_method === 'Bank' || (r.payment_method !== '카드' && r.payment_method !== 'Card'))
    else if (uploadSubFilter === 'unclassified') filtered = results.filter(r => !r.category || r.category === '미분류' || r.category === '기타')
    // 검색어 필터
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase()
      filtered = filtered.filter(r => {
        const haystack = [r.client_name, r.description, r.memo, r.card_number, r.category, r.bank_name].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(q)
      })
    }
    return filtered
  }, [results, uploadSubFilter, searchTerm])

  // 2차 필터: 카드/통장 전용 서브필터 적용
  const filteredResults = useMemo(() => {
    let items = filteredByPayment
    // 카드 서브필터
    if (uploadSubFilter === 'card' && cardSubFilter !== 'all') {
      if (cardSubFilter === 'matched') {
        items = items.filter(r => {
          if (!r.card_number) return false
          return corpCards.some(cc => {
            const allNums = [cc.card_number, ...(cc.previous_card_numbers || [])].filter(Boolean).map((n: string) => n.replace(/\D/g, ''))
            const rNum = (r.card_number || '').replace(/\D/g, '')
            return allNums.some((n: string) => n.includes(rNum.slice(-4)) || rNum.includes(n.slice(-4)))
          })
        })
      } else if (cardSubFilter === 'unmatched') {
        items = items.filter(r => {
          if (!r.card_number) return true
          return !corpCards.some(cc => {
            const allNums = [cc.card_number, ...(cc.previous_card_numbers || [])].filter(Boolean).map((n: string) => n.replace(/\D/g, ''))
            const rNum = (r.card_number || '').replace(/\D/g, '')
            return allNums.some((n: string) => n.includes(rNum.slice(-4)) || rNum.includes(n.slice(-4)))
          })
        })
      }
    }
    // 통장 서브필터
    if (uploadSubFilter === 'bank' && bankSubFilter !== 'all') {
      if (bankSubFilter === 'income') {
        items = items.filter(r => r.type === 'income')
      } else if (bankSubFilter === 'expense') {
        items = items.filter(r => r.type === 'expense')
      } else if (bankSubFilter === 'auto_transfer') {
        items = items.filter(r => {
          const desc = ((r.description || '') + (r.client_name || '')).toLowerCase()
          return desc.includes('자동이체') || desc.includes('cms') || desc.includes('자동납부') || desc.includes('자동') || desc.includes('정기')
        })
      } else if (bankSubFilter === 'salary_tax') {
        items = items.filter(r => {
          const cat = r.category || ''
          const desc = ((r.description || '') + (r.client_name || '')).toLowerCase()
          return cat.includes('급여') || cat.includes('세금') || cat.includes('원천세') || cat.includes('부가세') || cat.includes('4대보험') || desc.includes('급여') || desc.includes('세금') || desc.includes('국세') || desc.includes('연금') || desc.includes('건강보험') || desc.includes('고용보험')
        })
      }
    }
    return items
  }, [filteredByPayment, uploadSubFilter, cardSubFilter, bankSubFilter, corpCards])

  // 카드 서브필터 통계
  const cardSubStats = useMemo(() => {
    if (uploadSubFilter !== 'card') return { all: 0, matched: 0, unmatched: 0, companies: [] as { name: string; count: number }[], users: [] as { name: string; count: number }[] }
    const cardItems = filteredByPayment
    const matched = cardItems.filter(r => {
      if (!r.card_number) return false
      return corpCards.some(cc => {
        const allNums = [cc.card_number, ...(cc.previous_card_numbers || [])].filter(Boolean).map((n: string) => n.replace(/\D/g, ''))
        const rNum = (r.card_number || '').replace(/\D/g, '')
        return allNums.some((n: string) => n.includes(rNum.slice(-4)) || rNum.includes(n.slice(-4)))
      })
    })
    // 카드사별 집계
    const companyMap: Record<string, number> = {}
    for (const r of cardItems) {
      const card = findCardByNumber(r.card_number)
      const company = card?.card_company || '미등록'
      companyMap[company] = (companyMap[company] || 0) + 1
    }
    // 사용자별 집계 (assigned_employee 우선)
    const userMap: Record<string, number> = {}
    for (const r of cardItems) {
      const card = findCardByNumber(r.card_number)
      let user = '미매칭'
      if (card) {
        if (card.assigned_employee_id) {
          const emp = employees.find((e: any) => e.id === card.assigned_employee_id)
          user = emp?.name || emp?.employee_name || card.holder_name || card.card_alias || '공용'
        } else {
          user = card.holder_name || card.card_alias || '공용'
        }
      }
      userMap[user] = (userMap[user] || 0) + 1
    }
    return {
      all: cardItems.length,
      matched: matched.length,
      unmatched: cardItems.length - matched.length,
      companies: Object.entries(companyMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      users: Object.entries(userMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    }
  }, [filteredByPayment, uploadSubFilter, corpCards])

  // 통장 서브필터 통계
  const bankSubStats = useMemo(() => {
    if (uploadSubFilter !== 'bank') return { all: 0, income: 0, expense: 0, autoTransfer: 0, salaryTax: 0, incomeAmount: 0, expenseAmount: 0 }
    const bankItems = filteredByPayment
    const income = bankItems.filter(r => r.type === 'income')
    const expense = bankItems.filter(r => r.type === 'expense')
    const autoTransfer = bankItems.filter(r => {
      const desc = ((r.description || '') + (r.client_name || '')).toLowerCase()
      return desc.includes('자동이체') || desc.includes('cms') || desc.includes('자동납부') || desc.includes('자동') || desc.includes('정기')
    })
    const salaryTax = bankItems.filter(r => {
      const cat = r.category || ''
      const desc = ((r.description || '') + (r.client_name || '')).toLowerCase()
      return cat.includes('급여') || cat.includes('세금') || cat.includes('원천세') || cat.includes('부가세') || cat.includes('4대보험') || desc.includes('급여') || desc.includes('세금') || desc.includes('국세') || desc.includes('연금') || desc.includes('건강보험') || desc.includes('고용보험')
    })
    return {
      all: bankItems.length,
      income: income.length,
      expense: expense.length,
      autoTransfer: autoTransfer.length,
      salaryTax: salaryTax.length,
      incomeAmount: income.reduce((s, r) => s + Math.abs(r.amount || 0), 0),
      expenseAmount: expense.reduce((s, r) => s + Math.abs(r.amount || 0), 0),
    }
  }, [filteredByPayment, uploadSubFilter])

  // 카드번호별 그룹핑 (법인카드 사용자 매칭 포함, 통장거래 별도 분리)
  const groupedByCard = useMemo(() => {
    if (uploadGroupBy !== 'card_number') return null
    const groups: Record<string, { items: typeof filteredResults; cardInfo: any; totalAmount: number; foreignAmounts: Record<string, number>; isBank?: boolean }> = {}
    for (const item of filteredResults) {
      // 통장/이체 거래는 별도 그룹
      const pm = (item.payment_method || '').toLowerCase()
      const isBank = pm.includes('통장') || pm.includes('이체') || pm === 'bank' || pm === 'transfer'
      if (isBank && !item.card_number) {
        const key = '🏦 통장/이체 거래'
        if (!groups[key]) groups[key] = { items: [], cardInfo: null, totalAmount: 0, foreignAmounts: {}, isBank: true }
        groups[key].items.push(item)
        groups[key].totalAmount += item.amount || 0
        addForeignAmount(groups[key].foreignAmounts, item)
        continue
      }
      const cardNum = item.card_number || '(카드번호 없음)'
      const key = cardNum.length >= 3 ? cardNum : '(카드번호 없음)'
      if (!groups[key]) {
        // 법인카드 정보 매칭 (과거 카드번호 포함)
        const matchedCard = findCardByNumber(item.card_number)
        groups[key] = { items: [], cardInfo: matchedCard || null, totalAmount: 0, foreignAmounts: {} }
      }
      groups[key].items.push(item)
      groups[key].totalAmount += item.amount || 0
      addForeignAmount(groups[key].foreignAmounts, item)
    }
    // 정렬: 카드 매칭된 것 → 미등록 카드 → 통장 → 카드번호 없음 순
    return Object.entries(groups).sort((a, b) => {
      const aIsBank = a[1].isBank ? 1 : 0
      const bIsBank = b[1].isBank ? 1 : 0
      const aNoCard = a[0] === '(카드번호 없음)' ? 1 : 0
      const bNoCard = b[0] === '(카드번호 없음)' ? 1 : 0
      if (aIsBank !== bIsBank) return aIsBank - bIsBank
      if (aNoCard !== bNoCard) return aNoCard - bNoCard
      return b[1].items.length - a[1].items.length
    })
  }, [filteredResults, uploadGroupBy, corpCards])

  // 차량별 그룹핑 (유류비, 정비비 등 차량 관련 거래)
  const groupedByVehicle = useMemo(() => {
    if (uploadGroupBy !== 'vehicle') return null
    const vehicleCategories = ['유류비', '정비/수리비', '차량보험료', '자동차세/공과금', '차량할부/리스료']
    const groups: Record<string, { items: typeof filteredResults; carInfo: any; totalAmount: number; foreignAmounts: Record<string, number> }> = {}
    for (const item of filteredResults) {
      if (!vehicleCategories.includes(item.category || '') && !item.related_type?.includes('car')) {
        const key = '🏢 차량 외 거래'
        if (!groups[key]) groups[key] = { items: [], carInfo: null, totalAmount: 0, foreignAmounts: {} }
        groups[key].items.push(item)
        groups[key].totalAmount += item.amount || 0
        addForeignAmount(groups[key].foreignAmounts, item)
        continue
      }
      const carId = item.related_type === 'car' ? item.related_id : null
      const car = carId ? cars.find(c => c.id === carId) : null
      const key = car ? `🚛 ${car.number} (${car.model || ''})` : '🚛 미배정 차량'
      if (!groups[key]) groups[key] = { items: [], carInfo: car, totalAmount: 0, foreignAmounts: {} }
      groups[key].items.push(item)
      groups[key].totalAmount += item.amount || 0
      addForeignAmount(groups[key].foreignAmounts, item)
    }
    return Object.entries(groups).sort((a, b) => {
      // 차량 외 거래는 맨 뒤로
      if (a[0].includes('차량 외')) return 1
      if (b[0].includes('차량 외')) return -1
      return b[1].items.length - a[1].items.length
    })
  }, [filteredResults, uploadGroupBy, cars])

  // 거래처별 그룹핑 (client_name 기준)
  const groupedByClient = useMemo(() => {
    if (uploadGroupBy !== 'client') return null
    const groups: Record<string, { items: typeof filteredResults; totalAmount: number; foreignAmounts: Record<string, number>; type: string }> = {}
    for (const item of filteredResults) {
      const client = (item.client_name || item.description || '').trim()
      const key = client ? `🏢 ${client}` : '🏢 거래처 없음'
      if (!groups[key]) groups[key] = { items: [], totalAmount: 0, foreignAmounts: {}, type: 'expense' }
      groups[key].items.push(item)
      groups[key].totalAmount += Math.abs(item.amount || 0)
      addForeignAmount(groups[key].foreignAmounts, item)
      if (item.type === 'income') groups[key].type = 'income'
    }
    return Object.entries(groups).sort((a, b) => {
      if (a[0].includes('거래처 없음')) return 1
      if (b[0].includes('거래처 없음')) return -1
      return b[1].items.length - a[1].items.length
    })
  }, [filteredResults, uploadGroupBy])

  // 입출금별 그룹핑 (입금/출금 분리)
  const groupedByIncomeExpense = useMemo(() => {
    if (uploadGroupBy !== 'income_expense') return null
    const groups: Record<string, { items: typeof filteredResults; totalAmount: number; foreignAmounts: Record<string, number>; type: string }> = {}
    for (const item of filteredResults) {
      const amt = Math.abs(item.amount || 0)
      const isIncome = item.type === 'income'
      const key = isIncome ? '💰 입금' : '💸 출금'
      if (!groups[key]) groups[key] = { items: [], totalAmount: 0, foreignAmounts: {}, type: isIncome ? 'income' : 'expense' }
      groups[key].items.push(item)
      groups[key].totalAmount += Math.abs(amt)
      addForeignAmount(groups[key].foreignAmounts, item)
    }
    // 입금 먼저
    return Object.entries(groups).sort((a, b) => {
      if (a[0].includes('입금')) return -1
      if (b[0].includes('입금')) return 1
      return 0
    })
  }, [filteredResults, uploadGroupBy])

  // 날짜별 그룹핑 (업로드 결과)
  const groupedByDate = useMemo(() => {
    if (uploadGroupBy !== 'date') return null
    const groups: Record<string, { items: typeof filteredResults; totalAmount: number; foreignAmounts: Record<string, number>; type: string }> = {}
    for (const item of filteredResults) {
      const dateStr = item.transaction_date || (item as any).date || ''
      let key = '📅 날짜 없음'
      if (dateStr) {
        const d = new Date(dateStr)
        if (!isNaN(d.getTime())) {
          key = `📅 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }
      }
      if (!groups[key]) groups[key] = { items: [], totalAmount: 0, foreignAmounts: {}, type: 'expense' }
      groups[key].items.push(item)
      groups[key].totalAmount += Math.abs(item.amount || 0)
      addForeignAmount(groups[key].foreignAmounts, item)
      if (item.type === 'income') groups[key].type = 'income'
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filteredResults, uploadGroupBy])

  // 사용자별 그룹핑 (업로드 결과 — 카드 사용자/직원 매칭)
  const groupedByUser = useMemo(() => {
    if (uploadGroupBy !== 'user') return null
    const groups: Record<string, { items: typeof filteredResults; totalAmount: number; foreignAmounts: Record<string, number>; type: string }> = {}
    for (const item of filteredResults) {
      let key = '👤 미확인'
      if ((item as any).matched_employee_name) {
        key = `👤 ${(item as any).matched_employee_name}`
      } else if (item.card_number) {
        const matched = findCardByNumber(item.card_number)
        if (matched) key = `👤 ${getCardDisplayName(matched)}`
      }
      if (!groups[key]) groups[key] = { items: [], totalAmount: 0, foreignAmounts: {}, type: 'expense' }
      groups[key].items.push(item)
      groups[key].totalAmount += Math.abs(item.amount || 0)
      addForeignAmount(groups[key].foreignAmounts, item)
    }
    return Object.entries(groups).sort((a, b) => {
      if (a[0].includes('미확인')) return 1
      if (b[0].includes('미확인')) return -1
      return b[1].items.length - a[1].items.length
    })
  }, [filteredResults, uploadGroupBy, corpCards])

  // 카테고리별 그룹핑
  const groupedByCategory = useMemo(() => {
    if (uploadGroupBy !== 'category') return null

    if (categoryMode === 'display') {
      // 용도별 그룹핑: DISPLAY_CATEGORIES 순서대로 2단계 (그룹 > 세부항목)
      const catMap: Record<string, string> = {} // 세부항목 → 그룹명 매핑
      for (const dg of DISPLAY_CATEGORIES) {
        for (const item of dg.items) catMap[item] = dg.group
      }
      const groupData: Record<string, { items: typeof filteredResults; totalAmount: number; foreignAmounts: Record<string, number>; subGroups: Record<string, { items: typeof filteredResults; totalAmount: number; foreignAmounts: Record<string, number> }> }> = {}
      for (const item of filteredResults) {
        const cat = item.category || '미분류'
        const groupName = catMap[cat] || '📦 기타 지출'
        if (!groupData[groupName]) groupData[groupName] = { items: [], totalAmount: 0, foreignAmounts: {}, subGroups: {} }
        groupData[groupName].items.push(item)
        groupData[groupName].totalAmount += item.amount || 0
        addForeignAmount(groupData[groupName].foreignAmounts, item)
        if (!groupData[groupName].subGroups[cat]) groupData[groupName].subGroups[cat] = { items: [], totalAmount: 0, foreignAmounts: {} }
        groupData[groupName].subGroups[cat].items.push(item)
        groupData[groupName].subGroups[cat].totalAmount += item.amount || 0
        addForeignAmount(groupData[groupName].subGroups[cat].foreignAmounts, item)
      }
      // DISPLAY_CATEGORIES 순서대로 정렬
      const order = DISPLAY_CATEGORIES.map(d => d.group)
      return Object.entries(groupData).sort((a, b) => {
        const ai = order.indexOf(a[0]); const bi = order.indexOf(b[0])
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    }

    // 회계 기준 (기존)
    const groups: Record<string, { items: typeof filteredResults; totalAmount: number; foreignAmounts: Record<string, number> }> = {}
    for (const item of filteredResults) {
      const cat = item.category || '미분류'
      if (!groups[cat]) groups[cat] = { items: [], totalAmount: 0, foreignAmounts: {} }
      groups[cat].items.push(item)
      groups[cat].totalAmount += item.amount || 0
      addForeignAmount(groups[cat].foreignAmounts, item)
    }
    return Object.entries(groups).sort((a, b) => b[1].items.length - a[1].items.length)
  }, [filteredResults, uploadGroupBy, categoryMode])

  // 업로드 결과 요약 통계
  const uploadStats = useMemo(() => {
    const cardItems = results.filter(r => r.payment_method === '카드' || r.payment_method === 'Card')
    const bankItems = results.filter(r => r.payment_method !== '카드' && r.payment_method !== 'Card')
    const classifiedCount = results.filter(r => r.category && r.category !== '미분류' && r.category !== '기타').length
    const unclassifiedCount = results.filter(r => !r.category || r.category === '미분류' || r.category === '기타').length
    // card_id가 있고 실제 corpCards에 매칭되는 건만 카운트
    const cardMatchedCount = cardItems.filter(r => {
      if (!r.card_id) return false
      return corpCards.some(cc => cc.id === r.card_id)
    }).length
    return { cardCount: cardItems.length, bankCount: bankItems.length, classifiedCount, unclassifiedCount, cardMatchedCount }
  }, [results, corpCards])

  // ── 업로드 결과 합계 (B1용) ──
  const uploadSummaryTotals = useMemo(() => {
    let income = 0, expense = 0
    const foreignAmounts: Record<string, number> = {}
    for (const item of filteredResults) {
      const amt = Math.abs(item.amount || 0)
      if (item.type === 'income') income += amt
      else expense += amt
      addForeignAmount(foreignAmounts, item)
    }
    return { count: filteredResults.length, income, expense, net: income - expense, foreignAmounts, foreignText: formatForeignAmounts(foreignAmounts) }
  }, [filteredResults])

  // ── Upload 선택 합계 (B2용) ──
  const uploadSelectionTotals = useMemo(() => {
    if (uploadSelectedIds.size === 0) return { count: 0, total: 0, foreignText: '' }
    let total = 0
    const foreignAmounts: Record<string, number> = {}
    for (const item of filteredResults) {
      if (uploadSelectedIds.has(item.id)) {
        total += Math.abs(item.amount || 0)
        addForeignAmount(foreignAmounts, item)
      }
    }
    return { count: uploadSelectedIds.size, total, foreignText: formatForeignAmounts(foreignAmounts) }
  }, [uploadSelectedIds, filteredResults])

  // (findCardByNumber & getCardUserName moved before groupedItems useMemo)

  const getCardDisplayInfo = useCallback((cardId: string | null | undefined) => {
    if (!cardId) return null
    const card = corpCards.find(c => c.id === cardId)
    if (!card) return null
    return { company: card.card_company, last4: (card.card_number || '').slice(-4), holder: getCardDisplayName(card) }
  }, [corpCards, getCardDisplayName])

  // 연결 대상 표시 헬퍼
  const getRelatedDisplay = useCallback((type: string | null, id: string | null) => {
    if (!type || !id) return null
    if (type === 'card') {
      const c = corpCards.find(cc => cc.id === id)
      if (!c) return { icon: '💳', label: '카드', detail: id.slice(0, 8) }
      return { icon: '💳', label: `${c.card_company || ''} ****${(c.card_number || '').slice(-4)}`, detail: getCardDisplayName(c), color: '#f59e0b' }
    }
    if (type === 'jiip') {
      const j = jiips.find(jj => jj.id === id)
      return { icon: '🚛', label: j?.investor_name || '지입', detail: j?.vehicle_number || j?.car_number || '', color: '#8b5cf6' }
    }
    if (type === 'invest') {
      const inv = investors.find(ii => ii.id === id)
      return { icon: '💰', label: inv?.investor_name || '투자', detail: inv?.invest_amount ? `${Number(inv.invest_amount).toLocaleString()}원` : '', color: '#10b981' }
    }
    if (type === 'car') {
      const car = cars.find(cc => cc.id === id)
      return { icon: '🚗', label: car?.number || '차량', detail: car?.model ? `${car.brand || ''} ${car.model}` : '', color: '#3b82f6' }
    }
    if (type === 'loan') {
      const l = loans.find(ll => ll.id === id)
      return { icon: '🏦', label: l?.finance_name || '대출', detail: l?.monthly_payment ? `${Number(l.monthly_payment).toLocaleString()}원/월` : '', color: '#ef4444' }
    }
    if (type === 'insurance') {
      const ins = insurances.find(ii => ii.id === id)
      return { icon: '🛡️', label: ins?.company || '보험', detail: ins?.product_name || '', color: '#06b6d4' }
    }
    if (type === 'employee') {
      const emp = employees.find(e => e.id === id)
      return { icon: '👨‍💼', label: emp?.name || '직원', detail: emp?.position || emp?.department || '', color: '#10b981' }
    }
    if (type === 'salary') {
      const emp = employees.find(e => e.id === id)
      return { icon: '👤', label: emp?.name || '직원급여', detail: emp?.position || '', color: '#6366f1' }
    }
    if (type === 'freelancer') return { icon: '📋', label: '프리랜서', detail: '', color: '#f97316' }
    return { icon: '🔗', label: type, detail: id ? String(id).slice(0, 8) : '', color: '#6b7280' }
  }, [corpCards, jiips, investors, cars, loans, insurances, employees])

  // 연결 대상 옵션 목록
  const relatedOptions = useMemo(() => {
    const opts: Array<{ group: string; icon: string; items: Array<{ value: string; label: string; sub: string; color: string }> }> = []
    if (corpCards.length > 0) {
      opts.push({ group: '법인카드', icon: '💳', items: corpCards.map(cc => ({
        value: `card_${cc.id}`,
        label: `${cc.card_company || '카드'} ****${(cc.card_number || '').slice(-4)}`,
        sub: `${cc.holder_name || cc.card_alias || '공용'} · 한도 ${cc.card_limit ? Number(cc.card_limit).toLocaleString() + '원' : '-'}`,
        color: '#f59e0b',
      }))})
    }
    if (jiips.length > 0) {
      opts.push({ group: '지입 차주', icon: '🚛', items: jiips.map(j => ({
        value: `jiip_${j.id}`,
        label: j.investor_name || '차주',
        sub: `${j.vehicle_number || j.car_number || ''} · 관리비 ${j.admin_fee ? Number(j.admin_fee).toLocaleString() + '원' : '-'}`,
        color: '#8b5cf6',
      }))})
    }
    if (investors.length > 0) {
      opts.push({ group: '투자자', icon: '💰', items: investors.map(i => ({
        value: `invest_${i.id}`,
        label: i.investor_name || '투자자',
        sub: `투자금 ${i.invest_amount ? Number(i.invest_amount).toLocaleString() + '원' : '-'} · 이율 ${i.interest_rate || '-'}%`,
        color: '#10b981',
      }))})
    }
    if (cars.length > 0) {
      opts.push({ group: '차량', icon: '🚗', items: cars.map(c => ({
        value: `car_${c.id}`,
        label: c.number || '차량',
        sub: `${c.brand || ''} ${c.model || ''}`.trim() || '-',
        color: '#3b82f6',
      }))})
    }
    if (loans.length > 0) {
      opts.push({ group: '대출', icon: '🏦', items: loans.map(l => ({
        value: `loan_${l.id}`,
        label: l.finance_name || '대출',
        sub: `월 ${l.monthly_payment ? Number(l.monthly_payment).toLocaleString() + '원' : '-'}`,
        color: '#ef4444',
      }))})
    }
    if (insurances.length > 0) {
      opts.push({ group: '보험', icon: '🛡️', items: insurances.map(ins => ({
        value: `insurance_${ins.id}`,
        label: ins.company || '보험',
        sub: ins.product_name || '-',
        color: '#06b6d4',
      }))})
    }
    if (employees.length > 0) {
      opts.push({ group: '직원', icon: '👨‍💼', items: employees.map(emp => ({
        value: `employee_${emp.id}`,
        label: emp.employee_name || emp.email || '직원',
        sub: `${emp.position || emp.department || ''} ${emp.phone || ''}`.trim() || '-',
        color: '#10b981',
      }))})
    }
    return opts
  }, [corpCards, jiips, investors, cars, loans, insurances, employees])

  // 연결 대상 드롭다운 상태
  const [openRelatedId, setOpenRelatedId] = useState<number | null>(null)

  // 분류 팝오버 상태
  const [openCategoryId, setOpenCategoryId] = useState<number | null>(null)
  const [catPopoverStep, setCatPopoverStep] = useState<'group' | 'item'>('group')
  const [catPopoverGroup, setCatPopoverGroup] = useState<string>('')

  // 팝오버 위치 (fixed positioning for overflow clipping fix)
  const [catPopoverPos, setCatPopoverPos] = useState<{top: number; left: number; openUp: boolean} | null>(null)
  const [relPopoverPos, setRelPopoverPos] = useState<{top: number; left: number; openUp: boolean} | null>(null)
  const [linkPopoverPosFixed, setLinkPopoverPosFixed] = useState<{top: number; right: number; openUp: boolean} | null>(null)

  const calcPopPos = (el: HTMLElement, maxH = 340) => {
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < Math.min(maxH, 200)
    return { top: openUp ? Math.max(8, rect.top - maxH - 2) : rect.bottom + 2, left: rect.left, openUp }
  }
  const calcPopPosRight = (el: HTMLElement, maxH = 340) => {
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < Math.min(maxH, 200)
    return { top: openUp ? Math.max(8, rect.top - maxH - 2) : rect.bottom + 4, right: window.innerWidth - rect.right, openUp }
  }

  // 일괄분류 모달 상태
  const [bulkClassifyOpen, setBulkClassifyOpen] = useState(false)
  const [bulkGroup, setBulkGroup] = useState('')
  const [bulkItem, setBulkItem] = useState('')
  const [bulkRelated, setBulkRelated] = useState('')
  const [customGroupInput, setCustomGroupInput] = useState(false)
  const [customGroupText, setCustomGroupText] = useState('')
  const [customItemInput, setCustomItemInput] = useState(false)
  const [customItemText, setCustomItemText] = useState('')
  const [customCategories, setCustomCategories] = useState<Array<{ group: string; items: string[] }>>([])  // 사용자 추가 중그룹/세부항목

  // ── Guard: Company Selection ──
  if (role === 'god_admin' && !adminSelectedCompanyId) {
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px', minHeight: '100vh', background: '#f9fafb' }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: 80, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>🏢</span>
          <p style={{ fontWeight: 700, color: '#475569', fontSize: 14 }}>좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  if (!effectiveCompanyId) {
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px', minHeight: '100vh', background: '#f9fafb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg style={{ width: 24, height: 24, color: '#2d5fa8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              카드/통장 관리
            </h1>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>엑셀·영수증·PDF를 AI로 자동 분류하여 장부에 반영합니다</p>
          </div>
          <button onClick={() => router.back()} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontWeight: 700, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
            ← 돌아가기
          </button>
        </div>
        <div style={{ background: '#fff', borderRadius: 20, padding: 80, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>🏢</p>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#475569' }}>좌측 상단에서 회사를 먼저 선택해주세요</p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>회사 선택 후 AI 분석기를 이용할 수 있습니다</p>
        </div>
      </div>
    )
  }

  return (
    <div onDragOver={onDragOver} style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px', minHeight: '100vh', background: '#f9fafb' }}>

      {/* ═══ 탭바 카드 (PageTitle은 레이아웃에서 자동 제공) ═══ */}
      <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 16, boxShadow: '0 2px 16px rgba(45,95,168,0.08)', background: '#fff' }}>

        {/* ═══ 탭 바 (2탭: 분류 관리 + 확정완료) ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', padding: '0 4px' }}>
          {/* 업로드 버튼 (드래그앤드롭 통합 + 절취선 보더) */}
          <div
            onClick={() => { const inp = document.getElementById('upload-file-input'); if (inp) inp.click() }}
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer',
              margin: '6px 8px 6px 4px',
              borderRight: 'none',
              transition: 'all 0.2s',
            }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
              fontSize: 12, fontWeight: 700,
              color: isDragging ? '#2d5fa8' : '#64748b',
              background: isDragging ? '#eff6ff' : '#fafbfc',
              border: isDragging ? '1.5px dashed #2d5fa8' : '1.5px dashed #cbd5e1',
              borderRadius: 8,
              transition: 'all 0.2s',
            }}>
              <input id="upload-file-input" type="file" multiple accept=".xlsx,.xls,.csv,image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" onChange={handleFileChange} style={{ display: 'none' }} />
              <span style={{ fontSize: 14 }}>{isDragging ? '📥' : '📂'}</span>
              <span>{isDragging ? '여기에 놓으세요!' : '파일 업로드'}</span>
            </div>
          </div>

          {/* 2탭: 분류 관리 + 확정완료 */}
          {([
            { key: 'classify' as const, label: '📋 분류 관리', count: stats.pending, countColor: '#d97706' },
            { key: 'confirmed' as const, label: '✅ 확정완료', count: stats.confirmed, countColor: '#16a34a' },
          ]).map(tab => (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); setExpandedGroups(new Set()); setSelectedIds(new Set()) }}
              style={{
                padding: '10px 18px', border: 'none', cursor: 'pointer',
                borderBottom: activeTab === tab.key ? '3px solid #2d5fa8' : '3px solid transparent',
                background: activeTab === tab.key ? '#fff' : 'transparent',
                fontSize: 12, fontWeight: activeTab === tab.key ? 800 : 600,
                color: activeTab === tab.key ? '#0f172a' : '#94a3b8',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
              {tab.label}
              <span style={{ fontSize: 12, fontWeight: 700, color: activeTab === tab.key ? tab.countColor : '#94a3b8' }}>{tab.count.toLocaleString()}</span>
            </button>
          ))}

          {/* 액션 버튼 (오른쪽) */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, paddingRight: 8 }}>
            {activeTab === 'classify' && (
              <>
                <button onClick={handleCheckDuplicates} disabled={duplicateInfo.checking}
                  style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0',
                    cursor: duplicateInfo.checking ? 'not-allowed' : 'pointer',
                    opacity: duplicateInfo.checking ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  🔄 {duplicateInfo.checking ? '확인 중...' : '중복체크'}
                </button>
                <button onClick={handleAiReclassify} disabled={aiClassifying}
                  style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    color: '#fff', background: '#2d5fa8', border: 'none',
                    cursor: aiClassifying ? 'not-allowed' : 'pointer',
                    opacity: aiClassifying ? 0.5 : 1,
                    boxShadow: '0 1px 4px rgba(45,95,168,0.3)',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  🤖 {aiClassifying ? 'AI 분류 중...' : 'AI 자동분류'}
                </button>
              </>
            )}
            {activeTab === 'confirmed' && (
              <button style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                📥 내보내기
              </button>
            )}
          </div>
        </div>

        {/* ═══ T2 인라인 칩 필터바 (항상 표시) ═══ */}
        {(activeTab === 'classify' || activeTab === 'confirmed') && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 6, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
            {/* 소스 필터 칩 — 확정완료 탭은 항상 DB 데이터, 분류관리 탭은 업로드 결과 우선 */}
            {(results.length > 0 && activeTab !== 'confirmed' ? [
              { key: 'all' as const, label: '📋 전체', count: results.length },
              { key: 'card' as const, label: '💳 카드', count: uploadStats.cardCount },
              { key: 'bank' as const, label: '🏦 통장', count: uploadStats.bankCount },
              { key: 'unclassified' as const, label: '❓ 미분류', count: uploadStats.unclassifiedCount, isRed: true },
            ] : [
              { key: 'all' as const, label: '📋 전체', count: activeTab === 'confirmed' ? stats.confirmed : stats.pending },
              { key: 'card' as const, label: '💳 카드', count: items.filter(i => isCardItem(i)).length },
              { key: 'bank' as const, label: '🏦 통장', count: items.filter(i => !isCardItem(i)).length },
              { key: 'unclassified' as const, label: '❓ 미분류', count: reviewUnclassifiedCount, isRed: true },
            ]).map(chip => (
              <button key={chip.key} onClick={() => {
                setSourceFilter(chip.key)
                // 업로드 결과가 있을 때는 uploadSubFilter도 동기화
                if (results.length > 0) {
                  setUploadSubFilter(chip.key === 'all' ? 'all' : chip.key === 'card' ? 'card' : chip.key === 'bank' ? 'bank' : 'unclassified')
                  if (chip.key === 'card') setUploadGroupBy('card_number')
                  else if (chip.key === 'all') setUploadGroupBy('none')
                  else setUploadGroupBy('none')
                }
                setExpandedGroups(new Set())
              }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                  background: sourceFilter === chip.key ? '#eff6ff' : '#f1f5f9',
                  borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: sourceFilter === chip.key ? '1.5px solid #2d5fa8' : '1.5px solid transparent',
                  color: chip.isRed ? '#dc2626' : (sourceFilter === chip.key ? '#2d5fa8' : '#475569'),
                  transition: 'all 0.15s',
                }}>
                {chip.label} <span style={{ fontWeight: 900 }}>{chip.count}</span>
              </button>
            ))}
            <div style={{ width: 1, height: 20, background: '#e5e7eb', flexShrink: 0 }} />
            {/* 그룹핑 드롭다운 — 순수 그룹핑 방식 선택 */}
            {(() => {
              const rawVal = results.length > 0 ? uploadGroupBy : groupBy
              // 카테고리일 때 용도별/회계기준 구분 반영
              const dropdownVal = (rawVal === 'category')
                ? (categoryMode === 'display' ? 'category_display' : 'category_accounting')
                : rawVal

              const handleChange = (val: string) => {
                // 용도별/회계기준 서브모드 처리
                if (val === 'category_display') {
                  setCategoryMode('display')
                  val = 'category'
                } else if (val === 'category_accounting') {
                  setCategoryMode('accounting')
                  val = 'category'
                }
                if (results.length > 0) {
                  setUploadGroupBy(val as any)
                  const dbMap: Record<string, string> = { none: 'category', card_number: 'card', category: 'category', vehicle: 'vehicle', client: 'client', income_expense: 'income_expense', date: 'date', user: 'user' }
                  setGroupBy((dbMap[val] || 'category') as any)
                } else {
                  setGroupBy(val as any)
                }
                setExpandedGroups(new Set())
              }

              // 소스별 옵션 결정 — 순수 그룹핑만 (용도별/회계기준은 별도 토글)
              const sf = sourceFilter
              let options: { value: string; label: string }[] = []

              if (results.length > 0) {
                // 업로드 모드
                if (sf === 'card') {
                  options = [
                    { value: 'none', label: '📄 목록' },
                    { value: 'card_number', label: '💳 카드번호별' },
                    { value: 'category_display', label: '📂 용도별' },
                    { value: 'category_accounting', label: '📂 회계기준별' },
                    { value: 'vehicle', label: '🚙 차량별' },
                    { value: 'user', label: '👤 사용자별' },
                    { value: 'date', label: '📅 날짜별' },
                  ]
                } else if (sf === 'bank') {
                  options = [
                    { value: 'none', label: '📄 목록' },
                    { value: 'category_display', label: '📂 용도별' },
                    { value: 'category_accounting', label: '📂 회계기준별' },
                    { value: 'client', label: '🏢 거래처별' },
                    { value: 'income_expense', label: '💰 입출금별' },
                    { value: 'date', label: '📅 날짜별' },
                  ]
                } else if (sf === 'unclassified') {
                  options = [
                    { value: 'none', label: '📄 목록' },
                    { value: 'category_display', label: '📂 용도별' },
                    { value: 'category_accounting', label: '📂 회계기준별' },
                    { value: 'client', label: '🏢 거래처별' },
                    { value: 'date', label: '📅 날짜별' },
                  ]
                } else {
                  // 전체
                  options = [
                    { value: 'none', label: '📄 목록' },
                    { value: 'card_number', label: '💳 카드번호별' },
                    { value: 'category_display', label: '📂 용도별' },
                    { value: 'category_accounting', label: '📂 회계기준별' },
                    { value: 'vehicle', label: '🚙 차량별' },
                    { value: 'client', label: '🏢 거래처별' },
                    { value: 'income_expense', label: '💰 입출금별' },
                    { value: 'user', label: '👤 사용자별' },
                    { value: 'date', label: '📅 날짜별' },
                  ]
                }
              } else {
                // DB 리뷰 모드
                if (sf === 'card') {
                  options = [
                    { value: 'category_display', label: '📂 용도별' },
                    { value: 'category_accounting', label: '📂 회계기준별' },
                    { value: 'card', label: '💳 카드번호별' },
                    { value: 'vehicle', label: '🚙 차량별' },
                    { value: 'user', label: '👤 사용자별' },
                    { value: 'client', label: '🏢 거래처별' },
                    { value: 'date', label: '📅 날짜별' },
                  ]
                } else if (sf === 'bank') {
                  options = [
                    { value: 'category_display', label: '📂 용도별' },
                    { value: 'category_accounting', label: '📂 회계기준별' },
                    { value: 'link', label: '🔗 연결별' },
                    { value: 'client', label: '🏢 거래처별' },
                    { value: 'income_expense', label: '💰 입출금별' },
                    { value: 'date', label: '📅 날짜별' },
                  ]
                } else if (sf === 'unclassified') {
                  options = [
                    { value: 'category_display', label: '📂 용도별' },
                    { value: 'category_accounting', label: '📂 회계기준별' },
                    { value: 'client', label: '🏢 거래처별' },
                    { value: 'date', label: '📅 날짜별' },
                  ]
                } else {
                  // 전체
                  options = [
                    { value: 'category_display', label: '📂 용도별' },
                    { value: 'category_accounting', label: '📂 회계기준별' },
                    { value: 'card', label: '💳 카드번호별' },
                    { value: 'link', label: '🔗 연결별' },
                    { value: 'vehicle', label: '🚙 차량별' },
                    { value: 'client', label: '🏢 거래처별' },
                    { value: 'income_expense', label: '💰 입출금별' },
                    { value: 'date', label: '📅 날짜별' },
                    { value: 'user', label: '👤 사용자별' },
                  ]
                }
              }

              return (
                <select
                  value={dropdownVal}
                  onChange={(e) => handleChange(e.target.value)}
                  style={{
                    padding: '6px 28px 6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800,
                    border: '1.5px solid #2d5fa8', color: '#0f172a', background: '#fff', cursor: 'pointer',
                    appearance: 'none',
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%232d5fa8\' stroke-width=\'3\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")',
                    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
                  }}>
                  {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )
            })()}
            {/* 용도별/회계기준은 드롭다운에 통합됨 */}
            {/* 검색 입력 */}
            <div style={{ marginLeft: 'auto', position: 'relative', flexShrink: 0 }}>
              <input
                type="text"
                placeholder="🔍 거래처, 메모 검색..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  padding: '6px 12px 6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: '1.5px solid #e2e8f0', background: '#fff', color: '#0f172a',
                  outline: 'none', width: 180, transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#2d5fa8' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0' }}
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#94a3b8',
                }}>✕</button>
              )}
            </div>
            <span style={{ fontSize: 12, color: '#2d5fa8', fontWeight: 600, flexShrink: 0 }}>
              분류 완료 {stats.pending - reviewUnclassifiedCount}/{stats.pending}건
            </span>
          </div>
        )}

        {/* ═══ 입금/출금/잔액 요약 카드 ═══ */}
        {(activeTab === 'classify' || activeTab === 'confirmed') && sourceFilteredItems.length > 0 && (
          <div style={{ display: 'flex', gap: 12, padding: '12px 0 4px 0' }}>
            <div style={{
              flex: 1, padding: '14px 18px', borderRadius: 12,
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              border: '1px solid #bfdbfe',
            }}>
              <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700, marginBottom: 4 }}>입금 합계</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#1e40af' }}>
                {summaryTotals.income.toLocaleString()}
                <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 2 }}>원</span>
              </div>
            </div>
            <div style={{
              flex: 1, padding: '14px 18px', borderRadius: 12,
              background: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)',
              border: '1px solid #fca5a5',
            }}>
              <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 700, marginBottom: 4 }}>출금 합계</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#991b1b' }}>
                {summaryTotals.expense.toLocaleString()}
                <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 2 }}>원</span>
              </div>
            </div>
            <div style={{
              flex: 1, padding: '14px 18px', borderRadius: 12,
              background: summaryTotals.net >= 0
                ? 'linear-gradient(135deg, #f0fdf4 0%, #bbf7d0 100%)'
                : 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)',
              border: summaryTotals.net >= 0 ? '1px solid #86efac' : '1px solid #fdba74',
            }}>
              <div style={{ fontSize: 11, color: summaryTotals.net >= 0 ? '#16a34a' : '#ea580c', fontWeight: 700, marginBottom: 4 }}>잔액 차이</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: summaryTotals.net >= 0 ? '#15803d' : '#c2410c' }}>
                {summaryTotals.net >= 0 ? '+' : ''}{summaryTotals.net.toLocaleString()}
                <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 2 }}>원</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 드래그 오버레이 (화면 전체) */}
      {isDragging && (
        <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
          style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '48px 64px', textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>
            <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>📥</span>
            <p style={{ fontWeight: 900, fontSize: 18, color: '#0f172a', margin: 0 }}>파일을 놓아주세요</p>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>엑셀, 영수증, PDF 지원</p>
          </div>
        </div>
      )}

      {/* AI Classification Result Banner */}
      {aiResult && (
        <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', border: '1px solid #bbf7d0', borderRadius: 14, padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🎉</span>
          <div>
            <p style={{ fontWeight: 800, fontSize: 13, color: '#166534', margin: 0 }}>AI 자동분류 완료</p>
            <p style={{ fontSize: 11, color: '#15803d', marginTop: 2 }}>총 {aiResult.total}건 중 {aiResult.updated}건이 AI에 의해 분류되었습니다</p>
          </div>
          <button onClick={() => setAiResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* AI Classifying Banner */}
      {aiClassifying && (
        <div style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '1px solid #c7d2fe', borderRadius: 14, padding: 20, marginBottom: 16, textAlign: 'center' }}>
          <div style={{ width: 28, height: 28, border: '3px solid #e0e7ff', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 800, fontSize: 13, color: '#4338ca', margin: 0 }}>🤖 AI가 거래 내역을 분석하고 있습니다...</p>
          <p style={{ fontSize: 11, color: '#6366f1', marginTop: 4 }}>세무 전문가 수준의 AI가 계정과목을 자동 분류합니다</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Upload Processing Banner */}
      {status === 'processing' && (
        <div style={{ marginBottom: 16, background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)', border: '1px solid #7dd3fc', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 24, height: 24, border: '3px solid #bae6fd', borderTopColor: '#0284c7', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontWeight: 800, color: '#0369a1', fontSize: 14 }}>AI 분석 진행 중</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '4px 10px', borderRadius: 8 }}>
              {totalFiles > 0 ? `파일 ${currentFileIndex + 1} / ${totalFiles}` : '처리 중...'}
            </span>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, height: 8, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg, #0284c7, #38bdf8)', borderRadius: 8, transition: 'width 0.5s ease', width: `${progress}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#0369a1', fontWeight: 600 }}>{logs || currentFileName}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0284c7' }}>{progress}%</span>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* 카드 등록 결과 배너 */}
      {(cardRegistrationResults.registered > 0 || cardRegistrationResults.updated > 0) && (
        <div style={{ marginBottom: 16, background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #86efac', borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🏦</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 800, fontSize: 13, color: '#166534', margin: 0 }}>법인카드 자동 등록 완료</p>
            <p style={{ fontSize: 11, color: '#15803d', marginTop: 2 }}>
              신규 {cardRegistrationResults.registered}장 / 업데이트 {cardRegistrationResults.updated}장
              {cardRegistrationResults.skipped > 0 ? ` / 스킵 ${cardRegistrationResults.skipped}장` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Content Area Based on Active Tab */}
      {activeTab === 'classify' && (
        <>
          {/* Upload Results */}
          {results.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              {/* 슬림 헤더: 분석 결과 + 저장/취소만 */}
              <div style={{ padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 12, color: '#0f172a' }}>
                    분석 결과 {filteredResults.length}건
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', background: '#fff', padding: '2px 7px', borderRadius: 5, border: '1px solid #e2e8f0' }}>
                    <input type="checkbox" checked={bulkMode} onChange={e => setBulkMode(e.target.checked)} style={{ width: 12, height: 12, cursor: 'pointer' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>일괄 변경</span>
                  </label>
                  <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                    {uploadStats.cardCount > 0 && `카드매칭 ${uploadStats.cardMatchedCount}/${uploadStats.cardCount}`}
                    {uploadStats.cardCount > 0 && uploadStats.classifiedCount > 0 && ' · '}
                    {uploadStats.classifiedCount > 0 && `분류 ${uploadStats.classifiedCount}/${results.length}`}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {uploadConfirmedIds.size > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981', padding: '2px 8px', background: '#ecfdf5', borderRadius: 4 }}>
                      ✅ {uploadConfirmedIds.size}건 확정
                    </span>
                  )}
                  <button onClick={() => {
                    // 거래처 학습 자동분류: 같은 거래처의 이미 분류된 항목 패턴을 미분류 항목에 적용
                    const clientCategoryMap: Record<string, { category: string; count: number }> = {}
                    for (const item of results) {
                      const cn = (item.client_name || '').trim()
                      if (!cn || !item.category || item.category === '미분류' || item.category === '기타') continue
                      if (!clientCategoryMap[cn]) clientCategoryMap[cn] = { category: item.category, count: 0 }
                      if (clientCategoryMap[cn].category === item.category) clientCategoryMap[cn].count++
                    }
                    let applied = 0
                    const toUpdate: { id: number; category: string }[] = []
                    for (const item of results) {
                      const cn = (item.client_name || '').trim()
                      if (!cn) continue
                      if (item.category && item.category !== '미분류' && item.category !== '기타') continue
                      const match = clientCategoryMap[cn]
                      if (match && match.count >= 1) {
                        toUpdate.push({ id: item.id, category: match.category })
                        applied++
                      }
                    }
                    if (applied > 0) {
                      for (const u of toUpdate) updateTransaction(u.id, 'category', u.category)
                      alert(`🧠 거래처 학습분류 완료: ${applied}건에 자동 분류를 적용했습니다.\n\n${Object.entries(clientCategoryMap).filter(([,v]) => v.count >= 1).slice(0, 5).map(([k, v]) => `  ${k} → ${v.category} (${v.count}건)`).join('\n')}${Object.keys(clientCategoryMap).length > 5 ? '\n  ...' : ''}`)
                    } else {
                      alert('적용할 거래처 패턴이 없습니다.\n(같은 거래처명으로 이미 분류된 항목이 필요합니다)')
                    }
                  }}
                    style={{ background: '#f0f9ff', color: '#2d5fa8', padding: '4px 10px', borderRadius: 6, fontWeight: 700, fontSize: 10, border: '1px solid #93c5fd', cursor: 'pointer' }}>
                    🧠 거래처 학습
                  </button>
                  <button onClick={handleBulkSave} style={{ background: '#2d5fa8', color: '#fff', padding: '4px 12px', borderRadius: 6, fontWeight: 700, fontSize: 10, border: 'none', cursor: 'pointer' }}>💾 확정 저장 {uploadConfirmedIds.size > 0 ? `(${uploadConfirmedIds.size}건)` : ''}</button>
                </div>
              </div>

              {/* ═══ 그룹 뷰: 카드번호별 ═══ */}
              {uploadGroupBy === 'card_number' && groupedByCard && (
                <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                  {groupedByCard.map(([cardNum, group]) => (
                    <div key={cardNum} style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', background: '#f8fafc', gap: 10, cursor: 'pointer' }}
                        onClick={() => toggleGroup(cardNum)}>
                        <input type="checkbox" style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#2d5fa8', flexShrink: 0 }}
                          checked={group.items.every((i: any) => uploadSelectedIds.has(i.id))}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            const ids = group.items.map((i: any) => i.id)
                            setUploadSelectedIds(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) ids.forEach((id: string) => next.add(id))
                              else ids.forEach((id: string) => next.delete(id))
                              return next
                            })
                          }} />
                        <div style={{ width: 4, height: 32, borderRadius: 4, background: group.isBank ? '#2d5fa8' : group.cardInfo ? '#f59e0b' : '#94a3b8', flexShrink: 0 }} />
                        <span style={{ fontSize: 16 }}>{group.isBank ? '🏦' : '💳'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', margin: 0 }}>
                            {group.isBank ? '통장/이체 거래' : group.cardInfo ? `${group.cardInfo.card_company} ****${(group.cardInfo.card_number || '').slice(-4)}` : cardNum}
                          </p>
                          {group.isBank && (
                            <p style={{ fontSize: 11, color: '#2d5fa8', margin: 0, marginTop: 1 }}>계좌이체, 자동이체, CMS 등 통장 거래 내역</p>
                          )}
                          {!group.isBank && group.cardInfo && (
                            <p style={{ fontSize: 11, color: '#64748b', margin: 0, marginTop: 1 }}>
                              사용자: <b style={{ color: '#0f172a' }}>{getCardDisplayName(group.cardInfo)}</b>
                              {group.cardInfo.assigned_employee_id ? (() => {
                                const emp = employees.find((e: any) => e.id === group.cardInfo.assigned_employee_id)
                                const empName = emp?.name || emp?.employee_name
                                const companyInfo = group.cardInfo.card_alias || group.cardInfo.holder_name
                                return companyInfo && companyInfo !== empName ? <span style={{ color: '#94a3b8' }}> ({companyInfo})</span> : null
                              })() : group.cardInfo.card_alias && group.cardInfo.card_alias !== group.cardInfo.holder_name ? <span style={{ color: '#94a3b8' }}> ({group.cardInfo.card_alias})</span> : null}
                            </p>
                          )}
                          {!group.isBank && !group.cardInfo && <p style={{ fontSize: 11, color: '#ef4444', margin: 0, marginTop: 1 }}>미등록 카드 — 법인카드 등록 후 매칭됩니다</p>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {group.isBank ? (() => {
                            const inc = group.items.filter(i => i.type === 'income').reduce((s, i) => s + Math.abs(i.amount || 0), 0)
                            const exp = group.items.filter(i => i.type === 'expense').reduce((s, i) => s + Math.abs(i.amount || 0), 0)
                            return (<>
                              <p style={{ fontWeight: 800, fontSize: 13, color: '#2563eb', margin: 0 }}>+{inc.toLocaleString()}원</p>
                              <p style={{ fontWeight: 800, fontSize: 13, color: '#dc2626', margin: 0 }}>-{exp.toLocaleString()}원</p>
                            </>)
                          })() : (
                            <p style={{ fontWeight: 800, fontSize: 14, color: '#111827', margin: 0 }}>{Math.abs(group.totalAmount).toLocaleString()}원</p>
                          )}
                          {(group as any).foreignAmounts && formatForeignAmounts((group as any).foreignAmounts) && (
                            <p style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, margin: 0 }}>({formatForeignAmounts((group as any).foreignAmounts)})</p>
                          )}
                          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{group.items.length}건</p>
                        </div>
                        <span style={{ fontSize: 12, color: '#94a3b8', transition: 'transform 0.2s', transform: expandedGroups.has(cardNum) ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                      </div>
                      {expandedGroups.has(cardNum) && (() => {
                        const cardLimit = groupItemLimits[cardNum] || GROUP_PAGE_SIZE
                        const cardVisibleItems = group.items.slice(0, cardLimit)
                        const cardHasMore = group.items.length > cardLimit
                        return (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', textAlign: 'left', fontSize: 12, borderCollapse: 'collapse' }}>
                            <tbody>
                              {cardVisibleItems.map(item => {
                                const isItemConfirmed = uploadConfirmedIds.has(item.id)
                                return (
                                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: isItemConfirmed ? 0.6 : 1, background: uploadSelectedIds.has(item.id) ? 'rgba(59,130,246,0.05)' : isItemConfirmed ? 'rgba(16,185,129,0.04)' : 'transparent' }} onMouseEnter={e => { if (!uploadSelectedIds.has(item.id)) e.currentTarget.style.background = isItemConfirmed ? 'rgba(16,185,129,0.06)' : 'rgba(79,70,229,0.03)' }} onMouseLeave={e => { e.currentTarget.style.background = uploadSelectedIds.has(item.id) ? 'rgba(59,130,246,0.05)' : isItemConfirmed ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
                                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                    {isItemConfirmed ? (
                                      <span title="확정됨" style={{ fontSize: 11, color: '#10b981', cursor: 'pointer' }} onClick={() => { const next = new Set(uploadConfirmedIds); next.delete(item.id); setUploadConfirmedIds(next) }}>✅</span>
                                    ) : (
                                      <input type="checkbox" checked={uploadSelectedIds.has(item.id)} onChange={() => toggleUploadSelect(item.id)} style={{ width: 13, height: 13, cursor: 'pointer', accentColor: '#2d5fa8' }} />
                                    )}
                                  </td>
                                  <td style={{ padding: '8px 12px', width: 80, color: '#6b7280', fontSize: 12, whiteSpace: 'nowrap' }}>{item.transaction_date}</td>
                                  <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{item.client_name}</td>
                                  <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: 12 }}>{item.description}</td>
                                  <td style={{ padding: '4px 6px', position: 'relative' }}>
                                    {(() => {
                                      const catParts = getCategoryParts(item.category, categoryMode)
                                      const isUnclassified = !catParts.group
                                      const isOpen = openCategoryId === item.id
                                      const groupColor = catParts.group ? (CATEGORY_COLORS[catParts.group] || '#94a3b8') : ''
                                      const groupIcon = catParts.item ? (CATEGORY_ICONS[catParts.item] || '📋') : '❓'
                                      return (
                                        <div style={{ position: 'relative' }}>
                                          <div onClick={(e) => { if (isOpen) { setOpenCategoryId(null); setCatPopoverPos(null) } else { setOpenCategoryId(item.id); setCatPopoverStep(catParts.group ? 'item' : 'group'); setCatPopoverGroup(catParts.group); setCatPopoverPos(calcPopPos(e.currentTarget)) } }}
                                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 6px', cursor: 'pointer', border: isUnclassified ? '1.5px dashed #f87171' : '1px solid #e2e8f0', borderRadius: 6, background: isUnclassified ? '#fef2f2' : '#fff' }}>
                                            {isUnclassified ? (
                                              <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', flex: 1 }}>❓ 미분류</span>
                                            ) : (<>
                                              <span style={{ fontSize: 12, flexShrink: 0 }}>{groupIcon}</span>
                                              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                                <div style={{ fontSize: 9, fontWeight: 700, color: groupColor, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{catParts.group.replace(/^[^\s]+\s/, '')}</div>
                                                <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{catParts.item || '(미지정)'}</div>
                                              </div>
                                            </>)}
                                            <span style={{ fontSize: 8, color: '#94a3b8', flexShrink: 0 }}>▼</span>
                                          </div>
                                          {isOpen && catPopoverPos && (<>
                                            <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => { setOpenCategoryId(null); setCatPopoverPos(null) }} />
                                            <div style={{ position: 'fixed', top: catPopoverPos.top, left: catPopoverPos.left, zIndex: 99, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 25px rgba(0,0,0,0.15)', minWidth: 220, maxHeight: 340, overflowY: 'auto' }}>
                                              {catPopoverStep === 'group' ? (<>
                                                <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 800, color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>① 중그룹 선택</div>
                                                {[...(categoryMode === 'display' ? DISPLAY_CATEGORIES : CATEGORIES), ...customCategories.map(c => ({ group: c.group, items: c.items.map(i => ({ label: i })) }))].map(g => (
                                                  <button key={g.group} onClick={() => { setCatPopoverGroup(g.group); setCatPopoverStep('item') }}
                                                    style={{ width: '100%', padding: '8px 12px', border: 'none', background: catParts.group === g.group ? '#eff6ff' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, borderLeft: catParts.group === g.group ? `3px solid ${CATEGORY_COLORS[g.group] || '#94a3b8'}` : '3px solid transparent' }}
                                                    onMouseEnter={e => { if (catParts.group !== g.group) e.currentTarget.style.background = '#f8fafc' }}
                                                    onMouseLeave={e => { if (catParts.group !== g.group) e.currentTarget.style.background = 'transparent' }}>
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: CATEGORY_COLORS[g.group] || '#94a3b8', flexShrink: 0 }} />{g.group}
                                                  </button>
                                                ))}
                                              </>) : (<>
                                                <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                  <button onClick={() => setCatPopoverStep('group')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#2d5fa8', padding: 0 }}>←</button>
                                                  ② 세부항목
                                                </div>
                                                <button onClick={() => { handleUpdateItem(item.id, 'category', catPopoverGroup, item); setOpenCategoryId(null) }}
                                                  style={{ width: '100%', padding: '7px 12px', border: 'none', background: !catParts.item ? '#fffbeb' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#92400e', borderBottom: '1px solid #f1f5f9' }}>
                                                  📂 중그룹만 (미지정)
                                                </button>
                                                {[...getItemsForGroup(catPopoverGroup, categoryMode), ...(customCategories.find(c => c.group === catPopoverGroup)?.items || [])].map(c => (
                                                  <button key={c} onClick={() => { handleUpdateItem(item.id, 'category', c, item); setOpenCategoryId(null) }}
                                                    style={{ width: '100%', padding: '7px 12px', border: 'none', background: catParts.item === c ? '#eff6ff' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, borderLeft: catParts.item === c ? '3px solid #2d5fa8' : '3px solid transparent' }}
                                                    onMouseEnter={e => { if (catParts.item !== c) e.currentTarget.style.background = '#f8fafc' }}
                                                    onMouseLeave={e => { if (catParts.item !== c) e.currentTarget.style.background = 'transparent' }}>
                                                    <span style={{ fontSize: 12 }}>{CATEGORY_ICONS[c] || '📋'}</span>{c}
                                                    {catParts.item === c && <span style={{ marginLeft: 'auto', color: '#2d5fa8', fontSize: 11 }}>✓</span>}
                                                  </button>
                                                ))}
                                              </>)}
                                            </div>
                                          </>)}
                                        </div>
                                      )
                                    })()}
                                  </td>
                                  <td style={{ padding: '4px 8px', position: 'relative' }}>
                                    {(() => {
                                      const rd = getRelatedDisplay(item.related_type, item.related_id)
                                      const isOpen = openRelatedId === item.id
                                      const _fGroups = getFilteredRelatedGroups(item.category)
                                      const _hasRelOpts = !_fGroups || relatedOptions.some(rg => _fGroups.includes(rg.group))
                                      return (
                                        <div style={{ position: 'relative' }}>
                                          <button onClick={(e) => { if (!_hasRelOpts && !rd) return; if (isOpen) { setOpenRelatedId(null); setRelPopoverPos(null) } else { setOpenRelatedId(item.id); setRelPopoverPos(calcPopPos(e.currentTarget, 320)) } }} style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', fontSize: 11, background: rd ? '#f8fafc' : '#fff', color: '#4b5563', cursor: (!_hasRelOpts && !rd) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, textAlign: 'left', outline: 'none', minHeight: 32 }}>
                                            {rd ? (
                                              <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                  <span>{rd.icon}</span>
                                                  <span style={{ fontWeight: 700, fontSize: 11, color: rd.color || '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rd.label}</span>
                                                </div>
                                                {rd.detail && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rd.detail}</div>}
                                              </div>
                                            ) : (
                                              <span style={{ flex: 1, color: _hasRelOpts ? '#f59e0b' : '#d1d5db', fontSize: 11, fontWeight: _hasRelOpts ? 600 : 400 }}>{_hasRelOpts ? '⚠ 연결 없음' : '—'}</span>
                                            )}
                                            {(_hasRelOpts || rd) && <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>▼</span>}
                                          </button>
                                          {isOpen && relPopoverPos && (
                                            <>
                                              <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => { setOpenRelatedId(null); setRelPopoverPos(null) }} />
                                              <div style={{ position: 'fixed', top: relPopoverPos.top, left: relPopoverPos.left, zIndex: 99, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 25px rgba(0,0,0,0.15)', minWidth: 240, maxHeight: 320, overflowY: 'auto' }}>
                                                <button onClick={() => { handleUpdateItem(item.id, 'related_composite', '', item); setOpenRelatedId(null); setRelPopoverPos(null) }} style={{ width: '100%', padding: '8px 12px', border: 'none', background: !rd ? '#f1f5f9' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = !rd ? '#f1f5f9' : 'transparent'}>
                                                  <span style={{ fontSize: 12 }}>✕</span> 연결 해제
                                                </button>
                                                {relatedOptions.filter(rg => { const _ag = getFilteredRelatedGroups(item.category); return !_ag || _ag.includes(rg.group) }).map(group => (
                                                  <div key={group.group}>
                                                    <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>{group.icon} {group.group}</div>
                                                    {group.items.map(opt => {
                                                      const selected = item.related_id ? `${item.related_type}_${item.related_id}` === opt.value : false
                                                      return (
                                                        <button key={opt.value} onClick={() => { handleUpdateItem(item.id, 'related_composite', opt.value, item); setOpenRelatedId(null); setRelPopoverPos(null) }} style={{ width: '100%', padding: '6px 12px', border: 'none', background: selected ? '#eff6ff' : 'transparent', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, borderLeft: selected ? `3px solid ${opt.color}` : '3px solid transparent' }} onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#f8fafc' }} onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}>
                                                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                                                          <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: 11, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</div>
                                                            <div style={{ fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.sub}</div>
                                                          </div>
                                                          {selected && <span style={{ fontSize: 11, color: opt.color }}>✓</span>}
                                                        </button>
                                                      )
                                                    })}
                                                  </div>
                                                ))}
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      )
                                    })()}
                                  </td>
                                  {(() => { const ad = getAmountDisplay(item); return (
                                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: ad.color }}>
                                    {ad.prefix && <span style={{ fontSize: 10, color: ad.prefixColor, marginRight: 4 }}>{ad.prefix}</span>}
                                    {ad.isForeign && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: '#fef3c7', color: '#92400e', marginRight: 4 }}>{ad.currency}</span>}
                                    {ad.text}
                                    {ad.originalText && <div style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>({ad.originalText})</div>}
                                  </td>
                                  )})()}
                                  <td style={{ padding: '8px 12px', textAlign: 'center', width: 36 }}>
                                    <button onClick={() => deleteTransaction(item.id)} style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 16 }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = '#d1d5db'}>×</button>
                                  </td>
                                </tr>
                              )})}
                            </tbody>
                          </table>
                          {cardHasMore && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 16px', gap: 8, borderTop: '1px solid #e2e8f0', background: '#fafbfc' }}>
                              <button onClick={(e) => { e.stopPropagation(); setGroupItemLimits(prev => ({ ...prev, [cardNum]: cardLimit + GROUP_PAGE_SIZE })) }}
                                style={{ background: '#2d5fa8', color: '#fff', padding: '6px 16px', borderRadius: 6, fontWeight: 700, fontSize: 11, border: 'none', cursor: 'pointer' }}>
                                더보기 ({cardLimit}/{group.items.length}건)
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setGroupItemLimits(prev => ({ ...prev, [cardNum]: group.items.length })) }}
                                style={{ background: '#fff', color: '#64748b', padding: '6px 12px', borderRadius: 6, fontWeight: 600, fontSize: 11, border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                                전체보기
                              </button>
                            </div>
                          )}
                        </div>
                        )})()}
                    </div>
                  ))}
                </div>
              )}

              {/* ═══ 그룹 뷰: 카테고리별 ═══ */}
              {uploadGroupBy === 'category' && groupedByCategory && (
                <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                  {groupedByCategory.map(([cat, group]) => {
                    const isDisplayMode = categoryMode === 'display'
                    const groupColor = CATEGORY_COLORS[cat] || '#64748b'
                    // 용도별 모드: cat은 DISPLAY_CATEGORIES의 그룹명 (이미 아이콘 포함)
                    // 회계 모드: cat은 개별 카테고리명
                    const icon = isDisplayMode ? '' : (CATEGORY_ICONS[cat] || '📋')
                    const groupName = isDisplayMode ? '' : getCategoryGroup(cat, 'accounting')
                    const subGroups = isDisplayMode && (group as any).subGroups ? Object.entries((group as any).subGroups as Record<string, { items: typeof filteredResults; totalAmount: number }>) : null

                    return (
                      <div key={cat} style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', background: '#f8fafc', gap: 10, cursor: 'pointer' }}
                          onClick={() => toggleGroup(cat)}>
                          <input type="checkbox" style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#2d5fa8', flexShrink: 0 }}
                            checked={group.items.length > 0 && group.items.every((i: any) => uploadSelectedIds.has(i.id))}
                            onClick={e => e.stopPropagation()}
                            onChange={e => {
                              const ids = group.items.map((i: any) => i.id)
                              setUploadSelectedIds(prev => {
                                const next = new Set(prev)
                                if (e.target.checked) ids.forEach((id: string) => next.add(id))
                                else ids.forEach((id: string) => next.delete(id))
                                return next
                              })
                            }} />
                          <div style={{ width: 4, height: 32, borderRadius: 4, background: groupColor, flexShrink: 0 }} />
                          {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', margin: 0 }}>{cat}</p>
                            {groupName && <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, marginTop: 1 }}>{groupName}</p>}
                            {isDisplayMode && subGroups && (
                              <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, marginTop: 1 }}>
                                {subGroups.map(([k]) => k).join(' · ')}
                              </p>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontWeight: 800, fontSize: 14, color: '#111827', margin: 0 }}>{Math.abs(group.totalAmount).toLocaleString()}원</p>
                            {(group as any).foreignAmounts && formatForeignAmounts((group as any).foreignAmounts) && (
                              <p style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, margin: 0 }}>({formatForeignAmounts((group as any).foreignAmounts)})</p>
                            )}
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{group.items.length}건</p>
                          </div>
                          <span style={{ fontSize: 12, color: '#94a3b8', transition: 'transform 0.2s', transform: expandedGroups.has(cat) ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                        </div>
                        {expandedGroups.has(cat) && (() => {
                          const catLimit = groupItemLimits[cat] || GROUP_PAGE_SIZE
                          // 용도별 모드: 서브그룹별로 정렬 후 표시
                          const sortedItems = isDisplayMode && subGroups
                            ? subGroups.flatMap(([, sg]) => sg.items)
                            : group.items
                          const catVisibleItems = sortedItems.slice(0, catLimit)
                          const catHasMore = sortedItems.length > catLimit
                          // 서브그룹 경계 인덱스 계산 (용도별 모드)
                          const subGroupBounds: Record<number, { name: string; count: number; amount: number; itemIds: string[] }> = {}
                          if (isDisplayMode && subGroups) {
                            let idx = 0
                            for (const [sgName, sg] of subGroups) {
                              if (idx < catLimit) subGroupBounds[idx] = { name: sgName, count: sg.items.length, amount: sg.totalAmount, itemIds: sg.items.map((i: any) => i.id) }
                              idx += sg.items.length
                            }
                          }
                          const renderGroupedItemRow = (item: any) => {
                            const isItemConfirmed = uploadConfirmedIds.has(item.id)
                            return (
                            <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: isItemConfirmed ? 0.6 : 1, background: uploadSelectedIds.has(item.id) ? 'rgba(59,130,246,0.05)' : isItemConfirmed ? 'rgba(16,185,129,0.04)' : 'transparent' }} onMouseEnter={e => { if (!uploadSelectedIds.has(item.id)) e.currentTarget.style.background = isItemConfirmed ? 'rgba(16,185,129,0.06)' : 'rgba(79,70,229,0.03)' }} onMouseLeave={e => { e.currentTarget.style.background = uploadSelectedIds.has(item.id) ? 'rgba(59,130,246,0.05)' : isItemConfirmed ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
                              <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                {isItemConfirmed ? (
                                  <span title="확정됨" style={{ fontSize: 11, color: '#10b981', cursor: 'pointer' }} onClick={() => { const next = new Set(uploadConfirmedIds); next.delete(item.id); setUploadConfirmedIds(next) }}>✅</span>
                                ) : (
                                  <input type="checkbox" checked={uploadSelectedIds.has(item.id)} onChange={() => toggleUploadSelect(item.id)} style={{ width: 13, height: 13, cursor: 'pointer', accentColor: '#2d5fa8' }} />
                                )}
                              </td>
                              <td style={{ padding: '8px 12px', width: 80, color: '#6b7280', whiteSpace: 'nowrap', fontSize: 10 }}>{item.transaction_date}</td>
                              <td style={{ padding: '8px 12px' }}>
                                {(item.payment_method === '카드' || item.payment_method === 'Card') ? (
                                  <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#b45309' }}>💳</span>
                                ) : (
                                  <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: item.type === 'income' ? '#dbeafe' : '#fee2e2', color: item.type === 'income' ? '#1e40af' : '#991b1b' }}>
                                    {item.type === 'income' ? '🔵' : '🔴'}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{item.client_name}</td>
                              <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: 11 }}>{item.description}</td>
                              <td style={{ padding: '6px 8px', fontSize: 11 }}>
                                {item.card_id && getCardDisplayInfo(item.card_id) ? (
                                  <span style={{ padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 600, fontSize: 10 }}>
                                    {getCardDisplayInfo(item.card_id)!.holder}
                                  </span>
                                ) : (item as any).matched_employee_name ? (
                                  <span style={{ padding: '2px 6px', borderRadius: 4, background: '#dbeafe', color: '#1e40af', fontWeight: 600, fontSize: 10 }}>
                                    {(item as any).matched_employee_name}
                                  </span>
                                ) : null}
                              </td>
                              <td style={{ padding: '4px 8px', position: 'relative' }}>
                                {(() => {
                                  const rd = getRelatedDisplay(item.related_type, item.related_id)
                                  const isOpen = openRelatedId === item.id
                                  const _fGroups = getFilteredRelatedGroups(item.category)
                                  const _hasRelOpts = !_fGroups || relatedOptions.some(rg => _fGroups.includes(rg.group))
                                  return (
                                    <div style={{ position: 'relative' }}>
                                      <button onClick={(e) => { if (!_hasRelOpts && !rd) return; if (isOpen) { setOpenRelatedId(null); setRelPopoverPos(null) } else { setOpenRelatedId(item.id); setRelPopoverPos(calcPopPos(e.currentTarget, 320)) } }} style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', fontSize: 11, background: rd ? '#f8fafc' : '#fff', color: '#4b5563', cursor: (!_hasRelOpts && !rd) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, textAlign: 'left', outline: 'none', minHeight: 32 }}>
                                        {rd ? (
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                              <span>{rd.icon}</span>
                                              <span style={{ fontWeight: 700, fontSize: 11, color: rd.color || '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rd.label}</span>
                                            </div>
                                            {rd.detail && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rd.detail}</div>}
                                          </div>
                                        ) : (
                                          <span style={{ flex: 1, color: _hasRelOpts ? '#f59e0b' : '#d1d5db', fontSize: 11, fontWeight: _hasRelOpts ? 600 : 400 }}>{_hasRelOpts ? '⚠ 연결 없음' : '—'}</span>
                                        )}
                                        {(_hasRelOpts || rd) && <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>▼</span>}
                                      </button>
                                      {isOpen && relPopoverPos && (
                                        <>
                                          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => { setOpenRelatedId(null); setRelPopoverPos(null) }} />
                                          <div style={{ position: 'fixed', top: relPopoverPos.top, left: relPopoverPos.left, zIndex: 99, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 25px rgba(0,0,0,0.15)', minWidth: 240, maxHeight: 320, overflowY: 'auto' }}>
                                            <button onClick={() => { handleUpdateItem(item.id, 'related_composite', '', item); setOpenRelatedId(null); setRelPopoverPos(null) }} style={{ width: '100%', padding: '8px 12px', border: 'none', background: !rd ? '#f1f5f9' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = !rd ? '#f1f5f9' : 'transparent'}>
                                              <span style={{ fontSize: 12 }}>✕</span> 연결 해제
                                            </button>
                                            {relatedOptions.filter(rg => { const _ag = getFilteredRelatedGroups(item.category); return !_ag || _ag.includes(rg.group) }).map(group => (
                                              <div key={group.group}>
                                                <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>{group.icon} {group.group}</div>
                                                {group.items.map(opt => {
                                                  const selected = item.related_id ? `${item.related_type}_${item.related_id}` === opt.value : false
                                                  return (
                                                    <button key={opt.value} onClick={() => { handleUpdateItem(item.id, 'related_composite', opt.value, item); setOpenRelatedId(null); setRelPopoverPos(null) }} style={{ width: '100%', padding: '6px 12px', border: 'none', background: selected ? '#eff6ff' : 'transparent', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, borderLeft: selected ? `3px solid ${opt.color}` : '3px solid transparent' }} onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#f8fafc' }} onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}>
                                                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                                                      <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 11, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</div>
                                                        <div style={{ fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.sub}</div>
                                                      </div>
                                                      {selected && <span style={{ fontSize: 11, color: opt.color }}>✓</span>}
                                                    </button>
                                                  )
                                                })}
                                              </div>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )
                                })()}
                              </td>
                              {(() => { const ad = getAmountDisplay(item); return (
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: ad.color }}>
                                {ad.prefix && <span style={{ fontSize: 10, color: ad.prefixColor, marginRight: 4 }}>{ad.prefix}</span>}
                                {ad.isForeign && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: '#fef3c7', color: '#92400e', marginRight: 4 }}>{ad.currency}</span>}
                                {ad.text}
                                {ad.originalText && <div style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>({ad.originalText})</div>}
                              </td>
                              )})()}
                              <td style={{ padding: '8px 12px', textAlign: 'center', width: 36 }}>
                                <button onClick={() => deleteTransaction(item.id)} style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 16 }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = '#d1d5db'}>×</button>
                              </td>
                            </tr>
                          )}
                          return (
                          <div>
                            {isDisplayMode && subGroups ? (() => {
                              let remaining = catLimit
                              return subGroups.map(([sgName, sg]) => {
                                if (remaining <= 0) return null
                                const sgItemIds = sg.items.map((i: any) => i.id)
                                const sgVisible = sg.items.slice(0, remaining)
                                remaining -= sg.items.length
                                return (
                                  <div key={sgName}>
                                    {/* Sticky sub-group header - div outside table for proper sticky behavior */}
                                    <div style={{ position: 'sticky', top: 0, zIndex: 5, background: '#f0f4ff', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderBottom: '1px solid #e2e8f0' }}>
                                      <input type="checkbox" style={{ width: 13, height: 13, cursor: 'pointer', accentColor: '#2d5fa8', marginLeft: 8 }}
                                        checked={sgItemIds.length > 0 && sgItemIds.every((id: string) => uploadSelectedIds.has(id))}
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => {
                                          setUploadSelectedIds(prev => {
                                            const next = new Set(prev)
                                            if (e.target.checked) sgItemIds.forEach((id: string) => next.add(id))
                                            else sgItemIds.forEach((id: string) => next.delete(id))
                                            return next
                                          })
                                        }} />
                                      <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>
                                        {CATEGORY_ICONS[sgName] || '📋'} {sgName}
                                      </span>
                                      <span style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8' }}>{sg.items.length}건 · {Math.abs(sg.totalAmount).toLocaleString()}원</span>
                                      {sg.foreignAmounts && formatForeignAmounts(sg.foreignAmounts) && (
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginLeft: 4 }}>({formatForeignAmounts(sg.foreignAmounts)})</span>
                                      )}
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                      <table style={{ width: '100%', textAlign: 'left', fontSize: 12, borderCollapse: 'collapse' }}>
                                        <tbody>
                                          {sgVisible.map((item: any) => renderGroupedItemRow(item))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )
                              })
                            })() : (
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', textAlign: 'left', fontSize: 12, borderCollapse: 'collapse' }}>
                                  <tbody>
                                    {catVisibleItems.map((item: any) => renderGroupedItemRow(item))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {catHasMore && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 16px', gap: 8, borderTop: '1px solid #e2e8f0', background: '#fafbfc' }}>
                                <button onClick={(e) => { e.stopPropagation(); setGroupItemLimits(prev => ({ ...prev, [cat]: catLimit + GROUP_PAGE_SIZE })) }}
                                  style={{ background: '#2d5fa8', color: '#fff', padding: '6px 16px', borderRadius: 6, fontWeight: 700, fontSize: 11, border: 'none', cursor: 'pointer' }}>
                                  더보기 ({catLimit}/{sortedItems.length}건)
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setGroupItemLimits(prev => ({ ...prev, [cat]: sortedItems.length })) }}
                                  style={{ background: '#fff', color: '#64748b', padding: '6px 12px', borderRadius: 6, fontWeight: 600, fontSize: 11, border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                                  전체보기
                                </button>
                              </div>
                            )}
                          </div>
                          )})()}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ═══ 그룹 뷰: 차량별 ═══ */}
              {uploadGroupBy === 'vehicle' && groupedByVehicle && (
                <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                  {groupedByVehicle.map(([label, group]) => (
                    <div key={label} style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', background: '#f8fafc', gap: 10, cursor: 'pointer' }}
                        onClick={() => toggleGroup(label)}>
                        <div style={{ width: 4, height: 32, borderRadius: 4, background: group.carInfo ? '#f59e0b' : '#94a3b8', flexShrink: 0 }} />
                        <span style={{ fontSize: 16 }}>{label.startsWith('🚛') ? '🚛' : '🏢'}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', margin: 0 }}>{label}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontWeight: 800, fontSize: 14, color: '#111827', margin: 0 }}>{Math.abs(group.totalAmount).toLocaleString()}원</p>
                          {(group as any).foreignAmounts && formatForeignAmounts((group as any).foreignAmounts) && (
                            <p style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, margin: 0 }}>({formatForeignAmounts((group as any).foreignAmounts)})</p>
                          )}
                          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{group.items.length}건</p>
                        </div>
                        <span style={{ fontSize: 12, color: '#94a3b8', transition: 'transform 0.2s', transform: expandedGroups.has(label) ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                      </div>
                      {expandedGroups.has(label) && (() => {
                        const vLimit = groupItemLimits[label] || GROUP_PAGE_SIZE
                        const vVisibleItems = group.items.slice(0, vLimit)
                        const vHasMore = group.items.length > vLimit
                        return (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', textAlign: 'left', fontSize: 12, borderCollapse: 'collapse' }}>
                            <tbody>
                              {vVisibleItems.map(item => {
                                const isItemConfirmed = uploadConfirmedIds.has(item.id)
                                return (
                                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: isItemConfirmed ? 0.6 : 1, background: uploadSelectedIds.has(item.id) ? 'rgba(59,130,246,0.05)' : isItemConfirmed ? 'rgba(16,185,129,0.04)' : 'transparent' }} onMouseEnter={e => { if (!uploadSelectedIds.has(item.id)) e.currentTarget.style.background = isItemConfirmed ? 'rgba(16,185,129,0.06)' : 'rgba(79,70,229,0.03)' }} onMouseLeave={e => { e.currentTarget.style.background = uploadSelectedIds.has(item.id) ? 'rgba(59,130,246,0.05)' : isItemConfirmed ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
                                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                    {isItemConfirmed ? (
                                      <span title="확정됨" style={{ fontSize: 11, color: '#10b981', cursor: 'pointer' }} onClick={() => { const next = new Set(uploadConfirmedIds); next.delete(item.id); setUploadConfirmedIds(next) }}>✅</span>
                                    ) : (
                                      <input type="checkbox" checked={uploadSelectedIds.has(item.id)} onChange={() => toggleUploadSelect(item.id)} style={{ width: 13, height: 13, cursor: 'pointer', accentColor: '#2d5fa8' }} />
                                    )}
                                  </td>
                                  <td style={{ padding: '8px 12px', width: 80, color: '#6b7280', whiteSpace: 'nowrap', fontSize: 10 }}>{item.transaction_date}</td>
                                  <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{item.client_name}</td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#f0fdf4', color: '#16a34a' }}>
                                      {categoryMode === 'display'
                                        ? getCategoryGroup(item.category || '미분류', 'display')
                                        : `${CATEGORY_ICONS[item.category || ''] || '📋'} ${item.category || '미분류'}`}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: 11 }}>{item.description}</td>
                                  <td style={{ padding: '4px 8px', position: 'relative' }}>
                                    {(() => {
                                      const rd = getRelatedDisplay(item.related_type, item.related_id)
                                      const isOpen = openRelatedId === item.id
                                      const _fGroups = getFilteredRelatedGroups(item.category)
                                      const _hasRelOpts = !_fGroups || relatedOptions.some(rg => _fGroups.includes(rg.group))
                                      return (
                                        <div style={{ position: 'relative' }}>
                                          <button onClick={(e) => { if (!_hasRelOpts && !rd) return; if (isOpen) { setOpenRelatedId(null); setRelPopoverPos(null) } else { setOpenRelatedId(item.id); setRelPopoverPos(calcPopPos(e.currentTarget, 320)) } }} style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', fontSize: 11, background: rd ? '#f8fafc' : '#fff', color: '#4b5563', cursor: (!_hasRelOpts && !rd) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, textAlign: 'left', outline: 'none', minHeight: 32 }}>
                                            {rd ? (
                                              <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                  <span>{rd.icon}</span>
                                                  <span style={{ fontWeight: 700, fontSize: 11, color: rd.color || '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rd.label}</span>
                                                </div>
                                                {rd.detail && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rd.detail}</div>}
                                              </div>
                                            ) : (
                                              <span style={{ flex: 1, color: _hasRelOpts ? '#f59e0b' : '#d1d5db', fontSize: 11, fontWeight: _hasRelOpts ? 600 : 400 }}>{_hasRelOpts ? '⚠ 연결 없음' : '—'}</span>
                                            )}
                                            {(_hasRelOpts || rd) && <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>▼</span>}
                                          </button>
                                          {isOpen && relPopoverPos && (
                                            <>
                                              <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => { setOpenRelatedId(null); setRelPopoverPos(null) }} />
                                              <div style={{ position: 'fixed', top: relPopoverPos.top, left: relPopoverPos.left, zIndex: 99, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 25px rgba(0,0,0,0.15)', minWidth: 240, maxHeight: 320, overflowY: 'auto' }}>
                                                <button onClick={() => { handleUpdateItem(item.id, 'related_composite', '', item); setOpenRelatedId(null); setRelPopoverPos(null) }} style={{ width: '100%', padding: '8px 12px', border: 'none', background: !rd ? '#f1f5f9' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = !rd ? '#f1f5f9' : 'transparent'}>
                                                  <span style={{ fontSize: 12 }}>✕</span> 연결 해제
                                                </button>
                                                {relatedOptions.filter(rg => { const _ag = getFilteredRelatedGroups(item.category); return !_ag || _ag.includes(rg.group) }).map(group => (
                                                  <div key={group.group}>
                                                    <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>{group.icon} {group.group}</div>
                                                    {group.items.map(opt => {
                                                      const selected = item.related_id ? `${item.related_type}_${item.related_id}` === opt.value : false
                                                      return (
                                                        <button key={opt.value} onClick={() => { handleUpdateItem(item.id, 'related_composite', opt.value, item); setOpenRelatedId(null); setRelPopoverPos(null) }} style={{ width: '100%', padding: '6px 12px', border: 'none', background: selected ? '#eff6ff' : 'transparent', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, borderLeft: selected ? `3px solid ${opt.color}` : '3px solid transparent' }} onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#f8fafc' }} onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}>
                                                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                                                          <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: 11, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</div>
                                                            <div style={{ fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.sub}</div>
                                                          </div>
                                                          {selected && <span style={{ fontSize: 11, color: opt.color }}>✓</span>}
                                                        </button>
                                                      )
                                                    })}
                                                  </div>
                                                ))}
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      )
                                    })()}
                                  </td>
                                  {(() => { const ad = getAmountDisplay(item); return (
                                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: ad.color }}>
                                    {ad.prefix && <span style={{ fontSize: 10, color: ad.prefixColor, marginRight: 4 }}>{ad.prefix}</span>}
                                    {ad.isForeign && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: '#fef3c7', color: '#92400e', marginRight: 4 }}>{ad.currency}</span>}
                                    {ad.text}
                                    {ad.originalText && <div style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>({ad.originalText})</div>}
                                  </td>
                                  )})()}
                                  <td style={{ padding: '8px 12px', textAlign: 'center', width: 36 }}>
                                    <button onClick={() => deleteTransaction(item.id)} style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 16 }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = '#d1d5db'}>×</button>
                                  </td>
                                </tr>
                              )})}
                            </tbody>
                          </table>
                          {vHasMore && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 16px', gap: 8, borderTop: '1px solid #e2e8f0', background: '#fafbfc' }}>
                              <button onClick={(e) => { e.stopPropagation(); setGroupItemLimits(prev => ({ ...prev, [label]: vLimit + GROUP_PAGE_SIZE })) }}
                                style={{ background: '#2d5fa8', color: '#fff', padding: '6px 16px', borderRadius: 6, fontWeight: 700, fontSize: 11, border: 'none', cursor: 'pointer' }}>
                                더보기 ({vLimit}/{group.items.length}건)
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setGroupItemLimits(prev => ({ ...prev, [label]: group.items.length })) }}
                                style={{ background: '#fff', color: '#64748b', padding: '6px 12px', borderRadius: 6, fontWeight: 600, fontSize: 11, border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                                전체보기
                              </button>
                            </div>
                          )}
                        </div>
                        )})()}
                    </div>
                  ))}
                </div>
              )}

              {/* 통장 요약은 B1 하단 요약바로 통합 — 여기서는 제거 */}

              {/* ═══ 미분류 수동 정리 배너 ═══ */}
              {uploadSubFilter === 'unclassified' && uploadStats.unclassifiedCount > 0 && (
                <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, #fef2f2, #fff1f2)', borderBottom: '1px solid #fecaca', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, color: '#991b1b', margin: 0 }}>
                      ❓ 미분류 거래 {uploadStats.unclassifiedCount}건
                    </p>
                    <p style={{ fontSize: 11, color: '#b91c1c', marginTop: 2, margin: '2px 0 0' }}>
                      아래 계정과목 드롭다운에서 직접 변경하거나, AI 재분류를 시도하세요
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={async () => {
                        if (!confirm('미분류 거래를 AI로 재분류하시겠습니까?')) return
                        // 미분류 거래만 모아서 classify API로 보내기
                        const unclassifiedItems = results.filter(r => !r.category || r.category === '미분류' || r.category === '기타')
                        if (unclassifiedItems.length === 0) return alert('미분류 거래가 없습니다.')

                        try {
                          const { data: { session } } = await supabase.auth.getSession()
                          for (const item of unclassifiedItems) {
                            const payload = {
                              company_id: effectiveCompanyId,
                              items: [{
                                transaction_date: item.transaction_date,
                                type: item.type,
                                client_name: item.client_name,
                                description: item.description,
                                amount: item.amount,
                                payment_method: item.payment_method,
                                card_number: item.card_number,
                              }],
                            }
                            const res = await fetch('/api/finance/classify', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                              },
                              body: JSON.stringify(payload),
                            })
                            if (res.ok) {
                              const data = await res.json()
                              if (data.results?.[0]?.category) {
                                updateTransaction(item.id, 'category', data.results[0].category)
                              }
                            }
                          }
                          alert(`AI 재분류 완료! ${unclassifiedItems.length}건 처리됨`)
                        } catch (e) {
                          console.error('AI 재분류 오류:', e)
                          alert('AI 재분류 중 오류가 발생했습니다.')
                        }
                      }}
                      style={{ padding: '8px 16px', borderRadius: 8, background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      🤖 AI 재분류
                    </button>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {['유류비', '복리후생(식대)', '수수료/카드수수료', '소모품/사무용품', '접대비'].map(cat => (
                        <button key={cat} onClick={() => {
                          const items = results.filter(r => !r.category || r.category === '미분류' || r.category === '기타')
                          // 미분류 전체에 적용하지 않고, 빠른 선택용 도구
                          if (items.length > 0 && confirm(`미분류 전체 ${items.length}건을 "${cat}"로 일괄 변경하시겠습니까?`)) {
                            items.forEach(item => updateTransaction(item.id, 'category', cat))
                          }
                        }}
                          style={{ padding: '4px 8px', borderRadius: 6, background: '#fff', border: '1px solid #e5e7eb', fontSize: 10, fontWeight: 700, color: '#4b5563', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {CATEGORY_ICONS[cat] || '📋'} {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ 기본 목록 뷰 ═══ */}
              {/* ═══ B1 업로드 결과 하단 요약바 ═══ */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                flexWrap: 'wrap', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                    조회 <span style={{ fontWeight: 800, color: '#0f172a' }}>{uploadSummaryTotals.count.toLocaleString()}</span>건
                  </span>
                  <div style={{ width: 1, height: 14, background: '#e2e8f0' }} />
                  <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 700 }}>
                    입금 +{uploadSummaryTotals.income.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>
                    출금 -{uploadSummaryTotals.expense.toLocaleString()}
                  </span>
                  <div style={{ width: 1, height: 14, background: '#e2e8f0' }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: uploadSummaryTotals.net >= 0 ? '#2563eb' : '#dc2626' }}>
                    순합계 {uploadSummaryTotals.net >= 0 ? '+' : ''}{uploadSummaryTotals.net.toLocaleString()}
                  </span>
                  {uploadSummaryTotals.foreignText && (
                    <>
                      <div style={{ width: 1, height: 14, background: '#e2e8f0' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: '#fef3c7', padding: '1px 6px', borderRadius: 4 }}>
                        💱 {uploadSummaryTotals.foreignText}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* ═══ 그룹 뷰: 거래처별 / 입출금별 / 날짜별 / 사용자별 (공통 렌더) ═══ */}
              {(['client', 'income_expense', 'date', 'user'] as const).map(gType => {
                const dataMap = { client: groupedByClient, income_expense: groupedByIncomeExpense, date: groupedByDate, user: groupedByUser }
                const groupData = dataMap[gType]
                if (uploadGroupBy !== gType || !groupData) return null
                return (
                  <div key={gType} style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                    {groupData.map(([label, group]) => (
                      <div key={label} style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', background: '#f8fafc', gap: 10, cursor: 'pointer' }}
                          onClick={() => toggleGroup(label)}>
                          <input type="checkbox" style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#2d5fa8', flexShrink: 0 }}
                            checked={group.items.length > 0 && group.items.every((i: any) => uploadSelectedIds.has(i.id))}
                            onClick={e => e.stopPropagation()}
                            onChange={e => {
                              const ids = group.items.map((i: any) => i.id)
                              setUploadSelectedIds(prev => {
                                const next = new Set(prev)
                                if (e.target.checked) ids.forEach((id: string) => next.add(id))
                                else ids.forEach((id: string) => next.delete(id))
                                return next
                              })
                            }} />
                          <div style={{ width: 4, height: 32, borderRadius: 4, background: group.type === 'income' ? '#16a34a' : '#2d5fa8', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', margin: 0 }}>{label}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontWeight: 800, fontSize: 14, color: group.type === 'income' ? '#16a34a' : '#111827', margin: 0 }}>{Math.abs(group.totalAmount).toLocaleString()}원</p>
                            {(group as any).foreignAmounts && formatForeignAmounts((group as any).foreignAmounts) && (
                              <p style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, margin: 0 }}>({formatForeignAmounts((group as any).foreignAmounts)})</p>
                            )}
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{group.items.length}건</p>
                          </div>
                          <span style={{ fontSize: 12, color: '#94a3b8', transition: 'transform 0.2s', transform: expandedGroups.has(label) ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                        </div>
                        {expandedGroups.has(label) && (() => {
                          const gLimit = groupItemLimits[label] || GROUP_PAGE_SIZE
                          const gVisibleItems = group.items.slice(0, gLimit)
                          const gHasMore = group.items.length > gLimit
                          return (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', textAlign: 'left', fontSize: 12, borderCollapse: 'collapse' }}>
                              <tbody>
                                {gVisibleItems.map(item => {
                                  const isItemConfirmed = uploadConfirmedIds.has(item.id)
                                  return (
                                  <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: isItemConfirmed ? 0.6 : 1, background: uploadSelectedIds.has(item.id) ? 'rgba(59,130,246,0.05)' : isItemConfirmed ? 'rgba(16,185,129,0.04)' : 'transparent' }} onMouseEnter={e => { if (!uploadSelectedIds.has(item.id)) e.currentTarget.style.background = isItemConfirmed ? 'rgba(16,185,129,0.06)' : 'rgba(79,70,229,0.03)' }} onMouseLeave={e => { e.currentTarget.style.background = uploadSelectedIds.has(item.id) ? 'rgba(59,130,246,0.05)' : isItemConfirmed ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
                                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                      {isItemConfirmed ? (
                                        <span title="확정됨" style={{ fontSize: 11, color: '#10b981', cursor: 'pointer' }} onClick={() => { const next = new Set(uploadConfirmedIds); next.delete(item.id); setUploadConfirmedIds(next) }}>✅</span>
                                      ) : (
                                        <input type="checkbox" checked={uploadSelectedIds.has(item.id)} onChange={() => toggleUploadSelect(item.id)} style={{ width: 13, height: 13, cursor: 'pointer', accentColor: '#2d5fa8' }} />
                                      )}
                                    </td>
                                    <td style={{ padding: '8px 12px', width: 80, color: '#6b7280', whiteSpace: 'nowrap', fontSize: 10 }}>{item.transaction_date}</td>
                                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{item.client_name}</td>
                                    <td style={{ padding: '8px 12px' }}>
                                      <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#f0fdf4', color: '#16a34a' }}>
                                        {categoryMode === 'display'
                                          ? getCategoryGroup(item.category || '미분류', 'display')
                                          : `${CATEGORY_ICONS[item.category || ''] || '📋'} ${item.category || '미분류'}`}
                                      </span>
                                    </td>
                                    <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</td>
                                    {(() => { const ad = getAmountDisplay(item); return (
                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: ad.color, whiteSpace: 'nowrap' }}>
                                      {ad.prefix && <span style={{ fontSize: 10, color: ad.prefixColor, marginRight: 4 }}>{ad.prefix}</span>}
                                      {ad.text}
                                    </td>
                                    )})()}
                                  </tr>
                                )})}
                              </tbody>
                            </table>
                            {gHasMore && (
                              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e5e7eb' }}>
                                <button onClick={(e) => { e.stopPropagation(); setGroupItemLimits(prev => ({ ...prev, [label]: gLimit + GROUP_PAGE_SIZE })) }}
                                  style={{ background: '#2d5fa8', color: '#fff', padding: '6px 16px', borderRadius: 6, fontWeight: 700, fontSize: 11, border: 'none', cursor: 'pointer' }}>
                                  더보기 ({gLimit}/{group.items.length}건)
                                </button>
                              </div>
                            )}
                          </div>
                          )
                        })()}
                      </div>
                    ))}
                  </div>
                )
              })}

              {uploadGroupBy === 'none' && (
                <div style={{ overflowX: 'auto', maxHeight: '65vh' }}>
                  <table style={{ width: '100%', textAlign: 'left', fontSize: 12, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: 30 }} />
                      <col style={{ width: 78 }} />
                      <col style={{ width: 55 }} />
                      <col style={{ width: 'auto' }} />
                      <col style={{ width: 'auto' }} />
                      <col style={{ width: 175 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 115 }} />
                      <col style={{ width: 85 }} />
                      <col style={{ width: 28 }} />
                    </colgroup>
                    <thead style={{ background: '#f9fafb', color: '#6b7280', fontWeight: 700, fontSize: 10, position: 'sticky', top: 0, zIndex: 10 }}>
                      <tr>
                        <th style={{ padding: '6px 4px', textAlign: 'center' }}>
                          <input type="checkbox" checked={filteredResults.length > 0 && uploadSelectedIds.size === filteredResults.length}
                            ref={(el) => { if (el) el.indeterminate = uploadSelectedIds.size > 0 && uploadSelectedIds.size < filteredResults.length }}
                            onChange={toggleUploadSelectAll} style={{ width: 13, height: 13, cursor: 'pointer', accentColor: '#2d5fa8' }} />
                        </th>
                        <th style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>날짜</th>
                        <th style={{ padding: '6px 6px' }}>결제</th>
                        <th style={{ padding: '6px 8px' }}>거래처</th>
                        <th style={{ padding: '6px 8px' }}>비고</th>
                        <th style={{ padding: '6px 6px' }}>📂 분류</th>
                        <th style={{ padding: '6px 6px' }}>사용자</th>
                        <th style={{ padding: '6px 6px' }}>🔗 연결</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>금액</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center' }}>×</th>
                      </tr>
                    </thead>
                    <tbody style={{ borderTop: '1px solid #f3f4f6' }}>
                      {filteredResults.map((item) => {
                        const cardInfo = getCardDisplayInfo(item.card_id)
                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: uploadSelectedIds.has(item.id) ? 'rgba(59,130,246,0.05)' : uploadConfirmedIds.has(item.id) ? 'rgba(16,185,129,0.04)' : (!item.category || item.category === '미분류' || item.category === '기타') ? '#fef2f2' : 'transparent', transition: 'background 0.15s', height: 36, opacity: uploadConfirmedIds.has(item.id) ? 0.6 : 1 }} onMouseEnter={(e) => { if (!uploadSelectedIds.has(item.id)) e.currentTarget.style.background = (!item.category || item.category === '미분류' || item.category === '기타') ? '#fee2e2' : 'rgba(45, 95, 168, 0.03)' }} onMouseLeave={(e) => { e.currentTarget.style.background = uploadSelectedIds.has(item.id) ? 'rgba(59,130,246,0.05)' : uploadConfirmedIds.has(item.id) ? 'rgba(16,185,129,0.04)' : (!item.category || item.category === '미분류' || item.category === '기타') ? '#fef2f2' : 'transparent' }}>
                            <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                              {uploadConfirmedIds.has(item.id) ? (
                                <span title="확정됨" style={{ fontSize: 11, color: '#10b981', cursor: 'pointer' }} onClick={() => { const next = new Set(uploadConfirmedIds); next.delete(item.id); setUploadConfirmedIds(next) }}>✅</span>
                              ) : (
                                <input type="checkbox" checked={uploadSelectedIds.has(item.id)} onChange={() => toggleUploadSelect(item.id)} style={{ width: 13, height: 13, cursor: 'pointer', accentColor: '#2d5fa8' }} />
                              )}
                            </td>
                            <td style={{ padding: '4px 6px', whiteSpace: 'nowrap', fontSize: 12 }}><input value={item.transaction_date || ''} onChange={e => handleUpdateItem(item.id, 'transaction_date', e.target.value, item)} style={{ background: 'transparent', width: 74, outline: 'none', color: '#1f2937', fontSize: 12 }} /></td>
                            <td style={{ padding: '4px 6px' }}>
                              {(item.payment_method === '카드' || item.payment_method === 'Card') ? (
                                <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: '#fef3c7', color: '#b45309', whiteSpace: 'nowrap' }}>
                                  💳 {item.card_number ? item.card_number.slice(-4) : '카드'}
                                </span>
                              ) : (
                                <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: item.type === 'income' ? '#dbeafe' : '#fee2e2', color: item.type === 'income' ? '#1e40af' : '#991b1b', whiteSpace: 'nowrap' }}>
                                  {item.type === 'income' ? '🔵 입금' : '🔴 출금'}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '4px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><input value={item.client_name || ''} onChange={e => handleUpdateItem(item.id, 'client_name', e.target.value, item)} style={{ width: '100%', background: 'transparent', outline: 'none', fontWeight: 700, color: '#1f2937', fontSize: 11 }} /></td>
                            <td style={{ padding: '4px 8px', overflow: 'hidden', textOverflow: 'ellipsis' }}><input value={item.description || ''} onChange={e => handleUpdateItem(item.id, 'description', e.target.value, item)} style={{ width: '100%', background: 'transparent', border: '1px solid #f1f5f9', borderRadius: 4, padding: '2px 4px', outline: 'none', fontSize: 12, color: '#64748b' }} /></td>
                            <td style={{ padding: '4px 4px', position: 'relative' }}>
                              {(() => {
                                const catParts = getCategoryParts(item.category, categoryMode)
                                const isUnclassified = !catParts.group
                                const isOpen = openCategoryId === item.id
                                const groupColor = catParts.group ? (CATEGORY_COLORS[catParts.group] || '#94a3b8') : ''
                                const groupIcon = catParts.item ? (CATEGORY_ICONS[catParts.item] || '📋') : '❓'
                                return (
                                  <div style={{ position: 'relative' }}>
                                    <div
                                      onClick={(e) => { if (isOpen) { setOpenCategoryId(null); setCatPopoverPos(null) } else { setOpenCategoryId(item.id); setCatPopoverStep(catParts.group ? 'item' : 'group'); setCatPopoverGroup(catParts.group); setCatPopoverPos(calcPopPos(e.currentTarget)) } }}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 5, padding: '3px 6px', cursor: 'pointer',
                                        border: isUnclassified ? '1.5px dashed #f87171' : '1px solid #e2e8f0',
                                        borderRadius: 6, background: isUnclassified ? '#fef2f2' : '#fff', transition: 'border-color 0.15s',
                                      }}
                                    >
                                      {isUnclassified ? (
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', flex: 1 }}>❓ 미분류</span>
                                      ) : (
                                        <>
                                          <span style={{ fontSize: 12, flexShrink: 0 }}>{groupIcon}</span>
                                          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                            <div style={{ fontSize: 9, fontWeight: 700, color: groupColor, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{catParts.group.replace(/^[^\s]+\s/, '')}</div>
                                            <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{catParts.item || '(미지정)'}</div>
                                          </div>
                                        </>
                                      )}
                                      <span style={{ fontSize: 8, color: '#94a3b8', flexShrink: 0 }}>▼</span>
                                    </div>
                                    {isOpen && catPopoverPos && (
                                      <>
                                        <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => { setOpenCategoryId(null); setCatPopoverPos(null) }} />
                                        <div style={{ position: 'fixed', top: catPopoverPos.top, left: catPopoverPos.left, zIndex: 99, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 25px rgba(0,0,0,0.15)', minWidth: 220, maxHeight: 340, overflowY: 'auto' }}>
                                          {catPopoverStep === 'group' ? (
                                            <>
                                              <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 800, color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>① 중그룹 선택</div>
                                              {[...(categoryMode === 'display' ? DISPLAY_CATEGORIES : CATEGORIES), ...customCategories.map(c => ({ group: c.group, items: c.items.map(i => ({ label: i })) }))].map(g => (
                                                <button key={g.group} onClick={() => { setCatPopoverGroup(g.group); setCatPopoverStep('item') }}
                                                  style={{ width: '100%', padding: '8px 12px', border: 'none', background: catParts.group === g.group ? '#eff6ff' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, borderLeft: catParts.group === g.group ? `3px solid ${CATEGORY_COLORS[g.group] || '#94a3b8'}` : '3px solid transparent' }}
                                                  onMouseEnter={e => { if (catParts.group !== g.group) e.currentTarget.style.background = '#f8fafc' }}
                                                  onMouseLeave={e => { if (catParts.group !== g.group) e.currentTarget.style.background = 'transparent' }}
                                                >
                                                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: CATEGORY_COLORS[g.group] || '#94a3b8', flexShrink: 0 }} />
                                                  {g.group}
                                                </button>
                                              ))}
                                              <button onClick={() => { handleUpdateItem(item.id, 'category', '미분류', item); setOpenCategoryId(null); setCatPopoverPos(null) }}
                                                style={{ width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 11, color: '#94a3b8', borderTop: '1px solid #f1f5f9' }}>
                                                ✕ 미분류로 초기화
                                              </button>
                                            </>
                                          ) : (
                                            <>
                                              <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <button onClick={() => setCatPopoverStep('group')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#2d5fa8', padding: 0 }}>←</button>
                                                ② 세부항목 · <span style={{ color: CATEGORY_COLORS[catPopoverGroup] || '#94a3b8' }}>{catPopoverGroup}</span>
                                              </div>
                                              <button onClick={() => { handleUpdateItem(item.id, 'category', catPopoverGroup, item); setOpenCategoryId(null); setCatPopoverPos(null) }}
                                                style={{ width: '100%', padding: '7px 12px', border: 'none', background: !catParts.item ? '#fffbeb' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#92400e', borderBottom: '1px solid #f1f5f9' }}>
                                                📂 중그룹만 (미지정)
                                              </button>
                                              {[...getItemsForGroup(catPopoverGroup, categoryMode), ...(customCategories.find(cc => cc.group === catPopoverGroup)?.items || [])].map(c => (
                                                <button key={c} onClick={() => { handleUpdateItem(item.id, 'category', c, item); setOpenCategoryId(null); setCatPopoverPos(null) }}
                                                  style={{ width: '100%', padding: '7px 12px', border: 'none', background: catParts.item === c ? '#eff6ff' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, borderLeft: catParts.item === c ? '3px solid #2d5fa8' : '3px solid transparent' }}
                                                  onMouseEnter={e => { if (catParts.item !== c) e.currentTarget.style.background = '#f8fafc' }}
                                                  onMouseLeave={e => { if (catParts.item !== c) e.currentTarget.style.background = 'transparent' }}
                                                >
                                                  <span style={{ fontSize: 12 }}>{CATEGORY_ICONS[c] || '📋'}</span>
                                                  {c}
                                                  {catParts.item === c && <span style={{ marginLeft: 'auto', color: '#2d5fa8', fontSize: 11 }}>✓</span>}
                                                </button>
                                              ))}
                                            </>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )
                              })()}
                            </td>
                            <td style={{ padding: '4px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {cardInfo ? (
                                <span style={{ padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>
                                  {cardInfo.holder} ({cardInfo.last4})
                                </span>
                              ) : (item as any).matched_employee_name ? (
                                <span style={{ padding: '2px 6px', borderRadius: 4, background: '#dbeafe', color: '#1e40af', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>
                                  {(item as any).matched_employee_name}
                                </span>
                              ) : (item.payment_method === '카드' || item.payment_method === 'Card') ? (
                                <span style={{ fontSize: 10, color: '#d1d5db' }}>미매칭</span>
                              ) : null}
                            </td>
                            <td style={{ padding: '4px 8px', position: 'relative' }}>
                              {(() => {
                                const rd = getRelatedDisplay(item.related_type, item.related_id)
                                const isOpen = openRelatedId === item.id
                                const _fGroups = getFilteredRelatedGroups(item.category)
                                const _hasRelOpts = !_fGroups || relatedOptions.some(rg => _fGroups.includes(rg.group))
                                return (
                                  <div style={{ position: 'relative' }}>
                                    <button
                                      onClick={(e) => { if (!_hasRelOpts && !rd) return; if (isOpen) { setOpenRelatedId(null); setRelPopoverPos(null) } else { setOpenRelatedId(item.id); setRelPopoverPos(calcPopPos(e.currentTarget, 320)) } }}
                                      style={{
                                        width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px',
                                        fontSize: 11, background: rd ? '#f8fafc' : '#fff', color: '#4b5563', cursor: (!_hasRelOpts && !rd) ? 'default' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 4, textAlign: 'left', outline: 'none',
                                        minHeight: 32,
                                      }}
                                    >
                                      {rd ? (
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <span>{rd.icon}</span>
                                            <span style={{ fontWeight: 700, fontSize: 10, color: rd.color || '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rd.label}</span>
                                          </div>
                                          {rd.detail && <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rd.detail}</div>}
                                        </div>
                                      ) : (
                                        <span style={{ flex: 1, color: _hasRelOpts ? '#f59e0b' : '#d1d5db', fontSize: 10, fontWeight: _hasRelOpts ? 600 : 400 }}>{_hasRelOpts ? '⚠ 연결 없음' : '—'}</span>
                                      )}
                                      {(_hasRelOpts || rd) && <span style={{ fontSize: 8, color: '#9ca3af', flexShrink: 0 }}>▼</span>}
                                    </button>
                                    {isOpen && relPopoverPos && (
                                      <>
                                        <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => { setOpenRelatedId(null); setRelPopoverPos(null) }} />
                                        <div style={{
                                          position: 'fixed', top: relPopoverPos.top, left: relPopoverPos.left, zIndex: 99,
                                          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                                          boxShadow: '0 8px 25px rgba(0,0,0,0.15)', minWidth: 240, maxHeight: 320, overflowY: 'auto',
                                        }}>
                                          <button
                                            onClick={() => { handleUpdateItem(item.id, 'related_composite', '', item); setOpenRelatedId(null); setRelPopoverPos(null) }}
                                            style={{ width: '100%', padding: '8px 12px', border: 'none', background: !rd ? '#f1f5f9' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #f1f5f9' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={e => e.currentTarget.style.background = !rd ? '#f1f5f9' : 'transparent'}
                                          >
                                            <span style={{ fontSize: 12 }}>✕</span> 연결 해제
                                          </button>
                                          {relatedOptions.filter(rg => { const _ag = getFilteredRelatedGroups(item.category); return !_ag || _ag.includes(rg.group) }).map(group => (
                                            <div key={group.group}>
                                              <div style={{ padding: '6px 12px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                                                {group.icon} {group.group}
                                              </div>
                                              {group.items.map(opt => {
                                                const selected = item.related_id ? `${item.related_type}_${item.related_id}` === opt.value : false
                                                return (
                                                  <button
                                                    key={opt.value}
                                                    onClick={() => { handleUpdateItem(item.id, 'related_composite', opt.value, item); setOpenRelatedId(null); setRelPopoverPos(null) }}
                                                    style={{
                                                      width: '100%', padding: '6px 12px', border: 'none',
                                                      background: selected ? '#eff6ff' : 'transparent',
                                                      cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                                                      borderLeft: selected ? `3px solid ${opt.color}` : '3px solid transparent',
                                                    }}
                                                    onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#f8fafc' }}
                                                    onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
                                                  >
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                      <div style={{ fontSize: 11, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</div>
                                                      <div style={{ fontSize: 9, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.sub}</div>
                                                    </div>
                                                    {selected && <span style={{ fontSize: 11, color: opt.color }}>✓</span>}
                                                  </button>
                                                )
                                              })}
                                            </div>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )
                              })()}
                            </td>
                            {(() => { const ad = getAmountDisplay(item); return (
                            <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 800, fontSize: 12, color: ad.color, whiteSpace: 'nowrap' }}>
                              {ad.prefix && <span style={{ fontSize: 9, color: ad.prefixColor, marginRight: 2 }}>{ad.prefix}</span>}
                              {ad.isForeign && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 3, background: '#fef3c7', color: '#92400e', marginRight: 2 }}>{ad.currency}</span>}
                              {ad.text}
                            </td>
                            )})()}
                            <td style={{ padding: '4px 4px', textAlign: 'center' }}><button onClick={() => deleteTransaction(item.id)} style={{ background: 'none', border: 'none', color: '#d1d5db', fontWeight: 700, padding: 2, cursor: 'pointer', fontSize: 14 }} onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'} onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}>×</button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ═══ B2 업로드 선택 시 플로팅 액션 바 ═══ */}
              {uploadSelectedIds.size > 0 && (
                <div style={{
                  position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                  background: '#0f172a', color: '#fff', borderRadius: 14,
                  padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 50,
                }}>
                  <span style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>
                    {uploadSelectionTotals.count}건 선택
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                    합계 {uploadSelectionTotals.total.toLocaleString()}원
                    {uploadSelectionTotals.foreignText && (
                      <span style={{ color: '#fbbf24', marginLeft: 6 }}>({uploadSelectionTotals.foreignText})</span>
                    )}
                  </span>
                  <div style={{ width: 1, height: 20, background: '#334155' }} />
                  <button onClick={async () => {
                    if (!effectiveCompanyId) return alert('회사를 먼저 선택해주세요.')
                    const selectedItems = filteredResults.filter(r => uploadSelectedIds.has(r.id))
                    if (selectedItems.length === 0) return
                    if (!confirm(`${selectedItems.length}건을 확정 저장하시겠습니까?\n확정된 항목은 DB에 저장되어 '확정완료' 탭에서 확인할 수 있습니다.`)) return

                    try {
                      // DB에 저장할 payload 구성 (handleBulkSave와 동일한 형식)
                      const payload = selectedItems.map(item => {
                        return {
                          company_id: effectiveCompanyId,
                          transaction_date: item.transaction_date,
                          client_name: item.client_name,
                          amount: item.amount,
                          type: item.type,
                          payment_method: item.payment_method,
                          description: item.description || '',
                          memo: item.memo || null,
                          status: 'completed',
                          category: item.category || item.ai_category || '미분류',
                          related_type: item.related_type || item.ai_related_type || null,
                          related_id: item.related_id || item.ai_related_id || null,
                          card_id: item.card_id || null,
                          is_cancel: item.is_cancel || false,
                          classification_source: item.classification_source || null,
                          confidence: item.confidence || 0,
                          employee_id: (() => {
                            let empId = (item as any).matched_employee_id || null
                            if (!empId && item.card_id) {
                              const card = corpCards.find(c => c.id === item.card_id)
                              if (card?.assigned_employee_id) empId = card.assigned_employee_id
                            }
                            return empId
                          })(),
                          employee_name: (() => {
                            let empName = (item as any).matched_employee_name || null
                            if (!empName && item.card_id) {
                              const card = corpCards.find(c => c.id === item.card_id)
                              if (card?.assigned_employee_id) {
                                const emp = employees.find((e: any) => e.id === card.assigned_employee_id)
                                empName = emp?.name || emp?.employee_name || null
                              }
                            }
                            return empName
                          })(),
                          currency: (item as any).currency || 'KRW',
                          original_amount: (item as any).original_amount || null,
                        }
                      })

                      const { error } = await supabase.from('transactions').insert(payload)
                      if (error) {
                        alert('저장 실패: ' + error.message)
                        return
                      }

                      // classification_queue 정리 — API로 삭제 (RLS 우회)
                      const queueIds = selectedItems.map(r => (r as any)._queue_id).filter(Boolean)
                      if (queueIds.length > 0) {
                        await fetch('/api/finance/classify', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ company_id: effectiveCompanyId, ids: queueIds })
                        })
                      }

                      // ── 투자 연결 거래 → 투자자 순합계 업데이트 ──
                      const investTxs = selectedItems.filter(r => r.related_type === 'invest' && r.related_id)
                      if (investTxs.length > 0) {
                        const investorIds = [...new Set(investTxs.map(tx => tx.related_id!))]
                        for (const investorId of investorIds) {
                          const { data: allTxs } = await supabase
                            .from('transactions').select('amount, type')
                            .eq('related_type', 'invest').eq('related_id', investorId)
                          if (allTxs) {
                            const netAmount = allTxs.reduce((acc, cur) => acc + (cur.type === 'income' ? Math.abs(cur.amount || 0) : -Math.abs(cur.amount || 0)), 0)
                            await supabase.from('general_investments')
                              .update({ invest_amount: netAmount })
                              .eq('id', investorId)
                          }
                        }
                      }

                      // 업로드 목록에서 확정된 항목 제거
                      for (const item of selectedItems) {
                        deleteTransaction(item.id)
                      }
                      setUploadSelectedIds(new Set())
                      setUploadConfirmedIds(new Set())
                      // 통계 갱신
                      fetchStats()
                      alert(`✅ ${selectedItems.length}건이 확정 저장되었습니다.`)
                    } catch (e: any) {
                      alert('오류 발생: ' + (e?.message || e))
                    }
                  }}
                    style={{ background: '#10b981', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 800, fontSize: 12, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    ✅ 분류확정
                  </button>
                  <button onClick={() => { setBulkClassifyOpen(true); setBulkGroup(''); setBulkItem(''); setBulkRelated('') }}
                    style={{ background: '#2d5fa8', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 800, fontSize: 12, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    📋 일괄분류
                  </button>
                  <button onClick={async () => {
                    const selectedItems = filteredResults.filter(r => uploadSelectedIds.has(r.id))
                    if (selectedItems.length === 0) return
                    if (!confirm(`${selectedItems.length}건을 삭제하시겠습니까?\n(분류 큐에서도 영구 삭제됩니다)`)) return
                    // DB classification_queue에서도 삭제
                    const queueIds = selectedItems.map(r => (r as any)._queue_id).filter(Boolean)
                    if (queueIds.length > 0) {
                      try {
                        const res = await fetch('/api/finance/classify', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ ids: queueIds, company_id: effectiveCompanyId }),
                        })
                        if (!res.ok) console.error('classification_queue 삭제 실패')
                      } catch (e) {
                        console.error('삭제 API 오류:', e)
                      }
                    }
                    for (const item of selectedItems) {
                      deleteTransaction(item.id)
                    }
                    setUploadSelectedIds(new Set())
                    fetchStats()
                  }}
                    style={{ background: '#dc2626', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 800, fontSize: 12, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    삭제
                  </button>
                  <button onClick={() => setUploadSelectedIds(new Set())}
                    style={{ background: '#334155', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 6, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                    ✕ 선택 해제
                  </button>
                </div>
              )}

              {/* ═══ 일괄분류 모달 ═══ */}
              {bulkClassifyOpen && (() => {
                const selectedItems = filteredResults.filter(r => uploadSelectedIds.has(r.id))
                const selCount = selectedItems.length
                const selTotal = selectedItems.reduce((s, i) => s + Math.abs(i.amount || 0), 0)
                const selForeignAmounts: Record<string, number> = {}
                selectedItems.forEach(i => addForeignAmount(selForeignAmounts, i))
                const selForeignText = formatForeignAmounts(selForeignAmounts)
                const quickPresets = [
                  { label: '🚛 유류비', group: categoryMode === 'display' ? '🚛 차량 운영' : '영업비용-차량', item: '유류비' },
                  { label: '🔧 정비/수리비', group: categoryMode === 'display' ? '🚛 차량 운영' : '영업비용-차량', item: '정비/수리비' },
                  { label: '🍽️ 식대', group: categoryMode === 'display' ? '🍽️ 식비/접대/출장' : '영업비용-관리', item: '복리후생(식대)' },
                  { label: '🏛️ 세금/공과금', group: categoryMode === 'display' ? '🏛️ 세금/공과금' : '세금/공과', item: '세금/공과금' },
                  { label: '💳 수수료', group: categoryMode === 'display' ? '💳 수수료/카드' : '영업비용-금융', item: '수수료/카드수수료' },
                  { label: '🏢 임차료', group: categoryMode === 'display' ? '🏢 사무실/운영비' : '영업비용-관리', item: '임차료/사무실' },
                  { label: '⛽ 차량보험', group: categoryMode === 'display' ? '🚛 차량 운영' : '영업비용-차량', item: '차량보험료' },
                  { label: '💰 투자원금', group: categoryMode === 'display' ? '🏦 투자/대출 입출금' : '자본변동', item: '투자원금 입금' },
                ]
                const bulkSubItems = bulkGroup ? getItemsForGroup(bulkGroup, categoryMode) : []
                const bulkPreview = bulkItem || bulkGroup || '미분류'
                const bulkGroupColor = bulkGroup ? (CATEGORY_COLORS[bulkGroup] || '#94a3b8') : ''
                return (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setBulkClassifyOpen(false)}>
                    <div style={{ background: '#fff', borderRadius: 16, width: 480, maxHeight: '80vh', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
                      {/* 헤더 */}
                      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>📋 일괄 분류</h3>
                          <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>선택된 <b style={{ color: '#2d5fa8' }}>{selCount}건</b> · 합계 <b>{selTotal.toLocaleString()}원</b>{selForeignText && <span style={{ color: '#f59e0b', fontWeight: 700, marginLeft: 4 }}>({selForeignText})</span>}</p>
                        </div>
                        <button onClick={() => setBulkClassifyOpen(false)} style={{ background: 'none', border: 'none', fontSize: 18, color: '#94a3b8', cursor: 'pointer' }}>✕</button>
                      </div>

                      {/* 자주 쓰는 분류 */}
                      <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>⚡ 자주 쓰는 분류 (원클릭)</p>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {quickPresets.map(qp => (
                            <button key={qp.label} onClick={() => { setBulkGroup(qp.group); setBulkItem(qp.item) }}
                              style={{
                                padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                                border: bulkGroup === qp.group && bulkItem === qp.item ? '1px solid #2d5fa8' : '1px solid #e2e8f0',
                                background: bulkGroup === qp.group && bulkItem === qp.item ? '#2d5fa8' : '#fff',
                                color: bulkGroup === qp.group && bulkItem === qp.item ? '#fff' : '#374151',
                                cursor: 'pointer', transition: 'all 0.15s',
                              }}>
                              {qp.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 본문 */}
                      <div style={{ padding: '16px 20px' }}>
                        <div style={{ marginBottom: 14 }}>
                          <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>① 중그룹 (대분류)</label>
                          {customGroupInput ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input type="text" value={customGroupText} onChange={e => setCustomGroupText(e.target.value)}
                                placeholder="새 중그룹명 입력..." autoFocus
                                style={{ flex: 1, padding: '9px 12px', border: '1px solid #2d5fa8', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && customGroupText.trim()) {
                                    const newGroup = customGroupText.trim()
                                    setCustomCategories(prev => {
                                      if (prev.some(c => c.group === newGroup)) return prev
                                      return [...prev, { group: newGroup, items: [] }]
                                    })
                                    setBulkGroup(newGroup)
                                    setBulkItem('')
                                    setCustomGroupInput(false)
                                    setCustomGroupText('')
                                  }
                                }} />
                              <button onClick={() => {
                                if (customGroupText.trim()) {
                                  const newGroup = customGroupText.trim()
                                  setCustomCategories(prev => {
                                    if (prev.some(c => c.group === newGroup)) return prev
                                    return [...prev, { group: newGroup, items: [] }]
                                  })
                                  setBulkGroup(newGroup)
                                  setBulkItem('')
                                }
                                setCustomGroupInput(false)
                                setCustomGroupText('')
                              }}
                                style={{ padding: '9px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', background: '#2d5fa8', color: '#fff', whiteSpace: 'nowrap' }}>
                                확인
                              </button>
                              <button onClick={() => { setCustomGroupInput(false); setCustomGroupText('') }}
                                style={{ padding: '9px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid #e2e8f0', cursor: 'pointer', background: '#fff', color: '#64748b' }}>
                                취소
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <select value={bulkGroup} onChange={e => { setBulkGroup(e.target.value); setBulkItem(''); setCustomItemInput(false) }}
                                style={{ flex: 1, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}>
                                <option value="">선택하세요...</option>
                                {(categoryMode === 'display' ? DISPLAY_CATEGORIES : CATEGORIES).map(g => (
                                  <option key={g.group} value={g.group}>{g.group}</option>
                                ))}
                                {customCategories.map(c => (
                                  <option key={`custom_${c.group}`} value={c.group}>✏️ {c.group}</option>
                                ))}
                              </select>
                              <button onClick={() => setCustomGroupInput(true)}
                                style={{ padding: '9px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, border: '1px solid #2d5fa8', cursor: 'pointer', background: '#eff6ff', color: '#2d5fa8', whiteSpace: 'nowrap' }}>
                                + 추가
                              </button>
                            </div>
                          )}
                        </div>
                        <div style={{ marginBottom: 14 }}>
                          <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>② 세부항목 <span style={{ fontWeight: 500, color: '#94a3b8' }}>(선택 — 미지정 시 중그룹으로 분류)</span></label>
                          {customItemInput ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input type="text" value={customItemText} onChange={e => setCustomItemText(e.target.value)}
                                placeholder="새 세부항목명 입력..." autoFocus
                                style={{ flex: 1, padding: '9px 12px', border: '1px solid #2d5fa8', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && customItemText.trim()) {
                                    const newItem = customItemText.trim()
                                    setCustomCategories(prev => prev.map(c => c.group === bulkGroup ? { ...c, items: c.items.includes(newItem) ? c.items : [...c.items, newItem] } : c))
                                    setBulkItem(newItem)
                                    setCustomItemInput(false)
                                    setCustomItemText('')
                                  }
                                }} />
                              <button onClick={() => {
                                if (customItemText.trim()) {
                                  const newItem = customItemText.trim()
                                  setCustomCategories(prev => prev.map(c => c.group === bulkGroup ? { ...c, items: c.items.includes(newItem) ? c.items : [...c.items, newItem] } : c))
                                  setBulkItem(newItem)
                                }
                                setCustomItemInput(false)
                                setCustomItemText('')
                              }}
                                style={{ padding: '9px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', background: '#2d5fa8', color: '#fff', whiteSpace: 'nowrap' }}>
                                확인
                              </button>
                              <button onClick={() => { setCustomItemInput(false); setCustomItemText('') }}
                                style={{ padding: '9px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid #e2e8f0', cursor: 'pointer', background: '#fff', color: '#64748b' }}>
                                취소
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <select value={bulkItem} onChange={e => setBulkItem(e.target.value)} disabled={!bulkGroup}
                                style={{ flex: 1, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: bulkItem ? '#1e293b' : '#94a3b8', outline: 'none', background: '#fff', opacity: bulkGroup ? 1 : 0.5 }}>
                                <option value="">미지정 (중그룹만)</option>
                                {bulkSubItems.map(c => <option key={c} value={c}>{c}</option>)}
                                {customCategories.find(c => c.group === bulkGroup)?.items.map(ci => (
                                  <option key={`custom_item_${ci}`} value={ci}>✏️ {ci}</option>
                                ))}
                              </select>
                              {bulkGroup && customCategories.some(c => c.group === bulkGroup) && (
                                <button onClick={() => setCustomItemInput(true)}
                                  style={{ padding: '9px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, border: '1px solid #2d5fa8', cursor: 'pointer', background: '#eff6ff', color: '#2d5fa8', whiteSpace: 'nowrap' }}>
                                  + 추가
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div style={{ marginBottom: 14 }}>
                          <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>③ 연결 <span style={{ fontWeight: 500, color: '#94a3b8' }}>(선택)</span></label>
                          <select value={bulkRelated} onChange={e => setBulkRelated(e.target.value)}
                            style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: bulkRelated ? '#1e293b' : '#94a3b8', outline: 'none', background: '#fff' }}>
                            <option value="">연결 안함</option>
                            {relatedOptions.filter(rg => { const _ag = getFilteredRelatedGroups(bulkItem || bulkGroup); return !_ag || _ag.includes(rg.group) }).map(grp => (
                              <optgroup key={grp.group} label={`${grp.icon} ${grp.group}`}>
                                {grp.items.map(opt => <option key={opt.value} value={opt.value}>{opt.label} — {opt.sub}</option>)}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* 미리보기 */}
                      {bulkGroup && (
                        <div style={{ padding: '10px 20px', background: '#f0f9ff', borderTop: '1px solid #e2e8f0' }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>미리보기</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${bulkGroupColor}20`, color: bulkGroupColor }}>{bulkGroup.split(' ')[0]} {bulkGroup.replace(/^[^\s]+\s/, '').substring(0, 6)}</span>
                            {bulkItem && <><span style={{ color: '#d1d5db' }}>›</span><span style={{ fontSize: 12, fontWeight: 700 }}>{bulkItem}</span></>}
                            {bulkRelated && (() => {
                              const ro = relatedOptions.flatMap(g => g.items).find(o => o.value === bulkRelated)
                              return ro ? <><span style={{ color: '#d1d5db' }}>›</span><span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: '#dbeafe', color: '#1e40af' }}>{ro.label}</span></> : null
                            })()}
                          </div>
                        </div>
                      )}

                      {/* 푸터 */}
                      <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setBulkClassifyOpen(false)}
                          style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: '#f1f5f9', color: '#475569' }}>
                          취소
                        </button>
                        <button disabled={!bulkGroup} onClick={() => {
                          const catValue = bulkItem || bulkGroup
                          for (const si of selectedItems) {
                            updateTransaction(si.id, 'category', catValue)
                            if (bulkRelated) {
                              updateTransaction(si.id, 'related_composite', bulkRelated)
                            }
                          }
                          // 일괄분류 후 자동 확정
                          const ids = new Set(uploadConfirmedIds)
                          selectedItems.forEach(si => ids.add(si.id))
                          setUploadConfirmedIds(ids)
                          setUploadSelectedIds(new Set())
                          setBulkClassifyOpen(false)
                        }}
                          style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: bulkGroup ? '#2d5fa8' : '#94a3b8', color: '#fff', opacity: bulkGroup ? 1 : 0.5 }}>
                          ✅ {selCount}건 일괄 분류
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </>
      )}

      {/* ═══ 분류 관리 탭 — DB 데이터 (업로드 결과 없을 때) / 확정완료 탭 ═══ */}
      {((activeTab === 'classify' && results.length === 0) || activeTab === 'confirmed') && (
        <>
          {/* 전체선택 + 전체삭제 (간소화) */}
          {items.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={items.length > 0 && selectedIds.size === items.length}
                  ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < items.length }}
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#0f172a' }}
                />
                <span style={{ fontSize: 12, fontWeight: 700, color: selectedIds.size > 0 ? '#0f172a' : '#94a3b8' }}>
                  {selectedIds.size > 0 ? `${selectedIds.size}건 선택됨` : `전체 선택`}
                </span>
              </label>
              <button onClick={handleDeleteAll} disabled={deleting}
                style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'transparent', color: '#dc2626' }}>
                {deleting ? '삭제 중...' : `전체 삭제`}
              </button>
            </div>
          )}

          {loading ? (
            <div style={{ minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 28, height: 28, border: '2px solid #e2e8f0', borderTopColor: '#475569', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                <p style={{ marginTop: 12, fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>로딩 중...</p>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>✅</span>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#475569', margin: 0 }}>
                {activeTab === 'classify' ? '분류 대기 항목이 없습니다' : '확정된 항목이 없습니다'}
              </p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>업로드된 거래가 AI 분류되면 여기에 표시됩니다</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* 용도별/회계기준 토글은 상단 1줄에 통합됨 */}
              {groupedItems.map(([category, group]) => {
                const isExpanded = expandedGroups.has(category)
                const isDisplayCat = categoryMode === 'display' && groupBy === 'category'
                const hasSubGroups = group.subGroups && Object.keys(group.subGroups).length > 1
                const icon = isDisplayCat ? '' : (CATEGORY_ICONS[category] || '📋')
                const groupName = isDisplayCat ? '' : getCategoryGroup(category, 'accounting')
                const groupColor = CATEGORY_COLORS[isDisplayCat ? category : groupName] || '#64748b'
                const isIncome = group.type === 'income'

                return (
                  <div key={category} style={{
                    background: (category === '미분류' || category === '기타') ? '#fff5f5' : '#fff',
                    borderRadius: 16,
                    border: (category === '미분류' || category === '기타') ? '1px solid #fecaca' : '1px solid #e2e8f0',
                    overflow: 'clip', transition: 'all 0.2s',
                  }}>
                    {/* Group Header */}
                    <div onClick={() => toggleGroup(category)}
                      style={{
                        display: 'flex', alignItems: 'center', padding: '14px 20px', cursor: 'pointer', gap: 12,
                        borderBottom: isExpanded ? '1px solid #f1f5f9' : 'none',
                        background: (category === '미분류' || category === '기타') ? '#fef2f2' : '#fafbfc',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = (category === '미분류' || category === '기타') ? '#fee2e2' : '#f3f4f6'}
                      onMouseLeave={(e) => e.currentTarget.style.background = (category === '미분류' || category === '기타') ? '#fef2f2' : '#fafbfc'}>

                      {/* Group Checkbox */}
                      <input
                        type="checkbox"
                        checked={group.items.every((i: any) => selectedIds.has(i.id))}
                        ref={(el) => {
                          if (el) {
                            const checkedCount = group.items.filter((i: any) => selectedIds.has(i.id)).length
                            el.indeterminate = checkedCount > 0 && checkedCount < group.items.length
                          }
                        }}
                        onChange={(e) => { e.stopPropagation(); toggleSelectGroup(group.items) }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#0f172a', flexShrink: 0 }}
                      />

                      {/* Color Bar */}
                      <div style={{ width: 4, height: 36, borderRadius: 4, background: groupColor, flexShrink: 0 }} />

                      {/* Category Name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        {!isDisplayCat && <span style={{ fontSize: 20 }}>{icon}</span>}
                        <div>
                          <p style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', margin: 0 }}>{category}</p>
                          {!hasSubGroups && !isDisplayCat && <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 1, margin: 0 }}>{groupName}</p>}
                          {hasSubGroups && group.subGroups && (
                            <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 1, margin: 0 }}>
                              {Object.keys(group.subGroups).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Count & Amount */}
                      <div style={{ textAlign: 'right', marginRight: 12 }}>
                        <p style={{ fontWeight: 800, fontSize: 15, color: isIncome ? '#3b82f6' : '#ef4444', margin: 0 }}>
                          {nf(group.totalAmount)}원
                        </p>
                        {(group as any).foreignAmounts && formatForeignAmounts((group as any).foreignAmounts) && (
                          <p style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, margin: 0 }}>({formatForeignAmounts((group as any).foreignAmounts)})</p>
                        )}
                        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, margin: 0 }}>{group.items.length}건</p>
                      </div>

                      {/* Group Actions */}
                      {activeTab === 'classify' && category !== '미분류' && category !== '기타' && (
                        <button onClick={(e) => { e.stopPropagation(); handleConfirmGroup(category, group.items) }}
                          style={{ background: '#10b981', color: '#fff', padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 11, border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                          일괄확정
                        </button>
                      )}
                      {activeTab === 'classify' && (category === '미분류' || category === '기타') && (
                        <span style={{ padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 11, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', flexShrink: 0 }}>
                          ⚠ 분류 후 확정 가능
                        </span>
                      )}

                      {activeTab === 'confirmed' && (
                        <button onClick={(e) => { e.stopPropagation(); handleRevertGroup(category, group.items) }}
                          style={{ background: '#fef2f2', color: '#dc2626', padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 11, border: '1px solid #fecaca', cursor: 'pointer', flexShrink: 0 }}>
                          ↩ 일괄되돌리기
                        </button>
                      )}

                      {/* Expand Arrow */}
                      <span style={{ fontSize: 14, color: '#94a3b8', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                    </div>

                    {/* Group Items (paginated to prevent crash on large groups) */}
                    {isExpanded && (() => {
                      const limit = groupItemLimits[category] || GROUP_PAGE_SIZE
                      // 서브그룹별로 정렬
                      const subGroupsRaw = hasSubGroups && group.subGroups ? Object.entries(group.subGroups) : null
                      const subGroups = subGroupsRaw
                        ? subGroupsRaw.sort((a, b) => {
                            const order = categoryMode === 'display'
                              ? DISPLAY_CATEGORIES.map(d => d.group)
                              : CATEGORIES.map(c => c.group)
                            const ai = order.indexOf(a[0]); const bi = order.indexOf(b[0])
                            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
                          })
                        : null
                      const sortedItems = subGroups ? subGroups.flatMap(([, sg]) => sg.items) : group.items
                      const visibleItems = sortedItems.slice(0, limit)
                      const hasMore = sortedItems.length > limit
                      // 서브그룹 경계 인덱스
                      const subGroupBounds: Record<number, { name: string; count: number; amount: number }> = {}
                      if (subGroups) {
                        let idx = 0
                        for (const [sgName, sg] of subGroups) {
                          if (idx < limit) subGroupBounds[idx] = { name: sgName, count: sg.items.length, amount: sg.totalAmount }
                          idx += sg.items.length
                        }
                      }
                      return (
                      <div>
                        {visibleItems.map((item: any, itemIdx: number) => {
                          const src = item.source_data || {}
                          const isConfirmed = item.status === 'confirmed'
                          const subHeader = subGroupBounds[itemIdx]

                          return (<React.Fragment key={item.id}>
                            {subHeader && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 20px 6px 36px', background: '#f0f4ff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 5, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                {groupBy === 'category' && <span style={{ fontSize: 13 }}>{CATEGORY_ICONS[subHeader.name] || '📋'}</span>}
                                {groupBy !== 'category' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLORS[subHeader.name] || '#94a3b8', flexShrink: 0 }} />}
                                <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{subHeader.name}</span>
                                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{subHeader.count}건 · {Math.abs(subHeader.amount).toLocaleString()}원</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 20px 10px 36px', borderBottom: '1px solid #f8fafc', gap: 10, opacity: isConfirmed ? 0.5 : 1, background: selectedIds.has(item.id) ? 'rgba(59, 130, 246, 0.18)' : (item.source_data?.is_cancelled ? '#fef2f2' : 'transparent'), transition: 'background 0.2s' }}
                              onMouseEnter={(e) => { if (!selectedIds.has(item.id)) e.currentTarget.style.background = 'rgba(79, 70, 229, 0.06)' }}
                              onMouseLeave={(e) => { if (!selectedIds.has(item.id)) e.currentTarget.style.background = item.source_data?.is_cancelled ? '#fef2f2' : 'transparent' }}>

                              {/* Checkbox */}
                              <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelectId(item.id)}
                                style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }} />

                              {/* 취소 뱃지 */}
                              {(item.source_data?.is_cancelled || (item.source_data?.description || '').includes('취소')) && (
                                <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: '#fecaca', color: '#991b1b', flexShrink: 0 }}>취소</span>
                              )}

                              {/* Date */}
                              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, width: 80, flexShrink: 0 }}>{src.transaction_date}</span>

                              {/* Type */}
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                                background: src.type === 'income' ? '#eff6ff' : '#fef2f2', color: src.type === 'income' ? '#3b82f6' : '#ef4444' }}>
                                {src.type === 'income' ? '입금' : '출금'}
                              </span>

                              {/* Payment Method */}
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: '#64748b', flexShrink: 0 }}>
                                {src.payment_method || '통장'}
                              </span>

                              {/* Client */}
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {src.client_name || '(미상)'}
                              </span>

                              {/* Description */}
                              <span style={{ fontSize: 12, color: '#94a3b8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {src.description || ''}
                              </span>

                              {/* 연결 뱃지 + 🔗 팝오버 */}
                              {(() => {
                                const ld = getReviewLinkDisplay(item)
                                return (
                                  <div data-link-popover style={{ position: 'relative', flexShrink: 0 }}>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); if (linkPopoverId === item.id) { setLinkPopoverId(null); setLinkPopoverPosFixed(null) } else { setLinkPopoverId(item.id); setLinkPopoverPosFixed(calcPopPosRight(e.currentTarget, 340)); setLinkPopoverSearch(''); setLinkPopoverTab('car') } }}
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6,
                                        fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                                        background: ld ? ld.bg : '#f8fafc', color: ld ? ld.color : '#94a3b8',
                                        ...(ld ? {} : { borderStyle: 'dashed' as const, borderWidth: 1, borderColor: '#cbd5e1' }),
                                      }}>
                                      {ld ? `${ld.icon} ${ld.label}` : '🔗'}
                                    </button>
                                    {/* 팝오버 */}
                                    {linkPopoverId === item.id && linkPopoverPosFixed && (
                                      <div data-link-popover onClick={(e) => e.stopPropagation()} style={{
                                        position: 'fixed', top: linkPopoverPosFixed.top, right: linkPopoverPosFixed.right, width: 260,
                                        background: '#fff', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
                                        border: '1px solid #e2e8f0', zIndex: 60, overflow: 'hidden',
                                      }}>
                                        <input
                                          placeholder="검색..." value={linkPopoverSearch}
                                          onChange={e => setLinkPopoverSearch(e.target.value)}
                                          onClick={e => e.stopPropagation()}
                                          style={{ width: '100%', border: 'none', borderBottom: '1px solid #e2e8f0', padding: '8px 12px', fontSize: 11, outline: 'none', background: '#fafbfc' }}
                                        />
                                        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
                                          {([
                                            { key: 'car' as const, label: '🚗차량' },
                                            { key: 'jiip' as const, label: '🚛지입' },
                                            { key: 'invest' as const, label: '💰투자' },
                                            { key: 'loan' as const, label: '🏦대출' },
                                          ]).map(t => (
                                            <button key={t.key} onClick={() => setLinkPopoverTab(t.key)}
                                              style={{
                                                flex: 1, padding: '8px 4px', fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer',
                                                background: linkPopoverTab === t.key ? '#fff' : '#f8fafc',
                                                color: linkPopoverTab === t.key ? '#0f172a' : '#94a3b8',
                                                borderBottom: linkPopoverTab === t.key ? '2px solid #0f172a' : '2px solid transparent',
                                              }}>{t.label}</button>
                                          ))}
                                        </div>
                                        <div style={{ maxHeight: 180, overflowY: 'auto', padding: 6 }}>
                                          {linkPopoverTab === 'car' && linkOptions.car.map((c: any) => (
                                            <div key={c.id} onClick={() => { handleLinkItem(item.id, 'car', c.id); setLinkPopoverId(null); setLinkPopoverPosFixed(null) }}
                                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, transition: 'background 0.1s' }}
                                              onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                              <span>🚗</span>
                                              <div><div style={{ fontWeight: 700 }}>{c.number}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>{c.brand} {c.model}</div></div>
                                            </div>
                                          ))}
                                          {linkPopoverTab === 'jiip' && linkOptions.jiip.map((j: any) => (
                                            <div key={j.id} onClick={() => { handleLinkItem(item.id, 'jiip', j.id); setLinkPopoverId(null); setLinkPopoverPosFixed(null) }}
                                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, transition: 'background 0.1s' }}
                                              onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                              <span>🚛</span>
                                              <div><div style={{ fontWeight: 700 }}>{j.investor_name}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>{j.vehicle_number || j.car_number || ''}</div></div>
                                            </div>
                                          ))}
                                          {linkPopoverTab === 'invest' && linkOptions.invest.map((inv: any) => (
                                            <div key={inv.id} onClick={() => { handleLinkItem(item.id, 'invest', inv.id); setLinkPopoverId(null); setLinkPopoverPosFixed(null) }}
                                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, transition: 'background 0.1s' }}
                                              onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                              <span>💰</span>
                                              <div><div style={{ fontWeight: 700 }}>{inv.investor_name}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>{inv.invest_amount ? Number(inv.invest_amount).toLocaleString() + '원' : ''} · {inv.interest_rate || '-'}%</div></div>
                                            </div>
                                          ))}
                                          {linkPopoverTab === 'loan' && linkOptions.loan.map((l: any) => (
                                            <div key={l.id} onClick={() => { handleLinkItem(item.id, 'loan', l.id); setLinkPopoverId(null); setLinkPopoverPosFixed(null) }}
                                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, transition: 'background 0.1s' }}
                                              onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                              <span>🏦</span>
                                              <div><div style={{ fontWeight: 700 }}>{l.finance_name}</div><div style={{ fontSize: 10, color: '#94a3b8' }}>월 {l.monthly_payment ? Number(l.monthly_payment).toLocaleString() + '원' : '-'}</div></div>
                                            </div>
                                          ))}
                                          {linkOptions[linkPopoverTab]?.length === 0 && (
                                            <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>등록된 항목이 없습니다</div>
                                          )}
                                        </div>
                                        {ld && (
                                          <div style={{ borderTop: '1px solid #f1f5f9', padding: '6px 8px' }}>
                                            <button onClick={() => { handleLinkItem(item.id, '', ''); setLinkPopoverId(null); setLinkPopoverPosFixed(null) }}
                                              style={{ width: '100%', padding: '6px', borderRadius: 6, border: 'none', background: '#fef2f2', color: '#dc2626', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                              연결 해제
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}

                              {/* Amount */}
                              {(() => {
                                const reviewItem = { ...item, amount: src.amount, type: src.type, payment_method: src.payment_method, card_number: src.card_number, card_id: (item as any).card_id, is_cancelled: src.is_cancelled, currency: src.currency, original_amount: src.original_amount, source_data: src }
                                const ad = getAmountDisplay(reviewItem)
                                return (
                                  <span style={{ fontWeight: 800, fontSize: 13, color: ad.color, textAlign: 'right', minWidth: 90, flexShrink: 0 }}>
                                    {ad.prefix && <span style={{ fontSize: 10, marginRight: 2 }}>{ad.prefix}</span>}
                                    {ad.isForeign && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 3, background: '#fef3c7', color: '#92400e', marginRight: 3 }}>{ad.currency}</span>}
                                    {ad.text}
                                    {ad.originalText && <div style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>({ad.originalText})</div>}
                                  </span>
                                )
                              })()}

                              {/* Actions - Pending */}
                              {!isConfirmed && activeTab === 'classify' && (
                                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                  {(category !== '미분류' && category !== '기타') ? (
                                    <button onClick={() => handleConfirm(item)}
                                      style={{ background: '#0f172a', color: '#fff', padding: '4px 8px', borderRadius: 6, fontWeight: 700, fontSize: 10, border: 'none', cursor: 'pointer' }}>
                                      확정
                                    </button>
                                  ) : (
                                    <span style={{ fontSize: 9, color: '#dc2626', fontWeight: 700, padding: '4px 6px', background: '#fef2f2', borderRadius: 4 }}>분류필요</span>
                                  )}
                                  <select defaultValue="" onChange={e => { if (e.target.value) handleConfirm(item, { category: e.target.value }) }}
                                    style={{
                                      border: (category === '미분류' || category === '기타') ? '2px solid #f87171' : '1px solid #e2e8f0',
                                      borderRadius: 6, padding: '3px 4px', fontSize: 10,
                                      background: (category === '미분류' || category === '기타') ? '#fef2f2' : '#fff',
                                      color: (category === '미분류' || category === '기타') ? '#dc2626' : '#64748b',
                                      maxWidth: 100, cursor: 'pointer', fontWeight: (category === '미분류' || category === '기타') ? 700 : 400,
                                    }}>
                                    <option value="" disabled>{(category === '미분류' || category === '기타') ? '⚠ 분류 선택' : '변경'}</option>
                                    {CATEGORIES.map(g => (
                                      <optgroup key={g.group} label={g.group}>
                                        {g.items.map(c => <option key={c} value={c}>{c}</option>)}
                                      </optgroup>
                                    ))}
                                  </select>
                                  <button onClick={() => handleConfirmWithRule(item, item.ai_category)}
                                    style={{ background: '#f1f5f9', color: '#475569', padding: '4px 8px', borderRadius: 6, fontWeight: 700, fontSize: 10, border: 'none', cursor: 'pointer' }}
                                    title="이 거래처를 규칙으로 학습합니다">
                                    📚
                                  </button>
                                </div>
                              )}

                              {/* Actions - Confirmed */}
                              {isConfirmed && activeTab === 'confirmed' && (
                                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                  <select defaultValue="" onChange={e => { if (e.target.value) handleChangeCategory(item, e.target.value) }}
                                    style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 4px', fontSize: 10, background: '#fff', color: '#64748b', maxWidth: 90, cursor: 'pointer' }}>
                                    <option value="" disabled>수정</option>
                                    {CATEGORIES.map(g => (
                                      <optgroup key={g.group} label={g.group}>
                                        {g.items.map(c => <option key={c} value={c}>{c}</option>)}
                                      </optgroup>
                                    ))}
                                  </select>
                                  <button onClick={() => handleRevert(item)}
                                    style={{ background: '#fef2f2', color: '#dc2626', padding: '4px 8px', borderRadius: 6, fontWeight: 700, fontSize: 10, border: '1px solid #fecaca', cursor: 'pointer' }}
                                    title="대기중으로 되돌립니다">
                                    ↩ 되돌리기
                                  </button>
                                </div>
                              )}
                            </div>
                          </React.Fragment>)
                        })}
                        {hasMore && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 20px', gap: 8, borderTop: '1px solid #e2e8f0', background: '#fafbfc' }}>
                            <button onClick={(e) => { e.stopPropagation(); setGroupItemLimits(prev => ({ ...prev, [category]: limit + GROUP_PAGE_SIZE })) }}
                              style={{ background: '#2d5fa8', color: '#fff', padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer' }}>
                              더보기 ({limit}/{sortedItems.length}건)
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setGroupItemLimits(prev => ({ ...prev, [category]: sortedItems.length })) }}
                              style={{ background: '#fff', color: '#64748b', padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 12, border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                              전체보기
                            </button>
                          </div>
                        )}
                      </div>
                      )})()}
                  </div>
                )
              })}
            </div>
          )}
          {/* ═══ B1 하단 요약바 (항상 표시) ═══ */}
          {(activeTab === 'classify' || activeTab === 'confirmed') && sourceFilteredItems.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
              borderRadius: '0 0 16px 16px', flexWrap: 'wrap', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                  조회 <span style={{ fontWeight: 800, color: '#0f172a' }}>{summaryTotals.count.toLocaleString()}</span>건
                </span>
                <div style={{ width: 1, height: 14, background: '#e2e8f0' }} />
                <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 700 }}>
                  입금 +{summaryTotals.income.toLocaleString()}
                </span>
                <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>
                  출금 -{summaryTotals.expense.toLocaleString()}
                </span>
                <div style={{ width: 1, height: 14, background: '#e2e8f0' }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: summaryTotals.net >= 0 ? '#2563eb' : '#dc2626' }}>
                  순합계 {summaryTotals.net >= 0 ? '+' : ''}{summaryTotals.net.toLocaleString()}
                </span>
                {summaryTotals.foreignText && (
                  <>
                    <div style={{ width: 1, height: 14, background: '#e2e8f0' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: '#fef3c7', padding: '1px 6px', borderRadius: 4 }}>
                      💱 {summaryTotals.foreignText}
                    </span>
                  </>
                )}
              </div>
              <button style={{
                padding: '5px 12px', borderRadius: 7, fontSize: 10, fontWeight: 700,
                color: '#64748b', background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                📥 내보내기
              </button>
            </div>
          )}

          {/* ═══ B2 선택 시 플로팅 액션 바 ═══ */}
          {selectedIds.size > 0 && (
            <div style={{
              position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              background: '#0f172a', color: '#fff', borderRadius: 14,
              padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 50,
            }}>
              <span style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>
                {selectionTotals.count}건 선택
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                합계 {selectionTotals.total.toLocaleString()}원
                {selectionTotals.foreignText && (
                  <span style={{ color: '#fbbf24', marginLeft: 6 }}>({selectionTotals.foreignText})</span>
                )}
              </span>
              <div style={{ width: 1, height: 20, background: '#334155' }} />
              {activeTab === 'classify' && (
                <button onClick={async () => {
                  const selected = items.filter(i => selectedIds.has(i.id) && i.status !== 'confirmed')
                  const confirmable = selected.filter(i => {
                    const cat = i.ai_category || '미분류'
                    return cat !== '미분류' && cat !== '기타'
                  })
                  if (confirmable.length === 0) return alert('확정 가능한 항목이 없습니다.\n(미분류/기타는 분류 후 확정 가능)')
                  if (!confirm(`${confirmable.length}건을 일괄 확정하시겠습니까?`)) return
                  for (const item of confirmable) {
                    await handleConfirm(item, { category: item.ai_category })
                  }
                  setSelectedIds(new Set())
                  fetchReviewItems()
                }}
                  style={{ background: '#10b981', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 800, fontSize: 12, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  일괄 확정
                </button>
              )}
              {activeTab === 'confirmed' && (
                <button onClick={async () => {
                  if (!confirm(`${selectedIds.size}건을 대기중으로 되돌리시겠습니까?`)) return
                  const selected = items.filter(i => selectedIds.has(i.id))
                  for (const item of selected) await handleRevert(item)
                  setSelectedIds(new Set())
                  fetchReviewItems()
                }}
                  style={{ background: '#fbbf24', color: '#0f172a', padding: '8px 16px', borderRadius: 8, fontWeight: 800, fontSize: 12, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  되돌리기
                </button>
              )}
              <button onClick={() => { setLinkModalOpen(true); setLinkModalTab('car'); setLinkModalSelectedId(null) }}
                style={{ background: '#6366f1', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 800, fontSize: 12, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                🔗 일괄 연결
              </button>
              <button onClick={handleDeleteSelected} disabled={deleting}
                style={{ background: '#dc2626', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 800, fontSize: 12, border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                삭제
              </button>
              <button onClick={() => setSelectedIds(new Set())}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}>
                ✕
              </button>
            </div>
          )}

          {/* 일괄 연결 모달 */}
          {linkModalOpen && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => { setLinkModalOpen(false); setLinkModalSelectedId(null) }}>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
              <div style={{
                position: 'relative', background: '#fff', borderRadius: 16, width: '90%', maxWidth: 600, maxHeight: '80vh',
                display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              }} onClick={e => e.stopPropagation()}>
                {/* 모달 헤더 */}
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                      🔗 {selectedIds.size}건 일괄 연결
                    </h3>
                    <button onClick={() => { setLinkModalOpen(false); setLinkModalSelectedId(null) }}
                      style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer', padding: '4px 8px' }}>✕</button>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>
                    선택한 {selectedIds.size}건의 거래를 하나의 대상에 일괄 연결합니다
                  </p>
                </div>

                {/* 타입 탭 */}
                <div style={{ display: 'flex', gap: 4, padding: '12px 24px 0', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                  {([
                    { key: 'car', icon: '🚗', label: '차량', count: cars.length },
                    { key: 'jiip', icon: '🚛', label: '지입', count: (jiips || []).length },
                    { key: 'invest', icon: '💰', label: '투자자', count: (investors || []).length },
                    { key: 'loan', icon: '🏦', label: '대출', count: (loans || []).length },
                    { key: 'insurance', icon: '🛡️', label: '보험', count: (insurances || []).length },
                  ] as const).map(tab => (
                    <button key={tab.key} onClick={() => { setLinkModalTab(tab.key); setLinkModalSelectedId(null) }}
                      style={{
                        padding: '8px 14px', fontSize: 13, fontWeight: linkModalTab === tab.key ? 800 : 600,
                        color: linkModalTab === tab.key ? '#4f46e5' : '#64748b',
                        background: linkModalTab === tab.key ? '#eef2ff' : 'transparent',
                        border: 'none', borderBottom: linkModalTab === tab.key ? '2px solid #4f46e5' : '2px solid transparent',
                        borderRadius: '8px 8px 0 0', cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>
                      {tab.icon} {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>

                {/* 검색 */}
                <div style={{ padding: '12px 24px' }}>
                  <input
                    type="text"
                    placeholder="검색어 입력..."
                    value={linkPopoverSearch}
                    onChange={e => setLinkPopoverSearch(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0',
                      fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#f8fafc',
                    }}
                  />
                </div>

                {/* 카드 그리드 */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                    {linkModalTab === 'car' && linkOptions.car.map((c: any) => (
                      <div key={c.id} onClick={() => setLinkModalSelectedId(c.id)}
                        style={{
                          padding: '14px 12px', borderRadius: 12, cursor: 'pointer', transition: 'all .15s',
                          border: linkModalSelectedId === c.id ? '2px solid #4f46e5' : '2px solid #e2e8f0',
                          background: linkModalSelectedId === c.id ? '#eef2ff' : '#fff',
                          boxShadow: linkModalSelectedId === c.id ? '0 2px 8px rgba(79,70,229,0.15)' : 'none',
                        }}>
                        <div style={{ fontSize: 20, marginBottom: 6 }}>🚗</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{c.number || '번호없음'}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{[c.brand, c.model].filter(Boolean).join(' ') || '-'}</div>
                      </div>
                    ))}
                    {linkModalTab === 'jiip' && linkOptions.jiip.map((j: any) => (
                      <div key={j.id} onClick={() => setLinkModalSelectedId(j.id)}
                        style={{
                          padding: '14px 12px', borderRadius: 12, cursor: 'pointer', transition: 'all .15s',
                          border: linkModalSelectedId === j.id ? '2px solid #7c3aed' : '2px solid #e2e8f0',
                          background: linkModalSelectedId === j.id ? '#f5f3ff' : '#fff',
                          boxShadow: linkModalSelectedId === j.id ? '0 2px 8px rgba(124,58,237,0.15)' : 'none',
                        }}>
                        <div style={{ fontSize: 20, marginBottom: 6 }}>🚛</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{j.investor_name || '미지정'}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{j.vehicle_number || j.car_number || '-'}</div>
                      </div>
                    ))}
                    {linkModalTab === 'invest' && linkOptions.invest.map((inv: any) => (
                      <div key={inv.id} onClick={() => setLinkModalSelectedId(inv.id)}
                        style={{
                          padding: '14px 12px', borderRadius: 12, cursor: 'pointer', transition: 'all .15s',
                          border: linkModalSelectedId === inv.id ? '2px solid #16a34a' : '2px solid #e2e8f0',
                          background: linkModalSelectedId === inv.id ? '#f0fdf4' : '#fff',
                          boxShadow: linkModalSelectedId === inv.id ? '0 2px 8px rgba(22,163,74,0.15)' : 'none',
                        }}>
                        <div style={{ fontSize: 20, marginBottom: 6 }}>💰</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{inv.investor_name || '미지정'}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{inv.investment_type || '-'}</div>
                      </div>
                    ))}
                    {linkModalTab === 'loan' && linkOptions.loan.map((l: any) => (
                      <div key={l.id} onClick={() => setLinkModalSelectedId(l.id)}
                        style={{
                          padding: '14px 12px', borderRadius: 12, cursor: 'pointer', transition: 'all .15s',
                          border: linkModalSelectedId === l.id ? '2px solid #dc2626' : '2px solid #e2e8f0',
                          background: linkModalSelectedId === l.id ? '#fef2f2' : '#fff',
                          boxShadow: linkModalSelectedId === l.id ? '0 2px 8px rgba(220,38,38,0.15)' : 'none',
                        }}>
                        <div style={{ fontSize: 20, marginBottom: 6 }}>🏦</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{l.finance_name || '미지정'}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{l.loan_type || '-'}</div>
                      </div>
                    ))}
                    {linkModalTab === 'insurance' && linkOptions.insurance.map((ins: any) => (
                      <div key={ins.id} onClick={() => setLinkModalSelectedId(ins.id)}
                        style={{
                          padding: '14px 12px', borderRadius: 12, cursor: 'pointer', transition: 'all .15s',
                          border: linkModalSelectedId === ins.id ? '2px solid #0891b2' : '2px solid #e2e8f0',
                          background: linkModalSelectedId === ins.id ? '#ecfeff' : '#fff',
                          boxShadow: linkModalSelectedId === ins.id ? '0 2px 8px rgba(8,145,178,0.15)' : 'none',
                        }}>
                        <div style={{ fontSize: 20, marginBottom: 6 }}>🛡️</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{ins.company || '미지정'}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{ins.policy_type || '-'}</div>
                      </div>
                    ))}
                  </div>
                  {linkOptions[linkModalTab]?.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', fontSize: 13 }}>
                      {linkPopoverSearch ? '검색 결과가 없습니다' : '등록된 항목이 없습니다'}
                    </div>
                  )}
                </div>

                {/* 하단 푸터 */}
                <div style={{
                  padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', background: '#f8fafc', borderRadius: '0 0 16px 16px',
                }}>
                  <div style={{ fontSize: 13, color: '#64748b' }}>
                    {linkModalSelectedId ? (
                      <span style={{ color: '#4f46e5', fontWeight: 700 }}>
                        ✓ 1개 선택됨
                      </span>
                    ) : '대상을 선택하세요'}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setLinkModalOpen(false); setLinkModalSelectedId(null); setLinkPopoverSearch('') }}
                      style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      취소
                    </button>
                    <button
                      onClick={() => {
                        if (!linkModalSelectedId) return
                        handleBulkLink(linkModalTab, linkModalSelectedId)
                        setLinkPopoverSearch('')
                      }}
                      disabled={!linkModalSelectedId}
                      style={{
                        padding: '10px 24px', borderRadius: 10, border: 'none', fontWeight: 800, fontSize: 13,
                        background: linkModalSelectedId ? '#4f46e5' : '#cbd5e1', color: '#fff',
                        cursor: linkModalSelectedId ? 'pointer' : 'not-allowed',
                      }}>
                      {selectedIds.size}건 연결
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Page Export — UploadProvider는 ClientLayout에서 전역 제공
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export default function UploadFinancePage() {
  return <UploadContent />
}
