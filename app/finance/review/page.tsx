'use client'

import { supabase } from '../../utils/supabase'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'

// ── 분류 카테고리 옵션 ──
const CATEGORIES = [
  { group: '매출(영업수익)', items: ['렌트/운송수입', '지입 관리비/수수료', '보험금 수령', '매각/처분수입', '이자/잡이익'] },
  { group: '자본변동', items: ['투자원금 입금', '지입 초기비용/보증금', '대출 실행(입금)'] },
  { group: '영업비용-차량', items: ['유류비', '정비/수리비', '차량보험료', '자동차세/공과금', '차량할부/리스료', '화물공제/적재물보험'] },
  { group: '영업비용-금융', items: ['이자비용(대출/투자)', '원금상환', '지입 수익배분금(출금)', '수수료/카드수수료'] },
  { group: '영업비용-인건비', items: ['급여(정규직)', '일용직급여', '용역비(3.3%)', '4대보험(회사부담)'] },
  { group: '영업비용-관리', items: ['복리후생(식대)', '접대비', '여비교통비', '임차료/사무실', '통신비', '소모품/사무용품', '교육/훈련비', '광고/마케팅', '보험료(일반)', '전기/수도/가스', '경비/보안'] },
  { group: '세금/공과', items: ['원천세/부가세', '법인세/지방세', '세금/공과금'] },
  { group: '기타', items: ['쇼핑/온라인구매', '도서/신문', '감가상각비', '수선/유지비', '기타수입', '기타'] },
]

const ALL_CATEGORIES = CATEGORIES.flatMap(g => g.items)

const CATEGORY_ICONS: Record<string, string> = {
  '렌트/운송수입': '🚛', '지입 관리비/수수료': '📋', '보험금 수령': '🛡️', '매각/처분수입': '🏷️', '이자/잡이익': '📈',
  '투자원금 입금': '💰', '지입 초기비용/보증금': '🔑', '대출 실행(입금)': '🏦',
  '유류비': '⛽', '정비/수리비': '🔧', '차량보험료': '🚗', '자동차세/공과금': '📄', '차량할부/리스료': '💳', '화물공제/적재물보험': '📦',
  '이자비용(대출/투자)': '📊', '원금상환': '💸', '지입 수익배분금(출금)': '🤝', '수수료/카드수수료': '🧾',
  '급여(정규직)': '👨‍💼', '일용직급여': '👤', '용역비(3.3%)': '👷', '4대보험(회사부담)': '🏥',
  '복리후생(식대)': '🍽️', '접대비': '🥂', '여비교통비': '🚕', '임차료/사무실': '🏢', '통신비': '📱', '소모품/사무용품': '🗃️',
  '교육/훈련비': '📚', '광고/마케팅': '📣', '보험료(일반)': '🛡️', '전기/수도/가스': '💡', '경비/보안': '🔒',
  '원천세/부가세': '🏛️', '법인세/지방세': '🏛️', '세금/공과금': '🏛️',
  '쇼핑/온라인구매': '🛒', '도서/신문': '📰', '감가상각비': '📉', '수선/유지비': '🔩', '기타수입': '📥', '기타': '📦', '미분류': '❓',
}

// ═══ 용도별 카테고리 (사용자 화면 표시용 — 같은 업종/종류끼리 묶기) ═══
const DISPLAY_CATEGORIES = [
  { group: '💰 돈 들어오는 것', icon: '💰', items: ['렌트/운송수입', '지입 관리비/수수료', '보험금 수령', '매각/처분수입', '이자/잡이익', '기타수입'] },
  { group: '🏦 투자/대출 입출금', icon: '🏦', items: ['투자원금 입금', '지입 초기비용/보증금', '대출 실행(입금)', '이자비용(대출/투자)', '원금상환', '지입 수익배분금(출금)'] },
  { group: '🚛 차량 운영', icon: '🚛', items: ['유류비', '정비/수리비', '차량보험료', '자동차세/공과금', '차량할부/리스료', '화물공제/적재물보험'] },
  { group: '👨‍💼 급여/인건비', icon: '👨‍💼', items: ['급여(정규직)', '일용직급여', '용역비(3.3%)', '4대보험(회사부담)'] },
  { group: '🏢 사무실/운영비', icon: '🏢', items: ['임차료/사무실', '통신비', '소모품/사무용품', '전기/수도/가스', '경비/보안', '수선/유지비'] },
  { group: '🍽️ 식비/접대/출장', icon: '🍽️', items: ['복리후생(식대)', '접대비', '여비교통비'] },
  { group: '💳 수수료/카드', icon: '💳', items: ['수수료/카드수수료'] },
  { group: '🏛️ 세금/공과금', icon: '🏛️', items: ['원천세/부가세', '법인세/지방세', '세금/공과금'] },
  { group: '📦 기타 지출', icon: '📦', items: ['쇼핑/온라인구매', '도서/신문', '교육/훈련비', '광고/마케팅', '보험료(일반)', '감가상각비', '기타'] },
]

const CATEGORY_COLORS: Record<string, string> = {
  // 회계 기준
  '매출(영업수익)': '#3b82f6', '자본변동': '#6366f1', '영업비용-차량': '#f59e0b', '영업비용-금융': '#8b5cf6',
  '영업비용-인건비': '#10b981', '영업비용-관리': '#ec4899', '세금/공과': '#ef4444', '기타': '#94a3b8',
  // 용도별
  '💰 돈 들어오는 것': '#3b82f6', '🏦 투자/대출 입출금': '#6366f1', '🚛 차량 운영': '#f59e0b',
  '👨‍💼 급여/인건비': '#10b981', '🏢 사무실/운영비': '#8b5cf6', '🍽️ 식비/접대/출장': '#ec4899',
  '💳 수수료/카드': '#a855f7', '🏛️ 세금/공과금': '#ef4444', '📦 기타 지출': '#94a3b8',
}

const TYPE_LABELS: Record<string, string> = { jiip: '지입', invest: '투자', loan: '대출', salary: '급여', freelancer: '프리랜서', insurance: '보험', car: '차량' }

const nf = (n: number) => n ? Math.abs(n).toLocaleString() : '0'

function getCategoryGroup(cat: string, mode: 'accounting' | 'display' = 'accounting'): string {
  const source = mode === 'display' ? DISPLAY_CATEGORIES : CATEGORIES
  for (const g of source) {
    if (g.items.includes(cat)) return g.group
  }
  return mode === 'display' ? '📦 기타 지출' : '기타'
}

export default function ClassificationReviewPage() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const companyId = role === 'admin' ? adminSelectedCompanyId : company?.id
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'confirmed' | 'all'>('pending')
  const [stats, setStats] = useState({ pending: 0, confirmed: 0 })
  const [aiClassifying, setAiClassifying] = useState(false)
  const [aiResult, setAiResult] = useState<{ updated: number; total: number } | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [duplicateInfo, setDuplicateInfo] = useState<{ count: number; checking: boolean }>({ count: 0, checking: false })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [categoryMode, setCategoryMode] = useState<'accounting' | 'display'>('display')
  const [showBulkCategoryPicker, setShowBulkCategoryPicker] = useState(false)
  const [bulkCategorySearch, setBulkCategorySearch] = useState('')

  // 연결 대상 조회용
  const [jiips, setJiips] = useState<any[]>([])
  const [investors, setInvestors] = useState<any[]>([])
  const [freelancers, setFreelancers] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])

  const fetchItems = useCallback(async () => {
    if (!companyId) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/finance/classify?company_id=${companyId}&status=${filter}&limit=500`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
        setTotal(data.total || 0)
      }

      const [pRes, cRes] = await Promise.all([
        fetch(`/api/finance/classify?company_id=${companyId}&status=pending&limit=1`),
        fetch(`/api/finance/classify?company_id=${companyId}&status=confirmed&limit=1`),
      ])
      const pData = await pRes.json()
      const cData = await cRes.json()
      setStats({ pending: pData.total || 0, confirmed: cData.total || 0 })
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [companyId, filter])

  const fetchRelated = useCallback(async () => {
    if (!companyId) return
    const [j, i, f, e] = await Promise.all([
      supabase.from('jiip_contracts').select('id, investor_name').eq('company_id', companyId),
      supabase.from('general_investments').select('id, investor_name').eq('company_id', companyId),
      supabase.from('freelancers').select('id, name').eq('company_id', companyId),
      supabase.from('profiles').select('id, employee_name, email, phone, position_id, department_id').eq('company_id', companyId),
    ])
    setJiips(j.data || [])
    setInvestors(i.data || [])
    setFreelancers(f.data || [])
    setEmployees(e.data || [])
  }, [companyId])

  useEffect(() => { fetchItems() }, [fetchItems])
  useEffect(() => { fetchRelated() }, [fetchRelated])

  // ── 카테고리별 그룹핑 ──
  const groupedItems = useMemo(() => {
    const groups: Record<string, { items: any[]; totalAmount: number; type: string }> = {}
    for (const item of items) {
      const rawCat = item.ai_category || '미분류'
      let key: string
      if (categoryMode === 'display') {
        // 용도별: DISPLAY_CATEGORIES 그룹명으로 묶기
        const catMap: Record<string, string> = {}
        for (const g of DISPLAY_CATEGORIES) {
          for (const c of g.items) catMap[c] = g.group
        }
        key = catMap[rawCat] || '📦 기타 지출'
        if (rawCat === '미분류') key = '❓ 미분류'
      } else {
        key = rawCat
      }
      if (!groups[key]) groups[key] = { items: [], totalAmount: 0, type: 'expense' }
      groups[key].items.push(item)
      groups[key].totalAmount += Math.abs(item.source_data?.amount || 0)
      if (item.source_data?.type === 'income') groups[key].type = 'income'
    }

    // 정렬: 용도별이면 DISPLAY_CATEGORIES 순서대로, 회계기준이면 건수 많은 순
    if (categoryMode === 'display') {
      const order = DISPLAY_CATEGORIES.map(g => g.group)
      order.push('❓ 미분류')
      return Object.entries(groups).sort((a, b) => {
        const ai = order.indexOf(a[0])
        const bi = order.indexOf(b[0])
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    }
    return Object.entries(groups).sort((a, b) => b[1].items.length - a[1].items.length)
  }, [items, categoryMode])

  // ── 단건 확정 ──
  const handleConfirm = async (item: any, overrides?: { category?: string; related_type?: string; related_id?: string }) => {
    const category = overrides?.category || item.ai_category || item.final_category
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          final_category: category,
          final_matched_type: overrides?.related_type || item.ai_related_type,
          final_matched_id: overrides?.related_id || item.ai_related_id,
          save_as_rule: false,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id))
        setStats(prev => ({ pending: prev.pending - 1, confirmed: prev.confirmed + 1 }))
      }
    } catch (e) { console.error(e) }
  }

  // ── 규칙 학습 + 확정 ──
  const handleConfirmWithRule = async (item: any, category: string) => {
    const keyword = item.source_data?.client_name || ''
    if (!keyword) return handleConfirm(item, { category })
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id, final_category: category,
          final_matched_type: item.ai_related_type, final_matched_id: item.ai_related_id,
          save_as_rule: true, rule_keyword: keyword,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id))
        setStats(prev => ({ pending: prev.pending - 1, confirmed: prev.confirmed + 1 }))
      }
    } catch (e) { console.error(e) }
  }

  // ── 확정 취소 (대기중으로 되돌리기) ──
  const handleRevert = async (item: any) => {
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          final_category: '기타',
          final_matched_type: null,
          final_matched_id: null,
          save_as_rule: false,
        }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id))
        setStats(prev => ({ pending: prev.pending + 1, confirmed: prev.confirmed - 1 }))
      }
    } catch (e) { console.error(e) }
  }

  // ── 카테고리 변경 (확정된 건) ──
  const handleChangeCategory = async (item: any, newCategory: string) => {
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: item.id,
          final_category: newCategory,
          final_matched_type: item.ai_related_type,
          final_matched_id: item.ai_related_id,
          save_as_rule: false,
        }),
      })
      if (res.ok) {
        // 목록 내에서 카테고리만 업데이트
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, ai_category: newCategory, final_category: newCategory } : i))
      }
    } catch (e) { console.error(e) }
  }

  // ── 카테고리 그룹 일괄 확정 ──
  const handleConfirmGroup = async (category: string) => {
    const groupItems = items.filter(i => (i.ai_category || '미분류') === category)
    if (!confirm(`"${category}" ${groupItems.length}건을 일괄 확정하시겠습니까?`)) return
    for (const item of groupItems) {
      await handleConfirm(item, { category })
    }
    fetchItems()
  }

  // ── 카테고리 그룹 일괄 되돌리기 ──
  const handleRevertGroup = async (category: string) => {
    const groupItems = items.filter(i => (i.ai_category || '미분류') === category)
    if (!confirm(`"${category}" ${groupItems.length}건을 대기중으로 되돌리시겠습니까?`)) return
    for (const item of groupItems) {
      await handleRevert(item)
    }
    fetchItems()
  }

  // ── 전체 되돌리기 ──
  const handleRevertAll = async () => {
    if (!confirm(`현재 조회된 ${items.length}건 전체를 대기중으로 되돌리시겠습니까?`)) return
    for (const item of items) {
      await handleRevert(item)
    }
    fetchItems()
  }

  // ── 전체 자동 확정 ──
  const handleAutoConfirmAll = async () => {
    const pendingItems = items.filter(i => i.status === 'pending')
    if (!confirm(`AI 추천 기준으로 ${pendingItems.length}건을 일괄 확정하시겠습니까?`)) return
    for (const item of pendingItems) {
      await handleConfirm(item)
    }
    fetchItems()
  }

  // ── AI 자동 재분류 ──
  const handleAiReclassify = async () => {
    if (!companyId) return
    if (!confirm('미분류/기타 거래를 AI로 자동 분류하시겠습니까?\nGPT가 거래 내용을 분석하여 계정과목을 추천합니다.')) return
    setAiClassifying(true)
    setAiResult(null)
    try {
      const res = await fetch('/api/finance/reclassify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId }),
      })
      if (res.ok) {
        const data = await res.json()
        setAiResult({ updated: data.updated, total: data.total })
        fetchItems()
      } else {
        const err = await res.json()
        alert('AI 분류 실패: ' + (err.error || '알 수 없는 오류'))
      }
    } catch (e) { console.error(e); alert('AI 분류 요청 중 오류가 발생했습니다.') }
    setAiClassifying(false)
  }

  // ── 선택 관련 헬퍼 ──
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(i => i.id)))
    }
  }

  const toggleSelectGroup = (groupItems: any[]) => {
    const groupItemIds = groupItems.map(i => i.id)
    const allSelected = groupItemIds.length > 0 && groupItemIds.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        groupItemIds.forEach(id => next.delete(id))
      } else {
        groupItemIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const handleBulkConfirmSelected = async () => {
    if (selectedIds.size === 0) return
    const selectedItems = items.filter(i => selectedIds.has(i.id))
    if (!confirm(`선택한 ${selectedItems.length}건을 일괄 확정하시겠습니까?`)) return
    setBulkProcessing(true)
    for (const item of selectedItems) {
      await handleConfirm(item)
    }
    setSelectedIds(new Set())
    setBulkProcessing(false)
    fetchItems()
  }

  const handleBulkRevertSelected = async () => {
    if (selectedIds.size === 0) return
    const selectedItems = items.filter(i => selectedIds.has(i.id))
    if (!confirm(`선택한 ${selectedItems.length}건을 대기중으로 되돌리시겠습니까?`)) return
    setBulkProcessing(true)
    for (const item of selectedItems) {
      await handleRevert(item)
    }
    setSelectedIds(new Set())
    setBulkProcessing(false)
    fetchItems()
  }

  // ── 일괄분류 + 학습 ──
  const handleBulkClassifySelected = async (category: string, saveRules: boolean = true) => {
    if (selectedIds.size === 0) return
    const selectedItems = items.filter(i => selectedIds.has(i.id))
    const keywords = selectedItems
      .map(i => i.source_data?.client_name || i.client_name || '')
      .filter(k => k.trim())

    setBulkProcessing(true)
    setShowBulkCategoryPicker(false)
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bulk_classify: true,
          queue_ids: Array.from(selectedIds),
          final_category: category,
          save_rules: saveRules,
          keywords,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const msg = saveRules && data.rules_saved > 0
          ? `${data.updated}건 분류 완료! (${data.rules_saved}개 규칙 학습됨)`
          : `${data.updated}건 분류 완료!`
        alert(`✅ ${msg}`)
        setSelectedIds(new Set())
        fetchItems()
      }
    } catch (e) { console.error(e) }
    setBulkProcessing(false)
  }

  const handleBulkDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return
    setBulkProcessing(true)
    try {
      const res = await fetch('/api/finance/classify', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue_ids: Array.from(selectedIds) }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => !selectedIds.has(i.id)))
        setSelectedIds(new Set())
      }
    } catch (e) { console.error(e) }
    setBulkProcessing(false)
    fetchItems()
  }

  // ── 중복 체크 & 삭제 ──
  const handleCheckDuplicates = async () => {
    if (!companyId) return
    setDuplicateInfo({ count: 0, checking: true })
    try {
      const res = await fetch(`/api/finance/dedup?company_id=${companyId}`)
      if (res.ok) {
        const data = await res.json()
        setDuplicateInfo({ count: data.duplicateCount, checking: false })
        if (data.duplicateCount === 0) {
          alert('✅ 중복 거래가 없습니다!')
        } else if (confirm(`⚠️ ${data.duplicateCount}건의 중복 거래가 발견되었습니다.\n(${data.groupCount}개 그룹)\n\n중복 건을 삭제하시겠습니까? (먼저 저장된 1건만 유지)`)) {
            const delRes = await fetch('/api/finance/dedup', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ company_id: companyId }),
            })
            if (delRes.ok) {
              const delData = await delRes.json()
              alert(`✅ ${delData.deleted}건 중복 삭제 완료! (${delData.remaining}건 남음)`)
              fetchItems()
            }
        }
      }
    } catch (e) { console.error(e) }
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

  if (role === 'admin' && !adminSelectedCompanyId) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 16px', minHeight: '100vh', background: '#f8fafc' }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: 80, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>🏢</span>
          <p style={{ fontWeight: 700, color: '#475569', fontSize: 14 }}>좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px', minHeight: '100vh', background: '#f8fafc' }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: 0 }}>AI 분류 검토</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>AI가 분류한 거래를 카테고리별로 검토하고 확정합니다</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleCheckDuplicates} disabled={duplicateInfo.checking}
            style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: 10, fontWeight: 700, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
            {duplicateInfo.checking ? '🔍 확인 중...' : '🔄 중복 체크'}
          </button>
          <button onClick={handleAiReclassify} disabled={aiClassifying}
            style={{ background: aiClassifying ? '#94a3b8' : 'linear-gradient(135deg, #7c3aed, #6366f1)', color: '#fff', padding: '8px 16px', borderRadius: 10, fontWeight: 800, fontSize: 12, border: 'none', cursor: aiClassifying ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.25)' }}>
            {aiClassifying ? '🔄 AI 분류 중...' : '🤖 AI 자동분류'}
          </button>
          {filter === 'pending' && items.length > 0 && (
            <button onClick={handleAutoConfirmAll}
              style={{ background: '#0f172a', color: '#fff', padding: '8px 14px', borderRadius: 10, fontWeight: 800, fontSize: 12, border: 'none', cursor: 'pointer' }}>
              ✅ 전체 확정
            </button>
          )}
          {filter === 'confirmed' && items.length > 0 && (
            <button onClick={handleRevertAll}
              style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 14px', borderRadius: 10, fontWeight: 800, fontSize: 12, border: '1px solid #fecaca', cursor: 'pointer' }}>
              ↩ 전체 되돌리기
            </button>
          )}
        </div>
      </div>

      {/* 통계 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '검토 대기', value: stats.pending, color: '#f59e0b', icon: '⏳' },
          { label: '확정 완료', value: stats.confirmed, color: '#10b981', icon: '✅' },
          { label: '현재 조회', value: total, color: '#0f172a', icon: '📋' },
          { label: '카테고리', value: groupedItems.length, color: '#6366f1', icon: '🏷️' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>{s.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 900, color: s.color, margin: 0 }}>{s.value}<span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginLeft: 2 }}>건</span></p>
          </div>
        ))}
      </div>

      {/* C타입: 드롭다운 축소형 - 모든 필터 1줄 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* 상태 필터 */}
        <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 12, border: '1px solid #e2e8f0', width: 'fit-content' }}>
          {[
            { key: 'pending' as const, label: '⏳ 대기중' },
            { key: 'confirmed' as const, label: '✅ 확정됨' },
            { key: 'all' as const, label: '◎ 전체' },
          ].map(tab => (
            <button key={tab.key} onClick={() => { setFilter(tab.key); setExpandedGroups(new Set()); setSelectedIds(new Set()) }}
              style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer',
                background: filter === tab.key ? '#0f172a' : 'transparent', color: filter === tab.key ? '#fff' : '#94a3b8' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* 용도별/회계기준 토글 (항상 표시) */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, background: '#f1f5f9', padding: 3, borderRadius: 8 }}>
          {[
            { key: 'display' as const, label: '📋 용도별' },
            { key: 'accounting' as const, label: '📊 회계기준' },
          ].map(m => (
            <button key={m.key} onClick={() => { setCategoryMode(m.key); setExpandedGroups(new Set()) }}
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: categoryMode === m.key ? '#0f172a' : 'transparent',
                color: categoryMode === m.key ? '#fff' : '#94a3b8',
                transition: 'all 0.15s',
              }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 전체선택 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {items.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 12, fontWeight: 700, color: '#64748b' }}>
            <input
              type="checkbox"
              checked={items.length > 0 && selectedIds.size === items.length}
              ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < items.length }}
              onChange={toggleSelectAll}
              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#0f172a' }}
            />
            {selectedIds.size > 0 ? `${selectedIds.size}건 선택됨` : `전체 선택 (${items.length})`}
          </label>
        )}
      </div>

      {/* AI 분류 결과 배너 */}
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

      {/* AI 분류 진행 중 */}
      {aiClassifying && (
        <div style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '1px solid #c7d2fe', borderRadius: 14, padding: 20, marginBottom: 16, textAlign: 'center' }}>
          <div style={{ width: 28, height: 28, border: '3px solid #e0e7ff', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 800, fontSize: 13, color: '#4338ca', margin: 0 }}>🤖 GPT가 거래 내역을 분석하고 있습니다...</p>
          <p style={{ fontSize: 11, color: '#6366f1', marginTop: 4 }}>세무 전문가 수준의 AI가 계정과목을 자동 분류합니다</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* 카테고리별 그룹 뷰 */}
      {loading ? (
        <div style={{ minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 28, height: 28, border: '2px solid #e2e8f0', borderTopColor: '#475569', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
            <p style={{ marginTop: 12, fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>로딩 중...</p>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>✅</span>
          <p style={{ fontWeight: 700, fontSize: 14, color: '#475569' }}>
            {filter === 'pending' ? '검토 대기 항목이 없습니다' : '조회된 항목이 없습니다'}
          </p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>업로드된 거래가 AI 분류되면 여기에 표시됩니다</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groupedItems.map(([category, group]) => {
            const isExpanded = expandedGroups.has(category)
            const isDisplayMode = categoryMode === 'display'
            const icon = isDisplayMode ? '' : (CATEGORY_ICONS[category] || '📋')
            const groupName = isDisplayMode ? '' : getCategoryGroup(category, 'accounting')
            const groupColor = CATEGORY_COLORS[isDisplayMode ? category : groupName] || '#64748b'
            const isIncome = group.type === 'income'

            return (
              <div key={category} style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', transition: 'all 0.2s' }}>
                {/* 그룹 헤더 (접기/펼치기) */}
                <div onClick={() => toggleGroup(category)}
                  style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', cursor: 'pointer', gap: 12, borderBottom: isExpanded ? '1px solid #f1f5f9' : 'none' }}>

                  {/* 그룹 체크박스 */}
                  <input
                    type="checkbox"
                    checked={group.items.length > 0 && group.items.every((i: any) => selectedIds.has(i.id))}
                    ref={(el) => {
                      if (el) {
                        const checkedCount = group.items.filter((i: any) => selectedIds.has(i.id)).length
                        el.indeterminate = checkedCount > 0 && checkedCount < group.items.length
                      }
                    }}
                    onChange={(e) => { e.stopPropagation(); toggleSelectGroup(group.items) }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#0f172a', flexShrink: 0 }}
                  />

                  {/* 카테고리 색상 바 */}
                  <div style={{ width: 4, height: 36, borderRadius: 4, background: groupColor, flexShrink: 0 }} />

                  {/* 아이콘 + 카테고리명 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    {!isDisplayMode && <span style={{ fontSize: 20 }}>{icon}</span>}
                    <div>
                      <p style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', margin: 0 }}>{category}</p>
                      {!isDisplayMode && <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{groupName}</p>}
                    </div>
                  </div>

                  {/* 건수 + 금액 */}
                  <div style={{ textAlign: 'right', marginRight: 12 }}>
                    <p style={{ fontWeight: 800, fontSize: 15, color: isIncome ? '#3b82f6' : '#ef4444', margin: 0 }}>
                      {nf(group.totalAmount)}원
                    </p>
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{group.items.length}건</p>
                  </div>

                  {/* 확정 버튼 (pending만) */}
                  {filter === 'pending' && category !== '미분류' && category !== '기타' && (
                    <button onClick={(e) => { e.stopPropagation(); handleConfirmGroup(category) }}
                      style={{ background: '#10b981', color: '#fff', padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 11, border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                      일괄확정
                    </button>
                  )}

                  {/* 되돌리기 버튼 (confirmed만) */}
                  {filter === 'confirmed' && (
                    <button onClick={(e) => { e.stopPropagation(); handleRevertGroup(category) }}
                      style={{ background: '#fef2f2', color: '#dc2626', padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 11, border: '1px solid #fecaca', cursor: 'pointer', flexShrink: 0 }}>
                      ↩ 일괄되돌리기
                    </button>
                  )}

                  {/* 펼치기 화살표 */}
                  <span style={{ fontSize: 14, color: '#94a3b8', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                </div>

                {/* 그룹 내 거래 목록 */}
                {isExpanded && (
                  <div>
                    {group.items.map((item: any) => {
                      const src = item.source_data || {}
                      const isConfirmed = item.status === 'confirmed'

                      return (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 20px 10px 48px', borderBottom: '1px solid #f8fafc', gap: 12, opacity: isConfirmed ? 0.5 : 1, background: selectedIds.has(item.id) ? '#f0f9ff' : 'transparent' }}>
                          {/* 체크박스 */}
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#0f172a', flexShrink: 0 }}
                          />
                          {/* 날짜 */}
                          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, width: 80, flexShrink: 0 }}>{src.transaction_date}</span>

                          {/* 입출금 */}
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                            background: src.type === 'income' ? '#eff6ff' : '#fef2f2', color: src.type === 'income' ? '#3b82f6' : '#ef4444' }}>
                            {src.type === 'income' ? '입금' : '출금'}
                          </span>

                          {/* 결제수단 */}
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: '#64748b', flexShrink: 0 }}>
                            {src.payment_method || '통장'}
                          </span>

                          {/* 해외/달러결제 뱃지 */}
                          {src.currency && src.currency !== 'KRW' && (
                            <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', flexShrink: 0 }}>
                              {src.currency}{src.original_amount ? ` ${src.original_amount.toLocaleString()}` : ''}
                            </span>
                          )}

                          {/* 거래처 */}
                          <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {src.client_name || '(미상)'}
                          </span>

                          {/* 비고 */}
                          <span style={{ fontSize: 11, color: '#94a3b8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {src.description || ''}
                          </span>

                          {/* 연결대상 */}
                          {item.ai_related_type && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#f0fdf4', color: '#16a34a', flexShrink: 0 }}>
                              {TYPE_LABELS[item.ai_related_type] || ''}
                            </span>
                          )}

                          {/* 금액 */}
                          <span style={{ fontWeight: 800, fontSize: 13, color: src.type === 'income' ? '#3b82f6' : '#0f172a', textAlign: 'right', width: 100, flexShrink: 0 }}>
                            {src.type === 'income' ? '+' : ''}{nf(src.amount)}
                          </span>

                          {/* 액션 - 대기중 */}
                          {!isConfirmed && filter === 'pending' && (
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <button onClick={() => handleConfirm(item)}
                                style={{ background: '#0f172a', color: '#fff', padding: '4px 8px', borderRadius: 6, fontWeight: 700, fontSize: 10, border: 'none', cursor: 'pointer' }}>
                                확정
                              </button>
                              <select defaultValue="" onChange={e => { if (e.target.value) handleConfirm(item, { category: e.target.value }) }}
                                style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 4px', fontSize: 10, background: '#fff', color: '#64748b', maxWidth: 90 }}>
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

                          {/* 액션 - 확정됨 (수정/되돌리기) */}
                          {isConfirmed && filter !== 'pending' && (
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <select defaultValue="" onChange={e => { if (e.target.value) handleChangeCategory(item, e.target.value) }}
                                style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 4px', fontSize: 10, background: '#fff', color: '#64748b', maxWidth: 90 }}>
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

      {/* 선택 항목 플로팅 액션 바 */}
      {selectedIds.size > 0 && (() => {
        const selectedItems = items.filter(i => selectedIds.has(i.id))
        const totalAmount = selectedItems.reduce((sum, i) => sum + Math.abs(Number(i.source_data?.amount || i.amount || 0)), 0)
        return (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#0f172a', color: '#fff', borderRadius: 16,
          padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 50, minWidth: 400,
        }}>
          <span style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>
            {selectedIds.size}건 선택
          </span>
          <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
            합계 {nf(totalAmount)}원
          </span>
          <div style={{ width: 1, height: 20, background: '#334155' }} />
          {filter === 'pending' && (
            <>
              <button onClick={handleBulkConfirmSelected} disabled={bulkProcessing}
                style={{ background: '#10b981', color: '#fff', padding: '8px 16px', borderRadius: 10, fontWeight: 800, fontSize: 12, border: 'none', cursor: bulkProcessing ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                {bulkProcessing ? '처리 중...' : '✅ 분류확정'}
              </button>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowBulkCategoryPicker(!showBulkCategoryPicker)} disabled={bulkProcessing}
                  style={{ background: '#3b82f6', color: '#fff', padding: '8px 16px', borderRadius: 10, fontWeight: 800, fontSize: 12, border: 'none', cursor: bulkProcessing ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                  {bulkProcessing ? '처리 중...' : '📋 일괄분류'}
                </button>
                {showBulkCategoryPicker && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                    marginBottom: 8, background: '#fff', borderRadius: 16, padding: 12,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)', border: '1px solid #e2e8f0',
                    width: 360, maxHeight: 420, overflowY: 'auto', zIndex: 60,
                  }} onClick={e => e.stopPropagation()}>
                    <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>분류 선택</span>
                      <label style={{ fontSize: 11, fontWeight: 500, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                        <input type="checkbox" defaultChecked style={{ width: 14, height: 14 }} id="bulk-learn-check" />
                        규칙 학습
                      </label>
                    </div>
                    <input
                      type="text"
                      placeholder="카테고리 검색..."
                      value={bulkCategorySearch}
                      onChange={e => setBulkCategorySearch(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, marginBottom: 8, outline: 'none', boxSizing: 'border-box' }}
                    />
                    {(categoryMode === 'display' ? DISPLAY_CATEGORIES : CATEGORIES).map(group => {
                      const filteredItems = group.items.filter(cat =>
                        !bulkCategorySearch || cat.toLowerCase().includes(bulkCategorySearch.toLowerCase()) || group.group.toLowerCase().includes(bulkCategorySearch.toLowerCase())
                      )
                      if (filteredItems.length === 0) return null
                      return (
                        <div key={group.group} style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', padding: '4px 0' }}>{group.group}</div>
                          {filteredItems.map(cat => (
                            <button key={cat}
                              onClick={() => {
                                const learnCheck = document.getElementById('bulk-learn-check') as HTMLInputElement
                                const saveRules = learnCheck?.checked ?? true
                                if (confirm(`선택한 ${selectedIds.size}건을 "${cat}"(으)로 분류하시겠습니까?${saveRules ? '\n\n✅ 거래처명을 규칙으로 학습합니다.' : ''}`)) {
                                  handleBulkClassifySelected(cat, saveRules)
                                }
                              }}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '6px 10px', borderRadius: 8, border: 'none',
                                background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#1e293b',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              {CATEGORY_ICONS[cat] || '📄'} {cat}
                            </button>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
          {filter === 'confirmed' && (
            <button onClick={handleBulkRevertSelected} disabled={bulkProcessing}
              style={{ background: '#fbbf24', color: '#0f172a', padding: '8px 16px', borderRadius: 10, fontWeight: 800, fontSize: 12, border: 'none', cursor: bulkProcessing ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
              {bulkProcessing ? '처리 중...' : '↩ 선택 되돌리기'}
            </button>
          )}
          <button onClick={handleBulkDeleteSelected} disabled={bulkProcessing}
            style={{ background: '#dc2626', color: '#fff', padding: '8px 16px', borderRadius: 10, fontWeight: 800, fontSize: 12, border: 'none', cursor: bulkProcessing ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
            삭제
          </button>
          <button onClick={() => { setSelectedIds(new Set()); setShowBulkCategoryPicker(false) }}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, padding: '4px 8px', marginLeft: 'auto' }}>
            ✕
          </button>
        </div>
        )
      })()}
    </div>
  )
}
