'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// ============================================
// 초대 가입 페이지 (공개 - 인증 불필요)
// /invite/[token] → 토큰 검증 → 가입 양식 → 비밀번호 설정
// ============================================

interface InviteInfo {
  id: string
  email: string
  role: string
  status: string
  expires_at: string
  company: { name: string } | null
  position: { name: string } | null
  department: { name: string } | null
}

export default function InviteAcceptPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  const supabase = createClientComponentClient()

  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [pageState, setPageState] = useState<'loading' | 'form' | 'expired' | 'error' | 'success'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  // 폼
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const isValidPwd = /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/.test(password)

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '')
    let formatted = raw
    if (raw.length > 3 && raw.length <= 7) formatted = `${raw.slice(0, 3)}-${raw.slice(3)}`
    else if (raw.length > 7) formatted = `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}`
    setPhone(formatted)
  }

  // 토큰 검증
  useEffect(() => {
    if (!token) return
    validateToken()
  }, [token])

  async function validateToken() {
    try {
      const res = await fetch(`/api/member-invite/validate?token=${token}`)
      const data = await res.json()

      if (!res.ok) {
        if (data.reason === 'expired') setPageState('expired')
        else if (data.reason === 'used') setPageState('expired')
        else { setErrorMsg(data.error || '유효하지 않은 초대입니다.'); setPageState('error') }
        return
      }

      setInvite(data)
      setPageState('form')
    } catch {
      setErrorMsg('서버 연결에 실패했습니다.')
      setPageState('error')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    if (!name.trim()) return setFormError('이름을 입력해주세요.')
    if (!phone.trim()) return setFormError('연락처를 입력해주세요.')
    if (!isValidPwd) return setFormError('비밀번호 규칙을 확인해주세요.')
    if (password !== passwordConfirm) return setFormError('비밀번호가 일치하지 않습니다.')
    if (!invite) return

    setSubmitting(true)

    try {
      // 1. Supabase Auth 가입
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            name,
            full_name: name,
            phone,
            invite_token: token,
          },
        },
      })

      if (authError) {
        if (authError.message.includes('already registered')) {
          setFormError('이미 가입된 이메일입니다. 로그인 페이지로 이동해주세요.')
        } else {
          setFormError(authError.message)
        }
        setSubmitting(false)
        return
      }

      if (!authData.user) {
        setFormError('가입 처리 중 오류가 발생했습니다.')
        setSubmitting(false)
        return
      }

      // 2. 초대 수락 처리 (서버에서 profile 생성 + 초대 상태 업데이트)
      const res = await fetch('/api/member-invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          user_id: authData.user.id,
          name,
          phone,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        setFormError(errData.error || '초대 수락 처리에 실패했습니다.')
        setSubmitting(false)
        return
      }

      setPageState('success')

      // 3초 후 로그인 페이지로
      setTimeout(() => {
        router.push('/login')
      }, 3000)
    } catch (err: any) {
      setFormError(err.message || '알 수 없는 오류가 발생했습니다.')
      setSubmitting(false)
    }
  }

  // ── 로딩
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-steel-200 border-t-steel-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-bold">초대 정보 확인 중...</p>
        </div>
      </div>
    )
  }

  // ── 만료/사용됨
  if (pageState === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-3xl p-10 shadow-xl max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-3">초대가 만료되었습니다</h2>
          <p className="text-gray-500 mb-8">이 초대 링크는 더 이상 유효하지 않습니다.<br/>관리자에게 새로운 초대를 요청해주세요.</p>
          <button onClick={() => router.push('/login')} className="px-8 py-3 bg-steel-600 text-white rounded-xl font-bold hover:bg-steel-700 transition-colors">
            로그인 페이지로
          </button>
        </div>
      </div>
    )
  }

  // ── 오류
  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-3xl p-10 shadow-xl max-w-md w-full text-center">
          <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-3">오류</h2>
          <p className="text-gray-500 mb-8">{errorMsg}</p>
          <button onClick={() => router.push('/login')} className="px-8 py-3 bg-steel-600 text-white rounded-xl font-bold hover:bg-steel-700 transition-colors">
            로그인 페이지로
          </button>
        </div>
      </div>
    )
  }

  // ── 가입 완료
  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-3xl p-10 shadow-xl max-w-md w-full text-center animate-fade-in-up">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
            <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-3xl font-black text-gray-900 mb-3">환영합니다, {name}님!</h2>
          <p className="text-gray-500 text-lg mb-2">가입이 완료되었습니다.</p>
          <p className="text-gray-400 text-sm mb-8">이메일 인증 후 로그인해주세요.</p>
          <div className="inline-flex items-center gap-2 text-steel-600 font-bold bg-steel-50 px-6 py-3 rounded-xl animate-pulse">
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            로그인 페이지로 이동 중...
          </div>
        </div>
      </div>
    )
  }

  // ── 가입 양식
  return (
    <div className="min-h-screen w-full flex bg-white font-sans text-gray-900">
      {/* 좌측 비주얼 */}
      <div className="hidden lg:flex w-1/2 bg-indigo-900 relative items-center justify-center overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-steel-600 to-slate-900 opacity-90 z-10"></div>
        <div className="relative z-20 text-white p-12 max-w-lg">
          <div className="mb-6">
            <span className="bg-white/20 text-white text-xs font-black px-3 py-1.5 rounded-lg uppercase tracking-wider">SELF-DISRUPTION</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-4 leading-tight">
            {invite?.company?.name || '회사'}에<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-300">초대되었습니다</span>
          </h1>
          <p className="text-lg text-white/70 leading-relaxed">
            아래 양식을 작성하고 비밀번호를 설정하면<br/>바로 서비스를 이용할 수 있습니다.
          </p>
          <div className="mt-8 space-y-3 text-white/60 text-sm">
            {invite?.department?.name && <p>부서: <span className="text-white font-bold">{invite.department.name}</span></p>}
            {invite?.position?.name && <p>직급: <span className="text-white font-bold">{invite.position.name}</span></p>}
            <p>권한: <span className="text-white font-bold">{invite?.role === 'master' ? '관리자' : '직원'}</span></p>
          </div>
        </div>
      </div>

      {/* 우측 폼 */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-16">
        <div className="w-full max-w-md space-y-6">
          <div>
            <span className="bg-steel-50 text-steel-700 text-xs font-black px-2 py-1 rounded-md uppercase tracking-wider">SELF-DISRUPTION</span>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">멤버 가입</h2>
            <p className="mt-2 text-gray-500 text-sm">
              <span className="font-bold text-steel-600">{invite?.company?.name}</span>의 멤버로 가입합니다.
            </p>
          </div>

          {/* 모바일에서만 보이는 초대 정보 */}
          <div className="lg:hidden bg-steel-50 rounded-xl p-4 text-sm space-y-1">
            {invite?.department?.name && <p className="text-gray-600">부서: <span className="font-bold text-gray-900">{invite.department.name}</span></p>}
            {invite?.position?.name && <p className="text-gray-600">직급: <span className="font-bold text-gray-900">{invite.position.name}</span></p>}
            <p className="text-gray-600">권한: <span className="font-bold text-gray-900">{invite?.role === 'master' ? '관리자' : '직원'}</span></p>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm font-bold text-red-600">{formError}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 이메일 (읽기전용) */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">이메일</label>
              <input
                type="email"
                value={invite?.email || ''}
                disabled
                className="w-full px-4 py-3.5 bg-gray-100 border border-gray-200 rounded-xl font-bold text-gray-500 cursor-not-allowed"
              />
            </div>

            {/* 이름 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">이름 (실명)</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-steel-500 font-bold"
                placeholder="홍길동"
                disabled={submitting}
              />
            </div>

            {/* 연락처 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">연락처</label>
              <input
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                maxLength={13}
                className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-steel-500 font-bold"
                placeholder="010-0000-0000"
                disabled={submitting}
              />
            </div>

            {/* 비밀번호 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={`w-full px-4 py-3.5 bg-gray-50 border rounded-xl outline-none font-bold ${password && !isValidPwd ? 'border-red-300 bg-red-50/50' : 'border-gray-200 focus:bg-white focus:border-steel-500'}`}
                placeholder="8자리 이상"
                disabled={submitting}
              />
              {password && !isValidPwd && (
                <p className="mt-1.5 ml-1 text-xs font-bold text-red-500">영문, 숫자, 특수문자 포함 8자리 이상</p>
              )}
            </div>

            {/* 비밀번호 확인 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">비밀번호 확인</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                className={`w-full px-4 py-3.5 bg-gray-50 border rounded-xl outline-none font-bold ${passwordConfirm && password !== passwordConfirm ? 'border-red-300 bg-red-50/50' : 'border-gray-200 focus:bg-white focus:border-steel-500'}`}
                placeholder="비밀번호 확인"
                disabled={submitting}
              />
              {passwordConfirm && password !== passwordConfirm && (
                <p className="mt-1.5 ml-1 text-xs font-bold text-red-500">비밀번호가 일치하지 않습니다</p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-steel-600 text-white rounded-xl font-black text-lg hover:bg-steel-700 shadow-lg shadow-steel-200 transition-all disabled:bg-gray-300 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                  가입 처리 중...
                </>
              ) : '가입 완료'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400">
            이미 계정이 있으신가요? <a href="/login" className="text-steel-600 font-bold hover:underline">로그인</a>
          </p>
        </div>
      </div>
    </div>
  )
}
