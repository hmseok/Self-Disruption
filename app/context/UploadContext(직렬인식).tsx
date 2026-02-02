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
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  // 📂 파일 큐 & 결과
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [results, setResults] = useState<Transaction[]>([]);
  const [status, setStatus] = useState<UploadStatus>('idle');

  // 📊 UI 상태
  const [progress, setProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [logs, setLogs] = useState('');

  // ⏯️ 제어 Refs
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const isProcessingRef = useRef(false);

  // 📥 파일 추가
  const addFiles = (newFiles: File[]) => {
    setFileQueue(prev => [...prev, ...newFiles]);
    if (status === 'completed' || status === 'error') {
        setStatus('idle');
    }
  };

  // 🚀 파일 들어오면 자동 시작
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

  // 📄 개별 파일 처리 (핵심)
  const processSingleFile = async (file: File, index: number, total: number) => {
    let allResults: any[] = [];

    const updateProgress = (filePercent: number) => {
      const totalPercent = ((index * 100) + filePercent) / total;
      setProgress(Math.min(totalPercent, 99.9));
    };

    // UI 멈춤 방지 Tick
    await new Promise(res => setTimeout(res, 10));

    // 1. 엑셀/CSV 처리
    if (file.name.match(/\.(xlsx|xls|csv)$/i) || file.type.includes('spreadsheet') || file.type.includes('csv')) {
      setLogs(`📊 엑셀 읽는 중... (${file.name})`);
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

      const BATCH_SIZE = 30;
      for (let j = 0; j < bodyRows.length; j += BATCH_SIZE) {
        if (isPausedRef.current || isCancelledRef.current) return;
        await new Promise(res => setTimeout(res, 0));

        const chunk = bodyRows.slice(j, j + BATCH_SIZE);
        const miniData = [headerRow, ...chunk];
        const miniCSV = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(miniData));

        const currentBatchPercent = (j / bodyRows.length) * 90;
        updateProgress(10 + currentBatchPercent);
        setLogs(`AI 정밀 분석 중... (${Math.round((j / bodyRows.length) * 100)}%)`);

        const res = await fetch('/api/finance-parser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: miniCSV, mimeType: 'text/csv' })
        });

        if (res.ok) {
          const part = await res.json();
          if (Array.isArray(part)) allResults.push(...part);
        }
      }
    }
    // 2. 이미지 처리
    else if (file.type.startsWith('image/')) {
        setLogs(`📸 영수증 스캔 중... (${file.name})`);
        updateProgress(20);

        const base64 = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.readAsDataURL(file);
        });

        updateProgress(50);
        setLogs('AI가 내용을 읽고 있습니다...');

        const res = await fetch('/api/finance-parser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: base64.split(',')[1], mimeType: file.type })
        });

        if(res.ok) {
            const result = await res.json();
            if (Array.isArray(result)) allResults = result;
        }
    }

    // 🇰🇷 [중요] 한글 데이터 강제 변환
    const processed = allResults.map((item: any, i: number) => {
        // AI가 영어(Card, Bank)로 줘도 한글로 바꿈
        let paymentMethodKr = '기타';
        if (item.payment_method === 'Card' || item.payment_method === '카드') paymentMethodKr = '카드';
        else if (item.payment_method === 'Bank' || item.payment_method === '통장') paymentMethodKr = '통장';

        return {
            id: Date.now() + i + Math.random(),
            transaction_date: item.transaction_date,
            type: item.type, // 'income', 'expense' (로직용 코드는 영어 유지)
            client_name: item.client_name,
            description: item.description,
            amount: Number(item.amount),
            payment_method: paymentMethodKr, // 👈 화면엔 '카드', '통장'으로 표시
            category: '미분류', // 👈 한글 기본값
            related_id: null,
            related_type: null,
            status: 'completed'
        };
    });

    setResults(prev => [...prev, ...processed]);
    updateProgress(100);
  };

  // 제어 함수들
  const pauseProcessing = () => { isPausedRef.current = true; setStatus('paused'); setLogs('⏸️ 일시 정지됨'); };
  const resumeProcessing = () => { isPausedRef.current = false; setStatus('processing'); startProcessing(); };
  const cancelProcessing = () => { isCancelledRef.current = true; setFileQueue([]); setCurrentFileIndex(0); setProgress(0); setStatus('idle'); isProcessingRef.current = false; };
  const clearResults = () => { setResults([]); setStatus('idle'); setProgress(0); setFileQueue([]); setCurrentFileIndex(0); isProcessingRef.current = false; };
  const closeWidget = () => { setStatus('idle'); };

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

  const deleteTransaction = (id: number) => {
    setResults(prev => prev.filter(item => item.id !== id));
  };

  return (
    <UploadContext.Provider value={{
      status, progress, currentFileIndex, totalFiles: fileQueue.length,
      currentFileName, logs, results,
      addFiles, startProcessing, pauseProcessing, resumeProcessing, cancelProcessing,
      clearResults, closeWidget, updateTransaction, deleteTransaction
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