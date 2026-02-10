'use client'
import { supabase } from '../../utils/supabase'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../../context/AppContext'

export default function QuoteCalculatorPage() {
  const router = useRouter()
  const { company, role, adminSelectedCompanyId } = useApp()
  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id
  const [loading, setLoading] = useState(false)

  // --- 공통 코드 (연료, 색상 등) ---
  const [commonCodes, setCommonCodes] = useState<any[]>([])

  // 데이터 목록
  const [cars, setCars] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])

  // 1. 선택된 데이터
  const [selectedCar, setSelectedCar] = useState<any>(null)
  const [selectedCustomerName, setSelectedCustomerName] = useState('')
  const [finance, setFinance] = useState<any>(null)
  const [insurance, setInsurance] = useState<any>(null)

  // 2. 견적 조건 입력
  const [term, setTerm] = useState(12)
  const [deposit, setDeposit] = useState(1000000)
  const [margin, setMargin] = useState(100000)

  // 3. 자동 계산되는 비용들
  const [costs, setCosts] = useState({
    monthly_finance: 0,
    monthly_insurance: 0,
    maintenance: 50000,
    total_cost: 0
  })

  // 🧠 [AI] 감가율 규칙 & 시스템 시세
  const [rules, setRules] = useState<any>({})
  const [estimatedPrice, setEstimatedPrice] = useState(0)

  // --- 데이터 불러오기 ---
  useEffect(() => {
    const fetchData = async () => {
      // 1. 공통 코드
      const { data: codeData } = await supabase.from('common_codes').select('*')
      setCommonCodes(codeData || [])

      // 2. 비즈니스 규칙 (감가율)
      const { data: ruleData } = await supabase.from('business_rules').select('*')
      if (ruleData) {
        const ruleMap = ruleData.reduce((acc:any, cur) => ({ ...acc, [cur.key]: cur.value }), {})
        setRules(ruleMap)
      }

      // 3. 차량 (대기중인 것만)
      const { data: carData } = await supabase.from('cars').select('*').eq('status', 'available')
      setCars(carData || [])

      // 4. 고객 (전체)
      const { data: custData } = await supabase.from('customers').select('*').order('name')
      setCustomers(custData || [])
    }
    fetchData()
  }, [])

  // 차량 선택 핸들러
  const handleCarSelect = async (carId: string) => {
    if (!carId) return
    setLoading(true)
    const { data: carData } = await supabase.from('cars').select('*').eq('id', carId).single()
    setSelectedCar(carData)

    const { data: finData } = await supabase.from('financial_products').select('*').eq('car_id', carId).order('id', { ascending: false }).limit(1).single()
    setFinance(finData)

    const { data: insData } = await supabase.from('insurance_contracts').select('*').eq('car_id', carId).order('id', { ascending: false }).limit(1).single()
    setInsurance(insData)
    setLoading(false)
  }

  // 🧠 [AI] 시스템 시세 자동 계산 로직
  useEffect(() => {
    if (selectedCar && rules.DEP_YEAR) {
      const thisYear = new Date().getFullYear()
      const carAge = thisYear - selectedCar.year // 차량 나이
      const mileageUnit = selectedCar.mileage / 10000 // 만km 단위

      // 감가율 계산
      const ageDep = carAge * rules.DEP_YEAR
      const mileDep = mileageUnit * (rules.DEP_MILEAGE_10K || 0.02)
      const totalDepRate = ageDep + mileDep

      // 시세 계산 (최소 10% 방어)
      const estimated = Math.round(selectedCar.purchase_price * Math.max(0.1, (1 - totalDepRate)))
      setEstimatedPrice(estimated)
    }
  }, [selectedCar, rules])

  // 비용 자동 계산 로직
  useEffect(() => {
    const m_fin = finance?.monthly_payment || 0
    const m_ins = insurance?.total_premium ? Math.round(insurance.total_premium / 12) : 0
    const m_maint = costs.maintenance
    const total = m_fin + m_ins + m_maint

    setCosts(prev => ({ ...prev, monthly_finance: m_fin, monthly_insurance: m_ins, total_cost: total }))
  }, [selectedCar, finance, insurance, costs.maintenance])

  // 최종 금액 계산
  const final_rent_fee = costs.total_cost + margin
  const vat = Math.round(final_rent_fee * 0.1)
  const billing_amount = final_rent_fee + vat

  // 숫자 포맷 함수
  const f = (n: number) => n?.toLocaleString() || '0'
  const p = (v: string) => Number(v.replace(/,/g, ''))

  // --- 견적 저장 ---
  const handleSaveQuote = async () => {
    if (role === 'god_admin' && !adminSelectedCompanyId) return alert('⚠️ 회사를 먼저 선택해주세요.')
    if (!selectedCar) return alert('차량을 선택해주세요.')
    if (!selectedCustomerName) return alert('고객을 선택해주세요.')

    const { error } = await supabase.from('quotes').insert([{
        car_id: selectedCar.id,
        customer_name: selectedCustomerName,
        rental_type: '월렌트',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(new Date().setMonth(new Date().getMonth() + term)).toISOString().split('T')[0],
        deposit: deposit,
        rent_fee: final_rent_fee,
        status: 'active',
        company_id: effectiveCompanyId
    }])

    if (error) alert('저장 실패: ' + error.message)
    else {
        alert('✅ 견적서가 생성되었습니다!')
        router.push('/quotes')
    }
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-12 md:px-6 bg-gray-50/50 min-h-screen">
      <h1 className="text-3xl font-black text-gray-900 mb-8">🧮 스마트 렌탈료 계산기</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* --- 왼쪽: 설정 영역 --- */}
        <div className="lg:col-span-7 space-y-6">

          {/* 1. 고객 선택 */}
          <div className="bg-white p-6 rounded-3xl border shadow-sm">
            <label className="block text-sm font-bold text-gray-500 mb-2">고객 선택</label>
            <select
                className="w-full p-4 border border-gray-200 rounded-xl font-bold text-lg focus:border-steel-500 outline-none"
                value={selectedCustomerName}
                onChange={(e) => setSelectedCustomerName(e.target.value)}
            >
                <option value="">고객을 선택하세요</option>
                {customers.map(cust => (
                    <option key={cust.id} value={cust.name}>
                        {cust.name} ({cust.type}) - {cust.phone}
                    </option>
                ))}
            </select>
          </div>

          {/* 2. 차량 선택 */}
          <div className="bg-white p-6 rounded-3xl border shadow-sm">
            <label className="block text-sm font-bold text-gray-500 mb-2">대상 차량 선택</label>
            <select
                className="w-full p-4 border border-steel-100 rounded-xl font-bold text-lg bg-steel-50 focus:border-steel-500 outline-none"
                onChange={(e) => handleCarSelect(e.target.value)}
            >
                <option value="">차량을 선택하세요</option>
                {cars.map(car => (
                    <option key={car.id} value={car.id}>
                        [{car.number}] {car.brand} {car.model}
                    </option>
                ))}
            </select>

            {/* 선택된 차량 정보 & AI 시세 분석 */}
            {selectedCar && (
                <div className="mt-4 space-y-2">
                    <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-600 flex justify-between">
                        <span>매입가: <b>{f(selectedCar.purchase_price)}원</b></span>
                        <span>
                           연료: <b>{commonCodes.find(c => c.category === 'FUEL' && c.code === selectedCar.fuel)?.value || selectedCar.fuel}</b>
                        </span>
                    </div>

                    {/* 👇 [AI] 시스템 분석 결과 */}
                    <div className="p-4 bg-steel-50 border border-steel-100 rounded-xl flex justify-between items-center animate-pulse">
                      <div className="text-steel-800 text-sm">
                        <span className="font-bold">🤖 AI 시세 분석</span>
                        <span className="block text-xs text-steel-600 opacity-80">
                          연식감가 {(rules.DEP_YEAR * 100)}% + 주행감가 {(rules.DEP_MILEAGE_10K * 100)}% 적용
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-xs text-gray-500">적정 기준가</span>
                        <span className="font-black text-xl text-steel-600">{f(estimatedPrice)}원</span>
                      </div>
                    </div>
                </div>
            )}
          </div>

          {/* 3. 원가 분석 */}
          <div className="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
            <h3 className="font-bold text-gray-800 border-b pb-2">📊 월 지출 원가 (BEP)</h3>
            <div className="flex justify-between items-center"><span className="text-gray-500">🏦 월 할부금</span><span className="font-bold text-lg">{f(costs.monthly_finance)}원</span></div>
            <div className="flex justify-between items-center"><span className="text-gray-500">🛡️ 월 보험료</span><span className="font-bold text-lg">{f(costs.monthly_insurance)}원</span></div>
            <div className="flex justify-between items-center"><span className="text-gray-500">🔧 정비예비비</span><input className="w-24 text-right border-b font-bold" value={f(costs.maintenance)} onChange={e=>setCosts({...costs, maintenance: p(e.target.value)})}/></div>
            <div className="flex justify-between items-center pt-3 border-t border-dashed text-red-500"><span className="font-bold">🩸 총 원가</span><span className="font-black text-2xl">{f(costs.total_cost)}원</span></div>
          </div>

          {/* 4. 마진 설정 */}
          <div className="bg-steel-50/50 p-6 rounded-3xl border border-steel-200">
            <h3 className="font-bold text-steel-900 mb-4">💰 마진 설정</h3>
            <div className="flex items-center gap-4">
                <input type="text" className="w-full p-4 border border-steel-200 rounded-xl text-right font-black text-2xl text-steel-600 outline-none" value={f(margin)} onChange={(e) => setMargin(p(e.target.value))}/>
                <span className="font-bold text-gray-500 whitespace-nowrap">원 남기기</span>
            </div>
            <div className="mt-4 flex gap-2">
                {[50000, 100000, 200000, 300000].map(m => (
                    <button key={m} onClick={()=>setMargin(m)} className="flex-1 py-2 bg-white border border-steel-200 rounded-lg text-steel-600 font-bold hover:bg-steel-100">+{m/10000}만</button>
                ))}
            </div>
          </div>
        </div>

        {/* --- 오른쪽: 영수증 --- */}
        <div className="lg:col-span-5">
            <div className="bg-steel-950 text-white p-8 rounded-3xl shadow-2xl sticky top-10">
                <div className="text-center border-b border-gray-700 pb-6 mb-6">
                    <p className="text-gray-400 text-sm font-bold uppercase tracking-widest">Quotation</p>
                    <h2 className="text-3xl font-black mt-2">최종 견적서</h2>
                </div>
                <div className="space-y-6">
                    <div className="flex justify-between"><span className="text-gray-400">고객명</span><span className="font-bold text-yellow-400 text-lg">{selectedCustomerName || '미선택'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">계약 기간</span><select className="bg-gray-800 text-white font-bold rounded p-1" value={term} onChange={e=>setTerm(Number(e.target.value))}><option value={12}>12개월</option><option value={24}>24개월</option><option value={36}>36개월</option></select></div>
                    <div className="flex justify-between items-center"><span className="text-gray-400">보증금</span><input className="bg-transparent text-right font-bold text-white w-32 border-b border-gray-700" value={f(deposit)} onChange={e=>setDeposit(p(e.target.value))}/></div>
                    <div className="border-t border-gray-700 my-4"></div>
                    <div className="flex justify-between items-end"><span className="text-gray-300 font-bold">공급가액 (월)</span><span className="text-2xl font-bold">{f(final_rent_fee)}원</span></div>
                    <div className="flex justify-between items-end text-gray-400 text-sm"><span>부가세 (10%)</span><span>{f(vat)}원</span></div>
                    <div className="border-t border-gray-500 my-6"></div>
                    <div className="text-right">
                        <p className="text-sm text-yellow-400 font-bold mb-1">청구 금액 (VAT포함)</p>
                        <p className="text-5xl font-black tracking-tight">{f(billing_amount)}<span className="text-2xl ml-1">원</span></p>
                    </div>
                </div>
                <button onClick={handleSaveQuote} className="w-full bg-white text-black font-black py-5 rounded-2xl mt-8 hover:bg-gray-200 transition-colors text-lg">
                    이 견적 저장하기
                </button>
            </div>
        </div>

      </div>
    </div>
  )
}