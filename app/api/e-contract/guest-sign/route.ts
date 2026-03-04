import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// E-Contract Guest Signing API (No Auth Required)
// GET  → Contract information retrieval
// POST → Signed PDF upload + signed_pdf_url update
// ============================================

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: Contract information retrieval (guest - no login required)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const contractId = searchParams.get('contract_id')

  if (!contractId) {
    return NextResponse.json({ error: 'contract_id required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const { data: contract, error } = await sb
    .from('short_term_rental_contracts')
    .select('*')
    .eq('id', contractId)
    .single()

  if (error || !contract) {
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

  return NextResponse.json({ contract: safeContract })
}

// POST: Signed PDF upload (guest - no login required)
export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const contractId = formData.get('contract_id') as string
  const file = formData.get('file') as File

  if (!contractId || !file) {
    return NextResponse.json({ error: 'contract_id and file required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Check if contract exists
  const { data: contract, error: fetchErr } = await sb
    .from('short_term_rental_contracts')
    .select('id, signed_pdf_url')
    .eq('id', contractId)
    .single()

  if (fetchErr || !contract) {
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

  try {
    // Upload PDF
    const fileName = `short-term/${contractId}/signed.pdf`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await sb.storage
      .from('contracts')
      .upload(fileName, buffer, { contentType: 'application/pdf' })

    if (uploadError) throw uploadError

    // Get public URL
    const { data: { publicUrl } } = sb.storage.from('contracts').getPublicUrl(fileName)

    // Extract signed_ip from request headers
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'

    // Update contract with signed_pdf_url, signed_at, status, and signed_ip
    const { error: updateError } = await sb
      .from('short_term_rental_contracts')
      .update({
        signed_pdf_url: publicUrl,
        signed_at: new Date().toISOString(),
        status: 'signed',
        signed_ip: clientIp,
      })
      .eq('id', contractId)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, signed_pdf_url: publicUrl })
  } catch (e: any) {
    console.error('[e-contract guest-sign] Upload failed:', e.message)
    return NextResponse.json({ error: 'Failed to save signature: ' + e.message }, { status: 500 })
  }
}
