'use client'
import { supabase } from '../../utils/supabase'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useDaumPostcodePopup } from 'react-daum-postcode'

// --- [UI 아이콘] ---
const Icons = {
  Back: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
  Save: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>,
  Refresh: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  Car: () => <svg className="w-5 h-5 text-steel-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-8l-7 7-7-7" /></svg>,
  Upload: () => <svg className="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>,
  File: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Check: () => <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
}

// PDF 여부 판별
const isPdfUrl = (url: string) => url?.toLowerCase().includes('.pdf')

// 유틸리티
const cleanDate = (dateStr: any) => {
  if (!dateStr) return null;
  const nums = String(dateStr).replace(/[^0-9]/g, '');
  return nums.length === 8 ? `${nums.slice(0, 4)}-${nums.slice(4, 6)}-${nums.slice(6, 8)}` : null;
}
const cleanNumber = (numStr: any) => Number(String(numStr).replace(/[^0-9]/g, '')) || 0;
const f = (n: any) => Number(n || 0).toLocaleString()

export default function RegistrationDetailPage() {
  const { id } = useParams()
  const carId = Array.isArray(id) ? id[0] : id
  const router = useRouter()
  const open = useDaumPostcodePopup('https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js')

  const [loading, setLoading] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isImageModalOpen, setIsImageModalOpen] = useState(false)
  const regFileRef = useRef<HTMLInputElement>(null)

  // 파일 업로드 핸들러
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return
    const file = e.target.files[0]
    const fileExt = file.name.split('.').pop()
    const fileName = `registration/${carId}_${Date.now()}.${fileExt}`

    const { error } = await supabase.storage.from('car_docs').upload(fileName, file)
    if (error) return alert('업로드 실패: ' + error.message)

    const { data } = supabase.storage.from('car_docs').getPublicUrl(fileName)
    setCar((prev: any) => ({ ...prev, registration_image_url: data.publicUrl }))
    if (carId) await supabase.from('cars').update({ registration_image_url: data.publicUrl }).eq('id', carId)
    alert('업로드 완료')
  }

  // ESC 키로 이미지 모달 닫기
  useEffect(() => {
    if (!isImageModalOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsImageModalOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isImageModalOpen])

  const [car, setCar] = useState<any>({})
  const [trims, setTrims] = useState<any[]>([])
  const [selectedTrimId, setSelectedTrimId] = useState<string>('')
  const [baseModelName, setBaseModelName] = useState('') // "EV4" 같은 순수 모델명 저장
  const [vinLoading, setVinLoading] = useState(false)
  const [vinResult, setVinResult] = useState<any>(null)

  useEffect(() => {
    if (carId) fetchCarData()
  }, [carId])

  // 초기 로딩 시 모델명 분석하여 트림 찾기
  useEffect(() => {
    if (car.model) {
        findBaseModelAndTrims(car.model);
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
          notes: data.notes || '',
        })
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  // 🔍 [핵심 1] 역추적 검색: "EV4 어스" -> "EV4"를 찾아내고 트림 목록 로드
  const findBaseModelAndTrims = async (fullName: string) => {
      let currentName = fullName.trim();
      let foundTrims: any[] = [];
      let foundModelName = "";

      // 모델명 뒤에서부터 단어를 하나씩 빼면서 DB 매칭 시도
      while (currentName.length > 0) {
          const { data } = await supabase
              .from('vehicle_standard_codes')
              .select('*')
              .ilike('model_name', currentName)
              .order('price', { ascending: true });

          if (data && data.length > 0) {
              foundTrims = data;
              foundModelName = currentName;
              break;
          }

          const lastSpace = currentName.lastIndexOf(' ');
          if (lastSpace === -1) break;
          currentName = currentName.substring(0, lastSpace);
      }

      if (foundTrims.length > 0) {
          setTrims(foundTrims);
          setBaseModelName(foundModelName);

          // 이미 저장된 트림이 있다면 자동 선택
          // 예: fullName이 "EV4 어스"이고 트림목록에 "어스"가 있으면 선택
          const matchedTrim = foundTrims.find(t => fullName.includes(t.trim_name));
          if (matchedTrim) {
              setSelectedTrimId(String(matchedTrim.id));
          } else {
              setSelectedTrimId(''); // 매칭 안되면 초기화
          }
      } else {
          setTrims([]);
          setBaseModelName(fullName); // 못 찾으면 전체 이름을 베이스로
      }
  }

  // 💾 [핵심 2] 저장 로직 수정 (재조립 방식)
  const handleSave = async () => {
    // 1. 기준 모델명 확보 (없으면 현재 모델명 사용)
    const rootModelName = baseModelName || car.model;
    let finalModelName = rootModelName;

    // 2. 선택된 트림이 있다면 "모델명 + 트림명"으로 깔끔하게 결합
    if (selectedTrimId) {
        const trim = trims.find(t => String(t.id) === String(selectedTrimId));
        if (trim) {
            // 중복 방지를 위해 그냥 합칩니다. (EV4 + 어스 = EV4 어스)
            finalModelName = `${rootModelName} ${trim.trim_name}`;
        }
    }

    // 3. DB 업데이트
    const { error } = await supabase.from('cars').update({
        ...car,
        model: finalModelName, // 완성된 이름 저장
        purchase_price: cleanNumber(car.purchase_price),
        registration_date: cleanDate(car.registration_date),
        inspection_end_date: cleanDate(car.inspection_end_date),
        vehicle_age_expiry: cleanDate(car.vehicle_age_expiry)
    }).eq('id', carId)

    if (error) {
        alert('저장 실패: ' + error.message);
    } else {
        alert('✅ 저장되었습니다.');
        // 상태 업데이트하여 화면 즉시 반영
        setCar((prev:any) => ({...prev, model: finalModelName}));
        // 변경된 이름으로 다시 트림 매칭 (선택값 유지 확인용)
        findBaseModelAndTrims(finalModelName);
    }
  }

  // AI 정보 갱신
  const handleReanalyze = async () => {
    if (!car.registration_image_url) return alert('이미지가 없습니다.')
    setIsAnalyzing(true);

    try {
        const response = await fetch(car.registration_image_url);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.readAsDataURL(blob);

        reader.onload = async () => {
            const base64 = reader.result
            const aiRes = await fetch('/api/ocr-registration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64 })
            })
            const result = await aiRes.json()

            if (!result.error) {
                const detectedModel = result.model_name || car.model;
                const detectedYear = result.year || new Date().getFullYear();

                // 통합 테이블 갱신
                if (detectedModel !== '미확인 모델' && result.trims?.length > 0) {
                    await supabase.from('vehicle_standard_codes')
                      .delete().eq('model_name', detectedModel).eq('year', detectedYear);

                    const rowsToInsert = result.trims.map((t: any) => ({
                        brand: '기타',
                        model_name: detectedModel,
                        year: detectedYear,
                        trim_name: t.name,
                        price: t.price || 0,
                        fuel_type: result.fuel_type || '기타'
                    }));
                    await supabase.from('vehicle_standard_codes').insert(rowsToInsert);
                }

                // 화면 갱신
                setCar((prev:any) => ({...prev, model: detectedModel}))
                alert(`✅ [${detectedModel}] 트림 정보를 갱신했습니다.`);
                findBaseModelAndTrims(detectedModel);
            }
        }
    } catch (e: any) { alert("오류: " + e.message); }
    finally { setIsAnalyzing(false); }
  }

  // VIN으로 차량 정보 자동조회 (NHTSA API)
  const handleVinLookup = async () => {
    const vin = car.vin?.trim()
    if (!vin || vin.length < 11) { alert('차대번호가 11자 이상이어야 합니다.'); return }
    setVinLoading(true)
    setVinResult(null)
    try {
      const res = await fetch(`/api/vin-decode?vin=${encodeURIComponent(vin)}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setVinResult(data)

      // 조회 결과로 자동 반영 (빈 필드만)
      const updates: any = {}
      if (data.model && !car.model) updates.model = data.model
      if (data.make && (!car.brand || car.brand === '기타')) updates.brand = data.make
      if (data.fuel_type && !car.fuel_type) updates.fuel_type = data.fuel_type
      if (data.displacement && !car.displacement) updates.displacement = data.displacement + 'cc'
      if (data.year && !car.year) updates.year = Number(data.year)

      if (Object.keys(updates).length > 0) {
        setCar((prev: any) => ({ ...prev, ...updates }))
      }

      // 모델명으로 트림 검색 시도
      if (data.model) {
        findBaseModelAndTrims(data.model)
      }
    } catch (err: any) {
      alert('VIN 조회 실패: ' + err.message)
    } finally {
      setVinLoading(false)
    }
  }

  const handleChange = (field: string, value: any) => { setCar((prev: any) => ({ ...prev, [field]: value })) }
  const handleAddressComplete = (data: any) => {
    let fullAddress = data.address;
    let extraAddress = '';
    if (data.addressType === 'R') {
      if (data.bname !== '') extraAddress += data.bname;
      if (data.buildingName !== '') extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName);
      fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '');
    }
    setCar((prev: any) => ({ ...prev, location: fullAddress }));
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">데이터 로딩 중...</div>

  return (
    <div className="min-h-screen bg-gray-50/50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* 헤더 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-4">
                <button onClick={() => router.push('/registration')} className="bg-gray-100 p-3 rounded-xl text-gray-500 hover:text-black hover:bg-gray-200 transition-all">
                    <Icons.Back />
                </button>
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">{car.number}</h1>
                    <p className="text-gray-500 font-medium mt-1">{baseModelName || car.model}</p>
                </div>
            </div>
            <button onClick={handleSave} className="flex items-center gap-2 bg-steel-700 text-white px-8 py-4 rounded-xl font-bold hover:bg-steel-800 shadow-lg hover:shadow-xl transition-all">
                <Icons.Save /> <span>저장하기</span>
            </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* 좌측 폼 영역 */}
            <div className="lg:col-span-7 space-y-6">
                {/* 트림 선택 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 relative overflow-hidden">
                    {isAnalyzing && (
                        <div className="absolute inset-0 bg-white/80 z-10 flex flex-col items-center justify-center backdrop-blur-sm">
                            <div className="animate-spin rounded-full h-10 w-10 border-4 border-steel-600 border-t-transparent mb-3"></div>
                            <span className="text-steel-600 font-bold animate-pulse">AI 분석 중...</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 border-b pb-2 w-full"><span className="w-1 h-5 bg-steel-600 rounded-full"></span>차종 및 트림 정보</h2>
                        <button onClick={handleReanalyze} className="flex items-center gap-1.5 text-xs bg-steel-50 text-steel-700 px-3 py-1.5 rounded-lg font-bold hover:bg-steel-100 transition-colors"><Icons.Refresh /> AI 정보 갱신</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">모델명 (자동인식)</label>
                            <div className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-700 flex items-center gap-2"><Icons.Car /> {baseModelName || car.model}</div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-steel-600 mb-1.5 uppercase">상세 트림 선택</label>
                            <select
                                className="w-full p-4 bg-white border border-gray-200 rounded-xl font-bold text-gray-800 focus:border-steel-500 outline-none transition-all cursor-pointer"
                                value={selectedTrimId}
                                onChange={(e) => setSelectedTrimId(e.target.value)}
                            >
                                <option value="">{trims.length > 0 ? '▼ 트림을 선택하세요' : '(트림 정보 없음)'}</option>
                                {trims.map((t: any) => (
                                    <option key={t.id} value={t.id}>{t.trim_name} {t.year ? `(${t.year}년)` : ''} (+{f(t.price)}원)</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* 기본 정보 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2"><span className="w-1 h-5 bg-steel-600 rounded-full"></span> 기본 정보</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div><label className="label">차량번호</label><input className="input" value={car.number || ''} onChange={e=>handleChange('number', e.target.value)} /></div>
                        <div><label className="label">소유자</label><input className="input" value={car.owner_name || ''} onChange={e=>handleChange('owner_name', e.target.value)} /></div>
                        <div className="md:col-span-2"><label className="label">사용본거지</label><div className="flex gap-2"><input className="input flex-1 bg-gray-50" value={car.location || ''} readOnly /><button onClick={()=>open({onComplete: handleAddressComplete})} className="bg-steel-600 text-white px-5 rounded-xl text-sm font-bold hover:bg-steel-700">주소검색</button></div></div>
                        <div><label className="label">최초등록일</label><input type="date" className="input" value={car.registration_date || ''} onChange={e=>handleChange('registration_date', e.target.value)} /></div>
                        <div>
                            <label className="label">차대번호</label>
                            <div className="flex gap-2">
                                <input className="input font-mono flex-1" value={car.vin || ''} onChange={e=>handleChange('vin', e.target.value)} />
                                <button
                                    onClick={handleVinLookup}
                                    disabled={vinLoading || !car.vin}
                                    className="bg-steel-600 text-white px-4 rounded-xl text-xs font-bold hover:bg-steel-700 transition-colors disabled:opacity-40 whitespace-nowrap"
                                >
                                    {vinLoading ? '조회중...' : 'VIN 조회'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* VIN 조회 결과 */}
                    {vinResult && (
                        <div className="mt-5 p-4 bg-steel-50 rounded-xl border border-steel-100">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-xs font-bold text-steel-700 uppercase">VIN 조회 결과 (NHTSA)</h4>
                                <button onClick={() => setVinResult(null)} className="text-xs text-gray-400 hover:text-gray-600">&times; 닫기</button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                                {vinResult.make && <div><span className="text-xs text-gray-400 block">제조사</span><span className="font-bold text-gray-800">{vinResult.make}</span></div>}
                                {vinResult.model && <div><span className="text-xs text-gray-400 block">모델</span><span className="font-bold text-gray-800">{vinResult.model}</span></div>}
                                {vinResult.year && <div><span className="text-xs text-gray-400 block">연식</span><span className="font-bold text-gray-800">{vinResult.year}년</span></div>}
                                {vinResult.trim && <div><span className="text-xs text-gray-400 block">트림</span><span className="font-bold text-steel-700">{vinResult.trim}</span></div>}
                                {vinResult.fuel_type && <div><span className="text-xs text-gray-400 block">연료</span><span className="font-bold text-gray-800">{vinResult.fuel_type}</span></div>}
                                {vinResult.displacement && <div><span className="text-xs text-gray-400 block">배기량</span><span className="font-bold text-gray-800">{vinResult.displacement}L</span></div>}
                                {vinResult.body_class && <div><span className="text-xs text-gray-400 block">차체</span><span className="font-bold text-gray-800">{vinResult.body_class}</span></div>}
                                {vinResult.drive_type && <div><span className="text-xs text-gray-400 block">구동</span><span className="font-bold text-gray-800">{vinResult.drive_type}</span></div>}
                                {vinResult.plant_country && <div><span className="text-xs text-gray-400 block">생산국</span><span className="font-bold text-gray-800">{vinResult.plant_country}</span></div>}
                            </div>
                            {vinResult.trim && (
                                <button
                                    onClick={() => {
                                        const fullModel = vinResult.trim ? `${vinResult.model} ${vinResult.trim}` : vinResult.model
                                        setCar((prev: any) => ({ ...prev, model: fullModel, brand: vinResult.make || prev.brand }))
                                        findBaseModelAndTrims(fullModel)
                                        alert(`✅ 모델명이 "${fullModel}"(으)로 설정되었습니다.`)
                                    }}
                                    className="mt-3 w-full py-2 bg-steel-600 text-white rounded-lg text-sm font-bold hover:bg-steel-700 transition-colors"
                                >
                                    트림 정보 적용 → {vinResult.model} {vinResult.trim}
                                </button>
                            )}
                            {!vinResult.make && !vinResult.model && (
                                <p className="text-xs text-gray-400 mt-2">이 VIN에 대한 정보가 NHTSA에 등록되어 있지 않습니다.</p>
                            )}
                        </div>
                    )}
                </div>

                {/* 제원 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2"><span className="w-1 h-5 bg-steel-600 rounded-full"></span> 제원 및 유효기간</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                        <div><label className="label text-red-500">검사유효기간 만료일</label><input type="date" className="input border-red-100 text-red-600 bg-red-50/50" value={car.inspection_end_date || ''} onChange={e=>handleChange('inspection_end_date', e.target.value)} /></div>
                        <div><label className="label text-red-500">차령 만료일</label><input type="date" className="input border-red-100 text-red-600 bg-red-50/50" value={car.vehicle_age_expiry || ''} onChange={e=>handleChange('vehicle_age_expiry', e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                         <div><label className="label">연료</label><input className="input" value={car.fuel_type || ''} onChange={e=>handleChange('fuel_type', e.target.value)}/></div>
                         <div><label className="label">배기량</label><input className="input text-right" value={car.displacement || ''} onChange={e=>handleChange('displacement', e.target.value)}/></div>
                         <div><label className="label">승차정원</label><input className="input text-right" value={car.capacity || ''} onChange={e=>handleChange('capacity', e.target.value)}/></div>
                    </div>
                    <div className="mt-5"><label className="label">취득가액</label><input className="input text-right text-xl font-black text-steel-600" value={f(car.purchase_price)} onChange={e=>handleChange('purchase_price', e.target.value.replace(/,/g, ''))}/></div>
                </div>

                {/* 비고 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <label className="label mb-2 block">비고</label>
                    <textarea className="w-full h-32 p-4 bg-gray-50 border border-gray-200 rounded-xl resize-none outline-none" value={car.notes || ''} onChange={e=>handleChange('notes', e.target.value)}></textarea>
                </div>
            </div>

            {/* 우측: Sticky 파일 뷰어 섹션 */}
            <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-6 h-fit">
                    {/* 등록증 이미지 */}
                    {(() => {
                      const url = car.registration_image_url
                      const isPdf = url && isPdfUrl(url)
                      return (
                        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-steel-500"></span>
                                    🚗 등록증
                                </h3>
                                <div className="flex items-center gap-2">
                                    {url && <Icons.Check />}
                                    <button onClick={() => regFileRef.current?.click()} className="text-xs text-steel-600 bg-steel-50 px-2.5 py-1 rounded-lg font-bold hover:bg-steel-100 transition-colors">
                                        {url ? '재업로드' : '업로드'}
                                    </button>
                                    <input ref={regFileRef} type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} />
                                </div>
                            </div>
                            <div
                                onClick={() => url && setIsImageModalOpen(true)}
                                className={`aspect-[1/1.4] bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden ${url ? 'cursor-pointer group hover:border-steel-400' : ''} transition-colors relative`}
                            >
                                {url ? (
                                    isPdf ? (
                                        <>
                                            <div className="flex flex-col items-center text-gray-500">
                                                <Icons.File />
                                                <p className="text-xs font-bold mt-2">PDF 문서</p>
                                                <p className="text-xs text-gray-400 mt-1">클릭하여 보기</p>
                                            </div>
                                            <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="bg-white text-gray-800 px-4 py-2 rounded-full font-bold shadow-lg text-sm">🔍 크게 보기</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <img src={url} className="w-full h-full object-contain" alt="등록증" />
                                            <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="bg-white text-gray-800 px-4 py-2 rounded-full font-bold shadow-lg text-sm">🔍 크게 보기</span>
                                            </div>
                                        </>
                                    )
                                ) : (
                                    <div className="text-gray-400 flex flex-col items-center cursor-pointer" onClick={() => regFileRef.current?.click()}>
                                        <Icons.Upload />
                                        <p className="text-xs mt-2 font-medium">클릭하여 파일 업로드</p>
                                    </div>
                                )}
                            </div>
                        </div>
                      )
                    })()}
            </div>
        </div>
      </div>

      {isImageModalOpen && car.registration_image_url && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setIsImageModalOpen(false)}>
            <img src={car.registration_image_url} className="max-w-full max-h-[95vh] rounded-lg shadow-2xl" />
        </div>
      )}

      <style jsx>{`
        .label { display: block; font-size: 0.75rem; font-weight: 800; color: #9ca3af; margin-bottom: 0.4rem; text-transform: uppercase; }
        .input { width: 100%; padding: 0.875rem; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0.75rem; font-weight: 700; transition: all 0.2s; }
        .input:focus { background-color: #ffffff; border-color: #1e3a4c; outline: none; box-shadow: 0 0 0 3px rgba(30, 58, 76, 0.1); }
      `}</style>
    </div>
  )
}