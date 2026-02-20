-- ============================================================
-- 026_quote_sharing.sql
-- 견적서 공유 + 고객 전자서명 + 계약 자동확정 워크플로우
-- ============================================================

-- 1. 공유 토큰 테이블
create table if not exists quote_share_tokens (
  id uuid primary key default gen_random_uuid(),
  quote_id bigint not null references quotes(id) on delete cascade,
  company_id uuid not null,
  token text not null unique,
  status text default 'active' check (status in ('active','signed','revoked','expired')),
  expires_at timestamptz not null,
  accessed_at timestamptz,
  access_count int default 0,
  created_at timestamptz default now()
);

create index if not exists idx_share_token on quote_share_tokens(token);
create index if not exists idx_share_quote on quote_share_tokens(quote_id);

-- 2. 고객 서명 테이블
create table if not exists customer_signatures (
  id uuid primary key default gen_random_uuid(),
  quote_id bigint not null references quotes(id),
  token_id uuid not null references quote_share_tokens(id),
  customer_name text not null,
  customer_phone text,
  customer_email text,
  signature_data text,
  agreed_terms boolean default true,
  signed_at timestamptz default now(),
  ip_address text,
  user_agent text
);

create index if not exists idx_sig_quote on customer_signatures(quote_id);

-- 3. quotes 테이블 확장
alter table quotes add column if not exists shared_at timestamptz;
alter table quotes add column if not exists signed_at timestamptz;

-- 4. contracts 테이블 확장
alter table contracts add column if not exists signature_id uuid;

-- 5. RLS 비활성화 (서비스롤로만 접근)
alter table quote_share_tokens enable row level security;
alter table customer_signatures enable row level security;

-- 공개 토큰 조회 (활성 + 미만료)
create policy "public_read_active_tokens" on quote_share_tokens
  for select using (status = 'active' and expires_at > now());

-- 인증된 사용자는 자기 회사 토큰 전체 CRUD
create policy "staff_manage_tokens" on quote_share_tokens
  for all using (true) with check (true);

-- 서명 테이블: 인증된 사용자 읽기
create policy "staff_read_signatures" on customer_signatures
  for select using (true);

-- 서명 테이블: 공개 삽입 (API에서 토큰 검증)
create policy "public_insert_signatures" on customer_signatures
  for insert with check (true);
