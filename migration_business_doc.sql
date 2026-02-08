-- ============================================
-- 사업자등록증 업로드 기능 마이그레이션
-- 1. companies 테이블에 business_registration_url 컬럼 추가
-- 2. Supabase Storage 버킷 생성
-- 3. Storage 정책 설정 (업로드/다운로드)
-- 4. 사업자등록증 URL 업데이트 RPC
-- ============================================

-- =====================
-- 1. 컬럼 추가
-- =====================
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS business_registration_url TEXT;

-- =====================
-- 2. Storage 버킷 생성
-- =====================
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-docs', 'business-docs', true)
ON CONFLICT (id) DO NOTHING;

-- =====================
-- 3. Storage 정책 설정 (기존 정책 있으면 삭제 후 재생성)
-- =====================

DROP POLICY IF EXISTS "auth_users_upload_business_docs" ON storage.objects;
DROP POLICY IF EXISTS "public_read_business_docs" ON storage.objects;
DROP POLICY IF EXISTS "auth_users_update_own_business_docs" ON storage.objects;
DROP POLICY IF EXISTS "auth_users_delete_own_business_docs" ON storage.objects;

-- 인증된 사용자는 자기 UID 폴더에 업로드 가능
CREATE POLICY "auth_users_upload_business_docs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 공개 읽기 (god_admin이 승인 시 확인용)
CREATE POLICY "public_read_business_docs"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'business-docs');

-- 본인 파일 업데이트 허용
CREATE POLICY "auth_users_update_own_business_docs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'business-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 본인 파일 삭제 허용
CREATE POLICY "auth_users_delete_own_business_docs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'business-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- =====================
-- 4. 사업자등록증 URL 업데이트 RPC
-- =====================
CREATE OR REPLACE FUNCTION update_company_doc_url(doc_url TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- 현재 로그인한 사용자의 회사 찾기 (master 역할)
  SELECT company_id INTO v_company_id
  FROM profiles
  WHERE id = auth.uid();

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'company_not_found');
  END IF;

  -- 회사 레코드 업데이트
  UPDATE companies
  SET business_registration_url = doc_url
  WHERE id = v_company_id;

  RETURN json_build_object('success', true);
END;
$$;
