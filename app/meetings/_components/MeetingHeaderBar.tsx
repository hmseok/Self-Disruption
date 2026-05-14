'use client'
import { useState, useEffect } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════
// MeetingHeaderBar — V2 본문 영역 상단 (PR-V2-A)
//   · 제목 inline edit (큰 input, blur 시 저장)
//   · 메타 (유형 / 일시 / 장소 / 주관자 / 상태) inline
//   · 우측: 자동 저장 인디케이터 영역 (placeholder)
// ═══════════════════════════════════════════════════════════════

const TYPE_META: Record<string, { emoji: string; label: string }> = {
  regular:    { emoji: '📅', label: '정기 회의' },
  specific:   { emoji: '📋', label: '특정 회의' },
  one_on_one: { emoji: '👥', label: '1:1 면담' },
  department: { emoji: '🏢', label: '부서별 회의' },
}
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: '✏️ 작성중', color: '#b91c1c', bg: 'rgba(239,68,68,0.10)' },
  published: { label: '✓ 공개',   color: '#15803d', bg: 'rgba(34,197,94,0.10)' },
  archived:  { label: '📦 보관',  color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
}

export interface MeetingMeta {
  title: string
  type: string                          // regular | specific | one_on_one | department
  meeting_date: string | null           // datetime-local form
  duration_min: number | null
  location: string | null
  organizer_id: string | null
  department: string | null
  status: string                        // draft | published | archived
}

interface Props {
  meta: MeetingMeta
  onMetaChange: (patch: Partial<MeetingMeta>) => void
  /** 우측 슬롯 — AutoSaveIndicator + 액션 버튼 (삭제 등) */
  trailing?: React.ReactNode
  /** 편집 가능 */
  editable?: boolean
}

export default function MeetingHeaderBar({ meta, onMetaChange, trailing, editable = true }: Props) {
  const [title, setTitle] = useState(meta.title)
  useEffect(() => { setTitle(meta.title) }, [meta.title])

  const commitTitle = () => {
    const t = title.trim()
    if (t && t !== meta.title) onMetaChange({ title: t })
    else if (!t) setTitle(meta.title) // 빈 제목 reject
  }

  const status = STATUS_META[meta.status] || STATUS_META.draft

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editable ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
              placeholder="회의 제목 (필수)"
              style={{
                width: '100%', fontSize: 26, fontWeight: 800,
                color: COLORS.textPrimary, background: 'transparent',
                border: 'none', outline: 'none', padding: '4px 0',
                whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <h1 style={{ fontSize: 26, fontWeight: 800, color: COLORS.textPrimary, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {meta.title || '(제목 없음)'}
            </h1>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {trailing}
        </div>
      </div>

      {/* 메타 line — type / date / location / status — inline select */}
      <div style={{
        marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        fontSize: 12, color: COLORS.textSecondary,
      }}>
        {/* 유형 */}
        {editable ? (
          <select value={meta.type} onChange={(e) => onMetaChange({ type: e.target.value })}
            style={inlineSelect}>
            {Object.entries(TYPE_META).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
        ) : (
          <span style={inlineTag}>{TYPE_META[meta.type]?.emoji} {TYPE_META[meta.type]?.label}</span>
        )}

        {/* 일시 */}
        {editable ? (
          <input type="datetime-local" value={meta.meeting_date || ''}
            onChange={(e) => onMetaChange({ meeting_date: e.target.value })}
            style={{ ...inlineSelect, padding: '4px 8px' }} />
        ) : (
          <span style={inlineTag}>📆 {meta.meeting_date || '미정'}</span>
        )}

        {/* 시간 (분 단위) */}
        {editable ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>⏱</span>
            <input type="number" value={meta.duration_min || ''}
              onChange={(e) => onMetaChange({ duration_min: Number(e.target.value) || null })}
              placeholder="60"
              title="회의 진행 시간 (분)"
              style={{ ...inlineSelect, width: 64, padding: '4px 8px', textAlign: 'right' }} />
            <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>분</span>
          </span>
        ) : (
          meta.duration_min && <span style={inlineTag}>⏱ {meta.duration_min}분</span>
        )}

        {/* 장소 (오프라인 주소 또는 화상 링크) */}
        {editable ? (
          <input value={meta.location || ''}
            onChange={(e) => onMetaChange({ location: e.target.value })}
            placeholder="📍 회의 장소 또는 화상 링크 (예: 본사 회의실 / Zoom URL)"
            title="회의 장소 — 자유 입력 (주소 검색은 별도 PR)"
            style={{ ...inlineSelect, padding: '4px 8px', minWidth: 240 }} />
        ) : (
          meta.location && <span style={inlineTag}>📍 {meta.location}</span>
        )}

        {/* 상태 */}
        {editable ? (
          <select value={meta.status} onChange={(e) => onMetaChange({ status: e.target.value })}
            style={inlineSelect}>
            <option value="draft">✏️ 작성중</option>
            <option value="published">✓ 공개</option>
            <option value="archived">📦 보관</option>
          </select>
        ) : (
          <span style={{
            ...inlineTag, background: status.bg, color: status.color, border: 'none',
          }}>{status.label}</span>
        )}
      </div>
    </div>
  )
}

const inlineSelect: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  borderRadius: 6,
  border: `1px solid ${COLORS.borderSubtle}`,
  background: GLASS.L1.background,
  color: COLORS.textPrimary,
  fontFamily: 'inherit',
  outline: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const inlineTag: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  borderRadius: 6,
  border: `1px solid ${COLORS.borderSubtle}`,
  background: GLASS.L1.background,
  whiteSpace: 'nowrap',
}
