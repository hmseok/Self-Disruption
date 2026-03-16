'use client'
import { supabase } from '../../utils/supabase'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PnlTab from './PnlTab'
import CarSettlementTab from './CarSettlementTab'

// ── 보험 인라인 탭 ──────────────────────────
function InsuranceInlineTab({ carId, onNavigate }: { carId: string; onNavigate: () => void }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: ins } = await supabase
        .from('insurance_contracts')
        .select('*')
        .eq('car_id', carId)
        .order('end_date', { ascending: false })
      setData(ins || [])
      setLoading(false)
    }
    load()
  }, [carId])

  if (loading) return <div className="text-center py-10 text-gray-400">로딩 중...</div>

  return (
    <div className="animate-fade-in space-y-4">
      {data.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">🛡️</div>
          <p className="font-bold text-lg text-gray-500">등록된 보험이 없습니다</p>
          <p className="text-sm mt-2">보험 상세 페이지에서 보험 계약을 등록해주세요.</p>
        </div>
      ) : (
        data.map((ins: any) => {
          const isExpired = ins.end_date && new Date(ins.end_date) < new Date()
          const daysLeft = ins.end_date ? Math.ceil((new Date(ins.end_date).getTime() - Date.now()) / 86400000) : null
          return (
            <div key={ins.id} className={`bg-white p-5 rounded-2xl border shadow-sm ${isExpired ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🛡️</span>
                  <span className="font-bold text-gray-800">{ins.company || '보험사 미입력'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                    isExpired ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                  }`}>
                    {isExpired ? '만료' : '유효'}
                  </span>
                </div>
                {ins.total_premium > 0 && (
                  <span className="text-sm font-bold text-gray-800">보험료 {ins.total_premium?.toLocaleString()}원</span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">연령한정</p>
                  <p className="font-medium text-gray-700">{ins.age_limit || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">운전범위</p>
                  <p className="font-medium text-gray-700">{ins.driver_range || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">시작일</p>
                  <p className="font-medium text-gray-700">{ins.start_date || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">만기일</p>
                  <p className="font-medium text-gray-700">
                    {ins.end_date || '-'}
                    {daysLeft !== null && !isExpired && (
                      <span className={`ml-1 text-xs ${daysLeft < 30 ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                        (D-{daysLeft})
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )
        })
      )}
      {/* 하단 버튼: 데이터 유무 관계없이 동일 UI */}
      <button onClick={onNavigate}
        className="w-full bg-white text-green-600 border-2 border-green-200 py-3 rounded-xl font-bold hover:bg-green-50 transition-all">
        보험 관리 페이지로 이동 →
      </button>
    </div>
  )
}

// ── 투자 인라인 탭 ──────────────────────────
function InvestInlineTab({ carId }: { carId: string }) {
  const [investments, setInvestments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      // 이 차량에 연결된 투자 계약 조회
      // investors에는 car_id가 없으므로, transactions에서 related_type='invest'이면서
      // 같은 car에 연결된 것을 찾거나, 또는 invest 테이블에 car_ids 같은 필드가 있는지 확인
      const { data } = await supabase
        .from('general_investments')
        .select('*')
        .eq('car_id', carId)
        .order('created_at', { ascending: false })
      setInvestments(data || [])
      setLoading(false)
    }
    load()
  }, [carId])

  if (loading) return <div className="text-center py-10 text-gray-400">로딩 중...</div>

  return (
    <div className="animate-fade-in space-y-4">
      {investments.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">📈</div>
          <p className="font-bold text-lg text-gray-500">연결된 투자 계약이 없습니다</p>
          <p className="text-sm mt-2">투자 정산 관리에서 이 차량에 투자 계약을 연결해주세요.</p>
        </div>
      ) : (
        investments.map((inv: any) => {
          const monthlyInterest = inv.invest_amount && inv.interest_rate
            ? Math.round(inv.invest_amount * inv.interest_rate / 100 / 12)
            : 0
          const isActive = inv.status === 'active'
          return (
            <div key={inv.id} className={`bg-white p-5 rounded-2xl border shadow-sm ${isActive ? 'border-blue-200' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📈</span>
                  <span className="font-bold text-gray-800">{inv.investor_name || '투자자'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                    isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {isActive ? '진행중' : inv.status || '종료'}
                  </span>
                </div>
                <span className="text-sm font-bold text-blue-600">{inv.invest_amount?.toLocaleString()}원</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">이율</p>
                  <p className="font-medium text-gray-700">{inv.interest_rate}%</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">월 이자</p>
                  <p className="font-medium text-gray-700">{monthlyInterest.toLocaleString()}원</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">시작일</p>
                  <p className="font-medium text-gray-700">{inv.contract_start_date || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">종료일</p>
                  <p className="font-medium text-gray-700">{inv.contract_end_date || '-'}</p>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
export default function CarDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const carId = Array.isArray(id) ? id[0] : id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')
  const [car, setCar] = useState<any>(null)

  // 📊 좌측 요약용 상태
  const [summary, setSummary] = useState<{ insuranceCount: number; activeInsurance: any; loanCount: number; totalLoanAmount: number; investCount: number; totalInvestAmount: number }>({
    insuranceCount: 0, activeInsurance: null, loanCount: 0, totalLoanAmount: 0, investCount: 0, totalInvestAmount: 0
  })

  // 💰 금융(대출) 관련 상태
  const [loans, setLoans] = useState<any[]>([])
  const [loadingLoans, setLoadingLoans] = useState(false)
  const [newLoan, setNewLoan] = useState({
    finance_name: '', type: '할부', total_amount: 0, monthly_payment: 0, payment_date: 25, start_date: '', end_date: ''
  })

  // 1. 차량 기본 데이터 불러오기
  useEffect(() => {
    if (!carId) return
    const fetchCar = async () => {
      const { data, error } = await supabase.from('cars').select('*').eq('id', carId).single()
      if (error) { alert('차량 정보를 불러오지 못했습니다.'); router.push('/cars') }
      else { setCar(data) }
      setLoading(false)
    }
    fetchCar()
  }, [carId, router])

  // 1-b. 좌측 요약 데이터 로드
  useEffect(() => {
    if (!carId) return
    const loadSummary = async () => {
      const [insRes, loanRes, invRes] = await Promise.all([
        supabase.from('insurance_contracts').select('*').eq('car_id', carId).order('end_date', { ascending: false }),
        supabase.from('loans').select('id, total_amount').eq('car_id', carId),
        supabase.from('general_investments').select('id, invest_amount').eq('car_id', carId),
      ])
      const ins = insRes.data || []
      const activeIns = ins.find((i: any) => i.end_date && new Date(i.end_date) >= new Date())
      const loanList = loanRes.data || []
      const invList = invRes.data || []
      setSummary({
        insuranceCount: ins.length,
        activeInsurance: activeIns || null,
        loanCount: loanList.length,
        totalLoanAmount: loanList.reduce((s: number, l: any) => s + (l.total_amount || 0), 0),
        investCount: invList.length,
        totalInvestAmount: invList.reduce((s: number, i: any) => s + (i.invest_amount || 0), 0),
      })
    }
    loadSummary()
  }, [carId])

  // 2. 탭이 바뀔 때 해당 데이터 불러오기
  useEffect(() => {
    if (activeTab === 'finance') fetchLoans()
  }, [activeTab])

  // 🏦 대출 목록 불러오기
  const fetchLoans = async () => {
    setLoadingLoans(true)
    const { data, error } = await supabase.from('loans').select('*').eq('car_id', carId).order('created_at', { ascending: false })
    if (!error) setLoans(data || [])
    setLoadingLoans(false)
  }

  // 🏦 대출 추가하기
  const handleAddLoan = async () => {
    if (!newLoan.finance_name || !newLoan.total_amount) return alert('금융사명과 원금은 필수입니다.')

    const { error } = await supabase.from('loans').insert({
      car_id: carId,
      ...newLoan
    })

    if (error) alert('추가 실패: ' + error.message)
    else {
      alert('금융 정보가 등록되었습니다.')
      setNewLoan({ finance_name: '', type: '할부', total_amount: 0, monthly_payment: 0, payment_date: 25, start_date: '', end_date: '' }) // 초기화
      fetchLoans() // 목록 새로고침
    }
  }

  // 🏦 대출 삭제하기
  const handleDeleteLoan = async (loanId: number) => {
    if (!confirm('이 금융 이력을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('loans').delete().eq('id', loanId)
    if (error) alert('삭제 실패')
    else fetchLoans()
  }

  const handleChange = (field: string, value: any) => {
    setCar((prev: any) => ({ ...prev, [field]: value }))
  }

  const handleUpdate = async () => {
    setSaving(true)
    const { error } = await supabase.from('cars').update({
        number: car.number, brand: car.brand, model: car.model, trim: car.trim,
        year: car.year, fuel: car.fuel, status: car.status, location: car.location,
        mileage: car.mileage, purchase_price: car.purchase_price, acq_date: car.acq_date,
        is_used: car.is_used, purchase_mileage: car.purchase_mileage,
        // 초기비용
        registration_tax: car.registration_tax || 0, bond_amount: car.bond_amount || 0,
        delivery_fee: car.delivery_fee || 0, plate_fee: car.plate_fee || 0,
        agency_fee: car.agency_fee || 0, other_initial_cost: car.other_initial_cost || 0,
        initial_cost_memo: car.initial_cost_memo || '',
        // 지입 관련
        ownership_type: car.ownership_type, owner_name: car.owner_name, owner_phone: car.owner_phone,
        owner_bank: car.owner_bank, owner_account: car.owner_account, owner_account_holder: car.owner_account_holder,
        consignment_fee: car.consignment_fee, consignment_start: car.consignment_start || null,
        consignment_end: car.consignment_end || null, insurance_by: car.insurance_by,
        consignment_contract_url: car.consignment_contract_url, owner_memo: car.owner_memo
      }).eq('id', carId)
    setSaving(false)
    if (error) alert('저장 실패: ' + error.message)
    else alert('✅ 저장되었습니다!')
  }

  const handleDelete = async () => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    const { error } = await supabase.from('cars').delete().eq('id', carId)
    if (error) alert('삭제 실패')
    else { alert('삭제되었습니다.'); router.push('/cars') }
  }

  if (loading) return <div className="p-20 text-center">로딩 중... ⏳</div>
  if (!car) return null

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in-up pb-20">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/cars')} className="bg-white px-4 py-2 border rounded-xl font-bold text-gray-500 hover:bg-gray-50">← 목록</button>
          <div>
            <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              차량 상세 정보
              <span className={`text-xs px-2 py-1 rounded-lg border font-bold ${car.status === '운행중' ? 'bg-green-100 text-green-600 border-green-200' : 'bg-gray-100 text-gray-500'}`}>
                {car.status}
              </span>
            </h2>
            <p className="text-gray-500 font-medium text-sm mt-0.5">관리번호: {car.id} / {car.brand} {car.model}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDelete} className="px-4 py-2 border border-red-100 text-red-500 font-bold rounded-xl hover:bg-red-50">삭제</button>
          <button onClick={handleUpdate} disabled={saving} className="px-6 py-2 bg-steel-600 text-white font-bold rounded-xl shadow-lg hover:bg-steel-700 transition-all">
            {saving ? '저장 중...' : '💾 저장'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 좌측: 요약 정보 카드 */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-6 lg:self-start">
           <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
              <div className="flex justify-between items-start mb-8">
                <div>
                   <p className="text-gray-400 text-xs font-bold mb-1">Vehicle No.</p>
                   <div className="bg-white text-black px-4 py-2 rounded-lg border-2 border-black inline-block shadow-lg">
                      <span className="text-2xl font-black tracking-widest">{car.number}</span>
                   </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm">
                    <p className="text-gray-400 text-xs font-bold">모델명</p>
                    <p className="text-lg font-bold truncate">{car.brand} {car.model}</p>
                 </div>
                 <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm">
                    <p className="text-gray-400 text-xs font-bold">주행거리</p>
                    <p className="text-lg font-bold">{car.mileage?.toLocaleString()} km</p>
                 </div>
              </div>
              {/* 신차/중고차 구분 */}
              <div className="mt-4 flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  car.is_used ? 'bg-orange-500/20 text-orange-300' : 'bg-blue-500/20 text-blue-300'
                }`}>
                  {car.is_used ? '🔄 중고차' : '🆕 신차'}
                </span>
                {car.is_used && car.purchase_mileage > 0 && (
                  <span className="text-xs text-gray-400">
                    구입시 주행거리: <b className="text-white">{car.purchase_mileage?.toLocaleString()}km</b>
                  </span>
                )}
              </div>
           </div>

           <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
             <div>
                <label className="text-xs font-bold text-gray-400">현재 차고지</label>
                <input className="w-full font-bold border-b py-2 mt-1 focus:outline-none focus:border-steel-500 text-sm"
                  value={car.location || ''}
                  onChange={e => handleChange('location', e.target.value)}
                  placeholder="위치 정보 입력"
                />
             </div>
           </div>

           {/* 취득 요약 */}
           {(car.purchase_price > 0) && (
             <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-200">
               <p className="text-xs font-bold text-gray-400 mb-3">💰 취득 요약</p>
               <div className="space-y-2">
                 <div className="flex justify-between items-center">
                   <span className="text-xs text-gray-500">구매가</span>
                   <span className="text-sm font-bold text-gray-800">{car.purchase_price?.toLocaleString()}원</span>
                 </div>
                 {((car.registration_tax || 0) + (car.bond_amount || 0) + (car.delivery_fee || 0) + (car.plate_fee || 0) + (car.agency_fee || 0) + (car.other_initial_cost || 0)) > 0 && (
                   <div className="flex justify-between items-center">
                     <span className="text-xs text-gray-500">초기비용</span>
                     <span className="text-sm font-bold text-gray-800">
                       {((car.registration_tax || 0) + (car.bond_amount || 0) + (car.delivery_fee || 0) + (car.plate_fee || 0) + (car.agency_fee || 0) + (car.other_initial_cost || 0)).toLocaleString()}원
                     </span>
                   </div>
                 )}
                 <div className="border-t pt-2 flex justify-between items-center">
                   <span className="text-xs font-bold text-gray-600">총 취득원가</span>
                   <span className="text-sm font-black text-blue-600">
                     {((car.purchase_price || 0) + (car.registration_tax || 0) + (car.bond_amount || 0) + (car.delivery_fee || 0) + (car.plate_fee || 0) + (car.agency_fee || 0) + (car.other_initial_cost || 0)).toLocaleString()}원
                   </span>
                 </div>
               </div>
             </div>
           )}

           {/* 보험 · 대출 · 투자 요약 */}
           <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-200">
             <p className="text-xs font-bold text-gray-400 mb-3">📋 관리 현황</p>
             <div className="space-y-3">
               {/* 보험 */}
               <button onClick={() => setActiveTab('insurance')} className="w-full flex items-center justify-between hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors">
                 <div className="flex items-center gap-2">
                   <span className="text-base">🛡️</span>
                   <span className="text-xs font-medium text-gray-600">보험</span>
                 </div>
                 {summary.activeInsurance ? (
                   <div className="text-right">
                     <span className="text-xs font-bold text-green-600">{summary.activeInsurance.company}</span>
                     <p className="text-[10px] text-gray-400">~{summary.activeInsurance.end_date}</p>
                   </div>
                 ) : (
                   <span className="text-xs text-gray-400">{summary.insuranceCount > 0 ? '만료됨' : '미등록'}</span>
                 )}
               </button>

               {/* 대출 */}
               <button onClick={() => setActiveTab('finance')} className="w-full flex items-center justify-between hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors">
                 <div className="flex items-center gap-2">
                   <span className="text-base">💳</span>
                   <span className="text-xs font-medium text-gray-600">대출/금융</span>
                 </div>
                 {summary.loanCount > 0 ? (
                   <span className="text-xs font-bold text-gray-800">{summary.loanCount}건 · {summary.totalLoanAmount.toLocaleString()}원</span>
                 ) : (
                   <span className="text-xs text-gray-400">없음</span>
                 )}
               </button>

               {/* 투자 */}
               <button onClick={() => setActiveTab('invest')} className="w-full flex items-center justify-between hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors">
                 <div className="flex items-center gap-2">
                   <span className="text-base">📈</span>
                   <span className="text-xs font-medium text-gray-600">투자</span>
                 </div>
                 {summary.investCount > 0 ? (
                   <span className="text-xs font-bold text-gray-800">{summary.investCount}건 · {summary.totalInvestAmount.toLocaleString()}원</span>
                 ) : (
                   <span className="text-xs text-gray-400">없음</span>
                 )}
               </button>

               {/* 지입 */}
               <button onClick={() => setActiveTab('jiip')} className="w-full flex items-center justify-between hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors">
                 <div className="flex items-center gap-2">
                   <span className="text-base">🤝</span>
                   <span className="text-xs font-medium text-gray-600">소유구분</span>
                 </div>
                 <span className="text-xs font-bold text-gray-800">
                   {car.ownership_type === 'company' ? '자사 보유' : car.ownership_type === 'consignment' ? '지입' : car.ownership_type === 'leased_in' ? '임차' : '미설정'}
                 </span>
               </button>
             </div>
           </div>
        </div>

        {/* 우측: 탭 메뉴 및 상세 내용 */}
        <div className="lg:col-span-8 bg-white rounded-3xl shadow-sm border border-gray-200 min-h-[600px] flex flex-col">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {['basic', 'pnl', 'settlement', 'insurance', 'finance', 'jiip', 'invest'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-5 font-bold capitalize transition-all border-b-2 whitespace-nowrap px-4 ${
                  activeTab === tab ? 'text-steel-600 border-steel-600 bg-steel-50/30' : 'text-gray-400 border-transparent hover:text-gray-600'
                }`}
              >
                {tab === 'basic' && '📋 기본 정보'}
                {tab === 'pnl' && '📊 손익'}
                {tab === 'settlement' && '💳 수익/정산'}
                {tab === 'insurance' && '🛡️ 보험 이력'}
                {tab === 'finance' && '💰 대출/금융'}
                {tab === 'jiip' && '🤝 지입 관리'}
                {tab === 'invest' && '📈 투자 관리'}
              </button>
            ))}
          </div>

          <div className="p-8 flex-1 bg-gray-50/50">
             {/* 📊 손익 탭 */}
             {activeTab === 'pnl' && (
               <PnlTab carId={carId!} companyId={car?.company_id} car={car} />
             )}

             {/* 💳 수익/정산 탭 */}
             {activeTab === 'settlement' && (
               <CarSettlementTab carId={carId!} companyId={car?.company_id} car={car} />
             )}

             {/* 📋 기본 정보 탭 */}
             {activeTab === 'basic' && (
               <div className="animate-fade-in space-y-6">
                 {/* 차량 기본 제원 */}
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                   <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">🚗 차량 정보</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">차량번호</label>
                       <input className="w-full border rounded-lg p-2.5 text-sm font-bold" value={car.number || ''} onChange={e => handleChange('number', e.target.value)} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">브랜드</label>
                       <input className="w-full border rounded-lg p-2.5 text-sm" value={car.brand || ''} onChange={e => handleChange('brand', e.target.value)} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">모델</label>
                       <input className="w-full border rounded-lg p-2.5 text-sm" value={car.model || ''} onChange={e => handleChange('model', e.target.value)} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">트림</label>
                       <input className="w-full border rounded-lg p-2.5 text-sm" value={car.trim || ''} onChange={e => handleChange('trim', e.target.value)} placeholder="예: 프레스티지" />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">연식</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" value={car.year || ''} onChange={e => handleChange('year', Number(e.target.value))} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">연료</label>
                       <select className="w-full border rounded-lg p-2.5 text-sm" value={car.fuel || ''} onChange={e => handleChange('fuel', e.target.value)}>
                         <option value="">선택</option>
                         <option value="gasoline">휘발유</option>
                         <option value="diesel">디젤</option>
                         <option value="lpg">LPG</option>
                         <option value="electric">전기</option>
                         <option value="hybrid">하이브리드</option>
                       </select>
                     </div>
                   </div>
                 </div>

                 {/* 상태/운행 */}
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                   <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">📊 상태 및 운행</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">차량 상태</label>
                       <select className="w-full border rounded-lg p-2.5 text-sm" value={car.status || ''} onChange={e => handleChange('status', e.target.value)}>
                         <option value="available">가용</option>
                         <option value="rented">렌트중</option>
                         <option value="maintenance">정비중</option>
                         <option value="sold">매각</option>
                       </select>
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">현재 주행거리 (km)</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" value={car.mileage || ''} onChange={e => handleChange('mileage', Number(e.target.value))} />
                     </div>
                   </div>
                 </div>

                 {/* 취득 정보 */}
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                   <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">💰 취득 정보</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">구매가 (원)</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" value={car.purchase_price || ''} onChange={e => handleChange('purchase_price', Number(e.target.value))} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">취득일</label>
                       <input type="date" className="w-full border rounded-lg p-2.5 text-sm" value={car.acq_date || ''} onChange={e => handleChange('acq_date', e.target.value)} />
                     </div>
                     <div className="flex items-center gap-3 col-span-2">
                       <label className="flex items-center gap-2 cursor-pointer">
                         <input type="checkbox" checked={car.is_used || false} onChange={e => handleChange('is_used', e.target.checked)}
                           className="w-4 h-4 rounded border-gray-300" />
                         <span className="text-sm font-medium text-gray-700">중고차 구입</span>
                       </label>
                       {car.is_used && (
                         <div className="flex-1">
                           <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="구입시 주행거리 (km)"
                             value={car.purchase_mileage || ''} onChange={e => handleChange('purchase_mileage', Number(e.target.value))} />
                         </div>
                       )}
                     </div>
                   </div>
                 </div>

                 {/* 초기비용 */}
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                   <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">🧾 초기비용 (취득원가)</h3>
                   <p className="text-xs text-gray-400 mb-4">차량 구매 시 발생한 부대비용. 손익 분석 시 총 취득원가에 포함됩니다.</p>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">취등록세</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="0"
                         value={car.registration_tax || ''} onChange={e => handleChange('registration_tax', Number(e.target.value))} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">공채 (할인액)</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="0"
                         value={car.bond_amount || ''} onChange={e => handleChange('bond_amount', Number(e.target.value))} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">탁송비</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="0"
                         value={car.delivery_fee || ''} onChange={e => handleChange('delivery_fee', Number(e.target.value))} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">번호판/인지대</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="0"
                         value={car.plate_fee || ''} onChange={e => handleChange('plate_fee', Number(e.target.value))} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">대행수수료</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="0"
                         value={car.agency_fee || ''} onChange={e => handleChange('agency_fee', Number(e.target.value))} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-gray-500 block mb-1">기타 비용</label>
                       <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="0"
                         value={car.other_initial_cost || ''} onChange={e => handleChange('other_initial_cost', Number(e.target.value))} />
                     </div>
                   </div>
                   {/* 초기비용 합계 */}
                   <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                     <span className="text-sm font-bold text-gray-500">초기비용 합계</span>
                     <span className="text-lg font-black text-gray-800">
                       {((car.registration_tax || 0) + (car.bond_amount || 0) + (car.delivery_fee || 0) + (car.plate_fee || 0) + (car.agency_fee || 0) + (car.other_initial_cost || 0)).toLocaleString()}원
                     </span>
                   </div>
                   {/* 총 취득원가 */}
                   <div className="mt-2 flex items-center justify-between">
                     <span className="text-sm font-bold text-gray-500">총 취득원가 (구매가 + 초기비용)</span>
                     <span className="text-lg font-black text-blue-600">
                       {((car.purchase_price || 0) + (car.registration_tax || 0) + (car.bond_amount || 0) + (car.delivery_fee || 0) + (car.plate_fee || 0) + (car.agency_fee || 0) + (car.other_initial_cost || 0)).toLocaleString()}원
                     </span>
                   </div>
                   <div className="mt-3">
                     <label className="text-xs font-bold text-gray-500 block mb-1">초기비용 메모</label>
                     <input className="w-full border rounded-lg p-2.5 text-sm" placeholder="예: 공채 5% 할인 적용, 직접 이전"
                       value={car.initial_cost_memo || ''} onChange={e => handleChange('initial_cost_memo', e.target.value)} />
                   </div>
                 </div>

                 {/* 등록증 바로가기 + 저장 */}
                 <div className="flex items-center gap-3">
                   <button onClick={() => router.push(`/registration/${carId}`)}
                     className="flex-1 bg-white text-steel-600 border-2 border-steel-200 px-6 py-3.5 rounded-xl font-bold hover:bg-steel-50 transition-all text-center">
                     📄 등록증 상세 보기
                   </button>
                   <button onClick={handleUpdate} disabled={saving}
                     className="flex-1 bg-steel-600 text-white px-6 py-3.5 rounded-xl font-bold hover:bg-steel-700 transition-colors disabled:opacity-50">
                     {saving ? '저장 중...' : '💾 기본 정보 저장'}
                   </button>
                 </div>
               </div>
             )}

             {/* 🛡️ 보험 이력 탭 */}
             {activeTab === 'insurance' && (
              <InsuranceInlineTab carId={carId!} onNavigate={() => router.push(`/insurance/${carId}`)} />
            )}

            {/* 🤝 지입 관리 탭 */}
            {activeTab === 'jiip' && (
              <div className="animate-fade-in space-y-6">
                {/* 소유 구분 선택 */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">📌 소유 구분</h3>
                  <div className="flex gap-3">
                    {[
                      { value: 'company', label: '자사 보유', desc: '사업자 명의 차량', color: 'blue' },
                      { value: 'consignment', label: '지입 차량', desc: '타인 명의, 우리가 운영', color: 'amber' },
                      { value: 'leased_in', label: '임차 차량', desc: '외부에서 빌려온 차량', color: 'purple' },
                    ].map(opt => (
                      <button key={opt.value} onClick={() => handleChange('ownership_type', opt.value)}
                        className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${
                          car.ownership_type === opt.value
                            ? opt.color === 'blue' ? 'border-blue-500 bg-blue-50'
                              : opt.color === 'amber' ? 'border-amber-500 bg-amber-50'
                              : 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                        <div className="font-bold text-sm">{opt.label}</div>
                        <div className="text-xs text-gray-500 mt-1">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 지입/임차인 경우 상세 정보 */}
                {(car.ownership_type === 'consignment' || car.ownership_type === 'leased_in') && (
                  <>
                    {/* 지입주 정보 */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">👤 {car.ownership_type === 'consignment' ? '지입주' : '임대인'} 정보</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">이름</label>
                          <input className="w-full border rounded-lg p-2.5 text-sm" placeholder="홍길동"
                            value={car.owner_name || ''} onChange={e => handleChange('owner_name', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">연락처</label>
                          <input className="w-full border rounded-lg p-2.5 text-sm" placeholder="010-0000-0000"
                            value={car.owner_phone || ''} onChange={e => handleChange('owner_phone', e.target.value)} />
                        </div>
                      </div>
                    </div>

                    {/* 정산 계좌 */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">🏦 정산 계좌</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">은행명</label>
                          <input className="w-full border rounded-lg p-2.5 text-sm" placeholder="신한은행"
                            value={car.owner_bank || ''} onChange={e => handleChange('owner_bank', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">계좌번호</label>
                          <input className="w-full border rounded-lg p-2.5 text-sm" placeholder="110-123-456789"
                            value={car.owner_account || ''} onChange={e => handleChange('owner_account', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">예금주</label>
                          <input className="w-full border rounded-lg p-2.5 text-sm" placeholder="홍길동"
                            value={car.owner_account_holder || ''} onChange={e => handleChange('owner_account_holder', e.target.value)} />
                        </div>
                      </div>
                    </div>

                    {/* 계약 조건 */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">📝 계약 조건</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">월 {car.ownership_type === 'consignment' ? '지입료' : '임차료'}</label>
                          <input type="number" className="w-full border rounded-lg p-2.5 text-sm" placeholder="0"
                            value={car.consignment_fee || ''} onChange={e => handleChange('consignment_fee', Number(e.target.value))} />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">보험 주체</label>
                          <select className="w-full border rounded-lg p-2.5 text-sm"
                            value={car.insurance_by || 'company'} onChange={e => handleChange('insurance_by', e.target.value)}>
                            <option value="company">우리 회사</option>
                            <option value="owner">{car.ownership_type === 'consignment' ? '지입주' : '임대인'} 본인</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">계약 시작일</label>
                          <input type="date" className="w-full border rounded-lg p-2.5 text-sm"
                            value={car.consignment_start || ''} onChange={e => handleChange('consignment_start', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">계약 종료일</label>
                          <input type="date" className="w-full border rounded-lg p-2.5 text-sm"
                            value={car.consignment_end || ''} onChange={e => handleChange('consignment_end', e.target.value)} />
                          {car.consignment_end && new Date(car.consignment_end) < new Date() && (
                            <p className="text-xs text-red-500 mt-1 font-bold">⚠️ 계약이 만료되었습니다</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 계약서 첨부 + 메모 */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">📎 계약서 및 메모</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">계약서 파일 URL</label>
                          <div className="flex gap-2">
                            <input className="flex-1 border rounded-lg p-2.5 text-sm" placeholder="Supabase Storage URL 또는 외부 링크"
                              value={car.consignment_contract_url || ''} onChange={e => handleChange('consignment_contract_url', e.target.value)} />
                            {car.consignment_contract_url && (
                              <a href={car.consignment_contract_url} target="_blank" rel="noopener noreferrer"
                                className="bg-steel-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-steel-700 whitespace-nowrap">열기</a>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">메모 / 특약사항</label>
                          <textarea className="w-full border rounded-lg p-2.5 text-sm" rows={3}
                            placeholder="특약사항, 정산 조건 등 참고 내용"
                            value={car.owner_memo || ''} onChange={e => handleChange('owner_memo', e.target.value)} />
                        </div>
                      </div>
                    </div>

                    {/* 저장 버튼 */}
                    <button onClick={handleUpdate} disabled={saving}
                      className="w-full bg-steel-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-steel-700 transition-colors disabled:opacity-50">
                      {saving ? '저장 중...' : '💾 지입 정보 저장'}
                    </button>
                  </>
                )}

                {(car.ownership_type === 'company' || !car.ownership_type) && (
                  <div className="text-center py-16 text-gray-400">
                    <div className="text-5xl mb-4">{car.ownership_type === 'company' ? '🏢' : '👆'}</div>
                    <p className="font-bold text-lg text-gray-500">
                      {car.ownership_type === 'company' ? '자사 보유 차량' : '소유 구분을 선택해주세요'}
                    </p>
                    <p className="text-sm mt-2">
                      {car.ownership_type === 'company'
                        ? '자사 명의로 등록된 차량은 별도 지입 정보가 필요하지 않습니다.'
                        : '위에서 자사 보유 / 지입 / 임차 중 하나를 선택하면 해당 정보를 입력할 수 있습니다.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 📈 투자 관리 탭 */}
            {activeTab === 'invest' && (
              <InvestInlineTab carId={carId!} />
            )}

            {/* 💰 [신규] 대출/금융 탭 */}
            {activeTab === 'finance' && (
              <div className="animate-fade-in space-y-8">
                {/* 1. 입력 폼 */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">➕ 금융/대출 정보 등록</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">금융사 (캐피탈)</label>
                      <input className="w-full border rounded-lg p-2 text-sm" placeholder="예: 현대캐피탈" value={newLoan.finance_name} onChange={e => setNewLoan({...newLoan, finance_name: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">구분</label>
                      <select className="w-full border rounded-lg p-2 text-sm" value={newLoan.type} onChange={e => setNewLoan({...newLoan, type: e.target.value})}>
                        <option>할부</option><option>리스</option><option>담보대출</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">대출 원금 (원)</label>
                      <input type="number" className="w-full border rounded-lg p-2 text-sm" placeholder="0" value={newLoan.total_amount} onChange={e => setNewLoan({...newLoan, total_amount: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">월 납입금 (원)</label>
                      <input type="number" className="w-full border rounded-lg p-2 text-sm" placeholder="0" value={newLoan.monthly_payment} onChange={e => setNewLoan({...newLoan, monthly_payment: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">매월 납입일 (일)</label>
                      <input type="number" className="w-full border rounded-lg p-2 text-sm" placeholder="예: 25" value={newLoan.payment_date} onChange={e => setNewLoan({...newLoan, payment_date: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">만기일</label>
                      <input type="date" className="w-full border rounded-lg p-2 text-sm" value={newLoan.end_date} onChange={e => setNewLoan({...newLoan, end_date: e.target.value})} />
                    </div>
                  </div>
                  <button onClick={handleAddLoan} className="w-full bg-steel-600 text-white py-3 rounded-xl font-bold hover:bg-steel-700 transition-colors">등록하기</button>
                </div>

                {/* 2. 목록 리스트 */}
                <div className="space-y-4">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">📋 등록된 금융 리스트 ({loans.length})</h3>
                  {loadingLoans ? <p className="text-center py-10 text-gray-400">로딩 중...</p> : (
                    loans.length === 0 ? (
                      <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-300 text-gray-400">등록된 금융 정보가 없습니다.</div>
                    ) : (
                      loans.map((loan) => (
                        <div key={loan.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 hover:border-steel-200 transition-all group">
                          <div className="flex items-center gap-4 w-full">
                            <div className="w-12 h-12 rounded-full bg-steel-50 text-steel-600 flex items-center justify-center font-bold text-lg">￦</div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-800 text-lg">{loan.finance_name}</span>
                                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">{loan.type}</span>
                              </div>
                              <p className="text-sm text-gray-500 mt-1">
                                월 <span className="font-bold text-gray-900">{loan.monthly_payment?.toLocaleString()}원</span> (매월 {loan.payment_date}일)
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6 w-full md:w-auto justify-end">
                             <div className="text-right">
                                <p className="text-xs text-gray-400">총 대출금</p>
                                <p className="font-bold text-gray-800">{loan.total_amount?.toLocaleString()}원</p>
                             </div>
                             <button onClick={() => handleDeleteLoan(loan.id)} className="text-gray-300 hover:text-red-500 p-2">🗑️</button>
                          </div>
                        </div>
                      ))
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}