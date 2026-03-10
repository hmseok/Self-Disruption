import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator, TextInput,
} from 'react-native'
import Icon from 'react-native-vector-icons/Ionicons'
import { useNavigation } from '@react-navigation/native'
import { Colors, FontSize, Spacing, BorderRadius } from '../../constants/theme'
import { useApp } from '../../context/AppContext'
import { useCamera } from '../../hooks/useCamera'
import { supabase } from '../../lib/supabase'
import { uploadFiles } from '../../lib/api'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import type { Car, ExpenseCategory } from '../../lib/types'

// ============================================
// 영수증 제출 화면
// 카테고리 선택 → 금액/가맹점 → 사진 촬영 → 제출
// ============================================

const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string; icon: string }[] = [
  { key: '주유비', label: '주유비', icon: 'speedometer' },
  { key: '충전', label: '충전', icon: 'battery-charging' },
  { key: '주차비', label: '주차비', icon: 'car' },
  { key: '접대', label: '접대', icon: 'people' },
  { key: '식비', label: '식비', icon: 'restaurant' },
  { key: '회식비', label: '회식비', icon: 'beer' },
  { key: '야근식대', label: '야근식대', icon: 'moon' },
  { key: '외근식대', label: '외근식대', icon: 'walk' },
  { key: '교통비', label: '교통비', icon: 'bus' },
  { key: '사무용품', label: '사무용품', icon: 'clipboard' },
  { key: '택배비', label: '택배비', icon: 'cube' },
  { key: '기타', label: '기타', icon: 'ellipsis-horizontal' },
]

// 차량 관련 카테고리 (차량 선택 UI 노출)
const CAR_RELATED_CATEGORIES: ExpenseCategory[] = ['주유비', '충전', '주차비']

export default function ExpenseReceiptScreen() {
  const navigation = useNavigation()
  const { user, profile } = useApp()
  const camera = useCamera()

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cars, setCars] = useState<Car[]>([])

  // 폼 데이터
  const [category, setCategory] = useState<ExpenseCategory | null>(null)
  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [itemName, setItemName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [selectedCar, setSelectedCar] = useState<Car | null>(null)
  const [photoUri, setPhotoUri] = useState<string | null>(null)

  // 차량 관련 카테고리인지 체크
  const isCarRelated = category ? CAR_RELATED_CATEGORIES.includes(category) : false

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
    if (result?.uri) setPhotoUri(result.uri)
  }

  const pickFromGallery = async () => {
    const result = await camera.pickImage()
    if (result?.uri) setPhotoUri(result.uri)
  }

  // ── 금액 포맷 ─────────────────────
  const formatAmount = (val: string) => {
    const num = val.replace(/[^0-9]/g, '')
    setAmount(num)
  }

  const displayAmount = amount ? parseInt(amount, 10).toLocaleString() : ''

  // ── 제출 ───────────────────────────
  const handleSubmit = async () => {
    if (!category) {
      Alert.alert('알림', '카테고리를 선택해주세요.')
      return
    }
    if (!amount || parseInt(amount, 10) <= 0) {
      Alert.alert('알림', '금액을 입력해주세요.')
      return
    }
    if (!merchant.trim()) {
      Alert.alert('알림', '가맹점명을 입력해주세요.')
      return
    }
    if (!user?.id || !profile?.company_id) {
      Alert.alert('오류', '로그인 정보를 확인해주세요.')
      return
    }

    setSubmitting(true)
    try {
      // 사진 업로드
      let receiptUrl = ''
      if (photoUri) {
        const timestamp = Date.now()
        const storagePath = `${profile.company_id}/expense_receipts/${user.id}/${timestamp}.jpg`
        const results = await uploadFiles(
          [{ uri: photoUri, storagePath }],
          'vehicle-photos'
        )
        if (results[0]?.publicUrl) {
          receiptUrl = results[0].publicUrl
        }
      }

      // DB 저장
      const insertData = {
        company_id: profile.company_id,
        user_id: user.id,
        user_name: profile.employee_name || '',
        expense_date: new Date().toISOString().split('T')[0],
        card_number: cardNumber.trim() || '',
        category,
        merchant: merchant.trim(),
        item_name: itemName.trim() || '',
        customer_team: '',
        amount: parseInt(amount, 10),
        receipt_url: receiptUrl,
      }

      const { error } = await supabase.from('expense_receipts').insert([insertData])

      if (error) {
        console.error('영수증 저장 오류:', error)
        Alert.alert('오류', '영수증 저장에 실패했습니다.')
        return
      }

      Alert.alert('완료', '영수증이 제출되었습니다.', [
        { text: '확인', onPress: () => navigation.goBack() },
      ])
    } catch (e) {
      console.error('제출 오류:', e)
      Alert.alert('오류', '영수증 제출 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── 렌더링 ─────────────────────────
  return (
    <KeyboardAvoidingView style={st.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={st.container} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

        {/* 카테고리 선택 (3x4 그리드) */}
        <Text style={st.sectionTitle}>카테고리</Text>
        <View style={st.categoryGrid}>
          {EXPENSE_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              style={[st.categoryItem, category === cat.key && st.categoryItemActive]}
              onPress={() => setCategory(cat.key)}
            >
              <Icon
                name={cat.icon}
                size={24}
                color={category === cat.key ? '#2563eb' : Colors.steel[400]}
              />
              <Text style={[st.categoryLabel, category === cat.key && st.categoryLabelActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 금액 입력 */}
        <Text style={st.sectionTitle}>금액</Text>
        <View style={st.amountWrap}>
          <TextInput
            style={st.amountInput}
            value={displayAmount}
            onChangeText={formatAmount}
            placeholder="0"
            placeholderTextColor={Colors.steel[300]}
            keyboardType="numeric"
          />
          <Text style={st.amountUnit}>원</Text>
        </View>

        {/* 가맹점 / 내용 */}
        <Text style={st.sectionTitle}>상세 정보</Text>
        <Input
          label="가맹점명"
          value={merchant}
          onChangeText={setMerchant}
          placeholder="예: GS칼텍스, 파리바게뜨"
          required
        />
        <Input
          label="상품/내용"
          value={itemName}
          onChangeText={setItemName}
          placeholder="예: 휘발유, 점심식대"
        />
        <Input
          label="카드번호 (선택)"
          value={cardNumber}
          onChangeText={setCardNumber}
          placeholder="예: 4140-0326-****-****"
        />

        {/* 차량 선택 (주유비/충전/주차비만) */}
        {isCarRelated && (
          <>
            <Text style={st.sectionTitle}>차량 선택 (선택)</Text>
            {loading ? (
              <ActivityIndicator style={{ marginVertical: 20 }} color={Colors.steel[500]} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <TouchableOpacity
                  style={[st.carChip, !selectedCar && st.carChipActive]}
                  onPress={() => setSelectedCar(null)}
                >
                  <Text style={[st.carChipNumber, !selectedCar && st.carChipNumberActive]}>선택안함</Text>
                </TouchableOpacity>
                {cars.map((car) => (
                  <TouchableOpacity
                    key={car.id}
                    style={[st.carChip, selectedCar?.id === car.id && st.carChipActive]}
                    onPress={() => setSelectedCar(car)}
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
          </>
        )}

        {/* 영수증 사진 */}
        <Text style={st.sectionTitle}>영수증 사진</Text>
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

        {photoUri && (
          <View style={st.previewWrap}>
            <Image source={{ uri: photoUri }} style={st.previewImage} />
            <TouchableOpacity style={st.previewRemove} onPress={() => setPhotoUri(null)}>
              <Icon name="close-circle" size={28} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        )}

        {/* 제출 버튼 */}
        <View style={{ marginTop: 32, marginBottom: 40 }}>
          <Button
            title="영수증 제출"
            onPress={handleSubmit}
            loading={submitting}
            disabled={!category || !amount || !merchant.trim()}
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

  // 카테고리 그리드 (3x4)
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  categoryItem: {
    width: '30%', alignItems: 'center', paddingVertical: 14,
    borderRadius: BorderRadius.xl, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: Colors.border,
  },
  categoryItemActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  categoryLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.steel[500], marginTop: 4 },
  categoryLabelActive: { color: '#2563eb', fontWeight: '700' },

  // 금액 입력
  amountWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: BorderRadius.xl,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 16, paddingVertical: 4, marginBottom: 20,
  },
  amountInput: {
    flex: 1, fontSize: 28, fontWeight: '900', color: Colors.text,
    paddingVertical: 12, textAlign: 'right',
  },
  amountUnit: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.steel[400], marginLeft: 8 },

  // 차량 선택
  carChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: BorderRadius.xl, backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.border, marginRight: 10, minWidth: 90 },
  carChipActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  carChipNumber: { fontSize: FontSize.base, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  carChipNumberActive: { color: '#2563eb' },
  carChipModel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  carChipModelActive: { color: '#2563eb' },

  // 사진
  photoRow: { flexDirection: 'row', gap: 12 },
  photoBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20, borderRadius: BorderRadius.xl, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.steel[300], backgroundColor: '#fff' },
  photoBtnText: { fontSize: FontSize.sm, color: Colors.steel[500], marginTop: 4, fontWeight: '600' },

  // 사진 미리보기
  previewWrap: { marginTop: 16, alignItems: 'center', position: 'relative' },
  previewImage: { width: '100%', height: 240, borderRadius: BorderRadius.xl, resizeMode: 'cover' },
  previewRemove: { position: 'absolute', top: 8, right: 8 },
})
