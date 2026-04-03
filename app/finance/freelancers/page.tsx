'use client'

import { useEffect, useState, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import * as XLSX from 'xlsx'
async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/firebase')
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

export default function FreelancersPage() {
  const { company, role } = useApp()
  const companyId = company?.id

  const [loading, setLoading] = useState(true)
  const [freelancers, setFreelancers] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'list' | 'payments'>('list')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active')
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

  const handleEdit = (f: any) => {
    setForm({ name: f.name, phone: f.phone || '', email: f.email || '', bank_name: f.bank_name || 'KB국민은행', account_number: f.account_number || '', account_holder: f.account_holder || '', reg_number: f.reg_number || '', tax_type: f.tax_type || '사업소득(3.3%)', service_type: f.service_type || '기타', is_active: f.is_active, memo: f.memo || '' })
    setEditingId(f.id); setShowForm(true)
  }

  const handleToggleActive = async (f: any) => {
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

  const handlePaymentConfirm = async (p: any) => {
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
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'left' }}>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">👥 프리랜서 관리</h1>
            <p className="text-gray-500 text-sm mt-1">외부 인력 관리 및 용역비 지급 · 원천징수 자동 계산 · 장부 자동 연동</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm text-center py-20">
          <p className="text-4xl mb-3">🏢</p>
          <p className="font-semibold text-sm text-slate-500">좌측 상단에서 회사를 먼저 선택해주세요</p>
          <p className="text-xs text-slate-400 mt-1">회사 선택 후 프리랜서 관리를 진행할 수 있습니다</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">

      {/* 헤더 — 보험 페이지 스타일 */}
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

      {/* 드래그앤드롭 업로드 영역 */}
      <div
        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        style={{
          border: isDragging ? '2px dashed #6366f1' : '2px dashed #d1d5db',
          borderRadius: 16, padding: aiParsing ? '32px 20px' : '24px 20px', marginBottom: 24, textAlign: 'center',
          background: isDragging ? 'linear-gradient(135deg, #eef2ff, #e0e7ff)' : aiParsing ? 'linear-gradient(135deg, #f0fdf4, #ecfdf5)' : '#fff',
          transition: 'all 0.3s', cursor: 'pointer', position: 'relative',
        }}>
        {aiParsing ? (
          <>
            <div style={{ width: 32, height: 32, border: '3px solid #bbf7d0', borderTopColor: '#16a34a', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
            <p style={{ fontWeight: 800, fontSize: 14, color: '#166534', margin: 0 }}>🤖 Gemini AI가 파일을 분석 중...</p>
            <p style={{ fontSize: 12, color: '#15803d', marginTop: 4 }}>엑셀, 이미지, PDF 어떤 형식이든 자동으로 인식합니다</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </>
        ) : (
          <>
            <span style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>{isDragging ? '📥' : '📂'}</span>
            <p style={{ fontWeight: 800, fontSize: 14, color: isDragging ? '#4338ca' : '#0f172a', margin: 0 }}>
              {isDragging ? '여기에 놓으세요!' : '프리랜서 엑셀/이미지 파일을 드래그하여 일괄 등록'}
            </p>
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              엑셀 · CSV · 이미지 · PDF 지원 · 여러 파일 동시 가능 · Gemini AI 자동 분석
            </p>
            <input ref={bulkFileRef} type="file" accept=".xlsx,.xls,.csv,.png,.jpg,.jpeg,.pdf"
              multiple
              onChange={handleBulkFile}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          </>
        )}
      </div>

      {/* 일괄등록 로그 & 미리보기 */}
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
                          {d._status === 'ready' && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#eff6ff', color: '#3b82f6' }}>등록대기</span>}
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
                  전체 {bulkData.length}명 · 등록 대기 <strong style={{ color: '#3b82f6' }}>{bulkData.filter(d => d._status === 'ready').length}</strong>명 · 중복 제외 <strong style={{ color: '#d97706' }}>{bulkData.filter(d => d._status === 'duplicate').length}</strong>명
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

      {/* 통계 카드 — 보험 페이지 스타일 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: '전체 인원', value: freelancers.length, unit: '명', color: '#111827' },
          { label: '활성', value: activeCount, unit: '명', color: '#16a34a', bg: '#f0fdf4' },
          { label: '비활성', value: inactiveCount, unit: '명', color: '#dc2626', bg: '#fef2f2' },
          { label: '사업소득(3.3%)', value: freelancers.filter(f => f.tax_type?.includes('3.3')).length, unit: '명', color: '#d97706', bg: '#fffbeb' },
          { label: '기타소득(8.8%)', value: freelancers.filter(f => f.tax_type?.includes('8.8')).length, unit: '명', color: '#7c3aed', bg: '#f5f3ff' },
        ].map(stat => (
          <div key={stat.label} style={{ background: stat.bg || '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e5e7eb' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: stat.color || '#6b7280', margin: 0, letterSpacing: '0.03em' }}>{stat.label}</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: stat.color, margin: '4px 0 0' }}>{stat.value}<span style={{ fontSize: 14, fontWeight: 500, color: '#9ca3af', marginLeft: 2 }}>{stat.unit}</span></p>
          </div>
        ))}
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 20px', borderRadius: 20, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              background: activeTab === tab.key ? '#0f172a' : '#fff',
              color: activeTab === tab.key ? '#fff' : '#6b7280',
              border: activeTab === tab.key ? 'none' : '1px solid #e5e7eb',
            }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ──── 탭1: 프리랜서 목록 ──── */}
      {activeTab === 'list' && (
        <>
          {/* 필터 + 검색 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {(['all', 'active', 'inactive'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  padding: '7px 16px', borderRadius: 20, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  background: filter === f ? '#0f172a' : '#fff',
                  color: filter === f ? '#fff' : '#6b7280',
                  border: filter === f ? 'none' : '1px solid #e5e7eb',
                }}>
                {f === 'active' ? `활성 (${activeCount})` : f === 'all' ? `전체 (${freelancers.length})` : `비활성 (${inactiveCount})`}
              </button>
            ))}
          </div>

          {/* 검색바 */}
          <div style={{ marginBottom: 16 }}>
            <input
              placeholder="이름, 연락처, 은행, 업종 검색..."
              style={{ width: '100%', padding: '10px 16px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 14, outline: 'none', background: '#fff' }}
              value={listSearchTerm}
              onChange={e => setListSearchTerm(e.target.value)}
            />
          </div>

          {/* 테이블 — 보험 페이지 스타일 */}
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
            {filteredFreelancers.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af' }}>
                {freelancers.length === 0 ? '등록된 프리랜서가 없습니다.' : '해당 조건의 프리랜서가 없습니다.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', textAlign: 'left', fontSize: 14, minWidth: 800, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(249,250,251,0.5)', borderBottom: '1px solid #f3f4f6' }}>
                      <th style={{ padding: '12px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>이름</th>
                      <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>연락처</th>
                      <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>업종</th>
                      <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>은행/계좌</th>
                      <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>세금유형</th>
                      <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>상태</th>
                      <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFreelancers.map(f => (
                      <tr key={f.id} style={{ borderTop: '1px solid #f3f4f6', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,250,252,0.5)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{ fontWeight: 900, fontSize: 16, color: '#111827' }}>{f.name}</span>
                          {f.memo && <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{f.memo}</p>}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#4b5563', fontFamily: 'monospace', fontSize: 13 }}>{f.phone || '-'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {f.service_type ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: 6 }}>{f.service_type}</span>
                          ) : '-'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontWeight: 700, color: '#374151', fontSize: 13 }}>{f.bank_name}</span>
                          <span style={{ background: '#f3f4f6', color: '#4b5563', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 11, fontWeight: 700, border: '1px solid #e5e7eb', marginLeft: 6 }}>{f.account_number || '-'}</span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#4b5563', fontSize: 13 }}>{f.tax_type || '-'}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {f.is_active ? (
                            <span style={{ background: '#dcfce7', color: '#16a34a', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>활성</span>
                          ) : (
                            <span style={{ background: '#f3f4f6', color: '#9ca3af', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>비활성</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button onClick={() => handleEdit(f)}
                              style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', padding: '4px 10px', borderRadius: 6, border: 'none', background: '#f3f4f6', cursor: 'pointer' }}>
                              수정
                            </button>
                            <button onClick={() => handleToggleActive(f)}
                              style={{ fontSize: 12, fontWeight: 600, color: f.is_active ? '#dc2626' : '#16a34a', padding: '4px 10px', borderRadius: 6, border: 'none', background: f.is_active ? '#fef2f2' : '#f0fdf4', cursor: 'pointer' }}>
                              {f.is_active ? '비활성화' : '활성화'}
                            </button>
                          </div>
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

      {/* ──── 탭2: 지급 내역 ──── */}
      {activeTab === 'payments' && (
        <div className="space-y-5">
          {/* 월 요약 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: '총 지급 건수', value: payments.length, unit: '건', color: 'text-slate-900' },
              { label: '총 지급액 (세전)', value: formatMoney(totalGross), unit: '원', color: 'text-slate-900' },
              { label: '원천징수세', value: formatMoney(totalTax), unit: '원', color: 'text-red-500' },
              { label: '실지급 총액', value: formatMoney(totalNet), unit: '원', color: 'text-emerald-600' },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
                <p className={`text-lg font-bold ${stat.color}`}>{stat.value}<span className="text-xs font-normal text-slate-400 ml-0.5">{stat.unit}</span></p>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center">
            <input type="month" value={paymentMonth} onChange={e => setPaymentMonth(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" />
            <button onClick={() => setShowPaymentForm(true)}
              className="px-4 py-2 bg-steel-600 text-white rounded-lg font-semibold text-sm hover:bg-steel-700 transition-all active:scale-[0.98] shadow-lg shadow-steel-600/10">
              지급 등록
            </button>
          </div>

          <section style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            {payments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      <th className="p-3.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">프리랜서</th>
                      <th className="p-3.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">지급일</th>
                      <th className="p-3.5 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider">세전 금액</th>
                      <th className="p-3.5 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider">원천세</th>
                      <th className="p-3.5 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider">실지급액</th>
                      <th className="p-3.5 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider">상태</th>
                      <th className="p-3.5 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {payments.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3.5">
                          <p className="font-semibold text-slate-700">{p.freelancers?.name || '-'}</p>
                          {p.description && <p className="text-xs text-slate-400 mt-0.5">{p.description}</p>}
                        </td>
                        <td className="p-3.5 text-slate-500">{p.payment_date}</td>
                        <td className="p-3.5 text-right font-semibold text-slate-700">{formatMoney(p.gross_amount)}원</td>
                        <td className="p-3.5 text-right text-red-500">{formatMoney(p.tax_amount)}원</td>
                        <td className="p-3.5 text-right font-bold text-emerald-600">{formatMoney(p.net_amount)}원</td>
                        <td className="p-3.5 text-center">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                            p.status === 'paid' ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' :
                            p.status === 'cancelled' ? 'bg-red-50 text-red-500 ring-1 ring-red-200' :
                            'bg-amber-50 text-amber-600 ring-1 ring-amber-200'
                          }`}>
                            {p.status === 'paid' ? '지급완료' : p.status === 'cancelled' ? '취소' : '대기'}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          {p.status === 'pending' && (
                            <button onClick={() => handlePaymentConfirm(p)}
                              className="text-xs font-semibold text-slate-900 bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                              지급 확정
                            </button>
                          )}
                          {p.status === 'paid' && (
                            <span className="text-xs text-slate-400">장부 반영됨</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16">
                <svg className="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
                <p className="font-semibold text-sm text-slate-500">해당 월 지급 내역이 없습니다</p>
                <p className="text-xs text-slate-400 mt-1">지급 등록 후 확정하면 장부에 자동 반영됩니다</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ──── 프리랜서 등록/수정 모달 ──── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-base text-slate-900">{editingId ? '프리랜서 수정' : '프리랜서 등록'}</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">이름 <span className="text-red-400">*</span></label>
                  <input className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">연락처</label>
                  <input className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={form.phone} onChange={e => setForm({ ...form, phone: formatPhone(e.target.value) })} maxLength={13} placeholder="010-0000-0000" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">이메일</label>
                <input type="email" className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">원천징수 유형</label>
                  <select className="w-full border border-slate-200 p-3 rounded-xl text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={form.tax_type} onChange={e => setForm({ ...form, tax_type: e.target.value })}>
                    {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">서비스 유형</label>
                  <select className="w-full border border-slate-200 p-3 rounded-xl text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })}>
                    {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">사업자/주민등록번호</label>
                <input className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={form.reg_number} onChange={e => setForm({ ...form, reg_number: e.target.value })} placeholder="000-00-00000" />
              </div>
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-3">계좌 정보</p>
                <div className="grid grid-cols-3 gap-3">
                  <select className="border border-slate-200 p-3 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })}>
                    {KOREAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <input className="border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all" value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} placeholder="계좌번호" />
                  <input className="border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all" value={form.account_holder} onChange={e => setForm({ ...form, account_holder: e.target.value })} placeholder="예금주" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">메모</label>
                <textarea className="w-full border border-slate-200 p-3 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" rows={2} value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button onClick={() => { setShowForm(false); setEditingId(null) }} className="flex-1 py-3 bg-slate-100 rounded-xl font-semibold text-sm text-slate-600 hover:bg-slate-200 transition-colors">취소</button>
              <button onClick={handleSave} className="flex-[2] py-3 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-all active:scale-[0.99] shadow-lg shadow-steel-600/10">{editingId ? '수정 완료' : '등록 완료'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ──── 지급 등록 모달 ──── */}
      {showPaymentForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-base text-slate-900">용역비 지급 등록</h3>
              <p className="text-xs text-slate-400 mt-0.5">지급 확정 시 장부에 자동 반영됩니다</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">프리랜서 <span className="text-red-400">*</span></label>
                <select className="w-full border border-slate-200 p-3 rounded-xl text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all" value={payForm.freelancer_id} onChange={e => {
                  const selected = freelancers.find(f => f.id === e.target.value)
                  setPayForm({
                    ...payForm,
                    freelancer_id: e.target.value,
                    tax_rate: selected?.tax_type === '기타소득(8.8%)' ? 8.8 : selected?.tax_type === '사업소득(3.3%)' ? 3.3 : 0
                  })
                }}>
                  <option value="">선택하세요</option>
                  {freelancers.filter(f => f.is_active).map(f => <option key={f.id} value={f.id}>{f.name} ({f.service_type})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">지급일</label>
                  <input type="date" className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all" value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">세율(%)</label>
                  <input type="number" step="0.1" className="w-full border border-slate-200 p-3 rounded-xl text-sm text-right focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all" value={payForm.tax_rate} onChange={e => setPayForm({ ...payForm, tax_rate: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">세전 금액 <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input type="text" className="w-full border-2 border-slate-200 p-3.5 pr-10 rounded-xl text-right font-bold text-lg focus:border-slate-400 focus:ring-0 outline-none transition-all"
                    value={payForm.gross_amount ? Number(payForm.gross_amount).toLocaleString() : ''}
                    onChange={e => setPayForm({ ...payForm, gross_amount: e.target.value.replace(/,/g, '') })}
                    placeholder="0" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">원</span>
                </div>
                {payForm.gross_amount && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">원천징수세 ({payForm.tax_rate}%)</span><span className="font-semibold text-red-500">-{Math.round(Number(payForm.gross_amount) * Number(payForm.tax_rate) / 100).toLocaleString()}원</span></div>
                    <div className="flex justify-between border-t border-slate-200 pt-1"><span className="text-slate-700 font-semibold">실지급액</span><span className="font-bold text-emerald-600">{Math.round(Number(payForm.gross_amount) * (1 - Number(payForm.tax_rate) / 100)).toLocaleString()}원</span></div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">설명</label>
                <input className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all" value={payForm.description} onChange={e => setPayForm({ ...payForm, description: e.target.value })} placeholder="작업 내용" />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button onClick={() => setShowPaymentForm(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-semibold text-sm text-slate-600 hover:bg-slate-200 transition-colors">취소</button>
              <button onClick={handlePaymentSave} className="flex-[2] py-3 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-all active:scale-[0.99] shadow-lg shadow-steel-600/10">등록</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
