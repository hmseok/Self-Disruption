'use client'

// ═══════════════════════════════════════════════════════════════════
// ForcePasswordChange — 임시 비밀번호 로그인 시 강제 변경 화면 (2026-08-07)
//   관리자가 초기화한 계정(must_change_password=1)은 변경 전까지 업무 화면 진입 차단.
//   ClientLayout 이 감싸서 노출 — 변경 완료 시 localStorage 사용자 정보 갱신 후 통과.
// ═══════════════════════════════════════════════════════════════════

import { useState } from 'react'
import { getStoredUser, getStoredToken, setAuth, clearAuth } from '@/lib/auth-client'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e6e8ec',
  fontSize: 14, background: '#f6f7f9', color: '#1a1d23', outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5b626e', display: 'block', marginBottom: 6 }

export default function ForcePasswordChange({ onDone }: { onDone: () => void }) {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    setErr(null)
    if (next !== confirm) { setErr('새 비밀번호가 서로 다릅니다.'); return }
    setBusy(true)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ current_password: cur, new_password: next }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error || '변경에 실패했습니다.'); return }
      // 저장된 사용자 정보에서 플래그 해제
      const u = getStoredUser()
      if (token && u) setAuth(token, { ...u, must_change_password: false })
      onDone()
    } catch {
      setErr('네트워크 오류가 발생했습니다.')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7f9', display: 'grid', placeItems: 'center', padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif' }}>
      <div style={{ width: 420, maxWidth: '100%', background: '#fff', border: '1px solid #e6e8ec', borderRadius: 16, padding: '30px 28px', boxShadow: '0 12px 34px rgba(16,24,40,0.07)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#1a1d23' }}>비밀번호 변경</div>
          <div style={{ fontSize: 12.5, color: '#5b626e', marginTop: 5, lineHeight: 1.6 }}>
            임시 비밀번호로 로그인하셨습니다. 계속하려면 새 비밀번호를 설정해주세요.
          </div>
        </div>

        <div>
          <label style={labelStyle}>현재(임시) 비밀번호</label>
          <input type="password" style={inputStyle} value={cur} onChange={e => setCur(e.target.value)} autoFocus />
        </div>
        <div>
          <label style={labelStyle}>새 비밀번호</label>
          <input type="password" style={inputStyle} value={next} onChange={e => setNext(e.target.value)} placeholder="영문 + 숫자 포함 8자 이상" />
        </div>
        <div>
          <label style={labelStyle}>새 비밀번호 확인</label>
          <input type="password" style={inputStyle} value={confirm} onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && cur && next && confirm) submit() }} />
        </div>

        {err && (
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#dc2626', background: '#fdf0f0', borderRadius: 10, padding: '10px 13px' }}>{err}</div>
        )}

        <button onClick={submit} disabled={busy || !cur || !next || !confirm}
          style={{ width: '100%', padding: 14, borderRadius: 11, border: 'none', background: '#2563eb', color: '#fff', fontSize: 14.5, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', opacity: (!cur || !next || !confirm) ? 0.5 : 1 }}>
          {busy ? '변경 중...' : '변경하고 시작하기'}
        </button>

        <button onClick={() => { clearAuth(); location.href = '/' }}
          style={{ background: 'none', border: 'none', fontSize: 12, color: '#94a3b8', cursor: 'pointer', padding: 0 }}>
          다른 계정으로 로그인
        </button>
      </div>
    </div>
  )
}
