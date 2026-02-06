'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
// 👇 경로 확인 (utils 폴더 위치에 맞게 수정)
import { supabase } from '../utils/supabase'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // 📝 폼 상태 관리
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  // 🏢 회사 정보 상태
  const [companyName, setCompanyName] = useState('')
  const [businessNumber, setBusinessNumber] = useState('')
  const [isFounder, setIsFounder] = useState(true) // true: 대표, false: 직원

  // ⚙️ UI 상태
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null)
  const [view, setView] = useState<'login' | 'signup-select' | 'signup-email' | 'reset-password'>('login')

  const [isMailSent, setIsMailSent] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [isValidPwd, setIsValidPwd] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // 1. 세션 체크 (이미 로그인했으면 대시보드로)
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) router.replace('/admin')
    }
    checkSession()
  }, [])

  // 2. 이메일 인증 완료 후 복귀 처리
  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      setMessage({ text: '🎉 인증이 완료되었습니다! 로그인해주세요.', type: 'success' })
      setView('login')
    }
  }, [searchParams])

  // 3. 비밀번호 유효성 검사 (실시간)
  const validatePassword = (pwd: string) => /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/.test(pwd);
  useEffect(() => { setIsValidPwd(validatePassword(password)) }, [password])

  // 4. 연락처 자동 포맷팅
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    let formatted = raw.length > 3 && raw.length <= 7 ? `${raw.slice(0, 3)}-${raw.slice(3)}` :
                    raw.length > 7 ? `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}` : raw;
    setPhone(formatted);
  }

  // 5. 에러 메시지 번역기 (친절한 안내)
  const translateError = (errorMsg: string) => {
    if (errorMsg.includes('rate limit')) return '🚫 너무 많은 요청입니다. 잠시 후 다시 시도해주세요.';
    if (errorMsg.includes('User already registered')) return '⚠️ 이미 가입된 이메일입니다. 로그인해주세요.';
    if (errorMsg.includes('Email not confirmed')) return '📧 이메일 인증이 필요합니다. 메일함을 확인해주세요.';
    if (errorMsg.includes('Invalid login credentials')) return '🚨 이메일 또는 비밀번호가 일치하지 않습니다.';
    if (errorMsg.includes('등록된 회사가 없습니다')) return '🏢 입력하신 사업자번호로 등록된 회사를 찾을 수 없습니다.';
    if (errorMsg.includes('이미 등록된 사업자번호')) return '⚠️ 이미 등록된 사업자번호입니다. 직원으로 합류해주세요.';
    return '오류가 발생했습니다: ' + errorMsg;
  }

  // 🚀 통합 인증 처리 함수 (로그인/회원가입)
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    // 필수값 체크
    if (!email || !password) return setMessage({ text: '이메일과 비밀번호를 입력해주세요.', type: 'error' })

    if (view === 'signup-email') {
        if (!name) return setMessage({ text: '이름을 입력해주세요.', type: 'error' })
        if (!phone) return setMessage({ text: '연락처를 입력해주세요.', type: 'error' })
        if (!businessNumber) return setMessage({ text: '사업자등록번호를 입력해주세요.', type: 'error' })
        if (isFounder && !companyName) return setMessage({ text: '회사명을 입력해주세요.', type: 'error' })

        if (!isValidPwd) return setMessage({ text: '비밀번호 규칙(영문/숫자/특수문자 포함 8자)을 확인해주세요.', type: 'error' })
        if (password !== passwordConfirm) return setMessage({ text: '비밀번호가 일치하지 않습니다.', type: 'error' })
    }

    setLoading(true)

    try {
      if (view === 'signup-email') {
        // 회원가입 시도
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              full_name: name,
              phone,
              is_founder: isFounder, // DB 트리거가 이걸 보고 판단함
              company_name: isFounder ? companyName : null,
              business_number: businessNumber,
            }
          },
        })
        if (error) throw error

        if (data.user && !data.session) {
          setIsMailSent(true)
          setMessage({ text: '✅ 인증 메일이 발송되었습니다! 메일함을 확인해주세요.', type: 'success' })
        } else if (data.session) {
          setMessage({ text: '🎉 환영합니다! 가입이 완료되었습니다.', type: 'success' })
          setTimeout(() => { router.replace('/admin'); }, 1500)
        }
      } else {
        // 로그인 시도
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.replace('/admin');
      }
    } catch (error: any) {
      setMessage({ text: translateError(error.message), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/admin`,
          queryParams: { access_type: 'offline', prompt: 'select_account' },
        },
      })
      if (error) throw error
    } catch (error: any) {
      setMessage({ text: translateError(error.message), type: 'error' })
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return setMessage({ text: '가입하신 이메일을 입력해주세요.', type: 'error' })
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/admin`,
      })
      if (error) throw error
      setMessage({ text: '✅ 재설정 메일을 보냈습니다. 메일함을 확인해주세요.', type: 'success' })
      setIsMailSent(true)
    } catch (error: any) {
      setMessage({ text: translateError(error.message), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const EyeIcon = () => (<svg className="w-5 h-5 text-gray-400 hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>)
  const EyeOffIcon = () => (<svg className="w-5 h-5 text-gray-400 hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>)

  return (
    <div className="min-h-screen w-full flex bg-slate-50 font-sans text-gray-900">

      {/* 🖼️ 왼쪽: 브랜딩 비주얼 (Sideline) */}
      <div className="hidden lg:flex w-1/2 relative items-center justify-center overflow-hidden bg-white">
        <div className="absolute inset-0 z-0 bg-cover bg-center opacity-90" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2301&auto=format&fit=crop')" }}></div>
        <div className="absolute inset-0 bg-gradient-to-tr from-white/95 via-white/60 to-blue-100/30 z-10"></div>

        <div className="relative z-20 max-w-lg p-12">
          <div className="mb-6">
            <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider shadow-lg shadow-blue-200">
              Sideline ERP
            </span>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight mb-6 leading-tight text-slate-900">
            Work Smart,<br/>
            Play <span className="text-blue-600">Sideline.</span>
          </h1>
          <p className="text-xl text-slate-600 font-medium leading-relaxed">
            복잡한 업무는 사이드라인에 맡기고,<br/>
            비즈니스의 핵심에 집중하세요.
          </p>
          <div className="mt-12 flex gap-8">
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-slate-900">Easy</span>
              <span className="text-sm text-slate-500 font-medium">Auto-Setup</span>
            </div>
            <div className="h-12 w-px bg-slate-300"></div>
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-slate-900">Safe</span>
              <span className="text-sm text-slate-500 font-medium">Secure Data</span>
            </div>
          </div>
        </div>
      </div>

      {/* 📝 오른쪽: 통합 로그인/가입 폼 */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-white overflow-y-auto">
        <div className="w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-4 duration-700">

          {/* 헤더 */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {view === 'login' && '다시 오셨네요! 👋'}
              {view === 'signup-select' && '새로운 시작 🚀'}
              {view === 'signup-email' && '회원가입'}
              {view === 'reset-password' && '비밀번호 재설정'}
            </h2>
            <p className="text-slate-500 text-sm">
              {view === 'login' && '오늘도 생산적인 하루 되세요.'}
              {view === 'signup-select' && '가장 편한 방법으로 시작해보세요.'}
              {view === 'signup-email' && '기본 정보를 입력해주세요.'}
              {view === 'reset-password' && '가입한 이메일로 링크를 보내드립니다.'}
            </p>
          </div>

          {/* 1. 회원가입 화면 (통합 폼) */}
          {view === 'signup-email' && (
            <form onSubmit={handleAuth} className="space-y-5">

              {/* ✅ 가입 유형 선택 (라디오 버튼) */}
              <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
                <label className={`flex-1 flex items-center justify-center py-2.5 text-sm font-bold rounded-lg cursor-pointer transition-all ${isFounder ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <input type="radio" name="role" className="hidden" checked={isFounder} onChange={() => setIsFounder(true)} />
                  🏢 회사 설립 (대표)
                </label>
                <label className={`flex-1 flex items-center justify-center py-2.5 text-sm font-bold rounded-lg cursor-pointer transition-all ${!isFounder ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <input type="radio" name="role" className="hidden" checked={!isFounder} onChange={() => setIsFounder(false)} />
                  👤 직원 합류
                </label>
              </div>

              {/* 기본 정보 (공통) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">이름</label>
                  <input type="text" value={name} onChange={e=>setName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 transition-all font-medium" placeholder="홍길동" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">연락처</label>
                  <input type="tel" value={phone} onChange={handlePhoneChange} maxLength={13} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 transition-all font-medium" placeholder="010-0000-0000" />
                </div>
              </div>

              {/* 🏢 회사 정보 입력 (유형에 따라 다름) */}
              <div className={`p-5 rounded-xl border transition-all ${isFounder ? 'bg-blue-50/50 border-blue-100' : 'bg-slate-50 border-slate-200'}`}>
                {isFounder ? (
                  <>
                    <div className="mb-4">
                      <label className="block text-xs font-bold text-blue-700 mb-1">설립할 회사명</label>
                      <input type="text" value={companyName} onChange={e=>setCompanyName(e.target.value)} className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl outline-none focus:border-blue-500" placeholder="(주)사이드라인" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-blue-700 mb-1">사업자등록번호 (회사 생성용)</label>
                      <input type="text" value={businessNumber} onChange={e=>setBusinessNumber(e.target.value)} className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl outline-none focus:border-blue-500" placeholder="000-00-00000" />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">입사할 회사 사업자번호</label>
                    <input type="text" value={businessNumber} onChange={e=>setBusinessNumber(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl outline-none focus:border-blue-500" placeholder="000-00-00000" />
                    <p className="text-[11px] text-slate-400 mt-1.5">💡 관리자에게 전달받은 사업자번호를 입력해주세요.</p>
                  </div>
                )}
              </div>

              {/* 계정 정보 (공통) */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">이메일 (아이디)</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 transition-all font-medium" placeholder="name@company.com" />
              </div>

              <div className="relative">
                <label className="block text-xs font-bold text-slate-500 mb-1">비밀번호</label>
                <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={password} onChange={e=>setPassword(e.target.value)} className={`w-full px-4 py-3 bg-slate-50 border rounded-xl outline-none transition-all font-medium pr-10 ${password && !isValidPwd ? 'border-red-300 focus:border-red-500 bg-red-50/30' : 'border-slate-200 focus:bg-white focus:border-blue-500'}`} placeholder="8자리 이상" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPassword ? <EyeOffIcon /> : <EyeIcon />}</button>
                </div>
                {password && !isValidPwd && <p className="mt-1 text-xs text-red-500 font-bold">⚠️ 영문, 숫자, 특수문자 포함 8자리 이상</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">비밀번호 확인</label>
                <input type="password" value={passwordConfirm} onChange={e=>setPasswordConfirm(e.target.value)} className={`w-full px-4 py-3 bg-slate-50 border rounded-xl outline-none transition-all font-medium ${passwordConfirm && password !== passwordConfirm ? 'border-red-300 bg-red-50/30' : 'border-slate-200 focus:bg-white focus:border-blue-500'}`} placeholder="한 번 더 입력" />
                {passwordConfirm && password !== passwordConfirm && <p className="mt-1 text-xs text-red-500 font-bold">⚠️ 비밀번호가 일치하지 않습니다.</p>}
              </div>

              {message && <div className={`p-4 rounded-xl text-sm font-bold flex items-start gap-3 shadow-sm border ${message.type==='error'?'bg-red-50 border-red-100 text-red-600':message.type==='success'?'bg-green-50 border-green-100 text-green-700':'bg-blue-50 border-blue-100 text-blue-700'}`}><span>{message.type==='error'?'🚨':message.type==='success'?'✅':'ℹ️'}</span><span>{message.text}</span></div>}

              <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 transition-all mt-2 disabled:bg-slate-300 disabled:shadow-none">
                {loading ? '처리 중...' : isFounder ? '✨ 회사 생성 및 가입하기' : '🚀 입사 신청하기'}
              </button>
              <button type="button" onClick={() => setView('login')} className="w-full text-sm font-bold text-slate-400 hover:text-slate-600 mt-2 py-2">취소</button>
            </form>
          )}

          {/* 2. 로그인 화면 */}
          {view === 'login' && (
             <form onSubmit={handleAuth} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">이메일</label>
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 transition-all font-medium" placeholder="name@company.com" />
                </div>
                <div className="relative">
                    <div className="flex justify-between mb-1">
                      <label className="text-xs font-bold text-slate-500">비밀번호</label>
                      <button type="button" onClick={() => setView('reset-password')} className="text-xs font-bold text-blue-600 hover:text-blue-700">비밀번호 찾기</button>
                    </div>
                    <div className="relative">
                        <input type={showPassword ? "text" : "password"} value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 transition-all font-medium pr-10" placeholder="••••••••" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPassword ? <EyeOffIcon /> : <EyeIcon />}</button>
                    </div>
                </div>
                {message && <div className={`p-4 rounded-xl text-sm font-bold border ${message.type==='error'?'bg-red-50 border-red-100 text-red-600':'bg-blue-50 border-blue-100 text-blue-700'}`}>{message.text}</div>}

                <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 hover:-translate-y-0.5 transition-all active:scale-[0.98] disabled:bg-slate-300 disabled:shadow-none">
                  {loading ? '로그인 중...' : '로그인'}
                </button>
                <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                  <p className="text-slate-400 text-xs font-bold mb-3">아직 계정이 없으신가요?</p>
                  <button type="button" onClick={() => setView('signup-select')} className="w-full py-3.5 rounded-xl border-2 border-slate-100 text-slate-600 font-bold hover:bg-slate-50 hover:border-slate-200 transition-all">✨ 무료로 시작하기</button>
                </div>
             </form>
          )}

          {/* 3. 가입 방식 선택 */}
          {view === 'signup-select' && (
            <div className="space-y-3">
               <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 py-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm group">
                  <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  <span className="font-bold text-slate-600 group-hover:text-slate-800">Google 계정으로 시작</span>
               </button>
              <button onClick={() => setView('signup-email')} className="w-full flex items-center justify-center gap-3 py-4 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 hover:border-blue-200 transition-all shadow-sm group">
                  <span className="text-lg">✉️</span>
                  <span className="font-bold text-blue-700 group-hover:text-blue-800">이메일로 시작하기</span>
              </button>
              <div className="text-center mt-8">
                <button onClick={() => setView('login')} className="text-sm font-bold text-slate-400 hover:text-slate-600 underline">
                  이미 계정이 있으신가요? 로그인
                </button>
              </div>
            </div>
          )}

          {/* 4. 비밀번호 재설정 */}
          {view === 'reset-password' && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">가입한 이메일</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 transition-all font-medium" placeholder="name@company.com" />
              </div>
              {message && <div className={`p-4 rounded-xl text-sm font-bold border ${message.type==='error'?'bg-red-50 border-red-100 text-red-600':'bg-green-50 border-green-100 text-green-700'}`}>{message.text}</div>}
              <button type="submit" disabled={loading || isMailSent} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 transition-all disabled:bg-slate-300">{loading ? '전송 중...' : isMailSent ? '전송 완료' : '🔒 재설정 링크 보내기'}</button>
              <button type="button" onClick={() => { setView('login'); setMessage(null); }} className="w-full text-sm font-bold text-slate-400 hover:text-slate-600 mt-2">취소</button>
            </form>
          )}

          {/* 푸터 */}
          <div className="mt-12 text-center">
            <p className="text-xs text-slate-300 font-bold">
              © 2026 Sideline ERP. All rights reserved.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-white text-blue-600 font-bold animate-pulse">Loading Sideline...</div>}>
      <LoginForm />
    </Suspense>
  )
}