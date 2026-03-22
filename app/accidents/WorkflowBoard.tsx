'use client'

import { useState, useMemo } from 'react'

// ============================================
// 워크플로우 단계 정의 (대차/사고 프로세스)
// ============================================
// 전문가 관점에서 추가된 단계:
// - 보험사 승인 확인 (dispatch_preparing 내 체크리스트)
// - 출고 전 사진촬영 (dispatched 내 체크리스트)
// - 반납 시 차량상태 확인 (returning 내 체크리스트)
// - 초과일수/추가비용 확인 (billing 내 체크리스트)

export const WORKFLOW_STAGES = [
  { key: 'accident_reported',     label: '사고접수',     icon: '🚨', color: 'bg-red-500',    lightColor: 'bg-red-50 border-red-200',    textColor: 'text-red-700' },
  { key: 'replacement_requested', label: '대차요청',     icon: '📋', color: 'bg-orange-500',  lightColor: 'bg-orange-50 border-orange-200', textColor: 'text-orange-700' },
  { key: 'customer_contacted',    label: '고객통화',     icon: '📞', color: 'bg-yellow-500',  lightColor: 'bg-yellow-50 border-yellow-200', textColor: 'text-yellow-700' },
  { key: 'dispatch_preparing',    label: '배차준비',     icon: '🔧', color: 'bg-blue-500',    lightColor: 'bg-blue-50 border-blue-200',   textColor: 'text-blue-700' },
  { key: 'dispatched',            label: '배차완료',     icon: '🚗', color: 'bg-indigo-500',  lightColor: 'bg-indigo-50 border-indigo-200', textColor: 'text-indigo-700' },
  { key: 'in_transit_delivery',   label: '탁송(출고)',   icon: '🚛', color: 'bg-cyan-500',    lightColor: 'bg-cyan-50 border-cyan-200',   textColor: 'text-cyan-700' },
  { key: 'in_repair',             label: '공장입고',     icon: '🏭', color: 'bg-purple-500',  lightColor: 'bg-purple-50 border-purple-200', textColor: 'text-purple-700' },
  { key: 'repair_done',           label: '공장출고',     icon: '✅', color: 'bg-violet-500',  lightColor: 'bg-violet-50 border-violet-200', textColor: 'text-violet-700' },
  { key: 'returning',             label: '대차회수',     icon: '🔄', color: 'bg-teal-500',    lightColor: 'bg-teal-50 border-teal-200',   textColor: 'text-teal-700' },
  { key: 'car_returned',          label: '차고지복귀',   icon: '🏠', color: 'bg-emerald-500', lightColor: 'bg-emerald-50 border-emerald-200', textColor: 'text-emerald-700' },
  { key: 'maintenance',           label: '세차/정비',    icon: '🧹', color: 'bg-lime-500',    lightColor: 'bg-lime-50 border-lime-200',   textColor: 'text-lime-700' },
  { key: 'standby',               label: '대기',         icon: '⏸️', color: 'bg-gray-500',    lightColor: 'bg-gray-50 border-gray-200',   textColor: 'text-gray-700' },
  { key: 'billing',               label: '청구',         icon: '💰', color: 'bg-amber-500',   lightColor: 'bg-amber-50 border-amber-200', textColor: 'text-amber-700' },
  { key: 'payment_confirmed',     label: '입금확인',     icon: '✅', color: 'bg-green-500',   lightColor: 'bg-green-50 border-green-200', textColor: 'text-green-700' },
  { key: 'closed',                label: '종결',         icon: '📁', color: 'bg-slate-500',   lightColor: 'bg-slate-50 border-slate-200', textColor: 'text-slate-700' },
] as const

export type WorkflowStage = typeof WORKFLOW_STAGES[number]['key']

// 각 단계별 체크리스트 템플릿
export const STAGE_CHECKLIST: Record<string, { key: string; label: string }[]> = {
  accident_reported: [
    { key: 'accident_info_confirmed', label: '사고 정보 확인' },
    { key: 'car_status_checked', label: '차량 상태 확인 (운행가능 여부)' },
    { key: 'photos_taken', label: '사고 사진 확보' },
  ],
  replacement_requested: [
    { key: 'replacement_needed', label: '대차 필요 여부 확인' },
    { key: 'car_class_confirmed', label: '대차 차급 확인' },
    { key: 'delivery_location_confirmed', label: '인도 장소 확인' },
  ],
  customer_contacted: [
    { key: 'customer_called', label: '고객 전화 연결' },
    { key: 'schedule_confirmed', label: '배차 일정 협의' },
    { key: 'special_request_noted', label: '특이사항 메모' },
  ],
  dispatch_preparing: [
    { key: 'insurance_confirmed', label: '보험사 확인 및 승인' },
    { key: 'fault_confirmed', label: '과실비율 확인' },
    { key: 'car_selected', label: '배차 차량 선정' },
    { key: 'car_condition_checked', label: '배차 차량 상태 점검' },
    { key: 'contract_prepared', label: '대차 계약서 준비' },
  ],
  dispatched: [
    { key: 'pre_photos', label: '출고 전 차량 사진 촬영' },
    { key: 'mileage_recorded', label: '주행거리 기록' },
    { key: 'fuel_level_recorded', label: '연료량 기록' },
    { key: 'contract_signed', label: '계약서 서명 완료' },
    { key: 'customer_handover', label: '고객 인도 완료' },
  ],
  in_transit_delivery: [
    { key: 'transport_arranged', label: '탁송 기사 배정' },
    { key: 'transport_started', label: '탁송 출발' },
    { key: 'transport_completed', label: '탁송 완료 (인도)' },
  ],
  in_repair: [
    { key: 'factory_checked_in', label: '공장 입고 확인' },
    { key: 'repair_estimate', label: '수리 견적 확인' },
    { key: 'repair_progress', label: '수리 진행 확인' },
  ],
  repair_done: [
    { key: 'repair_completed', label: '수리 완료 확인' },
    { key: 'quality_check', label: '수리 품질 확인' },
    { key: 'factory_checked_out', label: '공장 출고' },
  ],
  returning: [
    { key: 'customer_notified', label: '고객에게 반납 안내' },
    { key: 'return_schedule', label: '반납 일정 확정' },
    { key: 'return_transport', label: '탁송/반납 진행' },
    { key: 'return_condition_check', label: '반납 차량 상태 확인' },
    { key: 'return_photos', label: '반납 시 차량 사진 촬영' },
    { key: 'excess_days_check', label: '초과 사용일수 확인' },
  ],
  car_returned: [
    { key: 'car_at_garage', label: '차량 차고지 도착' },
    { key: 'damage_report', label: '손상 여부 확인' },
  ],
  maintenance: [
    { key: 'car_washed', label: '세차 완료' },
    { key: 'interior_cleaned', label: '실내 클리닝' },
    { key: 'maintenance_done', label: '정비 점검 완료' },
    { key: 'consumables_checked', label: '소모품 확인' },
  ],
  billing: [
    { key: 'usage_days_calculated', label: '사용일수 산정' },
    { key: 'billing_amount_set', label: '청구 금액 확정' },
    { key: 'excess_charge_calculated', label: '초과비용/면책금 확인' },
    { key: 'invoice_sent', label: '청구서 발송' },
  ],
  payment_confirmed: [
    { key: 'payment_received', label: '입금 확인' },
    { key: 'amount_verified', label: '금액 일치 확인' },
  ],
}

// ============================================
// 활성 단계 그룹 (보드에 표시할 주요 단계)
// ============================================
const BOARD_GROUPS = [
  { label: '접수/준비', stages: ['accident_reported', 'replacement_requested', 'customer_contacted', 'dispatch_preparing'] },
  { label: '배차/탁송', stages: ['dispatched', 'in_transit_delivery'] },
  { label: '수리', stages: ['in_repair', 'repair_done'] },
  { label: '회수/정비', stages: ['returning', 'car_returned', 'maintenance', 'standby'] },
  { label: '정산', stages: ['billing', 'payment_confirmed'] },
  { label: '완료', stages: ['closed'] },
]

export type AccidentCase = {
  id: number
  car_id: number | null
  car_number?: string
  car_model?: string
  accident_date: string
  accident_time?: string | null
  accident_location?: string
  fault_ratio: number
  description?: string
  driver_name?: string
  driver_phone?: string
  insurance_company?: string
  insurance_claim_no?: string
  counterpart_insurance?: string
  repair_shop_name?: string
  replacement_car_id?: number | null
  replacement_car_number?: string
  delivery_location?: string
  delivery_date?: string
  return_date?: string
  transport_company?: string
  status: string
  workflow_stage: WorkflowStage
  workflow_checklist: Record<string, boolean>
  billing_amount?: number
  payment_received?: number
  payment_date?: string
  assigned_to?: string
  notes?: string
  source?: string
  created_at: string
  updated_at?: string
}

type Props = {
  cases: AccidentCase[]
  cars: { id: number; number: string; brand: string; model: string }[]
  onStageChange: (caseId: number, newStage: WorkflowStage) => void
  onCaseClick: (caseData: AccidentCase) => void
  onChecklistToggle: (caseId: number, checkKey: string, checked: boolean) => void
}

export default function WorkflowBoard({ cases, cars, onStageChange, onCaseClick, onChecklistToggle }: Props) {
  const [viewMode, setViewMode] = useState<'pipeline' | 'list'>('pipeline')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  // 단계별 케이스 그룹핑
  const casesByStage = useMemo(() => {
    const map: Record<string, AccidentCase[]> = {}
    WORKFLOW_STAGES.forEach(s => { map[s.key] = [] })
    cases.forEach(c => {
      const stage = c.workflow_stage || 'accident_reported'
      if (map[stage]) map[stage].push(c)
      else map['accident_reported'].push(c)
    })
    return map
  }, [cases])

  // 활성 케이스 수 (closed 제외)
  const activeCases = cases.filter(c => c.workflow_stage !== 'closed')

  // 차량번호 조회
  const getCarLabel = (c: AccidentCase) => {
    if (c.car_number) return c.car_number
    if (c.car_id) {
      const car = cars.find(car => car.id === c.car_id)
      return car ? car.number : `#${c.car_id}`
    }
    return '미등록'
  }

  const getCarModel = (c: AccidentCase) => {
    if (c.car_model) return c.car_model
    if (c.car_id) {
      const car = cars.find(car => car.id === c.car_id)
      return car ? `${car.brand} ${car.model}` : ''
    }
    return ''
  }

  // 다음 단계 계산
  const getNextStage = (currentStage: string): WorkflowStage | null => {
    const idx = WORKFLOW_STAGES.findIndex(s => s.key === currentStage)
    if (idx < 0 || idx >= WORKFLOW_STAGES.length - 1) return null
    return WORKFLOW_STAGES[idx + 1].key
  }

  const getStageInfo = (key: string) => WORKFLOW_STAGES.find(s => s.key === key) || WORKFLOW_STAGES[0]

  // 경과일 계산
  const getDaysSince = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    return Math.floor((now.getTime() - d.getTime()) / 86400000)
  }

  // ── 파이프라인 뷰 카드 ──
  const renderCaseCard = (c: AccidentCase, compact = false) => {
    const stageInfo = getStageInfo(c.workflow_stage)
    const days = getDaysSince(c.accident_date)
    const nextStage = getNextStage(c.workflow_stage)
    const nextInfo = nextStage ? getStageInfo(nextStage) : null
    const checklist = c.workflow_checklist || {}
    const stageChecks = STAGE_CHECKLIST[c.workflow_stage] || []
    const doneChecks = stageChecks.filter(ck => checklist[ck.key]).length
    const totalChecks = stageChecks.length
    const progress = totalChecks > 0 ? Math.round((doneChecks / totalChecks) * 100) : 100

    return (
      <div
        key={c.id}
        onClick={() => onCaseClick(c)}
        className={`bg-white rounded-xl border shadow-sm cursor-pointer hover:shadow-md transition-all ${
          days > 7 ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-200'
        } ${compact ? 'p-3' : 'p-4'}`}
      >
        {/* 상단: 차량번호 + 경과일 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-black text-gray-900 text-sm">{getCarLabel(c)}</span>
            {c.source === 'jandi_replacement' && (
              <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">대차</span>
            )}
            {c.source === 'jandi_accident' && (
              <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">사고</span>
            )}
          </div>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            days > 14 ? 'bg-red-100 text-red-600' : days > 7 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'
          }`}>
            D+{days}
          </span>
        </div>

        {/* 차종 + 고객 */}
        {!compact && (
          <div className="text-xs text-gray-500 mb-2 space-y-0.5">
            <p className="truncate">{getCarModel(c)}</p>
            {c.driver_name && <p>👤 {c.driver_name}</p>}
            {c.insurance_company && <p>🏢 {c.insurance_company}</p>}
          </div>
        )}

        {/* 체크리스트 진행률 */}
        {totalChecks > 0 && (
          <div className="mb-2">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-gray-400">{doneChecks}/{totalChecks} 완료</span>
              <span className="font-bold text-gray-500">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* 다음 단계 버튼 */}
        {nextStage && progress === 100 && (
          <button
            onClick={(e) => { e.stopPropagation(); onStageChange(c.id, nextStage) }}
            className={`w-full py-1.5 rounded-lg text-xs font-bold text-white ${stageInfo.color} hover:opacity-90 transition-opacity flex items-center justify-center gap-1`}
          >
            {nextInfo?.icon} {nextInfo?.label} →
          </button>
        )}

        {/* 진행 중 체크리스트 미완료 시 힌트 */}
        {totalChecks > 0 && progress < 100 && !compact && (
          <div className="mt-2 space-y-1">
            {stageChecks.filter(ck => !checklist[ck.key]).slice(0, 2).map(ck => (
              <button
                key={ck.key}
                onClick={(e) => { e.stopPropagation(); onChecklistToggle(c.id, ck.key, true) }}
                className="w-full flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 px-2 py-1 rounded transition-colors"
              >
                <span className="w-3.5 h-3.5 rounded border border-gray-300 flex-shrink-0" />
                <span className="truncate">{ck.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── 파이프라인 뷰 ──
  const renderPipeline = () => (
    <div className="space-y-6">
      {/* 요약 바 */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {WORKFLOW_STAGES.filter(s => s.key !== 'closed').map(stage => {
          const count = casesByStage[stage.key]?.length || 0
          if (count === 0) return null
          return (
            <button
              key={stage.key}
              onClick={() => {
                const el = document.getElementById(`stage-${stage.key}`)
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-colors ${stage.lightColor}`}
            >
              <span>{stage.icon}</span>
              <span className={stage.textColor}>{stage.label}</span>
              <span className={`min-w-[20px] h-5 rounded-full ${stage.color} text-white text-[10px] flex items-center justify-center`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* 단계별 그룹 */}
      {BOARD_GROUPS.map(group => {
        const groupCases = group.stages.flatMap(s => casesByStage[s] || [])
        if (groupCases.length === 0) return null

        return (
          <div key={group.label} className="space-y-3">
            <h3 className="text-sm font-black text-gray-800 flex items-center gap-2">
              {group.label}
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold">{groupCases.length}</span>
            </h3>

            {/* 단계별 서브그룹 */}
            {group.stages.map(stageKey => {
              const stageCases = casesByStage[stageKey] || []
              if (stageCases.length === 0) return null
              const stageInfo = getStageInfo(stageKey)

              return (
                <div key={stageKey} id={`stage-${stageKey}`} className={`rounded-2xl border p-4 ${stageInfo.lightColor}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-7 h-7 rounded-lg ${stageInfo.color} text-white flex items-center justify-center text-sm`}>
                      {stageInfo.icon}
                    </span>
                    <span className={`font-bold text-sm ${stageInfo.textColor}`}>{stageInfo.label}</span>
                    <span className="text-xs text-gray-400 ml-auto">{stageCases.length}건</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {stageCases.map(c => renderCaseCard(c))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {/* 활성 건 없을 때 */}
      {activeCases.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">🎉</div>
          <p className="font-bold text-lg text-gray-500">진행 중인 케이스가 없습니다</p>
          <p className="text-sm mt-2">잔디에서 사고접수/대차요청이 들어오면 자동으로 표시됩니다.</p>
        </div>
      )}
    </div>
  )

  // ── 리스트 뷰 ──
  const renderList = () => (
    <div className="space-y-2">
      {cases.filter(c => c.workflow_stage !== 'closed').sort((a, b) => {
        const aIdx = WORKFLOW_STAGES.findIndex(s => s.key === a.workflow_stage)
        const bIdx = WORKFLOW_STAGES.findIndex(s => s.key === b.workflow_stage)
        return aIdx - bIdx
      }).map(c => {
        const stageInfo = getStageInfo(c.workflow_stage)
        const days = getDaysSince(c.accident_date)
        const nextStage = getNextStage(c.workflow_stage)
        const nextInfo = nextStage ? getStageInfo(nextStage) : null

        return (
          <div
            key={c.id}
            onClick={() => onCaseClick(c)}
            className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-sm transition-all flex items-center gap-4 ${
              days > 7 ? 'border-red-200' : 'border-gray-200'
            }`}
          >
            {/* 단계 뱃지 */}
            <div className={`w-10 h-10 rounded-xl ${stageInfo.color} text-white flex items-center justify-center text-lg flex-shrink-0`}>
              {stageInfo.icon}
            </div>

            {/* 정보 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-gray-900">{getCarLabel(c)}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stageInfo.lightColor} ${stageInfo.textColor}`}>
                  {stageInfo.label}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  days > 14 ? 'bg-red-100 text-red-600' : days > 7 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  D+{days}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {getCarModel(c)} {c.driver_name ? `· ${c.driver_name}` : ''} {c.insurance_company ? `· ${c.insurance_company}` : ''}
              </p>
            </div>

            {/* 다음 단계 버튼 */}
            {nextStage && (
              <button
                onClick={(e) => { e.stopPropagation(); onStageChange(c.id, nextStage) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white ${stageInfo.color} hover:opacity-90 transition-opacity flex-shrink-0`}
              >
                {nextInfo?.icon} {nextInfo?.label} →
              </button>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* 뷰 토글 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-500">
            진행 중 <span className="text-gray-900">{activeCases.length}건</span>
          </span>
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setViewMode('pipeline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              viewMode === 'pipeline' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            파이프라인
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            리스트
          </button>
        </div>
      </div>

      {viewMode === 'pipeline' ? renderPipeline() : renderList()}
    </div>
  )
}
