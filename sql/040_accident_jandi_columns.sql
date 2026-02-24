-- Migration: Add Jandi columns to accident_records table
-- Date: 2026-02-23
-- Description: Add source, jandi_raw, and jandi_topic columns to support Jandi integration

ALTER TABLE accident_records
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS jandi_raw TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS jandi_topic TEXT DEFAULT NULL;

COMMENT ON COLUMN accident_records.source IS '등록 출처: jandi_accident, jandi_replacement, manual';
COMMENT ON COLUMN accident_records.jandi_raw IS '잔디 원문 메시지';
COMMENT ON COLUMN accident_records.jandi_topic IS '잔디 토픽명';

-- Create index on source column for faster filtering
CREATE INDEX IF NOT EXISTS idx_accident_records_source ON accident_records(source);

-- Create index on jandi_topic for jandi-specific queries
CREATE INDEX IF NOT EXISTS idx_accident_records_jandi_topic ON accident_records(jandi_topic)
  WHERE source IN ('jandi_accident', 'jandi_replacement');
