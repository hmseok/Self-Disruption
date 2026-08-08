import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════════
// 카드 지출 → 배정 차량 자동 귀속 (2026-08-02 사용자 승인)
//
// 법인카드 마스터(corporate_cards)에 차량이 배정된 카드의 지출
// (excel_card 명세서 / sms 승인문자)을 transaction_assignments 'car' 로
// 귀속한다. 멱등: uniq_ta_tx_type_id + NOT EXISTS 로 재실행 안전 —
// 이미 수동 귀속된 거래는 건드리지 않는다.
//
// 호출처: 카드 명세서 임포트 직후 / SMS 원장 적재 직후.
// 최초 백필 567건은 2026-08-02 스크립트로 실행 (note '카드 자동귀속 %').
// ═══════════════════════════════════════════════════════════════════
export async function autoAttributeCardExpenses(): Promise<number> {
  try {
    const n = await prisma.$executeRawUnsafe(`
      INSERT IGNORE INTO transaction_assignments
        (id, transaction_id, assignment_type, assignment_id, ratio, note, source, created_at, updated_at)
      SELECT UUID(), t.id, 'car', cc.assigned_car_id, 100.00,
             CONCAT('카드 자동귀속 ', cc.card_alias), 'auto', NOW(), NOW()
        FROM transactions t
        -- helper-coverage-allow: INSERT…SELECT 원문 유지 — JSON card_last4 폴백 포함 자동귀속 전용 매칭
        JOIN corporate_cards cc
          ON RIGHT(REPLACE(cc.card_number,'-',''),4) = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.raw_data,'$.card_last4')), t.account_last4)
       WHERE t.deleted_at IS NULL AND t.type='expense'
         AND t.imported_from IN ('excel_card','sms')
         AND cc.assigned_car_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM transaction_assignments ta
                          WHERE ta.transaction_id = t.id AND ta.assignment_type='car')`)
    return Number(n) || 0
  } catch (e: any) {
    console.warn('[card-attribution] 자동 귀속 실패 (무시):', e?.message)
    return 0
  }
}
