-- ============================================
-- FMI 단독 ERP 마이그레이션
-- 멀티테넌트 → 단일 회사 구조로 전환
-- 실행 전 반드시 백업할 것!
-- ============================================
-- ★ 이 파일은 단계별로 실행하세요 (한번에 전체 실행도 가능)

-- ============================================
-- 0단계: role 값 통합 (god_admin, master → admin)
-- ============================================
UPDATE profiles SET role = 'admin' WHERE role IN ('god_admin', 'master');

-- is_approved 컬럼 추가 (자유가입 + 승인 방식)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_approved boolean DEFAULT false;
UPDATE profiles SET is_approved = true WHERE is_active = true;

-- ============================================
-- 1단계: profiles.company_id에 의존하는 RLS 정책 전부 삭제
-- (에러 메시지에서 나온 모든 정책)
-- ============================================

-- profiles 자체 정책
DROP POLICY IF EXISTS "profiles_read_same_company" ON profiles;
DROP POLICY IF EXISTS "profiles_master_update_company" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON profiles;

-- freelancers / freelancer_payments
DROP POLICY IF EXISTS "freelancers_company" ON freelancers;
DROP POLICY IF EXISTS "freelancer_payments_company" ON freelancer_payments;

-- corporate_cards
DROP POLICY IF EXISTS "corporate_cards_company" ON corporate_cards;

-- classification_queue
DROP POLICY IF EXISTS "classification_queue_company" ON classification_queue;

-- card_assignment_history
DROP POLICY IF EXISTS "card_assignment_history_select" ON card_assignment_history;
DROP POLICY IF EXISTS "card_assignment_history_insert" ON card_assignment_history;
DROP POLICY IF EXISTS "card_assignment_history_update" ON card_assignment_history;

-- transaction_flags
DROP POLICY IF EXISTS "tf_company_access" ON transaction_flags;

-- salary_adjustments
DROP POLICY IF EXISTS "sa_company_access" ON salary_adjustments;

-- quote_lifecycle_events
DROP POLICY IF EXISTS "qle_select_own_company" ON quote_lifecycle_events;
DROP POLICY IF EXISTS "qle_insert_own_company" ON quote_lifecycle_events;

-- contract_documents
DROP POLICY IF EXISTS "cd_select_own_company" ON contract_documents;
DROP POLICY IF EXISTS "cd_insert_own_company" ON contract_documents;
DROP POLICY IF EXISTS "cd_delete_own_company" ON contract_documents;

-- vehicle_handovers
DROP POLICY IF EXISTS "vehicle_handovers_company_access" ON vehicle_handovers;

-- maintenance_requests
DROP POLICY IF EXISTS "maintenance_requests_company_access" ON maintenance_requests;

-- schedules
DROP POLICY IF EXISTS "schedules_company_access" ON schedules;

-- settlement_shares
DROP POLICY IF EXISTS "settlement_shares_company_insert" ON settlement_shares;

-- car_costs
DROP POLICY IF EXISTS "car_costs_select" ON car_costs;
DROP POLICY IF EXISTS "car_costs_admin" ON car_costs;

-- tax_filing_records / tax_items
DROP POLICY IF EXISTS "tax_filing_records_company_access" ON tax_filing_records;
DROP POLICY IF EXISTS "tax_items_company_access" ON tax_items;

-- investment_deposits
DROP POLICY IF EXISTS "investment_deposits_company" ON investment_deposits;

-- handler_capacity
DROP POLICY IF EXISTS "handler_capacity_company_access" ON handler_capacity;
DROP POLICY IF EXISTS "handler_capacity_all" ON handler_capacity;

-- assignment_rules (두 세트)
DROP POLICY IF EXISTS "assignment_rules_company_access" ON assignment_rules;
DROP POLICY IF EXISTS "assignment_rules_select" ON assignment_rules;
DROP POLICY IF EXISTS "assignment_rules_all" ON assignment_rules;

-- assignment_log
DROP POLICY IF EXISTS "assignment_log_company_access" ON assignment_log;

-- assignments
DROP POLICY IF EXISTS "assignments_select" ON assignments;
DROP POLICY IF EXISTS "assignments_all" ON assignments;

-- code_master
DROP POLICY IF EXISTS "code_master_select" ON code_master;
DROP POLICY IF EXISTS "code_master_all" ON code_master;

-- service_products
DROP POLICY IF EXISTS "service_products_select" ON service_products;
DROP POLICY IF EXISTS "service_products_all" ON service_products;

-- vehicle_overrides
DROP POLICY IF EXISTS "vehicle_overrides_select" ON vehicle_overrides;
DROP POLICY IF EXISTS "vehicle_overrides_all" ON vehicle_overrides;

-- customer_settings
DROP POLICY IF EXISTS "customer_settings_select" ON customer_settings;
DROP POLICY IF EXISTS "customer_settings_all" ON customer_settings;

-- investigators
DROP POLICY IF EXISTS "investigators_select" ON investigators;
DROP POLICY IF EXISTS "investigators_all" ON investigators;

-- investigation_logs
DROP POLICY IF EXISTS "investigation_logs_select" ON investigation_logs;

-- 기타 company_id 기반 정책들 (안전하게 삭제)
DROP POLICY IF EXISTS "company_users_cars" ON cars;
DROP POLICY IF EXISTS "company_users_customers" ON customers;
DROP POLICY IF EXISTS "company_users_quotes" ON quotes;
DROP POLICY IF EXISTS "company_users_contracts" ON contracts;

-- ============================================
-- 2단계: 모든 테이블에서 company_id 컬럼 제거 (CASCADE)
-- ★ 테이블 존재 여부 자동 체크 — 없는 테이블은 건너뜀
-- ============================================
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'profiles', 'positions', 'departments', 'user_page_permissions',
    'cars', 'customers', 'quotes', 'contracts', 'vehicle_operations',
    'maintenance_records', 'inspection_records', 'accident_records',
    'insurance_contracts', 'financial_products', 'general_investments',
    'jiip_contracts', 'expected_payment_schedules', 'loan_contracts',
    'registration_documents', 'member_invites',
    'freelancers', 'freelancer_payments', 'corporate_cards',
    'classification_queue', 'card_assignment_history',
    'transaction_flags', 'salary_adjustments',
    'quote_lifecycle_events', 'contract_documents',
    'vehicle_handovers', 'maintenance_requests', 'schedules',
    'settlement_shares', 'car_costs',
    'tax_filing_records', 'tax_items', 'investment_deposits',
    'handler_capacity', 'assignment_rules', 'assignment_log', 'assignments',
    'code_master', 'service_products', 'vehicle_overrides',
    'customer_settings', 'investigators', 'investigation_logs',
    'admin_invite_codes', 'payroll_records', 'payroll_items',
    'settlement_records', 'collection_receipts'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    -- 테이블이 존재하고 company_id 컬럼이 있을 때만 실행
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'company_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I DROP COLUMN company_id CASCADE', tbl);
      RAISE NOTICE 'Dropped company_id from %', tbl;
    END IF;
  END LOOP;
END $$;

-- ============================================
-- 3단계: 구독/모듈 관련 테이블 정리
-- ============================================
DROP TABLE IF EXISTS company_modules CASCADE;
ALTER TABLE system_modules DROP COLUMN IF EXISTS plan_group;
ALTER TABLE system_modules ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
UPDATE system_modules SET is_active = true;

-- ============================================
-- 4단계: companies 테이블 삭제
-- ============================================
ALTER TABLE admin_invite_codes DROP CONSTRAINT IF EXISTS admin_invite_codes_company_id_fkey;
DROP TABLE IF EXISTS companies CASCADE;

-- ============================================
-- 5단계: 새로운 RLS 정책 생성 (단일회사: 인증 기반)
-- ============================================

-- ★ 공통 패턴: authenticated 사용자는 모두 같은 회사이므로 전체 접근

-- profiles: 본인 읽기 + admin 전체 접근
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "profiles_update_self" ON profiles FOR UPDATE
  USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 비즈니스 테이블: 인증된 사용자 전체 접근
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'cars', 'customers', 'quotes', 'contracts', 'vehicle_operations',
    'maintenance_records', 'inspection_records', 'accident_records',
    'insurance_contracts', 'financial_products', 'general_investments',
    'jiip_contracts', 'expected_payment_schedules', 'loan_contracts',
    'registration_documents', 'freelancers', 'freelancer_payments',
    'corporate_cards', 'classification_queue', 'card_assignment_history',
    'transaction_flags', 'salary_adjustments', 'quote_lifecycle_events',
    'contract_documents', 'vehicle_handovers', 'maintenance_requests',
    'schedules', 'settlement_shares', 'car_costs', 'tax_filing_records',
    'tax_items', 'investment_deposits', 'handler_capacity',
    'assignment_rules', 'assignment_log', 'assignments',
    'code_master', 'service_products', 'vehicle_overrides',
    'customer_settings', 'investigators', 'investigation_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    -- 테이블 존재 여부 확인 후 정책 생성
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl AND table_schema = 'public') THEN
      EXECUTE format('CREATE POLICY "authenticated_access" ON %I FOR ALL USING (auth.role() = ''authenticated'')', tbl);
    END IF;
  END LOOP;
END $$;

-- ============================================
-- 6단계: 불필요한 RPC 함수 삭제
-- ============================================
DROP FUNCTION IF EXISTS get_all_company_modules();
DROP FUNCTION IF EXISTS update_company_plan(uuid, text);
DROP FUNCTION IF EXISTS toggle_company_module(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS toggle_all_company_modules(uuid, boolean);
DROP FUNCTION IF EXISTS approve_company(uuid);
DROP FUNCTION IF EXISTS reject_company(uuid);

-- ============================================
-- 완료 확인
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ 마이그레이션 완료: FMI 단독 ERP 구조로 전환되었습니다.';
  RAISE NOTICE '- role 값 통합 (god_admin/master → admin)';
  RAISE NOTICE '- 50+ 테이블에서 company_id 제거';
  RAISE NOTICE '- 50+ RLS 정책 삭제 후 authenticated 기반으로 재생성';
  RAISE NOTICE '- companies, company_modules 테이블 삭제';
END $$;
