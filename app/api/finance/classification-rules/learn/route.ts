import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * /api/finance/classification-rules/learn
 *
 * 거래 1개 → 자동 룰 생성.
 * 사용자가 분류 검수에서 「✓ 확정 + 룰 추가」 클릭 시 호출.
 *
 * 키워드 추출 룰 (우선순위):
 *   1. body.keyword 명시 → 그대로 사용
 *   2. transactions.client_name (거래처) 가 있으면 우선
 *   3. 없으면 description 의 첫 단어 (한글 띄어쓰기 / 영문 단어 단위)
 *
 * body:
 *   transaction_id?: string  (거래 ID — 정보 조회용)
 *   description?: string     (직접 전달 — transaction_id 없을 때)
 *   client_name?: string
 *   category: string         (분류할 카테고리)
 *   subcategory?: string
 *   keyword?: string         (사용자 명시 — 자동 추출 override)
 *   tx_type?: 'income' | 'expense'
 *   confidence?: 'high' | 'medium' | 'low'  (default: high — 사용자가 직접 학습한 룰이므로)
 *
 * 응답:
 *   { ok: true, rule_id, pattern, extracted_from }
 *   { error: '...', already_exists?: true }  (같은 pattern + category 룰 이미 존재 시)
 */

function extractKeyword(clientName?: string | null, description?: string | null): { keyword: string; source: string } | null {
  // 1) client_name 우선
  const cn = (clientName || '').trim()
  if (cn && cn.length >= 2 && cn !== '-') {
    return { keyword: cn, source: 'client_name' }
  }
  // 2) description 첫 단어 (한글 + 영문 + 숫자 가능)
  const desc = (description || '').trim()
  if (!desc) return null
  // 띄어쓰기 / 괄호 / 슬래시 / 콤마 / 대괄호 등으로 분리
  const tokens = desc.split(/[\s\(\)\[\]\/,\|]+/).filter(t => t.length >= 2)
  if (tokens.length === 0) return null
  return { keyword: tokens[0], source: 'description_first_word' }
}

// 단건 학습 (단/일괄 공통 로직)
async function learnOne(body: any): Promise<{ ok: boolean; rule_id?: string; pattern?: string; already_exists?: boolean; extracted_from?: string; error?: string }> {
  const {
    transaction_id,
    description: bodyDesc,
    client_name: bodyClient,
    category,
    subcategory,
    keyword: bodyKeyword,
    tx_type,
    confidence,
  } = body

  if (!category) return { ok: false, error: 'category 필수' }

  let description = bodyDesc || ''
  let clientName = bodyClient || ''
  let txType = tx_type || null
  if (transaction_id) {
    const rows = await prisma.$queryRaw<Array<any>>`
      SELECT description, client_name, type
      FROM transactions
      WHERE id = ${transaction_id} AND deleted_at IS NULL
      LIMIT 1
    `
    if (rows[0]) {
      if (!description) description = rows[0].description || ''
      if (!clientName) clientName = rows[0].client_name || ''
      if (!txType) txType = rows[0].type || null
    }
  }

  let keyword = (bodyKeyword || '').trim()
  let source = 'user_input'
  if (!keyword) {
    const extracted = extractKeyword(clientName, description)
    if (!extracted) return { ok: false, error: '키워드 추출 실패' }
    keyword = extracted.keyword
    source = extracted.source
  }

  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM classification_rules
    WHERE pattern = ${keyword} AND category = ${category}
    LIMIT 1
  `
  if (existing[0]) {
    return { ok: true, already_exists: true, rule_id: existing[0].id, pattern: keyword, extracted_from: source }
  }

  const id = crypto.randomUUID()
  await prisma.$executeRaw`
    INSERT INTO classification_rules
      (id, pattern, category, subcategory, match_car, confidence,
       amount_max, amount_min, tx_type, is_system, is_active, notes)
    VALUES
      (${id}, ${keyword}, ${category}, ${subcategory || null},
       0, ${confidence || 'high'},
       NULL, NULL, ${txType}, 0, 1,
       ${`사용자 학습 (${source}) — ${new Date().toISOString().slice(0, 10)}`})
  `
  return { ok: true, rule_id: id, pattern: keyword, extracted_from: source }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()

    // ─── 일괄 모드 — items: [{ transaction_id, category, ... }, ...] ───
    if (Array.isArray(body.items)) {
      const items = body.items as Array<any>
      const results: Array<{ ok: boolean; rule_id?: string; pattern?: string; already_exists?: boolean; error?: string }> = []
      let added = 0
      let alreadyExisted = 0
      let failed = 0
      for (const it of items) {
        try {
          const r = await learnOne(it)
          results.push(r)
          if (r.ok && !r.already_exists) added++
          else if (r.already_exists) alreadyExisted++
          else failed++
        } catch (e: any) {
          results.push({ ok: false, error: e?.message || 'failed' })
          failed++
        }
      }
      return NextResponse.json({
        ok: true,
        mode: 'batch',
        total: items.length,
        added,
        already_existed: alreadyExisted,
        failed,
        results,
      })
    }

    // ─── 단건 모드 ───
    const r = await learnOne(body)
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json(r)
  } catch (e: any) {
    console.error('[classification-rules/learn POST]', e)
    return NextResponse.json({ error: e.message || 'POST 실패' }, { status: 500 })
  }
}
