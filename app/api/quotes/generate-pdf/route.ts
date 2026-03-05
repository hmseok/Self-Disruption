import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, rgb, PDFPage, PDFFont } from 'pdf-lib'
import { readFileSync } from 'fs'
import { join } from 'path'
import fontkit from '@pdf-lib/fontkit'

// ============================================
// 단기렌트 계약서 PDF — 일반 계약서 양식 기준
// A4: 595.28 x 841.89
// ============================================

const W = 595.28
const H = 841.89
const MARGIN = 30
const COL_MID = 298  // 좌/우 분할

// 색상
const BLACK = rgb(0, 0, 0)
const GRAY = rgb(0.45, 0.45, 0.45)
const NAVY = rgb(0.12, 0.23, 0.37)
const LINE_COLOR = rgb(0.65, 0.65, 0.65)
const HEADER_BG = rgb(0.93, 0.95, 0.97)
const WHITE = rgb(1, 1, 1)

// 보험 고정 데이터
const INS = {
  age: '만 26세 이상',
  self_limit: '3,000만원', self_ded: '50만원',
  personal_limit: '무한', personal_ded: '없음',
  property_limit: '1억 원', property_ded: '없음',
  injury_limit: '1,500만원', death_limit: '1,500만원',
  injury_ded: '없음',
}

type D = { page: PDFPage; font: PDFFont; boldFont: PDFFont }

// top-Y → PDF Y
function Y(top: number) { return H - top }

function hLine(d: D, x1: number, top: number, x2: number, t = 0.5) {
  d.page.drawLine({ start: { x: x1, y: Y(top) }, end: { x: x2, y: Y(top) }, thickness: t, color: LINE_COLOR })
}
function vLine(d: D, x: number, y1: number, y2: number, t = 0.5) {
  d.page.drawLine({ start: { x, y: Y(y1) }, end: { x, y: Y(y2) }, thickness: t, color: LINE_COLOR })
}

function txt(d: D, text: string, x: number, top: number, opts?: { size?: number; bold?: boolean; color?: typeof BLACK; maxW?: number }) {
  if (!text) return
  const sz = opts?.size || 8
  const f = opts?.bold ? d.boldFont : d.font
  const c = opts?.color || BLACK
  let t = text
  if (opts?.maxW) { while (f.widthOfTextAtSize(t, sz) > opts.maxW && t.length > 1) t = t.slice(0, -1) }
  d.page.drawText(t, { x, y: Y(top), size: sz, font: f, color: c })
}

function label(d: D, lb: string, val: string, lx: number, top: number, vx: number, opts?: { size?: number; boldV?: boolean; maxW?: number }) {
  txt(d, lb, lx, top, { size: opts?.size || 7.5, color: GRAY })
  txt(d, val, vx, top, { size: opts?.size || 8, bold: opts?.boldV, maxW: opts?.maxW })
}

function headerCell(d: D, text: string, x: number, top: number, w: number, h: number) {
  d.page.drawRectangle({ x, y: Y(top + h), width: w, height: h, color: HEADER_BG })
  const tw = d.boldFont.widthOfTextAtSize(text, 8)
  txt(d, text, x + (w - tw) / 2, top + h - 5, { size: 8, bold: true, color: NAVY })
}

// ============================================
export async function POST(request: NextRequest) {
  try {
    const b = await request.json()
    const preview = !!b.is_preview  // 미리보기 모드
    const PLACEHOLDER = rgb(0.75, 0.75, 0.75)  // 플레이스홀더 색상
    const pdfDoc = await PDFDocument.create()
    pdfDoc.registerFontkit(fontkit)

    const font = await pdfDoc.embedFont(readFileSync(join(process.cwd(), 'public', 'fonts', 'NanumGothic-Regular.ttf')))
    const boldFont = await pdfDoc.embedFont(readFileSync(join(process.cwd(), 'public', 'fonts', 'NanumGothic-Bold.ttf')))

    // ════════════════════════════════════════
    // PAGE 1
    // ════════════════════════════════════════
    const pg = pdfDoc.addPage([W, H])
    const d: D = { page: pg, font, boldFont }

    const L = MARGIN         // 30
    const R = W - MARGIN     // 565.28
    const M = COL_MID        // 298
    const ROW = 19
    const SEC = 18

    // 미리보기용: 빈 값이면 플레이스홀더 텍스트 표시
    function pv(d: D, placeholder: string, val: string, x: number, top: number, vx: number, opts?: { size?: number; boldV?: boolean; maxW?: number }) {
      if (preview && !val) {
        txt(d, placeholder, vx, top, { size: opts?.size || 7, color: PLACEHOLDER })
      } else if (val) {
        txt(d, val, vx, top, { size: opts?.size || 8, bold: opts?.boldV, maxW: opts?.maxW })
      }
    }

    // ── 헤더 ──
    const co = b.company_name || '주식회사에프엠아이'
    txt(d, co, L + 14, 44, { size: 9, bold: true })
    const title = '차 량 임 대 계 약 서'
    txt(d, title, W / 2 - boldFont.widthOfTextAtSize(title, 13) / 2, 40, { size: 13, bold: true, color: NAVY })
    txt(d, b.company_phone || '01033599559', L + 14, 57, { size: 8 })
    // 담당자/연락처를 회사명/연락처와 같은 Y에 배치
    if (preview && !b.staff_name) {
      txt(d, '담당자:', R - 120, 44, { size: 8 }); txt(d, '(계약 시 자동입력)', R - 82, 44, { size: 7, color: PLACEHOLDER })
      txt(d, '연락처:', R - 120, 57, { size: 8 }); txt(d, '(계약 시 자동입력)', R - 82, 57, { size: 7, color: PLACEHOLDER })
    } else {
      txt(d, `담당자: ${b.staff_name || ''}`, R - 120, 44, { size: 8 })
      txt(d, `연락처: ${b.staff_phone || ''}`, R - 120, 57, { size: 8 })
    }

    // ── 외곽 ──
    const T_TOP = 75
    const T_BOT = 720
    pg.drawRectangle({ x: L, y: Y(T_BOT), width: R - L, height: T_BOT - T_TOP, borderColor: LINE_COLOR, borderWidth: 0.8, color: WHITE })
    vLine(d, M, T_TOP, T_BOT, 0.8)

    let cy = T_TOP
    const PX = L + 140  // 좌측 칼럼 내 분할

    // ═══════════════════════════════════════════
    // (1) 임차인 정보 헤더  |  요금 헤더
    // ═══════════════════════════════════════════
    headerCell(d, '임차인 정보', L, cy, M - L, SEC)
    headerCell(d, '요금', M, cy, R - M, SEC)
    cy += SEC; hLine(d, L, cy, R, 0.8)

    // (1a) 임차인 + 연락처  |  대여시간
    txt(d, '임차인', L + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(임차인명)', b.tenant_name || '', L + 6, cy + 13, L + 45)
    vLine(d, PX, cy, cy + ROW)
    txt(d, '연락처', PX + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(연락처)', b.tenant_phone || '', PX + 6, cy + 13, PX + 40)
    vLine(d, M, cy, cy + ROW)
    txt(d, '대여시간', M + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(대여시간)', b.rental_hours || '', M + 6, cy + 13, M + 50)
    cy += ROW; hLine(d, L, cy, R)

    // (1b) 생년월일  |  총 요금
    txt(d, '생년월일', L + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(생년월일)', b.tenant_birth || '', L + 6, cy + 13, L + 55, { maxW: 150 })
    vLine(d, M, cy, cy + ROW)
    txt(d, '총 요금', M + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(총 요금)', b.total_fee || '', M + 6, cy + 13, M + 45, { size: 10, boldV: true })
    cy += ROW; hLine(d, L, cy, R)

    // (1c) 주소 (좌, 2행)  |  보험가입 헤더 + 보험가입연령
    const insBlockH = SEC + ROW  // 헤더18 + 가입연령행19 = 37
    txt(d, '주소', L + 6, cy + 11, { size: 7.5, color: GRAY })
    const addr = b.tenant_address || ''
    if (preview && !addr) {
      txt(d, '(주소)', L + 30, cy + 13, { size: 7, color: PLACEHOLDER })
    } else if (addr.length > 30) {
      txt(d, addr.slice(0, 30), L + 30, cy + 11, { size: 7 })
      txt(d, addr.slice(30, 65), L + 30, cy + 22, { size: 7 })
    } else {
      txt(d, addr, L + 30, cy + 13, { size: 7.5 })
    }
    vLine(d, M, cy, cy + insBlockH)
    // 우측: 보험 헤더
    headerCell(d, '보험가입 및 차량손해 면책 제도', M, cy, R - M, SEC)
    hLine(d, M, cy + SEC, R, 0.8)
    // 우측: 보험 가입 연령 (ROW 높이 통일)
    label(d, '보험 가입 연령', INS.age, M + 6, cy + SEC + 13, M + 78)
    cy += insBlockH; hLine(d, L, cy, R)

    // 좌측 주소 영역이 insBlockH보다 짧으면 운전면허 행으로 넘어감
    // (1d) 운전면허번호 + 면허취득일  |  자차 한도 + 자차 면책금
    const IC2 = M + 140  // 보험 우측 칼럼
    txt(d, '운전면허번호', L + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(면허번호)', b.license_number || '', L + 6, cy + 13, L + 70, { maxW: 90 })
    vLine(d, PX, cy, cy + ROW)
    txt(d, '면허 취득일', PX + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(취득일)', '', PX + 6, cy + 13, PX + 60)
    vLine(d, M, cy, cy + ROW)
    label(d, '자차 한도', INS.self_limit, M + 6, cy + 13, M + 55)
    vLine(d, IC2, cy, cy + ROW)
    label(d, '자차 면책금', INS.self_ded, IC2 + 6, cy + 13, IC2 + 60)
    cy += ROW; hLine(d, L, cy, R)

    // (1e) 면허구분 + 만기일  |  대인 한도 + 대인 면책금
    txt(d, '면허구분', L + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(면허구분)', b.license_type || '', L + 6, cy + 13, L + 55)
    vLine(d, PX, cy, cy + ROW)
    txt(d, '만기일', PX + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(만기일)', '', PX + 6, cy + 13, PX + 40)
    vLine(d, M, cy, cy + ROW)
    label(d, '대인 한도', INS.personal_limit, M + 6, cy + 13, M + 55)
    vLine(d, IC2, cy, cy + ROW)
    label(d, '대인 면책금(인당)', INS.personal_ded, IC2 + 6, cy + 13, IC2 + 80)
    cy += ROW; hLine(d, L, cy, R, 0.8)

    // ═══════════════════════════════════════════
    // (2) 제2운전자 정보  |  대물 한도
    // ═══════════════════════════════════════════
    headerCell(d, '제2운전자 정보', L, cy, M - L, SEC)
    // 우측: 대물 한도 row
    vLine(d, M, cy, cy + SEC)
    label(d, '대물 한도', INS.property_limit, M + 6, cy + 13, M + 55)
    vLine(d, IC2, cy, cy + SEC)
    label(d, '대물 면책금(건당)', INS.property_ded, IC2 + 6, cy + 13, IC2 + 80)
    cy += SEC; hLine(d, L, cy, R, 0.8)

    // (2a) 제2운전자 + 연락처  |  자손 한도(부상) + 자손 한도(사망)
    label(d, '제2운전자', '', L + 6, cy + 13, L + 55)
    vLine(d, PX, cy, cy + ROW)
    label(d, '연락처', '', PX + 6, cy + 13, PX + 40)
    vLine(d, M, cy, cy + ROW)
    label(d, '자손 한도(부상)', INS.injury_limit, M + 6, cy + 13, M + 78)
    vLine(d, IC2, cy, cy + ROW)
    label(d, '자손 한도(사망)', INS.death_limit, IC2 + 6, cy + 13, IC2 + 78)
    cy += ROW; hLine(d, L, cy, R)

    // (2b) 생년월일  |  자손 면책금
    label(d, '생년월일', '', L + 6, cy + 13, L + 55)
    vLine(d, M, cy, cy + ROW)
    label(d, '자손 면책금', INS.injury_ded, M + 6, cy + 13, M + 60)
    cy += ROW; hLine(d, L, cy, R)

    // (2c) 주소  |  면책 안내문 (여러줄, 높이 확장)
    const notice_H = 57
    label(d, '주소', '', L + 6, cy + 13, L + 30)
    vLine(d, M, cy, cy + notice_H)
    const nLines = [
      '*자기차량 손해의 경우, 고객귀책사유로 인한 사고는 면책금 (50)만원, 대인',
      '(-)만원 / 대물 (-)만원 휴차손해료(1일 대여요금의 50%)는 각각 별도',
      '지불하여야 합니다. 보험가입 현황 및 차량손해 면책제도에 관하여 설명을',
      '들었으며, 차량손해 면책제도 가입에 동의함.',
    ]
    nLines.forEach((ln, i) => txt(d, ln, M + 6, cy + 10 + (i * 12), { size: 6.5, color: GRAY }))
    hLine(d, L, cy + ROW, M)  // 주소와 운전면허 구분선

    // (2d) 운전면허번호 + 면허취득일  (notice 영역 진행 중)
    label(d, '운전면허번호', '', L + 6, cy + ROW + 13, L + 70)
    vLine(d, PX, cy + ROW, cy + ROW * 2)
    label(d, '면허 취득일', '', PX + 6, cy + ROW + 13, PX + 60)
    hLine(d, L, cy + ROW * 2, M)

    // (2e) 면허구분 + 만기일
    label(d, '면허구분', '', L + 6, cy + ROW * 2 + 13, L + 55)
    vLine(d, PX, cy + ROW * 2, cy + notice_H)
    label(d, '만기일', '', PX + 6, cy + ROW * 2 + 13, PX + 40)
    cy += notice_H; hLine(d, L, cy, R, 0.8)

    // ═══════════════════════════════════════════
    // (3) 대차 정보 — 좌측 전체 너비
    // ═══════════════════════════════════════════
    headerCell(d, '대차 정보', L, cy, M - L, SEC)
    cy += SEC; hLine(d, L, cy, M, 0.8)

    // 차종
    txt(d, '차종', L + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(차종)', b.rental_car || '', L + 6, cy + 13, L + 45, { maxW: 220 })
    cy += ROW; hLine(d, L, cy, M)

    // 차량번호 + 유종
    txt(d, '차량번호', L + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(차량번호)', b.rental_plate || '', L + 6, cy + 13, L + 55)
    vLine(d, PX, cy, cy + ROW)
    txt(d, '유종', PX + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(유종)', b.fuel_type || '', PX + 6, cy + 13, PX + 30)
    cy += ROW; hLine(d, L, cy, M)

    // 대여일시
    txt(d, '대여일시', L + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(대여일시)', b.rental_start || '', L + 6, cy + 13, L + 55, { maxW: 200 })
    cy += ROW; hLine(d, L, cy, M)

    // 반납예정일
    txt(d, '반납예정일', L + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(반납예정일)', b.return_datetime || '', L + 6, cy + 13, L + 60, { maxW: 200 })
    cy += ROW; hLine(d, L, cy, M)

    // 배차 유류량 + 반납 유류량
    txt(d, '배차 유류량', L + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(배차유류)', b.fuel_out || '', L + 6, cy + 13, L + 60)
    vLine(d, PX, cy, cy + ROW)
    txt(d, '반납 유류량', PX + 6, cy + 13, { size: 7.5, color: GRAY })
    pv(d, '(반납유류)', b.fuel_in || '', PX + 6, cy + 13, PX + 60)
    cy += ROW; hLine(d, L, cy, M)

    // 배차 시 km + 반납 시 km
    label(d, '배차 시 km', '-', L + 6, cy + 13, L + 60)
    vLine(d, PX, cy, cy + ROW)
    label(d, '반납 시 km', '-', PX + 6, cy + 13, PX + 60)
    cy += ROW; hLine(d, L, cy, R, 0.8)

    // ═══════════════════════════════════════════
    // (4) 기타 계약사항 — 전체 너비
    // ═══════════════════════════════════════════
    headerCell(d, '기타 계약사항', L, cy, R - L, SEC)
    cy += SEC; hLine(d, L, cy, R, 0.8)

    // 메모
    const memo = b.memo || ''
    memo.split('\n').slice(0, 10).forEach((line: string, i: number) => {
      txt(d, line, L + 10, cy + 4 + (i * 13), { size: 8 })
    })

    // ═══════════════════════════════════════════
    // (5) 서명란
    // ═══════════════════════════════════════════
    const SY = 730
    hLine(d, L, SY, R, 0.8)
    // 임대인 (좌)
    txt(d, '임대인', L + (M - L) / 2 - 15, SY + 14, { size: 9, bold: true, color: NAVY })
    const rep = b.representative || '대표 박진숙'
    txt(d, `${co}  ${rep}`, L + 10, SY + 34, { size: 8 })
    const compAddr = b.company_address || '경기 연천군 왕징면 백동로236번길 190 3동1호'
    txt(d, compAddr, L + 10, SY + 46, { size: 7, color: GRAY })

    // 회사 도장 이미지 삽입
    if (b.company_stamp) {
      try {
        const stampData = b.company_stamp as string
        let stampImage
        if (stampData.includes('image/png')) {
          const base64 = stampData.split(',')[1]
          stampImage = await pdfDoc.embedPng(Buffer.from(base64, 'base64'))
        } else {
          const base64 = stampData.split(',')[1]
          stampImage = await pdfDoc.embedJpg(Buffer.from(base64, 'base64'))
        }
        const stampSize = 45
        const stampX = M - stampSize - 15  // 임대인 칸 우측
        const stampY = Y(SY + 55)          // 서명란 하단쪽
        pg.drawImage(stampImage, { x: stampX, y: stampY, width: stampSize, height: stampSize })
      } catch (e) {
        // 도장 이미지 삽입 실패 시 무시하고 계속
        console.error('도장 이미지 삽입 실패:', e)
      }
    }
    // 임차인 (우)
    txt(d, '임차인', M + (R - M) / 2 - 15, SY + 14, { size: 9, bold: true, color: NAVY })
    txt(d, `임차인:  ${b.tenant_name || ''}`, M + 10, SY + 34, { size: 8 })
    txt(d, '서명 또는 (인)', R - 60, SY + 34, { size: 7, color: GRAY })

    txt(d, '뒷면에 약관이 있으니 확인해주세요.', L, H - 35, { size: 7, color: GRAY })
    txt(d, '1/2', R - 15, H - 35, { size: 7, color: GRAY })

    // ════════════════════════════════════════
    // PAGE 2: 약관
    // ════════════════════════════════════════
    const p2 = pdfDoc.addPage([W, H])
    const d2: D = { page: p2, font, boldFont }

    const sections = [
      { t: '대여약관 및 주요 고지사항에 대한 동의', p: [
        '1. 차량 임차기간 동안 발생한 유류비 및 주정차 위반과 교통법규 위반 등으로 인한 과태료와 범칙금 등은 임차인 부담입니다.',
        '2. 차량 임차 중 사고 발생 시, 약관에 따라 자동차보험 및 자차손해면책제도의 범위 내 손해를 보상받을 수 있습니다.',
        '3. 차량 임차 중 자차 사고 발생 시 해당 면책금과 휴차 보상료(대여요금의 50%)는 임차인 부담입니다.',
        '4. 전자계약서 이용 시 서비스 제공(ex.전자계약서)과 함께 서비스 운영과 관련한 각종 정보와 광고를 웹페이지 또는 모바일 애플리케이션 등에 게재할 수 있습니다.',
        '5. 그 외 계약조건은 자동차대여 표준약관에 따릅니다.',
      ]},
      { t: '개인위치정보 조회 및 이용 동의', p: [
        '당사의 차량에는 위치정보를 수집할 수 있는 장치가 부착되어 있으며 도난, 분실, 반납지연의 상황 발생 시 차량 회수를 목적으로 위치정보를 수집, 이용, 제공할 수 있습니다.',
      ]},
      { t: '개인정보 수집 및 이용 동의', p: [
        '당사는 이용자(임차인 및 운전자)에 대하여 대여 계약에 필요한 개인정보, 서비스 제공을 위한 개인정보 등 필수 사항을 차량 임대차계약서를 통해 수집하고 렌터카 예약/사용/반납 서비스 제공을 위해 이용하고 있습니다.',
        '렌터카 예약/사용/반납 서비스 제공이 종료된 이후에는 수집된 개인정보를 원칙적으로 파기합니다. 단, 법령의 규정에 의하여 보존할 필요성이 있는 경우에는 해당 법령에 따르며, 미반환 차량 회수, 이용요금 정산, 교통법규 위반으로 인한 사후처리, 민/형사상 분쟁의 소지가 있을 경우 확인하기 위해서 다음의 정보는 5년간 보존합니다.',
        'a. 보존항목 : 이름, 전화번호, 주소, 휴대전화번호, 생년월일, 운전면허 정보, 차량번호',
        'b. 보존근거 : 미반환 차량 회수, 이용요금 정산, 주정차 및 교통법규 위반으로 인한 과태료와 범칙금 부과 및 향후 분쟁의 소지가 있을 경우에 이를 확인하기 위함.',
        'c. 보존기간 : 5년',
      ]},
      { t: '제3자 정보제공 및 조회 동의', p: [
        '1. 차량 임대차계약과 관련하여 당사가 이용자(임차인 및 운전자)로부터 취득한 개인정보는 해당 보험사 및 아이엠에스모빌리티(주)에 제공되어 차량 임대차계약 관리 및 교통사고 보상서비스에 사용됩니다.',
        '당사는 법령에 근거가 있거나 정부의 관련 지침, 지시 등 예외적인 경우를 제외하고는 이용자(임차인 및 운전자)의 개인정보를 원칙적으로 외부 또는 제3자에게 제공하지 않습니다.',
        '2. 당사는 이용자(임차인 및 운전자)에게 동의를 받은 경우에만 원활한 서비스 제공을 위해 아래와 같이 제3자에게 개인정보를 제공합니다.',
      ]},
    ]

    let ty = 35
    for (const s of sections) {
      txt(d2, s.t, MARGIN, ty, { size: 8, bold: true, color: NAVY })
      ty += 14
      for (const line of s.p) {
        const maxC = 82
        let st = 0
        while (st < line.length) {
          txt(d2, line.slice(st, st + maxC), MARGIN + 5, ty, { size: 6.5 })
          ty += 10; st += maxC
        }
        ty += 2
      }
      ty += 8
    }

    // 제3자 테이블
    const tH = ['제공 받는자', '이용목적', '제공정보', '보유 및 이용기간']
    const cW = [130, 170, 130, 100]
    let tx = MARGIN + 5
    for (let i = 0; i < tH.length; i++) {
      p2.drawRectangle({ x: tx, y: Y(ty + 14), width: cW[i], height: 14, color: HEADER_BG })
      txt(d2, tH[i], tx + 4, ty + 10, { size: 6.5, bold: true })
      tx += cW[i]
    }

    const tRows = [
      ['보험사 및 공제조합', '교통사고 보상서비스를 위한\n접수 및 청구', '이름, 생년월일, 주소,\n휴대전화번호, 전화번호,\n운전면허정보, 차량번호', '계약일로부터\n5년'],
      ['아이엠에스모빌리티(주)', '렌터카 ERP 운영 및 전산관리,\n전자계약서 작성, 부정 계약\n방지 및 관리, 알림톡 발송 등', '이름, 생년월일, 주소,\n휴대전화번호, 전화번호,\n운전면허정보', '계약일로부터\n5년'],
      ['정부 및 공공기관,\n지방자치단체', '손해배상청구와 유사피해 방지,\n범칙금, 과태료 부과 시\n명의변경 신청', '이름, 생년월일, 주소,\n휴대전화번호, 전화번호,\n운전면허정보', '계약일로부터\n5년'],
      ['국토교통부', '운전자격확인시스템\n(대여사업자 운전자격확인 의무)', '차량번호,\n대여기간정보', '대여사업자 계정\n탈퇴 요청 시까지'],
      ['국토교통부, 경찰청,\n도로교통공단', '운전자격확인시스템\n(대여사업자 운전자격확인 의무)', '이름,\n운전면허정보', '저장하지 않음'],
      ['주식회사 오토업컴퍼니', '차량 연식 조회', '차량번호', '저장하지 않음'],
      ['(주)카카오모빌리티', '카카오모빌리티 앱에서 렌터카\n대여 서비스 이용 시\n예약/사용/반납 서비스 제공', '전자계약서', '계약일로부터\n5년'],
      ['DB손해보험,\n티피에이코리아(주)', '프리미엄케어 상품 가입 시 계약\n당사자 신원 확인, 서비스 제공 등', '이름,\n휴대전화번호,\n전자계약서', '차량 반납\n기준 최대 3개월'],
    ]

    let ry = ty + 14
    for (const row of tRows) {
      const lc = Math.max(...row.map(c => c.split('\n').length))
      const rh = lc * 10 + 4
      tx = MARGIN + 5
      for (let c = 0; c < row.length; c++) {
        p2.drawRectangle({ x: tx, y: Y(ry + rh), width: cW[c], height: rh, borderColor: LINE_COLOR, borderWidth: 0.3, color: WHITE })
        row[c].split('\n').forEach((cl, li) => txt(d2, cl, tx + 3, ry + 9 + (li * 10), { size: 5.5 }))
        tx += cW[c]
      }
      ry += rh
    }

    ry += 15
    txt(d2, '상기 내용을 확인하고 동의하는 바 아래와 같이 서명합니다.', MARGIN, ry, { size: 7.5, bold: true })
    ry += 20
    txt(d2, '서명 또는 (인)', R - 80, ry, { size: 8, color: GRAY })
    txt(d2, '2/2', R - 15, H - 35, { size: 7, color: GRAY })

    // ════════════════════════════════════════
    const pdfBytes = await pdfDoc.save()
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="contract-${b.quote_id || 'draft'}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('PDF generation error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
