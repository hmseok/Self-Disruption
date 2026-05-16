'use client'
import { useEditor, EditorContent, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { useEffect, useRef } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════
// PersonalNoteEditor — 개인 메모 (PR-MTG-V2-Note, 2026-05-16)
//   · TipTap 간소화: paragraph + list + checklist + bold/italic 만
//   · 슬래시 명령 / 멘션 / 표 / 이미지 / 링크 X (본문과 차별)
//   · 본인만 read/write — 본문 (TiptapEditor) 와 별개 인스턴스
//   · 자동 저장 debounce — 부모가 책임
// ═══════════════════════════════════════════════════════════════

export interface PersonalNoteEditorProps {
  value: JSONContent | null
  onChange?: (json: JSONContent, plainText: string) => void
  editable?: boolean
  placeholder?: string
  reloadKey?: string | number
}

const EMPTY_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

export default function PersonalNoteEditor({
  value, onChange, editable = true,
  placeholder = '본인만 보는 메모 — 자유롭게 작성. (체크리스트: 슬래시 X, 툴바 외 직접 입력)',
  reloadKey,
}: PersonalNoteEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,         // 메모는 H1/H2/H3 없음 (간소화)
        codeBlock: false,       // 코드 블록 없음
        horizontalRule: false,  // 구분선 없음
      }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: false }),
    ],
    content: value ?? EMPTY_DOC,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (!onChange) return
      const json = editor.getJSON()
      const text = editor.getText()
      onChange(json, text)
    },
  })

  const lastValueRef = useRef<string>('')
  useEffect(() => {
    if (!editor) return
    const next = JSON.stringify(value ?? EMPTY_DOC)
    if (next === lastValueRef.current) return
    const current = JSON.stringify(editor.getJSON())
    if (current !== next) {
      editor.commands.setContent(value ?? EMPTY_DOC, { emitUpdate: false })
    }
    lastValueRef.current = next
  }, [editor, value, reloadKey])

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable)
    }
  }, [editor, editable])

  // 간단 툴바 — 굵게/기울임/취소선/목록/체크리스트/인용
  const toggleBold = () => editor?.chain().focus().toggleBold().run()
  const toggleItalic = () => editor?.chain().focus().toggleItalic().run()
  const toggleStrike = () => editor?.chain().focus().toggleStrike().run()
  const toggleBullet = () => editor?.chain().focus().toggleBulletList().run()
  const toggleOrdered = () => editor?.chain().focus().toggleOrderedList().run()
  const toggleTask = () => editor?.chain().focus().toggleTaskList().run()
  const toggleQuote = () => editor?.chain().focus().toggleBlockquote().run()

  const isActive = (mark: string, attrs?: any) => editor?.isActive(mark, attrs) || false

  return (
    <div style={{
      ...GLASS.L4,
      borderRadius: 14,
      padding: 0,
      minHeight: 360,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 본인 전용 안내 배너 */}
      <div style={{
        padding: '8px 16px',
        background: `${COLORS.primary}0A`,
        borderBottom: '1px solid rgba(0,0,0,0.05)',
        fontSize: 11, color: COLORS.textSecondary, fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
      }}>
        🔒 본인만 보는 메모 — 다른 참석자/admin 에게 안 보임. 자동 저장.
      </div>

      {/* 툴바 */}
      {editable && (
        <div style={{
          padding: '6px 12px',
          borderBottom: '1px solid rgba(0,0,0,0.05)',
          display: 'flex', gap: 2, flexWrap: 'wrap',
        }}>
          <TBBtn active={isActive('bold')}        onClick={toggleBold}     title="굵게 (Ctrl+B)">B</TBBtn>
          <TBBtn active={isActive('italic')}      onClick={toggleItalic}   title="기울임 (Ctrl+I)">/</TBBtn>
          <TBBtn active={isActive('strike')}      onClick={toggleStrike}   title="취소선">S</TBBtn>
          <TBSep />
          <TBBtn active={isActive('bulletList')}  onClick={toggleBullet}   title="불릿 목록">•</TBBtn>
          <TBBtn active={isActive('orderedList')} onClick={toggleOrdered}  title="번호 목록">1.</TBBtn>
          <TBBtn active={isActive('taskList')}    onClick={toggleTask}     title="체크리스트">☑</TBBtn>
          <TBSep />
          <TBBtn active={isActive('blockquote')}  onClick={toggleQuote}    title="인용">❝</TBBtn>
        </div>
      )}

      {/* 본문 */}
      <div style={{ padding: '14px 18px', flex: 1 }}>
        <style jsx global>{`
          .tiptap-personal .ProseMirror {
            outline: none;
            min-height: 280px;
            line-height: 1.7;
            font-size: 14px;
            color: ${COLORS.textPrimary};
            font-family: inherit;
          }
          .tiptap-personal .ProseMirror p.is-editor-empty:first-child::before {
            content: attr(data-placeholder);
            float: left;
            color: ${COLORS.textMuted};
            pointer-events: none;
            height: 0;
          }
          .tiptap-personal .ProseMirror p { margin: 4px 0; }
          .tiptap-personal .ProseMirror ul, .tiptap-personal .ProseMirror ol { margin: 4px 0; padding-left: 22px; }
          .tiptap-personal .ProseMirror ul li { list-style: disc; }
          .tiptap-personal .ProseMirror ol li { list-style: decimal; }
          .tiptap-personal .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 4px; }
          .tiptap-personal .ProseMirror ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: flex-start; }
          .tiptap-personal .ProseMirror ul[data-type="taskList"] li > label { margin-top: 3px; flex-shrink: 0; }
          .tiptap-personal .ProseMirror ul[data-type="taskList"] li > div { flex: 1; }
          .tiptap-personal .ProseMirror blockquote {
            border-left: 3px solid ${COLORS.primary}; padding: 4px 14px; margin: 8px 0;
            color: ${COLORS.textSecondary}; font-style: italic;
            background: ${COLORS.primary}0A; border-radius: 0 6px 6px 0;
          }
          .tiptap-personal .ProseMirror strong { font-weight: 700; }
          .tiptap-personal .ProseMirror em { font-style: italic; }
          .tiptap-personal .ProseMirror s { text-decoration: line-through; opacity: 0.7; }
        `}</style>
        <EditorContent editor={editor} className="tiptap-personal" />
        {!editor && (
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>에디터 로딩 중...</div>
        )}
      </div>
    </div>
  )
}

function TBBtn({ active, onClick, title, children }: {
  active?: boolean; onClick: () => void; title?: string; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} title={title} type="button"
      style={{
        padding: '4px 8px', fontSize: 12, fontWeight: 700, borderRadius: 4,
        background: active ? `${COLORS.primary}1A` : 'transparent',
        color: active ? COLORS.primary : COLORS.textSecondary,
        border: 'none', cursor: 'pointer',
        minWidth: 26, whiteSpace: 'nowrap', fontFamily: 'inherit',
      }}>
      {children}
    </button>
  )
}
function TBSep() {
  return <span style={{ width: 1, background: 'rgba(0,0,0,0.08)', margin: '2px 4px' }} />
}
