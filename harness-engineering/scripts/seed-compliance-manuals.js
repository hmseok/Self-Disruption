#!/usr/bin/env node
/**
 * harness-engineering/scripts/seed-compliance-manuals.js
 *
 * 라이드 정보보안 매뉴얼 본문 1회 import script.
 * migrations/_seed/manuals/*.md 파일들을 읽어서
 * ride_compliance_documents.content_md 컬럼에 UPDATE.
 *
 * 매뉴얼 4건 (PDF 추출본 — sandbox 가 작업):
 *   · RIDE-PMP — 개인정보보호 내부관리계획서 통합본 (169KB, 9장 27조)
 *   · RIDE-M01 — 개인정보 유출 대응 매뉴얼 (55KB, 서식 6종)
 *   · RIDE-M05 — 개인정보 파기 절차·확인 매뉴얼 (8KB)
 *   · RIDE-M06 — 개인정보 취급 단말기 반출관리 매뉴얼 (23KB)
 *
 * 미포함 (PDF 원본 없음):
 *   · RIDE-M02 — 라이드케어 비상대응 매뉴얼 BCP
 *   · RIDE-M03 — 정보보호 교육관리 매뉴얼
 *   · RIDE-M04 — 정보보호 점검관리 매뉴얼
 *   → 사용자가 UI 의 매뉴얼 페이지에서 직접 작성
 *
 * 사용법:
 *   node harness-engineering/scripts/seed-compliance-manuals.js
 *
 * 또는 package.json scripts 에 추가 후:
 *   npm run seed:compliance-manuals
 *
 * 사용자 통찰 (2026-05-19): "메뉴얼을 아직도 볼수가 없는데"
 * → sandbox 추출본을 즉시 import 하여 매뉴얼 페이지에서 본문 즉시 열람 가능.
 *
 * 본문은 마크다운 형식 (제N장 → ## , 제N조 → ### , 별첨 → ## , 서식 F-* → ###).
 * 사용자가 UI 에서 「✎ 본문 편집」 으로 추가 정제 가능.
 */

const fs = require('fs')
const path = require('path')

async function main() {
  console.log('═══ seed-compliance-manuals — 매뉴얼 본문 import ═══')

  // Prisma import (lazy — dynamic require)
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()

  const SEED_DIR = path.join(__dirname, '..', '..', 'migrations', '_seed', 'manuals')
  const MANUALS = [
    { code: 'RIDE-PMP', file: 'RIDE-PMP.md', title: '개인정보보호 내부관리계획서 통합본' },
    { code: 'RIDE-M01', file: 'RIDE-M01.md', title: '개인정보 유출 대응 매뉴얼' },
    { code: 'RIDE-M05', file: 'RIDE-M05.md', title: '개인정보 파기 절차·확인 매뉴얼' },
    { code: 'RIDE-M06', file: 'RIDE-M06.md', title: '개인정보 취급 단말기 반출관리 매뉴얼' },
  ]

  let updated = 0
  let skipped = 0
  let errors = 0

  for (const m of MANUALS) {
    const filePath = path.join(SEED_DIR, m.file)
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠ 파일 누락: ${m.file} (${m.code})`)
      skipped++
      continue
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    const bytes = Buffer.byteLength(content, 'utf-8')

    try {
      // 매뉴얼 row 존재 확인
      const rows = await prisma.$queryRaw`
        SELECT id, doc_code, is_master_verified
          FROM ride_compliance_documents
         WHERE doc_code = ${m.code} LIMIT 1
      `
      if (!rows.length) {
        console.log(`  ⚠ DB row 미존재: ${m.code} — Phase 1.2 마이그 미적용?`)
        errors++
        continue
      }
      const row = rows[0]

      // 이미 content_md 가 있는지 확인
      const existing = await prisma.$queryRaw`
        SELECT CHAR_LENGTH(content_md) AS len
          FROM ride_compliance_documents
         WHERE doc_code = ${m.code} LIMIT 1
      `
      const existingLen = existing[0]?.len || 0

      if (existingLen > 100) {
        console.log(`  ⚠ ${m.code} 이미 본문 있음 (${existingLen.toLocaleString()} chars) — overwrite 하려면 OVERWRITE=1 환경변수 설정`)
        if (!process.env.OVERWRITE) {
          skipped++
          continue
        }
      }

      // UPDATE
      await prisma.$executeRaw`
        UPDATE ride_compliance_documents
           SET content_md = ${content},
               updated_at = NOW()
         WHERE doc_code = ${m.code}
      `
      console.log(`  ✓ ${m.code}: ${bytes.toLocaleString()} bytes → DB UPDATE${row.is_master_verified === 1 ? ' (이미 검수 완료 — 재검수 필요 시 「자료실」 탭에서 처리)' : ''}`)
      updated++
    } catch (e) {
      console.error(`  ❌ ${m.code} 오류:`, e.message || e)
      errors++
    }
  }

  console.log('')
  console.log(`═══ 결과: 갱신 ${updated} / 스킵 ${skipped} / 오류 ${errors} ═══`)
  console.log('')
  console.log('다음 단계:')
  console.log('  1. /RideCompliance/manuals/RIDE-PMP 진입 → 본문 즉시 열람')
  console.log('  2. CPO 가 자료실 탭에서 ✓ 검수 (본문 import 후 검수 필요)')
  console.log('  3. RIDE-M02 / M03 / M04 는 UI 의 「✎ 본문 편집」 으로 직접 작성')

  await prisma.$disconnect()
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
