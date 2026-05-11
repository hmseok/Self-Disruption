import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * /api/operations/consultations — PR-OPS-1.4a
 *
 * 차량운영 「상담 누적」 — 단일 dispatch_order 에 여러 상담 row 시간순 누적.
 * 상담원 기록 스타일 (상담 시점 + 상담원 + category + note).
 *
 * 상위 설계: _docs/OPERATIONS-REDESIGN-V2.md § 9.5 v2.1
 * 마이그:    migrations/2026-05-11_operations_consultations.sql
 *
 * GET ?dispatch_order_id={uuid}&limit=200
 *     - DESC list (created_at desc, id desc)
 *     - Rule 23 graceful fallback: 테이블 미적용 시 빈 배열 + _migration_pending
 *
 * POST { dispatch_order_id, note (required), category? }
 *     - dispatch_order 존재 확인 (404)
 *     - note trim 후 빈 문자열 거부 (400)
 *     - category ENUM 화이트리스트 외 'followup' 강제
 *     - created_by 는 verifyUser 결과만 사용 (클라 입력 무시)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_CATEGORIES = [
  'intake',
  'followup',
  'status_change',
  'dispatch',
  'return',
  'billing',
  'other',
] as const

type Category = (typeof ALLOWED_CATEGORIES)[number]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isMigrationMissing(err: unknown): boolean {
  const msg = (err as { message?: string })?.message || ''
  return msg.includes("doesn't exist") || msg.includes('Unknown table')
}

// ─── GET ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const url = new URL(request.url)
    const dispatchOrderId = url.searchParams.get('dispatch_order_id')

    if (!dispatchOrderId || !UUID_RE.test(dispatchOrderId)) {
      return NextResponse.json(
        { error: 'dispatch_order_id required (uuid)' },
        { status: 400 },
      )
    }

    const limit = Math.min(Number(url.searchParams.get('limit') || 200), 1000)

    // Rule 23 graceful fallback: 테이블 미적용 시 빈 배열
    const rows = await prisma
      .$queryRawUnsafe<Array<any>>(
        `SELECT id, dispatch_order_id, note, category, created_at, created_by
           FROM operations_consultations
          WHERE dispatch_order_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit}`,
        dispatchOrderId,
      )
      .catch((e: unknown) => {
        if (isMigrationMissing(e)) {
          console.warn(
            '[consultations GET] table not yet migrated:',
            (e as { message?: string })?.message?.slice(0, 200),
          )
          return null
        }
        throw e
      })

    if (rows === null) {
      return NextResponse.json({
        data: [],
        total: 0,
        _migration_pending: true,
      })
    }

    return NextResponse.json({
      data: rows,
      total: rows.length,
    })
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message || 'unknown error'
    console.error('[consultations GET]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── POST ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const {
      dispatch_order_id: dispatchOrderId,
      note: noteRaw,
      category: categoryInput,
    } = body || {}

    // 1) dispatch_order_id UUID 검증
    if (!dispatchOrderId || typeof dispatchOrderId !== 'string' || !UUID_RE.test(dispatchOrderId)) {
      return NextResponse.json(
        { error: 'dispatch_order_id required (uuid)' },
        { status: 400 },
      )
    }

    // 2) note 검증 (trim 후 빈 문자열 거부)
    const note = typeof noteRaw === 'string' ? noteRaw.trim() : ''
    if (!note) {
      return NextResponse.json({ error: 'note required (non-empty)' }, { status: 400 })
    }
    // 본문 5,000자 제한 (TEXT 64KB 안전 마진)
    if (note.length > 5000) {
      return NextResponse.json(
        { error: 'note too long (max 5000 chars)' },
        { status: 400 },
      )
    }

    // 3) dispatch_order 존재 확인 — 마이그 미적용 케이스 함께 진단
    let dispatchExists = false
    try {
      const exists = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM operations_dispatch_orders WHERE id = ? LIMIT 1`,
        dispatchOrderId,
      )
      dispatchExists = exists.length > 0
    } catch (e: unknown) {
      if (isMigrationMissing(e)) {
        return NextResponse.json(
          {
            error:
              'operations_dispatch_orders 테이블 미적용 — Phase 1.1 마이그 SQL 실행 필요',
            _migration_pending: true,
            sql_file: 'migrations/2026-05-11_operations_dispatch_orders.sql',
          },
          { status: 503 },
        )
      }
      throw e
    }

    if (!dispatchExists) {
      return NextResponse.json(
        { error: 'dispatch_order not found' },
        { status: 404 },
      )
    }

    // 4) category ENUM 화이트리스트 외 'followup' 강제
    const category: Category = ALLOWED_CATEGORIES.includes(categoryInput as Category)
      ? (categoryInput as Category)
      : 'followup'

    // 5) INSERT — created_by 는 서버 verifyUser 결과만
    //    verifyUser 반환: { id, company_id, email, role } — id 사용
    const newId = randomUUID()
    const createdBy = (user as { id?: string }).id || null

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO operations_consultations
           (id, dispatch_order_id, note, category, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        newId,
        dispatchOrderId,
        note,
        category,
        createdBy,
      )
    } catch (e: unknown) {
      if (isMigrationMissing(e)) {
        return NextResponse.json(
          {
            error:
              'operations_consultations 테이블 미적용 — 마이그레이션 SQL 실행 필요',
            _migration_pending: true,
            sql_file: 'migrations/2026-05-11_operations_consultations.sql',
          },
          { status: 503 },
        )
      }
      throw e
    }

    // 6) 응답 — 클라 prepend 용 row 형태
    return NextResponse.json({
      ok: true,
      id: newId,
      dispatch_order_id: dispatchOrderId,
      note,
      category,
      created_at: new Date().toISOString(),
      created_by: createdBy,
    })
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message || 'unknown error'
    console.error('[consultations POST]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
