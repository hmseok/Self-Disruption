# DATA-MODEL.md — 카페24 ERP 측 데이터 모델 (분석 기반)

> 본 문서는 **PHP 코드 SQL 추출 + 함수 시그니처 + 한국어 주석** 기반의 추정 모델.
> 실제 DB 의 `SHOW CREATE TABLE` 결과 확정 전까지는 ★ 표시된 부분 **검증 필요**.

---

## 1. 명명 규칙 (확정)

### 테이블명
```
<3-prefix><4-entity><1-suffix>
  prefix : 모듈 (pmc/aja/ajc/ajr/ace/acr/pic/pie/pin/ins/crm/...)
  entity : 4글자 핵심 (cars/cust/oder/fact/insp/odeer/esos/...)
  suffix : h(header) / l(line) / m(master) / s(sub)

예시:
  pmccarsm = pmc(마스터모듈) + cars(차량) + m(마스터)
  ajaoderh = aja(주문) + oder(order) + h(header)
  ajaopslh = aja(주문) + opsl(order parts/sub line?) + h(header)
  aceesosh = ace(접수) + esos(?) + h(header)
```

### 컬럼명
```
<table-prefix><4-letter-meaning>

예시 (ajaoderh 테이블의 컬럼):
  oderfact = aja-oder + fact (factory? 협력업체)
  oderidno = aja-oder + idno (식별번호 ID No.)
  odermddt = aja-oder + mddt (modify date?)
  odersrno = aja-oder + srno (sequential no?)
  oderseqn = aja-oder + seqn (sequence)
  oderstat = aja-oder + stat (status)
  oderfrdt = aja-oder + frdt (from date)
  odertodt = aja-oder + todt (to date)
  oderkilo = aja-oder + kilo (kilometers)
  oderfamo = aja-oder + famo (final amount?)
  oderbogn = aja-oder + bogn (부담금 구분 — 정액/정률)
  oderbomx = aja-oder + bomx (부담금 max)
  oderbomn = aja-oder + bomn (부담금 min)
```

---

## 2. 식별된 테이블 (코드 기반)

### 2.1 `pmccarsm` — 차량 마스터 ★

```
PK: (carsidno, carsfrdt~carstodt) — SCD-Type2 effective range
컬럼 (확인됨):
  carsidno    차량 식별번호
  carsfrdt    효력 시작일
  carstodt    효력 종료일
  ...

쿼리 패턴:
  SELECT * FROM pmccarsm
   WHERE carsidno = ?
     AND ? BETWEEN carsfrdt AND carstodt
```

### 2.2 `pmccustm` — 고객 마스터 ★

```
PK: custcode
쿼리 패턴:
  SELECT * FROM pmccustm WHERE custcode = ?
```

### 2.3 `pmcfactm` — 협력업체(?) 마스터 ★ (추정)

함수 `fs_pmcfactm_get` 존재. 컬럼 미확인.

### 2.4 `pmcfinem` — 정비? 벌금? 마스터 ★ (추정)

함수 `fs_pmcfinem_get` 존재. 컬럼 미확인.

### 2.5 `pmbscalm` — 기준 캘린더? 마스터 ★ (추정)

함수 `fs_pmbscalm_get` 존재.

### 2.6 `picuserm` — 사용자 마스터 ★

`backup/picuserm.sql` 백업 파일 존재 (단 16라인 헤더만, 본문 없음).
`fs_picuserm_get` 함수 존재.

### 2.7 `picmechm` — 정비? 마스터 ★ (추정)

함수 `fs_picmechm_get` 존재.

### 2.8 `picsvrmm` — 서버? 마스터 ★ (추정)

함수 `fs_picsvrmm_get` 존재.

### 2.9 `aceesosh` — 협력업체 접수 헤더 ✅ 실 DDL 확정 (PR-6.1)

```sql
CREATE TABLE aceesosh (
  esosidno  VARCHAR(8)    NOT NULL,    -- PK 1: 식별 ID
  esosmddt  VARCHAR(8)    NOT NULL,    -- PK 2: 날짜 YYYYMMDD
  esossrno  INT(11)       NOT NULL,    -- PK 3: 일련번호
  esosacdt  VARCHAR(8),                -- accept date YYYYMMDD
  esosactm  VARCHAR(4),                -- accept time HHMM
  esosrgst  VARCHAR(1),                -- ★ 상태 코드 (R/C/X 등 — 다양)
  esosrslt  VARCHAR(1),                -- 결과 코드
  esosrstx  VARCHAR(2000),             -- 결과 텍스트 (한글 메모)
  esostypp  VARCHAR(1),                -- 타입
  esosbate  VARCHAR(1),                -- 배터리
  esostire  VARCHAR(1),                -- 타이어
  esosoils  VARCHAR(1),                -- 오일
  esoslock  VARCHAR(1),                -- 잠김
  esosmove  ...                        -- (더 많은 컬럼 — 잘림, 다음 PR 에서 전체 수집)
  PRIMARY KEY (esosidno, esosmddt, esossrno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

행 수: 77,463
샘플: { esosidno:'10000001', esosmddt:'20240315', esossrno:50033, esosrgst:'C' }
```

**중요 변경**:
- 이전 추정: `esosrgst='R'` 만 → ❌ **틀림**. C/X 등 다양한 코드.
- esosrgst 는 **상태 코드** — bscddesc 에서 코드 의미 매핑 필요
- esosrstx VARCHAR(2000) — 결과 텍스트 (한국어 자유 메모)
- 모든 1자 코드 컬럼 (rgst/rslt/typp/bate/tire/oils/lock) 은 코드 마스터 조인 필요

### 2.10 `ajaoderh` — 사고차 대차 주문 헤더 ★

```
PK: (oderfact, oderidno, odermddt, odersrno, oderseqn) + oderstat<>'X'

확인된 컬럼:
  oderfact        팩토리(협력업체) 코드
  oderidno        주문 식별번호
  odermddt        주문 작성일자
  odersrno        주문 시퀀스
  oderseqn        주문 일련번호
  oderstat        주문 상태 (X = 취소/삭제)
  oderacdt        accept date?
  oderactm        accept time?
  oderetmt        ?
  oderpers        예상 과실율
  oderfrdt        대차 시작일
  odertodt        대차 종료일
  oderkilo        주행거리(km)
  oderfamo        최종 금액 (final amount)
  oderskmo        ?
  oderusmo        사용 금액?
  odergnus/gndt/gntm  생성자/생성일/생성시각
  oderupus/updt/uptm  수정자/수정일/수정시각
  oderhpdt        ?
  odermetp        ? (method type?)
  oderflag        flag
  oderwkdt        work date?
  odercont        contents
  oderuser        user
  odercomp        company
  oderbogn        부담금 구분 (정액/정률)
  oderbomn        부담금 최소
  oderbomx        부담금 최대
  oderbofc        자기 부담율
  oderetcn        면책금 건수
  oderpxfg        ?
  oderdcyn        할인 여부 (Y/N)
  oderhold        보류
  oderhomo        보류 사유?
  oderhodt/hort/hord  보류 일/시각/순서?
  oderhous        보류 사용자?
  oderadfg        ad flag?
```

### 2.11 `ajaopslh` — 사고차 대차 주문 라인 ★

```
PK: (opslfact, opslidno, opslmddt, opslsrno, opslseqn) + opslflag='O'

확인된 컬럼:
  opslfact/idno/mddt/srno/seqn   주문 헤더와 동일 키 (line FK)
  opslbamt        base amount (기본 금액)
  opslbcnt        base count (기본 건수)
  opslgamt        gross amount (총액)
  opsltims        times (일수)
  opsljamt        ? (감가? 정산?)
  opsldcmt        discount amount
  opsldcyn        discount yes/no
  opslflag        flag (O = 활성 추정)
```

### 2.12 `ajaopsbh`, `ajaopsmh` — 주문 sub/main ★ (추정)

함수 `fs_ajaopsbh_get`, `fs_ajaopsmh_get` 존재. 컬럼 미확인.

### 2.13 `ajcinsph` — 보험 헤더 ★

함수 `fs_ajcinsph_get`, `fpm_ajcinsph_calc/change` 존재. 보험 헤더 추정.

### 2.14 `ajcipsbh`, `ajcipslh`, `ajcipsmh` — 보험 sub/line/main ★

### 2.15 `ajcachsh` — 보험 청구? sub-header ★

함수 `fs_ajcachsh_set` 존재.

### 2.16 `ajaachsh` — 사고차 청구? sub-header ★

### 2.17 `ajradplh` — 운영 라인? ★

### 2.18 `ajradpym` — 운영 결제? 마스터 ★

### 2.19 `ajrfineh` — 운영 벌금? 헤더 ★

### 2.20 `ajrinfth` — 운영 정보? 헤더 ★

### 2.21 `ajrpinsh` — ★★ 메인 워크플로우 헤더

`_api/` 에 4개 endpoint 보유:
- `ajrpinsh_check.php`
- `ajrpinsh_exec_calc.php`
- `ajrpinsh_stat_change.php`
- `ajrpinsh_stat_move.php`

함수: `fs_ajrpinsh_get`, `fpm_ajrpinsh_calc/change`, `fpc_ajrpinsh_mesg`

→ 사고차 대차 정산 메인 워크플로우. **FMI 측 핵심 매핑 대상**.

### 2.22 `ajrtongh` — 운영 통계? ★

### 2.23 `ajrupsbh`, `ajrupslh`, `ajrupsmh` — 운영 sub/line/main ★

### 2.24 `ajtconsh` — AJT 모듈 sub-header ★

### 2.25 `acrotpth` — ACR 모듈 ★ (사고차 OTP? Output?)

### 2.26 `applistm` — 앱 리스트? 마스터 ★

### 2.27 `pieclbsm`, `pieclmoh`, `pieclodh`, `piecltmh` — PIE 모듈 ★

함수 `fpm_pieclbsm_calc/change/delete`, `fpm_pieclodh_fact` 존재.

### 2.28 `pieedish` — PIE EDI sub-header? ★

### 2.29 `pinscalc`, `pinsmxdt`, `pinsrstp` — PIN 모듈 ★

### 2.30 `crminfo` — CRM 정보 ★

### 2.31 `custdesc` — 고객 설명/메모 ★

### 2.32 `bscddesc` — 코드 설명? ★

### 2.33 `carsgumsa` — 차량 검사 ★

### 2.34 `zipadrsm` — 우편번호 주소 마스터 ★

### 2.35 `putucmtm` — ? 마스터 ★

### 2.36 `channel_groups_session`, `channel_groups_threads` — 채널/세션 (잔디?) ★

---

## 3. 모듈 prefix 매핑 (재정리)

| Prefix | 추정 영역 | 식별 테이블 | _api endpoint |
|--------|----------|-----------|---------------|
| `pmc` | 마스터 (Personal Master Code?) | pmccarsm, pmccustm, pmcfactm, pmcfinem, pmbscalm | - |
| `pic` | 마스터 (Personal Identity?) | picuserm, picmechm, picsvrmm | - |
| `aja` | 사고차 대차 주문 | ajaoderh, ajaopsbh/opslh/opsmh, ajaachsh | - |
| `ajc` | 사고차 보험 | ajcinsph, ajcipsbh/ipslh/ipsmh, ajcachsh | - |
| `ajr` | ★ 사고차 정산/운영 | ajrpinsh, ajradplh/dpym, ajrfineh/inf​th/tongh, ajrupsbh/upslh/upsmh | ajrpinsh_* (4개) |
| `ajt` | 사고차 ? | ajtconsh | - |
| `ace` | 협력업체 접수 | aceesosh | - |
| `acr` | ACR (Accident Car Replacement?) | acrotpth | - |
| `pie` | ? (계산 비즈니스) | pieclbsm, pieclmoh, pieclodh, piecltmh, pieedish | - |
| `pin` | ? (보험금 처리?) | pinscalc, pinsmxdt, pinsrstp | - |
| `ins` | Insurance (보험) | (별도 모듈, ins_app) | ins_sign.php |
| `crm` | Customer Relation | crminfo, crmsendh | crmsendh_result.php |
| `cust` | Customer | custdesc | - |
| `bscd` | 기준 코드 | bscddesc | - |
| `cars` | 차량 | carsgumsa | - |
| `zip/adrs` | 주소 | zipadrsm | juso_api*, kakao_addr |
| `app` | 앱 | applistm | - |
| `channel` | 채널 (잔디?) | channel_groups_* | jandi_webhook* |
| `gpb` / `inf` / `gpb` | ? | (확인 필요) | - |

---

## 4. 핵심 PK 패턴

대부분 테이블이 다음 5단 키를 따름:

```
(fact, idno, mddt, srno, seqn)

fact = factory (협력업체) 코드
idno = ID number (개체 식별)
mddt = modify date? (날짜 키)
srno = serial no (그날 일련 번호)
seqn = sequence (라인/버전)
```

또는 마스터의 경우:
```
(idno, frdt~todt)  -- SCD-Type2 효력기간
```

---

## 5. 워크플로우 상태 코드 (단편)

- `oderstat = 'X'` → 취소/삭제 (제외)
- `esosrgst = 'R'` → 등록 상태
- `opslflag = 'O'` → 활성 라인
- 그 외 상태 코드 → 코드 마스터 (`bscddesc` 추정) 에서 별도 조회 필요

---

## 6. FMI 매핑 후보

다음 PR 에서 매핑 결정:

| 카페24 테이블 | FMI 측 후보 | 매핑 방식 |
|--------------|-----------|---------|
| `aceesosh` (사고 접수) | `/api/cafe24/accidents` | 직접 read |
| `ajaoderh` (대차 주문) | `/api/cafe24/orders` | 직접 read + 헤더+라인 조인 |
| `ajaopslh` (대차 주문 라인) | 위와 함께 | 헤더 키로 조인 |
| `pmccustm` (고객 마스터) | `/api/cafe24/customers` | custcode 검색 |
| `pmccarsm` (차량 마스터) | `/api/cafe24/vehicles` | carsidno 검색 + 효력기간 필터 |
| `ajrpinsh` (정산 워크플로우) | `/api/cafe24/settlements` | 메인 비즈니스 — 신중 설계 |

---

## 6.5 모듈 prefix 갯수 (PR-6.1 실 DB 확정)

```
ajr   77 tables  ★ 메인 워크플로우 (운영/정산)
pmc   48          마스터 (차량/고객/협력업체)
pic   43 tables  ★ 사용자/정비 마스터 (큰 모듈)
ajc   12          보험
plu   12 tables  ★ 신규 발견 — 의미 미확인
ins   12          보험 (별도 모듈)
pie   10          정비/청구
cha   10 tables  ★ 신규 — charger 추정
acr    8          ACR (사고차)
put    7         ★ 신규
pmo    7         ★ 신규
fil    6          파일
com    5          공통
crm    5          CRM
imr    5          imrwon
gfc    5         ★ 신규
aja    5          사고차 대차 주문
zip    4          우편번호
gpb    4
```

총 382 tables — Top 20 prefix 가 약 290개 차지.
신규 발견 (plu/cha/put/pmo/gfc) 의미는 별도 PR 에서 정밀 분석.

## 7. 검증 필요 항목 (★)

다음 PR 에서 실 DB 연결 후 즉시 검증:

```sql
-- MariaDB 10.1 호환 확인 + 테이블 존재 + 컬럼 정확
SHOW TABLES LIKE 'pmc%';     -- pmc 마스터들
SHOW TABLES LIKE 'aja%';     -- 주문 테이블들
SHOW TABLES LIKE 'ajr%';     -- 정산 테이블들
DESC pmccarsm;
DESC pmccustm;
DESC ajaoderh;
DESC ajaopslh;
DESC aceesosh;
DESC ajrpinsh;
SELECT COUNT(*) FROM pmccarsm;  -- 데이터 규모
SELECT @@version;                -- 정확한 MariaDB 버전 (10.1 가정 검증)
SELECT @@sql_mode;                -- ONLY_FULL_GROUP_BY 등 검증
SELECT @@collation_database;     -- utf8mb3 추정 (mariadb 백업 헤더에서)
```
