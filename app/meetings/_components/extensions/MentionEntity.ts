import Mention from '@tiptap/extension-mention'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import 'tippy.js/themes/light-border.css'
import MentionList, { type MentionItem, type MentionListRef } from '../MentionList'

// ═══════════════════════════════════════════════════════════════
// MentionEntity — >ERP 엔티티 멘션 (PR-MTG-V2-C-3)
//   · `>` + 키워드 → /api/meetings/mentions/entities?q=
//   · 결과 mixed: 계약 / 차량 / 고객
//   · 선택 시 인라인 mention 노드 (id + label + type attr)
//   · 클릭 → type 별 다른 페이지 이동 (TiptapEditor handleClickOn)
// ═══════════════════════════════════════════════════════════════

const TYPE_ICON: Record<string, string> = {
  contract: '📑', car: '🚗', customer: '👤',
}
const TYPE_LABEL: Record<string, string> = {
  contract: '계약', car: '차량', customer: '고객',
}

let debounceTimer: NodeJS.Timeout | null = null
let abortController: AbortController | null = null

interface EntityItem extends MentionItem {
  entityType: 'contract' | 'car' | 'customer'
}

async function fetchEntities(q: string): Promise<EntityItem[]> {
  if (abortController) abortController.abort()
  abortController = new AbortController()
  try {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('fmi_token') : null
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    const res = await fetch(`/api/meetings/mentions/entities?q=${encodeURIComponent(q)}&limit=12`, {
      headers, signal: abortController.signal,
    })
    if (!res.ok) return []
    const json = await res.json()
    const rows = Array.isArray(json?.data) ? json.data : []
    return rows.map((e: any) => ({
      id: String(e.id),
      label: String(e.label || ''),
      subtitle: [TYPE_LABEL[e.type] || e.type, e.subtitle].filter(Boolean).join(' · '),
      icon: TYPE_ICON[e.type] || '📌',
      entityType: e.type,
    }))
  } catch (e: any) {
    if (e?.name === 'AbortError') return []
    console.warn('[MentionEntity fetch]', e)
    return []
  }
}

export const MentionEntity = Mention.extend({
  name: 'mentionEntity',

  // mention 노드에 type attr 추가 (계약/차량/고객 구분)
  addAttributes() {
    const parent = (this as any).parent?.()
    return {
      ...(parent ?? {}),
      entityType: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-entity-type'),
        renderHTML: (attrs: any) => {
          if (!attrs.entityType) return {}
          return { 'data-entity-type': attrs.entityType }
        },
      },
    }
  },
}).configure({
  HTMLAttributes: {
    class: 'mention mention-entity',
    'data-mention-type': 'entity',
  },
  renderText({ node }) {
    return `>${node.attrs.label ?? node.attrs.id}`
  },
  suggestion: {
    char: '>',
    allowSpaces: false,
    startOfLine: false,
    items: async ({ query }: { query: string }) => {
      return new Promise<EntityItem[]>((resolve) => {
        if (debounceTimer) clearTimeout(debounceTimer)
        const delay = query.length === 0 ? 0 : 180
        debounceTimer = setTimeout(async () => {
          const items = await fetchEntities(query)
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
              command: (item: EntityItem) => props.command({
                id: item.id, label: item.label, entityType: item.entityType,
              }),
              emptyHint: '🔍 일치 ERP 없음 — 계약 고객명 / 차량번호·모델 / 고객 이름·전화',
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
            command: (item: EntityItem) => props.command({
              id: item.id, label: item.label, entityType: item.entityType,
            }),
            emptyHint: '🔍 일치 ERP 없음 — 계약 고객명 / 차량번호·모델 / 고객 이름·전화',
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

export default MentionEntity
