// ═══════════════════════════════════════════════════════════════════
// iCal (.ics) 형식 export — 라이브러리 없이 표준 텍스트 생성
// RFC 5545 호환. 휴대폰/구글/애플 캘린더 import 가능
// ═══════════════════════════════════════════════════════════════════

interface AssignmentForExport {
  id: string
  work_date: string  // YYYY-MM-DD
  start_time: string // HH:MM
  end_time: string   // HH:MM
  is_overnight: boolean
  slot_label: string
  slot_code: string
  special_code: string
  computed_hours: number
}

interface IcalParams {
  workerName: string
  year: number
  month: number
  assignments: AssignmentForExport[]
  prodId?: string
}

const SPECIAL_KOR: Record<string, string> = {
  none: '',
  am_free: '오전F',
  pm_free: '오후F',
  am_half: '오전반차',
  pm_half: '오후반차',
  off: '휴무',
}

// CRLF 라인 + UTF-8
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// ICS 문자열 escape: ; , \ → 이스케이프, 줄바꿈 → \\n
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// "YYYYMMDDTHHMMSS" 로컬 (timezone TZID 사용)
function toLocalDt(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`
}

// 익일 종료 처리: start 가 end 보다 늦으면 end 의 date 를 +1일
function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function buildIcs({ workerName, year, month, assignments, prodId = '-//FMI ERP//CallScheduler//KO' }: IcalParams): string {
  const now = new Date()
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`

  const lines: string[] = []
  lines.push('BEGIN:VCALENDAR')
  lines.push('VERSION:2.0')
  lines.push(`PRODID:${prodId}`)
  lines.push('CALSCALE:GREGORIAN')
  lines.push('METHOD:PUBLISH')
  lines.push(`X-WR-CALNAME:${escapeText(`${workerName} - ${year}년 ${month}월 근무표`)}`)
  lines.push('X-WR-TIMEZONE:Asia/Seoul')

  // VTIMEZONE — 단순 KST (DST 없음)
  lines.push('BEGIN:VTIMEZONE')
  lines.push('TZID:Asia/Seoul')
  lines.push('BEGIN:STANDARD')
  lines.push('DTSTART:19700101T000000')
  lines.push('TZOFFSETFROM:+0900')
  lines.push('TZOFFSETTO:+0900')
  lines.push('TZNAME:KST')
  lines.push('END:STANDARD')
  lines.push('END:VTIMEZONE')

  // 각 배정 → VEVENT
  for (const a of assignments) {
    if (a.special_code === 'off') continue  // 휴무는 캘린더에 빼기 (또는 ALL-DAY 로?)

    const startDt = toLocalDt(a.work_date, a.start_time)
    const endDate = a.is_overnight ? nextDay(a.work_date) : a.work_date
    const endDt = toLocalDt(endDate, a.end_time)

    const specialKor = SPECIAL_KOR[a.special_code] || ''
    const summary = specialKor
      ? `${workerName} ${a.slot_label} (${specialKor})`
      : `${workerName} ${a.slot_label}`
    const desc = `시프트: ${a.slot_code} ${a.slot_label}\\n시간: ${a.computed_hours}h`

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:cs-${a.id}@fmi.local`)
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(`DTSTART;TZID=Asia/Seoul:${startDt}`)
    lines.push(`DTEND;TZID=Asia/Seoul:${endDt}`)
    lines.push(`SUMMARY:${escapeText(summary)}`)
    lines.push(`DESCRIPTION:${escapeText(desc)}`)
    lines.push(`CATEGORIES:CallScheduler`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  // RFC 5545 — 라인은 CRLF, 75자 초과 시 fold (간단 버전)
  return lines.map(l => {
    if (l.length <= 75) return l
    // 간단 fold (75자 단위로 자르고 다음 줄은 공백 1자로 시작)
    const chunks: string[] = []
    let s = l
    while (s.length > 75) {
      chunks.push(s.slice(0, 75))
      s = ' ' + s.slice(75)
    }
    chunks.push(s)
    return chunks.join('\r\n')
  }).join('\r\n')
}

/** 브라우저에서 ICS 파일 다운로드 트리거 */
export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
