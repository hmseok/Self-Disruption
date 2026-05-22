#!/usr/bin/env node
/**
 * harness-engineering/scripts/seed-compliance-content-md.js
 *
 * 라이드 정보보안 매뉴얼 PDF → 마크다운 추출 + ride_compliance_documents.content_md UPDATE.
 * Phase 1.4-fix12 — PDF 모드 + 마크다운 모드 풀세트 통합용.
 *
 * 흐름:
 *   1. ~/WebstormProjects/정보보안/ 의 4개 PDF (RIDE-PMP/M01/M05/M06) 읽기
 *   2. pdf-parse 로 텍스트 레이어 추출
 *   3. 휴리스틱으로 마크다운 변환:
 *      - "제○장 ..."        → ## 제○장 ...
 *      - "제○조 (...)"      → ### 제○조 (...)
 *      - "별첨 ○ ..."        → ## 별첨 ○ ...
 *      - "F-XX-XX ..."       → ## F-XX-XX ... (서식)
 *      - 빈 줄 보존, 페이지 푸터/헤더 정리
 *   4. UPDATE ride_compliance_documents.content_md (4건, idempotent)
 *
 * 사용법:
 *   npm install pdf-parse --save  (최초 1회)
 *   npm run seed:compliance-content-md
 *   또는: node harness-engineering/scripts/seed-compliance-content-md.js
 *
 * 환경변수:
 *   COMPLIANCE_PDF_DIR (옵션, 기본 ~/WebstormProjects/정보보안)
 *   DATABASE_URL (Prisma 연결)
 *
 * 안전:
 *   · 모든 UPDATE 는 doc_code 기반 (PK X — 안전)
 *   · 본문 길이 < 100자면 SKIP (변환 실패 의심)
 *   · 결과 콘솔에 처음 200자 미리보기
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

// 매뉴얼 → PDF 파일 패턴 + 메타
const MANUALS = [
  {
    code: 'RIDE-PMP',
    pattern: /개인정보보호.*내부계획서.*통합본.*2026\.05\.17\.pdf/,
    title: '개인정보보호 내부관리계획서 통합본',
  },
  {
    code: 'RIDE-M01',
    pattern: /개인정보\s*유출대응.*2026\.05\.17\.pdf/,
    title: '개인정보 유출 대응 매뉴얼',
  },
  {
    code: 'RIDE-M05',
    pattern: /개인정보\s*파기관리.*2026\.05\.17\.pdf/,
    title: '개인정보 파기 절차·확인 매뉴얼',
  },
  {
    code: 'RIDE-M06',
    pattern: /개인정보\s*취급단말기.*반출관리.*2026\.05\.17\.pdf/,
    title: '개인정보 취급 단말기 반출관리 매뉴얼',
  },
]

/**
 * PDF 추출 텍스트를 마크다운으로 변환.
 *
 * 휴리스틱 규칙:
 *   1. 페이지 푸터 (페이지 번호 단독 line) 제거
 *   2. 「제○장 ○○」 → `## 제○장 ○○`
 *   3. 「제○조 (○○○)」 또는 「제○조  ○○○」 → `### 제○조 ...`
 *   4. 「별첨 ○ ○○」 또는 「[별첨 ○] ○○」 → `## 별첨 ○ ○○`
 *   5. 「F-XX-XX ○○」 → `## F-XX-XX ○○` (서식 헤더)
 *   6. 「○○ 매뉴얼」 / 「○○ 계획서」 (최상위) → `# ○○`
 *   7. 연속 빈 줄 2개 이상은 1개로 축소
 *   8. 양옆 공백 trim
 */
function pdfTextToMarkdown(rawText, docCode) {
  // 1. line split + 기본 정리
  let lines = rawText.split(/\r?\n/)

  // 2. 페이지 번호 단독 line 제거 (예: "12", "-15-")
  lines = lines.filter(l => {
    const trimmed = l.trim()
    if (!trimmed) return true  // 빈 줄은 보존
    if (/^[-_=]+$/.test(trimmed)) return false  // 구분선
    if (/^-?\s*\d{1,3}\s*-?$/.test(trimmed)) return false  // 페이지 번호
    if (/^\s*Page\s+\d+/i.test(trimmed)) return false
    return true
  })

  // 3. line 단위 변환 — 헤더 패턴 매칭
  const out = []
  let titleDone = false
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const t = raw.trim()
    if (!t) {
      out.push('')
      continue
    }

    // 최상위 제목 (한 번만)
    if (!titleDone) {
      // 매뉴얼 / 내부관리계획서 키워드 + 30자 이하면 # 제목
      if (/(매뉴얼|내부관리계획서|통합본|계획서)/.test(t) && t.length <= 40 && !/^제\d+/.test(t)) {
        out.push(`# ${t}`)
        titleDone = true
        continue
      }
    }

    // "제○장 ○○" 패턴 (제1장, 제 1 장 둘 다 대응)
    const ch = t.match(/^제\s*(\d+)\s*장\s+(.+)$/)
    if (ch) {
      out.push('')
      out.push(`## 제${ch[1]}장 ${ch[2]}`)
      continue
    }

    // "제○조 (○○○)" 또는 "제○조 ○○○"
    const art = t.match(/^제\s*(\d+)\s*조\s*(\([^)]+\))?\s*(.*)$/)
    if (art) {
      const num = art[1]
      const par = art[2] || ''
      const rest = art[3] || ''
      out.push('')
      out.push(`### 제${num}조 ${par}${par && rest ? ' ' : ''}${rest}`.trim())
      continue
    }

    // "별첨 ○ ○○" 또는 "[별첨 ○] ○○"
    const att = t.match(/^\[?\s*별첨\s*(\d+)\]?\s*[-.]?\s*(.+)$/)
    if (att) {
      out.push('')
      out.push(`## 별첨 ${att[1]} ${att[2]}`)
      continue
    }

    // "F-XX-XX ○○" 또는 "F-M01-01 ○○" (서식 코드)
    const form = t.match(/^(F-[A-Z0-9]+-\d+|F-\d+-\d+)\s+(.+)$/)
    if (form) {
      out.push('')
      out.push(`## ${form[1]} ${form[2]}`)
      continue
    }

    // "RIDE-PMP-...-" 등 코드 라인은 메타 (한 줄 라벨)
    if (/^(RIDE-[A-Z0-9-]+|버전\s*V\d|시행\s*\d{4}|개정)/.test(t)) {
      out.push(`> ${t}`)
      continue
    }

    // 일반 본문
    out.push(t)
  }

  // 4. 연속 빈 줄 축소 (3개+ → 1개)
  const compact = []
  let blankCount = 0
  for (const l of out) {
    if (l === '') {
      blankCount++
      if (blankCount <= 1) compact.push('')
    } else {
      blankCount = 0
      compact.push(l)
    }
  }

  return compact.join('\n').trim() + '\n'
}

async function main() {
  console.log('═══ seed-compliance-content-md — PDF → 마크다운 추출 + content_md UPDATE ═══')

  // pdf-parse 동적 require (의존성 누락 graceful)
  let pdfParse
  try {
    pdfParse = require('pdf-parse')
  } catch (e) {
    console.error('❌ pdf-parse 패키지 미설치')
    console.error('   설치: npm install pdf-parse --save')
    console.error(`   (에러: ${e.message})`)
    process.exit(1)
  }

  const pdfDir = process.env.COMPLIANCE_PDF_DIR || path.join(os.homedir(), 'WebstormProjects', '정보보안')
  if (!fs.existsSync(pdfDir)) {
    console.error(`❌ PDF 폴더 미존재: ${pdfDir}`)
    process.exit(1)
  }

  const allFiles = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'))
  console.log(`\n📂 PDF 폴더: ${pdfDir}`)
  console.log(`   파일 ${allFiles.length}개 발견`)

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
    console.error('❌ 매칭되는 PDF 파일 없음')
    process.exit(1)
  }

  console.log(`\n📋 매칭된 매뉴얼 ${targets.length}건:`)
  for (const t of targets) {
    console.log(`  · ${t.code}: ${t.srcFile} (${(t.size / 1024 / 1024).toFixed(2)} MB)`)
  }

  // Prisma 연결
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()

  let extracted = 0
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const t of targets) {
    console.log(`\n▸ ${t.code} 처리 중...`)
    try {
      // 1. PDF 텍스트 추출
      const dataBuffer = fs.readFileSync(t.srcPath)
      const parsed = await pdfParse(dataBuffer)
      const rawText = parsed.text || ''
      const pages = parsed.numpages || 0
      console.log(`  · PDF 페이지 ${pages}, raw 텍스트 ${rawText.length.toLocaleString()} 자`)
      extracted++

      // 2. 마크다운 변환
      const md = pdfTextToMarkdown(rawText, t.code)
      console.log(`  · 마크다운 ${md.length.toLocaleString()} 자 — 미리보기:`)
      const preview = md.slice(0, 200).replace(/\n/g, ' / ')
      console.log(`    "${preview}..."`)

      if (md.length < 100) {
        console.log(`  ⚠ 추출 본문 ${md.length}자 < 100 — SKIP (변환 실패 의심)`)
        skipped++
        continue
      }

      // 3. DB UPDATE
      await prisma.$executeRaw`
        UPDATE ride_compliance_documents
           SET content_md = ${md},
               updated_at = NOW()
         WHERE doc_code = ${t.code}
      `
      console.log(`  ✓ ride_compliance_documents.content_md UPDATE (${t.code})`)
      updated++
    } catch (e) {
      console.error(`  ❌ ${t.code} 오류:`, e.message)
      errors++
    }
  }

  console.log('')
  console.log(`═══ 결과: 추출 ${extracted} / DB UPDATE ${updated} / 스킵 ${skipped} / 오류 ${errors} ═══`)
  console.log('')
  console.log('다음 단계:')
  console.log('  1. /RideCompliance/manuals/RIDE-PMP 진입')
  console.log('  2. PDF 자동 표시 (fix10) + 좌측 섹션 목차 보임 (content_md 채워짐)')
  console.log('  3. 좌측 목차 클릭 → 마크다운 모드 자동 전환 + scroll')
  console.log('  4. 「🤖 2차 검토 (+LLM)」 → Gemini 호출 → 액션 추출 + 승인')

  await prisma.$disconnect()
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
