import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/utils/auth-guard'
import { createClient } from '@supabase/supabase-js'

/**
 * 계약 문서 관리 API
 * GET    /api/contracts/[id]/documents — 문서 목록
 * POST   /api/contracts/[id]/documents — 문서 업로드
 * DELETE /api/contracts/[id]/documents — 문서 삭제
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// GET: 문서 목록 조회
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  try {
    const { id: contractId } = await params
    const sb = createClient(supabaseUrl, supabaseServiceKey)

    const { data: docs, error } = await sb
      .from('contract_documents')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false })

    if (error) throw error

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
    const sb = createClient(supabaseUrl, supabaseServiceKey)

    // 계약 확인
    const { data: contract } = await sb
      .from('contracts')
      .select('id, company_id')
      .eq('id', contractId)
      .single()

    if (!contract) {
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const documentType = (formData.get('document_type') as string) || 'other'
    const notes = (formData.get('notes') as string) || ''

    if (!file) {
      return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 })
    }

    // Storage 업로드
    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split('.').pop() || 'pdf'
    const storagePath = `${contract.company_id}/${contractId}/${documentType}_${Date.now()}.${ext}`

    // contract-pdfs 버킷 시도, 실패 시 contracts 버킷
    let fileUrl = ''
    const { error: upErr } = await sb.storage
      .from('contract-pdfs')
      .upload(storagePath, buffer, { contentType: file.type })

    if (upErr) {
      const fallbackPath = `doc_${contractId}_${Date.now()}.${ext}`
      const { error: fbErr } = await sb.storage
        .from('contracts')
        .upload(fallbackPath, buffer, { contentType: file.type })
      if (fbErr) throw fbErr
      const { data: { publicUrl } } = sb.storage.from('contracts').getPublicUrl(fallbackPath)
      fileUrl = publicUrl
    } else {
      const { data: { publicUrl } } = sb.storage.from('contract-pdfs').getPublicUrl(storagePath)
      fileUrl = publicUrl
    }

    // DB 기록
    const { data: doc, error: dbErr } = await sb
      .from('contract_documents')
      .insert([{
        company_id: contract.company_id,
        contract_id: contractId,
        document_type: documentType,
        file_name: file.name,
        file_url: fileUrl,
        file_size: buffer.length,
        uploaded_by: auth.user?.id || null,
        notes,
      }])
      .select()
      .single()

    if (dbErr) throw dbErr

    return NextResponse.json({ success: true, document: doc })
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

    const sb = createClient(supabaseUrl, supabaseServiceKey)

    const { error } = await sb
      .from('contract_documents')
      .delete()
      .eq('id', docId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[contract/documents DELETE] 에러:', e.message)
    return NextResponse.json({ error: '문서 삭제 오류' }, { status: 500 })
  }
}
