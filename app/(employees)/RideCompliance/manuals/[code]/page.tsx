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
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { renderMarkdown, extractSections, type MarkdownSection } from '@/lib/simple-markdown'

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
  // Phase 1.4-fix10 — 사용자 통찰 (2026-05-19): "마크다운도 실제처럼 구성 안 됨, 최대한 가깝게"
  // → 진입 시 PDF 모드 기본 (PDF 가 원본 그대로). 마크다운은 검색/anchor/검토 보조용.
  const [viewMode, setViewMode] = useState<'md' | 'pdf'>('pdf')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  // Phase 1.4-fix11 — PDF 다운로드 + 새 버전 업로드 워크플로우
  const [newVersionOpen, setNewVersionOpen] = useState(false)

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

  // Phase 1.4-fix10 — 데이터 로드 완료 후 PDF 자동 로딩 (없으면 마크다운 fallback)
  useEffect(() => {
    if (!meta || !detail) return
    const hasPdf = !!(meta.file_url || detail.gcs_object_path)
    if (hasPdf && !pdfUrl && !pdfLoading) {
      loadPdf().catch(() => { /* graceful */ })
    } else if (!hasPdf) {
      setViewMode('md')  // PDF 없으면 마크다운으로 자동 전환
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [meta?.id, detail?.gcs_object_path, detail?.file_url])

  // Phase 1.4-fix8 — PDF mode 진입 시 GCS signed URL 발급
  const loadPdf = async () => {
    if (pdfUrl) { setViewMode('pdf'); return }  // 이미 발급된 URL 있으면 재사용
    setPdfLoading(true); setPdfError(null)
    try {
      const token = getStoredToken()
      // 외부 link (file_url) 가 있으면 그대로 사용
      if (meta?.file_url) {
        setPdfUrl(meta.file_url)
        setViewMode('pdf')
        setPdfLoading(false)
        return
      }
      // GCS path 가 있으면 signed URL 발급
      if (detail?.gcs_object_path) {
        const res = await fetch(`/api/ride-compliance/upload-url?object_path=${encodeURIComponent(detail.gcs_object_path)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        const json = await res.json()
        if (json.success && json.data?.download_url) {
          setPdfUrl(json.data.download_url)
          setViewMode('pdf')
        } else {
          setPdfError(json.error || 'PDF URL 발급 실패')
        }
      } else {
        setPdfError('원본 PDF 미등록 — 좌측 「📎 원본 등록」 으로 GCS 업로드 또는 외부 link 입력 필요')
      }
    } catch (e) { setPdfError(String(e)) } finally { setPdfLoading(false) }
  }

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
        <Link href="/RideCompliance?tab=documents" style={{ color: COLORS.primary, marginTop: 12, display: 'inline-block', fontSize: 13 }}>← 자료실로</Link>
      </div>
    </div>
  )

  if (!meta) return null

  const desc = MANUAL_DESCRIPTIONS[code]
  const verifiedColor = meta.is_master_verified === 1 ? COLORS.success : COLORS.warning

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <Link href="/RideCompliance?tab=documents" style={{ color: COLORS.primary, fontSize: 13, marginBottom: 8, display: 'inline-block' }}>← 라이드 정보보안</Link>
      <h1 style={{ margin: '4px 0 4px', fontSize: 20 }}>📘 {meta.doc_code} · {meta.title}</h1>
      {desc && <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.textSecondary }}>{desc.intro}</p>}

      {/* 좌우 2단 레이아웃 */}
      {/* Phase 1.4-fix6 — flex 레이아웃 + 명시적 height: 양쪽 column 자체 스크롤 안정화 */}
      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 160px)' }}>
        {/* 좌측: 메타 + 원본 파일 + 버전 이력 + 섹션 목차 — 자체 스크롤 */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', paddingRight: 4 }}>
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

          {/* Phase 1.4-fix2 — 본문 자동 섹션 목차 (사용자 통찰 — 별첨/일반규정/서식 자동 분리) */}
          {detail?.content_md && (
            <SectionTOC content={detail.content_md} />
          )}

          {/* 장 목차 (해당 시 — 매뉴얼 description 의 static chapters fallback) */}
          {desc?.chapters && !detail?.content_md && (
            <div style={{ ...GLASS.L3, padding: 16, borderRadius: 10 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.textSecondary }}>📑 장 목차 (참고)</h3>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8, color: COLORS.textSecondary }}>
                {desc.chapters.map((c, i) => <li key={i}>{c}</li>)}
              </ol>
            </div>
          )}
        </div>

        {/* 우측: 자동 검토 banner + 본문 — flex column + 자체 스크롤 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        {/* Phase 1.4 — 자동 검토 패널 */}
        {detail?.content_md && (
          <AutoReviewPanel docId={detail.id} docCode={detail.doc_code} verified={meta.is_master_verified === 1} canApprove={isAdminOrMgr} onSaved={fetchAll} />
        )}

        <div style={{ ...GLASS.L3, padding: 20, borderRadius: 10, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexShrink: 0 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>{viewMode === 'pdf' ? '📄 PDF 원본' : '📖 본문 (마크다운)'}</h3>
            {/* Phase 1.4-fix8 — mode 토글 (마크다운 / PDF) */}
            {!editMode && detail && (
              <div style={{ display: 'flex', gap: 0, border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, overflow: 'hidden' }}>
                <button onClick={() => setViewMode('md')}
                  style={{ ...BTN.sm, border: 'none', cursor: 'pointer',
                    background: viewMode === 'md' ? COLORS.bgBlue : 'transparent',
                    color: viewMode === 'md' ? COLORS.primary : COLORS.textSecondary,
                  }}>📖 마크다운</button>
                <button onClick={() => loadPdf()} disabled={pdfLoading}
                  style={{ ...BTN.sm, border: 'none', cursor: 'pointer',
                    background: viewMode === 'pdf' ? COLORS.bgBlue : 'transparent',
                    color: viewMode === 'pdf' ? COLORS.primary : COLORS.textSecondary,
                  }}>{pdfLoading ? '⏳ 로딩…' : '📄 PDF'}</button>
              </div>
            )}
            {isAdminOrMgr && !editMode && viewMode === 'md' && (
              <button onClick={() => setEditMode(true)} style={{ ...btnPrimary, marginLeft: 'auto' }}>
                ✎ 본문 편집
              </button>
            )}
            {/* Phase 1.4-fix11 — PDF 모드 액션 (다운로드 + 새 버전 업로드) */}
            {!editMode && viewMode === 'pdf' && pdfUrl && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <a href={pdfUrl} download
                  style={{ ...btnSecondary, fontSize: 11, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                  title="현재 PDF 를 다운로드 (외부 도구로 편집·서명·하이라이트)"
                >📥 PDF 다운로드</a>
                {isAdminOrMgr && (
                  <button onClick={() => setNewVersionOpen(true)}
                    style={{ ...btnPrimary, fontSize: 11 }}
                    title="편집한 PDF 를 새 버전 (V1.1) 으로 업로드 — 기존 V1.0 은 superseded, CPO 재검수 필요"
                  >📤 새 버전 업로드</button>
                )}
              </div>
            )}
            {editMode && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={() => { setEditMode(false); setEditContent(detail?.content_md || '') }} style={btnSecondary}>취소</button>
                <button onClick={saveContent} disabled={saving} style={btnSuccess}>{saving ? '저장 중...' : '✓ 저장 (검수 재요청)'}</button>
              </div>
            )}
          </div>
          {pdfError && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: `${COLORS.danger}18`, color: COLORS.danger, fontSize: 12, marginBottom: 8, flexShrink: 0 }}>
              ❌ {pdfError}
            </div>
          )}

          {/* Phase 1.4-fix8 — PDF mode 시 iframe 임베드 (브라우저 내장 PDF 뷰어) */}
          {viewMode === 'pdf' && !editMode && pdfUrl && (
            <iframe
              src={pdfUrl}
              title={`${meta?.doc_code || ''} PDF`}
              style={{
                flex: 1, width: '100%', minHeight: 0,
                border: `1px solid ${COLORS.borderSubtle}`,
                borderRadius: 8, background: '#fff',
              }}
            />
          )}
          {viewMode === 'pdf' && !pdfUrl && !pdfError && !pdfLoading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.textMuted, fontSize: 13 }}>
              📄 PDF 로딩 중...
            </div>
          )}

          {viewMode === 'md' && !editMode && (
            <>
              {detail?.content_md ? (
                <div id="manual-body-scroll" style={{
                  fontFamily: '"Pretendard", -apple-system, sans-serif',
                  color: COLORS.textPrimary,
                  background: '#fff', padding: '24px 32px', borderRadius: 8,
                  border: `1px solid ${COLORS.borderSubtle}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  // Phase 1.4-fix6 — flex column 의 자식이므로 flex: 1 + overflowY: auto 로 자체 스크롤
                  flex: 1, overflowY: 'auto', minHeight: 0,
                }}>
                  <style>{`
                    [id^="md-1-"], [id^="md-2-"], [id^="md-3-"], [id^="md-4-"] { scroll-margin-top: 16px; }
                  `}</style>
                  {renderMarkdown(detail.content_md)}
                </div>
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
        </div>{/* /우측 wrapper */}
      </div>

      {/* 원본 업로드 모달 */}
      {uploadOpen && detail && (
        <UploadModal doc={detail} onClose={() => setUploadOpen(false)} onSaved={() => { setUploadOpen(false); fetchAll() }} />
      )}

      {/* Phase 1.4-fix11 — 새 버전 업로드 모달 (PDF 다운로드 → 외부 편집 → 신규 V1.1 등록) */}
      {newVersionOpen && detail && (
        <NewVersionUploadModal
          doc={detail}
          versions={versions}
          onClose={() => setNewVersionOpen(false)}
          onSaved={() => {
            setNewVersionOpen(false)
            setPdfUrl(null)  // 캐시 무효화 — 다음 PDF 로딩 시 새 버전으로 signed URL 재발급
            fetchAll()
          }}
        />
      )}
    </div>
  )
}

// Phase 1.4-fix11 — 버전 문자열 (V1.0) → 다음 minor 버전 (V1.1) 계산
function nextVersionNo(versions: DocumentVersion[]): string {
  if (!versions || versions.length === 0) return 'V1.0'
  // 최신 (effective_date desc, 첫번째) 의 버전 파싱
  const latest = versions[0].version_no || 'V1.0'
  const m = latest.match(/^V(\d+)\.(\d+)$/i)
  if (!m) return 'V1.1'
  const major = parseInt(m[1], 10)
  const minor = parseInt(m[2], 10)
  return `V${major}.${minor + 1}`
}

function MetaRow(props: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', padding: '4px 0', fontSize: 12 }}>
      <span style={{ width: 70, color: COLORS.textMuted, flexShrink: 0 }}>{props.label}</span>
      <span style={{ color: COLORS.textPrimary }}>{props.value}</span>
    </div>
  )
}

// ────────── Phase 1.4 자동 검토 패널 ──────────
interface LintIssue {
  rule_id: string
  category: 'legal' | 'security' | 'quality'
  severity: 'error' | 'warning' | 'info'
  label: string
  description: string
  hint?: string
  passed: boolean
}

interface ReviewData {
  lint: {
    score: number
    total_rules: number
    passed: number
    errors: number
    warnings: number
    infos: number
    issues: LintIssue[]
    passed_issues: LintIssue[]
  }
  actions: {
    total_actions: number
    by_type: Record<string, number>
    actions: Array<{
      type: string
      frequency?: string
      months?: number[]
      category?: string
      description: string
      form_codes?: string[]
      legal_reference?: string
      responsible?: string
    }>
    extraction_method: string
  }
  llm_debug?: Record<string, unknown>
}

// ────────── Phase 1.4-fix2 섹션 목차 (사용자 통찰 — 별첨/일반규정/서식 자동 분리) ──────────
// 본문 마크다운에서 H1·H2 자동 추출 → 타입별 색상 + 클릭 시 anchor scroll
function SectionTOC(props: { content: string }) {
  // Phase 1.4-fix5 — 중복 제거 (같은 title 첫 번째만 유지). PDF 추출 시 페이지 헤더 반복 발생 회피.
  const sections = useMemo<MarkdownSection[]>(() => {
    const all = extractSections(props.content, 2)
    const seen = new Set<string>()
    const uniq: MarkdownSection[] = []
    for (const s of all) {
      const key = s.title.trim()
      if (seen.has(key)) continue
      seen.add(key)
      uniq.push(s)
    }
    return uniq
  }, [props.content])
  const [filter, setFilter] = useState<'all' | 'chapter' | 'attachment' | 'form' | 'general'>('all')

  const counts = useMemo(() => ({
    chapter: sections.filter(s => s.type === 'chapter').length,
    attachment: sections.filter(s => s.type === 'attachment').length,
    form: sections.filter(s => s.type === 'form').length,
    general: sections.filter(s => s.type === 'general').length,
    other: sections.filter(s => s.type === 'other').length,
  }), [sections])

  const filtered = useMemo(() => {
    if (filter === 'all') return sections
    return sections.filter(s => s.type === filter)
  }, [sections, filter])

  if (sections.length === 0) return null

  const TYPE_LABEL: Record<MarkdownSection['type'], { label: string; color: string; emoji: string }> = {
    chapter:    { label: '본문',     color: COLORS.primary,    emoji: '📖' },
    attachment: { label: '별첨',     color: '#7c3aed',          emoji: '📎' },
    form:       { label: '서식',     color: COLORS.success,    emoji: '📝' },
    general:    { label: '일반규정', color: COLORS.textSecondary, emoji: '📋' },
    other:      { label: '기타',     color: COLORS.textMuted,  emoji: '·' },
  }

  const scrollTo = (id: string) => {
    // Phase 1.4-fix6 — getBoundingClientRect 기반 정확 계산 (offsetTop 은 offsetParent 기준이라 부정확)
    const container = document.getElementById('manual-body-scroll')
    const el = document.getElementById(id)
    if (!el || !container) {
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const cRect = container.getBoundingClientRect()
    const eRect = el.getBoundingClientRect()
    const top = eRect.top - cRect.top + container.scrollTop - 16
    container.scrollTo({ top, behavior: 'smooth' })
  }

  return (
    <div style={{ ...GLASS.L3, padding: 14, borderRadius: 10 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 13, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
        📑 섹션 목차
        <span style={{ marginLeft: 'auto', fontSize: 10, color: COLORS.textMuted, fontWeight: 500 }}>{sections.length}건</span>
      </h3>

      {/* 타입 필터 chips */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {[
          { v: 'all' as const, label: `전체 ${sections.length}` },
          ...(counts.chapter > 0    ? [{ v: 'chapter' as const,    label: `📖 본문 ${counts.chapter}` }] : []),
          ...(counts.attachment > 0 ? [{ v: 'attachment' as const, label: `📎 별첨 ${counts.attachment}` }] : []),
          ...(counts.form > 0       ? [{ v: 'form' as const,       label: `📝 서식 ${counts.form}` }] : []),
          ...(counts.general > 0    ? [{ v: 'general' as const,    label: `📋 일반 ${counts.general}` }] : []),
        ].map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            style={{ ...BTN.sm, fontSize: 10, border: 'none',
              background: filter === f.v ? COLORS.bgBlue : COLORS.bgGray,
              color: filter === f.v ? COLORS.primary : COLORS.textSecondary, cursor: 'pointer',
            }}>{f.label}</button>
        ))}
      </div>

      {/* 섹션 list — Phase 1.4-fix3: maxHeight 제거, 전체 list 표시 (자체 스크롤 X) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 10, textAlign: 'center', fontSize: 11, color: COLORS.textMuted }}>해당 타입 섹션 없음</div>
        ) : filtered.map(s => {
          const t = TYPE_LABEL[s.type]
          return (
            <button key={s.id} onClick={() => scrollTo(s.id)}
              style={{
                padding: '6px 8px', borderRadius: 4, border: 'none',
                background: 'transparent', cursor: 'pointer', textAlign: 'left',
                display: 'flex', gap: 6, alignItems: 'flex-start',
                fontSize: 11, lineHeight: 1.5,
                paddingLeft: 8 + (s.level - 1) * 10,  // H1=8, H2=18 들여쓰기
              }}
              onMouseEnter={e => { e.currentTarget.style.background = COLORS.bgGray }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ color: t.color, fontWeight: 700, flexShrink: 0, fontSize: 10 }}>{t.emoji}</span>
              <span style={{ color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.title}
              </span>
            </button>
          )
        })}
      </div>
      <p style={{ marginTop: 8, marginBottom: 0, fontSize: 10, color: COLORS.textMuted, lineHeight: 1.5 }}>
        클릭 시 본문에서 해당 위치로 스크롤. 검수 시 본문/별첨/서식 단위로 확인 가능.
      </p>
    </div>
  )
}

// 컴팩트 banner + 풀스크린 모달
function AutoReviewPanel(props: { docId: string; docCode: string; verified: boolean; canApprove: boolean; onSaved: () => void }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [approving, setApproving] = useState(false)
  const [approveMsg, setApproveMsg] = useState<string | null>(null)

  const runReview = async (useLlm: boolean) => {
    setLoading(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/documents/${props.docId}/single-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ use_llm: useLlm }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      setResult(json.data)
      setModalOpen(true)
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  const approve = async () => {
    if (!confirm('CPO 승인 + 스케줄 자동 적용? (추출된 액션이 tasks 로 자동 생성됩니다)')) return
    setApproving(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/documents/${props.docId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ approve_note: '자동 검토 통과 후 승인' }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      const sched = json.data?.schedule
      setApproveMsg(`✅ 승인 완료 — 신규 task ${sched?.applied_tasks ?? 0}건 자동 생성${sched?.skipped_duplicates ? ` · 중복 스킵 ${sched.skipped_duplicates}` : ''}`)
      setModalOpen(false)
      props.onSaved()
    } catch (e) { setError(String(e)) } finally { setApproving(false) }
  }

  const scoreColor = (result?.lint.score ?? 100) >= 90 ? COLORS.success
                   : (result?.lint.score ?? 0) >= 70 ? COLORS.warning : COLORS.danger

  return (
    <>
      {/* 컴팩트 banner — 본문 영역 위에 작게 */}
      <div style={{ ...GLASS.L3, padding: '10px 14px', borderRadius: 10, borderLeft: `4px solid ${COLORS.info}`, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 13, color: COLORS.textPrimary }}>🔍 자동 검토</h3>
        {result ? (
          <>
            <span style={{ padding: '2px 8px', borderRadius: 8, background: `${scoreColor}18`, color: scoreColor, fontSize: 11, fontWeight: 700 }}>점수 {result.lint.score}/100</span>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>
              lint {result.lint.passed}/{result.lint.total_rules} 통과 · 액션 {result.actions.total_actions} 추출 ({result.actions.extraction_method})
            </span>
            <button onClick={() => setModalOpen(true)} style={{ ...btnPrimary, fontSize: 11 }}>📊 상세 보기</button>
            <button onClick={() => runReview(true)} disabled={loading} style={{ ...btnSecondary, fontSize: 11 }}>🔄 재검토 + LLM</button>
            {props.canApprove && !props.verified && (
              <button onClick={approve} disabled={approving} style={{ ...btnSuccess, fontSize: 11 }}>
                {approving ? '승인 중…' : '✓ 승인 + 스케줄'}
              </button>
            )}
          </>
        ) : (
          <>
            <span style={{ fontSize: 11, color: COLORS.textMuted, flex: '1 1 auto' }}>
              본문에서 법적/보안 14 룰 + 액션 자동 추출
            </span>
            <button onClick={() => runReview(false)} disabled={loading} style={{ ...btnSecondary, fontSize: 11 }}>
              {loading ? '검토 중…' : '🔍 1차 검토 (정규식)'}
            </button>
            <button onClick={() => runReview(true)} disabled={loading} style={{ ...btnPrimary, fontSize: 11 }}>
              {loading ? '검토 중…' : '🤖 2차 검토 (+LLM)'}
            </button>
          </>
        )}
      </div>

      {error && <div style={{ padding: '8px 12px', borderRadius: 6, background: `${COLORS.danger}18`, color: COLORS.danger, fontSize: 12, marginBottom: 8 }}>❌ {error}</div>}
      {approveMsg && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: COLORS.bgGreen, color: COLORS.success, fontSize: 12, marginBottom: 8 }}>
          {approveMsg}
        </div>
      )}

      {/* 풀스크린 모달 — 상세 결과 */}
      {modalOpen && result && (
        <ReviewDetailModal
          docCode={props.docCode}
          result={result}
          canApprove={props.canApprove && !props.verified}
          onApprove={approve}
          onRerun={() => runReview(true)}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

// ────────── 자동 검토 풀스크린 모달 ──────────
type ActionRow = ReviewData['actions']['actions'][number]

function ReviewDetailModal(props: {
  docCode: string
  result: ReviewData
  canApprove: boolean
  onApprove: () => void
  onRerun: () => void
  onClose: () => void
}) {
  const [actionTypeFilter, setActionTypeFilter] = useState<string>('all')
  const [lintSeverityFilter, setLintSeverityFilter] = useState<string>('all')

  const { lint, actions } = props.result

  const filteredActions: ActionRow[] = useMemo(() => {
    if (actionTypeFilter === 'all') return actions.actions
    return actions.actions.filter(a => a.type === actionTypeFilter)
  }, [actions.actions, actionTypeFilter])

  const filteredIssues = useMemo(() => {
    if (lintSeverityFilter === 'all') return lint.issues
    if (lintSeverityFilter === 'passed') return lint.passed_issues
    return lint.issues.filter(i => i.severity === lintSeverityFilter)
  }, [lint.issues, lint.passed_issues, lintSeverityFilter])

  const scoreColor = lint.score >= 90 ? COLORS.success : lint.score >= 70 ? COLORS.warning : COLORS.danger

  return (
    <div onClick={props.onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        ...GLASS.L1, padding: 0, borderRadius: 12, maxWidth: 1400, width: '95vw',
        height: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* 헤더 */}
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${COLORS.borderSubtle}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>🔍 자동 검토 결과 — {props.docCode}</h2>
          <span style={{ padding: '3px 10px', borderRadius: 10, background: `${scoreColor}18`, color: scoreColor, fontSize: 13, fontWeight: 700 }}>
            점수 {lint.score}/100
          </span>
          <span style={{ fontSize: 11, color: COLORS.textMuted }}>
            엔진 {actions.extraction_method} · lint {lint.passed}/{lint.total_rules} · 액션 {actions.total_actions}건
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={props.onRerun} style={{ ...btnSecondary, fontSize: 11 }}>🔄 재검토</button>
            {props.canApprove && <button onClick={props.onApprove} style={{ ...btnSuccess, fontSize: 11 }}>✓ 승인 + 스케줄</button>}
            <button onClick={props.onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: COLORS.textSecondary }}>✕</button>
          </div>
        </div>

        {/* 본문 — 좌(lint) 우(actions) */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, minHeight: 0 }}>
          {/* Lint 결과 */}
          <div style={{ padding: 16, borderRight: `1px solid ${COLORS.borderSubtle}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 13, color: COLORS.textPrimary }}>📋 Lint 14 규칙</h3>
              <span style={{ fontSize: 11, color: COLORS.danger }}>error {lint.errors}</span>
              <span style={{ fontSize: 11, color: COLORS.warning }}>warning {lint.warnings}</span>
              <span style={{ fontSize: 11, color: COLORS.info }}>info {lint.infos}</span>
              <span style={{ fontSize: 11, color: COLORS.success }}>passed {lint.passed}</span>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
              {(['all', 'error', 'warning', 'info', 'passed'] as const).map(s => (
                <button key={s} onClick={() => setLintSeverityFilter(s)}
                  style={{ ...BTN.sm, border: 'none',
                    background: lintSeverityFilter === s ? COLORS.bgBlue : COLORS.bgGray,
                    color: lintSeverityFilter === s ? COLORS.primary : COLORS.textSecondary, cursor: 'pointer',
                  }}>{s}</button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
              {filteredIssues.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>해당 필터의 항목 없음</div>
              ) : filteredIssues.map((iss, i) => {
                const sevColor = iss.passed ? COLORS.success
                  : iss.severity === 'error' ? COLORS.danger
                  : iss.severity === 'warning' ? COLORS.warning : COLORS.info
                return (
                  <div key={i} style={{ padding: 10, borderRadius: 6, background: '#fff', borderLeft: `3px solid ${sevColor}`, border: `1px solid ${COLORS.borderSubtle}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ color: sevColor }}>{iss.passed ? '✓' : '⚠'} [{iss.rule_id}]</span>
                      <span>{iss.label}</span>
                      <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 'auto' }}>{iss.category}</span>
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5 }}>{iss.description}</div>
                    {iss.hint && !iss.passed && (
                      <div style={{ fontSize: 11, color: COLORS.warning, marginTop: 4, padding: '4px 8px', background: COLORS.bgAmber, borderRadius: 4 }}>💡 {iss.hint}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 추출 액션 */}
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 13, color: COLORS.textPrimary }}>🎯 추출 액션 ({actions.total_actions}건)</h3>
              <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                task {actions.by_type.task || 0} · form {actions.by_type.form || 0} · notify {actions.by_type.notify || 0} · policy {actions.by_type.policy || 0}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
              {[
                { v: 'all', label: '전체' },
                { v: 'task', label: 'task' },
                { v: 'form', label: 'form' },
                { v: 'notify', label: 'notify' },
                { v: 'policy', label: 'policy' },
              ].map(f => (
                <button key={f.v} onClick={() => setActionTypeFilter(f.v)}
                  style={{ ...BTN.sm, border: 'none',
                    background: actionTypeFilter === f.v ? COLORS.bgBlue : COLORS.bgGray,
                    color: actionTypeFilter === f.v ? COLORS.primary : COLORS.textSecondary, cursor: 'pointer',
                  }}>{f.label}</button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: COLORS.textMuted }}>{filteredActions.length} 건</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
              {filteredActions.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>해당 필터의 액션 없음</div>
              ) : filteredActions.map((a, i) => {
                const typeColor = a.type === 'task' ? COLORS.primary : a.type === 'form' ? COLORS.info : a.type === 'notify' ? COLORS.warning : COLORS.textSecondary
                return (
                  <div key={i} style={{ padding: 10, borderRadius: 6, background: '#fff', borderLeft: `3px solid ${typeColor}`, border: `1px solid ${COLORS.borderSubtle}` }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ color: typeColor, fontWeight: 700 }}>[{a.type}]</span>
                      {a.frequency && <span style={{ color: COLORS.textMuted }}>{a.frequency}{a.months && a.months.length > 0 ? ` (${a.months.join(',')}월)` : ''}</span>}
                      {a.category && <span style={{ color: COLORS.textSecondary }}>· {a.category}</span>}
                      {a.responsible && <span style={{ color: COLORS.info, marginLeft: 'auto' }}>👤 {a.responsible}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textPrimary, marginBottom: 4, lineHeight: 1.5 }}>{a.description}</div>
                    {(a.legal_reference || (a.form_codes && a.form_codes.length > 0)) && (
                      <div style={{ fontSize: 10, color: COLORS.textMuted, display: 'flex', gap: 8 }}>
                        {a.legal_reference && <span>📜 {a.legal_reference}</span>}
                        {a.form_codes && a.form_codes.length > 0 && <span>📝 {a.form_codes.join(', ')}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div style={{ padding: '10px 20px', borderTop: `1px solid ${COLORS.borderSubtle}`, fontSize: 11, color: COLORS.textMuted, display: 'flex', alignItems: 'center', gap: 8 }}>
          💡 1차 정규식 → 2차 LLM → 승인. 승인 시 task 자동 생성 (액션 [task] 만). [form][notify][policy] 는 참고 정보.
          <span style={{ marginLeft: 'auto' }}>📂 review_results.history 에 자동 누적 (최신 10건)</span>
        </div>
      </div>
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

// ────────── Phase 1.4-fix11 새 버전 업로드 모달 ──────────
// 워크플로우:
//   1. 자동 계산된 다음 버전 (V1.0 → V1.1) 표시
//   2. PDF 파일 선택 + 개정 사항 입력
//   3. signed URL 발급 → GCS PUT → POST document-versions (activate=true)
//   4. document-versions API 가 자동:
//      · 기존 active 버전 → superseded
//      · documents.current_version_id + current_version_no + gcs_object_path 갱신
//      · is_master_verified=0 reset + status=pending (CPO 재검수 필요)
function NewVersionUploadModal(props: {
  doc: DocumentDetail
  versions: DocumentVersion[]
  onClose: () => void
  onSaved: () => void
}) {
  const computedNext = useMemo(() => nextVersionNo(props.versions), [props.versions])
  const [versionNo, setVersionNo] = useState(computedNext)
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [changeSummary, setChangeSummary] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState('')

  const submit = async () => {
    if (!file) { setError('PDF 파일을 선택하세요'); return }
    if (!versionNo.match(/^V\d+\.\d+$/i)) { setError('버전 형식: V1.1 (V숫자.숫자)'); return }
    if (!effectiveDate) { setError('시행일 필수'); return }
    if (!changeSummary.trim()) { setError('개정 사항 (change summary) 필수'); return }

    setSaving(true); setError(null)
    try {
      const token = getStoredToken()

      // 1. signed URL 발급
      setProgress('1/3 GCS signed URL 발급 중...')
      const urlRes = await fetch('/api/ride-compliance/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          doc_code: props.doc.doc_code,
          original_name: `${versionNo}_${file.name}`,
          content_type: file.type || 'application/pdf',
        }),
      })
      const urlJ = await urlRes.json()
      if (!urlRes.ok || !urlJ.success) {
        setError(urlJ.error || `signed URL 발급 실패 (HTTP ${urlRes.status})`)
        return
      }

      // 2. GCS 직접 업로드
      setProgress('2/3 GCS 업로드 중...')
      const putRes = await fetch(urlJ.data.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/pdf' },
        body: file,
      })
      if (!putRes.ok) {
        setError(`GCS 업로드 실패 (HTTP ${putRes.status})`)
        return
      }

      // 3. document-versions POST — activate=true + gcs_object_path 동기화 + 검수 reset
      setProgress('3/3 버전 등록 + 검수 reset 중...')
      const verRes = await fetch('/api/ride-compliance/document-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          document_id: props.doc.id,
          version_no: versionNo,
          effective_date: effectiveDate,
          change_summary: changeSummary,
          gcs_object_path: urlJ.data.gcs_object_path,
          activate: true,
          reset_master_verification: true,
        }),
      })
      const verJ = await verRes.json()
      if (!verRes.ok || !verJ.success) {
        setError(verJ.error || `버전 등록 실패 (HTTP ${verRes.status})`)
        return
      }

      // 성공
      props.onSaved()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={props.onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...GLASS.L1, padding: 24, borderRadius: 12, maxWidth: 640, width: '92vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>📤 새 버전 업로드 — {props.doc.doc_code}</h2>
          <button onClick={props.onClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: COLORS.textSecondary }}>✕</button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.6 }}>
          📥 다운로드 → 외부 도구 (Acrobat·Preview·Word 등) 로 자유롭게 편집·서명·하이라이트 → 📤 새 버전으로 업로드.
          기존 <b>{props.doc.current_version_no || 'V1.0'}</b> 은 자동 <span style={{ color: COLORS.textMuted }}>superseded</span>,
          새 버전은 <b style={{ color: COLORS.warning }}>검수 대기</b> 로 reset (CPO 재검수 필요).
        </p>

        {/* 버전 번호 + 시행일 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>새 버전 번호</label>
            <input value={versionNo} onChange={e => setVersionNo(e.target.value)} placeholder="V1.1"
              style={{ width: '100%', padding: '8px 10px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 13, fontFamily: 'monospace' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>시행일</label>
            <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 13 }} />
          </div>
        </div>

        {/* 개정 사항 */}
        <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>개정 사항 (change summary) *</label>
        <textarea value={changeSummary} onChange={e => setChangeSummary(e.target.value)}
          placeholder="예: 제15조 백업 주기 월 1회 → 주 1회 강화, F-M01-03 통지서 양식 갱신"
          style={{ width: '100%', height: 70, padding: 10, border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 12, marginBottom: 10, resize: 'vertical', fontFamily: 'inherit' }} />

        {/* 파일 선택 */}
        <label style={{ fontSize: 11, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>새 PDF 파일 *</label>
        <input type="file" accept=".pdf" onChange={e => setFile(e.target.files?.[0] || null)}
          style={{ width: '100%', padding: '8px 10px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 12, marginBottom: 10 }} />
        {file && (
          <div style={{ padding: '6px 10px', borderRadius: 4, background: COLORS.bgBlue, color: COLORS.primary, fontSize: 11, marginBottom: 10 }}>
            📄 {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
          </div>
        )}

        {progress && <div style={{ padding: '8px 12px', borderRadius: 6, background: COLORS.bgBlue, color: COLORS.primary, fontSize: 12, marginBottom: 10 }}>⏳ {progress}</div>}
        {error && <div style={{ padding: '8px 12px', borderRadius: 6, background: `${COLORS.danger}18`, color: COLORS.danger, fontSize: 12, marginBottom: 10 }}>❌ {error}</div>}

        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: COLORS.bgAmber, fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.6 }}>
          💡 업로드 완료 후 자동 처리:
          <br />· 기존 <b>{props.doc.current_version_no || 'V1.0'}</b> → <span style={{ color: COLORS.textMuted }}>superseded</span> (이력 보존)
          <br />· 신규 <b>{versionNo}</b> → <span style={{ color: COLORS.success }}>active</span> (즉시 표시)
          <br />· <b>검수 대기</b> 로 reset — CPO 임성민 이사 재검수 후 활성
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={props.onClose} style={btnSecondary}>취소</button>
          <button onClick={submit} disabled={saving || !file || !changeSummary.trim()} style={btnSuccess}>
            {saving ? '처리 중...' : `📤 ${versionNo} 등록`}
          </button>
        </div>
      </div>
    </div>
  )
}
