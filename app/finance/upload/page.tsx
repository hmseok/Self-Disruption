'use client'

import { supabase } from '../../utils/supabase'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../../context/AppContext'
import { useUpload } from '@/app/context/UploadContext'

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 분류 카테고리 & 상수 (Both files)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const CATEGORIES = [
  { group: '매출', items: ['렌트/운송수입', '지입 관리비/수수료', '투자원금 입금', '지입 초기비용/보증금', '대출 실행(입금)', '이자/잡이익', '보험금 수령'] },
  { group: '차량', items: ['유류비', '정비/수리비', '차량보험료', '자동차세/공과금', '차량할부/리스료'] },
  { group: '금융', items: ['이자비용(대출/투자)', '원금상환', '지입 수익배분금(출금)'] },
  { group: '인건비', items: ['급여(정규직)', '용역비(3.3%)', '4대보험(회사부담)'] },
  { group: '관리비', items: ['복리후생(식대)', '접대비', '임차료/사무실', '통신/소모품'] },
  { group: '세금', items: ['세금/공과금'] },
]

const ALL_CATEGORIES = CATEGORIES.flatMap(g => g.items)

const CATEGORY_ICONS: Record<string, string> = {
  '렌트/운송수입': '🚛', '지입 관리비/수수료': '📋', '투자원금 입금': '💰', '지입 초기비용/보증금': '🔑',
  '대출 실행(입금)': '🏦', '이자/잡이익': '📈', '보험금 수령': '🛡️',
  '유류비': '⛽', '정비/수리비': '🔧', '차량보험료': '🚗', '자동차세/공과금': '📄', '차량할부/리스료': '💳',
  '이자비용(대출/투자)': '📊', '원금상환': '💸', '지입 수익배분금(출금)': '🤝',
  '급여(정규직)': '👨‍💼', '용역비(3.3%)': '👷', '4대보험(회사부담)': '🏥',
  '복리후생(식대)': '🍽️', '접대비': '🥂', '임차료/사무실': '🏢', '통신/소모품': '📱',
  '세금/공과금': '🏛️', '미분류': '❓', '기타': '📦',
}

const CATEGORY_COLORS: Record<string, string> = {
  '매출': '#3b82f6', '차량': '#f59e0b', '금융': '#8b5cf6', '인건비': '#10b981', '관리비': '#ec4899', '세금': '#ef4444',
}

const TYPE_LABELS: Record<string, string> = { jiip: '지입', invest: '투자', loan: '대출', salary: '급여', freelancer: '프리랜서', insurance: '보험', car: '차량' }

const nf = (n: number) => n ? Math.abs(n).toLocaleString() : '0'

function getCategoryGroup(cat: string): string {
  for (const g of CATEGORIES) {
    if (g.items.includes(cat)) return g.group
  }
  return '기타'
}

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

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// UploadContent Component (Merged logic)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

function UploadContent() {
  const router = useRouter()
  const { company, role, adminSelectedCompanyId } = useApp()

  // ── Upload Context ──
  const {
    results,
    status,
    progress,
    currentFileIndex,
    totalFiles,
    currentFileName,
    logs,
    addFiles,
    startProcessing,
    updateTransaction,
    deleteTransaction,
    clearResults,
    setCompanyId,
    cardRegistrationResults,
  } = useUpload()

  // ── Upload UI State ──
  const [isDragging, setIsDragging] = useState(false)
  const [cars, setCars] = useState<any[]>([])
  const [investors, setInvestors] = useState<any[]>([])
  const [jiips, setJiips] = useState<any[]>([])
  const [corpCards, setCorpCards] = useState<any[]>([])
  const [loans, setLoans] = useState<any[]>([])
  const [insurances, setInsurances] = useState<any[]>([])
  const [bulkMode, setBulkMode] = useState(true)

  // ── Review Data State ──
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'confirmed' | 'all'>('pending')
  const [stats, setStats] = useState({ pending: 0, confirmed: 0 })
  const [aiClassifying, setAiClassifying] = useState(false)
  const [aiResult, setAiResult] = useState<{ updated: number; total: number } | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [duplicateInfo, setDuplicateInfo] = useState<{ count: number; checking: boolean }>({ count: 0, checking: false })

  // ── Related Data (Review) ──
  const [reviewJiips, setReviewJiips] = useState<any[]>([])
  const [reviewInvestors, setReviewInvestors] = useState<any[]>([])
  const [freelancers, setFreelancers] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])

  // ── Tab State ──
  const [activeTab, setActiveTab] = useState<'upload' | 'pending' | 'confirmed'>('upload')

  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  // ── Initialize ──
  useEffect(() => {
    fetchBasicData()
    if (effectiveCompanyId) setCompanyId(effectiveCompanyId)
  }, [company, effectiveCompanyId])

  useEffect(() => {
    if (activeTab === 'pending' || activeTab === 'confirmed') {
      fetchReviewItems()
      fetchReviewRelated()
    }
  }, [activeTab, filter])

  const fetchBasicData = async () => {
    if (!effectiveCompanyId) return
    try {
      const [c, i, j, cc, lo, ins] = await Promise.all([
        supabase.from('cars').select('id, number, model').eq('company_id', effectiveCompanyId),
        supabase.from('general_investments').select('id, investor_name').eq('company_id', effectiveCompanyId),
        supabase.from('jiip_contracts').select('id, investor_name').eq('company_id', effectiveCompanyId),
        supabase.from('corporate_cards').select('*').eq('company_id', effectiveCompanyId).eq('status', 'active'),
        supabase.from('loans').select('id, finance_name, monthly_payment').eq('company_id', effectiveCompanyId).eq('status', 'active'),
        supabase.from('insurance_contracts').select('id, company, product_name').eq('company_id', effectiveCompanyId),
      ])
      setCars(c.data || [])
      setInvestors(i.data || [])
      setJiips(j.data || [])
      setCorpCards(cc.data || [])
      setLoans(lo.data || [])
      setInsurances(ins.data || [])
    } catch (err) {
      console.error('[fetchBasicData] error:', err)
    }
  }

  const fetchReviewItems = useCallback(async () => {
    if (!effectiveCompanyId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/finance/classify?company_id=${effectiveCompanyId}&status=${filter}&limit=500`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
        setTotal(data.total || 0)
      }

      const [pRes, cRes] = await Promise.all([
        fetch(`/api/finance/classify?company_id=${effectiveCompanyId}&status=pending&limit=1`),
        fetch(`/api/finance/classify?company_id=${effectiveCompanyId}&status=confirmed&limit=1`),
      ])
      const pData = await pRes.json()
      const cData = await cRes.json()
      setStats({ pending: pData.total || 0, confirmed: cData.total || 0 })
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [effectiveCompanyId, filter])

  const fetchReviewRelated = useCallback(async () => {
    if (!effectiveCompanyId) return
    const [j, i, f, e] = await Promise.all([
      supabase.from('jiip_contracts').select('id, investor_name').eq('company_id', effectiveCompanyId),
      supabase.from('general_investments').select('id, investor_name').eq('company_id', effectiveCompanyId),
      supabase.from('freelancers').select('id, name').eq('company_id', effectiveCompanyId),
      supabase.from('profiles').select('id, name').eq('company_id', effectiveCompanyId),
    ])
    setReviewJiips(j.data || [])
    setReviewInvestors(i.data || [])
    setFreelancers(f.data || [])
    setEmployees(e.data || [])
  }, [effectiveCompanyId])

  const groupedItems = useMemo(() => {
    const groups: Record<string, { items: any[]; totalAmount: number; type: string }> = {}
    for (const item of items) {
      const cat = item.ai_category || '미분류'
      if (!groups[cat]) groups[cat] = { items: [], totalAmount: 0, type: 'expense' }
      groups[cat].items.push(item)
      groups[cat].totalAmount += Math.abs(item.source_data?.amount || 0)
      if (item.source_data?.type === 'income') groups[cat].type = 'income'
    }
    return Object.entries(groups).sort((a, b) => b[1].items.length - a[1].items.length)
  }, [items])

  // ── Drag & Drop ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files))
      startProcessing()
    }
    e.target.value = ''
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files))
      startProcessing()
    }
  }

  // ── Upload Handlers ──
  const handleUpdateItem = (id: number, field: string, val: any, item: any) => {
    updateTransaction(id, field, val)
    if (bulkMode && field !== 'amount' && field !== 'transaction_date' && field !== 'description') {
      const sameClientItems = results.filter(r => r.client_name === item.client_name && r.id !== id)
      sameClientItems.forEach(r => updateTransaction(r.id, field, val))
    }
  }

  const handleBulkSave = async () => {
    if (results.length === 0) return alert('저장할 내역이 없습니다.')
    if (!effectiveCompanyId) return alert('회사를 먼저 선택해주세요. 상단 메뉴에서 회사를 선택 후 저장하세요.')

    const dates = results.map(r => r.transaction_date).filter(Boolean)
    const minDate = dates.length > 0 ? dates.sort()[0] : null
    const maxDate = dates.length > 0 ? dates.sort().reverse()[0] : null

    let duplicateCount = 0
    let uniqueResults = [...results]

    if (minDate && maxDate) {
      const { data: existing } = await supabase
        .from('transactions')
        .select('transaction_date, client_name, amount, payment_method')
        .eq('company_id', effectiveCompanyId)
        .gte('transaction_date', minDate)
        .lte('transaction_date', maxDate)

      if (existing && existing.length > 0) {
        const existingSet = new Set(
          existing.map(e => `${e.transaction_date}|${e.client_name}|${e.amount}|${e.payment_method}`)
        )

        const filtered = results.filter(r => {
          const key = `${r.transaction_date}|${r.client_name}|${r.amount}|${r.payment_method}`
          return !existingSet.has(key)
        })

        duplicateCount = results.length - filtered.length
        uniqueResults = filtered
      }
    }

    if (duplicateCount > 0 && uniqueResults.length === 0) {
      return alert(`⚠️ 전체 ${results.length}건이 이미 저장된 중복 거래입니다.\n저장할 새로운 내역이 없습니다.`)
    }

    const confirmMsg = duplicateCount > 0
      ? `전체 ${results.length}건 중 ${duplicateCount}건 중복 감지!\n중복 제외 ${uniqueResults.length}건만 저장하시겠습니까?`
      : `총 ${uniqueResults.length}건을 저장하시겠습니까?`

    if (!confirm(confirmMsg)) return

    const scheduleLinks: { schedule_id: string; tx_index: number; amount: number }[] = []
    const payload = uniqueResults.map((item, idx) => {
      if (item.matched_schedule_id) {
        scheduleLinks.push({ schedule_id: item.matched_schedule_id, tx_index: idx, amount: item.amount })
      }
      const { id, matched_schedule_id, match_score, matched_contract_name, confidence, alternatives, classification_tier, card_number, approval_number, is_cancelled, cancel_pair_id, ...rest } = item
      return { ...rest, company_id: effectiveCompanyId }
    })

    if (payload.length === 0) {
      return alert('저장할 내역이 없습니다.')
    }

    const { data: inserted, error } = await supabase.from('transactions').insert(payload).select('id')

    if (error) {
      alert('저장 실패: ' + error.message)
    } else {
      let linkedCount = 0
      if (inserted && scheduleLinks.length > 0) {
        for (const link of scheduleLinks) {
          const txId = inserted[link.tx_index]?.id
          if (txId) {
            const { error: schedErr } = await supabase.from('expected_payment_schedules')
              .update({ matched_transaction_id: txId, status: 'completed', actual_amount: link.amount })
              .eq('id', link.schedule_id)
            if (!schedErr) linkedCount++
          }
        }
      }
      let msg = `✅ ${uniqueResults.length}건 저장 완료!`
      if (duplicateCount > 0) msg += ` (${duplicateCount}건 중복 제외)`
      if (linkedCount > 0) msg += ` (${linkedCount}건 스케줄 자동 연결)`
      alert(msg)
      clearResults()
      router.push('/finance')
    }
  }

  const saveRuleToDb = async (item: any) => {
    if (!item.client_name) return alert('키워드 없음')
    const keyword = prompt(`'${item.client_name}' 규칙 저장`, item.client_name)
    if (!keyword) return

    const { error } = await supabase.from('finance_rules').insert({
      keyword,
      category: item.category,
      related_id: item.related_id,
      related_type: item.related_type
    })

    if (error) {
      if (error.code === '23505') alert('이미 등록된 키워드입니다.')
      else alert(error.message)
    } else {
      alert('✅ 규칙 저장 완료!')
    }
  }

  // ── Review Handlers ──
  const handleConfirm = async (item: any, overrides?: { category?: string; related_type?: string; related_id?: string }) => {
    const category = overrides?.category || item.ai_category || item.final_category
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          final_category: category,
          final_related_type: overrides?.related_type || item.ai_related_type,
          final_related_id: overrides?.related_id || item.ai_related_id,
          save_as_rule: false,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id))
        setStats(prev => ({ pending: prev.pending - 1, confirmed: prev.confirmed + 1 }))
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleConfirmWithRule = async (item: any, category: string) => {
    const keyword = item.source_data?.client_name || ''
    if (!keyword) return handleConfirm(item, { category })
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          final_category: category,
          final_related_type: item.ai_related_type,
          final_related_id: item.ai_related_id,
          save_as_rule: true,
          rule_keyword: keyword,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id))
        setStats(prev => ({ pending: prev.pending - 1, confirmed: prev.confirmed + 1 }))
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleRevert = async (item: any) => {
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          final_category: '기타',
          final_related_type: null,
          final_related_id: null,
          save_as_rule: false,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id))
        setStats(prev => ({ pending: prev.pending + 1, confirmed: prev.confirmed - 1 }))
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleChangeCategory = async (item: any, newCategory: string) => {
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          final_category: newCategory,
          final_related_type: item.ai_related_type,
          final_related_id: item.ai_related_id,
          save_as_rule: false,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, ai_category: newCategory, final_category: newCategory } : i))
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleConfirmGroup = async (category: string) => {
    const groupItems = items.filter(i => (i.ai_category || '미분류') === category)
    if (!confirm(`"${category}" ${groupItems.length}건을 일괄 확정하시겠습니까?`)) return
    for (const item of groupItems) {
      await handleConfirm(item, { category })
    }
    fetchReviewItems()
  }

  const handleRevertGroup = async (category: string) => {
    const groupItems = items.filter(i => (i.ai_category || '미분류') === category)
    if (!confirm(`"${category}" ${groupItems.length}건을 대기중으로 되돌리시겠습니까?`)) return
    for (const item of groupItems) {
      await handleRevert(item)
    }
    fetchReviewItems()
  }

  const handleRevertAll = async () => {
    if (!confirm(`현재 조회된 ${items.length}건 전체를 대기중으로 되돌리시겠습니까?`)) return
    for (const item of items) {
      await handleRevert(item)
    }
    fetchReviewItems()
  }

  const handleAutoConfirmAll = async () => {
    const pendingItems = items.filter(i => i.status === 'pending')
    if (!confirm(`AI 추천 기준으로 ${pendingItems.length}건을 일괄 확정하시겠습니까?`)) return
    for (const item of pendingItems) {
      await handleConfirm(item)
    }
    fetchReviewItems()
  }

  const handleAiReclassify = async () => {
    if (!effectiveCompanyId) return
    if (!confirm('미분류/기타 거래를 AI로 자동 분류하시겠습니까?\nGPT가 거래 내용을 분석하여 계정과목을 추천합니다.')) return
    setAiClassifying(true)
    setAiResult(null)
    try {
      const res = await fetch('/api/finance/reclassify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: effectiveCompanyId }),
      })
      if (res.ok) {
        const data = await res.json()
        setAiResult({ updated: data.updated, total: data.total })
        fetchReviewItems()
      } else {
        const err = await res.json()
        alert('AI 분류 실패: ' + (err.error || '알 수 없는 오류'))
      }
    } catch (e) {
      console.error(e)
      alert('AI 분류 요청 중 오류가 발생했습니다.')
    }
    setAiClassifying(false)
  }

  const handleCheckDuplicates = async () => {
    if (!effectiveCompanyId) return
    setDuplicateInfo({ count: 0, checking: true })
    try {
      const res = await fetch(`/api/finance/dedup?company_id=${effectiveCompanyId}`)
      if (res.ok) {
        const data = await res.json()
        setDuplicateInfo({ count: data.duplicateCount, checking: false })
        if (data.duplicateCount === 0) {
          alert('✅ 중복 거래가 없습니다!')
        } else if (confirm(`⚠️ ${data.duplicateCount}건의 중복 거래가 발견되었습니다.\n(${data.groupCount}개 그룹)\n\n중복 건을 삭제하시겠습니까? (먼저 저장된 1건만 유지)`)) {
          const delRes = await fetch('/api/finance/dedup', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company_id: effectiveCompanyId }),
          })
          if (delRes.ok) {
            const delData = await delRes.json()
            alert(`✅ ${delData.deleted}건 중복 삭제 완료! (${delData.remaining}건 남음)`)
            fetchReviewItems()
          }
        }
      }
    } catch (e) {
      console.error(e)
    }
    setDuplicateInfo(prev => ({ ...prev, checking: false }))
  }

  const toggleGroup = (cat: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  // ── Upload Results Sub-filter & Grouping ──
  const [uploadSubFilter, setUploadSubFilter] = useState<'all' | 'card' | 'bank'>('all')
  const [uploadGroupBy, setUploadGroupBy] = useState<'none' | 'card_number' | 'category' | 'vehicle'>('none')

  // 업로드 결과 필터링
  const filteredResults = useMemo(() => {
    if (uploadSubFilter === 'all') return results
    if (uploadSubFilter === 'card') return results.filter(r => r.payment_method === '카드' || r.payment_method === 'Card')
    if (uploadSubFilter === 'bank') return results.filter(r => r.payment_method === '통장' || r.payment_method === 'Bank' || (r.payment_method !== '카드' && r.payment_method !== 'Card'))
    return results
  }, [results, uploadSubFilter])

  // 카드번호별 그룹핑 (법인카드 사용자 매칭 포함)
  const groupedByCard = useMemo(() => {
    if (uploadGroupBy !== 'card_number') return null
    const groups: Record<string, { items: typeof filteredResults; cardInfo: any; totalAmount: number }> = {}
    for (const item of filteredResults) {
      const cardNum = item.card_number || '(카드번호 없음)'
      const key = cardNum.length >= 3 ? cardNum : '(카드번호 없음)'
      if (!groups[key]) {
        // 법인카드 정보 매칭
        const matchedCard = corpCards.find(cc => {
          if (!item.card_number) return false
          const ccDigits = (cc.card_number || '').replace(/\D/g, '')
          const itemDigits = item.card_number.replace(/\D/g, '')
          if (itemDigits.length >= 4 && ccDigits.endsWith(itemDigits.slice(-4))) return true
          if (itemDigits.length >= 3 && ccDigits.includes(itemDigits)) return true
          return false
        })
        groups[key] = { items: [], cardInfo: matchedCard || null, totalAmount: 0 }
      }
      groups[key].items.push(item)
      groups[key].totalAmount += item.amount || 0
    }
    return Object.entries(groups).sort((a, b) => b[1].items.length - a[1].items.length)
  }, [filteredResults, uploadGroupBy, corpCards])

  // 차량별 그룹핑 (유류비, 정비비 등 차량 관련 거래)
  const groupedByVehicle = useMemo(() => {
    if (uploadGroupBy !== 'vehicle') return null
    const vehicleCategories = ['유류비', '정비/수리비', '차량보험료', '자동차세/공과금', '차량할부/리스료']
    const groups: Record<string, { items: typeof filteredResults; carInfo: any; totalAmount: number }> = {}
    for (const item of filteredResults) {
      if (!vehicleCategories.includes(item.category || '') && !item.related_type?.includes('car')) {
        // 차량 관련이 아닌 거래는 '기타' 그룹
        const key = '🏢 차량 외 거래'
        if (!groups[key]) groups[key] = { items: [], carInfo: null, totalAmount: 0 }
        groups[key].items.push(item)
        groups[key].totalAmount += item.amount || 0
        continue
      }
      // 연결된 차량 정보로 그룹핑
      const carId = item.related_type === 'car' ? item.related_id : null
      const car = carId ? cars.find(c => c.id === carId) : null
      const key = car ? `🚛 ${car.number} (${car.model || ''})` : '🚛 미배정 차량'
      if (!groups[key]) groups[key] = { items: [], carInfo: car, totalAmount: 0 }
      groups[key].items.push(item)
      groups[key].totalAmount += item.amount || 0
    }
    return Object.entries(groups).sort((a, b) => {
      // 차량 외 거래는 맨 뒤로
      if (a[0].includes('차량 외')) return 1
      if (b[0].includes('차량 외')) return -1
      return b[1].items.length - a[1].items.length
    })
  }, [filteredResults, uploadGroupBy, cars])

  // 카테고리별 그룹핑
  const groupedByCategory = useMemo(() => {
    if (uploadGroupBy !== 'category') return null
    const groups: Record<string, { items: typeof filteredResults; totalAmount: number }> = {}
    for (const item of filteredResults) {
      const cat = item.category || '미분류'
      if (!groups[cat]) groups[cat] = { items: [], totalAmount: 0 }
      groups[cat].items.push(item)
      groups[cat].totalAmount += item.amount || 0
    }
    return Object.entries(groups).sort((a, b) => b[1].items.length - a[1].items.length)
  }, [filteredResults, uploadGroupBy])

  // 업로드 결과 요약 통계
  const uploadStats = useMemo(() => {
    const cardItems = results.filter(r => r.payment_method === '카드' || r.payment_method === 'Card')
    const bankItems = results.filter(r => r.payment_method !== '카드' && r.payment_method !== 'Card')
    const classifiedCount = results.filter(r => r.category && r.category !== '미분류' && r.category !== '기타').length
    const cardMatchedCount = results.filter(r => r.card_id).length
    return { cardCount: cardItems.length, bankCount: bankItems.length, classifiedCount, cardMatchedCount }
  }, [results])

  // 법인카드→사용자 이름 매핑 헬퍼
  const getCardUserName = useCallback((cardId: string | null | undefined) => {
    if (!cardId) return null
    const card = corpCards.find(c => c.id === cardId)
    if (!card) return null
    return card.holder_name || card.card_alias || null
  }, [corpCards])

  const getCardDisplayInfo = useCallback((cardId: string | null | undefined) => {
    if (!cardId) return null
    const card = corpCards.find(c => c.id === cardId)
    if (!card) return null
    return { company: card.card_company, last4: (card.card_number || '').slice(-4), holder: card.holder_name || card.card_alias || '공용' }
  }, [corpCards])

  // ── Guard: Company Selection ──
  if (role === 'god_admin' && !adminSelectedCompanyId) {
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px', minHeight: '100vh', background: '#f9fafb' }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: 80, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>🏢</span>
          <p style={{ fontWeight: 700, color: '#475569', fontSize: 14 }}>좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  if (!effectiveCompanyId) {
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px', minHeight: '100vh', background: '#f9fafb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: 0 }}>카드/통장 관리</h1>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>엑셀·영수증·PDF를 AI로 자동 분류하여 장부에 반영합니다</p>
          </div>
          <button onClick={() => router.back()} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontWeight: 700, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
            ← 돌아가기
          </button>
        </div>
        <div style={{ background: '#fff', borderRadius: 20, padding: 80, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>🏢</p>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#475569' }}>좌측 상단에서 회사를 먼저 선택해주세요</p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>회사 선택 후 AI 분석기를 이용할 수 있습니다</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px', minHeight: '100vh', background: '#f9fafb' }}>

      {/* Header — 보험 페이지 스타일 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' as const, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.025em', margin: 0 }}>카드/통장 관리</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4, margin: '4px 0 0' }}>엑셀·영수증·PDF를 AI로 자동 분류하여 장부에 반영합니다</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          <button onClick={handleCheckDuplicates} disabled={duplicateInfo.checking}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', color: '#374151', border: '1px solid #e5e7eb', padding: '10px 20px', fontSize: 14, borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>
            {duplicateInfo.checking ? '🔍 확인 중...' : '🔄중복체크'}
          </button>
          <button onClick={handleAiReclassify} disabled={aiClassifying}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: aiClassifying ? '#94a3b8' : '#2d5fa8', color: '#fff', padding: '10px 20px', fontSize: 14, borderRadius: 12, fontWeight: 700, border: 'none', cursor: aiClassifying ? 'not-allowed' : 'pointer' }}>
            {aiClassifying ? '🔄 AI 분류 중...' : '🤖 AI 자동분류'}
          </button>
        </div>
      </div>

      {/* 드래그앤드롭 업로드 영역 — 보험 페이지 스타일 */}
      <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        style={{
          border: isDragging ? '2px dashed #2d5fa8' : '2px dashed #d1d5db',
          borderRadius: 16, padding: '32px 20px', marginBottom: 24, textAlign: 'center' as const,
          background: isDragging ? '#f8fafc' : '#fff',
          transition: 'all 0.3s', cursor: 'pointer', position: 'relative' as const,
        }}
        onClick={() => {
          const inp = document.getElementById('upload-file-input')
          if (inp) inp.click()
        }}>
        <input id="upload-file-input" type="file" multiple accept=".xlsx,.xls,.csv,image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf,.pdf" onChange={handleFileChange} style={{ display: 'none' }} />
        <span style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>{isDragging ? '📥' : '📂'}</span>
        <p style={{ fontWeight: 800, fontSize: 14, color: isDragging ? '#1e293b' : '#374151', margin: 0 }}>
          {isDragging ? '여기에 파일을 놓으세요' : '여기에 파일을 놓아주세요 (다중 선택 가능)'}
        </p>
        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>엑셀(통장/카드), 영수증 사진, PDF 문서 지원</p>
      </div>

      {/* 📊 통계 카드 — 보험 페이지 스타일 (컬러 배경) */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <div style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e5e7eb', minWidth: 0, cursor: 'pointer' }} onClick={() => { setActiveTab('upload'); setExpandedGroups(new Set()) }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', margin: 0, whiteSpace: 'nowrap' as const }}>업로드 결과</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#111827', margin: '4px 0 0', whiteSpace: 'nowrap' as const }}>{results.length}<span style={{ fontSize: 14, fontWeight: 500, color: '#9ca3af', marginLeft: 2 }}>건</span></p>
        </div>
        <div style={{ flex: 1, background: '#fffbeb', borderRadius: 12, padding: '16px 20px', border: '1px solid #fde68a', minWidth: 0, cursor: 'pointer' }} onClick={() => { setActiveTab('pending'); setFilter('pending'); setExpandedGroups(new Set()) }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#d97706', margin: 0, whiteSpace: 'nowrap' as const }}>검토 대기</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#b45309', margin: '4px 0 0', whiteSpace: 'nowrap' as const }}>{stats.pending}<span style={{ fontSize: 14, fontWeight: 500, color: '#d97706', marginLeft: 2 }}>건</span></p>
        </div>
        <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 12, padding: '16px 20px', border: '1px solid #bbf7d0', minWidth: 0, cursor: 'pointer' }} onClick={() => { setActiveTab('confirmed'); setFilter('confirmed'); setExpandedGroups(new Set()) }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', margin: 0, whiteSpace: 'nowrap' as const }}>확정 완료</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#15803d', margin: '4px 0 0', whiteSpace: 'nowrap' as const }}>{stats.confirmed}<span style={{ fontSize: 14, fontWeight: 500, color: '#16a34a', marginLeft: 2 }}>건</span></p>
        </div>
        <div style={{ flex: 1, background: '#eff6ff', borderRadius: 12, padding: '16px 20px', border: '1px solid #bfdbfe', minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', margin: 0, whiteSpace: 'nowrap' as const }}>카테고리</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#1d4ed8', margin: '4px 0 0', whiteSpace: 'nowrap' as const }}>{groupedItems.length}<span style={{ fontSize: 14, fontWeight: 500, color: '#2563eb', marginLeft: 2 }}>건</span></p>
        </div>
      </div>

      {/* 필터 탭 — 보험 페이지 pill 스타일 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' as const }}>
        {[
          { key: 'upload' as const, label: '업로드 결과', count: results.length },
          { key: 'pending' as const, label: '분류 대기', count: stats.pending },
          { key: 'confirmed' as const, label: '확정 완료', count: stats.confirmed },
        ].map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setFilter(tab.key === 'upload' ? 'pending' : (tab.key === 'pending' ? 'pending' : 'confirmed')); setExpandedGroups(new Set()) }}
            style={{
              padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              background: activeTab === tab.key ? '#2d5fa8' : '#fff',
              color: activeTab === tab.key ? '#fff' : '#6b7280',
              border: activeTab === tab.key ? 'none' : '1px solid #e5e7eb',
              boxShadow: activeTab === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* AI Classification Result Banner */}
      {aiResult && (
        <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', border: '1px solid #bbf7d0', borderRadius: 14, padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🎉</span>
          <div>
            <p style={{ fontWeight: 800, fontSize: 13, color: '#166534', margin: 0 }}>AI 자동분류 완료</p>
            <p style={{ fontSize: 11, color: '#15803d', marginTop: 2 }}>총 {aiResult.total}건 중 {aiResult.updated}건이 AI에 의해 분류되었습니다</p>
          </div>
          <button onClick={() => setAiResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* AI Classifying Banner */}
      {aiClassifying && (
        <div style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '1px solid #c7d2fe', borderRadius: 14, padding: 20, marginBottom: 16, textAlign: 'center' }}>
          <div style={{ width: 28, height: 28, border: '3px solid #e0e7ff', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 800, fontSize: 13, color: '#4338ca', margin: 0 }}>🤖 AI가 거래 내역을 분석하고 있습니다...</p>
          <p style={{ fontSize: 11, color: '#6366f1', marginTop: 4 }}>세무 전문가 수준의 AI가 계정과목을 자동 분류합니다</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Upload Processing Banner */}
      {status === 'processing' && (
        <div style={{ marginBottom: 16, background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)', border: '1px solid #7dd3fc', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 24, height: 24, border: '3px solid #bae6fd', borderTopColor: '#0284c7', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontWeight: 800, color: '#0369a1', fontSize: 14 }}>AI 분석 진행 중</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '4px 10px', borderRadius: 8 }}>
              {totalFiles > 0 ? `파일 ${currentFileIndex + 1} / ${totalFiles}` : '처리 중...'}
            </span>
          </div>
          <div style={{ background: '#fff', borderRadius: 8, height: 8, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg, #0284c7, #38bdf8)', borderRadius: 8, transition: 'width 0.5s ease', width: `${progress}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#0369a1', fontWeight: 600 }}>{logs || currentFileName}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0284c7' }}>{progress}%</span>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* 카드 등록 결과 배너 */}
      {(cardRegistrationResults.registered > 0 || cardRegistrationResults.updated > 0) && (
        <div style={{ marginBottom: 16, background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #86efac', borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🏦</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 800, fontSize: 13, color: '#166534', margin: 0 }}>법인카드 자동 등록 완료</p>
            <p style={{ fontSize: 11, color: '#15803d', marginTop: 2 }}>
              신규 {cardRegistrationResults.registered}장 / 업데이트 {cardRegistrationResults.updated}장
              {cardRegistrationResults.skipped > 0 ? ` / 스킵 ${cardRegistrationResults.skipped}장` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Content Area Based on Active Tab */}
      {activeTab === 'upload' && (
        <>
          {/* Upload Results */}
          {results.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              {/* Header with controls */}
              <div style={{ padding: '12px 16px', background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h3 style={{ fontWeight: 700, fontSize: 14, color: '#1f2937', margin: 0 }}>분석 결과 ({filteredResults.length}건{uploadSubFilter !== 'all' ? ` / 전체 ${results.length}건` : ''})</h3>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: '#fff', padding: '4px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                      <input type="checkbox" checked={bulkMode} onChange={e => setBulkMode(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>동일 내역 일괄 변경</span>
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={clearResults} style={{ color: '#ef4444', fontWeight: 700, padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>전체 취소</button>
                    <button onClick={handleBulkSave} style={{ background: '#4f46e5', color: '#fff', padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer' }}>💾 전체 저장</button>
                  </div>
                </div>

                {/* Sub-filter: 전체/카드/통장 + 그룹핑 */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* 결제수단 필터 */}
                  {[
                    { key: 'all' as const, label: '전체', count: results.length, icon: '📋' },
                    { key: 'card' as const, label: '카드', count: uploadStats.cardCount, icon: '💳' },
                    { key: 'bank' as const, label: '통장', count: uploadStats.bankCount, icon: '🏦' },
                  ].map(f => (
                    <button key={f.key} onClick={() => { setUploadSubFilter(f.key); if (f.key === 'bank') setUploadGroupBy('none') }}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: 'pointer',
                        background: uploadSubFilter === f.key ? '#2d5fa8' : '#fff',
                        color: uploadSubFilter === f.key ? '#fff' : '#6b7280',
                        border: uploadSubFilter === f.key ? 'none' : '1px solid #e5e7eb',
                      }}>
                      {f.icon} {f.label} ({f.count})
                    </button>
                  ))}

                  <span style={{ color: '#d1d5db', margin: '0 4px' }}>|</span>

                  {/* 그룹핑 */}
                  {[
                    { key: 'none' as const, label: '목록', icon: '📄' },
                    { key: 'card_number' as const, label: '카드번호별', icon: '💳', onlyCard: true },
                    { key: 'category' as const, label: '계정과목별', icon: '📊' },
                    { key: 'vehicle' as const, label: '차량별', icon: '🚛' },
                  ].filter(g => !g.onlyCard || uploadSubFilter !== 'bank').map(g => (
                    <button key={g.key} onClick={() => setUploadGroupBy(g.key)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontWeight: 700, fontSize: 11, cursor: 'pointer',
                        background: uploadGroupBy === g.key ? '#1e293b' : '#fff',
                        color: uploadGroupBy === g.key ? '#fff' : '#6b7280',
                        border: uploadGroupBy === g.key ? 'none' : '1px solid #e5e7eb',
                      }}>
                      {g.icon} {g.label}
                    </button>
                  ))}

                  {/* 매칭 요약 */}
                  {uploadStats.cardMatchedCount > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                      법인카드 매칭 {uploadStats.cardMatchedCount}건 · 분류 완료 {uploadStats.classifiedCount}건
                    </span>
                  )}
                </div>
              </div>

              {/* ═══ 그룹 뷰: 카드번호별 ═══ */}
              {uploadGroupBy === 'card_number' && groupedByCard && (
                <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                  {groupedByCard.map(([cardNum, group]) => (
                    <div key={cardNum} style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', background: '#f8fafc', gap: 10, cursor: 'pointer' }}
                        onClick={() => setExpandedGroups(prev => { const n = new Set(prev); n.has(cardNum) ? n.delete(cardNum) : n.add(cardNum); return n })}>
                        <div style={{ width: 4, height: 32, borderRadius: 4, background: group.cardInfo ? '#f59e0b' : '#94a3b8', flexShrink: 0 }} />
                        <span style={{ fontSize: 16 }}>💳</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', margin: 0 }}>
                            {group.cardInfo ? `${group.cardInfo.card_company} ****${(group.cardInfo.card_number || '').slice(-4)}` : cardNum}
                          </p>
                          {group.cardInfo && (
                            <p style={{ fontSize: 11, color: '#64748b', margin: 0, marginTop: 1 }}>
                              사용자: <b style={{ color: '#0f172a' }}>{group.cardInfo.holder_name || group.cardInfo.card_alias || '공용'}</b>
                              {group.cardInfo.card_alias && group.cardInfo.card_alias !== group.cardInfo.holder_name ? ` (${group.cardInfo.card_alias})` : ''}
                            </p>
                          )}
                          {!group.cardInfo && <p style={{ fontSize: 11, color: '#ef4444', margin: 0, marginTop: 1 }}>미등록 카드 — 법인카드 등록 후 매칭됩니다</p>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontWeight: 800, fontSize: 14, color: '#ef4444', margin: 0 }}>{group.totalAmount.toLocaleString()}원</p>
                          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{group.items.length}건</p>
                        </div>
                        <span style={{ fontSize: 12, color: '#94a3b8', transition: 'transform 0.2s', transform: expandedGroups.has(cardNum) ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                      </div>
                      {expandedGroups.has(cardNum) && (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', textAlign: 'left', fontSize: 12, borderCollapse: 'collapse' }}>
                            <tbody>
                              {group.items.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,70,229,0.03)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                  <td style={{ padding: '8px 12px', width: 90, color: '#6b7280', fontSize: 12 }}>{item.transaction_date}</td>
                                  <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{item.client_name}</td>
                                  <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: 11 }}>{item.description}</td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <select value={item.category || '기타'} onChange={e => handleUpdateItem(item.id, 'category', e.target.value, item)} style={{ background: '#fff', border: '1px solid #e5e7eb', padding: '3px 6px', borderRadius: 4, color: '#374151', fontWeight: 600, fontSize: 11, outline: 'none', width: 120 }}>
                                      <option value="기타">기타</option>
                                      {DEFAULT_RULES.map((r, i) => <option key={i} value={r.label}>{r.label}</option>)}
                                    </select>
                                  </td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: item.is_cancelled ? '#dc2626' : '#111827' }}>
                                    {item.is_cancelled && <span style={{ fontSize: 10, color: '#dc2626', marginRight: 4 }}>취소</span>}
                                    {item.is_cancelled ? '-' : ''}{(item.amount || 0).toLocaleString()}
                                  </td>
                                  <td style={{ padding: '8px 12px', textAlign: 'center', width: 36 }}>
                                    <button onClick={() => deleteTransaction(item.id)} style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 16 }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = '#d1d5db'}>×</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ═══ 그룹 뷰: 카테고리별 ═══ */}
              {uploadGroupBy === 'category' && groupedByCategory && (
                <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                  {groupedByCategory.map(([cat, group]) => {
                    const icon = CATEGORY_ICONS[cat] || '📋'
                    const groupName = getCategoryGroup(cat)
                    const groupColor = CATEGORY_COLORS[groupName] || '#64748b'
                    return (
                      <div key={cat} style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', background: '#f8fafc', gap: 10, cursor: 'pointer' }}
                          onClick={() => setExpandedGroups(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })}>
                          <div style={{ width: 4, height: 32, borderRadius: 4, background: groupColor, flexShrink: 0 }} />
                          <span style={{ fontSize: 16 }}>{icon}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', margin: 0 }}>{cat}</p>
                            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, marginTop: 1 }}>{groupName}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontWeight: 800, fontSize: 14, color: '#ef4444', margin: 0 }}>{group.totalAmount.toLocaleString()}원</p>
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{group.items.length}건</p>
                          </div>
                          <span style={{ fontSize: 12, color: '#94a3b8', transition: 'transform 0.2s', transform: expandedGroups.has(cat) ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                        </div>
                        {expandedGroups.has(cat) && (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', textAlign: 'left', fontSize: 12, borderCollapse: 'collapse' }}>
                              <tbody>
                                {group.items.map(item => (
                                  <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,70,229,0.03)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: '8px 12px', width: 90, color: '#6b7280' }}>{item.transaction_date}</td>
                                    <td style={{ padding: '8px 12px' }}>
                                      {(item.payment_method === '카드' || item.payment_method === 'Card') ? (
                                        <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#b45309' }}>💳</span>
                                      ) : (
                                        <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: item.type === 'income' ? '#dbeafe' : '#fee2e2', color: item.type === 'income' ? '#1e40af' : '#991b1b' }}>
                                          {item.type === 'income' ? '🔵' : '🔴'}
                                        </span>
                                      )}
                                    </td>
                                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{item.client_name}</td>
                                    <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: 11 }}>{item.description}</td>
                                    {/* 카드 사용자 표시 */}
                                    <td style={{ padding: '8px 12px', fontSize: 11 }}>
                                      {item.card_id && getCardDisplayInfo(item.card_id) ? (
                                        <span style={{ padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 600, fontSize: 10 }}>
                                          {getCardDisplayInfo(item.card_id)!.holder}
                                        </span>
                                      ) : null}
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: item.is_cancelled ? '#dc2626' : '#111827' }}>
                                      {item.is_cancelled && <span style={{ fontSize: 10, color: '#dc2626', marginRight: 4 }}>취소</span>}
                                      {item.is_cancelled ? '-' : ''}{(item.amount || 0).toLocaleString()}
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'center', width: 36 }}>
                                      <button onClick={() => deleteTransaction(item.id)} style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 16 }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = '#d1d5db'}>×</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ═══ 그룹 뷰: 차량별 ═══ */}
              {uploadGroupBy === 'vehicle' && groupedByVehicle && (
                <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                  {groupedByVehicle.map(([label, group]) => (
                    <div key={label} style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', background: '#f8fafc', gap: 10, cursor: 'pointer' }}
                        onClick={() => setExpandedGroups(prev => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n })}>
                        <div style={{ width: 4, height: 32, borderRadius: 4, background: group.carInfo ? '#f59e0b' : '#94a3b8', flexShrink: 0 }} />
                        <span style={{ fontSize: 16 }}>{label.startsWith('🚛') ? '🚛' : '🏢'}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', margin: 0 }}>{label}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontWeight: 800, fontSize: 14, color: '#ef4444', margin: 0 }}>{group.totalAmount.toLocaleString()}원</p>
                          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{group.items.length}건</p>
                        </div>
                        <span style={{ fontSize: 12, color: '#94a3b8', transition: 'transform 0.2s', transform: expandedGroups.has(label) ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                      </div>
                      {expandedGroups.has(label) && (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', textAlign: 'left', fontSize: 12, borderCollapse: 'collapse' }}>
                            <tbody>
                              {group.items.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,70,229,0.03)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                  <td style={{ padding: '8px 12px', width: 90, color: '#6b7280' }}>{item.transaction_date}</td>
                                  <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{item.client_name}</td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#f0fdf4', color: '#16a34a' }}>
                                      {CATEGORY_ICONS[item.category || ''] || '📋'} {item.category || '미분류'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: 11 }}>{item.description}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#111827' }}>{(item.amount || 0).toLocaleString()}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'center', width: 36 }}>
                                    <button onClick={() => deleteTransaction(item.id)} style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 16 }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = '#d1d5db'}>×</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ═══ 기본 목록 뷰 ═══ */}
              {uploadGroupBy === 'none' && (
                <div style={{ overflowX: 'auto', maxHeight: '65vh' }}>
                  <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f9fafb', color: '#6b7280', fontWeight: 700, position: 'sticky', top: 0, zIndex: 10 }}>
                      <tr>
                        <th style={{ padding: '8px 12px', textAlign: 'center', width: 36 }}>규칙</th>
                        <th style={{ padding: '8px 12px' }}>날짜</th>
                        <th style={{ padding: '8px 12px' }}>결제수단</th>
                        <th style={{ padding: '8px 12px' }}>거래처</th>
                        <th style={{ padding: '8px 12px' }}>비고</th>
                        <th style={{ padding: '8px 12px' }}>계정과목</th>
                        <th style={{ padding: '8px 12px' }}>카드사용자</th>
                        <th style={{ padding: '8px 12px', width: 180 }}>연결 대상</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>금액</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', width: 36 }}>삭제</th>
                      </tr>
                    </thead>
                    <tbody style={{ borderTop: '1px solid #f3f4f6' }}>
                      {filteredResults.map((item) => {
                        const cardInfo = getCardDisplayInfo(item.card_id)
                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', background: 'transparent', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(79, 70, 229, 0.03)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}><button onClick={() => saveRuleToDb(item)} style={{ background: 'none', border: 'none', color: '#d1d5db', fontSize: 14, cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.color = '#eab308'} onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}>⭐</button></td>
                            <td style={{ padding: '8px 12px' }}><input value={item.transaction_date || ''} onChange={e => handleUpdateItem(item.id, 'transaction_date', e.target.value, item)} style={{ background: 'transparent', width: 90, outline: 'none', color: '#1f2937', fontSize: 12 }} /></td>
                            <td style={{ padding: '8px 12px' }}>
                              {(item.payment_method === '카드' || item.payment_method === 'Card') ? (
                                <div>
                                  <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#b45309', display: 'inline-block' }}>💳 카드</span>
                                  {item.card_number && <p style={{ fontSize: 10, color: '#9ca3af', margin: '2px 0 0', fontFamily: 'monospace' }}>{item.card_number}</p>}
                                </div>
                              ) : (
                                <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: item.type === 'income' ? '#dbeafe' : '#fee2e2', color: item.type === 'income' ? '#1e40af' : '#991b1b' }}>
                                  {item.type === 'income' ? '🔵 입금' : '🔴 출금'}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px' }}><input value={item.client_name || ''} onChange={e => handleUpdateItem(item.id, 'client_name', e.target.value, item)} style={{ width: '100%', background: 'transparent', outline: 'none', fontWeight: 700, color: '#1f2937', fontSize: 12 }} /></td>
                            <td style={{ padding: '8px 12px' }}><input value={item.description || ''} onChange={e => handleUpdateItem(item.id, 'description', e.target.value, item)} style={{ width: '100%', background: '#fff', border: '1px solid #f3f4f6', borderRadius: 4, padding: '3px 6px', outline: 'none', fontSize: 11, color: '#4b5563' }} /></td>
                            <td style={{ padding: '8px 12px' }}>
                              <select value={item.category || '기타'} onChange={e => handleUpdateItem(item.id, 'category', e.target.value, item)} style={{ background: '#fff', border: '1px solid #e5e7eb', padding: '3px 6px', borderRadius: 4, color: '#374151', fontWeight: 700, width: 120, fontSize: 11, outline: 'none' }}>
                                <option value="기타">기타</option>
                                {DEFAULT_RULES.map((r, i) => <option key={i} value={r.label}>{r.label}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              {cardInfo ? (
                                <span style={{ padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>
                                  {cardInfo.holder} ({cardInfo.last4})
                                </span>
                              ) : (item.payment_method === '카드' || item.payment_method === 'Card') ? (
                                <span style={{ fontSize: 10, color: '#d1d5db' }}>미매칭</span>
                              ) : null}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <select value={item.related_id ? `${item.related_type}_${item.related_id}` : ''} onChange={e => handleUpdateItem(item.id, 'related_composite', e.target.value, item)} style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 4, padding: '3px 6px', fontSize: 10, outline: 'none', background: '#fff', color: '#4b5563' }}>
                                <option value="">- 연결 없음 -</option>
                                {corpCards.length > 0 && <optgroup label="💳 법인카드">{corpCards.map(cc => <option key={cc.id} value={`card_${cc.id}`}>{cc.card_company} {(cc.card_number||'').slice(-4)} ({cc.holder_name || cc.card_alias})</option>)}</optgroup>}
                                <optgroup label="🚛 지입 차주">{jiips.map(j => <option key={j.id} value={`jiip_${j.id}`}>{j.investor_name}</option>)}</optgroup>
                                <optgroup label="💰 투자자">{investors.map(i => <option key={i.id} value={`invest_${i.id}`}>{i.investor_name}</option>)}</optgroup>
                                <optgroup label="🚗 차량">{cars.map(c => <option key={c.id} value={`car_${c.id}`}>{c.number}</option>)}</optgroup>
                                {loans.length > 0 && <optgroup label="🏦 대출">{loans.map(l => <option key={l.id} value={`loan_${l.id}`}>{l.finance_name} ({(l.monthly_payment||0).toLocaleString()}원/월)</option>)}</optgroup>}
                                {insurances.length > 0 && <optgroup label="🛡️ 보험">{insurances.map(ins => <option key={ins.id} value={`insurance_${ins.id}`}>{ins.company} {ins.product_name}</option>)}</optgroup>}
                              </select>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 900, fontSize: 13, color: item.is_cancelled ? '#dc2626' : '#111827' }}>
                              {item.is_cancelled && <span style={{ fontSize: 10, color: '#dc2626', marginRight: 4 }}>취소</span>}
                              {item.is_cancelled ? '-' : ''}{(item.amount || 0).toLocaleString()}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}><button onClick={() => deleteTransaction(item.id)} style={{ background: 'none', border: 'none', color: '#d1d5db', fontWeight: 700, padding: 4, cursor: 'pointer', fontSize: 16 }} onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'} onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}>×</button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Pending & Confirmed Tabs */}
      {(activeTab === 'pending' || activeTab === 'confirmed') && (
        <>
          {loading ? (
            <div style={{ minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 28, height: 28, border: '2px solid #e2e8f0', borderTopColor: '#475569', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                <p style={{ marginTop: 12, fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>로딩 중...</p>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>✅</span>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#475569', margin: 0 }}>
                {activeTab === 'pending' ? '분류 대기 항목이 없습니다' : '확정된 항목이 없습니다'}
              </p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>업로드된 거래가 AI 분류되면 여기에 표시됩니다</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {groupedItems.map(([category, group]) => {
                const isExpanded = expandedGroups.has(category)
                const icon = CATEGORY_ICONS[category] || '📋'
                const groupName = getCategoryGroup(category)
                const groupColor = CATEGORY_COLORS[groupName] || '#64748b'
                const isIncome = group.type === 'income'

                return (
                  <div key={category} style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', transition: 'all 0.2s' }}>
                    {/* Group Header */}
                    <div onClick={() => toggleGroup(category)}
                      style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', cursor: 'pointer', gap: 12, borderBottom: isExpanded ? '1px solid #f1f5f9' : 'none', background: '#fafbfc', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#fafbfc'}>

                      {/* Color Bar */}
                      <div style={{ width: 4, height: 36, borderRadius: 4, background: groupColor, flexShrink: 0 }} />

                      {/* Category Name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 20 }}>{icon}</span>
                        <div>
                          <p style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', margin: 0 }}>{category}</p>
                          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 1, margin: 0 }}>{groupName}</p>
                        </div>
                      </div>

                      {/* Count & Amount */}
                      <div style={{ textAlign: 'right', marginRight: 12 }}>
                        <p style={{ fontWeight: 800, fontSize: 15, color: isIncome ? '#3b82f6' : '#ef4444', margin: 0 }}>
                          {nf(group.totalAmount)}원
                        </p>
                        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, margin: 0 }}>{group.items.length}건</p>
                      </div>

                      {/* Group Actions */}
                      {activeTab === 'pending' && category !== '미분류' && category !== '기타' && (
                        <button onClick={(e) => { e.stopPropagation(); handleConfirmGroup(category) }}
                          style={{ background: '#10b981', color: '#fff', padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 11, border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                          일괄확정
                        </button>
                      )}

                      {activeTab === 'confirmed' && (
                        <button onClick={(e) => { e.stopPropagation(); handleRevertGroup(category) }}
                          style={{ background: '#fef2f2', color: '#dc2626', padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 11, border: '1px solid #fecaca', cursor: 'pointer', flexShrink: 0 }}>
                          ↩ 일괄되돌리기
                        </button>
                      )}

                      {/* Expand Arrow */}
                      <span style={{ fontSize: 14, color: '#94a3b8', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                    </div>

                    {/* Group Items */}
                    {isExpanded && (
                      <div>
                        {group.items.map((item: any) => {
                          const src = item.source_data || {}
                          const isConfirmed = item.status === 'confirmed'

                          return (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 20px 10px 48px', borderBottom: '1px solid #f8fafc', gap: 12, opacity: isConfirmed ? 0.5 : 1, background: 'transparent', transition: 'background 0.2s' }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(79, 70, 229, 0.03)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>

                              {/* Date */}
                              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, width: 80, flexShrink: 0 }}>{src.transaction_date}</span>

                              {/* Type */}
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                                background: src.type === 'income' ? '#eff6ff' : '#fef2f2', color: src.type === 'income' ? '#3b82f6' : '#ef4444' }}>
                                {src.type === 'income' ? '입금' : '출금'}
                              </span>

                              {/* Payment Method */}
                              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: '#64748b', flexShrink: 0 }}>
                                {src.payment_method || '통장'}
                              </span>

                              {/* Client */}
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {src.client_name || '(미상)'}
                              </span>

                              {/* Description */}
                              <span style={{ fontSize: 11, color: '#94a3b8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {src.description || ''}
                              </span>

                              {/* Related Type */}
                              {item.ai_related_type && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#f0fdf4', color: '#16a34a', flexShrink: 0 }}>
                                  {TYPE_LABELS[item.ai_related_type] || ''}
                                </span>
                              )}

                              {/* Amount */}
                              <span style={{ fontWeight: 800, fontSize: 13, color: src.type === 'income' ? '#3b82f6' : '#ef4444', textAlign: 'right', width: 100, flexShrink: 0 }}>
                                {src.type === 'income' ? '+' : '-'}{nf(src.amount)}
                              </span>

                              {/* Actions - Pending */}
                              {!isConfirmed && activeTab === 'pending' && (
                                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                  <button onClick={() => handleConfirm(item)}
                                    style={{ background: '#0f172a', color: '#fff', padding: '4px 8px', borderRadius: 6, fontWeight: 700, fontSize: 10, border: 'none', cursor: 'pointer' }}>
                                    확정
                                  </button>
                                  <select defaultValue="" onChange={e => { if (e.target.value) handleConfirm(item, { category: e.target.value }) }}
                                    style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 4px', fontSize: 10, background: '#fff', color: '#64748b', maxWidth: 90, cursor: 'pointer' }}>
                                    <option value="" disabled>변경</option>
                                    {CATEGORIES.map(g => (
                                      <optgroup key={g.group} label={g.group}>
                                        {g.items.map(c => <option key={c} value={c}>{c}</option>)}
                                      </optgroup>
                                    ))}
                                  </select>
                                  <button onClick={() => handleConfirmWithRule(item, item.ai_category)}
                                    style={{ background: '#f1f5f9', color: '#475569', padding: '4px 8px', borderRadius: 6, fontWeight: 700, fontSize: 10, border: 'none', cursor: 'pointer' }}
                                    title="이 거래처를 규칙으로 학습합니다">
                                    📚
                                  </button>
                                </div>
                              )}

                              {/* Actions - Confirmed */}
                              {isConfirmed && activeTab !== 'pending' && (
                                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                  <select defaultValue="" onChange={e => { if (e.target.value) handleChangeCategory(item, e.target.value) }}
                                    style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 4px', fontSize: 10, background: '#fff', color: '#64748b', maxWidth: 90, cursor: 'pointer' }}>
                                    <option value="" disabled>수정</option>
                                    {CATEGORIES.map(g => (
                                      <optgroup key={g.group} label={g.group}>
                                        {g.items.map(c => <option key={c} value={c}>{c}</option>)}
                                      </optgroup>
                                    ))}
                                  </select>
                                  <button onClick={() => handleRevert(item)}
                                    style={{ background: '#fef2f2', color: '#dc2626', padding: '4px 8px', borderRadius: 6, fontWeight: 700, fontSize: 10, border: '1px solid #fecaca', cursor: 'pointer' }}
                                    title="대기중으로 되돌립니다">
                                    ↩ 되돌리기
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Page Export — UploadProvider는 ClientLayout에서 전역 제공
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export default function UploadFinancePage() {
  return <UploadContent />
}
