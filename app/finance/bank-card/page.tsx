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

type TabKey = 'bank' | 'card' | 'matching' | 'settlement'

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
  match: {
    type: 'settlement' | 'contract'
    id: string
    name: string
    amount: number
    month?: string
    contractType?: string
  }
  score: number
  autoConfirm: boolean
}

interface Summary {
  transactions: { total: number; bank: number; card: number; matched: number; unmatched: number; totalIncome: number; totalExpense: number }
  settlement: { total: number; linked: number; unlinked: number; totalAmount: number }
  sms: { total: number; linked: number; unlinked: number }
}

// ─── 헬퍼 ───────────────────────────────────────────────

const nf = (n: number) => n ? Math.abs(n).toLocaleString() : '0'
const fmtDate = (d: string | null) => {
  if (!d) return '-'
  const s = String(d).replace('T', ' ').slice(0, 10)
  return s
}

// 엑셀 컬럼 자동 인식
const BANK_COL_PATTERNS: Record<string, string[]> = {
  date: ['거래일', '거래일자', '일자', 'date', '날짜'],
  description: ['적요', '거래내용', '내용', '메모', 'description', '비고'],
  deposit: ['입금', '입금액', '입금금액', 'credit', 'deposit', '입금(원)'],
  withdrawal: ['출금', '출금액', '출금금액', 'debit', 'withdrawal', '출금(원)', '지급액'],
  balance: ['잔액', '거래후잔액', 'balance', '잔액(원)'],
  counterpart: ['거래처', '상대방', '이체인', 'payee', '보내는분', '받는분'],
}

const CARD_COL_PATTERNS: Record<string, string[]> = {
  date: ['이용일', '이용일자', '거래일', '승인일', 'date'],
  merchant: ['가맹점', '이용가맹점', '이용처', 'merchant', '가맹점명'],
  amount: ['이용금액', '금액', '승인금액', 'amount', '이용금액(원)'],
  cardCompany: ['카드사', '카드명', 'card', '카드종류'],
  cardNumber: ['카드번호', 'card_number', '카드번호(뒷4자리)'],
  holder: ['사용자', '소지자', '이름', 'holder'],
}

function matchColumn(header: string, patterns: Record<string, string[]>): string | null {
  const h = header.replace(/\s/g, '').toLowerCase()
  for (const [key, pats] of Object.entries(patterns)) {
    if (pats.some(p => h.includes(p.replace(/\s/g, '').toLowerCase()))) return key
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
  const [uploadResult, setUploadResult] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 매칭 모달
  const [showMatchModal, setShowMatchModal] = useState(false)
  const [matchCandidates, setMatchCandidates] = useState<any[]>([])
  const [matchTarget, setMatchTarget] = useState<any>(null)

  // 자동매칭 진행
  const [matching, setMatching] = useState(false)
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set())

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

  useEffect(() => {
    setLoading(true)
    Promise.all([loadSummary(), loadTransactions(), loadSettlements()])
      .finally(() => setLoading(false))
  }, [loadSummary, loadTransactions, loadSettlements])

  // ─── 필터링 ──────────────────────────────────────────

  const bankTransactions = useMemo(() => {
    let data = transactions.filter(t =>
      t.imported_from === 'excel_bank' || t.bank_name || (!t.card_company && !t.imported_from?.includes('card') && !t.imported_from?.includes('sms'))
    )
    if (bankFilter === 'income') data = data.filter(t => t.type === 'income')
    else if (bankFilter === 'expense') data = data.filter(t => t.type === 'expense')
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(t =>
        (t.description || '').toLowerCase().includes(q) ||
        (t.client_name || '').toLowerCase().includes(q) ||
        (t.bank_name || '').toLowerCase().includes(q)
      )
    }
    return data
  }, [transactions, bankFilter, search])

  const cardTransactions = useMemo(() => {
    let data = transactions.filter(t =>
      t.imported_from === 'excel_card' || t.imported_from === 'sms' || t.card_company
    )
    if (cardFilter !== 'all') {
      const q = cardFilter.toLowerCase()
      data = data.filter(t => (t.card_company || '').toLowerCase().includes(q))
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
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFileName(file.name)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = ev.target?.result
      const wb = XLSX.read(data, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (rows.length === 0) return

      // 컬럼 자동 매핑
      const headers = Object.keys(rows[0])
      const patterns = uploadSource === 'excel_bank' ? BANK_COL_PATTERNS : CARD_COL_PATTERNS
      const mapping: Record<string, string> = {}
      for (const h of headers) {
        const matched = matchColumn(h, patterns)
        if (matched) mapping[h] = matched
      }

      setUploadColumns(mapping)
      setUploadPreview(rows.slice(0, 50))
      setUploadResult(null)
    }
    reader.readAsBinaryString(file)
  }

  const handleUpload = async () => {
    if (uploadPreview.length === 0) return
    setUploading(true)

    const isBankSource = uploadSource === 'excel_bank'
    const reverse: Record<string, string> = {}
    for (const [header, field] of Object.entries(uploadColumns)) {
      reverse[field] = header
    }

    const mapped = uploadPreview.map(row => {
      if (isBankSource) {
        const deposit = safeNum(row[reverse.deposit])
        const withdrawal = safeNum(row[reverse.withdrawal])
        return {
          date: row[reverse.date] || '',
          description: row[reverse.description] || '',
          deposit: deposit || undefined,
          withdrawal: withdrawal || undefined,
          amount: deposit || withdrawal,
          type: deposit ? 'income' : 'expense',
          balance: safeNum(row[reverse.balance]) || undefined,
          counterpart: row[reverse.counterpart] || '',
          bank_name: '은행',
        }
      } else {
        return {
          date: row[reverse.date] || '',
          description: row[reverse.merchant] || '',
          amount: safeNum(row[reverse.amount]),
          type: 'expense',
          card_company: row[reverse.cardCompany] || '',
          client_name: row[reverse.holder] || '',
        }
      }
    })

    const batchId = `${uploadSource}_${Date.now()}`
    const { json } = await fetchWithAuth('/api/finance/transactions/import', {
      method: 'POST',
      body: { rows: mapped, source: uploadSource, batchId },
    })

    setUploadResult(json?.data || json)
    setUploading(false)

    // 리로드
    await Promise.all([loadSummary(), loadTransactions()])
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
    { key: 'matching', label: '자동매칭', count: summary?.transactions.unmatched },
    { key: 'settlement', label: '정산 연결', count: summary?.settlement.total },
  ]

  // ── 통계 카드 ─────────────────────────────────────────

  const stats: StatItem[] = summary ? [
    { label: '전체 거래', value: nf(summary.transactions.total), tint: 'blue', icon: '📊' },
    { label: '통장', value: nf(summary.transactions.bank), tint: 'green', icon: '🏦' },
    { label: '카드', value: nf(summary.transactions.card), tint: 'purple', icon: '💳' },
    { label: '매칭완료', value: nf(summary.transactions.matched), tint: 'green', icon: '✓',
      subValue: summary.transactions.total > 0 ? `${Math.round(summary.transactions.matched / summary.transactions.total * 100)}%` : '0%', subTone: 'up' as const },
    { label: '미매칭', value: nf(summary.transactions.unmatched), tint: 'amber', icon: '⚠' },
  ] : []

  // ── 통장 거래 탭 ──────────────────────────────────────

  const bankColumns: TableColumn<Transaction>[] = [
    { key: 'date', label: '날짜', width: 100, render: (r) => <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{fmtDate(r.transaction_date)}</span> },
    { key: 'desc', label: '적요', render: (r) => <span style={{ fontSize: 13, fontWeight: 500 }}>{r.description || '-'}</span> },
    { key: 'counterpart', label: '거래처', width: 120, render: (r) => <span style={{ fontSize: 13 }}>{r.client_name || '-'}</span>, hideOnMobile: true },
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
    { key: 'status', label: '상태', width: 80, align: 'center', render: (r) =>
      <MatchBadge matched={!!r.related_type && !!r.related_id} />
    },
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
    { key: 'company', label: '카드사', width: 80, render: (r) => <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.primary }}>{r.card_company || '-'}</span> },
    { key: 'merchant', label: '가맹점', render: (r) => <span style={{ fontSize: 13, fontWeight: 500 }}>{r.description || '-'}</span> },
    { key: 'amount', label: '금액', width: 110, align: 'right', render: (r) =>
      <span style={{ fontWeight: 600, fontSize: 13, color: COLORS.expense }}>{nf(r.amount)}원</span>
    },
    { key: 'user', label: '사용자', width: 100, render: (r) => <span style={{ fontSize: 12 }}>{r.client_name || '-'}</span>, hideOnMobile: true },
    { key: 'source', label: '출처', width: 70, align: 'center', render: (r) =>
      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: r.imported_from === 'sms' ? COLORS.bgGreen : COLORS.bgBlue, color: r.imported_from === 'sms' ? COLORS.success : COLORS.info }}>
        {r.imported_from === 'sms' ? 'SMS' : '엑셀'}
      </span>,
      hideOnMobile: true
    },
    { key: 'status', label: '상태', width: 80, align: 'center', render: (r) =>
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
    { key: 'match', label: '매칭 대상', render: (r) => (
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{r.match.name || '-'}</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted }}>
          {r.match.type === 'settlement' ? '정산' : '계약'} · {nf(r.match.amount)}원
          {r.match.month ? ` · ${r.match.month}` : ''}
        </div>
      </div>
    )},
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
    { key: 'status', label: '상태', width: 80, align: 'center', render: (r) => {
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
                { key: 'all', label: '전체', count: transactions.filter(t => !t.card_company && !t.imported_from?.includes('card')).length },
                { key: 'income', label: '입금' },
                { key: 'expense', label: '출금' },
              ]}
              activeFilter={bankFilter}
              onFilterChange={setBankFilter}
              trailing={
                <button
                  onClick={() => { setUploadSource('excel_bank'); setShowUpload(true); setUploadPreview([]); setUploadResult(null) }}
                  style={{ ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  📤 엑셀 업로드
                </button>
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
                    onClick={() => { setUploadSource('excel_card'); setShowUpload(true); setUploadPreview([]); setUploadResult(null) }}
                    style={{ ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    📤 엑셀 업로드
                  </button>
                  <button
                    onClick={linkSmsCards}
                    style={{ ...BTN.sm, background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    📱 SMS 연결
                  </button>
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

        {/* ──── 자동매칭 탭 ──── */}
        {activeTab === 'matching' && (
          <>
            {/* 매칭 제어판 */}
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
                    미매칭 거래: {nf(summary?.transactions.unmatched || 0)}건
                    <span style={{ marginLeft: 12, color: COLORS.textSecondary, fontWeight: 400 }}>
                      매칭률: {summary?.transactions.total ? Math.round((summary.transactions.matched / summary.transactions.total) * 100) : 0}%
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                    매칭 기준: 금액(±5%) + 날짜(±7일) + 이름(포함검사) — 가중합 50% 이상
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => runAutoMatch(false)}
                    disabled={matching}
                    style={{
                      ...BTN.md,
                      background: matching ? COLORS.textMuted : COLORS.primary,
                      color: '#fff', border: 'none', cursor: matching ? 'wait' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {matching ? '분석 중...' : '🔄 자동매칭 실행'}
                  </button>
                  {matchResults.length > 0 && (
                    <button
                      onClick={() => runAutoMatch(true)}
                      disabled={matching}
                      style={{
                        ...BTN.md,
                        background: COLORS.success, color: '#fff', border: 'none', cursor: 'pointer',
                      }}
                    >
                      ⚡ 75%+ 일괄 확인
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 매칭 결과 */}
            {matchResults.length > 0 && (
              <>
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

            {matchResults.length === 0 && !matching && (
              <div style={{
                textAlign: 'center', padding: '60px 20px',
                color: COLORS.textMuted, fontSize: 14,
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
                <div>[자동매칭 실행] 버튼을 클릭하여 매칭을 시작하세요</div>
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  미매칭 {nf(summary?.transactions.unmatched || 0)}건의 거래를 정산/계약과 자동 연결합니다
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
      </div>

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
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileSelect} />
              <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
              <div style={{ fontSize: 13, color: COLORS.textSecondary }}>
                {uploadFileName ? uploadFileName : '클릭하여 엑셀 파일 선택 (.xlsx, .xls, .csv)'}
              </div>
            </div>

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
              </div>
            )}

            {/* 미리보기 */}
            {uploadPreview.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  미리보기 ({uploadPreview.length}행)
                </div>
                <div style={{ overflowX: 'auto', maxHeight: 200, borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}` }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.03)' }}>
                        {Object.keys(uploadPreview[0]).slice(0, 6).map(h => (
                          <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, borderBottom: `1px solid ${COLORS.borderSubtle}` }}>
                            {h}
                            {uploadColumns[h] && <span style={{ color: COLORS.success, marginLeft: 4 }}>({uploadColumns[h]})</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadPreview.slice(0, 10).map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                          {Object.values(row).slice(0, 6).map((val: any, j) => (
                            <td key={j} style={{ padding: '4px 8px' }}>{String(val || '')}</td>
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
                  ✅ {uploadResult.inserted}건 저장 완료 / {uploadResult.skipped}건 중복 스킵
                </div>
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
              {uploadPreview.length > 0 && !uploadResult && (
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  style={{
                    ...BTN.md,
                    background: uploading ? COLORS.textMuted : COLORS.primary,
                    color: '#fff', border: 'none', cursor: uploading ? 'wait' : 'pointer',
                  }}
                >
                  {uploading ? '저장 중...' : `${uploadPreview.length}건 저장`}
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
    </div>
  )
}
