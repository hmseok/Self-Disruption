import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Switch,
} from 'react-native'
import Icon from 'react-native-vector-icons/Ionicons'
import { useNavigation } from '@react-navigation/native'
import { Colors, FontSize, Spacing, BorderRadius } from '../../constants/theme'
import { useApp } from '../../context/AppContext'
import { useCamera } from '../../hooks/useCamera'
import { useLocation } from '../../hooks/useLocation'
import { supabase } from '../../lib/supabase'
import { uploadFiles } from '../../lib/api'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import type { Car, AccidentType, AccidentSeverity, PhotoMetadata, WitnessInfo, CounterpartInfo } from '../../lib/types'

// ============================================
// 사고 접수 화면
// GPS 위치 자동캡처 + 사진 + 상세 정보 입력
// ============================================

const ACCIDENT_TYPES: { key: AccidentType; label: string; icon: string }[] = [
  { key: 'collision', label: '충돌', icon: 'car-sport' },
  { key: 'single_vehicle', label: '자차 사고', icon: 'car' },
  { key: 'property_damage', label: '재물 손괴', icon: 'business' },
  { key: 'hit_and_run', label: '뺑소니', icon: 'alert-circle' },
  { key: 'theft', label: '도난', icon: 'lock-open' },
  { key: 'vandalism', label: '파손', icon: 'hammer' },
  { key: 'natural_disaster', label: '자연재해', icon: 'thunderstorm' },
  { key: 'other', label: '기타', icon: 'ellipsis-horizontal' },
]

const SEVERITY_OPTIONS: { key: AccidentSeverity; label: string; color: string; bg: string }[] = [
  { key: 'minor', label: '경미', color: '#166534', bg: '#dcfce7' },
  { key: 'moderate', label: '보통', color: '#1e40af', bg: '#dbeafe' },
  { key: 'severe', label: '심각', color: '#92400e', bg: '#fef3c7' },
  { key: 'total_loss', label: '전손', color: '#991b1b', bg: '#fee2e2' },
]

export default function AccidentReportScreen() {
  const navigation = useNavigation()
  const { user, profile } = useApp()
  const camera = useCamera()
  const loc = useLocation()

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cars, setCars] = useState<Car[]>([])
  const [locationLoading, setLocationLoading] = useState(false)

  // 폼 데이터
  const [selectedCar, setSelectedCar] = useState<Car | null>(null)
  const [accidentType, setAccidentType] = useState<AccidentType | null>(null)
  const [severity, setSeverity] = useState<AccidentSeverity>('moderate')
  const [description, setDescription] = useState('')
  const [accidentLocation, setAccidentLocation] = useState('')
  const [latitude, setLatitude] = useState<number | undefined>()
  const [longitude, setLongitude] = useState<number | undefined>()

  // 운전자 정보
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')

  // 상대방 정보
  const [hasCounterpart, setHasCounterpart] = useState(false)
  const [counterpartName, setCounterpartName] = useState('')
  const [counterpartPhone, setCounterpartPhone] = useState('')
  const [counterpartVehicle, setCounterpartVehicle] = useState('')
  const [counterpartInsurance, setCounterpartInsurance] = useState('')

  // 경찰/보험
  const [policeReported, setPoliceReported] = useState(false)
  const [policeReportNo, setPoliceReportNo] = useState('')

  // 목격자
  const [witnesses, setWitnesses] = useState<WitnessInfo[]>([])

  // 사진
  const [photos, setPhotos] = useState<PhotoMetadata[]>([])

  // 비용
  const [estimatedCost, setEstimatedCost] = useState('')
  const [notes, setNotes] = useState('')

  // ── 초기 로드 ──────────────────────
  useEffect(() => {
    loadCars()
    captureLocation()
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
    } finally {
      setLoading(false)
    }
  }

  const captureLocation = async () => {
    setLocationLoading(true)
    try {
      const result = await loc.getCurrentLocation()
      if (result) {
        setLatitude(result.latitude)
        setLongitude(result.longitude)
        if (result.address) setAccidentLocation(result.address)
      }
    } finally {
      setLocationLoading(false)
    }
  }

  // ── 사진 ───────────────────────────
  const takePhoto = async () => {
    const result = await camera.takePhoto()
    if (result?.uri) {
      setPhotos((prev) => [...prev, {
        uri: result.uri!,
        type: 'accident',
        label: `사고_${prev.length + 1}`,
        car_id: selectedCar?.id,
        latitude,
        longitude,
        timestamp: new Date().toISOString(),
        uploaded: false,
      }])
    }
  }

  // ── 목격자 ─────────────────────────
  const addWitness = () => {
    setWitnesses((prev) => [...prev, { name: '', phone: '' }])
  }
  const updateWitness = (index: number, field: keyof WitnessInfo, value: string) => {
    setWitnesses((prev) => prev.map((w, i) => (i === index ? { ...w, [field]: value } : w)))
  }
  const removeWitness = (index: number) => {
    setWitnesses((prev) => prev.filter((_, i) => i !== index))
  }

  // ── 제출 ───────────────────────────
  const handleSubmit = async () => {
    if (!selectedCar || !accidentType || !user?.id || !profile?.company_id) {
      Alert.alert('알림', '차량과 사고 유형을 선택해주세요.')
      return
    }
    if (!driverName.trim()) {
      Alert.alert('알림', '운전자 이름을 입력해주세요.')
      return
    }
    if (photos.length < 1) {
      Alert.alert('알림', '최소 1장의 사진을 촬영해주세요.')
      return
    }

    setSubmitting(true)
    try {
      // 사진 업로드
      let photoUrls: string[] = []
      if (photos.length > 0) {
        const basePath = `accidents/${selectedCar.id}/${Date.now()}`
        const filesToUpload = photos.map((p, i) => ({
          uri: p.uri,
          storagePath: `${profile.company_id}/${basePath}/${i}.jpg`,
        }))
        const results = await uploadFiles(filesToUpload, 'vehicle-photos')
        photoUrls = results.filter((r) => r.publicUrl).map((r) => r.publicUrl as string)
      }

      const now = new Date()
      const reportData = {
        company_id: profile.company_id,
        car_id: selectedCar.id,
        accident_date: now.toISOString().split('T')[0],
        accident_time: now.toTimeString().slice(0, 5),
        accident_type: accidentType,
        accident_location: accidentLocation || '위치 미상',
        fault_ratio: 0,
        description: description.trim(),
        status: 'reported',
        driver_name: driverName.trim(),
        driver_phone: driverPhone.trim(),
        driver_relation: '본인',
        counterpart_name: hasCounterpart ? counterpartName.trim() : null,
        counterpart_phone: hasCounterpart ? counterpartPhone.trim() : null,
        counterpart_vehicle: hasCounterpart ? counterpartVehicle.trim() : null,
        insurance_company: hasCounterpart ? counterpartInsurance.trim() : null,
        police_reported: policeReported,
        police_report_no: policeReported ? policeReportNo.trim() : null,
        estimated_repair_cost: estimatedCost ? parseInt(estimatedCost, 10) : 0,
        photos: photoUrls,
        notes: notes.trim() || null,
        created_by: user.id,
        source: 'mobile_app',
      }

      // 기존 accident_records 테이블에 저장
      const { error } = await supabase.from('accident_records').insert([reportData])

      if (error) {
        console.error('사고접수 저장 오류:', error)
      }

      Alert.alert('완료', '사고가 접수되었습니다.', [
        { text: '확인', onPress: () => navigation.goBack() },
      ])
    } catch (e) {
      console.error('제출 오류:', e)
      Alert.alert('오류', '사고 접수 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── 렌더링 ─────────────────────────
  return (
    <KeyboardAvoidingView style={st.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={st.container} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

        {/* 위치 정보 배너 */}
        <Card style={{ marginBottom: 16, backgroundColor: latitude ? '#f0fdf4' : '#fef3c7' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon
              name={latitude ? 'location' : 'location-outline'}
              size={20}
              color={latitude ? Colors.success : Colors.warning}
            />
            {locationLoading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ActivityIndicator size="small" color={Colors.steel[500]} />
                <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary }}>위치 확인 중...</Text>
              </View>
            ) : latitude ? (
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: FontSize.sm, fontWeight: '700', color: '#166534' }}>위치 확인됨</Text>
                {accidentLocation ? (
                  <Text style={{ fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 }}>{accidentLocation}</Text>
                ) : null}
              </View>
            ) : (
              <TouchableOpacity onPress={captureLocation} style={{ flex: 1 }}>
                <Text style={{ fontSize: FontSize.sm, fontWeight: '700', color: '#92400e' }}>
                  위치를 가져올 수 없습니다. 탭하여 재시도
                </Text>
              </TouchableOpacity>
            )}
            {loc.accuracyWarning && (
              <Text style={{ fontSize: 10, color: Colors.warning }}>{loc.accuracyWarning}</Text>
            )}
          </View>
        </Card>

        {/* 차량 선택 */}
        <Text style={st.sectionTitle}>사고 차량</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {cars.map((car) => (
            <TouchableOpacity
              key={car.id}
              style={[st.carChip, selectedCar?.id === car.id && st.carChipActive]}
              onPress={() => setSelectedCar(car)}
            >
              <Text style={[st.carChipNumber, selectedCar?.id === car.id && { color: '#fff' }]}>{car.number}</Text>
              <Text style={[st.carChipModel, selectedCar?.id === car.id && { color: 'rgba(255,255,255,0.8)' }]}>
                {car.brand} {car.model}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 사고 유형 */}
        <Text style={st.sectionTitle}>사고 유형</Text>
        <View style={st.typeGrid}>
          {ACCIDENT_TYPES.map((type) => (
            <TouchableOpacity
              key={type.key}
              style={[st.typeItem, accidentType === type.key && st.typeItemActive]}
              onPress={() => setAccidentType(type.key)}
            >
              <Icon name={type.icon} size={22} color={accidentType === type.key ? '#fff' : Colors.steel[400]} />
              <Text style={[st.typeLabel, accidentType === type.key && { color: '#fff' }]}>{type.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 심각도 */}
        <Text style={st.sectionTitle}>심각도</Text>
        <View style={st.severityRow}>
          {SEVERITY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[st.severityChip, { backgroundColor: severity === opt.key ? opt.bg : Colors.steel[50] }]}
              onPress={() => setSeverity(opt.key)}
            >
              <Text style={[st.severityText, { color: severity === opt.key ? opt.color : Colors.steel[400] }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 사고 위치 */}
        <Input
          label="사고 위치"
          value={accidentLocation}
          onChangeText={setAccidentLocation}
          placeholder="사고 발생 장소"
          icon="location-outline"
        />

        {/* 사고 내용 */}
        <Input
          label="사고 경위"
          value={description}
          onChangeText={setDescription}
          placeholder="사고 상황을 상세히 설명해주세요"
          multiline
          required
        />

        {/* 운전자 정보 */}
        <Text style={st.sectionTitle}>운전자 정보</Text>
        <Input label="운전자 이름" value={driverName} onChangeText={setDriverName} placeholder="이름" required />
        <Input label="연락처" value={driverPhone} onChangeText={setDriverPhone} placeholder="010-0000-0000" keyboardType="phone-pad" />

        {/* 상대방 정보 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 12 }}>
          <Text style={st.sectionTitle}>상대방 정보</Text>
          <Switch value={hasCounterpart} onValueChange={setHasCounterpart} trackColor={{ true: Colors.info }} />
        </View>
        {hasCounterpart && (
          <>
            <Input label="이름" value={counterpartName} onChangeText={setCounterpartName} placeholder="상대방 이름" />
            <Input label="연락처" value={counterpartPhone} onChangeText={setCounterpartPhone} placeholder="010-0000-0000" keyboardType="phone-pad" />
            <Input label="차량번호" value={counterpartVehicle} onChangeText={setCounterpartVehicle} placeholder="12가 3456" />
            <Input label="보험사" value={counterpartInsurance} onChangeText={setCounterpartInsurance} placeholder="보험회사명" />
          </>
        )}

        {/* 경찰 신고 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 12 }}>
          <Text style={st.sectionTitle}>경찰 신고</Text>
          <Switch value={policeReported} onValueChange={setPoliceReported} trackColor={{ true: Colors.info }} />
        </View>
        {policeReported && (
          <Input label="사고 접수번호" value={policeReportNo} onChangeText={setPoliceReportNo} placeholder="접수번호 입력" />
        )}

        {/* 목격자 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <Text style={st.sectionTitle}>목격자</Text>
          <TouchableOpacity onPress={addWitness} style={{ padding: 4 }}>
            <Icon name="add-circle" size={28} color={Colors.info} />
          </TouchableOpacity>
        </View>
        {witnesses.map((w, i) => (
          <Card key={i} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontWeight: '700', color: Colors.text }}>목격자 {i + 1}</Text>
              <TouchableOpacity onPress={() => removeWitness(i)}>
                <Icon name="trash-outline" size={18} color={Colors.danger} />
              </TouchableOpacity>
            </View>
            <Input label="이름" value={w.name} onChangeText={(v) => updateWitness(i, 'name', v)} placeholder="이름" />
            <Input label="연락처" value={w.phone} onChangeText={(v) => updateWitness(i, 'phone', v)} placeholder="010-0000-0000" keyboardType="phone-pad" />
          </Card>
        ))}

        {/* 사진 */}
        <Text style={st.sectionTitle}>사고 사진</Text>
        <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 12 }}>
          차량 손상 부위, 사고 현장, 관련 차량을 촬영해주세요
        </Text>
        <TouchableOpacity style={st.captureBtn} onPress={takePhoto}>
          <Icon name="camera" size={32} color="#fff" />
          <Text style={st.captureBtnText}>사진 촬영</Text>
        </TouchableOpacity>

        {photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            {photos.map((p, i) => (
              <View key={i} style={{ marginRight: 10, position: 'relative' }}>
                <Image source={{ uri: p.uri }} style={{ width: 80, height: 80, borderRadius: BorderRadius.md }} />
                <TouchableOpacity
                  style={{ position: 'absolute', top: -6, right: -6 }}
                  onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Icon name="close-circle" size={22} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* 예상 비용 */}
        <Input
          label="예상 수리비 (원)"
          value={estimatedCost}
          onChangeText={setEstimatedCost}
          placeholder="예상 수리비"
          keyboardType="numeric"
          style={{ marginTop: 20 }}
        />
        <Input label="비고" value={notes} onChangeText={setNotes} placeholder="추가 참고 사항" multiline />

        {/* 제출 */}
        <View style={{ marginTop: 24, marginBottom: 40 }}>
          <Button
            title="사고 접수"
            onPress={handleSubmit}
            loading={submitting}
            disabled={!selectedCar || !accidentType || !driverName.trim()}
            fullWidth
            size="lg"
            variant="danger"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const st = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg },

  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: 12, marginTop: 4 },

  carChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: BorderRadius.xl, backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.border, marginRight: 10, minWidth: 110 },
  carChipActive: { borderColor: Colors.danger, backgroundColor: Colors.danger },
  carChipNumber: { fontSize: FontSize.base, fontWeight: '800', color: Colors.text },
  carChipModel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  typeItem: { width: '22%', alignItems: 'center', paddingVertical: 14, borderRadius: BorderRadius.xl, backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.border },
  typeItemActive: { borderColor: Colors.danger, backgroundColor: Colors.danger },
  typeLabel: { fontSize: 10, fontWeight: '600', color: Colors.steel[500], marginTop: 4 },

  severityRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  severityChip: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: BorderRadius.xl },
  severityText: { fontSize: FontSize.sm, fontWeight: '700' },

  captureBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.danger, borderRadius: BorderRadius.xl, paddingVertical: 18 },
  captureBtnText: { color: '#fff', fontSize: FontSize.lg, fontWeight: '700' },
})
