'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()

  // 💻 개발 환경인지 체크 (localhost 여부)
  const isLocal = process.env.NODE_ENV === 'development'

  // 폼 상태
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  // UI 상태
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null)
  const [view, setView] = useState<'login' | 'signup-select' | 'signup-email' | 'reset-password'>('login')

  const [isMailSent, setIsMailSent] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [isValidPwd, setIsValidPwd] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // 회사 정보 (대표 가입용)
  const [companyName, setCompanyName] = useState('')
  const [businessNumber, setBusinessNumber] = useState('')
  const [isFounder, setIsFounder] = useState(true)

  // 1. 세션 체크 (이미 로그인되어 있으면 바로 이동)
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) router.replace('/admin')
    }
    checkSession()
  }, [])

  // 2. 이메일 인증 확인
  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      setMessage({ text: '🎉 인증 완료! 로그인해주세요.', type: 'success' })
      setView('login')
    }
  }, [searchParams])

  // ⚡ 로컬 개발용: 프리패스 로그인 함수
  const handleDevLogin = async () => {
    setLoading(true)
    try {
      // 대표님의 개발용 계정 정보를 여기에 미리 넣어두면 됩니다!
      // (Supabase에 실제 존재하는 계정이어야 합니다)
      const devEmail = "sukhomin87@gmail.com" // 👈 대표님이 자주 쓰는 테스트 ID
      const devPassword = "!homin1019" // 👈 대표님이 자주 쓰는 테스트 PW

      const { error } = await supabase.auth.signInWithPassword({
        email: devEmail,
        password: devPassword
      })

      if (error) {
        // 계정이 없으면 에러가 나니, 알림을 띄웁니다.
        alert('개발용 계정 로그인이 실패했습니다. 코드의 devEmail, devPassword를 확인해주세요.')
        setLoading(false)
      } else {
        router.replace('/admin')
      }
    } catch (e) {
      setLoading(false)
    }
  }

  // ... (기존 검증 로직들 유지)
  const validatePassword = (pwd: string) => /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/.test(pwd);
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    let formatted = raw.length > 3 && raw.length <= 7 ? `${raw.slice(0, 3)}-${raw.slice(3)}` :
                    raw.length > 7 ? `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}` : raw;
    setPhone(formatted);
  }
  useEffect(() => { setIsValidPwd(validatePassword(password)) }, [password])

  const translateError = (errorMsg: string) => {
    if (errorMsg.includes('Invalid login credentials')) return '🚨 아이디 또는 비밀번호가 틀렸습니다.';
    if (errorMsg.includes('Email not confirmed')) return '📧 이메일 인증이 필요합니다.';
    return '오류: ' + errorMsg;
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    setLoading(true)

    try {
      if (view === 'signup-email') {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              full_name: name,
              phone,
              is_founder: isFounder,
              company_name: isFounder ? companyName : null,
              business_number: businessNumber,
            }
          },
        })
        if (error) throw error
        if (data.session) {
            setMessage({ text: '🎉 가입 완료! 이동 중...', type: 'success' })
            setTimeout(() => { router.replace('/admin'); }, 1500)
        } else {
            setIsMailSent(true)
            setMessage({ text: '✅ 인증 메일이 발송되었습니다.', type: 'success' })
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.replace('/admin')
      }
    } catch (error: any) {
      setMessage({ text: translateError(error.message), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/admin` },
    })
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    // ... (기존 비번 찾기 로직)
  }

  // 아이콘 컴포넌트
  const EyeIcon = () => (<svg className="w-5 h-5 text-gray-400 hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>)
  const EyeOffIcon = () => (<svg className="w-5 h-5 text-gray-400 hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>)

  return (
    <div className="min-h-screen w-full flex bg-white font-sans text-gray-900">

      {/* 왼쪽 디자인 (Sideline) */}
      <div className="hidden lg:flex w-1/2 relative items-center justify-center overflow-hidden bg-gray-900">
        <div className="absolute inset-0 z-0 bg-cover bg-center opacity-80" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop')" }}></div>
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-900 via-indigo-950/80 to-slate-900/90 z-10"></div>
        <div className="relative z-20 p-12 max-w-lg">
          <span className="text-indigo-300 font-bold tracking-wider uppercase text-xs border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 rounded-full">Enterprise Edition</span>
          <h1 className="text-5xl font-black mt-6 text-white leading-tight">
            The Standard of <br/><span className="text-indigo-400">Smart Mobility</span>
          </h1>
          <p className="text-gray-300 mt-6 text-lg">복잡한 업무는 Sideline에 맡기고,<br/>비즈니스의 핵심에 집중하세요.</p>
        </div>
      </div>

      {/* 오른쪽 폼 */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-16 relative">
        <div className="w-full max-w-md">

          {/* 👇 [핵심] 개발 환경에서만 보이는 프리패스 버튼 */}
          {isLocal && view === 'login' && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
               <p className="text-xs font-bold text-yellow-800 mb-2">⚡️ Localhost Dev Mode</p>
               <button
                onClick={handleDevLogin}
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-bold py-3 rounded-lg text-sm transition-colors shadow-sm"
               >
                 개발자 계정으로 바로 입장하기 🚀
               </button>
            </div>
          )}

          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900">
              {view === 'login' && '환영합니다! 👋'}
              {view === 'signup-select' && '새로운 시작 🚀'}
              {view === 'signup-email' && '회원가입'}
              {view === 'reset-password' && '비밀번호 재설정'}
            </h2>
            <p className="text-gray-500 mt-2 text-sm">Sideline ERP 관리자 페이지입니다.</p>
          </div>

          {/* ... (나머지 폼 UI는 기존 page16.tsx와 동일하게 구성 - 지면 관계상 핵심만 표시) */}

          {view === 'login' && (
             <form onSubmit={handleAuth} className="space-y-4">
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3.5 bg-gray-50 border rounded-xl" placeholder="이메일" />
                <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-4 py-3.5 bg-gray-50 border rounded-xl pr-12" placeholder="비밀번호" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">{showPassword ? <EyeOffIcon /> : <EyeIcon />}</button>
                </div>
                {message && <div className={`p-3 rounded-lg text-sm font-bold ${message.type==='error'?'bg-red-50 text-red-600':'bg-green-50 text-green-700'}`}>{message.text}</div>}

                <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-200">
                  {loading ? '로그인 중...' : '로그인'}
                </button>

                <div className="mt-6 text-center">
                  <button type="button" onClick={() => setView('signup-select')} className="text-indigo-600 font-bold hover:underline">회원가입</button>
                  <span className="mx-2 text-gray-300">|</span>
                  <button type="button" onClick={() => setView('reset-password')} className="text-gray-400 font-bold hover:text-gray-600">비밀번호 찾기</button>
                </div>
             </form>
          )}

          {/* 회원가입 폼 (축약: 기존 코드와 동일) */}
          {view === 'signup-select' && (
            <div className="space-y-3">
              <button onClick={handleGoogleLogin} className="w-full py-3.5 border rounded-xl font-bold text-gray-600 hover:bg-gray-50">Google로 시작</button>
              <button onClick={() => setView('signup-email')} className="w-full py-3.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl font-bold hover:bg-indigo-100">이메일로 시작</button>
              <div className="text-center mt-4"><button onClick={() => setView('login')} className="text-sm text-gray-400 underline">돌아가기</button></div>
            </div>
          )}

          {view === 'signup-email' && (
             <form onSubmit={handleAuth} className="space-y-4">
               {/* 탭 버튼 */}
               <div className="flex bg-gray-100 p-1 rounded-xl mb-4">
                 <button type="button" onClick={()=>setIsFounder(true)} className={`flex-1 py-2 text-sm font-bold rounded-lg ${isFounder?'bg-white text-indigo-600 shadow':'text-gray-500'}`}>🏢 대표</button>
                 <button type="button" onClick={()=>setIsFounder(false)} className={`flex-1 py-2 text-sm font-bold rounded-lg ${!isFounder?'bg-white text-indigo-600 shadow':'text-gray-500'}`}>👤 직원</button>
               </div>
               {/* 입력 필드들... (위 page16.tsx 참조하여 그대로 사용) */}
               <input type="text" value={name} onChange={e=>setName(e.target.value)} className="w-full px-4 py-3 border rounded-xl" placeholder="이름" />
               <input type="tel" value={phone} onChange={handlePhoneChange} className="w-full px-4 py-3 border rounded-xl" placeholder="연락처" />
               <input type="text" value={businessNumber} onChange={e=>setBusinessNumber(e.target.value)} className="w-full px-4 py-3 border rounded-xl" placeholder={isFounder ? "사업자번호 (생성)" : "입사할 회사 사업자번호"} />
               {isFounder && <input type="text" value={companyName} onChange={e=>setCompanyName(e.target.value)} className="w-full px-4 py-3 border rounded-xl" placeholder="회사명" />}
               <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3 border rounded-xl" placeholder="이메일" />
               <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-4 py-3 border rounded-xl" placeholder="비밀번호" />
               <input type="password" value={passwordConfirm} onChange={e=>setPasswordConfirm(e.target.value)} className="w-full px-4 py-3 border rounded-xl" placeholder="비밀번호 확인" />

               <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl mt-2">가입하기</button>
               <button type="button" onClick={() => setView('login')} className="w-full text-sm text-gray-400 mt-2">취소</button>
             </form>
          )}

        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}