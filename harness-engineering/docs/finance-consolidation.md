# Finance 모듈 통합 설계서 (Consolidation v1)

> **작성일**: 2026-04-21
> **작성자**: Harness v3.0 / Planner
> **범위**: `/finance`, `/finance/upload`, `/finance/uploads` 3개 페이지의 중복/산재 구조 정리
> **제약**: **디자인 시스템을 구조 통합과 동시에 적용** (사용자 명시 요구)
> **승인 GATE**: Gate 3 — 본 설계서 사용자 확인 후 Generator 진행

---

## 0. 배경 & 문제 정의

### 현재 구조의 문제점

| # | 페이지 | 라인 수 | 역할 | 문제 |
|---|--------|--------|------|------|
| P1 | `/finance/page.tsx` | 471 | 입출금 대시보드 + 수기 입력 폼 | 오래된 DcStatStrip + AppContext 혼재, 수기 입력 폼이 페이지 본문을 점유 |
| P2 | `/finance/upload/page.tsx` | 7,567 | 거래 분류 매칭 | 단일 파일 과비대, localStorage 4종 산재(categoryMode/showAdvancedCategory/sourceFilter/groupBy) |
| P3 | `/finance/uploads/page.tsx` | 442 | 업로드 이력 | 별도 라우트로 분리되어 분류 화면과 단절 |
| P4 | `/finance/transactions/page.tsx` | 86 | 탭 허브 (스켈레톤) | 이미 존재하나 `dynamic()` import 래퍼일 뿐 — 상태 공유/깊은 링크 없음 |

### 산재된 상태 (현재)

```
[localStorage 키 — upload/page.tsx]
  finance_categoryMode        'display' | 'accounting'
  finance_showAdvancedCategory 'true' | 'false'
  finance_sourceFilter        'all' | 'bank' | 'card' | 'manual' | 'unclassified'
  finance_groupBy             'category' | 'source' | ...

[AppContext — /finance/page.tsx]
  company, role

[URL 파라미터 — transactions/page.tsx]
  ?tab=dashboard|classify|uploads|cards|codef  (현재 단방향)
```

상태가 3계층(localStorage + AppContext + URL)에 분산되어 있어, 새 탭에서 열거나 링크 공유 시 재현이 불가능.

### 사용자 결정 (Decisions 6–9, 이미 승인)

- **#6**: `/finance/transactions` 탭 허브를 주 랜딩으로 승격
- **#7**: `/finance/uploads`를 허브 내 "업로드이력" 탭으로 흡수 (301 리다이렉트)
- **#8**: `/finance` 레거시 페이지의 수기 입력 폼을 **글로벌 "빠른 입력" 모달**로 축소 — 대시보드는 허브 탭으로
- **#9**: FinanceContext + URL 쿼리 **양방향 동기화**

### 사용자 강조사항

> **"디자인 무조건 같이 잡고 가야합니다"**
> 구조 통합 1차 + 디자인 시스템 2차로 **순차 분리 금지**. 본 설계서는 두 트랙을 **한 구현 단계 안에서 병렬 진행**한다.

---

## 1. 목표 상태 (To-Be)

```
/finance                       → /finance/transactions?tab=dashboard (301)
/finance/upload                → /finance/transactions?tab=classify  (301)
/finance/uploads               → /finance/transactions?tab=uploads   (301)
/finance/transactions          → ★ 주 랜딩 (탭 허브)
  ├── ?tab=dashboard           입출금 대시보드 (구 /finance)
  ├── ?tab=classify            거래 분류 매칭 (구 /finance/upload)
  ├── ?tab=uploads             업로드 이력     (구 /finance/uploads)
  ├── ?tab=cards               법인카드
  └── ?tab=codef               Codef 자동연동

전역 네비:  [⚡ 빠른 입력] 버튼 → QuickTxModal 열림 (구 /finance의 수기 입력 폼)
```

### 탭별 URL 쿼리 계약

| 탭 | URL 예시 | 내부 쿼리 키 |
|----|---------|--------------|
| dashboard | `?tab=dashboard&month=2026-04` | `month`, `search` |
| classify | `?tab=classify&filter=unclassified&group=category&batch=abc` | `filter`, `group`, `batch`, `category`, `q` |
| uploads | `?tab=uploads&rolled=1&batch=abc` | `rolled`, `batch` |
| cards | `?tab=cards&year=2026&month=04` | `year`, `month` |
| codef | `?tab=codef&account=xxx` | `account` |

모든 쿼리는 **공유 링크 복붙 시 재현 가능**. 상태 변경 시 `router.replace()`로 URL 반영.

---

## 2. 파일 매핑 (From → To)

| 구 경로 | 신 위치 | 처리 방식 |
|---------|---------|----------|
| `app/finance/page.tsx` | `app/finance/transactions/_tabs/DashboardTab.tsx` | 본문 추출 → 탭 컴포넌트 |
| ↑ 수기 입력 폼 부분 | `app/components/QuickTxModal.tsx` | 모달 컴포넌트로 분리 |
| `app/finance/upload/page.tsx` | `app/finance/transactions/_tabs/ClassifyTab.tsx` | 본문 추출 (7,567 → 목표 7,100이하, Context 치환) |
| `app/finance/uploads/page.tsx` | `app/finance/transactions/_tabs/UploadsTab.tsx` | 본문 추출 |
| `app/finance/cards/page.tsx` | `app/finance/transactions/_tabs/CardsTab.tsx` | 본문 추출 |
| `app/finance/codef/page.tsx` | `app/finance/transactions/_tabs/CodefTab.tsx` | 본문 추출 |
| `app/finance/transactions/page.tsx` | 동일 | 내부 로직 교체 (dynamic import → 직접 import + Context Provider 감쌈) |
| (신규) | `app/finance/transactions/_context/FinanceContext.tsx` | 상태 집중 관리 |
| (신규) | `app/finance/transactions/_context/useFinanceUrlSync.ts` | URL ↔ Context 양방향 동기화 훅 |
| (신규) | `app/components/QuickTxModal.tsx` | 글로벌 빠른 입력 모달 |

### 리다이렉트 (301)

`next.config.js` 또는 라우트 파일 최상단 `redirect()` 호출:

```js
// next.config.js 추가
async redirects() {
  return [
    { source: '/finance',          destination: '/finance/transactions?tab=dashboard', permanent: true },
    { source: '/finance/upload',   destination: '/finance/transactions?tab=classify',  permanent: true },
    { source: '/finance/uploads',  destination: '/finance/transactions?tab=uploads',   permanent: true },
  ]
}
```

레거시 북마크/공유 URL 호환. 리다이렉트 대신 페이지 본문을 비운 얇은 셸로 남길지는 Gate 3 승인 시 결정.

---

## 3. FinanceContext 설계

### 상태 shape

```typescript
// app/finance/transactions/_context/FinanceContext.tsx

type FinanceState = {
  // 공통
  tab: 'dashboard' | 'classify' | 'uploads' | 'cards' | 'codef'
  month: string          // 'YYYY-MM' — dashboard, cards에서 공유
  search: string         // 전역 검색어

  // classify 전용
  sourceFilter: 'all' | 'bank' | 'card' | 'manual' | 'unclassified'
  groupBy: 'category' | 'source' | 'date' | 'amount'
  categoryMode: 'display' | 'accounting'       // 기본 display
  showAdvancedCategory: boolean                // 회계 고급 토글 ON 여부
  batchId: string | null                       // 선택된 배치 필터

  // uploads 전용
  includeRolledBack: boolean

  // cards 전용
  year: number
  cardsMonth: string     // 'MM'
}

type FinanceAction =
  | { type: 'SET_TAB'; tab: FinanceState['tab'] }
  | { type: 'SET_FILTER'; filter: FinanceState['sourceFilter'] }
  | { type: 'SET_GROUP'; groupBy: FinanceState['groupBy'] }
  | { type: 'TOGGLE_ADVANCED_CATEGORY' }
  | { type: 'SET_CATEGORY_MODE'; mode: FinanceState['categoryMode'] }
  | { type: 'SET_BATCH'; batchId: string | null }
  | { type: 'SET_MONTH'; month: string }
  | { type: 'SET_SEARCH'; q: string }
  | { type: 'SET_ROLLED_BACK'; v: boolean }
  // ...
```

### 영속화 정책 (어디에 뭘 저장하는가)

| 키 | URL? | localStorage? | 이유 |
|----|:---:|:-------------:|------|
| tab | ✅ | — | 공유 필수 |
| month | ✅ | — | 공유 시 재현 필수 |
| search | ✅ | — | 공유 시 재현 필수 |
| sourceFilter | ✅ | — | 공유 시 재현 |
| groupBy | — | ✅ | 사용자 개인 취향 |
| categoryMode | — | ✅ | 사용자 개인 취향 |
| showAdvancedCategory | — | ✅ | 사용자 개인 취향 |
| batchId | ✅ | — | 공유 필수 |
| includeRolledBack | ✅ | — | 드물지만 공유 가능 |
| year, cardsMonth | ✅ | — | 공유 필수 |

**규칙**:
- "공유 가능한 **조회 상태**" → URL
- "사용자 개인 **표시 설정**" → localStorage
- 양쪽 동기화는 `useFinanceUrlSync` 훅이 담당 (양방향, infinite loop 방지)

### localStorage 마이그레이션 (1회성)

기존 키 → Context 초기화 시 읽고 즉시 삭제:

```typescript
// FinanceContext 초기 로드
const migrate = () => {
  const oldKeys = [
    'finance_categoryMode',
    'finance_showAdvancedCategory',
    'finance_sourceFilter',
    'finance_groupBy',
  ]
  const migrated: Partial<FinanceState> = {}
  for (const k of oldKeys) {
    const v = localStorage.getItem(k)
    if (v !== null) {
      // 신 키로 저장
      localStorage.setItem(k.replace('finance_', 'fmi_finance_'), v)
      localStorage.removeItem(k)
      // state에 반영
      ...
    }
  }
  return migrated
}
```

신 키 네임스페이스 `fmi_finance_*` 로 통일.

---

## 4. 구현 단계 (Phases)

### Phase G — Skeleton & Context (1일)

1. `FinanceContext.tsx` 작성 + `useFinanceUrlSync.ts` 작성
2. `_tabs/` 폴더 생성 + 빈 래퍼 컴포넌트 5개 (기존 페이지 함수 그대로 `import default as Component` 재수출)
3. `transactions/page.tsx` 리라이트:
   - `dynamic()` 제거 → 정적 import (Context 사용을 위해)
   - `<FinanceProvider>` 으로 감쌈
4. **디자인 트랙**: 탭 바를 `GLASS.L5` + `BTN.md` 토큰으로 재작성 (현재는 하드코딩 스타일)
5. `evaluate.js` PASS 확인 → 단일 커밋

### Phase H — 탭별 이전 (2일)

각 탭 구현 시 **구조 + 디자인 동시 적용**:

#### H-1. DashboardTab (구 /finance/page.tsx)
- **구조**: 본문을 `DashboardTab.tsx`로 복사, AppContext → FinanceContext 일부 의존 이관
- **디자인**:
  - `DcStatStrip` 위젯을 `ui-tokens.ts`의 `COLORS`/`GLASS.L3` 색상 틴트로 변경 (task #59 동시 수행)
  - 수기 입력 폼은 제거 (QuickTxModal로 이동)
  - 기존 카드 bg/border 하드코딩 제거 → `GLASS.L4` + `COLORS.borderSubtle`
- **QuickTxModal 분리**: 폼 state + 제출 로직을 모달로 추출. `Dialog` 패턴 (Escape 닫기, 백드롭 클릭 닫기)

#### H-2. ClassifyTab (구 /finance/upload/page.tsx)
- **구조**:
  - 7,567 → 목표 ~7,100 이하 (localStorage 로직 제거로 -200~300 예상)
  - 4개 `useState(() => localStorage...)` → `useFinance()` 훅으로 교체
  - Phase D에서 추출한 `renderCategoryBadge` / `renderRelatedBadge` 재활용 확인
- **디자인**:
  - 상단 필터 칩 바 → `pillStyle(tone)` 토큰 호출로 전환
  - `uploadSubFilter` 잔재(주석) 정리
  - 테이블 헤더 → `GLASS.L4`
  - 회계 고급 토글 버튼 → `BTN.sm` + `COLORS.primary`/`COLORS.neutral`
  - `classifyTone()` / `classifyColor()` 훅 도입 (하드코딩된 `#dc2626`/`#f59e0b` 제거)

#### H-3. UploadsTab (구 /finance/uploads/page.tsx)
- **구조**: 본문 이전, `onMouseEnter` 렌더 중 스타일 변경 → CSS `:hover` 또는 className 토글로 교체 (Phase F 지연 항목)
- **디자인**:
  - 테이블 → `GLASS.L4`
  - 상태 배지 → `pillStyle(classifyTone(...))`
  - "복원" / "롤백" 버튼 → `BTN.md` + `COLORS.danger`/`COLORS.primary`

#### H-4. CardsTab (구 /finance/cards/page.tsx)
- **구조**: 본문 이전
- **디자인**:
  - 스탯 카드 → `GLASS.L3` + 색상 틴트 보더 (blue/green/red/amber)
  - 월 네비게이션 → `BTN.md`

#### H-5. CodefTab (구 /finance/codef/page.tsx)
- **구조**: 본문 이전
- **디자인**:
  - 연결 상태 배지 → `pillStyle(tone)`
  - 카드 → `GLASS.L3` (violet 틴트, Codef는 플러그인 성격)

### Phase I — 리다이렉트 & 마무리 (0.5일)

1. `next.config.js`에 301 리다이렉트 추가
2. 구 페이지 파일 삭제 (또는 얇은 리다이렉트 셸로 축소)
3. 전역 네비에 [⚡ 빠른 입력] 버튼 추가 → QuickTxModal 오픈
4. `evaluate.js` 전체 PASS + 시각 QA 체크리스트 완주
5. 단일 배포 푸시

---

## 5. 디자인 시스템 트랙 (필수 동시 진행)

> 사용자 강조: **"디자인 무조건 같이 잡고 가야합니다"** — 이 섹션은 Phase G/H에 녹여서 동시 진행, 별도 Phase로 분리하지 않는다.

### 5.1 ui-tokens.ts 적용 체크리스트 (파일별)

| 파일 | 적용 대상 토큰 | 완료 기준 |
|------|--------------|----------|
| DashboardTab | COLORS, GLASS.L3/L4, BTN.md, pillStyle | 인라인 `background: '#...'` 잔여 0건 |
| ClassifyTab | COLORS, GLASS.L1/L3/L4, BTN.sm/md, pillStyle, classifyTone | 하드코딩 HEX 잔여 ≤ 5개 (아이콘 전용 예외) |
| UploadsTab | COLORS, GLASS.L4, BTN.md, pillStyle | 하드코딩 HEX 잔여 0건 |
| CardsTab | COLORS, GLASS.L3, BTN.md | 하드코딩 HEX 잔여 0건 |
| CodefTab | COLORS, GLASS.L3, BTN.md, pillStyle | 하드코딩 HEX 잔여 0건 |
| QuickTxModal | COLORS, GLASS.L4, BTN.md, GLASS.L1 (인풋) | 100% 토큰화 |
| TransactionsHub (탭바) | COLORS, GLASS.L5, BTN.md | 100% 토큰화 |

**정량 목표**: finance 모듈 하드코딩 HEX 잔여 **현재 N건 → 10건 이하**.

### 5.2 Soft Ice Glass 레벨 감사

CLAUDE.md §10 기준:

| 표면 | 현재 | 목표 | 비고 |
|------|------|------|------|
| 네비/탭 바 | 임시 하드코딩 | L5 | `GLASS.L5` |
| 수기 입력 모달 | 없음 | L4 | 신규 |
| 데이터 테이블 | L4 혼재 | L4 | `GLASS.L4` |
| 스탯 카드 | L3 하드코딩 | L3 + 색상 틴트 보더 | blue/green/red/amber 구분 |
| 사이드/필터 패널 | L2 | L2 | `GLASS.L2` |
| 인풋/검색바 | 평면 | L1 오목 | `GLASS.L1` |

### 5.3 DcStatStrip 재작성 (task #59 통합)

- 기존 `/app/components/DcStatStrip.tsx` 를 **변형 A** 로 재작성
  - L3 글래스 + 색상 틴트 보더
  - 아이콘 + 라벨 + 값 + 보조값 구조
  - 색상은 `pillStyle(tone)` 과 동일한 톤 매핑
- DashboardTab + CardsTab + ClassifyTab 스탯 영역에서 공통 사용

### 5.4 시각 QA 체크리스트

배포 전 필수 확인:

- [ ] 다크 배경 위 글래스 L5 탭바 가독성 (tab 글자 색 AA 대비 4.5:1)
- [ ] 미분류 빨강 (`#dc2626`) / 기타 앰버 (`#f59e0b`) 구분이 색약자에게도 구분되는지 (아이콘 보조 확인)
- [ ] 모바일 (≤640px) 탭바 → 드롭다운 또는 가로 스크롤 전환
- [ ] 모달 (QuickTx) 열림 시 body scroll lock
- [ ] classify 탭 대형 테이블 → 가상 스크롤 미적용 상태에서 1000행 렌더 FPS ≥ 30
- [ ] 모든 버튼 포커스 링 `outline` 존재 (a11y)

### 5.5 색상/대비 감사

```bash
# Generator가 각 Tab 구현 후 실행
grep -rn "color: '#\|background: '#" app/finance/transactions/ | wc -l
# 목표: ≤ 10
```

---

## 6. 재활용 자산 (Phase A~F 산출물)

이번 작업에서 **이미 만들어져 있으므로 재사용만 하면 되는 것**:

| 자산 | 위치 | 용도 |
|------|------|------|
| `ui-tokens.ts` | `app/utils/` | 디자인 토큰 (Phase A) |
| `renderCategoryBadge()` | `upload/page.tsx` 내부 | 카테고리 배지 렌더 (Phase D) |
| `renderRelatedBadge()` | `upload/page.tsx` 내부 | 연관 거래 배지 렌더 (Phase D) |
| `sourceFilter` 단일화 구조 | `upload/page.tsx` | `uploadSubFilter` 통합됨 (Phase E) |
| `showAdvancedCategory` 토글 | `upload/page.tsx` | 고급 모드 토글 (Phase C) |
| `TransactionEditModal` | `app/components/` | 거래 편집 모달 (재사용) |

`renderCategoryBadge` / `renderRelatedBadge` 는 ClassifyTab 이전 시 **컴포넌트로 승격** (`app/finance/transactions/_components/CategoryBadge.tsx`, `RelatedBadge.tsx`) 하여 타 탭에서도 재사용 가능하게.

---

## 7. 회귀 테스트 체크리스트

### 7.1 데이터 무결성

- [ ] `transactions` 테이블 레코드 수 이전과 동일
- [ ] `upload_batches` ↔ `transactions` FK (`upload_batch_id`) 유효
- [ ] 소프트 삭제 (`deleted_at`) 레코드 여전히 필터링됨
- [ ] 롤백된 배치의 `rolled_back_at` 플래그 유지

### 7.2 사용자 설정 마이그레이션

- [ ] 기존 localStorage 키 (`finance_*`) → 새 키 (`fmi_finance_*`) 자동 이관
- [ ] 기존 사용자의 categoryMode/groupBy 설정이 **첫 로드 시 그대로 재현**
- [ ] 이관 후 구 키 삭제 확인

### 7.3 URL 동작

- [ ] `/finance` 접근 → `/finance/transactions?tab=dashboard` 301
- [ ] `/finance/upload?unclassified` → `/finance/transactions?tab=classify&filter=unclassified`
- [ ] `/finance/uploads?rolled=1` → `/finance/transactions?tab=uploads&rolled=1`
- [ ] 새 탭에서 깊은 링크 (`?tab=classify&filter=card&group=source&batch=xxx`) 전체 상태 복원
- [ ] 브라우저 뒤로가기 → 탭 전환 이력 복원

### 7.4 기능 회귀

- [ ] 수기 입력 저장 → DashboardTab 즉시 반영
- [ ] 파일 업로드 → UploadsTab 배치 목록에 즉시 출현
- [ ] 배치 롤백 → ClassifyTab 리스트에서 즉시 제거
- [ ] 분류 변경 → stats 스트립 즉시 갱신
- [ ] 카드 탭 연간 조회 정상
- [ ] Codef 연결 상태 조회 정상

### 7.5 디자인 회귀

- [ ] 모든 탭에서 글래스 레벨 위계 일관 (L5 > L4 > L3 > L2 > L1)
- [ ] 미분류/기타/분류 색상 구분 일관
- [ ] 버튼 3종 크기 (sm/md/lg) 일관
- [ ] 포커스 링 존재 (a11y)

---

## 8. 리스크 & 롤백 전략

### 리스크

| # | 리스크 | 영향 | 완화 |
|---|-------|------|------|
| R1 | ClassifyTab 7,500줄 이전 중 상태 누락 | 분류 기능 마비 | 기존 파일 백업 + 비교 스크립트 실행 |
| R2 | URL ↔ Context 동기화 무한 루프 | 성능 저하/크래시 | 동기화 훅 단방향 플래그로 방지 |
| R3 | 301 리다이렉트가 POST 요청에 적용되면 데이터 손실 | API 호출 실패 | 리다이렉트는 page 라우트만, `/api/*` 제외 확인 |
| R4 | DcStatStrip 재작성이 타 페이지(quotes/contracts)에 영향 | 타 모듈 UI 깨짐 | 감사 후 공용 여부 확인, 필요 시 fork |
| R5 | localStorage 이관 실패로 사용자 설정 초기화 | UX 저하 | 이관 로직에 try/catch, 실패 시 기본값 유지 |

### 롤백 전략

- Phase G/H/I 각각 **개별 커밋** → 특정 Phase만 revert 가능
- 구 페이지 파일은 Phase I 전까지 **삭제하지 않고 유지** (리다이렉트만 적용하여 병행 검증)
- 301 → 302로 임시 전환 시나리오 대비 (문제 발생 시 즉시 복원)

---

## 9. 승인 요청 (Gate 3)

### 사용자 확인이 필요한 항목

1. **실행 단계 (Phase G → H → I) 분할을 받아들이는가?**
   (예상 총 소요: 3.5일 / 커밋 수: 7~9개)
2. **리다이렉트 전략 — 즉시 301 vs 구 페이지 병행 유지 한 주 후 삭제?** (기본안: Phase I에서 301)
3. **QuickTxModal 진입점 — 전역 네비 버튼 한 곳 vs DashboardTab 상단 버튼도 유지?** (기본안: 양쪽 모두)
4. **DcStatStrip 재작성을 본 작업에 포함 vs 별도 task #59로 분리?** (기본안: 본 작업에 포함 — 사용자 "디자인 같이" 요청)
5. **localStorage 네임스페이스를 `fmi_finance_*`로 변경 수용?** (기본안: Yes, 이관 자동)

### Gate 3 통과 후

→ Generator 에이전트에게 Phase G부터 순차 실행 위임
→ 각 Phase 종료 시 Reviewer + Designer + Evaluator 게이트 통과 확인
→ Phase I 완료 후 Deployer 단일 배포

---

## 10. 부록 — 참조 파일

- `CLAUDE.md` §10 Soft Ice 디자인 시스템
- `HARNESS.md` 모듈 상태
- `app/utils/ui-tokens.ts` 토큰 정의
- `harness-engineering/knowledge/patterns.md` 축적 패턴
- `harness-engineering/knowledge/color-issues.md` 시인성 이슈 이력
- `harness-engineering/docs/phase1-planner-design.md` 직전 설계 (Phase A 참고)

---

**문서 끝 — 사용자 승인 대기 (Gate 3)**
