'use client'
// ═══════════════════════════════════════════════════════════════════
// /CallScheduler/new — 신규 월 스케줄 생성
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

export const dynamic = 'force-dynamic'

interface ExistingSchedule {
  id: string
  year: number
  month: number
  title: string | null
  status: string
}

export default function CallSchedulerNewPage() {
  const router = useRouter()
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [year, setYear] = useState(nextMonth.getFullYear())
  const [month, setMonth] = useState(nextMonth.getMonth() + 1)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [cloneFromId, setCloneFromId] = useState<string>('')
  const [existing, setExisting] = useState<ExistingSchedule[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // PR-2KK: 자동 채우기 (월 생성 + 자동 생성 통합)
  const [autoFill, setAutoFill] = useState(true)
  const [progressText, setProgressText] = useState('')

  useEffect(() => {
    let abort = false
    ;(async () => {
      try {
        const auth = await getAuthHeader()
        const res = await fetch('/api/call-scheduler/schedules', { headers: auth })
        const json = await res.json()
        if (res.ok && !abort) setExisting(json.data || [])
      } catch { /* silent */ }
    })()
    return () => { abort = true }
  }, [])

  const conflict = useMemo(
    () => existing.find(e => e.year === year && e.month === month),
    [existing, year, month],
  )

  const submit = async () => {
    if (conflict) {
      setError(`${year}년 ${month}월 스케줄이 이미 존재합니다.`)
      return
    }
    setCreating(true)
    setError(null)
    setProgressText('월 생성 중...')
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          year, month,
          title: title.trim() || null,
          note: note.trim() || null,
          clone_from: cloneFromId || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '생성 실패')
      const newId = json.data.id

      // PR-2KK: 자동 채우기 옵션 — 그룹 셋팅 + 휴가 반영해서 한 번에 채움
      if (autoFill && !cloneFromId) {
        setProgressText('✨ 그룹 셋팅 기반 자동 생성 중...')
        const autoRes = await fetch(`/api/call-scheduler/schedules/${newId}/auto-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({
            mode: 'apply',
            overwrite_existing: false,
            clear_first: false,
            skip_holidays: false,  // 24/365 운영 — 공휴일도 근무
            mark_leaves: true,     // 직원 휴가 자동 반영
          }),
        })
        const autoJson = await autoRes.json()
        if (!autoRes.ok) {
          // 자동 생성 실패해도 스케줄 자체는 생성됐으니 상세로 이동
          console.warn('자동 생성 실패:', autoJson?.error)
          setError(`스케줄 생성됨 (자동 채우기 실패: ${autoJson?.error || '오류'})`)
          setTimeout(() => router.push(`/CallScheduler/${newId}`), 1500)
          return
        }
        const summary = autoJson.data?.summary
        setProgressText(`✅ ${summary?.to_insert || 0}건 생성 — 이동 중...`)
      }
      router.push(`/CallScheduler/${newId}`)
    } catch (e: any) {
      setError(e?.message || '생성 실패')
      setCreating(false)
      setProgressText('')
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/CallScheduler" style={{
          fontSize: 12, color: COLORS.info, textDecoration: 'none',
        }}>
          ← 목록으로
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f2440', margin: '8px 0 4px' }}>
          새 월 스케줄 생성
        </h1>
        <div style={{ fontSize: 12, color: COLORS.textMuted }}>
          연/월 선택 후 빈 그리드 또는 전월 패턴 복제로 시작
        </div>
      </div>

      <div style={{
        ...GLASS.L4, borderRadius: 12, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="연도">
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              min={2024}
              max={2030}
              style={inputStyle}
            />
          </Field>
          <Field label="월">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              style={inputStyle}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
          </Field>
        </div>

        {conflict && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            color: COLORS.danger, fontSize: 12,
          }}>
            ⚠ 이미 존재하는 월입니다 — <Link href={`/CallScheduler/${conflict.id}`} style={{ color: COLORS.danger, fontWeight: 700 }}>기존 스케줄 열기</Link>
          </div>
        )}

        <Field label="제목 (선택)" sub="비우면 자동 생성">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`${year}년 ${month}월 근무표`}
            style={inputStyle}
          />
        </Field>

        <Field label="시작 모드">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <ModeButton
              active={!cloneFromId}
              onClick={() => setCloneFromId('')}
              title="빈 그리드"
              sub="처음부터 직접 배정"
            />
            <ModeButton
              active={!!cloneFromId}
              onClick={() => {
                if (existing.length > 0 && !cloneFromId) setCloneFromId(existing[0].id)
              }}
              title="전월 패턴 복제"
              sub="요일별 슬롯 패턴 자동 채움"
              disabled={existing.length === 0}
            />
          </div>
          {cloneFromId && (
            <select
              value={cloneFromId}
              onChange={(e) => setCloneFromId(e.target.value)}
              style={{ ...inputStyle, marginTop: 8 }}
            >
              {existing.map(s => (
                <option key={s.id} value={s.id}>
                  {s.year}년 {s.month}월{s.title ? ' · ' + s.title : ''}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="메모 (선택)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="변경 사항이나 특이사항"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Field>

        {/* PR-2KK: 자동 채우기 (월 생성 + 자동 생성 통합) */}
        <div style={{
          padding: '12px 14px', borderRadius: 10,
          background: autoFill ? COLORS.bgViolet : 'rgba(0,0,0,0.02)',
          border: `1px solid ${autoFill ? COLORS.borderViolet : COLORS.borderFaint}`,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <input type="checkbox" checked={autoFill}
                 disabled={!!cloneFromId}
                 onChange={(e) => setAutoFill(e.target.checked)}
                 style={{ marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 13, fontWeight: 800,
              color: autoFill ? '#7c3aed' : COLORS.textSecondary,
            }}>
              ✨ 그룹 셋팅 기반 자동 채우기
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4, lineHeight: 1.6 }}>
              생성 직후 그룹 패턴 + 휴가 자동 반영. <strong>한 번에 매트릭스가 채워집니다.</strong><br />
              {cloneFromId && '⚠ 전월 복제 선택 시 자동 채우기 비활성 (복제로 채워짐)'}
              {!cloneFromId && '셋팅이 미흡하면 빈 칸이 많을 수 있습니다 — 셋팅 먼저 점검하세요.'}
            </div>
          </div>
        </div>

        {progressText && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: COLORS.bgBlue, border: `1px solid ${COLORS.borderBlue}`,
            color: COLORS.info, fontSize: 13, fontWeight: 700,
          }}>
            ⏳ {progressText}
          </div>
        )}

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
            color: COLORS.danger, fontSize: 13,
          }}>
            ❌ {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Link
            href="/CallScheduler"
            style={{
              ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
              border: `1px solid ${COLORS.borderFaint}`, textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            취소
          </Link>
          <button
            type="button"
            onClick={submit}
            disabled={creating || !!conflict}
            style={{
              ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
              cursor: creating || conflict ? 'not-allowed' : 'pointer',
              opacity: creating || conflict ? 0.6 : 1,
            }}
          >
            {creating ? '생성 중...' : '생성'}
          </button>
        </div>
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

function Field({ label, sub, children }: {
  label: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary }}>{label}</span>
        {sub && <span style={{ fontSize: 11, color: COLORS.textMuted }}>{sub}</span>}
      </div>
      {children}
    </div>
  )
}

function ModeButton({ active, onClick, title, sub, disabled }: {
  active: boolean
  onClick: () => void
  title: string
  sub: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '12px 14px', borderRadius: 8, textAlign: 'left',
        background: active ? COLORS.bgBlue : 'transparent',
        border: `1px solid ${active ? COLORS.borderBlue : COLORS.borderFaint}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>{title}</div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{sub}</div>
    </button>
  )
}
