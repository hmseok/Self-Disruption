// ═══════════════════════════════════════════════════════════════════
// POST /api/call-scheduler/kpi/upload-call-records
//   KT 상담이력조회 엑셀 → cs_call_records
//   { mode: 'preview' | 'apply', rows: any[] }
//     rows = 클라이언트(xlsx)가 파싱한 시트 행들 (object 또는 array 모두 허용)
//
//   preview: 검증만 (행수/매칭/기간/중복). DB 변경 X.
//   apply:   INSERT IGNORE (call_key UNIQUE — 재업로드 멱등, 규칙 24)
//
//   KPI-DESIGN.md §5-1 / §6 / 마이그레이션 2026-05-21_cs_call_records.sql
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// ── KT 엑셀 헤더 → 표준 키 (헤더 텍스트 변형 대비 정규식 매칭) ──────
function pick(r: Record<string, any>, ...names: string[]): string {
  for (const n of names) {
    for (const k of Object.keys(r)) {
      if (String(k).trim().replace(/\s+/g, '') === n.replace(/\s+/g, '')) {
        const v = r[k]
        return v == null ? '' : String(v).trim()
      }
    }
  }
  return ''
}

// "이경미(ride_kmlee10)" → { name, kt_id }
function parseAgent(raw: string): { name: string; kt_id: string } {
  const s = String(raw || '').trim()
  const m = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (m) return { name: m[1].trim(), kt_id: m[2].trim() }
  return { name: s, kt_id: '' }
}

// "2026.05.21" / "2026-05-21" / "2026/5/1" → "2026-05-21"
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

// "HH:MM:SS" / "HH:MM" → 초 (실패 시 null)
function timeToSec(raw: string): number | null {
  const s = String(raw || '').trim()
  if (!s) return null
  const m = s.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/)
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2]), se = Number(m[3] || 0)
  if (!Number.isFinite(h) || !Number.isFinite(mi) || !Number.isFinite(se)) return null
  return h * 3600 + mi * 60 + se
}

// "HH:MM:SS" 표준화 (DB TIME 컬럼 — 00~23시 범위 가정, 그 외 null)
function normTime(raw: string): string | null {
  const sec = timeToSec(raw)
  if (sec == null || sec < 0 || sec >= 86400) return null
  const h = Math.floor(sec / 3600)
  const mi = Math.floor((sec % 3600) / 60)
  const se = sec % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(h)}:${p(mi)}:${p(se)}`
}

interface PlanRow {
  index: number
  status: 'ok' | 'skip-empty' | 'duplicate'
  agent_name: string
  agent_kt_id: string
  call_date: string | null
  matched: boolean
  parsed?: {
    id: string
    call_key: string
    center: string | null
    channel: string | null
    type1: string | null
    type2: string | null
    type3: string | null
    type4: string | null
    agent_name: string | null
    agent_kt_id: string | null
    department: string | null
    position: string | null
    transfer_count: number
    call_date: string | null
    start_time: string | null
    end_time: string | null
    duration_sec: number
    caller_phone: string | null
    session_key: string | null
    worker_id: string | null
  }
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

    // ── 1) 상담원 매핑 인덱스 (kt_id 우선, name 보조) ─────────────
    let workers: any[] = []
    try {
      workers = await prisma.$queryRaw<any[]>`
        SELECT id, name, kt_id FROM cs_workers WHERE is_active = 1
      `
    } catch (e: any) {
      return NextResponse.json(
        { error: `cs_workers 조회 실패 — 마이그레이션(cs_workers.kt_id) 적용 여부 확인: ${e?.message || ''}` },
        { status: 500 },
      )
    }
    const byKtId = new Map<string, string>()
    const byName = new Map<string, string>()
    for (const w of workers) {
      if (w.kt_id) byKtId.set(String(w.kt_id).trim(), w.id)
      if (w.name) byName.set(String(w.name).trim(), w.id)
    }

    // ── 2) 기존 call_key (중복 판정용) ───────────────────────────
    let existingKeys = new Set<string>()
    try {
      const existing = await prisma.$queryRaw<any[]>`SELECT call_key FROM cs_call_records`
      existingKeys = new Set(existing.map((r) => String(r.call_key)))
    } catch (e: any) {
      return NextResponse.json(
        { error: `cs_call_records 테이블 없음 — 마이그레이션 적용 필요: ${e?.message || ''}` },
        { status: 500 },
      )
    }

    // ── 3) 행별 파싱 ─────────────────────────────────────────────
    const plan: PlanRow[] = []
    const seenInFile = new Set<string>()
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {}
      const callKey = pick(r, '콜키')

      // 콜키 빈 행 skip
      if (!callKey) {
        plan.push({
          index: i + 1, status: 'skip-empty',
          agent_name: '', agent_kt_id: '', call_date: null, matched: false,
        })
        continue
      }

      const agentRaw = pick(r, '상담사')
      const { name: agentName, kt_id: agentKtId } = parseAgent(agentRaw)
      const callDate = parseDate(pick(r, '상담일'))
      const startTime = normTime(pick(r, '시작시간'))
      const endTime = normTime(pick(r, '종료시간'))

      // 통화시간 — 종료-시작 (자정 넘김 보정)
      let durationSec = 0
      const sSec = timeToSec(pick(r, '시작시간'))
      const eSec = timeToSec(pick(r, '종료시간'))
      if (sSec != null && eSec != null) {
        durationSec = eSec - sSec
        if (durationSec < 0) durationSec += 86400
      }

      // 상담원 매핑: kt_id → name
      let workerId: string | null = null
      if (agentKtId && byKtId.has(agentKtId)) workerId = byKtId.get(agentKtId)!
      else if (agentName && byName.has(agentName)) workerId = byName.get(agentName)!

      const transferRaw = Number(pick(r, '호전환회수'))
      const status: PlanRow['status'] =
        existingKeys.has(callKey) || seenInFile.has(callKey) ? 'duplicate' : 'ok'
      seenInFile.add(callKey)

      plan.push({
        index: i + 1,
        status,
        agent_name: agentName,
        agent_kt_id: agentKtId,
        call_date: callDate,
        matched: !!workerId,
        parsed: {
          id: crypto.randomUUID(),
          call_key: callKey.substring(0, 64),
          center: pick(r, '상담센터') || null,
          channel: pick(r, '채널정보') || null,
          type1: pick(r, '상담유형1') || null,
          type2: pick(r, '상담유형2') || null,
          type3: pick(r, '상담유형3') || null,
          type4: pick(r, '상담유형4') || null,
          agent_name: agentName || null,
          agent_kt_id: agentKtId || null,
          department: pick(r, '부서') || null,
          position: pick(r, '직급') || null,
          transfer_count: Number.isFinite(transferRaw) ? transferRaw : 0,
          call_date: callDate,
          start_time: startTime,
          end_time: endTime,
          duration_sec: durationSec,
          caller_phone: pick(r, '발신자전화번호') || null,
          session_key: (pick(r, '세션키') || '').substring(0, 64) || null,
          worker_id: workerId,
        },
      })
    }

    // ── 4) 요약 ──────────────────────────────────────────────────
    const usable = plan.filter((p) => p.status !== 'skip-empty')
    const dates = usable.map((p) => p.call_date).filter((d): d is string => !!d).sort()
    const unmatchedAgents = Array.from(
      new Set(usable.filter((p) => !p.matched && p.agent_name).map((p) => p.agent_name)),
    )
    const summary = {
      total: rows.length,
      usable: usable.length,
      empty: plan.filter((p) => p.status === 'skip-empty').length,
      duplicate: plan.filter((p) => p.status === 'duplicate').length,
      newRows: plan.filter((p) => p.status === 'ok').length,
      matched: usable.filter((p) => p.matched).length,
      unmatched: usable.filter((p) => !p.matched).length,
      unmatchedAgents,
      periodFrom: dates[0] || null,
      periodTo: dates[dates.length - 1] || null,
    }

    if (mode === 'preview') {
      return NextResponse.json({
        data: { mode, summary, plan: plan.slice(0, 300) },
        error: null,
      })
    }

    // ── 5) apply — INSERT IGNORE (call_key UNIQUE 멱등) ──────────
    let inserted = 0
    for (const p of plan) {
      if (p.status === 'skip-empty' || !p.parsed) continue
      const x = p.parsed
      const res = await prisma.$executeRaw`
        INSERT IGNORE INTO cs_call_records
          (id, call_key, center, channel, type1, type2, type3, type4,
           agent_name, agent_kt_id, department, position, transfer_count,
           call_date, start_time, end_time, duration_sec, caller_phone,
           session_key, worker_id, created_at)
        VALUES
          (${x.id}, ${x.call_key}, ${x.center}, ${x.channel},
           ${x.type1}, ${x.type2}, ${x.type3}, ${x.type4},
           ${x.agent_name}, ${x.agent_kt_id}, ${x.department}, ${x.position},
           ${x.transfer_count}, ${x.call_date}, ${x.start_time}, ${x.end_time},
           ${x.duration_sec}, ${x.caller_phone}, ${x.session_key}, ${x.worker_id},
           NOW())
      `
      inserted += Number(res) > 0 ? 1 : 0
    }

    return NextResponse.json({
      data: { mode, summary, inserted, skipped: summary.usable - inserted },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
