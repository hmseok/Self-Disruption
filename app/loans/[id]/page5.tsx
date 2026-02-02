'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
// 👇 [경로 체크]
import { supabase } from '../../utils/supabase'

export default function LoanDetailPage() {
  const router = useRouter()
  const params = useParams()
  const isNew = params.id === 'new'
  const loanId = isNew ? null : params.id

  const [loading, setLoading] = useState(!isNew)
  const [uploading, setUploading] = useState(false) // 업로드 중 상태
  const [cars, setCars] = useState<any[]>([])

  // 폼 데이터 상태
  const [loan, setLoan] = useState({
    car_id: '', finance_name: '', type: '할부',
    vehicle_price: 0, acquisition_tax: 0, deposit: 0,
    total_amount: 0, interest_rate: 0, months: 60,
    monthly_payment: 0,
    first_payment: 0, first_payment_date: '',
    payment_date: 0,
    start_date: '', end_date: '',
    guarantor_name: '', guarantor_limit: 0,
    contract_url: '' // 📂 첨부파일 주소
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
      setLoan(prev => ({ ...prev, end_date: firstDate.toISOString().split('T')[0] }))
    } else if (loan.start_date && loan.months > 0) {
      const start = new Date(loan.start_date)
      start.setMonth(start.getMonth() + loan.months)
      setLoan(prev => ({ ...prev, end_date: start.toISOString().split('T')[0] }))
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
        contract_url: data.contract_url || '' // 파일 주소 로드
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
    setLoan(prev => {
      const updated = { ...prev, [field]: numValue }
      if (field === 'vehicle_price' || field === 'deposit') {
        updated.total_amount = updated.vehicle_price - updated.deposit
      }
      return updated
    })
  }

  // 📂 파일 업로드 로직
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploading(true)
      try {
          const fileExt = file.name.split('.').pop()
          const fileName = `loan_${loanId}_${Date.now()}.${fileExt}`

          // contracts 버킷 사용 (기존 버킷 활용)
          const { error: uploadError } = await supabase.storage.from('contracts').upload(fileName, file)
          if (uploadError) throw uploadError

          const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName)

          // DB 업데이트
          await supabase.from('loans').update({ contract_url: publicUrl }).eq('id', loanId)

          setLoan(prev => ({ ...prev, contract_url: publicUrl }))
          alert('✅ 파일이 등록되었습니다.')
      } catch (err: any) {
          alert('업로드 실패: ' + err.message)
      } finally {
          setUploading(false)
      }
  }

  // 파일 삭제 로직
  const handleFileDelete = async () => {
      if(!confirm('등록된 파일을 삭제하시겠습니까?')) return
      await supabase.from('loans').update({ contract_url: null }).eq('id', loanId)
      setLoan(prev => ({ ...prev, contract_url: '' }))
  }

  if (loading) return <div className="p-20 text-center font-bold text-gray-500">데이터 불러오는 중... ⏳</div>

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 animate-fade-in-up pb-40">
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

      {/* 5. 📂 첨부 파일 관리 (신규 추가) */}
      {!isNew && (
          <div className="mt-12 pt-10 border-t-2 border-dashed border-gray-300">
              <h3 className="font-black text-2xl text-gray-900 mb-6">📂 첨부 파일 및 계약서 관리</h3>
              <div className="bg-gray-100 p-8 rounded-3xl shadow-inner border border-gray-200 text-center">

                  {loan.contract_url ? (
                      <div className="flex flex-col items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-200 max-w-lg mx-auto">
                          <div className="text-5xl">📄</div>
                          <div className="text-center">
                              <p className="font-bold text-gray-900">등록된 계약서/약정서</p>
                              <p className="text-xs text-gray-500 mt-1">파일이 안전하게 보관되어 있습니다.</p>
                          </div>
                          <div className="flex gap-2 w-full">
                              <a href={loan.contract_url} target="_blank" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700">⬇️ 다운로드</a>
                              <button onClick={handleFileDelete} className="flex-1 border border-red-200 text-red-500 py-3 rounded-xl font-bold hover:bg-red-50">삭제</button>
                          </div>
                      </div>
                  ) : (
                      <div className="border-2 border-dashed border-gray-300 rounded-xl p-10 bg-white hover:bg-gray-50 transition-colors">
                          <p className="text-gray-400 font-bold mb-4">{uploading ? '업로드 중...' : '등록된 파일이 없습니다.'}</p>
                          <label className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold cursor-pointer hover:bg-black shadow-lg">
                              📂 계약서/약정서 업로드
                              <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                          </label>
                      </div>
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
    </div>
  )
}