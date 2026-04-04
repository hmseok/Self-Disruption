import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { uploadToGCS } from '@/lib/gcs'

// POST /api/upload/pdf — PDF 전용 업로드 (계약서, 보험서 등)
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')
    const userId = getUserIdFromToken(token)
    if (!userId) {
      return NextResponse.json({ error: '유효하지 않은 토큰' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const folder = (formData.get('folder') as string) || 'contracts'

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'PDF 또는 이미지만 업로드 가능합니다.' },
        { status: 400 }
      )
    }

    const fileName = `${folder}/${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const publicUrl = await uploadToGCS(fileName, buffer, file.type)

    return NextResponse.json({ url: publicUrl, path: fileName, error: null })
  } catch (e: any) {
    console.error('[POST /api/upload/pdf]', e)
    if (e.message?.includes('GCS_BUCKET_NAME')) {
      return NextResponse.json({ url: '', path: '', error: null, warning: 'GCS 미설정' })
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
