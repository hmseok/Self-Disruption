// ═══════════════════════════════════════════════════════════════════
// GET /api/ride-employees/template
//   직원 일괄 등록용 샘플 .xlsx 다운로드
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import * as XLSX from 'xlsx'

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const aoa: any[][] = [
      ['이름', '부서', '직급', '고용형태', '입사일', '전화', '이메일', '그룹', '색상', '메모'],
      ['박지훈 (예시)', '콜센터', '사원', '정규', '2025-03-01', '010-1234-5678', 'park@ride.kr', '주간', 'none', ''],
      ['이혜경 (예시)', '콜센터', '대리', '정규', '2024-06-15', '010-2345-6789', 'lee@ride.kr', '주간', 'none', ''],
      ['정동민 (예시)', '콜센터', '사원', '계약', '2025-08-01', '010-3456-7890', '', '야간', 'blue', '야간 시프트'],
    ]
    // 빈 row 30개 (입력 공간)
    for (let i = 0; i < 30; i++) {
      aoa.push(['', '', '', '', '', '', '', '', '', ''])
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [
      { wch: 14 }, // 이름
      { wch: 10 }, // 부서
      { wch: 10 }, // 직급
      { wch: 10 }, // 고용형태
      { wch: 12 }, // 입사일
      { wch: 14 }, // 전화
      { wch: 22 }, // 이메일
      { wch: 8 },  // 그룹
      { wch: 8 },  // 색상
      { wch: 30 }, // 메모
    ]

    // 안내 시트
    const guide = XLSX.utils.aoa_to_sheet([
      ['컬럼', '설명', '허용 값'],
      ['이름', '직원 이름 (필수)', '예: 박지훈'],
      ['부서', '소속 부서', '콜센터 / 운영 / 정비 / 영업 / 관리 / 기타'],
      ['직급', '직급/직책', '대표 / 이사 / 부장 / 차장 / 과장 / 대리 / 주임 / 사원'],
      ['고용형태', '근무 형태', '정규 / 계약 / 파트 / 용역'],
      ['입사일', 'YYYY-MM-DD', '2025-03-01'],
      ['전화', '연락처', '010-1234-5678'],
      ['이메일', '이메일', 'name@ride.kr'],
      ['그룹', 'CallScheduler 분류', '주간 / 야간 / 저녁 / 관리 / 기타'],
      ['색상', '캘린더 셀 강조 색', 'none / blue / gray / green / amber / violet / red'],
      ['메모', '자유 메모', ''],
      ['', '', ''],
      ['주의', '', ''],
      ['1', '이미 같은 이름이 등록되어 있으면 skip', ''],
      ['2', '이름이 비어있으면 행 스킵', ''],
      ['3', '업로드 시 모두 활성(재직) 으로 등록', ''],
      ['4', '동명이인 등록 불가 — 별칭 또는 입사일 차별화 권장', ''],
    ])
    guide['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 50 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '직원 입력')
    XLSX.utils.book_append_sheet(wb, guide, '안내')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const today = new Date().toISOString().substring(0, 10)
    const filename = `ride_employees_template_${today}.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
