import { NextRequest, NextResponse } from 'next/server'
import { uploadToGCS } from '@/lib/gcs'

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.sub || payload.user_id || null
  } catch {
    return null
  }
}

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const MAX_SIZE = 20 * 1024 * 1024 // 20MB

// POST /api/upload
// FormData: file (File), folder (string, optional), filename (string, optional)
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
    const folder = (formData.get('folder') as string) || 'uploads'
    const customFilename = formData.get('filename') as string | null

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `허용되지 않는 파일 형식: ${file.type}` },
        { status: 400 }
      )
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: '파일 크기는 20MB 이하만 가능합니다.' },
        { status: 400 }
      )
    }

    const fileName = customFilename
      ? `${folder}/${customFilename}`
      : `${folder}/${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const publicUrl = await uploadToGCS(fileName, buffer, file.type)

    return NextResponse.json({ url: publicUrl, path: fileName, error: null })
  } catch (e: any) {
    console.error('[POST /api/upload]', e)
    // GCS not configured — return placeholder
    if (e.message?.includes('GCS_BUCKET_NAME')) {
      return NextResponse.json({
        url: '',
        path: '',
        error: null,
        warning: 'GCS_BUCKET_NAME 미설정 — 업로드 건너뜀',
      })
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
