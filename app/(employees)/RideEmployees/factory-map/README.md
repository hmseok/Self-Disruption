# /RideEmployees/factory-map — 협력공장 지도 (격리 이식본)

> Employee of Ride Inc. 그룹 하위에 등록된 **카카오맵 기반 협력공장 운영 페이지**.
> 외부 작업물(FactoryMap 프로젝트)을 메인 ERP(Self-Disruption)에 격리 이식한 결과물입니다.

## 격리 원칙

- 본 폴더(`app/RideEmployees/factory-map/`) **외부의 메인 코드는 일절 수정하지 않습니다.**
- 모든 페이지·API·컴포넌트·훅·라이브러리·시드 데이터를 본 폴더 내부로 한정.
- 메인의 사이드바(`ClientLayout`), `PageTitle.tsx` 매핑, 글로벌 `/api/...` 라우트, DB 스키마는 변경 없음.

## 라우트

| 경로 | 설명 |
|---|---|
| `/RideEmployees/factory-map` | **카카오맵 운영 페이지** — 공장 마커 + 사고 현장 오버레이 + 우측 디테일 |
| `/RideEmployees/factory-map/mgmt` | 협력공장 목록 (확장형 테이블) |
| `/RideEmployees/factory-map/intake` | 사고 접수 → 추천 공장 + 카카오맵 길찾기 |
| `/RideEmployees/factory-map/groups` | 분류/태그 셋팅 (13축 종합 관리) |

## 격리 API 라우트

| 경로 | 설명 |
|---|---|
| `GET /RideEmployees/factory-map/api/factories` | 공장 목록 (시드 + 즐겨찾기 머지) |
| `GET /RideEmployees/factory-map/api/accidents` | 사고 목록 (시드) |
| `GET /RideEmployees/factory-map/api/codes` | 코드 마스터 (현재 비어있음 — FALLBACK 클라이언트 사용) |
| `GET /RideEmployees/factory-map/api/directions` | 카카오 모빌리티 길찾기 프록시 |

> 메인의 `/api/codes` 와 충돌하지 않도록 **모든 API는 자기 폴더 하위에 격리**되어 있습니다.

## 환경변수 (메인 `.env.local`에 추가)

```
NEXT_PUBLIC_KAKAO_MAP_KEY=<카카오 디벨로퍼스 JavaScript 키>
KAKAO_REST_API_KEY=<카카오 디벨로퍼스 REST API 키 — 길찾기용 (선택)>
```

> 카카오 디벨로퍼스 → 내 애플리케이션 → 앱 키
> JavaScript 키는 운영 도메인 화이트리스트 등록 필수 (`http://localhost:3000`)

## 디렉토리 구조

```
app/RideEmployees/factory-map/
├── page.tsx                    # 카카오맵 (메인)
├── FactoryMapMain.tsx          # 카카오맵 클라이언트 컴포넌트
├── mgmt/                       # 협력공장 목록
│   ├── page.tsx
│   └── FactoryMgmtMain.tsx
├── intake/                     # 사고 접수 추천
│   ├── page.tsx
│   └── IntakeMain.tsx
├── groups/                     # 분류 셋팅
│   ├── page.tsx
│   ├── GroupsAdminMain.tsx
│   └── defaults.ts             # 13축 분류 기본값
├── api/                        # 격리 API
│   ├── factories/route.ts
│   ├── accidents/route.ts
│   ├── codes/route.ts
│   └── directions/route.ts
├── _components/ui.tsx          # 자체 UI 컴포넌트
├── _hooks/useCodeMaster.ts     # 자체 코드 마스터 훅
├── _lib/                       # 자체 유틸
│   ├── format.ts
│   ├── id.ts
│   ├── kakao.ts
│   └── parseFavoriteName.ts
└── _data/                      # 시드 데이터
    ├── factories.json          # 카페24 호환 시드
    ├── factories-merged.json   # 카카오 즐겨찾기 머지본
    └── accidents.json
```

`_` 로 시작하는 폴더는 Next.js App Router에서 라우트 세그먼트로 인식되지 않아 안전하게 격리됩니다.

## 메인 컨벤션 매핑

| 항목 | 메인 컨벤션 | 본 격리본 |
|---|---|---|
| TypeScript paths | `@/*` → `./*` | 동일 (절대 경로 가능, 본 폴더에선 상대 경로 사용) |
| ID 컨벤션 | `docs/ID_CONVENTION.md` (cleanId) | `_lib/id.ts` 동일 인터페이스 |
| 코드 마스터 | `app/hooks/useCodeMaster.ts` (`/api/codes`) | `_hooks/useCodeMaster.ts` (`/RideEmployees/factory-map/api/codes`) |
| 디자인 토큰 | `@/app/utils/ui-tokens` (COLORS, GLASS, BTN, pillStyle) | 본 폴더는 Tailwind 클래스 + 자체 `_components/ui` 사용. 추후 메인 토큰으로 마이그레이션 가능. |
| API 응답 | `{ success, data, ... }` | 동일 |

## 추후 통합 단계 (선택)

본 격리본을 메인 컨벤션 깊이까지 통합하려면:

1. **DB 연결**: `_data/*.json` 시드 → 메인 Supabase/Prisma 모델로 이주.
   - `factories` 테이블 (BIGINT 운영 엔티티) — `docs/ID_CONVENTION.md` 기준
   - `accidents` 테이블 (UUID 업무 엔티티)
   - `api/factories/route.ts`, `api/accidents/route.ts` 만 교체
2. **인증 통합**: `useApp()` Context 적용 — 페이지 진입 시 `getAuthHeader()` 추가
3. **UI 토큰 통합**: `_components/ui.tsx` → `@/app/utils/ui-tokens` 사용 형태로 점진 변환
4. **사이드바 등록**: 메인 `ClientLayout` 또는 `PageTitle.tsx` 매핑에 4개 라우트 추가
   - 현재는 메인을 건드리지 않으므로 URL 직접 진입 또는 RideEmployees 메인에서 링크 연결

## 검증

```bash
cd ~/WebstormProjects/Self-Disruption
npm run typecheck   # tsc --noEmit
npm run lint
npm run dev
# http://localhost:3000/RideEmployees/factory-map 접속
```
