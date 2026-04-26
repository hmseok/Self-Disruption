import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

/**
 * POST /api/finance/transactions/auto-match
 * 하이브리드 자동매칭: 1차 규칙 기반 + 2차 Gemini AI
 * Body: { threshold?: number, autoConfirm?: boolean, useAI?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const threshold = body.threshold || 0.50
    const autoConfirmThreshold = 0.75
    const useAI = body.useAI !== false // 기본 true

    // 1. 미매칭 거래 로드
    const unmatched = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, transaction_date, type, amount, description, client_name, bank_name, card_company
      FROM transactions
      WHERE (related_type IS NULL OR related_id IS NULL)
        AND deleted_at IS NULL
      ORDER BY transaction_date DESC
      LIMIT 2000
    `)

    // 2. 정산 지급내역 로드 (매칭 대상) — 테이블 미존재 시 빈 배열
    const settlements = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, settlement_month, contract_id, contract_type, recipient_name,
             due_amount, bank_name, account_number, status
      FROM settlement_ledger
      WHERE status = 'pending'
    `).catch(() => [])

    // 3. 계약 정보 로드 (매칭 대상) — 개별 쿼리 후 합치기 (테이블 미존재 방지)
    const jiipContracts = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, 'jiip' AS ctype, client_name, monthly_amount, contract_start, contract_end
      FROM jiip_contracts WHERE status = 'active'
    `).catch(() => [])
    const investContracts = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, 'invest' AS ctype, investor_name AS client_name, monthly_return AS monthly_amount, start_date AS contract_start, end_date AS contract_end
      FROM general_investments WHERE status = 'active'
    `).catch(() => [])
    const loanContracts = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, 'loan_out' AS ctype, borrower_name AS client_name, monthly_interest AS monthly_amount, start_date AS contract_start, end_date AS contract_end
      FROM loans_out WHERE status != 'closed'
    `).catch(() => [])
    const contracts = [...jiipContracts, ...investContracts, ...loanContracts]

    // 4. 차량 정보 로드 (AI 매칭 컨텍스트)
    const cars = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, number, brand, model, year FROM cars WHERE status != 'disposed' LIMIT 200
    `).catch(() => [])

    // 5. 직원 정보 로드 (AI 매칭 컨텍스트)
    const employees = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, COALESCE(employee_name, name) AS name, email, department, position
      FROM profiles WHERE is_active = 1 LIMIT 100
    `).catch(() => [])

    // 6. 법인카드 정보 로드 (AI 매칭 컨텍스트)
    const corpCards = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, card_number, card_company, card_name, holder_name FROM corporate_cards LIMIT 50
    `).catch(() => [])

    // ═══ 1차: 규칙 기반 매칭 ═══
    const results: any[] = []
    const matched: any[] = []
    const unmatchedAfterRules: any[] = [] // AI 매칭 대상

    for (const tx of unmatched) {
      const txAmount = Math.abs(Number(tx.amount || 0))
      const txDate = tx.transaction_date ? new Date(tx.transaction_date) : null
      const txName = normalize(tx.client_name || tx.description || '')

      if (txAmount === 0 || !txDate) continue

      let bestMatch: any = null
      let bestScore = 0

      // 정산 대상 매칭
      for (const s of settlements) {
        const due = Math.abs(Number(s.due_amount || 0))
        if (due === 0) continue

        const amountScore = calcAmountScore(txAmount, due)
        const nameScore = calcNameScore(txName, normalize(s.recipient_name || ''))
        const [sy, sm] = (s.settlement_month || '2025-01').split('-').map(Number)
        const expectedDate = new Date(sy, sm, 15)
        const dateScore = calcDateScore(txDate, expectedDate)
        const total = amountScore * 0.45 + dateScore * 0.30 + nameScore * 0.25

        if (total > bestScore && total >= threshold) {
          bestScore = total
          bestMatch = {
            type: 'settlement', id: s.id, name: s.recipient_name,
            amount: due, month: s.settlement_month, contractType: s.contract_type,
          }
        }
      }

      // 계약 대상 매칭
      for (const c of contracts) {
        const monthlyAmount = Math.abs(Number(c.monthly_amount || 0))
        if (monthlyAmount === 0) continue

        const amountScore = calcAmountScore(txAmount, monthlyAmount)
        const nameScore = calcNameScore(txName, normalize(c.client_name || ''))
        const dateScore = txDate.getDate() <= 15 ? 0.8 : 0.5
        const total = amountScore * 0.45 + dateScore * 0.30 + nameScore * 0.25

        if (total > bestScore && total >= threshold) {
          bestScore = total
          bestMatch = {
            type: 'contract', id: c.id, name: c.client_name,
            amount: monthlyAmount, contractType: c.ctype,
          }
        }
      }

      if (bestMatch) {
        const result = {
          transactionId: tx.id, txDate: tx.transaction_date, txAmount,
          txName: tx.client_name || tx.description,
          match: bestMatch, score: Math.round(bestScore * 100),
          autoConfirm: bestScore >= autoConfirmThreshold, matchMethod: 'rule',
        }
        results.push(result)

        if (body.autoConfirm && bestScore >= autoConfirmThreshold) {
          await applyMatch(tx.id, txAmount, bestMatch)
          matched.push(result)
        }
      } else {
        // 규칙으로 못 잡은 건 → AI 대상
        unmatchedAfterRules.push(tx)
      }
    }

    // ═══ 2차: Gemini AI 매칭 ═══ (타임아웃 방지: 최대 300건씩 처리)
    const aiLimit = Math.min(body.aiLimit || 300, 600)
    let aiMatchCount = 0
    const aiTargets = unmatchedAfterRules.slice(0, aiLimit)
    if (useAI && GEMINI_API_KEY && aiTargets.length > 0) {
      const aiResults = await matchWithGemini(aiTargets, settlements, contracts, cars, employees, corpCards)

      for (const ai of aiResults) {
        const result = {
          transactionId: ai.transactionId,
          txDate: ai.txDate,
          txAmount: ai.txAmount,
          txName: ai.txName,
          match: ai.match,
          score: ai.score,
          autoConfirm: ai.score >= 75,
          matchMethod: 'ai',
          aiReason: ai.reason,
        }
        results.push(result)
        aiMatchCount++

        if (body.autoConfirm && ai.score >= 75) {
          await applyMatch(ai.transactionId, ai.txAmount, ai.match)
          matched.push(result)
        }
      }
    }

    return NextResponse.json({
      data: serialize({
        total: unmatched.length,
        candidates: results.length,
        autoConfirmed: matched.length,
        ruleMatched: results.filter(r => r.matchMethod === 'rule').length,
        aiMatched: aiMatchCount,
        unmatchedRemaining: unmatched.length - results.length,
        aiProcessed: aiTargets.length,
        aiTotal: unmatchedAfterRules.length,
        results: results.slice(0, 500),
      }),
      error: null,
    })
  } catch (e: any) {
    console.error('[POST /api/finance/transactions/auto-match]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─── DB 매칭 적용 ──────────────────────────────────────

async function applyMatch(txId: string, txAmount: number, match: any) {
  if (match.type === 'settlement') {
    await prisma.$executeRawUnsafe(
      `UPDATE transactions SET related_type = ?, related_id = ?, updated_at = NOW() WHERE id = ?`,
      match.contractType || 'settlement', match.id, txId
    )
    await prisma.$executeRawUnsafe(
      `UPDATE settlement_ledger SET status = 'matched', matched_at = NOW(),
       matched_tx_ids = JSON_ARRAY(?), paid_amount = ?, updated_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      txId, txAmount, match.id
    )
  } else {
    await prisma.$executeRawUnsafe(
      `UPDATE transactions SET related_type = ?, related_id = ?, updated_at = NOW() WHERE id = ?`,
      match.contractType, match.id, txId
    )
  }
}

// ─── Gemini AI 매칭 ────────────────────────────────────

async function matchWithGemini(
  txList: any[],
  settlements: any[],
  contracts: any[],
  cars: any[],
  employees: any[],
  corpCards: any[],
): Promise<any[]> {
  const allResults: any[] = []
  const batchSize = 30
  for (let i = 0; i < txList.length; i += batchSize) {
    const batch = txList.slice(i, i + batchSize)
    const batchResults = await matchBatchWithGemini(batch, settlements, contracts, cars, employees, corpCards)
    allResults.push(...batchResults)
  }
  return allResults
}

async function matchBatchWithGemini(
  txBatch: any[],
  settlements: any[],
  contracts: any[],
  cars: any[],
  employees: any[],
  corpCards: any[],
): Promise<any[]> {
  // 매칭 대상 목록 구성
  const targetLines: string[] = []
  const targetMap: Record<string, any> = {}

  for (const s of settlements) {
    const key = `S-${s.id}`
    targetLines.push(`${key}: 정산 | ${s.recipient_name} | ${s.settlement_month} | ${Number(s.due_amount).toLocaleString()}원 | ${s.contract_type} | ${s.bank_name || ''} ${s.account_number ? '*' + String(s.account_number).slice(-4) : ''}`)
    targetMap[key] = { type: 'settlement', id: s.id, name: s.recipient_name, amount: Number(s.due_amount), month: s.settlement_month, contractType: s.contract_type }
  }

  for (const c of contracts) {
    const key = `C-${c.id}`
    targetLines.push(`${key}: 계약 | ${c.client_name} | 월${Number(c.monthly_amount).toLocaleString()}원 | ${c.ctype}`)
    targetMap[key] = { type: 'contract', id: c.id, name: c.client_name, amount: Number(c.monthly_amount), contractType: c.ctype }
  }

  // 차량 정보 (AI 컨텍스트)
  const carLines = cars.slice(0, 50).map((c: any) =>
    `차량 ${c.number}: ${c.brand || ''} ${c.model || ''} (${c.year || ''})`
  )

  // 직원 정보 (AI 컨텍스트)
  const empLines = employees.slice(0, 30).map((e: any) =>
    `직원: ${e.name || ''} (${e.department || ''} ${e.position || ''})`
  )

  // 법인카드 정보 (AI 컨텍스트)
  const cardLines = corpCards.slice(0, 20).map((c: any) =>
    `카드 *${(c.card_number || '').slice(-4)}: ${c.card_company || ''} ${c.card_name || ''} (${c.holder_name || ''})`
  )

  // 거래 목록 구성
  const txLines = txBatch.map((tx, i) => {
    const amt = Math.abs(Number(tx.amount || 0))
    return `TX-${i + 1}: ${tx.transaction_date} | ${tx.type === 'income' ? '입금' : '출금'} | ${tx.client_name || ''} | ${tx.description || ''} | ${amt.toLocaleString()}원 | ${tx.bank_name || tx.card_company || ''}`
  }).join('\n')

  const prompt = `당신은 한국 렌터카/지입 회사(FMI)의 회계·재무 전문가입니다. 아래 미매칭 거래내역을 분석하여 정산/계약과 매칭하고, 운영비·직원비용·차량별 지출을 식별해주세요.

## 매칭 대상 (정산 지급내역 + 계약)
${targetLines.length > 0 ? targetLines.join('\n') : '(없음)'}

## 회사 자산 정보 (참고용)
### 차량 목록
${carLines.length > 0 ? carLines.join('\n') : '(없음)'}
### 직원 목록
${empLines.length > 0 ? empLines.join('\n') : '(없음)'}
### 법인카드
${cardLines.length > 0 ? cardLines.join('\n') : '(없음)'}

## 미매칭 거래내역
${txLines}

## 매칭 및 분류 규칙
### 정산/계약 매칭
1. 금액이 비슷하고 (±10%), 이름이 유사하면 매칭
2. "기업홍길동", "국민석호민" 같은 패턴은 [은행명+사람이름]이므로 사람이름만 추출
3. 확실하지 않으면 매칭하지 마세요 (정확도가 중요합니다)

### 운영비/직원/차량 자동 분류 (매칭 대상 없는 경우)
4. 주유소, 정비소, 하이패스, 보험료 → 차량 운영비 (해당 차량번호가 메모에 있으면 차량 매칭)
5. 직원 이름이 거래처에 있으면 → 직원 관련 지출 (급여, 경비 등)
6. 법인카드 사용자와 거래 패턴 매칭 → 해당 직원/부서 지출
7. 사무실 임대, 통신비, 보험 등 → 일반 운영비

### 응답 규칙
- 정산/계약 매칭: target에 "S-xxx" 또는 "C-xxx" 형식
- 차량 관련: target에 "CAR-차량번호" 형식 (예: "CAR-12가3456")
- 직원 관련: target에 "EMP-직원이름" 형식
- 일반 운영비: target에 "OPS-카테고리" 형식 (예: "OPS-유류비", "OPS-통신비")
- confidence 50 이상만 응답

## 응답 (JSON 배열만)
[{"tx":1,"target":"S-xxx","confidence":85,"reason":"홍길동 이름일치+금액유사"},{"tx":3,"target":"CAR-12가3456","confidence":70,"reason":"주유소 결제, 차량번호 메모 포함"},{"tx":5,"target":"EMP-김철수","confidence":75,"reason":"직원 급여 이체"},{"tx":7,"target":"OPS-유류비","confidence":80,"reason":"GS칼텍스 주유소"}]

매칭/분류할 수 없는 거래는 응답에 포함하지 마세요.`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!res.ok) {
      console.error('[AI Match] Gemini API error:', res.status)
      return []
    }

    const data = await res.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    let parsed: any[]
    try {
      parsed = JSON.parse(content)
    } catch {
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return []
      parsed = JSON.parse(jsonMatch[0])
    }

    if (!Array.isArray(parsed)) return []

    const results: any[] = []
    for (const item of parsed) {
      const txIdx = (item.tx || item.no || 0) - 1
      const targetKey = item.target || item.match || ''
      const confidence = Number(item.confidence || 0)

      if (txIdx < 0 || txIdx >= txBatch.length) continue
      if (confidence < 50) continue

      const tx = txBatch[txIdx]
      let match: any = null

      if (targetMap[targetKey]) {
        // 정산/계약 매칭
        match = targetMap[targetKey]
      } else if (targetKey.startsWith('CAR-')) {
        // 차량 관련 지출
        match = { type: 'car', id: targetKey, name: targetKey.replace('CAR-', ''), amount: 0, contractType: 'car_expense' }
      } else if (targetKey.startsWith('EMP-')) {
        // 직원 관련 지출
        match = { type: 'employee', id: targetKey, name: targetKey.replace('EMP-', ''), amount: 0, contractType: 'employee_expense' }
      } else if (targetKey.startsWith('OPS-')) {
        // 일반 운영비
        match = { type: 'operation', id: targetKey, name: targetKey.replace('OPS-', ''), amount: 0, contractType: 'operation' }
      } else {
        continue
      }

      results.push({
        transactionId: tx.id,
        txDate: tx.transaction_date,
        txAmount: Math.abs(Number(tx.amount || 0)),
        txName: tx.client_name || tx.description,
        match,
        score: confidence,
        reason: item.reason || 'AI 매칭',
      })
    }

    return results
  } catch (err: any) {
    console.error('[AI Match] Error:', err.message)
    return []
  }
}

// ─── 규칙 기반 점수 함수 ─────────────────────────────────

function normalize(s: string): string {
  return (s || '').replace(/\s+/g, '').replace(/[()（）\-_]/g, '').toLowerCase()
}

function calcAmountScore(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  const diff = Math.abs(a - b) / Math.max(a, b)
  if (diff === 0) return 1.0
  if (diff <= 0.01) return 0.9
  if (diff <= 0.05) return 0.7
  if (diff <= 0.10) return 0.3
  return 0
}

function calcDateScore(a: Date, b: Date): number {
  const diffMs = Math.abs(a.getTime() - b.getTime())
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  if (diffDays <= 0.5) return 1.0
  if (diffDays <= 1) return 0.8
  if (diffDays <= 3) return 0.5
  if (diffDays <= 7) return 0.3
  if (diffDays <= 14) return 0.1
  return 0
}

function calcNameScore(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1.0
  if (a.includes(b) || b.includes(a)) return 0.7
  const shorter = a.length < b.length ? a : b
  const longer = a.length < b.length ? b : a
  let maxCommon = 0
  for (let i = 0; i < shorter.length; i++) {
    for (let j = i + 2; j <= shorter.length; j++) {
      if (longer.includes(shorter.slice(i, j))) maxCommon = Math.max(maxCommon, j - i)
    }
  }
  if (maxCommon >= 3) return 0.5
  if (maxCommon >= 2) return 0.3
  return 0
}
