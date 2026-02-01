'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../utils/supabase' // 혹시 경로 에러나면 ../../utils/supabase 로 바꿔보세요
import InsuranceTab from './InsuranceTab'
import FinanceTab from './FinanceTab'
import JiipTab from './JiipTab'

export default function CarDetailPage() {
  const { id } = useParams()
  const router = useRouter()

  // 👇 [핵심 수정] ID가 배열로 들어올 때를 대비해 안전하게 문자열로 변환
  // (이 변수를 아래 탭들에 넘겨줄 겁니다)
  const carId = Array.isArray(id) ? id[0] : id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')
  const [car, setCar] = useState<any>(null)

  // 1. 차량 데이터 불러오기
  useEffect(() => {
    if (!carId) return

    const fetchCar = async () => {
      // 숫자 변환 없이 문자열(UUID) 그대로 조회
      const { data, error } = await supabase
        .from('cars')
        .select('*')
        .eq('id', carId)
        .single()

      if (error) {
        alert('차량 정보를 불러오지 못했습니다.')
        router.push('/cars')
      } else {
        setCar(data)
      }
      setLoading(false)
    }
    fetchCar()
  }, [carId, router])

  // 값 변경 핸들러
  const handleChange = (field: string, value: any) => {
    setCar((prev: any) => ({ ...prev, [field]: value }))
  }

  // 2. 수정 사항 저장
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
      .eq('id', carId) // 여기도 carId 사용

    setSaving(false)
    if (error) alert('저장 실패: ' + error.message)
    else alert('✅ 수정사항이 저장되었습니다!')
  }

  // 3. 삭제
  const handleDelete = async () => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    const { error } = await supabase.from('cars').delete().eq('id', carId)
    if (error) alert('삭제 실패: ' + error.message)
    else {
      alert('삭제되었습니다.')
      router.push('/cars')
    }
  }

  if (loading) return <div className="p-20 text-center">로딩 중... ⏳</div>
  if (!car) return null

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in-up pb-20">

      {/* 헤더 영역 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/cars')} className="bg-white px-4 py-2 border rounded-xl font-bold text-gray-500 hover:bg-gray-50">← 목록</button>
          <div>
            <h2 className="text-3xl font-black text-gray-900 flex items-center gap-2">
              {car.number}
              <span className="text-sm px-2 py-1 rounded-lg border font-bold bg-gray-50 text-gray-600">
                {car.status}
              </span>
            </h2>
            <p className="text-gray-500 font-medium mt-1">{car.brand} {car.model}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDelete} className="px-4 py-2 border border-red-100 text-red-500 font-bold rounded-xl hover:bg-red-50">삭제</button>
          <button onClick={handleUpdate} disabled={saving} className="px-6 py-2 bg-indigo-900 text-white font-bold rounded-xl shadow-lg hover:bg-black transition-all">
            {saving ? '저장 중...' : '💾 저장'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* 좌측: 사진 및 기본 정보 */}
        <div className="lg:col-span-4 space-y-6">
           <div className="bg-white p-2 rounded-3xl shadow-sm border border-gray-200 aspect-video flex items-center justify-center bg-gray-50 overflow-hidden relative group">
            {car.image_url ? <img src={car.image_url} className="w-full h-full object-cover rounded-2xl" /> : <span className="text-gray-400 font-bold">사진 없음</span>}
            <div className="absolute inset-x-0 bottom-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
               <input className="w-full bg-white/90 px-3 py-2 text-xs rounded-lg shadow font-bold text-center" placeholder="이미지 URL 입력" value={car.image_url || ''} onChange={e => handleChange('image_url', e.target.value)} />
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 space-y-4">
            <div><label className="text-xs font-bold text-gray-400">차고지</label><input className="w-full font-bold border-b py-1" value={car.location || ''} onChange={e => handleChange('location', e.target.value)} /></div>
            <div><label className="text-xs font-bold text-gray-400">주행거리</label><input type="number" className="w-full font-bold border-b py-1" value={car.mileage || 0} onChange={e => handleChange('mileage', Number(e.target.value))} /></div>
          </div>
        </div>

        {/* 우측: 탭 메뉴 및 상세 내용 */}
        <div className="lg:col-span-8 bg-white rounded-3xl shadow-sm border border-gray-200 min-h-[600px] flex flex-col">

          {/* 탭 버튼 */}
          <div className="flex border-b border-gray-100">
            {['basic', 'insurance', 'finance', 'jiip'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-5 font-bold capitalize transition-all border-b-2 ${
                  activeTab === tab ? 'text-indigo-600 border-indigo-600 bg-indigo-50/30' : 'text-gray-400 border-transparent hover:text-gray-600'
                }`}
              >
                {tab === 'basic' && '📋 기본 정보'}
                {tab === 'insurance' && '🛡️ 보험 이력'}
                {tab === 'finance' && '💰 금융/여신'}
                {tab === 'jiip' && '🤝 지입/투자'}
              </button>
            ))}
          </div>

          {/* 탭 내용 */}
          <div className="p-8 flex-1">
            {activeTab === 'basic' && (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                  <div><label className="text-xs font-bold text-gray-500">차량번호</label><input className="w-full p-3 border rounded-xl" value={car.number} onChange={e => handleChange('number', e.target.value)} /></div>
                  <div><label className="text-xs font-bold text-gray-500">상태</label><select className="w-full p-3 border rounded-xl" value={car.status} onChange={e => handleChange('status', e.target.value)}><option value="available">대기중</option><option value="rented">대여중</option></select></div>
                  <div><label className="text-xs font-bold text-gray-500">모델명</label><input className="w-full p-3 border rounded-xl" value={car.model} onChange={e => handleChange('model', e.target.value)} /></div>
                  <div><label className="text-xs font-bold text-gray-500">연식</label><input type="number" className="w-full p-3 border rounded-xl" value={car.year} onChange={e => handleChange('year', Number(e.target.value))} /></div>
                  <div><label className="text-xs font-bold text-gray-500">매입가</label><input className="w-full p-3 border rounded-xl" value={car.purchase_price} onChange={e => handleChange('purchase_price', Number(e.target.value))} /></div>
               </div>
            )}

            {/* 👇 여기서 carId 변수를 그대로 넘겨줍니다 (Number() 쓰지 마세요!) */}
            {activeTab === 'insurance' && <InsuranceTab carId={carId} />}
            {activeTab === 'finance' && <FinanceTab carId={carId} />}
            {activeTab === 'jiip' && <JiipTab carId={carId} />}
          </div>
        </div>
      </div>
    </div>
  )
}