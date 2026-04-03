// Google Cloud Storage Client (Server-side only)
import { Storage } from '@google-cloud/storage'

let storageInstance: Storage | null = null

function getStorage(): Storage {
  if (storageInstance) return storageInstance

  const bucketName = process.env.GCS_BUCKET_NAME
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID

  if (!bucketName) {
    throw new Error('GCS_BUCKET_NAME 환경변수가 설정되지 않았습니다.')
  }

  // Cloud Run 환경: 자동으로 서비스 계정 사용 (GOOGLE_APPLICATION_CREDENTIALS 또는 기본 인증)
  // 로컬 환경: FIREBASE_ADMIN_PRIVATE_KEY 사용
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL

  if (projectId && clientEmail && privateKey) {
    storageInstance = new Storage({
      projectId,
      credentials: { client_email: clientEmail, private_key: privateKey },
    })
  } else {
    // Google Cloud 환경 기본 인증 사용 (Cloud Run 등)
    storageInstance = new Storage({ projectId })
  }

  return storageInstance
}

export async function uploadToGCS(
  filePath: string,
  fileBuffer: Buffer,
  contentType: string,
  isPublic = true
): Promise<string> {
  const bucketName = process.env.GCS_BUCKET_NAME
  if (!bucketName) throw new Error('GCS_BUCKET_NAME 환경변수가 필요합니다.')

  const storage = getStorage()
  const bucket = storage.bucket(bucketName)
  const file = bucket.file(filePath)

  await file.save(fileBuffer, {
    contentType,
    metadata: { contentType },
  })

  if (isPublic) {
    await file.makePublic()
    return `https://storage.googleapis.com/${bucketName}/${filePath}`
  }

  // Private: signed URL (1시간 유효)
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000,
  })
  return url
}

export async function deleteFromGCS(filePath: string): Promise<void> {
  const bucketName = process.env.GCS_BUCKET_NAME
  if (!bucketName) throw new Error('GCS_BUCKET_NAME 환경변수가 필요합니다.')

  const storage = getStorage()
  const bucket = storage.bucket(bucketName)
  const file = bucket.file(filePath)

  try {
    await file.delete()
  } catch (e: any) {
    // 파일이 없는 경우 무시
    if (e.code !== 404) throw e
  }
}

export const GCS_BUCKET = process.env.GCS_BUCKET_NAME || ''
