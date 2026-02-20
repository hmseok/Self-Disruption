'use client'

import { useState, useEffect, useCallback } from 'react'
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

/* ──────────────────────── 메인 컴포넌트 ──────────────────────── */
export default function ContractTermsPage() {
  const { company, profile, role, adminSelectedCompanyId, allCompanies } = useApp()

  // ── 탭 상태 ──
  const [tab, setTab] = useState<'versions' | 'articles' | 'special' | 'history'>('versions')

  // ── 약관 버전 목록 ──
  const [termsSets, setTermsSets] = useState<TermsSet[]>([])
  const [selectedTerms, setSelectedTerms] = useState<TermsSet | null>(null)
  const [loading, setLoading] = useState(false)

  // ── 조항 ──
  const [articles, setArticles] = useState<Article[]>([])
  const [editingArticle, setEditingArticle] = useState<Article | null>(null)
  const [articleForm, setArticleForm] = useState({ title: '', content: '', category: 'general', is_required: true })

  // ── 특약 ──
  const [specialTerms, setSpecialTerms] = useState<SpecialTerm[]>([])
  const [editingSpecial, setEditingSpecial] = useState<SpecialTerm | null>(null)
  const [specialForm, setSpecialForm] = useState({ label: '', content: '', contract_type: 'all' as string, is_default: false })

  // ── 이력 ──
  const [history, setHistory] = useState<HistoryEntry[]>([])

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
      .order('created_at', { ascending: false })
    if (!error && data) setTermsSets(data)
    else if (error) console.error('[약관] 에러:', error)
    setLoading(false)
  }, [companyId])

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
      .order('sort_order', { ascending: true })
    if (data) setSpecialTerms(data)
  }, [companyId])

  const fetchHistory = useCallback(async (termsId: number) => {
    const { data } = await supabase
      .from('contract_term_history')
      .select('*')
      .eq('terms_id', termsId)
      .order('changed_at', { ascending: false })
      .limit(50)
    if (data) setHistory(data)
  }, [])

  useEffect(() => {
    fetchTermsSets()
    fetchSpecialTerms()
  }, [fetchTermsSets, fetchSpecialTerms])

  useEffect(() => {
    if (selectedTerms) {
      fetchArticles(selectedTerms.id)
      fetchHistory(selectedTerms.id)
    }
  }, [selectedTerms, fetchArticles, fetchHistory])

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

  /* ──────────────────────── 렌더링 ──────────────────────── */
  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">계약 약관 관리</h1>
        <p className="text-sm text-gray-500 mt-1">장기렌트 표준약관을 버전별로 관리하고, 계약서 PDF에 자동 반영합니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        {([
          ['versions', '약관 버전'],
          ['articles', '조항 편집'],
          ['special', '특약 템플릿'],
          ['history', '변경 이력'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
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

              {/* 조항 목록 */}
              <div className="space-y-2">
                {articles.map(article => (
                  <div key={article.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition">
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
                        <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{article.content}</p>
                      </div>
                      {selectedTerms.status !== 'archived' && (
                        <div className="flex gap-1 ml-3 flex-shrink-0">
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
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 조항 추가/수정 폼 */}
              {selectedTerms.status !== 'archived' && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
                  <h3 className="font-bold text-gray-800">
                    {editingArticle ? `제${editingArticle.article_number}조 수정` : '새 조항 추가'}
                  </h3>
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
                    {editingArticle && (
                      <button
                        onClick={() => { setEditingArticle(null); setArticleForm({ title: '', content: '', category: 'general', is_required: true }) }}
                        className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
                      >
                        취소
                      </button>
                    )}
                    <button
                      onClick={handleSaveArticle}
                      className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                    >
                      {editingArticle ? '수정 저장' : '조항 추가'}
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
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
            <h3 className="font-bold text-gray-800">
              {editingSpecial ? '특약 수정' : '새 특약 템플릿 추가'}
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

      {/* ═══════════════════ 탭4: 변경 이력 ═══════════════════ */}
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
                        }
                        let detail = ''
                        try {
                          const nv = h.new_value ? JSON.parse(h.new_value) : null
                          const ov = h.old_value ? JSON.parse(h.old_value) : null
                          if (nv?.title) detail = nv.title
                          if (nv?.article_number) detail = `제${nv.article_number}조 ${nv.title || ''}`
                          if (ov?.title && h.action === 'article_deleted') detail = `제${ov.article_number}조 ${ov.title}`
                          if (nv?.cloned_from) detail = `${nv.cloned_from}에서 복사`
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
