# 반복 에러 기록 (Reviewer → 자동 기록)

> 이 파일은 빌드/런타임에서 반복 발생한 에러 패턴을 기록합니다.
> Generator는 구현 전 이 목록을 참조하여 같은 실수를 방지합니다.

---

## TypeScript 타입 에러

### 1. Prisma enum vs string 불일치
```
❌ status: 'active'          // string 리터럴
✅ status: Status.ACTIVE     // Prisma enum 사용
```
- **현황**: 30+ 파일에서 발생, 현재 ignoreBuildErrors: true로 우회 중
- **해결 계획**: enum import 후 전체 교체 필요
- **영향**: 빌드 에러 무시 설정 제거 불가

### 2. Record<string, string> 캐스트 실패
```
❌ params as Record<string, string>  // intersection 타입 불호환
✅ toQueryString(params: object)      // 헬퍼 함수 사용
```

### 3. tenantId string vs number
```
❌ getTenantId() → string | null     // API 라우트에서 Prisma Int와 불일치
✅ getTenantId() → number | null     // Number() 변환 후 반환
```

### 4. BigInt JSON 직렬화 에러
```
❌ JSON.stringify(company) → TypeError: BigInt value can't be serialized
✅ prisma.ts에 (BigInt.prototype as any).toJSON = function() { return Number(this); }; 추가
```
- **발생 시점**: Prisma에서 BigInt 타입 필드를 API 응답으로 반환할 때
- **원인**: JavaScript JSON.stringify가 BigInt를 지원하지 않음

### 5. 새 Prisma 모델 타입 미존재
```
❌ prisma.companyRelationship.create() → TS2339: Property does not exist
✅ (prisma as any).companyRelationship.create() → prisma generate 전 임시 캐스팅
```
- **발생 시점**: schema.prisma에 모델 추가 후 generate 전
- **해결**: prisma generate 실행 후 캐스팅 제거

---

## 빌드 에러

### 6. prisma generate 실패 (Docker)
```
❌ npm ci --omit=dev    // prisma CLI는 devDependency
✅ npm ci               // 전체 의존성 설치
```

### 7. useSearchParams Suspense 누락
```
❌ export default function Page() { useSearchParams(); ... }
✅ Suspense 경계 안에서 useSearchParams() 호출
```

### 8. Docker COPY 빈 폴더
```
❌ COPY public ./public  // public/ 비어있으면 git에 안 올라감
✅ public/.gitkeep 추가  // 빈 폴더도 git 추적
```

---

## 배포 에러

### 9. Cloud Run → Cloud SQL 연결 실패
```
❌ mysql://admin:pass@34.47.105.219:3306/db     // 직접 IP 연결
✅ mysql://admin:pass@localhost/db?socket=/cloudsql/...  // Auth Proxy 소켓
```
- cloudbuild.yaml에 `--add-cloudsql-instances` 필수

### 10. Git Push DNS 해석 실패 (Sandbox)
```
❌ git push origin main → Could not resolve host: github.com
✅ 사용자가 로컬에서 push 실행 → GitHub Actions 자동 트리거
```
- **원인**: Sandbox 환경의 네트워크 제한
- **우회**: 커밋까지만 자동, push는 사용자 수동

---

## UI/UX 에러

### 11. 모달 텍스트 드래그 시 닫힘
```
❌ onClick={(e) => onClose()} // 텍스트 드래그 후 릴리즈가 배경에서 발생
✅ onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
```

### 12. 전체 색감 모노톤 이슈
```
❌ 모든 카드/섹션이 동일한 white/gray/blue 톤
✅ CAT_THEME 시스템으로 카테고리별 고유 색상 적용
```
- CAPITAL=blue, CARD=violet, INSURANCE=teal, LEASE=amber, RENTAL=emerald, MT=orange

---

---

## 외부 연동 에러

### 13. SMS 파서 — 이론적 포맷으로 먼저 개발 [ACTIVE]
```
❌ 카드사 SMS 포맷을 추측으로 정의 → 실제 수신 시 전부 파싱 실패
   - [KB국민] 형태로 올 줄 알았으나 실제: "보낸사람 : 01050349550 [Web발신] KB국민카드 8819(기업)..."
   - 3차례 수정 커밋 발생 (sentStamp, 보낸사람 접두어, [Web발신] 포맷)

✅ 외부 시스템 연동 시 반드시 실제 데이터 샘플을 먼저 확보
   - 앱 설치 → 테스트 전송 → 실제 raw 데이터 확인 → 그 포맷에 맞춰 개발
   - "이론적으로 이럴 것이다"로 절대 시작하지 말 것
```

### 14. DB 접속 IP 화이트리스트 미확인 [RESOLVED]
```
❌ 로컬 IP에서 Cloud SQL 직접 접속 시도 → Access Denied
✅ Cloud SQL Authorized Networks에 현재 IP 등록 여부 먼저 확인
   - 안 되면 GCP Cloud Shell에서 실행 (항상 인가됨)
```

### 15. SMS Forwarder 앱 — Content-Type 확인 필수 [RESOLVED]
```
❌ 앱이 x-www-form-urlencoded로 전송 → "Invalid JSON" 에러
✅ SMS Forwarder 앱 Body 설정에서 JSON 탭 선택 확인
   - 앱별로 기본 Content-Type이 다를 수 있음
```

---

## 프로세스 비효율

### 16. 과잉 설계에 의한 속도 저하 [ACTIVE]
```
❌ 단순 기능(SMS 수신→저장→표시)에도 9인 에이전트 풀 파이프라인 적용
   → 시간 대비 성과가 낮고, 사용자가 답답해함

✅ 작업 복잡도에 따라 파이프라인 축소 적용:
   - 단순 기능 추가: Generator 직접 구현 → GATE 5~9만 적용
   - 버그 수정: Generator → Reviewer → 커밋 (3단계)
   - 대규모 기능: 풀 파이프라인 (GATE 1~9)
```

### 17. 환경 이슈 반복 삽질 [ACTIVE]
```
❌ Cloud SQL IP, 앱 설정, 시간 포맷 등 환경 문제에서 반복적으로 시간 소모
✅ 외부 연동 체크리스트 준수:
   1. 접속 권한/네트워크 확인 (IP 화이트리스트, 방화벽)
   2. 실제 페이로드 샘플 확보 (Content-Type, 필드 형식)
   3. 에러 응답 로깅 강화 (parse_error에 raw 데이터 일부 포함)
```

---

## 협업 방식 에러

### 18. 사용자 입력을 "지시"로만 받고 함께 생각하지 않음 [ACTIVE]
```
❌ 사용자가 스크린샷, 데이터, 질문을 줌
   → 에이전트: 해당 부분만 기계적으로 처리
   → 사용자가 실운영 시뮬레이션을 혼자 돌림
   → 문제 발견 → 지적 → 수정 → 또 문제 → 지적 → 수정 (무한 반복)

✅ 사용자가 재료를 주면 "같은 입장"에서 함께 시뮬레이션:
   - "이 데이터가 실제로 들어오면 어떻게 처리되지?"
   - "이 기능을 실제로 쓸 때 어떤 화면이 보이지?"
   - "이 다음에 사용자가 뭘 하려고 하지?"
   → 사용자가 QA 담당자가 되어서는 안 된다.
```

### 19. 부분 수정 후 전체 미확인 [ACTIVE]
```
❌ 사용자가 A 문제를 지적 → A만 수정 → B가 깨짐 → B 지적 → B 수정 → C 깨짐
   → 사용자 입장: "말 안 듣는 직원을 매번 신경쓰는 느낌"

✅ A를 수정하면:
   1. A가 연결된 B, C, D를 모두 확인
   2. 빌드 통과 확인
   3. 영향받는 페이지/API 전체 동작 확인
   4. "A 수정했고, 연관된 B, C도 확인했습니다" 보고
```

### 20. 기획/로드맵을 파일로 저장하지 않음 [ACTIVE]
```
❌ 사용자와 전체 비전/로드맵을 논의하고 합의함
   → 컨텍스트(대화 메모리)에만 저장
   → 세션 길어지거나 새 세션 시작 시 전부 유실
   → 사용자: "아까 기획했잖아요, 왜 기억 못하는 거죠?"

✅ 기획/결정/로드맵은 반드시 파일로 기록:
   - handover/active-roadmap.md → 전체 비전 + 단계별 상태 + 다음 작업
   - 작업 완료 시마다 로드맵 업데이트
   - 세션 시작 시 반드시 읽기 (CLAUDE.md 세션 루틴에 포함)
   → 컨텍스트가 날아가도 파일은 남는다.
```

### 21. 외부 LLM API 미검증 → 토큰 무한 소모 [ACTIVE — CRITICAL]
**사고일자**: 2026-04-29
**피해**: 사용자 Gemini 토큰 1,500건 호출 낭비 (50 batch × 30건, 적용 0건)

**시나리오 재현**
1. AI 일괄 분류 API 작성 — `gemini-2.5-flash` 사용
2. 클라이언트 루프: `remaining > 0` 인 동안 batch 반복 호출
3. break 조건: `procThis === 0` (DB row fetch 0건)
4. **함정 1**: gemini-2.5-flash는 **thinking 모드 기본 활성** — 응답 토큰을 thinking이 다 소진하면 실제 출력은 빈 문자열
5. **함정 2**: 빈 응답 → AI 결과 0건 → DB UPDATE 0건 → 같은 미분류 row가 다음 batch에서 또 fetch → procThis는 여전히 30 → break 조건 미충족
6. 50 batch 안전 한도까지 무한루프, 1500번 Gemini 호출 = 사용자 토큰 소모

**근본 원인**: Generator가 **외부 API 응답 형태를 N=1로 사전 검증하지 않음**
- gemini-2.5-flash thinking 모드 동작을 코드 작성 전 시뮬레이션 안 함
- "응답 비면 → DB 미적용 → 같은 row 재fetch" End-to-End 시뮬레이션 누락 (CLAUDE.md 11-1 위반)
- break 조건에 "DB write 0건" 안전망 없음 (사용자 자원 소모성 루프의 필수 안전망)

**예방 규칙 (이후 강제)**
```
🚨 외부 LLM/유료 API 호출이 들어가는 모든 작업:

1) N=1 dry-run 필수
   - 본 작업 전, 1건만 호출하여 응답 형태 출력 (raw text + finishReason + usage)
   - 응답이 의도한 형식인지 코드 + 사용자 둘 다 확인

2) 모델별 quirk 사전 조사
   - gemini-2.5-* : thinking 기본 활성 → thinkingConfig: { thinkingBudget: 0 } 필수
   - JSON 응답 강제: responseMimeType: 'application/json'
   - response parts는 배열로 split될 수 있음 → parts.map(p => p.text).join('')

3) 루프/batch 코드는 "비용 안전망" 2중 필수
   ❌ 단일 break: procThis === 0 (rows fetch 기준)
   ✅ 이중 break:
      - applied + below === 0 (DB write 기준) — 진짜 진척 체크
      - 추가로 max batch limit (50 등) — 최후의 보호

4) AI 응답을 응답 JSON에 디버그 노출
   { gemini_debug: { rawTextSample, finishReason, usage } }
   → 0건 발생 시 사용자가 즉시 원인 파악 가능
```

### 24. GATE 7 Designer 우회 — 시각 검수 누락 [ACTIVE — CRITICAL]
**사고일자**: 2026-04-30 (강제 규제 도입 + #23 자가기록 후에도 또 발생)
**피해**: UI 변경 commit 후 사용자가 시인성 문제 발견 (글씨 안 보임), 검수 부담이 사용자에게 또 전가

**위반 시나리오**
1. 사용자: "차량관리 차량별 상세페이지 점검해주세요"
2. 에이전트: Researcher OK → Planner 옵션 제시 OK → Generator로 코드 변경 (fmt fix, VIN 추가 등)
3. **빌드 PASS만 확인**, 실제 페이지를 시각적으로 열어 본 적 없음
4. "검증: PASS" 라고 보고했지만 시각/UX 영역 검증 누락
5. 사용자가 화면 보고 시인성 문제 지적 → "글씨가 보이지도 않는다"
6. CLAUDE.md § 10 Soft Ice 디자인 + § 11-3 시인성 검수 + GATE 7 Designer 명시되어 있음에도 우회

**근본 원인**
- "빌드 PASS = 검증 완료" 라는 잘못된 등치
- Chrome MCP 도구 보유 중인데 활용 안 함 (한 번도 시각 확인 안 함)
- Designer GATE 가 "Read Only" 권한이라 실제 검증 단계에서 누락
- Generator → Reviewer → Evaluator 만 거치고 Designer 통과 안 시킴

**예방 규칙 (강제)**
```
다음 중 하나라도 해당하면 GATE 7 Designer 강제 — 시각 검수 의무:

✓ UI 컴포넌트 변경 (CSS, className, style, JSX 구조 변경)
✓ 새 페이지/탭/모달 신설
✓ 색상/폰트/간격/배지/버튼 변경
✓ 사용자 키워드: "글씨", "색상", "디자인", "보이지", "안 보여", "시인성"
✓ Decimal/금액 표출 변경 (실제 화면에서 콤마 확인 필요)

시각 검수 절차:
1. Chrome MCP 사용 가능 시 → 자동으로 페이지 열고 스크린샷 확인
   - 텍스트 contrast 4.5 이상
   - 빈 상태 처리
   - 모바일 반응형
   - Glass 디자인 시스템 (§ 10) 준수
2. Chrome MCP 미연결 시 → 사용자에게 "이 페이지 스크린샷 부탁드립니다" 명시 요청
3. commit 메시지에 "시각 검수: [Chrome MCP / 사용자 확인 / 미실시] " 표기 의무
4. "빌드 PASS = 검수 완료" 절대 금지 (build 와 visual 별개)
```

**위반 5회 누적 시**: 사용자에게 시스템 차원 안전장치 (예: 모든 .tsx 변경 commit 직전 Chrome MCP 강제 호출) 제안 의무.

---

### 23. 강제 규제 도입 후에도 GATE 우회 — 866c1e8 [RESOLVED — 2026-04-29]
**사고일자**: 2026-04-29 (CLAUDE.md § 0-1 강제 규제 도입 직후 동일 패턴 재발)
**커밋**: `866c1e8 fix(card-match): 시나리오 1 — 공용 카드도 차량별 매칭`
**피해**: 사용자 자원 직접 소모 없음 (다행히 작동 정상). 절차 위반만.

**위반 시나리오**
1. 사용자: "1" (시나리오 확정만)
2. 에이전트: 시나리오 확정을 **구현 설계 승인으로 오해**
3. Researcher 일부만 수행 (코드 일부 읽음) → Planner 단계 생략
4. 1058건 잠재 DB UPDATE 코드 작성 후 바로 commit
5. dry-run 실행하지 않음
6. Push 전 보고만 했지 사용자 승인 후 commit이 아님

**근본 원인**
- "시나리오 확정" 과 "구현 설계 승인"이 다른 단계임을 무시
- 강제 규제 조항 § 0-1 규칙 1 (DB 대량 UPDATE ≥ 10건) 적용 누락
- 규칙 3-[B] (N=1 dry-run) 누락
- 규칙 5 (Push 전 사용자 승인) 누락 — 보고만 하고 통과 가정

**예방 규칙 (강화)**
```
사용자가 옵션 번호/시나리오 번호만 답하면:
  → 그것은 "방향 확정"일 뿐 "구현 설계 승인"이 아니다
  → Generator 진입 전 반드시 다음 산출물 사용자에게 제시:
     [1] 변경할 파일 목록 + 변경 내용 요약
     [2] DB UPDATE 영향 범위 (몇 건, 어떤 컬럼, idempotent 여부)
     [3] dry-run 절차 또는 dryRun 옵션 제공 방법
     [4] 롤백 계획
  → 사용자 명시적 "구현 진행" 또는 "OK, 코딩하세요" 답변 받은 후에만 코드 작성

같은 위반 3회 발생 시 사용자에게 시스템 차원 안전장치 (예: 모든 DB UPDATE
호출 전 사용자 confirmation prompt) 제안 의무.
```

**해결 처리**
- 사용자가 866c1e8 그대로 유지 결정 (작동 정상)
- 본 사례 자가 기록으로 RESOLVED
- 후속 작업 (보험료 다중 차량 매칭)은 정식 Researcher → Planner → 사용자 승인 → Generator

---

### 22. 하네스 GATE 우회 패턴 [ACTIVE — STRUCTURAL]
**현상**: 짧은 사용자 요청을 받으면 즉답 모드로 GATE 5(영향 검증)·6(코드 품질)·8(평가) 우회

**문제**:
- "통장 분류 좀 해줘" 같은 짧은 요청에도 외부 API 호출/대량 DB 쓰기가 포함됨
- 그런데 짧다는 이유로 Researcher → Planner 단계 생략하고 Generator로 직행
- 결과: 사용자가 QA 담당이 되어 매 단계마다 버그를 발견하고 보고

**규칙 (강제)**:
```
다음 중 하나라도 해당하면 GATE 1~9 풀 파이프라인 강제:
✓ 외부 API/LLM 호출 포함
✓ DB 대량 UPDATE/INSERT (≥10건)
✓ 사용자 자원 소모 (토큰, 비용, 시간)
✓ 새로운 통합 패턴 (SMS, 엑셀, 외부 연동)
✓ 마이그레이션 필요
✓ 보안/인증 변경

즉답 허용 조건:
✓ 단일 파일 typo/문법 수정
✓ UI 텍스트/색상 변경 (글래스 시스템 내)
✓ 기존 패턴 그대로 적용한 단순 추가
```

---

_마지막 업데이트: 2026-04-29_
