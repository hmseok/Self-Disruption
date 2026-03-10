'use client'
import { supabase } from '../utils/supabase'
import { useApp } from '../context/AppContext'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function LoanListPage() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id
  const router = useRouter()
  const [loans, setLoans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // 드래그 & AI 업로드
  const [isDragging, setIsDragging] = useState(false)
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState({ current: 0, total: 0 })
  const [ocrLogs, setOcrLogs] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 차량 선택 모달 (OCR 결과 → 차량 매핑)
  const [carSelectModal, setCarSelectModal] = useState(false)
  const [allCars, setAllCars] = useState<any[]>([])
  const [carSearchTerm, setCarSearchTerm] = useState('')
  const [pendingOcrData, setPendingOcrData] = useState<any>(null)
  const [pendingAttachmentUrl, setPendingAttachmentUrl] = useState('')

  useEffect(() => { fetchData() }, [company, role, adminSelectedCompanyId])

  const fetchData = async () => {
    if (!company && role !== 'god_admin') return
    setLoading(true)
    let query = supabase.from('loans').select('*, cars(number, brand, model)')
    if (role === 'god_admin') {
      if (adminSelectedCompanyId) query = query.eq('company_id', adminSelectedCompanyId)
    } else if (company) {
      query = query.eq('company_id', company.id)
    }
    const { data } = await query.order('created_at', { ascending: false })
    setLoans(data || [])
    setLoading(false)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('정말 삭제하시겠습니까?')) return
    await supabase.from('loans').delete().eq('id', id)
    fetchData()
  }

  // 합계 계산
  const totalDebt = loans.reduce((acc, cur) => acc + (cur.total_amount || 0), 0)
  const monthlyOut = loans.reduce((acc, cur) => acc + (cur.monthly_payment || 0), 0)
  const typeStats: Record<string, number> = {
    all: loans.length,
    '할부': loans.filter(l => l.type === '할부').length,
    '리스': loans.filter(l => l.type === '리스').length,
    '렌트': loans.filter(l => l.type === '렌트').length,
    '담보대출': loans.filter(l => l.type === '담보대출').length,
  }
  const today = new Date()
  const ninetyDaysLater = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
  const expiringCount = loans.filter(l => {
    if (!l.end_date) return false
    const end = new Date(l.end_date)
    return end >= today && end <= ninetyDaysLater
  }).length
  const avgRate = loans.length > 0 ? (loans.reduce((a, l) => a + (l.interest_rate || 0), 0) / loans.length).toFixed(1) : '0'

  // 만기 임박 리스트
  const expiringLoans = loans.filter(l => {
    if (!l.end_date) return false
    const end = new Date(l.end_date)
    return end >= today && end <= ninetyDaysLater
  }).sort((a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime())

  const filteredLoans = loans.filter(loan => {
    if (typeFilter !== 'all' && loan.type !== typeFilter) return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      return (loan.cars?.number || '').toLowerCase().includes(term) || (loan.cars?.model || '').toLowerCase().includes(term) || (loan.finance_name || '').toLowerCase().includes(term)
    }
    return true
  })

  const f = (n: number) => (n || 0).toLocaleString()

  // ─── 드래그 앤 드롭 ───
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    if (e.dataTransfer.files?.length) processFile(e.dataTransfer.files[0])
  }
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0])
    e.target.value = ''
  }

  // 견적서 OCR 처리
  const processFile = async (file: File) => {
    setOcrProcessing(true)
    setOcrProgress({ current: 0, total: 1 })
    setOcrLogs([])

    try {
      setOcrLogs(prev => ['📤 파일 업로드 중...', ...prev])
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const fileName = `loan_quote_${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('contracts').upload(fileName, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName)

      setOcrLogs(prev => ['🤖 AI 견적서 분석 중...', ...prev])
      const base64 = await new Promise<string>((r) => {
        const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => r(reader.result as string)
      })
      const mimeType = file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg')
      const apiRes = await fetch('/api/ocr-loan-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64.split(',')[1] || base64, mimeType })
      })
      const ocrResult = await apiRes.json()
      if (ocrResult.error) throw new Error(ocrResult.error)

      setOcrLogs(prev => ['✅ 견적서 인식 완료! 차량을 선택해주세요.', ...prev])
      setOcrProgress({ current: 1, total: 1 })

      const { data: cars } = await supabase.from('cars').select('id, number, model, brand').order('number')
      setAllCars(cars || [])
      setPendingOcrData(ocrResult)
      setPendingAttachmentUrl(publicUrl)
      setCarSelectModal(true)

    } catch (err: any) {
      setOcrLogs(prev => [`❌ 처리 실패: ${err.message}`, ...prev])
    }
    setOcrProcessing(false)
  }

  // 차량 선택 후 대출 생성
  const createLoanWithCar = async (car: any) => {
    if (!pendingOcrData) return
    const d = pendingOcrData

    const payload: any = {
      company_id: effectiveCompanyId,
      car_id: car.id,
      finance_name: d.finance_company || '',
      type: d.loan_type || '할부',
      vehicle_price: d.vehicle_price || 0,
      discount_amount: d.discount_amount || 0,
      sale_price: d.sale_price || 0,
      option_amount: d.option_amount || 0,
      deposit: d.deposit || 0,
      total_amount: d.total_amount || 0,
      interest_rate: d.interest_rate || 0,
      months: d.finance_months || 60,
      monthly_payment: d.monthly_payment || 0,
      acquisition_tax: d.acquisition_tax || 0,
      bond_cost: d.bond_cost || 0,
      misc_fees: d.misc_fees || 0,
      stamp_duty: d.stamp_duty || 0,
      customer_initial_payment: d.customer_initial_payment || 0,
      advance_rate: d.advance_rate || 0,
      grace_rate: d.grace_rate || 0,
      grace_amount: d.grace_amount || 0,
      displacement: d.displacement || '',
      fuel_type: d.fuel_type || '',
      quote_number: d.quote_number || '',
      quote_date: d.quote_date || null,
      valid_date: d.valid_date || null,
      dealer_name: d.dealer_name || '',
      dealer_location: d.dealer_location || '',
      attachments: pendingAttachmentUrl ? [{ name: '할부견적서', url: pendingAttachmentUrl, type: pendingAttachmentUrl.split('.').pop() || 'file' }] : []
    }

    const { data, error } = await supabase.from('loans').insert(payload).select('id').single()
    if (error) { alert('등록 실패: ' + error.message); return }

    setCarSelectModal(false)
    setPendingOcrData(null)
    setPendingAttachmentUrl('')
    alert(`${car.number} 차량에 금융 정보가 등록되었습니다!`)
    router.push(`/loans/${data.id}`)
  }

  const filteredModalCars = allCars.filter(c =>
    c.number.includes(carSearchTerm) || (c.brand || '').includes(carSearchTerm) || (c.model || '').includes(carSearchTerm)
  )

  if (role === 'god_admin' && !adminSelectedCompanyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div className="bg-white rounded-2xl border border-gray-200 p-20 text-center">
          <span className="text-4xl block mb-3">🏢</span>
          <p className="font-bold text-gray-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen animate-fade-in">
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" className="hidden" onChange={handleFileSelect} />

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-400 font-bold">총 대출 잔액</p>
          <p className="text-xl font-black text-gray-900 mt-1">{f(totalDebt)}<span className="text-xs text-gray-400 font-bold ml-0.5">원</span></p>
        </div>
        <div className="bg-red-50 rounded-2xl border border-red-100 p-4">
          <p className="text-xs text-red-500 font-bold">월 고정 지출</p>
          <p className="text-xl font-black text-red-600 mt-1">{f(monthlyOut)}<span className="text-xs font-bold ml-0.5">원</span></p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-400 font-bold">계약 건수</p>
          <p className="text-xl font-black text-gray-900 mt-1">{loans.length}<span className="text-xs text-gray-400 font-bold ml-0.5">건</span></p>
        </div>
        <div className={`rounded-2xl border p-4 ${expiringCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200 shadow-sm'}`}>
          <p className={`text-xs font-bold ${expiringCount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>만기 임박 (90일)</p>
          <p className={`text-xl font-black mt-1 ${expiringCount > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{expiringCount}<span className="text-xs font-bold ml-0.5">건</span></p>
        </div>
        <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
          <p className="text-xs text-blue-500 font-bold">평균 이자율</p>
          <p className="text-xl font-black text-blue-600 mt-1">{avgRate}<span className="text-xs font-bold ml-0.5">%</span></p>
        </div>
      </div>

      {/* 액션 버튼 + 드래그 영역 */}
      <div className="flex gap-3 mb-6">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !ocrProcessing && fileInputRef.current?.click()}
          className={`flex-1 border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-steel-500 bg-steel-50 scale-[1.01]'
              : ocrProcessing
                ? 'border-gray-200 bg-gray-50 cursor-wait'
                : 'border-gray-200 bg-white hover:border-steel-400 hover:bg-steel-50/30'
          }`}
        >
          {ocrProcessing ? (
            <div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-gray-300 border-t-steel-600 rounded-full"></span>
                <span className="text-sm font-bold text-gray-700">AI 견적서 분석 중...</span>
              </div>
              <div className="w-full max-w-xs mx-auto bg-gray-200 rounded-full h-1.5">
                <div className="bg-steel-500 h-1.5 rounded-full transition-all" style={{ width: `${ocrProgress.total > 0 ? (ocrProgress.current / ocrProgress.total) * 100 : 10}%` }}></div>
              </div>
              <div className="mt-2 text-xs text-gray-400 space-y-0.5">
                {ocrLogs.slice(0, 2).map((log, i) => <div key={i}>{log}</div>)}
              </div>
            </div>
          ) : (
            <>
              <div className="text-2xl mb-1">{isDragging ? '📥' : '📄'}</div>
              <p className="text-sm font-bold text-gray-700">{isDragging ? '여기에 파일을 놓으세요' : '할부 견적서 드래그 또는 클릭'}</p>
              <p className="text-xs text-gray-400 mt-0.5">이미지/PDF · AI 자동 인식</p>
            </>
          )}
        </div>
        <button
          onClick={() => router.push('/loans/new')}
          className="px-6 py-5 bg-steel-600 text-white rounded-2xl font-bold text-sm hover:bg-steel-700 transition-colors shadow-sm flex flex-col items-center justify-center gap-1"
        >
          <span className="text-lg">+</span>
          <span>직접 등록</span>
        </button>
      </div>

      {/* 만기 임박 경고 배너 */}
      {expiringLoans.length > 0 && !ocrProcessing && (
        <div className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚠️</span>
            <h3 className="font-bold text-amber-800 text-sm">만기 임박 {expiringLoans.length}건 — 90일 이내</h3>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {expiringLoans.slice(0, 8).map(loan => {
              const daysLeft = Math.ceil((new Date(loan.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              return (
                <div
                  key={loan.id}
                  onClick={() => router.push(`/loans/${loan.id}`)}
                  className="bg-white border border-amber-200 rounded-xl px-3 py-2 flex-shrink-0 cursor-pointer hover:shadow-md transition-all hover:border-amber-400"
                >
                  <div className="font-bold text-gray-800 text-sm">{loan.cars?.number || '-'}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">{loan.finance_name}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${daysLeft <= 30 ? 'bg-red-100 text-red-600' : daysLeft <= 60 ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-700'}`}>
                      D-{daysLeft}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 타입 필터 + 검색 */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['all', '할부', '리스', '렌트', '담보대출'].map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                typeFilter === type
                  ? 'bg-steel-600 text-white shadow'
                  : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {type === 'all' ? '전체' : type} ({typeStats[type] || 0})
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="차량번호, 금융사 검색..."
          className="px-4 py-2 border border-gray-200 rounded-xl text-sm flex-1 focus:outline-none focus:border-steel-500 bg-white shadow-sm"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* 리스트 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-3 border-gray-300 border-t-steel-600 rounded-full mx-auto mb-3"></div>
              <p className="text-gray-400 text-sm font-medium">데이터 로딩 중...</p>
            </div>
          </div>
        ) : filteredLoans.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3">🏦</div>
            <p className="font-bold text-gray-500">{loans.length === 0 ? '등록된 금융 정보가 없습니다' : '해당 조건의 금융 정보가 없습니다'}</p>
            <p className="text-xs text-gray-400 mt-1">견적서를 업로드하거나 직접 등록해주세요</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block" style={{ overflowX: 'auto' }}>
              <table className="w-full text-left min-w-[700px]">
                <thead className="bg-gray-50 border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wider font-bold">
                  <tr>
                    <th className="p-4 pl-6">대상 차량</th>
                    <th className="p-4">금융사/구분</th>
                    <th className="p-4 text-right">대출 원금</th>
                    <th className="p-4 text-right">월 납입금</th>
                    <th className="p-4">기간/만기</th>
                    <th className="p-4 text-center w-16">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredLoans.map((loan) => {
                    const daysLeft = loan.end_date ? Math.ceil((new Date(loan.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null
                    return (
                      <tr key={loan.id} onClick={() => router.push(`/loans/${loan.id}`)} className="hover:bg-steel-50/30 transition-colors cursor-pointer">
                        <td className="p-4 pl-6">
                          <div className="font-bold text-gray-900">{loan.cars?.number || '차량 정보 없음'}</div>
                          <div className="text-xs text-gray-400">{loan.cars?.brand} {loan.cars?.model}</div>
                        </td>
                        <td className="p-4">
                          <span className="font-bold text-gray-800">{loan.finance_name}</span>
                          <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">{loan.type}</span>
                        </td>
                        <td className="p-4 font-medium text-right text-gray-600">{f(loan.total_amount)}원</td>
                        <td className="p-4 font-bold text-red-500 text-right">{f(loan.monthly_payment)}원</td>
                        <td className="p-4 text-sm">
                          <div className="font-bold text-gray-700">{loan.months}개월</div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-400">{loan.end_date || '-'}</span>
                            {daysLeft !== null && daysLeft >= 0 && daysLeft <= 90 && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${daysLeft <= 30 ? 'bg-red-100 text-red-600' : daysLeft <= 60 ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-700'}`}>
                                D-{daysLeft}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <button onClick={(e) => handleDelete(e, loan.id)} className="text-gray-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-all">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-gray-50">
              {filteredLoans.map((loan) => {
                const daysLeft = loan.end_date ? Math.ceil((new Date(loan.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null
                return (
                  <div key={loan.id} onClick={() => router.push(`/loans/${loan.id}`)}
                    className="px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500 font-bold">{loan.type}</span>
                        {daysLeft !== null && daysLeft >= 0 && daysLeft <= 90 && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${daysLeft <= 30 ? 'bg-red-100 text-red-600' : daysLeft <= 60 ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-700'}`}>
                            D-{daysLeft}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">{loan.end_date || '-'}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-gray-900 text-[15px] mb-0.5">{loan.cars?.number || '차량 정보 없음'}</div>
                        <div className="text-xs text-gray-500">{loan.finance_name} · {loan.months}개월</div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <span className="font-black text-red-600 text-[15px]">{f(loan.monthly_payment)}원</span>
                        <div className="text-[10px] text-gray-400">/월</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* 차량 선택 모달 (OCR 후) */}
      {carSelectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setCarSelectModal(false); setPendingOcrData(null) }}>
          <div className="bg-white rounded-2xl w-full max-w-lg h-[600px] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b bg-steel-50 shrink-0">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-black text-gray-900">견적서 인식 완료</h2>
                  <p className="text-xs text-gray-500 mt-0.5">대출을 등록할 차량을 선택하세요</p>
                </div>
                <button onClick={() => { setCarSelectModal(false); setPendingOcrData(null) }} className="text-2xl font-light text-gray-400 hover:text-black">&times;</button>
              </div>
              {pendingOcrData && (
                <div className="mt-3 bg-white rounded-xl p-3 border border-gray-200 grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-gray-400">차량가</span><br /><span className="font-black text-gray-800">{f(pendingOcrData.vehicle_price)}원</span></div>
                  <div><span className="text-gray-400">대출금</span><br /><span className="font-black text-red-600">{f(pendingOcrData.total_amount)}원</span></div>
                  <div><span className="text-gray-400">월납입</span><br /><span className="font-black text-red-600">{f(pendingOcrData.monthly_payment)}원</span></div>
                </div>
              )}
            </div>
            <div className="p-4 bg-white shrink-0">
              <input
                autoFocus
                className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 font-bold focus:bg-white focus:border-steel-500 outline-none transition-colors"
                placeholder="차량번호 검색"
                value={carSearchTerm}
                onChange={e => setCarSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50/50">
              {filteredModalCars.map(car => (
                <div
                  key={car.id}
                  onClick={() => createLoanWithCar(car)}
                  className="p-4 bg-white border border-gray-100 rounded-xl hover:border-steel-500 hover:shadow-md cursor-pointer flex justify-between items-center group transition-all"
                >
                  <div>
                    <div className="font-bold text-lg text-gray-800 group-hover:text-steel-700">{car.number}</div>
                    <div className="text-xs text-gray-400 font-medium">{car.brand} {car.model}</div>
                  </div>
                  <div className="text-gray-300 font-bold text-xl group-hover:text-steel-600 transition-colors">→</div>
                </div>
              ))}
              {filteredModalCars.length === 0 && (
                <div className="p-8 text-center text-gray-400 text-sm">검색 결과 없음</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
