# PR-MULTI-BRAND — 멀티회사 독립 브랜딩 설계서

> 작성: 2026-05-24 (sweet-amazing-galileo 메인 세션)
> 위탁: hr 세션(peaceful-laughing-volta) → 메인 세션 (인증·공통 영역)
> 상태: **설계 — 사용자 승인 대기** (GATE 3)

---

## 0. 목적

라이드주식회사와 FMI를 한 ERP 인스턴스에서 **독립 브랜딩**으로 운영.
핵심 요구 (사용자, 2026-05-24): **라이드 소속 직원은 FMI 라는 단어를
어디서도 보면 안 된다.** 로그인·초대·메일은 물론 앱 전체 테마까지.

## 1. 인터뷰 결정 (Rule 25 — 2026-05-24)

| 질문 | 결정 |
|------|------|
| 회사 판별 기준 | **별도 company 필드 신설** (companies 테이블 + profiles.company_id) |
| 로그인 페이지 분기 | **서브도메인** — `ride.hmseok.com` = 라이드 / `hmseok.com` = FMI |
| 브랜딩 범위 | **전체 테마** (회사명 + 로고 + 색상) |

## 2. 데이터 모델

### 2.1 `companies` 테이블 (신설)

```
companies
  id           VARCHAR PK
  key          VARCHAR  UNIQUE  -- 'FMI' | 'RIDE'  (코드 분기용)
  name         VARCHAR          -- '라이드주식회사' / '주식회사 에프엠아이'
  subdomain    VARCHAR  UNIQUE  -- 'ride' / '' (빈값=apex hmseok.com)
  logo_url     VARCHAR  NULL
  theme_json   JSON             -- { primary, accent, ... } 색상 토큰
  created_at   DATETIME
```

시드 2행: FMI(subdomain=''), RIDE(subdomain='ride').

### 2.2 `profiles.company_id` (컬럼 추가)

```
ALTER TABLE profiles ADD COLUMN company_id VARCHAR NULL;
```

백필: 기존 `lib/org-brand.ts` 의 detectOrgBrand(부서명·이메일도메인)
로직으로 기존 직원을 FMI/RIDE 분류 → company_id 채움.
멱등 (Rule 24): `UPDATE ... WHERE company_id IS NULL`.

> companies 미적용(테이블 없음) 시 graceful fallback — 기존 org-brand 사용.

## 3. 서브도메인 감지

Next.js `middleware.ts` (신설):
- `request.headers.get('host')` → subdomain 추출
- subdomain → company 해석 (`ride.` → RIDE, 그 외 → FMI)
- 응답에 `x-company-key` 헤더 / 쿠키 주입 → 서버·클라 양쪽에서 읽음

로그인 후: profiles.company_id 가 우선 (서브도메인과 불일치 시 로그).

## 4. 테마 시스템

- `companies.theme_json` → ThemeProvider (신규, `app/components/`)
- CSS 변수로 주입: `--brand-primary` 등. 기존 Soft Ice 토큰과 공존.
- 로그인 페이지(`app/page.tsx`) 포함 전 화면이 company 테마 적용.
- org-brand.ts 의 FMI/RIDE config 를 companies 레코드로 흡수 (deprecated 예고).

## 5. 영향 — 기존 PR-RIDE-BRAND 정정

PR-RIDE-BRAND (c1adfd8) 가 로그인·초대·메일을 **라이드 하드코딩**함.
본 설계에서 **company 기반 조건부**로 정정:
- `app/page.tsx` 로그인 — 하드코딩 '라이드주식회사' → company.name
- `member-invite` — companyName 하드코딩 → 초대 대상 company
- `InviteModal` — 동일

## 6. 단계 (Phase)

| P | 내용 | 의존 |
|---|------|------|
| P1 | companies 테이블 마이그 + profiles.company_id + 시드·백필 | — |
| P2 | middleware 서브도메인 감지 + company context | P1 |
| P3 | ThemeProvider + 로그인 페이지 company 분기 | P2 |
| P4 | 초대/메일 company 기반 (PR-RIDE-BRAND 조건부화) | P1 |
| P5 | InviteModal 선행 버그 — PAGE_GROUPS→menu-registry | 독립 |
| P6 | profiles↔ride_employees 동기화 (hr 세션 협업) | P1 |
| — | 「내 정보」 전체 오픈 (menu-registry requirePermission) | 독립·소 |

## 7. 배포 전제 (사용자/관리자 GCP 작업)

서브도메인 분기는 **DNS + Cloud Run 도메인 매핑**이 선행돼야 동작:
- `ride.hmseok.com` DNS 레코드 추가
- Cloud Run 서비스에 `ride.hmseok.com` 커스텀 도메인 매핑
- 코드(P2 미들웨어)는 host 헤더만 보므로, 매핑 전엔 FMI(기본)로 동작 — 안전.

## 8. 미해결 / 협업

- 라이드 로고 이미지 파일 — 사용자 제공 필요 (P3).
- ride_employees ↔ profiles FK — hr 세션과 P6 협업 (HR-OPERATIONS.md § 9).
- 기존 org-brand.ts — P3 이후 companies 로 일원화, 점진 deprecated.
