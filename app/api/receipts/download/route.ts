import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const supabase = getSupabaseAdmin()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, company_id, employee_name').eq('id', user.id).single()
  return profile ? { ...user, role: profile.role, company_id: profile.company_id, employee_name: profile.employee_name } : null
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const month = searchParams.get('month') // YYYY-MM

  if (!month) return NextResponse.json({ error: 'month 파라미터 필요' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  // 데이터 조회
  const start = `${month}-01`
  const endDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0)
  const end = `${month}-${String(endDate.getDate()).padStart(2, '0')}`

  const { data: items, error } = await supabase
    .from('expense_receipts')
    .select('*')
    .eq('company_id', user.company_id)
    .eq('user_id', user.id)
    .gte('expense_date', start)
    .lte('expense_date', end)
    .order('expense_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }

  // ExcelJS로 xlsx 생성
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Self-Disruption'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('법인 지출내역서')

  // ── 타이틀 행 ──
  const monthNum = month.split('-')[1]
  sheet.mergeCells('A1:H1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = '법인 지출내역서'
  titleCell.font = { name: '맑은 고딕', size: 16, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 36

  // ── 월 합계 행 ──
  const totalAmount = (items || []).reduce((s: number, i: any) => s + (i.amount || 0), 0)
  sheet.mergeCells('A2:F2')
  const subTitleCell = sheet.getCell('A2')
  subTitleCell.value = `(  ${monthNum}  )월 지출 합계 내역`
  subTitleCell.font = { name: '맑은 고딕', size: 11, bold: true }
  sheet.getCell('G2').value = totalAmount
  sheet.getCell('G2').font = { name: '맑은 고딕', size: 12, bold: true, color: { argb: 'FF0066CC' } }
  sheet.getCell('G2').numFmt = '#,##0'
  sheet.getRow(2).height = 24

  // ── 빈 행 ──
  sheet.mergeCells('A3:H3')
  sheet.getCell('A3').value = '상세'
  sheet.getCell('A3').font = { name: '맑은 고딕', size: 10, bold: true }
  sheet.getRow(3).height = 20

  // ── 헤더 행 ──
  const headers = ['날짜', '카드번호', '구분', '사용처 (업체명)', '품명', '고객명/팀원', '금액', '영수증 첨부']
  const headerRow = sheet.addRow(headers)
  headerRow.height = 26
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    }
  })

  // ── 데이터 행 ──
  ;(items || []).forEach((item: any, idx: number) => {
    const row = sheet.addRow([
      item.expense_date ? new Date(item.expense_date) : '',
      item.card_number || '',
      item.category || '',
      item.merchant || '',
      item.item_name || '',
      item.customer_team || '',
      item.amount || 0,
      item.receipt_url ? '첨부' : '',
    ])
    row.height = 22
    row.eachCell((cell, colNumber) => {
      cell.font = { name: '맑은 고딕', size: 10 }
      cell.alignment = { vertical: 'middle' }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      }
      // 짝수/홀수 배경
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F7FB' } }
      }
    })
    // 날짜 포맷
    if (row.getCell(1).value instanceof Date) {
      row.getCell(1).numFmt = 'YYYY-MM-DD'
    }
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    // 금액 포맷
    row.getCell(7).numFmt = '#,##0'
    row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' }
  })

  // ── 열 너비 설정 ──
  sheet.getColumn(1).width = 14  // 날짜
  sheet.getColumn(2).width = 22  // 카드번호
  sheet.getColumn(3).width = 10  // 구분
  sheet.getColumn(4).width = 22  // 사용처
  sheet.getColumn(5).width = 12  // 품명
  sheet.getColumn(6).width = 18  // 고객명/팀원
  sheet.getColumn(7).width = 14  // 금액
  sheet.getColumn(8).width = 12  // 영수증

  // ── Buffer로 변환 후 응답 ──
  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="corporate_card_${month}.xlsx"`,
    },
  })
}
