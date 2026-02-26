'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'

export const dynamic = 'force-dynamic'

/* ──────────────────────── 타입 ──────────────────────── */
interface TermsSet {
  id: number
  company_id: string
  version: string
  title: string
  description: string | null
  status: 'draft' | 'active' | 'archived'
  effective_from: string | null
  effective_to: string | null
  created_at: string
  updated_at: string
}

interface Article {
  id: number
  terms_id: number
  article_number: number
  title: string
  content: string
  category: string
  sort_order: number
  is_required: boolean
  created_at: string
  updated_at: string
}

interface SpecialTerm {
  id: number
  company_id: string
  label: string
  content: string
  contract_type: 'return' | 'buyout' | 'all'
  is_default: boolean
  is_active: boolean
  sort_order: number
}

interface HistoryEntry {
  id: number
  terms_id: number
  article_id: number | null
  action: string
  old_value: string | null
  new_value: string | null
  changed_at: string
  reason: string | null
}

/* ──────────────────────── 상수 ──────────────────────── */
const CATEGORIES: Record<string, string> = {
  general: '일반',
  payment: '렌탈료/보증금',
  insurance: '보험/사고',
  vehicle: '차량 관리',
  maintenance: '정비',
  mileage: '주행거리',
  termination: '해지/반납/인수',
  penalty: '위약금/지연',
  privacy: '개인정보',
  other: '기타',
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:    { label: '작성중', color: 'bg-yellow-100 text-yellow-800' },
  active:   { label: '적용중', color: 'bg-green-100 text-green-800' },
  archived: { label: '보관',   color: 'bg-gray-100 text-gray-600' },
}

const CONTRACT_TYPES: Record<string, string> = {
  return: '반납형',
  buyout: '인수형',
  all: '공통',
}

const CONTRACT_CATEGORIES: Record<string, { label: string; emoji: string }> = {
  long_term_rental: { label: '장기렌트 계약서', emoji: '📋' },
  jiip: { label: '지입(위수탁) 계약서', emoji: '📑' },
  investment: { label: '투자 계약서', emoji: '💼' },
  short_term_rental: { label: '단기렌트 계약서', emoji: '🚗' },
}

/* ──────────────────────── 메인 컴포넌트 ──────────────────────── */
export default function ContractTermsPage() {
  const { company, profile, role, adminSelectedCompanyId, allCompanies } = useApp()

  // ── 탭 상태 ──
  const [tab, setTab] = useState<'versions' | 'articles' | 'special' | 'history' | 'insurance' | 'notices' | 'params'>('versions')
  const [selectedCategory, setSelectedCategory] = useState<string>('long_term_rental')

  // ── 약관 버전 목록 ──
  const [termsSets, setTermsSets] = useState<TermsSet[]>([])
  const [selectedTerms, setSelectedTerms] = useState<TermsSet | null>(null)
  const [loading, setLoading] = useState(false)

  // ── 조항 ──
  const [articles, setArticles] = useState<Article[]>([])
  const [editingArticle, setEditingArticle] = useState<Article | null>(null)
  const [articleForm, setArticleForm] = useState({ title: '', content: '', category: 'general', is_required: true })
  const [articleSearch, setArticleSearch] = useState('')
  const [articleCategoryFilter, setArticleCategoryFilter] = useState('all')

  // ── 특약 ──
  const [specialTerms, setSpecialTerms] = useState<SpecialTerm[]>([])
  const [editingSpecial, setEditingSpecial] = useState<SpecialTerm | null>(null)
  const [specialForm, setSpecialForm] = useState({ label: '', content: '', contract_type: 'all' as string, is_default: false })

  // ── 이력 ──
  const [history, setHistory] = useState<HistoryEntry[]>([])

  // ── 보험 보장내역 ──
  interface InsuranceCoverageItem {
    label: string
    description: string
  }
  const [insuranceCoverage, setInsuranceCoverage] = useState<InsuranceCoverageItem[]>([])
  const [editingCoverageIndex, setEditingCoverageIndex] = useState<number | null>(null)
  const [coverageForm, setCoverageForm] = useState<InsuranceCoverageItem>({ label: '', description: '' })

  // ── 견적 유의사항 ──
  type QuoteNoticeItem = string | { text: string; condition?: string }
  const [quoteNotices, setQuoteNotices] = useState<QuoteNoticeItem[]>([])
  const [editingNoticeIndex, setEditingNoticeIndex] = useState<number | null>(null)
  const [noticeForm, setNoticeForm] = useState<QuoteNoticeItem>('')
  const [noticeCondition, setNoticeCondition] = useState('')

  // ── 계산 파라미터 ──
  interface CalcParams {
    [key: string]: any
  }
  const [calcParams, setCalcParams] = useState<CalcParams>({})
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    ins_base: true,
    own_damage: true,
    deductible_discount: true,
    driver_age: true,
    car_age: true,
    ins_breakdown: true,
    non_commercial: true,
    excess_mileage: true,
    early_termination: true,
  })

  // ── 폼 스크롤 ref ──
  const articleFormRef = useRef<HTMLDivElement>(null)
  const specialFormRef = useRef<HTMLDivElement>(null)
  const insuranceFormRef = useRef<HTMLDivElement>(null)
  const noticeFormRef = useRef<HTMLDivElement>(null)

  // ── 버전 생성 폼 ──
  const [showNewForm, setShowNewForm] = useState(false)
  const [newVersion, setNewVersion] = useState({ version: '', title: '자동차 장기대여 약관', description: '', effective_from: '' })

  // god_admin은 회사가 없으므로 선택된 회사 또는 첫 번째 회사 사용
  const companyId = company?.id || adminSelectedCompanyId || (role === 'god_admin' && allCompanies?.[0]?.id) || null

  /* ────────── 데이터 로드 ────────── */
  const fetchTermsSets = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('contract_terms')
      .select('*')
      .eq('company_id', companyId)
      .eq('contract_category', selectedCategory)
      .order('created_at', { ascending: false })
    if (!error && data) setTermsSets(data)
    else if (error) console.error('[약관] 에러:', error)
    setLoading(false)
  }, [companyId, selectedCategory])

  const fetchArticles = useCallback(async (termsId: number) => {
    const { data } = await supabase
      .from('contract_term_articles')
      .select('*')
      .eq('terms_id', termsId)
      .order('article_number', { ascending: true })
    if (data) setArticles(data)
  }, [])

  const fetchSpecialTerms = useCallback(async () => {
    if (!companyId) return
    const { data } = await supabase
      .from('contract_special_terms')
      .select('*')
      .eq('company_id', companyId)
      .eq('contract_category', selectedCategory)
      .order('sort_order', { ascending: true })
    if (data) setSpecialTerms(data)
  }, [companyId, selectedCategory])

  const fetchHistory = useCallback(async (termsId: number) => {
    const { data } = await supabase
      .from('contract_term_history')
      .select('*')
      .eq('terms_id', termsId)
      .order('changed_at', { ascending: false })
      .limit(50)
    if (data) setHistory(data)
  }, [])

  const fetchInsuranceCoverage = useCallback(async (termsId: number) => {
    const { data } = await supabase
      .from('contract_terms')
      .select('insurance_coverage')
      .eq('id', termsId)
      .single()
    if (data?.insurance_coverage && Array.isArray(data.insurance_coverage)) {
      setInsuranceCoverage(data.insurance_coverage)
    } else {
      setInsuranceCoverage([])
    }
  }, [])

  const fetchQuoteNotices = useCallback(async (termsId: number) => {
    const { data } = await supabase
      .from('contract_terms')
      .select('quote_notices')
      .eq('id', termsId)
      .single()
    if (data?.quote_notices && Array.isArray(data.quote_notices)) {
      setQuoteNotices(data.quote_notices)
    } else {
      setQuoteNotices([])
    }
  }, [])

  const fetchCalcParams = useCallback(async (termsId: number) => {
    const { data } = await supabase
      .from('contract_terms')
      .select('calc_params')
      .eq('id', termsId)
      .single()
    if (data?.calc_params && typeof data.calc_params === 'object') {
      setCalcParams(data.calc_params)
    } else {
      setCalcParams({})
    }
  }, [])

  useEffect(() => {
    fetchTermsSets()
    fetchSpecialTerms()
    setSelectedTerms(null) // Reset selected terms when category changes
  }, [fetchTermsSets, fetchSpecialTerms])

  useEffect(() => {
    if (selectedTerms) {
      fetchArticles(selectedTerms.id)
      fetchHistory(selectedTerms.id)
      fetchInsuranceCoverage(selectedTerms.id)
      fetchQuoteNotices(selectedTerms.id)
      fetchCalcParams(selectedTerms.id)
    }
  }, [selectedTerms, fetchArticles, fetchHistory, fetchInsuranceCoverage, fetchQuoteNotices, fetchCalcParams])

  /* ────────── 약관 버전 CRUD ────────── */
  const handleCreateVersion = async () => {
    if (!companyId || !newVersion.version) return alert('버전명을 입력해주세요')
    const { data, error } = await supabase
      .from('contract_terms')
      .insert({
        company_id: companyId,
        version: newVersion.version,
        title: newVersion.title,
        description: newVersion.description || null,
        effective_from: newVersion.effective_from || null,
        status: 'draft',
        contract_category: selectedCategory,
        created_by: profile?.id || null,
      })
      .select()
      .single()

    if (error) return alert('생성 실패: ' + error.message)

    // 이력 기록
    await supabase.from('contract_term_history').insert({
      terms_id: data.id,
      action: 'created',
      new_value: JSON.stringify({ version: newVersion.version, title: newVersion.title }),
      changed_by: profile?.id || null,
      reason: '신규 약관 버전 생성',
    })

    setShowNewForm(false)
    setNewVersion({ version: '', title: '자동차 장기대여 약관', description: '', effective_from: '' })
    fetchTermsSets()
  }

  const handleCloneVersion = async (source: TermsSet) => {
    const versionName = prompt('새 버전명을 입력하세요 (예: v2.0):', `${source.version}-복사`)
    if (!versionName) return

    // 1. 약관 세트 복사
    const { data: newSet, error } = await supabase
      .from('contract_terms')
      .insert({
        company_id: companyId,
        version: versionName,
        title: source.title,
        description: `${source.version}에서 복사`,
        status: 'draft',
        contract_category: selectedCategory,
        created_by: profile?.id || null,
      })
      .select()
      .single()

    if (error) return alert('복사 실패: ' + error.message)

    // 2. 조항 복사
    const { data: srcArticles } = await supabase
      .from('contract_term_articles')
      .select('*')
      .eq('terms_id', source.id)
      .order('article_number')

    if (srcArticles?.length) {
      const copies = srcArticles.map(a => ({
        terms_id: newSet.id,
        article_number: a.article_number,
        title: a.title,
        content: a.content,
        category: a.category,
        sort_order: a.sort_order,
        is_required: a.is_required,
      }))
      await supabase.from('contract_term_articles').insert(copies)
    }

    // 이력
    await supabase.from('contract_term_history').insert({
      terms_id: newSet.id,
      action: 'created',
      new_value: JSON.stringify({ cloned_from: source.version }),
      changed_by: profile?.id || null,
      reason: `${source.version}에서 복사하여 생성`,
    })

    alert(`✅ "${versionName}" 버전이 생성되었습니다`)
    fetchTermsSets()
  }

  const handleActivate = async (terms: TermsSet) => {
    if (!confirm(`"${terms.version}" 약관을 활성화하시겠습니까?\n기존 활성 약관은 자동으로 보관 처리됩니다.`)) return

    // 기존 active → archived
    await supabase
      .from('contract_terms')
      .update({ status: 'archived', effective_to: new Date().toISOString().slice(0, 10) })
      .eq('company_id', companyId)
      .eq('status', 'active')

    // 선택 버전 → active
    const { error } = await supabase
      .from('contract_terms')
      .update({
        status: 'active',
        effective_from: terms.effective_from || new Date().toISOString().slice(0, 10),
        effective_to: null,
      })
      .eq('id', terms.id)

    if (error) return alert('활성화 실패: ' + error.message)

    await supabase.from('contract_term_history').insert({
      terms_id: terms.id,
      action: 'activated',
      changed_by: profile?.id || null,
      reason: '약관 활성화',
    })

    alert(`✅ "${terms.version}" 약관이 활성화되었습니다`)
    fetchTermsSets()
    if (selectedTerms?.id === terms.id) setSelectedTerms({ ...terms, status: 'active' })
  }

  const handleArchive = async (terms: TermsSet) => {
    if (!confirm(`"${terms.version}" 약관을 보관 처리하시겠습니까?`)) return
    await supabase.from('contract_terms').update({ status: 'archived', effective_to: new Date().toISOString().slice(0, 10) }).eq('id', terms.id)
    await supabase.from('contract_term_history').insert({ terms_id: terms.id, action: 'archived', changed_by: profile?.id || null, reason: '약관 보관 처리' })
    fetchTermsSets()
    if (selectedTerms?.id === terms.id) setSelectedTerms({ ...terms, status: 'archived' })
  }

  /* ────────── 조항 CRUD ────────── */
  const handleSaveArticle = async () => {
    if (!selectedTerms) return
    if (!articleForm.title || !articleForm.content) return alert('제목과 내용을 입력해주세요')

    if (editingArticle) {
      // 수정
      const { error } = await supabase
        .from('contract_term_articles')
        .update({
          title: articleForm.title,
          content: articleForm.content,
          category: articleForm.category,
          is_required: articleForm.is_required,
        })
        .eq('id', editingArticle.id)

      if (error) return alert('수정 실패: ' + error.message)

      await supabase.from('contract_term_history').insert({
        terms_id: selectedTerms.id,
        article_id: editingArticle.id,
        action: 'article_updated',
        old_value: JSON.stringify({ title: editingArticle.title, content: editingArticle.content }),
        new_value: JSON.stringify({ title: articleForm.title, content: articleForm.content }),
        changed_by: profile?.id || null,
      })
    } else {
      // 추가
      const nextNum = articles.length > 0 ? Math.max(...articles.map(a => a.article_number)) + 1 : 1
      const { data: newArt, error } = await supabase
        .from('contract_term_articles')
        .insert({
          terms_id: selectedTerms.id,
          article_number: nextNum,
          title: articleForm.title,
          content: articleForm.content,
          category: articleForm.category,
          is_required: articleForm.is_required,
          sort_order: nextNum * 10,
        })
        .select()
        .single()

      if (error) return alert('추가 실패: ' + error.message)

      await supabase.from('contract_term_history').insert({
        terms_id: selectedTerms.id,
        article_id: newArt.id,
        action: 'article_added',
        new_value: JSON.stringify({ article_number: nextNum, title: articleForm.title }),
        changed_by: profile?.id || null,
      })
    }

    setEditingArticle(null)
    setArticleForm({ title: '', content: '', category: 'general', is_required: true })
    fetchArticles(selectedTerms.id)
    fetchHistory(selectedTerms.id)
  }

  const handleDeleteArticle = async (article: Article) => {
    if (!selectedTerms) return
    if (!confirm(`"${article.title}" 조항을 삭제하시겠습니까?`)) return

    await supabase.from('contract_term_articles').delete().eq('id', article.id)
    await supabase.from('contract_term_history').insert({
      terms_id: selectedTerms.id,
      article_id: null,
      action: 'article_deleted',
      old_value: JSON.stringify({ article_number: article.article_number, title: article.title }),
      changed_by: profile?.id || null,
    })

    fetchArticles(selectedTerms.id)
    fetchHistory(selectedTerms.id)
  }

  const startEditArticle = (article: Article) => {
    setEditingArticle(article)
    setArticleForm({
      title: article.title,
      content: article.content,
      category: article.category,
      is_required: article.is_required,
    })
    // 편집 폼이 보이도록 살짝 스크롤
    setTimeout(() => {
      articleFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 100)
  }

  /* ────────── 특약 CRUD ────────── */
  const handleSaveSpecial = async () => {
    if (!companyId || !specialForm.label || !specialForm.content) return alert('필수 항목을 입력해주세요')

    if (editingSpecial) {
      await supabase.from('contract_special_terms').update({
        label: specialForm.label,
        content: specialForm.content,
        contract_type: specialForm.contract_type,
        is_default: specialForm.is_default,
      }).eq('id', editingSpecial.id)
    } else {
      await supabase.from('contract_special_terms').insert({
        company_id: companyId,
        label: specialForm.label,
        content: specialForm.content,
        contract_type: specialForm.contract_type,
        is_default: specialForm.is_default,
        sort_order: specialTerms.length * 10,
      })
    }

    setEditingSpecial(null)
    setSpecialForm({ label: '', content: '', contract_type: 'all', is_default: false })
    fetchSpecialTerms()
  }

  const handleDeleteSpecial = async (item: SpecialTerm) => {
    if (!confirm(`"${item.label}" 특약을 삭제하시겠습니까?`)) return
    await supabase.from('contract_special_terms').delete().eq('id', item.id)
    fetchSpecialTerms()
  }

  /* ────────── 보험 보장내역 CRUD ────────── */
  const handleSaveInsuranceCoverage = async () => {
    if (!selectedTerms) return
    if (editingCoverageIndex !== null) {
      if (!coverageForm.label || !coverageForm.description) return alert('모든 필드를 입력해주세요')
      const updated = [...insuranceCoverage]
      updated[editingCoverageIndex] = coverageForm
      setInsuranceCoverage(updated)
      setEditingCoverageIndex(null)
    } else {
      if (!coverageForm.label || !coverageForm.description) return alert('모든 필드를 입력해주세요')
      setInsuranceCoverage([...insuranceCoverage, coverageForm])
    }
    setCoverageForm({ label: '', description: '' })
  }

  const handleSaveInsuranceCoverageToDb = async () => {
    if (!selectedTerms) return
    const { error } = await supabase
      .from('contract_terms')
      .update({ insurance_coverage: insuranceCoverage })
      .eq('id', selectedTerms.id)
    if (error) return alert('저장 실패: ' + error.message)
    await supabase.from('contract_term_history').insert({
      terms_id: selectedTerms.id,
      action: 'insurance_coverage_updated',
      new_value: JSON.stringify({ count: insuranceCoverage.length }),
      changed_by: profile?.id || null,
      reason: '보험 보장내역 업데이트',
    })
    alert('저장되었습니다')
  }

  const handleDeleteCoverage = (index: number) => {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return
    const updated = insuranceCoverage.filter((_, i) => i !== index)
    setInsuranceCoverage(updated)
  }

  const moveCoverageUp = (index: number) => {
    if (index === 0) return
    const updated = [...insuranceCoverage]
    ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
    setInsuranceCoverage(updated)
  }

  const moveCoverageDown = (index: number) => {
    if (index === insuranceCoverage.length - 1) return
    const updated = [...insuranceCoverage]
    ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
    setInsuranceCoverage(updated)
  }

  /* ────────── 견적 유의사항 CRUD ────────── */
  const handleSaveQuoteNotice = async () => {
    if (editingNoticeIndex !== null) {
      if (typeof noticeForm === 'string' && !noticeForm) return alert('내용을 입력해주세요')
      if (typeof noticeForm === 'object' && (!noticeForm.text)) return alert('내용을 입력해주세요')
      const updated = [...quoteNotices]
      updated[editingNoticeIndex] = noticeCondition ? { text: typeof noticeForm === 'string' ? noticeForm : noticeForm.text, condition: noticeCondition } : (typeof noticeForm === 'string' ? noticeForm : noticeForm.text)
      setQuoteNotices(updated)
      setEditingNoticeIndex(null)
    } else {
      if (typeof noticeForm === 'string' && !noticeForm) return alert('내용을 입력해주세요')
      setQuoteNotices([...quoteNotices, noticeCondition ? { text: typeof noticeForm === 'string' ? noticeForm : noticeForm.text, condition: noticeCondition } : noticeForm])
    }
    setNoticeForm('')
    setNoticeCondition('')
  }

  const handleSaveQuoteNoticesToDb = async () => {
    if (!selectedTerms) return
    const { error } = await supabase
      .from('contract_terms')
      .update({ quote_notices: quoteNotices })
      .eq('id', selectedTerms.id)
    if (error) return alert('저장 실패: ' + error.message)
    await supabase.from('contract_term_history').insert({
      terms_id: selectedTerms.id,
      action: 'quote_notices_updated',
      new_value: JSON.stringify({ count: quoteNotices.length }),
      changed_by: profile?.id || null,
      reason: '견적 유의사항 업데이트',
    })
    alert('저장되었습니다')
  }

  const handleDeleteNotice = (index: number) => {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return
    const updated = quoteNotices.filter((_, i) => i !== index)
    setQuoteNotices(updated)
  }

  const moveNoticeUp = (index: number) => {
    if (index === 0) return
    const updated = [...quoteNotices]
    ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
    setQuoteNotices(updated)
  }

  const moveNoticeDown = (index: number) => {
    if (index === quoteNotices.length - 1) return
    const updated = [...quoteNotices]
    ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
    setQuoteNotices(updated)
  }

  /* ────────── 계산 파라미터 CRUD ────────── */
  const handleSaveCalcParamsToDb = async () => {
    if (!selectedTerms) return
    const { error } = await supabase
      .from('contract_terms')
      .update({ calc_params: calcParams })
      .eq('id', selectedTerms.id)
    if (error) return alert('저장 실패: ' + error.message)
    await supabase.from('contract_term_history').insert({
      terms_id: selectedTerms.id,
      action: 'calc_params_updated',
      new_value: JSON.stringify({ updated_at: new Date().toISOString() }),
      changed_by: profile?.id || null,
      reason: '계산 파라미터 업데이트',
    })
    alert('저장되었습니다')
  }

  const updateParamValue = (path: string, value: any) => {
    const keys = path.split('.')
    const updated = { ...calcParams }
    let current = updated
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {}
      current = current[keys[i]]
    }
    current[keys[keys.length - 1]] = value
    setCalcParams(updated)
  }

  /* ──────────────────────── 렌더링 ──────────────────────── */
  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
        <div style={{ textAlign: 'left' }}>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">📜 계약 약관 관리</h1>
          <p className="text-gray-500 text-sm mt-1">표준약관을 버전별로 관리하고, 계약서 PDF에 자동 반영합니다.</p>
        </div>
      </div>

      {/* 계약 유형 선택 탭 */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {Object.entries(CONTRACT_CATEGORIES).map(([key, { label, emoji }]) => (
          <button
            key={key}
            onClick={() => setSelectedCategory(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              selectedCategory === key
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <span>{emoji}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {([
          ['versions', '약관 버전'],
          ['articles', '조항 편집'],
          ['special', '특약 템플릿'],
          ['insurance', '보험 보장내역'],
          ['notices', '견적 유의사항'],
          ['params', '계산 파라미터'],
          ['history', '변경 이력'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════════════ 탭1: 약관 버전 목록 ═══════════════════ */}
      {tab === 'versions' && (
        <div className="space-y-4">
          {/* 새 버전 생성 */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowNewForm(!showNewForm)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >
              + 새 약관 버전
            </button>
          </div>

          {showNewForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
              <h3 className="font-bold text-gray-800">새 약관 버전 생성</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">버전명 *</label>
                  <input
                    type="text"
                    placeholder="예: v2.0, 2026-03 개정"
                    className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                    value={newVersion.version}
                    onChange={e => setNewVersion(v => ({ ...v, version: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">시행일</label>
                  <input
                    type="date"
                    className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                    value={newVersion.effective_from}
                    onChange={e => setNewVersion(v => ({ ...v, effective_from: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">약관 제목</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                  value={newVersion.title}
                  onChange={e => setNewVersion(v => ({ ...v, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">개정 사유</label>
                <input
                  type="text"
                  placeholder="예: 전기차 배터리 조항 추가"
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                  value={newVersion.description}
                  onChange={e => setNewVersion(v => ({ ...v, description: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowNewForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">취소</button>
                <button onClick={handleCreateVersion} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">생성</button>
              </div>
            </div>
          )}

          {/* 버전 목록 */}
          {loading ? (
            <div className="text-center py-12 text-gray-400">로딩 중...</div>
          ) : termsSets.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <p className="text-gray-500 mb-2">등록된 약관이 없습니다.</p>
              <p className="text-sm text-gray-400">SQL 마이그레이션(030, 031)을 먼저 실행해주세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {termsSets.map(ts => (
                <div
                  key={ts.id}
                  className={`bg-white border rounded-xl p-4 transition hover:shadow-md cursor-pointer ${
                    selectedTerms?.id === ts.id ? 'ring-2 ring-blue-500 border-blue-300' : 'border-gray-200'
                  }`}
                  onClick={() => { setSelectedTerms(ts); setTab('articles') }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_LABELS[ts.status]?.color}`}>
                        {STATUS_LABELS[ts.status]?.label}
                      </span>
                      <h3 className="font-bold text-gray-900">{ts.title}</h3>
                      <span className="text-sm text-gray-500 font-mono">{ts.version}</span>
                    </div>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      {ts.status === 'draft' && (
                        <button onClick={() => handleActivate(ts)} className="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 font-medium">
                          활성화
                        </button>
                      )}
                      {ts.status === 'active' && (
                        <button onClick={() => handleArchive(ts)} className="text-xs bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 font-medium">
                          보관
                        </button>
                      )}
                      <button onClick={() => handleCloneVersion(ts)} className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-medium">
                        복사
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    {ts.description && <span>{ts.description}</span>}
                    {ts.effective_from && <span>시행: {ts.effective_from}</span>}
                    <span>생성: {new Date(ts.created_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ 탭2: 조항 편집 ═══════════════════ */}
      {tab === 'articles' && (
        <div>
          {!selectedTerms ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <p className="text-gray-500">"약관 버전" 탭에서 편집할 약관을 선택해주세요.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 선택된 약관 정보 */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_LABELS[selectedTerms.status]?.color}`}>
                    {STATUS_LABELS[selectedTerms.status]?.label}
                  </span>
                  <h3 className="font-bold">{selectedTerms.title} <span className="text-gray-400 font-mono text-sm ml-1">{selectedTerms.version}</span></h3>
                </div>
                <span className="text-sm text-gray-400">{articles.length}개 조항</span>
              </div>

              {/* 검색 + 카테고리 필터 */}
              <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input
                    type="text"
                    value={articleSearch}
                    onChange={e => setArticleSearch(e.target.value)}
                    placeholder="조항 제목 또는 내용 검색..."
                    className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-steel-500 focus:bg-white transition-colors"
                  />
                  {articleSearch && (
                    <button
                      onClick={() => setArticleSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                    >✕</button>
                  )}
                </div>
                <select
                  value={articleCategoryFilter}
                  onChange={e => setArticleCategoryFilter(e.target.value)}
                  className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none focus:border-steel-500 cursor-pointer"
                >
                  <option value="all">전체 카테고리</option>
                  {Object.entries(CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <span className="text-xs text-gray-400 self-center whitespace-nowrap">
                  {(() => {
                    const q = articleSearch.toLowerCase()
                    const filtered = articles.filter(a => {
                      const matchCategory = articleCategoryFilter === 'all' || a.category === articleCategoryFilter
                      const matchSearch = !q || a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q) || `제${a.article_number}조`.includes(q)
                      return matchCategory && matchSearch
                    })
                    return `${filtered.length}/${articles.length}건`
                  })()}
                </span>
              </div>

              {/* 조항 목록 + 인라인 편집 */}
              <div className="space-y-2">
                {articles.filter(article => {
                  const q = articleSearch.toLowerCase()
                  const matchCategory = articleCategoryFilter === 'all' || article.category === articleCategoryFilter
                  const matchSearch = !q || article.title.toLowerCase().includes(q) || article.content.toLowerCase().includes(q) || `제${article.article_number}조`.includes(q)
                  return matchCategory && matchSearch
                }).map(article => (
                  <div key={article.id}>
                    {/* 조항 카드 */}
                    <div className={`bg-white border rounded-xl p-4 transition ${
                      editingArticle?.id === article.id
                        ? 'border-blue-400 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                              제{article.article_number}조
                            </span>
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                              {CATEGORIES[article.category] || article.category}
                            </span>
                            {!article.is_required && (
                              <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded">선택</span>
                            )}
                          </div>
                          <h4 className="font-bold text-gray-800">{article.title}</h4>
                          {editingArticle?.id !== article.id && (
                            <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{article.content}</p>
                          )}
                        </div>
                        {selectedTerms.status !== 'archived' && (
                          <div className="flex gap-1 ml-3 flex-shrink-0">
                            {editingArticle?.id === article.id ? (
                              <button
                                onClick={() => { setEditingArticle(null); setArticleForm({ title: '', content: '', category: 'general', is_required: true }) }}
                                className="text-xs text-gray-500 hover:bg-gray-100 px-2 py-1 rounded"
                              >
                                접기
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEditArticle(article)}
                                  className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => handleDeleteArticle(article)}
                                  className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded"
                                >
                                  삭제
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 인라인 편집 폼 - 해당 조항 바로 아래 */}
                      {editingArticle?.id === article.id && (
                        <div ref={articleFormRef} className="mt-3 pt-3 border-t border-blue-200 space-y-3">
                          <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                              <label className="text-xs font-medium text-gray-600">조항 제목 *</label>
                              <input
                                type="text"
                                className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                                value={articleForm.title}
                                onChange={e => setArticleForm(f => ({ ...f, title: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">분류</label>
                              <select
                                className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                                value={articleForm.category}
                                onChange={e => setArticleForm(f => ({ ...f, category: e.target.value }))}
                              >
                                {Object.entries(CATEGORIES).map(([k, v]) => (
                                  <option key={k} value={k}>{v}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600">조항 내용 *</label>
                            <textarea
                              rows={8}
                              className="w-full border rounded-lg px-3 py-2 text-sm mt-1 font-mono"
                              value={articleForm.content}
                              onChange={e => setArticleForm(f => ({ ...f, content: e.target.value }))}
                            />
                          </div>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={articleForm.is_required}
                                onChange={e => setArticleForm(f => ({ ...f, is_required: e.target.checked }))}
                                className="rounded"
                              />
                              필수 조항
                            </label>
                            <div className="flex-1" />
                            <button
                              onClick={() => { setEditingArticle(null); setArticleForm({ title: '', content: '', category: 'general', is_required: true }) }}
                              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
                            >
                              취소
                            </button>
                            <button
                              onClick={handleSaveArticle}
                              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                            >
                              수정 저장
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 새 조항 추가 폼 (하단) */}
              {selectedTerms.status !== 'archived' && !editingArticle && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
                  <h3 className="font-bold text-gray-800">새 조항 추가</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-gray-600">조항 제목 *</label>
                      <input
                        type="text"
                        placeholder="예: 계약의 내용"
                        className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                        value={articleForm.title}
                        onChange={e => setArticleForm(f => ({ ...f, title: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">분류</label>
                      <select
                        className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                        value={articleForm.category}
                        onChange={e => setArticleForm(f => ({ ...f, category: e.target.value }))}
                      >
                        {Object.entries(CATEGORIES).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">조항 내용 *</label>
                    <textarea
                      rows={6}
                      placeholder="① 항목1&#10;② 항목2&#10;③ 항목3"
                      className="w-full border rounded-lg px-3 py-2 text-sm mt-1 font-mono"
                      value={articleForm.content}
                      onChange={e => setArticleForm(f => ({ ...f, content: e.target.value }))}
                    />
                    <p className="text-xs text-gray-400 mt-1">줄바꿈으로 항목을 구분합니다. ①②③ 등 원문자를 사용하면 가독성이 좋습니다.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={articleForm.is_required}
                        onChange={e => setArticleForm(f => ({ ...f, is_required: e.target.checked }))}
                        className="rounded"
                      />
                      필수 조항
                    </label>
                    <div className="flex-1" />
                    <button
                      onClick={handleSaveArticle}
                      className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                    >
                      조항 추가
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ 탭3: 특약 템플릿 ═══════════════════ */}
      {tab === 'special' && (
        <div className="space-y-4">
          {/* 특약 목록 */}
          {specialTerms.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <p className="text-gray-500">등록된 특약 템플릿이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {specialTerms.map(item => (
                <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-medium">
                          {CONTRACT_TYPES[item.contract_type] || item.contract_type}
                        </span>
                        {item.is_default && (
                          <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">기본 적용</span>
                        )}
                      </div>
                      <h4 className="font-bold text-gray-800">{item.label}</h4>
                      <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.content}</p>
                    </div>
                    <div className="flex gap-1 ml-3 flex-shrink-0">
                      <button
                        onClick={() => {
                          setEditingSpecial(item)
                          setSpecialForm({
                            label: item.label,
                            content: item.content,
                            contract_type: item.contract_type,
                            is_default: item.is_default,
                          })
                          setTimeout(() => {
                            specialFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          }, 100)
                        }}
                        className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDeleteSpecial(item)}
                        className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 특약 추가/수정 폼 */}
          <div ref={specialFormRef} className={`border rounded-xl p-5 space-y-3 ${editingSpecial ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' : 'bg-gray-50 border-gray-200'}`}>
            <h3 className="font-bold text-gray-800">
              {editingSpecial ? '✏️ 특약 수정' : '새 특약 템플릿 추가'}
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600">템플릿명 *</label>
                <input
                  type="text"
                  placeholder="예: 전기차 배터리 보증 특약"
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                  value={specialForm.label}
                  onChange={e => setSpecialForm(f => ({ ...f, label: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">계약 유형</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                  value={specialForm.contract_type}
                  onChange={e => setSpecialForm(f => ({ ...f, contract_type: e.target.value }))}
                >
                  {Object.entries(CONTRACT_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">특약 내용 *</label>
              <textarea
                rows={4}
                className="w-full border rounded-lg px-3 py-2 text-sm mt-1 font-mono"
                value={specialForm.content}
                onChange={e => setSpecialForm(f => ({ ...f, content: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={specialForm.is_default}
                  onChange={e => setSpecialForm(f => ({ ...f, is_default: e.target.checked }))}
                  className="rounded"
                />
                기본 적용 (해당 유형 계약에 자동 포함)
              </label>
              <div className="flex-1" />
              {editingSpecial && (
                <button
                  onClick={() => { setEditingSpecial(null); setSpecialForm({ label: '', content: '', contract_type: 'all', is_default: false }) }}
                  className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
                >
                  취소
                </button>
              )}
              <button
                onClick={handleSaveSpecial}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                {editingSpecial ? '수정 저장' : '특약 추가'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ 탭5: 보험 보장내역 ═══════════════════ */}
      {tab === 'insurance' && (
        <div>
          {!selectedTerms ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <p className="text-gray-500">"약관 버전" 탭에서 편집할 약관을 선택해주세요.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 선택된 약관 정보 */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_LABELS[selectedTerms.status]?.color}`}>
                    {STATUS_LABELS[selectedTerms.status]?.label}
                  </span>
                  <h3 className="font-bold">{selectedTerms.title} <span className="text-gray-400 font-mono text-sm ml-1">{selectedTerms.version}</span></h3>
                </div>
                <span className="text-sm text-gray-400">{insuranceCoverage.length}개 항목</span>
              </div>

              {/* 보장내역 목록 */}
              <div className="space-y-2">
                {insuranceCoverage.map((item, index) => (
                  <div key={index} className={`bg-white border rounded-xl p-4 transition ${
                    editingCoverageIndex === index
                      ? 'border-blue-400 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        {editingCoverageIndex !== index && (
                          <>
                            <h4 className="font-bold text-gray-800">{item.label}</h4>
                            <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.description}</p>
                          </>
                        )}
                      </div>
                      {selectedTerms.status !== 'archived' && (
                        <div className="flex gap-1 ml-3 flex-shrink-0">
                          {editingCoverageIndex === index ? (
                            <button
                              onClick={() => { setEditingCoverageIndex(null); setCoverageForm({ label: '', description: '' }) }}
                              className="text-xs text-gray-500 hover:bg-gray-100 px-2 py-1 rounded"
                            >
                              접기
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingCoverageIndex(index)
                                  setCoverageForm(item)
                                  setTimeout(() => insuranceFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
                                }}
                                className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
                              >
                                수정
                              </button>
                              <button
                                onClick={() => handleDeleteCoverage(index)}
                                className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded"
                              >
                                삭제
                              </button>
                              <button
                                onClick={() => moveCoverageUp(index)}
                                disabled={index === 0}
                                className="text-xs text-gray-400 hover:bg-gray-100 px-2 py-1 rounded disabled:opacity-50"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => moveCoverageDown(index)}
                                disabled={index === insuranceCoverage.length - 1}
                                className="text-xs text-gray-400 hover:bg-gray-100 px-2 py-1 rounded disabled:opacity-50"
                              >
                                ↓
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 인라인 편집 폼 */}
                    {editingCoverageIndex === index && (
                      <div className="mt-3 pt-3 border-t border-blue-200 space-y-3">
                        <div>
                          <label className="text-xs font-medium text-gray-600">보장 항목명 *</label>
                          <input
                            type="text"
                            placeholder="예: 차량손해보험"
                            className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                            value={coverageForm.label}
                            onChange={e => setCoverageForm(f => ({ ...f, label: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">
                            설명 *
                            <span className="text-gray-400 text-xs ml-2">{'{'} deductible {'}'}를 사용하면 면책금이 자동 대체됩니다</span>
                          </label>
                          <textarea
                            rows={4}
                            placeholder="예: 차량 손해에 대한 보험 {deductible}원 면책금 적용"
                            className="w-full border rounded-lg px-3 py-2 text-sm mt-1 font-mono"
                            value={coverageForm.description}
                            onChange={e => setCoverageForm(f => ({ ...f, description: e.target.value }))}
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => { setEditingCoverageIndex(null); setCoverageForm({ label: '', description: '' }) }}
                            className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
                          >
                            취소
                          </button>
                          <button
                            onClick={handleSaveInsuranceCoverage}
                            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                          >
                            수정 저장
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 새 항목 추가 폼 */}
              {selectedTerms.status !== 'archived' && editingCoverageIndex === null && (
                <div ref={insuranceFormRef} className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
                  <h3 className="font-bold text-gray-800">새 보장내역 추가</h3>
                  <div>
                    <label className="text-xs font-medium text-gray-600">보장 항목명 *</label>
                    <input
                      type="text"
                      placeholder="예: 차량손해보험"
                      className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                      value={coverageForm.label}
                      onChange={e => setCoverageForm(f => ({ ...f, label: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">
                      설명 *
                      <span className="text-gray-400 text-xs ml-2">{'{'} deductible {'}'}를 사용하면 면책금이 자동 대체됩니다</span>
                    </label>
                    <textarea
                      rows={4}
                      placeholder="예: 차량 손해에 대한 보험 {deductible}원 면책금 적용"
                      className="w-full border rounded-lg px-3 py-2 text-sm mt-1 font-mono"
                      value={coverageForm.description}
                      onChange={e => setCoverageForm(f => ({ ...f, description: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={handleSaveInsuranceCoverage}
                      className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                    >
                      항목 추가
                    </button>
                  </div>
                </div>
              )}

              {/* 저장 버튼 */}
              {selectedTerms.status !== 'archived' && (
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveInsuranceCoverageToDb}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition"
                  >
                    저장
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ 탭6: 견적 유의사항 ═══════════════════ */}
      {tab === 'notices' && (
        <div>
          {!selectedTerms ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <p className="text-gray-500">"약관 버전" 탭에서 편집할 약관을 선택해주세요.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 선택된 약관 정보 */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_LABELS[selectedTerms.status]?.color}`}>
                    {STATUS_LABELS[selectedTerms.status]?.label}
                  </span>
                  <h3 className="font-bold">{selectedTerms.title} <span className="text-gray-400 font-mono text-sm ml-1">{selectedTerms.version}</span></h3>
                </div>
                <span className="text-sm text-gray-400">{quoteNotices.length}개 항목</span>
              </div>

              {/* 유의사항 목록 */}
              <div className="space-y-2">
                {quoteNotices.map((item, index) => {
                  const itemText = typeof item === 'string' ? item : item.text
                  const itemCondition = typeof item === 'object' ? item.condition : undefined
                  return (
                    <div key={index} className={`bg-white border rounded-xl p-4 transition ${
                      editingNoticeIndex === index
                        ? 'border-blue-400 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          {editingNoticeIndex !== index && (
                            <>
                              <div className="flex items-center gap-2 mb-1">
                                {itemCondition && (
                                  <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-medium">
                                    {itemCondition === 'buyout' ? '인수형' : itemCondition}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{itemText}</p>
                            </>
                          )}
                        </div>
                        {selectedTerms.status !== 'archived' && (
                          <div className="flex gap-1 ml-3 flex-shrink-0">
                            {editingNoticeIndex === index ? (
                              <button
                                onClick={() => { setEditingNoticeIndex(null); setNoticeForm(''); setNoticeCondition('') }}
                                className="text-xs text-gray-500 hover:bg-gray-100 px-2 py-1 rounded"
                              >
                                접기
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingNoticeIndex(index)
                                    setNoticeForm(item)
                                    setNoticeCondition(typeof item === 'object' ? item.condition || '' : '')
                                    setTimeout(() => noticeFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
                                  }}
                                  className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => handleDeleteNotice(index)}
                                  className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded"
                                >
                                  삭제
                                </button>
                                <button
                                  onClick={() => moveNoticeUp(index)}
                                  disabled={index === 0}
                                  className="text-xs text-gray-400 hover:bg-gray-100 px-2 py-1 rounded disabled:opacity-50"
                                >
                                  ↑
                                </button>
                                <button
                                  onClick={() => moveNoticeDown(index)}
                                  disabled={index === quoteNotices.length - 1}
                                  className="text-xs text-gray-400 hover:bg-gray-100 px-2 py-1 rounded disabled:opacity-50"
                                >
                                  ↓
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 인라인 편집 폼 */}
                      {editingNoticeIndex === index && (
                        <div className="mt-3 pt-3 border-t border-blue-200 space-y-3">
                          <div>
                            <label className="text-xs font-medium text-gray-600">
                              유의사항 *
                              <span className="text-gray-400 text-xs ml-2">{'{'} deductible {'}'}, {'{'} excessRate {'}'}, {'{'} earlyTerminationRate {'}'} 사용 가능</span>
                            </label>
                            <textarea
                              rows={4}
                              placeholder="예: 면책금 {deductible}원 이상 차량손해는..."
                              className="w-full border rounded-lg px-3 py-2 text-sm mt-1 font-mono"
                              value={typeof noticeForm === 'string' ? noticeForm : noticeForm.text}
                              onChange={e => setNoticeForm(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600">조건 (선택)</label>
                            <select
                              className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                              value={noticeCondition}
                              onChange={e => setNoticeCondition(e.target.value)}
                            >
                              <option value="">조건 없음 (모든 계약 유형)</option>
                              <option value="buyout">인수형만</option>
                            </select>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setEditingNoticeIndex(null); setNoticeForm(''); setNoticeCondition('') }}
                              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
                            >
                              취소
                            </button>
                            <button
                              onClick={handleSaveQuoteNotice}
                              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                            >
                              수정 저장
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 새 항목 추가 폼 */}
              {selectedTerms.status !== 'archived' && editingNoticeIndex === null && (
                <div ref={noticeFormRef} className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
                  <h3 className="font-bold text-gray-800">새 유의사항 추가</h3>
                  <div>
                    <label className="text-xs font-medium text-gray-600">
                      유의사항 *
                      <span className="text-gray-400 text-xs ml-2">{'{'} deductible {'}'}, {'{'} excessRate {'}'}, {'{'} earlyTerminationRate {'}'} 사용 가능</span>
                    </label>
                    <textarea
                      rows={4}
                      placeholder="예: 면책금 {deductible}원 이상 차량손해는..."
                      className="w-full border rounded-lg px-3 py-2 text-sm mt-1 font-mono"
                      value={typeof noticeForm === 'string' ? noticeForm : noticeForm.text || ''}
                      onChange={e => setNoticeForm(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">조건 (선택)</label>
                    <select
                      className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                      value={noticeCondition}
                      onChange={e => setNoticeCondition(e.target.value)}
                    >
                      <option value="">조건 없음 (모든 계약 유형)</option>
                      <option value="buyout">인수형만</option>
                    </select>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={handleSaveQuoteNotice}
                      className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                    >
                      항목 추가
                    </button>
                  </div>
                </div>
              )}

              {/* 저장 버튼 */}
              {selectedTerms.status !== 'archived' && (
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveQuoteNoticesToDb}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition"
                  >
                    저장
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ 탭7: 계산 파라미터 ═══════════════════ */}
      {tab === 'params' && (
        <div>
          {!selectedTerms ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <p className="text-gray-500">"약관 버전" 탭에서 편집할 약관을 선택해주세요.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 선택된 약관 정보 */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_LABELS[selectedTerms.status]?.color}`}>
                    {STATUS_LABELS[selectedTerms.status]?.label}
                  </span>
                  <h3 className="font-bold">{selectedTerms.title} <span className="text-gray-400 font-mono text-sm ml-1">{selectedTerms.version}</span></h3>
                </div>
              </div>

              {selectedTerms.status === 'archived' ? (
                <div className="text-center py-8 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <p className="text-yellow-700">보관된 약관은 편집할 수 없습니다.</p>
                </div>
              ) : (
                <>
                  {/* 섹션 1: 기본 설정 */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedSections(s => ({ ...s, basic: !s.basic }))}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
                    >
                      <h3 className="font-bold text-gray-800">기본 설정</h3>
                      <span className="text-gray-400">{expandedSections.basic ? '▼' : '▶'}</span>
                    </button>
                    {expandedSections.basic && (
                      <div className="p-4 space-y-3 border-t">
                        <div>
                          <label className="text-xs font-medium text-gray-600">조기 해지 수수료율 (%)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                            value={calcParams.early_termination_rate || 0}
                            onChange={e => updateParamValue('early_termination_rate', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">보험 관련 유의사항</label>
                          <textarea
                            rows={3}
                            className="w-full border rounded-lg px-3 py-2 text-sm mt-1 font-mono"
                            value={calcParams.insurance_note || ''}
                            onChange={e => updateParamValue('insurance_note', e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 섹션 2: 보험 기본분담금 */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedSections(s => ({ ...s, ins_base: !s.ins_base }))}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
                    >
                      <h3 className="font-bold text-gray-800">보험 기본분담금 (연)</h3>
                      <span className="text-gray-400">{expandedSections.ins_base ? '▼' : '▶'}</span>
                    </button>
                    {expandedSections.ins_base && (
                      <div className="p-4 space-y-3 border-t">
                        {['경형', '소형', '중형', '대형', '수입'].map(cls => (
                          <div key={cls}>
                            <label className="text-xs font-medium text-gray-600">{cls}</label>
                            <input
                              type="number"
                              step="1"
                              className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                              value={calcParams.ins_base_annual?.[cls] || 0}
                              onChange={e => {
                                if (!calcParams.ins_base_annual) updateParamValue('ins_base_annual', {})
                                updateParamValue(`ins_base_annual.${cls}`, parseInt(e.target.value) || 0)
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 섹션 3: 자차 요율 */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedSections(s => ({ ...s, own_damage: !s.own_damage }))}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
                    >
                      <h3 className="font-bold text-gray-800">자차 요율 (%)</h3>
                      <span className="text-gray-400">{expandedSections.own_damage ? '▼' : '▶'}</span>
                    </button>
                    {expandedSections.own_damage && (
                      <div className="p-4 space-y-3 border-t">
                        {['경형', '소형', '중형', '대형', '수입'].map(cls => (
                          <div key={cls}>
                            <label className="text-xs font-medium text-gray-600">{cls}</label>
                            <input
                              type="number"
                              step="0.01"
                              className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                              value={calcParams.ins_own_damage_rate?.[cls] || 0}
                              onChange={e => {
                                if (!calcParams.ins_own_damage_rate) updateParamValue('ins_own_damage_rate', {})
                                updateParamValue(`ins_own_damage_rate.${cls}`, parseFloat(e.target.value) || 0)
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 섹션 4: 면책금 할인율 */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedSections(s => ({ ...s, deductible_discount: !s.deductible_discount }))}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
                    >
                      <h3 className="font-bold text-gray-800">면책금 할인율</h3>
                      <span className="text-gray-400">{expandedSections.deductible_discount ? '▼' : '▶'}</span>
                    </button>
                    {expandedSections.deductible_discount && (
                      <div className="p-4 space-y-2 border-t">
                        {Object.entries(calcParams.deductible_discount || {}).map(([key, value]) => (
                          <div key={key} className="flex items-end gap-2">
                            <div className="flex-1">
                              <label className="text-xs font-medium text-gray-600">{key}</label>
                              <input
                                type="number"
                                step="0.01"
                                className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                                value={value as number}
                                onChange={e => updateParamValue(`deductible_discount.${key}`, parseFloat(e.target.value) || 0)}
                              />
                            </div>
                            <button
                              onClick={() => {
                                const updated = { ...calcParams.deductible_discount }
                                delete updated[key]
                                updateParamValue('deductible_discount', updated)
                              }}
                              className="text-xs text-red-500 hover:bg-red-50 px-2 py-2 rounded"
                            >
                              삭제
                            </button>
                          </div>
                        ))}
                        <input
                          type="text"
                          placeholder="새 면책금 값 (예: 500000)"
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                  </div>

                  {/* 섹션 5: 운전자 연령 요율 */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedSections(s => ({ ...s, driver_age: !s.driver_age }))}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
                    >
                      <h3 className="font-bold text-gray-800">운전자 연령 요율</h3>
                      <span className="text-gray-400">{expandedSections.driver_age ? '▼' : '▶'}</span>
                    </button>
                    {expandedSections.driver_age && (
                      <div className="p-4 space-y-3 border-t">
                        {Array.isArray(calcParams.driver_age_factors) && calcParams.driver_age_factors.map((factor: any, idx: number) => (
                          <div key={idx} className="border-b pb-3 last:border-b-0">
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-xs font-medium text-gray-600">최소 연령</label>
                                <input
                                  type="number"
                                  className="w-full border rounded-lg px-2 py-2 text-sm mt-1"
                                  value={factor.min_age || 0}
                                  onChange={e => {
                                    const updated = [...(calcParams.driver_age_factors || [])]
                                    updated[idx].min_age = parseInt(e.target.value) || 0
                                    updateParamValue('driver_age_factors', updated)
                                  }}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600">계수</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="w-full border rounded-lg px-2 py-2 text-sm mt-1"
                                  value={factor.factor || 1}
                                  onChange={e => {
                                    const updated = [...(calcParams.driver_age_factors || [])]
                                    updated[idx].factor = parseFloat(e.target.value) || 1
                                    updateParamValue('driver_age_factors', updated)
                                  }}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600">설명</label>
                                <input
                                  type="text"
                                  placeholder="예: 20대"
                                  className="w-full border rounded-lg px-2 py-2 text-sm mt-1"
                                  value={factor.label || ''}
                                  onChange={e => {
                                    const updated = [...(calcParams.driver_age_factors || [])]
                                    updated[idx].label = e.target.value
                                    updateParamValue('driver_age_factors', updated)
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 섹션 6: 차령별 계수 */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedSections(s => ({ ...s, car_age: !s.car_age }))}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
                    >
                      <h3 className="font-bold text-gray-800">차령별 계수</h3>
                      <span className="text-gray-400">{expandedSections.car_age ? '▼' : '▶'}</span>
                    </button>
                    {expandedSections.car_age && (
                      <div className="p-4 space-y-3 border-t">
                        {Array.isArray(calcParams.car_age_factors) && calcParams.car_age_factors.map((factor: any, idx: number) => (
                          <div key={idx} className="grid grid-cols-2 gap-2 pb-3 border-b last:border-b-0">
                            <div>
                              <label className="text-xs font-medium text-gray-600">최대 차령 (년)</label>
                              <input
                                type="number"
                                className="w-full border rounded-lg px-2 py-2 text-sm mt-1"
                                value={factor.max_age || 0}
                                onChange={e => {
                                  const updated = [...(calcParams.car_age_factors || [])]
                                  updated[idx].max_age = parseInt(e.target.value) || 0
                                  updateParamValue('car_age_factors', updated)
                                }}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">계수</label>
                              <input
                                type="number"
                                step="0.01"
                                className="w-full border rounded-lg px-2 py-2 text-sm mt-1"
                                value={factor.factor || 1}
                                onChange={e => {
                                  const updated = [...(calcParams.car_age_factors || [])]
                                  updated[idx].factor = parseFloat(e.target.value) || 1
                                  updateParamValue('car_age_factors', updated)
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 섹션 7: 보험 담보별 비중 */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedSections(s => ({ ...s, ins_breakdown: !s.ins_breakdown }))}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
                    >
                      <h3 className="font-bold text-gray-800">보험 담보별 비중</h3>
                      <span className="text-gray-400">{expandedSections.ins_breakdown ? '▼' : '▶'}</span>
                    </button>
                    {expandedSections.ins_breakdown && (
                      <div className="p-4 space-y-3 border-t">
                        {['대물', '대인', '자차', '인명', '도난', '기타'].map(coverage => (
                          <div key={coverage}>
                            <label className="text-xs font-medium text-gray-600">{coverage}</label>
                            <input
                              type="number"
                              step="0.01"
                              className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                              value={calcParams.ins_breakdown_ratios?.[coverage] || 0}
                              onChange={e => {
                                if (!calcParams.ins_breakdown_ratios) updateParamValue('ins_breakdown_ratios', {})
                                updateParamValue(`ins_breakdown_ratios.${coverage}`, parseFloat(e.target.value) || 0)
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 섹션 8: 비영업용 계수 */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedSections(s => ({ ...s, non_commercial: !s.non_commercial }))}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
                    >
                      <h3 className="font-bold text-gray-800">비영업용 계수</h3>
                      <span className="text-gray-400">{expandedSections.non_commercial ? '▼' : '▶'}</span>
                    </button>
                    {expandedSections.non_commercial && (
                      <div className="p-4 space-y-3 border-t">
                        <div>
                          <label className="text-xs font-medium text-gray-600">기본분담금 계수</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                            value={calcParams.non_commercial_base_factor || 1}
                            onChange={e => updateParamValue('non_commercial_base_factor', parseFloat(e.target.value) || 1)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">자차 계수</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                            value={calcParams.non_commercial_own_factor || 1}
                            onChange={e => updateParamValue('non_commercial_own_factor', parseFloat(e.target.value) || 1)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 섹션 9: 초과주행 요금 */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedSections(s => ({ ...s, excess_mileage: !s.excess_mileage }))}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
                    >
                      <h3 className="font-bold text-gray-800">초과주행 요금</h3>
                      <span className="text-gray-400">{expandedSections.excess_mileage ? '▼' : '▶'}</span>
                    </button>
                    {expandedSections.excess_mileage && (
                      <div className="p-4 space-y-2 border-t">
                        {Object.entries(calcParams.excess_mileage_rates || {}).map(([key, value]) => (
                          <div key={key} className="flex items-end gap-2">
                            <div className="flex-1">
                              <label className="text-xs font-medium text-gray-600">{key}</label>
                              <input
                                type="number"
                                step="1"
                                className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                                value={value as number}
                                onChange={e => updateParamValue(`excess_mileage_rates.${key}`, parseInt(e.target.value) || 0)}
                              />
                            </div>
                            <button
                              onClick={() => {
                                const updated = { ...calcParams.excess_mileage_rates }
                                delete updated[key]
                                updateParamValue('excess_mileage_rates', updated)
                              }}
                              className="text-xs text-red-500 hover:bg-red-50 px-2 py-2 rounded"
                            >
                              삭제
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 섹션 10: 중도해지 기간별 */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedSections(s => ({ ...s, early_termination: !s.early_termination }))}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
                    >
                      <h3 className="font-bold text-gray-800">중도해지 기간별 수수료</h3>
                      <span className="text-gray-400">{expandedSections.early_termination ? '▼' : '▶'}</span>
                    </button>
                    {expandedSections.early_termination && (
                      <div className="p-4 space-y-3 border-t">
                        {Array.isArray(calcParams.early_termination_rates_by_period) && calcParams.early_termination_rates_by_period.map((period: any, idx: number) => (
                          <div key={idx} className="grid grid-cols-3 gap-2 pb-3 border-b last:border-b-0">
                            <div>
                              <label className="text-xs font-medium text-gray-600">시작 월</label>
                              <input
                                type="number"
                                className="w-full border rounded-lg px-2 py-2 text-sm mt-1"
                                value={period.months_from || 0}
                                onChange={e => {
                                  const updated = [...(calcParams.early_termination_rates_by_period || [])]
                                  updated[idx].months_from = parseInt(e.target.value) || 0
                                  updateParamValue('early_termination_rates_by_period', updated)
                                }}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">종료 월</label>
                              <input
                                type="number"
                                className="w-full border rounded-lg px-2 py-2 text-sm mt-1"
                                value={period.months_to || 0}
                                onChange={e => {
                                  const updated = [...(calcParams.early_termination_rates_by_period || [])]
                                  updated[idx].months_to = parseInt(e.target.value) || 0
                                  updateParamValue('early_termination_rates_by_period', updated)
                                }}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600">수수료율 (%)</label>
                              <input
                                type="number"
                                step="0.01"
                                className="w-full border rounded-lg px-2 py-2 text-sm mt-1"
                                value={period.rate || 0}
                                onChange={e => {
                                  const updated = [...(calcParams.early_termination_rates_by_period || [])]
                                  updated[idx].rate = parseFloat(e.target.value) || 0
                                  updateParamValue('early_termination_rates_by_period', updated)
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 저장 버튼 */}
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveCalcParamsToDb}
                      className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition"
                    >
                      저장
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ 탭8: 변경 이력 ═══════════════════ */}
      {tab === 'history' && (
        <div>
          {!selectedTerms ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl">
              <p className="text-gray-500">"약관 버전" 탭에서 약관을 선택하면 이력이 표시됩니다.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="mb-4 flex items-center gap-2">
                <span className="font-bold text-gray-700">{selectedTerms.title}</span>
                <span className="text-sm text-gray-400 font-mono">{selectedTerms.version}</span>
                <span className="text-sm text-gray-400">— 최근 50건</span>
              </div>
              {history.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">변경 이력이 없습니다.</div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b text-gray-500 text-xs">
                        <th className="text-left px-4 py-3">일시</th>
                        <th className="text-left px-4 py-3">구분</th>
                        <th className="text-left px-4 py-3">내용</th>
                        <th className="text-left px-4 py-3">사유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(h => {
                        const actionLabels: Record<string, string> = {
                          created: '생성',
                          activated: '활성화',
                          archived: '보관',
                          article_added: '조항 추가',
                          article_updated: '조항 수정',
                          article_deleted: '조항 삭제',
                          insurance_coverage_updated: '보험보장 업데이트',
                          quote_notices_updated: '견적유의 업데이트',
                          calc_params_updated: '계산파라미터 업데이트',
                        }
                        let detail = ''
                        try {
                          const nv = h.new_value ? JSON.parse(h.new_value) : null
                          const ov = h.old_value ? JSON.parse(h.old_value) : null
                          if (nv?.title) detail = nv.title
                          if (nv?.article_number) detail = `제${nv.article_number}조 ${nv.title || ''}`
                          if (ov?.title && h.action === 'article_deleted') detail = `제${ov.article_number}조 ${ov.title}`
                          if (nv?.cloned_from) detail = `${nv.cloned_from}에서 복사`
                          if (nv?.count) detail = `${nv.count}개 항목`
                        } catch { /* */ }

                        return (
                          <tr key={h.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                              {new Date(h.changed_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                h.action.includes('delete') ? 'bg-red-50 text-red-600' :
                                h.action.includes('update') ? 'bg-yellow-50 text-yellow-700' :
                                h.action === 'activated' ? 'bg-green-50 text-green-700' :
                                'bg-blue-50 text-blue-600'
                              }`}>
                                {actionLabels[h.action] || h.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-700">{detail}</td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{h.reason || '-'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
