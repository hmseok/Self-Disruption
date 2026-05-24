// ═══════════════════════════════════════════════════════════════════
// /call-scheduler/[token] — 직원 근무표 공개 페이지 (CX-KPI-20)
//
// 직원이 로그인 없이 영구 토큰 링크로 본인 월 근무표를 조회.
// cs_workers.view_token 으로 워커 식별 → 해당 월 cs_assignments 표시.
// 알리고 SMS 배포(CX-KPI-21)가 이 링크를 직원별로 발송.
//
// 서버 컴포넌트 — prisma 직접 조회, 별도 API 라우트 없음. 인증 없음(토큰=권한).
// 모바일 우선 레이아웃.
// ═══════════════════════════════════════════════════════════════════
import { prisma } from '@/lib/prisma'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

export const dynamic = 'force-dynamic'

const pad = (n: number) => String(n).padStart(2, '0')
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const SPECIAL_LABEL: Record<string, string> = {
  none: '근무', am_free: '오전 휴무', pm_free: '오후 휴무',
  am_half: '오전 반차', pm_half: '오후 반차', off: '휴무',
}

interface AssignRow {
  work_date: string
  code: string
  label: string
  start_time: string | null
  end_time: string | null
  is_overnight: number
  special_code: string
}

export default async function CallSchedulePublicPage(
  { params, searchParams }: {
    params: Promise<{ token: string }>
    searchParams: Promise<Record<string, string | string[] | undefined>>
  },
) {
  const { token: rawToken } = await params
  const sp = await searchParams
  // 토큰 정규화 — 소문자 hex 만 (UUID 32자)
  const token = String(rawToken || '').replace(/[^a-z0-9]/gi, '').toLowerCase()

  // ── 기준 월 (?ym=YYYY-MM, 기본 이번 달) ──
  const ymParam = typeof sp?.ym === 'string' ? sp.ym : ''
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth() + 1
  const ymMatch = ymParam.match(/^(\d{4})-(\d{2})$/)
  if (ymMatch) {
    year = Number(ymMatch[1])
    month = Number(ymMatch[2])
    if (month < 1 || month > 12) { month = now.getMonth() + 1 }
  }
  const lastDay = new Date(year, month, 0).getDate()
  const from = `${year}-${pad(month)}-01`
  const to = `${year}-${pad(month)}-${pad(lastDay)}`
  const prevYm = month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`
  const nextYm = month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`

  // ── 워커 조회 ──
  let worker: { id: string; name: string } | null = null
  if (token.length >= 8) {
    try {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT id, name FROM cs_workers WHERE view_token = ${token} LIMIT 1
      `
      if (rows.length > 0) {
        worker = { id: String(rows[0].id), name: String(rows[0].name || '') }
      }
    } catch {
      worker = null
    }
  }

  // ── 근무 배정 조회 ──
  let rows: AssignRow[] = []
  if (worker) {
    try {
      const r = await prisma.$queryRaw<any[]>`
        SELECT
          DATE_FORMAT(a.work_date, '%Y-%m-%d') AS work_date,
          s.code                               AS code,
          s.label                              AS label,
          TIME_FORMAT(s.start_time, '%H:%i')   AS start_time,
          TIME_FORMAT(s.end_time, '%H:%i')     AS end_time,
          s.is_overnight                       AS is_overnight,
          a.special_code                       AS special_code
        FROM cs_assignments a
        JOIN cs_shift_slots s ON s.id = a.shift_slot_id
        WHERE a.worker_id = ${worker.id}
          AND a.work_date BETWEEN ${from} AND ${to}
        ORDER BY a.work_date ASC, s.start_time ASC
      `
      rows = r.map((x) => ({
        work_date: String(x.work_date),
        code: String(x.code || ''),
        label: String(x.label || ''),
        start_time: x.start_time ? String(x.start_time) : null,
        end_time: x.end_time ? String(x.end_time) : null,
        is_overnight: Number(x.is_overnight) || 0,
        special_code: String(x.special_code || 'none'),
      }))
    } catch {
      rows = []
    }
  }

  const workDays = rows.filter((r) => r.special_code === 'none').length

  // ── 페이지 셸 (모바일 우선) ──
  const shell: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #eef2f7 0%, #e3e9f0 100%)',
    padding: '20px 14px 40px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  }
  const card: React.CSSProperties = {
    ...GLASS.L4, maxWidth: 460, margin: '0 auto', borderRadius: 16,
    border: `1px solid ${COLORS.borderSubtle}`, overflow: 'hidden',
  }

  // ── 유효하지 않은 토큰 ──
  if (!worker) {
    return (
      <div style={shell}>
        <div style={{ ...card, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>
            유효하지 않은 링크입니다
          </div>
          <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 8, lineHeight: 1.6 }}>
            링크가 만료되었거나 잘못되었습니다.
            <br />담당 매니저에게 새 링크를 요청해 주세요.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={shell}>
      <div style={card}>
        {/* 헤더 */}
        <div style={{
          background: COLORS.bgBlue, borderBottom: `1px solid ${COLORS.borderBlue}`,
          padding: '16px 18px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.primary }}>
            주식회사 에프엠아이 · 콜센터 근무표
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.textPrimary, marginTop: 3 }}>
            {worker.name}님 근무표
          </div>
        </div>

        {/* 월 네비게이션 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 18px', borderBottom: `1px solid ${COLORS.borderFaint}`,
        }}>
          <a href={`?ym=${prevYm}`} style={navBtn}>◀ 이전달</a>
          <span style={{ fontSize: 15, fontWeight: 800, color: COLORS.textPrimary }}>
            {year}년 {month}월
          </span>
          <a href={`?ym=${nextYm}`} style={navBtn}>다음달 ▶</a>
        </div>

        {/* 요약 */}
        <div style={{
          display: 'flex', gap: 10, padding: '14px 18px',
          borderBottom: `1px solid ${COLORS.borderFaint}`,
        }}>
          <div style={summaryBox}>
            <div style={summaryNum}>{workDays}</div>
            <div style={summaryLbl}>근무일</div>
          </div>
          <div style={summaryBox}>
            <div style={summaryNum}>{rows.length}</div>
            <div style={summaryLbl}>총 배정</div>
          </div>
        </div>

        {/* 근무일 목록 */}
        {rows.length === 0 ? (
          <div style={{
            padding: 32, textAlign: 'center', fontSize: 13, color: COLORS.textMuted,
          }}>
            {year}년 {month}월 배정된 근무가 없습니다.
          </div>
        ) : (
          <div style={{ padding: '6px 12px 12px' }}>
            {rows.map((r, i) => {
              const d = new Date(r.work_date + 'T00:00:00')
              const dowIdx = isNaN(d.getTime()) ? 0 : d.getDay()
              const dom = isNaN(d.getTime()) ? r.work_date : d.getDate()
              const isWeekend = dowIdx === 0 || dowIdx === 6
              const isWork = r.special_code === 'none'
              return (
                <div key={`${r.work_date}-${r.code}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 8px',
                  borderBottom: i < rows.length - 1 ? `1px solid ${COLORS.borderFaint}` : 'none',
                }}>
                  {/* 날짜 */}
                  <div style={{
                    minWidth: 46, textAlign: 'center', flexShrink: 0,
                  }}>
                    <div style={{
                      fontSize: 18, fontWeight: 800,
                      color: isWeekend ? COLORS.danger : COLORS.textPrimary,
                    }}>{dom}</div>
                    <div style={{
                      fontSize: 10, fontWeight: 700,
                      color: isWeekend ? COLORS.danger : COLORS.textMuted,
                    }}>{DOW[dowIdx]}</div>
                  </div>
                  {/* 시프트 정보 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 700, color: COLORS.textPrimary,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {r.label || r.code}
                      {r.is_overnight === 1 && (
                        <span style={{ fontSize: 11, color: COLORS.primary, marginLeft: 5 }}>🌙 야간</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 1 }}>
                      {r.start_time && r.end_time
                        ? `${r.start_time} ~ ${r.end_time}`
                        : '시간 미정'}
                    </div>
                  </div>
                  {/* 근무 구분 배지 */}
                  <span style={{
                    fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
                    padding: '4px 9px', borderRadius: 7,
                    color: isWork ? COLORS.success : COLORS.warning,
                    background: isWork ? COLORS.bgGreen : COLORS.bgAmber,
                    border: `1px solid ${isWork ? COLORS.borderGreen : COLORS.borderAmber}`,
                  }}>
                    {SPECIAL_LABEL[r.special_code] || r.special_code}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* 안내 */}
        <div style={{
          padding: '12px 18px', borderTop: `1px solid ${COLORS.borderFaint}`,
          fontSize: 11, color: COLORS.textMuted, lineHeight: 1.6,
        }}>
          일정 관련 문의는 담당 매니저에게 연락해 주세요.
          <br />이 링크는 본인 전용입니다 — 타인에게 공유하지 마세요.
        </div>
      </div>
    </div>
  )
}

// ── 인라인 스타일 ─────────────────────────────────────────────────
const navBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: COLORS.primary,
  textDecoration: 'none', padding: '4px 8px', borderRadius: 6,
  background: '#fff', border: `1px solid ${COLORS.borderBlue}`,
  whiteSpace: 'nowrap',
}
const summaryBox: React.CSSProperties = {
  flex: 1, textAlign: 'center', padding: '8px 4px',
  background: COLORS.bgGray, borderRadius: 10,
  border: `1px solid ${COLORS.borderFaint}`,
}
const summaryNum: React.CSSProperties = {
  fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, lineHeight: 1.1,
}
const summaryLbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginTop: 2,
}
