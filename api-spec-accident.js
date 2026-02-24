const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak
} = require('docx');

// ── Shared styles
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };
const headerShading = { fill: "1B3A5C", type: ShadingType.CLEAR };
const altShading = { fill: "F5F8FA", type: ShadingType.CLEAR };
const groupShading = { fill: "E8EEF5", type: ShadingType.CLEAR };

const TABLE_WIDTH = 9360;
const COL_NO = 500;
const COL_FIELD = 2400;
const COL_TYPE = 1000;
const COL_REQ = 700;
const COL_DESC = TABLE_WIDTH - COL_NO - COL_FIELD - COL_TYPE - COL_REQ;

function headerCell(text, width) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: headerShading, margins: cellMargins,
    verticalAlign: 'center',
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text, bold: true, font: "Arial", size: 18, color: "FFFFFF" })
    ]})]
  });
}

function dataCell(text, width, opts = {}) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: opts.shaded ? altShading : opts.group ? groupShading : undefined,
    margins: cellMargins,
    columnSpan: opts.colSpan,
    children: [new Paragraph({ alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [
      new TextRun({ text: text || '', font: "Arial", size: 18, bold: opts.bold, color: opts.color })
    ]})]
  });
}

// group header row (spans entire table)
function groupRow(label) {
  return new TableRow({ children: [
    new TableCell({
      borders, width: { size: TABLE_WIDTH, type: WidthType.DXA },
      shading: groupShading, margins: cellMargins,
      columnSpan: 5,
      children: [new Paragraph({ children: [
        new TextRun({ text: label, font: "Arial", size: 18, bold: true, color: "1B3A5C" })
      ]})]
    }),
  ]});
}

function fieldRow(no, field, type, req, desc, shaded) {
  return new TableRow({ children: [
    dataCell(no, COL_NO, { center: true, shaded }),
    dataCell(field, COL_FIELD, { shaded, bold: true }),
    dataCell(type, COL_TYPE, { center: true, shaded }),
    dataCell(req, COL_REQ, { center: true, shaded, color: req === 'Y' ? 'C0392B' : '7F8C8D' }),
    dataCell(desc, COL_DESC, { shaded }),
  ]});
}

// ── 중첩 JSON 구조에 맞춘 필드 정의 (스카이오토 확정 구조)
const fieldGroups = [
  { label: '루트 (root)', fields: [
    ['1', 'receipt_no', 'string', 'Y', '접수번호 (예: 260220-001-0891)'],
    ['2', 'handler_name', 'string', 'N', '접수자 이름 (예: 정지은)'],
  ]},
  { label: 'car (차량 정보)', fields: [
    ['3', 'car.number', 'string', 'Y', '차량번호 (예: 171호6793)'],
    ['4', 'car.model_detail', 'string', 'N', '차종 상세명 (예: 신형 K9 가솔린 3.8)'],
    ['5', 'car.class_code', 'code', 'N', '★ 차급 코드 (코드표 H 참조)'],
    ['6', 'car.fuel_type_code', 'code', 'N', '★ 유종 코드 (코드표 I 참조)'],
    ['7', 'car.brand_code', 'code', 'N', '★ 제조사 코드 (코드표 J 참조)'],
  ]},
  { label: 'customer (고객 정보)', fields: [
    ['8', 'customer.name', 'string', 'Y', '고객명 (예: [법인]주식회사공화정공)'],
    ['9', 'customer.finance_company', 'string', 'N', '거래처(금융사)명 (예: 우리금융캐피탈)'],
  ]},
  { label: 'service (서비스·보험 구분)', fields: [
    ['10', 'service.type_code', 'code', 'N', '★ 서비스유형 코드 (코드표 A 참조)'],
    ['11', 'service.settlement_type_code', 'code', 'N', '★ 정산방식 코드 (코드표 B 참조)'],
    ['12', 'service.fault_type_code', 'code', 'Y', '★ 과실구분 코드 (코드표 C 참조)'],
    ['13', 'service.insurance_type_code', 'code', 'N', '★ 보험종류 코드 (코드표 D 참조)'],
  ]},
  { label: 'accident (사고 상세)', fields: [
    ['14', 'accident.date', 'string', 'Y', '사고일시 (ISO 8601: 2026-02-20T14:35:00+09:00)'],
    ['15', 'accident.receipt_date', 'string', 'Y', '접수일시 (ISO 8601)'],
    ['16', 'accident.execution_date', 'string', 'N', '실행일자 (계약 시작일, YYYY-MM-DD)'],
    ['17', 'accident.location', 'string', 'Y', '사고장소 (예: 서울특별시 강남구 테헤란로 102길)'],
    ['18', 'accident.description', 'string', 'Y', '사고내용 상세 설명'],
    ['19', 'accident.damage_part_code', 'code', 'N', '★ 파손부위 코드 (코드표 L 참조)'],
    ['20', 'accident.damage_part_detail', 'string', 'N', '파손부위 상세 (자유입력, 코드 보충)'],
    ['21', 'accident.drivable', 'boolean', 'Y', '운행가능 여부 (true/false)'],
  ]},
  { label: 'reporter (통보자)', fields: [
    ['22', 'reporter.name', 'string', 'Y', '통보자 이름'],
    ['23', 'reporter.phone', 'string', 'Y', '통보자 연락처 (예: 010-5520-5719)'],
    ['24', 'reporter.relation_code', 'code', 'N', '★ 통보자 관계 코드 (코드표 E 참조)'],
  ]},
  { label: 'driver (운전자)', fields: [
    ['25', 'driver.name', 'string', 'Y', '운전자 이름'],
    ['26', 'driver.phone', 'string', 'Y', '운전자 연락처'],
    ['27', 'driver.birth', 'string', 'N', '운전자 생년월일 (YYMMDD)'],
    ['28', 'driver.license_code', 'code', 'N', '★ 운전면허 종류 코드 (코드표 F 참조)'],
    ['29', 'driver.relation_code', 'code', 'N', '★ 운전자 관계 코드 (코드표 E 참조)'],
  ]},
  { label: 'deductible (면책금)', fields: [
    ['30', 'deductible.type_code', 'code', 'Y', '★ 면책금 유형 코드 (코드표 K 참조)'],
    ['31', 'deductible.amount', 'number', 'Y', '면책금 확정 금액 (원)'],
    ['32', 'deductible.rate', 'number', 'N', '면책금 비율 (%, 정률일 때만)'],
    ['33', 'deductible.min_amount', 'number', 'N', '면책금 최소금액 (원, 정률 하한선)'],
    ['34', 'deductible.max_amount', 'number', 'N', '면책금 최대금액 (원, 정률 상한선)'],
  ]},
  { label: 'repair (수리)', fields: [
    ['35', 'repair.needs_repair', 'boolean', 'Y', '수리 필요 여부 (true/false)'],
    ['36', 'repair.location', 'string', 'N', '수리 장소 (예: 서울 강남구 신월정비소)'],
  ]},
  { label: 'insurance_policy (보험 정보)', fields: [
    ['37', 'insurance_policy.own.company_code', 'code', 'N', '★ 자차 보험사 코드 (코드표 G 참조)'],
    ['38', 'insurance_policy.own.policy_no', 'string', 'N', '자차 보험증권번호 (예: 20261840470)'],
    ['39', 'insurance_policy.counter.company_code', 'code', 'N', '★ 상대 보험사 코드 (코드표 G 참조)'],
    ['40', 'insurance_policy.counter.policy_no', 'string', 'N', '상대 보험증권번호'],
  ]},
];

// ── Code tables definition (코드표 L 파손부위 추가)
const codeTables = [
  { id: 'A', name: '서비스유형 (service.type_code)', codes: [
    ['SELF', '자가관리', '임차인이 직접 관리하는 차량'],
    ['CUSTOMER', '고객관리', '렌터카사가 관리하는 차량'],
  ]},
  { id: 'B', name: '정산방식 (service.settlement_type_code)', codes: [
    ['TURNKEY', '턴키', '렌터카사가 수리비 전액 정산 후 일괄 청구'],
    ['ACTUAL', '실비', '실제 발생 비용 기준 정산'],
  ]},
  { id: 'C', name: '과실구분 (service.fault_type_code)', codes: [
    ['AT_FAULT', '가해', '당사 과실 (과실비율 50% 초과)'],
    ['VICTIM', '피해', '상대방 과실 (당사 과실 0~49%)'],
    ['MUTUAL', '쌍방', '쌍방 과실 (과실비율 협의 필요)'],
    ['EXEMPT', '면책', '자연재해·도난 등 과실 없음'],
  ]},
  { id: 'D', name: '보험종류 (service.insurance_type_code)', codes: [
    ['OWN_DAMAGE', '자차', '자기차량손해 보험 처리'],
    ['PROPERTY', '대물', '대물배상 보험 처리'],
    ['PERSONAL', '대인', '대인배상 보험 처리'],
    ['NONE', '미적용', '보험 미적용'],
  ]},
  { id: 'E', name: '관계구분 (reporter/driver.relation_code)', codes: [
    ['SELF', '본인', '계약자 본인'],
    ['CEO', '대표', '법인 대표이사'],
    ['EMPLOYEE', '임직원', '법인 소속 임직원'],
    ['FAMILY', '가족', '계약자 가족'],
    ['AGENT', '대리인', '위임받은 대리인'],
    ['OTHER', '기타', '기타 관계'],
  ]},
  { id: 'F', name: '면허종류 (driver.license_code)', codes: [
    ['1종대형', '1종대형', '1종 대형면허'],
    ['1종보통', '1종보통', '1종 보통면허'],
    ['2종보통', '2종보통', '2종 보통면허 (오토)'],
    ['2종소형', '2종소형', '2종 소형면허'],
    ['원동기', '원동기', '원동기장치자전거면허'],
  ]},
  { id: 'G', name: '보험사 (insurance_policy.*.company_code)', codes: [
    ['MERITZ', '메리츠화재', '메리츠화재해상보험'],
    ['SAMSUNG', '삼성화재', '삼성화재해상보험'],
    ['HYUNDAI', '현대해상', '현대해상화재보험'],
    ['DB', 'DB손해보험', 'DB손해보험'],
    ['KB', 'KB손해보험', 'KB손해보험'],
    ['LOTTE', '롯데손해보험', '롯데손해보험'],
    ['HANHWA', '한화손해보험', '한화손해보험'],
    ['HEUNGKUK', '흥국화재', '흥국화재해상보험'],
    ['MG', 'MG손해보험', 'MG손해보험'],
    ['CARCO', '렌터카공제조합', '전국렌터카공제조합'],
    ['OTHER', '기타', '기타 보험사 (비고란에 명시)'],
  ]},
  { id: 'H', name: '차급 (car.class_code)', codes: [
    ['LIGHT', '경형', '경차 (모닝, 레이, 스파크 등)'],
    ['SMALL', '소형', '소형차 (아반떼, K3 등)'],
    ['MID', '중형', '중형차 (쏘나타, K5, 캠리 등)'],
    ['LARGE', '대형', '대형차 (그랜저, K8, G80 등)'],
    ['PREMIUM', '프리미엄', '프리미엄 (G90, EQ900, 제네시스 등)'],
    ['SUV_SMALL', 'SUV소형', '소형SUV (코나, 셀토스, XM3 등)'],
    ['SUV_MID', 'SUV중형', '중형SUV (투싼, 스포티지, RAV4 등)'],
    ['SUV_LARGE', 'SUV대형', '대형SUV (팰리세이드, 모하비, GV80 등)'],
    ['VAN', '승합', '승합차 (스타리아, 카니발 등)'],
    ['TRUCK', '화물', '화물차 (포터, 봉고 등)'],
    ['IMPORT', '수입', '수입차 (BMW, 벤츠, 아우디 등)'],
  ]},
  { id: 'I', name: '유종 (car.fuel_type_code)', codes: [
    ['GAS', '가솔린', '가솔린 엔진'],
    ['DIESEL', '디젤', '디젤 엔진'],
    ['LPG', 'LPG', 'LPG 엔진'],
    ['HEV', '하이브리드', '가솔린+전기 하이브리드'],
    ['PHEV', '플러그인HEV', '플러그인 하이브리드'],
    ['BEV', '전기', '순수 전기차'],
    ['FCEV', '수소', '수소연료전지차'],
  ]},
  { id: 'J', name: '제조사 (car.brand_code)', codes: [
    ['HYUNDAI', '현대', '현대자동차'],
    ['KIA', '기아', '기아자동차'],
    ['GENESIS', '제네시스', '제네시스 (현대 프리미엄)'],
    ['SSANGYONG', 'KG모빌리티', 'KG모빌리티 (구 쌍용)'],
    ['RENAULT', '르노코리아', '르노코리아자동차'],
    ['CHEVROLET', '쉐보레', 'GM 쉐보레'],
    ['BMW', 'BMW', 'BMW'],
    ['BENZ', '벤츠', '메르세데스-벤츠'],
    ['AUDI', '아우디', '아우디'],
    ['VOLVO', '볼보', '볼보'],
    ['TESLA', '테슬라', '테슬라'],
    ['TOYOTA', '토요타', '토요타'],
    ['HONDA', '혼다', '혼다'],
    ['VOLKSWAGEN', 'VW', '폭스바겐'],
    ['OTHER', '기타', '기타 제조사 (비고란에 명시)'],
  ]},
  { id: 'K', name: '면책금유형 (deductible.type_code)', codes: [
    ['FIXED', '정액', '고정 금액 면책금 (amount에 금액 지정)'],
    ['RATE', '정률', '수리비 대비 비율 (rate에 % 지정, min/max로 범위 제한)'],
  ]},
  { id: 'L', name: '파손부위 (accident.damage_part_code)', codes: [
    ['FRONT_BUMPER', '전면 범퍼', '프론트 범퍼 및 그릴'],
    ['REAR_BUMPER', '후면 범퍼', '리어 범퍼'],
    ['HOOD', '후드(본넷)', '엔진 후드 / 본넷'],
    ['TRUNK', '트렁크', '트렁크 리드'],
    ['ROOF', '루프', '차량 지붕'],
    ['FL_FENDER', '좌측 앞 펜더', '운전석 측 프론트 펜더'],
    ['FR_FENDER', '우측 앞 펜더', '조수석 측 프론트 펜더'],
    ['RL_QUARTER', '좌측 뒤 쿼터', '운전석 측 리어 쿼터패널'],
    ['RR_QUARTER', '우측 뒤 쿼터', '조수석 측 리어 쿼터패널'],
    ['FL_DOOR', '좌측 앞문', '운전석 도어'],
    ['FR_DOOR', '우측 앞문', '조수석 도어'],
    ['RL_DOOR', '좌측 뒷문', '운전석 측 뒷문'],
    ['RR_DOOR', '우측 뒷문', '조수석 측 뒷문'],
    ['FL_SIDE', '좌측 사이드패널', '운전석 측 사이드실/패널'],
    ['FR_SIDE', '우측 사이드패널', '조수석 측 사이드실/패널'],
    ['WINDSHIELD', '전면 유리', '앞 유리 (윈드실드)'],
    ['REAR_GLASS', '후면 유리', '뒷 유리'],
    ['SIDE_MIRROR_L', '좌측 사이드미러', '운전석 사이드미러'],
    ['SIDE_MIRROR_R', '우측 사이드미러', '조수석 사이드미러'],
    ['WHEEL_FL', '좌측 앞 휠/타이어', '운전석 측 앞 휠+타이어'],
    ['WHEEL_FR', '우측 앞 휠/타이어', '조수석 측 앞 휠+타이어'],
    ['WHEEL_RL', '좌측 뒤 휠/타이어', '운전석 측 뒤 휠+타이어'],
    ['WHEEL_RR', '우측 뒤 휠/타이어', '조수석 측 뒤 휠+타이어'],
    ['UNDERCARRIAGE', '하부', '차체 하부 (서스펜션·머플러 등)'],
    ['INTERIOR', '실내', '시트·대시보드·내장재 등'],
    ['TOTAL_LOSS', '전손', '차량 전체 파손 (전손 처리)'],
    ['OTHER', '기타', '기타 부위 (damage_part_detail에 상세 기재)'],
  ]},
];

// ── 스카이오토 확정 JSON 예시 (중첩 구조)
const jsonExample = `{
  "receipt_no": "260220-001-0891",
  "car": {
    "number": "171호6793",
    "model_detail": "신형 K9 가솔린 3.8",
    "class_code": "LARGE",
    "fuel_type_code": "GAS",
    "brand_code": "KIA"
  },
  "customer": {
    "name": "[법인]주식회사공화정공",
    "finance_company": "우리금융캐피탈"
  },
  "service": {
    "type_code": "SELF",
    "settlement_type_code": "TURNKEY",
    "fault_type_code": "AT_FAULT",
    "insurance_type_code": "OWN_DAMAGE"
  },
  "accident": {
    "date": "2026-02-20T14:35:00+09:00",
    "receipt_date": "2026-02-20T14:45:00+09:00",
    "execution_date": "2026-02-24",
    "location": "서울특별시 강남구 테헤란로 102길",
    "description": "교차로에서 신호위반 차량과 측면 충돌",
    "damage_part_code": "FR_DOOR",
    "damage_part_detail": "우측도어·사이드패널 긁힘 및 찌그러짐",
    "drivable": true
  },
  "reporter": {
    "name": "박준영",
    "phone": "010-5520-5719",
    "relation_code": "SELF"
  },
  "driver": {
    "name": "박준영",
    "phone": "010-5520-5719",
    "birth": "680115",
    "license_code": "1종보통",
    "relation_code": "CEO"
  },
  "deductible": {
    "type_code": "FIXED",
    "amount": 300000,
    "rate": null,
    "min_amount": null,
    "max_amount": null
  },
  "repair": {
    "needs_repair": true,
    "location": "서울 강남구 신월정비소"
  },
  "insurance_policy": {
    "own": {
      "company_code": "MERITZ",
      "policy_no": "20261840470"
    },
    "counter": {
      "company_code": "HYUNDAI",
      "policy_no": ""
    }
  },
  "handler_name": "정지은"
}`;

// ── Build field table rows from grouped structure
function buildFieldRows() {
  const rows = [];
  let alt = false;
  for (const group of fieldGroups) {
    rows.push(groupRow(`▸ ${group.label}`));
    for (const f of group.fields) {
      rows.push(fieldRow(f[0], f[1], f[2], f[3], f[4], alt));
      alt = !alt;
    }
  }
  return rows;
}

// ── Build document
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "1B3A5C" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "2C5F8A" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "34495E" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
        new TextRun({ text: "Self-Disruption ERP  |  API \uC5F0\uB3D9 \uC694\uCCAD\uC11C v1.1", font: "Arial", size: 16, color: "999999" })
      ]})] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "\uBB38\uC11C\uBC88\uD638: SD-API-ACC-001 v1.1  |  ", font: "Arial", size: 16, color: "999999" }),
        new TextRun({ text: "Page ", font: "Arial", size: 16, color: "999999" }),
        new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "999999" }),
      ]})] })
    },
    children: [
      // ── Title
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [
        new TextRun({ text: "\uC0AC\uACE0\uC811\uC218 API \uC5F0\uB3D9 \uC694\uCCAD\uC11C", font: "Arial", size: 44, bold: true, color: "1B3A5C" })
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [
        new TextRun({ text: "Accident Report API Integration Specification", font: "Arial", size: 22, color: "7F8C8D", italics: true })
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [
        new TextRun({ text: "\uBC84\uC804 1.1  |  2026\uB144 2\uC6D4 24\uC77C  |  \uBE44\uACF5\uAC1C", font: "Arial", size: 20, color: "95A5A6" })
      ]}),

      // ── Info table
      new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: [2000, 2680, 2000, 2680],
        rows: [
          new TableRow({ children: [
            dataCell('\uC694\uCCAD\uC0AC', 2000, { bold: true, shaded: true }),
            dataCell('Self-Disruption ((\uC8FC)\uC140\uD504\uB514\uC2A4\uB7FD\uC158)', 2680),
            dataCell('\uC218\uC2E0\uC0AC', 2000, { bold: true, shaded: true }),
            dataCell('\uC2A4\uCE74\uC774\uC624\uD1A0 (\uC0AC\uACE0\uCC98\uB9AC\uAD00\uB9AC)', 2680),
          ]}),
          new TableRow({ children: [
            dataCell('\uB2F4\uB2F9\uC790', 2000, { bold: true, shaded: true }),
            dataCell('\uC11D\uD638\uBBFC', 2680),
            dataCell('\uB2F4\uB2F9\uC790', 2000, { bold: true, shaded: true }),
            dataCell('(\uC2A4\uCE74\uC774\uC624\uD1A0 \uB2F4\uB2F9\uC790\uBA85)', 2680),
          ]}),
          new TableRow({ children: [
            dataCell('\uC5F0\uB77D\uCC98', 2000, { bold: true, shaded: true }),
            dataCell('sukhomin87@gmail.com', 2680),
            dataCell('\uC5F0\uB77D\uCC98', 2000, { bold: true, shaded: true }),
            dataCell('', 2680),
          ]}),
        ]
      }),

      // ── 1. Overview
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("1. \uAC1C\uC694")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun({ text: "\uD604\uC7AC \uC2A4\uCE74\uC774\uC624\uD1A0 \uC0AC\uACE0\uCC98\uB9AC\uAD00\uB9AC \uC2DC\uC2A4\uD15C\uC5D0\uC11C \uC0AC\uACE0 \uC811\uC218 \uB370\uC774\uD130\uAC00 \uBC1C\uC0DD\uD558\uBA74 \uC794\uB514(Jandi) \uBA54\uC2DC\uC9C0\uB85C \uC804\uB2EC\uB418\uACE0, Self-Disruption ERP\uAC00 \uD574\uB2F9 \uBA54\uC2DC\uC9C0\uB97C \uD14D\uC2A4\uD2B8 \uD30C\uC2F1\uD558\uC5EC \uB4F1\uB85D\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4. \uC774 \uBC29\uC2DD\uC740 \uBA54\uC2DC\uC9C0 \uD3EC\uB9F7 \uBCC0\uACBD \uC2DC \uD30C\uC2F1 \uC2E4\uD328 \uC704\uD5D8\uC774 \uC788\uC73C\uBA70, \uB370\uC774\uD130 \uC815\uD655\uC131\uC774 \uBCF4\uC7A5\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", size: 21 })
      ]}),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun({ text: "\uBCF8 \uBB38\uC11C\uB294 \uC2A4\uCE74\uC774\uC624\uD1A0 \uC2DC\uC2A4\uD15C\uC5D0\uC11C Self-Disruption ERP\uB85C ", size: 21 }),
        new TextRun({ text: "\uAD6C\uC870\uD654\uB41C JSON \uB370\uC774\uD130\uB97C \uC9C1\uC811 \uC804\uC1A1", size: 21, bold: true }),
        new TextRun({ text: "\uD558\uB294 API \uC5F0\uB3D9 \uBC29\uC548\uC744 \uC81C\uC548\uD569\uB2C8\uB2E4. JSON \uAD6C\uC870\uB294 ", size: 21 }),
        new TextRun({ text: "\uC911\uCCA9 \uAC1D\uCCB4(Nested Object) \uD615\uC2DD", size: 21, bold: true }),
        new TextRun({ text: "\uC73C\uB85C \uC124\uACC4\uB418\uC5B4 \uB3C4\uBA54\uC778\uBCC4 \uAD6C\uBD84\uC774 \uBA85\uD655\uD569\uB2C8\uB2E4.", size: 21 }),
      ]}),

      // Current vs Proposed flow
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("1.1 \uD604\uC7AC \uD750\uB984 vs \uC81C\uC548 \uD750\uB984")] }),
      new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: [1200, 4080, 4080],
        rows: [
          new TableRow({ children: [
            headerCell('', 1200),
            headerCell('\uD604\uC7AC (\uC794\uB514 \uACBD\uC720)', 4080),
            headerCell('\uC81C\uC548 (API \uC9C1\uC811 \uC5F0\uB3D9)', 4080),
          ]}),
          new TableRow({ children: [
            dataCell('\uD750\uB984', 1200, { bold: true, shaded: true }),
            dataCell('\uC2A4\uCE74\uC774\uC624\uD1A0 \u2192 \uC794\uB514 \uBA54\uC2DC\uC9C0 \u2192 \uD14D\uC2A4\uD2B8 \uD30C\uC2F1 \u2192 ERP DB', 4080),
            dataCell('\uC2A4\uCE74\uC774\uC624\uD1A0 \u2192 API (JSON) \u2192 ERP DB', 4080),
          ]}),
          new TableRow({ children: [
            dataCell('\uB370\uC774\uD130', 1200, { bold: true, shaded: true }),
            dataCell('\uBE44\uAD6C\uC870\uD654 \uD14D\uC2A4\uD2B8 (\uD30C\uC2F1 \uC624\uB958 \uAC00\uB2A5)', 4080, { shaded: true }),
            dataCell('\uAD6C\uC870\uD654 JSON (\uC815\uD655\uD55C \uD544\uB4DC \uB9E4\uD551)', 4080, { shaded: true }),
          ]}),
          new TableRow({ children: [
            dataCell('\uC2E0\uB8B0\uC131', 1200, { bold: true, shaded: true }),
            dataCell('\uD3EC\uB9F7 \uBCC0\uACBD \uC2DC \uC7A5\uC560 \uBC1C\uC0DD', 4080),
            dataCell('\uC2A4\uD0A4\uB9C8 \uACE0\uC815, \uAC80\uC99D \uAC00\uB2A5', 4080),
          ]}),
          new TableRow({ children: [
            dataCell('\uC751\uB2F5', 1200, { bold: true, shaded: true }),
            dataCell('\uC794\uB514 \uBC18\uD658 \uBA54\uC2DC\uC9C0\uB9CC \uAC00\uB2A5', 4080, { shaded: true }),
            dataCell('\uC131\uACF5/\uC2E4\uD328 \uC0C1\uC138 \uC751\uB2F5 + \uC2E4\uC2DC\uAC04 \uC0C1\uD0DC \uD655\uC778 \uAC00\uB2A5', 4080, { shaded: true }),
          ]}),
        ]
      }),

      // ── 2. Endpoint
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("2. API \uC5D4\uB4DC\uD3EC\uC778\uD2B8 \uC815\uBCF4")] }),
      new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: [2400, 6960],
        rows: [
          new TableRow({ children: [
            dataCell('URL', 2400, { bold: true, shaded: true }),
            dataCell('https://hmseok.com/api/webhooks/accident-direct', 6960),
          ]}),
          new TableRow({ children: [
            dataCell('Method', 2400, { bold: true, shaded: true }),
            dataCell('POST', 6960),
          ]}),
          new TableRow({ children: [
            dataCell('Content-Type', 2400, { bold: true, shaded: true }),
            dataCell('application/json; charset=UTF-8', 6960),
          ]}),
          new TableRow({ children: [
            dataCell('\uC778\uC99D', 2400, { bold: true, shaded: true }),
            dataCell('X-API-Key \uD5E4\uB354 (\uBCC4\uB3C4 \uBC1C\uAE09, \uC544\uB798 3\uC808 \uCC38\uC870)', 6960),
          ]}),
          new TableRow({ children: [
            dataCell('\uD638\uCD9C \uC2DC\uC810', 2400, { bold: true, shaded: true }),
            dataCell('\uC0AC\uACE0 \uC811\uC218 \uC644\uB8CC \uC2DC \uC2E4\uC2DC\uAC04 \uD638\uCD9C (1\uAC74\uC529 \uAC1C\uBCC4 \uC804\uC1A1)', 6960),
          ]}),
          new TableRow({ children: [
            dataCell('\uD0C0\uC784\uC544\uC6C3', 2400, { bold: true, shaded: true }),
            dataCell('30\uCD08 (\uC751\uB2F5 \uC5C6\uC73C\uBA74 \uC7AC\uC2DC\uB3C4 \uAD8C\uC7A5)', 6960),
          ]}),
        ]
      }),

      // ── 3. Authentication
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("3. \uC778\uC99D \uBC29\uC2DD")] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun({ text: "\uBAA8\uB4E0 \uC694\uCCAD\uC5D0\uB294 \uBC1C\uAE09\uB41C API Key\uB97C HTTP \uD5E4\uB354\uC5D0 \uD3EC\uD568\uD574\uC57C \uD569\uB2C8\uB2E4. API Key\uB294 \uBCC4\uB3C4 \uD611\uC758 \uD6C4 Self-Disruption \uCE21\uC5D0\uC11C \uBC1C\uAE09\uD569\uB2C8\uB2E4.", size: 21 })
      ]}),
      new Paragraph({ spacing: { after: 100 }, children: [
        new TextRun({ text: "X-API-Key: {api_key_here}", font: "Courier New", size: 20, color: "C0392B" })
      ]}),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun({ text: "\uC778\uC99D \uC2E4\uD328 \uC2DC HTTP 401 Unauthorized\uAC00 \uBC18\uD658\uB429\uB2C8\uB2E4.", size: 21, color: "7F8C8D" })
      ]}),

      // ── 4. Request
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("4. \uC694\uCCAD (Request) \uC2A4\uD399")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.1 \uD544\uB4DC \uC815\uC758 (Nested JSON \uAD6C\uC870)")] }),
      new Paragraph({ spacing: { after: 160 }, children: [
        new TextRun({ text: "JSON \uBCF8\uBB38\uC740 \uB3C4\uBA54\uC778\uBCC4 \uC911\uCCA9 \uAC1D\uCCB4\uB85C \uAD6C\uC131\uB418\uBA70, \uD544\uC218(Y) \uD544\uB4DC \uB204\uB77D \uC2DC 400 Bad Request\uAC00 \uBC18\uD658\uB429\uB2C8\uB2E4. ★ \uD45C\uC2DC \uD544\uB4DC\uB294 \uC544\uB798 \uCF54\uB4DC\uD45C\uC758 \uCF54\uB4DC\uAC12\uC744 \uC0AC\uC6A9\uD569\uB2C8\uB2E4.", size: 21 })
      ]}),

      // Field table with groups
      new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: [COL_NO, COL_FIELD, COL_TYPE, COL_REQ, COL_DESC],
        rows: [
          new TableRow({ children: [
            headerCell('No', COL_NO),
            headerCell('\uD544\uB4DC\uBA85 (JSON path)', COL_FIELD),
            headerCell('\uD0C0\uC785', COL_TYPE),
            headerCell('\uD544\uC218', COL_REQ),
            headerCell('\uC124\uBA85', COL_DESC),
          ]}),
          ...buildFieldRows(),
        ]
      }),

      // ── 4.2 Code Tables
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.2 \uCF54\uB4DC \uC815\uC758\uD45C (★ \uD45C\uC2DC \uD544\uB4DC)")] }),
      new Paragraph({ spacing: { after: 160 }, children: [
        new TextRun({ text: "\uC544\uB798 \uCF54\uB4DC \uAC12\uC740 \uC591\uCE21 \uC2DC\uC2A4\uD15C\uC774 \uACF5\uC720\uD558\uBA70, \uCF54\uB4DC \uAC12(\uC601\uBB38) \uADF8\uB300\uB85C JSON\uC5D0 \uC804\uC1A1\uD569\uB2C8\uB2E4. \uCD94\uAC00/\uBCC0\uACBD \uC2DC \uC591\uCE21 \uD611\uC758 \uD544\uC694.", size: 21 })
      ]}),
      ...codeTables.flatMap(ct => [
        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [
          new TextRun(`\uCF54\uB4DC\uD45C ${ct.id}: ${ct.name}`)
        ]}),
        new Table({
          width: { size: TABLE_WIDTH, type: WidthType.DXA },
          columnWidths: [2200, 2200, 4960],
          rows: [
            new TableRow({ children: [
              headerCell('\uCF54\uB4DC\uAC12', 2200),
              headerCell('\uD55C\uAE00\uBA85', 2200),
              headerCell('\uC124\uBA85', 4960),
            ]}),
            ...ct.codes.map((c, i) => new TableRow({ children: [
              dataCell(c[0], 2200, { center: true, shaded: i % 2 === 1, bold: true, color: '2C5F8A' }),
              dataCell(c[1], 2200, { center: true, shaded: i % 2 === 1 }),
              dataCell(c[2], 4960, { shaded: i % 2 === 1 }),
            ]})),
          ]
        }),
      ]),

      // ── 4.3 Request example
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.3 \uC694\uCCAD \uC608\uC2DC (JSON)")] }),
      ...jsonExample.split('\n').map(line => new Paragraph({ spacing: { after: 0 }, children: [
        new TextRun({ text: line, font: "Courier New", size: 17, color: "2C3E50" })
      ]})),

      // ── 5. Response
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 400 }, children: [new TextRun("5. \uC751\uB2F5 (Response) \uC2A4\uD399")] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.1 \uC131\uACF5 (HTTP 200)")] }),
      ...[
        '{',
        '  "success": true,',
        '  "accident_id": 13,',
        '  "status": "reported",',
        '  "message": "\uC0AC\uACE0 \uC811\uC218 \uC644\uB8CC",',
        '  "timestamp": "2026-02-20T14:45:30+09:00"',
        '}',
      ].map(line => new Paragraph({ spacing: { after: 0 }, children: [
        new TextRun({ text: line, font: "Courier New", size: 18, color: "27AE60" })
      ]})),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.2 \uC2E4\uD328 \uC751\uB2F5 \uCF54\uB4DC")] }),
      new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: [1500, 2000, 5860],
        rows: [
          new TableRow({ children: [
            headerCell('HTTP \uCF54\uB4DC', 1500),
            headerCell('\uC720\uD615', 2000),
            headerCell('\uC124\uBA85', 5860),
          ]}),
          new TableRow({ children: [
            dataCell('400', 1500, { center: true }),
            dataCell('Bad Request', 2000),
            dataCell('\uD544\uC218 \uD544\uB4DC \uB204\uB77D \uB610\uB294 \uB370\uC774\uD130 \uD615\uC2DD \uC624\uB958 (missing_fields \uBC30\uC5F4 \uD3EC\uD568)', 5860),
          ]}),
          new TableRow({ children: [
            dataCell('401', 1500, { center: true, shaded: true }),
            dataCell('Unauthorized', 2000, { shaded: true }),
            dataCell('API Key \uB204\uB77D \uB610\uB294 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC74C', 5860, { shaded: true }),
          ]}),
          new TableRow({ children: [
            dataCell('409', 1500, { center: true }),
            dataCell('Conflict', 2000),
            dataCell('\uB3D9\uC77C \uC811\uC218\uBC88\uD638(receipt_no) \uC911\uBCF5 \uB4F1\uB85D \uC2DC\uB3C4', 5860),
          ]}),
          new TableRow({ children: [
            dataCell('500', 1500, { center: true, shaded: true }),
            dataCell('Server Error', 2000, { shaded: true }),
            dataCell('\uC11C\uBC84 \uB0B4\uBD80 \uC624\uB958 (\uC7AC\uC2DC\uB3C4 \uAD8C\uC7A5)', 5860, { shaded: true }),
          ]}),
        ]
      }),

      // ── 6. Additional
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("6. \uAE30\uB300 \uD6A8\uACFC")] }),
      ...[
        '\uC0AC\uACE0 \uC811\uC218 \uC989\uC2DC \uB2F4\uB2F9\uC790\uC5D0\uAC8C \uD478\uC2DC \uC54C\uB9BC \uBC1C\uC1A1 \uAC00\uB2A5',
        '\uC794\uB514 \uBA54\uC2DC\uC9C0 \uD30C\uC2F1 \uC624\uB958 \uC81C\uB85C \u2192 \uB370\uC774\uD130 \uC815\uD655\uC131 100%',
        'ERP \uC571\uC744 \uD1B5\uD55C \uC0AC\uACE0 \uCC98\uB9AC \uC9C4\uD589 \uC0C1\uD669 \uC2E4\uC2DC\uAC04 \uACF5\uC720',
        '\uC0AC\uACE0 \uC0C1\uD0DC \uBCC0\uACBD \uC2DC \uC591\uBC29\uD5A5 \uB3D9\uAE30\uD654 \uAC00\uB2A5 (Phase 2)',
        '\uBCF4\uD5D8\uC811\uC218\xB7\uC218\uB9AC\uC644\uB8CC\xB7\uBCF4\uD5D8\uAE08 \uC218\uB839 \uB4F1 \uC0C1\uD0DC \uBCC0\uACBD \uC774\uBCA4\uD2B8 \uC5F0\uB3D9 (Phase 2)',
      ].map((text, i) => new Paragraph({ spacing: { after: 80 }, children: [
        new TextRun({ text: `${i + 1}. ${text}`, size: 21 })
      ]})),

      // ── 7. Schedule
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("7. \uC5F0\uB3D9 \uC77C\uC815 (\uC548)")] }),
      new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: [1500, 3930, 3930],
        rows: [
          new TableRow({ children: [
            headerCell('\uB2E8\uACC4', 1500),
            headerCell('\uB0B4\uC6A9', 3930),
            headerCell('\uC608\uC0C1 \uAE30\uAC04', 3930),
          ]}),
          new TableRow({ children: [
            dataCell('1\uB2E8\uACC4', 1500, { center: true, bold: true }),
            dataCell('API Key \uBC1C\uAE09 + \uD14C\uC2A4\uD2B8 \uD658\uACBD \uAD6C\uC131', 3930),
            dataCell('\uD611\uC758 \uD6C4 1\uC8FC\uC77C', 3930),
          ]}),
          new TableRow({ children: [
            dataCell('2\uB2E8\uACC4', 1500, { center: true, bold: true, shaded: true }),
            dataCell('\uC2A4\uCE74\uC774\uC624\uD1A0 \uCE21 \uAC1C\uBC1C (\uC0AC\uACE0\uC811\uC218 \uC2DC API \uD638\uCD9C \uCD94\uAC00)', 3930, { shaded: true }),
            dataCell('2~3\uC8FC', 3930, { shaded: true }),
          ]}),
          new TableRow({ children: [
            dataCell('3\uB2E8\uACC4', 1500, { center: true, bold: true }),
            dataCell('\uC5F0\uB3D9 \uD14C\uC2A4\uD2B8 + \uAC80\uC99D', 3930),
            dataCell('1\uC8FC\uC77C', 3930),
          ]}),
          new TableRow({ children: [
            dataCell('4\uB2E8\uACC4', 1500, { center: true, bold: true, shaded: true }),
            dataCell('\uC6B4\uC601 \uC801\uC6A9 + \uBAA8\uB2C8\uD130\uB9C1', 3930, { shaded: true }),
            dataCell('\uC0C1\uC2DC', 3930, { shaded: true }),
          ]}),
        ]
      }),

      // ── Sign
      new Paragraph({ spacing: { before: 600, after: 200 }, alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "\uBCF8 \uBB38\uC11C\uC5D0 \uB300\uD55C \uBB38\uC758\uC0AC\uD56D\uC740 \uC544\uB798 \uB2F4\uB2F9\uC790\uC5D0\uAC8C \uC5F0\uB77D \uBD80\uD0C1\uB4DC\uB9BD\uB2C8\uB2E4.", size: 21, color: "7F8C8D" })
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "\uC11D\uD638\uBBFC  |  sukhomin87@gmail.com  |  Self-Disruption", size: 21, bold: true, color: "1B3A5C" })
      ]}),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('/sessions/peaceful-busy-ramanujan/mnt/SelfDisruption/사고접수_API_연동_요청서_v1.1.docx', buffer);
  console.log('Document v1.1 created successfully');
});
