import Mention from '@tiptap/extension-mention'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import 'tippy.js/themes/light-border.css'
import MentionList, { type MentionItem, type MentionListRef } from '../MentionList'

// ═══════════════════════════════════════════════════════════════
// MentionEmployee — @직원 멘션 (PR-MTG-V2-C-1)
//   · `@` + 이름/부서 입력 → /api/meetings/mentions/profiles?q= 검색
//   · 선택 시 인라인 mention 노드 (id + label) 삽입
//   · 클릭 시 향후 hover 카드 또는 직원 페이지 이동 (별도 PR)
// ═══════════════════════════════════════════════════════════════

let debounceTimer: NodeJS.Timeout | null = null
let abortController: AbortController | null = null

async function fetchEmployees(q: string): Promise<MentionItem[]> {
  if (abortController) abortController.abort()
  abortController = new AbortController()
  try {
    // 인증 헤더 — localStorage 의 fmi_token
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('fmi_token') : null
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    const res = await fetch(`/api/meetings/mentions/employees?q=${encodeURIComponent(q)}&limit=10`, {
      headers, signal: abortController.signal,
    })
    if (!res.ok) return []
    const json = await res.json()
    const rows = Array.isArray(json?.data) ? json.data : []
    return rows.map((e: any) => ({
      id: String(e.id),
      label: String(e.name || ''),
      // 부서 · 직급/그룹 · 고용형태 — 사용자 「그룹별 기준」 표출
      subtitle: [
        e.department,
        e.position || e.group_label,
        e.employment_type,
      ].filter(Boolean).join(' · ') || undefined,
      icon: '👤',
    }))
  } catch (e: any) {
    if (e?.name === 'AbortError') return []
    console.warn('[MentionEmployee fetch]', e)
    return []
  }
}

export const MentionEmployee = Mention.extend({
  name: 'mentionEmployee',
}).configure({
  HTMLAttributes: {
    class: 'mention mention-employee',
    'data-mention-type': 'employee',
  },
  renderText({ node }) {
    return `@${node.attrs.label ?? node.attrs.id}`
  },
  // renderHTML 은 default 사용 — HTMLAttributes 가 mergeAttributes 로 처리됨
  // node.attrs.id 는 data-id 로, label 은 텍스트 콘텐츠로 들어감 (Mention default)
  suggestion: {
    char: '@',
    allowSpaces: false,
    startOfLine: false,
    items: async ({ query }: { query: string }) => {
      // debounce — 빈 쿼리는 즉시 (초기 상위 10)
      return new Promise<MentionItem[]>((resolve) => {
        if (debounceTimer) clearTimeout(debounceTimer)
        const delay = query.length === 0 ? 0 : 180
        debounceTimer = setTimeout(async () => {
          const items = await fetchEmployees(query)
          resolve(items)
        }, delay)
      })
    },
    render: () => {
      let component: ReactRenderer<MentionListRef> | null = null
      let popup: TippyInstance[] | null = null

      return {
        onStart: (props: any) => {
          component = new ReactRenderer(MentionList as any, {
            props: {
              items: props.items,
              command: (item: MentionItem) => props.command({ id: item.id, label: item.label }),
              emptyHint: '🔍 일치 직원 없음 — 이름 / 부서 / 직책 / 그룹 검색',
            },
            editor: props.editor,
          })
          if (!props.clientRect) return
          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as any,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            offset: [0, 8],
            animation: false,
            theme: 'light-border',
            maxWidth: 'none',
          })
        },
        onUpdate: (props: any) => {
          component?.updateProps({
            items: props.items,
            command: (item: MentionItem) => props.command({ id: item.id, label: item.label }),
            emptyHint: '🔍 일치 직원 없음 — 이름 / 부서 / 직책 / 그룹 검색',
          })
          if (!props.clientRect) return
          popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect as any })
        },
        onKeyDown: (props: any) => {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide()
            return true
          }
          return component?.ref?.onKeyDown?.({ event: props.event }) ?? false
        },
        onExit: () => {
          popup?.[0]?.destroy()
          component?.destroy()
          popup = null
          component = null
        },
      }
    },
  },
})

export default MentionEmployee
