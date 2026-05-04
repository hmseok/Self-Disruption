# 코워크 하네스 표준 — Ride OP

이 프로젝트가 따르는 통일 컨벤션. **새 페이지/모듈을 추가할 때 이 문서를 먼저 읽고 그대로 복사해서 시작**.

---

## 🎯 최상위 원칙 — 이식 대상 (반드시 매번 체크)

> **이 코드는 최종적으로 [hmseok.com (FMI ERP)](https://hmseok.com) 에 이식 운영됩니다.**
> Ride OP 는 개발/검증 워크스페이스이고, 완성된 페이지·컴포넌트는 hmseok.com 의 본 ERP 에 그대로 옮겨져야 합니다.

**모든 작업 시 매번 다음을 확인합니다:**

- [ ] 사이드바 구조가 hmseok.com 과 1:1 일치 (자산/운영/재무/관리/Employee of Ride Inc./설정 6그룹)
- [ ] 페이지 라우트가 hmseok.com 과 충돌하지 않음
- [ ] 디자인 토큰(폰트 IBM Plex Sans KR, 배경 `#f9fafb`, 활성 메뉴 파란 그라데이션 등)이 hmseok.com 과 동일
- [ ] 데이터 키가 카페24 ERP 호환(`factcode/factname/factaddr` 등 — camelCase 변환 X)
- [ ] API 호출은 절대 경로(`/api/...`) 만 사용 — hmseok.com 으로 옮길 때 prefix 만 바꾸면 됨
- [ ] 외부 의존성(SDK, 라이브러리)은 layout 의존이 아닌 lib 모듈에서 동적 주입 (이식 시 layout 수정 최소화)
- [ ] 새 컴포넌트는 `app/components/ui.tsx` 한 곳에 모아 하네스 import 표면 일정하게

이식 절차 요약은 §14 참조.

---

---

## 1. 폴더/파일 컨벤션

```
app/
  layout.tsx              # 루트 레이아웃 + IBM Plex Sans KR + Sidebar + main wrap
  globals.css             # Tailwind v4 + CSS 변수 토큰
  page.tsx                # 랜딩 (대시보드)
  components/
    ui.tsx                # Cell, Section, KpiCard/KpiRow, PageHeader,
                          # Toolbar, FilterPill, StatusBadge, Spinner,
                          # ScreenWrap, Field, TextInput, Select, Button
    Sidebar.tsx           # FMI ERP 1:1 좌측 사이드바 (240px 고정)
  hooks/
    useCodeMaster.ts      # 코드 디코드 (FACTTYPE, OTPTSTAT 등) + FALLBACK
  lib/
    format.ts             # fD/fT/fDT/fNum/fPhone — 표시 포맷
    id.ts                 # cleanId, isUUID
    kakao.ts              # ensureKakao, geocode (SDK 동적 주입)
    parseFavoriteName.ts  # 즐겨찾기 이름 메타 파서
  api/
    codes/                # 코드 마스터
    factories/            # 공장 (시드 + 즐겨찾기 통합)
    accidents/            # 사고 데이터
  {section}/{feature}/
    page.tsx              # 'export const dynamic = "force-dynamic"' + Main import만
    XxxMain.tsx           # 'use client' 메인 컴포넌트
data/
  factories.json                  # 시드 (카페24 호환)
  factories-merged.json           # 즐겨찾기 통합 (build 산출물)
  kakao-favorites/group-*.json    # 즐겨찾기 그룹 원본
  accidents.json                  # 사고 시드
docs/
  HARNESS.md                       # 이 문서
  ID_CONVENTION.md                 # ID/FK 규약
scripts/
  build-factories-from-favorites.mjs  # 즐겨찾기 → 통합 데이터
  geocode-factories.mjs               # 주소 → 좌표 일괄 변환
```

---

## 2. 페이지 골격 (필수 패턴)

```tsx
// app/{section}/{feature}/page.tsx
export const dynamic = 'force-dynamic'
import FooMain from './FooMain'
export default function FooPage() { return <FooMain /> }
```

```tsx
// app/{section}/{feature}/FooMain.tsx
'use client'

import { useState } from 'react'
import { useCodeMaster } from '../../hooks/useCodeMaster'
import {
  ScreenWrap, PageHeader, KpiRow, KpiCard, Toolbar, FilterPill,
  Cell, Section, StatusBadge, Spinner,
  Field, TextInput, Select, Button,
} from '../../components/ui'
import { fD, fT, fDT, fPhone } from '../../lib/format'

export default function FooMain() {
  const { decode } = useCodeMaster()
  // ...
  return (
    <ScreenWrap>
      <PageHeader breadcrumb={['Employee of Ride Inc.', '메뉴명']} title="메뉴명" emoji="🔧" />
      <KpiRow>{/* KpiCard 들 */}</KpiRow>
      <Toolbar>{/* 검색/필터/조회 */}</Toolbar>
      {/* 본문 */}
    </ScreenWrap>
  )
}
```

---

## 3. UI 토큰 (FMI ERP 정렬판)

### 색상

| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg` | `#f9fafb` | body 배경 (slate-50) |
| 본문 카드 | `bg-white rounded-2xl ring-1 ring-slate-200` | 모든 페이지 본문 컨테이너 |
| 1차 액션 | `bg-blue-600 hover:bg-blue-700 text-white` | 조회/저장 등 |
| 위험 | `bg-red-600 hover:bg-red-700 text-white` | 삭제/취소 |
| 보조 | `bg-slate-50 ring-1 ring-slate-200 hover:bg-slate-100` | 부수 버튼 |
| 활성 필터 | `bg-slate-900 text-white` | 알약 활성 |
| 활성 메뉴 | `bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm` | 사이드바 활성 |
| 강조 카드 링 | `ring-emerald-200 / blue-200 / violet-200 / amber-200 / red-200` | KpiCard tone 별 |
| 라벨 | `text-[10px] uppercase tracking-wide text-slate-400` | 필드 라벨 |
| 본문 | `text-[13px] text-slate-800` | 일반 텍스트 |

### 폰트

```
font-family: 'IBM Plex Sans KR', -apple-system, BlinkMacSystemFont,
             'Segoe UI', 'Apple SD Gothic Neo', 'Pretendard', sans-serif
```

폰트 크기: 10/11/12/13/15/22/28px 단계만 사용. 한 화면 정보 밀도 우선.

### 레이아웃

- `ScreenWrap` 안에 모든 본문 — 흰 카드 컨테이너 + 좌상단 macOS 트래픽 라이트 점
- 좌측 사이드바 240px (`--sidebar-w`), main 영역은 `lg:ml-[var(--sidebar-w)]`
- 페이지 안 패딩: `px-6` (카드 안쪽), `pb-6` (하단)

---

## 4. 데이터 키 컨벤션 (카페24 호환)

레거시 ERP 컬럼명 그대로 사용. 카멜케이스 변환 X.

| 키 | 의미 |
|---|---|
| `factcode` | 공장 코드 (PK 대용) |
| `factname` | 공장명 |
| `facttype` | 유형 (FACTTYPE 코드) |
| `facthpno` / `facttelo` / `factfaxo` | 휴대전화/유선/팩스 |
| `factaddr` | 주소 |
| `factbknm` / `factbkno` / `factbkus` | 은행/계좌/예금주 |
| `lat` / `lng` | 좌표 |
| `accidentNo` / `accidentDate` / `accidentTime` | 사고 키 (camelCase 예외) |
| `status` | OTPTSTAT 코드 |

날짜는 `YYYYMMDD`, 시간은 `HHmm` 문자열로 저장. 표시는 `fD/fT` 사용.

---

## 5. 즐겨찾기 메타 스키마 (Ride OP 신규)

카카오맵 즐겨찾기 그룹에서 추출한 공장은 카페24 키에 **추가 필드**가 붙음:

```ts
type Insurance = { mg: boolean | null; turnkey: boolean | null; meritz: boolean | null; autohands: boolean | null }

interface FavoriteFactory {
  // 카페24 호환 필드
  factcode: string         // K + placeId 마지막 7자 ('K1108216611' 식)
  factname: string         // 정제된 이름 (cleanName)
  factaddr: string
  facttype: 'A' | 'Z'      // A=일반 / Z=종료 (가상 코드)
  lat?: number; lng?: number
  // ── 즐겨찾기 메타 (신규) ──
  placeId: string          // 카카오 placeId
  rawName: string          // 메타 포함 원본 이름
  insurance: Insurance     // 보험사별 입고 가능 여부
  tags: string[]           // 'tesla-only', 'foreign-only', 'samsung-card', 'hyundai-bluehands', 'kia-autoq', 'unassignable', ...
  groups: string[]         // 'mg-only', 'main-incoming', 'autohands', 'meritz-only', 'backup-list', 'terminated'
  terminated: boolean
}
```

이름 메타 파서: `app/lib/parseFavoriteName.ts` — `(엠실비,턴키O/메리츠,오토핸즈X)` 같은 패턴을 자동 분류.

---

## 6. API 응답 규격

```ts
// 성공
{ success: true, data: T | T[], pagination?: { page, limit, total, totalPages } }
// 실패
{ success: false, error: string }
```

쿼리 파라미터 컨벤션 (factories):

| 파라미터 | 예 | 설명 |
|---|---|---|
| `search` | `퍼펙트` | factname/code/phone/addr/aliases 부분 일치 |
| `factType` | `H` | FACTTYPE 단일 코드 |
| `insurance` | `mg,turnkey` | 모두 true 인 공장만 (AND) |
| `groups` | `mg-only,autohands` | 하나 이상 소속 공장 (OR) |
| `tag` | `tesla-only` | 태그 보유 (OR) |
| `onlyGeocoded` | `1` | 좌표 있는 항목만 |
| `page` / `limit` | `1` / `500` | 페이지네이션 |

---

## 7. 코드 마스터

`useCodeMaster()` 훅의 FALLBACK 이 클라이언트 1차 진실. `/api/codes` 가 DB 결과로 머지 (실패 시 FALLBACK 그대로).

```tsx
const { decode } = useCodeMaster()
decode('FACTTYPE', 'A')  // → '공장(일반)'
```

코드 그룹: `OTPTSTAT`, `OTPTACBN`, `FACTTYPE`, `FACTGUBN`, `BHNAME`, `OTPTACRN`, `CARSSTAT`. 새 그룹 추가는 `useCodeMaster.ts` 의 FALLBACK + 서버 양쪽.

---

## 8. ID 컨벤션 (`docs/ID_CONVENTION.md` 참조)

- 핵심/업무 엔티티: `UUID` (`gen_random_uuid()`)
- 운영 엔티티(차량/고객/공장): `BIGINT`
- 참조 데이터: `BIGSERIAL`
- 즐겨찾기 공장: `factcode = 'K' + placeId.slice(-7)` (카페24와 안 겹치도록)
- 프론트는 `cleanId()`로 빈값만 null 처리, 타입 변환은 DB가.

---

## 9. 카카오맵 사용법

### SDK 로드

```tsx
import { ensureKakao, geocode } from '@/app/lib/kakao'

useEffect(() => {
  ensureKakao().then(k => {
    const map = new k.maps.Map(ref.current!, { center: new k.maps.LatLng(37.5, 127), level: 7 })
  })
}, [])
```

- SDK 는 `lib/kakao.ts` 가 페이지 진입 시 동적 주입 (layout 의존 X)
- `autoload=false` + `libraries=services,clusterer` 로 로드
- 모듈 캐시(`_ready`)로 한 번만 로드되고 재사용

### 마커 색상 우선순위 (`favoriteColor()`)

```
terminated → slate-400 (회색)
tesla-only → red-600
foreign-only → violet-600
samsung-card → sky-500
4종 모두 입고 OK → emerald-500
autohands OK → green-600
mg OK → blue-600
turnkey OK → purple-500
meritz OK → orange-500
hyundai-bluehands → cyan-500
kia-autoq → amber-600
default → slate-500
```

### 마커 클러스터러 (필수)

`MarkerClusterer` 사용. 좌표 정밀도 4자리(약 10m) 기준으로 같은 위치에 여러 공장 있으면 **황금각 137.5° 회전 + 13~25m 분산**으로 펼친다.

```ts
const clusterer = new k.maps.MarkerClusterer({
  map, averageCenter: true, minLevel: 4, gridSize: 60,
  styles: [/* 36/46/56px, blue/amber/red */],
  calculator: [10, 30],
})
```

### 길찾기 deeplink

```ts
const url = `https://map.kakao.com/link/from/${sName},${sLat},${sLng}/to/${eName},${eLat},${eLng}`
```

새 탭(`target="_blank" rel="noopener"`)으로 연다.

---

## 10. 환경변수

```
NEXT_PUBLIC_KAKAO_MAP_KEY=...   # JS 키 (브라우저 노출 OK, 도메인 화이트리스트 필수)
KAKAO_REST_API_KEY=...          # REST 키 (서버 전용 — geocoding 등)
```

도메인 등록: `http://localhost:3000` + 운영 도메인 + 필요시 LAN IP.
카카오맵 활성화: 카카오 콘솔 → 제품 설정 → 카카오맵 ON.

---

## 11. 통일 컴포넌트 카탈로그

| 컴포넌트 | 용도 | 시그니처 |
|---|---|---|
| `ScreenWrap` | 본문 카드 + 트래픽라이트 점 | `children` |
| `PageHeader` | breadcrumb + 이모지 타이틀 + 우측 액션 | `breadcrumb[], title, emoji?, right?` |
| `KpiRow` / `KpiCard` | 상단 KPI 라인 + 컬러 링 카드 | `tone: emerald|blue|violet|amber|red|slate` |
| `Toolbar` | 검색/필터 컨테이너 (slate-50 카드) | `children` |
| `FilterPill` | 알약 필터 (활성=네이비) | `active, count?, onClick, children` |
| `Cell` | 라벨 + 값 (디테일 그리드) | `label, span?, children` |
| `Section` | 좌측 컬러바 + 접힘 헤더 | `title, color?, defaultOpen?` |
| `StatusBadge` | 점 + 파스텔 알약 | `tone: ok|info|cyan|warn|danger|muted` |
| `Spinner` | 로딩 상태 | `label?` |
| `Field` | 라벨+컨트롤 wrapper | `label, hint?, children` |
| `TextInput` | 통일된 input | `value, onChange, placeholder?, ...` |
| `Select` | 통일된 select | `value, onChange, options[]` |
| `Button` | 1차/위험/보조/ghost | `variant?, size?, ...` |

---

## 12. 새 페이지 체크리스트

작성 전:

- [ ] **이식 대상 hmseok.com 의 어느 그룹/경로에 들어갈지** 먼저 결정
- [ ] 사이드바 메뉴 그룹 결정 (자산/운영/재무/관리/Employee of Ride Inc./설정)
- [ ] breadcrumb 경로 결정 (`['그룹명', '메뉴명']`)
- [ ] 메뉴 이모지 결정

코드 작성:

- [ ] `page.tsx` + `XxxMain.tsx` 분리
- [ ] `'use client'` + `dynamic = 'force-dynamic'`
- [ ] `ScreenWrap` + `PageHeader` 사용
- [ ] `useCodeMaster()` 활용 (코드값을 그대로 노출 X)
- [ ] 빈값/로딩/에러 상태 모두 처리
- [ ] `fD/fT/fDT/fPhone` 등 포맷 헬퍼 사용
- [ ] 클래스 직접 색 지정 X — 토큰/컴포넌트 사용
- [ ] form 은 `Field/TextInput/Select/Button` 사용
- [ ] API 호출은 `{ success, data, pagination }` 응답 가정 + 절대 경로(`/api/...`)
- [ ] 외부 SDK 는 lib 모듈에서 lazy 주입 (layout 수정 최소화)

마무리:

- [ ] `Sidebar.tsx` NAV 배열에 추가
- [ ] `npx tsc --noEmit` 통과 확인
- [ ] 작은 캡처 1장 (hmseok.com 톤 일치 확인)
- [ ] **§14 이식 절차 따라 hmseok.com 에 옮기는 시뮬레이션 (정신적으로라도)**

---

## 13. 마커 좌표 충돌 처리 정책

같은 좌표(소수 4자리 기준 ~10m 정밀도)에 N개 공장이 있을 때:

- 첫 번째 마커: 원래 좌표
- N번째 마커: `lat += r·sin(θ)`, `lng += r·cos(θ)` — `θ = N · 137.5° (황금각)`, `r = 0.00012 + 0.00006·N`
- 결과: 자연스러운 꽃잎/나선 분산. 줌 인하면 모두 클릭 가능, 줌 아웃하면 클러스터러가 묶음.

---

## 14. hmseok.com (FMI ERP) 이식 절차

이 워크스페이스(Ride OP)에서 완성한 모듈을 본 ERP 로 옮기는 표준 절차.

### A. 파일 복사 (그대로)

다음을 hmseok.com 코드베이스에 동일 경로로 복사:

```
app/components/ui.tsx                 # FilterPill/Button/Field 등 통일 컴포넌트
app/hooks/useCodeMaster.ts            # 코드 디코드 훅
app/lib/format.ts                     # fD/fT/fPhone
app/lib/id.ts                         # cleanId
app/lib/kakao.ts                      # ensureKakao + geocode (SDK 동적 주입)
app/lib/parseFavoriteName.ts          # 즐겨찾기 메타 파서
app/admin/groups/                     # 그룹 셋팅 페이지
app/claims/intake/                    # 사고 접수 추천 페이지
app/fleet/factory-map/                # 카카오 지도
app/fleet/factory-mgmt/               # 공장 목록
data/factories-merged.json            # 즐겨찾기 통합 결과
data/kakao-favorites/group-*.json     # 원본 백업
scripts/build-factories-from-favorites.mjs
scripts/geocode-factories.mjs
```

### B. 사이드바 NAV 추가 (Employee of Ride Inc. 그룹)

본 ERP 의 사이드바 NAV 정의에서 `Employee of Ride Inc.` 그룹의 items 배열 끝에:

```ts
{ href: '/fleet/factory-map', emoji: '🗺️', label: '협력공장 지도' },
{ href: '/fleet/factory-mgmt', emoji: '🔧', label: '협력공장 목록' },
{ href: '/claims/intake', emoji: '🚨', label: '사고 접수 추천' },
{ href: '/admin/groups', emoji: '🧩', label: '그룹 셋팅' },
```

### C. API 경로 정합성 확인

- `factories`/`accidents`/`codes` 가 hmseok.com 에서 같은 응답 규격을 쓰면 그대로 동작
- 만약 hmseok.com 이 `/api/cafe24/factories` 패턴을 쓴다면, 페이지 안의 `fetch('/api/factories')` 두세 곳만 치환
- `/api/factories` 라우트(`app/api/factories/route.ts`)는 hmseok.com 의 실제 데이터 소스(Supabase / cafe24 API / DB)에 맞게 본문만 교체. 응답 규격(`{ success, data, pagination }`)은 유지

### D. 환경변수 (`.env.local`)

```
NEXT_PUBLIC_KAKAO_MAP_KEY=...
KAKAO_REST_API_KEY=...           # geocode 빌드 스크립트 시 필요
```

카카오 콘솔 도메인 화이트리스트에 운영 도메인(`https://hmseok.com`) 추가.

### E. 데이터 통합 (선택)

- **현재**: Ride OP 의 `factories-merged.json` (즐겨찾기 113개) 만 사용
- **하이브리드(권장)**: hmseok.com 카페24 공장 + 즐겨찾기 113개를 cleanName + 주소로 매칭. 매칭되면 카페24 정보 우선, 즐겨찾기는 분류 태그(insurance/groups/tags) 보강용
- 매칭 스크립트 자리: `scripts/match-cafe24-favorites.mjs` (다음 단계)

### F. 검증

- `npx tsc --noEmit` 통과
- `/fleet/factory-map`, `/claims/intake`, `/admin/groups` 모두 사이드바 활성 표시 + 본문 정상 렌더
- hmseok.com 의 기존 페이지(예: `/finance/bank-card`)와 디자인 톤 비교 — 폰트/색상/카드/필터 일치 여부

---

## 15. 다중 캐피탈 표출 정책

한 공장은 여러 캐피탈(MG / 턴키 / 메리츠 / 오토핸즈)을 동시에 받을 수 있음. 단:

1. **데이터**: `insurance` 객체에 4축 boolean. 한 공장이 4축 모두 true 가능.
2. **dedup**: 같은 공장이 카카오 즐겨찾기에 여러 placeId 로 등록돼 있으면 (cleanName + 정규화 주소) 기준 2차 dedup 으로 1개로 통합. 보험/태그/그룹 정보는 union.
3. **표출**:
   - 지도 마커: 1개 (좌표 충돌 분산은 §13 황금각)
   - 리스트/디테일: 1행
   - InfoWindow / 카드: 받을 수 있는 모든 캐피탈을 작은 뱃지로 동시 표시
4. **필터**:
   - **insurance 필터 = OR** (선택한 캐피탈 중 하나라도 가능한 공장 표시 — 운영 관점에 자연스러움)
   - **groups 필터 = OR**
   - **tag 필터 = OR**
   - **search/factType = AND**
