'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../utils/supabase'

// ════════════════════════════════════════════
// 영수증 제출 / 법인카드 사용내역 관리
// Gemini Vision AI 기반 자동 OCR → 자동 등록 → 미비 항목만 수정
// ════════════════════════════════════════════

const CATEGORIES = [
  '주유비', '충전', '주차비', '접대', '식비', '회식비', '야근식대', '외근식대',
  '교통비', '사무용품', '택배비', '기타',
]

const fmt = (n: number) => n.toLocaleString()
const fmtDate = (d: string) => d ? d.slice(0, 10) : '-'
const getCurrentMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface ExpenseItem {
  id?: string
  expense_date: string
  card_number: string
  category: string
  merchant: string
  item_name: string
  customer_team: string
  amount: number
  receipt_url: string
  created_at?: string
  _incomplete?: boolean
  _ocrEngine?: string // gemini | clova | none
}

// 필수 필드 미비 체크
const isIncomplete = (item: ExpenseItem) =>
  !item.category || !item.merchant || !item.amount

export default function ReceiptsPage() {
  const { user } = useApp()
  const [items, setItems] = useState<ExpenseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())

  // 법인카드 목록 (자동 매칭용)
  const [myCards, setMyCards] = useState<{ card_number: string; card_last4: string; is_default: boolean }[]>([])

  // 업로드 상태
  const fileRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<{
    name: string
    preview: string
    status: 'pending' | 'uploading' | 'done' | 'error'
    engine?: string
    parsed?: any
  }[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // 인라인 수정
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<ExpenseItem>>({})

  // ── 토큰 헬퍼 ──
  const getToken = async () => {
    const s = await supabase.auth.getSession()
    return s.data.session?.access_token || ''
  }

  // ── 데이터 로드 ──
  const fetchData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const token = await getToken()
      // 지출내역 + 법인카드 동시 로드
      const [receiptRes, cardRes] = await Promise.all([
        fetch(`/api/receipts?month=${selectedMonth}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/my-info/cards', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const receiptJson = await receiptRes.json()
      const cardJson = await cardRes.json()
      if (receiptJson.data) setItems(receiptJson.data.map((i: ExpenseItem) => ({ ...i, _incomplete: isIncomplete(i) })))
      if (cardJson.data) setMyCards(cardJson.data)
    } catch (e) {
      console.error('데이터 로드 실패:', e)
    } finally {
      setLoading(false)
    }
  }, [user, selectedMonth])

  useEffect(() => { fetchData() }, [fetchData])

  // ── 삭제 ──
  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    const token = await getToken()
    await fetch(`/api/receipts?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  // ── 자동 업로드 + Gemini AI 분석 + DB 저장 (핵심 플로우) ──
  const processAndSaveFiles = async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/'))
    if (images.length === 0) return

    // 중복 파일 제거
    const seen = new Set<string>()
    const unique = images.filter(f => {
      const key = `${f.name}_${f.size}_${f.lastModified}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // 큐 초기화
    const queue = unique.map(f => ({ name: f.name, preview: URL.createObjectURL(f), status: 'pending' as const }))
    setUploadQueue(queue)
    setIsProcessing(true)

    const token = await getToken()
    const newItems: ExpenseItem[] = []
    let geminiCount = 0
    let clovaCount = 0
    let failedCount = 0

    for (let i = 0; i < unique.length; i++) {
      setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'uploading' } : q))

      try {
        // 1) 이미지 업로드 + AI 분석 (Gemini 우선)
        const formData = new FormData()
        formData.append('file', unique[i])
        const ocrRes = await fetch('/api/receipts/ocr', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })
        const ocrJson = await ocrRes.json()

        const receiptUrl = ocrJson.receipt_url || ''
        const ocr = ocrJson.ocr_parsed || {}
        const engine = ocrJson.ocr_engine || 'none'

        if (engine === 'gemini') geminiCount++
        else if (engine === 'clova') clovaCount++
        else failedCount++

        // 2) AI 분석 결과로 자동 데이터 구성
        // Gemini는 category까지 직접 판단하므로 guessCategory 불필요

        // 카드번호 자동 매칭: OCR 뒤4자리 → 등록카드 매칭 → 기본카드 폴백
        let matchedCardNumber = ''
        if (ocr.card_last4 && myCards.length > 0) {
          const matched = myCards.find(c => c.card_last4 === ocr.card_last4)
          matchedCardNumber = matched ? matched.card_number : `****-****-****-${ocr.card_last4}`
        } else if (!ocr.card_last4 && myCards.length > 0) {
          // OCR에서 카드번호 못 읽은 경우 → 기본 카드 사용
          const defaultCard = myCards.find(c => c.is_default)
          if (defaultCard) matchedCardNumber = defaultCard.card_number
        }

        const item = {
          expense_date: ocr.date || new Date().toISOString().slice(0, 10),
          card_number: matchedCardNumber,
          category: ocr.category || guessCategory(ocr.merchant || '', ocr.item_name || ''),
          merchant: ocr.merchant || '',
          item_name: ocr.item_name || (ocr.items?.[0]?.name || ''),
          customer_team: '',
          amount: ocr.amount || 0,
          receipt_url: receiptUrl,
        }

        // 3) 바로 DB 저장
        const saveRes = await fetch('/api/receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ items: [item] }),
        })
        const saveJson = await saveRes.json()

        if (saveJson.success && saveJson.data?.[0]) {
          const saved = {
            ...saveJson.data[0],
            _incomplete: isIncomplete(saveJson.data[0]),
            _ocrEngine: engine,
          }
          newItems.push(saved)
        }

        setUploadQueue(prev => prev.map((q, idx) =>
          idx === i ? { ...q, status: 'done', engine, parsed: ocr } : q
        ))
      } catch (e) {
        console.error(`파일 ${i + 1} 처리 실패:`, e)
        failedCount++
        setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'error' } : q))
      }
    }

    // 날짜 기준으로 월별 분배 요약
    if (newItems.length > 0) {
      const monthCounts: Record<string, number> = {}
      newItems.forEach(item => {
        const m = item.expense_date?.slice(0, 7) || selectedMonth
        monthCounts[m] = (monthCounts[m] || 0) + 1
      })

      // 현재 선택된 월의 항목만 리스트에 추가
      const currentMonthItems = newItems.filter(i => (i.expense_date?.slice(0, 7) || '') === selectedMonth)
      if (currentMonthItems.length > 0) {
        setItems(prev => [...currentMonthItems, ...prev])
      }

      // 다른 월에도 저장된 건이 있으면 알림
      const otherMonths = Object.entries(monthCounts).filter(([m]) => m !== selectedMonth)

      // 분석 결과 요약
      const engineInfo = [
        geminiCount > 0 ? `Gemini AI: ${geminiCount}건` : '',
        clovaCount > 0 ? `CLOVA OCR: ${clovaCount}건` : '',
        failedCount > 0 ? `수동입력 필요: ${failedCount}건` : '',
      ].filter(Boolean).join(', ')

      if (otherMonths.length > 0 || engineInfo) {
        const monthSummary = Object.entries(monthCounts)
          .map(([m, c]) => `${m.replace('-', '년 ')}월: ${c}건`)
          .join(', ')
        const parts = [`${newItems.length}건 자동 등록 완료!`]
        if (Object.keys(monthCounts).length > 1) parts.push(`월별 분배: ${monthSummary}`)
        if (engineInfo) parts.push(`분석 엔진: ${engineInfo}`)
        setTimeout(() => alert(parts.join('\n')), 500)
      }
    }

    setIsProcessing(false)
    setTimeout(() => setUploadQueue([]), 2500)
  }

  // ── 카테고리 자동 추정 (Gemini가 카테고리를 못 잡았을 때 폴백) ──
  function guessCategory(merchant: string, itemName: string): string {
    const text = `${merchant} ${itemName}`.toLowerCase()
    if (/주유|칼텍스|sk에너지|오일|gs칼|현대오일/.test(text)) return '주유비'
    if (/충전|전기|ev|차지|스테이션/.test(text)) return '충전'
    if (/주차|파킹|아마노/.test(text)) return '주차비'
    if (/택시|카카오t|우버|교통/.test(text)) return '교통비'
    if (/회식|단체/.test(text)) return '회식비'
    if (/접대/.test(text)) return '접대'
    if (/식당|식사|밥|카페|커피|음식|레스토랑|치킨|피자|분식|한식|중식|일식/.test(text)) return '식비'
    if (/사무|문구|프린트|복사/.test(text)) return '사무용품'
    if (/택배|배송|우편/.test(text)) return '택배비'
    return '기타'
  }

  // ── 드래그앤드롭 핸들러 ──
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) processAndSaveFiles(Array.from(e.dataTransfer.files))
  }
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) processAndSaveFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  // ── 인라인 수정 시작 ──
  const startEdit = (item: ExpenseItem) => {
    setEditingId(item.id || null)
    setEditForm({
      expense_date: item.expense_date?.slice(0, 10),
      card_number: item.card_number,
      category: item.category,
      merchant: item.merchant,
      item_name: item.item_name,
      customer_team: item.customer_team,
      amount: item.amount,
    })
  }

  // ── 인라인 수정 저장 ──
  const saveEdit = async () => {
    if (!editingId) return
    const token = await getToken()

    await fetch(`/api/receipts?id=${editingId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })

    const old = items.find(i => i.id === editingId)
    const merged = {
      expense_date: editForm.expense_date || old?.expense_date || new Date().toISOString().slice(0, 10),
      card_number: editForm.card_number ?? old?.card_number ?? '',
      category: editForm.category || old?.category || '',
      merchant: editForm.merchant || old?.merchant || '',
      item_name: editForm.item_name ?? old?.item_name ?? '',
      customer_team: editForm.customer_team ?? old?.customer_team ?? '',
      amount: editForm.amount ?? old?.amount ?? 0,
      receipt_url: old?.receipt_url || '',
    }

    const res = await fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: [merged] }),
    })
    const json = await res.json()

    if (json.success && json.data?.[0]) {
      setItems(prev => prev.map(i => i.id === editingId
        ? { ...json.data[0], _incomplete: isIncomplete(json.data[0]) }
        : i
      ))
    }
    setEditingId(null)
  }

  // ── 합계 ──
  const totalAmount = items.reduce((s, i) => s + (i.amount || 0), 0)
  const categoryTotals = items.reduce<Record<string, number>>((acc, i) => {
    if (i.category) acc[i.category] = (acc[i.category] || 0) + (i.amount || 0)
    return acc
  }, {})
  const incompleteCount = items.filter(i => i._incomplete).length

  // ── xlsx 다운로드 ──
  const handleDownloadXlsx = async () => {
    try {
      const token = await getToken()
      const res = await fetch(`/api/receipts/download?month=${selectedMonth}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `법인카드_사용내역서_${selectedMonth}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch { alert('다운로드에 실패했습니다.') }
  }

  // ── 월 목록 ──
  const months: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>

      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: 0 }}>법인카드 사용내역</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            영수증을 올리면 <strong style={{ color: '#2563eb' }}>Gemini AI</strong>가 자동 분석합니다
          </p>
        </div>
        <button
          onClick={handleDownloadXlsx}
          style={{ padding: '10px 18px', background: '#059669', color: '#fff', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          엑셀 다운로드
        </button>
      </div>

      {/* ── 드롭존 (메인 페이지 상단) ── */}
      <div
        style={{
          border: isDragOver ? '2px solid #2563eb' : '2px dashed #cbd5e1',
          borderRadius: 16, padding: isProcessing ? '16px 20px' : '28px 20px',
          textAlign: 'center', marginBottom: 20,
          background: isDragOver ? '#eff6ff' : '#fafbfc',
          cursor: 'pointer', transition: 'all 0.2s ease',
        }}
        onClick={() => !isProcessing && fileRef.current?.click()}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileInput} style={{ display: 'none' }} />

        {isProcessing || uploadQueue.length > 0 ? (
          /* 업로드 + AI 분석 진행 상태 */
          <div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              {uploadQueue.map((q, i) => (
                <div key={i} style={{
                  width: 56, height: 56, borderRadius: 10, overflow: 'hidden', position: 'relative',
                  border: q.status === 'uploading' ? '2px solid #2563eb' : q.status === 'done' ? '2px solid #22c55e' : q.status === 'error' ? '2px solid #ef4444' : '2px solid #e2e8f0',
                  opacity: q.status === 'pending' ? 0.4 : 1,
                }}>
                  <img src={q.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {q.status === 'uploading' && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(37,99,235,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    </div>
                  )}
                  {q.status === 'done' && (
                    <div style={{ position: 'absolute', bottom: 2, right: 2, background: '#22c55e', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>
                    </div>
                  )}
                  {/* AI 엔진 뱃지 */}
                  {q.status === 'done' && q.engine && (
                    <div style={{
                      position: 'absolute', top: 2, left: 2,
                      background: q.engine === 'gemini' ? '#4285f4' : q.engine === 'clova' ? '#03c75a' : '#94a3b8',
                      borderRadius: 4, padding: '1px 4px',
                    }}>
                      <span style={{ color: '#fff', fontSize: 7, fontWeight: 800 }}>
                        {q.engine === 'gemini' ? 'AI' : q.engine === 'clova' ? 'OCR' : '?'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, color: '#2563eb', fontWeight: 700 }}>
              {uploadQueue.filter(q => q.status === 'done').length} / {uploadQueue.length} AI 분석 완료
            </p>
            {isProcessing && (
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Gemini AI가 영수증을 분석하고 있습니다...</p>
            )}
          </div>
        ) : isDragOver ? (
          <div>
            <div style={{ fontSize: 44, marginBottom: 6 }}>🤖</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#2563eb' }}>여기에 놓으면 AI가 자동 분석합니다</p>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 44, marginBottom: 6 }}>🧾</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#334155' }}>영수증 이미지를 여기에 드래그하거나 클릭</p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              여러 장 동시 가능 · <span style={{ color: '#4285f4', fontWeight: 600 }}>Gemini AI</span> 자동 분석 · 자동 등록 · 중복 자동 제거
            </p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* ── 월 필터 + 합계 ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, background: '#fff' }}
        >
          {months.map(m => <option key={m} value={m}>{m.replace('-', '년 ')}월</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0f9ff', padding: '8px 16px', borderRadius: 8, border: '1px solid #bae6fd' }}>
          <span style={{ fontSize: 13, color: '#0369a1', fontWeight: 600 }}>합계</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#0c4a6e' }}>{fmt(totalAmount)}원</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>({items.length}건)</span>
        </div>
        {incompleteCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fef3c7', padding: '6px 14px', borderRadius: 8, border: '1px solid #fde68a' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>⚠ 미비 {incompleteCount}건</span>
            <span style={{ fontSize: 11, color: '#92400e' }}>— 행을 클릭하여 수정</span>
          </div>
        )}
      </div>

      {/* ── 카테고리별 칩 ── */}
      {Object.keys(categoryTotals).length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
            <div key={cat} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{cat}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{fmt(total)}원</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 테이블 ── */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['날짜', '카드번호', '구분', '사용처', '품명', '고객명/팀원'].map(h => (
                  <th key={h} style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap', fontSize: 12 }}>{h}</th>
                ))}
                <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap', fontSize: 12 }}>금액</th>
                <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 12 }}>영수증</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>등록된 지출내역이 없습니다</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>위 영역에 영수증 이미지를 올려보세요</div>
                </td></tr>
              ) : items.map((item, idx) => {
                const isEditing = editingId === item.id
                const incomplete = item._incomplete

                if (isEditing) {
                  return (
                    <tr key={item.id || idx} style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                      <td style={{ padding: '6px 6px' }}>
                        <input type="date" value={editForm.expense_date || ''} onChange={e => setEditForm(p => ({ ...p, expense_date: e.target.value }))}
                          style={{ width: 120, padding: '6px 4px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }} />
                      </td>
                      <td style={{ padding: '6px 6px' }}>
                        <input value={editForm.card_number || ''} onChange={e => setEditForm(p => ({ ...p, card_number: e.target.value }))}
                          placeholder="카드번호" style={{ width: 130, padding: '6px 4px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }} />
                      </td>
                      <td style={{ padding: '6px 6px' }}>
                        <select value={editForm.category || ''} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))}
                          style={{ width: 80, padding: '6px 2px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, background: '#fff' }}>
                          <option value="">선택</option>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '6px 6px' }}>
                        <input value={editForm.merchant || ''} onChange={e => setEditForm(p => ({ ...p, merchant: e.target.value }))}
                          placeholder="사용처" style={{ width: '100%', minWidth: 100, padding: '6px 4px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }} />
                      </td>
                      <td style={{ padding: '6px 6px' }}>
                        <input value={editForm.item_name || ''} onChange={e => setEditForm(p => ({ ...p, item_name: e.target.value }))}
                          placeholder="품명" style={{ width: 80, padding: '6px 4px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }} />
                      </td>
                      <td style={{ padding: '6px 6px' }}>
                        <input value={editForm.customer_team || ''} onChange={e => setEditForm(p => ({ ...p, customer_team: e.target.value }))}
                          placeholder="고객/팀원" style={{ width: 90, padding: '6px 4px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }} />
                      </td>
                      <td style={{ padding: '6px 6px' }}>
                        <input type="number" value={editForm.amount ?? ''} onChange={e => setEditForm(p => ({ ...p, amount: parseInt(e.target.value) || 0 }))}
                          style={{ width: 90, padding: '6px 4px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, textAlign: 'right', fontWeight: 700 }} />
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                        {item.receipt_url && <a href={item.receipt_url} target="_blank" rel="noopener" style={{ color: '#2563eb', fontSize: 11 }}>📎</a>}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button onClick={saveEdit}
                          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', marginRight: 2 }}>
                          저장
                        </button>
                        <button onClick={() => setEditingId(null)}
                          style={{ background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 6, padding: '4px 6px', fontSize: 11, cursor: 'pointer' }}>
                          취소
                        </button>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr
                    key={item.id || idx}
                    style={{
                      borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                      background: incomplete ? '#fffbeb' : undefined,
                    }}
                    onClick={() => startEdit(item)}
                    onMouseEnter={e => { if (!incomplete) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { e.currentTarget.style.background = incomplete ? '#fffbeb' : '' }}
                  >
                    <td style={{ padding: '10px 10px', whiteSpace: 'nowrap', fontWeight: 500, fontSize: 12 }}>{fmtDate(item.expense_date)}</td>
                    <td style={{ padding: '10px 10px', whiteSpace: 'nowrap', color: '#64748b', fontSize: 11 }}>{item.card_number || '-'}</td>
                    <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                      {item.category ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: item.category === '접대' ? '#fef3c7' : item.category.includes('주유') ? '#dbeafe' : item.category === '충전' ? '#dcfce7' : '#f1f5f9',
                          color: item.category === '접대' ? '#d97706' : item.category.includes('주유') ? '#2563eb' : item.category === '충전' ? '#16a34a' : '#475569',
                        }}>{item.category}</span>
                      ) : (
                        <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 700 }}>미입력</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 10px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                      {item.merchant || <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 700 }}>미입력</span>}
                    </td>
                    <td style={{ padding: '10px 10px', color: '#64748b', fontSize: 12 }}>{item.item_name || '-'}</td>
                    <td style={{ padding: '10px 10px', color: '#64748b', fontSize: 11 }}>{item.customer_team || '-'}</td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: item.amount ? '#0c4a6e' : '#ef4444', whiteSpace: 'nowrap', fontSize: 13 }}>
                      {item.amount ? `${fmt(item.amount)}원` : '미입력'}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      {item.receipt_url ? (
                        <a href={item.receipt_url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: '#2563eb', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>📎 보기</a>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '10px 4px', textAlign: 'center' }}>
                      <button onClick={(e) => { e.stopPropagation(); if (item.id) handleDelete(item.id) }}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13, padding: 2 }} title="삭제">✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                  <td colSpan={6} style={{ padding: '12px 10px', fontWeight: 700, color: '#1e293b' }}>합계</td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 800, color: '#0c4a6e', fontSize: 15 }}>{fmt(totalAmount)}원</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
