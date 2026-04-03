import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// ============================================
// 게스트 서명 API (로그인 불필요)
// GET  → 계약 정보 + 차량 정보 조회
// POST → 서명 PDF 업로드 + signed_file_url 업데이트
// ============================================

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

  const tableName = contractType === 'jiip' ? 'jiip_contracts' : 'general_investments'

  try {
    const contract = await prisma.$queryRaw<any[]>`
      SELECT * FROM ${Prisma.raw(tableName)} WHERE id = ${contractId} LIMIT 1
    `

    if (!contract || contract.length === 0) {
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 차량 정보 조회
    let car = null
    if (contract[0].car_id) {
      const carData = await prisma.$queryRaw<any[]>`
        SELECT id, number, brand, model FROM cars WHERE id = ${contract[0].car_id} LIMIT 1
      `
      car = carData?.[0]
    }

    // 민감 정보 제외하고 반환
    const safeContract = {
      id: contract[0].id,
      car_id: contract[0].car_id,
      investor_name: contract[0].investor_name,
      investor_address: contract[0].investor_address,
      investor_address_detail: contract[0].investor_address_detail,
      investor_reg_number: contract[0].investor_reg_number,
      bank_name: contract[0].bank_name,
      account_number: contract[0].account_number,
      account_holder: contract[0].account_holder,
      contract_start_date: contract[0].contract_start_date,
      contract_end_date: contract[0].contract_end_date,
      invest_amount: contract[0].invest_amount,
      admin_fee: contract[0].admin_fee,
      share_ratio: contract[0].share_ratio,
      payout_day: contract[0].payout_day,
      tax_type: contract[0].tax_type,
      mortgage_setup: contract[0].mortgage_setup,
      signed_file_url: contract[0].signed_file_url,
      status: contract[0].status,
    }

    return NextResponse.json({ contract: safeContract, car })
  } catch (e: any) {
    console.error('[guest-sign GET] 에러:', e.message)
    return NextResponse.json({ error: '계약 조회 오류' }, { status: 500 })
  }
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

  const tableName = contractType === 'jiip' ? 'jiip_contracts' : 'general_investments'

  try {
    // 계약 존재 여부 확인
    const contract = await prisma.$queryRaw<any[]>`
      SELECT id, signed_file_url FROM ${Prisma.raw(tableName)} WHERE id = ${contractId} LIMIT 1
    `

    if (!contract || contract.length === 0) {
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 이미 서명된 경우
    if (contract[0].signed_file_url) {
      return NextResponse.json({
        success: true,
        already_signed: true,
        signed_file_url: contract[0].signed_file_url,
      })
    }

    // PDF 처리 (TODO: Phase 6 - Replace with GCS upload)
    const fileName = `${contractType}_contract_${contractId}_guest_${Date.now()}.pdf`
    const buffer = Buffer.from(await file.arrayBuffer())
    const publicUrl = `gcs://contracts/${fileName}`

    // signed_file_url 업데이트
    await prisma.$executeRaw`
      UPDATE ${Prisma.raw(tableName)}
      SET signed_file_url = ${publicUrl}
      WHERE id = ${contractId}
    `

    return NextResponse.json({ success: true, signed_file_url: publicUrl })
  } catch (e: any) {
    console.error('[guest-sign POST] 업로드 실패:', e.message)
    return NextResponse.json({ error: '서명 저장 실패: ' + e.message }, { status: 500 })
  }
}
