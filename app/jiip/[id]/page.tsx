'use client'
import { supabase } from '../../utils/supabase'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApp } from '../../context/AppContext'
import ContractPaper from '../../components/ContractPaper'
import { useDaumPostcodePopup } from 'react-daum-postcode'
import SignatureCanvas from 'react-signature-canvas'
import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'

const KOREAN_BANKS = [
  'KB국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행',
  'IBK기업은행', 'SC제일은행', '씨티은행', 'KDB산업은행',
  '카카오뱅크', '케이뱅크', '토스뱅크',
  '우체국', '새마을금고', '신협', '수협', '산림조합',
  '대구은행', '부산은행', '경남은행', '광주은행', '전북은행', '제주은행'
]

const STATUS_LABELS: Record<string, { label: string; bg: string }> = {
  active: { label: '운영중', bg: 'bg-green-100 text-green-700' },
  expired: { label: '만기', bg: 'bg-red-100 text-red-700' },
  terminated: { label: '해지', bg: 'bg-gray-100 text-gray-600' },
  renewed: { label: '갱신', bg: 'bg-blue-100 text-blue-700' },
}

export default function JiipDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { company, role } = useApp()
  const isNew = params.id === 'new'
  const jiipId = isNew ? null : params.id

  const [loading, setLoading] = useState(!isNew)
  const [cars, setCars] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'info' | 'contract' | 'payments' | 'history'>('info')

  // 실제 통장 입금 총액
  const [realDepositTotal, setRealDepositTotal] = useState(0)

  // 발송 관련
  const [sendingLogs, setSendingLogs] = useState<any[]>([])
  const [sendingEmail, setSendingEmail] = useState('')
  const [sendingPhone, setSendingPhone] = useState('')
  const [sendChannel, setSendChannel] = useState<'email' | 'kakao' | 'both'>('email')
  const [isSending, setIsSending] = useState(false)

  // 상태 관련
  const [statusHistory, setStatusHistory] = useState<any[]>([])
  const [changingStatus, setChangingStatus] = useState(false)

  // 결제 스케줄
  const [paymentSchedules, setPaymentSchedules] = useState<any[]>([])
  const [paymentTransactions, setPaymentTransactions] = useState<any[]>([])
  const [paymentSummary, setPaymentSummary] = useState<any>(null)
  const [generatingSchedule, setGeneratingSchedule] = useState(false)

  // 데이터 상태
  const [item, setItem] = useState<any>({
    car_id: '', tax_type: '세금계산서',
    investor_name: '', investor_phone: '', investor_reg_number: '', investor_email: '',
    investor_address: '', investor_address_detail: '',
    bank_name: 'KB국민은행', account_number: '', account_holder: '',
    contract_start_date: '', contract_end_date: '',
    invest_amount: 0, admin_fee: 200000, share_ratio: 70, payout_day: 10,
    mortgage_setup: false, memo: '', signed_file_url: '', status: 'active'
  })

  // UI 상태
  const [showPreview, setShowPreview] = useState(false)
  const [showSignPad, setShowSignPad] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [canvasWidth, setCanvasWidth] = useState(300)

  const sigCanvas = useRef<any>({})
  const hiddenContractRef = useRef<HTMLDivElement>(null)
  const [tempSignature, setTempSignature] = useState<string>('')
  const open = useDaumPostcodePopup()

  // ── 초기화 ──
  useEffect(() => {
    const handleResize = () => setCanvasWidth(window.innerWidth > 600 ? 500 : window.innerWidth - 40)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    fetchCars()
    if (!isNew && jiipId) {
      fetchDetail()
      fetchRealDeposit()
    }
  }, [])

  // 탭 변경 시 데이터 로드
  useEffect(() => {
    if (!jiipId) return
    if (activeTab === 'contract') loadSendingLogs()
    if (activeTab === 'payments') loadPaymentSchedule()
    if (activeTab === 'history') loadStatusHistory()
  }, [activeTab, jiipId])

  // 계약 시작일 → 종료일 자동 계산 (3년)
  useEffect(() => {
    if (item.contract_start_date) {
      const start = new Date(item.contract_start_date)
      start.setFullYear(start.getFullYear() + 3)
      start.setDate(start.getDate() - 1)
      if (!item.contract_end_date) {
        setItem((prev: any) => ({ ...prev, contract_end_date: start.toISOString().split('T')[0] }))
      }
    }
  }, [item.contract_start_date])

  // ── 데이터 조회 ──
  const fetchCars = async () => {
    let query = supabase.from('cars').select('id, number, brand, model, company_id')
    if (role !== 'god_admin' && company?.id) query = query.eq('company_id', company.id)
    const { data } = await query.order('number', { ascending: true })
    setCars(data || [])
  }

  const fetchDetail = async () => {
    const { data, error } = await supabase.from('jiip_contracts').select('*').eq('id', jiipId).single()
    if (error) { alert('데이터 로드 실패'); router.push('/jiip'); return }
    setItem({
      ...data,
      investor_address: data.investor_address || '',
      investor_address_detail: data.investor_address_detail || '',
      investor_email: data.investor_email || '',
      account_holder: data.account_holder || '',
      invest_amount: data.invest_amount || 0,
      admin_fee: data.admin_fee || 200000,
      share_ratio: data.share_ratio || 70,
      payout_day: data.payout_day || 10,
      tax_type: data.tax_type || '세금계산서',
      signed_file_url: data.signed_file_url || '',
      status: data.status || 'active',
    })
    setSendingEmail(data.investor_email || '')
    setLoading(false)
  }

  const fetchRealDeposit = async () => {
    const { data } = await supabase
      .from('transactions').select('amount')
      .eq('related_type', 'jiip').eq('related_id', jiipId).eq('type', 'income')
    if (data) setRealDepositTotal(data.reduce((acc, cur) => acc + (cur.amount || 0), 0))
  }

  // ── API 호출 헬퍼 ──
  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
  }

  // ── 발송 관련 ──
  const loadSendingLogs = async () => {
    const headers = await getAuthHeaders()
    const res = await fetch(`/api/contracts/send-email?contract_type=jiip&contract_id=${jiipId}`, { headers })
    if (res.ok) { const { data } = await res.json(); setSendingLogs(data || []) }
  }

  const handleSend = async () => {
    if ((sendChannel === 'email' || sendChannel === 'both') && !sendingEmail) return alert('이메일을 입력해주세요.')
    if ((sendChannel === 'kakao' || sendChannel === 'both') && !sendingPhone) return alert('휴대폰 번호를 입력해주세요.')
    setIsSending(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/contracts/send-email', {
        method: 'POST', headers,
        body: JSON.stringify({
          contract_type: 'jiip', contract_id: jiipId,
          recipient_email: sendingEmail || undefined,
          recipient_phone: sendingPhone || undefined,
          send_channel: sendChannel,
        }),
      })
      const result = await res.json()
      if (result.success) {
        const msgs: string[] = []
        if (result.emailSent) msgs.push('이메일')
        if (result.kakaoSent) msgs.push(result.smsFallback ? '문자(SMS)' : '카카오톡')
        if (msgs.length > 0) alert(`${msgs.join(' + ')} 발송 완료!`)
        else alert(`발송 처리됨 (${(result.errors || []).join(', ')})`)
        loadSendingLogs()
      } else {
        alert('발송 실패: ' + result.error)
      }
    } catch { alert('발송 중 오류 발생') }
    finally { setIsSending(false) }
  }

  // ── 상태 관련 ──
  const loadStatusHistory = async () => {
    const headers = await getAuthHeaders()
    const res = await fetch(`/api/contracts/status?contract_type=jiip&contract_id=${jiipId}`, { headers })
    if (res.ok) { const { data } = await res.json(); setStatusHistory(data || []) }
  }

  const handleStatusChange = async (newStatus: string) => {
    const reason = prompt(`상태를 '${STATUS_LABELS[newStatus]?.label}'(으)로 변경합니다.\n사유를 입력하세요:`)
    if (reason === null) return
    setChangingStatus(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/contracts/status', {
        method: 'POST', headers,
        body: JSON.stringify({ contract_type: 'jiip', contract_id: jiipId, new_status: newStatus, reason }),
      })
      const result = await res.json()
      if (result.success) {
        setItem((prev: any) => ({ ...prev, status: newStatus }))
        loadStatusHistory()
        alert('상태가 변경되었습니다.')
      } else { alert(result.error) }
    } catch { alert('상태 변경 중 오류') }
    finally { setChangingStatus(false) }
  }

  // ── 결제 스케줄 ──
  const loadPaymentSchedule = async () => {
    const headers = await getAuthHeaders()
    const res = await fetch(`/api/contracts/payment-schedule?contract_type=jiip&contract_id=${jiipId}`, { headers })
    if (res.ok) {
      const result = await res.json()
      setPaymentSchedules(result.schedules || [])
      setPaymentTransactions(result.transactions || [])
      setPaymentSummary(result.summary || null)
    }
  }

  const generateSchedule = async () => {
    if (!confirm('결제 스케줄을 (재)생성합니다. 기존 스케줄은 초기화됩니다.')) return
    setGeneratingSchedule(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/contracts/payment-schedule', {
        method: 'POST', headers,
        body: JSON.stringify({ contract_type: 'jiip', contract_id: jiipId }),
      })
      const result = await res.json()
      if (result.success) {
        alert(`${result.count}개월 스케줄이 생성되었습니다.`)
        loadPaymentSchedule()
      } else { alert(result.error) }
    } catch { alert('스케줄 생성 실패') }
    finally { setGeneratingSchedule(false) }
  }

  // ── 저장/삭제 ──
  const handleAddressComplete = (data: any) => {
    let fullAddress = data.address
    let extraAddress = ''
    if (data.addressType === 'R') {
      if (data.bname !== '') extraAddress += data.bname
      if (data.buildingName !== '') extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName)
      fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '')
    }
    setItem((prev: any) => ({ ...prev, investor_address: fullAddress }))
  }

  const handleSave = async () => {
    if (!item.car_id || !item.investor_name) return alert('차량과 투자자 정보는 필수입니다.')
    const selectedCar = cars.find(c => c.id == item.car_id)
    if (!selectedCar?.company_id) return alert('선택된 차량의 회사 정보를 찾을 수 없습니다.')

    const payload = {
      company_id: selectedCar.company_id,
      car_id: item.car_id, investor_name: item.investor_name, investor_phone: item.investor_phone,
      investor_reg_number: item.investor_reg_number, investor_email: item.investor_email,
      investor_address: item.investor_address, investor_address_detail: item.investor_address_detail,
      bank_name: item.bank_name, account_number: item.account_number,
      account_holder: item.account_holder, contract_start_date: item.contract_start_date || null,
      contract_end_date: item.contract_end_date || null,
      invest_amount: item.invest_amount, admin_fee: item.admin_fee,
      share_ratio: item.share_ratio, payout_day: item.payout_day,
      tax_type: item.tax_type, mortgage_setup: item.mortgage_setup, memo: item.memo,
      signed_file_url: item.signed_file_url
    }

    const { error } = isNew
      ? await supabase.from('jiip_contracts').insert(payload)
      : await supabase.from('jiip_contracts').update(payload).eq('id', jiipId)

    if (error) alert('저장 실패: ' + error.message)
    else { alert('저장되었습니다!'); if (isNew) router.push('/jiip') }
  }

  const handleDelete = async () => {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('jiip_contracts').delete().eq('id', jiipId)
    router.push('/jiip')
  }

  // ── 서명 ──
  const saveSignature = async () => {
    if (sigCanvas.current.isEmpty()) return alert("서명을 해주세요!")
    setUploading(true)
    try {
      const signatureDataUrl = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png')
      setTempSignature(signatureDataUrl)
      await new Promise(resolve => setTimeout(resolve, 500))
      if (!hiddenContractRef.current) throw new Error("계약서 로드 실패")

      const imgData = await toPng(hiddenContractRef.current, { cacheBust: true, backgroundColor: '#ffffff' })
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = 210
      const imgProps = pdf.getImageProperties(imgData)
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)

      const pdfBlob = pdf.output('blob')
      const fileName = `contract_${jiipId}_admin_${Date.now()}.pdf`
      const { error: uploadError } = await supabase.storage.from('contracts').upload(fileName, pdfBlob, { contentType: 'application/pdf' })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName)
      await supabase.from('jiip_contracts').update({ signed_file_url: publicUrl }).eq('id', jiipId)

      alert("서명 완료! PDF 저장됨.")
      setItem((prev: any) => ({ ...prev, signed_file_url: publicUrl }))
      setShowSignPad(false)
    } catch (e: any) { alert('저장 실패: ' + e.message) }
    finally { setUploading(false) }
  }

  // ── 포맷터 ──
  const formatPhone = (v: string) => v.replace(/[^0-9]/g, "").replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, `$1-$2-$3`)
  const formatRegNum = (v: string) => {
    const n = v.replace(/[^0-9]/g, "")
    return item.tax_type === '세금계산서' ? (n.length > 5 ? `${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5, 10)}` : n) : (n.length > 6 ? `${n.slice(0, 6)}-${n.slice(6, 13)}` : n)
  }
  const formatBankAccount = (b: string, v: string) => b === 'KB국민은행' && v ? (v.replace(/[^0-9]/g, "").length > 8 ? `${v.slice(0, 6)}-${v.slice(6, 8)}-${v.slice(8, 14)}` : v) : v.replace(/[^0-9]/g, "")
  const handleMoneyChange = (f: string, v: string) => { const n = Number(v.replace(/,/g, '')); if (!isNaN(n)) setItem((p: any) => ({ ...p, [f]: n })) }
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'
  const formatDateTime = (d: string) => d ? new Date(d).toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
  const daysUntil = (d: string) => { if (!d) return null; return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) }

  const previewData = { ...item, contractor_address: `${item.investor_address} ${item.investor_address_detail}`.trim() }

  if (loading) return <div className="p-20 text-center font-bold text-gray-500">데이터 불러오는 중...</div>

  const statusInfo = STATUS_LABELS[item.status] || STATUS_LABELS.active
  const daysLeft = daysUntil(item.contract_end_date)

  const TABS = [
    { key: 'info' as const, label: '계약 정보' },
    ...(!isNew ? [
      { key: 'contract' as const, label: '계약서 관리' },
      { key: 'payments' as const, label: '입금 현황' },
      { key: 'history' as const, label: '이력' },
    ] : []),
  ]

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-slate-50 min-h-screen pb-32">

      {/* PDF 생성용 숨겨진 영역 */}
      <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
        <div ref={hiddenContractRef}>
          {item && cars.length > 0 && <ContractPaper data={previewData} car={cars.find((c: any) => c.id === item.car_id)} signatureUrl={tempSignature} />}
        </div>
      </div>

      {/* ── 헤더 ── */}
      <div className="mb-6">
        <button onClick={() => router.back()} className="text-sm text-slate-500 font-bold mb-2 hover:text-slate-900 transition-colors">← 목록으로</button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
              {isNew ? '지입 계약 등록' : '지입 계약 상세'}
            </h1>
            {!isNew && (
              <div className="flex items-center gap-3 mt-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${statusInfo.bg}`}>{statusInfo.label}</span>
                {daysLeft !== null && item.status === 'active' && (
                  <span className={`text-xs font-bold ${daysLeft <= 90 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {daysLeft > 0 ? `만기까지 ${daysLeft}일` : '만기일 경과'}
                  </span>
                )}
                {item.signed_file_url && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">서명완료</span>}
              </div>
            )}
          </div>
          {!isNew && (
            <div className="flex gap-2">
              {item.status === 'active' && (
                <select
                  value=""
                  onChange={e => { if (e.target.value) handleStatusChange(e.target.value) }}
                  disabled={changingStatus}
                  className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white font-bold text-slate-600"
                >
                  <option value="">상태 변경</option>
                  <option value="terminated">해지</option>
                  <option value="expired">만기 처리</option>
                </select>
              )}
              {item.status === 'expired' && (
                <button onClick={() => handleStatusChange('renewed')} disabled={changingStatus}
                  className="text-sm bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700">
                  갱신
                </button>
              )}
              <button onClick={handleDelete} className="text-sm bg-white border border-red-200 text-red-500 px-4 py-2 rounded-xl font-bold hover:bg-red-50">삭제</button>
            </div>
          )}
        </div>
      </div>

      {/* ── 탭 네비게이션 ── */}
      <div className="flex gap-1.5 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === tab.key
                ? 'bg-steel-900 text-white'
                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* 탭 1: 계약 정보 */}
      {/* ================================================================ */}
      {activeTab === 'info' && (
        <div className="space-y-6 bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
          {/* 세금 유형 */}
          <div className="bg-steel-50 p-5 rounded-xl border border-steel-100">
            <h3 className="font-bold text-base text-steel-900 mb-3">1. 지급 및 세금 유형</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {['세금계산서', '사업소득(3.3%)', '이자소득(27.5%)'].map(type => (
                <label key={type} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${item.tax_type === type ? 'bg-white border-steel-500 shadow-md ring-2 ring-steel-200' : 'bg-steel-50/50 border-steel-200'}`}>
                  <input type="radio" name="tax" value={type} checked={item.tax_type === type} onChange={e => setItem({ ...item, tax_type: e.target.value })} className="w-4 h-4" />
                  <span className="font-bold text-sm text-gray-900">{type}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 투자자 정보 */}
          <div className="space-y-4">
            <h3 className="font-bold text-base text-gray-900">2. 투자자(을) 상세 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">대상 차량</label>
                <select className="w-full border p-3 rounded-xl font-bold bg-gray-50 text-sm" value={item.car_id} onChange={e => setItem({ ...item, car_id: e.target.value })}>
                  <option value="">선택하세요</option>
                  {cars.map(c => <option key={c.id} value={c.id}>{c.number} ({c.model})</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">연락처</label><input className="w-full border p-3 rounded-xl text-sm" value={item.investor_phone} onChange={e => setItem({ ...item, investor_phone: formatPhone(e.target.value) })} maxLength={13} /></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-5 rounded-xl border border-slate-100">
              <div><label className="block text-xs font-bold text-gray-500 mb-1">성명/상호</label><input className="w-full border p-2.5 rounded-lg font-bold text-sm" value={item.investor_name} onChange={e => setItem({ ...item, investor_name: e.target.value })} /></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">등록번호</label><input className="w-full border p-2.5 rounded-lg text-sm" value={item.investor_reg_number} onChange={e => setItem({ ...item, investor_reg_number: formatRegNum(e.target.value) })} /></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">이메일</label><input type="email" className="w-full border p-2.5 rounded-lg text-sm" value={item.investor_email} onChange={e => setItem({ ...item, investor_email: e.target.value })} placeholder="계약서 발송용" /></div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 mb-1">주소</label>
                <div className="flex gap-2 mb-2">
                  <input className="w-full border p-2.5 rounded-lg bg-white text-sm" value={item.investor_address} readOnly placeholder="주소 검색 버튼을 눌러주세요" />
                  <button onClick={() => open({ onComplete: handleAddressComplete })} className="bg-gray-700 text-white px-3 rounded-lg text-xs font-bold whitespace-nowrap">검색</button>
                </div>
                <input className="w-full border p-2.5 rounded-lg text-sm" placeholder="상세 주소 입력" value={item.investor_address_detail} onChange={e => setItem({ ...item, investor_address_detail: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div><label className="block text-xs font-bold text-gray-500 mb-1">은행</label><select className="w-full border p-3 rounded-xl bg-white text-sm" value={item.bank_name} onChange={e => setItem({ ...item, bank_name: e.target.value })}>{KOREAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
              <div className="col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">계좌번호</label><input className="w-full border p-3 rounded-xl font-bold text-steel-600 text-sm" value={item.account_number} onChange={e => setItem({ ...item, account_number: formatBankAccount(item.bank_name, e.target.value) })} /></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">예금주</label><input className="w-full border p-3 rounded-xl text-sm" value={item.account_holder} onChange={e => setItem({ ...item, account_holder: e.target.value })} /></div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* 계약 조건 */}
          <div className="space-y-4">
            <h3 className="font-bold text-base text-gray-900">3. 계약 조건</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-bold text-gray-500 mb-1">시작일</label><input type="date" className="w-full border p-3 rounded-xl text-sm" value={item.contract_start_date} onChange={e => setItem({ ...item, contract_start_date: e.target.value })} /></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">종료일</label><input type="date" className="w-full border p-3 rounded-xl text-sm" value={item.contract_end_date} onChange={e => setItem({ ...item, contract_end_date: e.target.value })} /></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">약정금액 (목표)</label>
                <div className="relative">
                  <input type="text" className="w-full border-2 border-gray-300 p-3 pr-10 rounded-xl text-right font-black text-lg focus:border-steel-500 outline-none" value={item.invest_amount.toLocaleString()} onChange={e => handleMoneyChange('invest_amount', e.target.value)} placeholder="0" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">원</span>
                </div>
              </div>
              {!isNew && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">실제 입금 총액</label>
                  <div className={`w-full border-2 p-3 rounded-xl text-right font-black text-lg flex justify-end items-center gap-1 ${realDepositTotal >= item.invest_amount && item.invest_amount > 0 ? 'border-green-400 bg-green-50 text-green-700' : 'border-red-200 bg-white text-red-600'}`}>
                    {realDepositTotal.toLocaleString()} <span className="text-sm">원</span>
                  </div>
                  <div className="flex justify-end mt-1">
                    {realDepositTotal >= item.invest_amount && item.invest_amount > 0
                      ? <span className="text-xs font-bold text-green-600">완납</span>
                      : <span className="text-xs font-bold text-red-500">미수금: {(item.invest_amount - realDepositTotal).toLocaleString()}원</span>
                    }
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 bg-green-50 p-5 rounded-xl border border-green-100">
              <div><label className="block text-xs font-bold text-green-800 mb-1">관리비</label><input type="text" className="w-full border border-green-200 p-2.5 rounded-lg text-right font-bold bg-white text-green-800 text-sm" value={item.admin_fee.toLocaleString()} onChange={e => handleMoneyChange('admin_fee', e.target.value)} /></div>
              <div><label className="block text-xs font-bold text-steel-800 mb-1">배분율(%)</label><input type="number" className="w-full border border-steel-200 p-2.5 rounded-lg text-right font-bold bg-white text-steel-800 text-sm" value={item.share_ratio} onChange={e => setItem({ ...item, share_ratio: Number(e.target.value) })} /></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">지급일</label><input type="number" className="w-full border p-2.5 rounded-lg text-right bg-white text-sm" value={item.payout_day} onChange={e => setItem({ ...item, payout_day: Number(e.target.value) })} /></div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">메모</label>
              <textarea className="w-full border p-3 rounded-xl text-sm" rows={3} value={item.memo || ''} onChange={e => setItem({ ...item, memo: e.target.value })} placeholder="특이사항 기록" />
            </div>
          </div>

          <button onClick={handleSave} className="w-full bg-steel-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-steel-700 shadow-lg transition-all">
            {isNew ? '계약 등록 완료' : '정보 수정 저장'}
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* 탭 2: 계약서 관리 */}
      {/* ================================================================ */}
      {activeTab === 'contract' && !isNew && (
        <div className="space-y-6">
          {/* 계약서 발송 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-base text-slate-900 mb-4">계약서 발송</h3>

            {/* 채널 선택 */}
            <div className="flex gap-2 mb-4">
              {([['email', '이메일'], ['kakao', '카카오톡'], ['both', '둘 다']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setSendChannel(val)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${sendChannel === val ? 'bg-steel-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 입력 필드 */}
            <div className="space-y-2 mb-4">
              {(sendChannel === 'email' || sendChannel === 'both') && (
                <input
                  type="email"
                  className="w-full border p-3 rounded-xl text-sm"
                  placeholder="수신자 이메일"
                  value={sendingEmail}
                  onChange={e => setSendingEmail(e.target.value)}
                />
              )}
              {(sendChannel === 'kakao' || sendChannel === 'both') && (
                <input
                  type="tel"
                  className="w-full border p-3 rounded-xl text-sm"
                  placeholder="수신자 휴대폰 (예: 010-1234-5678)"
                  value={sendingPhone}
                  onChange={e => setSendingPhone(e.target.value)}
                />
              )}
            </div>

            <button
              onClick={handleSend}
              disabled={isSending}
              className="w-full px-6 py-3 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 disabled:bg-slate-300 transition-colors"
            >
              {isSending ? '발송 중...' : item.signed_file_url ? '다운로드 링크 발송' : '서명 요청 발송'}
            </button>
          </div>

          {/* 발송 이력 */}
          {sendingLogs.length > 0 && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-base text-slate-900 mb-4">발송 이력</h3>
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <div className="divide-y divide-slate-50">
                {sendingLogs.slice(0, 10).map((log: any) => (
                  <div key={log.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${log.status === 'sent' ? 'bg-blue-100 text-blue-700' : log.status === 'viewed' ? 'bg-yellow-100 text-yellow-700' : log.status === 'signed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {log.status === 'sent' ? '발송' : log.status === 'viewed' ? '열람' : log.status === 'signed' ? '서명' : '실패'}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${log.send_channel === 'kakao' ? 'bg-yellow-50 text-yellow-600' : log.send_channel === 'both' ? 'bg-purple-50 text-purple-600' : 'bg-slate-50 text-slate-500'}`}>
                        {log.send_channel === 'kakao' ? '카카오' : log.send_channel === 'both' ? '이메일+카카오' : '이메일'}
                      </span>
                      <span className="text-slate-700">{log.recipient_email || log.recipient_phone}</span>
                    </div>
                    <span className="text-xs text-slate-400">{formatDateTime(log.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* 서명 및 파일 관리 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-base text-slate-900 mb-4">서명 및 파일 관리</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              <button onClick={() => setShowSignPad(true)} className="bg-white text-steel-900 py-3.5 rounded-xl font-bold text-sm shadow-sm hover:shadow-md border border-slate-200 flex items-center justify-center gap-2 transition-all">
                직접 서명
              </button>
              <button onClick={() => setShowPreview(true)} className="bg-white text-gray-700 py-3.5 rounded-xl font-bold text-sm shadow-sm hover:shadow-md border border-slate-200 flex items-center justify-center gap-2 transition-all">
                미리보기/인쇄
              </button>
            </div>

            {item.signed_file_url ? (
              <div className="flex flex-col md:flex-row gap-6 items-start bg-slate-50 p-5 rounded-xl border border-slate-200">
                <div className="w-full md:w-1/3 h-52 bg-white rounded-xl overflow-hidden border border-slate-200 relative group">
                  <iframe src={`${item.signed_file_url}#toolbar=0&navpanes=0&scrollbar=0`} className="w-full h-full pointer-events-none" />
                  <a href={item.signed_file_url} target="_blank" className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="bg-white px-4 py-2 rounded-full font-bold shadow-lg text-sm">크게 보기</span>
                  </a>
                </div>
                <div className="flex-1 flex flex-col justify-center">
                  <p className="font-bold text-base text-slate-900 mb-1">서명 완료된 계약서 (PDF)</p>
                  <p className="text-xs text-slate-500 mb-4">법적 효력이 있는 전자 계약서입니다.</p>
                  <div className="space-y-2">
                    <a href={item.signed_file_url} target="_blank" className="block w-full bg-steel-600 text-white py-2.5 rounded-xl font-bold text-sm text-center hover:bg-steel-700">파일 다운로드</a>
                    <button onClick={() => { if (confirm('파일을 삭제합니까?')) setItem({ ...item, signed_file_url: '' }) }} className="w-full border border-red-200 text-red-500 rounded-xl font-bold text-sm hover:bg-red-50 py-2.5">파일 삭제</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400 p-10 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50">
                <p className="font-bold text-sm text-slate-500">아직 서명된 파일이 없습니다.</p>
                <p className="text-xs mt-1">위 버튼으로 서명하거나 이메일 발송 후 서명을 받으세요.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* 탭 3: 입금 현황 */}
      {/* ================================================================ */}
      {activeTab === 'payments' && !isNew && (
        <div className="space-y-6">
          {/* 요약 카드 */}
          {paymentSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <p className="text-xs font-bold text-slate-400">총 스케줄</p>
                <p className="text-xl font-black text-slate-900">{paymentSummary.total_months}<span className="text-sm font-bold text-slate-400">개월</span></p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <p className="text-xs font-bold text-slate-400">완료</p>
                <p className="text-xl font-black text-green-600">{paymentSummary.completed}<span className="text-sm font-bold text-slate-400">건</span></p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <p className="text-xs font-bold text-slate-400">예상 총액</p>
                <p className="text-lg font-black text-slate-900">{paymentSummary.total_expected?.toLocaleString()}<span className="text-sm font-bold text-slate-400">원</span></p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <p className="text-xs font-bold text-slate-400">미수금</p>
                <p className={`text-lg font-black ${paymentSummary.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{paymentSummary.balance?.toLocaleString()}<span className="text-sm font-bold text-slate-400">원</span></p>
              </div>
            </div>
          )}

          {/* 스케줄 관리 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-base text-slate-900">월별 결제 스케줄</h3>
              <button onClick={generateSchedule} disabled={generatingSchedule}
                className="px-4 py-2 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 disabled:bg-slate-300 transition-colors">
                {generatingSchedule ? '생성 중...' : paymentSchedules.length > 0 ? '스케줄 재생성' : '스케줄 생성'}
              </button>
            </div>

            {paymentSchedules.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="p-3 text-left text-xs font-bold text-slate-400">회차</th>
                      <th className="p-3 text-left text-xs font-bold text-slate-400">결제 예정일</th>
                      <th className="p-3 text-right text-xs font-bold text-slate-400">예상 금액</th>
                      <th className="p-3 text-right text-xs font-bold text-slate-400">실제 입금</th>
                      <th className="p-3 text-center text-xs font-bold text-slate-400">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentSchedules.map((s: any) => {
                      const isPast = new Date(s.payment_date) < new Date()
                      const isOverdue = s.status === 'pending' && isPast
                      return (
                        <tr key={s.id} className={`border-b border-slate-50 ${isOverdue ? 'bg-red-50/50' : ''}`}>
                          <td className="p-3 font-bold text-slate-700">{s.payment_number}회</td>
                          <td className="p-3 text-slate-600">{formatDate(s.payment_date)}</td>
                          <td className="p-3 text-right font-bold text-slate-700">{s.expected_amount?.toLocaleString()}원</td>
                          <td className="p-3 text-right font-bold text-green-600">{s.actual_amount ? `${s.actual_amount.toLocaleString()}원` : '-'}</td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                              s.status === 'completed' ? 'bg-green-100 text-green-700' :
                              isOverdue ? 'bg-red-100 text-red-700' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {s.status === 'completed' ? '완료' : isOverdue ? '연체' : '대기'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center text-slate-400 p-8 border-2 border-dashed border-slate-200 rounded-xl">
                <p className="font-bold text-sm">결제 스케줄이 없습니다.</p>
                <p className="text-xs mt-1">위 버튼을 눌러 자동 생성하세요.</p>
              </div>
            )}
          </div>

          {/* 실제 입금 내역 */}
          {paymentTransactions.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-base text-slate-900 mb-4">실제 입금 내역</h3>
              <div className="divide-y divide-slate-100">
                {paymentTransactions.map((t: any) => (
                  <div key={t.id} className="py-3 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-bold text-slate-700">{t.description || '입금'}</p>
                      <p className="text-xs text-slate-400">{formatDateTime(t.created_at)}</p>
                    </div>
                    <span className="font-bold text-green-600 text-sm">+{t.amount?.toLocaleString()}원</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* 탭 4: 이력 */}
      {/* ================================================================ */}
      {activeTab === 'history' && !isNew && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-base text-slate-900 mb-4">상태 변경 이력</h3>
          {statusHistory.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {statusHistory.map((h: any) => (
                <div key={h.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_LABELS[h.old_status]?.bg || 'bg-slate-100 text-slate-500'}`}>{STATUS_LABELS[h.old_status]?.label || h.old_status || '초기'}</span>
                      <span className="text-slate-400">→</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_LABELS[h.new_status]?.bg || 'bg-slate-100 text-slate-500'}`}>{STATUS_LABELS[h.new_status]?.label || h.new_status}</span>
                    </div>
                    {h.change_reason && <span className="text-xs text-slate-400">({h.change_reason})</span>}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">{h.changer?.employee_name || '시스템'}</p>
                    <p className="text-xs text-slate-400">{formatDateTime(h.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-slate-400 py-8">아직 상태 변경 이력이 없습니다.</p>
          )}
        </div>
      )}

      {/* ── 직접 서명 화면 ── */}
      {showSignPad && (
        <div className="fixed inset-0 z-[9999] bg-gray-100 flex flex-col">
          <div className="bg-steel-900 text-white p-4 flex justify-between items-center shadow-md z-10">
            <div>
              <h3 className="font-bold text-lg">관리자 직접 서명</h3>
              <p className="text-xs text-steel-200">내용을 확인하고 서명해주세요.</p>
            </div>
            <button onClick={() => setShowSignPad(false)} className="text-white bg-steel-800 hover:bg-steel-700 px-4 py-2 rounded-lg font-bold">닫기</button>
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-500 p-4">
            <div className="flex justify-center items-start">
              <div className="bg-white shadow-xl rounded-sm overflow-hidden min-h-[500px] mb-40 shrink-0" style={{ width: '100%', maxWidth: '210mm' }}>
                {item && cars.length > 0 && <ContractPaper data={previewData} car={cars.find((c: any) => c.id === item.car_id)} />}
              </div>
            </div>
          </div>
          <div className="bg-white p-4 shadow-[0_-4px_15px_rgba(0,0,0,0.1)] z-20 pb-8 rounded-t-2xl fixed bottom-0 left-0 right-0">
            <p className="text-center text-xs text-gray-500 mb-2 font-bold">아래 박스에 서명해 주세요</p>
            <div className="border-2 border-gray-300 rounded-xl bg-gray-50 mb-3 overflow-hidden flex justify-center relative h-40">
              <SignatureCanvas ref={sigCanvas} penColor="black" canvasProps={{ width: canvasWidth, height: 160, className: 'cursor-crosshair' }} />
              <div className="absolute top-2 right-2 text-xs text-gray-300 pointer-events-none">서명란</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => sigCanvas.current.clear()} className="flex-1 bg-gray-200 py-4 rounded-xl font-bold text-gray-700">지우기</button>
              <button onClick={saveSignature} disabled={uploading} className="flex-[2] bg-steel-600 py-4 rounded-xl font-bold text-white shadow-lg">
                {uploading ? '처리 중...' : '서명 완료'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 미리보기 모달 ── */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex flex-col items-center justify-center p-4">
          <div className="bg-gray-100 w-full max-w-5xl rounded-xl overflow-hidden flex flex-col h-[90vh] shadow-2xl">
            <div className="p-4 bg-white border-b flex justify-between flex-none">
              <h3 className="font-bold">미리보기</h3>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-black text-white px-3 rounded font-bold text-sm">인쇄</button>
                <button onClick={() => setShowPreview(false)} className="bg-gray-200 px-3 rounded font-bold text-sm">닫기</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 bg-gray-500 flex justify-center items-start">
              <div className="bg-white shadow-lg mb-20 shrink-0">
                {item && cars.length > 0 && <ContractPaper data={previewData} car={cars.find((c: any) => c.id === item.car_id)} />}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
