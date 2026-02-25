'use client'
import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'

// ✅ 상태 타입 정의
type UploadStatus = 'idle' | 'processing' | 'paused' | 'completed' | 'error';

// ✅ 거래 내역 데이터 인터페이스
export interface Transaction {
  id: number;
  transaction_date: string;
  type: string;
  client_name: string;
  description: string;
  amount: number;
  payment_method: string;
  category: string;
  related_id: string | null;
  related_type: string | null;
  status: string;
  // 자동 매칭 결과
  matched_schedule_id?: string | null;
  match_score?: number;
  matched_contract_name?: string | null;
  confidence?: number;
}

// ✅ Context 타입 정의
interface UploadContextType {
  status: UploadStatus;
  progress: number;
  currentFileIndex: number;
  totalFiles: number;
  currentFileName: string;
  logs: string;
  results: Transaction[];

  // 액션 함수들
  addFiles: (files: File[]) => void;
  startProcessing: () => void;
  pauseProcessing: () => void;
  resumeProcessing: () => void;
  cancelProcessing: () => void;
  clearResults: () => void;
  closeWidget: () => void;
  updateTransaction: (id: number, field: string, value: any) => void;
  deleteTransaction: (id: number) => void;
  setCompanyId: (id: string) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  // 📂 파일 큐 & 결과 상태
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [results, setResults] = useState<Transaction[]>([]);
  const [status, setStatus] = useState<UploadStatus>('idle');

  // 📊 UI 표시용 상태
  const [progress, setProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [logs, setLogs] = useState('');

  // ⏯️ 제어용 Refs
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const isProcessingRef = useRef(false);

  // 🛡️ ID 중복 방지용 Ref
  const lastIdRef = useRef(Date.now());

  // 🏢 회사 ID (분석 API용)
  const companyIdRef = useRef<string | null>(null);
  const setCompanyId = useCallback((id: string) => { companyIdRef.current = id; }, []);

  // 🔑 안전한 고유 ID 생성 (병렬 처리 시 충돌 방지)
  const generateUniqueId = useCallback(() => {
    let newId = Date.now();
    if (newId <= lastIdRef.current) {
        newId = lastIdRef.current + 1;
    }
    lastIdRef.current = newId;
    return newId;
  }, []);

  // 📥 파일 추가
  const addFiles = (newFiles: File[]) => {
    setFileQueue(prev => [...prev, ...newFiles]);
    if (status === 'completed' || status === 'error') {
        setStatus('idle');
    }
  };

  // 🚀 파일이 들어오면 자동 시작 감지
  useEffect(() => {
    if (fileQueue.length > 0 && !isProcessingRef.current && status === 'idle') {
        startProcessing();
    }
  }, [fileQueue, status]);

  // ▶️ 메인 분석 루프
  const startProcessing = async () => {
    if (fileQueue.length === 0 || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setStatus('processing');
    isPausedRef.current = false;
    isCancelledRef.current = false;

    for (let i = currentFileIndex; i < fileQueue.length; i++) {
      if (isCancelledRef.current) break;
      if (isPausedRef.current) {
        setStatus('paused');
        isProcessingRef.current = false;
        return;
      }

      setCurrentFileIndex(i);
      setCurrentFileName(fileQueue[i].name);

      try {
        await processSingleFile(fileQueue[i], i, fileQueue.length);
      } catch (e: any) {
        console.error(e);
        setLogs(`❌ 오류 발생 (${fileQueue[i].name}): ${e.message}`);
      }
    }

    if (!isPausedRef.current && !isCancelledRef.current) {
      setStatus('completed');
      setLogs('✅ 모든 파일 분석 완료!');
      setProgress(100);
      setFileQueue([]);
      setCurrentFileIndex(0);
    }
    isProcessingRef.current = false;
  };

  // 📄 개별 파일 처리 (고속 병렬 엔진)
  const processSingleFile = async (file: File, index: number, total: number) => {
    // UI 렌더링 틱 확보 (멈춤 방지)
    await new Promise(res => setTimeout(res, 10));

    // 1. 엑셀/CSV 처리
    if (file.name.match(/\.(xlsx|xls|csv)$/i) || file.type.includes('spreadsheet') || file.type.includes('csv')) {
      setLogs(`📊 엑셀 데이터 읽는 중... (${file.name})`);

      const updateProgress = (percent: number) => {
        const totalPercent = ((index * 100) + percent) / total;
        setProgress(Math.min(totalPercent, 99.9));
      };
      updateProgress(5);

      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const jsonData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][];

      if (jsonData.length < 2) throw new Error('데이터가 없는 파일입니다.');

      let headerIdx = 0;
      for(let k=0; k<Math.min(jsonData.length, 50); k++) {
         const rowStr = (jsonData[k] || []).join(' ');
         if(rowStr.match(/날짜|일자|금액|승인|가맹점/)) { headerIdx = k; break; }
      }
      const headerRow = jsonData[headerIdx];
      const bodyRows = jsonData.slice(headerIdx + 1);

      // ⚡️ 고속 병렬 처리 설정
      const BATCH_SIZE = 30;
      const CONCURRENCY_LIMIT = 5;

      const chunks = [];
      for (let j = 0; j < bodyRows.length; j += BATCH_SIZE) {
          chunks.push(bodyRows.slice(j, j + BATCH_SIZE));
      }

      let completedChunks = 0;
      const totalChunks = chunks.length;

      for (let i = 0; i < chunks.length; i += CONCURRENCY_LIMIT) {
        if (isPausedRef.current || isCancelledRef.current) return;
        await new Promise(res => setTimeout(res, 0)); // UI 갱신

        const batch = chunks.slice(i, i + CONCURRENCY_LIMIT);

        setLogs(`🚀 AI 고속 분석 중... (${Math.round((i / totalChunks) * 100)}%)`);

        const promises = batch.map(async (chunk) => {
            const miniData = [headerRow, ...chunk];
            const miniCSV = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(miniData));

            const res = await fetch('/api/finance-parser', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: miniCSV, mimeType: 'text/csv' })
            });

            if (!res.ok) return [];
            const part = await res.json();
            return Array.isArray(part) ? part : [];
        });

        const batchResults = await Promise.all(promises);
        let newTransactions = batchResults.flat().map((item: any) => transformItem(item));

        // 자동 분석/매칭 API 호출 (company_id가 있을 때만)
        if (newTransactions.length > 0 && companyIdRef.current) {
          try {
            setLogs(`🔍 계약 매칭 & 세무 분류 중...`);
            const analyzeRes = await fetch('/api/finance/classify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transactions: newTransactions, company_id: companyIdRef.current }),
            });
            if (analyzeRes.ok) {
              const { transactions: enriched } = await analyzeRes.json();
              if (Array.isArray(enriched)) {
                newTransactions = enriched.map((item: any, idx: number) => ({
                  ...newTransactions[idx],
                  category: item.category || newTransactions[idx].category,
                  related_type: item.related_type || newTransactions[idx].related_type,
                  related_id: item.related_id || newTransactions[idx].related_id,
                  matched_schedule_id: item.matched_schedule_id || null,
                  match_score: item.match_score || 0,
                  matched_contract_name: item.matched_contract_name || null,
                  confidence: item.confidence || 0,
                  classification_tier: item.classification_tier || 'manual',
                  alternatives: item.alternatives || [],
                  card_id: item.card_id || null,
                }));
              }
            }
          } catch (e) { console.error('분석 API 오류:', e); }
        }

        setResults(prev => [...prev, ...newTransactions]);

        completedChunks += batch.length;
        updateProgress(10 + (completedChunks / totalChunks) * 90);
      }
    }
    // 2. 이미지 처리
    else if (file.type.startsWith('image/')) {
        setLogs(`📸 영수증 스캔 중... (${file.name})`);
        const base64 = await new Promise<string>((resolve) => {
            const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(file);
        });

        const res = await fetch('/api/finance-parser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: base64.split(',')[1], mimeType: file.type })
        });

        if(res.ok) {
            const result = await res.json();
            if (Array.isArray(result)) {
                const newItems = result.map((item: any) => transformItem(item));
                setResults(prev => [...prev, ...newItems]);
            }
        }
    }
  };

  // 🇰🇷 데이터 변환 및 한글화 함수
  const transformItem = (item: any): Transaction => {
      let paymentMethodKr = '기타';
      if (item.payment_method === 'Card' || item.payment_method === '카드') paymentMethodKr = '카드';
      else if (item.payment_method === 'Bank' || item.payment_method === '통장') paymentMethodKr = '통장';

      return {
          id: generateUniqueId(), // 👈 중복 없는 ID 사용
          transaction_date: item.transaction_date,
          type: item.type,
          client_name: item.client_name,
          description: item.description,
          amount: Number(item.amount),
          payment_method: paymentMethodKr,
          category: '미분류',
          related_id: null,
          related_type: null,
          status: 'completed'
      };
  };

  // 🎮 제어 함수들
  const pauseProcessing = () => { isPausedRef.current = true; setStatus('paused'); setLogs('⏸️ 일시 정지됨'); };
  const resumeProcessing = () => { isPausedRef.current = false; setStatus('processing'); startProcessing(); };
  const cancelProcessing = () => { isCancelledRef.current = true; setFileQueue([]); setCurrentFileIndex(0); setProgress(0); setStatus('idle'); isProcessingRef.current = false; };
  const clearResults = () => { setResults([]); setStatus('idle'); setProgress(0); setFileQueue([]); setCurrentFileIndex(0); isProcessingRef.current = false; };
  const closeWidget = () => { setStatus('idle'); };

  // ✏️ 데이터 수정
  const updateTransaction = (id: number, field: string, value: any) => {
    setResults(prev => prev.map(item => {
        if (item.id !== id) return item;
        const newItem = { ...item, [field]: value };
        if (field === 'related_composite') {
            if (!value) { newItem.related_id = null; newItem.related_type = null; }
            else { const [t, i] = value.split('_'); newItem.related_type = t; newItem.related_id = i; }
        }
        return newItem;
    }));
  };

  // 🗑️ 데이터 삭제
  const deleteTransaction = (id: number) => {
    setResults(prev => prev.filter(item => item.id !== id));
  };

  return (
    <UploadContext.Provider value={{
      status, progress, currentFileIndex, totalFiles: fileQueue.length,
      currentFileName, logs, results,
      addFiles, startProcessing, pauseProcessing, resumeProcessing, cancelProcessing,
      clearResults, closeWidget, updateTransaction, deleteTransaction, setCompanyId
    }}>
      {children}
    </UploadContext.Provider>
  );
}

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (!context) throw new Error('useUpload must be used within UploadProvider');
  return context;
};