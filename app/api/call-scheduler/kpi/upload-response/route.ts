// ═══════════════════════════════════════════════════════════════════
// POST /api/call-scheduler/kpi/upload-response
//   KT 응대현황 엑셀 → cs_response_ivr / cs_response_queue
//   { kind: 'ivr' | 'queue', mode: 'preview' | 'apply', rows: any[] }
//     rows = 클라이언트(xlsx)가 파싱한 시트 행들 (object 배열)
//
//   kind='ivr'   → cs_response_ivr   (UNIQUE = stat_date + callee_number)
//   kind='queue' → cs_response_queue (UNIQUE = stat_date + skill)
//
//   preview: 검증만 (행수/기간/중복). DB 변경 X.
//   apply:   INSERT ... ON DUPLICATE KEY UPDATE (재업로드 멱등, 규칙 24)
//
//   「합계」 행·날짜 파싱 실패 행 skip.
//   KPI-DESIGN.md / 마이그레이션 2026-05-22_cs_response.sql
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// ── 헤더 → 표준 키 (헤더 텍스트 변형/공백 차이 대비) ───────────────
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

// "2026.05.22" / "2026-05-22" / "2026/5/1" → "2026-05-22" (실패 시 null)
function parseDate(raw: string): string | null {
  const s = String(raw || '').trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  // Excel 일련번호
  if (/^\d+$/.test(s)) {
    const num = Number(s)
    if (num > 25569) return new Date((num - 25569) * 86400 * 1000).toISOString().substring(0, 10)
  }
  return null
}

// "HH:MM:SS" / "HH:MM" → 초 (실패/빈값 시 0)
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

function toInt(raw: any): number {
  const n = Number(String(raw == null ? '' : raw).trim().replace(/,/g, ''))
  return Number.isFinite(n) ? Math.round(n) : 0
}
function toDec(raw: any): number {
  const n = Number(String(raw == null ? '' : raw).trim().replace(/,/g, '').replace(/%/g, ''))
  return Number.isFinite(n) ? n : 0
}

// 「합계」/「소계」/「Total」 행 판정 (일자 컬럼 텍스트로 식별)
function isTotalRow(dateRaw: string): boolean {
  const s = String(dateRaw || '').trim()
  return /^(합\s*계|소\s*계|total|합산)$/i.test(s)
}

interface IvrParsed {
  id: string
  stat_date: string
  callee_number: string
  scenario: string | null
  total_inbound: number
  answered: number
  abandoned: number
  agent_connect_req: number
  service_completed: number
}
interface QueueParsed {
  id: string
  stat_date: string
  skill: string
  inbound: number
  wait_time_sec: number
  answered: number
  answer_rate: number
  abandoned: number
  service_level: number
  answered_in_20s: number
  abandoned_in_20s: number
  avg_wait_sec: number
}

interface PlanRow {
  index: number
  status: 'ok' | 'skip-total' | 'skip-empty' | 'duplicate'
  stat_date: string | null
  label: string          // callee_number(ivr) 또는 skill(queue)
  ivr?: IvrParsed
  queue?: QueueParsed
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const kind: 'ivr' | 'queue' = body?.kind === 'queue' ? 'queue' : 'ivr'
    const mode: 'preview' | 'apply' = body?.mode === 'apply' ? 'apply' : 'preview'
    const rows: any[] = Array.isArray(body?.rows) ? body.rows : []
    if (rows.length === 0) {
      return NextResponse.json({ error: '행이 없습니다.' }, { status: 400 })
    }

    const table = kind === 'ivr' ? 'cs_response_ivr' : 'cs_response_queue'

    // ── 1) 기존 UNIQUE 키 (중복 판정용) — graceful ──────────────
    const existingKeys = new Set<string>()
    try {
      if (kind === 'ivr') {
        const ex = await prisma.$queryRaw<any[]>`
          SELECT stat_date, callee_number FROM cs_response_ivr
        `
        for (const r of ex) {
          const d = r.stat_date instanceof Date
            ? r.stat_date.toISOString().substring(0, 10)
            : String(r.stat_date).substring(0, 10)
          existingKeys.add(`${d}|${String(r.callee_number)}`)
        }
      } else {
        const ex = await prisma.$queryRaw<any[]>`
          SELECT stat_date, skill FROM cs_response_queue
        `
        for (const r of ex) {
          const d = r.stat_date instanceof Date
            ? r.stat_date.toISOString().substring(0, 10)
            : String(r.stat_date).substring(0, 10)
          existingKeys.add(`${d}|${String(r.skill)}`)
        }
      }
    } catch (e: any) {
      return NextResponse.json(
        { error: `${table} 테이블 없음 — 마이그레이션(2026-05-22_cs_response.sql) 적용 필요: ${e?.message || ''}` },
        { status: 500 },
      )
    }

    // ── 2) 행별 파싱 ─────────────────────────────────────────────
    const plan: PlanRow[] = []
    const seenInFile = new Set<string>()

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {}
      const dateRaw = pickStr(r, '일자')

      // 「합계」 행 skip
      if (isTotalRow(dateRaw)) {
        plan.push({ index: i + 1, status: 'skip-total', stat_date: null, label: '' })
        continue
      }

      const statDate = parseDate(dateRaw)

      if (kind === 'ivr') {
        const callee = pickStr(r, '착신전화번호').replace(/[^0-9]/g, '')
        // 날짜 파싱 실패 or 착신번호 없음 → skip
        if (!statDate || !callee) {
          plan.push({ index: i + 1, status: 'skip-empty', stat_date: statDate, label: callee })
          continue
        }
        const dupKey = `${statDate}|${callee}`
        const status: PlanRow['status'] =
          existingKeys.has(dupKey) || seenInFile.has(dupKey) ? 'duplicate' : 'ok'
        seenInFile.add(dupKey)

        plan.push({
          index: i + 1, status, stat_date: statDate, label: callee,
          ivr: {
            id: crypto.randomUUID(),
            stat_date: statDate,
            callee_number: callee.substring(0, 30),
            scenario: (pickStr(r, '시나리오명') || '').substring(0, 80) || null,
            total_inbound: toInt(pick(r, '총인입')),
            answered: toInt(pick(r, '응대')),
            abandoned: toInt(pick(r, '포기호')),
            agent_connect_req: toInt(pick(r, '상담사연결요청건')),
            service_completed: toInt(pick(r, '서비스완료')),
          },
        })
      } else {
        const skill = pickStr(r, '스킬')
        // 날짜 파싱 실패 or 스킬 없음 → skip
        if (!statDate || !skill) {
          plan.push({ index: i + 1, status: 'skip-empty', stat_date: statDate, label: skill })
          continue
        }
        const dupKey = `${statDate}|${skill}`
        const status: PlanRow['status'] =
          existingKeys.has(dupKey) || seenInFile.has(dupKey) ? 'duplicate' : 'ok'
        seenInFile.add(dupKey)

        plan.push({
          index: i + 1, status, stat_date: statDate, label: skill,
          queue: {
            id: crypto.randomUUID(),
            stat_date: statDate,
            skill: skill.substring(0, 60),
            inbound: toInt(pick(r, '인입')),
            wait_time_sec: timeToSec(pick(r, '인입호 대기시간', '인입호대기시간')),
            answered: toInt(pick(r, '응대')),
            answer_rate: toDec(pick(r, '응대율(%)', '응대율')),
            abandoned: toInt(pick(r, '총포기호')),
            service_level: toDec(pick(r, '서비스레벨(%)', '서비스레벨')),
            answered_in_20s: toInt(pick(r, '20초내 응대호', '20초내응대호')),
            abandoned_in_20s: toInt(pick(r, '20초내 포기호', '20초내포기호')),
            avg_wait_sec: timeToSec(pick(r, '평균고객대기시간')),
          },
        })
      }
    }

    // ── 3) 요약 ──────────────────────────────────────────────────
    const usable = plan.filter((p) => p.status === 'ok' || p.status === 'duplicate')
    const dates = usable
      .map((p) => p.stat_date)
      .filter((d): d is string => !!d)
      .sort()
    const summary = {
      kind,
      total: rows.length,
      usable: usable.length,
      newRows: plan.filter((p) => p.status === 'ok').length,
      duplicate: plan.filter((p) => p.status === 'duplicate').length,
      skippedTotal: plan.filter((p) => p.status === 'skip-total').length,
      skippedEmpty: plan.filter((p) => p.status === 'skip-empty').length,
      periodFrom: dates[0] || null,
      periodTo: dates[dates.length - 1] || null,
    }

    if (mode === 'preview') {
      return NextResponse.json({
        data: { mode, kind, summary, plan: plan.slice(0, 300) },
        error: null,
      })
    }

    // ── 4) apply — INSERT ... ON DUPLICATE KEY UPDATE ───────────
    let inserted = 0
    for (const p of plan) {
      if (p.status === 'skip-total' || p.status === 'skip-empty') continue

      if (kind === 'ivr' && p.ivr) {
        const x = p.ivr
        await prisma.$executeRaw`
          INSERT INTO cs_response_ivr
            (id, stat_date, callee_number, scenario, total_inbound,
             answered, abandoned, agent_connect_req, service_completed, created_at)
          VALUES
            (${x.id}, ${x.stat_date}, ${x.callee_number}, ${x.scenario},
             ${x.total_inbound}, ${x.answered}, ${x.abandoned},
             ${x.agent_connect_req}, ${x.service_completed}, NOW())
          ON DUPLICATE KEY UPDATE
            scenario = VALUES(scenario),
            total_inbound = VALUES(total_inbound),
            answered = VALUES(answered),
            abandoned = VALUES(abandoned),
            agent_connect_req = VALUES(agent_connect_req),
            service_completed = VALUES(service_completed)
        `
        inserted++
      } else if (kind === 'queue' && p.queue) {
        const x = p.queue
        await prisma.$executeRaw`
          INSERT INTO cs_response_queue
            (id, stat_date, skill, inbound, wait_time_sec, answered, answer_rate,
             abandoned, service_level, answered_in_20s, abandoned_in_20s,
             avg_wait_sec, created_at)
          VALUES
            (${x.id}, ${x.stat_date}, ${x.skill}, ${x.inbound}, ${x.wait_time_sec},
             ${x.answered}, ${x.answer_rate}, ${x.abandoned}, ${x.service_level},
             ${x.answered_in_20s}, ${x.abandoned_in_20s}, ${x.avg_wait_sec}, NOW())
          ON DUPLICATE KEY UPDATE
            inbound = VALUES(inbound),
            wait_time_sec = VALUES(wait_time_sec),
            answered = VALUES(answered),
            answer_rate = VALUES(answer_rate),
            abandoned = VALUES(abandoned),
            service_level = VALUES(service_level),
            answered_in_20s = VALUES(answered_in_20s),
            abandoned_in_20s = VALUES(abandoned_in_20s),
            avg_wait_sec = VALUES(avg_wait_sec)
        `
        inserted++
      }
    }

    return NextResponse.json({
      data: { mode, kind, summary, inserted },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
