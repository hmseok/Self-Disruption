'use client'
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function CarCodePage() {
  // 1. 상태 관리
  const [models, setModels] = useState<any[]>([])
  const [selectedModel, setSelectedModel] = useState<any>(null)
  const [trims, setTrims] = useState<any[]>([])
  const [options, setOptions] = useState<any[]>([])

  // 2. 견적 계산기 상태
  const [selectedTrim, setSelectedTrim] = useState<any>(null)
  const [checkedOptions, setCheckedOptions] = useState<any[]>([])
  const [totalPrice, setTotalPrice] = useState(0)

  // 3. 견적 보관함 & 기타 상태
  const [savedQuotes, setSavedQuotes] = useState<any[]>([])
  const [quoteSearch, setQuoteSearch] = useState('')
  const [checkedModelIds, setCheckedModelIds] = useState<number[]>([])

  // 4. AI 관련
  const [isAiModalOpen, setIsAiModalOpen] = useState(false)
  const [searchMode, setSearchMode] = useState<'single' | 'brand'>('single')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiRequest, setAiRequest] = useState({ brand: '', model_name: '', year: '' })
  const [progressMsg, setProgressMsg] = useState('')

  // 수동 입력
  const [newModel, setNewModel] = useState({ brand: '', model_name: '', year: new Date().getFullYear() })

  useEffect(() => { fetchModels(); fetchSavedQuotes(); }, [])

  useEffect(() => {
    const tPrice = selectedTrim?.price || 0
    const oPrice = checkedOptions.reduce((acc, cur) => acc + cur.price, 0)
    setTotalPrice(tPrice + oPrice)
  }, [selectedTrim, checkedOptions])

  // --- 함수들 (로직 동일) ---
  const fetchModels = async () => { const { data } = await supabase.from('car_code_models').select('*').order('created_at', { ascending: false }); setModels(data || []); }
  const fetchSavedQuotes = async () => { const { data } = await supabase.from('saved_quotes').select('*').order('created_at', { ascending: false }); setSavedQuotes(data || []); }

  const handleSelectModel = async (model: any) => {
    setSelectedModel(model); setSelectedTrim(null); setCheckedOptions([])
    const { data: tData } = await supabase.from('car_code_trims').select('*').eq('model_id', model.id).order('price'); setTrims(tData || [])
    const { data: oData } = await supabase.from('car_code_options').select('*').eq('model_id', model.id); setOptions(oData || [])
  }

  const handleSaveQuote = async () => {
    if (!selectedModel || !selectedTrim) return alert('모델과 트림을 선택해주세요.')
    const optionNames = checkedOptions.map(o => o.option_name).join(', ')
    const optionTotal = checkedOptions.reduce((acc, cur) => acc + cur.price, 0)
    const payload = { model_name: `${selectedModel.brand} ${selectedModel.model_name}`, trim_name: selectedTrim.trim_name, trim_price: selectedTrim.price, options_summary: optionNames || '기본 옵션', options_price: optionTotal, total_price: totalPrice }
    const { error } = await supabase.from('saved_quotes').insert([payload])
    if (error) alert('실패: ' + error.message); else { alert('✅ 저장 완료!'); fetchSavedQuotes(); }
  }

  const deleteQuote = async (id: number) => { if(confirm('삭제?')) { await supabase.from('saved_quotes').delete().eq('id', id); fetchSavedQuotes(); } }
  const toggleModelCheck = (id: number) => { if (checkedModelIds.includes(id)) setCheckedModelIds(checkedModelIds.filter(i => i !== id)); else setCheckedModelIds([...checkedModelIds, id]) }
  const deleteSelectedModels = async () => { if (!confirm(`선택한 ${checkedModelIds.length}개 삭제?`)) return; await supabase.from('car_code_models').delete().in('id', checkedModelIds); setCheckedModelIds([]); setSelectedModel(null); fetchModels(); }

  // AI & 수동 추가 함수들
  const fetchCarDetail = async (brand: string, modelName: string, yearStr: string) => {
    const response = await fetch('/api/car-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'detail', brand, model: modelName, year: yearStr }) })
    const result = await response.json(); if (result.error) throw new Error(result.error)
    const foundYear = result.found_year || new Date().getFullYear()
    const { data: modelData } = await supabase.from('car_code_models').insert([{ brand, model_name: modelName, year: foundYear }]).select().single()
    if (result.trims?.length) await supabase.from('car_code_trims').insert(result.trims.map((t: any) => ({ model_id: modelData.id, trim_name: t.name, price: t.price, fuel_type: t.fuel })))
    if (result.options?.length) await supabase.from('car_code_options').insert(result.options.map((o: any) => ({ model_id: modelData.id, option_name: o.name, price: o.price })))
  }

  const handleAiExecute = async () => {
    if (!aiRequest.brand) return alert('브랜드 필수'); setAiLoading(true); setProgressMsg('AI 연결 중...')
    try {
        if (searchMode === 'single') {
            if (!aiRequest.model_name) throw new Error('모델명 필수'); await fetchCarDetail(aiRequest.brand, aiRequest.model_name, aiRequest.year); alert(`✅ [${aiRequest.model_name}] 완료!`); setIsAiModalOpen(false)
        } else {
            setProgressMsg(`🔍 [${aiRequest.brand}] 스캔 중...`); const scanRes = await fetch('/api/car-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'scan_brand', brand: aiRequest.brand }) })
            const { models } = await scanRes.json(); if (!models?.length) throw new Error('차종 없음')
            for (let i = 0; i < models.length; i++) { setProgressMsg(`[${i+1}/${models.length}] ${models[i]} 수집 중...`); await fetchCarDetail(aiRequest.brand, models[i], aiRequest.year); await new Promise(r => setTimeout(r, 500)) }
            alert(`✅ ${models.length}대 일괄 완료!`); setIsAiModalOpen(false)
        }
        fetchModels()
    } catch (e: any) { alert('실패: ' + e.message) } finally { setAiLoading(false) }
  }

  const addModel = async () => { await supabase.from('car_code_models').insert([newModel]); setNewModel({...newModel, model_name:''}); fetchModels(); }
  const toggleOption = (opt: any) => { if (checkedOptions.find(o => o.id === opt.id)) setCheckedOptions(checkedOptions.filter(o => o.id !== opt.id)); else setCheckedOptions([...checkedOptions, opt]) }
  const f = (n: number) => n?.toLocaleString() || '0'
  const filteredQuotes = savedQuotes.filter(q => q.model_name.includes(quoteSearch) || q.options_summary.includes(quoteSearch))

  return (
    // 📌 [수정됨] h-screen과 overflow-hidden으로 전체 스크롤 방지
    <div className="flex flex-col h-[calc(100vh-2rem)] p-6 gap-4 overflow-hidden animate-fade-in">

      {/* 1. 헤더 (고정 높이) */}
      <div className="shrink-0 flex justify-between items-end pb-2 border-b">
          <div>
            <h1 className="text-2xl font-black">🏗️ 차량 표준 코드 & 견적기</h1>
            <p className="text-sm text-gray-500">AI 데이터 수집 및 실시간 견적 산출</p>
          </div>
          <button onClick={() => setIsAiModalOpen(true)} className="bg-black text-white px-5 py-2.5 rounded-xl font-bold hover:bg-gray-800 shadow-lg text-sm transition-transform hover:-translate-y-1">
            ✨ AI 데이터 가져오기
          </button>
      </div>

      {/* 2. 메인 작업 영역 (남는 공간 모두 차지: flex-1) */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-6">

        {/* 🟥 왼쪽: 모델 목록 */}
        <div className="col-span-4 bg-white rounded-2xl border shadow-sm flex flex-col h-full overflow-hidden">
            <div className="shrink-0 p-3 bg-gray-50 border-b font-bold flex justify-between items-center">
                <span className="text-sm">📂 모델 목록</span>
                {checkedModelIds.length > 0 && (
                    <button onClick={deleteSelectedModels} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded font-bold hover:bg-red-200">
                        선택 삭제 ({checkedModelIds.length})
                    </button>
                )}
            </div>

            <div className="shrink-0 p-3 border-b flex gap-2">
                <input className="w-1/3 p-2 border rounded text-xs" placeholder="브랜드" value={newModel.brand} onChange={e=>setNewModel({...newModel, brand: e.target.value})} />
                <input className="w-2/3 p-2 border rounded text-xs" placeholder="모델명" value={newModel.model_name} onChange={e=>setNewModel({...newModel, model_name: e.target.value})} />
                <button onClick={addModel} className="bg-gray-800 text-white px-3 rounded text-xs font-bold">+</button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {models.map(m => (
                    <div key={m.id} onClick={() => handleSelectModel(m)} className={`p-3 border-b cursor-pointer hover:bg-gray-50 flex items-center gap-3 group ${selectedModel?.id === m.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''}`}>
                        <input type="checkbox" onClick={e=>e.stopPropagation()} onChange={()=>toggleModelCheck(m.id)} checked={checkedModelIds.includes(m.id)} className="w-4 h-4" />
                        <div className="flex-1">
                            <div className="font-bold text-sm text-gray-900">{m.brand} {m.model_name}</div>
                            <div className="text-xs text-gray-400">{m.year}년형</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* 🟦 가운데: 견적 계산기 (flex-col로 높이 꽉 채움) */}
        <div className="col-span-8 flex flex-col gap-4 h-full overflow-hidden">
            {!selectedModel ? (
                <div className="h-full flex items-center justify-center bg-gray-100 rounded-2xl border border-dashed text-gray-400 font-bold">
                    👈 모델을 선택해주세요.
                </div>
            ) : (
                <>
                    {/* 상단: 트림 선택 (스크롤 가능하게) */}
                    <div className="flex-1 min-h-0 bg-white p-4 rounded-2xl border shadow-sm flex flex-col overflow-hidden">
                        <h3 className="shrink-0 text-sm font-bold mb-3 flex items-center gap-2">
                            🏷️ <span className="text-blue-600">{selectedModel.model_name}</span> 트림
                        </h3>
                        <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-3 content-start">
                            {trims.map(t => (
                                <div key={t.id} onClick={() => setSelectedTrim(t)} className={`p-3 border-2 rounded-xl cursor-pointer transition-all ${selectedTrim?.id === t.id ? 'border-blue-600 bg-blue-50' : 'border-gray-100 hover:border-blue-200'}`}>
                                    <div className="font-bold text-sm">{t.trim_name}</div>
                                    <div className="text-xs text-gray-500 mt-1">{f(t.price)}원</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 중단: 옵션 선택 (스크롤 가능하게) */}
                    <div className="flex-1 min-h-0 bg-white p-4 rounded-2xl border shadow-sm flex flex-col overflow-hidden">
                        <h3 className="shrink-0 text-sm font-bold mb-3">✨ 옵션</h3>
                        <div className="flex-1 overflow-y-auto space-y-2">
                            {options.map(o => (
                                <label key={o.id} className={`flex items-center justify-between p-2.5 border rounded-xl cursor-pointer ${checkedOptions.find(opt=>opt.id===o.id) ? 'bg-green-50 border-green-500' : 'hover:bg-gray-50'}`}>
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" checked={!!checkedOptions.find(opt=>opt.id===o.id)} onChange={()=>toggleOption(o)} className="w-4 h-4 text-green-600" />
                                        <span className="text-sm font-bold text-gray-700">{o.option_name}</span>
                                    </div>
                                    <span className="text-sm font-bold text-green-600">+{f(o.price)}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* 하단: 합계바 (고정) */}
                    <div className="shrink-0 bg-gray-900 text-white p-4 rounded-xl shadow-lg flex justify-between items-center">
                        <div>
                            <div className="text-xs text-gray-400">최종 차량가액</div>
                            <div className="text-2xl font-black text-yellow-400">{f(totalPrice)}원</div>
                        </div>
                        <button onClick={handleSaveQuote} className="bg-yellow-400 text-black px-6 py-2.5 rounded-lg font-bold hover:bg-yellow-300 text-sm">
                            💾 저장
                        </button>
                    </div>
                </>
            )}
        </div>
      </div>

      {/* 3. 하단 보관함 (고정 높이: h-60) */}
      <div className="shrink-0 h-60 bg-white border rounded-xl flex flex-col overflow-hidden shadow-sm">
          <div className="shrink-0 p-3 bg-gray-50 border-b flex justify-between items-center">
              <h2 className="text-sm font-black">📦 견적 보관함</h2>
              <input className="border p-1.5 rounded text-xs w-48 bg-white" placeholder="보관함 검색..." value={quoteSearch} onChange={e=>setQuoteSearch(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                      <tr><th className="p-3">모델/트림</th><th className="p-3">옵션</th><th className="p-3 text-right">금액</th><th className="p-3 text-center">관리</th></tr>
                  </thead>
                  <tbody className="divide-y">
                      {filteredQuotes.map(q => (
                          <tr key={q.id} className="hover:bg-gray-50">
                              <td className="p-3"><div className="font-bold">{q.model_name}</div><div className="text-gray-500">{q.trim_name}</div></td>
                              <td className="p-3 text-gray-600 max-w-xs truncate">{q.options_summary}</td>
                              <td className="p-3 text-right font-bold text-blue-600">{f(q.total_price)}원</td>
                              <td className="p-3 text-center"><button onClick={() => deleteQuote(q.id)} className="text-red-500 hover:text-red-700 font-bold">삭제</button></td>
                          </tr>
                      ))}
                      {filteredQuotes.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-gray-400">보관된 견적이 없습니다.</td></tr>}
                  </tbody>
              </table>
          </div>
      </div>

      {/* AI 모달 (기존 동일) */}
      {isAiModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setIsAiModalOpen(false)}>
            <div className="bg-white p-0 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 text-white flex justify-between items-center">
                    <h2 className="text-lg font-bold">🤖 AI 에이전트</h2>
                    <button onClick={() => setIsAiModalOpen(false)} className="text-white opacity-70 hover:opacity-100">×</button>
                </div>
                <div className="flex border-b">
                    <button onClick={() => setSearchMode('single')} className={`flex-1 py-3 text-sm font-bold ${searchMode === 'single' ? 'text-purple-600 border-b-2 bg-purple-50' : 'text-gray-400'}`}>단일 검색</button>
                    <button onClick={() => setSearchMode('brand')} className={`flex-1 py-3 text-sm font-bold ${searchMode === 'brand' ? 'text-purple-600 border-b-2 bg-purple-50' : 'text-gray-400'}`}>브랜드 스캔</button>
                </div>
                <div className="p-6 space-y-3">
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">브랜드</label><input className="w-full p-2.5 border rounded-lg font-bold" placeholder="예: BMW" value={aiRequest.brand} onChange={e=>setAiRequest({...aiRequest, brand: e.target.value})} autoFocus /></div>
                    {searchMode === 'single' && (
                        <>
                            <div><label className="block text-xs font-bold text-gray-500 mb-1">모델명</label><input className="w-full p-2.5 border rounded-lg font-bold" placeholder="예: X5" value={aiRequest.model_name} onChange={e=>setAiRequest({...aiRequest, model_name: e.target.value})} /></div>
                            <div><label className="block text-xs font-bold text-purple-600 mb-1">연식 (선택)</label><input className="w-full p-2.5 border-2 border-purple-100 rounded-lg font-bold text-purple-700" placeholder="예: 2024" value={aiRequest.year} onChange={e=>setAiRequest({...aiRequest, year: e.target.value})} /></div>
                        </>
                    )}
                    <button onClick={handleAiExecute} disabled={aiLoading} className="w-full bg-black text-white py-3.5 rounded-xl font-bold hover:bg-gray-800 disabled:bg-gray-400 mt-2">
                        {aiLoading ? <span className="animate-pulse">{progressMsg || '처리 중...'}</span> : '🚀 실행하기'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}