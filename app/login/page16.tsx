'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()

  // 폼 상태
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null)

  const [view, setView] = useState<'login' | 'signup-select' | 'signup-email' | 'reset-password'>('login')

  const [isMailSent, setIsMailSent] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [isValidPwd, setIsValidPwd] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    const verifiedParam = searchParams.get('verified')
    if (verifiedParam === 'true') {
      setMessage({ text: '🎉 인증이 완료되었습니다! 로그인해주세요.', type: 'success' })
      setView('login')
    }
  }, [searchParams])

  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (isMailSent && !isVerified && view === 'signup-email') {
      intervalId = setInterval(async () => {
        const { data } = await supabase.auth.signInWithPassword({ email, password });
        if (data.session) {
            setIsVerified(true);
            setMessage({ text: '🎉 인증 확인 완료! [회원가입 완료] 버튼을 눌러주세요.', type: 'success' });
            clearInterval(intervalId);
        }
      }, 3000);
    }
    return () => clearInterval(intervalId);
  }, [isMailSent, isVerified, email, password, supabase, view]);

  const validatePassword = (pwd: string) => /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/.test(pwd);
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    let formatted = raw.length > 3 && raw.length <= 7 ? `${raw.slice(0, 3)}-${raw.slice(3)}` :
                    raw.length > 7 ? `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}` : raw;
    setPhone(formatted);
  }
  useEffect(() => { setIsValidPwd(validatePassword(password)) }, [password])

  const handleGoogleLogin = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/`,
          queryParams: { access_type: 'offline', prompt: 'select_account' },
        },
      })
      if (error) throw error
    } catch (error: any) {
      setMessage({ text: '구글 로그인 실패: ' + error.message, type: 'error' })
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return setMessage({ text: '가입하신 이메일을 입력해주세요.', type: 'error' })
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      })
      if (error) throw error
      setMessage({ text: '✅ 재설정 메일을 보냈습니다! 메일함을 확인해주세요.', type: 'success' })
      setIsMailSent(true)
    } catch (error: any) {
      setMessage({ text: '메일 전송 실패: ' + error.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const translateError = (errorMsg: string) => {
    if (errorMsg.includes('rate limit')) return '🚫 너무 많은 메일을 보냈습니다. 잠시 후 다시 시도해주세요.';
    if (errorMsg.includes('User already registered')) return '⚠️ 이미 가입된 이메일입니다. 로그인해주세요.';
    if (errorMsg.includes('Email not confirmed')) return '📧 이메일 인증이 필요합니다. 메일함을 확인해주세요.';
    if (errorMsg.includes('Invalid login credentials')) return '🚨 아이디 또는 비밀번호가 잘못되었습니다.';
    return '오류가 발생했습니다: ' + errorMsg;
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (isMailSent && isVerified) {
        setShowWelcome(true);
        setTimeout(() => { window.location.href = '/'; }, 2000);
        return
    }

    if (isMailSent && !isVerified) {
        setMessage({ text: '⏳ 인증을 확인하고 있습니다.', type: 'info' })
        return
    }

    if (!email || !password) return setMessage({ text: '이메일과 비밀번호를 입력해주세요.', type: 'error' })

    if (view === 'signup-email') {
        if (!name) return setMessage({ text: '이름을 입력해주세요.', type: 'error' })
        if (!phone) return setMessage({ text: '연락처를 입력해주세요.', type: 'error' })
        if (!isValidPwd) return setMessage({ text: '비밀번호 규칙을 확인해주세요.', type: 'error' })
        if (password !== passwordConfirm) return setMessage({ text: '비밀번호가 일치하지 않습니다.', type: 'error' })
    }

    setLoading(true)

    try {
      if (view === 'signup-email') {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { name, full_name: name, phone }
          },
        })
        if (error) throw error

        if (data.user && data.user.identities?.length === 0) {
            setMessage({ text: '⚠️ 이미 가입된 이메일입니다. 로그인해주세요.', type: 'info' })
            setLoading(false)
            return
        }

        if (data.user && !data.session) {
          setIsMailSent(true)
          setMessage({ text: '✅ 인증 메일이 발송되었습니다! 메일함을 확인해주세요.', type: 'success' })
        } else if (data.session) {
          setMessage({ text: '🎉 가입되었습니다!', type: 'success' })
          setTimeout(() => { window.location.href = '/'; }, 1000)
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        window.location.href = '/';
      }
    } catch (error: any) {
      setMessage({ text: translateError(error.message), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const resetSignup = () => { setIsMailSent(false); setIsVerified(false); setMessage(null); }

  const GoogleButton = ({ text = "Google 계정으로 시작" }: { text?: string }) => (
    <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 py-4 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 hover:border-gray-300 hover:shadow-md transition-all duration-200 group shadow-sm">
       <svg className="w-6 h-6" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
       <span className="font-bold text-gray-700 text-lg group-hover:text-gray-900">{text}</span>
    </button>
  )

  const EmailStartButton = () => (
    <button onClick={() => setView('signup-email')} className="w-full flex items-center justify-center gap-3 py-4 bg-indigo-50 border border-indigo-100 rounded-2xl hover:bg-indigo-100 hover:border-indigo-200 hover:shadow-md transition-all duration-200 group shadow-sm">
        <div className="w-6 h-6 flex items-center justify-center bg-indigo-100 rounded-full text-sm group-hover:scale-110 transition-transform">✉️</div>
        <span className="font-bold text-indigo-700 text-lg group-hover:text-indigo-900">이메일로 시작하기</span>
    </button>
  )

  const EyeIcon = () => (<svg className="w-5 h-5 text-gray-400 hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>)
  const EyeOffIcon = () => (<svg className="w-5 h-5 text-gray-400 hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>)

  // 🔴 여기서부터 렌더링(화면 그리기) 시작
  return (
    <div className="min-h-screen w-full flex bg-white font-sans text-gray-900">

      {/* 👇 왼쪽 디자인 영역 (수정된 도시 야경 디자인) */}
      <div className="hidden lg:flex w-1/2 relative items-center justify-center overflow-hidden bg-gray-900">
        <div
          className="absolute top-0 left-0 w-full h-full z-0 bg-cover bg-center transition-transform duration-[10s] hover:scale-110"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop')" }}
        ></div>
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-slate-900 via-indigo-950/80 to-slate-900/90 z-10"></div>
        <div className="relative z-20 p-12 max-w-lg text-left">
          <div className="inline-block px-3 py-1 mb-6 rounded-full border border-indigo-400/30 bg-indigo-500/10 backdrop-blur-sm">
            <span className="text-xs font-bold text-indigo-300 tracking-wider uppercase">Enterprise Edition</span>
          </div>
          <h1 className="text-5xl font-black tracking-tight mb-6 leading-tight text-white">
            The Standard of <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
              Smart Mobility
            </span>
          </h1>
          <p className="text-lg text-gray-300 leading-relaxed font-medium opacity-90">
            복잡한 차량 관리와 정산 업무를<br/>
            하나의 시스템으로 완벽하게 통제하세요.
          </p>
          <div className="mt-12 flex gap-8 border-t border-white/10 pt-8">
            <div>
              <p className="text-3xl font-bold text-white">99.9%</p>
              <p className="text-xs text-gray-400 mt-1 uppercase tracking-wide">System Uptime</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white">24/7</p>
              <p className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Monitoring</p>
            </div>
          </div>
        </div>
      </div>

      {/* 👇 오른쪽 로그인 폼 영역 (기존 로직 유지) */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-16 relative">
        <div className="w-full max-w-md space-y-8">
          {showWelcome ? (
            <div className="text-center animate-fade-in-up py-10">
                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
                    <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-3xl font-black text-gray-900 mb-3">환영합니다, {name || '대표'}님!</h2>
                <p className="text-gray-500 text-lg mb-8 leading-relaxed">성공적으로 가입되었습니다.<br/>이제 Sideline과 함께하세요.</p>
                <div className="inline-flex items-center justify-center gap-2 text-indigo-600 font-bold bg-indigo-50 px-6 py-3 rounded-xl animate-pulse">
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span>대시보드로 이동 중...</span>
                </div>
            </div>
          ) : (
            <>
              <div className="mb-2">
                <span className="bg-indigo-50 text-indigo-700 text-xs font-black px-2 py-1 rounded-md uppercase tracking-wider">Sideline</span>
                <span className="ml-2 text-gray-400 text-xs font-medium">관리자 전용 로그인</span>
              </div>

              <div className="text-center lg:text-left">
                <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
                  {view === 'login' && '환영합니다!'}
                  {view === 'signup-select' && '계정 만들기'}
                  {view === 'signup-email' && '정보 입력'}
                  {view === 'reset-password' && '비밀번호 재설정'}
                </h2>
                <p className="mt-2 text-gray-500 text-sm">
                  {view === 'login' && '서비스 이용을 위해 로그인해주세요.'}
                  {view === 'signup-select' && '가입 방식을 선택해주세요.'}
                  {view === 'signup-email' && '안전한 서비스 이용을 위해 정보를 입력해주세요.'}
                  {view === 'reset-password' && '가입하신 이메일로 링크를 보내드립니다.'}
                </p>
              </div>

              {view === 'signup-email' && (
                <form onSubmit={handleAuth} className="space-y-5 animate-fade-in-up">
                    <div className="group"><label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">이름 (실명)</label><input type="text" value={name} onChange={e=>setName(e.target.value)} disabled={isMailSent} className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold disabled:bg-gray-100" placeholder="홍길동" /></div>
                    <div className="group"><label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">연락처</label><input type="tel" value={phone} onChange={handlePhoneChange} disabled={isMailSent} maxLength={13} className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold disabled:bg-gray-100" placeholder="010-0000-0000" /></div>
                    <div className="group"><label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">이메일</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} disabled={isMailSent} className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold disabled:bg-gray-100" placeholder="name@example.com" />{!isMailSent && <p className="text-[11px] text-gray-400 mt-2 ml-1">※ 인증 메일이 발송됩니다.</p>}</div>
                    <div className="group relative">
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">비밀번호</label>
                        <div className="relative">
                            <input type={showPassword ? "text" : "password"} value={password} onChange={e=>setPassword(e.target.value)} disabled={isMailSent} className={`w-full px-4 py-3.5 bg-gray-50 border rounded-xl outline-none font-bold disabled:bg-gray-100 pr-12 ${password && !isValidPwd ? 'border-red-300 bg-red-50/50' : 'border-gray-200 focus:bg-white focus:border-indigo-500'}`} placeholder="8자리 이상" />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 transform -translate-y-1/2 focus:outline-none">{showPassword ? <EyeOffIcon /> : <EyeIcon />}</button>
                        </div>
                        {password && !isValidPwd && <p className="mt-2 ml-1 text-xs font-bold text-red-500">⚠️ 영문, 숫자, 특수문자 포함 8자리 이상</p>}
                    </div>
                    <div className="group relative">
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">비밀번호 확인</label>
                        <div className="relative">
                            <input type={showConfirmPassword ? "text" : "password"} value={passwordConfirm} onChange={e=>setPasswordConfirm(e.target.value)} disabled={isMailSent} className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold disabled:bg-gray-100 pr-12" placeholder="비밀번호 확인" />
                            <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 transform -translate-y-1/2 focus:outline-none">{showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}</button>
                        </div>
                    </div>
                    {message && <div className={`p-4 rounded-xl text-sm font-bold flex items-start gap-3 shadow-sm border ${message.type==='error'?'bg-red-50 border-red-100 text-red-600':message.type==='success'?'bg-green-50 border-green-100 text-green-700':'bg-blue-50 border-blue-100 text-blue-700'}`}><span>{message.type==='error'?'🚨':message.type==='success'?'✅':'ℹ️'}</span><span>{message.text}</span></div>}
                    <button type="submit" disabled={loading || (isMailSent && !isVerified)} className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all duration-300 text-lg flex items-center justify-center gap-2 relative ${!isMailSent ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 cursor-pointer' : isVerified ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 animate-pulse !cursor-pointer' : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'}`}>{loading ? '처리 중...' : !isMailSent ? '인증 메일 발송' : isVerified ? '🚀 회원가입 완료' : '⏳ 인증 확인 중... (메일함 확인)'}</button>
                    {isMailSent && !isVerified && <div className="text-center"><button type="button" onClick={resetSignup} className="text-xs text-gray-400 underline hover:text-gray-600">이메일 주소 다시 입력하기</button></div>}
                </form>
              )}

              {view === 'reset-password' && (
                <form onSubmit={handleResetPassword} className="space-y-6 animate-fade-in-up">
                  <div className="group">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">이메일</label>
                    <input type="email" value={email} onChange={e=>setEmail(e.target.value)} disabled={isMailSent} className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="가입한 이메일을 입력하세요" />
                  </div>
                  {message && <div className={`p-4 rounded-xl text-sm font-bold flex items-start gap-3 shadow-sm border ${message.type==='error'?'bg-red-50 border-red-100 text-red-600':'bg-green-50 border-green-100 text-green-700'}`}><span>{message.type==='error'?'🚨':'✅'}</span><span>{message.text}</span></div>}
                  <button type="submit" disabled={loading || isMailSent} className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all duration-300 text-lg ${isMailSent ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'}`}>{loading ? '전송 중...' : isMailSent ? '메일 발송 완료' : '🔒 재설정 메일 보내기'}</button>
                  <div className="text-center"><button type="button" onClick={() => { setView('login'); setMessage(null); }} className="text-sm font-bold text-gray-400 hover:text-gray-600 underline">로그인 화면으로 돌아가기</button></div>
                </form>
              )}

              {view === 'signup-email' && <div className="text-center pt-4 border-t border-gray-100"><button onClick={() => { resetSignup(); setView('login'); }} className="text-sm font-bold text-indigo-600 hover:underline">로그인 화면으로 돌아가기</button></div>}

              {view === 'login' && (
                <>
                  <GoogleButton text="Google 계정으로 로그인" />
                  <div className="relative flex items-center justify-center my-8"><div className="absolute w-full border-t border-gray-200"></div><span className="relative bg-white px-4 text-xs font-bold text-gray-400 uppercase tracking-wide">Or login with email</span></div>
                  <form onSubmit={handleAuth} className="space-y-4">
                    <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="이메일 주소" />
                    <div className="relative">
                        <input type={showPassword ? "text" : "password"} value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold pr-12" placeholder="비밀번호" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 transform -translate-y-1/2 focus:outline-none">{showPassword ? <EyeOffIcon /> : <EyeIcon />}</button>
                    </div>
                    {message && <div className={`p-4 rounded-xl text-sm font-bold border ${message.type==='error'?'bg-red-50 border-red-100 text-red-600':'bg-blue-50 border-blue-100 text-blue-700'}`}>{message.text}</div>}
                    <div className="flex justify-end gap-3 px-1">
                      <button type="button" onClick={() => alert('이메일(아이디)을 잊으신 경우 관리자에게 문의해주세요.')} className="text-xs text-gray-400 hover:text-gray-600 font-medium">아이디 찾기</button>
                      <span className="text-gray-300 text-xs">|</span>
                      <button type="button" onClick={() => { setView('reset-password'); setMessage(null); setEmail(''); }} className="text-xs text-indigo-500 hover:text-indigo-700 font-bold">비밀번호 찾기</button>
                    </div>
                    <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-200 hover:-translate-y-0.5 transition-all disabled:bg-gray-300">{loading ? '로그인 중...' : '로그인'}</button>
                  </form>
                  <div className="mt-8 pt-6 border-t border-gray-100">
                    <p className="text-center text-gray-500 text-sm mb-4">아직 계정이 없으신가요?</p>
                    <button onClick={() => setView('signup-select')} className="w-full py-4 rounded-xl border-2 border-indigo-100 text-indigo-600 font-bold hover:bg-indigo-50 hover:border-indigo-200 transition-all text-lg">✨ 새 계정 만들기</button>
                  </div>
                </>
              )}

              {view === 'signup-select' && (
                <div className="space-y-4">
                  <GoogleButton text="Google 계정으로 시작" />
                  <div className="relative flex items-center justify-center my-2"><span className="bg-white px-2 text-xs text-gray-300">또는</span></div>
                  <EmailStartButton />
                  <div className="text-center mt-8"><button onClick={() => setView('login')} className="text-sm font-bold text-gray-400 hover:text-gray-600 underline">이미 계정이 있으신가요? 로그인</button></div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">잠시만 기다려주세요...</div>}>
      <LoginForm />
    </Suspense>
  )
}