import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { Storage } from '@google-cloud/storage'

// GET /api/migrate/gcs-test — GCS_BUCKET_NAME 버킷에 직접 테스트 파일 쓰기/읽기/삭제
// 환경/권한 문제를 한 방에 진단.

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const profile = await prisma.$queryRaw<any[]>`SELECT role FROM profiles WHERE id = ${user.id} LIMIT 1`
  if (!profile[0] || profile[0].role !== 'admin') {
    return NextResponse.json({ error: '관리자만 실행 가능' }, { status: 403 })
  }

  const bucketName = process.env.GCS_BUCKET_NAME
  if (!bucketName) return NextResponse.json({ error: 'GCS_BUCKET_NAME 미설정' }, { status: 500 })

  const steps: any[] = []
  const t0 = Date.now()
  try {
    steps.push({ step: 'init storage', ts: Date.now() - t0 })
    const storage = new Storage()
    steps.push({ step: 'get bucket ref', ts: Date.now() - t0 })
    const bucket = storage.bucket(bucketName)

    steps.push({ step: 'bucket.exists()', ts: Date.now() - t0 })
    const [exists] = await bucket.exists()
    steps.push({ step: `exists=${exists}`, ts: Date.now() - t0 })

    if (!exists) {
      return NextResponse.json({ ok: false, bucketName, exists: false, steps, note: '버킷이 없거나 접근 불가' })
    }

    const testPath = `_healthcheck/${Date.now()}.txt`
    const testContent = Buffer.from(`healthcheck ${new Date().toISOString()}`)

    steps.push({ step: 'file.save()', ts: Date.now() - t0 })
    const file = bucket.file(testPath)
    await file.save(testContent, { contentType: 'text/plain' })
    steps.push({ step: 'saved', ts: Date.now() - t0 })

    steps.push({ step: 'makePublic()', ts: Date.now() - t0 })
    try {
      await file.makePublic()
      steps.push({ step: 'madePublic', ts: Date.now() - t0 })
    } catch (e: any) {
      steps.push({ step: 'makePublic failed: ' + e.message, ts: Date.now() - t0 })
    }

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${testPath}`
    steps.push({ step: 'delete()', ts: Date.now() - t0 })
    await file.delete()
    steps.push({ step: 'deleted', ts: Date.now() - t0 })

    return NextResponse.json({
      ok: true,
      bucketName,
      testPath,
      publicUrl,
      totalMs: Date.now() - t0,
      steps,
    })
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      bucketName,
      error: e.message,
      code: e.code,
      totalMs: Date.now() - t0,
      steps,
    }, { status: 500 })
  }
}
