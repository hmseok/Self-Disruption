'use client'

import { useEffect, useState, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import DcStatStrip, { StatItem } from '../../components/DcStatStrip'
import DcToolbar, { FilterItem } from '../../components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../../components/NeuDataTable'
import * as XLSX from 'xlsx'

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

const KOREAN_BANKS = [
  'KB국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행',
  'IBK기업은행', 'SC제일은행', '씨티은행', 'KDB산업은행',
  '카카오뱅크', '케이뱅크', '토스뱅크',
  '우체국', '새마을금고', '신협', '수협', '산림조합',
]

const TAX_TYPES = ['사업소득(3.3%)', '기타소득(8.8%)', '세금계산서', '원천징수 없음']
const SERVICE_TYPES = ['탁송', '대리운전', '정비', '세차', '디자인', '개발', '법무/세무', '기타']

type Freelancer = {
  id: string
  name: string
  phone?: string
  email?: string
  bank_name?: string
  account_number?: string
  account_holder?: string
  reg_number?: string
  tax_type?: string
  service_type?: string
  is_active: boolean
  memo?: string
  company_id?: string
}

type Payment = {
  id: string
  freelancer_id: string
  payment_date: string
  gross_amount: number
  tax_rate: number
  tax_amount: number
  net_amount: number
  description: string
  status: string
  paid_date?: string
  freelancers?: Freelancer
}

export default function FreelancersPage() {
  const { company, role } = useApp()
  const companyId = company?.id

  const [loading, setLoading] = useState(true)
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [activeTab, setActiveTab] = useState<'list' | 'payments'>('list')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [filterSearchText, setFilterSearchText] = useState('')
  const [paymentMonth, setPaymentMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const emptyForm = {
    name: '', phone: '', email: '', bank_name: 'KB국민은행',
    account_number: '', account_holder: '', reg_number: '',
    tax_type: '사업소득(3.3%)', service_type: '기타', is_active: true, memo: ''
  }
  const [form, setForm] = useState<any>(emptyForm)

  // 일괄 등록
  const [bulkData, setBulkData] = useState<any[]>([])
  const [bulkLogs, setBulkLogs] = useState<string[]>([])
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [aiParsing, setAiParsing] = useState(false)
  const bulkFileRef = useRef<HTMLInputElement>(null)

  const emptyPaymentForm = {
    freelancer_id: '', payment_date: new Date().toISOString().split('T')[0],
    gross_amount: '', tax_rate: 3.3, description: '', status: 'pending'
  }
  const [payForm, setPayForm] = useState<any>(emptyPaymentForm)

  useEffect(() => { if (companyId) { fetchFreelancers(); fetchPayments() } else { setLoading(false); setFreelancers([]); setPayments([]) } }, [companyId, paymentMonth, filter])

  const fetchFreelancers = async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      let url = '/api/freelancers'
      if (filter === 'active') url += '?is_active=true'
      if (filter === 'inactive') url += '?is_active=false'
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error('프리랜서 조회 실패')
      const json = await res.json()
      setFreelancers(json.data || [])
    } catch (e) {
      console.error('freelancers exception:', e)
      setFreelancers([])
    } finally {
      setLoading(false)
    }
  }

  const fetchPayments = async () => {
    try {
      const headers = await getAuthHeader()
      const [y, m] = paymentMonth.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      const res = await fetch(`/api/freelancer-payments?from=${paymentMonth}-01&to=${paymentMonth}-${lastDay}`, { headers })
      if (!res.ok) throw new Error('지급 내역 조회 실패')
      const json = await res.json()
      setPayments(json.data || [])
    } catch (e) {
      console.error('payments exception:', e)
      setPayments([])
    }
  }

  // ── Gemini AI로 파일 파싱 (서버 API 경유) ──
  const parseWithGemini = async (file: File): Promise<any[]> => {
    setAiParsing(true)
    setBulkLogs(prev => [...prev, '🤖 Gemini AI가 파일을 분석하고 있습니다...'])

    try {
      let content = ''
      let mimeType = file.type
      let isText = false

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        const ab = await file.arrayBuffer()
        const wb = XLSX.read(ab, { type: 'array' })
        // 모든 시트를 CSV로 합침
        const allCsv = wb.SheetNames.map(name => {
          const ws = wb.Sheets[name]
          return `--- 시트: ${name} ---\n${XLSX.utils.sheet_to_csv(ws)}`
        }).join('\n\n')
        content = allCsv
        isText = true
        if (wb.SheetNames.length > 1) {
          setBulkLogs(prev => [...prev, `📑 ${wb.SheetNames.length}개 시트 감지: ${wb.SheetNames.join(', ')}`])
        }
      } else {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.readAsDataURL(file)
        })
        content = base64
      }

      const res = await fetch('/api/finance/parse-freelancers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, mimeType, isText }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.results?.length > 0) {
          setBulkLogs(prev => [...prev, `✅ Gemini AI: ${data.results.length}명 추출 완료`])
          setAiParsing(false)
          return data.results
        }
      }

      setBulkLogs(prev => [...prev, '⚠️ AI 파싱 결과 없음, 기본 파싱으로 전환'])
    } catch (e) {
      console.error('Gemini parse error:', e)
      setBulkLogs(prev => [...prev, '⚠️ AI 파싱 실패, 기본 엑셀 파싱으로 전환'])
    }
    setAiParsing(false)
    return []
  }

  // ── 드래그앤드롭 핸들러 ──
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files?.length > 0) {
      await processMultipleFiles(Array.from(e.dataTransfer.files))
    }
  }

  // ── 여러 파일 처리 ──
  const processMultipleFiles = async (files: File[]) => {
    setBulkLogs([`📂 ${files.length}개 파일 선택됨`])
    setBulkData([])

    let allParsed: any[] = []

    for (const file of files) {
      setBulkLogs(prev => [...prev, `📂 ${file.name} (${(file.size / 1024).toFixed(1)}KB)`])
      const parsed = await processSingleFile(file)
      allParsed = [...allParsed, ...parsed]
    }

    if (allParsed.length === 0) {
      setBulkLogs(prev => [...prev, '⚠️ 파싱된 데이터가 없습니다.'])
      return
    }

    // 전체 중복 체크 (파일 간 중복 포함)
    applyDuplicateCheck(allParsed)
    setBulkData(allParsed)
    setBulkLogs(prev => [...prev, `📋 총 ${allParsed.length}명 취합 완료`])
  }

  // ── 단일 파일 처리 ──
  const processSingleFile = async (file: File): Promise<any[]> => {
    // Gemini AI로 먼저 시도
    const aiParsed = await parseWithGemini(file)

    if (aiParsed.length > 0) {
      return aiParsed.map((item: any, i: number) => ({
        name: String(item.name || '').trim(),
        phone: String(item.phone || '').trim(),
        email: item.email || '',
        bank_name: item.bank_name || 'KB국민은행',
        account_number: String(item.account_number || '').trim(),
        account_holder: item.account_holder || String(item.name || '').trim(),
        reg_number: String(item.reg_number || '').trim(),
        tax_type: item.tax_type || '사업소득(3.3%)',
        service_type: item.service_type || '기타',
        is_active: true,
        memo: item.memo || '',
        _row: i + 1,
        _status: 'ready' as 'ready' | 'duplicate' | 'error' | 'saved',
        _note: '',
        _source: file.name,
      })).filter((r: any) => r.name)
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
      const parsed = await parseExcelFallback(file)
      return parsed.map(p => ({ ...p, _source: file.name }))
    } else {
      setBulkLogs(prev => [...prev, `⚠️ ${file.name}: AI 파싱 실패. 엑셀 파일(.xlsx)로 다시 시도해주세요.`])
      return []
    }
  }

  // ── 엑셀 기본 파싱 (fallback) — 모든 시트 읽기 ──
  const parseExcelFallback = async (file: File): Promise<any[]> => {
    const ab = await file.arrayBuffer()
    const wb = XLSX.read(ab, { type: 'array' })

    let allRows: any[] = []

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

      const parsed = rows.map((row: any, i: number) => ({
        name: String(row['이름'] || row['성명'] || row['name'] || row['프리랜서'] || '').trim(),
        phone: String(row['연락처'] || row['전화번호'] || row['phone'] || '').trim(),
        email: row['이메일'] || row['email'] || '',
        bank_name: row['은행'] || row['은행명'] || 'KB국민은행',
        account_number: String(row['계좌번호'] || row['account'] || '').trim(),
        account_holder: (row['예금주'] || row['계좌주'] || String(row['이름'] || '').trim()),
        reg_number: String(row['주민번호'] || row['사업자번호'] || '').trim(),
        tax_type: row['세금유형'] || row['과세'] || '사업소득(3.3%)',
        service_type: row['업종'] || row['서비스'] || row['업무'] || '기타',
        is_active: true,
        memo: row['메모'] || row['비고'] || '',
        _row: i + 2,
        _status: 'ready' as 'ready' | 'duplicate' | 'error' | 'saved',
        _note: '',
        _sheet: wb.SheetNames.length > 1 ? sheetName : '',
      })).filter(r => r.name)

      allRows = [...allRows, ...parsed]
    }

    if (wb.SheetNames.length > 1) {
      setBulkLogs(prev => [...prev, `📑 ${wb.SheetNames.length}개 시트에서 총 ${allRows.length}명 파싱`])
    }

    return allRows
  }

  // ── 중복 체크 ──
  const applyDuplicateCheck = (parsed: any[]) => {
    const existingNames = new Set(freelancers.map(f => `${f.name}|${f.phone || ''}`))
    const seenInFile = new Set<string>()
    let dupCount = 0

    for (const item of parsed) {
      const key = `${item.name}|${item.phone}`
      if (existingNames.has(key)) {
        item._status = 'duplicate'
        item._note = 'DB에 이미 존재'
        dupCount++
      } else if (seenInFile.has(key)) {
        item._status = 'duplicate'
        item._note = '파일 내 중복'
        dupCount++
      }
      seenInFile.add(key)
    }

    setBulkLogs(prev => [
      ...prev,
      `✅ ${parsed.length}명 파싱 완료`,
      dupCount > 0 ? `⚠️ ${dupCount}명 중복 감지 (자동 제외됨)` : '✅ 중복 없음',
    ])
  }

  // ── 엑셀 파일 읽기 (input 이벤트) ──
  const handleBulkFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    await processMultipleFiles(Array.from(files))
    if (bulkFileRef.current) bulkFileRef.current.value = ''
  }

  // ── 일괄 저장 ──
  const handleBulkSave = async () => {
    if (!companyId) return alert('회사를 먼저 선택해주세요.')
    const toSave = bulkData.filter(d => d._status === 'ready')
    if (toSave.length === 0) return alert('저장할 데이터가 없습니다.')
    if (!confirm(`${toSave.length}명을 등록하시겠습니까?`)) return

    setBulkProcessing(true)
    let saved = 0, failed = 0

    for (const item of toSave) {
      const { _row, _status, _note, _source, _sheet, default_fee, ...payload } = item
      try {
        const headers = await getAuthHeader()
        const res = await fetch('/api/freelancers', { method: 'POST', headers, body: JSON.stringify(payload) })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || '등록 실패')
        item._status = 'saved'
        item._note = '등록 완료'
        saved++
      } catch (error: any) {
        item._status = 'error'
        item._note = error.message
        failed++
      }
    }

    setBulkData([...bulkData])
    setBulkLogs(prev => [...prev, `💾 ${saved}명 등록 완료${failed > 0 ? `, ${failed}명 실패` : ''}`])
    setBulkProcessing(false)

    if (saved > 0) fetchFreelancers()
  }

  // ── 샘플 엑셀 다운로드 ──
  const downloadTemplate = () => {
    const sample = [
      { '이름': '홍길동', '연락처': '010-1234-5678', '이메일': 'hong@email.com', '은행': 'KB국민은행', '계좌번호': '123-456-789012', '예금주': '홍길동', '주민번호': '', '세금유형': '사업소득(3.3%)', '업종': '탁송', '기본금액': 300000, '메모': '' },
      { '이름': '김철수', '연락처': '010-9876-5432', '이메일': '', '은행': '신한은행', '계좌번호': '110-123-456789', '예금주': '김철수', '주민번호': '', '세금유형': '사업소득(3.3%)', '업종': '대리운전', '기본금액': 0, '메모': '야간 전담' },
    ]
    const ws = XLSX.utils.json_to_sheet(sample)
    ws['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '프리랜서')
    XLSX.writeFile(wb, '프리랜서_등록양식.xlsx')
  }

  useEffect(() => { if (companyId) fetchFreelancers() }, [filter])

  const handleSave = async () => {
    if (!form.name) return alert('이름은 필수입니다.')
    const payload = { ...form}
    const headers = await getAuthHeader()

    try {
      if (editingId) {
        const res = await fetch(`/api/freelancers/${editingId}`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
        if (!res.ok) {
          const json = await res.json()
          return alert('수정 실패: ' + (json.error || '오류 발생'))
        }
      } else {
        const res = await fetch('/api/freelancers', { method: 'POST', headers, body: JSON.stringify(payload) })
        if (!res.ok) {
          const json = await res.json()
          return alert('등록 실패: ' + (json.error || '오류 발생'))
        }
      }
      alert('저장되었습니다.')
      setShowForm(false); setEditingId(null); setForm(emptyForm)
      fetchFreelancers()
    } catch (e: any) {
      alert('오류: ' + e.message)
    }
  }

  const handleEdit = (f: Freelancer) => {
    setForm({ name: f.name, phone: f.phone || '', email: f.email || '', bank_name: f.bank_name || 'KB국민은행', account_number: f.account_number || '', account_holder: f.account_holder || '', reg_number: f.reg_number || '', tax_type: f.tax_type || '사업소득(3.3%)', service_type: f.service_type || '기타', is_active: f.is_active, memo: f.memo || '' })
    setEditingId(f.id); setShowForm(true)
  }

  const handleToggleActive = async (f: Freelancer) => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/freelancers/${f.id}`, { method: 'PATCH', headers, body: JSON.stringify({ is_active: !f.is_active }) })
      if (res.ok) fetchFreelancers()
    } catch (e) { console.error(e) }
  }

  const handlePaymentSave = async () => {
    if (!payForm.freelancer_id || !payForm.gross_amount) return alert('프리랜서와 금액은 필수입니다.')
    const gross = Number(payForm.gross_amount)
    const taxRate = Number(payForm.tax_rate)
    const taxAmount = Math.round(gross * taxRate / 100)
    const netAmount = gross - taxAmount

    const payload = {
      freelancer_id: payForm.freelancer_id,
      payment_date: payForm.payment_date,
      gross_amount: gross,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      net_amount: netAmount,
      description: payForm.description,
      status: payForm.status,
    }

    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/freelancer-payments', { method: 'POST', headers, body: JSON.stringify(payload) })
      if (!res.ok) {
        const json = await res.json()
        return alert('등록 실패: ' + (json.error || '오류 발생'))
      }
      alert('지급 등록 완료')
      setShowPaymentForm(false); setPayForm(emptyPaymentForm)
      fetchPayments()
    } catch (e: any) {
      alert('오류: ' + e.message)
    }
  }

  const handlePaymentConfirm = async (p: Payment) => {
    if (!confirm(`${p.freelancers?.name}에게 ${Number(p.net_amount).toLocaleString()}원 지급 확정하시겠습니까?`)) return

    try {
      const headers = await getAuthHeader()

      // Update payment status
      await fetch(`/api/freelancer-payments/${p.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'paid', paid_date: new Date().toISOString().split('T')[0] })
      })

      // Insert transaction for net amount
      await fetch('/api/transactions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          transaction_date: p.payment_date,
          type: 'expense',
          category: '용역비(3.3%)',
          client_name: p.freelancers?.name || '프리랜서',
          amount: p.net_amount,
          description: `프리랜서 용역비 - ${p.freelancers?.name} (${p.description || ''})`,
          payment_method: '이체',
          status: 'completed',
          related_type: 'freelancer',
          related_id: p.freelancer_id,
          classification_source: 'auto_sync',
          confidence: 100,
        })
      })

      // Insert transaction for tax if applicable
      if (p.tax_amount > 0) {
        await fetch('/api/transactions', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            transaction_date: p.payment_date,
            type: 'expense',
            category: '세금/공과금',
            client_name: `원천세(${p.freelancers?.name})`,
            amount: p.tax_amount,
            description: `프리랜서 원천징수세 - ${p.freelancers?.name}`,
            payment_method: '이체',
            status: 'completed',
            related_type: 'freelancer',
            related_id: p.freelancer_id,
            classification_source: 'auto_sync',
            confidence: 100,
          })
        })
      }

      alert('지급 확정 및 장부 반영 완료')
      fetchPayments()
    } catch (e: any) {
      alert('오류: ' + e.message)
    }
  }

  const formatMoney = (n: number) => n ? Number(n).toLocaleString() : '0'
  const formatPhone = (v: string) => v.replace(/[^0-9]/g, "").replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, `$1-$2-$3`)

  const totalGross = payments.reduce((s, p) => s + Number(p.gross_amount || 0), 0)
  const totalTax = payments.reduce((s, p) => s + Number(p.tax_amount || 0), 0)
  const totalNet = payments.reduce((s, p) => s + Number(p.net_amount || 0), 0)
  const paidCount = payments.filter(p => p.status === 'paid').length

  const [listSearchTerm, setListSearchTerm] = useState('')

  const TABS = [
    { key: 'list' as const, label: '프리랜서 목록', icon: '👥' },
    { key: 'payments' as const, label: '지급 내역', icon: '💸' },
  ]

  // 검색 + 필터 적용
  const filteredFreelancers = freelancers.filter(f => {
    if (listSearchTerm) {
      const term = listSearchTerm.toLowerCase()
      if (!(f.name?.toLowerCase().includes(term) || f.phone?.includes(term) || f.bank_name?.toLowerCase().includes(term) || f.service_type?.toLowerCase().includes(term) || f.account_number?.includes(term))) return false
    }
    return true
  })

  const activeCount = freelancers.filter(f => f.is_active).length
  const inactiveCount = freelancers.filter(f => !f.is_active).length

  if (loading && freelancers.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-slate-200 border-t-slate-600 rounded-full animate-spin" />
          <span className="text-sm font-medium text-slate-400">불러오는 중...</span>
        </div>
      </div>
    )
  }

  if (!companyId && !loading) {
    return (
      <div className="page-bg">
        <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
            <div style={{ textAlign: 'left' }}>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">👥 프리랜서 관리</h1>
              <p className="text-gray-500 text-sm mt-1">외부 인력 관리 및 용역비 지급 · 원천징수 자동 계산 · 장부 자동 연동</p>
            </div>
          </div>
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
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6">

        {/* ── 헤더 ── */}
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ textAlign: 'left' }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.025em', margin: 0 }}>👥 프리랜서 관리</h1>
            <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>외부 인력 관리 및 용역비 지급 · 원천징수 자동 계산 · 장부 자동 연동</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true) }}
              className="flex items-center gap-2 bg-steel-600 text-white px-3 py-2 text-sm md:px-5 md:py-3 md:text-base rounded-xl font-bold hover:bg-steel-700 transition-colors">
              <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              <span>프리랜서 등록</span>
            </button>
          </div>
        </div>

        {/* ── 일괄등록 로그 & 미리보기 (제거됨) ── */}
        {(bulkLogs.length > 0 || bulkData.length > 0) && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', marginBottom: 24 }}>
            {bulkLogs.length > 0 && (
              <div style={{ padding: '12px 20px', borderBottom: bulkData.length > 0 ? '1px solid #f1f5f9' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {bulkLogs.map((log, i) => (
                    <p key={i} style={{ fontSize: 12, color: '#475569', margin: '2px 0', fontWeight: 500 }}>{log}</p>
                  ))}
                </div>
                <button onClick={downloadTemplate}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  📋 양식 다운로드
                </button>
              </div>
            )}
            {bulkData.length > 0 && (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['상태','이름','연락처','은행','계좌번호','업종','세금유형','비고'].map(h => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bulkData.map((d, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #f1f5f9', opacity: d._status === 'duplicate' ? 0.4 : 1, background: d._status === 'saved' ? '#f0fdf4' : d._status === 'error' ? '#fef2f2' : '#fff' }}>
                          <td style={{ padding: '8px 12px' }}>
                            {d._status === 'ready' && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#eff6ff', color: '#3b6eb5' }}>등록대기</span>}
                            {d._status === 'duplicate' && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#fef3c7', color: '#d97706' }}>중복</span>}
                            {d._status === 'saved' && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#dcfce7', color: '#16a34a' }}>완료</span>}
                            {d._status === 'error' && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#fee2e2', color: '#dc2626' }}>실패</span>}
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{d.name}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{d.phone}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{d.bank_name}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{d.account_number}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{d.service_type}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{d.tax_type}</td>
                          <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 11 }}>{d._note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: '0 0 16px 16px' }}>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                    전체 {bulkData.length}명 · 등록 대기 <strong style={{ color: '#3b6eb5' }}>{bulkData.filter(d => d._status === 'ready').length}</strong>명 · 중복 제외 <strong style={{ color: '#d97706' }}>{bulkData.filter(d => d._status === 'duplicate').length}</strong>명
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setBulkData([]); setBulkLogs([]) }}
                      style={{ background: '#f1f5f9', color: '#64748b', padding: '8px 14px', borderRadius: 10, fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer' }}>
                      초기화
                    </button>
                    <button onClick={handleBulkSave} disabled={bulkProcessing || bulkData.filter(d => d._status === 'ready').length === 0}
                      style={{ background: bulkProcessing ? '#94a3b8' : '#0f172a', color: '#fff', padding: '8px 16px', borderRadius: 10, fontWeight: 800, fontSize: 12, border: 'none', cursor: bulkProcessing ? 'not-allowed' : 'pointer' }}>
                      {bulkProcessing ? '⏳ 등록 중...' : `💾 ${bulkData.filter(d => d._status === 'ready').length}명 일괄 등록`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── KPI 스탯 카드 (DcStatStrip 사용) ── */}
        {freelancers.length > 0 && (
          <DcStatStrip
            stats={[
              { label: '전체', value: freelancers.length, unit: '명' },
              { label: '활성', value: activeCount, unit: '명' },
              { label: '비활성', value: inactiveCount, unit: '명' },
              { label: '3.3%', value: freelancers.filter(f => f.tax_type?.includes('3.3')).length, unit: '명' },
              { label: '8.8%', value: freelancers.filter(f => f.tax_type?.includes('8.8')).length, unit: '명' },
            ] as StatItem[]}
            fullWidth
          />
        )}

        {/* ── 탭 (DcToolbar 사용) ── */}
        <DcToolbar
          search={listSearchTerm}
          onSearchChange={setListSearchTerm}
          placeholder="이름, 연락처, 은행, 업종 검색..."
          filters={[
            { key: 'list', label: '프리랜서 목록', count: freelancers.length },
            { key: 'payments', label: '지급 내역', count: 0 },
          ] as FilterItem[]}
          activeFilter={activeTab}
          onFilterChange={(key) => setActiveTab(key as 'list' | 'payments')}
        />

        {/* ──── 탭1: 프리랜서 목록 (DcToolbar + DcSubFilters + NeuDataTable) ──── */}
        {activeTab === 'list' && (
          <>
            {/* 필터 (DcToolbar의 filters prop 사용) */}
            <DcToolbar
              search={filterSearchText}
              onSearchChange={setFilterSearchText}
              placeholder="필터 검색..."
              filters={[
                { key: 'all', label: '전체', count: freelancers.length },
                { key: 'active', label: '활성', count: activeCount },
                { key: 'inactive', label: '비활성', count: inactiveCount },
              ] as FilterItem[]}
              activeFilter={filter}
              onFilterChange={(key) => setFilter(key as 'all' | 'active' | 'inactive')}
            />

            {/* 데이터 테이블 (NeuDataTable 사용) */}
            <NeuDataTable<Freelancer>
              columns={[
                {
                  key: 'name',
                  label: '이름',
                  render: (f) => (
                    <div>
                      <span style={{ fontWeight: 900, fontSize: 16, color: '#0f2440' }}>{f.name}</span>
                      {f.memo && <p style={{ fontSize: 11, color: '#8aabc7', marginTop: 2 }}>{f.memo}</p>}
                    </div>
                  ),
                },
                {
                  key: 'phone',
                  label: '연락처',
                  render: (f) => <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#4b5563' }}>{f.phone || '-'}</span>,
                },
                {
                  key: 'service_type',
                  label: '업종',
                  render: (f) => (
                    f.service_type ? (
                      <span className="si-badge si-badge-blue">{f.service_type}</span>
                    ) : <span style={{ color: '#9ca3af' }}>-</span>
                  ),
                },
                {
                  key: 'bank',
                  label: '은행/계좌',
                  render: (f) => (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{f.bank_name || '-'}</div>
                      <div style={{ fontSize: 11, color: '#8aabc7', marginTop: 2, fontFamily: 'monospace' }}>{f.account_number || '-'}</div>
                    </div>
                  ),
                },
                {
                  key: 'tax_type',
                  label: '세금유형',
                  render: (f) => (
                    f.tax_type ? (
                      <span className={`si-badge ${f.tax_type.includes('3.3') ? 'si-badge-amber' : f.tax_type.includes('8.8') ? 'si-badge-red' : 'si-badge-slate'}`}>
                        {f.tax_type}
                      </span>
                    ) : <span style={{ color: '#9ca3af' }}>-</span>
                  ),
                },
                {
                  key: 'status',
                  label: '상태',
                  align: 'center',
                  render: (f) => (
                    <span className={`si-badge ${f.is_active ? 'si-badge-green' : 'si-badge-red'}`}>
                      {f.is_active ? '활성' : '비활성'}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  label: '관리',
                  align: 'center',
                  render: (f) => (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button
                        onClick={() => handleEdit(f)}
                        style={{
                          background: '#e0e7ff',
                          color: '#3b6eb5',
                          border: 'none',
                          borderRadius: 6,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleToggleActive(f)}
                        style={{
                          background: f.is_active ? '#fee2e2' : '#dcfce7',
                          color: f.is_active ? '#dc2626' : '#16a34a',
                          border: 'none',
                          borderRadius: 6,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {f.is_active ? '비활성' : '활성'}
                      </button>
                    </div>
                  ),
                },
              ]}
              data={filteredFreelancers}
              rowKey={(f) => f.id}
              loading={loading}
              emptyIcon="👥"
              emptyMessage={listSearchTerm ? '검색 결과가 없습니다.' : '등록된 프리랜서가 없습니다.'}
              mobileCard={{
                title: (f) => f.name,
                subtitle: (f) => f.service_type ? `${f.service_type} · ${f.phone || '연락처 없음'}` : f.phone || '연락처 없음',
                trailing: (f) => (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#3b6eb5' }}>{f.bank_name || '-'}</div>
                    <div style={{ fontSize: 10, color: '#8aabc7', marginTop: 2 }}>{f.account_number || '-'}</div>
                  </div>
                ),
                badges: (f) => (
                  <>
                    <span className={`si-badge ${f.is_active ? 'si-badge-green' : 'si-badge-red'}`}>
                      {f.is_active ? '활성' : '비활성'}
                    </span>
                    {f.service_type && <span className="si-badge si-badge-blue">{f.service_type}</span>}
                    {f.tax_type && <span className={`si-badge ${f.tax_type.includes('3.3') ? 'si-badge-amber' : 'si-badge-red'}`}>{f.tax_type}</span>}
                  </>
                ),
              }}
            />
          </>
        )}

        {/* ──── 탭2: 지급 내역 ──── */}
        {activeTab === 'payments' && (
          <>
            {/* 지급 내역 검색 및 필터 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="month"
                value={paymentMonth}
                onChange={(e) => setPaymentMonth(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button
                onClick={() => { setPayForm(emptyPaymentForm); setShowPaymentForm(true) }}
                className="flex items-center gap-2 bg-steel-600 text-white px-3 py-2 text-sm rounded-lg font-bold hover:bg-steel-700"
              >
                <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                지급 등록
              </button>
            </div>

            {/* 지급 통계 */}
            {payments.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
                <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '16px 20px', border: '1px solid #dcfce7' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', margin: 0, letterSpacing: '0.03em' }}>지급 총액</p>
                  <p style={{ fontSize: 24, fontWeight: 900, color: '#16a34a', margin: '4px 0 0' }}>{formatMoney(totalGross)}원</p>
                </div>
                <div style={{ background: '#fee2e2', borderRadius: 12, padding: '16px 20px', border: '1px solid #fecaca' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', margin: 0, letterSpacing: '0.03em' }}>세금</p>
                  <p style={{ fontSize: 24, fontWeight: 900, color: '#dc2626', margin: '4px 0 0' }}>{formatMoney(totalTax)}원</p>
                </div>
                <div style={{ background: '#eff6ff', borderRadius: 12, padding: '16px 20px', border: '1px solid #bfdbfe' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#3b6eb5', margin: 0, letterSpacing: '0.03em' }}>순액</p>
                  <p style={{ fontSize: 24, fontWeight: 900, color: '#3b6eb5', margin: '4px 0 0' }}>{formatMoney(totalNet)}원</p>
                </div>
                <div style={{ background: '#ecfdf5', borderRadius: 12, padding: '16px 20px', border: '1px solid #a7f3d0' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#059669', margin: 0, letterSpacing: '0.03em' }}>지급 완료</p>
                  <p style={{ fontSize: 24, fontWeight: 900, color: '#059669', margin: '4px 0 0' }}>{paidCount}건</p>
                </div>
              </div>
            )}

            {/* 지급 내역 테이블 (별도 유지 — 복잡한 구조) */}
            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              {payments.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af' }}>
                  선택된 기간에 지급 내역이 없습니다.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', textAlign: 'left', fontSize: 14, minWidth: 900, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(249,250,251,0.5)', borderBottom: '1px solid #f3f4f6' }}>
                        <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>프리랜서</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>지급액</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>세율</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>세금</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>순액</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>상태</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, i) => (
                        <tr key={p.id} style={{ borderTop: '1px solid #f3f4f6' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,250,252,0.5)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td style={{ padding: '12px 20px' }}>
                            <span style={{ fontWeight: 900, fontSize: 16, color: '#111827' }}>{p.freelancers?.name || '(삭제됨)'}</span>
                            {p.description && <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{p.description}</p>}
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>{formatMoney(Number(p.gross_amount))}원</td>
                          <td style={{ padding: '12px 16px', color: '#4b5563' }}>{Number(p.tax_rate)}%</td>
                          <td style={{ padding: '12px 16px', color: '#4b5563', fontWeight: 600 }}>{formatMoney(Number(p.tax_amount))}원</td>
                          <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 15, color: '#3b6eb5' }}>{formatMoney(Number(p.net_amount))}원</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span className={`si-badge ${p.status === 'paid' ? 'si-badge-green' : 'si-badge-amber'}`}>
                              {p.status === 'paid' ? '지급완료' : '대기중'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            {p.status !== 'paid' && (
                              <button
                                onClick={() => handlePaymentConfirm(p)}
                                style={{
                                  background: '#16a34a',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: 6,
                                  padding: '4px 12px',
                                  cursor: 'pointer',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                확정
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

      </div>

      {/* ──── 모달: 프리랜서 등록/수정 (별도 유지) ──── */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'flex-end', zIndex: 50,
        }} onClick={() => setShowForm(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', width: '100%', maxWidth: 600, borderRadius: '24px 24px 0 0', padding: '32px 24px 28px', maxHeight: '90vh', overflowY: 'auto',
            }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 20px', color: '#111827' }}>
              {editingId ? '프리랜서 수정' : '프리랜서 등록'}
            </h2>

            <div style={{ display: 'grid', gap: 16 }}>
              {/* 기본정보 */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>이름 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="홍길동"
                  style={{
                    width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>연락처</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
                    placeholder="010-1234-5678"
                    style={{
                      width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>이메일</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="email@example.com"
                    style={{
                      width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff'
                    }}
                  />
                </div>
              </div>

              {/* 은행정보 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>은행</label>
                  <select
                    value={form.bank_name}
                    onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                    style={{
                      width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff'
                    }}
                  >
                    {KOREAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>계좌번호</label>
                  <input
                    type="text"
                    value={form.account_number}
                    onChange={(e) => setForm({ ...form, account_number: e.target.value.replace(/[^0-9\-]/g, '') })}
                    placeholder="123-456-789012"
                    style={{
                      width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff', fontFamily: 'monospace'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>예금주</label>
                  <input
                    type="text"
                    value={form.account_holder}
                    onChange={(e) => setForm({ ...form, account_holder: e.target.value })}
                    placeholder="홍길동"
                    style={{
                      width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>주민/사업자번호</label>
                  <input
                    type="text"
                    value={form.reg_number}
                    onChange={(e) => setForm({ ...form, reg_number: e.target.value.replace(/[^0-9\-]/g, '') })}
                    placeholder="123456-1234567"
                    style={{
                      width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff', fontFamily: 'monospace'
                    }}
                  />
                </div>
              </div>

              {/* 세금/용역 정보 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>세금 유형</label>
                  <select
                    value={form.tax_type}
                    onChange={(e) => setForm({ ...form, tax_type: e.target.value })}
                    style={{
                      width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff'
                    }}
                  >
                    {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>업종</label>
                  <select
                    value={form.service_type}
                    onChange={(e) => setForm({ ...form, service_type: e.target.value })}
                    style={{
                      width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff'
                    }}
                  >
                    {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>메모</label>
                <textarea
                  value={form.memo}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  placeholder="추가 메모..."
                  style={{
                    width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff', minHeight: 80, resize: 'vertical'
                  }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 14, color: '#1e293b', fontWeight: 500 }}>활성 상태</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  flex: 1, padding: '12px 20px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#6b7280'
                }}
              >
                취소
              </button>
              <button
                onClick={handleSave}
                style={{
                  flex: 1, padding: '12px 20px', borderRadius: 10, background: '#0f172a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14
                }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──── 모달: 지급 등록 (별도 유지) ──── */}
      {showPaymentForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'flex-end', zIndex: 50,
        }} onClick={() => setShowPaymentForm(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', width: '100%', maxWidth: 600, borderRadius: '24px 24px 0 0', padding: '32px 24px 28px', maxHeight: '90vh', overflowY: 'auto',
            }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 20px', color: '#111827' }}>지급 등록</h2>

            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>프리랜서 선택 *</label>
                <select
                  value={payForm.freelancer_id}
                  onChange={(e) => setPayForm({ ...payForm, freelancer_id: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff'
                  }}
                >
                  <option value="">선택하세요</option>
                  {freelancers.filter(f => f.is_active).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>지급일</label>
                  <input
                    type="date"
                    value={payForm.payment_date}
                    onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
                    style={{
                      width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>세율 (%)</label>
                  <input
                    type="number"
                    value={payForm.tax_rate}
                    onChange={(e) => setPayForm({ ...payForm, tax_rate: Number(e.target.value) })}
                    step="0.1"
                    style={{
                      width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>지급액 (세전) *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number"
                    value={payForm.gross_amount}
                    onChange={(e) => setPayForm({ ...payForm, gross_amount: e.target.value })}
                    placeholder="0"
                    style={{
                      flex: 1, padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff'
                    }}
                  />
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>원</span>
                </div>
              </div>

              {payForm.gross_amount && (
                <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16, border: '1px solid #dcfce7' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                    <span>세금 ({payForm.tax_rate}%):</span>
                    <span style={{ fontWeight: 700 }}>{formatMoney(Math.round(Number(payForm.gross_amount) * Number(payForm.tax_rate) / 100))}원</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderTop: '1px solid #d1fae5', paddingTop: 8 }}>
                    <span style={{ fontWeight: 700 }}>순액:</span>
                    <span style={{ fontWeight: 900, fontSize: 15, color: '#16a34a' }}>{formatMoney(Number(payForm.gross_amount) - Math.round(Number(payForm.gross_amount) * Number(payForm.tax_rate) / 100))}원</span>
                  </div>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>설명</label>
                <textarea
                  value={payForm.description}
                  onChange={(e) => setPayForm({ ...payForm, description: e.target.value })}
                  placeholder="지급 사유 등..."
                  style={{
                    width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff', minHeight: 60, resize: 'vertical'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={() => setShowPaymentForm(false)}
                style={{
                  flex: 1, padding: '12px 20px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#6b7280'
                }}
              >
                취소
              </button>
              <button
                onClick={handlePaymentSave}
                style={{
                  flex: 1, padding: '12px 20px', borderRadius: 10, background: '#0f172a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14
                }}
              >
                등록
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
