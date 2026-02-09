'use client'
import { supabase } from '../../utils/supabase'
import { useEffect, useState } from 'react'
export default function LotteDbPage() {
  const [list, setList] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  // 🤖 AI 상태
  const [isAiModalOpen, setIsAiModalOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  // 🕹️ [NEW] 렌탈 타입 상태 (기본값: 장기)
  const [rentalType, setRentalType] = useState<'daily' | 'monthly' | 'long'>('long')

  const [targetModel, setTargetModel] = useState('')
  const [targetBrand, setTargetBrand] = useState('')
  const [targetTerm, setTargetTerm] = useState('48')

  // 📋 상세 계약 조건
  const [conditions, setConditions] = useState({
      mileage: '2만km',
      age: '만 26세 이상',
      deposit: '보증금 0%',
      maintenance: false,
      type: 'buyout'
  })

  const [selectedContract, setSelectedContract] = useState<any>(null)
  const [checkedIds, setCheckedIds] = useState<number[]>([])

  useEffect(() => { fetchList() }, [])

  // 🔄 렌탈 타입 변경 시 기간 기본값 자동 세팅
  useEffect(() => {
    if (rentalType === 'daily') setTargetTerm('1')      // 1일
    else if (rentalType === 'monthly') setTargetTerm('1') // 1개월
    else setTargetTerm('48')                            // 48개월
  }, [rentalType])

  const fetchList = async () => {
    const { data } = await supabase.from('lotte_rentcar_db').select('*').order('created_at', { ascending: false })
    setList(data || [])
  }

  // 🔥 AI 견적 요청
  const handleRealAiEstimate = async () => {
    if (!targetBrand || !targetModel) return alert('브랜드와 차종을 입력해주세요.')
    setAiLoading(true)
    try {
        const response = await fetch('/api/car-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'estimate_price',
                rental_type: rentalType, // 👈 렌탈 타입 전송
                brand: targetBrand, model: targetModel, term: Number(targetTerm),
                conditions: conditions
            })
        })
        const result = await response.json()
        if (result.error) throw new Error(result.error)

        // 메타데이터 저장 (타입 정보 포함)
        const metaData = JSON.stringify({
            ...result.contract_details,
            rental_type: rentalType, // 👈 메타데이터에 타입 저장
            conditions_input: conditions
        })

        // 화면 표시용 태그 생성
        let typeTag = ''
        if (rentalType === 'daily') typeTag = '[단기] '
        else if (rentalType === 'monthly') typeTag = '[월간] '

        const payload = {
            brand: targetBrand,
            model: targetModel,
            trim: typeTag + (conditions.mileage || '기본'), // 트림 컬럼에 태그 표시
            term: Number(targetTerm),
            deposit_rate: 0,
            monthly_price: result.estimated_price || 0,
            memo: metaData
        }

        await supabase.from('lotte_rentcar_db').insert([payload])
        alert(`✅ ${rentalType === 'daily' ? '일렌트' : rentalType === 'monthly' ? '월렌트' : '장기렌트'} 견적 산출 완료!`)
        setIsAiModalOpen(false)
        fetchList()

    } catch (e: any) { alert('실패: ' + e.message) } finally { setAiLoading(false) }
  }

  // 유틸리티
  const toggleCheck = (id: number) => { checkedIds.includes(id) ? setCheckedIds(checkedIds.filter(i=>i!==id)) : setCheckedIds([...checkedIds, id]) }
  const handleDeleteSelected = async () => { if(confirm(`${checkedIds.length}개 삭제?`)) { await supabase.from('lotte_rentcar_db').delete().in('id', checkedIds); setCheckedIds([]); fetchList(); } }
  const f = (n: number) => n?.toLocaleString() || '0'
  const filteredList = list.filter(item => item.model.includes(searchTerm) || item.brand.includes(searchTerm))
  const parseContract = (item: any) => { try { return JSON.parse(item.memo) } catch (e) { return {} } }

  // 🎨 타입별 뱃지 색상
  const getTypeColor = (type: string) => {
    if (type === 'daily') return 'bg-orange-100 text-orange-700 border-orange-200'
    if (type === 'monthly') return 'bg-green-100 text-green-700 border-green-200'
    return 'bg-blue-100 text-blue-700 border-blue-200'
  }

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in flex flex-col h-[calc(100vh-2rem)] overflow-hidden gap-4">
      {/* 헤더 */}
      <div className="shrink-0 flex justify-between items-end pb-2 border-b">
        <div>
            <h1 className="text-2xl font-black text-red-700">🏢 통합 견적 DB</h1>
            <p className="text-sm text-gray-500">단기(일) / 중기(월) / 장기(년) 통합 견적 관리 시스템</p>
        </div>
        <button onClick={() => setIsAiModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg hover:-translate-y-1 transition-transform">
            ✨ 통합 견적 설계
        </button>
      </div>

      {/* 검색 & 삭제 */}
      <div className="shrink-0 flex justify-between items-center">
        <input className="border p-2 rounded-lg w-64 text-sm" placeholder="모델명 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        {checkedIds.length > 0 && <button onClick={handleDeleteSelected} className="bg-red-100 text-red-600 px-4 py-2 rounded-lg font-bold text-sm">🗑️ {checkedIds.length}개 삭제</button>}
      </div>

      {/* 리스트 테이블 */}
      <div className="flex-1 overflow-y-auto bg-white border rounded-xl shadow-sm">
        <table className="w-full text-left text-sm relative">
          <thead className="bg-red-50 text-red-900 font-bold border-b sticky top-0 z-10">
            <tr>
              <th className="p-4 w-12 text-center">✓</th>
              <th className="p-4">구분 / 차종</th>
              <th className="p-4">기간</th>
              <th className="p-4 text-right">금액</th>
              <th className="p-4 text-right">비고</th>
              <th className="p-4 text-center">견적서</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-red-50">
            {filteredList.map((item) => {
                const d = parseContract(item)
                const rType = d.rental_type || 'long' // 없으면 장기 취급
                const unit = rType === 'daily' ? '일' : '개월'
                const priceUnit = rType === 'daily' ? '/일' : '/월'

                return (
                  <tr key={item.id} className={`transition-colors cursor-pointer ${checkedIds.includes(item.id) ? 'bg-red-50' : 'hover:bg-red-50/30'}`} onClick={() => setSelectedContract({...item, rType})}>
                    <td className="p-4 text-center" onClick={(e) => { e.stopPropagation(); toggleCheck(item.id); }}>
                        <input type="checkbox" className="w-4 h-4" checked={checkedIds.includes(item.id)} onChange={() => {}} />
                    </td>
                    <td className="p-4">
                        <span className={`inline-block text-[10px] px-2 py-0.5 rounded border font-bold mr-2 mb-1 ${getTypeColor(rType)}`}>
                            {rType === 'daily' ? '단기' : rType === 'monthly' ? '월간' : '장기'}
                        </span>
                        <div className="font-bold text-gray-900">{item.brand} {item.model}</div>
                    </td>
                    <td className="p-4">
                        <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold mr-1">
                            {item.term}{unit}
                        </span>
                    </td>
                    <td className="p-4 text-right">
                        <span className="font-black text-lg text-red-600">{f(item.monthly_price)}원</span>
                        <span className="text-xs text-gray-400">{priceUnit}</span>
                    </td>
                    <td className="p-4 text-right">
                        <span className="text-xs text-gray-500">{d.maintenance_info?.includes('자가') ? '자가정비' : '🔧정비포함'}</span>
                    </td>
                    <td className="p-4 text-center">
                        <button onClick={(e) => {e.stopPropagation(); setSelectedContract({...item, rType})}} className="bg-white border border-gray-300 px-3 py-1 rounded text-xs font-bold hover:bg-gray-50">📄 보기</button>
                    </td>
                  </tr>
                )
            })}
          </tbody>
        </table>
      </div>

      {/* 📄 전자 견적서 상세 모달 */}
      {selectedContract && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setSelectedContract(null)}>
            <div className="bg-white w-full max-w-2xl rounded-sm shadow-2xl overflow-hidden animate-fade-in-up" onClick={e => e.stopPropagation()}>
                {/* 헤더 */}
                <div className="bg-gray-900 text-white p-6 flex justify-between items-start">
                    <div>
                        <h2 className="text-3xl font-black font-serif">QUOTATION</h2>
                        <p className="text-sm text-gray-400 mt-1">
                            {selectedContract.rType === 'daily' ? '단기 렌터카 (Short-term)' :
                             selectedContract.rType === 'monthly' ? '월간 렌터카 (Monthly)' :
                             '장기 렌터카 (Long-term)'} 견적서
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="text-3xl font-bold text-yellow-400">{f(selectedContract.monthly_price)}원</div>
                        <div className="text-xs opacity-70">
                            {selectedContract.rType === 'daily' ? '일 대여료' : '월 대여료'} (VAT포함)
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                    {/* 차량 정보 */}
                    <div className="border-b pb-6 flex justify-between items-end">
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase">Vehicle</h3>
                            <div className="text-2xl font-bold text-gray-900">{selectedContract.brand} {selectedContract.model}</div>
                        </div>
                        <div className="text-right">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getTypeColor(selectedContract.rType)}`}>
                                {selectedContract.rType === 'daily' ? 'Daily Rent' : selectedContract.rType === 'monthly' ? 'Monthly Rent' : 'Long-term Rent'}
                            </span>
                        </div>
                    </div>

                    {/* 계약 조건 그리드 */}
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase">Terms</h3>
                            <ul className="space-y-3 text-sm">
                                <li className="flex justify-between border-b pb-2">
                                    <span>대여 기간</span>
                                    <b>{selectedContract.term} {selectedContract.rType === 'daily' ? '일' : '개월'}</b>
                                </li>
                                <li className="flex justify-between border-b pb-2">
                                    <span>주행 거리</span>
                                    <b>{parseContract(selectedContract).conditions_input?.mileage || selectedContract.trim.replace(/\[.*?\]/, '')}</b>
                                </li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase">Service</h3>
                            <ul className="space-y-3 text-sm">
                                <li className="flex justify-between border-b pb-2">
                                    <span>보험/정비</span>
                                    <b>{parseContract(selectedContract).maintenance_info || (selectedContract.rType === 'daily' ? '자차포함' : '기본')}</b>
                                </li>
                                {selectedContract.rType === 'long' && (
                                    <li className="flex justify-between border-b pb-2">
                                        <span>만기 인수</span>
                                        <b>{parseContract(selectedContract).residual_value ? f(parseContract(selectedContract).residual_value)+'원' : '-'}</b>
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>

                    {/* AI 코멘트 */}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                         <h3 className="text-xs font-bold text-gray-500 mb-2">AI Market Analysis</h3>
                         <p className="text-sm text-gray-700">
                             {parseContract(selectedContract).market_comment || '분석된 코멘트가 없습니다.'}
                         </p>
                    </div>
                </div>

                <div className="bg-gray-100 p-4 text-center border-t cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => setSelectedContract(null)}>
                    <span className="font-bold text-sm text-gray-600">닫기</span>
                </div>
            </div>
        </div>
      )}

      {/* 🤖 AI 입력 모달 */}
      {isAiModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setIsAiModalOpen(false)}>
            <div className="bg-white p-0 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 text-white flex justify-between items-center">
                    <h2 className="text-lg font-bold">🤖 통합 견적 설계</h2>
                    <button onClick={() => setIsAiModalOpen(false)} className="text-white opacity-70 hover:opacity-100">×</button>
                </div>

                {/* 1. 견적 타입 탭 (TAB) */}
                <div className="flex border-b bg-gray-50">
                    <button onClick={() => setRentalType('daily')} className={`flex-1 py-3 text-xs font-bold transition-all ${rentalType === 'daily' ? 'bg-white text-orange-600 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-600'}`}>🌞 단기(일)</button>
                    <button onClick={() => setRentalType('monthly')} className={`flex-1 py-3 text-xs font-bold transition-all ${rentalType === 'monthly' ? 'bg-white text-green-600 border-b-2 border-green-500' : 'text-gray-400 hover:text-gray-600'}`}>📅 중기(월)</button>
                    <button onClick={() => setRentalType('long')} className={`flex-1 py-3 text-xs font-bold transition-all ${rentalType === 'long' ? 'bg-white text-blue-600 border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-600'}`}>🏢 장기(년)</button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">브랜드</label><input className="w-full p-2 border rounded font-bold" value={targetBrand} onChange={e=>setTargetBrand(e.target.value)} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 mb-1">모델명</label><input className="w-full p-2 border rounded font-bold" value={targetModel} onChange={e=>setTargetModel(e.target.value)} /></div>
                    </div>

                    <div className="space-y-3 bg-gray-50 p-4 rounded-xl border">
                        {/* 기간 선택 (타입별 동적 변경) */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">
                                {rentalType === 'daily' ? '대여일수' : rentalType === 'monthly' ? '대여개월' : '계약기간'}
                            </label>
                            <select className="w-full p-2 border rounded text-sm font-bold bg-white" value={targetTerm} onChange={e=>setTargetTerm(e.target.value)}>
                                {rentalType === 'daily' && [1,2,3,4,5,7,10,15,30].map(d => <option key={d} value={d}>{d}일</option>)}
                                {rentalType === 'monthly' && [1,2,3,6,11].map(m => <option key={m} value={m}>{m}개월</option>)}
                                {rentalType === 'long' && [24,36,48,60].map(y => <option key={y} value={y}>{y}개월</option>)}
                            </select>
                        </div>

                        {/* 추가 조건 (장기일 때만 활성화) */}
                        {rentalType === 'long' && (
                            <>
                                <div className="flex gap-2">
                                    <select className="flex-1 p-2 border rounded text-xs" value={conditions.mileage} onChange={e=>setConditions({...conditions, mileage: e.target.value})}>
                                        <option>2만km/년</option><option>3만km/년</option><option>무제한</option>
                                    </select>
                                    <select className="flex-1 p-2 border rounded text-xs" value={conditions.deposit} onChange={e=>setConditions({...conditions, deposit: e.target.value})}>
                                        <option>보증금 0%</option><option>보증금 30%</option>
                                    </select>
                                </div>
                                <label className="flex items-center gap-2 pt-2 border-t mt-2 cursor-pointer">
                                    <input type="checkbox" checked={conditions.maintenance} onChange={e=>setConditions({...conditions, maintenance: e.target.checked})} className="w-4 h-4 text-purple-600" />
                                    <span className="text-sm font-bold text-gray-700">🔧 정비포함</span>
                                </label>
                            </>
                        )}
                        {rentalType !== 'long' && (
                            <p className="text-xs text-gray-400 text-center pt-2">
                                * 단기/월간 렌트는 정비 및 보험이 기본 포함됩니다.
                            </p>
                        )}
                    </div>

                    <button onClick={handleRealAiEstimate} disabled={aiLoading} className="w-full bg-black text-white py-3.5 rounded-xl font-bold hover:bg-gray-800 disabled:bg-gray-400">
                        {aiLoading ? <span className="animate-pulse">시장 분석 중...</span> : `🚀 ${rentalType === 'daily' ? '단기' : rentalType === 'monthly' ? '월간' : '장기'} 견적 산출`}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}