import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 게스트 서명 API (로그인 불필요)
// GET  → 계약 정보 + 차량 정보 조회
// POST → 서명 PDF 업로드 + signed_file_url 업데이트
// ============================================

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: 계약 정보 조회 (게스트용 - 로그인 불필요)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const contractType = searchParams.get('contract_type')
  const contractId = searchParams.get('contract_id')

  if (!contractType || !contractId) {
    return NextResponse.json({ error: 'contract_type, contract_id 필수' }, { status: 400 })
  }
  if (!['jiip', 'invest'].includes(contractType)) {
    return NextResponse.json({ error: '유효하지 않은 계약 유형' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const tableName = contractType === 'jiip' ? 'jiip_contracts' : 'general_investments'

  const { data: contract, error } = await sb
    .from(tableName)
    .select('*')
    .eq('id', contractId)
    .single()

  if (error || !contract) {
    return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 차량 정보 조회
  let car = null
  if (contract.car_id) {
    const { data: carData } = await sb
      .from('cars')
      .select('id, number, brand, model')
      .eq('id', contract.car_id)
      .single()
    car = carData
  }

  // 민감 정보 제외하고 반환
  const safeContract = {
    id: contract.id,
    car_id: contract.car_id,
    investor_name: contract.investor_name,
    investor_address: contract.investor_address,
    investor_address_detail: contract.investor_address_detail,
    investor_reg_number: contract.investor_reg_number,
    bank_name: contract.bank_name,
    account_number: contract.account_number,
    account_holder: contract.account_holder,
    contract_start_date: contract.contract_start_date,
    contract_end_date: contract.contract_end_date,
    invest_amount: contract.invest_amount,
    admin_fee: contract.admin_fee,
    share_ratio: contract.share_ratio,
    payout_day: contract.payout_day,
    tax_type: contract.tax_type,
    mortgage_setup: contract.mortgage_setup,
    signed_file_url: contract.signed_file_url,
    status: contract.status,
  }

  return NextResponse.json({ contract: safeContract, car })
}

// POST: 서명 PDF 업로드 (게스트용 - 로그인 불필요)
export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const contractType = formData.get('contract_type') as string
  const contractId = formData.get('contract_id') as string
  const file = formData.get('file') as File

  if (!contractType || !contractId || !file) {
    return NextResponse.json({ error: 'contract_type, contract_id, file 필수' }, { status: 400 })
  }
  if (!['jiip', 'invest'].includes(contractType)) {
    return NextResponse.json({ error: '유효하지 않은 계약 유형' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const tableName = contractType === 'jiip' ? 'jiip_contracts' : 'general_investments'

  // 계약 존재 여부 확인
  const { data: contract, error: fetchErr } = await sb
    .from(tableName)
    .select('id, signed_file_url')
    .eq('id', contractId)
    .single()

  if (fetchErr || !contract) {
    return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 이미 서명된 경우
  if (contract.signed_file_url) {
    return NextResponse.json({
      success: true,
      already_signed: true,
      signed_file_url: contract.signed_file_url,
    })
  }

  try {
    // PDF 업로드
    const fileName = `${contractType}_contract_${contractId}_guest_${Date.now()}.pdf`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await sb.storage
      .from('contracts')
      .upload(fileName, buffer, { contentType: 'application/pdf' })

    if (uploadError) throw uploadError

    // 공개 URL 생성
    const { data: { publicUrl } } = sb.storage.from('contracts').getPublicUrl(fileName)

    // signed_file_url 업데이트
    const { error: updateError } = await sb
      .from(tableName)
      .update({ signed_file_url: publicUrl })
      .eq('id', contractId)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, signed_file_url: publicUrl })
  } catch (e: any) {
    console.error('[guest-sign] 업로드 실패:', e.message)
    return NextResponse.json({ error: '서명 저장 실패: ' + e.message }, { status: 500 })
  }
}
