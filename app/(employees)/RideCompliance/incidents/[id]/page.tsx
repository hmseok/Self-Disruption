'use client'

/**
 * /RideCompliance/incidents/[id] — 침해사고 상세 (deep-link)
 *
 * Phase 1.1 — read-only 상세 + 24h SLA 시계 + 매뉴얼 조항 안내.
 * Phase 1.2+ 예정: status 전환 액션 (triaging→containing→notifying→resolved),
 *                 CPO 결재, 통지 발송 기록 (서식 F-M01-04 등).
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getStoredToken } from '@/lib/auth-client'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

interface Incident {
  id: string
  incident_code: string
  title: string
  incident_type: string
  severity: string
  occurred_at: string | null
  detected_at: string
  notified_at: string | null
  resolved_at: string | null
  reporter_user_id: string | null
  reporter_user_name: string | null
  assignee_user_id: string | null
  assignee_user_name: string | null
  affected_pii_items: string | null
  affected_subjects_count: number | null
  cause_summary: string | null
  containment_actions: string | null
  notification_method: string | null
  response_details: string | null
  related_asset_id: string | null
  related_asset_code: string | null
  related_asset_name: string | null
  status: string
  cpo_reviewed_at: string | null
  cpo_review_note: string | null
  retention_until: string | null
  created_at: string
  updated_at: string
}

function slaRemainHours(detectedAt: string, notifiedAt: string | null): number | null {
  if (notifiedAt) return null
  const detected = new Date(detectedAt).getTime()
  if (isNaN(detected)) return null
  const elapsed = (Date.now() - detected) / (60 * 60 * 1000)
  return 24 - elapsed
}

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [incident, setIncident] = useState<Incident | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const token = getStoredToken()
    fetch(`/api/ride-compliance/incidents`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        const list: Incident[] = json.data || []
        const found = list.find(i => i.id === id)
        if (!found) setError(`사고를 찾을 수 없습니다 (id=${id})`)
        setIncident(found || null)
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ padding: 40 }}>로딩 중…</div>
  if (error) return (
    <div style={{ padding: 40, maxWidth: 720 }}>
      <div style={{ ...GLASS.L3, padding: 24, borderRadius: 12, borderLeft: `4px solid ${COLORS.danger}` }}>
        <h2 style={{ margin: 0, color: COLORS.danger }}>❌ {error}</h2>
        <Link href="/RideCompliance" style={{ color: COLORS.primary, marginTop: 12, display: 'inline-block' }}>← 사고 목록으로</Link>
      </div>
    </div>
  )
  if (!incident) return null

  const slaH = slaRemainHours(incident.detected_at, incident.notified_at)

  return (
    <div style={{ padding: '24px 32px'}}>
      <Link href="/RideCompliance" style={{ color: COLORS.primary, fontSize: 13, marginBottom: 8, display: 'inline-block' }}>← 사고 목록</Link>
      <h1 style={{ margin: '4px 0 8px', fontSize: 20 }}>🚨 {incident.incident_code}</h1>
      <p style={{ margin: '0 0 16px', fontSize: 16, color: COLORS.textPrimary }}>{incident.title}</p>

      {/* 24h SLA 시계 — 제25조 ① */}
      {!incident.notified_at && incident.status !== 'resolved' && incident.status !== 'closed' && slaH !== null && (
        <div style={{
          ...GLASS.L3, padding: 16, borderRadius: 12, marginBottom: 16,
          borderLeft: `4px solid ${slaH < 6 ? COLORS.danger : slaH < 12 ? COLORS.warning : COLORS.info}`,
        }}>
          <strong style={{ fontSize: 14, color: slaH < 6 ? COLORS.danger : COLORS.textPrimary }}>
            ⏰ 정보주체 통지 24시간 SLA — {slaH < 0 ? '초과' : `${Math.floor(slaH)}시간 ${Math.floor((slaH % 1) * 60)}분 남음`}
          </strong>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: COLORS.textSecondary }}>
            매뉴얼 제25조 ①: 「개인정보보호책임자는 개인정보가 유출되었음을 알게 되었을 때에는 서면 등의 방법으로 24시간 이내에 해당 정보주체에게 다음 각 호의 사실을 알려야 한다」.
            단, 긴급조치(접속경로 차단·취약점 점검 등) 필요 시 그 조치를 한 후 지체 없이 알릴 수 있음.
          </p>
        </div>
      )}

      <div style={{ ...GLASS.L3, padding: 24, borderRadius: 12 }}>
        <Row label="사고번호" value={incident.incident_code} />
        <Row label="제목" value={incident.title} />
        <Row label="유형" value={incident.incident_type} />
        <Row label="심각도" value={incident.severity} />
        <Row label="상태" value={incident.status} />
        <Row label="발생 시점 (추정)" value={incident.occurred_at || '—'} />
        <Row label="감지·접수 시점" value={incident.detected_at} />
        <Row label="정보주체 통지 시점" value={incident.notified_at || '미통지'} />
        <Row label="종결 시점" value={incident.resolved_at || '—'} />
        <Row label="신고자" value={incident.reporter_user_name || '—'} />
        <Row label="담당자" value={incident.assignee_user_name || '(미배정)'} />
        <Row label="유출 개인정보 항목 (제25조 ①-1)" value={incident.affected_pii_items || '—'} />
        <Row label="영향 정보주체 수" value={incident.affected_subjects_count ?? '—'} />
        <Row label="시점·경위 (제25조 ①-2)" value={incident.cause_summary || '—'} />
        <Row label="긴급조치 (제25조 ① 단서)" value={incident.containment_actions || '—'} />
        <Row label="통지 방법" value={incident.notification_method || '—'} />
        <Row label="대응조치 (제25조 ①-4)" value={incident.response_details || '—'} />
        <Row label="관련 자산" value={incident.related_asset_code ? `${incident.related_asset_code} · ${incident.related_asset_name}` : '—'} />
        <Row label="CPO 검토" value={incident.cpo_reviewed_at || '미검토'} />
        <Row label="CPO 코멘트" value={incident.cpo_review_note || '—'} />
        <Row label="보존만료 (3년)" value={incident.retention_until || '—'} />
      </div>

      <div style={{ ...GLASS.L3, padding: 20, borderRadius: 12, marginTop: 16, borderLeft: `4px solid ${COLORS.info}` }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>📜 매뉴얼 조항 참조 (통합본 5.17)</h3>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8, color: COLORS.textSecondary }}>
          <li><strong>제25조 (유출통지)</strong> — 24h 의무, 5개 항목 통지 (항목·시점·피해최소화 방법·대응조치·신고연락처)</li>
          <li><strong>제26조 (침해대응 조직)</strong> — 관리팀 일선. 4가지 유형 명시</li>
          <li><strong>제27조 (침해대응 절차)</strong> — CPO 임성민·관리자 석호민 정기 보고</li>
          <li><strong>부속 매뉴얼</strong> — 「개인정보 유출 대응 매뉴얼」 + 서식 F-M01-01~06 (정보주체 통지서, 결과보고서 등)</li>
        </ul>
        <p style={{ marginTop: 12, marginBottom: 0, fontSize: 11, color: COLORS.textMuted }}>
          Phase 1.2 예정: status 전환 액션 (triaging→containing→notifying→resolved) · CPO 결재 · 서식 자동 발급.
        </p>
      </div>
    </div>
  )
}

function Row(props: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, padding: '10px 0', borderBottom: `1px solid ${COLORS.borderFaint}`, fontSize: 13 }}>
      <span style={{ color: COLORS.textSecondary, fontWeight: 600 }}>{props.label}</span>
      <span style={{ color: COLORS.textPrimary }}>{props.value}</span>
    </div>
  )
}
