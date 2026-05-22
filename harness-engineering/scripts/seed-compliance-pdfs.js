#!/usr/bin/env node
/**
 * harness-engineering/scripts/seed-compliance-pdfs.js
 *
 * 라이드 정보보안 매뉴얼 PDF 원본 1회 GCS 업로드 + DB 등록 script.
 * ~/WebstormProjects/정보보안/ 의 4개 PDF 를 GCS_COMPLIANCE_BUCKET 에 업로드 후
 * ride_compliance_documents.gcs_object_path 컬럼에 UPDATE.
 *
 * 매뉴얼 4건:
 *   · RIDE-PMP — (초안)개인정보보호 내부계획서 및 매뉴얼 통합본_2026.05.17.pdf (16.7 MB)
 *   · RIDE-M01 — (초안)개인정보 유출대응 매뉴얼_2026.05.17.pdf (7.9 MB)
 *   · RIDE-M05 — (초안)개인정보 파기관리 매뉴얼_2026.05.17.pdf (1.4 MB)
 *   · RIDE-M06 — (초안)개인정보 취급단말기 반출관리 매뉴얼_2026.05.17.pdf (4.1 MB)
 *
 * 사용법:
 *   GCS_COMPLIANCE_BUCKET=fmi-compliance-docs node harness-engineering/scripts/seed-compliance-pdfs.js
 *
 * 또는 npm run:
 *   npm run seed:compliance-pdfs
 *
 * 환경변수:
 *   GCS_COMPLIANCE_BUCKET (필수)
 *   COMPLIANCE_PDF_DIR (옵션, 기본 ~/WebstormProjects/정보보안)
 *   DATABASE_URL (Prisma 연결)
 *
 * 사전 조건:
 *   1. GCS 버킷 생성 + Storage Object Admin 권한
 *   2. gcloud auth application-default login (local) 또는 Cloud Run ADC
 *   3. Phase 1.3 마이그 적용 완료 (gcs_object_path 컬럼 존재)
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

async function main() {
  console.log('═══ seed-compliance-pdfs — PDF 원본 GCS 업로드 + DB 등록 ═══')

  const bucketName = process.env.GCS_COMPLIANCE_BUCKET
  if (!bucketName) {
    console.error('❌ GCS_COMPLIANCE_BUCKET 환경변수 미설정')
    console.error('   사용: GCS_COMPLIANCE_BUCKET=fmi-compliance-docs npm run seed:compliance-pdfs')
    process.exit(1)
  }

  const pdfDir = process.env.COMPLIANCE_PDF_DIR || path.join(os.homedir(), 'WebstormProjects', '정보보안')
  if (!fs.existsSync(pdfDir)) {
    console.error(`❌ PDF 폴더 미존재: ${pdfDir}`)
    console.error('   COMPLIANCE_PDF_DIR 환경변수로 다른 경로 지정 가능')
    process.exit(1)
  }

  // 매뉴얼 → 파일 매핑 (5.17 기준)
  const MANUALS = [
    { code: 'RIDE-PMP', pattern: /개인정보보호.*내부계획서.*통합본.*2026\.05\.17\.pdf/, title: '개인정보보호 내부관리계획서 통합본' },
    { code: 'RIDE-M01', pattern: /개인정보\s*유출대응.*2026\.05\.17\.pdf/, title: '개인정보 유출 대응 매뉴얼' },
    { code: 'RIDE-M05', pattern: /개인정보\s*파기관리.*2026\.05\.17\.pdf/, title: '개인정보 파기 절차·확인 매뉴얼' },
    { code: 'RIDE-M06', pattern: /개인정보\s*취급단말기.*반출관리.*2026\.05\.17\.pdf/, title: '개인정보 취급 단말기 반출관리 매뉴얼' },
  ]

  // 폴더의 모든 PDF 파일
  const allFiles = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'))

  // 매뉴얼 → 실제 파일 매칭
  const targets = []
  for (const m of MANUALS) {
    const match = allFiles.find(f => m.pattern.test(f))
    if (!match) {
      console.log(`  ⚠ 미발견: ${m.code} (${m.title}) — pattern ${m.pattern}`)
      continue
    }
    const srcPath = path.join(pdfDir, match)
    const size = fs.statSync(srcPath).size
    targets.push({ ...m, srcFile: match, srcPath, size })
  }

  if (targets.length === 0) {
    console.error('❌ 매칭되는 PDF 파일 없음 — COMPLIANCE_PDF_DIR 확인')
    process.exit(1)
  }

  console.log(`\n📂 매칭된 매뉴얼 ${targets.length}건:`)
  for (const t of targets) {
    console.log(`  · ${t.code}: ${t.srcFile} (${(t.size / 1024 / 1024).toFixed(1)} MB)`)
  }

  // GCS 업로드
  const { Storage } = require('@google-cloud/storage')
  const storage = new Storage()
  const bucket = storage.bucket(bucketName)

  // Prisma
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()

  let uploaded = 0
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const t of targets) {
    const ts = Date.now()
    const safeName = `original_2026-05-17.pdf`
    const objectPath = `compliance/${t.code}/${ts}_${safeName}`

    try {
      console.log(`\n☁️  업로드: ${t.code} → gs://${bucketName}/${objectPath}`)
      await bucket.upload(t.srcPath, {
        destination: objectPath,
        contentType: 'application/pdf',
        metadata: { metadata: { doc_code: t.code, source: 'sandbox-seed', original_name: t.srcFile } },
      })
      uploaded++

      // DB UPDATE — gcs_object_path 갱신
      await prisma.$executeRaw`
        UPDATE ride_compliance_documents
           SET gcs_object_path = ${objectPath}, updated_at = NOW()
         WHERE doc_code = ${t.code}
      `
      console.log(`  ✓ DB UPDATE: ${t.code}.gcs_object_path = ${objectPath}`)
      updated++
    } catch (e) {
      console.error(`  ❌ ${t.code} 오류:`, e.message)
      errors++
    }
  }

  console.log('')
  console.log(`═══ 결과: 업로드 ${uploaded} / DB UPDATE ${updated} / 스킵 ${skipped} / 오류 ${errors} ═══`)
  console.log('')
  console.log('다음 단계:')
  console.log('  1. /RideCompliance/manuals/RIDE-PMP 진입')
  console.log('  2. 본문 카드 헤더 「📄 PDF」 토글 → 원본 PDF iframe 표시')
  console.log('  3. CPO 검수 (자료실 탭)')

  await prisma.$disconnect()
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
