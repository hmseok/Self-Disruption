import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ============================================
// E-Contract Guest Signing API (No Auth Required)
// GET  → Contract information retrieval
// POST → Signed PDF upload + signed_pdf_url update
// ============================================

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET: Contract information retrieval (guest - no login required)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const contractId = searchParams.get('contract_id')

  if (!contractId) {
    return NextResponse.json({ error: 'contract_id required' }, { status: 400 })
  }

  try {
    const contractArr = await prisma.$queryRaw<any[]>`
      SELECT * FROM short_term_rental_contracts WHERE id = ${contractId} LIMIT 1
    `
    const contract = contractArr[0]

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    // Filter out sensitive fields
    const safeContract = {
      id: contract.id,
      property_id: contract.property_id,
      guest_name: contract.guest_name,
      guest_email: contract.guest_email,
      guest_phone: contract.guest_phone,
      check_in_date: contract.check_in_date,
      check_out_date: contract.check_out_date,
      total_price: contract.total_price,
      deposit_amount: contract.deposit_amount,
      terms_and_conditions: contract.terms_and_conditions,
      signed_pdf_url: contract.signed_pdf_url,
      status: contract.status,
      signed_at: contract.signed_at,
    }

    return NextResponse.json({ contract: serialize(safeContract) })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Signed PDF upload (guest - no login required)
export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const contractId = formData.get('contract_id') as string
  const file = formData.get('file') as File

  if (!contractId || !file) {
    return NextResponse.json({ error: 'contract_id and file required' }, { status: 400 })
  }

  try {
    // Check if contract exists
    const contractArr = await prisma.$queryRaw<any[]>`
      SELECT id, signed_pdf_url FROM short_term_rental_contracts WHERE id = ${contractId} LIMIT 1
    `
    const contract = contractArr[0]

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    // Already signed
    if (contract.signed_pdf_url) {
      return NextResponse.json({
        success: true,
        already_signed: true,
        signed_pdf_url: contract.signed_pdf_url,
      })
    }

    // TODO: Phase 4 - Migrate to Google Cloud Storage
    // Upload PDF to storage service
    const fileName = `short-term/${contractId}/signed.pdf`
    const buffer = Buffer.from(await file.arrayBuffer())
    // For now, use empty string as placeholder
    const publicUrl = ''

    // Extract signed_ip from request headers
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'

    // Update contract with signed_pdf_url, signed_at, status, and signed_ip
    await prisma.$executeRaw`
      UPDATE short_term_rental_contracts SET signed_pdf_url = ${publicUrl}, signed_at = ${new Date().toISOString()}, status = 'signed', signed_ip = ${clientIp} WHERE id = ${contractId}
    `

    return NextResponse.json(serialize({ success: true, signed_pdf_url: publicUrl }))
  } catch (e: any) {
    console.error('[e-contract guest-sign] Upload failed:', e.message)
    return NextResponse.json({ error: 'Failed to save signature: ' + e.message }, { status: 500 })
  }
}
