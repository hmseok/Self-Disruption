import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Linking, Alert,
} from 'react-native'
import Icon from 'react-native-vector-icons/Ionicons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { Colors, FontSize, Spacing, BorderRadius } from '../../constants/theme'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'

// ============================================
// 사고 건 상세 화면
// 배정된 사고건의 전체 정보 + 워크플로 진행
// ============================================

type AccidentDetail = {
  id: number
  company_id: string
  car_id: number | null
  accident_date: string
  accident_time: string | null
  accident_location: string
  accident_type: string
  fault_ratio: number
  description: string
  status: string
  driver_name: string
  driver_phone: string
  driver_relation: string
  counterpart_name: string
  counterpart_phone: string
  counterpart_vehicle: string
  counterpart_insurance: string
  insurance_company: string
  insurance_claim_no: string
  police_reported: boolean
  police_report_no: string | null
  vehicle_condition: string | null
  repair_shop_name: string
  repair_start_date: string | null
  repair_end_date: string | null
  estimated_repair_cost: number
  actual_repair_cost: number
  insurance_payout: number
  customer_deductible: number
  company_cost: number
  notes: string
  handler_id: string | null
  photos: string[] | null
  client_name: string | null
  fault_type: string | null
  insurance_type: string | null
  settlement_type: string | null
  region_sido: string | null
  region_sigungu: string | null
  assigned_at: string | null
  assignment_rule: string | null
  jandi_raw: string | null
  car?: { number: string; brand: string; model: string }
}

// 워크플로 단계
const WORKFLOW_STEPS = [
  { key: 'reported',        label: '사고접수',   icon: 'alert-circle' },
  { key: 'inspection',      label: '검수',       icon: 'search' },
  { key: 'insurance_filed', label: '보험접수',   icon: 'document-text' },
  { key: 'repairing',       label: '수리',       icon: 'construct' },
  { key: 'settled',         label: '정산',       icon: 'cash' },
  { key: 'closed',          label: '종결',       icon: 'checkmark-done' },
]

const STATUS_INDEX: Record<string, number> = {
  reported: 0,
  inspection: 1,
  insurance_filed: 2,
  repairing: 3,
  settled: 4,
  closed: 5,
}

// 보고서 타입
const REPORT_TYPES = [
  { key: 'accident_confirm',     label: '사고확인서',     icon: 'document', color: '#dc2626' },
  { key: 'damage_inspection',    label: '파손확인보고서', icon: 'camera', color: '#d97706' },
  { key: 'field_investigation',  label: '현장조사보고서', icon: 'map', color: '#7c3aed' },
  { key: 'total_loss_report',    label: '전손보고서',     icon: 'warning', color: '#dc2626' },
  { key: 'prepayment_report',    label: '선지급보고서',   icon: 'cash', color: '#0e7490' },
  { key: 'claim_document',       label: '청구서',         icon: 'receipt', color: '#2563eb' },
  { key: 'subrogation_report',   label: '구상보고서',     icon: 'swap-horizontal', color: '#b45309' },
  { key: 'closure_report',       label: '종결보고서',     icon: 'checkmark-circle', color: '#15803d' },
]

export default function AccidentCaseDetailScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { user } = useApp()
  const accidentId = route.params?.accidentId

  const [loading, setLoading] = useState(true)
  const [accident, setAccident] = useState<AccidentDetail | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    loadAccident()
  }, [accidentId])

  const loadAccident = async () => {
    if (!accidentId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('accident_records')
        .select(`*, car:cars(number, brand, model)`)
        .eq('id', accidentId)
        .single()

      if (!error && data) setAccident(data as any)
    } finally {
      setLoading(false)
    }
  }

  // ── 상태 변경 ─────────────────────────
  const updateStatus = async (newStatus: string) => {
    if (!accident) return

    Alert.alert(
      '상태 변경',
      `상태를 "${WORKFLOW_STEPS.find(s => s.key === newStatus)?.label || newStatus}"(으)로 변경하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '변경',
          onPress: async () => {
            setUpdating(true)
            try {
              const { error } = await supabase
                .from('accident_records')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', accident.id)

              if (!error) {
                setAccident(prev => prev ? { ...prev, status: newStatus } : null)
              }
            } finally {
              setUpdating(false)
            }
          },
        },
      ]
    )
  }

  // ── 전화 걸기 ─────────────────────────
  const callPhone = (phone: string) => {
    if (phone) Linking.openURL(`tel:${phone}`)
  }

  // ── 로딩/에러 ─────────────────────────
  if (loading) {
    return (
      <View style={[st.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.steel[500]} />
      </View>
    )
  }

  if (!accident) {
    return (
      <View style={[st.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: Colors.textSecondary }}>사고건을 찾을 수 없습니다</Text>
      </View>
    )
  }

  const currentStep = STATUS_INDEX[accident.status] ?? 0

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

      {/* ── 워크플로 진행 바 ──────────────── */}
      <Card style={st.workflowCard}>
        <Text style={st.sectionTitle}>진행 상태</Text>
        <View style={st.workflow}>
          {WORKFLOW_STEPS.map((step, idx) => {
            const isCompleted = idx < currentStep
            const isCurrent = idx === currentStep
            const isNext = idx === currentStep + 1

            return (
              <TouchableOpacity
                key={step.key}
                style={st.workflowStep}
                onPress={() => isNext ? updateStatus(step.key) : null}
                disabled={!isNext || updating}
              >
                <View style={[
                  st.stepCircle,
                  isCompleted && st.stepCompleted,
                  isCurrent && st.stepCurrent,
                ]}>
                  <Icon
                    name={isCompleted ? 'checkmark' : step.icon}
                    size={14}
                    color={isCompleted || isCurrent ? '#fff' : Colors.steel[400]}
                  />
                </View>
                <Text style={[
                  st.stepLabel,
                  isCurrent && { color: Colors.text, fontWeight: '800' },
                  isNext && { color: '#2563eb' },
                ]}>
                  {step.label}
                </Text>
                {isNext && (
                  <Text style={{ fontSize: 8, color: '#2563eb', marginTop: 1 }}>탭하여 진행</Text>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      </Card>

      {/* ── 차량/사고 기본 정보 ───────────── */}
      <Card style={st.section}>
        <Text style={st.sectionTitle}>사고 정보</Text>

        <InfoRow icon="car" label="차량" value={
          accident.car
            ? `${accident.car.number} (${accident.car.brand} ${accident.car.model})`
            : '차량 미상'
        } />
        <InfoRow icon="calendar" label="사고일시" value={
          `${accident.accident_date}${accident.accident_time ? ' ' + accident.accident_time : ''}`
        } />
        <InfoRow icon="location" label="사고장소" value={accident.accident_location || '-'} />
        <InfoRow icon="alert-circle" label="과실구분" value={accident.fault_type || '-'} />
        <InfoRow icon="business" label="거래처" value={accident.client_name || '-'} />
        <InfoRow icon="pricetag" label="정산방식" value={accident.settlement_type || '-'} />
        <InfoRow icon="shield" label="보험종류" value={accident.insurance_type || '-'} />
        <InfoRow icon="fitness" label="차량상태" value={
          accident.vehicle_condition === 'minor' ? '경미 (운행가능)' :
          accident.vehicle_condition === 'repairable' ? '수리필요 (운행불가)' :
          accident.vehicle_condition === 'total_loss' ? '전손' : '-'
        } />

        {accident.description ? (
          <View style={st.descriptionBox}>
            <Text style={st.descriptionLabel}>사고내용</Text>
            <Text style={st.descriptionText}>{accident.description}</Text>
          </View>
        ) : null}
      </Card>

      {/* ── 관련자 정보 ──────────────────── */}
      <Card style={st.section}>
        <Text style={st.sectionTitle}>관련자</Text>

        <View style={st.personCard}>
          <Text style={st.personLabel}>운전자</Text>
          <View style={st.personRow}>
            <Text style={st.personName}>{accident.driver_name || '-'}</Text>
            {accident.driver_phone ? (
              <TouchableOpacity onPress={() => callPhone(accident.driver_phone)}>
                <Icon name="call" size={20} color="#2563eb" />
              </TouchableOpacity>
            ) : null}
          </View>
          {accident.driver_relation ? (
            <Text style={st.personSub}>관계: {accident.driver_relation}</Text>
          ) : null}
        </View>

        {accident.counterpart_name ? (
          <View style={st.personCard}>
            <Text style={st.personLabel}>상대방</Text>
            <View style={st.personRow}>
              <Text style={st.personName}>{accident.counterpart_name}</Text>
              {accident.counterpart_phone ? (
                <TouchableOpacity onPress={() => callPhone(accident.counterpart_phone)}>
                  <Icon name="call" size={20} color="#2563eb" />
                </TouchableOpacity>
              ) : null}
            </View>
            {accident.counterpart_vehicle ? (
              <Text style={st.personSub}>차량: {accident.counterpart_vehicle}</Text>
            ) : null}
            {accident.counterpart_insurance ? (
              <Text style={st.personSub}>보험: {accident.counterpart_insurance}</Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      {/* ── 보험/수리 정보 ─────────────────── */}
      <Card style={st.section}>
        <Text style={st.sectionTitle}>보험 / 수리</Text>

        <InfoRow icon="shield-checkmark" label="자차보험사" value={accident.insurance_company || '-'} />
        <InfoRow icon="document" label="접수번호" value={accident.insurance_claim_no || '-'} />
        <InfoRow icon="build" label="공장" value={accident.repair_shop_name || '-'} />
        <InfoRow icon="card" label="면책금" value={
          accident.customer_deductible > 0
            ? `${accident.customer_deductible.toLocaleString()}원`
            : '-'
        } />
        <InfoRow icon="cash" label="예상 수리비" value={
          accident.estimated_repair_cost > 0
            ? `${accident.estimated_repair_cost.toLocaleString()}원`
            : '-'
        } />
      </Card>

      {/* ── 보고서 작성 ──────────────────── */}
      <Card style={st.section}>
        <Text style={st.sectionTitle}>보고서 작성</Text>
        <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 12 }}>
          해당 건에 대한 보고서를 작성합니다
        </Text>

        <View style={st.reportGrid}>
          {REPORT_TYPES.map(rt => (
            <TouchableOpacity
              key={rt.key}
              style={st.reportBtn}
              onPress={() => navigation.navigate('ReportForm', {
                accidentId: accident.id,
                reportType: rt.key,
                reportLabel: rt.label,
              })}
            >
              <View style={[st.reportIcon, { backgroundColor: rt.color + '15' }]}>
                <Icon name={rt.icon} size={20} color={rt.color} />
              </View>
              <Text style={st.reportLabel}>{rt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* ── 메모/노트 ────────────────────── */}
      {accident.notes ? (
        <Card style={st.section}>
          <Text style={st.sectionTitle}>메모</Text>
          <Text style={{ fontSize: FontSize.sm, color: Colors.steel[600], lineHeight: 20 }}>
            {accident.notes}
          </Text>
        </Card>
      ) : null}

      {/* 하단 여백 */}
      <View style={{ height: 40 }} />

    </ScrollView>
  )
}

// ── 정보 행 컴포넌트 ──────────────────────

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={st.infoRow}>
      <Icon name={icon + '-outline'} size={16} color={Colors.steel[400]} />
      <Text style={st.infoLabel}>{label}</Text>
      <Text style={st.infoValue}>{value}</Text>
    </View>
  )
}

// ── 스타일 ────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: Spacing.lg },

  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: 14 },
  section: { marginBottom: 14 },

  // 워크플로
  workflowCard: { marginBottom: 14 },
  workflow: { flexDirection: 'row', justifyContent: 'space-between' },
  workflowStep: { alignItems: 'center', flex: 1 },
  stepCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.steel[100], justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: Colors.steel[200],
  },
  stepCompleted: { backgroundColor: '#15803d', borderColor: '#15803d' },
  stepCurrent: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  stepLabel: { fontSize: 9, fontWeight: '600', color: Colors.steel[400], marginTop: 4 },

  // 정보 행
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  infoLabel: { fontSize: FontSize.sm, color: Colors.steel[500], width: 70 },
  infoValue: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '600', flex: 1 },

  // 사고내용
  descriptionBox: {
    marginTop: 12, padding: 12,
    backgroundColor: '#f8fafc', borderRadius: BorderRadius.md,
  },
  descriptionLabel: { fontSize: 11, fontWeight: '700', color: Colors.steel[500], marginBottom: 6 },
  descriptionText: { fontSize: FontSize.sm, color: Colors.steel[700], lineHeight: 20 },

  // 관련자
  personCard: {
    padding: 12, backgroundColor: '#f8fafc', borderRadius: BorderRadius.md, marginBottom: 8,
  },
  personLabel: { fontSize: 11, fontWeight: '700', color: Colors.steel[500], marginBottom: 6 },
  personRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  personName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  personSub: { fontSize: FontSize.sm, color: Colors.steel[500], marginTop: 2 },

  // 보고서
  reportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  reportBtn: {
    width: '30%', alignItems: 'center', padding: 12,
    backgroundColor: '#f8fafc', borderRadius: BorderRadius.xl,
  },
  reportIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  reportLabel: { fontSize: 10, fontWeight: '700', color: Colors.steel[600], textAlign: 'center' },
})
