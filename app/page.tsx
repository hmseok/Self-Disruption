'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

function AuthPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const isLocal = process.env.NODE_ENV === 'development'

  // 상태 관리: 'verify' 상태 추가 (인증 대기 화면)
  const [view, setView] = useState<'login' | 'signup' | 'verify'>('login')
  const [roleType, setRoleType] = useState<'founder' | 'employee'>('founder')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null)

  // 입력 데이터
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    passwordConfirm: '',
    name: '',
    phone: '',
    companyName: '',
    businessNumber: '',
  })

  const [guides, setGuides] = useState({
    email: '업무용 이메일을 입력해주세요.',
    password: '영문, 숫자 포함 8자 이상 입력해주세요.',
    passwordConfirm: '비밀번호를 한 번 더 입력해주세요.',
    phone: '숫자만 입력 (예: 01012345678)',
    companyName: '재직 중이거나 설립할 회사명',
  })

  const [validity, setValidity] = useState({
    email: false,
    password: false,
    passwordConfirm: false,
    phone: false,
    companyName: false,
  })

 // app/page.tsx 수정

 // ... 기존 코드 ...

   // app/page.tsx 내부의 AuthPage 컴포넌트 안쪽

     // ... (상태 변수들 아래에 위치)

     // ✅ [수정됨] 강력한 인증 감지 로직 (리스너 + 폴링 이중 체크)
     useEffect(() => {
       // 1. 이벤트 리스너 (수동적 감지)
       const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
         if (event === 'SIGNED_IN' || session) {
           // 인증 확인되면 바로 이동
           router.replace('/admin')
         }
       })

       // 2. 인터벌 체크 (능동적 감지) - 2초마다 세션 강제 확인
       // 브라우저 탭 간 통신이 늦을 경우를 대비한 안전장치입니다.
       const interval = setInterval(async () => {
         const { data: { session } } = await supabase.auth.getSession()
         if (session) {
           router.replace('/admin')
         }
       }, 2000)

       return () => {
         subscription.unsubscribe()
         clearInterval(interval)
       }
     }, [supabase, router])

     // ... (나머지 코드 동일)

 // ... 나머지 코드 ...
  // 입력 핸들러
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    if (name === 'email') {
      const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      setValidity(prev => ({ ...prev, email: isValid }))
      setGuides(prev => ({ ...prev, email: isValid ? '✅ 유효한 이메일 형식입니다.' : '올바른 이메일 형식을 입력해주세요.' }))
    }
    if (name === 'password') {
      const isValid = value.length >= 8
      setValidity(prev => ({ ...prev, password: isValid }))
      setGuides(prev => ({ ...prev, password: isValid ? '✅ 안전한 비밀번호입니다.' : '최소 8자 이상 입력해야 합니다.' }))
    }
    if (name === 'passwordConfirm') {
      const isValid = value === formData.password && value.length > 0
      setValidity(prev => ({ ...prev, passwordConfirm: isValid }))
      setGuides(prev => ({ ...prev, passwordConfirm: isValid ? '✅ 비밀번호가 일치합니다.' : '비밀번호가 일치하지 않습니다.' }))
    }
    if (name === 'phone') {
      const onlyNums = value.replace(/[^0-9]/g, '')
      const isValid = onlyNums.length >= 10
      setValidity(prev => ({ ...prev, phone: isValid }))
      setGuides(prev => ({ ...prev, phone: isValid ? '✅ 확인되었습니다.' : '연락처 숫자를 정확히 입력해주세요.' }))
    }
    if (name === 'companyName') {
      const isValid = value.trim().length > 1
      setValidity(prev => ({ ...prev, companyName: isValid }))
      setGuides(prev => ({ ...prev, companyName: isValid ? '✅ 입력되었습니다.' : '회사명을 정확히 입력해주세요.' }))
    }
  }

  // ⚡ 개발자 로그인
  const handleDevLogin = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: "admin@sideline.com",
      password: "password1234!!"
    })
    if (error) {
       setMessage({ text: '개발자 계정 로그인 실패', type: 'error' })
       setLoading(false)
    }
  }

  // 로그인 처리
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password
    })

    if (error) {
      setMessage({ text: '계정 정보를 찾을 수 없습니다.', type: 'error' })
      setLoading(false)
    } else {
      router.refresh()
      router.replace('/admin')
    }
  }

  // ✅ 2. 회원가입 함수 수정 (Redirect URL 변경)
    const handleSignUp = async (e: React.FormEvent) => {
      e.preventDefault()

      // ... 유효성 검사 등 기존 코드 유지

    if (!validity.email || !validity.password || !validity.passwordConfirm || !validity.companyName) {
      setMessage({ text: '입력 항목을 확인해주세요.', type: 'error' })
      return
    }

    setLoading(true)
    setMessage(null)

   const { error } = await supabase.auth.signUp({
         email: formData.email,
         password: formData.password,
         options: {
           // ✨ 여기가 핵심! 인증 후 'callback' 라우트로 보냄
           emailRedirectTo: `${window.location.origin}/auth/callback`,
           data: {
             full_name: formData.name,
             phone: formData.phone,
             role: roleType === 'founder' ? 'master' : 'user',
             company_name: formData.companyName,
             business_number: roleType === 'founder' ? formData.businessNumber : null,
           }
         }
       })

       // ... 성공 처리 코드 유지
    if (error) {
      setMessage({ text: error.message, type: 'error' })
      setLoading(false)
      return
    }

    // 성공 시 'verify' 화면으로 전환 (로그인 화면으로 안 보냄)
    setLoading(false)
    setView('verify')
  }

  // 🔄 [수동] 인증 확인 버튼 핸들러 (자동 감지 실패 시 대비용)
  const checkVerification = async () => {
    setLoading(true)
    // 세션 새로고침 시도
    const { data: { session }, error } = await supabase.auth.refreshSession()

    if (session) {
       router.replace('/admin')
    } else {
       // 단순히 로그인 시도 (비번 입력 없이 이메일만으로 체크 불가하므로, 사용자에게 로그인 유도)
       setMessage({ text: '아직 인증이 완료되지 않았습니다. 메일의 링크를 클릭하셨나요?', type: 'error' })
       setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full font-sans bg-slate-50 text-slate-900">

      {/* ⬛ Left Panel */}
      <div className="hidden lg:flex w-5/12 bg-slate-900 text-white flex-col justify-between p-16 relative">
        <div className="z-10">
          <span className="inline-block px-3 py-1 bg-white/10 rounded-full text-xs font-bold tracking-widest uppercase mb-6 border border-white/20">
            Enterprise Standard
          </span>
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight">
            Sideline <br/>
            <span className="text-slate-400">ERP Solution.</span>
          </h1>
          <div className="w-16 h-1.5 bg-blue-600 mt-8"></div>
        </div>
        <div className="z-10 space-y-8">
           <div className="space-y-2">
             <h3 className="text-lg font-bold text-white">Always Connected</h3>
             <p className="text-sm text-slate-400 leading-relaxed">
               어디서든 안전하게 접속하세요.<br/>실시간 데이터 동기화로 업무의 연속성을 보장합니다.
             </p>
           </div>
        </div>
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 5% 10%, rgba(255,255,255,0.15) 0%, transparent 20%)' }}></div>
      </div>

      {/* ⬜ Right Panel */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 lg:p-12 overflow-y-auto">
        <div className="w-full max-w-[480px]">

          {/* ✨ [Verify View] 인증 대기 화면 ✨ */}
          {view === 'verify' ? (
            <div className="text-center animate-fade-in-up">
              <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">
                📩
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 mb-3">
                인증 메일 발송 완료!
              </h2>
              <p className="text-slate-500 mb-8 leading-relaxed">
                <span className="font-bold text-slate-900">{formData.email}</span> 으로<br/>
                인증 메일을 보냈습니다.<br/>
                메일함의 링크를 클릭하면 <span className="text-blue-600 font-bold">자동으로 로그인</span>됩니다.
              </p>

              <div className="space-y-3">
                <div className="p-4 bg-slate-100 rounded-xl text-sm text-slate-600 mb-6 flex items-center justify-center gap-2">
                   <span className="animate-spin">⏳</span> 인증 확인 중... (링크를 클릭해주세요)
                </div>

                <button
                  onClick={() => window.open('https://mail.google.com', '_blank')}
                  className="w-full py-4 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all"
                >
                  지메일(Gmail) 열기
                </button>

                <button
                  onClick={() => setView('login')}
                  className="text-sm text-slate-400 font-medium hover:text-slate-600 underline decoration-slate-300 underline-offset-4"
                >
                  로그인 화면으로 돌아가기
                </button>
              </div>
            </div>
          ) : (
            // 기존 Login / Signup 화면
            <>
              <div className="mb-10">
                <h2 className="text-3xl font-extrabold text-slate-900">
                  {view === 'login' ? 'Sign In' : 'Create Account'}
                </h2>
                <p className="text-slate-500 mt-2 font-medium text-sm">
                  {view === 'login' ? '등록된 비즈니스 계정으로 접속하세요.' : '기업 및 팀 관리를 위한 계정을 생성합니다.'}
                </p>
              </div>

              <form onSubmit={view === 'login' ? handleLogin : handleSignUp} className="space-y-5">

                {/* 탭 버튼들 (Signup only) */}
                {view === 'signup' && (
                   <div className="p-1.5 bg-slate-100 rounded-xl flex gap-1 mb-6">
                     <button type="button" onClick={() => setRoleType('founder')} className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${roleType === 'founder' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>기업 대표</button>
                     <button type="button" onClick={() => setRoleType('employee')} className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${roleType === 'employee' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>직원</button>
                   </div>
                )}

                {/* 이메일 */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide ml-1">Email</label>
                  <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="name@company.com" className={`w-full px-4 py-3.5 bg-white border rounded-xl outline-none font-medium text-slate-900 ${validity.email ? 'border-slate-300 focus:border-slate-900' : 'border-slate-200'}`}/>
                  {view === 'signup' && <p className={`text-xs ml-1 ${validity.email ? 'text-blue-600' : 'text-slate-400'}`}>{guides.email}</p>}
                </div>

                {/* 비밀번호 */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide ml-1">Password</label>
                  <input name="password" type="password" value={formData.password} onChange={handleChange} placeholder="••••••••" className={`w-full px-4 py-3.5 bg-white border rounded-xl outline-none font-medium text-slate-900 ${validity.password ? 'border-slate-300 focus:border-slate-900' : 'border-slate-200'}`}/>
                  {view === 'signup' && <p className={`text-xs ml-1 ${validity.password ? 'text-blue-600' : 'text-slate-400'}`}>{guides.password}</p>}
                </div>

                {/* Signup 추가 필드들 */}
                {view === 'signup' && (
                  <div className="animate-fade-in-down space-y-5">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase ml-1">Confirm PW</label>
                      <input name="passwordConfirm" type="password" value={formData.passwordConfirm} onChange={handleChange} placeholder="••••••••" className={`w-full px-4 py-3.5 bg-white border rounded-xl outline-none font-medium text-slate-900 ${validity.passwordConfirm ? 'border-slate-300 focus:border-slate-900' : 'border-slate-200'}`}/>
                    </div>
                    <div className="w-full h-px bg-slate-100 my-2"></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                         <label className="text-xs font-bold text-slate-600 uppercase ml-1">Name</label>
                         <input name="name" type="text" onChange={handleChange} placeholder="실명" className="w-full px-4 py-3.5 bg-white border border-slate-300 rounded-xl outline-none font-medium"/>
                      </div>
                      <div className="space-y-1">
                         <label className="text-xs font-bold text-slate-600 uppercase ml-1">Phone</label>
                         <input name="phone" type="tel" onChange={handleChange} placeholder="01012345678" className={`w-full px-4 py-3.5 bg-white border rounded-xl outline-none font-medium ${validity.phone ? 'border-slate-300 focus:border-slate-900' : 'border-slate-200'}`}/>
                      </div>
                    </div>
                    <div className="space-y-1">
                       <label className="text-xs font-bold text-slate-600 uppercase ml-1">{roleType === 'founder' ? 'Corporate Name' : 'Company Name'}</label>
                       <input name="companyName" type="text" onChange={handleChange} placeholder={roleType === 'founder' ? "(주)법인명" : "재직 회사명"} className={`w-full px-4 py-3.5 bg-white border rounded-xl outline-none font-medium text-slate-900 ${validity.companyName ? 'border-slate-300 focus:border-slate-900' : 'border-slate-200'}`}/>
                    </div>
                    {roleType === 'founder' && (
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 uppercase ml-1">Business No.</label>
                        <input name="businessNumber" type="text" onChange={handleChange} placeholder="000-00-00000" className="w-full px-4 py-3.5 bg-white border border-slate-300 rounded-xl outline-none font-medium"/>
                      </div>
                    )}
                  </div>
                )}

                {/* 메시지 & 버튼 */}
                {message && (
                  <div className={`p-4 rounded-xl text-sm font-bold flex items-center gap-2 border ${message.type === 'error' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-green-50 border-green-100 text-green-800'}`}>
                    <span>{message.type === 'error' ? '🛑' : '✅'}</span>
                    {message.text}
                  </div>
                )}

                <button disabled={loading} className="w-full py-4 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-base shadow-lg transition-all disabled:opacity-50 mt-4">
                  {loading ? 'Processing...' : (view === 'login' ? '로그인 (Sign In)' : '계정 생성 (Create Account)')}
                </button>

                {isLocal && view === 'login' && (
                   <div className="pt-2">
                     <button type="button" onClick={handleDevLogin} className="w-full py-2 bg-yellow-50 text-yellow-700 text-xs font-bold rounded hover:bg-yellow-100 border border-yellow-200 border-dashed">🛠️ Local Dev Pass</button>
                   </div>
                )}
              </form>

              <div className="pt-8 border-t border-slate-200 text-center">
                <button
                  onClick={() => {
                     setView(view === 'login' ? 'signup' : 'login')
                     setMessage(null)
                     setFormData({ email:'', password:'', passwordConfirm:'', name:'', phone:'', companyName:'', businessNumber:'' })
                  }}
                  className="text-sm font-extrabold text-slate-900 hover:text-blue-600 transition-colors"
                >
                  {view === 'login' ? '엔터프라이즈 계정 생성하기 →' : '로그인 화면으로 돌아가기'}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return <Suspense><AuthPage /></Suspense>
}