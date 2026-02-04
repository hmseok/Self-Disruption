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

  // 화면 상태: 'login' | 'signup-select' | 'signup-email' (email-sent 상태는 view를 유지하되 내부 변수로 처리)
  const [view, setView] = useState<'login' | 'signup-select' | 'signup-email'>('login')

  // ✅ 상태 관리: 메일 발송 여부 & 인증 완료 여부
  const [isMailSent, setIsMailSent] = useState(false)
  const [isVerified, setIsVerified] = useState(false)

  const [isValidPwd, setIsValidPwd] = useState(false)

  // 1. 이메일 링크 누르고 돌아왔을 때 처리
  useEffect(() => {
    const verifiedParam = searchParams.get('verified')
    if (verifiedParam === 'true') {
      setMessage({ text: '🎉 인증이 완료되었습니다! 로그인해주세요.', type: 'success' })
      setView('login')
    }
  }, [searchParams])

  // 🕵️‍♂️ [신규 기술] 3초마다 인증 여부 자동 감지 (Polling)
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    // 메일은 보냈는데(isMailSent), 아직 인증은 안 된(!isVerified) 상태일 때만 감시
    if (isMailSent && !isVerified) {
      intervalId = setInterval(async () => {
        // 백그라운드 로그인 시도
        const { data } = await supabase.auth.signInWithPassword({ email, password });

        // 인증 성공 시 (세션 생성됨)
        if (data.session) {
            setIsVerified(true); // 버튼 활성화!
            setMessage({ text: '🎉 인증이 확인되었습니다! [회원가입 완료] 버튼을 눌러주세요.', type: 'success' });
            clearInterval(intervalId);
        }
      }, 3000); // 3초 간격 확인
    }
    return () => clearInterval(intervalId);
  }, [isMailSent, isVerified, email, password]);

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

  // 🚀 핵심 로직: 버튼 하나로 [발송] -> [대기] -> [완료] 처리
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    // [Step 3] 인증 완료 상태에서 버튼 클릭 -> 메인으로 이동
    if (isMailSent && isVerified) {
        router.push('/')
        router.refresh()
        return
    }

    // [Step 2] 메일만 보낸 상태에서 버튼 클릭 -> (아직 인증 안됨) 경고
    if (isMailSent && !isVerified) {
        setMessage({ text: '⏳ 아직 이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.', type: 'info' })
        return
    }

    // [Step 1] 첫 클릭 (메일 발송 시도)
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
        // 회원가입 요청
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // 새 창 안내 페이지로 이동
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

        // 메일 발송 성공! -> 폼은 유지하되 상태 변경
        if (data.user && !data.session) {
          setIsMailSent(true) // 메일 보냄 상태 ON
          setMessage({ text: '✅ 인증 메일이 발송되었습니다! 메일함에서 링크를 클릭해주세요.', type: 'success' })
        }
        else if (data.session) {
          // 혹시 인증 없이 바로 가입된 경우
          setMessage({ text: '🎉 가입되었습니다! 로그인 중...', type: 'success' })
          setTimeout(() => { router.push('/'); router.refresh(); }, 1000)
        }

      } else {
        // 로그인 로직
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
            if (error.message.includes('Email not confirmed')) setMessage({ text: '📧 이메일 인증이 필요합니다.', type: 'info' })
            else if (error.message.includes('Invalid login credentials')) setMessage({ text: '아이디 또는 비밀번호가 잘못되었습니다.', type: 'error' })
            else setMessage({ text: error.message, type: 'error' })
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

  // 초기화 함수 (입력창 수정 등)
  const resetSignup = () => {
    setIsMailSent(false)
    setIsVerified(false)
    setMessage(null)
  }

  return (
    <div className="min-h-screen w-full flex bg-white font-sans text-gray-900">

      {/* 좌측 비주얼 (대표님이 좋아하셨던 그 디자인) */}
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
            </h2>
            <p className="mt-2 text-gray-500 text-sm">
              {view === 'login' && '이메일 또는 소셜 계정으로 로그인하세요.'}
              {view === 'signup-select' && '가입 방식을 선택해주세요.'}
              {view === 'signup-email' && '안전한 서비스 이용을 위해 정보를 입력해주세요.'}
            </p>
          </div>

          {/* 회원가입 폼 (메일 보내도 화면 안바뀌고 그대로 유지됨!) */}
          {view === 'signup-email' && (
            <form onSubmit={handleAuth} className="space-y-4 animate-fade-in-up">
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">이름 (실명)</label>
                    <input type="text" value={name} onChange={e=>setName(e.target.value)} disabled={isMailSent} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold disabled:bg-gray-100 disabled:text-gray-500" placeholder="홍길동" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">연락처</label>
                    <input type="tel" value={phone} onChange={handlePhoneChange} disabled={isMailSent} maxLength={13} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold disabled:bg-gray-100 disabled:text-gray-500" placeholder="010-0000-0000" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">이메일</label>
                    <input type="email" value={email} onChange={e=>setEmail(e.target.value)} disabled={isMailSent} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold disabled:bg-gray-100 disabled:text-gray-500" placeholder="name@example.com" />
                    {!isMailSent && <p className="text-[11px] text-gray-400 mt-1 ml-1 font-medium">※ 인증 메일이 발송됩니다.</p>}
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">비밀번호</label>
                    <input type="password" value={password} onChange={e=>setPassword(e.target.value)} disabled={isMailSent} className={`w-full px-4 py-3 bg-gray-50 border rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold disabled:bg-gray-100 disabled:text-gray-500 ${password && !isValidPwd ? 'border-red-300' : 'border-gray-200'}`} placeholder="영문, 숫자, 특수문자 포함 8자리 이상" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">비밀번호 확인</label>
                    <input type="password" value={passwordConfirm} onChange={e=>setPasswordConfirm(e.target.value)} disabled={isMailSent} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-bold disabled:bg-gray-100 disabled:text-gray-500" placeholder="비밀번호 확인" />
                </div>

                {/* ✅ 메시지 박스 (대표님이 원하신 그 초록색 박스!) */}
                {message && (
                    <div className={`p-4 rounded-xl text-sm font-bold flex items-start gap-3 shadow-sm border animate-fade-in-up
                        ${message.type === 'error' ? 'bg-red-50 text-red-600 border-red-100' :
                          message.type === 'success' ? 'bg-green-50 text-green-700 border-green-100' :
                          'bg-blue-50 text-blue-700 border-blue-100'
                        }
                    `}>
                        <span className="text-lg">
                            {message.type === 'error' ? '🚨' : message.type === 'success' ? '✅' : 'ℹ️'}
                        </span>
                        <span className="mt-0.5">{message.text}</span>
                    </div>
                )}

                {/* 🚀 변신하는 버튼 (상태에 따라 3단 변신) */}
                <button
                    type="submit"
                    disabled={loading || (isMailSent && !isVerified)} // 대기 중일 땐 클릭 불가
                    className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all duration-300 text-lg flex items-center justify-center gap-2
                        ${!isMailSent
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200' // 1. 처음 (파란색)
                            : isVerified
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 animate-pulse' // 3. 인증완료 (파란색+강조)
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none' // 2. 대기중 (회색)
                        }
                    `}
                >
                    {loading ? '처리 중...' :
                     !isMailSent ? '인증 메일 발송' :
                     isVerified ? '🚀 회원가입 완료 (누르면 시작)' :
                     '⏳ 인증 대기 중...'}
                </button>

                {/* 수정하기 버튼 (메일 보낸 뒤에만 표시) */}
                {isMailSent && !isVerified && (
                    <div className="text-center">
                        <button type="button" onClick={resetSignup} className="text-xs text-gray-400 underline hover:text-gray-600">
                            이메일 주소 다시 입력하기
                        </button>
                    </div>
                )}
            </form>
          )}

          {/* 하단 링크 (로그인/가입 전환) */}
          {view !== 'email-sent' && (
            <div className="text-center pt-4 border-t border-gray-100">
                <button onClick={() => {
                    resetSignup();
                    setView(view === 'login' ? 'signup-select' : 'login');
                }} className="text-sm font-bold text-indigo-600 hover:underline">
                    {view === 'login' ? '새 계정 만들기' : '로그인 화면으로 돌아가기'}
                </button>
            </div>
          )}

          {/* (나머지 로그인/선택 화면 코드는 그대로 유지...) */}
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

        </div>
      </div>
    </div>
  )
}