'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
// 👇 [경로 체크] app/loans/[id] 위치이므로 3단계 상위(../..)가 맞습니다.
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function LoanDetailPage() {
  const router = useRouter()
  const params = useParams()
  const isNew = params.id === 'new'
  const loanId = isNew ? null : params.id

  const [loading, setLoading] = useState(!isNew)
  const [uploading, setUploading] = useState(false)
  const [cars, setCars] = useState<any[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // 👁️ 미리보기 상태 (선택된 파일 정보 저장)
  const [previewFile, setPreviewFile] = useState<any>(null)

  // 폼 데이터 상태
  const [loan, setLoan] = useState<any>({
    car_id: '', finance_name: '', type: '할부',
    vehicle_price: 0, acquisition_tax: 0, deposit: 0,
    total_amount: 0, interest_rate: 0, months: 60,
    monthly_payment: 0,
    first_payment: 0, first_payment_date: '',
    payment_date: 0,
    start_date: '', end_date: '',
    guarantor_name: '', guarantor_limit: 0,
    attachments: [] // 📂 복수 파일 배열 [{ name, url, type }]
  })

  // 🧮 [자동 계산]
  const actualFirstPayment = loan.first_payment > 0 ? loan.first_payment : loan.monthly_payment
  const remainingMonths = loan.months > 0 ? loan.months - 1 : 0
  const totalRepay = actualFirstPayment + (loan.monthly_payment * remainingMonths)
  const totalInterest = totalRepay > loan.total_amount ? totalRepay - loan.total_amount : 0

  useEffect(() => {
    fetchCars()
    if (!isNew && loanId) fetchLoanDetail()
  }, [])

  // 🗓️ [스마트 만기일 계산]
  useEffect(() => {
    if (loan.first_payment_date && loan.months > 0) {
      const firstDate = new Date(loan.first_payment_date)
      firstDate.setMonth(firstDate.getMonth() + (loan.months - 1))
      const targetDay = loan.payment_date > 0 ? loan.payment_date : firstDate.getDate()
      firstDate.setDate(targetDay)
      setLoan((prev:any) => ({ ...prev, end_date: firstDate.toISOString().split('T')[0] }))
    } else if (loan.start_date && loan.months > 0) {
      const start = new Date(loan.start_date)
      start.setMonth(start.getMonth() + loan.months)
      setLoan((prev:any) => ({ ...prev, end_date: start.toISOString().split('T')[0] }))
    }
  }, [loan.first_payment_date, loan.start_date, loan.months, loan.payment_date])

  const fetchCars = async () => {
    const { data } = await supabase.from('cars').select('id, number, model').order('number', { ascending: true })
    setCars(data || [])
  }

  const fetchLoanDetail = async () => {
    const { data, error } = await supabase.from('loans').select('*').eq('id', loanId).single()
    if (error) { alert('데이터 로드 실패'); router.push('/loans'); }
    else {
      setLoan({
        ...data,
        vehicle_price: data.vehicle_price || 0,
        acquisition_tax: data.acquisition_tax || 0,
        deposit: data.deposit || 0,
        total_amount: data.total_amount || 0,
        interest_rate: data.interest_rate || 0,
        monthly_payment: data.monthly_payment || 0,
        first_payment: data.first_payment || 0,
        first_payment_date: data.first_payment_date || '',
        payment_date: data.payment_date || 0,
        guarantor_limit: data.guarantor_limit || 0,
        attachments: data.attachments || []
      })
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!loan.car_id || !loan.finance_name) return alert('필수 입력 항목을 확인하세요.')

    const payload = {
      ...loan,
      start_date: loan.start_date || null,
      end_date: loan.end_date || null,
      first_payment_date: loan.first_payment_date || null
    }

    const query = isNew
        ? supabase.from('loans').insert(payload)
        : supabase.from('loans').update(payload).eq('id', loanId)

    const { error } = await query
    if (error) alert('저장 실패: ' + error.message)
    else { alert('저장되었습니다!'); router.push('/loans'); }
  }

  const handleDelete = async () => {
    if(!confirm('정말 삭제하시겠습니까?')) return
    await supabase.from('loans').delete().eq('id', loanId)
    router.push('/loans')
  }

  const handleMoneyChange = (field: string, value: string) => {
    const rawValue = value.replace(/,/g, '')
    const numValue = Number(rawValue)
    if (isNaN(numValue)) return
    setLoan((prev:any) => {
      const updated = { ...prev, [field]: numValue }
      if (field === 'vehicle_price' || field === 'deposit') {
        updated.total_amount = updated.vehicle_price - updated.deposit
      }
      return updated
    })
  }

  // 📂 파일 업로드 로직 (복수 지원)
  const uploadFiles = async (files: FileList | File[]) => {
      setUploading(true)
      const newAttachments = [...loan.attachments]

      try {
          for (let i = 0; i < files.length; i++) {
              const file = files[i]
              const fileExt = file.name.split('.').pop()
              const fileName = `loan_${loanId}_${Date.now()}_${i}.${fileExt}`

              const { error: uploadError } = await supabase.storage.from('contracts').upload(fileName, file)
              if (uploadError) throw uploadError

              const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName)

              newAttachments.push({
                  name: file.name,
                  url: publicUrl,
                  type: fileExt?.toLowerCase() || 'file'
              })
          }

          await supabase.from('loans').update({ attachments: newAttachments }).eq('id', loanId)
          setLoan((prev:any) => ({ ...prev, attachments: newAttachments }))
          alert(`✅ ${files.length}개 파일이 업로드되었습니다.`)

      } catch (err: any) {
          alert('업로드 실패: ' + err.message)
      } finally {
          setUploading(false)
      }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) uploadFiles(e.target.files)
  }

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          uploadFiles(e.dataTransfer.files)
      }
  }

  const deleteAttachment = async (index: number) => {
      if(!confirm('해당 파일을 삭제하시겠습니까?')) return
      const newAttachments = loan.attachments.filter((_:any, i:number) => i !== index)
      await supabase.from('loans').update({ attachments: newAttachments }).eq('id', loanId)
      setLoan((prev:any) => ({ ...prev, attachments: newAttachments }))
  }

  const isImageFile = (type: string) => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(type)

  if (loading) return <div className="p-20 text-center font-bold text-gray-500">데이터 불러오는 중... ⏳</div>

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 animate-fade-in-up pb-40">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-8 border-b pb-6">
        <div>
          <button onClick={() => router.back()} className="text-gray-500 font-bold mb-2 hover:text-black">← 목록으로 돌아가기</button>
          <h1 className="text-3xl font-black text-gray-900">{isNew ? '📄 신규 금융 등록' : '✏️ 금융 계약 상세'}</h1>
        </div>
        {!isNew && <button onClick={handleDelete} className="bg-white border border-red-200 text-red-500 px-4 py-2 rounded-xl font-bold hover:bg-red-50">🗑️ 삭제</button>}
      </div>

      <div className="space-y-8 bg-white p-8 rounded-3xl shadow-sm border border-gray-200">

          {/* 1. 기본 정보 */}
          <div className="space-y-4">
              <h3 className="font-bold text-lg text-gray-900">1. 기본 계약 정보</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">대상 차량</label>
                    <select className="w-full border p-3 rounded-xl font-bold bg-gray-50" value={loan.car_id} onChange={e => setLoan({...loan, car_id: e.target.value})}>
                      <option value="">차량을 선택하세요</option>
                      {cars.map(c => <option key={c.id} value={c.id}>{c.number} ({c.model})</option>)}
                    </select>
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">금융사</label>
                        <input className="w-full border p-3 rounded-xl" placeholder="예: KB캐피탈" value={loan.finance_name} onChange={e => setLoan({...loan, finance_name: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">상품 구분</label>
                        <select className="w-full border p-3 rounded-xl" value={loan.type} onChange={e => setLoan({...loan, type: e.target.value})}>
                            <option>할부</option><option>리스</option><option>렌트</option><option>담보대출</option>
                        </select>
                    </div>
                 </div>
              </div>
          </div>

          <hr className="border-gray-100" />

          {/* 2. 금액 정보 */}
          <div className="space-y-4">
              <h3 className="font-bold text-lg text-gray-900">2. 견적 금액 상세</h3>
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">차량 가격</label>
                    <input type="text" className="w-full border p-2 rounded-lg text-right font-bold text-lg bg-white" placeholder="0" value={loan.vehicle_price.toLocaleString()} onChange={e => handleMoneyChange('vehicle_price', e.target.value)} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">취등록세/부대비용</label>
                    <input type="text" className="w-full border p-2 rounded-lg text-right font-bold text-lg bg-white" placeholder="0" value={loan.acquisition_tax.toLocaleString()} onChange={e => handleMoneyChange('acquisition_tax', e.target.value)} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-blue-600 mb-1">(-) 선수금/보증금</label>
                    <input type="text" className="w-full border p-2 rounded-lg border-blue-200 text-right text-blue-600 font-bold text-lg bg-white" placeholder="0" value={loan.deposit.toLocaleString()} onChange={e => handleMoneyChange('deposit', e.target.value)} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-red-600 mb-1">(=) 대출 원금</label>
                    <input type="text" className="w-full border p-2 rounded-lg border-red-200 font-black bg-white text-right text-red-600 text-lg" readOnly value={loan.total_amount.toLocaleString()} />
                </div>
              </div>
          </div>

          <hr className="border-gray-100" />

          {/* 3. 상환 조건 */}
          <div className="space-y-4">
             <div className="flex justify-between items-end">
                <h3 className="font-bold text-lg text-gray-900">3. 상환 일정 및 조건</h3>
                <div className="text-right text-xs bg-gray-100 px-3 py-2 rounded-lg">
                    <span className="text-gray-500 mr-2">총 이자: <b className="text-red-600">{totalInterest.toLocaleString()}원</b></span>
                    <span className="text-gray-300 mx-2">|</span>
                    <span className="text-gray-500 mr-2">총 상환액: <b className="text-gray-800">{totalRepay.toLocaleString()}원</b></span>
                </div>
             </div>
             <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-gray-500 mb-1">대출 실행일</label><input type="date" max="9999-12-31" className="w-full border p-3 rounded-xl text-sm" value={loan.start_date} onChange={e => setLoan({...loan, start_date: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">만기일 (자동)</label><input type="date" className="w-full border p-3 rounded-xl text-sm bg-gray-50" readOnly value={loan.end_date} /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">매월 납입일</label><input type="text" className="w-full border p-3 rounded-xl text-right" placeholder="25" value={loan.payment_date || ''} onChange={e => handleMoneyChange('payment_date', e.target.value)} /></div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">금리 (%)</label><input type="number" className="w-full border p-3 rounded-xl text-right" placeholder="0.0" value={loan.interest_rate || ''} onChange={e => setLoan({...loan, interest_rate: Number(e.target.value)})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">계약 기간</label><select className="w-full border p-3 rounded-xl" value={loan.months} onChange={e => setLoan({...loan, months: Number(e.target.value)})}>{[12,24,36,48,60].map(m=><option key={m} value={m}>{m}개월</option>)}</select></div>
                </div>
                <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-bold text-indigo-800 mb-1">1회차 납입일</label><input type="date" className="w-full border border-indigo-200 p-2 rounded-lg text-sm bg-white" value={loan.first_payment_date} onChange={e => setLoan({...loan, first_payment_date: e.target.value})} /></div>
                    <div><label className="block text-xs font-bold text-indigo-800 mb-1">1회차 금액</label><input type="text" className="w-full border border-indigo-200 p-2 rounded-lg text-right bg-white font-bold" value={loan.first_payment.toLocaleString()} onChange={e => handleMoneyChange('first_payment', e.target.value)} /></div>
                    <div className="col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">월 납입금 (고정)</label><input type="text" className="w-full border p-2 rounded-lg font-bold text-red-500 text-right bg-white" value={loan.monthly_payment.toLocaleString()} onChange={e => handleMoneyChange('monthly_payment', e.target.value)} /></div>
                </div>
             </div>
          </div>

          <hr className="border-gray-100" />

          {/* 4. 보증인 정보 */}
          <div className="space-y-4">
              <h3 className="font-bold text-lg text-gray-900">4. 연대보증인 정보</h3>
              <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-gray-500 mb-1">보증인 성명</label><input className="w-full border p-3 rounded-xl bg-white" placeholder="성명 입력" value={loan.guarantor_name} onChange={e => setLoan({...loan, guarantor_name: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">보증 한도액</label><input type="text" className="w-full border p-3 rounded-xl text-right bg-white" placeholder="금액 입력" value={loan.guarantor_limit.toLocaleString()} onChange={e => handleMoneyChange('guarantor_limit', e.target.value)} /></div>
              </div>
          </div>

      </div>

      {/* 5. 📂 첨부 파일 (복수 파일 & 갤러리 UI) */}
      {!isNew && (
          <div className="mt-12 pt-10 border-t-2 border-dashed border-gray-300">
              <h3 className="font-black text-2xl text-gray-900 mb-6">📂 첨부 파일 및 증빙 서류</h3>
              <div className="bg-gray-100 p-8 rounded-3xl shadow-inner border border-gray-200">

                  <div
                      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                      className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 mb-8 ${
                          isDragging ? 'border-indigo-500 bg-indigo-50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-gray-400'
                      }`}
                  >
                      <div className="pointer-events-none">
                          <p className="text-3xl mb-2">{isDragging ? '📂' : '☁️'}</p>
                          <p className={`font-bold ${isDragging ? 'text-indigo-600' : 'text-gray-500'}`}>
                              {isDragging ? '여기에 놓으세요!' : '클릭 또는 파일을 드래그하여 업로드'}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">여러 개 동시 업로드 가능 (PDF, 이미지)</p>
                      </div>
                      <input type="file" multiple className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} disabled={uploading} />
                      {uploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-2xl"><span className="font-bold text-indigo-600 animate-pulse">업로드 중... 🚀</span></div>}
                  </div>

                  {loan.attachments && loan.attachments.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {loan.attachments.map((file: any, index: number) => (
                              <div key={index} className="group relative bg-white p-3 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all">
                                  {/* 썸네일 (클릭 시 미리보기) */}
                                  <div
                                    className="h-32 w-full bg-gray-50 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative cursor-pointer"
                                    onClick={() => setPreviewFile(file)}
                                  >
                                      {isImageFile(file.type) ? (
                                          <img src={file.url} alt={file.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                      ) : (
                                          <div className="text-center">
                                              <div className="text-4xl mb-1">📄</div>
                                              <span className="text-xs font-bold text-gray-400 uppercase">{file.type}</span>
                                          </div>
                                      )}
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                          <span className="text-white font-bold text-sm bg-black/50 px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                              🔍 보기
                                          </span>
                                      </div>
                                  </div>

                                  <div className="flex justify-between items-center">
                                      <div className="overflow-hidden">
                                          <p className="text-xs font-bold text-gray-800 truncate w-24" title={file.name}>{file.name}</p>
                                          <p className="text-[10px] text-gray-400">{file.type.toUpperCase()}</p>
                                      </div>
                                      <button onClick={() => deleteAttachment(index)} className="text-gray-300 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                      </button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  ) : (
                      <p className="text-center text-gray-400 text-sm">등록된 파일이 없습니다.</p>
                  )}

              </div>
          </div>
      )}

      {/* 하단 저장 버튼 */}
      <div className="mt-8 flex gap-4">
         <button onClick={handleSave} className="flex-1 bg-indigo-900 text-white py-4 rounded-2xl font-black text-xl hover:bg-black transition-all shadow-xl">
            {isNew ? '✨ 금융 정보 등록 완료' : '💾 수정 내용 저장'}
         </button>
      </div>

      {/* 👁️ 미리보기 모달 (팝업) */}
      {previewFile && (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex flex-col justify-center items-center p-4 animate-fade-in" onClick={() => setPreviewFile(null)}>
            <button onClick={() => setPreviewFile(null)} className="absolute top-6 right-6 text-white text-4xl hover:text-gray-300 font-bold">&times;</button>

            <div className="w-full max-w-5xl h-[85vh] bg-white rounded-xl overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="p-4 bg-gray-100 border-b flex justify-between items-center">
                    <span className="font-bold text-gray-700 truncate">{previewFile.name}</span>
                    <a href={previewFile.url} download className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 font-bold">
                        다운로드
                    </a>
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