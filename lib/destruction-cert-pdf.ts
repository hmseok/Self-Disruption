/**
 * lib/destruction-cert-pdf.ts
 *
 * 파기확인서 PDF 생성 (서버측, pdf-lib + 나눔고딕 한글 임베드).
 *
 * 매뉴얼 통합본 5.17 제11조 (개인정보 파기) 기준 자동 발급.
 *
 * 사용:
 *   const { pdfBuffer, fileName } = await buildDestructionCertPdf({...})
 *   const url = await uploadToGCS(filePath, pdfBuffer, 'application/pdf')
 */

import { PDFDocument, PDFFont, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export interface DestructionCertItem {
  data_type: 'CONTRACT' | 'FILE'
  custname: string | null
  carsnums: string | null
  carsodnm: string | null
  imagkind_label: string | null
  imagonam: string | null
}

export interface DestructionCertData {
  // 결재 메타
  approval_id: number
  approval_doc_id: string | null     // 외부 결재 문서 번호
  request_at: string | null          // 폐기예정일
  request_by: string | null          // 담당자
  approval_request_at: string | null
  reviewed_at: string | null
  confirmed_at: string | null
  // 결재 라인
  reviewer_name?: string | null      // 책임자 이름 (검토자)
  confirmer_name?: string | null     // 책임자 이름 (확인자)
  // 폐기 통계
  total_count: number
  contract_count: number
  file_count: number
  // 폐기 항목 샘플 (상위 N개)
  sample_items: DestructionCertItem[]
  // 회사
  company_name?: string              // 기본: 라이드 주식회사
  // 데이터 출처
  data_source?: string               // 기본: 메리츠 캐피탈
  // 발급 메타
  issued_at: string                  // ISO
  issued_by?: string                 // 발급자 ID/이름
}

// ── 한글 폰트 로드 (캐시) ────────────────────────────────────────
let _fontRegular: Uint8Array | null = null
let _fontBold: Uint8Array | null = null

async function loadFonts(): Promise<{ regular: Uint8Array; bold: Uint8Array }> {
  if (!_fontRegular) {
    const p = path.join(process.cwd(), 'public', 'fonts', 'NanumGothic-Regular.ttf')
    _fontRegular = await readFile(p)
  }
  if (!_fontBold) {
    const p = path.join(process.cwd(), 'public', 'fonts', 'NanumGothic-Bold.ttf')
    _fontBold = await readFile(p)
  }
  return { regular: _fontRegular, bold: _fontBold }
}

// ── 헬퍼 ──────────────────────────────────────────────────────
function fmt(s: string | null | undefined, fallback = '—'): string {
  if (!s) return fallback
  return s.replace('T', ' ').slice(0, 19)
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return s.slice(0, 10)
}

// ── 메인 ──────────────────────────────────────────────────────
export async function buildDestructionCertPdf(data: DestructionCertData): Promise<{
  pdfBuffer: Buffer
  fileName: string
}> {
  const fonts = await loadFonts()

  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const fontR = await pdf.embedFont(fonts.regular)
  const fontB = await pdf.embedFont(fonts.bold)

  const A4_W = 595.28
  const A4_H = 841.89
  const margin = 50
  const contentW = A4_W - margin * 2

  const page = pdf.addPage([A4_W, A4_H])

  // 색상
  const cBlack = rgb(0.07, 0.09, 0.16)
  const cMuted = rgb(0.39, 0.45, 0.54)
  const cPrimary = rgb(0.23, 0.43, 0.71)
  const cBorder = rgb(0.86, 0.88, 0.91)
  const cBgBlue = rgb(0.94, 0.96, 0.99)

  let y = A4_H - margin

  // ─── 헤더 (제목) ─────────────────────────────────────────────
  const title = '개인정보 파기 확인서'
  const titleSize = 24
  const titleW = fontB.widthOfTextAtSize(title, titleSize)
  page.drawText(title, {
    x: (A4_W - titleW) / 2, y: y - titleSize,
    size: titleSize, font: fontB, color: cBlack,
  })
  y -= titleSize + 8

  const subtitle = `${data.company_name || '라이드 주식회사'} · 정보보안`
  const subSize = 11
  const subW = fontR.widthOfTextAtSize(subtitle, subSize)
  page.drawText(subtitle, {
    x: (A4_W - subW) / 2, y: y - subSize,
    size: subSize, font: fontR, color: cMuted,
  })
  y -= subSize + 24

  // 가로선
  page.drawLine({
    start: { x: margin, y }, end: { x: A4_W - margin, y },
    thickness: 1.5, color: cPrimary,
  })
  y -= 20

  // ─── 결재 메타 정보 박스 ─────────────────────────────────────
  const metaRows: Array<[string, string]> = [
    ['결재 번호',   `#${data.approval_id}`],
    ['결재 문서',   data.approval_doc_id || '—'],
    ['폐기예정일',  fmtDate(data.request_at)],
    ['결재 상신일', fmtDate(data.approval_request_at)],
    ['검토일',      fmtDate(data.reviewed_at)],
    ['최종 확인일', fmtDate(data.confirmed_at || data.issued_at)],
  ]

  // 박스 배경
  const metaBoxH = metaRows.length * 18 + 16
  page.drawRectangle({
    x: margin, y: y - metaBoxH, width: contentW, height: metaBoxH,
    color: cBgBlue, borderColor: cBorder, borderWidth: 0.5,
  })
  let metaY = y - 12
  for (const [k, v] of metaRows) {
    page.drawText(k, { x: margin + 16, y: metaY - 12, size: 10, font: fontB, color: cMuted })
    page.drawText(v, { x: margin + 130, y: metaY - 12, size: 11, font: fontR, color: cBlack })
    metaY -= 18
  }
  y -= metaBoxH + 18

  // ─── 결재 라인 (3 단계 — 매뉴얼 통합본 5.17 제6조) ───────────
  page.drawText('결재 라인 (개인정보보호 내부관리계획서 제6조)', {
    x: margin, y: y - 12,
    size: 12, font: fontB, color: cBlack,
  })
  y -= 22

  // 사용자 결정 (2026-05-29) — 결재 일자 「2026-05-28」 고정 박기
  const t0930 = '2026-05-28 09:30:00'
  const t1100 = '2026-05-28 11:00:00'
  const t1430 = '2026-05-28 14:30:00'

  const lineRows: Array<[string, string, string, string, string]> = [
    ['1단계', '담당자',  '양재희 부장', '라이드케어 정보보안 담당자',           fmtDate(t0930)],
    ['2단계', '관리자',  '석호민 부장', '라이드케어 개인정보보호 담당자',       fmtDate(t1100)],
    ['3단계', '책임자',  '임성민 이사', '라이드케어 개인정보보호 책임자 (CPO)', fmtDate(t1430)],
  ]

  const lineBoxH = lineRows.length * 28 + 12
  page.drawRectangle({
    x: margin, y: y - lineBoxH, width: contentW, height: lineBoxH,
    borderColor: cBorder, borderWidth: 0.5,
  })
  let lineY = y - 8
  for (const [step, role, person, title, when] of lineRows) {
    page.drawText(step,   { x: margin + 12,  y: lineY - 12, size: 10, font: fontB, color: cPrimary })
    page.drawText(role,   { x: margin + 60,  y: lineY - 12, size: 10, font: fontB, color: cBlack })
    page.drawText(person, { x: margin + 130, y: lineY - 12, size: 12, font: fontB, color: cBlack })
    page.drawText(title,  { x: margin + 130, y: lineY - 24, size: 9,  font: fontR, color: cMuted })
    page.drawText(when,   { x: A4_W - margin - 100, y: lineY - 14, size: 10, font: fontR, color: cMuted })
    lineY -= 28
  }
  y -= lineBoxH + 24

  // ─── 폐기 통계 ──────────────────────────────────────────────
  page.drawText('폐기 대상 (메리츠 캐피탈 위탁자료)', {
    x: margin, y: y - 12,
    size: 12, font: fontB, color: cBlack,
  })
  y -= 22

  const statText = `총 ${data.total_count.toLocaleString()}건  ·  계약 ${data.contract_count.toLocaleString()}건  ·  파일 ${data.file_count.toLocaleString()}건`
  page.drawRectangle({
    x: margin, y: y - 32, width: contentW, height: 32,
    color: cBgBlue, borderColor: cBorder, borderWidth: 0.5,
  })
  page.drawText(statText, {
    x: margin + 16, y: y - 22,
    size: 13, font: fontB, color: cPrimary,
  })
  y -= 32 + 14

  // ─── 폐기 항목 샘플 (상위 N개) ───────────────────────────────
  if (data.sample_items.length > 0) {
    page.drawText(`항목 상세 (상위 ${data.sample_items.length}건)`, {
      x: margin, y: y - 12,
      size: 11, font: fontB, color: cMuted,
    })
    y -= 18

    // 헤더
    const headers = ['구분', '거래처', '차량/파일', '식별']
    const colX = [margin + 8, margin + 60, margin + 200, A4_W - margin - 120]
    page.drawLine({ start: { x: margin, y }, end: { x: A4_W - margin, y }, thickness: 0.5, color: cBorder })
    for (let i = 0; i < headers.length; i++) {
      page.drawText(headers[i], { x: colX[i], y: y - 12, size: 9, font: fontB, color: cMuted })
    }
    y -= 16
    page.drawLine({ start: { x: margin, y }, end: { x: A4_W - margin, y }, thickness: 0.5, color: cBorder })
    y -= 4

    const maxRows = Math.min(data.sample_items.length, 12)
    for (let i = 0; i < maxRows; i++) {
      const it = data.sample_items[i]
      const typeLabel = it.data_type === 'CONTRACT' ? '계약' : '파일'
      const subject = it.data_type === 'CONTRACT'
        ? `${it.carsnums || '—'} ${it.carsodnm || ''}`
        : `${it.imagkind_label || ''} ${it.imagonam || ''}`
      const cust = it.custname || '—'

      page.drawText(typeLabel, { x: colX[0], y: y - 10, size: 9, font: fontR, color: cBlack })
      page.drawText(cust.slice(0, 14),    { x: colX[1], y: y - 10, size: 9, font: fontR, color: cBlack })
      page.drawText(subject.slice(0, 28), { x: colX[2], y: y - 10, size: 9, font: fontR, color: cBlack })
      // 식별 컬럼은 생략 (data_id) — 공간 부족
      y -= 14
    }
    if (data.total_count > maxRows) {
      y -= 4
      page.drawText(`… 외 ${(data.total_count - maxRows).toLocaleString()}건 동시 파기`, {
        x: margin + 8, y: y - 10, size: 9, font: fontR, color: cMuted,
      })
      y -= 14
    }
    y -= 10
  }

  // ─── 근거 + 서명 ────────────────────────────────────────────
  y -= 8
  page.drawLine({ start: { x: margin, y }, end: { x: A4_W - margin, y }, thickness: 0.5, color: cBorder })
  y -= 18

  page.drawText('근거 규정', { x: margin, y: y - 12, size: 10, font: fontB, color: cMuted })
  page.drawText('「개인정보보호 내부관리계획서」 제11조 (개인정보 파기)', {
    x: margin + 80, y: y - 12, size: 10, font: fontR, color: cBlack,
  })
  y -= 18

  page.drawText('데이터 출처', { x: margin, y: y - 12, size: 10, font: fontB, color: cMuted })
  page.drawText(data.data_source || '메리츠 캐피탈 (위탁자료)', {
    x: margin + 80, y: y - 12, size: 10, font: fontR, color: cBlack,
  })
  y -= 36

  // 발급 정보 (우측 서명란)
  const issuedDate = fmtDate(data.issued_at)
  const signTitle = `발급일: ${issuedDate}`
  page.drawText(signTitle, {
    x: A4_W - margin - 220, y: y - 12,
    size: 11, font: fontR, color: cBlack,
  })
  y -= 18

  page.drawText(`${data.company_name || '라이드 주식회사'}`, {
    x: A4_W - margin - 220, y: y - 12,
    size: 11, font: fontB, color: cBlack,
  })
  y -= 16

  page.drawText('개인정보보호 책임자', {
    x: A4_W - margin - 220, y: y - 12,
    size: 10, font: fontR, color: cMuted,
  })
  y -= 16

  if (data.confirmer_name || data.reviewer_name) {
    page.drawText(`${data.confirmer_name || data.reviewer_name}  (인)`, {
      x: A4_W - margin - 220, y: y - 12,
      size: 12, font: fontB, color: cBlack,
    })
    y -= 16
  } else {
    page.drawText('________________  (인)', {
      x: A4_W - margin - 220, y: y - 12,
      size: 11, font: fontR, color: cMuted,
    })
    y -= 16
  }

  // 푸터 (페이지 하단)
  const footer = `본 확인서는 ${data.company_name || '라이드 주식회사'} 「개인정보보호 내부관리계획서」 제11조에 의거 자동 발급되었습니다.`
  page.drawText(footer, {
    x: margin, y: margin - 20,
    size: 8, font: fontR, color: cMuted,
  })

  const bytes = await pdf.save()
  const fileName = `destruction-cert-approval-${data.approval_id}-${issuedDate.replace(/-/g, '')}.pdf`

  return { pdfBuffer: Buffer.from(bytes), fileName }
}
