// ═══════════════════════════════════════════════════════════════
// 장부(통장/카드) — 탭 공유 상수·타입
// 2026-07-30 개편 2단계: page.tsx 분해 시작 (탭별 파일 분리)
// ═══════════════════════════════════════════════════════════════

export const ISSUER_LABEL: Record<string, string> = { KB: 'KB국민', WOORI: '우리', HYUNDAI: '현대', MYCOMPANY: '법인', WOORI_BANK: '우리은행', KB_BANK: '국민은행' }
export const ISSUER_COLOR: Record<string, string> = { KB: '#fbbf24', WOORI: '#3b82f6', HYUNDAI: '#ef4444', MYCOMPANY: '#8b5cf6', WOORI_BANK: '#059669', KB_BANK: '#d97706' }

export interface SmsRow {
  id: string
  raw_text: string
  sender: string | null
  received_at: string
  parse_status: 'pending' | 'parsed' | 'failed' | 'ignored'
  parse_error: string | null
  card_issuer: 'KB' | 'WOORI' | 'HYUNDAI' | null
  holder_name: string | null
  transaction_type: 'approved' | 'canceled' | 'deposit' | 'withdrawal'
  transaction_at: string | null
  amount: number | null
  merchant: string | null
  installment: string | null
  tx_alive?: boolean | number
}

export const nf = (n: number) => n ? Math.abs(n).toLocaleString() : '0'
