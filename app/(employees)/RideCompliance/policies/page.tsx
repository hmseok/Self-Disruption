'use client'

/**
 * /RideCompliance/policies — 내규 마스터 (Phase 2.0)
 *
 * 사용자 통찰 (2026-05-28):
 *   「내규 정책도 등록이 안되었는데 연간 운영이라던가 운영가이드가
 *    이미 정해져있다는게 이상함」
 *   → 내규를 1차 데이터로 등록 → AI 추출 → 검수 → 확정.
 *
 * 흐름:
 *   1. 「+ 새 내규 등록」 → 메타 + 본문 텍스트 paste
 *   2. POST /policies → POST /policies/[id]/extract → chunk Gemini → sections INSERT
 *   3. 행 클릭 → 검수 모달 (4 탭: 조항 / 별첨 / Playbook / 연간)
 *   4. 각 section: ✓ 확정 / ✏ 편집 / ✕ 반려
 *   5. 모두 검수 후 policy status='active' (후속 PR 에서 playbook_steps 등 자동 채움)
 */

import { useEffect, useMemo, useState } from 'react'
import { getStoredToken } from '@/lib/auth-client'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'
import DcToolbar from '@/app/components/DcToolbar'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

// ── 도메인 ────────────────────────────────────────────────────
interface Policy {
  id: string
  policy_code: string
  title: string
  version: string
  effective_date: string | null
  source_file_name: string | null
  source_file_type: string | null
  uploaded_at: string | null
  uploaded_by_name: string | null
  ai_extracted_at: string | null
  ai_model: string | null
  ai_confidence: number | null
  ai_summary_md: string | null
  status: string
  notes: string | null
  created_at: string
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

const POLICY_STATUS_LABEL: Record<string, string> = {
  uploaded:       '업로드됨',
  ai_extracted:   'AI 추출 완료',
  user_reviewing: '검수중',
  active:         '확정',
  superseded:     '폐기',
}
const POLICY_STATUS_COLOR: Record<string, { bg: string; fg: string; bd: string }> = {
  uploaded:       { bg: 'rgba(148,163,184,0.12)', fg: '#64748b', bd: 'rgba(148,163,184,0.30)' },
  ai_extracted:   { bg: 'rgba(245,158,11,0.12)',  fg: '#b45309', bd: 'rgba(245,158,11,0.30)' },
  user_reviewing: { bg: 'rgba(59,130,246,0.12)',  fg: '#2563eb', bd: 'rgba(59,130,246,0.30)' },
  active:         { bg: 'rgba(16,185,129,0.12)',  fg: '#047857', bd: 'rgba(16,185,129,0.30)' },
  superseded:     { bg: 'rgba(99,102,241,0.10)',  fg: '#4338ca', bd: 'rgba(99,102,241,0.25)' },
}

const KIND_LABEL: Record<string, string> = {
  article:       '조항',
  attachment:    '별첨',
  playbook_step: 'Playbook 단계',
  annual_event:  '연간 운영',
  screen_spec:   '🖥 필요 화면',
}

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

// ── 버튼 ──────────────────────────────────────────────────────
const btnPrimary: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer' }
const btnSecondary: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgGray, color: COLORS.textSecondary, cursor: 'pointer' }
const btnDanger: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgRed, color: COLORS.danger, cursor: 'pointer' }
const btnSuccess: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgGreen, color: COLORS.success, cursor: 'pointer' }

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function confidenceBadge(c: number | null): React.ReactNode {
  if (c == null) return <span style={{ fontSize: 11, color: COLORS.textMuted }}>—</span>
  const val = Number(c)
  const color = val >= 0.85 ? { bg: 'rgba(16,185,129,0.12)', fg: '#047857' }
              : val >= 0.5  ? { bg: 'rgba(245,158,11,0.12)', fg: '#b45309' }
                            : { bg: 'rgba(239,68,68,0.12)',  fg: '#b91c1c' }
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: color.bg, color: color.fg, whiteSpace: 'nowrap',
    }}>{(val * 100).toFixed(0)}%</span>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function PoliciesPage() {
  const [rows, setRows] = useState<Policy[]>([])
  const [loading, setLoading] = useState(false)
  const [migrationPending, setMigrationPending] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [reviewing, setReviewing] = useState<Policy | null>(null)
  const [resultPanel, setResultPanel] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const fetchList = async () => {
    setLoading(true)
    try {
      const token = getStoredToken()
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      const res = await fetch(`/api/ride-compliance/policies?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const json = await res.json()
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

  const stats: StatItem[] = useMemo(() => {
    const total = rows.length
    const draft = rows.filter(r => r.status === 'uploaded' || r.status === 'ai_extracted').length
    const reviewing = rows.filter(r => r.status === 'user_reviewing').length
    const active = rows.filter(r => r.status === 'active').length
    const superseded = rows.filter(r => r.status === 'superseded').length
    return [
      { label: '전체',      value: String(total),      tint: 'blue'   },
      { label: '검수 대기', value: String(draft),      tint: 'amber'  },
      { label: '검수중',    value: String(reviewing),  tint: 'blue'   },
      { label: '확정',      value: String(active),     tint: 'green'  },
      { label: '폐기',      value: String(superseded), tint: 'slate'  },
    ]
  }, [rows])

  const columns: TableColumn<Policy>[] = [
    {
      key: 'code', label: '코드', width: 160,
      sortBy: (r) => `${r.policy_code} ${r.version}`,
      render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{r.policy_code} <span style={{ color: COLORS.textMuted }}>{r.version}</span></span>,
    },
    {
      key: 'title', label: '제목',
      sortBy: (r) => r.title,
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>,
    },
    {
      key: 'file', label: '파일', width: 90,
      sortBy: (r) => r.source_file_type || '',
      render: (r) => <span style={{ fontSize: 12, whiteSpace: 'nowrap', color: r.source_file_type ? COLORS.textPrimary : COLORS.textMuted }}>{r.source_file_type || '—'}</span>,
    },
    {
      key: 'effective', label: '시행일', width: 110,
      sortBy: (r) => r.effective_date ? new Date(r.effective_date).getTime() : 0,
      render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(r.effective_date)}</span>,
    },
    {
      key: 'ai', label: 'AI 신뢰도', width: 90,
      sortBy: (r) => Number(r.ai_confidence || 0),
      render: (r) => confidenceBadge(r.ai_confidence),
    },
    {
      key: 'uploader', label: '등록자', width: 100,
      sortBy: (r) => r.uploaded_by_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{r.uploaded_by_name || '—'}</span>,
    },
    {
      key: 'status', label: '상태', width: 120,
      sortBy: (r) => r.status,
      render: (r) => {
        const c = POLICY_STATUS_COLOR[r.status] || POLICY_STATUS_COLOR.uploaded
        return (
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 6,
            background: c.bg, color: c.fg, border: `1px solid ${c.bd}`,
            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
          }}>{POLICY_STATUS_LABEL[r.status] || r.status}</span>
        )
      },
    },
    {
      key: 'action', label: '액션', width: 100,
      render: (r) => (
        <button
          style={{ ...btnPrimary, padding: '2px 8px', fontSize: 11 }}
          onClick={() => setReviewing(r)}
        >📋 검수</button>
      ),
    },
  ]

  return (
    <div style={{ padding: '0 24px 32px' }}>

      {/* Phase 2.0+ — 페이지 상단 안내 카드 (모듈 main 헤더와 시각 일관성) */}
      <div style={{
        ...GLASS.L3, padding: 18, borderRadius: 12, marginBottom: 16,
        borderLeft: `4px solid ${COLORS.primary}`,
      }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 16, color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>
          📜 내규 마스터 — 정보보안 운영의 1차 데이터
        </h2>
        <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.6 }}>
          PPTX/PDF 내규 파일을 등록하면 AI 가 조항·별첨·Playbook·연간 운영·필요 화면 5 카테고리를 자동 추출.
          검수 → 「✅ 내규 확정」 → 「📅 스케줄 자동 생성」 으로 연간 운영 task 자동 INSERT.
        </p>
      </div>

      {migrationPending && (
        <div style={{
          ...GLASS.L3, padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          border: '1px solid rgba(245,158,11,0.30)', background: 'rgba(254,243,199,0.40)',
        }}>
          <span style={{ fontWeight: 600, color: '#b45309' }}>⚠ 마이그레이션 미적용</span>
          <span style={{ marginLeft: 8, fontSize: 13, color: '#92400e' }}>{migrationPending}</span>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <DcStatStrip
          stats={stats}
          actions={[
            { label: '+ 새 내규 등록', onClick: () => setCreateOpen(true), variant: 'primary' },
          ]}
        />
      </div>

      <DcToolbar
        search={q}
        onSearchChange={setQ}
        placeholder="제목 / 코드 검색…"
        trailing={
          <button style={btnSecondary} onClick={fetchList} disabled={loading}>
            {loading ? '조회중…' : '🔍 조회'}
          </button>
        }
      />

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

      <NeuDataTable
        data={rows} columns={columns} rowKey={(r) => r.id}
        defaultSort={{ key: 'created_at', dir: 'desc' }}
        loading={loading}
        emptyMessage="등록된 내규가 없습니다. 「+ 새 내규 등록」 으로 시작하세요."
      />

      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={(msg) => {
            setCreateOpen(false)
            setResultPanel({ kind: 'ok', msg })
            fetchList()
          }}
          onError={(msg) => setResultPanel({ kind: 'err', msg })}
        />
      )}

      {reviewing && (
        <ReviewModal
          policy={reviewing}
          onClose={() => setReviewing(null)}
          onChanged={(msg) => { setResultPanel({ kind: 'ok', msg }); fetchList() }}
          onError={(msg) => setResultPanel({ kind: 'err', msg })}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Create Modal — Phase 2.3 (2026-05-28)
// 사용자 통찰: 「파일 등록만 하면 자동 입력되어야 함 — 입력 너무 많다」
// → 드롭존 + 코드(옵션) 만. 제목/버전/시행일/섹션 모두 AI 자동.
// ═══════════════════════════════════════════════════════════════
function CreateModal(props: {
  onClose: () => void
  onCreated: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'form' | 'uploading' | 'extracting' | 'analyzing'>('form')
  const [dragOver, setDragOver] = useState(false)

  const onFileChange = (f: File | null) => {
    if (!f) { setFile(null); return }
    const ext = f.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
    if (!ext || !['pptx', 'pdf', 'docx', 'xlsx', 'txt'].includes(ext)) {
      props.onError(`지원 안 되는 형식: .${ext || '?'} — PPTX/PDF/DOCX/XLSX/TXT 만 가능`)
      return
    }
    if (f.size > 50 * 1024 * 1024) {
      props.onError(`파일 크기 초과 (${(f.size / 1024 / 1024).toFixed(1)}MB > 50MB)`)
      return
    }
    setFile(f)
  }

  const submit = async () => {
    if (!file) { props.onError('파일을 먼저 선택하세요'); return }
    setBusy(true); setPhase('uploading')
    try {
      const token = getStoredToken()
      const fd = new FormData()
      fd.append('file', file)
      if (code.trim()) fd.append('policy_code', code.trim())
      setPhase('extracting')

      // Phase 2.3 hotfix9 — POST upload 는 즉시 응답 (1~3초). AI 분석은 백그라운드.
      const res = await fetch('/api/ride-compliance/policies/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        props.onError(`등록 실패: ${json.error || res.status}`)
        return
      }
      const d = json.data
      const policyId = String(d.policy_id)

      // Polling — status='ai_extracted' / 'ai_failed' / 'active' 까지 5초마다
      setPhase('analyzing')
      const startedAt = Date.now()
      const MAX_POLL_MS = 10 * 60 * 1000  // 10분 한계
      while (Date.now() - startedAt < MAX_POLL_MS) {
        await new Promise(r => setTimeout(r, 5_000))
        const pollRes = await fetch(`/api/ride-compliance/policies/${policyId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        const pollJson = await pollRes.json()
        if (!pollRes.ok || !pollJson.success) continue
        const status = pollJson.data?.status
        if (status === 'ai_extracted' || status === 'user_reviewing' || status === 'active') {
          const p = pollJson.data
          const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(0)
          props.onCreated(`등록 + AI 분석 완료 (${elapsedSec}s) — ${p.policy_code} 「${String(p.title).substring(0, 30)}…」 / 검수 모달에서 5 카테고리 섹션 확인`)
          return
        }
        if (status === 'ai_failed') {
          props.onError(`AI 분석 실패: ${pollJson.data?.ai_summary_md || '서버 로그 확인'} (policy_id=${policyId})`)
          return
        }
        // 'ai_extracting' — 계속 polling
      }
      // 10분 timeout
      props.onError(`AI 분석 시간 초과 (10분) — 백그라운드 계속 진행 중. /RideCompliance/policies 페이지에서 결과 확인 (policy_id=${policyId})`)
    } catch (e) {
      props.onError(`오류: ${e}`)
    } finally {
      setBusy(false); setPhase('form')
    }
  }

  const phaseLabel: Record<typeof phase, string> = {
    form:       '🤖 등록 + AI 분석',
    uploading:  '📤 업로드중…',
    extracting: '📖 파일 텍스트 추출중…',
    analyzing:  '🤖 AI 분석중… (1~3분)',
  }

  return (
    <ModalShell title="+ 새 내규 등록" onClose={busy ? () => {} : props.onClose} wide>
      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
        PPTX/PDF/DOCX 파일을 드롭하면 시스템이 자동으로 텍스트 추출 + AI 분석합니다.
        제목·버전·시행일·5 카테고리 섹션 모두 자동 추출 → 검수 모달에서 편집 가능.
      </div>

      {/* 파일 드롭존 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) onFileChange(f)
        }}
        onClick={() => !busy && document.getElementById('policy-file-input')?.click()}
        style={{
          ...GLASS.L2,
          padding: 32, borderRadius: 12, textAlign: 'center', cursor: busy ? 'wait' : 'pointer',
          border: `2px dashed ${dragOver ? COLORS.primary : COLORS.borderSubtle}`,
          marginBottom: 12, transition: 'all 0.15s ease',
        }}
      >
        {!file && (
          <>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 4 }}>
              파일 드래그·드롭 또는 클릭하여 선택
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>
              PPTX / PDF / DOCX / XLSX / TXT (최대 50MB)
            </div>
          </>
        )}
        {file && (
          <>
            <div style={{ fontSize: 28, marginBottom: 4 }}>📄</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {file.name}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
            {!busy && (
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null) }}
                style={{ ...btnSecondary, marginTop: 8, padding: '2px 10px', fontSize: 11 }}
              >✕ 다른 파일</button>
            )}
          </>
        )}
        <input
          id="policy-file-input" type="file" style={{ display: 'none' }}
          accept=".pptx,.pdf,.docx,.xlsx,.txt"
          onChange={(e) => onFileChange(e.target.files?.[0] || null)}
          disabled={busy}
        />
      </div>

      <FieldRow label="코드 (옵션)">
        <input value={code} onChange={(e) => setCode(e.target.value)}
          placeholder="비어있으면 자동 생성 — 예: POLICY-2026-001"
          style={inputStyle} disabled={busy} />
      </FieldRow>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button style={btnSecondary} onClick={props.onClose} disabled={busy}>취소</button>
        <button style={btnPrimary} onClick={submit} disabled={busy || !file}>
          {phaseLabel[phase]}
        </button>
      </div>
    </ModalShell>
  )
}

// ═══════════════════════════════════════════════════════════════
// Review Modal — 4 탭 (조항 / 별첨 / Playbook / 연간) 검수
// ═══════════════════════════════════════════════════════════════
function ReviewModal(props: {
  policy: Policy
  onClose: () => void
  onChanged: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(false)
  const [kind, setKind] = useState<'article' | 'attachment' | 'playbook_step' | 'annual_event' | 'screen_spec'>('article')
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchSections = async () => {
    setLoading(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/policies/${props.policy.id}/sections`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const json = await res.json()
      setSections(json.data || [])
    } catch (e) {
      props.onError(`섹션 조회 실패: ${e}`)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { fetchSections() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const sectionAction = async (s: Section, action: 'confirm' | 'reject' | 'reset') => {
    setBusyId(s.id)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/policies/${props.policy.id}/sections`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ section_id: s.id, action }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        props.onError(`${action} 실패: ${json.error || res.status}`)
        return
      }
      await fetchSections()
    } catch (e) {
      props.onError(`${action} 오류: ${e}`)
    } finally {
      setBusyId(null)
    }
  }

  // Phase 2.4 — 스케줄 자동 생성 (확정 내규 → annual_plan + tasks INSERT)
  const generateSchedule = async () => {
    if (props.policy.status !== 'active') {
      props.onError('스케줄 자동 생성은 active 내규만 가능 — 먼저 「내규 확정」 버튼으로 active 전이.')
      return
    }
    setBusyId('__schedule__')
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/policies/${props.policy.id}/generate-schedule`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        props.onError(`스케줄 생성 실패: ${json.error || res.status}`)
        return
      }
      const d = json.data
      const msg = `스케줄 자동 생성 완료 — annual_plan ${d.plan_code} (${d.plan_created ? '신규' : '기존'}) / tasks ${d.inserted_tasks}건 INSERT / 월 추정 실패 ${d.skipped_no_month} / 중복 ${d.skipped_duplicate}`
      props.onChanged(msg)
    } catch (e) {
      props.onError(`스케줄 생성 오류: ${e}`)
    } finally {
      setBusyId(null)
    }
  }

  const finalizePolicy = async () => {
    // Rule 20 — 인라인 차단 + onError 안내 (브라우저 dialog 미사용)
    const draftCount = sections.filter(s => s.user_status === 'ai_draft').length
    if (draftCount > 0) {
      props.onError(`검수 미완료 섹션 ${draftCount}건 — 각 행의 ✓확정 또는 ✕반려 처리 후 확정 가능. 4 탭(조항/별첨/Playbook/연간) 모두 확인하세요.`)
      return
    }
    setBusyId('__finalize__')
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/policies/${props.policy.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status: 'active' }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        props.onError(`확정 실패: ${json.error || res.status}`)
        return
      }
      props.onChanged('내규 확정 완료 — Phase 2.1 (Playbook 자동 채움) 대기')
      props.onClose()
    } catch (e) {
      props.onError(`확정 오류: ${e}`)
    } finally {
      setBusyId(null)
    }
  }

  const filtered = sections.filter(s => s.section_kind === kind)
  const counts = {
    article:       sections.filter(s => s.section_kind === 'article').length,
    attachment:    sections.filter(s => s.section_kind === 'attachment').length,
    playbook_step: sections.filter(s => s.section_kind === 'playbook_step').length,
    annual_event:  sections.filter(s => s.section_kind === 'annual_event').length,
    screen_spec:   sections.filter(s => s.section_kind === 'screen_spec').length,
  }

  return (
    <ModalShell
      title={`📋 ${props.policy.policy_code} ${props.policy.version} 검수`}
      onClose={props.onClose}
      wide
    >
      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>
        <strong>{props.policy.title}</strong> —
        {' '}AI 신뢰도: {props.policy.ai_confidence != null ? `${(props.policy.ai_confidence * 100).toFixed(0)}%` : '—'}
        {' / '}추출: {props.policy.ai_extracted_at ? new Date(props.policy.ai_extracted_at).toLocaleString() : '—'}
        {props.policy.ai_summary_md && <div style={{ marginTop: 6, padding: 8, ...GLASS.L2, borderRadius: 6 }}>{props.policy.ai_summary_md}</div>}
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, borderBottom: `1px solid ${COLORS.borderSubtle}` }}>
        {(['article', 'attachment', 'playbook_step', 'annual_event', 'screen_spec'] as const).map((k) => (
          <button key={k}
            onClick={() => setKind(k)}
            style={{
              padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
              borderBottom: kind === k ? `2px solid ${COLORS.primary}` : '2px solid transparent',
              color: kind === k ? COLORS.primary : COLORS.textSecondary,
              fontWeight: kind === k ? 600 : 400, fontSize: 13, whiteSpace: 'nowrap',
            }}
          >
            {KIND_LABEL[k]} ({counts[k]})
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 20, color: COLORS.textMuted }}>조회중…</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 20, color: COLORS.textMuted }}>
          이 카테고리에 추출된 섹션이 없습니다.
        </div>
      )}

      {!loading && filtered.map((s) => {
        const sc = SECTION_STATUS_COLOR[s.user_status] || SECTION_STATUS_COLOR.ai_draft
        return (
          <div key={s.id} style={{
            ...GLASS.L2, padding: 12, borderRadius: 8, marginBottom: 8,
            opacity: s.user_status === 'rejected' ? 0.6 : 1,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 0 }}>
                {s.section_code && <span style={{ fontFamily: 'monospace', fontSize: 12, color: COLORS.textPrimary, whiteSpace: 'nowrap' }}>{s.section_code}</span>}
                <span style={{ fontWeight: 600, fontSize: 13, color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                {confidenceBadge(s.ai_confidence)}
                <span style={{
                  padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: sc.bg, color: sc.fg, whiteSpace: 'nowrap',
                }}>{SECTION_STATUS_LABEL[s.user_status]}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {s.user_status === 'ai_draft' && (
                  <>
                    <button style={{ ...btnSuccess, padding: '2px 8px', fontSize: 11 }}
                      onClick={() => sectionAction(s, 'confirm')} disabled={busyId === s.id}>✓ 확정</button>
                    <button style={{ ...btnDanger, padding: '2px 8px', fontSize: 11 }}
                      onClick={() => sectionAction(s, 'reject')} disabled={busyId === s.id}>✕ 반려</button>
                  </>
                )}
                {s.user_status === 'user_confirmed' && (
                  <button style={{ ...btnSecondary, padding: '2px 8px', fontSize: 11 }}
                    onClick={() => sectionAction(s, 'reset')} disabled={busyId === s.id}>↺ 다시</button>
                )}
                {s.user_status === 'rejected' && (
                  <button style={{ ...btnSecondary, padding: '2px 8px', fontSize: 11 }}
                    onClick={() => sectionAction(s, 'reset')} disabled={busyId === s.id}>↺ 복원</button>
                )}
              </div>
            </div>
            {s.body_md && <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>{s.body_md}</div>}
            {s.ai_raw_excerpt && (
              <details style={{ fontSize: 11, color: COLORS.textMuted }}>
                <summary style={{ cursor: 'pointer' }}>원본 인용 발췌</summary>
                <div style={{ marginTop: 4, padding: 6, background: 'rgba(0,0,0,0.03)', borderRadius: 4 }}>{s.ai_raw_excerpt}</div>
              </details>
            )}
          </div>
        )
      })}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.borderSubtle}` }}>
        <button style={btnSecondary} onClick={fetchSections}>🔄 새로고침</button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btnSecondary} onClick={props.onClose}>닫기</button>
          {props.policy.status !== 'active' && (
            <button style={btnSuccess} onClick={finalizePolicy} disabled={busyId === '__finalize__'}>✅ 내규 확정 (active)</button>
          )}
          {props.policy.status === 'active' && (
            <button style={btnPrimary} onClick={generateSchedule} disabled={busyId === '__schedule__'}>
              {busyId === '__schedule__' ? '⏳ 생성중…' : '📅 스케줄 자동 생성'}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

// ═══════════════════════════════════════════════════════════════
// Modal shell + 공통
// ═══════════════════════════════════════════════════════════════
function ModalShell(props: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in px-4"
      onClick={props.onClose}
    >
      <div
        style={{
          ...GLASS.L4, padding: 24, borderRadius: 16,
          maxWidth: props.wide ? 840 : 640, width: '100%', maxHeight: '90vh', overflow: 'auto',
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
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
      <div style={{ width: 110, fontSize: 12, color: COLORS.textSecondary, whiteSpace: 'nowrap', paddingTop: 8 }}>{props.label}</div>
      <div style={{ flex: 1 }}>{props.children}</div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  ...GLASS.L1,
  width: '100%', padding: '6px 10px', borderRadius: 8,
  border: `1px solid ${COLORS.borderSubtle}`, fontSize: 13,
}
