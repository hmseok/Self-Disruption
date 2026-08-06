// ═══════════════════════════════════════════════════════════════
// GET /api/finance/verification?days=30|90|all
// 수집함 「연결 검증」 — SMS 수집 채널(카드·통장) 그룹별 연결 상태 교차 체크
//   그룹: card_sms_transactions 발신처+카드별칭
//   검증: ①등록 카드/계좌 매핑 ②차량 배정 ③원장 반영 ④카테고리 분류 ⑤차량 귀속
// 조인은 JS 병합 — 테이블 간 collation 차이로 인한 1267 에러 회피 (2026-08-03 교훈)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'

const digits = (s: unknown) => String(s || '').replace(/[^0-9]/g, '')
const N = (v: unknown) => Number(v) || 0

const BANK_ISSUERS = new Set(['WOORI_BANK', 'KB_BANK'])

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const daysParam = req.nextUrl.searchParams.get('days') || '30'
  const whereDays = daysParam === 'all'
    ? ''
    : `WHERE received_at >= DATE_SUB(NOW(), INTERVAL ${Math.min(N(daysParam) || 30, 3650)} DAY)`

  try {
    // ── 1) SMS 그룹 집계 ──
    const groups = await prisma.$queryRawUnsafe<Array<{
      card_issuer: string | null; card_alias: string | null
      cnt: unknown; parsed: unknown; failed: unknown; linked: unknown; last_at: Date | null
    }>>(`
      SELECT card_issuer, card_alias, COUNT(*) cnt,
        SUM(parse_status='parsed') parsed,
        SUM(parse_status='failed') failed,
        SUM(transaction_id IS NOT NULL) linked,
        MAX(received_at) last_at
      FROM card_sms_transactions ${whereDays}
      GROUP BY card_issuer, card_alias
      ORDER BY cnt DESC`)

    // ── 2) 그룹 → 원장 거래 연결분 (JS 병합용) ──
    const links = await prisma.$queryRawUnsafe<Array<{
      card_issuer: string | null; card_alias: string | null; transaction_id: string
    }>>(`
      SELECT card_issuer, card_alias, transaction_id
      FROM card_sms_transactions
      ${whereDays ? whereDays + ' AND' : 'WHERE'} transaction_id IS NOT NULL`)

    const txIds = [...new Set(links.map(l => l.transaction_id))]
    const txById = new Map<string, { category: string | null; related_type: string | null; alive: boolean }>()
    const carAssigned = new Set<string>()
    if (txIds.length > 0) {
      const chunks: string[][] = []
      for (let i = 0; i < txIds.length; i += 1000) chunks.push(txIds.slice(i, i + 1000))
      for (const chunk of chunks) {
        const ph = chunk.map(() => '?').join(',')
        const txs = await prisma.$queryRawUnsafe<Array<{ id: string; category: string | null; related_type: string | null }>>(
          `SELECT id, category, related_type FROM transactions WHERE deleted_at IS NULL AND id IN (${ph})`, ...chunk)
        for (const t of txs) txById.set(t.id, { category: t.category, related_type: t.related_type, alive: true })
        const asg = await prisma.$queryRawUnsafe<Array<{ transaction_id: string }>>(
          `SELECT DISTINCT transaction_id FROM transaction_assignments WHERE assignment_type='car' AND transaction_id IN (${ph})`, ...chunk)
        for (const a of asg) carAssigned.add(a.transaction_id)
      }
    }

    // ── 3) 매핑 마스터 (카드·계좌·차량) ──
    const [cards, accounts, cars] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{
        id: string; card_number: string | null; card_alias: string | null; card_issuer: string | null
        holder_name: string | null; status: string | null; assigned_car_id: string | null
      }>>(`SELECT id, card_number, card_alias, card_issuer, holder_name, status, assigned_car_id FROM corporate_cards`),
      prisma.$queryRawUnsafe<Array<{
        id: string; account_number: string | null; account_alias: string | null; bank_name: string | null
        purpose: string | null; status: string | null; assigned_car_id: string | null
      }>>(`SELECT id, account_number, account_alias, bank_name, purpose, status, assigned_car_id FROM bank_account_mappings`),
      prisma.$queryRawUnsafe<Array<{ id: string; number: string | null; model: string | null; ownership_type: string | null }>>(
        `SELECT id, number, model, ownership_type FROM cars`),
    ])
    const carById = new Map(cars.map(c => [c.id, c]))

    // ── 4) 그룹별 판정 ──
    const linksByGroup = new Map<string, string[]>()
    for (const l of links) {
      const k = `${l.card_issuer}|${l.card_alias}`
      if (!linksByGroup.has(k)) linksByGroup.set(k, [])
      linksByGroup.get(k)!.push(l.transaction_id)
    }

    const rows = groups.map(g => {
      const alias = g.card_alias
      const aliasDigits = digits(alias)
      const isBank = BANK_ISSUERS.has(g.card_issuer || '')

      // 원장 반영/분류/귀속 (연결 tx 기준)
      const gTxIds = linksByGroup.get(`${g.card_issuer}|${alias}`) || []
      let alive = 0, classified = 0, attributed = 0
      for (const id of gTxIds) {
        const t = txById.get(id)
        if (!t) continue
        alive += 1
        if (t.category && t.category.trim() !== '') classified += 1
        if (t.related_type === 'car' || carAssigned.has(id)) attributed += 1
      }

      // 매핑 매칭 (끝자리 숫자 비교, 3자리 이상)
      let mapping: Record<string, unknown> | null = null
      if (aliasDigits.length >= 3) {
        if (isBank) {
          const m = accounts.find(a => digits(a.account_number).endsWith(aliasDigits))
            || accounts.find(a => digits(a.account_alias).endsWith(aliasDigits))
          if (m) mapping = {
            kind: 'account', id: m.id, label: m.account_alias || m.bank_name || m.account_number,
            purpose: m.purpose, status: m.status,
            suspended: (m.purpose || '').includes('수집중단'),
            car: m.assigned_car_id ? carById.get(m.assigned_car_id) || null : null,
          }
        } else {
          const last4 = aliasDigits.slice(-4)
          const cands = cards.filter(c => digits(c.card_number).endsWith(last4))
          const m = cands.find(c => c.status === 'active') || cands[0]
          if (m) mapping = {
            kind: 'card', id: m.id, label: m.card_alias || `${m.card_issuer} ${last4}`,
            holder: m.holder_name, status: m.status,
            car: m.assigned_car_id ? carById.get(m.assigned_car_id) || null : null,
          }
        }
      }

      return {
        issuer: g.card_issuer, alias, isBank,
        cnt: N(g.cnt), parsed: N(g.parsed), failed: N(g.failed), linked: N(g.linked),
        alive, classified, attributed,
        lastAt: g.last_at, mapping,
      }
    })

    return NextResponse.json({
      days: daysParam,
      cards: rows.filter(r => !r.isBank),
      banks: rows.filter(r => r.isBank),
    })
  } catch (e) {
    console.error('[verification] 실패:', e)
    return NextResponse.json({ error: '검증 데이터 조회 실패' }, { status: 500 })
  }
}
