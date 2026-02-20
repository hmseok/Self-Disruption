-- 027_worksheet_discount_rates.sql
-- 보증금/선납금 할인율 + 등록지역 컬럼 추가

alter table pricing_worksheets add column if not exists deposit_discount_rate numeric default 0.4;
alter table pricing_worksheets add column if not exists prepayment_discount_rate numeric default 0.5;
alter table pricing_worksheets add column if not exists registration_region text default '서울';
