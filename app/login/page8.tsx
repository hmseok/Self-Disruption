'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../utils/supabase'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // 폼 상태
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null)

  // 화면 상태: 'login' | 'signup-select' | 'signup-email' | 'email-sent' (👈 메일 발송 완료 화면 추가)
  const [view, setView] = useState<'login' | 'signup-select' | 'signup-email' | 'email-sent'>('login')
  const [isValidPwd, setIsValidPwd] = useState(false)

  // 1. 이메일 링크 누르고 돌아왔을 때 (인증 완료)
  useEffect(() => {
    const isVerified = searchParams.get('verified')
    if (isVerified === 'true') {
      setMessage({ text: '🎉 인증이 완료되었습니다! 로그인해주세요.', type: 'success' })
      setView('login') // 로그인 화면으로 자동 전환
    }
  }, [searchParams])

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

  // 2. 인증 및 회원가입 처리
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

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
        // 🟢 [회원가입]
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // 👇 여기가 핵심! 인증 후 돌아올 주소 지정
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { name, full_name: name, phone }
          },
        })

        if (error) throw error

        // Case A: 이미 가입된 이메일
        if (data.user && data.user.identities?.length === 0) {
            setMessage({ text: '⚠️ 이미 가입된 이메일입니다. 로그인해주세요.', type: 'info' })
            setLoading(false)
            return
        }

        // Case B: 가입 성공 (인증 메일 발송됨) -> 화면 전환! 🚀
        if (data.user && !data.session) {
          setView('email-sent') // 👈 입력 폼을 숨기고 '메일 확인하세요' 화면으로 바꿈
        }
        // Case C: 인증 없이 바로 가입됨
        else if (data.session) {
          setMessage({ text: '🎉 가입되었습니다! 로그인 중...', type: 'success' })
          setTimeout(() => { router.push('/'); router.refresh(); }, 1000)
        }

      } else {
        // 🔵 [로그인]
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
      if (error.message.includes('User already registered')) setMessage({ text: '⚠️ 이미 가입된 이메일입니다.', type: 'info' })
      else setMessage({ text: error.message, type: 'error' })
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
            Start Your <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-300">Journey</span>
          </h1>
          <p className="text-lg text-indigo-100 leading-relaxed opacity-90">가입부터 관리까지, 모든 과정이 심플합니다.</p>
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
              {view === 'email-sent' && '메일함을 확인해주세요! 📧'}
            </h2>
            <p className="mt-2 text-gray-500 text-sm">
              {view === 'email-sent' ? '인증 메일이 발송되었습니다. 링크를 클릭하면 가입이 완료됩니다.' : '안전한 서비스 이용을 위해 정보를 입력해주세요.'}
            </p>
          </div>

          {/* 💌 메일 발송 완료 화면 (입력창 다 숨김) */}
          {view === 'email-sent' && (
            <div className="bg-blue-50 p-6 rounded-2xl text-center border border-blue-100 animate-fade-in-up">
                <div className="text-4xl mb-4">📩</div>
                <h3 className="font-bold text-lg text-blue-900 mb-2">인증 메일 발송 완료</h3>
                <p className="text-sm text-blue-700 mb-6">
                    <strong>{email}</strong> 주소로 인증 메일을 보냈습니다.<br/>
                    메일함에서 <strong>[이메일 인증하기]</strong> 버튼을 눌러주세요.
                </p>
                <div className="text-xs text-gray-400 mb-6">
                    ※ 메일이 안 오면 스팸함을 확인하거나,<br/>1분 뒤에 다시 시도해주세요.
                </div>
                <button
                    onClick={() => setView('login')}
                    className="w-full bg-white border border-blue-200 text-blue-700 font-bold py-3 rounded-xl hover:bg-blue-50 transition-colors"
                >
                    로그인 화면으로 돌아가기
                </button>
            </div>
          )}

          {/* 기존 화면들 (생략 없이 그대로 유지) */}
          {view === 'login' && (
            /* 로그인 폼 */
            <>
              <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-bold text-gray-700 shadow-sm">
                 <span className="text-lg">G</span> Google 계정으로 로그인
              </button>
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
               <button onClick={handleGoogleLogin} className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md transition-all">
                 <div className="font-bold text-gray-800">Google로 시작하기</div><span className="text-indigo-500">→</span>
               </button>
               <button onClick={() => setView('signup-email')} className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md transition-all">
                 <div className="font-bold text-gray-800">이메일로 시작하기</div><span className="text-indigo-500">→</span>
               </button>
            </div>
          )}

          {view === 'signup-email' && (
            <form onSubmit={handleAuth} className="space-y-4 animate-fade-in-up">
                <input type="text" value={name} onChange={e=>setName(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="이름 (실명)" />
                <input type="tel" value={phone} onChange={handlePhoneChange} maxLength={13} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="연락처 (010-...)" />
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="이메일" />
                <p className="text-[11px] text-gray-400 ml-1">※ 인증 메일이 발송됩니다.</p>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="비밀번호 (8자리 이상)" />
                <input type="password" value={passwordConfirm} onChange={e=>setPasswordConfirm(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold" placeholder="비밀번호 확인" />
                {message && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-bold">{message.text}</div>}
                <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-200 disabled:bg-gray-300">{loading ? '처리 중...' : '회원가입 완료'}</button>
            </form>
          )}

          {/* 하단 링크 */}
          {view !== 'email-sent' && (
            <div className="text-center pt-4 border-t border-gray-100">
                <button onClick={() => { setMessage(null); setView(view === 'login' ? 'signup-select' : 'login') }} className="text-sm font-bold text-indigo-600 hover:underline">
                    {view === 'login' ? '새 계정 만들기' : '로그인 화면으로 돌아가기'}
                </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}