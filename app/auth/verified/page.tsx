'use client'

import { useEffect, useState } from 'react'

// ============================================
// 이메일 인증 완료 페이지
// 인증 링크 클릭 → callback → 이 페이지로 리다이렉트
// 즉시 창 닫기 시도, 실패 시 3초 후 자동 닫기
// 원래 탭에서 자동 감지되므로 이 탭은 빠르게 닫힘
// ============================================

export default function VerifiedPage() {
  const [closed, setClosed] = useState(false)

  // 즉시 닫기 시도 + 3초 후 재시도
  useEffect(() => {
    // 1초 후 첫 닫기 시도 (렌더링 완료 후)
    const firstTry = setTimeout(() => {
      try { window.close() } catch {}
    }, 1000)

    // 3초 후 재시도
    const secondTry = setTimeout(() => {
      try { window.close() } catch {}
      setClosed(true)
    }, 3000)

    return () => {
      clearTimeout(firstTry)
      clearTimeout(secondTry)
    }
  }, [])

  const handleClose = () => {
    setClosed(true)
    try { window.close() } catch {}
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-steel-50/30 p-6">
      {/* 배경 장식 */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-steel-100/40 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-steel-100/30 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 bg-white p-10 rounded-3xl shadow-xl shadow-slate-200/50 max-w-md w-full border border-slate-100 animate-fade-in-up">

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

        {/* 텍스트 */}
        <h1 className="text-2xl font-black text-slate-900 text-center mb-3">
          인증이 완료되었습니다
        </h1>
        <p className="text-slate-500 text-center text-sm leading-relaxed mb-6">
          이 탭은 자동으로 닫힙니다.<br/>
          <span className="font-bold text-slate-700">원래 열려있던 회원가입 화면</span>이<br/>
          자동으로 인증완료 상태로 전환됩니다.
        </p>

        {/* 닫기 버튼 */}
        <button
          onClick={handleClose}
          className="w-full py-4 bg-gradient-to-r from-steel-700 to-steel-800 hover:from-steel-800 hover:to-steel-900 text-white font-bold rounded-xl transition-all text-sm flex items-center justify-center gap-2 shadow-lg shadow-steel-700/25"
        >
          {closed ? '이 탭을 수동으로 닫아주세요' : '이 탭 닫기'}
        </button>

        {/* Sideline 브랜딩 */}
        <div className="mt-6 text-center">
          <div className="flex items-center justify-center gap-1.5 text-slate-300">
            <div className="w-5 h-5 bg-slate-200 rounded flex items-center justify-center">
              <span className="text-slate-500 font-black text-[10px]">S</span>
            </div>
            <span className="text-[11px] font-bold">Sideline</span>
          </div>
        </div>
      </div>
    </div>
  )
}
