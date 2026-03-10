import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import * as fs from 'fs'

// JSZip is available as ExcelJS dependency
const JSZip = require('jszip')

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const urlToken = request.nextUrl.searchParams.get('token')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : urlToken
  if (!token) return null
  const supabase = getSupabaseAdmin()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, company_id, employee_name').eq('id', user.id).single()
  return profile ? { ...user, role: profile.role, company_id: profile.company_id, employee_name: profile.employee_name } : null
}

/** JS Date → Excel serial number (1900 date system, UTC to avoid timezone issues) */
function dateToExcelSerial(dateStr: string): number {
  // Use UTC to avoid historical timezone offset differences (e.g. KST LMT vs modern KST)
  const parts = dateStr.split('-')
  const d = Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  const epoch = Date.UTC(1899, 11, 30) // Dec 30, 1899 UTC
  return Math.floor((d - epoch) / 86400000)
}

/** Escape XML special characters */
function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Build a single data row XML (rows 5-34) */
function buildRowXml(rowNum: number, item: any): string {
  const cells: string[] = []
  const r = rowNum

  // A: date (Excel serial number) — style 74
  if (item.expense_date) {
    const serial = dateToExcelSerial(item.expense_date)
    cells.push(`<c r="A${r}" s="74"><v>${serial}</v></c>`)
  } else {
    cells.push(`<c r="A${r}" s="74"/>`)
  }

  // B: card_number (inline string) — style 70
  if (item.card_number) {
    cells.push(`<c r="B${r}" s="70" t="inlineStr"><is><t>${escXml(item.card_number)}</t></is></c>`)
  } else {
    cells.push(`<c r="B${r}" s="70"/>`)
  }

  // C: category — style 64
  if (item.category) {
    cells.push(`<c r="C${r}" s="64" t="inlineStr"><is><t>${escXml(item.category)}</t></is></c>`)
  } else {
    cells.push(`<c r="C${r}" s="64"/>`)
  }

  // D: merchant — style 64
  if (item.merchant) {
    cells.push(`<c r="D${r}" s="64" t="inlineStr"><is><t>${escXml(item.merchant)}</t></is></c>`)
  } else {
    cells.push(`<c r="D${r}" s="64"/>`)
  }

  // E: item_name — style 64
  if (item.item_name) {
    cells.push(`<c r="E${r}" s="64" t="inlineStr"><is><t>${escXml(item.item_name)}</t></is></c>`)
  } else {
    cells.push(`<c r="E${r}" s="64"/>`)
  }

  // F: customer_team — style 59
  if (item.customer_team) {
    cells.push(`<c r="F${r}" s="59" t="inlineStr"><is><t>${escXml(item.customer_team)}</t></is></c>`)
  } else {
    cells.push(`<c r="F${r}" s="59"/>`)
  }

  // G: amount (number) — style 66
  let amount = item.amount || 0
  if (typeof amount === 'string') {
    amount = parseInt(amount.replace(/,/g, ''), 10) || 0
  }
  cells.push(`<c r="G${r}" s="66"><v>${amount}</v></c>`)

  // H: receipt — style 72 (empty)
  cells.push(`<c r="H${r}" s="72"/>`)

  return `<row r="${r}" spans="1:8">${cells.join('')}</row>`
}

/** Build an empty row XML for unused rows */
function buildEmptyRowXml(rowNum: number): string {
  return `<row r="${rowNum}" spans="1:8"><c r="A${rowNum}" s="74"/><c r="B${rowNum}" s="70"/><c r="C${rowNum}" s="64"/><c r="D${rowNum}" s="64"/><c r="E${rowNum}" s="64"/><c r="F${rowNum}" s="59"/><c r="G${rowNum}" s="66"/><c r="H${rowNum}" s="72"/></row>`
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const month = searchParams.get('month') // YYYY-MM
  const overrideCompanyId = searchParams.get('company_id')

  if (!month) return NextResponse.json({ error: 'month 파라미터 필요' }, { status: 400 })

  const companyId = (user.role === 'god_admin' && overrideCompanyId) ? overrideCompanyId : user.company_id
  if (user.role === 'god_admin' && !overrideCompanyId) {
    return NextResponse.json({ error: '회사를 선택해주세요' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 데이터 조회
  const start = `${month}-01`
  const endDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0)
  const end = `${month}-${String(endDate.getDate()).padStart(2, '0')}`

  const { data: items, error } = await supabase
    .from('expense_receipts')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .gte('expense_date', start)
    .lte('expense_date', end)
    .order('expense_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }

  // ── JSZip으로 템플릿 xlsx 직접 수정 ──
  const templatePath = path.join(process.cwd(), 'public', 'templates', 'expense_report_template.xlsx')
  if (!fs.existsSync(templatePath)) {
    return NextResponse.json({ error: '템플릿 파일 없음' }, { status: 500 })
  }

  try {
    const templateBuf = fs.readFileSync(templatePath)
    const zip = await JSZip.loadAsync(templateBuf)

    // sheet3.xml = "법인 지출내역서"
    const sheetFile = zip.file('xl/worksheets/sheet3.xml')
    if (!sheetFile) {
      return NextResponse.json({ error: '시트 파일 없음' }, { status: 500 })
    }
    let sheetXml: string = await sheetFile.async('string')

    const monthNum = parseInt(month.split('-')[1])
    const dataItems = items || [] // 제한 없음 — 전체 데이터
    const dataCount = dataItems.length
    const lastDataRow = Math.max(34, 4 + dataCount) // 최소 30행 유지 (템플릿 호환)

    // 1) A2 셀 업데이트: 월 번호 변경 (inline string으로 교체)
    sheetXml = sheetXml.replace(
      /<c r="A2"[^/]*(?:\/>|>.*?<\/c>)/,
      `<c r="A2" s="83" t="inlineStr"><is><t>(  ${monthNum}  )월 지출 합계 내역</t></is></c>`
    )

    // 2) 데이터 행 교체 — 기존 템플릿 행(5~34) 제거 후 동적 생성
    // Remove existing template rows 5-34
    for (let r = 5; r <= 34; r++) {
      const rowRegex = new RegExp(`<row r="${r}"[^>]*>.*?</row>`, 's')
      sheetXml = sheetXml.replace(rowRegex, `__ROW_${r}__`)
    }

    // Build new rows (5 ~ lastDataRow)
    const newRows: string[] = []
    for (let i = 0; i < Math.max(30, dataCount); i++) {
      const rowNum = 5 + i
      if (i < dataCount) {
        newRows.push(buildRowXml(rowNum, dataItems[i]))
      } else {
        newRows.push(buildEmptyRowXml(rowNum))
      }
    }

    // Replace template placeholders (rows 5-34)
    for (let r = 5; r <= 34; r++) {
      const idx = r - 5
      sheetXml = sheetXml.replace(`__ROW_${r}__`, newRows[idx])
    }

    // Insert extra rows (35+) if data exceeds 30 items
    if (dataCount > 30) {
      const extraRowsXml = newRows.slice(30).join('')
      // Insert before </sheetData>
      sheetXml = sheetXml.replace('</sheetData>', extraRowsXml + '</sheetData>')
    }

    // 2-b) dimension 태그 업데이트 (Excel이 전체 데이터 영역 인식하도록)
    sheetXml = sheetXml.replace(
      /<dimension ref="[^"]*"\/>/,
      `<dimension ref="A1:H${lastDataRow}"/>`
    )

    // 3) G2 셀: SUM 공식 + 서버에서 계산한 값 설정 (동적 범위)
    let totalAmount = 0
    for (const item of dataItems) {
      let amt = item.amount || 0
      if (typeof amt === 'string') amt = parseInt(amt.replace(/,/g, ''), 10) || 0
      totalAmount += amt
    }
    sheetXml = sheetXml.replace(
      /<c r="G2"[^>]*>.*?<\/c>/s,
      `<c r="G2" s="84"><f>SUM(G5:G${lastDataRow})</f><v>${totalAmount}</v></c>`
    )

    // Update the sheet in zip
    zip.file('xl/worksheets/sheet3.xml', sheetXml)

    // 4) workbook.xml의 Print_Area 업데이트 (파란 테두리 범위)
    const wbFile = zip.file('xl/workbook.xml')
    if (wbFile) {
      let wbXml: string = await wbFile.async('string')
      // 기존 Print_Area '$A$1:$H$34' → '$A$1:$H${lastDataRow}'
      const oldPrintArea = "'법인 지출내역서'!$A$1:$H$34"
      const newPrintArea = `'법인 지출내역서'!$A$1:$H$${lastDataRow}`
      wbXml = wbXml.replace(oldPrintArea, newPrintArea)
      zip.file('xl/workbook.xml', wbXml)
    }

    // 5) calcChain.xml 제거 → Excel이 열 때 수식 자동 재계산
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml')
    }

    // Generate output buffer
    const outputBuf = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    // 파일명: 법인카드 사용내역서 (X월분).xlsx
    const fileName = encodeURIComponent(`법인카드 사용내역서 (${monthNum}월분).xlsx`)

    return new NextResponse(outputBuf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
      },
    })
  } catch (err: any) {
    console.error('Excel 생성 실패:', err.message || err)
    return NextResponse.json({ error: 'Excel 생성 실패: ' + (err.message || '') }, { status: 500 })
  }
}
