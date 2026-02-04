'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../utils/supabase'

export default function LoginPage() {
  const router = useRouter()

  // 폼 상태
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('') // 📞 연락처 추가

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null)
  const [view, setView] = useState<'login' | 'signup-select' | 'signup-email'>('login')

  // 비밀번호 유효성 체크
  const [isValidPwd, setIsValidPwd] = useState(false)

  const validatePassword = (pwd: string) => {
    const regex = /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/;
    return regex.test(pwd);
  }

  // 자동 하이픈 처리 함수 (010-1234-5678)
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    let formatted = raw;
    if (raw.length > 3 && raw.length <= 7) {
      formatted = `${raw.slice(0, 3)}-${raw.slice(3)}`;
    } else if (raw.length > 7) {
      formatted = `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}`;
    }
    setPhone(formatted);
  }

  useEffect(() => {
    setIsValidPwd(validatePassword(password))
  }, [password])

  // 구글 로그인
  const handleGoogleLogin = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          queryParams: { access_type: 'offline', prompt: 'select_account' },
        },
      })
      if (error) throw error
    } catch (error: any) {
      setMessage({ text: '구글 로그인 실패: ' + error.message, type: 'error' })
      setLoading(false)
    }
  }

  // 인증 처리
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (!email || !password) return setMessage({ text: '이메일과 비밀번호를 입력해주세요.', type: 'error' })

    // 회원가입 전용 검사
    if (view === 'signup-email') {
        if (!name) return setMessage({ text: '이름(실명)을 입력해주세요.', type: 'error' })
        if (!phone) return setMessage({ text: '연락처를 입력해주세요.', type: 'error' }) // 📞 체크
        if (!isValidPwd) return setMessage({ text: '비밀번호 규칙을 확인해주세요.', type: 'error' })
        if (password !== passwordConfirm) return setMessage({ text: '비밀번호가 일치하지 않습니다.', type: 'error' })
    }

    setLoading(true)

    try {
      if (view === 'signup-email') {
        // 🟢 [회원가입]
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            // 메타데이터에 이름, 연락처 저장 -> 트리거가 자동으로 profiles 테이블로 복사함
            data: {
                name: name,
                full_name: name,
                phone: phone
            }
          },
        })
        if (error) throw error

        if (data.user && !data.session) {
          setMessage({ text: '✅ 인증 메일이 발송되었습니다! 메일함을 확인해주세요.', type: 'success' })
        } else if (data.session) {
          setMessage({ text: '🎉 가입 성공! 로그인 중입니다...', type: 'success' })
          setTimeout(() => { router.push('/'); router.refresh(); }, 1000)
        }
      } else {
        // 🔵 [로그인]
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/')
        router.refresh()
      }
    } catch (error: any) {
      setMessage({ text: error.message || '오류가 발생했습니다.', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-white font-sans text-gray-900">

      {/* 좌측 비주얼 */}
      <div className="hidden lg:flex w-1/2 bg-indigo-900 relative items-center justify-center overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-600 to-slate-900 opacity-90 z-10"></div>
        <div className="relative z-20 text-white p-12 max-w-lg">
          <h1 className="text-5xl font-black tracking-tight mb-6 leading-tight">
            Start Your <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-300">Journey</span>
          </h1>
          <p className="text-lg text-indigo-100 leading-relaxed opacity-90">
            가입부터 관리까지, 모든 과정이 심플합니다.<br/>지금 바로 Sideline을 경험해보세요.
          </p>
        </div>
      </div>

      {/* 우측 폼 영역 */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-16 relative">
        <div className="w-full max-w-md space-y-8">

          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
              {view === 'login' && '환영합니다!'}
              {view === 'signup-select' && '계정 만들기'}
              {view === 'signup-email' && '정보 입력'}
            </h2>
            <p className="mt-2 text-gray-500 text-sm">
              {view === 'login' && '이메일 또는 소셜 계정으로 로그인하세요.'}
              {view === 'signup-select' && '가입 방식을 선택해주세요.'}
              {view === 'signup-email' && '안전한 서비스 이용을 위해 정보를 입력해주세요.'}
            </p>
          </div>

          {/* 1. 로그인 화면 */}
          {view === 'login' && (
            <>
              <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-bold text-gray-700 shadow-sm">
                 <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                 Google 계정으로 로그인
              </button>
              <div className="relative flex justify-center text-xs uppercase my-4"><span className="bg-white px-2 text-gray-400 font-medium">Or login with email</span></div>

              <form onSubmit={handleAuth} className="space-y-4">
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="이메일 주소 (아이디)" />
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="비밀번호" />
                <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-200 disabled:bg-gray-300">
                    {loading ? '로그인 중...' : '로그인'}
                </button>
              </form>
            </>
          )}

          {/* 2. 가입 방식 선택 (생략 - 기존과 동일) */}
          {view === 'signup-select' && (
            <div className="space-y-4">
               <button onClick={handleGoogleLogin} className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md transition-all">
                 <div className="flex items-center gap-3"><div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full text-lg">G</div><div className="text-left"><p className="font-bold text-gray-800 text-sm">Google로 시작하기</p></div></div><span className="text-indigo-500">→</span>
               </button>
               <button onClick={() => setView('signup-email')} className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md transition-all">
                 <div className="flex items-center gap-3"><div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full text-lg">✉️</div><div className="text-left"><p className="font-bold text-gray-800 text-sm">이메일로 시작하기</p></div></div><span className="text-indigo-500">→</span>
               </button>
            </div>
          )}

          {/* 3. 이메일 가입 상세 폼 */}
          {view === 'signup-email' && (
            <form onSubmit={handleAuth} className="space-y-4 animate-fade-in-up">
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">이름 (실명)</label>
                    <input type="text" value={name} onChange={e=>setName(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="홍길동" />
                </div>

                {/* 📞 연락처 입력 필드 추가 */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">연락처</label>
                    <input
                        type="tel"
                        value={phone}
                        onChange={handlePhoneChange}
                        maxLength={13}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold"
                        placeholder="010-0000-0000"
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">이메일</label>
                    <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="name@example.com" />
                    <p className="text-[11px] text-gray-400 mt-1 ml-1 font-medium">※ 이메일은 로그인 아이디로 사용되며, 인증 메일이 발송됩니다.</p>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">비밀번호</label>
                    <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className={`w-full px-4 py-3 bg-gray-50 border rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold ${password && !isValidPwd ? 'border-red-300 focus:border-red-500' : 'border-gray-200'}`} placeholder="영문, 숫자, 특수문자 포함 8자리 이상" />
                    <p className={`text-[11px] mt-1 ml-1 font-medium transition-colors ${password && isValidPwd ? 'text-green-600' : 'text-gray-400'}`}>
                        {password && !isValidPwd ? '⚠️ 영문, 숫자, 특수문자(!@#$)를 모두 포함해 8자리 이상이어야 합니다.' : '🔒 영문, 숫자, 특수문자 포함 8자리 이상'}
                    </p>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">비밀번호 확인</label>
                    <input type="password" value={passwordConfirm} onChange={e=>setPasswordConfirm(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="비밀번호 한 번 더 입력" />
                    {password && passwordConfirm && password !== passwordConfirm && (<p className="text-[11px] text-red-500 mt-1 ml-1 font-bold">❌ 비밀번호가 일치하지 않습니다.</p>)}
                </div>

                {message && <div className={`p-3 rounded-lg text-sm font-bold ${message.type==='error'?'bg-red-50 text-red-500':'bg-green-50 text-green-600'}`}>{message.text}</div>}

                <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-200 disabled:bg-gray-300 transition-all">
                    {loading ? '가입 처리 중...' : '회원가입 완료'}
                </button>
            </form>
          )}

          <div className="text-center pt-4 border-t border-gray-100">
            <button onClick={() => { setMessage(null); setView(view === 'login' ? 'signup-select' : 'login') }} className="text-sm font-bold text-indigo-600 hover:underline">
                {view === 'login' ? '새 계정 만들기' : '로그인 화면으로 돌아가기'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}