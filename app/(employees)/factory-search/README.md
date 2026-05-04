# /factory-search — 협력공장 검색 (격리 이식본)

> Employee of Ride Inc. > **CX팀** 그룹 하위 페이지.
> 외부 작업물(FactoryMap / Ride OP)을 메인 ERP(Self-Disruption)에 격리 이식한 결과물.

## 격리 원칙

- 본 폴더(`app/(employees)/factory-search/`) 외부의 메인 코드는 일절 수정하지 않습니다 — 단 `lib/menu-registry.ts` 한 줄(entry 추가)만 예외.
- 모든 페이지·API·컴포넌트·훅·라이브러리·시드 데이터를 본 폴더 내부로 한정.
- 메인의 ClientLayout / 글로벌 `/api/...` 라우트 / DB 스키마는 변경 없음.

## 라우트

| 경로 | 설명 |
|---|---|
| `/factory-search` | **카카오맵 메인 — 협력공장 + 사고 현장 마커 + 우측 디테일** |
| `/factory-search/mgmt` | 협력공장 목록 (확장형 테이블) |
| `/factory-search/intake` | 사고 접수 → 추천 공장 + 카카오맵 길찾기 |
| `/factory-search/groups` | 분류/태그 셋팅 (13축 종합 관리) |

> route group `(employees)` 는 URL 에 노출되지 않습니다. 메인 페이지만 사이드바 entry 1개로 노출 (서브 3개는 메인 페이지에서 진입).

## 격리 API

| 경로 | 설명 |
|---|---|
| `GET /factory-search/api/factories` | 공장 목록 (시드 + 즐겨찾기 머지본) |
| `GET /factory-search/api/accidents` | 사고 목록 (시드) |
| `GET /factory-search/api/codes` | 코드 마스터 (현재 비어있음 — FALLBACK 클라이언트 사용) |
| `GET /factory-search/api/directions` | 카카오 모빌리티 길찾기 프록시 |

## 환경변수 (메인 `.env.local`)

```
NEXT_PUBLIC_KAKAO_MAP_KEY=<카카오 디벨로퍼스 JavaScript 키>
KAKAO_REST_API_KEY=<카카오 디벨로퍼스 REST API 키 — 길찾기용 (선택)>
```

> 카카오 디벨로퍼스 콘솔 → JavaScript SDK 도메인에 운영 도메인 등록 필수 (`http://localhost:3000`).

## 디렉토리 구조

```
app/(employees)/factory-search/
├── page.tsx                     # 카카오맵 (메인)
├── FactoryMapMain.tsx
├── mgmt/                        # 협력공장 목록
│   ├── page.tsx
│   └── FactoryMgmtMain.tsx
├── intake/                      # 사고 접수 추천
│   ├── page.tsx
│   └── IntakeMain.tsx
├── groups/                      # 분류 셋팅
│   ├── page.tsx
│   ├── GroupsAdminMain.tsx
│   └── defaults.ts              # 13축 분류 기본값
├── api/                         # 격리 API
│   ├── factories/route.ts
│   ├── accidents/route.ts
│   ├── codes/route.ts
│   └── directions/route.ts
├── _components/ui.tsx           # 자체 UI 컴포넌트
├── _hooks/useCodeMaster.ts      # 자체 코드 마스터 훅
├── _lib/                        # 자체 유틸
│   ├── format.ts / id.ts / kakao.ts / parseFavoriteName.ts
├── _data/                       # 시드 데이터
│   ├── factories.json / factories-merged.json / accidents.json
│   └── kakao-favorites/         # 즐겨찾기 그룹별 원본
├── _app/                        # FactoryMap 원본 app/ (라우트 제외 — 참고용)
├── _docs/                       # 원본 docs (HARNESS / ID_CONVENTION 참고)
├── _scripts/                    # geocode/build-from-favorites 스크립트
├── _meta-archive/               # 원본 package.json / next.config / node_modules 등 (.gitignore 제외)
├── .gitignore                   # _meta-archive / .DS_Store / *.tsbuildinfo
└── README.md
```

`_` 로 시작하는 폴더 (`_app/_components/_data/_docs/_hooks/_lib/_meta-archive/_scripts`) 는 Next.js App Router 가 라우트 세그먼트로 인식하지 않아 라우트와 무관합니다.

## 메인 컨벤션 매핑

| 항목 | 메인 컨벤션 | 본 격리본 |
|---|---|---|
| TypeScript paths | `@/*` → `./*` | 동일. 본 폴더 안은 상대 경로 사용 |
| 코드 마스터 | `app/hooks/useCodeMaster.ts` | `_hooks/useCodeMaster.ts` (격리 `/factory-search/api/codes` 호출) |
| 디자인 토큰 | `@/app/utils/ui-tokens` | 본 폴더는 Tailwind v4 + 자체 `_components/ui` 사용. 추후 메인 토큰 마이그레이션 가능. |
| 메뉴 등록 | `lib/menu-registry.ts` MENUS 배열 | `mod-factory-search` entry 추가 (group: cx-team, sortOrder: 62) |
| API 응답 | `{ success, data, ... }` | 동일 |

## 추후 통합 단계 (선택)

1. **DB 연결**: `_data/*.json` 시드 → 메인 Supabase/Prisma 모델로 이주.
2. **인증 통합**: `useApp()` Context 적용 — 페이지 진입 시 `getAuthHeader()` 추가.
3. **UI 토큰 통합**: `_components/ui.tsx` → `@/app/utils/ui-tokens` 사용 형태.
4. **_meta-archive/_app 제거**: sub-project 잔재 — 동작 검증 후 별도 PR 로 정리.

## 검증 (격리 영역만)

```bash
cd ~/WebstormProjects/Self-Disruption

# 격리 영역 typecheck (메인 baseline 154 이내 유지 확인)
npx tsc --noEmit | grep "(employees)/factory-search"

# 격리 영역 lint
npx eslint "app/(employees)/factory-search/page.tsx" \
           "app/(employees)/factory-search/FactoryMapMain.tsx" \
           "app/(employees)/factory-search/mgmt" \
           "app/(employees)/factory-search/intake" \
           "app/(employees)/factory-search/groups" \
           "app/(employees)/factory-search/api" \
           "app/(employees)/factory-search/_components" \
           "app/(employees)/factory-search/_hooks" \
           "app/(employees)/factory-search/_lib" \
           --ext .ts,.tsx
```
