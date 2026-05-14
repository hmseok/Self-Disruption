import type { JSONContent } from '@tiptap/react'

// ═══════════════════════════════════════════════════════════════
// v1ToV2Body — V1 meeting_minutes 섹션을 V2 body JSON (TipTap doc) 으로 변환
// PR-MTG-V2-F (2026-05-13)
//
// V1 구조: meeting_minutes row 들 — { section_type, order_no, title, content, attachment_url }
// V2 구조: TipTap JSON — { type: 'doc', content: [{ type: 'heading' | 'paragraph' | ... }] }
// ═══════════════════════════════════════════════════════════════

export interface V1Minute {
  id?: string
  section_type?: string                  // agenda | decision | note | attachment
  order_no?: number
  title?: string | null
  content?: string | null
  attachment_url?: string | null
}

interface SectionGroup {
  key: 'agenda' | 'decision' | 'note' | 'attachment'
  heading: string
  items: V1Minute[]
}

const SECTION_ORDER: SectionGroup['key'][] = ['agenda', 'decision', 'note', 'attachment']
const SECTION_HEADINGS: Record<SectionGroup['key'], string> = {
  agenda: '📋 안건',
  decision: '✓ 결정 사항',
  note: '📝 메모',
  attachment: '📎 첨부',
}

function emptyDoc(): JSONContent {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

function textNode(text: string): JSONContent {
  return { type: 'text', text }
}

function heading(level: 2 | 3, text: string): JSONContent {
  return {
    type: 'heading',
    attrs: { level },
    content: [textNode(text)],
  }
}

function paragraph(text?: string): JSONContent {
  if (!text) return { type: 'paragraph' }
  return {
    type: 'paragraph',
    content: [textNode(text)],
  }
}

function linkParagraph(label: string, url: string): JSONContent {
  return {
    type: 'paragraph',
    content: [
      {
        type: 'text',
        text: label || url,
        marks: [{ type: 'link', attrs: { href: url, target: '_blank' } }],
      },
    ],
  }
}

/**
 * V1 섹션들을 V2 TipTap doc 으로 변환.
 *
 * @param minutes meeting_minutes row 배열 (정렬 불필요 — 내부에서 order_no 정렬)
 * @returns TipTap JSONContent (doc node)
 */
export function v1ToV2Body(minutes: V1Minute[]): JSONContent {
  if (!minutes || minutes.length === 0) return emptyDoc()

  // ── 1) 섹션별 그룹화 (order_no 정렬) ──
  const groups: Record<SectionGroup['key'], V1Minute[]> = {
    agenda: [], decision: [], note: [], attachment: [],
  }
  const sorted = [...minutes].sort((a, b) => (a.order_no || 0) - (b.order_no || 0))
  for (const m of sorted) {
    const t = (m.section_type as SectionGroup['key']) || 'note'
    if (groups[t]) groups[t].push(m)
    else groups.note.push(m)
  }

  // ── 2) 각 섹션을 TipTap content 로 ──
  const content: JSONContent[] = []
  for (const key of SECTION_ORDER) {
    const items = groups[key]
    if (!items.length) continue

    // 섹션 헤더 (H2)
    content.push(heading(2, SECTION_HEADINGS[key]))

    for (const item of items) {
      // 항목 제목 (있으면 H3)
      const title = (item.title || '').trim()
      if (title) content.push(heading(3, title))

      // 첨부 — URL 우선 처리
      if (key === 'attachment' && item.attachment_url) {
        content.push(linkParagraph(title || item.attachment_url, item.attachment_url))
        continue
      }

      // 내용 — 줄바꿈으로 단락 분리
      const text = (item.content || '').trim()
      if (text) {
        const lines = text.split(/\r?\n/)
        for (const line of lines) {
          const t = line.trim()
          if (t) content.push(paragraph(t))
        }
      } else if (!title) {
        // 제목/내용 둘 다 비어있으면 빈 단락
        content.push(paragraph())
      }
    }
  }

  if (content.length === 0) return emptyDoc()
  return { type: 'doc', content }
}

/**
 * 기존 body 끝에 V1 변환 결과를 append.
 *
 * @param existing 기존 body (null 또는 doc)
 * @param minutes V1 섹션 데이터
 * @returns 병합된 doc
 */
export function appendV1ToBody(existing: JSONContent | null, minutes: V1Minute[]): JSONContent {
  const v1Doc = v1ToV2Body(minutes)
  if (!existing || existing.type !== 'doc' || !Array.isArray(existing.content)) {
    return v1Doc
  }
  // existing content + 구분선 + v1 content
  const v1Content = Array.isArray(v1Doc.content) ? v1Doc.content : []
  return {
    type: 'doc',
    content: [
      ...existing.content,
      { type: 'horizontalRule' },
      ...v1Content,
    ],
  }
}
