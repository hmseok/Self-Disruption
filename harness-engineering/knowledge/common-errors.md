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

_마지막 업데이트: 2026-04-25_
