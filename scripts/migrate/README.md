# FMI ERP — Supabase → Google Cloud SQL 데이터 마이그레이션 가이드

> **목표**: 데이터 손실 0건, 서비스 중단 없이 MySQL로 전환

---

## 파일 구조

```
scripts/migrate/
  01_pgloader.load       ← pgloader 설정 (메인 마이그레이션 실행)
  02_mysql_post_fix.sql  ← 마이그레이션 후 MySQL 후처리 (타입 변환, 트리거)
  03_verify.js           ← 데이터 검증 스크립트 (row 수 비교)
  04_incremental_sync.js ← 전환 기간 중 증분 동기화 (옵션)
```

---

## 사전 준비

### 1. Google Cloud SQL 인스턴스 (✅ 완료)

이미 생성 완료된 Cloud SQL 인스턴스 정보:
- **Connection Name**: `secondlife-485816:asia-northeast3:r-care-db`
- **Public IP**: `34.47.105.219`
- **Port**: `3306`
- **Database**: `fmi_op` ✅ 생성 완료

```bash
# Cloud SQL Auth Proxy 설치 (Mac)
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.11.0/cloud-sql-proxy.darwin.amd64
chmod +x cloud-sql-proxy

# (선택) 전용 DB 사용자 생성 — root 대신 사용 권장
mysql -h 34.47.105.219 -P 3306 -u root -p <<EOF
CREATE USER 'fmi_op_user'@'%' IDENTIFIED BY 'STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON fmi_op.* TO 'fmi_op_user'@'%';
FLUSH PRIVILEGES;
EOF
```

### 2. pgloader 설치

```bash
# Mac
brew install pgloader

# Ubuntu/Debian
sudo apt-get install pgloader

# 버전 확인
pgloader --version
```

### 3. Node.js 패키지 설치 (검증 스크립트용)

```bash
cd scripts/migrate
npm init -y
npm install pg mysql2
```

---

## 실행 순서

### STEP 1: Cloud SQL Proxy 시작 (권장) 또는 Public IP 직접 연결

**방법 A: Cloud SQL Proxy (권장 — 암호화 자동)**
```bash
# 별도 터미널에서 실행 (백그라운드 유지)
./cloud-sql-proxy secondlife-485816:asia-northeast3:r-care-db --port=3307

# 연결 확인
mysql -h 127.0.0.1 -P 3307 -u root -p fmi_op -e "SELECT 1"
```

**방법 B: Public IP 직접 (Proxy 없을 때)**
```bash
# GCP 콘솔 → Cloud SQL → r-care-db → 연결 → 승인된 네트워크 → 내 IP 추가
mysql -h 34.47.105.219 -P 3306 -u root -p fmi_op -e "SELECT 1"
```

### STEP 2: pgloader 설정 파일 수정

`01_pgloader.load` 파일에서 **2곳**만 수정:

| 변수 | 어디서 확인 | 예시 |
|------|-----------|------|
| `SUPABASE_REF` | Supabase URL: `https://SUPABASE_REF.supabase.co` | `uiyiwgkpchnvuvpsjfxv` |
| `SUPABASE_PW` | Supabase → Settings → Database → Password | `your_pg_pass` |
| `MYSQL_USER` | root 또는 생성한 사용자 | `root` |
| `MYSQL_PW` | Cloud SQL 비밀번호 | `your_mysql_pass` |

> **DB명은 이미 `fmi_op`으로 설정되어 있습니다 — 수정 불필요**

### STEP 3: pgloader 실행 (메인 마이그레이션)

```bash
cd scripts/migrate

# 먼저 dry-run으로 확인
pgloader --dry-run ./01_pgloader.load

# 실제 실행 (5~30분 소요)
pgloader ./01_pgloader.load 2>&1 | tee /tmp/pgloader_$(date +%Y%m%d_%H%M).log

# 실행 중 진행상황 확인 (다른 터미널)
tail -f /tmp/pgloader_*.log
```

**pgloader 완료 후 출력 예시:**
```
                    table name     errors       rows      bytes      total time
---------------------------  ---------  ---------  ---------  --------------
               fetch meta data          0         60                     1.234s
                create tables          0         60                     2.345s
                  fmi_vehicles          0       1250   340.5 kB         12.3s
                 fmi_accidents          0       5420     1.2 MB         45.6s
                    fmi_rentals          0       8340     2.1 MB         67.8s
---------------------------
         COPY Threads Completion    0         4                     2m34s
```

### STEP 4: MySQL 후처리 실행

```bash
# Cloud SQL Proxy 사용 시:
mysql -h 127.0.0.1 -P 3307 -u root -p fmi_op < 02_mysql_post_fix.sql

# Public IP 직접 연결 시:
mysql -h 34.47.105.219 -P 3306 -u root -p fmi_op < 02_mysql_post_fix.sql
```

이 스크립트가 하는 일:
- JSONB 컬럼 → MySQL JSON 타입으로 변환
- TEXT[] 배열 컬럼 → MySQL JSON 배열로 변환 (`{a,b}` → `["a","b"]`)
- MySQL 트리거 생성 (updated_at 자동갱신, 대차번호 자동생성 등)
- 한국어 지원을 위한 utf8mb4 문자셋 설정

### STEP 5: 데이터 검증

```bash
# 환경변수 설정 (Supabase REF: uiyiwgkpchnvuvpsjfxv — Supabase URL에서 확인)
export SUPABASE_DB_URL="postgresql://postgres.uiyiwgkpchnvuvpsjfxv:SUPABASE_PW@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"
export MYSQL_HOST="34.47.105.219"      # 또는 127.0.0.1 (Proxy 사용 시)
export MYSQL_PORT="3306"               # 또는 3307 (Proxy 사용 시)
export MYSQL_USER="root"
export MYSQL_PASSWORD="YOUR_MYSQL_PW"
export MYSQL_DATABASE="fmi_op"

# 검증 실행
node 03_verify.js
```

**검증 결과 예시 (정상):**
```
🔍 FMI ERP 데이터 마이그레이션 검증 시작
====================================================================
테이블명                              PG행수   MY행수     결과
--------------------------------------------------------------------
✅ fmi_vehicles                         1250     1250       ✅ PASS
✅ fmi_accidents                         5420     5420       ✅ PASS
✅ fmi_rentals                           8340     8340       ✅ PASS
...
🎉 모든 테이블 데이터가 완전히 이전되었습니다!
```

---

## 문제 해결

### row 수 불일치 발생 시

```bash
# 특정 테이블만 재이전 (01_pgloader.load에 아래 추가)
# ONLY TABLE NAMES MATCHING 'fmi_rentals'

pgloader ./01_pgloader.load
```

### pgloader 오류: "could not connect to server"

```bash
# Supabase 연결 테스트
psql "postgresql://postgres.REF:PW@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require" -c "\dt public.*"
```

### JSON 변환 오류 발생 시

```sql
-- MySQL에서 오류 row 확인
SELECT id, return_photos FROM fmi_rentals WHERE JSON_VALID(return_photos) = 0;

-- 수동 수정
UPDATE fmi_rentals SET return_photos = '[]' WHERE return_photos = '' OR return_photos IS NULL;
```

### TEXT[] 변환이 잘못된 경우

pgloader가 `{val1,val2}` 형식으로 저장하면, 02_mysql_post_fix.sql의 UPDATE 문이 변환합니다.
변환 실패 시:
```sql
-- 현재 저장된 값 확인
SELECT id, return_photos FROM fmi_rentals LIMIT 10;

-- 수동 JSON 변환 (Python 스크립트)
```

---

## 전환(Cutover) 체크리스트

운영 전환 전 최종 확인 사항:

- [ ] `03_verify.js` 모든 테이블 PASS
- [ ] MySQL에서 INSERT/UPDATE 테스트 완료
- [ ] Prisma ORM 기본 CRUD 동작 확인
- [ ] `lib/prisma.ts` Cloud Run 환경변수 설정
- [ ] Dockerfile에 DATABASE_URL 추가
- [ ] Cloud Run 서비스 계정 `roles/cloudsql.client` 권한 확인

---

## 주의사항

⚠️ **pgloader 실행 전 반드시 Supabase 백업 먼저 수행**

```bash
# Supabase CLI로 백업
supabase db dump \
  --db-url "postgresql://postgres.uiyiwgkpchnvuvpsjfxv:SUPABASE_PW@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres" \
  -f backup_$(date +%Y%m%d).sql
```

⚠️ **마이그레이션 중 Supabase DB는 그대로 유지** — 전환 완료 전까지 삭제하지 마세요.
