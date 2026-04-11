'use client'
import { useApp } from '../context/AppContext'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import NeuStatCards, { StatCardItem } from '../components/NeuStatCards'
import NeuSearchBar from '../components/NeuSearchBar'
import NeuFilterTabs, { FilterTab } from '../components/NeuFilterTabs'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../components/NeuDataTable'

// ─────────────────────────────────────────────
// Auth helper (fetch-based API calls)
// ─────────────────────────────────────────────
async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/auth-client')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────
interface Customer {
  id: number
  name: string
  phone: string
  email: string
  type: '개인' | '법인' | '외국인'
  memo: string
  // 개인
  birth_date: string
  license_number: string
  license_type: string
  license_expiry: string
  address: string
  address_detail: string
  // 법인
  business_number: string
  ceo_name: string
  business_type: string
  business_category: string
  business_address: string
  business_address_detail: string
  contact_person: string
  contact_phone: string
  contact_email: string
  // 세금계산서
  tax_email: string
  tax_type: string
  // 외국인
  passport_number: string
  nationality: string
  intl_license: string
  // 관리
  grade: string
  tags: string[]
  created_at: string
  updated_at: string
}

interface Payment {
  id: number
  customer_id: number
  contract_id: number | null
  amount: number
  payment_type: string
  payment_method: string
  status: string
  description: string
  due_date: string
  paid_date: string
  receipt_number: string
  created_at: string
}

interface Note {
  id: number
  customer_id: number
  author_name: string
  note_type: string
  content: string
  created_at: string
}

interface TaxInvoice {
  id: number
  customer_id: number
  contract_id: number | null
  invoice_number: string
  issue_date: string
  supply_amount: number
  tax_amount: number
  total_amount: number
  description: string
  status: string
  sent_to_email: string
  created_at: string
}

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────
const CUSTOMER_TYPES = ['전체', '개인', '법인', '외국인'] as const
const GRADES = ['일반', '우수', 'VIP', '주의'] as const
const GRADE_COLORS: Record<string, string> = {
  'VIP': 'bg-amber-900/30 text-amber-400 border-amber-700/40',
  '우수': 'bg-blue-900/30 text-blue-400 border-blue-700/40',
  '일반': 'bg-gray-50 text-slate-400 border-black/[0.06]',
  '주의': 'bg-red-900/30 text-red-400 border-red-700/40',
}
const TYPE_COLORS: Record<string, string> = {
  '개인': 'bg-emerald-500',
  '법인': 'bg-steel-600',
  '외국인': 'bg-violet-500',
}
const LICENSE_TYPES = ['1종대형', '1종보통', '1종소형', '2종보통', '2종소형', '원동기'] as const
const NOTE_TYPES = ['일반', '상담', '클레임', '정비요청', '사고접수'] as const
const NOTE_TYPE_COLORS: Record<string, string> = {
  '일반': 'bg-gray-50 text-slate-400',
  '상담': 'bg-blue-900/30 text-blue-400',
  '클레임': 'bg-red-900/30 text-red-400',
  '정비요청': 'bg-amber-900/30 text-amber-400',
  '사고접수': 'bg-orange-900/30 text-orange-400',
}
const PAYMENT_STATUS_COLORS: Record<string, string> = {
  '결제완료': 'bg-emerald-900/30 text-emerald-400',
  '미결제': 'bg-red-900/30 text-red-400',
  '부분결제': 'bg-amber-900/30 text-amber-400',
  '환불': 'bg-gray-50 text-slate-400',
}

const EMPTY_FORM: Partial<Customer> = {
  name: '', phone: '', email: '', type: '개인', memo: '',
  birth_date: '', license_number: '', license_type: '', license_expiry: '', address: '', address_detail: '',
  business_number: '', ceo_name: '', business_type: '', business_category: '',
  business_address: '', business_address_detail: '', contact_person: '', contact_phone: '', contact_email: '',
  tax_email: '', tax_type: '미발행',
  passport_number: '', nationality: '', intl_license: '',
  grade: '일반', tags: [],
}

// ─────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────
function getInitial(name: string) {
  if (!name) return '?'
  const clean = name.replace(/^\(.*?\)\s*/, '').trim()
  return (clean || name).substring(0, 1)
}
function formatPhone(p: string) {
  if (!p) return ''
  const n = p.replace(/[^0-9]/g, '')
  if (n.length === 11) return `${n.slice(0,3)}-${n.slice(3,7)}-${n.slice(7)}`
  if (n.length === 10) return `${n.slice(0,3)}-${n.slice(3,6)}-${n.slice(6)}`
  return p
}
function formatBizNo(b: string) {
  if (!b) return ''
  const n = b.replace(/[^0-9]/g, '')
  if (n.length === 10) return `${n.slice(0,3)}-${n.slice(3,5)}-${n.slice(5)}`
  return b
}
function formatMoney(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n)
}
function daysSince(d: string) {
  if (!d) return 0
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────
export default function CustomerPage() {
  const router = useRouter()
  const { company, role, adminSelectedCompanyId, user } = useApp()

  // 목록 상태
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('전체')
  const [gradeFilter, setGradeFilter] = useState<string>('')
  const [sortBy, setSortBy] = useState<'latest' | 'name' | 'grade'>('latest')

  // 상세/편집 상태
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [detailTab, setDetailTab] = useState<'info' | 'contracts' | 'payments' | 'invoices' | 'notes'>('info')
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Customer>>(EMPTY_FORM)

  // 신규 등록 모달
  const [showNewModal, setShowNewModal] = useState(false)
  const [newForm, setNewForm] = useState<Partial<Customer>>({ ...EMPTY_FORM })

  // 상세 탭 데이터
  const [payments, setPayments] = useState<Payment[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [taxInvoices, setTaxInvoices] = useState<TaxInvoice[]>([])
  const [contracts, setContracts] = useState<any[]>([])

  // 메모 입력
  const [newNote, setNewNote] = useState('')
  const [newNoteType, setNewNoteType] = useState('일반')

  // 결제 입력
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    amount: '', payment_type: 'charge', payment_method: '카드',
    description: '', due_date: '', status: '미결제'
  })

  // 세금계산서 입력
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({
    issue_date: new Date().toISOString().split('T')[0],
    supply_amount: '', tax_amount: '', description: ''
  })

  // ── 고객 목록 조회 ──
  const fetchCustomers = useCallback(async () => {
    if (!company && role !== 'admin') { setLoading(false); return }
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/customers', { headers })
      const json = await res.json()
      if (json.error) { alert(json.error); return }
      setCustomers((json.data as Customer[]) || [])
    } catch (err) {
      console.error('fetchCustomers error:', err)
    }
    setLoading(false)
  }, [company, role])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  // ── 상세 데이터 조회 ──
  const fetchDetailData = useCallback(async (customerId: number) => {
    try {
      const headers = await getAuthHeader()

      // 결제 이력
      const payRes = await fetch(`/api/customers/${customerId}/payments`, { headers })
      const payJson = await payRes.json()
      setPayments((payJson.data as Payment[]) || [])

      // 메모 이력
      const noteRes = await fetch(`/api/customers/${customerId}/notes`, { headers })
      const noteJson = await noteRes.json()
      setNotes((noteJson.data as Note[]) || [])

      // 세금계산서 이력
      const invRes = await fetch(`/api/customers/${customerId}/tax-invoices`, { headers })
      const invJson = await invRes.json()
      setTaxInvoices((invJson.data as TaxInvoice[]) || [])
    } catch (err) {
      console.error('fetchDetailData error:', err)
    }
  }, [])

  // ── 고객 생성 ──
  const handleCreateCustomer = async () => {
    if (!newForm.name?.trim()) return alert('고객명은 필수입니다.')
    const payload = sanitizePayload(newForm)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await res.json()
      if (json.error) { alert('생성 실패: ' + json.error); return }
      setShowNewModal(false)
      setNewForm({ ...EMPTY_FORM })
      fetchCustomers()
    } catch (err) {
      alert('생성 실패: ' + err)
    }
  }

  // ── 고객 수정 ──
  const handleUpdateCustomer = async () => {
    if (!selectedCustomer || !editForm.name?.trim()) return alert('고객명은 필수입니다.')
    const raw: any = { ...editForm, updated_at: new Date().toISOString() }
    Object.keys(raw).forEach(k => { if (raw[k] === '') raw[k] = null })
    raw.name = editForm.name
    const payload = sanitizePayload(raw)

    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/customers/${selectedCustomer.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await res.json()
      if (json.error) { alert('수정 실패: ' + json.error); return }
      setIsEditing(false)
      fetchCustomers()
      setSelectedCustomer({ ...selectedCustomer, ...payload } as Customer)
    } catch (err) {
      alert('수정 실패: ' + err)
    }
  }

  // ── 고객 삭제 ──
  const handleDeleteCustomer = async (id: number) => {
    if (!confirm('이 고객의 모든 데이터(결제/메모/계산서 이력 포함)가 삭제됩니다.\n정말 삭제하시겠습니까?')) return
    try {
      const headers = await getAuthHeader()
      await fetch(`/api/customers/${id}`, {
        method: 'DELETE',
        headers
      })
      setSelectedCustomer(null)
      fetchCustomers()
    } catch (err) {
      alert('삭제 실패: ' + err)
    }
  }

  // ── 상담메모 추가 ──
  const handleAddNote = async () => {
    if (!selectedCustomer || !newNote.trim()) return
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/customers/${selectedCustomer.id}/notes`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_name: user?.user_metadata?.name || user?.email || '시스템',
          note_type: newNoteType,
          content: newNote,
        })
      })
      const json = await res.json()
      if (json.error) { alert('메모 저장 실패: ' + json.error); return }
      setNewNote('')
      fetchDetailData(selectedCustomer.id)
    } catch (err) {
      alert('메모 저장 실패: ' + err)
    }
  }

  // ── 결제 추가 ──
  const handleAddPayment = async () => {
    if (!selectedCustomer || !paymentForm.amount) return alert('금액을 입력해주세요.')
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/customers/${selectedCustomer.id}/payments`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(paymentForm.amount),
          payment_type: paymentForm.payment_type,
          payment_method: paymentForm.payment_method,
          description: paymentForm.description || null,
          due_date: paymentForm.due_date || null,
          status: paymentForm.status,
        })
      })
      const json = await res.json()
      if (json.error) { alert('결제 저장 실패: ' + json.error); return }
      setShowPaymentForm(false)
      setPaymentForm({ amount: '', payment_type: 'charge', payment_method: '카드', description: '', due_date: '', status: '미결제' })
      fetchDetailData(selectedCustomer.id)
    } catch (err) {
      alert('결제 저장 실패: ' + err)
    }
  }

  // ── 세금계산서 추가 ──
  const handleAddInvoice = async () => {
    if (!selectedCustomer || !invoiceForm.supply_amount) return alert('공급가액을 입력해주세요.')
    const supply = Number(invoiceForm.supply_amount)
    const tax = invoiceForm.tax_amount ? Number(invoiceForm.tax_amount) : Math.round(supply * 0.1)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/customers/${selectedCustomer.id}/tax-invoices`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue_date: invoiceForm.issue_date,
          supply_amount: supply,
          tax_amount: tax,
          total_amount: supply + tax,
          description: invoiceForm.description || null,
          status: '발행',
          sent_to_email: selectedCustomer.tax_email || selectedCustomer.email || null,
        })
      })
      const json = await res.json()
      if (json.error) { alert('계산서 저장 실패: ' + json.error); return }
      setShowInvoiceForm(false)
      setInvoiceForm({ issue_date: new Date().toISOString().split('T')[0], supply_amount: '', tax_amount: '', description: '' })
      fetchDetailData(selectedCustomer.id)
    } catch (err) {
      alert('계산서 저장 실패: ' + err)
    }
  }

  // ── 고객 선택 ──
  const handleSelectCustomer = (cust: Customer) => {
    setSelectedCustomer(cust)
    setDetailTab('info')
    setIsEditing(false)
    setEditForm({ ...cust })
    fetchDetailData(cust.id)
  }

  // ── 미수금 계산 ──
  const getUnpaidAmount = useCallback(() => {
    return payments
      .filter(p => p.payment_type === 'charge' && p.status !== '결제완료' && p.status !== '환불')
      .reduce((sum, p) => sum + Number(p.amount), 0)
  }, [payments])

  // ── 다음 주소검색 ──
  const openAddressSearch = useCallback((addressKey: string, form: any, setForm: (v: any) => void) => {
    const script = document.createElement('script')
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
    script.onload = () => {
      new (window as any).daum.Postcode({
        oncomplete: (data: any) => {
          const addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress
          const extra = data.buildingName ? ` (${data.buildingName})` : ''
          setForm({ ...form, [addressKey]: addr + extra })
        },
      }).open()
    }
    if ((window as any).daum?.Postcode) {
      new (window as any).daum.Postcode({
        oncomplete: (data: any) => {
          const addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress
          const extra = data.buildingName ? ` (${data.buildingName})` : ''
          setForm({ ...form, [addressKey]: addr + extra })
        },
      }).open()
      return
    }
    document.head.appendChild(script)
  }, [])

  // ── 주소 필드 렌더링 ──
  const renderAddressField = (label: string, key: string, detailKey: string, form: any, setForm: (v: any) => void, disabled: boolean) => (
    <div>
      <label className="text-[11px] font-bold text-slate-400 mb-1 block">{label}</label>
      <div className="flex gap-2">
        <input
          className="flex-1 px-3 py-2.5 border border-black/[0.06] rounded-xl text-sm bg-gray-50 text-slate-600 outline-none disabled:text-slate-500"
          placeholder="주소 검색을 눌러주세요"
          value={form[key] || ''}
          readOnly
          disabled={disabled}
        />
        {!disabled && (
          <button
            type="button"
            onClick={() => openAddressSearch(key, form, setForm)}
            className="px-3 py-2.5 bg-gray-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-white/15 transition-colors whitespace-nowrap border border-black/[0.06]">
            🔍 검색
          </button>
        )}
      </div>
      <input
        className="w-full mt-2 px-3 py-2.5 border border-black/[0.06] rounded-xl text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 outline-none transition-colors disabled:bg-gray-50 disabled:text-slate-400"
        placeholder="상세주소 입력 (동/호수 등)"
        value={form[detailKey] || ''}
        onChange={e => setForm({ ...form, [detailKey]: e.target.value })}
        disabled={disabled}
      />
    </div>
  )

  // ─────────────────────────────────────────────
  // 렌더링: 입력 필드 헬퍼
  // ─────────────────────────────────────────────
  const renderField = (label: string, key: string, form: any, setForm: (v: any) => void, opts?: any) => (
    <div>
      <label className="text-[11px] font-bold text-slate-400 mb-1 block">{label}</label>
      <input
        className="w-full px-3 py-2.5 border border-black/[0.06] rounded-xl text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 outline-none transition-colors disabled:bg-gray-50 disabled:text-slate-400"
        value={form[key] || ''}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        disabled={opts?.disabled}
        placeholder={opts?.placeholder}
        type={opts?.type || 'text'}
      />
    </div>
  )

  const renderSelectField = (label: string, key: string, options: string[], form: any, setForm: (v: any) => void, opts?: any) => (
    <div>
      <label className="text-[11px] font-bold text-slate-400 mb-1 block">{label}</label>
      <select
        className="w-full px-3 py-2.5 border border-black/[0.06] rounded-xl text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 outline-none transition-colors disabled:bg-gray-50 disabled:text-slate-400"
        value={form[key] || ''}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        disabled={opts?.disabled}
      >
        <option value="">선택</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  // ─────────────────────────────────────────────
  // 필터링 및 정렬
  // ─────────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    let result = customers
      .filter(c => {
        const typeMatch = typeFilter === '전체' || c.type === typeFilter
        const gradeMatch = !gradeFilter || c.grade === gradeFilter
        const searchLower = searchQuery.toLowerCase()
        const searchMatch = !searchQuery || [
          c.name, c.phone, c.email, c.business_number,
          c.contact_person, c.contact_phone, c.contact_email
        ].some(f => (f || '').toLowerCase().includes(searchLower))
        return typeMatch && gradeMatch && searchMatch
      })

    if (sortBy === 'name') result.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else if (sortBy === 'grade') result.sort((a, b) => {
      const gradeOrder: Record<string, number> = { 'VIP': 0, '우수': 1, '일반': 2, '주의': 3 }
      return (gradeOrder[a.grade] || 99) - (gradeOrder[b.grade] || 99)
    })
    else result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return result
  }, [customers, typeFilter, gradeFilter, searchQuery, sortBy])

  // ──통계──
  const stats = useMemo(() => ({
    total: customers.length,
    personal: customers.filter(c => c.type === '개인').length,
    corporate: customers.filter(c => c.type === '법인').length,
    foreign: customers.filter(c => c.type === '외국인').length,
    vip: customers.filter(c => c.grade === 'VIP').length,
  }), [customers])

  // ── 페이로드 정제 ──
  function sanitizePayload(obj: any): any {
    const result: any = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'tags' && Array.isArray(v)) result[k] = v.filter(t => t)
      else if (v !== '' && v !== null && v !== undefined) result[k] = v
    }
    return result
  }

  // ── Stat Cards ──
  const statItems: StatCardItem[] = [
    { key: 'total', label: '전체', value: stats.total, icon: '👥', color: 'blue' },
    { key: 'personal', label: '개인', value: stats.personal, icon: '👤', color: 'blue' },
    { key: 'corporate', label: '법인', value: stats.corporate, icon: '🏢', color: 'green' },
    { key: 'foreign', label: '외국인', value: stats.foreign, icon: '🌐', color: 'purple' },
    { key: 'vip', label: 'VIP', value: stats.vip, icon: '⭐', color: 'amber' },
  ]

  // ── Filter Tabs ──
  const filterTabs: FilterTab[] = [
    { key: 'all', label: '모두', count: filteredCustomers.length },
  ]

  // ── 데이터 테이블 컬럼 ──
  const columns: TableColumn<Customer>[] = [
    {
      key: 'name',
      label: '고객명',
      render: (c) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg, #3b6eb5, #5a8fd4)`,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13
          }}>
            {getInitial(c.name)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#0f2440' }}>{c.name}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              <span className={`si-badge ${TYPE_COLORS[c.type]}`}>{c.type}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      label: '연락처',
      render: (c) => (
        <div>
          <div style={{ fontSize: 13, color: '#1e293b' }}>{formatPhone(c.phone)}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{c.email}</div>
        </div>
      ),
    },
    {
      key: 'grade',
      label: '등급',
      align: 'center',
      render: (c) => (
        <span className={`si-badge ${GRADE_COLORS[c.grade]}`}>{c.grade}</span>
      ),
    },
    {
      key: 'unpaid',
      label: '미수금',
      align: 'right',
      render: () => {
        const unpaid = getUnpaidAmount()
        return (
          <span style={{ fontWeight: 700, fontSize: 13, color: unpaid > 0 ? '#dc2626' : '#1e293b' }}>
            {formatMoney(unpaid)}원
          </span>
        )
      },
    },
    {
      key: 'date',
      label: '등록일',
      align: 'center',
      render: (c) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>{c.created_at.split('T')[0]}</span>
      ),
    },
  ]

  // ── 모바일 카드 ──
  const mobileCard: MobileCardConfig<Customer> = {
    title: (c) => c.name,
    subtitle: (c) => `${c.type} · ${formatPhone(c.phone)}`,
    trailing: (c) => (
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#3b6eb5' }}>{c.grade}</div>
        <div style={{ fontSize: 10, color: '#8aabc7', marginTop: 2 }}>{c.created_at.split('T')[0]}</div>
      </div>
    ),
    badges: (c) => (
      <>
        <span className={`si-badge ${GRADE_COLORS[c.grade]}`}>{c.grade}</span>
        <span className={`si-badge ${TYPE_COLORS[c.type]}`}>{c.type}</span>
      </>
    ),
  }

  // ── Admin 회사 미선택 ──
  if (role === 'admin' && !adminSelectedCompanyId) {
    return (
      <div className="page-bg">
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-6">
          <div style={{
            background: 'rgba(255,255,255,0.72)',
            borderRadius: 16,
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '6px 6px 18px rgba(140,170,210,0.14), -6px -6px 18px rgba(255,255,255,0.47)',
            padding: '48px 20px',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: 32, display: 'block', marginBottom: 12 }}>🏢</span>
            <p style={{ color: '#8aabc7', fontWeight: 600, fontSize: 14 }}>좌측 상단에서 회사를 먼저 선택해주세요</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-bg">
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-8 md:px-6">

        {/* ── KPI 스탯 카드 ── */}
        {!loading && customers.length > 0 && (
          <NeuStatCards
            items={statItems}
            columns={5}
          />
        )}

        {/* ── 검색바 ── */}
        <NeuSearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="이름, 연락처, 이메일, 사업자번호로 검색..."
          resultText={`검색결과 ${filteredCustomers.length}명`}
          actions={[{
            label: '+ 신규 고객',
            variant: 'primary',
            onClick: () => {
              setShowNewModal(true)
              setNewForm({ ...EMPTY_FORM })
            },
          }]}
          extra={
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              style={{
                padding: '9px 12px',
                fontSize: 13,
                color: '#1e293b',
                background: 'rgba(255,255,255,0.40)',
                border: '1px solid rgba(0,0,0,0.05)',
                borderRadius: 10,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="latest">최신순</option>
              <option value="name">이름순</option>
              <option value="grade">등급순</option>
            </select>
          }
        />

        {/* ── 필터 탭 ── */}
        <NeuFilterTabs
          tabs={CUSTOMER_TYPES.map(t => ({ key: t, label: t }))}
          activeKey={typeFilter}
          onSelect={setTypeFilter}
          trailing={
            <select
              value={gradeFilter}
              onChange={e => setGradeFilter(e.target.value)}
              style={{
                padding: '9px 12px',
                fontSize: 13,
                color: '#1e293b',
                background: 'rgba(255,255,255,0.40)',
                border: '1px solid rgba(0,0,0,0.05)',
                borderRadius: 10,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">등급 전체</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          }
        />

        {/* ── 데이터 테이블 ── */}
        <NeuDataTable
          columns={columns}
          data={filteredCustomers}
          rowKey={(c) => c.id}
          onRowClick={handleSelectCustomer}
          loading={loading}
          emptyIcon="👥"
          emptyMessage={searchQuery ? '검색 결과가 없습니다.' : '등록된 고객이 없습니다.'}
          mobileCard={mobileCard}
        />

        {/* ── 상세 모달 (고객 선택 시) ── */}
        {selectedCustomer && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-end', zIndex: 50,
          }} onClick={() => setSelectedCustomer(null)}>
            <div
              style={{
                width: '100%', maxWidth: 500, background: 'white',
                borderRadius: '20px 20px 0 0', maxHeight: '90vh',
                overflow: 'auto', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div style={{
                padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                position: 'sticky', top: 0, background: '#fff', zIndex: 1,
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#0f2440' }}>{selectedCustomer.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    <span className={`si-badge ${TYPE_COLORS[selectedCustomer.type]}`}>{selectedCustomer.type}</span>
                    <span className={`si-badge ${GRADE_COLORS[selectedCustomer.grade]} ml-1`}>{selectedCustomer.grade}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  style={{
                    background: 'transparent', border: 'none', fontSize: 20,
                    cursor: 'pointer', color: '#64748b',
                  }}
                >
                  ✕
                </button>
              </div>

              {/* 탭 ──*/}
              <div style={{
                display: 'flex', gap: 0, borderBottom: '1px solid rgba(0,0,0,0.06)',
                padding: '0 20px', position: 'sticky', top: 56, background: '#fff', zIndex: 1,
              }}>
                {['info', 'payments', 'invoices', 'notes'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setDetailTab(tab as any)}
                    style={{
                      padding: '12px 16px', fontSize: 13, fontWeight: detailTab === tab ? 700 : 500,
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      borderBottom: detailTab === tab ? '3px solid #3b6eb5' : 'none',
                      color: detailTab === tab ? '#3b6eb5' : '#64748b',
                    }}
                  >
                    {tab === 'info' ? '정보' : tab === 'payments' ? '결제' : tab === 'invoices' ? '계산서' : '메모'}
                  </button>
                ))}
              </div>

              {/* 컨텐츠 */}
              <div style={{ padding: 20 }}>
                {detailTab === 'info' && (
                  <div>
                    {!isEditing ? (
                      <>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                          <button
                            onClick={() => { setIsEditing(true); setEditForm({ ...selectedCustomer }) }}
                            style={{
                              flex: 1, padding: '10px 14px', fontSize: 12, fontWeight: 600,
                              background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff',
                              border: 'none', borderRadius: 8, cursor: 'pointer',
                            }}
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDeleteCustomer(selectedCustomer.id)}
                            style={{
                              flex: 1, padding: '10px 14px', fontSize: 12, fontWeight: 600,
                              background: 'rgba(239,68,68,0.15)', color: '#dc2626',
                              border: 'none', borderRadius: 8, cursor: 'pointer',
                            }}
                          >
                            삭제
                          </button>
                        </div>
                        {/* 기본정보 */}
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 12, textTransform: 'uppercase' }}>
                            기본 정보
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 10, color: '#8aabc7', fontWeight: 600 }}>고객명</div>
                              <div style={{ fontSize: 13, color: '#1e293b', marginTop: 4, fontWeight: 600 }}>{selectedCustomer.name}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: '#8aabc7', fontWeight: 600 }}>유형</div>
                              <div style={{ fontSize: 13, color: '#1e293b', marginTop: 4, fontWeight: 600 }}>{selectedCustomer.type}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: '#8aabc7', fontWeight: 600 }}>연락처</div>
                              <div style={{ fontSize: 13, color: '#1e293b', marginTop: 4 }}>{formatPhone(selectedCustomer.phone)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: '#8aabc7', fontWeight: 600 }}>이메일</div>
                              <div style={{ fontSize: 13, color: '#1e293b', marginTop: 4 }}>{selectedCustomer.email}</div>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div>
                        <div style={{ marginBottom: 20 }}>
                          {selectedCustomer.type === '개인' && (
                            <>
                              {renderField('고객명', 'name', editForm, setEditForm)}
                              {renderField('생년월일', 'birth_date', editForm, setEditForm, { type: 'date' })}
                              {renderField('면허번호', 'license_number', editForm, setEditForm)}
                              {renderSelectField('면허종류', 'license_type', [...LICENSE_TYPES], editForm, setEditForm)}
                              {renderField('면허만료일', 'license_expiry', editForm, setEditForm, { type: 'date' })}
                              {renderAddressField('주소', 'address', 'address_detail', editForm, setEditForm, false)}
                              {renderField('연락처', 'phone', editForm, setEditForm)}
                              {renderField('이메일', 'email', editForm, setEditForm)}
                              {renderSelectField('등급', 'grade', [...GRADES], editForm, setEditForm)}
                            </>
                          )}
                          {selectedCustomer.type === '법인' && (
                            <>
                              {renderField('회사명', 'name', editForm, setEditForm)}
                              {renderField('사업자등록번호', 'business_number', editForm, setEditForm, { placeholder: '123-45-67890' })}
                              {renderField('사업종류', 'business_type', editForm, setEditForm)}
                              {renderField('업종', 'business_category', editForm, setEditForm)}
                              {renderField('대표자명', 'ceo_name', editForm, setEditForm)}
                              {renderAddressField('사업장주소', 'business_address', 'business_address_detail', editForm, setEditForm, false)}
                              {renderField('담당자', 'contact_person', editForm, setEditForm)}
                              {renderField('담당자연락처', 'contact_phone', editForm, setEditForm)}
                              {renderField('담당자이메일', 'contact_email', editForm, setEditForm)}
                              {renderSelectField('등급', 'grade', [...GRADES], editForm, setEditForm)}
                              <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-1 block">세금계산서 유형</label>
                                <div className="flex gap-2">
                                  {['전자세금계산서', '수기세금계산서', '미발행'].map(t => (
                                    <button key={t} onClick={() => setEditForm({ ...editForm, tax_type: t })}
                                      className={`flex-1 py-1.5 text-xs rounded-lg font-bold border transition-colors ${
                                        editForm.tax_type === t ? 'bg-amber-900/30 text-amber-400 border-amber-700/40' : 'bg-gray-50 text-slate-400 border-black/[0.06]'
                                      }`}>
                                      {t}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {editForm.tax_type !== '미발행' && (
                                <>
                                  {renderField('계산서 수신 이메일', 'tax_email', editForm, setEditForm)}
                                </>
                              )}
                            </>
                          )}
                          {selectedCustomer.type === '외국인' && (
                            <>
                              {renderField('고객명', 'name', editForm, setEditForm)}
                              {renderField('여권번호', 'passport_number', editForm, setEditForm)}
                              {renderField('국적', 'nationality', editForm, setEditForm)}
                              {renderField('국제운전면허', 'intl_license', editForm, setEditForm)}
                              {renderField('연락처', 'phone', editForm, setEditForm)}
                              {renderField('이메일', 'email', editForm, setEditForm)}
                            </>
                          )}
                          <div>
                            <label className="text-[11px] font-bold text-slate-400 mb-1 block">메모</label>
                            <textarea
                              className="w-full px-3 py-2.5 border border-black/[0.06] rounded-xl text-sm h-20 resize-none focus:border-blue-400 outline-none"
                              value={editForm.memo || ''}
                              onChange={e => setEditForm({ ...editForm, memo: e.target.value })}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={handleUpdateCustomer}
                            style={{
                              flex: 1, padding: '10px 14px', fontSize: 12, fontWeight: 600,
                              background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff',
                              border: 'none', borderRadius: 8, cursor: 'pointer',
                            }}
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setIsEditing(false)}
                            style={{
                              flex: 1, padding: '10px 14px', fontSize: 12, fontWeight: 600,
                              background: 'rgba(255,255,255,0.60)', color: '#1e293b',
                              border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, cursor: 'pointer',
                            }}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {detailTab === 'payments' && (
                  <div>
                    <button
                      onClick={() => setShowPaymentForm(!showPaymentForm)}
                      style={{
                        width: '100%', padding: '10px 14px', fontSize: 12, fontWeight: 600,
                        background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff',
                        border: 'none', borderRadius: 8, cursor: 'pointer', marginBottom: 12,
                      }}
                    >
                      + 결제 기록 추가
                    </button>
                    {showPaymentForm && (
                      <div style={{ padding: 12, background: 'rgba(59,110,181,0.05)', borderRadius: 8, marginBottom: 12 }}>
                        {renderField('금액', 'amount', paymentForm, setPaymentForm, { type: 'number' })}
                        {renderSelectField('유형', 'payment_type', ['charge', 'refund'], paymentForm, setPaymentForm)}
                        {renderSelectField('결제방법', 'payment_method', ['카드', '현금', '계좌이체', '기타'], paymentForm, setPaymentForm)}
                        {renderField('설명', 'description', paymentForm, setPaymentForm)}
                        {renderField('예정일', 'due_date', paymentForm, setPaymentForm, { type: 'date' })}
                        {renderSelectField('상태', 'status', ['미결제', '부분결제', '결제완료', '환불'], paymentForm, setPaymentForm)}
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button
                            onClick={handleAddPayment}
                            style={{
                              flex: 1, padding: '10px 14px', fontSize: 12, fontWeight: 600,
                              background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff',
                              border: 'none', borderRadius: 8, cursor: 'pointer',
                            }}
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setShowPaymentForm(false)}
                            style={{
                              flex: 1, padding: '10px 14px', fontSize: 12, fontWeight: 600,
                              background: 'rgba(255,255,255,0.60)', color: '#1e293b',
                              border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, cursor: 'pointer',
                            }}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {payments.map(p => (
                        <div key={p.id} style={{
                          padding: 12, background: 'rgba(255,255,255,0.40)', borderRadius: 8,
                          border: '1px solid rgba(0,0,0,0.05)',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{formatMoney(p.amount)}원</div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{p.description}</div>
                            </div>
                            <span className={`si-badge ${PAYMENT_STATUS_COLORS[p.status]}`}>{p.status}</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#8aabc7' }}>
                            {p.created_at.split('T')[0]} · {p.payment_method}
                          </div>
                        </div>
                      ))}
                      {payments.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 20, color: '#8aabc7', fontSize: 12 }}>
                          결제 기록이 없습니다.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {detailTab === 'invoices' && (
                  <div>
                    <button
                      onClick={() => setShowInvoiceForm(!showInvoiceForm)}
                      style={{
                        width: '100%', padding: '10px 14px', fontSize: 12, fontWeight: 600,
                        background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff',
                        border: 'none', borderRadius: 8, cursor: 'pointer', marginBottom: 12,
                      }}
                    >
                      + 세금계산서 추가
                    </button>
                    {showInvoiceForm && (
                      <div style={{ padding: 12, background: 'rgba(59,110,181,0.05)', borderRadius: 8, marginBottom: 12 }}>
                        {renderField('발행일', 'issue_date', invoiceForm, setInvoiceForm, { type: 'date' })}
                        {renderField('공급가액', 'supply_amount', invoiceForm, setInvoiceForm, { type: 'number' })}
                        {renderField('세액', 'tax_amount', invoiceForm, setInvoiceForm, { type: 'number' })}
                        {renderField('비고', 'description', invoiceForm, setInvoiceForm)}
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button
                            onClick={handleAddInvoice}
                            style={{
                              flex: 1, padding: '10px 14px', fontSize: 12, fontWeight: 600,
                              background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff',
                              border: 'none', borderRadius: 8, cursor: 'pointer',
                            }}
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setShowInvoiceForm(false)}
                            style={{
                              flex: 1, padding: '10px 14px', fontSize: 12, fontWeight: 600,
                              background: 'rgba(255,255,255,0.60)', color: '#1e293b',
                              border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, cursor: 'pointer',
                            }}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {taxInvoices.map(inv => (
                        <div key={inv.id} style={{
                          padding: 12, background: 'rgba(255,255,255,0.40)', borderRadius: 8,
                          border: '1px solid rgba(0,0,0,0.05)',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                                {formatMoney(inv.total_amount)}원
                              </div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                공급가: {formatMoney(inv.supply_amount)}원 · 세액: {formatMoney(inv.tax_amount)}원
                              </div>
                            </div>
                            <span className="si-badge si-badge-green">{inv.status}</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#8aabc7' }}>
                            {inv.issue_date} · {inv.sent_to_email}
                          </div>
                        </div>
                      ))}
                      {taxInvoices.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 20, color: '#8aabc7', fontSize: 12 }}>
                          세금계산서가 없습니다.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {detailTab === 'notes' && (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input
                          type="text"
                          placeholder="메모 입력..."
                          value={newNote}
                          onChange={e => setNewNote(e.target.value)}
                          style={{
                            flex: 1, padding: '9px 12px', fontSize: 12,
                            border: '1px solid rgba(0,0,0,0.05)', borderRadius: 8,
                            outline: 'none',
                          }}
                        />
                        <select
                          value={newNoteType}
                          onChange={e => setNewNoteType(e.target.value)}
                          style={{
                            padding: '9px 12px', fontSize: 12,
                            border: '1px solid rgba(0,0,0,0.05)', borderRadius: 8,
                            background: '#fff', cursor: 'pointer',
                          }}
                        >
                          {NOTE_TYPES.map(nt => <option key={nt} value={nt}>{nt}</option>)}
                        </select>
                      </div>
                      <button
                        onClick={handleAddNote}
                        style={{
                          width: '100%', padding: '10px 14px', fontSize: 12, fontWeight: 600,
                          background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff',
                          border: 'none', borderRadius: 8, cursor: 'pointer',
                        }}
                      >
                        추가
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {notes.map(n => (
                        <div key={n.id} style={{
                          padding: 12, background: 'rgba(255,255,255,0.40)', borderRadius: 8,
                          border: '1px solid rgba(0,0,0,0.05)',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{n.content}</div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{n.author_name}</div>
                            </div>
                            <span className={`si-badge ${NOTE_TYPE_COLORS[n.note_type]}`}>{n.note_type}</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#8aabc7' }}>
                            {n.created_at.split('T')[0]}
                          </div>
                        </div>
                      ))}
                      {notes.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 20, color: '#8aabc7', fontSize: 12 }}>
                          메모가 없습니다.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 신규 고객 모달 ── */}
        {showNewModal && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-end', zIndex: 50,
          }} onClick={() => setShowNewModal(false)}>
            <div
              style={{
                width: '100%', maxWidth: 500, background: 'white',
                borderRadius: '20px 20px 0 0', maxHeight: '90vh',
                overflow: 'auto', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{
                padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                position: 'sticky', top: 0, background: '#fff', zIndex: 1,
              }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#0f2440' }}>신규 고객 등록</div>
                <button
                  onClick={() => setShowNewModal(false)}
                  style={{
                    background: 'transparent', border: 'none', fontSize: 20,
                    cursor: 'pointer', color: '#64748b',
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ padding: 20 }}>
                {/* 고객 유형 선택 */}
                <div style={{ marginBottom: 20 }}>
                  <label className="text-[11px] font-bold text-slate-400 mb-2 block">고객 유형</label>
                  <div className="flex gap-2">
                    {['개인', '법인', '외국인'].map(t => (
                      <button key={t} onClick={() => setNewForm({ ...EMPTY_FORM, type: t as any })}
                        className={`flex-1 py-2 text-xs rounded-lg font-bold border transition-colors ${
                          newForm.type === t ? 'bg-blue-900/30 text-blue-400 border-blue-700/40' : 'bg-gray-50 text-slate-400 border-black/[0.06]'
                        }`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {newForm.type === '개인' && (
                  <>
                    {renderField('고객명', 'name', newForm, setNewForm)}
                    {renderField('생년월일', 'birth_date', newForm, setNewForm, { type: 'date' })}
                    {renderField('면허번호', 'license_number', newForm, setNewForm)}
                    {renderSelectField('면허종류', 'license_type', [...LICENSE_TYPES], newForm, setNewForm)}
                    {renderField('면허만료일', 'license_expiry', newForm, setNewForm, { type: 'date' })}
                    {renderAddressField('주소', 'address', 'address_detail', newForm, setNewForm, false)}
                    {renderField('연락처', 'phone', newForm, setNewForm)}
                    {renderField('이메일', 'email', newForm, setNewForm)}
                  </>
                )}

                {newForm.type === '법인' && (
                  <>
                    {renderField('회사명', 'name', newForm, setNewForm)}
                    {renderField('사업자등록번호', 'business_number', newForm, setNewForm, { placeholder: '123-45-67890' })}
                    {renderField('사업종류', 'business_type', newForm, setNewForm)}
                    {renderField('업종', 'business_category', newForm, setNewForm)}
                    {renderField('대표자명', 'ceo_name', newForm, setNewForm)}
                    {renderAddressField('사업장주소', 'business_address', 'business_address_detail', newForm, setNewForm, false)}
                    {renderField('담당자', 'contact_person', newForm, setNewForm)}
                    {renderField('담당자연락처', 'contact_phone', newForm, setNewForm)}
                    {renderField('담당자이메일', 'contact_email', newForm, setNewForm)}
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 mb-1 block">세금계산서 유형</label>
                      <div className="flex gap-2">
                        {['전자세금계산서', '수기세금계산서', '미발행'].map(t => (
                          <button key={t} onClick={() => setNewForm({ ...newForm, tax_type: t })}
                            className={`flex-1 py-1.5 text-xs rounded-lg font-bold border transition-colors ${
                              newForm.tax_type === t ? 'bg-amber-900/30 text-amber-400 border-amber-700/40' : 'bg-gray-50 text-slate-400 border-black/[0.06]'
                            }`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    {newForm.tax_type !== '미발행' && (
                      <>
                        {renderField('계산서 수신 이메일', 'tax_email', newForm, setNewForm)}
                      </>
                    )}
                  </>
                )}

                {newForm.type === '외국인' && (
                  <>
                    {renderField('고객명', 'name', newForm, setNewForm)}
                    {renderField('여권번호', 'passport_number', newForm, setNewForm)}
                    {renderField('국적', 'nationality', newForm, setNewForm)}
                    {renderField('국제운전면허', 'intl_license', newForm, setNewForm)}
                    {renderField('연락처', 'phone', newForm, setNewForm)}
                    {renderField('이메일', 'email', newForm, setNewForm)}
                  </>
                )}

                <div>
                  <label className="text-[11px] font-bold text-slate-400 mb-1 block">메모</label>
                  <textarea
                    className="w-full px-3 py-2.5 border border-black/[0.06] rounded-xl text-sm h-20 resize-none focus:border-blue-400 outline-none"
                    value={newForm.memo || ''}
                    onChange={e => setNewForm({ ...newForm, memo: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button
                    onClick={handleCreateCustomer}
                    style={{
                      flex: 1, padding: '10px 14px', fontSize: 12, fontWeight: 600,
                      background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff',
                      border: 'none', borderRadius: 8, cursor: 'pointer',
                    }}
                  >
                    등록
                  </button>
                  <button
                    onClick={() => setShowNewModal(false)}
                    style={{
                      flex: 1, padding: '10px 14px', fontSize: 12, fontWeight: 600,
                      background: 'rgba(255,255,255,0.60)', color: '#1e293b',
                      border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, cursor: 'pointer',
                    }}
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
