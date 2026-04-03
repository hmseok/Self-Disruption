import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/utils/auth-guard'
import { prisma } from '@/lib/prisma'

/**
 * 계약 문서 관리 API
 * GET    /api/contracts/[id]/documents — 문서 목록
 * POST   /api/contracts/[id]/documents — 문서 업로드
 * DELETE /api/contracts/[id]/documents — 문서 삭제
 */

// GET: 문서 목록 조회
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  try {
    const { id: contractId } = await params

    const docs = await prisma.$queryRaw<any[]>`
      SELECT * FROM contract_documents
      WHERE contract_id = ${contractId}
      ORDER BY created_at DESC
    `

    return NextResponse.json({ documents: docs || [] })
  } catch (e: any) {
    console.error('[contract/documents GET] 에러:', e.message)
    return NextResponse.json({ error: '문서 조회 오류' }, { status: 500 })
  }
}

// POST: 문서 업로드
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  try {
    const { id: contractId } = await params

    // 계약 확인
    const contract = await prisma.$queryRaw<any[]>`
      SELECT id, company_id FROM contracts WHERE id = ${contractId} LIMIT 1
    `

    if (!contract || contract.length === 0) {
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const documentType = (formData.get('document_type') as string) || 'other'
    const notes = (formData.get('notes') as string) || ''

    if (!file) {
      return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 })
    }

    // Storage 업로드 (Supabase에서 Google Cloud Storage로 변경 가능)
    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split('.').pop() || 'pdf'
    const storagePath = `${contract[0].company_id}/${contractId}/${documentType}_${Date.now()}.${ext}`

    // TODO: Phase 6 - Replace with GCS upload
    // For now, storing the file path in DB - actual file upload must be handled separately
    const fileUrl = `gcs://contract-documents/${storagePath}`

    // DB 기록
    const docId = Date.now().toString()
    await prisma.$executeRaw`
      INSERT INTO contract_documents
      (id, contract_id, document_type, file_name, file_url, file_size, notes, created_at)
      VALUES (${docId}, ${contractId}, ${documentType}, ${file.name}, ${fileUrl}, ${buffer.length}, ${notes}, NOW())
    `

    const doc = await prisma.$queryRaw<any[]>`
      SELECT * FROM contract_documents WHERE id = ${docId} LIMIT 1
    `

    return NextResponse.json({ success: true, document: doc?.[0] })
  } catch (e: any) {
    console.error('[contract/documents POST] 에러:', e.message)
    return NextResponse.json({ error: '문서 업로드 오류: ' + e.message }, { status: 500 })
  }
}

// DELETE: 문서 삭제
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(req.url)
    const docId = searchParams.get('doc_id')

    if (!docId) {
      return NextResponse.json({ error: 'doc_id가 필요합니다.' }, { status: 400 })
    }

    await prisma.$executeRaw`
      DELETE FROM contract_documents WHERE id = ${docId}
    `

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[contract/documents DELETE] 에러:', e.message)
    return NextResponse.json({ error: '문서 삭제 오류' }, { status: 500 })
  }
}
