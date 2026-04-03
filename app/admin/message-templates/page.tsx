'use client'

import { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useRouter } from 'next/navigation'

// ────────────────────────────────────────────────────────────────
// Auth Helper
// ────────────────────────────────────────────────────────────────
async function getAuthHeader(): Promise<Record<string, string>> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('sb-auth-token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ============================================
// 메시지 센터 (메시지 템플릿 + 발송 이력)
// ============================================

type VariableMeta = {
  key: string
  label: string
  example: string
  required: boolean
}

type MessageTemplate = {
  id: string
  template_key: string
  name: string
  description: string
  channel: 'sms' | 'kakao' | 'email' | 'push'
  category: string
  subject: string | null
  body: string
  variables_meta: VariableMeta[] | null
  kakao_template_code: string | null
  kakao_button_json: any | null
  html_template: string | null
  push_data: any | null
  is_active: boolean
  is_system: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

type MessageSendLog = {
  id: string
  template_key: string
  channel: 'sms' | 'kakao' | 'email' | 'push'
  recipient: string
  recipient_name: string | null
  subject: string | null
  body: string
  status: 'pending' | 'sent' | 'failed'
  result_code: string | null
  result_message: string | null
  error_detail: string | null
  related_type: string | null
  related_id: string | null
  sent_by: string | null
  sent_at: string
  created_at: string
}

type TemplateWithCount = MessageTemplate & {
  sendCount?: number
}

// 아이콘
const ChevronDown = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
const ChevronUp = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
const PlusIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
const EditIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
const TrashIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
const EyeIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>

const CHANNELS = [
  { value: 'all', label: '전체', icon: '📱' },
  { value: 'sms', label: 'SMS', icon: '📤', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'kakao', label: '카카오', icon: '💬', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'email', label: '이메일', icon: '📧', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'push', label: '푸시', icon: '🔔', color: 'bg-green-100 text-green-700 border-green-200' },
]

const CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  member: { label: '멤버 관리', icon: '👥', color: 'bg-indigo-50 border-indigo-200' },
  contract: { label: '계약 관리', icon: '📝', color: 'bg-emerald-50 border-emerald-200' },
  quote: { label: '견적서 관리', icon: '💰', color: 'bg-amber-50 border-amber-200' },
  payment: { label: '납부/정산', icon: '💳', color: 'bg-rose-50 border-rose-200' },
  vehicle: { label: '차량 관리', icon: '🚗', color: 'bg-cyan-50 border-cyan-200' },
  notification: { label: '알림/공지', icon: '📢', color: 'bg-orange-50 border-orange-200' },
  general: { label: '기타', icon: '📋', color: 'bg-slate-50 border-slate-200' },
}

const CATEGORY_ORDER = ['member', 'contract', 'quote', 'payment', 'vehicle', 'notification', 'general']

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-green-100 text-green-700 border-green-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
}

export default function MessageTemplatesPage() {
  const router = useRouter()
  const { company, role, loading: appLoading } = useApp()

  // 권한 확인
  useEffect(() => {
    if (!appLoading && role !== 'admin') {
      alert('접근 권한이 없습니다.')
      router.replace('/dashboard')
    }
  }, [appLoading, role, router])

  // 탭 상태
  const [activeTab, setActiveTab] = useState<'templates' | 'history'>('templates')
  const [selectedChannel, setSelectedChannel] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [isCreateMode, setIsCreateMode] = useState(false)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  // 데이터 상태
  const [templates, setTemplates] = useState<TemplateWithCount[]>([])
  const [logs, setLogs] = useState<MessageSendLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 필터 상태
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [filterRecipient, setFilterRecipient] = useState('')
  const [filterTemplateKey, setFilterTemplateKey] = useState('')

  // 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  const companyId = company?.id

  // 템플릿 로드
  const loadTemplates = async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/message_templates', { headers: await getAuthHeader() })
      const json = await res.json()
      const { data, error: fetchError } = json

      if (fetchError) {
        if (fetchError.code === '42P01' || fetchError.message?.includes('does not exist')) {
          console.warn('[메시지센터] message_templates 테이블 미존재 — SQL 마이그레이션 필요')
          setTemplates([])
          setError('메시지 템플릿 테이블이 아직 생성되지 않았습니다. SQL 마이그레이션(052, 053)을 실행해주세요.')
          setLoading(false)
          return
        }
        throw fetchError
      }

      // 각 템플릿의 발송 개수 조회
      const templatesWithCount = await Promise.all(
        (data || []).map(async (template: any) => {
          const res = await fetch(`/api/message_send_logs?template_key=${template.template_key}`, { headers: await getAuthHeader() })
          const json = await res.json()
          const count = json?.data?.length || 0

          return {
            ...template,
            sendCount: count,
          }
        })
      )

      setTemplates(templatesWithCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : '템플릿 로드 실패')
      console.error(err)
    }
    setLoading(false)
  }

  // 발송 이력 로드
  const loadLogs = async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (selectedStatus !== 'all') params.append('status', selectedStatus)
      if (selectedChannel !== 'all') params.append('channel', selectedChannel)
      if (dateRange.from) params.append('from', dateRange.from)
      if (dateRange.to) params.append('to', dateRange.to)
      if (filterRecipient) params.append('recipient', filterRecipient)
      if (filterTemplateKey) params.append('template_key', filterTemplateKey)

      const res = await fetch(`/api/message_send_logs?${params.toString()}`, { headers: await getAuthHeader() })
      const json = await res.json()
      const { data, error: fetchError } = json

      if (fetchError) {
        throw fetchError
      }

      setLogs(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '이력 로드 실패')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!appLoading && companyId) {
      if (activeTab === 'templates') loadTemplates()
      else loadLogs()
    } else if (!appLoading && !companyId) {
      setLoading(false)
    }
  }, [appLoading, companyId, activeTab, selectedChannel, selectedStatus, dateRange, filterRecipient, filterTemplateKey])

  // 템플릿 저장/수정
  const saveTemplate = async (template: Partial<MessageTemplate>) => {
    if (!companyId || !template.template_key || !template.name || !template.body || !template.channel) {
      alert('필수 항목을 입력하세요.')
      return
    }

    try {
      if (editingTemplate && editingTemplate.id) {
        const res = await fetch(`/api/message_templates/${editingTemplate.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({
            ...template,
            updated_at: new Date().toISOString(),
          })
        })
        const json = await res.json()
        const error = json?.error
        if (error) throw error
      } else {
        const res = await fetch('/api/message_templates', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({
            ...template,
            sort_order: templates.length,
            is_active: true,
            is_system: false,
          })
        })
        const json = await res.json()
        const error = json?.error
        if (error) throw error
      }

      setIsModalOpen(false)
      setEditingTemplate(null)
      setIsCreateMode(false)
      loadTemplates()
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장 실패')
    }
  }

  // 템플릿 삭제
  const deleteTemplate = async (id: string) => {
    if (!confirm('이 템플릿을 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/message_templates/${id}`, { method: 'DELETE', headers: await getAuthHeader() })
      const json = await res.json()
      const error = json?.error
      if (error) throw error
      loadTemplates()
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  // 활성화 토글
  const toggleTemplate = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/message_templates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({ is_active: !isActive }) })
      const json = await res.json()
      const error = json?.error
      if (error) throw error
      loadTemplates()
    } catch (err) {
      alert(err instanceof Error ? err.message : '업데이트 실패')
    }
  }

  // 변수 추출 ({{변수명}} 형식)
  const extractVariables = (text: string): string[] => {
    const regex = /\{\{([^}]+)\}\}/g
    const matches = text.match(regex) || []
    return [...new Set(matches)].sort()
  }

  // 미리보기 렌더링 (변수를 예시값으로 치환)
  const renderPreview = (text: string, variablesMeta: VariableMeta[] | null): string => {
    if (!variablesMeta || variablesMeta.length === 0) return text
    let result = text
    variablesMeta.forEach((v) => {
      result = result.replaceAll(`{{${v.key}}}`, v.example || `[${v.label}]`)
    })
    return result
  }

  // 채널 배지
  const getChannelBadge = (channel: string) => {
    const ch = CHANNELS.find((c) => c.value === channel)
    if (!ch) return null
    return (
      <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${ch.color}`}>
        {ch.icon} {ch.label}
      </span>
    )
  }

  // 카테고리별 템플릿 그룹핑
  const groupedTemplates = () => {
    const filtered = templates.filter((t) => {
      if (selectedChannel !== 'all' && t.channel !== selectedChannel) return false
      if (selectedCategory !== 'all' && t.category !== selectedCategory) return false
      return true
    })

    const groups: Record<string, TemplateWithCount[]> = {}
    filtered.forEach((t) => {
      const cat = t.category || 'general'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(t)
    })

    return CATEGORY_ORDER
      .filter((cat) => groups[cat] && groups[cat].length > 0)
      .map((cat) => ({ category: cat, templates: groups[cat] }))
  }

  // 카테고리 토글
  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const variables = editingTemplate ? extractVariables(editingTemplate.body + (editingTemplate.subject || '')) : []

  if (appLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600 mx-auto mb-4"></div>
          <p className="text-sm text-slate-400">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'left' }}>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">💬 메시지 센터</h1>
            <p className="text-gray-500 text-sm mt-1">SMS · 카카오 알림톡 · 이메일 · 앱 푸시 통합 관리</p>
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* 탭 */}
        <div className="flex gap-2 mb-6 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-3 text-sm font-bold rounded-t-2xl transition-all ${
              activeTab === 'templates'
                ? 'bg-white text-steel-600 border-b-2 border-steel-600'
                : 'text-slate-500 hover:text-slate-600'
            }`}
          >
            템플릿 관리
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-sm font-bold rounded-t-2xl transition-all ${
              activeTab === 'history'
                ? 'bg-white text-steel-600 border-b-2 border-steel-600'
                : 'text-slate-500 hover:text-slate-600'
            }`}
          >
            발송 이력
          </button>
        </div>

        {/* =============================================
            탭 1: 템플릿 관리 (카테고리별 그룹핑)
            ============================================= */}
        {activeTab === 'templates' && (
          <div>
            {/* 필터 + 버튼 */}
            <div className="flex flex-col gap-3 mb-6">
              {/* 채널 필터 */}
              <div className="flex flex-col md:flex-row gap-3 justify-between items-start md:items-center">
                <div className="flex gap-2 flex-wrap">
                  {CHANNELS.map((ch) => (
                    <button
                      key={ch.value}
                      onClick={() => setSelectedChannel(ch.value)}
                      className={`px-4 py-2 text-sm font-bold rounded-full transition-all ${
                        selectedChannel === ch.value
                          ? 'bg-steel-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-steel-300'
                      }`}
                    >
                      {ch.icon} {ch.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setIsCreateMode(true)
                    setEditingTemplate({
                      id: '',
                      
                      template_key: '',
                      name: '',
                      description: '',
                      channel: 'sms',
                      category: 'general',
                      subject: null,
                      body: '',
                      variables_meta: [],
                      kakao_template_code: null,
                      kakao_button_json: null,
                      html_template: null,
                      push_data: null,
                      is_active: true,
                      is_system: false,
                      sort_order: 0,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    })
                    setIsModalOpen(true)
                  }}
                  className="bg-steel-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-steel-700 flex items-center gap-2 whitespace-nowrap"
                >
                  <PlusIcon /> 새 템플릿
                </button>
              </div>

              {/* 카테고리 필터 */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all ${
                    selectedCategory === 'all'
                      ? 'bg-gray-800 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'
                  }`}
                >
                  전체 카테고리
                </button>
                {CATEGORY_ORDER.map((cat) => {
                  const catInfo = CATEGORIES[cat]
                  const count = templates.filter((t) => (t.category || 'general') === cat).length
                  if (count === 0) return null
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all ${
                        selectedCategory === cat
                          ? 'bg-gray-800 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {catInfo.icon} {catInfo.label} ({count})
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 카테고리별 그룹 카드 */}
            {templates.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                <p className="text-slate-400 text-lg">등록된 템플릿이 없습니다.</p>
                <p className="text-slate-400 text-sm mt-2">SQL 마이그레이션(052, 053)을 실행하면 기본 템플릿이 자동 생성됩니다.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {groupedTemplates().map(({ category, templates: catTemplates }) => {
                  const catInfo = CATEGORIES[category] || CATEGORIES.general
                  const isCollapsed = collapsedCategories.has(category)

                  return (
                    <div key={category} className={`rounded-2xl border ${catInfo.color} overflow-hidden`}>
                      {/* 카테고리 헤더 */}
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{catInfo.icon}</span>
                          <span className="text-base font-black text-gray-900">{catInfo.label}</span>
                          <span className="text-xs font-bold text-slate-500 bg-white/70 px-2 py-0.5 rounded-full">
                            {catTemplates.length}개
                          </span>
                        </div>
                        <div className="text-slate-400">
                          {isCollapsed ? <ChevronDown /> : <ChevronUp />}
                        </div>
                      </button>

                      {/* 카테고리 내 템플릿 목록 */}
                      {!isCollapsed && (
                        <div className="px-3 pb-3 grid gap-3">
                          {catTemplates.map((template) => (
                            <div
                              key={template.id}
                              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md"
                            >
                              {/* 템플릿 헤더 */}
                              <div
                                className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                                onClick={() => setExpandedTemplate(expandedTemplate === template.id ? null : template.id)}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                      <h3 className="text-sm md:text-base font-black text-gray-900 truncate">{template.name}</h3>
                                      {getChannelBadge(template.channel)}
                                      {template.is_system && (
                                        <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded">시스템</span>
                                      )}
                                    </div>
                                    <div className="flex gap-2 items-center flex-wrap">
                                      <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                        {template.template_key}
                                      </span>
                                      <span className="text-[10px] font-bold text-slate-400">
                                        발송 {template.sendCount || 0}건
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        toggleTemplate(template.id, template.is_active)
                                      }}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                        template.is_active
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      {template.is_active ? '활성' : '비활성'}
                                    </button>
                                    <div className="text-slate-400">
                                      {expandedTemplate === template.id ? <ChevronUp /> : <ChevronDown />}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* 확장 영역 */}
                              {expandedTemplate === template.id && (
                                <div className="border-t border-slate-200 p-4 bg-slate-50/50">
                                  <div className="grid grid-cols-1 gap-4">
                                    {/* 설명 */}
                                    {template.description && (
                                      <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase">설명</label>
                                        <p className="text-sm text-slate-600 mt-1">{template.description}</p>
                                      </div>
                                    )}

                                    {/* 제목 */}
                                    {template.subject && (
                                      <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase">제목</label>
                                        <p className="text-sm text-slate-700 mt-1 break-words font-mono bg-white p-2 rounded border border-slate-200">
                                          {template.subject}
                                        </p>
                                      </div>
                                    )}

                                    {/* 본문 */}
                                    <div>
                                      <div className="flex items-center gap-2 mb-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase">본문</label>
                                        <button
                                          onClick={() => setPreviewMode(!previewMode)}
                                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-all ${
                                            previewMode
                                              ? 'bg-steel-600 text-white'
                                              : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                          }`}
                                        >
                                          <span className="flex items-center gap-1">
                                            <EyeIcon /> {previewMode ? '미리보기' : '원본'}
                                          </span>
                                        </button>
                                      </div>
                                      <div className="bg-white p-3 rounded-lg border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-mono">
                                        {previewMode
                                          ? renderPreview(template.body, template.variables_meta)
                                          : template.body}
                                      </div>
                                    </div>

                                    {/* 변수 메타데이터 테이블 */}
                                    {template.variables_meta && template.variables_meta.length > 0 && (
                                      <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block">
                                          사용 변수 ({template.variables_meta.length}개)
                                        </label>
                                        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                          <table className="w-full text-xs">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                              <tr>
                                                <th className="px-3 py-2 text-left font-black text-slate-500">변수명</th>
                                                <th className="px-3 py-2 text-left font-black text-slate-500">설명</th>
                                                <th className="px-3 py-2 text-left font-black text-slate-500">예시</th>
                                                <th className="px-3 py-2 text-center font-black text-slate-500">필수</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                              {template.variables_meta.map((v) => (
                                                <tr key={v.key} className="hover:bg-slate-50">
                                                  <td className="px-3 py-2 font-mono text-blue-700 font-bold">
                                                    {'{{' + v.key + '}}'}
                                                  </td>
                                                  <td className="px-3 py-2 text-slate-700">{v.label}</td>
                                                  <td className="px-3 py-2 text-slate-500 font-mono">{v.example}</td>
                                                  <td className="px-3 py-2 text-center">
                                                    {v.required ? (
                                                      <span className="text-red-500 font-bold">필수</span>
                                                    ) : (
                                                      <span className="text-slate-400">선택</span>
                                                    )}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}

                                    {/* 변수 (메타 없을 때 기존 방식) */}
                                    {(!template.variables_meta || template.variables_meta.length === 0) &&
                                      extractVariables(template.body).length > 0 && (
                                        <div>
                                          <label className="text-[10px] font-black text-slate-500 uppercase">변수</label>
                                          <div className="flex flex-wrap gap-2 mt-2">
                                            {extractVariables(template.body).map((v) => (
                                              <span key={v} className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2.5 py-1.5 rounded-lg font-mono">
                                                {v}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                    {/* 카카오 템플릿 코드 */}
                                    {template.kakao_template_code && (
                                      <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase">카카오 템플릿 코드</label>
                                        <p className="text-sm font-mono text-slate-700 mt-1">{template.kakao_template_code}</p>
                                      </div>
                                    )}

                                    {/* 액션 버튼 */}
                                    <div className="flex gap-2 pt-3 border-t border-slate-200">
                                      <button
                                        onClick={() => {
                                          setEditingTemplate(template)
                                          setIsCreateMode(false)
                                          setIsModalOpen(true)
                                        }}
                                        className="flex-1 bg-steel-100 text-steel-700 px-4 py-2 rounded-lg font-bold hover:bg-steel-200 flex items-center justify-center gap-2"
                                      >
                                        <EditIcon /> 편집
                                      </button>
                                      {!template.is_system && (
                                        <button
                                          onClick={() => deleteTemplate(template.id)}
                                          className="flex-1 bg-red-100 text-red-700 px-4 py-2 rounded-lg font-bold hover:bg-red-200 flex items-center justify-center gap-2"
                                        >
                                          <TrashIcon /> 삭제
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* =============================================
            탭 2: 발송 이력
            ============================================= */}
        {activeTab === 'history' && (
          <div>
            {/* 필터 */}
            <div className="mb-6 bg-white rounded-2xl border border-slate-200 p-4 md:p-5 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">채널</label>
                  <select
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                  >
                    {CHANNELS.map((ch) => (
                      <option key={ch.value} value={ch.value}>{ch.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">상태</label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                  >
                    <option value="all">전체</option>
                    <option value="sent">전송됨</option>
                    <option value="failed">실패</option>
                    <option value="pending">대기중</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">시작 날짜</label>
                  <input
                    type="date"
                    value={dateRange.from}
                    onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">종료 날짜</label>
                  <input
                    type="date"
                    value={dateRange.to}
                    onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">수신자</label>
                  <input
                    type="text"
                    placeholder="전화번호 또는 이메일"
                    value={filterRecipient}
                    onChange={(e) => setFilterRecipient(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">템플릿</label>
                  <input
                    type="text"
                    placeholder="템플릿 키"
                    value={filterTemplateKey}
                    onChange={(e) => setFilterTemplateKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                  />
                </div>
              </div>
            </div>

            {/* 이력 테이블 */}
            {logs.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                <p className="text-slate-400 text-lg">발송 이력이 없습니다.</p>
              </div>
            ) : (
              <>
                {/* 데스크탑 테이블 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" style={{ overflowX: 'auto' }}>
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-600 uppercase">
                      <tr>
                        <th className="px-4 py-3">발송시간</th>
                        <th className="px-4 py-3">채널</th>
                        <th className="px-4 py-3">수신자</th>
                        <th className="px-4 py-3">템플릿</th>
                        <th className="px-4 py-3">상태</th>
                        <th className="px-4 py-3">결과</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                            {new Date(log.sent_at).toLocaleString('ko-KR')}
                          </td>
                          <td className="px-4 py-3">{getChannelBadge(log.channel)}</td>
                          <td className="px-4 py-3 text-xs text-slate-700 font-mono truncate max-w-[160px]">
                            {log.recipient_name ? `${log.recipient_name} (${log.recipient})` : log.recipient}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-700 font-mono">{log.template_key || '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-black px-2 py-1 rounded border ${STATUS_COLORS[log.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                              {log.status === 'sent' ? '전송됨' : log.status === 'failed' ? '실패' : '대기중'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate">
                            {log.error_detail || log.result_message || log.result_code || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* =============================================
          템플릿 편집 모달
          ============================================= */}
      {isModalOpen && editingTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 sticky top-0 bg-white z-10">
              <h2 className="text-xl font-black text-gray-900">
                {isCreateMode ? '새 템플릿 생성' : '템플릿 편집'}
              </h2>
            </div>

            <div className="p-6 space-y-5">
              {/* 카테고리 */}
              <div>
                <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">카테고리 *</label>
                <select
                  value={editingTemplate.category || 'general'}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                >
                  {CATEGORY_ORDER.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORIES[cat].icon} {CATEGORIES[cat].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 템플릿 키 */}
              <div>
                <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">템플릿 키 *</label>
                <input
                  type="text"
                  placeholder="예: order_notification"
                  value={editingTemplate.template_key}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, template_key: e.target.value })}
                  disabled={!isCreateMode}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600 disabled:bg-slate-50"
                />
              </div>

              {/* 이름 + 설명 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">템플릿 이름 *</label>
                  <input
                    type="text"
                    placeholder="예: 주문 알림"
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">설명</label>
                  <input
                    type="text"
                    placeholder="템플릿 설명"
                    value={editingTemplate.description}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                  />
                </div>
              </div>

              {/* 채널 */}
              <div>
                <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">채널 *</label>
                <select
                  value={editingTemplate.channel}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, channel: e.target.value as MessageTemplate['channel'] })}
                  disabled={!isCreateMode}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600 disabled:bg-slate-50"
                >
                  <option value="sms">SMS</option>
                  <option value="kakao">카카오 알림톡</option>
                  <option value="email">이메일</option>
                  <option value="push">앱 푸시</option>
                </select>
              </div>

              {/* 제목 (이메일/SMS) */}
              {(editingTemplate.channel === 'email' || editingTemplate.channel === 'sms') && (
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">제목</label>
                  <input
                    type="text"
                    placeholder="메시지 제목"
                    value={editingTemplate.subject || ''}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                  />
                </div>
              )}

              {/* 본문 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase block">본문 *</label>
                  <span className="text-[10px] text-slate-500">변수 형식: {'{{변수명}}'}</span>
                </div>
                <textarea
                  placeholder="메시지 본문 (변수는 {{변수명}} 형식으로 작성)"
                  value={editingTemplate.body}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600 font-mono h-32 resize-none"
                />
              </div>

              {/* 사용된 변수 미리보기 */}
              {variables.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <p className="text-[10px] font-black text-blue-600 uppercase mb-2">사용된 변수</p>
                  <div className="flex flex-wrap gap-2">
                    {variables.map((v) => (
                      <span key={v} className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded font-mono">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 카카오 템플릿 코드 */}
              {editingTemplate.channel === 'kakao' && (
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">카카오 템플릿 코드</label>
                  <input
                    type="text"
                    placeholder="카카오 공식 템플릿 코드"
                    value={editingTemplate.kakao_template_code || ''}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, kakao_template_code: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                  />
                </div>
              )}

              {/* HTML 템플릿 (이메일) */}
              {editingTemplate.channel === 'email' && (
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">HTML 템플릿</label>
                  <textarea
                    placeholder="HTML 본문 (선택사항)"
                    value={editingTemplate.html_template || ''}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, html_template: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600 font-mono h-32 resize-none"
                  />
                </div>
              )}
            </div>

            {/* 모달 버튼 */}
            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end sticky bottom-0 bg-white">
              <button
                onClick={() => {
                  setIsModalOpen(false)
                  setEditingTemplate(null)
                  setIsCreateMode(false)
                }}
                className="px-6 py-2 rounded-lg border border-slate-200 text-slate-700 font-bold hover:bg-slate-50"
              >
                취소
              </button>
              <button
                onClick={() => saveTemplate(editingTemplate)}
                className="px-6 py-2 rounded-lg bg-steel-600 text-white font-bold hover:bg-steel-700"
              >
                {isCreateMode ? '생성' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
