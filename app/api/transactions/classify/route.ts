import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * PATCH /api/transactions/classify
 *
 * 단건 거래 분류 — 분류 검수 화면의 [차량지원] [운영비] [개인] 1클릭 액션.
 *
 * body:
 *   {
 *     id: string,
 *     action: 'car' | 'operating' | 'personal',
 *     car_id?: string,         // action='car' 일 때
 *     category?: string,       // 카테고리 명시 (없으면 action 별 기본값)
 *     subcategory?: string,
 *     employee_id?: string,    // action='personal' 시 — 누구의 개인 사용
 *     employee_name?: string,
 *     reason?: string,         // 검수 사유
 *   }
 *
 * 동작:
 *   action='car':
 *     UPDATE transactions
 *     SET related_type='car', related_id=:car_id,
 *         category=:category (default '차량비'), final_category=:category
 *
 *   action='operating':
 *     UPDATE transactions
 *     SET related_type=NULL, related_id=NULL,
 *         category=:category (default '운영비'), final_category=:category
 *
 *   action='personal':
 *     UPDATE transactions
 *     SET category='개인사용', final_category='개인사용'
 *     INSERT INTO transaction_flags (transaction_id, flag_type='personal',
 *                                    status='pending', employee_id, employee_name)
 *     → 검수자가 「승인」 클릭 후 급여 차감 처리됨 (별도 액션)
 *
 * 응답:
 *   { ok: true, flag_id?: string, error?: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { id, action, car_id, category, subcategory, employee_id, employee_name, reason } = body

    if (!id || !action) {
      return NextResponse.json({ error: 'id + action 필수' }, { status: 400 })
    }
    if (!['car', 'operating', 'personal'].includes(action)) {
      return NextResponse.json({ error: 'action 은 car/operating/personal' }, { status: 400 })
    }

    // 거래 존재 확인
    const tx = await prisma.$queryRaw<Array<{ id: string; amount: any; description: string | null; transaction_date: any; type: string | null }>>`
      SELECT id, amount, description, transaction_date, type
      FROM transactions
      WHERE id = ${id} AND deleted_at IS NULL
    `
    if (!tx[0]) return NextResponse.json({ error: '거래 없음' }, { status: 404 })

    let resultFlagId: string | null = null

    if (action === 'car') {
      if (!car_id) return NextResponse.json({ error: 'action=car 시 car_id 필수' }, { status: 400 })
      const cat = category || subcategory || '차량비'
      await prisma.$executeRaw`
        UPDATE transactions
        SET related_type = 'car',
            related_id   = ${car_id},
            category     = ${cat},
            final_category = ${cat},
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL
      `
    } else if (action === 'operating') {
      const cat = category || subcategory || '운영비'
      await prisma.$executeRaw`
        UPDATE transactions
        SET related_type = NULL,
            related_id   = NULL,
            category     = ${cat},
            final_category = ${cat},
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL
      `
    } else if (action === 'personal') {
      // 1) 거래 카테고리 설정
      await prisma.$executeRaw`
        UPDATE transactions
        SET category     = '개인사용',
            final_category = '개인사용',
            related_type = NULL,
            related_id   = NULL,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL
      `
      // 2) transaction_flags 신규 INSERT (또는 기존 row 갱신)
      try {
        // 기존 personal flag 있는지 확인
        const existing = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM transaction_flags
          WHERE transaction_id = ${id} AND flag_type = 'personal' AND status != 'dismissed'
          LIMIT 1
        `
        if (existing[0]) {
          // 갱신
          await prisma.$executeRaw`
            UPDATE transaction_flags
            SET employee_id = ${employee_id || null},
                employee_name = ${employee_name || null},
                flag_reason = ${reason || null},
                status = 'pending',
                updated_at = NOW()
            WHERE id = ${existing[0].id}
          `
          resultFlagId = existing[0].id
        } else {
          // 신규
          const flagId = crypto.randomUUID()
          await prisma.$executeRaw`
            INSERT INTO transaction_flags
              (id, transaction_id, flag_type, status, employee_id, employee_name,
               flag_reason, transaction_date, amount, client_name)
            VALUES
              (${flagId}, ${id}, 'personal', 'pending',
               ${employee_id || null}, ${employee_name || null},
               ${reason || null}, ${tx[0].transaction_date}, ${tx[0].amount}, ${tx[0].description})
          `
          resultFlagId = flagId
        }
      } catch (e: any) {
        // transaction_flags 테이블 없는 환경 (legacy) — 거래만 분류해두고 알림
        console.warn('[transactions/classify personal] flag insert 실패:', e?.message?.slice(0, 200))
      }
    }

    return NextResponse.json({ ok: true, flag_id: resultFlagId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
