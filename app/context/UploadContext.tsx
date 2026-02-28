'use client'
import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../utils/supabase'

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
  // 카드 관련
  card_number?: string;
  card_id?: string | null;
  approval_number?: string;
  // 승인/취소 매칭
  is_cancelled?: boolean;
  cancel_pair_id?: number | null; // 매칭된 원본/취소 거래의 id
  // 자동 매칭 결과
  matched_schedule_id?: string | null;
  match_score?: number;
  matched_contract_name?: string | null;
  matched_employee_id?: string | null;
  matched_employee_name?: string | null;
  confidence?: number;
  classification_tier?: string;
  alternatives?: any[];
  _queue_id?: string;
  // 외화 관련
  currency?: string;          // KRW, USD, JPY, EUR 등
  original_amount?: number;   // 외화 원금액
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
  // 카드 등록 결과
  cardRegistrationResults: { registered: number; updated: number; skipped: number };

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
  loadFromQueue: () => Promise<number>;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

// ═══════════════════════════════════════════════════════════════
// 파일 유형 자동 감지
// ═══════════════════════════════════════════════════════════════
type FileCategory = 'card_registration' | 'card_transaction' | 'bank_statement' | 'card_report' | 'unknown';

function detectFileType(headerRow: any[]): FileCategory {
  // 헤더 셀들을 개별로도 체크하고, 전체 문자열로도 체크
  const cells = (headerRow || []).map(h => String(h || '').replace(/\n/g, ' ').trim().toLowerCase());
  const headerStr = cells.join(' ');
  const nonEmptyCells = cells.filter(c => c.length > 0);

  console.log(`[detectFileType] headerStr: "${headerStr.substring(0, 120)}"`)
  console.log(`[detectFileType] nonEmptyCells: [${nonEmptyCells.slice(0, 8).join(', ')}]`)

  // ── 카드 등록/보유 내역 (거래 아님) ──
  if (headerStr.match(/소지자|발급일|발급구분|유효기간|브랜드|상태코드|회원번호/)) return 'card_registration'
  if (headerStr.match(/부서번호.*카드번호.*성명.*만료일|교부일.*결제기관.*결제계좌/)) return 'card_registration'

  // ── 카드 거래 (승인내역) — KB국민카드 등 ──
  if (headerStr.match(/승인일.*카드번호.*가맹점|승인번호.*가맹점.*업종/)) return 'card_transaction'
  if (headerStr.match(/이용일.*카드번호.*가맹점|승인금액.*가맹점/)) return 'card_transaction'

  // ── 카드 리포트 (월별) — 신한카드 등 ──
  // 이용일자 + 이용카드 + 이용가맹점 조합
  if (headerStr.match(/이용일자.*이용카드.*이용가맹점/)) return 'card_report'
  if (headerStr.match(/이용일자.*승인번호.*이용카드/)) return 'card_report'
  if (headerStr.match(/이용카드.*이용가맹점.*매출구분/)) return 'card_report'
  // 셀 단위 체크 (머지된 셀로 인해 순서가 달라질 수 있음)
  const hasIyongiljja = nonEmptyCells.some(c => c.includes('이용일자'));
  const hasIyongcard = nonEmptyCells.some(c => c.includes('이용카드'));
  const hasIyonggamaejeom = nonEmptyCells.some(c => c.includes('이용가맹점'));
  const hasSeungin = nonEmptyCells.some(c => c.includes('승인번호'));
  const hasMaechul = nonEmptyCells.some(c => c.includes('매출구분') || c.includes('매출'));
  if (hasIyongiljja && hasIyongcard && hasIyonggamaejeom) { console.log('[detectFileType] → card_report (셀 조합 1)'); return 'card_report' }
  if (hasIyongiljja && hasSeungin && hasIyongcard) { console.log('[detectFileType] → card_report (셀 조합 2)'); return 'card_report' }

  // ── 카드 거래 — 셀 단위 조합 체크 ──
  const hasCardNum = nonEmptyCells.some(c => c.includes('카드번호'));
  const hasGamaejeom = nonEmptyCells.some(c => c.includes('가맹점'));
  const hasSeungingeum = nonEmptyCells.some(c => c.includes('승인금액'));
  if (hasCardNum && hasGamaejeom) return 'card_transaction'
  if (hasSeungin && hasGamaejeom && hasSeungingeum) return 'card_transaction'

  // ── 통장 거래 ──
  if (headerStr.match(/거래일.*적요.*입금.*출금|거래일.*적요.*찾으신|거래일.*적요.*맡기신/)) return 'bank_statement'
  if (headerStr.match(/no.*거래일.*적요.*지급.*입금/i)) return 'bank_statement'
  if (headerStr.match(/날짜.*내용.*출금.*입금|일시.*적요.*출금.*입금/)) return 'bank_statement'
  // 셀 단위: 거래일 + 적요 + (입금 or 출금 or 지급 or 찾으신)
  const hasGeorail = nonEmptyCells.some(c => c.includes('거래일'));
  const hasJeokyo = nonEmptyCells.some(c => c.includes('적요'));
  const hasInOut = nonEmptyCells.some(c => c.match(/입금|출금|지급|찾으신|맡기신/));
  if (hasGeorail && hasJeokyo && hasInOut) { console.log('[detectFileType] → bank_statement'); return 'bank_statement' }

  console.log('[detectFileType] → unknown')
  return 'unknown'
}

// ═══════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════
export function UploadProvider({ children }: { children: React.ReactNode }) {
  // 📂 파일 큐 & 결과 상태
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [results, setResults] = useState<Transaction[]>([]);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [cardRegistrationResults, setCardRegistrationResults] = useState({ registered: 0, updated: 0, skipped: 0 });

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

  // 🔐 인증 헤더
  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` };
    }
    return { 'Content-Type': 'application/json' };
  }, []);

  // 🔑 안전한 고유 ID 생성
  const generateUniqueId = useCallback(() => {
    let newId = Date.now();
    if (newId <= lastIdRef.current) newId = lastIdRef.current + 1;
    lastIdRef.current = newId;
    return newId;
  }, []);

  // 📥 파일 추가 (기존 결과 유지하면서 새 파일 추가)
  const addFiles = (newFiles: File[]) => {
    // 기존 결과를 유지하고 새 파일만 큐에 추가
    // (사용자가 카드 파일 업로드 후 통장 파일을 추가로 업로드하는 케이스 대응)
    setFileQueue(prev => [...prev, ...newFiles]);
    if (status === 'completed' || status === 'error') setStatus('idle');
  };

  // 🚀 자동 시작
  useEffect(() => {
    if (fileQueue.length > 0 && !isProcessingRef.current && status === 'idle') startProcessing();
  }, [fileQueue, status]);

  // ▶️ 메인 분석 루프
  const startProcessing = async () => {
    if (fileQueue.length === 0 || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setStatus('processing');
    isPausedRef.current = false;
    isCancelledRef.current = false;

    const totalCount = fileQueue.length;

    for (let i = currentFileIndex; i < totalCount; i++) {
      if (isCancelledRef.current) break;
      if (isPausedRef.current) {
        setStatus('paused');
        isProcessingRef.current = false;
        return;
      }

      setCurrentFileIndex(i);
      setCurrentFileName(fileQueue[i].name);
      setLogs(`📂 파일 처리 중... (${i + 1}/${totalCount}) ${fileQueue[i].name}`);
      setProgress(Math.round((i / totalCount) * 100));

      try {
        await processSingleFile(fileQueue[i], i, totalCount);
      } catch (e: any) {
        console.error(e);
        setLogs(`❌ 오류 발생 (${fileQueue[i].name}): ${e.message}`);
      }
    }

    if (!isPausedRef.current && !isCancelledRef.current) {
      setStatus('completed');
      setLogs(`✅ 모든 파일 분석 완료! (${totalCount}개 파일)`);
      setProgress(100);
      setFileQueue([]);
      setCurrentFileIndex(0);
    }
    isProcessingRef.current = false;
  };

  // ═══════════════════════════════════════════════════════════════
  // 📄 개별 파일 처리
  // ═══════════════════════════════════════════════════════════════
  const processSingleFile = async (file: File, index: number, total: number) => {
    await new Promise(res => setTimeout(res, 10)); // UI 렌더링 틱

    // 1. 엑셀/CSV 처리
    if (file.name.match(/\.(xlsx|xls|csv)$/i) || file.type.includes('spreadsheet') || file.type.includes('csv')) {

      const updateProgress = (percent: number) => {
        const totalPercent = ((index * 100) + percent) / total;
        setProgress(Math.min(Math.round(totalPercent), 99));
      };
      updateProgress(5);

      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const jsonData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][];

      if (jsonData.length < 2) throw new Error('데이터가 없는 파일입니다.');

      // ── 헤더 행 찾기 (개선: 복수 키워드 조합으로 정확도 향상) ──
      let headerIdx = 0;
      const HEADER_KEYWORDS = ['날짜', '일자', '금액', '승인', '가맹점', '적요', '카드번호', '부서번호',
        '입금', '출금', '지급', '잔액', '업종', '이용카드', '이용가맹점', '거래일', '결제', '매출',
        '승인번호', '할부', '찾으신', '맡기신', '기재내용', '취급점'];

      let bestHeaderIdx = 0;
      let bestHeaderScore = 0;

      for (let k = 0; k < Math.min(jsonData.length, 50); k++) {
        const row = jsonData[k] || [];
        const rowStr = row.map((c: any) => String(c || '').trim()).join(' ').toLowerCase();
        // 빈 행이면 스킵
        const nonEmptyCells = row.filter((c: any) => c !== null && c !== undefined && String(c).trim() !== '');
        if (nonEmptyCells.length < 3) continue;

        // 헤더 키워드 매칭 점수 계산
        let score = 0;
        for (const kw of HEADER_KEYWORDS) {
          if (rowStr.includes(kw)) score++;
        }

        // 최소 2개 이상 키워드 매칭 + 기존 최고점보다 높으면 갱신
        if (score >= 2 && score > bestHeaderScore) {
          bestHeaderScore = score;
          bestHeaderIdx = k;
        }
      }
      headerIdx = bestHeaderIdx;

      const headerRow = jsonData[headerIdx];
      const bodyRows = jsonData.slice(headerIdx + 1).filter(row =>
        row && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
      );

      console.log(`[UploadContext] 📋 헤더 감지: row=${headerIdx}, score=${bestHeaderScore}, cells=[${headerRow?.slice(0,8).map((h: any) => String(h||'').trim().substring(0,10))}]`);

      // ── 파일 유형 감지 ──
      const fileType = detectFileType(headerRow);
      setLogs(`📂 ${file.name} → ${fileType === 'card_registration' ? '🏦 카드 등록 데이터' : fileType === 'card_transaction' ? '💳 카드 거래 내역' : fileType === 'card_report' ? '📊 카드 월별 리포트' : fileType === 'bank_statement' ? '🏧 통장 거래 내역' : '📋 자동 감지 중...'} (${bodyRows.length}행)`);

      // ═════════════════════════════════════════
      // A) 카드 등록 파일 → DB에 법인카드 자동 등록
      // ═════════════════════════════════════════
      if (fileType === 'card_registration') {
        await processCardRegistration(headerRow, bodyRows, file.name);
        updateProgress(100);
        return;
      }

      // ═════════════════════════════════════════
      // B) 카드 거래 / 통장 거래 / 카드 리포트 → AI 분석
      // ═════════════════════════════════════════
      const BATCH_SIZE = 30;
      const CONCURRENCY_LIMIT = 2; // 429 방지: 동시 요청 제한

      const chunks = [];
      for (let j = 0; j < bodyRows.length; j += BATCH_SIZE) {
        chunks.push(bodyRows.slice(j, j + BATCH_SIZE));
      }

      let completedChunks = 0;
      const totalChunks = chunks.length;

      for (let i = 0; i < chunks.length; i += CONCURRENCY_LIMIT) {
        if (isPausedRef.current || isCancelledRef.current) return;
        await new Promise(res => setTimeout(res, 0));

        const batch = chunks.slice(i, i + CONCURRENCY_LIMIT);
        const pct = Math.round((completedChunks / totalChunks) * 100);
        setLogs(`🚀 AI 분석 중... ${file.name} (${pct}%) — 파일 ${index + 1}/${total}`);

        const authHeaders = await getAuthHeaders();
        const promises = batch.map(async (chunk) => {
          const miniData = [headerRow, ...chunk];
          const miniCSV = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(miniData));

          // 429 재시도 로직 (최대 3회, 지수 백오프)
          const MAX_RETRIES = 3;
          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
              const res = await fetch('/api/finance-parser', {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                  data: miniCSV,
                  mimeType: 'text/csv',
                  fileType,
                })
              });

              if (res.status === 429) {
                const waitSec = Math.pow(2, attempt + 1); // 2, 4, 8초
                console.warn(`[UploadContext] 429 Rate Limit — ${waitSec}초 후 재시도 (${attempt + 1}/${MAX_RETRIES})`);
                setLogs(`⏳ API 속도 제한 — ${waitSec}초 후 재시도... (${attempt + 1}/${MAX_RETRIES})`);
                await new Promise(r => setTimeout(r, waitSec * 1000));
                continue;
              }

              if (!res.ok) {
                const errBody = await res.text();
                console.error(`[UploadContext] finance-parser error ${res.status}:`, errBody);
                setLogs(`⚠️ AI API 오류 (${res.status})`);
                return [];
              }
              const part = await res.json();
              if (part.error) {
                console.error('[UploadContext] finance-parser returned error:', part.error);
                return [];
              }
              console.log(`[UploadContext] ✅ chunk 파싱 완료: ${Array.isArray(part) ? part.length : 0}건`);
              return Array.isArray(part) ? part : [];
            } catch (fetchErr: any) {
              console.error('[UploadContext] fetch error:', fetchErr);
              if (attempt < MAX_RETRIES) {
                const waitSec = Math.pow(2, attempt + 1);
                setLogs(`❌ 네트워크 오류 — ${waitSec}초 후 재시도...`);
                await new Promise(r => setTimeout(r, waitSec * 1000));
                continue;
              }
              setLogs(`❌ 네트워크 오류: ${fetchErr.message}`);
              return [];
            }
          }
          return []; // 모든 재시도 실패
        });

        const batchResults = await Promise.all(promises);
        let newTransactions = batchResults.flat().map((item: any) => transformItem(item));

        // 자동 분류/매칭 API 호출
        console.log(`[UploadContext] 분류 API 준비: ${newTransactions.length}건, companyId=${companyIdRef.current}, payment_methods=[${[...new Set(newTransactions.map(t => t.payment_method))].join(',')}]`);
        if (newTransactions.length > 0 && companyIdRef.current) {
          try {
            setLogs(`🔍 법인카드 매칭 & 세무 분류 중... (${newTransactions.length}건)`);
            const classifyHeaders = await getAuthHeaders();
            const analyzeRes = await fetch('/api/finance/classify', {
              method: 'POST',
              headers: classifyHeaders,
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
                  matched_employee_id: item.matched_employee_id || null,
                  matched_employee_name: item.matched_employee_name || null,
                }));
              }
            }
          } catch (e) { console.error('분석 API 오류:', e); }
        }

        // ── 승인/취소 쌍 매칭 ──
        matchCancelPairs(newTransactions);

        setResults(prev => {
          const combined = [...prev, ...newTransactions];
          // 기존 결과와 새 결과 간에도 취소 매칭 시도
          matchCancelPairsAcross(combined);
          return combined;
        });
        completedChunks += batch.length;
        updateProgress(10 + (completedChunks / totalChunks) * 90);
      }
    }
    // 2. 이미지 처리
    else if (file.type.startsWith('image/')) {
      setLogs(`📸 영수증 스캔 중... (${file.name}) — 파일 ${index + 1}/${total}`);
      const base64 = await new Promise<string>((resolve) => {
        const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(file);
      });

      const imgAuthHeaders = await getAuthHeaders();
      const res = await fetch('/api/finance-parser', {
        method: 'POST',
        headers: imgAuthHeaders,
        body: JSON.stringify({ data: base64.split(',')[1], mimeType: file.type })
      });

      if (res.ok) {
        const result = await res.json();
        if (Array.isArray(result)) {
          const newItems = result.map((item: any) => transformItem(item));
          setResults(prev => [...prev, ...newItems]);
        }
      }
    }
    // 3. PDF 처리
    else if (file.name.match(/\.pdf$/i)) {
      setLogs(`📄 PDF 분석 중... (${file.name}) — 파일 ${index + 1}/${total}`);
      const base64 = await new Promise<string>((resolve) => {
        const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(file);
      });

      const pdfAuthHeaders = await getAuthHeaders();
      const res = await fetch('/api/finance-parser', {
        method: 'POST',
        headers: pdfAuthHeaders,
        body: JSON.stringify({ data: base64.split(',')[1], mimeType: 'application/pdf' })
      });

      if (res.ok) {
        const result = await res.json();
        if (Array.isArray(result)) {
          const newItems = result.map((item: any) => transformItem(item));
          setResults(prev => [...prev, ...newItems]);
        }
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // 🏦 카드 등록 파일 처리 → corporate_cards 자동 등록
  // ═══════════════════════════════════════════════════════════════
  const processCardRegistration = async (headerRow: any[], bodyRows: any[][], fileName: string) => {
    if (!companyIdRef.current) {
      setLogs('⚠️ 회사를 먼저 선택해주세요.');
      return;
    }

    const headers = headerRow.map((h: any) => String(h || '').trim());
    setLogs(`🏦 법인카드 자동 등록 중... (${bodyRows.length}장 감지)`);

    let registered = 0, updated = 0, skipped = 0;

    for (const row of bodyRows) {
      try {
        const rowObj: Record<string, string> = {};
        headers.forEach((h, i) => { rowObj[h] = String(row[i] || '').trim().replace(/^'/, ''); });

        // 카드번호 추출
        const cardNumber = rowObj['카드번호'] || '';
        if (!cardNumber || cardNumber.length < 10) { skipped++; continue; }

        // 카드사 추정
        let cardCompany = 'KB국민카드';
        const cardName = rowObj['카드명'] || rowObj['제휴카드종류'] || '';
        if (cardName.match(/KB|국민/)) cardCompany = 'KB국민카드';
        else if (cardName.match(/신한/)) cardCompany = '신한카드';
        else if (cardName.match(/삼성/)) cardCompany = '삼성카드';
        else if (cardName.match(/현대/)) cardCompany = '현대카드';
        else if (cardName.match(/하나/)) cardCompany = '하나카드';
        else if (cardName.match(/우리/)) cardCompany = '우리카드';
        else if (cardName.match(/롯데/)) cardCompany = '롯데카드';
        else if (cardName.match(/농협|NH/)) cardCompany = 'NH농협카드';
        else if (cardName.match(/BC|비씨/)) cardCompany = 'BC카드';

        // 소지자명
        const holderName = rowObj['소지자명'] || rowObj['성명'] || '공용';
        const isShared = holderName === '공용' || (rowObj['소지자'] || '') === '공용';

        // 부서
        const department = rowObj['부서명'] || '';

        // 유효기간
        const expiryDate = rowObj['유효기간'] || rowObj['만료일'] || '';

        // 한도
        const limitStr = rowObj['카드한도'] || '0';
        const monthlyLimit = parseInt(limitStr.replace(/\D/g, '')) || 0;

        // 카드 유형 (주유, 하이패스 등)
        let cardType = '일반';
        if (cardName.match(/주유/)) cardType = '주유전용';
        else if (cardName.match(/하이패스/)) cardType = '하이패스';
        else if (cardName.match(/오토빌/)) cardType = '오토빌';

        // 카드번호 뒷4자리로 중복 체크
        const last4 = cardNumber.replace(/\D/g, '').slice(-4);
        const { data: existing } = await supabase
          .from('corporate_cards')
          .select('id')
          .eq('company_id', companyIdRef.current)
          .like('card_number', `%${last4}`);

        if (existing && existing.length > 0) {
          // 업데이트
          await supabase.from('corporate_cards').update({
            card_company: cardCompany,
            card_number: cardNumber,
            holder_name: isShared ? '공용' : holderName,
            card_alias: department || cardType,
            card_type: cardType,
            expiry_date: expiryDate,
            monthly_limit: monthlyLimit > 0 ? monthlyLimit : undefined,
            is_active: true,
          }).eq('id', existing[0].id);
          updated++;
        } else {
          // 신규 등록
          await supabase.from('corporate_cards').insert({
            company_id: companyIdRef.current,
            card_company: cardCompany,
            card_number: cardNumber,
            holder_name: isShared ? '공용' : holderName,
            card_alias: department || cardType,
            card_type: cardType,
            expiry_date: expiryDate,
            monthly_limit: monthlyLimit > 0 ? monthlyLimit : null,
            is_active: true,
            status: 'active',
          });
          registered++;
        }
      } catch (e) {
        console.error('카드 등록 오류:', e);
        skipped++;
      }
    }

    setCardRegistrationResults(prev => ({
      registered: prev.registered + registered,
      updated: prev.updated + updated,
      skipped: prev.skipped + skipped,
    }));
    setLogs(`🏦 카드 등록 완료! 신규 ${registered}장, 업데이트 ${updated}장, 스킵 ${skipped}장`);
  };

  // 🔄 승인/취소 쌍 자동 매칭 (같은 배치 내)
  const matchCancelPairs = (txs: Transaction[]) => {
    for (const tx of txs) {
      const desc = (tx.description || '').toLowerCase();
      const isCancelled = desc.includes('취소') || desc.includes('cancel') || desc.includes('반품');
      tx.is_cancelled = isCancelled;
    }

    // 승인번호 기반 매칭
    const approvalMap = new Map<string, Transaction>();
    for (const tx of txs) {
      if (!tx.approval_number || tx.approval_number.length < 3) continue;
      if (!tx.is_cancelled) {
        approvalMap.set(tx.approval_number, tx);
      }
    }
    for (const tx of txs) {
      if (!tx.is_cancelled || !tx.approval_number) continue;
      const original = approvalMap.get(tx.approval_number);
      if (original && original.id !== tx.id) {
        tx.cancel_pair_id = original.id;
        original.cancel_pair_id = tx.id;
        // 취소 건은 같은 카테고리로 맞춤
        if (original.category && original.category !== '미분류') {
          tx.category = original.category;
        }
        tx.card_id = original.card_id || tx.card_id;
        tx.related_type = original.related_type || tx.related_type;
        tx.related_id = original.related_id || tx.related_id;
      }
    }
  };

  // 🔄 기존 결과와 새 결과 간 취소 매칭
  const matchCancelPairsAcross = (allTxs: Transaction[]) => {
    const approvalMap = new Map<string, Transaction>();
    for (const tx of allTxs) {
      if (!tx.approval_number || tx.approval_number.length < 3) continue;
      if (!tx.is_cancelled && !tx.cancel_pair_id) {
        approvalMap.set(tx.approval_number, tx);
      }
    }
    for (const tx of allTxs) {
      if (!tx.is_cancelled || tx.cancel_pair_id || !tx.approval_number) continue;
      const original = approvalMap.get(tx.approval_number);
      if (original && original.id !== tx.id) {
        tx.cancel_pair_id = original.id;
        original.cancel_pair_id = tx.id;
        if (original.category && original.category !== '미분류') {
          tx.category = original.category;
        }
        tx.card_id = original.card_id || tx.card_id;
        tx.related_type = original.related_type || tx.related_type;
        tx.related_id = original.related_id || tx.related_id;
      }
    }
  };

  // 🇰🇷 데이터 변환 및 한글화 함수
  const transformItem = (item: any): Transaction => {
    // payment_method 정규화 (대소문자/한글/영문 모두 대응)
    const pm = String(item.payment_method || '').toLowerCase().trim();
    let paymentMethodKr = '기타';
    if (pm === 'card' || pm === '카드' || pm === 'credit' || pm === 'debit' || pm.includes('card') || pm.includes('카드')) {
      paymentMethodKr = '카드';
    } else if (pm === 'bank' || pm === '통장' || pm === '계좌' || pm === 'transfer' || pm.includes('bank') || pm.includes('통장')) {
      paymentMethodKr = '통장';
    }

    // 통화 감지 및 amount 정규화
    let currency = (item.currency || 'KRW').toUpperCase();
    let originalAmount: number | null = null;

    // amount 문자열에서 달러/외화 기호 감지
    const amountStr = String(item.amount || '');
    if (amountStr.includes('$') || amountStr.includes('＄')) {
      if (currency === 'KRW') currency = 'USD';
    }
    if (amountStr.includes('¥') || amountStr.includes('￥')) {
      if (currency === 'KRW') currency = 'JPY';
    }
    if (amountStr.includes('€')) {
      if (currency === 'KRW') currency = 'EUR';
    }

    // description + client_name에서 통화/해외 감지 보강
    const descStr = String(item.description || '').toLowerCase();
    const clientStr = String(item.client_name || item.merchant || '').toLowerCase();
    const allText = descStr + ' ' + clientStr;
    if (currency === 'KRW' && (allText.includes('usd') || allText.includes('달러') || allText.includes('미화') || allText.includes('us$'))) {
      currency = 'USD';
    }
    if (currency === 'KRW' && (allText.includes('해외') || allText.includes('해외승인') || allText.includes('foreign') || allText.includes('overseas'))) {
      currency = 'USD'; // 해외승인은 기본 USD로 마킹
    }
    if (currency === 'KRW' && (allText.includes('jpy') || allText.includes('엔화') || allText.includes('일본'))) {
      currency = 'JPY';
    }
    if (currency === 'KRW' && (allText.includes('eur') || allText.includes('유로'))) {
      currency = 'EUR';
    }

    let amount = 0;
    if (typeof item.amount === 'string') {
      amount = Math.abs(Number(item.amount.replace(/[,\s원$＄¥￥€]/g, '')) || 0);
    } else {
      amount = Math.abs(Number(item.amount) || 0);
    }

    // 외화인 경우 original_amount 설정
    if (currency !== 'KRW') {
      if (item.original_amount) {
        originalAmount = Math.abs(Number(String(item.original_amount).replace(/[,\s$＄¥￥€]/g, '')) || 0);
        // original_amount가 있으면 amount는 원화 결제금액
      } else {
        // original_amount가 없으면 amount가 외화금액 (원화 환산 안 됨)
        originalAmount = amount;
        // 금액을 그대로 두되 플래그로 표시 (나중에 환율 적용 필요)
      }
    }

    // type 정규화
    let txType = 'expense';
    const rawType = String(item.type || '').toLowerCase().trim();
    if (rawType === 'income' || rawType === '입금' || rawType === '수입') txType = 'income';
    else txType = 'expense';

    return {
      id: generateUniqueId(),
      transaction_date: item.transaction_date || '',
      type: txType,
      client_name: item.client_name || '',
      description: item.description || '',
      amount,
      payment_method: paymentMethodKr,
      category: '미분류',
      related_id: null,
      related_type: null,
      status: 'completed',
      card_number: item.card_number || '',
      approval_number: item.approval_number || '',
      currency: currency,
      original_amount: originalAmount,
    };
  };

  // 📥 classification_queue에서 기존 데이터 로드 (새로고침/페이지 이동 후 복원)
  const loadFromQueue = useCallback(async (): Promise<number> => {
    if (!companyIdRef.current || isProcessingRef.current) return 0;
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/finance/classify?company_id=${companyIdRef.current}&status=pending&limit=2000`, {
        headers: authHeaders,
      });
      if (!res.ok) return 0;
      const data = await res.json();
      const queueItems = data.items || [];
      if (queueItems.length === 0) return 0;

      // 디버깅: API 응답 구조 확인
      console.log('[loadFromQueue] API 응답:', {
        source: data.source,
        total: data.total,
        itemCount: queueItems.length,
        firstItem: queueItems[0] ? {
          id: queueItems[0].id,
          ai_category: queueItems[0].ai_category,
          source_data: queueItems[0].source_data,
          card_number: queueItems[0].card_number,
          _source: queueItems[0]._source,
        } : null,
      });

      // classification_queue 응답을 Transaction 인터페이스로 변환
      const transactions: Transaction[] = queueItems.map((q: any) => {
        const sd = q.source_data || {};
        // payment_method 정규화
        const pm = String(sd.payment_method || '').toLowerCase().trim();
        let paymentMethodKr = '기타';
        if (pm === 'card' || pm === '카드' || pm.includes('card') || pm.includes('카드')) paymentMethodKr = '카드';
        else if (pm === 'bank' || pm === '통장' || pm === '계좌' || pm.includes('bank') || pm.includes('통장')) paymentMethodKr = '통장';

        return {
          id: generateUniqueId(),
          transaction_date: sd.transaction_date || '',
          type: sd.type || 'expense',
          client_name: sd.client_name || '',
          description: sd.description || '',
          amount: Math.abs(Number(sd.amount) || 0),
          payment_method: paymentMethodKr,
          category: q.ai_category || '미분류',
          related_id: q.ai_related_id || null,
          related_type: q.ai_related_type || null,
          status: 'completed',
          card_number: q.card_number || sd.card_number || '',
          card_id: q.card_id || sd.card_id || null,
          approval_number: sd.approval_number || '',
          is_cancelled: q.is_cancel || sd.is_cancel || false,
          matched_contract_name: q.matched_contract_name || q.ai_matched_name || null,
          matched_employee_id: q.matched_employee_id || sd.matched_employee_id || null,
          matched_employee_name: q.matched_employee_name || sd.matched_employee_name || null,
          confidence: q.ai_confidence || 0,
          classification_tier: q.ai_confidence >= 80 ? 'auto' : q.ai_confidence >= 60 ? 'review' : 'manual',
          alternatives: q.alternatives || [],
          // queue_id를 저장하여 나중에 업데이트/삭제 시 사용
          _queue_id: q.id,
          // 외화 관련
          currency: sd.currency || 'KRW',
          original_amount: sd.original_amount || null,
        } as Transaction;
      });

      setResults(transactions);
      setStatus('completed');
      setLogs(`📂 저장된 분류 데이터 ${transactions.length}건 로드됨`);
      console.log(`[UploadContext] loadFromQueue: ${transactions.length}건 로드`);
      return transactions.length;
    } catch (e) {
      console.error('[UploadContext] loadFromQueue error:', e);
      return 0;
    }
  }, [getAuthHeaders, generateUniqueId]);

  // 🎮 제어 함수들
  const pauseProcessing = () => { isPausedRef.current = true; setStatus('paused'); setLogs('⏸️ 일시 정지됨'); };
  const resumeProcessing = () => { isPausedRef.current = false; setStatus('processing'); startProcessing(); };
  const cancelProcessing = () => { isCancelledRef.current = true; setFileQueue([]); setCurrentFileIndex(0); setProgress(0); setStatus('idle'); isProcessingRef.current = false; };
  const clearResults = () => { setResults([]); setStatus('idle'); setProgress(0); setFileQueue([]); setCurrentFileIndex(0); isProcessingRef.current = false; setCardRegistrationResults({ registered: 0, updated: 0, skipped: 0 }); };
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
      currentFileName, logs, results, cardRegistrationResults,
      addFiles, startProcessing, pauseProcessing, resumeProcessing, cancelProcessing,
      clearResults, closeWidget, updateTransaction, deleteTransaction, setCompanyId, loadFromQueue
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
