'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { useRouter } from 'next/navigation'

// ============================================
// 메시지 센터 (메시지 템플릿 + 발송 이력)
// ============================================

type MessageTemplate = {
  id: string
  company_id: string
  template_key: string
  name: string
  description: string
  channel: 'sms' | 'kakao' | 'email' | 'push'
  subject: string | null
  body: string
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
  company_id: string
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

const CHANNELS = [
  { value: 'all', label: '전체', icon: '📱' },
  { value: 'sms', label: 'SMS', icon: '📤', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'kakao', label: '카카오', icon: '💬', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'email', label: '이메일', icon: '📧', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'push', label: '푸시', icon: '🔔', color: 'bg-green-100 text-green-700 border-green-200' },
]

const STATUS_COLORS = {
  sent: 'bg-green-100 text-green-700 border-green-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
}

export default function MessageTemplatesPage() {
  const router = useRouter()
  const { company, role, adminSelectedCompanyId, loading: appLoading } = useApp()

  // 권한 확인
  useEffect(() => {
    if (!appLoading && role !== 'master' && role !== 'god_admin') {
      alert('접근 권한이 없습니다.')
      router.replace('/dashboard')
    }
  }, [appLoading, role, router])

  // 탭 상태
  const [activeTab, setActiveTab] = useState<'templates' | 'history'>('templates')
  const [selectedChannel, setSelectedChannel] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [isCreateMode, setIsCreateMode] = useState(false)

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

  const companyId = adminSelectedCompanyId || company?.id

  // 템플릿 로드
  const loadTemplates = async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('message_templates')
        .select('*')
        .eq('company_id', companyId)
        .order('sort_order', { ascending: true })
        .order('template_key', { ascending: true })

      if (fetchError) throw fetchError

      // 각 템플릿의 발송 개수 조회
      const templatesWithCount = await Promise.all(
        (data || []).map(async (template) => {
          const { count } = await supabase
            .from('message_send_logs')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('template_key', template.template_key)

          return {
            ...template,
            sendCount: count || 0,
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
      let query = supabase
        .from('message_send_logs')
        .select('*')
        .eq('company_id', companyId)

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus)
      }

      if (selectedChannel !== 'all') {
        query = query.eq('channel', selectedChannel)
      }

      if (dateRange.from) {
        query = query.gte('sent_at', dateRange.from)
      }

      if (dateRange.to) {
        query = query.lte('sent_at', dateRange.to)
      }

      if (filterRecipient) {
        query = query.ilike('recipient', `%${filterRecipient}%`)
      }

      if (filterTemplateKey) {
        query = query.ilike('template_key', `%${filterTemplateKey}%`)
      }

      const { data, error: fetchError } = await query.order('sent_at', { ascending: false }).limit(100)

      if (fetchError) throw fetchError

      setLogs(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '이력 로드 실패')
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!appLoading && companyId) {
      if (activeTab === 'templates') {
        loadTemplates()
      } else {
        loadLogs()
      }
    } else if (!appLoading && !companyId) {
      // 회사 미선택 시 로딩 해제
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
      if (editingTemplate) {
        // 수정
        const { error } = await supabase
          .from('message_templates')
          .update(template)
          .eq('id', editingTemplate.id)

        if (error) throw error
      } else {
        // 신규
        const { error } = await supabase
          .from('message_templates')
          .insert([
            {
              ...template,
              company_id: companyId,
              sort_order: templates.length,
              is_active: true,
              is_system: false,
            },
          ])

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
      const { error } = await supabase.from('message_templates').delete().eq('id', id)

      if (error) throw error

      loadTemplates()
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  // 활성화 토글
  const toggleTemplate = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('message_templates')
        .update({ is_active: !isActive })
        .eq('id', id)

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

  const variables = editingTemplate ? extractVariables(editingTemplate.body) : []

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

  if (appLoading || (loading && activeTab === 'templates')) {
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
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">💬 메시지 센터</h1>
          <p className="text-sm md:text-base text-slate-500 mt-2">SMS · 카카오 알림톡 · 이메일 · 앱 푸시 통합 관리</p>
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
            📋 템플릿 관리
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-sm font-bold rounded-t-2xl transition-all ${
              activeTab === 'history'
                ? 'bg-white text-steel-600 border-b-2 border-steel-600'
                : 'text-slate-500 hover:text-slate-600'
            }`}
          >
            📊 발송 이력
          </button>
        </div>

        {/* 탭 1: 템플릿 관리 */}
        {activeTab === 'templates' && (
          <div>
            {/* 필터 + 버튼 */}
            <div className="flex flex-col md:flex-row gap-3 justify-between items-start md:items-center mb-6">
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
                    company_id: companyId || '',
                    template_key: '',
                    name: '',
                    description: '',
                    channel: 'sms',
                    subject: null,
                    body: '',
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

            {/* 템플릿 카드 리스트 */}
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600 mb-4"></div>
                <p className="text-slate-400">템플릿 로드 중...</p>
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                <p className="text-slate-400 text-lg">등록된 템플릿이 없습니다.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {templates
                  .filter((t) => selectedChannel === 'all' || t.channel === selectedChannel)
                  .map((template) => (
                    <div key={template.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
                      {/* 헤더 */}
                      <div
                        className="p-4 md:p-5 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setExpandedTemplate(expandedTemplate === template.id ? null : template.id)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-base md:text-lg font-black text-gray-900 truncate">{template.name}</h3>
                              {getChannelBadge(template.channel)}
                            </div>
                            <p className="text-sm text-slate-500 truncate">{template.description}</p>
                            <div className="flex gap-3 mt-3 flex-wrap">
                              <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">
                                {template.template_key}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500">
                                발송: {template.sendCount || 0}건
                              </span>
                              {template.is_system && <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-1 rounded">시스템</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleTemplate(template.id, template.is_active)
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
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
                        <div className="border-t border-slate-200 p-4 md:p-5 bg-slate-50/50">
                          <div className="grid grid-cols-1 gap-4">
                            {/* 기본 정보 */}
                            <div>
                              <label className="text-[10px] font-black text-slate-600 uppercase">템플릿 키</label>
                              <p className="text-sm font-mono text-slate-700 mt-1">{template.template_key}</p>
                            </div>

                            {/* 제목 (이메일 / SMS 등) */}
                            {template.subject && (
                              <div>
                                <label className="text-[10px] font-black text-slate-600 uppercase">제목</label>
                                <p className="text-sm text-slate-700 mt-1 break-words">{template.subject}</p>
                              </div>
                            )}

                            {/* 본문 */}
                            <div>
                              <label className="text-[10px] font-black text-slate-600 uppercase">본문</label>
                              <div className="mt-2 bg-white p-3 rounded-lg border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-mono">
                                {template.body}
                              </div>
                            </div>

                            {/* 변수 미리보기 */}
                            {extractVariables(template.body).length > 0 && (
                              <div>
                                <label className="text-[10px] font-black text-slate-600 uppercase">변수</label>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {extractVariables(template.body).map((v) => (
                                    <span
                                      key={v}
                                      className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2.5 py-1.5 rounded-lg font-mono"
                                    >
                                      {v}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 카카오 템플릿 코드 */}
                            {template.kakao_template_code && (
                              <div>
                                <label className="text-[10px] font-black text-slate-600 uppercase">카카오 템플릿 코드</label>
                                <p className="text-sm font-mono text-slate-700 mt-1">{template.kakao_template_code}</p>
                              </div>
                            )}

                            {/* HTML 템플릿 */}
                            {template.html_template && (
                              <div>
                                <label className="text-[10px] font-black text-slate-600 uppercase">HTML 템플릿</label>
                                <div className="mt-2 bg-white p-3 rounded-lg border border-slate-200 text-xs text-slate-700 font-mono max-h-32 overflow-y-auto">
                                  {template.html_template.substring(0, 200)}...
                                </div>
                              </div>
                            )}

                            {/* 액션 버튼 */}
                            <div className="flex gap-2 pt-4 border-t border-slate-200">
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
        )}

        {/* 탭 2: 발송 이력 */}
        {activeTab === 'history' && (
          <div>
            {/* 필터 */}
            <div className="mb-6 bg-white rounded-2xl border border-slate-200 p-4 md:p-5 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 채널 필터 */}
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">채널</label>
                  <select
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                  >
                    {CHANNELS.map((ch) => (
                      <option key={ch.value} value={ch.value}>
                        {ch.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 상태 필터 */}
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

                {/* 날짜 필터 */}
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

                {/* 수신자 검색 */}
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

                {/* 템플릿 키 검색 */}
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

            {/* 이력 테이블 - 데스크탑 */}
            {loading ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600 mb-4"></div>
                <p className="text-slate-400">로드 중...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                <p className="text-slate-400 text-lg">발송 이력이 없습니다.</p>
              </div>
            ) : (
              <>
                {/* 데스크탑 테이블 */}
                <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
                          <td className="px-4 py-3 text-xs text-slate-700 font-mono truncate">{log.recipient}</td>
                          <td className="px-4 py-3 text-xs text-slate-700 font-mono">{log.template_key}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-[10px] font-black px-2 py-1 rounded border ${
                                STATUS_COLORS[log.status as keyof typeof STATUS_COLORS] ||
                                'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {log.status === 'sent'
                                ? '전송됨'
                                : log.status === 'failed'
                                  ? '실패'
                                  : log.status === 'pending'
                                    ? '대기중'
                                    : log.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {log.result_message || log.result_code || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 모바일 카드 */}
                <div className="md:hidden grid gap-3">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {getChannelBadge(log.channel)}
                          <span
                            className={`text-[10px] font-black px-2 py-1 rounded border ${
                              STATUS_COLORS[log.status as keyof typeof STATUS_COLORS] ||
                              'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {log.status === 'sent'
                              ? '전송됨'
                              : log.status === 'failed'
                                ? '실패'
                                : '대기중'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(log.sent_at).toLocaleString('ko-KR')}
                        </span>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-black">수신자</p>
                        <p className="text-xs text-slate-700 font-mono">{log.recipient}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-black">템플릿</p>
                        <p className="text-xs text-slate-700 font-mono">{log.template_key}</p>
                      </div>
                      {log.result_message && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-black">결과</p>
                          <p className="text-xs text-slate-700">{log.result_message}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 템플릿 편집 모달 */}
      {isModalOpen && editingTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 sticky top-0 bg-white">
              <h2 className="text-xl font-black text-gray-900">
                {isCreateMode ? '새 템플릿 생성' : '템플릿 편집'}
              </h2>
            </div>

            <div className="p-6 space-y-5">
              {/* 템플릿 키 */}
              <div>
                <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">
                  템플릿 키 *
                </label>
                <input
                  type="text"
                  placeholder="예: order_notification"
                  value={editingTemplate.template_key}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, template_key: e.target.value })
                  }
                  disabled={!isCreateMode}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600 disabled:bg-slate-50"
                />
              </div>

              {/* 이름 */}
              <div>
                <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">
                  템플릿 이름 *
                </label>
                <input
                  type="text"
                  placeholder="예: 주문 알림"
                  value={editingTemplate.name}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, name: e.target.value })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                />
              </div>

              {/* 설명 */}
              <div>
                <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">
                  설명
                </label>
                <input
                  type="text"
                  placeholder="템플릿 설명"
                  value={editingTemplate.description}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, description: e.target.value })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                />
              </div>

              {/* 채널 */}
              <div>
                <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">
                  채널 *
                </label>
                <select
                  value={editingTemplate.channel}
                  onChange={(e) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      channel: e.target.value as MessageTemplate['channel'],
                    })
                  }
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
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">
                    제목
                  </label>
                  <input
                    type="text"
                    placeholder="메시지 제목"
                    value={editingTemplate.subject || ''}
                    onChange={(e) =>
                      setEditingTemplate({ ...editingTemplate, subject: e.target.value })
                    }
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                  />
                </div>
              )}

              {/* 본문 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase block">
                    본문 *
                  </label>
                  <span className="text-[10px] text-slate-500">변수 형식: {'{{변수명}}'}</span>
                </div>
                <textarea
                  placeholder="메시지 본문 (변수는 {{변수명}} 형식으로 작성)"
                  value={editingTemplate.body}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, body: e.target.value })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600 font-mono h-32 resize-none"
                />
              </div>

              {/* 변수 미리보기 */}
              {variables.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <p className="text-[10px] font-black text-blue-600 uppercase mb-2">사용된 변수</p>
                  <div className="flex flex-wrap gap-2">
                    {variables.map((v) => (
                      <span
                        key={v}
                        className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded font-mono"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 카카오 템플릿 코드 */}
              {editingTemplate.channel === 'kakao' && (
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">
                    카카오 템플릿 코드
                  </label>
                  <input
                    type="text"
                    placeholder="카카오 공식 템플릿 코드"
                    value={editingTemplate.kakao_template_code || ''}
                    onChange={(e) =>
                      setEditingTemplate({
                        ...editingTemplate,
                        kakao_template_code: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-steel-600"
                  />
                </div>
              )}

              {/* HTML 템플릿 (이메일) */}
              {editingTemplate.channel === 'email' && (
                <div>
                  <label className="text-[10px] font-black text-slate-600 uppercase block mb-2">
                    HTML 템플릿
                  </label>
                  <textarea
                    placeholder="HTML 본문 (선택사항)"
                    value={editingTemplate.html_template || ''}
                    onChange={(e) =>
                      setEditingTemplate({
                        ...editingTemplate,
                        html_template: e.target.value,
                      })
                    }
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
