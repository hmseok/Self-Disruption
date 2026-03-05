'use client'

import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
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
  memo?: string
  created_at?: string
  _incomplete?: boolean
  _ocrEngine?: string
}

const isIncomplete = (item: ExpenseItem) =>
  !item.category || !item.merchant || !item.amount

// ── 모바일 감지 훅 ──
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    setReady(true)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return { isMobile, ready }
}

export default function ReceiptsPage() {
  const { user, role, adminSelectedCompanyId, company } = useApp()
  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id
  const [items, setItems] = useState<ExpenseItem[]>([])
  const [loading, setLoading] = useState(true)

  // 마지막 선택 월을 localStorage에서 복원
  const MONTH_KEY = 'receipts_selected_month'
  const [selectedMonth, setSelectedMonthRaw] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(MONTH_KEY)
      if (saved && /^\d{4}-\d{2}$/.test(saved)) return saved
    }
    return getCurrentMonth()
  })
  const setSelectedMonth = (m: string) => {
    setSelectedMonthRaw(m)
    if (typeof window !== 'undefined') localStorage.setItem(MONTH_KEY, m)
  }

  // 법인카드 목록 (자동 매칭용)
  const [myCards, setMyCards] = useState<{ card_number: string; card_last4: string; is_default: boolean }[]>([])

  // DB에 데이터가 존재하는 월 목록 (월 선택기 확장용)
  const [dataMonths, setDataMonths] = useState<string[]>([])

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

  // 방금 업로드된 항목 (월과 무관하게 임시 표시)
  const [justUploaded, setJustUploaded] = useState<ExpenseItem[]>([])

  // 검색
  const [searchQuery, setSearchQuery] = useState('')

  // 선택 + 일괄수정
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkItemName, setBulkItemName] = useState('')
  const [bulkCustomerTeam, setBulkCustomerTeam] = useState('')

  // 인라인 수정
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<ExpenseItem>>({})

  // 모바일 감지
  const { isMobile, ready: mobileReady } = useIsMobile()

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
      const cid = effectiveCompanyId ? `&company_id=${effectiveCompanyId}` : ''
      const [receiptRes, cardRes] = await Promise.all([
        fetch(`/api/receipts?month=${selectedMonth}${cid}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/my-info/cards', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ])
      const receiptJson = await receiptRes.json()
      if (receiptJson.data) setItems(receiptJson.data.map((i: ExpenseItem) => ({ ...i, _incomplete: isIncomplete(i) })))
      if (cardRes) {
        const cardJson = await cardRes.json()
        if (cardJson.data) setMyCards(cardJson.data)
      }
    } catch (e) {
      console.error('데이터 로드 실패:', e)
    } finally {
      setLoading(false)
    }
  }, [user, selectedMonth, effectiveCompanyId])

  useEffect(() => {
    fetchData()
    // 월 변경 시 초기화
    setJustUploaded([])
    setSelectedIds(new Set())
  }, [fetchData])

  // ── 존재하는 월 목록 로드 (월 선택기 확장용) ──
  const [initialMonthSet, setInitialMonthSet] = useState(false)
  const fetchDataMonths = useCallback(async () => {
    if (!user) return
    try {
      const token = await getToken()
      const cid = effectiveCompanyId ? `&company_id=${effectiveCompanyId}` : ''
      const res = await fetch(`/api/receipts?list_months=true${cid}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (json.months) {
        setDataMonths(json.months)
        // 현재 선택된 월에 데이터가 없으면 → 데이터 있는 월로 이동
        if (!initialMonthSet && json.months.length > 0) {
          setInitialMonthSet(true)
          if (!json.months.includes(selectedMonth)) {
            setSelectedMonth(json.months[0]) // 가장 최근 데이터 월
          }
        }
        // 데이터가 아예 없으면 현재월로
        if (json.months.length === 0 && selectedMonth !== getCurrentMonth()) {
          setSelectedMonth(getCurrentMonth())
        }
      }
    } catch { /* 실패해도 무시 */ }
  }, [user, effectiveCompanyId, initialMonthSet, selectedMonth])

  useEffect(() => { fetchDataMonths() }, [fetchDataMonths])

  // ── 삭제 후 월 목록 갱신 + 빈 월이면 이동 ──
  const refreshAfterDelete = () => {
    // 월 목록 재조회 (빈 월 자동 제거)
    setInitialMonthSet(false)
    fetchDataMonths()
    fetchData()
  }

  // ── 단건 삭제 ──
  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    const token = await getToken()
    await fetch(`/api/receipts?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    setItems(prev => {
      const next = prev.filter(i => i.id !== id)
      // 현재 월 데이터가 전부 삭제되었으면 월 목록 갱신
      if (next.length === 0) setTimeout(refreshAfterDelete, 100)
      return next
    })
    setJustUploaded(prev => prev.filter(i => i.id !== id))
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
  }

  // ── 일괄 삭제 ──
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) return
    const token = await getToken()
    const ids = Array.from(selectedIds)
    await Promise.all(
      ids.map(id => fetch(`/api/receipts?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }))
    )
    setItems(prev => prev.filter(i => !selectedIds.has(i.id || '')))
    setJustUploaded(prev => prev.filter(i => !selectedIds.has(i.id || '')))
    setSelectedIds(new Set())
    // 월 목록 갱신
    setTimeout(refreshAfterDelete, 100)
  }

  // ── 일괄 수정 (구분/품명/고객명) ──
  const handleBulkUpdate = async (updates: { category?: string; item_name?: string; customer_team?: string }) => {
    if (selectedIds.size === 0) return
    const token = await getToken()
    try {
      const res = await fetch('/api/receipts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds), updates }),
      })
      if (res.ok) {
        // 로컬 상태 업데이트
        setItems(prev => prev.map(i => selectedIds.has(i.id || '') ? { ...i, ...updates } : i))
        setJustUploaded(prev => prev.map(i => selectedIds.has(i.id || '') ? { ...i, ...updates } : i))
      }
    } catch (e) { console.error(e) }
  }

  // ── 전체 선택/해제 (현재 화면에 보이는 항목만) ──
  const toggleSelectAll = () => {
    const visibleIds = allDisplayItems.filter(i => i.id).map(i => i.id!)
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
    if (allSelected) {
      // 보이는 항목만 해제
      setSelectedIds(prev => {
        const next = new Set(prev)
        visibleIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      // 보이는 항목만 추가
      setSelectedIds(prev => {
        const next = new Set(prev)
        visibleIds.forEach(id => next.add(id))
        return next
      })
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── 자동 업로드 + Gemini AI 분석 + DB 저장 ──
  const processAndSaveFiles = async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/'))
    if (images.length === 0) return

    const seen = new Set<string>()
    const unique = images.filter(f => {
      const key = `${f.name}_${f.size}_${f.lastModified}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const queue = unique.map(f => ({ name: f.name, preview: URL.createObjectURL(f), status: 'pending' as const }))
    setUploadQueue(queue)
    setIsProcessing(true)
    setJustUploaded([]) // 이전 업로드 결과 초기화

    const token = await getToken()
    const newItems: ExpenseItem[] = []
    let geminiCount = 0
    let clovaCount = 0
    let failedCount = 0

    for (let i = 0; i < unique.length; i++) {
      setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'uploading' } : q))

      try {
        const formData = new FormData()
        formData.append('file', unique[i])
        const ocrRes = await fetch('/api/receipts/ocr', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })
        const ocrJson = await ocrRes.json()

        const receiptUrl = ocrJson.receipt_url || ''
        const ocrItems: any[] = ocrJson.ocr_parsed_items || (ocrJson.ocr_parsed ? [ocrJson.ocr_parsed] : [])
        const engine = ocrJson.ocr_engine || 'none'
        const isMulti = ocrJson.is_multi || false

        if (engine === 'gemini') geminiCount++
        else if (engine === 'clova') clovaCount++
        else failedCount++

        // 각 OCR 항목을 DB에 저장할 아이템으로 변환
        const itemsToSave = ocrItems
          .filter((ocr: any) => ocr.amount && ocr.amount !== 0)
          .map((ocr: any) => {
            // 카드번호 자동 매칭
            let matchedCardNumber = ''
            if (ocr.card_last4 && myCards.length > 0) {
              const matched = myCards.find(c => c.card_last4 === ocr.card_last4)
              matchedCardNumber = matched ? matched.card_number : `****-****-****-${ocr.card_last4}`
            } else if (!ocr.card_last4 && myCards.length > 0) {
              const defaultCard = myCards.find(c => c.is_default)
              if (defaultCard) matchedCardNumber = defaultCard.card_number
            }

            return {
              expense_date: ocr.date || new Date().toISOString().slice(0, 10),
              card_number: matchedCardNumber,
              category: ocr.category || guessCategory(ocr.merchant || '', ocr.item_name || ''),
              merchant: ocr.merchant || '',
              item_name: ocr.item_name || (ocr.items?.[0]?.name || ''),
              customer_team: '',
              amount: ocr.amount || 0,
              receipt_url: receiptUrl,
            }
          })

        if (itemsToSave.length === 0) {
          itemsToSave.push({
            expense_date: new Date().toISOString().slice(0, 10),
            card_number: '',
            category: '기타',
            merchant: '',
            item_name: '',
            customer_team: '',
            amount: 0,
            receipt_url: receiptUrl,
          })
        }

        const saveRes = await fetch('/api/receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ items: itemsToSave, ...(effectiveCompanyId ? { company_id: effectiveCompanyId } : {}) }),
        })
        const saveJson = await saveRes.json()

        if (saveJson.success && saveJson.data) {
          for (const d of saveJson.data) {
            newItems.push({
              ...d,
              _incomplete: isIncomplete(d),
              _ocrEngine: engine,
            })
          }
        }

        setUploadQueue(prev => prev.map((q, idx) =>
          idx === i ? {
            ...q,
            status: 'done',
            engine,
            parsed: isMulti ? `${ocrItems.length}건 감지` : ocrItems[0],
          } : q
        ))
      } catch (e) {
        console.error(`파일 ${i + 1} 처리 실패:`, e)
        failedCount++
        setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'error' } : q))
      }
    }

    if (newItems.length > 0) {
      // 월별 카운트
      const monthCounts: Record<string, number> = {}
      newItems.forEach(item => {
        const m = item.expense_date?.slice(0, 7) || selectedMonth
        monthCounts[m] = (monthCounts[m] || 0) + 1
      })

      // ★ 핵심: 가장 많은 항목이 있는 월로 자동 이동
      const topMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0]

      if (topMonth && topMonth !== selectedMonth) {
        // 다른 월이면 → 해당 월로 자동 이동 (fetchData가 자동 트리거됨)
        setSelectedMonth(topMonth)
        // 이동 전까지 justUploaded에 표시
        setJustUploaded(newItems)
      } else {
        // 같은 월이면 → 바로 리스트에 추가
        const currentMonthItems = newItems.filter(i => (i.expense_date?.slice(0, 7) || '') === selectedMonth)
        if (currentMonthItems.length > 0) {
          setItems(prev => [...currentMonthItems, ...prev])
        }
        // 다른 월 항목도 justUploaded로 표시
        const otherItems = newItems.filter(i => (i.expense_date?.slice(0, 7) || '') !== selectedMonth)
        if (otherItems.length > 0) {
          setJustUploaded(otherItems)
        }
      }

      // 분석 결과 요약
      const engineInfo = [
        geminiCount > 0 ? `Gemini AI: ${geminiCount}건` : '',
        clovaCount > 0 ? `CLOVA OCR: ${clovaCount}건` : '',
        failedCount > 0 ? `수동입력 필요: ${failedCount}건` : '',
      ].filter(Boolean).join(', ')

      const monthSummary = Object.entries(monthCounts)
        .map(([m, c]) => `${m.replace('-', '년 ')}월: ${c}건`)
        .join(', ')
      const parts = [`${newItems.length}건 자동 등록 완료!`]
      if (Object.keys(monthCounts).length > 1) parts.push(`월별 분배: ${monthSummary}`)
      if (topMonth && topMonth !== selectedMonth) parts.push(`→ ${topMonth.replace('-', '년 ')}월로 자동 이동합니다`)
      if (engineInfo) parts.push(`분석 엔진: ${engineInfo}`)
      setTimeout(() => alert(parts.join('\n')), 300)

      // 월 목록 갱신
      fetchDataMonths()
    } else if (unique.length > 0) {
      setTimeout(() => alert('업로드한 파일의 분석 결과가 없습니다.\n서버 로그를 확인해주세요.'), 300)
    }

    setIsProcessing(false)
    setTimeout(() => setUploadQueue([]), 2500)
  }

  // ── 카테고리 자동 추정 (Gemini 폴백) ──
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

  // ── 인라인 수정 ──
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
      memo: item.memo || '',
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    const token = await getToken()

    await fetch(`/api/receipts?id=${editingId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })

    const old = items.find(i => i.id === editingId) || justUploaded.find(i => i.id === editingId)
    const merged = {
      expense_date: editForm.expense_date || old?.expense_date || new Date().toISOString().slice(0, 10),
      card_number: editForm.card_number ?? old?.card_number ?? '',
      category: editForm.category || old?.category || '',
      merchant: editForm.merchant || old?.merchant || '',
      item_name: editForm.item_name ?? old?.item_name ?? '',
      customer_team: editForm.customer_team ?? old?.customer_team ?? '',
      amount: editForm.amount ?? old?.amount ?? 0,
      receipt_url: old?.receipt_url || '',
      memo: editForm.memo ?? old?.memo ?? '',
    }

    const res = await fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: [merged], ...(effectiveCompanyId ? { company_id: effectiveCompanyId } : {}) }),
    })
    const json = await res.json()

    if (json.success && json.data?.[0]) {
      const updated = { ...json.data[0], _incomplete: isIncomplete(json.data[0]) }
      setItems(prev => prev.map(i => i.id === editingId ? updated : i))
      setJustUploaded(prev => prev.map(i => i.id === editingId ? updated : i))
    }
    setEditingId(null)
  }

  // ── 합계 + 검색 ──
  const allRawItems = [...items, ...justUploaded.filter(j => !items.some(i => i.id === j.id))]
  const allDisplayItems = searchQuery.trim()
    ? allRawItems.filter(i => {
        const q = searchQuery.toLowerCase()
        return (
          (i.merchant || '').toLowerCase().includes(q) ||
          (i.item_name || '').toLowerCase().includes(q) ||
          (i.category || '').toLowerCase().includes(q) ||
          (i.customer_team || '').toLowerCase().includes(q) ||
          (i.card_number || '').toLowerCase().includes(q) ||
          (i.expense_date || '').includes(q) ||
          String(i.amount || '').includes(q)
        )
      })
    : allRawItems
  const totalAmount = allDisplayItems.reduce((s, i) => s + (i.amount || 0), 0)
  const categoryTotals = allDisplayItems.reduce<Record<string, number>>((acc, i) => {
    if (i.category) acc[i.category] = (acc[i.category] || 0) + (i.amount || 0)
    return acc
  }, {})
  const incompleteCount = allDisplayItems.filter(i => i._incomplete).length

  // ── xlsx 다운로드 ──
  const handleDownloadXlsx = async () => {
    try {
      const token = await getToken()
      const res = await fetch(`/api/receipts/download?month=${selectedMonth}${effectiveCompanyId ? `&company_id=${effectiveCompanyId}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const monthNum = parseInt(selectedMonth.split('-')[1])
      a.download = `법인카드 사용내역서 (${monthNum}월분).xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch { alert('다운로드에 실패했습니다.') }
  }

  // ── 월 목록: 데이터가 있는 월만 + 현재월 항상 포함 ──
  const curMonth = getCurrentMonth()
  const allMonths = Array.from(new Set([curMonth, ...dataMonths, ...(selectedMonth ? [selectedMonth] : [])]))
    .sort((a, b) => b.localeCompare(a))

  // justUploaded 중 현재 월이 아닌 항목만 따로 표시
  const otherMonthUploads = justUploaded.filter(j => !items.some(i => i.id === j.id))

  // ── 행 렌더 헬퍼 ──
  const renderRow = (item: ExpenseItem, idx: number, highlight?: string) => {
    const isEditing = editingId === item.id
    const incomplete = item._incomplete

    if (isEditing) {
      return (
        <Fragment key={item.id || `edit-${idx}`}>
        <tr style={{ background: '#fffbeb' }}>
          <td style={{ padding: '6px 6px', textAlign: 'center', width: 36 }}></td>
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
        <tr style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
          <td style={{ padding: '2px 6px' }}></td>
          <td colSpan={9} style={{ padding: '2px 6px 8px' }}>
            <input value={editForm.memo || ''} onChange={e => setEditForm(p => ({ ...p, memo: e.target.value }))}
              placeholder="메모 (선택사항)" style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, color: '#64748b', boxSizing: 'border-box' }} />
          </td>
        </tr>
        </Fragment>
      )
    }

    return (
      <tr
        key={item.id || `row-${idx}`}
        style={{
          borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
          background: highlight ? highlight : (item.id && selectedIds.has(item.id)) ? '#eff6ff' : incomplete ? '#fffbeb' : undefined,
        }}
        onClick={() => startEdit(item)}
        onMouseEnter={e => { if (!incomplete && !highlight && !(item.id && selectedIds.has(item.id))) e.currentTarget.style.background = '#f8fafc' }}
        onMouseLeave={e => { e.currentTarget.style.background = highlight || ((item.id && selectedIds.has(item.id)) ? '#eff6ff' : (incomplete ? '#fffbeb' : '')) }}
      >
        <td style={{ padding: '10px 6px', textAlign: 'center', width: 36 }} onClick={e => e.stopPropagation()}>
          {item.id && (
            <input
              type="checkbox"
              checked={selectedIds.has(item.id)}
              onChange={() => toggleSelect(item.id!)}
              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2563eb' }}
            />
          )}
        </td>
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
        <td style={{ padding: '10px 10px', maxWidth: 200, fontWeight: 500 }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.merchant || <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 700 }}>미입력</span>}
          </div>
          {item.memo && (
            <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
              📝 {item.memo}
            </div>
          )}
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
  }

  // ── 모바일 카드 렌더 ──
  const renderCard = (item: ExpenseItem, idx: number, highlight?: string) => {
    const incomplete = item._incomplete
    const isEditing = editingId === item.id

    if (isEditing) {
      return (
        <div key={item.id || `edit-card-${idx}`} style={{
          background: '#fffbeb', border: '2px solid #fde68a', borderRadius: 12, padding: 12, marginBottom: 8,
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
            <input type="date" value={editForm.expense_date || ''} onChange={e => setEditForm(p => ({ ...p, expense_date: e.target.value }))}
              style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input value={editForm.card_number || ''} onChange={e => setEditForm(p => ({ ...p, card_number: e.target.value }))}
              placeholder="카드번호" style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <select value={editForm.category || ''} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))}
              style={{ flex: 1, padding: '6px 6px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, background: '#fff' }}>
              <option value="">구분 선택</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input value={editForm.merchant || ''} onChange={e => setEditForm(p => ({ ...p, merchant: e.target.value }))}
              placeholder="사용처" style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input value={editForm.item_name || ''} onChange={e => setEditForm(p => ({ ...p, item_name: e.target.value }))}
              placeholder="품명" style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input value={editForm.customer_team || ''} onChange={e => setEditForm(p => ({ ...p, customer_team: e.target.value }))}
              placeholder="고객명/팀원" style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input type="number" value={editForm.amount ?? ''} onChange={e => setEditForm(p => ({ ...p, amount: parseInt(e.target.value) || 0 }))}
              style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, textAlign: 'right', fontWeight: 700 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input value={editForm.memo || ''} onChange={e => setEditForm(p => ({ ...p, memo: e.target.value }))}
              placeholder="메모 (선택사항)" style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11, color: '#64748b' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveEdit}
              style={{ flex: 1, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              저장
            </button>
            <button onClick={() => setEditingId(null)}
              style={{ flex: 1, background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 6, padding: '8px', fontSize: 12, cursor: 'pointer' }}>
              취소
            </button>
          </div>
        </div>
      )
    }

    return (
      <div key={item.id || `card-${idx}`} onClick={() => startEdit(item)} style={{
        background: highlight ? highlight : (item.id && selectedIds.has(item.id)) ? '#dbeafe' : incomplete ? '#fffbeb' : '#fff',
        border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, marginBottom: 8,
        cursor: 'pointer', transition: 'background 0.2s',
      }} onMouseEnter={e => { if (!incomplete && !highlight && !(item.id && selectedIds.has(item.id))) e.currentTarget.style.background = '#f8fafc' }}
        onMouseLeave={e => { e.currentTarget.style.background = highlight || ((item.id && selectedIds.has(item.id)) ? '#dbeafe' : (incomplete ? '#fffbeb' : '#fff')) }}>

        {/* 체크박스 + 날짜 + 구분 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={item.id ? selectedIds.has(item.id) : false} onChange={() => item.id && toggleSelect(item.id)}
            onClick={e => e.stopPropagation()} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2563eb' }} />
          <span style={{ fontWeight: 600, fontSize: 12, color: '#1e293b', flex: 1 }}>{fmtDate(item.expense_date)}</span>
          {item.category ? (
            <span style={{
              display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: item.category === '접대' ? '#fef3c7' : item.category.includes('주유') ? '#dbeafe' : item.category === '충전' ? '#dcfce7' : '#f1f5f9',
              color: item.category === '접대' ? '#d97706' : item.category.includes('주유') ? '#2563eb' : item.category === '충전' ? '#16a34a' : '#475569',
            }}>{item.category}</span>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>미입력</span>
          )}
        </div>

        {/* 사용처 (굵게) */}
        <div style={{ fontWeight: 600, fontSize: 12, color: '#1e293b', marginBottom: 6, wordBreak: 'break-word' }}>
          {item.merchant || <span style={{ color: '#ef4444' }}>미입력</span>}
        </div>

        {/* 품명 + 고객명 */}
        <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#64748b', marginBottom: 6 }}>
          <span>{item.item_name || '-'}</span>
          {item.customer_team && <span style={{ marginLeft: 'auto' }}>{item.customer_team}</span>}
        </div>

        {/* 메모 */}
        {item.memo && (
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, fontStyle: 'italic', wordBreak: 'break-word' }}>
            📝 {item.memo}
          </div>
        )}

        {/* 금액 + 영수증 + 삭제 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: item.amount ? '#0c4a6e' : '#ef4444' }}>
            {item.amount ? `${fmt(item.amount)}원` : '미입력'}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {item.receipt_url && (
              <a href={item.receipt_url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{
                color: '#2563eb', fontSize: 11, fontWeight: 600, textDecoration: 'none', padding: '4px 6px'
              }}>📎</a>
            )}
            <button onClick={(e) => { e.stopPropagation(); if (item.id) handleDelete(item.id) }}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: '4px 4px' }} title="삭제">✕</button>
          </div>
        </div>
      </div>
    )
  }

  // ── god_admin 회사 미선택 시 차단 ──
  if (role === 'god_admin' && !adminSelectedCompanyId) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px', minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowX: 'hidden', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500 }}>
          <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>🏢</span>
          <p style={{ fontWeight: 700, color: '#374151', fontSize: 16, marginBottom: 8 }}>좌측 상단에서 회사를 먼저 선택해주세요</p>
          <p style={{ color: '#9ca3af', fontSize: 13 }}>법인카드 사용내역은 회사 기준으로 관리됩니다</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '16px 12px' : '24px 16px', overflowX: 'hidden', boxSizing: 'border-box', width: '100%' }}>

      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: '#1e293b', margin: 0 }}>법인카드 사용내역</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            영수증을 올리면 <strong style={{ color: '#2563eb' }}>Gemini AI</strong>가 자동 분석합니다
          </p>
        </div>
        <button
          onClick={handleDownloadXlsx}
          style={{ padding: '10px 18px', background: '#059669', color: '#fff', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: isMobile ? 12 : 14, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {isMobile ? '다운로드' : '엑셀 다운로드'}
        </button>
      </div>

      {/* ── 드롭존 ── */}
      <div
        style={{
          border: isDragOver ? '2px solid #2563eb' : '2px dashed #cbd5e1',
          borderRadius: 16, padding: isProcessing ? '12px 16px' : isMobile ? '20px 16px' : '28px 20px',
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
            <div style={{ fontSize: isMobile ? 32 : 44, marginBottom: 6 }}>🧾</div>
            <p style={{ fontSize: isMobile ? 13 : 15, fontWeight: 700, color: '#334155', wordBreak: 'keep-all' }}>
              {isMobile ? '영수증 이미지를 클릭하여 업로드' : '영수증 이미지를 여기에 드래그하거나 클릭'}
            </p>
            <p style={{ fontSize: isMobile ? 11 : 12, color: '#94a3b8', marginTop: 4, wordBreak: 'keep-all' }}>
              여러 장 동시 가능 · <span style={{ color: '#4285f4', fontWeight: 600 }}>Gemini AI</span> 자동 분석
            </p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* ── 월 필터 + 검색 + 합계 ── */}
      <div style={{ display: 'flex', gap: isMobile ? 8 : 12, marginBottom: 16, alignItems: 'center', flexDirection: isMobile ? 'column' : 'row', width: '100%', boxSizing: 'border-box' }}>
        {isMobile ? (
          /* 모바일: 월 + 검색을 한 줄로 */
          <div style={{ display: 'flex', gap: 8, width: '100%', boxSizing: 'border-box' }}>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, fontWeight: 600, background: '#fff', flexShrink: 0, width: 'auto', minWidth: 0 }}
            >
              {allMonths.map(m => (
                <option key={m} value={m}>{m.replace('-', '년 ')}월</option>
              ))}
            </select>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <input
                type="text"
                placeholder="검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8,
                  border: '1px solid #d1d5db', fontSize: 13, outline: 'none',
                  background: '#fff', boxSizing: 'border-box',
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#93c5fd'}
                onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
              />
              <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13, padding: 0 }}>✕</button>
              )}
            </div>
          </div>
        ) : (
          /* 데스크톱: 기존 레이아웃 */
          <>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, background: '#fff', flexShrink: 0 }}
            >
              {allMonths.map(m => (
                <option key={m} value={m}>{m.replace('-', '년 ')}월</option>
              ))}
            </select>
            <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
              <input
                type="text"
                placeholder="사용처, 품명, 구분, 고객명, 금액 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
                  border: '1px solid #d1d5db', fontSize: 13, outline: 'none',
                  background: '#fff', boxSizing: 'border-box',
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#93c5fd'}
                onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
              />
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
              )}
            </div>
          </>
        )}
        {searchQuery && (
          <span style={{ fontSize: 12, color: '#64748b', flexShrink: 0 }}>{allDisplayItems.length}건</span>
        )}
        {incompleteCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fef3c7', padding: '6px 14px', borderRadius: 8, border: '1px solid #fde68a', flexShrink: 0, width: isMobile ? '100%' : 'auto', boxSizing: 'border-box' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>⚠ 미비 {incompleteCount}건</span>
          </div>
        )}
        <div style={{ marginLeft: isMobile ? 0 : 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, background: '#f0f9ff', padding: '8px 16px', borderRadius: 8, border: '1px solid #bae6fd', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-start', boxSizing: 'border-box' }}>
          <span style={{ fontSize: 13, color: '#0369a1', fontWeight: 600 }}>합계</span>
          <span style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: '#0c4a6e' }}>{fmt(totalAmount)}원</span>
          <span style={{ fontSize: 12, color: '#64748b', marginLeft: 'auto' }}>({allDisplayItems.length}건)</span>
        </div>
      </div>

      {/* ── 카테고리별 칩 ── */}
      {Object.keys(categoryTotals).length > 0 && (
        <div style={{ display: 'flex', gap: isMobile ? 6 : 8, flexWrap: 'wrap', marginBottom: 16, width: '100%', boxSizing: 'border-box' }}>
          {Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
            <div key={cat} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: isMobile ? '4px 8px' : '5px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: isMobile ? 11 : 12, color: '#475569', fontWeight: 600 }}>{cat}</span>
              <span style={{ fontSize: isMobile ? 11 : 13, fontWeight: 700, color: '#1e293b' }}>{fmt(total)}원</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 플로팅 하단 액션바 (단일 플로우) ── */}
      {selectedIds.size > 0 && (() => {
        const selItems = allDisplayItems.filter(i => i.id && selectedIds.has(i.id))
        const total = selItems.reduce((s, i) => s + (i.amount || 0), 0)
        return (
          <div style={{
            position: 'fixed', bottom: isMobile ? 0 : 24, left: isMobile ? 0 : '50%', right: isMobile ? 0 : 'auto', transform: isMobile ? 'none' : 'translateX(-50%)',
            background: '#0f172a', color: '#fff', borderRadius: isMobile ? '16px 16px 0 0' : 16,
            padding: isMobile ? '12px 16px' : '12px 20px', display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 50, flexWrap: isMobile ? 'wrap' : 'nowrap',
            width: isMobile ? '100%' : 'auto', boxSizing: 'border-box',
          }}>
            {/* 선택 카운트 + 합계 (첫 줄) */}
            <div style={{ display: 'flex', gap: 12, width: isMobile ? '100%' : 'auto', minWidth: 0 }}>
              <span style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>
                {selectedIds.size}건
              </span>
              <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {fmt(total)}원
              </span>
            </div>

            {isMobile && <div style={{ width: '100%', height: 1, background: '#334155' }} />}
            {!isMobile && <div style={{ width: 1, height: 24, background: '#334155' }} />}

            {/* 구분 선택 (항상 표시) */}
            <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}
              style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid #475569', background: '#1e293b', color: '#fff', fontSize: 12, fontWeight: 600, flex: isMobile ? 1 : 'none', minWidth: isMobile ? 0 : 'auto' }}>
              <option value="">구분</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* 품명 + 고객명은 데스크톱에서만 표시 */}
            {!isMobile && (
              <>
                <input
                  value={bulkItemName}
                  onChange={e => setBulkItemName(e.target.value)}
                  placeholder="품명"
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #475569', background: '#1e293b', color: '#fff', fontSize: 12, width: 80, outline: 'none' }}
                />
                <input
                  value={bulkCustomerTeam}
                  onChange={e => setBulkCustomerTeam(e.target.value)}
                  placeholder="고객명/팀원"
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #475569', background: '#1e293b', color: '#fff', fontSize: 12, width: 100, outline: 'none' }}
                />
              </>
            )}
            {/* 적용 + 삭제 + 닫기 */}
            <div style={{ display: 'flex', gap: 6, width: isMobile ? '100%' : 'auto' }}>
              <button onClick={async () => {
                const updates: { category?: string; item_name?: string; customer_team?: string } = {}
                if (bulkCategory) updates.category = bulkCategory
                if (bulkItemName) updates.item_name = bulkItemName
                if (bulkCustomerTeam) updates.customer_team = bulkCustomerTeam
                if (Object.keys(updates).length === 0) { alert('변경할 항목을 입력해주세요'); return }
                const msg = [
                  `${selectedIds.size}건`,
                  bulkCategory ? `구분→${bulkCategory}` : '',
                  bulkItemName ? `품명→${bulkItemName}` : '',
                  bulkCustomerTeam ? `고객명→${bulkCustomerTeam}` : '',
                ].filter(Boolean).join(', ')
                if (confirm(`${msg}\n\n일괄 변경하시겠습니까?`)) {
                  await handleBulkUpdate(updates)
                  setSelectedIds(new Set())
                  setBulkCategory(''); setBulkItemName(''); setBulkCustomerTeam('')
                } else {
                  setSelectedIds(new Set())
                  setBulkCategory(''); setBulkItemName(''); setBulkCustomerTeam('')
                }
              }}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flex: isMobile ? 1 : 'none' }}>
                적용
              </button>

              <button onClick={handleBulkDelete}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flex: isMobile ? 1 : 'none' }}>
                삭제
              </button>
              <button onClick={() => { setSelectedIds(new Set()); setBulkCategory(''); setBulkItemName(''); setBulkCustomerTeam('') }}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, padding: '2px 6px' }}>
                ✕
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── 테이블 (데스크톱) vs 카드 (모바일) ── */}
      {isMobile ? (
        <div style={{ paddingBottom: selectedIds.size > 0 ? 100 : 0 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>
          ) : allDisplayItems.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>등록된 지출내역이 없습니다</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>위 영역에 영수증 이미지를 올려보세요</div>
            </div>
          ) : (
            <>
              {/* 검색 필터 적용된 항목 - 카드 레이아웃 */}
              {allDisplayItems.map((item, idx) => renderCard(item, idx))}

              {/* 방금 업로드된 다른 월 항목 (검색 중이 아닐 때만) */}
              {!searchQuery && otherMonthUploads.length > 0 && (
                <>
                  <div style={{ padding: '8px 12px', background: '#ecfdf5', borderRadius: 8, marginBottom: 12, fontSize: 12, fontWeight: 700, color: '#059669' }}>
                    <div>방금 업로드 (다른 월) — {otherMonthUploads.length}건</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>해당 월로 이동하면 정상 표시됩니다</div>
                  </div>
                  {otherMonthUploads.map((item, idx) => renderCard(item, idx + 1000, '#ecfdf5'))}
                </>
              )}

              {/* 합계 */}
              {allDisplayItems.length > 0 && (
                <div style={{ padding: '12px', background: '#f8fafc', borderRadius: 8, marginTop: 12, borderTop: '2px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>합계</span>
                    <span style={{ fontWeight: 800, color: '#0c4a6e', fontSize: 15 }}>{fmt(totalAmount)}원</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 6px', textAlign: 'center', width: 36 }}>
                    <input
                      type="checkbox"
                      checked={allDisplayItems.filter(i => i.id).length > 0 && allDisplayItems.filter(i => i.id).every(i => selectedIds.has(i.id!))}
                      onChange={toggleSelectAll}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2563eb' }}
                    />
                  </th>
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
                  <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</td></tr>
                ) : allDisplayItems.length === 0 ? (
                  <tr><td colSpan={10} style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>등록된 지출내역이 없습니다</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>위 영역에 영수증 이미지를 올려보세요</div>
                  </td></tr>
                ) : (
                  <>
                    {/* 검색 필터 적용된 항목 */}
                    {allDisplayItems.map((item, idx) => renderRow(item, idx))}

                    {/* 방금 업로드된 다른 월 항목 (검색 중이 아닐 때만) */}
                    {!searchQuery && otherMonthUploads.length > 0 && (
                      <>
                        <tr>
                          <td colSpan={10} style={{ padding: '8px 10px', background: '#ecfdf5', borderTop: '2px solid #a7f3d0', borderBottom: '1px solid #a7f3d0' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>
                              방금 업로드 (다른 월) — {otherMonthUploads.length}건
                            </span>
                            <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
                              해당 월로 이동하면 정상 표시됩니다
                            </span>
                          </td>
                        </tr>
                        {otherMonthUploads.map((item, idx) => renderRow(item, idx + 1000, '#ecfdf5'))}
                      </>
                    )}
                  </>
                )}
              </tbody>
              {allDisplayItems.length > 0 && (
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
      )}
    </div>
  )
}
