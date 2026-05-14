import Mention from '@tiptap/extension-mention'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import 'tippy.js/themes/light-border.css'
import MentionList, { type MentionItem, type MentionListRef } from '../MentionList'

// ═══════════════════════════════════════════════════════════════
// MentionMeeting — #회의 멘션 (PR-MTG-V2-C-2)
//   · `#` + 제목/안건/요약 → /api/meetings/mentions/meetings?q=
//   · 선택 시 인라인 mention 노드 (id + label 회의 제목)
//   · 클릭 → /meetings/[id] (TiptapEditor handleClickOn)
// ═══════════════════════════════════════════════════════════════

const TYPE_EMOJI: Record<string, string> = {
  regular: '📅', specific: '📋', one_on_one: '👥', department: '🏢',
}

let debounceTimer: NodeJS.Timeout | null = null
let abortController: AbortController | null = null

async function fetchMeetings(q: string): Promise<MentionItem[]> {
  if (abortController) abortController.abort()
  abortController = new AbortController()
  try {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('fmi_token') : null
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    const res = await fetch(`/api/meetings/mentions/meetings?q=${encodeURIComponent(q)}&limit=10`, {
      headers, signal: abortController.signal,
    })
    if (!res.ok) return []
    const json = await res.json()
    const rows = Array.isArray(json?.data) ? json.data : []
    return rows.map((m: any) => {
      const date = m.meeting_date ? String(m.meeting_date).slice(0, 10) : ''
      const sub = [date, m.organizer_name].filter(Boolean).join(' · ')
      return {
        id: String(m.id),
        label: String(m.title || '(제목 없음)'),
        subtitle: sub || undefined,
        icon: TYPE_EMOJI[m.type] || '📋',
      }
    })
  } catch (e: any) {
    if (e?.name === 'AbortError') return []
    console.warn('[MentionMeeting fetch]', e)
    return []
  }
}

export const MentionMeeting = Mention.extend({
  name: 'mentionMeeting',
}).configure({
  HTMLAttributes: {
    class: 'mention mention-meeting',
    'data-mention-type': 'meeting',
  },
  renderText({ node }) {
    return `#${node.attrs.label ?? node.attrs.id}`
  },
  suggestion: {
    char: '#',
    allowSpaces: false,
    startOfLine: false,
    items: async ({ query }: { query: string }) => {
      return new Promise<MentionItem[]>((resolve) => {
        if (debounceTimer) clearTimeout(debounceTimer)
        const delay = query.length === 0 ? 0 : 180
        debounceTimer = setTimeout(async () => {
          const items = await fetchMeetings(query)
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
              emptyHint: '🔍 일치 회의 없음 — 제목 / 안건 / 요약 검색',
            },
            editor: props.editor,
          })
          if (!props.clientRect) return
          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as any,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true, interactive: true,
            trigger: 'manual', placement: 'bottom-start',
            offset: [0, 8], animation: false, theme: 'light-border', maxWidth: 'none',
          })
        },
        onUpdate: (props: any) => {
          component?.updateProps({
            items: props.items,
            command: (item: MentionItem) => props.command({ id: item.id, label: item.label }),
            emptyHint: '🔍 일치 회의 없음 — 제목 / 안건 / 요약 검색',
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
          popup = null; component = null
        },
      }
    },
  },
})

export default MentionMeeting
