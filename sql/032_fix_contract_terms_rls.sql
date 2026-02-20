-- ================================================================
-- 032: contract_terms 테이블 RLS 정책 수정
-- ================================================================
-- 문제: 030에서 생성한 RLS 정책이 god_admin 접근을 허용하지 않음
-- 해결: 다른 테이블과 동일한 패턴(get_my_company_id + is_platform_admin) 적용
-- ================================================================

-- ──────────────────────────────────────────
-- 1. contract_terms
-- ──────────────────────────────────────────
DROP POLICY IF EXISTS "contract_terms_company" ON contract_terms;

CREATE POLICY "contract_terms_select" ON contract_terms FOR SELECT
  USING (company_id = get_my_company_id() OR is_platform_admin());

CREATE POLICY "contract_terms_insert" ON contract_terms FOR INSERT
  WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());

CREATE POLICY "contract_terms_update" ON contract_terms FOR UPDATE
  USING (company_id = get_my_company_id() OR is_platform_admin())
  WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());

CREATE POLICY "contract_terms_delete" ON contract_terms FOR DELETE
  USING (company_id = get_my_company_id() OR is_platform_admin());


-- ──────────────────────────────────────────
-- 2. contract_term_articles
-- ──────────────────────────────────────────
DROP POLICY IF EXISTS "contract_term_articles_access" ON contract_term_articles;

CREATE POLICY "contract_term_articles_select" ON contract_term_articles FOR SELECT
  USING (
    terms_id IN (SELECT id FROM contract_terms WHERE company_id = get_my_company_id())
    OR is_platform_admin()
  );

CREATE POLICY "contract_term_articles_insert" ON contract_term_articles FOR INSERT
  WITH CHECK (
    terms_id IN (SELECT id FROM contract_terms WHERE company_id = get_my_company_id())
    OR is_platform_admin()
  );

CREATE POLICY "contract_term_articles_update" ON contract_term_articles FOR UPDATE
  USING (
    terms_id IN (SELECT id FROM contract_terms WHERE company_id = get_my_company_id())
    OR is_platform_admin()
  )
  WITH CHECK (
    terms_id IN (SELECT id FROM contract_terms WHERE company_id = get_my_company_id())
    OR is_platform_admin()
  );

CREATE POLICY "contract_term_articles_delete" ON contract_term_articles FOR DELETE
  USING (
    terms_id IN (SELECT id FROM contract_terms WHERE company_id = get_my_company_id())
    OR is_platform_admin()
  );


-- ──────────────────────────────────────────
-- 3. contract_term_history
-- ──────────────────────────────────────────
DROP POLICY IF EXISTS "contract_term_history_access" ON contract_term_history;

CREATE POLICY "contract_term_history_select" ON contract_term_history FOR SELECT
  USING (
    terms_id IN (SELECT id FROM contract_terms WHERE company_id = get_my_company_id())
    OR is_platform_admin()
  );

CREATE POLICY "contract_term_history_insert" ON contract_term_history FOR INSERT
  WITH CHECK (
    terms_id IN (SELECT id FROM contract_terms WHERE company_id = get_my_company_id())
    OR is_platform_admin()
  );

CREATE POLICY "contract_term_history_update" ON contract_term_history FOR UPDATE
  USING (
    terms_id IN (SELECT id FROM contract_terms WHERE company_id = get_my_company_id())
    OR is_platform_admin()
  )
  WITH CHECK (
    terms_id IN (SELECT id FROM contract_terms WHERE company_id = get_my_company_id())
    OR is_platform_admin()
  );

CREATE POLICY "contract_term_history_delete" ON contract_term_history FOR DELETE
  USING (
    terms_id IN (SELECT id FROM contract_terms WHERE company_id = get_my_company_id())
    OR is_platform_admin()
  );


-- ──────────────────────────────────────────
-- 4. contract_special_terms
-- ──────────────────────────────────────────
DROP POLICY IF EXISTS "contract_special_terms_company" ON contract_special_terms;

CREATE POLICY "contract_special_terms_select" ON contract_special_terms FOR SELECT
  USING (company_id = get_my_company_id() OR is_platform_admin());

CREATE POLICY "contract_special_terms_insert" ON contract_special_terms FOR INSERT
  WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());

CREATE POLICY "contract_special_terms_update" ON contract_special_terms FOR UPDATE
  USING (company_id = get_my_company_id() OR is_platform_admin())
  WITH CHECK (company_id = get_my_company_id() OR is_platform_admin());

CREATE POLICY "contract_special_terms_delete" ON contract_special_terms FOR DELETE
  USING (company_id = get_my_company_id() OR is_platform_admin());
