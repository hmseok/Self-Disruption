// ============================================
// Cafe24 DB 컬럼 매핑 (실제 DB 구조 기반)
// 2026-03-18 SHOW COLUMNS + picbscdm + JOIN 분석 완료
// ============================================

// acrotpth (사고접수) 테이블 컬럼 → API alias 매핑
export const ACCIDENT_COLS: [string, string][] = [
  // ── 키/식별 ──
  ['otptidno', 'carId'],          // ★ 차량ID (pmccarsm.carsidno FK) — 기존에 staffId로 잘못 매핑됨
  ['otptmddt', 'receiptDate'],    // 접수일자
  ['otptsrno', 'seqNo'],         // 일련번호
  ['otptacnu', 'accidentNo'],    // 사고번호
  ['otptstat', 'status'],        // 상태코드 (10~90)
  ['otptrgst', 'regStatus'],     // 등록상태 (R=렌터카)
  ['otptmscs', 'category'],      // 사고유형 (A=자차, B=대물..)
  ['otptrgtp', 'regType'],       // 등록유형

  // ── 사고 기본정보 ──
  ['otptacdt', 'accidentDate'],  // 사고일자
  ['otptactm', 'accidentTime'],  // 사고시간
  ['otptacad', 'accidentLocation'], // 사고장소
  ['otptacmo', 'accidentMemo'],  // 사고내용
  ['otptacfe', 'faultRate'],     // 과실비율
  ['otptacbn', 'accidentType'],   // ★ 사고구분 (OTPTACBN: B=보물,D=단독,G=가해,K=과실,P=피해 등)
  ['otptacrn', 'vehicleRunnable'],// ★ 차량상태 (Y=운행가능,N=운행불가능) — 기존 accidentReason 잘못매핑
  // ── ★ 보험유형 Y/N 체크박스 (소스코드 api_accident.php에서 확인) ──
  ['otptacdi', 'chkBodyInjury'],  // ★ 대인 (Y/N) — 기존 accidentDi 잘못매핑
  ['otptacdm', 'chkProperty'],    // ★ 대물 (Y/N) — 기존 accidentDamage 잘못매핑
  ['otptacjc', 'chkOwnCar'],     // ★ 자차 (Y/N) — 기존 accidentJc 잘못매핑
  ['otptacjs', 'chkOwnLoss'],    // ★ 자손 (Y/N) — 기존 accidentJs 잘못매핑
  ['otptacmb', 'chkUninsured'],  // ★ 무보험 (Y/N) — 기존 driverMobile 잘못매핑
  ['otptacno', 'chkOnScene'],    // ★ 현장출동 (Y/N) — 기존 driverTel 잘못매핑
  ['otptacph', 'chkEmergTow'],   // ★ 긴급견인 (Y/N) — 기존 accidentPhoto 잘못매핑
  ['otptacet', 'accidentEtc'],   // 사고기타
  ['otptadfg', 'adFlag'],        // 사고구분플래그

  // ── ★ 운전자/통보자 (소스코드 accident.view.php에서 확인) ──
  ['otptdsnm', 'driverName'],     // ★ 운전자명 — 기존 repairShopName 잘못매핑
  ['otptdsrp', 'driverNotifySame'], // 운전자=통보자동일 (Y/N)
  ['otptdsli', 'driverLicense'],   // 운전자면허종류 (1B=1종보통 등)
  ['otptdshp', 'driverPhone'],    // ★ 운전자연락처 — 기존 repairShopPhone 잘못매핑
  ['otptdsvp', 'driverVp'],       // 운전자부가
  ['otptdsvd', 'driverAddr'],     // 운전자주소
  ['otptdsbh', 'driverBirth'],    // ★ 생년월일 — 기존 repairShopBh(공장은행) 잘못매핑
  ['otptdsbn', 'insuranceAccNo'], // ★ 보험접수번호 — 기존 repairShopBn(공장계좌) 잘못매핑
  ['otptdsus', 'propDamageStaff'],// ★ 대물담당자 — 기존 repairShopUser 잘못매핑
  ['otptdstl', 'propDamagePhone'],// ★ 대물담당자HP — 기존 repairShopTel 잘못매핑
  ['otptdsre', 'driverRelation'], // ★ 계약자와의관계 — 기존 repairShopRe(공장비고) 잘못매핑
  ['otptdscd', 'repairShopCode'],  // 공장코드 (FACTTYPE)
  ['otptdsrs', 'repairShopResult'],// 공장결과
  ['otptdspk', 'repairLocation'], // 수리희망지
  ['otptdsmo', 'towingMemo'],     // 탁송메모

  // ── 견인 ──
  ['otpttwgn', 'towingYn'],       // 견인여부
  ['otpttwnm', 'towingCompany'],  // 견인업체
  ['otpttwhp', 'towingPhone'],    // 견인전화

  // ── 통보자/상대차량 (소스코드 확인) ──
  ['otptcanm', 'notifierName'],   // ★ 통보자명 — 기존 counterpartName 잘못매핑
  ['otptcahp', 'notifierPhone'],  // 통보자전화
  ['otptcavp', 'oppCarNo'],      // 상대차량번호
  ['otptcavd', 'oppCarInfo'],    // 상대차량정보
  ['otptcare', 'driverRelType'], // ★ 운전자관계 — 기존 counterpartInsurance(보험사) 잘못매핑
  ['otptftyn', 'factoryInYn'],   // ★ 공장입고여부 — 기존 counterpartFault(상대과실) 잘못매핑

  // ── 인수자 ──
  ['otpttonm', 'handoverName'],   // 인수자성명
  ['otpttohp', 'handoverPhone'],  // 인수자전화
  ['otpttonu', 'handoverUser'],   // 인수자담당
  ['otpttomd', 'handoverMemo'],   // 인수자메모
  ['otpttobm', 'handoverBm'],    // 인수은행
  ['otpttobn', 'handoverBn'],    // 인수계좌
  ['otpttobu', 'handoverBu'],    // 인수예금주
  ['otpttobh', 'handoverBh'],    // 인수은행전화

  // ── 보상/처리 ──
  ['otptjsyn', 'settlementYn'],  // 정산여부
  ['otptdcyn', 'rentalYn'],      // 대차여부
  ['otptrtyn', 'returnYn'],      // 반납여부
  ['otptcomp', 'completeYn'],    // 완료여부
  ['otptdedu', 'deductYn'],      // 면책여부
  ['otptbdno', 'bdNo'],          // 보상번호
  ['otptbdnm', 'bdName'],        // 보상명
  ['otptpkno', 'pkNo'],          // 주차번호
  ['otptpknm', 'pkName'],        // 주차명
  ['otpttagt', 'targetAmount'],   // 목표금액
  ['otptexdt', 'examDate'],      // 검사일자
  ['otptmage', 'estimatedCost'], // 예상금액 (AI활용가능)
  ['otptodmg', 'damageArea'],    // 파손부위 (AI활용가능)
  ['otptinfg', 'insuranceFlag'], // 보험구분
  ['otptintm', 'insuranceTime'], // 보험시간
  ['otptinus', 'insuranceUser'], // 보험담당

  // ── 기타/추적 ──
  ['otptthyn', 'thYn'],          // TH여부
  ['otptgpid', 'groupId'],       // 그룹ID
  ['otptchid', 'channelId'],     // 채널ID
  ['otptgnus', 'createdBy'],     // 등록자
  ['otptgndt', 'createdDate'],   // 등록일
  ['otptgntm', 'createdTime'],   // 등록시간
  ['otptupus', 'updatedBy'],     // 수정자
  ['otptupdt', 'updatedDate'],   // 수정일
  ['otptuptm', 'updatedTime'],   // 수정시간
];

// acrrentm (대차) 테이블 컬럼 → API alias 매핑
export const RENTAL_COLS: [string, string][] = [
  ['rentidno', 'rentStaffId'],        // 대차담당자ID (acrotpth staffId와 중복방지)
  ['rentmddt', 'rentReceiptDate'],    // 대차접수일자
  ['rentsrno', 'rentSeqNo'],         // 대차일련번호
  ['rentseqn', 'rentalSeq'],     // 대차순번
  ['rentstat', 'rentalStatus'],   // 대차상태
  ['rentrsdt', 'requestDate'],    // 대차요청일
  ['rentfrdt', 'rentalFromDate'], // 대차시작일
  ['rentfrtm', 'rentalFromTime'], // 대차시작시간
  ['renttodt', 'rentalToDate'],   // 대차종료일
  ['renttotm', 'rentalToTime'],   // 대차종료시간
  ['rentuser', 'rentalUser'],     // 이용자
  ['rentushp', 'rentalUserPhone'],// 이용자전화
  ['renttypp', 'rentalType'],     // 대차유형 (renttypp 임! renttype 아님!)
  ['rentnums', 'rentalCarNo'],    // 대차차량번호
  ['rentmodl', 'rentalCarModel'], // 대차차종
  ['rentfacd', 'rentalFactory'],  // 대차업체
  ['rentmemo', 'rentalMemo'],     // 대차메모
  ['rentgnus', 'rentCreatedBy'],   // 대차등록자 (acrotpth createdBy와 충돌방지)
  ['rentgndt', 'rentCreatedDate'], // 대차등록일
  ['rentgntm', 'rentCreatedTime'], // 대차등록시간
  ['rentupus', 'rentUpdatedBy'],   // 대차수정자
  ['rentupdt', 'rentUpdatedDate'], // 대차수정일
  ['rentuptm', 'rentUpdatedTime'], // 대차수정시간
];

// pmccarsm (차량마스터) — acrotpth.otptidno = pmccarsm.carsidno
export const CAR_COLS: [string, string][] = [
  ['carsidno', 'carIdno'],        // 차량ID
  ['carscust', 'carCustCode'],    // 고객코드 (pmccustm FK)
  ['carsnums', 'carPlateNo'],     // ★ 차량번호 (196허2101)
  ['carsodnm', 'carModelName'],   // 차량명칭
  ['carsstat', 'carStatus'],      // 차량상태 (R=이용중, H=해지, L=반납)
  ['carstype', 'carType'],        // 실비/턴키 (S/T)
  ['carsuser', 'carOwner'],       // 소유자/계약자
  ['carscosv', 'carServiceType'], // 서비스형태 코드
  ['carscofr', 'carContractFrom'],// 계약시작일
  ['carscoto', 'carContractTo'],  // 계약종료일
  ['carsfrdt', 'carFromDate'],    // 이용시작일
  ['carstodt', 'carToDate'],      // 이용종료일
  ['carsmodl', 'carModelCode'],   // 차량모델코드
  ['carsbocd', 'carInsCode'],     // 보험사코드 (BHNAME)
  ['carsbomn', 'carDeductMin'],   // 면책금(최소)
  ['carsbomx', 'carDeductMax'],   // 면책금(최대)
  ['carsboag', 'carAgeLimit'],    // 연령한정
  ['carsbocl', 'carInsClass'],    // 보험등급
  ['carsusnm', 'carContactName'], // 담당자명
  ['carsushp', 'carContactPhone'],// 담당자전화
  ['carsustl', 'carContactTel'],  // 담당자연락처
  ['carsusad', 'carAddress'],     // 주소
  ['carsadgp', 'carZipCode'],     // 우편번호
];

// pmccustm (고객마스터) — pmccarsm.carscust = pmccustm.custcode
export const CUST_COLS: [string, string][] = [
  ['custcode', 'custCode'],       // 고객코드
  ['custname', 'custName'],       // 고객명 (회사명)
  ['custhpno', 'custPhone'],      // 고객전화
  ['custtelo', 'custTel'],        // 고객유선
  ['custfaxo', 'custFax'],        // 팩스
  ['custaddr', 'custAddr'],       // 주소
];

// 공통: 테이블 컬럼 동적 확인 후 SELECT 절 생성
export async function buildSelectCols(
  pool: any,
  table: string,
  alias: string,
  colMap: [string, string][],
): Promise<{ select: string; colSet: Set<string> }> {
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM ${table}`);
    const colSet = new Set((cols as any[]).map((c: any) => (c.Field || '').toLowerCase()));
    const found = colMap.filter(([col]) => colSet.has(col.toLowerCase()));
    return {
      select: found.map(([col, as]) => `${alias}.${col} as ${as}`).join(', '),
      colSet,
    };
  } catch {
    return { select: '', colSet: new Set() };
  }
}
