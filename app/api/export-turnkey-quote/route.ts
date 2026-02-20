import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { rates, customDays, globalDiscount, contractInfo } = body

    // ExcelJS로 엑셀 생성 (브라우저 호환)
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Self-Disruption 턴키 렌터'
    wb.created = new Date()

    // ── 시트1: 단기대차 표준 단가표 ──
    const ws = wb.addWorksheet('단기대차 단가표', {
      properties: { defaultColWidth: 14 },
    })

    // 스타일 정의
    const headerFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } }
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Arial' }
    const subHeaderFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8ECF0' } }
    const groupFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } }
    const borderThin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFD0D0D0' } }
    const borders: Partial<ExcelJS.Borders> = { top: borderThin, left: borderThin, bottom: borderThin, right: borderThin }
    const centerAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
    const rightAlign: Partial<ExcelJS.Alignment> = { horizontal: 'right', vertical: 'middle' }
    const calcRate = (base: number, pct: number) => Math.round(base * pct / 100)

    // 타이틀
    ws.mergeCells('A1:G1')
    const titleCell = ws.getCell('A1')
    titleCell.value = '단기대차 서비스 표준 단가표'
    titleCell.font = { bold: true, size: 16, name: 'Arial', color: { argb: 'FF1A1A2E' } }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 35

    // 계약 정보
    ws.mergeCells('A2:G2')
    const infoCell = ws.getCell('A2')
    const infoTexts = []
    if (contractInfo?.company) infoTexts.push(`업체: ${contractInfo.company}`)
    if (contractInfo?.period) infoTexts.push(`계약기간: ${contractInfo.period}`)
    if (contractInfo?.vehicleCount) infoTexts.push(`보유차량: ${contractInfo.vehicleCount}대`)
    infoTexts.push(`할인율: 롯데 대비 ${globalDiscount}%`)
    infoTexts.push(`기준일: ${new Date().toLocaleDateString('ko-KR')}`)
    infoCell.value = infoTexts.join('  |  ')
    infoCell.font = { size: 10, color: { argb: 'FF666666' }, name: 'Arial' }
    infoCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(2).height = 22

    // 제공일수별 반복 생성
    let currentRow = 4

    for (const days of customDays) {
      // 제공일수 그룹 헤더
      ws.mergeCells(`A${currentRow}:G${currentRow}`)
      const groupCell = ws.getCell(`A${currentRow}`)
      groupCell.value = `연 ${days}일 제공`
      groupCell.font = { bold: true, size: 12, name: 'Arial', color: { argb: 'FFE65100' } }
      groupCell.fill = groupFill
      groupCell.alignment = { horizontal: 'left', vertical: 'middle' }
      groupCell.border = borders
      ws.getRow(currentRow).height = 28
      currentRow++

      // 테이블 헤더
      const headers = ['구분', '차종', '배기량', '정비군', '롯데 단가', '턴키 단가', '비고']
      const headerRow = ws.getRow(currentRow)
      headers.forEach((h, ci) => {
        const cell = headerRow.getCell(ci + 1)
        cell.value = h
        cell.font = headerFont
        cell.fill = headerFill
        cell.alignment = centerAlign
        cell.border = borders
      })
      ws.getRow(currentRow).height = 24
      currentRow++

      // 승용 섹션
      let sectionStart = currentRow
      const sedanRates = rates.filter((r: any) => ['1군', '2군', '3군', '4군', '5군', '6군'].includes(r.service_group))
      sedanRates.forEach((r: any, ri: number) => {
        const row = ws.getRow(currentRow)
        const dr = calcRate(r.lotte_base_rate, globalDiscount)

        if (ri === 0) {
          row.getCell(1).value = '승용'
        }
        row.getCell(2).value = r.vehicle_class || ''
        row.getCell(3).value = r.displacement_range || ''
        row.getCell(4).value = r.service_group
        row.getCell(5).value = r.lotte_base_rate
        row.getCell(6).value = dr
        row.getCell(7).value = `연 ${(dr * days).toLocaleString()}원`

        for (let ci = 1; ci <= 7; ci++) {
          const cell = row.getCell(ci)
          cell.font = { size: 10, name: 'Arial' }
          cell.border = borders
          if (ci === 4) cell.alignment = centerAlign
          if (ci === 5 || ci === 6) {
            cell.alignment = rightAlign
            cell.numFmt = '#,##0'
          }
          if (ci === 5) cell.font = { size: 10, name: 'Arial', color: { argb: 'FFCC0000' } }
          if (ci === 6) cell.font = { size: 10, name: 'Arial', bold: true }
          if (ci === 7) cell.alignment = rightAlign
        }
        ws.getRow(currentRow).height = 22
        currentRow++
      })
      // 승용 셀 병합
      if (sedanRates.length > 1) {
        ws.mergeCells(`A${sectionStart}:A${sectionStart + sedanRates.length - 1}`)
        const mergedCell = ws.getCell(`A${sectionStart}`)
        mergedCell.alignment = { ...centerAlign, textRotation: 0 }
        mergedCell.font = { bold: true, size: 11, name: 'Arial' }
      }

      // RV·SUV·승합 섹션
      sectionStart = currentRow
      const rvRates = rates.filter((r: any) => ['8군', '9군', '10군'].includes(r.service_group))
      rvRates.forEach((r: any, ri: number) => {
        const row = ws.getRow(currentRow)
        const dr = calcRate(r.lotte_base_rate, globalDiscount)

        if (ri === 0) {
          row.getCell(1).value = 'RV·SUV·승합'
        }
        row.getCell(2).value = r.vehicle_class || ''
        row.getCell(3).value = r.displacement_range || ''
        row.getCell(4).value = r.service_group
        row.getCell(5).value = r.lotte_base_rate
        row.getCell(6).value = dr
        row.getCell(7).value = `연 ${(dr * days).toLocaleString()}원`

        for (let ci = 1; ci <= 7; ci++) {
          const cell = row.getCell(ci)
          cell.font = { size: 10, name: 'Arial' }
          cell.border = borders
          if (ci === 4) cell.alignment = centerAlign
          if (ci === 5 || ci === 6) {
            cell.alignment = rightAlign
            cell.numFmt = '#,##0'
          }
          if (ci === 5) cell.font = { size: 10, name: 'Arial', color: { argb: 'FFCC0000' } }
          if (ci === 6) cell.font = { size: 10, name: 'Arial', bold: true }
          if (ci === 7) cell.alignment = rightAlign
        }
        ws.getRow(currentRow).height = 22
        currentRow++
      })
      if (rvRates.length > 1) {
        ws.mergeCells(`A${sectionStart}:A${sectionStart + rvRates.length - 1}`)
        const mergedCell = ws.getCell(`A${sectionStart}`)
        mergedCell.alignment = { ...centerAlign, textRotation: 0 }
        mergedCell.font = { bold: true, size: 11, name: 'Arial' }
      }

      currentRow++ // 그룹간 빈줄
    }

    // 하단 주석
    ws.mergeCells(`A${currentRow}:G${currentRow}`)
    ws.getCell(`A${currentRow}`).value = '※ 상기 단가는 VAT 포함 기준이며, 계약 조건에 따라 변동될 수 있습니다.'
    ws.getCell(`A${currentRow}`).font = { size: 9, color: { argb: 'FF999999' }, name: 'Arial' }
    currentRow++
    ws.mergeCells(`A${currentRow}:G${currentRow}`)
    ws.getCell(`A${currentRow}`).value = '※ 기준: 롯데렌터카 공식 단기렌트 요금표 (VAT 포함)'
    ws.getCell(`A${currentRow}`).font = { size: 9, color: { argb: 'FF999999' }, name: 'Arial' }

    // 열 너비
    ws.getColumn(1).width = 14
    ws.getColumn(2).width = 22
    ws.getColumn(3).width = 16
    ws.getColumn(4).width = 10
    ws.getColumn(5).width = 14
    ws.getColumn(6).width = 14
    ws.getColumn(7).width = 18

    // 버퍼로 변환
    const buffer = await wb.xlsx.writeBuffer()

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=turnkey_quote_${Date.now()}.xlsx`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
