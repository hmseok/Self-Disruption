'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import NeuFilterTabs from '@/app/components/NeuFilterTabs'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { useAIProgress } from '@/app/components/AIProgressFloater'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { fetchWithAuth, getAuthHeader } from '@/app/utils/finance-upload'
import * as XLSX from 'xlsx'
// 2026-07-30 개편 2단계 — 탭별 파일 분리
import SmsTab from './SmsTab'
import MappingTab from './MappingTab'
import LedgerTab, { LedgerFilter } from './LedgerTab'
import { SmsRow } from './_shared'

// ═══════════════════════════════════════════════════════════════
// 통장/카드 통합 관리 페이지
// 4탭: 통장 거래 | 카드 거래 | 자동매칭 | 정산 연결
// ═══════════════════════════════════════════════════════════════

// 2026-07-30 개편 2단계 — 도달 불가 탭 5종(workflow/classify/matchreview/rules/system) 삭제
// 거래내역(ledger) = 통장+카드 통합 리스트 (REDESIGN). 통장/카드 탭은 잔액검증·업로드 이관 전까지 병행.
// 2026-08-03 사용자 확정 IA: 장부 = 거래내역 + 수집함(통장/카드) + 매핑(통장·구분).
//   수금 → /finance/collection 독립 메뉴, 카드관리(마스터·카드매핑) → /finance/card-mgmt 독립 메뉴.
type TabKey = 'ledger' | 'sms-bank' | 'sms-card' | 'mapping'

interface Transaction {
  id: string
  transaction_date: string
  type: 'income' | 'expense'
  amount: number
  description: string
  client_name: string | null
  bank_name: string | null
  card_company: string | null
  imported_from: string | null
  related_type: string | null
  related_id: string | null
  balance_after: number | null
  created_at: string
}

interface Settlement {
  id: string
  settlement_month: string
  contract_id: string
  contract_type: string
  recipient_name: string
  due_amount: number
  bank_name: string | null
  account_number: string | null
  status: string
  matched_tx_ids: string | null
  matched_at: string | null
  paid_amount: number | null
}

interface MatchResult {
  transactionId: string
  txDate: string
  txAmount: number
  txName: string
  matchMethod?: 'rule' | 'ai'
  aiReason?: string
  match: {
    type: 'settlement' | 'contract' | 'car' | 'employee' | 'operation'
    id: string
    name: string
    amount: number
    month?: string
    contractType?: string
  }
  score: number
  autoConfirm: boolean
}

interface CategoryBreakdown {
  category: string
  type: string
  count: number
  totalAmount: number
}

interface Summary {
  transactions: { total: number; bank: number; card: number; matched: number; unmatched: number; classified: number; unclassified: number; totalIncome: number; totalExpense: number }
  categoryBreakdown: CategoryBreakdown[]
  settlement: { total: number; linked: number; unlinked: number; totalAmount: number }
  sms: { total: number; linked: number; unlinked: number }
}

// SmsRow — ./_shared 로 이동 (탭 분리)

// ISSUER_LABEL / ISSUER_COLOR — ./_shared 로 이동 (탭 분리)

// ─── 헬퍼 ───────────────────────────────────────────────

const nf = (n: number) => n ? Math.abs(n).toLocaleString() : '0'
const fmtDate = (d: string | null) => {
  if (!d) return '-'
  const s = String(d).replace('T', ' ').slice(0, 10)
  return s
}

// 엑셀 컬럼 자동 인식 — 은행/카드사별 다양한 포맷 지원
const BANK_COL_PATTERNS: Record<string, string[]> = {
  date: ['거래일시', '거래일', '거래일자', '일자', 'date', '날짜', '거래 일시', '거래 일자'],
  description: ['적요', '거래내용', '내용', 'description', '비고', '거래유형', '거래 내용', '거래구분'],
  deposit: ['입금(원)', '입금', '입금액', '입금금액', 'credit', 'deposit', '입금 금액', '입금(원)', '입금 (원)'],
  withdrawal: ['지급(원)', '출금(원)', '출금', '출금액', '출금금액', 'debit', 'withdrawal', '지급액', '지급 금액', '지급(원)', '지급 (원)', '출금 금액'],
  balance: ['거래후잔액(원)', '거래후 잔액(원)', '잔액', '거래후잔액', 'balance', '잔액(원)', '거래 후 잔액', '거래후 잔액', '잔액 (원)'],
  counterpart: ['기재내용', '거래처', '상대방', '이체인', 'payee', '보내는분', '받는분', '보낸분/받는분', '보낸분', '입금인', '기재 내용', '거래상대', '상대계좌', '메모/수취인'],
  memo: ['내 통장 표시', '메모', '비고', '통장표시', '통장메모', '내통장표시', '내 통장표시', '적요2', '취급점'],
}

const CARD_COL_PATTERNS: Record<string, string[]> = {
  date: ['이용일', '이용일자', '승인일', '승인일자', 'date', '이용 일자', '거래일'],
  merchant: ['가맹점명', '이용가맹점', '이용처', 'merchant', '이용가맹점명', '이용 가맹점명', '이용 가맹점', '가맹점'],
  amount: ['이용금액', '승인금액', 'amount', '이용금액(원)', '이용 금액', '승인 금액', '결제금액'],
  // ⚠️ '구분' 은 사용구분(국내/해외/지정/공용)이라 카드사 매핑에서 제외
  cardCompany: ['카드사', '카드명', '카드종류', '발급사', '카드사명'],
  cardNumber: ['카드번호', 'card_number', '이용카드', '카드 번호', '이용 카드'],
  holder: ['사용자', '소지자', 'holder', '이용자'],
  approvalNo: ['승인번호', '승인 번호'],
  cancelAmount: ['취소금액', '취소 금액'],
  installment: ['할부개월', '할부 개월', '할부'],
  businessNo: ['사업자번호', '사업자 번호'],
  // 사용구분(국내/해외/지정/공용) — 카드사가 아닌 별도 의미
  usageScope: ['구분', '국내외', '국내/외', '사용구분'],
  salesType: ['매출구분', '매출 구분'],
}

function matchColumn(header: string, patterns: Record<string, string[]>): string | null {
  const h = header.replace(/\s/g, '').toLowerCase()
  // 1차: 정확히 일치
  for (const [key, pats] of Object.entries(patterns)) {
    if (pats.some(p => h === p.replace(/\s/g, '').toLowerCase())) return key
  }
  // 2차: 포함 (단, 이미 1차에서 매칭된 필드는 제외)
  for (const [key, pats] of Object.entries(patterns)) {
    if (pats.some(p => h.includes(p.replace(/\s/g, '').toLowerCase()))) return key
  }
  return null
}

/**
 * 파일 컬럼 헤더가 통장/카드 중 어느 쪽에 더 맞는지 자동 판별
 * 반환: 'bank' | 'card' | 'unknown'
 */
function detectFileType(headers: string[]): 'bank' | 'card' | 'unknown' {
  let bankScore = 0
  let cardScore = 0
  for (const h of headers) {
    if (matchColumn(h, BANK_COL_PATTERNS)) bankScore++
    if (matchColumn(h, CARD_COL_PATTERNS)) cardScore++
  }
  if (bankScore >= 2 && bankScore > cardScore) return 'bank'
  if (cardScore >= 2 && cardScore > bankScore) return 'card'
  if (bankScore >= 2) return 'bank'
  if (cardScore >= 2) return 'card'
  return 'unknown'
}

/**
 * 은행/카드 엑셀 파일의 실제 데이터 헤더 행을 자동 감지
 * 우리은행 등: 상단에 계좌번호, 조회기간 등 메타 행이 있고 실제 헤더는 아래에 있음
 * raw 2D 배열에서 패턴 매칭이 2개 이상인 행을 헤더로 인식
 */
function findHeaderRow(
  ws: XLSX.WorkSheet,
  patterns: Record<string, string[]>
): { headerRowIdx: number; headers: string[] } | null {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  for (let r = range.s.r; r <= Math.min(range.e.r, 20); r++) {
    const cells: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = ws[addr]
      cells.push(cell ? String(cell.v || '').trim() : '')
    }
    // 이 행에서 패턴 매칭되는 컬럼 수 확인
    // 합계행 오인식 방지: 셀 길이 30자 이하인 것만 카운트
    // (예: "출금합계 : 644,247,505" 같은 합계값은 실제 헤더가 아님)
    let matchCount = 0
    for (const cell of cells) {
      if (cell && cell.length <= 30 && matchColumn(cell, patterns)) matchCount++
    }
    // 3개 이상 매칭되면 헤더 행으로 인식 (2개는 합계행 오인식 위험)
    if (matchCount >= 3) {
      return { headerRowIdx: r, headers: cells.filter(c => c !== '') }
    }
  }
  return null
}

function safeNum(v: any): number {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v).replace(/[,\s₩원$]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

// ─── 상태 배지 ──────────────────────────────────────────

const MatchBadge = ({ matched }: { matched: boolean }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
    background: matched ? COLORS.bgGreen : COLORS.bgAmber,
    color: matched ? COLORS.success : COLORS.warning,
    border: `1px solid ${matched ? COLORS.borderGreen : COLORS.borderAmber}`,
    whiteSpace: 'nowrap', flexShrink: 0,
  }}>
    {matched ? '● 매칭' : '○ 미매칭'}
  </span>
)

const ScoreBadge = ({ score }: { score: number }) => {
  const tone = score >= 75 ? 'success' : score >= 50 ? 'warning' : 'danger'
  return (
    <span style={{
      ...pillStyle(tone as any),
      fontSize: 11, fontWeight: 700,
    }}>
      {score}%
    </span>
  )
}

const TypeBadge = ({ type }: { type: string }) => (
  <span style={{
    fontSize: 11, fontWeight: 600,
    color: type === 'income' ? COLORS.income : COLORS.expense,
  }}>
    {type === 'income' ? '입금' : '출금'}
  </span>
)

// ═══════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════════

export default function BankCardPage() {
  // ─── 상태 ────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState<TabKey>('ledger')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // 고급 탭 묶음 제거 (2026-07-08 사용자 명시) — 탭은 통장/카드/SMS수집/매핑관리 4개만

  // PR-RECONCILE — 잔액 맞춰보기 (은행 실제 잔액 증감 vs 시스템 입출금 합계)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [rcFrom, setRcFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })
  const [rcTo, setRcTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [rcBank, setRcBank] = useState<'all' | 'woori' | 'kb'>('all')
  const [rcAccount, setRcAccount] = useState('')  // V10 — 계좌 끝4자리 (사슬 검사 정확도 최상)
  const [rcStart, setRcStart] = useState('')
  const [rcEnd, setRcEnd] = useState('')
  const [rcBusy, setRcBusy] = useState(false)
  const [rcResult, setRcResult] = useState<any>(null)

  // override — 배지 클릭 등에서 state 반영 기다리지 않고 바로 실행 (2026-07-08 사용자 명시 「바로 내역이 나와야」)
  const runReconcile = useCallback(async (override?: { account?: string; from?: string; to?: string }) => {
    setRcBusy(true)
    setRcResult(null)
    try {
      const from = override?.from ?? rcFrom
      const to = override?.to ?? rcTo
      const account = override?.account ?? rcAccount
      const { json } = await fetchWithAuth(`/api/finance/bank-reconcile?from=${from}&to=${to}&bank=${rcBank}&account=${account}`)
      if (json?.error) throw new Error(json.error)
      setRcResult(json)
    } catch (e: any) {
      setRcResult({ error: e?.message || '계산 오류' })
    } finally {
      setRcBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rcFrom, rcTo, rcBank, rcAccount])

  // 데이터
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [matchResults, setMatchResults] = useState<MatchResult[]>([])

  // 서브 필터

  // 업로드 모달
  const [showUpload, setShowUpload] = useState(false)
  const [uploadSource, setUploadSource] = useState<'excel_bank' | 'excel_card'>('excel_bank')
  const [uploadPreview, setUploadPreview] = useState<any[]>([])
  const [uploadColumns, setUploadColumns] = useState<Record<string, string>>({})
  const [uploadFileName, setUploadFileName] = useState('')
  const [uploadAccountLast4, setUploadAccountLast4] = useState('')  // V10 — 통장 엑셀 계좌 지정
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadResult, setUploadResult] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // 복수 파일 지원
  const [uploadFiles, setUploadFiles] = useState<{ name: string; rows: any[]; columns: Record<string, string>; result?: any }[]>([])
  const [currentFileIndex, setCurrentFileIndex] = useState(0)

  // 인라인 수정
  // 거래 분리 모달
  const [splitTarget, setSplitTarget] = useState<Transaction | null>(null)
  const [splitItems, setSplitItems] = useState<{ amount: string; description: string; client_name: string }[]>([])
  const [splitting, setSplitting] = useState(false)
  // 별칭 등록 제안
  const [aliasPrompt, setAliasPrompt] = useState<{ bankName: string; actualName: string } | null>(null)
  // 파일 필터링 경고
  const [skippedFiles, setSkippedFiles] = useState<string[]>([])

  // 매칭 모달
  const [showMatchModal, setShowMatchModal] = useState(false)
  const [matchCandidates, setMatchCandidates] = useState<any[]>([])
  const [matchTarget, setMatchTarget] = useState<any>(null)

  // 자동매칭 진행
  const [matching, setMatching] = useState(false)
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set())

  // 그룹 분류
  const [groupData, setGroupData] = useState<any>(null)
  const [groupLoading, setGroupLoading] = useState(false)
  const [groupFilter, setGroupFilter] = useState<'all' | 'suggested' | 'unclassified'>('all')
  const [groupSourceFilter, setGroupSourceFilter] = useState<'all' | 'excel_bank' | 'excel_card' | 'sms'>('all')
  const [groupTypeFilter, setGroupTypeFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [groupCategoryEdits, setGroupCategoryEdits] = useState<Record<string, string>>({})
  const [groupConfirming, setGroupConfirming] = useState<Set<string>>(new Set())

  // 차량 목록 (분류 검수에서 차량 매칭 변경 dropdown 용)
  const [cars, setCars] = useState<Array<{ id: string; number: string; brand?: string; model?: string }>>([])

  // 풀 자동 매칭 결과 — 글래스 패널로 표시 (alert 대신, CLAUDE.md 규칙 20)
  const [fullMatchResult, setFullMatchResult] = useState<{
    phase1: Array<{ name: string; ok: boolean; applied: number; total: number; skipStr: string; errMsg?: string }>
    ai: { error?: string; initial: number; applied: number; below: number; batches: number; force: boolean }
    triggeredAt: string
  } | null>(null)

  // AI 분류 검수 결과 — 글래스 패널 (alert 대신, CLAUDE.md 규칙 20)
  const [aiReviewResult, setAiReviewResult] = useState<{
    summary: any
    by_category: any[]
    inconsistent: any[]
    user_overridden: any[]
    top_unclassified_high_value: any[]
    triggeredAt: string
  } | null>(null)

  // 분류 검수 — 검색/필터/묶음 (사용자 명령: 200건 하나씩 X, 필터 + 묶음으로 일괄)
  const [reviewSearch, setReviewSearch] = useState('')
  const [reviewFilterCard, setReviewFilterCard] = useState<string>('all') // 카드 alias 또는 'all' / 'no_card'
  const [reviewFilterMatch, setReviewFilterMatch] = useState<'all' | 'matched' | 'unmatched'>('all')
  const [reviewFilterAmount, setReviewFilterAmount] = useState<'all' | 'lt10k' | '10k-50k' | '50k-100k' | 'gt100k'>('all')
  const [reviewFilterTxType, setReviewFilterTxType] = useState<'all' | 'expense' | 'income' | 'canceled'>('all')
  const [reviewGroupByMerchant, setReviewGroupByMerchant] = useState(false)

  // 다중 매칭 (transaction_assignments) — Phase 2: 한 거래 → N entity
  const [assignmentsByTx, setAssignmentsByTx] = useState<Record<string, any[]>>({})
  const loadAssignments = useCallback(async (txId: string) => {
    if (assignmentsByTx[txId]) return
    try {
      const { json } = await fetchWithAuth(`/api/finance/transactions/${txId}/assignments`)
      setAssignmentsByTx(prev => ({ ...prev, [txId]: json?.data || [] }))
    } catch { /* skip */ }
  }, [assignmentsByTx])

  const addAssignment = async (txId: string, type: string, entityId: string) => {
    try {
      const { json } = await fetchWithAuth(`/api/finance/transactions/${txId}/assignments`, {
        method: 'POST',
        body: { assignment_type: type, assignment_id: entityId },
      })
      if (json?.error) { alert(`매칭 추가 실패: ${json.error}`); return }
      if (json?.already_exists) { alert('이미 매칭됨'); return }
      // UI 갱신 — 새 매칭 추가
      const cfg = MATCH_TYPES.find(t => t.type === type)
      const ent = (matchEntities[type] || []).find((r: any) => String(r.id) === String(entityId))
      const newRow = {
        id: json.id, transaction_id: txId,
        assignment_type: type, assignment_id: entityId,
        ratio: 100, source: 'manual',
        _label: (cfg && ent) ? cfg.labelFn(ent) : entityId,
        _typeLabel: cfg?.label || type,
      }
      setAssignmentsByTx(prev => ({ ...prev, [txId]: [...(prev[txId] || []), newRow] }))
    } catch (e: any) {
      alert(`매칭 추가 오류: ${e?.message}`)
    }
  }

  const removeAssignment = async (txId: string, rowId: string) => {
    try {
      await fetchWithAuth(`/api/finance/transactions/${txId}/assignments?row_id=${rowId}`, { method: 'DELETE' })
      setAssignmentsByTx(prev => ({
        ...prev,
        [txId]: (prev[txId] || []).filter((r: any) => r.id !== rowId),
      }))
    } catch (e: any) {
      alert(`매칭 제거 오류: ${e?.message}`)
    }
  }

  // 일괄 선택 — 3 화면 가로질러 불규칙 체크 (분류 검수 / 매칭 검수 / LOW 그룹)
  // (CLAUDE.md 규칙 14 — 동형 패턴 통합)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectMany = (ids: string[], checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) ids.forEach(id => next.add(id))
      else ids.forEach(id => next.delete(id))
      return next
    })
  }
  const clearSelection = () => setSelectedIds(new Set())

  // ─── 매칭 통합 (2단 dropdown) ──────────────────────────────
  // 모든 related_type 의 entity 목록 lazy load
  // (CLAUDE.md 규칙 14 — 동형 패턴 통합)
  const MATCH_TYPES: Array<{
    type: string
    label: string
    api: string
    labelFn: (r: any) => string
  }> = [
    { type: 'car', label: '🚗 차량', api: '/api/finance-upload?table=cars', labelFn: (r) => `${r.number || '?'}${r.brand || r.model ? ` (${[r.brand, r.model].filter(Boolean).join(' ')})` : ''}` },
    { type: 'employee', label: '👤 직원', api: '/api/employees', labelFn: (r) => r.name || r.email || '?' },
    { type: 'salary', label: '💰 급여 (직원)', api: '/api/employees', labelFn: (r) => r.name || r.email || '?' },
    { type: 'insurance', label: '📄 보험', api: '/api/insurance', labelFn: (r) => `${r.insurance_company || '?'}${r.policy_number ? ` · ${r.policy_number}` : ''}` },
    { type: 'loan', label: '💳 대출', api: '/api/loans', labelFn: (r) => `${r.finance_name || '?'}${r.principal ? ` · ${Number(r.principal).toLocaleString()}원` : ''}` },
    { type: 'jiip', label: '🤝 지입', api: '/api/jiip', labelFn: (r) => `${r.investor_name || '?'}${r.car_number ? ` · ${r.car_number}` : ''}` },
    { type: 'invest', label: '📈 투자', api: '/api/investments', labelFn: (r) => `${r.investor_name || '?'}${r.amount ? ` · ${Number(r.amount).toLocaleString()}원` : ''}` },
    { type: 'fmi_rental', label: '🏷️ 렌탈', api: '/api/fmi-rentals', labelFn: (r) => `${r.customer_name || '?'}${r.car_number ? ` · ${r.car_number}` : ''}` },
    { type: 'rental', label: '🏷️ 렌탈 (구)', api: '/api/fmi-rentals', labelFn: (r) => `${r.customer_name || '?'}${r.car_number ? ` · ${r.car_number}` : ''}` },
    { type: 'contract', label: '📝 계약', api: '/api/contracts', labelFn: (r) => `${r.customer_name || '?'}` },
    { type: 'card', label: '💳 카드 (법인)', api: '/api/corporate-cards', labelFn: (r) => `${r.card_alias || r.card_number || '?'}${r.holder_name ? ` · ${r.holder_name}` : ''}` },
  ]
  const [matchEntities, setMatchEntities] = useState<Record<string, any[]>>({})
  const [matchEntityLoading, setMatchEntityLoading] = useState<Record<string, boolean>>({})

  // ─── 「매칭 검수」 탭 (entity 중심 — C안) ──────────────────
  // 분류된 거래의 entity 별 group (차량/직원/투자자/지입/보험/대출 등)
  const [matchReviewByEntity, setMatchReviewByEntity] = useState<{
    entities: Record<string, any[]>
    unmatched: { count: number; totalAmount: number }
    summary: { totalEntities: number; totalMatched: number; totalUnmatched: number }
  } | null>(null)
  const [matchReviewLoading, setMatchReviewLoading] = useState(false)
  // 매칭 시스템 진단 결과
  const [matchDiagnostic, setMatchDiagnostic] = useState<any | null>(null)
  const [matchDiagnosticLoading, setMatchDiagnosticLoading] = useState(false)
  const runMatchDiagnostic = async () => {
    setMatchDiagnosticLoading(true)
    try {
      const { json } = await fetchWithAuth('/api/finance/match-review/diagnostic')
      if (json && !json.error) setMatchDiagnostic(json)
      else alert('진단 실패: ' + (json?.error || '응답 없음'))
    } catch (e: any) {
      alert('진단 실패: ' + e.message)
    } finally {
      setMatchDiagnosticLoading(false)
    }
  }
  // 대차건 보험 매칭 단독 실행 결과
  const [fmiRentalMatchResult, setFmiRentalMatchResult] = useState<any | null>(null)
  const [fmiRentalMatching, setFmiRentalMatching] = useState(false)
  // 결과 패널 카테고리별 펼침 상태 (검수용 — 사용자 명시 「뭐가 매칭됐는지 따로 챙겨서 검수」)
  const [fmiRentalExpand, setFmiRentalExpand] = useState<{
    matched: boolean, mismatch: boolean, failed: boolean
  }>({ matched: false, mismatch: false, failed: false })

  // 투자자/지입자 입금자명 매칭 결과
  const [investorJiipResult, setInvestorJiipResult] = useState<any | null>(null)
  const [investorJiipLoading, setInvestorJiipLoading] = useState(false)
  const [investorJiipExpand, setInvestorJiipExpand] = useState<{ matched: boolean; multi: boolean; failed: boolean }>({ matched: false, multi: false, failed: false })
  // 직원 매칭 결과 (profiles + ride_employees)
  const [employeeMatchResult, setEmployeeMatchResult] = useState<any | null>(null)
  const [employeeMatchLoading, setEmployeeMatchLoading] = useState(false)
  const [employeeMatchExpand, setEmployeeMatchExpand] = useState<{ matched: boolean; multi: boolean; failed: boolean }>({ matched: false, multi: false, failed: false })
  const runEmployeeMatch = async (dryRun: boolean) => {
    setEmployeeMatchLoading(true)
    setEmployeeMatchResult(null)
    const taskId = floaterProgress.start({
      title: dryRun ? '🔍 직원 매칭 dry-run' : '👥 직원 매칭',
      total: 1,
    })
    try {
      const { ok, json, status } = await fetchWithAuth('/api/finance/transactions/auto-match-employee', {
        method: 'POST',
        body: { source: 'both', dryRun },
      })
      if (!ok) {
        floaterProgress.finish(taskId, `오류: HTTP ${status} — ${json?.error || ''}`, 'error')
        return
      }
      setEmployeeMatchResult(json)
      floaterProgress.update(taskId, { processed: 1, applied: json.applied || 0 })
      floaterProgress.finish(
        taskId,
        dryRun ? `🔍 dry-run — 매칭 가능 ${json.matched || 0}건` : `✅ ${json.applied || 0}건 매칭 적용`,
      )
      if (!dryRun && json.applied > 0) await loadMatchReview()
    } catch (e: any) {
      floaterProgress.finish(taskId, `오류: ${e.message}`, 'error')
    } finally {
      setEmployeeMatchLoading(false)
    }
  }
  // 프리랜서 매칭 (freelancers — 외부 인력)
  const [freelancerMatchResult, setFreelancerMatchResult] = useState<any | null>(null)
  const [freelancerMatchLoading, setFreelancerMatchLoading] = useState(false)
  const [freelancerMatchExpand, setFreelancerMatchExpand] = useState<{ matched: boolean; multi: boolean; failed: boolean }>({ matched: false, multi: false, failed: false })
  const runFreelancerMatch = async (dryRun: boolean) => {
    setFreelancerMatchLoading(true)
    setFreelancerMatchResult(null)
    const taskId = floaterProgress.start({
      title: dryRun ? '🔍 프리랜서 매칭 dry-run' : '🤝 프리랜서 매칭',
      total: 1,
    })
    try {
      const { ok, json, status } = await fetchWithAuth('/api/finance/transactions/auto-match-freelancer', {
        method: 'POST',
        body: { dryRun },
      })
      if (!ok) {
        floaterProgress.finish(taskId, `오류: HTTP ${status} — ${json?.error || ''}`, 'error')
        return
      }
      setFreelancerMatchResult(json)
      floaterProgress.update(taskId, { processed: 1, applied: json.applied || 0 })
      floaterProgress.finish(
        taskId,
        dryRun ? `🔍 dry-run — 매칭 가능 ${json.matched || 0}건` : `✅ ${json.applied || 0}건 매칭 적용`,
      )
      if (!dryRun && json.applied > 0) await loadMatchReview()
    } catch (e: any) {
      floaterProgress.finish(taskId, `오류: ${e.message}`, 'error')
    } finally {
      setFreelancerMatchLoading(false)
    }
  }

  const runInvestorJiipMatch = async (dryRun: boolean) => {
    setInvestorJiipLoading(true)
    setInvestorJiipResult(null)
    const taskId = floaterProgress.start({
      title: dryRun ? '🔍 투자/지입 매칭 dry-run' : '💼 투자/지입 매칭',
      total: 1,
    })
    try {
      const { ok, json, status } = await fetchWithAuth('/api/finance/transactions/auto-match-investor-jiip', {
        method: 'POST',
        body: { mode: 'both', dryRun },
      })
      if (!ok) {
        floaterProgress.finish(taskId, `오류: HTTP ${status} — ${json?.error || ''}`, 'error')
        return
      }
      setInvestorJiipResult(json)
      floaterProgress.update(taskId, { processed: 1, applied: json.applied || 0 })
      floaterProgress.finish(
        taskId,
        dryRun ? `🔍 dry-run — 매칭 가능 ${json.matched || 0}건` : `✅ ${json.applied || 0}건 매칭 적용`,
      )
      if (!dryRun && json.applied > 0) await loadMatchReview()
    } catch (e: any) {
      floaterProgress.finish(taskId, `오류: ${e.message}`, 'error')
    } finally {
      setInvestorJiipLoading(false)
    }
  }
  // ── PR-UX1: 통합 자동 매칭 (4 매처 일괄) ──
  // 사용자 명령 — 8 버튼 → 2 클릭 (dry-run + 확정 적용)
  const [autoMatchAllLoading, setAutoMatchAllLoading] = useState(false)
  const [autoMatchAllResult, setAutoMatchAllResult] = useState<null | {
    mode: 'dry-run' | 'apply'
    ts: number
    matchers: {
      insurance: { matched: number; applied: number; ok: boolean; err?: string }
      invest:    { matched: number; applied: number; ok: boolean; err?: string }
      employee:  { matched: number; applied: number; ok: boolean; err?: string }
      freelancer:{ matched: number; applied: number; ok: boolean; err?: string }
    }
    total_matched: number
    total_applied: number
  }>(null)
  const [showAdvancedMatchers, setShowAdvancedMatchers] = useState(false)

  // ── PR-UX1.5 + PR-UX2 + PR-UX3-A: 처리 현황 + 분기 + 매칭 확정 + 1-Click ──
  const [processingStatus, setProcessingStatus] = useState<null | {
    funnel: Array<{ key: string; label: string; done: number; todo: number; value: number; sub: string }>
    total: number
    today_input: number
    classified: number
    unclassified: number
    matched: number
    unmatched: number
    pending_auto: number
    confirmed: number
    rejected: number
    processed_pct: number
    last_auto_match_at: string | null
    recommended_actions: Array<{ key: string; label: string; priority: number; reason: string }>
    // PR-UX3-A: 분기 카운트
    req_match_total: number
    req_match_matched: number
    req_match_unmatched: number
    auto_final: number
    final_count: number
  }>(null)
  const [processingStatusLoading, setProcessingStatusLoading] = useState(false)
  const [confirmingMatchings, setConfirmingMatchings] = useState(false)

  // PR-UX3-B: 검수 대기 큐 (PR-UX7.1: 출처 정보 추가)
  type PendingReviewItem = {
    assignment_id: string
    transaction_id: string
    tx_date: string
    tx_type: string
    tx_amount: number
    client_name: string
    description: string
    category: string | null
    matched_type: string
    matched_id: string
    matched_name: string
    source: string
    suspect: boolean
    suspect_reasons: string[]
    // PR-UX7.1
    source_type?: 'card' | 'bank' | 'unknown'
    source_label?: string
    source_detail?: string
    is_canceled?: boolean
    sms_merchant?: string | null
    sms_holder?: string | null
    // PR-UX10: entity 타입 라벨 + corporate_cards 정보
    matched_type_label?: string
    cc_card_alias?: string | null
    cc_holder_name?: string | null
  }
  const [reviewQueue, setReviewQueue] = useState<{
    items: PendingReviewItem[]
    page: number
    pageSize: number
    total: number
    hasMore: boolean
  } | null>(null)
  const [reviewQueueLoading, setReviewQueueLoading] = useState(false)
  const [reviewQueueShown, setReviewQueueShown] = useState(false)
  const [reviewQueueFilter, setReviewQueueFilter] = useState<{ matcher: string; suspectOnly: boolean }>({ matcher: 'all', suspectOnly: false })
  const [reviewActionLoading, setReviewActionLoading] = useState<Record<string, boolean>>({})

  const loadReviewQueue = async (page: number = 1) => {
    setReviewQueueLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', '20')
      params.set('matcher', reviewQueueFilter.matcher)
      params.set('suspectOnly', String(reviewQueueFilter.suspectOnly))
      const { ok, json } = await fetchWithAuth(`/api/finance/transactions/pending-review?${params}`, { method: 'GET' })
      if (ok) setReviewQueue(json)
    } catch (e: any) {
      console.error('[review-queue]', e)
    } finally {
      setReviewQueueLoading(false)
    }
  }

  const reviewItemAction = async (item: PendingReviewItem, action: 'confirm' | 'reject') => {
    setReviewActionLoading(prev => ({ ...prev, [item.assignment_id]: true }))
    try {
      const { ok, json } = await fetchWithAuth('/api/finance/transactions/confirm-matchings', {
        method: 'POST',
        body: { mode: action === 'confirm' ? 'specific' : 'reject', assignmentIds: [item.assignment_id] },
      })
      if (ok) {
        // 리스트에서 즉시 제거 (optimistic)
        setReviewQueue(prev => prev ? {
          ...prev,
          items: prev.items.filter(it => it.assignment_id !== item.assignment_id),
          total: prev.total - 1,
        } : null)
        // 상태 패널 갱신
        await loadProcessingStatus()
      } else {
        alert(`처리 실패: ${json?.error || ''}`)
      }
    } finally {
      setReviewActionLoading(prev => ({ ...prev, [item.assignment_id]: false }))
    }
  }

  const reviewBulkConfirmPage = async () => {
    if (!reviewQueue || reviewQueue.items.length === 0) return
    if (!confirm(`현재 페이지 ${reviewQueue.items.length}건을 모두 확정합니다. 계속할까요?`)) return
    const ids = reviewQueue.items.map(it => it.assignment_id)
    setReviewQueueLoading(true)
    try {
      const { ok, json } = await fetchWithAuth('/api/finance/transactions/confirm-matchings', {
        method: 'POST',
        body: { mode: 'specific', assignmentIds: ids },
      })
      if (ok) {
        await loadReviewQueue(reviewQueue.page)
        await loadProcessingStatus()
      } else {
        alert(`일괄 확정 실패: ${json?.error || ''}`)
      }
    } finally {
      setReviewQueueLoading(false)
    }
  }

  const [runWorkflowLoading, setRunWorkflowLoading] = useState(false)
  const [runWorkflowResult, setRunWorkflowResult] = useState<null | {
    steps: Array<{ key: string; label: string; ok: boolean; applied?: number; matched?: number; error?: string; duration_ms: number }>
    total_applied: number
    total_matched: number
    duration_ms: number
    ts: number
  }>(null)

  // PR-UX4: 자동 스케줄 설정 모달
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [scheduleConfig, setScheduleConfig] = useState<null | {
    id: string | null
    enabled: boolean
    schedule_hour: number
    schedule_minute: number
    steps: string[]
    auto_confirm: boolean
    last_run_at: string | null
    last_run_status: string | null
    next_run_at: string | null
    _migration_pending?: boolean
  }>(null)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const loadScheduleConfig = async () => {
    try {
      const { ok, json } = await fetchWithAuth('/api/finance/auto-match-schedule', { method: 'GET' })
      if (ok) setScheduleConfig(json)
    } catch (e: any) {
      console.error('[schedule load]', e)
    }
  }
  const saveScheduleConfig = async () => {
    if (!scheduleConfig) return
    setScheduleSaving(true)
    try {
      const { ok, json } = await fetchWithAuth('/api/finance/auto-match-schedule', {
        method: 'POST',
        body: scheduleConfig,
      })
      if (ok) {
        setScheduleConfig({ ...scheduleConfig, ...json })
        alert(json.message || '✅ 저장 완료')
      } else {
        alert(`저장 실패: ${json?.error || ''}`)
      }
    } finally {
      setScheduleSaving(false)
    }
  }
  const triggerScheduleRunNow = async () => {
    if (!confirm('스케줄을 지금 즉시 실행하시겠습니까?\n(테스트용 — 시간 검사 skip)')) return
    setScheduleSaving(true)
    try {
      const { ok, json } = await fetchWithAuth('/api/finance/auto-match-schedule/run', {
        method: 'POST',
        body: { force: true },
      })
      if (ok) {
        alert(`실행 결과: ${json.run_status}\n${JSON.stringify(json.result?.steps?.length || 0)} steps`)
        await loadScheduleConfig()
      } else {
        alert(`실행 실패: ${json?.error || ''}`)
      }
    } finally {
      setScheduleSaving(false)
    }
  }

  const loadProcessingStatus = async () => {
    setProcessingStatusLoading(true)
    try {
      const { ok, json } = await fetchWithAuth('/api/finance/transactions/processing-status', { method: 'GET' })
      if (ok) setProcessingStatus(json)
    } catch (e: any) {
      console.error('[processing-status]', e)
    } finally {
      setProcessingStatusLoading(false)
    }
  }

  // PR-UX2: 1-Click 자동 진행 (분류 + 매칭 일괄)
  const runWorkflow = async (autoConfirm: boolean = false) => {
    if (!confirm(
      `🚀 전체 운영 흐름 1-Click 자동 진행:\n\n` +
      `① 룰 분류 (즉시)\n` +
      `② AI 분류 (Gemini · 1~3분 · 토큰 소모)\n` +
      `③ 대차건 보험 매칭\n` +
      `④ 투자/지입 매칭\n` +
      `⑤ 직원 매칭\n` +
      `⑥ 프리랜서 매칭\n` +
      `⑦ 보험료 분담금 (insurance_contracts 등록된 경우)\n` +
      (autoConfirm ? `⑧ 자동 매칭 결과 자동 확정 (사용자 검수 skip)\n` : '') +
      `\n· 약 2~5분 소요 · 중간 정지 불가\n\n계속할까요?`
    )) return
    setRunWorkflowLoading(true)
    setRunWorkflowResult(null)
    const taskId = floaterProgress.start({
      title: autoConfirm ? '🚀 1-Click 자동 + 자동 확정' : '🚀 1-Click 자동 (분류 + 매칭)',
      total: autoConfirm ? 7 : 6,
    })
    try {
      const steps = [
        'classify-rule', 'classify-ai',
        'match-fmi-rental', 'match-investor-jiip', 'match-employee', 'match-freelancer',
        // PR-UX9.1: 보험료 분담금 매처 (insurance_contracts 등록된 경우만)
        'match-insurance-premium',
      ]
      if (autoConfirm) steps.push('auto-confirm')
      const { ok, json, status } = await fetchWithAuth('/api/finance/transactions/run-workflow', {
        method: 'POST',
        body: { steps },
      })
      if (!ok) {
        floaterProgress.finish(taskId, `오류: HTTP ${status} — ${json?.error || ''}`, 'error')
        return
      }
      const okCount = (json.steps || []).filter((s: any) => s.ok).length
      floaterProgress.update(taskId, { processed: json.steps?.length || 0, applied: json.total_applied || 0 })
      floaterProgress.finish(
        taskId,
        `✅ ${okCount}/${json.steps?.length || 0} 단계 성공 — 총 ${json.total_applied || 0}건 적용 (${Math.round((json.duration_ms || 0) / 1000)}초)`,
      )
      setRunWorkflowResult({
        steps: json.steps || [],
        total_applied: json.total_applied || 0,
        total_matched: json.total_matched || 0,
        duration_ms: json.duration_ms || 0,
        ts: Date.now(),
      })
      await loadProcessingStatus()
      await loadMatchReview()
    } catch (e: any) {
      floaterProgress.finish(taskId, `오류: ${e.message}`, 'error')
    } finally {
      setRunWorkflowLoading(false)
    }
  }

  const confirmAllMatchings = async () => {
    if (!processingStatus || processingStatus.pending_auto === 0) return
    if (!confirm(
      `자동 매칭 결과 ${processingStatus.pending_auto}건을 일괄 확정합니다.\n\n` +
      `· 확정 후엔 final 보고서/통계에 반영됩니다\n` +
      `· 잘못 매칭된 건은 [거부] 로 되돌릴 수 있습니다 (개별)\n\n` +
      `계속할까요?`
    )) return
    setConfirmingMatchings(true)
    const taskId = floaterProgress.start({
      title: '✅ 매칭 일괄 확정',
      total: 1,
    })
    try {
      const { ok, json, status } = await fetchWithAuth('/api/finance/transactions/confirm-matchings', {
        method: 'POST',
        body: { mode: 'all' },
      })
      if (!ok) {
        floaterProgress.finish(taskId, `오류: HTTP ${status} — ${json?.error || ''}`, 'error')
        return
      }
      floaterProgress.update(taskId, { processed: 1, applied: json.updated || 0 })
      floaterProgress.finish(taskId, `✅ ${json.updated || 0}건 확정 — 검증 ${json.verify?.ok ? 'PASS' : 'FAIL'}`)
      await loadProcessingStatus()
      await loadMatchReview()
    } catch (e: any) {
      floaterProgress.finish(taskId, `오류: ${e.message}`, 'error')
    } finally {
      setConfirmingMatchings(false)
    }
  }

  const runAutoMatchAll = async (mode: 'dry-run' | 'apply') => {
    const dryRun = mode === 'dry-run'
    setAutoMatchAllLoading(true)
    if (dryRun) setAutoMatchAllResult(null)
    const taskId = floaterProgress.start({
      title: dryRun ? '🪄 자동 매칭 dry-run' : '🪄 자동 매칭 적용',
      total: 4,
    })
    // 우선순위 순서 — insurance → invest → employee → freelancer
    const phases = [
      { key: 'insurance' as const, label: '대차건 보험',
        url: '/api/finance/transactions/auto-match-fmi-rental',  body: { mode: 'insurance', dryRun } },
      { key: 'invest'    as const, label: '투자/지입',
        url: '/api/finance/transactions/auto-match-investor-jiip', body: { mode: 'both', dryRun } },
      { key: 'employee'  as const, label: '직원',
        url: '/api/finance/transactions/auto-match-employee',   body: { source: 'both', dryRun } },
      { key: 'freelancer'as const, label: '프리랜서',
        url: '/api/finance/transactions/auto-match-freelancer', body: { dryRun } },
    ]
    const results: any = {
      insurance:  { matched: 0, applied: 0, ok: false },
      invest:     { matched: 0, applied: 0, ok: false },
      employee:   { matched: 0, applied: 0, ok: false },
      freelancer: { matched: 0, applied: 0, ok: false },
    }
    let totalApplied = 0
    for (let i = 0; i < phases.length; i++) {
      const ph = phases[i]
      try {
        const { ok, json, status } = await fetchWithAuth(ph.url, { method: 'POST', body: ph.body })
        if (ok) {
          results[ph.key].matched = Number(json.matched || 0)
          results[ph.key].applied = Number(json.applied || 0)
          results[ph.key].ok = true
          totalApplied += results[ph.key].applied
        } else {
          results[ph.key].ok = false
          results[ph.key].err = `HTTP ${status} — ${json?.error || ''}`
        }
      } catch (e: any) {
        results[ph.key].ok = false
        results[ph.key].err = e?.message || String(e)
      }
      floaterProgress.update(taskId, { processed: i + 1, applied: totalApplied })
    }
    const totalMatched = (Object.values(results) as any[]).reduce((a, r) => a + r.matched, 0)
    setAutoMatchAllResult({
      mode,
      ts: Date.now(),
      matchers: results,
      total_matched: totalMatched,
      total_applied: totalApplied,
    })
    floaterProgress.finish(
      taskId,
      dryRun
        ? `🔍 dry-run — 매칭 가능 ${totalMatched}건`
        : `✅ ${totalApplied}건 매칭 적용 (4 매처 합계)`,
    )
    if (!dryRun && totalApplied > 0) {
      await loadMatchReview()
      await loadProcessingStatus()
    }
    setAutoMatchAllLoading(false)
  }

  const runFmiRentalMatch = async (dryRun: boolean) => {
    setFmiRentalMatching(true)
    setFmiRentalMatchResult(null)
    const taskId = floaterProgress.start({
      title: dryRun ? '🔍 대차건 보험 매칭 dry-run' : '📥 대차건 보험 매칭',
      total: 1,
    })
    try {
      const { ok, json, status } = await fetchWithAuth('/api/finance/transactions/auto-match-fmi-rental', {
        method: 'POST',
        body: { mode: 'insurance', dryRun },
      })
      if (!ok) {
        floaterProgress.finish(taskId, `오류: HTTP ${status} — ${json?.error || ''}`, 'error')
        return
      }
      setFmiRentalMatchResult(json)
      floaterProgress.update(taskId, { processed: 1, applied: json.applied || 0 })
      floaterProgress.finish(
        taskId,
        dryRun
          ? `🔍 dry-run 완료 — 매칭 가능 ${json.matched || 0}건`
          : `✅ ${json.applied || 0}건 매칭 적용`,
      )
      if (!dryRun && json.applied > 0) await loadMatchReview()
    } catch (e: any) {
      floaterProgress.finish(taskId, `오류: ${e.message}`, 'error')
    } finally {
      setFmiRentalMatching(false)
    }
  }
  const [matchReviewTypeFilter, setMatchReviewTypeFilter] = useState<string>('all') // 'all' | 'unmatched' | type
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null) // 펼친 entity (type:id)
  const [entityTransactions, setEntityTransactions] = useState<Record<string, any[]>>({}) // entity 별 거래 lazy load
  // legacy — 일부 기존 코드 호환 (삭제 예정)
  const matchReviewItems: any[] = useMemo(() => {
    if (!matchReviewByEntity) return []
    return Object.values(matchReviewByEntity.entities).flat()
  }, [matchReviewByEntity])

  const loadMatchEntities = useCallback(async (type: string) => {
    if (matchEntities[type] || matchEntityLoading[type]) return
    const cfg = MATCH_TYPES.find(t => t.type === type)
    if (!cfg) return
    setMatchEntityLoading(prev => ({ ...prev, [type]: true }))
    try {
      const { json } = await fetchWithAuth(cfg.api)
      const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []
      setMatchEntities(prev => ({ ...prev, [type]: list }))
    } finally {
      setMatchEntityLoading(prev => ({ ...prev, [type]: false }))
    }
  }, [matchEntities, matchEntityLoading])

  // 자동 분류
  const [autoClassifying, setAutoClassifying] = useState(false)
  const [autoClassifyResult, setAutoClassifyResult] = useState<any>(null)
  // AI 일괄 분류 진행률 (batch loop)
  const [aiProgress, setAiProgress] = useState<{
    running: boolean
    total: number
    processed: number
    applied: number
    below: number
    distribution: Record<string, number>
    lastError?: string
  } | null>(null)

  // 분류 검수 탭 상태
  const [reviewCategory, setReviewCategory] = useState<string | null>(null)
  const [reviewItems, setReviewItems] = useState<any[]>([])
  const [showAdvancedMatch, setShowAdvancedMatch] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewTypeFilter, setReviewTypeFilter] = useState<'all' | 'income' | 'expense'>('all')

  // AI 진행률 floater (전역 hook — 시간 걸리는 작업 UI)
  const floaterProgress = useAIProgress()

  // 룰 기반 자동 분류 (Phase 3-A 신규 API 연동)
  const [ruleClassifyResult, setRuleClassifyResult] = useState<any>(null)
  const [ruleClassifyLoading, setRuleClassifyLoading] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<'high' | 'medium' | 'low' | null>(null)

  // 분류 룰 관리 (Phase 3-C)
  const [rules, setRules] = useState<any[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [editRule, setEditRule] = useState<any | null>(null)  // null=닫힘, {} = 신규, {id,...} = 수정
  const [ruleFilter, setRuleFilter] = useState<'all' | 'system' | 'user'>('all')
  const [ruleCategoryFilter, setRuleCategoryFilter] = useState<string>('')

  // SMS 탭 상태
  const [smsRows, setSmsRows] = useState<SmsRow[]>([])
  const [smsLoading, setSmsLoading] = useState(false)
  const [smsStatusFilter, setSmsStatusFilter] = useState<string>('')
  const [smsIssuerFilter, setSmsIssuerFilter] = useState<string>('')
  const [smsStats, setSmsStats] = useState<{ status: string; count: number; total: number }[]>([])

  // 매핑 탭 상태
  const [mappingCards, setMappingCards] = useState<any[]>([])
  const [mappingBanks, setMappingBanks] = useState<any[]>([])
  const [mappingCars, setMappingCars] = useState<any[]>([])
  const [smsAliases, setSmsAliases] = useState<any[]>([])
  const [mappingLoading, setMappingLoading] = useState(false)
  // 카드 매핑은 /finance/card-mgmt 로 분리 (2026-08-03) — 기본 통장
  const [mappingSub, setMappingSub] = useState<'card' | 'bank' | 'domain'>('bank')
  const [editMapping, setEditMapping] = useState<any>(null)

  // ─── 데이터 로드 ─────────────────────────────────────

  const loadSummary = useCallback(async () => {
    const { json } = await fetchWithAuth('/api/finance/transactions/summary')
    if (json?.data) setSummary(json.data)
  }, [])

  const loadTransactions = useCallback(async () => {
    const { json } = await fetchWithAuth('/api/finance-upload?table=transactions')
    if (json?.data) {
      setTransactions(json.data.map((t: any) => ({
        ...t,
        amount: Number(t.amount || 0),
        balance_after: t.balance_after != null ? Number(t.balance_after) : null,
      })))
    }
  }, [])

  const loadSettlements = useCallback(async () => {
    const { json } = await fetchWithAuth('/api/settlement/ledger')
    if (json?.data) setSettlements(json.data)
  }, [])

  // 차량 목록 — 분류 검수 차량 매칭 dropdown 용
  const loadCars = useCallback(async () => {
    const { json } = await fetchWithAuth('/api/finance-upload?table=cars')
    if (json?.data) {
      setCars(json.data.map((c: any) => ({
        id: c.id,
        number: c.number || '',
        brand: c.brand || '',
        model: c.model || '',
      })))
    }
  }, [])

  // 매칭 검수 — 분류된 거래만 (category 미분류 X)
  const loadMatchReview = useCallback(async () => {
    setMatchReviewLoading(true)
    try {
      // entity 중심 — 신규 by-entity API
      const { json } = await fetchWithAuth('/api/finance/match-review/by-entity')
      if (json && !json.error) {
        setMatchReviewByEntity(json)
      }
    } finally {
      setMatchReviewLoading(false)
    }
  }, [])

  // entity 클릭 시 거래 lazy load
  const loadEntityTransactions = useCallback(async (entityType: string, entityId: string) => {
    const key = `${entityType}:${entityId}`
    if (entityTransactions[key]) return
    try {
      // related_id 또는 transaction_assignments 매칭으로 거래 조회
      // 간단히 — 모든 분류된 거래 fetch 후 클라이언트 필터 (정확도 낮지만 빠름)
      // TODO: 별도 API /api/finance/match-review/entity/[type]/[id]/transactions 권장
      const { json } = await fetchWithAuth(`/api/finance/transactions/list?related_type=${entityType}&related_id=${entityId}&limit=500`)
      const list = Array.isArray(json?.data)
        ? json.data.filter((t: any) => t.related_type === entityType && t.related_id === entityId)
        : []
      setEntityTransactions(prev => ({ ...prev, [key]: list }))
    } catch { /* skip */ }
  }, [entityTransactions])

  const loadSmsData = useCallback(async () => {
    setSmsLoading(true)
    try {
      const q = new URLSearchParams()
      if (smsStatusFilter) q.set('status', smsStatusFilter)
      if (smsIssuerFilter) q.set('issuer', smsIssuerFilter)
      const { json } = await fetchWithAuth(`/api/finance/sms?${q}`)
      setSmsRows(json?.rows || [])
      setSmsStats(json?.stats || [])
    } finally {
      setSmsLoading(false)
    }
  }, [smsStatusFilter, smsIssuerFilter])

  // 개별 원장 등록 (2026-07-08 사용자 요청 — 전체삭제로 사라진 오늘 문자 건 복구)
  const [smsRegistering, setSmsRegistering] = useState<string | null>(null)
  const registerSmsToLedger = useCallback(async (smsId: string) => {
    if (!confirm('이 문자를 거래 1건으로 등록할까요?\n(이미 같은 거래가 있으면 등록되지 않습니다 — 복구 가능)')) return
    setSmsRegistering(smsId)
    try {
      const { json } = await fetchWithAuth('/api/finance/sms', { method: 'PUT', body: { id: smsId } })
      if (json?.ok) alert('등록했습니다. 통장/카드 탭에서 확인하세요.')
      else alert(json?.reason || json?.error || '등록하지 못했습니다')
      loadSmsData()
    } finally {
      setSmsRegistering(null)
    }
  }, [loadSmsData])

  const loadMappings = useCallback(async () => {
    setMappingLoading(true)
    try {
      const { json } = await fetchWithAuth('/api/finance/mappings')
      if (json) {
        setMappingCards(json.cards || [])
        setMappingBanks(json.bankAccounts || [])
        setMappingCars(json.cars || [])
        setSmsAliases(json.smsAliases || [])
      }
    } finally { setMappingLoading(false) }
  }, [])

  const saveMapping = useCallback(async (data: any) => {
    // 필수 필드 사전 체크
    if (data.type === 'bank' && !data.account_alias) {
      alert('계좌 별칭을 입력해주세요')
      return
    }
    if (data.type === 'card' && !data.card_alias) {
      alert('카드 별칭을 입력해주세요')
      return
    }
    try {
      const { ok, status, json } = await fetchWithAuth('/api/finance/mappings', {
        method: 'POST',
        body: data,  // fetchWithAuth 가 자동 JSON.stringify
      })
      if (!ok || (json && json.error)) {
        const detail = json?.error || `서버 오류 (${status})`
        console.error('[saveMapping] 실패:', detail, data)
        alert(`저장 실패: ${detail}`)
        return
      }
      // 자동 backfill 결과 안내 (SMS 가 미리 들어와 있던 케이스)
      const bf = json?.backfill
      if (bf && (bf.sms > 0 || bf.tx > 0)) {
        alert(
          `✅ 매핑 저장 완료\n\n` +
          `📲 자동 연결됨:\n` +
          `  · 기존 SMS ${bf.sms}건 카드 연결\n` +
          `  · 기존 거래내역 ${bf.tx}건 차량 매칭`
        )
      }
      setEditMapping(null)
      loadMappings()
      loadTransactions()
    } catch (e: any) {
      console.error('[saveMapping] 예외:', e)
      alert(`저장 실패: ${e.message || '알 수 없는 오류'}`)
    }
  }, [loadMappings])

  const deleteMapping = useCallback(async (id: string, type: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await fetchWithAuth(`/api/finance/mappings?id=${id}&type=${type}`, { method: 'DELETE' })
    loadMappings()
  }, [loadMappings])

  // SMS→카드 일괄 연결
  const runLinkCards = useCallback(async () => {
    const { json } = await fetchWithAuth('/api/finance/sms/link-cards', { method: 'POST' })
    if (json) {
      alert(`연결 완료: 카드 ${json.cardLinked}건, 은행 ${json.bankLinked}건, 거래 생성 ${json.transactionsCreated}건`)
      loadMappings()
    }
  }, [loadMappings])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadSummary(), loadTransactions(), loadSettlements(), loadCars(), loadMappings(), loadDomains()])
      .finally(() => setLoading(false))
  }, [loadSummary, loadTransactions, loadSettlements, loadCars, loadMappings])

  // SMS 탭 전환 시 로드
  useEffect(() => {
    if (activeTab === 'sms-bank' || activeTab === 'sms-card') loadSmsData()
    if (activeTab === 'mapping') loadMappings()
  }, [activeTab, loadSmsData, loadMappings])

  // 실패 건 재파싱
  const [reparsing, setReparsing] = useState(false)
  const handleReparse = useCallback(async () => {
    setReparsing(true)
    try {
      const { json } = await fetchWithAuth('/api/finance/sms', { method: 'POST' })
      alert(
        `재파싱 완료: ${json?.total || 0}건 중 ${json?.fixed || 0}건 성공\n` +
        `통장 거래 등록: ${json?.registered || 0}건 / 이미 있어 제외: ${json?.dup_skipped || 0}건`
      )
      loadSmsData()
      loadTransactions()
    } finally {
      setReparsing(false)
    }
  }, [loadSmsData, loadTransactions])

  // ── 취소 SMS 일괄 재파싱 (admin 전용 — 서버가 권한 체크) ─────
  const [recanceling, setRecanceling] = useState(false)
  const handleRecancelDryRun = useCallback(async () => {
    setRecanceling(true)
    try {
      const { json } = await fetchWithAuth('/api/admin/sms-recanceled?max=200')
      if (json?.error) { alert(`오류: ${json.error}`); return }
      const skips = Object.entries(json?.skipped || {})
        .map(([k, v]) => `  · ${k}: ${v}건`).join('\n') || '  (없음)'
      // 진단 정보: skip 된 row 의 transaction 상태 표시
      const diags = (json?.diagnostics || []).slice(0, 5)
        .map((d: any) => {
          if (d.status === 'will_update') {
            return `  ✓ ${d.raw}\n     tx: ${d.tx_state_now?.type}/${d.tx_state_now?.desc} → ${d.tx_state_expected?.type}/${d.tx_state_expected?.desc}`
          }
          return `  · [${d.status}] ${d.raw}\n     tx_id: ${d.tx_id || 'NULL'}, tx now: ${d.tx_state_now?.type || '?'}/${d.tx_state_now?.desc || '?'}`
        }).join('\n') || '  (진단 없음)'
      alert(
        `🔍 dry-run 결과\n\n` +
        `· 후보: ${json?.total_candidates || 0}건\n` +
        `· 변경 예정: ${json?.will_update || 0}건\n` +
        `· skip:\n${skips}\n\n` +
        `📊 진단 (앞 5건):\n${diags}\n\n` +
        `→ 변경 예정 0건이지만 실제 카드 탭이 stale 이면 "🔧 강제 갱신" 버튼`
      )
    } finally { setRecanceling(false) }
  }, [])

  const handleRecancelForceApply = useCallback(async () => {
    if (!confirm('🔧 강제 모드 적용:\n· no_improvement 인 row 도 transactions 강제 갱신\n· transaction_id 있는 모든 후보의 description/type 재계산\n· 사용자 final_category 보호 유지\n\n계속할까요?')) return
    setRecanceling(true)
    try {
      const { json } = await fetchWithAuth('/api/admin/sms-recanceled?apply=true&force=true&max=200', { method: 'POST' })
      if (json?.error) { alert(`오류: ${json.error}`); return }
      const v = json?.verification || {}
      alert(
        `✅ 강제 모드 적용 완료\n\n` +
        `· 후보: ${json?.total_candidates || 0}건\n` +
        `· SMS 갱신: ${json?.applied || 0}건\n` +
        `· tx 갱신: ${json?.tx_updated || 0}건\n` +
        `· tx 강제 갱신: ${json?.force_updated || 0}건\n` +
        `· ignored 마킹: ${json?.ignored_marked || 0}건\n\n` +
        `🔬 검증 (취소 SMS 전체):\n` +
        `  · pass (정상): ${v.pass_canceled || 0}건\n` +
        `  · fail (재시도): ${v.fail_canceled || 0}건\n` +
        `  · orphan (tx 없음): ${v.orphan_canceled || 0}건\n\n` +
        `${json?.note || ''}`
      )
      loadSmsData()
      window.location.reload()
    } finally { setRecanceling(false) }
  }, [loadSmsData])

  const handleRecancelApply = useCallback(async () => {
    if (!confirm('SMS 재파싱 일괄 적용:\n· 취소 SMS의 누락된 정보 보강\n· 파싱 실패 SMS 재시도\n· 승인거절/한도초과 SMS는 ignored 처리\n\n계속할까요? (max 100건/실행)')) return
    setRecanceling(true)
    try {
      const { json } = await fetchWithAuth('/api/admin/sms-recanceled?apply=true&max=100', { method: 'POST' })
      if (json?.error) { alert(`오류: ${json.error}`); return }
      const skips = Object.entries(json?.skipped || {})
        .map(([k, v]) => `  · ${k}: ${v}건`).join('\n') || '  (없음)'
      alert(
        `✅ 적용 완료\n\n` +
        `· 후보: ${json?.total_candidates || 0}건\n` +
        `· SMS 갱신: ${json?.applied || 0}건\n` +
        `· 거래내역 갱신: ${json?.tx_updated || 0}건\n` +
        `· ignored 마킹(승인거절 등): ${json?.ignored_marked || 0}건\n` +
        `· 오류: ${(json?.errors || []).length}건\n\n` +
        `skip 내역:\n${skips}\n\n` +
        `${json?.note || ''}`
      )
      loadSmsData()
    } finally { setRecanceling(false) }
  }, [loadSmsData])

  // ── SMS ↔ 엑셀 중복 정리 (admin) ──────────────────────────────
  const [dedupRunning, setDedupRunning] = useState(false)
  const handleDedupDryRun = useCallback(async () => {
    setDedupRunning(true)
    try {
      const { json } = await fetchWithAuth('/api/admin/sms-excel-dedup')
      if (json?.error) { alert(`오류: ${json.error}`); return }
      const sample = (json?.sample || []).slice(0, 3)
        .map((p: any) => `  • ${p.amount?.toLocaleString()}원\n    SMS: ${p.sms?.desc || '?'}\n    Excel(삭제예정): ${p.excel_to_delete?.desc || '?'}\n    시간차: ${p.date_diff_min}분`)
        .join('\n\n') || '  (없음)'
      alert(
        `🔍 SMS↔Excel 중복 dry-run\n\n` +
        `· SMS 거래: ${json?.total_sms || 0}건\n` +
        `· Excel 거래: ${json?.total_excel || 0}건\n` +
        `· 삭제 예정 (Excel): ${json?.will_delete_excel || 0}건\n\n` +
        `모호 (자동 skip):\n` +
        `  · SMS 1건에 Excel 후보 N개: ${json?.ambiguous?.sms_with_multiple_excel || 0}건\n` +
        `  · Excel 1건에 SMS 후보 N개: ${json?.ambiguous?.excel_with_multiple_sms || 0}건\n` +
        `보호 (final_category 있음): ${json?.protected?.excel_has_final_category || 0}건\n\n` +
        `샘플 (앞 3건):\n${sample}\n\n` +
        `→ 실제 적용은 "🚨 중복 정리 적용" 버튼`
      )
    } finally { setDedupRunning(false) }
  }, [])

  const handleDedupApply = useCallback(async () => {
    if (!confirm('SMS ↔ Excel 중복 정리:\n· 같은 거래(±3분, 금액 동일)의 Excel row 를 soft-delete\n· SMS row 는 유지 (더 정확)\n· final_category 있는 Excel 은 보호\n\n계속할까요? (max 100건/실행, 복원 가능)')) return
    setDedupRunning(true)
    try {
      const { json } = await fetchWithAuth('/api/admin/sms-excel-dedup?apply=true&max=100', { method: 'POST' })
      if (json?.error) { alert(`오류: ${json.error}`); return }
      alert(
        `✅ 중복 정리 완료\n\n` +
        `· 발견된 페어: ${json?.total_pairs_found || 0}건\n` +
        `· 삭제된 Excel row: ${json?.excel_deleted || 0}건\n` +
        `· 모호 skip: SMS-Excel ${json?.ambiguous_skipped?.sms_with_multiple_excel || 0} / Excel-SMS ${json?.ambiguous_skipped?.excel_with_multiple_sms || 0}\n` +
        `· 보호 skip: ${json?.protected_skipped?.excel_has_final_category || 0}건\n` +
        `· 오류: ${(json?.errors || []).length}건\n\n` +
        `${json?.note || ''}`
      )
      // 거래 목록 다시 로드
      loadSmsData()
      window.location.reload()
    } finally { setDedupRunning(false) }
  }, [loadSmsData])

  // ─── 필터링 ──────────────────────────────────────────

  // 통장 vs 카드 구분 헬퍼
  // ★ 서버(/api/finance/transactions/summary)와 동일한 prefix 매칭 사용:
  //   bank  = imported_from LIKE 'excel_bank%' OR = 'sms_bank'
  //   card  = imported_from LIKE 'excel_card%' OR = 'sms'
  // 실제 batch_id는 'excel_bank_20260427_1701234567890' 형식이므로 startsWith 매칭 필수
  const isBankTx = (t: any) => {
    const imp = String(t.imported_from || '')
    // 1) Excel 은행 / SMS 은행 명시 출처
    if (imp.startsWith('excel_bank') || imp === 'sms_bank') return true
    // 2) bank_name 컬럼 있으면 통장
    if (t.bank_name) return true
    // 3) card_company 가 BANK 포함 (WOORI_BANK / KB_BANK / WOORI BANK 등 다양한 형식)
    if (t.card_company && /BANK/i.test(t.card_company)) return true
    // 4) SMS card_alias 에 '은행' 포함 (우리은행****8777 등)
    if (t.sms_card_alias && /은행/.test(t.sms_card_alias)) return true
    // 5) imported_from 없는 수동 입력 — card 단서가 없으면 통장으로
    if (!imp && !t.card_company) return true
    return false
  }
  const isCardTx = (t: any) => {
    if (isBankTx(t)) return false
    const imp = String(t.imported_from || '')
    if (imp.startsWith('excel_card')) return true
    if (imp === 'sms' && t.card_company) return true
    if (t.card_company && !/BANK/i.test(t.card_company)) return true
    return false
  }

  // PR-ACCOUNT — 계좌별 필터 (V10 account_last4)
  const [bankAccountPick, setBankAccountPick] = useState('all')
  const [bankLinkPick, setBankLinkPick] = useState('all')  // 연결(매칭) 필터
  // 관리 구분 (V11, 2026-07-10 사용자 명시) — 원장은 「어느 페이지 소관인지」만 지정
  const [domains, setDomains] = useState<Array<{ id: string; code: string; label: string; color: string | null; target_page: string | null; sort_order: number; is_active: number }>>([])
  const [domainPick, setDomainPick] = useState('all')  // 구분 필터
  const loadDomains = useCallback(async () => {
    const { json } = await fetchWithAuth('/api/finance/manage-domains?all=1')
    if (json?.data) setDomains(json.data)
  }, [])
  const domainLabel = useCallback((code: string | null) => domains.find((d) => d.code === code), [domains])
  const assignDomain = useCallback(async (ids: string[], domain: string | null) => {
    const { json } = await fetchWithAuth('/api/finance/transactions/assign-domain', { method: 'POST', body: { ids, domain } })
    if (json?.error) { alert(json.error); return false }
    loadTransactions()
    return true
  }, [loadTransactions])

  // ── 거래내역 탭 (통합) — 인라인 분류 수정 ──────────────
  const changeCategory = useCallback(async (id: string, category: string | null) => {
    // 낙관적 갱신 — 실패 시 재로드로 복원
    setTransactions((prev) => prev.map((t: any) => t.id === id ? { ...t, category } : t))
    const { ok, json } = await fetchWithAuth(`/api/transactions/${id}`, { method: 'PATCH', body: { category } })
    if (!ok || json?.error) { alert(json?.error || '분류 저장에 실패했습니다'); loadTransactions() }
  }, [loadTransactions])
  // 분류 선택지 — 기존 거래에서 쓰인 분류 목록 (빈도순)
  const categoryOptions = useMemo(() => {
    const freq = new Map<string, number>()
    for (const t of transactions as any[]) {
      const c = (t.category || '').trim()
      if (!c || c === '미분류') continue
      freq.set(c, (freq.get(c) || 0) + 1)
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  }, [transactions])

  const bankAccountOptions = useMemo(() => {
    const set = new Set<string>()
    for (const t of transactions) if (isBankTx(t) && (t as any).account_last4) set.add(String((t as any).account_last4))
    return Array.from(set).sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions])

  // PR-ADMIN-SUMMARY (2026-07-08 사용자 명시) — 계좌별 현재 잔액 + 30일 자동 검증, 카드별 이번 달 누적
  const bankAccountSummary = useMemo(() => {
    const byAcct = new Map<string, { balance: number | null; balanceDate: string | null }>()
    for (const t of transactions) {
      if (!isBankTx(t)) continue
      const a = String((t as any).account_last4 || '')
      if (!a) continue
      const cur = byAcct.get(a)
      const bal = (t as any).balance_after
      const d = String(t.transaction_date || '')
      if (bal != null && Number(bal) > 0 && (!cur || !cur.balanceDate || d > cur.balanceDate)) {
        byAcct.set(a, { balance: Number(bal), balanceDate: d })
      } else if (!cur) byAcct.set(a, { balance: null, balanceDate: null })
    }
    return byAcct
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions])

  const [acctVerify, setAcctVerify] = useState<Record<string, { ok: boolean; breaks: number }>>({})
  useEffect(() => {
    if (activeTab !== 'ledger' || bankAccountOptions.length === 0) return
    let cancelled = false
    ;(async () => {
      const to = new Date().toISOString().slice(0, 10)
      const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
      const out: Record<string, { ok: boolean; breaks: number }> = {}
      await Promise.all(bankAccountOptions.slice(0, 8).map(async (a) => {
        try {
          const { json } = await fetchWithAuth(`/api/finance/bank-reconcile?from=${from}&to=${to}&bank=all&account=${a}`)
          const n = Array.isArray(json?.chain?.breaks) ? json.chain.breaks.length : 0
          out[a] = { ok: n === 0, breaks: n }
        } catch { /* 검증 실패 — 표시 생략 */ }
      }))
      if (!cancelled) setAcctVerify(out)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, bankAccountOptions.join(',')])

  const cardMonthSummary = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7)
    const byCard = new Map<string, { sum: number; holder: string; car: string }>()
    for (const t of transactions) {
      if (!isCardTx(t)) continue
      if (String(t.transaction_date || '').slice(0, 7) !== ym) continue
      const alias = (t as any).matched_card_alias || (t as any).sms_card_alias || ((t as any).account_last4 ? `****${(t as any).account_last4}` : '')
      if (!alias) continue
      const amt = Number(t.amount || 0)
      const canceled = (t as any).sms_transaction_type === 'canceled'
      const cur = byCard.get(alias) || { sum: 0, holder: '', car: '' }
      cur.sum += canceled ? -amt : amt
      // 소지자 (2026-07-08 사용자 명시) — 매핑 등록 소지자 > 문자 승인자
      if (!cur.holder) cur.holder = (t as any).matched_holder_name || (t as any).sms_holder || ''
      // 연결 차량 (2026-07-08 사용자 명시) — 카드에 할당된 차량번호
      if (!cur.car) cur.car = (t as any).matched_car_number || ''
      byCard.set(alias, cur)
    }
    return byCard
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions])


  // PR-ACCOUNT — 카드별(끝4자리/별칭)·소지자별 필터
  const [cardPick, setCardPick] = useState('all')
  const [holderPick, setHolderPick] = useState('all')
  const cardPickOptions = useMemo(() => {
    const set = new Set<string>()
    for (const t of transactions) {
      if (!isCardTx(t)) continue
      const a = (t as any).matched_card_alias || (t as any).sms_card_alias || ((t as any).account_last4 ? `****${(t as any).account_last4}` : '')
      if (a) set.add(String(a))
    }
    return Array.from(set).sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions])
  const holderPickOptions = useMemo(() => {
    const set = new Set<string>()
    for (const t of transactions) {
      if (!isCardTx(t)) continue
      const h = (t as any).matched_holder_name || (t as any).sms_holder
      if (h) set.add(String(h))
    }
    return Array.from(set).sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions])


  const filteredSettlements = useMemo(() => {
    let data = [...settlements]
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(s =>
        (s.recipient_name || '').toLowerCase().includes(q) ||
        (s.bank_name || '').toLowerCase().includes(q) ||
        (s.settlement_month || '').includes(q)
      )
    }
    return data
  }, [settlements, search])

  const filteredMatchResults = useMemo(() => {
    if (!search) return matchResults
    const q = search.toLowerCase()
    return matchResults.filter(r =>
      (r.txName || '').toLowerCase().includes(q) ||
      (r.match.name || '').toLowerCase().includes(q)
    )
  }, [matchResults, search])

  // ─── 엑셀 업로드 ────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const fileArr = Array.from(files)
    const patterns = uploadSource === 'excel_bank' ? BANK_COL_PATTERNS : CARD_COL_PATTERNS
    const expectedType = uploadSource === 'excel_bank' ? 'bank' : 'card'

    // input 초기화 (같은 파일 재선택 허용)
    e.target.value = ''
    setSkippedFiles([])

    // Promise 기반으로 모든 파일 읽기
    Promise.all(
      fileArr.map(
        (file) =>
          new Promise<{ name: string; rows: any[]; columns: Record<string, string>; skipped?: boolean; year?: string; accountNumber?: string; accountLast4?: string; accountHolder?: string; bankName?: string } | null>((resolve) => {
            const reader = new FileReader()
            reader.onload = (ev) => {
              try {
                const data = new Uint8Array(ev.target?.result as ArrayBuffer)
                const wb = XLSX.read(data, { type: 'array' })
                const ws = wb.Sheets[wb.SheetNames[0]]

                // 양쪽 패턴 모두 시도하여 헤더 행 감지
                const otherPatterns = expectedType === 'bank' ? CARD_COL_PATTERNS : BANK_COL_PATTERNS
                const detectedTarget = findHeaderRow(ws, patterns)
                const detectedOther = findHeaderRow(ws, otherPatterns)

                // 상대편 패턴에서만 헤더를 찾으면 → 파일 타입 불일치 (즉시 스킵)
                if (!detectedTarget && detectedOther) {
                  resolve({ name: file.name, rows: [], columns: {}, skipped: true })
                  return
                }

                // !ref를 변경하기 전에 복사
                const origRef = ws['!ref']

                // 메타데이터 행에서 기간(연도) + 계좌번호 + 예금주 + 은행명 추출
                // 통장 파일: 상단에 "계좌번호 : 1005504828777   예금주 : 주식회사 에프엠아이" 같은 행 존재
                // 카드 파일: report 파일은 "이용기간 : 2025.11.01 ~ 2025.11.30" 같은 행 존재
                let extractedYear = ''
                let extractedAccountNumber = ''
                let extractedAccountLast4 = ''
                let extractedAccountHolder = ''
                let extractedBankName = ''
                if (detectedTarget && detectedTarget.headerRowIdx > 0) {
                  const rng = XLSX.utils.decode_range(ws['!ref'] || 'A1')
                  for (let r = 0; r < detectedTarget.headerRowIdx; r++) {
                    for (let c = rng.s.c; c <= rng.e.c; c++) {
                      const cell = ws[XLSX.utils.encode_cell({ r, c })]
                      if (!cell) continue
                      const v = String(cell.v || '')
                      // 기간 → 연도 추출
                      if (!extractedYear) {
                        const m = v.match(/(\d{4})\.\d{2}\.\d{2}\s*~\s*(\d{4})\.\d{2}\.\d{2}/)
                        if (m) extractedYear = m[1]
                      }
                      // 계좌번호 (통장 파일) — "계좌번호 : 1005-504-828777" 또는 "계좌번호 : 1005504828777"
                      if (!extractedAccountNumber) {
                        const m = v.match(/계좌번호\s*[::]\s*([0-9\-\s]+)/)
                        if (m) {
                          extractedAccountNumber = m[1].trim()
                          const digits = extractedAccountNumber.replace(/\D/g, '')
                          if (digits.length >= 4) extractedAccountLast4 = digits.slice(-4)
                        }
                      }
                      // 예금주
                      if (!extractedAccountHolder) {
                        const m = v.match(/예금주\s*[::]\s*([^\s].*?)(?:\s{2,}|$)/)
                        if (m) extractedAccountHolder = m[1].trim()
                      }
                      // 은행명 — "우리은행 거래내역조회" / "신한은행 ..." / "KB은행 ..."
                      if (!extractedBankName) {
                        const m = v.match(/(우리|신한|국민|KB|기업|IBK|하나|농협|NH|새마을금고|새마을|MG|씨티|카카오뱅크|토스뱅크|케이뱅크|SC제일|수협|우체국)(은행)?/)
                        if (m) extractedBankName = `${m[1]}${m[1].endsWith('은행') || m[2] ? '' : '은행'}`.replace(/은행은행/, '은행')
                      }
                    }
                  }
                }

                let rows: any[]
                if (detectedTarget && detectedTarget.headerRowIdx > 0) {
                  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
                  range.s.r = detectedTarget.headerRowIdx
                  ws['!ref'] = XLSX.utils.encode_range(range)
                  rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
                  ws['!ref'] = origRef // 복원
                } else {
                  rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
                }

                if (rows.length === 0) {
                  resolve(null)
                  return
                }

                // 파일 타입 자동 판별 → 소스와 불일치 시 스킵
                const headers = Object.keys(rows[0])
                const fileType = detectFileType(headers)
                if (fileType !== 'unknown' && fileType !== expectedType) {
                  resolve({ name: file.name, rows: [], columns: {}, skipped: true })
                  return
                }

                const mapping: Record<string, string> = {}
                const usedFields = new Set<string>()
                const unmappedHeaders: string[] = []
                for (const h of headers) {
                  const matched = matchColumn(h, patterns)
                  // 같은 필드에 중복 매핑 방지 (첫 번째만 사용)
                  if (matched && !usedFields.has(matched)) {
                    mapping[h] = matched
                    usedFields.add(matched)
                  } else if (!matched) {
                    unmappedHeaders.push(h)
                  }
                }

                // 디버그: 매핑 결과와 첫 행 데이터 출력
                console.group(`[엑셀 파싱] ${file.name}`)
                console.log('헤더 행 위치:', detectedTarget?.headerRowIdx ?? 0)
                console.log('원본 헤더:', headers)
                console.log('매핑 결과:', mapping)
                console.log('미매핑 컬럼:', unmappedHeaders)
                if (rows.length > 0) {
                  console.log('첫 행 원본 데이터:', rows[0])
                  // 매핑된 필드별 값 출력
                  const reverse: Record<string, string> = {}
                  for (const [header, field] of Object.entries(mapping)) reverse[field] = header
                  const fieldValues: Record<string, any> = {}
                  for (const [field, header] of Object.entries(reverse)) {
                    fieldValues[`${field} (← "${header}")`] = rows[0][header]
                  }
                  console.log('매핑된 필드 값:', fieldValues)
                }
                console.groupEnd()

                resolve({
                  name: file.name,
                  rows,
                  columns: mapping,
                  year: extractedYear || undefined,
                  accountNumber: extractedAccountNumber || undefined,
                  accountLast4: extractedAccountLast4 || undefined,
                  accountHolder: extractedAccountHolder || undefined,
                  bankName: extractedBankName || undefined,
                })
              } catch (err) {
                console.error(`[파일 업로드] ${file.name} 파싱 오류:`, err)
                resolve(null)
              }
            }
            reader.onerror = () => {
              console.error(`[파일 업로드] ${file.name} 읽기 실패`)
              resolve(null)
            }
            reader.readAsArrayBuffer(file)
          })
      )
    ).then((results) => {
      const allResults = results.filter((r): r is NonNullable<typeof r> => r !== null)
      const skipped = allResults.filter(r => r.skipped).map(r => r.name)
      const parsed = allResults.filter(r => !r.skipped && r.rows.length > 0)

      setSkippedFiles(skipped)
      setUploadFiles(parsed)
      setCurrentFileIndex(0)
      setUploadResult(null)
      if (parsed.length > 0) {
        setUploadFileName(
          skipped.length > 0
            ? `${parsed.length}개 파일 선택됨 (${skipped.length}개 제외)`
            : parsed.length === 1 ? parsed[0].name : `${parsed.length}개 파일 선택됨`
        )
        setUploadColumns(parsed[0].columns)
        setUploadPreview(parsed[0].rows.slice(0, 50))
      } else {
        setUploadFileName(skipped.length > 0 ? '해당 유형 파일 없음' : '')
        setUploadColumns({})
        setUploadPreview([])
      }
    })
  }

  const switchFilePreview = (idx: number) => {
    if (idx < 0 || idx >= uploadFiles.length) return
    setCurrentFileIndex(idx)
    setUploadColumns(uploadFiles[idx].columns)
    setUploadPreview(uploadFiles[idx].rows.slice(0, 50))
  }

  const handleUpload = async () => {
    const filesToUpload = uploadFiles.length > 0 ? uploadFiles : uploadPreview.length > 0 ? [{ name: uploadFileName, rows: uploadPreview, columns: uploadColumns }] : []
    if (filesToUpload.length === 0) return
    setUploading(true)

    const isBankSource = uploadSource === 'excel_bank'
    const allResults: { name: string; inserted: number; skipped: number; errors: string[] }[] = []

    for (let fi = 0; fi < filesToUpload.length; fi++) {
      const file = filesToUpload[fi]
      const reverse: Record<string, string> = {}
      for (const [header, field] of Object.entries(file.columns)) {
        reverse[field] = header
      }

      // 날짜 정규화: 다양한 엑셀 포맷 → MySQL DATETIME 호환
      const normalizeDate = (raw: string, fileYear?: string): string => {
        if (!raw) return ''
        const s = String(raw).trim()
        // 1) YYYY.MM.DD HH:mm:ss → YYYY-MM-DD HH:mm:ss
        const full = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s+(\d{2}:\d{2}(:\d{2})?)$/)
        if (full) return `${full[1]}-${full[2].padStart(2,'0')}-${full[3].padStart(2,'0')} ${full[4]}${full[5] ? '' : ':00'}`
        // 2) YYYY.MM.DD → YYYY-MM-DD
        const dateOnly = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/)
        if (dateOnly) return `${dateOnly[1]}-${dateOnly[2].padStart(2,'0')}-${dateOnly[3].padStart(2,'0')}`
        // 3) MM.DD HH:mm (연도 없음, report 파일) → 파일 메타데이터의 연도 사용
        const short = s.match(/^(\d{1,2})[.\-/](\d{1,2})\s+(\d{2}:\d{2})$/)
        if (short) {
          const year = fileYear || String(new Date().getFullYear())
          return `${year}-${short[1].padStart(2,'0')}-${short[2].padStart(2,'0')} ${short[3]}:00`
        }
        return s
      }

      // 디버그: reverse 매핑 출력
      console.log(`[업로드] 파일: ${file.name}, reverse 매핑:`, reverse)
      if (file.rows.length > 0) {
        console.log(`[업로드] 첫 행 키:`, Object.keys(file.rows[0]))
        console.log(`[업로드] 첫 행 값:`, file.rows[0])
        // 각 필드가 어떤 값을 가져오는지 확인
        const debugFields: Record<string, any> = {}
        for (const [field, header] of Object.entries(reverse)) {
          debugFields[field] = { header, value: file.rows[0][header], type: typeof file.rows[0][header] }
        }
        console.log(`[업로드] 필드별 매핑 값:`, debugFields)
      }

      const mapped = file.rows.map((row, rowIdx) => {
        if (isBankSource) {
          const deposit = safeNum(row[reverse.deposit])
          const withdrawal = safeNum(row[reverse.withdrawal])
          const rawDesc = String(row[reverse.description] ?? '')
          const rawMemo = String(row[reverse.memo] ?? '')
          const rawCounterpart = String(row[reverse.counterpart] ?? '')
          // description 보강: 적요가 일반적이면 메모(통장표시) 정보 추가
          const description = rawMemo ? (rawDesc ? `${rawDesc} [${rawMemo}]` : rawMemo) : rawDesc

          // 디버그: 첫 5행 데이터 로그
          if (rowIdx < 3) {
            console.log(`[업로드 행 ${rowIdx}]`, { rawDesc, rawMemo, rawCounterpart, deposit, withdrawal, description })
          }

          return {
            date: normalizeDate(row[reverse.date] || ''),
            description,
            deposit: deposit || undefined,
            withdrawal: withdrawal || undefined,
            amount: deposit || withdrawal,
            type: deposit ? 'income' : 'expense',
            balance: safeNum(row[reverse.balance]) || undefined,
            counterpart: rawCounterpart,
            // 파일 상단 메타에서 추출 (모든 행에 동일하게 부여 — 매핑 매칭용)
            // 기본값 '우리은행' 제거 (2026-07-08) — 못 읽으면 비워두고 매핑 관리 기준으로 표시/교정
            bank_name: (file as any).bankName || '',
            account_number: (file as any).accountNumber || undefined,
            account_last4: (file as any).accountLast4 || undefined,
            account_holder: (file as any).accountHolder || undefined,
          }
        } else {
          // 승인내역조회: 날짜+시간 분리 컬럼 처리
          let dateVal = row[reverse.date] || ''
          // "승인시간" 같은 별도 시간 컬럼이 있으면 합치기
          const timeCol = Object.keys(row).find(k => /승인시간|이용시간|시간/.test(k))
          if (timeCol && row[timeCol] && !/\d{2}:\d{2}/.test(String(dateVal))) {
            dateVal = `${dateVal} ${row[timeCol]}`
          }
          // ★ 카드번호에서 끝 4자리 추출 — 차량 자동 매칭용
          //   "1234-5678-9012-9876" → "9876"
          //   "1234-56**-****-9876" → "9876"
          //   "9876" → "9876"
          //   카드번호 컬럼 없거나 추출 실패 시 null
          const rawCardNum = String(row[reverse.cardNumber] || '').trim()
          const last4Match = rawCardNum.replace(/[^0-9*]/g, '').match(/(\d{4})$/)
          const cardLast4 = last4Match ? last4Match[1] : null
          return {
            date: normalizeDate(String(dateVal), (file as any).year),
            description: row[reverse.merchant] || '',
            amount: safeNum(row[reverse.amount]),
            type: 'expense',
            card_company: row[reverse.cardCompany] || '',
            client_name: row[reverse.holder] || '',
            card_last4: cardLast4,  // 서버 측에서 raw_data.card_last4 로 저장
          }
        }
      })

      // 대용량 파일 → 4000건씩 배치 분할 전송 (서버 5000건 제한 대응)
      const BATCH_SIZE = 4000
      let fileInserted = 0
      let fileSkipped = 0
      const fileErrors: string[] = []
      // skip 사유 누적 — 사용자에게 어떤 행이 왜 빠졌는지 표시
      const fileSkipBreakdown: { no_date: number; invalid_date: number; no_amount: number; meta_row: number; duplicate: number; sms_already_exists?: number; cross_source?: number; duplicate_existing?: number } =
        { no_date: 0, invalid_date: 0, no_amount: 0, meta_row: 0, duplicate: 0 }
      const batchBase = `${uploadSource}_${Date.now()}_${fi}`

      const totalBatches = Math.ceil(mapped.length / BATCH_SIZE)
      for (let bi = 0; bi < mapped.length; bi += BATCH_SIZE) {
        const batchNum = Math.floor(bi / BATCH_SIZE) + 1
        if (totalBatches > 1) setUploadProgress(`${file.name}: 배치 ${batchNum}/${totalBatches} 전송 중...`)
        const chunk = mapped.slice(bi, bi + BATCH_SIZE)
        const batchId = mapped.length > BATCH_SIZE ? `${batchBase}_b${Math.floor(bi / BATCH_SIZE)}` : batchBase
        const { json } = await fetchWithAuth('/api/finance/transactions/import', {
          method: 'POST',
          // PR-ACCOUNT (V10) — 계좌/카드 끝4자리 지정 (입력 우선, 없으면 파일 이름에서 추출)
          body: { rows: chunk, source: uploadSource, batchId, account_last4: uploadAccountLast4 || (file.name.match(/(\d{4})(?!.*\d{4})/)?.[1] ?? null) },
        })
        const res = json?.data || json || {}
        fileInserted += res.inserted || 0
        fileSkipped += res.skipped || 0
        if (res.errors) fileErrors.push(...res.errors)
        if (res.skipBreakdown) {
          fileSkipBreakdown.no_date += res.skipBreakdown.no_date || 0
          fileSkipBreakdown.invalid_date += res.skipBreakdown.invalid_date || 0
          fileSkipBreakdown.no_amount += res.skipBreakdown.no_amount || 0
          fileSkipBreakdown.meta_row += res.skipBreakdown.meta_row || 0
          fileSkipBreakdown.duplicate += res.skipBreakdown.duplicate || 0
          fileSkipBreakdown.sms_already_exists = (fileSkipBreakdown.sms_already_exists || 0) + (res.skipBreakdown.sms_already_exists || 0)
          fileSkipBreakdown.cross_source = (fileSkipBreakdown.cross_source || 0) + (res.skipBreakdown.cross_source || 0)
          fileSkipBreakdown.duplicate_existing = (fileSkipBreakdown.duplicate_existing || 0) + (res.skipBreakdown.duplicate_existing || 0)
        }
      }

      allResults.push({
        name: file.name,
        inserted: fileInserted,
        skipped: fileSkipped,
        errors: fileErrors,
        skipBreakdown: fileSkipBreakdown,
      } as any)
    }

    // 합산 결과
    const totalInserted = allResults.reduce((s, r) => s + r.inserted, 0)
    const totalSkipped = allResults.reduce((s, r) => s + r.skipped, 0)
    const allErrors = allResults.flatMap(r => r.errors)
    // skip 사유별 합산 — 업로드 결과 모달에 표시
    const totalSkipBreakdown = allResults.reduce((acc: any, r: any) => {
      const sb = r.skipBreakdown || {}
      acc.no_date += sb.no_date || 0
      acc.invalid_date += sb.invalid_date || 0
      acc.no_amount += sb.no_amount || 0
      acc.meta_row += sb.meta_row || 0
      acc.duplicate += sb.duplicate || 0
      acc.sms_already_exists = (acc.sms_already_exists || 0) + (sb.sms_already_exists || 0)
      acc.cross_source = (acc.cross_source || 0) + (sb.cross_source || 0)
      acc.duplicate_existing = (acc.duplicate_existing || 0) + (sb.duplicate_existing || 0)
      return acc
    }, { no_date: 0, invalid_date: 0, no_amount: 0, meta_row: 0, duplicate: 0 })

    // ★ Excel 카드 업로드 후 차량 자동 매칭 호출
    let matchInfo: any = null
    if (uploadSource === 'excel_card' && totalInserted > 0) {
      setUploadProgress('차량 자동 매칭 중...')
      try {
        const { ok, json } = await fetchWithAuth('/api/finance/transactions/auto-match-card', {
          method: 'POST',
          body: { dryRun: false },
        })
        if (ok) matchInfo = json
      } catch (e: any) {
        console.warn('[차량 자동 매칭]', e?.message)
      }
    }

    setUploadResult({ inserted: totalInserted, skipped: totalSkipped, errors: allErrors, files: allResults, match: matchInfo, skipBreakdown: totalSkipBreakdown })
    setUploading(false)
    setUploadProgress('')

    // 리로드
    await Promise.all([loadSummary(), loadTransactions()])
  }


  // ─── 별칭 등록 ──────────────────────────────────────
  const saveAlias = async () => {
    if (!aliasPrompt) return
    await fetchWithAuth('/api/finance-upload?table=client_name_aliases', {
      method: 'POST',
      body: {
        id: crypto.randomUUID(),
        bank_name: aliasPrompt.bankName,
        actual_name: aliasPrompt.actualName,
        status: 'active',
      },
    })
    setAliasPrompt(null)
  }

  // ─── 거래 분리 ──────────────────────────────────────
  const openSplitModal = (tx: Transaction) => {
    setSplitTarget(tx)
    setSplitItems([
      { amount: String(tx.amount), description: tx.description || '', client_name: tx.client_name || '' },
      { amount: '0', description: '', client_name: '' },
    ])
  }

  const handleSplit = async () => {
    if (!splitTarget || splitItems.length < 2) return
    setSplitting(true)
    const { json } = await fetchWithAuth('/api/finance/transactions/split', {
      method: 'POST',
      body: {
        transactionId: splitTarget.id,
        splits: splitItems.map(s => ({
          amount: Number(s.amount) || 0,
          description: s.description,
          client_name: s.client_name,
        })),
      },
    })
    setSplitting(false)
    if (json?.ok) {
      setSplitTarget(null)
      await loadTransactions()
    } else {
      alert(json?.error || '분리 실패')
    }
  }

  // ─── 자동매칭 ────────────────────────────────────────

  const runAutoMatch = async (autoConfirm = false) => {
    setMatching(true)
    const { json } = await fetchWithAuth('/api/finance/transactions/auto-match', {
      method: 'POST',
      body: { threshold: 0.50, autoConfirm },
    })
    if (json?.data?.results) {
      setMatchResults(json.data.results)
    }
    setMatching(false)
    await Promise.all([loadSummary(), loadTransactions(), loadSettlements()])
  }

  const confirmSelectedMatches = async () => {
    if (selectedMatches.size === 0) return
    const matches = matchResults
      .filter(r => selectedMatches.has(r.transactionId))
      .map(r => ({
        transactionId: r.transactionId,
        matchType: r.match.type,
        matchId: r.match.id,
        contractType: r.match.contractType,
      }))

    await fetchWithAuth('/api/finance/transactions/confirm-match', {
      method: 'POST',
      body: { matches },
    })

    setSelectedMatches(new Set())
    await Promise.all([loadSummary(), loadTransactions(), loadSettlements()])
    // 매칭 결과에서 확인된 항목 제거
    setMatchResults(prev => prev.filter(r => !selectedMatches.has(r.transactionId)))
  }

  // ─── 거래처 그룹 분류 ─────────────────────────────────

  // ── 분류 검수: 카테고리별 거래 목록 조회 ──
  const loadReviewItems = async (category: string) => {
    setReviewCategory(category)
    setReviewLoading(true)
    setReviewItems([])
    // 필터 초기화 (이전 카테고리 필터 잔존 방지)
    setReviewSearch('')
    setReviewFilterCard('all')
    setReviewFilterMatch('all')
    setReviewFilterAmount('all')
    setReviewFilterTxType('all')
    setReviewGroupByMerchant(false)
    const { json } = await fetchWithAuth(`/api/finance/transactions/list?category=${encodeURIComponent(category)}&limit=200`)
    if (json?.data) setReviewItems(json.data)
    setReviewLoading(false)
  }

  // 필터 적용 — useMemo 로 reviewItems 가공
  const filteredReviewItems = useMemo(() => {
    let arr = reviewItems
    // 검색 — client_name / description / sms_merchant
    if (reviewSearch.trim()) {
      const kw = reviewSearch.trim().toLowerCase()
      arr = arr.filter((i: any) => {
        const text = [i.client_name, i.description, i.sms_merchant, i.matched_card_alias].filter(Boolean).join(' ').toLowerCase()
        return text.includes(kw)
      })
    }
    // 카드 필터
    if (reviewFilterCard !== 'all') {
      if (reviewFilterCard === 'no_card') {
        arr = arr.filter((i: any) => !i.matched_card_alias)
      } else {
        arr = arr.filter((i: any) => i.matched_card_alias === reviewFilterCard)
      }
    }
    // 매칭 상태 필터
    if (reviewFilterMatch === 'matched') {
      arr = arr.filter((i: any) => i.related_type && i.related_id)
    } else if (reviewFilterMatch === 'unmatched') {
      arr = arr.filter((i: any) => !(i.related_type && i.related_id))
    }
    // 금액 범위
    if (reviewFilterAmount !== 'all') {
      arr = arr.filter((i: any) => {
        const a = Math.abs(Number(i.amount || 0))
        if (reviewFilterAmount === 'lt10k') return a < 10000
        if (reviewFilterAmount === '10k-50k') return a >= 10000 && a < 50000
        if (reviewFilterAmount === '50k-100k') return a >= 50000 && a < 100000
        if (reviewFilterAmount === 'gt100k') return a >= 100000
        return true
      })
    }
    // 거래 유형
    if (reviewFilterTxType !== 'all') {
      arr = arr.filter((i: any) => {
        const stType = i.sms_transaction_type
        if (reviewFilterTxType === 'canceled') return stType === 'canceled'
        if (reviewFilterTxType === 'income') return i.type === 'income' && stType !== 'canceled'
        if (reviewFilterTxType === 'expense') return i.type !== 'income' && stType !== 'canceled'
        return true
      })
    }
    return arr
  }, [reviewItems, reviewSearch, reviewFilterCard, reviewFilterMatch, reviewFilterAmount, reviewFilterTxType])

  // 묶음 view — 통장: description, 카드: sms_merchant 기준 group
  const reviewGroups = useMemo(() => {
    if (!reviewGroupByMerchant) return null
    const map = new Map<string, any[]>()
    for (const it of filteredReviewItems) {
      const isCard = it.imported_from === 'sms' || (it.imported_from || '').startsWith('excel_card') || (it.imported_from || '').startsWith('pdf_card')
      const key = (isCard ? (it.sms_merchant || it.description) : (it.description || it.client_name)) || '(미상)'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        items,
        count: items.length,
        totalAmount: items.reduce((s, i) => s + Math.abs(Number(i.amount || 0)), 0),
      }))
      .sort((a, b) => b.count - a.count)
  }, [filteredReviewItems, reviewGroupByMerchant])

  // 카드 옵션 추출 — 현재 카테고리 거래에 등장하는 카드만
  const reviewCardOptions = useMemo(() => {
    const set = new Set<string>()
    for (const i of reviewItems) {
      if (i.matched_card_alias) set.add(i.matched_card_alias)
    }
    return Array.from(set).sort()
  }, [reviewItems])

  // 분류 검수에서 카테고리 변경
  const changeItemCategory = async (id: string, newCategory: string) => {
    await fetchWithAuth('/api/finance/transactions/group-classify', {
      method: 'PATCH',
      body: { transactionIds: [id], category: newCategory },
    })
    setReviewItems(prev => prev.filter(i => i.id !== id))
    loadSummary() // 통계 갱신
  }

  // ─── 일괄 작업 헬퍼 (BulkActionBar 용) ─────────────────────────
  // 선택된 거래 목록 가져오기 — 3 화면 모두에서 검색
  const getSelectedTransactions = () => {
    const all: any[] = []
    const seen = new Set<string>()
    const push = (it: any) => {
      if (it?.id && !seen.has(it.id) && selectedIds.has(it.id)) {
        seen.add(it.id)
        all.push(it)
      }
    }
    reviewItems.forEach(push)
    matchReviewItems.forEach(push)
    if (ruleClassifyResult?.groups) {
      for (const conf of ['high', 'medium', 'low'] as const) {
        ;(ruleClassifyResult.groups[conf] || []).forEach(push)
      }
    }
    return all
  }

  // 일괄 카테고리 변경
  const bulkChangeCategory = async (newCategory: string) => {
    const items = getSelectedTransactions()
    if (items.length === 0) { alert('선택된 거래 없음'); return }
    if (!confirm(`선택 ${items.length}건 → 「${newCategory}」 카테고리 변경하시겠습니까?`)) return
    const taskId = floaterProgress.start({ title: `📁 일괄 카테고리 변경 (${newCategory})`, total: items.length })
    try {
      const ids = items.map(i => i.id)
      const { json } = await fetchWithAuth('/api/finance/transactions/group-classify', {
        method: 'PATCH',
        body: { transactionIds: ids, category: newCategory },
      })
      floaterProgress.finish(taskId, `✅ ${json?.data?.updated || items.length}건 카테고리 변경 완료`)
      clearSelection()
      // UI 갱신
      setReviewItems(prev => prev.filter(i => !ids.includes(i.id)))
      // 매칭 검수는 entity 중심 group — reload (lazy: 탭 전환 시 자동 갱신)
      await loadSummary()
    } catch (e: any) {
      floaterProgress.finish(taskId, `오류: ${e.message}`, 'error')
    }
  }

  // 일괄 매칭 변경
  const bulkChangeMatch = async (type: string, entityId: string) => {
    const items = getSelectedTransactions()
    if (items.length === 0) { alert('선택된 거래 없음'); return }
    const cfg = MATCH_TYPES.find(t => t.type === type)
    const ent = (matchEntities[type] || []).find((r: any) => String(r.id) === String(entityId))
    const label = (cfg && ent) ? cfg.labelFn(ent) : '?'
    if (!confirm(`선택 ${items.length}건 → ${cfg?.label} ${label} 매칭하시겠습니까?`)) return
    const taskId = floaterProgress.start({ title: `🔗 일괄 매칭 변경`, total: items.length })
    let success = 0
    let failed = 0
    for (const it of items) {
      try {
        await fetchWithAuth(`/api/finance-upload?table=transactions&id=${it.id}`, {
          method: 'PATCH',
          body: { related_type: type, related_id: entityId },
        })
        success++
        floaterProgress.update(taskId, { processed: success + failed, applied: success, failed })
      } catch {
        failed++
        floaterProgress.update(taskId, { processed: success + failed, applied: success, failed })
      }
    }
    floaterProgress.finish(taskId, `✅ ${success}건 매칭 / 실패 ${failed}건`)
    clearSelection()
    // UI 갱신
    const updateFn = (i: any) => items.find(x => x.id === i.id) ? { ...i, related_type: type, related_id: entityId } : i
    setReviewItems(prev => prev.map(updateFn))
    // 매칭 검수는 entity 중심 — 탭 진입 시 자동 reload
  }

  // 일괄 확정 (룰 자동 분류 LOW row)
  const bulkConfirmRule = async () => {
    const items = getSelectedTransactions().filter(i => {
      const cat = i.subcategory || i.category
      return cat && cat !== '미분류'
    })
    if (items.length === 0) { alert('확정 가능 거래 없음 (카테고리 미분류 제외)'); return }
    if (!confirm(`선택 ${items.length}건 일괄 확정하시겠습니까?`)) return
    const taskId = floaterProgress.start({ title: `✓ 일괄 확정`, total: items.length })
    try {
      const payload = items.map(it => ({
        id: it.id,
        category: it.subcategory || it.category,
        related_type: it.related_type || null,
        related_id: it.related_id || null,
      }))
      const { json } = await fetchWithAuth('/api/finance/auto-classify/apply', {
        method: 'POST',
        body: { items: payload },
      })
      floaterProgress.finish(taskId, `✅ 적용 ${json?.applied || 0}건 / 실패 ${json?.failed || 0}건`)
      clearSelection()
      await runRuleClassify()
      await Promise.all([loadSummary(), loadTransactions()])
    } catch (e: any) {
      floaterProgress.finish(taskId, `오류: ${e.message}`, 'error')
    }
  }

  // 일괄 개인 처리
  const bulkMarkPersonal = async () => {
    const items = getSelectedTransactions()
    if (items.length === 0) { alert('선택된 거래 없음'); return }
    if (!confirm(`선택 ${items.length}건 「개인 사용」 처리하시겠습니까? (급여 차감 후보)`)) return
    const taskId = floaterProgress.start({ title: `👤 일괄 개인 사용`, total: items.length })
    let success = 0
    for (const it of items) {
      try {
        await fetchWithAuth('/api/transactions/classify', {
          method: 'PATCH',
          body: { id: it.id, action: 'personal_use', reason: '일괄 처리' },
        })
        success++
        floaterProgress.update(taskId, { processed: success, applied: success })
      } catch { /* skip */ }
    }
    floaterProgress.finish(taskId, `✅ ${success}건 개인 사용 처리`)
    clearSelection()
    await Promise.all([loadSummary(), loadTransactions()])
    if (reviewCategory) await loadReviewItems(reviewCategory)
  }

  // 분류 검수에서 매칭 변경 — 통합 (차량/직원/보험/대출/지입/투자/렌탈/계약/카드/급여)
  const changeItemMatch = async (id: string, type: string | null, entityId: string | null) => {
    const body = (type && entityId)
      ? { related_type: type, related_id: entityId }
      : { related_type: null, related_id: null }
    await fetchWithAuth(`/api/finance-upload?table=transactions&id=${id}`, {
      method: 'PATCH',
      body,
    })

    // 인메모리 갱신 — 즉시 UI 반영
    let matched_car_id: string | null = null
    let matched_car_number: string | null = null
    let matched_car_model: string | null = null
    let matched_label: string | null = null

    if (type === 'car' && entityId) {
      const car = cars.find(c => c.id === entityId)
      matched_car_id = entityId
      matched_car_number = car?.number || null
      matched_car_model = car ? `${car.brand || ''} ${car.model || ''}`.trim() : null
      matched_label = matched_car_number
    } else if (type && entityId) {
      const cfg = MATCH_TYPES.find(t => t.type === type)
      const ent = (matchEntities[type] || []).find((r: any) => String(r.id) === String(entityId))
      matched_label = (cfg && ent) ? cfg.labelFn(ent) : null
    }

    setReviewItems(prev => prev.map(i => i.id === id ? {
      ...i,
      related_type: (type && entityId) ? type : null,
      related_id: entityId || null,
      matched_car_id,
      matched_car_number,
      matched_car_model,
      matched_label,
    } : i))
  }

  // 하위 호환 — 기존 코드 호출처용
  const changeItemCar = async (id: string, carId: string) => {
    return changeItemMatch(id, carId ? 'car' : null, carId || null)
  }

  const loadGroupClassify = async () => {
    setGroupLoading(true)
    const { json } = await fetchWithAuth('/api/finance/transactions/group-classify', {
      method: 'POST',
      body: { type: 'all', source: 'all', limit: 8000 },
    })
    if (json?.data) {
      setGroupData(json.data)
      // 추천 카테고리를 기본값으로 설정
      const edits: Record<string, string> = {}
      for (const g of json.data.groups || []) {
        if (g.suggestedCategory) edits[g.merchantKey] = g.suggestedCategory
      }
      setGroupCategoryEdits(edits)
    }
    setGroupLoading(false)
  }

  const confirmGroupCategory = async (group: any) => {
    const category = groupCategoryEdits[group.merchantKey]
    if (!category) { alert('카테고리를 선택해주세요'); return }

    setGroupConfirming(prev => new Set([...prev, group.merchantKey]))
    const { json } = await fetchWithAuth('/api/finance/transactions/group-classify', {
      method: 'PATCH',
      body: {
        transactionIds: group.transactionIds,
        category,
        saveAsRule: true,
        merchantName: group.merchantName,
      },
    })
    setGroupConfirming(prev => { const s = new Set(prev); s.delete(group.merchantKey); return s })

    if (json?.data?.updated) {
      // 그룹 목록에서 제거
      setGroupData((prev: any) => prev ? {
        ...prev,
        totalUnclassified: prev.totalUnclassified - group.count,
        groupCount: prev.groupCount - 1,
        groups: prev.groups.filter((g: any) => g.merchantKey !== group.merchantKey),
      } : prev)
    }
  }

  // 🔗 차량 자동 매칭 (수동 트리거) — 기존 거래에 대해 last4 → 차량 매칭 일괄 실행
  const runCarMatch = async (dryRun = false) => {
    setAutoClassifying(true)
    try {
      const { ok, status, json } = await fetchWithAuth('/api/finance/transactions/auto-match-card', {
        method: 'POST',
        body: { dryRun },
      })
      if (!ok) {
        alert(`차량 매칭 실패: HTTP ${status} — ${json?.error || '응답 없음'}`)
        return
      }
      const dist = Object.entries(json.distribution || {}).sort((a: any, b: any) => b[1] - a[1])
        .map(([k, v]) => `  ${v}건  ${k}`).join('\n')
      const resetMsg = json.category_reset
        ? `\n[카테고리 재분류 필요]\n· '공용카드사용'으로 잘못 분류됐던 ${(json.category_reset || 0).toLocaleString()}건이 차량 매칭됨\n  → 카테고리 reset됨, 룰 분류/AI 분류 다시 실행하세요\n`
        : ''
      const gongyongMsg = json.gongyong_categorized
        ? `\n[진짜 공용 (차량 미배정 카드)]\n· '공용카드사용' 카테고리로 자동 설정: ${(json.gongyong_categorized || 0).toLocaleString()}건\n`
        : ''
      alert(
        `${dryRun ? '🔍 차량 매칭 dry-run' : '✓ 차량 매칭 완료'}\n\n` +
        `· 매칭 대상: ${(json.total_unmatched || 0).toLocaleString()}건\n` +
        `· 매칭 성공: ${(dryRun ? json.planned : json.applied || 0).toLocaleString()}건\n` +
        `· 미매칭 (last4 일치 없음): ${(json.skipped_no_match || 0).toLocaleString()}건\n` +
        `· 미매칭 (차량 미배정): ${(json.skipped_no_car || 0).toLocaleString()}건\n` +
        `· 모호 (last4 충돌): ${(json.skipped_ambiguous || 0).toLocaleString()}건\n` +
        resetMsg +
        gongyongMsg +
        (dist ? `\n[차량별]\n${dist}` : '')
      )
      if (!dryRun) {
        await Promise.all([loadSummary(), loadTransactions()])
        if (reviewCategory) await loadReviewItems(reviewCategory)
      }
    } catch (e: any) {
      alert(`차량 매칭 오류: ${e?.message || String(e)}`)
    } finally {
      setAutoClassifying(false)
    }
  }

  // 🔮 풀 자동 매칭 — 차량/보험/대출/정비/지입/투자/급여 + AI 일괄 분류 순차 실행
  // force=true: AI 가 이미 시도한 [AI 추정%] 거래도 재시도 (강제 재분류)
  const runFullAutoMatch = async (options?: { force?: boolean }) => {
    const force = !!options?.force
    if (!confirm(
      `통장 거래 전체 풀 자동 매칭 + AI 분류${force ? ' (강제 재분류)' : ''} 실행:\n\n` +
      '1) 마스터 매칭: 차량 → 보험 → 대출 → 정비 → 지입 → 투자 → 급여\n' +
      `2) AI 일괄 분류: Gemini 로 미분류 거래 자동 카테고리 부여${force ? '\n   ★ 이전 AI 시도 거래도 재처리 — 토큰 더 소모' : ''}\n\n` +
      '· 약 1~3분 소요\n· 토큰 비용 발생 (AI 분류 단계)\n· 중간 정지 불가\n\n' +
      '계속할까요?'
    )) return
    setAutoClassifying(true)
    setFullMatchResult(null) // 이전 결과 클리어
    // 플로팅 진행률 (CLAUDE.md 규칙 16) — 사용자 다른 작업 가능, 블로킹 X
    const taskId = floaterProgress.start({
      title: '🔮 풀 자동 매칭 + AI 분류',
      total: 8, // Phase 1 = 8개 매칭 (Phase 2 는 동적 추가)
    })
    const phase1Results: Array<{ name: string; ok: boolean; applied: number; total: number; skipStr: string; errMsg?: string }> = []
    try {
      // ── Phase 1: 마스터 데이터 매칭 ──
      const calls: { name: string; url: string; body?: any }[] = [
        { name: '차량(last4)',  url: '/api/finance/transactions/auto-match-card' },
        { name: '보험',          url: '/api/finance/transactions/auto-match-insurance', body: { dateTolerance: 7 } },
        { name: '대출',          url: '/api/finance/transactions/auto-match-loan',     body: { dateTolerance: 3 } },
        { name: '정비 등록',     url: '/api/finance/transactions/auto-match-maintenance' },
        { name: '지입',          url: '/api/finance/transactions/auto-match-monthly', body: { type: 'jiip', dateTolerance: 3 } },
        { name: '투자(이자)',    url: '/api/finance/transactions/auto-match-monthly', body: { type: 'invest', dateTolerance: 3 } },
        { name: '급여',          url: '/api/finance/transactions/auto-match-monthly', body: { type: 'salary', dateTolerance: 3 } },
        { name: '대차건 보험',   url: '/api/finance/transactions/auto-match-fmi-rental', body: { mode: 'insurance' } },
      ]
      let phase1Done = 0
      let totalApplied = 0
      for (const c of calls) {
        try {
          const { ok, status, json } = await fetchWithAuth(c.url, { method: 'POST', body: c.body || {} })
          if (!ok) {
            const errMsg = json?.error || '응답 없음'
            phase1Results.push({ name: c.name, ok: false, applied: 0, total: 0, skipStr: '', errMsg: `HTTP ${status} — ${String(errMsg).slice(0, 200)}` })
            phase1Done++
            floaterProgress.update(taskId, { processed: phase1Done, applied: totalApplied, failed: 1 })
            continue
          }
          const applied = Number(json.applied ?? json.applied_high_confidence ?? 0)
          const total = Number(json.total_candidates ?? json.total_unmatched ?? 0)
          totalApplied += applied
          const skips: string[] = []
          if (json.skipped_no_match > 0) skips.push(`매핑X ${json.skipped_no_match}`)
          if (json.skipped_no_car > 0) skips.push(`차량X ${json.skipped_no_car}`)
          if (json.skipped_ambiguous > 0) skips.push(`모호 ${json.skipped_ambiguous}`)
          if (json.skipped_already > 0) skips.push(`이미매칭 ${json.skipped_already}`)
          phase1Results.push({ name: c.name, ok: true, applied, total, skipStr: skips.join(', ') })
          phase1Done++
          floaterProgress.update(taskId, { processed: phase1Done, applied: totalApplied })
        } catch (e: any) {
          phase1Results.push({ name: c.name, ok: false, applied: 0, total: 0, skipStr: '', errMsg: e?.message?.slice(0, 200) || String(e) })
          phase1Done++
          floaterProgress.update(taskId, { processed: phase1Done, applied: totalApplied, failed: 1 })
        }
      }

      // ── Phase 2: AI 일괄 분류 (Gemini) ──
      let aiProcessed = 0, aiApplied = 0, aiBelow = 0, aiInitial = 0
      let aiError: string | undefined
      let aiAutoForceTriggered = false
      const MAX_BATCHES = 50
      let batches = 0
      let currentForce = force
      try {
        while (batches < MAX_BATCHES) {
          batches++
          const { ok, status, json } = await fetchWithAuth('/api/finance/transactions/auto-classify-ai', {
            method: 'POST',
            body: { batchSize: 20, minConfidence: 70, force: currentForce },
          })
          if (!ok) {
            aiError = `HTTP ${status} — ${json?.error || '응답 없음'}`
            break
          }
          const total = Number(json.total_unclassified || 0)
          if (aiInitial === 0) {
            aiInitial = total
            // Phase 2 시작 — total 미분류 추가 (Phase 1 7개 + Phase 2 N개)
            if (aiInitial > 0) {
              floaterProgress.update(taskId, { total: 7 + aiInitial, processed: phase1Done })
            }
          }
          if (total === 0) {
            const excluded = Number(json.excluded_already_tried || 0)
            if (!currentForce && excluded > 0 && !aiAutoForceTriggered) {
              aiAutoForceTriggered = true
              currentForce = true
              continue
            }
            break
          }

          const procThis = Number(json.processed_this_batch || 0)
          const appliedThis = Number(json.applied_high_confidence || 0)
          const belowThis = Number(json.below_threshold || 0)
          aiProcessed += procThis
          aiApplied += appliedThis
          aiBelow += belowThis

          // 진행률 업데이트 — 사용자 화면에서 실시간 보임
          floaterProgress.update(taskId, {
            processed: phase1Done + aiProcessed,
            applied: totalApplied + aiApplied,
          })

          if (appliedThis + belowThis === 0) {
            const dbg = json?.gemini_debug || {}
            aiError = `Gemini 응답 0건 · finishReason=${dbg.finishReason || 'n/a'}`
            break
          }
          if (procThis === 0) break
          if (Number(json.remaining || 0) === 0) break
          await new Promise(r => setTimeout(r, 800))
        }
      } catch (e: any) {
        aiError = e?.message?.slice(0, 60)
      }
      // 결과 state 저장 — 글래스 패널로 표시 (alert/console 대신)
      setFullMatchResult({
        phase1: phase1Results,
        ai: { error: aiError, initial: aiInitial, applied: aiApplied, below: aiBelow, batches, force: aiAutoForceTriggered },
        triggeredAt: new Date().toISOString(),
      })

      // 마무리 — finish 에 핵심 결과 한 줄
      const summary = [
        `Phase 1: ${totalApplied}건 적용`,
        aiInitial === 0
          ? 'AI: 이미 모두 분류됨'
          : aiError
            ? `AI: ${aiError}`
            : `AI: ${aiApplied}/${aiInitial}`,
      ].join(' · ')
      floaterProgress.finish(taskId, `✅ ${summary}`)

      await Promise.all([loadSummary(), loadTransactions()])
      if (reviewCategory) await loadReviewItems(reviewCategory)

      // AIR.4 — AI 분류 검수 자동 호출 (사용자 검수 보조)
      try {
        const { json: rev } = await fetchWithAuth('/api/admin/ai-classify-review')
        if (rev && !rev.error) {
          setAiReviewResult({
            summary: rev?.summary || {},
            by_category: rev?.by_category || [],
            inconsistent: rev?.inconsistent || [],
            user_overridden: rev?.user_overridden || [],
            top_unclassified_high_value: rev?.top_unclassified_high_value || [],
            triggeredAt: new Date().toISOString(),
          })
        }
      } catch { /* 검수 자동 호출 실패는 무시 — 사용자가 수동 클릭 가능 */ }
    } catch (e: any) {
      floaterProgress.finish(taskId, `오류: ${e?.message || String(e)}`, 'error')
    } finally { setAutoClassifying(false) }
  }

  // 💰 대출 자동 매칭
  const runLoanMatch = async (dryRun = false) => {
    setAutoClassifying(true)
    try {
      const { ok, status, json } = await fetchWithAuth('/api/finance/transactions/auto-match-loan', {
        method: 'POST',
        body: { dryRun, dateTolerance: 3, amountTolerance: 1 },
      })
      if (!ok) { alert(`대출 매칭 실패: HTTP ${status} — ${json?.error}`); return }
      alert(
        `${dryRun ? '🔍 대출 매칭 dry-run' : '✓ 대출 매칭 완료'}\n\n` +
        `· 후보: ${(json.total_candidates || 0).toLocaleString()}건\n` +
        `· 매칭 성공: ${(dryRun ? json.planned : json.applied || 0).toLocaleString()}건\n` +
        `· 차량 분배 생성: ${(json.allocation_created || 0).toLocaleString()}건\n` +
        `· 미매칭: ${(json.skipped_no_match || 0).toLocaleString()}건\n` +
        `· 모호: ${(json.skipped_ambiguous || 0).toLocaleString()}건`
      )
      if (!dryRun) {
        await Promise.all([loadSummary(), loadTransactions()])
        if (reviewCategory) await loadReviewItems(reviewCategory)
      }
    } catch (e: any) { alert(`대출 매칭 오류: ${e?.message}`) }
    finally { setAutoClassifying(false) }
  }

  // 🔧 정비 자동 매칭 (maintenance_records 자동 등록)
  const runMaintenanceMatch = async (dryRun = false) => {
    setAutoClassifying(true)
    try {
      const { ok, status, json } = await fetchWithAuth('/api/finance/transactions/auto-match-maintenance', {
        method: 'POST',
        body: { dryRun },
      })
      if (!ok) { alert(`정비 매칭 실패: HTTP ${status} — ${json?.error}`); return }
      alert(
        `${dryRun ? '🔍 정비 매칭 dry-run' : '✓ 정비 매칭 완료'}\n\n` +
        `· 후보: ${(json.total_candidates || 0).toLocaleString()}건\n` +
        `· 정비 등록: ${(dryRun ? json.planned : json.applied || 0).toLocaleString()}건\n` +
        `· 이미 등록됨: ${(json.skipped_already || 0).toLocaleString()}건\n` +
        `· 차량 미매칭 (skip): ${(json.skipped_no_car || 0).toLocaleString()}건`
      )
    } catch (e: any) { alert(`정비 매칭 오류: ${e?.message}`) }
    finally { setAutoClassifying(false) }
  }

  // 🛡 보험 자동 매칭 (수동 트리거)
  const runInsuranceMatch = async (dryRun = false) => {
    setAutoClassifying(true)
    try {
      const { ok, status, json } = await fetchWithAuth('/api/finance/transactions/auto-match-insurance', {
        method: 'POST',
        body: { dryRun, dateTolerance: 7 },
      })
      if (!ok) {
        alert(`보험 매칭 실패: HTTP ${status} — ${json?.error || '응답 없음'}`)
        return
      }
      alert(
        `${dryRun ? '🔍 보험 매칭 dry-run' : '✓ 보험 매칭 완료'}\n\n` +
        `· 매칭 대상: ${(json.total_candidates || 0).toLocaleString()}건\n` +
        `· 매칭 성공: ${(dryRun ? json.planned : json.applied || 0).toLocaleString()}건\n` +
        `· 차량 분담 생성: ${(json.allocation_created || 0).toLocaleString()}건\n` +
        `· 미매칭 (스케줄 없음): ${(json.skipped_no_schedule || 0).toLocaleString()}건\n` +
        `· 모호 (후보 다수): ${(json.skipped_ambiguous || 0).toLocaleString()}건`
      )
      if (!dryRun) {
        await Promise.all([loadSummary(), loadTransactions()])
        if (reviewCategory) await loadReviewItems(reviewCategory)
      }
    } catch (e: any) {
      alert(`보험 매칭 오류: ${e?.message || String(e)}`)
    } finally {
      setAutoClassifying(false)
    }
  }

  const confirmAllSuggested = async () => {
    if (!groupData?.groups) return
    const suggested = groupData.groups.filter((g: any) => g.suggestedCategory && g.suggestedConfidence >= 80)
    if (suggested.length === 0) { alert('자동 확정 가능한 그룹이 없습니다'); return }

    setGroupLoading(true)
    let totalUpdated = 0
    for (const group of suggested) {
      const category = groupCategoryEdits[group.merchantKey] || group.suggestedCategory
      const { json } = await fetchWithAuth('/api/finance/transactions/group-classify', {
        method: 'PATCH',
        body: { transactionIds: group.transactionIds, category, saveAsRule: true, merchantName: group.merchantName },
      })
      totalUpdated += json?.data?.updated || 0
    }
    setGroupLoading(false)
    alert(`${totalUpdated}건 일괄 분류 완료`)
    await loadGroupClassify()
    await Promise.all([loadSummary(), loadTransactions()])
  }

  // ── AI 일괄 분류 실행 (batch 단위 반복 호출) ──
  const runAiClassify = async () => {
    if (!confirm('Gemini AI로 미분류 거래를 일괄 분류합니다.\n\n· 30건씩 batch 처리 (배치당 약 10~30초)\n· 신뢰도 ≥70% 만 자동 적용\n· 미만은 검토 큐에 남음\n· 진행 중에도 닫지 마세요\n\n계속할까요?')) return
    setAutoClassifying(true)
    setAiProgress({ running: true, total: 0, processed: 0, applied: 0, below: 0, distribution: {} })

    let totalApplied = 0
    let totalBelow = 0
    let totalProcessed = 0
    let cumulativeDist: Record<string, number> = {}
    let initialTotal = 0
    let lastError: string | undefined
    const MAX_BATCHES = 50  // 안전 한도 (50 × 50건 = 2500건)
    let batches = 0

    try {
      while (batches < MAX_BATCHES) {
        batches++
        const { ok, status, json } = await fetchWithAuth('/api/finance/transactions/auto-classify-ai', {
          method: 'POST',
          body: { batchSize: 30, minConfidence: 70 },
        })
        if (!ok) {
          // status, error 둘 다 표시 — "알 수 없는 오류" 방지
          lastError = `HTTP ${status} — ${json?.error || JSON.stringify(json).slice(0, 200) || '응답 없음 (타임아웃 가능)'}`
          break
        }
        const total = Number(json.total_unclassified || 0)
        if (initialTotal === 0) initialTotal = total

        // 미분류 자체가 없는 경우
        if (total === 0) {
          break
        }

        const procThis = Number(json.processed_this_batch || 0)
        const appliedThis = Number(json.applied_high_confidence || 0)
        const belowThis = Number(json.below_threshold || 0)

        totalProcessed += procThis
        totalApplied += appliedThis
        totalBelow += belowThis
        for (const [k, v] of Object.entries(json.distribution || {})) {
          cumulativeDist[k] = (cumulativeDist[k] || 0) + Number(v || 0)
        }

        setAiProgress({
          running: true,
          total: initialTotal,
          processed: totalProcessed,
          applied: totalApplied,
          below: totalBelow,
          distribution: { ...cumulativeDist },
        })

        // ★ 핵심 안전망: DB UPDATE가 한 건도 안 일어났으면 즉시 break
        //   → 같은 미분류 row가 다음 batch에서 또 fetch되어 토큰 무한 소모되는 사고 방지
        if (appliedThis + belowThis === 0) {
          const dbg = json?.gemini_debug || {}
          lastError =
            `Gemini 응답 0건 · finishReason=${dbg.finishReason || 'n/a'}` +
            (dbg.usage ? ` · usage=${JSON.stringify(dbg.usage).slice(0, 120)}` : '') +
            (dbg.rawTextSample ? `\nraw: ${String(dbg.rawTextSample).slice(0, 200)}` : '')
          break
        }
        // 한 건도 fetch 안된 경우 (미분류 0)
        if (procThis === 0) break
        // 남은 건이 0이면 종료
        if (Number(json.remaining || 0) === 0) break

        // batch 사이 대기 (rate limit 완화)
        await new Promise(r => setTimeout(r, 800))
      }

      // 최종 알림
      const dist = Object.entries(cumulativeDist).sort((a: any, b: any) => b[1] - a[1])
        .slice(0, 15)
        .map(([k, v]) => `  ${v}건  ${k}`).join('\n')
      alert(
        `✓ AI 일괄 분류 종료\n\n` +
        `· 시작 시 미분류: ${initialTotal.toLocaleString()}건\n` +
        `· 처리 batch 수: ${batches}\n` +
        `· AI 처리 건수: ${totalProcessed.toLocaleString()}건\n` +
        `· 자동 적용 (≥70%): ${totalApplied.toLocaleString()}건\n` +
        `· 검토 필요 (<70%): ${totalBelow.toLocaleString()}건\n` +
        (dist ? `\n[카테고리별 상위 15]\n${dist}\n` : '') +
        (lastError ? `\n⚠ 중단 사유: ${lastError}` : '')
      )
      await Promise.all([loadSummary(), loadTransactions()])
      setGroupData(null)
      setAiProgress(prev => prev ? { ...prev, running: false, lastError } : null)
    } catch (e: any) {
      console.error('[runAiClassify]', e)
      alert(`AI 분류 오류: ${e?.message || String(e)}`)
      setAiProgress(prev => prev ? { ...prev, running: false, lastError: e?.message || String(e) } : null)
    } finally {
      setAutoClassifying(false)
    }
  }

  // ── 자동 분류 실행 (룰 기반) ──
  const runAutoClassify = async (dryRun = false) => {
    setAutoClassifying(true)
    setAutoClassifyResult(null)
    try {
      const { json } = await fetchWithAuth('/api/finance/transactions/auto-classify', {
        method: 'POST',
        body: { minConfidence: 60, dryRun },
      })
      if (json?.data) {
        setAutoClassifyResult(json.data)
        if (!dryRun && json.data.updated > 0) {
          // 분류 완료 → 데이터 새로고침
          await Promise.all([loadSummary(), loadTransactions()])
          // 그룹 데이터 리셋 (다시 로드 필요)
          setGroupData(null)
        }
      }
    } catch (e: any) {
      alert(`자동 분류 오류: ${e.message}`)
    } finally {
      setAutoClassifying(false)
    }
  }

  // ── Phase 3-A — 룰 기반 자동 분류 (dry-run + apply) ──
  const runRuleClassify = async () => {
    const taskId = floaterProgress.start({ title: '🤖 룰 자동 분류 시도 중', total: 0 })
    setRuleClassifyLoading(true)
    setRuleClassifyResult(null)
    setExpandedGroup(null)
    try {
      const { json } = await fetchWithAuth('/api/finance/auto-classify/dry-run', {
        method: 'POST',
        body: { source: 'all', limit: 5000 },
      })
      if (json?.error) {
        floaterProgress.finish(taskId, `오류: ${json.error}`, 'error')
        return
      }
      setRuleClassifyResult(json)
      const c = json?.counts || {}
      floaterProgress.finish(taskId, `완료 — HIGH ${c.high || 0} / MEDIUM ${c.medium || 0} / LOW ${c.low || 0}`)
    } catch (e: any) {
      floaterProgress.finish(taskId, `오류: ${e.message}`, 'error')
    } finally {
      setRuleClassifyLoading(false)
    }
  }

  const applyRuleClassify = async (confidence: 'high' | 'medium' | 'low') => {
    if (!ruleClassifyResult?.groups) return
    const items = ruleClassifyResult.groups[confidence] || []
    if (items.length === 0) {
      alert(`${confidence} 그룹에 적용할 항목 없음`)
      return
    }

    // 미분류 제외 — 카테고리 안 정한 거래는 일괄 확정 의미 없음
    const validItems = items.filter((it: any) => {
      const cat = it.subcategory || it.category
      return cat && cat !== '미분류'
    })
    const skippedCount = items.length - validItems.length
    if (validItems.length === 0) {
      alert(`적용 가능한 항목 없음\n(미분류 ${items.length}건 — row 별 카테고리 dropdown 으로 먼저 변경)`)
      return
    }

    // 룰 학습 옵션 — 일괄
    const learnable = validItems.filter((it: any) => it.client_name || (it.description || '').trim())
    const wantLearn = learnable.length > 0 ? confirm(
      `${confidence.toUpperCase()} 그룹 ${validItems.length}건 일괄 확정${skippedCount > 0 ? ` (미분류 ${skippedCount}건 스킵)` : ''}\n\n` +
      `이 거래들의 거래처 패턴을 룰로 일괄 학습하시겠습니까?\n` +
      `(다음부터 같은 거래처 자동 분류 — ${learnable.length}건 후보)\n\n` +
      `[확인] 룰 학습 + 확정\n[취소] 확정만 (학습 X)`
    ) : false
    if (!learnable.length && !confirm(`${validItems.length}건 일괄 확정 (학습 대상 없음)`)) return

    const taskId = floaterProgress.start({ title: `✓ ${confidence.toUpperCase()} 일괄 확정${wantLearn ? ' + 학습' : ''} 진행 중`, total: validItems.length })
    setRuleClassifyLoading(true)
    try {
      const payload = validItems.map((it: any) => ({
        id: it.id,
        category: it.subcategory || it.category,
        related_type: it.related_type || null,
        related_id: it.related_id || null,
      }))
      const { json } = await fetchWithAuth('/api/finance/auto-classify/apply', {
        method: 'POST',
        body: { items: payload },
      })

      // 룰 학습 — 일괄 batch
      let learnAdded = 0
      let learnSkipped = 0
      if (wantLearn && learnable.length > 0) {
        try {
          const learnPayload = learnable.map((it: any) => ({
            transaction_id: it.id,
            description: it.description,
            client_name: it.client_name,
            category: it.subcategory || it.category,
            tx_type: it.type,
            confidence: 'high',
          }))
          const { json: lr } = await fetchWithAuth('/api/finance/classification-rules/learn', {
            method: 'POST',
            body: { items: learnPayload },
          })
          learnAdded = Number(lr?.added || 0)
          learnSkipped = Number(lr?.already_existed || 0)
        } catch (e: any) {
          console.warn('[일괄 학습] 실패:', e?.message)
        }
      }

      floaterProgress.update(taskId, { processed: validItems.length, applied: json?.applied || 0, failed: json?.failed || 0 })
      const learnMsg = wantLearn ? ` · 학습 ${learnAdded}건 추가 (중복 ${learnSkipped})` : ''
      floaterProgress.finish(taskId, `✅ 적용 ${json?.applied || 0}건 / 실패 ${json?.failed || 0}건${learnMsg}`)
      await runRuleClassify()
      await Promise.all([loadSummary(), loadTransactions()])
    } catch (e: any) {
      floaterProgress.finish(taskId, `오류: ${e.message}`, 'error')
    } finally {
      setRuleClassifyLoading(false)
    }
  }

  // LOW 그룹 row 의 카테고리 / 매칭 인메모리 변경 (확정 전 사용자 수정)
  const updateRuleRow = (id: string, patch: Record<string, any>) => {
    setRuleClassifyResult((prev: any) => {
      if (!prev) return prev
      const newGroups = { ...prev.groups }
      for (const conf of ['high', 'medium', 'low'] as const) {
        newGroups[conf] = (newGroups[conf] || []).map((x: any) => x.id === id ? { ...x, ...patch } : x)
      }
      return { ...prev, groups: newGroups }
    })
  }

  const applyOneClassify = async (it: any, options?: { withRule?: boolean }) => {
    // 미분류 그대로 확정은 의미 없음 — 경고
    const finalCategory = it.subcategory || it.category
    if (!finalCategory || finalCategory === '미분류') {
      alert('카테고리를 먼저 선택하세요. (드롭다운으로 변경)')
      return
    }
    setRuleClassifyLoading(true)
    try {
      const { json } = await fetchWithAuth('/api/finance/auto-classify/apply', {
        method: 'POST',
        body: { items: [{
          id: it.id,
          category: finalCategory,
          related_type: it.related_type || null,
          related_id: it.related_id || null,
        }]},
      })
      if ((json?.applied || 0) > 0) {
        // 룰 학습 옵션 — confirm dialog 또는 명시적 호출
        if (options?.withRule) {
          try {
            const { json: lr } = await fetchWithAuth('/api/finance/classification-rules/learn', {
              method: 'POST',
              body: {
                transaction_id: it.id,
                description: it.description,
                client_name: it.client_name,
                category: finalCategory,
                tx_type: it.type,
                confidence: 'high',
              },
            })
            if (lr?.already_exists) {
              console.log('[학습] 같은 룰 이미 존재 — skip')
            } else if (lr?.ok) {
              console.log(`[학습] 룰 추가: "${lr.pattern}" → ${lr.category} (${lr.extracted_from})`)
            } else if (lr?.error) {
              console.warn(`[학습] 실패: ${lr.error}`)
            }
          } catch (e: any) {
            console.warn('[학습] 룰 추가 실패:', e?.message)
          }
        }
        // 결과 인메모리 갱신 — 적용된 거래 제거
        setRuleClassifyResult((prev: any) => {
          if (!prev) return prev
          const newGroups = { ...prev.groups }
          for (const conf of ['high', 'medium', 'low'] as const) {
            newGroups[conf] = newGroups[conf].filter((x: any) => x.id !== it.id)
          }
          return {
            ...prev,
            groups: newGroups,
            counts: {
              high: newGroups.high.length,
              medium: newGroups.medium.length,
              low: newGroups.low.length,
              total: newGroups.high.length + newGroups.medium.length + newGroups.low.length,
            },
          }
        })
      } else {
        alert(`적용 실패: ${json?.errors?.[0]?.error || '알 수 없음'}`)
      }
    } catch (e: any) {
      alert(`적용 오류: ${e.message}`)
    } finally {
      setRuleClassifyLoading(false)
    }
  }

  // [👤 개인 사용] 액션 — transaction_flags 신규 (급여 차감 후보)
  const markAsPersonal = async (it: any) => {
    const reason = prompt(`개인 사용으로 처리합니다 — 사유 (선택):\n\n적요: ${(it.description || '').slice(0, 60)}\n금액: ${nf(Number(it.amount || 0))}원\n${it.card_holder_name ? `직원: ${it.card_holder_name}` : ''}`, '')
    if (reason === null) return // cancel
    setRuleClassifyLoading(true)
    try {
      const { json } = await fetchWithAuth('/api/transactions/classify', {
        method: 'PATCH',
        body: {
          id: it.id,
          action: 'personal',
          employee_name: it.card_holder_name || null,
          reason: reason || null,
        },
      })
      if (json?.ok) {
        // 결과에서 제거
        setRuleClassifyResult((prev: any) => {
          if (!prev) return prev
          const newGroups = { ...prev.groups }
          for (const conf of ['high', 'medium', 'low'] as const) {
            newGroups[conf] = newGroups[conf].filter((x: any) => x.id !== it.id)
          }
          return {
            ...prev,
            groups: newGroups,
            counts: {
              high: newGroups.high.length,
              medium: newGroups.medium.length,
              low: newGroups.low.length,
              total: newGroups.high.length + newGroups.medium.length + newGroups.low.length,
            },
          }
        })
      } else {
        alert(`개인 사용 처리 실패: ${json?.error || '알 수 없음'}`)
      }
    } catch (e: any) {
      alert(`오류: ${e.message}`)
    } finally {
      setRuleClassifyLoading(false)
    }
  }

  // ── Phase 3-C — 분류 룰 관리 ──
  const loadRules = async () => {
    setRulesLoading(true)
    try {
      const { json } = await fetchWithAuth('/api/finance/classification-rules')
      if (json?.data) setRules(json.data)
    } catch (e: any) {
      console.error('[loadRules]', e)
    } finally {
      setRulesLoading(false)
    }
  }

  const saveRule = async (r: any) => {
    if (!r.pattern || !r.category) {
      alert('키워드(pattern) 와 대분류(category) 는 필수입니다')
      return
    }
    try {
      if (r.id) {
        // 수정
        await fetchWithAuth('/api/finance/classification-rules', { method: 'PATCH', body: r })
      } else {
        // 신규
        await fetchWithAuth('/api/finance/classification-rules', { method: 'POST', body: r })
      }
      setEditRule(null)
      await loadRules()
    } catch (e: any) {
      alert(`저장 오류: ${e.message}`)
    }
  }

  const toggleRuleActive = async (id: string, current: number) => {
    try {
      await fetchWithAuth('/api/finance/classification-rules', {
        method: 'PATCH',
        body: { id, is_active: current ? 0 : 1 },
      })
      await loadRules()
    } catch (e: any) {
      alert(`토글 오류: ${e.message}`)
    }
  }

  const deleteRule = async (id: string, isSystem: number) => {
    if (isSystem) {
      alert('시스템 룰은 삭제할 수 없습니다.\n비활성화 (is_active=0) 로 변경하세요.')
      return
    }
    if (!confirm('이 룰을 삭제하시겠습니까?')) return
    try {
      await fetchWithAuth(`/api/finance/classification-rules?id=${id}`, { method: 'DELETE' })
      await loadRules()
    } catch (e: any) {
      alert(`삭제 오류: ${e.message}`)
    }
  }


  const filteredRules = useMemo(() => {
    let list = rules
    if (ruleFilter === 'system') list = list.filter(r => r.is_system === 1)
    if (ruleFilter === 'user')   list = list.filter(r => r.is_system === 0)
    if (ruleCategoryFilter)      list = list.filter(r => r.category === ruleCategoryFilter)
    return list
  }, [rules, ruleFilter, ruleCategoryFilter])

  const ruleCategories = useMemo(() => {
    return Array.from(new Set(rules.map(r => r.category))).sort()
  }, [rules])

  // ── 은행 데이터 삭제 + 재업로드 안내 ──
  //   PR-BANK-RESET: 통장은 엑셀+문자+오픈뱅킹 수집분을 한 번에 비움 (외주정산·카드는 유지, 복구 가능)
  const deleteAndReupload = async (source: 'excel_bank' | 'excel_card') => {
    const label = source === 'excel_bank' ? '통장' : '카드'
    const apiSource = source === 'excel_bank' ? 'bank_all' : source
    const detail = source === 'excel_bank'
      ? '엑셀·문자·오픈뱅킹으로 들어온 통장 거래를 전부 비웁니다. (외주 정산 자료와 카드는 그대로, 지워도 복구 가능)\n\n비운 뒤 은행에서 받은 전체 기간 엑셀을 올리고 자동매칭을 누르면 연결이 다시 붙습니다.'
      : '기존 카드 거래 데이터를 모두 삭제합니다.\n삭제 후 엑셀 파일을 다시 업로드하세요.'
    if (!confirm(`${label} 거래를 새로 정리할까요?\n\n${detail}`)) return
    const { json } = await fetchWithAuth(`/api/finance/transactions/import?source=${apiSource}`, { method: 'DELETE' })
    if (json?.ok) {
      alert(`${label} 거래 ${json.deleted}건을 비웠습니다.\n이제 엑셀 파일을 올려주세요.`)
      await Promise.all([loadSummary(), loadTransactions()])
      setGroupData(null)
      setAutoClassifyResult(null)
    }
  }

  const filteredGroups = useMemo(() => {
    if (!groupData?.groups) return []
    let list = groupData.groups as any[]
    if (groupFilter === 'suggested') list = list.filter(g => g.suggestedCategory)
    if (groupFilter === 'unclassified') list = list.filter(g => !g.suggestedCategory)
    if (groupSourceFilter !== 'all') list = list.filter(g => g.source === groupSourceFilter)
    if (groupTypeFilter !== 'all') list = list.filter(g => g.type === groupTypeFilter)
    return list
  }, [groupData, groupFilter, groupSourceFilter, groupTypeFilter])

  // ─── 수동매칭 (정산 탭) ──────────────────────────────

  const openMatchCandidates = async (settlementId: string) => {
    const { json } = await fetchWithAuth(`/api/finance/transactions/match-candidates?settlementId=${settlementId}`)
    if (json?.data) {
      setMatchTarget(json.data.settlement)
      setMatchCandidates(json.data.candidates || [])
      setShowMatchModal(true)
    }
  }

  const confirmManualMatch = async (txId: string) => {
    if (!matchTarget) return
    await fetchWithAuth('/api/finance/transactions/confirm-match', {
      method: 'POST',
      body: { matches: [{ transactionId: txId, matchType: 'settlement', matchId: matchTarget.id, contractType: matchTarget.contract_type }] },
    })
    setShowMatchModal(false)
    await Promise.all([loadSummary(), loadTransactions(), loadSettlements()])
  }

  // ─── SMS 카드 연결 ───────────────────────────────────

  const linkSmsCards = async () => {
    await fetchWithAuth('/api/finance/sms/link-cards', { method: 'POST' })
    await Promise.all([loadSummary(), loadTransactions()])
  }

  // ─── 매칭 해제 ───────────────────────────────────────

  const unlinkTransaction = async (txId: string, settlementId?: string) => {
    await fetchWithAuth('/api/finance/transactions/unlink', {
      method: 'POST',
      body: { transactionId: txId, settlementId },
    })
    await Promise.all([loadSummary(), loadTransactions(), loadSettlements()])
  }

  // ═══ 탭 콘텐츠 ═════════════════════════════════════════

  // 큰 구성 = 통장·카드 원장만 (정보구조 3층 원칙 — 2026-07-08 사용자 명시:
  //   「대차료 입금현황·정산 연결은 여기서 안 하고 대차/지입/투자 페이지에서 각각」)
  //   대차료 → 사고대차 청구 탭 / 정산 → 지입·투자 페이지. 기존 탭은 고급으로 강등 (레거시 접근용).
  // 2026-07-08 사용자 명시 「확실하지 않은 기능은 혼란」 — 4개만:
  //   통장·카드(원장) + SMS 수집(수집층 확인) + 매핑 관리(계좌·카드 식별 설정)
  // REDESIGN 3탭 완성 (2026-07-30) — 통장/카드 탭은 거래내역에 흡수
  const tabs = [
    { key: 'ledger', label: '거래내역', count: summary?.transactions.total },
    { key: 'sms-bank', label: '수집함 · 통장' },
    { key: 'sms-card', label: '수집함 · 카드' },
    { key: 'mapping', label: '매핑 관리' },
  ]

  // ── 통계 카드 ─────────────────────────────────────────

  const stats: StatItem[] = summary ? [
    { label: '전체 거래', value: nf(summary.transactions.total), tint: 'blue', icon: '📊' },
    { label: '통장', value: nf(summary.transactions.bank), tint: 'green', icon: '🏦' },
    { label: '카드', value: nf(summary.transactions.card), tint: 'purple', icon: '💳' },
    // 분류완료·미분류는 분석성 지표 → 「고급」 탭에서 확인 (상단 단순화, 2026-06-28)
  ] : []

  // ── 통장 거래 탭 ──────────────────────────────────────



  // ── 거래내역 탭 부속 (구 통장/카드 탭에서 이관 — 2026-07-30) ─────────
  // ── 거래내역 보기 필터 (통장/카드 탭 흡수 — 2026-07-30) ──
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('all')

  // 거래처명 인라인 수정 — 낙관적 갱신 + 별칭 등록 제안 (구 통장 탭 기능 이관)
  const saveClientName = useCallback(async (id: string, value: string, oldValue: string) => {
    setTransactions((prev) => prev.map((t: any) => t.id === id ? { ...t, client_name: value } : t))
    const { ok, json } = await fetchWithAuth(`/api/transactions/${id}`, { method: 'PATCH', body: { client_name: value } })
    if (!ok || json?.error) { alert(json?.error || '거래처 저장에 실패했습니다'); loadTransactions(); return }
    if (oldValue && value && oldValue !== value) setAliasPrompt({ bankName: oldValue, actualName: value })
  }, [loadTransactions])

  // page 소유 필터 합성 (계좌·카드 선택, 연결, 구분) — LedgerTab 에 주입
  const ledgerExternalFilter = useMemo(() => {
    const active = domainPick !== 'all' || bankLinkPick !== 'all' || bankAccountPick !== 'all' || cardPick !== 'all'
    if (!active) return undefined
    return (t: any) => {
      if (domainPick === 'none' && t.manage_domain) return false
      if (domainPick !== 'all' && domainPick !== 'none' && t.manage_domain !== domainPick) return false
      if (bankLinkPick === 'linked' && !(t.related_type && t.related_id)) return false
      if (bankLinkPick === 'unlinked' && !!t.related_type && !!t.related_id) return false
      if (!['all', 'linked', 'unlinked'].includes(bankLinkPick) && t.related_type !== bankLinkPick) return false
      if (bankAccountPick !== 'all' && isBankTx(t) && String(t.account_last4 || '') !== bankAccountPick) return false
      if (cardPick !== 'all' && !isBankTx(t)) {
        const alias = t.matched_card_alias || t.sms_card_alias || (t.account_last4 ? `****${t.account_last4}` : '')
        if (String(alias) !== cardPick) return false
      }
      return true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainPick, bankLinkPick, bankAccountPick, cardPick])

  // 계좌별 현재 잔액 + 최근 30일 자동 검증 (2026-07-08 사용자 명시 — 통장 보기)
  const bankStrip = bankAccountOptions.length > 0 ? (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      {bankAccountOptions.map((a) => {
        const s = bankAccountSummary.get(a)
        const v = acctVerify[a]
        const selected = bankAccountPick === a
        return (
          <div key={a}
            onClick={() => setBankAccountPick(selected ? 'all' : a)}
            style={{
              ...GLASS.L3,
              cursor: 'pointer', padding: '10px 14px', borderRadius: 12, minWidth: 172,
              ...(selected ? { background: COLORS.bgBlue } : {}),
              border: selected ? `1.5px solid ${COLORS.primary}` : `1px solid ${COLORS.borderBlue}`,
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary }}>계좌 ****{a}</span>
              {v && (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    // 배지 검사와 같은 기간(최근 30일)으로 즉시 실행 — 결과가 배지 숫자와 일치
                    const to = new Date().toISOString().slice(0, 10)
                    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
                    setRcAccount(a); setRcFrom(from); setRcTo(to); setReconcileOpen(true)
                    runReconcile({ account: a, from, to })
                  }}
                  title={v.ok ? '최근 30일 입출금과 잔액이 이어집니다' : `최근 30일 중 ${v.breaks}곳에서 잔액이 안 이어집니다 — 눌러서 확인`}
                  style={{
                    fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 8, whiteSpace: 'nowrap',
                    background: v.ok ? 'rgba(22,163,74,0.10)' : 'rgba(239,68,68,0.10)',
                    color: v.ok ? '#15803d' : '#dc2626',
                  }}>{v.ok ? '✅ 검증됨' : `⚠ ${v.breaks}곳 확인`}</span>
              )}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>
              {s?.balance != null ? `${Math.round(s.balance).toLocaleString()}원` : '잔액 정보 없음'}
            </div>
            {s?.balanceDate && (
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>기준 {String(s.balanceDate).slice(0, 10)}</div>
            )}
          </div>
        )
      })}
    </div>
  ) : null

  // 카드별 이번 달 누적 사용액 (2026-07-08 사용자 명시 — 카드 보기)
  const cardStrip = cardMonthSummary.size > 0 ? (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      {Array.from(cardMonthSummary.entries()).sort((x, y) => y[1].sum - x[1].sum).slice(0, 10).map(([alias, info]) => {
        const selected = cardPick === alias
        return (
          <div key={alias}
            onClick={() => setCardPick(selected ? 'all' : alias)}
            style={{
              ...GLASS.L3,
              cursor: 'pointer', padding: '10px 14px', borderRadius: 12, minWidth: 150,
              ...(selected ? { background: COLORS.bgViolet } : {}),
              border: selected ? '1.5px solid #7c3aed' : `1px solid ${COLORS.borderViolet}`,
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>{alias}</span>
              {info.holder && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: 'rgba(124,58,237,0.08)', color: '#7c3aed', whiteSpace: 'nowrap' }}>{info.holder}</span>}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>
              {Math.round(info.sum).toLocaleString()}원
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap' }}>
              이번 달 사용{info.car ? <span style={{ color: '#1e40af', fontWeight: 700 }}> · 🚗 {info.car}</span> : ''}
            </div>
          </div>
        )
      })}
    </div>
  ) : null

  // 툴바 우측 — 연결/구분 필터 + 업로드/전체삭제 (구 통장/카드 탭 툴바 이관)
  const ledgerSelStyle = { padding: '7px 9px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 12, fontWeight: 700, color: COLORS.textPrimary } as const
  const ledgerTrailing = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {ledgerFilter === 'bank' && bankAccountOptions.length > 0 && (
        <select value={bankAccountPick} onChange={(e) => setBankAccountPick(e.target.value)} style={ledgerSelStyle}>
          <option value="all">🏦 계좌 전체</option>
          {bankAccountOptions.map((a) => <option key={a} value={a}>계좌 ****{a}</option>)}
        </select>
      )}
      {ledgerFilter === 'card' && cardPickOptions.length > 0 && (
        <select value={cardPick} onChange={(e) => setCardPick(e.target.value)} style={ledgerSelStyle}>
          <option value="all">💳 카드 전체</option>
          {cardPickOptions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      )}
      {/* 연결(매칭) 필터 — 2026-07-08 사용자 명시 「연결된 부분들 필터」 */}
      <select value={bankLinkPick} onChange={(e) => setBankLinkPick(e.target.value)} style={ledgerSelStyle}>
        <option value="all">🔗 연결 전체</option>
        <option value="linked">연결됨</option>
        <option value="unlinked">미연결</option>
        <option value="fmi_rental">대차 연결</option>
        <option value="car">차량 연결</option>
      </select>
      {/* 관리 구분 필터 (V11) */}
      {domains.length > 0 && (
        <select value={domainPick} onChange={(e) => setDomainPick(e.target.value)} style={ledgerSelStyle}>
          <option value="all">🗂 구분 전체</option>
          <option value="none">미지정</option>
          {domains.filter((x) => x.is_active).map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
        </select>
      )}
      <button
        onClick={() => { setUploadSource('excel_bank'); setShowUpload(true); setUploadPreview([]); setUploadResult(null); setUploadFiles([]); setUploadFileName(''); setUploadColumns({}); setSkippedFiles([]) }}
        style={{ ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer' }}
      >📤 통장 업로드</button>
      <button
        onClick={() => { setUploadSource('excel_card'); setShowUpload(true); setUploadPreview([]); setUploadResult(null); setUploadFiles([]); setUploadFileName(''); setUploadColumns({}); setSkippedFiles([]) }}
        style={{ ...BTN.sm, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer' }}
      >📤 카드 업로드</button>
      {ledgerFilter === 'bank' && summary && summary.transactions.bank > 0 && (
        <button onClick={() => deleteAndReupload('excel_bank')}
          style={{ ...BTN.sm, background: '#fff', color: COLORS.danger, border: `1px solid rgba(239,68,68,0.3)`, cursor: 'pointer' }}
        >🗑 통장 전체삭제</button>
      )}
      {ledgerFilter === 'card' && summary && summary.transactions.card > 0 && (
        <button onClick={() => deleteAndReupload('excel_card')}
          style={{ ...BTN.sm, background: '#fff', color: COLORS.danger, border: `1px solid rgba(239,68,68,0.3)`, cursor: 'pointer' }}
        >🗑 카드 전체삭제</button>
      )}
    </div>
  )

  // ═══ 렌더링 ═════════════════════════════════════════════

  return (
    <div style={{ padding: '0 0 40px'}}>

      {/* 페이지 제목 */}
      <div style={{ padding: '24px 16px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>💰</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>통장/카드 관리</h1>
      </div>

      {/* 상단 통계 */}
      {summary && <div style={{ padding: '0 16px 12px' }}><DcStatStrip stats={stats} /></div>}

      {/* 탭 — 통장·카드 원장 + 수집 확인(SMS)·식별 설정(매핑) 4개만 (2026-07-08 사용자 명시 「깔끔하게」) */}
      <div style={{ padding: '0 16px 8px' }}>
        <NeuFilterTabs
          tabs={tabs}
          activeKey={activeTab}
          onSelect={(k) => { setActiveTab(k as TabKey); setSearch('') }}
        />
      </div>

      {/* ──── BulkActionBar — 선택된 거래 일괄 작업 (floating bottom — 거래 row 근처) ──── */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 100,
          padding: '12px 18px',
          ...GLASS.L5,
          border: '1px solid rgba(124,58,237,0.4)',
          borderRadius: 12,
          boxShadow: '0 -4px 24px rgba(124,58,237,0.20), 0 8px 32px rgba(0,0,0,0.08)',
          background: 'linear-gradient(90deg, rgba(245,243,255,0.97), #ffffff)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          maxWidth: 1400, margin: '0 auto',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5b21b6' }}>
            ✓ 선택 {selectedIds.size}건
          </div>

          {/* 카테고리 일괄 변경 */}
          <select
            value=""
            onChange={(e) => { if (e.target.value) bulkChangeCategory(e.target.value); e.target.value = '' }}
            style={{ fontSize: 11, padding: '5px 10px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, color: '#1e40af', cursor: 'pointer', minWidth: 140, fontWeight: 600 }}
          >
            <option value="">📁 카테고리 변경 ▾</option>
            {Array.from(new Set([...(summary?.categoryBreakdown || []).map((c: any) => c.category), '미분류'])).filter(Boolean).map((c: string) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* 매칭 일괄 변경 — 2단 (type → entity) */}
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <select
              id="bulk-match-type"
              defaultValue=""
              onChange={(e) => { if (e.target.value) loadMatchEntities(e.target.value) }}
              style={{ fontSize: 11, padding: '5px 8px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, cursor: 'pointer' }}
            >
              <option value="">🔗 매칭 ▾</option>
              {MATCH_TYPES.map(t => (
                <option key={t.type} value={t.type}>{t.label}</option>
              ))}
            </select>
            <select
              id="bulk-match-entity"
              defaultValue=""
              onChange={(e) => {
                const typeSel = document.getElementById('bulk-match-type') as HTMLSelectElement
                const type = typeSel?.value
                if (!type || !e.target.value) return
                bulkChangeMatch(type, e.target.value)
                e.target.value = ''
                if (typeSel) typeSel.value = ''
              }}
              style={{ fontSize: 11, padding: '5px 8px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, cursor: 'pointer', maxWidth: 200 }}
            >
              <option value="">— 대상 선택 —</option>
              {(() => {
                const typeSel = typeof document !== 'undefined' ? (document.getElementById('bulk-match-type') as HTMLSelectElement) : null
                const type = typeSel?.value
                if (!type) return null
                const cfg = MATCH_TYPES.find(t => t.type === type)
                if (!cfg) return null
                const list = matchEntities[type] || []
                return list.map((r: any) => <option key={r.id} value={r.id}>{cfg.labelFn(r)}</option>)
              })()}
            </select>
          </span>

          {/* 일괄 확정 */}
          <button
            onClick={bulkConfirmRule}
            style={{ ...BTN.sm, padding: '5px 12px', fontSize: 11, fontWeight: 600, background: '#15803d', color: '#fff', border: 'none', cursor: 'pointer' }}
          >✓ 확정</button>

          {/* 일괄 개인 */}
          <button
            onClick={bulkMarkPersonal}
            style={{ ...BTN.sm, padding: '5px 12px', fontSize: 11, fontWeight: 600, background: '#ca8a04', color: '#fff', border: 'none', cursor: 'pointer' }}
          >👤 개인</button>

          <span style={{ flex: 1 }} />

          <button
            onClick={clearSelection}
            style={{ ...BTN.sm, padding: '5px 10px', fontSize: 11, color: COLORS.textMuted, background: 'rgba(0,0,0,0.04)', border: `1px solid ${COLORS.borderSubtle}`, cursor: 'pointer' }}
          >× 선택 해제</button>
        </div>
      )}

      {/* 탭별 콘텐츠 */}
      <div style={{ padding: '0 16px' }}>

        {/* PR-RECONCILE — 잔액 맞춰보기 모달 */}
        {reconcileOpen && (
          <div onClick={() => !rcBusy && setReconcileOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ background: '#fff', width: 'min(560px, 96vw)', maxHeight: '86vh', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', margin: 0 }}>🧮 잔액 맞춰보기</h3>
                <span style={{ fontSize: 11, color: COLORS.textMuted }}>이 기간 자료가 정확한지 확인</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => !rcBusy && setReconcileOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select value={rcBank} onChange={(e) => setRcBank(e.target.value as any)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 12 }}>
                    <option value="all">모든 통장</option>
                    <option value="woori">우리은행</option>
                    <option value="kb">국민은행</option>
                  </select>
                  <input value={rcAccount} onChange={(e) => setRcAccount(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="계좌 끝4자리" maxLength={4}
                    style={{ width: 92, padding: '7px 9px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 12 }} />
                  <input type="date" value={rcFrom} onChange={(e) => setRcFrom(e.target.value)} style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 12 }} />
                  <span style={{ fontSize: 11, color: COLORS.textMuted }}>~</span>
                  <input type="date" value={rcTo} onChange={(e) => setRcTo(e.target.value)} style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 12 }} />
                  <button onClick={() => runReconcile()} disabled={rcBusy}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: COLORS.primary, color: '#fff', fontSize: 12, fontWeight: 800, cursor: rcBusy ? 'wait' : 'pointer' }}>
                    {rcBusy ? '확인 중…' : '확인하기'}
                  </button>
                </div>

                {rcResult && !rcResult.error && (
                  <>
                    {/* 자동 검사 — 문자·은행이 알려준 잔액 사슬 */}
                    <div style={{ padding: '11px 14px', borderRadius: 10, border: `1px solid ${Number(rcResult.chain?.breaks?.length) > 0 ? 'rgba(239,68,68,0.35)' : 'rgba(16,185,129,0.4)'}`, background: Number(rcResult.chain?.breaks?.length) > 0 ? 'rgba(254,242,242,0.6)' : 'rgba(236,253,245,0.6)' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: Number(rcResult.chain?.breaks?.length) > 0 ? '#991b1b' : '#065f46' }}>
                        {Number(rcResult.chain?.breaks?.length) > 0
                          ? `⚠ 잔액이 이어지지 않는 지점 ${rcResult.chain.breaks_found}곳 — 그 사이에 빠졌거나 두 번 들어간 거래가 있습니다`
                          : rcResult.chain?.with_balance > 1
                            ? `✅ 잔액 기록이 있는 ${rcResult.chain.with_balance}건이 끊김 없이 이어집니다 — 이 기간 자료 정확`
                            : `이 기간에는 잔액이 기록된 거래가 적어 자동 확인이 어렵습니다 — 아래 수동 비교를 쓰세요`}
                      </div>
                      {(rcResult.chain?.breaks || []).map((b: any, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: '#7f1d1d', marginTop: 5 }}>
                          · {b.date} {b.client_name} 근처 — 장부보다 {Math.abs(b.diff).toLocaleString('ko-KR')}원 {b.diff > 0 ? '많음(누락 의심)' : '적음(중복 의심)'}
                        </div>
                      ))}
                    </div>

                    {/* 기간 합계 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(16,185,129,0.07)' }}>
                        <div style={{ fontSize: 11, color: COLORS.textMuted }}>기간 입금 합계</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#065f46' }}>{Number(rcResult.income_sum).toLocaleString('ko-KR')}원</div>
                      </div>
                      <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.06)' }}>
                        <div style={{ fontSize: 11, color: COLORS.textMuted }}>기간 출금 합계</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#991b1b' }}>{Number(rcResult.expense_sum).toLocaleString('ko-KR')}원</div>
                      </div>
                      <div style={{ padding: '10px 12px', borderRadius: 10, background: COLORS.bgBlue }}>
                        <div style={{ fontSize: 11, color: COLORS.textMuted }}>늘어난 돈 (계산)</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#0f2440' }}>{Number(rcResult.net).toLocaleString('ko-KR')}원</div>
                      </div>
                    </div>

                    {/* 수동 비교 — 은행 앱 잔액 두 개 */}
                    <div style={{ padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)' }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#0f2440', marginBottom: 8 }}>은행 앱 잔액으로 한 번 더 확인 (선택)</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input type="number" value={rcStart} onChange={(e) => setRcStart(e.target.value)} placeholder="시작일 아침 잔액"
                          style={{ flex: '1 1 140px', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 12 }} />
                        <input type="number" value={rcEnd} onChange={(e) => setRcEnd(e.target.value)} placeholder="끝일 저녁 잔액"
                          style={{ flex: '1 1 140px', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 12 }} />
                      </div>
                      {rcStart !== '' && rcEnd !== '' && (() => {
                        const realNet = Number(rcEnd) - Number(rcStart)
                        const diff = realNet - Number(rcResult.net)
                        return (
                          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: diff === 0 ? '#065f46' : '#991b1b' }}>
                            {diff === 0
                              ? '✅ 은행과 딱 맞습니다 — 이 기간 자료 정확'
                              : `⚠ 은행보다 장부가 ${Math.abs(diff).toLocaleString('ko-KR')}원 ${diff > 0 ? '적습니다 (누락 의심)' : '많습니다 (중복 의심)'}`}
                          </div>
                        )
                      })()}
                    </div>
                  </>
                )}
                {rcResult?.error && <div style={{ fontSize: 12, color: '#991b1b' }}>⚠ {rcResult.error}</div>}
              </div>
            </div>
          </div>
        )}

        {/* ──── 거래내역 탭 (통장+카드 통합 — REDESIGN, 통장/카드 탭 흡수 2026-07-30) ──── */}
        {activeTab === 'ledger' && (
          <LedgerTab
            transactions={transactions}
            loading={loading}
            isBank={isBankTx}
            domains={domains}
            domainLabel={domainLabel}
            onAssignDomain={assignDomain}
            onCategoryChange={changeCategory}
            categoryOptions={categoryOptions}
            filter={ledgerFilter}
            onFilterChange={setLedgerFilter}
            bankStrip={bankStrip}
            cardStrip={cardStrip}
            trailing={ledgerTrailing}
            externalFilter={ledgerExternalFilter}
            onSaveClientName={saveClientName}
          />
        )}

        {/* ──── 수집함 — 통장/카드 분리 (2026-08-03 사용자 확정) ──── */}
        {(activeTab === 'sms-bank' || activeTab === 'sms-card') && (
          <SmsTab
            rows={smsRows.filter((r: any) => {
              const isBank = /BANK$/i.test(String(r.card_issuer || ''))
              return activeTab === 'sms-bank' ? isBank : !isBank
            })}
            stats={smsStats}
            loading={smsLoading}
            statusFilter={smsStatusFilter}
            issuerFilter={smsIssuerFilter}
            onStatusFilter={setSmsStatusFilter}
            onIssuerFilter={setSmsIssuerFilter}
            reparsing={reparsing}
            onReparse={handleReparse}
            registeringId={smsRegistering}
            onRegister={registerSmsToLedger}
          />
        )}

        {/* ──── 매핑 관리 탭 ──── */}
        {activeTab === 'mapping' && (
          <MappingTab
            sub={mappingSub}
            onSub={setMappingSub}
            cards={mappingCards}
            banks={mappingBanks}
            domains={domains}
            smsAliases={smsAliases}
            onEdit={setEditMapping}
            onDelete={deleteMapping}
            reloadMappings={loadMappings}
            reloadDomains={loadDomains}
          />
        )}



      </div>

      {/* ═══ 매핑 편집 모달 ═══ */}
      {editMapping && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEditMapping(null) }}>
          <div style={{ ...GLASS.L4, borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>
              {editMapping.type === 'card' ? '💳 카드 매핑' : '🏦 통장 매핑'} {editMapping.id ? '수정' : '추가'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {editMapping.type === 'card' ? (
                <>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>카드 별칭
                    <input value={editMapping.card_alias || ''} onChange={e => setEditMapping({ ...editMapping, card_alias: e.target.value })}
                      placeholder="예: KB국민-8819" style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>카드사
                      <select value={editMapping.card_issuer || ''} onChange={e => setEditMapping({ ...editMapping, card_issuer: e.target.value })}
                        style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }}>
                        <option value="">선택</option>
                        <option value="KB국민">KB국민</option><option value="우리">우리</option>
                        <option value="현대">현대</option><option value="신한">신한</option>
                        <option value="삼성">삼성</option><option value="롯데">롯데</option>
                        <option value="하나">하나</option><option value="IBK">IBK</option>
                        <option value="법인">법인(자체)</option>
                      </select>
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>상태
                      <select value={editMapping.status || 'active'} onChange={e => setEditMapping({ ...editMapping, status: e.target.value })}
                        style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }}>
                        <option value="active">✓ 사용중</option>
                        <option value="canceled">🚫 해지</option>
                        <option value="suspended">⏸ 정지</option>
                      </select>
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>카드 종류
                      <select value={editMapping.card_type || '법인신용'} onChange={e => setEditMapping({ ...editMapping, card_type: e.target.value })}
                        style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }}>
                        <option value="법인신용">법인신용</option>
                        <option value="법인체크">법인체크</option>
                        <option value="하이패스">하이패스</option>
                        <option value="주유">주유</option>
                        <option value="기타">기타</option>
                      </select>
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>기명/무기명
                      <select value={editMapping.card_holder_type || '무기명'} onChange={e => setEditMapping({ ...editMapping, card_holder_type: e.target.value })}
                        style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }}>
                        <option value="무기명">무기명</option>
                        <option value="기명">기명</option>
                      </select>
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>소지자/사용자
                      <input value={editMapping.holder_name || ''} onChange={e => setEditMapping({ ...editMapping, holder_name: e.target.value })}
                        placeholder="예: 석호민" style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>부서
                      <input value={editMapping.department || ''} onChange={e => setEditMapping({ ...editMapping, department: e.target.value })}
                        placeholder="예: 탁송팀" style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                    </label>
                  </div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>카드번호
                    <input value={editMapping.card_number || ''} onChange={e => setEditMapping({ ...editMapping, card_number: e.target.value })}
                      placeholder="예: 9410-4992-9322-4829 (마스킹 시 ****-****-****-XXXX)" style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4, fontFamily: 'monospace' }} />
                  </label>
                  {/* ── 발급/만료 ── */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>발급일
                      <input type="date" value={editMapping.issued_at || ''} onChange={e => setEditMapping({ ...editMapping, issued_at: e.target.value })}
                        style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>만료일
                      <input type="date" value={editMapping.expires_at || ''} onChange={e => setEditMapping({ ...editMapping, expires_at: e.target.value })}
                        style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>유효기간(MM/YY)
                      <input value={editMapping.valid_thru || ''} onChange={e => setEditMapping({ ...editMapping, valid_thru: e.target.value })}
                        placeholder="08/30" style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                    </label>
                  </div>
                  {/* ── 결제 정보 ── */}
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px', gap: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>결제 은행
                      <input value={editMapping.payment_bank || ''} onChange={e => setEditMapping({ ...editMapping, payment_bank: e.target.value })}
                        placeholder="우리은행" style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>결제 계좌번호
                      <input value={editMapping.payment_account || ''} onChange={e => setEditMapping({ ...editMapping, payment_account: e.target.value })}
                        placeholder="1005504828777" style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4, fontFamily: 'monospace' }} />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>결제일
                      <input type="number" min={1} max={31} value={editMapping.payment_day || ''} onChange={e => setEditMapping({ ...editMapping, payment_day: e.target.value ? Number(e.target.value) : null })}
                        placeholder="25" style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                    </label>
                  </div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>월 한도 (원)
                    <input type="number" value={editMapping.monthly_limit || ''} onChange={e => setEditMapping({ ...editMapping, monthly_limit: e.target.value ? Number(e.target.value) : null })}
                      placeholder="13000000" style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>직전 카드번호 (갱신 추적)
                    <input value={editMapping.previous_card_number || ''} onChange={e => setEditMapping({ ...editMapping, previous_card_number: e.target.value })}
                      placeholder="이전 카드 번호 — 갱신 시 추적용" style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4, fontFamily: 'monospace' }} />
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>메모
                    <textarea value={editMapping.memo || ''} onChange={e => setEditMapping({ ...editMapping, memo: e.target.value })}
                      placeholder="자유 메모 (사용 제한 / 특이사항 등)" rows={2} style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4, resize: 'vertical', fontFamily: 'inherit' }} />
                  </label>
                </>
              ) : (
                <>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>계좌 별칭 (SMS 형식)
                    <input value={editMapping.account_alias || ''} onChange={e => {
                      const v = e.target.value
                      // 계좌번호 입력했는데 별칭 비어있으면 자동 생성: "은행한글명****끝4자리"
                      const next: any = { ...editMapping, account_alias: v }
                      setEditMapping(next)
                    }}
                      placeholder="예: 우리은행****8777 (SMS 와 정확히 일치)" style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>계좌번호 (정확 매칭용 ★)
                    <input value={editMapping.account_number || ''} onChange={e => {
                      const v = e.target.value
                      const next: any = { ...editMapping, account_number: v }
                      // 계좌 별칭 비어있으면 자동 생성 시도
                      const digits = v.replace(/\D/g, '')
                      if (digits.length >= 4 && !editMapping.account_alias && editMapping.bank_name) {
                        next.account_alias = `${editMapping.bank_name}****${digits.slice(-4)}`
                      }
                      setEditMapping(next)
                    }}
                      placeholder="예: 1002-928-828777 (선택, 정확 매칭에 사용)"
                      style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>지점 (선택)
                    <input value={editMapping.branch || ''} onChange={e => setEditMapping({ ...editMapping, branch: e.target.value })}
                      placeholder="예: 송파지점"
                      style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>은행
                    <select value={editMapping.bank_issuer || ''} onChange={e => {
                      const issuer = e.target.value
                      // bank_issuer 코드 → bank_name 한국어 자동 매핑
                      const nameMap: Record<string, string> = {
                        WOORI_BANK: '우리은행', KB_BANK: '국민은행', SHINHAN_BANK: '신한은행',
                        HANA_BANK: '하나은행', NH_BANK: '농협', IBK_BANK: '기업은행',
                        SC_BANK: 'SC제일은행', KAKAO_BANK: '카카오뱅크', TOSS_BANK: '토스뱅크',
                        SAEMAUL: '새마을금고', POST: '우체국', K_BANK: '케이뱅크',
                      }
                      setEditMapping({ ...editMapping, bank_issuer: issuer, bank_name: nameMap[issuer] || editMapping.bank_name || '' })
                    }}
                      style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }}>
                      <option value="">선택</option>
                      <option value="WOORI_BANK">우리은행</option>
                      <option value="KB_BANK">국민은행</option>
                      <option value="SHINHAN_BANK">신한은행</option>
                      <option value="HANA_BANK">하나은행</option>
                      <option value="NH_BANK">농협</option>
                      <option value="IBK_BANK">기업은행</option>
                      <option value="SC_BANK">SC제일은행</option>
                      <option value="KAKAO_BANK">카카오뱅크</option>
                      <option value="TOSS_BANK">토스뱅크</option>
                      <option value="K_BANK">케이뱅크</option>
                      <option value="SAEMAUL">새마을금고</option>
                      <option value="POST">우체국</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>예금주
                    <input value={editMapping.account_holder || ''} onChange={e => setEditMapping({ ...editMapping, account_holder: e.target.value })}
                      placeholder="예: 주식회사 에프엠아이"
                      style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>예금주 연락처 (선택)
                    <input value={editMapping.account_holder_phone || ''} onChange={e => setEditMapping({ ...editMapping, account_holder_phone: e.target.value })}
                      placeholder="010-XXXX-XXXX"
                      style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>용도 (자유 입력 + 추천)
                    <input list="bank-purpose-list" value={editMapping.purpose || ''} onChange={e => setEditMapping({ ...editMapping, purpose: e.target.value })}
                      placeholder="렌트수입 / 운영비 / 타이어 / 충전기 시설유지보수 ..."
                      style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }} />
                    <datalist id="bank-purpose-list">
                      <option value="렌트수입" />
                      <option value="운영비" />
                      <option value="법인카드 결제계좌" />
                      <option value="급여" />
                      <option value="보험" />
                      <option value="정비" />
                      <option value="타이어" />
                      <option value="충전기 시설유지보수" />
                      <option value="주유" />
                      <option value="통신비" />
                      <option value="임대료" />
                      <option value="사무용품" />
                      <option value="기타" />
                    </datalist>
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>메모
                    <textarea value={editMapping.memo || ''} onChange={e => setEditMapping({ ...editMapping, memo: e.target.value })}
                      rows={2} placeholder="자유 메모"
                      style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4, resize: 'vertical', fontFamily: 'inherit' }} />
                  </label>
                </>
              )}
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>배정 차량
                <select value={editMapping.assigned_car_id || ''} onChange={e => setEditMapping({ ...editMapping, assigned_car_id: e.target.value || null })}
                  style={{ ...GLASS.L1, width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginTop: 4 }}>
                  <option value="">공용 (미배정)</option>
                  {mappingCars.map((car: any) => (
                    <option key={car.id} value={car.id}>{car.number} ({car.brand} {car.model})</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditMapping(null)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#fff', border: '1px solid rgba(0,0,0,0.1)', color: '#475569' }}>취소</button>
              <button onClick={() => saveMapping(editMapping)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: COLORS.primary, color: '#fff', border: 'none' }}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 엑셀 업로드 모달 ═══ */}
      {showUpload && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
        onClick={() => setShowUpload(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...GLASS.L4,
              borderRadius: 16,
              boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
              width: '100%',
              maxWidth: 700,
              maxHeight: '80vh',
              overflow: 'auto',
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                {uploadSource === 'excel_bank' ? '🏦 통장 엑셀 업로드' : '💳 카드 엑셀 업로드'}
              </h2>
              <button onClick={() => setShowUpload(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: COLORS.textMuted }}>✕</button>
            </div>

            {/* 파일 선택 */}
            <div style={{
              ...GLASS.L1,
              borderRadius: 10,
              padding: 16,
              textAlign: 'center',
              marginBottom: 16,
              cursor: 'pointer',
            }}
            onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
              <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
              <div style={{ fontSize: 13, color: COLORS.textSecondary }}>
                {uploadFileName ? uploadFileName : '클릭하여 엑셀 파일 선택 (.xlsx, .xls, .csv) — 복수 선택 가능'}
              </div>
            </div>

            {/* PR-ACCOUNT (V10) — 어느 계좌/카드 파일인지 지정 (계좌·카드별 관리) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
                {uploadSource === 'excel_bank' ? '계좌' : '카드'} 끝 4자리 <span style={{ fontWeight: 500, color: COLORS.textMuted }}>(자동 인식 안 된 파일에만 적용)</span>
              </span>
              <input value={uploadAccountLast4} onChange={(e) => setUploadAccountLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder={uploadSource === 'excel_bank' ? '예: 8777' : '예: 7109'} maxLength={4}
                style={{ width: 90, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 13, fontWeight: 700, color: '#1e293b' }} />
              <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                파일 안에 {uploadSource === 'excel_bank' ? '계좌번호' : '카드번호'}가 있으면 자동으로 읽습니다 — 없을 때만 입력하세요 (그래도 없으면 파일 이름의 숫자 사용)
              </span>
            </div>

            {/* 스킵된 파일 경고 */}
            {skippedFiles.length > 0 && (
              <div style={{
                padding: '8px 12px', borderRadius: 8, marginBottom: 12,
                background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
                fontSize: 12, color: '#92400e',
              }}>
                ⚠️ {uploadSource === 'excel_bank' ? '카드' : '통장'} 파일 {skippedFiles.length}개 자동 제외: {skippedFiles.join(', ')}
              </div>
            )}

            {/* 파일 탭 (복수 파일 시) */}
            {uploadFiles.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {uploadFiles.map((f, i) => (
                  <button
                    key={i}
                    onClick={() => switchFilePreview(i)}
                    style={{
                      padding: '4px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                      border: `1px solid ${i === currentFileIndex ? COLORS.primary : COLORS.borderSubtle}`,
                      background: i === currentFileIndex ? COLORS.primary : '#ffffff',
                      color: i === currentFileIndex ? '#fff' : COLORS.textSecondary,
                      fontWeight: i === currentFileIndex ? 600 : 400,
                    }}
                  >
                    {f.name} ({f.rows.length}행)
                    {(f as any).accountLast4
                      ? <span style={{ marginLeft: 5, fontWeight: 700 }}>· 계좌 {(f as any).accountLast4}</span>
                      : uploadSource === 'excel_bank' && <span style={{ marginLeft: 5, color: i === currentFileIndex ? '#fde68a' : '#b45309' }}>· 계좌 미인식</span>}
                    {f.result && <span style={{ marginLeft: 4 }}>✅</span>}
                  </button>
                ))}
              </div>
            )}

            {/* 컬럼 매핑 표시 */}
            {Object.keys(uploadColumns).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: COLORS.textPrimary }}>컬럼 매핑 결과</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(uploadColumns).map(([header, field]) => (
                    <span key={header} style={{ ...pillStyle('info'), fontSize: 11 }}>
                      {header} → {field}
                    </span>
                  ))}
                </div>
                {/* 미매핑 필수 컬럼 경고 */}
                {(() => {
                  const mappedFields = new Set(Object.values(uploadColumns))
                  const requiredBank = [
                    { field: 'date', label: '날짜' },
                    { field: 'description', label: '적요' },
                    { field: 'counterpart', label: '거래처/기재내용' },
                    { field: 'deposit', label: '입금' },
                    { field: 'withdrawal', label: '출금' },
                  ]
                  const requiredCard = [
                    { field: 'date', label: '날짜' },
                    { field: 'merchant', label: '가맹점' },
                    { field: 'amount', label: '금액' },
                  ]
                  const required = uploadSource === 'excel_bank' ? requiredBank : requiredCard
                  const missing = required.filter(r => !mappedFields.has(r.field))
                  if (missing.length === 0) return null
                  return (
                    <div style={{
                      marginTop: 8, padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                      fontSize: 12, color: '#991b1b',
                    }}>
                      ⚠️ 미매핑 필수 컬럼: {missing.map(m => m.label).join(', ')}
                      <div style={{ fontSize: 11, color: '#7f1d1d', marginTop: 2 }}>
                        이 컬럼들이 엑셀에 있는데 매핑되지 않았다면, 엑셀 헤더명을 확인해주세요.
                        브라우저 콘솔(F12)에서 상세 매핑 정보를 확인할 수 있습니다.
                      </div>
                    </div>
                  )
                })()}
                {/* 미매핑된 헤더 표시 */}
                {uploadPreview.length > 0 && (() => {
                  const unmapped = Object.keys(uploadPreview[0]).filter(h => !uploadColumns[h])
                  if (unmapped.length === 0) return null
                  return (
                    <div style={{ marginTop: 6, fontSize: 11, color: COLORS.textMuted }}>
                      인식 안 된 컬럼: {unmapped.map(h => `"${h}"`).join(', ')}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* 미리보기 */}
            {uploadPreview.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  미리보기 ({uploadPreview.length}행) — 매핑된 컬럼은 <span style={{ color: COLORS.success }}>초록색</span>으로 표시
                </div>
                <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 280, borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`, background: '#fff' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                    <thead>
                      <tr>
                        {Object.keys(uploadPreview[0]).map(h => (
                          <th key={h} style={{
                            padding: '8px 10px', textAlign: 'left', fontWeight: 700,
                            borderBottom: `2px solid ${COLORS.borderSubtle}`,
                            whiteSpace: 'nowrap',
                            background: uploadColumns[h] ? 'rgba(34,197,94,0.12)' : '#f8fafc',
                            position: 'sticky', top: 0, zIndex: 2,
                            verticalAlign: 'top',
                          }}>
                            <div style={{ color: '#1e293b', fontSize: 12, fontWeight: 700 }}>{h}</div>
                            {uploadColumns[h] && (
                              <div style={{ color: COLORS.success, fontSize: 10, marginTop: 2, fontWeight: 600 }}>
                                → {uploadColumns[h]}
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadPreview.slice(0, 10).map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${COLORS.borderFaint}`, background: '#fff' }}>
                          {Object.keys(uploadPreview[0]).map((h, j) => (
                            <td key={j} style={{
                              padding: '6px 10px', whiteSpace: 'nowrap', maxWidth: 200,
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              background: uploadColumns[h] ? 'rgba(34,197,94,0.04)' : '#fff',
                              fontWeight: uploadColumns[h] ? 500 : 400,
                              borderBottom: `1px solid ${COLORS.borderFaint}`,
                              color: '#334155',
                            }}>
                              {String(row[h] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 업로드 결과 */}
            {uploadResult && (
              <div style={{
                padding: 12, borderRadius: 8, marginBottom: 16,
                background: uploadResult.inserted > 0 ? COLORS.bgGreen : COLORS.bgAmber,
                border: `1px solid ${uploadResult.inserted > 0 ? COLORS.borderGreen : COLORS.borderAmber}`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  ✅ 총 {uploadResult.inserted}건 저장 완료 / {uploadResult.skipped}건 스킵
                </div>
                {/* skip 사유 상세 표시 — 사용자가 어떤 행이 왜 빠졌는지 확인 */}
                {uploadResult.skipBreakdown && uploadResult.skipped > 0 && (
                  <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(255,255,255,0.5)', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ color: COLORS.textSecondary, fontWeight: 600, marginBottom: 2 }}>📊 스킵 사유</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, color: COLORS.textSecondary }}>
                      {uploadResult.skipBreakdown.duplicate > 0 && <span>중복(엑셀끼리): {uploadResult.skipBreakdown.duplicate}건</span>}
                      {uploadResult.skipBreakdown.duplicate_existing > 0 && <span style={{ color: '#059669', fontWeight: 600 }}>♻️ 기존 업로드와 중복(자동 skip): {uploadResult.skipBreakdown.duplicate_existing}건</span>}
                      {uploadResult.skipBreakdown.cross_source > 0 && <span style={{ color: '#059669', fontWeight: 600 }}>🔗 연동/문자 이미 있음(자동 skip): {uploadResult.skipBreakdown.cross_source}건</span>}
                      {uploadResult.skipBreakdown.sms_already_exists > 0 && <span style={{ color: '#059669', fontWeight: 600 }}>📲 SMS 이미 있음(자동 skip): {uploadResult.skipBreakdown.sms_already_exists}건</span>}
                      {uploadResult.skipBreakdown.no_date > 0 && <span style={{ color: '#d97706' }}>날짜 없음(총합/메타 행): {uploadResult.skipBreakdown.no_date}건</span>}
                      {uploadResult.skipBreakdown.invalid_date > 0 && <span style={{ color: '#d97706' }}>날짜 형식 오류: {uploadResult.skipBreakdown.invalid_date}건</span>}
                      {uploadResult.skipBreakdown.meta_row > 0 && <span style={{ color: '#d97706' }}>합계/소계 행: {uploadResult.skipBreakdown.meta_row}건</span>}
                      {uploadResult.skipBreakdown.no_amount > 0 && <span>금액 0: {uploadResult.skipBreakdown.no_amount}건</span>}
                    </div>
                  </div>
                )}
                {uploadResult.files?.length > 1 && (
                  <div style={{ marginTop: 6 }}>
                    {uploadResult.files.map((f: any, i: number) => (
                      <div key={i} style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                        📄 {f.name}: {f.inserted}건 저장 / {f.skipped}건 스킵
                      </div>
                    ))}
                  </div>
                )}
                {/* 차량 자동 매칭 결과 (Excel 카드 업로드 시) */}
                {uploadResult.match && (
                  <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(59,130,246,0.08)', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ color: '#1d4ed8', fontWeight: 600, marginBottom: 2 }}>🔗 차량 자동 매칭</div>
                    <div style={{ color: COLORS.textSecondary }}>
                      매칭 성공 {(uploadResult.match.applied || 0).toLocaleString()}건
                      {' / '}
                      미매칭(last4 없음) {(uploadResult.match.skipped_no_match || 0).toLocaleString()}건
                      {' / '}
                      미매칭(차량 미배정) {(uploadResult.match.skipped_no_car || 0).toLocaleString()}건
                      {(uploadResult.match.skipped_ambiguous > 0) && ` / 모호 ${uploadResult.match.skipped_ambiguous}건`}
                    </div>
                    {(uploadResult.match.gongyong_car_unlinked > 0 || uploadResult.match.gongyong_categorized > 0) && (
                      <div style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
                        공용 정리: 매칭 해제 {uploadResult.match.gongyong_car_unlinked || 0}건, 분류 {uploadResult.match.gongyong_categorized || 0}건
                      </div>
                    )}
                  </div>
                )}
                {uploadResult.errors?.length > 0 && (
                  <div style={{ fontSize: 12, color: COLORS.danger, marginTop: 4 }}>
                    오류: {uploadResult.errors.join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* 액션 버튼 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setShowUpload(false)}
                style={{ ...BTN.md, background: '#fff', color: COLORS.textSecondary, border: `1px solid ${COLORS.borderSubtle}`, cursor: 'pointer' }}
              >
                닫기
              </button>
              {(uploadPreview.length > 0 || uploadFiles.length > 0) && !uploadResult && (
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  style={{
                    ...BTN.md,
                    background: uploading ? COLORS.textMuted : COLORS.primary,
                    color: '#fff', border: 'none', cursor: uploading ? 'wait' : 'pointer',
                  }}
                >
                  {uploading ? (uploadProgress || '저장 중...') : (() => {
                    const totalRows = uploadFiles.length > 0 ? uploadFiles.reduce((s, f) => s + f.rows.length, 0) : uploadPreview.length
                    return uploadFiles.length > 1 ? `${uploadFiles.length}개 파일 (${totalRows.toLocaleString()}건) 저장` : `${totalRows.toLocaleString()}건 저장`
                  })()}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ 수동매칭 모달 ═══ */}
      {showMatchModal && matchTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
        onClick={() => setShowMatchModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...GLASS.L4,
              borderRadius: 16,
              boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
              width: '100%',
              maxWidth: 600,
              maxHeight: '70vh',
              overflow: 'auto',
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>🔗 수동 매칭</h2>
              <button onClick={() => setShowMatchModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: COLORS.textMuted }}>✕</button>
            </div>

            {/* 매칭 대상 정보 */}
            <div style={{
              ...GLASS.L3,
              border: `1px solid ${COLORS.borderBlue}`,
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{matchTarget.recipient_name} · {matchTarget.settlement_month}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.primary, marginTop: 4 }}>{nf(Number(matchTarget.due_amount))}원</div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>{matchTarget.bank_name || ''} {matchTarget.account_number || ''}</div>
            </div>

            {/* 후보 거래 목록 */}
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>매칭 후보 ({matchCandidates.length}건)</div>
            {matchCandidates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: COLORS.textMuted, fontSize: 13 }}>
                금액 ±10% 범위의 미매칭 거래가 없습니다
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {matchCandidates.map((c: any) => (
                  <div key={c.id} style={{
                    ...GLASS.L1,
                    borderRadius: 8,
                    padding: '10px 12px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: 'pointer',
                  }}
                  onClick={() => confirmManualMatch(c.id)}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{fmtDate(c.transaction_date)} · {c.description || c.client_name || '-'}</div>
                      <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                        {c.type === 'income' ? '입금' : '출금'} {nf(Number(c.amount))}원 · {c.bank_name || c.card_company || ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ScoreBadge score={c.score || 0} />
                      <span style={{ fontSize: 12, color: COLORS.primary, fontWeight: 600 }}>선택 →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {/* ═══ 거래 분리 모달 ═══ */}
      {splitTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
        onClick={() => setSplitTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...GLASS.L4,
              borderRadius: 16,
              boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
              width: '100%', maxWidth: 560,
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>✂️ 거래 분리</h2>
              <button onClick={() => setSplitTarget(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: COLORS.textMuted }}>✕</button>
            </div>

            <div style={{ padding: 12, borderRadius: 8, background: COLORS.bgBlue, marginBottom: 16, fontSize: 13 }}>
              <strong>원본:</strong> {fmtDate(splitTarget.transaction_date)} · {splitTarget.description} · {splitTarget.client_name || '-'} · <span style={{ color: splitTarget.type === 'income' ? COLORS.income : COLORS.expense }}>{splitTarget.type === 'expense' ? '-' : ''}{nf(splitTarget.amount)}원</span>
            </div>

            {splitItems.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: COLORS.textMuted, width: 20 }}>{i + 1}</span>
                <input
                  placeholder="금액"
                  value={item.amount}
                  onChange={(e) => { const next = [...splitItems]; next[i].amount = e.target.value; setSplitItems(next) }}
                  style={{ ...GLASS.L1, flex: '0 0 100px', borderRadius: 6, padding: '6px 8px', fontSize: 13, border: `1px solid ${COLORS.borderSubtle}` }}
                />
                <input
                  placeholder="적요"
                  value={item.description}
                  onChange={(e) => { const next = [...splitItems]; next[i].description = e.target.value; setSplitItems(next) }}
                  style={{ ...GLASS.L1, flex: 1, borderRadius: 6, padding: '6px 8px', fontSize: 13, border: `1px solid ${COLORS.borderSubtle}` }}
                />
                <input
                  placeholder="거래처"
                  value={item.client_name}
                  onChange={(e) => { const next = [...splitItems]; next[i].client_name = e.target.value; setSplitItems(next) }}
                  style={{ ...GLASS.L1, flex: '0 0 100px', borderRadius: 6, padding: '6px 8px', fontSize: 13, border: `1px solid ${COLORS.borderSubtle}` }}
                />
                {splitItems.length > 2 && (
                  <button
                    onClick={() => setSplitItems(splitItems.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.danger, fontSize: 16 }}
                  >✕</button>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <div>
                <button
                  onClick={() => setSplitItems([...splitItems, { amount: '0', description: '', client_name: '' }])}
                  style={{ ...BTN.md, background: 'rgba(59,130,246,0.1)', color: COLORS.primary, border: 'none', cursor: 'pointer', fontSize: 12 }}
                >
                  + 항목 추가
                </button>
                <span style={{ marginLeft: 12, fontSize: 12, color: (() => {
                  const total = splitItems.reduce((s, it) => s + (Number(it.amount) || 0), 0)
                  return Math.abs(total - splitTarget.amount) <= 1 ? COLORS.success : COLORS.danger
                })() }}>
                  합계: {splitItems.reduce((s, it) => s + (Number(it.amount) || 0), 0).toLocaleString()}원
                  {' '}/ 원본: {nf(splitTarget.amount)}원
                </span>
              </div>
              <button
                onClick={handleSplit}
                disabled={splitting}
                style={{
                  ...BTN.md,
                  background: splitting ? COLORS.textMuted : COLORS.primary,
                  color: '#fff', border: 'none', cursor: splitting ? 'wait' : 'pointer',
                }}
              >
                {splitting ? '분리 중...' : '분리 실행'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 별칭 등록 제안 토스트 ═══ */}
      {aliasPrompt && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1100,
          ...GLASS.L4,
          borderRadius: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          padding: 16, maxWidth: 360,
          border: `1px solid ${COLORS.borderGreen}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            💡 별칭으로 등록할까요?
          </div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 }}>
            &quot;{aliasPrompt.bankName}&quot; → &quot;{aliasPrompt.actualName}&quot;
            <br />등록하면 이후 같은 이름이 자동 변환됩니다.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setAliasPrompt(null)}
              style={{ ...BTN.md, background: '#fff', color: COLORS.textSecondary, border: `1px solid ${COLORS.borderSubtle}`, cursor: 'pointer', fontSize: 12 }}
            >
              아니요
            </button>
            <button
              onClick={saveAlias}
              style={{ ...BTN.md, background: COLORS.success, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}
            >
              등록
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
