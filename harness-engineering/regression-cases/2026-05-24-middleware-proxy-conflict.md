# 회귀 케이스 — middleware.ts / proxy.ts 충돌로 빌드 전면 실패

- **일자**: 2026-05-24
- **PR**: PR-MULTI-BRAND P2 (commit 89d9a52) → hotfix (commit 3ddfef0)
- **심각도**: 🔴 Critical — main 빌드 6연속 실패, 프로덕션 배포 전면 중단

## input

PR-MULTI-BRAND P2 에서 서브도메인(ride.hmseok.com) 감지를 위해
프로젝트 루트에 `middleware.ts` 신설.

## expected

Cloud Build 통과 → Cloud Run 배포.

## actual_before_fix

89d9a52 이후 모든 Cloud Build 실패:

```
Build error occurred
Error: Both middleware file "./middleware.ts" and proxy file "./proxy.ts"
are detected. Please use "./proxy.ts" only.
```

89d9a52(P2) ~ 01e112f 까지 6개 커밋(여러 세션 작업 포함) 전부 빌드 실패.
사용자가 Cloud Build 기록 스크린샷으로 직접 발견.

## root_cause (3-Why)

1. **왜 빌드가 실패했나?** — middleware.ts 와 proxy.ts 가 동시에 존재.
2. **왜 두 파일이 공존했나?** — Next.js 16 은 `middleware.ts` 를 `proxy.ts`
   로 대체(rename). 프로젝트엔 이미 `proxy.ts`(CDN 캐시 방지)가 있었는데,
   P2 가 그걸 모르고 `middleware.ts` 를 새로 만듦.
3. **왜 모르고 만들었나?** — Next.js 16 의 미들웨어 규약(middleware→proxy)을
   사전 확인하지 않음. 루트에 이미 같은 역할 파일이 있는지 grep 하지 않음.
   P2 커밋 후 `next build` 검증을 생략 (CLAUDE.md 규칙 4 위반).

## prevention

1. **규칙 13 (외부 시스템 호환성)** 적용 대상에 "프레임워크 규약 파일"
   추가 — 루트 규약 파일(middleware/proxy/config) 신설 전 동일 역할 파일
   존재 여부 grep + 프레임워크 버전 규약 확인.
2. **규칙 4 (GATE 5 영향 검증)** 엄수 — 루트/빌드 영향 파일 변경 시
   `next build` 로컬 1회 필수. P2 는 이를 건너뛰어 6커밋 동안 누적 실패.
3. 자동화 후보: `harness-engineering/scripts/` 에 루트 규약 파일 중복 검사
   (middleware.ts + proxy.ts 동시 존재 시 pre-commit 차단) — TBD.

## 동형 패턴 점검 (규칙 14)

- 루트 단일 규약 파일: `proxy.ts`, `next.config.ts`, `instrumentation.ts`
  등 — "같은 역할 파일 2개" 가 빌드를 깨는 부류. 신설 전 항상 루트 확인.
