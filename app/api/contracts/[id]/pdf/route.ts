import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * 계약서 PDF 다운로드 API
 * GET /api/contracts/[id]/pdf
 *
 * 저장된 PDF의 signed URL을 반환
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params
    const sb = createClient(supabaseUrl, supabaseServiceKey)

    // 계약 조회
    const { data: contract, error } = await sb
      .from('contracts')
      .select('id, company_id, contract_pdf_url, customer_name')
      .eq('id', contractId)
      .single()

    if (error || !contract) {
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (!contract.contract_pdf_url) {
      return NextResponse.json({ error: '저장된 PDF가 없습니다.' }, { status: 404 })
    }

    // 이미 public URL이면 바로 반환
    return NextResponse.json({
      success: true,
      pdf_url: contract.contract_pdf_url,
      customer_name: contract.customer_name,
    })
  } catch (e: any) {
    console.error('[contract/pdf] 에러:', e.message)
    return NextResponse.json({ error: 'PDF 조회 오류' }, { status: 500 })
  }
}
