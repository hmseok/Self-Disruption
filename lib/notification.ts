// ═══════════════════════════════════════════════════════════════════
// lib/notification.ts
//
//   N-53 (2026-05-17) — 솔라피 (CoolSMS) 기반 카카오 알림톡 + SMS 통합 wrapper
//
//   동작 우선순위:
//   1. 환경변수 미설정 → 「발송 skip」 + 결과 객체 반환 (운영자 수동 공유)
//   2. KAKAO_TEMPLATE_ID 있음 + 카카오 비즈니스 채널 셋팅됨 → 알림톡 발송
//   3. 알림톡 실패 또는 템플릿 ID 없음 → SMS fallback
//
//   환경변수:
//   - SOLAPI_API_KEY        : 솔라피 API 키
//   - SOLAPI_API_SECRET     : 솔라피 API 시크릿
//   - SOLAPI_FROM_PHONE     : 발신번호 (예: '0212345678' — 회사 대표번호 인증 필요)
//   - KAKAO_PFID            : 카카오 비즈니스 채널 PFID (선택 — 알림톡 시)
//   - KAKAO_TEMPLATE_ID     : 알림톡 템플릿 ID (선택 — 알림톡 시)
//
//   솔라피 가입 + 발신번호 인증 안내:
//     https://solapi.com → 회원가입 → API 키 발급
//     발신번호 인증 (회사 대표번호) → 1일 소요
//
//   카카오 비즈니스 채널 + 알림톡 템플릿 안내:
//     https://business.kakao.com → 비즈니스 채널 → 카카오 알림톡
//     템플릿 작성 후 카카오 심사 (3~5일)
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto'

export interface NotificationResult {
  success: boolean
  channel: 'kakao' | 'sms' | 'skipped'
  messageId?: string
  error?: string
  reason?: string  // skipped 시 사유
}

export interface SendOptions {
  toPhone: string                      // 받는 사람 번호 (010-1234-5678 또는 01012345678)
  text: string                         // SMS / 알림톡 본문
  templateVars?: Record<string, string> // 알림톡 변수 (#{이름}, #{링크} 등)
  templateId?: string                  // 특정 템플릿 (없으면 환경변수 디폴트)
}

/**
 * 솔라피 API 인증 헤더 생성 (HMAC-SHA256)
 */
function buildSolapiAuth(apiKey: string, apiSecret: string): string {
  const date = new Date().toISOString()
  const salt = crypto.randomBytes(16).toString('hex')
  const data = date + salt
  const signature = crypto.createHmac('sha256', apiSecret).update(data).digest('hex')
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`
}

/**
 * 전화번호 정규화 — 010-1234-5678 / +82 10 1234 5678 → 01012345678
 */
function normalizePhone(phone: string): string {
  const digits = String(phone || '').replace(/[^\d]/g, '')
  if (digits.startsWith('82')) return '0' + digits.slice(2)
  return digits
}

/**
 * 카카오 알림톡 또는 SMS 발송 (자동 fallback)
 *
 * @param opts - 받는 사람 + 메시지 + 템플릿 변수
 * @returns 발송 결과 (success / channel / messageId)
 */
export async function sendKakaoOrSms(opts: SendOptions): Promise<NotificationResult> {
  const apiKey = process.env.SOLAPI_API_KEY
  const apiSecret = process.env.SOLAPI_API_SECRET
  const fromPhone = process.env.SOLAPI_FROM_PHONE
  const pfId = process.env.KAKAO_PFID
  const defaultTemplate = process.env.KAKAO_TEMPLATE_ID
  const templateId = opts.templateId || defaultTemplate

  // 환경변수 미설정 — 발송 skip
  if (!apiKey || !apiSecret || !fromPhone) {
    return {
      success: false,
      channel: 'skipped',
      reason: '솔라피 환경변수 미설정 (SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_FROM_PHONE)',
    }
  }

  const to = normalizePhone(opts.toPhone)
  if (!to || to.length < 10) {
    return {
      success: false,
      channel: 'skipped',
      reason: `유효하지 않은 전화번호: ${opts.toPhone}`,
    }
  }

  const authHeader = buildSolapiAuth(apiKey, apiSecret)

  // 1차 — 카카오 알림톡 시도 (템플릿 ID 있을 때만)
  if (templateId && pfId) {
    try {
      const body = {
        message: {
          to,
          from: fromPhone,
          type: 'ATA',  // 알림톡
          kakaoOptions: {
            pfId,
            templateId,
            variables: opts.templateVars || {},
            disableSms: false,  // 카카오 실패 시 자동 SMS fallback (솔라피 차원)
          },
        },
      }
      const res = await fetch('https://api.solapi.com/messages/v4/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const json = await res.json()
        return { success: true, channel: 'kakao', messageId: json?.messageId }
      }
      // 실패 → SMS fallback
    } catch {
      // 네트워크 에러 → SMS fallback
    }
  }

  // 2차 — SMS fallback
  try {
    const body = {
      message: {
        to,
        from: fromPhone,
        text: opts.text,
      },
    }
    const res = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': buildSolapiAuth(apiKey, apiSecret),
      },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const json = await res.json()
      return { success: true, channel: 'sms', messageId: json?.messageId }
    }
    const errBody = await res.text().catch(() => '')
    return { success: false, channel: 'sms', error: `HTTP ${res.status}: ${errBody}` }
  } catch (e: any) {
    return { success: false, channel: 'sms', error: e?.message || String(e) }
  }
}

/**
 * 스케줄 영구 링크 안내 메시지 SMS 본문 — 알림톡 템플릿 미승인 시 fallback
 */
export function buildScheduleLinkMessage(opts: {
  workerName: string
  url: string
  companyName?: string
}): string {
  const company = opts.companyName || '회사'
  return `[${company}] ${opts.workerName}님,\n\n근무 스케줄 + 휴가 신청 페이지:\n${opts.url}\n\n* 본인 전용 링크. 공유 금지.`
}
