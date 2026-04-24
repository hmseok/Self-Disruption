import { parseSms } from '../lib/sms-parsers.ts'

const cases = [
  { label: 'KB 승인(일시불)', from: '15884000', text: '[KB국민] 홍길동 4/21 14:32 CU편의점 3,500원 일시불 승인', expect: { issuer: 'KB', type: 'approved', amount: 3500, merchant: 'CU편의점' } },
  { label: 'KB 할부', from: '15884000', text: '[KB국민카드] 임성민 10/15 09:21 GS칼텍스주유소 85,000원 3개월 승인', expect: { issuer: 'KB', type: 'approved', amount: 85000, installment: '3개월' } },
  { label: 'KB 취소', from: '15884000', text: '[KB국민] 홍길동 4/21 14:35 CU편의점 3,500원 취소', expect: { issuer: 'KB', type: 'canceled', amount: 3500 } },
  { label: '우리 승인', from: '15881688', text: '[우리카드] 홍*동 04/21 14:32 스타벅스 5,200원 일시불승인 카드****1234', expect: { issuer: 'WOORI', type: 'approved', amount: 5200, merchant: '스타벅스' } },
  { label: '현대 슬래시포맷', from: '16445000', text: '[현대카드M] 홍길동 04/21 14:32 / 3,500원 / CU편의점 / 일시불', expect: { issuer: 'HYUNDAI', type: 'approved', amount: 3500, merchant: 'CU편의점' } },
  { label: '현대 공백포맷', from: '16445000', text: '[현대카드] 홍길동 04/21 14:32 CU편의점 3,500원 일시불 승인', expect: { issuer: 'HYUNDAI', type: 'approved', amount: 3500 } },
  { label: '타 발신번호 + 본문 prefix', from: '01012345678', text: '[KB국민] 홍길동 4/21 14:32 CU편의점 3,500원 일시불 승인', expect: { issuer: 'KB', type: 'approved', amount: 3500 } },
  { label: '알 수 없는 포맷 → null', from: '010', text: '안녕하세요 어쩌구', expect: null },
]

let pass = 0, fail = 0
for (const c of cases) {
  const r = parseSms(c.from, c.text)
  const ok = (() => {
    if (c.expect === null) return r === null
    if (!r) return false
    for (const k of Object.keys(c.expect)) {
      if ((r as any)[k] !== (c.expect as any)[k]) return false
    }
    return true
  })()
  if (ok) { pass++; console.log('✅', c.label) }
  else    { fail++; console.log('❌', c.label); console.log('   expected:', c.expect); console.log('   got     :', r) }
}
console.log(`\n━━━ ${pass}/${cases.length} passed, ${fail} failed ━━━`)
process.exit(fail > 0 ? 1 : 0)
