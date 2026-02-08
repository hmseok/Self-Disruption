'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './utils/supabase'

// ============================================
// Sideline ERP - Enterprise Auth Page
// Premium Login / Signup / Verification Flow
// ============================================

function AuthPage() {
  const router = useRouter()
  const isLocal = process.env.NODE_ENV === 'development'

  const [view, setView] = useState<'login' | 'signup' | 'verify' | 'verified'>('login')
  const [roleType, setRoleType] = useState<'founder' | 'employee'>('founder')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [verifyCountdown, setVerifyCountdown] = useState(0)

  const [formData, setFormData] = useState({
    email: '', password: '', passwordConfirm: '',
    name: '', phone: '', companyName: '', businessNumber: '',
  })

  const [validity, setValidity] = useState({
    email: false, password: false, passwordConfirm: false,
    phone: false, companyName: false,
  })

  // 중복 체크 상태 (null=미확인, true=사용가능, false=중복)
  const [dupCheck, setDupCheck] = useState<{
    email: null | boolean
    phone: null | boolean
    companyName: null | boolean
    businessNumber: null | boolean
  }>({ email: null, phone: null, companyName: null, businessNumber: null })

  // 중복 체크 로딩 상태
  const [dupLoading, setDupLoading] = useState<{
    email: boolean; phone: boolean; companyName: boolean; businessNumber: boolean
  }>({ email: false, phone: false, companyName: false, businessNumber: false })

  // 디바운스 타이머
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({})

  // 디바운스 중복 체크 함수
  const debouncedCheck = useCallback((field: string, value: string, checkFn: () => Promise<void>) => {
    if (debounceTimers.current[field]) clearTimeout(debounceTimers.current[field])
    setDupCheck(prev => ({ ...prev, [field]: null }))
    setDupLoading(prev => ({ ...prev, [field]: false }))

    if (!value || value.trim() === '') return

    debounceTimers.current[field] = setTimeout(async () => {
      setDupLoading(prev => ({ ...prev, [field]: true }))
      await checkFn()
      setDupLoading(prev => ({ ...prev, [field]: false }))
    }, 800)
  }, [])

  // 개별 중복 체크 함수들
  const checkEmailDup = async (email: string) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    const { data } = await supabase.rpc('check_email_exists', { check_email: email })
    setDupCheck(prev => ({ ...prev, email: data === true ? false : true }))
  }

  const checkPhoneDup = async (phone: string) => {
    const clean = phone.replace(/[^0-9]/g, '')
    if (clean.length < 10) return
    const { data } = await supabase.rpc('check_phone_exists', { check_phone: phone })
    setDupCheck(prev => ({ ...prev, phone: data === true ? false : true }))
  }

  const checkCompanyNameDup = async (name: string) => {
    if (name.trim().length < 2) return
    const { data } = await supabase.rpc('check_company_name_exists', { check_name: name })
    setDupCheck(prev => ({ ...prev, companyName: data === true ? false : true }))
  }

  const checkBusinessNumberDup = async (bn: string) => {
    const clean = bn.replace(/[^0-9]/g, '')
    if (clean.length < 10) return
    const { data } = await supabase.rpc('check_business_number_exists', { check_bn: bn })
    setDupCheck(prev => ({ ...prev, businessNumber: data === true ? false : true }))
  }

  // 이미 로그인된 사용자 → 바로 이동
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) router.replace('/dashboard')
    }
    checkSession()
  }, [router])

  // 인증 대기 화면: 폴링으로 인증 완료 감지 → verified 뷰로 전환
  useEffect(() => {
    if (view !== 'verify') return

    // onAuthStateChange: 다른 탭에서 인증 완료 시 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        setMessage(null)
        setView('verified')
      }
    })

    // 4초마다 signInWithPassword 시도 → 인증 완료되면 성공
    const interval = setInterval(async () => {
      if (!formData.email || !formData.password) return
      const { error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      })
      if (!error) {
        clearInterval(interval)
        setMessage(null)
        setView('verified')
      }
    }, 4000)

    return () => {
      subscription.unsubscribe()
      clearInterval(interval)
    }
  }, [view, formData.email, formData.password])

  // 재발송 쿨다운 타이머
  useEffect(() => {
    if (verifyCountdown <= 0) return
    const timer = setTimeout(() => setVerifyCountdown(v => v - 1), 1000)
    return () => clearTimeout(timer)
  }, [verifyCountdown])

  // 입력 핸들러
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    if (name === 'email') {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      setValidity(prev => ({ ...prev, email: ok }))
      if (view === 'signup' && ok) {
        debouncedCheck('email', value, () => checkEmailDup(value))
      }
    }
    if (name === 'password') {
      const ok = /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/.test(value)
      setValidity(prev => ({ ...prev, password: ok }))
      if (formData.passwordConfirm) {
        setValidity(prev => ({ ...prev, passwordConfirm: formData.passwordConfirm === value }))
      }
    }
    if (name === 'passwordConfirm') {
      setValidity(prev => ({ ...prev, passwordConfirm: value === formData.password && value.length > 0 }))
    }
    if (name === 'phone') {
      const clean = value.replace(/[^0-9]/g, '')
      setValidity(prev => ({ ...prev, phone: clean.length >= 10 }))
      if (view === 'signup' && clean.length >= 10) {
        debouncedCheck('phone', value, () => checkPhoneDup(value))
      }
    }
    if (name === 'companyName') {
      setValidity(prev => ({ ...prev, companyName: value.trim().length > 1 }))
      if (view === 'signup' && roleType === 'founder' && value.trim().length > 1) {
        debouncedCheck('companyName', value, () => checkCompanyNameDup(value))
      }
    }
    if (name === 'businessNumber') {
      const clean = value.replace(/[^0-9-]/g, '')
      if (view === 'signup' && roleType === 'founder' && clean.replace(/[^0-9]/g, '').length >= 10) {
        debouncedCheck('businessNumber', value, () => checkBusinessNumberDup(value))
      }
    }
  }

  // 로그인
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    })

    if (error) {
      setMessage({ text: '이메일 또는 비밀번호를 확인해주세요.', type: 'error' })
      setLoading(false)
    } else {
      router.replace('/dashboard')
    }
  }

  // 회원가입
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()

    // 1. 기본 유효성 검증
    if (!validity.email || !validity.password || !validity.passwordConfirm || !validity.companyName) {
      setMessage({ text: '모든 항목을 올바르게 입력해주세요.', type: 'error' })
      return
    }

    if (!formData.name.trim()) {
      setMessage({ text: '이름을 입력해주세요.', type: 'error' })
      return
    }

    if (!validity.phone) {
      setMessage({ text: '올바른 전화번호를 입력해주세요. (10자리 이상)', type: 'error' })
      return
    }

    // 2. 비밀번호 추가 검증 (특수문자 포함 권장)
    if (formData.password.length < 8) {
      setMessage({ text: '비밀번호는 최소 8자 이상이어야 합니다.', type: 'error' })
      return
    }

    // 3. 클라이언트 중복 체크 결과 확인
    if (dupCheck.email === false) {
      setMessage({ text: '이미 사용 중인 이메일입니다.', type: 'error' })
      return
    }
    if (dupCheck.phone === false) {
      setMessage({ text: '이미 등록된 전화번호입니다.', type: 'error' })
      return
    }
    if (roleType === 'founder') {
      if (dupCheck.companyName === false) {
        setMessage({ text: '이미 등록된 회사명입니다.', type: 'error' })
        return
      }
      if (dupCheck.businessNumber === false) {
        setMessage({ text: '이미 등록된 사업자번호입니다.', type: 'error' })
        return
      }
    }

    setLoading(true)
    setMessage(null)

    // 4. 서버사이드 통합 검증 (최종 확인)
    try {
      const { data: validation, error: valError } = await supabase.rpc('validate_signup', {
        p_email: formData.email,
        p_phone: formData.phone,
        p_company_name: roleType === 'founder' ? formData.companyName : null,
        p_business_number: roleType === 'founder' ? formData.businessNumber : null,
      })

      if (valError) {
        console.error('Validation RPC error:', valError)
        // RPC 실패 시에도 가입은 시도 (함수가 아직 미설치일 수 있음)
      } else if (validation && !validation.valid) {
        const errors = validation.errors as string[]
        const errorMsgs: Record<string, string> = {
          email_exists: '이미 사용 중인 이메일입니다.',
          phone_exists: '이미 등록된 전화번호입니다.',
          company_exists: '이미 등록된 회사명입니다.',
          business_number_exists: '이미 등록된 사업자번호입니다.',
        }
        const firstError = errors[0]
        setMessage({ text: errorMsgs[firstError] || '입력 정보가 중복됩니다.', type: 'error' })
        setLoading(false)
        return
      }
    } catch (err) {
      console.error('Validation error:', err)
    }

    // 5. Supabase 회원가입 실행
    const { error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
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

    if (error) {
      setMessage({ text: error.message, type: 'error' })
      setLoading(false)
      return
    }

    setLoading(false)
    setView('verify')
  }

  // 이메일 재발송
  const handleResendEmail = async () => {
    if (verifyCountdown > 0) return
    setVerifyCountdown(60)
    await supabase.auth.resend({ type: 'signup', email: formData.email })
    setMessage({ text: '인증 메일이 재발송되었습니다.', type: 'success' })
  }

  // 수동 인증 확인 → verified 뷰로 전환
  const handleVerifyAndLogin = async () => {
    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    })

    if (error) {
      setMessage({ text: '이메일 인증이 아직 완료되지 않았습니다. 메일함을 확인해주세요.', type: 'error' })
      setLoading(false)
    } else {
      setLoading(false)
      setView('verified')
    }
  }

  // 이메일 도메인 기반 메일 서비스 감지
  const getMailService = (email: string): { name: string; url: string; color: string } | null => {
    const domain = email.split('@')[1]?.toLowerCase()
    if (!domain) return null

    const mailServices: Record<string, { name: string; url: string; color: string }> = {
      'gmail.com': { name: 'Gmail', url: 'https://mail.google.com', color: 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' },
      'googlemail.com': { name: 'Gmail', url: 'https://mail.google.com', color: 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' },
      'naver.com': { name: 'Naver 메일', url: 'https://mail.naver.com', color: 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100' },
      'daum.net': { name: 'Daum 메일', url: 'https://mail.daum.net', color: 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100' },
      'hanmail.net': { name: 'Daum 메일', url: 'https://mail.daum.net', color: 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100' },
      'kakao.com': { name: 'Kakao 메일', url: 'https://mail.kakao.com', color: 'bg-yellow-50 text-yellow-700 border-yellow-100 hover:bg-yellow-100' },
      'outlook.com': { name: 'Outlook', url: 'https://outlook.live.com', color: 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100' },
      'hotmail.com': { name: 'Outlook', url: 'https://outlook.live.com', color: 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100' },
      'live.com': { name: 'Outlook', url: 'https://outlook.live.com', color: 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100' },
      'yahoo.com': { name: 'Yahoo Mail', url: 'https://mail.yahoo.com', color: 'bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100' },
      'yahoo.co.kr': { name: 'Yahoo Mail', url: 'https://mail.yahoo.com', color: 'bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100' },
    }

    return mailServices[domain] || null
  }

  // 인증 완료 → 로그인 후 입장
  const handleVerifiedEnter = async () => {
    setLoading(true)
    setMessage(null)
    // 이미 세션이 있을 수 있으므로 세션 확인 후 이동
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      router.replace('/dashboard')
      return
    }
    // 세션이 없으면 다시 로그인 시도
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    })
    if (error) {
      setMessage({ text: '로그인 중 오류가 발생했습니다. 로그인 페이지에서 다시 시도해주세요.', type: 'error' })
      setLoading(false)
    } else {
      router.replace('/dashboard')
    }
  }

  // 개발자 로그인
  const handleDevLogin = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: 'admin@sideline.com', password: 'password1234!!'
    })
    if (error) { setMessage({ text: '개발자 계정 로그인 실패', type: 'error' }); setLoading(false) }
  }

  // 유효성 아이콘
  const ValidIcon = ({ valid }: { valid: boolean }) => (
    valid ? (
      <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
      </svg>
    ) : null
  )

  // 중복 체크 상태 표시
  const DupStatus = ({ field, label }: { field: keyof typeof dupCheck; label: string }) => {
    if (view !== 'signup') return null
    const isLoading = dupLoading[field]
    const result = dupCheck[field]

    if (isLoading) return <span className="text-[10px] text-blue-500 font-medium flex items-center gap-1"><svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25"/><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75"/></svg>확인 중</span>
    if (result === true) return <span className="text-[10px] text-emerald-500 font-bold">사용 가능</span>
    if (result === false) return <span className="text-[10px] text-red-500 font-bold">이미 등록됨</span>
    return null
  }

  // ==================================
  // RENDER
  // ==================================
  return (
    <div className="flex min-h-screen w-full font-sans">

      {/* ========== LEFT PANEL - Brand ========== */}
      <div className="hidden lg:flex w-[480px] min-w-[480px] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white flex-col justify-between p-14 relative overflow-hidden">

        {/* 배경 장식 */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
        <div className="absolute inset-0 shimmer-bg"></div>

        {/* 상단 */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <span className="text-slate-900 font-black text-lg">S</span>
            </div>
            <span className="text-xl font-bold tracking-tight">Sideline</span>
          </div>

          <div className="space-y-6">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/20 rounded-full text-[11px] font-bold tracking-wider uppercase text-blue-300 border border-blue-500/20">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse-slow"></span>
                Enterprise Platform
              </span>
            </div>
            <h1 className="text-4xl font-black leading-[1.15] tracking-tight">
              Smart Mobility<br/>
              Business Solution<span className="text-blue-400">.</span>
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
              중고차 렌터카 운영에 필요한 모든 것을 하나의 플랫폼에서.<br/>
              차량 자산, 계약, 재무, 고객 관리까지 통합 솔루션.
            </p>
          </div>
        </div>

        {/* 하단 Feature Cards */}
        <div className="relative z-10 space-y-3">
          {[
            { icon: '🔐', title: '엔터프라이즈 보안', desc: 'SOC2 수준의 데이터 보호 및 암호화' },
            { icon: '📊', title: '실시간 대시보드', desc: '매출, 차량, 계약 현황을 한눈에 파악' },
            { icon: '🏢', title: '멀티 테넌시', desc: '회사별 독립 데이터, 역할 기반 접근 제어' },
          ].map((item, i) => (
            <div key={i} className="glass rounded-xl p-4 flex items-start gap-4 animate-fade-in-up" style={{ animationDelay: `${i * 0.15}s` }}>
              <span className="text-xl mt-0.5">{item.icon}</span>
              <div>
                <div className="text-sm font-bold text-white">{item.title}</div>
                <div className="text-xs text-slate-400 mt-0.5">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 하단 Copyright */}
        <div className="relative z-10 pt-6 border-t border-white/10">
          <p className="text-[11px] text-slate-500">&copy; 2025 Sideline Inc. All rights reserved.</p>
        </div>
      </div>

      {/* ========== RIGHT PANEL - Auth Form ========== */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 lg:p-12 bg-white overflow-y-auto">
        <div className="w-full max-w-[460px]">

          {/* ===== VERIFIED VIEW (인증 완료!) ===== */}
          {view === 'verified' ? (
            <div className="animate-fade-in-up">
              {/* 성공 아이콘 */}
              <div className="flex justify-center mb-8">
                <div className="relative">
                  <div className="w-24 h-24 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-3xl flex items-center justify-center">
                    <svg className="w-14 h-14 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  {/* 반짝이 효과 */}
                  <div className="absolute -top-2 -right-2 w-5 h-5 text-amber-400 animate-pulse-slow" style={{ animationDelay: '0.2s' }}>
                    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2l1.5 5.5L17 9l-5.5 1.5L10 16l-1.5-5.5L3 9l5.5-1.5L10 2z"/></svg>
                  </div>
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 text-blue-400 animate-pulse-slow" style={{ animationDelay: '0.5s' }}>
                    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2l1.5 5.5L17 9l-5.5 1.5L10 16l-1.5-5.5L3 9l5.5-1.5L10 2z"/></svg>
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-black text-slate-900 text-center mb-2">
                이메일 인증 완료!
              </h2>
              <p className="text-slate-500 text-center text-sm mb-8 leading-relaxed">
                <span className="font-bold text-emerald-600">{formData.email}</span> 인증이<br/>
                성공적으로 완료되었습니다.
              </p>

              {/* 성공 안내 박스 */}
              <div className="bg-emerald-50 rounded-2xl p-5 mb-6 border border-emerald-100">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                  </div>
                  <div className="text-sm text-emerald-700 leading-relaxed">
                    계정이 활성화되었습니다. 아래 버튼을 눌러 Sideline ERP에 입장하세요.
                  </div>
                </div>
              </div>

              {/* 메시지 */}
              {message && (
                <div className={`p-3.5 rounded-xl text-sm font-medium mb-4 ${
                  message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                }`}>
                  {message.text}
                </div>
              )}

              {/* 입장 버튼 */}
              <div className="space-y-3">
                <button
                  onClick={handleVerifiedEnter}
                  disabled={loading}
                  className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                >
                  {loading ? (
                    <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25"/><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75"/></svg> 로그인 중...</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg> Sideline 시작하기</>
                  )}
                </button>

                <button
                  onClick={() => { setView('login'); setMessage(null) }}
                  className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm"
                >
                  로그인 페이지로 이동
                </button>
              </div>
            </div>

          ) : view === 'verify' ? (
            /* ===== VERIFY VIEW (인증 대기 중) ===== */
            <div className="animate-fade-in-up">
              {/* 상단 아이콘 */}
              <div className="flex justify-center mb-8">
                <div className="relative">
                  <div className="w-24 h-24 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-3xl flex items-center justify-center animate-float">
                    <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  </div>
                  <div className="absolute -top-1 -right-1 w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center animate-ring-pulse">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z"/>
                    </svg>
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-black text-slate-900 text-center mb-2">
                인증 메일을 확인해주세요
              </h2>
              <p className="text-slate-500 text-center text-sm mb-2 leading-relaxed">
                <span className="font-bold text-slate-800">{formData.email}</span><br/>
                위 주소로 인증 링크를 발송했습니다.
              </p>

              {/* 실시간 감지 상태 표시 */}
              <div className="flex items-center justify-center gap-2 mb-8">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-blue-600 font-medium">인증 완료를 자동으로 감지 중...</span>
              </div>

              {/* 안내 Steps */}
              <div className="bg-slate-50 rounded-2xl p-5 mb-6 space-y-4">
                {[
                  { step: 1, text: '이메일 수신함(또는 스팸함)을 확인해주세요' },
                  { step: 2, text: '"이메일 인증하기" 버튼을 클릭해주세요' },
                  { step: 3, text: '이 화면이 자동으로 인증완료로 바뀝니다' },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      {item.step}
                    </div>
                    <span className="text-sm text-slate-600">{item.text}</span>
                  </div>
                ))}
              </div>

              {/* 메시지 */}
              {message && (
                <div className={`p-3.5 rounded-xl text-sm font-medium mb-4 ${
                  message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                }`}>
                  {message.text}
                </div>
              )}

              {/* 액션 버튼들 */}
              <div className="space-y-3">
                {/* 수동 인증 확인 버튼 */}
                <button
                  onClick={handleVerifyAndLogin}
                  disabled={loading}
                  className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25"/><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75"/></svg> 확인 중...</>
                  ) : (
                    '인증 완료 확인하기'
                  )}
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={handleResendEmail}
                    disabled={verifyCountdown > 0}
                    className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm disabled:opacity-50"
                  >
                    {verifyCountdown > 0 ? `재발송 (${verifyCountdown}s)` : '인증메일 재발송'}
                  </button>

                  {/* 이메일 도메인 기반 메일 바로가기 */}
                  {(() => {
                    const mailService = getMailService(formData.email)
                    return mailService ? (
                      <button
                        onClick={() => window.open(mailService.url, '_blank')}
                        className={`flex-1 py-3 font-bold rounded-xl transition-all text-sm border ${mailService.color}`}
                      >
                        {mailService.name} 열기
                      </button>
                    ) : null
                  })()}
                </div>

                <button
                  onClick={() => { setView('login'); setMessage(null) }}
                  className="w-full text-xs text-slate-400 hover:text-slate-600 py-2 transition-colors"
                >
                  로그인 화면으로 돌아가기
                </button>
              </div>
            </div>
          ) : (
            /* ===== LOGIN / SIGNUP VIEW ===== */
            <div className="animate-fade-in-up">
              {/* 모바일 로고 */}
              <div className="lg:hidden flex items-center gap-2 mb-8">
                <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
                  <span className="text-white font-black text-sm">S</span>
                </div>
                <span className="text-lg font-bold text-slate-900">Sideline</span>
              </div>

              {/* 헤딩 */}
              <div className="mb-8">
                <h2 className="text-2xl font-black text-slate-900 mb-1">
                  {view === 'login' ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="text-slate-400 text-sm">
                  {view === 'login'
                    ? '등록된 비즈니스 계정으로 로그인하세요.'
                    : '기업 관리를 위한 새 계정을 생성합니다.'
                  }
                </p>
              </div>

              <form onSubmit={view === 'login' ? handleLogin : handleSignUp} className="space-y-4">

                {/* 가입 유형 탭 (Signup only) */}
                {view === 'signup' && (
                  <div className="p-1 bg-slate-100 rounded-xl flex gap-1 mb-2">
                    {[
                      { key: 'founder', label: '기업 대표', desc: '회사를 등록합니다' },
                      { key: 'employee', label: '직원', desc: '기존 회사에 합류합니다' },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setRoleType(tab.key as any)}
                        className={`flex-1 py-3 px-2 rounded-lg text-center transition-all ${
                          roleType === tab.key
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        <div className="text-sm font-bold">{tab.label}</div>
                        <div className="text-[10px] mt-0.5 opacity-60">{tab.desc}</div>
                      </button>
                    ))}
                  </div>
                )}

                {/* 이메일 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
                    <DupStatus field="email" label="이메일" />
                  </div>
                  <div className="relative">
                    <input
                      name="email" type="email" value={formData.email} onChange={handleChange}
                      placeholder="name@company.com"
                      className={`w-full px-4 py-3.5 bg-slate-50 border-2 rounded-xl outline-none text-sm font-medium text-slate-900 placeholder-slate-300 transition-all focus:bg-white ${
                        formData.email && validity.email && dupCheck.email === true ? 'border-emerald-300 focus:border-emerald-400' :
                        formData.email && validity.email && dupCheck.email === false ? 'border-red-300 focus:border-red-400' :
                        formData.email && validity.email ? 'border-emerald-300 focus:border-emerald-400' :
                        formData.email && !validity.email ? 'border-red-200 focus:border-red-300' :
                        'border-transparent focus:border-slate-300'
                      }`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2"><ValidIcon valid={validity.email} /></div>
                  </div>
                </div>

                {/* 비밀번호 */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Password</label>
                  <div className="relative">
                    <input
                      name="password" type={showPassword ? 'text' : 'password'} value={formData.password} onChange={handleChange}
                      placeholder={view === 'signup' ? '영문+숫자 포함 8자 이상' : '비밀번호 입력'}
                      className={`w-full px-4 py-3.5 bg-slate-50 border-2 rounded-xl outline-none text-sm font-medium text-slate-900 placeholder-slate-300 transition-all focus:bg-white pr-20 ${
                        formData.password && validity.password ? 'border-emerald-300 focus:border-emerald-400' :
                        formData.password && !validity.password && view === 'signup' ? 'border-red-200 focus:border-red-300' :
                        'border-transparent focus:border-slate-300'
                      }`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      <ValidIcon valid={validity.password} />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-slate-300 hover:text-slate-500 transition-colors p-0.5"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          {showPassword
                            ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/>
                            : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></>
                          }
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 회원가입 추가 필드 */}
                {view === 'signup' && (
                  <div className="space-y-4 animate-fade-in-down">
                    {/* 비밀번호 확인 */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Confirm Password</label>
                      <div className="relative">
                        <input
                          name="passwordConfirm" type="password" value={formData.passwordConfirm} onChange={handleChange}
                          placeholder="비밀번호 재입력"
                          className={`w-full px-4 py-3.5 bg-slate-50 border-2 rounded-xl outline-none text-sm font-medium text-slate-900 placeholder-slate-300 transition-all focus:bg-white ${
                            formData.passwordConfirm && validity.passwordConfirm ? 'border-emerald-300' :
                            formData.passwordConfirm && !validity.passwordConfirm ? 'border-red-200' :
                            'border-transparent focus:border-slate-300'
                          }`}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2"><ValidIcon valid={validity.passwordConfirm} /></div>
                      </div>
                    </div>

                    <div className="h-px bg-slate-100"></div>

                    {/* 이름, 전화 */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Full Name</label>
                        <input name="name" type="text" value={formData.name} onChange={handleChange} placeholder="실명"
                          className="w-full px-4 py-3.5 bg-slate-50 border-2 border-transparent rounded-xl outline-none text-sm font-medium text-slate-900 placeholder-slate-300 focus:bg-white focus:border-slate-300 transition-all"/>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Phone</label>
                          <DupStatus field="phone" label="전화번호" />
                        </div>
                        <div className="relative">
                          <input name="phone" type="tel" value={formData.phone} onChange={handleChange} placeholder="01012345678"
                            className={`w-full px-4 py-3.5 bg-slate-50 border-2 rounded-xl outline-none text-sm font-medium text-slate-900 placeholder-slate-300 focus:bg-white transition-all ${
                              formData.phone && validity.phone ? 'border-emerald-300' :
                              formData.phone && !validity.phone ? 'border-red-200' :
                              'border-transparent focus:border-slate-300'
                            }`}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2"><ValidIcon valid={validity.phone} /></div>
                        </div>
                      </div>
                    </div>

                    {/* 회사명 */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          {roleType === 'founder' ? 'Corporate Name' : 'Company Name'}
                        </label>
                        {roleType === 'founder' && <DupStatus field="companyName" label="회사명" />}
                      </div>
                      <div className="relative">
                        <input name="companyName" type="text" value={formData.companyName} onChange={handleChange}
                          placeholder={roleType === 'founder' ? '(주)법인명 또는 상호명' : '재직 중인 회사명'}
                          className={`w-full px-4 py-3.5 bg-slate-50 border-2 rounded-xl outline-none text-sm font-medium text-slate-900 placeholder-slate-300 focus:bg-white transition-all ${
                            formData.companyName && validity.companyName ? 'border-emerald-300' :
                            formData.companyName && !validity.companyName ? 'border-red-200' :
                            'border-transparent focus:border-slate-300'
                          }`}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2"><ValidIcon valid={validity.companyName} /></div>
                      </div>
                    </div>

                    {/* 사업자번호 (대표만) */}
                    {roleType === 'founder' && (
                      <div className="animate-fade-in-down">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Business Registration No.</label>
                          <DupStatus field="businessNumber" label="사업자번호" />
                        </div>
                        <input name="businessNumber" type="text" value={formData.businessNumber} onChange={handleChange}
                          placeholder="000-00-00000 (선택사항)"
                          className="w-full px-4 py-3.5 bg-slate-50 border-2 border-transparent rounded-xl outline-none text-sm font-medium text-slate-900 placeholder-slate-300 focus:bg-white focus:border-slate-300 transition-all"/>
                      </div>
                    )}
                  </div>
                )}

                {/* 에러/성공 메시지 */}
                {message && (
                  <div className={`p-3.5 rounded-xl text-sm font-medium flex items-center gap-2 border ${
                    message.type === 'error'
                      ? 'bg-red-50 border-red-100 text-red-700'
                      : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                  }`}>
                    <span className="flex-shrink-0">{message.type === 'error' ? '⚠' : '✓'}</span>
                    {message.text}
                  </div>
                )}

                {/* 제출 버튼 */}
                <button
                  disabled={loading}
                  className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm shadow-lg shadow-slate-900/20 hover:shadow-slate-900/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                >
                  {loading ? (
                    <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25"/><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75"/></svg> 처리 중...</>
                  ) : (
                    view === 'login' ? '로그인' : '계정 생성'
                  )}
                </button>

                {/* Dev Login */}
                {isLocal && view === 'login' && (
                  <button type="button" onClick={handleDevLogin}
                    className="w-full py-2.5 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg hover:bg-amber-100 border border-amber-200 border-dashed transition-all">
                    DEV: Local Quick Login
                  </button>
                )}
              </form>

              {/* 전환 링크 */}
              <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                <span className="text-sm text-slate-400">
                  {view === 'login' ? '아직 계정이 없으신가요?' : '이미 계정이 있으신가요?'}
                </span>
                <button
                  onClick={() => {
                    setView(view === 'login' ? 'signup' : 'login')
                    setMessage(null)
                    setFormData({ email: '', password: '', passwordConfirm: '', name: '', phone: '', companyName: '', businessNumber: '' })
                    setValidity({ email: false, password: false, passwordConfirm: false, phone: false, companyName: false })
                    setDupCheck({ email: null, phone: null, companyName: null, businessNumber: null })
                  }}
                  className="ml-2 text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  {view === 'login' ? '계정 생성하기' : '로그인'}
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
  return <Suspense><AuthPage /></Suspense>
}
