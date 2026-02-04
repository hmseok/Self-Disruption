'use client'
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function RegistrationListPage() {
  const router = useRouter()
  const [cars, setCars] = useState<any[]>([])

  // 📝 신규 등록 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  // 🚙 표준 코드 선택을 위한 데이터
  const [codeModels, setCodeModels] = useState<any[]>([]) // 모델 목록
  const [codeTrims, setCodeTrims] = useState<any[]>([])   // 선택된 모델의 트림 목록
  const [codeOptions, setCodeOptions] = useState<any[]>([]) // 선택된 모델의 옵션 목록

  // 사용자가 선택한 값
  const [carNum, setCarNum] = useState('')
  const [selectedModel, setSelectedModel] = useState<any>(null)
  const [selectedTrim, setSelectedTrim] = useState<any>(null)
  const [checkedOptions, setCheckedOptions] = useState<any[]>([]) // 선택된 옵션들 (배열)

  // 최종 계산된 가격
  const [finalPrice, setFinalPrice] = useState(0)

  // 1. 초기 로딩: 등록된 차량 리스트 & 표준 모델 리스트 가져오기
  useEffect(() => {
    fetchList()
    fetchCodeModels()
  }, [])

  // 가격 자동 계산 (트림 + 옵션)
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

  // 모델 선택 시 -> 하위 트림/옵션 가져오기
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
    } else {
        setCodeTrims([])
        setCodeOptions([])
    }
  }

  // 옵션 체크/해제 핸들러
  const toggleOption = (option: any) => {
    if (checkedOptions.find(o => o.id === option.id)) {
        setCheckedOptions(checkedOptions.filter(o => o.id !== option.id))
    } else {
        setCheckedOptions([...checkedOptions, option])
    }
  }

  // ✨ 최종 DB 등록 (Insert)
  const handleRegister = async () => {
    if (!carNum) return alert('차량 번호를 입력해주세요.')
    if (!selectedModel || !selectedTrim) return alert('모델과 세부등급(트림)을 선택해주세요.')

    setCreating(true)

    // 1. 중복 확인
    const { data: exist } = await supabase.from('cars').select('id').eq('number', carNum).single()
    if (exist) {
        alert('이미 등록된 차량번호입니다.')
        setCreating(false)
        return
    }

    // 2. DB에 추가
    // model 필드에 "그랜저 (GN7) 캘리그래피" 처럼 풀네임 저장
    // purchase_price에 계산된 최종 가격 저장
    const fullModelName = `${selectedModel.model_name} ${selectedTrim.trim_name}`

    const { data, error } = await supabase.from('cars').insert([{
        number: carNum,
        brand: selectedModel.brand,
        model: fullModelName,
        year: selectedModel.year,
        purchase_price: finalPrice, // ✨ 자동 계산된 가격
        fuel_type: selectedTrim.fuel_type, // ✨ 트림에서 가져온 연료타입
        status: 'available'
    }]).select().single()

    if (error) {
        alert('등록 실패: ' + error.message)
    } else {
        alert(`✅ 신규 차량 등록 완료!\n차량가액: ${finalPrice.toLocaleString()}원`)
        router.push(`/registration/${data.id}`) // 상세 페이지로 이동
    }
    setCreating(false)
  }

  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-black">📄 차량 등록증 및 제원</h1>
        <button onClick={() => setIsModalOpen(true)} className="bg-black text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 shadow-lg transition-transform hover:-translate-y-1">
            + 신규 차량 등록
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500 font-bold border-b">
            <tr>
              <th className="p-4">차량번호</th>
              <th className="p-4">모델명</th>
              <th className="p-4 text-right">차량가액(취득원가)</th>
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
                <td className="p-4 text-gray-500">{car.year}년식</td>
                <td className="p-4">{car.owner_name || '-'}</td>
                <td className="p-4 text-center">
                  {car.registration_image_url ? '✅' : <span className="text-gray-300">-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ✨ 신규 차량 등록 모달 (표준 코드 연동) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white p-0 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* 헤더 */}
            <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black">🚙 신규 차량 등록</h2>
                    <p className="text-sm text-gray-500 mt-1">표준 코드를 선택하면 차량가액이 자동 계산됩니다.</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-2xl font-bold text-gray-400 hover:text-black">×</button>
            </div>

            {/* 스크롤 영역 */}
            <div className="p-8 overflow-y-auto space-y-6">

                {/* 1. 차량 번호 */}
                <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">1. 차량 번호 (필수)</label>
                    <input autoFocus className="w-full p-4 border-2 border-gray-200 rounded-xl font-bold text-xl focus:border-black outline-none"
                        placeholder="예: 123가 4567"
                        value={carNum}
                        onChange={e => setCarNum(e.target.value)}
                    />
                </div>

                {/* 2. 모델 선택 */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">2. 차종 모델 선택</label>
                        <select className="w-full p-3 border rounded-xl font-bold bg-white"
                            onChange={(e) => handleModelSelect(e.target.value)} defaultValue="">
                            <option value="" disabled>모델을 선택하세요</option>
                            {codeModels.map(m => (
                                <option key={m.id} value={m.id}>{m.brand} {m.model_name} ({m.year})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">3. 세부 등급(트림)</label>
                        <select className="w-full p-3 border rounded-xl font-bold bg-white disabled:bg-gray-100"
                            disabled={!selectedModel}
                            onChange={(e) => setSelectedTrim(codeTrims.find(t => t.id === Number(e.target.value)))} defaultValue="">
                            <option value="" disabled>등급을 선택하세요</option>
                            {codeTrims.map(t => (
                                <option key={t.id} value={t.id}>{t.trim_name} (+{f(t.price)})</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* 3. 옵션 선택 */}
                {selectedModel && (
                    <div className="bg-gray-50 p-4 rounded-xl border">
                        <label className="block text-xs font-bold text-gray-500 mb-3">4. 추가 옵션 선택</label>
                        <div className="grid grid-cols-2 gap-2">
                            {codeOptions.map(opt => (
                                <label key={opt.id} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${checkedOptions.find(o=>o.id===opt.id) ? 'bg-green-50 border-green-500' : 'bg-white hover:bg-gray-100'}`}>
                                    <input type="checkbox" className="w-4 h-4"
                                        checked={!!checkedOptions.find(o => o.id === opt.id)}
                                        onChange={() => toggleOption(opt)}
                                    />
                                    <div className="text-sm">
                                        <div className="font-bold">{opt.option_name}</div>
                                        <div className="text-xs text-green-600">+{f(opt.price)}원</div>
                                    </div>
                                </label>
                            ))}
                            {codeOptions.length === 0 && <div className="text-gray-400 text-sm">선택 가능한 옵션이 없습니다.</div>}
                        </div>
                    </div>
                )}
            </div>

            {/* 하단: 최종 가격 및 등록 버튼 */}
            <div className="p-6 border-t bg-gray-50 flex justify-between items-center">
                <div>
                    <div className="text-xs font-bold text-gray-500">최종 차량가액 (취득원가)</div>
                    <div className="text-3xl font-black text-blue-600">{f(finalPrice)}원</div>
                </div>
                <button
                    onClick={handleRegister}
                    disabled={creating}
                    className="bg-black text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-gray-800 shadow-lg disabled:bg-gray-400"
                >
                    {creating ? '등록 중...' : '등록 완료'}
                </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}