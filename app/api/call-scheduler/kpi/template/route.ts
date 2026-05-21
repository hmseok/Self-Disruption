// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/kpi/template?kind=call-records|productivity
//   KT 엑셀 업로드 양식 안내 .xlsx 다운로드
//   → KT 포털에서 받은 원본을 그대로 업로드하면 되며, 본 양식은 어떤
//     컬럼이 인식되는지 안내하는 참고용 시트.
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import * as XLSX from 'xlsx'

const CALL_HEADER = [
  '번호', '상담센터', '채널정보', '상담유형1', '상담유형2', '상담유형3', '상담유형4',
  '상담사', '부서', '직급', '콜키', '호전환회수', '상담일', '시작시간', '종료시간',
  '발신자전화번호', '세션키',
]
const CALL_SAMPLE = [
  221, 'CX 컨택', '아웃바운드', '메리츠캐피탈', '사고', '', '',
  '이경미(ride_kmlee10)', 'CX 컨택센터', '사원',
  '94138B80-AEBE-4F46-9714-530A1B727A22', 0, '2026.05.21', '13:12:23', '13:12:33',
  '010-4403-3458', '',
]

const PROD_HEADER = [
  '일자', '부서명', '상담사명(ID)', '최초 로그인시간', '최종 로그아웃시간', '로그인시간',
  'IB건', 'IB통화시간', '직통IB', '직통IB통화시간', 'OB건', 'OB시도건', 'OB통화시간',
  'Hold건', 'Hold시간', '후처리건', '후처리시간', '대기건', '대기시간', '이석건', '이석시간',
  'IB_ATT', '직통IB_ATT', 'OB_ATT', '평균 Hold', 'AHT', 'ACW',
  '이석사유1', '이석사유별 시간1', '이석사유2', '이석사유별 시간2', '이석사유3', '이석사유별 시간3',
]
const PROD_SAMPLE = [
  '2026-05', 'CX 컨택센터', '김현정(ride_hjkim8)', '08:39:50', '09:21:52', '93:00:31',
  354, '18:27:17', 0, '00:00:00', 152, 172, '06:04:18',
  0, '00:00:00', 491, '42:17:44', 455, '14:04:17', 187, '14:04:17',
  187.7, 0, 143.8, 0, 254, 75.8,
  '업무 준비중', '01:37:08', '이석', '12:27:09', '', '',
]

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const kind = request.nextUrl.searchParams.get('kind') === 'productivity'
    ? 'productivity' : 'call-records'

  try {
    const isCall = kind === 'call-records'
    const header = isCall ? CALL_HEADER : PROD_HEADER
    const sample = isCall ? CALL_SAMPLE : PROD_SAMPLE

    const ws = XLSX.utils.aoa_to_sheet([header, sample])
    ws['!cols'] = header.map(() => ({ wch: 14 }))

    const guide = XLSX.utils.aoa_to_sheet(
      isCall
        ? [
            ['KT 상담이력조회 업로드 안내', '', ''],
            ['', '', ''],
            ['항목', '설명', ''],
            ['업로드 방법', 'KT 포털 → 상담이력조회 엑셀 다운로드 → 그대로 업로드', ''],
            ['첫 행', '컬럼 헤더 (위 시트와 동일 순서 권장)', ''],
            ['콜키', '필수 — 비어있는 행은 자동 제외, 재업로드 시 중복 차단', ''],
            ['상담사', '이름(KT_ID) 형식 — 예: 이경미(ride_kmlee10)', ''],
            ['상담일', '2026.05.21 / 2026-05-21 형식', ''],
            ['시작/종료시간', 'HH:MM:SS — 통화시간은 종료-시작 자동 계산(자정넘김 보정)', ''],
            ['상담원 매핑', 'KT ID → 직원 매칭, 실패 시 이름 매칭, 모두 실패해도 저장됨', ''],
          ]
        : [
            ['KT 생산성(상담사) 업로드 안내', '', ''],
            ['', '', ''],
            ['항목', '설명', ''],
            ['업로드 방법', 'KT 포털 → 통계·보고서 → 생산성(상담사) 엑셀 → 그대로 업로드', ''],
            ['첫 행', '컬럼 헤더 (위 시트와 동일 순서 권장)', ''],
            ['일자', '2026-05 (월간) 또는 2026-05-21 (일간)', ''],
            ['상담사명(ID)', '이름(KT_ID) 형식 — 예: 김현정(ride_hjkim8)', ''],
            ['시간 컬럼', 'HH:MM:SS — 초로 환산 저장 (90:00:00 같은 누적값 허용)', ''],
            ['비활성 계정', '로그인시간 0 인 행도 저장되며 is_active=0 으로 표시', ''],
            ['재업로드', '동일 기간·상담원 재업로드 시 덮어쓰기 (ON DUPLICATE UPDATE)', ''],
          ],
    )
    guide['!cols'] = [{ wch: 16 }, { wch: 60 }, { wch: 6 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, isCall ? '상담이력 양식' : '생산성 양식')
    XLSX.utils.book_append_sheet(wb, guide, '안내')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const today = new Date().toISOString().substring(0, 10)
    const filename = `cs_kpi_${kind}_template_${today}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'template error' }, { status: 500 })
  }
}
