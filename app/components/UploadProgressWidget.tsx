'use client'

import { useUpload } from '@/app/context/UploadContext'
import { usePathname } from 'next/navigation'

export default function UploadProgressWidget() {
  const pathname = usePathname()
  const {
    status,
    progress,
    currentFileIndex,
    totalFiles,
    currentFileName,
    pauseProcessing,
    cancelProcessing,
    resumeProcessing,
  } = useUpload()

  // 업로드 페이지에서는 표시하지 않음 (본문에서 이미 보이므로)
  if (pathname === '/finance/upload') return null

  // processing 또는 paused 상태일 때만 표시
  if (status !== 'processing' && status !== 'paused') return null

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, width: 300, zIndex: 9999,
      background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
      boxShadow: '0 10px 40px rgba(0,0,0,0.12)', padding: 16,
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {status === 'processing' ? (
          <div style={{ width: 16, height: 16, border: '2.5px solid #bfdbfe', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        ) : (
          <span style={{ fontSize: 14 }}>⏸️</span>
        )}
        <span style={{ fontWeight: 800, fontSize: 13, color: status === 'processing' ? '#1e40af' : '#b45309' }}>
          {status === 'processing' ? '파일 처리 중' : '일시정지'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
          {currentFileIndex + 1} / {totalFiles}
        </span>
      </div>

      {/* 파일명 */}
      <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
        {currentFileName || '처리 대기 중...'}
      </p>

      {/* 진행률 바 */}
      <div style={{ background: '#f1f5f9', borderRadius: 6, height: 6, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ height: '100%', background: status === 'processing' ? '#2563eb' : '#f59e0b', width: `${progress}%`, transition: 'width 0.5s ease', borderRadius: 6 }} />
      </div>

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: 6 }}>
        {status === 'processing' ? (
          <button onClick={pauseProcessing}
            style={{ flex: 1, padding: '6px 10px', fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#b45309', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            ⏸ 일시정지
          </button>
        ) : (
          <button onClick={resumeProcessing}
            style={{ flex: 1, padding: '6px 10px', fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#1e40af', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            ▶ 재개
          </button>
        )}
        <button onClick={cancelProcessing}
          style={{ flex: 1, padding: '6px 10px', fontSize: 11, fontWeight: 700, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          ✕ 취소
        </button>
      </div>

      {/* CSS 애니메이션 */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
