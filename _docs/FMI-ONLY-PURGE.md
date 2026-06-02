# PR-FMI-ONLY-PURGE — hmseok.com 단독회사 FMI 전용화 (라이드 분리)

> 작성: 2026-06-02 (복구 세션 `ecstatic-laughing-shannon`)
> 배경: 라이드 사업부가 별도 AWS 인프라(`ride-care-manager` / manager-dev.ridewithu.com)로
>       완전 분리 완료 → 본 ERP(hmseok.com / Self-Disruption)를 **순수 단독회사 FMI**로 정리.
> 전제: 라이드 레포는 본 repo 를 `upstream` 으로 **더 이상 merge 하지 않음**(영구 분기) →
>       본 repo 의 라이드 삭제가 라이드 운영에 전파되지 않음.

---

## 단계별 요약 (commit 순)

| Phase | commit | 내용 |
|---|---|---|
| 1 — 런타임 필터 | `fa5cebe` | `MODULE_PROFILE=fmi`(Dockerfile) + proxy 라우트/API 가드(fmi 한정 ride 차단) + meetings RIDE→SHARED 분리. 코드 삭제 0, 즉시 FMI 전용 동작. |
| 2 — 물리 삭제 | `d977a51` | 라이드 11모듈 + `/api/ride-*` 16개 + 라이드 전용 lib 15개 + 라이드 컴포넌트 **삭제(315파일, ~95.8K줄)**. menu-registry/PageTitle/ClientLayout 라이드 참조 정리. factory-search→operation 보존. |
| 3a — MODULE_PROFILE 제거 | `7d2c4ec` | `module-profile.ts` 삭제 + proxy 가드 + menu-registry 필터 + Dockerfile env 제거. (라이드 코드가 없어 필터 자체가 불필요) |
| 3b — 브랜드 FMI 상수화 | `7d2c4ec` | 회사 resolver(`company-brand`/`company-context`/`use-company`/`org-brand`) **FMI 고정** + proxy `ride.` 서브도메인 company_key 쿠키 제거. |
| 3c — HR plumbing 제거 | `f778f74` | `RideOrgPanel.tsx` 삭제(1,131줄) + hr/page·CompanyEmployeePanel·InviteModal·member-invite RIDE 분기 제거. 전환기 broken 7건 baseline 해제. |
| 3d — UI 죽은블록 제거 | `cdb770a` | dashboard 라이드홈 분기 + ClientLayout CX팀/MT팀/비전/관리자운영 죽은 sub-section·변수 제거. |
| 3e — 잔여 정리 + 문서 | (본 commit) | InviteModal RIDE 회사 옵션 제거 + 본 문서. |

---

## 제거된 것

- **라이드 페이지 모듈 11개**: RideAccidentReports, RideAccidents, RideAssets, RideCompliance,
  RideCustomerData, RideEmployees, RideMTOps, RideSettlements, RideVehicleRegistry, RideVision, CallScheduler
- **API**: `/api/ride-*` 16개, `/api/call-scheduler/*`, `app/call-scheduler`(공개 토큰)
- **라이드 전용 lib**: `compliance-*`(7), `cs-kpi-period`, `cs-shift-hours`, `erlang-c`, `lotto-rank`,
  `ride-asset-perm`, `ride-compliance-perm`, `destruction-cert-pdf`, `external-disposal-adapter`, `module-profile`
- **라이드 컴포넌트**: `app/components/ride-mt-ops`, `app/components/ride-ops`, `app/hr/_components/RideOrgPanel`
- **머신너리**: MODULE_PROFILE(빌드/런타임 env·proxy 가드·menu 필터), proxy `ride.` 서브도메인 멀티브랜드 쿠키

## 보존한 것 (의도적)

- **공유 모듈**: `meetings`(회의록 — 양쪽 사용), `factory-search`(사고대차 공장 추천 — 비라이드, operation 그룹으로 이동)
- **공유 lib**: `cafe24-db`(FMI 27곳), `company-brand`/`company-context`/`use-company`/`org-brand`(FMI 고정으로 유지), `korea-holiday-api`, `menu-registry`
- **레거시 company 인프라**: `company_id`/`companies` 테이블 + 관련 쿼리(82파일/280줄).
  → 단독회사에선 `company_id = FMI` 상수 필터라 **무해**. 제거는 기능 이득 0 + auth/데이터 스코핑 고위험이라 **보존**.
  회사 resolver만 FMI 고정 → RIDE 분기는 전부 죽은 코드.

## 남은 잔여(무해 — 후속 정리 가능)

- 주석 속 'RIDE' 언급: `api/me/company`, `api/profiles`, `with-company-scope`(제너릭 회사격리 헬퍼)
- `member-invite/route.ts` `target_company` 방어 ternary(항상 FMI 산출) + DB 컬럼(`target_company`/`ride_department_id`) — 인프라 보존
- hr/page.tsx 의 `topCompany === 'RIDE'` stat 분기(죽은 경로, 항상 0)
- `app/(employees)/factory-search/_meta-archive/` — **untracked(gitignore) 549M 로컬 디스크 bloat**.
  repo 무관. 로컬에서 `rm -rf` 로 디스크 회수 가능.

## 검증 기준

- 끊긴 import 0 / 소스 tsc 에러 89→51(감소, 새 에러 0) / api-trace newBroken 0
- FMI 메뉴 24개 유지 / 회사 resolver 전부 FMI / 라이드 코드·메뉴·머신너리 0
- 배포: 각 phase `main` push → Cloud Build → Cloud Run(hmseok.com)
