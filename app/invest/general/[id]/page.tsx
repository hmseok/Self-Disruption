'use client'
import { supabase } from '../../../utils/supabase'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApp } from '../../../context/AppContext'
import GeneralContract from '../../../components/GeneralContract'
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

const STATUS_LABELS: Record<string, { label: string; bg: string; dot: string }> = {
  active: { label: '운용중', bg: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  expired: { label: '만기', bg: 'bg-red-50 text-red-600 ring-1 ring-red-200', dot: 'bg-red-500' },
  terminated: { label: '해지', bg: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200', dot: 'bg-gray-400' },
  renewed: { label: '갱신', bg: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200', dot: 'bg-blue-500' },
}

const TAB_ICONS: Record<string, string> = {
  info: '📋',
  contract: '📄',
  payments: '💰',
  history: '📊',
}

export default function GeneralInvestDetail() {
  const router = useRouter()
  const params = useParams()
  const { company, role, adminSelectedCompanyId } = useApp()
  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id
  const isNew = params.id === 'new'
  const id = isNew ? null : params.id

  const [loading, setLoading] = useState(!isNew)
  const [activeTab, setActiveTab] = useState<'info' | 'contract' | 'payments' | 'history'>('info')

  // 실제 입금 총액
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

  // 결제 스케줄 (레거시)
  const [paymentSchedules, setPaymentSchedules] = useState<any[]>([])
  const [paymentTransactions, setPaymentTransactions] = useState<any[]>([])
  const [paymentSummary, setPaymentSummary] = useState<any>(null)
  const [generatingSchedule, setGeneratingSchedule] = useState(false)

  // 투자금 거래 내역 (transactions 기반 — 입금현황 탭)
  const [investTxList, setInvestTxList] = useState<any[]>([])

  // 데이터 상태
  const [item, setItem] = useState<any>({
    investor_name: '', investor_phone: '', investor_email: '',
    investor_address: '', investor_address_detail: '',
    bank_name: 'KB국민은행', account_number: '', account_holder: '',
    invest_amount: 0, interest_rate: 12, payment_day: 10,
    tax_type: '이자소득(27.5%)',
    contract_start_date: new Date().toISOString().split('T')[0],
    contract_end_date: '',
    memo: '', signed_file_url: '', status: 'active'
  })

  // UI 상태
  const [showPreview, setShowPreview] = useState(false)
  const [showSignPad, setShowSignPad] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [canvasWidth, setCanvasWidth] = useState(300)

  const hiddenContractRef = useRef<HTMLDivElement>(null)
  const sigCanvas = useRef<any>({})
  const [tempSignature, setTempSignature] = useState('')
  const open = useDaumPostcodePopup()

  // ── 초기화 ──
  useEffect(() => {
    const handleResize = () => setCanvasWidth(window.innerWidth > 600 ? 500 : window.innerWidth - 40)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!isNew && id) { fetchDetail(); fetchRealDeposit() }
  }, [id])

  useEffect(() => {
    if (item.contract_start_date) {
      const start = new Date(item.contract_start_date)
      const end = new Date(start)
      end.setFullYear(start.getFullYear() + 1)
      end.setDate(start.getDate() - 1)
      if (!item.contract_end_date || isNew) {
        setItem((prev: any) => ({ ...prev, contract_end_date: end.toISOString().split('T')[0] }))
      }
    }
  }, [item.contract_start_date])

  useEffect(() => {
    if (!id) return
    if (activeTab === 'contract') loadSendingLogs()
    if (activeTab === 'payments') loadInvestTransactions()
    if (activeTab === 'history') loadStatusHistory()
  }, [activeTab, id])

  // ── 데이터 조회 ──
  const fetchDetail = async () => {
    const { data, error } = await supabase.from('general_investments').select('*').eq('id', id).single()
    if (error) { alert('데이터 로드 실패'); router.back(); return }
    setItem({
      ...data,
      investor_address: data.investor_address || '',
      investor_address_detail: data.investor_address_detail || '',
      investor_email: data.investor_email || '',
      account_holder: data.account_holder || '',
      invest_amount: data.invest_amount || 0,
      interest_rate: data.interest_rate || 12,
      payment_day: data.payment_day || 10,
      signed_file_url: data.signed_file_url || '',
      status: data.status || 'active',
    })
    setSendingEmail(data.investor_email || data.investor_phone || '')
    setSendingPhone(data.investor_phone || '')
    setLoading(false)
  }

  const fetchRealDeposit = async () => {
    // 입금과 출금을 모두 가져와서 순합계(입금 - 출금) 계산
    const { data } = await supabase.from('transactions').select('amount, type').eq('related_type', 'invest').eq('related_id', id)
    if (data) {
      const net = data.reduce((acc, cur) => {
        const amt = Math.abs(cur.amount || 0)
        return acc + (cur.type === 'income' ? amt : -amt)
      }, 0)
      setRealDepositTotal(net)
    }
  }

  // ── API 호출 헬퍼 ──
  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
  }

  const loadSendingLogs = async () => {
    const headers = await getAuthHeaders()
    const res = await fetch(`/api/contracts/send-email?contract_type=invest&contract_id=${id}`, { headers })
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
          contract_type: 'invest', contract_id: id,
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
      } else { alert('발송 실패: ' + result.error) }
    } catch { alert('발송 중 오류 발생') }
    finally { setIsSending(false) }
  }

  const loadStatusHistory = async () => {
    const headers = await getAuthHeaders()
    const res = await fetch(`/api/contracts/status?contract_type=invest&contract_id=${id}`, { headers })
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
        body: JSON.stringify({ contract_type: 'invest', contract_id: id, new_status: newStatus, reason }),
      })
      const result = await res.json()
      if (result.success) { setItem((prev: any) => ({ ...prev, status: newStatus })); loadStatusHistory(); alert('상태가 변경되었습니다.') }
      else { alert(result.error) }
    } catch { alert('상태 변경 중 오류') }
    finally { setChangingStatus(false) }
  }

  // 투자금 거래 내역 로드 (transactions 기반)
  const loadInvestTransactions = async () => {
    if (!id) return
    const { data } = await supabase
      .from('transactions')
      .select('id, transaction_date, amount, type, category, client_name, description, status')
      .eq('related_type', 'invest')
      .eq('related_id', id)
      .order('transaction_date', { ascending: true })
    setInvestTxList(data || [])
  }

  const loadPaymentSchedule = async () => {
    const headers = await getAuthHeaders()
    const res = await fetch(`/api/contracts/payment-schedule?contract_type=invest&contract_id=${id}`, { headers })
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
        body: JSON.stringify({ contract_type: 'invest', contract_id: id }),
      })
      const result = await res.json()
      if (result.success) { alert(`${result.count}개월 스케줄 생성 완료`); loadPaymentSchedule() }
      else { alert(result.error) }
    } catch { alert('스케줄 생성 실패') }
    finally { setGeneratingSchedule(false) }
  }

  // ── 저장/삭제 ──
  const handleAddress = (data: any) => {
    let full = data.address
    if (data.buildingName) full += ` (${data.buildingName})`
    setItem({ ...item, investor_address: full })
  }

  const handleSave = async () => {
    if (isNew && role === 'god_admin' && !adminSelectedCompanyId) return alert('회사를 먼저 선택해주세요.')
    if (!item.investor_name) return alert('투자자 성명은 필수입니다.')

    const payload = { ...item, investor_address: item.investor_address, investor_address_detail: item.investor_address_detail }
    payload.invest_amount = Number(payload.invest_amount)
    payload.interest_rate = Number(payload.interest_rate)
    payload.payment_day = Number(payload.payment_day)
    if (isNew) payload.company_id = effectiveCompanyId

    const { error } = isNew
      ? await supabase.from('general_investments').insert(payload)
      : await supabase.from('general_investments').update(payload).eq('id', id)

    if (error) alert('저장 실패: ' + error.message)
    else { alert('저장되었습니다!'); router.push('/invest') }
  }

  const handleDelete = async () => {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('general_investments').delete().eq('id', id)
    router.push('/invest')
  }

  // ── 서명 ──
  const saveSignature = async () => {
    if (sigCanvas.current.isEmpty()) return alert("서명을 해주세요")
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
      const fileName = `general_invest_${id}_${Date.now()}.pdf`
      const { error: uploadError } = await supabase.storage.from('contracts').upload(fileName, pdfBlob, { contentType: 'application/pdf' })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName)
      await supabase.from('general_investments').update({ signed_file_url: publicUrl }).eq('id', id)

      alert("서명 완료! PDF 저장됨.")
      setItem((prev: any) => ({ ...prev, signed_file_url: publicUrl }))
      setShowSignPad(false)
    } catch (e: any) { alert('오류: ' + e.message) }
    finally { setUploading(false) }
  }

  // ── 포맷터 ──
  const formatPhone = (v: string) => v.replace(/[^0-9]/g, "").replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, `$1-$2-$3`)
  const formatAccount = (v: string) => v.replace(/[^0-9-]/g, "")
  const handleMoneyChange = (field: string, val: string) => { const n = Number(val.replace(/,/g, '')); if (!isNaN(n)) setItem((prev: any) => ({ ...prev, [field]: n })) }
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'
  const formatDateTime = (d: string) => d ? new Date(d).toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
  const daysUntil = (d: string) => { if (!d) return null; return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-400">불러오는 중...</p>
      </div>
    </div>
  )

  const previewData = { ...item, investor_address: `${item.investor_address} ${item.investor_address_detail}`.trim() }
  const statusInfo = STATUS_LABELS[item.status] || STATUS_LABELS.active
  const daysLeft = daysUntil(item.contract_end_date)
  const monthlyInterest = Math.round(Number(item.invest_amount || 0) * Number(item.interest_rate || 0) / 100 / 12)
  const depositRate = item.invest_amount > 0 ? Math.min(100, Math.round((realDepositTotal / item.invest_amount) * 100)) : 0

  const TABS = [
    { key: 'info' as const, label: '계약 정보' },
    ...(!isNew ? [
      { key: 'contract' as const, label: '계약서 관리' },
      { key: 'payments' as const, label: '입금 현황' },
      { key: 'history' as const, label: '이력' },
    ] : []),
  ]

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 md:py-8 md:px-6 bg-slate-50 min-h-screen pb-32">

      {/* PDF 생성용 숨겨진 영역 */}
      <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
        <div ref={hiddenContractRef}>
          <GeneralContract data={previewData} signatureUrl={tempSignature} />
        </div>
      </div>

      {/* ── 헤더 ── */}
      <div className="mb-8">
        <button onClick={() => router.back()} className="group flex items-center gap-1.5 text-sm text-slate-400 font-medium mb-4 hover:text-slate-700 transition-colors">
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          목록으로
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'left' }}>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
                💼 {isNew ? '일반 투자 등록' : '투자 상세 정보'}
              </h1>
              {!isNew && (
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${statusInfo.bg}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                  {statusInfo.label}
                </span>
              )}
            </div>
            {!isNew && (
              <div className="flex items-center gap-3 mt-1.5">
                {item.investor_name && (
                  <span className="text-sm text-slate-500">{item.investor_name}</span>
                )}
                <span className="text-sm text-slate-400">· 연 {item.interest_rate}% · 월 {monthlyInterest.toLocaleString()}원</span>
                {daysLeft !== null && item.status === 'active' && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${daysLeft <= 90 ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-200' : 'bg-slate-100 text-slate-400'}`}>
                    {daysLeft > 0 ? `D-${daysLeft}` : `D+${Math.abs(daysLeft)}`}
                  </span>
                )}
                {item.signed_file_url && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-200">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    서명완료
                  </span>
                )}
              </div>
            )}
          </div>

          {!isNew && (
            <div className="flex items-center gap-2 shrink-0">
              {item.status === 'active' && (
                <select
                  value=""
                  onChange={e => { if (e.target.value) handleStatusChange(e.target.value) }}
                  disabled={changingStatus}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white font-medium text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
                >
                  <option value="">상태 변경</option>
                  <option value="terminated">해지</option>
                  <option value="expired">만기 처리</option>
                </select>
              )}
              {item.status === 'expired' && (
                <button onClick={() => handleStatusChange('renewed')} disabled={changingStatus}
                  className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                  갱신
                </button>
              )}
              <button onClick={handleDelete} className="text-sm text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg font-medium transition-colors">
                삭제
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── 요약 대시보드 (상세 모드) ── */}
      {!isNew && activeTab === 'info' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">약정금액</p>
            <p className="text-lg font-bold text-slate-900">{Number(item.invest_amount).toLocaleString()}<span className="text-xs font-normal text-slate-400 ml-0.5">원</span></p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">입금 진행률</p>
            <div className="flex items-end gap-2">
              <p className={`text-lg font-bold ${depositRate >= 100 ? 'text-emerald-600' : 'text-slate-900'}`}>{depositRate}%</p>
            </div>
            <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${depositRate >= 100 ? 'bg-emerald-500' : depositRate >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${depositRate}%` }} />
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">연 수익률</p>
            <p className="text-lg font-bold text-slate-900">{item.interest_rate}<span className="text-xs font-normal text-slate-400 ml-0.5">%</span></p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">월 이자</p>
            <p className="text-lg font-bold text-slate-900">{monthlyInterest.toLocaleString()}<span className="text-xs font-normal text-slate-400 ml-0.5">원</span></p>
          </div>
        </div>
      )}

      {/* ── 탭 네비게이션 ── */}
      <div className="flex gap-1 mb-6 bg-white p-1 rounded-xl border border-slate-200/80 shadow-sm">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
              activeTab === tab.key
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="text-xs">{TAB_ICONS[tab.key]}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* 탭 1: 계약 정보 */}
      {/* ================================================================ */}
      {activeTab === 'info' && (
        <div className="space-y-5">
          {/* 투자자 정보 */}
          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span className="w-5 h-5 bg-slate-900 text-white rounded-md flex items-center justify-center text-[10px] font-bold">1</span>
                투자자 정보
              </h3>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">성명/법인명 <span className="text-red-400">*</span></label>
                  <input className="w-full border border-slate-200 p-3 rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={item.investor_name} onChange={e => setItem({ ...item, investor_name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">연락처</label>
                  <input className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" placeholder="010-0000-0000" value={item.investor_phone} onChange={e => setItem({ ...item, investor_phone: formatPhone(e.target.value) })} maxLength={13} />
                </div>
              </div>

              <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">이메일</label>
                    <input type="email" className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={item.investor_email || ''} onChange={e => setItem({ ...item, investor_email: e.target.value })} placeholder="계약서 발송용" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">주소</label>
                    <div className="flex gap-2 mb-2">
                      <input className="w-full border border-slate-200 p-2.5 rounded-lg bg-white text-sm" value={item.investor_address} readOnly placeholder="주소 검색 버튼을 눌러주세요" />
                      <button onClick={() => open({ onComplete: handleAddress })} className="bg-slate-900 text-white px-4 rounded-lg text-xs font-semibold whitespace-nowrap hover:bg-slate-800 transition-colors">
                        검색
                      </button>
                    </div>
                    <input className="w-full border border-slate-200 p-2.5 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" placeholder="상세 주소 입력" value={item.investor_address_detail} onChange={e => setItem({ ...item, investor_address_detail: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* 계좌 정보 */}
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-3">계좌 정보</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <select className="w-full border border-slate-200 p-3 rounded-xl bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={item.bank_name} onChange={e => setItem({ ...item, bank_name: e.target.value })}>
                      {KOREAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input className="w-full border border-slate-200 p-3 rounded-xl font-medium text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={item.account_number} onChange={e => setItem({ ...item, account_number: formatAccount(e.target.value) })} placeholder="계좌번호" />
                  </div>
                  <div>
                    <input className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={item.account_holder || ''} onChange={e => setItem({ ...item, account_holder: e.target.value })} placeholder="예금주" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 투자 조건 */}
          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span className="w-5 h-5 bg-slate-900 text-white rounded-md flex items-center justify-center text-[10px] font-bold">2</span>
                투자 조건
              </h3>
            </div>
            <div className="p-6 space-y-5">
              {/* 계약 기간 */}
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-3">계약 기간</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">시작일</label>
                    <input type="date" className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={item.contract_start_date || ''} onChange={e => setItem({ ...item, contract_start_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">종료일</label>
                    <input type="date" className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={item.contract_end_date || ''} onChange={e => setItem({ ...item, contract_end_date: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* 금액 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">투자 약정금</label>
                  <div className="relative">
                    <input type="text" className="w-full border-2 border-slate-200 p-3.5 pr-10 rounded-xl text-right font-bold text-lg focus:border-slate-400 focus:ring-0 outline-none transition-all" value={item.invest_amount ? Number(item.invest_amount).toLocaleString() : ''} onChange={e => handleMoneyChange('invest_amount', e.target.value)} placeholder="0" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">원</span>
                  </div>
                </div>
                {!isNew && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">실제 입금 총액</label>
                    <div className={`w-full border-2 p-3.5 rounded-xl text-right font-bold text-lg flex justify-between items-center ${
                      realDepositTotal >= item.invest_amount && item.invest_amount > 0
                        ? 'border-emerald-200 bg-emerald-50/50 text-emerald-700'
                        : 'border-red-100 bg-red-50/30 text-red-600'
                    }`}>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                        realDepositTotal >= item.invest_amount && item.invest_amount > 0
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-600'
                      }`}>
                        {realDepositTotal >= item.invest_amount && item.invest_amount > 0
                          ? '완납'
                          : `미수금 ${(item.invest_amount - realDepositTotal).toLocaleString()}원`
                        }
                      </span>
                      <span>{realDepositTotal.toLocaleString()} <span className="text-sm font-normal">원</span></span>
                    </div>
                  </div>
                )}
              </div>

              {/* 이자 조건 */}
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-3">이자 조건</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">연 수익률</label>
                    <div className="relative">
                      <input type="number" className="w-full border border-slate-200 p-2.5 rounded-lg text-right font-semibold bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={item.interest_rate} onChange={e => setItem({ ...item, interest_rate: e.target.value })} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">이자 지급일</label>
                    <div className="relative">
                      <input type="number" className="w-full border border-slate-200 p-2.5 rounded-lg text-right font-semibold bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all" value={item.payment_day} onChange={e => setItem({ ...item, payment_day: e.target.value })} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">일</span>
                    </div>
                  </div>
                </div>
                {/* 세금 유형 + 거치기간 */}
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">세금 유형</label>
                    <select
                      className="w-full border border-slate-200 p-2.5 rounded-lg font-semibold bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all"
                      value={item.tax_type || '이자소득(27.5%)'}
                      onChange={e => setItem({ ...item, tax_type: e.target.value })}
                    >
                      <option value="이자소득(27.5%)">이자소득 (27.5%)</option>
                      <option value="사업소득(3.3%)">사업소득 (3.3%)</option>
                      <option value="세금계산서">세금계산서 (VAT 10%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">거치기간</label>
                    <div className="relative">
                      <select
                        className="w-full border border-slate-200 p-2.5 rounded-lg font-semibold bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all"
                        value={item.grace_period_months || 0}
                        onChange={e => setItem({ ...item, grace_period_months: Number(e.target.value) })}
                      >
                        <option value={0}>없음</option>
                        <option value={1}>1개월</option>
                        <option value={2}>2개월</option>
                        <option value={3}>3개월</option>
                        <option value={6}>6개월</option>
                        <option value={12}>12개월</option>
                      </select>
                    </div>
                  </div>
                </div>
                {item.invest_amount > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200/50">
                    <p className="text-xs text-slate-500">
                      월 예상 이자: <span className="font-bold text-slate-700">{monthlyInterest.toLocaleString()}원</span>
                      {item.tax_type && item.tax_type !== '세금계산서' && (
                        <span className="ml-2 text-red-500">
                          (세후 {Math.round(monthlyInterest * (1 - (item.tax_type === '사업소득(3.3%)' ? 0.033 : 0.275))).toLocaleString()}원)
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">메모</label>
                <textarea className="w-full border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all resize-none" rows={3} value={item.memo || ''} onChange={e => setItem({ ...item, memo: e.target.value })} placeholder="특이사항 기록" />
              </div>
            </div>
          </section>

          {/* 저장 버튼 */}
          <button onClick={handleSave} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-base hover:bg-slate-800 shadow-lg shadow-slate-900/10 transition-all active:scale-[0.99]">
            {isNew ? '투자 등록 완료' : '정보 수정 저장'}
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* 탭 2: 계약서 관리 */}
      {/* ================================================================ */}
      {activeTab === 'contract' && !isNew && (
        <div className="space-y-5">
          {/* 계약서 발송 */}
          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-sm text-slate-900">계약서 발송</h3>
              <p className="text-xs text-slate-400 mt-0.5">이메일 또는 카카오톡으로 계약서를 발송합니다</p>
            </div>
            <div className="p-6">
              {/* 채널 선택 - 카드형 */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                {([
                  ['email', '이메일', 'M', 'bg-blue-500'],
                  ['kakao', '카카오톡', 'K', 'bg-yellow-400'],
                  ['both', '동시 발송', '+', 'bg-purple-500'],
                ] as const).map(([val, label, icon, iconBg]) => (
                  <button
                    key={val}
                    onClick={() => setSendChannel(val)}
                    className={`relative flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all ${
                      sendChannel === val
                        ? 'border-slate-900 bg-slate-50 shadow-sm'
                        : 'border-slate-100 hover:border-slate-200 bg-white'
                    }`}
                  >
                    <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center shadow-sm ${sendChannel === val ? 'scale-110' : ''} transition-transform`}>
                      {val === 'email' ? (
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      ) : val === 'kakao' ? (
                        <svg className="w-5 h-5 text-yellow-900" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.725 1.805 5.114 4.518 6.467-.163.593-.59 2.149-.674 2.483-.104.41.15.404.316.294.13-.087 2.07-1.408 2.907-1.978.593.087 1.205.133 1.833.133h.2c5.523 0 10-3.463 10-7.691 0-4.228-4.477-7.691-10-7.691H12z" /></svg>
                      ) : (
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                      )}
                    </div>
                    <span className={`text-xs font-semibold ${sendChannel === val ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
                    {sendChannel === val && (
                      <div className="absolute top-2 right-2">
                        <svg className="w-4 h-4 text-slate-900" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* 입력 필드 */}
              <div className="space-y-3 mb-5">
                {(sendChannel === 'email' || sendChannel === 'both') && (
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                    <input
                      type="email"
                      className="w-full border border-slate-200 pl-10 pr-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all"
                      placeholder="수신자 이메일"
                      value={sendingEmail}
                      onChange={e => setSendingEmail(e.target.value)}
                    />
                  </div>
                )}
                {(sendChannel === 'kakao' || sendChannel === 'both') && (
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    </div>
                    <input
                      type="tel"
                      className="w-full border border-slate-200 pl-10 pr-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all"
                      placeholder="수신자 휴대폰 (예: 010-1234-5678)"
                      value={sendingPhone}
                      onChange={e => setSendingPhone(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <button
                onClick={handleSend}
                disabled={isSending}
                className="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
              >
                {isSending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    발송 중...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    {item.signed_file_url ? '다운로드 링크 발송' : '서명 요청 발송'}
                  </>
                )}
              </button>
            </div>
          </section>

          {/* 발송 이력 */}
          {sendingLogs.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="font-bold text-sm text-slate-900">발송 이력</h3>
                <span className="text-xs text-slate-400 font-medium">{sendingLogs.length}건</span>
              </div>
              <div className="divide-y divide-slate-50">
                {sendingLogs.slice(0, 10).map((log: any) => (
                  <div key={log.id} className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                        log.status === 'sent' ? 'bg-blue-50 text-blue-600' :
                        log.status === 'viewed' ? 'bg-amber-50 text-amber-600' :
                        log.status === 'signed' ? 'bg-emerald-50 text-emerald-600' :
                        'bg-red-50 text-red-500'
                      }`}>
                        {log.status === 'sent' ? '발송' : log.status === 'viewed' ? '열람' : log.status === 'signed' ? '서명' : '실패'}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md ${
                        log.send_channel === 'kakao' ? 'bg-yellow-50 text-yellow-700' :
                        log.send_channel === 'both' ? 'bg-purple-50 text-purple-600' :
                        'bg-slate-50 text-slate-500'
                      }`}>
                        {log.send_channel === 'kakao' ? '카카오' : log.send_channel === 'both' ? '이메일+카카오' : '이메일'}
                      </span>
                      <span className="text-sm text-slate-600">{log.recipient_email || log.recipient_phone}</span>
                    </div>
                    <span className="text-xs text-slate-400">{formatDateTime(log.created_at)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 서명 및 파일 관리 */}
          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-sm text-slate-900">서명 및 파일 관리</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button onClick={() => setShowSignPad(true)} className="group bg-white text-slate-700 py-3.5 rounded-xl font-semibold text-sm border border-slate-200 flex items-center justify-center gap-2 hover:border-slate-300 hover:shadow-sm transition-all">
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  직접 서명
                </button>
                <button onClick={() => setShowPreview(true)} className="group bg-white text-slate-700 py-3.5 rounded-xl font-semibold text-sm border border-slate-200 flex items-center justify-center gap-2 hover:border-slate-300 hover:shadow-sm transition-all">
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  미리보기
                </button>
              </div>

              {item.signed_file_url ? (
                <div className="flex flex-col md:flex-row gap-6 items-start bg-slate-50 p-5 rounded-xl border border-slate-200">
                  <div className="w-full md:w-1/3 h-52 bg-white rounded-xl overflow-hidden border border-slate-200 relative group">
                    <iframe src={`${item.signed_file_url}#toolbar=0&navpanes=0&scrollbar=0`} className="w-full h-full pointer-events-none" />
                    <a href={item.signed_file_url} target="_blank" className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="bg-white px-4 py-2 rounded-full font-semibold shadow-lg text-sm">크게 보기</span>
                    </a>
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                      <p className="font-bold text-base text-slate-900">서명 완료된 계약서</p>
                    </div>
                    <p className="text-xs text-slate-400 mb-5">법적 효력이 있는 전자 계약서입니다.</p>
                    <div className="flex gap-2">
                      <a href={item.signed_file_url} target="_blank" className="flex-1 bg-slate-900 text-white py-2.5 rounded-lg font-semibold text-sm text-center hover:bg-slate-800 transition-colors">다운로드</a>
                      <button onClick={() => { if (confirm('파일을 삭제합니까?')) setItem({ ...item, signed_file_url: '' }) }} className="px-4 border border-red-200 text-red-400 rounded-lg font-medium text-sm hover:bg-red-50 transition-colors">삭제</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <p className="font-semibold text-sm text-slate-500">아직 서명된 파일이 없습니다</p>
                  <p className="text-xs text-slate-400 mt-1">위 버튼으로 서명하거나 발송 후 서명을 받으세요</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ================================================================ */}
      {/* 탭 3: 입금 현황 (투자금 거래 내역 — transactions 기반) */}
      {/* ================================================================ */}
      {activeTab === 'payments' && !isNew && (() => {
        const incomeTxs = investTxList.filter((t: any) => t.type === 'income')
        const expenseTxs = investTxList.filter((t: any) => t.type === 'expense')
        const totalIncome = incomeTxs.reduce((s: number, t: any) => s + Math.abs(t.amount || 0), 0)
        const totalExpense = expenseTxs.reduce((s: number, t: any) => s + Math.abs(t.amount || 0), 0)
        const netBalance = totalIncome - totalExpense
        const nf = (n: number) => n.toLocaleString()

        return (
          <div className="space-y-5">
            {/* 요약 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm">
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">총 거래</p>
                <p className="text-xl font-bold text-slate-900">{investTxList.length}<span className="text-xs font-normal text-slate-400 ml-0.5">건</span></p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm">
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">총 입금</p>
                <p className="text-xl font-bold text-emerald-600">{nf(totalIncome)}<span className="text-xs font-normal text-slate-400 ml-0.5">원</span></p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm">
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">총 출금 (이자 등)</p>
                <p className="text-xl font-bold text-red-500">{nf(totalExpense)}<span className="text-xs font-normal text-slate-400 ml-0.5">원</span></p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-sm">
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">투자 순잔액</p>
                <p className="text-xl font-bold text-blue-600">{nf(netBalance)}<span className="text-xs font-normal text-slate-400 ml-0.5">원</span></p>
              </div>
            </div>

            {/* 거래 내역 목록 */}
            <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="font-bold text-sm text-slate-900">투자금 거래 내역</h3>
                <span className="text-xs text-slate-400">{investTxList.length}건</span>
              </div>

              {investTxList.length > 0 ? (
                <div className="divide-y divide-slate-50">
                  {investTxList.map((t: any, idx: number) => {
                    const isIncome = t.type === 'income'
                    const amt = Math.abs(t.amount || 0)
                    // 누적 잔액 계산 (해당 거래까지)
                    const runningBalance = investTxList.slice(0, idx + 1).reduce((s: number, tx: any) => {
                      return s + (tx.type === 'income' ? Math.abs(tx.amount || 0) : -Math.abs(tx.amount || 0))
                    }, 0)
                    return (
                      <div key={t.id} className="px-6 py-3.5 flex justify-between items-center hover:bg-slate-50/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isIncome ? 'bg-emerald-500' : 'bg-red-400'}`}></span>
                            <p className="text-sm font-semibold text-slate-700 truncate">
                              {t.client_name || t.description || (isIncome ? '투자금 입금' : '이자 지급')}
                            </p>
                            {t.category && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 shrink-0">{t.category}</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 ml-3.5">{t.transaction_date}</p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className={`font-bold text-sm ${isIncome ? 'text-emerald-600' : 'text-red-500'}`}>
                            {isIncome ? '+' : '-'}{nf(amt)}원
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">잔액 {nf(runningBalance)}원</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12 px-6">
                  <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                  <p className="font-semibold text-sm text-slate-500">연결된 거래 내역이 없습니다</p>
                  <p className="text-xs text-slate-400 mt-1">통장/카드 분류관리에서 거래를 이 투자에 연결하세요</p>
                </div>
              )}
            </section>

            {/* 계약상 투자 원금 비교 */}
            {item.invest_amount > 0 && (
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-blue-700 font-semibold">계약 투자 원금</span>
                  <span className="text-sm font-bold text-blue-800">{nf(item.invest_amount)}원</span>
                </div>
                {totalIncome > 0 && Math.abs(netBalance - item.invest_amount) > 100 && (
                  <p className="text-xs text-blue-500 mt-1.5">
                    {netBalance > item.invest_amount
                      ? `통장 기준 순잔액이 계약 원금보다 ${nf(netBalance - item.invest_amount)}원 많습니다`
                      : `통장 기준 순잔액이 계약 원금보다 ${nf(item.invest_amount - netBalance)}원 적습니다`
                    }
                  </p>
                )}
              </div>
            )}

            {/* ── 월별 이자 계산 근거 ── */}
            {item.interest_rate > 0 && (() => {
              const rate = item.interest_rate || 0
              const gracePeriod = item.grace_period_months || 0
              const contractStart = item.contract_start_date
              const fallbackAmt = item.invest_amount || 0

              // 계약 시작월 ~ 현재월까지 월 목록 생성
              const months: string[] = []
              if (contractStart) {
                const now = new Date()
                const cur = new Date(contractStart)
                cur.setDate(1)
                while (cur <= now && months.length < 24) {
                  months.push(cur.toISOString().slice(0, 7))
                  cur.setMonth(cur.getMonth() + 1)
                }
              }

              // 일할계산 로직 (SettlementDashboard와 동일)
              const calcMonthDetail = (baseMonth: string) => {
                const [y, mo] = baseMonth.split('-').map(Number)
                const daysInMonth = new Date(y, mo, 0).getDate()
                const monthStart = `${baseMonth}-01`
                const endOfMonth = `${baseMonth}-${String(daysInMonth).padStart(2, '0')}`

                // 거치기간 체크
                let isGrace = false
                if (gracePeriod > 0 && contractStart) {
                  const sd = new Date(contractStart)
                  const graceEnd = new Date(sd.getFullYear(), sd.getMonth() + gracePeriod, sd.getDate())
                  const monthEnd = new Date(y, mo - 1, daysInMonth)
                  if (monthEnd < graceEnd) isGrace = true
                }

                // 입금/상환 이벤트 수집
                type Evt = { date: string; amount: number; label: string }
                const events: Evt[] = []
                const txIncome = investTxList.filter(t => t.type === 'income')
                const txExpense = investTxList.filter(t => t.type === 'expense')

                txIncome.forEach(t => {
                  events.push({ date: t.transaction_date.slice(0, 10), amount: Math.abs(t.amount || 0), label: t.client_name || t.description || '입금' })
                })
                // 원금상환 (이자 제외)
                txExpense.forEach(t => {
                  const desc = ((t.client_name || '') + (t.description || '') + (t.category || '')).toLowerCase()
                  const isInterest = desc.includes('이자') || desc.includes('interest') || desc.includes('배당')
                  if (!isInterest) {
                    events.push({ date: t.transaction_date.slice(0, 10), amount: -Math.abs(t.amount || 0), label: t.client_name || t.description || '원금상환' })
                  }
                })

                const hasDeposits = events.length > 0

                if (!hasDeposits) {
                  // fallback: 계약금액 기준
                  if (contractStart && contractStart.slice(0, 7) > baseMonth) {
                    return { baseMonth, daysInMonth, isGrace, hasDeposits, balance: 0, weighted: 0, interest: 0, details: [] as { from: number; to: number; balance: number; days: number }[] }
                  }
                  if (contractStart && contractStart.slice(0, 7) === baseMonth) {
                    const startDay = parseInt(contractStart.slice(8, 10)) || 1
                    const remainDays = daysInMonth - startDay + 1
                    const weighted = Math.floor(fallbackAmt * remainDays / daysInMonth)
                    const interest = isGrace ? 0 : Math.floor((weighted * (rate / 100)) / 12)
                    return { baseMonth, daysInMonth, isGrace, hasDeposits, balance: fallbackAmt, weighted, interest, details: [{ from: startDay, to: daysInMonth, balance: fallbackAmt, days: remainDays }] }
                  }
                  const interest = isGrace ? 0 : Math.floor((fallbackAmt * (rate / 100)) / 12)
                  return { baseMonth, daysInMonth, isGrace, hasDeposits, balance: fallbackAmt, weighted: fallbackAmt, interest, details: [{ from: 1, to: daysInMonth, balance: fallbackAmt, days: daysInMonth }] }
                }

                // 일할계산
                events.sort((a, b) => a.date.localeCompare(b.date))
                let running = 0
                events.filter(e => e.date < monthStart).forEach(e => { running += e.amount })

                const inMonth = events.filter(e => e.date >= monthStart && e.date <= endOfMonth)
                let weightedSum = 0
                let prevDay = 1
                const details: { from: number; to: number; balance: number; days: number }[] = []

                for (const evt of inMonth) {
                  const evtDay = parseInt(evt.date.slice(8, 10)) || 1
                  const holdDays = evtDay - prevDay
                  if (holdDays > 0) {
                    weightedSum += running * holdDays
                    details.push({ from: prevDay, to: evtDay - 1, balance: running, days: holdDays })
                  }
                  running += evt.amount
                  prevDay = evtDay
                }
                const remainDays = daysInMonth - prevDay + 1
                if (remainDays > 0) {
                  weightedSum += running * remainDays
                  details.push({ from: prevDay, to: daysInMonth, balance: running, days: remainDays })
                }

                const weighted = Math.floor(weightedSum / daysInMonth)
                const interest = isGrace ? 0 : Math.floor((weighted * (rate / 100)) / 12)
                return { baseMonth, daysInMonth, isGrace, hasDeposits, balance: running, weighted, interest, details }
              }

              const monthDetails = months.map(m => calcMonthDetail(m)).reverse()

              return (
                <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-bold text-sm text-slate-900">월별 이자 계산 근거</h3>
                    <span className="text-[11px] text-slate-400">이자율 {rate}% / 거치 {gracePeriod}개월</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {monthDetails.map(md => (
                      <details key={md.baseMonth} className="group">
                        <summary className="px-6 py-3.5 flex justify-between items-center cursor-pointer hover:bg-slate-50/50 transition-colors list-none">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-slate-700">{md.baseMonth}</span>
                            {md.isGrace && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 ring-1 ring-amber-200">거치기간</span>}
                            {!md.hasDeposits && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-400 ring-1 ring-slate-200">계약금액 기준</span>}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-xs text-slate-400">가중평균잔액</p>
                              <p className="text-sm font-bold text-slate-700">{nf(md.weighted)}원</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-400">이자</p>
                              <p className={`text-sm font-bold ${md.interest > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{nf(md.interest)}원</p>
                            </div>
                            <svg className="w-4 h-4 text-slate-300 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                          </div>
                        </summary>
                        <div className="px-6 pb-4 bg-slate-50/30">
                          <div className="text-xs text-slate-500 space-y-1.5 mt-1">
                            <p className="font-medium text-slate-600 mb-2">일할계산 상세 ({md.daysInMonth}일 기준)</p>
                            {md.details.map((d, i) => (
                              <div key={i} className="flex justify-between items-center py-1 px-2 rounded bg-white/60">
                                <span>{d.from}일 ~ {d.to}일 ({d.days}일간)</span>
                                <span className="font-medium">{nf(d.balance)}원 x {d.days}일</span>
                              </div>
                            ))}
                            <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between font-semibold text-slate-700">
                              <span>= 가중합계 / {md.daysInMonth}일</span>
                              <span>{nf(md.weighted)}원</span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                              <span>이자 = {nf(md.weighted)} x {rate}% / 12</span>
                              <span className="font-bold text-emerald-600">{nf(md.interest)}원{md.isGrace ? ' (거치기간 → 0원)' : ''}</span>
                            </div>
                          </div>
                        </div>
                      </details>
                    ))}
                    {monthDetails.length === 0 && (
                      <div className="text-center py-8 text-sm text-slate-400">계약 시작일이 설정되지 않았습니다</div>
                    )}
                  </div>
                </section>
              )
            })()}
          </div>
        )
      })()}

      {/* ================================================================ */}
      {/* 탭 4: 이력 */}
      {/* ================================================================ */}
      {activeTab === 'history' && !isNew && (
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-sm text-slate-900">상태 변경 이력</h3>
          </div>
          {statusHistory.length > 0 ? (
            <div className="p-6">
              <div className="relative">
                <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-100" />
                <div className="space-y-6">
                  {statusHistory.map((h: any, idx: number) => (
                    <div key={h.id} className="relative pl-7">
                      <div className={`absolute left-0 top-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${
                        idx === 0 ? 'bg-slate-900' : 'bg-slate-300'
                      }`} />
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${STATUS_LABELS[h.old_status]?.bg || 'bg-slate-100 text-slate-500'}`}>
                              {STATUS_LABELS[h.old_status]?.label || h.old_status || '초기'}
                            </span>
                            <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${STATUS_LABELS[h.new_status]?.bg || 'bg-slate-100 text-slate-500'}`}>
                              {STATUS_LABELS[h.new_status]?.label || h.new_status}
                            </span>
                          </div>
                          {h.change_reason && (
                            <p className="text-xs text-slate-500 mt-1">{h.change_reason}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-xs font-medium text-slate-500">{h.changer?.employee_name || '시스템'}</p>
                          <p className="text-[11px] text-slate-400">{formatDateTime(h.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="font-semibold text-sm text-slate-500">아직 상태 변경 이력이 없습니다</p>
            </div>
          )}
        </section>
      )}

      {/* ── 직접 서명 화면 ── */}
      {showSignPad && (
        <div className="fixed inset-0 z-[9999] bg-gray-100 flex flex-col">
          <div className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-md z-10">
            <div><h3 className="font-bold text-lg">관리자 직접 서명</h3><p className="text-xs text-slate-300">내용을 확인하고 서명해주세요.</p></div>
            <button onClick={() => setShowSignPad(false)} className="text-white bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg font-bold transition-colors">닫기</button>
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-500 p-4">
            <div className="flex justify-center">
              <div className="bg-white shadow-xl rounded-sm overflow-hidden min-h-[500px] mb-40 shrink-0" style={{ width: '100%', maxWidth: '210mm' }}>
                <GeneralContract data={previewData} mode="mobile" />
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
              <button onClick={saveSignature} disabled={uploading} className="flex-[2] bg-slate-900 py-4 rounded-xl font-bold text-white shadow-lg hover:bg-slate-800 transition-colors">{uploading ? '처리 중...' : '서명 완료'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 미리보기 모달 ── */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex flex-col items-center justify-center p-4">
          <div className="bg-gray-100 w-full max-w-5xl rounded-xl overflow-hidden flex flex-col h-[90vh] shadow-2xl">
            <div className="p-4 bg-white border-b flex justify-between items-center">
              <h3 className="font-bold text-slate-900">미리보기</h3>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-slate-900 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-800 transition-colors">인쇄</button>
                <button onClick={() => setShowPreview(false)} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-gray-300 transition-colors">닫기</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 bg-gray-500 flex justify-center items-start">
              <div className="bg-white shadow-lg mb-20 shrink-0"><GeneralContract data={previewData} /></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
