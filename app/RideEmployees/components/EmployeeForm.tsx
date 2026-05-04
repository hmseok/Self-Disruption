'use client'
// ═══════════════════════════════════════════════════════════════════
// EmployeeForm — 직원 추가/수정 공통 폼
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '@/app/CallScheduler/utils/palette'
import { COLOR_TONE_OPTIONS } from '@/app/CallScheduler/utils/types'
import {
  DEPARTMENT_OPTIONS, POSITION_OPTIONS, EMPLOYMENT_TYPE_OPTIONS, GROUP_OPTIONS,
} from '../utils/types'
import type { RideEmployee } from '../utils/types'
import type { ColorTone } from '@/app/CallScheduler/utils/types'

interface Props {
  initial?: RideEmployee | null
  onSubmit: (payload: any) => Promise<void>
  onCancel: () => void
  saving: boolean
  submitLabel?: string
}

export default function EmployeeForm({ initial, onSubmit, onCancel, saving, submitLabel = '저장' }: Props) {
  const [name, setName] = useState(initial?.name || '')
  const [department, setDepartment] = useState(initial?.department || '')
  const [position, setPosition] = useState(initial?.position || '')
  const [employmentType, setEmploymentType] = useState(initial?.employment_type || '')
  const [hireDate, setHireDate] = useState(initial?.hire_date || '')
  const [phone, setPhone] = useState(initial?.phone || '')
  const [email, setEmail] = useState(initial?.email || '')
  const [colorTone, setColorTone] = useState<ColorTone>(initial?.color_tone || 'none')
  const [groupLabel, setGroupLabel] = useState(initial?.group_label || '')
  const [memo, setMemo] = useState(initial?.memo || '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initial) {
      setName(initial.name); setDepartment(initial.department || '')
      setPosition(initial.position || ''); setEmploymentType(initial.employment_type || '')
      setHireDate(initial.hire_date || ''); setPhone(initial.phone || '')
      setEmail(initial.email || ''); setColorTone(initial.color_tone || 'none')
      setGroupLabel(initial.group_label || ''); setMemo(initial.memo || '')
    }
  }, [initial])

  const submit = async () => {
    if (!name.trim()) { setError('이름은 필수입니다.'); return }
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        department: department || null,
        position: position || null,
        employment_type: employmentType || null,
        hire_date: hireDate || null,
        phone: phone || null,
        email: email || null,
        color_tone: colorTone,
        group_label: groupLabel || null,
        memo: memo || null,
      })
    } catch (e: any) {
      setError(e?.message || '저장 실패')
    }
  }

  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, padding: 20,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <Field label="이름" required>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
               style={inputStyle} placeholder="박지훈" />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="부서">
          <select value={department} onChange={(e) => setDepartment(e.target.value)} style={inputStyle}>
            <option value="">선택</option>
            {DEPARTMENT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="직급">
          <select value={position} onChange={(e) => setPosition(e.target.value)} style={inputStyle}>
            <option value="">선택</option>
            {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="고용 형태">
          <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} style={inputStyle}>
            <option value="">선택</option>
            {EMPLOYMENT_TYPE_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </Field>
        <Field label="입사일">
          <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} style={inputStyle} />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="전화번호">
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                 style={inputStyle} placeholder="010-1234-5678" />
        </Field>
        <Field label="이메일">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                 style={inputStyle} placeholder="example@ride.kr" />
        </Field>
      </div>

      <Field label="그룹 (CallScheduler 분류)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <ToggleChip active={!groupLabel} onClick={() => setGroupLabel('')}>없음</ToggleChip>
          {GROUP_OPTIONS.map(g => (
            <ToggleChip key={g} active={groupLabel === g} onClick={() => setGroupLabel(g)}>{g}</ToggleChip>
          ))}
        </div>
      </Field>

      <Field label="색상 토큰 (캘린더 셀 강조용)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {COLOR_TONE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setColorTone(opt.value)}
              style={{
                padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                background: colorTone === opt.value ? TONE_BG[opt.value] : 'transparent',
                border: `1px solid ${colorTone === opt.value ? COLORS.borderBlue : COLORS.borderFaint}`,
                color: colorTone === opt.value ? TONE_TEXT[opt.value] : COLORS.textSecondary,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="메모">
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder="특이사항" />
      </Field>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger, fontSize: 13,
        }}>❌ {error}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel}
                style={{
                  ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                  border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                }}>
          취소
        </button>
        <button type="button" onClick={submit} disabled={saving}
                style={{
                  ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                }}>
          {saving ? '저장 중...' : submitLabel}
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  ...GLASS.L1,
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 13,
  color: COLORS.textPrimary,
  outline: 'none',
  width: '100%',
}

function Field({ label, required, children }: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
        {label}{required && <span style={{ color: COLORS.danger, marginLeft: 2 }}>*</span>}
      </div>
      {children}
    </div>
  )
}

function ToggleChip({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
        background: active ? COLORS.bgBlue : 'transparent',
        border: `1px solid ${active ? COLORS.borderBlue : COLORS.borderFaint}`,
        color: active ? COLORS.info : COLORS.textSecondary,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
