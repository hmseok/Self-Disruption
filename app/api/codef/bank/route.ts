import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { codefRequest } from '../lib/auth'
import { verifyUser } from '@/lib/auth-server'
import { isCronAuthorized, cronForwardHeaders } from '@/lib/cron-auth'

// Bank organization codes
const BANK_CODES = {
  '0020': '우리은행',
  '0004': '국민은행',
}

export async function POST(req: NextRequest) {
  try {
    // PR-PAY-CRON — 사용자 토큰 또는 X-Cron-Secret (codef/sync 주기 체인)
    const isCron = isCronAuthorized(req)
    const user = isCron ? null : await verifyUser(req)
    if (!user && !isCron) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { connectedId, orgCode, account, startDate, endDate } = await req.json()

    if (!connectedId || !orgCode || !account || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required parameters (connectedId, orgCode, account, startDate, endDate)' }, { status: 400 })
    }

    if (!BANK_CODES[orgCode as keyof typeof BANK_CODES]) {
      return NextResponse.json({ error: 'Invalid bank code' }, { status: 400 })
    }

    const cleanAccount = account.replace(/-/g, '')
    const fmtStart = startDate.replace(/-/g, '')
    const fmtEnd = endDate.replace(/-/g, '')

    const result = await codefRequest('/v1/kr/bank/b/account/transaction-list', {
      organization: orgCode,
      connectedId,
      account: cleanAccount,
      startDate: fmtStart,
      endDate: fmtEnd,
      orderBy: '0',
      inquiryType: '1',
    })

    console.log('[Codef Bank] 응답:', JSON.stringify(result).slice(0, 500))

    if (result?.result?.code !== 'CF-00000') {
      await prisma.codefSyncLog.create({
        data: {
          sync_type: 'bank',
          org_name: BANK_CODES[orgCode as keyof typeof BANK_CODES],
          fetched: 0,
          inserted: 0,
          status: 'error',
          error_message: result?.result?.message || JSON.stringify(result?.result),
        },
      })
      return NextResponse.json({
        error: result?.result?.message || '거래내역 조회 실패',
        code: result?.result?.code,
      }, { status: 400 })
    }

    const txList: any[] = result.resTrHistoryList || []
    let insertedCount = 0
    // PR-ACCOUNT (V10) — 계좌 끝4자리 저장 (계좌별 관리). 컬럼 미적용 DB 는 자동 생략.
    const accountLast4 = cleanAccount.slice(-4)
    let accountColumnOk = true

    for (const tx of txList) {
      const txDate = tx.resAccountTrDate
        ? `${tx.resAccountTrDate.slice(0, 4)}-${tx.resAccountTrDate.slice(4, 6)}-${tx.resAccountTrDate.slice(6)}`
        : null

      const outAmt = Number(tx.resAccountOut || 0)
      const inAmt = Number(tx.resAccountIn || 0)
      const amount = outAmt > 0 ? outAmt : inAmt
      const type = inAmt > 0 ? 'income' : 'expense'

      try {
        // transactions 테이블은 Prisma 스키마 외 테이블 → raw insert
        // PR-RECONCILE — 거래 후 잔액 저장 (잔액 사슬 자동 검증 재료). 필드 없으면 null.
        const balanceAfter = Number(tx.resAfterTranBalance || tx.resAccountBalance || 0) || null
        const clientName = tx.resAccountDesc1 || tx.resAccountDesc2 || '미상'
        const desc = [tx.resAccountDesc1, tx.resAccountDesc2, tx.resAccountDesc3].filter(Boolean).join(' / ')
        const bankName = BANK_CODES[orgCode as keyof typeof BANK_CODES]

        // ── 중복 검사 (2026-07-08 신설) ──────────────────────────────
        //   기존엔 존재 확인 없이 INSERT → 30분 주기가 같은 3일치를 계속 재등록할 위험.
        //   판별자: 같은 날 + 금액 + 입출 + 잔액 (잔액이 같으면 같은 거래 — dedup v3 학습).
        //   잔액 없으면 같은 날 + 금액 + 입출 + 거래처로 판단.
        //   deleted_at IS NULL 조건 → 화면에서 삭제한 건은 다음 주기에 자동 복구.
        //   통장 3계열(excel/sms/codef) 전체와 대조 — 엑셀로 이미 올라온 날짜와 겹쳐도 중복 안 생김.
        try {
          const dupRows = balanceAfter != null
            ? await prisma.$queryRaw<Array<{ id: string }>>`
                SELECT id FROM transactions
                WHERE deleted_at IS NULL
                  AND (imported_from LIKE 'excel_bank%' OR imported_from IN ('sms_bank', 'codef_bank'))
                  AND DATE(transaction_date) = ${txDate} AND type = ${type}
                  AND amount = ${amount} AND balance_after = ${balanceAfter}
                LIMIT 1`
            : await prisma.$queryRaw<Array<{ id: string }>>`
                SELECT id FROM transactions
                WHERE deleted_at IS NULL
                  AND (imported_from LIKE 'excel_bank%' OR imported_from IN ('sms_bank', 'codef_bank'))
                  AND DATE(transaction_date) = ${txDate} AND type = ${type}
                  AND amount = ${amount} AND client_name = ${clientName}
                LIMIT 1`
          if (dupRows.length > 0) continue
        } catch { /* 검사 실패 (컬럼 부재 등) → 기존 동작대로 INSERT 진행 (누락 방지 우선) */ }
        if (accountColumnOk) {
          try {
            await prisma.$executeRaw`
              INSERT INTO transactions
                (transaction_date, type, amount, client_name, description, category,
                 payment_method, status, imported_from, codef_org_code, balance_after, account_last4, raw_data)
              VALUES
                (${txDate}, ${type}, ${amount}, ${clientName}, ${desc},
                 ${'Import - Bank'}, ${bankName},
                 ${'completed'}, ${'codef_bank'}, ${orgCode}, ${balanceAfter}, ${accountLast4},
                 ${JSON.stringify(tx)})
            `
            insertedCount++
            continue
          } catch (e: any) {
            if (/Unknown column/i.test(e?.message || '')) accountColumnOk = false
            else throw e  // 중복 등 → 바깥 catch 에서 무시
          }
        }
        await prisma.$executeRaw`
          INSERT INTO transactions
            (transaction_date, type, amount, client_name, description, category,
             payment_method, status, imported_from, codef_org_code, balance_after, raw_data)
          VALUES
            (${txDate}, ${type}, ${amount}, ${clientName}, ${desc},
             ${'Import - Bank'}, ${bankName},
             ${'completed'}, ${'codef_bank'}, ${orgCode}, ${balanceAfter},
             ${JSON.stringify(tx)})
        `
        insertedCount++
      } catch {
        // 중복 등 에러 무시
      }
    }

    await prisma.codefSyncLog.create({
      data: {
        sync_type: 'bank',
        org_name: BANK_CODES[orgCode as keyof typeof BANK_CODES],
        fetched: txList.length,
        inserted: insertedCount,
        status: 'success',
      },
    })

    // 발생시 자동매칭 — 새 입금 들어오면 대차 보험 매칭 자동 실행 (HIGH/MEDIUM만 자동, 애매한 건 「매칭 필요」로)
    let autoMatched: number | null = null
    if (insertedCount > 0) {
      try {
        const proto = req.headers.get('x-forwarded-proto') || 'https'
        const host = req.headers.get('host') || req.headers.get('x-forwarded-host') || ''
        const auth = req.headers.get('authorization') || ''
        const cookie = req.headers.get('cookie') || ''
        if (host && (auth || cookie)) {
          const mr = await fetch(`${proto}://${host}/api/finance/transactions/auto-match-fmi-rental`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}), ...(cookie ? { Cookie: cookie } : {}), ...cronForwardHeaders(req) },
            body: JSON.stringify({ mode: 'insurance', dryRun: false }),
          })
          const mj = await mr.json().catch(() => ({}))
          autoMatched = Number(mj?.applied ?? 0)
        }
      } catch (e) {
        console.warn('[codef/bank] 자동매칭 호출 skip:', (e as Error)?.message)
      }
    }

    return NextResponse.json({
      success: true,
      fetched: txList.length,
      inserted: insertedCount,
      auto_matched: autoMatched,
    }, { status: 200 })

  } catch (error) {
    console.error('Bank fetch error:', error)
    await prisma.codefSyncLog.create({
      data: {
        sync_type: 'bank',
        status: 'error',
        fetched: 0,
        inserted: 0,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      },
    }).catch(() => {})
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
