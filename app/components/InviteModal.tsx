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

  // 부서/직급 로드
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
    }
  }, [isOpen])

  if (!isOpen) return null

  const needsPhone = ['kakao', 'sms', 'both'].includes(sendChannel)

  const handleInvite = async () => {
    if (!email) return setMessage({ text: '이메일을 입력해주세요.', type: 'error' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMessage({ text: '올바른 이메일 형식이 아닙니다.', type: 'error' })
    if (needsPhone && !phone) return setMessage({ text: '전화번호를 입력해주세요.', type: 'error' })

    setLoading(true)
    setMessage(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('로그인이 필요합니다.')

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
        }),
      })

      let data = await res.json()

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
      console.log('[InviteModal] 발송 결과:', JSON.stringify(data))
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
      const msg = error.message
      if (msg.includes('이미 가입된')) setMessage({ text: '⚠️ 이미 가입된 이메일입니다.', type: 'error' })
      else if (msg.includes('대기 중인')) setMessage({ text: '⚠️ 이미 대기 중인 초대가 있습니다.', type: 'error' })
      else setMessage({ text: `오류: ${msg}`, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in px-4">
      <div className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl transform transition-all">

        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-steel-50 rounded-full flex items-center justify-center text-2xl mb-4">
            <svg className="w-8 h-8 text-steel-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <h3 className="text-2xl font-black text-gray-900">새로운 멤버 초대</h3>
          <p className="text-sm text-gray-500 mt-2">
            <span className="font-bold text-steel-600">{companyName}</span>의 새로운 멤버를 초대합니다.
          </p>
        </div>

        {/* 메시지 */}
        {message && (
          <div className={`mb-5 p-3 rounded-xl text-sm font-bold ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {message.text}
          </div>
        )}

        <div className="space-y-5">
          {/* 발송 채널 선택 */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">발송 방법</label>
            <div className="flex gap-2">
              {([
                { key: 'email', label: '이메일', icon: '✉️' },
                { key: 'kakao', label: '카카오톡', icon: '💬' },
                { key: 'sms', label: '문자(SMS)', icon: '📱' },
                { key: 'both', label: '이메일+카카오', icon: '📨' },
              ] as const).map(ch => (
                <button
                  key={ch.key}
                  type="button"
                  onClick={() => setSendChannel(ch.key)}
                  disabled={loading}
                  className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all border ${
                    sendChannel === ch.key
                      ? 'bg-steel-600 text-white border-steel-600'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {ch.icon} {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* 이메일 */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">이메일 주소</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-steel-500 font-bold focus:bg-white transition-colors"
              placeholder="member@company.com"
              disabled={loading}
            />
          </div>

          {/* 전화번호 (카카오/SMS/둘다 선택 시) */}
          {needsPhone && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">전화번호</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9-]/g, ''))}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-steel-500 font-bold focus:bg-white transition-colors"
                placeholder="010-1234-5678"
                disabled={loading}
              />
              {sendChannel === 'kakao' && (
                <p className="text-[11px] text-amber-600 mt-1 ml-1">* 카카오 비즈니스 채널 심사 중이면 자동으로 SMS로 발송됩니다.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* 부서 드롭다운 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">부서</label>
              <div className="relative">
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-steel-500 font-bold cursor-pointer appearance-none"
                  disabled={loading}
                >
                  <option value="">선택 안함</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
              </div>
            </div>
            {/* 직급 드롭다운 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">직급</label>
              <div className="relative">
                <select
                  value={positionId}
                  onChange={(e) => setPositionId(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-steel-500 font-bold cursor-pointer appearance-none"
                  disabled={loading}
                >
                  <option value="">선택 안함</option>
                  {positions.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
              </div>
            </div>
          </div>

          {/* 권한 선택 */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">시스템 권한</label>
            <div className="relative">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-steel-500 font-bold cursor-pointer appearance-none"
                disabled={loading}
              >
                <option value="user">일반 직원 (직급 기반 권한)</option>
                <option value="master">관리자 (회사 전체 관리)</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 ml-1">
              * 초대받은 멤버는 가입 후 위 설정대로 자동 소속됩니다.
            </p>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-3 mt-10 border-t border-gray-100 pt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3.5 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleInvite}
            disabled={loading}
            className="flex-1 py-3.5 rounded-xl font-bold text-white bg-steel-600 hover:bg-steel-700 shadow-lg shadow-steel-200 transition-all disabled:bg-gray-300 flex items-center justify-center gap-2"
          >
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
