'use client'
import { supabase } from '../../utils/supabase'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../../context/AppContext'
import { CommonCode } from '@/types/database' // 타입 경로 확인해주세요

export default function CarRegisterForm() {
  const router = useRouter()
  const { company, role, adminSelectedCompanyId } = useApp()
  const effectiveCompanyId = role === 'admin' ? adminSelectedCompanyId : company?.id
  const [loading, setLoading] = useState(false)

  // 1. 공통 코드 담을 그릇
  const [commonCodes, setCommonCodes] = useState<CommonCode[]>([])

  // 2. 차량 정보 상태
  const [car, setCar] = useState({
    number: '',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    fuel: '',     // 공통코드 (GAS, DSL 등)
    color: '',    // 공통코드 (WHT, BLK 등)
    mission: '',  // 공통코드 (AUTO, MANUAL)
    mileage: 0,
    purchase_price: 0,
    is_used: false,           // 중고차 여부
    purchase_mileage: 0,      // 구입 시 주행거리 (km) — 중고차만 해당
    ownership_type: 'company' as string, // 소유구분: company/consignment/leased_in
  })

  // 3. 페이지 열리자마자 코드값(연료, 색상 등) 불러오기
  useEffect(() => {
    const fetchCodes = async () => {
      const { data } = await supabase
        .from('common_codes')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (data) setCommonCodes(data)
    }
    fetchCodes()
  }, [])

  // 코드를 그룹별로 걸러내는 도우미 함수
  const getCodes = (category: string) => commonCodes.filter(c => c.category === category)

  const handleSave = async () => {
    if (role === 'admin' && !adminSelectedCompanyId) return alert('⚠️ 회사를 먼저 선택해주세요.')
    if (!car.number || !car.model || !car.fuel) return alert('필수 정보를 입력해주세요.')

    setLoading(true)
    const { error } = await supabase.from('cars').insert([{
      ...car,
      status: 'available',
      company_id: effectiveCompanyId
    }])

    if (error) {
      alert('에러 발생: ' + error.message)
    } else {
      alert('✅ 차량이 등록되었습니다!')
      router.push('/cars') // 목록으로 이동
    }
    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow mt-10">
      <h2 className="text-2xl font-bold mb-6">🚗 신규 차량 등록</h2>

      <div className="space-y-4">
        {/* 차량 번호 & 브랜드 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700">차량 번호</label>
            <input
              className="w-full border p-3 rounded"
              placeholder="123가 4567"
              value={car.number}
              onChange={e => setCar({...car, number: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700">제조사 (브랜드)</label>
            <input
              className="w-full border p-3 rounded"
              placeholder="현대, BMW 등"
              value={car.brand}
              onChange={e => setCar({...car, brand: e.target.value})}
            />
          </div>
        </div>

        {/* 모델명 & 연식 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700">모델명</label>
            <input
              className="w-full border p-3 rounded"
              placeholder="그랜저, 520d"
              value={car.model}
              onChange={e => setCar({...car, model: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700">연식 (Year)</label>
            <input
              type="number"
              className="w-full border p-3 rounded"
              value={car.year}
              onChange={e => setCar({...car, year: Number(e.target.value)})}
            />
          </div>
        </div>

        {/* 🔥 여기가 핵심! 공통 코드로 만든 드롭다운들 */}
        <div className="grid grid-cols-3 gap-4">

          {/* 연료 선택 */}
          <div>
            <label className="block text-sm font-bold text-blue-700">연료</label>
            <select
              className="w-full border p-3 rounded bg-blue-50"
              value={car.fuel}
              onChange={e => setCar({...car, fuel: e.target.value})}
            >
              <option value="">선택</option>
              {getCodes('FUEL').map(code => (
                <option key={code.code} value={code.code}>{code.value}</option>
              ))}
            </select>
          </div>

          {/* 색상 선택 */}
          <div>
            <label className="block text-sm font-bold text-gray-700">색상</label>
            <select
              className="w-full border p-3 rounded"
              value={car.color}
              onChange={e => setCar({...car, color: e.target.value})}
            >
              <option value="">선택</option>
              {getCodes('COLOR').map(code => (
                <option key={code.code} value={code.code}>{code.value}</option>
              ))}
            </select>
          </div>

           {/* 변속기 선택 */}
           <div>
            <label className="block text-sm font-bold text-gray-700">변속기</label>
            <select
              className="w-full border p-3 rounded"
              value={car.mission}
              onChange={e => setCar({...car, mission: e.target.value})}
            >
              <option value="">선택</option>
              {getCodes('MISSION').map(code => (
                <option key={code.code} value={code.code}>{code.value}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 신차 / 중고차 구분 */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">차량 구분</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCar({...car, is_used: false, purchase_mileage: 0})}
              className={`flex-1 py-3 rounded-lg font-bold text-sm border-2 transition-all ${
                !car.is_used
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}
            >
              🆕 신차
            </button>
            <button
              type="button"
              onClick={() => setCar({...car, is_used: true})}
              className={`flex-1 py-3 rounded-lg font-bold text-sm border-2 transition-all ${
                car.is_used
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}
            >
              🔄 중고차
            </button>
          </div>
        </div>

        {/* 소유 구분 */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">소유 구분</label>
          <div className="flex gap-3">
            {[
              { value: 'company', label: '🏢 자사 보유', color: 'blue' },
              { value: 'consignment', label: '🤝 지입 차량', color: 'amber' },
              { value: 'leased_in', label: '📋 임차 차량', color: 'purple' },
            ].map(opt => (
              <button key={opt.value} type="button"
                onClick={() => setCar({...car, ownership_type: opt.value})}
                className={`flex-1 py-3 rounded-lg font-bold text-sm border-2 transition-all ${
                  car.ownership_type === opt.value
                    ? opt.color === 'blue' ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : opt.color === 'amber' ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
          {car.ownership_type !== 'company' && (
            <p className="text-xs text-amber-600 mt-2">💡 지입주 상세 정보는 차량 등록 후 [차량 상세 → 지입 관리] 탭에서 입력할 수 있습니다.</p>
          )}
        </div>

        {/* 주행거리 & 매입가 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700">현재 주행거리 (km)</label>
            <input
              type="number"
              className="w-full border p-3 rounded"
              value={car.mileage}
              onChange={e => setCar({...car, mileage: Number(e.target.value)})}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700">매입 가격 (원)</label>
            <input
              type="text"
              className="w-full border p-3 rounded font-bold text-right"
              value={car.purchase_price.toLocaleString()}
              onChange={e => {
                const val = Number(e.target.value.replace(/,/g, ''))
                setCar({...car, purchase_price: val})
              }}
            />
          </div>
        </div>

        {/* 중고차 전용: 구입 시 주행거리 */}
        {car.is_used && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <label className="block text-sm font-bold text-orange-700 mb-1">🔄 구입 시 주행거리 (km)</label>
            <p className="text-xs text-orange-600 mb-2">중고차 구입 당시의 주행거리 — 감가/주행 보정 계산에 사용됩니다</p>
            <input
              type="number"
              className="w-full border border-orange-300 p-3 rounded bg-white"
              placeholder="예: 35000"
              value={car.purchase_mileage || ''}
              onChange={e => setCar({...car, purchase_mileage: Number(e.target.value)})}
            />
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full bg-black text-white py-4 rounded-lg font-bold text-lg hover:bg-gray-800 transition mt-4"
        >
          {loading ? '저장 중...' : '차량 등록 완료'}
        </button>
      </div>
    </div>
  )
}