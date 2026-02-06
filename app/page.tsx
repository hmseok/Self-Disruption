'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from './utils/supabase'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // 폼 상태
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  // 👇 [추가] 회사 정보 상태
  const [companyName, setCompanyName] = useState('')
  const [businessNumber, setBusinessNumber] = useState('')
  const [isFounder, setIsFounder] = useState(true) // true: 대표(회사생성), false: 직원

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null)

  const [view, setView] = useState<'login' | 'signup-select' | 'signup-email' | 'reset-password'>('login')
  const [isMailSent, setIsMailSent] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [isValidPwd, setIsValidPwd] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // 1. 세션 체크
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) router.replace('/admin')
    }
    checkSession()
  }, [])

  // 2. 이메일 인증 완료 처리
  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      setMessage({ text: '🎉 인증 완료! 로그인해주세요.', type: 'success' })
      setView('login')
    }
  }, [searchParams])

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    let formatted = raw.length > 3 && raw.length <= 7 ? `${raw.slice(0, 3)}-${raw.slice(3)}` :
                    raw.length > 7 ? `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}` : raw;
    setPhone(formatted);
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (view === 'signup-email') {
        if (!name || !phone || !email || !password) return setMessage({ text: '필수 정보를 모두 입력해주세요.', type: 'error' })
        if (password !== passwordConfirm) return setMessage({ text: '비밀번호가 일치하지 않습니다.', type: 'error' })

        // 👇 회사 정보 필수 체크
        if (isFounder) {
          if (!companyName) return setMessage({ text: '회사명을 입력해주세요.', type: 'error' })
          if (!businessNumber) return setMessage({ text: '사업자등록번호를 입력해주세요.', type: 'error' })
        }
    }

    setLoading(true)

    try {
      if (view === 'signup-email') {
        // 👇 회원가입 시 메타데이터에 회사 정보 실어보내기
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              full_name: name,
              phone,
              // 대표자면 회사 정보 포함, 직원이면 제외
              company_name: isFounder ? companyName : null,
              business_number: isFounder ? businessNumber : null,
            }
          },
        })
        if (error) throw error

        if (data.user && !data.session) {
          setIsMailSent(true)
          setMessage({ text: '✅ 인증 메일이 발송되었습니다!', type: 'success' })
        } else if (data.session) {
          setMessage({ text: '🎉 가입되었습니다!', type: 'success' })
          setTimeout(() => { router.replace('/admin'); }, 1000)
        }
      } else {
        // 로그인
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.replace('/admin');
      }
    } catch (error: any) {
      setMessage({ text: error.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  // 아이콘 컴포넌트들 (생략 없이 포함)
  const EyeIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>)
  const EyeOffIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>)

  return (
    <div className="min-h-screen w-full flex bg-gray-50 font-sans text-gray-900">
      {/* 왼쪽 비주얼 영역 */}
      <div className="hidden lg:flex w-1/2 relative items-center justify-center overflow-hidden bg-white">
        <div className="absolute inset-0 z-0 bg-cover bg-center opacity-90" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2301&auto=format&fit=crop')" }}></div>
        <div className="absolute inset-0 bg-gradient-to-tr from-white/90 via-white/40 to-blue-50/30 z-10"></div>
        <div className="relative z-20 max-w-lg p-12">
          <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider shadow-lg shadow-blue-200">SecondLife ERP</span>
          <h1 className="text-5xl font-extrabold tracking-tight mb-6 leading-tight text-slate-900 mt-6">Smart work starts<br/>with <span className="text-blue-600">Clarity.</span></h1>
        </div>
      </div>

      {/* 오른쪽 폼 영역 */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-white overflow-y-auto">
        <div className="w-full max-w-[420px]">
          {/* 헤더 */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {view === 'login' && '다시 오셨네요! 👋'}
              {view === 'signup-select' && '가입 유형 선택'}
              {view === 'signup-email' && (isFounder ? '회사 설립 (대표자)' : '직원 가입')}
              {view === 'reset-password' && '비밀번호 재설정'}
            </h2>
            <p className="text-slate-500">
              {view === 'login' && '오늘도 생산적인 하루 되세요.'}
              {view === 'signup-email' && '필수 정보를 입력하여 시작하세요.'}
            </p>
          </div>

          {/* 회원가입 폼 */}
          {view === 'signup-email' && (
            <form onSubmit={handleAuth} className="space-y-4">
              {/* 가입 유형 탭 (대표 vs 직원) */}
              <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                <button type="button" onClick={()=>setIsFounder(true)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${isFounder ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>🏢 회사 설립 (대표)</button>
                <button type="button" onClick={()=>setIsFounder(false)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${!isFounder ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>👤 직원 합류</button>
              </div>

              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">이름</label>
                  <input type="text" value={name} onChange={e=>setName(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500" placeholder="홍길동" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">연락처</label>
                  <input type="tel" value={phone} onChange={handlePhoneChange} maxLength={13} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500" placeholder="010-0000-0000" />
                </div>
              </div>

              {/* 👇 [핵심] 대표자일 경우 회사 정보 입력 */}
              {isFounder && (
                <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div>
                    <label className="block text-sm font-semibold text-blue-900 mb-1">회사명</label>
                    <input type="text" value={companyName} onChange={e=>setCompanyName(e.target.value)} className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl outline-none focus:border-blue-500" placeholder="(주)세컨드라이프" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-blue-900 mb-1">사업자등록번호</label>
                    <input type="text" value={businessNumber} onChange={e=>setBusinessNumber(e.target.value)} className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl outline-none focus:border-blue-500" placeholder="000-00-00000" />
                  </div>
                </div>
              )}

              {/* 계정 정보 */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">이메일</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500" placeholder="name@company.com" />
              </div>
              <div className="relative">
                <label className="block text-sm font-semibold text-slate-700 mb-1">비밀번호</label>
                <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 pr-10" placeholder="8자리 이상" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400">{showPassword ? <EyeOffIcon /> : <EyeIcon />}</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">비밀번호 확인</label>
                <input type="password" value={passwordConfirm} onChange={e=>setPasswordConfirm(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500" placeholder="한 번 더 입력" />
              </div>

              {message && <div className={`p-3 rounded-lg text-sm font-medium ${message.type==='error'?'bg-red-50 text-red-600':'bg-green-50 text-green-700'}`}>{message.text}</div>}

              <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 transition-all mt-2">
                {loading ? '처리 중...' : isFounder ? '회사 생성 및 가입하기' : '직원으로 가입하기'}
              </button>
              <button type="button" onClick={() => setView('login')} className="w-full text-sm font-medium text-slate-400 hover:text-slate-600 mt-2">취소</button>
            </form>
          )}

          {/* 로그인 등 나머지 뷰는 그대로... (지면 관계상 핵심은 위와 같습니다) */}
          {/* (LoginView, SignupSelect 등 나머지 코드는 기존과 동일하게 유지됩니다) */}
          {view === 'login' && (
             <form onSubmit={handleAuth} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">이메일</label>
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all font-medium" placeholder="name@company.com" />
                </div>
                <div className="relative">
                    <div className="flex justify-between mb-1.5">
                      <label className="text-sm font-semibold text-slate-700">비밀번호</label>
                      <button type="button" onClick={() => setView('reset-password')} className="text-xs font-bold text-blue-600 hover:text-blue-700">비밀번호를 잊으셨나요?</button>
                    </div>
                    <div className="relative">
                        <input type={showPassword ? "text" : "password"} value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all font-medium pr-12" placeholder="••••••••" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPassword ? <EyeOffIcon /> : <EyeIcon />}</button>
                    </div>
                </div>
                {message && <div className={`p-3 rounded-lg text-sm font-medium ${message.type==='error'?'bg-red-50 text-red-600':'bg-blue-50 text-blue-700'}`}>{message.text}</div>}

                <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 hover:-translate-y-0.5 transition-all active:scale-[0.98] disabled:bg-slate-300 disabled:shadow-none">
                  {loading ? '로그인 중...' : '로그인'}
                </button>
                <div className="mt-8 text-center">
                  <p className="text-slate-500 text-sm">
                    아직 계정이 없으신가요?{' '}
                    <button onClick={() => setView('signup-select')} className="text-blue-600 font-bold hover:underline">회원가입</button>
                  </p>
                </div>
             </form>
          )}

          {view === 'signup-select' && (
            <div className="space-y-3">
              <button onClick={() => setView('signup-email')} className="w-full flex items-center justify-center gap-3 py-3.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 hover:border-slate-300 transition-all font-medium text-slate-700">
                  <span>✉️</span> 이메일로 시작하기
              </button>
              <div className="text-center mt-6">
                <button onClick={() => setView('login')} className="text-sm font-bold text-slate-400 hover:text-slate-600">
                  이미 계정이 있으신가요? 로그인
                </button>
              </div>
            </div>
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