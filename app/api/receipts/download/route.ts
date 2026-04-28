import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import * as path from 'path'
import * as fs from 'fs'
import ExcelJS from 'exceljs'

// ============================================================
// 영수증 월별 엑셀 다운로드 — ExcelJS 기반
//   양식: public/templates/expense_report_template.xlsx
//   대상 시트: "법인 지출내역서"
//     A2 = "(  N  )월 지출 합계 내역"
//     G2 = SUM (총합계)
//     5행~ : 데이터
//       A=날짜  B=카드번호  C=구분  D=사용처  E=품명  F=고객명/팀원  G=금액  H=영수증
// ============================================================

function toNum(v: any): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') return parseInt(v.replace(/[^0-9-]/g, ''), 10) || 0
  if (typeof v === 'object') return Number(String(v)) || 0
  return Number(v) || 0
}

function fmtDate(d: any): string {
  if (!d) return ''
  if (d instanceof Date) return d.toISOString().slice(0, 10)
  return String(d).slice(0, 10)
}

function findTemplatePath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'public', 'templates', 'expense_report_template.xlsx'),
    path.join(process.cwd(), '.next', 'standalone', 'public', 'templates', 'expense_report_template.xlsx'),
    path.join(process.cwd(), '..', 'public', 'templates', 'expense_report_template.xlsx'),
  ]
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p } catch { /* skip */ }
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const month = request.nextUrl.searchParams.get('month')
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month 파라미터(YYYY-MM) 필요' }, { status: 400 })
    }
    const monthNum = parseInt(month.split('-')[1])

    // 데이터 조회
    const start = `${month}-01`
    const endDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0)
    const end = `${month}-${String(endDate.getDate()).padStart(2, '0')}`
    const items = await prisma.$queryRaw<any[]>`
      SELECT * FROM expense_receipts
      WHERE user_id = ${user.id}
      AND expense_date >= ${start}
      AND expense_date <= ${end}
      ORDER BY expense_date ASC
    `

    // 템플릿 로드
    const templatePath = findTemplatePath()
    if (!templatePath) {
      return NextResponse.json(
        { error: `템플릿 파일을 찾을 수 없습니다 (cwd=${process.cwd()})` },
        { status: 500 },
      )
    }

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(templatePath)
    const ws = wb.getWorksheet('법인 지출내역서')
    if (!ws) {
      return NextResponse.json(
        { error: '템플릿에 "법인 지출내역서" 시트가 없습니다' },
        { status: 500 },
      )
    }

    // A2: 월 표시 (머지 영역이라 셀 자체에 값만 셋)
    ws.getCell('A2').value = `(  ${monthNum}  )월 지출 합계 내역`

    // 5행~ : 기존 데이터(예시) 제거 후 새로 입력
    //   템플릿엔 2월 예시 데이터가 있을 수 있으므로 5~41행 클리어
    const DATA_START_ROW = 5
    const DATA_END_ROW = Math.max(41, DATA_START_ROW + items.length + 5)
    for (let r = DATA_START_ROW; r <= DATA_END_ROW; r++) {
      for (let c = 1; c <= 8; c++) {
        const cell = ws.getCell(r, c)
        cell.value = null
      }
    }

    // 데이터 입력
    items.forEach((it, idx) => {
      const r = DATA_START_ROW + idx
      ws.getCell(r, 1).value = it.expense_date instanceof Date ? it.expense_date : (fmtDate(it.expense_date) || null)
      if (ws.getCell(r, 1).value && typeof ws.getCell(r, 1).value === 'string') {
        // YYYY-MM-DD 문자열을 Date 로
        const parts = String(ws.getCell(r, 1).value).split('-')
        if (parts.length === 3) ws.getCell(r, 1).value = new Date(+parts[0], +parts[1] - 1, +parts[2])
      }
      ws.getCell(r, 1).numFmt = 'yyyy-mm-dd'
      ws.getCell(r, 2).value = it.card_number || ''
      ws.getCell(r, 3).value = it.category || ''
      ws.getCell(r, 4).value = it.merchant || ''
      ws.getCell(r, 5).value = it.item_name || ''
      ws.getCell(r, 6).value = it.customer_team || ''
      const amt = toNum(it.amount)
      ws.getCell(r, 7).value = amt
      ws.getCell(r, 7).numFmt = '#,##0'
      // H 열 (영수증) 비워둠
    })

    // G2: SUM 공식 + 계산값 (Excel 열 시 자동 재계산도 되도록 공식 유지)
    const lastRow = DATA_START_ROW + items.length - 1
    if (items.length > 0) {
      ws.getCell('G2').value = { formula: `SUM(G${DATA_START_ROW}:G${Math.max(lastRow, 41)})` } as any
    } else {
      ws.getCell('G2').value = 0
    }
    ws.getCell('G2').numFmt = '#,##0'

    // 출력
    const buf = await wb.xlsx.writeBuffer()
    const fileName = encodeURIComponent(`라이드(주)제출양식 (${monthNum}월분).xlsx`)
    return new NextResponse(buf as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
        'Content-Length': String((buf as any).byteLength ?? (buf as any).length),
      },
    })
  } catch (err: any) {
    console.error('영수증 엑셀 생성 실패:', err)
    return NextResponse.json(
      { error: `엑셀 생성 실패: ${err.message || String(err)}` },
      { status: 500 },
    )
  }
}
