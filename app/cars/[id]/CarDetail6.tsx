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
  const [uploading, setUploading] = useState(false)
  const [searching, setSearching] = useState(false)
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

  // 📸 [직접 업로드] - 업로드 즉시 자동 저장
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return
    setUploading(true)
    try {
      const file = e.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `vehicles/${carId}_${Date.now()}.${fileExt}`

      const { error } = await supabase.storage.from('car_docs').upload(fileName, file)
      if (error) throw error

      const { data } = supabase.storage.from('car_docs').getPublicUrl(fileName)

      // 상태 업데이트
      handleChange('image_url', data.publicUrl)

      // 🚀 [자동 저장] 업로드 즉시 DB에 반영
      await supabase.from('cars').update({ image_url: data.publicUrl }).eq('id', carId)
      alert('사진이 등록되고 저장되었습니다.')

    } catch (error: any) { alert('업로드 실패: ' + error.message) }
    setUploading(false)
  }

  // ✨ [AI 자동 매칭] - 찾으면 즉시 자동 저장
  const handleAiImageSearch = async () => {
    if (!car.brand || !car.model) return alert("브랜드와 모델명이 입력되어 있어야 검색할 수 있습니다.")
    if(!confirm(`'${car.brand} ${car.model}'의 고화질 사진을 생성할까요?`)) return

    setSearching(true)
    try {
      const res = await fetch('/api/search-car-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: car.brand, model: car.model })
      })
      const result = await res.json()

      if (result.error) throw new Error(result.error)

      if (result.imageUrl) {
          handleChange('image_url', result.imageUrl)

          // 🚀 [핵심 수정] 찾자마자 바로 저장해버림! (나가도 유지됨)
          await supabase.from('cars').update({ image_url: result.imageUrl }).eq('id', carId)

          alert("✨ 사진이 적용되고 자동 저장되었습니다!")
      }
    } catch (error: any) {
      alert('AI 작업 실패: ' + error.message)
    } finally {
      setSearching(false)
    }
  }

  // 2. 전체 정보 수동 저장 (다른 텍스트 정보들용)
  const handleUpdate = async () => {
    setSaving(true)
    const { error } = await supabase.from('cars').update({
        number: car.number, brand: car.brand, model: car.model, trim: car.trim,
        year: car.year, fuel: car.fuel, status: car.status, location: car.location,
        mileage: car.mileage, image_url: car.image_url,
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
            <h2 className="text-3xl font-black text-gray-900 flex items-center gap-2">
              {car.number}
              <span className="text-sm px-2 py-1 rounded-lg border font-bold bg-gray-50 text-gray-600">{car.status}</span>
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

        {/* 좌측: 사진 영역 (수정됨) */}
        <div className="lg:col-span-4 space-y-6">
           {/* 🖼️ 이미지 컨테이너: overflow-hidden으로 이미지가 둥근 모서리를 넘지 않게 함 */}
           <div className="relative w-full aspect-video bg-gray-100 rounded-3xl shadow-sm border border-gray-200 overflow-hidden group">

            {/* 1. 차량 이미지 */}
            {car.image_url ? (
                <img src={car.image_url} className="w-full h-full object-cover" alt="차량 사진" />
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                    <span className="text-4xl mb-2">📷</span>
                    <span className="font-bold text-sm">사진 없음</span>
                </div>
            )}

            {/* 2. 로딩 오버레이 (작업 중일 때만 전체를 덮음) */}
            {(searching || uploading) && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20 text-white backdrop-blur-sm">
                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mb-3"></div>
                    <span className="font-bold animate-pulse text-sm">
                        {searching ? 'AI가 그리는 중...' : '저장 중...'}
                    </span>
                </div>
            )}

            {/* 3. 컨트롤 버튼 영역 (수정됨: 하단에 작게 배치) */}
            {/* 평소에는 숨겨져 있다가(opacity-0), 마우스 올리면(group-hover) 나타남 */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex justify-end gap-2 items-end z-10">

               {/* ✨ AI 매직 버튼 (작게 수정) */}
               <button
                  onClick={handleAiImageSearch}
                  disabled={searching}
                  className="bg-blue-600/90 hover:bg-blue-500 text-white text-xs px-3 py-2 rounded-lg font-bold shadow-lg backdrop-blur flex items-center gap-1 transition-transform hover:-translate-y-1"
                  title="AI가 고화질 사진을 자동으로 생성합니다"
               >
                  <span>✨ AI 생성</span>
               </button>

               {/* 📂 업로드 버튼 (작게 수정) */}
               <label className="cursor-pointer bg-white/90 hover:bg-white text-gray-800 text-xs px-3 py-2 rounded-lg font-bold shadow-lg backdrop-blur flex items-center gap-1 transition-transform hover:-translate-y-1">
                  <span>📂 변경</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading}/>
               </label>

            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-200 space-y-4">
            <div><label className="text-xs font-bold text-gray-400">차고지</label><input className="w-full font-bold border-b py-1 focus:outline-none focus:border-indigo-500" value={car.location || ''} onChange={e => handleChange('location', e.target.value)} /></div>
            <div><label className="text-xs font-bold text-gray-400">주행거리 (km)</label><input type="number" className="w-full font-bold border-b py-1 focus:outline-none focus:border-indigo-500" value={car.mileage || 0} onChange={e => handleChange('mileage', Number(e.target.value))} /></div>
          </div>
        </div>

        {/* 우측: 탭 메뉴 및 상세 내용 (기존 동일) */}
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
             {/* 탭 내용들 */}
             {activeTab === 'basic' && (
               <div className="flex flex-col items-center justify-center h-full py-10 animate-fade-in">
                 <div className="bg-gray-100 p-6 rounded-full mb-4"><span className="text-4xl">🚙</span></div>
                 <h3 className="text-xl font-bold text-gray-800 mb-2">차량 제원 및 등록증</h3>
                 <button onClick={() => router.push(`/registration/${carId}`)} className="bg-black text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-gray-800 transition-transform hover:-translate-y-1 mt-4">등록증 상세 페이지로 이동 →</button>
               </div>
             )}
             {activeTab === 'insurance' && (
              <div className="flex flex-col items-center justify-center h-full py-10 animate-fade-in">
                <div className="bg-green-50 p-6 rounded-full mb-4"><span className="text-4xl">🛡️</span></div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">보험 이력 관리</h3>
                <button onClick={() => router.push(`/insurance/${carId}`)} className="bg-green-600 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-green-700 transition-transform hover:-translate-y-1 mt-4">보험 상세 페이지로 이동 →</button>
              </div>
            )}
             {/* ... 나머지 탭들 ... */}
          </div>
        </div>
      </div>
    </div>
  )
}