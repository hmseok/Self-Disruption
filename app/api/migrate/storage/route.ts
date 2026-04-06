import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { Storage } from '@google-cloud/storage'

// POST /api/migrate/storage
// Body: { supabase_key, buckets: string[], prefix?: string, dryRun?: bool, maxFiles?: number }
// 1) Supabase Storage 버킷별 전체 파일 리스트 재귀 조회
// 2) Supabase public URL로 fetch → buffer
// 3) GCS에 `${prefix}/${bucket}/${path}` 로 업로드 (public)
// 4) 매핑 반환: oldUrl → newUrl

const SUPABASE_URL = 'https://uiyiwgkpchnvuvpsjfxv.supabase.co'

let storageInstance: Storage | null = null
function getStorage(): Storage {
  if (storageInstance) return storageInstance
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  if (projectId && clientEmail && privateKey) {
    storageInstance = new Storage({ projectId, credentials: { client_email: clientEmail, private_key: privateKey } })
  } else {
    storageInstance = new Storage({ projectId })
  }
  return storageInstance
}

async function listSupabaseRecursive(sbKey: string, bucket: string, prefix = ''): Promise<Array<{ path: string; size: number }>> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: {
      'apikey': sbKey,
      'Authorization': `Bearer ${sbKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  })
  if (!res.ok) throw new Error(`list ${bucket}/${prefix}: ${res.status}`)
  const items: any[] = await res.json()
  const out: Array<{ path: string; size: number }> = []
  for (const it of items) {
    const fullPath = prefix ? `${prefix}/${it.name}` : it.name
    if (it.id && it.metadata && it.metadata.size !== undefined) {
      out.push({ path: fullPath, size: it.metadata.size })
    } else {
      const sub = await listSupabaseRecursive(sbKey, bucket, fullPath)
      out.push(...sub)
    }
  }
  return out
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const profile = await prisma.$queryRaw<any[]>`SELECT role FROM profiles WHERE id = ${user.id} LIMIT 1`
  if (!profile[0] || profile[0].role !== 'admin') {
    return NextResponse.json({ error: '관리자만 실행 가능' }, { status: 403 })
  }

  let body: any = {}
  try { body = await request.json() } catch {}
  const sbKey: string = body.supabase_key || ''
  const buckets: string[] = Array.isArray(body.buckets) ? body.buckets : []
  const gcsPrefix: string = body.prefix || 'supabase-migration'
  const dryRun: boolean = !!body.dryRun
  const maxFiles: number = Number(body.maxFiles || 0) || 0

  if (!sbKey) return NextResponse.json({ error: 'supabase_key 필요' }, { status: 400 })
  if (buckets.length === 0) return NextResponse.json({ error: 'buckets[] 필요' }, { status: 400 })

  const bucketName = process.env.GCS_BUCKET_NAME
  if (!bucketName) return NextResponse.json({ error: 'GCS_BUCKET_NAME 환경변수 미설정' }, { status: 500 })

  try {
    const storage = getStorage()
    const gcsBucket = storage.bucket(bucketName)

    const results: Record<string, any> = {}
    const urlMap: Array<{ old: string; new: string; path: string; size: number }> = []

    for (const b of buckets) {
      const r: any = { bucket: b }
      try {
        const files = await listSupabaseRecursive(sbKey, b)
        r.totalFiles = files.length
        r.totalMB = +(files.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(2)
        if (dryRun) {
          r.dryRun = true
          r.sample = files.slice(0, 3)
          results[b] = r
          continue
        }

        const limit = maxFiles > 0 ? Math.min(maxFiles, files.length) : files.length
        let uploaded = 0
        let skipped = 0
        const errors: string[] = []
        for (let i = 0; i < limit; i++) {
          const f = files[i]
          try {
            const oldUrl = `${SUPABASE_URL}/storage/v1/object/public/${b}/${f.path}`
            // Fetch from Supabase public URL
            const fetchRes = await fetch(oldUrl)
            if (!fetchRes.ok) throw new Error(`fetch ${fetchRes.status}`)
            const contentType = fetchRes.headers.get('content-type') || 'application/octet-stream'
            const arrayBuf = await fetchRes.arrayBuffer()
            const buffer = Buffer.from(arrayBuf)

            const gcsPath = `${gcsPrefix}/${b}/${f.path}`
            const gcsFile = gcsBucket.file(gcsPath)

            // Check if already exists (idempotency)
            const [exists] = await gcsFile.exists()
            if (exists) {
              const [meta] = await gcsFile.getMetadata()
              if (Number(meta.size) === f.size) {
                skipped++
                urlMap.push({
                  old: oldUrl,
                  new: `https://storage.googleapis.com/${bucketName}/${gcsPath}`,
                  path: f.path,
                  size: f.size,
                })
                continue
              }
            }

            await gcsFile.save(buffer, { contentType, metadata: { contentType } })
            // 균일 액세스 버킷이므로 makePublic() 미사용 — 버킷 IAM(allUsers/objectViewer)으로 공개
            uploaded++
            urlMap.push({
              old: oldUrl,
              new: `https://storage.googleapis.com/${bucketName}/${gcsPath}`,
              path: f.path,
              size: f.size,
            })
          } catch (e: any) {
            errors.push(`${f.path}: ${e.message}`.slice(0, 200))
            if (errors.length >= 5) break
          }
        }
        r.uploaded = uploaded
        r.skipped = skipped
        r.limit = limit
        if (errors.length) r.errors = errors
      } catch (e: any) {
        r.error = e.message
      }
      results[b] = r
    }

    const summary = {
      bucketsProcessed: Object.keys(results).length,
      totalFiles: Object.values(results).reduce((a: number, r: any) => a + (r.totalFiles || 0), 0),
      totalUploaded: Object.values(results).reduce((a: number, r: any) => a + (r.uploaded || 0), 0),
      totalSkipped: Object.values(results).reduce((a: number, r: any) => a + (r.skipped || 0), 0),
      errored: Object.values(results).filter((r: any) => r.error).length,
      urlMapCount: urlMap.length,
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      gcsBucket: bucketName,
      gcsPrefix,
      summary,
      results,
      urlMap: dryRun ? [] : urlMap,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  }
}
