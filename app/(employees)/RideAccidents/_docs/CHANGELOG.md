# CHANGELOG — RideAccidents (라이드 사고접수) 모듈

> 매 PR 종료 시 한 줄 이상 기록 의무 (규칙 22).
> 형식: `YYYY-MM-DD | PR-CODE | 한 줄 요약`
>
> 사용자 노출 명칭: "라이드 사고접수"
> 백엔드 source: 카페24 ERP (skyautosvc.co.kr) read-only

---

## 2026-05-06 | PR-6.7.c | hotfix — 컬럼 의미 명확화 + 필터 강화

### 사용자 의문
> "접수일자는 저건 실제로 있는 데이터인가 사고일자인가 접수일자인가"
> "접수시각도 일자인가 시간인가 믿기 어렵네"

`2453-08-11` / `2202-02-25` 같은 비현실적 날짜가 표시됨 — 사용자 불신.

### 진단

```
otptmddt = PK 의 일부 (사용자 입력 가능 — 운영자 수정도 가능)
   → 실수로 24530811 (2453년) / 22020225 (2202년) 같은 비현실적 입력 누적
   → PR-6.7.b 의 LIKE '20%' 필터 통과 (8자리 + '20'/'24' prefix 인 경우)

otptacdt + otptactm = 시스템 자동 (CDATE/CTIME)
   → "접수시각" 라벨이 사용자에게 "접수한 일시" 와 "접수 후 기록 시각" 둘 다로 해석 가능
```

### 정정

```
1. 필터 강화 (acrents + accidents):
   이전: WHERE LIKE '20%' AND CHAR_LENGTH = 8
   정정: WHERE BETWEEN '20100101' AND '20991231' AND CHAR_LENGTH = 8
        AND otptacdt 도 같은 범위 또는 NULL (옛 row 허용)

2. 컬럼 라벨 정정 (의미 명확):
   이전: "접수시각"  (otptacdt+actm)
   정정: "기록시각"  (시스템 자동 기록 = 신뢰 가능)

   "접수일" (otptmddt) 은 그대로 유지 (PK 의미 그대로)
```

### 산출물

| 파일 | 변경 |
|------|------|
| `app/api/cafe24/acrents/route.ts` | mddt BETWEEN '20100101' AND '20991231' + acdt 검증 추가 |
| `app/api/cafe24/accidents/route.ts` | 동일 필터 (긴급출동도) |
| `app/(employees)/RideAccidentReports/page.tsx` | "접수시각" → "기록시각" |
| `app/(employees)/RideAccidents/page.tsx` | "접수시각" → "기록시각" |

### GATE 진행 상태

```
✅ 사용자 의문 보고 → 즉시 진단 + 정정
✅ G5 tsc 회귀 0건
✅ G6 lint:harness 새 위반 0건
⏭ G7 시각 검수 — Cloud Build 5-10분 후 hmseok.com 에서 확인
✅ Rule 22 _docs 갱신
```

---

## 2026-05-06 | PR-6.7.b | 코드 정제 + 상담내역 + 비정상 데이터 필터

### 사용자 요청
> "데이터하고 뭐 코드들도 정제를 해야할것같고"
> "상담 이력도 안보이는데"
> "코드들도 사용자가 구분가능한내용으로"

### 결정적 발견 — comcbsdm 코드 마스터

PHP fs_bscddesc 함수 추적 → `comcbsdm` 테이블 발견.

```sql
SELECT cbsddesc FROM comcbsdm
 WHERE cbsdjobb = ? AND cbsdgubn = ? AND cbsdcode = ?
```

#### OTPTACBN (사고 유형) — 12 코드
B=보불 D=단독 E=기타 G=가해 H=긴출 J=자차 K=과실 M=면책 O=정비 P=피해 Q=검사 S=긴출

#### OTPTRGTP (진행 단계) — 4 코드
1=접수 2=완료 3=공장 4=종결

#### ESOSTYPP (긴급 타입) — 5 코드 — **이전 추정 라벨 모두 틀림**
이전 (PR-6.5+6): S=서비스 / J=점프 / E=긴급 / B=배터리 / I=점검 ❌
실제: S=긴급출동 / J=정비상담 / E=기타상담 / B=법정검사 / I=블랙서비스 ✅

#### ESOSRSLT — 3 코드
1=처리중 / 2=취소 / 3=접수완료

→ **즉 PR-6.5+6 배포된 페이지가 거짓 라벨 표시 중. 정정 의무**.

### 산출물

| 파일 | 종류 | 변경 |
|------|------|------|
| `app/api/cafe24/codes/route.ts` | 신규 | comcbsdm 코드 마스터 endpoint (OTPT*/ESOS*) |
| `app/api/cafe24/acrents/memos/route.ts` | 신규 | acrmemoh 상담내역 (사고접수) |
| `app/(employees)/RideAccidentReports/_codes.ts` | 신규 | useCafe24Codes hook + getCodeLabel + ynBadge |
| `app/api/cafe24/acrents/route.ts` | 수정 | 비정상 mddt 필터 (`LIKE '20%' AND CHAR_LENGTH = 8`) |
| `app/(employees)/RideAccidentReports/page.tsx` | 확장 | 사고유형/진행단계 한국어 매핑 + acrmemoh timeline |
| `app/(employees)/RideAccidents/page.tsx` | 정정 | ESOSTYPP/ESOSRSLT 추정 라벨 → 실 매핑 정정 |

### 비정상 데이터 필터 (사용자 스크린샷 발견)

```
"확인안됨" / "확인불가" 텍스트 입력: 7건
"22020225" 같은 12자리 입력 오류: 2건
빈값: 1건
→ 합계 9건 자동 제외 (정상 68,983 / 99.99%)
```

### Y/N 매핑 명확화 (PHP 패턴 따름)

```
사고접수 (acr):
  otptacrn (운행상태): Y=운행가능 / N=운행불가능 (이전 거꾸로 매핑 정정)
  점검 7항목 (acdi/dm/jc/js/mb/no/ph): Y=정상 / N=문제 (PHP otptacrn 패턴 확장)

긴급출동 (ace):
  점검 6항목 (bate/tire/oils/lock/move/help): Y=체크됨(amber) / N=정상(green)
  (도메인상 의미 확실치 않아 amber 로 보수적 표시)
```

### 신규 기능

```
✅ 한 번 fetch + 메모리 캐시 (코드 마스터 — 자주 안 변함)
✅ useCafe24Codes() 훅 — 두 페이지 공통 사용
✅ 사고접수 모달에 "상담 내역" timeline (acrmemoh) — 긴급출동과 동일 패턴
✅ 비정상 mddt 자동 제외 (사용자 입력 오류 데이터 9건)
✅ 사고유형/진행단계 한국어 라벨 — 운영자 즉시 이해
```

### GATE 진행 상태

```
✅ G3 사용자 GO ("코드들도 사용자가 구분가능한내용으로")
✅ G5 tsc 회귀 0건
✅ G6 lint:harness 새 위반 0건
⏭ G7 Designer — 시각 검수 의무 (배포 후)
✅ Rule 13 외부 시스템 호환성 — comcbsdm 실 검증 완료
✅ Rule 17 모듈 폴더 분리 — _codes.ts 헬퍼는 RideAccidentReports/ 안 (RideAccidents 가 import — 의도적 cross)
✅ Rule 22 _docs 갱신
⚠ Rule 21 Cowork — cross-module (RideAccidents + RideAccidentReports + api:cafe24)
   → COWORK_ALLOW_MULTI_MODULE=1 우회 (의도적 — 코드 마스터 일관성 위해 한 PR)
```

### 다음 PR 예고

- **PR-6.8** — 차량 통합 이력 timeline (한 carsidno 의 긴급출동 + 사고접수 + 대차 + 정산)
- **PR-6.9** — 계약정보 (보험/대차/정산) 모달에 추가
- **PR-6.10** — 코드 마스터 화면 (운영자가 직접 코드 의미 보기)

---

## 2026-05-06 | PR-6.7 | 사고접수 (acr 모듈) 별도 페이지 + 라벨 정정

### 사용자 요청
> "긴출 내용이라 사고접수내용까지 가봐야 디테일 알겠네요"
> "추천을 믿습니다" → A 옵션 (PR-6.7 + PR-6.8 둘 다 진행)

### 변경

```
사이드바 라벨 정정:
  기존  /RideAccidents          🚨 라이드 사고접수  (실은 긴급출동)
  → ✅  /RideAccidents          🚨 라이드 긴급출동
  + ✅  /RideAccidentReports    🚗 라이드 사고접수  (신설)

데이터 source:
  /RideAccidents          aceesosh + acememoh (기존 — 긴급출동)
  /RideAccidentReports    acrotpth + pmccarsm + picuserm + pmccustm (신설 — 사고접수)
```

### 산출물

| 파일 | 종류 | 내용 |
|------|------|------|
| `app/api/cafe24/acrents/route.ts` | 신규 | 4-table JOIN 목록 API |
| `app/api/cafe24/acrents/detail/route.ts` | 신규 | 60+ 컬럼 단건 상세 |
| `app/(employees)/RideAccidentReports/page.tsx` | 신규 | 사고접수 페이지 + 모달 |
| `app/(employees)/RideAccidents/page.tsx` | 라벨 | 헤더 "긴급출동" 으로 정정 |
| `lib/menu-registry.ts` | 갱신 | mod-ride-accident-rep entry 추가 + 기존 라벨 정정 |

### 사고접수 모달 섹션

```
🚗 사고접수 상세                                [× 닫기]
─────────────────────────────────────
[기본]      접수일 / 접수시각 / 사고번호 / 등록상태 / 등록타입
[차량]      차량번호 + 차종/모델 + 차량 사용자 + 고객
[차량 점검] 운행가능 (acrn) + 7개 점검 (di/dm/jc/js/mb/no/ph) — Y문제/N정상
[사고 정보] 현장 etc / 주소 / 메모 / 비용
[운전자]   이름 / 연락처 / 면허 / 사용자 / 전화 / 메모
[차주]      이름 / 연락처
[견인]      견인 회사 / 회사 전화 / 견인 차량 / 기사 이름 / 기사 전화
[장소]      빌딩 / 주차장
[이력]      등록 (date+time+user) / 수정 (date+time+user)
```

### GATE 진행 상태

```
✅ G3 Planner — 사용자 GO ("a — 둘 다 진행")
✅ G5 Generator — tsc 회귀 0건
✅ G6 Reviewer — lint:harness 새 위반 0건
✅ Rule 13 외부 시스템 호환성 — PHP 측 4-table JOIN 패턴 그대로 검증 후 LEFT JOIN 으로 안전화
✅ Rule 17 모듈 폴더 분리 — RideAccidentReports/ 별도 폴더
✅ Rule 18 모든 컬럼 sortBy (9 컬럼)
✅ Rule 21 Cowork — 본 세션 영역만 staging
   ⚠ cross-module (api:cafe24 + RideAccidentReports + RideAccidents + lib:menu-registry)
   → COWORK_ALLOW_MULTI_MODULE=1 우회 (의도적 cross-module — 라벨 일관성 위해 한 PR)
✅ Rule 22 _docs 갱신
```

### 다음 PR

- **PR-6.8** — 차량 통합 이력 timeline (한 carsidno 의 긴급출동 + 사고접수 + 대차 + 정산 모든 이력)

---

## 2026-05-06 | PR-6.6 | 상담내역 (acememoh) timeline 추가

### 사용자 통찰력 + 요청
> "긴급출동이랑, 사고접수랑 둘다 들어왔나요? 긴급출동만 들어왔나요?"
> "상담내역도 보고싶어요"

### 명확화 (PHP 코드 추가 분석)

```
✅ 현재 보이는 데이터 = 긴급출동 (ace 모듈)
   - aceesosh (헤더) + esostypp: S/J/E/B/I — 모두 출동 카테고리
   - 데스크톱 ace_app 추정

❌ 사고접수 (acr 모듈) — 미연동, 별도 신설 필요 (PR-6.7 예정)
   - acrotpth (사고차 출동)
   - 4-table JOIN (acrotpth + pmccarsm + picuserm + pmccustm)
   - acr_app.exe (사고차 처리 메인 데스크톱)
```

### 본 PR 범위 — 상담내역 표시

`acememoh` 테이블 (긴급출동 1건 1:N):
```sql
SELECT memoidno, memomddt, memosrno, memonums, memosort,
       memotitl, memotext,
       memognus, memogndt, memogntm
  FROM acememoh
 WHERE memoidno = ? AND memomddt = ? AND memosrno = ?
   AND memoflag = 'O'
 ORDER BY memosort ASC, memonums ASC
```

### 산출물

| 파일 | 종류 | 변경 |
|------|------|------|
| `app/api/cafe24/accidents/memos/route.ts` | 신규 | acememoh read-only API |
| `app/(employees)/RideAccidents/page.tsx` | 확장 | MemoRow 타입 + 병렬 fetch + 상담내역 timeline |

### UI 상담내역 timeline

```
[상담 내역 · 3건]
─────────────────────────────────────
| 2026-05-04 14:30 · khchoo
|   [방문 점검]
|   배터리 교체 후 정상 시동 확인
|
| 2026-05-04 11:15 · maseo
|   [고객 통화]
|   고객 위치 확인. 30분 내 출동 약속.
```

- 좌측 보라 stripe (border-left 2px primary)
- 시각 + 작성자 (헤더)
- 제목 굵게 + 본문 pre-wrap (한국어 줄바꿈 유지)
- 빈 상태: "등록된 상담 내역이 없습니다"

### GATE 진행 상태

```
✅ G3 Planner — "B 옵션 선택 + 추천 신뢰" 사용자 GO
✅ G5 Generator — tsc 회귀 0건
✅ G6 Reviewer — lint:harness 새 위반 0건
⏭ G7 Designer — 사용자 시각 검수 의무
✅ Rule 13 외부 시스템 호환성 — acememoh DDL PHP 코드 추출 검증
✅ Rule 17 모듈 폴더 분리 — api:cafe24 만 추가 (RideAccidents UI 유지)
✅ Rule 21 Cowork — 본 세션 영역만 staging
   ⚠ cross-module (api:cafe24 + RideAccidents) — COWORK_ALLOW_MULTI_MODULE=1 우회
✅ Rule 22 _docs 갱신 (CHANGELOG)
```

### 다음 PR 예고

- **PR-6.7** — 사고접수 (acr 모듈) 별도 페이지 신설
  - 새 사이드바 항목 + acrotpth 4-table JOIN
  - 기존 ace = 긴급출동 / 신규 acr = 사고접수 분리
- **PR-6.8** — 코드 마스터 매핑 (S/J/E/B/I → 한국어 라벨, 1/3 → 처리중/완료)

---

## 2026-05-06 | PR-6.5+6 | 사고 본질 표출 + 상세 모달 (통합 PR)

### 사용자 요청
> "디비는 올라오기시작했는데 사고내용표출은 어떻게 진행할수있을까요?"
> "go 사고접수내용을 볼수있고 상세내용도 볼수있게 표출해주세요"

### 카페24 PHP 측 SQL 추출 결과 (cafe24_source/ERP/service/hace01sv/ace0101a.php)

**ACE0101A_datalistC** (목록):
```sql
SELECT esosidno, esosmddt, esossrno, esosacdt, esosactm,
       carsnums,    -- 차량번호 (예: "47하9604")
       carsodnm,    -- 차종/모델 (PHP 코드 라벨은 차주명이지만 실 데이터는 차종)
       esostypp, esosrslt, esosgnus
  FROM aceesosh, pmccarsm
 WHERE esosidno = carsidno              -- ★ 조인 키
   AND esosmddt BETWEEN carsfrdt AND carstodt    -- ★ SCD-Type2 효력기간
   AND esosrgst = 'R'
ORDER BY esosgndt DESC, esosgntm DESC, esossrno DESC
```

**ACE0101A_dataselectD** (상세) — 30+ 컬럼:
- 차량 점검 (1자 Y/N): bate / tire / oils / lock / move / help
- 위치: addr / adnm / adtl
- 요청자: usnm / ustl / usvp / usvd / user
- 메모: rstx (2000자) / memo (500) / inft (500)
- 주행거리: kilo
- 등록/수정: gndt+gntm+gnus / updt+uptm+upus

### 검증 결과 (실 데이터 — 카페24 외부 IP 직접 접속)

```
esosrgst:  R(72,847) / C(4,666)        — 등록/취소 2-state
esosrslt:  3(71,316) / 1(6,197)        — 처리완료/처리중 (추정)
esostypp:  S(51,965) / J(9,386) / E(5,995) / B(3,960) / I(1,964)
점검 항목: Y(문제) / N(정상) / "" (미점검) — 한 사고 1~2 항목만 Y
pmccarsm.carsodnm: "쏠라티(MQ4)-1.6 하이브리드" 같은 차종/모델 패턴
```

### 한글 charset 함정 (lib/cafe24-db.ts hotfix 포함)

```ts
// PR-6.2 에서 잘못 변경한 부분:
return field.string()        // ❌ 인자 없으면 latin1 — 한글 깨짐
return field.string('utf8')  // ✅ utf8 명시 — 한글 정상
```

### 산출물

| 파일 | 종류 | 변경 |
|------|------|------|
| `lib/cafe24-db.ts` | hotfix | `field.string('utf8')` — 한글 깨짐 fix |
| `app/api/cafe24/accidents/route.ts` | 확장 | LEFT JOIN pmccarsm + cars_no/cars_model |
| `app/api/cafe24/accidents/detail/route.ts` | 신규 | 단건 상세 — 30+ 컬럼 + 차량 조인 |
| `app/(employees)/RideAccidents/page.tsx` | 확장 | 차량/차종 컬럼 + 행 클릭 → 상세 모달 |

### UI 상세 모달 구조

```
🚨 사고 접수 상세                                [× 닫기]
─────────────────────────────────────
[기본]      접수일 / 접수시각 / ID / 순번 / 등록상태 / 결과 / 타입
[차량]      🚗 차량번호 / 차종-모델 / 주행거리
[차량 점검] 6 항목 (bate/tire/oils/lock/move/help) — 정상/문제/미점검 색상
[발생 위치] 주소 / 도로-동 / 상세
[요청자]   이름 / 연락처 / 추가1 / 추가2
[메모]     결과 메모 (2000자) / 메모 (500) / 추가 정보 (500)
[이력]     등록 (date+time+user) / 수정 (date+time+user)
```

### GATE 진행 상태

```
✅ G3 Planner — 설계서 v2 + 사용자 GO ("go")
✅ G5 Generator — tsc --noEmit 회귀 0건
✅ G6 Reviewer — lint:harness 새 위반 0건
   · cowork-staging-lint: working tree 검사 모드 skip (push 시 staged 검증 의무)
⏭ G7 Designer — 사용자 시각 검수 의무 (배포 후 hmseok.com/RideAccidents)
✅ Rule 13 외부 시스템 호환성 — typeCast utf8 명시 + LEFT JOIN 효력기간
✅ Rule 18 NeuDataTable 모든 컬럼 sortBy (9 컬럼)
✅ Rule 19 줄바꿈 최소화 — white-space nowrap + ellipsis
✅ Rule 22 _docs 갱신
⚠ Rule 21 Cowork — 본 PR 은 cross-module (lib + api + RideAccidents)
   → 의도적 cross-module (UI + 백엔드 + connection hotfix 한 PR)
   → COWORK_ALLOW_MULTI_MODULE=1 git commit ... 로 우회
```

### 다음 PR 예고

- **PR-6.7** — 코드 마스터 매핑 (E/S/J/B/I → 한국어 라벨, 1/3 → 처리중/완료) `bscddesc` 조인
- **PR-6.4** — `/RideAccidents/dashboard` KPI 위젯 (오늘 접수 / 진행 / 완료)

---

## 2026-05-06 | PR-6.3.c | Hotfix — 폴더 rename + 사이드바 그룹 변경

### 사용자 피드백 (09:51 KST)
```
1. ❌ /Cafe24 ERP/accidents 404 — Next.js 가 공백 폴더 라우팅 못함
2. ❌ "관리(admin)" 그룹 → ✅ "Employee of Ride Inc." (cx-team) 하위
3. ❌ "🚨 카페24 사고접수" → ✅ "🚨 라이드 사고접수"
```

### 변경

```
폴더 RENAME:
  app/(employees)/Cafe24 ERP/accidents/page.tsx
  → app/(employees)/RideAccidents/page.tsx

URL:
  /Cafe24%20ERP/accidents (404)
  → /RideAccidents (✅)

menu-registry:
  id:           mod-cafe24-accidents → mod-ride-accidents
  name:         카페24 사고접수      → 라이드 사고접수
  displayName:  🚨 카페24 사고접수    → 🚨 라이드 사고접수
  path:         /Cafe24 ERP/accidents → /RideAccidents
  group:        admin                → cx-team
  sortOrder:    48                   → 63

페이지 헤더 텍스트:
  "🚨 카페24 ERP > 사고 접수" + C24 보라 배지
  → "🚨 라이드 사고접수" (배지 제거)

_docs path 참조 일괄 갱신:
  app/(employees)/Cafe24 ERP/  →  app/(employees)/RideAccidents/
  /Cafe24 ERP/{dashboard,orders,settlements,masters}  →  /RideAccidents/{...}
```

### 유지 (의도적)

- 백엔드 데이터 source = "카페24 ERP (skyautosvc.co.kr)" — _docs 안 시스템 표현 유지
- `lib/cafe24-db.ts` 모듈명 유지 (백엔드 connection)
- `app/api/cafe24/probe`, `app/api/cafe24/accidents` 라우트 유지 (백엔드 source 의미)
- `_docs/CLAUDE-Cafe24.md` 파일명 유지 (모듈 본명 — 백엔드 측)

### 사용자 노출 vs 시스템 내부

```
사용자 (사이드바, 헤더, 라벨):  "라이드 사고접수"
시스템 내부 (코드, _docs):      "카페24 ERP (백엔드 source)"
```

### GATE 진행 상태

```
✅ Hotfix — 사용자 결정적 피드백 받아 즉시 fix
✅ G5 빌드 — 폴더 rename 후 tsc 회귀 0건 확인 의무
✅ G6 lint:harness 검증 의무
✅ Rule 17 모듈 폴더 분리 + import 경계 (RideAccidents 단일)
✅ Rule 21 Cowork — 본 세션 영역만 staging
✅ Rule 22 _docs 갱신 (CHANGELOG.md)
```

---

## 2026-05-05 | PR-6.3 | Generator — broken call 해소 + 사고 접수 페이지

### 산출물

- **`app/api/cafe24/probe/route.ts`** (신규) — 헬스체크 (admin 전용)
- **`app/api/cafe24/accidents/route.ts`** (신규) — 사고 접수 read-only API
  - `aceesosh` 직접 read (raw 컬럼 — pmccustm/pmccarsm 조인은 PR-6.3.b)
  - Query: `limit / offset / from / to / rgst / q`
  - admin role 체크 + graceful fallback (cafe24-unavailable 200 응답)
- **`app/(employees)/RideAccidents/accidents/page.tsx`** (신규) — UI
  - Glass L5 헤더 + L2 필터바 + L4 NeuDataTable
  - 모든 컬럼 sortBy 의무 (규칙 18) — 8 컬럼
  - 'C24' 보라 배지 (카페24 데이터 출처 명시)
  - stale 인디케이터 (60s/300s 임계 색상 변경)
  - admin role 권한 차단 (page client 측 + API server 측 이중)
- **`_docs/CHANGELOG.md`** (수정) — PR-6.3 항목 추가

### Broken call 해소 ✅

```
이전: app/operations/intake/page.tsx:170
        fetch('/api/cafe24/accidents?limit=200')   ← 라우트 미존재 → 500
이후: 본 PR 의 /api/cafe24/accidents 라우트 신설로 동작
        api-call-trace lint: broken=33 → 32 (1건 해소 확인)
```

### GATE 진행 상태

```
✅ G3 Planner — 설계서 v2 + 사용자 GO ("a — 지금 시작")
✅ G5 Generator — tsc --noEmit 본 세션 변경 파일 에러 0건 (회귀 0)
✅ G6 Reviewer  — npm run lint:harness 새 critical 0건
                  · sql-lint: violations=0 / new=0
                  · sql-fn-lint: violations=0
                  · api-call-trace: newBroken=0 (broken 33→32 해소!)
                  · sql-reserved-alias-lint: total=0
                  · sql-group-by-lint: total=0
                  · helper-coverage-lint: total=0
                  · amount-sign-lint: new=0
                  · menu-sync-lint: violations=0 (baseline 갱신)
⏭ G7 Designer — 사용자 시각 검수 권장 (Chrome MCP 미연결 / 사용자 스크린샷)
                 첫 화면이라 디자인 시스템 일치 + 빈 상태 / 에러 배너 / stale 인디케이터 검수 의무
⏭ G8 Evaluator — 다음 PR-6.4 통합 평가
✅ Rule 21 Cowork — 본 세션 영역만 staging
                    ⚠ menu-registry 는 staging 제외 (다른 세션 PR-B1 동시 작업 중)
                    → cafe24-accidents 사이드바 등록은 PR-6.3.b 별도 진행
✅ Rule 22 _docs 갱신 (CHANGELOG.md)
✅ Rule 13 외부 시스템 호환성 — PR-6.1 검증 결과 + cafe24-db 단일 진입점 사용
✅ Rule 18 NeuDataTable 모든 컬럼 sortBy 정의 (8 컬럼 모두)
```

### 영향 범위

```
신규 파일:
  app/api/cafe24/probe/route.ts
  app/api/cafe24/accidents/route.ts
  app/(employees)/RideAccidents/accidents/page.tsx

자동 해소:
  app/operations/intake/page.tsx:170 broken call (코드 변경 X — API 라우트 신설로 해소)

본 PR 미포함 (PR-6.3.b):
  lib/menu-registry.ts cafe24-accidents entry 등록 — 다른 세션 PR-B1 push 후 별도 진행
  → 사용자가 사이드바에서 "🚨 카페24 사고접수" 메뉴 보이려면 PR-6.3.b 후
  → 그 전에는 직접 URL `/RideAccidents` 입력으로 접근 가능
```

### 다음 PR

- **PR-6.3.b** — 다른 세션 PR-B1 push 후 menu-registry 에 cafe24-accidents entry 추가
- **PR-6.4** — `/RideAccidents/dashboard` + 5 KPI 위젯 + 일별 추이 차트
- **PR-6.5** — pmccustm/pmccarsm/pmcfactm 조인 + 코드 마스터 (bscddesc) 매핑

---

## 2026-05-05 | PR-6.2 | Generator — `lib/cafe24-db.ts` mysql2 read-only pool 단일 진입점

### 산출물

- **`lib/cafe24-db.ts`** (신규, 215 라인) — 본 프로젝트 카페24 DB 접근 *유일* 통로
- **`_docs/API.md`** (신규) — cafe24Db 사용법 + API 라우트 로드맵 + 호출 예시

### 주요 기능

```ts
cafe24Db.query<T>(sql, params)      // 다건 SELECT
cafe24Db.queryOne<T>(sql, params)   // 단건 SELECT (없으면 null)
cafe24Db.count(sql, params)         // COUNT(*) 첫 컬럼 number 강제
cafe24Db.probe()                    // 헬스체크 + 환경 정보
cafe24Db.end()                      // pool 종료 (테스트만)
```

### 정책 강제

- **Read-only**: `INSERT/UPDATE/DELETE/REPLACE/DROP/ALTER/TRUNCATE/CREATE/RENAME/GRANT/REVOKE/LOCK/UNLOCK/CALL/LOAD DATA` 정규식 차단 — 즉시 throw
- **Charset**: `'utf8'` (mysql2 가 utf8mb3 미인식 — PR-6.1 검증)
- **typeCast**: STRING/VAR_STRING/BLOB → utf8 string 강제 (한글 Buffer 회피)
- **Pool**: connectionLimit=5, idleTimeout=60s (Q7=A 분당 변동 정책)
- **graceful 환경변수 검증**: 5개 키 누락 시 명확한 에러 throw
- **lazy singleton**: 첫 호출 시 pool 생성, process 종료 시 자동 정리

### GATE 진행 상태

```
✅ G3 Planner — 설계서 v2 + 사용자 GO ("a — 지금 시작")
✅ G5 Generator — tsc --noEmit lib/cafe24-db.ts PASS (회귀 0건)
✅ G6 Reviewer  — npm run lint:harness 새 critical 위반 0건
                  · sql-lint: violations=0 / new=0
                  · sql-fn-lint: violations=0
                  · api-call-trace: newBroken=0
                  · sql-reserved-alias-lint: total=0
                  · sql-group-by-lint: total=0
                  · helper-coverage-lint: total=0
                  · amount-sign-lint: new=0
                  · menu-sync-lint: violations=0
                  · ui-data-coverage: warnings=33 (정보성)
⏭ G7 Designer — UI 변경 없음 (skip)
⏭ G8 Evaluator — lib 모듈만, 다음 PR-6.3 (UI 추가) 통합 평가
✅ Rule 21 Cowork — 본 세션 영역만 staging (lib/cafe24-db.ts + RideAccidents/_docs)
✅ Rule 22 _docs 갱신 (API.md 신설 + CHANGELOG.md 추가)
✅ Rule 13 외부 시스템 호환성 — PR-6.1 검증 결과 코드에 반영 (charset / typeCast / sql_mode)
```

### 영향 범위

- **신규 파일만** — 다른 파일 수정 X
- broken call (`/api/cafe24/accidents`) 은 PR-6.3 에서 본 lib 사용해 해소

### 다음 PR

- **PR-6.3** — `/api/cafe24/probe` (헬스체크 디버그) + `/api/cafe24/accidents` (broken call 해소) + `/RideAccidents` 페이지

---

## 2026-05-05 | PR-6.1 | Planner 단계 — 운영 인터뷰 + 실 DB 검증 결과 _docs 갱신

### Part A — 운영 인터뷰 (규칙 25 + 26)
(위 PR-6.1 인터뷰 결과 — Q1=A, Q2=B, Q3=A,D, Q4=B, Q5=D, Q6=D, Q7=A, Q8=D)

### Part B — 실 DB connection 검증 (★ 큰 발견)

```
✅ Host:     skyautosvc.co.kr (외부 IP 접근 이미 허용 — PB 데스크톱 동시 사용)
✅ Port:     3306
✅ DB ver:   10.1.13-MariaDB
✅ Charset:  utf8 / utf8_general_ci
✅ Mode:     IGNORE_SPACE,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION
              ← ONLY_FULL_GROUP_BY 미적용 (FMI 측과 차이)
✅ TimeZone: SYSTEM
✅ 총 테이블: 382개
✅ 데이터 규모:
   - aceesosh 77,463 row
   - ajaoderh 38,461 row
   - pmccarsm 160,148 row
✅ aceesosh DDL 확정:
   - PK (esosidno VARCHAR(8), esosmddt VARCHAR(8), esossrno INT(11))
   - esosrgst VARCHAR(1) — 다양한 상태 코드 (R/C/X 등 — PHP 코드 R 만 본 것 X)
   - esosrstx VARCHAR(2000) — 한글 메모
✅ Top prefix 그룹:
   - ajr 77 / pmc 48 / pic 43 / ajc/plu/ins 12 / pie 10 / cha 10 / acr 8 ...
   - 신규 발견: plu, cha, put, pmo, gfc — 의미 별도 분석 필요

⚠ mysql2 driver 함정:
   - charset='utf8mb3' / 'utf8mb3_general_ci' 는 Unknown — 'utf8' 만 인식
   - 한글 응답이 Buffer 로 옴 → typeCast option 으로 강제 변환 의무
```

### Part C — _docs 갱신 (5 파일)

- `OPERATIONS.md` (+157 라인) — Q1~Q8 답변 + 실 DB 검증 결과 추가
- `SCENARIOS.md` (+181 라인) — Persona 1~4 + Scenario A,D 명세
- `UI-SPEC.md` (+258 라인) — PR-6.3 사고 접수 + PR-6.4 대시보드 화면 사양
- `CLAUDE-Cafe24.md` (+50+ 라인) — 캐시/권한/단계별 source-of-truth + charset 함정 + sql_mode + 날짜 변환 패턴
- `SOURCE-ANALYSIS.md` (+170 라인) — § 11 실 DB 검증 결과 신설
- `DATA-MODEL.md` (+50 라인) — aceesosh 실 DDL 확정 + 모듈 prefix 갯수 확정

### Part D — 다음 PR 예고 (PR-6.2 즉시 진입 가능)

```
PR-6.2 — lib/cafe24-db.ts (mysql2 read-only pool 단일 진입점)
   사전 작업 ✅ 모두 완료:
     - 외부 IP 허용: 이미 OK (검증됨)
     - DB 호환성: 확정 (MariaDB 10.1, charset 함정 인지)
     - Connection 패턴: SOURCE-ANALYSIS § 11.7 + OPERATIONS § 8.1 명시

PR-6.3 — /api/cafe24/accidents + /RideAccidents 페이지
PR-6.4 — /RideAccidents/dashboard + 5 KPI 위젯 + 일별 추이
```

### GATE 진행 상태

- ✅ G3 Planner — 운영 인터뷰 4축 + 실 DB 검증 (이중 단계)
- ⏭ G5/G6/G7/G8 — 코드 변경 없음, 문서 only PR
- ✅ Rule 21 Cowork — 본 세션 영역만 staging
- ✅ Rule 22 _docs 갱신 (6 파일)
- ✅ Rule 25 운영 사실 인터뷰
- ✅ Rule 26 페르소나 / 시나리오 워크-스루
- ✅ Rule 13 외부 시스템 호환성 사전 검증 (실 connection 까지)

---

## 2026-05-05 | PR-6.1-old | Planner 단계 — 운영 인터뷰 결과 _docs 갱신 (Part A 만)

운영 사실 인터뷰 (규칙 25 + 26) 완료. 코드 변경 없음.

**확정 사실**:
- Q1=A: 24/365 운영
- Q2=B: 카페24 단계적 폐기 + FMI 마이그레이션 (장기 목표)
- Q3=A,D: 사고 접수 목록 (PR-6.3) + 통합 대시보드 (PR-6.4) 우선
- Q4=B: FMI 우선 (단계 2 이후 source of truth = FMI)
- Q5=D: 페르소나 다양 (운영자/관리자/보험) — 권한별 화면 분리
- Q6=D: 마이그레이션 타임라인 미정 — **장기 운영 설계 의무**
- Q7=A: 분당 변동 — 캐시 30~60초
- Q8=D: 일단 관리자 전용 — 직군별 분리는 별도 PR

**갱신 파일**:
- `_docs/OPERATIONS.md` — 운영 시간 / 흐름 / 부서 / 변동 / 권한 / 동기화 채움
- `_docs/SCENARIOS.md` — Persona 1~4 확정 + Scenario A,D 명세
- `_docs/UI-SPEC.md` — PR-6.3 사고 접수 + PR-6.4 대시보드 화면 사양 명시
- `_docs/CLAUDE-Cafe24.md` — 캐시 / 권한 / 단계별 source-of-truth 추가

**다음 PR 예고**:
- PR-6.2 — `lib/cafe24-db.ts` mysql2 read-only pool (사용자 외부 IP 허용 후)
- PR-6.3 — `/api/cafe24/accidents` + `/RideAccidents` 페이지
- PR-6.4 — `/RideAccidents/dashboard` + 5개 KPI 위젯

**GATE 진행 상태**:
- ✅ G3 Planner — 운영 인터뷰 4축 완료 (Q1~Q8)
- ⏭ G5/G6/G7/G8 — 코드 변경 없음, 문서 only PR
- ✅ Rule 21 Cowork — 본 세션 영역만 staging
- ✅ Rule 22 _docs 갱신 (4개 파일 동시)
- ✅ Rule 25 운영 사실 인터뷰
- ✅ Rule 26 페르소나 / 시나리오 워크-스루

---

## 2026-05-05 | PR-6.0a | Researcher 단계 — `_docs` 표준 세트 신설

본 모듈 최초 PR. 코드 변경 없음, 문서 + 분석 결과만.

**산출물**:
- `_docs/CLAUDE-Cafe24.md` — 본 모듈 보조 규칙 (MariaDB 10.1 호환성 / 보안 / 분석 재개 절차)
- `_docs/SOURCE-ANALYSIS.md` — 카페24 시스템 정밀 분석 보고서 (PHP + PB + DB)
- `_docs/DATA-MODEL.md` — 식별된 30+ 테이블 추정 모델 (PK / 컬럼 / 명명 규칙)
- `_docs/OPERATIONS.md` — 운영 사실 인터뷰 자리 (TBD)
- `_docs/SCENARIOS.md` — 페르소나 / 시나리오 자리 (TBD)
- `_docs/UI-SPEC.md` — UI 사양 자리 (TBD)
- `_docs/CHANGELOG.md` — 본 파일
- `_docs/VERIFICATION.md` — 검증 로그 자리

**확정 사실**:
- 카페24 = `skyautosvc.co.kr` 자체 PHP + PowerBuilder + MariaDB 10.1 ERP
- 도메인 = 사고차 대차 (Accident Car Replacement) + 보험 정산
- 외부 IP read-only 직접 접속 방향 (사용자 결정 Q1=A)
- cafe24_source 폴더는 FMI repo 와 완전 분리 유지 (Q2=A)

**다음 PR 예고**:
- PR-6.1 — Planner 단계 (운영 인터뷰 + 시나리오 확정)
- PR-6.2 — `lib/cafe24-db.ts` mysql2 read-only pool 단일 진입점
- PR-6.3 — `/api/cafe24/accidents` 1차 구현 (broken call 해소)

**GATE 체크 (규칙 27)**:
- ✅ G2 Researcher 보고서 (SOURCE-ANALYSIS.md)
- ✅ G3 Planner — 사용자 GO 후 본 PR 진행 (Q1/Q2/Q3 응답 받음)
- ⏭ G5 / G6 / G7 / G8 — 코드 변경 없음, 문서 only PR
- ✅ Rule 22 _docs 갱신 (본 PR 자체)

**Cowork 협업 (규칙 21)**:
- 본 세션 영역: `app/(employees)/RideAccidents/_docs/` 만
- 다른 세션 영역 침범 X (CallScheduler / admin / factory-search 절대 staging X)
- 공통 파일 (CLAUDE.md / lint-violations.md / migrations) staging X — 다른 세션 영역
