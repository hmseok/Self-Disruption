'use client'

import { supabase } from '../../utils/supabase'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
// 현재 에러는 경로 문제가 아니라 Provider 감싸기 문제이므로 아래 코드로 해결됩니다.
import { UploadProvider, useUpload } from '@/app/context/UploadContext'

// 🏷️ 자금 성격별 분류 체계
const DEFAULT_RULES = [
  { group: '매출(영업수익)', label: '렌트/운송수입', type: 'income', keywords: ['매출', '정산', '운송료', '입금'] },
  { group: '매출(영업수익)', label: '지입 관리비/수수료', type: 'income', keywords: ['지입료', '관리비', '번호판', '수수료'] },
  { group: '자본변동(입금)', label: '투자원금 입금', type: 'income', keywords: ['투자', '증자', '자본'] },
  { group: '자본변동(입금)', label: '지입 초기비용/보증금', type: 'income', keywords: ['보증금', '인수금', '초기'] },
  { group: '자본변동(입금)', label: '대출 실행(입금)', type: 'income', keywords: ['대출입금', '론', '대출실행'] },
  { group: '기타수입', label: '이자/잡이익', type: 'income', keywords: ['이자', '환급', '캐시백'] },
  { group: '지입/운송원가', label: '지입 수익배분금(출금)', type: 'expense', keywords: ['수익배분', '정산금', '배분금', '지입대금'] },
  { group: '차량유지비', label: '유류비', type: 'expense', keywords: ['주유', '가스', '엘피지', 'GS', 'SK', 'S-OIL'] },
  { group: '차량유지비', label: '정비/수리비', type: 'expense', keywords: ['정비', '모터스', '타이어', '공업사', '수리', '부품'] },
  { group: '차량유지비', label: '차량보험료', type: 'expense', keywords: ['손해', '화재', 'KB', '현대', 'DB', '보험'] },
  { group: '차량유지비', label: '자동차세/공과금', type: 'expense', keywords: ['자동차세', '과태료', '범칙금', '검사', '도로공사', '하이패스'] },
  { group: '금융비용', label: '차량할부/리스료', type: 'expense', keywords: ['캐피탈', '파이낸셜', '할부', '리스'] },
  { group: '금융비용', label: '이자비용(대출/투자)', type: 'expense', keywords: ['이자'] },
  { group: '금융비용', label: '원금상환', type: 'expense', keywords: ['원금'] },
  { group: '인건비', label: '급여(정규직)', type: 'expense', keywords: ['급여', '월급', '상여'] },
  { group: '인건비', label: '용역비(3.3%)', type: 'expense', keywords: ['용역', '프리', '3.3', '탁송', '대리'] },
  { group: '일반관리', label: '복리후생(식대)', type: 'expense', keywords: ['식당', '카페', '커피', '마트', '식사', '음식', '편의점'] },
  { group: '일반관리', label: '임차료/사무실', type: 'expense', keywords: ['월세', '관리비', '주차'] },
  { group: '일반관리', label: '통신/소모품', type: 'expense', keywords: ['KT', 'SKT', 'LG', '인터넷', '다이소', '문구', '쿠팡', '네이버'] },
]

// 1️⃣ [알맹이] 실제 로직이 들어가는 내부 컴포넌트
// (이 컴포넌트는 export default 하지 않습니다!)
function UploadContent() {
  const router = useRouter()
// ⚠️ 여기가 에러가 나던 곳입니다.
  // 이제 부모(UploadFinancePage)가 Provider를 제공하므로 에러가 나지 않습니다.
  const {
    results,
    status,
    addFiles,
    startProcessing,
    updateTransaction,
    deleteTransaction,
    clearResults
  } = useUpload()

  const [isDragging, setIsDragging] = useState(false)
  const [cars, setCars] = useState<any[]>([])
  const [investors, setInvestors] = useState<any[]>([])
  const [jiips, setJiips] = useState<any[]>([])
  const [bulkMode, setBulkMode] = useState(true)

  useEffect(() => { fetchBasicData() }, [])

  const fetchBasicData = async () => {
    const { data: c } = await supabase.from('cars').select('id, number, model'); setCars(c||[])
    const { data: i } = await supabase.from('general_investments').select('id, investor_name'); setInvestors(i||[])
    const { data: j } = await supabase.from('jiip_contracts').select('id, contractor_name'); setJiips(j||[])
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
      startProcessing();
    }
    e.target.value = '';
  }

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
      startProcessing();
    }
  }

  const handleUpdateItem = (id: number, field: string, val: any, item: any) => {
    updateTransaction(id, field, val);
    if (bulkMode && field !== 'amount' && field !== 'transaction_date' && field !== 'description') {
        const sameClientItems = results.filter(r => r.client_name === item.client_name && r.id !== id);
        sameClientItems.forEach(r => updateTransaction(r.id, field, val));
    }
  }

  const handleBulkSave = async () => {
    if(results.length === 0) return alert('저장할 내역이 없습니다.');
    if(!confirm(`총 ${results.length}건을 저장하시겠습니까?`)) return;

    const payload = results.map(({ id, ...rest }) => rest);
    const { error } = await supabase.from('transactions').insert(payload);

    if(error) {
        alert('저장 실패: ' + error.message);
    } else {
        alert('✅ 저장되었습니다!');
        clearResults();
        router.push('/finance');
    }
  }

  const saveRuleToDb = async (item: any) => {
      if (!item.client_name) return alert('키워드 없음');
      const keyword = prompt(`'${item.client_name}' 규칙 저장`, item.client_name);
      if (!keyword) return;

      const { error } = await supabase.from('finance_rules').insert({
          keyword, category: item.category, related_id: item.related_id, related_type: item.related_type
      });

      if (error) {
          if(error.code==='23505') alert('이미 등록된 키워드입니다.');
          else alert(error.message);
      } else {
          alert('✅ 규칙 저장 완료!');
      }
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-12 md:px-6 bg-gray-50/50 min-h-screen">
      <div className="flex justify-between items-center mb-8 max-w-6xl mx-auto">
          <div>
            <h1 className="text-3xl font-black text-gray-900">✨ AI 금융 내역 분석기</h1>
            <p className="text-gray-500 mt-2">파일을 업로드하면 백그라운드에서 AI가 분석합니다.</p>
          </div>
          <button onClick={() => router.back()} className="text-gray-500 font-bold hover:text-black">← 돌아가기</button>
      </div>

      <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
          className={`max-w-6xl mx-auto relative border-2 border-dashed rounded-3xl p-10 text-center mb-8 transition-all duration-300 group ${isDragging ? 'border-steel-500 bg-steel-50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-steel-300'}`}>
          <input type="file" multiple accept=".xlsx, .xls, .csv, image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          <div className="pointer-events-none">
              <span className="text-4xl mb-2 block">📂</span>
              <p className="text-gray-500 font-bold">여기에 파일을 놓아주세요 (다중 선택 가능)</p>
              <p className="text-xs text-gray-400 mt-2">엑셀(통장/카드), 영수증 사진 지원</p>
          </div>
      </div>

      {status === 'processing' && (
        <div className="max-w-6xl mx-auto mb-6 bg-steel-50 border border-steel-200 rounded-xl p-4 flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-3">
                <span className="text-2xl">🔄</span>
                <span className="font-bold text-steel-800">AI가 데이터를 분석하고 있습니다...</span>
            </div>
        </div>
      )}

      {results.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden max-w-full mx-auto">
              <div className="p-4 bg-gray-50 border-b flex flex-wrap gap-4 justify-between items-center sticky top-0 z-20 shadow-sm">
                  <div className="flex items-center gap-4">
                      <h3 className="font-bold text-lg text-gray-800">✅ 분석 결과 ({results.length}건)</h3>
                      <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm hover:bg-gray-50">
                          <input type="checkbox" checked={bulkMode} onChange={e => setBulkMode(e.target.checked)} className="w-4 h-4 text-steel-600 rounded focus:ring-steel-500" />
                          <span className="text-sm font-bold text-gray-700">⚡️ 동일 내역 일괄 변경</span>
                      </label>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={clearResults} className="text-red-500 font-bold px-4 hover:text-red-700 text-sm">전체 취소</button>
                      <button onClick={handleBulkSave} className="bg-steel-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-steel-700 shadow-md">💾 전체 저장</button>
                  </div>
              </div>

              <div className="overflow-x-auto max-h-[65vh]">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-100 text-gray-500 sticky top-0 z-10 font-bold">
                        <tr>
                            <th className="p-3 w-10 text-center">규칙</th>
                            <th className="p-3">날짜</th>
                            <th className="p-3">결제수단</th>
                            <th className="p-3">거래처 (가맹점)</th>
                            <th className="p-3">상세정보 (비고)</th>
                            <th className="p-3">계정과목</th>
                            <th className="p-3 w-48">연결 대상</th>
                            <th className="p-3 text-right">금액</th>
                            <th className="p-3 text-center">삭제</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {results.map((item) => (
                            <tr key={item.id} className="hover:bg-steel-50/50 transition-colors">
                                <td className="p-3 text-center"><button onClick={() => saveRuleToDb(item)} className="text-gray-300 hover:text-yellow-500 text-lg">⭐</button></td>
                                <td className="p-3"><input value={item.transaction_date} onChange={e=>handleUpdateItem(item.id, 'transaction_date', e.target.value, item)} className="bg-transparent w-24 outline-none text-gray-700"/></td>
                                <td className="p-3">
                                    {item.payment_method === 'Card' ? (
                                        <span className="px-2 py-1 rounded text-xs font-bold bg-yellow-100 text-yellow-800">💳 카드</span>
                                    ) : (
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${item.type==='income'?'bg-steel-100 text-steel-700':'bg-red-100 text-red-700'}`}>
                                            {item.type==='income' ? '🔵 통장입금' : '🔴 통장출금'}
                                        </span>
                                    )}
                                </td>
                                <td className="p-3"><input value={item.client_name} onChange={e=>handleUpdateItem(item.id, 'client_name', e.target.value, item)} className="w-full bg-transparent outline-none font-bold text-gray-800"/></td>
                                <td className="p-3"><input value={item.description} onChange={e=>handleUpdateItem(item.id, 'description', e.target.value, item)} className="w-full bg-white border border-gray-100 rounded px-2 py-1 outline-none text-xs text-gray-600 focus:border-steel-400 focus:ring-steel-400"/></td>
                                <td className="p-3">
                                    <select value={item.category} onChange={e=>handleUpdateItem(item.id, 'category', e.target.value, item)} className="bg-white border border-gray-200 px-2 py-1.5 rounded text-gray-700 font-bold w-32 text-xs outline-none">
                                        <option value="기타">기타</option>
                                        {DEFAULT_RULES.map((r, i) => <option key={i} value={r.label}>{r.label}</option>)}
                                    </select>
                                </td>
                                <td className="p-3">
                                    <select value={item.related_id?`${item.related_type}_${item.related_id}`:''} onChange={e=>handleUpdateItem(item.id, 'related_composite', e.target.value, item)} className="w-full border rounded p-1.5 text-xs outline-none bg-white text-gray-600">
                                        <option value="">- 연결 없음 -</option>
                                        <optgroup label="🚛 지입 차주">{jiips.map(j=><option key={j.id} value={`jiip_${j.id}`}>{j.contractor_name}</option>)}</optgroup>
                                        <optgroup label="💰 투자자">{investors.map(i=><option key={i.id} value={`invest_${i.id}`}>{i.investor_name}</option>)}</optgroup>
                                        <optgroup label="🚗 차량">{cars.map(c=><option key={c.id} value={`car_${c.id}`}>{c.number}</option>)}</optgroup>
                                    </select>
                                </td>
                                <td className="p-3 text-right font-black text-gray-900">{item.amount.toLocaleString()}</td>
                                <td className="p-3 text-center"><button onClick={()=>deleteTransaction(item.id)} className="text-gray-300 hover:text-red-500 font-bold px-2">×</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              </div>
          </div>
      )}
    </div>
  )
}

// 2️⃣ [껍데기] Provider로 알맹이를 감싸주는 메인 페이지 컴포넌트
// 👇 이 부분이 핵심입니다! 이것 때문에 에러가 사라집니다.
export default function UploadFinancePage() {
  return (
    <UploadProvider>
      <UploadContent />
    </UploadProvider>
  )
}