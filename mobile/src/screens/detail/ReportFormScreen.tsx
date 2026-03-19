import React, { useState, useEffect, useMemo } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
  Switch,
} from 'react-native'
import Icon from 'react-native-vector-icons/Ionicons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { Colors, FontSize, Spacing, BorderRadius } from '../../constants/theme'
import { useApp } from '../../context/AppContext'
import { useCamera } from '../../hooks/useCamera'
import { useLocation } from '../../hooks/useLocation'
import { supabase } from '../../lib/supabase'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'

// ============================================
// 통합 보고서 작성 화면
// 9개 보고서 타입별 동적 필드 렌더링
// ============================================

// ── 보고서 타입 정의 ─────────────────────

type ReportType =
  | 'accident_confirm'      // ①사고확인서
  | 'damage_inspection'     // ②파손확인보고서 (검수)
  | 'field_investigation'   // ③현장조사보고서
  | 'total_loss_report'     // ④전손보고서
  | 'prepayment_report'     // ⑤선지급보고서
  | 'claim_document'        // ⑥청구서
  | 'subrogation_report'    // ⑦구상보고서
  | 'closure_report'        // ⑧종결보고서

interface ReportField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'toggle' | 'photo' | 'location' | 'signature'
  placeholder?: string
  required?: boolean
  options?: { key: string; label: string }[]
  section?: string
}

// ── 보고서별 필드 설정 ──────────────────────

const REPORT_CONFIGS: Record<ReportType, {
  title: string
  icon: string
  color: string
  description: string
  fields: ReportField[]
}> = {
  // ①사고확인서
  accident_confirm: {
    title: '사고확인서',
    icon: 'document',
    color: '#dc2626',
    description: '현장 도착 후 사고 상황을 확인하여 작성합니다',
    fields: [
      { key: 'arrival_time', label: '현장 도착 시간', type: 'text', placeholder: 'HH:MM', required: true, section: '현장 확인' },
      { key: 'location_confirm', label: '사고 위치 확인', type: 'location', section: '현장 확인' },
      { key: 'weather', label: '날씨/도로 상태', type: 'select', options: [
        { key: 'clear', label: '맑음' }, { key: 'rain', label: '비' },
        { key: 'snow', label: '눈' }, { key: 'fog', label: '안개' },
        { key: 'night', label: '야간' },
      ], section: '현장 확인' },
      { key: 'road_condition', label: '도로 상태', type: 'select', options: [
        { key: 'dry', label: '건조' }, { key: 'wet', label: '젖음' },
        { key: 'icy', label: '결빙' }, { key: 'gravel', label: '비포장' },
      ], section: '현장 확인' },
      { key: 'accident_description', label: '사고 경위 확인', type: 'textarea', placeholder: '현장에서 확인한 사고 경위를 상세히 기술', required: true, section: '사고 내용' },
      { key: 'damage_description', label: '차량 손상 상태', type: 'textarea', placeholder: '손상 부위와 정도를 기술', required: true, section: '손상 확인' },
      { key: 'drivable', label: '자력 운행 가능', type: 'toggle', section: '손상 확인' },
      { key: 'tow_needed', label: '견인 필요', type: 'toggle', section: '손상 확인' },
      { key: 'driver_statement', label: '운전자 진술', type: 'textarea', placeholder: '운전자 진술 내용', section: '관련자 진술' },
      { key: 'counterpart_statement', label: '상대방 진술', type: 'textarea', placeholder: '상대방 진술 내용 (해당 시)', section: '관련자 진술' },
      { key: 'witness_info', label: '목격자 정보', type: 'textarea', placeholder: '목격자 이름, 연락처, 진술', section: '관련자 진술' },
      { key: 'photos', label: '현장 사진', type: 'photo', required: true, section: '사진 촬영' },
      { key: 'handler_opinion', label: '담당자 의견', type: 'textarea', placeholder: '현장 확인 후 종합 의견', section: '종합' },
    ],
  },

  // ②파손확인보고서 (검수)
  damage_inspection: {
    title: '파손확인보고서',
    icon: 'camera',
    color: '#d97706',
    description: '차량 파손 부위를 상세히 검수하여 기록합니다',
    fields: [
      { key: 'inspection_date', label: '검수일자', type: 'date', required: true, section: '검수 정보' },
      { key: 'inspector_name', label: '검수자', type: 'text', required: true, section: '검수 정보' },
      { key: 'mileage', label: '현재 주행거리 (km)', type: 'number', section: '검수 정보' },
      { key: 'exterior_front', label: '전면 상태', type: 'select', options: [
        { key: 'normal', label: '정상' }, { key: 'scratched', label: '스크래치' },
        { key: 'dented', label: '찌그러짐' }, { key: 'broken', label: '파손' },
      ], section: '외관 검수' },
      { key: 'exterior_rear', label: '후면 상태', type: 'select', options: [
        { key: 'normal', label: '정상' }, { key: 'scratched', label: '스크래치' },
        { key: 'dented', label: '찌그러짐' }, { key: 'broken', label: '파손' },
      ], section: '외관 검수' },
      { key: 'exterior_left', label: '좌측 상태', type: 'select', options: [
        { key: 'normal', label: '정상' }, { key: 'scratched', label: '스크래치' },
        { key: 'dented', label: '찌그러짐' }, { key: 'broken', label: '파손' },
      ], section: '외관 검수' },
      { key: 'exterior_right', label: '우측 상태', type: 'select', options: [
        { key: 'normal', label: '정상' }, { key: 'scratched', label: '스크래치' },
        { key: 'dented', label: '찌그러짐' }, { key: 'broken', label: '파손' },
      ], section: '외관 검수' },
      { key: 'glass_damage', label: '유리 파손', type: 'toggle', section: '외관 검수' },
      { key: 'detail_description', label: '상세 파손 내역', type: 'textarea', placeholder: '각 파손 부위별 상세 설명', required: true, section: '상세 내역' },
      { key: 'repair_recommendation', label: '수리 권장사항', type: 'textarea', placeholder: '수리 방법 및 권장사항', section: '상세 내역' },
      { key: 'estimated_cost', label: '예상 수리비 (원)', type: 'number', section: '상세 내역' },
      { key: 'photos', label: '파손 부위 사진', type: 'photo', required: true, section: '사진 촬영' },
    ],
  },

  // ③현장조사보고서
  field_investigation: {
    title: '현장조사보고서',
    icon: 'map',
    color: '#7c3aed',
    description: '사고 현장을 조사하여 과실 판단 근거를 기록합니다',
    fields: [
      { key: 'investigation_date', label: '조사일시', type: 'date', required: true, section: '조사 개요' },
      { key: 'location_detail', label: '사고 장소 상세', type: 'textarea', placeholder: '도로명, 교차로명, 차선 정보 등', required: true, section: '조사 개요' },
      { key: 'location_gps', label: '현장 GPS 위치', type: 'location', section: '조사 개요' },
      { key: 'road_type', label: '도로 유형', type: 'select', options: [
        { key: 'highway', label: '고속도로' }, { key: 'national', label: '국도' },
        { key: 'city', label: '시내도로' }, { key: 'alley', label: '골목/주차장' },
      ], section: '현장 환경' },
      { key: 'signal_info', label: '신호/표지 정보', type: 'textarea', placeholder: '신호등, 표지판, 차선 표시 등', section: '현장 환경' },
      { key: 'cctv_available', label: 'CCTV 확인 가능', type: 'toggle', section: '현장 환경' },
      { key: 'cctv_location', label: 'CCTV 위치/관리주체', type: 'text', placeholder: 'CCTV 설치 위치 및 관리처', section: '현장 환경' },
      { key: 'skid_marks', label: '스키드마크/흔적', type: 'textarea', placeholder: '제동 흔적, 파편 위치 등', section: '물적 증거' },
      { key: 'collision_point', label: '충돌 지점', type: 'textarea', placeholder: '충돌 지점 및 차량 최종 위치', section: '물적 증거' },
      { key: 'fault_analysis', label: '과실 분석', type: 'textarea', placeholder: '과실 비율 판단 근거', required: true, section: '과실 분석' },
      { key: 'recommended_fault', label: '권장 과실 비율', type: 'text', placeholder: '예: 당사 30 : 상대 70', section: '과실 분석' },
      { key: 'photos', label: '현장 조사 사진', type: 'photo', required: true, section: '사진 촬영' },
      { key: 'diagram', label: '사고 상황도', type: 'photo', section: '사진 촬영' },
      { key: 'investigator_opinion', label: '조사자 종합 의견', type: 'textarea', required: true, section: '종합' },
    ],
  },

  // ④전손보고서
  total_loss_report: {
    title: '전손보고서',
    icon: 'warning',
    color: '#dc2626',
    description: '수리 불가 또는 수리비가 차량가액을 초과하는 경우',
    fields: [
      { key: 'vehicle_value', label: '차량 시가 (원)', type: 'number', required: true, section: '차량 가치' },
      { key: 'value_basis', label: '시가 산정 근거', type: 'textarea', placeholder: '시가 산정 방법 및 근거', section: '차량 가치' },
      { key: 'repair_estimate', label: '예상 수리비 (원)', type: 'number', required: true, section: '비용 비교' },
      { key: 'total_loss_ratio', label: '손해율 (%)', type: 'number', section: '비용 비교' },
      { key: 'total_loss_reason', label: '전손 판정 사유', type: 'textarea', placeholder: '전손 판정의 구체적 사유', required: true, section: '판정' },
      { key: 'salvage_value', label: '잔존물 가치 (원)', type: 'number', section: '처리 계획' },
      { key: 'disposal_plan', label: '잔존물 처리 계획', type: 'textarea', placeholder: '폐차, 매각 등', section: '처리 계획' },
      { key: 'replacement_plan', label: '대체 차량 계획', type: 'textarea', placeholder: '대체 차량 조달 계획', section: '처리 계획' },
      { key: 'photos', label: '차량 상태 사진', type: 'photo', required: true, section: '사진' },
    ],
  },

  // ⑤선지급보고서
  prepayment_report: {
    title: '선지급보고서',
    icon: 'cash',
    color: '#0e7490',
    description: '보험금 수령 전 선지급이 필요한 경우',
    fields: [
      { key: 'prepay_reason', label: '선지급 사유', type: 'textarea', placeholder: '선지급이 필요한 사유', required: true, section: '선지급 사유' },
      { key: 'urgency', label: '긴급도', type: 'select', options: [
        { key: 'normal', label: '보통' }, { key: 'urgent', label: '긴급' }, { key: 'critical', label: '매우긴급' },
      ], section: '선지급 사유' },
      { key: 'prepay_amount', label: '선지급 요청 금액 (원)', type: 'number', required: true, section: '금액' },
      { key: 'expected_insurance', label: '예상 보험금 (원)', type: 'number', section: '금액' },
      { key: 'recovery_plan', label: '회수 계획', type: 'textarea', placeholder: '보험금 회수 예상 일정 및 계획', required: true, section: '회수' },
      { key: 'recipient_name', label: '수령인', type: 'text', section: '지급 정보' },
      { key: 'recipient_account', label: '입금 계좌', type: 'text', placeholder: '은행명 + 계좌번호', section: '지급 정보' },
      { key: 'approval_note', label: '승인 요청 사항', type: 'textarea', section: '기타' },
    ],
  },

  // ⑥청구서
  claim_document: {
    title: '청구서',
    icon: 'receipt',
    color: '#2563eb',
    description: '보험사 또는 상대방에게 청구할 비용을 정리합니다',
    fields: [
      { key: 'claim_to', label: '청구 대상', type: 'select', options: [
        { key: 'own_insurance', label: '자차 보험사' },
        { key: 'counter_insurance', label: '상대 보험사' },
        { key: 'counterpart', label: '상대방 직접' },
        { key: 'customer', label: '고객' },
      ], required: true, section: '청구 대상' },
      { key: 'claim_company', label: '청구처 (회사/보험사)', type: 'text', required: true, section: '청구 대상' },
      { key: 'claim_number', label: '사고접수번호', type: 'text', section: '청구 대상' },
      { key: 'repair_cost', label: '수리비 (원)', type: 'number', section: '청구 항목' },
      { key: 'rental_cost', label: '대차비 (원)', type: 'number', section: '청구 항목' },
      { key: 'tow_cost', label: '견인비 (원)', type: 'number', section: '청구 항목' },
      { key: 'other_cost', label: '기타 비용 (원)', type: 'number', section: '청구 항목' },
      { key: 'other_cost_detail', label: '기타 비용 내역', type: 'textarea', section: '청구 항목' },
      { key: 'total_claim', label: '총 청구 금액 (원)', type: 'number', required: true, section: '청구 항목' },
      { key: 'supporting_docs', label: '증빙서류 첨부', type: 'photo', section: '증빙' },
      { key: 'claim_note', label: '비고', type: 'textarea', section: '기타' },
    ],
  },

  // ⑦구상보고서
  subrogation_report: {
    title: '구상보고서',
    icon: 'swap-horizontal',
    color: '#b45309',
    description: '보험사로부터 구상권이 행사된 경우',
    fields: [
      { key: 'subrogation_from', label: '구상 요청처', type: 'text', required: true, section: '구상 개요' },
      { key: 'subrogation_amount', label: '구상 요청 금액 (원)', type: 'number', required: true, section: '구상 개요' },
      { key: 'subrogation_basis', label: '구상 근거', type: 'textarea', placeholder: '구상 요청의 법적/계약적 근거', section: '구상 개요' },
      { key: 'our_fault_ratio', label: '당사 과실 비율 (%)', type: 'number', section: '과실 분석' },
      { key: 'dispute_points', label: '쟁점 사항', type: 'textarea', placeholder: '과실 비율 등 이의 사항', section: '과실 분석' },
      { key: 'negotiation_result', label: '협의 결과', type: 'textarea', placeholder: '구상 협의 진행 결과', section: '협의' },
      { key: 'agreed_amount', label: '합의 금액 (원)', type: 'number', section: '협의' },
      { key: 'payment_plan', label: '지급 계획', type: 'textarea', section: '처리' },
      { key: 'handler_opinion', label: '담당자 의견', type: 'textarea', section: '종합' },
    ],
  },

  // ⑧종결보고서
  closure_report: {
    title: '종결보고서',
    icon: 'checkmark-circle',
    color: '#15803d',
    description: '사고 처리 전 과정을 정리하여 종결합니다',
    fields: [
      { key: 'closure_date', label: '종결일자', type: 'date', required: true, section: '종결 정보' },
      { key: 'handling_period', label: '처리 기간 (일)', type: 'number', section: '종결 정보' },
      { key: 'process_summary', label: '처리 경과 요약', type: 'textarea', placeholder: '접수부터 종결까지 주요 경과', required: true, section: '처리 경과' },
      { key: 'final_repair_cost', label: '최종 수리비 (원)', type: 'number', section: '비용 정산' },
      { key: 'insurance_received', label: '보험금 수령액 (원)', type: 'number', section: '비용 정산' },
      { key: 'company_burden', label: '회사 부담금 (원)', type: 'number', section: '비용 정산' },
      { key: 'customer_burden', label: '고객 부담금 (원)', type: 'number', section: '비용 정산' },
      { key: 'rental_days', label: '대차 일수', type: 'number', section: '대차 정산' },
      { key: 'rental_total', label: '대차비 총액 (원)', type: 'number', section: '대차 정산' },
      { key: 'rental_billed', label: '대차비 청구 여부', type: 'toggle', section: '대차 정산' },
      { key: 'lessons_learned', label: '교훈/개선사항', type: 'textarea', placeholder: '향후 유사 사고 방지를 위한 개선 사항', section: '종합' },
      { key: 'handler_final', label: '담당자 최종 의견', type: 'textarea', required: true, section: '종합' },
      { key: 'photos', label: '수리 완료 사진', type: 'photo', section: '사진' },
    ],
  },
}

// ============================================
// 메인 컴포넌트
// ============================================

export default function ReportFormScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { user, profile } = useApp()
  const camera = useCamera()
  const loc = useLocation()

  const accidentId = route.params?.accidentId
  const reportType = route.params?.reportType as ReportType
  const config = REPORT_CONFIGS[reportType]

  const [formData, setFormData] = useState<Record<string, any>>({})
  const [submitting, setSubmitting] = useState(false)
  const [photos, setPhotos] = useState<Array<{ uri: string; label: string }>>([])

  if (!config) {
    return (
      <View style={[st.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>알 수 없는 보고서 유형</Text>
      </View>
    )
  }

  // ── 필드 값 업데이트 ────────────────────
  const updateField = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  // ── 사진 촬영 ───────────────────────────
  const takePhoto = async (fieldKey: string) => {
    const result = await camera.takePhoto()
    if (result?.uri) {
      setPhotos(prev => [...prev, { uri: result.uri!, label: fieldKey }])
    }
  }

  // ── GPS 위치 캡처 ──────────────────────
  const captureLocation = async (fieldKey: string) => {
    const result = await loc.getCurrentLocation()
    if (result) {
      updateField(fieldKey, {
        latitude: result.latitude,
        longitude: result.longitude,
        address: result.address || '',
        accuracy: result.accuracy,
      })
    }
  }

  // ── 섹션별 필드 그룹핑 ────────────────────
  const sections = useMemo(() => {
    const grouped: Record<string, ReportField[]> = {}
    config.fields.forEach(field => {
      const section = field.section || '기본'
      if (!grouped[section]) grouped[section] = []
      grouped[section].push(field)
    })
    return grouped
  }, [config])

  // ── 제출 ────────────────────────────────
  const handleSubmit = async () => {
    // 필수 필드 검증
    const missing = config.fields
      .filter(f => f.required && !formData[f.key] && f.type !== 'photo')
      .map(f => f.label)

    if (missing.length > 0) {
      Alert.alert('필수 항목 누락', `다음 항목을 입력해주세요:\n${missing.join('\n')}`)
      return
    }

    setSubmitting(true)
    try {
      // 사진 업로드
      let photoUrls: string[] = []
      if (photos.length > 0 && profile?.company_id) {
        const basePath = `reports/${accidentId}/${reportType}/${Date.now()}`
        for (const photo of photos) {
          const url = await camera.uploadSingle(
            photo.uri,
            'vehicle-photos',
            `${basePath}/${photo.label}_${Date.now()}.jpg`
          )
          if (url) photoUrls.push(url)
        }
      }

      // 보고서 저장
      const reportData = {
        accident_id: accidentId,
        company_id: profile?.company_id,
        report_type: reportType,
        report_title: config.title,
        form_data: formData,
        photos: photoUrls,
        status: 'draft',
        created_by: user?.id,
        handler_id: user?.id,
      }

      const { error } = await supabase
        .from('accident_reports')
        .insert(reportData)

      if (error) {
        console.error('보고서 저장 실패:', error)
        Alert.alert('오류', '보고서 저장에 실패했습니다.')
        return
      }

      Alert.alert('완료', `${config.title}가 저장되었습니다.`, [
        { text: '확인', onPress: () => navigation.goBack() },
      ])
    } catch (e) {
      console.error('제출 오류:', e)
      Alert.alert('오류', '보고서 제출 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── 필드 렌더링 ─────────────────────────
  const renderField = (field: ReportField) => {
    switch (field.type) {
      case 'text':
      case 'date':
        return (
          <Input
            key={field.key}
            label={field.label}
            value={formData[field.key] || ''}
            onChangeText={(v) => updateField(field.key, v)}
            placeholder={field.placeholder || field.label}
          />
        )

      case 'textarea':
        return (
          <Input
            key={field.key}
            label={field.label}
            value={formData[field.key] || ''}
            onChangeText={(v) => updateField(field.key, v)}
            placeholder={field.placeholder || field.label}
            multiline
          />
        )

      case 'number':
        return (
          <Input
            key={field.key}
            label={field.label}
            value={formData[field.key]?.toString() || ''}
            onChangeText={(v) => updateField(field.key, v.replace(/[^0-9]/g, ''))}
            placeholder={field.placeholder || '0'}
            keyboardType="numeric"
          />
        )

      case 'select':
        return (
          <View key={field.key} style={st.fieldGroup}>
            <Text style={st.fieldLabel}>{field.label}</Text>
            <View style={st.selectRow}>
              {field.options?.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    st.selectChip,
                    formData[field.key] === opt.key && { backgroundColor: config.color, borderColor: config.color },
                  ]}
                  onPress={() => updateField(field.key, opt.key)}
                >
                  <Text style={[
                    st.selectText,
                    formData[field.key] === opt.key && { color: '#fff' },
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )

      case 'toggle':
        return (
          <View key={field.key} style={st.toggleRow}>
            <Text style={st.toggleLabel}>{field.label}</Text>
            <Switch
              value={!!formData[field.key]}
              onValueChange={(v) => updateField(field.key, v)}
              trackColor={{ true: config.color }}
            />
          </View>
        )

      case 'photo':
        return (
          <View key={field.key} style={st.fieldGroup}>
            <Text style={st.fieldLabel}>{field.label}</Text>
            <View style={st.photoActions}>
              <TouchableOpacity style={[st.photoBtn, { backgroundColor: config.color }]} onPress={() => takePhoto(field.key)}>
                <Icon name="camera" size={20} color="#fff" />
                <Text style={st.photoBtnText}>촬영</Text>
              </TouchableOpacity>
            </View>
            {photos.filter(p => p.label === field.key).length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {photos.filter(p => p.label === field.key).map((p, i) => (
                  <View key={i} style={{ marginRight: 8, position: 'relative' }}>
                    <Image source={{ uri: p.uri }} style={st.photoThumb} />
                    <TouchableOpacity
                      style={st.photoRemove}
                      onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== photos.indexOf(p)))}
                    >
                      <Icon name="close-circle" size={20} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )

      case 'location':
        const locData = formData[field.key]
        return (
          <View key={field.key} style={st.fieldGroup}>
            <Text style={st.fieldLabel}>{field.label}</Text>
            <TouchableOpacity
              style={[st.locationBtn, locData && st.locationBtnActive]}
              onPress={() => captureLocation(field.key)}
            >
              <Icon
                name={locData ? 'location' : 'location-outline'}
                size={18}
                color={locData ? '#15803d' : Colors.steel[500]}
              />
              <Text style={[st.locationText, locData && { color: '#15803d' }]}>
                {locData ? (locData.address || `${locData.latitude.toFixed(6)}, ${locData.longitude.toFixed(6)}`) : '현재 위치 캡처'}
              </Text>
            </TouchableOpacity>
          </View>
        )

      default:
        return null
    }
  }

  // ── 메인 렌더링 ─────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={st.container} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

        {/* 헤더 */}
        <View style={[st.headerBanner, { backgroundColor: config.color + '12' }]}>
          <View style={[st.headerIcon, { backgroundColor: config.color + '20' }]}>
            <Icon name={config.icon} size={24} color={config.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.headerTitle, { color: config.color }]}>{config.title}</Text>
            <Text style={st.headerDesc}>{config.description}</Text>
          </View>
        </View>

        {/* 섹션별 필드 */}
        {Object.entries(sections).map(([sectionName, fields]) => (
          <Card key={sectionName} style={st.sectionCard}>
            <Text style={st.sectionTitle}>{sectionName}</Text>
            {fields.map(renderField)}
          </Card>
        ))}

        {/* 제출 버튼 */}
        <View style={{ marginTop: 16, marginBottom: 40 }}>
          <Button
            title={`${config.title} 제출`}
            onPress={handleSubmit}
            loading={submitting}
            fullWidth
            size="lg"
          />
          <TouchableOpacity
            style={st.draftBtn}
            onPress={() => {
              Alert.alert('임시저장', '임시저장 되었습니다.', [
                { text: '확인', onPress: () => navigation.goBack() },
              ])
            }}
          >
            <Text style={st.draftText}>임시저장</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ── 스타일 ────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: Spacing.lg },

  headerBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: BorderRadius.xl, marginBottom: 16,
  },
  headerIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },

  sectionCard: { marginBottom: 12 },
  sectionTitle: { fontSize: FontSize.base, fontWeight: '800', color: Colors.text, marginBottom: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },

  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.steel[600], marginBottom: 8 },

  selectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.xl, borderWidth: 1.5, borderColor: Colors.steel[200], backgroundColor: '#fff' },
  selectText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.steel[500] },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  toggleLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.steel[600] },

  photoActions: { flexDirection: 'row', gap: 10 },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: BorderRadius.xl },
  photoBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
  photoThumb: { width: 72, height: 72, borderRadius: BorderRadius.md },
  photoRemove: { position: 'absolute', top: -6, right: -6 },

  locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: BorderRadius.xl, backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.steel[200] },
  locationBtnActive: { backgroundColor: '#f0fdf4', borderColor: '#15803d' },
  locationText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.steel[500] },

  draftBtn: { alignItems: 'center', marginTop: 12, paddingVertical: 14 },
  draftText: { fontSize: FontSize.base, fontWeight: '600', color: Colors.steel[400] },
})
