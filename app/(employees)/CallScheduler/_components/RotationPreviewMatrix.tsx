'use client'
// ═══════════════════════════════════════════════════════════════════
// PR-2RR-b — 회전 미리보기 매트릭스 (시프트 × 워커 × 12개월)
//   2026-05-28 sukhomin87@gmail.com
//
// 통합 셋팅 UI: 시프트 sequence + 워커 priority + 회전 시작/종료 + 방향
//   을 한 화면에서 조정하면서 매트릭스 미리보기를 즉시 반영.
//
// auto-generate 공식과 동일 (line ~1880):
//   stride = direction === 'reverse' ? -elapsed : elapsed
//   shiftIndex = ((baseIdx + stride) % N + N) % N
//
// 셀 = rotShifts[shiftIndex].code (시프트 색상은 cs_shift_slots.color 가 있으면 사용)
//
// 인터랙션:
//   · 시프트 행 ▲▼  → sort_order swap (상위 컴포넌트 onShiftsReorder 호출)
//   · 워커 열 ◀▶  → priority swap (상위 컴포넌트 onMembersReorder 호출)
//   · 시작/종료 월 input · 방향 토글 → 즉시 매트릭스 update + 저장
// ═══════════════════════════════════════════════════════════════════
import { useMemo } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT, TONE_BORDER } from '../utils/palette'
import type { ColorTone } from '../utils/types'

export interface MatrixShift {
  shift_slot_id: string
  slot_code: string
  slot_label?: string
  start_time?: string
  end_time?: string
  is_overnight?: boolean
  sort_order: number
  color?: string | null    // cs_shift_slots.color (있으면)
}

export interface MatrixMember {
  worker_id: string
  name: string
  color_tone: ColorTone
  priority: number
  start_index?: number      // override (없으면 priority 기반 자동)
}

export interface RotationPreviewMatrixProps {
  shifts: MatrixShift[]                     // sort_order ASC 정렬된 시프트 list
  members: MatrixMember[]                   // priority ASC 정렬된 멤버 list
  startMonth: string                        // YYYY-MM ('' = 그룹 created_at fallback — 표시는 지금부터)
  endMonth: string                          // YYYY-MM ('' = 무한)
  direction: 'forward' | 'reverse'
  periodKind: 'monthly' | 'days'
  periodDays: number
  monthsToShow?: number                     // default 12
  baseMonth?: string                        // YYYY-MM — 매트릭스 row 0 의 월. default = startMonth 또는 현재 월
  // 인터랙션 콜백 (모두 옵션)
  onShiftReorder?: (fromIdx: number, toIdx: number) => void
  onShiftRemove?: (idx: number) => void
  onMemberReorder?: (fromIdx: number, toIdx: number) => void
  onStartMonthChange?: (next: string) => void
  onEndMonthChange?: (next: string) => void
  onDirectionToggle?: (next: 'forward' | 'reverse') => void
  // 통제용 (read-only 모드 — 셋팅 진입 전 미리보기)
  readOnly?: boolean
}

// ── 유틸 ──────────────────────────────────────────────────────
function nowYM(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthsBetween(fromYM: string, toYM: string): number {
  const [fy, fm] = fromYM.split('-').map(Number)
  const [ty, tm] = toYM.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}
function ymToLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${y}.${m}월`
}

// 시프트 색상 — color 컬럼 우선, 없으면 sort_order 기반 임의 톤
const FALLBACK_SHIFT_COLORS = [
  { bg: '#e0f2fe', fg: '#0369a1', border: '#bae6fd' },  // sky
  { bg: '#dcfce7', fg: '#15803d', border: '#bbf7d0' },  // green
  { bg: '#fef3c7', fg: '#b45309', border: '#fde68a' },  // amber
  { bg: '#fce7f3', fg: '#be185d', border: '#fbcfe8' },  // pink
  { bg: '#ede9fe', fg: '#6d28d9', border: '#ddd6fe' },  // violet
  { bg: '#f3f4f6', fg: '#374151', border: '#e5e7eb' },  // gray
]
function shiftColorOf(s: MatrixShift, idx: number) {
  if (s.color) {
    return { bg: hex2rgba(s.color, 0.18), fg: s.color, border: hex2rgba(s.color, 0.42) }
  }
  return FALLBACK_SHIFT_COLORS[idx % FALLBACK_SHIFT_COLORS.length]
}
function hex2rgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return `rgba(${r},${g},${b},${alpha})`
}

// ═════════════════════════════════════════════════════════════════════
export default function RotationPreviewMatrix({
  shifts, members, startMonth, endMonth, direction,
  periodKind, periodDays,
  monthsToShow = 12, baseMonth,
  onShiftReorder, onShiftRemove, onMemberReorder,
  onStartMonthChange, onEndMonthChange, onDirectionToggle,
  readOnly,
}: RotationPreviewMatrixProps) {

  // 매트릭스 base 월 — startMonth 있으면 그것부터, 없으면 현재 월
  const base = baseMonth || startMonth || nowYM()
  const N = shifts.length

  // 매트릭스 컬럼 (월 list)
  const monthList = useMemo(() => {
    return Array.from({ length: monthsToShow }, (_, i) => addMonths(base, i))
  }, [base, monthsToShow])

  // 각 셀의 shiftIndex 계산
  const calcShiftIdx = (memberIdx: number, ym: string): number | null => {
    if (N === 0) return null
    // member baseIdx — start_index > 0 우선, 아니면 memberIdx (priority 자동)
    const m = members[memberIdx]
    const baseIdx = (m.start_index && m.start_index > 0) ? m.start_index : memberIdx
    // elapsed (monthly 만 — periodKind='days' 는 별도 계산 필요)
    let elapsed = 0
    if (startMonth) {
      if (periodKind === 'monthly') {
        elapsed = monthsBetween(startMonth, ym)
      } else if (periodKind === 'days') {
        // 매트릭스 row 는 월 단위로 표시 — days 인 경우 근사적으로
        //   (ym 의 1일 - startMonth 의 1일) / periodDays
        const [sy, sm] = startMonth.split('-').map(Number)
        const [cy, cm] = ym.split('-').map(Number)
        const diffDays = (new Date(cy, cm - 1, 1).getTime() - new Date(sy, sm - 1, 1).getTime())
                       / (1000 * 60 * 60 * 24)
        elapsed = Math.floor(diffDays / Math.max(1, periodDays))
      }
      if (elapsed < 0) return null  // 시작 전
    }
    // endMonth 체크
    if (endMonth && monthsBetween(endMonth, ym) > 0) return null  // 종료 후
    const stride = direction === 'reverse' ? -elapsed : elapsed
    return ((baseIdx + stride) % N + N) % N
  }

  return (
    <div style={{
      ...GLASS.L1, borderRadius: 10, padding: 12,
      border: `1px solid ${COLORS.borderSubtle}`,
    }}>
      {/* 헤더 — 셋팅 컨트롤 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${COLORS.borderFaint}`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
          🔄 회전 미리보기
        </span>
        <span style={{ fontSize: 10, color: COLORS.textMuted }}>
          {monthsToShow}개월 × {members.length}명 × {N}시프트
        </span>
        <div style={{ flex: 1 }} />
        {/* 시작 / 종료 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700 }}>시작</span>
          <input type="month" value={startMonth} disabled={readOnly}
                 onChange={e => onStartMonthChange?.(e.target.value)}
                 style={smallInputStyle} />
          <span style={{ fontSize: 10, color: COLORS.textMuted }}>~</span>
          <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700 }}>종료</span>
          <input type="month" value={endMonth} disabled={readOnly}
                 onChange={e => onEndMonthChange?.(e.target.value)}
                 style={smallInputStyle} />
        </div>
        {/* 방향 토글 */}
        <button type="button" disabled={readOnly}
                onClick={() => onDirectionToggle?.(direction === 'forward' ? 'reverse' : 'forward')}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: direction === 'reverse' ? COLORS.bgViolet : COLORS.bgBlue,
                  color: direction === 'reverse' ? '#7c3aed' : COLORS.info,
                  border: `1px solid ${direction === 'reverse' ? COLORS.borderViolet : COLORS.borderBlue}`,
                  cursor: readOnly ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title={direction === 'forward'
                  ? '정방향 (baseIdx + elapsed) — 클릭 시 역방향으로 전환'
                  : '역방향 (baseIdx - elapsed) — 클릭 시 정방향으로 전환'}>
          {direction === 'forward' ? '↻ 정방향' : '↺ 역방향'}
        </button>
      </div>

      {N === 0 || members.length === 0 ? (
        <div style={{
          padding: 24, textAlign: 'center', color: COLORS.textMuted, fontSize: 12,
        }}>
          {N === 0 ? '시프트가 셋팅되지 않았습니다.' : '워커가 셋팅되지 않았습니다.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            borderCollapse: 'separate', borderSpacing: 0,
            fontSize: 11, width: '100%', minWidth: members.length * 80 + 100,
          }}>
            <thead>
              <tr>
                <th style={cellHeadStyle()}>월</th>
                {members.map((m, mi) => (
                  <th key={m.worker_id} style={{
                    ...cellHeadStyle(),
                    background: TONE_BG[m.color_tone] !== 'transparent' ? TONE_BG[m.color_tone] : COLORS.bgGray,
                    color: TONE_TEXT[m.color_tone],
                    borderColor: TONE_BORDER[m.color_tone],
                  }}>
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}>
                      <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{m.name}</span>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button type="button" disabled={readOnly || mi === 0}
                                onClick={() => onMemberReorder?.(mi, mi - 1)}
                                style={miniBtnStyle(!readOnly && mi > 0)}
                                title="◀ 왼쪽으로">◀</button>
                        <span style={{ fontSize: 8, color: COLORS.textMuted, fontWeight: 700 }}>
                          #{mi}
                        </span>
                        <button type="button" disabled={readOnly || mi === members.length - 1}
                                onClick={() => onMemberReorder?.(mi, mi + 1)}
                                style={miniBtnStyle(!readOnly && mi < members.length - 1)}
                                title="오른쪽으로 ▶">▶</button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthList.map((ym, ri) => (
                <tr key={ym}>
                  <td style={cellHeadStyle()}>{ymToLabel(ym)}</td>
                  {members.map((m, mi) => {
                    const idx = calcShiftIdx(mi, ym)
                    if (idx == null) {
                      return (
                        <td key={m.worker_id} style={{
                          ...cellBodyStyle(),
                          background: 'rgba(0,0,0,0.03)',
                          color: COLORS.textMuted, fontStyle: 'italic',
                        }}>—</td>
                      )
                    }
                    const s = shifts[idx]
                    const c = shiftColorOf(s, idx)
                    return (
                      <td key={m.worker_id} style={{
                        ...cellBodyStyle(),
                        background: c.bg, color: c.fg, borderColor: c.border,
                      }} title={`${m.name} · ${s.slot_code} ${s.slot_label || ''}${s.start_time && s.end_time ? ` (${s.start_time}~${s.end_time})` : ''}`}>
                        <div style={{ fontWeight: 800, lineHeight: 1.1 }}>{s.slot_code}</div>
                        {s.start_time && s.end_time && (
                          <div style={{
                            fontSize: 9, fontWeight: 600, opacity: 0.78,
                            marginTop: 1, lineHeight: 1.1,
                          }}>
                            {s.start_time}~{s.end_time}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* 시프트 sequence 컨트롤 (행 reorder) */}
          <div style={{
            marginTop: 12, padding: 10,
            background: 'rgba(0,0,0,0.025)', borderRadius: 8,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: COLORS.textMuted,
              marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>시프트 회전 순서</span>
              <span style={{ fontSize: 9, fontWeight: 500 }}>
                — 매월 한 칸씩 {direction === 'forward' ? '↓ 아래' : '↑ 위'} 이동
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {shifts.map((s, si) => {
                const c = shiftColorOf(s, si)
                return (
                  <div key={s.shift_slot_id} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 8px', borderRadius: 6,
                    background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
                    fontSize: 11, fontWeight: 700,
                  }}>
                    <span style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700 }}>
                      #{si}
                    </span>
                    <span>{s.slot_code}</span>
                    {s.start_time && s.end_time && (
                      <span style={{
                        fontSize: 10, fontWeight: 500, opacity: 0.78,
                      }}>
                        {s.start_time}~{s.end_time}
                      </span>
                    )}
                    <button type="button" disabled={readOnly || si === 0}
                            onClick={() => onShiftReorder?.(si, si - 1)}
                            style={miniBtnStyle(!readOnly && si > 0)}
                            title="앞으로">◀</button>
                    <button type="button" disabled={readOnly || si === shifts.length - 1}
                            onClick={() => onShiftReorder?.(si, si + 1)}
                            style={miniBtnStyle(!readOnly && si < shifts.length - 1)}
                            title="뒤로">▶</button>
                    {onShiftRemove && (
                      <button type="button" disabled={readOnly}
                              onClick={() => onShiftRemove(si)}
                              style={{
                                ...miniBtnStyle(!readOnly),
                                color: readOnly ? COLORS.textMuted : COLORS.danger,
                                borderColor: readOnly ? COLORS.borderFaint : COLORS.borderRed,
                              }}
                              title="시프트 제거">×</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const smallInputStyle: React.CSSProperties = {
  width: 110, fontSize: 11, padding: '3px 6px',
  border: `1px solid ${COLORS.borderFaint}`, borderRadius: 5,
  background: 'rgba(255,255,255,0.85)', color: COLORS.textPrimary,
}

function cellHeadStyle(): React.CSSProperties {
  return {
    padding: '6px 8px',
    background: 'rgba(0,0,0,0.025)',
    border: `1px solid ${COLORS.borderFaint}`,
    fontWeight: 800, color: COLORS.textSecondary,
    fontSize: 11, whiteSpace: 'nowrap',
    textAlign: 'center',
  }
}
function cellBodyStyle(): React.CSSProperties {
  return {
    padding: '6px 8px',
    border: `1px solid ${COLORS.borderFaint}`,
    textAlign: 'center', whiteSpace: 'nowrap',
  }
}
function miniBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    width: 16, height: 16, padding: 0, lineHeight: 1,
    border: `1px solid ${COLORS.borderFaint}`,
    background: enabled ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.04)',
    color: enabled ? COLORS.textSecondary : COLORS.textMuted,
    fontSize: 9, fontWeight: 800, borderRadius: 3,
    cursor: enabled ? 'pointer' : 'not-allowed',
  }
}
