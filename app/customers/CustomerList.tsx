'use client'
import { useApp } from '../context/AppContext'
import { useEffect, useState, useCallback, useMemo } from 'react'
import DarkHeader from '../components/DarkHeader'

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
  // (주), (합) 등 괄호 접두사 제거
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

      // 계약 이력 (실제 contracts 테이블에서 조회)
      // TODO: Create /api/contracts endpoint for this

      // 결제 이력
      const payRes = await fetch(`/api/customers/${customerId}/payments`, { headers })
      const payJson = await payRes.json()
      setPayments((payJson.data as Payment[]) || [])

      // 메모/상담
      const noteRes = await fetch(`/api/customers/${customerId}/notes`, { headers })
      const noteJson = await noteRes.json()
      setNotes((noteJson.data as Note[]) || [])

      // 세금계산서
      const invRes = await fetch(`/api/customers/${customerId}/tax-invoices`, { headers })
      const invJson = await invRes.json()
      setTaxInvoices((invJson.data as TaxInvoice[]) || [])
    } catch (err) {
      console.error('fetchDetailData error:', err)
    }
  }, [])

  // ── 필터링 & 정렬 ──
  const filteredCustomers = useMemo(() => {
    let list = [...customers]
    if (typeFilter !== '전체') list = list.filter(c => c.type === typeFilter)
    if (gradeFilter) list = list.filter(c => c.grade === gradeFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.business_number?.includes(q) ||
        c.contact_person?.toLowerCase().includes(q)
      )
    }
    if (sortBy === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else if (sortBy === 'grade') {
      const order = { 'VIP': 0, '우수': 1, '일반': 2, '주의': 3 }
      list.sort((a, b) => (order[a.grade as keyof typeof order] ?? 2) - (order[b.grade as keyof typeof order] ?? 2))
    }
    return list
  }, [customers, typeFilter, gradeFilter, searchQuery, sortBy])

  // ── 통계 ──
  const stats = useMemo(() => {
    const total = customers.length
    const personal = customers.filter(c => c.type === '개인').length
    const corporate = customers.filter(c => c.type === '법인').length
    const foreign = customers.filter(c => c.type === '외국인').length
    const vip = customers.filter(c => c.grade === 'VIP').length
    return { total, personal, corporate, foreign, vip }
  }, [customers])

  // ── DB 컬럼 감지 (존재하지 않는 컬럼 자동 제거) ──
  const [dbColumns, setDbColumns] = useState<Set<string> | null>(null)

  useEffect(() => {
    // 기존 데이터에서 실제 DB 컬럼 파악
    if (customers.length > 0) {
      setDbColumns(new Set(Object.keys(customers[0])))
    }
  }, [customers])

  const sanitizePayload = useCallback((raw: any) => {
    if (!dbColumns || dbColumns.size === 0) {
      // 컬럼 정보가 없으면 기본 컬럼만 보냄
      const base = ['name', 'phone', 'email', 'type', 'memo']
      const safe: any = {}
      base.forEach(k => { if (k in raw) safe[k] = raw[k] })
      return safe
    }
    const safe: any = {}
    Object.keys(raw).forEach(k => {
      if (dbColumns.has(k)) safe[k] = raw[k]
    })
    // id, created_at 은 insert시 제거
    delete safe.id
    delete safe.created_at
    return safe
  }, [dbColumns])

  // ── 고객 저장 (신규) ──
  const handleCreateCustomer = async () => {
    if (!newForm.name?.trim()) return alert('고객명은 필수입니다.')

    const raw: any = { ...newForm }
    Object.keys(raw).forEach(k => { if (raw[k] === '') raw[k] = null })
    raw.name = newForm.name
    const payload = sanitizePayload(raw)

    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await res.json()
      if (json.error) { alert('저장 실패: ' + json.error); return }
      setShowNewModal(false)
      setNewForm({ ...EMPTY_FORM })
      fetchCustomers()
    } catch (err) {
      alert('저장 실패: ' + err)
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
    // 이미 로드된 경우
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
  const renderField = (label: string, key: string, form: any, setForm: (v: any) => void, opts?: { placeholder?: string; type?: string; disabled?: boolean; half?: boolean }) => (
    <div className={opts?.half ? 'flex-1 min-w-0' : ''}>
      <label className="text-[11px] font-bold text-slate-400 mb-1 block">{label}</label>
      <input
        type={opts?.type || 'text'}
        className="w-full px-3 py-2.5 border border-black/[0.06] rounded-xl text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 outline-none transition-colors disabled:bg-gray-50 disabled:text-slate-400"
        placeholder={opts?.placeholder || ''}
        value={form[key] || ''}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        disabled={opts?.disabled}
      />
    </div>
  )

  // ─────────────────────────────────────────────
  // 렌더링: 고객 등록/수정 폼 본문
  // ─────────────────────────────────────────────
  const renderCustomerForm = (form: any, setForm: (v: any) => void, disabled = false) => (
    <div className="space-y-5">
      {/* 기본정보 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span className="text-xs font-bold text-slate-700">기본 정보</span>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-bold text-slate-400 mb-1 block">고객 구분</label>
            <div className="flex gap-2">
              {(['개인', '법인', '외국인'] as const).map(t => (
                <button key={t} onClick={() => !disabled && setForm({ ...form, type: t })}
                  className={`flex-1 py-2 text-xs rounded-xl font-bold border transition-colors ${
                    form.type === t ? 'bg-blue-900/40 text-blue-200 border-blue-600/40' : 'bg-gray-50 text-slate-400 border-black/[0.06] hover:border-blue-600/40'
                  } ${disabled ? 'pointer-events-none' : ''}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {renderField('이름 / 상호명 *', 'name', form, setForm, { placeholder: form.type === '법인' ? '(주)회사명' : '홍길동', disabled })}
          <div className="flex gap-3">
            {renderField('연락처', 'phone', form, setForm, { placeholder: '010-0000-0000', disabled })}
            {renderField('이메일', 'email', form, setForm, { placeholder: 'email@example.com', disabled })}
          </div>
          {form.type !== '법인' && renderAddressField('주소', 'address', 'address_detail', form, setForm, disabled)}
          <div>
            <label className="text-[11px] font-bold text-slate-400 mb-1 block">등급</label>
            <div className="flex gap-2">
              {GRADES.map(g => (
                <button key={g} onClick={() => !disabled && setForm({ ...form, grade: g })}
                  className={`flex-1 py-1.5 text-xs rounded-lg font-bold border transition-colors ${
                    form.grade === g ? GRADE_COLORS[g] + ' border' : 'bg-gray-50 text-slate-400 border-black/[0.06]'
                  } ${disabled ? 'pointer-events-none' : ''}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 개인 / 외국인: 면허 정보 */}
      {(form.type === '개인' || form.type === '외국인') && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-xs font-bold text-slate-700">면허 정보</span>
          </div>
          <div className="space-y-3">
            {form.type === '개인' && (
              <div className="flex gap-3">
                {renderField('생년월일', 'birth_date', form, setForm, { placeholder: '19900101', disabled })}
                <div className="flex-1 min-w-0">
                  <label className="text-[11px] font-bold text-slate-400 mb-1 block">면허종류</label>
                  <select
                    className="w-full px-3 py-2.5 border border-black/[0.06] rounded-xl text-sm focus:border-blue-400 outline-none disabled:bg-gray-50 text-slate-600"
                    value={form.license_type || ''}
                    onChange={e => setForm({ ...form, license_type: e.target.value })}
                    disabled={disabled}>
                    <option value="">선택</option>
                    {LICENSE_TYPES.map(lt => <option key={lt} value={lt}>{lt}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              {renderField('면허번호', 'license_number', form, setForm, { placeholder: '12-34-567890-12', disabled })}
              {renderField('면허만료일', 'license_expiry', form, setForm, { placeholder: '20280101', disabled })}
            </div>
            {form.type === '외국인' && (
              <>
                <div className="flex gap-3">
                  {renderField('여권번호', 'passport_number', form, setForm, { placeholder: 'M12345678', disabled })}
                  {renderField('국적', 'nationality', form, setForm, { placeholder: '미국', disabled })}
                </div>
                {renderField('국제면허번호', 'intl_license', form, setForm, { placeholder: '', disabled })}
              </>
            )}
          </div>
        </div>
      )}

      {/* 법인: 사업자 정보 */}
      {form.type === '법인' && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span className="text-xs font-bold text-slate-700">사업자 정보</span>
          </div>
          <div className="space-y-3">
            <div className="flex gap-3">
              {renderField('사업자등록번호', 'business_number', form, setForm, { placeholder: '123-45-67890', disabled })}
              {renderField('대표자명', 'ceo_name', form, setForm, { placeholder: '홍길동', disabled })}
            </div>
            <div className="flex gap-3">
              {renderField('업태', 'business_type', form, setForm, { placeholder: '서비스업', disabled })}
              {renderField('종목', 'business_category', form, setForm, { placeholder: '자동차 임대', disabled })}
            </div>
            {renderAddressField('사업장 주소', 'business_address', 'business_address_detail', form, setForm, disabled)}
          </div>
        </div>
      )}

      {/* 법인: 담당자 정보 */}
      {form.type === '법인' && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <span className="text-xs font-bold text-slate-700">담당자 정보</span>
          </div>
          <div className="space-y-3">
            {renderField('담당자명', 'contact_person', form, setForm, { placeholder: '김담당', disabled })}
            <div className="flex gap-3">
              {renderField('담당자 연락처', 'contact_phone', form, setForm, { placeholder: '010-0000-0000', disabled })}
              {renderField('담당자 이메일', 'contact_email', form, setForm, { placeholder: 'contact@company.com', disabled })}
            </div>
          </div>
        </div>
      )}

      {/* 세금계산서 정보 (법인 + 개인사업자) */}
      {(form.type === '법인' || form.type === '개인') && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-xs font-bold text-slate-700">세금계산서</span>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-400 mb-1 block">발행 유형</label>
              <div className="flex gap-2">
                {['전자세금계산서', '수기세금계산서', '미발행'].map(t => (
                  <button key={t} onClick={() => !disabled && setForm({ ...form, tax_type: t })}
                    className={`flex-1 py-1.5 text-xs rounded-lg font-bold border transition-colors ${
                      form.tax_type === t ? 'bg-amber-900/30 text-amber-400 border-amber-700/40' : 'bg-gray-50 text-slate-400 border-black/[0.06]'
                    } ${disabled ? 'pointer-events-none' : ''}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {form.tax_type !== '미발행' && (
              <>
                {renderField('계산서 수신 이메일', 'tax_email', form, setForm, { placeholder: 'tax@company.com', disabled })}
                {form.type === '개인' && renderField('사업자등록번호', 'business_number', form, setForm, { placeholder: '123-45-67890 (개인사업자)', disabled })}
              </>
            )}
          </div>
        </div>
      )}

      {/* 메모 */}
      <div>
        <label className="text-[11px] font-bold text-slate-400 mb-1 block">메모</label>
        <textarea
          className="w-full px-3 py-2.5 border border-black/[0.06] rounded-xl text-sm h-20 resize-none focus:border-blue-400 outline-none disabled:bg-gray-50 text-slate-600"
          placeholder="특이사항, 선호차종, 주의사항 등"
          value={form.memo || ''}
          onChange={e => setForm({ ...form, memo: e.target.value })}
          disabled={disabled}
        />
      </div>
    </div>
  )

  // ─────────────────────────────────────────────
  // 메인 렌더링
  // ─────────────────────────────────────────────
  if (role === 'admin' && !adminSelectedCompanyId) {
    return (
      <div className="page-bg">
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-6">
          <div className="si-card p-12 md:p-20 text-center">
            <span className="text-4xl block mb-3">🏢</span>
            <p className="font-bold text-slate-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: '전체', value: stats.total, badge: 'glass-border-blue', icon: '👥', color: 'text-blue-400' },
            { label: '개인', value: stats.personal, badge: 'glass-border-blue', icon: '👤', color: 'text-blue-400' },
            { label: '법인', value: stats.corporate, badge: 'glass-border-green', icon: '🏢', color: 'text-emerald-400' },
            { label: '외국인', value: stats.foreign, badge: 'glass-border-purple', icon: '🌐', color: 'text-violet-400' },
            { label: 'VIP', value: stats.vip, badge: 'glass-border-amber', icon: '⭐', color: 'text-amber-400' },
          ].map(s => (
            <div key={s.label} className={`glass-3 ${s.badge} rounded-xl p-3 md:p-4 text-center`}>
              <div className="text-base mb-1">{s.icon}</div>
              <div className={`text-xl md:text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 검색 + 필터 */}
      <div className="si-card p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          {/* 검색 */}
          <div className="flex-1">
            <input
              className="si-input text-sm"
              placeholder="이름, 연락처, 이메일, 사업자번호로 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          {/* 유형 필터 */}
          <div className="flex gap-1.5">
            {CUSTOMER_TYPES.map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`si-tab ${typeFilter === t ? 'si-tab-active !border-b-0 !bg-gray-100' : ''} !px-4 !py-2.5 !rounded-lg !border-0`}>
                {t}
              </button>
            ))}
          </div>
          {/* 등급 필터 */}
          <select
            className="si-input !w-auto text-xs"
            value={gradeFilter}
            onChange={e => setGradeFilter(e.target.value)}>
            <option value="">등급 전체</option>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          {/* 정렬 */}
          <select
            className="si-input !w-auto text-xs"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}>
            <option value="latest">최신순</option>
            <option value="name">이름순</option>
            <option value="grade">등급순</option>
          </select>
          <button
            onClick={() => { setShowNewModal(true); setNewForm({ ...EMPTY_FORM }) }}
            className="si-btn si-btn-primary text-xs whitespace-nowrap"
          >
            + 신규 고객
          </button>
        </div>
      </div>

      {/* 메인 영역: 목록 + 상세 */}
      <div className="flex gap-6">
        {/* 고객 목록 */}
        <div className={`${selectedCustomer ? 'w-[420px] flex-shrink-0' : 'w-full'} transition-all`}>
          <div className="si-card overflow-hidden">
            <div className="px-5 py-3 border-b border-black/[0.06] flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">
                {filteredCustomers.length}명 {typeFilter !== '전체' ? `(${typeFilter})` : ''}
              </span>
            </div>

            {loading ? (
              <div className="p-16 text-center text-slate-400">
                <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-3" />
                로딩 중...
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="p-16 text-center text-slate-400">
                <div className="text-4xl mb-3">📋</div>
                {searchQuery ? '검색 결과가 없습니다.' : '등록된 고객이 없습니다.'}
              </div>
            ) : (
              <div className="divide-y divide-gray-200 max-h-[calc(100vh-380px)] overflow-y-auto">
                {filteredCustomers.map(cust => (
                  <button
                    key={cust.id}
                    onClick={() => handleSelectCustomer(cust)}
                    className={`w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors ${
                      selectedCustomer?.id === cust.id ? 'bg-blue-900/20 border-l-[3px] border-l-blue-400' : ''
                    }`}>
                    {/* 아바타 */}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-white text-sm flex-shrink-0 ${TYPE_COLORS[cust.type] || 'bg-slate-600'}`}>
                      {getInitial(cust.name)}
                    </div>
                    {/* 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-slate-800 text-sm truncate">{cust.name}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${GRADE_COLORS[cust.grade] || GRADE_COLORS['일반']}`}>
                          {cust.grade || '일반'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span>{cust.type}</span>
                        {cust.phone && <span>{formatPhone(cust.phone)}</span>}
                        {cust.type === '법인' && cust.business_number && (
                          <span className="text-slate-500">{formatBizNo(cust.business_number)}</span>
                        )}
                      </div>
                    </div>
                    {/* 우측 */}
                    {!selectedCustomer && (
                      <div className="text-right flex-shrink-0">
                        {cust.type === '법인' && cust.tax_type && cust.tax_type !== '미발행' && (
                          <span className="text-[10px] bg-amber-900/30 text-amber-400 px-1.5 py-0.5 rounded font-bold">계산서</span>
                        )}
                        <p className="text-[10px] text-slate-500 mt-1">{daysSince(cust.created_at)}일 전</p>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 상세 패널 */}
        {selectedCustomer && (
          <div className="flex-1 min-w-0">
            <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden">
              {/* 상세 헤더 */}
              <div className="px-6 py-5 border-b border-black/[0.06]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-white text-lg ${TYPE_COLORS[selectedCustomer.type] || 'bg-slate-600'}`}>
                      {getInitial(selectedCustomer.name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-black text-slate-800">{selectedCustomer.name}</h2>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${GRADE_COLORS[selectedCustomer.grade] || GRADE_COLORS['일반']}`}>
                          {selectedCustomer.grade || '일반'}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-50 text-slate-400">{selectedCustomer.type}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                        {selectedCustomer.phone && <span>{formatPhone(selectedCustomer.phone)}</span>}
                        {selectedCustomer.email && <span>{selectedCustomer.email}</span>}
                        {selectedCustomer.type === '법인' && selectedCustomer.business_number && (
                          <span>사업자 {formatBizNo(selectedCustomer.business_number)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedCustomer(null)} className="text-slate-500 hover:text-slate-600 text-xl">✕</button>
                </div>

                {/* 상세 탭 */}
                <div className="flex gap-1.5">
                  {([
                    { key: 'info', label: '기본정보', icon: '📋' },
                    { key: 'contracts', label: '계약이력', icon: '📑' },
                    { key: 'payments', label: '결제/정산', icon: '💳' },
                    { key: 'invoices', label: '세금계산서', icon: '🧾' },
                    { key: 'notes', label: '상담메모', icon: '📝' },
                  ] as const).map(tab => (
                    <button key={tab.key} onClick={() => setDetailTab(tab.key)}
                      className={`px-3 py-2 rounded-xl font-bold text-xs transition-colors ${
                        detailTab === tab.key ? 'bg-blue-900/40 text-blue-200' : 'bg-gray-50 text-slate-400 hover:bg-gray-100'
                      }`}>
                      {tab.icon} {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 상세 내용 */}
              <div className="p-6 max-h-[calc(100vh-420px)] overflow-y-auto">
                {/* ── 기본정보 탭 ── */}
                {detailTab === 'info' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-bold text-slate-400">고객 상세 정보</span>
                      <div className="flex gap-2">
                        {isEditing ? (
                          <>
                            <button onClick={() => setIsEditing(false)}
                              className="py-1.5 px-4 border border-black/[0.06] rounded-xl text-xs font-bold text-slate-400 hover:bg-gray-50">취소</button>
                            <button onClick={handleUpdateCustomer}
                              className="py-1.5 px-4 bg-blue-900/40 text-blue-200 rounded-xl text-xs font-bold hover:bg-blue-900/60">저장</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setIsEditing(true); setEditForm({ ...selectedCustomer }) }}
                              className="py-1.5 px-4 border border-black/[0.06] rounded-xl text-xs font-bold text-slate-400 hover:bg-gray-50">수정</button>
                            <button onClick={() => handleDeleteCustomer(selectedCustomer.id)}
                              className="py-1.5 px-4 border border-red-900/40 rounded-xl text-xs font-bold text-red-400 hover:bg-red-900/20">삭제</button>
                          </>
                        )}
                      </div>
                    </div>
                    {renderCustomerForm(isEditing ? editForm : selectedCustomer, isEditing ? setEditForm : () => {}, !isEditing)}
                  </div>
                )}

                {/* ── 계약이력 탭 ── */}
                {detailTab === 'contracts' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-bold text-slate-400">계약 이력 ({contracts.length}건)</span>
                    </div>
                    {contracts.length === 0 ? (
                      <div className="py-16 text-center text-slate-400">
                        <div className="text-3xl mb-2">📑</div>
                        계약 이력이 없습니다.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {contracts.map((c: any) => (
                          <div
                            key={c.id}
                            className="border border-black/[0.06] rounded-xl p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => window.open(`/contracts/${c.id}`, '_blank')}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  c.status === 'active' ? 'bg-emerald-900/30 text-emerald-400' :
                                  c.status === 'draft' ? 'bg-gray-50 text-slate-400' :
                                  'bg-blue-900/30 text-blue-400'
                                }`}>
                                  {c.status === 'active' ? '진행중' : c.status === 'draft' ? '임시저장' : c.status === 'completed' ? '완료' : c.status}
                                </span>
                                <span className="text-sm font-bold text-slate-700">
                                  {c.car_name || c.vehicle_name || '차량 미지정'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">
                                  {c.created_at ? new Date(c.created_at).toLocaleDateString('ko-KR') : ''}
                                </span>
                                <span className="text-[10px] text-blue-400 font-bold">상세 →</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                              {c.rental_period && <span>기간: {c.rental_period}개월</span>}
                              {c.monthly_rental && <span>월 렌탈료: {formatMoney(c.monthly_rental)}원</span>}
                              {c.quote_type && <span className="text-slate-400">{c.quote_type}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── 결제/정산 탭 ── */}
                {detailTab === 'payments' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-slate-400">결제 이력 ({payments.length}건)</span>
                        {getUnpaidAmount() > 0 && (
                          <span className="text-xs font-bold text-red-400 bg-red-900/30 px-2 py-0.5 rounded">
                            미수금 {formatMoney(getUnpaidAmount())}원
                          </span>
                        )}
                      </div>
                      <button onClick={() => setShowPaymentForm(!showPaymentForm)}
                        className="py-1.5 px-4 bg-blue-900/40 text-blue-200 rounded-xl text-xs font-bold hover:bg-blue-900/60">
                        + 결제 등록
                      </button>
                    </div>

                    {/* 결제 등록 폼 */}
                    {showPaymentForm && (
                      <div className="border border-blue-600/40 bg-blue-900/10 rounded-xl p-4 mb-4">
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 block">유형</label>
                            <select className="w-full px-3 py-2 border border-black/[0.06] rounded-lg text-xs text-slate-600"
                              value={paymentForm.payment_type}
                              onChange={e => setPaymentForm({ ...paymentForm, payment_type: e.target.value })}>
                              <option value="charge">청구</option>
                              <option value="payment">결제(수납)</option>
                              <option value="refund">환불</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 block">결제수단</label>
                            <select className="w-full px-3 py-2 border border-black/[0.06] rounded-lg text-xs text-slate-600"
                              value={paymentForm.payment_method}
                              onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}>
                              <option value="카드">카드</option>
                              <option value="계좌이체">계좌이체</option>
                              <option value="현금">현금</option>
                              <option value="자동이체">자동이체</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 block">금액 (원)</label>
                            <input type="number" className="w-full px-3 py-2 border border-black/[0.06] rounded-lg text-xs text-slate-600"
                              placeholder="0"
                              value={paymentForm.amount}
                              onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 block">상태</label>
                            <select className="w-full px-3 py-2 border border-black/[0.06] rounded-lg text-xs text-slate-600"
                              value={paymentForm.status}
                              onChange={e => setPaymentForm({ ...paymentForm, status: e.target.value })}>
                              <option value="미결제">미결제</option>
                              <option value="결제완료">결제완료</option>
                              <option value="부분결제">부분결제</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 block">결제기한</label>
                            <input type="date" className="w-full px-3 py-2 border border-black/[0.06] rounded-lg text-xs text-slate-600"
                              value={paymentForm.due_date}
                              onChange={e => setPaymentForm({ ...paymentForm, due_date: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 block">설명</label>
                            <input className="w-full px-3 py-2 border border-black/[0.06] rounded-lg text-xs text-slate-600"
                              placeholder="3월 렌탈료"
                              value={paymentForm.description}
                              onChange={e => setPaymentForm({ ...paymentForm, description: e.target.value })} />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setShowPaymentForm(false)}
                            className="py-1.5 px-4 border border-black/[0.06] rounded-xl text-xs font-bold text-slate-400">취소</button>
                          <button onClick={handleAddPayment}
                            className="py-1.5 px-4 bg-blue-900/40 text-blue-200 rounded-xl text-xs font-bold hover:bg-blue-900/60">저장</button>
                        </div>
                      </div>
                    )}

                    {/* 결제 목록 */}
                    {payments.length === 0 ? (
                      <div className="py-16 text-center text-slate-400">
                        <div className="text-3xl mb-2">💳</div>
                        결제 이력이 없습니다.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {payments.map(p => (
                          <div key={p.id} className="border border-black/[0.06] rounded-xl px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                            <div className="flex items-center gap-3">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${PAYMENT_STATUS_COLORS[p.status] || 'bg-gray-50 text-slate-400'}`}>
                                {p.status}
                              </span>
                              <div>
                                <span className="text-sm font-bold text-slate-700">{p.description || (p.payment_type === 'charge' ? '청구' : p.payment_type === 'refund' ? '환불' : '결제')}</span>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                  <span>{p.payment_method}</span>
                                  {p.due_date && <span>기한: {p.due_date}</span>}
                                  {p.paid_date && <span>결제일: {p.paid_date}</span>}
                                </div>
                              </div>
                            </div>
                            <span className={`text-sm font-black ${p.payment_type === 'refund' ? 'text-blue-400' : p.status === '미결제' ? 'text-red-400' : 'text-slate-700'}`}>
                              {p.payment_type === 'refund' ? '-' : ''}{formatMoney(p.amount)}원
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── 세금계산서 탭 ── */}
                {detailTab === 'invoices' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-bold text-slate-400">세금계산서 이력 ({taxInvoices.length}건)</span>
                      <button onClick={() => setShowInvoiceForm(!showInvoiceForm)}
                        className="py-1.5 px-4 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700">
                        + 계산서 발행
                      </button>
                    </div>

                    {/* 계산서 정보 요약 */}
                    {(selectedCustomer.type === '법인' || selectedCustomer.business_number) && (
                      <div className="bg-amber-900/10 border border-amber-700/40 rounded-xl p-4 mb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <span className="text-xs font-bold text-amber-400">세금계산서 발행 정보</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-500">사업자번호</span>
                            <span className="font-bold text-slate-700">{formatBizNo(selectedCustomer.business_number) || '미등록'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">상호</span>
                            <span className="font-bold text-slate-700">{selectedCustomer.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">대표자</span>
                            <span className="font-bold text-slate-700">{selectedCustomer.ceo_name || '미등록'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">발행유형</span>
                            <span className="font-bold text-slate-700">{selectedCustomer.tax_type || '미발행'}</span>
                          </div>
                          <div className="flex justify-between col-span-2">
                            <span className="text-slate-500">수신 이메일</span>
                            <span className="font-bold text-slate-700">{selectedCustomer.tax_email || selectedCustomer.email || '미등록'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 계산서 발행 폼 */}
                    {showInvoiceForm && (
                      <div className="border border-amber-700/40 bg-amber-900/10 rounded-xl p-4 mb-4">
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 block">발행일</label>
                            <input type="date" className="w-full px-3 py-2 border border-black/[0.06] rounded-lg text-xs text-slate-600"
                              value={invoiceForm.issue_date}
                              onChange={e => setInvoiceForm({ ...invoiceForm, issue_date: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 block">품목/적요</label>
                            <input className="w-full px-3 py-2 border border-black/[0.06] rounded-lg text-xs text-slate-600"
                              placeholder="차량 임대료"
                              value={invoiceForm.description}
                              onChange={e => setInvoiceForm({ ...invoiceForm, description: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 block">공급가액 (원)</label>
                            <input type="number" className="w-full px-3 py-2 border border-black/[0.06] rounded-lg text-xs text-slate-600"
                              placeholder="0"
                              value={invoiceForm.supply_amount}
                              onChange={e => setInvoiceForm({ ...invoiceForm, supply_amount: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 block">세액 (미입력시 10%)</label>
                            <input type="number" className="w-full px-3 py-2 border border-black/[0.06] rounded-lg text-xs text-slate-600"
                              placeholder="자동계산"
                              value={invoiceForm.tax_amount}
                              onChange={e => setInvoiceForm({ ...invoiceForm, tax_amount: e.target.value })} />
                          </div>
                        </div>
                        {invoiceForm.supply_amount && (
                          <div className="bg-gray-50 border border-black/[0.06] rounded-lg px-3 py-2 mb-3 text-xs">
                            <span className="text-slate-500">합계: </span>
                            <span className="font-black text-slate-700">
                              {formatMoney(
                                Number(invoiceForm.supply_amount) +
                                (invoiceForm.tax_amount ? Number(invoiceForm.tax_amount) : Math.round(Number(invoiceForm.supply_amount) * 0.1))
                              )}원
                            </span>
                            <span className="text-slate-400 ml-2">
                              (공급가 {formatMoney(Number(invoiceForm.supply_amount))} + 세액 {formatMoney(invoiceForm.tax_amount ? Number(invoiceForm.tax_amount) : Math.round(Number(invoiceForm.supply_amount) * 0.1))})
                            </span>
                          </div>
                        )}
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setShowInvoiceForm(false)}
                            className="py-1.5 px-4 border border-black/[0.06] rounded-xl text-xs font-bold text-slate-400">취소</button>
                          <button onClick={handleAddInvoice}
                            className="py-1.5 px-4 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700">발행</button>
                        </div>
                      </div>
                    )}

                    {/* 계산서 목록 */}
                    {taxInvoices.length === 0 ? (
                      <div className="py-16 text-center text-slate-400">
                        <div className="text-3xl mb-2">🧾</div>
                        발행된 세금계산서가 없습니다.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {taxInvoices.map(inv => (
                          <div key={inv.id} className="border border-black/[0.06] rounded-xl px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                            <div className="flex items-center gap-3">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                inv.status === '발행' ? 'bg-emerald-900/30 text-emerald-400' :
                                inv.status === '취소' ? 'bg-red-900/30 text-red-400' : 'bg-amber-900/30 text-amber-400'
                              }`}>{inv.status}</span>
                              <div>
                                <span className="text-sm font-bold text-slate-700">{inv.description || '세금계산서'}</span>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                  <span>발행일: {inv.issue_date}</span>
                                  {inv.sent_to_email && <span>→ {inv.sent_to_email}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-black text-slate-700">{formatMoney(inv.total_amount)}원</span>
                              <div className="text-[10px] text-slate-500">
                                공급가 {formatMoney(inv.supply_amount)} / 세액 {formatMoney(inv.tax_amount)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── 상담메모 탭 ── */}
                {detailTab === 'notes' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-bold text-slate-400">상담 / 메모 ({notes.length}건)</span>
                    </div>

                    {/* 메모 입력 */}
                    <div className="border border-black/[0.06] rounded-xl p-4 mb-4">
                      <div className="flex gap-1.5 mb-3">
                        {NOTE_TYPES.map(t => (
                          <button key={t} onClick={() => setNewNoteType(t)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                              newNoteType === t ? NOTE_TYPE_COLORS[t] : 'bg-gray-50 text-slate-500'
                            }`}>
                            {t}
                          </button>
                        ))}
                      </div>
                      <textarea
                        className="w-full px-3 py-2.5 border border-black/[0.06] rounded-xl text-sm h-20 resize-none focus:border-blue-400 outline-none text-slate-600"
                        placeholder="상담 내용, 고객 요청사항, 특이사항 등을 기록하세요..."
                        value={newNote}
                        onChange={e => setNewNote(e.target.value)}
                      />
                      <div className="flex justify-end mt-2">
                        <button onClick={handleAddNote}
                          disabled={!newNote.trim()}
                          className="py-1.5 px-4 bg-blue-900/40 text-blue-200 rounded-xl text-xs font-bold hover:bg-blue-900/60 disabled:opacity-40 disabled:cursor-not-allowed">
                          메모 저장
                        </button>
                      </div>
                    </div>

                    {/* 메모 목록 */}
                    {notes.length === 0 ? (
                      <div className="py-12 text-center text-slate-400">
                        <div className="text-3xl mb-2">📝</div>
                        등록된 메모가 없습니다.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {notes.map(n => (
                          <div key={n.id} className="border border-black/[0.06] rounded-xl p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${NOTE_TYPE_COLORS[n.note_type] || NOTE_TYPE_COLORS['일반']}`}>
                                  {n.note_type}
                                </span>
                                <span className="text-[10px] text-slate-500">{n.author_name}</span>
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {n.created_at ? new Date(n.created_at).toLocaleString('ko-KR') : ''}
                              </span>
                            </div>
                            <p className="text-sm text-slate-600 whitespace-pre-wrap">{n.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 신규 고객 등록 모달 ── */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl mb-10 border border-black/[0.06]">
            <div className="px-6 py-4 border-b border-black/[0.06] flex items-center justify-between">
              <h2 className="font-black text-slate-800">신규 고객 등록</h2>
              <button onClick={() => setShowNewModal(false)} className="text-slate-500 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {renderCustomerForm(newForm, setNewForm)}
            </div>
            <div className="px-6 py-4 border-t border-black/[0.06] flex justify-end gap-3">
              <button onClick={() => setShowNewModal(false)}
                className="py-2.5 px-5 border border-black/[0.06] rounded-xl font-bold text-sm text-slate-400 hover:bg-gray-50">취소</button>
              <button onClick={handleCreateCustomer}
                className="py-2.5 px-5 bg-blue-900/40 text-blue-200 rounded-xl font-bold text-sm hover:bg-blue-900/60">등록</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}
