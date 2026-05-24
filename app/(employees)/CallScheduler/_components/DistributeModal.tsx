'use client'
// ═══════════════════════════════════════════════════════════════════
// DistributeModal — 알리고 SMS 근무표 배포 모달 (Phase CX-KPI-21)
//
// POST /api/call-scheduler/schedules/{id}/distribute
//   · mode:'preview' — 수신자/메시지 목록 (열릴 때 자동)
//   · mode:'test'    — 알리고 testmode (무과금 검증)
//   · mode:'send'    — 실제 발송 (과금) — 인라인 확인 단계 필수
//
// CLAUDE.md 규칙 20 — alert()/confirm() 금지, 결과는 글래스 패널
// 색상은 COLORS/GLASS/BTN 토큰만 (ui-token-lint)
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

interface Recipient {
  worker_id: string
  name: string
  phone: string
  phone_valid: boolean
  work_days: number
  first_day: string | null
  token: string
  message: string
}

interface PreviewData {
  mode: string
  year: number
  month: number
  aligo_configured: boolean
  total: number
  sendable_count: number
  invalid_count: number
  recipients: Recipient[]
  max_recipients: number
}

interface SendData {
  mode: string
  year: number
  month: number
  ok: boolean
  testmode: boolean
  result_code: number
  message: string
  success_cnt: number
  error_cnt: number
  sent_count: number
  invalid_count: number
}

interface Props {
  open: boolean
  onClose: () => void
  scheduleId: string
}

export default function DistributeModal({ open, onClose, scheduleId }: Props) {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [busyMode, setBusyMode] = useState<'test' | 'send' | null>(null)
  const [sendResult, setSendResult] = useState<SendData | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  // 실제 발송 인라인 확인 단계 (confirm() 대체 — 규칙 20)
  const [confirmSend, setConfirmSend] = useState(false)
  // 메시지 미리보기 펼침 (worker_id)
  const [expanded, setExpanded] = useState<string | null>(null)

  // 모달 열릴 때 preview 호출
  const loadPreview = useCallback(async () => {
    setLoading(true)
    setPreview(null)
    setPreviewError(null)
    setSendResult(null)
    setSendError(null)
    setConfirmSend(false)
    setExpanded(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/schedules/${scheduleId}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ mode: 'preview' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '미리보기 조회 실패')
      setPreview(json.data as PreviewData)
    } catch (e: any) {
      setPreviewError(e?.message || '오류')
    } finally {
      setLoading(false)
    }
  }, [scheduleId])

  useEffect(() => {
    if (open) loadPreview()
  }, [open, loadPreview])

  // ESC 로 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const dispatch = async (mode: 'test' | 'send') => {
    setBusyMode(mode)
    setSendResult(null)
    setSendError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/schedules/${scheduleId}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ mode }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || (mode === 'test' ? '테스트 발송 실패' : '발송 실패'))
      setSendResult(json.data as SendData)
      setConfirmSend(false)
    } catch (e: any) {
      setSendError(e?.message || '오류')
    } finally {
      setBusyMode(null)
    }
  }

  const aligoOk = preview?.aligo_configured === true
  const sendable = preview?.sendable_count ?? 0
  const canSend = aligoOk && sendable > 0 && !busyMode

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
          ...GLASS.L4, width: 620, maxWidth: '94vw', maxHeight: '90vh',
          borderRadius: 16, padding: 22, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
              📤 문자 배포
            </div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
              {preview ? `${preview.year}년 ${preview.month}월 근무표를 직원에게 SMS 로 발송합니다.` : '근무표 SMS 배포'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: COLORS.textMuted, cursor: 'pointer', fontSize: 18, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* 로딩 */}
        {loading && (
          <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>
            수신자 미리보기 불러오는 중...
          </div>
        )}

        {/* preview 오류 */}
        {previewError && (
          <div style={{
            ...GLASS.L3, background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            borderRadius: 8, padding: '10px 14px', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.danger }}>❌ {previewError}</div>
            <button type="button" onClick={loadPreview} style={{
              ...BTN.sm, background: 'transparent', color: COLORS.danger,
              border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer',
            }}>다시 시도</button>
          </div>
        )}

        {preview && (
          <>
            {/* 요약 */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={pillStyle('info')}>총 {preview.total}명</span>
              <span style={pillStyle('success')}>발송가능 {preview.sendable_count}명</span>
              <span style={pillStyle(preview.invalid_count > 0 ? 'danger' : 'neutral')}>
                전화번호 오류 {preview.invalid_count}명
              </span>
            </div>

            {/* 알리고 미설정 안내 */}
            {!aligoOk && (
              <div style={{
                ...GLASS.L3, background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
                borderRadius: 8, padding: '10px 14px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.danger }}>
                  ⚠ 알리고 환경변수 미설정
                </div>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
                  Cloud Run 에 <strong>ALIGO_API_KEY · ALIGO_USER_ID · ALIGO_SENDER</strong> 를 설정해야
                  발송할 수 있습니다. 설정 전에는 미리보기만 가능합니다.
                </div>
              </div>
            )}

            {/* 발송 한도 초과 안내 */}
            {preview.sendable_count > preview.max_recipients && (
              <div style={{
                ...GLASS.L3, background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
                borderRadius: 8, padding: '8px 12px', fontSize: 11,
                color: COLORS.warning, fontWeight: 700,
              }}>
                ⚠ 발송가능 인원이 1회 한도({preview.max_recipients}명)를 초과합니다.
              </div>
            )}

            {/* 수신자 표 */}
            <div style={{
              ...GLASS.L1, borderRadius: 10, padding: 4, maxHeight: 280, overflowY: 'auto',
            }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '1.3fr 1.4fr 0.7fr 0.6fr',
                gap: 0, padding: '6px 10px', fontSize: 10, fontWeight: 800,
                color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.borderFaint}`,
              }}>
                <span>이름</span>
                <span>전화번호</span>
                <span style={{ textAlign: 'right' }}>근무일</span>
                <span style={{ textAlign: 'right' }}>메시지</span>
              </div>
              {preview.recipients.map((r) => {
                const bad = !r.phone_valid
                const isOpen = expanded === r.worker_id
                return (
                  <div key={r.worker_id}>
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1.3fr 1.4fr 0.7fr 0.6fr',
                      gap: 0, padding: '7px 10px', fontSize: 12, alignItems: 'center',
                      background: bad ? COLORS.bgRed : 'transparent',
                      borderBottom: `1px solid ${COLORS.borderFaint}`,
                    }}>
                      <span style={{
                        fontWeight: 700, color: bad ? COLORS.danger : COLORS.textPrimary,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {r.name}
                        {bad && <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6 }}>발송 제외</span>}
                      </span>
                      <span style={{
                        color: bad ? COLORS.danger : COLORS.textSecondary,
                        fontWeight: bad ? 700 : 500, whiteSpace: 'nowrap',
                      }}>
                        {r.phone || '—'}
                      </span>
                      <span style={{ textAlign: 'right', color: COLORS.textSecondary }}>
                        {r.work_days}일
                      </span>
                      <span style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : r.worker_id)}
                          style={{
                            ...BTN.sm, background: 'transparent', color: COLORS.info,
                            border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                            padding: '2px 8px', fontSize: 10,
                          }}
                        >{isOpen ? '접기' : '보기'}</button>
                      </span>
                    </div>
                    {isOpen && (
                      <div style={{
                        padding: '8px 12px', fontSize: 11, lineHeight: 1.6,
                        color: COLORS.textSecondary, whiteSpace: 'pre-wrap',
                        background: COLORS.bgGray, borderBottom: `1px solid ${COLORS.borderFaint}`,
                      }}>
                        {r.message}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 발송 결과 패널 (규칙 20 — alert 금지) */}
            {sendResult && (
              <div style={{
                ...GLASS.L3,
                background: sendResult.ok ? COLORS.bgGreen : COLORS.bgRed,
                border: `1px solid ${sendResult.ok ? COLORS.borderGreen : COLORS.borderRed}`,
                borderRadius: 10, padding: '12px 14px',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
                  <div style={{
                    fontSize: 14, fontWeight: 800,
                    color: sendResult.ok ? COLORS.success : COLORS.danger,
                  }}>
                    {sendResult.testmode
                      ? (sendResult.ok ? '🧪 테스트 통과' : '🧪 테스트 실패')
                      : (sendResult.ok ? '✅ 발송 완료' : '❌ 발송 실패')}
                  </div>
                  <button type="button" onClick={() => setSendResult(null)} style={{
                    background: 'transparent', border: 'none',
                    color: COLORS.textMuted, cursor: 'pointer', fontSize: 14,
                  }}>×</button>
                </div>
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 6, lineHeight: 1.6 }}>
                  {sendResult.testmode
                    ? `테스트 검증 완료 — 실제 발송 시 ${sendResult.sent_count}명에게 전송됩니다.`
                    : `발송 완료 ${sendResult.success_cnt}건 / 실패 ${sendResult.error_cnt}건`}
                  {sendResult.invalid_count > 0 && (
                    <span> · 전화번호 오류 {sendResult.invalid_count}명 제외</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>
                  result_code {sendResult.result_code} · {sendResult.message}
                </div>
              </div>
            )}

            {/* 발송 오류 */}
            {sendError && (
              <div style={{
                ...GLASS.L3, background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
                borderRadius: 8, padding: '10px 14px', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.danger }}>❌ {sendError}</div>
                <button type="button" onClick={() => setSendError(null)} style={{
                  background: 'transparent', border: 'none',
                  color: COLORS.textMuted, cursor: 'pointer', fontSize: 14,
                }}>×</button>
              </div>
            )}

            {/* 실제 발송 인라인 확인 패널 (confirm() 대체 — 규칙 20) */}
            {confirmSend && (
              <div style={{
                ...GLASS.L3, background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
                borderRadius: 10, padding: '12px 14px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.warning }}>
                  ⚠ {sendable}명에게 실제 발송 — 과금됩니다
                </div>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
                  실제 SMS 가 발송되며 건당 요금이 청구됩니다. 계속하려면 아래 「확인 — 실제 발송」 을 누르세요.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => dispatch('send')}
                    disabled={busyMode !== null}
                    style={{
                      ...BTN.md, background: COLORS.danger, color: '#fff', border: 'none',
                      cursor: busyMode ? 'not-allowed' : 'pointer', opacity: busyMode ? 0.6 : 1,
                    }}
                  >
                    {busyMode === 'send' ? '발송 중...' : `확인 — ${sendable}명 실제 발송`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmSend(false)}
                    disabled={busyMode !== null}
                    style={{
                      ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                      border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                    }}
                  >취소</button>
                </div>
              </div>
            )}

            {/* 액션 버튼 */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2,
              flexWrap: 'wrap',
            }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                  border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                }}
              >닫기</button>
              <button
                type="button"
                onClick={() => dispatch('test')}
                disabled={!canSend}
                style={{
                  ...BTN.lg, background: COLORS.bgBlue, color: COLORS.primary,
                  border: `1px solid ${COLORS.borderBlue}`,
                  cursor: canSend ? 'pointer' : 'not-allowed', opacity: canSend ? 1 : 0.5,
                }}
                title={!aligoOk ? '알리고 환경변수 미설정' : sendable === 0 ? '발송 가능한 전화번호 없음' : '무과금 검증'}
              >
                {busyMode === 'test' ? '검증 중...' : '🧪 테스트 발송'}
              </button>
              <button
                type="button"
                onClick={() => { setConfirmSend(true); setSendResult(null); setSendError(null) }}
                disabled={!canSend || confirmSend}
                style={{
                  ...BTN.lg, background: COLORS.primary, color: '#fff', border: 'none',
                  cursor: (canSend && !confirmSend) ? 'pointer' : 'not-allowed',
                  opacity: (canSend && !confirmSend) ? 1 : 0.5,
                }}
                title={!aligoOk ? '알리고 환경변수 미설정' : sendable === 0 ? '발송 가능한 전화번호 없음' : '실제 발송 (과금)'}
              >
                📤 실제 발송
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
