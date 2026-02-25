'use client'
import { supabase } from '../utils/supabase'
import { useState, useEffect } from 'react'

interface Props {
  companyName: string
  companyId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface DropdownItem {
  id: string
  name: string
}

type ActiveModule = { path: string; name: string }

type PagePerm = {
  page_path: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  data_scope: string
}

export default function InviteModal({ companyName, companyId, isOpen, onClose, onSuccess }: Props) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [sendChannel, setSendChannel] = useState<'email' | 'kakao' | 'sms' | 'both'>('email')
  const [role, setRole] = useState('user')
  const [departmentId, setDepartmentId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // 드롭다운 데이터
  const [departments, setDepartments] = useState<DropdownItem[]>([])
  const [positions, setPositions] = useState<DropdownItem[]>([])

  // 페이지 권한
  const [activeModules, setActiveModules] = useState<ActiveModule[]>([])
  const [pagePerms, setPagePerms] = useState<Record<string, PagePerm>>({})
  const [showPerms, setShowPerms] = useState(false)

  // 부서/직급/모듈 로드
  useEffect(() => {
    if (isOpen && companyId) {
      supabase
        .from('departments')
        .select('id, name')
        .eq('company_id', companyId)
        .order('name')
        .then(({ data }) => setDepartments(data || []))

      supabase
        .from('positions')
        .select('id, name')
        .eq('company_id', companyId)
        .order('level')
        .then(({ data }) => setPositions(data || []))

      // 활성 모듈 로드
      supabase
        .from('company_modules')
        .select('module:system_modules(path, name)')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .then(({ data }) => {
          if (data) {
            const seen = new Set<string>()
            const modules = data
              .filter((m: any) => m.module?.path && !seen.has(m.module.path) && seen.add(m.module.path))
              .map((m: any) => ({ path: m.module.path, name: m.module.name }))
            setActiveModules(modules)
          }
        })
    }
  }, [isOpen, companyId])

  // 모달 닫힐 때 초기화
  useEffect(() => {
    if (!isOpen) {
      setEmail('')
      setPhone('')
      setSendChannel('email')
      setRole('user')
      setDepartmentId('')
      setPositionId('')
      setMessage(null)
      setPagePerms({})
      setShowPerms(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const needsPhone = ['kakao', 'sms', 'both'].includes(sendChannel)

  // 페이지 권한 토글
  const togglePage = (path: string) => {
    setPagePerms(prev => {
      const current = prev[path]
      if (current?.can_view) {
        // OFF
        const next = { ...prev }
        delete next[path]
        return next
      }
      // ON
      return { ...prev, [path]: { page_path: path, can_view: true, can_create: false, can_edit: false, can_delete: false, data_scope: 'all' } }
    })
  }

  const togglePermField = (path: string, field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete') => {
    const current = pagePerms[path]
    if (!current) return
    setPagePerms(prev => ({ ...prev, [path]: { ...current, [field]: !current[field] } }))
  }

  const handleInvite = async () => {
    if (!email) return setMessage({ text: '이메일을 입력해주세요.', type: 'error' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMessage({ text: '올바른 이메일 형식이 아닙니다.', type: 'error' })
    if (needsPhone && !phone) return setMessage({ text: '전화번호를 입력해주세요.', type: 'error' })

    setLoading(true)
    setMessage(null)

    // 권한 배열 생성
    const permissionsArray = Object.values(pagePerms).filter(p => p.can_view || p.can_create || p.can_edit || p.can_delete)

    try {
      // ★ 세션 토큰 안전하게 가져오기 (만료 시 자동 갱신)
      let { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession()
        session = refreshed
      }
      if (!session?.access_token) throw new Error('로그인이 필요합니다. 페이지를 새로고침해주세요.')

      const res = await fetch('/api/member-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email,
          company_id: companyId,
          position_id: positionId || null,
          department_id: departmentId || null,
          role,
          send_channel: sendChannel,
          recipient_phone: phone || '',
          page_permissions: permissionsArray,
        }),
      })

      // ★ JSON 파싱 안전 처리 (서버 에러 시 HTML 반환될 수 있음)
      let data: any
      try {
        data = await res.json()
      } catch {
        throw new Error(`서버 응답 오류 (${res.status}). 잠시 후 다시 시도해주세요.`)
      }

      // 409: 이미 대기 중 → 재발송 확인
      if (res.status === 409 && data.existing_id) {
        if (confirm('이미 대기 중인 초대가 있습니다. 재발송하시겠습니까?')) {
          const resendRes = await fetch('/api/member-invite', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              email,
              company_id: companyId,
              position_id: positionId || null,
              department_id: departmentId || null,
              role,
              send_channel: sendChannel,
              recipient_phone: phone || '',
              page_permissions: permissionsArray,
              resend: true,
            }),
          })
          data = await resendRes.json()
          if (!resendRes.ok) throw new Error(data.error || '재발송 실패')
        } else {
          setLoading(false)
          return
        }
      } else if (!res.ok) {
        throw new Error(data.error || '초대 실패')
      }

      // 결과 메시지
      const results: string[] = []
      const errors: string[] = []
      if (data.emailSent) results.push('이메일')
      else if (data.emailError) errors.push(`이메일: ${data.emailError}`)
      if (data.kakaoSent) results.push(data.smsFallback ? '문자(SMS)' : '카카오톡')
      else if (data.kakaoError) errors.push(`카카오/SMS: ${data.kakaoError}`)

      if (results.length > 0) {
        const errMsg = errors.length > 0 ? `\n(실패: ${errors.join(', ')})` : ''
        setMessage({ text: `✅ ${results.join(' + ')}으로 초대장을 발송했습니다!${errMsg}`, type: 'success' })
      } else if (errors.length > 0) {
        setMessage({ text: `⚠️ 초대는 생성되었지만 발송 실패: ${errors.join(', ')}\n초대 링크: ${data.inviteUrl}`, type: 'error' })
      } else {
        setMessage({ text: `⚠️ 초대가 생성되었습니다. 초대 링크: ${data.inviteUrl}`, type: 'error' })
      }

      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1500)
    } catch (error: any) {
      console.error('[InviteModal] 초대 발송 에러:', error)
      const msg = error.message || '알 수 없는 오류'
      if (msg.includes('이미 가입된')) setMessage({ text: '⚠️ 이미 가입된 이메일입니다.', type: 'error' })
      else if (msg.includes('대기 중인')) setMessage({ text: '⚠️ 이미 대기 중인 초대가 있습니다.', type: 'error' })
      else setMessage({ text: `오류: ${msg}`, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const enabledCount = Object.values(pagePerms).filter(p => p.can_view).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in px-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl transform transition-all max-h-[90vh] flex flex-col">

        {/* 헤더 */}
        <div className="text-center p-6 pb-4 flex-shrink-0">
          <div className="mx-auto w-14 h-14 bg-steel-50 rounded-full flex items-center justify-center mb-3">
            <svg className="w-7 h-7 text-steel-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <h3 className="text-xl font-black text-gray-900">새로운 멤버 초대</h3>
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-bold text-steel-600">{companyName}</span>
          </p>
        </div>

        {/* 스크롤 영역 */}
        <div className="overflow-y-auto flex-1 px-6">
          {/* 메시지 */}
          {message && (
            <div className={`mb-4 p-3 rounded-xl text-sm font-bold ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {message.text}
            </div>
          )}

          <div className="space-y-4">
            {/* 발송 채널 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">발송 방법</label>
              <div className="flex gap-2">
                {([
                  { key: 'email', label: '이메일', icon: '✉️' },
                  { key: 'kakao', label: '카카오톡', icon: '💬' },
                  { key: 'sms', label: 'SMS', icon: '📱' },
                  { key: 'both', label: '이메일+카카오', icon: '📨' },
                ] as const).map(ch => (
                  <button key={ch.key} type="button" onClick={() => setSendChannel(ch.key)} disabled={loading}
                    className={`flex-1 py-2 px-1.5 rounded-xl text-xs font-bold transition-all border ${
                      sendChannel === ch.key ? 'bg-steel-600 text-white border-steel-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}>
                    {ch.icon} {ch.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 이메일 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">이메일 주소</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-steel-500 font-bold focus:bg-white transition-colors"
                placeholder="member@company.com" disabled={loading} />
            </div>

            {/* 전화번호 */}
            {needsPhone && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">전화번호</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9-]/g, ''))}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-steel-500 font-bold focus:bg-white transition-colors"
                  placeholder="010-1234-5678" disabled={loading} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {/* 부서 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">부서</label>
                <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={loading}
                  className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-steel-500 font-bold appearance-none">
                  <option value="">선택 안함</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              {/* 직급 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">직급</label>
                <select value={positionId} onChange={(e) => setPositionId(e.target.value)} disabled={loading}
                  className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-steel-500 font-bold appearance-none">
                  <option value="">선택 안함</option>
                  {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            {/* 시스템 권한 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">시스템 권한</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} disabled={loading}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-steel-500 font-bold appearance-none">
                <option value="user">일반 직원 (페이지별 권한 적용)</option>
                <option value="master">관리자 (전체 접근)</option>
              </select>
            </div>

            {/* 페이지 권한 (일반 직원일 때만) */}
            {role === 'user' && activeModules.length > 0 && (
              <div>
                <button type="button" onClick={() => setShowPerms(!showPerms)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-steel-50 border border-steel-200 rounded-xl hover:bg-steel-100 transition-colors">
                  <span className="text-xs font-bold text-steel-700">
                    페이지 접근 권한 설정 {enabledCount > 0 && <span className="text-steel-500">({enabledCount}개 선택)</span>}
                  </span>
                  <svg className={`w-4 h-4 text-steel-500 transition-transform ${showPerms ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showPerms && (
                  <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                    {activeModules.map(mod => {
                      const perm = pagePerms[mod.path]
                      const isOn = !!perm?.can_view
                      return (
                        <div key={mod.path} className="p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-800">{mod.name}</span>
                            <button type="button" onClick={() => togglePage(mod.path)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                isOn ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                              }`}>
                              {isOn ? 'ON' : 'OFF'}
                            </button>
                          </div>
                          {isOn && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {(['can_view', 'can_create', 'can_edit', 'can_delete'] as const).map(f => (
                                <label key={f} className="flex items-center gap-1 cursor-pointer text-xs">
                                  <input type="checkbox" checked={perm?.[f] || false} onChange={() => togglePermField(mod.path, f)}
                                    className="w-3.5 h-3.5 rounded border-slate-300 text-steel-600" />
                                  <span className="font-bold text-slate-600">
                                    {f === 'can_view' ? '조회' : f === 'can_create' ? '생성' : f === 'can_edit' ? '수정' : '삭제'}
                                  </span>
                                </label>
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
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-3 p-6 pt-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50">
            취소
          </button>
          <button onClick={handleInvite} disabled={loading}
            className="flex-1 py-3 rounded-xl font-bold text-white bg-steel-600 hover:bg-steel-700 shadow-lg shadow-steel-200 transition-all disabled:bg-gray-300 flex items-center justify-center gap-2">
            {loading ? (
              <>
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                발송 중...
              </>
            ) : '초대장 보내기'}
          </button>
        </div>
      </div>
    </div>
  )
}
