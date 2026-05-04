# DB ID 규정

## 1. ID 타입 표준

| 테이블 유형 | PK 타입 | 예시 |
|---|---|---|
| 핵심 엔티티 (회사, 사용자) | `UUID` (gen_random_uuid) | companies, profiles |
| 업무 엔티티 (사고, 작업) | `UUID` | accidents, work_orders |
| 운영 엔티티 (차량, 고객, 공장) | `BIGINT` (GENERATED ALWAYS) | cars, customers, factories |
| 참조/기준 데이터 | `BIGSERIAL` | code_master |

## 2. FK 규칙

FK 컬럼의 타입은 반드시 참조 대상 PK 타입과 일치해야 함.

```sql
accidents.car_id      BIGINT  → cars.id       BIGINT   ✅
accidents.factcode    TEXT    → factories.factcode TEXT ✅
```

## 3. 프론트엔드 ID 처리

```ts
import { cleanId } from '@/app/lib/id'
// 빈값(null/undefined/''/0)만 null 처리, 타입은 DB가 결정
const payload = { factcode: cleanId(form.factcode), car_id: cleanId(form.car_id) }
```

- ID 값을 프론트에서 UUID/숫자 변환하지 않음
- 빈값만 null로 정리

## 4. 새 테이블 생성 시

```sql
CREATE TABLE accidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  car_id BIGINT REFERENCES cars(id) ON DELETE SET NULL,
  factcode TEXT REFERENCES factories(factcode) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```
