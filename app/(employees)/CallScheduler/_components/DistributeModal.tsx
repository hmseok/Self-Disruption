'use client'
// ═══════════════════════════════════════════════════════════════════
// DistributeModal — 다중 채널 근무표 배포 모달 (PR-2RR-h)
//
// 채널: 📱 문자(SMS·알리고) / 📧 메일(Resend) / 🔗 링크 복사
// 액션: 워커별 단일 발송 + 전체 발송 + 테스트(dry-run)
//
// POST /api/call-scheduler/schedules/{id}/distribute
//   · body.channel : 'sms' | 'email' | 'link'
//   · body.mode    : 'preview' | 'test' | 'send'
//   · body.worker_ids: string[] (옵션 — 단일 / 부분 발송)
//
// CLAUDE.md 규칙 20 — alert()/confirm() 금지, 결과는 글래스 패널
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

type Channel = 'sms' | 'email' | 'link'

interface Recipient {
  worker_id: string
  name: string
  phone: string
  phone_valid: boolean
  email: string | null
  email_valid: boolean
  work_days: number
  first_day: string | null
  token: string
  link: string
  message: string
  email_subject: string
  email_html: string
}

interface PreviewData {
  mode: string
  year: number
  month: number
  channel: Channel
  channel_configured: { sms: boolean; email: boolean; link: boolean }
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
  channel: Channel
  ok: boolean
  testmode: boolean
  result_code: number
  message: string
  success_cnt: number
  error_cnt: number
  sent_count: number
  invalid_count: number
  errors?: string[]
  links?: { worker_id: string; name: string; link: string }[]
}

interface Props {
  open: boolean
  onClose: () => void
  scheduleId: string
}

const CHANNEL_INFO: Record<Channel, { label: string; icon: string; sub: string }> = {
  sms:   { label: '문자',     icon: '📱', sub: '알리고 SMS' },
  email: { label: '메일',     icon: '📧', sub: 'Resend HTML' },
  link:  { label: '링크 복사', icon: '🔗', sub: '클립보드' },
}

export default function DistributeModal({ open, onClose, scheduleId }: Props) {
  const [channel, setChannel] = useState<Channel>('sms')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)  // 'all-test' | 'all-send' | worker_id
  const [result, setResult] = useState<SendData | null>(null)
  const [resultError, setResultError] = useState<string | null>(null)
  const [confirmAllSend, setConfirmAllSend] = useState(false)
  const [copyToast, setCopyToast] = useState<string | null>(null)

  // 채널 별 미리보기 호출
  const loadPreview = useCallback(async (ch: Channel) => {
    setLoading(true)
    setPreview(null)
    setPreviewError(null)
    setResult(null)
    setResultError(null)
    setConfirmAllSend(false)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/schedules/${scheduleId}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ mode: 'preview', channel: ch }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '미리보기 조회 실패')
      const data = json.data as PreviewData
      setPreview(data)
      // 발송 가능한 것 기본 체크
      setSelectedIds(new Set(
        data.recipients.filter(r =>
          ch === 'sms'   ? r.phone_valid
        : ch === 'email' ? r.email_valid
        : true
        ).map(r => r.worker_id)
      ))
    } catch (e: any) {
      setPreviewError(e?.message || '오류')
    } finally {
      setLoading(false)
    }
  }, [scheduleId])

  // open / channel 변경 시 preview 재호출
  useEffect(() => {
    if (open) loadPreview(channel)
  }, [open, channel, loadPreview])

  // ESC 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // 토스트 자동 사라짐
  useEffect(() => {
    if (!copyToast) return
    const t = setTimeout(() => setCopyToast(null), 2400)
    return () => clearTimeout(t)
  }, [copyToast])

  // 발송 가능 워커 (선택된 채널 기준)
  const sendableSet = useMemo(() => {
    if (!preview) return new Set<string>()
    return new Set(preview.recipients.filter(r =>
      channel === 'sms'   ? r.phone_valid
    : channel === 'email' ? r.email_valid
    : true
    ).map(r => r.worker_id))
  }, [preview, channel])

  const channelOk = preview?.channel_configured?.[channel] ?? false
  const validSelected = Array.from(selectedIds).filter(id => sendableSet.has(id))

  if (!open) return null

  // ── 발송 (단일 또는 전체) ──
  const dispatch = async (
    busyKey: string,
    body: { mode: 'test' | 'send'; channel: Channel; worker_ids?: string[] },
  ) => {
    setBusy(busyKey)
    setResult(null)
    setResultError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/schedules/${scheduleId}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '발송 실패')
      setResult(json.data as SendData)
      setConfirmAllSend(false)
      // 링크 채널 + send → 클립보드 복사
      if (body.channel === 'link' && json.data?.links) {
        const text = (json.data.links as { name: string; link: string }[])
          .map(l => `${l.name}: ${l.link}`).join('\n')
        await navigator.clipboard?.writeText(text).catch(() => {})
        setCopyToast(`${json.data.links.length}명 링크 클립보드에 복사됨`)
      }
    } catch (e: any) {
      setResultError(e?.message || '오류')
    } finally {
      setBusy(null)
    }
  }

  // 워커별 단일 링크 복사 (서버 호출 없이 즉시)
  const copyOneLink = async (r: Recipient) => {
    try {
      await navigator.clipboard?.writeText(`${r.name}: ${r.link}`)
      setCopyToast(`${r.name} 링크 복사됨`)
    } catch {
      setCopyToast('클립보드 복사 실패')
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    if (!preview) return
    if (selectedIds.size === preview.recipients.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(preview.recipients.map(r => r.worker_id)))
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...GLASS.L4, width: 760, maxWidth: '94vw', maxHeight: '90vh',
        borderRadius: 16, padding: 18, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>
              📤 근무표 배포
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>
              {preview ? `${preview.year}년 ${preview.month}월` : ''} ·
              채널 선택 → 워커 옆 단일 버튼 또는 전체 발송
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            background: 'transparent', border: 'none',
            color: COLORS.textMuted, cursor: 'pointer', fontSize: 18, lineHeight: 1,
          }}>×</button>
        </div>

        {/* 채널 선택 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {(['sms', 'email', 'link'] as Channel[]).map(ch => {
            const active = channel === ch
            const configured = preview?.channel_configured?.[ch] ?? true
            const info = CHANNEL_INFO[ch]
            return (
              <button key={ch} type="button" onClick={() => setChannel(ch)}
                      disabled={!configured}
                      style={{
                        padding: '8px 10px', borderRadius: 8, cursor: configured ? 'pointer' : 'not-allowed',
                        background: active ? COLORS.bgBlue : 'rgba(0,0,0,0.025)',
                        border: `1px solid ${active ? COLORS.borderBlue : COLORS.borderFaint}`,
                        color: active ? COLORS.info : COLORS.textPrimary,
                        opacity: configured ? 1 : 0.45,
                        textAlign: 'left', lineHeight: 1.2,
                      }}
                      title={configured ? `${info.label} 발송` : `${info.sub} 환경변수 미설정`}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{info.icon} {info.label}</div>
                <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 2 }}>
                  {info.sub} {!configured && '· ⚠ 미설정'}
                </div>
              </button>
            )
          })}
        </div>

        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
            수신자 미리보기 불러오는 중...
          </div>
        )}

        {previewError && (
          <div style={{
            ...GLASS.L3, background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            borderRadius: 8, padding: '8px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.danger }}>❌ {previewError}</div>
            <button type="button" onClick={() => loadPreview(channel)} style={{
              ...BTN.sm, background: 'transparent', color: COLORS.danger,
              border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer',
            }}>다시 시도</button>
          </div>
        )}

        {preview && (
          <>
            {/* 요약 */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={pillStyle('info')}>총 {preview.total}명</span>
              <span style={pillStyle('success')}>발송가능 {preview.sendable_count}명</span>
              {preview.invalid_count > 0 && (
                <span style={pillStyle('danger')}>
                  {channel === 'sms' ? '번호' : channel === 'email' ? '메일' : ''} 오류 {preview.invalid_count}명
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button type="button" onClick={toggleAll}
                      style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 6,
                        border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.6)', color: COLORS.textSecondary,
                      }}>
                {selectedIds.size === preview.recipients.length ? '전체 해제' : '전체 선택'}
              </button>
              <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                선택 {validSelected.length}/{preview.total}
              </span>
            </div>

            {/* 채널 미설정 안내 */}
            {!channelOk && (
              <div style={{
                ...GLASS.L3, background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
                borderRadius: 8, padding: '8px 12px', fontSize: 11, color: COLORS.warning,
                lineHeight: 1.5,
              }}>
                ⚠ {channel === 'sms'
                  ? '알리고 환경변수(ALIGO_API_KEY / ALIGO_USER_ID / ALIGO_SENDER) 미설정'
                  : channel === 'email'
                  ? 'Resend 환경변수(RESEND_API_KEY) 미설정'
                  : '링크 채널은 항상 사용 가능'}
              </div>
            )}

            {/* 워커 list */}
            <div style={{
              ...GLASS.L1, borderRadius: 8, border: `1px solid ${COLORS.borderFaint}`,
              maxHeight: 320, overflowY: 'auto',
            }}>
              {preview.recipients.map(r => {
                const can = channel === 'sms' ? r.phone_valid
                          : channel === 'email' ? r.email_valid
                          : true
                const checked = selectedIds.has(r.worker_id)
                const isBusy = busy === r.worker_id
                const contact = channel === 'sms' ? (r.phone || '—')
                              : channel === 'email' ? (r.email || '—')
                              : (r.link || '—')
                return (
                  <div key={r.worker_id} style={{
                    display: 'grid',
                    gridTemplateColumns: '24px 1fr auto auto',
                    gap: 8, alignItems: 'center',
                    padding: '6px 10px',
                    borderBottom: `1px solid ${COLORS.borderFaint}`,
                    background: can ? 'transparent' : 'rgba(239,68,68,0.04)',
                    opacity: can ? 1 : 0.7,
                  }}>
                    <input type="checkbox" checked={checked}
                           onChange={() => toggleSelect(r.worker_id)}
                           disabled={!can}
                           style={{ width: 14, height: 14, cursor: can ? 'pointer' : 'not-allowed' }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {r.name}
                        <span style={{ fontSize: 10, fontWeight: 500, color: COLORS.textMuted }}>
                          {r.work_days}일{r.first_day ? ` · 첫 ${r.first_day}` : ''}
                        </span>
                      </div>
                      <div style={{
                        fontSize: 10, color: can ? COLORS.textMuted : COLORS.danger,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontFamily: channel === 'link' ? 'monospace' : 'inherit',
                      }} title={contact}>
                        {can ? contact : `${contact || '값 없음'} ⚠`}
                      </div>
                    </div>
                    {/* 단일 발송 액션 */}
                    {channel === 'link' ? (
                      <button type="button" onClick={() => copyOneLink(r)}
                              disabled={isBusy}
                              style={singleBtnStyle(true)}
                              title="이 사람 링크 클립보드 복사">
                        🔗 복사
                      </button>
                    ) : (
                      <button type="button"
                              onClick={() => dispatch(r.worker_id, {
                                mode: 'send', channel, worker_ids: [r.worker_id],
                              })}
                              disabled={!can || !channelOk || !!busy}
                              style={singleBtnStyle(can && channelOk && !busy)}
                              title={can ? `${r.name} 에게 ${CHANNEL_INFO[channel].label} 단일 발송`
                                : '발송 불가'}>
                        {isBusy ? '…' : `${CHANNEL_INFO[channel].icon} 발송`}
                      </button>
                    )}
                    {/* 미리보기 (메시지 펼침) */}
                    <details style={{ position: 'relative' }}>
                      <summary style={{
                        cursor: 'pointer', fontSize: 10, color: COLORS.textMuted,
                        padding: '3px 6px', borderRadius: 4,
                        border: `1px solid ${COLORS.borderFaint}`,
                        listStyle: 'none',
                      }}>👁</summary>
                      <div style={{
                        position: 'absolute', right: 0, top: '100%', marginTop: 4,
                        background: '#fff', border: `1px solid ${COLORS.borderSubtle}`,
                        borderRadius: 8, padding: 10, fontSize: 11, lineHeight: 1.5,
                        whiteSpace: 'pre-wrap', width: 320, zIndex: 10,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                        color: COLORS.textPrimary,
                      }}>
                        {channel === 'email' ? (
                          <>
                            <strong>{r.email_subject}</strong>
                            <div style={{ marginTop: 6, fontSize: 10, color: COLORS.textMuted }}>
                              {r.email ? `→ ${r.email}` : '메일 주소 없음'}
                              <br/>HTML 메일 본문 (Resend)
                            </div>
                          </>
                        ) : channel === 'link' ? (
                          <code>{r.link}</code>
                        ) : (
                          r.message
                        )}
                      </div>
                    </details>
                  </div>
                )
              })}
              {preview.recipients.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
                  배정된 직원이 없습니다.
                </div>
              )}
            </div>

            {/* 결과 패널 */}
            {result && (
              <div style={{
                ...GLASS.L3,
                background: result.ok ? COLORS.bgGreen : COLORS.bgRed,
                border: `1px solid ${result.ok ? COLORS.borderGreen : COLORS.borderRed}`,
                borderRadius: 8, padding: '8px 12px',
              }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: result.ok ? COLORS.success : COLORS.danger }}>
                  {result.ok ? '✅' : '❌'} {result.message || (result.ok ? '발송 완료' : '발송 실패')}
                  {result.testmode && ' (TEST mode)'}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 4 }}>
                  성공 {result.success_cnt} · 실패 {result.error_cnt} · 발송시도 {result.sent_count}
                </div>
                {result.errors && result.errors.length > 0 && (
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 11, color: COLORS.danger }}>
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            )}
            {resultError && (
              <div style={{
                ...GLASS.L3, background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
                borderRadius: 8, padding: '8px 12px', fontSize: 12,
                color: COLORS.danger, fontWeight: 700,
              }}>❌ {resultError}</div>
            )}
            {copyToast && (
              <div style={{
                ...GLASS.L3, background: COLORS.bgBlue, border: `1px solid ${COLORS.borderBlue}`,
                borderRadius: 8, padding: '6px 12px', fontSize: 11,
                color: COLORS.info, fontWeight: 700,
              }}>📋 {copyToast}</div>
            )}

            {/* 액션 footer */}
            <div style={{
              display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
              paddingTop: 8, borderTop: `1px solid ${COLORS.borderFaint}`,
            }}>
              {channel !== 'link' && (
                <button type="button"
                        disabled={!channelOk || validSelected.length === 0 || !!busy}
                        onClick={() => dispatch('all-test', {
                          mode: 'test', channel, worker_ids: validSelected,
                        })}
                        style={actionBtnStyle('amber', channelOk && validSelected.length > 0 && !busy)}>
                  {busy === 'all-test' ? '테스트 중...' : '🔬 테스트 발송 (dry-run)'}
                </button>
              )}
              <div style={{ flex: 1 }} />
              {!confirmAllSend ? (
                <button type="button"
                        disabled={(!channelOk && channel !== 'link') || validSelected.length === 0 || !!busy}
                        onClick={() => {
                          if (channel === 'link') {
                            dispatch('all-send', { mode: 'send', channel, worker_ids: validSelected })
                          } else {
                            setConfirmAllSend(true)
                          }
                        }}
                        style={actionBtnStyle('blue', ((channelOk || channel === 'link') && validSelected.length > 0) && !busy)}>
                  {channel === 'link'
                    ? `🔗 선택 ${validSelected.length}명 링크 복사`
                    : `📤 선택 ${validSelected.length}명 ${CHANNEL_INFO[channel].label} 발송`}
                </button>
              ) : (
                <>
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.danger }}>
                    실제 발송 — 확인하세요
                  </span>
                  <button type="button" onClick={() => setConfirmAllSend(false)}
                          style={actionBtnStyle('gray', true)}>취소</button>
                  <button type="button"
                          onClick={() => dispatch('all-send', {
                            mode: 'send', channel, worker_ids: validSelected,
                          })}
                          style={actionBtnStyle('red', true)}
                          disabled={!!busy}>
                    {busy === 'all-send' ? '발송 중...' : '✅ 확인 — 실발송'}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── 스타일 헬퍼 ────────────────────────────────────────────────
function singleBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 700,
    padding: '4px 8px', borderRadius: 5,
    background: enabled ? COLORS.bgBlue : 'rgba(0,0,0,0.04)',
    color: enabled ? COLORS.info : COLORS.textMuted,
    border: `1px solid ${enabled ? COLORS.borderBlue : COLORS.borderFaint}`,
    cursor: enabled ? 'pointer' : 'not-allowed',
    whiteSpace: 'nowrap',
  }
}
function actionBtnStyle(
  tone: 'blue' | 'amber' | 'red' | 'gray',
  enabled: boolean,
): React.CSSProperties {
  const palette = tone === 'blue'  ? { bg: COLORS.primary, fg: '#fff', bd: COLORS.primary }
                : tone === 'amber' ? { bg: COLORS.bgAmber, fg: COLORS.warning, bd: COLORS.borderAmber }
                : tone === 'red'   ? { bg: COLORS.danger,  fg: '#fff', bd: COLORS.danger }
                : { bg: 'transparent', fg: COLORS.textSecondary, bd: COLORS.borderFaint }
  return {
    ...BTN.md,
    background: enabled ? palette.bg : 'rgba(0,0,0,0.04)',
    color: enabled ? palette.fg : COLORS.textMuted,
    border: `1px solid ${enabled ? palette.bd : COLORS.borderFaint}`,
    cursor: enabled ? 'pointer' : 'not-allowed',
  }
}
