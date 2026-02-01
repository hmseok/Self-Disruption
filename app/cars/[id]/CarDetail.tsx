'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../utils/supabase'

export default function CarDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const carId = Array.isArray(id) ? id[0] : id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')
  const [car, setCar] = useState<any>(null)

  // 1. 차량 데이터 불러오기
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

  const handleChange = (field: string, value: any) => {
    setCar((prev: any) => ({ ...prev, [field]: value }))
  }

  // 2. 저장
  const handleUpdate = async () => {
    setSaving(true)
    const { error } = await supabase.from('cars').update({
        number: car.number, brand: car.brand, model: car.model, trim: car.trim,
        year: car.year, fuel: car.fuel, status: car.status, location: car.location,
        mileage: car.mileage,
        purchase_price: car.purchase_price, acq_date: car.acq_date
      }).eq('id', carId)
    setSaving(false)
    if (error) alert('저장 실패: ' + error.message)
    else alert('✅ 저장되었습니다!')
  }

  // 3. 삭제
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
            <p className="text-gray-500 font-medium text-sm mt-0.5">관리번호: {car.id}</p>
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

        {/* 좌측: 요약 정보 카드 (사진 대신 들어간 부분) */}
        <div className="lg:col-span-4 space-y-6">

           {/* 1. 번호판 & 상태 요약 카드 */}
           <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
              {/* 배경 장식 */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>

              <div className="flex justify-between items-start mb-8">
                <div>
                   <p className="text-gray-400 text-xs font-bold mb-1">Vehicle No.</p>
                   {/* 실제 번호판 스타일 디자인 */}
                   <div className="bg-white text-black px-4 py-2 rounded-lg border-2 border-black inline-block shadow-lg">
                      <span className="text-2xl font-black tracking-widest">{car.number}</span>
                   </div>
                </div>
                {/* QR코드 (더미) */}
                <div className="bg-white p-2 rounded-lg">
                   <div className="w-12 h-12 bg-gray-900 opacity-20"></div>
                   {/* 실제 QR 라이브러리 연동 시 여기에 넣으면 됩니다 */}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm">
                    <p className="text-gray-400 text-xs font-bold">모델명</p>
                    <p className="text-lg font-bold truncate">{car.brand} {car.model}</p>
                    <p className="text-xs text-gray-500">{car.trim || '-'}</p>
                 </div>
                 <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm">
                    <p className="text-gray-400 text-xs font-bold">주행거리</p>
                    <p className="text-lg font-bold">{car.mileage?.toLocaleString()} km</p>
                    <p className="text-xs text-green-400">▲ 정상 운행</p>
                 </div>
              </div>
           </div>

           {/* 2. 주요 일정 알림 (D-Day) */}
           <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                 📅 주요 일정 알림
              </h3>
              <div className="space-y-4">
                 <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                       <div className="w-2 h-2 rounded-full bg-green-500"></div>
                       <span className="text-sm font-medium text-gray-600">자동차 보험 만료</span>
                    </div>
                    <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded">D-120</span>
                 </div>
                 <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                       <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                       <span className="text-sm font-medium text-gray-600">정기 검사 일정</span>
                    </div>
                    <span className="text-xs font-bold bg-yellow-100 text-yellow-700 px-2 py-1 rounded">D-45</span>
                 </div>
                 <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                       <div className="w-2 h-2 rounded-full bg-red-500"></div>
                       <span className="text-sm font-medium text-gray-600">엔진오일 교환</span>
                    </div>
                    <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded">교체 필요</span>
                 </div>
              </div>
           </div>

           {/* 3. 차고지 정보 (기존 유지) */}
           <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
             <div>
                <label className="text-xs font-bold text-gray-400">현재 차고지</label>
                <input className="w-full font-bold border-b py-2 mt-1 focus:outline-none focus:border-indigo-500 text-sm"
                  value={car.location || ''}
                  onChange={e => handleChange('location', e.target.value)}
                  placeholder="위치 정보 입력"
                />
             </div>
           </div>
        </div>

        {/* 우측: 탭 메뉴 및 상세 내용 (기존 유지) */}
        <div className="lg:col-span-8 bg-white rounded-3xl shadow-sm border border-gray-200 min-h-[600px] flex flex-col">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {['basic', 'insurance', 'finance', 'jiip', 'invest'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-5 font-bold capitalize transition-all border-b-2 whitespace-nowrap px-4 ${
                  activeTab === tab ? 'text-indigo-600 border-indigo-600 bg-indigo-50/30' : 'text-gray-400 border-transparent hover:text-gray-600'
                }`}
              >
                {tab === 'basic' && '📋 기본 정보'}
                {tab === 'insurance' && '🛡️ 보험 이력'}
                {tab === 'finance' && '💰 금융/여신'}
                {tab === 'jiip' && '🤝 지입 관리'}
                {tab === 'invest' && '📈 투자 관리'}
              </button>
            ))}
          </div>

          <div className="p-8 flex-1">
             {/* 탭 내용들 (기존과 동일하게 유지) */}
             {activeTab === 'basic' && (
               <div className="flex flex-col items-center justify-center h-full py-10 animate-fade-in">
                 <div className="bg-gray-100 p-6 rounded-full mb-4"><span className="text-4xl">🚙</span></div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">차량 제원 및 등록증</h3>
                 <p className="text-gray-400 mb-6 text-center text-sm">자동차등록증 상의 제원 정보와 원본 파일을 관리합니다.</p>
                 <button onClick={() => router.push(`/registration/${carId}`)} className="bg-black text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-gray-800 transition-transform hover:-translate-y-1">등록증 상세 페이지로 이동 →</button>
               </div>
             )}
             {activeTab === 'insurance' && (
              <div className="flex flex-col items-center justify-center h-full py-10 animate-fade-in">
                <div className="bg-green-50 p-6 rounded-full mb-4"><span className="text-4xl">🛡️</span></div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">보험 이력 관리</h3>
                <button onClick={() => router.push(`/insurance/${carId}`)} className="bg-green-600 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-green-700 transition-transform hover:-translate-y-1 mt-4">보험 상세 페이지로 이동 →</button>
              </div>
            )}
             {/* ... 나머지 탭들도 그대로 둡니다 ... */}
          </div>
        </div>
      </div>
    </div>
  )
}