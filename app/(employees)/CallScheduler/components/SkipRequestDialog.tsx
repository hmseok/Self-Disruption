'use client'
// ═══════════════════════════════════════════════════════════════════
// SkipRequestDialog — 직원 본인 회피일 신청 (Phase G)
//   그룹 선택 + 일자 범위 + 사유 → status='requested'
//   매니저 검토 후 승인 (status='approved') 시 자동 생성에서 후보 제외
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

interface ShiftGroup {
  id: string
  name: string
  category: string
  slot_code: string
  slot_label: string
  is_active: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  workerId: string
  workerName: string
  token?: string  // 토큰 페이지 (비로그인) 직원 — 옵션
  onCompleted: () => void
}

export default function SkipRequestDialog({ open, onClose, workerId, workerName, token, onCompleted }: Props) {
  const [groups, setGroups] = useState<ShiftGroup[]>([])
  const [groupId, setGroupId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setError(null)
    setLoading(true)
    ;(async () => {
      try {
        const auth = await getAuthHeader()
        const res = await fetch('/api/call-scheduler/shift-groups', { headers: auth })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '그룹 조회 실패')
        const activeGroups = (json.data || []).filter((g: any) => g.is_active)
        setGroups(activeGroups)
        if (activeGroups.length === 1) {
          setGroupId(activeGroups[0].id)
        }
      } catch (e: any) {
        setError(e?.message || '오류')
      } finally {
        setLoading(false)
      }
    })()
  }, [open])

  const submit = async () => {
    setError(null)
    if (!groupId) { setError('그룹 선택 필수'); return }
    if (!start || !end) { setError('시작·종료 일자 필수'); return }
    if (start > end) { setError('시작이 종료보다 이후일 수 없음'); return }
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/shift-groups/${groupId}/skip-dates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          worker_id: workerId,
          start_date: start,
          end_date: end,
          reason: reason.trim() || null,
          status: 'requested',  // 직원 신청 = 매니저 승인 대기
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '신청 실패')
      // 초기화 후 종료
      setStart(''); setEnd(''); setReason(''); setGroupId('')
      onCompleted()
      onClose()
    } catch (e: any) {
      setError(e?.message || '오류')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div onClick={onClose}
         style={{
           position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
           display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
         }}>
      <div onClick={(e) => e.stopPropagation()}
           style={{
             ...GLASS.L4, width: 520, maxWidth: '94vw', maxHeight: '90vh',
             borderRadius: 16, padding: 22, overflowY: 'auto',
             display: 'flex', flexDirection: 'column', gap: 14,
           }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>
            🛌 회피일 신청
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
            {workerName} — 이 그룹에서 빠지고 싶은 날 신청 (매니저 승인 후 자동 생성에서 제외)
          </div>
        </div>

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            color: COLORS.danger, fontSize: 12,
          }}>❌ {error}</div>
        )}

        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: COLORS.textMuted }}>로딩...</div>
        ) : groups.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: COLORS.textMuted }}>
            활성 그룹이 없습니다.
          </div>
        ) : (
          <>
            {/* 그룹 선택 */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
                그룹 선택 *
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {groups.map(g => {
                  const active = groupId === g.id
                  return (
                    <button key={g.id} type="button"
                            onClick={() => setGroupId(g.id)}
                            style={{
                              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                              background: active ? COLORS.bgBlue : 'rgba(255,255,255,0.6)',
                              color: active ? COLORS.info : COLORS.textPrimary,
                              border: `2px solid ${active ? COLORS.borderBlue : COLORS.borderFaint}`,
                              cursor: 'pointer',
                            }}>
                      {g.name}
                      <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 6 }}>
                        {g.slot_code}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 일자 범위 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
                  시작일 *
                </div>
                <input type="date" value={start}
                       onChange={(e) => {
                         setStart(e.target.value)
                         if (!end) setEnd(e.target.value)
                       }}
                       style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
                  종료일 *
                </div>
                <input type="date" value={end}
                       onChange={(e) => setEnd(e.target.value)}
                       style={inputStyle} />
              </div>
            </div>

            {/* 사유 메모 */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
                사유 메모 (선택)
              </div>
              <input type="text" value={reason}
                     onChange={(e) => setReason(e.target.value)}
                     placeholder="예: 외부 일정, 가족 행사 등"
                     style={inputStyle} />
            </div>
          </>
        )}

        {/* 액션 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose}
                  style={{
                    ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                    border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                  }}>취소</button>
          <button type="button" onClick={submit} disabled={saving || loading || groups.length === 0}
                  style={{
                    ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
                    cursor: (saving || loading) ? 'not-allowed' : 'pointer',
                    opacity: (saving || loading) ? 0.6 : 1,
                  }}>
            {saving ? '신청 중...' : '🛌 신청 (승인 대기)'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  fontSize: 13, color: COLORS.textPrimary, outline: 'none',
  border: `1px solid ${COLORS.borderFaint}`,
  background: 'rgba(255,255,255,0.85)',
}
