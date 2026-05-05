# CLAUDE-Cafe24.md — Cafe24 ERP 모듈 보조 규칙

> 본 모듈에서 Claude 가 작업할 때 적용되는 추가 규칙.
> 루트 `/CLAUDE.md` 의 규칙 1~27 모두 적용 + 아래 모듈 한정 규칙.

---

## 0. 기본 사실 (반드시 기억)

| 항목 | 사실 |
|------|------|
| **시스템 별명** | "구전산" / "카페24 ERP" / "skyautosvc" — 모두 동일 시스템 |
| **소스 코드 위치** | `/Users/minihmseok/WebstormProjects/cafe24_source` (FMI repo 외 별도 폴더) |
| **회사 도메인** | `skyautosvc.co.kr` |
| **시스템 종류** | PHP 1,806파일 + PowerBuilder 데스크톱 EXE + MariaDB 10.1 |
| **DB 종류** | **MariaDB 10.1.13** = MySQL 5.7 미만 수준 — 회색 함수 사용 금지 |
| **연결 방식** | **외부 IP read-only 직접 접속** (`.env.local` 의 `CAFE24_DB_*` 사용) |
| **연결 정책** | 단계 1 (현재): READ-ONLY 만 허용. 단계 2 (TBD): 양방 sync. 단계 3 (TBD): 카페24 폐기 후 FMI primary. |
| **Source of Truth** | 단계 1 = 카페24. 단계 2~ = FMI 우선 (Q4=B). 마이그레이션 진행에 따라 전환. |
| **캐시 정책** | 30~60초 (Q7=A 분당 변동) — staleTime: 30s, idle pool 60s |
| **권한 모델** | 일단 관리자 전용 (Q8=D) — middleware/page.tsx 첫 줄 admin 체크. 직군별 분리는 별도 PR. |
| **운영 시간** | 24/365 (Q1=A) — 모든 페이지 야간/주말에도 동작 |
| **마이그레이션 타임라인** | 미정 (Q6=D) — **본 PR 들은 "장기 운영" 가능 설계** (임시 X) |
| **Cowork 분리** | cafe24_source 폴더는 FMI repo 와 완전 분리 — git history 에 절대 들어가면 안 됨 |

---

## 1. 분석 재개 시 절차

다른 세션 또는 다른 시점에 본 모듈 작업 재개 시:

```
1. 본 _docs 모두 읽기 (특히 SOURCE-ANALYSIS.md / DATA-MODEL.md)
2. 카페24 코드 분석이 필요하면 mcp__cowork__request_cowork_directory 로
   /Users/minihmseok/WebstormProjects/cafe24_source 마운트
3. 마운트 안 하면 cafe24_source 못 읽음 (FMI repo 에 cafe24 PHP 코드 없음)
4. CHANGELOG.md 마지막 항목 → 다음 작업 인지
```

---

## 2. MariaDB 10.1 호환성 절대 규칙 (규칙 13 강화)

| 함수 / 기능 | 사용 가능? |
|------------|-----------|
| `REGEXP_REPLACE` | ❌ MySQL 8.0+ 만 — **사용 금지** |
| `JSON_TABLE` | ❌ MySQL 8.0+ 만 — **사용 금지** |
| `ROW_NUMBER()`, `RANK()`, WINDOW 함수 | ❌ MySQL 8.0+ 만 — **사용 금지** |
| `CTE (WITH)` | ❌ MariaDB 10.2+ 만 — 본 환경 불가 |
| `CONCAT, CONCAT_WS, COALESCE, IF, CASE WHEN` | ✅ |
| `LEFT, RIGHT, SUBSTRING, INSTR, REPLACE, LENGTH` | ✅ |
| `DATE_FORMAT, DATE_SUB, DATE_ADD, NOW, CURDATE` | ✅ |
| `GROUP_CONCAT` | ✅ |
| `STR_TO_DATE(col, '%Y%m%d')` | ✅ — VARCHAR(8) YYYYMMDD 변환 (자주 사용) |

**필수**: 카페24 DB 향한 SQL 작성 시 `// cafe24-db: MariaDB 10.1` 주석 필수.

### 2.1 sql_mode (PR-6.1 검증 — 카페24 측 = ONLY_FULL_GROUP_BY 미적용)

```
sql_mode: IGNORE_SPACE, NO_AUTO_CREATE_USER, NO_ENGINE_SUBSTITUTION
```

→ 카페24 측 SQL 은 **ONLY_FULL_GROUP_BY 없는 환경 가정** 으로 작성 가능.
→ 그러나 FMI 측 SQL 은 ONLY_FULL_GROUP_BY 적용 — 본 모듈 SQL 도 GROUP BY 표준 준수 권장 (이식성).

### 2.2 charset 함정 (mysql2 driver 한정)

```
❌ charset: 'utf8mb3'                  → Unknown charset
❌ charset: 'utf8mb3_general_ci'       → Unknown charset
✅ charset: 'utf8'                     → OK (mysql2 가 utf8 = utf8mb3 매핑)

또한 한글 응답 Buffer 문제:
✅ typeCast option 으로 STRING/VAR_STRING/BLOB 을 utf8 string 으로 강제
```

### 2.3 collation mismatch 주의

```
카페24 측: utf8_general_ci
FMI 측 (Cloud SQL): utf8mb4 또는 다른 collation 가능
→ 데이터를 FMI DB 에 복사 시 collation 명시 의무 (CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci)
```

### 2.4 날짜 / 시간 컬럼

```
카페24 측 패턴:
  - VARCHAR(8) YYYYMMDD (예: '20240315')      → 날짜
  - VARCHAR(4) HHMM (예: '1430')              → 시각

FMI 변환:
  - SQL 측: STR_TO_DATE(col, '%Y%m%d') AS date
  - JS 측: `${str.slice(0,4)}-${str.slice(4,6)}-${str.slice(6,8)}`

time_zone: SYSTEM (한국 KST 추정 — UTC+9)
  → JS Date 객체로 변환 시 시간대 명시 의무
```

---

## 3. 명명 규칙 (카페24 측 절대 따라가기)

카페24 측은 헝가리안 표기 + 3글자 prefix 명명 사용 — **FMI 측 코드에서 카페24 데이터 다룰 때 prefix 보존**.

```
카페24 테이블 → FMI 매핑 시 prefix 유지
  pmccarsm    → cafe24_pmccarsm 또는 vehicleMasterRaw 매핑 함수
  ajaoderh    → cafe24_ajaoderh 또는 dispatchOrderHeader 매핑
  aceesosh    → cafe24_aceesosh 또는 accidentReceipt 매핑
```

**금지**: 카페24 컬럼명 (oderfact, oderidno, ...) 을 변경한 채 사용. 매핑 시 1:1 명시.

---

## 4. PowerBuilder 데스크톱 인지 (운영 현실)

```
운영자들은 PowerBuilder EXE 데스크톱 앱으로 ERP 사용 중 (각 PC 의 acr_app.exe 등)
→ FMI ERP 와 카페24 ERP 는 같은 DB 를 동시 사용
→ 카페24 측 INSERT/UPDATE 가 실시간 발생 — FMI 는 read 결과가 변동 가능
→ 폴링 주기 / 캐시 정책 신중 설계 필요
```

---

## 5. 보안 규칙 (강화)

```
✗ 절대 금지:
  - cafe24_source/mgcap/app/core/config.php 안 자격증명을 어디든 복사
  - .env.local 의 CAFE24_DB_PASSWORD 를 코드/주석/로그에 노출
  - cafe24_source 폴더 내용을 FMI repo 에 복사 (git history 영구 노출 위험)
  - 카페24 DB 에 INSERT/UPDATE/DELETE/DDL (READ-ONLY 정책 위반)

✓ 의무:
  - 모든 cafe24 connection 은 transaction read-only 모드로 시작
  - 자격증명은 lib/cafe24-db.ts 단일 진입점에서만 사용
  - .env.local 마스킹 후 커밋 (값 절대 X)
```

---

## 6. 본 모듈 _docs 갱신 의무 (규칙 22 적용)

- 새 카페24 테이블 매핑 추가 → DATA-MODEL.md 갱신
- 새 API 라우트 신설 → API.md (없으면 신설) 갱신
- 새 UI 페이지/탭 → UI-SPEC.md 갱신
- 운영 사실 / 도메인 발견 → OPERATIONS.md 갱신
- 페르소나/시나리오 변경 → SCENARIOS.md 갱신
- 매 PR 종료 → CHANGELOG.md 한 줄 추가

---

## 7. PR 시작 전 GATE 체크리스트 (규칙 27 적용)

```
GATE 3 — Researcher → Planner → 사용자 GO
GATE 5 — tsc / next build PASS
GATE 6 — lint:harness PASS
GATE 7 — 시각 검수 (UI 변경 시)
GATE 8 — evaluate.js 8.0+
규칙 22 — _docs 갱신 의무
규칙 11/13 — SQL 컬럼/함수 사전 검증 (특히 MariaDB 10.1 호환성)
```
