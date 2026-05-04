// ═══════════════════════════════════════════════════════════════════
// POST /api/call-scheduler/leaves/bulk-upload
//   { mode: 'preview' | 'apply', rows: [{ name, start_date, end_date, type, am_pm, reason }, ...] }
//   파싱은 클라이언트에서 (xlsx 라이브러리), 서버는 검증 + INSERT
//
// preview: 검증만 (이름 매칭, 날짜 형식, 종류 enum) 결과 반환
// apply:   status='approved' 로 일괄 INSERT (매니저 직접 등록 = 즉시 승인)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// 한국어 → enum 매핑
const TYPE_KOR_TO_EN: Record<string, string> = {
  '연차': 'annual',
  '패밀리데이': 'familyday',
  '패밀리': 'familyday',
  '병가': 'sick',
  '무급': 'unpaid',
  '경조': 'family',
  '공휴일': 'holiday',
  '공휴일휴무': 'holiday',
  '기타': 'other',
  // enum 그대로도 허용
  'annual': 'annual',
  'familyday': 'familyday',
  'sick': 'sick',
  'unpaid': 'unpaid',
  'family': 'family',
  'holiday': 'holiday',
  'other': 'other',
}

const AM_PM_MAP: Record<string, 'full' | 'am' | 'pm' | 'custom'> = {
  'full': 'full', '종일': 'full', '': 'full',
  'am': 'am', '오전': 'am', '오전반차': 'am',
  'pm': 'pm', '오후': 'pm', '오후반차': 'pm',
  'custom': 'custom', '시간': 'custom', '시간지정': 'custom',
}

interface InputRow {
  name?: string
  start_date?: string
  end_date?: string
  type?: string
  am_pm?: string
  hours?: string | number  // custom 일 때
  reason?: string
}

interface PlanRow {
  index: number  // 1-based
  raw: InputRow
  status: 'ok' | 'skip-empty' | 'error'
  errors: string[]
  parsed?: {
    worker_id: string
    worker_name: string
    leave_type: string
    start_date: string
    end_date: string
    am_pm: 'full' | 'am' | 'pm' | 'custom'
    hours: number
    reason: string | null
  }
}

function normalizeDate(s: string | undefined): string | null {
  if (!s) return null
  const trimmed = String(s).trim()
  if (!trimmed) return null
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  // YYYY-M-D 또는 YYYY/MM/DD 등 허용
  const m = trimmed.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Excel 일련번호 → Date (XLSX 파서가 일자 객체로 줄 수 있음)
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed)
    if (num > 25569) {
      const date = new Date((num - 25569) * 86400 * 1000)
      return date.toISOString().substring(0, 10)
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const body = await request.json()
    const mode: 'preview' | 'apply' = body?.mode === 'apply' ? 'apply' : 'preview'
    const rows: InputRow[] = Array.isArray(body?.rows) ? body.rows : []

    if (rows.length === 0) {
      return NextResponse.json({ error: '행이 없습니다.' }, { status: 400 })
    }

    // 1) 워커 이름 → id 매핑
    const workerRows = await prisma.$queryRaw<any[]>`
      SELECT id, name FROM cs_workers WHERE is_active = 1
    `
    const workerByName = new Map<string, string>()
    for (const w of workerRows) {
      workerByName.set(String(w.name).trim(), w.id)
    }

    // 2) 행별 검증
    const plan: PlanRow[] = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const errors: string[] = []
      const name = String(r.name || '').trim().replace(/\s*\(예시\)\s*$/, '')

      // 빈 행 — 이름이 없으면 스킵 (오류 아님)
      if (!name && !r.start_date && !r.type) {
        plan.push({ index: i + 1, raw: r, status: 'skip-empty', errors: [] })
        continue
      }

      if (!name) errors.push('이름 누락')
      const wId = workerByName.get(name)
      if (name && !wId) errors.push(`이름 매칭 실패 (cs_workers 에 "${name}" 없음)`)

      const start = normalizeDate(r.start_date)
      const end = normalizeDate(r.end_date) || start
      if (!start) errors.push('시작일 형식 오류 (YYYY-MM-DD)')
      if (start && end && end < start) errors.push('종료일이 시작일보다 빠름')

      const typeKey = String(r.type || '').trim()
      const leave_type = TYPE_KOR_TO_EN[typeKey]
      if (!leave_type && typeKey) errors.push(`종류 인식 불가: "${typeKey}"`)

      const amPmKey = String(r.am_pm || 'full').trim()
      const am_pm = AM_PM_MAP[amPmKey]
      if (!am_pm) errors.push(`반차 값 인식 불가: "${amPmKey}"`)

      // hours 처리
      let hours = 0
      if (am_pm === 'custom') {
        const h = Number(r.hours)
        if (!Number.isFinite(h) || h <= 0 || h > 24) {
          errors.push(`custom 시간 값 오류: "${r.hours}"`)
        } else {
          hours = h
        }
      } else if (am_pm === 'full') {
        hours = 8
      } else if (am_pm === 'am' || am_pm === 'pm') {
        hours = 4
      }

      if (errors.length > 0) {
        plan.push({ index: i + 1, raw: r, status: 'error', errors })
      } else {
        plan.push({
          index: i + 1, raw: r, status: 'ok', errors: [],
          parsed: {
            worker_id: wId!,
            worker_name: name,
            leave_type: leave_type || 'annual',
            start_date: start!,
            end_date: end!,
            am_pm: am_pm!,
            hours,
            reason: String(r.reason || '').trim() || null,
          },
        })
      }
    }

    const summary = {
      total: rows.length,
      ok: plan.filter(p => p.status === 'ok').length,
      empty: plan.filter(p => p.status === 'skip-empty').length,
      error: plan.filter(p => p.status === 'error').length,
    }

    if (mode === 'preview') {
      return NextResponse.json({
        data: { mode, summary, plan }, error: null,
      })
    }

    // 3) apply — ok 행만 INSERT (status='approved')
    let inserted = 0
    const okRows = plan.filter(p => p.status === 'ok')
    const now = new Date()
    for (const p of okRows) {
      const x = p.parsed!
      const id = crypto.randomUUID()
      await prisma.$executeRaw`
        INSERT INTO cs_leaves
          (id, worker_id, leave_type, start_date, end_date, am_pm, hours, reason, status,
           applied_at, applied_by, requested_by, approved_at, approved_by,
           created_at, updated_at)
        VALUES
          (${id}, ${x.worker_id}, ${x.leave_type}, ${x.start_date}, ${x.end_date},
           ${x.am_pm}, ${x.hours}, ${x.reason}, 'approved',
           ${now}, ${user.id}, ${user.id}, ${now}, ${user.id},
           NOW(), NOW())
      `
      inserted++
    }

    return NextResponse.json({
      data: { mode, summary, plan, inserted },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
