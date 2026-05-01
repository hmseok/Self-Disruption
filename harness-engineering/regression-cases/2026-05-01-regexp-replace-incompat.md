# 회귀 케이스 — REGEXP_REPLACE MySQL 호환성 미확인 (500 에러)

**날짜**: 2026-05-01
**카테고리**: sql-function, compatibility
**심각도**: 🔴 High (전체 거래 목록 로드 실패)

---

## Input

`/api/finance-upload?table=transactions` 호출 (통장/카드 거래 탭, 분류 검수)

## Expected

transactions 목록 + 매핑 정보 반환

## Actual (수정 전)

```
Failed to load resource: the server responded with a status of 500 ()
```

→ 통장 거래 탭 631건 카운트 있는데 데이터 표출 X

---

## Root Cause — 3-Why

| Why | 답 |
|-----|----|
| 1. 왜 500 에러 | `REGEXP_REPLACE` 호출이 SQL 실행 실패 |
| 2. 왜 호환성 안 맞나 | MySQL 5.7 미지원 (8.0+ 필요). Cloud SQL 인스턴스 버전 미확인 |
| 3. 왜 try/catch 가 못 잡나 | catch 가 'Unknown column' 만 잡음 — 다른 SQL 에러 throw → 500 |

## Prevention — 재발 방지

CLAUDE.md § 0-1 **규칙 13 신설** (2026-05-01):

```
외부 시스템 호환성 사전 검증 의무
[A] DB 함수: 도입 버전 확인 + 화이트리스트
[B] 라이브러리: package.json 확인
[C] 외부 API: 실제 호출 후 응답 확인
[D] try/catch broad — 알려진 에러만 처리 X, graceful fallback
```

## SQL 함수 화이트리스트 (안전)

```
✅ 안전 (MySQL 5.7 / 8.x 모두 OK):
   CONCAT, CONCAT_WS, COALESCE, IF, CASE WHEN
   LEFT, RIGHT, SUBSTRING, INSTR, REPLACE
   LENGTH, CHAR_LENGTH
   DATE_FORMAT, DATE_SUB, DATE_ADD, NOW, CURDATE
   ROUND, FLOOR, CEILING, MOD
   COUNT, SUM, AVG, MAX, MIN, GROUP_CONCAT

⚠️ 회색 (8.0+ 만 지원):
   REGEXP_REPLACE, JSON_TABLE
   WINDOW 함수 (ROW_NUMBER, RANK 등)
   LATERAL JOIN

❌ 위험:
   사용자 정의 함수 (UDF) — 인스턴스 다를 수 있음
```

## Test Vectors

### 회피 패턴 — REGEXP_REPLACE 안 쓰고 same effect

```sql
-- ❌ 위험 (MySQL 5.7 미지원)
RIGHT(REGEXP_REPLACE(account_number, '[^0-9]', ''), 4)

-- ✅ 안전 — 백엔드에서 미리 추출
const last4 = String(account_number || '').replace(/\D/g, '').slice(-4)
SELECT ... WHERE last4 = '8777'

-- ✅ 안전 — 컬럼 별도 (마이그레이션)
ALTER TABLE bank_account_mappings ADD COLUMN last4 VARCHAR(4) AS
  (RIGHT(REGEXP_LIKE(account_number, '...') ...))
-- (이것도 함수 의존이라 별도 검증 필요)
```

## 관련 커밋

- db29827 — 통장 표시 강화 (REGEXP_REPLACE 도입 — 사고 발생)
- c561691 — REGEXP_REPLACE 제거 + try/catch broad
- (이 커밋) — 규칙 13 신설 + 회귀 케이스 등록

## 동시 발생 패턴 (인덱스)

같은 날 같은 부류 실수 2회:
1. profiles.full_name 추측 → 1054 에러
2. REGEXP_REPLACE 호환 미확인 → 500 에러

→ 모두 "외부 시스템 의존을 검증 없이 가정" 의 다른 표현.
   규칙 13 가 이 패턴 차단.
