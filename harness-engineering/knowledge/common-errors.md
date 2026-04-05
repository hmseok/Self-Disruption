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

_마지막 업데이트: 2026-04-04_
