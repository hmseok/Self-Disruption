'use client'

/**
 * /RideCompliance/forms/[code] — 서식별 페이지
 *
 * 사용자 통찰 (2026-05-19):
 *   "서식관리·각양식은 실제 페이지로 종류별 다르게"
 *   → code 패턴에 따라 분기:
 *     · M01 / M02 / M05 / M06 / annex7 → 카테고리 페이지 (해당 카테고리 서식 목록 + 작성 통계)
 *     · F-* (F-M01-01 등) → 개별 서식 페이지 (form builder 골격 + 작성 인스턴스 list)
 *
 * Phase 1.3-B 골격:
 *   · 카테고리 페이지: 5 카테고리별 서식 list + 클릭 시 개별 서식 페이지
 *   · 개별 서식 페이지: 공통 form builder (form_fields_schema 가 NULL 일 때 placeholder, 1.3-C 에서 상세화)
 *
 * Phase 1.3-C 후속: 각 서식별 fields 정의 (JSON schema) + 종류별 작성 폼 + 검토 흐름
 */

import Link from 'next/link'
import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'

const btnPrimary: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer' }
const btnSecondary: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgGray, color: COLORS.textSecondary, cursor: 'pointer' }
const btnSuccess: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgGreen, color: COLORS.success, cursor: 'pointer' }

interface FormDoc {
  id: string
  doc_code: string
  doc_type: string
  title: string
  parent_manual_code: string | null
  description: string | null
  retention_years: number
  is_master_verified: number
  file_url: string | null
  status: string
}

interface Submission {
  id: string
  submission_code: string
  document_id: string
  document_code: string
  title: string | null
  submitted_by_user_name: string | null
  submitted_at: string
  retention_until: string
  review_status: string
  file_url: string | null
}

// 카테고리 → parent_manual_code 매핑 (M01 → RIDE-M01) + annex7 별도
const CATEGORY_MAP: Record<string, { parent: string | null; label: string; description: string }> = {
  M01:     { parent: 'RIDE-M01', label: '유출대응 (RIDE-M01)',     description: '개인정보 유출 발생 시 24시간 통지 + 대응 절차 (제25~27조). 서식 6종.' },
  M02:     { parent: 'RIDE-M02', label: '비상대응 BCP (RIDE-M02)', description: '시스템 장애·비상상황 대응 (Business Continuity). 서식 4종. 연 1회 모의훈련 (8월).' },
  M05:     { parent: 'RIDE-M05', label: '파기 (RIDE-M05)',         description: '개인정보 파기 절차 + CPO 승인 (제28~33조). 서식 4종. 분기 1회. 파기대장 3년 보존.' },
  M06:     { parent: 'RIDE-M06', label: '취급단말기 (RIDE-M06)',   description: '단말기 지급·반납 관리 (제18조). 서식 2종.' },
  annex7:  { parent: null,       label: '연간계획 별첨 7',         description: 'RIDE-PLAN-2026 운영 서식 — 교육계획서 (F-06) + 교육 이수 확인서 (F-07).' },
}

const REVIEW_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  submitted: { label: '제출됨', color: COLORS.warning },
  approved:  { label: '승인',   color: COLORS.success },
  rejected:  { label: '반려',   color: COLORS.danger },
  archived:  { label: '보관',   color: COLORS.textSecondary },
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  const dt = new Date(d); if (isNaN(dt.getTime())) return ''
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function daysUntilDue(due: string): number {
  const t = new Date(due).getTime()
  if (isNaN(t)) return 999
  return Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000))
}

export default function FormDetailPage() {
  const params = useParams<{ code: string }>()
  const code = decodeURIComponent(params?.code || '')

  const [user, setUser] = useState<{ id?: string; role?: string } | null>(null)
  const [allForms, setAllForms] = useState<FormDoc[]>([])
  const [allSubs, setAllSubs] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitOpen, setSubmitOpen] = useState(false)

  useEffect(() => { setUser(getStoredUser()) }, [])

  const fetchAll = async () => {
    setLoading(true); setError(null)
    try {
      const token = getStoredToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const [fRes, sRes] = await Promise.all([
        fetch('/api/ride-compliance/documents?type=form', { headers, cache: 'no-store' }),
        fetch('/api/ride-compliance/form-submissions', { headers, cache: 'no-store' }),
      ])
      const fJ = await fRes.json(); const sJ = await sRes.json()
      setAllForms(fJ.data || []); setAllSubs(sJ.data || [])
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  useEffect(() => { fetchAll() }, [])

  const isCategory = !!CATEGORY_MAP[code]
  const isIndividualForm = code.startsWith('F-')

  if (loading) return <div style={{ padding: 40, fontSize: 14, color: COLORS.textSecondary }}>로딩 중…</div>
  if (error) return <div style={{ padding: 40 }}><div style={{ ...GLASS.L3, padding: 24, borderRadius: 12, borderLeft: `4px solid ${COLORS.danger}` }}><h2 style={{ margin: 0, color: COLORS.danger, fontSize: 18 }}>❌ {error}</h2></div></div>

  if (isCategory) {
    return <CategoryView code={code} info={CATEGORY_MAP[code]} allForms={allForms} allSubs={allSubs} />
  }
  if (isIndividualForm) {
    const form = allForms.find(f => f.doc_code === code)
    if (!form) return (
      <div style={{ padding: 40, maxWidth: 760 }}>
        <div style={{ ...GLASS.L3, padding: 24, borderRadius: 12, borderLeft: `4px solid ${COLORS.danger}` }}>
          <h2 style={{ margin: 0, color: COLORS.danger, fontSize: 18 }}>❌ 서식 코드 &quot;{code}&quot; 미존재</h2>
          <Link href="/RideCompliance?tab=documents" style={{ color: COLORS.primary, marginTop: 12, display: 'inline-block', fontSize: 13 }}>← 자료실로</Link>
        </div>
      </div>
    )
    return <IndividualFormView form={form} allSubs={allSubs.filter(s => s.document_code === code)} userRole={user?.role} onCreate={() => setSubmitOpen(true)} submitOpen={submitOpen} setSubmitOpen={setSubmitOpen} onSaved={fetchAll} />
  }

  // 알 수 없는 code — 카테고리 list (대시보드 역할)
  return <CategoriesIndex allForms={allForms} allSubs={allSubs} />
}

// ────────── 카테고리 list (default route) ──────────
function CategoriesIndex(props: { allForms: FormDoc[]; allSubs: Submission[] }) {
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <Link href="/RideCompliance?tab=documents" style={{ color: COLORS.primary, fontSize: 13, marginBottom: 8, display: 'inline-block' }}>← 라이드 정보보안</Link>
      <h1 style={{ margin: '4px 0 16px', fontSize: 20 }}>📝 서식 카테고리</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {Object.entries(CATEGORY_MAP).map(([catCode, info]) => {
          const forms = props.allForms.filter(f => info.parent ? f.parent_manual_code === info.parent : (f.doc_code === 'F-06' || f.doc_code === 'F-07'))
          const verified = forms.filter(f => f.is_master_verified === 1).length
          const subs = props.allSubs.filter(s => forms.some(f => f.doc_code === s.document_code)).length
          return (
            <Link key={catCode} href={`/RideCompliance/forms/${catCode}`} style={{ textDecoration: 'none' }}>
              <div style={{ ...GLASS.L3, padding: 18, borderRadius: 10, cursor: 'pointer', minHeight: 160 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: 15, color: COLORS.textPrimary }}>{info.label}</h3>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5 }}>{info.description}</p>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: COLORS.textMuted }}>
                  <span>서식 {forms.length}종</span>
                  <span>·</span>
                  <span style={{ color: verified === forms.length ? COLORS.success : COLORS.warning }}>검수 {verified}/{forms.length}</span>
                  <span>·</span>
                  <span>제출 {subs}건</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ────────── 카테고리 페이지 (M01 / M02 / M05 / M06 / annex7) ──────────
function CategoryView(props: { code: string; info: { parent: string | null; label: string; description: string }; allForms: FormDoc[]; allSubs: Submission[] }) {
  const forms = useMemo(() => {
    return props.allForms.filter(f =>
      props.info.parent ? f.parent_manual_code === props.info.parent
                        : (f.doc_code === 'F-06' || f.doc_code === 'F-07')
    ).sort((a, b) => a.doc_code.localeCompare(b.doc_code))
  }, [props.allForms, props.info.parent])

  const cols: TableColumn<FormDoc>[] = [
    { key: 'doc_code', label: '코드', sortBy: r => r.doc_code, render: r => (
      <Link href={`/RideCompliance/forms/${r.doc_code}`} style={{ color: COLORS.primary, fontWeight: 600 }}>{r.doc_code}</Link>
    ) },
    { key: 'title', label: '서식명', sortBy: r => r.title, render: r => r.title },
    { key: 'is_master_verified', label: '검수', sortBy: r => r.is_master_verified, render: r => r.is_master_verified === 1 ? <span style={{ color: COLORS.success, fontWeight: 600 }}>✓ 완료</span> : <span style={{ color: COLORS.warning, fontWeight: 600 }}>⚠ 대기</span> },
    { key: 'retention_years', label: '보존', sortBy: r => r.retention_years, render: r => `${r.retention_years}년` },
    { key: 'file_url', label: '원본', sortBy: r => r.file_url ? 1 : 0, render: r => r.file_url ? '📎 있음' : <span style={{ color: COLORS.textMuted }}>미입력</span> },
    { key: 'submissions', label: '제출 건수', sortBy: r => props.allSubs.filter(s => s.document_code === r.doc_code).length, render: r => {
      const n = props.allSubs.filter(s => s.document_code === r.doc_code).length
      return n > 0 ? <strong style={{ color: COLORS.primary }}>{n}건</strong> : '—'
    } },
  ]

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <Link href="/RideCompliance?tab=documents" style={{ color: COLORS.primary, fontSize: 13, marginBottom: 8, display: 'inline-block' }}>← 라이드 정보보안</Link>
      <h1 style={{ margin: '4px 0 4px', fontSize: 20 }}>📝 {props.info.label}</h1>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.textSecondary }}>{props.info.description}</p>

      {props.info.parent && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: COLORS.bgBlue, fontSize: 12, color: COLORS.textSecondary, borderLeft: `4px solid ${COLORS.info}` }}>
          💡 부모 매뉴얼: <Link href={`/RideCompliance/manuals/${props.info.parent}`} style={{ color: COLORS.primary, fontWeight: 600 }}>{props.info.parent}</Link> — 본문 + 절차 + 검수 상태 확인.
        </div>
      )}

      <div style={{ ...GLASS.L3, padding: 20, borderRadius: 10 }}>
        <NeuDataTable columns={cols} data={forms} rowKey={r => r.id} />
      </div>
    </div>
  )
}

// ────────── 개별 서식 페이지 (F-M01-01 등) ──────────
function IndividualFormView(props: {
  form: FormDoc
  allSubs: Submission[]
  userRole?: string
  onCreate: () => void
  submitOpen: boolean
  setSubmitOpen: (v: boolean) => void
  onSaved: () => void
}) {
  const verified = props.form.is_master_verified === 1
  const cols: TableColumn<Submission>[] = [
    { key: 'submission_code', label: '제출번호', sortBy: r => r.submission_code, render: r => <strong style={{ color: COLORS.primary }}>{r.submission_code}</strong> },
    { key: 'title', label: '제목', sortBy: r => r.title || '', render: r => r.title || '—' },
    { key: 'submitted_by_user_name', label: '작성자', sortBy: r => r.submitted_by_user_name || '', render: r => r.submitted_by_user_name || '—' },
    { key: 'submitted_at', label: '작성일', sortBy: r => r.submitted_at, render: r => fmtDate(r.submitted_at) },
    { key: 'file_url', label: '첨부', sortBy: r => r.file_url ? 1 : 0, render: r => r.file_url ? <a href={r.file_url} target="_blank" rel="noopener" style={{ color: COLORS.primary, fontSize: 12 }}>📎</a> : '—' },
    { key: 'retention_until', label: '보존만료', sortBy: r => r.retention_until, render: r => {
      const days = daysUntilDue(r.retention_until)
      if (days < 0) return <span style={{ color: COLORS.danger, fontWeight: 700 }}>만료 {Math.abs(days)}일</span>
      if (days < 90) return <span style={{ color: COLORS.warning, fontWeight: 600 }}>⚠ {fmtDate(r.retention_until)}</span>
      return fmtDate(r.retention_until)
    } },
    { key: 'review_status', label: '상태', sortBy: r => r.review_status, render: r => {
      const s = REVIEW_STATUS_LABEL[r.review_status]; return <span style={{ color: s?.color, fontWeight: 600 }}>{s?.label || r.review_status}</span>
    } },
  ]

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 8 }}>
        <Link href="/RideCompliance?tab=documents" style={{ color: COLORS.primary, fontSize: 13 }}>← 라이드 정보보안</Link>
        {props.form.parent_manual_code && (
          <>
            <span style={{ color: COLORS.textMuted, margin: '0 6px' }}>·</span>
            <Link href={`/RideCompliance/manuals/${props.form.parent_manual_code}`} style={{ color: COLORS.primary, fontSize: 13 }}>{props.form.parent_manual_code} 매뉴얼</Link>
          </>
        )}
      </div>
      <h1 style={{ margin: '4px 0 16px', fontSize: 20 }}>📝 {props.form.doc_code} · {props.form.title}</h1>

      {!verified && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: COLORS.bgRed, borderLeft: `4px solid ${COLORS.danger}`, fontSize: 13, color: COLORS.danger }}>
          ⚠ <strong>원본 미검수 서식</strong> — 「자료실」 탭에서 file_url 등록 후 CPO 검수 완료해야 작성 가능합니다 (사용자 추가-C 통찰).
        </div>
      )}

      {/* 메타 + 양식 미리보기 */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ ...GLASS.L3, padding: 16, borderRadius: 10 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.textSecondary }}>📋 서식 정보</h3>
          <MetaRow label="코드" value={props.form.doc_code} />
          <MetaRow label="부모" value={props.form.parent_manual_code || '—'} />
          <MetaRow label="보존" value={`${props.form.retention_years}년`} />
          <MetaRow label="검수" value={verified ? <span style={{ color: COLORS.success, fontWeight: 600 }}>✓ 완료</span> : <span style={{ color: COLORS.warning, fontWeight: 600 }}>⚠ 대기</span>} />
          <MetaRow label="원본" value={props.form.file_url ? <a href={props.form.file_url} target="_blank" rel="noopener" style={{ color: COLORS.primary, fontSize: 12 }}>📎 link</a> : '—'} />
        </div>

        <div style={{ ...GLASS.L3, padding: 16, borderRadius: 10 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.textSecondary }}>📄 양식 미리보기</h3>
          {props.form.file_url ? (
            <a href={props.form.file_url} target="_blank" rel="noopener" style={{ display: 'inline-block', padding: '8px 14px', background: COLORS.bgBlue, color: COLORS.primary, borderRadius: 6, fontSize: 13, textDecoration: 'none' }}>
              📥 원본 양식 열기 (새 탭)
            </a>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>
              양식 미입력 — 자료실에서 file_url 입력 필요
            </div>
          )}

          <div style={{ marginTop: 14, padding: '8px 12px', borderRadius: 6, background: COLORS.bgAmber, fontSize: 11, color: COLORS.textSecondary, borderLeft: `3px solid ${COLORS.warning}` }}>
            🔧 <strong>Phase 1.3-C 예정</strong>: 서식별 fields 정의 (JSON schema) + 인-앱 폼 작성 인터페이스.
            현재는 작성된 PDF/DOCX 를 첨부 파일 형태로 등록.
          </div>
        </div>
      </div>

      {/* 작성 인스턴스 list */}
      <div style={{ ...GLASS.L3, padding: 20, borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>📝 작성 인스턴스 ({props.allSubs.length}건)</h3>
          {verified && <button onClick={props.onCreate} style={{ ...btnSuccess, marginLeft: 'auto' }}>＋ 신규 작성</button>}
        </div>
        {props.allSubs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: COLORS.textSecondary, fontSize: 13 }}>
            아직 작성된 인스턴스 없음
            {verified && (
              <div style={{ marginTop: 12, fontSize: 11, color: COLORS.textMuted }}>
                「＋ 신규 작성」 버튼으로 첫 인스턴스 등록
              </div>
            )}
          </div>
        ) : (
          <NeuDataTable columns={cols} data={props.allSubs} rowKey={r => r.id} />
        )}
      </div>

      {/* 작성 모달 (placeholder — Phase 1.3-C 에서 form_fields_schema 기반 폼 생성) */}
      {props.submitOpen && (
        <SubmitModal form={props.form} onClose={() => props.setSubmitOpen(false)} onSaved={() => { props.setSubmitOpen(false); props.onSaved() }} />
      )}
    </div>
  )
}

function MetaRow(props: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', padding: '4px 0', fontSize: 12 }}>
      <span style={{ width: 70, color: COLORS.textMuted, flexShrink: 0 }}>{props.label}</span>
      <span style={{ color: COLORS.textPrimary }}>{props.value}</span>
    </div>
  )
}

function SubmitModal(props: { form: FormDoc; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/form-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          document_code: props.form.doc_code,
          title: title || `${props.form.title} 작성 (${new Date().toISOString().slice(0, 10)})`,
          file_url: fileUrl || null,
          notes: notes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      props.onSaved()
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }

  return (
    <div onClick={props.onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...GLASS.L1, padding: 24, borderRadius: 12, maxWidth: 600, width: '90vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>📝 {props.form.doc_code} · {props.form.title} 작성</h2>
          <button onClick={props.onClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: COLORS.textSecondary }}>✕</button>
        </div>
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: `${COLORS.success}15`, fontSize: 12, color: COLORS.textSecondary, borderLeft: `3px solid ${COLORS.success}` }}>
          💡 보존 {props.form.retention_years}년 자동. 향후 Phase 1.3-C 에서 서식별 fields 인터페이스로 대체 예정.
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 4 }}>작성 제목 *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`예: ${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 ${props.form.title}`}
            style={{ width: '100%', padding: '8px 12px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 13 }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 4 }}>작성 파일 URL (PDF/DOCX 외부 link)</label>
          <input value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://..."
            style={{ width: '100%', padding: '8px 12px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 13 }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 4 }}>메모</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            style={{ width: '100%', padding: '8px 12px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 13, resize: 'vertical' }} />
        </div>
        {error && <div style={{ padding: '8px 12px', borderRadius: 6, background: `${COLORS.danger}18`, color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>❌ {error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={props.onClose} style={btnSecondary}>취소</button>
          <button onClick={save} disabled={saving} style={btnSuccess}>{saving ? '저장 중...' : '✓ 등록'}</button>
        </div>
      </div>
    </div>
  )
}
