import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import 'tippy.js/themes/light-border.css'
import SlashCommandMenu, { type SlashItem, type SlashCommandMenuRef } from '../SlashCommandMenu'

// ═══════════════════════════════════════════════════════════════
// SlashCommand — PR-MTG-V2-B TipTap Extension
//   · `/` 입력 → tippy.js popper 메뉴
//   · ReactRenderer 로 SlashCommandMenu mount
//   · 카테고리: 기본 / 미디어  (V2-C 멘션은 별도 트리거 / V2-D 임베드는 후속 카테고리)
// ═══════════════════════════════════════════════════════════════

const allItems: SlashItem[] = [
  // ── 기본 ──
  {
    key: 'h1', title: '제목 1', description: '큰 섹션 제목', icon: 'H₁', category: '기본',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    key: 'h2', title: '제목 2', description: '하위 섹션 제목', icon: 'H₂', category: '기본',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    key: 'h3', title: '제목 3', description: '소제목', icon: 'H₃', category: '기본',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    key: 'p', title: '단락', description: '일반 텍스트', icon: '¶', category: '기본',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    key: 'ul', title: '불릿 목록', description: '• 항목 나열', icon: '•', category: '기본',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    key: 'ol', title: '번호 목록', description: '1. 순서 있는 항목', icon: '1.', category: '기본',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    key: 'todo', title: '체크리스트', description: '☐ 할 일 / 회의 결정 사항', icon: '☑', category: '기본',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    key: 'quote', title: '인용', description: '강조할 발언 / 인용문', icon: '❝', category: '기본',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    key: 'code', title: '코드 블록', description: '코드 / 명령어', icon: '{ }', category: '기본',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    key: 'hr', title: '구분선', description: '섹션 사이 구분', icon: '―', category: '기본',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },

  // ── 미디어 ──
  {
    key: 'image', title: '이미지', description: 'URL 입력으로 이미지 삽입', icon: '🖼', category: '미디어',
    command: ({ editor, range }) => {
      const url = typeof window !== 'undefined' ? window.prompt('이미지 URL 입력 (https://...)') : null
      if (!url) {
        // 사용자 취소 — 슬래시 문자만 제거하지 말고 그대로 두기 위해 deleteRange 생략
        editor.chain().focus().deleteRange(range).run()
        return
      }
      editor.chain().focus().deleteRange(range).setImage({ src: url, alt: '' }).run()
    },
  },
  {
    key: 'table', title: '표', description: '3×3 표 삽입 (행/열 추가는 우클릭 메뉴)', icon: '⊞', category: '미디어',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    },
  },
]

function filterItems(query: string): SlashItem[] {
  const q = (query || '').trim().toLowerCase()
  if (!q) return allItems
  return allItems.filter(it =>
    it.title.toLowerCase().includes(q)
    || (it.description || '').toLowerCase().includes(q)
    || it.key.toLowerCase().includes(q)
  )
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        command: ({ editor, range, props }: any) => {
          // props 는 items 가 반환한 SlashItem 한 개
          props.command({ editor, range })
        },
      } as any,
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...(this.options as any).suggestion,
        items: ({ query }: { query: string }) => filterItems(query),
        render: () => {
          let component: ReactRenderer<SlashCommandMenuRef> | null = null
          let popup: TippyInstance[] | null = null

          return {
            onStart: (props: any) => {
              component = new ReactRenderer(SlashCommandMenu as any, {
                props: {
                  items: props.items,
                  command: (item: SlashItem) => props.command(item),
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
                command: (item: SlashItem) => props.command(item),
              })
              if (!props.clientRect) return
              popup?.[0]?.setProps({
                getReferenceClientRect: props.clientRect as any,
              })
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
      }),
    ]
  },
})

export default SlashCommand
