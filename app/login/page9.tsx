'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation' // useSearchParams 제거 (이제 필요 없음)
import { supabase } from '../utils/supabase'

export default function LoginPage() {
  const router = useRouter()

  // 폼 상태
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null)

  // 화면 상태
  const [view, setView] = useState<'login' | 'signup-select' | 'signup-email' | 'email-sent'>('login')
  const [isValidPwd, setIsValidPwd] = useState(false)

  // ✅ [추가됨] 실시간 인증 감지 상태
  const [isVerified, setIsVerified] = useState(false)

  // 🕵️‍♂️ [핵심 로직] 이메일 발송 화면(email-sent)일 때, 3초마다 인증 여부 체크 (Polling)
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (view === 'email-sent' && !isVerified) {
      intervalId = setInterval(async () => {
        // 몰래 로그인을 시도해서 이메일이 인증됐는지 확인합니다.
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        // 인증이 완료되어 세션이 생기면?
        if (data.session) {
            setIsVerified(true); // 상태 변경 (버튼 활성화)
            setMessage({ text: '🎉 인증이 확인되었습니다! 아래 버튼을 눌러 가입을 완료하세요.', type: 'success' });
            clearInterval(intervalId); // 더 이상 체크 안 함
        }
      }, 3000); // 3초마다 체크
    }
    return () => clearInterval(intervalId);
  }, [view, isVerified, email, password]);

  // 비밀번호 유효성 검사
  const validatePassword = (pwd: string) => /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/.test(pwd);
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    let formatted = raw.length > 3 && raw.length <= 7 ? `${raw.slice(0, 3)}-${raw.slice(3)}` :
                    raw.length > 7 ? `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}` : raw;
    setPhone(formatted);
  }
  useEffect(() => { setIsValidPwd(validatePassword(password)) }, [password])

  // 구글 로그인
  const handleGoogleLogin = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/`, queryParams: { access_type: 'offline', prompt: 'select_account' } },
      })
      if (error) throw error
    } catch (error: any) {
      setMessage({ text: '구글 로그인 실패: ' + error.message, type: 'error' })
      setLoading(false)
    }
  }

  // 인증 및 가입 처리
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    // [완료 버튼 클릭 시] 이미 인증된 상태라면 바로 메인으로 이동
    if (view === 'email-sent' && isVerified) {
        router.push('/')
        router.refresh()
        return
    }

    if (!email || !password) return setMessage({ text: '이메일과 비밀번호를 입력해주세요.', type: 'error' })

    // 회원가입 유효성 검사
    if (view === 'signup-email') {
        if (!name) return setMessage({ text: '이름을 입력해주세요.', type: 'error' })
        if (!phone) return setMessage({ text: '연락처를 입력해주세요.', type: 'error' })
        if (!isValidPwd) return setMessage({ text: '비밀번호 규칙을 확인해주세요.', type: 'error' })
        if (password !== passwordConfirm) return setMessage({ text: '비밀번호가 일치하지 않습니다.', type: 'error' })
    }

    setLoading(true)

    try {
      if (view === 'signup-email') {
        // 회원가입 시도
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            // 👇 이제 '로그인 페이지'가 아니라 '인증 성공 페이지'로 보냅니다!
            emailRedirectTo: `${window.location.origin}/auth/verified`,
            data: { name, full_name: name, phone }
          },
        })
        if (error) throw error

        if (data.user && data.user.identities?.length === 0) {
            setMessage({ text: '⚠️ 이미 가입된 이메일입니다. 로그인해주세요.', type: 'info' })
            setLoading(false)
            return
        }
        // 가입 성공 -> 대기 화면으로 전환
        if (data.user && !data.session) {
          setView('email-sent')
        } else if (data.session) {
          setMessage({ text: '🎉 가입되었습니다! 로그인 중...', type: 'success' })
          setTimeout(() => { router.push('/'); router.refresh(); }, 1000)
        }
      } else {
        // 로그인 시도
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
            if (error.message.includes('Email not confirmed')) setMessage({ text: '📧 이메일 인증이 필요합니다. 메일함을 확인해주세요.', type: 'info' })
            else if (error.message.includes('Invalid login credentials')) setMessage({ text: '아이디 또는 비밀번호가 잘못되었습니다.', type: 'error' })
            else setMessage({ text: '로그인 실패: ' + error.message, type: 'error' })
        } else {
            router.push('/')
            router.refresh()
        }
      }
    } catch (error: any) {
      setMessage({ text: error.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-white font-sans text-gray-900">
      <div className="hidden lg:flex w-1/2 bg-indigo-900 relative items-center justify-center overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-600 to-slate-900 opacity-90 z-10"></div>
        <div className="relative z-20 text-white p-12 max-w-lg">
          <h1 className="text-5xl font-black tracking-tight mb-6 leading-tight">Start Your <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-300">Journey</span></h1>
          <p className="text-lg text-indigo-100 leading-relaxed opacity-90">가입부터 관리까지, 모든 과정이 심플합니다.</p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-16 relative">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
              {view === 'login' && '환영합니다!'}
              {view === 'signup-select' && '계정 만들기'}
              {view === 'signup-email' && '정보 입력'}
              {view === 'email-sent' && (isVerified ? '인증 완료! 🎉' : '이메일 인증 대기중')}
            </h2>
            <p className="mt-2 text-gray-500 text-sm">
              {view === 'email-sent'
                ? (isVerified ? '아래 버튼을 눌러 시작하세요.' : '발송된 메일의 링크를 클릭하시면 자동으로 완료됩니다.')
                : '안전한 서비스 이용을 위해 정보를 입력해주세요.'}
            </p>
          </div>

          {/* 💌 메일 발송 대기 & 완료 화면 (자동 감지 UI) */}
          {view === 'email-sent' && (
            <div className={`p-8 rounded-3xl border text-center transition-all duration-500 ${isVerified ? 'bg-green-50 border-green-200 shadow-lg shadow-green-100' : 'bg-gray-50 border-gray-100'}`}>
                <div className="text-5xl mb-6 transition-transform duration-500 transform">
                    {isVerified ? '✅' : '📩'}
                </div>

                <h3 className={`font-black text-xl mb-2 ${isVerified ? 'text-green-800' : 'text-gray-800'}`}>
                    {isVerified ? '인증이 확인되었습니다!' : '인증 메일 발송 완료'}
                </h3>

                <p className={`text-sm mb-8 ${isVerified ? 'text-green-700' : 'text-gray-500'}`}>
                    {isVerified ? (
                        '감사합니다. 모든 준비가 끝났습니다.'
                    ) : (
                        <>
                           <strong>{email}</strong><br/>
                           메일함에서 링크를 클릭해주세요.<br/>
                           <span className="text-xs text-indigo-500 mt-2 block animate-pulse">인증 여부를 확인하고 있습니다...</span>
                        </>
                    )}
                </p>

                {/* 여기가 핵심: 인증 전엔 회색(disabled), 인증 후엔 보라색(active) */}
                <button
                    onClick={handleAuth}
                    disabled={!isVerified}
                    className={`w-full font-bold py-4 rounded-xl transition-all duration-300 shadow-lg
                        ${isVerified
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 hover:scale-[1.02] cursor-pointer'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                        }
                    `}
                >
                    {isVerified ? '회원가입 완료하고 시작하기' : '인증 대기 중...'}
                </button>
            </div>
          )}

          {/* 기존 로그인/가입 폼 (이전과 동일) */}
          {view === 'login' && (
            <>
              <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-bold text-gray-700 shadow-sm"><span className="text-lg">G</span> Google 계정으로 로그인</button>
              <div className="relative flex justify-center text-xs uppercase my-4"><span className="bg-white px-2 text-gray-400 font-medium">Or login with email</span></div>
              <form onSubmit={handleAuth} className="space-y-4">
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="이메일 주소" />
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="비밀번호" />
                {message && <div className={`p-3 rounded-lg text-sm font-bold ${message.type==='error'?'bg-red-50 text-red-600':message.type==='success'?'bg-green-50 text-green-700':'bg-blue-50 text-blue-700'}`}>{message.text}</div>}
                <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-200 disabled:bg-gray-300">{loading ? '로그인 중...' : '로그인'}</button>
              </form>
            </>
          )}

          {view === 'signup-select' && (
            <div className="space-y-4">
               <button onClick={handleGoogleLogin} className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md transition-all"><div className="font-bold text-gray-800">Google로 시작하기</div><span className="text-indigo-500">→</span></button>
               <button onClick={() => setView('signup-email')} className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md transition-all"><div className="font-bold text-gray-800">이메일로 시작하기</div><span className="text-indigo-500">→</span></button>
            </div>
          )}

          {view === 'signup-email' && (
            <form onSubmit={handleAuth} className="space-y-4 animate-fade-in-up">
                <input type="text" value={name} onChange={e=>setName(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="이름 (실명)" />
                <input type="tel" value={phone} onChange={handlePhoneChange} maxLength={13} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="연락처 (010-...)" />
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="이메일" />
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="비밀번호 (8자리 이상)" />
                <input type="password" value={passwordConfirm} onChange={e=>setPasswordConfirm(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="비밀번호 확인" />
                {message && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-bold">{message.text}</div>}
                <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-200 disabled:bg-gray-300">{loading ? '처리 중...' : '회원가입 완료'}</button>
            </form>
          )}

           {view !== 'email-sent' && (
            <div className="text-center pt-4 border-t border-gray-100">
                <button onClick={() => { setMessage(null); setView(view === 'login' ? 'signup-select' : 'login') }} className="text-sm font-bold text-indigo-600 hover:underline">{view === 'login' ? '새 계정 만들기' : '로그인 화면으로 돌아가기'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}