// ============================================
// 사고 담당자 자동 배정 엔진
// ============================================
// 배정 기준 (우선순위 순):
//   1. 거래처별 전담 담당자
//   2. 공장별 전담 담당자
//   3. 사고지역별 담당자
//   4. 건별 밸런스 (현재 활성 건 수 기준)
//
// 모든 룰에 매칭 안 되면 → 밸런스 기반 자동 배정
// 수동 배정 시에는 이 엔진을 거치지 않고 직접 handler_id 설정
// ============================================

import { SupabaseClient } from '@supabase/supabase-js'

// ── 타입 ─────────────────────────────────────

export type RuleType =
  | 'client'        // 거래처별
  | 'repair_shop'   // 공장별
  | 'region'        // 사고지역별 (시/도 단위)
  | 'region_detail'  // 사고지역별 (시/군/구 단위)
  | 'fault_type'    // 과실유형별 (가해/피해/자차)
  | 'insurance_type' // 보험종류별

export interface AssignmentRule {
  id: string
  rule_type: RuleType
  rule_value: string          // 매칭할 값 (예: "우리금융캐피탈", "서울특별시")
  handler_id: string          // 배정할 담당자 user_id
  priority: number            // 낮을수록 우선 (1이 최고)
  is_active: boolean
  handler_name?: string       // 조인용
}

export interface HandlerWorkload {
  handler_id: string
  handler_name: string
  active_count: number        // 현재 진행 중인 건 수
  max_capacity: number        // 최대 처리 가능 건 수
  is_available: boolean       // 근무 가능 여부
}

export interface AccidentForAssignment {
  id: number
  accident_location: string   // 사고장소
  repair_shop_name: string    // 공장명
  notes: string               // 거래처 등 파싱된 정보 포함
  fault_ratio: number         // 과실비율
  jandi_raw: string | null    // 원본 메시지 (거래처명 추출용)
  vehicle_condition: string | null
  insurance_company: string   // 보험사
}

export interface AssignmentResult {
  handler_id: string | null
  handler_name: string | null
  matched_rule: string | null   // 어떤 룰로 매칭됐는지
  match_type: 'rule_client' | 'rule_shop' | 'rule_region' | 'rule_region_detail'
    | 'rule_fault' | 'rule_insurance' | 'balance' | 'none'
  confidence: 'high' | 'medium' | 'low'
}

// ── 한국 주소에서 시/도, 시/군/구 추출 ────────────

export function parseRegion(address: string): { sido: string; sigungu: string } {
  if (!address) return { sido: '', sigungu: '' }

  const cleaned = address.trim()

  // 시/도 추출
  const sidoPatterns = [
    '서울특별시', '서울시', '서울',
    '부산광역시', '부산시', '부산',
    '대구광역시', '대구시', '대구',
    '인천광역시', '인천시', '인천',
    '광주광역시', '광주시', '광주',
    '대전광역시', '대전시', '대전',
    '울산광역시', '울산시', '울산',
    '세종특별자치시', '세종시', '세종',
    '경기도', '경기',
    '강원특별자치도', '강원도', '강원',
    '충청북도', '충북',
    '충청남도', '충남',
    '전라북도', '전북특별자치도', '전북',
    '전라남도', '전남',
    '경상북도', '경북',
    '경상남도', '경남',
    '제주특별자치도', '제주도', '제주',
  ]

  // 정규화된 시/도명
  const sidoNormalize: Record<string, string> = {
    '서울특별시': '서울', '서울시': '서울',
    '부산광역시': '부산', '부산시': '부산',
    '대구광역시': '대구', '대구시': '대구',
    '인천광역시': '인천', '인천시': '인천',
    '광주광역시': '광주', '광주시': '광주',
    '대전광역시': '대전', '대전시': '대전',
    '울산광역시': '울산', '울산시': '울산',
    '세종특별자치시': '세종', '세종시': '세종',
    '경기도': '경기',
    '강원특별자치도': '강원', '강원도': '강원',
    '충청북도': '충북', '충청남도': '충남',
    '전라북도': '전북', '전북특별자치도': '전북',
    '전라남도': '전남',
    '경상북도': '경북', '경상남도': '경남',
    '제주특별자치도': '제주', '제주도': '제주',
  }

  let sido = ''
  for (const pattern of sidoPatterns) {
    if (cleaned.includes(pattern)) {
      sido = sidoNormalize[pattern] || pattern
      break
    }
  }

  // 시/군/구 추출
  const sigunguMatch = cleaned.match(
    /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충[북남]|전[북남]|경[북남]|제주)[^\s]*\s+([가-힣]+(?:시|군|구))/
  )
  const sigungu = sigunguMatch?.[1] || ''

  return { sido, sigungu }
}

// ── 잔디 원본에서 거래처명 추출 ────────────────

export function extractClientName(jandi_raw: string | null, notes: string): string {
  if (!jandi_raw && !notes) return ''

  // notes에서 "거래처: XXX" 패턴
  const notesMatch = notes?.match(/거래처:\s*(.+?)(?:\n|$)/)
  if (notesMatch) return notesMatch[1].trim()

  // jandi_raw 헤더에서 두 번째 슬래시 구간
  if (jandi_raw) {
    const firstLine = jandi_raw.split('\n')[0] || ''
    if (firstLine.includes('/') && !firstLine.startsWith('*')) {
      const parts = firstLine.split('/').map(s => s.trim())
      if (parts[1]) return parts[1]
    }
  }

  return ''
}

// ── 과실유형 추출 ──────────────────────────────

export function extractFaultType(jandi_raw: string | null, notes: string, fault_ratio: number): string {
  // notes에서
  const faultMatch = notes?.match(/과실구분:\s*(.+?)(?:\n|$)/)
  if (faultMatch) return faultMatch[1].trim()

  // jandi_raw 헤더에서
  if (jandi_raw) {
    const firstLine = jandi_raw.split('\n')[0] || ''
    if (firstLine.includes('/') && !firstLine.startsWith('*')) {
      const parts = firstLine.split('/').map(s => s.trim())
      if (parts[4]) return parts[4]  // 5번째: 과실구분
    }
  }

  // fault_ratio 기반 추정
  if (fault_ratio >= 100) return '가해'
  if (fault_ratio <= 0) return '피해'
  return ''
}

// ── 메인 배정 엔진 ─────────────────────────────

export async function assignHandler(
  supabase: SupabaseClient,
  accident: AccidentForAssignment
): Promise<AssignmentResult> {

  const noResult: AssignmentResult = {
    handler_id: null,
    handler_name: null,
    matched_rule: null,
    match_type: 'none',
    confidence: 'low',
  }

  // ── 1. 활성 룰 조회 (우선순위 순)
  const { data: rules, error: rulesErr } = await supabase
    .from('assignment_rules')
    .select('*, handler:profiles!assignment_rules_handler_id_fkey(employee_name)')
    .eq('is_active', true)
    .order('priority', { ascending: true })

  if (rulesErr || !rules || rules.length === 0) {
    // 룰 없으면 밸런스 기반으로 fallback
    return await assignByBalance(supabase)
  }

  // ── 2. 사고 건에서 매칭 데이터 추출
  const clientName = extractClientName(accident.jandi_raw, accident.notes)
  const region = parseRegion(accident.accident_location)
  const faultType = extractFaultType(accident.jandi_raw, accident.notes, accident.fault_ratio)
  const shopName = accident.repair_shop_name || ''

  // ── 3. 룰 순회 매칭
  for (const rule of rules) {
    const handlerName = rule.handler?.employee_name || ''
    const ruleValue = rule.rule_value.trim()

    // 담당자 가용성 체크
    const available = await isHandlerAvailable(supabase, rule.handler_id)
    if (!available) continue

    switch (rule.rule_type) {
      case 'client':
        // 거래처명 매칭 (포함 검색)
        if (clientName && clientName.includes(ruleValue)) {
          return {
            handler_id: rule.handler_id,
            handler_name: handlerName,
            matched_rule: `거래처: ${ruleValue}`,
            match_type: 'rule_client',
            confidence: 'high',
          }
        }
        break

      case 'repair_shop':
        // 공장명 매칭
        if (shopName && shopName.includes(ruleValue)) {
          return {
            handler_id: rule.handler_id,
            handler_name: handlerName,
            matched_rule: `공장: ${ruleValue}`,
            match_type: 'rule_shop',
            confidence: 'high',
          }
        }
        break

      case 'region':
        // 시/도 매칭
        if (region.sido && region.sido === ruleValue) {
          return {
            handler_id: rule.handler_id,
            handler_name: handlerName,
            matched_rule: `지역(시도): ${ruleValue}`,
            match_type: 'rule_region',
            confidence: 'medium',
          }
        }
        break

      case 'region_detail':
        // 시/군/구 매칭
        if (region.sigungu && region.sigungu === ruleValue) {
          return {
            handler_id: rule.handler_id,
            handler_name: handlerName,
            matched_rule: `지역(시군구): ${ruleValue}`,
            match_type: 'rule_region_detail',
            confidence: 'high',
          }
        }
        break

      case 'fault_type':
        // 과실유형 매칭
        if (faultType && faultType === ruleValue) {
          return {
            handler_id: rule.handler_id,
            handler_name: handlerName,
            matched_rule: `과실유형: ${ruleValue}`,
            match_type: 'rule_fault',
            confidence: 'medium',
          }
        }
        break

      case 'insurance_type':
        // 보험사 매칭
        if (accident.insurance_company && accident.insurance_company.includes(ruleValue)) {
          return {
            handler_id: rule.handler_id,
            handler_name: handlerName,
            matched_rule: `보험사: ${ruleValue}`,
            match_type: 'rule_insurance',
            confidence: 'medium',
          }
        }
        break
    }
  }

  // ── 4. 룰 매칭 실패 → 밸런스 기반 배정
  return await assignByBalance(supabase)
}

// ── 담당자 가용성 체크 ──────────────────────────

async function isHandlerAvailable(
  supabase: SupabaseClient,
  handlerId: string
): Promise<boolean> {
  // handler_capacity 테이블에서 확인
  const { data: capacity } = await supabase
    .from('handler_capacity')
    .select('max_cases, is_available')
    .eq('handler_id', handlerId)
    .maybeSingle()

  // capacity 설정 없으면 기본 사용 가능
  if (!capacity) return true
  if (!capacity.is_available) return false

  // 현재 활성 건 수 확인
  const { count } = await supabase
    .from('accident_records')
    .select('id', { count: 'exact', head: true })
    .eq('handler_id', handlerId)
    .in('status', ['reported', 'insurance_filed', 'repairing'])

  return (count || 0) < (capacity.max_cases || 999)
}

// ── 밸런스 기반 배정 (가장 여유 있는 담당자) ──────

async function assignByBalance(
  supabase: SupabaseClient
): Promise<AssignmentResult> {

  // 사고팀 소속 활성 담당자 목록
  const { data: handlers } = await supabase
    .from('handler_capacity')
    .select('handler_id, max_cases, is_available, handler:profiles!handler_capacity_handler_id_fkey(employee_name)')
    .eq('is_available', true)

  if (!handlers || handlers.length === 0) {
    return {
      handler_id: null,
      handler_name: null,
      matched_rule: null,
      match_type: 'none',
      confidence: 'low',
    }
  }

  // 각 담당자의 현재 활성 건 수 조회
  const workloads: Array<{ handler_id: string; name: string; active: number; max: number; ratio: number }> = []

  for (const h of handlers) {
    const { count } = await supabase
      .from('accident_records')
      .select('id', { count: 'exact', head: true })
      .eq('handler_id', h.handler_id)
      .in('status', ['reported', 'insurance_filed', 'repairing'])

    const active = count || 0
    const max = h.max_cases || 20
    workloads.push({
      handler_id: h.handler_id,
      name: (h.handler as any)?.employee_name || '',
      active,
      max,
      ratio: active / max,  // 낮을수록 여유
    })
  }

  // 비율이 가장 낮은 (가장 여유 있는) 담당자 선택
  workloads.sort((a, b) => a.ratio - b.ratio)

  const best = workloads[0]
  if (!best || best.ratio >= 1) {
    // 모든 담당자가 max 초과
    return {
      handler_id: null,
      handler_name: null,
      matched_rule: '모든 담당자 최대 건수 초과',
      match_type: 'none',
      confidence: 'low',
    }
  }

  return {
    handler_id: best.handler_id,
    handler_name: best.name,
    matched_rule: `밸런스 배정 (활성 ${best.active}/${best.max}건)`,
    match_type: 'balance',
    confidence: 'low',
  }
}

// ── 배정 실행 (DB 업데이트 + 로그 기록) ──────────

export async function executeAssignment(
  supabase: SupabaseClient,
  accidentId: number,
  handlerId: string,
  matchInfo: {
    match_type: string
    matched_rule: string | null
    is_auto: boolean            // true=자동, false=수동
    assigned_by?: string        // 수동 배정 시 관리자 ID
  }
): Promise<{ success: boolean; error?: string }> {

  // accident_records에 handler_id 업데이트
  const { error: updateErr } = await supabase
    .from('accident_records')
    .update({
      handler_id: handlerId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accidentId)

  if (updateErr) {
    return { success: false, error: updateErr.message }
  }

  // 배정 이력 로그
  const { error: logErr } = await supabase
    .from('assignment_log')
    .insert({
      accident_id: accidentId,
      handler_id: handlerId,
      assignment_type: matchInfo.is_auto ? 'auto' : 'manual',
      match_type: matchInfo.match_type,
      matched_rule: matchInfo.matched_rule,
      assigned_by: matchInfo.assigned_by || null,
    })

  if (logErr) {
    console.error('배정 로그 저장 실패:', logErr)
    // 로그 실패는 치명적이지 않으므로 성공 처리
  }

  return { success: true }
}

// ── 배정 추천 (자동 배정하지 않고 추천만) ─────────

export async function suggestAssignment(
  supabase: SupabaseClient,
  accident: AccidentForAssignment
): Promise<{
  recommended: AssignmentResult
  alternatives: AssignmentResult[]
}> {
  // 메인 추천
  const recommended = await assignHandler(supabase, accident)

  // 대안: 밸런스 기반 상위 3명
  const { data: handlers } = await supabase
    .from('handler_capacity')
    .select('handler_id, max_cases, is_available, handler:profiles!handler_capacity_handler_id_fkey(employee_name)')
    .eq('is_available', true)

  const alternatives: AssignmentResult[] = []

  if (handlers) {
    for (const h of handlers) {
      if (h.handler_id === recommended.handler_id) continue

      const { count } = await supabase
        .from('accident_records')
        .select('id', { count: 'exact', head: true })
        .eq('handler_id', h.handler_id)
        .in('status', ['reported', 'insurance_filed', 'repairing'])

      alternatives.push({
        handler_id: h.handler_id,
        handler_name: (h.handler as any)?.employee_name || '',
        matched_rule: `활성 ${count || 0}/${h.max_cases || 20}건`,
        match_type: 'balance',
        confidence: 'low',
      })
    }
  }

  return { recommended, alternatives: alternatives.slice(0, 3) }
}
