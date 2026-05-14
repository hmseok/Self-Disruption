# 라이드 자산 관리 — 데이터 모델

> **작성**: 2026-05-14 (assets 세션 신설)
> **목적**: Rule 22 — 모듈 _docs 갱신 의무 (DATA-MODEL).
> **모듈**: `app/(employees)/RideAssets/*` + `app/api/ride-assets/*`
> **인터뷰 출처**: `_docs/ASSETS-PERSONAS.md` § 0
> **마이그레이션**: `migrations/2026-05-14_ride_assets.sql`

---

## 1. 테이블 개요

본 모듈은 **4개 신규 테이블** + **기존 `users` 테이블 참조 (FK 아님 — 라이드 스타일 일관성)**.

| 테이블 | 용도 | 예상 row 수 |
|--------|------|------------|
| `ride_asset_categories` | 카테고리 마스터 (권한자 관리) | 5~20 |
| `ride_assets` | 자산 본체 | 500~5,000 (수년) |
| `ride_asset_admins` | 권한자(총무팀) 화이트리스트 | 1~5 |
| `ride_asset_logs` | 자산 변경/매칭 이력 | 자산수 × 10 |

**기존 테이블과의 관계 (Rule 25 인터뷰 — 완전 분리)**:
- ❌ `cars`, `fmi_vehicles`, `ride_chargers` 와 FK 관계 없음
- ❌ `ride_employees` 와 FK 없음 (라이드 모듈 스타일 — user_id 직접 참조)
- ✅ `users.id` (cuid string) 참조 — `assigned_user_id`, `created_by`

---

## 2. 테이블 상세

### 2.1 `ride_asset_categories` — 카테고리 마스터

권한자가 추가/수정/순서변경. 카테고리별 자산 시퀀스 카운터 포함.

```sql
CREATE TABLE IF NOT EXISTS ride_asset_categories (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,          -- UUID
  code          VARCHAR(8)   NOT NULL,                       -- 'VH','OF','IT','CC','ET' (자산코드 prefix)
  name          VARCHAR(40)  NOT NULL,                       -- '차량','사무비품','IT장비','법인카드','기타'
  emoji         VARCHAR(8)   DEFAULT NULL,                   -- '🚗','🪑','💻','💳','📦'
  sort_order    INT          NOT NULL DEFAULT 100,
  next_seq      INT          NOT NULL DEFAULT 1,             -- 다음 자산코드 시퀀스 (연도별 리셋 X — 통산)
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_asset_cat_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**초기 시드 (멱등 — Rule 24)**:
```sql
INSERT IGNORE INTO ride_asset_categories (id, code, name, emoji, sort_order, next_seq) VALUES
  (UUID(), 'VH', '차량',     '🚗', 10, 1),
  (UUID(), 'OF', '사무비품', '🪑', 20, 1),
  (UUID(), 'IT', 'IT장비',  '💻', 30, 1),
  (UUID(), 'CC', '법인카드', '💳', 40, 1),
  (UUID(), 'ET', '기타',     '📦', 90, 1);
```

**자산코드 생성 (트랜잭션)**:
```sql
START TRANSACTION;
  SELECT next_seq INTO @seq FROM ride_asset_categories WHERE code = 'IT' FOR UPDATE;
  UPDATE ride_asset_categories SET next_seq = next_seq + 1 WHERE code = 'IT';
  SET @asset_code = CONCAT('IT-', YEAR(NOW()), '-', LPAD(@seq, 4, '0'));
  -- INSERT INTO ride_assets ...
COMMIT;
```

---

### 2.2 `ride_assets` — 자산 본체

```sql
CREATE TABLE IF NOT EXISTS ride_assets (
  id                  VARCHAR(36)  NOT NULL PRIMARY KEY,    -- UUID
  asset_code          VARCHAR(20)  NOT NULL,                 -- 'IT-2026-0001'
  category_id         VARCHAR(36)  NOT NULL,                 -- FK→ride_asset_categories.id (소프트)
  name                VARCHAR(120) NOT NULL,                 -- 'ThinkPad X1 Carbon Gen11'
  acquired_at         DATE         DEFAULT NULL,             -- 취득일
  acquired_cost       DECIMAL(15,2) DEFAULT NULL,            -- 취득가
  status              VARCHAR(20)  NOT NULL DEFAULT 'active',-- 'active','disposed','lost','repair'
  assigned_user_id    VARCHAR(36)  DEFAULT NULL,             -- users.id (NULL=공통 자산)
  location            VARCHAR(120) DEFAULT NULL,             -- '3F 개발팀', '본사 차고지' 등
  notes               TEXT         DEFAULT NULL,             -- 자유 메모
  qr_token            VARCHAR(36)  NOT NULL,                 -- UUID — QR 스캔 라우트 토큰
  disposed_at         DATETIME     DEFAULT NULL,             -- 처분일
  disposed_reason     VARCHAR(200) DEFAULT NULL,             -- '매각', '폐기', '분실' 등
  created_by          VARCHAR(36)  DEFAULT NULL,             -- users.id
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_assets_code (asset_code),
  UNIQUE KEY uq_ride_assets_qr (qr_token),
  KEY idx_ride_assets_category (category_id),
  KEY idx_ride_assets_user (assigned_user_id),
  KEY idx_ride_assets_status (status),
  KEY idx_ride_assets_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**상태 값**:
- `active` — 운영 중 (할당/미할당 무관)
- `repair` — 정비/수리 중
- `disposed` — 처분 완료 (매각/폐기)
- `lost` — 분실

**상태 ↔ 매칭 관계**:
- `status='active'` + `assigned_user_id IS NULL` → 「공통 자산」 (📦 탭)
- `status='active'` + `assigned_user_id NOT NULL` → 사용자 할당
- `status='disposed'` 또는 `'lost'` → 목록에서 분리 (별도 「처분 이력」 필터로만)

---

### 2.3 `ride_asset_admins` — 권한자(총무팀) 화이트리스트

라이드 admin 이 등록. 본 테이블에 user_id 있으면 자산 관리 권한 부여.

```sql
CREATE TABLE IF NOT EXISTS ride_asset_admins (
  user_id      VARCHAR(36)  NOT NULL PRIMARY KEY,    -- users.id
  granted_by   VARCHAR(36)  DEFAULT NULL,             -- users.id (라이드 admin)
  granted_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note         VARCHAR(200) DEFAULT NULL              -- '총무팀 김OO' 등
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**권한 체크 로직 (서버사이드 helper)**:
```ts
// lib/ride-asset-perm.ts (신규)
export async function isAssetAdmin(userId: string): Promise<boolean> {
  // 라이드 admin 도 자동으로 권한자
  const user = await prisma.users.findUnique({ where: { id: userId } })
  if (user?.role === 'admin') return true
  // 또는 화이트리스트에 등록된 user_id
  const row = await prisma.$queryRaw`
    SELECT 1 FROM ride_asset_admins WHERE user_id = ${userId} LIMIT 1
  `
  return Array.isArray(row) && row.length > 0
}
```

---

### 2.4 `ride_asset_logs` — 변경/매칭 이력

자산 상태 변경 / 사용자 매칭 변경 / 위치 변경 추적. 분석·감사용.

```sql
CREATE TABLE IF NOT EXISTS ride_asset_logs (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  asset_id        VARCHAR(36)  NOT NULL,                  -- ride_assets.id
  action          VARCHAR(40)  NOT NULL,                  -- 'created','assigned','unassigned','status_change','location_update','disposed','restored'
  from_user_id    VARCHAR(36)  DEFAULT NULL,              -- assigned 전 user (unassigned 시)
  to_user_id      VARCHAR(36)  DEFAULT NULL,              -- assigned 후 user
  from_status     VARCHAR(20)  DEFAULT NULL,
  to_status       VARCHAR(20)  DEFAULT NULL,
  from_location   VARCHAR(120) DEFAULT NULL,
  to_location     VARCHAR(120) DEFAULT NULL,
  by_user_id      VARCHAR(36)  DEFAULT NULL,              -- 동작 수행한 user (권한자 또는 사용자 본인)
  note            VARCHAR(400) DEFAULT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ride_asset_logs_asset (asset_id, created_at),
  KEY idx_ride_asset_logs_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**action 종류**:
| action | 기록 시점 |
|--------|----------|
| `created` | 자산 신규 등록 |
| `assigned` | 사용자에게 매칭 |
| `unassigned` | 사용자 매칭 해제 (→ 공통 자산) |
| `status_change` | status 변경 (active↔repair↔disposed↔lost) |
| `location_update` | location 변경 (사용자 본인도 가능) |
| `disposed` | 처분 (status_change 의 특수형 — 추가 기록) |
| `restored` | 처분 취소 → active 복귀 |

---

## 3. 관계도 (ER)

```
┌────────────────────────┐         ┌─────────────────────────┐
│ ride_asset_categories  │         │  ride_assets            │
├────────────────────────┤         ├─────────────────────────┤
│ id (PK)                │◄────────│ category_id (FK soft)   │
│ code (UQ) 'VH','OF'... │         │ asset_code (UQ)         │
│ name, emoji, sort_order│         │ qr_token (UQ)           │
│ next_seq               │         │ status, assigned_user_id│
│ is_active              │         │ acquired_at/cost        │
└────────────────────────┘         │ location, notes         │
                                    │ disposed_at/reason      │
                                    │ created_by, created_at  │
                                    └─────────────────────────┘
                                              ▲ asset_id
                                              │ from_user_id / to_user_id
                                              │ by_user_id
                                    ┌─────────┴───────────────┐
                                    │  ride_asset_logs        │
                                    ├─────────────────────────┤
                                    │ id (PK, BIGINT)         │
                                    │ action                  │
                                    │ from_/to_user_id        │
                                    │ from_/to_status         │
                                    │ from_/to_location       │
                                    │ by_user_id, note        │
                                    └─────────────────────────┘

┌──────────────────────────┐                  ┌─────────────────────┐
│ users (기존 — read only) │                  │ ride_asset_admins   │
├──────────────────────────┤                  ├─────────────────────┤
│ id (cuid)                │◄─── user_id ─────│ user_id (PK)        │
│ name, role               │                  │ granted_by, _at     │
└──────────────────────────┘                  │ note                │
        ▲ assigned_user_id                    └─────────────────────┘
        ▲ created_by
        └ (ride_assets 컬럼들)
```

**모든 FK는 soft (라이드 모듈 스타일)**: 애플리케이션 레벨에서 무결성 보장. DB constraint 사용 X.

---

## 4. 인덱스 전략

| 인덱스 | 컬럼 | 목적 |
|--------|------|------|
| `uq_ride_asset_cat_code` | `ride_asset_categories.code` | 카테고리 prefix 중복 방지 + 코드 조회 |
| `uq_ride_assets_code` | `ride_assets.asset_code` | 자산코드 중복 방지 + 검색 |
| `uq_ride_assets_qr` | `ride_assets.qr_token` | QR 스캔 라우트 빠른 조회 |
| `idx_ride_assets_category` | `ride_assets.category_id` | 카테고리별 필터 (NavTabs) |
| `idx_ride_assets_user` | `ride_assets.assigned_user_id` | 「내 자산」, 「공통 자산」 필터 |
| `idx_ride_assets_status` | `ride_assets.status` | 처분 자산 제외 등 |
| `idx_ride_assets_created_at` | `ride_assets.created_at` | 정렬 (Rule 18 — 모든 컬럼 sortBy) |
| `idx_ride_asset_logs_asset` | `(asset_id, created_at)` | 자산별 이력 시계열 |
| `idx_ride_asset_logs_action` | `(action, created_at)` | 액션별 통계 |

---

## 5. API 엔드포인트 매핑

| Method | 경로 | 책임 |
|--------|------|------|
| GET | `/api/ride-assets` | 자산 목록 (필터: category/status/assigned/q) |
| GET | `/api/ride-assets/[id]` | 자산 상세 |
| POST | `/api/ride-assets` | 자산 등록 (권한자 + 자산코드 자동 생성) |
| PATCH | `/api/ride-assets/[id]` | 자산 수정 (권한자 전체 / 본인 위치·메모만) |
| DELETE | `/api/ride-assets/[id]` | 자산 삭제 (권한자만, 보통 status=disposed 권장) |
| POST | `/api/ride-assets/[id]/assign` | 사용자 매칭 변경 (권한자) |
| GET | `/api/ride-assets/qr/[token]` | QR 스캔 — 자산 조회 (모바일) |
| POST | `/api/ride-assets/qr/[token]/location` | QR 페이지 — 위치 업데이트 (본인 자산 한정) |
| GET | `/api/ride-assets/print` | 다중 자산 라벨 PDF 생성 (권한자) |
| GET | `/api/ride-asset-categories` | 카테고리 목록 |
| POST | `/api/ride-asset-categories` | 카테고리 추가 (권한자) |
| PATCH | `/api/ride-asset-categories/[id]` | 카테고리 수정 (권한자) |
| DELETE | `/api/ride-asset-categories/[id]` | 카테고리 비활성화 (is_active=0) |
| GET | `/api/ride-asset-admins` | 권한자 목록 (admin) |
| POST | `/api/ride-asset-admins` | 권한자 추가 (admin) |
| DELETE | `/api/ride-asset-admins/[user_id]` | 권한자 제거 (admin) |
| GET | `/api/ride-assets/[id]/logs` | 자산 변경 이력 |

---

## 6. graceful fallback (Rule 23)

모든 API 라우트에 마이그레이션 미적용 대응:

```ts
try {
  const rows = await prisma.$queryRaw`SELECT ... FROM ride_assets ...`
  return NextResponse.json({ success: true, data: rows, meta: null })
} catch (e: any) {
  if (/Table .* doesn.+t exist/i.test(String(e))) {
    return NextResponse.json({
      success: true,
      data: [],
      meta: { _migration_pending: true, migration: '2026-05-14_ride_assets.sql' }
    })
  }
  return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
}
```

UI 측에서 `meta._migration_pending` 받으면 「⚠ 마이그레이션 미적용 — DB 관리자에게 문의」 배너 표시.

---

## 7. 사이드바 등록 (메인 세션 위탁 — Rule 21)

본 모듈은 공통 파일 (`lib/menu-registry.ts`, `app/components/PageTitle.tsx`) 변경 필요. 메인 세션(sweet-amazing-galileo)에 위탁.

### 7.1 `lib/menu-registry.ts` — 추가할 entry

```ts
// admin-ops 그룹 마지막 (현재 sortOrder 82 까지)
{ id: 'mod-ride-assets', name: '라이드 자산',
  displayName: '📦 라이드 자산', path: '/RideAssets',
  iconKey: 'Clipboard', group: 'admin-ops',
  sortOrder: 83, requirePermission: true },
```

### 7.2 `app/components/PageTitle.tsx` — 추가할 매핑

```ts
// PATH_TO_GROUP
'/RideAssets': 'admin-ops',
// PAGE_NAMES
'/RideAssets': '라이드 자산',
```

### 7.3 동급 페이지와 비교

| path | sortOrder | sidebarHidden | 본 모듈 비교 |
|------|-----------|---------------|--------------|
| /RideVehicleRegistry | 80 | (보임) | NavTabs sub-route 진입점 |
| /RideCustomerData | 81 | hidden | NavTabs sub-page |
| /RideSettlements | 82 | hidden | NavTabs sub-page |
| **/RideAssets** | **83** | **(보임)** | **단일 페이지 — sub-page 없음** |

---

## 8. 동형 패턴 인덱스 (Rule 14)

본 모듈과 일관성 유지해야 할 같은 부류 모듈:

| 패턴 영역 | 참고 모듈 | 본 모듈 적용 |
|----------|----------|--------------|
| 권한 체크 (`usePermission`) | RideVehicleRegistry, RideAccidents | `usePermission().hasPageAccess('/RideAssets')` |
| graceful fallback | RideVehicleRegistry `_migration_pending` | 동일 패턴 |
| NeuDataTable + 모든 컬럼 sortBy | 라이드 전 모듈 | Rule 18 의무 |
| DcStatStrip 상단 통계 | finance/settlement, RideVehicleRegistry | 5 카드 |
| `getStoredToken/User` | 라이드 전 모듈 | 동일 |
| 자체 user_id 참조 (FK 없음) | RideVehicleRegistry created_by | 동일 |

---

본 문서는 PR마다 갱신 (Rule 22).
