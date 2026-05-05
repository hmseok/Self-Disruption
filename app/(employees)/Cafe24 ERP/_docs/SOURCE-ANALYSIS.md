# SOURCE-ANALYSIS.md — 카페24 ERP 소스코드 분석 보고서

> 작성일: 2026-05-05
> 분석 대상: `/Users/minihmseok/WebstormProjects/cafe24_source`
> 분석자: FMI Cowork Session (Researcher 단계)
> 상태: 1차 정밀 분석 완료, 사용자 인터뷰 일부 미진행

---

## 1. 시스템 개요

`skyautosvc.co.kr` 도메인에서 운영 중인 회사 자체 ERP 시스템.
**렌터카 기반 사고차 대차 (Accident Car Replacement, "ACR")** 가 주 비즈니스.

| 항목 | 발견 사실 |
|------|----------|
| 시스템 형태 | PHP 웹 + PowerBuilder 데스크톱 EXE (하이브리드) |
| PHP 파일 수 | 1,806개 |
| PowerBuilder 산출물 | `.pbd` 184개 + `.pbl` 155개 + `.exe` 17개 |
| DB 종류 | **MariaDB 10.1.13** (Distrib 10.0.21, MySQL 5.6 호환) |
| DB 라이브러리 (PHP) | `MysqliDb` (오픈소스 PHP 래퍼) |
| 도메인 | `skyautosvc.co.kr` |
| 호스팅 추정 | 카페24 마이호스팅 또는 자체 호스팅 (.htaccess + PHP + MySQL 패턴) |
| 과거 환경 | AWS RDS (`ridecare-prod.c7vtjbkshibd.ap-northeast-2.rds.amazonaws.com`) — 코멘트 처리, 폐기됨 |

---

## 2. 디렉토리 구조 (최상위)

```
cafe24_source/
├── ERP/                4.4GB — 메인 ERP (분석 대상 중심)
│   ├── TEMP/           29 폴더 임시 데이터
│   ├── clients/        18 폴더 — PowerBuilder 데스크톱 EXE 빌드 산출물
│   │   ├── common/     공통 리소스 (icons/gifs/jpg)
│   │   ├── login_app/  로그인 앱 (skyautoservice.exe)
│   │   ├── acr_app/    ★ 사고차 대차 메인 앱 (acr_app.exe)
│   │   ├── adm_app/    Admin
│   │   ├── aja_app/    주문 관련
│   │   ├── apo_app/
│   │   ├── gpb_app/
│   │   ├── inf_app/    Information
│   │   ├── ins_app/    Insurance
│   │   ├── pie_app/    PIE 모듈
│   │   ├── pin_app/    PIN 모듈
│   │   └── *_app_2023XXXX  백업 폴더
│   ├── dba/            DB Access Layer (object/, table/ 빈 폴더 + make.php 진단용)
│   ├── include/        공통 진입점 (comm.php — auto include)
│   ├── lib/
│   │   ├── lib_e/      73 파일 — 공통 SELECT/Helper 함수 (fs_*, fg_*)
│   │   ├── lib_pm/     Process Manager — 비즈니스 로직 (fpm_*)
│   │   └── lib_pc/     Process Client — 메시지 등 (fpc_*)
│   └── service/        32 모듈 — 화면별 백엔드
│       ├── _api/       REST API (SMS/카카오/다음/잔디 등 외부 통합)
│       ├── adm/
│       ├── cron/
│       ├── pay/
│       ├── run/
│       ├── test/
│       └── h{prefix}{NN}sv/  ★ 비즈니스 모듈 26개 (e.g. hace01sv, hpie01sv)
├── application/        4.9MB
├── charger/            1.1MB — 충전 관련 (별도 모듈)
├── down/               225MB — 다운로드 자료
├── excel/              13MB — PHPExcel 라이브러리
├── imrwon/             185MB — 임원? 운?
├── mgcap/              588KB — Manager Capture (?)
├── public/             22MB
├── svrm/               2.6MB — 98 폴더 (Service Room?)
├── wb/                 76MB
├── web/                3.2MB — 웹 진입점
├── backup/picuserm.sql 16라인 — 백업 끊김 (헤더만)
└── index.php           165B (진입점)
```

**핵심 분석 영역**: `ERP/lib/lib_e`, `ERP/lib/lib_pm`, `ERP/service/h*sv`, `ERP/service/_api`

---

## 3. PHP 코드 패턴

### 3.1 공통 진입점 (`include/common/comm.php`)

```php
// 한 줄로 70+ 함수 자동 include
include_once("ERP/include/common/*.php");  // 공통 헬퍼
include_once("ERP/lib/lib_e/*.php");        // fs_/fg_ 함수
include_once("ERP/lib/lib_pm/*.php");       // fpm_ 비즈니스 로직
```

**의의**: PHP 측은 "한 함수 = 한 파일" 정책 + glob include. FMI 측에서 마이그레이션 시 "이 PHP 한 줄이 어떤 함수를 부르는가" 추적 시 lib_e/lib_pm 전체 검색 필요.

### 3.2 함수 명명 (3글자 + 4글자 entity 헝가리안)

| Prefix | 의미 | 패턴 예시 |
|--------|-----|---------|
| `fs_` | **Function Select** — DB SELECT | `fs_pmccustm_get`, `fs_ajaoderh_get` |
| `fs_*_set` | INSERT/UPDATE | `fs_ajaachsh_set`, `fs_pinsmxdt_set` |
| `fs_*_get` | SELECT 단건 또는 다건 | 가장 많음 |
| `fg_` | **Function General** — 헬퍼 | `fg_date_term`, `fg_phon_return`, `fg_aes256` |
| `fpm_` | **Function Process Manager** — 비즈니스 로직 | `fpm_ajaoder_calc`, `fpm_pieclbsm_change` |
| `fpc_` | **Function Process Client** — 메시지/콜백 | `fpc_ajrpinsh_mesg` |
| `_syslog()` | 시스템 로그 (자체 함수) | 모든 함수 시작에서 호출 |

### 3.3 RPC 식 서비스 패턴 (예: `service/hace01sv/ace0101a.php`)

```php
GETVAR("jobs", 0, $ls_jobs);

switch($ls_jobs) {
   case "A": $ret_val = ACE0101A_dataacceptA($o, $db); /* 신규접수 */ break;
   case "B": $ret_val = ACE0101A_dataselectB($o, $db); /* 이중접수확인 */ break;
   case "C": $ret_val = ACE0101A_datalistC($o, $db);   /* 이중접수확인 */ break;
   case "D": $ret_val = ACE0101A_dataselectD($o, $db); /* 접수내용조회 */ break;
   case "E": $ret_val = ACE0101A_datadeleteE($o, $db); /* 접수취소 */ break;
   case "F": $ret_val = ACE0101A_dataupdateF($o, $db); /* 종결처리 */ break;
   case "G": $ret_val = ACE0101A_datainsertG($o, $db); /* 접수내용저장 */ break;
   case "H": $ret_val = ACE0101A_dataupdateH($o, $db); /* 접수내용저장 */ break;
   case "I": $ret_val = ACE0101A_datainsertI($o, $db); /* 사고상담내역 저장 */ break;
   case "J": $ret_val = ACE0101A_dataselectJ($o, $db); /* 사고상담내역 저장 */ break;
   case "K": $ret_val = ACE0101A_datahistoryK($o, $db); /* 과거접수내역 */ break;
   case "U": $ret_val = ACE0101A_dataselectU($o, $db); /* 가상문자조회 */ break;
}
```

**한 PHP 파일 = 한 PB 화면의 모든 액션** (RPC 식). PB 클라이언트가 `?jobs=A` 같은 형태로 호출.

---

## 4. 외부 API 통합 (`ERP/service/_api/`)

| 파일 | 통합 대상 |
|------|----------|
| `aligo_curl_*.php` (4개) | 알리고 (알림톡 + SMS 발송 + 토큰 + 히스토리) |
| `kakao_addr.php`, `kakao_map.php` | 카카오 주소/지도 |
| `daum_api.php`, `daum_api2.php` | 다음 자동차 시세 (`_api.env` 의 `CAR_KEY_*` 키 사용) |
| `juso_api*.php` (4개) | 행안부 도로명 주소 API |
| `jandi_webhook*.php` (2개) | 잔디 메신저 webhook |
| `channel_sms.php` | SMS 디스패처 |
| `delivery.php` | 택배 (?) |
| `ins_sign.php` | 보험 사인 |
| `crmsendh_result.php` | CRM 발송 결과 |
| `document_file_transfer.php` | 문서 전송 |
| `ajrpinsh_*.php` (4개) | ★ 메인 워크플로우 (check / exec_calc / stat_change / stat_move) |

**`_api.env` 발견 사실**: 다음 자동차 API 키를 **차량 등록일 구간별** 분리 보관 (예: 2025-05-01 ~ 2025-12-31 구간 = `CAR_KEY_1`). 시세 API 가 키별 한도가 있을 가능성.

---

## 5. PowerBuilder 데스크톱 운영 환경

```
ERP/clients/system.ini
  MONITER_COUNT = 1
  MONITER1_X / Y = 1
  MONITER1_WIDTH / HEIGHT = 1920 / 1080
  MONITER2_X = 1920 (듀얼모니터 옵션)
```

운영자가 사용하는 PB 데스크톱 클라이언트 (메인은 `acr_app.exe` + `skyautoservice.exe`):

```
acr_app/  (사고차 대차 메인)
├── acr_app.exe          실행 파일
├── acr_main.pbd/pbl     메인 윈도우
├── ace_apps.pbd/pbl     ACE 모듈 (사고 협력업체?)
├── ajt_apps.pbd/pbl     AJT 모듈
├── crm_object.pbd/pbl   CRM 객체
├── erp_lib.pbd/pbl      공통 ERP 라이브러리
├── erp_object.pbd/pbl
├── erp_report.pbd/pbl   리포트
├── inf_dw.pbd/pbl       Info DataWindow
├── sky_carsinfo.pbd/pbl 차량 정보
├── sky_com.pbd/pbl      공통
├── sky_lib.pbd/pbl      공통 라이브러리
├── sky_login.pbd/pbl    로그인
└── ver.inf              버전 정보
```

**의의**: PB 데스크톱이 DB 에 직접 접속한다면, 이미 외부 IP 접근이 허용된 환경 → FMI 의 외부 IP 추가는 화이트리스트만 추가하면 됨.

---

## 6. 비즈니스 도메인 단서 (한국어 주석에서)

### 6.1 `fpm_ajaoder_calc.php` (사고차 대차 주문 청구액 계산)

```php
$ls_bogn = $la_oder["oderbogn"];  // 정액,정률 구분
$ll_bomx = $la_oder["oderbomx"];  // 최대부담금
$ll_bomn = $la_oder["oderbomn"];  // 최소부담금
$ll_etcn = $la_oder["oderetcn"];  // 면책금건수
$ll_pers = $la_oder["oderpers"];  // 예상과실율
$ll_bofc = $la_oder["oderbofc"];  // 자기부담율

// 청구액 계산 — ajaopslh 라인 테이블 집계
SELECT opslbamt bamt, opslbcnt bcnt, opslgamt gamt,
       opsltims tims, opsljamt jamt, opsldcmt dcmt,
       opsldcyn dcyn
  FROM ajaopslh
 WHERE opslfact = ? AND opslidno = ? AND opslmddt = ?
   AND opslsrno = ? AND opslseqn = ?
   AND opslflag = 'O'
```

**도메인 추정**:
- `bogn` = 부담금 구분 (정액/정률)
- `bomx/bomn` = 최대/최소 부담금
- `etcn` = 면책금 건수
- `pers` = 과실율 (보험)
- `bofc` = 자기 부담율
- 라인 테이블의 `bamt/bcnt/gamt/tims/jamt/dcmt/dcyn` = 기본금액/건수/합계/일수/감가/할인금액/할인여부

→ **사고차 대차 정산** 비즈니스 (보험사 vs 자기부담 정산)

### 6.2 모듈 prefix 추정 매핑

| Prefix | 추정 의미 | 근거 |
|--------|---------|------|
| `pmc` | Personal? Master Code (마스터) | pmccarsm/pmccustm/pmcfactm/pmcfinem 모두 마스터 |
| `pic` | Personal Identity? | picuserm = 사용자 마스터, picmechm = 정비? |
| `aja` | 사고차 대차 주문 | ajaoderh = 주문 헤더, ajaopsbh/ajaopslh/ajaopsmh = 주문 sub/line/main |
| `ajc` | 사고차 보험 | ajcinsph = 보험 헤더, ajcipsbh/ajcipslh/ajcipsmh, ajcachsh |
| `ajr` | 사고차 운영/정산 | ajradplh, ajradpym, ajrfineh, ajrinfth, **ajrpinsh** (메인 워크플로우), ajrtongh, ajrupsbh/upslh/upsmh |
| `acr` | Accident Car (?) | acrotpth |
| `ace` | 협력업체 접수 | aceesosh — 주석에 "협력업체 접수" |
| `pin` | Pin? Insurance? | pinscalc, pinsmxdt, pinsrstp |
| `pie` | Pie? | pieclbsm/pieclmoh/pieclodh/piecltmh/pieedish |
| `ins` | Insurance | (별도 모듈) |
| `gpb` | ? | (확인 필요) |
| `inf` | Info | (확인 필요) |
| `crm` | Customer Relation | crminfo, crmsendh |

→ **`ajrpinsh` 가 메인 워크플로우 엔티티** (REST API 4개 + 비즈니스 fpm 함수가 가장 많음)

---

## 7. FMI ERP 측 기존 흔적

### 7.1 `.env.local` (이미 셋팅됨, 미사용)
```
CAFE24_DB_HOST=skyautos...
CAFE24_DB_PORT / USER / PASSWORD / NAME = ***
```

### 7.2 Broken call (실제 라우트 미구현)
```ts
// app/operations/intake/page.tsx:170
fetch('/api/cafe24/accidents?limit=200')
// → /api/cafe24/ 디렉토리 미존재
```

### 7.3 라벨 / 메타데이터 침투
- `code-master/CodeMasterMain.tsx`: `cafe24_group` 컬럼, `source === 'cafe24'` 배지 (C24)
- `operations/intake/page.tsx`: `SOURCE_MAP.cafe24 = '구전산'` 라벨

### 7.4 라이브러리 이미 설치됨
```
package.json: "mysql2": "^3.20.0"
```
→ 별도 mysql2 connection pool 가능 (Prisma 와 분리).

---

## 8. 위험 요소 + 결정 사항

### 위험
- ⚠ **자격증명 평문 노출**: `cafe24_source/mgcap/app/core/config.php` 안 user/password — 이 폴더 절대 FMI repo 에 복사 금지.
- ⚠ **MariaDB 10.1 호환성**: FMI 가 자주 쓰는 `REGEXP_REPLACE`, `JSON_TABLE`, WINDOW 함수 모두 사용 불가 (CLAUDE-Cafe24.md § 2 화이트리스트만 사용).
- ⚠ **PB 데스크톱 동시 사용**: 운영자가 PB 로 INSERT/UPDATE 하는 동안 FMI 가 read 한 결과는 stale 가능.
- ⚠ **picuserm.sql 끊긴 백업** (16라인 헤더만) — 신뢰 백업 자료 없음, 실제 DB 접근 외 재현 불가.

### 결정 (사용자 응답 반영)
- ✅ **데이터 활용 패턴**: 외부 IP read-only 직접 접속 (Q1=A)
- ✅ **보안**: cafe24_source 와 FMI repo 완전 분리 (Q2=A)
- ✅ **다음 행동**: ERP/clients + service + lib_e 정밀 분석 (Q3=B) — 본 보고서

---

## 9. 다음 단계 (Planner 영역)

다음 PR 에서 결정 / 진행:

1. **카페24 외부 IP 허용 + 화이트리스트** (사용자 액션 필요 — 카페24 관리페이지)
2. **`lib/cafe24-db.ts`** 단일 진입점 작성 (mysql2 read-only pool)
3. **`/api/cafe24/accidents`** 1차 구현 (broken call 해소)
4. **DATA-MODEL.md 정밀화** — 본 보고서의 추정을 실 DB SHOW COLUMNS 로 확정
5. **OPERATIONS.md / SCENARIOS.md** — 사용자 운영 사실 인터뷰 (규칙 25/26)

각 항목은 별도 PR + GATE 체크리스트 (규칙 27).

---

## 10. 본 보고서 한계

- ✗ DB 실 connection 미수행 — 추정에 의존, 정확한 컬럼 타입/사이즈 미확인
- ✗ PB `.pbd/.pbl` 바이너리 미해독 — 데스크톱 측 비즈니스 로직 분석 불가
- ✗ 모듈 prefix 의미 (gpb/inf/pie/pin) 일부 추정 — 사용자 확인 필요
- ✗ 운영 시간 / 부서 차이 / 마스터 변동 / 권한 차이 — 규칙 25 인터뷰 미진행
- ✗ 페르소나/시나리오 — 규칙 26 미작성
