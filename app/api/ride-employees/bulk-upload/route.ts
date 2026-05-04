// ═══════════════════════════════════════════════════════════════════
// POST /api/ride-employees/bulk-upload
//   { mode: 'preview' | 'apply', rows: [{ name, department, position, ... }, ...] }
//   같은 이름 이미 있으면 skip (중복 방지)
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

const COLOR_TONES = new Set(['blue', 'gray', 'green', 'amber', 'violet', 'red', 'none'])

interface InputRow {
  name?: string
  department?: string
  position?: string
  employment_type?: string
  hire_date?: string
  phone?: string
  email?: string
  group_label?: string
  color_tone?: string
  memo?: string
}

interface PlanRow {
  index: number
  raw: InputRow
  status: 'ok' | 'skip-empty' | 'skip-duplicate' | 'error'
  errors: string[]
  parsed?: {
    name: string
    department: string | null
    position: string | null
    employment_type: string | null
    hire_date: string | null
    phone: string | null
    email: string | null
    group_label: string | null
    color_tone: string
    memo: string | null
  }
}

function normalizeDate(s: string | undefined): string | null {
  if (!s) return null
  const trimmed = String(s).trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const m = trimmed.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
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

    // 1) 기존 활성 직원 이름 set
    const existing = await prisma.$queryRaw<any[]>`
      SELECT name FROM ride_employees WHERE is_active = 1
    `
    const existingNames = new Set(existing.map(e => String(e.name).trim()))

    // 2) 행별 검증
    const plan: PlanRow[] = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const errors: string[] = []
      const name = String(r.name || '').trim().replace(/\s*\(예시\)\s*$/, '')

      if (!name && !r.department && !r.position) {
        plan.push({ index: i + 1, raw: r, status: 'skip-empty', errors: [] })
        continue
      }

      if (!name) errors.push('이름 누락')
      if (existingNames.has(name)) {
        plan.push({
          index: i + 1, raw: r, status: 'skip-duplicate',
          errors: [`이미 등록됨: ${name}`],
        })
        continue
      }

      const hire_date = r.hire_date ? normalizeDate(r.hire_date) : null
      if (r.hire_date && !hire_date) errors.push('입사일 형식 오류 (YYYY-MM-DD)')

      const color_tone = String(r.color_tone || 'none').trim()
      if (!COLOR_TONES.has(color_tone)) {
        errors.push(`색상 값 오류: "${color_tone}" (허용: ${Array.from(COLOR_TONES).join(', ')})`)
      }

      if (errors.length > 0) {
        plan.push({ index: i + 1, raw: r, status: 'error', errors })
      } else {
        plan.push({
          index: i + 1, raw: r, status: 'ok', errors: [],
          parsed: {
            name,
            department: String(r.department || '').trim() || null,
            position: String(r.position || '').trim() || null,
            employment_type: String(r.employment_type || '').trim() || null,
            hire_date,
            phone: String(r.phone || '').trim() || null,
            email: String(r.email || '').trim() || null,
            group_label: String(r.group_label || '').trim() || null,
            color_tone,
            memo: String(r.memo || '').trim() || null,
          },
        })
      }
    }

    const summary = {
      total: rows.length,
      ok: plan.filter(p => p.status === 'ok').length,
      empty: plan.filter(p => p.status === 'skip-empty').length,
      duplicate: plan.filter(p => p.status === 'skip-duplicate').length,
      error: plan.filter(p => p.status === 'error').length,
    }

    if (mode === 'preview') {
      return NextResponse.json({
        data: { mode, summary, plan }, error: null,
      })
    }

    // 3) apply
    let inserted = 0
    for (const p of plan.filter(p => p.status === 'ok')) {
      const x = p.parsed!
      const id = crypto.randomUUID()
      await prisma.$executeRaw`
        INSERT INTO ride_employees
          (id, name, department, position, employment_type, hire_date,
           phone, email, group_label, color_tone, memo, is_active, created_at, updated_at)
        VALUES
          (${id}, ${x.name}, ${x.department}, ${x.position}, ${x.employment_type},
           ${x.hire_date ? new Date(x.hire_date) : null},
           ${x.phone}, ${x.email}, ${x.group_label}, ${x.color_tone}, ${x.memo},
           1, NOW(), NOW())
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
