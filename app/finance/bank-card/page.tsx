'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import NeuFilterTabs from '@/app/components/NeuFilterTabs'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { fetchWithAuth, getAuthHeader } from '@/app/utils/finance-upload'
import * as XLSX from 'xlsx'

// ═══════════════════════════════════════════════════════════════
// 통장/카드 통합 관리 페이지
// 4탭: 통장 거래 | 카드 거래 | 자동매칭 | 정산 연결
// ═══════════════════════════════════════════════════════════════

type TabKey = 'bank' | 'card' | 'matching' | 'settlement' | 'sms' | 'mapping'

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

interface SmsRow {
  id: string
  raw_text: string
  sender: string | null
  received_at: string
  parse_status: 'pending' | 'parsed' | 'failed'
  parse_error: string | null
  card_issuer: 'KB' | 'WOORI' | 'HYUNDAI' | null
  holder_name: string | null
  transaction_type: 'approved' | 'canceled' | 'deposit' | 'withdrawal'
  transaction_at: string | null
  amount: number | null
  merchant: string | null
  installment: string | null
}

const ISSUER_LABEL: Record<string, string> = { KB: 'KB국민', WOORI: '우리', HYUNDAI: '현대', MYCOMPANY: '법인', WOORI_BANK: '우리은행', KB_BANK: '국민은행' }
const ISSUER_COLOR: Record<string, string> = { KB: '#fbbf24', WOORI: '#3b82f6', HYUNDAI: '#ef4444', MYCOMPANY: '#8b5cf6', WOORI_BANK: '#059669', KB_BANK: '#d97706' }

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

  const [activeTab, setActiveTab] = useState<TabKey>('bank')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // 데이터
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [matchResults, setMatchResults] = useState<MatchResult[]>([])

  // 서브 필터
  const [bankFilter, setBankFilter] = useState('all') // all | income | expense
  const [cardFilter, setCardFilter] = useState('all') // all | kb | woori | hyundai

  // 업로드 모달
  const [showUpload, setShowUpload] = useState(false)
  const [uploadSource, setUploadSource] = useState<'excel_bank' | 'excel_card'>('excel_bank')
  const [uploadPreview, setUploadPreview] = useState<any[]>([])
  const [uploadColumns, setUploadColumns] = useState<Record<string, string>>({})
  const [uploadFileName, setUploadFileName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadResult, setUploadResult] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // 복수 파일 지원
  const [uploadFiles, setUploadFiles] = useState<{ name: string; rows: any[]; columns: Record<string, string>; result?: any }[]>([])
  const [currentFileIndex, setCurrentFileIndex] = useState(0)

  // 인라인 수정
  const [editingTx, setEditingTx] = useState<{ id: string; field: string; value: string } | null>(null)
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
  const [mappingSub, setMappingSub] = useState<'card' | 'bank'>('card')
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
    Promise.all([loadSummary(), loadTransactions(), loadSettlements(), loadCars(), loadMappings()])
      .finally(() => setLoading(false))
  }, [loadSummary, loadTransactions, loadSettlements, loadCars, loadMappings])

  // SMS 탭 전환 시 로드
  useEffect(() => {
    if (activeTab === 'sms') loadSmsData()
    if (activeTab === 'mapping') loadMappings()
  }, [activeTab, loadSmsData, loadMappings])

  // 실패 건 재파싱
  const [reparsing, setReparsing] = useState(false)
  const handleReparse = useCallback(async () => {
    setReparsing(true)
    try {
      const { json } = await fetchWithAuth('/api/finance/sms', { method: 'POST' })
      alert(`재파싱 완료: ${json?.total || 0}건 중 ${json?.fixed || 0}건 성공`)
      loadSmsData()
    } finally {
      setReparsing(false)
    }
  }, [loadSmsData])

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

  const bankTransactions = useMemo(() => {
    let data = transactions.filter(isBankTx)
    if (bankFilter === 'income') data = data.filter(t => t.type === 'income')
    else if (bankFilter === 'expense') data = data.filter(t => t.type === 'expense')
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(t =>
        (t.description || '').toLowerCase().includes(q) ||
        (t.client_name || '').toLowerCase().includes(q) ||
        (t.bank_name || '').toLowerCase().includes(q) ||
        (t.card_company || '').toLowerCase().includes(q)
      )
    }
    return data
  }, [transactions, bankFilter, search])

  const cardTransactions = useMemo(() => {
    let data = transactions.filter(isCardTx)
    if (cardFilter !== 'all') {
      // 카드사 매칭 — 한글/영문 양방향 (KB_BANK 제외)
      // 'kb' → 'KB', 'KB국민', 'KB국민카드' / '우리' → 'WOORI', '우리카드' / '현대' → 'HYUNDAI', '현대카드'
      const aliases: Record<string, string[]> = {
        'kb':   ['kb', '국민', 'kb국민'],
        '우리':  ['woori', '우리', '우리카드'],
        '현대':  ['hyundai', '현대', '현대카드'],
        '법인':  ['mycompany', '법인', '법인카드', 'my company'],
      }
      const keys = aliases[cardFilter.toLowerCase()] || [cardFilter.toLowerCase()]
      data = data.filter(t => {
        const cc = (t.card_company || '').toLowerCase()
        if (/_bank$/.test(cc)) return false
        return keys.some(k => cc === k || cc.startsWith(k) || cc.includes(k))
      })
    }
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(t =>
        (t.description || '').toLowerCase().includes(q) ||
        (t.client_name || '').toLowerCase().includes(q) ||
        (t.card_company || '').toLowerCase().includes(q)
      )
    }
    return data
  }, [transactions, cardFilter, search])

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
          new Promise<{ name: string; rows: any[]; columns: Record<string, string>; skipped?: boolean; year?: string } | null>((resolve) => {
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

                // 메타데이터 행에서 기간(연도) 추출 (report 파일용)
                let extractedYear = ''
                if (detectedTarget && detectedTarget.headerRowIdx > 0) {
                  const rng = XLSX.utils.decode_range(ws['!ref'] || 'A1')
                  for (let r = 0; r < detectedTarget.headerRowIdx && !extractedYear; r++) {
                    for (let c = rng.s.c; c <= rng.e.c; c++) {
                      const cell = ws[XLSX.utils.encode_cell({ r, c })]
                      if (cell) {
                        const v = String(cell.v || '')
                        // "2025.11.01 ~ 2025.11.30" 패턴에서 시작 연도 추출
                        const m = v.match(/(\d{4})\.\d{2}\.\d{2}\s*~\s*(\d{4})\.\d{2}\.\d{2}/)
                        if (m) { extractedYear = m[1]; break }
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

                resolve({ name: file.name, rows, columns: mapping, year: extractedYear || undefined })
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
            bank_name: '우리은행',
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
      const fileSkipBreakdown = { no_date: 0, invalid_date: 0, no_amount: 0, meta_row: 0, duplicate: 0 }
      const batchBase = `${uploadSource}_${Date.now()}_${fi}`

      const totalBatches = Math.ceil(mapped.length / BATCH_SIZE)
      for (let bi = 0; bi < mapped.length; bi += BATCH_SIZE) {
        const batchNum = Math.floor(bi / BATCH_SIZE) + 1
        if (totalBatches > 1) setUploadProgress(`${file.name}: 배치 ${batchNum}/${totalBatches} 전송 중...`)
        const chunk = mapped.slice(bi, bi + BATCH_SIZE)
        const batchId = mapped.length > BATCH_SIZE ? `${batchBase}_b${Math.floor(bi / BATCH_SIZE)}` : batchBase
        const { json } = await fetchWithAuth('/api/finance/transactions/import', {
          method: 'POST',
          body: { rows: chunk, source: uploadSource, batchId },
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

  // ─── 인라인 수정 (거래처명, 금액 등) ─────────────────
  const saveInlineEdit = async () => {
    if (!editingTx) return
    const { id, field, value } = editingTx
    await fetchWithAuth(`/api/finance-upload?table=transactions&id=${id}`, {
      method: 'PATCH',
      body: { [field]: value },
    })
    setEditingTx(null)
    await loadTransactions()
  }

  const handleInlineEdit = (tx: Transaction, field: string, value: string) => {
    setEditingTx({ id: tx.id, field, value })
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
    const { json } = await fetchWithAuth(`/api/finance/transactions/list?category=${encodeURIComponent(category)}&limit=200`)
    if (json?.data) setReviewItems(json.data)
    setReviewLoading(false)
  }

  // 분류 검수에서 카테고리 변경
  const changeItemCategory = async (id: string, newCategory: string) => {
    await fetchWithAuth('/api/finance/transactions/group-classify', {
      method: 'PATCH',
      body: { transactionIds: [id], category: newCategory },
    })
    setReviewItems(prev => prev.filter(i => i.id !== id))
    loadSummary() // 통계 갱신
  }

  // 분류 검수에서 차량 매칭 변경 (사용자 수정)
  const changeItemCar = async (id: string, carId: string) => {
    if (!carId) {
      // 매칭 해제
      await fetchWithAuth(`/api/finance-upload?table=transactions&id=${id}`, {
        method: 'PATCH',
        body: { related_type: null, related_id: null },
      })
    } else {
      await fetchWithAuth(`/api/finance-upload?table=transactions&id=${id}`, {
        method: 'PATCH',
        body: { related_type: 'car', related_id: carId },
      })
    }
    // 인메모리 갱신 — 즉시 UI 반영
    const car = cars.find(c => c.id === carId)
    setReviewItems(prev => prev.map(i => i.id === id ? {
      ...i,
      related_type: carId ? 'car' : null,
      related_id: carId || null,
      matched_car_id: carId || null,
      matched_car_number: car?.number || null,
      matched_car_model: car ? `${car.brand} ${car.model}`.trim() : null,
    } : i))
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
  const runFullAutoMatch = async () => {
    if (!confirm(
      '통장 거래 전체 풀 자동 매칭 + AI 분류 실행:\n\n' +
      '1) 마스터 매칭: 차량 → 보험 → 대출 → 정비 → 지입 → 투자 → 급여\n' +
      '2) AI 일괄 분류: Gemini 로 미분류 거래 자동 카테고리 부여\n\n' +
      '· 약 1~3분 소요\n· 토큰 비용 발생 (AI 분류 단계)\n· 중간 정지 불가\n\n' +
      '계속할까요?'
    )) return
    setAutoClassifying(true)
    const results: string[] = []
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
      ]
      for (const c of calls) {
        try {
          const { ok, status, json } = await fetchWithAuth(c.url, { method: 'POST', body: c.body || {} })
          if (!ok) { results.push(`❌ ${c.name}: HTTP ${status}`); continue }
          const applied = json.applied ?? json.applied_high_confidence ?? 0
          const total = json.total_candidates ?? json.total_unmatched ?? 0
          // 진단: skip 사유 노출 — 0건일 때 무엇이 문제인지 즉시 파악
          const skips: string[] = []
          if (json.skipped_no_match > 0) skips.push(`매핑X ${json.skipped_no_match}`)
          if (json.skipped_no_car > 0) skips.push(`차량X ${json.skipped_no_car}`)
          if (json.skipped_ambiguous > 0) skips.push(`모호 ${json.skipped_ambiguous}`)
          if (json.skipped_already > 0) skips.push(`이미매칭 ${json.skipped_already}`)
          const skipStr = skips.length > 0 ? ` [${skips.join(', ')}]` : ''
          results.push(`${applied > 0 ? '✓' : '·'} ${c.name}: ${applied}/${total}건${skipStr}`)
        } catch (e: any) {
          results.push(`❌ ${c.name}: ${e?.message?.slice(0, 60)}`)
        }
      }

      // ── Phase 2: AI 일괄 분류 (Gemini) ──
      let aiProcessed = 0, aiApplied = 0, aiBelow = 0, aiInitial = 0
      let aiError: string | undefined
      const MAX_BATCHES = 50
      let batches = 0
      try {
        while (batches < MAX_BATCHES) {
          batches++
          const { ok, status, json } = await fetchWithAuth('/api/finance/transactions/auto-classify-ai', {
            method: 'POST',
            body: { batchSize: 30, minConfidence: 70 },
          })
          if (!ok) {
            aiError = `HTTP ${status} — ${json?.error || '응답 없음'}`
            break
          }
          const total = Number(json.total_unclassified || 0)
          if (aiInitial === 0) aiInitial = total
          if (total === 0) break

          const procThis = Number(json.processed_this_batch || 0)
          const appliedThis = Number(json.applied_high_confidence || 0)
          const belowThis = Number(json.below_threshold || 0)
          aiProcessed += procThis
          aiApplied += appliedThis
          aiBelow += belowThis

          // 안전망: DB write 0건이면 즉시 중단 (토큰 무한 소모 방지)
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
      results.push('') // 구분선
      if (aiError) {
        results.push(`❌ AI 분류: ${aiError}`)
      } else if (aiInitial === 0) {
        results.push(`· AI 분류: 미분류 거래 0건 (분류 대상 없음)`)
      } else {
        results.push(`${aiApplied > 0 ? '✓' : '·'} AI 분류: ${aiApplied}/${aiInitial}건 자동 적용 (검토 큐 ${aiBelow}, batch ${batches}회)`)
      }

      alert(
        `✓ 풀 자동 매칭 + AI 분류 완료\n\n${results.join('\n')}\n\n` +
        `💡 매칭 0건 사유:\n` +
        `  · 매핑X = corporate_cards 에 카드 등록 X\n` +
        `  · 차량X = 카드는 있지만 assigned_car_id 미설정\n` +
        `  · 모호 = 같은 last4 카드 2개 이상\n\n` +
        `💡 AI 분류 결과 해석:\n` +
        `  · "0/N" = AI 가 신뢰도 70% 이상 분류 X — 검토 큐로\n` +
        `  · "❌ Gemini 응답 0건" = API 키 문제 또는 응답 파싱 실패\n` +
        `  · "0건 (분류 대상 없음)" = 이미 다 분류됨\n\n` +
        `→ 미분류 ${0}건 남음 — 분류 검수 탭에서 수동 처리`
      )
      await Promise.all([loadSummary(), loadTransactions()])
      if (reviewCategory) await loadReviewItems(reviewCategory)
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
    setRuleClassifyLoading(true)
    setRuleClassifyResult(null)
    setExpandedGroup(null)
    try {
      const { json } = await fetchWithAuth('/api/finance/auto-classify/dry-run', {
        method: 'POST',
        body: { source: 'all', limit: 5000 },
      })
      if (json?.error) {
        alert(`자동 분류 오류: ${json.error}`)
        return
      }
      setRuleClassifyResult(json)
    } catch (e: any) {
      alert(`자동 분류 오류: ${e.message}`)
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
    if (!confirm(`${confidence.toUpperCase()} 그룹 ${items.length}건 일괄 확정하시겠습니까?\n(분류 적용 — 되돌리려면 분류 검수에서 직접 수정)`)) return

    setRuleClassifyLoading(true)
    try {
      const payload = items.map((it: any) => ({
        id: it.id,
        category: it.subcategory || it.category,
        related_type: it.related_type || null,
        related_id: it.related_id || null,
      }))
      const { json } = await fetchWithAuth('/api/finance/auto-classify/apply', {
        method: 'POST',
        body: { items: payload },
      })
      alert(`✅ 적용: ${json?.applied || 0}건 / 실패: ${json?.failed || 0}건`)
      // 재실행 — 적용된 거래 빠지고 남은 것만 다시 표시
      await runRuleClassify()
      // 통계 새로고침
      await Promise.all([loadSummary(), loadTransactions()])
    } catch (e: any) {
      alert(`적용 오류: ${e.message}`)
    } finally {
      setRuleClassifyLoading(false)
    }
  }

  const applyOneClassify = async (it: any) => {
    setRuleClassifyLoading(true)
    try {
      const { json } = await fetchWithAuth('/api/finance/auto-classify/apply', {
        method: 'POST',
        body: { items: [{
          id: it.id,
          category: it.subcategory || it.category,
          related_type: it.related_type || null,
          related_id: it.related_id || null,
        }]},
      })
      if ((json?.applied || 0) > 0) {
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

  // 룰 탭 활성 시 자동 로드
  useEffect(() => {
    if (activeTab === 'rules' && rules.length === 0) loadRules()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

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
  const deleteAndReupload = async (source: 'excel_bank' | 'excel_card') => {
    const label = source === 'excel_bank' ? '통장' : '카드'
    if (!confirm(`기존 ${label} 거래 데이터를 모두 삭제합니다.\n삭제 후 엑셀 파일을 다시 업로드하면 개선된 컬럼 매핑으로 거래처/적요가 정상 입력됩니다.\n\n진행하시겠습니까?`)) return
    const { json } = await fetchWithAuth(`/api/finance/transactions/import?source=${source}`, { method: 'DELETE' })
    if (json?.ok) {
      alert(`${label} 거래 ${json.deleted}건 삭제 완료.\n이제 엑셀 파일을 다시 업로드하세요.`)
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

  const tabs = [
    { key: 'bank', label: '통장 거래', count: summary?.transactions.bank },
    { key: 'card', label: '카드 거래', count: summary?.transactions.card },
    { key: 'classify', label: '분류 검수', count: summary?.transactions.classified },
    { key: 'matching', label: '미분류', count: summary?.transactions.unclassified },
    { key: 'settlement', label: '정산 연결', count: summary?.settlement.total },
    { key: 'sms', label: 'SMS 수집', count: summary?.sms?.total || 0 },
    { key: 'mapping', label: '매핑 관리' },
    { key: 'rules', label: '분류 룰' },
  ]

  // ── 통계 카드 ─────────────────────────────────────────

  const stats: StatItem[] = summary ? [
    { label: '전체 거래', value: nf(summary.transactions.total), tint: 'blue', icon: '📊' },
    { label: '통장', value: nf(summary.transactions.bank), tint: 'green', icon: '🏦' },
    { label: '카드', value: nf(summary.transactions.card), tint: 'purple', icon: '💳' },
    { label: '분류완료', value: nf(summary.transactions.classified), tint: 'green', icon: '✓',
      subValue: summary.transactions.total > 0 ? `${Math.round(summary.transactions.classified / summary.transactions.total * 100)}%` : '0%', subTone: 'up' as const },
    { label: '미분류', value: nf(summary.transactions.unclassified), tint: summary.transactions.unclassified > 0 ? 'amber' : 'green', icon: summary.transactions.unclassified > 0 ? '⚠' : '✓' },
  ] : []

  // ── 통장 거래 탭 ──────────────────────────────────────

  const bankColumns: TableColumn<Transaction>[] = [
    { key: 'date', label: '날짜', width: 100, render: (r) => <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{fmtDate(r.transaction_date)}</span> },
    { key: 'account', label: '계좌', width: 170, render: (r: any) => {
      // 통장 컬럼: 계좌번호 + 매핑 상태
      //   "통장미등록"  = bank_account_mappings 에 미등록 → 매핑 관리에서 등록 필요
      //   "사업 통장"   = 등록됐고 차량 미할당 (정상 운영 — 사업 단위 공용 계좌)
      //   "🚗 차량번호" = 등록 + 차량 할당 (드뭄 — 차량 전용 통장)
      const alias = r.bank_account_alias || r.sms_card_alias || ''
      const aliasLast4 = alias.match(/(\d{4})\s*$/)?.[1]
      const last4 = aliasLast4
      const bankName = r.bank_name || (r.card_company || '').replace('_BANK', '')
      const hasBankMapping = !!(r.bank_account_alias || r.bank_account_holder)
      const hasCarAssigned = !!r.bank_matched_car_number
      const purpose = r.bank_purpose || ''
      return (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.primary }}>
            {bankName || '-'}{last4 ? ` ${last4}` : ''}
          </div>
          {alias && hasBankMapping && <div style={{ fontSize: 10, color: '#94a3b8' }}>{alias}</div>}
          {!hasBankMapping && last4 && (
            <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }} title="bank_account_mappings 에 등록 필요">
              📝 통장 미등록
            </div>
          )}
          {hasBankMapping && !hasCarAssigned && (
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }} title="사업 단위 공용 계좌 — 정상 운영. 차량 매칭은 거래별 검수에서 처리.">
              💼 사업 통장{purpose ? ` · ${purpose.split('/')[0]}` : ''}
            </div>
          )}
        </div>
      )
    }, hideOnMobile: true },
    { key: 'desc', label: '적요', render: (r) => <span style={{ fontSize: 13, fontWeight: 500 }}>{r.description || '-'}</span> },
    { key: 'counterpart', label: '거래처', width: 140, render: (r) =>
      editingTx?.id === r.id && editingTx.field === 'client_name' ? (
        <input
          autoFocus
          defaultValue={editingTx.value}
          onChange={(e) => setEditingTx({ ...editingTx, value: e.target.value })}
          onBlur={() => {
            if (editingTx.value !== (r.client_name || '')) {
              saveInlineEdit()
              // 별칭 등록 제안
              if (r.client_name && editingTx.value && r.client_name !== editingTx.value) {
                setAliasPrompt({ bankName: r.client_name, actualName: editingTx.value })
              }
            } else {
              setEditingTx(null)
            }
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingTx(null) }}
          style={{ ...GLASS.L1, width: '100%', border: `1px solid ${COLORS.primary}`, borderRadius: 6, padding: '2px 6px', fontSize: 13, outline: 'none' }}
        />
      ) : (
        <span
          onClick={() => handleInlineEdit(r, 'client_name', r.client_name || '')}
          style={{ fontSize: 13, cursor: 'pointer', borderBottom: `1px dashed ${COLORS.borderSubtle}`, paddingBottom: 1 }}
          title="클릭하여 수정"
        >{r.client_name || '-'}</span>
      ),
      hideOnMobile: true
    },
    { key: 'deposit', label: '입금', width: 110, align: 'right', render: (r) =>
      r.type === 'income' ? <span style={{ color: COLORS.income, fontWeight: 600, fontSize: 13 }}>+{nf(r.amount)}</span> : <span style={{ color: COLORS.textMuted }}>-</span>
    },
    { key: 'withdrawal', label: '출금', width: 110, align: 'right', render: (r) =>
      r.type === 'expense' ? <span style={{ color: COLORS.expense, fontWeight: 600, fontSize: 13 }}>-{nf(r.amount)}</span> : <span style={{ color: COLORS.textMuted }}>-</span>
    },
    { key: 'balance', label: '잔액', width: 110, align: 'right', render: (r) =>
      <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{r.balance_after != null ? nf(r.balance_after) : '-'}</span>,
      hideOnMobile: true
    },
    { key: 'matched', label: '매칭', width: 130, render: (r: any) => {
      // 차량 매칭 우선, 없으면 통장 매핑의 예금주/용도, 없으면 미매칭
      if (r.bank_matched_car_number) {
        return (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1e40af' }}>🚗 {r.bank_matched_car_number}</div>
            {r.bank_matched_car_model && <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.bank_matched_car_model}</div>}
          </div>
        )
      }
      if (r.bank_account_holder) {
        return (
          <div>
            <span style={{ fontSize: 12, color: '#7c3aed' }}>👤 {r.bank_account_holder}</span>
            {r.bank_purpose && <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.bank_purpose}</div>}
          </div>
        )
      }
      return <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>
    }, hideOnMobile: true },
    { key: 'status', label: '상태', width: 92, align: 'center', render: (r) =>
      <MatchBadge matched={!!r.related_type && !!r.related_id} />
    },
    { key: 'actions', label: '', width: 40, align: 'center', render: (r) => (
      <button
        onClick={(e) => { e.stopPropagation(); openSplitModal(r) }}
        title="거래 분리"
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 2, color: COLORS.textMuted }}
      >✂️</button>
    ), hideOnMobile: true },
  ]

  const bankMobile: MobileCardConfig<Transaction> = {
    title: (r) => <span style={{ fontWeight: 600, fontSize: 14 }}>{fmtDate(r.transaction_date)} {r.description || '거래'}</span>,
    subtitle: (r) => <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{r.client_name || r.bank_name || ''}</span>,
    trailing: (r) => (
      <span style={{ fontWeight: 700, fontSize: 14, color: r.type === 'income' ? COLORS.income : COLORS.expense }}>
        {r.type === 'income' ? '+' : '-'}{nf(r.amount)}
      </span>
    ),
    badges: (r) => <MatchBadge matched={!!r.related_type} />,
  }

  // ── 카드 거래 탭 ──────────────────────────────────────

  const cardColumns: TableColumn<Transaction>[] = [
    { key: 'date', label: '날짜', width: 100, render: (r) => <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{fmtDate(r.transaction_date)}</span> },
    { key: 'card', label: '카드', width: 170, render: (r: any) => {
      // 카드 라벨 분기 (사용자 운영 모델 반영):
      //   📝 미등록      = corporate_cards 에 미등록
      //   🚗 차량 카드   = assigned_car_id 있음 (그 차량 전용 — 거래 자동 차량 매칭)
      //   👤 직원 카드   = assigned_employee_id 있고 assigned_car_id 없음
      //                    → 거래별 분류 검수 필요 (차량지원/운영비/개인)
      //   🃏 공용 카드   = 둘 다 없음 (드뭄)
      const alias = r.sms_card_alias || r.matched_card_alias || ''
      const aliasLast4 = alias.match(/(\d{4})\s*$/)?.[1]
      const rawLast4 = r.card_last4 || ''
      const last4 = aliasLast4 || rawLast4
      const hasCardMapping = !!(r.matched_card_alias || r.matched_holder_name || r.matched_car_id || r.matched_employee_id)
      const hasCarCard = !!r.matched_car_id
      const hasEmployeeCard = !!r.matched_employee_id && !hasCarCard
      const holder = r.matched_holder_name || ''
      // 거래 분류 상태 (직원 카드일 때 의미)
      const txCategorized = !!r.related_type || !!r.category
      const txCar = r.related_type === 'car' && !!r.related_id
      const txSalary = !!r.salary_adjustment_id
      return (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.primary }}>
            {r.card_company || '-'}{last4 ? ` ${last4}` : ''}
          </div>
          {alias && hasCardMapping && <div style={{ fontSize: 10, color: '#94a3b8' }}>{alias}</div>}
          {!hasCardMapping && last4 && (
            <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }} title="corporate_cards 에 등록 필요">
              📝 카드 미등록
            </div>
          )}
          {hasCardMapping && hasCarCard && (
            <div style={{ fontSize: 10, color: '#1e40af', fontWeight: 600 }} title="차량 전용 카드 — 자동 차량 매칭">
              🚗 차량 카드 {r.matched_car_number ? `· ${r.matched_car_number}` : ''}
            </div>
          )}
          {hasCardMapping && hasEmployeeCard && !txCategorized && (
            <div style={{ fontSize: 10, color: '#d97706', fontWeight: 600 }} title="직원 카드 — 거래별 분류 검수 필요 (차량지원/운영비/개인)">
              👤 {holder || '직원'} · 분류 필요
            </div>
          )}
          {hasCardMapping && hasEmployeeCard && txCategorized && txCar && (
            <div style={{ fontSize: 10, color: '#15803d', fontWeight: 500 }} title="직원 카드 → 차량 비용 분류 완료">
              👤 {holder || '직원'} → 🚗 분류완료
            </div>
          )}
          {hasCardMapping && hasEmployeeCard && txCategorized && !txCar && txSalary && (
            <div style={{ fontSize: 10, color: '#ca8a04', fontWeight: 600 }} title="직원 개인 사용 — 급여 차감 대기">
              👤 {holder || '직원'} · 개인 (급여)
            </div>
          )}
          {hasCardMapping && hasEmployeeCard && txCategorized && !txCar && !txSalary && (
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }} title="직원 카드 → 운영비 분류">
              👤 {holder || '직원'} · 운영비
            </div>
          )}
          {hasCardMapping && !hasCarCard && !hasEmployeeCard && (
            <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 500 }} title="공용 카드 — 거래별 분류 필요">
              🃏 공용 카드
            </div>
          )}
        </div>
      )
    }},
    { key: 'merchant', label: '가맹점', render: (r: any) => {
      // SMS 가맹점 우선, 없으면 description (구 데이터 호환)
      const merchant = r.sms_merchant || r.description || '-'
      const stType = r.sms_transaction_type
      const isCanceled = stType === 'canceled'
      const isDeclined = r.sms_parse_status === 'ignored'
      return (
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {isCanceled && <span style={{ color: '#b91c1c', marginRight: 4, fontWeight: 700 }}>[취소]</span>}
          {isDeclined && <span style={{ color: '#94a3b8', marginRight: 4, fontWeight: 600 }}>[미승인]</span>}
          {merchant}
        </span>
      )
    }},
    { key: 'amount', label: '금액', width: 110, align: 'right', render: (r: any) => {
      // SMS transaction_type 따라 색/부호 결정 (단순 모델)
      //   approved/withdrawal → 빨강 -금액 (출금)
      //   canceled            → 빨강 -금액 (취소 — 사용자 표시 모델)
      //   deposit             → 녹색 +금액 (입금)
      //   declined            → 회색 (미승인 — 합산 제외 의미)
      //   기본 (SMS 없음)      → 빨강 (전통 expense)
      const stType = r.sms_transaction_type
      const isDeclined = r.sms_parse_status === 'ignored'
      const color =
        isDeclined ? '#94a3b8' :
        stType === 'deposit' ? COLORS.income :
        stType === 'canceled' || stType === 'withdrawal' || stType === 'approved' ? COLORS.expense :
        r.type === 'income' ? COLORS.income : COLORS.expense
      const sign =
        stType === 'deposit' ? '+' :
        stType === 'canceled' || stType === 'withdrawal' ? '-' :
        ''
      return (
        <span style={{ fontWeight: 600, fontSize: 13, color }}>
          {sign}{nf(r.amount)}원
        </span>
      )
    }},
    { key: 'matched', label: '매칭', width: 140, render: (r: any) => {
      // 차량 매칭 우선, 없으면 직원
      if (r.matched_car_number) {
        return (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1e40af' }}>🚗 {r.matched_car_number}</div>
            {r.matched_car_model && <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.matched_car_model}</div>}
          </div>
        )
      }
      if (r.matched_holder_name && r.matched_holder_name !== '공용 (탁송팀)') {
        return <span style={{ fontSize: 12, color: '#7c3aed' }}>👤 {r.matched_holder_name}</span>
      }
      if (r.client_name) {
        return <span style={{ fontSize: 12, color: '#475569' }}>{r.client_name}</span>
      }
      return <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>
    }, hideOnMobile: true },
    { key: 'source', label: '출처', width: 70, align: 'center', render: (r) =>
      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: r.imported_from === 'sms' ? COLORS.bgGreen : COLORS.bgBlue, color: r.imported_from === 'sms' ? COLORS.success : COLORS.info }}>
        {r.imported_from === 'sms' ? 'SMS' : '엑셀'}
      </span>,
      hideOnMobile: true
    },
    { key: 'status', label: '상태', width: 92, align: 'center', render: (r) =>
      <MatchBadge matched={!!r.related_type && !!r.related_id} />
    },
  ]

  const cardMobile: MobileCardConfig<Transaction> = {
    title: (r) => <span style={{ fontWeight: 600, fontSize: 14 }}>{fmtDate(r.transaction_date)} {r.description || '거래'}</span>,
    subtitle: (r) => <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{r.card_company} · {r.client_name || ''}</span>,
    trailing: (r) => <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.expense }}>{nf(r.amount)}원</span>,
    badges: (r) => <MatchBadge matched={!!r.related_type} />,
  }

  // ── 자동매칭 탭 컬럼 ─────────────────────────────────

  const matchColumns: TableColumn<MatchResult>[] = [
    { key: 'date', label: '거래일', width: 90, render: (r) => <span style={{ fontSize: 13 }}>{fmtDate(r.txDate)}</span> },
    { key: 'txName', label: '거래', render: (r) => (
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{r.txName || '-'}</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted }}>{nf(r.txAmount)}원</div>
      </div>
    )},
    { key: 'match', label: '매칭 대상', render: (r) => {
      const typeLabels: Record<string, string> = { settlement: '정산', contract: '계약', car: '차량', employee: '직원', operation: '운영비' }
      return (
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {r.match.name || '-'}
            {r.matchMethod === 'ai' && <span style={{ marginLeft: 4, fontSize: 10, padding: '1px 4px', borderRadius: 3, background: COLORS.bgViolet, color: '#7c3aed', fontWeight: 600 }}>AI</span>}
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            {typeLabels[r.match.type] || r.match.type} {r.match.amount ? `· ${nf(r.match.amount)}원` : ''}
            {r.match.month ? ` · ${r.match.month}` : ''}
          </div>
          {r.aiReason && <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>{r.aiReason}</div>}
        </div>
      )
    }},
    { key: 'score', label: '신뢰도', width: 80, align: 'center', render: (r) => <ScoreBadge score={r.score} /> },
    { key: 'select', label: '', width: 50, align: 'center', render: (r) => (
      <input
        type="checkbox"
        checked={selectedMatches.has(r.transactionId)}
        onChange={(e) => {
          const next = new Set(selectedMatches)
          e.target.checked ? next.add(r.transactionId) : next.delete(r.transactionId)
          setSelectedMatches(next)
        }}
        style={{ width: 16, height: 16, cursor: 'pointer' }}
      />
    )},
  ]

  const matchMobile: MobileCardConfig<MatchResult> = {
    title: (r) => <span style={{ fontWeight: 600, fontSize: 14 }}>{r.txName} → {r.match.name}</span>,
    subtitle: (r) => <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{fmtDate(r.txDate)} · {nf(r.txAmount)}원 → {nf(r.match.amount)}원</span>,
    trailing: (r) => <ScoreBadge score={r.score} />,
    badges: (r) => (
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={selectedMatches.has(r.transactionId)}
          onChange={(e) => {
            const next = new Set(selectedMatches)
            e.target.checked ? next.add(r.transactionId) : next.delete(r.transactionId)
            setSelectedMatches(next)
          }}
        />
        매칭 확인
      </label>
    ),
  }

  // ── 정산 연결 탭 컬럼 ─────────────────────────────────

  const settlementColumns: TableColumn<Settlement>[] = [
    { key: 'month', label: '정산월', width: 90, render: (r) => <span style={{ fontSize: 13, fontWeight: 600 }}>{r.settlement_month}</span> },
    { key: 'name', label: '수령인', width: 120, render: (r) => <span style={{ fontSize: 13 }}>{r.recipient_name || '-'}</span> },
    { key: 'amount', label: '금액', width: 120, align: 'right', render: (r) =>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{nf(Number(r.due_amount))}원</span>
    },
    { key: 'bank', label: '계좌', render: (r) =>
      <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{r.bank_name || ''} {r.account_number ? `*${String(r.account_number).slice(-4)}` : ''}</span>,
      hideOnMobile: true
    },
    { key: 'type', label: '유형', width: 70, align: 'center', render: (r) =>
      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: COLORS.bgBlue, color: COLORS.info }}>{r.contract_type || '-'}</span>,
      hideOnMobile: true
    },
    { key: 'status', label: '상태', width: 92, align: 'center', render: (r) => {
      const isLinked = r.status === 'matched' || r.status === 'confirmed' || r.status === 'paid'
      return (
        <span style={{
          ...pillStyle(isLinked ? 'success' : 'danger'),
          fontSize: 11,
        }}>
          {isLinked ? '연결됨' : '미연결'}
        </span>
      )
    }},
    { key: 'action', label: '', width: 80, align: 'center', render: (r) =>
      r.status === 'pending' ? (
        <button
          onClick={(e) => { e.stopPropagation(); openMatchCandidates(r.id) }}
          style={{
            ...BTN.sm,
            background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          매칭
        </button>
      ) : (
        <span style={{ fontSize: 11, color: COLORS.success }}>✓</span>
      )
    },
  ]

  const settlementMobile: MobileCardConfig<Settlement> = {
    title: (r) => <span style={{ fontWeight: 600, fontSize: 14 }}>{r.settlement_month} · {r.recipient_name}</span>,
    subtitle: (r) => <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{r.bank_name || ''} · {r.contract_type}</span>,
    trailing: (r) => <span style={{ fontWeight: 700, fontSize: 14 }}>{nf(Number(r.due_amount))}원</span>,
    badges: (r) => {
      const isLinked = r.status === 'matched' || r.status === 'confirmed' || r.status === 'paid'
      return isLinked
        ? <span style={{ ...pillStyle('success'), fontSize: 11 }}>연결됨</span>
        : <button onClick={() => openMatchCandidates(r.id)} style={{ ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer' }}>매칭 검색</button>
    },
  }

  // ═══ 렌더링 ═════════════════════════════════════════════

  return (
    <div style={{ padding: '0 0 40px', maxWidth: 1200, margin: '0 auto' }}>

      {/* 페이지 제목 */}
      <div style={{ padding: '24px 16px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>💰</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>통장/카드 관리</h1>
      </div>

      {/* 상단 통계 */}
      {summary && <div style={{ padding: '0 16px 12px' }}><DcStatStrip stats={stats} /></div>}

      {/* 탭 */}
      <div style={{ padding: '0 16px 8px' }}>
        <NeuFilterTabs
          tabs={tabs}
          activeKey={activeTab}
          onSelect={(k) => { setActiveTab(k as TabKey); setSearch('') }}
        />
      </div>

      {/* 탭별 콘텐츠 */}
      <div style={{ padding: '0 16px' }}>

        {/* ──── 통장 거래 탭 ──── */}
        {activeTab === 'bank' && (
          <>
            <DcToolbar
              search={search}
              onSearchChange={setSearch}
              placeholder="적요, 거래처 검색..."
              filters={[
                { key: 'all', label: '전체', count: transactions.filter(isBankTx).length },
                { key: 'income', label: '입금', count: transactions.filter(t => isBankTx(t) && t.type === 'income').length },
                { key: 'expense', label: '출금', count: transactions.filter(t => isBankTx(t) && t.type === 'expense').length },
              ]}
              activeFilter={bankFilter}
              onFilterChange={setBankFilter}
              trailing={
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => { setUploadSource('excel_bank'); setShowUpload(true); setUploadPreview([]); setUploadResult(null); setUploadFiles([]); setUploadFileName(''); setUploadColumns({}); setSkippedFiles([]) }}
                    style={{ ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    📤 엑셀 업로드
                  </button>
                  <button
                    onClick={async () => {
                      const { json } = await fetchWithAuth('/api/admin/bank-match-diag')
                      if (json?.error) { alert(`오류: ${json.error}`); return }
                      const s = json?.summary || {}
                      const fmtList = (arr: any[], format: (x: any) => string) =>
                        (arr || []).slice(0, 10).map(format).join('\n') || '  (없음)'
                      const noMapping = fmtList(json?.top_no_mapping, (x: any) =>
                        `  · ****${x.last4} — ${x.tx}건`)
                      const noCar = fmtList(json?.top_no_car, (x: any) =>
                        `  · ****${x.last4} — ${x.tx}건${x.holders?.length ? ` [${x.holders.join(',')}]` : ''}${x.purposes?.length ? ` (${x.purposes.join(',')})` : ''}`)
                      console.log('[통장 매칭 진단] 등록 매핑 전체:', json?.all_mappings || [])
                      alert(
                        `🏦 통장 매칭 진단\n\n` +
                        `📊 요약\n` +
                        `  · 통장 거래(SMS): ${s.total_transactions || 0}건\n` +
                        `  · 거래의 차량 직접 매칭: ${s.matched_transactions || 0}건 (드뭄 — 통장은 보통 사업 단위)\n` +
                        `  · 등록 매핑: ${s.total_mappings || 0}개 (차량 전용 통장: ${s.mappings_with_car || 0})\n` +
                        `  · last4 종류: ${s.unique_last4 || 0}개\n\n` +
                        `🔴 매핑 부재 — 통장 등록 필요\n${noMapping}\n\n` +
                        `💼 사업 통장 (정상 운영 — 차량 매칭은 거래별 검수에서 처리)\n${noCar}\n\n` +
                        `🟢 차량 전용 통장 매칭: ${json?.ok_count || 0} 종류\n\n` +
                        `→ 등록 매핑 전체는 콘솔(F12) 확인`
                      )
                    }}
                    style={{ ...BTN.sm, background: '#fff', color: '#0369a1', border: '1px solid rgba(14,165,233,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    🔍 매칭 진단
                  </button>
                  {summary && summary.transactions.bank > 0 && (
                    <button
                      onClick={() => deleteAndReupload('excel_bank')}
                      style={{ ...BTN.sm, background: '#fff', color: COLORS.danger, border: `1px solid rgba(239,68,68,0.3)`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      🗑 통장 전체삭제
                    </button>
                  )}
                </div>
              }
            />
            <NeuDataTable
              columns={bankColumns}
              data={bankTransactions}
              rowKey={(r) => r.id}
              mobileCard={bankMobile}
              loading={loading}
              emptyIcon="🏦"
              emptyMessage="통장 거래 데이터가 없습니다"
            />
          </>
        )}

        {/* ──── 카드 거래 탭 ──── */}
        {activeTab === 'card' && (
          <>
            <DcToolbar
              search={search}
              onSearchChange={setSearch}
              placeholder="가맹점, 카드사 검색..."
              filters={[
                { key: 'all', label: '전체' },
                { key: 'kb', label: 'KB' },
                { key: '우리', label: '우리' },
                { key: '현대', label: '현대' },
              ]}
              activeFilter={cardFilter}
              onFilterChange={setCardFilter}
              trailing={
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => { setUploadSource('excel_card'); setShowUpload(true); setUploadPreview([]); setUploadResult(null); setUploadFiles([]); setUploadFileName(''); setUploadColumns({}); setSkippedFiles([]) }}
                    style={{ ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    📤 엑셀 업로드
                  </button>
                  <button
                    onClick={async () => {
                      const { json } = await fetchWithAuth('/api/admin/card-match-diag')
                      if (json?.error) { alert(`오류: ${json.error}`); return }
                      const s = json?.summary || {}
                      const p = json?.problems || {}
                      const fmtList = (arr: any[], format: (x: any) => string) =>
                        (arr || []).slice(0, 10).map(format).join('\n') || '  (없음)'
                      const noCard = fmtList(json?.top_no_card, (x: any) =>
                        `  · ****${x.last4} — ${x.tx}건${x.sms > 0 ? ` (SMS ${x.sms})` : ''}`)
                      const noAssign = fmtList(json?.top_no_assignment, (x: any) =>
                        `  · ****${x.last4} — ${x.tx}건${x.holders?.length ? ` [${x.holders.join(',')}]` : ''}`)
                      const okEmp = fmtList(json?.ok_employee_card, (x: any) =>
                        `  · ****${x.last4} — ${x.tx}건${x.employees?.length ? ` [${x.employees.join(',')}]` : ''}`)
                      const okPool = fmtList(json?.ok_pool_card, (x: any) =>
                        `  · ****${x.last4} — ${x.tx}건${x.holders?.length ? ` [${x.holders.join(',')}/${x.departments?.[0] || '공용'}]` : ''}`)
                      const okCanceled = fmtList(json?.ok_canceled, (x: any) =>
                        `  · ****${x.last4} — ${x.tx}건${x.holders?.length ? ` [${x.holders.join(',')}]` : ''}`)
                      // 콘솔에 등록된 카드 전체 last4 출력 — 사용자가 직접 확인 가능
                      const allCards = json?.all_registered_cards || []
                      console.log('[카드 매칭 진단] 등록된 카드 전체:', allCards)
                      alert(
                        `🔍 카드 매칭 진단\n\n` +
                        `📊 요약\n` +
                        `  · 카드 거래: ${s.total_transactions || 0}건 (매칭 ${s.matched_transactions || 0} / 미매칭 ${s.unmatched_transactions || 0})\n` +
                        `  · 등록 카드: ${s.total_cards_registered || 0}장 (차량 할당 ${s.cards_with_car_assigned || 0})\n` +
                        `  · last4 종류: ${s.unique_last4_in_tx || 0}개\n\n` +
                        `🔴 매핑 부재 — 신규 카드 등록 필요\n${noCard}\n` +
                        `   ※ 이전 카드번호도 검색됨 (previous_card_number)\n` +
                        `   안 잡혔다면 진짜 미등록\n\n` +
                        `🟠 진짜 누락 — 활성 카드인데 차량/직원/공용 모두 X\n${noAssign}\n\n` +
                        `👤 직원 카드 (정상 — 직원에게 비용 귀속)\n${okEmp}\n\n` +
                        `⚪ 공용 카드 (정상 — 배차팀/탁송팀 의도)\n${okPool}\n\n` +
                        `🔘 해지 카드 (정상 — 사용 종료)\n${okCanceled}\n\n` +
                        `🟢 정상 매칭: ${json?.ok_count || 0} 종류\n\n` +
                        `💡 등록 카드 전체 ${allCards.length}장은 콘솔(F12)에서 확인 가능\n` +
                        `→ 매핑 관리 탭에서 카드 추가 시 자동 backfill 동작`
                      )
                    }}
                    style={{ ...BTN.sm, background: '#fff', color: '#0369a1', border: '1px solid rgba(14,165,233,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    🔍 매칭 진단
                  </button>
                  <button
                    onClick={async () => {
                      // 1) DRY RUN
                      const { json: dry } = await fetchWithAuth('/api/admin/sms-card-id-backfill', {
                        method: 'POST',
                        body: { dryRun: true },
                      })
                      if (dry?.error) { alert(`오류: ${dry.error}`); return }
                      const cands = dry?.candidates || 0
                      if (cands === 0) {
                        alert('🟢 강제 매칭 후보 없음 — 모두 매칭됐거나 raw_data 의 card_last4 가 없습니다.')
                        return
                      }
                      const byCardSummary = (dry?.by_card || []).slice(0, 10)
                        .map((c: any) => `  · ${c.cc_alias || '(NULL)'}: ${c.count}건`).join('\n')
                      const ok = confirm(
                        `🔧 SMS card_id 강제 매칭\n\n` +
                        `매칭 후보: ${cands}건 (raw_data.card_last4 ↔ corporate_cards.card_number 의 last4 일치)\n\n` +
                        `카드별 분포:\n${byCardSummary || '  (없음)'}\n\n` +
                        `▶ 적용하시겠습니까? card_sms_transactions.card_id 가 갱신됩니다.`
                      )
                      if (!ok) return
                      // 2) APPLY
                      const { json: applied } = await fetchWithAuth('/api/admin/sms-card-id-backfill', {
                        method: 'POST',
                        body: { dryRun: false },
                      })
                      if (applied?.error) { alert(`적용 오류: ${applied.error}`); return }
                      alert(`✅ 적용: ${applied?.updated || 0}건 / 후보: ${applied?.candidates || 0}건\n\n새로고침 후 화면에 매칭 라벨이 표시됩니다.`)
                      await loadTransactions()
                    }}
                    title="이전 파싱 SMS 거래의 card_id 를 raw_data.card_last4 매칭으로 강제 채움"
                    style={{ ...BTN.sm, background: 'rgba(34,197,94,0.10)', color: '#15803d', border: '1px solid rgba(34,197,94,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    🔧 SMS 강제 매칭
                  </button>
                  {summary && summary.transactions.card > 0 && (
                    <button
                      onClick={() => deleteAndReupload('excel_card')}
                      style={{ ...BTN.sm, background: '#fff', color: COLORS.danger, border: `1px solid rgba(239,68,68,0.3)`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      🗑 카드 전체삭제
                    </button>
                  )}
                </div>
              }
            />
            <NeuDataTable
              columns={cardColumns}
              data={cardTransactions}
              rowKey={(r) => r.id}
              mobileCard={cardMobile}
              loading={loading}
              emptyIcon="💳"
              emptyMessage="카드 거래 데이터가 없습니다"
            />
          </>
        )}

        {/* ──── 분류 검수 탭 ──── */}
        {activeTab === 'classify' && (
          <>
            {/* 카테고리별 요약 카드 */}
            {summary?.categoryBreakdown && (() => {
              // 카테고리별 집계: 수입/지출 합산
              const catMap = new Map<string, { count: number; income: number; expense: number; incomeAmt: number; expenseAmt: number }>()
              for (const row of summary.categoryBreakdown) {
                const key = row.category
                if (!catMap.has(key)) catMap.set(key, { count: 0, income: 0, expense: 0, incomeAmt: 0, expenseAmt: 0 })
                const m = catMap.get(key)!
                m.count += row.count
                if (row.type === 'income') { m.income += row.count; m.incomeAmt += row.totalAmount }
                else { m.expense += row.count; m.expenseAmt += row.totalAmount }
              }
              const catList = Array.from(catMap.entries())
                .map(([cat, v]) => ({ category: cat, ...v }))
                .filter(c => reviewTypeFilter === 'all' || (reviewTypeFilter === 'income' ? c.income > 0 : c.expense > 0))
                .sort((a, b) => b.count - a.count)

              return (
                <div>
                  {/* 헤더 */}
                  <div style={{
                    ...GLASS.L3, border: `1px solid ${COLORS.borderBlue}`,
                    borderRadius: 12, padding: '14px 20px', marginBottom: 12,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>
                          분류 검수 — {catList.length}개 카테고리 · {catList.reduce((s, c) => s + c.count, 0).toLocaleString()}건
                        </div>
                        <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                          카테고리를 클릭하면 해당 거래 목록을 확인하고 수정할 수 있습니다
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* 메인 ① — 룰 기반 자동 분류 (Phase 3-A 신규, 빠르고 안전) */}
                        <button
                          onClick={runRuleClassify}
                          disabled={ruleClassifyLoading || autoClassifying}
                          title="classification_rules 기반 분류 시도 (DB 변경 X — 결과 검수 후 일괄 확정)"
                          style={{
                            ...BTN.sm, padding: '6px 14px', fontSize: 12, fontWeight: 700,
                            background: 'linear-gradient(90deg, rgba(34,197,94,0.18), rgba(16,185,129,0.18))',
                            color: '#15803d',
                            border: '1px solid rgba(34,197,94,0.45)',
                            cursor: ruleClassifyLoading ? 'wait' : 'pointer',
                            opacity: ruleClassifyLoading ? 0.6 : 1,
                          }}
                        >🤖 룰 자동 분류</button>
                        {/* 메인 ② — 풀 자동 매칭(+AI) (구 인터페이스, 큰 작업) */}
                        <button
                          onClick={runFullAutoMatch}
                          disabled={autoClassifying}
                          title="차량/보험/대출/정비/지입/투자/급여 매칭 + 룰 분류 + AI 일괄 분류 순차 실행 (1~3분)"
                          style={{
                            ...BTN.sm, padding: '6px 16px', fontSize: 12, fontWeight: 700,
                            background: 'linear-gradient(90deg, rgba(236,72,153,0.18), rgba(99,102,241,0.18))',
                            color: '#7c3aed',
                            border: '1px solid rgba(124,58,237,0.45)',
                            cursor: autoClassifying ? 'wait' : 'pointer', opacity: autoClassifying ? 0.6 : 1,
                          }}
                        >🔮 풀 자동 매칭 (+AI)</button>
                        <button
                          onClick={async () => {
                            const { json } = await fetchWithAuth('/api/admin/ai-classify-review')
                            if (json?.error) { alert(`오류: ${json.error}`); return }
                            const s = json?.summary || {}
                            const fmtList = (arr: any[], fn: (x: any) => string) =>
                              (arr || []).slice(0, 10).map(fn).join('\n') || '  (없음)'
                            const top = fmtList(json?.by_category, (x: any) =>
                              `  · ${x.category}: ${x.count}건 (${(x.total_amount/10000).toFixed(0)}만원)`)
                            const inconsistent = fmtList(json?.inconsistent, (x: any) =>
                              `  · "${(x.description || '').slice(0, 30)}" — ${x.count}건 [${x.categories.join(',')}]`)
                            const overridden = fmtList(json?.user_overridden, (x: any) =>
                              `  · ${x.ai_category} → ${x.final_category}: ${x.count}건`)
                            const lowValue = fmtList(json?.top_unclassified_high_value, (x: any) =>
                              `  · ${(x.description || '').slice(0, 25)} ${(Number(x.amount)/10000).toFixed(0)}만 [${x.type === 'income' ? '입' : '출'}]`)
                            console.log('[AI 분류 검수]', json)
                            alert(
                              `🤖 AI 분류 검수\n\n` +
                              `📊 요약\n` +
                              `  · 전체: ${s.total || 0}건\n` +
                              `  · 분류 완료: ${s.classified || 0}건 (${s.classification_rate || 0}%)\n` +
                              `  · 미분류: ${s.unclassified || 0}건\n` +
                              `  · 사용자 수정: ${s.user_overridden_count || 0}건\n\n` +
                              `📁 카테고리 분포 (top 10)\n${top}\n\n` +
                              `⚠ 불일치 — 같은 적요 다른 카테고리\n${inconsistent}\n\n` +
                              `✏️ 사용자 수정 패턴\n${overridden}\n\n` +
                              `💰 미분류 고액 거래 (top 10)\n${lowValue}\n\n` +
                              `→ 콘솔(F12) 에서 전체 데이터 확인`
                            )
                          }}
                          disabled={autoClassifying}
                          title="AI 분류 결과 통계 + 의심 케이스 진단"
                          style={{
                            ...BTN.sm, padding: '6px 12px', fontSize: 12, fontWeight: 700,
                            background: '#fff', color: '#7e22ce',
                            border: '1px solid rgba(168,85,247,0.35)',
                            cursor: 'pointer',
                          }}
                        >🔍 AI 분류 검수</button>
                        {/* 고급 — 토글로 펼침 */}
                        <button
                          onClick={() => setShowAdvancedMatch(!showAdvancedMatch)}
                          style={{
                            ...BTN.sm, padding: '6px 10px', fontSize: 11, fontWeight: 600,
                            background: 'rgba(0,0,0,0.04)', color: COLORS.textSecondary,
                            border: `1px solid ${COLORS.borderSubtle}`, cursor: 'pointer',
                          }}
                        >{showAdvancedMatch ? '▾' : '▸'} 고급</button>
                        {showAdvancedMatch && (
                          <>
                            <button onClick={() => runAutoClassify(false)} disabled={autoClassifying}
                              style={{ ...BTN.sm, padding: '5px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(34,197,94,0.08)', color: '#15803d', border: '1px solid rgba(34,197,94,0.3)', cursor: autoClassifying ? 'wait' : 'pointer', opacity: autoClassifying ? 0.6 : 1 }}
                            >📐 룰</button>
                            <button onClick={runAiClassify} disabled={autoClassifying}
                              style={{ ...BTN.sm, padding: '5px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(168,85,247,0.08)', color: '#7e22ce', border: '1px solid rgba(168,85,247,0.3)', cursor: autoClassifying ? 'wait' : 'pointer', opacity: autoClassifying ? 0.6 : 1 }}
                            >🤖 AI</button>
                            <button onClick={() => runCarMatch(false)} disabled={autoClassifying}
                              style={{ ...BTN.sm, padding: '5px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(59,130,246,0.08)', color: '#1d4ed8', border: '1px solid rgba(59,130,246,0.3)', cursor: autoClassifying ? 'wait' : 'pointer', opacity: autoClassifying ? 0.6 : 1 }}
                            >🔗 차량</button>
                            <button onClick={() => runInsuranceMatch(false)} disabled={autoClassifying}
                              style={{ ...BTN.sm, padding: '5px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(16,185,129,0.08)', color: '#047857', border: '1px solid rgba(16,185,129,0.3)', cursor: autoClassifying ? 'wait' : 'pointer', opacity: autoClassifying ? 0.6 : 1 }}
                            >🛡 보험</button>
                            <button onClick={() => runLoanMatch(false)} disabled={autoClassifying}
                              style={{ ...BTN.sm, padding: '5px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(245,158,11,0.08)', color: '#b45309', border: '1px solid rgba(245,158,11,0.3)', cursor: autoClassifying ? 'wait' : 'pointer', opacity: autoClassifying ? 0.6 : 1 }}
                            >💰 대출</button>
                            <button onClick={() => runMaintenanceMatch(false)} disabled={autoClassifying}
                              style={{ ...BTN.sm, padding: '5px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(99,102,241,0.08)', color: '#4338ca', border: '1px solid rgba(99,102,241,0.3)', cursor: autoClassifying ? 'wait' : 'pointer', opacity: autoClassifying ? 0.6 : 1 }}
                            >🔧 정비</button>
                          </>
                        )}
                        <span style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.08)', margin: '0 4px' }} />
                        {(['all', 'expense', 'income'] as const).map(f => (
                          <button key={f} onClick={() => setReviewTypeFilter(f)}
                            style={{
                              ...BTN.sm, padding: '3px 10px', fontSize: 11,
                              background: reviewTypeFilter === f ? COLORS.primary : '#fff',
                              color: reviewTypeFilter === f ? '#fff' : COLORS.textSecondary,
                              border: `1px solid ${reviewTypeFilter === f ? COLORS.primary : COLORS.borderSubtle}`,
                              cursor: 'pointer',
                            }}>
                            {f === 'all' ? '전체' : f === 'income' ? '수입' : '지출'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* AI 일괄 분류 진행률 */}
                    {aiProgress && (
                      <div style={{
                        marginTop: 10, padding: '10px 12px',
                        background: aiProgress.running ? 'rgba(168,85,247,0.08)' : 'rgba(34,197,94,0.08)',
                        border: `1px solid ${aiProgress.running ? 'rgba(168,85,247,0.3)' : 'rgba(34,197,94,0.3)'}`,
                        borderRadius: 8, fontSize: 12, color: COLORS.textSecondary,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ fontWeight: 600, color: aiProgress.running ? '#7e22ce' : '#15803d' }}>
                            {aiProgress.running ? '🤖 AI 분류 진행 중...' : '✓ AI 분류 종료'}
                            {aiProgress.total > 0 && (
                              <> — {aiProgress.processed.toLocaleString()} / {aiProgress.total.toLocaleString()}건
                                {' '}({Math.round((aiProgress.processed / aiProgress.total) * 100)}%)
                              </>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 12 }}>
                            <span>자동 적용: <b style={{ color: '#15803d' }}>{aiProgress.applied.toLocaleString()}</b></span>
                            <span>검토 필요: <b style={{ color: '#d97706' }}>{aiProgress.below.toLocaleString()}</b></span>
                          </div>
                        </div>
                        {aiProgress.total > 0 && (
                          <div style={{
                            marginTop: 6, height: 4, background: 'rgba(0,0,0,0.05)', borderRadius: 2, overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${Math.min(100, (aiProgress.processed / aiProgress.total) * 100)}%`,
                              height: '100%',
                              background: aiProgress.running ? 'linear-gradient(90deg, #a855f7, #7e22ce)' : '#22c55e',
                              transition: 'width 0.3s ease',
                            }} />
                          </div>
                        )}
                        {aiProgress.lastError && !aiProgress.running && (
                          <div style={{ marginTop: 6, color: '#dc2626', fontSize: 11 }}>
                            ⚠ {aiProgress.lastError}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ──── Phase 3-A — 룰 기반 자동 분류 결과 ──── */}
                  {ruleClassifyResult && (
                    <div style={{
                      ...GLASS.L4, border: `1px solid ${COLORS.borderSubtle}`,
                      borderRadius: 12, padding: 16, marginBottom: 12,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>
                          🤖 룰 자동 분류 결과 — 총 {ruleClassifyResult.counts?.total || 0}건
                          <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 8, fontWeight: 400 }}>
                            (룰 {ruleClassifyResult.rules_count || 0}개 활성)
                          </span>
                        </div>
                        <button
                          onClick={() => { setRuleClassifyResult(null); setExpandedGroup(null) }}
                          style={{ ...BTN.sm, padding: '4px 10px', fontSize: 11, background: 'rgba(0,0,0,0.04)', color: COLORS.textSecondary, cursor: 'pointer' }}
                        >✕ 닫기</button>
                      </div>

                      {/* 3 그룹 카드 */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
                        {(['high', 'medium', 'low'] as const).map(conf => {
                          const items = ruleClassifyResult.groups?.[conf] || []
                          const meta = {
                            high:   { label: '🟢 HIGH 확실 — 일괄 확정', color: '#15803d', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.4)' },
                            medium: { label: '🟡 MEDIUM 검수 권장', color: '#b45309', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.4)' },
                            low:    { label: '🔴 LOW 수동/AI 검수', color: '#dc2626', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.4)' },
                          }[conf]
                          const expanded = expandedGroup === conf
                          return (
                            <div key={conf} style={{
                              padding: 12, borderRadius: 10, background: meta.bg, border: `1px solid ${meta.border}`,
                            }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: meta.color, marginBottom: 6 }}>
                                {meta.label}
                              </div>
                              <div style={{ fontSize: 22, fontWeight: 800, color: meta.color, marginBottom: 8 }}>
                                {items.length.toLocaleString()}건
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => setExpandedGroup(expanded ? null : conf)}
                                  style={{ ...BTN.sm, padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                           background: '#fff', color: meta.color, border: `1px solid ${meta.border}`, cursor: 'pointer' }}
                                >{expanded ? '▾ 접기' : '▸ 펼치기'}</button>
                                {conf === 'high' && items.length > 0 && (
                                  <button
                                    onClick={() => applyRuleClassify('high')}
                                    disabled={ruleClassifyLoading}
                                    style={{ ...BTN.sm, padding: '4px 12px', fontSize: 11, fontWeight: 700,
                                             background: '#15803d', color: '#fff', cursor: ruleClassifyLoading ? 'wait' : 'pointer' }}
                                  >✓ 일괄 확정</button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* 펼친 그룹의 거래 목록 */}
                      {expandedGroup && ruleClassifyResult.groups?.[expandedGroup]?.length > 0 && (
                        <div style={{
                          marginTop: 12, padding: '8px 0', maxHeight: 400, overflow: 'auto',
                          borderTop: `1px solid ${COLORS.borderSubtle}`,
                        }}>
                          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: 'rgba(0,0,0,0.03)', position: 'sticky', top: 0 }}>
                                <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: COLORS.textSecondary }}>적요</th>
                                <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: COLORS.textSecondary }}>제안 카테고리</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: COLORS.textSecondary }}>금액</th>
                                <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: COLORS.textSecondary }}>사유</th>
                                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, color: COLORS.textSecondary }}>액션</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(ruleClassifyResult.groups?.[expandedGroup] || []).slice(0, 200).map((it: any) => (
                                <tr key={it.id} style={{ borderBottom: `1px solid ${COLORS.borderSubtle}` }}>
                                  <td style={{ padding: '6px 8px' }}>
                                    <div style={{ fontWeight: 500, color: COLORS.textPrimary }}>{(it.description || '-').slice(0, 50)}</div>
                                    {it.card_alias && <div style={{ fontSize: 10, color: COLORS.textMuted }}>{it.card_alias}</div>}
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <div style={{ fontWeight: 600, color: '#1e40af' }}>{it.category}</div>
                                    {it.subcategory && <div style={{ fontSize: 10, color: COLORS.textSecondary }}>{it.subcategory}</div>}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600,
                                                color: it.type === 'income' ? COLORS.income : COLORS.expense }}>
                                    {it.type === 'income' ? '+' : '-'}{nf(Number(it.amount || 0))}
                                  </td>
                                  <td style={{ padding: '6px 8px', fontSize: 11, color: COLORS.textMuted }}>{it.reason}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                                      <button
                                        onClick={() => applyOneClassify(it)}
                                        disabled={ruleClassifyLoading}
                                        style={{ ...BTN.sm, padding: '3px 8px', fontSize: 10, fontWeight: 600,
                                                 background: '#15803d', color: '#fff', cursor: ruleClassifyLoading ? 'wait' : 'pointer' }}
                                      >✓ 확정</button>
                                      <button
                                        onClick={() => markAsPersonal(it)}
                                        disabled={ruleClassifyLoading}
                                        title="직원 개인 사용 — 급여 차감 후보로 등록"
                                        style={{ ...BTN.sm, padding: '3px 8px', fontSize: 10, fontWeight: 600,
                                                 background: '#ca8a04', color: '#fff', cursor: ruleClassifyLoading ? 'wait' : 'pointer' }}
                                      >👤 개인</button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {ruleClassifyResult.groups?.[expandedGroup]?.length > 200 && (
                            <div style={{ padding: '8px', textAlign: 'center', fontSize: 11, color: COLORS.textMuted }}>
                              ⋯ {ruleClassifyResult.groups[expandedGroup].length - 200}건 더 (재실행으로 갱신)
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 카테고리 카드 목록 — 클릭 시 인라인 확장 (선택된 카드 행 바로 아래에 상세 패널) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                    {catList.map(cat => {
                      const isSelected = reviewCategory === cat.category
                      const totalAmt = cat.incomeAmt + cat.expenseAmt
                      return (
                        <React.Fragment key={cat.category}>
                          <div
                            onClick={() => isSelected ? (setReviewCategory(null), setReviewItems([])) : loadReviewItems(cat.category)}
                            style={{
                              ...GLASS.L4,
                              border: `1px solid ${isSelected ? COLORS.primary : COLORS.borderSubtle}`,
                              borderRadius: 10, padding: '12px 16px', cursor: 'pointer',
                              transition: 'border-color 0.15s, box-shadow 0.15s',
                              ...(isSelected ? { boxShadow: `0 0 0 2px ${COLORS.primary}30` } : {}),
                            }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>
                                {isSelected && '▼ '}{cat.category}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.primary }}>
                                {cat.count.toLocaleString()}건
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: COLORS.textSecondary }}>
                              {cat.income > 0 && <span style={{ color: '#2563eb' }}>수입 {cat.income}건 ({nf(cat.incomeAmt)}원)</span>}
                              {cat.expense > 0 && <span style={{ color: '#dc2626' }}>지출 {cat.expense}건 ({nf(cat.expenseAmt)}원)</span>}
                            </div>
                            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                              합계 {nf(totalAmt)}원
                            </div>
                          </div>

                          {/* 선택된 카드 바로 아래 인라인 상세 패널 (전체 너비 span) */}
                          {isSelected && (
                            <div style={{
                              gridColumn: '1 / -1',
                              ...GLASS.L3,
                              border: `1px solid ${COLORS.borderBlue}`,
                              borderRadius: 12, padding: 12,
                              marginTop: 4, marginBottom: 4,
                            }}>
                              <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(0,0,0,0.06)',
                              }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>
                                  「{cat.category}」 거래 목록 ({reviewItems.length}건)
                                </span>
                                <button onClick={(e) => { e.stopPropagation(); setReviewCategory(null); setReviewItems([]) }}
                                  style={{ ...BTN.sm, background: '#fff', color: COLORS.textSecondary, border: `1px solid ${COLORS.borderSubtle}`, cursor: 'pointer' }}>
                                  닫기 ×
                                </button>
                              </div>
                              {reviewLoading && <div style={{ textAlign: 'center', padding: 20, color: COLORS.textMuted }}>불러오는 중...</div>}
                              {!reviewLoading && reviewItems.length > 0 && (
                                <div style={{ ...GLASS.L4, border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 10, overflow: 'auto', maxHeight: 480 }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead style={{ position: 'sticky', top: 0, background: 'rgba(255,255,255,0.95)', zIndex: 1 }}>
                                      <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: COLORS.textSecondary }}>날짜</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: COLORS.textSecondary }}>유형</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: COLORS.textSecondary }}>거래처</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: COLORS.textSecondary }}>적요</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: COLORS.textSecondary }}>금액</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: COLORS.textSecondary }}>소스</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: COLORS.textSecondary }}>매칭</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: COLORS.textSecondary }}>변경</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {reviewItems.map((item: any) => {
                                        const srcLabel = String(item.imported_from || '').startsWith('excel_bank') ? '통장' : String(item.imported_from || '').startsWith('excel_card') ? '카드' : item.imported_from === 'sms' ? 'SMS' : item.imported_from === 'sms_bank' ? 'SMS통장' : '기타'
                                        // 매칭 우선순위: 직접(related_id) > SMS(card_sms_transactions) > last4 → corporate_cards 검색
                                        const directCarNumber = item.matched_car_number || null
                                        const directCarModel = item.matched_car_model || null
                                        const smsCarNumber = item.matched_car_number_sms || null
                                        const smsCarModel = item.matched_car_model_sms || null
                                        const carNumber = directCarNumber || smsCarNumber
                                        const carModel = directCarModel || smsCarModel
                                        const isDirectMatch = !!directCarNumber
                                        // last4로 corporate_cards 후보 검색 (매칭 안 된 경우 카드 정체 표시용)
                                        const last4Cards = item.card_last4
                                          ? mappingCards.filter((c: any) => {
                                              const digits = String(c.card_number || '').replace(/\D/g, '')
                                              return digits.length >= 4 && digits.slice(-4) === item.card_last4
                                            })
                                          : []
                                        // 매칭 라벨 결정 — 명확한 우선순위
                                        let matchLabel: string
                                        let matchTone: 'success' | 'warning' | 'danger' | 'muted' = 'muted'
                                        let matchSubLabel: string | null = null
                                        if (carNumber) {
                                          // 차량 매칭됨 (직접 또는 SMS)
                                          matchLabel = `🚗 ${carNumber}${carModel ? ` (${carModel})` : ''}${isDirectMatch ? '' : ' [SMS]'}`
                                          matchTone = 'success'
                                          // 카드 정체 부가 표시
                                          if (last4Cards.length === 1) {
                                            const c = last4Cards[0]
                                            matchSubLabel = [c.card_alias, c.holder_name].filter(Boolean).join(' · ')
                                          }
                                        } else if (last4Cards.length === 1) {
                                          // last4 카드 1장 — 차량 미배정 상태
                                          const c = last4Cards[0]
                                          const parts = [c.card_alias || `카드 ${item.card_last4}`]
                                          if (c.holder_name) parts.push(c.holder_name)
                                          if (c.status && c.status !== 'active') parts.push(`[${c.status}]`)
                                          matchLabel = `💳 ${parts.join(' · ')}`
                                          matchTone = 'warning'
                                          matchSubLabel = '차량 미배정'
                                        } else if (last4Cards.length >= 2) {
                                          // last4 동일 카드 2장 이상 — 사용자 선택 필요
                                          matchLabel = `⚠️ 후보 ${last4Cards.length}장 (last4=${item.card_last4})`
                                          matchTone = 'warning'
                                          matchSubLabel = last4Cards.slice(0, 2).map((c: any) => c.card_alias || c.holder_name || '?').join(', ') + (last4Cards.length > 2 ? '...' : '')
                                        } else if (item.matched_card_alias) {
                                          // SMS 별칭 매칭 (last4 미사용)
                                          matchLabel = `💳 ${item.matched_card_alias}`
                                          matchTone = 'warning'
                                        } else if (item.matched_holder_name) {
                                          matchLabel = `👤 ${item.matched_holder_name}`
                                          matchTone = 'muted'
                                        } else if (item.card_last4) {
                                          // last4 있지만 corporate_cards에 등록 안됨
                                          matchLabel = `❌ 미등록 (last4=${item.card_last4})`
                                          matchTone = 'danger'
                                          matchSubLabel = '매핑 관리에서 카드 등록 필요'
                                        } else {
                                          matchLabel = '-'
                                        }
                                        const currentCarId = item.matched_car_id || (isDirectMatch ? item.related_id : null) || ''
                                        const matchColor = matchTone === 'success' ? '#15803d'
                                                         : matchTone === 'warning' ? '#d97706'
                                                         : matchTone === 'danger'  ? '#dc2626'
                                                         : COLORS.textMuted
                                        // ★ 유형/거래처/금액 표시 — sms_transaction_type 우선
                                        const stType = item.sms_transaction_type
                                        const isCanceled = stType === 'canceled'
                                        const isDeposit = stType === 'deposit' || (stType !== 'canceled' && stType !== 'withdrawal' && stType !== 'approved' && item.type === 'income')
                                        const isWithdrawal = stType === 'withdrawal'
                                        const typeLabel = isCanceled ? '취소' : isDeposit ? '수입' : isWithdrawal ? '출금' : '지출'
                                        const typeTone = isCanceled ? 'danger' : isDeposit ? 'success' : 'danger'
                                        const merchantText = item.sms_merchant || item.description || '-'
                                        const amtSign = isCanceled || isWithdrawal ? '-' : isDeposit ? '+' : ''
                                        const amtColor = isCanceled ? '#dc2626' : isDeposit ? '#2563eb' : COLORS.textPrimary
                                        return (
                                          <tr key={item.id} style={{ borderTop: '1px solid rgba(0,0,0,0.04)', background: isCanceled ? 'rgba(254,202,202,0.18)' : undefined }}>
                                            <td style={{ padding: '6px 10px', color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>
                                              {item.transaction_date ? String(item.transaction_date instanceof Date ? item.transaction_date.toISOString() : item.transaction_date).slice(0, 10) : '-'}
                                            </td>
                                            <td style={{ padding: '6px 10px' }}>
                                              <span style={{ ...pillStyle(typeTone as any), fontSize: 10, padding: '1px 6px', fontWeight: isCanceled ? 700 : 600 }}>
                                                {typeLabel}
                                              </span>
                                            </td>
                                            <td style={{ padding: '6px 10px', color: COLORS.textPrimary, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                              {item.client_name || item.sms_holder || '-'}
                                            </td>
                                            <td style={{ padding: '6px 10px', color: COLORS.textSecondary, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                              {isCanceled && <span style={{ color: '#dc2626', fontWeight: 700, marginRight: 4 }}>[취소]</span>}
                                              {merchantText}
                                            </td>
                                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: amtColor }}>
                                              {amtSign}{nf(Math.abs(Number(item.amount || 0)))}
                                            </td>
                                            <td style={{ padding: '6px 10px', color: COLORS.textMuted, fontSize: 11 }}>{srcLabel}</td>
                                            <td style={{ padding: '6px 10px', fontSize: 11, maxWidth: 240 }}>
                                              <div style={{ color: matchColor, fontWeight: matchTone === 'success' ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={matchLabel}>
                                                {matchLabel}
                                              </div>
                                              {matchSubLabel && (
                                                <div style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={matchSubLabel}>
                                                  {matchSubLabel}
                                                </div>
                                              )}
                                              {/* 차량 변경 dropdown — 사용자가 직접 매칭 수정 */}
                                              <select
                                                value={currentCarId}
                                                onChange={(e) => changeItemCar(item.id, e.target.value)}
                                                style={{ fontSize: 10, padding: '1px 4px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 4, color: COLORS.textSecondary, cursor: 'pointer', maxWidth: 220, marginTop: 2 }}>
                                                <option value="">— 차량 매칭 변경 —</option>
                                                {cars.map(c => (
                                                  <option key={c.id} value={c.id}>
                                                    {c.number}{c.brand || c.model ? ` (${c.brand || ''} ${c.model || ''})`.trim() : ''}
                                                  </option>
                                                ))}
                                              </select>
                                            </td>
                                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                              <select
                                                defaultValue=""
                                                onChange={(e) => { if (e.target.value) changeItemCategory(item.id, e.target.value); e.target.value = '' }}
                                                style={{ fontSize: 10, padding: '2px 4px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 4, color: COLORS.textMuted, cursor: 'pointer' }}>
                                                <option value="">이동</option>
                                                {(summary?.categoryBreakdown || []).map((c: any) => c.category).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i && v !== reviewCategory).map((c2: string) => (
                                                  <option key={c2} value={c2}>{c2}</option>
                                                ))}
                                              </select>
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {!reviewLoading && reviewItems.length === 0 && (
                                <div style={{ textAlign: 'center', padding: 20, color: COLORS.textMuted, fontSize: 13 }}>거래 내역이 없습니다</div>
                              )}
                            </div>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </>
        )}

        {/* ──── 미분류 + 그룹분류 탭 ──── */}
        {activeTab === 'matching' && (
          <>
            {/* 데이터 품질 안내 배너 */}
            {summary && summary.transactions.unclassified > 0 && summary.transactions.classified === 0 && !autoClassifyResult && (
              <div style={{
                ...GLASS.L3,
                border: `1px solid rgba(245,158,11,0.4)`,
                borderRadius: 12,
                padding: '14px 18px',
                marginBottom: 12,
                background: 'rgba(255,251,235,0.85)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                  데이터 품질 안내
                </div>
                <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.7 }}>
                  현재 {nf(summary.transactions.unclassified)}건의 거래가 미분류 상태입니다.
                  은행 엑셀의 거래처/적요 필드가 비어있으면 자동 분류가 어렵습니다.
                </div>
                <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.7, marginTop: 4 }}>
                  <b>권장 순서:</b> 1) 자동 분류 실행 → 2) 분류 가능한 건 먼저 처리 → 3) 남은 건은 그룹별 수동 분류
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => runAutoClassify(false)}
                    disabled={autoClassifying}
                    style={{
                      ...BTN.md,
                      background: '#f59e0b', color: '#fff', border: 'none',
                      cursor: autoClassifying ? 'wait' : 'pointer', fontWeight: 600,
                    }}
                  >
                    {autoClassifying ? '분류 중...' : '⚡ 자동 분류 실행'}
                  </button>
                  {summary.transactions.bank > 5000 && (
                    <button
                      onClick={() => deleteAndReupload('excel_bank')}
                      style={{
                        ...BTN.md,
                        background: '#fff', color: '#92400e', border: `1px solid rgba(245,158,11,0.4)`,
                        cursor: 'pointer', fontSize: 12,
                      }}
                    >
                      🔄 통장 데이터 삭제 후 재업로드
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 자동 분류 결과 요약 */}
            {autoClassifyResult && (
              <div style={{
                ...GLASS.L3,
                border: `1px solid ${autoClassifyResult.classified > 0 ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`,
                borderRadius: 12,
                padding: '14px 18px',
                marginBottom: 12,
                background: autoClassifyResult.classified > 0 ? 'rgba(240,253,244,0.85)' : 'rgba(255,251,235,0.85)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: autoClassifyResult.classified > 0 ? '#166534' : '#92400e', marginBottom: 4 }}>
                      자동 분류 결과: {nf(autoClassifyResult.updated || autoClassifyResult.classified)}건 분류 완료
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.7 }}>
                      전체 {nf(autoClassifyResult.totalScanned)}건 스캔 →
                      분류 {nf(autoClassifyResult.classified)}건 (거래처 {autoClassifyResult.matchMethodStats?.client_name || 0} + 적요 {autoClassifyResult.matchMethodStats?.description || 0} + 결합 {autoClassifyResult.matchMethodStats?.combined || 0})
                      · 미분류 {nf(autoClassifyResult.skipped)}건
                    </div>
                    {autoClassifyResult.breakdown?.length > 0 && (
                      <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {autoClassifyResult.breakdown.slice(0, 8).map((b: any) => (
                          <span key={b.category} style={{
                            background: 'rgba(59,130,246,0.08)',
                            border: '1px solid rgba(59,130,246,0.15)',
                            borderRadius: 4, padding: '1px 6px',
                          }}>
                            {b.category} ({b.count})
                          </span>
                        ))}
                        {autoClassifyResult.breakdown.length > 8 && (
                          <span>외 {autoClassifyResult.breakdown.length - 8}개</span>
                        )}
                      </div>
                    )}
                    {autoClassifyResult.amountPatterns?.length > 0 && (
                      <div style={{ fontSize: 11, color: '#92400e', marginTop: 6 }}>
                        반복 금액 패턴 {autoClassifyResult.amountPatterns.length}개 발견 (그룹 분류에서 확인 가능)
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {autoClassifyResult.skipped > 0 && (
                      <button
                        onClick={loadGroupClassify}
                        disabled={groupLoading}
                        style={{
                          ...BTN.md,
                          background: COLORS.primary, color: '#fff', border: 'none',
                          cursor: 'pointer', fontSize: 12,
                        }}
                      >
                        📊 남은 {nf(autoClassifyResult.skipped)}건 그룹 분류
                      </button>
                    )}
                    <button
                      onClick={() => setAutoClassifyResult(null)}
                      style={{ ...BTN.sm, background: '#fff', color: COLORS.textMuted, border: `1px solid ${COLORS.borderSubtle}`, cursor: 'pointer', fontSize: 11 }}
                    >
                      닫기
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 상단 제어판 */}
            <div style={{
              ...GLASS.L3,
              border: `1px solid ${COLORS.borderBlue}`,
              borderRadius: 12,
              padding: '16px 20px',
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 4 }}>
                    미분류 거래: {nf(groupData?.totalUnclassified || summary?.transactions.unclassified || 0)}건
                    {groupData && (
                      <span style={{ marginLeft: 12, color: COLORS.textSecondary, fontWeight: 400 }}>
                        {groupData.groupCount}개 그룹 · 추천 {groupData.withSuggestion}개
                      </span>
                    )}
                  </div>
                  {groupData?.sourceCounts && (
                    <div style={{ fontSize: 12, color: COLORS.textMuted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {groupData.sourceCounts.excel_bank > 0 && <span>통장 {nf(groupData.sourceCounts.excel_bank)}</span>}
                      {groupData.sourceCounts.excel_card > 0 && <span>카드 {nf(groupData.sourceCounts.excel_card)}</span>}
                      {groupData.sourceCounts.sms > 0 && <span>SMS {nf(groupData.sourceCounts.sms)}</span>}
                      {groupData.sourceCounts.other > 0 && <span>기타 {nf(groupData.sourceCounts.other)}</span>}
                    </div>
                  )}
                  {!groupData && !autoClassifyResult && (
                    <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                      1단계: 자동 분류로 키워드 매칭 가능한 건 먼저 처리 → 2단계: 나머지를 그룹별로 수동 분류
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => runAutoClassify(false)}
                    disabled={autoClassifying}
                    style={{
                      ...BTN.md,
                      background: autoClassifying ? COLORS.textMuted : '#f59e0b',
                      color: '#fff', border: 'none', cursor: autoClassifying ? 'wait' : 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {autoClassifying ? '분류 중...' : '⚡ 자동 분류'}
                  </button>
                  <button
                    onClick={loadGroupClassify}
                    disabled={groupLoading}
                    style={{
                      ...BTN.md,
                      background: groupLoading ? COLORS.textMuted : COLORS.primary,
                      color: '#fff', border: 'none', cursor: groupLoading ? 'wait' : 'pointer',
                    }}
                  >
                    {groupLoading ? '분석 중...' : groupData ? '🔄 새로고침' : '📊 그룹 분류 로드'}
                  </button>
                  {groupData && groupData.groups.filter((g: any) => g.suggestedCategory && g.suggestedConfidence >= 80).length > 0 && (
                    <button
                      onClick={confirmAllSuggested}
                      disabled={groupLoading}
                      style={{
                        ...BTN.md,
                        background: COLORS.success, color: '#fff', border: 'none', cursor: 'pointer',
                      }}
                    >
                      ⚡ 추천 일괄 확정 ({groupData.groups.filter((g: any) => g.suggestedCategory && g.suggestedConfidence >= 80).length}그룹)
                    </button>
                  )}
                  <button
                    onClick={() => runAutoMatch(false)}
                    disabled={matching}
                    style={{
                      ...BTN.md,
                      background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`,
                      cursor: matching ? 'wait' : 'pointer',
                    }}
                  >
                    {matching ? '분석 중...' : '🔗 정산 매칭'}
                  </button>
                </div>
              </div>
            </div>

            {/* 필터 바: 소스 + 유형 + 추천 상태 */}
            {groupData && (
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* 소스 필터 */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: COLORS.textMuted, marginRight: 4 }}>소스:</span>
                  {([
                    { key: 'all', label: '전체' },
                    ...(groupData.sourceCounts?.excel_bank > 0 ? [{ key: 'excel_bank', label: '통장' }] : []),
                    ...(groupData.sourceCounts?.excel_card > 0 ? [{ key: 'excel_card', label: '카드' }] : []),
                    ...(groupData.sourceCounts?.sms > 0 ? [{ key: 'sms', label: 'SMS' }] : []),
                  ] as { key: typeof groupSourceFilter; label: string }[]).map(f => (
                    <button
                      key={f.key}
                      onClick={() => setGroupSourceFilter(f.key)}
                      style={{
                        ...BTN.sm, padding: '2px 10px', fontSize: 11,
                        background: groupSourceFilter === f.key ? COLORS.primary : '#fff',
                        color: groupSourceFilter === f.key ? '#fff' : COLORS.textSecondary,
                        border: `1px solid ${groupSourceFilter === f.key ? COLORS.primary : COLORS.borderSubtle}`,
                        cursor: 'pointer',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {/* 유형 필터 */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: COLORS.textMuted, marginRight: 4 }}>유형:</span>
                  {([
                    { key: 'all' as const, label: '전체' },
                    { key: 'expense' as const, label: '지출' },
                    { key: 'income' as const, label: '수입' },
                  ]).map(f => (
                    <button
                      key={f.key}
                      onClick={() => setGroupTypeFilter(f.key)}
                      style={{
                        ...BTN.sm, padding: '2px 10px', fontSize: 11,
                        background: groupTypeFilter === f.key ? COLORS.primary : '#fff',
                        color: groupTypeFilter === f.key ? '#fff' : COLORS.textSecondary,
                        border: `1px solid ${groupTypeFilter === f.key ? COLORS.primary : COLORS.borderSubtle}`,
                        cursor: 'pointer',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {/* 추천 상태 필터 */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: COLORS.textMuted, marginRight: 4 }}>추천:</span>
                  {([
                    { key: 'all' as const, label: '전체' },
                    { key: 'suggested' as const, label: '추천 있음' },
                    { key: 'unclassified' as const, label: '미추천' },
                  ]).map(f => (
                    <button
                      key={f.key}
                      onClick={() => setGroupFilter(f.key)}
                      style={{
                        ...BTN.sm, padding: '2px 10px', fontSize: 11,
                        background: groupFilter === f.key ? COLORS.primary : '#fff',
                        color: groupFilter === f.key ? '#fff' : COLORS.textSecondary,
                        border: `1px solid ${groupFilter === f.key ? COLORS.primary : COLORS.borderSubtle}`,
                        cursor: 'pointer',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {/* 필터 결과 건수 */}
                <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 'auto' }}>
                  {filteredGroups.length}개 그룹 · {filteredGroups.reduce((s: number, g: any) => s + g.count, 0).toLocaleString()}건
                </span>
              </div>
            )}

            {/* 그룹 분류 카드 목록 */}
            {groupData && filteredGroups.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filteredGroups.slice(0, 150).map((group: any) => {
                  const isConfirming = groupConfirming.has(group.merchantKey)
                  const selectedCat = groupCategoryEdits[group.merchantKey] || ''
                  const srcColor = group.source === 'excel_bank' ? '#2563eb' : group.source === 'excel_card' ? '#7c3aed' : group.source === 'sms' ? '#059669' : '#6b7280'
                  return (
                    <div
                      key={group.merchantKey}
                      style={{
                        ...GLASS.L4,
                        border: `1px solid ${group.suggestedCategory ? 'rgba(34,197,94,0.25)' : COLORS.borderSubtle}`,
                        borderRadius: 10,
                        padding: '10px 14px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        {/* 왼쪽: 거래처 정보 */}
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                            {/* 소스 뱃지 */}
                            <span style={{
                              fontSize: 10, fontWeight: 600, color: srcColor,
                              background: `${srcColor}12`, border: `1px solid ${srcColor}30`,
                              borderRadius: 4, padding: '1px 6px', lineHeight: '16px',
                            }}>
                              {group.sourceLabel}
                            </span>
                            {/* 수입/지출 뱃지 */}
                            <span style={{
                              ...pillStyle(group.type === 'income' ? 'success' : 'danger'),
                              fontSize: 10, padding: '1px 6px',
                            }}>
                              {group.type === 'income' ? '수입' : '지출'}
                            </span>
                            {/* 거래처명 */}
                            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>
                              {group.merchantName}
                            </span>
                            <span style={{ fontSize: 12, color: COLORS.textMuted }}>
                              {group.count}건
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 2 }}>
                            총 {nf(group.totalAmount)}원 · 평균 {nf(group.avgAmount)}원
                            {group.bankName && <span style={{ marginLeft: 8, color: COLORS.textMuted }}>({group.bankName})</span>}
                            {group.cardCompany && <span style={{ marginLeft: 8, color: COLORS.textMuted }}>({group.cardCompany})</span>}
                          </div>
                          <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                            {group.dateRange.first}{group.dateRange.last && group.dateRange.last !== group.dateRange.first ? ` ~ ${group.dateRange.last}` : ''}
                            {group.sampleDescriptions.length > 0 && (
                              <span style={{ marginLeft: 8 }}>
                                적요: {group.sampleDescriptions.slice(0, 2).join(', ')}
                              </span>
                            )}
                            {group.sampleClientNames.length > 0 && group.merchantName !== group.sampleClientNames[0] && (
                              <span style={{ marginLeft: 8 }}>
                                거래처: {group.sampleClientNames.slice(0, 2).join(', ')}
                              </span>
                            )}
                          </div>
                          {/* 추천 카테고리 표시 */}
                          {group.suggestedCategory && (
                            <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 500, marginTop: 2 }}>
                              추천: {group.suggestedCategory} ({group.suggestedConfidence}%)
                            </div>
                          )}
                        </div>
                        {/* 오른쪽: 카테고리 선택 + 확인 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <select
                            value={selectedCat}
                            onChange={(e) => setGroupCategoryEdits(prev => ({ ...prev, [group.merchantKey]: e.target.value }))}
                            style={{
                              ...GLASS.L1,
                              border: `1px solid ${COLORS.borderSubtle}`,
                              borderRadius: 6, padding: '5px 8px', fontSize: 12,
                              color: COLORS.textPrimary, minWidth: 150, cursor: 'pointer',
                            }}
                          >
                            <option value="">카테고리 선택...</option>
                            <optgroup label="수입">
                              {(groupData.categories || []).filter((c: string) =>
                                ['렌트/운송수입','지입 관리비/수수료','투자원금 입금','지입 초기비용/보증금','렌터카 보증금(입금)','대출 실행(입금)','이자/잡이익','보험금 수령','매각/처분수입','기타수입'].includes(c)
                              ).map((cat: string) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </optgroup>
                            <optgroup label="지출 - 차량">
                              {(groupData.categories || []).filter((c: string) =>
                                ['유류비','정비/수리비','차량보험료','자동차세/공과금','차량할부/리스료','화물공제/적재물보험'].includes(c)
                              ).map((cat: string) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </optgroup>
                            <optgroup label="지출 - 인건비">
                              {(groupData.categories || []).filter((c: string) =>
                                ['급여(정규직)','일용직급여','용역비(3.3%)','4대보험(회사부담)'].includes(c)
                              ).map((cat: string) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </optgroup>
                            <optgroup label="지출 - 세금/금융">
                              {(groupData.categories || []).filter((c: string) =>
                                ['원천세/부가세','법인세/지방세','세금/공과금','이자비용(대출/투자)','원금상환','수수료/카드수수료'].includes(c)
                              ).map((cat: string) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </optgroup>
                            <optgroup label="지출 - 운영/관리">
                              {(groupData.categories || []).filter((c: string) =>
                                ['지입 수익배분금(출금)','임차료/사무실','통신비','소모품/사무용품','복리후생(식대)','접대비','여비교통비','교육/훈련비','광고/마케팅','보험료(일반)','수선/유지비','전기/수도/가스','도서/신문','경비/보안','쇼핑/온라인구매','기타'].includes(c)
                              ).map((cat: string) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </optgroup>
                          </select>
                          <button
                            onClick={() => confirmGroupCategory(group)}
                            disabled={!selectedCat || isConfirming}
                            style={{
                              ...BTN.sm,
                              background: !selectedCat ? COLORS.textMuted : COLORS.success,
                              color: '#fff', border: 'none',
                              cursor: !selectedCat || isConfirming ? 'not-allowed' : 'pointer',
                              opacity: !selectedCat ? 0.5 : 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isConfirming ? '...' : `✓ ${group.count}건 확정`}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {filteredGroups.length > 150 && (
                  <div style={{ textAlign: 'center', fontSize: 12, color: COLORS.textMuted, padding: 12 }}>
                    + {filteredGroups.length - 150}개 그룹 더 있음 (필터를 사용하세요)
                  </div>
                )}
              </div>
            )}

            {groupData && filteredGroups.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: COLORS.textMuted, fontSize: 13 }}>
                현재 필터 조건에 맞는 그룹이 없습니다
              </div>
            )}

            {/* 기존 자동매칭 결과 (정산 매칭) */}
            {matchResults.length > 0 && (
              <>
                <div style={{ marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>
                  정산/계약 매칭 결과 ({matchResults.length}건)
                </div>
                <DcToolbar
                  search={search}
                  onSearchChange={setSearch}
                  placeholder="거래/매칭 대상 검색..."
                  trailing={
                    selectedMatches.size > 0 ? (
                      <button
                        onClick={confirmSelectedMatches}
                        style={{ ...BTN.sm, background: COLORS.success, color: '#fff', border: 'none', cursor: 'pointer' }}
                      >
                        ✓ {selectedMatches.size}건 매칭 확인
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          const highScore = matchResults.filter(r => r.score >= 75)
                          setSelectedMatches(new Set(highScore.map(r => r.transactionId)))
                        }}
                        style={{ ...BTN.sm, background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer' }}
                      >
                        75%+ 전체 선택
                      </button>
                    )
                  }
                />
                <NeuDataTable
                  columns={matchColumns}
                  data={filteredMatchResults}
                  rowKey={(r) => r.transactionId}
                  mobileCard={matchMobile}
                  emptyIcon="🔗"
                  emptyMessage="매칭 후보가 없습니다"
                />
              </>
            )}

            {!groupData && matchResults.length === 0 && !matching && !groupLoading && !autoClassifyResult && (
              <div style={{
                textAlign: 'center', padding: '60px 20px',
                color: COLORS.textMuted, fontSize: 14,
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ marginBottom: 8 }}>
                  <b>[⚡ 자동 분류]</b>를 먼저 실행하세요 — 키워드 매칭으로 분류 가능한 건을 한 번에 처리합니다
                </div>
                <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                  이후 남은 미분류 건은 [📊 그룹 분류 로드]로 거래처별 수동 분류가 가능합니다
                </div>
                <div style={{ marginTop: 16 }}>
                  <button
                    onClick={() => runAutoClassify(false)}
                    disabled={autoClassifying}
                    style={{
                      ...BTN.md, padding: '10px 28px',
                      background: '#f59e0b', color: '#fff', border: 'none',
                      cursor: autoClassifying ? 'wait' : 'pointer',
                      fontWeight: 600, fontSize: 14,
                    }}
                  >
                    {autoClassifying ? '분류 중...' : '⚡ 자동 분류 실행'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ──── 정산 연결 탭 ──── */}
        {activeTab === 'settlement' && (
          <>
            {summary && (
              <div style={{ marginBottom: 8 }}>
                <DcStatStrip
                  stats={[
                    { label: '전체 정산', value: nf(summary.settlement.total), tint: 'blue', icon: '📋' },
                    { label: '연결됨', value: nf(summary.settlement.linked), tint: 'green', icon: '✓' },
                    { label: '미연결', value: nf(summary.settlement.unlinked), tint: 'red', icon: '✗' },
                    { label: '총액', value: nf(summary.settlement.totalAmount), unit: '원', tint: 'amber', icon: '💰' },
                  ]}
                />
              </div>
            )}
            <DcToolbar
              search={search}
              onSearchChange={setSearch}
              placeholder="수령인, 정산월 검색..."
            />
            <NeuDataTable
              columns={settlementColumns}
              data={filteredSettlements}
              rowKey={(r) => r.id}
              mobileCard={settlementMobile}
              loading={loading}
              emptyIcon="📋"
              emptyMessage="정산 지급내역이 없습니다"
            />
          </>
        )}

        {/* ──── SMS 수집 탭 ──── */}
        {activeTab === 'sms' && (
          <>
            <DcStatStrip stats={(() => {
              const parsed = smsStats.find(s => s.status === 'parsed') || { count: 0, total: 0 }
              const failed = smsStats.find(s => s.status === 'failed') || { count: 0, total: 0 }
              const total30d = smsStats.reduce((a, s) => a + s.count, 0)
              return [
                { label: '30일 수신', value: nf(total30d), tint: 'blue' as const, icon: '📱' },
                { label: '파싱 성공', value: nf(parsed.count), tint: 'green' as const, icon: '✅' },
                { label: '파싱 실패', value: nf(failed.count), tint: 'red' as const, icon: '❌' },
                { label: '승인합계', value: nf(parsed.total), unit: '원', tint: 'amber' as const, icon: '💰' },
              ]
            })()} />

            {/* SMS 필터 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, marginTop: 8, flexWrap: 'wrap' }}>
              {['', 'parsed', 'failed', 'ignored'].map(s => (
                <button key={s || 'all'} onClick={() => setSmsStatusFilter(s)} style={{
                  padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${smsStatusFilter === s ? 'rgba(59,110,181,0.4)' : 'rgba(0,0,0,0.06)'}`,
                  background: smsStatusFilter === s ? 'rgba(191,219,254,0.6)' : 'rgba(255,255,255,0.72)',
                  color: '#1e293b',
                }}>
                  {s === '' ? '상태 전체' : s === 'parsed' ? '✅ 성공' : s === 'failed' ? '❌ 실패' : '🔇 무시'}
                </button>
              ))}
              <span style={{ width: 8 }} />
              {['', 'KB', 'WOORI', 'HYUNDAI', 'MYCOMPANY', 'WOORI_BANK', 'KB_BANK'].map(i => (
                <button key={i || 'all'} onClick={() => setSmsIssuerFilter(i)} style={{
                  padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${smsIssuerFilter === i ? 'rgba(59,110,181,0.4)' : 'rgba(0,0,0,0.06)'}`,
                  background: smsIssuerFilter === i ? 'rgba(191,219,254,0.6)' : 'rgba(255,255,255,0.72)',
                  color: '#1e293b',
                }}>
                  {i === '' ? '카드사 전체' : ISSUER_LABEL[i]}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <button onClick={handleReparse} disabled={reparsing} style={{
                padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: reparsing ? 'wait' : 'pointer',
                border: '1px solid rgba(139,92,246,0.3)',
                background: 'rgba(221,214,254,0.5)',
                color: '#7c3aed',
                opacity: reparsing ? 0.6 : 1,
              }} title="실패 SMS 새 파서로 재시도 (필요 시에만)">
                {reparsing ? '재파싱 중...' : '🔄 실패 건 재파싱'}
              </button>
            </div>

            {/* SMS 테이블 */}
            <div style={{
              ...GLASS.L4, borderRadius: 16, overflow: 'hidden',
              boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -2px -2px 8px rgba(255,255,255,0.6)',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(241,245,249,0.6)', color: '#475569', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>상태</th>
                    <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>수신시각</th>
                    <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>카드사</th>
                    <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>승인자</th>
                    <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>가맹점</th>
                    <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>금액</th>
                    <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>구분</th>
                    <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700 }}>원문</th>
                  </tr>
                </thead>
                <tbody>
                  {smsLoading && (
                    <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>불러오는 중...</td></tr>
                  )}
                  {!smsLoading && smsRows.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                      수신된 SMS가 없습니다. SMS Forwarder 앱 설정 후 카드 결제 시 자동 수집됩니다.
                    </td></tr>
                  )}
                  {smsRows.map(r => (
                    <tr key={r.id} style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        {r.parse_status === 'parsed' && <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(167,243,208,0.5)', color: '#059669' }}>✅</span>}
                        {r.parse_status === 'failed' && <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(254,202,202,0.5)', color: '#dc2626' }}>❌</span>}
                        {r.parse_status === 'ignored' && <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(226,232,240,0.7)', color: '#94a3b8' }}>🔇</span>}
                        {r.parse_status === 'pending' && <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(226,232,240,0.7)', color: '#64748b' }}>⏳</span>}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#1e293b' }}>{r.received_at ? String(r.received_at).slice(0, 16).replace('T', ' ') : '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {r.card_issuer ? (
                          <span style={{ padding: '2px 8px', borderRadius: 6, background: `${ISSUER_COLOR[r.card_issuer]}22`, color: ISSUER_COLOR[r.card_issuer], fontWeight: 700, fontSize: 11 }}>
                            {ISSUER_LABEL[r.card_issuer]}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#1e293b' }}>{r.holder_name || '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#1e293b' }}>{r.merchant || '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: r.transaction_type === 'canceled' || r.transaction_type === 'withdrawal' ? '#ef4444' : r.transaction_type === 'deposit' ? '#059669' : '#1e293b' }}>
                        {r.amount != null ? `${r.transaction_type === 'canceled' || r.transaction_type === 'withdrawal' ? '-' : r.transaction_type === 'deposit' ? '+' : ''}${Number(r.amount).toLocaleString()}` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#1e293b' }}>{r.transaction_type === 'canceled' ? '취소' : r.transaction_type === 'deposit' ? '입금' : r.transaction_type === 'withdrawal' ? '출금' : r.installment || '일시불'}</td>
                      <td style={{ padding: '10px 12px', maxWidth: 300, color: '#64748b', fontSize: 11 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.raw_text}>{r.raw_text}</div>
                        {r.parse_error && <div style={{ color: '#ef4444', fontSize: 10, marginTop: 2 }}>⚠ {r.parse_error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ──── 매핑 관리 탭 ──── */}
        {activeTab === 'mapping' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={() => setMappingSub('card')} style={{
                padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${mappingSub === 'card' ? 'rgba(59,110,181,0.4)' : 'rgba(0,0,0,0.06)'}`,
                background: mappingSub === 'card' ? 'rgba(191,219,254,0.6)' : 'rgba(255,255,255,0.72)',
                color: mappingSub === 'card' ? '#1e40af' : '#475569',
              }}>💳 카드 매핑 ({mappingCards.length})</button>
              <button onClick={() => setMappingSub('bank')} style={{
                padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${mappingSub === 'bank' ? 'rgba(5,150,105,0.4)' : 'rgba(0,0,0,0.06)'}`,
                background: mappingSub === 'bank' ? 'rgba(167,243,208,0.4)' : 'rgba(255,255,255,0.72)',
                color: mappingSub === 'bank' ? '#065f46' : '#475569',
              }}>🏦 통장 매핑 ({mappingBanks.length})</button>
              <span style={{ flex: 1 }} />
              <button onClick={() => setEditMapping(mappingSub === 'card' ? { type: 'card' } : { type: 'bank' })} style={{
                padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: 'rgba(167,243,208,0.5)', color: '#065f46', border: '1px solid rgba(5,150,105,0.3)',
              }}>+ 추가</button>
              <label style={{
                padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: 'rgba(251,191,36,0.2)', color: '#92400e', border: '1px solid rgba(251,191,36,0.4)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                📤 엑셀 업로드
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  e.target.value = '' // reset
                  try {
                    const XLSX = await import('xlsx')
                    const buf = await file.arrayBuffer()
                    const wb = XLSX.read(buf, { type: 'array' })
                    const ws = wb.Sheets[wb.SheetNames[0]]
                    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
                    if (rows.length === 0) { alert('데이터가 없습니다.'); return }

                    // 컬럼 자동 감지
                    const keys = Object.keys(rows[0])
                    const isCard = mappingSub === 'card'

                    // 카드: 카드번호/별칭, 카드사, 소지자
                    // 통장: 계좌번호/별칭, 은행, 예금주, 용도
                    const findCol = (patterns: string[]) => keys.find(k => patterns.some(p => k.includes(p))) || ''

                    let items: any[] = []
                    if (isCard) {
                      const aliasCol = findCol(['카드번호', '카드', '별칭', 'card', 'number'])
                      const issuerCol = findCol(['카드사', '발급사', 'issuer', '사'])
                      const holderCol = findCol(['소지자', '이름', '성명', 'holder', '사용자'])
                      if (!aliasCol) { alert(`카드번호/별칭 컬럼을 찾을 수 없습니다.\n컬럼: ${keys.join(', ')}`); return }
                      items = rows.filter(r => r[aliasCol]).map(r => ({
                        type: 'card',
                        card_alias: String(r[aliasCol]).trim(),
                        card_issuer: issuerCol ? String(r[issuerCol]).trim() : '',
                        holder_name: holderCol ? String(r[holderCol]).trim() : '',
                      }))
                    } else {
                      const aliasCol = findCol(['계좌번호', '계좌', '별칭', 'account', 'number'])
                      const bankCol = findCol(['은행', 'bank', '은행명'])
                      const holderCol = findCol(['예금주', '이름', '성명', 'holder', '소유자'])
                      const purposeCol = findCol(['용도', 'purpose', '구분'])
                      if (!aliasCol) { alert(`계좌번호/별칭 컬럼을 찾을 수 없습니다.\n컬럼: ${keys.join(', ')}`); return }
                      items = rows.filter(r => r[aliasCol]).map(r => ({
                        type: 'bank',
                        account_alias: String(r[aliasCol]).trim(),
                        bank_issuer: bankCol ? String(r[bankCol]).trim() : '',
                        bank_name: bankCol ? String(r[bankCol]).trim() : '',
                        account_holder: holderCol ? String(r[holderCol]).trim() : '',
                        purpose: purposeCol ? String(r[purposeCol]).trim() : '',
                      }))
                    }

                    if (items.length === 0) { alert('유효한 데이터가 없습니다.'); return }
                    if (!confirm(`${isCard ? '카드' : '통장'} ${items.length}건을 등록하시겠습니까?\n\n예시: ${JSON.stringify(items[0]).slice(0, 120)}...`)) return

                    let ok = 0, fail = 0
                    for (const item of items) {
                      try {
                        await fetchWithAuth('/api/finance/mappings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) })
                        ok++
                      } catch { fail++ }
                    }
                    alert(`등록 완료: 성공 ${ok}건${fail > 0 ? `, 실패 ${fail}건` : ''}`)
                    loadMappings()
                  } catch (err: any) {
                    alert('엑셀 파싱 오류: ' + err.message)
                  }
                }} />
              </label>
            </div>

            {/* SMS에서 감지됐지만 미등록된 카드/계좌 알림 */}
            {/*   ※ 매칭 기준: card_alias 정확 일치 + last4 일치 OR previous_card_number 일치 */}
            {(() => {
              // 등록된 카드/계좌의 last4 추출 (card_number, card_alias, previous_card_number 모두)
              const extractLast4 = (s: string | null | undefined): string | null => {
                if (!s) return null
                const d = String(s).replace(/\D/g, '')
                return d.length >= 4 ? d.slice(-4) : null
              }
              const registeredLast4 = new Set<string>()
              const registeredAliases = new Set<string>()
              for (const c of mappingCards) {
                if (c.card_alias) registeredAliases.add(c.card_alias)
                const l1 = extractLast4(c.card_number); if (l1) registeredLast4.add(l1)
                const l2 = extractLast4(c.card_alias);  if (l2) registeredLast4.add(l2)
                const l3 = extractLast4((c as any).previous_card_number); if (l3) registeredLast4.add(l3)
              }
              for (const b of mappingBanks) {
                if (b.account_alias) registeredAliases.add(b.account_alias)
                const l = extractLast4(b.account_alias); if (l) registeredLast4.add(l)
              }

              // 미등록 = 별칭 정확 일치도 안 되고 last4 도 안 맞는 것
              const unregistered = smsAliases.filter((s: any) => {
                if (registeredAliases.has(s.card_alias)) return false
                const last4 = extractLast4(s.card_alias)
                if (last4 && registeredLast4.has(last4)) return false
                return true
              })
              if (unregistered.length === 0) return null
              return (
                <div style={{
                  padding: '10px 14px', marginBottom: 12, borderRadius: 10,
                  background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)',
                  fontSize: 12, color: '#92400e',
                }}>
                  ⚠ SMS에서 감지되었지만 미등록된 카드/계좌가 {unregistered.length}건 있습니다:
                  {unregistered.map((u: any) => (
                    <button key={u.card_alias} onClick={() => {
                      const isBank = (u.card_issuer || '').includes('BANK')
                      setMappingSub(isBank ? 'bank' : 'card')
                      setEditMapping(isBank
                        ? { type: 'bank', account_alias: u.card_alias, bank_issuer: u.card_issuer }
                        : { type: 'card', card_alias: u.card_alias, card_issuer: u.card_issuer })
                    }} style={{
                      marginLeft: 6, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: '#fff', border: '1px solid rgba(251,191,36,0.5)', cursor: 'pointer', color: '#92400e',
                    }}>{u.card_alias}</button>
                  ))}
                </div>
              )
            })()}

            {/* 카드 매핑 테이블 */}
            {mappingSub === 'card' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.08)' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>카드 별칭</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>카드사</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700 }}>상태</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700 }}>종류</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>소지자/부서</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700 }}>한도</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700 }}>결제일</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>배정 차량</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700 }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappingCards.map((c: any) => {
                      const statusBadge = c.status === 'canceled' ? { bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c', text: '🚫 해지' }
                                        : c.status === 'suspended' ? { bg: 'rgba(245,158,11,0.12)', fg: '#b45309', text: '⏸ 정지' }
                                        : { bg: 'rgba(34,197,94,0.12)', fg: '#15803d', text: '✓ 사용중' }
                      const typeColors: Record<string, string> = {
                        '법인신용': '#3b82f6', '법인체크': '#8b5cf6',
                        '하이패스': '#f59e0b', '주유': '#ef4444', '기타': '#94a3b8',
                      }
                      const typeColor = typeColors[c.card_type || '법인신용'] || '#94a3b8'
                      return (
                      <tr key={c.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', opacity: c.status === 'canceled' ? 0.6 : 1 }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                          {c.card_alias || c.card_number || '—'}
                          {c.card_holder_type === '기명' && <span style={{ marginLeft: 4, fontSize: 10, color: '#7c3aed' }}>(기명)</span>}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {c.card_issuer && <span style={{ padding: '2px 8px', borderRadius: 6, background: `${ISSUER_COLOR[c.card_issuer] || '#94a3b8'}22`, color: ISSUER_COLOR[c.card_issuer] || '#94a3b8', fontWeight: 700, fontSize: 11 }}>{ISSUER_LABEL[c.card_issuer] || c.card_issuer}</span>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 6, background: statusBadge.bg, color: statusBadge.fg, fontWeight: 700, fontSize: 11 }}>{statusBadge.text}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {c.card_type && <span style={{ padding: '2px 8px', borderRadius: 6, background: `${typeColor}22`, color: typeColor, fontWeight: 700, fontSize: 11 }}>{c.card_type}</span>}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>
                          {c.holder_name || '—'}
                          {c.department && <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>{c.department}</div>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace' }}>
                          {c.monthly_limit ? `${Number(c.monthly_limit).toLocaleString()}원` : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12 }}>
                          {c.payment_day ? `${c.payment_day}일` : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {c.car_number ? <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: '#1d4ed8', fontWeight: 600, fontSize: 11 }}>🚗 {c.car_number}</span> : <span style={{ color: '#94a3b8' }}>공용</span>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button onClick={() => setEditMapping({
                            type: 'card', id: c.id,
                            card_number: c.card_number,
                            card_alias: c.card_alias, card_issuer: c.card_issuer,
                            holder_name: c.holder_name, assigned_car_id: c.assigned_car_id,
                            assigned_employee_id: c.assigned_employee_id,
                            status: c.status || 'active',
                            card_type: c.card_type || '법인신용',
                            card_holder_type: c.card_holder_type || '무기명',
                            valid_thru: c.valid_thru || '',
                            issued_at: c.issued_at ? String(c.issued_at).slice(0,10) : '',
                            expires_at: c.expires_at ? String(c.expires_at).slice(0,10) : '',
                            payment_bank: c.payment_bank || '',
                            payment_account: c.payment_account || '',
                            payment_day: c.payment_day || '',
                            monthly_limit: c.monthly_limit || '',
                            previous_card_number: c.previous_card_number || '',
                            department: c.department || '',
                            memo: c.memo || '',
                          })} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(191,219,254,0.5)', border: '1px solid rgba(59,130,246,0.2)', color: '#1e40af', marginRight: 4 }}>수정</button>
                          <button onClick={() => deleteMapping(c.id, 'card')} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(254,202,202,0.5)', border: '1px solid rgba(239,68,68,0.2)', color: '#b91c1c' }}>삭제</button>
                        </td>
                      </tr>
                      )
                    })}
                    {mappingCards.length === 0 && <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>등록된 카드가 없습니다</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {/* 통장 매핑 테이블 */}
            {mappingSub === 'bank' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.08)' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>계좌 별칭</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>은행</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>예금주</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>배정 차량</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>용도</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700 }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappingBanks.map((b: any) => (
                      <tr key={b.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{b.account_alias}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 6, background: `${ISSUER_COLOR[b.bank_issuer] || '#059669'}22`, color: ISSUER_COLOR[b.bank_issuer] || '#059669', fontWeight: 700, fontSize: 11 }}>{ISSUER_LABEL[b.bank_issuer] || b.bank_name || b.bank_issuer}</span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>{b.account_holder || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {b.car_number ? <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: '#1d4ed8', fontWeight: 600, fontSize: 11 }}>🚗 {b.car_number}</span> : <span style={{ color: '#94a3b8' }}>공용</span>}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 11 }}>{b.purpose || '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button onClick={() => setEditMapping({
                            type: 'bank', id: b.id,
                            account_alias: b.account_alias,
                            account_number: b.account_number || '',
                            branch: b.branch || '',
                            bank_issuer: b.bank_issuer,
                            bank_name: b.bank_name,
                            account_holder: b.account_holder,
                            account_holder_phone: b.account_holder_phone || '',
                            assigned_car_id: b.assigned_car_id,
                            purpose: b.purpose,
                            memo: b.memo,
                          })} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(167,243,208,0.5)', border: '1px solid rgba(5,150,105,0.2)', color: '#065f46', marginRight: 4 }}>수정</button>
                          <button onClick={() => deleteMapping(b.id, 'bank')} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(254,202,202,0.5)', border: '1px solid rgba(239,68,68,0.2)', color: '#b91c1c' }}>삭제</button>
                        </td>
                      </tr>
                    ))}
                    {mappingBanks.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>등록된 통장이 없습니다</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ──── 분류 룰 탭 (Phase 3-C) ──── */}
        {activeTab === 'rules' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {(['all', 'system', 'user'] as const).map(f => (
                <button key={f} onClick={() => setRuleFilter(f)} style={{
                  padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${ruleFilter === f ? 'rgba(59,110,181,0.4)' : 'rgba(0,0,0,0.06)'}`,
                  background: ruleFilter === f ? 'rgba(191,219,254,0.5)' : 'rgba(255,255,255,0.72)',
                  color: ruleFilter === f ? '#1e40af' : '#475569',
                }}>{f === 'all' ? `전체 (${rules.length})` : f === 'system' ? `시스템 (${rules.filter(r => r.is_system === 1).length})` : `사용자 (${rules.filter(r => r.is_system === 0).length})`}</button>
              ))}
              <select
                value={ruleCategoryFilter}
                onChange={(e) => setRuleCategoryFilter(e.target.value)}
                style={{ ...GLASS.L1, padding: '6px 10px', borderRadius: 8, fontSize: 12, border: `1px solid ${COLORS.borderSubtle}` }}
              >
                <option value="">대분류 전체</option>
                {ruleCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                onClick={loadRules}
                disabled={rulesLoading}
                style={{ ...BTN.sm, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                         background: 'rgba(0,0,0,0.04)', color: COLORS.textSecondary, cursor: 'pointer' }}
              >🔄 새로고침</button>
              <span style={{ flex: 1 }} />
              <button onClick={() => setEditRule({ pattern: '', category: '', subcategory: '', match_car: 0, confidence: 'medium', tx_type: '' })} style={{
                padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: 'rgba(167,243,208,0.5)', color: '#065f46', border: '1px solid rgba(5,150,105,0.3)',
              }}>+ 룰 추가</button>
            </div>

            <div style={{ ...GLASS.L4, borderRadius: 12, padding: 14, overflow: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 1000 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.03)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: COLORS.textSecondary, width: 60 }}>출처</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: COLORS.textSecondary }}>키워드</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: COLORS.textSecondary }}>대분류</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: COLORS.textSecondary }}>소분류</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: COLORS.textSecondary, width: 80 }}>차량매칭</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: COLORS.textSecondary, width: 80 }}>신뢰도</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: COLORS.textSecondary, width: 80 }}>거래유형</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: COLORS.textSecondary, width: 90 }}>금액 한도</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: COLORS.textSecondary, width: 80 }}>활성</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600, color: COLORS.textSecondary, width: 110 }}>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRules.map(r => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${COLORS.borderSubtle}`, opacity: r.is_active ? 1 : 0.5 }}>
                      <td style={{ padding: '6px 10px' }}>
                        {r.is_system === 1
                          ? <span style={{ fontSize: 10, color: '#7c3aed', background: 'rgba(124,58,237,0.1)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>시스템</span>
                          : <span style={{ fontSize: 10, color: '#0891b2', background: 'rgba(8,145,178,0.1)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>사용자</span>}
                      </td>
                      <td style={{ padding: '6px 10px', fontWeight: 600, color: COLORS.textPrimary }}>{r.pattern}</td>
                      <td style={{ padding: '6px 10px', color: '#1e40af', fontWeight: 500 }}>{r.category}</td>
                      <td style={{ padding: '6px 10px', color: COLORS.textSecondary }}>{r.subcategory || '-'}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>{r.match_car ? '⭐' : '-'}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                                       color: r.confidence === 'high' ? '#15803d' : r.confidence === 'medium' ? '#b45309' : '#dc2626',
                                       background: r.confidence === 'high' ? 'rgba(34,197,94,0.1)' : r.confidence === 'medium' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)' }}>
                          {r.confidence}
                        </span>
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 11, color: COLORS.textSecondary }}>
                        {r.tx_type === 'income' ? '입금' : r.tx_type === 'expense' ? '출금' : '양쪽'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 11, color: COLORS.textSecondary }}>
                        {r.amount_max ? `≤${nf(Number(r.amount_max))}` : r.amount_min ? `≥${nf(Number(r.amount_min))}` : '-'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <button
                          onClick={() => toggleRuleActive(r.id, r.is_active)}
                          style={{ ...BTN.sm, padding: '3px 10px', fontSize: 10, fontWeight: 600,
                                   background: r.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.05)',
                                   color: r.is_active ? '#15803d' : '#64748b',
                                   border: `1px solid ${r.is_active ? 'rgba(34,197,94,0.3)' : 'rgba(0,0,0,0.1)'}`, cursor: 'pointer' }}
                        >{r.is_active ? '✓ 활성' : '○ 비활성'}</button>
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <button
                          onClick={() => setEditRule(r)}
                          style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                                   background: 'rgba(191,219,254,0.5)', border: '1px solid rgba(59,110,181,0.2)', color: '#1e40af', marginRight: 4 }}
                        >수정</button>
                        <button
                          onClick={() => deleteRule(r.id, r.is_system)}
                          disabled={r.is_system === 1}
                          style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11,
                                   cursor: r.is_system === 1 ? 'not-allowed' : 'pointer',
                                   background: r.is_system === 1 ? 'rgba(0,0,0,0.04)' : 'rgba(254,202,202,0.5)',
                                   border: `1px solid ${r.is_system === 1 ? 'rgba(0,0,0,0.06)' : 'rgba(239,68,68,0.2)'}`,
                                   color: r.is_system === 1 ? '#94a3b8' : '#b91c1c' }}
                        >삭제</button>
                      </td>
                    </tr>
                  ))}
                  {filteredRules.length === 0 && (
                    <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                      {rulesLoading ? '⏳ 로딩 중...' : '룰이 없습니다 — [+ 룰 추가] 클릭'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 룰 추가/수정 모달 */}
            {editRule && (
              <div onClick={() => setEditRule(null)} style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
              }}>
                <div onClick={(e) => e.stopPropagation()} style={{
                  ...GLASS.L4, borderRadius: 14, padding: 20, width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>
                    {editRule.id ? '✏️ 룰 수정' : '+ 룰 추가'}
                    {editRule.is_system === 1 && <span style={{ marginLeft: 8, fontSize: 11, color: '#7c3aed', fontWeight: 500 }}>(시스템 룰 — pattern/category 만 수정 권장)</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ gridColumn: 'span 2', fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                      키워드 (description LIKE) *
                      <input value={editRule.pattern || ''} onChange={(e) => setEditRule({ ...editRule, pattern: e.target.value })}
                        placeholder="예: GS칼텍스, 주유, 한국도로공사" style={{ ...GLASS.L1, width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${COLORS.borderSubtle}` }} />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                      대분류 *
                      <input value={editRule.category || ''} onChange={(e) => setEditRule({ ...editRule, category: e.target.value })}
                        placeholder="예: 차량비, 운영비" style={{ ...GLASS.L1, width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${COLORS.borderSubtle}` }} />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                      소분류
                      <input value={editRule.subcategory || ''} onChange={(e) => setEditRule({ ...editRule, subcategory: e.target.value })}
                        placeholder="예: 유류비, 통행료" style={{ ...GLASS.L1, width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${COLORS.borderSubtle}` }} />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                      신뢰도
                      <select value={editRule.confidence || 'medium'} onChange={(e) => setEditRule({ ...editRule, confidence: e.target.value })}
                        style={{ ...GLASS.L1, width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${COLORS.borderSubtle}` }}>
                        <option value="high">HIGH (확실 — 일괄 확정 후보)</option>
                        <option value="medium">MEDIUM (검수 권장)</option>
                        <option value="low">LOW (수동/AI 검수)</option>
                      </select>
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                      거래 유형
                      <select value={editRule.tx_type || ''} onChange={(e) => setEditRule({ ...editRule, tx_type: e.target.value })}
                        style={{ ...GLASS.L1, width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${COLORS.borderSubtle}` }}>
                        <option value="">양쪽 (수입/지출)</option>
                        <option value="expense">지출만</option>
                        <option value="income">수입만</option>
                      </select>
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={!!editRule.match_car} onChange={(e) => setEditRule({ ...editRule, match_car: e.target.checked ? 1 : 0 })} />
                      ⭐ 카드 holder 의 차량 자동 매칭 (related_type=&apos;car&apos;)
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                      금액 상한 (선택)
                      <input type="number" value={editRule.amount_max || ''} onChange={(e) => setEditRule({ ...editRule, amount_max: e.target.value })}
                        placeholder="예: 30000 (이하만 매칭)" style={{ ...GLASS.L1, width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${COLORS.borderSubtle}` }} />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                      금액 하한 (선택)
                      <input type="number" value={editRule.amount_min || ''} onChange={(e) => setEditRule({ ...editRule, amount_min: e.target.value })}
                        placeholder="예: 100000 (이상만 매칭)" style={{ ...GLASS.L1, width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${COLORS.borderSubtle}` }} />
                    </label>
                    <label style={{ gridColumn: 'span 2', fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                      메모
                      <input value={editRule.notes || ''} onChange={(e) => setEditRule({ ...editRule, notes: e.target.value })}
                        placeholder="이 룰의 사용 사유 / 주의사항" style={{ ...GLASS.L1, width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${COLORS.borderSubtle}` }} />
                    </label>
                  </div>
                  <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={() => setEditRule(null)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: 'rgba(0,0,0,0.04)', color: COLORS.textSecondary, border: `1px solid ${COLORS.borderSubtle}` }}>취소</button>
                    <button onClick={() => saveRule(editRule)} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: 'rgba(34,197,94,0.18)', color: '#15803d', border: '1px solid rgba(34,197,94,0.4)' }}>{editRule.id ? '수정 저장' : '추가'}</button>
                  </div>
                </div>
              </div>
            )}
          </>
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
                      background: i === currentFileIndex ? COLORS.primary : 'rgba(255,255,255,0.6)',
                      color: i === currentFileIndex ? '#fff' : COLORS.textSecondary,
                      fontWeight: i === currentFileIndex ? 600 : 400,
                    }}
                  >
                    {f.name} ({f.rows.length}행)
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
              <strong>원본:</strong> {fmtDate(splitTarget.transaction_date)} · {splitTarget.description} · {splitTarget.client_name || '-'} · {splitTarget.type === 'income' ? '+' : '-'}{nf(splitTarget.amount)}원
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
