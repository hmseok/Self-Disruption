'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/app/utils/supabase'
// 🔥 새로 만든 보험 컴포넌트 불러오기
import InsuranceTab from './InsuranceTab'
import FinanceTab from './FinanceTab'
import JiipTab from './JiipTab'

export default function CarDetailPage() {
  const { id } = useParams() // URL에서 id 가져오기
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('basic') // 탭 상태 관리

  // 차량 데이터 상태
  const [car, setCar] = useState<any>(null)

  // 1. 차량 데이터 불러오기
  useEffect(() => {
    const fetchCar = async () => {
      const { data, error } = await supabase
        .from('cars')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        alert('차량 정보를 불러오지 못했습니다.')
        router.push('/')
      } else {
        setCar(data)
      }
      setLoading(false)
    }
    fetchCar()
  }, [id, router])

  // 값 변경 핸들러
  const handleChange = (field: string, value: any) => {
    setCar((prev: any) => ({ ...prev, [field]: value }))
  }

  // 2. 수정 사항 저장 (Update)
  const handleUpdate = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('cars')
      .update({
        number: car.number,
        brand: car.brand,
        model: car.model,
        trim: car.trim,
        year: car.year,
        fuel: car.fuel,
        status: car.status,
        location: car.location,
        mileage: car.mileage,
        image_url: car.image_url,
        purchase_price: car.purchase_price,
        acq_date: car.acq_date
      })
      .eq('id', id)

    setSaving(false)
    if (error) alert('저장 실패: ' + error.message)
    else alert('✅ 수정사항이 저장되었습니다!')
  }

  // 3. 차량 삭제 (Delete)
  const handleDelete = async () => {
    if (!confirm('정말 삭제하시겠습니까? 연결된 보험/금융 정보도 모두 삭제됩니다.')) return

    const { error } = await supabase.from('cars').delete().eq('id', id)

    if (error) alert('삭제 실패: ' + error.message)
    else {
      alert('삭제되었습니다.')
      router.push('/')
    }
  }

  // 로딩 중일 때
  if (loading) return <div className="p-20 text-center font-bold text-gray-500">데이터 불러오는 중... ⏳</div>
  if (!car) return null

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in-up pb-20">

      {/* --- 상단 헤더 --- */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/')} className="bg-white px-4 py-2 border rounded-xl font-bold text-gray-500 hover:bg-gray-50">
            ← 목록으로
          </button>
          <div>
            <h2 className="text-3xl font-black text-gray-900 flex items-center gap-2">
              {car.number}
              <span className={`text-sm px-2 py-1 rounded-lg border font-bold ${
                car.status === 'available' ? 'bg-green-50 text-green-600 border-green-200' :
                car.status === 'rented' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-600'
              }`}>
                {car.status === 'available' ? '대기중' : car.status === 'rented' ? '대여중' : car.status}
              </span>
            </h2>
            <p className="text-gray-500 font-medium mt-1">{car.brand} {car.model} {car.trim}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDelete} className="px-4 py-2 border border-red-100 text-red-500 font-bold rounded-xl hover:bg-red-50">
            삭제
          </button>
          <button
            onClick={handleUpdate}
            disabled={saving}
            className="px-6 py-2 bg-indigo-900 text-white font-bold rounded-xl shadow-lg hover:bg-black transition-all"
          >
            {saving ? '저장 중...' : '💾 변경사항 저장'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* --- 좌측: 사진 및 위치 정보 --- */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-2 rounded-3xl shadow-sm border border-gray-200 aspect-video flex items-center justify-center bg-gray-50 overflow-hidden relative group">
            {car.image_url ? (
              <img src={car.image_url} alt="차량 사진" className="w-full h-full object-cover rounded-2xl" />
            ) : (
              <span className="text-gray-400 font-bold">사진 없음</span>
            )}
            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
               <input
                 className="w-full bg-white/90 px-3 py-2 text-xs rounded-lg shadow font-bold text-center"
                 placeholder="이미지 URL을 입력하세요"
                 value={car.image_url || ''}
                 onChange={e => handleChange('image_url', e.target.value)}
               />
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-400">현재 차고지 위치</label>
              <input className="w-full font-bold border-b py-1 focus:outline-none focus:border-blue-500 transition-colors" value={car.location || ''} onChange={e => handleChange('location', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400">차대번호 (VIN)</label>
              <input className="w-full font-bold border-b py-1 uppercase focus:outline-none focus:border-blue-500 transition-colors" value={car.vin || ''} onChange={e => handleChange('vin', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400">현재 주행거리 (km)</label>
              <input type="number" className="w-full font-bold border-b py-1 focus:outline-none focus:border-blue-500 transition-colors" value={car.mileage || 0} onChange={e => handleChange('mileage', Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* --- 우측: 탭 메뉴 및 상세 내용 --- */}
        <div className="lg:col-span-8 bg-white rounded-3xl shadow-sm border border-gray-200 min-h-[600px] flex flex-col">

          {/* 탭 헤더 */}
          <div className="flex border-b border-gray-100">
            {['basic', 'insurance', 'finance', 'jiip'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-5 font-bold capitalize transition-all border-b-2 ${
                  activeTab === tab
                    ? 'text-indigo-600 border-indigo-600 bg-indigo-50/30'
                    : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50'
                }`}
              >
                {tab === 'basic' ? '기본 정보' :
                 tab === 'insurance' ? '보험 계약' :
                 tab === 'finance' ? '금융/여신' : '지입/투자'}
              </button>
            ))}
          </div>

          {/* 탭 내용 영역 */}
          <div className="p-8 flex-1">

            {/* 1. 기본 정보 탭 */}
            {activeTab === 'basic' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">차량번호</label>
                    <input className="w-full p-3 border rounded-xl bg-gray-50" value={car.number} onChange={e => handleChange('number', e.target.value)} />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">상태 변경</label>
                    <select className="w-full p-3 border rounded-xl" value={car.status} onChange={e => handleChange('status', e.target.value)}>
                        <option value="available">대기중 (배차가능)</option>
                        <option value="rented">대여중</option>
                        <option value="maintenance">정비중</option>
                        <option value="accident">사고수리</option>
                        <option value="sold">매각완료</option>
                    </select>
                </div>
                <div><label className="text-xs font-bold text-gray-500 block mb-1">브랜드</label><input className="w-full p-3 border rounded-xl" value={car.brand} onChange={e => handleChange('brand', e.target.value)} /></div>
                <div><label className="text-xs font-bold text-gray-500 block mb-1">모델명</label><input className="w-full p-3 border rounded-xl" value={car.model} onChange={e => handleChange('model', e.target.value)} /></div>
                <div><label className="text-xs font-bold text-gray-500 block mb-1">트림</label><input className="w-full p-3 border rounded-xl" value={car.trim || ''} onChange={e => handleChange('trim', e.target.value)} /></div>
                <div><label className="text-xs font-bold text-gray-500 block mb-1">연식</label><input type="number" className="w-full p-3 border rounded-xl" value={car.year} onChange={e => handleChange('year', Number(e.target.value))} /></div>
                <div><label className="text-xs font-bold text-gray-500 block mb-1">취득가액 (원)</label><input className="w-full p-3 border rounded-xl text-right font-bold" value={car.purchase_price} onChange={e => handleChange('purchase_price', Number(e.target.value))} /></div>
                <div><label className="text-xs font-bold text-gray-500 block mb-1">취득일자</label><input type="date" className="w-full p-3 border rounded-xl" value={car.acq_date || ''} onChange={e => handleChange('acq_date', e.target.value)} /></div>
              </div>
            )}

            {/* 보험, 금융 탭 활성화 */}
                {activeTab === 'insurance' && <InsuranceTab carId={Number(id)} />}
                {activeTab === 'finance' && <FinanceTab carId={Number(id)} />}
                {activeTab === 'jiip' && <JiipTab carId={Number(id)} />}
            </div>
        </div>
      </div>
    </div>
  )
}