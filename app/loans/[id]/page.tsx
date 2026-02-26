'use client'
import { supabase } from '../../utils/supabase'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApp } from '../../context/AppContext'

export default function LoanDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { company, role, adminSelectedCompanyId } = useApp()
  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id
  const isNew = params.id === 'new'
  const loanId = isNew ? null : params.id

  const [loading, setLoading] = useState(!isNew)
  const [uploading, setUploading] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [cars, setCars] = useState<any[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [realRepaidTotal, setRealRepaidTotal] = useState(0)
  const [previewFile, setPreviewFile] = useState<any>(null)
  const [activeSection, setActiveSection] = useState<string | null>(null)

  const [loan, setLoan] = useState<any>({
    car_id: '', finance_name: '', type: '할부',
    vehicle_price: 0, acquisition_tax: 0, deposit: 0,
    total_amount: 0, interest_rate: 0, months: 60,
    monthly_payment: 0,
    first_payment: 0, first_payment_date: '',
    payment_date: 0,
    start_date: '', end_date: '',
    guarantor_name: '', guarantor_limit: 0,
    attachments: [],
    quote_number: '', quote_date: '', valid_date: '',
    dealer_name: '', dealer_location: '',
    discount_amount: 0, sale_price: 0, option_amount: 0,
    advance_rate: 0, grace_rate: 0, grace_amount: 0,
    bond_cost: 0, misc_fees: 0, stamp_duty: 0,
    customer_initial_payment: 0,
    displacement: '', fuel_type: ''
  })

  // 자동 계산
  const actualFirstPayment = loan.first_payment > 0 ? loan.first_payment : loan.monthly_payment
  const remainingMonths = loan.months > 0 ? loan.months - 1 : 0
  const totalRepay = actualFirstPayment + (loan.monthly_payment * remainingMonths)
  const totalInterest = totalRepay > loan.total_amount ? totalRepay - loan.total_amount : 0
  const progressRate = totalRepay > 0 ? Math.min((realRepaidTotal / totalRepay) * 100, 100) : 0
  const remainingAmount = totalRepay - realRepaidTotal

  useEffect(() => {
    fetchCars()
    if (!isNew && loanId) {
      fetchLoanDetail()
      fetchRealRepayment()
    }
  }, [])

  // sale_price 자동 계산
  useEffect(() => {
    if (loan.vehicle_price > 0 && loan.discount_amount >= 0) {
      const sp = loan.vehicle_price - loan.discount_amount
      if (sp !== loan.sale_price) setLoan((p: any) => ({ ...p, sale_price: sp }))
    }
  }, [loan.vehicle_price, loan.discount_amount])

  // customer_initial_payment 자동 계산
  useEffect(() => {
    const cip = (loan.deposit || 0) + (loan.acquisition_tax || 0) + (loan.bond_cost || 0) + (loan.misc_fees || 0) + (loan.stamp_duty || 0)
    if (cip !== loan.customer_initial_payment) setLoan((p: any) => ({ ...p, customer_initial_payment: cip }))
  }, [loan.deposit, loan.acquisition_tax, loan.bond_cost, loan.misc_fees, loan.stamp_duty])

  // 만기일 자동 계산
  useEffect(() => {
    if (loan.first_payment_date && loan.months > 0) {
      const firstDate = new Date(loan.first_payment_date)
      firstDate.setMonth(firstDate.getMonth() + (loan.months - 1))
      const targetDay = loan.payment_date > 0 ? loan.payment_date : firstDate.getDate()
      firstDate.setDate(targetDay)
      setLoan((prev: any) => ({ ...prev, end_date: firstDate.toISOString().split('T')[0] }))
    } else if (loan.start_date && loan.months > 0) {
      const start = new Date(loan.start_date)
      start.setMonth(start.getMonth() + loan.months)
      setLoan((prev: any) => ({ ...prev, end_date: start.toISOString().split('T')[0] }))
    }
  }, [loan.first_payment_date, loan.start_date, loan.months, loan.payment_date])

  const fetchCars = async () => {
    const { data } = await supabase.from('cars').select('id, number, model').order('number', { ascending: true })
    setCars(data || [])
  }

  const fetchRealRepayment = async () => {
    const { data } = await supabase.from('transactions').select('amount').eq('related_type', 'loan').eq('related_id', loanId).eq('type', 'expense')
    if (data) setRealRepaidTotal(data.reduce((acc, cur) => acc + (cur.amount || 0), 0))
  }

  const fetchLoanDetail = async () => {
    const { data, error } = await supabase.from('loans').select('*').eq('id', loanId).single()
    if (error) { alert('데이터 로드 실패'); router.push('/loans') }
    else {
      setLoan({
        ...data,
        vehicle_price: data.vehicle_price || 0, acquisition_tax: data.acquisition_tax || 0,
        deposit: data.deposit || 0, total_amount: data.total_amount || 0,
        interest_rate: data.interest_rate || 0, monthly_payment: data.monthly_payment || 0,
        first_payment: data.first_payment || 0, first_payment_date: data.first_payment_date || '',
        payment_date: data.payment_date || 0, guarantor_limit: data.guarantor_limit || 0,
        attachments: data.attachments || [],
        quote_number: data.quote_number || '', quote_date: data.quote_date || '',
        valid_date: data.valid_date || '', dealer_name: data.dealer_name || '',
        dealer_location: data.dealer_location || '',
        discount_amount: data.discount_amount || 0, sale_price: data.sale_price || 0,
        option_amount: data.option_amount || 0, advance_rate: data.advance_rate || 0,
        grace_rate: data.grace_rate || 0, grace_amount: data.grace_amount || 0,
        bond_cost: data.bond_cost || 0, misc_fees: data.misc_fees || 0,
        stamp_duty: data.stamp_duty || 0, customer_initial_payment: data.customer_initial_payment || 0,
        displacement: data.displacement || '', fuel_type: data.fuel_type || ''
      })
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (isNew && role === 'god_admin' && !adminSelectedCompanyId) return alert('회사를 먼저 선택해주세요.')
    if (!loan.car_id || !loan.finance_name) return alert('차량과 금융사는 필수 입력입니다.')
    const payload = {
      ...loan,
      start_date: loan.start_date || null, end_date: loan.end_date || null,
      first_payment_date: loan.first_payment_date || null,
      quote_date: loan.quote_date || null, valid_date: loan.valid_date || null,
    }
    if (isNew) payload.company_id = effectiveCompanyId
    const query = isNew ? supabase.from('loans').insert(payload) : supabase.from('loans').update(payload).eq('id', loanId)
    const { error } = await query
    if (error) alert('저장 실패: ' + error.message)
    else { alert('저장되었습니다!'); router.push('/loans') }
  }

  const handleDelete = async () => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    await supabase.from('loans').delete().eq('id', loanId)
    router.push('/loans')
  }

  const handleMoneyChange = (field: string, value: string) => {
    const numValue = Number(value.replace(/,/g, ''))
    if (isNaN(numValue)) return
    setLoan((prev: any) => {
      const updated = { ...prev, [field]: numValue }
      if (field === 'vehicle_price' || field === 'deposit') {
        updated.total_amount = updated.vehicle_price - updated.deposit
      }
      return updated
    })
  }

  const fmt = (n: number) => (n || 0).toLocaleString()

  // 파일 업로드
  const uploadFiles = async (files: FileList | File[]) => {
    setUploading(true)
    const newAttachments = [...loan.attachments]
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileExt = file.name.split('.').pop()
        const fileName = `loan_${loanId || 'new'}_${Date.now()}_${i}.${fileExt}`
        const { error: uploadError } = await supabase.storage.from('contracts').upload(fileName, file)
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName)
        newAttachments.push({ name: file.name, url: publicUrl, type: fileExt?.toLowerCase() || 'file' })
      }
      if (!isNew) {
        await supabase.from('loans').update({ attachments: newAttachments }).eq('id', loanId)
      }
      setLoan((prev: any) => ({ ...prev, attachments: newAttachments }))
    } catch (err: any) { alert('업로드 실패: ' + err.message) }
    finally { setUploading(false) }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) uploadFiles(e.target.files)
  }

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const onDragLeave = useCallback(() => setIsDragging(false), [])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files)
  }, [loan.attachments])

  const deleteAttachment = async (index: number) => {
    if (!confirm('삭제하시겠습니까?')) return
    const newAttachments = loan.attachments.filter((_: any, i: number) => i !== index)
    if (!isNew) await supabase.from('loans').update({ attachments: newAttachments }).eq('id', loanId)
    setLoan((prev: any) => ({ ...prev, attachments: newAttachments }))
  }

  const isImageFile = (type: string) => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(type)

  // AI 견적서 인식
  const handleOcrParse = async () => {
    const imageAttachment = loan.attachments?.find((a: any) => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(a.type?.toLowerCase()))
    if (!imageAttachment) { alert('먼저 견적서 이미지를 업로드해주세요.'); return }
    setOcrLoading(true)
    try {
      const res = await fetch(imageAttachment.url)
      const blob = await res.blob()
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(blob)
      })
      const apiRes = await fetch('/api/ocr-loan-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: blob.type || 'image/jpeg' })
      })
      const data = await apiRes.json()
      if (data.error) throw new Error(data.error)
      setLoan((prev: any) => ({
        ...prev,
        ...(data.quote_number && { quote_number: data.quote_number }),
        ...(data.quote_date && { quote_date: data.quote_date }),
        ...(data.valid_date && { valid_date: data.valid_date }),
        ...(data.dealer_name && { dealer_name: data.dealer_name }),
        ...(data.dealer_location && { dealer_location: data.dealer_location }),
        ...(data.vehicle_price && { vehicle_price: data.vehicle_price }),
        ...(data.discount_amount && { discount_amount: data.discount_amount }),
        ...(data.sale_price && { sale_price: data.sale_price }),
        ...(data.option_amount && { option_amount: data.option_amount }),
        ...(data.displacement && { displacement: data.displacement }),
        ...(data.fuel_type && { fuel_type: data.fuel_type }),
        ...(data.finance_months && { months: data.finance_months }),
        ...(data.advance_rate && { advance_rate: data.advance_rate }),
        ...(data.deposit && { deposit: data.deposit }),
        ...(data.grace_rate && { grace_rate: data.grace_rate }),
        ...(data.grace_amount && { grace_amount: data.grace_amount }),
        ...(data.total_amount && { total_amount: data.total_amount }),
        ...(data.interest_rate && { interest_rate: data.interest_rate }),
        ...(data.monthly_payment && { monthly_payment: data.monthly_payment }),
        ...(data.acquisition_tax && { acquisition_tax: data.acquisition_tax }),
        ...(data.bond_cost && { bond_cost: data.bond_cost }),
        ...(data.misc_fees && { misc_fees: data.misc_fees }),
        ...(data.stamp_duty && { stamp_duty: data.stamp_duty }),
        ...(data.customer_initial_payment && { customer_initial_payment: data.customer_initial_payment }),
      }))
      alert('견적서 인식 완료! 자동 입력되었습니다.')
    } catch (err: any) { alert('인식 실패: ' + err.message) }
    finally { setOcrLoading(false) }
  }

  // 섹션 헤더 컴포넌트
  const SectionHeader = ({ color, title, sub }: { color: string; title: string; sub?: string }) => (
    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
      <span className={`w-1 h-5 ${color} rounded-full`}></span>
      {title}
      {sub && <span className="text-xs font-bold text-gray-400 ml-1">{sub}</span>}
    </h2>
  )

  // 라벨 컴포넌트
  const Label = ({ children, accent }: { children: React.ReactNode; accent?: string }) => (
    <label className={`block text-xs font-bold ${accent || 'text-gray-400'} mb-1.5 uppercase tracking-wide`}>{children}</label>
  )

  // 인풋 컴포넌트
  const Input = ({ value, onChange, placeholder, readOnly, right, className: cn }: any) => (
    <input
      type="text"
      className={`w-full border border-gray-200 p-3 rounded-xl font-bold text-sm focus:border-steel-500 focus:bg-white outline-none transition-all ${right ? 'text-right' : ''} ${readOnly ? 'bg-gray-100 border-dashed cursor-default' : 'bg-white'} ${cn || ''}`}
      placeholder={placeholder} value={value} onChange={onChange} readOnly={readOnly}
    />
  )

  if (loading) return <div className="p-20 text-center font-bold text-gray-500">데이터 불러오는 중...</div>

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen pb-40">

      {/* 헤더 */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <button onClick={() => router.back()} className="text-sm text-gray-500 font-bold mb-2 hover:text-black transition-colors">
            ← 목록으로
          </button>
          <h1 className="text-2xl font-black text-gray-900">{isNew ? '신규 금융 등록' : '금융 계약 상세'}</h1>
        </div>
        <div className="flex items-center gap-3">
          {!isNew && (
            <button onClick={handleDelete} className="text-xs bg-white border border-red-200 text-red-500 px-4 py-2.5 rounded-xl font-bold hover:bg-red-50 transition-colors">
              삭제
            </button>
          )}
          <button onClick={handleSave} className="bg-steel-700 text-white px-8 py-3 rounded-xl font-bold hover:bg-steel-800 shadow-lg hover:shadow-xl transition-all">
            {isNew ? '등록 완료' : '저장'}
          </button>
        </div>
      </div>

      {/* 메인 레이아웃: 2컬럼 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* 좌측: 상세 폼 */}
        <div className="lg:col-span-7 space-y-6">

          {/* ─── 첨부파일 & AI 인식 (기존 대출만 표시) ─── */}
          {!isNew && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <SectionHeader color="bg-purple-600" title="첨부파일" sub="견적서 / 계약서" />

            <div
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-200 mb-4 ${
                isDragging ? 'border-purple-500 bg-purple-50 scale-[1.01]' : 'border-gray-300 bg-gray-50/50 hover:border-gray-400'
              }`}
            >
              <div className="pointer-events-none">
                <p className="text-2xl mb-1">{isDragging ? '📂' : '☁️'}</p>
                <p className={`font-bold text-sm ${isDragging ? 'text-purple-600' : 'text-gray-500'}`}>
                  {isDragging ? '여기에 놓으세요!' : '견적서 이미지 또는 PDF를 드래그하세요'}
                </p>
                <p className="text-xs text-gray-400 mt-1">클릭하여 파일 선택도 가능합니다</p>
              </div>
              <input type="file" multiple accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} disabled={uploading} />
              {uploading && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-2xl">
                  <span className="font-bold text-purple-600 animate-pulse">업로드 중...</span>
                </div>
              )}
            </div>

            {/* 첨부파일 목록 */}
            {loan.attachments && loan.attachments.length > 0 && (
              <div className="space-y-2 mb-4">
                {loan.attachments.map((file: any, index: number) => (
                  <div key={index} className="flex items-center gap-3 bg-gray-50 px-4 py-2.5 rounded-xl border border-gray-100 group hover:border-gray-200 transition-colors">
                    {/* 썸네일 */}
                    <div
                      className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer"
                      onClick={() => setPreviewFile(file)}
                    >
                      {isImageFile(file.type) ? (
                        <img src={file.url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-gray-400 uppercase">{file.type}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-700 truncate">{file.name}</p>
                      <p className="text-[10px] text-gray-400 uppercase">{file.type}</p>
                    </div>
                    <button onClick={() => setPreviewFile(file)} className="text-xs text-gray-400 hover:text-steel-600 font-bold px-2 py-1 rounded-lg hover:bg-white transition-colors">
                      보기
                    </button>
                    <button onClick={() => deleteAttachment(index)} className="text-gray-300 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* AI 인식 버튼 */}
            {loan.attachments?.length > 0 && (
              <button
                onClick={handleOcrParse}
                disabled={ocrLoading}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {ocrLoading ? (
                  <><span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></span> AI 인식 중...</>
                ) : (
                  <>AI 견적서 자동 인식</>
                )}
              </button>
            )}
          </div>
          )}

          {/* ─── 기본 계약 정보 ─── */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <SectionHeader color="bg-steel-600" title="기본 계약 정보" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              <div>
                <Label>대상 차량</Label>
                <select className="w-full border border-gray-200 p-3 rounded-xl font-bold text-sm bg-white focus:border-steel-500 outline-none" value={loan.car_id} onChange={e => setLoan({ ...loan, car_id: e.target.value })}>
                  <option value="">차량을 선택하세요</option>
                  {cars.map(c => <option key={c.id} value={c.id}>{c.number} ({c.model})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>금융사</Label>
                  <Input value={loan.finance_name} onChange={(e: any) => setLoan({ ...loan, finance_name: e.target.value })} placeholder="KB캐피탈" />
                </div>
                <div>
                  <Label>상품 구분</Label>
                  <select className="w-full border border-gray-200 p-3 rounded-xl font-bold text-sm bg-white focus:border-steel-500 outline-none" value={loan.type} onChange={e => setLoan({ ...loan, type: e.target.value })}>
                    <option>할부</option><option>리스</option><option>렌트</option><option>담보대출</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              <div>
                <Label>딜러 (전시장)</Label>
                <Input value={loan.dealer_name} onChange={(e: any) => setLoan({ ...loan, dealer_name: e.target.value })} placeholder="딜러명" />
              </div>
              <div>
                <Label>딜러 위치</Label>
                <Input value={loan.dealer_location} onChange={(e: any) => setLoan({ ...loan, dealer_location: e.target.value })} placeholder="위치" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>견적번호</Label>
                <Input value={loan.quote_number} onChange={(e: any) => setLoan({ ...loan, quote_number: e.target.value })} placeholder="견적번호" />
              </div>
              <div>
                <Label>견적일자</Label>
                <input type="date" className="w-full border border-gray-200 p-3 rounded-xl font-bold text-sm bg-white focus:border-steel-500 outline-none" value={loan.quote_date} onChange={e => setLoan({ ...loan, quote_date: e.target.value })} />
              </div>
              <div>
                <Label>유효일자</Label>
                <input type="date" className="w-full border border-gray-200 p-3 rounded-xl font-bold text-sm bg-white focus:border-steel-500 outline-none" value={loan.valid_date} onChange={e => setLoan({ ...loan, valid_date: e.target.value })} />
              </div>
            </div>
          </div>

          {/* ─── 차량 정보 ─── */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <SectionHeader color="bg-blue-600" title="차량 정보" />

            <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label>차량금액</Label>
                  <Input value={fmt(loan.vehicle_price)} onChange={(e: any) => handleMoneyChange('vehicle_price', e.target.value)} placeholder="0" right />
                </div>
                <div>
                  <Label>할인금액</Label>
                  <Input value={fmt(loan.discount_amount)} onChange={(e: any) => handleMoneyChange('discount_amount', e.target.value)} placeholder="0" right />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label accent="text-blue-600">판매금액 (자동)</Label>
                  <Input value={fmt(loan.sale_price)} readOnly right className="bg-blue-50 border-blue-200 text-blue-800" />
                </div>
                <div>
                  <Label>옵션금액</Label>
                  <Input value={fmt(loan.option_amount)} onChange={(e: any) => handleMoneyChange('option_amount', e.target.value)} placeholder="0" right />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>배기량</Label>
                  <Input value={loan.displacement} onChange={(e: any) => setLoan({ ...loan, displacement: e.target.value })} placeholder="cc" />
                </div>
                <div>
                  <Label>연료</Label>
                  <Input value={loan.fuel_type} onChange={(e: any) => setLoan({ ...loan, fuel_type: e.target.value })} placeholder="휘발유 / 디젤 / LPG" />
                </div>
              </div>
            </div>
          </div>

          {/* ─── 금융 조건 ─── */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <SectionHeader color="bg-emerald-600" title="금융 조건" />

            <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 mb-5">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label>선수금율 (%)</Label>
                  <Input value={fmt(loan.advance_rate)} onChange={(e: any) => handleMoneyChange('advance_rate', e.target.value)} placeholder="0" right />
                </div>
                <div>
                  <Label accent="text-steel-600">선수금액</Label>
                  <Input value={fmt(loan.deposit)} onChange={(e: any) => handleMoneyChange('deposit', e.target.value)} placeholder="0" right />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label>유예율 (%)</Label>
                  <Input value={fmt(loan.grace_rate)} onChange={(e: any) => handleMoneyChange('grace_rate', e.target.value)} placeholder="0" right />
                </div>
                <div>
                  <Label>유예금</Label>
                  <Input value={fmt(loan.grace_amount)} onChange={(e: any) => handleMoneyChange('grace_amount', e.target.value)} placeholder="0" right />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>적용금리 (%)</Label>
                  <input type="number" step="0.01" className="w-full border border-gray-200 p-3 rounded-xl font-bold text-sm text-right bg-white focus:border-steel-500 outline-none" placeholder="0.0" value={loan.interest_rate || ''} onChange={e => setLoan({ ...loan, interest_rate: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>대출 기간</Label>
                  <select className="w-full border border-gray-200 p-3 rounded-xl font-bold text-sm bg-white focus:border-steel-500 outline-none" value={loan.months} onChange={e => setLoan({ ...loan, months: Number(e.target.value) })}>
                    {[12, 24, 36, 48, 60, 72, 84].map(m => <option key={m} value={m}>{m}개월</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* 핵심 금액 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label accent="text-red-600">대출 신청 금액</Label>
                <div className="relative">
                  <Input value={fmt(loan.total_amount)} readOnly right className="bg-red-50/50 border-red-200 text-red-700 font-black" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-red-400 font-bold">원</span>
                </div>
              </div>
              <div>
                <Label accent="text-red-600">월 납입료</Label>
                <div className="relative">
                  <Input value={fmt(loan.monthly_payment)} onChange={(e: any) => handleMoneyChange('monthly_payment', e.target.value)} right className="border-red-200 text-red-700 font-black" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-red-400 font-bold">원</span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── 세금 및 부대비용 ─── */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <SectionHeader color="bg-amber-600" title="세금 및 부대비용" />

            <div className="bg-amber-50/50 p-5 rounded-xl border border-amber-100 mb-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label>통합취득세</Label>
                  <Input value={fmt(loan.acquisition_tax)} onChange={(e: any) => handleMoneyChange('acquisition_tax', e.target.value)} placeholder="0" right />
                </div>
                <div>
                  <Label>공채</Label>
                  <Input value={fmt(loan.bond_cost)} onChange={(e: any) => handleMoneyChange('bond_cost', e.target.value)} placeholder="0" right />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>부대비용</Label>
                  <Input value={fmt(loan.misc_fees)} onChange={(e: any) => handleMoneyChange('misc_fees', e.target.value)} placeholder="0" right />
                </div>
                <div>
                  <Label>인지대</Label>
                  <Input value={fmt(loan.stamp_duty)} onChange={(e: any) => handleMoneyChange('stamp_duty', e.target.value)} placeholder="0" right />
                </div>
              </div>
            </div>

            <div>
              <Label accent="text-red-600">고객 초기 납입금 (자동 합산)</Label>
              <div className="relative">
                <Input value={fmt(loan.customer_initial_payment)} readOnly right className="bg-red-50/50 border-red-200 text-red-700 font-black text-lg" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-red-400 font-bold">원</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">= 선수금 + 취득세 + 공채 + 부대비용 + 인지대</p>
            </div>
          </div>

          {/* ─── 연대보증인 ─── */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <SectionHeader color="bg-gray-600" title="연대보증인" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>보증인 성명</Label>
                <Input value={loan.guarantor_name} onChange={(e: any) => setLoan({ ...loan, guarantor_name: e.target.value })} placeholder="성명" />
              </div>
              <div>
                <Label>보증 한도액</Label>
                <Input value={fmt(loan.guarantor_limit)} onChange={(e: any) => handleMoneyChange('guarantor_limit', e.target.value)} placeholder="0" right />
              </div>
            </div>
          </div>
        </div>

        {/* 우측: 요약 사이드바 */}
        <div className="lg:col-span-5 space-y-6">

          {/* ─── 금융 요약 카드 ─── */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 sticky top-6">
            <SectionHeader color="bg-steel-600" title="금융 요약" />

            {/* 핵심 지표 */}
            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase">차량금액</span>
                <span className="text-sm font-bold text-gray-800">{fmt(loan.vehicle_price)}원</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase">할인</span>
                <span className="text-sm font-bold text-green-600">-{fmt(loan.discount_amount)}원</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase">판매가</span>
                <span className="text-sm font-bold text-gray-800">{fmt(loan.sale_price)}원</span>
              </div>

              <div className="h-px bg-gray-200 my-2"></div>

              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase">선수금</span>
                <span className="text-sm font-bold text-steel-700">{fmt(loan.deposit)}원</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase">대출금</span>
                <span className="text-sm font-black text-red-600">{fmt(loan.total_amount)}원</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase">금리</span>
                <span className="text-sm font-bold text-gray-800">{loan.interest_rate || 0}%</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase">기간</span>
                <span className="text-sm font-bold text-gray-800">{loan.months}개월</span>
              </div>

              <div className="h-px bg-gray-200 my-2"></div>

              <div className="flex justify-between items-center py-2">
                <span className="text-xs font-bold text-red-600 uppercase">월 납입료</span>
                <span className="text-lg font-black text-red-600">{fmt(loan.monthly_payment)}원</span>
              </div>
              <div className="flex justify-between items-center py-2 bg-amber-50 -mx-6 px-6 rounded-xl">
                <span className="text-xs font-bold text-amber-700 uppercase">초기 납입금</span>
                <span className="text-lg font-black text-amber-700">{fmt(loan.customer_initial_payment)}원</span>
              </div>
            </div>

            {/* 총 이자 */}
            {totalInterest > 0 && (
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-gray-400">총 상환예정액</span>
                  <span className="text-sm font-bold text-gray-700">{fmt(totalRepay)}원</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-gray-400">예상 총 이자</span>
                  <span className="text-sm font-bold text-orange-600">{fmt(totalInterest)}원</span>
                </div>
              </div>
            )}
          </div>

          {/* ─── 상환 일정 ─── */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <SectionHeader color="bg-teal-600" title="상환 일정" />

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>대출 실행일</Label>
                  <input type="date" max="9999-12-31" className="w-full border border-gray-200 p-3 rounded-xl font-bold text-sm bg-white focus:border-steel-500 outline-none" value={loan.start_date} onChange={e => setLoan({ ...loan, start_date: e.target.value })} />
                </div>
                <div>
                  <Label accent="text-teal-600">만기일 (자동)</Label>
                  <input type="date" className="w-full border border-dashed border-teal-200 p-3 rounded-xl font-bold text-sm bg-teal-50/50 cursor-default outline-none" readOnly value={loan.end_date} />
                </div>
              </div>

              <div>
                <Label>매월 납입일</Label>
                <div className="flex items-center gap-2">
                  <input type="text" className="w-20 border border-gray-200 p-3 rounded-xl font-bold text-sm text-center bg-white focus:border-steel-500 outline-none" placeholder="25" value={loan.payment_date || ''} onChange={e => handleMoneyChange('payment_date', e.target.value)} />
                  <span className="text-xs font-bold text-gray-400">일</span>
                </div>
              </div>

              <div className="bg-steel-50 p-4 rounded-xl border border-steel-100">
                <p className="text-xs font-bold text-steel-700 mb-3 uppercase">1회차 정보</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label accent="text-steel-600">1회차 납입일</Label>
                    <input type="date" className="w-full border border-steel-200 p-2.5 rounded-lg text-sm font-bold bg-white focus:border-steel-500 outline-none" value={loan.first_payment_date} onChange={e => setLoan({ ...loan, first_payment_date: e.target.value })} />
                  </div>
                  <div>
                    <Label accent="text-steel-600">1회차 금액</Label>
                    <Input value={fmt(loan.first_payment)} onChange={(e: any) => handleMoneyChange('first_payment', e.target.value)} placeholder="0" right />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─── 상환 현황 (기존 대출만) ─── */}
          {!isNew && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <SectionHeader color="bg-orange-600" title="상환 현황" sub="통장 연동" />

              {/* 프로그레스 바 */}
              <div className="mb-4">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-xs font-bold text-gray-400">상환 진행률</span>
                  <span className="text-2xl font-black text-steel-900">{progressRate.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="bg-gradient-to-r from-steel-500 to-steel-700 h-2.5 rounded-full transition-all duration-1000" style={{ width: `${progressRate}%` }}></div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-400">총 상환 예정액</span>
                  <span className="text-sm font-bold text-gray-700">{fmt(totalRepay)}원</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-400">실제 상환액 (통장)</span>
                  <span className="text-sm font-black text-steel-700">{fmt(realRepaidTotal)}원</span>
                </div>
                <div className="flex justify-between items-center py-3 bg-red-50 -mx-6 px-6 rounded-xl">
                  <span className="text-xs font-bold text-red-600">남은 상환액</span>
                  <span className="text-lg font-black text-red-600">{fmt(remainingAmount)}원</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 미리보기 모달 */}
      {previewFile && (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex flex-col justify-center items-center p-4" onClick={() => setPreviewFile(null)}>
          <button onClick={() => setPreviewFile(null)} className="absolute top-6 right-6 text-white text-4xl hover:text-gray-300 font-bold">&times;</button>
          <div className="w-full max-w-5xl h-[85vh] bg-white rounded-xl overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 bg-gray-100 border-b flex justify-between items-center">
              <span className="font-bold text-gray-700 truncate">{previewFile.name}</span>
              <a href={previewFile.url} download className="text-xs bg-steel-600 text-white px-3 py-1.5 rounded-lg hover:bg-steel-700 font-bold">다운로드</a>
            </div>
            <div className="flex-1 bg-gray-200 flex items-center justify-center overflow-auto p-4">
              {isImageFile(previewFile.type) ? (
                <img src={previewFile.url} className="max-w-full max-h-full object-contain shadow-lg" alt="미리보기" />
              ) : (
                <iframe src={previewFile.url} className="w-full h-full bg-white shadow-lg" title="PDF 미리보기" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
