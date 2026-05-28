/**
 * lib/compliance-version-diff.ts
 *
 * Phase 19 — 내규 버전 간 diff (sections 비교).
 *
 * 입력: 두 policy 의 sections list
 * 출력: { added, removed, modified, unchanged } — 카테고리별
 *
 * 매칭 키: section_kind + section_code (예: article/제6조)
 *   · code 없으면 title 기반 fuzzy match (LCS 또는 첫 30자)
 *
 * 비교 대상:
 *   · 추가/삭제/제목변경/본문변경
 *   · user_status (확정/반려) 도 비교
 */

export interface SectionForDiff {
  id: string
  section_kind: string
  section_code: string | null
  title: string
  body_md: string | null
  user_edited_title: string | null
  user_edited_body_md: string | null
  user_status: string
}

export interface DiffEntry {
  status: 'added' | 'removed' | 'modified' | 'unchanged'
  kind: string
  code: string | null
  before?: SectionForDiff
  after?: SectionForDiff
  changes?: {
    title_changed?: boolean
    body_changed?: boolean
    status_changed?: boolean
  }
}

export interface DiffResult {
  entries: DiffEntry[]
  summary: {
    by_kind: Record<string, { added: number; removed: number; modified: number; unchanged: number }>
    total_added: number
    total_removed: number
    total_modified: number
    total_unchanged: number
  }
}

/**
 * section 의 effective title / body (user_edited 우선, 없으면 AI 원본).
 */
function effectiveTitle(s: SectionForDiff): string {
  return (s.user_edited_title || s.title || '').trim()
}
function effectiveBody(s: SectionForDiff): string {
  return (s.user_edited_body_md || s.body_md || '').trim()
}

/**
 * 매칭 키 생성 — section_kind + section_code 우선, code 없으면 title (첫 50자 lowercase).
 */
function matchKey(s: SectionForDiff): string {
  if (s.section_code) return `${s.section_kind}|${s.section_code}`
  return `${s.section_kind}|t:${effectiveTitle(s).substring(0, 50).toLowerCase()}`
}

/**
 * 두 버전의 sections 비교.
 */
export function diffSections(
  before: SectionForDiff[],
  after: SectionForDiff[]
): DiffResult {
  const beforeMap = new Map<string, SectionForDiff>()
  for (const s of before) beforeMap.set(matchKey(s), s)
  const afterMap = new Map<string, SectionForDiff>()
  for (const s of after) afterMap.set(matchKey(s), s)

  const entries: DiffEntry[] = []
  const allKeys = new Set([...beforeMap.keys(), ...afterMap.keys()])

  for (const key of allKeys) {
    const b = beforeMap.get(key)
    const a = afterMap.get(key)
    if (!b && a) {
      entries.push({ status: 'added', kind: a.section_kind, code: a.section_code, after: a })
    } else if (b && !a) {
      entries.push({ status: 'removed', kind: b.section_kind, code: b.section_code, before: b })
    } else if (b && a) {
      const titleChanged = effectiveTitle(b) !== effectiveTitle(a)
      const bodyChanged  = effectiveBody(b)  !== effectiveBody(a)
      const statusChanged = b.user_status !== a.user_status
      if (titleChanged || bodyChanged || statusChanged) {
        entries.push({
          status: 'modified', kind: a.section_kind, code: a.section_code,
          before: b, after: a,
          changes: { title_changed: titleChanged, body_changed: bodyChanged, status_changed: statusChanged },
        })
      } else {
        entries.push({ status: 'unchanged', kind: a.section_kind, code: a.section_code, before: b, after: a })
      }
    }
  }

  // summary
  const byKind: Record<string, { added: number; removed: number; modified: number; unchanged: number }> = {}
  let totalAdded = 0, totalRemoved = 0, totalModified = 0, totalUnchanged = 0
  for (const e of entries) {
    if (!byKind[e.kind]) byKind[e.kind] = { added: 0, removed: 0, modified: 0, unchanged: 0 }
    byKind[e.kind][e.status]++
    if (e.status === 'added') totalAdded++
    else if (e.status === 'removed') totalRemoved++
    else if (e.status === 'modified') totalModified++
    else totalUnchanged++
  }

  // 정렬 — kind 별 (article → attachment → playbook_step → annual_event → screen_spec), 그 안 status (modified → added → removed → unchanged)
  const KIND_ORDER = ['article', 'attachment', 'playbook_step', 'annual_event', 'screen_spec']
  const STATUS_ORDER = ['modified', 'added', 'removed', 'unchanged']
  entries.sort((x, y) => {
    const kx = KIND_ORDER.indexOf(x.kind), ky = KIND_ORDER.indexOf(y.kind)
    if (kx !== ky) return (kx === -1 ? 999 : kx) - (ky === -1 ? 999 : ky)
    const sx = STATUS_ORDER.indexOf(x.status), sy = STATUS_ORDER.indexOf(y.status)
    if (sx !== sy) return sx - sy
    return (x.code || '').localeCompare(y.code || '')
  })

  return {
    entries,
    summary: {
      by_kind: byKind,
      total_added: totalAdded,
      total_removed: totalRemoved,
      total_modified: totalModified,
      total_unchanged: totalUnchanged,
    },
  }
}
