'use client'
import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'

// 상태 타입 정의
type UploadStatus = 'idle' | 'processing' | 'paused' | 'completed' | 'error';

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

interface UploadContextType {
  status: UploadStatus;
  progress: number;
  currentFileIndex: number;
  totalFiles: number;
  currentFileName: string;
  logs: string;
  results: Transaction[];

  addFiles: (files: File[]) => void;
  pauseProcessing: () => void;
  resumeProcessing: () => void;
  cancelProcessing: () => void;
  clearResults: () => void;
  updateTransaction: (id: number, field: string, value: any) => void;
  deleteTransaction: (id: number) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [results, setResults] = useState<Transaction[]>([]);
  const [status, setStatus] = useState<UploadStatus>('idle');

  const [progress, setProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [logs, setLogs] = useState('');

  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const isProcessingRef = useRef(false); // 중복 실행 방지

  // 📥 파일 추가 (추가되면 useEffect가 감지해서 실행함)
  const addFiles = (newFiles: File[]) => {
    console.log('📂 파일 추가됨:', newFiles.length);
    setFileQueue(prev => [...prev, ...newFiles]);
    if (status === 'completed' || status === 'error') {
        setStatus('idle');
    }
  };

  // 🚀 [핵심 수정] 파일 큐가 변하면 자동으로 감지하여 시작 (타이밍 문제 해결)
  useEffect(() => {
    if (fileQueue.length > 0 && !isProcessingRef.current && status === 'idle') {
        startProcessing();
    }
  }, [fileQueue, status]);

  // ▶️ 분석 시작 메인 함수
  const startProcessing = async () => {
    if (fileQueue.length === 0 || isProcessingRef.current) return;

    console.log('🚀 분석 시작!');
    isProcessingRef.current = true;
    setStatus('processing');
    isPausedRef.current = false;
    isCancelledRef.current = false;

    // 현재 인덱스부터 끝까지 처리
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
        setStatus('error'); // 에러 상태 표시
      }
    }

    if (!isPausedRef.current && !isCancelledRef.current) {
      setStatus('completed');
      setLogs('✅ 모든 파일 분석 완료!');
      setProgress(100);
      setFileQueue([]); // 완료되면 큐 비우기
      setCurrentFileIndex(0);
    }
    isProcessingRef.current = false;
  };

  // 📄 개별 파일 처리
  const processSingleFile = async (file: File, index: number, total: number) => {
    let allResults: any[] = [];

    const updateProgress = (filePercent: number) => {
      const totalPercent = ((index * 100) + filePercent) / total;
      setProgress(Math.min(totalPercent, 99.9));
    };

    // 1. 엑셀/CSV
    if (file.name.match(/\.(xlsx|xls|csv)$/i) || file.type.includes('spreadsheet') || file.type.includes('csv')) {
      setLogs(`📊 엑셀 읽는 중... (${file.name})`);
      updateProgress(5);

      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const jsonData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][];

      if (jsonData.length < 2) throw new Error('데이터가 없는 파일입니다.');

      // 헤더 찾기
      let headerIdx = 0;
      for(let k=0; k<Math.min(jsonData.length, 50); k++) {
         const rowStr = (jsonData[k] || []).join(' ');
         if(rowStr.match(/날짜|일자|금액|승인|가맹점/)) { headerIdx = k; break; }
      }
      const headerRow = jsonData[headerIdx] || [];
      const bodyRows = jsonData.slice(headerIdx + 1);

      console.log(`헤더 발견: ${headerIdx}행, 데이터: ${bodyRows.length}건`);

      // 배치 처리
      const BATCH_SIZE = 30;
      for (let j = 0; j < bodyRows.length; j += BATCH_SIZE) {
        if (isPausedRef.current || isCancelledRef.current) return;

        const chunk = bodyRows.slice(j, j + BATCH_SIZE);
        const miniData = [headerRow, ...chunk];
        const miniCSV = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(miniData));

        const currentBatchPercent = (j / bodyRows.length) * 90;
        updateProgress(10 + currentBatchPercent);
        setLogs(`🤖 AI 분석 중... (${Math.round((j / bodyRows.length) * 100)}%)`);

        // API 호출
        const res = await fetch('/api/finance-parser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: miniCSV, mimeType: 'text/csv' })
        });

        // 🚨 에러 처리 강화 (여기서 멈추는지 확인)
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || `서버 에러 (${res.status})`);
        }

        const part = await res.json();
        if (Array.isArray(part)) allResults.push(...part);
      }
    }
    // 2. 이미지
    else if (file.type.startsWith('image/')) {
        setLogs(`📸 이미지 업로드 중... (${file.name})`);
        updateProgress(20);

        const base64 = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.readAsDataURL(file);
        });

        updateProgress(50);
        setLogs('🤖 AI가 이미지를 분석하고 있습니다...');

        const res = await fetch('/api/finance-parser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: base64.split(',')[1], mimeType: file.type })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || `서버 에러 (${res.status})`);
        }

        const result = await res.json();
        if (Array.isArray(result)) allResults = result;
    }

    // 결과 저장
    const processed = allResults.map((item: any, i: number) => ({
      id: Date.now() + i + Math.random(),
      transaction_date: item.transaction_date,
      type: item.type,
      client_name: item.client_name,
      description: item.description,
      amount: Number(item.amount),
      payment_method: item.payment_method,
      category: '기타운영비',
      related_id: null,
      related_type: null,
      status: 'completed'
    }));

    console.log(`✅ ${file.name} 처리 완료: ${processed.length}건`);
    setResults(prev => [...prev, ...processed]);
    updateProgress(100);
  };

  const pauseProcessing = () => {
    isPausedRef.current = true;
    setStatus('paused');
    setLogs('⏸️ 일시 정지됨');
  };

  const resumeProcessing = () => {
    isPausedRef.current = false;
    setStatus('processing');
    startProcessing();
  };

  const cancelProcessing = () => {
    isCancelledRef.current = true;
    setFileQueue([]);
    setCurrentFileIndex(0);
    setProgress(0);
    setStatus('idle');
    setLogs('⏹️ 취소됨');
    isProcessingRef.current = false;
  };

  const clearResults = () => {
    setResults([]);
    setStatus('idle');
    setProgress(0);
    setFileQueue([]);
    setCurrentFileIndex(0);
    isProcessingRef.current = false;
  };

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
      addFiles, pauseProcessing, resumeProcessing, cancelProcessing,
      clearResults, updateTransaction, deleteTransaction
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