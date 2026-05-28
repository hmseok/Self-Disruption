# RideCompliance — 모듈 CHANGELOG

> **모듈**: `app/(employees)/RideCompliance/*` + `app/api/ride-compliance/*` + `lib/ride-compliance-perm.ts`
> **상위 _docs**: `_docs/COMPLIANCE-PERSONAS.md` + `_docs/COMPLIANCE-DATA-MODEL.md`
> **단일 진실 원본**: 라이드케어 「개인정보보호 내부관리계획서 (통합본)」 V1.0 — RIDE-PMP-2026-001 (시행 2026.05.20)

---

## v1.4-fix10~13 — PDF 풀세트 + 규정 문서 관리 CRUD (2026-05-19~22)

**사용자 통찰**:
- "마크다운도 실제처럼 구성 안 됨, 최대한 가깝게" / "pdf 원본 보여주고 pdf 수정기능"
- "원본이면 섹션목차하고, 검토 llm은 어떻게 사용할수있나요?" / "제대로 보고 제대로 사용하고싶은데"
- "「자료실」 명칭이 검수→승인→관리 흐름과 안 어울림 / 기존 자료 삭제 후 새로 업로드 플로우 검증하려는데 구조와 안 맞음"

**fix10 — PDF 모드 기본화**: 매뉴얼 페이지 진입 시 PDF 자동 표시 (viewMode 기본 'pdf' + 자동 로딩, PDF 없으면 'md' fallback)

**fix11 — PDF 새 버전 업로드 워크플로우**:
- 매뉴얼 PDF 모드 헤더에 「📥 PDF 다운로드」 + 「📤 새 버전 업로드」
- `NewVersionUploadModal` — version_no 자동 증가 (V1.0→V1.1), signed URL → GCS PUT → POST document-versions
- `document-versions` POST 확장 — `gcs_object_path` + `reset_master_verification` (활성 시 기존 active→superseded, 검수 자동 reset)

**fix12 — PDF 풀세트 통합**:
- `harness-engineering/scripts/seed-compliance-content-md.js` 신규 — PDF→마크다운 batch 추출 (pdf-parse, 휴리스틱 헤더 변환) → content_md UPDATE 4건
- `package.json` — pdf-parse 의존성 + seed:compliance-content-md / seed:compliance-pdfs npm scripts
- 매뉴얼 페이지 — 좌측 섹션 목차 클릭 시 PDF→마크다운 자동 전환 + anchor scroll (`SectionTOC.onSelectSection`)

**fix13 — 규정 문서 관리 CRUD 완성**:
- 탭 명칭 「자료실」 → 「규정 문서 관리」 (검수→승인→버전관리 흐름 반영)
- `app/api/ride-compliance/documents/[id]/route.ts` 신규:
  - DELETE — manager+, $transaction cascade (versions + form_submissions 삭제, tasks.source_document_id→NULL, GCS object best-effort 삭제)
  - PATCH `{action:'reset'}` — 검수 상태 리셋 (is_master_verified=0 / status=pending / verified_by_* NULL, 본문·PDF·버전 유지)
- DocumentsTabContent — 「+ 신규 문서 등록」 버튼 + 행별 「🔄 리셋」/「🗑 삭제」 (manager+), 시드 문서(RIDE-*/F-*) 삭제 시 경고
- `NewDocumentModal` 신규 — doc_code/type/title/parent/retention/classification 입력 → POST documents

**Rule 준수**: Rule 14 동형(4 매뉴얼 batch) / Rule 22 _docs / Rule 23 graceful(gcs_object_path·source_document_id 컬럼 미적용 try/catch) / Rule 27 lint:harness 새 위반 0 / SESSIONS-COORDINATION § 7 (heredoc commit, 명시적 add, commit+push 한 동작)

---

## v1.4 — 자동 검토·정합성·승인·스케줄 자동화 (2026-05-19)

**사용자 비전 (2026-05-19)**:
"업로드 서류의 기본 법적/보안 기준 검토 작동 + 단일 검토가 행동·진행 스케줄·액션 영역 요약 추출 + 단일 검토 완료 시 다른 서류 간 정합성 검수 + 최종 정정 또는 완료 승인이 되면 기준에 따라 적용 스케줄·스텝별 자동 작동"

**결단**: `3+LLM` — Phase 1.4-A1 + B + C + D 일괄 진행 + Gemini LLM 통합.

**신규 파일 8개 (1,925줄)**:
- `migrations/2026-05-19_ride_compliance_phase14.sql` (108) — 8 컬럼 ALTER (review_results JSON / extracted_actions JSON / last_reviewed_at / review_score / review_engine / schedule_applied_at + tasks 의 source_document_id + auto_generated)
- `lib/compliance-lint-rules.ts` (215) — 14 lint 규칙 (LEGAL 7 + SEC 5 + QUAL 2). 점수 100 만점 (error -10 / warning -3 / info -1)
- `lib/compliance-action-extractor.ts` (211) — 정규식 기반 액션 추출 (task / form / notify / policy). 주기·카테고리·책임자·서식코드·법조항 자동 인식
- `lib/compliance-llm-extractor.ts` (260) — Gemini gemini-2.5-flash 통합 (Rule 3 안전망: thinkingBudget=0 / responseMimeType=json / timeout 25s / graceful fallback)
- `lib/compliance-schedule-applier.ts` (200) — extracted_actions → tasks 자동 INSERT (frequency→months 변환, 중복 회피, auto_generated=1 추적)
- `app/api/ride-compliance/documents/[id]/single-review/route.ts` (151) — POST: lint + 액션 추출 통합 + DB 저장
- `app/api/ride-compliance/documents/[id]/approve/route.ts` (99) — POST CPO 승인 + 스케줄 자동 적용
- `app/(employees)/RideCompliance/manuals/[code]/page.tsx` — AutoReviewPanel 컴포넌트 추가 (lint 결과 + 액션 list + 승인 버튼)

**14 Lint 규칙**:
LEGAL-01 내부관리계획 의무사항 / LEGAL-02 교육 빈도 / LEGAL-03 자체감사 / LEGAL-04 파기 / LEGAL-05 24h 통지 / LEGAL-06 보존기간 / LEGAL-07 접근권한
SEC-01 등급 분류 / SEC-02 암호화 / SEC-03 접근통제 / SEC-04 접속기록 / SEC-05 물리적 접근제한
QUAL-01 본문 길이 / QUAL-02 서식 참조

**액션 추출 4 type**:
- task — 주기 운영 (annual/biannual/quarterly/monthly/on_event)
- form — 서식 작성 (F-* 인용)
- notify — 통지·보고 (24h)
- policy — 정책 적용 (등급·암호화·2FA)

**스케줄 자동 적용 흐름**:
1. 관리자 「🔍 검토 시작」 → single-review API → lint + 추출
2. CPO 「✓ 승인 + 스케줄 적용」 → approve API
3. extracted_actions.actions 의 task 만 → frequency·months 따라 ride_compliance_tasks 자동 INSERT
4. source_document_id + auto_generated=1 추적
5. 9 step playbook 의 해당 step 자동 활성화 (stepStatus 자동 계산)

**Rule 준수 (Rule 1 풀 파이프라인 + Rule 3 외부 LLM 안전망)**:
- ✅ Rule 1 풀 파이프라인 (DB + lib + API + UI)
- ✅ Rule 3 [A] 모델 quirk: gemini-2.5-flash + thinkingBudget=0 + responseMimeType=json
- ✅ Rule 3 [C] 안전망: timeout 25s + 본문 100KB 제한 + graceful fallback (env 미설정 시 정규식만)
- ✅ Rule 14 동형 / Rule 22 _docs / Rule 23 graceful (_migration_pending phase14) / Rule 24 멱등 (UNIQUE task_code)
- ✅ Rule 27 lint:harness 새 critical 위반 0

**Phase 1.5 예고**:
산출물·외부 송부 트래커 (deliverables) — 임명장 / 단말기 반출대장 / 파기 확인서 / 유출 통지서 등 외부 송부 통합 관리.

---

## v1.3-G2 + 1.3-H — 본문 마크다운 렌더링 + 뒤로가기 UX + 정합성 검사 통합 (2026-05-19)

**사용자 피드백 4건**:
1. "본문이 기존 문서 형식처럼 제대로 정리 안 되어있음" → 마크다운 → HTML 렌더링
2. "뒤로하면 메인탭으로 가는 것도 불편" → ?tab=documents query param + useSearchParams
3. "제대로 안 나온 것도 있음" → 본문 표시 영역 PDF 문서 형식으로 정돈
4. "서로간의 정합성 검사의 영역도 안 보임" → 1.3-H 즉시 통합

**신규 파일 2건**:
- `lib/simple-markdown.ts` (196줄) — 경량 마크다운 → React 노드 파서
  - H1~H4 / 단락 / 수평선 / 리스트 (불릿·번호) / 표 / inline (bold·code)
  - PDF 문서처럼 정돈된 시각 렌더링 (헤더 borderBottom, 단락 padding)
- `app/api/ride-compliance/consistency-check/route.ts` (271줄) — 매뉴얼 cross-reference lint
  - 7 카테고리: people / forms / clauses / dates / frequency / orphans / coverage
  - 정합성 점수 100점 만점 (error 10 / warning 3 / info 1 차감)

**변경 4 파일**:
- `app/(employees)/RideCompliance/page.tsx` (2023→2179줄, +156)
  - `useSearchParams` 추가 — URL `?tab=documents` 로 진입 시 자동 탭 설정
  - 운영 가이드 탭 안에 `ConsistencyCheckWidget` 추가 (검사 시작 버튼 + 결과 카테고리별 펼침)
  - `StatBlock` 보조 컴포넌트
- `app/(employees)/RideCompliance/manuals/[code]/page.tsx` — `<pre>` raw text → `renderMarkdown()` 호출
- `app/(employees)/RideCompliance/manuals/[code]/page.tsx` — 뒤로가기 link 모두 `?tab=documents` 로
- `app/(employees)/RideCompliance/forms/[code]/page.tsx` — 뒤로가기 link 모두 `?tab=documents` 로

**효과**:
- 매뉴얼 본문이 시각적으로 정돈됨 (헤더·단락·표·리스트 모두 마크다운 렌더링)
- 매뉴얼·서식 페이지에서 ← 뒤로가기 시 자료실 탭으로 직접 (메인 X)
- 운영 가이드 탭 안에 「🔍 매뉴얼 정합성 검사」 위젯 — 검사 클릭 → 7 카테고리 자동 lint → 결과
- 정합성 점수 자동 (예: 0 issues → 100점)

**검증 항목 (7 카테고리)**:
1. people — 매뉴얼 외 인명 발견 (제6조 명시 인원 외 등장 시 warning)
2. forms — F-M01-01 등 catalog 미등록 서식 참조 (error)
3. clauses — 제N조 범위 초과 (통합본 제1~33조)
4. dates — V1.0 시행일 2026-05-20 불일치
5. frequency — 빈도 표기 약함 (정보 알림)
6. orphans — 검수 완료지만 본문 미입력
7. coverage — RIDE-M02 등 catalog 미등록 매뉴얼 인용

**Rule 준수**:
- ✅ Rule 14 동형 / Rule 19/20 / Rule 22 _docs / Rule 27 lint:harness 통과

---

## v1.3-G — 매뉴얼 본문 import seed + 운영 가이드 컴팩트 list 재설계 (2026-05-19)

**사용자 통찰 (2026-05-19)**:
1. "메뉴얼을 아직도 볼 수 없는데" → sandbox 추출본 활용 자동 import (옵션 A)
2. "운영 가이드 카드탭은 보기가 썩 편하지 않다" → 컴팩트 list 재설계 (옵션 2)

**1. 매뉴얼 본문 import seed 작업**:
- `migrations/_seed/manuals/` 4 매뉴얼 마크다운:
  - `RIDE-PMP.md` (169 KB, 통합본 9장 27조 + 별첨 7)
  - `RIDE-M01.md` (55 KB, 유출 대응 + 서식 6종)
  - `RIDE-M05.md` (8 KB, 파기 절차)
  - `RIDE-M06.md` (23 KB, 단말기 반출)
- 자동 마크다운 헤더 변환: 제N장 → `##`, 제N조 → `###`, 별첨 → `##`, 서식 → `###`
- `harness-engineering/scripts/seed-compliance-manuals.js` 신규 — Node + Prisma 로 4 매뉴얼 본문을 DB content_md 에 UPDATE
- `package.json scripts`: `seed:compliance-manuals` 추가
- 사용법: `npm run seed:compliance-manuals` (1회 실행, OVERWRITE=1 환경변수로 재실행 가능)
- 미포함: RIDE-M02/M03/M04 (PDF 원본 없음) → 사용자가 UI 「✎ 본문 편집」 으로 직접 작성

**2. 운영 가이드 탭 — 카드 grid → 컴팩트 list (옵션 2)**:
- 변경 위치: `OperationGuideTabContent` 함수 안의 9 step 카드 grid 영역
- 신규 컴포넌트 `PlaybookStepList`:
  - 한 행 = [번호 배지] + emoji 제목 + 진행상태 배지 + 요약 + 「→ 바로가기」 + 「▸ 펼침 토글」
  - 한 화면에 9 step 모두 보임 (시각적 압축)
  - 「▸ 펼침」 클릭 시 상세 (목적·근거·빈도·책임·산출 + 상세 설명 + 추가 link)
  - 다음 우선 step 자동 강조 (배경 색 + 「👉 다음」 배지)
- 카드 grid 의 큰 시각 영역 → list 의 한 줄 (정보 밀도 ↑)

**효과**:
- 매뉴얼 4건 본문 즉시 열람 가능 (npm run seed:compliance-manuals 실행 후)
- 운영 가이드 한눈에 9 step 진행 상태 + 필요시 상세 펼침
- 사용자 진입 → 다음 우선 step → 바로가기 → 작업 흐름 자연스러움

**Rule 준수**:
- ✅ Rule 14 동형 / Rule 19 줄바꿈 / Rule 20 글래스 패널
- ✅ Rule 22 _docs 갱신 / Rule 27 lint:harness 통과

**다음 PR (1.3-H 예정)**:
- 매뉴얼 간 정합성 검사 (cross-reference lint) — 인명/빈도/서식번호/조항번호/시행일 충돌·누락 자동 감지

---

## v1.3-F — 운영 가이드 탭 (9 step Playbook) (2026-05-19)

**사용자 통찰 (2026-05-19)**:
"스텝바이로 진행하면 정보보안을 규정에 맞게 확립하고 놓치지 않고 진행할 수 있게"
→ 매뉴얼 통합본 5.17 9장 27조 + 별첨 7 의 운영 흐름을 9개 step 으로 재구성. 「📖 운영 가이드」 탭 신규.

**9 PLAYBOOK_STEPS** (각 step: 목적/법적 근거/빈도/책임자/산출물/상세/바로가기/캘린더):
1. 👔 조직 임명 (제6/9조, 1회+변동)
2. 📚 자료 등록·검수 (사용자 추가-C, 등록·개정 시)
3. 📦 정보자산 등록 (제10~18조, 자산 도입 시)
4. 📅 연간 계획 수립 (제29조, 매년 1월)
5. 🎓 교육 실시 (제22~23조, 2/7월)
6. 🔍 정기 점검·파기 (제20조+제28~33조, 3/6/9/12월)
7. 🔎 자체 감사 (제20~21조+법 제31조, 5/10월)
8. 🤝 수탁사 관리 (제24조, 4/9월)
9. 🚨 침해사고 대응 (제25~27조, 상시)

**구현**:
- `app/(employees)/RideCompliance/page.tsx` (1593→1956줄, +363)
- TabKey 8종 (`guide` 추가) + NavTabs 7→8 확장
- `OperationGuideTabContent` 함수:
  - 진행 상태 자동 계산 (DB 데이터 기반 9 statusKey)
  - 다음 우선 step 자동 식별 (가장 빠른 미완료 → 「👉 다음 단계」 강조)
  - 9 step 카드 grid (3×3 반응형) + 색상 (✓ 완료 / 👉 다음 / 대기)
  - 12개월 캘린더 시각화 (별첨 7 task 매핑 + 월별 완료율)

**효과**:
- 첫 진입 시 "무엇부터 시작" 즉시 명시 (다음 우선 step 강조)
- 각 step 의 법적 근거 표시 — 미수행 시 법규 위반 위험 인지
- 진행 상태 자동 — 9 step 중 어디까지 완료됐는지 한눈에
- 「바로가기」 → 해당 탭으로 즉시 이동

**Rule 준수**:
- ✅ Rule 14 동형 / Rule 19 줄바꿈 / Rule 20 글래스 패널
- ✅ Rule 22 _docs 갱신 / Rule 27 lint:harness 새 critical 위반 0

---

## v1.3 — Phase 1.3-A + 1.3-B + 1.3-D 매뉴얼·서식별 종류 페이지 + 마크다운 본문 + GCS 통합 (2026-05-19)

**사용자 통찰 (2026-05-19) 모두 반영**:
- "매뉴얼은 종류별로 구분되어 있으면 좋겠다" → `/RideCompliance/manuals/[code]` 매뉴얼 7건 독립 라우트
- "가장 안전하고 확실한 보존" → 마크다운 본문 (DB) + PDF 원본 (GCS or 외부 link) 동시 보존 (옵션 D)
- "서식관리·각양식은 실제 페이지로 종류별 다르게" → `/RideCompliance/forms/[code]` 동적 페이지 (카테고리 / 개별 / index 3 분기)

**신규 파일 5개 (1209줄)**:
- `migrations/2026-05-19_ride_compliance_phase13.sql` (130줄) — ALTER TABLE 5건 (content_md / form_fields_schema / gcs_object_path)
- `app/api/ride-compliance/documents/[id]/content/route.ts` (103줄) — 본문 GET/PATCH. PATCH 시 자동 검수 revoke (안전 기본값)
- `app/api/ride-compliance/upload-url/route.ts` (139줄) — GCS signed URL POST (업로드) / GET (다운로드). env 미설정 시 501 + 셋업 가이드
- `app/(employees)/RideCompliance/manuals/[code]/page.tsx` (450줄) — 매뉴얼별 페이지 + 좌측 메타·원본·버전 + 우측 마크다운 뷰어/에디터 + UploadModal (link/GCS 토글)
- `app/(employees)/RideCompliance/forms/[code]/page.tsx` (387줄) — 카테고리/개별/index 3 분기 + 작성 인스턴스 list + SubmitModal

**변경 파일 2개**:
- `app/(employees)/RideCompliance/page.tsx` — DocumentsTabContent 의 doc_code 컬럼 Link 처리 (매뉴얼·서식 페이지로 deep-link)
- `app/api/ride-compliance/documents/route.ts` — update_file_url_only 분기 확장 (gcs_object_path 동시 갱신, 컬럼 미존재 시 graceful fallback)

**향후 작업**:
- Phase 1.3-C — 19 서식별 fields 정의 (JSON schema) + 종류별 작성 폼 + 검토 흐름
- Phase 1.3-E — 매뉴얼 본문 마크다운 import script (sandbox 의 추출 텍스트 4671줄을 시드 import)
- Phase 1.4 — 개인정보 처리방침 + 동의 이력

**Rule 준수 self-check (Rule 27 commit GATE)**:
- ✅ Rule 1 풀 파이프라인 (DB ALTER + API 2 신규 + UI 2 신규 + 2 수정)
- ✅ Rule 7 GO 키워드 수신 후 코드 작성 (Q1=2 + Q2=나)
- ✅ Rule 11 컬럼 사전 검증 (content_md/form_fields_schema/gcs_object_path 모두 명시)
- ✅ Rule 14 동형 (Phase 1.1/1.2 라이드 모듈 패턴)
- ✅ Rule 18 NeuDataTable 모든 컬럼 sortBy
- ✅ Rule 19 줄바꿈 최소화
- ✅ Rule 20 글래스 패널 (alert 미사용)
- ✅ Rule 21 자기 모듈만 (menu-registry 미수정)
- ✅ Rule 22 _docs 갱신 (CHANGELOG v1.3)
- ✅ Rule 23 graceful fallback — `_migration_pending: 'phase13'`, GCS env 미설정 시 501 + 가이드
- ✅ Rule 27 commit GATE
- ✅ `git commit --no-verify` 미사용

---

## v1.2 — Phase 1.2 자료·서식 카탈로그 + 버전 + 주기적 운영 Task + 작성 트래커 (2026-05-18)

**사용자 통찰 (2026-05-18) 모두 반영**:
- 추가-A: 관리자가 매뉴얼대로 진행 체크 — 연간 진행률 carousel 위젯 (카테고리별 mini gauge)
- 추가-B: D-7/D-3/D-day 임박 알림 — `tasks.reminder_*_sent` 컬럼 + 「📌 다가오는 일정」 위젯 색상 (D-3 빨강 / D-7 앰버 / D-14 파랑)
- 추가-C: 원본 검수 단계 분리 — `documents.is_master_verified` + `/verify` PATCH + form-submissions 마스터 미검수 차단

**신규 파일 11개 (1593 + α 줄)**:
- `migrations/2026-05-18_ride_compliance_phase12.sql` (382줄) — 5 테이블 CREATE + 시드 44행
- `app/api/ride-compliance/documents/route.ts` (188줄) — GET/POST (+ update_file_url_only 분기)
- `app/api/ride-compliance/documents/[id]/verify/route.ts` (81줄) — CPO 검수 PATCH (+ revoke)
- `app/api/ride-compliance/document-versions/route.ts` (145줄) — 버전 이력 GET/POST (활성화 자동 supersede)
- `app/api/ride-compliance/annual-plans/route.ts` (129줄) — 연간 마스터 GET/POST
- `app/api/ride-compliance/tasks/route.ts` (197줄) — 월별 task GET (+upcoming_days 필터) /POST
- `app/api/ride-compliance/tasks/[id]/complete/route.ts` (107줄) — 5 액션 PATCH (start/complete/cpo_review/reopen/skip)
- `app/api/ride-compliance/form-submissions/route.ts` (190줄) — 작성 인스턴스 GET (+expiring_days) /POST (+ MASTER_NOT_VERIFIED 차단)
- `_docs/COMPLIANCE-DATA-MODEL.md` (421줄) — 14 도메인 포용 재구조 + Phase 1.2 5 테이블 상세
- `lib/ride-compliance-perm.ts` 확장 — `canVerifyMaster` (CPO only), `canSubmitForm` 추가

**변경 파일 1개**:
- `app/(employees)/RideCompliance/page.tsx` (909→1593줄) — NavTabs 4→7 탭, 위젯 3, 모달 4 추가

**시드 데이터 (마이그 적용 즉시 운영 가능)**:
- documents 25행 — 6 매뉴얼 (RIDE-PMP, RIDE-M01~06) + 18 서식 (F-M01-01~06, F-M02-01~04, F-M05-01~04, F-14-1/2, F-06, F-07) + 1 정책 (RIDE-POL-PRIVACY). 모두 `status='pending'`, `is_master_verified=0`, `file_url=NULL` — 관리자 URL 입력 → CPO 검수 → 활성화 흐름.
- document_versions 6행 — 각 매뉴얼 V1.0 (시행 2026.05.20)
- annual_plans 1행 — RIDE-PLAN-2026-001 (시행 2026.05.20)
- tasks 12행 — 별첨 7 의 1~12월 task carousel

**매뉴얼 조항 매핑 (Phase 1.2 신규)**:
- documents ← 통합본 5.17 「파생서류 목차」 별첨 1~6 + 별첨 7 (F-06/F-07)
- document_versions ← 통합본 5.17 「제·개정 이력」 (2019.07.01~2026.05.15)
- annual_plans ← 별첨 7 RIDE-PLAN-2026-001 + 개인정보보호법 제29조
- tasks ← 별첨 7 「2026년 상·하반기 월별 관리 일정」
- form_submissions ← 18 서식 + 제33조 「파기대장 최소 3년」 + 제15조 「접속기록」 3년 보존

**검증**:
- `npm run lint:harness` ✅ 새 critical 위반 0, commit 통과 (hardcode `rgba(255,255,255,0.5)` 4건 → `COLORS.bgGray` 치환)
- 누적 신규 파일 11개, 약 2200줄 추가

**향후 작업**:
- Phase 1.2.1 — GCS 자동 업로드 + signed URL 통합 (현재 외부 URL paste)
- Phase 1.2.2 — D-7/D-3/D-day 자동 알림 발송 (scheduled-tasks Cron + 이메일/잔디)
- Phase 1.2.3 — 월간 결과보고서 PDF export
- Phase 1.3 — audits / destructions / access_reviews / drills / processors

**Rule 준수 self-check (Rule 27 commit GATE)**:
- ✅ Rule 1 풀 파이프라인 (DB 5 + API 10 + UI 7탭)
- ✅ Rule 7 GO 키워드 수신 후 코드 작성
- ✅ Rule 11 컬럼 사전 검증 (Profile 일관 사용)
- ✅ Rule 14 동형 (Phase 1.1 / RideAssets 패턴)
- ✅ Rule 18 NeuDataTable 모든 컬럼 sortBy
- ✅ Rule 19 줄바꿈 최소화 (가급적 한 줄)
- ✅ Rule 20 결과 글래스 패널 (alert 미사용)
- ✅ Rule 21 자기 모듈만 (menu-registry 미수정)
- ✅ Rule 22 _docs 갱신 (DATA-MODEL + 본 CHANGELOG)
- ✅ Rule 23 graceful fallback (`_migration_pending: 'phase12'`)
- ✅ Rule 24 시드 멱등 (INSERT IGNORE + UNIQUE KEY)
- ✅ Rule 26 페르소나 흐름 (사용자 추가-A/B/C 통찰 반영)
- ✅ Rule 27 commit GATE
- ✅ `git commit --no-verify` 미사용

---

## v1.1-FIX1 — Hotfix users → profiles 치환 (2026-05-18)

**원인**: 사용자 콘솔 진단에서 `/api/ride-compliance/officers` 응답이
`{ success: true, data: [], meta: { _migration_pending: true, my_role: 'cpo' } }`.
실제 마이그는 정상(테이블 3개·컬럼 11/19/26 모두 생성). 본 시스템 인증 테이블은
`users` 가 아니라 `profiles` (`@@map("profiles")` 모델 Profile, `password_hash` 보유).
SQL `LEFT JOIN users u` 가 "doesn't exist" 로 throw → catch 분기가 마이그 미적용으로 오인.

**치환** (10건 + 주석 2건):
- `app/api/ride-compliance/officers/route.ts` × 2 (GET / POST 응답)
- `app/api/ride-compliance/assets/route.ts` × 4 (`LEFT JOIN users ou` + `LEFT JOIN users ru`, GET + POST 응답)
- `app/api/ride-compliance/incidents/route.ts` × 4 (`LEFT JOIN users ru` + `LEFT JOIN users au`, GET + POST 응답)
- `lib/ride-compliance-perm.ts` 주석 2건 (`users.role` → `profiles.role`)
- bonus: `btnSecondary` 의 hardcode `rgba(255,255,255,0.6)` → `COLORS.bgGray` (ui-token-lint 통과)

**검증**:
- `npm run lint:harness` ✅ 새 critical 위반 0, commit 통과
- Rule 11 컬럼 사전 검증: Profile 모델 `id Char(36)` + `name String?` + `role` 모두 존재 확인
- Rule 27 GATE: G5 단순 치환 ✓ / G6 lint 통과 ✓
- 테스트 권장: `fetch('/api/ride-compliance/officers', { headers: { Authorization: \`Bearer \${localStorage.getItem('fmi_token')}\` } }).then(r=>r.json())` → `meta._migration_pending` 미포함 ✅

**참고**: 다른 라이드 API (`app/api/ride-assets/route.ts` 등)도 `LEFT JOIN users` 사용 중 → 본 세션 영역 외라 미수정. 메인 세션이 일괄 수정 검토 권장.

---

## v1.1 — Phase 1.1 코어 3 도메인 (2026-05-18, compliance 세션)

### 신규 파일
- `migrations/2026-05-18_ride_compliance_phase11.sql` — 3 테이블 CREATE (officers / assets / incidents)
- `lib/ride-compliance-perm.ts` — 4 헬퍼 (getOfficerRole / isCpo / isManager / canHandleIncident / canReportIncident)
- `app/api/ride-compliance/officers/route.ts` — GET (role 필터, handler 본인만) + POST (cpo·admin)
- `app/api/ride-compliance/assets/route.ts` — GET (type/classification/status/pii 필터) + POST (manager+, asset_code 자동 생성 `RC-{prefix}-{YYYY}-{0000}`)
- `app/api/ride-compliance/incidents/route.ts` — GET (manager+/incident_team 전체, handler 본인 보고건만) + POST (인증 모든 사용자, incident_code 자동 `INC-{YYYY}-{0000}`)
- `app/(employees)/RideCompliance/page.tsx` — 메인 (NavTabs 4탭: 대시보드/자산/사고/조직 + DcStatStrip 5 stat + 3 Modal)
- `app/(employees)/RideCompliance/assets/[id]/page.tsx` — 자산 상세 (read-only, 매뉴얼 조항 참조)
- `app/(employees)/RideCompliance/incidents/[id]/page.tsx` — 사고 상세 (24h SLA 시계, 매뉴얼 조항 참조)
- `_docs/COMPLIANCE-PERSONAS.md` — 페르소나 8 섹션 (5 페르소나 + 5 영역 운영 사실)
- `_docs/COMPLIANCE-DATA-MODEL.md` — 데이터 모델 6 섹션 (14 도메인 중 Phase 1.1 3 테이블 상세)

### 운영 사실 인터뷰 (Rule 25)
- **소스**: 사용자 [A]~[E] 답변 + 매뉴얼 통합본 5.17 정독 (불일치 시 매뉴얼 우선, 사용자 동의)
- **[B] 운영 성숙도**: 「체계 성숙기 + 인력 성장기」 (체계는 2019 제정·9회 수정·9장 27조 / 인력은 CPO 1명 + 관리자 2명 겸직)
- **[C] 자산 등급**: 3단계 (public / internal / confidential — 매뉴얼 본문 분류와 정합)
- **[D] 역할**: 3-tier — `cpo`(임성민 이사) / `manager`(석호민·양재희 부장) / `handler`(전 임직원) + 보조 `incident_team`(관리팀 제26조)
- **[E] UI**: 하이브리드 — 메인 NavTabs + assets/incidents 상세 sub-route

### 매뉴얼 조항 매핑
- `officers` ← 제6조 (책임자 지정), 제7조 (책임자 의무), 제9조 (취급자 범위)
- `assets` ← 제10조 (물리적), 제11조 (출력·복사·파기), 제12조 (접근권한), 제13조 (암호화), 제14조 (접근통제), 제16~19조 (보안프로그램·CCTV·스마트기기·주민번호)
- `incidents` ← 제25조 (24h 통지), 제26조 (관리팀 일선), 제27조 (대응절차) + 유출대응 매뉴얼 (서식 F-M01-01~06)

### 미해결 (메인 세션 위탁)
- `lib/menu-registry.ts` — `mod-ride-compliance` entry 등록 (사이드바 노출)
- `app/components/PageTitle.tsx` — PATH_TO_GROUP + PAGE_NAMES 매핑 (`/RideCompliance` → `admin-ops` / `🔒 라이드 정보보안`)
- 메인 세션 push 후 `git pull` → 사이드바에 본 모듈 출현

### Phase 1.2 예정 (다음 세션)
- 교육: `ride_compliance_trainings` + `ride_compliance_training_records` (서식 F-06 / F-07)
- 자체감사: `ride_compliance_audits` (반기 1회, 제20~21조)
- 연간계획: `ride_compliance_annual_plans` (RIDE-PLAN-2026 월별 일람표)

### Rule 준수 self-check (Rule 27 commit GATE)
- ✅ Rule 1 풀 파이프라인 (DB + API + UI)
- ✅ Rule 7 GO 키워드 수신 후 코드 작성
- ✅ Rule 11 enum/컬럼/경로 사전 검증
- ✅ Rule 14 동형 패턴 (RideVehicleRegistry / RideAssets)
- ✅ Rule 18 NeuDataTable 모든 컬럼 sortBy
- ✅ Rule 19 줄바꿈 최소화
- ✅ Rule 20 결과 글래스 패널
- ✅ Rule 21 자기 모듈만 commit (menu-registry / PageTitle 은 메인 위탁)
- ✅ Rule 22 _docs 갱신 (PERSONAS + DATA-MODEL + 본 CHANGELOG)
- ✅ Rule 23 graceful fallback (`_migration_pending` banner + API)
- ✅ Rule 24 시드 멱등 (시드 자체 없음, INSERT IGNORE 가능 구조)
- ✅ Rule 25 운영 사실 인터뷰 (매뉴얼 통합본 5.17 1차 소스)
- ✅ Rule 26 페르소나 사전 워크-스루 (5 페르소나)
- ✅ Rule 27 commit GATE 본 체크리스트
- ✅ `git commit --no-verify` 사용 안 함

---

## Phase 1.5 — 산출물·외부 송부 트래커 (2026-05-28)

**도메인**: 임명장 / 단말기 반출대장 / 파기 확인서 / 유출 통지서 / 자체감사 결과서 등
외부 기관·내부 부서 송부 추적. `ride_compliance_form_submissions` (내부 작성본) 과 별개.

### 운영 흐름 (5 상태)
1. **draft** — 관리자가 코드/제목/내용 등록
2. **approved** — CPO 가 검토 후 승인 (`approved_by`, `approved_at` 자동)
3. **sent** — 외부 송부 (수신처/방법/일시 — `sent_method`: email/post/courier/portal/fax/in_person)
4. **responded** — 답변 수신 (`response_received_at`, `response_note`)
5. **closed** — 종결 (답변 없이 종료 또는 응답 후 마감)

### 변경 파일

| # | 파일 | 종류 |
|---|------|------|
| 1 | `migrations/2026-05-28_ride_compliance_phase15.sql` | DDL — `ride_compliance_deliverables` (22 컬럼, UNIQUE `deliverable_code`, 6 인덱스) |
| 2 | `app/api/ride-compliance/deliverables/route.ts` | GET list (filter category/status/q/sent_from/sent_to) + POST create (manager+) |
| 3 | `app/api/ride-compliance/deliverables/[id]/route.ts` | GET / PATCH (상태 전이 자동 타임스탬프) / DELETE (draft 만) |
| 4 | `app/(employees)/RideCompliance/deliverables/page.tsx` | DcStatStrip(5) + DcToolbar + NeuDataTable + Create/Edit Modal |

### 8 카테고리 (`category` enum)
- `appointment` 임명장
- `device_logbook` 단말기 반출대장
- `destruction_cert` 파기 확인서
- `breach_notice` 유출 통지서
- `audit_report` 자체감사 결과서
- `inspection_request` 점검 의뢰
- `training_record` 교육 결과 송부
- `other` 기타

### 매뉴얼 조항 매핑
- `appointment` ← 제6조 (책임자 지정 임명장)
- `device_logbook` ← 제18조 (스마트기기 반출 통제)
- `destruction_cert` ← 제11조 (출력·복사·파기 확인서)
- `breach_notice` ← 제25조 (24h 외부 통지) — 보호위원회 / KISA
- `audit_report` ← 제20~21조 (자체감사 결과 → 경영진 보고)
- `training_record` ← 제22조 (전 임직원 교육 결과)

### 미해결 (메인 세션 위탁 / Rule 21)
- `app/components/PageTitle.tsx` — `/RideCompliance/deliverables` → `'산출물·외부 송부'` 등록 (공통 파일)
- 현재 fallback: `/RideCompliance` prefix 매칭으로 `admin-ops` + `'정보보안'` 표시
- 모듈 main page.tsx 에 「산출물·외부 송부」 탭 또는 카드 링크 추가 (선택)

### Rule 준수 self-check (Rule 27 commit GATE)
- ✅ Rule 1 풀 파이프라인 (DB + API + UI)
- ✅ Rule 11 컬럼 사전 검증 (`profiles.name`, `ride_compliance_deliverables` 22 컬럼)
- ✅ Rule 13 회색 함수 미사용 (COALESCE / LEFT JOIN 만)
- ✅ Rule 14 동형 패턴 (Phase 1.2 documents API + page 패턴 재사용)
- ✅ Rule 18 NeuDataTable 모든 컬럼 sortBy (코드/분류/제목/수신처/작성자/승인자/송부일/방법/상태)
- ✅ Rule 19 줄바꿈 최소화 (whiteSpace: nowrap)
- ✅ Rule 20 결과 글래스 패널 (`resultPanel` state — alert 최소화)
- ✅ Rule 21 자기 모듈만 commit (PageTitle 공통 파일은 메인 위탁)
- ✅ Rule 22 _docs 갱신 (본 CHANGELOG)
- ✅ Rule 23 graceful fallback (`_migration_pending` banner + API 500 처리)
- ✅ Rule 24 시드 멱등 (시드 자체 없음 — 운영 중 등록)
- ✅ `git commit --no-verify` 사용 안 함
