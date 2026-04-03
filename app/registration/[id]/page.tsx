'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useDaumPostcodePopup } from 'react-daum-postcode'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/firebase')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

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

    // GCS upload
    const uploadFormData = new FormData()
    uploadFormData.append('file', file)
    uploadFormData.append('folder', 'car_docs')
    const { Authorization } = await getAuthHeader()
    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      headers: Authorization ? { Authorization } : {},
      body: uploadFormData,
    })
    const uploadJson = await uploadRes.json()
    if (!uploadRes.ok) return alert('업로드 실패: ' + uploadJson.error)

    const publicUrl = uploadJson.url || ''
    setCar((prev: any) => ({ ...prev, registration_image_url: publicUrl }))
    if (carId) {
      const authHeaders = await getAuthHeader()
      await fetch(`/api/cars/${carId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ registration_image_url: publicUrl }),
      })
    }
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

  // 💰 비용 관리 상태
  const [costs, setCosts] = useState<any[]>([])
  const [costsLoading, setCostsLoading] = useState(false)
  const [showCostDetail, setShowCostDetail] = useState(false)
  const [newCostItem, setNewCostItem] = useState({ category: '차량', item_name: '', amount: 0, notes: '' })

  // 💰 자금조달 (대출 연동) 상태
  const [linkedLoans, setLinkedLoans] = useState<any[]>([])

  // 기본 비용 항목 템플릿 — 신차 / 중고차 분리
  const newCarCostItems = [
    { category: '차량', item_name: '차량 출고가 (취득가액)', sort_order: 1 },
    { category: '세금', item_name: '취득세', sort_order: 2 },
    { category: '세금', item_name: '공채 할인비', sort_order: 3 },
    { category: '등록', item_name: '등록비', sort_order: 4 },
    { category: '등록', item_name: '번호판 비용', sort_order: 5 },
    { category: '보험', item_name: '보험료 (초기)', sort_order: 6 },
    { category: '기타', item_name: '탁송비', sort_order: 7 },
  ]

  const usedCarCostItems = [
    { category: '차량', item_name: '차량 매입가', sort_order: 1 },
    { category: '세금', item_name: '취득세 (이전)', sort_order: 2 },
    { category: '등록', item_name: '이전등록비', sort_order: 3 },
    { category: '등록', item_name: '번호판 비용', sort_order: 4 },
    { category: '보험', item_name: '보험료 (초기)', sort_order: 5 },
    { category: '정비', item_name: '정비/수리비', sort_order: 6 },
    { category: '기타', item_name: '탁송비', sort_order: 7 },
    { category: '기타', item_name: '매매알선비', sort_order: 8 },
  ]

  const defaultCostItems = car.is_used ? usedCarCostItems : newCarCostItems

  const costCategories = [
    { key: '차량', color: 'bg-steel-100 text-steel-700' },
    { key: '세금', color: 'bg-red-100 text-red-700' },
    { key: '등록', color: 'bg-purple-100 text-purple-700' },
    { key: '보험', color: 'bg-green-100 text-green-700' },
    { key: '정비', color: 'bg-yellow-100 text-yellow-700' },
    { key: '기타', color: 'bg-gray-100 text-gray-700' },
  ]

  const getCategoryColor = (cat: string) => costCategories.find(c => c.key === cat)?.color || 'bg-gray-100 text-gray-700'

  // 비용 목록 조회
  const fetchCosts = async () => {
    setCostsLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/car-costs?car_id=${carId}`, { headers })
      const json = await res.json()
      setCosts(json.data ?? json ?? [])
    } catch (err) {
      console.error('Error fetching costs:', err)
    }
    setCostsLoading(false)
  }

  // 대출 목록 조회
  const fetchLinkedLoans = async () => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/loans?car_id=${carId}`, { headers })
      const json = await res.json()
      setLinkedLoans(json.data ?? json ?? [])
    } catch (err) {
      console.error('Error fetching loans:', err)
    }
  }

  // 기본 항목 자동 생성 (신차/중고 구분)
  const initDefaultCosts = async (forceReset = false) => {
    if (costs.length > 0 && !forceReset) return
    if (forceReset) {
      const delRes = await fetch(`/api/car-costs?car_id=${carId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) } }); const delErr = (await delRes.json()).error
      if (delErr) { alert('삭제 실패: ' + delErr.message); return }
      setCosts([])
      // 차량매입가(purchase_price)도 0으로 초기화
      setCar((prev: any) => ({ ...prev, purchase_price: 0 }))
      await fetch(`/api/cars/${carId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({ purchase_price: 0 }) })
    }
    const template = car.is_used ? usedCarCostItems : newCarCostItems
    const items = template.map(item => ({
      car_id: Number(carId),
      ...item,
      amount: 0,  // 초기화 시 모든 금액 0원
      notes: '',
    }))
    const insertRes = await fetch('/api/car-costs', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(items) }); const error = (await insertRes.json()).error
    if (error) {
      alert('생성 실패: ' + error.message)
    } else {
      await fetchCosts()
      updateTotalCost()
    }
  }

  // 비용 금액 수정
  const handleCostUpdate = async (costId: number, field: string, value: any) => {
    const updateRes = await fetch(`/api/car-costs/${costId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({ [field]: value, updated_at: new Date().toISOString() }) }); const error = (await updateRes.json()).error
    if (!error) {
      setCosts(prev => prev.map(c => c.id === costId ? { ...c, [field]: value } : c))
      // '차량' 카테고리 금액 변경 시 → cars.purchase_price도 동기화
      const costItem = costs.find(c => c.id === costId)
      if (costItem?.category === '차량' && field === 'amount') {
        const numVal = Number(value) || 0
        setCar((prev: any) => ({ ...prev, purchase_price: numVal }))
        fetch(`/api/cars/${carId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({ purchase_price: numVal }) })
      }
      // total_cost 캐시 업데이트
      updateTotalCost()
    }
  }

  // 사용자 항목 추가
  const handleAddCostItem = async () => {
    if (!newCostItem.item_name.trim()) return alert('항목명을 입력해주세요.')
    const insertRes = await fetch('/api/car-costs', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({ ...newCostItem, car_id: Number(carId) }) }); const error = (await insertRes.json()).error
    if (!error) {
      setNewCostItem({ category: '기타', item_name: '', amount: 0, notes: '' })
      fetchCosts()
    }
  }

  // 항목 삭제
  const handleDeleteCostItem = async (costId: number) => {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return
    const delRes = await fetch(`/api/car-costs/${costId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) } }); const error = (await delRes.json()).error
    if (!error) {
      setCosts(prev => prev.filter(c => c.id !== costId))
      updateTotalCost()
    }
  }

  // total_cost 캐시 업데이트
  const updateTotalCost = async () => {
    const costRes = await fetch(`/api/car-costs?car_id=${carId}`, { headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) } }); const data = (await costRes.json()).data
    const total = (data || []).reduce((sum: number, c: any) => sum + (c.amount || 0), 0)
    await fetch(`/api/cars/${carId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({ total_cost: total }) })
    setCar((prev: any) => ({ ...prev, total_cost: total }))
  }

  // 카테고리별 소계
  const costByCategory = costCategories.map(cat => ({
    ...cat,
    total: costs.filter(c => c.category === cat.key).reduce((s, c) => s + (c.amount || 0), 0),
    items: costs.filter(c => c.category === cat.key),
  })).filter(cat => cat.total > 0 || cat.items.length > 0)

  const totalCost = costs.reduce((s, c) => s + (c.amount || 0), 0)

  useEffect(() => {
    if (carId) {
      fetchCarData()
      fetchCosts()
      fetchLinkedLoans()
    }
  }, [carId])

  // 초기 로딩 시 모델명 분석하여 트림 찾기
  useEffect(() => {
    if (car.model) {
        findBaseModelAndTrims(car.model);
    }
  }, [car.model])

  const fetchCarData = async () => {
    try {
        const carRes = await fetch(`/api/cars/${carId}`, { headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) } }); const carJson = await carRes.json(); const data = carJson.data; const error = carJson.error
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
          try {
            const headers = await getAuthHeader()
            const res = await fetch(`/api/vehicle-standards?model_name=${encodeURIComponent(currentName)}`, { headers })
            const json = await res.json()
            const data = json.data ?? json

            if (data && data.length > 0) {
                foundTrims = data;
                foundModelName = currentName;
                break;
            }
          } catch (err) {
            console.error('Error fetching vehicle standards:', err)
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
    const updateRes = await fetch(`/api/cars/${carId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({ model: finalModelName }) }); const error = (await updateRes.json()).error

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
                    const rowsToInsert = result.trims.map((t: any) => ({
                        brand: '기타',
                        model_name: detectedModel,
                        year: detectedYear,
                        trim_name: t.name,
                        price: t.price || 0,
                        fuel_type: result.fuel_type || '기타'
                    }));
                    const authHeader = await getAuthHeader();
                    await fetch('/api/vehicle-standard-codes', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader }, body: JSON.stringify(rowsToInsert) });
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
    <div className="min-h-screen bg-gray-50/50 py-10 pb-24 px-4 sm:px-6 lg:px-8">
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

                {/* 차량 구분 (신차/중고 + 영업용/비영업용) */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2"><span className="w-1 h-5 bg-steel-600 rounded-full"></span> 차량 구분</h2>

                    {/* 신차 / 중고차 */}
                    <p className="text-xs font-bold text-gray-400 mb-2 uppercase">차량 상태</p>
                    <div className="flex items-center gap-3 mb-5">
                      <button
                        onClick={() => setCar((prev: any) => ({ ...prev, is_used: false, purchase_mileage: 0 }))}
                        className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all border-2 ${
                          !car.is_used
                            ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                            : 'border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        🆕 신차
                      </button>
                      <button
                        onClick={() => setCar((prev: any) => ({ ...prev, is_used: true }))}
                        className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all border-2 ${
                          car.is_used
                            ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm'
                            : 'border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        🔄 중고차
                      </button>
                    </div>
                    {car.is_used && (
                      <div className="mb-5">
                        <label className="label">구입 시 주행거리 (km)</label>
                        <input
                          type="number"
                          className="input text-right"
                          placeholder="예: 35000"
                          value={car.purchase_mileage || ''}
                          onChange={e => handleChange('purchase_mileage', Number(e.target.value))}
                        />
                        {car.purchase_mileage > 0 && (
                          <p className="text-xs text-gray-400 mt-1 text-right">{(car.purchase_mileage / 10000).toFixed(1)}만km</p>
                        )}
                      </div>
                    )}

                    {/* 영업용 / 비영업용 */}
                    <p className="text-xs font-bold text-gray-400 mb-2 uppercase">용도 구분</p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setCar((prev: any) => ({ ...prev, is_commercial: true }))}
                        className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all border-2 ${
                          car.is_commercial !== false
                            ? 'border-steel-500 bg-steel-50 text-steel-700 shadow-sm'
                            : 'border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        🏢 영업용
                      </button>
                      <button
                        onClick={() => setCar((prev: any) => ({ ...prev, is_commercial: false }))}
                        className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all border-2 ${
                          car.is_commercial === false
                            ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm'
                            : 'border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        🏠 비영업용
                      </button>
                    </div>
                    {car.is_commercial === false && (
                      <p className="text-xs text-teal-600 mt-2 bg-teal-50 rounded-lg p-2 border border-teal-100">
                        비영업용 차량은 보험료, 취득세율 등이 영업용과 다르게 적용됩니다.
                      </p>
                    )}
                </div>

                {/* 🤝 소유 구분 및 지입 관리 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2"><span className="w-1 h-5 bg-amber-500 rounded-full"></span> 소유 구분</h2>

                    {/* 소유구분 3버튼 */}
                    <div className="flex gap-3 mb-4">
                      {[
                        { value: 'company', label: '🏢 자사 보유', desc: '사업자 명의 차량', color: 'blue' },
                        { value: 'consignment', label: '🤝 지입 차량', desc: '타인 명의, 우리가 운영', color: 'amber' },
                        { value: 'leased_in', label: '📋 임차 차량', desc: '외부에서 빌려온 차량', color: 'purple' },
                      ].map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => setCar((prev: any) => ({ ...prev, ownership_type: opt.value }))}
                          className={`flex-1 p-3 rounded-xl border-2 text-left transition-all ${
                            (car.ownership_type || 'company') === opt.value
                              ? opt.color === 'blue' ? 'border-blue-500 bg-blue-50'
                                : opt.color === 'amber' ? 'border-amber-500 bg-amber-50'
                                : 'border-purple-500 bg-purple-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}>
                          <div className="font-bold text-sm">{opt.label}</div>
                          <div className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</div>
                        </button>
                      ))}
                    </div>

                    {/* 지입/임차인 경우 상세 정보 */}
                    {(car.ownership_type === 'consignment' || car.ownership_type === 'leased_in') && (
                      <div className="space-y-4 mt-4 pt-4 border-t border-gray-100">
                        {/* 지입주 정보 + 정산 계좌 */}
                        <div>
                          <h3 className="text-sm font-bold text-gray-700 mb-3">👤 {car.ownership_type === 'consignment' ? '지입주' : '임대인'} 정보</h3>
                          <div className="grid grid-cols-2 gap-3">
                            <div><label className="label">이름</label><input className="input" placeholder="홍길동" value={car.owner_name || ''} onChange={e=>handleChange('owner_name', e.target.value)} /></div>
                            <div><label className="label">연락처</label><input className="input" placeholder="010-0000-0000" value={car.owner_phone || ''} onChange={e=>handleChange('owner_phone', e.target.value)} /></div>
                          </div>
                        </div>

                        {/* 정산 계좌 */}
                        <div>
                          <h3 className="text-sm font-bold text-gray-700 mb-3">🏦 정산 계좌</h3>
                          <div className="grid grid-cols-3 gap-3">
                            <div><label className="label">은행</label><input className="input" placeholder="신한은행" value={car.owner_bank || ''} onChange={e=>handleChange('owner_bank', e.target.value)} /></div>
                            <div><label className="label">계좌번호</label><input className="input" placeholder="110-123-456789" value={car.owner_account || ''} onChange={e=>handleChange('owner_account', e.target.value)} /></div>
                            <div><label className="label">예금주</label><input className="input" placeholder="홍길동" value={car.owner_account_holder || ''} onChange={e=>handleChange('owner_account_holder', e.target.value)} /></div>
                          </div>
                        </div>

                        {/* 계약 조건 */}
                        <div>
                          <h3 className="text-sm font-bold text-gray-700 mb-3">📝 계약 조건</h3>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="label">월 {car.ownership_type === 'consignment' ? '지입료' : '임차료'}</label>
                              <input type="text" className="input text-right font-bold" placeholder="0"
                                value={car.consignment_fee ? Number(car.consignment_fee).toLocaleString() : ''}
                                onChange={e => handleChange('consignment_fee', Number(e.target.value.replace(/,/g, '')))} />
                            </div>
                            <div>
                              <label className="label">보험 주체</label>
                              <select className="input" value={car.insurance_by || 'company'} onChange={e=>handleChange('insurance_by', e.target.value)}>
                                <option value="company">우리 회사</option>
                                <option value="owner">{car.ownership_type === 'consignment' ? '지입주' : '임대인'} 본인</option>
                              </select>
                            </div>
                            <div>
                              <label className="label">계약 시작일</label>
                              <input type="date" className="input" value={car.consignment_start || ''} onChange={e=>handleChange('consignment_start', e.target.value)} />
                            </div>
                            <div>
                              <label className="label">계약 종료일</label>
                              <input type="date" className="input" value={car.consignment_end || ''} onChange={e=>handleChange('consignment_end', e.target.value)} />
                              {car.consignment_end && new Date(car.consignment_end) < new Date() && (
                                <p className="text-[10px] text-red-500 mt-1 font-bold">⚠️ 계약 만료됨</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 계약서 + 메모 */}
                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <label className="label">계약서 URL</label>
                            <div className="flex gap-2">
                              <input className="input flex-1" placeholder="PDF URL 또는 외부 링크" value={car.consignment_contract_url || ''} onChange={e=>handleChange('consignment_contract_url', e.target.value)} />
                              {car.consignment_contract_url && (
                                <a href={car.consignment_contract_url} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-steel-600 text-white rounded-lg text-xs font-bold hover:bg-steel-700 whitespace-nowrap">열기</a>
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="label">메모 / 특약</label>
                            <textarea className="input" rows={2} placeholder="정산 조건, 특약사항 등" value={car.owner_memo || ''} onChange={e=>handleChange('owner_memo', e.target.value)} />
                          </div>
                        </div>
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
                </div>

                {/* 비고 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <label className="label mb-2 block">비고</label>
                    <textarea className="w-full h-32 p-4 bg-gray-50 border border-gray-200 rounded-xl resize-none outline-none" value={car.notes || ''} onChange={e=>handleChange('notes', e.target.value)}></textarea>
                </div>

                {/* 💰 취득원가 (신차/중고 통합 비용) */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex justify-between items-center mb-3 border-b pb-2">
                      <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <span className="w-1 h-5 bg-emerald-500 rounded-full"></span>
                        취득원가
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${car.is_used ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                          {car.is_used ? '중고차' : '신차'}
                        </span>
                      </h2>
                      <div className="flex items-center gap-2">
                        {costs.length === 0 ? (
                          <button
                            onClick={() => initDefaultCosts()}
                            className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-100 transition-colors"
                          >
                            기본항목 생성
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (confirm(`현재 항목을 삭제하고 ${car.is_used ? '중고차' : '신차'} 기본항목으로 초기화하시겠습니까?`))
                                initDefaultCosts(true)
                            }}
                            className="text-xs bg-orange-50 text-orange-600 px-3 py-1.5 rounded-lg font-bold hover:bg-orange-100 transition-colors"
                          >
                            항목 초기화
                          </button>
                        )}
                        <button
                          onClick={() => setShowCostDetail(!showCostDetail)}
                          className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-200 transition-colors"
                        >
                          {showCostDetail ? '요약보기' : '상세보기'}
                        </button>
                      </div>
                    </div>

                    {/* 요약: 차량가 + 총 취득원가 (하단 비용항목에서 자동 계산) */}
                    <div className="bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-xl p-3 mb-4 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase">{car.is_used ? '중고 매입가' : '등록증 취득가액'}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{car.is_used ? '실제 구입 금액 (하단 차량 매입가 항목)' : '등록증 기재 금액 (하단 출고가 항목)'}</p>
                        </div>
                        <span className="text-lg font-black text-steel-700">
                          {f(costs.find(c => c.category === '차량')?.amount || car.purchase_price)}원
                        </span>
                      </div>
                      {totalCost > 0 && (
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
                          <p className="text-[10px] font-bold text-emerald-600 uppercase">총 취득원가</p>
                          <span className="text-lg font-black text-emerald-700">{f(totalCost)}원</span>
                        </div>
                      )}
                    </div>

                    {/* 요약 뷰 */}
                    {!showCostDetail && (
                      <div>
                        {costs.length === 0 ? (
                          <div className="text-center py-8 text-gray-400">
                            <p className="text-sm">등록된 비용 항목이 없습니다</p>
                            <p className="text-xs mt-1">"기본항목 생성" 버튼을 눌러 시작하세요</p>
                          </div>
                        ) : (
                          <>
                            {/* 총 비용 */}
                            <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl p-4 mb-4 border border-emerald-100">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-emerald-700">총 취득원가</span>
                                <span className="text-2xl font-black text-emerald-800">{f(totalCost)}<span className="text-sm text-emerald-500 ml-0.5">원</span></span>
                              </div>
                              {car.purchase_price > 0 && totalCost > car.purchase_price && (
                                <p className="text-xs text-emerald-600 mt-1 text-right">
                                  {car.is_used ? '매입가' : '출고가'} 대비 부대비용 +{f(totalCost - car.purchase_price)}원 ({((totalCost / car.purchase_price - 1) * 100).toFixed(1)}%)
                                </p>
                              )}
                            </div>
                            {/* 카테고리별 소계 */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              {costByCategory.map(cat => (
                                <div key={cat.key} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cat.color}`}>{cat.key}</span>
                                  </div>
                                  <p className="text-sm font-black text-gray-800">{f(cat.total)}원</p>
                                  <p className="text-[10px] text-gray-400 mt-0.5">{cat.items.length}개 항목</p>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* 상세 뷰 */}
                    {showCostDetail && (
                      <div>
                        {costsLoading ? (
                          <div className="text-center py-8 text-gray-400">로딩 중...</div>
                        ) : (
                          <>
                            {/* 항목 리스트 — 테이블 정렬 */}
                            <table className="w-full mb-5">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase pb-2 pl-1">구분</th>
                                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase pb-2">항목명</th>
                                  <th className="text-right text-[10px] font-bold text-gray-400 uppercase pb-2">금액</th>
                                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase pb-2 pl-3">비고</th>
                                  <th className="w-6"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {costs.map(cost => (
                                  <tr key={cost.id} className="group border-b border-gray-100 last:border-0">
                                    <td className="py-1.5 pl-1 w-12">
                                      <span className={`inline-block w-10 text-center py-0.5 rounded text-[10px] font-bold ${getCategoryColor(cost.category)}`}>
                                        {cost.category}
                                      </span>
                                    </td>
                                    <td className="py-1.5">
                                      <span className="text-sm font-bold text-gray-800">{cost.item_name}</span>
                                    </td>
                                    <td className="py-1.5 w-44">
                                      <div className="flex items-center justify-end gap-1">
                                        <input
                                          type="text"
                                          className="w-36 text-right text-xs font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:bg-white focus:border-steel-500 outline-none transition-all"
                                          value={cost.amount ? f(cost.amount) : ''}
                                          onChange={e => {
                                            const val = Number(e.target.value.replace(/[^0-9]/g, '')) || 0
                                            setCosts(prev => prev.map(c => c.id === cost.id ? { ...c, amount: val } : c))
                                          }}
                                          onBlur={e => {
                                            const val = Number(e.target.value.replace(/[^0-9]/g, '')) || 0
                                            handleCostUpdate(cost.id, 'amount', val)
                                          }}
                                          placeholder="0"
                                        />
                                        <span className="text-xs text-gray-400">원</span>
                                      </div>
                                    </td>
                                    <td className="py-1.5 pl-3 w-28">
                                      <input
                                        type="text"
                                        className="w-full text-xs text-gray-500 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-steel-400 outline-none px-1 py-1 transition-colors"
                                        value={cost.notes || ''}
                                        onChange={e => setCosts(prev => prev.map(c => c.id === cost.id ? { ...c, notes: e.target.value } : c))}
                                        onBlur={e => handleCostUpdate(cost.id, 'notes', e.target.value)}
                                        placeholder="비고"
                                      />
                                    </td>
                                    <td className="py-1.5 w-6">
                                      <button
                                        onClick={() => handleDeleteCostItem(cost.id)}
                                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-1"
                                      >
                                        ×
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {/* 합계 */}
                            {costs.length > 0 && (
                              <div className="flex items-center pt-3 border-t-2 border-gray-300 mb-5">
                                <span className="text-sm font-extrabold text-gray-500 uppercase">합계</span>
                                <span className="text-xl font-black text-emerald-700 ml-auto">{f(totalCost)}</span>
                                <span className="text-xs text-gray-400 ml-1">원</span>
                              </div>
                            )}

                            {/* 항목 추가 */}
                            <div className="bg-gray-50 rounded-xl p-4 border border-dashed border-gray-300">
                              <p className="text-xs font-bold text-gray-500 mb-3">+ 항목 추가</p>
                              <div className="flex flex-wrap gap-2">
                                <select
                                  className="text-xs font-bold bg-white border border-gray-200 rounded-lg px-2 py-2 outline-none"
                                  value={newCostItem.category}
                                  onChange={e => setNewCostItem(prev => ({ ...prev, category: e.target.value }))}
                                >
                                  {costCategories.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
                                </select>
                                <input
                                  type="text"
                                  className="flex-1 min-w-[120px] text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 font-bold outline-none focus:border-steel-500"
                                  placeholder="항목명"
                                  value={newCostItem.item_name}
                                  onChange={e => setNewCostItem(prev => ({ ...prev, item_name: e.target.value }))}
                                />
                                <input
                                  type="text"
                                  className="w-32 text-sm text-right bg-white border border-gray-200 rounded-lg px-3 py-2 font-bold outline-none focus:border-steel-500"
                                  placeholder="금액"
                                  value={newCostItem.amount ? f(newCostItem.amount) : ''}
                                  onChange={e => setNewCostItem(prev => ({ ...prev, amount: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 }))}
                                />
                                <button
                                  onClick={handleAddCostItem}
                                  className="bg-steel-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-steel-700 transition-colors"
                                >
                                  추가
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                </div>

                {/* 🏦 자금조달 (대출 연동) */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex justify-between items-center mb-3 border-b pb-2">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <span className="w-1 h-5 bg-indigo-500 rounded-full"></span>
                      자금조달
                    </h2>
                    <button
                      onClick={() => router.push(`/loans/new?car_id=${carId}`)}
                      className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-100 transition-colors"
                    >
                      + 대출 등록
                    </button>
                  </div>

                  {linkedLoans.length > 0 ? (
                    <div className="space-y-3">
                      {linkedLoans.map((loan: any) => (
                        <div key={loan.id} className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-indigo-900">{loan.finance_name}</span>
                              <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-bold">{loan.type}</span>
                            </div>
                            <span className="text-xs text-gray-400">{loan.months}개월 · {loan.interest_rate}%</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white p-3 rounded-lg border border-indigo-100">
                              <p className="text-[10px] font-bold text-gray-400 uppercase">선수금</p>
                              <p className="text-sm font-black text-gray-800">
                                {(loan.deposit || 0).toLocaleString()}원
                                {loan.advance_rate > 0 && <span className="text-[10px] text-indigo-500 ml-1">({loan.advance_rate}%)</span>}
                              </p>
                            </div>
                            <div className="bg-white p-3 rounded-lg border border-indigo-100">
                              <p className="text-[10px] font-bold text-gray-400 uppercase">대출금</p>
                              <p className="text-sm font-black text-gray-800">{(loan.total_amount || 0).toLocaleString()}원</p>
                            </div>
                            <div className="bg-white p-3 rounded-lg border border-indigo-100">
                              <p className="text-[10px] font-bold text-gray-400 uppercase">월 납입금</p>
                              <p className="text-sm font-black text-red-600">{(loan.monthly_payment || 0).toLocaleString()}원</p>
                            </div>
                            <div className="bg-white p-3 rounded-lg border border-indigo-100">
                              <p className="text-[10px] font-bold text-gray-400 uppercase">고객 초기납입금</p>
                              <p className="text-sm font-black text-gray-800">{(loan.customer_initial_payment || 0).toLocaleString()}원</p>
                            </div>
                          </div>
                          <button
                            onClick={() => router.push(`/loans/${loan.id}`)}
                            className="mt-3 w-full py-2 text-xs font-bold text-indigo-600 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition-colors"
                          >
                            대출 상세보기 →
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-gray-50 p-6 rounded-xl border border-dashed border-gray-300 text-center">
                      <p className="text-sm text-gray-400 mb-2">연동된 대출 정보가 없습니다</p>
                      <p className="text-xs text-gray-300">대출/금융 관리에서 이 차량에 대한 금융 정보를 등록하세요</p>
                    </div>
                  )}
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
                                    <input ref={regFileRef} type="file" className="hidden" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" onChange={handleFileUpload} />
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

      {/* 하단 고정 저장 바 */}
      <div className="fixed bottom-0 left-0 right-0 z-30">
        <div className="bg-white/90 backdrop-blur-xl border-t border-gray-100 shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between gap-4">
              {/* 좌: 차량 정보 */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-steel-100 flex items-center justify-center shrink-0">
                  <span className="text-sm">🚗</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-gray-900 truncate leading-tight">{car.number}</p>
                  <p className="text-[11px] text-gray-400 font-medium truncate leading-tight">{baseModelName || car.model || ''}</p>
                </div>
              </div>

              {/* 중: 취득원가 */}
              {totalCost > 0 && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                  <span className="text-[10px] font-bold text-emerald-500 uppercase">취득원가</span>
                  <span className="text-sm font-black text-emerald-700">{f(totalCost)}원</span>
                </div>
              )}

              {/* 우: 저장 버튼 */}
              <button onClick={handleSave} className="flex items-center gap-2 bg-steel-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-steel-800 active:scale-[0.97] shadow-md hover:shadow-lg transition-all shrink-0">
                <Icons.Save /> 저장
              </button>
            </div>
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