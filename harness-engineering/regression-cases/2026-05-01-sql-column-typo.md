# 회귀 케이스 — SQL 컬럼명 추측 (1054 Unknown column)

**날짜**: 2026-05-01
**카테고리**: sql, schema-validation
**심각도**: 🔴 High (사용자 워크플로우 차단)

---

## Input (실제 사용자 행동)

사용자가 카드 거래 탭의 「🔍 매칭 진단」 버튼 클릭

## Expected

진단 결과 alert 표시 (카테고리별 분포 + 매핑 부재 등)

## Actual (수정 전)

```
hmseok.com 내용:
오류:
Invalid `prisma.$queryRaw()` invocation:
Raw query failed. Code: `1054`. Message: `Unknown column 'p.full_name' in 'field list'`
```

---

## Root Cause — 3-Why

| Why | 답 |
|-----|----|
| 1. 왜 SQL 에러가 났나 | profiles 테이블에 `full_name` 컬럼이 없음. 실제는 `name` |
| 2. 왜 잘못된 컬럼명을 썼나 | 코드 작성 시 schema.prisma 확인 안 하고 컬럼명 추측 |
| 3. 왜 추측했나 | "보통 이름 컬럼은 full_name 일 것" 같은 통념. 실제 검증 단계 부재 |

## Prevention — 재발 방지

CLAUDE.md § 0-1 **규칙 11 신설** (2026-05-01):

```
새 SQL 작성 전 사전 검증 의무:
[A] SQL 컬럼명 검증 — schema.prisma + migrations 직접 확인
[B] API 사용처 추적 — grep 으로 모든 호출처 확인
[C] 데이터 흐름 끝점 검증 — UI → API → SQL → DB 4단계 일치 확인
```

## Test Vectors (재발 검증용)

새 SQL 작성 시 다음 케이스 의무 검증:

```js
// ❌ 잘못된 가정
SELECT p.full_name FROM profiles p

// ✅ schema.prisma 확인 후
// model Profile { name String? @@map("profiles") }
SELECT p.name AS employee_name FROM profiles p
```

## 관련 커밋

- `b08be50` — fix(card-diag): profiles.full_name → profiles.name
- (이 커밋) — 회귀 케이스 + 규칙 11 신설

## 동시 발생 패턴 (관찰)

같은 부류의 실수가 같은 날 반복:
1. 회의록 시스템 — 4차례 hotfix (데이터 흐름 끝까지 안 따라감)
2. 카드 탭 표시 — `/api/finance/transactions/list` 만 수정, 실제 사용 API `/api/finance-upload?table=transactions` 누락
3. profiles.full_name 추측

→ 모두 "사전 검증 부족" 의 다른 표현. 규칙 11 가 이 3가지 모두 차단.
