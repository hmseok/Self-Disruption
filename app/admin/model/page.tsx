'use client'
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs' // 경로 확인 필요

// 아이콘
const ChevronDown = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
const ChevronUp = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
const PlusIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>

export default function VehicleCodeManager() {
  const [models, setModels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  // 모달 상태
  const [isModelModalOpen, setIsModelModalOpen] = useState(false)
  const [newModel, setNewModel] = useState({ brand: '', model_name: '', year: new Date().getFullYear() })

  const [isTrimModalOpen, setIsTrimModalOpen] = useState(false)
  const [targetModelId, setTargetModelId] = useState<number | null>(null)
  const [newTrim, setNewTrim] = useState({ trim_name: '', price: 0, fuel_type: '전기' })

  useEffect(() => { fetchModels() }, [])

  // 1. 모델+트림 데이터 조회
  const fetchModels = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vehicle_model_codes')
      .select(`
        *,
        vehicle_trims ( * )
      `)
      .order('created_at', { ascending: false })

    if (error) console.error(error)
    else setModels(data || [])
    setLoading(false)
  }

  // 2. 모델 삭제
  const handleDeleteModel = async (id: number) => {
    if (!confirm('모델을 삭제하시겠습니까? 하위 트림도 모두 삭제됩니다.')) return
    await supabase.from('vehicle_model_codes').delete().eq('id', id)
    fetchModels()
  }

  // 3. 트림 삭제
  const handleDeleteTrim = async (trimId: number) => {
    if (!confirm('해당 트림을 삭제하시겠습니까?')) return
    await supabase.from('vehicle_trims').delete().eq('id', trimId)
    fetchModels()
  }

  // 4. 신규 모델 등록
  const handleCreateModel = async () => {
    if (!newModel.model_name) return alert('모델명을 입력하세요')
    const { error } = await supabase.from('vehicle_model_codes').insert([{
        ...newModel,
        normalized_name: newModel.model_name.replace(/\s+/g, '').toUpperCase()
    }])
    if (error) alert('등록 실패: ' + error.message)
    else {
        setIsModelModalOpen(false)
        setNewModel({ brand: '', model_name: '', year: new Date().getFullYear() })
        fetchModels()
    }
  }

  // 5. 신규 트림 등록
  const handleCreateTrim = async () => {
    if (!newTrim.trim_name || !targetModelId) return alert('트림명과 가격을 입력하세요')
    const { error } = await supabase.from('vehicle_trims').insert([{
        model_id: targetModelId,
        ...newTrim
    }])
    if (error) alert('등록 실패: ' + error.message)
    else {
        setIsTrimModalOpen(false)
        setNewTrim({ trim_name: '', price: 0, fuel_type: '전기' })
        fetchModels()
    }
  }

  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-10 px-6">
      <div className="flex justify-between items-end mb-6">
        <div>
            <h1 className="text-3xl font-black text-gray-900">🚙 차량 표준 코드 관리</h1>
            <p className="text-gray-500 mt-2">AI가 수집한 데이터와 수동으로 등록한 모델/트림을 관리합니다.</p>
        </div>
        <button onClick={() => setIsModelModalOpen(true)} className="bg-black text-white px-5 py-3 rounded-xl font-bold hover:bg-gray-800 shadow-lg flex items-center gap-2">
            <PlusIcon /> 신규 모델 등록
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-100 border-b text-gray-600 uppercase text-xs font-bold">
            <tr>
              <th className="p-4 w-10"></th>
              <th className="p-4">브랜드</th>
              <th className="p-4">모델명</th>
              <th className="p-4">연식</th>
              <th className="p-4">트림 개수</th>
              <th className="p-4 text-center">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? <tr><td colSpan={6} className="p-10 text-center">로딩 중...</td></tr> :
             models.map((m) => (
              <>
                <tr
                    key={m.id}
                    onClick={() => setExpandedRow(expandedRow === m.id ? null : m.id)}
                    className={`cursor-pointer transition-colors ${expandedRow === m.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                    <td className="p-4 text-gray-400">{expandedRow === m.id ? <ChevronUp/> : <ChevronDown/>}</td>
                    <td className="p-4 font-bold text-gray-500">{m.brand}</td>
                    <td className="p-4 font-bold text-lg text-gray-800">{m.model_name}</td>
                    <td className="p-4 font-mono text-blue-600">{m.year}년</td>
                    <td className="p-4"><span className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs font-bold">{m.vehicle_trims?.length || 0}개</span></td>
                    <td className="p-4 text-center" onClick={e=>e.stopPropagation()}>
                        <button onClick={() => handleDeleteModel(m.id)} className="text-red-400 hover:text-red-600 underline text-xs">삭제</button>
                    </td>
                </tr>

                {/* 확장 영역 (트림 리스트) */}
                {expandedRow === m.id && (
                    <tr className="bg-gray-50/50">
                        <td colSpan={6} className="p-6 border-b border-t border-gray-200">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="font-bold text-sm text-gray-600">└ {m.model_name} 상세 트림 목록</h4>
                                <button
                                    onClick={() => { setTargetModelId(m.id); setIsTrimModalOpen(true); }}
                                    className="text-xs bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-200"
                                >
                                    + 트림 추가
                                </button>
                            </div>

                            {m.vehicle_trims?.length === 0 ? (
                                <p className="text-center text-gray-400 py-4 text-sm">등록된 트림이 없습니다.</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {m.vehicle_trims.sort((a:any,b:any)=>a.price-b.price).map((t:any) => (
                                        <div key={t.id} className="bg-white border rounded-lg p-3 shadow-sm flex justify-between items-center">
                                            <div>
                                                <div className="font-bold text-sm">{t.trim_name}</div>
                                                <div className="text-xs text-gray-400">{t.fuel_type}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-blue-600 text-sm">{f(t.price)}원</div>
                                                <button onClick={()=>handleDeleteTrim(t.id)} className="text-xs text-red-300 hover:text-red-500">삭제</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </td>
                    </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* 1. 모델 등록 모달 */}
      {isModelModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl w-96 shadow-2xl">
                <h3 className="font-bold text-lg mb-4">새 모델 등록</h3>
                <input className="w-full p-2 border rounded mb-2" placeholder="브랜드 (예: 기아)" value={newModel.brand} onChange={e=>setNewModel({...newModel, brand:e.target.value})} />
                <input className="w-full p-2 border rounded mb-2" placeholder="모델명 (예: EV4)" value={newModel.model_name} onChange={e=>setNewModel({...newModel, model_name:e.target.value})} />
                <input className="w-full p-2 border rounded mb-4" type="number" placeholder="연식 (예: 2025)" value={newModel.year} onChange={e=>setNewModel({...newModel, year:Number(e.target.value)})} />
                <div className="flex gap-2">
                    <button onClick={handleCreateModel} className="flex-1 bg-black text-white py-2 rounded-lg font-bold">등록</button>
                    <button onClick={()=>setIsModelModalOpen(false)} className="flex-1 bg-gray-100 py-2 rounded-lg">취소</button>
                </div>
            </div>
        </div>
      )}

      {/* 2. 트림 추가 모달 */}
      {isTrimModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl w-96 shadow-2xl">
                <h3 className="font-bold text-lg mb-4">트림 추가</h3>
                <input className="w-full p-2 border rounded mb-2" placeholder="트림명 (예: 프레스티지)" value={newTrim.trim_name} onChange={e=>setNewTrim({...newTrim, trim_name:e.target.value})} />
                <input className="w-full p-2 border rounded mb-2" type="number" placeholder="가격 (숫자만)" value={newTrim.price || ''} onChange={e=>setNewTrim({...newTrim, price:Number(e.target.value)})} />
                <select className="w-full p-2 border rounded mb-4" value={newTrim.fuel_type} onChange={e=>setNewTrim({...newTrim, fuel_type:e.target.value})}>
                    <option value="전기">전기</option>
                    <option value="하이브리드">하이브리드</option>
                    <option value="휘발유">휘발유</option>
                    <option value="경유">경유</option>
                    <option value="LPG">LPG</option>
                </select>
                <div className="flex gap-2">
                    <button onClick={handleCreateTrim} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold">추가</button>
                    <button onClick={()=>setIsTrimModalOpen(false)} className="flex-1 bg-gray-100 py-2 rounded-lg">취소</button>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}