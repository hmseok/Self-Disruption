'use client'
import { useEffect, useState } from 'react'
import { COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════
// AutoSaveIndicator — 본문 자동 저장 상태 표시 (PR-V2-A)
//   · 「✓ 저장됨 · N초 전」 / 「저장 중...」 / 「⚠ 저장 실패」 / 「⚠ 버전 충돌」
// ═══════════════════════════════════════════════════════════════

export type SaveStatus =
  | 'idle'          // 변경 없음
  | 'pending'       // debounce 대기 중
  | 'saving'        // PATCH 진행 중
  | 'saved'         // 성공
  | 'error'         // 일반 실패
  | 'conflict'      // 409 version_conflict
  | 'migration'    // 503 migration_pending

interface Props {
  status: SaveStatus
  /** 마지막 성공 저장 시각 — Date or ISO string */
  lastSavedAt?: Date | string | null
  /** error/conflict 일 때 보여줄 메시지 */
  message?: string
}

export default function AutoSaveIndicator({ status, lastSavedAt, message }: Props) {
  const [relative, setRelative] = useState<string>('')

  useEffect(() => {
    if (!lastSavedAt) { setRelative(''); return }
    const tick = () => {
      const t = typeof lastSavedAt === 'string' ? new Date(lastSavedAt) : lastSavedAt
      const sec = Math.max(0, Math.floor((Date.now() - t.getTime()) / 1000))
      if (sec < 5) setRelative('방금')
      else if (sec < 60) setRelative(`${sec}초 전`)
      else if (sec < 3600) setRelative(`${Math.floor(sec / 60)}분 전`)
      else setRelative(`${Math.floor(sec / 3600)}시간 전`)
    }
    tick()
    const i = setInterval(tick, 5000)
    return () => clearInterval(i)
  }, [lastSavedAt])

  const cfg = renderConfig(status, relative, message)

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 8,
      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      <span>{cfg.icon}</span>
      <span>{cfg.text}</span>
    </div>
  )
}

function renderConfig(status: SaveStatus, relative: string, message?: string): {
  icon: string; text: string; bg: string; color: string; border: string;
} {
  switch (status) {
    case 'idle':
      return { icon: '✓', text: relative ? `저장됨 · ${relative}` : '저장됨', bg: 'rgba(34,197,94,0.08)', color: '#15803d', border: 'rgba(34,197,94,0.25)' }
    case 'pending':
      return { icon: '⌛', text: '변경됨 (자동 저장 대기)', bg: 'rgba(245,158,11,0.08)', color: '#b45309', border: 'rgba(245,158,11,0.25)' }
    case 'saving':
      return { icon: '⟳', text: '저장 중...', bg: 'rgba(59,130,246,0.08)', color: '#1d4ed8', border: 'rgba(59,130,246,0.25)' }
    case 'saved':
      return { icon: '✓', text: relative ? `저장됨 · ${relative}` : '저장됨', bg: 'rgba(34,197,94,0.08)', color: '#15803d', border: 'rgba(34,197,94,0.25)' }
    case 'conflict':
      return { icon: '⚠', text: message || '다른 세션에서 변경됨 — 새로고침', bg: 'rgba(239,68,68,0.10)', color: '#b91c1c', border: 'rgba(239,68,68,0.35)' }
    case 'migration':
      return { icon: '⚠', text: message || 'DB 마이그 미적용', bg: 'rgba(239,68,68,0.10)', color: '#b91c1c', border: 'rgba(239,68,68,0.35)' }
    case 'error':
    default:
      return { icon: '⚠', text: message || '저장 실패 — 재시도', bg: 'rgba(239,68,68,0.10)', color: '#b91c1c', border: 'rgba(239,68,68,0.35)' }
  }
}
