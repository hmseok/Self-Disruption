'use client'

import { useMemo, useState } from 'react'

// ═══════════════════════════════════════════════════════════════════
// ConsultationTimeline — 상담 기록 타임라인 (공용)
//
// PR-UX-DRAWER (2026-07-04) — consultation_note 단일 텍스트 → 타임라인.
//   DB 변경 없음: 같은 컬럼에 `[YYYY-MM-DD HH:mm] 내용` 형태로 위에 쌓임.
//   타임스탬프 없는 기존 텍스트는 「이전 기록」 블록으로 표시.
//   사용처: RentalDrawer(즉시 저장) + rentals/[id] 상세(폼 저장) — 규칙 14 동형.
// ═══════════════════════════════════════════════════════════════════

const TS_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]\s?/

function pad(n: number): string { return String(n).padStart(2, '0') }

/** 새 상담 기록을 기존 값 위에 쌓는다 — `[2026-07-04 14:30] 내용` */
export function appendConsultationEntry(existing: string | null | undefined, text: string): string {
  const now = new Date()
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const entry = `[${ts}] ${text.trim()}`
  const prev = (existing || '').trim()
  return prev ? `${entry}\n${prev}` : entry
}

type Entry = { ts: string | null; text: string }

/** 값 → 타임라인 엔트리 목록 (타임스탬프 없는 잔여 텍스트는 ts=null 하나로) */
function parseEntries(value: string | null | undefined): Entry[] {
  const raw = (value || '').trim()
  if (!raw) return []
  // 타임스탬프 라인 기준으로 분할 — 각 엔트리는 다음 타임스탬프 전까지의 여러 줄 포함
  const parts = raw.split(/(?=^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\])/m)
  const entries: Entry[] = []
  let legacy = ''
  for (const p of parts) {
    const s = p.trim()
    if (!s) continue
    const m = s.match(TS_RE)
    if (m) entries.push({ ts: m[1], text: s.replace(TS_RE, '').trim() })
    else legacy += (legacy ? '\n' : '') + s
  }
  if (legacy) entries.push({ ts: null, text: legacy })
  return entries
}

export default function ConsultationTimeline({
  value,
  onAppend,
  onRawChange,
  busy = false,
  pendingHint = false,
}: {
  value: string | null | undefined
  /** 새 기록 추가 — 부모가 저장 방식 결정 (즉시 PATCH 또는 폼 state) */
  onAppend: (next: string, entryText: string) => void | Promise<void>
  /** 원문 직접 수정 허용 (접기 안에서) */
  onRawChange?: (raw: string) => void
  busy?: boolean
  /** true 면 「저장을 눌러야 반영」 안내 표시 (폼 모드) */
  pendingHint?: boolean
}) {
  const [draft, setDraft] = useState('')
  const [rawOpen, setRawOpen] = useState(false)
  const entries = useMemo(() => parseEntries(value), [value])

  const submit = async () => {
    const t = draft.trim()
    if (!t || busy) return
    await onAppend(appendConsultationEntry(value, t), t)
    setDraft('')
  }

  return (
    <div>
      {/* 입력 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }}
          rows={2}
          placeholder="통화·협의 내용 입력 후 기록 (Ctrl+Enter)"
          style={{ flex: 1, padding: '9px 11px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 13, color: '#1e293b', background: '#fff', resize: 'vertical', fontFamily: 'inherit' }}
        />
        <button
          onClick={submit}
          disabled={busy || !draft.trim()}
          style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff', cursor: busy || !draft.trim() ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap', opacity: busy || !draft.trim() ? 0.5 : 1 }}
        >{busy ? '저장 중…' : '＋ 기록'}</button>
      </div>
      {pendingHint && (
        <div style={{ fontSize: 11, color: '#b45309', marginTop: 6 }}>※ 기록 추가 후 위 💾 저장을 눌러야 반영됩니다</div>
      )}

      {/* 타임라인 */}
      {entries.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>기록된 상담이 없습니다</div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 320, overflowY: 'auto' }}>
          {entries.map((e, i) => (
            <div key={i} style={{ padding: '8px 2px', borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: e.ts ? '#64748b' : '#b45309', marginBottom: 2 }}>
                {e.ts || '이전 기록'}
              </div>
              <div style={{ fontSize: 13, color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{e.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* 원문 편집 (접기) — 오타·잘못 붙은 기록 수정용 */}
      {onRawChange && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => setRawOpen((v) => !v)}
            style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.1)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
          >{rawOpen ? '▴ 원문 닫기' : '▾ 원문 편집'}</button>
          {rawOpen && (
            <textarea
              value={value ?? ''}
              onChange={(e) => onRawChange(e.target.value)}
              rows={6}
              style={{ width: '100%', marginTop: 6, padding: '9px 11px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.12)', fontSize: 12, color: '#475569', background: '#fff', resize: 'vertical', fontFamily: 'inherit' }}
            />
          )}
        </div>
      )}
    </div>
  )
}
