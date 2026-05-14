'use client'
import { useEditor, EditorContent, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import SlashCommand from './extensions/SlashCommand'
import MentionEmployee from './extensions/MentionEmployee'
import MentionMeeting from './extensions/MentionMeeting'
import MentionEntity from './extensions/MentionEntity'
import { useEffect, useRef } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════
// TiptapEditor — PR-MTG-V2-A 기본 + V2-B 슬래시/이미지/표
//   · StarterKit + Placeholder + TaskList + Link
//   · V2-B 추가: Image / Table / SlashCommand (슬래시 명령)
//   · 풀페이지 본문용 — onChange debounce 는 부모(MeetingsLayoutV2)가 책임
//   · SSR 안전 (immediatelyRender: false)
//   · @멘션 / ERP 임베드 는 PR-V2-C / V2-D 에서 확장
// ═══════════════════════════════════════════════════════════════

export interface TiptapEditorProps {
  /** 초기 본문 JSON — null 이면 빈 본문 */
  value: JSONContent | null
  /** 본문 변경 시 호출 (onUpdate — debounce 는 부모) */
  onChange?: (json: JSONContent) => void
  /** 편집 가능 */
  editable?: boolean
  /** 빈 본문일 때 placeholder */
  placeholder?: string
  /** 외부에서 강제 reload (예: 협업 conflict 후 server 본문 reload) */
  reloadKey?: string | number
}

const EMPTY_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

export default function TiptapEditor({
  value,
  onChange,
  editable = true,
  placeholder = '회의 본문을 자유롭게 작성하세요. / 입력으로 블록 메뉴 (제목/체크/표/이미지/...)',
  reloadKey,
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // history는 협업(PR-V2-E) 도입 시 Collaboration 으로 교체 — A에서는 기본 history
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return '제목 입력...'
          return placeholder
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      // PR-V2-B 추가 ────────────────────────────────────────────
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: 'tiptap-image' },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: 'tiptap-table' },
      }),
      TableRow,
      TableHeader,
      TableCell,
      SlashCommand,
      MentionEmployee,
      MentionMeeting,
      MentionEntity,
    ],
    editorProps: {
      // PR-V2-C-4 — 멘션 클릭 시 페이지 이동
      handleClickOn(view, pos, node, _nodePos, _event, direct) {
        if (!direct) return false
        const type = node.type.name
        if (type === 'mentionEmployee') {
          const id = node.attrs?.id
          if (id && typeof window !== 'undefined') {
            // PR-V2-C-Ride: ride_employees 인사 마스터 페이지 (/hr/people) 로 이동
            // focus 강조는 /hr/people 페이지가 별도로 처리 (별도 PR — 메인 세션 위임)
            window.open(`/hr/people?focus=${encodeURIComponent(String(id))}`, '_blank', 'noopener')
          }
          return true
        }
        if (type === 'mentionMeeting') {
          const id = node.attrs?.id
          if (id && typeof window !== 'undefined') {
            window.location.href = `/meetings/${encodeURIComponent(String(id))}`
          }
          return true
        }
        if (type === 'mentionEntity') {
          const id = node.attrs?.id
          const entityType = node.attrs?.entityType
          if (id && entityType && typeof window !== 'undefined') {
            const pathMap: Record<string, string> = {
              contract: '/contracts',
              car: '/cars',
              customer: '/customers',
            }
            const base = pathMap[entityType]
            if (base) {
              window.open(`${base}?focus=${encodeURIComponent(String(id))}`, '_blank', 'noopener')
            }
          }
          return true
        }
        return false
      },
    },
    content: value ?? EMPTY_DOC,
    editable,
    // Next.js SSR 회피 — client 마운트 후 렌더
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (!onChange) return
      onChange(editor.getJSON())
    },
  })

  // 외부 value 변경 시 editor 동기화 (예: 페이지 진입 시 server 본문 로드)
  const lastValueRef = useRef<string>('')
  useEffect(() => {
    if (!editor) return
    const next = JSON.stringify(value ?? EMPTY_DOC)
    if (next === lastValueRef.current) return
    // editor 안의 현재 값이 다르면 setContent (커서 위치 보존을 위해 emitUpdate=false)
    const current = JSON.stringify(editor.getJSON())
    if (current !== next) {
      editor.commands.setContent(value ?? EMPTY_DOC, { emitUpdate: false })
    }
    lastValueRef.current = next
  }, [editor, value, reloadKey])

  // editable 동기화
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable)
    }
  }, [editor, editable])

  return (
    <div style={{
      ...GLASS.L4,
      borderRadius: 14,
      padding: '24px 32px',
      minHeight: 480,
      // 본문 영역은 넓게 — 노션 식 max-width 800
    }}>
      <style jsx global>{`
        .tiptap-meetings .ProseMirror {
          outline: none;
          min-height: 420px;
          line-height: 1.7;
          font-size: 15px;
          color: ${COLORS.textPrimary};
          font-family: inherit;
        }
        .tiptap-meetings .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: ${COLORS.textMuted};
          pointer-events: none;
          height: 0;
        }
        .tiptap-meetings .ProseMirror h1 { font-size: 26px; font-weight: 800; margin: 18px 0 10px; line-height: 1.25; color: ${COLORS.textPrimary}; }
        .tiptap-meetings .ProseMirror h2 { font-size: 21px; font-weight: 700; margin: 16px 0 8px; line-height: 1.3; color: ${COLORS.textPrimary}; }
        .tiptap-meetings .ProseMirror h3 { font-size: 17px; font-weight: 700; margin: 14px 0 6px; line-height: 1.35; color: ${COLORS.textPrimary}; }
        .tiptap-meetings .ProseMirror p { margin: 6px 0; }
        .tiptap-meetings .ProseMirror ul, .tiptap-meetings .ProseMirror ol { margin: 6px 0; padding-left: 24px; }
        .tiptap-meetings .ProseMirror ul li { list-style: disc; }
        .tiptap-meetings .ProseMirror ol li { list-style: decimal; }
        .tiptap-meetings .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 4px; }
        .tiptap-meetings .ProseMirror ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: flex-start; }
        .tiptap-meetings .ProseMirror ul[data-type="taskList"] li > label { margin-top: 4px; flex-shrink: 0; }
        .tiptap-meetings .ProseMirror ul[data-type="taskList"] li > div { flex: 1; }
        .tiptap-meetings .ProseMirror blockquote { border-left: 3px solid ${COLORS.primary}; padding: 4px 14px; margin: 10px 0; color: ${COLORS.textSecondary}; font-style: italic; background: ${COLORS.primary}0A; border-radius: 0 6px 6px 0; }
        .tiptap-meetings .ProseMirror code { background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 4px; font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 0.9em; }
        .tiptap-meetings .ProseMirror pre { background: rgba(0,0,0,0.85); color: #fff; padding: 14px 18px; border-radius: 8px; overflow-x: auto; margin: 12px 0; }
        .tiptap-meetings .ProseMirror pre code { background: none; padding: 0; color: inherit; }
        .tiptap-meetings .ProseMirror a { color: ${COLORS.primary}; text-decoration: underline; cursor: pointer; }
        .tiptap-meetings .ProseMirror hr { border: none; border-top: 1px solid rgba(0,0,0,0.1); margin: 16px 0; }
        .tiptap-meetings .ProseMirror strong { font-weight: 700; }
        .tiptap-meetings .ProseMirror em { font-style: italic; }
        .tiptap-meetings .ProseMirror s { text-decoration: line-through; opacity: 0.7; }

        /* V2-B Image */
        .tiptap-meetings .ProseMirror img.tiptap-image {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 12px auto;
          border-radius: 8px;
          box-shadow: 0 4px 14px rgba(0,0,0,0.08);
        }
        .tiptap-meetings .ProseMirror img.ProseMirror-selectednode {
          outline: 2px solid ${COLORS.primary};
        }

        /* V2-B Table */
        .tiptap-meetings .ProseMirror table.tiptap-table {
          border-collapse: collapse;
          margin: 12px 0;
          overflow: hidden;
          table-layout: fixed;
          width: 100%;
        }
        .tiptap-meetings .ProseMirror table.tiptap-table td,
        .tiptap-meetings .ProseMirror table.tiptap-table th {
          border: 1px solid rgba(0,0,0,0.12);
          padding: 8px 10px;
          vertical-align: top;
          position: relative;
          min-width: 60px;
          font-size: 14px;
        }
        .tiptap-meetings .ProseMirror table.tiptap-table th {
          background: ${COLORS.primary}10;
          font-weight: 700;
          text-align: left;
        }
        .tiptap-meetings .ProseMirror table.tiptap-table .selectedCell:after {
          z-index: 2; position: absolute; content: "";
          left: 0; right: 0; top: 0; bottom: 0;
          background: ${COLORS.primary}1F; pointer-events: none;
        }
        .tiptap-meetings .ProseMirror table.tiptap-table .column-resize-handle {
          position: absolute; right: -2px; top: 0; bottom: -2px; width: 4px;
          background: ${COLORS.primary}; pointer-events: none;
        }

        /* Tippy popper (슬래시 명령) — 본 페이지 한정 */
        .tippy-box[data-theme~='light-border'] {
          background: transparent; box-shadow: none;
        }
        .tippy-box[data-theme~='light-border'] > .tippy-content {
          padding: 0;
        }

        /* V2-C 멘션 노드 — 공통 */
        .tiptap-meetings .ProseMirror .mention {
          display: inline-block;
          padding: 1px 6px;
          margin: 0 1px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 0.95em;
          line-height: 1.4;
          cursor: pointer;
          user-select: none;
          transition: background 0.12s;
        }
        /* 직원 멘션 — primary (blue) */
        .tiptap-meetings .ProseMirror .mention-employee {
          background: ${COLORS.primary}1F;
          color: ${COLORS.primary};
        }
        .tiptap-meetings .ProseMirror .mention-employee:hover {
          background: ${COLORS.primary}33;
        }
        /* 회의 멘션 — success (green) */
        .tiptap-meetings .ProseMirror .mention-meeting {
          background: rgba(16,185,129,0.15);
          color: #047857;
        }
        .tiptap-meetings .ProseMirror .mention-meeting:hover {
          background: rgba(16,185,129,0.30);
        }
        /* ERP 멘션 — warning (amber) */
        .tiptap-meetings .ProseMirror .mention-entity {
          background: rgba(245,158,11,0.15);
          color: #b45309;
        }
        .tiptap-meetings .ProseMirror .mention-entity:hover {
          background: rgba(245,158,11,0.30);
        }
      `}</style>
      <EditorContent editor={editor} className="tiptap-meetings" />
      {!editor && (
        <div style={{ fontSize: 13, color: COLORS.textMuted }}>에디터 로딩 중...</div>
      )}
      {editor && (
        <div style={{
          marginTop: 14, paddingTop: 10,
          borderTop: '1px solid rgba(0,0,0,0.05)',
          display: 'flex', gap: 6, flexWrap: 'wrap',
          fontSize: 11, color: COLORS.textMuted, whiteSpace: 'nowrap',
        }}>
          <span>💡 빠른 입력:</span>
          <kbd style={kbdStyle}>/</kbd> 블록
          <kbd style={kbdStyle}>@</kbd> 직원
          <kbd style={kbdStyle}>#</kbd> 회의
          <kbd style={kbdStyle}>&gt;</kbd> 계약/차량/고객
          <kbd style={kbdStyle}>Ctrl+B/I</kbd> 굵게/기울임
          <kbd style={kbdStyle}>Ctrl+Alt+1~3</kbd> 제목
          <span style={{ marginLeft: 6, color: COLORS.primary }}>· 멘션 클릭 → 페이지 이동</span>
        </div>
      )}
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  padding: '1px 5px',
  border: '1px solid rgba(0,0,0,0.12)',
  borderRadius: 4,
  background: GLASS.L1.background,
  fontFamily: 'SF Mono, Menlo, Consolas, monospace',
  fontSize: 10,
}
