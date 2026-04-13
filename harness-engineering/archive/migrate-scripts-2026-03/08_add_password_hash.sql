-- ============================================================
-- Migration: profiles 테이블에 password_hash 컬럼 추가
-- 날짜: 2026-04-04
-- 설명: Firebase → 커스텀 JWT 인증 전환
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL
    COMMENT '커스텀 JWT 인증용 bcrypt 해시';

-- 기존 admin 계정에 초기 비밀번호 설정 (password1234!!)
-- bcrypt hash of 'password1234!!'
UPDATE profiles
SET password_hash = '$2a$12$Vqm6d6mR7oGb3dqzSc0T4.3tGjWCEf/eLjDV2Ke2jL6VDfzKCMvZ6'
WHERE email = 'admin@self-disruption.com' AND password_hash IS NULL;
