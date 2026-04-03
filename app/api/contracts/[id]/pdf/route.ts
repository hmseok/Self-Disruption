import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * 계약서 PDF 다운로드 API
 * GET /api/contracts/[id]/pdf
 *
 * 저장된 PDF의 signed URL을 반환
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params

    // 계약 조회
    const contract = await prisma.$queryRaw<any[]>`
      SELECT id, contract_pdf_url, customer_name FROM contracts WHERE id = ${contractId} LIMIT 1
    `

    if (!contract || contract.length === 0) {
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (!contract[0].contract_pdf_url) {
      return NextResponse.json({ error: '저장된 PDF가 없습니다.' }, { status: 404 })
    }

    // 이미 public URL이면 바로 반환
    return NextResponse.json({
      success: true,
      pdf_url: contract[0].contract_pdf_url,
      customer_name: contract[0].customer_name,
    })
  } catch (e: any) {
    console.error('[contract/pdf] 에러:', e.message)
    return NextResponse.json({ error: 'PDF 조회 오류' }, { status: 500 })
  }
}
