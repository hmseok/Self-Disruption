'use client'
import { supabase } from '../../utils/supabase'
import { useEffect, useState } from 'react'
export default function CarCodePage() {
  // 상태값들 (기존 유지)
  const [models, setModels] = useState<any[]>([])
  const [selectedModel, setSelectedModel] = useState<any>(null)
  const [trims, setTrims] = useState<any[]>([])
  const [options, setOptions] = useState<any[]>([])
  const [selectedTrim, setSelectedTrim] = useState<any>(null)
  const [checkedOptions, setCheckedOptions] = useState<any[]>([])
  const [totalPrice, setTotalPrice] = useState(0)
  const [quotes, setQuotes] = useState<any[]>([])
  const [quoteSearch, setQuoteSearch] = useState('')
  const [selectedQuote, setSelectedQuote] = useState<any>(null)
  const [isAiModalOpen, setIsAiModalOpen] = useState(false)
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiRequest, setAiRequest] = useState({ brand: '', model_name: '', year: '' })
  const [searchMode, setSearchMode] = useState<'single' | 'brand'>('single')
  const [progressMsg, setProgressMsg] = useState('')
  const [rentalType, setRentalType] = useState<'daily' | 'monthly' | 'long'>('long')
  const [targetTerm, setTargetTerm] = useState('48')
  const [newModel, setNewModel] = useState({ brand: '', model_name: '', year: new Date().getFullYear() })
  const [checkedModelIds, setCheckedModelIds] = useState<number[]>([])

  // ✅ [UPGRADE] 잔존가치(residual_pref) 옵션 추가
  const [conditions, setConditions] = useState({
      mileage: '2만km/년',
      age: '만 26세 이상',
      deposit: '보증금 0%',
      maintenance: false,
      type: 'buyout',
      residual_pref: 'max', // max(최대잔가/월납↓) | standard(표준잔가/인수부담↓)
      penalty_pref: 'standard'
  })

  useEffect(() => { fetchModels(); fetchQuotes(); }, [])
  useEffect(() => {
    const tPrice = selectedTrim?.price || 0
    const oPrice = checkedOptions.reduce((acc, cur) => acc + cur.price, 0)
    setTotalPrice(tPrice + oPrice)
  }, [selectedTrim, checkedOptions])
  useEffect(() => {
    if (rentalType === 'daily') setTargetTerm('1')
    else if (rentalType === 'monthly') setTargetTerm('1')
    else setTargetTerm('48')
  }, [rentalType])

  const fetchModels = async () => { const { data } = await supabase.from('car_code_models').select('*').order('created_at', { ascending: false }); setModels(data || []); }
  const fetchQuotes = async () => { const { data } = await supabase.from('lotte_rentcar_db').select('*').order('created_at', { ascending: false }); setQuotes(data || []); }

  const handleSelectModel = async (model: any) => {
    setSelectedModel(model); setSelectedTrim(null); setCheckedOptions([])
    const { data: tData } = await supabase.from('car_code_trims').select('*').eq('model_id', model.id).order('price'); setTrims(tData || [])
    const { data: oData } = await supabase.from('car_code_options').select('*').eq('model_id', model.id); setOptions(oData || [])
  }

  // 🔥 AI 견적 산출 (잔가 전략 반영)
  const handleCalculateQuote = async () => {
    if (!selectedModel || !selectedTrim) return alert('트림을 먼저 선택해주세요.')
    setAiLoading(true)
    try {
        const response = await fetch('/api/car-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'estimate_price',
                rental_type: rentalType,
                brand: selectedModel.brand,
                model: selectedModel.model_name,
                term: Number(targetTerm),
                vehicle_price: totalPrice,
                conditions: conditions // 잔가 전략(residual_pref) 포함
            })
        })
        const result = await response.json()
        if (result.error) throw new Error(result.error)

        const optionNames = checkedOptions.map(o => o.option_name).join(', ')

        const metaData = JSON.stringify({
            ...result.contract_details,
            rental_type: rentalType,
            options_included: optionNames,
            vehicle_price_used: totalPrice,
            conditions_input: conditions,
            competitor_comparison: result.competitor_comparison,
            market_comment: result.market_comment
        })

        // 태그에 잔가 전략 표시
        let typeTag = ''
        if (rentalType === 'daily') typeTag = '[단기] '
        else if (rentalType === 'monthly') typeTag = '[월간] '
        else typeTag = conditions.type === 'buyout'
            ? (conditions.residual_pref === 'max' ? '[인수형/고잔가] ' : '[인수형/표준] ')
            : '[반납형] '

        await supabase.from('lotte_rentcar_db').insert([{
            brand: selectedModel.brand, model: selectedModel.model_name,
            trim: typeTag + selectedTrim.trim_name, term: Number(targetTerm),
            deposit_rate: 0, monthly_price: result.estimated_price || 0,
            memo: metaData
        }])

        alert(`✅ 견적 스캔 완료!\n(월 ${f(result.estimated_price)}원)`)
        setIsQuoteModalOpen(false)
        fetchQuotes()

    } catch (e: any) { alert('실패: ' + e.message) } finally { setAiLoading(false) }
  }

  // 유틸리티
  const handleAiExecute = async () => { /* 기존 AI 수집 로직 유지 */
      if (!aiRequest.brand) return alert('브랜드 필수'); setAiLoading(true); setProgressMsg('AI 연결 중...')
      try {
        const fetchCarDetail = async (brand: string, modelName: string, yearStr: string) => {
            const response = await fetch('/api/car-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'detail', brand, model: modelName, year: yearStr }) })
            const result = await response.json(); if(result.error) throw new Error(result.error);
            const foundYear = result.found_year || new Date().getFullYear()
            const { data: modelData } = await supabase.from('car_code_models').insert([{ brand, model_name: modelName, year: foundYear }]).select().single()
            if (result.trims?.length) await supabase.from('car_code_trims').insert(result.trims.map((t: any) => ({ model_id: modelData.id, trim_name: t.name, price: t.price, fuel_type: t.fuel })))
            if (result.options?.length) await supabase.from('car_code_options').insert(result.options.map((o: any) => ({ model_id: modelData.id, option_name: o.name, price: o.price })))
        }
        if (searchMode === 'single') { await fetchCarDetail(aiRequest.brand, aiRequest.model_name, aiRequest.year); alert('완료'); setIsAiModalOpen(false); }
        else {
            const scanRes = await fetch('/api/car-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'scan_brand', brand: aiRequest.brand }) }); const { models } = await scanRes.json()
            for (let i = 0; i < models.length; i++) { setProgressMsg(`[${i+1}/${models.length}] ${models[i]} 수집...`); await fetchCarDetail(aiRequest.brand, models[i], aiRequest.year); await new Promise(r => setTimeout(r, 500)) }
            alert('완료'); setIsAiModalOpen(false);
        }
        fetchModels();
      } catch (e: any) { alert(e.message) } finally { setAiLoading(false) }
  }
  const f = (n: number) => n?.toLocaleString() || '0'
  const parseContract = (item: any) => { try { return JSON.parse(item.memo) } catch { return {} } }
  const getTypeColor = (type: string) => { if (type === 'daily') return 'text-orange-600 bg-orange-50 border-orange-200'; if (type === 'monthly') return 'text-green-600 bg-green-50 border-green-200'; return 'text-blue-600 bg-blue-50 border-blue-200'; }
  const toggleOption = (opt: any) => { if (checkedOptions.find(o => o.id === opt.id)) setCheckedOptions(checkedOptions.filter(o => o.id !== opt.id)); else setCheckedOptions([...checkedOptions, opt]) }
  const addModel = async () => { await supabase.from('car_code_models').insert([newModel]); setNewModel({...newModel, model_name:''}); fetchModels(); }
  const deleteQuote = async (id: number) => { if(confirm('삭제?')) { await supabase.from('lotte_rentcar_db').delete().eq('id', id); fetchQuotes(); } }
  const deleteSelectedModels = async () => { if(confirm('삭제?')) { await supabase.from('car_code_models').delete().in('id', checkedModelIds); setCheckedModelIds([]); fetchModels(); setSelectedModel(null); } }
  const toggleModelCheck = (id: number) => { if (checkedModelIds.includes(id)) setCheckedModelIds(checkedModelIds.filter(i => i !== id)); else setCheckedModelIds([...checkedModelIds, id]) }
  const filteredQuotes = quotes.filter(q => q.model.includes(quoteSearch) || q.brand.includes(quoteSearch))


  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] p-6 gap-4 overflow-hidden animate-fade-in">

      {/* 1. 헤더 */}
      <div className="shrink-0 flex justify-between items-end pb-2 border-b">
          <div><h1 className="text-2xl font-black">🏗️ 통합 차량 관리 & AI 견적</h1><p className="text-sm text-gray-500">차량 데이터 및 AI 기반 경쟁사 상세 견적 분석</p></div>
          <button onClick={() => setIsAiModalOpen(true)} className="bg-black text-white px-5 py-2.5 rounded-xl font-bold hover:bg-gray-800 shadow-lg text-sm transition-transform hover:-translate-y-1">✨ AI 데이터 수집</button>
      </div>

      {/* 2. 메인 작업 영역 */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-6">

        {/* [좌측] 모델 목록 */}
        <div className="col-span-3 bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden">
            <div className="shrink-0 p-3 bg-gray-50 border-b font-bold flex justify-between items-center"><span className="text-sm">📂 모델 목록</span>{checkedModelIds.length > 0 && <button onClick={deleteSelectedModels} className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">삭제</button>}</div>
            <div className="shrink-0 p-2 border-b flex gap-1"><input className="w-1/3 p-1.5 border rounded text-xs" placeholder="브랜드" value={newModel.brand} onChange={e=>setNewModel({...newModel, brand: e.target.value})} /><input className="w-2/3 p-1.5 border rounded text-xs" placeholder="모델명" value={newModel.model_name} onChange={e=>setNewModel({...newModel, model_name: e.target.value})} /><button onClick={addModel} className="bg-gray-800 text-white px-2 rounded text-xs">+</button></div>
            <div className="flex-1 overflow-y-auto">{models.map(m => (<div key={m.id} onClick={() => handleSelectModel(m)} className={`p-3 border-b cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${selectedModel?.id === m.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''}`}><input type="checkbox" onClick={e=>e.stopPropagation()} onChange={()=>toggleModelCheck(m.id)} checked={checkedModelIds.includes(m.id)} className="w-3 h-3" /><div><div className="font-bold text-sm">{m.brand} {m.model_name}</div><div className="text-xs text-gray-400">{m.year}년형</div></div></div>))}</div>
        </div>

        {/* [중앙] 트림/옵션 & 계산기 */}
        <div className="col-span-5 flex flex-col gap-4 h-full overflow-hidden">
            {!selectedModel ? <div className="h-full flex items-center justify-center bg-gray-100 rounded-2xl border border-dashed text-gray-400 font-bold">👈 모델을 선택하세요</div> : (
                <>
                    <div className="flex-1 min-h-0 bg-white p-4 rounded-2xl border shadow-sm flex flex-col overflow-hidden"><h3 className="shrink-0 text-sm font-bold mb-3">🏷️ 트림 선택</h3><div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 content-start">{trims.map(t => (<div key={t.id} onClick={() => setSelectedTrim(t)} className={`p-3 border rounded-xl cursor-pointer transition-all ${selectedTrim?.id === t.id ? 'border-blue-600 bg-blue-50' : 'hover:bg-gray-50'}`}><div className="font-bold text-sm">{t.trim_name}</div><div className="text-xs text-gray-500">{f(t.price)}원</div></div>))}</div></div>
                    <div className="flex-1 min-h-0 bg-white p-4 rounded-2xl border shadow-sm flex flex-col overflow-hidden"><h3 className="shrink-0 text-sm font-bold mb-3">✨ 옵션 선택</h3><div className="flex-1 overflow-y-auto space-y-1">{options.map(o => (<label key={o.id} className={`flex items-center justify-between p-2 border rounded-lg cursor-pointer ${checkedOptions.find(opt=>opt.id===o.id) ? 'bg-green-50 border-green-500' : 'hover:bg-gray-50'}`}><div className="flex gap-2 items-center"><input type="checkbox" checked={!!checkedOptions.find(opt=>opt.id===o.id)} onChange={()=>toggleOption(o)} className="w-4 h-4 text-green-600" /><span className="text-xs font-bold">{o.option_name}</span></div><span className="text-xs font-bold text-green-600">+{f(o.price)}</span></label>))}</div></div>
                    <div className="shrink-0 bg-gray-900 text-white p-4 rounded-xl shadow-lg flex justify-between items-center"><div><div className="text-xs text-gray-400">최종 차량가액</div><div className="text-2xl font-black text-yellow-400">{f(totalPrice)}원</div></div><button onClick={() => setIsQuoteModalOpen(true)} disabled={!selectedTrim} className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold hover:opacity-90 disabled:opacity-50">🚀 견적 조건 설정</button></div>
                </>
            )}
        </div>

        {/* [우측] 견적 목록 */}
        <div className="col-span-4 bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden">
            <div className="shrink-0 p-3 bg-gray-50 border-b font-bold flex justify-between items-center"><span className="text-sm">📦 생성된 견적</span><input className="bg-white border p-1 rounded text-xs w-24" placeholder="검색..." value={quoteSearch} onChange={e=>setQuoteSearch(e.target.value)} /></div>
            <div className="flex-1 overflow-y-auto">{filteredQuotes.map(q => { const d = parseContract(q); const rType = d.rental_type || 'long'; return (<div key={q.id} className="p-3 border-b hover:bg-gray-50 flex justify-between items-center cursor-pointer group" onClick={() => setSelectedQuote({...q, rType})}><div><div className="flex items-center gap-2 mb-1"><span className={`text-[10px] px-1.5 border rounded font-bold ${getTypeColor(rType)}`}>{rType==='daily'?'단기':rType==='monthly'?'월간':'장기'}</span><span className="font-bold text-sm text-gray-900 group-hover:text-blue-600">{q.model}</span></div><div className="text-xs text-gray-500">{q.trim.replace(/\[.*?\]/, '')} / {q.term}{rType==='daily'?'일':'개월'}</div></div><div className="text-right"><div className="font-bold text-sm text-red-600">{f(q.monthly_price)}원</div><button onClick={(e)=>{e.stopPropagation(); deleteQuote(q.id)}} className="text-xs text-gray-300 hover:text-red-500 mt-1">삭제</button></div></div>) })}</div>
        </div>
      </div>

      {/* 🟣 [모달 1] 상세 견적 설정 (잔가 전략 옵션 추가) */}
      {isQuoteModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setIsQuoteModalOpen(false)}>
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 text-white flex justify-between items-center"><h2 className="text-lg font-bold">🤖 상세 견적 조건</h2><button onClick={() => setIsQuoteModalOpen(false)} className="text-white opacity-70">×</button></div>
                <div className="flex border-b bg-gray-50"><button onClick={() => setRentalType('daily')} className={`flex-1 py-3 text-xs font-bold ${rentalType === 'daily' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-400'}`}>🌞 단기</button><button onClick={() => setRentalType('monthly')} className={`flex-1 py-3 text-xs font-bold ${rentalType === 'monthly' ? 'text-green-600 border-b-2 border-green-500' : 'text-gray-400'}`}>📅 중기</button><button onClick={() => setRentalType('long')} className={`flex-1 py-3 text-xs font-bold ${rentalType === 'long' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-400'}`}>🏢 장기</button></div>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div className="bg-gray-100 p-3 rounded-lg text-center"><div className="text-xs text-gray-500">기준 차량가 (옵션포함)</div><div className="text-xl font-black text-gray-900">{f(totalPrice)}원</div></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">{rentalType === 'daily' ? '대여일수' : '계약기간'}</label><select className="w-full p-2 border rounded font-bold" value={targetTerm} onChange={e=>setTargetTerm(e.target.value)}>{rentalType === 'daily' && [1,2,3,5,7].map(d=><option key={d} value={d}>{d}일</option>)}{rentalType === 'monthly' && [1,3,6,11].map(m=><option key={m} value={m}>{m}개월</option>)}{rentalType === 'long' && [24,36,48,60].map(y=><option key={y} value={y}>{y}개월</option>)}</select></div>
                    {rentalType === 'long' && (
                        <div className="space-y-4">
                             <div className="grid grid-cols-2 gap-2">
                                <div><label className="block text-xs font-bold text-gray-500 mb-1">운전연령</label><select className="w-full p-2 border rounded text-xs" value={conditions.age} onChange={e=>setConditions({...conditions, age: e.target.value})}><option>만 26세 이상</option><option>만 21세 이상</option></select></div>
                                <div><label className="block text-xs font-bold text-gray-500 mb-1">주행거리</label><select className="w-full p-2 border rounded text-xs" value={conditions.mileage} onChange={e=>setConditions({...conditions, mileage: e.target.value})}><option>1만km/년</option><option>2만km/년</option><option>3만km/년</option><option>무제한</option></select></div>
                             </div>

                             {/* 금융 조건 */}
                             <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                <label className="block text-xs font-bold text-gray-500 mb-1">초기 비용</label>
                                <select className="w-full p-2 border rounded text-xs mb-2" value={conditions.deposit} onChange={e=>setConditions({...conditions, deposit: e.target.value})}><option>보증금 0% (무보증)</option><option>보증금 30%</option><option>선납금 30%</option></select>

                                {/* 인수/반납 선택 */}
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">계약 형태</label>
                                        <select className="w-full p-2 border rounded text-xs" value={conditions.type} onChange={e=>setConditions({...conditions, type: e.target.value})}>
                                            <option value="buyout">인수형 (선택가능)</option>
                                            <option value="return">반납형 (반납필수)</option>
                                        </select>
                                    </div>
                                    {/* 잔존가치 설정 (인수형일 때 활성화) */}
                                    {conditions.type === 'buyout' && (
                                        <div>
                                            <label className="block text-xs font-bold text-blue-600 mb-1">잔존가치 전략</label>
                                            <select className="w-full p-2 border rounded text-xs bg-blue-50 text-blue-800 font-bold" value={conditions.residual_pref} onChange={e=>setConditions({...conditions, residual_pref: e.target.value})}>
                                                <option value="standard">표준 (인수부담↓)</option>
                                                <option value="max">최대 (월납입금↓)</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                             </div>

                             <div className="grid grid-cols-2 gap-2">
                                <div><label className="block text-xs font-bold text-gray-500 mb-1">정비 옵션</label><select className="w-full p-2 border rounded text-xs" value={conditions.maintenance ? 'included' : 'self'} onChange={e=>setConditions({...conditions, maintenance: e.target.value === 'included'})}><option value="self">자가정비</option><option value="included">정비포함</option></select></div>
                                <div><label className="block text-xs font-bold text-gray-500 mb-1">위약금 정책</label><select className="w-full p-2 border rounded text-xs" value={conditions.penalty_pref} onChange={e=>setConditions({...conditions, penalty_pref: e.target.value})}><option value="standard">표준 약관</option><option value="low">저위약금형</option></select></div>
                             </div>
                        </div>
                    )}
                    <button onClick={handleCalculateQuote} disabled={aiLoading} className="w-full bg-black text-white py-3 rounded-xl font-bold hover:bg-gray-800 disabled:opacity-50 shadow-lg">{aiLoading ? '조건 스캔 중...' : '견적 검색하기 🚀'}</button>
                </div>
            </div>
        </div>
      )}

      {/* 📄 [모달 2] 견적서 뷰어 (상세 표시) */}
      {selectedQuote && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setSelectedQuote(null)}>
            <div className="bg-white w-full max-w-[800px] min-h-[600px] rounded-sm shadow-2xl overflow-hidden animate-fade-in-up flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="bg-slate-900 text-white p-8 flex justify-between items-start shrink-0"><div><h2 className="text-3xl font-serif font-black tracking-wider">MARKET REPORT</h2><p className="text-sm text-slate-400 mt-2 tracking-widest uppercase">AI Contract Analysis ({selectedQuote.rType})</p></div><div className="text-right"><div className="text-sm text-slate-400 mb-1">Estimated Price</div><div className="text-4xl font-bold text-yellow-400">{f(selectedQuote.monthly_price)} <span className="text-lg font-normal text-white">KRW</span></div></div></div>
                <div className="p-8 flex-1 overflow-y-auto bg-slate-50">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 mb-6 flex justify-between items-center"><div><div className="text-2xl font-bold text-slate-900">{selectedQuote.brand} {selectedQuote.model}</div><div className="text-sm text-slate-500 mt-1">{selectedQuote.trim.replace(/\[.*?\]/, '')}</div></div><div className="text-right"><div className="text-xs text-slate-400">차량가</div><div className="text-lg font-bold text-slate-800">{f(parseContract(selectedQuote).vehicle_price_used)}원</div></div></div>

                    {/* 적용 조건 확인 박스 */}
                    <div className="mb-6 bg-white p-4 rounded-lg border border-slate-200 text-xs text-slate-600 grid grid-cols-3 gap-y-2">
                        <div>▪️ 계약: <b>{selectedQuote.term}개월</b></div>
                        <div>▪️ 구분: <b>{parseContract(selectedQuote).conditions_input?.type === 'buyout' ? '인수선택형' : '반납전용'}</b></div>
                        <div>▪️ 잔존가치: <b className="text-blue-600">{parseContract(selectedQuote).conditions_input?.residual_pref === 'max' ? '최대설정 (월납↓)' : '표준설정 (인수↓)'}</b></div>
                        <div>▪️ 초기비용: <b>{parseContract(selectedQuote).conditions_input?.deposit}</b></div>
                        <div>▪️ 주행거리: <b>{parseContract(selectedQuote).conditions_input?.mileage}</b></div>
                        <div>▪️ 정비: <b>{parseContract(selectedQuote).conditions_input?.maintenance ? '포함' : '자가'}</b></div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-white p-4 rounded-lg border border-slate-200 text-center"><div className="text-xs text-slate-400 font-bold mb-1">만기 인수가</div><div className="text-lg font-black text-blue-600">{parseContract(selectedQuote).residual_value ? f(parseContract(selectedQuote).residual_value) + '원' : '-'}</div></div>
                        <div className="bg-white p-4 rounded-lg border border-slate-200 text-center"><div className="text-xs text-slate-400 font-bold mb-1">초과 운행금</div><div className="text-lg font-black text-slate-700">{parseContract(selectedQuote).excess_mileage_fee ? parseContract(selectedQuote).excess_mileage_fee + '원/km' : '-'}</div></div>
                        <div className="bg-white p-4 rounded-lg border border-slate-200 text-center"><div className="text-xs text-slate-400 font-bold mb-1">위약금율</div><div className="text-lg font-black text-red-600">{parseContract(selectedQuote).penalty_rate || '-'}</div></div>
                    </div>
                    <div className="mb-6"><h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">🏆 Competitor Comparison</h3><div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"><table className="w-full text-sm"><thead className="bg-slate-100 text-slate-500"><tr><th className="p-3 text-left">업체명</th><th className="p-3 text-right">견적가</th><th className="p-3 text-left pl-6">비고</th></tr></thead><tbody className="divide-y divide-slate-100">{parseContract(selectedQuote).competitor_comparison?.map((comp: any, i: number) => (<tr key={i} className={i===0?"bg-yellow-50/50 font-bold":""}><td className="p-4 font-bold text-slate-700">{i===0&&"🥇 "} {comp.company}</td><td className="p-4 text-right font-black text-blue-600">{f(comp.price)}원</td><td className="p-4 pl-6 text-slate-500 text-xs">{comp.note}</td></tr>)) || <tr><td colSpan={3} className="p-6 text-center text-slate-400">데이터 없음</td></tr>}</tbody></table></div></div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-xs text-blue-800 flex gap-3"><span className="text-xl">📊</span><div><b className="block mb-1">Market Insight:</b>{parseContract(selectedQuote).market_comment || '분석 코멘트가 없습니다.'}</div></div>
                </div>
                <div className="bg-white p-4 border-t text-center shrink-0"><button onClick={() => setSelectedQuote(null)} className="px-8 py-2 bg-slate-100 hover:bg-slate-200 rounded font-bold text-slate-600 text-sm transition-colors">닫기</button></div>
            </div>
        </div>
      )}

      {/* AI 수집 모달 (기존 동일) */}
      {isAiModalOpen && (<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setIsAiModalOpen(false)}><div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}><h2 className="text-lg font-bold">✨ AI 데이터 수집</h2><div className="flex border-b"><button onClick={()=>setSearchMode('single')} className={`flex-1 py-2 text-xs font-bold ${searchMode==='single'?'text-purple-600 border-b-2 border-purple-600':''}`}>단일</button><button onClick={()=>setSearchMode('brand')} className={`flex-1 py-2 text-xs font-bold ${searchMode==='brand'?'text-purple-600 border-b-2 border-purple-600':''}`}>브랜드</button></div><div><input className="w-full p-2 border rounded text-xs" placeholder="브랜드" value={aiRequest.brand} onChange={e=>setAiRequest({...aiRequest, brand: e.target.value})} /></div>{searchMode==='single'&&<input className="w-full p-2 border rounded text-xs" placeholder="모델명" value={aiRequest.model_name} onChange={e=>setAiRequest({...aiRequest, model_name: e.target.value})} />}<button onClick={handleAiExecute} disabled={aiLoading} className="w-full bg-black text-white py-3 rounded-lg font-bold text-sm disabled:opacity-50">{aiLoading?progressMsg||'수집 중...':'실행'}</button><button onClick={()=>setIsAiModalOpen(false)} className="w-full py-2 text-xs text-gray-400">닫기</button></div></div>)}
    </div>
  )
}