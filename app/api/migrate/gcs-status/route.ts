import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { Storage } from '@google-cloud/storage'

// GET /api/migrate/gcs-status
// 현재 GCS 설정 + 버킷 목록 + 현재 bucket 파일 현황 반환 (admin 전용)

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const profile = await prisma.$queryRaw<any[]>`SELECT role FROM profiles WHERE id = ${user.id} LIMIT 1`
  if (!profile[0] || profile[0].role !== 'admin') {
    return NextResponse.json({ error: '관리자만 실행 가능' }, { status: 403 })
  }

  const env = {
    GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME || null,
    FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID || null,
    hasServiceAccountKey: !!process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    hasClientEmail: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  }

  try {
    const projectId = env.FIREBASE_ADMIN_PROJECT_ID || undefined
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL

    const storage = (projectId && clientEmail && privateKey)
      ? new Storage({ projectId, credentials: { client_email: clientEmail, private_key: privateKey } })
      : new Storage({ projectId })

    // List all buckets in project
    const [allBuckets] = await storage.getBuckets()
    const bucketList = allBuckets.map(b => ({
      name: b.name,
      location: (b.metadata as any).location,
      storageClass: (b.metadata as any).storageClass,
      created: (b.metadata as any).timeCreated,
    }))

    // Per-bucket file summary
    const bucketDetails: Record<string, any> = {}
    for (const b of allBuckets) {
      try {
        const [files] = await b.getFiles({ maxResults: 10000 })
        const totalBytes = files.reduce((a, f) => a + Number((f.metadata as any).size || 0), 0)
        // Group by top-level prefix
        const prefixCounts: Record<string, number> = {}
        for (const f of files) {
          const top = (f.name.split('/')[0] || '(root)')
          prefixCounts[top] = (prefixCounts[top] || 0) + 1
        }
        bucketDetails[b.name] = {
          fileCount: files.length,
          totalMB: +(totalBytes / 1024 / 1024).toFixed(2),
          topLevelPrefixes: prefixCounts,
          samples: files.slice(0, 5).map(f => ({ name: f.name, size: (f.metadata as any).size })),
        }
      } catch (e: any) {
        bucketDetails[b.name] = { error: e.message }
      }
    }

    return NextResponse.json({
      ok: true,
      env,
      buckets: bucketList,
      bucketDetails,
      recommendations: {
        currentBucket: env.GCS_BUCKET_NAME,
        suggestedPrefix: 'supabase-migration',
        note: 'supabase-migration/ 프리픽스로 분리 업로드하면 기존 파일과 섞이지 않음',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, env, error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 })
  }
}
