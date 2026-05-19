'use client'

/**
 * /RideCompliance/manuals/[code] — 매뉴얼별 상세 페이지
 *
 * 사용자 통찰 (2026-05-19):
 *   "매뉴얼은 종류별로 구분되어 있으면 좋겠다" → 매뉴얼 7건 (RIDE-PMP, M01~M06) 독립 라우트
 *   "안전·확실 보존"                       → 마크다운 본문 (DB) + PDF 원본 (GCS or 외부 link) 동시
 *   "내용 표출"                           → 인-앱 마크다운 뷰어 + 편집 모달 (manager+)
 *
 * 페이지 구성:
 *   · 좌측: 매뉴얼 메타 (코드/버전/시행일/검수상태) + 원본 파일 + GCS 업로드
 *   · 우측: 마크다운 본문 (뷰 모드) + 편집 모달 (manager+ 권한)
 *   · 하단: 버전 이력
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

const btnPrimary: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer' }
const btnSecondary: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgGray, color: COLORS.textSecondary, cursor: 'pointer' }
const btnSuccess: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgGreen, color: COLORS.success, cursor: 'pointer' }
const btnDanger: React.CSSProperties = { ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgRed, color: COLORS.danger, cursor: 'pointer' }

interface DocumentDetail {
  id: string
  doc_code: string
  title: string
  content_md: string | null
  current_version_no: string | null
  effective_date: string | null
  status: string
  is_master_verified: number
  file_url: string | null
  gcs_object_path: string | null
}

interface DocumentMeta {
  id: string
  doc_code: string
  doc_type: string
  title: string
  parent_manual_code: string | null
  description: string | null
  retention_years: number
  classification: string
  is_master_verified: number
  verified_by_user_name: string | null
  verified_by_cpo_at: string | null
  file_url: string | null
  status: string
}

interface DocumentVersion {
  id: string
  version_no: string
  effective_date: string
  superseded_date: string | null
  change_summary: string | null
  approved_by: string | null
  status: string
}

const MANUAL_DESCRIPTIONS: Record<string, { intro: string; chapters?: string[] }> = {
  'RIDE-PMP': {
    intro: '라이드케어 「개인정보보호 내부관리계획서」 통합본 V1.0 — 시행 2026.05.20. 9장 27조 + 별첨 7 RIDE-PLAN-2026.',
    chapters: ['제1장 총칙', '제2장 내부관리계획 수립', '제3장 책임자 의무·책임', '제4장 기술적·관리적 보호조치 (제10~19조)', '제5장 정기적 자체감사', '제6장 개인정보보호 교육', '제7장 수탁사 관리', '제8장 유출통지·침해대응', '제9장 개인정보의 파기'],
  },
  'RIDE-M01': { intro: '개인정보 유출 대응 매뉴얼 — 서식 F-M01-01~06 포함. 24시간 통지 의무 (제25조 ①) 실행 절차.' },
  'RIDE-M02': { intro: '라이드케어 비상대응 매뉴얼 (BCP) — 서식 F-M02-01~04. 시스템 장애 + 비상상황 대응.' },
  'RIDE-M03': { intro: '정보보호 교육관리 매뉴얼 — 서식 없음. 연 2회 정기교육 + 신규자 교육 절차.' },
  'RIDE-M04': { intro: '정보보호 점검관리 매뉴얼 — 서식 없음. 분기 정보보안 점검 + 반기 자체감사 체크리스트.' },
  'RIDE-M05': { intro: '개인정보 파기 절차·확인 매뉴얼 — 서식 F-M05-01~04. 분기 파기 + CPO 승인 + 3년 보존.' },
  'RIDE-M06': { intro: '개인정보 취급 단말기 반출관리 매뉴얼 — 서식 F-14-1/2. 단말기 지급·반납 관리.' },
}

export default function ManualDetailPage() {
  const params = useParams<{ code: string }>()
  const code = decodeURIComponent(params?.code || '')

  const [user, setUser] = useState<{ id?: string; role?: string } | null>(null)
  const [meta, setMeta] = useState<DocumentMeta | null>(null)
  const [detail, setDetail] = useState<DocumentDetail | null>(null)
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  useEffect(() => { setUser(getStoredUser()) }, [])

  const fetchAll = async () => {
    if (!code) return
    setLoading(true); setError(null)
    try {
      const token = getStoredToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      // 1. meta 조회 (list 에서 code 매칭)
      const metaRes = await fetch(`/api/ride-compliance/documents?type=manual`, { headers, cache: 'no-store' })
      const metaJ = await metaRes.json()
      const found = (metaJ.data || []).find((d: DocumentMeta) => d.doc_code === code)
      if (!found) {
        setError(`매뉴얼 코드 "${code}" 를 찾을 수 없습니다`)
        setLoading(false)
        return
      }
      setMeta(found)

      // 2. content 조회
      const contentRes = await fetch(`/api/ride-compliance/documents/${found.id}/content`, { headers, cache: 'no-store' })
      const contentJ = await contentRes.json()
      if (contentJ.success) {
        setDetail(contentJ.data)
        setEditContent(contentJ.data?.content_md || '')
      }

      // 3. 버전 이력
      const verRes = await fetch(`/api/ride-compliance/document-versions?document_id=${found.id}`, { headers, cache: 'no-store' })
      const verJ = await verRes.json()
      setVersions(verJ.data || [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [code])

  const saveContent = async () => {
    if (!detail) return
    setSaving(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/documents/${detail.id}/content`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ content_md: editContent, revoke_verification: true }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      setEditMode(false)
      await fetchAll()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const isAdminOrMgr = user?.role === 'admin'
  // 실제 manager 권한 확인은 server-side. 본 페이지 편집 버튼은 admin/anyone 노출, server 에서 게이트.

  if (loading) return <div style={{ padding: 40, fontSize: 14, color: COLORS.textSecondary }}>로딩 중…</div>

  if (error) return (
    <div style={{ padding: 40, maxWidth: 760 }}>
      <div style={{ ...GLASS.L3, padding: 24, borderRadius: 12, borderLeft: `4px solid ${COLORS.danger}` }}>
        <h2 style={{ margin: 0, color: COLORS.danger, fontSize: 18 }}>❌ {error}</h2>
        <Link href="/RideCompliance" style={{ color: COLORS.primary, marginTop: 12, display: 'inline-block', fontSize: 13 }}>← 자료실로</Link>
      </div>
    </div>
  )

  if (!meta) return null

  const desc = MANUAL_DESCRIPTIONS[code]
  const verifiedColor = meta.is_master_verified === 1 ? COLORS.success : COLORS.warning

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <Link href="/RideCompliance" style={{ color: COLORS.primary, fontSize: 13, marginBottom: 8, display: 'inline-block' }}>← 라이드 정보보안</Link>
      <h1 style={{ margin: '4px 0 4px', fontSize: 20 }}>📘 {meta.doc_code} · {meta.title}</h1>
      {desc && <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.textSecondary }}>{desc.intro}</p>}

      {/* 좌우 2단 레이아웃 */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
        {/* 좌측: 메타 + 원본 파일 + 버전 이력 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 메타 카드 */}
          <div style={{ ...GLASS.L3, padding: 16, borderRadius: 10 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.textSecondary }}>📋 매뉴얼 정보</h3>
            <MetaRow label="코드" value={meta.doc_code} />
            <MetaRow label="제목" value={meta.title} />
            <MetaRow label="버전" value={detail?.current_version_no || versions[0]?.version_no || 'V1.0'} />
            <MetaRow label="시행일" value={detail?.effective_date || versions[0]?.effective_date || '—'} />
            <MetaRow label="보존" value={`${meta.retention_years}년`} />
            <MetaRow label="등급" value={meta.classification} />
            <MetaRow label="상태" value={
              <span style={{ color: verifiedColor, fontWeight: 600 }}>
                {meta.is_master_verified === 1 ? '✓ 검수 완료' : '⚠ 검수 대기'}
              </span>
            } />
            {meta.verified_by_user_name && (
              <MetaRow label="검수자" value={`${meta.verified_by_user_name} · ${meta.verified_by_cpo_at?.slice(0, 10) || ''}`} />
            )}
          </div>

          {/* 원본 파일 카드 */}
          <div style={{ ...GLASS.L3, padding: 16, borderRadius: 10 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.textSecondary }}>📎 원본 PDF</h3>
            {meta.file_url ? (
              <a href={meta.file_url} target="_blank" rel="noopener" style={{ display: 'block', padding: '8px 10px', background: COLORS.bgBlue, color: COLORS.primary, borderRadius: 6, fontSize: 12, textDecoration: 'none', marginBottom: 8 }}>
                📥 외부 link 열기 (새 탭)
              </a>
            ) : detail?.gcs_object_path ? (
              <button onClick={async () => {
                const token = getStoredToken()
                const res = await fetch(`/api/ride-compliance/upload-url?object_path=${encodeURIComponent(detail.gcs_object_path!)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
                const json = await res.json()
                if (json.success && json.data?.download_url) { window.open(json.data.download_url, '_blank') }
                else { alert(json.error || 'GCS 다운로드 실패') }
              }} style={{ ...btnPrimary, width: '100%', fontSize: 12 }}>📥 GCS 다운로드 (10분 link)</button>
            ) : (
              <div style={{ fontSize: 12, color: COLORS.textMuted, padding: '8px 0' }}>원본 파일 없음</div>
            )}
            {isAdminOrMgr && (
              <button onClick={() => setUploadOpen(true)} style={{ ...btnSecondary, width: '100%', marginTop: 6, fontSize: 12 }}>
                {meta.file_url || detail?.gcs_object_path ? '✎ 원본 갱신' : '📎 원본 등록'}
              </button>
            )}
          </div>

          {/* 버전 이력 */}
          <div style={{ ...GLASS.L3, padding: 16, borderRadius: 10 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.textSecondary }}>📜 버전 이력</h3>
            {versions.length === 0 ? (
              <div style={{ fontSize: 12, color: COLORS.textMuted }}>—</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {versions.map(v => (
                  <div key={v.id} style={{ padding: '6px 8px', borderRadius: 4, background: COLORS.bgGray, fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: COLORS.textPrimary }}>{v.version_no} · {v.effective_date}</div>
                    {v.change_summary && <div style={{ color: COLORS.textSecondary, marginTop: 2 }}>{v.change_summary}</div>}
                    {v.approved_by && <div style={{ color: COLORS.textMuted, marginTop: 2 }}>승인: {v.approved_by}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 장 목차 (해당 시) */}
          {desc?.chapters && (
            <div style={{ ...GLASS.L3, padding: 16, borderRadius: 10 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.textSecondary }}>📑 장 목차</h3>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8, color: COLORS.textSecondary }}>
                {desc.chapters.map((c, i) => <li key={i}>{c}</li>)}
              </ol>
            </div>
          )}
        </div>

        {/* 우측: 본문 */}
        <div style={{ ...GLASS.L3, padding: 20, borderRadius: 10, minHeight: 600 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>📖 본문</h3>
            {isAdminOrMgr && !editMode && (
              <button onClick={() => setEditMode(true)} style={{ ...btnPrimary, marginLeft: 'auto' }}>
                ✎ 본문 편집
              </button>
            )}
            {editMode && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={() => { setEditMode(false); setEditContent(detail?.content_md || '') }} style={btnSecondary}>취소</button>
                <button onClick={saveContent} disabled={saving} style={btnSuccess}>{saving ? '저장 중...' : '✓ 저장 (검수 재요청)'}</button>
              </div>
            )}
          </div>

          {!editMode && (
            <>
              {detail?.content_md ? (
                <pre style={{
                  whiteSpace: 'pre-wrap', wordWrap: 'break-word',
                  fontFamily: '"Pretendard", -apple-system, sans-serif',
                  fontSize: 13, lineHeight: 1.8, color: COLORS.textPrimary,
                  background: COLORS.bgGray, padding: 16, borderRadius: 6,
                  margin: 0, maxHeight: 700, overflowY: 'auto',
                }}>{detail.content_md}</pre>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: COLORS.textSecondary, fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
                  본문 미입력 — 관리자가 「✎ 본문 편집」 으로 매뉴얼 내용을 마크다운으로 등록할 수 있습니다.
                  <div style={{ marginTop: 16, fontSize: 11, color: COLORS.textMuted }}>
                    팁: 매뉴얼 PDF 의 텍스트를 복사해서 붙여넣으세요. 향후 검색·색인·인용 기능 활용 가능.
                  </div>
                </div>
              )}
            </>
          )}

          {editMode && (
            <>
              <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, background: COLORS.bgAmber, fontSize: 12, color: COLORS.textSecondary, borderLeft: `3px solid ${COLORS.warning}` }}>
                💡 본문 편집 시 검수 상태가 자동으로 「검수 대기」 로 되돌아갑니다. CPO 재검수 후 활성화.
              </div>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                style={{
                  width: '100%', height: 600,
                  padding: 14, fontSize: 13, lineHeight: 1.8,
                  fontFamily: 'monospace',
                  border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6,
                  background: COLORS.bgGray,
                  resize: 'vertical',
                }}
                placeholder="# 매뉴얼 제목&#10;&#10;## 제1장&#10;&#10;제1조 (목적)&#10;..."
              />
            </>
          )}
        </div>
      </div>

      {/* 원본 업로드 모달 */}
      {uploadOpen && detail && (
        <UploadModal doc={detail} onClose={() => setUploadOpen(false)} onSaved={() => { setUploadOpen(false); fetchAll() }} />
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

function UploadModal(props: { doc: DocumentDetail; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<'gcs' | 'link'>('link')
  const [externalUrl, setExternalUrl] = useState(props.doc.file_url || '')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState('')

  const saveLink = async () => {
    setSaving(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ doc_code: props.doc.doc_code, file_url: externalUrl, update_file_url_only: true }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      props.onSaved()
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }

  const uploadToGcs = async () => {
    if (!file) { setError('파일을 선택하세요'); return }
    setSaving(true); setError(null); setProgress('1/3 signed URL 발급 중...')
    try {
      const token = getStoredToken()
      // 1. signed URL 발급
      const urlRes = await fetch('/api/ride-compliance/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ doc_code: props.doc.doc_code, original_name: file.name, content_type: file.type || 'application/pdf' }),
      })
      const urlJ = await urlRes.json()
      if (!urlRes.ok || !urlJ.success) {
        if (urlJ.meta?._setup_required) {
          setError(`GCS 미설정 — ${urlJ.meta.guide}`)
        } else { setError(urlJ.error || `HTTP ${urlRes.status}`) }
        return
      }
      setProgress('2/3 GCS 업로드 중...')
      // 2. GCS 직접 업로드
      const putRes = await fetch(urlJ.data.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/pdf' },
        body: file,
      })
      if (!putRes.ok) { setError(`GCS 업로드 실패 (HTTP ${putRes.status})`); return }
      setProgress('3/3 메타데이터 갱신 중...')
      // 3. documents.gcs_object_path 갱신
      const patchRes = await fetch('/api/ride-compliance/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ doc_code: props.doc.doc_code, gcs_object_path: urlJ.data.gcs_object_path, update_file_url_only: true }),
      })
      const patchJ = await patchRes.json()
      if (!patchRes.ok || !patchJ.success) { setError(patchJ.error || 'metadata 갱신 실패'); return }
      props.onSaved()
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }

  return (
    <div onClick={props.onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...GLASS.L1, padding: 24, borderRadius: 12, maxWidth: 600, width: '90vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>📎 원본 등록 — {props.doc.doc_code}</h2>
          <button onClick={props.onClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: COLORS.textSecondary }}>✕</button>
        </div>

        {/* 모드 선택 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          <button onClick={() => setMode('link')} style={mode === 'link' ? btnPrimary : btnSecondary}>🔗 외부 link</button>
          <button onClick={() => setMode('gcs')} style={mode === 'gcs' ? btnPrimary : btnSecondary}>☁️ GCS 업로드</button>
        </div>

        {mode === 'link' && (
          <>
            <div style={{ marginBottom: 8, fontSize: 12, color: COLORS.textSecondary }}>GDrive / Notion / 사내 위키 등 외부 link URL paste:</div>
            <input value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://..."
              style={{ width: '100%', padding: '8px 12px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 13, marginBottom: 12 }} />
            {error && <div style={{ padding: '8px 12px', borderRadius: 6, background: `${COLORS.danger}18`, color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>❌ {error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={props.onClose} style={btnSecondary}>취소</button>
              <button onClick={saveLink} disabled={saving} style={btnPrimary}>{saving ? '저장 중...' : '✓ 저장'}</button>
            </div>
          </>
        )}

        {mode === 'gcs' && (
          <>
            <div style={{ marginBottom: 8, fontSize: 12, color: COLORS.textSecondary }}>PDF 파일 선택 — GCS Cloud Storage 에 직접 업로드:</div>
            <input type="file" accept=".pdf,.docx,.xlsx" onChange={e => setFile(e.target.files?.[0] || null)}
              style={{ width: '100%', padding: '8px 12px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 13, marginBottom: 12 }} />
            {file && (
              <div style={{ padding: '6px 10px', borderRadius: 4, background: COLORS.bgBlue, color: COLORS.primary, fontSize: 11, marginBottom: 12 }}>
                📄 {file.name} · {(file.size / 1024).toFixed(1)} KB
              </div>
            )}
            {progress && <div style={{ padding: '8px 12px', borderRadius: 6, background: COLORS.bgBlue, color: COLORS.primary, fontSize: 12, marginBottom: 12 }}>⏳ {progress}</div>}
            {error && <div style={{ padding: '8px 12px', borderRadius: 6, background: `${COLORS.danger}18`, color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>❌ {error}</div>}
            <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, background: COLORS.bgAmber, fontSize: 11, color: COLORS.textSecondary }}>
              💡 GCS 미설정 시 env 변수 <code>GCS_COMPLIANCE_BUCKET</code> 설정 + Cloud Run service account 에 Storage Object Admin 권한 부여 필요
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={props.onClose} style={btnSecondary}>취소</button>
              <button onClick={uploadToGcs} disabled={saving || !file} style={btnSuccess}>{saving ? '업로드 중...' : '☁️ 업로드'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
