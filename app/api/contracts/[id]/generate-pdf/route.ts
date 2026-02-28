import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordLifecycleEvent } from '@/app/utils/lifecycle-events'

/**
 * 계약서 PDF 업로드/저장 API
 * POST /api/contracts/[id]/generate-pdf
 *
 * 클라이언트에서 생성한 PDF blob(base64)을 받아 Supabase Storage에 저장
 * contracts.contract_pdf_url 업데이트
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params
    const body = await req.json()
    const { pdfBase64, quoteId } = body

    if (!pdfBase64) {
      return NextResponse.json({ error: 'pdfBase64가 필요합니다.' }, { status: 400 })
    }

    const sb = createClient(supabaseUrl, supabaseServiceKey)

    // 1. 계약 확인
    const { data: contract, error: cErr } = await sb
      .from('contracts')
      .select('id, company_id, quote_id, contract_pdf_url')
      .eq('id', contractId)
      .single()

    if (cErr || !contract) {
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 이미 PDF가 있으면 기존 URL 반환
    if (contract.contract_pdf_url) {
      return NextResponse.json({
        success: true,
        already_exists: true,
        pdf_url: contract.contract_pdf_url,
      })
    }

    // 2. Base64 → Buffer 변환
    const base64Data = pdfBase64.replace(/^data:application\/pdf;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    // 3. Supabase Storage 업로드
    const timestamp = Date.now()
    const filePath = `${contract.company_id}/${contractId}/contract_${timestamp}.pdf`

    const { error: uploadErr } = await sb.storage
      .from('contract-pdfs')
      .upload(filePath, buffer, {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (uploadErr) {
      // contract-pdfs 버킷이 없을 수 있음 → contracts 버킷으로 fallback
      const fallbackPath = `signed_${contractId}_${timestamp}.pdf`
      const { error: fallbackErr } = await sb.storage
        .from('contracts')
        .upload(fallbackPath, buffer, {
          contentType: 'application/pdf',
          upsert: false,
        })

      if (fallbackErr) {
        console.error('[generate-pdf] Storage 업로드 실패:', fallbackErr.message)
        return NextResponse.json({ error: 'PDF 저장 실패: ' + fallbackErr.message }, { status: 500 })
      }

      // fallback 경로로 URL 생성
      const { data: { publicUrl } } = sb.storage.from('contracts').getPublicUrl(fallbackPath)

      await sb.from('contracts').update({
        contract_pdf_url: publicUrl,
        contract_pdf_stored_at: new Date().toISOString(),
      }).eq('id', contractId)

      // 라이프사이클 이벤트
      if (contract.quote_id || quoteId) {
        recordLifecycleEvent({
          companyId: contract.company_id,
          quoteId: contract.quote_id || quoteId,
          contractId,
          eventType: 'pdf_stored',
          metadata: { storage_bucket: 'contracts', file_path: fallbackPath },
        })
      }

      return NextResponse.json({ success: true, pdf_url: publicUrl })
    }

    // 정상 경로 URL 생성
    const { data: { publicUrl } } = sb.storage.from('contract-pdfs').getPublicUrl(filePath)

    // 4. contracts 테이블 업데이트
    await sb.from('contracts').update({
      contract_pdf_url: publicUrl,
      contract_pdf_stored_at: new Date().toISOString(),
    }).eq('id', contractId)

    // 5. contract_documents에도 기록
    await sb.from('contract_documents').insert([{
      company_id: contract.company_id,
      contract_id: contractId,
      document_type: 'signed_contract',
      file_name: `계약서_${contractId.slice(0, 8)}.pdf`,
      file_url: publicUrl,
      file_size: buffer.length,
      notes: '서명 완료 후 자동 저장',
    }]).catch(() => {}) // 테이블 미존재 시 무시

    // 6. 라이프사이클 이벤트
    if (contract.quote_id || quoteId) {
      recordLifecycleEvent({
        companyId: contract.company_id,
        quoteId: contract.quote_id || quoteId,
        contractId,
        eventType: 'pdf_stored',
        metadata: { storage_bucket: 'contract-pdfs', file_path: filePath },
      })
    }

    return NextResponse.json({ success: true, pdf_url: publicUrl })
  } catch (e: any) {
    console.error('[generate-pdf] 에러:', e.message)
    return NextResponse.json({ error: 'PDF 저장 중 오류: ' + e.message }, { status: 500 })
  }
}
