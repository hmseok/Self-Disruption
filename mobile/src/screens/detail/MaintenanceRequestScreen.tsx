import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import Icon from 'react-native-vector-icons/Ionicons'
import { useNavigation } from '@react-navigation/native'
import { Colors, FontSize, Spacing, BorderRadius } from '../../constants/theme'
import { useApp } from '../../context/AppContext'
import { useCamera } from '../../hooks/useCamera'
import { supabase } from '../../lib/supabase'
import { apiPost, uploadFiles } from '../../lib/api'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import type { Car, MaintenanceIssueType, MaintenancePriority, PhotoMetadata } from '../../lib/types'

// ============================================
// 정비 요청 화면
// 차량 선택 → 이슈 유형 → 상세 입력 → 사진 → 제출
// ============================================

const ISSUE_TYPES: { key: MaintenanceIssueType; label: string; icon: string }[] = [
  { key: 'engine', label: '엔진 이상', icon: 'cog' },
  { key: 'tire', label: '타이어', icon: 'ellipse' },
  { key: 'brake', label: '브레이크', icon: 'stop-circle' },
  { key: 'warning_light', label: '경고등', icon: 'warning' },
  { key: 'electrical', label: '전기/전자', icon: 'flash' },
  { key: 'body_damage', label: '외관 손상', icon: 'car' },
  { key: 'oil_change', label: '오일 교환', icon: 'water' },
  { key: 'air_filter', label: '에어필터', icon: 'leaf' },
  { key: 'other', label: '기타', icon: 'ellipsis-horizontal' },
]

const PRIORITY_OPTIONS: { key: MaintenancePriority; label: string; color: string; bg: string }[] = [
  { key: 'low', label: '낮음', color: '#166534', bg: '#dcfce7' },
  { key: 'medium', label: '보통', color: '#1e40af', bg: '#dbeafe' },
  { key: 'high', label: '높음', color: '#92400e', bg: '#fef3c7' },
  { key: 'critical', label: '긴급', color: '#991b1b', bg: '#fee2e2' },
]

export default function MaintenanceRequestScreen() {
  const navigation = useNavigation()
  const { user, profile } = useApp()
  const camera = useCamera()

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cars, setCars] = useState<Car[]>([])

  // 폼 데이터
  const [selectedCar, setSelectedCar] = useState<Car | null>(null)
  const [issueType, setIssueType] = useState<MaintenanceIssueType | null>(null)
  const [priority, setPriority] = useState<MaintenancePriority>('medium')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [mileage, setMileage] = useState('')
  const [photos, setPhotos] = useState<PhotoMetadata[]>([])
  const [repairShopName, setRepairShopName] = useState('')
  const [preferredDate, setPreferredDate] = useState('')

  // ── 차량 로드 ──────────────────────
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
        .in('status', ['available', 'rented', 'maintenance'])
        .order('number', { ascending: true })

      if (!error && data) setCars(data)
    } finally {
      setLoading(false)
    }
  }

  // ── 사진 ───────────────────────────
  const takePhoto = async () => {
    const result = await camera.takePhoto()
    if (result?.uri) {
      setPhotos((prev) => [...prev, {
        uri: result.uri!,
        type: 'maintenance',
        label: `정비_${prev.length + 1}`,
        car_id: selectedCar?.id,
        timestamp: new Date().toISOString(),
        uploaded: false,
      }])
    }
  }

  const pickFromGallery = async () => {
    const result = await camera.pickImage()
    if (result?.uri) {
      setPhotos((prev) => [...prev, {
        uri: result.uri!,
        type: 'maintenance',
        label: `정비_${prev.length + 1}`,
        car_id: selectedCar?.id,
        timestamp: new Date().toISOString(),
        uploaded: false,
      }])
    }
  }

  // ── 제출 ───────────────────────────
  const handleSubmit = async () => {
    if (!selectedCar || !issueType || !user?.id || !profile?.company_id) {
      Alert.alert('알림', '차량과 이슈 유형을 선택해주세요.')
      return
    }

    if (!title.trim()) {
      Alert.alert('알림', '제목을 입력해주세요.')
      return
    }

    setSubmitting(true)
    try {
      // 사진 업로드
      let photoUrls: string[] = []
      if (photos.length > 0) {
        const basePath = `maintenance/${selectedCar.id}/${Date.now()}`
        const filesToUpload = photos.map((p, i) => ({
          uri: p.uri,
          storagePath: `${profile.company_id}/${basePath}/${i}.jpg`,
        }))
        const results = await uploadFiles(filesToUpload, 'vehicle-photos')
        photoUrls = results.filter((r) => r.publicUrl).map((r) => r.publicUrl as string)
      }

      // 정비 요청 저장
      const requestData = {
        company_id: profile.company_id,
        car_id: selectedCar.id,
        reporter_id: user.id,
        issue_type: issueType,
        priority,
        status: 'open',
        title: title.trim(),
        description: description.trim(),
        mileage: mileage ? parseInt(mileage, 10) : null,
        photos: photoUrls,
        repair_shop_name: repairShopName.trim() || null,
        preferred_date: preferredDate || null,
      }

      const { error } = await supabase.from('maintenance_requests').insert([requestData])

      if (error) {
        console.error('정비요청 저장 오류:', error)
      }

      Alert.alert('완료', '정비 요청이 접수되었습니다.', [
        { text: '확인', onPress: () => navigation.goBack() },
      ])
    } catch (e) {
      console.error('제출 오류:', e)
      Alert.alert('오류', '정비 요청 저장 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── 렌더링 ─────────────────────────
  return (
    <KeyboardAvoidingView style={st.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={st.container} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

        {/* 차량 선택 */}
        <Text style={st.sectionTitle}>차량 선택</Text>
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 20 }} color={Colors.steel[500]} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            {cars.map((car) => (
              <TouchableOpacity
                key={car.id}
                style={[st.carChip, selectedCar?.id === car.id && st.carChipActive]}
                onPress={() => {
                  setSelectedCar(car)
                  if (car.mileage) setMileage(String(car.mileage))
                }}
              >
                <Text style={[st.carChipNumber, selectedCar?.id === car.id && st.carChipNumberActive]}>
                  {car.number}
                </Text>
                <Text style={[st.carChipModel, selectedCar?.id === car.id && st.carChipModelActive]}>
                  {car.brand} {car.model}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* 이슈 유형 */}
        <Text style={st.sectionTitle}>이슈 유형</Text>
        <View style={st.issueGrid}>
          {ISSUE_TYPES.map((type) => (
            <TouchableOpacity
              key={type.key}
              style={[st.issueItem, issueType === type.key && st.issueItemActive]}
              onPress={() => {
                setIssueType(type.key)
                if (!title.trim()) setTitle(type.label)
              }}
            >
              <Icon
                name={type.icon}
                size={24}
                color={issueType === type.key ? Colors.info : Colors.steel[400]}
              />
              <Text style={[st.issueLabel, issueType === type.key && st.issueLabelActive]}>
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 우선순위 */}
        <Text style={st.sectionTitle}>우선순위</Text>
        <View style={st.priorityRow}>
          {PRIORITY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[st.priorityChip, { backgroundColor: priority === opt.key ? opt.bg : Colors.steel[50] }]}
              onPress={() => setPriority(opt.key)}
            >
              <Text style={[st.priorityText, { color: priority === opt.key ? opt.color : Colors.steel[400] }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 상세 입력 */}
        <Text style={st.sectionTitle}>상세 정보</Text>
        <Input
          label="제목"
          value={title}
          onChangeText={setTitle}
          placeholder="정비 요청 제목"
          required
        />
        <Input
          label="상세 설명"
          value={description}
          onChangeText={setDescription}
          placeholder="증상이나 문제를 상세히 설명해주세요"
          multiline
        />
        <Input
          label="현재 주행거리 (km)"
          value={mileage}
          onChangeText={setMileage}
          placeholder="주행거리"
          keyboardType="numeric"
        />
        <Input
          label="선호 정비소 (선택)"
          value={repairShopName}
          onChangeText={setRepairShopName}
          placeholder="정비소 이름"
        />

        {/* 사진 첨부 */}
        <Text style={st.sectionTitle}>사진 첨부</Text>
        <View style={st.photoRow}>
          <TouchableOpacity style={st.photoBtn} onPress={takePhoto}>
            <Icon name="camera" size={28} color={Colors.steel[500]} />
            <Text style={st.photoBtnText}>촬영</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.photoBtn} onPress={pickFromGallery}>
            <Icon name="images" size={28} color={Colors.steel[500]} />
            <Text style={st.photoBtnText}>갤러리</Text>
          </TouchableOpacity>
        </View>

        {photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            {photos.map((p, i) => (
              <View key={i} style={st.photoThumbWrap}>
                <Image source={{ uri: p.uri }} style={st.photoThumb} />
                <TouchableOpacity
                  style={st.photoRemove}
                  onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Icon name="close-circle" size={22} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* 제출 버튼 */}
        <View style={{ marginTop: 32, marginBottom: 40 }}>
          <Button
            title="정비 요청 접수"
            onPress={handleSubmit}
            loading={submitting}
            disabled={!selectedCar || !issueType || !title.trim()}
            fullWidth
            size="lg"
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

  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: 12, marginTop: 20 },

  // 차량 선택
  carChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: BorderRadius.xl, backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.border, marginRight: 10, minWidth: 120 },
  carChipActive: { borderColor: Colors.info, backgroundColor: '#eff6ff' },
  carChipNumber: { fontSize: FontSize.base, fontWeight: '800', color: Colors.text },
  carChipNumberActive: { color: Colors.info },
  carChipModel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  carChipModelActive: { color: Colors.info },

  // 이슈 유형
  issueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  issueItem: { width: '30%', alignItems: 'center', paddingVertical: 16, borderRadius: BorderRadius.xl, backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.border },
  issueItemActive: { borderColor: Colors.info, backgroundColor: '#eff6ff' },
  issueLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.steel[500], marginTop: 6 },
  issueLabelActive: { color: Colors.info },

  // 우선순위
  priorityRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  priorityChip: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: BorderRadius.xl },
  priorityText: { fontSize: FontSize.sm, fontWeight: '700' },

  // 사진
  photoRow: { flexDirection: 'row', gap: 12 },
  photoBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20, borderRadius: BorderRadius.xl, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.steel[300], backgroundColor: '#fff' },
  photoBtnText: { fontSize: FontSize.sm, color: Colors.steel[500], marginTop: 4, fontWeight: '600' },
  photoThumbWrap: { marginRight: 10, position: 'relative' },
  photoThumb: { width: 80, height: 80, borderRadius: BorderRadius.md },
  photoRemove: { position: 'absolute', top: -6, right: -6 },
})
