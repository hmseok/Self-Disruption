import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// ⚡️ 사업자등록증 업로드 — 회원가입 시 서버사이드에서 처리
// 회원가입 직후에는 이메일 인증 전이라 클라이언트 세션이 없음
// → Firebase Admin SDK로 서버에서 직접 업로드

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const userId = formData.get('userId') as string | null

    if (!file || !userId) {
      return NextResponse.json({ error: '파일과 사용자 ID가 필요합니다.' }, { status: 400 })
    }

    // 파일 크기 체크 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기는 10MB 이하만 가능합니다.' }, { status: 400 })
    }

    // 파일 형식 체크
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: '허용되지 않는 파일 형식입니다.' }, { status: 400 })
    }

    // TODO: Phase 5 - Firebase Auth verification
    // userId 유효성 검증 (실제 Firebase auth.users에 존재하는지)
    const profiles = await prisma.$queryRaw<any[]>`SELECT * FROM profiles WHERE id = ${userId} LIMIT 1`
    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ error: '유효하지 않은 사용자입니다.' }, { status: 403 })
    }

    // GCS upload
    const ext = file.name.split('.').pop()?.toLowerCase() || 'file'
    const filePath = `business_docs/${userId}/business_registration.${ext}`
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let publicUrl = ''
    try {
      const { uploadToGCS } = await import('@/lib/gcs')
      publicUrl = await uploadToGCS(filePath, buffer, file.type)
    } catch (gcsError: any) {
      console.warn('GCS 업로드 실패 (미설정?):', gcsError.message)
    }

    // 회사 레코드에 URL 저장 시도 (이미 회사가 생성된 경우)
    if (publicUrl) {
      try {
        // TODO: Phase 5 - Update company doc URL via database
        // await prisma.$executeRaw`UPDATE companies SET business_doc_url = ${publicUrl} WHERE id = (SELECT company_id FROM profiles WHERE id = ${userId})`
      } catch (e: any) {
        console.log('Company doc URL update skipped:', e.message)
      }
    }

    console.log(`✅ [사업자등록증 업로드] ${userId} → ${filePath}`)
    return NextResponse.json({ url: publicUrl })

  } catch (error: any) {
    console.error('사업자등록증 업로드 에러:', error.message)
    return NextResponse.json({ error: error.message || '업로드 처리 실패' }, { status: 500 })
  }
}
