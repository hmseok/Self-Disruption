/**
 * /api/ride-compliance/consistency-check
 *
 * GET — 매뉴얼 간 정합성 검사 (cross-reference lint).
 *       사용자 통찰 (2026-05-19): "각 매뉴얼간의 오류체크도 가능해야합니다"
 *
 * 검증 규칙 (rules):
 *   1. people     — 인명·직책 일관성 (CPO 임성민 / 관리자 석호민·양재희 모든 매뉴얼 동일)
 *   2. forms      — 서식 번호 (F-M01-01 등) 참조 정합 (실제 documents 에 존재?)
 *   3. clauses    — 조항 번호 (제N조 / 제N장) 참조 범위 (통합본 제1조~제33조 안?)
 *   4. dates      — 시행일 (V1.0 시행 2026.05.20) 모든 매뉴얼 일관?
 *   5. frequency  — 빈도 표기 (연 N회 / 분기 / 반기) 모순 검출
 *   6. orphans    — 매뉴얼 검수 완료됐지만 본문 미입력
 *   7. coverage   — 통합본에서 인용된 매뉴얼·서식이 모두 catalog 에 있는가?
 *
 * manager+ 권한.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/ride-compliance-perm'

interface Issue {
  severity: 'error' | 'warning' | 'info'
  category: string
  message: string
  doc_codes: string[]
  detail?: string
}

interface DocRow {
  doc_code: string
  doc_type: string
  title: string
  content_md: string | null
  effective_date: string | null
  is_master_verified: number
  status: string
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: { issues: [] }, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, data: { issues: [] }, error: 'forbidden — manager+ only' }, { status: 403 })
  }

  try {
    const docs = await prisma.$queryRaw<DocRow[]>`
      SELECT doc_code, doc_type, title, content_md, effective_date, is_master_verified, status
        FROM ride_compliance_documents
       ORDER BY sort_order ASC
    `

    const issues: Issue[] = []
    const stats = {
      total_docs: docs.length,
      manuals: docs.filter(d => d.doc_type === 'manual').length,
      forms: docs.filter(d => d.doc_type === 'form').length,
      with_content: docs.filter(d => d.content_md && d.content_md.length > 100).length,
      verified: docs.filter(d => d.is_master_verified === 1).length,
    }

    // 매뉴얼 본문 모음 — 텍스트 검사용
    const manualsWithContent = docs.filter(d => d.doc_type === 'manual' && d.content_md && d.content_md.length > 100)
    const allFormCodes = new Set(docs.filter(d => d.doc_type === 'form').map(d => d.doc_code))

    // ─────────────────────────────────────────────
    // 1. 인명 일관성 — CPO 임성민 / 관리자 석호민·양재희
    // ─────────────────────────────────────────────
    const expectedPeople = ['임성민', '석호민', '양재희']
    for (const doc of manualsWithContent) {
      const content = doc.content_md || ''
      // 매뉴얼 본문에서 사람 이름 발견 — 다른 이름과 충돌하는지?
      const mentioned = expectedPeople.filter(name => content.includes(name))
      // 미등록 인명 발견? (한국 이름 3자 패턴)
      const namesPattern = /(?<![가-힣])([가-힣]{2,3})\s*(이사|부장|차장|과장|대리|주임)/g
      const foundUnexpected: string[] = []
      let m: RegExpExecArray | null
      while ((m = namesPattern.exec(content)) !== null) {
        const name = m[1]
        if (!expectedPeople.includes(name)) {
          foundUnexpected.push(`${name} ${m[2]}`)
        }
      }
      if (foundUnexpected.length > 0) {
        issues.push({
          severity: 'warning',
          category: 'people',
          message: `${doc.doc_code}: 매뉴얼 외 인명 발견 — ${[...new Set(foundUnexpected)].slice(0, 3).join(', ')}`,
          doc_codes: [doc.doc_code],
          detail: '제6조 명시 인원 (임성민·석호민·양재희) 외 다른 임원/직원이 본문에 등장. 인사 변동 또는 오기 가능성 — 확인 필요.',
        })
      }
      // 통합본에는 3명 모두 있어야
      if (doc.doc_code === 'RIDE-PMP') {
        const missing = expectedPeople.filter(p => !content.includes(p))
        if (missing.length > 0) {
          issues.push({
            severity: 'error',
            category: 'people',
            message: `RIDE-PMP 통합본에 누락 인명: ${missing.join(', ')}`,
            doc_codes: ['RIDE-PMP'],
            detail: '매뉴얼 제6조에 명시된 책임자·관리자가 통합본 본문에 누락. 본문 검수 필요.',
          })
        }
      }
    }

    // ─────────────────────────────────────────────
    // 2. 서식 참조 정합 — F-M01-01 등이 catalog 에 등록됐는가?
    // ─────────────────────────────────────────────
    for (const doc of manualsWithContent) {
      const content = doc.content_md || ''
      // F-M01-01, F-M02-04, F-14-1, F-06, F-07 등 모든 서식 코드 추출
      const formPattern = /\bF-(?:M\d{2}-\d{2}|14-\d|\d{2})\b/g
      const found = new Set<string>()
      let m: RegExpExecArray | null
      while ((m = formPattern.exec(content)) !== null) {
        found.add(m[0])
      }
      // catalog 에 없는 서식 참조?
      const missingForms = [...found].filter(code => !allFormCodes.has(code))
      if (missingForms.length > 0) {
        issues.push({
          severity: 'error',
          category: 'forms',
          message: `${doc.doc_code}: catalog 미등록 서식 인용 — ${missingForms.join(', ')}`,
          doc_codes: [doc.doc_code],
          detail: '매뉴얼 본문이 참조하는 서식이 documents 테이블에 등록되지 않음. catalog 추가 또는 본문 정정 필요.',
        })
      }
    }

    // ─────────────────────────────────────────────
    // 3. 조항 번호 참조 — 제N조 (제1조~제33조)
    // ─────────────────────────────────────────────
    const MAX_CLAUSE = 33 // 매뉴얼 통합본 5.17 의 마지막 조항
    for (const doc of manualsWithContent) {
      const content = doc.content_md || ''
      const clausePattern = /제(\d{1,3})조/g
      const outOfRange: number[] = []
      let m: RegExpExecArray | null
      while ((m = clausePattern.exec(content)) !== null) {
        const n = parseInt(m[1], 10)
        if (n > MAX_CLAUSE && n < 100) outOfRange.push(n)  // 100+ 은 개인정보보호법 인용 가능 (제29조·제31조 등)
      }
      const uniqOut = [...new Set(outOfRange)]
      if (uniqOut.length > 0) {
        issues.push({
          severity: 'warning',
          category: 'clauses',
          message: `${doc.doc_code}: 범위 외 조항 인용 (통합본 제1~${MAX_CLAUSE}조) — ${uniqOut.slice(0, 5).map(n => `제${n}조`).join(', ')}`,
          doc_codes: [doc.doc_code],
          detail: '통합본의 마지막 조항 번호를 초과. 개인정보보호법 인용일 수도 있고, 오기일 수도 — 본문 확인.',
        })
      }
    }

    // ─────────────────────────────────────────────
    // 4. 시행일 일관성 — V1.0 모두 2026.05.20?
    // ─────────────────────────────────────────────
    const expectedDate = '2026-05-20'
    for (const doc of docs.filter(d => d.doc_type === 'manual')) {
      if (doc.effective_date) {
        const dateStr = (doc.effective_date as unknown as string).slice(0, 10)
        if (dateStr !== expectedDate) {
          issues.push({
            severity: 'warning',
            category: 'dates',
            message: `${doc.doc_code}: 시행일 불일치 — ${dateStr} (기대치 ${expectedDate})`,
            doc_codes: [doc.doc_code],
            detail: 'V1.0 시행일은 모든 매뉴얼이 2026-05-20 동일해야. 다르면 versions 테이블 검토.',
          })
        }
      }
    }

    // ─────────────────────────────────────────────
    // 5. 빈도 표기 모순 — 같은 활동의 빈도가 매뉴얼 간 다른지
    // ─────────────────────────────────────────────
    // 교육 빈도: 통합본 제22~23조 = 연 2회. 다른 매뉴얼도 동일?
    // (현재는 통합본만 검사 — 향후 정교화)
    // 자체감사 빈도: 반기 1회 (제20조)
    // 파기 빈도: 분기 1회 (제28~33조)
    const pmp = manualsWithContent.find(d => d.doc_code === 'RIDE-PMP')
    if (pmp) {
      const content = pmp.content_md || ''
      // 매년 또는 연 2회 명시 (교육)
      if (!/연\s*2\s*회|매년\s*\d\s*회/.test(content)) {
        issues.push({
          severity: 'info',
          category: 'frequency',
          message: 'RIDE-PMP 통합본에 교육 빈도 (연 2회) 명시가 약함',
          doc_codes: ['RIDE-PMP'],
          detail: '제22~23조의 "연 2회 이상" 표기 확인.',
        })
      }
    }

    // ─────────────────────────────────────────────
    // 6. 검수 완료됐지만 본문 미입력
    // ─────────────────────────────────────────────
    for (const doc of docs.filter(d => d.doc_type === 'manual' && d.is_master_verified === 1)) {
      if (!doc.content_md || doc.content_md.length < 100) {
        issues.push({
          severity: 'warning',
          category: 'orphans',
          message: `${doc.doc_code}: 검수 완료 상태이지만 본문 미입력`,
          doc_codes: [doc.doc_code],
          detail: 'is_master_verified=1 인데 content_md 가 비어있음 — 검수 절차 문제 또는 본문 import 누락.',
        })
      }
    }

    // ─────────────────────────────────────────────
    // 7. coverage — 매뉴얼이 인용하는 매뉴얼 코드가 catalog 에 있는가?
    // ─────────────────────────────────────────────
    const allManualCodes = new Set(docs.filter(d => d.doc_type === 'manual').map(d => d.doc_code))
    for (const doc of manualsWithContent) {
      const content = doc.content_md || ''
      const manualPattern = /\bRIDE-M\d{2}\b|\bRIDE-PMP\b/g
      const found = new Set<string>()
      let m: RegExpExecArray | null
      while ((m = manualPattern.exec(content)) !== null) {
        if (m[0] !== doc.doc_code) found.add(m[0])  // 자기 자신 제외
      }
      const missing = [...found].filter(code => !allManualCodes.has(code))
      if (missing.length > 0) {
        issues.push({
          severity: 'error',
          category: 'coverage',
          message: `${doc.doc_code}: catalog 미등록 매뉴얼 인용 — ${missing.join(', ')}`,
          doc_codes: [doc.doc_code, ...missing],
          detail: '본문이 다른 매뉴얼을 인용하는데 그 매뉴얼이 documents 테이블에 없음.',
        })
      }
    }

    // 정합성 점수 — 100점 만점 기준 (error 10점·warning 3점·info 1점 차감)
    const errorCnt = issues.filter(i => i.severity === 'error').length
    const warningCnt = issues.filter(i => i.severity === 'warning').length
    const infoCnt = issues.filter(i => i.severity === 'info').length
    const score = Math.max(0, 100 - errorCnt * 10 - warningCnt * 3 - infoCnt * 1)

    return NextResponse.json({
      success: true,
      data: {
        issues,
        stats: {
          ...stats,
          error: errorCnt,
          warning: warningCnt,
          info: infoCnt,
          score,
        },
      },
      meta: { checked_at: new Date().toISOString() },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist") || err.message?.includes('Unknown column')) {
      return NextResponse.json({
        success: true, data: { issues: [], stats: {} },
        meta: { _migration_pending: 'phase13' },
      })
    }
    console.error('[/api/ride-compliance/consistency-check GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: { issues: [] }, error: String(err.message) }, { status: 500 })
  }
}
