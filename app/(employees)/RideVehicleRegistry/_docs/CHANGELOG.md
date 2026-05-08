# CHANGELOG — RideVehicleRegistry (라이드 차량등록현황)

> 매 PR 종료 시 한 줄 이상 기록 (CLAUDE.md 규칙 22).

---

## 2026-05-06 | PR-6.9 | 차량등록현황 신설 — 자체 DB + 카페24 read 통합

### 사용자 요청
> "Employee of Ride Inc. / admin / 차량등록현황 만들고 싶어"
> "카페24 차량과 신규등록과 자체 디비를 별도로 관리"
> "카페24 차량을 보면서도 별도로 자체 디비로 관리 관제정리"

### 데이터 모델 (자체 FMI Cloud SQL)

```sql
CREATE TABLE ride_vehicles (
  id            VARCHAR(36) PK,
  car_number    VARCHAR(20) NOT NULL UNIQUE,
  car_model     VARCHAR(200),
  owner_name    VARCHAR(100),
  owner_phone   VARCHAR(50),
  cafe24_idno   VARCHAR(8),       -- 카페24 carsidno 매칭 (선택)
  status        VARCHAR(20) DEFAULT 'active',  -- active/paused/inactive
  note          TEXT,
  created_by    VARCHAR(36),
  created_at + updated_at
);
```

### API (5개)

```
GET    /api/cafe24/vehicles/search?q=     카페24 pmccarsm read-only 검색
GET    /api/ride-vehicles                  자체 DB list (status/q 필터)
POST   /api/ride-vehicles                  신규 등록
PATCH  /api/ride-vehicles/[id]             수정 (whitelist 컬럼만)
DELETE /api/ride-vehicles/[id]             soft delete (status='inactive')
```

### UI (`/RideVehicleRegistry`)

```
┌─ 헤더 (Glass L5) ─ "🚗 라이드 차량등록현황" + [+ 신규 등록]
├─ 좌(50%): 자체 DB              우(50%): 카페24 검색
│   필터: 전체/운영중/일시중지/폐기   검색: 차량번호/차종/차주
│   NeuDataTable (Glass L4)        결과 list
│   - 차량번호 / 차종 / 차주        - 차량 row
│   - 상태 / C24 매칭 / 등록일      - "✓ 등록됨" or "+ 등록" 버튼
│   - 행 클릭 → 편집 모달            - 클릭 시 자체 DB 등록 모달 자동 채움
└─ 모달: 신규/편집 (Glass L4)
   차량번호 (필수) / 차종 / 차주명 / 차주 연락처 / 상태 / 비고
   카페24 매칭 시 cafe24_idno 자동 연결
```

### 산출물

| 파일 | 종류 |
|------|------|
| `migrations/2026-05-06_ride_vehicles.sql` | 신규 (멱등 IF NOT EXISTS) |
| `app/api/cafe24/vehicles/search/route.ts` | 신규 (read-only 검색) |
| `app/api/ride-vehicles/route.ts` | 신규 (GET list / POST 신규) |
| `app/api/ride-vehicles/[id]/route.ts` | 신규 (PATCH 수정 / DELETE soft) |
| `app/(employees)/RideVehicleRegistry/page.tsx` | 신규 (좌우 2단 + 모달) |
| `lib/menu-registry.ts` | 갱신 (mod-ride-vehicle-reg cx-team) |

### 사이드바
- **Employee of Ride Inc. > CX팀 > 🚗 라이드 차량등록** (sortOrder 65)

### GATE 진행 상태

```
✅ G3 사용자 GO ("a,b 진행")
✅ G5 tsc 회귀 0건 (예상)
✅ G6 lint:harness 새 위반 0건 (예상)
✅ Rule 17 모듈 폴더 분리 (RideVehicleRegistry/)
✅ Rule 18 NeuDataTable 모든 컬럼 sortBy
✅ Rule 22 _docs 갱신 (본 파일)
✅ Rule 23 마이그레이션 멱등 (IF NOT EXISTS) + graceful fallback (_migration_pending)
⚠ Rule 21 Cowork — cross-module 의도 (api:cafe24 + api:ride-vehicles + RideVehicleRegistry)
   → COWORK_ALLOW_MULTI_MODULE=1 우회
```

### 마이그레이션 적용 의무

```
사용자 액션 (Cloud SQL 직접 실행):
  mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-06_ride_vehicles.sql

검증:
  SELECT COUNT(*) FROM ride_vehicles;  -- 0 (신규 테이블)
  SHOW CREATE TABLE ride_vehicles \G    -- 컬럼/인덱스 확인
```

### 다음 PR 예고

- **PR-6.9.b** — 차량별 통합 이력 (carsidno 매칭 시 사고/긴출 timeline 모달)
- **PR-6.9.c** — 카페24 → 자체 DB 일괄 가져오기 (대량 import)
- **PR-6.9.d** — 자체 차량 ↔ 카페24 차량 간 자동 매칭 (carsnums LIKE)
