'use client'

export default function VerifiedPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 max-w-md w-full text-center space-y-6 animate-fade-in-up">

        {/* 성공 아이콘 */}
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto shadow-inner">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">이메일 인증 성공! 🎉</h1>
          <p className="text-gray-500 font-medium">
            본인 인증이 안전하게 완료되었습니다.<br/>
            이제 원래 열려있던 창에서<br/>
            <span className="text-indigo-600 font-bold">자동으로 로그인</span>됩니다.
          </p>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-4">이 창은 닫으셔도 됩니다.</p>
          <button
            onClick={() => window.close()}
            className="w-full bg-gray-900 hover:bg-black text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-gray-200"
          >
            창 닫기 ✖️
          </button>
        </div>

      </div>
    </div>
  )
}