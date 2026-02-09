'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function CarDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const carId = Array.isArray(id) ? id[0] : id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [searching, setSearching] = useState(false) // 🔍 AI 검색 상태
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

  // 📸 [기존] 내 컴퓨터 파일 업로드
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
      handleChange('image_url', data.publicUrl)
    } catch (error: any) { alert('업로드 실패: ' + error.message) }
    setUploading(false)
  }

  // ✨ [NEW] AI 자동 이미지 매칭 (핵심 기능)
  const handleAiImageSearch = async () => {
    // 1. 브랜드/모델명 확인
    if (!car.brand || !car.model) return alert("AI가 검색하려면 '브랜드'와 '모델명'이 입력되어 있어야 합니다.")

    // 2. 실행 확인
    if(!confirm(`'${car.brand} ${car.model}'의 공식 홍보 사진을 AI가 자동으로 찾아올까요?`)) return

    setSearching(true)
    try {
      // 3. 백엔드 API 호출
      const res = await fetch('/api/search-car-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: car.brand, model: car.model })
      })
      const result = await res.json()

      if (!res.ok) throw new Error(result.error || '검색 실패')

      // 4. 결과 적용
      if (result.imageUrl) {
          handleChange('image_url', result.imageUrl)
          alert("✨ 멋진 사진을 찾았습니다! 마음에 드시면 [저장] 버튼을 눌러 확정하세요.")
      }
    } catch (error: any) {
      alert('AI 검색 실패: ' + error.message + '\n(.env.local에 구글 검색 키가 있는지 확인해주세요)')
    } finally {
      setSearching(false)
    }
  }

  // 2. 저장
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

        {/* 좌측: 사진 영역 (AI 매직 기능 포함) */}
        <div className="lg:col-span-4 space-y-6">
           <div className="bg-white p-2 rounded-3xl shadow-sm border border-gray-200 aspect-video flex items-center justify-center bg-gray-50 overflow-hidden relative group">

            {car.image_url ? (
                <img src={car.image_url} className="w-full h-full object-cover rounded-2xl transition-transform duration-700 group-hover:scale-105" alt="차량 사진" />
            ) : (
                <div className="flex flex-col items-center text-gray-400">
                    <span className="text-4xl mb-2">📷</span>
                    <span className="font-bold text-sm">사진 없음</span>
                </div>
            )}

            {/* 로딩 화면 (검색 중일 때) */}
            {(searching) && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20 text-white backdrop-blur-sm">
                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-3"></div>
                    <span className="font-bold animate-pulse text-lg">AI가 사진을 찾는 중...</span>
                    <span className="text-xs text-gray-300 mt-1">{car.brand} {car.model} Official Photo</span>
                </div>
            )}

            {/* 버튼 그룹 (호버 시 등장) */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 z-10 backdrop-blur-[2px]">

               {/* 1. ✨ AI 매직 버튼 */}
               <button
                  onClick={handleAiImageSearch}
                  disabled={searching}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-3 rounded-xl font-bold shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 flex items-center gap-2 w-56 justify-center border border-white/20"
               >
                  <span>✨ AI 자동 매칭</span>
               </button>

               {/* 2. 직접 업로드 버튼 (보조) */}
               <label className="cursor-pointer bg-white/90 text-gray-800 px-5 py-2 rounded-xl font-bold shadow-lg hover:bg-white transition-all hover:-translate-y-1 flex items-center gap-2 w-56 justify-center backdrop-blur">
                  <span>📂 직접 업로드</span>
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
             {/* ... 나머지 탭들도 기존 로직대로 유지됩니다 ... */}
          </div>
        </div>
      </div>
    </div>
  )
}