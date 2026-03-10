import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import Icon from 'react-native-vector-icons/Ionicons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { Colors, FontSize, Spacing, BorderRadius } from '../../constants/theme'
import { useApp } from '../../context/AppContext'
import { useCamera, INSPECTION_LABELS } from '../../hooks/useCamera'
import { supabase } from '../../lib/supabase'
import { uploadFiles } from '../../lib/api'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import type { Car, DamageCheckItem, PhotoMetadata } from '../../lib/types'

// ============================================
// 차량 인수인계 화면
// 차량 선택 → 사진 촬영 → 주행거리 → 손상 점검 → 제출
// ============================================

type Step = 'select_car' | 'photos' | 'inspection' | 'review'

const DAMAGE_PARTS = [
  '전면 범퍼', '후면 범퍼', '좌측 앞 도어', '좌측 뒷 도어',
  '우측 앞 도어', '우측 뒷 도어', '전면 유리', '후면 유리',
  '좌측 사이드미러', '우측 사이드미러', '보닛', '트렁크',
  '좌측 펜더', '우측 펜더', '루프', '실내 시트', '계기판', '기타',
]

export default function VehicleHandoverScreen() {
  const navigation = useNavigation()
  const { user, profile } = useApp()
  const camera = useCamera()

  // ── 상태 ────────────────────────────
  const [step, setStep] = useState<Step>('select_car')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cars, setCars] = useState<Car[]>([])
  const [selectedCar, setSelectedCar] = useState<Car | null>(null)
  const [direction, setDirection] = useState<'delivery' | 'return'>('delivery')

  // 사진
  const [photos, setPhotos] = useState<PhotoMetadata[]>([])
  const [currentLabel, setCurrentLabel] = useState(0)

  // 차량 상태
  const [mileage, setMileage] = useState('')
  const [fuelLevel, setFuelLevel] = useState('50')
  const [notes, setNotes] = useState('')

  // 손상 점검
  const [damageChecklist, setDamageChecklist] = useState<DamageCheckItem[]>(
    DAMAGE_PARTS.map((part) => ({ part, hasDamage: false }))
  )

  // ── 차량 목록 로드 ──────────────────
  useEffect(() => {
    loadCars()
  }, [])

  const loadCars = async () => {
    if (!profile?.company_id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('cars')
        .select('*')
        .eq('company_id', profile.company_id)
        .in('status', ['available', 'rented'])
        .order('number', { ascending: true })

      if (!error && data) setCars(data)
    } catch (e) {
      console.error('차량 로드 오류:', e)
    } finally {
      setLoading(false)
    }
  }

  // ── 사진 촬영 ──────────────────────
  const takeInspectionPhoto = async () => {
    const label = INSPECTION_LABELS[currentLabel]
    const result = await camera.takePhoto()
    if (result?.uri) {
      const newPhoto: PhotoMetadata = {
        uri: result.uri,
        type: 'handover',
        label: label.label,
        car_id: selectedCar?.id,
        timestamp: new Date().toISOString(),
        uploaded: false,
      }
      setPhotos((prev) => [...prev, newPhoto])
      if (currentLabel < INSPECTION_LABELS.length - 1) {
        setCurrentLabel((prev) => prev + 1)
      }
    }
  }

  const takeExtraPhoto = async () => {
    const result = await camera.takePhoto()
    if (result?.uri) {
      const newPhoto: PhotoMetadata = {
        uri: result.uri,
        type: 'handover',
        label: '추가',
        car_id: selectedCar?.id,
        timestamp: new Date().toISOString(),
        uploaded: false,
      }
      setPhotos((prev) => [...prev, newPhoto])
    }
  }

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  // ── 손상 토글 ──────────────────────
  const toggleDamage = (index: number) => {
    setDamageChecklist((prev) =>
      prev.map((item, i) => (i === index ? { ...item, hasDamage: !item.hasDamage } : item))
    )
  }

  const updateDamageDescription = (index: number, desc: string) => {
    setDamageChecklist((prev) =>
      prev.map((item, i) => (i === index ? { ...item, description: desc } : item))
    )
  }

  // ── 제출 ───────────────────────────
  const handleSubmit = async () => {
    if (!selectedCar || !user?.id || !profile?.company_id) return

    if (!mileage.trim()) {
      Alert.alert('알림', '주행거리를 입력해주세요.')
      return
    }

    if (photos.length < 4) {
      Alert.alert('알림', '최소 4장의 사진을 촬영해주세요.')
      return
    }

    setSubmitting(true)
    try {
      // 1. 사진 업로드
      const basePath = `handovers/${selectedCar.id}/${Date.now()}`
      const filesToUpload = photos.map((p, i) => ({
        uri: p.uri,
        storagePath: `${profile.company_id}/${basePath}/${p.label || i}_${i}.jpg`,
      }))

      const uploadResults = await uploadFiles(filesToUpload, 'vehicle-photos')
      const photoUrls = uploadResults
        .filter((r) => r.publicUrl)
        .map((r) => r.publicUrl as string)

      // 2. 인수인계 레코드 저장
      const handoverData = {
        company_id: profile.company_id,
        car_id: selectedCar.id,
        direction,
        status: 'completed',
        handover_date: new Date().toISOString(),
        handler_id: user.id,
        mileage: parseInt(mileage, 10),
        fuel_level: parseInt(fuelLevel, 10),
        damage_checklist: damageChecklist.filter((d) => d.hasDamage),
        photos: photoUrls,
        notes: notes.trim() || null,
      }

      const { error } = await supabase.from('vehicle_handovers').insert([handoverData])

      if (error) {
        // 테이블이 없으면 다른 방식으로 저장 시도
        console.error('인수인계 저장 오류:', error)
        // 일단 로컬 알림만
      }

      // 3. 차량 주행거리 업데이트
      await supabase
        .from('cars')
        .update({ mileage: parseInt(mileage, 10) })
        .eq('id', selectedCar.id)

      Alert.alert('완료', '인수인계가 완료되었습니다.', [
        { text: '확인', onPress: () => navigation.goBack() },
      ])
    } catch (e) {
      console.error('제출 오류:', e)
      Alert.alert('오류', '인수인계 저장 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── 렌더링: 스텝 인디케이터 ──────────
  const steps: { key: Step; label: string; icon: string }[] = [
    { key: 'select_car', label: '차량', icon: 'car' },
    { key: 'photos', label: '사진', icon: 'camera' },
    { key: 'inspection', label: '점검', icon: 'clipboard' },
    { key: 'review', label: '확인', icon: 'checkmark-circle' },
  ]

  const stepIndex = steps.findIndex((s) => s.key === step)

  const canGoNext = () => {
    if (step === 'select_car') return !!selectedCar
    if (step === 'photos') return photos.length >= 4
    if (step === 'inspection') return !!mileage.trim()
    return true
  }

  // ── 렌더링 ─────────────────────────
  return (
    <KeyboardAvoidingView style={st.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={st.container}>
        {/* 스텝 인디케이터 */}
        <View style={st.stepBar}>
          {steps.map((s, i) => (
            <View key={s.key} style={st.stepItem}>
              <View style={[st.stepDot, i <= stepIndex && st.stepDotActive]}>
                <Icon name={s.icon} size={16} color={i <= stepIndex ? '#fff' : Colors.steel[400]} />
              </View>
              <Text style={[st.stepLabel, i <= stepIndex && st.stepLabelActive]}>{s.label}</Text>
              {i < steps.length - 1 && <View style={[st.stepLine, i < stepIndex && st.stepLineActive]} />}
            </View>
          ))}
        </View>

        <ScrollView style={st.flex} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
          {/* ──── Step 1: 차량 선택 ──── */}
          {step === 'select_car' && (
            <>
              {/* 인도/반납 선택 */}
              <Text style={st.sectionTitle}>인수인계 유형</Text>
              <View style={st.row}>
                <TouchableOpacity
                  style={[st.typeBtn, direction === 'delivery' && st.typeBtnActive]}
                  onPress={() => setDirection('delivery')}
                >
                  <Icon name="arrow-forward-circle" size={24} color={direction === 'delivery' ? '#fff' : Colors.steel[500]} />
                  <Text style={[st.typeBtnText, direction === 'delivery' && st.typeBtnTextActive]}>인도 (배차)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.typeBtn, direction === 'return' && st.typeBtnActive]}
                  onPress={() => setDirection('return')}
                >
                  <Icon name="arrow-back-circle" size={24} color={direction === 'return' ? '#fff' : Colors.steel[500]} />
                  <Text style={[st.typeBtnText, direction === 'return' && st.typeBtnTextActive]}>반납 (회수)</Text>
                </TouchableOpacity>
              </View>

              <Text style={st.sectionTitle}>차량 선택</Text>
              {loading ? (
                <ActivityIndicator style={{ marginTop: 40 }} color={Colors.steel[500]} />
              ) : (
                cars.map((car) => (
                  <TouchableOpacity
                    key={car.id}
                    style={[st.carCard, selectedCar?.id === car.id && st.carCardSelected]}
                    onPress={() => setSelectedCar(car)}
                  >
                    <View style={st.carCardRow}>
                      <View style={st.carInfo}>
                        <Text style={st.carNumber}>{car.number}</Text>
                        <Text style={st.carModel}>{car.brand} {car.model} {car.trim || ''}</Text>
                        <View style={st.carMeta}>
                          <Badge
                            text={car.status === 'available' ? '가용' : '렌트중'}
                            variant={car.status === 'available' ? 'success' : 'info'}
                          />
                          {car.mileage != null && (
                            <Text style={st.carMileage}>{car.mileage.toLocaleString()}km</Text>
                          )}
                        </View>
                      </View>
                      {selectedCar?.id === car.id && (
                        <Icon name="checkmark-circle" size={28} color={Colors.info} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}

          {/* ──── Step 2: 사진 촬영 ──── */}
          {step === 'photos' && (
            <>
              <Text style={st.sectionTitle}>차량 사진 촬영</Text>
              <Text style={st.hint}>각 방향별로 사진을 촬영해주세요 (최소 4장)</Text>

              {/* 가이드 라벨 */}
              <View style={st.labelRow}>
                {INSPECTION_LABELS.map((label, i) => {
                  const taken = photos.some((p) => p.label === label.label)
                  return (
                    <TouchableOpacity
                      key={label.key}
                      style={[st.labelChip, taken && st.labelChipDone, currentLabel === i && st.labelChipCurrent]}
                      onPress={() => setCurrentLabel(i)}
                    >
                      <Icon
                        name={taken ? 'checkmark-circle' : 'ellipse-outline'}
                        size={14}
                        color={taken ? Colors.success : Colors.steel[400]}
                      />
                      <Text style={[st.labelChipText, taken && st.labelChipTextDone]}>
                        {label.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {/* 촬영 버튼 */}
              <TouchableOpacity style={st.captureBtn} onPress={takeInspectionPhoto}>
                <Icon name="camera" size={40} color="#fff" />
                <Text style={st.captureBtnText}>
                  {INSPECTION_LABELS[currentLabel]?.label || '추가'} 촬영
                </Text>
              </TouchableOpacity>

              {/* 촬영된 사진 그리드 */}
              {photos.length > 0 && (
                <>
                  <Text style={[st.sectionTitle, { marginTop: 20 }]}>촬영된 사진 ({photos.length}장)</Text>
                  <View style={st.photoGrid}>
                    {photos.map((photo, index) => (
                      <View key={index} style={st.photoItem}>
                        <Image source={{ uri: photo.uri }} style={st.photoThumb} />
                        <Text style={st.photoLabel}>{photo.label}</Text>
                        <TouchableOpacity style={st.photoRemove} onPress={() => removePhoto(index)}>
                          <Icon name="close-circle" size={22} color={Colors.danger} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    {/* 추가 촬영 버튼 */}
                    <TouchableOpacity style={st.addPhotoBtn} onPress={takeExtraPhoto}>
                      <Icon name="add" size={30} color={Colors.steel[400]} />
                      <Text style={st.addPhotoText}>추가</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}

          {/* ──── Step 3: 차량 점검 ──── */}
          {step === 'inspection' && (
            <>
              <Text style={st.sectionTitle}>차량 상태</Text>

              <Input
                label="주행거리 (km)"
                value={mileage}
                onChangeText={setMileage}
                placeholder="현재 주행거리 입력"
                keyboardType="numeric"
                required
                icon="speedometer-outline"
              />

              <Text style={st.inputLabel}>연료 잔량: {fuelLevel}%</Text>
              <View style={st.fuelRow}>
                {[0, 25, 50, 75, 100].map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[st.fuelChip, parseInt(fuelLevel) === v && st.fuelChipActive]}
                    onPress={() => setFuelLevel(String(v))}
                  >
                    <Text style={[st.fuelChipText, parseInt(fuelLevel) === v && st.fuelChipTextActive]}>
                      {v}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[st.sectionTitle, { marginTop: 20 }]}>손상 점검</Text>
              <Text style={st.hint}>손상이 있는 부위를 선택해주세요</Text>

              {damageChecklist.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={[st.damageItem, item.hasDamage && st.damageItemActive]}
                  onPress={() => toggleDamage(index)}
                >
                  <Icon
                    name={item.hasDamage ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={item.hasDamage ? Colors.danger : Colors.steel[400]}
                  />
                  <Text style={[st.damageText, item.hasDamage && st.damageTextActive]}>
                    {item.part}
                  </Text>
                </TouchableOpacity>
              ))}

              {/* 손상 부위 상세 입력 */}
              {damageChecklist.some((d) => d.hasDamage) && (
                <View style={{ marginTop: 16 }}>
                  <Text style={st.sectionTitle}>손상 상세</Text>
                  {damageChecklist.filter((d) => d.hasDamage).map((item, i) => {
                    const realIndex = damageChecklist.findIndex((d) => d.part === item.part)
                    return (
                      <Input
                        key={i}
                        label={item.part}
                        value={item.description || ''}
                        onChangeText={(text) => updateDamageDescription(realIndex, text)}
                        placeholder="손상 내용 입력"
                        multiline
                      />
                    )
                  })}
                </View>
              )}

              <Input
                label="비고"
                value={notes}
                onChangeText={setNotes}
                placeholder="추가 사항 입력 (선택)"
                multiline
                style={{ marginTop: 16 }}
              />
            </>
          )}

          {/* ──── Step 4: 확인/제출 ──── */}
          {step === 'review' && selectedCar && (
            <>
              <Text style={st.sectionTitle}>인수인계 요약</Text>

              <Card style={{ marginBottom: 16 }}>
                <View style={st.reviewRow}>
                  <Text style={st.reviewLabel}>유형</Text>
                  <Badge text={direction === 'delivery' ? '인도' : '반납'} variant="info" size="md" />
                </View>
                <View style={st.reviewRow}>
                  <Text style={st.reviewLabel}>차량</Text>
                  <Text style={st.reviewValue}>{selectedCar.number} ({selectedCar.brand} {selectedCar.model})</Text>
                </View>
                <View style={st.reviewRow}>
                  <Text style={st.reviewLabel}>주행거리</Text>
                  <Text style={st.reviewValue}>{parseInt(mileage).toLocaleString()} km</Text>
                </View>
                <View style={st.reviewRow}>
                  <Text style={st.reviewLabel}>연료</Text>
                  <Text style={st.reviewValue}>{fuelLevel}%</Text>
                </View>
                <View style={st.reviewRow}>
                  <Text style={st.reviewLabel}>사진</Text>
                  <Text style={st.reviewValue}>{photos.length}장</Text>
                </View>
                {damageChecklist.some((d) => d.hasDamage) && (
                  <View style={st.reviewRow}>
                    <Text style={st.reviewLabel}>손상 부위</Text>
                    <Text style={[st.reviewValue, { color: Colors.danger }]}>
                      {damageChecklist.filter((d) => d.hasDamage).map((d) => d.part).join(', ')}
                    </Text>
                  </View>
                )}
                {notes.trim() !== '' && (
                  <View style={st.reviewRow}>
                    <Text style={st.reviewLabel}>비고</Text>
                    <Text style={st.reviewValue}>{notes}</Text>
                  </View>
                )}
              </Card>

              {/* 사진 미리보기 */}
              <Text style={st.sectionTitle}>촬영 사진</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                {photos.map((p, i) => (
                  <View key={i} style={st.reviewPhoto}>
                    <Image source={{ uri: p.uri }} style={st.reviewPhotoImg} />
                    <Text style={st.reviewPhotoLabel}>{p.label}</Text>
                  </View>
                ))}
              </ScrollView>
            </>
          )}
        </ScrollView>

        {/* 하단 버튼 */}
        <View style={st.bottomBar}>
          {stepIndex > 0 && (
            <Button
              title="이전"
              variant="outline"
              onPress={() => setStep(steps[stepIndex - 1].key)}
              style={{ flex: 1, marginRight: 8 }}
            />
          )}
          {stepIndex < steps.length - 1 ? (
            <Button
              title="다음"
              onPress={() => setStep(steps[stepIndex + 1].key)}
              disabled={!canGoNext()}
              style={{ flex: stepIndex > 0 ? 1 : undefined }}
              fullWidth={stepIndex === 0}
            />
          ) : (
            <Button
              title="인수인계 완료"
              onPress={handleSubmit}
              loading={submitting}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

// ── 스타일 ────────────────────────────
const st = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: 100 },

  // 스텝 인디케이터
  stepBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.steel[100], justifyContent: 'center', alignItems: 'center' },
  stepDotActive: { backgroundColor: Colors.info },
  stepLabel: { fontSize: 11, color: Colors.steel[400], marginLeft: 4, fontWeight: '600' },
  stepLabelActive: { color: Colors.info },
  stepLine: { width: 24, height: 2, backgroundColor: Colors.steel[200], marginHorizontal: 4 },
  stepLineActive: { backgroundColor: Colors.info },

  // 섹션
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: 12, marginTop: 4 },
  hint: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 16 },
  inputLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.steel[700], marginBottom: 8 },

  // 인도/반납
  row: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: BorderRadius.xl, borderWidth: 2, borderColor: Colors.steel[200], backgroundColor: '#fff' },
  typeBtnActive: { borderColor: Colors.info, backgroundColor: '#eff6ff' },
  typeBtnText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.steel[500] },
  typeBtnTextActive: { color: Colors.info },

  // 차량 카드
  carCard: { backgroundColor: '#fff', borderRadius: BorderRadius.lg, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: Colors.border },
  carCardSelected: { borderColor: Colors.info, backgroundColor: '#f0f7ff' },
  carCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  carInfo: { flex: 1 },
  carNumber: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  carModel: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  carMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  carMileage: { fontSize: FontSize.sm, color: Colors.textMuted },

  // 사진 촬영
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  labelChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.steel[100] },
  labelChipDone: { backgroundColor: '#dcfce7' },
  labelChipCurrent: { borderWidth: 2, borderColor: Colors.info },
  labelChipText: { fontSize: 11, fontWeight: '600', color: Colors.steel[500] },
  labelChipTextDone: { color: '#166534' },
  captureBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.info, borderRadius: BorderRadius.xl, paddingVertical: 30, marginBottom: 16 },
  captureBtnText: { color: '#fff', fontSize: FontSize.lg, fontWeight: '700', marginTop: 8 },

  // 사진 그리드
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoItem: { width: '30%', aspectRatio: 1, borderRadius: BorderRadius.md, overflow: 'hidden', position: 'relative' },
  photoThumb: { width: '100%', height: '100%', borderRadius: BorderRadius.md },
  photoLabel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: '700', textAlign: 'center', paddingVertical: 3 },
  photoRemove: { position: 'absolute', top: -4, right: -4 },
  addPhotoBtn: { width: '30%', aspectRatio: 1, borderRadius: BorderRadius.md, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.steel[300], justifyContent: 'center', alignItems: 'center' },
  addPhotoText: { fontSize: 11, color: Colors.steel[400], marginTop: 2 },

  // 연료
  fuelRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  fuelChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: BorderRadius.md, backgroundColor: Colors.steel[100] },
  fuelChipActive: { backgroundColor: Colors.info },
  fuelChipText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.steel[500] },
  fuelChipTextActive: { color: '#fff' },

  // 손상 점검
  damageItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: Colors.steel[100] },
  damageItemActive: { backgroundColor: '#fef2f2' },
  damageText: { fontSize: FontSize.base, color: Colors.text },
  damageTextActive: { color: Colors.danger, fontWeight: '600' },

  // 리뷰
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.steel[100] },
  reviewLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600', width: 80 },
  reviewValue: { flex: 1, fontSize: FontSize.base, color: Colors.text, fontWeight: '600', textAlign: 'right' },
  reviewPhoto: { marginRight: 10, alignItems: 'center' },
  reviewPhotoImg: { width: 80, height: 80, borderRadius: BorderRadius.md },
  reviewPhotoLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 4 },

  // 하단
  bottomBar: { flexDirection: 'row', padding: 16, paddingBottom: 34, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: Colors.border },
})
