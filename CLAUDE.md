# FMI ERP (Self-Disruption) — Harness Engineering Orchestrator v3.0

> 새 세션이 시작되면 **반드시 이 파일과 HARNESS.md를 먼저 읽어라**.
> 이 규칙을 어기면 아키텍처 버그가 발생한다.

---

## 🌟 0-0. 새 cowork 세션 시작 시 (2026-05-09 — 필수)

> **다른 세션 작업물 흡수 사고 (Rule 21 위반) 4회 누적 후 신설.**
> 새 cowork 세션이 시작되면 **반드시 1회 실행** — 1초도 안 걸림.

```bash
git pull origin main           # 최신 hooks + 스크립트 받기
npm run cowork:init            # core.hooksPath 자동 설정 + 자가 진단
```

`cowork:init` 의 자동 동작:
- `core.hooksPath = harness-engineering/git-hooks` 설정 (모든 세션 공유)
- `pre-commit` / `pre-push` executable 권한 보장
- stale lock 검출 + 자동 제거 (5분 이상)
- 다른 세션 git config 오염 자동 복구 (hooksPath 다른 경로 가리킴 시 unset)

**효과**:
- 모든 cowork 세션이 같은 hooks 사용 (git pull 로 자동 갱신)
- cowork-staging-lint 가 매 commit 마다 자동 실행 → Rule 21 위반 자동 차단
- 다른 세션이 `git config` 오염시켜도 본 세션 자가 복구

수동 진단:
```bash
npm run cowork:check           # 진단만 (수정 X)
npm run cowork:fix             # 자동 수정 모드
```

### 🎨 페이지 디자인 표준 (2026-05-10 — 필독)

새 페이지 / 기존 페이지 수정 작업 시 **반드시**:

1. **`_docs/UI-DESIGN-STANDARD.md`** 정독 — 디자인 표준
2. **`/finance/settlement`** 페이지 참고 — 기준 동작 확인
3. **`DcStatStrip` / `DcToolbar`** 의무 사용
4. **`npm run lint:ui-design`** 으로 자가 검증

> 사용자 명시: 「정산 관리가 우리의 기준입니다. 다른 세션들이 하네스를 지키지만 다른 방향으로 나오고 있어서 강화 필요」
>
> 자세한 패턴은 본 파일 § 10 + `_docs/UI-DESIGN-STANDARD.md`

---

## 🚨 0-1. 강제 규제 조항 (NON-NEGOTIABLE — 2026-04-29 사용자 명령)

> **사용자가 토큰·시간을 무한 소모하는 사고가 반복되어 강제 규제 도입.**
> 이 조항은 우선 순위 최상위. CLAUDE.md의 다른 모든 항목보다 먼저 적용된다.

### 🔒 자동화 안전장치 (도입 완료 — 2026-05-02)

**평가 → 훅 → 기록 → 개선** 사이클이 매 commit 마다 자동 실행:

- `npm run lint:harness` — 4개 lint 통합 실행 (sql-lint / sql-fn-lint / api-call-trace / ui-data-coverage)
- `.git/hooks/pre-commit` — commit 시점 자동 호출 (`git commit --no-verify` 로 우회 가능 — 권장 X)
- `harness-engineering/knowledge/lint-violations.md` — 누적 위반 자동 기록
- baseline 패턴: 기존 issue 동결, 새 위반만 차단

규칙 11/12/13 의 "사전 검증 의무" 는 lint 가 자동 강제. 코드 작성 후 즉시 결과 확인 가능.

### 규칙 1 — 풀 파이프라인 강제 트리거

**다음 중 **하나라도** 해당하면 GATE 1~9 풀 파이프라인 강제 (Researcher → Planner → 사용자 승인 → Generator → Reviewer → Designer → Evaluator → Deployer → Documenter)**:

- 외부 API/LLM 호출 포함 (Gemini, OCR, 결제 API 등)
- DB 대량 UPDATE/INSERT (≥10건)
- 사용자 자원 소모 (토큰, 비용, 시간)
- 새로운 통합 패턴 (SMS, 엑셀, 외부 연동)
- 마이그레이션 필요
- 보안/인증 변경
- 루프/batch 처리 (재귀, while, 반복 호출)

### 규칙 2 — 즉답 허용 화이트리스트 (이외 전부 금지)

- 단일 파일 typo/문법 수정
- UI 텍스트/색상 변경 (글래스 시스템 내)
- 기존 패턴 그대로 적용한 단순 추가 (외부 호출 없음, 대량 쓰기 없음)
- 단순 조회/질문 (코드 변경 없음)

### 규칙 3 — 외부 LLM/유료 API 호출 시 추가 안전망

```
외부 API를 사용하는 모든 작업은 코드 작성 전 다음을 명시적으로 사용자에게 보고:

[A] 모델 quirk 조사 결과
   - gemini-2.5-*: thinking 기본 활성 → thinkingConfig: { thinkingBudget: 0 }
   - JSON 강제: responseMimeType: 'application/json'
   - response parts는 배열로 split 가능 → parts.map(p => p.text).join('')

[B] N=1 dry-run 결과 (실제 응답 raw 샘플)
   - rawTextSample, finishReason, usageMetadata 출력
   - 사용자 확인 후 본 작업 진행

[C] 루프/batch 안전망 2중
   1) DB write 기준 break: applied + below === 0 → 즉시 중단
   2) max batch limit (예: 50) → 최후의 보호
   3) gemini_debug 응답 노출로 0건 발생 시 원인 즉시 파악
```

### 규칙 4 — GATE 5 영향 검증 강제

```
커밋 직전 다음을 모두 보고하지 않으면 커밋 금지:

✓ 빌드 통과 (npx next build)
✓ 수정 파일을 import하는 파일 전체 빌드 확인
✓ 연관 페이지/API 동작 확인 (수정한 곳만이 아니라 영향받는 곳 전체)
✓ 사이드바/라우트 정합성 (system_modules ↔ ClientLayout ↔ 실제 파일)
```

### 규칙 5 — Push 전 필수 보고

```
git push 전, 사용자에게 다음 형식으로 보고:

📋 변경 요약
- 파일 N개, 추가 N줄, 삭제 N줄
- 핵심 변경: ...

🔬 검증
- 빌드: PASS / FAIL
- 영향 받은 파일/페이지: ...
- 외부 API: dry-run 결과 (있는 경우)

🚨 위험 요소
- 토큰 소모: 예상치 ...
- DB 쓰기: 예상치 ...
- 롤백 계획: ...

→ 사용자 승인 후 push
```

### 규칙 6 — UI 변경 시 GATE 7 Designer 강제 (v4 — 2026-04-30)

**다음 중 하나라도 해당하면 시각 검수 의무 — Chrome MCP 또는 사용자 스크린샷**:

```
✓ UI 컴포넌트 변경 (CSS, className, style, JSX 구조)
✓ 새 페이지/탭/모달 신설
✓ 색상/폰트/간격/배지/버튼 변경
✓ Decimal/금액 표출 변경 (콤마 실제 확인 필요)
✓ 사용자 키워드: "글씨", "색상", "디자인", "보이지", "안 보여", "시인성"
```

**시각 검수 절차 (필수)**:

```
1. Chrome MCP 연결 확인:
   - mcp__Claude_in_Chrome__tabs_context_mcp 호출 → 사용 가능 확인
   - 가능하면: navigate → screenshot → 분석
   - 안 되면: 사용자에게 "이 페이지 스크린샷 부탁드립니다" 명시 요청

2. 검수 항목 (체크리스트):
   ✓ 텍스트 contrast ratio ≥ 4.5 (배경 vs 글씨)
   ✓ 라벨/값 위계 명확 (label 약/value 강)
   ✓ 빈 상태 처리 (데이터 없을 때 안내 텍스트)
   ✓ 모바일 반응형 (옵션, 데스크톱 우선 OK)
   ✓ Glass 디자인 시스템 (§ 10) 준수

3. commit 메시지에 명시:
   "시각 검수: [Chrome MCP 통과 / 사용자 스크린샷 확인 / 미실시(사유)]"

4. "빌드 PASS = 검수 완료" 절대 금지 — 별개 영역
```

### 규칙 7 — 사용자 답변 해석 (v4)

```
"방향 확정" 키워드 (코드 작성 트리거 아님):
  - "옵션 N", "1번", "A로", "전부", "OK", "넵", "그렇게"
  → 응답: 상세 설계서 v2 작성 후 명시적 GO 키워드 대기

"구현 진행" 키워드 (코드 작성 트리거):
  - "구현 진행", "코딩하세요", "ㄱㄱ", "진행", "바로 가시죠", "해주세요"
  → 응답: Generator 진입 가능

모호하면 추측 금지 — "옵션 N으로 결정한 것이 맞나요?" 재확인.
```

### 규칙 8 — End-to-End 데이터 흐름 시뮬레이션 강제 (2026-04-30 신설)

> **2026-04-30 사건**: SMS 취소건 처리에 같은 영역 수정을 3차례 반복.
> 매번 표면만 고치고 다음 단계 영향을 안 봐서 발생.
> 비전문가 사용자가 매번 "안 돼요" 신고하는 부담을 떠안음.
> 이 규칙은 그 악순환을 구조적으로 차단한다.

**다음 중 하나라도 해당하면 코드 작성 전 End-to-End 시뮬레이션 의무**:

```
✓ SMS / Webhook / 외부 입력 파싱 변경
✓ 거래/통계/대시보드 표출 영향
✓ 외부 입력 → DB → UI 의 다단계 파이프라인
✓ 사용자가 한 번이라도 "안 돼요/안 보여요/이상해요" 보고한 영역
✓ batch / 대량 UPDATE 도구 신설/수정
```

**시뮬레이션 프로토콜** (코드 작성 전 보고 의무):

```
[STEP 0] 실제 사용자 데이터 샘플 1개 명시
   예: "[MY COMPANY] 취소 7109 석호민님 180,000원 일시불 (주)잠실에너지..."

[STEP 1] 파서 입력 → 출력 ParsedSms { ... }
   예: { type:'canceled', merchant:'(주)잠실에너지', card_alias:'법인****7109' }

[STEP 2] webhook → DB INSERT
   - card_sms_transactions 어느 컬럼에 무슨 값?
   - transactions 어느 컬럼에 무슨 값? type=expense or income?

[STEP 3] 표출 페이지의 필터/렌더링
   - bank-card 의 isCardTx() 통과? 어느 탭에 노출?
   - description 어떻게 표시? 색상?
   - 검색 키워드 매칭?

[STEP 4] 사용자 기대치 일치 검증
   - 각 단계 결과가 사용자가 화면에서 보고 싶은 것과 같은가?
   - 안 맞으면 어느 단계를 수정해야 하나?

[STEP 5] 영향 받는 다른 도구 시뮬레이션
   - 이 변경이 sms-recanceled / sms-excel-dedup 등 다른 도구에 영향?
   - 회귀 가능성 있는 영역 명시
```

**위 단계 모두 사용자에게 보고 후 GO 키워드 대기 → 구현 진입**.

### 규칙 9 — 회귀 케이스 자동 등록 (2026-04-30 신설)

```
사용자가 "안 돼요/이상해요/안 보여요" 라고 한 번이라도 보고한 케이스는
즉시 다음 위치에 기록:

  harness-engineering/regression-cases/{YYYY-MM-DD}-{slug}.md

내용:
  - input (실제 사용자 데이터, 익명화)
  - expected (사용자가 보고 싶은 결과)
  - actual_before_fix (실제 발생한 결과)
  - root_cause (3-Why 분석)
  - prevention (재발 방지 방안)

새 PR 작성 시 이 폴더 모두 mental dry-run 후 기존 케이스 깨지지 않는지 확인.
```

### 규칙 10 — Apply 후 자기 검증 의무 (2026-04-30 신설)

```
대량 UPDATE/INSERT 도구는 apply 직후 검증 단계 필수:

  1) "이 케이스가 실제로 기대 상태가 됐는가?" 검증 SQL 실행
  2) 검증 실패한 row 목록 + 진단 정보 응답에 포함
  3) UI alert 에 "검증: PASS N건 / FAIL M건" 명시
  4) FAIL 0건이 아니면 사용자에게 명시적 알림 + 원인

"applied 100건 / 검증 PASS" 처럼 두 단계로 보고해야 사용자가
실제로 동작했는지 알 수 있음.
```

### 규칙 11 — SQL 컬럼/API 경로 사전 검증 의무 (2026-05-01 신설)

> **2026-05-01 사건**: 같은 부류의 실수 3가지 반복 발생.
> ① 회의록 4차례 hotfix — 데이터 흐름 끝까지 안 따라감
> ② 카드 탭 표시 — `/list` API 만 수정하고 실제 사용 API `/finance-upload` 누락
> ③ profiles.full_name 잘못 가정 → SQL 1054 에러
>
> 이 규칙은 그 악순환을 차단한다.

**다음 중 하나라도 해당하면 코드 작성 전 사전 검증 의무**:

```
✓ 새 SQL 쿼리 (`$queryRaw` / `$queryRawUnsafe`) 작성/수정
✓ 새 LEFT JOIN / INNER JOIN 추가
✓ 새 API 엔드포인트 신설
✓ 기존 UI 의 데이터 표시 변경
✓ 새 컬럼/필드/별칭 참조
```

**검증 프로토콜** (코드 작성 전 보고 의무):

```
[A] SQL 컬럼명 검증
   1. prisma/schema.prisma 에서 모델 정의 직접 확인
   2. 또는 migrations/*.sql 에서 ALTER/CREATE 컬럼명 확인
   3. 사용 컬럼 목록을 보고서에 명시:
      예: "사용 컬럼: profiles.name (full_name 아님 — schema:29 확인)"
   4. 추측 금지 — 모르면 read 도구로 직접 조회

[B] API 사용처 추적
   1. 새 API 만들 때 어느 UI 컴포넌트에서 호출하는지 명시
   2. 기존 API 수정 시 grep 으로 모든 호출처 확인 후 영향 보고
   3. UI 데이터 변경 시 어느 API → 어느 SQL → 어느 컬럼인지 1:1 매핑 후 작업

[C] 데이터 흐름 끝점 검증
   1. UI 의 표시 컬럼 → API 응답 키 → SQL SELECT 컬럼 → DB 실제 컬럼
   2. 4단계 모두 일치 확인
   3. 불일치 발견 시 사용자에게 보고 후 작업
```

**위반 시 자동 페널티**:
- 같은 부류의 반복 실수 발생 → CLAUDE.md § 0-1 "위반 누적 횟수" 규칙 적용
- 3회 이상 같은 실수 → 시스템 차원 안전장치 도입 (예: SQL 컬럼 자동 검증 hook)

### 자동화 안전장치 (도입 완료 — 2026-05-02)

> **평가 → 훅 → 기록 → 개선** 사이클이 매 commit 마다 자동 실행.

```
✅ 1. SQL Linter (harness-engineering/scripts/sql-lint.js)
   - $queryRaw 안의 컬럼 참조를 schema.prisma + migrations 와 자동 대조
   - 미정의 컬럼 사용 시 commit 차단
   - baseline 패턴: 기존 issue 동결, 새 위반만 차단

✅ 2. API 호출 매핑 자동 탐지 (api-call-trace.js)
   - app/api/ 디렉토리 자동 스캔 → 라우트 인덱스
   - UI fetch URL 모두 추출 → 라우트 매칭
   - broken call (UI 호출 + 라우트 없음) 자동 감지

✅ 3. PR 체크리스트 자동화 (.git/hooks/pre-commit)
   - 매 commit 시 npm run lint:harness 자동 실행
   - 위반 발견 시 commit 차단 + lint-violations.md 자동 append
   - 강제 우회: git commit --no-verify (권장 X)

명령어:
   npm run lint:harness            # 전체 검증
   npm run lint:harness:report     # 정보성 (exit 0 강제)
   npm run lint:harness:baseline   # 현재 위반을 known issue 로 동결
   npm run harness:install-hook    # pre-commit hook 설치
```

### 규칙 12 — UI 화면별 데이터 정합성 자가 검증 (2026-05-01 신설)

> **2026-05-01 사건**: 사용자가 분류 검수 화면에서 취소/승인 구분 안 되어 분노.
> "검수한다고 해놓고 아무것도 체크 안 되고 그냥 화면만 표출하고있는데
>  그럼 오늘 하루도 다 날릴 생각이에요?"
>
> 카드 거래 탭만 sms_transaction_type 적용하고 분류 검수 화면은 누락.
> 같은 데이터의 다른 표출 화면들이 정합성 안 맞음.

**원칙**: 한 데이터를 표출하는 모든 UI 화면이 동일한 정보 보여야 한다.

**의무 절차** (UI 변경 또는 새 데이터 필드 추가 시):

```
[A] UI 화면 인덱스 확보
   1. 해당 데이터를 표출하는 모든 화면 grep 으로 전수 조사
   2. 예: sms_transaction_type 표출 → 카드 거래 / 통장 거래 / 분류 검수 / 미분류
   3. 모든 화면에 동일한 표출 적용 (한 곳만 수정 금지)

[B] 검수 시나리오 명시
   1. 사용자 관점: "이 화면에서 어떤 데이터 정합성을 검수할 수 있나"
   2. 미흡 시: 표출 강화 또는 진단 도구 추가
   3. 예: "취소 거래 vs 승인 거래" → 화면에 명확 구분 + 색상

[C] 데이터 중복 / 오염 자동 감지
   1. 같은 SMS / 같은 description+amount 가 여러 row → 진단
   2. type='income' 인데 description 에 환불 키워드 없음 → 의심
   3. 중요 화면에 "🔍 정합성 진단" 버튼 제공

[D] 사용자 검수 가능성 보장
   1. 사용자가 직접 데이터 정합성 확인할 수 있는 컬럼 / 라벨
   2. 빨강 / 노랑 색상으로 의심 row 강조
   3. 한 줄 보고도 "이게 취소인지 승인인지" 알 수 있어야

**위반 사례 (2026-05-01)**
- 카드 거래 탭: sms_transaction_type 활용 ✓
- 통장 거래 탭: 활용 ✓
- 분류 검수 화면: **누락 (3시간 후 사용자가 분노 후 발견)**
- 미분류 화면: 미확인 (다음 검사 대상)

**자동화 안전장치 (도입 완료 — 2026-05-02)**
```
✅ 4. UI 화면 데이터 정합성 인덱스 (harness-engineering/scripts/ui-data-coverage.js)
   - app/**/*.tsx 자동 스캔 → 필드 사용 인덱스
   - 같은 API 를 호출하는 page 그룹 비교 → 80%+ 사용하는데 1~2 page 누락 시 warning
   - 결과: harness-engineering/knowledge/ui-coverage.json (자동 생성)
   - 명령어: npm run lint:ui
```

### 규칙 13 — 외부 시스템 호환성 사전 검증 의무 (2026-05-01 신설)

> **2026-05-01 사건 (반복)**: 같은 날 외부 시스템 호환성 실수 2회 연속.
> ① profiles.full_name 추측 (1054 Unknown column)
> ② REGEXP_REPLACE MySQL 호환 미확인 (500 에러)
>
> 두 사건 공통점: "이 함수/컬럼이 존재할 것" 이라는 추측 후 코드 작성.
> 검증 단계 없이 푸시 → 사용자가 에러 보고 → 수정 → 또 다른 추측.

**다음 중 하나라도 해당하면 사용 전 호환성 검증 의무**:

```
✓ 새 DB 함수 사용 (REGEXP_REPLACE / JSON_TABLE / WINDOW 함수 등)
✓ 새 SQL 컬럼/테이블 참조
✓ 새 npm 라이브러리 import
✓ 새 외부 API 호출
✓ 환경 변수 / 설정 값 의존
```

**검증 프로토콜** (사용 전 보고 의무):

```
[A] DB 함수 호환성
   1. MySQL 버전 확인 (Cloud SQL = MySQL 8.x — package.json 또는 사용자 확인)
   2. 사용 함수의 도입 버전 확인 (예: REGEXP_REPLACE = 8.0+, JSON_TABLE = 8.0+)
   3. 미확실하면 "확인 후 사용" 또는 "단순 SQL 로 회피"
   4. 화이트리스트 (안전):
      · CONCAT, CONCAT_WS, COALESCE, IF, CASE WHEN
      · LEFT, RIGHT, SUBSTRING, INSTR, REPLACE
      · LENGTH, CHAR_LENGTH
      · DATE_FORMAT, DATE_SUB, DATE_ADD, NOW, CURDATE
      · ROUND, FLOOR, CEILING, MOD
      · COUNT, SUM, AVG, MAX, MIN, GROUP_CONCAT
   5. 회색 (검증 필요):
      · REGEXP_REPLACE (5.7 미지원, 8.0+)
      · JSON_TABLE (8.0+)
      · WINDOW 함수 (8.0+)
      · ROW_NUMBER, RANK (8.0+)

[B] 라이브러리 import
   1. package.json 에 이미 있으면 사용 OK
   2. 없으면: 추가 동의 받고 설치

[C] 외부 API
   1. 실제 호출 후 응답 구조 확인 (curl 또는 단발 fetch)
   2. 응답 샘플을 보고서에 명시

[D] try/catch 광범위 적용
   1. SQL/외부 호출 모두 try/catch 로 wrap
   2. 광범위 catch — 알려진 에러만 처리 X, 모든 에러 graceful fallback
   3. fallback 경로가 "더 단순" 해야 (의존성 적게)
```

**위반 사례 (2026-05-01)**

| 사례 | 사용 함수/컬럼 | 검증 누락 | 결과 |
|------|---------------|----------|------|
| profiles.full_name | profile.full_name | schema 확인 X | 1054 에러 |
| REGEXP_REPLACE | REGEXP_REPLACE | MySQL 버전 확인 X | 500 에러 |

**자동화 안전장치 (도입 완료 — 2026-05-02)**
```
✅ 5. SQL 함수 화이트리스트 (harness-engineering/scripts/sql-fn-lint.js)
   - $queryRaw 안 회색 함수 (REGEXP_REPLACE / JSON_TABLE / WINDOW 함수)
     사용 즉시 commit 차단
   - 정당한 사유 시 코드에 주석 추가:  // sql-fn-lint-allow: REGEXP_REPLACE
   - pre-commit hook 으로 자동 실행
   - 명령어: npm run lint:sql-fn
```

### 규칙 14 — 동형 패턴 자동 확장 의무 (2026-05-02 신설)

> **2026-05-02 사건**: 통장 last4 fallback 추가했는데 카드는 누락 → 사용자가 또 답답하게 발견.
> 같은 부류 사고 누적:
> - 5-01 SMS 취소 처리: 다른 도구 4번 영향
> - 5-01 분류 검수 sms_transaction_type: 카드만 적용, 통장/검수 누락
> - 5-02 last4 매칭: 통장만 적용, 카드 누락
>
> 공통 원인: 같은 부류의 영역이 여러 곳 있는데 **한 곳만 수정하고 나머지 빠뜨림**.

**다음 중 하나라도 해당하면 「같은 부류 영역 인덱스」 만들고 동시 적용 의무**:

```
✓ 새 헬퍼 함수 신설 (예: bankMappingJoinSql) — 사용처 모두 동시 적용
✓ DB 매핑 변경 (통장 ↔ 카드 ↔ 직원 등) — 모든 매핑 영역 검토
✓ UI 라벨 / 표시 로직 변경 — 같은 데이터 표출하는 모든 화면
✓ SQL JOIN / collation / 인덱스 — 같은 패턴 모든 쿼리
✓ SMS / 외부 입력 파서 — 발급사별 (KB / 우리 / 현대 / MyCompany / WooriBank / KBBank)
✓ 분류/검수 흐름 — 한 단계만 X 전체 흐름 (입력 → DB → UI → 검수)
```

**의무 절차** (코드 작성 전):

```
[A] 동형 영역 인덱스
   1. 변경 대상의 부류 명시 (예: "통장 매핑")
   2. 같은 부류 영역 grep / 코드베이스 전수 조사
      예: bankMappingJoinSql 만들면 → cardMappingJoinSql, employeeMappingJoinSql 도 필요한가?
   3. 영역 목록 보고서:
      "통장 매핑 last4 fallback → 카드 매핑도 같은 패턴 적용 필요 / 직원 매핑은 별개"

[B] 동시 적용 / 단계 분리 결정
   1. 한 commit 으로 묶기 (단순한 경우) 또는 별 commit (안전 분리)
   2. 사용자에게 "이번 작업이 영향 주는 다른 영역" 명시 보고
   3. GO 받고 진행

[C] 검수 — 같이 검수
   1. 한 영역 fix 후 다른 영역도 동작 확인
   2. 사용자 화면 검수 시에도 모든 영역 명시
```

**자동화 안전장치 (향후)**
```
🔜 6. 헬퍼 사용처 인덱스 lint
   - lib/last4-match.ts 의 export 함수 사용처 grep
   - 비슷한 영역 (예: card / bank / employee) 인덱스 생성
   - 새 헬퍼 만들면 비슷한 영역 모두 적용했는지 검증
   - 위치: harness-engineering/scripts/helper-coverage-lint.js (TBD)
```

### 규칙 15 — 반복 실수 자동 차단 (2026-05-02 신설)

> **사용자 명령**: "실수하고 재반복하게 된 부분은 하네스에 학습시켜 무조건 이후 동일 실수가 나오지 않도록 학습. 무조건 자동화."

**원칙**: 인간 주의력 (memo / 의지) 의존 X. 시스템 차원 강제 차단.

**같은 부류 실수가 N회 발생하면 즉시 자동화 도구 신설:**

| 실수 부류 | 자동화 대응 |
|----------|------------|
| SQL 컬럼 추측 (profiles.full_name, transactions.card_last4 등) | `sql-lint.js` — $queryRaw + lib/ helper SQL 모두 검증 ✅ |
| MySQL 회색 함수 (REGEXP_REPLACE) | `sql-fn-lint.js` ✅ |
| Collation mismatch | (TBD — `sql-collation-lint.js`) |
| 동형 패턴 한 곳만 fix | 규칙 14 + (TBD — `helper-coverage-lint.js`) |
| API 라우트 / UI fetch 불일치 | `api-call-trace.js` ✅ |
| 같은 데이터 다른 화면 누락 | `ui-data-coverage.js` ✅ |
| 답변에 SQL 적기 전 schema 추측 | (TBD — 답변 작성 워크플로우 self-check 강화) |

**적용 절차**:

```
실수 1회 발생:
  → harness-engineering/regression-cases/{date}-{slug}.md 자동 기록
  → knowledge/lint-violations.md 누적

실수 2회 발생 (같은 부류):
  → 사용자에게 "같은 부류 N회 발생 — 자동화 도입 제안" 보고
  → 자동화 hook 설계서 + GO 받기

실수 3회+ 발생:
  → 자동화 hook 즉시 신설 (사용자 명시적 사과 + 신설 commit)
  → CLAUDE.md 에 자동화 도구 등록
  → pre-commit hook 으로 자동 강제

실수 5회+ 발생 같은 부류:
  → 해당 작업 영역 "자율 개시 금지" — 사용자 명시적 지시만 수행
```

**오늘 (2026-05-02) 신설 자동화**:

```
[before commit ad37d3a] sql-lint $queryRaw 호출만 검증
[after  commit 4d2a8f4] cardMappingJoinSql 안 transactions.card_last4 컬럼 (실재 X)
                         → 카드 거래 화면 깨짐 (사용자 답답)

[hotfix 8dc3698] cardMappingJoinSql 안전화

[자동화 신설 — sql-lint 확장]
sql-lint 가 lib/*.ts 안 SQL helper 함수 (이름 *Sql 끝) 검사:
- 추출된 column 이 schema 의 어느 테이블에든 있는지 확인
- 없으면 즉시 violation
검증: lib/_test-helper.ts 의 nonexistent_col_xyz → ❌ 차단 확인
```

**2026-05-03 신설 자동화 (lint extractTemplateBlocks 강화)**:

```
사고: summary API 의 GROUP BY cat (alias) → 1055 only_full_group_by 위반
     → API 500 → frontend 「분류 검수 0」 표시 (데이터 안 잃었지만 화면 panic)

원인 분석:
- sql-group-by-lint 의 extractTemplateBlocks regex:
    /\$(?:queryRaw|executeRaw)(?:Unsafe)?(?:<[^>]*>)?\s*`/
- $queryRawUnsafe<T>(`...`) 패턴: ( 가 끼어있어서 backtick 매칭 fail
- 즉 Unsafe 호출의 SQL 은 lint 가 추출 못함 → 검사 skip → 사고 통과

[자동화 신설 — 두 lint 동시 강화]
1. sql-group-by-lint extractTemplateBlocks:
   - regex \s*\(?\s*` — 선택적 ( 허용
   - Unsafe 호출의 backtick template 도 추출
2. sql-reserved-alias-lint extractSqlBlocks:
   - ( ) 형식 처리 분기 — 다음 글자가 backtick 이면 template 으로 캡처
   - 변수 인자 ($queryRawUnsafe(query, ...)) 는 skip 유지

검증:
- 임시 _test-gb-unsafe.ts 의 GROUP BY alias → ❌ 차단 ✓
- 임시 _test-alias-unsafe.ts 의 AS desc → ❌ 차단 ✓
```

### 규칙 16 — 시간 걸리는 작업은 플로팅 진행률 의무 (2026-05-02 신설)

> **사용자 명령**: "AI 진행 관련은 공통컴포넌트로 진행율 표출. 시간도 걸리니 플로팅화."

**다음 중 하나라도 해당하면 `AIProgressFloater` 의무 사용**:

```
✓ AI/LLM 호출 (Gemini, OpenAI 등)
✓ batch loop (≥10건 처리)
✓ DB 대량 INSERT/UPDATE
✓ 1초+ 걸리는 작업
✓ webhook polling
```

**금지 패턴**:
- ❌ alert("진행 중...") — 비동기 동작 끊김
- ❌ inline progress bar 매번 새로 작성 — 중복

**올바른 패턴** (app/components/AIProgressFloater.tsx):
```ts
const { start, update, finish } = useAIProgress()
const taskId = start({ title: '🤖 AI 분류', total: 304 })
update(taskId, { processed: 50, applied: 30 })
finish(taskId, '✅ 완료 — 285건 적용')
// 5초 후 자동 사라짐
```

전역 mount: `app/components/auth/ClientLayout.tsx` 의 AIProgressProvider.

### 규칙 17 — 모듈 폴더 분리 + import 경계 (2026-05-02 신설, 다른 AI 검수 반영)

> **외부 AI 검수**: "Next.js 자체 안정. 진짜 걱정은 프로젝트 구조 — 1년 후 본인도 어디 뭐 있는지 못 찾음."
>
> **바이브 코딩 함정**:
> - 기능 추가 시 한 폴더에 쌓임
> - 모듈 간 경계 흐려짐 (가계부 코드가 렌터카 import)
> - 공통 컴포넌트 중복 생성 (Button 3개)

**규칙**:

```
[A] 모듈 폴더 분리
   향후 신규 모듈은 route group 으로 분리:
   app/(admin)/finance/      ← 가계부 ERP
   app/(admin)/rental/       ← 렌터카 ERP (예정)
   app/(admin)/charger/      ← 충전기 ERP (예정)
   app/(public)/cars/        ← 고객용 차량 페이지
   app/(public)/booking/     ← 고객용 예약

[B] 모듈 간 import 금지
   - 가계부에서 렌터카 import X
   - 공통은 components/, lib/ 로만
   - DB: finance_*, rental_*, charger_* prefix 통일

[C] Claude 한테 시킬 때 모듈 명시
   ❌ "카드 추가 기능 만들어줘"
   ✅ "가계부 모듈 (app/finance) 에 카드 추가 기능 만들어줘"

[D] 공통 컴포넌트 폴더 미리 정해두기
   app/components/ — UI 공통 (NeuDataTable, AIProgressFloater 등)
   lib/ — 유틸/헬퍼 (last4-match.ts 등)
   매번 새로 만들지 말고 "기존 components/ 안에 있는 거 먼저 써라"
```

**자동화 안전장치 (TBD)**:
```
🔜 7. module-import-lint.js (계획 중)
   - app/(admin)/finance/ 안에서 app/(admin)/rental/ import 시 차단
   - 공통은 app/components/, lib/ 로만 허용
   - 위반 시 commit 차단
```

**현재 상태 (2026-05-02)**:
- ⚠️ app/finance/, app/cars/, app/admin/ — 평면 구조 (route group 미적용)
- ⚠️ DB prefix 일관성 없음 (cars, transactions, bank_account_mappings 등)
- 🔜 향후 별도 작업 — route group 마이그레이션 + DB prefix 정리

### 규칙 18 — 테이블 모든 컬럼에 정렬 의무 (2026-05-02 신설)

> **사용자 명령**: "정렬을 모든 항목 다 적용해줘야지 날짜만.... 그리고 모든 규정에 정렬기능은 항목에 넣는것으로 규정"

**원칙**: NeuDataTable 컴포넌트의 모든 컬럼에 `sortBy` 함수 의무 정의.

```
✓ 모든 컬럼에 sortBy: (row) => string|number|Date 정의
✓ 기본 정렬: defaultSort={{ key: 'date', dir: 'desc' }} (시간순) 권장
✓ 헤더 클릭 시 toggle (asc ↔ desc)
✓ '액션' 같은 sortable 의미 없는 컬럼만 예외 (sortBy 미정의 OK)
```

**금지 패턴**:
- ❌ 일부 컬럼만 sortBy — 사용자가 정렬 시도해도 동작 안 함 → 답답
- ❌ 자동 정렬 없는 표 — 사용자가 매번 스크롤로 찾음

**예시** (통장/카드 거래 테이블):
```ts
const cardColumns: TableColumn<Transaction>[] = [
  { key: 'date', sortBy: (r) => new Date(r.transaction_date).getTime(), ... },
  { key: 'card', sortBy: (r) => `${r.card_company || ''} ${r.card_alias || ''}`, ... },
  { key: 'merchant', sortBy: (r) => r.sms_merchant || r.description || '', ... },
  { key: 'amount', sortBy: (r) => Number(r.amount || 0), ... },
  { key: 'tx_status', sortBy: (r) => r.sms_transaction_type || '', ... },
  { key: 'matched', sortBy: (r) => r.matched_car_number || r.matched_holder_name || '', ... },
  ...
]
<NeuDataTable columns={cardColumns} defaultSort={{ key: 'date', dir: 'desc' }} ... />
```

**금액 표시 규칙 (운영 모델 — 절대 규칙)**:

```
🔴 + 부호: 절대 사용 금지 (사용자 명령)
🔴 - 부호: 카드 취소만 사용
🔴 색상: type/transaction_type 으로 의미 표현
   · 카드 승인 → 검정 (부호 X)
   · 카드 취소 → 빨강 (- 부호)
   · 통장 입금 → 녹색 (부호 X — 컬럼 자체가 의미)
   · 통장 출금 → 빨강 (부호 X — 컬럼 자체가 의미)
```

**위반 사례 누적 (2026-05-02)**:
- 카드 거래 탭 — `+` 부호 → 제거
- 통장 입금 컬럼 — `+` 부호 → 제거
- 분류 검수 행 — `+` 부호 → 제거 (3차 fix)

**자동화 (TBD)**: amount-sign-lint.js — `'+' :` / `'-' :` 패턴 발견 시 경고

**적용해야 할 모든 화면 (동형 패턴 인덱스 — 규칙 14)**:
- 카드 거래 탭 amount 컬럼 ✓
- 통장 거래 탭 deposit/withdrawal 컬럼 ✓
- 분류 검수 박스의 거래 행 ✓
- 미분류 탭의 거래 행 (확인 필요)
- 정산 연결 탭 (확인 필요)
- 모바일 카드 trailing ✓
- 카테고리별 거래 목록 (확인 필요)

**자동화 안전장치 (TBD)**:
```
🔜 8. table-sort-coverage-lint.js — 컬럼 sortBy 누락 감지
   - NeuDataTable 의 모든 columns 정의에 sortBy 있는지 검사
   - '액션', '✂️' 같은 의미 없는 컬럼은 화이트리스트
   - 위반 시 commit 차단
```

### 규칙 19 — 줄바꿈 최소화 + 화면 자리 절약 의무 (2026-05-02 신설)

> **사용자 명령**: "세상에서 줄바꿈이 젤 보기싫은데 이것도 하네스 적용 줄바꿈 최소화"

**원칙**: 테이블/리스트의 셀은 **한 줄 표시 우선**.

```
✓ 셀: white-space: nowrap (가능하면)
✓ 정보가 너무 많으면 → 별도 컬럼으로 분리, 줄바꿈 X
✓ 컬럼 너비는 컨텐츠 길이에 맞게 — width 명시
✓ 매칭 라벨 등은 한 줄에 (icon + 핵심 정보)
```

**금지 패턴**:
- ❌ <div>제목</div><div>부제목</div> (줄바꿈)
- ❌ 한 셀에 2~3줄 정보 (예: 차량번호 + 모델 + 상태)
- ❌ 의미 없는 라벨 자리 차지 (예: 「미매칭」 노란 라벨이 모든 행)

**올바른 패턴**:
- ✅ <span style={{ whiteSpace: 'nowrap' }}>🚗 47하9604</span>
- ✅ 매칭 안 된 row 만 작은 점 아이콘 (예: 6×6 빨간 점)
- ✅ 핵심 정보만 — 회사 이름, 잔액, 미사용 컬럼 제거

**자리 절약 우선순위**:
1. 의미 중복 정보 제거 (예: 회사 통장 → "회사 이름" 빼기)
2. 거의 없는 데이터 컬럼 제거 (예: 잔액 — 데이터 없으면 빼기)
3. 매번 같은 라벨 반복 → 작은 아이콘으로 대체

**자동화 (TBD)**:
```
🔜 9. ui-newline-lint.js — 셀 안 <div> 2개 이상 자동 감지
   - TableColumn 의 render 안 줄바꿈 패턴 발견 시 경고
   - 화이트리스트: 모달 / 카드 / 리스트 컨텐츠 영역
```

### 규칙 20 — 결과 메시지 UI 의무 (2026-05-03 신설)

> **사용자 명령**: "결과 메시지도 UI 적용해줘야지 기계적인 메세지창같은건 ERP수준을 떨어뜨리는일같은데"

**원칙**: alert / confirm / 기계적 메시지 박스 최소화. 작업 결과는 **글래스 디자인 패널** 로.

**금지 패턴**:
- ❌ 작업 완료 시 alert(`✅ N건 적용 / 실패 M건...`) — 블로킹 + 못생김
- ❌ console.log 만으로 결과 표시 (사용자 console 안 봄)
- ❌ 기계적 박스 (border 단순 / 색상 무신경)

**올바른 패턴**:
- ✅ 결과를 React state 로 저장
- ✅ 분류 검수 / 매칭 검수 등 적절한 탭에 글래스 패널 (Glass L3/L4) 로 표시
- ✅ 사용자가 「× 닫기」 가능
- ✅ 다음 권장 작업 자동 제시 (예: 「매핑 관리에서 카드 할당 먼저」)
- ✅ 진행 중에는 AIProgressFloater (규칙 16)
- ✅ 실패는 빨간 글래스 / 성공은 녹색 / 중립은 백색

**예시** — 풀 자동 매칭 결과 패널:
```tsx
{fullMatchResult && (
  <div style={{ ...GLASS.L4, border: 'rgba(124,58,237,0.3)', borderRadius: 12 }}>
    <div>🔮 풀 자동 매칭 결과 <시간></div>
    <button>× 닫기</button>
    <Grid>
      <Card ok={true} applied={5} total={875}>차량(last4)</Card>
      ...
    </Grid>
    <NextActionHint>📌 매핑 관리에서 카드 할당 먼저</NextActionHint>
  </div>
)}
```

**적용해야 할 모든 화면 (동형 패턴 인덱스 — 규칙 14)**:
- 풀 자동 매칭 결과 ✓ (5/3 적용)
- 룰 자동 분류 결과 ✓ (이미 글래스 패널 — HIGH/MEDIUM/LOW 박스)
- AI 분류 검수 결과 (확인 필요 — 현재 alert)
- 차량 매칭 결과 (runCarMatch — 현재 alert)
- 일괄 확정 결과 (현재 floater finish 만 — OK)
- backfill 정리 결과 (이미 floater)
- 통장 거래 재생성 (현재 floater)

**자동화 안전장치 (TBD)**:
```
🔜 10. ui-alert-lint.js — alert(...) 호출 패턴 차단
   - 단순 알림 (ok 버튼만) alert 는 글래스 토스트로 대체 권장
   - confirm 은 dialog component 로 대체 권장
   - 화이트리스트: 진짜 confirm 필요한 경우 (data-loss 위험 등)
```

### 규칙 21 — Cowork 멀티 세션 협업 (2026-05-03 신설, 2026-05-10 강화)

> **사용자 명령** (2026-05-10): 「다른 세션에서 자꾸 커밋 배포 문제가 나는데 조율할 수 있는 기준이 없을까?」
> 동시에 여러 코워크 세션이 같은 git repo 작업 시 conflict / 침범 회피 의무.
> 코워크 세션은 같은 workspace 폴더를 공유하므로, 한 세션의 commit 은 다른 세션 디스크에 즉시 반영됨.
>
> **상세 조율 가이드**: `_docs/SESSIONS-COORDINATION.md`
>   - 모듈 ↔ 세션 매핑 표 (자율 commit 영역)
>   - 공통 파일 합의 프로토콜 (변경 전 사용자 사전 보고)
>   - 충돌 처리 절차
>
> **공통 파일** (`app/components/PageTitle.tsx`, `lib/menu-registry.ts`, `prisma/schema.prisma` 등):
>   - 변경 전 사용자에게 사전 보고 의무
>   - GO 받기 전 commit 금지
>   - 작은 단위 별도 commit (모듈 파일과 섞지 X)
>
> **모듈 영역** (`app/finance/*`, `app/(employees)/CallScheduler/*` 등):
>   - 해당 세션만 자율 commit
>   - 다른 세션 모듈 직접 수정 금지 (요청 시만)

**다음 중 하나라도 해당하면 협업 모드 발동**:

```
✓ 사용자가 「다른 코워크에서 작업중」 명시
✓ git status 에 자기 영역 외 modified/untracked 파일 보임
✓ prisma/schema.prisma / ClientLayout.tsx 같은 공통 파일이 modified
✓ 같은 시각 다른 세션이 동일 repo 진행 중인 정황
```

**작업 절차** (코드 작성 / staging 전 의무):

```
[A] 작업 영역 인덱스 (코드 작성 전)
   1. 자기 작업 영역 명시 (예: app/CallScheduler/, app/api/call-scheduler/)
   2. 다른 세션 영역 식별 — git status untracked 중 자기 영역 외 모두
   3. 공통 파일 (schema.prisma / ClientLayout.tsx / migrations 등) 정리 책임 합의
      → 사용자에게 "어느 세션이 정리할지" 확인 의무
   4. 보고서:
      "본 세션 staging:  app/X/ + 공통 파일 N
       다른 세션 영역:    app/Y/ — 절대 staging X"

[B] staging 원칙
   1. ❌ git add . / git add -A 절대 금지 — 다른 세션 작업물 침범
   2. ✅ 명시적 폴더 add — git add app/CallScheduler/ app/api/call-scheduler/ 등
   3. 공통 파일은 합의된 세션만 staging
   4. git status 결과 사용자 보고:
      - staged 목록 (자기 영역만)
      - unstaged 목록 (안 건드림)
      - untracked 목록 (다른 세션 영역 — 절대 안 건드림)

[C] 순차 push (병렬 push 회피)
   1. 한 세션이 push 끝날 때까지 다른 세션은 commit 만 준비, push 대기
   2. 두 번째 세션은 git status 로 첫 번째 commit 반영 확인 후 push
   3. conflict 시: git checkout HEAD -- <공통파일> 로 main 우선 + 자기 영역만 다시 add

[D] 사용자 보고 의무 (CLAUDE.md 규칙 5 보강)
   1. 어느 파일 staging 했는지 명시
   2. 어느 파일은 다른 세션 영역이라 안 했는지 명시
   3. 공통 파일 (schema.prisma 등) 누가 정리하는지
   4. 마이그레이션 SQL 누가 실행할지 결정 (보통 사용자 직접)
```

**금지 사항**:
- ❌ git add . / git add -A — 다른 세션 작업물 침범 위험
- ❌ 공통 파일 임의 수정 후 commit — 다른 세션과 충돌
- ❌ 다른 세션 작업 영역 (Untracked 폴더) 자기 commit 에 포함
- ❌ 다른 세션 push 안 끝났는데 force push / 동시 push
- ❌ **`git commit --no-verify` 절대 사용 X** (2026-05-06 2차 사고 후 강화)
   - cowork-staging-lint 차단 시 hook 우회 절대 금지
   - 차단 메시지 보고 → 사용자 보고 후 → `git reset HEAD` + 자기 모듈만 add → 재 commit
   - 의도적 cross-module: `COWORK_ALLOW_MULTI_MODULE=1` 환경변수만 사용
- ❌ **다른 세션 active 시 staging 시도 X** (2026-05-06 2차 사고 후 강화)
   - lock 자주 발생하면 다른 세션 commit 진행 중 신호
   - 1~3분 자연 해제 대기 후 자기 영역 add 진행
   - 사용자에게 "다른 세션 작업 끝남" 확인 후 진행
- ❌ **`git reset --hard <ref>` 절대 사용 X** (2026-05-26 P3+a 분실 후 강화)
   - 다른 세션 unpushed commit 을 lineage 에서 떨어뜨려 영구 분실 위험
   - 분실 사고: 2026-05-26 PR-MULTI-BRAND P3+a (50556a2) 가 다른 세션의
     `git reset --hard origin/main` 으로 main 에서 분리 → 재커밋 필요
   - 의도된 hard reset 은 사용자 명시 GO 후만, push 한 commit 만 대상

**commit 즉시 push 의무 (2026-05-26 PR-COORD-10)**:
unpushed 상태로 두면 다른 세션 reset --hard 에 분실 노출. 따라서:
- commit 직후 같은 세션 안에서 push (다음 작업 시작 전).
- batch (2~3 commit 묶음) 도 5분 내 push 종결.
- `cowork-reflog-integrity` (harness-lint [3.11]) 가 분실 commit 사후 탐지.
  분실 후 회복: `git cherry-pick <sha>` 또는 파일 재생성 + 재커밋.

**🔒 cowork-commit 의무 (2026-05-26 PR-COORD-11 신설 — 모든 세션 채택)**:

shared-index race 로 commit 메시지/내용 mismatch 사고 (2026-05-26: 96e9534)
재발 방지. `flock(2)` 기반 OS 락으로 stage·commit·push 파이프라인 전체 직렬화.

**모든 cowork 세션은 raw `git commit/push` 대신 본 래퍼 사용**:
```bash
npm run cowork:commit -- '커밋 메시지' -- <pathspec...>
# 예: npm run cowork:commit -- '[hotfix] fix' -- lib/foo.ts app/bar.tsx
```

동작:
1. `.git/cowork-pipeline.lock` 에 `flock -w 600` (최대 10분 대기 — 다른 세션 작업 종료 대기)
2. 락 잡힌 동안: `git add <pathspec>` → cowork-staging-lint → `git commit -- <pathspec>` (atomic)
3. 락 잡힌 동안: push (non-fast-forward 시 자동 `pull --rebase` + retry)
4. 락 자동 해제 (스크립트 종료 시 fd 닫힘)

**이점**:
- 다른 세션이 락 보유 중이면 본 세션은 자동 대기 (시간 단위 폴링 불필요 — flock 이 OS 차원 대기).
- pathspec 강제 → 다른 세션 staged 파일 흡수 0 (`git commit -- <pathspec>` 가 그것만 commit).
- pull --rebase 자동 → behind 시 수동 개입 0.

**한계**: 모든 세션이 본 래퍼 사용해야 효력. raw `git commit` 쓰는 세션은 락 무시 — CLAUDE.md § 21 규칙으로 모든 세션 채택 권장.

**🔖 Cowork-Session trailer + push 차단 (2026-05-27 PR-COORD-12)**:

shared lineage 에 다른 세션 unpushed commit 이 있으면 push 시 piggy-back 되어
중복/충돌 발생. cowork-commit.sh 가:
1. 세션 ID 자동 추출 (`/sessions/<id>/...` 경로) → commit message 끝에 trailer:
   ```
   Cowork-Session: sweet-amazing-galileo
   ```
2. push 직전 `git log origin/main..HEAD` 스캔 → 다른 세션 tagged commit 발견 시 차단.
3. legacy untagged commit 은 통과 (점진 migration).

차단 시 조치:
- 해당 세션 push 완료 대기 → `git pull --rebase origin main` → 재시도.
- 의도적 piggy-back: `COWORK_ALLOW_PIGGYBACK=1 npm run cowork:commit -- ...`

**자동화 안전장치 (도입 완료 — 2026-05-06)**:
```
✅ 11. cowork-staging-lint (harness-engineering/scripts/cowork-staging-lint.js)
   - git diff --cached --name-only 로 staged 파일 추출
   - 모듈 라벨 매핑:
     · app/(employees)/<X>/ → 모듈 X
     · app/(admin)/<X>/    → 모듈 X
     · app/api/<X>/         → api:X
     · app/<X>/             → 모듈 X (top-level)
     · lib/<X>-*.ts         → lib:X (모듈 전용)
   - 화이트리스트 (_common/_harness/_db/_root) 외 실제 모듈 라벨 ≥ 2 → commit 차단
   - 우회 (의도적 cross-module): COWORK_ALLOW_MULTI_MODULE=1 git commit ...
   - harness-lint.js 의 [3.7] sub-lint 로 자동 통합 → pre-commit hook 자동 실행
   - 회귀 케이스: harness-engineering/regression-cases/2026-05-06-cowork-staging-violation.md
   - 트리거 사고:
     · 1차 (2026-05-06 새벽): RideAccidents PR-6.3.c 가 CallScheduler PR-2SS 1,407 라인 흡수
     · 2차 (2026-05-06 저녁): PR-B10 프리랜서 엑셀 commit 이 CallScheduler PR-2SS-h-1-fix 233 라인 흡수
   - 한계: --no-verify 사용 시 hook 우회 — CLAUDE.md 규칙 21 금지 항목 강화로 보강

✅ 12. cowork-reflog-integrity (harness-engineering/scripts/cowork-reflog-integrity.js)
   - git reflog 의 `commit:` 항목 SHA 수집
   - 각 SHA → HEAD 도 origin/main 도 도달 불가 → 분실 후보로 알림
   - 다른 세션 `git reset --hard origin/main` 등으로 본 세션 unpushed
     commit 떨어진 사고 사후 탐지
   - harness-lint.js [3.11] sub-lint 로 자동 통합 (정보성 — 빌드 안 막음)
   - 회복: 출력된 SHA 로 `git cherry-pick <sha>` 또는 파일 재생성 + 재커밋
   - 트리거 사고 (2026-05-26):
     · 다른 세션 reset --hard 로 PR-MULTI-BRAND P3+a (50556a2) 분실 →
       재커밋 2be9843 로 회복. 이후 자동 탐지 위해 본 lint 신설.
```

### 규칙 22 — 모듈 _docs 갱신 의무 (2026-05-04 신설, 강력)

> **본 세션 사고 (2026-05-04)**: PR-2A 부터 PR-2Z 까지 14개 PR 진행하면서 모듈
> `_docs/` 갱신을 일괄 빠뜨림. V2-RESTRUCTURE.md 의 PR 체크 상태 옛날 그대로,
> 신규 데이터 모델·UI 변경이 _docs 에 반영 안 됨 → 운영 회고 / 다른 세션 인계 어려움.

**원칙**: **PR 코드 변경 = _docs 갱신 한 세트**. 코드만 변경하고 _docs 안 건드리면 위반.

**다음 중 하나라도 해당하면 _docs 갱신 의무**:

```
✓ 새 마이그레이션 SQL 추가 → _docs/DATA-MODEL.md 갱신
✓ 새 API 라우트 → _docs/API.md 또는 모듈 README 갱신
✓ 새 UI 페이지/모드/컴포넌트 → _docs/UI-SPEC.md 갱신
✓ 운영 사실 / 도메인 규칙 변경 → _docs/OPERATIONS.md 갱신 (없으면 신설)
✓ 새 PR 종료 → _docs/CHANGELOG.md (없으면 신설) 한 줄 이상 추가
✓ 페르소나/시나리오 변경 → _docs/SCENARIOS.md 갱신
```

**필수 파일 (모듈 _docs/ 표준 세트)**:
```
app/<Module>/_docs/
├─ CLAUDE-<Module>.md     본 모듈 한정 보조 규칙
├─ DATA-MODEL.md           테이블/컬럼/관계
├─ UI-SPEC.md              레이아웃/컴포넌트/페르소나
├─ OPERATIONS.md           운영 사실 (24/365 등)
├─ SCENARIOS.md            페르소나별 흐름 시나리오
├─ CHANGELOG.md            매 PR 한 줄 (날짜 + PR 코드 + 한 줄 요약)
├─ V2-RESTRUCTURE.md       (선택) 큰 재구성 설계
└─ VERIFICATION.md         lint/빌드 검증 로그
```

**자동화 (TBD)**:
```
🔜 12. docs-coverage-lint.js — 코드 변경 PR 에 _docs 변경 없으면 경고
   - migrations/* 신규 → DATA-MODEL.md 갱신 검증
   - app/<Module>/api/ 신규 → 모듈 _docs 갱신 검증
   - app/<Module>/components/ 신규 → UI-SPEC.md 갱신 검증
   - 위치: harness-engineering/scripts/docs-coverage-lint.js (TBD)
```

### 규칙 23 — 마이그레이션 SQL 적용 검증 (2026-05-04 신설)

> **본 세션 사고**: cs_holidays, cs_leaves, cs_swap_requests, cs_leave_quotas 등
> 새 마이그레이션 만들고 UI 까지 같이 진행했는데, 사용자가 SQL 적용 안 한 상태에서
> 화면이 500 에러로 깨짐. 사용자 시각 검수 시 작업 정상 동작 확인 못 함.

**다음 중 하나라도 해당하면 의무**:

```
✓ 새 마이그레이션 SQL 파일 생성
✓ 기존 테이블에 컬럼/인덱스 추가하는 ALTER
✓ 기존 시드 변경 또는 추가
```

**의무 절차**:

```
[A] 마이그레이션 만들 때 즉시 사용자에게 적용 안내
   "다음 SQL 을 DBeaver/CLI 에서 실행 후 진행:
    mysql -h ... < migrations/YYYY-MM-DD_xxx.sql"
   적용 확인 받기 전 UI 까지 만들지 말 것 (또는 만들더라도 시각 검수 보류)

[B] API 라우트 측 graceful fallback
   try {
     const rows = await prisma.$queryRaw`SELECT ... FROM cs_xxx ...`
   } catch (e) {
     // 테이블 미적용 시 빈 배열 반환 + 에러 로그만
     return NextResponse.json({ data: [], error: null, _migration_pending: true })
   }
   → UI 에서 _migration_pending 받으면 "⚠ 마이그레이션 미적용" 배너 표시

[C] 멱등 적용
   IF NOT EXISTS / @col_exists 체크 패턴으로 여러 번 실행 안전성 보장 (이미 패턴화)

[D] 검증 SQL 같이 제공
   매 마이그레이션 파일 하단에 검증 SELECT 주석으로 포함
   -- 검증: SELECT COUNT(*) FROM cs_xxx; -- 기대치 N
```

### 규칙 24 — 시드 데이터 멱등성 의무 (2026-05-04 신설)

> **본 세션 사고**: 사용자가 cs_workers 마이그레이션을 여러 번 적용 → 16명 시드가
> 3중복으로 48 row → 자동 생성 시 박혜정 한 명에 31일 모두 배정되는 등 운영 마비.

**모든 시드 INSERT 는 다음 중 하나로**:

```
[A] INSERT IGNORE (UNIQUE 제약 필요)
   INSERT IGNORE INTO cs_workers (id, name, ...) VALUES (UUID(), '박지훈', ...);
   → 테이블에 UNIQUE KEY (name) 또는 비즈니스 키 명시 필수

[B] ON DUPLICATE KEY UPDATE
   INSERT INTO cs_workers (id, name, ...) VALUES (UUID(), '박지훈', ...)
   ON DUPLICATE KEY UPDATE updated_at = NOW();

[C] NOT EXISTS 가드
   INSERT INTO cs_workers (...)
   SELECT UUID(), '박지훈', ... FROM dual
   WHERE NOT EXISTS (SELECT 1 FROM cs_workers WHERE name = '박지훈');
```

**시드 대상 테이블에 비즈니스 UNIQUE 키 의무**:
- cs_workers: `UNIQUE KEY uq_cs_worker_name (name)` (동명이인은 별칭 사용)
- cs_shift_slots: `UNIQUE KEY uq_cs_slot_code (code)` (이미 적용)
- cs_shift_groups: `UNIQUE KEY uq_cs_group_name (name)` (TBD)
- ride_employees: 동명이인 가능 → `UNIQUE (name, hire_date)` 같은 복합

**자동화 (TBD)**:
```
🔜 13. seed-idempotency-lint.js — 마이그레이션 SQL 안 INSERT 검사
   - 'INSERT INTO ... VALUES' 만 있고 IGNORE / ON DUPLICATE / NOT EXISTS 없으면 차단
   - 시드 대상 테이블에 UNIQUE KEY 없으면 경고
```

### 규칙 25 — 도메인 운영 사실 우선 인지 (2026-05-04 신설)

> **본 세션 사고**: 24/365 콜센터 운영이라는 핵심 사실을 처음에 놓침.
> cs_holidays.exclude_auto 디폴트가 true 였고, 패밀리데이를 회사 휴일로 분류하는 등
> 데이터 모델이 잘못 잡혔다가 후반에 큰 폭으로 재구성.

**새 모듈/기능 시작 전 의무 질문 (운영 사실 인터뷰)**:

```
[A] 운영 시간
   "이 모듈은 24/365 운영인가, 9-18 사무 시간인가?"
   "공휴일에도 누군가 일하나? 아니면 회사 전체 휴무?"

[B] 부서/그룹 차이
   "콜센터·영업·관리 등 부서마다 다른 패턴인가?"
   "같은 시프트라도 직원마다 다른 휴일 적용 가능한가?"

[C] 마스터 데이터 변동
   "직원이 자주 추가/퇴사되는가?"
   "시프트 시간대가 자주 변경되는가?"

[D] 권한 차이
   "매니저/직원이 보는 데이터가 다른가?"
   "직원이 본인 외 다른 사람 일정도 볼 수 있나?"
```

**답변을 _docs/OPERATIONS.md (또는 SOURCE-ANALYSIS.md) 에 기록 의무**.
이 문서가 데이터 모델 / 디폴트 값 / 자동 로직의 근거.

### 규칙 26 — 페르소나·시나리오 사전 워크-스루 (2026-05-04 신설)

> **본 세션 사고**: 처음에 "캘린더 그리드 한 화면" 만 만들고 작성자 vs 직원 분리,
> 휴가 발급량, 시프트 교체 요청 등이 빠짐. 사용자 운영하면서 추가 피드백 → 큰 폭 변경 누적.

**새 모듈 설계 전 _docs/SCENARIOS.md 작성 의무**:

```
페르소나 1: 매니저 (작성자)
  Step 1. 월 시작 — 셋팅 점검 (시프트 / 그룹 / 워커 / 휴가)
  Step 2. 자동 생성 → 미리보기 → 적용
  Step 3. 빈자리/균형 검토 → 수동 조정
  Step 4. 공지됨 → 직원에게 배포

페르소나 2: 직원
  Step 1. 영구 토큰 링크 또는 로그인 → 본인 일정
  Step 2. 같은 날 동료 확인
  Step 3. 캘린더 다운로드 (휴대폰 동기화)
  Step 4. (필요 시) 시프트 교체 요청

페르소나 3: 관리자
  ... (생략)
```

각 Step 마다:
- 어느 페이지/탭/버튼을 누르는가?
- 어느 데이터가 필요한가?
- 어떤 권한 체크가 있는가?

**시나리오 검수 후** 데이터 모델/UI/API 결정.

### 규칙 27 — PR 시작 시 GATE 체크리스트 + 사용자 가시화 의무 (2026-05-04 신설, 강력)

> **본 세션 사고 (2026-05-04 밤)**: PR-2QQ-a/b/c/d-1 누적 진행 중 GATE 3/6/7/8 일괄 누락.
> Rule 6 시각 검수 안 해서 **사용자가 일요일 비선호 자동 표시 버그 직접 발견**.
> "쭉쭉 가달라" 라는 일괄 GO 받았다고 PR 단위 상세 설계 + 시각 검수 생략한 게 사고의 직접 원인.

**원칙**: "쭉쭉" 일괄 GO 가 있어도 **PR 단위로는 매번 GATE 체크리스트 가시화 + 시각 검수 의무**.
일괄 GO 는 "방향 동의" 일 뿐 "PR 별 절차 면제" 가 아님.

**다음 중 하나라도 해당하면 PR 시작 전 GATE 체크리스트 의무 표시**:

```
✓ 마이그레이션 포함
✓ 알고리즘 변경 (자동 생성, batch 처리, 가중치 등)
✓ 새 데이터 모델 / 컬럼 추가
✓ 사용자 운영 흐름 변경
✓ UI 컴포넌트 변경 (CSS / className / style / JSX 구조)
✓ 새 페이지 / 탭 / 모달 신설
```

**의무 절차** — 매 PR 시작 시 사용자에게 다음 형식으로 보고:

```
[PR-XXX 시작 — GATE 체크리스트]

GATE 3 (Planner) ───────────────────────────
  □ Researcher 보고서 (영향 범위 / 재사용 / 위험)
  □ 설계서 v2 (데이터 모델 / API / UI / 알고리즘 의사코드)
  □ 시뮬레이션 (Rule 8) — 실제 데이터 1건으로 흐름 검증
  □ 사용자 GO 키워드 대기 (Rule 7)

GATE 5 (Generator + 영향 검증) ─────────────
  □ tsc --noEmit PASS
  □ 큰 변경 시 next build 부분 PASS
  □ 영향 받는 파일 목록 명시

GATE 6 (Reviewer 자체) ─────────────────────
  □ 하네스 lint (sql / sql-fn / api-trace / ui-coverage / menu-sync) PASS
  □ 동형 패턴 인덱스 (Rule 14) — 같은 부류 영역 모두 동시 적용

GATE 7 (Designer 시각 검수 — 의무) ─────────
  □ Chrome MCP 시도 (가능 시: navigate → screenshot → 분석)
  □ 또는 사용자 스크린샷 명시 요청
  □ "빌드 PASS = 검수 완료" 절대 금지 (Rule 6)

GATE 8 (Evaluator) ─────────────────────────
  □ evaluate.js 실행 (있으면)
  □ 8.0/10 이상 확인

규칙 22 (_docs 동기화) ─────────────────────
  □ CHANGELOG.md (필수)
  □ DATA-MODEL.md (DB 변경 시)
  □ UI-SPEC.md (UI 변경 시)
  □ OPERATIONS.md (운영 사실 변경 시)
  □ SCENARIOS.md (페르소나 흐름 변경 시)
```

**commit 메시지에 GATE 진행 상태 명시** (스킵 시 사유):

```
GATE 진행 상태:
✅ G3 설계서 + 사용자 GO
✅ G5 tsc PASS / next build (영향 페이지 N개 PASS)
✅ G6 lint:harness 새 위반 0건
⚠ G7 Designer — 사용자 스크린샷 검수 (Chrome MCP 미연결)
✅ G8 evaluate.js 8.5/10
✅ Rule 22 _docs 갱신 (CHANGELOG / DATA-MODEL / UI-SPEC)
```

**위반 시 자동 페널티** (Rule 0-1 의 누적 카운터 적용):

| 위반 누적 | 액션 |
|----------|------|
| 1회 | 자가 기록 + regression-cases 추가 |
| 2회 (같은 GATE 누락) | 다음 PR 자동 동결 — 사용자 명시 OK 받기 전 진행 금지 |
| 3회+ | 자동화 hook 신설 (예: PR 시작 시 GATE 체크리스트 자동 출력 prompt 강제) |

**자동화 안전장치 (TBD)**:
```
🔜 14. pr-gate-checklist-lint — commit 메시지 안 GATE 명시 자동 검증
   - commit 메시지에 "GATE 진행 상태:" 섹션 없으면 차단
   - 단, 단순 typo / docs-only commit 화이트리스트
   - 위치: harness-engineering/scripts/pr-gate-lint.js (TBD)
```

### 규칙 28 — AI 잔존 표현 / 네이밍 차단 (2026-05-31 신설, 강력)

> **사용자 명령 (2026-05-31)**: 「쓸데없이 AI 티 나는 설명이나 네이밍 설정은
> 하네스 기준으로 못 하게 해 주세요」
>
> 5-28 § 8 (UI 잔존 표현 금지) 도입 후에도 동형 위반 누적 → 강제 차단으로 격상.

**원칙**: 사용자에게 보이는 모든 화면 텍스트·이름은 **사람이 쓴 것처럼**.
개발 메타 정보 (Phase / PR-X / P9-y / 향후 …) 와 영어 단독 라벨은 UI 노출 금지.

**다음 중 하나라도 해당하면 본 규칙 발동**:

```
✓ JSX 본문 / 컴포넌트 텍스트
✓ 페이지 제목 (PageTitle PAGE_NAMES) / 메뉴 라벨 / 모달 제목
✓ 버튼 / 탭 / 빈 상태 안내 / placeholder / alert 메시지
✓ 도움말 박스 / 안내 배너 (💡 🔧 ⚠ 등 박스)
```

**의무 절차**:

```
[A] UI 텍스트 작성 시 사전 자가 검토
   1. Phase / PR-X / P9-y / vN.N 같은 개발 메타 식별자 — 사용자 노출 X
   2. 「향후 ... 예정」 「추후 구현」 「대체 예정」 — 미완성 자백 표현 X
   3. placeholder / stub / TBD / WIP / TODO — 한글 「준비 중」 으로
   4. mock / direct / etl / sync / fetch / adapter / proxy — 운영 모드명 X
   5. 영어 단독 라벨 — 기술 약어 화이트리스트 (§ 8.5) 만 허용

[B] 검사 자동화
   1. `npm run lint:ui-design` — check 18 (AI 잔존 + 메타 식별자) 정보성 경고
   2. `UI_DESIGN_LINT_STRICT=1 npm run lint:ui-design` — 차단 모드
   3. baseline 동결: 기존 위반은 통과, 신규 위반만 새로 잡힘

[C] PR 시작 시 (Rule 27 GATE 체크리스트 연동)
   □ UI 텍스트 § 8 검토 — Phase / PR-X / 향후 / mock 등 식별자 0건
   □ 페이지·메뉴·모달·버튼 이름 한글 100% 확인
   □ check 18 결과 새 위반 0건
```

**위반 시 페널티 (Rule 0-1 누적 카운터 연동)**:

| 누적 | 액션 |
|---|---|
| 1회 | 정보성 경고 + 자가 기록 (knowledge/ai-residual.md) |
| 2회 | 사용자에게 즉시 보고 + hotfix |
| 3회+ | `UI_DESIGN_LINT_STRICT=1` 강제 활성화 — commit 차단 |

**자동화 안전장치**:
```
✅ 13. ui-design-lint check 18 (2026-05-28 신설, 2026-05-31 강화)
   - § 8.1 기술 용어 (adapter / sync / fetch / 어댑터) + 💡 + 기술 박스
   - § 8.4 메타 식별자 (Phase / PR-X / P9-y / placeholder / mock 모드 / 향후 ... 예정)
   - § 8.5 영어 단독 라벨 (check 17 한글 100% 와 동시 작동)
   - 위치: harness-engineering/scripts/ui-design-lint.js check 18
   - baseline: harness-engineering/knowledge/ui-design-lint.baseline.json
```

### 규칙 29 — 가로 스크롤 금지 / 반응형 표준 (2026-05-31 신설)

> **사용자 명령 (2026-05-31)**: 「좌우 화면 안 짤리게 반응형 필수」 +
> 「좌우 스크롤은 없애야죠」 — 가로 스크롤 (`overflowX:'auto'`) 도 회피책 X.

**원칙**: viewport 너비에 컨텐츠가 **줄어들거나 재배치**돼야 한다.
가로 스크롤은 응급 대피용일 뿐 표준 해결책이 아님.

**금지 패턴 (자동 검출)**:

```
✗ <table> 직접 사용 → NeuDataTable 사용 의무 (모바일 카드 자동 폴백)
✗ minWidth: 600+ inline / min-w-[600px+] Tailwind → fixed wide
✗ gridTemplateColumns: 'repeat(6+, NNNpx)' → fixed-px 다컬럼
✗ overflowX: 'auto' / 'scroll' → 가로 스크롤 자체 금지
✗ overflow-x-auto / overflow-x-scroll Tailwind 동일
```

**올바른 패턴**:

```
✓ NeuDataTable             — 모바일 카드 자동 폴백
✓ flex-wrap                — 좁아지면 줄바꿈
✓ minmax grid              — repeat(auto-fit, minmax(280px, 1fr))
✓ 컬럼 우선순위 hide        — narrow 에서 부차 컬럼 숨김
```

**예외** (명시적 사유 주석 의무):
- Excel 같은 데이터 그리드 — `// 가로 스크롤 허용: 데이터 그리드`
- 코드 블록 (`<pre>`) — 자동 처리
- 차트 (`<svg>` viewBox)

**자동화 안전장치**:
```
✅ 14. ui-design-lint check 19 (2026-05-31 신설)
   - § 1.7 wide content + 가로 스크롤 패턴 검출
   - page.tsx 안 <table> / minWidth 600+ / repeat(6+, NNNpx) / overflowX:'auto'
   - baseline 동결: 신규 위반만 알림
   - 위치: harness-engineering/scripts/ui-design-lint.js check 19
```

**위반 시 페널티 (Rule 0-1 누적 카운터 연동)**:

| 누적 | 액션 |
|---|---|
| 1회 | 정보성 경고 |
| 2회 | 사용자 보고 + hotfix |
| 3회+ | `UI_DESIGN_LINT_STRICT=1` 강제 활성화 — commit 차단 |

### 본 세션 사고 회고 누적 (2026-05-04 — 2026-05-31)

```
사고 1: _docs 갱신 14 PR 누락 → 규칙 22 신설
사고 2: 마이그레이션 미적용 → 규칙 23 신설
사고 3: cs_workers 3중복 (시드 멱등성 부재) → 규칙 24 신설
사고 4: 24/365 운영 사실 인지 부족 → 규칙 25 신설
사고 5: 페르소나/시나리오 사전 점검 부족 → 규칙 26 신설
사고 6: PR-2QQ 시리즈 GATE 3/6/7/8 일괄 누락
        → 일요일 비선호 버그 사용자가 직접 발견
        → 규칙 27 신설 (PR 단위 GATE 체크리스트 + 가시화 의무)
사고 7 (2026-05-31): § 8 (UI 잔존 표현) 도입 후에도 「Phase 1.3-C 예정」
        「향후 ... 대체 예정」 류 메타 식별자 통과
        → 규칙 28 신설 (네이밍 + 메타 식별자 강제 차단)
```

향후 같은 부류 사고 발생 시 → 자동화 hook 즉시 신설 (규칙 15 적용).

### 위반 시 자동 자가 기록 + 누적 시 시스템 안전장치

이 조항을 위반하면 즉시 `knowledge/common-errors.md`에 사례 기록.

| 위반 누적 횟수 | 자동 액션 |
|---------------|----------|
| 1회 | 자가 기록만 |
| 2회 | 사용자에게 명시적 사과 + 재발 방지 방안 |
| 3회 | 같은 위반 패턴이면 **시스템 차원 안전장치 제안** (예: 자동화 hook, 강제 prompt 추가) |
| 5회+ | 해당 작업 영역 **자율 개시 금지** — 사용자가 명시적으로 시켜야만 진행 |

---

## 0. 시스템 개요

**Harness Engineering v3.0**은 9인 에이전트 체제 + 4기둥 프레임워크를 결합한 하이브리드 오케스트레이터입니다.

### 4기둥 (Four Pillars)

| # | 기둥 | 설명 |
|---|------|------|
| P1 | **기계가 읽는 컨텍스트** | CLAUDE.md + HARNESS.md + knowledge/ 를 세션 시작 시 반드시 읽는다 |
| P2 | **결정론적 게이트** | 각 단계 전환에 명시적 조건/동작이 정의된 9개 GATE |
| P3 | **최소 권한 원칙** | 각 에이전트는 허용된 도구/파일만 접근 가능 |
| P4 | **피드백 루프** | 실수→기록→방지의 자가 학습 + 가비지 컬렉션 |

### 핵심 원칙
> 1. **모델을 직접 관찰하라** — 추측 말고 코드를 관찰하라.
> 2. **복잡한 작업은 분해하고 전문화하라** — 9인 에이전트가 각자 전문 영역을 담당한다.
> 3. **자기 평가 금지** — 반드시 evaluate.js가 PASS를 줘야 커밋한다.
> 4. **자가 학습** — 발견한 패턴/이슈를 knowledge/에 기록하여 점진 진화한다.
> 5. **에이전트가 실수하면, 구조적으로 막는다** — 프롬프트가 아닌 시스템으로 방지한다.

---

## 1. 하네스 파이프라인 (v3.0 — 9인 체제 + 9 GATE)

```
사용자 요청
    ↓
─── GATE 1: 컨텍스트 로드 ───────────────────────────
    조건: 세션 시작 시
    동작: CLAUDE.md + HARNESS.md + knowledge/*.md 읽기
    ↓
[Researcher] ─── 코드베이스 조사, 기존 자산 파악, knowledge/ 참조
    ↓
─── GATE 2: 조사 완료 ──────────────────────────────
    조건: 영향 범위 + 재사용 자산 + 위험 요소 문서화 완료
    동작: Planner에게 조사 보고서 전달
    ↓
[Planner] ────── 조사 결과 기반 상세 설계서 작성 → 사용자 확인
    ↓
─── GATE 3: 설계 승인 ──────────────────────────────
    조건: 사용자가 설계서 확인 (구두 또는 명시적 승인)
    동작: DB 변경 필요 시 Migrator 분기, 아니면 Generator 진행
    ↓
[Migrator] ──── (필요 시) 안전한 마이그레이션 전략 수립 → 실행
    ↓
─── GATE 4: 마이그레이션 안전 ──────────────────────
    조건: 🟢Green=자동, 🟡Yellow=로그확인, 🔴Red=사용자 SQL 검토 필수
    동작: 마이그레이션 성공 확인 후 Generator 진행
    ↓
[Generator] ──── 설계서 100% 구현
    ↓
─── GATE 5: 구현 완료 + 영향 검증 ─────────────────────
    조건: 설계서의 모든 Must-have 항목 구현 완료
    필수: 변경된 파일이 import하는/import되는 파일 전체 빌드 확인
    필수: 연관 페이지/API 동작 확인 (수정한 곳만이 아닌 영향받는 곳 전체)
    동작: Reviewer에게 전달
    ↓
[Reviewer] ───── 정적 분석, 아키텍처 규칙 검증
    ↓
─── GATE 6: 코드 품질 ──────────────────────────────
    조건: 🔴Critical=0개, 🟡Warning=3개 이하
    동작: 🔴 있으면 Generator 반환 / 통과 시 Designer 진행
    ↓
[Designer] ───── Soft Ice 디자인 시스템 검증
    ↓
─── GATE 7: 디자인 검증 ─────────────────────────────
    조건: 시인성 통과, Soft Ice 글래스 디자인 준수
    동작: ❌ 심각 시 Generator 반환 / 통과 시 Evaluator 진행
    ↓
[Evaluator] ──── evaluate.js 실행 + 채점
    ↓
─── GATE 8: 품질 합격 ──────────────────────────────
    조건: evaluate.js ≥ 8.0/10
    동작: 불합격 → Generator 반환 (최대 3회) / 합격 → Deployer 진행
    ↓
[Deployer] ───── 커밋 → 사용자에게 push 안내 → 헬스체크
    ↓
─── GATE 9: 배포 완료 ──────────────────────────────
    조건: 커밋 성공 + 헬스체크 통과
    동작: Documenter에게 전달 → 문서 업데이트
    ↓
[Documenter] ─── CLAUDE.md/HARNESS.md 업데이트, Knowledge Base 축적
    ↓
  완료 ✅
```

### 에이전트 역할 + 최소 권한 (9인 체제)

| # | 에이전트 | 역할 | 허용 도구 | 금지 도구 | 파일 |
|---|---------|------|----------|----------|------|
| 1 | **Researcher** | 사전 코드 조사, 중복 방지 | Read, Grep, Glob, Bash(읽기) | Write, Edit | `harness-engineering/agents/researcher.md` |
| 2 | **Planner** | 상세 설계서 작성 | Read, Write(docs/ 한정) | Edit(코드), Bash | `harness-engineering/agents/planner.md` |
| 3 | **Generator** | 코드 구현 | Read, Write, Edit, Bash | git push | `harness-engineering/agents/generator.md` |
| 4 | **Reviewer** | 정적 분석, 아키텍처 규칙 | Read, Grep, Glob | Write, Edit | `harness-engineering/agents/reviewer.md` |
| 5 | **Designer** | Soft Ice 디자인 검증 | Read, Grep | Write, Edit, Bash | `harness-engineering/agents/designer.md` |
| 6 | **Evaluator** | 실행 테스트, 채점 | Read, Bash(evaluate.js) | Write, Edit | `harness-engineering/agents/evaluator.md` |
| 7 | **Deployer** | 커밋, push 안내, 헬스체크 | Read, Bash(git, curl) | Edit(코드) | `harness-engineering/agents/deployer.md` |
| 8 | **Migrator** | DB 마이그레이션 (필요 시) | Read, Write(migrations/), Bash(DB) | Edit(코드) | `harness-engineering/agents/migrator.md` |
| 9 | **Documenter** | 문서/지식 자동 축적 | Read, Write, Edit(*.md 한정) | Bash(코드실행) | `harness-engineering/agents/documenter.md` |

---

## 2. 자가 학습 시스템 + 가비지 컬렉션

```
harness-engineering/knowledge/
├── patterns.md       ← Researcher: 코드 패턴 축적
├── common-errors.md  ← Reviewer: 반복 에러 기록
├── deploy-issues.md  ← Deployer: 배포 이슈 기록
├── color-issues.md   ← Designer: 시인성 문제 기록
├── migrations.md     ← Migrator: 마이그레이션 히스토리
├── decisions.md      ← Documenter: 기술 결정 기록
└── archive/          ← [ARCHIVED] 항목 저장소
```

### 가비지 컬렉션 규칙

| 태그 | 의미 | 수명 |
|------|------|------|
| `[ACTIVE]` | 현재 유효 | 영구 유지 |
| `[RESOLVED]` | 해결됨 (원인+해결 기록) | 3개월 후 아카이브 |
| `[DEPRECATED]` | 더 이상 유효하지 않음 | 즉시 아카이브 가능 |
| `[ARCHIVED]` | 아카이브 완료 | archive/로 이동 |

---

## 3. 컨텍스트 리셋 규칙

`/clear` 시점:
1. 에이전트 역할이 전환될 때
2. 컨텍스트 50% 이상 소진 시
3. Generator 피드백 반영 2회차 시작 시

### 프로젝트 타입 설정

- 프로젝트 타입: **웹앱**
- 평가 기준: UI/UX 30%, 기능 완성도 30%, 코드 품질 20%, 반응형 10%, 보안 10%
- 합격 점수: **8.0/10**
- 평가 기준표: `harness-engineering/templates/eval-criteria.md`

---

## 4. 세션 시작 루틴

```
1. CLAUDE.md 읽기     ← 지금 이 파일
2. HARNESS.md 읽기    ← 기능 현황
3. knowledge/*.md 스캔 ← 축적된 패턴/이슈 확인
4. **handover/active-roadmap.md 읽기** ← 전체 로드맵 + 현재 진행 상태 + 다음 작업
5. 작업 요청 파악 (로드맵 맥락에서 이해)
6. [하네스 모드] → GATE 1~9 파이프라인
   [일반 요청] → Generator로 직접 구현 (GATE 5~9 적용)
7. evaluate.js 실행 → PASS 확인
8. git add / git commit
9. 사용자에게 push 안내
10. **active-roadmap.md 업데이트** ← 완료 항목 체크 + 다음 작업 갱신
```

---

## 4-1. 변경 영향 검증 (필수 — 모든 작업에 적용)

> **"부분만 고치고 전체를 안 보는" 실수를 구조적으로 방지하는 규칙.**
> 하나를 고쳤는데 다른 곳이 무너지면, 사용자가 직접 발견해서 알려줘야 하고,
> 또 그것만 고치면 또 다른 데서 터지는 악순환이 반복된다.
> 이 섹션은 그 악순환을 끊기 위해 존재한다.

### 커밋 전 필수 체크리스트

| # | 검증 항목 | 방법 | 실패 시 |
|---|----------|------|---------|
| 1 | **빌드 통과** | `npx next build` 전체 빌드 | 커밋 금지 |
| 2 | **import 체인 확인** | 수정한 파일을 import하는 모든 파일 확인 | 깨진 import 수정 |
| 3 | **삭제 파일 참조 확인** | 파일 삭제 시 `grep -r "삭제파일명"` 으로 잔존 참조 확인 | 참조 제거 후 커밋 |
| 4 | **연관 페이지 동작** | 수정한 API를 호출하는 UI 페이지 목록 파악 + 빌드 확인 | 영향 받는 페이지도 수정 |
| 5 | **사이드바/라우트 정합** | system_modules ↔ ClientLayout ↔ 실제 파일 일치 확인 | 불일치 수정 |

### 외부 연동 작업 시 추가 체크리스트

| # | 검증 항목 | 방법 |
|---|----------|------|
| 1 | **실제 데이터 샘플 확보** | 앱 설치 → 테스트 전송 → raw 페이로드 캡처 후 개발 |
| 2 | **네트워크/인증 확인** | IP 화이트리스트, API 키, Content-Type 사전 확인 |
| 3 | **실패 복구 경로** | 파싱 실패 시 raw 데이터 보존 + 재처리 API 제공 |

### 자가 학습 자동 기록 트리거

아래 상황 발생 시 사용자 요청 없이도 knowledge/에 기록:
- 같은 기능에 수정 커밋이 2회 이상 발생
- 환경/연동 문제로 30분 이상 소요
- 사용자가 비효율/품질 문제를 지적
- 새로운 연동 패턴 확립

---

## 5. 프로젝트 구조

```
Self-Disruption/
├── app/                     ← Next.js App Router (소스 코드)
│   ├── api/                 ← API Routes (100+)
│   ├── components/          ← 공유 컴포넌트 (14개)
│   ├── dashboard/           ← 대시보드
│   ├── cars/                ← 차량 관리
│   ├── quotes/              ← 견적 (장기/단기)
│   ├── contracts/           ← 계약 관리
│   ├── finance/             ← 재무/정산
│   ├── admin/               ← 관리자 (HR, 급여, 권한)
│   ├── invite/[token]/      ← 초대 수락 (공개)
│   └── public/              ← 공개 페이지 (견적 공유, 서명)
├── lib/                     ← 유틸리티 (auth, prisma, etc.)
├── prisma/                  ← Prisma 스키마 (42 모델)
├── harness-engineering/     ← 하네스 에이전트 + 지식
│   ├── agents/              ← 9인 에이전트 프롬프트
│   ├── knowledge/           ← 자가 학습 저장소
│   ├── handover/            ← 인수인계 메모
│   ├── docs/                ← 자동 생성 문서
│   ├── reports/             ← 검수/주간 보고
│   └── templates/           ← 평가 기준표
├── CLAUDE.md                ← 이 파일
├── HARNESS.md               ← 기능 현황 + 모듈 상태
└── evaluate.js              ← 자동 검증 스크립트
```

---

## 6. 절대 금지 사항

### ❌ PostgreSQL 문법 사용 금지 (MySQL 전용)
```
// ❌ 잘못된 방식
prisma.$queryRaw`SELECT * FROM users WHERE id = $1` // PostgreSQL 문법
prisma.$queryRaw`INSERT INTO ... RETURNING *`        // PostgreSQL 전용

// ✅ 올바른 방식
prisma.$queryRaw`SELECT * FROM users WHERE id = ${userId}` // Tagged template
prisma.$queryRawUnsafe('SELECT * FROM users WHERE id = ?', userId) // 동적 쿼리
// INSERT 후 별도 SELECT로 조회
```

### ❌ $queryRaw를 일반 함수로 호출 금지
```
// ❌ 잘못된 방식 — "tag function" 에러 발생
prisma.$queryRaw(query, ...params)

// ✅ 올바른 방식
prisma.$queryRawUnsafe(query, ...params) // 동적 쿼리 시
prisma.$queryRaw`SELECT * FROM table WHERE id = ${id}` // 정적 쿼리 시
```

### ❌ SQL Injection 패턴 금지
```
// ❌ 잘못된 방식 — 문자열 보간 직접 사용
const query = `UPDATE table SET ${key} = '${value}' WHERE id = '${id}'`
prisma.$executeRawUnsafe(query)

// ✅ 올바른 방식 — 파라미터 바인딩 사용
prisma.$executeRaw`UPDATE table SET column = ${value} WHERE id = ${id}`
```

### ❌ 에이전트 권한 침범 금지
- Reviewer는 코드를 수정하지 않는다 (Read Only)
- Designer는 코드를 수정하지 않는다 (Read Only)
- Evaluator는 코드를 수정하지 않는다 (evaluate.js 실행만)
- Documenter는 *.md 파일만 수정한다

---

## 7. 프로젝트 개요

- **서비스명**: FMI ERP (Self-Disruption)
- **회사**: 주식회사 에프엠아이 (단독 회사 ERP)
- **목적**: 렌터카 사업 통합 관리 (차량, 계약, 고객, 재무, 인사)
- **배포 URL**: https://hmseok.com
- **GitHub**: git@github.com:hmseok/Self-Disruption.git

---

## 8. 기술 스택

- **프론트엔드**: Next.js 16 (App Router, Turbopack), React, TypeScript, Tailwind CSS
- **백엔드**: Next.js API Routes, Prisma (Raw SQL)
- **DB**: MySQL (GCP Cloud SQL — `r-care-db`, Public IP: 34.47.105.219, DB: fmi_op)
- **인증**: Custom JWT (jsonwebtoken + bcryptjs, Node.js native crypto HS256 검증)
- **인프라**: GCP Cloud Run, Cloud Build, GitHub Actions
- **GCP 프로젝트**: `secondlife-485816` (asia-northeast3)
- **AI**: Gemini API (AI 플로팅 어시스턴트)

---

## 9. 인증 구조

- Custom JWT: `lib/auth-server.ts` (Node.js crypto HS256)
- 클라이언트: `lib/auth-client.ts` (localStorage `fmi_token`/`fmi_user`)
- 모든 API 라우트: `import { verifyUser } from '@/lib/auth-server'`
- company_id는 과거 멀티회사 구조 → 현재 단독 회사 (verifyUser에서 companies 테이블 조회)
- 비밀번호: bcryptjs hash (salt round 12)

---

## 10. Soft Ice 글래스 디자인 시스템

> **🎨 페이지 디자인 표준 (필독 — 2026-05-10 사용자 명령 기반)**
> 「**대출 관리 / 정산 관리** 가 우리의 디자인 기준입니다」
>
> ### 페이지 헤더는 자동 (PageTitle 컴포넌트):
> - `app/components/PageTitle.tsx` 가 ClientLayout 에 자동 mount
> - 페이지 path → 그룹 → 페이지명 자동 breadcrumb + 블루 도트
> - **페이지 자체에서 헤더 만들지 말 것** (PageTitle 이 이미 표시)
> - 새 페이지 등록 시: `PageTitle.tsx` 의 `PATH_TO_GROUP` + `PAGE_NAMES` 에 추가만
>
> ### 본문 레이아웃 표준:
> ```
> [PageTitle 자동 헤더]
> ─────── 디바이더 ───────
> DcStatStrip (5 카드 + 액션 버튼)
> (선택) 드롭존 / 배너
> DcToolbar (검색 + 필터)
> NeuDataTable (데이터 테이블)
> ```
>
> ### 의무 사용 컴포넌트:
> 1. **`DcStatStrip`** — 5 stat 카드 + 액션 버튼
> 2. **`DcToolbar`** — 검색 + 필터 통합 바
> 3. **`NeuDataTable`** — 정렬 가능한 테이블
>
> ### 자주 발생하는 위반 (피해야 할 패턴):
> - ❌ 자체 큰 헤더 박스 (`<h1>출고/반납 관리</h1>` 같은 — PageTitle 자동)
> - ❌ 자체 breadcrumb (`Employee of Ride Inc. > ...` — PageTitle 자동)
> - ❌ stat 카드 자체 div 구현 (DcStatStrip 사용 의무)
> - ❌ 검색바 + 필터 자체 구현 (DcToolbar 사용 의무)
> - ❌ 페이지 제목 24px+ (PageTitle 가 자동 — 직접 만들면 안 됨)
>
> ### 검증 도구:
> - `npm run lint:ui-design` — 108 페이지 자동 스캔 (`harness-engineering/scripts/ui-design-lint.js`)
> - 자세한 패턴: `_docs/UI-DESIGN-STANDARD.md`
>
> ### 기준 페이지 (실제 동작 확인):
> - `/loans` (대출 관리) ← 가장 깔끔한 기준
> - `/finance/settlement` (정산 관리) ← 복잡한 케이스 기준
>
> 신규 세션 시작 시 `_docs/UI-DESIGN-STANDARD.md` 1회 정독 권장.

---

뤼키드 글래스 디자인 적극활용 (카드 항목 제목은 투톤 추천)

### Glass 깊이 5단계

| Level | 용도 | 배경 | 보더 |
|-------|------|------|------|
| **5** | 네비게이션 바 (가장 위, 가장 불투명) | `white/0.75` | `rgba(0,0,0, 0.06)` |
| **4** | 테이블 카드, 모달 (데이터 컨테이너) | `white/0.72` | `rgba(0,0,0, 0.06)` |
| **3** | 스탯 카드, 일반 카드 (색상 틴트 보더) | `white/0.60` | 색상-100/0.80 |
| **2** | 사이드바, 서브 패널 (배경에 가까움) | `white/0.35` | `rgba(0,0,0, 0.05)` |
| **1** | 인풋, 검색바 (오목 — 배경보다 어두움) | `white/0.40` + inset shadow | `rgba(0,0,0, 0.05)` |

### 스탯 카드 색상 틴트

| 색상 | 용도 | 보더 |
|------|------|------|
| **Blue** | 전체, 진행 중, 기본 정보 | `blue-100/0.80` |
| **Green** | 운용 중, 완료, 정상 | `green-100/0.80` |
| **Red** | 만기 초과, 오류, 긴급 | `red-100/0.80` |
| **Amber** | 검사 예정, 경고, 주의 | `amber-100/0.80` |
| **Purple** | 플러그인, 확장 기능 | `violet-100/0.80` |

### 보더 원칙
- Level 5, 4: `rgba(0,0,0, 0.06)` — 어두운 보더로 윤곽선 강조
- Level 3: 색상-100/0.80 — 틴트 컬러 보더로 개성 부여
- Level 2, 1: `rgba(0,0,0, 0.05)` — 미세한 어두운 보더

---

## 11. 작업 원칙

1. 작업 시작 전 결정 사항이나 결정 필요 사항은 질문 갯수와 상관없이 확인 피드백 후 진행
2. 전체 구성의 일부 파트를 먼저 하고 있으므로 확장 예상하여 작업
3. 색상에 의해 시인성이 심각하게 떨어지는 경우 별도의 색으로 변경 검수 후 확정
4. 불필요한 푸시 최소화 (Cloud Build 시간이 길므로 변경사항 모아서 한 번에)

### 11-1. 공동 시뮬레이션 원칙 (가장 중요)

> **사용자가 데이터, 스크린샷, 질문을 줄 때 — 그것은 "지시사항"이 아니라 "함께 생각할 재료"다.**
> 사용자 혼자 운영 시뮬레이션을 돌리고, 에이전트는 시킨 것만 처리하는 관계가 되면
> 매번 지적하고 수정하고 검증하는 부담이 전부 사용자에게 돌아간다.
> 에이전트는 사용자와 **같은 입장**에서 "이걸 실제로 쓸 때 어떻게 되는가"를 함께 시뮬레이션해야 한다.

#### 반드시 지킬 것

| # | 원칙 | 구체적 행동 |
|---|------|------------|
| 1 | **사용자 입력의 의도를 추론하라** | 스크린샷, 변수 목록, 에러 로그를 받으면 — "이 정보로 실제 동작을 시뮬레이션하면 어떤 결과가 나오는가?"를 먼저 생각한다. 코딩 전에 머릿속 시뮬레이션부터. |
| 2 | **End-to-End로 상상하라** | 기능 하나를 만들 때, 데이터가 들어오는 순간 → 저장 → 화면에 표시 → 사용자가 보는 모습까지 전체 흐름을 시뮬레이션한다. 중간 한 단계만 만들지 않는다. |
| 3 | **"다음에 뭘 할까"를 예측하라** | 사용자가 A를 요청하면, A 완료 후 자연스럽게 필요해질 B, C를 미리 파악하고 설계에 반영한다. "이것만 하면 끝"이 아니라 "이 다음은 뭐지?"를 항상 생각한다. |
| 4 | **실제 데이터로 검증하라** | 사용자가 제공한 샘플 데이터, 스크린샷의 실제 값으로 테스트한다. 임의의 테스트 데이터("홍길동", "test@test.com")가 아닌 실제 맥락의 데이터로. |
| 5 | **문제를 먼저 발견하라** | 사용자가 "안 돼요"라고 말하기 전에, 구현 후 스스로 "이거 실제로 동작하나?" 의심하고 점검한다. 사용자가 QA 담당이 되면 안 된다. |
| 6 | **모르면 물어보되, 추측으로 진행하지 마라** | 실제 포맷을 모르면 가정으로 만들지 말고, 사용자에게 "실제 문자 하나만 보내주시면 그 포맷에 맞춰 만들겠습니다"라고 요청한다. |

#### 나쁜 예 vs 좋은 예

```
❌ 나쁜 예 (SMS 파서):
   사용자가 앱 변수 목록 스크린샷 제공
   → 에이전트: 이론적 포맷으로 파서 구현
   → 실제 문자 도착 → 파싱 실패
   → 사용자가 "안 돼요" → 수정 → 또 실패 → 또 수정 (3회 반복)

✅ 좋은 예:
   사용자가 앱 변수 목록 스크린샷 제공
   → 에이전트: "{msg} 변수에 '보낸사람:' 접두어가 붙을 수 있고,
     [Web발신] 태그도 포함될 수 있겠네요. 테스트 문자 하나 보내서
     실제 raw 데이터를 확인한 후 만들겠습니다."
   → 실제 데이터 확인 → 한 번에 정확히 구현
```

---

## 12. 배포 파이프라인

```
GitHub push (main) → Cloud Build → Docker build → Cloud Run 배포
```

- Cloud SQL 연결: Public IP (34.47.105.219)
- 환경변수: JWT_SECRET, DATABASE_URL
- Dockerfile: standalone output + 수동 dependency 복사 (jsonwebtoken, bcryptjs 등)
- 빌드 시간: 약 5~10분

---

## 13. 알려진 이슈 이력

| # | 이슈 | 원인 | 상태 |
|---|------|------|------|
| 1 | API 라우트 401/500 에러 | PostgreSQL → MySQL 미전환 ($1 → ?) | [RESOLVED] 2026-04-05 |
| 2 | system_modules 404 | 라우트 파일 미존재 | [RESOLVED] 2026-04-05 |
| 3 | "활성화된 모듈이 없습니다" | company_modules → system_modules 전환 | [RESOLVED] 2026-04-05 |
| 4 | 직원초대 비밀번호 미저장 | accept에서 password 해싱/저장 누락 | [RESOLVED] 2026-04-05 |
| 5 | SQL Injection 취약점 (9개 라우트) | 문자열 보간 직접 사용 | [ACTIVE] 보안 패치 필요 |
| 6 | Prisma 스키마 45.7% 커버리지 | 50+ 테이블 Raw SQL만 | [ACTIVE] 점진 전환 |
| 7 | user_page_permissions Prisma 모델 누락 | 스키마에 미정의 | [ACTIVE] 추가 필요 |
