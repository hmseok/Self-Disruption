// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/leaves/template
//   휴가 일괄 업로드 샘플 .xlsx 다운로드
//   현재 활성 워커 16명을 미리 채워서 매니저가 시작일/종료일/종류만 입력하면 됨
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    // 활성 워커 가져와 시드
    const workers = await prisma.$queryRaw<any[]>`
      SELECT name, group_label
      FROM cs_workers
      WHERE is_active = 1
      ORDER BY group_label DESC, name ASC
    `

    // 헤더 + 안내 + 워커 16명 미리 채움
    const aoa: any[][] = [
      ['이름', '시작일', '종료일', '종류', '시간단위', '시간', '사유'],
      ['박지훈 (예시)', '2026-05-10', '2026-05-12', '연차', 'full', '', '가족 행사'],
      ['이혜경 (예시)', '2026-05-15', '2026-05-15', '패밀리데이', 'custom', 4, '오전 일정'],
      ['김현정 (예시)', '2026-05-20', '2026-05-20', '연차', 'am', '', '오전반차'],
    ]
    // 빈 row 16개 (워커 이름만 채움)
    for (const w of workers) {
      aoa.push([w.name, '', '', '', 'full', '', ''])
    }
    // 빈 row 더
    for (let i = 0; i < 5; i++) aoa.push(['', '', '', '', 'full', '', ''])

    const ws = XLSX.utils.aoa_to_sheet(aoa)

    // 컬럼 폭
    ws['!cols'] = [
      { wch: 14 }, // 이름
      { wch: 12 }, // 시작일
      { wch: 12 }, // 종료일
      { wch: 12 }, // 종류
      { wch: 10 }, // 시간단위
      { wch: 8 },  // 시간 (custom)
      { wch: 30 }, // 사유
    ]

    // 안내 시트
    const guide = XLSX.utils.aoa_to_sheet([
      ['컬럼', '설명', '허용 값'],
      ['이름', '워커 이름 (cs_workers 와 정확히 일치)', '예: 박지훈'],
      ['시작일', 'YYYY-MM-DD 형식', '2026-05-10'],
      ['종료일', '비어있으면 시작일과 동일', '2026-05-12'],
      ['종류', '한국어 또는 enum', '연차 / 패밀리데이 / 병가 / 무급 / 경조 / 공휴일 / 기타'],
      ['시간단위', '종일/반차/시간지정', 'full | am | pm | custom'],
      ['시간', 'custom 일 때만 입력 (시간 단위)', '예: 4 (4시간) / 2 (2시간) / 6 (6시간)'],
      ['사유', '자유 메모', '가족 행사'],
      ['', '', ''],
      ['차감 환산', '', ''],
      ['full', '종일 = 1일 (8h)', ''],
      ['am, pm', '반차 = 0.5일 (4h)', ''],
      ['custom', '시간 / 8 = day (예: 4h=0.5일, 2h=0.25일)', ''],
      ['', '', ''],
      ['주의', '', ''],
      ['1', '이름 매칭 안 되면 행 스킵', ''],
      ['2', '동일 워커 동일 일자 중복 시 모두 등록 (수동 정리 필요)', ''],
      ['3', '업로드 시 status=approved 즉시 적용', ''],
      ['4', '연차 → full 권장, 패밀리데이 → custom 권장', ''],
    ])
    guide['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 50 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '휴가 입력')
    XLSX.utils.book_append_sheet(wb, guide, '안내')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const today = new Date().toISOString().substring(0, 10)
    const filename = `cs_leaves_template_${today}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
