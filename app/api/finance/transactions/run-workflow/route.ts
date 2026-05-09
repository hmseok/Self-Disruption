import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'

/**
 * /api/finance/transactions/run-workflow
 *
 * 1-Click 자동 진행 — 분류 + 매칭 일괄.
 *
 * POST body:
 *   { steps?: ['classify-rule', 'classify-ai', 'match-fmi-rental',
 *              'match-investor-jiip', 'match-employee', 'match-freelancer',
 *              'auto-confirm']
 *     dryRun?: false  // true: 분류/매칭 실제 실행하되 confirm 만 skip
 *   }
 *
 * 기본 (steps 미지정):
 *   classify-rule → classify-ai → match-fmi-rental → match-investor-jiip
 *   → match-employee → match-freelancer
 *   (auto-confirm 은 명시적 요청 시만)
 *
 * 응답:
 *   { steps: [{ key, label, ok, applied, matched, error? }],
 *     total_applied: N,
 *     total_matched: M,
 *     duration_ms: ... }
 */
export const maxDuration = 600 // 10분 (AI 분류 batch 가능)
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface StepConfig {
  key: string
  label: string
  url: string
  body?: any
}

const DEFAULT_STEPS: StepConfig[] = [
  { key: 'classify-rule',      label: '룰 분류',          url: '/api/finance/transactions/auto-classify', body: { dryRun: false, minConfidence: 60 } },
  { key: 'classify-ai',        label: 'AI 분류',          url: '/api/finance/transactions/auto-classify-ai', body: { batchSize: 20, minConfidence: 70 } },
  { key: 'match-fmi-rental',   label: '대차건 보험',       url: '/api/finance/transactions/auto-match-fmi-rental', body: { mode: 'insurance', dryRun: false } },
  { key: 'match-investor-jiip',label: '투자/지입',         url: '/api/finance/transactions/auto-match-investor-jiip', body: { mode: 'both', dryRun: false } },
  { key: 'match-employee',     label: '직원',             url: '/api/finance/transactions/auto-match-employee', body: { source: 'both', dryRun: false } },
  { key: 'match-freelancer',   label: '프리랜서',          url: '/api/finance/transactions/auto-match-freelancer', body: { dryRun: false } },
  // PR-UX9: 보험료 분담금 (insurance_payment_plan 등록된 경우만 매칭)
  { key: 'match-insurance-premium', label: '보험료 분담금',  url: '/api/finance/transactions/auto-match-insurance-premium', body: { dryRun: false } },
]

const STEP_MAP: Record<string, StepConfig> = Object.fromEntries(DEFAULT_STEPS.map(s => [s.key, s]))
STEP_MAP['auto-confirm'] = {
  key: 'auto-confirm', label: '매칭 자동 확정',
  url: '/api/finance/transactions/confirm-matchings',
  body: { mode: 'all' },
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const stepKeys: string[] = Array.isArray(body.steps) && body.steps.length > 0
      ? body.steps
      : DEFAULT_STEPS.map(s => s.key)

    // base URL — 같은 서버 내부 호출
    // Next.js App Router 에서 self-call 은 절대 URL 필요
    const proto = request.headers.get('x-forwarded-proto') || 'https'
    const host = request.headers.get('host') || request.headers.get('x-forwarded-host') || ''
    const baseUrl = `${proto}://${host}`
    const authHeader = request.headers.get('authorization') || ''
    const cookieHeader = request.headers.get('cookie') || ''

    const startTs = Date.now()
    const stepResults: Array<{
      key: string; label: string; ok: boolean
      applied?: number; matched?: number
      error?: string; duration_ms: number
    }> = []
    let totalApplied = 0
    let totalMatched = 0

    for (const stepKey of stepKeys) {
      const config = STEP_MAP[stepKey]
      if (!config) {
        stepResults.push({ key: stepKey, label: '알 수 없는 단계', ok: false, error: 'unknown step', duration_ms: 0 })
        continue
      }
      const stepStart = Date.now()
      try {
        const res = await fetch(`${baseUrl}${config.url}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { Authorization: authHeader } : {}),
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          },
          body: JSON.stringify(config.body || {}),
        })
        const json: any = await res.json().catch(() => ({}))
        if (!res.ok) {
          stepResults.push({
            key: stepKey, label: config.label,
            ok: false,
            error: `HTTP ${res.status} — ${String(json?.error || '').slice(0, 200)}`,
            duration_ms: Date.now() - stepStart,
          })
          continue
        }
        // 매처: applied / matched 추출
        // 분류: applied / classified / total_processed 추출
        const applied = Number(
          json.applied ?? json.applied_high_confidence ?? json.classified ?? json.updated ?? 0
        )
        const matched = Number(json.matched ?? json.applied ?? 0)
        totalApplied += applied
        totalMatched += matched
        stepResults.push({
          key: stepKey, label: config.label,
          ok: true,
          applied, matched,
          duration_ms: Date.now() - stepStart,
        })
      } catch (e: any) {
        stepResults.push({
          key: stepKey, label: config.label,
          ok: false,
          error: e?.message?.slice(0, 200) || String(e),
          duration_ms: Date.now() - stepStart,
        })
      }
    }

    return NextResponse.json({
      steps: stepResults,
      total_applied: totalApplied,
      total_matched: totalMatched,
      duration_ms: Date.now() - startTs,
      message: `${stepResults.filter(s => s.ok).length}/${stepResults.length} 단계 성공 — 총 ${totalApplied}건 적용`,
    })
  } catch (e: any) {
    console.error('[run-workflow POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
