import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 잔디(Jandi) Outgoing Webhook → 대차요청 접수
// ============================================
// 스카이오토 대차요청 포맷 자동 파싱
//  → accident_records 생성 (사고 내역 보관)
//  → 배정 가능 차량 추천 (잔디 회신)
//
// ★ 실제 메시지 포맷:
// 103하3044 / iM캐피탈 / DGB_SELF / 턴키 / 피해 / 자차 / 수리[Y] / 대차사용 /화성상용서비스(주)
// 안녕하세요 라이드입니다. 대차진행 부탁드리겠습니다.
// *대차업체 : 라이드대차(잔디)
// *캐피탈사: iM캐피탈 DGB_SELF300,000
// *차량번호,차종: 103하3044 , 모닝 더 뉴 모닝(JA PE2) 가솔린 1.0 트렌디
// *접수일시: 2026년 02월 21일 10시32분
// *사고일시: 2026년 02월 21일 10시15분
// *고객명: 이명심[임직원특약 - N]
// *통보자: 이명심 / 010-2696-9742 / 본인 /
// *운전자: 이명심 / 010-2696-9742 / 생년월일 800105 / 2종오토 / 본인 /
// *사고(가/피해/단독): 피해
// *사고내용 : 정상주차된 자차를 후진하던 대차가 접촉
// *파손부위 : 조)리어범퍼
// *자차보험사 : 하나손해보험/미접수
// *상대보험사 : 현대해상/2602057456
// *대차요청날짜: 금일
// *대차요청지: 경기도 화성시 ...
// *입고지: 화성상용서비스(주), 경기도 화성시 ..., 010-3455-8478
// *청구내용(고객/스카이/대물): 대물
// *추가내용:
// *접수자: 정지은

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── 한국어 날짜 파싱
function parseKoreanDatetime(str: string): { date: string; time: string | null } {
  const cleaned = str.trim()
  const m1 = cleaned.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2})시\s*(\d{1,2})분/)
  if (m1) {
    return {
      date: `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`,
      time: `${m1[4].padStart(2, '0')}:${m1[5].padStart(2, '0')}`,
    }
  }
  const m2 = cleaned.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (m2) {
    return { date: `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`, time: null }
  }
  return { date: new Date().toISOString().split('T')[0], time: null }
}

// ── 금액 파싱
function parseAmount(str: string): number {
  const cleaned = str.replace(/[^0-9]/g, '')
  return parseInt(cleaned, 10) || 0
}

// ── 통보자/운전자 파싱
function parsePersonField(str: string): { name: string; phone: string; relation: string; birthDate?: string; license?: string } {
  const parts = str.split('/').map(s => s.trim()).filter(Boolean)
  const result: { name: string; phone: string; relation: string; birthDate?: string; license?: string } = {
    name: parts[0] || '', phone: '', relation: '',
  }
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]
    if (/01[016789]-?\d{3,4}-?\d{4}/.test(p)) result.phone = p
    else if (/생년월일/.test(p)) result.birthDate = p.replace('생년월일', '').trim()
    else if (/종(보통|대형|소형|특수|오토)/.test(p)) result.license = p
    else if (['본인', '배우자', '가족', '직원', '대표', '법인', '탁송'].includes(p)) result.relation = p
    else if (p.length <= 10 && !result.relation) result.relation = p
  }
  return result
}

// ── 보험사 파싱
function parseInsurance(str: string): { company: string; claimNo: string } {
  const parts = str.split('/').map(s => s.trim())
  return { company: parts[0] || '', claimNo: parts[1] || '' }
}

// ── 헤더 라인 파싱
function parseHeaderLine(line: string) {
  const parts = line.split('/').map(s => s.trim()).filter(Boolean)
  return {
    carNumber: parts[0] || '',
    clientName: parts[1] || '',
    serviceType: parts[2] || '',
    settlementType: parts[3] || '',
    faultType: parts[4] || '',
    insuranceType: parts[5] || '',
    extras: parts.slice(6),
  }
}

// ── *필드명:값 파싱 (대차요청 전용 필드 포함)
function parseFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const fieldPattern = /\*([^*:]+?)\s*[:：]\s*([^*]*?)(?=\*[^*:]+[:：]|$)/g
  let match
  while ((match = fieldPattern.exec(text)) !== null) {
    const key = match[1].trim()
    const value = match[2].trim()
    if (key && value) fields[key] = value
  }
  return fields
}

// ── 대차요청 날짜 해석: "금일", "내일", "2026-02-22" 등
function parseRequestDate(str: string): string {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  if (!str || str.includes('금일') || str.includes('오늘') || str.includes('즉시')) return todayStr
  if (str.includes('내일')) {
    today.setDate(today.getDate() + 1)
    return today.toISOString().split('T')[0]
  }
  if (str.includes('모레') || str.includes('내일모레')) {
    today.setDate(today.getDate() + 2)
    return today.toISOString().split('T')[0]
  }

  // 한국어 날짜 시도
  const parsed = parseKoreanDatetime(str)
  return parsed.date
}

// ── 입고지 파싱: "화성상용서비스(주), 경기도 화성시 암소고개로 255-18, 010-3455-8478"
function parseRepairShop(str: string): { name: string; address: string; phone: string } {
  const parts = str.split(',').map(s => s.trim())
  let name = '', address = '', phone = ''
  for (const p of parts) {
    if (/01[016789]-?\d{3,4}-?\d{4}/.test(p)) phone = p
    else if (/[시군구읍면동로길]/.test(p)) address = p
    else if (!name) name = p
    else address = address ? `${address}, ${p}` : p
  }
  return { name, address, phone }
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
    const payload = await request.json()

    // ── 토큰 검증
    const webhookToken = payload.token
    const expectedTokens = process.env.JANDI_REPLACEMENT_TOKEN
    if (expectedTokens) {
      const tokenList = expectedTokens.split(',').map(t => t.trim())
      if (!tokenList.includes(webhookToken)) {
        return jandiResponse('⛔ 인증 실패', '#FF0000')
      }
    }

    const rawText = payload.data || payload.text || ''
    const writerName = payload.writer?.name || '알 수 없음'
    const roomName = payload.roomName || ''

    if (!rawText || rawText.trim().length < 10) {
      return jandiResponse('⚠️ 대차요청 내용이 부족합니다.', '#FF9800')
    }

    // ── 헤더 + 필드 파싱
    const lines = rawText.split('\n').map((l: string) => l.trim()).filter(Boolean)
    let header = parseHeaderLine('')
    const firstLine = lines[0] || ''
    if (firstLine.includes('/') && !firstLine.startsWith('*')) {
      header = parseHeaderLine(firstLine)
    }

    const fields = parseFields(rawText)

    // ── 차량번호 추출 (대차요청은 "차량번호,차종" 형태로 올 수 있음)
    let carNumber = ''
    let carModel = ''
    const carField = fields['차량번호,차종'] || fields['차량번호'] || ''
    if (carField.includes(',')) {
      const parts = carField.split(',').map(s => s.trim())
      carNumber = parts[0]
      carModel = parts.slice(1).join(' ')
    } else {
      carNumber = carField || header.carNumber
    }

    if (!carNumber) {
      return jandiResponse('⚠️ 차량번호를 찾을 수 없습니다.', '#FF9800')
    }

    const supabase = getSupabaseAdmin()
    const cleanCarNum = carNumber.replace(/\s/g, '')

    // ── 과실 유형
    const faultField = fields['사고(가/피해/단독)'] || fields['사고'] || header.faultType || ''
    let faultRatio = 50
    let dispatchCategory = 'insurance_victim'
    if (faultField.includes('피해')) { faultRatio = 0; dispatchCategory = 'insurance_victim' }
    else if (faultField.includes('가해') || faultField.includes('과실')) { faultRatio = 100; dispatchCategory = 'insurance_at_fault' }
    else if (faultField.includes('단독') || faultField.includes('자차')) { faultRatio = 100; dispatchCategory = 'insurance_own' }

    // ── 보험사
    const ownIns = parseInsurance(fields['자차보험사'] || '')
    const counterIns = parseInsurance(fields['상대보험사'] || '')

    // ── 운전자/통보자
    const driver = parsePersonField(fields['운전자'] || '')
    const reporter = parsePersonField(fields['통보자'] || '')

    // ── 고객명 정리
    const rawCustomer = fields['고객명'] || ''
    const customerName = rawCustomer.replace(/\[.*?\]/g, '').trim()
    const hasSpecialContract = rawCustomer.includes('임직원특약')

    // ── 사고일시
    const accidentDt = parseKoreanDatetime(fields['사고일시'] || fields['접수일시'] || '')

    // ── 대차 전용 필드
    const requestDate = parseRequestDate(fields['대차요청날짜'] || '')
    const deliveryLocation = fields['대차요청지'] || ''
    const repairShop = parseRepairShop(fields['입고지'] || '')
    const billingType = fields['청구내용(고객/스카이/대물)'] || fields['청구내용'] || ''
    const capitalCompany = fields['캐피탈사'] || header.clientName || ''
    const additionalNotes = fields['추가내용'] || ''

    // ── 면책금 (캐피탈사 필드에 포함될 수 있음: "iM캐피탈 DGB_SELF300,000")
    let deductible = 0
    const deductibleMatch = capitalCompany.match(/(\d{1,3}(?:,\d{3})+|\d+)$/)
    if (deductibleMatch) {
      deductible = parseAmount(deductibleMatch[1])
    }

    // ── DB: 차량 조회
    const { data: car } = await supabase
      .from('cars')
      .select('id, company_id, number, brand, model, status')
      .or(`number.ilike.%${cleanCarNum}%`)
      .limit(1)
      .single()

    // 회사 ID 결정
    let companyId = car?.company_id
    if (!companyId) {
      const { data: defaultCompany } = await supabase.from('companies').select('id').limit(1).single()
      companyId = defaultCompany?.id
    }
    if (!companyId) {
      return jandiResponse('⚠️ 회사 정보를 찾을 수 없습니다.', '#FF9800')
    }

    // ── 활성 계약 조회
    let contractId = null
    let customerId = null
    if (car) {
      const { data: activeContract } = await supabase
        .from('contracts')
        .select('id, customer_id')
        .eq('car_id', car.id)
        .eq('company_id', companyId)
        .eq('status', 'active')
        .limit(1)
        .single()
      contractId = activeContract?.id || null
      customerId = activeContract?.customer_id || null
    }

    // ── 1) accident_records INSERT (사고 내역 보관)
    const accidentInsert: Record<string, any> = {
      company_id: companyId,
      car_id: car?.id || null,
      contract_id: contractId,
      customer_id: customerId,
      accident_date: accidentDt.date,
      accident_time: accidentDt.time,
      accident_location: deliveryLocation || fields['사고장소'] || '',
      accident_type: faultRatio === 100 && faultField.includes('단독') ? 'self_damage' : 'collision',
      fault_ratio: faultRatio,
      description: fields['사고내용'] || '',
      driver_name: driver.name || reporter.name || customerName,
      driver_phone: driver.phone || reporter.phone || '',
      driver_relation: driver.relation || '',
      counterpart_insurance: counterIns.company || '',
      insurance_company: ownIns.company || '',
      insurance_claim_no: ownIns.claimNo || '',
      customer_deductible: deductible,
      repair_shop_name: repairShop.name || '',
      repair_start_date: repairShop.name ? accidentDt.date : null,
      vehicle_condition: 'repairable',
      status: 'reported',
      source: 'jandi_replacement',
      jandi_raw: rawText,
      jandi_topic: roomName,
      notes: [
        `[잔디 대차요청] 작성자: ${writerName} / 토픽: ${roomName}`,
        `접수시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
        `거래처: ${capitalCompany}`,
        `정산: ${header.settlementType || '-'} / 과실: ${faultField}`,
        `대차요청일: ${requestDate} / 대차요청지: ${deliveryLocation}`,
        `입고지: ${repairShop.name} ${repairShop.address} ${repairShop.phone}`,
        `청구: ${billingType}`,
        hasSpecialContract ? '임직원특약 해당' : '',
        additionalNotes ? `추가: ${additionalNotes}` : '',
        fields['파손부위'] ? `파손부위: ${fields['파손부위']}` : '',
        fields['접수자'] ? `접수자: ${fields['접수자']}` : '',
      ].filter(Boolean).join('\n'),
    }

    const { data: accident, error: accErr } = await supabase
      .from('accident_records')
      .insert(accidentInsert)
      .select('id')
      .single()

    if (accErr) {
      console.error('사고 등록 실패:', JSON.stringify(accErr))
      return jandiResponse(`❌ 사고 등록 실패: ${accErr.message}`, '#FF0000')
    }

    // ── 2) 배정 가능 차량 추천
    // 유휴 차량 (status = available/idle) 조회
    const { data: availableCars } = await supabase
      .from('cars')
      .select('id, number, brand, model, trim, year, status')
      .eq('company_id', companyId)
      .in('status', ['available', 'idle', '대기'])
      .order('brand', { ascending: true })
      .limit(10)

    // 차량 클래스 추정 (사고 차량 모델 기반)
    const modelLower = (carModel || car?.model || '').toLowerCase()
    let sizeCategory = ''
    if (/모닝|스파크|레이|다마스|캐스퍼/.test(modelLower)) sizeCategory = '경차/소형'
    else if (/아반떼|k3|소나타|k5|말리부|i30/.test(modelLower)) sizeCategory = '준중형/중형'
    else if (/그랜저|k8|제네시스|g80|g90/.test(modelLower)) sizeCategory = '준대형/대형'
    else if (/투싼|스포티지|싼타페|쏘렌토|셀토스/.test(modelLower)) sizeCategory = 'SUV'
    else if (/model\s*[y3s]|아이오닉|ev6|ev9/.test(modelLower)) sizeCategory = '전기차'

    // 추천 차량 목록 구성
    let carListText = ''
    if (availableCars && availableCars.length > 0) {
      carListText = availableCars.map((c, i) =>
        `  ${i + 1}. ${c.number} — ${c.brand} ${c.model}${c.trim ? ' ' + c.trim : ''} (${c.year || '-'})`
      ).join('\n')
    } else {
      carListText = '  현재 배정 가능한 유휴 차량이 없습니다.'
    }

    // ── 3) 차량 상태 변경 (사고 차량)
    if (car) {
      await supabase.from('cars').update({ status: 'accident' }).eq('id', car.id)
      await supabase.from('vehicle_status_log').insert({
        company_id: companyId,
        car_id: car.id,
        old_status: car.status || 'active',
        new_status: 'accident',
        related_type: 'accident',
        related_id: String(accident.id),
        memo: `잔디 대차요청 #${accident.id}`,
      })
    }

    // ── 4) 잔디 응답
    const carLabel = car ? `${car.number} (${car.brand} ${car.model})` : `${carNumber} (${carModel || '미등록'})`

    return jandiResponse(
      `✅ 대차요청 접수 완료 [#${accident.id}]\n\n` +
      `🚗 사고차량: ${carLabel}\n` +
      `👤 고객: ${customerName || '-'} / 운전자: ${driver.name || '-'}\n` +
      `💥 과실: ${faultField || '-'} / 청구: ${billingType || '-'}\n` +
      `📅 대차요청일: ${requestDate}\n` +
      `📍 대차요청지: ${deliveryLocation || '-'}\n` +
      `🔧 입고지: ${repairShop.name || '-'}\n` +
      (ownIns.company ? `🏢 자차보험: ${ownIns.company}\n` : '') +
      (counterIns.company ? `🏢 상대보험: ${counterIns.company} (${counterIns.claimNo || '-'})\n` : '') +
      `\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📋 배정 가능 차량${sizeCategory ? ` (사고차: ${sizeCategory})` : ''}:\n` +
      `${carListText}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `\n👉 ERP 배차관리에서 차량을 배정해주세요.`,
      '#3498DB'
    )

  } catch (err: any) {
    console.error('잔디 대차요청 웹훅 오류:', err)
    return jandiResponse(`❌ 서버 오류: ${err.message || '알 수 없는 오류'}`, '#FF0000')
  }
}

// ============================================
// GET — 연결 테스트
// ============================================
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'jandi-replacement-webhook',
    message: '잔디 대차요청 웹훅 엔드포인트 정상 동작 중',
    parsed_fields: [
      '대차업체', '캐피탈사', '차량번호,차종', '접수일시', '사고일시',
      '고객명', '통보자', '운전자', '사고(가/피해/단독)', '사고내용', '파손부위',
      '자차보험사', '상대보험사', '대차요청날짜', '대차요청지', '입고지',
      '청구내용(고객/스카이/대물)', '추가내용', '접수자',
    ],
  })
}
