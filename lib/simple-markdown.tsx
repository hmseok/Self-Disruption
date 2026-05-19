/**
 * lib/simple-markdown.tsx
 *
 * 경량 마크다운 → React 노드 변환기.
 * Phase 1.3-G2 — react-markdown 미설치 환경용 자체 파서.
 *
 * 지원:
 *   · # H1, ## H2, ### H3, #### H4
 *   · **bold**, `inline code`
 *   · 단락 (빈 줄로 구분)
 *   · ─── 수평선 (--- or ===)
 *   · - / * / · 불릿 리스트
 *   · 1. 2. 3. 번호 리스트
 *   · 표 (| col | col |)
 *
 * 매뉴얼 본문 정돈 표시용 — PDF 문서 형식에 가깝게 시각 정렬.
 */

import React from 'react'

interface Style {
  h1?: React.CSSProperties
  h2?: React.CSSProperties
  h3?: React.CSSProperties
  h4?: React.CSSProperties
  p?: React.CSSProperties
  ul?: React.CSSProperties
  li?: React.CSSProperties
  hr?: React.CSSProperties
  code?: React.CSSProperties
  table?: React.CSSProperties
  th?: React.CSSProperties
  td?: React.CSSProperties
}

const DEFAULT_STYLES: Required<Style> = {
  h1: { fontSize: 24, fontWeight: 800, margin: '32px 0 14px', paddingBottom: 8, borderBottom: '2px solid rgba(0,0,0,0.1)', color: '#1e293b' },
  h2: { fontSize: 19, fontWeight: 700, margin: '28px 0 12px', paddingBottom: 6, borderBottom: '1px solid rgba(0,0,0,0.08)', color: '#1e293b' },
  h3: { fontSize: 15, fontWeight: 700, margin: '22px 0 8px', color: '#1e293b' },
  h4: { fontSize: 13, fontWeight: 700, margin: '16px 0 6px', color: '#475569' },
  p: { fontSize: 13, lineHeight: 1.85, margin: '0 0 12px', color: '#1e293b' },
  ul: { margin: '0 0 12px', paddingLeft: 22, fontSize: 13, lineHeight: 1.85, color: '#1e293b' },
  li: { marginBottom: 4 },
  hr: { border: 'none', borderTop: '1px solid rgba(0,0,0,0.08)', margin: '20px 0' },
  code: { background: 'rgba(0,0,0,0.05)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace', fontSize: 12 },
  table: { borderCollapse: 'collapse', margin: '12px 0', fontSize: 12, width: '100%' },
  th: { padding: '6px 10px', border: '1px solid rgba(0,0,0,0.15)', background: 'rgba(0,0,0,0.04)', fontWeight: 700, textAlign: 'left' },
  td: { padding: '6px 10px', border: '1px solid rgba(0,0,0,0.1)', verticalAlign: 'top' },
}

// Phase 1.4-fix4 — 섹션 타입별 본문 헤더 색상 (사용자 통찰 2026-05-19):
// "본문 내부에서도 종류별로 구분"
const SECTION_TYPE_DECOR: Record<SectionType, { color: string; bg: string; emoji: string; label: string }> = {
  chapter:    { color: '#3b6eb5', bg: '#eff6ff', emoji: '📖', label: '본문' },
  attachment: { color: '#7c3aed', bg: '#f5f3ff', emoji: '📎', label: '별첨' },
  form:       { color: '#10b981', bg: '#f0fdf4', emoji: '📝', label: '서식' },
  general:    { color: '#475569', bg: '#f8fafc', emoji: '📋', label: '일반규정' },
  other:      { color: '#94a3b8', bg: 'transparent', emoji: '·',  label: '기타' },
}

// ───────────────────────────────────────────────────────────
// Phase 1.4-fix2 — 매뉴얼 본문 자동 섹션 추출 (사용자 통찰 2026-05-19):
// "내부계획서 별첨섹션·일반규정·다른 양식 등 섹션 구분 → 검수에 도움"
// ───────────────────────────────────────────────────────────

export type SectionType = 'chapter' | 'attachment' | 'form' | 'general' | 'other'

export interface MarkdownSection {
  id: string             // anchor id (md-{level}-{slug-{key}})
  level: number          // H1=1, H2=2, ...
  title: string          // 헤더 본문
  type: SectionType
  index: number          // 본문 내 순서 (0부터)
}

/** 한글 + 영문 + 숫자 + 일부 기호만 남기고 slug 생성 */
function headerSlug(content: string, fallbackKey: number): string {
  const cleaned = content
    .replace(/[\s ]+/g, '-')
    .replace(/[^a-zA-Z0-9가-힣\-_]/g, '')
    .toLowerCase()
    .substring(0, 60)
  return cleaned.length > 0 ? `${cleaned}-${fallbackKey}` : `n${fallbackKey}`
}

/** 헤더 본문에서 섹션 타입 자동 추론 */
function inferSectionType(title: string): SectionType {
  if (/^제\s*\d+\s*장|^제[1-9]\d*장/.test(title)) return 'chapter'
  if (/^별첨\s*\d+|^별첨/.test(title)) return 'attachment'
  if (/^서식\s+F-|^F-M\d{2}-\d{2}|^F-\d{2}|^F-14-\d/.test(title)) return 'form'
  if (/총칙|용어\s*정의|적용\s*범위|일반\s*규정/.test(title)) return 'general'
  return 'other'
}

/**
 * 마크다운 본문에서 H1~H2 헤더 위치·타입 자동 추출.
 * 매뉴얼 페이지의 좌측 「📑 섹션 목차」 사이드바용.
 *
 * @param maxLevel  추출할 최대 헤더 레벨 (기본 2 — H1·H2 만)
 */
export function extractSections(text: string, maxLevel = 2): MarkdownSection[] {
  if (!text || !text.trim()) return []
  const lines = text.split('\n')
  const sections: MarkdownSection[] = []
  let key = 0
  let idx = 0

  for (const line of lines) {
    const trimmed = line.trim()
    const match = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      key++  // renderMarkdown 의 key++ 와 동일 카운터 (id 매칭)
      if (level <= maxLevel) {
        const title = match[2]
        sections.push({
          id: `md-${level}-${headerSlug(title, key)}`,
          level,
          title,
          type: inferSectionType(title),
          index: idx++,
        })
      }
    }
  }
  return sections
}

/** inline 마크다운 — **bold**, `code` */
function renderInline(text: string, keyPrefix = ''): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let remaining = text
  let k = 0
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/)
    const codeMatch = remaining.match(/`([^`]+)`/)
    const matches: { idx: number; len: number; node: React.ReactNode }[] = []
    if (boldMatch?.index !== undefined) matches.push({
      idx: boldMatch.index, len: boldMatch[0].length,
      node: <strong key={`${keyPrefix}b${k++}`}>{boldMatch[1]}</strong>,
    })
    if (codeMatch?.index !== undefined) matches.push({
      idx: codeMatch.index, len: codeMatch[0].length,
      node: <code key={`${keyPrefix}c${k++}`} style={DEFAULT_STYLES.code}>{codeMatch[1]}</code>,
    })
    if (matches.length === 0) {
      nodes.push(remaining)
      break
    }
    matches.sort((a, b) => a.idx - b.idx)
    const m = matches[0]
    if (m.idx > 0) nodes.push(remaining.substring(0, m.idx))
    nodes.push(m.node)
    remaining = remaining.substring(m.idx + m.len)
  }
  return nodes
}

/** 전체 마크다운 본문 → React 노드 */
export function renderMarkdown(text: string, customStyle?: Style): React.ReactNode {
  if (!text || !text.trim()) return null
  const styles = { ...DEFAULT_STYLES, ...customStyle }
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '') {
      i++
      continue
    }

    if (/^(-{3,}|={3,})$/.test(trimmed)) {
      nodes.push(<hr key={`hr${key++}`} style={styles.hr} />)
      i++
      continue
    }

    const headerMatch = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (headerMatch) {
      const level = headerMatch[1].length
      const content = headerMatch[2]
      const baseStyle = level === 1 ? styles.h1 : level === 2 ? styles.h2 : level === 3 ? styles.h3 : styles.h4
      const Tag = (`h${level}` as 'h1' | 'h2' | 'h3' | 'h4')
      const headerId = `md-${level}-${headerSlug(content, key)}`

      // Phase 1.4-fix4 — 섹션 타입별 색상·이모지·borderLeft tint (H1/H2 만 적용)
      const secType = level <= 2 ? inferSectionType(content) : null
      const decor = secType ? SECTION_TYPE_DECOR[secType] : null
      const headerStyle: React.CSSProperties = decor && secType !== 'other'
        ? {
            ...baseStyle,
            color: decor.color,
            background: decor.bg,
            borderLeft: `4px solid ${decor.color}`,
            padding: level === 1 ? '12px 16px 8px' : '10px 14px 6px',
            borderRadius: 6,
            borderBottom: 'none',  // tint 박스로 충분 — borderBottom 제거
          }
        : baseStyle

      const headerContent = decor && secType !== 'other'
        ? [
            <span key="emoji" style={{ marginRight: 8, fontSize: '0.9em' }}>{decor.emoji}</span>,
            <span key="label" style={{
              display: 'inline-block', padding: '1px 7px', borderRadius: 8,
              background: decor.color, color: '#fff',
              fontSize: '0.55em', fontWeight: 700, verticalAlign: 'middle',
              marginRight: 8,
            }}>{decor.label}</span>,
            ...renderInline(content, `h${key}-`),
          ]
        : renderInline(content, `h${key}-`)

      nodes.push(React.createElement(Tag, { key: `h${key++}`, id: headerId, style: headerStyle }, headerContent))
      i++
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*[-:|\s]+\|?\s*$/.test(lines[i + 1])) {
      const tableRows: string[][] = []
      const headers = line.split('|').map(s => s.trim()).filter(s => s.length > 0)
      tableRows.push(headers)
      i += 2
      while (i < lines.length && lines[i].includes('|')) {
        const cols = lines[i].split('|').map(s => s.trim()).filter(s => s.length > 0)
        if (cols.length === 0) break
        tableRows.push(cols)
        i++
      }
      nodes.push(
        <table key={`tbl${key++}`} style={styles.table}>
          <thead>
            <tr>{tableRows[0].map((h, j) => <th key={j} style={styles.th}>{renderInline(h, `th${key}-${j}-`)}</th>)}</tr>
          </thead>
          <tbody>
            {tableRows.slice(1).map((row, ri) => (
              <tr key={ri}>{row.map((c, ci) => <td key={ci} style={styles.td}>{renderInline(c, `td${key}-${ri}-${ci}-`)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )
      continue
    }

    const isBullet = /^[-*·]\s+/.test(trimmed)
    const isNumbered = /^\d+\.\s+/.test(trimmed)
    if (isBullet || isNumbered) {
      const items: string[] = []
      while (i < lines.length) {
        const t = lines[i].trim()
        if (isBullet && /^[-*·]\s+/.test(t)) {
          items.push(t.replace(/^[-*·]\s+/, ''))
          i++
        } else if (isNumbered && /^\d+\.\s+/.test(t)) {
          items.push(t.replace(/^\d+\.\s+/, ''))
          i++
        } else if (t === '') {
          break
        } else {
          break
        }
      }
      const Tag = isBullet ? 'ul' : 'ol'
      nodes.push(React.createElement(Tag, { key: `l${key++}`, style: styles.ul }, items.map((item, j) => (
        <li key={j} style={styles.li}>{renderInline(item, `li${key}-${j}-`)}</li>
      ))))
      continue
    }

    const paraLines: string[] = [line]
    let j = i + 1
    while (j < lines.length) {
      const t = lines[j].trim()
      if (t === '' || /^#{1,4}\s/.test(t) || /^[-*·]\s+/.test(t) || /^\d+\.\s+/.test(t) || /^(-{3,}|={3,})$/.test(t) || (lines[j].includes('|') && j + 1 < lines.length && /^\s*\|?\s*[-:|\s]+\|?\s*$/.test(lines[j + 1]))) {
        break
      }
      paraLines.push(lines[j])
      j++
    }
    const paraText = paraLines.join('\n')
    nodes.push(<p key={`p${key++}`} style={styles.p}>{renderInline(paraText, `p${key}-`)}</p>)
    i = j
  }

  return <>{nodes}</>
}
