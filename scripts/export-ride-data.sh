#!/usr/bin/env bash
# scripts/export-ride-data.sh
#
# 본 ERP DB (fmi_op) → 라이드 별도 DB (ride_op) 데이터 이관.
#   1. 본 ERP DB 에서 ride_* / cs_* / compliance_* / asset_* 테이블만 mysqldump
#   2. 결과 .sql 파일 → ride 서버에 scp/rsync
#   3. ride 서버에서 ride_op 에 import
#   4. 양쪽 row count 비교 — 검증
#
# 사용:
#   본 ERP 운영 서버 또는 백업 PC 에서:
#     ./scripts/export-ride-data.sh > dump-ride-YYYYMMDD.sql
#
#   ride 서버에서:
#     mysql -u ride_app -p ride_op < dump-ride-YYYYMMDD.sql
#     ./scripts/verify-ride-data.sh  # (별도 — 본 스크립트 내 검증 SQL 참조)
#
# 가이드: _docs/RIDE-EC2-SETUP.md § 10 마일스톤 S5
# 신설: 2026-05-31 (PR-RIDE-EC2-1)

set -euo pipefail

# ── 환경변수 (override 가능) ──────────────────────────────────────
SRC_HOST="${SRC_DB_HOST:-34.47.105.219}"      # 본 ERP Cloud SQL
SRC_PORT="${SRC_DB_PORT:-3306}"
SRC_USER="${SRC_DB_USER:-root}"
SRC_NAME="${SRC_DB_NAME:-fmi_op}"
# SRC_DB_PASSWORD 는 환경변수 또는 ~/.my.cnf 사용 (보안)

# ── 이관 대상 테이블 prefix ──────────────────────────────────────
#   본 ERP schema.prisma + migrations 기반.
#   사용자 / profiles / companies 같은 공통 인증 테이블은 ride 서버에서 별도 신설 후 minimal seed 권장.
TABLE_PREFIXES=(
  "ride_"
  "cs_"
  "compliance_"
  "asset_"
)

# ── 추가 개별 테이블 (prefix 안 맞지만 라이드 영역) ──────────────
EXTRA_TABLES=(
  "destruction_certificates"
  "destruction_signatures"
  "messageSendLog"      # 메일/SMS 발송 로그 — 라이드 발송분만 분리 후 이관 권장
  "messageTemplate"     # 라이드 회사 템플릿
  "system_modules"      # 메뉴 정의 (RIDE 그룹만 추후 필터)
  "user_page_permissions"  # 권한 (RIDE 사용자분만)
)

# ── 제외 테이블 (예: 큰 로그 / 임시) ────────────────────────────
EXCLUDE_TABLES=(
  "ride_audit_logs"     # 신규 서버 깨끗하게 시작 — 이관 X
  "cs_distributions"    # 발송 이력 — 신규 시작
)

# ── 검증 SQL — 양쪽 row count 비교 ──────────────────────────────
generate_verify_sql() {
  echo "-- ─── 본 ERP 에서 실행 후 ride 서버에서 같은 SQL 실행 → 비교 ───"
  for prefix in "${TABLE_PREFIXES[@]}"; do
    echo "SELECT table_name, table_rows"
    echo "  FROM information_schema.tables"
    echo " WHERE table_schema = DATABASE() AND table_name LIKE '${prefix}%'"
    echo " ORDER BY table_name;"
  done
}

# ── 1) 테이블 목록 조회 ─────────────────────────────────────────
collect_tables() {
  local where_clauses=()
  for prefix in "${TABLE_PREFIXES[@]}"; do
    where_clauses+=("table_name LIKE '${prefix}%'")
  done
  local extra_quoted=""
  for t in "${EXTRA_TABLES[@]}"; do
    extra_quoted+="'${t}',"
  done
  extra_quoted="${extra_quoted%,}"

  local sql="SELECT table_name FROM information_schema.tables \
    WHERE table_schema = '${SRC_NAME}' \
      AND ( $(IFS=' OR '; echo "${where_clauses[*]}") OR table_name IN (${extra_quoted}) ) \
    ORDER BY table_name"

  mysql --host="${SRC_HOST}" --port="${SRC_PORT}" \
        --user="${SRC_USER}" \
        --skip-column-names --batch \
        "${SRC_NAME}" -e "${sql}"
}

# ── 2) mysqldump 실행 ──────────────────────────────────────────
run_dump() {
  local tables
  tables=$(collect_tables | grep -v -E "^($(IFS='|'; echo "${EXCLUDE_TABLES[*]}"))$" || true)
  if [[ -z "${tables}" ]]; then
    echo "ERROR: 이관 대상 테이블 0개 — prefix / DB 이름 확인" >&2
    exit 1
  fi

  echo "-- 본 ERP DB → ride_op 이관 dump"
  echo "-- 생성: $(date '+%Y-%m-%d %H:%M:%S KST')"
  echo "-- 원본: ${SRC_USER}@${SRC_HOST}:${SRC_PORT}/${SRC_NAME}"
  echo "-- 대상 테이블 수: $(echo "${tables}" | wc -l)"
  echo "--"
  echo "-- 이관 대상:"
  echo "${tables}" | sed 's/^/--   /'
  echo "--"
  echo "-- 사용: mysql -u ride_app -p ride_op < $(basename "$0" .sh).sql"
  echo ""
  echo "SET FOREIGN_KEY_CHECKS = 0;"
  echo "SET UNIQUE_CHECKS = 0;"
  echo "SET AUTOCOMMIT = 0;"
  echo ""

  # mysqldump — 데이터 + 구조 (--single-transaction 으로 일관성 보장)
  # 환경변수 또는 ~/.my.cnf 로 비밀번호 전달 (-p 명시 X)
  mysqldump \
    --host="${SRC_HOST}" --port="${SRC_PORT}" --user="${SRC_USER}" \
    --single-transaction \
    --quick \
    --skip-lock-tables \
    --no-tablespaces \
    --default-character-set=utf8mb4 \
    --hex-blob \
    "${SRC_NAME}" \
    ${tables}

  echo ""
  echo "SET FOREIGN_KEY_CHECKS = 1;"
  echo "SET UNIQUE_CHECKS = 1;"
  echo "COMMIT;"
}

# ── 3) 메인 ────────────────────────────────────────────────────
case "${1:-dump}" in
  dump)
    run_dump
    ;;
  list)
    echo "이관 대상 테이블:"
    collect_tables
    ;;
  verify-sql)
    generate_verify_sql
    ;;
  *)
    cat <<EOF
사용:
  $0 dump        # mysqldump 실행 (stdout — 리다이렉트 권장)
  $0 list        # 이관 대상 테이블 목록만
  $0 verify-sql  # 양쪽에서 실행할 검증 SQL 출력

환경변수:
  SRC_DB_HOST    기본: 34.47.105.219
  SRC_DB_PORT    기본: 3306
  SRC_DB_USER    기본: root
  SRC_DB_NAME    기본: fmi_op
  SRC_DB_PASSWORD ~/.my.cnf 또는 MYSQL_PWD 환경변수 권장 (보안)

예:
  # 본 ERP 에서 dump 생성
  export MYSQL_PWD='강한비밀번호'
  ./scripts/export-ride-data.sh dump > dump-ride-\$(date +%Y%m%d).sql

  # ride 서버로 전송 + import
  scp dump-ride-*.sql ubuntu@<ride-EIP>:/tmp/
  ssh ubuntu@<ride-EIP> 'mysql -u ride_app -p ride_op < /tmp/dump-ride-*.sql'

  # 양쪽 row count 비교
  ./scripts/export-ride-data.sh verify-sql > verify.sql
  mysql -u root -p fmi_op   < verify.sql  > /tmp/src-counts.txt
  ssh ubuntu@<ride-EIP> 'mysql -u root -p ride_op' < verify.sql > /tmp/dst-counts.txt
  diff /tmp/src-counts.txt /tmp/dst-counts.txt
EOF
    exit 1
    ;;
esac
