'use client'

/**
 * /RideCompliance/deliverables — 산출물·외부 송부 관리
 *
 * Phase 1.5 (2026-05-28):
 *   임명장 / 단말기 반출대장 / 파기 확인서 / 유출 통지서 / 자체감사 결과서 등
 *   외부 기관·내부 부서 송부 추적.
 *
 * 디자인 규칙:
 *   - Rule 10 — PageTitle 자동, DcStatStrip + DcToolbar + NeuDataTable 의무
 *   - Rule 18 — 모든 컬럼 sortBy
 *   - Rule 19 — 줄바꿈 최소화
 *   - Rule 20 — 결과 / 에러는 글래스 패널 (alert 최소화)
 *   - Rule 23 — _migration_pending 배너 graceful fallback
 */

import { useEffect, useMemo, useState } from 'react'
import { getStoredToken } from '@/lib/auth-client'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

// ── 도메인 ────────────────────────────────────────────────────────
interface Deliverable {
  id: string
  deliverable_code: string
  category: string
  title: string
  source_document_id: string | null
  source_submission_id: string | null
  content_md: string | null
  gcs_object_path: string | null
  external_recipient: string | null
  recipient_email: string | null
  prepared_by: string | null
  prepared_by_name: string | null
  approved_by: string | null
  approved_by_name: string | null
  approved_at: string | null
  sent_at: string | null
  sent_method: string | null
  response_received_at: string | null
  response_note: string | null
  status: string
  retention_until: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

const CATEGORY_LABEL: Record<string, string> = {
  appointment:        '임명장',
  device_logbook:     '단말기 반출대장',
  destruction_cert:   '파기 확인서',
  breach_notice:      '유출 통지서',
  audit_report:       '자체감사 결과서',
  inspection_request: '점검 의뢰',
  training_record:    '교육 결과 송부',
  other:              '기타',
}

const STATUS_LABEL: Record<string, string> = {
  draft:     '작성중',
  approved:  '승인',
  sent:      '송부됨',
  responded: '응답 수신',
  closed:    '종결',
}

const STATUS_COLOR: Record<string, { bg: string; fg: string; bd: string }> = {
  draft:     { bg: 'rgba(148,163,184,0.12)', fg: '#64748b', bd: 'rgba(148,163,184,0.30)' },
  approved:  { bg: 'rgba(59,130,246,0.12)',  fg: '#2563eb', bd: 'rgba(59,130,246,0.30)' },
  sent:      { bg: 'rgba(245,158,11,0.12)',  fg: '#b45309', bd: 'rgba(245,158,11,0.30)' },
  responded: { bg: 'rgba(16,185,129,0.12)',  fg: '#047857', bd: 'rgba(16,185,129,0.30)' },
  closed:    { bg: 'rgba(99,102,241,0.10)',  fg: '#4338ca', bd: 'rgba(99,102,241,0.25)' },
}

const SENT_METHOD_LABEL: Record<string, string> = {
  email:     '이메일',
  post:      '우편',
  courier:   '택배',
  portal:    '포털',
  fax:       '팩스',
  in_person: '대면',
}

// ── 버튼 스타일 ───────────────────────────────────────────────────
const btnPrimary: React.CSSProperties = {
  ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`,
  background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`,
  background: COLORS.bgGray, color: COLORS.textSecondary, cursor: 'pointer',
}
const btnDanger: React.CSSProperties = {
  ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`,
  background: COLORS.bgRed, color: COLORS.danger, cursor: 'pointer',
}

// ── helpers ───────────────────────────────────────────────────────
function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDateTime(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return `${fmtDate(s)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════
export default function ComplianceDeliverablesPage() {
  const [rows, setRows] = useState<Deliverable[]>([])
  const [loading, setLoading] = useState(false)
  const [migrationPending, setMigrationPending] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<string | null>(null)

  // 필터
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')

  // 모달 — create / edit
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Deliverable | null>(null)

  // 결과 패널
  const [resultPanel, setResultPanel] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const fetchList = async () => {
    setLoading(true)
    try {
      const token = getStoredToken()
      const params = new URLSearchParams()
      if (category) params.set('category', category)
      if (status) params.set('status', status)
      if (q) params.set('q', q)
      const res = await fetch(`/api/ride-compliance/deliverables?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const json = await res.json()
      setMyRole(json.meta?.my_role || null)
      if (json.meta?._migration_pending) {
        setMigrationPending(json.meta.migration || json.meta._migration_pending)
        setRows([])
      } else {
        setMigrationPending(null)
        setRows(json.data || [])
      }
    } catch (e) {
      setResultPanel({ kind: 'err', msg: `목록 조회 실패: ${e}` })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchList() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── stats ──
  const stats: StatItem[] = useMemo(() => {
    const total = rows.length
    const draft = rows.filter(r => r.status === 'draft').length
    const approved = rows.filter(r => r.status === 'approved').length
    const sent = rows.filter(r => r.status === 'sent').length
    const responded = rows.filter(r => r.status === 'responded').length
    return [
      { label: '전체',      value: String(total),     tint: 'blue'   },
      { label: '작성중',    value: String(draft),     tint: 'slate'  },
      { label: '승인',      value: String(approved),  tint: 'blue'   },
      { label: '송부됨',    value: String(sent),      tint: 'amber'  },
      { label: '응답수신',  value: String(responded), tint: 'green'  },
    ]
  }, [rows])

  const isMgr = myRole === 'cpo' || myRole === 'manager'

  // ── columns ──
  const columns: TableColumn<Deliverable>[] = [
    {
      key: 'code', label: '코드', width: 140,
      sortBy: (r) => r.deliverable_code,
      render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{r.deliverable_code}</span>,
    },
    {
      key: 'category', label: '분류', width: 130,
      sortBy: (r) => r.category,
      render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{CATEGORY_LABEL[r.category] || r.category}</span>,
    },
    {
      key: 'title', label: '제목',
      sortBy: (r) => r.title,
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>,
    },
    {
      key: 'recipient', label: '수신처', width: 160,
      sortBy: (r) => r.external_recipient || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', color: r.external_recipient ? COLORS.textPrimary : COLORS.textMuted }}>{r.external_recipient || '—'}</span>,
    },
    {
      key: 'prepared', label: '작성자', width: 100,
      sortBy: (r) => r.prepared_by_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{r.prepared_by_name || '—'}</span>,
    },
    {
      key: 'approved', label: '승인자', width: 100,
      sortBy: (r) => r.approved_by_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', color: r.approved_by_name ? COLORS.textPrimary : COLORS.textMuted }}>{r.approved_by_name || '—'}</span>,
    },
    {
      key: 'sent_at', label: '송부일', width: 110,
      sortBy: (r) => r.sent_at ? new Date(r.sent_at).getTime() : 0,
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(r.sent_at)}</span>,
    },
    {
      key: 'method', label: '방법', width: 80,
      sortBy: (r) => r.sent_method || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{r.sent_method ? SENT_METHOD_LABEL[r.sent_method] || r.sent_method : '—'}</span>,
    },
    {
      key: 'status', label: '상태', width: 100,
      sortBy: (r) => {
        const order = { draft: 1, approved: 2, sent: 3, responded: 4, closed: 5 } as Record<string, number>
        return order[r.status] || 99
      },
      render: (r) => {
        const c = STATUS_COLOR[r.status] || STATUS_COLOR.draft
        return (
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 6,
            background: c.bg, color: c.fg, border: `1px solid ${c.bd}`,
            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
          }}>{STATUS_LABEL[r.status] || r.status}</span>
        )
      },
    },
    {
      key: 'action', label: '액션', width: 90,
      render: (r) => (
        <button
          style={{ ...btnSecondary, padding: '2px 8px', fontSize: 11 }}
          onClick={() => setEditing(r)}
        >{isMgr ? '편집' : '보기'}</button>
      ),
    },
  ]

  // ── 렌더 ──
  return (
    <div style={{ padding: '0 24px 32px' }}>

      {migrationPending && (
        <div style={{
          ...GLASS.L3, padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          border: '1px solid rgba(245,158,11,0.30)', background: 'rgba(254,243,199,0.40)',
        }}>
          <span style={{ fontWeight: 600, color: '#b45309' }}>⚠ 마이그레이션 미적용</span>
          <span style={{ marginLeft: 8, fontSize: 13, color: '#92400e' }}>{migrationPending}</span>
          <span style={{ marginLeft: 8, fontSize: 12, color: COLORS.textMuted }}>— 관리자가 SQL 적용 후 새로고침 필요</span>
        </div>
      )}

      {/* DcStatStrip */}
      <div style={{ marginBottom: 16 }}>
        <DcStatStrip
          stats={stats}
          actions={isMgr ? [
            { label: '+ 신규 산출물', onClick: () => setCreateOpen(true), variant: 'primary' },
          ] : []}
        />
      </div>

      {/* DcToolbar — 검색 + 필터 */}
      <div style={{
        ...GLASS.L4, padding: '12px 16px', borderRadius: 10, marginBottom: 16,
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <input
          type="text" placeholder="제목 / 코드 / 수신처 / 비고 검색…"
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') fetchList() }}
          style={{
            ...GLASS.L1, flex: 1, minWidth: 220, padding: '6px 10px', borderRadius: 8,
            border: `1px solid ${COLORS.borderSubtle}`, fontSize: 13,
          }}
        />
        <select value={category} onChange={(e) => { setCategory(e.target.value); setTimeout(fetchList, 0) }}
          style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`, fontSize: 13 }}>
          <option value="">전체 분류</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setTimeout(fetchList, 0) }}
          style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`, fontSize: 13 }}>
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button style={btnSecondary} onClick={fetchList} disabled={loading}>
          {loading ? '조회중…' : '🔍 조회'}
        </button>
      </div>

      {/* 결과 패널 (Rule 20) */}
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

      {/* NeuDataTable */}
      <NeuDataTable
        data={rows}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ key: 'sent_at', dir: 'desc' }}
        loading={loading}
        emptyMessage="산출물이 없습니다. 「+ 신규 산출물」 로 등록하세요."
      />

      {/* 모달 */}
      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={(d) => {
            setCreateOpen(false)
            setResultPanel({ kind: 'ok', msg: `${d.deliverable_code} 등록 완료` })
            fetchList()
          }}
          onError={(msg) => setResultPanel({ kind: 'err', msg })}
        />
      )}
      {editing && (
        <EditModal
          row={editing} isMgr={isMgr}
          onClose={() => setEditing(null)}
          onSaved={(d) => {
            setEditing(null)
            setResultPanel({ kind: 'ok', msg: `${d.deliverable_code} 갱신 완료` })
            fetchList()
          }}
          onDeleted={() => {
            setEditing(null)
            setResultPanel({ kind: 'ok', msg: '삭제 완료' })
            fetchList()
          }}
          onError={(msg) => setResultPanel({ kind: 'err', msg })}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Create Modal
// ════════════════════════════════════════════════════════════════
function CreateModal(props: {
  onClose: () => void
  onCreated: (d: Deliverable) => void
  onError: (msg: string) => void
}) {
  const [code, setCode] = useState('')
  const [category, setCategory] = useState<string>('appointment')
  const [title, setTitle] = useState('')
  const [externalRecipient, setExternalRecipient] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [contentMd, setContentMd] = useState('')
  const [retentionUntil, setRetentionUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!code.trim() || !title.trim()) {
      props.onError('deliverable_code, title 필수')
      return
    }
    setBusy(true)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/deliverables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          deliverable_code: code.trim(),
          category, title: title.trim(),
          external_recipient: externalRecipient.trim() || null,
          recipient_email: recipientEmail.trim() || null,
          content_md: contentMd || null,
          retention_until: retentionUntil || null,
          notes: notes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        props.onError(`등록 실패: ${json.error || res.status}`)
        return
      }
      props.onCreated(json.data)
    } catch (e) {
      props.onError(`등록 오류: ${e}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="+ 신규 산출물 등록" onClose={props.onClose}>
      <FieldRow label="코드 *">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="예: APT-2026-001" style={inputStyle} />
      </FieldRow>
      <FieldRow label="분류 *">
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label="제목 *">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026년 임명장 (CPO 임성민)" style={inputStyle} />
      </FieldRow>
      <FieldRow label="수신처">
        <input value={externalRecipient} onChange={(e) => setExternalRecipient(e.target.value)} placeholder="예: 개인정보보호위원회" style={inputStyle} />
      </FieldRow>
      <FieldRow label="수신 이메일">
        <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="예: privacy@example.go.kr" style={inputStyle} />
      </FieldRow>
      <FieldRow label="본문 (선택)">
        <textarea value={contentMd} onChange={(e) => setContentMd(e.target.value)} rows={4} style={{ ...inputStyle, fontFamily: 'monospace' }} />
      </FieldRow>
      <FieldRow label="보유 기한 (선택)">
        <input type="date" value={retentionUntil} onChange={(e) => setRetentionUntil(e.target.value)} style={inputStyle} />
      </FieldRow>
      <FieldRow label="비고">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={inputStyle} />
      </FieldRow>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button style={btnSecondary} onClick={props.onClose}>취소</button>
        <button style={btnPrimary} onClick={submit} disabled={busy}>
          {busy ? '등록중…' : '등록'}
        </button>
      </div>
    </ModalShell>
  )
}

// ════════════════════════════════════════════════════════════════
// Edit Modal — status 전이 + 부분 갱신 + 삭제
// ════════════════════════════════════════════════════════════════
function EditModal(props: {
  row: Deliverable
  isMgr: boolean
  onClose: () => void
  onSaved: (d: Deliverable) => void
  onDeleted: () => void
  onError: (msg: string) => void
}) {
  const r = props.row
  const [title, setTitle] = useState(r.title)
  const [externalRecipient, setExternalRecipient] = useState(r.external_recipient || '')
  const [recipientEmail, setRecipientEmail] = useState(r.recipient_email || '')
  const [contentMd, setContentMd] = useState(r.content_md || '')
  const [notes, setNotes] = useState(r.notes || '')
  const [retentionUntil, setRetentionUntil] = useState(r.retention_until || '')
  const [busy, setBusy] = useState(false)

  const callPatch = async (extra: Record<string, unknown>) => {
    setBusy(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/deliverables/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          title: title.trim() !== r.title ? title.trim() : null,
          external_recipient: externalRecipient.trim() !== (r.external_recipient || '') ? (externalRecipient.trim() || null) : null,
          recipient_email: recipientEmail.trim() !== (r.recipient_email || '') ? (recipientEmail.trim() || null) : null,
          content_md: contentMd !== (r.content_md || '') ? contentMd : null,
          notes: notes !== (r.notes || '') ? notes : null,
          retention_until: retentionUntil !== (r.retention_until || '') ? (retentionUntil || null) : null,
          ...extra,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        props.onError(`갱신 실패: ${json.error || res.status}`)
        return
      }
      props.onSaved(json.data)
    } catch (e) {
      props.onError(`갱신 오류: ${e}`)
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    if (!confirm(`「${r.deliverable_code} ${r.title}」 삭제할까요? draft 만 삭제 가능합니다.`)) return
    setBusy(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/deliverables/${r.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        props.onError(`삭제 실패: ${json.error || res.status}`)
        return
      }
      props.onDeleted()
    } catch (e) {
      props.onError(`삭제 오류: ${e}`)
    } finally {
      setBusy(false)
    }
  }

  const c = STATUS_COLOR[r.status] || STATUS_COLOR.draft
  const sentMethodInput = r.sent_method || 'email'

  return (
    <ModalShell title={`${r.deliverable_code}`} onClose={props.onClose}>
      <div style={{ marginBottom: 12, fontSize: 13, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
        <strong>분류:</strong> {CATEGORY_LABEL[r.category] || r.category}{'  '}
        <strong style={{ marginLeft: 12 }}>상태:</strong>{' '}
        <span style={{
          display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 11,
          background: c.bg, color: c.fg, border: `1px solid ${c.bd}`,
        }}>{STATUS_LABEL[r.status] || r.status}</span>
        <span style={{ marginLeft: 12, fontSize: 11, color: COLORS.textMuted }}>
          승인일: {fmtDateTime(r.approved_at)} · 송부일: {fmtDateTime(r.sent_at)} · 응답: {fmtDateTime(r.response_received_at)}
        </span>
      </div>

      <FieldRow label="제목">
        <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!props.isMgr} style={inputStyle} />
      </FieldRow>
      <FieldRow label="수신처">
        <input value={externalRecipient} onChange={(e) => setExternalRecipient(e.target.value)} disabled={!props.isMgr} style={inputStyle} />
      </FieldRow>
      <FieldRow label="수신 이메일">
        <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} disabled={!props.isMgr} style={inputStyle} />
      </FieldRow>
      <FieldRow label="본문">
        <textarea value={contentMd} onChange={(e) => setContentMd(e.target.value)} disabled={!props.isMgr} rows={5} style={{ ...inputStyle, fontFamily: 'monospace' }} />
      </FieldRow>
      <FieldRow label="보유 기한">
        <input type="date" value={retentionUntil} onChange={(e) => setRetentionUntil(e.target.value)} disabled={!props.isMgr} style={inputStyle} />
      </FieldRow>
      <FieldRow label="비고">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!props.isMgr} rows={2} style={inputStyle} />
      </FieldRow>

      {props.isMgr && (
        <div style={{
          ...GLASS.L2, marginTop: 12, padding: '10px 12px', borderRadius: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 6 }}>
            상태 전이 (draft → approved → sent → responded → closed)
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {r.status === 'draft' && (
              <button style={btnPrimary} onClick={() => callPatch({ status: 'approved' })} disabled={busy}>✓ 승인</button>
            )}
            {r.status === 'approved' && (
              <button style={btnPrimary} onClick={() => {
                const m = prompt('송부 방법 (email/post/courier/portal/fax/in_person)', sentMethodInput) || sentMethodInput
                callPatch({ status: 'sent', sent_method: m })
              }} disabled={busy}>📤 송부 완료</button>
            )}
            {r.status === 'sent' && (
              <>
                <button style={btnPrimary} onClick={() => {
                  const note = prompt('응답 내용 (선택)', '') || null
                  callPatch({ status: 'responded', response_note: note })
                }} disabled={busy}>📩 응답 수신</button>
                <button style={btnSecondary} onClick={() => callPatch({ status: 'closed' })} disabled={busy}>🔒 응답 없이 종결</button>
              </>
            )}
            {r.status === 'responded' && (
              <button style={btnPrimary} onClick={() => callPatch({ status: 'closed' })} disabled={busy}>🔒 종결</button>
            )}
            {r.status === 'closed' && (
              <span style={{ fontSize: 12, color: COLORS.textMuted }}>종결됨 (편집은 가능하나 상태 전이는 없음)</span>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
        <div>
          {props.isMgr && r.status === 'draft' && (
            <button style={btnDanger} onClick={doDelete} disabled={busy}>🗑 삭제</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnSecondary} onClick={props.onClose}>닫기</button>
          {props.isMgr && (
            <button style={btnPrimary} onClick={() => callPatch({})} disabled={busy}>저장</button>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

// ── 공용 modal shell / input row ─────────────────────────────────
function ModalShell(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}
      onClick={props.onClose}
    >
      <div style={{
        ...GLASS.L4, padding: 20, borderRadius: 14, maxWidth: 640, width: 'min(640px, 92vw)',
        maxHeight: '85vh', overflow: 'auto',
      }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>{props.title}</div>
          <button style={{ ...btnSecondary, fontSize: 12, padding: '2px 10px' }} onClick={props.onClose}>×</button>
        </div>
        {props.children}
      </div>
    </div>
  )
}

function FieldRow(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
      <div style={{ width: 100, fontSize: 12, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>{props.label}</div>
      <div style={{ flex: 1 }}>{props.children}</div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  ...GLASS.L1,
  width: '100%', padding: '6px 10px', borderRadius: 8,
  border: `1px solid ${COLORS.borderSubtle}`, fontSize: 13,
}
