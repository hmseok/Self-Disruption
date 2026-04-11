'use client'
import { useApp } from '../context/AppContext'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import DcStatStrip, { StatItem, ActionButton } from '../components/DcStatStrip'
import DcToolbar, { FilterItem } from '../components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../components/NeuDataTable'

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

type Loan = {
  id: string
  car_id: string
  finance_name: string
  type: string
  total_amount: number
  monthly_payment: number
  months: number
  end_date: string | null
  interest_rate: number
  cars?: {
    number: string
    brand: string
    model: string
  }
}

export default function LoanListPage() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const effectiveCompanyId = role === 'admin' ? adminSelectedCompanyId : company?.id
  const router = useRouter()
  const [loans, setLoans] = useState<Loan[]>([])
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
    if (!company && role !== 'admin') return
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/loans', { headers })
      const json = await res.json()
      setLoans(json.data || [])
    } catch (e) { console.error('[loans fetchData]', e) }
    setLoading(false)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('정말 삭제하시겠습니까?')) return
    const headers = await getAuthHeader()
    await fetch(`/api/loans/${id}`, { method: 'DELETE', headers })
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
      // GCS upload
      const uploadFormData = new FormData()
      uploadFormData.append('file', file)
      uploadFormData.append('folder', 'loans')
      const { Authorization } = await getAuthHeader()
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: Authorization ? { Authorization } : {},
        body: uploadFormData,
      })
      const uploadJson = await uploadRes.json()
      const publicUrl = uploadJson.url || ''

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

      const headers = await getAuthHeader()
      const carsRes = await fetch('/api/cars', { headers })
      const carsJson = await carsRes.json()
      setAllCars(carsJson.data || [])
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

    const headers = await getAuthHeader()
    const res = await fetch('/api/loans', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (json.error) { alert('등록 실패: ' + json.error); return }

    setCarSelectModal(false)
    setPendingOcrData(null)
    setPendingAttachmentUrl('')
    alert(`${car.number} 차량에 금융 정보가 등록되었습니다!`)
    router.push(`/loans/${json.data?.id}`)
  }

  const filteredModalCars = allCars.filter(c =>
    c.number.includes(carSearchTerm) || (c.brand || '').includes(carSearchTerm) || (c.model || '').includes(carSearchTerm)
  )

  if (role === 'admin' && !adminSelectedCompanyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div className="bg-white rounded-2xl border border-black/[0.06] p-20 text-center">
          <span className="text-4xl block mb-3">🏢</span>
          <p className="font-bold text-slate-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  // ─── DcStatStrip 데이터 ───
  const statItems: StatItem[] = [
    { label: '총 대출 잔액', value: f(totalDebt), unit: '원' },
    { label: '월 고정 지출', value: f(monthlyOut), unit: '원' },
    { label: '계약 건수', value: loans.length, unit: '건' },
    { label: '만기 임박 (90일)', value: expiringCount, unit: '건' },
    { label: '평균 이자율', value: avgRate, unit: '%' },
  ]

  const statActions: ActionButton[] = [
    { label: '직접 등록', onClick: () => router.push('/loans/new'), variant: 'primary', icon: '+' },
  ]

  // ─── DcToolbar 필터 데이터 ───
  const filterItems: FilterItem[] = [
    { key: 'all', label: '전체', count: typeStats['all'] },
    { key: '할부', label: '할부', count: typeStats['할부'] },
    { key: '리스', label: '리스', count: typeStats['리스'] },
    { key: '렌트', label: '렌트', count: typeStats['렌트'] },
    { key: '담보대출', label: '담보대출', count: typeStats['담보대출'] },
  ]

  // ─── NeuDataTable 컬럼 ───
  const columns: TableColumn<Loan>[] = [
    {
      key: 'number',
      label: '대상 차량',
      render: (loan) => (
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: '#0f2440' }}>{loan.cars?.number || '차량 정보 없음'}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{loan.cars?.brand} {loan.cars?.model}</div>
        </div>
      ),
    },
    {
      key: 'finance',
      label: '금융사/구분',
      render: (loan) => (
        <div>
          <span style={{ fontWeight: 700, color: '#1e293b' }}>{loan.finance_name}</span>
          <span className="si-badge si-badge-slate" style={{ marginLeft: 8, fontSize: 11 }}>{loan.type}</span>
        </div>
      ),
    },
    {
      key: 'total_amount',
      label: '대출 원금',
      align: 'right',
      render: (loan) => (
        <span style={{ fontWeight: 600, color: '#1e293b' }}>{f(Number(loan.total_amount))}원</span>
      ),
    },
    {
      key: 'monthly_payment',
      label: '월 납입금',
      align: 'right',
      render: (loan) => (
        <span style={{ fontWeight: 900, color: '#dc2626' }}>{f(Number(loan.monthly_payment))}원</span>
      ),
    },
    {
      key: 'end_date',
      label: '기간/만기',
      render: (loan) => {
        const daysLeft = loan.end_date ? Math.ceil((new Date(loan.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null
        return (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{loan.months}개월</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <span style={{ fontSize: 11, color: '#64748b' }}>{loan.end_date || '-'}</span>
              {daysLeft !== null && daysLeft >= 0 && daysLeft <= 90 && (
                <span className={`si-badge ${daysLeft <= 30 ? 'si-badge-red' : daysLeft <= 60 ? 'si-badge-amber' : 'si-badge-yellow'}`} style={{ fontSize: 10 }}>
                  D-{daysLeft}
                </span>
              )}
            </div>
          </div>
        )
      },
    },
    {
      key: 'actions',
      label: '관리',
      align: 'center',
      width: 60,
      render: (loan) => (
        <button
          onClick={(e) => handleDelete(e, loan.id)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 8,
            borderRadius: 8,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent'
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#cbd5e1' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      ),
    },
  ]

  // ─── 모바일 카드 설정 ───
  const mobileCard: MobileCardConfig<Loan> = {
    title: (loan) => loan.cars?.number || '차량 정보 없음',
    subtitle: (loan) => {
      const daysLeft = loan.end_date ? Math.ceil((new Date(loan.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null
      return `${loan.finance_name} · ${loan.months}개월`
    },
    trailing: (loan) => (
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: '#dc2626' }}>{f(Number(loan.monthly_payment))}원</div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>/월</div>
      </div>
    ),
    badges: (loan) => {
      const daysLeft = loan.end_date ? Math.ceil((new Date(loan.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null
      return (
        <>
          <span className="si-badge si-badge-slate">{loan.type}</span>
          {daysLeft !== null && daysLeft >= 0 && daysLeft <= 90 && (
            <span className={`si-badge ${daysLeft <= 30 ? 'si-badge-red' : daysLeft <= 60 ? 'si-badge-amber' : 'si-badge-yellow'}`}>
              D-{daysLeft}
            </span>
          )}
        </>
      )
    },
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50 min-h-screen animate-fade-in">
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" className="hidden" onChange={handleFileSelect} />

      {/* DcStatStrip + Actions */}
      <DcStatStrip
        stats={statItems}
        actions={statActions}
      />

      {/* 드래그 앤 드롭 영역 (할부 견적서) */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !ocrProcessing && fileInputRef.current?.click()}
        className={`mb-6 border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-900/20 scale-[1.01]'
            : ocrProcessing
              ? 'border-black/10 bg-gray-50 cursor-wait'
              : 'border-black/10 bg-white/[0.05] hover:border-blue-500/50 hover:bg-gray-100'
        }`}
      >
        {ocrProcessing ? (
          <div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="animate-spin inline-block w-4 h-4 border-2 border-slate-600 border-t-blue-500 rounded-full"></span>
              <span className="text-sm font-bold text-slate-600">AI 견적서 분석 중...</span>
            </div>
            <div className="w-full max-w-xs mx-auto bg-gray-100 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${ocrProgress.total > 0 ? (ocrProgress.current / ocrProgress.total) * 100 : 10}%` }}></div>
            </div>
            <div className="mt-2 text-xs text-slate-400 space-y-0.5">
              {ocrLogs.slice(0, 2).map((log, i) => <div key={i}>{log}</div>)}
            </div>
          </div>
        ) : (
          <>
            <div className="text-2xl mb-1">{isDragging ? '📥' : '📄'}</div>
            <p className="text-sm font-bold text-slate-800">{isDragging ? '여기에 파일을 놓으세요' : '할부 견적서 드래그 또는 클릭'}</p>
            <p className="text-xs text-slate-400 mt-0.5">이미지/PDF · AI 자동 인식</p>
          </>
        )}
      </div>

      {/* 만기 임박 경고 배너 */}
      {expiringLoans.length > 0 && !ocrProcessing && (
        <div className="mb-6 bg-gradient-to-r from-amber-900/20 to-orange-900/20 border border-amber-700/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚠️</span>
            <h3 className="font-bold text-amber-300 text-sm">만기 임박 {expiringLoans.length}건 — 90일 이내</h3>
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

      {/* DcToolbar (Search + Filter in one bar) */}
      <DcToolbar
        search={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder="차량번호, 금융사 검색..."
        filters={filterItems}
        activeFilter={typeFilter}
        onFilterChange={setTypeFilter}
      />

      {/* 데이터 테이블 */}
      <NeuDataTable
        columns={columns}
        data={filteredLoans}
        rowKey={(loan) => loan.id}
        onRowClick={(loan) => router.push(`/loans/${loan.id}`)}
        loading={loading}
        emptyIcon="🏦"
        emptyMessage={loans.length === 0 ? '등록된 금융 정보가 없습니다' : '해당 조건의 금융 정보가 없습니다'}
        mobileCard={mobileCard}
      />

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
