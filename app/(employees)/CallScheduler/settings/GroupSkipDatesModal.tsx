'use client'
// ═══════════════════════════════════════════════════════════════════
// PR-2SS-h-1 — 그룹 회피일 모달
//   매니저: 워커별 회피 일자 범위 + 사유 입력 (즉시 'approved')
//   직원 신청 (h-2): status='requested' 로 들어옴 → 매니저가 승인/거절
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '@/app/(employees)/CallScheduler/utils/palette'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { Worker, GroupMemberSkipDate, SkipStatus } from '@/app/(employees)/CallScheduler/utils/types'

interface Props {
  groupId: string
  worker: Worker | null
  existingSkips: GroupMemberSkipDate[]
  onClose: () => void
  onChanged: () => void
}

const STATUS_LABEL: Record<SkipStatus, string> = {
  requested: '⏳ 신청 대기',
  approved:  '✓ 승인',
  rejected:  '✗ 거절',
  canceled:  '취소됨',
}
const STATUS_TONE: Record<SkipStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  requested: 'warning',
  approved:  'success',
  rejected:  'danger',
  canceled:  'neutral',
}

export default function GroupSkipDatesModal({ groupId, worker, existingSkips, onClose, onChanged }: Props) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!worker) return null

  const add = async () => {
    setError(null)
    if (!start || !end) { setError('시작·종료 필수'); return }
    if (start > end) { setError('시작이 종료보다 이후'); return }
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/shift-groups/${groupId}/skip-dates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          worker_id: worker.id,
          start_date: start, end_date: end,
          reason: reason.trim() || null,
          // 매니저 직접 추가 → 즉시 승인
          status: 'approved',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '추가 실패')
      setStart(''); setEnd(''); setReason('')
      onChanged()
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setSaving(false) }
  }

  const updateStatus = async (skipId: string, status: SkipStatus) => {
    setSaving(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/shift-groups/${groupId}/skip-dates/${skipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      onChanged()
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setSaving(false) }
  }

  const remove = async (skipId: string) => {
    if (!confirm('이 회피일을 삭제합니다. 계속할까요?')) return
    setSaving(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/shift-groups/${groupId}/skip-dates/${skipId}`, {
        method: 'DELETE', headers: auth,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      onChanged()
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setSaving(false) }
  }

  return (
    <div onClick={onClose}
         style={{
           position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
           display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
         }}>
      <div onClick={(e) => e.stopPropagation()}
           style={{
             ...GLASS.L4, width: 560, maxWidth: '94vw', maxHeight: '90vh',
             borderRadius: 16, padding: 20, overflowY: 'auto',
             display: 'flex', flexDirection: 'column', gap: 14,
           }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>
            🛌 {worker.name} 회피일 관리
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
            이 그룹에서 빠지는 날 — 자동 생성에서 후보 제외 (휴가 X, 단순 회피)
          </div>
        </div>

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            color: COLORS.danger, fontSize: 12,
          }}>❌ {error}</div>
        )}

        {/* 기존 목록 */}
        <div style={{ ...GLASS.L1, borderRadius: 8, padding: 8, maxHeight: 240, overflowY: 'auto' }}>
          {existingSkips.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
              회피일 없음
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {existingSkips.map(s => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.7)',
                  border: `1px solid ${COLORS.borderFaint}`,
                }}>
                  <span style={pillStyle(STATUS_TONE[s.status])}>
                    {STATUS_LABEL[s.status]}
                  </span>
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: COLORS.textPrimary }}>
                    {s.start_date}{s.start_date !== s.end_date && ` ~ ${s.end_date}`}
                    {s.reason && (
                      <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 500, marginLeft: 6 }}>
                        — {s.reason}
                      </span>
                    )}
                  </div>
                  {s.status === 'requested' && (
                    <>
                      <button type="button" disabled={saving}
                              onClick={() => updateStatus(s.id, 'approved')}
                              style={{
                                ...BTN.sm, background: COLORS.success, color: '#fff',
                                border: 'none', cursor: 'pointer', fontSize: 11,
                              }}>승인</button>
                      <button type="button" disabled={saving}
                              onClick={() => updateStatus(s.id, 'rejected')}
                              style={{
                                ...BTN.sm, background: 'transparent', color: COLORS.danger,
                                border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer', fontSize: 11,
                              }}>거절</button>
                    </>
                  )}
                  <button type="button" disabled={saving}
                          onClick={() => remove(s.id)}
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: COLORS.textMuted, fontSize: 14, padding: 0,
                          }} title="삭제">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 신규 추가 (매니저 직접 — 즉시 승인) */}
        <div style={{ ...GLASS.L1, borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
            + 매니저 직접 추가 (즉시 승인)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: COLORS.textSecondary, fontWeight: 700 }}>시작일</div>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
                     style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: COLORS.textSecondary, fontWeight: 700 }}>종료일</div>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
                     style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, color: COLORS.textSecondary, fontWeight: 700 }}>사유 메모 (선택)</div>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                   placeholder="예: 외부 일정, 가족 행사 등"
                   style={inputStyle} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" onClick={add} disabled={saving}
                    style={{
                      ...BTN.md, background: COLORS.primary, color: '#fff',
                      border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1,
                    }}>
              {saving ? '추가 중...' : '✓ 추가 (승인)'}
            </button>
          </div>
        </div>

        {/* 닫기 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
                  style={{
                    ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                    border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                  }}>닫기</button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 12,
  border: `1px solid ${COLORS.borderFaint}`,
  background: 'rgba(255,255,255,0.85)', marginTop: 2,
  outline: 'none',
}
