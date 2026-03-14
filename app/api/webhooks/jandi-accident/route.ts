import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 잔디(Jandi) Outgoing Webhook → 사고 접수
// ============================================
// 스카이오토 사고접수 포맷 자동 파싱 → accident_records 등록
//
// ★ 실제 메시지 포맷:
// ──────────────────────────────────
// 171호6793 / 우리금융캐피탈 / self / 턴키 / 가해 / 자차
// 거래처명: 우리금융캐피탈■턴키정산/담당자문자발송■
// *접수번호: 260221-009-2137
// *고객명 : [법인]주식회사공화정공
// *실행일자: 2025년 10월 29일
// *차량번호:171호6793
// *차종:신형 G90 가솔린 3.5 터보 5인승
// *접수일시:2026년 02월 21일 11시25분
// *사고일시:2026년 02월 21일 11시00분
// *통보자:박준영 / 010-5520-5719 / 본인 /
// *운전자:박준영 / 010-5520-5719 / 생년월일 680115 / 1종보통 / 대표 /
// *면책금:300,000
// *사고장소:충청남도 태안군 ...
// *사고부위:운)리어도어(운행가능)
// *사고내용:자차 주차상태에서 ...
// *수리여부:N/ 수리불필요
// *자차보험사:메리츠화재/20261840470
// *상대보험사:/
// *접수자:정지은
// ──────────────────────────────────

// ── Supabase Admin (service role → RLS 우회)
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── 과실/정산 유형 매핑
const FAULT_TYPE_MAP: Record<string, string> = {
  '가해': 'insurance_at_fault',
  '피해': 'insurance_victim',
  '자차': 'insurance_own',
  '면책': 'insurance_own',
  '과실': 'insurance_at_fault',
}

// ── 한국어 날짜 파싱: "2026년 02월 21일 11시00분" → { date: '2026-02-21', time: '11:00' }
function parseKoreanDatetime(str: string): { date: string; time: string | null } {
  const cleaned = str.trim()

  // 패턴1: "2026년 02월 21일 11시00분" 또는 "2026년 02월 21일 11시25분"
  const m1 = cleaned.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2})시\s*(\d{1,2})분/)
  if (m1) {
    const date = `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`
    const time = `${m1[4].padStart(2, '0')}:${m1[5].padStart(2, '0')}`
    return { date, time }
  }

  // 패턴2: "2026년 02월 21일" (시간 없음)
  const m2 = cleaned.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (m2) {
    return { date: `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`, time: null }
  }

  // 패턴3: "2025-01-15 14:30" 일반 형식
  const m3 = cleaned.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*(\d{1,2}):(\d{2})/)
  if (m3) {
    return { date: `${m3[1]}-${m3[2].padStart(2, '0')}-${m3[3].padStart(2, '0')}`, time: `${m3[4].padStart(2, '0')}:${m3[5]}` }
  }

  // 패턴4: "2025-01-15" 날짜만
  const m4 = cleaned.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (m4) {
    return { date: `${m4[1]}-${m4[2].padStart(2, '0')}-${m4[3].padStart(2, '0')}`, time: null }
  }

  return { date: new Date().toISOString().split('T')[0], time: null }
}

// ── 금액 파싱
// 단순: "300,000" → 300000
// 복합: "300,000/1,000,000(자기부담율:20%)" → 첫 번째 금액 300000
function parseAmount(str: string): number {
  // 슬래시가 있으면 첫 번째 금액만 사용 (기본 면책금)
  const firstPart = str.split('/')[0].trim()
  const cleaned = firstPart.replace(/[^0-9]/g, '')
  return parseInt(cleaned, 10) || 0
}

// ── 통보자/운전자 파싱: "박준영 / 010-5520-5719 / 본인 /" → { name, phone, relation }
function parsePersonField(str: string): { name: string; phone: string; relation: string; birthDate?: string; license?: string } {
  const parts = str.split('/').map(s => s.trim()).filter(Boolean)
  const result: { name: string; phone: string; relation: string; birthDate?: string; license?: string } = {
    name: parts[0] || '',
    phone: '',
    relation: '',
  }

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]
    if (/01[016789]-?\d{3,4}-?\d{4}/.test(p)) {
      result.phone = p
    } else if (/생년월일/.test(p)) {
      result.birthDate = p.replace('생년월일', '').trim()
    } else if (/종(보통|대형|소형|특수)/.test(p)) {
      result.license = p
    } else if (['본인', '배우자', '가족', '직원', '대표', '법인', '탁송'].includes(p)) {
      result.relation = p
    } else if (p.length <= 10 && !result.relation) {
      result.relation = p
    }
  }
  return result
}

// ── 보험사 파싱: "메리츠화재/20261840470" → { company, claimNo }
function parseInsurance(str: string): { company: string; claimNo: string } {
  const parts = str.split('/').map(s => s.trim())
  return {
    company: parts[0] || '',
    claimNo: parts[1] || '',
  }
}

// ── 사고부위 파싱: "운)리어도어(운행가능)" → { part, drivable }
function parseDamagePart(str: string): { part: string; drivable: boolean } {
  const drivable = str.includes('운행가능')
  const part = str
    .replace(/\(운행가능\)/g, '')
    .replace(/\(운행불가능\)/g, '')
    .replace(/\(운행불가\)/g, '')
    .trim()
  return { part, drivable }
}

// ── 수리여부 파싱: "Y/서울특별시 양천구 신월동" → { needsRepair, repairLocation }
function parseRepairStatus(str: string): { needsRepair: boolean; repairLocation: string } {
  const parts = str.split('/').map(s => s.trim())
  const first = (parts[0] || '').toUpperCase()
  return {
    needsRepair: first === 'Y' || first.includes('필요'),
    repairLocation: parts.slice(1).join(' ').replace('수리불필요', '').trim(),
  }
}

// ── 헤더 라인 파싱: "171호6793 / 우리금융캐피탈 / self / 턴키 / 가해 / 자차"
function parseHeaderLine(line: string): {
  carNumber: string; clientName: string; serviceType: string;
  settlementType: string; faultType: string; insuranceType: string;
  extras: string[]
} {
  const parts = line.split('/').map(s => s.trim()).filter(Boolean)
  return {
    carNumber: parts[0] || '',
    clientName: parts[1] || '',
    serviceType: parts[2] || '',
    settlementType: parts[3] || '',  // 턴키, 실비
    faultType: parts[4] || '',        // 가해, 피해, 면책
    insuranceType: parts[5] || '',    // 자차, 대물, 대차
    extras: parts.slice(6),
  }
}

// ── *필드명:값 형태의 메시지 파싱
function parseAccidentFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {}

  // *필드명:값 또는 *필드명 : 값 패턴 추출 (줄바꿈 또는 * 기준으로 분리)
  // 실제 메시지는 줄바꿈 없이 연속될 수 있음
  const fieldPattern = /\*([^*:]+?)\s*[:：]\s*([^*]*?)(?=\*[^*:]+[:：]|$)/g
  let match
  while ((match = fieldPattern.exec(text)) !== null) {
    const key = match[1].trim()
    const value = match[2].trim()
    if (key && value) {
      fields[key] = value
    }
  }

  return fields
}

// ── 잔디 응답 포맷
function jandiResponse(body: string, color?: string) {
  return NextResponse.json({
    body,
    connectColor: color || '#FAC11B',
    connectInfo: [{ title: '시스템', description: 'SelfDisruption ERP' }],
  })
}

// ============================================
// POST Handler
// ============================================
export async function POST(request: NextRequest) {
  try {
    // ── 1. 잔디 Outgoing Webhook Body 파싱
    const payload = await request.json()

    // ── 2. 토큰 검증 (여러 토픽 지원: 쉼표 구분)
    const webhookToken = payload.token
    const expectedTokens = process.env.JANDI_ACCIDENT_TOKEN
    if (expectedTokens) {
      const tokenList = expectedTokens.split(',').map(t => t.trim())
      if (!tokenList.includes(webhookToken)) {
        return jandiResponse('⛔ 인증 실패: 유효하지 않은 토큰입니다.', '#FF0000')
      }
    }

    // ── 3. 메시지 추출
    // 잔디 payload: data = 키워드 제외 본문, text = 전체 메시지
    const rawText = payload.data || payload.text || ''
    const writerName = payload.writer?.name || '알 수 없음'
    const roomName = payload.roomName || ''

    if (!rawText || rawText.trim().length < 10) {
      return jandiResponse(
        '⚠️ 사고접수 내용이 부족합니다.\n\n스카이오토 접수 메시지를 그대로 붙여넣어 주세요.',
        '#FF9800'
      )
    }

    // ── 4. 헤더 라인 파싱 (첫 줄: "차량번호 / 거래처 / 유형 / 정산 / 과실 / 보험")
    const lines = rawText.split('\n').map((l: string) => l.trim()).filter(Boolean)
    let header = { carNumber: '', clientName: '', serviceType: '', settlementType: '', faultType: '', insuranceType: '', extras: [] as string[] }

    // 첫 줄이 슬래시로 구분된 헤더인지 확인
    const firstLine = lines[0] || ''
    if (firstLine.includes('/') && !firstLine.startsWith('*')) {
      header = parseHeaderLine(firstLine)
    }

    // ── 5. *필드명:값 파싱
    const fields = parseAccidentFields(rawText)

    // ── 6. 차량번호 추출 (우선순위: *차량번호 > 헤더 첫번째)
    const carNumber = fields['차량번호'] || header.carNumber
    if (!carNumber) {
      return jandiResponse('⚠️ 차량번호를 찾을 수 없습니다.', '#FF9800')
    }

    // ── 7. DB 조회: 차량 찾기
    const supabase = getSupabaseAdmin()
    const cleanCarNum = carNumber.replace(/\s/g, '')

    const { data: car, error: carErr } = await supabase
      .from('cars')
      .select('id, company_id, number, brand, model, status')
      .or(`number.ilike.%${cleanCarNum}%,number.ilike.%${cleanCarNum.replace(/(\d+)([가-힣])(\d+)/, '$1 $2 $3')}%`)
      .limit(1)
      .single()

    if (carErr || !car) {
      // 차량 못 찾아도 일단 접수 — company_id는 환경변수 또는 첫번째 회사
      const { data: defaultCompany } = await supabase
        .from('companies')
        .select('id')
        .limit(1)
        .single()

      if (!defaultCompany) {
        return jandiResponse(`⚠️ 차량번호 "${carNumber}" 미등록 & 기본 회사 없음`, '#FF9800')
      }

      // 차량 미등록이지만 사고는 접수
      return await insertAccidentRecord(supabase, {
        companyId: defaultCompany.id,
        carId: null,
        fields,
        header,
        writerName,
        roomName,
        rawText,
      })
    }

    // ── 8. 현재 활성 계약 조회
    const { data: activeContract } = await supabase
      .from('contracts')
      .select('id, customer_id')
      .eq('car_id', car.id)
      .eq('company_id', car.company_id)
      .eq('status', 'active')
      .limit(1)
      .single()

    // ── 9. 사고 등록
    return await insertAccidentRecord(supabase, {
      companyId: car.company_id,
      carId: car.id,
      carInfo: car,
      contractId: activeContract?.id,
      customerId: activeContract?.customer_id,
      fields,
      header,
      writerName,
      roomName,
      rawText,
    })

  } catch (err: any) {
    console.error('잔디 웹훅 처리 오류:', err)
    return jandiResponse(`❌ 서버 오류: ${err.message || '알 수 없는 오류'}`, '#FF0000')
  }
}

// ============================================
// 사고 레코드 INSERT
// ============================================
async function insertAccidentRecord(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    companyId: string
    carId: number | null
    carInfo?: { id: number; number: string; brand: string; model: string; status: string }
    contractId?: string
    customerId?: number
    fields: Record<string, string>
    header: ReturnType<typeof parseHeaderLine>
    writerName: string
    roomName: string
    rawText: string
  }
) {
  const { companyId, carId, carInfo, contractId, customerId, fields, header, writerName, roomName, rawText } = params

  // ── 사고일시 파싱
  const accidentDt = parseKoreanDatetime(fields['사고일시'] || fields['접수일시'] || '')

  // ── 운전자/통보자 파싱
  const driver = parsePersonField(fields['운전자'] || '')
  const reporter = parsePersonField(fields['통보자'] || '')

  // ── 보험사 파싱
  const ownInsurance = parseInsurance(fields['자차보험사'] || '')
  const counterInsurance = parseInsurance(fields['상대보험사'] || '')

  // ── 사고부위/수리 파싱
  const damage = parseDamagePart(fields['사고부위'] || '')
  const repair = parseRepairStatus(fields['수리여부'] || '')

  // ── 면책금 파싱
  const deductible = parseAmount(fields['면책금'] || '0')

  // ── 과실 유형 → dispatch_category 결정
  const faultTypeKey = header.faultType || ''
  let accidentType: string = 'collision'
  if (fields['사고내용']?.includes('자차') || fields['사고내용']?.includes('단독') || fields['사고내용']?.includes('가드레일')) {
    accidentType = 'self_damage'
  }
  if (fields['사고내용']?.includes('음주')) {
    accidentType = 'self_damage'
  }

  // ── 과실비율 추정 (헤더 기반)
  let faultRatio = 0
  if (faultTypeKey === '가해' || faultTypeKey === '과실') faultRatio = 100
  else if (faultTypeKey === '피해') faultRatio = 0
  else if (faultTypeKey === '자차' || faultTypeKey === '면책') faultRatio = 100

  // ── 고객명 정리
  const customerName = (fields['고객명'] || '')
    .replace(/\[법인\]/g, '')
    .replace(/\[개인\]/g, '')
    .trim()

  // ── 운행가능 여부 → vehicle_condition
  const vehicleCondition = damage.drivable ? 'minor' : 'repairable'

  // ── 접수번호
  const claimNo = fields['접수번호'] || ''

  // ── notes 조합 (원본 보존)
  const noteParts = [
    `[잔디 자동접수] 작성자: ${writerName} / 토픽: ${roomName}`,
    `접수시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    header.settlementType ? `정산방식: ${header.settlementType}` : '',
    header.faultType ? `과실구분: ${header.faultType}` : '',
    header.insuranceType ? `보험종류: ${header.insuranceType}` : '',
    header.clientName ? `거래처: ${header.clientName}` : '',
    fields['사고부위'] ? `사고부위: ${fields['사고부위']}` : '',
    fields['차종'] ? `차종: ${fields['차종']}` : '',
    driver.birthDate ? `운전자 생년월일: ${driver.birthDate}` : '',
    driver.license ? `면허종류: ${driver.license}` : '',
    driver.relation ? `운전자 관계: ${driver.relation}` : '',
    fields['접수자'] ? `접수자: ${fields['접수자']}` : '',
    fields['면책금'] && fields['면책금'].includes('/') ? `면책금 원본: ${fields['면책금']}` : '',
    header.extras.length > 0 ? `추가정보: ${header.extras.join(', ')}` : '',
  ].filter(Boolean).join('\n')

  // ── INSERT
  const insertData: Record<string, any> = {
    company_id: companyId,
    car_id: carId,
    contract_id: contractId || null,
    customer_id: customerId || null,
    accident_date: accidentDt.date,
    accident_time: accidentDt.time,
    accident_location: fields['사고장소'] || '',
    accident_type: accidentType,
    fault_ratio: faultRatio,
    description: fields['사고내용'] || '',
    driver_name: driver.name || reporter.name || '',
    driver_phone: driver.phone || reporter.phone || '',
    driver_relation: driver.relation || reporter.relation || '',
    counterpart_name: '',
    counterpart_phone: '',
    counterpart_vehicle: '',
    counterpart_insurance: counterInsurance.company || '',
    insurance_company: ownInsurance.company || '',
    insurance_claim_no: ownInsurance.claimNo || claimNo || '',
    customer_deductible: deductible,
    vehicle_condition: vehicleCondition,
    repair_shop_name: repair.repairLocation || '',
    police_reported: false,
    status: 'reported',
    notes: noteParts,
    source: 'jandi_accident',
    jandi_raw: rawText,
    jandi_topic: roomName,
  }

  // 수리 필요 시 상태 바로 변경
  if (repair.needsRepair && repair.repairLocation) {
    insertData.repair_start_date = accidentDt.date
  }

  const { data: accident, error: insertErr } = await supabase
    .from('accident_records')
    .insert(insertData)
    .select('id, accident_date, status')
    .single()

  if (insertErr) {
    console.error('사고 등록 실패:', JSON.stringify(insertErr))
    return jandiResponse(`❌ 사고 등록 실패: ${insertErr.message}`, '#FF0000')
  }

  // ── 차량 상태 변경 (차량이 있는 경우)
  if (carId) {
    await supabase.from('cars').update({ status: 'accident' }).eq('id', carId)

    await supabase.from('vehicle_status_log').insert({
      company_id: companyId,
      car_id: carId,
      old_status: carInfo?.status || 'active',
      new_status: 'accident',
      related_type: 'accident',
      related_id: String(accident.id),
      memo: `잔디 사고접수 #${accident.id} (${fields['접수번호'] || '-'})`,
    })
  }

  // ── 성공 응답
  const carLabel = carInfo ? `${carInfo.number} (${carInfo.brand} ${carInfo.model})` : (fields['차량번호'] || '미등록')
  const repairLabel = repair.needsRepair ? '수리필요' : '수리불필요'
  const drivableLabel = damage.drivable ? '운행가능' : '운행불가'

  return jandiResponse(
    `✅ 사고 접수 완료 [#${accident.id}]\n\n` +
    `🚗 차량: ${carLabel}\n` +
    `📅 사고일시: ${accidentDt.date}${accidentDt.time ? ' ' + accidentDt.time : ''}\n` +
    `📍 장소: ${fields['사고장소'] || '-'}\n` +
    (customerName ? `👤 고객: ${customerName}\n` : '') +
    (driver.name ? `🧑 운전자: ${driver.name} (${driver.relation || '-'})\n` : '') +
    `💥 과실: ${header.faultType || '-'} / 정산: ${header.settlementType || '-'}\n` +
    (ownInsurance.company ? `🏢 보험사: ${ownInsurance.company} (${ownInsurance.claimNo || '-'})\n` : '') +
    `🔧 ${drivableLabel} / ${repairLabel}\n` +
    (deductible > 0 ? `💰 면책금: ${deductible.toLocaleString()}원\n` : '') +
    `\n📋 상태: 접수완료 → ERP 사고관리에서 확인하세요.`,
    '#2ECC71'
  )
}

// ============================================
// GET Handler — 연결 테스트용
// ============================================
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'jandi-accident-webhook',
    message: '잔디 사고접수 웹훅 엔드포인트 정상 동작 중',
    supported_format: '스카이오토 사고접수 메시지 (*필드명:값 형태)',
    parsed_fields: [
      '접수번호', '고객명', '차량번호', '차종', '접수일시', '사고일시',
      '통보자', '운전자', '면책금', '사고장소', '사고부위', '사고내용',
      '수리여부', '자차보험사', '상대보험사', '접수자',
    ],
    header_format: '차량번호 / 거래처명 / 서비스유형 / 정산방식 / 과실구분 / 보험종류',
  })
}
