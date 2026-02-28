'use client'

import { supabase } from '../../utils/supabase'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
export const dynamic = "force-dynamic";

// ============================================
// 유틸
// ============================================
const f = (n: number) => Math.round(n || 0).toLocaleString()
const fDate = (d: string) => {
  if (!d) return '-'
  const dt = new Date(d)
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`
}

// 정비 패키지 라벨
const MAINT_PACKAGE_LABELS: Record<string, string> = {
  self: '자가정비',
  oil_only: '엔진오일 교환',
  basic: '기본정비',
  full: '종합정비',
}
const MAINT_PACKAGE_DESC: Record<string, string> = {
  self: '고객 직접 정비 (렌탈료 미포함)',
  oil_only: '엔진오일+필터 교환 포함',
  basic: '오일류+에어필터+점검+순회정비 포함',
  full: '오일류+필터+브레이크+타이어+배터리+와이퍼+냉각수 전항목 포함',
}
const MAINT_ITEMS_MAP: Record<string, string[]> = {
  oil_only: ['엔진오일+필터 정기 교환'],
  basic: ['엔진오일+필터', '에어컨필터', '에어클리너', '와이퍼', '점화플러그', '순회정비(방문점검)'],
  full: ['엔진오일+필터', '에어컨필터', '에어클리너', '와이퍼', '점화플러그', '순회정비(방문점검)', '브레이크패드(전/후)', '타이어(4본)', '배터리', '미션오일', '냉각수/부동액'],
}

// 기본 보험 보장내역 (약관 데이터 없을 때 fallback)
const DEFAULT_INSURANCE_COVERAGE = [
  { label: '대인배상 I (책임)', description: '자배법 의무보험 · 사망/부상 한도 무제한' },
  { label: '대인배상 II (종합)', description: '대인 1 초과분 무한 보장' },
  { label: '대물배상', description: '1억원 한도 (상대방 차량·재물 손해)' },
  { label: '자기신체사고', description: '사망 1.5억 / 부상·휴유장해 3천만원 한도' },
  { label: '무보험차상해', description: '2억원 한도' },
  { label: '자기차량손해 (자차)', description: '차량가격 기준 전손/분손 보장 · 면책금 {deductible}원' },
]

// 기본 유의사항 (약관 데이터 없을 때 fallback)
const DEFAULT_QUOTE_NOTICES = [
  '본 견적서는 발행일로부터 30일간 유효하며, 차량 재고 및 시장 상황에 따라 변동될 수 있습니다.',
  '보증금은 계약 종료 시 차량 상태 확인 후 손해액을 공제한 잔액을 환불합니다.',
  '약정주행거리 초과 시 계약 종료 시점에 km당 {excessRate}원의 추가 요금이 정산됩니다.',
  '사고 발생 시 자차 면책금 {deductible}원은 임차인이 부담하며, 초과 수리비는 보험 처리됩니다.',
  '중도해지 시 잔여 렌탈료의 {earlyTerminationRate}%에 해당하는 위약금이 발생합니다.',
  '렌탈 차량은 타인에게 전대·양도할 수 없으며 임대인의 사전 동의 없이 차량 개조 불가합니다.',
  '자동차 정기검사(종합검사)는 관련법의 일정에 맞추어 실시하여야 하며, 검사비용은 렌탈료에 포함됩니다.',
  { text: '인수 시 소유권 이전에 필요한 취득세 및 수수료는 임차인 부담입니다.', condition: 'buyout' },
]

// CostBar 컴포넌트
const CostBar = ({ label, value, total, color }: { label: string; value: number; total: number; color: string }) => {
  const pct = total > 0 ? Math.abs(value) / total * 100 : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 text-gray-500 text-xs">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="w-24 text-right font-bold text-xs">{f(value)}원</span>
      <span className="w-10 text-right text-gray-400 text-[11px]">{pct.toFixed(0)}%</span>
    </div>
  )
}

// 테이블 행 컴포넌트
const TRow = ({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) => (
  <tr className="border-b border-gray-100 last:border-0">
    <td className="bg-gray-50 px-4 py-2.5 font-bold text-gray-500 w-32 text-sm">{label}</td>
    <td className={`px-4 py-2.5 text-sm ${bold ? 'font-black text-gray-900' : 'text-gray-700'}`}>{value}</td>
  </tr>
)

// ============================================
// 타임라인 컴포넌트
// ============================================
const EVENT_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string }> = {
  created:          { icon: '📄', label: '견적 생성',   color: '#6b7280', bg: '#f3f4f6' },
  shared:           { icon: '🔗', label: '링크 공유',   color: '#2563eb', bg: '#eff6ff' },
  sent:             { icon: '📤', label: '견적 발송',   color: '#7c3aed', bg: '#f5f3ff' },
  viewed:           { icon: '👁️', label: '고객 열람',   color: '#0891b2', bg: '#ecfeff' },
  signed:           { icon: '✍️', label: '고객 서명',   color: '#059669', bg: '#ecfdf5' },
  contract_created: { icon: '📋', label: '계약 생성',   color: '#059669', bg: '#ecfdf5' },
  revoked:          { icon: '🚫', label: '링크 비활성화', color: '#dc2626', bg: '#fef2f2' },
  pdf_stored:       { icon: '💾', label: 'PDF 저장',    color: '#0369a1', bg: '#f0f9ff' },
}

function QuoteTimeline({ quoteId }: { quoteId?: string }) {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!quoteId) return
    setLoading(true)
    const token = sessionStorage.getItem('supabase_access_token') || ''
    fetch(`/api/quotes/${quoteId}/timeline`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setEvents(d.events || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [quoteId])

  if (!quoteId || (events.length === 0 && !loading)) return null

  const fTime = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const getDesc = (e: any) => {
    const ch = e.channel === 'sms' ? 'SMS' : e.channel === 'kakao' ? '카카오' : e.channel === 'email' ? '이메일' : e.channel === 'link' ? '링크' : ''
    if (e.event_type === 'sent' && ch) return `${ch}로 ${e.recipient || '고객'}에게 발송`
    if (e.event_type === 'shared') return '공유 링크 생성'
    if (e.event_type === 'viewed') return '고객이 견적서를 열람'
    if (e.event_type === 'signed') return `${e.metadata?.customer_name || '고객'}이 서명 완료`
    if (e.event_type === 'contract_created') return '계약이 자동 생성됨'
    if (e.event_type === 'revoked') return '공유 링크 비활성화'
    if (e.event_type === 'pdf_stored') return '계약서 PDF 저장 완료'
    return EVENT_CONFIG[e.event_type]?.label || e.event_type
  }

  const displayed = expanded ? events : events.slice(0, 5)

  return (
    <div className="no-print" style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 24px' }}>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111' }}>📋 활동 타임라인</h3>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{events.length}건</span>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 16 }}>불러오는 중...</p>
          ) : events.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 16 }}>기록된 활동이 없습니다.</p>
          ) : (
            <div style={{ position: 'relative' }}>
              {/* 세로 선 */}
              <div style={{ position: 'absolute', left: 15, top: 8, bottom: 8, width: 2, background: '#e5e7eb' }} />
              {displayed.map((ev: any, i: number) => {
                const cfg = EVENT_CONFIG[ev.event_type] || EVENT_CONFIG.created
                return (
                  <div key={ev.id} style={{ display: 'flex', gap: 12, marginBottom: i < displayed.length - 1 ? 16 : 0, position: 'relative' }}>
                    {/* 점 */}
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', background: cfg.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, flexShrink: 0, zIndex: 1, border: `2px solid ${cfg.color}20`,
                    }}>
                      {cfg.icon}
                    </div>
                    {/* 내용 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                        <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{fTime(ev.created_at)}</span>
                      </div>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>{getDesc(ev)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {events.length > 5 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                display: 'block', width: '100%', marginTop: 12, padding: '8px 0',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: '#2563eb', fontWeight: 600,
              }}
            >
              {expanded ? '접기' : `전체 ${events.length}건 보기`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// 메인 컴포넌트
// ============================================
export default function QuoteDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const quoteId = Array.isArray(id) ? id[0] : id
  const printRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [quote, setQuote] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [linkedContract, setLinkedContract] = useState<any>(null)
  const [worksheet, setWorksheet] = useState<any>(null)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [viewMode, setViewMode] = useState<'quote' | 'analysis'>('quote')
  // 공유/발송 관련
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [shareStatus, setShareStatus] = useState<'none' | 'shared' | 'signed'>('none')
  const [sendChannel, setSendChannel] = useState<'copy' | 'sms' | 'kakao' | 'email'>('copy')
  const [sendPhone, setSendPhone] = useState('')
  const [sendEmail, setSendEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    const fetchQuoteDetail = async () => {
      if (!quoteId) return
      const { data: quoteData, error } = await supabase.from('quotes').select('*').eq('id', quoteId).single()
      if (error || !quoteData) { alert('견적서를 찾을 수 없습니다.'); router.push('/quotes'); return }

      let carData = null
      if (quoteData.car_id) {
        const { data } = await supabase.from('cars').select('*').eq('id', quoteData.car_id).single()
        carData = data
      }

      if (quoteData.worksheet_id) {
        const { data: wsData } = await supabase.from('pricing_worksheets').select('*').eq('id', quoteData.worksheet_id).single()
        if (wsData) setWorksheet(wsData)
      } else if (quoteData.car_id) {
        const { data: wsData } = await supabase.from('pricing_worksheets').select('*').eq('car_id', quoteData.car_id).order('updated_at', { ascending: false }).limit(1).single()
        if (wsData) setWorksheet(wsData)
      }

      if (quoteData.company_id) {
        const { data: compData } = await supabase.from('companies').select('*').eq('id', quoteData.company_id).single()
        if (compData) setCompany(compData)
      }
      // company_id로 조회 실패 시 quote_detail 내 company 정보 활용
      // (이 시점에서 company state가 아직 null이면 아래에서 fallback 처리)

      const { data: contractData } = await supabase.from('contracts').select('*').eq('quote_id', quoteId).single()
      let customerData = null
      if (quoteData.customer_id) {
        const { data: custData } = await supabase.from('customers').select('*').eq('id', quoteData.customer_id).single()
        customerData = custData
      }

      setQuote({ ...quoteData, car: carData, customer: customerData })
      if (contractData) setLinkedContract(contractData)
      // 고객 연락처 자동 세팅
      const cust = customerData || quoteData.quote_detail?.manual_customer
      if (cust?.phone) setSendPhone(cust.phone)
      if (cust?.email) setSendEmail(cust.email)
      setLoading(false)
    }
    fetchQuoteDetail()
  }, [quoteId, router])

  // 공유 상태 로드
  useEffect(() => {
    if (!quoteId || !quote) return
    if (quote.signed_at) { setShareStatus('signed'); return }
    if (quote.shared_at) setShareStatus('shared')
  }, [quoteId, quote])

  const handleShare = useCallback(async () => {
    setShareLoading(true)
    setShowShareModal(true)
    try {
      // Supabase 세션에서 access_token 가져오기
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      const res = await fetch(`/api/quotes/${quoteId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ expiryDays: 7 })
      })
      const data = await res.json()
      if (data.shareUrl) {
        setShareUrl(data.shareUrl)
        setShareStatus('shared')
      } else {
        alert(data.error || '공유 링크 생성 실패')
        setShowShareModal(false)
      }
    } catch {
      alert('서버 오류')
      setShowShareModal(false)
    }
    setShareLoading(false)
  }, [quoteId])

  const handleCopyShareUrl = useCallback((mode: 'link' | 'message' = 'link') => {
    if (mode === 'message') {
      const car = quote?.car || {}
      const detail = quote?.quote_detail || {}
      const carInfo = detail.car_info || {}
      const brand = car.brand || carInfo.brand || ''
      const model = car.model || carInfo.model || ''
      const trim = car.trim || carInfo.trim || ''
      const year = car.year || carInfo.year || ''
      const fee = quote?.rent_fee || 0
      const dep = quote?.deposit || 0
      const term = detail.term_months || 36
      const type = detail.contract_type === 'buyout' ? '인수형' : '반납형'
      const mileage = detail.annualMileage || detail.baselineKm || 2
      const feeF = Math.round(fee).toLocaleString()
      const vatF = Math.round(fee * 1.1).toLocaleString()
      const depF = Math.round(dep).toLocaleString()

      const msg = [
        `📋 장기렌트 견적서`,
        ``,
        `🚗 ${brand} ${model}${trim ? ` ${trim}` : ''}`,
        `${year}년식 · ${type} · ${term}개월`,
        `연 ${(mileage * 10000).toLocaleString()}km`,
        ``,
        `💰 월 렌탈료: ${feeF}원 (VAT포함 ${vatF}원)`,
        dep > 0 ? `보증금: ${depF}원` : null,
        ``,
        `아래 링크에서 견적 확인 및 계약 서명이 가능합니다.`,
        shareUrl
      ].filter(Boolean).join('\n')

      navigator.clipboard.writeText(msg)
    } else {
      navigator.clipboard.writeText(shareUrl)
    }
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }, [shareUrl, quote])

  const handleRevokeShare = useCallback(async () => {
    if (!confirm('공유 링크를 비활성화하시겠습니까?')) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      await fetch(`/api/quotes/${quoteId}/share`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      })
      setShareUrl('')
      setShareStatus('none')
      setShowShareModal(false)
    } catch { alert('오류') }
  }, [quoteId])

  // 견적서 직접 발송 (SMS/카카오톡/이메일)
  const handleDirectSend = useCallback(async () => {
    if (!shareUrl) return alert('먼저 공유 링크를 생성해주세요.')
    if (sendChannel === 'copy') return // 복사 모드에선 미사용

    const recipient = sendChannel === 'email' ? sendEmail : sendPhone
    if (!recipient || recipient.trim().length < 3) {
      return alert(sendChannel === 'email' ? '이메일 주소를 입력해주세요.' : '전화번호를 입력해주세요.')
    }

    setSending(true)
    setSendResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      const res = await fetch(`/api/quotes/${quoteId}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          channel: sendChannel,
          phone: sendChannel !== 'email' ? sendPhone : undefined,
          email: sendChannel === 'email' ? sendEmail : undefined,
          shareUrl,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSendResult({ success: true, message: '발송 완료!' })
        setShareStatus('shared')
      } else {
        setSendResult({ success: false, message: data.error || '발송 실패' })
      }
    } catch (err: any) {
      setSendResult({ success: false, message: err?.message || '서버 오류' })
    }
    setSending(false)
  }, [quoteId, shareUrl, sendChannel, sendPhone, sendEmail])

  const handleArchiveQuote = async () => {
    if (!confirm('이 견적을 보관하시겠습니까?')) return
    setUpdating(true)
    try {
      const { error } = await supabase.from('quotes').update({ status: 'archived' }).eq('id', quoteId)
      if (error) throw error
      alert('견적이 보관되었습니다.')
      setQuote({ ...quote, status: 'archived' })
    } catch (e: any) { alert('에러: ' + e.message) }
    setUpdating(false)
  }

  const handleCreateContract = async () => {
    if (linkedContract) return alert('이미 계약이 확정된 건입니다.')
    if (quote.status === 'archived') return alert('보관된 견적서로는 계약을 확정할 수 없습니다.')
    if (quote.expires_at && new Date() > new Date(quote.expires_at)) return alert('만료된 견적서로는 계약을 확정할 수 없습니다.')
    if (!confirm('이 견적서로 계약을 확정하시겠습니까?')) return
    setCreating(true)
    try {
      const detail = quote.quote_detail || {}
      const termMonths = detail.term_months || worksheet?.term_months || 36
      const { data: contract, error: cErr } = await supabase.from('contracts').insert([{
        quote_id: quote.id, car_id: quote.car_id, customer_id: quote.customer_id || null,
        customer_name: quote.customer_name, start_date: quote.start_date, end_date: quote.end_date,
        term_months: termMonths, deposit: quote.deposit, monthly_rent: quote.rent_fee, status: 'active'
      }]).select().single()
      if (cErr) throw cErr
      const schedules = []
      const rent = quote.rent_fee, vat = Math.round(rent * 0.1), startDate = new Date(quote.start_date)
      if (quote.deposit > 0) schedules.push({ contract_id: contract.id, round_number: 0, due_date: quote.start_date, amount: quote.deposit, vat: 0, status: 'unpaid' })
      for (let i = 1; i <= termMonths; i++) {
        const d = new Date(startDate); d.setMonth(d.getMonth() + i)
        schedules.push({ contract_id: contract.id, round_number: i, due_date: d.toISOString().split('T')[0], amount: rent + vat, vat, status: 'unpaid' })
      }
      await supabase.from('payment_schedules').insert(schedules)
      if (quote.car_id) await supabase.from('cars').update({ status: 'rented' }).eq('id', quote.car_id)
      alert('계약 확정 완료!')
      router.push(`/contracts/${contract.id}`)
    } catch (e: any) { alert('에러: ' + e.message) }
    setCreating(false)
  }

  const handleEditWorksheet = () => {
    // quote_id를 포함하여 수정 모드로 진입
    if (worksheet) router.push(`/quotes/pricing?worksheet_id=${worksheet.id}&car_id=${worksheet.car_id || ''}&quote_id=${quoteId}`)
    else router.push(`/quotes/pricing?quote_id=${quoteId}`)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-steel-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 font-bold">견적서 불러오는 중...</p>
      </div>
    </div>
  )
  if (!quote) return null

  const canCreateContract = !linkedContract && quote.status !== 'archived' && (!quote.expires_at || new Date(quote.expires_at) > new Date())

  // ============================================
  // quote_detail에서 상세 데이터 추출
  // ============================================
  const detail = quote.quote_detail || {}
  const costBreakdown = detail.cost_breakdown || {}
  const carInfo = detail.car_info || {}
  const contractType = detail.contract_type || (quote.rental_type?.includes('인수') ? 'buyout' : 'return')
  const termMonths = detail.term_months || worksheet?.term_months || 36
  const annualMileage = detail.annualMileage || detail.baselineKm || 2
  const totalMileageLimit = annualMileage * 10000 * (termMonths / 12)
  const maintPackage = detail.maint_package || 'basic'
  const excessMileageRate = detail.excess_mileage_rate || 0
  const rentFee = quote.rent_fee || 0
  const rentVAT = Math.round(rentFee * 0.1)
  const rentWithVAT = rentFee + rentVAT
  const totalPayments = rentWithVAT * termMonths
  const buyoutPrice = detail.buyout_price || detail.residual_value || 0
  const depositAmt = quote.deposit || 0
  const prepaymentAmt = detail.prepayment || 0
  const deductible = detail.deductible || 0
  const totalWithDeposit = totalPayments + depositAmt + prepaymentAmt
  const totalWithBuyout = contractType === 'buyout' ? totalWithDeposit + buyoutPrice : totalWithDeposit

  // 약관 데이터 (저장된 값 사용)
  const earlyTerminationRate = detail.early_termination_rate || 35
  const earlyTerminationRatesByPeriod = detail.early_termination_rates_by_period || null
  const savedInsuranceCoverage = detail.insurance_coverage || null
  const savedQuoteNotices = detail.quote_notices || null
  const savedInsuranceNote = detail.insurance_note || null

  // 중도해지 위약금율 계산
  const getEarlyTerminationDisplay = () => {
    if (earlyTerminationRatesByPeriod && Array.isArray(earlyTerminationRatesByPeriod)) {
      const matched = earlyTerminationRatesByPeriod.find((r: any) => termMonths >= r.months_from && termMonths <= r.months_to)
      const rate = matched?.rate || earlyTerminationRate
      return `잔여 렌탈료의 ${rate}% 위약금 발생`
    }
    return `잔여 렌탈료의 ${earlyTerminationRate}% 위약금 발생`
  }

  // 원가 데이터
  const monthlyDep = costBreakdown.depreciation || worksheet?.monthly_depreciation || 0
  const monthlyLoanInterest = costBreakdown.loan_interest || worksheet?.monthly_loan_interest || 0
  const monthlyOpportunityCost = costBreakdown.opportunity_cost || worksheet?.monthly_opportunity_cost || 0
  const monthlyFinance = monthlyLoanInterest + monthlyOpportunityCost
  const monthlyInsurance = costBreakdown.insurance || worksheet?.monthly_insurance || 0
  const monthlyMaint = costBreakdown.maintenance || worksheet?.monthly_maintenance || 0
  const monthlyTax = costBreakdown.tax || worksheet?.monthly_tax || 0
  const monthlyRisk = costBreakdown.risk || worksheet?.monthly_risk_reserve || 0
  const depositDiscount = costBreakdown.deposit_discount || worksheet?.monthly_deposit_discount || 0
  const prepaymentDiscount = costBreakdown.prepayment_discount || worksheet?.monthly_prepayment_discount || 0
  const totalMonthlyCost = monthlyDep + monthlyFinance + monthlyInsurance + monthlyMaint + monthlyTax + monthlyRisk - depositDiscount - prepaymentDiscount
  const margin = quote.margin || worksheet?.target_margin || (rentFee - totalMonthlyCost)
  const suggestedRent = worksheet?.suggested_rent || rentFee
  const totalCostForBar = monthlyDep + monthlyFinance + monthlyInsurance + monthlyMaint + monthlyTax + monthlyRisk

  // 고객/차량 정보
  const customerName = quote.customer?.name || quote.customer_name || detail.manual_customer?.name || '미등록'
  const customerPhone = quote.customer?.phone || detail.manual_customer?.phone || ''
  const customerEmail = quote.customer?.email || detail.manual_customer?.email || ''
  const customerBizNum = quote.customer?.business_number || detail.manual_customer?.business_number || ''
  const customerAddress = quote.customer?.address || detail.manual_customer?.address || ''
  const car = quote.car || {}
  const displayBrand = car.brand || carInfo.brand || ''
  const displayModel = car.model || carInfo.model || ''
  const displayTrim = car.trim || carInfo.trim || ''
  const displayYear = car.year || carInfo.year || ''
  const displayFuel = car.fuel_type || carInfo.fuel || ''
  const displayNumber = car.number || ''
  const factoryPrice = detail.factory_price || car.factory_price || 0
  const purchasePrice = detail.purchase_price || car.purchase_price || 0
  const totalAcquisitionCost = detail.total_acquisition_cost || detail.cost_base || purchasePrice
  const driverAgeGroup = detail.driver_age_group || '26세이상'

  // 만료 상태
  const isExpired = quote.expires_at && new Date(quote.expires_at) < new Date()
  const daysUntilExpiry = quote.expires_at ? Math.floor((new Date(quote.expires_at).getTime() - Date.now()) / 86400000) : 999

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ===== 상단 네비게이션 + 액션 바 (인쇄 시 숨김) ===== */}
      <div className="max-w-[900px] mx-auto py-4 px-4 md:py-6 no-print">
        <div className="flex items-center gap-2 mb-4 no-print">
          <Link href="/quotes" className="text-gray-400 hover:text-gray-600 text-sm">견적 관리</Link>
          <span className="text-gray-300">/</span>
          <span className="text-steel-600 font-bold text-sm">견적 상세</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1rem' }} className="no-print">
          <div style={{ textAlign: 'left' }}>
            <h1 className="text-2xl font-black text-gray-900">견적서 #{String(quote.id).slice(0, 8)}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                quote.status === 'active' ? 'bg-green-100 text-green-700' :
                quote.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-200 text-gray-500'
              }`}>
                {quote.status === 'active' ? '확정' : quote.status === 'draft' ? '임시저장' : '보관'}
              </span>
              {isExpired && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">만료됨</span>}
              {!isExpired && daysUntilExpiry < 7 && daysUntilExpiry >= 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">{daysUntilExpiry}일 남음</span>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => window.print()} className="px-4 py-2 text-sm border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-white">인쇄</button>
            <button onClick={() => router.push(`/quotes/pricing?quote_id=${quoteId}`)}
              className="px-4 py-2 text-sm border border-steel-300 rounded-xl font-bold text-steel-600 hover:bg-steel-50">
              {worksheet ? '렌트가 산출 수정' : '견적서 수정'}
            </button>
            <button onClick={handleShare}
              className={`px-4 py-2 text-sm rounded-xl font-bold transition-colors ${
                shareStatus === 'signed' ? 'bg-green-100 text-green-700 border border-green-300' :
                shareStatus === 'shared' ? 'bg-blue-100 text-blue-700 border border-blue-300' :
                'border border-blue-300 text-blue-600 hover:bg-blue-50'
              }`}>
              {shareStatus === 'signed' ? '서명완료' : shareStatus === 'shared' ? '발송됨' : '견적 발송'}
            </button>
            <button onClick={handleArchiveQuote} disabled={updating || quote.status === 'archived'}
              className="px-4 py-2 text-sm border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-white disabled:opacity-50">
              {updating ? '처리 중...' : '보관'}
            </button>
            {canCreateContract && (
              <button onClick={handleCreateContract} disabled={creating}
                className="px-6 py-2 text-sm bg-steel-600 text-white rounded-xl font-bold hover:bg-steel-700 shadow-lg disabled:opacity-50">
                {creating ? '처리 중...' : '계약 확정'}
              </button>
            )}
          </div>
        </div>

        {linkedContract && (
          <div className="bg-steel-600 text-white p-4 rounded-2xl shadow-lg mb-4 flex justify-between items-center no-print">
            <div>
              <h2 className="font-bold flex items-center gap-2">계약 확정 완료</h2>
              <p className="text-steel-100 text-sm">계약번호: {String(linkedContract.id).slice(0, 8)}</p>
            </div>
            <button onClick={() => router.push(`/contracts/${linkedContract.id}`)}
              className="bg-white text-steel-700 px-5 py-2 rounded-xl font-bold hover:bg-gray-100 shadow text-sm">
              계약서 상세 →
            </button>
          </div>
        )}

        {/* 뷰 모드 토글 */}
        <div className="flex gap-2 mt-2 mb-2 no-print">
          {(['quote', 'analysis'] as const).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                viewMode === mode ? 'bg-gray-900 text-white shadow-lg' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
              }`}>
              {mode === 'quote' ? '고객용 견적서' : '내부 원가분석'}
            </button>
          ))}
        </div>
      </div>

      {/* ============================================================
          고객용 견적서 뷰 (인쇄 대상)
          ============================================================ */}
      {viewMode === 'quote' && (
        <div className="max-w-[900px] mx-auto pb-10 px-4">
          <div ref={printRef} className="bg-white rounded-2xl shadow-xl overflow-hidden print:shadow-none print:rounded-none print:overflow-visible">

            {/* 헤더 */}
            <div className="bg-gray-900 text-white px-6 py-4 print:px-5 print:py-3">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-xl font-black tracking-tight">장기렌트 견적서</h1>
                  <p className="text-gray-400 text-xs mt-0.5">LONG-TERM RENTAL QUOTATION</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400 text-xs">견적일</p>
                  <p className="font-bold">{fDate(quote.created_at)}</p>
                  {quote.expires_at && (
                    <>
                      <p className="text-gray-400 text-xs mt-1">유효기간</p>
                      <p className="text-sm text-yellow-400 font-bold">{fDate(quote.expires_at)}까지</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4 print:px-5 print:py-3 print:space-y-3">

              {/* ── 1. 임대인 / 임차인 ── */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">임대인 (렌터카 사업자)</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-0.5">
                    <p className="font-black text-base">{company?.name || '당사'}</p>
                    {company?.business_number && <p className="text-gray-500">사업자번호: {company.business_number}</p>}
                    {company?.address && <p className="text-gray-500">{company.address}</p>}
                    {company?.phone && <p className="text-gray-500">TEL: {company.phone}</p>}
                    {company?.email && <p className="text-gray-500">{company.email}</p>}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">임차인 (고객)</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-0.5">
                    <p className="font-black text-base">{customerName}</p>
                    {customerBizNum && <p className="text-gray-500">사업자번호: {customerBizNum}</p>}
                    {customerPhone && <p className="text-gray-500">연락처: {customerPhone}</p>}
                    {customerEmail && <p className="text-gray-500">{customerEmail}</p>}
                    {customerAddress && <p className="text-gray-500">{customerAddress}</p>}
                  </div>
                </div>
              </div>

              {/* ── 2. 차량 정보 ── */}
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">차량 정보</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b border-gray-100">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500 w-24">차종</td>
                        <td className="px-3 py-1.5 font-black">{displayBrand} {displayModel}</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500 w-24">트림</td>
                        <td className="px-3 py-1.5 font-bold">{displayTrim || '-'}</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">연식</td>
                        <td className="px-3 py-1.5">{displayYear}년</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">연료</td>
                        <td className="px-3 py-1.5">{displayFuel || '-'}</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">차량가격</td>
                        <td className="px-3 py-1.5 font-bold">{f(factoryPrice)}원</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">차량번호</td>
                        <td className="px-3 py-1.5">{displayNumber || '(출고 전)'}</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">구분</td>
                        <td className="px-3 py-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            carInfo.is_used ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {carInfo.is_used ? '중고차' : '신차'}
                          </span>
                        </td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">배기량</td>
                        <td className="px-3 py-1.5">{carInfo.engine_cc ? `${f(carInfo.engine_cc)}cc` : '-'}</td>
                      </tr>
                      {(carInfo.mileage > 0 || carInfo.purchase_mileage > 0) && (
                        <tr>
                          <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">현재 주행거리</td>
                          <td className="px-3 py-1.5">{f(carInfo.mileage || 0)}km</td>
                          <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">
                            {carInfo.is_used ? '구입시 주행거리' : ''}
                          </td>
                          <td className="px-3 py-1.5">
                            {carInfo.is_used && carInfo.purchase_mileage ? `${f(carInfo.purchase_mileage)}km` : '-'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── 3. 계약 조건 ── */}
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">계약 조건</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b border-gray-100">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500 w-24">계약유형</td>
                        <td className="px-3 py-1.5 font-black">
                          {contractType === 'buyout' ? '인수형 장기렌트' : '반납형 장기렌트'}
                        </td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500 w-24">계약기간</td>
                        <td className="px-3 py-1.5 font-bold">{termMonths}개월</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">시작일</td>
                        <td className="px-3 py-1.5">{fDate(quote.start_date)}</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">종료일</td>
                        <td className="px-3 py-1.5">{fDate(quote.end_date)}</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">약정주행</td>
                        <td className="px-3 py-1.5">연간 {f(annualMileage * 10000)}km (총 {f(totalMileageLimit)}km)</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">정비상품</td>
                        <td className="px-3 py-1.5 font-bold">{MAINT_PACKAGE_LABELS[maintPackage] || maintPackage}</td>
                      </tr>
                      <tr>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">보험연령</td>
                        <td className="px-3 py-1.5">만 {driverAgeGroup}</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">자차 면책금</td>
                        <td className="px-3 py-1.5 font-bold">
                          {deductible === 0 ? '완전자차 (면책 0원)' : `${f(deductible)}원`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── 4. 월 렌탈료 안내 ── */}
              <div className="border-2 border-gray-900 rounded-lg overflow-hidden">
                <div className="bg-gray-900 text-white px-3 py-1.5">
                  <p className="font-black text-xs">월 렌탈료 안내</p>
                </div>
                <div className="border border-gray-200 rounded-b-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    <tr className="border-b border-gray-100">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500 w-28">보증금</td>
                      <td className="px-3 py-1.5 font-bold text-gray-800">
                        {depositAmt === 0 ? '없음' : <>{f(depositAmt)}원{factoryPrice > 0 && <span className="text-[10px] text-gray-400 ml-1">(차량가의 {(depositAmt / factoryPrice * 100).toFixed(0)}%)</span>}</>}
                      </td>
                    </tr>
                    {prepaymentAmt > 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">선납금</td>
                        <td className="px-3 py-1.5 font-bold text-gray-800">{f(prepaymentAmt)}원 <span className="text-[10px] text-gray-400">(계약 시 1회)</span></td>
                      </tr>
                    )}
                    <tr style={{ borderBottom: '1px solid #dbeafe', background: '#eff6ff' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1d4ed8', verticalAlign: 'middle' }}>
                        월 렌탈료<br/><span style={{ fontSize: 9, fontWeight: 400, color: '#60a5fa' }}>(VAT 포함)</span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8', letterSpacing: '-0.5px' }}>{f(rentWithVAT)}<span style={{ fontSize: 12, fontWeight: 600 }}>원</span></span>
                        <br/>
                        <span style={{ fontSize: 10, color: '#93c5fd' }}>공급가 {f(rentFee)} + VAT {f(rentVAT)}</span>
                      </td>
                    </tr>
                    {contractType === 'buyout' && (
                      <tr className="border-b border-gray-100 bg-amber-50">
                        <td className="px-3 py-1.5 font-bold text-amber-600">만기 인수가</td>
                        <td className="px-3 py-1.5 font-black text-amber-700 text-sm">{f(buyoutPrice)}<span className="text-[10px]">원</span> <span className="text-[10px] font-normal text-amber-400">잔존가율 {detail.residual_rate || '-'}%</span></td>
                      </tr>
                    )}
                  </tbody></table>
                </div>
              </div>

              {/* ── 5. 자동차보험 보장내역 ── */}
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">자동차보험 보장내역</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td className="px-3 py-1 font-bold text-gray-500 w-36">보장항목</td>
                      <td className="px-3 py-1 font-bold text-gray-500">보장내용</td>
                    </tr>
                    {(savedInsuranceCoverage || DEFAULT_INSURANCE_COVERAGE).map((item: any, idx: number) => (
                      <tr key={idx} className={idx < (savedInsuranceCoverage || DEFAULT_INSURANCE_COVERAGE).length - 1 ? 'border-b border-gray-100' : ''}>
                        <td className="px-3 py-1.5 font-bold text-gray-700">{item.label}</td>
                        <td className="px-3 py-1.5 text-gray-600">
                          {(item.description || '').replace(/\{deductible\}/g, f(deductible))}
                          {(item.description || '').includes('{deductible}') && deductible === 0 && (
                            <span className="text-green-600 font-bold ml-1">(완전면책)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
                <p className="text-[8px] text-gray-400 mt-1">※ {savedInsuranceNote || '렌터카 공제조합 가입 · 보험기간: 계약기간 동안 연단위 자동갱신 · 보험료 렌탈료 포함'}</p>
              </div>

              {/* ── 5-1. 렌탈료 포함 서비스 ── */}
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">렌탈료 포함 서비스</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    <tr className="border-b border-gray-100">
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700 w-28">자동차보험</td>
                      <td className="px-3 py-1 text-blue-600">
                        종합 (대인II·대물1억·자손·무보험차·자차) · {deductible > 0 ? `면책 ${f(deductible)}원` : '완전자차'} · 만 {driverAgeGroup}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700">세금</td>
                      <td className="px-3 py-1 text-blue-600">자동차세·취득세 렌탈료 포함</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700">등록비용</td>
                      <td className="px-3 py-1 text-blue-600">번호판·인지세·공채·등록대행</td>
                    </tr>
                    <tr>
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700">{maintPackage !== 'self' ? MAINT_PACKAGE_LABELS[maintPackage] || '정비' : '정기검사'}</td>
                      <td className="px-3 py-1 text-blue-600">{maintPackage !== 'self' ? (MAINT_PACKAGE_DESC[maintPackage] || '정비 포함') : '자동차 정기검사(종합검사) 포함'}</td>
                    </tr>
                  </tbody></table>
                </div>
              </div>

              {/* ── 6. 약정 조건 상세 ── */}
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">약정 조건</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      <TRow label="계약기간" value={`${termMonths}개월 (${fDate(quote.start_date)} ~ ${fDate(quote.end_date)})`} bold />
                      <TRow label="약정 주행거리" value={`연간 ${f(annualMileage * 10000)}km (계약기간 총 ${f(totalMileageLimit)}km)`} />
                      <TRow label="초과주행 요금" value={excessMileageRate > 0
                        ? `km당 ${f(excessMileageRate)}원 (약정거리 초과 시 계약 종료 시점 정산)`
                        : '해당 없음 (무제한 주행)'
                      } />
                      <TRow label="보증금" value={depositAmt > 0
                        ? `${f(depositAmt)}원 (계약 종료 시 차량 상태 확인 후 환급)`
                        : '없음 (무보증금)'
                      } />
                      {prepaymentAmt > 0 && <TRow label="선납금" value={`${f(prepaymentAmt)}원 (계약 시 선납, 렌탈료 할인 적용)`} />}
                      <TRow label="보험 조건" value={`종합보험 포함 · 만 ${driverAgeGroup} · 자차면책 ${deductible === 0 ? '완전자차' : `${f(deductible)}원`}`} />
                      <TRow label="정비 조건" value={`${MAINT_PACKAGE_LABELS[maintPackage]} — ${MAINT_PACKAGE_DESC[maintPackage]}`} />
                      <TRow label="자동차세" value="렌탈료에 포함 (별도 부담 없음)" />
                      <TRow label="중도해지" value={getEarlyTerminationDisplay()} />
                      <TRow label="반납 조건" value={contractType === 'buyout'
                        ? '만기 시 인수 또는 반납 선택 가능 (반납 시 차량 상태 평가 후 보증금 정산)'
                        : '만기 시 차량 반납 (차량 상태 평가 후 보증금 정산)'
                      } />
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── 7. 보증금/선납금 할인 효과 안내 ── */}
              {(depositDiscount > 0 || prepaymentDiscount > 0) && (
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">보증금 · 선납금 할인 효과</p>
                  <div className="border border-green-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs"><tbody>
                      {depositDiscount > 0 && (
                        <tr className="border-b border-green-100 bg-green-50">
                          <td className="px-3 py-1.5 text-green-700">보증금 {f(depositAmt)}원 납부 → 월 렌탈료 할인</td>
                          <td className="px-3 py-1.5 text-right font-black text-green-700">-{f(depositDiscount)}원/월</td>
                        </tr>
                      )}
                      {prepaymentDiscount > 0 && (
                        <tr className="border-b border-green-100 bg-green-50">
                          <td className="px-3 py-1.5 text-green-700">선납금 {f(prepaymentAmt)}원 납부 → 월 렌탈료 할인</td>
                          <td className="px-3 py-1.5 text-right font-black text-green-700">-{f(prepaymentDiscount)}원/월</td>
                        </tr>
                      )}
                      <tr>
                        <td colSpan={2} className="px-3 py-1 text-[10px] text-green-600 bg-green-50/50">* 보증금은 만기 시 원금 환급, 납부 기간 동안 렌탈료 할인 적용</td>
                      </tr>
                    </tbody></table>
                  </div>
                </div>
              )}

              {/* ── 8. 인수 안내 (인수형만) ── */}
              {contractType === 'buyout' && (
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">인수 안내</p>
                  <div className="border border-amber-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs"><tbody>
                      <tr className="border-b border-amber-100">
                        <td className="bg-amber-50 px-3 py-1.5 font-bold text-amber-600 w-28">인수가격</td>
                        <td className="px-3 py-1.5 font-black text-amber-700 text-sm">{f(buyoutPrice)}원</td>
                      </tr>
                      <tr className="border-b border-amber-100">
                        <td className="bg-amber-50 px-3 py-1.5 font-bold text-amber-600">잔존가치율</td>
                        <td className="px-3 py-1.5 font-bold text-gray-700">{detail.residual_rate || '-'}%</td>
                      </tr>
                      <tr className="border-b border-amber-100">
                        <td className="bg-amber-50 px-3 py-1.5 font-bold text-amber-600">총 투자비용</td>
                        <td className="px-3 py-1.5 font-bold text-gray-700">{f(totalWithBuyout)}원</td>
                      </tr>
                      <tr>
                        <td colSpan={2} className="px-3 py-1 text-[10px] text-amber-600 bg-amber-50/50">
                          * 만기 시 인수가격으로 소유권 이전 가능 · 반납도 가능 · 인수 시 취득세(7%)+이전등록비 임차인 부담
                        </td>
                      </tr>
                    </tbody></table>
                  </div>
                </div>
              )}

              {/* ── 9. 비고 ── */}
              {detail.note && (
                <div className="border border-yellow-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    <tr>
                      <td className="bg-yellow-50 px-3 py-1.5 font-bold text-yellow-700 w-16 align-top">비고</td>
                      <td className="px-3 py-1.5 text-gray-700 whitespace-pre-wrap">{detail.note}</td>
                    </tr>
                  </tbody></table>
                </div>
              )}

              {/* ── 10. 유의사항 ── */}
              <div className="border-t border-gray-200 pt-3">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">유의사항 및 특약</p>
                <div className="text-[10px] text-gray-500 space-y-1 leading-relaxed">
                  {(savedQuoteNotices || DEFAULT_QUOTE_NOTICES).map((item: any, idx: number) => {
                    // 조건부 항목 처리
                    if (item?.condition === 'buyout' && contractType !== 'buyout') return null

                    // 플레이스홀더 치환
                    let text = item?.text || item
                    if (typeof text === 'string') {
                      text = text
                        .replace(/\{deductible\}/g, f(deductible))
                        .replace(/\{excessRate\}/g, f(excessMileageRate))
                        .replace(/\{earlyTerminationRate\}/g, String(earlyTerminationRate))
                    }

                    return <p key={idx}>{idx + 1}. {text}</p>
                  })}
                </div>
              </div>

              {/* ── 11. 서명란 ── */}
              <div className="grid grid-cols-2 gap-8 pt-6">
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-10">임대인 (서명/인)</p>
                  <div className="border-t border-gray-300 pt-2">
                    <p className="text-sm font-bold text-gray-700">{company?.name || '당사'}</p>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-10">임차인 (서명/인)</p>
                  <div className="border-t border-gray-300 pt-2">
                    <p className="text-sm font-bold text-gray-700">{customerName}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 푸터 */}
            <div className="bg-gray-50 px-8 py-4 border-t border-gray-200 text-center">
              <p className="text-[10px] text-gray-400">
                본 견적서는 {company?.name || '당사'}에서 발행한 공식 견적서입니다. 문의: {company?.phone || '-'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          내부 원가분석 뷰
          ============================================================ */}
      {viewMode === 'analysis' && (
        <div className="max-w-[1200px] mx-auto pb-10 px-4 md:px-6 no-print-alt">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

            {/* 왼쪽: 견적 기본 정보 */}
            <div className="lg:col-span-7 space-y-4">

              {/* 고객 + 차량 요약 카드 */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                  <h3 className="font-bold text-gray-800 text-sm">견적 기본 정보</h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-5">
                    {car.image_url && (
                      <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden border flex-shrink-0">
                        <img src={car.image_url} className="w-full h-full object-cover" alt="car" />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                        <span className="font-black text-lg text-gray-900">{displayBrand} {displayModel}</span>
                        {displayNumber && <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold">{displayNumber}</span>}
                      </div>
                      <p className="text-gray-500 text-sm">{displayTrim} · {displayYear}년식 · {displayFuel}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ['고객명', customerName],
                      ['계약유형', contractType === 'buyout' ? '인수형' : '반납형'],
                      ['계약기간', `${termMonths}개월`],
                      ['약정주행', `연 ${f(annualMileage * 10000)}km`],
                      ['정비상품', MAINT_PACKAGE_LABELS[maintPackage] || '-'],
                      ['보증금', `${f(depositAmt)}원`],
                    ].map(([l, v], i) => (
                      <div key={i} className="flex justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-gray-500">{l}</span>
                        <span className="font-bold">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 감가 분석 */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                  <h3 className="font-bold text-gray-800 text-sm">감가상각 분석</h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm mb-4">
                    {[
                      ['차량가(신차가)', f(factoryPrice) + '원'],
                      ['매입가', f(purchasePrice) + '원'],
                      ['취득원가', f(totalAcquisitionCost) + '원'],
                      ['현재시장가', f(detail.current_market_value) + '원'],
                      ['만기시장가', f(detail.end_market_value) + '원'],
                    ].map(([l, v], i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-gray-400 text-xs mb-1">{l}</p>
                        <p className="font-black text-sm">{v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="flex justify-between bg-blue-50 rounded-lg px-3 py-2">
                      <span className="text-blue-500">현재감가율</span>
                      <span className="font-bold text-blue-700">{(detail.total_dep_rate || 0).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between bg-blue-50 rounded-lg px-3 py-2">
                      <span className="text-blue-500">만기감가율</span>
                      <span className="font-bold text-blue-700">{(detail.total_dep_rate_end || 0).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between bg-blue-50 rounded-lg px-3 py-2">
                      <span className="text-blue-500">감가커브</span>
                      <span className="font-bold text-blue-700">{detail.dep_curve_preset || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 금융 분석 */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                  <h3 className="font-bold text-gray-800 text-sm">금융비용 분석 (평균잔액법)</h3>
                </div>
                <div className="p-6 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400 text-xs mb-2 font-bold">대출</p>
                    <div className="space-y-2">
                      <div className="flex justify-between bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-500">대출금액</span><span className="font-bold">{f(detail.loan_amount)}원</span></div>
                      <div className="flex justify-between bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-500">대출금리</span><span className="font-bold">{detail.loan_rate || 0}%</span></div>
                      {costBreakdown.avg_loan_balance > 0 && (
                        <div className="flex justify-between bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-500">평균잔액</span><span className="font-bold">{f(costBreakdown.avg_loan_balance)}원</span></div>
                      )}
                      <div className="flex justify-between bg-blue-50 rounded-lg px-3 py-2"><span className="text-blue-600">월 이자</span><span className="font-black text-blue-700">{f(monthlyLoanInterest)}원</span></div>
                    </div>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-2 font-bold">자기자본 / 기회비용</p>
                    <div className="space-y-2">
                      <div className="flex justify-between bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-500">자기자본</span><span className="font-bold">{f(totalAcquisitionCost - (detail.loan_amount || 0))}원</span></div>
                      <div className="flex justify-between bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-500">투자수익률</span><span className="font-bold">{detail.investment_rate || 0}%</span></div>
                      {costBreakdown.avg_equity_balance > 0 && (
                        <div className="flex justify-between bg-gray-50 rounded-lg px-3 py-2"><span className="text-gray-500">평균잔액</span><span className="font-bold">{f(costBreakdown.avg_equity_balance)}원</span></div>
                      )}
                      <div className="flex justify-between bg-purple-50 rounded-lg px-3 py-2"><span className="text-purple-600">월 기회비용</span><span className="font-black text-purple-700">{f(monthlyOpportunityCost)}원</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 보증금 & 선납금 효과 */}
              {(depositDiscount > 0 || prepaymentDiscount > 0) && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50"><h3 className="font-bold text-gray-800 text-sm">보증금 & 선납금 효과</h3></div>
                  <div className="p-6 space-y-3 text-sm">
                    {depositDiscount > 0 && <div className="flex justify-between bg-green-50 rounded-lg px-3 py-2"><span className="text-green-600">보증금 할인 효과</span><span className="font-black text-green-700">-{f(depositDiscount)}원/월</span></div>}
                    {prepaymentDiscount > 0 && <div className="flex justify-between bg-green-50 rounded-lg px-3 py-2"><span className="text-green-600">선납금 할인 효과</span><span className="font-black text-green-700">-{f(prepaymentDiscount)}원/월</span></div>}
                  </div>
                </div>
              )}
            </div>

            {/* 오른쪽: 산출 결과 패널 */}
            <div className="lg:col-span-5 space-y-3">

              {/* 원가분석 결과 (다크 카드) */}
              <div className="bg-gray-900 text-white rounded-2xl shadow-xl p-4">
                <div className="border-b border-gray-700 pb-2 mb-3">
                  <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Pricing Analysis</p>
                  <h2 className="text-base font-black mt-0.5">원가분석 결과</h2>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-gray-400">감가상각</span><span className="font-bold">{f(monthlyDep)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">대출이자</span><span className="font-bold">{f(monthlyLoanInterest)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">기회비용</span><span className="font-bold">{f(monthlyOpportunityCost)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">보험료</span><span className="font-bold">{f(monthlyInsurance)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">정비비</span><span className="font-bold">{f(monthlyMaint)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">자동차세</span><span className="font-bold">{f(monthlyTax)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">리스크적립</span><span className="font-bold">{f(monthlyRisk)}원</span></div>
                  {(depositDiscount > 0 || prepaymentDiscount > 0) && (
                    <>
                      <div className="border-t border-gray-700 my-1" />
                      {depositDiscount > 0 && <div className="flex justify-between text-green-400"><span>보증금할인</span><span className="font-bold">-{f(depositDiscount)}원</span></div>}
                      {prepaymentDiscount > 0 && <div className="flex justify-between text-green-400"><span>선납할인</span><span className="font-bold">-{f(prepaymentDiscount)}원</span></div>}
                    </>
                  )}
                  <div className="border-t border-gray-700 my-2 pt-2">
                    <div className="flex justify-between"><span className="text-gray-300 font-bold">총 원가</span><span className="font-black text-sm">{f(totalMonthlyCost)}원</span></div>
                  </div>
                  <div className="flex justify-between text-green-400"><span className="font-bold">+ 마진</span><span className="font-bold">{f(margin)}원</span></div>
                  <div className="border-t border-gray-500 my-2 pt-2">
                    <div className="text-right">
                      <p className="text-[10px] text-yellow-400 font-bold mb-0.5">월 렌트료 (VAT별도)</p>
                      <p className="text-2xl font-black tracking-tight">{f(suggestedRent)}<span className="text-sm ml-1">원</span></p>
                    </div>
                  </div>
                </div>

                {/* 원가 비중 바 */}
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <p className="text-[10px] text-gray-400 mb-2 font-bold">원가 비중</p>
                  <div className="space-y-1.5">
                    <CostBar label="감가" value={monthlyDep} total={totalCostForBar} color="bg-red-500" />
                    <CostBar label="금융" value={monthlyFinance} total={totalCostForBar} color="bg-blue-500" />
                    <CostBar label="보험+세금" value={monthlyInsurance + monthlyTax} total={totalCostForBar} color="bg-purple-500" />
                    <CostBar label="정비" value={monthlyMaint} total={totalCostForBar} color="bg-amber-500" />
                    <CostBar label="리스크" value={monthlyRisk} total={totalCostForBar} color="bg-red-400" />
                  </div>
                </div>

                {worksheet && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <button onClick={handleEditWorksheet} className="w-full py-2.5 bg-steel-600 hover:bg-steel-500 text-white rounded-xl font-bold text-xs transition-colors">렌트가 산출 수정 →</button>
                    <p className="text-[10px] text-gray-500 text-center mt-1">워크시트: {String(worksheet.id).slice(0, 8)} · {fDate(worksheet.updated_at)}</p>
                  </div>
                )}
              </div>

              {/* 수익성 + 초과주행 — 2열 그리드 */}
              <div className="grid grid-cols-2 gap-3">
                {/* 수익성 요약 */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                  <h3 className="font-bold text-gray-700 mb-2 text-xs">수익성 요약</h3>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs"><span className="text-gray-500">월 순이익</span><span className="font-bold text-green-600">{f(margin)}원</span></div>
                    <div className="flex justify-between text-xs"><span className="text-gray-500">총이익</span><span className="font-black text-green-700">{f(margin * termMonths)}원</span></div>
                    <div className="border-t pt-1.5 space-y-1">
                      <div className="flex justify-between text-xs"><span className="text-gray-500">마진율</span><span className="font-bold text-steel-600">{suggestedRent > 0 ? (margin / suggestedRent * 100).toFixed(1) : 0}%</span></div>
                      <div className="flex justify-between text-xs"><span className="text-gray-500">연 ROI</span><span className="font-bold text-steel-600">{totalAcquisitionCost > 0 ? ((margin * 12) / totalAcquisitionCost * 100).toFixed(1) : 0}%</span></div>
                    </div>
                  </div>
                </div>

                {/* 초과주행 요금 */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                  <h3 className="font-bold text-gray-700 mb-2 text-xs">초과주행 요금</h3>
                  {excessMileageRate > 0 ? (
                    <>
                      <div className="text-center bg-red-50 rounded-lg p-2 mb-2">
                        <p className="text-red-500 text-[10px] font-bold mb-0.5">km당</p>
                        <p className="text-lg font-black text-red-600">{f(excessMileageRate)}원</p>
                      </div>
                      <div className="text-[10px] text-gray-500 space-y-0.5">
                        <p>연 {f(annualMileage * 10000)}km</p>
                        <p>총 {f(totalMileageLimit)}km</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">설정 없음</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 견적서 발송 모달 ===== */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 no-print" onClick={() => { setShowShareModal(false); setSendResult(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-gray-900">견적서 발송</h3>
              <button onClick={() => { setShowShareModal(false); setSendResult(null) }} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>

            {shareLoading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-500 text-sm">링크 생성 중...</p>
              </div>
            ) : shareUrl ? (
              <div className="space-y-3">
                {/* 메시지 미리보기 (축소) */}
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: '12px 16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{(quote?.car?.brand || quote?.quote_detail?.car_info?.brand || '')} {(quote?.car?.model || quote?.quote_detail?.car_info?.model || '').split('(')[0]}</span>
                      <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 8 }}>{(quote?.quote_detail?.contract_type === 'buyout' ? '인수형' : '반납형')} · {(quote?.quote_detail?.term_months || 36)}개월</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 900, fontSize: 18, color: '#1d4ed8' }}>월 {Math.round((quote?.rent_fee || 0) * 1.1).toLocaleString()}원</span>
                      <span style={{ color: '#94a3b8', fontSize: 10, marginLeft: 4 }}>(VAT포함)</span>
                    </div>
                  </div>
                </div>

                {/* 발송 채널 선택 */}
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2">발송 방법</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([
                      { key: 'copy', icon: '📋', label: '복사' },
                      { key: 'kakao', icon: '💬', label: '카카오톡' },
                      { key: 'sms', icon: '📱', label: '문자' },
                      { key: 'email', icon: '📧', label: '이메일' },
                    ] as const).map(ch => (
                      <button
                        key={ch.key}
                        onClick={() => { setSendChannel(ch.key); setSendResult(null) }}
                        className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all border-2 ${
                          sendChannel === ch.key
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-base block mb-0.5">{ch.icon}</span>
                        {ch.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 채널별 입력 폼 */}
                {sendChannel === 'copy' ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleCopyShareUrl('message')}
                        className={`py-3 rounded-xl text-sm font-bold transition-all ${
                          shareCopied ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {shareCopied ? '복사됨!' : '💬 메시지 복사'}
                      </button>
                      <button
                        onClick={() => handleCopyShareUrl('link')}
                        className="py-3 rounded-xl text-sm font-bold bg-gray-200 text-gray-700 hover:bg-gray-300"
                      >
                        🔗 링크만 복사
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400">복사한 내용을 카카오톡/문자에 붙여넣기하여 전송하세요.</p>
                  </div>
                ) : sendChannel === 'email' ? (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500">수신 이메일</label>
                    <input
                      type="email"
                      value={sendEmail}
                      onChange={e => setSendEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleDirectSend}
                      disabled={sending || !sendEmail}
                      className="w-full py-3 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? '발송 중...' : '📧 이메일 발송'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500">수신 전화번호</label>
                    <input
                      type="tel"
                      value={sendPhone}
                      onChange={e => setSendPhone(e.target.value)}
                      placeholder="010-1234-5678"
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleDirectSend}
                      disabled={sending || !sendPhone}
                      className="w-full py-3 rounded-xl text-sm font-bold bg-yellow-400 text-gray-900 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? '발송 중...' : sendChannel === 'kakao' ? '💬 카카오 알림톡 발송' : '📱 문자(SMS) 발송'}
                    </button>
                    {sendChannel === 'kakao' && (
                      <p className="text-[10px] text-gray-400">* 카카오 알림톡 발송 실패 시 자동으로 SMS로 대체 발송됩니다.</p>
                    )}
                  </div>
                )}

                {/* 발송 결과 */}
                {sendResult && (
                  <div className={`rounded-xl p-3 text-sm font-bold text-center ${
                    sendResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {sendResult.success ? '✅ ' : '❌ '}{sendResult.message}
                  </div>
                )}

                {/* 하단 정보 */}
                <div className="flex justify-between items-center text-xs text-gray-400 pt-1 border-t border-gray-100">
                  <span>유효기간: 7일</span>
                  <button onClick={handleRevokeShare} className="text-red-400 hover:text-red-600 font-bold">링크 비활성화</button>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-4">공유 링크를 생성할 수 없습니다.</p>
            )}
          </div>
        </div>
      )}

      {/* ======================== 타임라인 섹션 ======================== */}
      <QuoteTimeline quoteId={quote?.id} />

      <style jsx global>{`
        @media print {
          /* 페이지 설정 */
          @page {
            size: A4;
            margin: 10mm 8mm 10mm 8mm;
          }

          /* 기본 리셋 */
          html, body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* 불필요한 UI 요소 숨기기 */
          .no-print,
          nav, header, footer,
          [class*="no-print"] {
            display: none !important;
          }

          /* 오버플로 해제 — 이것이 짤림 방지의 핵심 */
          * {
            overflow: visible !important;
          }

          /* 컨테이너 최대폭/패딩/마진 리셋 */
          .max-w-\\[900px\\],
          [class*="max-w-"] {
            max-width: 100% !important;
          }
          .shadow-xl, .shadow-lg, .shadow-sm, .shadow {
            box-shadow: none !important;
          }
          .rounded-2xl, .rounded-xl {
            border-radius: 8px !important;
          }

          /* 페이지 넘김 제어 */
          h3, h2, h1 {
            page-break-after: avoid;
          }
          tr, .grid {
            page-break-inside: avoid;
          }
          table {
            page-break-inside: auto;
          }

          /* 배경색 인쇄 보장 */
          .bg-gray-900 {
            background-color: #111827 !important;
          }
          .bg-gray-50 {
            background-color: #f9fafb !important;
          }
          .bg-gray-100 {
            background-color: #f3f4f6 !important;
          }

          /* 텍스트 크기 미세 조정 (인쇄 가독성) */
          body {
            font-size: 11pt !important;
            line-height: 1.4 !important;
          }
        }
      `}</style>
    </div>
  )
}
