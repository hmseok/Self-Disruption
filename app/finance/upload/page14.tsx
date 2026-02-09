'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// 🏷️ 자금 성격별 분류 체계
const DEFAULT_RULES = [
  // 🟢 입금 (Income)
  { group: '매출(영업수익)', label: '렌트/운송수입', type: 'income', keywords: ['매출', '정산', '운송료', '입금'] },
  { group: '매출(영업수익)', label: '지입 관리비/수수료', type: 'income', keywords: ['지입료', '관리비', '번호판', '수수료'] },
  { group: '자본변동(입금)', label: '투자원금 입금', type: 'income', keywords: ['투자', '증자', '자본'] },
  { group: '자본변동(입금)', label: '지입 초기비용/보증금', type: 'income', keywords: ['보증금', '인수금', '초기'] },
  { group: '자본변동(입금)', label: '대출 실행(입금)', type: 'income', keywords: ['대출입금', '론', '대출실행'] },
  { group: '기타수입', label: '이자/잡이익', type: 'income', keywords: ['이자', '환급', '캐시백'] },

  // 🔴 출금 (Expense)
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

export default function UploadFinancePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // 📊 로딩 UI 상태 관리
  const [progress, setProgress] = useState(0) // 0 ~ 100%
  const [currentFileName, setCurrentFileName] = useState('')
  const [fileCountInfo, setFileCountInfo] = useState('') // "1/3"

  const [reviewList, setReviewList] = useState<any[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // 🤖 AI 매칭용 데이터
  const [cars, setCars] = useState<any[]>([])
  const [investors, setInvestors] = useState<any[]>([])
  const [jiips, setJiips] = useState<any[]>([])
  const [dbRules, setDbRules] = useState<any[]>([])
  const [bulkMode, setBulkMode] = useState(true)

  useEffect(() => { fetchBasicData() }, [])

  const fetchBasicData = async () => {
    const { data: c } = await supabase.from('cars').select('id, number, model'); setCars(c||[])
    const { data: i } = await supabase.from('general_investments').select('id, investor_name'); setInvestors(i||[])
    const { data: j } = await supabase.from('jiip_contracts').select('id, contractor_name'); setJiips(j||[])
    const { data: r } = await supabase.from('finance_rules').select('*'); setDbRules(r||[])
  }

  const applyRules = (clientName: string, desc: string, type: string) => {
      const targetText = (clientName + ' ' + desc).trim();
      const userRule = dbRules.find(r => targetText.includes(r.keyword));
      if (userRule) return { category: userRule.category, related_id: userRule.related_id, related_type: userRule.related_type }

      const matchedJiip = jiips.find(j => targetText.includes(j.contractor_name));
      if (matchedJiip) return { category: type==='income'?'지입 관리비':'지입 수익배분', related_id: matchedJiip.id, related_type: 'jiip' };

      const matchedInv = investors.find(inv => targetText.includes(inv.investor_name));
      if (matchedInv) return { category: type==='income'?'투자원금':'이자비용', related_id: matchedInv.id, related_type: 'invest' };

      const matchedCar = cars.find(car => targetText.includes(car.number) || targetText.includes(car.number.slice(-4)));
      if (matchedCar) return { category: '차량유지비', related_id: matchedCar.id, related_type: 'car' }

      return { category: '기타운영비', related_id: null, related_type: null };
  }

  // 🚀 파일 일괄 처리 핸들러
  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    setProgress(0);

    let successCount = 0;
    const totalFiles = files.length;

    // 📁 파일 하나씩 순회
    for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        setCurrentFileName(file.name);
        setFileCountInfo(`${i + 1} / ${totalFiles}`);

        try {
            // 개별 파일 처리 시, 진행률 업데이트 콜백 전달
            await processSingleFile(file, (filePercent) => {
                // 전체 진행률 계산: (이전 완료 파일% + 현재 파일 진행%) / 전체 파일 수
                const totalProgress = ((i * 100) + filePercent) / totalFiles;
                setProgress(Math.min(totalProgress, 99)); // 100%는 완료 시
            });
            successCount++;
        } catch (e: any) {
            console.error(`File error (${file.name}):`, e);
            alert(`'${file.name}' 처리 중 오류가 발생했습니다: ${e.message}`);
        }
    }

    setProgress(100);
    setTimeout(() => {
        setLoading(false);
        alert(`✅ 총 ${totalFiles}개 파일 중 ${successCount}개 처리 완료!`);
    }, 500); // 100% 보여주고 잠시 뒤 종료
  }

  // 📄 개별 파일 처리 로직 (onProgress 콜백 추가)
  const processSingleFile = async (file: File, onProgress: (percent: number) => void) => {
    let allResults: any[] = [];

    // 1. 엑셀/CSV 파일
    if (file.name.match(/\.(xlsx|xls|csv)$/i) || file.type.includes('spreadsheet') || file.type.includes('csv')) {
        onProgress(10); // 읽기 시작

        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];

        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        if (jsonData.length < 2) return;

        // 헤더 찾기
        let headerIdx = -1;
        for(let i=0; i<Math.min(jsonData.length, 20); i++) {
            const rowStr = jsonData[i].join(' ');
            if(/날짜|일자|금액|승인|가맹점/.test(rowStr)) { headerIdx = i; break; }
        }
        if(headerIdx === -1) headerIdx = 0;

        const headerRow = jsonData[headerIdx];
        const bodyRows = jsonData.slice(headerIdx + 1);

        // 30줄씩 Batch 처리
        const BATCH_SIZE = 30;
        const totalBatches = Math.ceil(bodyRows.length / BATCH_SIZE);

        for (let i = 0; i < bodyRows.length; i += BATCH_SIZE) {
            const chunk = bodyRows.slice(i, i + BATCH_SIZE);
            const miniData = [headerRow, ...chunk];
            const miniWS = XLSX.utils.aoa_to_sheet(miniData);
            const miniCSV = XLSX.utils.sheet_to_csv(miniWS);

            // API 호출
            const response = await fetch('/api/finance-parser', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: miniCSV, mimeType: 'text/csv' })
            });

            if (response.ok) {
                const partialResult = await response.json();
                if (Array.isArray(partialResult)) {
                    allResults = [...allResults, ...partialResult];
                }
            }

            // 배치 진행률 계산 (10% ~ 90%)
            const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
            const batchPercent = 10 + (currentBatch / totalBatches) * 80;
            onProgress(batchPercent);
        }
    }
    // 2. 이미지 파일
    else if (file.type.startsWith('image/')) {
        onProgress(20); // 업로드 중
        const base64 = await fileToBase64(file);

        onProgress(50); // AI 분석 중
        const response = await fetch('/api/finance-parser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: base64.split(',')[1], mimeType: file.type })
        });

        onProgress(80); // 응답 처리
        if (!response.ok) throw new Error('AI 분석 실패');
        allResults = await response.json();
    }

    onProgress(95); // 매핑 준비

    if (allResults.length === 0) return;

    // 3. 결과 매핑
    const processed = allResults.map((item: any) => {
        const { category, related_id, related_type } = applyRules(item.client_name, item.description, item.type);
        return {
            id: Date.now() + Math.random(),
            transaction_date: item.transaction_date,
            type: item.type,
            client_name: item.client_name,
            description: item.description,
            amount: Number(item.amount),
            payment_method: item.payment_method,
            category, related_id, related_type,
            status: 'completed'
        };
    });

    setReviewList(prev => [...prev, ...processed]);
    onProgress(100); // 완료
  }

  const fileToBase64 = (file: File): Promise<string> => new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(file); r.onload=()=>res(r.result as string); r.onerror=e=>rej(e); })

  const updateItem = (idx: number, field: string, val: any) => {
      const newList = [...reviewList];
      newList[idx] = { ...newList[idx], [field]: val };
      if(field === 'related_composite') {
          if(!val) { newList[idx].related_id=null; newList[idx].related_type=null; }
          else { const [t, i] = val.split('_'); newList[idx].related_type=t; newList[idx].related_id=i; }
      }
      setReviewList(newList);
  }

  const deleteItem = (idx: number) => setReviewList(prev => prev.filter((_, i) => i !== idx))

  const handleBulkSave = async () => {
      if(!confirm(`총 ${reviewList.length}건을 저장하시겠습니까?`)) return;
      const payload = reviewList.map(({ id, ...rest }) => rest);
      const { error } = await supabase.from('transactions').insert(payload);
      if(error) alert('저장 실패: ' + error.message);
      else { alert('✅ 저장되었습니다!'); router.push('/finance'); }
  }

  const saveRuleToDb = async (item: any) => {
      if (!item.client_name) return alert('키워드 없음');
      const keyword = prompt(`'${item.client_name}' 규칙 저장`, item.client_name);
      if (!keyword) return;
      const { error } = await supabase.from('finance_rules').insert({ keyword, category: item.category, related_id: item.related_id, related_type: item.related_type });
      if (error) { if(error.code==='23505') alert('이미 등록된 키워드입니다.'); else alert(error.message); }
      else { alert('✅ 규칙 저장 완료!'); fetchBasicData(); }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files.length > 0) processFiles(Array.from(e.target.files)); e.target.value = ''; }
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files && e.dataTransfer.files.length > 0) processFiles(Array.from(e.dataTransfer.files)); }

  return (
    <div className="max-w-full mx-auto py-10 px-6 animate-fade-in-up">
      <div className="flex justify-between items-center mb-8 max-w-6xl mx-auto">
          <div>
            <h1 className="text-3xl font-black text-gray-900">✨ AI 금융 내역 분석기</h1>
            <p className="text-gray-500 mt-2">여러 개의 엑셀, 영수증 파일을 한 번에 드래그하세요. (자동 합산)</p>
          </div>
          <button onClick={() => router.back()} className="text-gray-500 font-bold hover:text-black">← 돌아가기</button>
      </div>

      <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
          className={`max-w-6xl mx-auto relative border-2 border-dashed rounded-3xl p-10 text-center mb-8 transition-all duration-300 group ${isDragging ? 'border-indigo-500 bg-indigo-50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-indigo-300'}`}>
          <input type="file" multiple accept=".xlsx, .xls, .csv, image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          <div className="pointer-events-none">
              <span className="text-4xl mb-2 block">📂</span>
              <p className="text-gray-500 font-bold">여기에 여러 파일을 놓아주세요</p>
              <p className="text-xs text-gray-400 mt-2">엑셀(통장/카드), 영수증 사진 동시 지원</p>
          </div>
      </div>

      {reviewList.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden max-w-full mx-auto">
              <div className="p-4 bg-gray-50 border-b flex flex-wrap gap-4 justify-between items-center sticky top-0 z-20 shadow-sm">
                  <div className="flex items-center gap-4">
                      <h3 className="font-bold text-lg text-gray-800">✅ 분석 결과 ({reviewList.length}건)</h3>
                      <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm hover:bg-gray-50">
                          <input type="checkbox" checked={bulkMode} onChange={e => setBulkMode(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                          <span className="text-sm font-bold text-gray-700">⚡️ 동일 내역 일괄 변경</span>
                      </label>
                  </div>
                  <button onClick={handleBulkSave} className="bg-indigo-900 text-white px-6 py-2 rounded-xl font-bold hover:bg-black shadow-md">💾 전체 저장</button>
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
                        {reviewList.map((item, idx) => (
                            <tr key={idx} className="hover:bg-indigo-50/50 transition-colors">
                                <td className="p-3 text-center"><button onClick={() => saveRuleToDb(item)} className="text-gray-300 hover:text-yellow-500 text-lg">⭐</button></td>
                                <td className="p-3"><input value={item.transaction_date} onChange={e=>updateItem(idx,'transaction_date',e.target.value)} className="bg-transparent w-24 outline-none text-gray-700"/></td>

                                <td className="p-3">
                                    {item.payment_method === 'Card' ? (
                                        <span className="px-2 py-1 rounded text-xs font-bold bg-yellow-100 text-yellow-800">💳 카드</span>
                                    ) : (
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${item.type==='income'?'bg-blue-100 text-blue-700':'bg-red-100 text-red-700'}`}>
                                            {item.type==='income' ? '🔵 통장입금' : '🔴 통장출금'}
                                        </span>
                                    )}
                                </td>

                                <td className="p-3"><input value={item.client_name} onChange={e=>updateItem(idx,'client_name',e.target.value)} className="w-full bg-transparent outline-none font-bold text-gray-800"/></td>
                                <td className="p-3"><input value={item.description} onChange={e=>updateItem(idx,'description',e.target.value)} className="w-full bg-white border border-gray-100 rounded px-2 py-1 outline-none text-xs text-gray-600 focus:border-indigo-300"/></td>

                                <td className="p-3">
                                    <select value={item.category} onChange={e=>updateItem(idx,'category',e.target.value)} className="bg-white border border-gray-200 px-2 py-1.5 rounded text-gray-700 font-bold w-32 text-xs outline-none">
                                        <option value="기타">기타</option>
                                        {DEFAULT_RULES.map((r, i) => <option key={i} value={r.label}>{r.label}</option>)}
                                    </select>
                                </td>

                                <td className="p-3">
                                    <select value={item.related_id?`${item.related_type}_${item.related_id}`:''} onChange={e=>updateItem(idx,'related_composite',e.target.value)} className="w-full border rounded p-1.5 text-xs outline-none bg-white text-gray-600">
                                        <option value="">- 연결 없음 -</option>
                                        <optgroup label="🚛 지입 차주">{jiips.map(j=><option key={j.id} value={`jiip_${j.id}`}>{j.contractor_name}</option>)}</optgroup>
                                        <optgroup label="💰 투자자">{investors.map(i=><option key={i.id} value={`invest_${i.id}`}>{i.investor_name}</option>)}</optgroup>
                                        <optgroup label="🚗 차량">{cars.map(c=><option key={c.id} value={`car_${c.id}`}>{c.number}</option>)}</optgroup>
                                    </select>
                                </td>

                                <td className="p-3 text-right font-black text-gray-900">{item.amount.toLocaleString()}</td>
                                <td className="p-3 text-center"><button onClick={()=>deleteItem(idx)} className="text-gray-300 hover:text-red-500 font-bold px-2">×</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              </div>
          </div>
      )}

      {/* 📊 [NEW] 전문가스러운 로딩 UI */}
      {loading && (
        <div className="fixed inset-0 bg-black/60 flex flex-col items-center justify-center z-50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full border border-gray-200">
                <div className="text-5xl mb-4 animate-pulse">📑🔍</div>
                <h2 className="text-xl font-black text-gray-900 mb-1">AI 금융 데이터 분석 중</h2>
                <p className="text-sm text-gray-500 mb-6">잠시만 기다려주세요. 꼼꼼히 확인하고 있습니다.</p>

                {/* 프로그레스 바 */}
                <div className="w-full bg-gray-100 rounded-full h-4 mb-2 overflow-hidden border border-gray-200">
                    <div
                        className="bg-indigo-600 h-4 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>

                <div className="flex justify-between w-full text-xs font-bold text-gray-600 px-1">
                    <span>처리 파일: {fileCountInfo}</span>
                    <span className="text-indigo-600">{Math.round(progress)}%</span>
                </div>

                <div className="mt-4 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100 w-full text-center">
                    <p className="text-xs text-gray-400 truncate">현재 분석 중: {currentFileName}</p>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}