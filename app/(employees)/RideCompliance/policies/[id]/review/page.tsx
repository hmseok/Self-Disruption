'use client'

/**
 * /RideCompliance/policies/[id]/review
 *
 * 내규 1건 검수 — 5 탭 (조항 / 별첨 / Playbook / 연간 운영 / 필요 화면).
 *
 * P17-A (2026-05-28) — 사용자 통찰:
 *   「모달로 보기엔 검수가 어려움. 폰트도 작고. 페이지로 분리.」
 *   → 기존 ReviewModal → 전용 페이지. 페이지 단위 넓은 공간 + 큰 폰트.
 *
 * 5 탭은 sub-탭 (모듈 main 의 TabKey 와 무관).
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getStoredToken } from '@/lib/auth-client'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

// ── 도메인 ────────────────────────────────────────────────────────
interface Policy {
  id: string
  policy_code: string
  title: string
  version: string
  effective_date: string | null
  status: string
  ai_extracted_at: string | null
  ai_confidence: number | null
  ai_summary_md: string | null
}

interface Section {
  id: string
  section_kind: 'article' | 'attachment' | 'playbook_step' | 'annual_event' | 'screen_spec'
  section_code: string | null
  title: string
  body_md: string | null
  ai_confidence: number | null
  ai_raw_excerpt: string | null
  user_status: 'ai_draft' | 'user_edited' | 'user_confirmed' | 'rejected'
  user_edited_title: string | null
  user_edited_body_md: string | null
  sort_order: number
}

// P19-C — 버전 chain (version-info API 응답)
interface VersionChainEntry {
  id: string
  policy_code: string
  title: string
  version: string
  effective_date: string | null
  status: string
  superseded_by_id: string | null
  change_reason: string | null
  change_category: string | null
  announced_at: string | null
}

const KIND_LABEL: Record<string, string> = {
  article:       '📜 조항',
  attachment:    '📎 별첨',
  playbook_step: '🪜 Playbook 단계',
  annual_event:  '📅 연간 운영',
  screen_spec:   '🖥 필요 화면',
}

// P19-C — 6번째 sub-탭: 버전 히스토리
const HISTORY_KIND = '__history__'
type TabKindOrHistory = Section['section_kind'] | typeof HISTORY_KIND

const SECTION_STATUS_LABEL: Record<string, string> = {
  ai_draft:       'AI 초안',
  user_edited:    '편집됨',
  user_confirmed: '확정',
  rejected:       '반려',
}
const SECTION_STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  ai_draft:       { bg: 'rgba(148,163,184,0.12)', fg: '#64748b' },
  user_edited:    { bg: 'rgba(245,158,11,0.12)',  fg: '#b45309' },
  user_confirmed: { bg: 'rgba(16,185,129,0.12)',  fg: '#047857' },
  rejected:       { bg: 'rgba(239,68,68,0.12)',   fg: '#b91c1c' },
}

// ── 버튼 ──────────────────────────────────────────────────────────
const btnPrimary: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer' }
const btnSecondary: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgGray, color: COLORS.textSecondary, cursor: 'pointer' }
const btnDanger: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgRed, color: COLORS.danger, cursor: 'pointer' }
const btnSuccess: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgGreen, color: COLORS.success, cursor: 'pointer' }

function confidenceBadge(c: number | null) {
  if (c == null) return <span style={{ fontSize: 12, color: COLORS.textMuted }}>—</span>
  const val = Number(c)
  const color = val >= 0.85 ? { bg: 'rgba(16,185,129,0.12)', fg: '#047857' }
              : val >= 0.5  ? { bg: 'rgba(245,158,11,0.12)', fg: '#b45309' }
                            : { bg: 'rgba(239,68,68,0.12)',  fg: '#b91c1c' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
      background: color.bg, color: color.fg, whiteSpace: 'nowrap',
    }}>{(val * 100).toFixed(0)}%</span>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════
export default function PolicyReviewPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const policyId = params.id

  const [policy, setPolicy] = useState<Policy | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(false)
  const [kind, setKind] = useState<TabKindOrHistory>('article')
  // P19-C — 버전 chain 로딩
  const [versionChain, setVersionChain] = useState<VersionChainEntry[]>([])
  const [versionLoading, setVersionLoading] = useState(false)

  const fetchVersionChain = async () => {
    setVersionLoading(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/policies/${policyId}/version-info`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const json = await res.json()
      if (json.success && json.data?.chain) setVersionChain(json.data.chain)
    } catch (e) {
      setResultPanel({ kind: 'err', msg: `버전 조회 실패: ${e}` })
    } finally {
      setVersionLoading(false)
    }
  }
  useEffect(() => {
    if (kind === HISTORY_KIND) fetchVersionChain()
  }, [kind, policyId])  // eslint-disable-line react-hooks/exhaustive-deps
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resultPanel, setResultPanel] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const token = getStoredToken()
      const auth = token ? { Authorization: `Bearer ${token}` } : undefined
      const [pRes, sRes] = await Promise.all([
        fetch(`/api/ride-compliance/policies/${policyId}`, { headers: auth }),
        fetch(`/api/ride-compliance/policies/${policyId}/sections`, { headers: auth }),
      ])
      const pJson = await pRes.json()
      const sJson = await sRes.json()
      if (pJson.success) setPolicy(pJson.data)
      if (sJson.success) setSections(sJson.data || [])
    } catch (e) {
      setResultPanel({ kind: 'err', msg: `조회 실패: ${e}` })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { fetchAll() }, [policyId])  // eslint-disable-line react-hooks/exhaustive-deps

  // P21 — 브라우저 탭 title 동적
  useEffect(() => {
    if (policy) {
      document.title = `검수 — ${policy.policy_code} | 정보보안`
    } else {
      document.title = '검수 | 정보보안'
    }
    return () => { document.title = 'ERP' }
  }, [policy])

  const sectionAction = async (s: Section, action: 'confirm' | 'reject' | 'reset') => {
    setBusyId(s.id)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/policies/${policyId}/sections`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ section_id: s.id, action }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setResultPanel({ kind: 'err', msg: `${action} 실패: ${json.error || res.status}` })
        return
      }
      await fetchAll()
    } catch (e) {
      setResultPanel({ kind: 'err', msg: `${action} 오류: ${e}` })
    } finally {
      setBusyId(null)
    }
  }

  const generateSchedule = async () => {
    if (!policy || policy.status !== 'active') {
      setResultPanel({ kind: 'err', msg: '확정 (active) 상태에서만 스케줄 자동 생성 가능' })
      return
    }
    setBusyId('__schedule__')
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/policies/${policyId}/generate-schedule`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setResultPanel({ kind: 'err', msg: `스케줄 생성 실패: ${json.error || res.status}` })
        return
      }
      const d = json.data
      setResultPanel({
        kind: 'ok',
        msg: `스케줄 자동 생성 완료 — annual_plan ${d.plan_code} (${d.plan_created ? '신규' : '기존'}) / tasks ${d.inserted_tasks}건 INSERT / 월 추정 실패 ${d.skipped_no_month} / 중복 ${d.skipped_duplicate}`,
      })
      fetchAll()
    } catch (e) {
      setResultPanel({ kind: 'err', msg: `스케줄 생성 오류: ${e}` })
    } finally {
      setBusyId(null)
    }
  }

  // P20 — 남은 ai_draft 일괄 확정
  const bulkConfirmDrafts = async () => {
    const drafts = sections.filter(s => s.user_status === 'ai_draft')
    if (drafts.length === 0) {
      setResultPanel({ kind: 'ok', msg: '확정할 미검수 섹션이 없습니다.' })
      return
    }
    if (!confirm(`남은 ${drafts.length}건을 모두 「확정」 처리할까요?\n\n검수 없이 자동 확정합니다. AI 추출 결과를 그대로 받아들이는 의미입니다.`)) return
    setBusyId('__bulk_confirm__')
    let ok = 0, err = 0
    try {
      const token = getStoredToken()
      for (const s of drafts) {
        try {
          const res = await fetch(`/api/ride-compliance/policies/${policyId}/sections`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ section_id: s.id, action: 'confirm' }),
          })
          if (res.ok) ok++; else err++
        } catch { err++ }
      }
      setResultPanel({ kind: err === 0 ? 'ok' : 'err', msg: `일괄 확정 — 성공 ${ok} / 실패 ${err}` })
      fetchAll()
    } finally {
      setBusyId(null)
    }
  }

  const finalizePolicy = async (force = false) => {
    const draftCount = sections.filter(s => s.user_status === 'ai_draft').length
    if (draftCount > 0 && !force) {
      const proceed = confirm(`검수 미완료 섹션 ${draftCount}건 — 그래도 「확정 (active)」 으로 전이할까요?\n\n미검수 섹션은 ai_draft 상태로 남으며, 추후 검수 가능합니다.`)
      if (!proceed) {
        setResultPanel({ kind: 'err', msg: `검수 미완료 ${draftCount}건 — 「✅ 남은 N건 일괄 확정」 또는 각 탭 직접 검수` })
        return
      }
    }
    setBusyId('__finalize__')
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/policies/${policyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status: 'active' }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setResultPanel({ kind: 'err', msg: `확정 실패: ${json.error || res.status}` })
        return
      }
      setResultPanel({ kind: 'ok', msg: '내규 확정 완료 (active) — 「📅 스케줄 자동 생성」 진행 가능' })
      fetchAll()
    } catch (e) {
      setResultPanel({ kind: 'err', msg: `확정 오류: ${e}` })
    } finally {
      setBusyId(null)
    }
  }

  const counts = useMemo(() => ({
    article:       sections.filter(s => s.section_kind === 'article').length,
    attachment:    sections.filter(s => s.section_kind === 'attachment').length,
    playbook_step: sections.filter(s => s.section_kind === 'playbook_step').length,
    annual_event:  sections.filter(s => s.section_kind === 'annual_event').length,
    screen_spec:   sections.filter(s => s.section_kind === 'screen_spec').length,
  }), [sections])

  const confirmedCounts = useMemo(() => ({
    article:       sections.filter(s => s.section_kind === 'article' && s.user_status === 'user_confirmed').length,
    attachment:    sections.filter(s => s.section_kind === 'attachment' && s.user_status === 'user_confirmed').length,
    playbook_step: sections.filter(s => s.section_kind === 'playbook_step' && s.user_status === 'user_confirmed').length,
    annual_event:  sections.filter(s => s.section_kind === 'annual_event' && s.user_status === 'user_confirmed').length,
    screen_spec:   sections.filter(s => s.section_kind === 'screen_spec' && s.user_status === 'user_confirmed').length,
  }), [sections])

  const filtered = kind === HISTORY_KIND ? [] : sections.filter(s => s.section_kind === kind)

  if (loading && !policy) {
    return <div style={{ padding: 32, textAlign: 'center', color: COLORS.textMuted }}>조회중…</div>
  }
  if (!policy) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ marginBottom: 12, color: COLORS.danger }}>내규 조회 실패</div>
        <Link href="/RideCompliance/policies" style={{ color: COLORS.primary }}>← 내규 마스터 목록</Link>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 24px 32px' }}>

      {/* 페이지 헤더 */}
      <div style={{
        ...GLASS.L3, padding: 20, borderRadius: 12, marginBottom: 16,
        borderLeft: `4px solid ${COLORS.primary}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link href="/RideCompliance/policies" style={{ fontSize: 12, color: COLORS.primary, textDecoration: 'none' }}>← 내규 마스터 목록</Link>
            <h2 style={{ margin: '6px 0 4px', fontSize: 18, color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              📋 검수 — {policy.policy_code} {policy.version}
            </h2>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {policy.title}
            </div>
            {policy.ai_summary_md && (
              <div style={{ marginTop: 8, padding: 10, ...GLASS.L2, borderRadius: 6, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>
                {policy.ai_summary_md}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>
              AI 신뢰도 {policy.ai_confidence != null ? `${(policy.ai_confidence * 100).toFixed(0)}%` : '—'}
            </span>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>
              상태: {policy.status}
            </span>
          </div>
        </div>
      </div>

      {/* 결과 패널 */}
      {resultPanel && (
        <div style={{
          ...GLASS.L3, padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          border: `1px solid ${resultPanel.kind === 'ok' ? 'rgba(16,185,129,0.30)' : 'rgba(239,68,68,0.30)'}`,
          background: resultPanel.kind === 'ok' ? 'rgba(220,252,231,0.40)' : 'rgba(254,226,226,0.40)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 13, color: resultPanel.kind === 'ok' ? '#047857' : '#b91c1c' }}>
            {resultPanel.kind === 'ok' ? '✅' : '⚠'} {resultPanel.msg}
          </span>
          <button style={{ ...btnSecondary, fontSize: 11, padding: '2px 8px' }} onClick={() => setResultPanel(null)}>× 닫기</button>
        </div>
      )}

      {/* 5 탭 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${COLORS.borderSubtle}`, flexWrap: 'wrap' }}>
        {(['article', 'attachment', 'playbook_step', 'annual_event', 'screen_spec', HISTORY_KIND] as const).map((k) => {
          if (k === HISTORY_KIND) {
            const active = kind === HISTORY_KIND
            return (
              <button key={k}
                onClick={() => setKind(HISTORY_KIND)}
                style={{
                  padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                  borderBottom: active ? `2px solid ${COLORS.primary}` : '2px solid transparent',
                  color: active ? COLORS.primary : COLORS.textSecondary,
                  fontWeight: active ? 600 : 400, fontSize: 14, whiteSpace: 'nowrap',
                }}>
                📜 버전 히스토리 <span style={{ fontSize: 12, color: COLORS.textMuted }}>({versionChain.length || '...'})</span>
              </button>
            )
          }
          // 기존 5 sub-탭 처리
          const c = counts[k]
          const cc = confirmedCounts[k]
          const allConfirmed = c > 0 && cc === c
          return (
            <button key={k}
              onClick={() => setKind(k)}
              style={{
                padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                borderBottom: kind === k ? `2px solid ${COLORS.primary}` : '2px solid transparent',
                color: kind === k ? COLORS.primary : COLORS.textSecondary,
                fontWeight: kind === k ? 600 : 400, fontSize: 14, whiteSpace: 'nowrap',
              }}
            >
              {KIND_LABEL[k]} <span style={{ fontSize: 12, color: COLORS.textMuted }}>({cc}/{c}{allConfirmed ? ' ✓' : ''})</span>
            </button>
          )
        })}
      </div>

      {/* P19-C — 버전 히스토리 탭 */}
      {kind === HISTORY_KIND && (
        <div style={{ marginBottom: 16 }}>
          {versionLoading && <div style={{ ...GLASS.L3, padding: 32, borderRadius: 12, textAlign: 'center', color: COLORS.textMuted }}>조회중…</div>}
          {!versionLoading && versionChain.length === 0 && (
            <div style={{ ...GLASS.L3, padding: 32, borderRadius: 12, textAlign: 'center', color: COLORS.textMuted }}>
              등록된 버전이 없습니다.
            </div>
          )}
          {!versionLoading && versionChain.length > 0 && (
            <div style={{ ...GLASS.L3, padding: 16, borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 12 }}>
                📜 {versionChain[0]?.policy_code} 버전 chain ({versionChain.length}건)
              </div>
              {versionChain.map((v, idx) => {
                const isCurrent = v.id === policyId
                return (
                  <div key={v.id} style={{
                    ...GLASS.L2, padding: 12, borderRadius: 8, marginBottom: 8,
                    border: isCurrent ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.borderSubtle}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                          {v.version}
                        </span>
                        {isCurrent && <span style={{ marginLeft: 8, padding: '1px 6px', background: COLORS.bgBlue, color: COLORS.primary, fontSize: 10, borderRadius: 4 }}>현재</span>}
                        <span style={{ marginLeft: 8, padding: '1px 6px', background: v.status === 'active' ? COLORS.bgGreen : COLORS.bgGray, color: v.status === 'active' ? COLORS.success : COLORS.textMuted, fontSize: 10, borderRadius: 4 }}>
                          {v.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
                        시행일: {v.effective_date || '—'}
                        {v.announced_at && ` · 공표: ${String(v.announced_at).slice(0, 10)}`}
                      </div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, color: COLORS.textPrimary }}>{v.title}</div>
                    {v.change_reason && (
                      <div style={{ marginTop: 6, padding: 8, background: 'rgba(0,0,0,0.03)', borderRadius: 6, fontSize: 12, color: COLORS.textSecondary }}>
                        <strong style={{ color: COLORS.textPrimary }}>변경 사유</strong>
                        {v.change_category && <span style={{ marginLeft: 6, fontSize: 10, color: COLORS.textMuted }}>[{v.change_category}]</span>}
                        <div style={{ marginTop: 4, lineHeight: 1.5 }}>{v.change_reason}</div>
                      </div>
                    )}
                    {idx < versionChain.length - 1 && !isCurrent && (
                      <a href={`/RideCompliance/policies/${policyId}/review?compare=${v.id}`}
                        style={{ display: 'inline-block', marginTop: 8, fontSize: 11, color: COLORS.primary, textDecoration: 'none' }}>
                        📊 현재 버전과 비교 →
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* sections list */}
      {kind !== HISTORY_KIND && filtered.length === 0 && (
        <div style={{ ...GLASS.L3, padding: 32, borderRadius: 12, textAlign: 'center', color: COLORS.textMuted, marginBottom: 16 }}>
          이 카테고리에 추출된 섹션이 없습니다.
        </div>
      )}

      {filtered.map((s) => {
        const sc = SECTION_STATUS_COLOR[s.user_status] || SECTION_STATUS_COLOR.ai_draft
        return (
          <div key={s.id} style={{
            ...GLASS.L3, padding: 16, borderRadius: 10, marginBottom: 10,
            opacity: s.user_status === 'rejected' ? 0.6 : 1,
            border: s.user_status === 'user_confirmed' ? '1px solid rgba(16,185,129,0.30)' : undefined,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                {s.section_code && (
                  <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>
                    {s.section_code}
                  </span>
                )}
                <span style={{ fontWeight: 600, fontSize: 15, color: COLORS.textPrimary, lineHeight: 1.4 }}>
                  {s.title}
                </span>
                {confidenceBadge(s.ai_confidence)}
                <span style={{
                  padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: sc.bg, color: sc.fg, whiteSpace: 'nowrap',
                }}>{SECTION_STATUS_LABEL[s.user_status]}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {s.user_status === 'ai_draft' && (
                  <>
                    <button style={{ ...btnSuccess, padding: '4px 12px', fontSize: 12 }}
                      onClick={() => sectionAction(s, 'confirm')} disabled={busyId === s.id}>✓ 확정</button>
                    <button style={{ ...btnDanger, padding: '4px 12px', fontSize: 12 }}
                      onClick={() => sectionAction(s, 'reject')} disabled={busyId === s.id}>✕ 반려</button>
                  </>
                )}
                {(s.user_status === 'user_confirmed' || s.user_status === 'rejected') && (
                  <button style={{ ...btnSecondary, padding: '4px 12px', fontSize: 12 }}
                    onClick={() => sectionAction(s, 'reset')} disabled={busyId === s.id}>↺ 다시</button>
                )}
              </div>
            </div>
            {s.body_md && (
              <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6, marginBottom: 6 }}>
                {s.body_md}
              </div>
            )}
            {s.ai_raw_excerpt && (
              <details style={{ fontSize: 12, color: COLORS.textMuted }}>
                <summary style={{ cursor: 'pointer' }}>📖 원본 인용 발췌 (검증용)</summary>
                <div style={{ marginTop: 6, padding: 10, background: 'rgba(0,0,0,0.03)', borderRadius: 6, lineHeight: 1.5 }}>
                  {s.ai_raw_excerpt}
                </div>
              </details>
            )}
          </div>
        )
      })}

      {/* 하단 액션 */}
      <div style={{
        ...GLASS.L4, padding: 16, borderRadius: 10, marginTop: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        position: 'sticky', bottom: 16,
      }}>
        <div style={{ fontSize: 13, color: COLORS.textSecondary }}>
          전체 {sections.length}건 / 확정 {sections.filter(s => s.user_status === 'user_confirmed').length} · 반려 {sections.filter(s => s.user_status === 'rejected').length} · 대기 {sections.filter(s => s.user_status === 'ai_draft').length}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btnSecondary} onClick={fetchAll}>🔄 새로고침</button>
          <button style={btnSecondary} onClick={() => router.push('/RideCompliance/policies')}>← 목록</button>
          {/* P20 — 남은 ai_draft 일괄 확정 */}
          {policy.status !== 'active' && sections.some(s => s.user_status === 'ai_draft') && (
            <button style={btnPrimary} onClick={bulkConfirmDrafts} disabled={busyId === '__bulk_confirm__'}>
              {busyId === '__bulk_confirm__' ? '⏳ 일괄 확정중…' : `✅ 남은 ${sections.filter(s => s.user_status === 'ai_draft').length}건 일괄 확정`}
            </button>
          )}
          {policy.status !== 'active' && (
            <button style={btnSuccess} onClick={() => finalizePolicy(false)} disabled={busyId === '__finalize__'}>
              {busyId === '__finalize__' ? '⏳ 확정중…' : '✅ 내규 확정 (active)'}
            </button>
          )}
          {policy.status === 'active' && (
            <button style={btnPrimary} onClick={generateSchedule} disabled={busyId === '__schedule__'}>
              {busyId === '__schedule__' ? '⏳ 생성중…' : '📅 스케줄 자동 생성'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
