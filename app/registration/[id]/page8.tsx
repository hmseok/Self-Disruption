'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../utils/supabase'
import { useDaumPostcodePopup } from 'react-daum-postcode'

// 🛠️ 유틸리티 함수: 정규화 (공백/특수문자 제거) - 파일 내부에 포함시킴
const normalizeModelName = (name: string) => {
  if (!name) return '';
  return name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9가-힣]/g, '').toUpperCase();
}

export default function RegistrationPage() {
  const { id } = useParams()
  const carId = Array.isArray(id) ? id[0] : id
  const router = useRouter()
  const open = useDaumPostcodePopup('https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js')

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // 데이터 State
  const [car, setCar] = useState({
    number: '', model: '', brand: '', vin: '', owner_name: '',
    registration_date: '', location: '', capacity: '', displacement: '',
    fuel_type: '', inspection_end_date: '', vehicle_age_expiry: '',
    purchase_price: 0, registration_image_url: '', notes: '',
    model_code: ''
  })

  // 트림 선택용 가상 데이터
  const [trims, setTrims] = useState<string[]>([])
  const [selectedTrim, setSelectedTrim] = useState('')

  useEffect(() => {
    if (!carId) return
    const fetchData = async () => {
      const { data, error } = await supabase.from('cars').select('*').eq('id', carId).single()
      if (error || !data) {
        alert("차량 정보를 불러오지 못했습니다.")
        router.push('/registration')
        return
      }
      setCar({
        ...data,
        fuel_type: data.fuel_type || '미확인',
        location: data.location || '',
        capacity: data.capacity || '',
        displacement: data.displacement || '',
        vehicle_age_expiry: data.vehicle_age_expiry || '',
        notes: data.notes || '',
        purchase_price: data.purchase_price || 0,
        model_code: data.model_code || ''
      })
      setLoading(false)
    }
    fetchData()
  }, [carId, router])

  const handleChange = (field: string, value: any) => {
    setCar(prev => ({ ...prev, [field]: value }))
  }

  // 주소 검색
  const handleComplete = (data: any) => {
    let fullAddress = data.address
    let extraAddress = ''
    if (data.addressType === 'R') {
      if (data.bname !== '') extraAddress += data.bname
      if (data.buildingName !== '') extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName)
      fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '')
    }
    setCar(prev => ({ ...prev, location: fullAddress }))
  }
  const handleAddressSearch = () => { open({ onComplete: handleComplete }) }

  // 🤖 파일 업로드 및 AI 분석
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return

      const file = e.target.files[0]
      setUploading(true)
      setIsAnalyzing(true)

      try {
        const fileExt = file.name.split('.').pop()
        const fileName = `${carId}_registration_${Date.now()}.${fileExt}`
        const filePath = `registration/${fileName}`

        // 1. 파일 업로드
        const uploadPromise = supabase.storage.from('car_docs').upload(filePath, file, { upsert: true })

        const reader = new FileReader()
        reader.readAsDataURL(file)

        reader.onload = async () => {
          const base64 = reader.result
          const ocrResponse = await fetch('/api/ocr-registration', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: base64 })
          })
          const ocrData = await ocrResponse.json()

          if (!ocrData.error) {
              console.log("🔍 AI 원본 데이터:", ocrData); // 브라우저 콘솔 확인용

              // 🚀 [핵심 수정] 1. 일단 화면부터 갱신합니다! (에러가 나도 이건 보이게)
              setCar(prev => ({
                  ...prev,
                  number: ocrData.number || prev.number,
                  model: ocrData.model || prev.model,
                  vin: ocrData.vin || prev.vin,
                  owner_name: ocrData.owner_name || prev.owner_name,
                  registration_date: ocrData.registration_date || prev.registration_date,
                  location: ocrData.location || prev.location, // 주소
                  capacity: ocrData.capacity || prev.capacity,
                  displacement: ocrData.displacement || prev.displacement,
                  fuel_type: ocrData.fuel_type || prev.fuel_type,
                  inspection_end_date: ocrData.inspection_end_date || prev.inspection_end_date,
                  vehicle_age_expiry: ocrData.vehicle_age_expiry || prev.vehicle_age_expiry,
                  purchase_price: ocrData.purchase_price || prev.purchase_price,
                  notes: ocrData.notes || prev.notes,
              }))

              setTrims(['프레스티지', '노블레스', '시그니처', 'GT-Line'])
              alert(`🤖 분석 완료!\n[${ocrData.model}] 정보를 찾았습니다.`)

              // 🛠️ 2. 그 다음 뒷단에서 조용히 코드를 생성합니다. (try-catch로 감싸서 에러 무시)
              try {
                  if (ocrData.model) {
                      let finalModelCode = ''
                      const cleanName = normalizeModelName(ocrData.model)

                      const { data: existingModel } = await supabase
                          .from('vehicle_model_codes')
                          .select('*')
                          .eq('normalized_name', cleanName)
                          .single()

                      if (existingModel) {
                          finalModelCode = existingModel.code
                      } else {
                          const newCode = `MDL-${Date.now().toString().slice(-6)}`
                          await supabase.from('vehicle_model_codes').insert({
                                  brand: '미확인',
                                  model_name: ocrData.model,
                                  normalized_name: cleanName,
                                  code: newCode
                          })
                          finalModelCode = newCode
                      }
                      // 코드가 생성되었으면 state에 반영
                      if (finalModelCode) {
                          setCar(prev => ({ ...prev, model_code: finalModelCode }))
                      }
                  }
              } catch (dbError) {
                  console.error("⚠️ 차종 코드 생성 중 오류 (화면 표시는 성공):", dbError)
              }
          }

          const { error: uploadError } = await uploadPromise
          if (!uploadError) {
              const { data } = supabase.storage.from('car_docs').getPublicUrl(filePath)
              await supabase.from('cars').update({ registration_image_url: data.publicUrl }).eq('id', carId)
              setCar(prev => ({ ...prev, registration_image_url: data.publicUrl }))
          }
        }
      } catch (error) {
        console.error("🔥 전체 로직 에러:", error);
        alert('오류 발생: 다시 시도해주세요.')
      } finally {
        setUploading(false)
        setIsAnalyzing(false)
      }
    }

  const handleSave = async () => {
    const { error } = await supabase.from('cars').update({
        ...car,
        purchase_price: Number(car.purchase_price) || 0,
    }).eq('id', carId)

    if (error) alert('저장 실패: ' + error.message)
    else { alert('✅ 저장되었습니다!'); window.location.reload(); }
  }

  const f = (n: any) => Number(n || 0).toLocaleString()
  if (loading) return <div className="p-10 text-center font-bold">로딩 중...</div>

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900">{car.number || '차량번호'}</h1>
          <p className="text-gray-500 font-medium">{car.model} {selectedTrim && ` - ${selectedTrim}`}</p>
        </div>
        <div className="flex gap-2">
            <button onClick={() => router.push(`/registration`)} className="bg-white border text-gray-600 px-4 py-2 rounded-lg font-bold">목록</button>
            <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-md hover:bg-blue-700">저장하기</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-6">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 relative">
                {isAnalyzing && (
                    <div className="absolute inset-0 bg-white/80 z-20 flex flex-col items-center justify-center rounded-2xl backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
                        <p className="text-xl font-bold text-blue-600">AI 정밀 분석 및 코드 생성 중...</p>
                    </div>
                )}

                {/* 차종 정보 섹션 */}
                <div className="mb-8 bg-blue-50 p-6 rounded-xl border border-blue-100">
                    <h3 className="text-lg font-bold text-blue-800 mb-4 flex items-center">
                        <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs mr-2">A</span>
                        차종 및 트림 선택 (자동인식)
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-blue-600 mb-1 block">차종 (AI 인식)</label>
                            <input className="w-full p-3 bg-white border border-blue-200 rounded-lg font-bold text-lg text-blue-900" value={car.model || ''} readOnly placeholder="AI가 자동 입력" />
                            {car.model_code && <p className="text-xs text-blue-500 mt-1">🏷️ 관리코드: {car.model_code}</p>}
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">상세 트림 (선택)</label>
                            <select
                                className="w-full p-3 bg-white border rounded-lg font-bold text-gray-700"
                                value={selectedTrim}
                                onChange={(e) => setSelectedTrim(e.target.value)}
                                disabled={!car.model}
                            >
                                <option value="">트림을 선택하세요</option>
                                {trims.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="mb-8">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">기본 정보</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-gray-500 mb-1 block">차량번호</label><input className="w-full p-3 bg-gray-50 border rounded-lg font-bold text-lg" value={car.number || ''} onChange={e => handleChange('number', e.target.value)} /></div>
                        <div><label className="text-xs font-bold text-gray-500 mb-1 block">소유자</label><input className="w-full p-3 bg-gray-50 border rounded-lg font-bold" value={car.owner_name || ''} onChange={e => handleChange('owner_name', e.target.value)} /></div>

                        <div className="col-span-2">
                            <label className="text-xs font-bold text-gray-500 mb-1 block">사용본거지 (주소)</label>
                            <div className="flex gap-2">
                                <input className="flex-1 p-3 bg-gray-50 border rounded-lg font-bold" value={car.location || ''} readOnly placeholder="AI가 주소를 읽어옵니다" />
                                <button onClick={handleAddressSearch} className="bg-gray-800 text-white px-4 rounded-lg text-sm font-bold">검색</button>
                            </div>
                        </div>

                        <div><label className="text-xs font-bold text-gray-500 mb-1 block">최초등록일</label><input type="date" className="w-full p-3 bg-gray-50 border rounded-lg font-bold" value={car.registration_date || ''} onChange={e => handleChange('registration_date', e.target.value)} /></div>
                        <div><label className="text-xs font-bold text-gray-500 mb-1 block">차대번호</label><input className="w-full p-3 bg-gray-50 border rounded-lg font-mono text-sm" value={car.vin || ''} onChange={e => handleChange('vin', e.target.value)} /></div>
                    </div>
                </div>

                <div className="mb-8">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">제원 정보</h3>
                    <div className="grid grid-cols-3 gap-4">
                        <div><label className="text-xs font-bold text-gray-500 mb-1 block">연료</label><input className="w-full p-3 bg-gray-50 border rounded-lg font-bold" value={car.fuel_type || ''} onChange={e => handleChange('fuel_type', e.target.value)} /></div>
                        <div><label className="text-xs font-bold text-gray-500 mb-1 block">배기량</label><input className="w-full p-3 bg-gray-50 border rounded-lg font-bold text-right" value={car.displacement || ''} onChange={e => handleChange('displacement', e.target.value)} /></div>
                        <div><label className="text-xs font-bold text-gray-500 mb-1 block">승차정원</label><input className="w-full p-3 bg-gray-50 border rounded-lg font-bold text-right" value={car.capacity || ''} onChange={e => handleChange('capacity', e.target.value)} /></div>
                    </div>
                </div>

                <div className="bg-red-50 p-6 rounded-xl border border-red-100 grid grid-cols-2 gap-6">
                    <div>
                        <label className="text-xs font-bold text-red-800 mb-1 block">검사유효기간 만료일</label>
                        <input type="date" className="w-full p-3 bg-white border border-red-200 rounded-lg font-bold text-red-900" value={car.inspection_end_date || ''} onChange={e => handleChange('inspection_end_date', e.target.value)} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-red-800 mb-1 block">차령 만료일 (영업용)</label>
                        <input type="date" className="w-full p-3 bg-white border border-red-200 rounded-lg font-bold text-red-900" value={car.vehicle_age_expiry || ''} onChange={e => handleChange('vehicle_age_expiry', e.target.value)} />
                    </div>
                    <div className="col-span-2">
                        <label className="text-xs font-bold text-gray-600 mb-1 block">취득가액</label>
                        <input className="w-full p-3 bg-white border border-red-200 rounded-lg font-bold text-right" value={f(car.purchase_price)} onChange={e => handleChange('purchase_price', e.target.value.replace(/,/g, ''))} />
                    </div>
                </div>
            </div>
        </div>

        <div className="lg:col-span-5">
            <div className="sticky top-6">
                 <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-4">
                    <h3 className="font-bold text-gray-800 mb-4">등록증 이미지</h3>
                    <div className="aspect-[1/1.4] bg-gray-100 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden">
                        {car.registration_image_url ? <img src={car.registration_image_url} className="w-full h-full object-contain" /> : <span className="text-gray-400">이미지 없음</span>}
                    </div>
                 </div>
                 <label className={`block w-full py-4 rounded-xl font-bold text-center text-lg shadow-lg cursor-pointer transition-all ${uploading ? 'bg-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                    {uploading ? 'AI 분석 및 코드 생성 중...' : '📸 등록증 인식 (AI)'}
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={uploading} />
                 </label>
            </div>
        </div>
      </div>
    </div>
  )
}