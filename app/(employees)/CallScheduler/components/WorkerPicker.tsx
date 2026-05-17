'use client'
// ═══════════════════════════════════════════════════════════════════
// WorkerPicker — 셀 클릭 팝오버
// 근무자 선택 + 특수코드 라디오 + 저장/비우기/취소
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { TONE_BG } from '../utils/palette'
import { SPECIAL_LABEL } from '../utils/types'
import type { Worker, SpecialCode, Assignment, ShiftSlot } from '../utils/types'

interface Props {
  open: boolean
  onClose: () => void
  workers: Worker[]
  slot: ShiftSlot | null
  workDate: string
  current: Assignment | null
  onSave: (workerId: string | null, special: SpecialCode) => Promise<void>
  onClear: () => Promise<void>
}

const SPECIAL_OPTIONS: { value: SpecialCode; label: string }[] = [
  { value: 'none',    label: '일반' },
  { value: 'am_half', label: '오전반차' },
  { value: 'pm_half', label: '오후반차' },
  { value: 'am_free', label: '오전F' },
  { value: 'pm_free', label: '오후F' },
  { value: 'off',     label: '휴무' },
]

export default function WorkerPicker(props: Props) {
  const { open, onClose, workers, slot, workDate, current, onSave, onClear } = props
  const [search, setSearch] = useState('')
  const [workerId, setWorkerId] = useState<string | null>(null)
  const [special, setSpecial] = useState<SpecialCode>('none')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setWorkerId(current?.worker_id || null)
      setSpecial((current?.special_code || 'none') as SpecialCode)
      setSearch('')
    }
  }, [open, current])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return workers
    return workers.filter(w => w.name.toLowerCase().includes(q))
  }, [workers, search])

  if (!open || !slot) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...GLASS.L4,
          // 사용자 보고 (2026-05-17): "날짜별에서 클릭했을 때 모달도 작아서 화면도 많이 짤려"
          // → 480 → 560 으로 확대 + maxHeight 90vh 로 확대
          width: 560, maxWidth: '95vw', maxHeight: '90vh',
          borderRadius: 16, padding: 24, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>
            {workDate} · {slot.label}
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
            근무자 배정 / 특수코드 선택
          </div>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 검색"
          style={{
            ...GLASS.L1, padding: '8px 12px', borderRadius: 8,
            fontSize: 13, color: COLORS.textPrimary, outline: 'none',
          }}
        />

        {/* 사용자 보고 (2026-05-17): "전체 근무자 다 표기되었으면 좋겠어"
            → maxHeight 260 → 480 으로 확대, 워커 16명 정도는 스크롤 없이 표시 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 480, overflowY: 'auto' }}>
          <button
            type="button"
            onClick={() => setWorkerId(null)}
            style={{
              padding: '8px 10px', borderRadius: 6, textAlign: 'left',
              background: workerId === null ? COLORS.bgBlue : 'transparent',
              border: `1px solid ${workerId === null ? COLORS.borderBlue : COLORS.borderFaint}`,
              color: COLORS.textSecondary, fontSize: 13, cursor: 'pointer',
            }}
          >
            (배정 안 함 / F만)
          </button>
          {filtered.map(w => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWorkerId(w.id)}
              style={{
                padding: '8px 10px', borderRadius: 6, textAlign: 'left',
                background: workerId === w.id ? TONE_BG[w.color_tone] : 'transparent',
                border: `1px solid ${workerId === w.id ? COLORS.borderBlue : COLORS.borderFaint}`,
                color: COLORS.textPrimary, fontSize: 13, cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: workerId === w.id ? 700 : 500 }}>{w.name}</span>
              {w.group_label && (
                <span style={{ fontSize: 10, color: COLORS.textMuted }}>{w.group_label}</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
              검색 결과 없음
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 6 }}>
            특수 코드
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SPECIAL_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSpecial(opt.value)}
                style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  background: special === opt.value ? COLORS.bgBlue : 'transparent',
                  border: `1px solid ${special === opt.value ? COLORS.borderBlue : COLORS.borderFaint}`,
                  color: special === opt.value ? COLORS.info : COLORS.textSecondary,
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
          <button
            type="button"
            onClick={async () => { setSaving(true); try { await onClear() } finally { setSaving(false); onClose() } }}
            disabled={saving || !current}
            style={{
              ...BTN.md,
              background: 'transparent',
              color: COLORS.danger,
              border: `1px solid ${COLORS.borderRed}`,
              cursor: saving || !current ? 'not-allowed' : 'pointer',
              opacity: saving || !current ? 0.5 : 1,
            }}
          >
            셀 비우기
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                ...BTN.md,
                background: 'transparent',
                color: COLORS.textSecondary,
                border: `1px solid ${COLORS.borderFaint}`,
                cursor: 'pointer',
              }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={async () => {
                setSaving(true)
                try { await onSave(workerId, special) }
                finally { setSaving(false); onClose() }
              }}
              disabled={saving}
              style={{
                ...BTN.md,
                background: COLORS.primary,
                color: '#fff',
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
