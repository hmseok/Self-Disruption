'use client'
import { useUpload } from '../context/UploadContext'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

const NAV_ITEMS = [
  { label: '📊 대시보드', path: '/finance' },
  { label: '📑 분류 관리', path: '/finance/upload' },
  { label: '💳 정산 관리', path: '/finance/settlement' },
  { label: '🚗 차량 관리', path: '/cars' },
]

export default function UploadWidget() {
  const { status, progress, currentFileName, logs, totalFiles, currentFileIndex, pauseProcessing, resumeProcessing, cancelProcessing, closeWidget } = useUpload()
  const router = useRouter()
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(true)
  const [showNav, setShowNav] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (status === 'processing') setIsExpanded(true);
  }, [status]);

  // 외부 클릭 시 네비게이션 메뉴 닫기
  useEffect(() => {
    if (!showNav) return
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setShowNav(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showNav])

  // 드래그 핸들러
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: rect.left, startPosY: rect.top }
    setIsDragging(true)

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      const newX = Math.max(0, Math.min(window.innerWidth - 60, dragRef.current.startPosX + dx))
      const newY = Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.startPosY + dy))
      setPosition({ x: newX, y: newY })
    }
    const handleMouseUp = () => {
      setIsDragging(false)
      dragRef.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const handleNavClick = (path: string) => {
    router.push(path)
    setShowNav(false)
  }

  if (status === 'idle' && totalFiles === 0) return null;

  const posStyle = position
    ? { left: position.x, top: position.y, right: 'auto' as const, bottom: 'auto' as const }
    : {}

  return (
    <div
      className={`fixed z-[9999] flex flex-col items-end gap-3 font-sans ${!position ? 'bottom-4 right-4 md:right-8' : ''}`}
      style={{ ...posStyle, cursor: isDragging ? 'grabbing' : undefined }}
    >
      <div
        className={`
          transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          ${isExpanded ? 'w-[340px] md:w-[380px] opacity-100 translate-y-0' : 'w-14 h-14 rounded-full translate-y-0 opacity-90 shadow-lg hover:scale-110 cursor-pointer ml-auto'}
          bg-white/95 backdrop-blur-2xl border border-white/40 shadow-2xl rounded-[20px] overflow-hidden
          ring-1 ring-black/5
        `}
      >
        {/* ── 최소화 상태: 작은 원형 아이콘 ── */}
        {!isExpanded && (
          <button onClick={() => setIsExpanded(true)} className="w-full h-full flex items-center justify-center bg-gray-900 text-white transition-transform rounded-full">
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

        {/* ── 확장 상태 ── */}
        {isExpanded && (
          <div className="relative">
            {/* 드래그 가능한 헤더 바 */}
            <div
              onMouseDown={handleMouseDown}
              className="flex justify-between items-center px-4 py-2 bg-gray-50/80 border-b border-gray-100"
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  <span className="w-1 h-3 bg-gray-300 rounded-full"></span>
                  <span className="w-1 h-3 bg-gray-300 rounded-full"></span>
                  <span className="w-1 h-3 bg-gray-300 rounded-full"></span>
                </div>
                <span className="text-[10px] font-bold text-gray-400 select-none">파일 분석 중</span>
              </div>
              <div className="flex items-center gap-1">
                {/* 빠른 이동 버튼 */}
                <div className="relative" ref={navRef}>
                  <button
                    onClick={() => setShowNav(v => !v)}
                    className={`w-6 h-6 flex items-center justify-center rounded-md hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors ${showNav ? 'bg-blue-100 text-blue-600' : ''}`}
                    title="빠른 이동"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" rx="1"/>
                      <rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="3" y="14" width="7" height="7" rx="1"/>
                      <rect x="14" y="14" width="7" height="7" rx="1"/>
                    </svg>
                  </button>
                  {/* 빠른 이동 드롭다운 메뉴 */}
                  {showNav && (
                    <div className="absolute bottom-full right-0 mb-2 w-48 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
                      <div className="px-3 py-2 border-b border-gray-100">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">빠른 이동</span>
                      </div>
                      {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.path || (item.path !== '/finance' && pathname?.startsWith(item.path))
                        return (
                          <button
                            key={item.path}
                            onClick={() => handleNavClick(item.path)}
                            className={`w-full text-left px-3 py-2.5 text-xs font-medium flex items-center gap-2 transition-colors
                              ${isActive
                                ? 'bg-blue-50 text-blue-700 font-bold'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                              }`}
                          >
                            <span>{item.label}</span>
                            {isActive && <span className="ml-auto text-blue-400 text-[10px]">현재</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <button onClick={() => setIsExpanded(false)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-200 text-gray-400" title="최소화">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                {status === 'completed' && (
                  <button onClick={closeWidget} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-100 text-gray-400 hover:text-red-500" title="닫기">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 md:p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`
                  w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-sm border border-black/5
                  ${status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-blue-600'}
                `}>
                  {status === 'processing' && <span className="animate-spin">⚡️</span>}
                  {status === 'paused' && '⏸️'}
                  {status === 'completed' && '🎉'}
                  {status === 'error' && '🚨'}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm leading-tight">
                    {status === 'completed' ? '분석 완료!' : status === 'paused' ? '일시정지' : 'AI 분석 중...'}
                  </h3>
                  <p className="text-[11px] text-gray-500 font-medium">
                    {status === 'processing' ? `${currentFileIndex + 1}/${totalFiles || 1} 파일 처리 중` : status === 'completed' ? '결과 확인 가능' : '대기 중'}
                  </p>
                </div>
              </div>

              <div className="mb-3 bg-gray-50/80 rounded-xl p-2.5 border border-gray-100">
                 <p className="text-xs font-bold text-gray-700 truncate">{currentFileName || '준비 중...'}</p>
              </div>

              <div className="relative w-full bg-gray-100 rounded-full h-1.5 mb-3 overflow-hidden">
                <div className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
              </div>

              <div className="flex gap-2">
                {status === 'processing' && (
                  <>
                    <button onClick={pauseProcessing} className="flex-1 py-2 rounded-lg text-xs font-bold bg-white border border-gray-200 text-gray-600 hover:bg-gray-50">⏸️ 일시정지</button>
                    <button onClick={cancelProcessing} className="flex-1 py-2 rounded-lg text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100">⏹️ 취소</button>
                  </>
                )}
                {status === 'paused' && (
                    <button onClick={resumeProcessing} className="flex-1 py-2 rounded-lg text-xs font-bold bg-gray-900 text-white">▶️ 다시 시작</button>
                )}
                {status === 'completed' && (
                  <>
                    <button onClick={closeWidget} className="flex-1 py-2 rounded-lg text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200">닫기</button>
                    <button onClick={() => router.push('/finance/upload')} className="flex-1 py-2 rounded-lg text-xs font-bold bg-blue-600 text-white shadow hover:bg-blue-700">결과 보기 ➔</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
