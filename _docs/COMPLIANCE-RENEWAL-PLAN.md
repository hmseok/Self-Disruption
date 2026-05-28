# RideCompliance 리뉴얼 계획서 (2026-05-28)

> 사용자 요청: 「내규 PPT 분석 → 구현/지원할 것 도출 → 기존 구조 중복/불필요 = 리뉴얼」
> 분석 대상: 「라이드 개인정보보호 내부계획서 및 매뉴얼 (제출) 2026.05.21」 (95 슬라이드 / 9장 36조)

---

## 1. PPT 분석 — 도메인 요구사항 23개

### 제3장 — 조직·책임 (제6~9조)

| # | 조항 | 도메인 요구사항 | 산출물 |
|---|---|---|---|
| R1 | 제6조 | CPO / 관리자 임명 (3인 명시) | **임명장** (slide 23) |
| R2 | 제8조 | 비상보고체계 (현업→담당→책임자/관리자→제휴사) | 보고체계도 |
| R3 | 제9조 | 개인정보취급자 현황 문서 (정규/임시/계약직 포함) | 취급자 명단 |

### 제4장 — 기술적·관리적 보호조치 (제10~19조) — **가장 많은 산출물**

| # | 조항 | 도메인 요구사항 | 산출물 |
|---|---|---|---|
| R4 | 제10조 ① | 보호구역 지정 + 출입통제 | 출입통제 정책 |
| R5 | 제10조 ② | 보호시설 출입대장 (출입/열람) | **출입관리대장** |
| R6 | 제10조 ⑤ | 방문자(외부인) 출입대장 | **방문자 출입대장** |
| R7 | 제10조 ⑥ | **모든 시스템/서버/PC 반·출입 이력대장** | **반출입 대장** ← Phase 1.5 |
| R8 | 제11조 | 출력·복사 보호조치 + 데이터 삭제·저장 | 출력 통제 |
| R9 | 제12조 | 접근권한 관리 (1인 1계정, 차등, 회수) | 권한 부여/회수 이력 |
| R10 | 제13조 | 암호화 (주민번호/신용카드/계좌/비밀번호/PC저장/전송) | 암호화 표 (slide 12) |
| R11 | 제14조 | 접근통제 (IP 제한, 패스워드 8자 영문+숫자+특수) | 정책 + 시스템 설정 |
| R12 | 제15조 | 접속기록 12개월 보관 + 매월 점검 | **접속기록 로그** + 점검 보고서 |
| R13 | 제16조 | 보안프로그램 (백신, 보안패치, 공유폴더 제한) | 점검 보고서 |
| R14 | 제17조 | CCTV (안내판, 보관기간, 관리책임자) | **CCTV 운영대장** |
| R15 | 제18조 | 스마트기기 통제 + 반출 (slide 14) | **스마트기기 반출 대장** ← Phase 1.5 |
| R16 | 제19조 | 주민등록번호 처리 제한 (법령 제외 처리 X) | 정책 |

### 제5장 — 자체감사 (제20~21조)

| # | 조항 | 도메인 요구사항 | 산출물 |
|---|---|---|---|
| R17 | 제20조 | 자체감사 **매월 1회** | **자체감사 결과서** ← Phase 1.5 |
| R18 | 제21조 | 결과 반영 (시정·개선·인사발령·재교육) | 시정조치 |

### 제6장 — 교육 (제22~23조)

| # | 조항 | 도메인 요구사항 | 산출물 |
|---|---|---|---|
| R19 | 제22조 | 연간 교육계획 수립 | 계획서 |
| R20 | 제23조 | **연 2회 이상 교육 실시** (정기/취급자) | **교육 결과서** ← Phase 1.5 |

### 제7장 — 수탁사 (제24조)

| # | 조항 | 도메인 요구사항 | 산출물 |
|---|---|---|---|
| R21 | 제24조 | 수탁사 관리 (위탁 문서, 공개, 교육, 점검) | **수탁사 관리대장** + 위탁 계약 |

### 제8장 — 침해사고 (제25~27조)

| # | 조항 | 도메인 요구사항 | 산출물 |
|---|---|---|---|
| R22 | 제25조 | **24h 이내 유출통지** (정보주체) | **유출 통지서** ← Phase 1.5 |
| R23 | 제26~27조 | 침해대응 조직 = 관리팀 (관리팀 명시) | 대응 절차 |

### 제9장 — 파기 (제28~36조) — **Phase 4.0 직접 매핑**

| # | 조항 | 도메인 요구사항 | 산출물 |
|---|---|---|---|
| R24 | 제31조 | 파기 대상 정기 점검 + 목록화 | 파기 대상 list |
| R25 | 제32조 | **파기 결재** | 결재 시스템 ← **Phase 4.0** |
| R26 | 제33조 | 파기 방법 (영구삭제 SW / 물리 파쇄 / 위탁) | 절차 |
| R27 | 제34조 | **파기 확인 + 검증** (무작위) | **파기 확인서** ← Phase 1.5 |
| R28 | 제35조 | **파기대장 3년 보관** | **파기대장** |

### 부칙 — Penalty

| # | 도메인 요구사항 | 산출물 |
|---|---|---|
| R29 | 위반 횟수별 단계 처벌 (1회 경고 → 2회 교육 → 3회 인사위원회) | **위반 추적 이력** |

---

## 2. 기존 시스템 매핑 — 중복 / 누락 분석

### 현재 RideCompliance 모듈 탭 (10개)

| 탭 | 기존 기능 | 매뉴얼 매핑 | 평가 |
|---|---|---|---|
| 📊 대시보드 | stat 카드 + Playbook 9단계 + 12개월 캘린더 | 메타 | ✅ 유지 |
| 📖 운영 가이드 | PLAYBOOK_STEPS const 9개 | (도출 기준) | ⚠ Phase 2.1 로 DB 화 진행 중 |
| **📜 내규 마스터** (P17-C 신규) | 내규 PPT 업로드 + AI 추출 + 검수 | **1차 데이터** | ✅ 핵심 |
| **📤 산출물 트래커** (P17-D 신규) | 산출물 결재 (Phase 1.5) | R1, R5, R6, R7, R15, R17, R20, R22, R27 | ✅ 핵심 |
| 📦 정보자산 | 자산 등록 (PII / 시스템) | 제4장 보호 대상 | ✅ 유지 |
| 🚨 침해사고 | 24h 통지 추적 | R22, R23 | ✅ 유지 |
| 👔 조직 매핑 | CPO / 관리자 / 취급자 | R1, R3 | ✅ 유지 |
| 📚 규정 문서 관리 | 매뉴얼·서식 25 시드 (RIDE-* / F-*) | (별첨/서식) | ⚠ **중복 — 「내규 마스터」 검수 결과 attachments 와 동일** |
| 📅 연간 운영 | annual_plan + tasks (12 월) | R17, R19 (감사·교육 일정) | ⚠ Phase 2.4 로 내규에서 자동 도출 — 부분 중복 |
| 📝 서식 작성 | form_submissions (서식 인스턴스) | R8 (출력), R12 (권한 변경) | ✅ 유지 (실 작성 인스턴스) |

### 누락된 산출물·기능 (매뉴얼 명시 but 시스템 부재)

| 매뉴얼 R# | 누락 기능 | 우선순위 |
|---|---|---|
| **R5** | 보호시설 출입대장 (출입/열람) | 🔴 高 |
| **R6** | 방문자 출입대장 | 🔴 高 |
| **R9** | 접근권한 관리 (부여/회수 이력) | 🟡 中 |
| **R11** | 패스워드 정책 점검 | 🟢 低 (IT 인프라) |
| **R12** | 접속기록 12개월 보관 + 매월 점검 | 🟡 中 (기술 통합) |
| **R13** | 보안프로그램 (백신) 설치 점검 | 🟢 低 |
| **R14** | CCTV 운영대장 | 🟡 中 |
| **R21** | 수탁사 관리대장 + 위탁 계약 | 🔴 高 |
| **R25** | 파기 결재 시스템 | 🔴 高 ← **Phase 4.0 진행 중** |
| **R28** | 파기대장 3년 보관 | 🔴 高 |
| **R29** | Penalty 위반 추적 | 🟡 中 |

---

## 3. 리뉴얼 제안 (3 단계)

### 단계 1 — 중복 정리 (즉시)

| 작업 | 상세 |
|---|---|
| 「규정 문서 관리」 탭 폐기 / 통합 | 25 시드는 「내규 마스터」 의 attachments 검수 결과로 대체. 별도 탭 불필요. |
| 「연간 운영」 탭 강화 | Phase 2.4 의 「📅 스케줄 자동 생성」 결과를 시각화 (월별 카드 → 실제 task 표시) |
| 「운영 가이드」 탭 정비 | Phase 2.1 에서 PLAYBOOK_STEPS const → DB sections 동적 렌더링 완성 |

### 단계 2 — 누락 산출물 추가 (Phase 4.x — 매뉴얼 직접 매핑)

| Phase | 작업 | 매뉴얼 R# |
|---|---|---|
| **4.0** | 데이터 폐기 결재 (진행 중 — Phase 4.0-A/B 완료) | R25, R27, R28 |
| **4.1** | 출입대장 모듈 (출입/방문자/반출입 — 3 종) | R5, R6, R7 |
| **4.2** | 수탁사 관리대장 (위탁 문서 + 점검 + 교육 기록) | R21 |
| **4.3** | 접근권한 변경 이력 (부여/회수/주기적 점검) | R9 |
| **4.4** | 자체감사 결과서 정기 (매월 1회) — Phase 2.4 스케줄 활용 | R17 |
| **4.5** | 교육 결과서 (연 2회) — 직원 출석 + 시험 결과 | R20 |
| **4.6** | CCTV 운영대장 | R14 |
| **4.7** | Penalty 위반 추적 (1회 경고 → 2회 교육 → 3회 인사위원회) | R29 |

### 단계 3 — AI 가이드 + 정합성 분석 (사용자 통찰 반영)

| 작업 | 상세 |
|---|---|
| **정합성 갭 분석 AI** | 확정 내규 sections (조항) vs 실제 운영 (산출물/스케줄/이력) 자동 비교 → 누락/지연 권고 |
| **증빙 추출 PDF/엑셀** | 산출물 + 결재 + 파기대장 등 → 외부 감독 기관 제출 형식 export |
| **법령 개정 추적** | 매뉴얼 조항 vs 현행 법령 비교 (AI) → 갱신 필요 부분 알림 |

---

## 4. 즉시 정리 권장 (P18)

### 4.1 「규정 문서 관리」 탭 → 「내규 마스터」 의 attachments 로 통합

```
Before:
  - 규정 문서 관리 (탭) — RIDE-* / F-* 25 시드 (정적)
  - 내규 마스터 (탭, P17-C) — PPT 업로드 + AI 추출

After:
  - 내규 마스터 (탭) — PPT 업로드 + AI 추출
    └ 검수 페이지의 「📎 별첨」 탭 = 자동 추출된 25 attachments
    └ 「서식 작성」 탭에서 attachment 선택 → 인스턴스 생성
```

### 4.2 페이지 자체 「policies」 URL 폐기

```
Before:
  /RideCompliance/policies                ← 별도 페이지
  /RideCompliance (모듈 main) + 「📜 내규 마스터」 탭   ← P17-C 임베드
  /RideCompliance/deliverables            ← 별도 페이지
  /RideCompliance (모듈 main) + 「📤 산출물 트래커」 탭 ← P17-D 임베드

After:
  /RideCompliance (단일 진입점)
    └ 모든 탭 접근
  /RideCompliance/policies/[id]/review    ← 검수 페이지만 별도 (P17-A)
```

→ 사용자 정신 모델 단순화. URL 1개 (모듈 main) 에서 모든 작업.

---

## 4.3 내규 버전 관리 + 변경 히스토리 (P19 — 핵심 누락)

> **사용자 통찰 (2026-05-28)**: 「내규도 변경될 수 있고 시기에 따른 변화 규정이나 히스토리가 관리도 되어야 한다」

내규는 살아있는 문서 — 법령 개정, 운영 변화, 감사 결과 등으로 변경 빈발. 시점별 적용 규정 추적 필수.

### 기존 지원 (Phase 2.0 마이그 시 이미 마련)

- `ride_compliance_policies.version` — 버전 라벨 (v1.0, v1.1, ...)
- `ride_compliance_policies.superseded_by_id` — 버전 chain (이전 → 새 버전)
- `ride_compliance_policies.status` — `superseded` 상태 (구버전 보존)
- `ride_compliance_policies.effective_date` — 시행일

### 추가 필요 (P19 신규)

| # | 요구사항 | 설계 |
|---|---|---|
| V1 | 버전 간 diff (조항/별첨/Playbook 변경점) | sections 비교 SQL + AI 요약 |
| V2 | 변경 사유 (법령 / 운영 / 감사) | `change_reason` TEXT + 카테고리 enum |
| V3 | 변경 승인자 + 승인 일시 | `change_approved_by` / `change_approved_at` |
| V4 | 효력 시점별 조회 (특정 일자 기준 어느 내규가 active 였는지) | 「2024-03-15 기준 적용 내규」 — version chain + effective_date 추적 |
| V5 | 산출물·결재의 「당시 내규 버전」 snapshot | deliverables / disposal_reviews 에 `source_policy_version` 컬럼 |
| V6 | 변경 알림 (관리자 / 전 임직원) | 제5조 「공표」 — 모듈 공지 + 이메일 |
| V7 | 법령 개정 추적 (외부) | 법령 정보 시스템 RSS / 수동 등록 → 내규 영향 분석 |

### Phase 4.x — 「📜 내규 히스토리」 탭 신설

```
/RideCompliance (모듈 main)
  └ 📜 내규 마스터 (탭, P17-C)
       ├─ 현행 active 내규 list (기존)
       └─ 「📜 버전 히스토리」 sub-탭 (P19 신규)
            ├─ 버전 chain (v1.0 → v1.1 → v2.0)
            ├─ 각 버전 effective_date + status
            ├─ 「📊 v1.0 vs v1.1 diff」 — 조항/별첨 변경점
            ├─ 변경 사유 + 승인자
            └─ 「📅 2024-03-15 기준 적용 내규」 시점 조회
```

### 새 컬럼 (마이그 P19)

```sql
-- ride_compliance_policies 확장
ALTER TABLE ride_compliance_policies
  ADD COLUMN change_reason TEXT DEFAULT NULL,         -- 변경 사유
  ADD COLUMN change_category VARCHAR(20) DEFAULT NULL, -- 'law' / 'ops' / 'audit' / 'major'
  ADD COLUMN change_approved_by CHAR(36) DEFAULT NULL,
  ADD COLUMN change_approved_at DATETIME DEFAULT NULL,
  ADD COLUMN announced_at DATETIME DEFAULT NULL,       -- 제5조 공표
  ADD COLUMN announced_by CHAR(36) DEFAULT NULL,
  ADD COLUMN supersedes_id CHAR(36) DEFAULT NULL;      -- 정방향 chain (구버전 X — 신버전이 어떤 구버전 대체)

-- 외부 산출물에 「당시 내규 버전」 snapshot
ALTER TABLE ride_compliance_deliverables
  ADD COLUMN source_policy_id CHAR(36) DEFAULT NULL,
  ADD COLUMN source_policy_version VARCHAR(20) DEFAULT NULL;

ALTER TABLE ride_compliance_disposal_reviews
  ADD COLUMN source_policy_id CHAR(36) DEFAULT NULL,
  ADD COLUMN source_policy_version VARCHAR(20) DEFAULT NULL;

-- 법령 개정 추적 (외부 → 내규 영향)
CREATE TABLE ride_compliance_law_revisions (
  id CHAR(36) PRIMARY KEY,
  law_code VARCHAR(60) NOT NULL,        -- '개인정보보호법'
  revision_no VARCHAR(40) NOT NULL,     -- '법률 제19234호'
  effective_date DATE NOT NULL,
  summary TEXT,
  impacted_articles JSON,               -- 우리 내규의 영향 조항 (제6조, 제12조 ...)
  status VARCHAR(20) DEFAULT 'pending', -- pending / reviewed / applied / ignored
  reviewed_by CHAR(36),
  reviewed_at DATETIME,
  applied_in_policy_id CHAR(36),        -- 어떤 내규 버전에서 반영됐는지
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 시점별 조회 패턴 (V4)

「2024-03-15 기준 적용 내규」:
```sql
SELECT * FROM ride_compliance_policies
 WHERE status IN ('active', 'superseded')
   AND effective_date <= '2024-03-15'
   AND (superseded_by_id IS NULL
        OR (SELECT effective_date FROM ride_compliance_policies p2
              WHERE p2.id = ride_compliance_policies.superseded_by_id) > '2024-03-15')
 ORDER BY effective_date DESC LIMIT 1;
```

이로써 과거 산출물·결재의 「당시 적용 내규」 정확히 추적 가능. 감사·소송 대응 필수.

### AI 기능 — 버전 diff 자동 요약

확정된 새 버전 (v1.1) 등록 시:
1. AI 가 v1.0 vs v1.1 의 sections 비교
2. 자동 요약: 「제12조 (접근권한) — 비밀번호 변경 주기 90일 → 60일 단축」, 「별첨 7 RIDE-M07 신규 추가」
3. `change_reason` 자동 채움 + 관리자 검수
4. 「📢 공표」 액션 → `announced_at` + 전 임직원 알림 (제5조)

---

## 5. 다음 세션 시 결정 항목

사용자 컨펌 필요:

1. **「규정 문서 관리」 탭 폐기** vs 유지?
2. **「policies」 / 「deliverables」 별도 URL 폐기** vs 보존?
3. **Phase 4.1~4.7 우선순위** — 어느 모듈부터?
4. **Penalty 추적 (R29)** — 인사 시스템 연계 vs 본 모듈 자체 관리?
5. **AI 정합성 갭 분석** 우선 진행 vs Phase 4.x 누락 모듈 우선?
6. **Phase 4.0 (데이터 폐기) 와 P19 (버전 관리) 우선순위** — 둘 다 큰 작업, 어느 먼저?
7. **법령 개정 추적 (V7)** — 자동 RSS vs 수동 등록?

---

## 6. 작업 영향 추정

| 작업 | 코드 영향 | 마이그 | 사용자 부담 |
|---|---|---|---|
| 단계 1 (중복 정리) | main page.tsx 1 파일 | X | 낮음 |
| 단계 2 — Phase 4.0~4.7 | 각 phase 당 3~5 파일 | 7 마이그 | 중 (각 마이그 적용) |
| 단계 3 — AI 가이드 | 새 lib + API + UI | 1 마이그 | 중 |

**총 추정**: Phase 4 시리즈 모두 완성에 ~3~5 세션.

---

작성일: 2026-05-28
분석 source: `/uploads/라이드_개인정보보호 내부계획서 및 매뉴얼(제출)_2026.05.21.pptx`
저자: Claude (RideCompliance 모듈 1차 분석)
