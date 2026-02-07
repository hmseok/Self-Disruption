'use client'

import { useEffect } from 'react'

export default function VerifiedPage() {
  // (선택 사항) 3초 뒤에 자동으로 창을 닫으려면 주석 해제
  /*
  useEffect(() => {
    setTimeout(() => {
      window.close()
    }, 3000)
  }, [])
  */

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-center p-4">
      <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full border border-slate-100 animate-fade-in-up">
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl shadow-sm">
          🎉
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 mb-3">
          인증되었습니다!
        </h1>
        <p className="text-slate-500 mb-8 leading-relaxed text-base">
          본인 확인이 완료되었습니다.<br/>
          이제 <span className="font-bold text-slate-900">원래 열려있던 창</span>을 확인해보세요.<br/>
          자동으로 로그인이 완료되었습니다.
        </p>
        <button
          onClick={() => window.close()}
          className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-black transition-all shadow-lg hover:shadow-xl"
        >
          이 창 닫기
        </button>
      </div>
    </div>
  )
}