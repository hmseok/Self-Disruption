'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../utils/supabase'
import { useRouter } from 'next/navigation'

export default function RegistrationListPage() {
  const router = useRouter()
  const bulkInputRef = useRef<HTMLInputElement>(null) // 📂 대량 업로드용 ref

  const [cars, setCars] = useState<any[]>([])

  // 📝 단건 등록 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  // 🔄 대량 처리 상태
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, fail: 0 })
  const [logs, setLogs] = useState<string[]>([]) // 처리 로그

  // 🚙 표준 코드 데이터
  const [codeModels, setCodeModels] = useState<any[]>([])
  const [codeTrims, setCodeTrims] = useState<any[]>([])
  const [codeOptions, setCodeOptions] = useState<any[]>([])

  // 단건 입력용 상태
  const [carNum, setCarNum] = useState('')
  const [selectedModel, setSelectedModel] = useState<any>(null)
  const [selectedTrim, setSelectedTrim] = useState<any>(null)
  const [checkedOptions, setCheckedOptions] = useState<any[]>([])
  const [finalPrice, setFinalPrice] = useState(0)

  useEffect(() => {
    fetchList()
    fetchCodeModels()
  }, [])

  useEffect(() => {
    let price = 0
    if (selectedTrim) price += selectedTrim.price
    checkedOptions.forEach(opt => price += opt.price)
    setFinalPrice(price)
  }, [selectedTrim, checkedOptions])

  const fetchList = async () => {
    const { data } = await supabase.from('cars').select('*').order('created_at', { ascending: false })
    setCars(data || [])
  }

  const fetchCodeModels = async () => {
    const { data } = await supabase.from('car_code_models').select('*').order('created_at', { ascending: false })
    setCodeModels(data || [])
  }

  // 모델 선택 핸들러
  const handleModelSelect = async (modelId: string) => {
    const model = codeModels.find(m => m.id === Number(modelId))
    setSelectedModel(model)
    setSelectedTrim(null)
    setCheckedOptions([])
    if (model) {
        const { data: tData } = await supabase.from('car_code_trims').select('*').eq('model_id', model.id).order('price')
        setCodeTrims(tData || [])
        const { data: oData } = await supabase.from('car_code_options').select('*').eq('model_id', model.id)
        setCodeOptions(oData || [])
    }
  }

  const toggleOption = (option: any) => {
    if (checkedOptions.find(o => o.id === option.id)) setCheckedOptions(checkedOptions.filter(o => o.id !== option.id))
    else setCheckedOptions([...checkedOptions, option])
  }

  // ✨ [핵심] 대량 파일 업로드 및 AI 일괄 처리
  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    if (!confirm(`총 ${files.length}장의 등록증을 분석하여 등록하시겠습니까?\n(AI 분석 시간 동안 창을 닫지 마세요)`)) return

    setBulkProcessing(true)
    setProgress({ current: 0, total: files.length, success: 0, fail: 0 })
    setLogs([])

    // 순차 처리 (병렬로 하면 API 제한 걸릴 수 있음)
    for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setProgress(prev => ({ ...prev, current: i + 1 }))

        try {
            // 1. 이미지를 Base64로 변환 (AI 전송용)
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader()
                reader.readAsDataURL(file)
                reader.onload = () => resolve(reader.result as string)
            })

            // 2. OCR API 호출
            const response = await fetch('/api/ocr-registration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64 })
            })

            // 🚨 [중요] 서버 응답이 OK가 아니면 에러를 던져야 함
            if (!response.ok) {
                const errorText = await response.text(); // JSON이 아닐 수도 있으므로 text로 읽음
                throw new Error(`API 오류 (${response.status}): ${errorText.substring(0, 100)}...`);
            }

            const result = await response.json()
            if (result.error) throw new Error(result.error)

            // 3. 모델 매칭 (AI가 읽은 모델명 vs 우리 DB)
            let matchedModelName = result.model_name || '미확인 모델'
            let matchedPrice = 0
            let matchedBrand = result.brand_guess || '기타'

            // 스마트 매칭 시도
            if (result.model_name) {
                const found = codeModels.find(m =>
                    result.model_name.replace(/\s/g, '').includes(m.model_name.replace(/\s/g, '')) ||
                    m.model_name.replace(/\s/g, '').includes(result.model_name.replace(/\s/g, ''))
                )
                if (found) {
                    matchedModelName = `${found.brand} ${found.model_name}` // 표준 명칭 사용
                    matchedBrand = found.brand
                    // 기본 트림 가격이라도 넣어둠 (나중에 상세 수정)
                    // (실제로는 트림까지 매칭하기 어렵으므로 모델 기본값 사용)
                }
            }

            // 4. Supabase 스토리지에 원본 이미지 저장
            const fileExt = file.name.split('.').pop()
            const fileName = `bulk_${Date.now()}_${i}.${fileExt}`
            const { data: uploadData } = await supabase.storage.from('car_docs').upload(`registration/${fileName}`, file)
            const publicUrl = uploadData ? supabase.storage.from('car_docs').getPublicUrl(`registration/${fileName}`).data.publicUrl : null

            // 5. DB Insert (수정됨: 안전장치 강화)
        const { error } = await supabase.from('cars').insert([{
            number: result.car_number || '임시번호',
            brand: matchedBrand,
            model: matchedModelName,
            year: result.model_year ? Number(result.model_year) : new Date().getFullYear(),
            vin: result.vin,
            owner_name: result.owner_name,
            registration_date: result.registration_date,

            // 🚨 [핵심 수정] 값이 없으면 무조건 '미확인'으로 저장 (에러 방지)
            fuel_type: result.fuel_type || '미확인',

            purchase_price: matchedPrice,
            registration_image_url: publicUrl,
            status: 'available'
        }])

        if (error) throw error // 에러 발생 시 catch로 이동

        setProgress(prev => ({ ...prev, success: prev.success + 1 }))
        setLogs(prev => [`[✅ 성공] ${result.car_number} - ${matchedModelName}`, ...prev])

    } catch (error: any) {
        // 🔍 [핵심 수정] 에러 내용을 강제로 문자열로 풀어서 확인
        const errorMsg = JSON.stringify(error, null, 2);
        console.error("🔥 상세 에러 로그:", errorMsg);

        setProgress(prev => ({ ...prev, fail: prev.fail + 1 }))
        // 로그창에 에러 원인 표시
        setLogs(prev => [`[❌ 실패] ${file.name}: ${error.message || 'DB 저장 실패 (콘솔확인)'}`, ...prev])
    }
        // ... 기존 코드 ...
    }

    alert('일괄 등록 처리가 완료되었습니다!')
    setBulkProcessing(false)
    fetchList()
  }

  // 단건 등록 핸들러
  const handleRegister = async () => {
    if (!carNum) return alert('차량 번호를 입력해주세요.')
    if (!selectedModel || !selectedTrim) return alert('모델과 세부등급(트림)을 선택해주세요.')
    setCreating(true)
    const { data: exist } = await supabase.from('cars').select('id').eq('number', carNum).single()
    if (exist) { alert('이미 등록된 차량번호입니다.'); setCreating(false); return; }

    const fullModelName = `${selectedModel.model_name} ${selectedTrim.trim_name}`
    const { error } = await supabase.from('cars').insert([{
        number: carNum, brand: selectedModel.brand, model: fullModelName, year: selectedModel.year,
        purchase_price: finalPrice, fuel_type: selectedTrim.fuel_type, status: 'available'
    }])

    if (error) alert('등록 실패: ' + error.message)
    else { alert('✅ 등록 완료!'); setIsModalOpen(false); fetchList(); }
    setCreating(false)
  }

  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in relative">

      {/* 헤더 */}
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-3xl font-black">📄 차량 등록증 관리</h1>
            <p className="text-sm text-gray-500 mt-1">개별 등록 또는 대량 일괄 등록을 지원합니다.</p>
        </div>
        <div className="flex gap-2">
            {/* 📂 대량 업로드 버튼 */}
            <label className={`cursor-pointer flex items-center gap-2 bg-blue-100 text-blue-700 px-5 py-3 rounded-xl font-bold hover:bg-blue-200 transition-transform hover:-translate-y-1 ${bulkProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                <span>{bulkProcessing ? '처리 중...' : '📂 대량 등록 (OCR)'}</span>
                <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    className="hidden"
                    ref={bulkInputRef}
                    onChange={handleBulkUpload}
                />
            </label>
            {/* + 신규 등록 버튼 */}
            <button onClick={() => setIsModalOpen(true)} className="bg-black text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 shadow-lg transition-transform hover:-translate-y-1">
                + 개별 등록
            </button>
        </div>
      </div>

      {/* 🔄 대량 처리 진행 상태 바 (처리 중일 때만 표시) */}
      {bulkProcessing && (
        <div className="mb-6 bg-white border-2 border-blue-100 rounded-xl p-6 shadow-lg animate-pulse-slow">
            <div className="flex justify-between items-end mb-2">
                <h3 className="font-bold text-lg text-blue-800 flex items-center gap-2">
                    <span className="animate-spin">⚙️</span> AI 일괄 분석 중...
                </h3>
                <span className="text-sm font-bold text-gray-600">
                    {progress.current} / {progress.total}장
                </span>
            </div>
            {/* 프로그레스 바 */}
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                    className="bg-blue-600 h-4 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                ></div>
            </div>
            <div className="flex gap-4 mt-3 text-sm">
                <span className="text-green-600 font-bold">✅ 성공: {progress.success}</span>
                <span className="text-red-600 font-bold">❌ 실패: {progress.fail}</span>
            </div>
            {/* 실시간 로그 */}
            <div className="mt-3 bg-gray-900 text-green-400 p-3 rounded-lg text-xs font-mono h-24 overflow-y-auto">
                {logs.map((log, i) => <div key={i}>{log}</div>)}
            </div>
        </div>
      )}

      {/* 리스트 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500 font-bold border-b">
            <tr>
              <th className="p-4">차량번호</th>
              <th className="p-4">모델명 (트림)</th>
              <th className="p-4 text-right">차량가액</th>
              <th className="p-4">연식</th>
              <th className="p-4">소유자</th>
              <th className="p-4 text-center">등록증</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {cars.map((car) => (
              <tr key={car.id} onClick={() => router.push(`/registration/${car.id}`)} className="hover:bg-gray-50 cursor-pointer">
                <td className="p-4 font-bold text-lg">{car.number}</td>
                <td className="p-4 text-gray-700">
                    <span className="font-bold">{car.model}</span>
                    <span className="text-xs text-gray-400 block">{car.brand} / {car.fuel_type}</span>
                </td>
                <td className="p-4 text-right font-bold text-blue-600">{f(car.purchase_price)}원</td>
                <td className="p-4 text-gray-500">{car.year}년</td>
                <td className="p-4">{car.owner_name || '-'}</td>
                <td className="p-4 text-center">
                  {car.registration_image_url ? '✅' : <span className="text-gray-300">-</span>}
                </td>
              </tr>
            ))}
            {cars.length === 0 && (
                <tr><td colSpan={6} className="p-10 text-center text-gray-400">등록된 차량이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 모달 (기존 코드 유지 - 생략 없이 포함) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white p-0 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b bg-gray-50 flex justify-between items-center"><div><h2 className="text-2xl font-black">🚙 신규 차량 등록</h2><p className="text-sm text-gray-500 mt-1">표준 코드를 선택하면 차량가액이 자동 계산됩니다.</p></div><button onClick={() => setIsModalOpen(false)} className="text-2xl font-bold text-gray-400 hover:text-black">×</button></div>
            <div className="p-8 overflow-y-auto space-y-6">
                <div><label className="block text-sm font-bold text-gray-800 mb-2">1. 차량 번호</label><input autoFocus className="w-full p-4 border-2 border-gray-200 rounded-xl font-bold text-xl focus:border-black outline-none" placeholder="예: 123가 4567" value={carNum} onChange={e => setCarNum(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">2. 차종 모델</label><select className="w-full p-3 border rounded-xl font-bold bg-white" onChange={(e) => handleModelSelect(e.target.value)} defaultValue=""><option value="" disabled>모델 선택</option>{codeModels.map(m => (<option key={m.id} value={m.id}>{m.brand} {m.model_name} ({m.year})</option>))}</select></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">3. 세부 등급</label><select className="w-full p-3 border rounded-xl font-bold bg-white disabled:bg-gray-100" disabled={!selectedModel} onChange={(e) => setSelectedTrim(codeTrims.find(t => t.id === Number(e.target.value)))} defaultValue=""><option value="" disabled>등급 선택</option>{codeTrims.map(t => (<option key={t.id} value={t.id}>{t.trim_name} (+{f(t.price)})</option>))}</select></div>
                </div>
                {selectedModel && (<div className="bg-gray-50 p-4 rounded-xl border"><label className="block text-xs font-bold text-gray-500 mb-3">4. 추가 옵션</label><div className="grid grid-cols-2 gap-2">{codeOptions.map(opt => (<label key={opt.id} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${checkedOptions.find(o=>o.id===opt.id) ? 'bg-green-50 border-green-500' : 'bg-white hover:bg-gray-100'}`}><input type="checkbox" className="w-4 h-4" checked={!!checkedOptions.find(o => o.id === opt.id)} onChange={() => toggleOption(opt)} /><div className="text-sm"><div className="font-bold">{opt.option_name}</div><div className="text-xs text-green-600">+{f(opt.price)}원</div></div></label>))}</div></div>)}
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-between items-center"><div><div className="text-xs font-bold text-gray-500">최종 차량가액</div><div className="text-3xl font-black text-blue-600">{f(finalPrice)}원</div></div><button onClick={handleRegister} disabled={creating} className="bg-black text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-gray-800 shadow-lg disabled:bg-gray-400">{creating ? '등록 중...' : '등록 완료'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}