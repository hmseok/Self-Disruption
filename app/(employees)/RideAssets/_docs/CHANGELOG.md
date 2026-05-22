# RideAssets — 변경 이력

> Rule 22 — 모듈 _docs 갱신 의무. 매 PR 한 줄 (날짜 + PR 코드 + 한 줄 요약).

## 2026-05-16

- **PR-ASSETS-2.0** — 대량 등록(인라인 리스트 + 엑셀) + 매칭 대상 확장
  - 매칭 모델 전환: `assigned_user_id`(profiles) → `assigned_to_kind` + `assigned_to_id`
    · 'employee' = `ride_employees` (라이드 직원 16명) / 'freelancer' = `freelancers` (외부인력 22명)
    · 마이그 `2026-05-16_ride_assets_assign_v2.sql` — ALTER 멱등, collation 일치 확인
  - 신규 API: `assignee-options`(매칭 대상 통합 목록), `bulk`(대량 일괄 등록, 최대 200건/트랜잭션)
  - 신규 UI: NavTabs 「➕ 대량 등록」 탭 — 인라인 리스트 입력 그리드 + 엑셀 업로드
    · 엑셀 파싱·템플릿은 클라이언트사이드 xlsx 라이브러리 (표준 7컬럼)
    · 엑셀 카테고리·사용자는 이름으로 입력 → 자동 매핑, 동명이인·미존재 행 빨강 경고
  - 기존 API 5종(route/[id]/assign/qr/perm) 매칭 모델 동형 반영 (Rule 14)
  - 일반 사용자 편집 동선은 QR 스캔 페이지로 일원화 (외부인력 로그인 = freelancer.linked_profile_id)

- **PR-ASSETS-1.0-hotfix** — `users` → `profiles` 테이블명 수정 (긴급 버그픽스)
  - 사고: 코드 전체가 `LEFT JOIN users` 사용 → 실제 테이블은 `profiles` (users 미존재)
  - 증상: `Table 'fmi_op.users' doesn't exist` (코드 1146) → graceful fallback 이
    이 메시지의 `"doesn't exist"` 를 보고 「마이그레이션 미적용」으로 오인 → 배너 오표시
  - 수정 1: 8곳 `LEFT JOIN users` → `LEFT JOIN profiles` (5개 파일)
  - 수정 2: fallback 조건 정밀화 — `P2010` 단독 조건 제거, 메시지에 `ride_asset`
    테이블명 포함 시에만 `_migration_pending` 판정 (다른 테이블 에러 오인 방지)
  - 원인: Rule 11 위반 — `users` 테이블명을 schema 검증 없이 가정
  - 검증: profiles JOIN SQL 실DB 실행 성공, collation 일치 (utf8mb4_unicode_ci)

## 2026-05-14

- **PR-ASSETS-1.0** — 라이드 자산 관리 모듈 신설 (assets 세션 첫 PR)
  - 4 테이블 신설: `ride_asset_categories` / `ride_assets` / `ride_asset_admins` / `ride_asset_logs`
  - 초기 시드 5 카테고리: VH(차량) / OF(사무비품) / IT(IT장비) / CC(법인카드) / ET(기타)
  - 17 API 라우트: 자산 CRUD, 매칭, 카테고리, 권한자, QR 스캔, 로그
  - 메인 페이지: `/RideAssets` 단일 페이지 + 동적 NavTabs (카테고리 기반)
  - 모바일 QR 스캔 페이지: `/RideAssets/qr/[token]` — 본인 매칭자/권한자만 편집
  - 자산코드 자동 생성: `<CAT>-<YYYY>-<SEQ4>` (트랜잭션 + FOR UPDATE)
  - QR 라벨 PDF: jspdf 클라이언트사이드 (A4, 2×5 라벨/페이지). QR 이미지는 Phase 2 (qrcode 패키지 추가 필요)
  - 권한: 라이드 admin = 자동 권한자, `ride_asset_admins` 화이트리스트 추가
  - 일반 사용자: 본인 매칭 자산만 조회, 위치/메모 본인거만 편집 가능
  - graceful fallback: 마이그 미적용 시 빈 목록 + `_migration_pending` 배너 (Rule 23)
  - 동형 패턴: ride-vehicles 패턴 일관성 유지 (Rule 14)

## 알려진 한계 (Phase 2 예정)

- [ ] **QR 이미지** — 현재 PDF에 URL 텍스트만 표시. `qrcode` npm 패키지 추가 동의 받으면 실제 QR 이미지 임베드.
- [ ] **자산 변경 이력 UI** — `/api/ride-assets/[id]/logs` API는 작성됐으나, UI 표시는 별도 모달 미완성.
- [ ] **벌크 등록** — 다수 자산 일괄 등록 (CSV 또는 반복) 미구현.
- [ ] **자산 검색 강화** — 현재 자산명/자산코드만. 카테고리/위치/메모/사용자 통합 검색 추후.

## 마이그레이션 적용

```bash
mysql -h <HOST> -u <USER> -p <DB> < migrations/2026-05-14_ride_assets.sql
```

또는 DBeaver. 적용 후 파일 하단 「검증 SELECT」 5개 모두 통과 확인 권장.
