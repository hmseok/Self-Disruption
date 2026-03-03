'use client'
import { supabase } from '../utils/supabase'
import { useApp } from '../context/AppContext'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import DarkHeader from '../components/DarkHeader'

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
        <div className="p-12 md:p-20 text-center text-gray-400 text-sm bg-white rounded-2xl">
          <span className="text-4xl block mb-3">🏢</span>
          <p className="font-bold text-gray-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">
      {/* 헤더 */}
      <DarkHeader
        icon="🏦"
        title="대출/금융사 관리"
        subtitle="대출 현황 및 금융사 계약 관리"
        stats={[
          {
            label: '총 대출 잔액',
            value: f(totalDebt),
            color: '#334155',
            bgColor: '#fff',
            borderColor: '#e2e8f0',
            labelColor: '#94a3b8'
          },
          {
            label: '월 고정 지출',
            value: f(monthlyOut),
            color: '#dc2626',
            bgColor: '#fef2f2',
            borderColor: '#fecaca',
            labelColor: '#fca5a5'
          },
          {
            label: '계약 건수',
            value: loans.length.toString(),
            color: '#334155',
            bgColor: '#fff',
            borderColor: '#e2e8f0',
            labelColor: '#94a3b8'
          },
          {
            label: '만기 임박 (90일)',
            value: expiringCount.toString(),
            color: expiringCount > 0 ? '#d97706' : '#94a3b8',
            bgColor: expiringCount > 0 ? '#fffbeb' : '#fff',
            borderColor: expiringCount > 0 ? '#fde68a' : '#e2e8f0',
            labelColor: expiringCount > 0 ? '#fcd34d' : '#94a3b8'
          },
          {
            label: '평균 이자율',
            value: avgRate + '%',
            color: '#2563eb',
            bgColor: '#eff6ff',
            borderColor: '#bfdbfe',
            labelColor: '#93c5fd'
          }
        ]}
        actions={[
          {
            label: ocrProcessing ? '분석 중...' : '견적서 업로드',
            icon: '📄',
            onClick: () => fileInputRef.current?.click(),
            variant: 'primary',
            disabled: ocrProcessing
          },
          {
            label: '직접 등록',
            icon: '➕',
            onClick: () => router.push('/loans/new'),
            variant: 'secondary'
          }
        ]}
      />

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" className="hidden" onChange={handleFileSelect} />

      {/* AI 처리 상태 */}
      {ocrProcessing && (
        <div className="mb-6 bg-gray-900 rounded-2xl p-6 shadow-2xl ring-4 ring-steel-500/10 overflow-hidden">
          <div className="flex justify-between items-end mb-4 text-white">
            <div className="flex items-center gap-3">
              <span className="animate-spin inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full"></span>
              <span className="font-bold">AI 견적서 분석 중...</span>
            </div>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mb-4">
            <div className="bg-gradient-to-r from-steel-500 to-steel-400 h-2 rounded-full transition-all" style={{ width: `${ocrProgress.total > 0 ? (ocrProgress.current / ocrProgress.total) * 100 : 0}%` }}></div>
          </div>
          <div className="font-mono text-xs text-gray-300 space-y-1">
            {ocrLogs.map((log, i) => <div key={i}>{log}</div>)}
          </div>
        </div>
      )}

      {/* 드래그 앤 드롭 영역 */}
      {!ocrProcessing && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-6 border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-steel-500 bg-steel-50 scale-[1.01]'
              : 'border-gray-300 bg-white hover:border-steel-400 hover:bg-steel-50/30'
          }`}
        >
          <div className="text-3xl mb-2">{isDragging ? '📥' : '📄'}</div>
          <p className="text-sm font-bold text-gray-700">
            {isDragging ? '여기에 파일을 놓으세요' : '할부 견적서를 드래그하여 업로드'}
          </p>
          <p className="text-xs text-gray-400 mt-1">이미지 또는 PDF 파일 지원 · 클릭하여 파일 선택</p>
        </div>
      )}

{/* 만기 임박 경고 배너 */}
      {expiringLoans.length > 0 && !ocrProcessing && (
        <div className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚠️</span>
            <h3 className="font-bold text-amber-800 text-sm">만기 임박 ({expiringLoans.length}건) — 90일 이내 만기 도래</h3>
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
        <div className="flex gap-1 overflow-x-auto pb-1">
          {['all', '할부', '리스', '렌트', '담보대출'].map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
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
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm flex-1 focus:outline-none focus:border-steel-500 shadow-sm"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* 리스트 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">데이터를 불러오는 중...</div>
        ) : filteredLoans.length === 0 ? (
          <div className="p-10 text-center text-gray-400">{loans.length === 0 ? '등록된 금융 정보가 없습니다.' : '해당 조건의 금융 정보가 없습니다.'}</div>
        ) : (
          <>
            {/* Desktop */}
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-left min-w-[700px]">
                <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-500 uppercase text-xs tracking-wider font-bold">
                  <tr>
                    <th className="p-4 pl-6">대상 차량</th>
                    <th className="p-4">금융사/구분</th>
                    <th className="p-4 text-right">대출 원금</th>
                    <th className="p-4 text-right">월 납입금</th>
                    <th className="p-4">기간/만기</th>
                    <th className="p-4 text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredLoans.map((loan) => {
                    const daysLeft = loan.end_date ? Math.ceil((new Date(loan.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null
                    return (
                      <tr key={loan.id} onClick={() => router.push(`/loans/${loan.id}`)} className="hover:bg-steel-50/30 transition-colors cursor-pointer group">
                        <td className="p-4 pl-6">
                          <div className="font-bold text-gray-900">{loan.cars?.number || '차량 정보 없음'}</div>
                          <div className="text-xs text-gray-500">{loan.cars?.brand} {loan.cars?.model}</div>
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

          </>
        )}
      </div>

      {/* 차량 선택 모달 (OCR 후) */}
      {carSelectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setCarSelectModal(false); setPendingOcrData(null) }}>
          <div className="bg-white rounded-2xl w-full max-w-lg h-[600px] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b bg-purple-50 shrink-0">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-black text-purple-900">견적서 인식 완료</h2>
                  <p className="text-xs text-purple-600 mt-0.5">대출을 등록할 차량을 선택하세요</p>
                </div>
                <button onClick={() => { setCarSelectModal(false); setPendingOcrData(null) }} className="text-2xl font-light text-gray-400 hover:text-black">&times;</button>
              </div>
              {pendingOcrData && (
                <div className="mt-3 bg-white rounded-xl p-3 border border-purple-100 grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-gray-400">차량가</span><br /><span className="font-black text-gray-800">{f(pendingOcrData.vehicle_price)}원</span></div>
                  <div><span className="text-gray-400">대출금</span><br /><span className="font-black text-red-600">{f(pendingOcrData.total_amount)}원</span></div>
                  <div><span className="text-gray-400">월납입</span><br /><span className="font-black text-red-600">{f(pendingOcrData.monthly_payment)}원</span></div>
                </div>
              )}
            </div>
            <div className="p-4 bg-white shrink-0">
              <input
                autoFocus
                className="w-full p-3 border-2 border-gray-100 rounded-xl bg-gray-50 font-bold focus:bg-white focus:border-steel-500 outline-none transition-colors"
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
