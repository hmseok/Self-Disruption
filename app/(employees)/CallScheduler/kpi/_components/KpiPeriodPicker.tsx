'use client'
// ═══════════════════════════════════════════════════════════════════
// CX KPI — 공용 기간 선택 컴포넌트 (Phase CX-KPI-16)
//   프리셋(일/주/월) + ◀ 이전/다음 ▶ 네비게이션 + 직접 시작~종료 범위.
//   5개 KPI 탭(대시보드·평가·충원·근태·데이터)이 공유.
//
//   사용:
//     const [period, setPeriod] = useState<KpiPeriod>(
//       { granularity:'month', date: todayIso(), from:null, to:null })
//     <KpiPeriodPicker value={period} onChange={setPeriod} />
//     → 조회 URL 은 `?${periodQuery(period)}` 로 조립 (granularity/date 또는 from/to)
//
//   onChange 로 내보내는 값:
//     · 프리셋(일/주/월) → { granularity, date, from:null, to:null }
//     · 직접범위         → { granularity:'day', date:from, from, to }
// ═══════════════════════════════════════════════════════════════════
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

// ── 타입 ────────────────────────────────────────────────────────────
export interface KpiPeriod {
  granularity: 'day' | 'week' | 'month'  // 프리셋 종류 (custom 일 때도 'day' 등 fallback)
  date: string         // YYYY-MM-DD 기준일
  from: string | null  // 직접범위 모드일 때만 set, 프리셋이면 null
  to: string | null    // 직접범위 모드일 때만 set
}

// 프리셋이면 ?granularity=&date=, 직접범위면 ?from=&to= 로 fetch
export function periodQuery(p: KpiPeriod): string {
  return p.from && p.to
    ? `from=${p.from}&to=${p.to}`
    : `granularity=${p.granularity}&date=${p.date}`
}

// ── 날짜 유틸 ───────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
// 안전 파싱 — 잘못된 문자열이면 오늘
function parseIso(s: string): Date {
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? new Date() : d
}
const DOW = ['일', '월', '화', '수', '목', '금', '토']

// 프리셋 granularity + 기준일 → { from, to } (라벨 계산용)
//   주(week): 월요일 시작 — (getDay()+6)%7
function presetRange(g: KpiPeriod['granularity'], dateStr: string): { from: string; to: string } {
  const base = parseIso(dateStr)
  if (g === 'day') {
    const iso = isoOf(base)
    return { from: iso, to: iso }
  }
  if (g === 'week') {
    const dow = (base.getDay() + 6) % 7 // 0 = 월
    const mon = new Date(base); mon.setDate(base.getDate() - dow)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { from: isoOf(mon), to: isoOf(sun) }
  }
  // month
  const y = base.getFullYear()
  const m = base.getMonth() + 1
  const last = new Date(y, m, 0).getDate()
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` }
}

// 프리셋 기간 라벨 — 일: 2026-05-23(금) / 주: 2026-05-19 ~ 05-25 / 월: 2026년 5월
function presetLabel(g: KpiPeriod['granularity'], dateStr: string): string {
  const base = parseIso(dateStr)
  if (g === 'day') {
    return `${isoOf(base)}(${DOW[base.getDay()]})`
  }
  if (g === 'week') {
    const { from, to } = presetRange('week', dateStr)
    // to 는 같은 달이면 MM-DD 부분만 (간결)
    return `${from} ~ ${to.substring(5)}`
  }
  return `${base.getFullYear()}년 ${base.getMonth() + 1}월`
}

// 프리셋 기준일을 단위만큼 이동 (일=±1일, 주=±7일, 월=±1개월)
function shiftPreset(g: KpiPeriod['granularity'], dateStr: string, dir: -1 | 1): string {
  const d = parseIso(dateStr)
  if (g === 'day') {
    d.setDate(d.getDate() + dir)
  } else if (g === 'week') {
    d.setDate(d.getDate() + dir * 7)
  } else {
    d.setMonth(d.getMonth() + dir)
  }
  return isoOf(d)
}

// ── 컴포넌트 ────────────────────────────────────────────────────────
const MODE_LABEL: Record<string, string> = { day: '일', week: '주', month: '월', custom: '직접' }

export default function KpiPeriodPicker({ value, onChange }: {
  value: KpiPeriod
  onChange: (p: KpiPeriod) => void
}) {
  const isCustom = !!(value.from && value.to)
  // 현재 모드 — 직접범위면 'custom', 아니면 granularity
  const mode: string = isCustom ? 'custom' : value.granularity

  // ── 모드 버튼 클릭 ──
  const pickMode = (m: string) => {
    if (m === 'custom') {
      // 직접 모드 진입 — 현재 프리셋 범위를 초기 from/to 로
      const r = presetRange(value.granularity, value.date)
      onChange({ granularity: 'day', date: r.from, from: r.from, to: r.to })
    } else {
      // 프리셋 모드 — from/to 비움
      const g = m as KpiPeriod['granularity']
      // custom 에서 돌아올 때 기준일은 from(또는 기존 date) 사용
      const baseDate = isCustom ? (value.from || value.date) : value.date
      onChange({ granularity: g, date: baseDate, from: null, to: null })
    }
  }

  // ── 프리셋 ◀▶ — 기준일을 단위만큼 이동 ──
  const navPreset = (dir: -1 | 1) => {
    onChange({
      granularity: value.granularity,
      date: shiftPreset(value.granularity, value.date, dir),
      from: null, to: null,
    })
  }

  // ── 프리셋 기준일 input 변경 ──
  const onPresetDate = (d: string) => {
    onChange({ granularity: value.granularity, date: d, from: null, to: null })
  }

  // ── 직접 모드 ◀▶ — (to-from) 길이만큼 두 날짜 함께 이동 ──
  const navCustom = (dir: -1 | 1) => {
    const f = parseIso(value.from!)
    const t = parseIso(value.to!)
    const spanDays = Math.round((t.getTime() - f.getTime()) / 86400000)
    const shift = (spanDays + 1) * dir // 한 칸 = 범위 전체 길이
    f.setDate(f.getDate() + shift)
    t.setDate(t.getDate() + shift)
    const nf = isoOf(f)
    const nt = isoOf(t)
    onChange({ granularity: 'day', date: nf, from: nf, to: nt })
  }

  // ── 직접 모드 시작일/종료일 input 변경 (시작>종료 자동 보정) ──
  const onCustomFrom = (f: string) => {
    let to = value.to!
    if (f > to) to = f
    onChange({ granularity: 'day', date: f, from: f, to })
  }
  const onCustomTo = (t: string) => {
    let from = value.from!
    if (from > t) from = t
    onChange({ granularity: 'day', date: from, from, to: t })
  }

  // ── 스타일 토큰 (KpiDashboard 기간 바 패턴 동일) ──
  const dateInputStyle: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 8, fontSize: 13,
    border: `1px solid ${COLORS.borderFaint}`, color: COLORS.textPrimary,
    background: '#fff', fontFamily: 'inherit',
  }
  const navBtnStyle: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 800, lineHeight: 1,
    background: COLORS.bgGray, color: COLORS.textSecondary,
    border: `1px solid ${COLORS.borderFaint}`,
  }

  return (
    <div style={{
      ...GLASS.L1, borderRadius: 10, padding: '10px 14px',
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      {/* ── 모드 버튼 4개 — 일 / 주 / 월 / 직접 ── */}
      <div style={{ display: 'flex', gap: 4 }}>
        {(['day', 'week', 'month', 'custom'] as const).map((m) => {
          const active = m === mode
          return (
            <button key={m} type="button" onClick={() => pickMode(m)}
              style={{
                padding: '6px 16px', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
                background: active ? COLORS.primary : 'transparent',
                color: active ? '#fff' : COLORS.textSecondary,
                border: `1px solid ${active ? COLORS.primary : COLORS.borderFaint}`,
              }}>
              {MODE_LABEL[m]}
            </button>
          )
        })}
      </div>

      {/* ── 프리셋 모드: ◀ 라벨 ▶ + 기준일 ── */}
      {!isCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={() => navPreset(-1)}
            title="이전" style={navBtnStyle}>◀</button>
          <span style={{
            fontSize: 13, fontWeight: 800, color: COLORS.textPrimary,
            whiteSpace: 'nowrap', minWidth: 130, textAlign: 'center',
          }}>
            {presetLabel(value.granularity, value.date)}
          </span>
          <button type="button" onClick={() => navPreset(1)}
            title="다음" style={navBtnStyle}>▶</button>
          <input type="date" value={value.date}
            onChange={(e) => onPresetDate(e.target.value)}
            title="기준일 직접 선택" style={{ ...dateInputStyle, marginLeft: 4 }} />
        </div>
      )}

      {/* ── 직접 모드: ◀ 시작일 ~ 종료일 ▶ ── */}
      {isCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={() => navCustom(-1)}
            title="이전 구간" style={navBtnStyle}>◀</button>
          <input type="date" value={value.from!}
            onChange={(e) => onCustomFrom(e.target.value)}
            title="시작일" style={dateInputStyle} />
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textMuted }}>~</span>
          <input type="date" value={value.to!}
            onChange={(e) => onCustomTo(e.target.value)}
            title="종료일" style={dateInputStyle} />
          <button type="button" onClick={() => navCustom(1)}
            title="다음 구간" style={navBtnStyle}>▶</button>
        </div>
      )}
    </div>
  )
}
