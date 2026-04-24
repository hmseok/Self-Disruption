// SMS 파서 단위 테스트 (TypeScript 없이 JS 포팅판)
// 실제 소스는 lib/sms-parsers.ts — 여기선 실제 배포 전 검증용

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

// tsx 로 실행하여 실제 ts 파일 직접 import
const testCode = `
import { parseSms } from '../lib/sms-parsers.ts'

const cases = [
  // ── KB ──
  {
    label: 'KB 승인 (일시불)',
    from: '15884000',
    text: '[KB국민] 홍길동 4/21 14:32 CU편의점 3,500원 일시불 승인',
    expect: { issuer: 'KB', type: 'approved', amount: 3500, merchant: 'CU편의점' },
  },
  {
    label: 'KB 할부',
    from: '15884000',
    text: '[KB국민카드] 임성민 10/15 09:21 GS칼텍스주유소 85,000원 3개월 승인',
    expect: { issuer: 'KB', type: 'approved', amount: 85000, installment: '3개월' },
  },
  {
    label: 'KB 취소',
    from: '15884000',
    text: '[KB국민] 홍길동 4/21 14:35 CU편의점 3,500원 취소',
    expect: { issuer: 'KB', type: 'canceled', amount: 3500 },
  },
  // ── 우리 ──
  {
    label: '우리 승인',
    from: '15881688',
    text: '[우리카드] 홍*동 04/21 14:32 스타벅스 5,200원 일시불승인 카드****1234',
    expect: { issuer: 'WOORI', type: 'approved', amount: 5200, merchant: '스타벅스' },
  },
  // ── 현대 (슬래시 포맷) ──
  {
    label: '현대 슬래시포맷 승인',
    from: '16445000',
    text: '[현대카드M] 홍길동 04/21 14:32 / 3,500원 / CU편의점 / 일시불',
    expect: { issuer: 'HYUNDAI', type: 'approved', amount: 3500, merchant: 'CU편의점' },
  },
  {
    label: '현대 공백포맷 승인',
    from: '16445000',
    text: '[현대카드] 홍길동 04/21 14:32 CU편의점 3,500원 일시불 승인',
    expect: { issuer: 'HYUNDAI', type: 'approved', amount: 3500 },
  },
  // ── 알 수 없는 번호 ──
  {
    label: '타 발신번호 + 본문 KB prefix',
    from: '01012345678',
    text: '[KB국민] 홍길동 4/21 14:32 CU편의점 3,500원 일시불 승인',
    expect: { issuer: 'KB', type: 'approved', amount: 3500 },
  },
  {
    label: '알 수 없는 포맷 — null 반환',
    from: '010',
    text: '안녕하세요 어쩌구 저쩌구',
    expect: null,
  },
]

let pass = 0, fail = 0
for (const c of cases) {
  const r = parseSms(c.from, c.text)
  const ok = (() => {
    if (c.expect === null) return r === null
    if (!r) return false
    for (const k of Object.keys(c.expect)) {
      if (r[k] !== c.expect[k]) return false
    }
    return true
  })()
  if (ok) { pass++; console.log('✅', c.label) }
  else    { fail++; console.log('❌', c.label, '\\n   expected:', c.expect, '\\n   got:', r) }
}
console.log(\`\\n━━━ \${pass}/\${cases.length} passed, \${fail} failed ━━━\`)
process.exit(fail > 0 ? 1 : 0)
`

// 임시 ts 파일로 쓰고 tsx 실행
const tmp = path.join(process.cwd(), 'scripts', '_sms_parser_test.tmp.mts')
fs.writeFileSync(tmp, testCode)
try {
  execSync(`npx tsx ${tmp}`, { stdio: 'inherit' })
} finally {
  fs.unlinkSync(tmp)
}
