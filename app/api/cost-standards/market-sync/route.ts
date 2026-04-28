import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ============================================================
// /api/cost-standards/market-sync — Gemini 시장조회로 market_value 갱신
//
// POST body: { scope_id?: string, all?: boolean }
//   - scope_id 지정: 해당 스코프만
//   - all=true: 모든 활성 스코프 일괄 (속도 위해 직렬 + 1초 간격)
//
// Gemini 응답: 6개 컴포넌트 시장 평균값
//   insurance_annual, maintenance_monthly, tax_annual,
//   inspection_annual, finance_rate_percent, registration_fixed
// ============================================================

interface MarketEstimate {
  insurance_annual?: number
  maintenance_monthly?: number
  tax_annual?: number
  inspection_annual?: number
  finance_rate_percent?: number
  registration_fixed?: number
  source_summary?: string
}

const COMPONENTS: Array<{
  component: 'insurance' | 'maintenance' | 'tax' | 'inspection' | 'finance_rate' | 'registration'
  field: keyof MarketEstimate
}> = [
  { component: 'insurance',    field: 'insurance_annual' },
  { component: 'maintenance',  field: 'maintenance_monthly' },
  { component: 'tax',          field: 'tax_annual' },
  { component: 'inspection',   field: 'inspection_annual' },
  { component: 'finance_rate', field: 'finance_rate_percent' },
  { component: 'registration', field: 'registration_fixed' },
]

async function askGemini(scope: any): Promise<MarketEstimate | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 미설정')
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const target = scope.scope_type === 'class'
    ? `${scope.vehicle_class} / ${scope.fuel_type} 차량`
    : `${scope.brand} ${scope.model} (${scope.fuel_type || '가솔린'})`

  const prompt = `당신은 한국 법인 렌터카 운영 원가 분석 전문가입니다.
다음 차량의 시장 평균 운영 원가(영업용 기준)를 추정해 주세요.

차량: ${target}
컨텍스트: 법인 영업용 렌터카 운영, 차령 5년 이내 평균

다음 JSON 형식으로만 응답하세요 (마크다운 코드블록 없이 순수 JSON):
{
  "insurance_annual": 연간 종합보험료 원,
  "maintenance_monthly": 월 정비비 원 (소모품 + 정기점검 평균),
  "tax_annual": 연간 자동차세 원 (영업용 기준),
  "inspection_annual": 연간 검사비 안분 원 (2년 1회 / 2),
  "finance_rate_percent": 장기렌터카 할부 금리 % (소수, 예: 5.2),
  "registration_fixed": 신차 등록 1회성 비용 원 (취득세+공채+탁송+번호판+인지+대행 합계),
  "source_summary": "참고한 시장 데이터 출처 요약 1~2줄"
}

수치 산정 시 한국 시장 실거래 데이터 기반으로 보수적 평균값을 제시하세요.
모르는 항목은 null 반환.`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
      tools: [{ google_search: {} }],
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`)
  }
  const json = await res.json()
  let text = json?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  text = text.trim()
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, '')

  // JSON 추출 — 응답이 텍스트 + JSON 혼합일 수 있음
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[0]) as MarketEstimate
  } catch {
    return null
  }
}

async function syncOne(scope: any) {
  const est = await askGemini(scope)
  if (!est) return { ok: false, scope_id: scope.id, reason: 'parse_failed' }

  let updated = 0
  for (const m of COMPONENTS) {
    const v = est[m.field]
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue

    const [current] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, market_value, is_locked FROM cost_standards_value
        WHERE scope_id = ? AND component = ?`,
      scope.id, m.component
    )
    if (!current || current.is_locked) continue
    const oldVal = current.market_value !== null ? Number(current.market_value) : null

    await prisma.$executeRawUnsafe(
      `UPDATE cost_standards_value
          SET market_value = ?, market_source = 'gemini', market_synced_at = NOW()
        WHERE scope_id = ? AND component = ?`,
      v, scope.id, m.component
    )

    const deltaPct = oldVal !== null && oldVal > 0 ? ((v - oldVal) / oldVal) * 100 : null
    await prisma.$executeRawUnsafe(
      `INSERT INTO cost_auto_updates
        (scope_id, component, value_kind, old_value, new_value, delta_pct,
         trigger_type, trigger_detail)
       VALUES (?, ?, 'market', ?, ?, ?, 'market_sync', ?)`,
      scope.id, m.component, oldVal, v, deltaPct,
      `Gemini: ${(est.source_summary || '').slice(0, 200)}`
    )
    updated++
  }
  return { ok: true, scope_id: scope.id, updated, source: est.source_summary }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { scope_id, all } = body as { scope_id?: string; all?: boolean }

    let scopes: any[] = []
    if (scope_id) {
      scopes = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM cost_standards_scope WHERE id = ? AND is_active = 1`, scope_id
      )
    } else if (all) {
      scopes = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM cost_standards_scope WHERE is_active = 1 ORDER BY sort_order ASC LIMIT 100`
      )
    } else {
      return NextResponse.json({ error: 'scope_id 또는 all=true 필요' }, { status: 400 })
    }
    if (scopes.length === 0) return NextResponse.json({ ok: true, processed: 0 })

    const results: any[] = []
    for (let i = 0; i < scopes.length; i++) {
      // Gemini rate limit 대응 — 스코프 간 1초 간격
      if (i > 0) await new Promise(r => setTimeout(r, 1500))
      try {
        const r = await syncOne(scopes[i])
        results.push(r)
      } catch (e: any) {
        results.push({ ok: false, scope_id: scopes[i].id, error: e.message })
        // rate limit 걸리면 중단
        if (/429|rate/i.test(e.message)) break
      }
    }

    const total = results.length
    const ok = results.filter(r => r.ok).length
    const updated = results.reduce((s, r) => s + (r.updated || 0), 0)

    return NextResponse.json({
      ok: true,
      processed: total,
      success: ok,
      total_components_updated: updated,
      results,
    })
  } catch (e: any) {
    console.error('[market-sync] 실패:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
