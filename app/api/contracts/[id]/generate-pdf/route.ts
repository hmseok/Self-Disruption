import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * 계약서 PDF 업로드/저장 API
 * POST /api/contracts/[id]/generate-pdf
 *
 * 클라이언트에서 생성한 PDF blob(base64)을 받아 저장
 * contracts.contract_pdf_url 업데이트
 */

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

    // 1. 계약 확인
    const contract = await prisma.$queryRaw<any[]>`
      SELECT id, quote_id, contract_pdf_url FROM contracts WHERE id = ${contractId} LIMIT 1
    `

    if (!contract || contract.length === 0) {
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 이미 PDF가 있으면 기존 URL 반환
    if (contract[0].contract_pdf_url) {
      return NextResponse.json({
        success: true,
        already_exists: true,
        pdf_url: contract[0].contract_pdf_url,
      })
    }

    // 2. Base64 → Buffer 변환
    const base64Data = pdfBase64.replace(/^data:application\/pdf;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    // 3. 파일 저장 (TODO: Phase 6 - Replace with GCS upload)
    const timestamp = Date.now()
    const filePath = `${contractId}/contract_${timestamp}.pdf`
    const publicUrl = `gcs://contract-pdfs/${filePath}`

    // 4. contracts 테이블 업데이트
    await prisma.$executeRaw`
      UPDATE contracts
      SET contract_pdf_url = ${publicUrl}, contract_pdf_stored_at = NOW()
      WHERE id = ${contractId}
    `

    // 5. contract_documents에도 기록
    try {
      const docId = Date.now().toString()
      await prisma.$executeRaw`
        INSERT INTO contract_documents
        (id, contract_id, document_type, file_name, file_url, file_size, notes, created_at)
        VALUES (
          ${docId},
          ${contractId},
          'signed_contract',
          ${`계약서_${contractId.slice(0, 8)}.pdf`},
          ${publicUrl},
          ${buffer.length},
          '서명 완료 후 자동 저장',
          NOW()
        )
      `
    } catch {
      // 테이블 미존재 시 무시
    }

    return NextResponse.json({ success: true, pdf_url: publicUrl })
  } catch (e: any) {
    console.error('[generate-pdf] 에러:', e.message)
    return NextResponse.json({ error: 'PDF 저장 중 오류: ' + e.message }, { status: 500 })
  }
}
