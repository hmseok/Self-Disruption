'use client'
import { useUpload } from '../context/UploadContext'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function UploadWidget() {
  const { status, progress, currentFileName, logs, totalFiles, currentFileIndex, pauseProcessing, resumeProcessing, cancelProcessing, closeWidget } = useUpload()
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(true)

  useEffect(() => {
    if (status === 'processing') setIsExpanded(true);
  }, [status]);

  if (status === 'idle' && totalFiles === 0) return null;

  return (
    // 📱 모바일: 하단 중앙 정렬 / 💻 PC: 우측 하단 고정
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-8 z-[9999] flex flex-col items-end gap-3 font-sans">

      <div
        className={`
          transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          ${isExpanded ? 'w-full md:w-[380px] opacity-100 translate-y-0' : 'w-14 h-14 rounded-full translate-y-0 opacity-90 shadow-lg hover:scale-110 cursor-pointer ml-auto'}
          bg-white/95 backdrop-blur-2xl border border-white/40 shadow-2xl rounded-[32px] overflow-hidden
          ring-1 ring-black/5
        `}
      >
        {!isExpanded && (
          <button onClick={() => setIsExpanded(true)} className="w-full h-full flex items-center justify-center bg-gray-900 text-white transition-transform">
            {status === 'processing' ? (
                <div className="relative w-full h-full flex items-center justify-center">
                    <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="absolute text-[9px] font-bold">{Math.round(progress)}%</span>
                </div>
            ) : (
                <span className="text-xl">📑</span>
            )}
          </button>
        )}

        {isExpanded && (
          <div className="p-5 md:p-6 relative">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={`
                  w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center text-xl md:text-2xl shadow-sm border border-black/5
                  ${status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-steel-50 text-steel-600'}
                `}>
                  {status === 'processing' && <span className="animate-spin">⚡️</span>}
                  {status === 'paused' && '⏸️'}
                  {status === 'completed' && '🎉'}
                  {status === 'error' && '🚨'}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base md:text-lg leading-tight">
                    {status === 'completed' ? '분석 완료!' : 'AI 분석 중...'}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    {status === 'processing' ? '데이터 추출 중...' : status === 'completed' ? '결과 확인 가능' : '대기 중'}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsExpanded(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>
            </div>

            <div className="mb-4 bg-gray-50/80 rounded-2xl p-3 border border-gray-100 shadow-inner">
               <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-black tracking-wider text-gray-500 bg-white px-2 py-0.5 rounded shadow-sm border border-gray-100">
                    FILE {currentFileIndex + 1}/{totalFiles || 1}
                  </span>
                  <span className="text-sm font-black text-steel-600">{Math.round(progress)}%</span>
               </div>
               <p className="text-sm font-bold text-gray-800 truncate">{currentFileName || '준비 중...'}</p>
            </div>

            <div className="relative w-full bg-gray-100 rounded-full h-2 mb-4 overflow-hidden border border-gray-100">
              <div className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-steel-500 via-steel-500 to-steel-600 transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:gap-3">
              {status === 'processing' && (
                <>
                  <button onClick={pauseProcessing} className="py-2.5 rounded-xl text-xs md:text-sm font-bold bg-white border border-gray-200 text-gray-600">⏸️ 일시정지</button>
                  <button onClick={cancelProcessing} className="py-2.5 rounded-xl text-xs md:text-sm font-bold bg-red-50 text-red-600">⏹️ 취소</button>
                </>
              )}
              {status === 'paused' && (
                  <button onClick={resumeProcessing} className="col-span-2 py-2.5 rounded-xl text-sm font-bold bg-gray-900 text-white">▶️ 다시 시작</button>
              )}
              {status === 'completed' && (
                <>
                  <button onClick={closeWidget} className="py-2.5 rounded-xl text-sm font-bold text-gray-500 bg-gray-100">닫기</button>
                  <button onClick={() => router.push('/finance/upload')} className="py-2.5 rounded-xl text-sm font-bold bg-steel-600 text-white shadow-lg">결과 보기 ➔</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}