'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'
import { parseTransportText, ParsedRequest, ParsedStop } from '@/app/utils/transport-text-parser'

// ═══════════════════════════════════════════════════════════════
// 탁송 요청 모달 — paste 모드 + 직접 입력 모드
// ═══════════════════════════════════════════════════════════════

const SERVICE_OPTIONS = [
  { v: 'accident_repair', l: '⚠ 사고수리' },
  { v: 'dispatch',        l: '🚙 배차' },
  { v: 'return',          l: '↩ 회수' },
  { v: 'maint_in',        l: '🔧 정비입고' },
  { v: 'maint_out',       l: '🔧 정비출고' },
  { v: 'sale',            l: '💰 매매' },
  { v: 'general',         l: '🚚 일반' },
]

interface Car {
  id: string
  number: string
  brand: string
  model: string
  status?: string
  location?: string | null
  location_label?: string | null
  group?: string
}

interface Location {
  id: string
  code: string
  label: string
  address: string | null
  category?: string
}

interface Stop {
  stop_order: number
  stop_type: 'departure' | 'waypoint' | 'destination'
  location_code: string | null
  location_name: string
  address: string
  contact_name: string
  contact_phone: string
  car_pickup_id: string | null
  car_pickup_external: string
  car_dropoff_id: string | null
  car_dropoff_external: string
  arrival_planned: string
  notes: string
}

const newStop = (order: number, type: Stop['stop_type']): Stop => ({
  stop_order: order, stop_type: type,
  location_code: null, location_name: '', address: '',
  contact_name: '', contact_phone: '',
  car_pickup_id: null, car_pickup_external: '',
  car_dropoff_id: null, car_dropoff_external: '',
  arrival_planned: '', notes: '',
})

type Props = {
  requestId?: string | null
  presetCarId?: string | null
  locations: Location[]
  cars: Car[]
  onClose: () => void
  onSaved: () => void
}

export default function TransportRequestModal({ requestId, presetCarId, locations, cars, onClose, onSaved }: Props) {
  const isEdit = !!requestId

  const [mode, setMode] = useState<'paste' | 'form'>('form')
  const [pasteText, setPasteText] = useState('')
  const [parsedPreview, setParsedPreview] = useState<ParsedRequest | null>(null)

  // 폼 상태
  const [serviceType, setServiceType] = useState('general')
  const [tripType, setTripType] = useState<'one_way' | 'round_trip'>('one_way')
  const [scheduledAt, setScheduledAt] = useState('')
  const [driverType, setDriverType] = useState<'employee' | 'freelancer' | 'external'>('external')
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [photoRequired, setPhotoRequired] = useState(false)
  const [photoTargetPhone, setPhotoTargetPhone] = useState('')
  const [photoReceived, setPhotoReceived] = useState(false)
  const [estimatedFee, setEstimatedFee] = useState('')
  const [notes, setNotes] = useState('')
  const [stops, setStops] = useState<Stop[]>([
    newStop(1, 'departure'),
    newStop(2, 'destination'),
  ])
  const [rawText, setRawText] = useState('')
  const [saving, setSaving] = useState(false)

  // 가용 차량만 (대기 차량 조회)
  const availableCars = useMemo(() => cars.filter(c => c.group === 'available' || c.status === 'active' || c.status === 'available'), [cars])

  // preset car 적용
  useEffect(() => {
    if (presetCarId && stops[0].stop_type === 'departure' && !stops[0].car_pickup_id) {
      setStops(prev => prev.map((s, i) => i === 0 ? { ...s, car_pickup_id: presetCarId } : s))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCarId])

  // 편집 모드: 기존 데이터 로드
  useEffect(() => {
    if (!requestId) return
    ;(async () => {
      const { json } = await fetchWithAuth(`/api/transport-requests?id=${requestId}`)
      const r = json?.data
      if (!r) return
      setServiceType(r.service_type || 'general')
      setTripType(r.trip_type || 'one_way')
      setScheduledAt(r.scheduled_at ? new Date(r.scheduled_at).toISOString().slice(0, 16) : '')
      setDriverType(r.driver_type || 'external')
      setDriverName(r.driver_name || '')
      setDriverPhone(r.driver_phone || '')
      setPhotoRequired(!!r.photo_required)
      setPhotoTargetPhone(r.photo_target_phone || '')
      setPhotoReceived(!!r.photo_received)
      setEstimatedFee(r.estimated_fee != null ? String(r.estimated_fee) : '')
      setNotes(r.notes || '')
      setRawText(r.raw_text || '')
      if (Array.isArray(r.stops) && r.stops.length > 0) {
        setStops(r.stops.map((s: any) => ({
          stop_order: Number(s.stop_order) || 1,
          stop_type: s.stop_type || 'waypoint',
          location_code: s.location_code || null,
          location_name: s.location_name || '',
          address: s.address || '',
          contact_name: s.contact_name || '',
          contact_phone: s.contact_phone || '',
          car_pickup_id: s.car_pickup_id || null,
          car_pickup_external: s.car_pickup_external || '',
          car_dropoff_id: s.car_dropoff_id || null,
          car_dropoff_external: s.car_dropoff_external || '',
          arrival_planned: s.arrival_planned ? new Date(s.arrival_planned).toISOString().slice(0, 16) : '',
          notes: s.notes || '',
        })))
      }
    })()
  }, [requestId])

  // ─── paste 분석 ──
  const analyzePaste = () => {
    if (!pasteText.trim()) { alert('텍스트를 입력하세요'); return }
    const parsed = parseTransportText(pasteText)
    setParsedPreview(parsed)
  }

  const applyParsed = () => {
    if (!parsedPreview) return
    setServiceType(parsedPreview.service_type)
    setTripType(parsedPreview.trip_type)
    setPhotoRequired(parsedPreview.photo_required)
    if (parsedPreview.photo_target_phone) setPhotoTargetPhone(parsedPreview.photo_target_phone)
    if (parsedPreview.notes) setNotes(parsedPreview.notes)
    if (parsedPreview.stops.length > 0) {
      // 회사 차량 자동 매칭 시도 (차량번호 → cars.id)
      const newStops: Stop[] = parsedPreview.stops.map((p: ParsedStop) => {
        const matchPickup = p.car_pickup_external ? matchCarByNumber(p.car_pickup_external, cars) : null
        const matchDropoff = p.car_dropoff_external ? matchCarByNumber(p.car_dropoff_external, cars) : null
        // 위치 코드 매칭 (label 또는 address 부분일치)
        const matchedLoc = matchLocationByText(p.address || p.location_name || '', locations)
        return {
          stop_order: p.stop_order,
          stop_type: p.stop_type,
          location_code: matchedLoc?.code || null,
          location_name: p.location_name || '',
          address: p.address || '',
          contact_name: p.contact_name || '',
          contact_phone: p.contact_phone || '',
          car_pickup_id: matchPickup?.id || null,
          car_pickup_external: matchPickup ? '' : (p.car_pickup_external || ''),
          car_dropoff_id: matchDropoff?.id || null,
          car_dropoff_external: matchDropoff ? '' : (p.car_dropoff_external || ''),
          arrival_planned: '',
          notes: '',
        }
      })
      setStops(newStops)
    }
    setRawText(pasteText)
    setMode('form')  // 분석 완료 → 폼 모드로 전환하여 검토
  }

  // ─── stop 조작 ──
  const addWaypoint = () => {
    const dest = stops[stops.length - 1]
    const insertAt = stops.length - 1
    const newStops = [...stops]
    newStops.splice(insertAt, 0, newStop(0, 'waypoint'))
    // stop_order 재정렬
    newStops.forEach((s, i) => { s.stop_order = i + 1 })
    setStops(newStops)
  }

  const removeStop = (idx: number) => {
    if (stops[idx].stop_type === 'departure' || stops[idx].stop_type === 'destination') {
      alert('출발/도착은 삭제할 수 없습니다')
      return
    }
    const newStops = stops.filter((_, i) => i !== idx)
    newStops.forEach((s, i) => { s.stop_order = i + 1 })
    setStops(newStops)
  }

  const updateStop = (idx: number, k: keyof Stop, v: any) => {
    setStops(prev => prev.map((s, i) => i === idx ? { ...s, [k]: v } : s))
  }

  // ─── 저장 ──
  const save = async () => {
    if (stops.length < 2) { alert('출발지와 도착지는 필수입니다'); return }
    setSaving(true)
    try {
      const body: any = {
        service_type: serviceType,
        trip_type: tripType,
        scheduled_at: scheduledAt || null,
        driver_type: driverType,
        driver_name: driverName || null,
        driver_phone: driverPhone || null,
        photo_required: photoRequired,
        photo_target_phone: photoTargetPhone || null,
        photo_received: photoReceived,
        photo_received_at: photoReceived ? new Date().toISOString() : null,
        estimated_fee: estimatedFee ? Number(estimatedFee) : null,
        notes: notes || null,
        raw_text: rawText || null,
        stops: stops.map(s => ({
          stop_order: s.stop_order,
          stop_type: s.stop_type,
          location_code: s.location_code || null,
          location_name: s.location_name || null,
          address: s.address || null,
          contact_name: s.contact_name || null,
          contact_phone: s.contact_phone || null,
          car_pickup_id: s.car_pickup_id || null,
          car_pickup_external: s.car_pickup_external || null,
          car_dropoff_id: s.car_dropoff_id || null,
          car_dropoff_external: s.car_dropoff_external || null,
          arrival_planned: s.arrival_planned || null,
          notes: s.notes || null,
        })),
      }
      const url = isEdit ? `/api/transport-requests?id=${requestId}` : '/api/transport-requests'
      const method = isEdit ? 'PATCH' : 'POST'
      const { ok, json } = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (ok) onSaved()
      else alert(`저장 실패: ${json?.error}`)
    } finally { setSaving(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000,
      padding: '20px 0', overflowY: 'auto',
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...GLASS.L4, borderRadius: 16, padding: 20,
        maxWidth: 800, width: '90%', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
            🚚 {isEdit ? '탁송 요청 편집' : '탁송 요청 등록'}
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: COLORS.textSecondary }}>×</button>
        </div>

        {/* 모드 토글 */}
        {!isEdit && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button onClick={() => setMode('paste')} style={tabBtn(mode === 'paste')}>📋 텍스트 붙여넣기</button>
            <button onClick={() => setMode('form')} style={tabBtn(mode === 'form')}>✍ 직접 입력</button>
          </div>
        )}

        {/* === paste 모드 === */}
        {mode === 'paste' && !isEdit && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>탁송 요청 텍스트 (라이드탁송 양식 / 키워드 자유 형식 모두 지원)</label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={10}
              placeholder={`예시:
라이드탁송(사고수리/편도/경유지 1)
★이동 동선 / 문정동->하남시->영등포
*출발지 주소 : 문정현대지식산업센터 B동 지하4층 / 서울 송파구 법원로 11길 11
*출발지 연락처 : 010-3359-9559
*차량번호 : 142호 4406 / 싼타페
*경유지 주소 : 호반 써밋 108동 / 하남시 미사강변한강로 270
*경유지 연락처 : 010-6213-9125
*차량 교체 : 199호 6881 / 싼타페
*도착지 주소 : 수정모터스 / 서울시 영등포구 경인로77길 9
*도착지 연락처 : 010-4745-2334
★내/외관 사진 촬영 후 010-3359-9559 번호로 전송 부탁드립니다`}
              style={{
                width: '100%', padding: 10, fontSize: 12, fontFamily: 'monospace',
                borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`,
                background: 'rgba(255,255,255,0.7)',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={analyzePaste} style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8,
                background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer',
              }}>🔍 분석</button>
              {parsedPreview && (
                <>
                  <span style={{
                    padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                    background: parsedPreview.confidence === 'high' ? 'rgba(167,243,208,0.5)' : parsedPreview.confidence === 'medium' ? 'rgba(254,243,199,0.5)' : 'rgba(254,202,202,0.5)',
                    color: parsedPreview.confidence === 'high' ? '#059669' : parsedPreview.confidence === 'medium' ? '#b45309' : '#b91c1c',
                  }}>
                    신뢰도: {parsedPreview.confidence === 'high' ? '높음' : parsedPreview.confidence === 'medium' ? '보통' : '낮음'}
                  </span>
                  <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                    분류: {SERVICE_OPTIONS.find(o => o.v === parsedPreview.service_type)?.l || '?'}
                    {' · '}stops: {parsedPreview.stops.length}개
                    {parsedPreview.unmatched_lines.length > 0 && ` · 미매칭 ${parsedPreview.unmatched_lines.length}줄`}
                  </span>
                  <button onClick={applyParsed} style={{
                    padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8,
                    background: '#059669', color: '#fff', border: 'none', cursor: 'pointer',
                  }}>✓ 적용 → 폼 모드로 검토</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* === form 모드 === */}
        {(mode === 'form' || isEdit) && (
          <>
            {/* 기본 정보 */}
            <Block title="기본 정보">
              <div style={gridStyle()}>
                <Field label="서비스 분류">
                  <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} style={inputStyle}>
                    {SERVICE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </Field>
                <Field label="편도/왕복">
                  <select value={tripType} onChange={(e) => setTripType(e.target.value as any)} style={inputStyle}>
                    <option value="one_way">편도</option>
                    <option value="round_trip">왕복</option>
                  </select>
                </Field>
                <Field label="예정 일시">
                  <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="예상 탁송비">
                  <input type="number" value={estimatedFee} onChange={(e) => setEstimatedFee(e.target.value)} style={inputStyle} placeholder="원" />
                </Field>
              </div>
            </Block>

            {/* Stops */}
            <Block title={`이동 경로 (${stops.length} stops)`}>
              {stops.map((s, idx) => (
                <StopEditor
                  key={idx}
                  stop={s}
                  index={idx}
                  total={stops.length}
                  cars={cars}
                  availableCars={availableCars}
                  locations={locations}
                  onChange={(k, v) => updateStop(idx, k as any, v)}
                  onRemove={s.stop_type === 'waypoint' ? () => removeStop(idx) : null}
                />
              ))}
              <button onClick={addWaypoint} style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                background: 'rgba(124,58,237,0.1)', color: '#7c3aed',
                border: '1px solid rgba(124,58,237,0.35)', cursor: 'pointer',
                marginTop: 8,
              }}>+ 경유지 추가</button>
            </Block>

            {/* 기사 정보 */}
            <Block title="담당 기사">
              <div style={gridStyle()}>
                <Field label="구분">
                  <select value={driverType} onChange={(e) => setDriverType(e.target.value as any)} style={inputStyle}>
                    <option value="external">외부 기사</option>
                    <option value="freelancer">프리랜서</option>
                    <option value="employee">직원</option>
                  </select>
                </Field>
                <Field label="이름">
                  <input value={driverName} onChange={(e) => setDriverName(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="연락처">
                  <input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} style={inputStyle} placeholder="010-XXXX-XXXX" />
                </Field>
              </div>
            </Block>

            {/* 사진 인증 */}
            <Block title="사진 인증">
              <div style={gridStyle()}>
                <Field label="사진 촬영 요청">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLORS.textPrimary, padding: '8px 0' }}>
                    <input type="checkbox" checked={photoRequired} onChange={(e) => setPhotoRequired(e.target.checked)} />
                    내/외관 사진 촬영 요청
                  </label>
                </Field>
                <Field label="사진 받을 번호">
                  <input value={photoTargetPhone} onChange={(e) => setPhotoTargetPhone(e.target.value)} disabled={!photoRequired}
                    style={inputStyle} placeholder="010-XXXX-XXXX" />
                </Field>
                <Field label="사진 수신 여부">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLORS.textPrimary, padding: '8px 0' }}>
                    <input type="checkbox" checked={photoReceived} onChange={(e) => setPhotoReceived(e.target.checked)} />
                    수신 완료
                  </label>
                </Field>
              </div>
            </Block>

            {/* 메모 */}
            <Block title="메모">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                rows={3} style={{ ...inputStyle, fontFamily: 'inherit' }} placeholder="기타 사항 / 미매칭 내용" />
            </Block>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={onClose} disabled={saving} style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 600,
                background: 'rgba(0,0,0,0.05)', color: COLORS.textSecondary,
                border: 'none', borderRadius: 8, cursor: 'pointer',
              }}>취소</button>
              <button onClick={save} disabled={saving} style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 700,
                background: COLORS.primary, color: '#fff',
                border: 'none', borderRadius: 8, cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}>{saving ? '저장 중...' : (isEdit ? '저장' : '요청 등록')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Stop 편집기 ──────────────────────────────────────────────
function StopEditor({ stop, index, total, cars, availableCars, locations, onChange, onRemove }: {
  stop: Stop; index: number; total: number;
  cars: Car[]; availableCars: Car[]; locations: Location[];
  onChange: (k: keyof Stop, v: any) => void; onRemove: (() => void) | null
}) {
  const isWaypoint = stop.stop_type === 'waypoint'
  const isDeparture = stop.stop_type === 'departure'
  const isDestination = stop.stop_type === 'destination'
  const tone = isDeparture ? '#1d4ed8' : isDestination ? '#059669' : '#7c3aed'
  const label = isDeparture ? `🟦 출발 (Stop ${stop.stop_order})` : isDestination ? `🟩 도착 (Stop ${stop.stop_order})` : `🟪 경유 ${stop.stop_order - 1}`

  return (
    <div style={{
      ...GLASS.L3, border: `1px solid ${tone}33`,
      borderRadius: 10, padding: 12, marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: tone }}>{label}</span>
        {onRemove && (
          <button onClick={onRemove} style={{
            border: 'none', background: 'rgba(239,68,68,0.1)', color: '#b91c1c',
            padding: '2px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
          }}>✕ 제거</button>
        )}
      </div>

      <div style={gridStyle()}>
        <Field label="위치 코드">
          <select value={stop.location_code || ''} onChange={(e) => {
            const code = e.target.value || null
            onChange('location_code', code)
            // 코드 선택 시 location_name/address 자동 채움
            if (code) {
              const loc = locations.find(l => l.code === code)
              if (loc) {
                if (!stop.location_name) onChange('location_name', loc.label)
                if (!stop.address && loc.address) onChange('address', loc.address)
              }
            }
          }} style={inputStyle}>
            <option value="">— 선택 —</option>
            {locations.map(l => <option key={l.id} value={l.code}>{l.label}</option>)}
          </select>
        </Field>
        <Field label="위치 상세 (장소명)">
          <input value={stop.location_name} onChange={(e) => onChange('location_name', e.target.value)}
            style={inputStyle} placeholder="문정현대지식산업센터 B동 지하4층" />
        </Field>
        <Field label="주소" full>
          <input value={stop.address} onChange={(e) => onChange('address', e.target.value)}
            style={inputStyle} placeholder="서울 송파구 법원로 11길 11" />
        </Field>
        <Field label="담당자 이름">
          <input value={stop.contact_name} onChange={(e) => onChange('contact_name', e.target.value)}
            style={inputStyle} />
        </Field>
        <Field label="연락처">
          <input value={stop.contact_phone} onChange={(e) => onChange('contact_phone', e.target.value)}
            style={inputStyle} placeholder="010-XXXX-XXXX" />
        </Field>

        {/* 차량 액션 */}
        {isDeparture && (
          <Field label="픽업 차량 (이 stop에서 싣기)" full>
            <CarSelector
              value={stop.car_pickup_id}
              externalValue={stop.car_pickup_external}
              cars={cars}
              availableCars={availableCars}
              onSelectCar={(id) => { onChange('car_pickup_id', id); onChange('car_pickup_external', '') }}
              onExternal={(v) => { onChange('car_pickup_external', v); onChange('car_pickup_id', null) }}
            />
          </Field>
        )}

        {isWaypoint && (
          <>
            <Field label="🔄 차량 교체 — Drop">
              <CarSelector
                value={stop.car_dropoff_id}
                externalValue={stop.car_dropoff_external}
                cars={cars}
                availableCars={cars}
                onSelectCar={(id) => { onChange('car_dropoff_id', id); onChange('car_dropoff_external', '') }}
                onExternal={(v) => { onChange('car_dropoff_external', v); onChange('car_dropoff_id', null) }}
              />
            </Field>
            <Field label="🔄 차량 교체 — Pickup">
              <CarSelector
                value={stop.car_pickup_id}
                externalValue={stop.car_pickup_external}
                cars={cars}
                availableCars={availableCars}
                onSelectCar={(id) => { onChange('car_pickup_id', id); onChange('car_pickup_external', '') }}
                onExternal={(v) => { onChange('car_pickup_external', v); onChange('car_pickup_id', null) }}
              />
            </Field>
          </>
        )}

        {isDestination && (
          <Field label="도착 차량 (이 stop에서 내리기)" full>
            <CarSelector
              value={stop.car_dropoff_id}
              externalValue={stop.car_dropoff_external}
              cars={cars}
              availableCars={cars}
              onSelectCar={(id) => { onChange('car_dropoff_id', id); onChange('car_dropoff_external', '') }}
              onExternal={(v) => { onChange('car_dropoff_external', v); onChange('car_dropoff_id', null) }}
            />
          </Field>
        )}

        <Field label="도착 예정 시각">
          <input type="datetime-local" value={stop.arrival_planned} onChange={(e) => onChange('arrival_planned', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="메모">
          <input value={stop.notes} onChange={(e) => onChange('notes', e.target.value)} style={inputStyle} />
        </Field>
      </div>
    </div>
  )
}

// ─── 차량 선택기 (드롭다운 + 외부 차량 직접 입력) ───────────────────
function CarSelector({ value, externalValue, cars, availableCars, onSelectCar, onExternal }: {
  value: string | null; externalValue: string;
  cars: Car[]; availableCars: Car[];
  onSelectCar: (id: string | null) => void;
  onExternal: (v: string) => void;
}) {
  const [showAvailable, setShowAvailable] = useState(true)
  const list = showAvailable ? availableCars : cars
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <select value={value || ''} onChange={(e) => onSelectCar(e.target.value || null)} style={inputStyle}>
        <option value="">— 회사 차량 선택 —</option>
        {list.map(c => (
          <option key={c.id} value={c.id}>
            {c.number} · {c.brand} {c.model}
            {c.location_label ? ` · ${c.location_label}` : ''}
          </option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label style={{ fontSize: 10, color: COLORS.textMuted, display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={showAvailable} onChange={(e) => setShowAvailable(e.target.checked)} />
          가용만
        </label>
        <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 'auto' }}>또는 외부 차량:</span>
        <input
          value={externalValue}
          onChange={(e) => onExternal(e.target.value)}
          placeholder="142호 4406"
          style={{
            ...inputStyle, padding: '4px 8px', fontSize: 11,
            flex: 1, minWidth: 100,
          }}
        />
      </div>
    </div>
  )
}

// ─── 차량번호 매칭 헬퍼 ─────────────────────────────────────
function matchCarByNumber(num: string, cars: Car[]): Car | null {
  if (!num) return null
  const norm = num.replace(/\s+/g, '').replace(/호/g, '하')
  for (const c of cars) {
    const cn = String(c.number || '').replace(/\s+/g, '')
    if (cn === norm || cn === num.replace(/\s+/g, '')) return c
  }
  // 끝 4자리 부분 일치
  const tail = norm.slice(-4)
  if (tail.length === 4) {
    for (const c of cars) {
      if (String(c.number || '').replace(/\s+/g, '').endsWith(tail)) return c
    }
  }
  return null
}

function matchLocationByText(text: string, locations: Location[]): Location | null {
  if (!text) return null
  for (const l of locations) {
    if (l.label && text.includes(l.label)) return l
    if (l.address && text.includes(l.address)) return l
  }
  return null
}

// ─── UI 헬퍼 ────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', fontSize: 12,
  borderRadius: 6, border: `1px solid ${COLORS.borderSubtle}`,
  background: 'rgba(255,255,255,0.7)', color: COLORS.textPrimary,
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: COLORS.textSecondary,
  display: 'block', marginBottom: 4,
}

function gridStyle(): React.CSSProperties {
  return { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: '8px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8,
    background: active ? COLORS.primary : 'rgba(0,0,0,0.04)',
    color: active ? '#fff' : COLORS.textSecondary,
    border: 'none', cursor: 'pointer',
  }
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? 'span 2' : 'auto' }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}
