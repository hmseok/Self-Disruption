'use client'

import { useState, useEffect } from 'react'
import { WORKFLOW_STAGES, STAGE_CHECKLIST, type AccidentCase, type WorkflowStage } from './WorkflowBoard'

type Props = {
  caseData: AccidentCase
  cars: { id: number; number: string; brand: string; model: string }[]
  availableCars: { id: number; number: string; brand: string; model: string; status: string }[]
  onClose: () => void
  onStageChange: (caseId: number, newStage: WorkflowStage) => void
  onChecklistToggle: (caseId: number, checkKey: string, checked: boolean) => void
  onFieldUpdate: (caseId: number, fields: Record<string, any>) => void
}

export default function WorkflowDetail({
  caseData, cars, availableCars, onClose, onStageChange, onChecklistToggle, onFieldUpdate,
}: Props) {
  const [localCase, setLocalCase] = useState(caseData)
  const [editField, setEditField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  useEffect(() => { setLocalCase(caseData) }, [caseData])

  const stageInfo = WORKFLOW_STAGES.find(s => s.key === localCase.workflow_stage) || WORKFLOW_STAGES[0]
  const stageIdx = WORKFLOW_STAGES.findIndex(s => s.key === localCase.workflow_stage)
  const nextStage = stageIdx < WORKFLOW_STAGES.length - 1 ? WORKFLOW_STAGES[stageIdx + 1] : null
  const prevStage = stageIdx > 0 ? WORKFLOW_STAGES[stageIdx - 1] : null
  const checklist = localCase.workflow_checklist || {}
  const stageChecks = STAGE_CHECKLIST[localCase.workflow_stage] || []
  const doneChecks = stageChecks.filter(ck => checklist[ck.key]).length
  const allDone = stageChecks.length === 0 || doneChecks === stageChecks.length

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

  const getDaysSince = (dateStr: string) => {
    return Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 86400000)
  }

  const days = getDaysSince(localCase.accident_date)

  const handleFieldSave = (field: string, value: string) => {
    onFieldUpdate(localCase.id, { [field]: value })
    setLocalCase(prev => ({ ...prev, [field]: value }))
    setEditField(null)
  }

  const EditableField = ({ label, field, value, icon }: { label: string; field: string; value: string; icon: string }) => (
    <div className="flex items-start gap-2">
      <span className="text-sm mt-0.5">{icon}</span>
      <div className="flex-1">
        <label className="text-[10px] font-bold text-gray-400 uppercase">{label}</label>
        {editField === field ? (
          <div className="flex gap-1 mt-0.5">
            <input
              autoFocus
              className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleFieldSave(field, editValue); if (e.key === 'Escape') setEditField(null) }}
            />
            <button onClick={() => handleFieldSave(field, editValue)} className="text-xs bg-blue-500 text-white px-2 rounded font-bold">저장</button>
          </div>
        ) : (
          <p
            className="text-sm text-gray-700 cursor-pointer hover:text-blue-600 transition-colors mt-0.5"
            onClick={() => { setEditField(field); setEditValue(value || '') }}
          >
            {value || <span className="text-gray-300">미입력 (클릭하여 입력)</span>}
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-10 pb-10 overflow-y-auto" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className={`${stageInfo.color} px-6 py-5 text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{stageInfo.icon}</span>
              <div>
                <h2 className="text-xl font-black">{getCarLabel(localCase)}</h2>
                <p className="text-sm opacity-80">{getCarModel(localCase)}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30">
              ✕
            </button>
          </div>
          <div className="flex items-center gap-3 mt-3 text-sm">
            <span className="bg-white/20 px-2 py-0.5 rounded">{stageInfo.label}</span>
            <span className="bg-white/20 px-2 py-0.5 rounded">D+{days}</span>
            <span className="bg-white/20 px-2 py-0.5 rounded">#{localCase.id}</span>
            {localCase.source === 'jandi_replacement' && <span className="bg-white/20 px-2 py-0.5 rounded">대차요청</span>}
            {localCase.source === 'jandi_accident' && <span className="bg-white/20 px-2 py-0.5 rounded">사고접수</span>}
          </div>
        </div>

        {/* 진행 타임라인 (상단 바) */}
        <div className="px-6 py-3 bg-gray-50 border-b overflow-x-auto">
          <div className="flex items-center gap-0.5 min-w-max">
            {WORKFLOW_STAGES.filter(s => s.key !== 'closed').map((stage, idx) => {
              const isCurrent = stage.key === localCase.workflow_stage
              const isPast = idx < stageIdx
              const isFuture = idx > stageIdx
              return (
                <div key={stage.key} className="flex items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-all ${
                      isCurrent ? `${stage.color} text-white ring-2 ring-offset-1 ring-blue-300` :
                      isPast ? 'bg-green-500 text-white' :
                      'bg-gray-200 text-gray-400'
                    }`}
                    title={stage.label}
                  >
                    {isPast ? '✓' : stage.icon}
                  </div>
                  {idx < WORKFLOW_STAGES.length - 2 && (
                    <div className={`w-3 h-0.5 ${isPast ? 'bg-green-400' : 'bg-gray-200'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">

          {/* 현재 단계 체크리스트 */}
          {stageChecks.length > 0 && (
            <div className={`rounded-2xl border p-4 ${stageInfo.lightColor}`}>
              <h3 className={`font-bold text-sm mb-3 flex items-center gap-2 ${stageInfo.textColor}`}>
                {stageInfo.icon} {stageInfo.label} — 체크리스트
                <span className="text-xs font-normal text-gray-400 ml-auto">{doneChecks}/{stageChecks.length}</span>
              </h3>
              <div className="space-y-2">
                {stageChecks.map(ck => {
                  const isDone = checklist[ck.key]
                  return (
                    <button
                      key={ck.key}
                      onClick={() => onChecklistToggle(localCase.id, ck.key, !isDone)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                        isDone ? 'bg-white/80 text-gray-400 line-through' : 'bg-white hover:bg-white/90 text-gray-700'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        isDone ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
                      }`}>
                        {isDone && '✓'}
                      </span>
                      {ck.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 사고/대차 정보 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
            <h4 className="font-bold text-sm text-gray-800">사고 정보</h4>
            <div className="grid grid-cols-2 gap-3">
              <EditableField label="사고일시" field="accident_date" value={`${localCase.accident_date}${localCase.accident_time ? ' ' + localCase.accident_time : ''}`} icon="📅" />
              <EditableField label="사고장소" field="accident_location" value={localCase.accident_location || ''} icon="📍" />
              <EditableField label="운전자" field="driver_name" value={localCase.driver_name || ''} icon="👤" />
              <EditableField label="연락처" field="driver_phone" value={localCase.driver_phone || ''} icon="📱" />
              <EditableField label="자차보험" field="insurance_company" value={localCase.insurance_company || ''} icon="🏢" />
              <EditableField label="상대보험" field="counterpart_insurance" value={localCase.counterpart_insurance || ''} icon="🏢" />
              <EditableField label="접수번호" field="insurance_claim_no" value={localCase.insurance_claim_no || ''} icon="📋" />
              <EditableField label="과실비율" field="fault_ratio" value={localCase.fault_ratio != null ? `${localCase.fault_ratio}%` : ''} icon="⚖️" />
            </div>
          </div>

          {/* 배차/대차 정보 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
            <h4 className="font-bold text-sm text-gray-800">배차/대차 정보</h4>
            <div className="grid grid-cols-2 gap-3">
              <EditableField label="대차 차량" field="replacement_car_number" value={localCase.replacement_car_number || ''} icon="🚗" />
              <EditableField label="인도 장소" field="delivery_location" value={localCase.delivery_location || ''} icon="📍" />
              <EditableField label="출고일" field="delivery_date" value={localCase.delivery_date || ''} icon="📅" />
              <EditableField label="반납일" field="return_date" value={localCase.return_date || ''} icon="📅" />
              <EditableField label="수리업체" field="repair_shop_name" value={localCase.repair_shop_name || ''} icon="🏭" />
              <EditableField label="탁송업체" field="transport_company" value={localCase.transport_company || ''} icon="🚛" />
            </div>

            {/* 배정 가능 차량 추천 (배차준비 단계일 때) */}
            {localCase.workflow_stage === 'dispatch_preparing' && availableCars.length > 0 && (
              <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-200">
                <p className="text-xs font-bold text-blue-700 mb-2">배정 가능 차량</p>
                <div className="space-y-1">
                  {availableCars.slice(0, 5).map(car => (
                    <button
                      key={car.id}
                      onClick={() => {
                        onFieldUpdate(localCase.id, { replacement_car_id: car.id, replacement_car_number: car.number })
                        setLocalCase(prev => ({ ...prev, replacement_car_id: car.id, replacement_car_number: car.number }))
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-blue-100 transition-colors"
                    >
                      <span className="font-bold text-gray-800">{car.number}</span>
                      <span className="text-gray-500">{car.brand} {car.model}</span>
                      {localCase.replacement_car_number === car.number && (
                        <span className="ml-auto text-blue-600 font-bold">✓ 선택됨</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 정산 정보 */}
          {['billing', 'payment_confirmed', 'closed'].includes(localCase.workflow_stage) && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <h4 className="font-bold text-sm text-gray-800">정산 정보</h4>
              <div className="grid grid-cols-2 gap-3">
                <EditableField label="청구 금액" field="billing_amount" value={localCase.billing_amount ? `${localCase.billing_amount.toLocaleString()}원` : ''} icon="💰" />
                <EditableField label="입금 금액" field="payment_received" value={localCase.payment_received ? `${localCase.payment_received.toLocaleString()}원` : ''} icon="💵" />
                <EditableField label="입금일" field="payment_date" value={localCase.payment_date || ''} icon="📅" />
                <EditableField label="담당자" field="assigned_to" value={localCase.assigned_to || ''} icon="🧑" />
              </div>
            </div>
          )}

          {/* 메모 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <h4 className="font-bold text-sm text-gray-800 mb-2">메모</h4>
            <textarea
              className="w-full text-sm border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-300 min-h-[80px] resize-none"
              value={localCase.notes || ''}
              onChange={e => setLocalCase(prev => ({ ...prev, notes: e.target.value }))}
              onBlur={() => onFieldUpdate(localCase.id, { notes: localCase.notes })}
              placeholder="메모를 입력하세요..."
            />
          </div>
        </div>

        {/* 하단 액션 */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center gap-3">
          {prevStage && (
            <button
              onClick={() => onStageChange(localCase.id, prevStage.key)}
              className="px-4 py-2.5 rounded-xl text-sm font-bold border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors"
            >
              ← {prevStage.label}
            </button>
          )}
          <div className="flex-1" />
          {nextStage && (
            <button
              onClick={() => onStageChange(localCase.id, nextStage.key)}
              disabled={!allDone}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all flex items-center gap-2 ${
                allDone
                  ? `${stageInfo.color} hover:opacity-90 shadow-lg`
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              {nextStage.icon} {nextStage.label} →
              {!allDone && <span className="text-[10px] opacity-70">(체크리스트 완료 필요)</span>}
            </button>
          )}
          {localCase.workflow_stage === 'payment_confirmed' && (
            <button
              onClick={() => onStageChange(localCase.id, 'closed')}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-600 hover:bg-slate-700 shadow-lg transition-all"
            >
              📁 종결 처리
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
