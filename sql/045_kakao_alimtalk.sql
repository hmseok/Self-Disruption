-- ============================================
-- 045: 카카오 알림톡 발송 채널 추가
-- contract_sending_logs에 채널/전화번호 컬럼 추가
-- ============================================

-- 발송 채널 컬럼 (email, kakao, both)
ALTER TABLE contract_sending_logs
  ADD COLUMN IF NOT EXISTS send_channel VARCHAR(20) DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(20);

-- 기존 recipient_email NULL 허용 (카카오만 발송 시)
ALTER TABLE contract_sending_logs
  ALTER COLUMN recipient_email DROP NOT NULL;

-- 채널 유효성 체크
ALTER TABLE contract_sending_logs
  ADD CONSTRAINT csl_valid_channel CHECK (send_channel IN ('email', 'kakao', 'both'));
