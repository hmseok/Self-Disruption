'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useDaumPostcodePopup } from 'react-daum-postcode'

// 🛠️ 유틸리티
const normalizeModelName = (name: string) => {
  if (!name) return '';
  return name.replace(/\s+/g, '').toUpperCase();
}
const cleanDate = (dateStr: any) => {
  if (!dateStr) return null;
  const nums = String(dateStr).replace(/[^0-9]/g, '');
  if (nums.length === 8) return `${nums.slice(0, 4)}-${nums.slice(4, 6)}-${nums.slice(6, 8)}`;
  return null;
}
const cleanNumber = (numStr: any) => {
  if (!numStr) return 0;
  return Number(String(numStr).replace(/[^0-9]/g, '')) || 0;
}

export default function RegistrationDetailPage() {
  const { id } = useParams()
  const carId = Array.isArray(id) ? id[0] : id
  const router = useRouter()
  const open = useDaumPostcodePopup('https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js')

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isImageModalOpen, setIsImageModalOpen] = useState(false)

  const [car, setCar] = useState<any>({
    number: '', model: '', brand: '', vin: '', owner_name: '',
    registration_date: '', location: '', capacity: '', displacement: '',
    fuel_type: '', inspection_end_date: '', vehicle_age_expiry: '',
    purchase_price: 0, registration_image_url: '', notes: '',
    model_code: ''
  })

  const [trims, setTrims] = useState<any[]>([])
  const [selectedTrimId, setSelectedTrimId] = useState<string>('')

  // 1. 초기 로딩
  useEffect(() => {
    if (!carId) return
    fetchCarData()
  }, [carId])

  // 2. 모델명 변경 시 DB 조회 (단, AI 분석 직후에는 실행 안 되게 막을 수도 있음)
  useEffect(() => {
    if (car.model && trims.length === 0) { // 트림이 비어있을 때만 DB에서 찾아봄
        fetchTrimsForModel(car.model)
    }
  }, [car.model])

  const fetchCarData = async () => {
    try {
        const { data, error } = await supabase.from('cars').select('*').eq('id', carId).single()
        if (error || !data) { alert("데이터 로딩 실패"); router.push('/registration'); return; }

        setCar({
          ...data,
          purchase_price: data.purchase_price || 0,
          registration_date: cleanDate(data.registration_date),
          inspection_end_date: cleanDate(data.inspection_end_date),
          vehicle_age_expiry: cleanDate(data.vehicle_age_expiry),
        })
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  // DB에서 트림 찾기 (기존 데이터용)
  const fetchTrimsForModel = async (modelName: string) => {
    const cleanName = normalizeModelName(modelName)
    if (!cleanName) return;

    const { data: modelData } = await supabase
        .from('car_code_models')
        .select('id')
        .or(`model_name.ilike.%${modelName}%, normalized_name.eq.${cleanName}`)
        .limit(1)
        .maybeSingle()

    if (modelData) {
        const { data: trimData } = await supabase
            .from('car_code_trims')
            .select('*')
            .eq('model_id', modelData.id)
            .order('price', { ascending: true })

        if (trimData) setTrims(trimData)
    }
  }

  const handleChange = (field: string, value: any) => {
    setCar((prev: any) => ({ ...prev, [field]: value }))
  }

  const handleComplete = (data: any) => {
    let fullAddress = data.address
    let extraAddress = ''
    if (data.addressType === 'R') {
      if (data.bname !== '') extraAddress += data.bname
      if (data.buildingName !== '') extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName)
      fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '')
    }
    setCar((prev: any) => ({ ...prev, location: fullAddress }))
  }

  // 🚀 [AI 재분석] 트림 정보 즉시 적용
  const handleReanalyze = async () => {
    if (!car.registration_image_url) return alert('이미지가 없습니다.')

    setUploading(true)
    setIsAnalyzing(true)

    try {
        // 이미지를 다시 다운로드해서 base64로 변환 (서버에 있는 이미지 활용)
        const response = await fetch(car.registration_image_url);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.readAsDataURL(blob);

        reader.onload = async () => {
            const base64 = reader.result

            // AI 분석 요청
            const aiRes = await fetch('/api/ocr-registration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64 })
            })
            const result = await aiRes.json()

            if (!result.error) {
                console.log("🔍 AI 분석 결과:", result);
                const detectedModel = result.model_name || car.model;
                const detectedYear = result.year || new Date().getFullYear();

                // 🔥 [핵심] AI가 준 트림을 화면에 즉시 반영 (DB 저장 기다리지 않음)
                if (result.trims && result.trims.length > 0) {
                    // 화면 표시용 임시 ID 부여
                    const uiTrims = result.trims.map((t: any, idx: number) => ({
                        id: `temp_${idx}`,
                        trim_name: t.name,
                        price: t.price || 0
                    }));
                    setTrims(uiTrims);
                    alert(`✅ [${detectedModel}] 트림 ${result.trims.length}개를 찾았습니다!`);
                } else {
                    alert("⚠️ AI가 트림 정보를 찾지 못했습니다.");
                }

                // 💾 [백그라운드] DB에 영구 저장 (Upsert)
                const { data: modelData } = await supabase
                    .from('car_code_models')
                    .upsert(
                        { brand: '기타', model_name: detectedModel, year: detectedYear, normalized_name: normalizeModelName(detectedModel) },
                        { onConflict: 'model_name, year' }
                    )
                    .select().single();

                if (modelData && result.trims?.length > 0) {
                    const trimsToInsert = result.trims.map((t: any) => ({
                        model_id: modelData.id,
                        trim_name: t.name,
                        price: t.price || 0
                    }));
                    await supabase.from('car_code_trims').insert(trimsToInsert);
                }

                // 화면 갱신
                setCar((prev: any) => ({
                    ...prev,
                    model: detectedModel,
                    purchase_price: cleanNumber(result.purchase_price) || prev.purchase_price,
                    // 기타 정보 업데이트...
                }))
            }
        }
    } catch (e: any) {
        alert("분석 실패: " + e.message);
    } finally {
        setUploading(false)
        setIsAnalyzing(false)
    }
  }

  const handleSave = async () => {
    let finalModelName = car.model;
    if (selectedTrimId) {
        const trim = trims.find(t => String(t.id) === String(selectedTrimId));
        if (trim && !car.model.includes(trim.trim_name)) {
            finalModelName = `${car.model} ${trim.trim_name}`;
        }
    }

    const { error } = await supabase.from('cars').update({
        ...car,
        model: finalModelName,
        purchase_price: cleanNumber(car.purchase_price),
        registration_date: cleanDate(car.registration_date),
        inspection_end_date: cleanDate(car.inspection_end_date),
        vehicle_age_expiry: cleanDate(car.vehicle_age_expiry)
    }).eq('id', carId)

    if (error) alert('저장 실패: ' + error.message)
    else { alert('✅ 저장되었습니다!'); window.location.reload(); }
  }

  const f = (n: any) => Number(n || 0).toLocaleString()
  if (loading) return <div className="p-10 text-center font-bold">로딩 중...</div>

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 bg-gray-50 min-h-screen flex gap-8">
      <div className="flex-1 space-y-6">
        <div className="flex justify-between items-center">
            <div><h1 className="text-3xl font-black">{car.number}</h1><p className="text-gray-500">{car.model}</p></div>
            <div className="flex gap-2"><button onClick={() => router.push('/registration')} className="bg-white border px-4 py-2 rounded-lg font-bold">목록</button><button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">저장하기</button></div>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border relative">
             {isAnalyzing && (
                <div className="absolute inset-0 bg-white/90 z-20 flex flex-col items-center justify-center rounded-2xl">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
                    <p className="text-xl font-bold text-blue-600">AI가 트림 정보를 수집 중입니다...</p>
                </div>
            )}

            <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-blue-800 flex items-center"><span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center mr-2">A</span>차종 및 트림 선택</h3>
                    {/* 👇 AI 재분석 버튼 (트림 없을 때 유용) */}
                    <button onClick={handleReanalyze} className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full font-bold hover:bg-blue-700">🔄 AI 정보 갱신</button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-blue-600 mb-1 block">차종 (AI)</label>
                        <input className="w-full p-3 bg-white border border-blue-200 rounded-lg font-bold text-lg" value={car.model} readOnly />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">상세 트림 선택</label>
                        <select
                            className="w-full p-3 bg-white border rounded-lg font-bold"
                            value={selectedTrimId}
                            onChange={(e) => setSelectedTrimId(e.target.value)}
                            disabled={trims.length === 0}
                        >
                            <option value="">{trims.length > 0 ? '▼ 트림을 선택하세요' : '(트림 정보 없음 - AI 갱신 필요)'}</option>
                            {trims.map((t: any) => (
                                <option key={t.id} value={t.id}>{t.trim_name} (+{f(t.price)}원)</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* 나머지 기본 정보 영역 (동일) */}
            <div className="mb-8">
                <h3 className="font-bold text-gray-800 mb-4">기본 정보</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="label">차량번호</label><input className="input" value={car.number} onChange={e=>handleChange('number', e.target.value)} /></div>
                    <div><label className="label">소유자</label><input className="input" value={car.owner_name} onChange={e=>handleChange('owner_name', e.target.value)} /></div>
                    <div className="col-span-2">
                         <label className="label">사용본거지</label>
                         <div className="flex gap-2">
                            <input className="input flex-1" value={car.location} readOnly />
                            <button onClick={()=>open({onComplete: handleComplete})} className="bg-gray-800 text-white px-4 rounded-lg text-sm font-bold">주소 검색</button>
                         </div>
                    </div>
                    <div><label className="label">최초등록일</label><input type="date" className="input" value={car.registration_date || ''} onChange={e=>handleChange('registration_date', e.target.value)} /></div>
                    <div><label className="label">차대번호</label><input className="input font-mono" value={car.vin} onChange={e=>handleChange('vin', e.target.value)} /></div>
                </div>
            </div>
            {/* 제원 정보 등 생략 (위와 동일) */}
             <div className="bg-red-50 p-6 rounded-xl border border-red-100">
                <h3 className="font-bold text-red-800 mb-4">제원 및 유효기간</h3>
                <div className="grid grid-cols-2 gap-6 mb-6">
                    <div><label className="text-xs font-bold text-red-800 mb-1 block">검사유효기간 만료일</label><input type="date" className="w-full p-3 bg-white border border-red-200 rounded-lg font-bold text-red-600" value={car.inspection_end_date || ''} onChange={e=>handleChange('inspection_end_date', e.target.value)} /></div>
                    <div><label className="text-xs font-bold text-red-800 mb-1 block">차령 만료일</label><input type="date" className="w-full p-3 bg-white border border-red-200 rounded-lg font-bold text-red-600" value={car.vehicle_age_expiry || ''} onChange={e=>handleChange('vehicle_age_expiry', e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                     <div><label className="label">연료</label><input className="input" value={car.fuel_type} onChange={e=>handleChange('fuel_type', e.target.value)}/></div>
                     <div><label className="label">배기량</label><input className="input text-right" value={car.displacement} onChange={e=>handleChange('displacement', e.target.value)}/></div>
                     <div><label className="label">승차정원</label><input className="input text-right" value={car.capacity} onChange={e=>handleChange('capacity', e.target.value)}/></div>
                </div>
                <div className="mt-4"><label className="label">취득가액</label><input className="input text-right text-lg text-blue-600" value={f(car.purchase_price)} onChange={e=>handleChange('purchase_price', e.target.value.replace(/,/g, ''))}/></div>
            </div>

            <div className="mt-8"><label className="label">비고</label><textarea className="w-full h-24 p-4 border rounded-xl resize-none" value={car.notes} onChange={e=>handleChange('notes', e.target.value)}></textarea></div>
        </div>
      </div>

      <div className="w-[400px]">
        <div className="sticky top-6">
             <div className="bg-white p-4 rounded-2xl shadow-sm border mb-4">
                <h3 className="font-bold text-gray-800 mb-4">등록증 이미지</h3>
                <div
                    className="aspect-[1/1.4] bg-gray-100 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-90 transition-opacity relative group"
                    onClick={() => car.registration_image_url && setIsImageModalOpen(true)}
                >
                    {car.registration_image_url ? (
                        <>
                            <img src={car.registration_image_url} className="w-full h-full object-contain" />
                            <div className="absolute inset-0 bg-black/30 hidden group-hover:flex items-center justify-center text-white font-bold">🔍 클릭하여 확대</div>
                        </>
                    ) : <span className="text-gray-400">이미지 없음</span>}
                </div>
            </div>
            {/* 재업로드 버튼 제거됨 */}
        </div>
      </div>

       {isImageModalOpen && car.registration_image_url && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setIsImageModalOpen(false)}>
            <div className="relative max-w-5xl max-h-[90vh] w-full h-full flex items-center justify-center">
                <img src={car.registration_image_url} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
                <button className="absolute top-4 right-4 text-white text-4xl font-bold hover:text-gray-300">&times;</button>
            </div>
        </div>
      )}

      <style jsx>{`
        .label { display: block; font-size: 0.75rem; font-weight: 700; color: #6b7280; margin-bottom: 0.25rem; }
        .input { width: 100%; padding: 0.75rem; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0.5rem; font-weight: 700; }
      `}</style>
    </div>
  )
}