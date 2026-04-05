# 마이그레이션 히스토리 (Migrator → 자동 기록)

> 이 파일은 Prisma 마이그레이션 이력을 기록합니다.

---

## 마이그레이션 목록

| 날짜 | 이름 | 위험도 | 변경 사항 | 상태 |
|------|------|--------|----------|------|
| 초기 | init | 🟢 | 전체 스키마 초기 생성 | ✅ 적용됨 |
| 2026-04-04 | 20260404_company_relationships | 🟡 | Company에 contractCategory, isDirectContract, primaryParentId 필드 추가 + CompanyRelationship M:N 테이블 생성 | ✅ 적용됨 |
| 2026-04-04 | 20260404_set_capital_relationships | 🟡 | contract_category 데이터 설정, is_direct_contract 값 설정, 3개 회사 관계(마춤카→마음카, 삼성카드→삼성화재서비스, 우리금융캐피탈→삼성화재서비스) 생성 | ⏳ 사용자 실행 대기 |

---

## 현재 스키마 주요 모델

### Company (회사)
- contractCategory: CAPITAL, CARD, INSURANCE, LEASE, RENTAL, MT
- isDirectContract: Boolean (true=직접계약사, false=소유주)
- primaryParentId: BigInt? (원청 회사 FK)
- 관계: primaryParent, childCompanies, parentRelations, childRelations

### CompanyRelationship (회사 관계)
- fromCompanyId → toCompanyId (소유주 → 계약사)
- relationshipType: MANAGED, OWNED 등
- isPrimary: Boolean
- commissionRate: Decimal?

### 주요 관계 패턴
- Case A: 직접계약사 → 직접계약사 (마춤카 → 마음카)
- Case B: 소유주(비직접) → 계약사(직접) (삼성카드 → 삼성화재서비스)
- Case C: 독립 계약사 (관계 없음)

---

## 주의사항
- `prisma migrate`를 사용하지 않고 raw SQL로 마이그레이션 (Cloud SQL 직접 실행)
- DDL(테이블 변경)과 DML(데이터 변경)을 별도 파일로 분리 권장
- 🔴 위험 마이그레이션(DROP TABLE, DROP COLUMN)은 반드시 사용자 확인 후 실행

---

_마지막 업데이트: 2026-04-04_
