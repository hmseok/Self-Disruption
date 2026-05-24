// ═══════════════════════════════════════════════════════════════════
// lib/aligo.ts — 알리고(Aligo) SMS 발송 단일 진입점
//
// 직원 근무표 배포(CX-KPI-21)용. 수신자별 다른 메시지를 보내는
// send_mass API 를 사용한다 (직원마다 본인 일정·링크가 다르므로).
//
// 환경변수 (Cloud Run 에 설정 필요):
//   · ALIGO_API_KEY  — 알리고 API 키
//   · ALIGO_USER_ID  — 알리고 사용자 ID
//   · ALIGO_SENDER   — 발신번호 (알리고에 사전 등록된 번호)
//
// 안전장치 (CLAUDE.md 규칙 3):
//   · testmode=true → testmode_yn=Y — 알리고가 검증만, 실발송·과금 없음 (dry-run)
//   · send_mass 1회 호출 (수신자 루프 아님) — batch 안전
//   · MAX_RECIPIENTS 가드
// ═══════════════════════════════════════════════════════════════════

const ALIGO_SEND_MASS_URL = 'https://apis.aligo.in/send_mass/'
// 1회 호출 최대 수신자 — 알리고 send_mass 한도(500) 내 보수적 가드
export const ALIGO_MAX_RECIPIENTS = 200

export interface AligoMassItem {
  phone: string    // 수신번호
  message: string  // 해당 수신자 메시지
}

export interface AligoSendResult {
  ok: boolean
  result_code: number
  message: string
  success_cnt: number
  error_cnt: number
  testmode: boolean
  raw: unknown
}

// 환경변수 3종이 모두 설정됐는지
export function aligoConfigured(): boolean {
  return !!(
    process.env.ALIGO_API_KEY &&
    process.env.ALIGO_USER_ID &&
    process.env.ALIGO_SENDER
  )
}

// 전화번호 정규화 — 숫자만 (010-1234-5678 → 01012345678)
export function normalizePhone(raw: string | null | undefined): string {
  return String(raw || '').replace(/[^0-9]/g, '')
}

// 한국 휴대폰 번호 형식 간이 검증 (010/011 등 10~11자리)
export function isValidPhone(raw: string | null | undefined): boolean {
  const p = normalizePhone(raw)
  return /^01[016789]\d{7,8}$/.test(p)
}

// 메시지 바이트 길이 (한글 2바이트 — 알리고 SMS/LMS 분기 기준)
export function msgBytes(s: string): number {
  let n = 0
  for (const ch of String(s || '')) n += ch.charCodeAt(0) > 0x7f ? 2 : 1
  return n
}

/**
 * 수신자별 다른 메시지를 일괄 발송 (알리고 send_mass).
 *
 * @param items    [{ phone, message }] — 최대 ALIGO_MAX_RECIPIENTS
 * @param opts.title    LMS 제목
 * @param opts.testmode true 면 testmode_yn=Y (검증만, 실발송·과금 없음)
 * @throws 환경변수 미설정 / 수신자 0 / 한도 초과 시
 */
export async function sendMass(
  items: AligoMassItem[],
  opts: { title: string; testmode: boolean },
): Promise<AligoSendResult> {
  if (!aligoConfigured()) {
    throw new Error('알리고 환경변수(ALIGO_API_KEY / ALIGO_USER_ID / ALIGO_SENDER)가 설정되지 않았습니다.')
  }
  const valid = items.filter(it => it && it.phone && it.message)
  if (valid.length === 0) {
    throw new Error('발송할 수신자가 없습니다.')
  }
  if (valid.length > ALIGO_MAX_RECIPIENTS) {
    throw new Error(`수신자 ${valid.length}명 — 1회 최대 ${ALIGO_MAX_RECIPIENTS}명까지 발송할 수 있습니다.`)
  }

  // 가장 긴 메시지로 SMS/LMS 판정 (90바이트 초과 → LMS)
  const longest = valid.reduce((m, it) => Math.max(m, msgBytes(it.message)), 0)
  const msgType = longest > 90 ? 'LMS' : 'SMS'

  const form = new URLSearchParams()
  form.set('key', String(process.env.ALIGO_API_KEY))
  form.set('user_id', String(process.env.ALIGO_USER_ID))
  form.set('sender', normalizePhone(process.env.ALIGO_SENDER))
  form.set('msg_type', msgType)
  if (msgType === 'LMS') form.set('title', opts.title.slice(0, 44))
  form.set('testmode_yn', opts.testmode ? 'Y' : 'N')
  form.set('cnt', String(valid.length))
  valid.forEach((it, i) => {
    form.set(`rec_${i + 1}`, normalizePhone(it.phone))
    form.set(`msg_${i + 1}`, it.message)
  })

  let raw: any
  try {
    const res = await fetch(ALIGO_SEND_MASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    raw = await res.json()
  } catch (e: any) {
    throw new Error(`알리고 호출 실패: ${e?.message || e}`)
  }

  const resultCode = Number(raw?.result_code ?? raw?.resultCode ?? -1)
  return {
    ok: resultCode === 1,
    result_code: resultCode,
    message: String(raw?.message ?? ''),
    success_cnt: Number(raw?.success_cnt ?? 0),
    error_cnt: Number(raw?.error_cnt ?? 0),
    testmode: opts.testmode,
    raw,
  }
}
