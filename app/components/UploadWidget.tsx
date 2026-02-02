'use client'
import { useUpload } from '../context/UploadContext'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function UploadWidget() {
  const { status, progress, currentFileName, logs, totalFiles, currentFileIndex, pauseProcessing, resumeProcessing, cancelProcessing, closeWidget } = useUpload()
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(true)

  // 상태 변경 시 자동으로 펼치기
  useEffect(() => {
    if (status === 'processing') setIsExpanded(true);
  }, [status]);

  // 대기 중이면 숨김
  if (status === 'idle' && totalFiles === 0) return null;

  return (
    <div className="fixed bottom-8 right-8 z-[9999] flex flex-col items-end gap-3 font-sans">

      {/* 🌟 메인 카드 위젯 */}
      <div
        className={`
          transition-all duration-500 ease-spring
          ${isExpanded ? 'w-[360px] opacity-100 translate-y-0' : 'w-14 h-14 rounded-full overflow-hidden translate-y-4 opacity-90'}
          bg-white/90 backdrop-blur-xl border border-white/20 shadow-2xl rounded-[28px] overflow-hidden
          ring-1 ring-black/5
        `}
      >
        {/* 🟢 축소 모드 (아이콘만) */}
        {!isExpanded && (
          <button onClick={() => setIsExpanded(true)} className="w-full h-full flex items-center justify-center bg-gray-900 text-white hover:scale-110 transition-transform">
            {status === 'processing' ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
                <span className="text-xl">📑</span>
            )}
          </button>
        )}

        {/* 🔵 확장 모드 (상세 내용) */}
        {isExpanded && (
          <div className="p-6 relative">

            {/* 상단 헤더 */}
            <div className="flex justify-between items-start mb-5">
              <div className="flex items-center gap-3">
                <div className={`
                  w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-inner
                  ${status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-indigo-50 text-indigo-600'}
                `}>
                  {status === 'processing' && <span className="animate-spin">⚡️</span>}
                  {status === 'paused' && '⏸️'}
                  {status === 'completed' && '🎉'}
                  {status === 'error' && '🚨'}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base leading-tight">
                    {status === 'completed' ? '분석 완료' : 'AI 분석 엔진 가동'}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    {status === 'processing' ? '실시간 데이터 추출 중...' : status === 'completed' ? '결과를 확인하세요' : '대기 중'}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsExpanded(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* 파일 정보 & 로그 */}
            <div className="mb-5 bg-gray-50/80 rounded-2xl p-4 border border-gray-100">
               <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-gray-700 bg-white px-2 py-1 rounded-md shadow-sm border border-gray-100">
                    FILE {currentFileIndex + 1} / {totalFiles || 1}
                  </span>
                  <span className="text-xs font-bold text-indigo-600">{Math.round(progress)}%</span>
               </div>

               <p className="text-sm font-semibold text-gray-800 truncate mb-1">{currentFileName || '준비 중...'}</p>
               <p className="text-xs text-gray-500 animate-pulse">{logs || '대기 중...'}</p>
            </div>

            {/* 프로그레스 바 (그라데이션) */}
            <div className="relative w-full bg-gray-100 rounded-full h-2 mb-6 overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                style={{ width: `${progress}%` }}
              ></div>
            </div>

            {/* 하단 버튼 그룹 */}
            <div className="grid grid-cols-2 gap-3">
              {status === 'processing' && (
                <>
                  <button onClick={pauseProcessing} className="py-2.5 rounded-xl text-sm font-bold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
                    일시정지
                  </button>
                  <button onClick={cancelProcessing} className="py-2.5 rounded-xl text-sm font-bold bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                    취소하기
                  </button>
                </>
              )}

              {status === 'paused' && (
                <>
                  <button onClick={resumeProcessing} className="col-span-2 py-2.5 rounded-xl text-sm font-bold bg-gray-900 text-white hover:bg-black transition-all shadow-lg hover:shadow-xl">
                    다시 시작 ▶
                  </button>
                </>
              )}

              {status === 'completed' && (
                <>
                  <button onClick={closeWidget} className="py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100">
                    닫기
                  </button>
                  <button onClick={() => router.push('/finance/upload')} className="py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg hover:shadow-indigo-200 transition-all">
                    결과 보기 ➔
                  </button>
                </>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}