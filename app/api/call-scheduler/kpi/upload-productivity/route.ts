// ═══════════════════════════════════════════════════════════════════
// POST /api/call-scheduler/kpi/upload-productivity
//   KT 생산성(상담사) 엑셀 → cs_agent_productivity
//   { mode: 'preview' | 'apply', rows: any[] }
//
//   preview: 검증만 (행수/활성·비활성/매칭/기간). DB 변경 X.
//   apply:   INSERT ... ON DUPLICATE KEY UPDATE
//            (UNIQUE = period_label + agent_kt_id — 재업로드 시 덮어쓰기, 규칙 24)
//   비활성 계정(login_sec=0)도 저장하되 is_active=0.
//
//   KPI-DESIGN.md §5-1 / §6 / 마이그레이션 2026-05-21_cs_agent_productivity.sql
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// ── 헤더 → 표준 키 (공백 차이/꼬리 공백 대비) ────────────────────
function pick(r: Record<string, any>, ...names: string[]): any {
  for (const n of names) {
    for (const k of Object.keys(r)) {
      if (String(k).trim().replace(/\s+/g, '') === n.replace(/\s+/g, '')) {
        return r[k]
      }
    }
  }
  return undefined
}
function pickStr(r: Record<string, any>, ...names: string[]): string {
  const v = pick(r, ...names)
  return v == null ? '' : String(v).trim()
}

// "김현정(ride_hjkim8)" → { name, kt_id }
function parseAgent(raw: string): { name: string; kt_id: string } {
  const s = String(raw || '').trim()
  const m = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (m) return { name: m[1].trim(), kt_id: m[2].trim() }
  return { name: s, kt_id: '' }
}

// "HH:MM:SS" / "HH:MM" → 초 (90:00:31 같은 24h+ 누적값 허용)
function timeToSec(raw: any): number {
  const s = String(raw == null ? '' : raw).trim()
  if (!s) return 0
  const m = s.match(/^(\d{1,4}):(\d{1,2})(?::(\d{1,2}))?$/)
  if (m) {
    const h = Number(m[1]), mi = Number(m[2]), se = Number(m[3] || 0)
    return h * 3600 + mi * 60 + se
  }
  // 이미 숫자(초)이면 그대로
  const num = Number(s)
  return Number.isFinite(num) ? Math.round(num) : 0
}

// TIME 컬럼용 (00~23시 범위만, 그 외 null) — 최초 로그인/최종 로그아웃
function normClockTime(raw: any): string | null {
  const sec = timeToSec(raw)
  if (sec <= 0 || sec >= 86400) return null
  const h = Math.floor(sec / 3600)
  const mi = Math.floor((sec % 3600) / 60)
  const se = sec % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(h)}:${p(mi)}:${p(se)}`
}

function toInt(raw: any): number {
  const n = Number(String(raw == null ? '' : raw).trim().replace(/,/g, ''))
  return Number.isFinite(n) ? Math.round(n) : 0
}
function toDec(raw: any): number {
  const n = Number(String(raw == null ? '' : raw).trim().replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

// 일자 "2026-05" → monthly / "2026-05-21" → daily
function parsePeriod(raw: string): { label: string; kind: 'daily' | 'monthly' } | null {
  const s = String(raw || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { label: s, kind: 'daily' }
  if (/^\d{4}-\d{2}$/.test(s)) return { label: s, kind: 'monthly' }
  // "2026.05" / "2026.05.21" 변형 허용
  const mDay = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (mDay) return { label: `${mDay[1]}-${mDay[2].padStart(2, '0')}-${mDay[3].padStart(2, '0')}`, kind: 'daily' }
  const mMon = s.match(/^(\d{4})[.\-/](\d{1,2})$/)
  if (mMon) return { label: `${mMon[1]}-${mMon[2].padStart(2, '0')}`, kind: 'monthly' }
  return null
}

interface ParsedProd {
  id: string
  period_label: string
  period_kind: 'daily' | 'monthly'
  department: string | null
  agent_name: string | null
  agent_kt_id: string
  worker_id: string | null
  login_first: string | null
  login_last: string | null
  login_sec: number
  ib_count: number
  ib_talk_sec: number
  direct_ib_count: number
  direct_ib_talk_sec: number
  ob_count: number
  ob_attempt_count: number
  ob_talk_sec: number
  hold_count: number
  hold_sec: number
  acw_count: number
  acw_sec: number
  wait_count: number
  wait_sec: number
  away_count: number
  away_sec: number
  ib_att: number
  direct_ib_att: number
  ob_att: number
  avg_hold: number
  aht: number
  acw: number
  away_reasons: string // JSON string
  is_active: number
}

interface PlanRow {
  index: number
  status: 'ok' | 'skip-empty' | 'error'
  errors: string[]
  agent_name: string
  agent_kt_id: string
  period_label: string | null
  matched: boolean
  is_active: boolean
  parsed?: ParsedProd
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const mode: 'preview' | 'apply' = body?.mode === 'apply' ? 'apply' : 'preview'
    const rows: any[] = Array.isArray(body?.rows) ? body.rows : []
    if (rows.length === 0) {
      return NextResponse.json({ error: '행이 없습니다.' }, { status: 400 })
    }

    // ── 1) 상담원 매핑 (kt_id 우선, name 보조) ────────────────────
    let workers: any[] = []
    try {
      workers = await prisma.$queryRaw<any[]>`
        SELECT id, name, kt_id FROM cs_workers WHERE is_active = 1
      `
    } catch (e: any) {
      return NextResponse.json(
        { error: `cs_workers 조회 실패 — 마이그레이션(cs_workers.kt_id) 확인: ${e?.message || ''}` },
        { status: 500 },
      )
    }
    const byKtId = new Map<string, string>()
    const byName = new Map<string, string>()
    for (const w of workers) {
      if (w.kt_id) byKtId.set(String(w.kt_id).trim(), w.id)
      if (w.name) byName.set(String(w.name).trim(), w.id)
    }

    // ── 2) 테이블 존재 확인 ──────────────────────────────────────
    try {
      await prisma.$queryRaw`SELECT 1 FROM cs_agent_productivity LIMIT 1`
    } catch (e: any) {
      return NextResponse.json(
        { error: `cs_agent_productivity 테이블 없음 — 마이그레이션 적용 필요: ${e?.message || ''}` },
        { status: 500 },
      )
    }

    // ── 3) 행별 파싱 ─────────────────────────────────────────────
    const plan: PlanRow[] = []
    const seenInFile = new Set<string>()
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {}
      const errors: string[] = []

      const agentRaw = pickStr(r, '상담사명(ID)', '상담사명', '상담사')
      const periodRaw = pickStr(r, '일자')
      const { name: agentName, kt_id: agentKtId } = parseAgent(agentRaw)

      // 빈 행 — 상담사·일자 모두 없으면 skip
      if (!agentRaw && !periodRaw) {
        plan.push({
          index: i + 1, status: 'skip-empty', errors: [],
          agent_name: '', agent_kt_id: '', period_label: null,
          matched: false, is_active: false,
        })
        continue
      }

      if (!agentKtId) errors.push(`KT ID 추출 실패: "${agentRaw}"`)
      const period = parsePeriod(periodRaw)
      if (!period) errors.push(`일자 형식 오류: "${periodRaw}"`)

      const loginSec = timeToSec(pick(r, '로그인시간'))
      const isActive = loginSec > 0

      // 이석사유 1~3 → [{reason, sec}]
      const awayReasons: Array<{ reason: string; sec: number }> = []
      for (let n = 1; n <= 3; n++) {
        const reason = pickStr(r, `이석사유${n}`)
        const sec = timeToSec(pick(r, `이석사유별 시간${n}`, `이석사유별시간${n}`))
        if (reason) awayReasons.push({ reason, sec })
      }

      // 파일 내 중복 키 (period+kt_id) — 동일 시 마지막 행 우선
      const dupKey = `${period?.label || ''}|${agentKtId}`
      if (period && agentKtId && seenInFile.has(dupKey)) {
        errors.push(`파일 내 중복 (동일 기간·상담원): ${dupKey}`)
      }
      if (period && agentKtId) seenInFile.add(dupKey)

      let workerId: string | null = null
      if (agentKtId && byKtId.has(agentKtId)) workerId = byKtId.get(agentKtId)!
      else if (agentName && byName.has(agentName)) workerId = byName.get(agentName)!

      if (errors.length > 0 || !period || !agentKtId) {
        plan.push({
          index: i + 1, status: 'error', errors,
          agent_name: agentName, agent_kt_id: agentKtId,
          period_label: period?.label || null,
          matched: !!workerId, is_active: isActive,
        })
        continue
      }

      plan.push({
        index: i + 1, status: 'ok', errors: [],
        agent_name: agentName, agent_kt_id: agentKtId,
        period_label: period.label, matched: !!workerId, is_active: isActive,
        parsed: {
          id: crypto.randomUUID(),
          period_label: period.label,
          period_kind: period.kind,
          department: pickStr(r, '부서명') || null,
          agent_name: agentName || null,
          agent_kt_id: agentKtId,
          worker_id: workerId,
          login_first: normClockTime(pick(r, '최초 로그인시간', '최초로그인시간')),
          login_last: normClockTime(pick(r, '최종 로그아웃시간', '최종로그아웃시간')),
          login_sec: loginSec,
          ib_count: toInt(pick(r, 'IB건')),
          ib_talk_sec: timeToSec(pick(r, 'IB통화시간')),
          direct_ib_count: toInt(pick(r, '직통IB')),
          direct_ib_talk_sec: timeToSec(pick(r, '직통IB통화시간')),
          ob_count: toInt(pick(r, 'OB건')),
          ob_attempt_count: toInt(pick(r, 'OB시도건')),
          ob_talk_sec: timeToSec(pick(r, 'OB통화시간')),
          hold_count: toInt(pick(r, 'Hold건')),
          hold_sec: timeToSec(pick(r, 'Hold시간')),
          acw_count: toInt(pick(r, '후처리건')),
          acw_sec: timeToSec(pick(r, '후처리시간')),
          wait_count: toInt(pick(r, '대기건')),
          wait_sec: timeToSec(pick(r, '대기시간')),
          away_count: toInt(pick(r, '이석건')),
          away_sec: timeToSec(pick(r, '이석시간')),
          ib_att: toDec(pick(r, 'IB_ATT')),
          direct_ib_att: toDec(pick(r, '직통IB_ATT')),
          ob_att: toDec(pick(r, 'OB_ATT')),
          avg_hold: toDec(pick(r, '평균 Hold', '평균Hold')),
          aht: toDec(pick(r, 'AHT')),
          acw: toDec(pick(r, 'ACW')),
          away_reasons: JSON.stringify(awayReasons),
          is_active: isActive ? 1 : 0,
        },
      })
    }

    // ── 4) 요약 ──────────────────────────────────────────────────
    const usable = plan.filter((p) => p.status !== 'skip-empty')
    const periods = Array.from(
      new Set(usable.map((p) => p.period_label).filter((d): d is string => !!d)),
    ).sort()
    const unmatchedAgents = Array.from(
      new Set(usable.filter((p) => !p.matched && p.agent_name).map((p) => p.agent_name)),
    )
    const summary = {
      total: rows.length,
      usable: usable.length,
      empty: plan.filter((p) => p.status === 'skip-empty').length,
      ok: plan.filter((p) => p.status === 'ok').length,
      error: plan.filter((p) => p.status === 'error').length,
      active: usable.filter((p) => p.is_active).length,
      inactive: usable.filter((p) => !p.is_active).length,
      matched: usable.filter((p) => p.matched).length,
      unmatched: usable.filter((p) => !p.matched).length,
      unmatchedAgents,
      periods,
    }

    if (mode === 'preview') {
      return NextResponse.json({
        data: { mode, summary, plan: plan.slice(0, 300) },
        error: null,
      })
    }

    // ── 5) apply — INSERT ... ON DUPLICATE KEY UPDATE ────────────
    let inserted = 0
    for (const p of plan) {
      if (p.status !== 'ok' || !p.parsed) continue
      const x = p.parsed
      await prisma.$executeRaw`
        INSERT INTO cs_agent_productivity
          (id, period_label, period_kind, department, agent_name, agent_kt_id, worker_id,
           login_first, login_last, login_sec,
           ib_count, ib_talk_sec, direct_ib_count, direct_ib_talk_sec,
           ob_count, ob_attempt_count, ob_talk_sec,
           hold_count, hold_sec, acw_count, acw_sec, wait_count, wait_sec,
           away_count, away_sec, ib_att, direct_ib_att, ob_att,
           avg_hold, aht, acw, away_reasons, is_active, created_at)
        VALUES
          (${x.id}, ${x.period_label}, ${x.period_kind}, ${x.department},
           ${x.agent_name}, ${x.agent_kt_id}, ${x.worker_id},
           ${x.login_first}, ${x.login_last}, ${x.login_sec},
           ${x.ib_count}, ${x.ib_talk_sec}, ${x.direct_ib_count}, ${x.direct_ib_talk_sec},
           ${x.ob_count}, ${x.ob_attempt_count}, ${x.ob_talk_sec},
           ${x.hold_count}, ${x.hold_sec}, ${x.acw_count}, ${x.acw_sec},
           ${x.wait_count}, ${x.wait_sec}, ${x.away_count}, ${x.away_sec},
           ${x.ib_att}, ${x.direct_ib_att}, ${x.ob_att},
           ${x.avg_hold}, ${x.aht}, ${x.acw}, ${x.away_reasons}, ${x.is_active}, NOW())
        ON DUPLICATE KEY UPDATE
          period_kind = VALUES(period_kind),
          department = VALUES(department),
          agent_name = VALUES(agent_name),
          worker_id = VALUES(worker_id),
          login_first = VALUES(login_first),
          login_last = VALUES(login_last),
          login_sec = VALUES(login_sec),
          ib_count = VALUES(ib_count),
          ib_talk_sec = VALUES(ib_talk_sec),
          direct_ib_count = VALUES(direct_ib_count),
          direct_ib_talk_sec = VALUES(direct_ib_talk_sec),
          ob_count = VALUES(ob_count),
          ob_attempt_count = VALUES(ob_attempt_count),
          ob_talk_sec = VALUES(ob_talk_sec),
          hold_count = VALUES(hold_count),
          hold_sec = VALUES(hold_sec),
          acw_count = VALUES(acw_count),
          acw_sec = VALUES(acw_sec),
          wait_count = VALUES(wait_count),
          wait_sec = VALUES(wait_sec),
          away_count = VALUES(away_count),
          away_sec = VALUES(away_sec),
          ib_att = VALUES(ib_att),
          direct_ib_att = VALUES(direct_ib_att),
          ob_att = VALUES(ob_att),
          avg_hold = VALUES(avg_hold),
          aht = VALUES(aht),
          acw = VALUES(acw),
          away_reasons = VALUES(away_reasons),
          is_active = VALUES(is_active)
      `
      inserted++
    }

    return NextResponse.json({
      data: { mode, summary, inserted },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
