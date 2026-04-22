import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ============================================================
// /api/cost-standards — 3-Layer 원가 통합 API
//   GET  ?view=tree     → 스코프 + 값 조인
//   GET  ?view=updates  → 자동반영 알림큐 (미확인 우선)
//   POST                → 새 스코프 추가 (scope_type, ...)
//   PATCH ?op=value     → 값 갱신 (market/our) + 알림큐 기록
//   PATCH ?op=update    → 알림 읽음 / 롤백
// ============================================================

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

// ─── GET ───
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const view = request.nextUrl.searchParams.get('view') || 'tree'

    if (view === 'updates') {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT u.*, s.display_label
           FROM cost_auto_updates u
           JOIN cost_standards_scope s ON s.id = u.scope_id
          ORDER BY u.is_read ASC, u.created_at DESC
          LIMIT 100`,
      )
      return NextResponse.json({ data: serialize(rows), error: null })
    }

    // tree: scope + value LEFT JOIN
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         s.id          AS scope_id,
         s.scope_type,
         s.vehicle_class, s.fuel_type, s.brand, s.model,
         s.display_label, s.sort_order, s.is_active,
         v.id          AS value_id,
         v.component, v.unit,
         v.market_value, v.our_value, v.sample_count,
         v.market_source, v.market_synced_at, v.our_updated_at,
         v.is_locked
       FROM cost_standards_scope s
       LEFT JOIN cost_standards_value v ON v.scope_id = s.id
       WHERE s.is_active = 1
       ORDER BY s.sort_order ASC, s.display_label ASC, v.component ASC`,
    )

    // 스코프 단위로 묶어 반환
    const byScope: Record<string, any> = {}
    for (const r of rows) {
      const sid = String(r.scope_id)
      if (!byScope[sid]) {
        byScope[sid] = {
          id: sid,
          scope_type: r.scope_type,
          vehicle_class: r.vehicle_class,
          fuel_type: r.fuel_type,
          brand: r.brand,
          model: r.model,
          display_label: r.display_label,
          sort_order: r.sort_order,
          is_active: !!r.is_active,
          values: [] as any[],
        }
      }
      if (r.value_id) {
        byScope[sid].values.push({
          id: String(r.value_id),
          component: r.component,
          unit: r.unit,
          market_value: r.market_value !== null ? Number(r.market_value) : null,
          our_value: r.our_value !== null ? Number(r.our_value) : null,
          sample_count: Number(r.sample_count || 0),
          market_source: r.market_source,
          market_synced_at: r.market_synced_at,
          our_updated_at: r.our_updated_at,
          is_locked: !!r.is_locked,
        })
      }
    }

    return NextResponse.json({ data: serialize(Object.values(byScope)), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─── POST (새 스코프 추가) ───
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { scope_type, vehicle_class, fuel_type, brand, model, display_label, sort_order } = body

    if (!['class', 'model'].includes(scope_type)) {
      return NextResponse.json({ error: 'scope_type 은 class | model' }, { status: 400 })
    }
    if (!display_label) {
      return NextResponse.json({ error: 'display_label 필수' }, { status: 400 })
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO cost_standards_scope
         (scope_type, vehicle_class, fuel_type, brand, model, display_label, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      scope_type,
      vehicle_class || null,
      fuel_type || null,
      brand || null,
      model || null,
      display_label,
      sort_order ?? 500,
    )

    // 6개 컴포넌트 빈 row 자동 생성
    const newScope = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM cost_standards_scope WHERE display_label = ? ORDER BY id DESC LIMIT 1`,
      display_label,
    )
    const scopeId = newScope[0]?.id
    if (scopeId) {
      const components: Array<[string, string]> = [
        ['insurance', 'annual'],
        ['maintenance', 'monthly'],
        ['tax', 'annual'],
        ['inspection', 'annual'],
        ['finance_rate', 'percent'],
        ['registration', 'fixed'],
      ]
      for (const [c, u] of components) {
        await prisma.$executeRawUnsafe(
          `INSERT IGNORE INTO cost_standards_value (scope_id, component, unit) VALUES (?, ?, ?)`,
          scopeId, c, u,
        )
      }
    }

    return NextResponse.json({ success: true, scope_id: String(scopeId), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─── PATCH ───
export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const op = request.nextUrl.searchParams.get('op') || 'value'
    const body = await request.json()

    // ── 값 갱신 (market / our) ──
    if (op === 'value') {
      const { scope_id, component, field, value, trigger_type, market_source } = body
      if (!scope_id || !component) {
        return NextResponse.json({ error: 'scope_id + component 필수' }, { status: 400 })
      }
      if (!['market_value', 'our_value'].includes(field)) {
        return NextResponse.json({ error: 'field 는 market_value | our_value' }, { status: 400 })
      }

      // 기존 값 조회 (로그용)
      const [prev] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, market_value, our_value FROM cost_standards_value
          WHERE scope_id = ? AND component = ?`,
        scope_id, component,
      )
      if (!prev) {
        return NextResponse.json({ error: '대상 row 없음' }, { status: 404 })
      }

      const oldVal = field === 'market_value' ? prev.market_value : prev.our_value
      const newVal = value === null || value === '' ? null : Number(value)

      if (field === 'market_value') {
        await prisma.$executeRawUnsafe(
          `UPDATE cost_standards_value
              SET market_value = ?, market_source = ?, market_synced_at = NOW()
            WHERE scope_id = ? AND component = ?`,
          newVal, market_source || 'manual', scope_id, component,
        )
      } else {
        await prisma.$executeRawUnsafe(
          `UPDATE cost_standards_value
              SET our_value = ?, our_updated_at = NOW()
            WHERE scope_id = ? AND component = ?`,
          newVal, scope_id, component,
        )
      }

      // 알림큐 기록 (수동이어도 남김)
      const deltaPct = (oldVal !== null && oldVal > 0 && newVal !== null)
        ? ((newVal - Number(oldVal)) / Number(oldVal)) * 100
        : null
      await prisma.$executeRawUnsafe(
        `INSERT INTO cost_auto_updates
          (scope_id, component, value_kind, old_value, new_value, delta_pct, trigger_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        scope_id,
        component,
        field === 'market_value' ? 'market' : 'our',
        oldVal,
        newVal,
        deltaPct,
        trigger_type || 'manual',
      )

      return NextResponse.json({ success: true, error: null })
    }

    // ── 알림 읽음 / 롤백 ──
    if (op === 'update') {
      const { update_id, action } = body
      if (!update_id) return NextResponse.json({ error: 'update_id 필수' }, { status: 400 })

      if (action === 'read') {
        await prisma.$executeRawUnsafe(
          `UPDATE cost_auto_updates
              SET is_read = 1, read_by_email = ?, read_at = NOW()
            WHERE id = ?`,
          user.email || null, update_id,
        )
        return NextResponse.json({ success: true, error: null })
      }

      if (action === 'rollback') {
        // 해당 알림의 old_value 로 원복
        const [u] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM cost_auto_updates WHERE id = ?`, update_id,
        )
        if (!u) return NextResponse.json({ error: '알림 없음' }, { status: 404 })
        if (u.rollback_applied) {
          return NextResponse.json({ error: '이미 롤백됨' }, { status: 400 })
        }

        const targetField = u.value_kind === 'market' ? 'market_value' : 'our_value'
        await prisma.$executeRawUnsafe(
          `UPDATE cost_standards_value
              SET ${targetField} = ?
            WHERE scope_id = ? AND component = ?`,
          u.old_value, u.scope_id, u.component,
        )
        await prisma.$executeRawUnsafe(
          `UPDATE cost_auto_updates
              SET rollback_applied = 1, rollback_at = NOW(), rollback_by_email = ?
            WHERE id = ?`,
          user.email || null, update_id,
        )
        return NextResponse.json({ success: true, error: null })
      }

      return NextResponse.json({ error: 'action 은 read | rollback' }, { status: 400 })
    }

    return NextResponse.json({ error: '알 수 없는 op' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
