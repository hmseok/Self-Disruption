'use client'
// ═══════════════════════════════════════════════════════════════════
// DistributionDialog — 배포(공지) 모달
// alert() 금지 — 결과는 글래스 패널 (CLAUDE.md 규칙 20)
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { Worker, DistributionChannel } from '../utils/types'

interface Props {
  open: boolean
  onClose: () => void
  scheduleId: string
  workers: Worker[]
  onCompleted: () => void
}

const CHANNEL_OPTIONS: { value: DistributionChannel; label: string; sub: string }[] = [
  { value: 'jandi',  label: '잠디',     sub: '워크챗 채널 (Phase 2)' },
  { value: 'email',  label: '이메일',   sub: 'email 컬럼 보유자 (Phase 2)' },
  { value: 'link',   label: '공유 링크', sub: '읽기 전용 링크 생성' },
  { value: 'manual', label: '수동',     sub: '기록만 — 외부 전송 없음' },
]

export default function DistributionDialog(props: Props) {
  const { open, onClose, scheduleId, workers, onCompleted } = props
  const [channel, setChannel] = useState<DistributionChannel>('manual')
  const [selectedIds, setSelectedIds] = useState<string[]>(workers.map(w => w.id))
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const selected = useMemo(
    () => workers.filter(w => selectedIds.includes(w.id)),
    [workers, selectedIds],
  )
  const missingContact = useMemo(() => {
    if (channel === 'jandi' || channel === 'email') {
      return selected.filter(w => channel === 'email' ? !w.email : !w.phone)
    }
    return []
  }, [selected, channel])

  if (!open) return null

  const toggleAll = () => {
    if (selectedIds.length === workers.length) setSelectedIds([])
    else setSelectedIds(workers.map(w => w.id))
  }

  const submit = async () => {
    setSending(true)
    setResult(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/distributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          schedule_id: scheduleId,
          channel,
          recipient_ids: selectedIds,
          message,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '배포 실패')
      setResult({
        ok: true,
        text: `${selectedIds.length}명 ${channel === 'manual' || channel === 'link' ? '기록 완료' : '큐에 등록됨'}`,
      })
      onCompleted()
    } catch (e: any) {
      setResult({ ok: false, text: e?.message || '배포 실패' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.L4, width: 560, maxWidth: '92vw', maxHeight: '88vh',
          borderRadius: 16, padding: 22, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
            ⚡ 스케줄 배포
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
            근무자에게 이번 달 시프트를 공지합니다.
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
            채널
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {CHANNEL_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setChannel(opt.value)}
                style={{
                  padding: '10px 12px', borderRadius: 8, textAlign: 'left',
                  background: channel === opt.value ? COLORS.bgBlue : 'transparent',
                  border: `1px solid ${channel === opt.value ? COLORS.borderBlue : COLORS.borderFaint}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                  {opt.sub}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 6,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary }}>
              수신자 ({selectedIds.length}/{workers.length})
            </div>
            <button
              type="button"
              onClick={toggleAll}
              style={{
                fontSize: 11, color: COLORS.info, background: 'transparent',
                border: 'none', cursor: 'pointer', fontWeight: 700,
              }}
            >
              {selectedIds.length === workers.length ? '전체 해제' : '전체 선택'}
            </button>
          </div>
          <div style={{
            ...GLASS.L1, borderRadius: 8, padding: 8, maxHeight: 160, overflowY: 'auto',
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
          }}>
            {workers.map(w => {
              const checked = selectedIds.includes(w.id)
              const missing = (channel === 'email' && !w.email) || (channel === 'jandi' && !w.phone)
              return (
                <label
                  key={w.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
                    background: checked ? COLORS.bgBlue : 'transparent',
                    color: missing ? COLORS.danger : COLORS.textPrimary,
                    fontSize: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelectedIds(prev =>
                        prev.includes(w.id) ? prev.filter(x => x !== w.id) : [...prev, w.id]
                      )
                    }}
                  />
                  <span>{w.name}</span>
                  {missing && <span style={{ fontSize: 10 }}>!</span>}
                </label>
              )
            })}
          </div>
          {missingContact.length > 0 && (
            <div style={{
              marginTop: 6, padding: '6px 10px', borderRadius: 6,
              background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
              color: COLORS.danger, fontSize: 11,
            }}>
              {missingContact.length}명 연락처 누락 — 채널 변경 또는 워커 정보 보완 필요
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
            메시지 (선택)
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="이번 달 근무표 공유드립니다. 변경 사항 있으면 매니저에게 연락주세요."
            style={{
              ...GLASS.L1, width: '100%', borderRadius: 8, padding: 10,
              fontSize: 13, color: COLORS.textPrimary, outline: 'none', resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {result && (
          <div style={{
            ...GLASS.L3,
            background: result.ok ? COLORS.bgGreen : COLORS.bgRed,
            border: `1px solid ${result.ok ? COLORS.borderGreen : COLORS.borderRed}`,
            borderRadius: 8, padding: '10px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: result.ok ? COLORS.success : COLORS.danger,
            }}>
              {result.ok ? '✅ ' : '❌ '}{result.text}
            </div>
            <button
              type="button"
              onClick={() => setResult(null)}
              style={{
                background: 'transparent', border: 'none',
                color: COLORS.textMuted, cursor: 'pointer', fontSize: 14,
              }}
            >×</button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
              border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
            }}
          >
            닫기
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={sending || selectedIds.length === 0}
            style={{
              ...BTN.lg, background: COLORS.primary, color: '#fff', border: 'none',
              cursor: sending || selectedIds.length === 0 ? 'not-allowed' : 'pointer',
              opacity: sending || selectedIds.length === 0 ? 0.6 : 1,
            }}
          >
            {sending ? '전송 중...' : `${selectedIds.length}명에게 배포`}
          </button>
        </div>
      </div>
    </div>
  )
}
