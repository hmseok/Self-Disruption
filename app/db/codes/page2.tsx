'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../utils/supabase'

export default function CarCodePage() {
  const [models, setModels] = useState<any[]>([])
  const [selectedModel, setSelectedModel] = useState<any>(null)

  // 하위 데이터
  const [trims, setTrims] = useState<any[]>([])
  const [options, setOptions] = useState<any[]>([])

  // 입력 상태
  const [newModel, setNewModel] = useState({ brand: '', model_name: '', year: new Date().getFullYear() })
  const [newTrim, setNewTrim] = useState({ trim_name: '', price: 0, fuel_type: '' })
  const [newOption, setNewOption] = useState({ option_name: '', price: 0 })

  useEffect(() => { fetchModels() }, [])

  // 1. 모델 목록 불러오기
  const fetchModels = async () => {
    const { data } = await supabase.from('car_code_models').select('*').order('created_at', { ascending: false })
    setModels(data || [])
  }

  // 2. 모델 선택 시 -> 트림 & 옵션 불러오기
  const handleSelectModel = async (model: any) => {
    setSelectedModel(model)
    const { data: tData } = await supabase.from('car_code_trims').select('*').eq('model_id', model.id).order('price')
    setTrims(tData || [])
    const { data: oData } = await supabase.from('car_code_options').select('*').eq('model_id', model.id)
    setOptions(oData || [])
  }

  // ✨ 모델 추가
  const addModel = async () => {
    if (!newModel.model_name) return alert('모델명 필수')
    await supabase.from('car_code_models').insert([newModel])
    setNewModel({ brand: '', model_name: '', year: new Date().getFullYear() })
    fetchModels()
  }

  // ✨ 트림 추가
  const addTrim = async () => {
    if (!selectedModel) return alert('모델을 먼저 선택하세요')
    if (!newTrim.trim_name || !newTrim.price) return alert('트림명과 가격 필수')
    await supabase.from('car_code_trims').insert([{ ...newTrim, model_id: selectedModel.id }])
    setNewTrim({ trim_name: '', price: 0, fuel_type: '' })
    handleSelectModel(selectedModel) // 새로고침
  }

  // ✨ 옵션 추가
  const addOption = async () => {
    if (!selectedModel) return alert('모델을 먼저 선택하세요')
    if (!newOption.option_name || !newOption.price) return alert('옵션명과 가격 필수')
    await supabase.from('car_code_options').insert([{ ...newOption, model_id: selectedModel.id }])
    setNewOption({ option_name: '', price: 0 })
    handleSelectModel(selectedModel) // 새로고침
  }

  // 삭제 기능들
  const deleteModel = async (id: number) => {
    if(confirm('모델을 삭제하면 하위 트림/옵션도 모두 삭제됩니다.')) {
        await supabase.from('car_code_models').delete().eq('id', id)
        fetchModels()
        setSelectedModel(null)
    }
  }
  const deleteTrim = async (id: number) => {
    await supabase.from('car_code_trims').delete().eq('id', id)
    if(selectedModel) handleSelectModel(selectedModel)
  }
  const deleteOption = async (id: number) => {
    await supabase.from('car_code_options').delete().eq('id', id)
    if(selectedModel) handleSelectModel(selectedModel)
  }

  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in h-[calc(100vh-100px)] flex flex-col">
      <h1 className="text-3xl font-black mb-2">🏗️ 차량 표준 코드 관리 (옵션/트림)</h1>
      <p className="text-gray-500 mb-8">차량 등록 및 신차 발주 시 사용할 표준 모델, 등급, 옵션 정보를 관리합니다.</p>

      <div className="grid grid-cols-12 gap-8 flex-1 min-h-0">

        {/* 🟥 왼쪽: 모델 마스터 (4칸) */}
        <div className="col-span-4 bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 bg-gray-50 border-b font-bold flex justify-between items-center">
                <span>📂 모델 목록</span>
                <span className="text-xs text-gray-500">{models.length}개</span>
            </div>

            {/* 모델 입력창 */}
            <div className="p-4 border-b space-y-2 bg-white">
                <div className="flex gap-2">
                    <input className="w-1/3 p-2 border rounded text-sm font-bold" placeholder="브랜드" value={newModel.brand} onChange={e=>setNewModel({...newModel, brand: e.target.value})} />
                    <input className="w-2/3 p-2 border rounded text-sm font-bold" placeholder="모델명 (연식)" value={newModel.model_name} onChange={e=>setNewModel({...newModel, model_name: e.target.value})} />
                </div>
                <button onClick={addModel} className="w-full bg-black text-white py-2 rounded text-sm font-bold hover:bg-gray-800">+ 모델 추가</button>
            </div>

            {/* 모델 리스트 */}
            <div className="flex-1 overflow-y-auto">
                {models.map(m => (
                    <div key={m.id}
                        onClick={() => handleSelectModel(m)}
                        className={`p-4 border-b cursor-pointer hover:bg-gray-50 flex justify-between items-center group ${selectedModel?.id === m.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''}`}
                    >
                        <div>
                            <div className="font-bold text-sm">{m.brand} {m.model_name}</div>
                            <div className="text-xs text-gray-400">{m.year}년형</div>
                        </div>
                        <button onClick={(e) => {e.stopPropagation(); deleteModel(m.id)}} className="text-gray-300 hover:text-red-500 text-xs">🗑️</button>
                    </div>
                ))}
            </div>
        </div>

        {/* 🟦 오른쪽: 상세 정보 (8칸) */}
        <div className="col-span-8 flex flex-col gap-6">

            {!selectedModel ? (
                <div className="h-full flex items-center justify-center bg-gray-100 rounded-2xl border border-dashed border-gray-300 text-gray-400 font-bold">
                    👈 왼쪽에서 모델을 선택해주세요.
                </div>
            ) : (
                <>
                    {/* 1. 등급(Trim) 관리 */}
                    <div className="bg-white rounded-2xl border shadow-sm flex flex-col flex-1 overflow-hidden">
                        <div className="p-4 bg-blue-50/50 border-b font-bold text-blue-800 flex justify-between">
                            <span>🏷️ [{selectedModel.model_name}] 트림/등급</span>
                        </div>

                        {/* 트림 입력 */}
                        <div className="p-4 border-b flex gap-2 bg-white items-end">
                            <div className="flex-1">
                                <label className="text-xs text-gray-400 font-bold block mb-1">트림명</label>
                                <input className="w-full p-2 border rounded text-sm font-bold" placeholder="예: 캘리그래피" value={newTrim.trim_name} onChange={e=>setNewTrim({...newTrim, trim_name: e.target.value})} />
                            </div>
                            <div className="w-24">
                                <label className="text-xs text-gray-400 font-bold block mb-1">연료</label>
                                <input className="w-full p-2 border rounded text-sm" placeholder="2.5 가솔린" value={newTrim.fuel_type} onChange={e=>setNewTrim({...newTrim, fuel_type: e.target.value})} />
                            </div>
                            <div className="w-32">
                                <label className="text-xs text-gray-400 font-bold block mb-1">기본 가격</label>
                                <input className="w-full p-2 border rounded text-sm font-bold text-right" type="number" value={newTrim.price} onChange={e=>setNewTrim({...newTrim, price: Number(e.target.value)})} />
                            </div>
                            <button onClick={addTrim} className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-blue-700 h-10">추가</button>
                        </div>

                        {/* 트림 리스트 */}
                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {trims.map(t => (
                                <div key={t.id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50 bg-white">
                                    <div className="flex items-center gap-3">
                                        <span className="font-bold text-gray-800">{t.trim_name}</span>
                                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">{t.fuel_type}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="font-bold text-blue-600">{f(t.price)}원</span>
                                        <button onClick={() => deleteTrim(t.id)} className="text-gray-300 hover:text-red-500 text-xs">삭제</button>
                                    </div>
                                </div>
                            ))}
                            {trims.length === 0 && <div className="text-center text-gray-400 py-4 text-sm">등록된 트림이 없습니다.</div>}
                        </div>
                    </div>

                    {/* 2. 옵션(Option) 관리 */}
                    <div className="bg-white rounded-2xl border shadow-sm flex flex-col flex-1 overflow-hidden">
                        <div className="p-4 bg-green-50/50 border-b font-bold text-green-800">
                            <span>✨ [{selectedModel.model_name}] 선택 옵션</span>
                        </div>

                        {/* 옵션 입력 */}
                        <div className="p-4 border-b flex gap-2 bg-white items-end">
                            <div className="flex-1">
                                <label className="text-xs text-gray-400 font-bold block mb-1">옵션명</label>
                                <input className="w-full p-2 border rounded text-sm font-bold" placeholder="예: 파노라마 선루프" value={newOption.option_name} onChange={e=>setNewOption({...newOption, option_name: e.target.value})} />
                            </div>
                            <div className="w-32">
                                <label className="text-xs text-gray-400 font-bold block mb-1">옵션 가격</label>
                                <input className="w-full p-2 border rounded text-sm font-bold text-right" type="number" value={newOption.price} onChange={e=>setNewOption({...newOption, price: Number(e.target.value)})} />
                            </div>
                            <button onClick={addOption} className="bg-green-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-green-700 h-10">추가</button>
                        </div>

                        {/* 옵션 리스트 */}
                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {options.map(o => (
                                <div key={o.id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50 bg-white">
                                    <span className="font-bold text-gray-700">{o.option_name}</span>
                                    <div className="flex items-center gap-4">
                                        <span className="font-bold text-green-600">+{f(o.price)}원</span>
                                        <button onClick={() => deleteOption(o.id)} className="text-gray-300 hover:text-red-500 text-xs">삭제</button>
                                    </div>
                                </div>
                            ))}
                            {options.length === 0 && <div className="text-center text-gray-400 py-4 text-sm">등록된 옵션이 없습니다.</div>}
                        </div>
                    </div>
                </>
            )}
        </div>
      </div>
    </div>
  )
}