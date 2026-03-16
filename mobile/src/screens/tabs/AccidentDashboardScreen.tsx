import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Dimensions,
} from 'react-native'
import Icon from 'react-native-vector-icons/Ionicons'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { Colors, FontSize, Spacing, BorderRadius } from '../../constants/theme'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'

// ============================================
// 사고팀 대시보드
// 내 배정 건 목록 + 워크로드 요약
// ============================================

type AccidentSummary = {
  id: number
  accident_date: string
  accident_time: string | null
  accident_location: string
  status: string
  driver_name: string
  fault_type: string | null
  client_name: string | null
  region_sido: string | null
  insurance_company: string
  vehicle_condition: string | null
  repair_shop_name: string
  settlement_type: string | null
  assigned_at: string | null
  assignment_rule: string | null
  car: { number: string; brand: string; model: string } | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  reported:        { label: '신규접수', color: '#1d4ed8', bg: '#dbeafe', icon: 'alert-circle' },
  insurance_filed: { label: '보험접수', color: '#b45309', bg: '#fef3c7', icon: 'document-text' },
  repairing:       { label: '수리중',   color: '#7c3aed', bg: '#ede9fe', icon: 'construct' },
  settled:         { label: '정산완료', color: '#0e7490', bg: '#cffafe', icon: 'checkmark-circle' },
  closed:          { label: '종결',     color: '#15803d', bg: '#dcfce7', icon: 'checkmark-done' },
}

const FAULT_COLORS: Record<string, string> = {
  '가해': '#dc2626',
  '피해': '#2563eb',
  '자차': '#d97706',
  '면책': '#6b7280',
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')

export default function AccidentDashboardScreen() {
  const navigation = useNavigation<any>()
  const { user, profile } = useApp()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [accidents, setAccidents] = useState<AccidentSummary[]>([])
  const [filter, setFilter] = useState<'active' | 'all' | 'completed'>('active')

  // ── 통계 ───────────────────────────
  const stats = {
    total: accidents.length,
    reported: accidents.filter(a => a.status === 'reported').length,
    insurance: accidents.filter(a => a.status === 'insurance_filed').length,
    repairing: accidents.filter(a => a.status === 'repairing').length,
    settled: accidents.filter(a => ['settled', 'closed'].includes(a.status)).length,
  }

  // ── 데이터 로드 ─────────────────────
  const loadData = useCallback(async () => {
    if (!user?.id || !profile?.company_id) return

    try {
      let query = supabase
        .from('accident_records')
        .select(`
          id, accident_date, accident_time, accident_location,
          status, driver_name, fault_type, client_name,
          region_sido, insurance_company, vehicle_condition,
          repair_shop_name, settlement_type, assigned_at,
          assignment_rule,
          car:cars(number, brand, model)
        `)
        .eq('handler_id', user.id)
        .eq('company_id', profile.company_id)
        .order('accident_date', { ascending: false })

      if (filter === 'active') {
        query = query.in('status', ['reported', 'insurance_filed', 'repairing'])
      } else if (filter === 'completed') {
        query = query.in('status', ['settled', 'closed'])
      }

      const { data, error } = await query.limit(50)
      if (!error && data) setAccidents(data as any)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id, profile?.company_id, filter])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData])
  )

  useEffect(() => {
    loadData()
  }, [filter])

  const onRefresh = () => {
    setRefreshing(true)
    loadData()
  }

  // ── 사고건 카드 ─────────────────────
  const renderAccidentCard = (item: AccidentSummary) => {
    const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.reported
    const faultColor = FAULT_COLORS[item.fault_type || ''] || '#6b7280'
    const carLabel = item.car
      ? `${item.car.number}`
      : '차량 미상'
    const carModel = item.car
      ? `${item.car.brand} ${item.car.model}`
      : ''

    const daysAgo = Math.floor(
      (Date.now() - new Date(item.accident_date).getTime()) / (1000 * 60 * 60 * 24)
    )
    const urgency = daysAgo <= 1 ? 'today' : daysAgo <= 3 ? 'recent' : 'old'

    return (
      <TouchableOpacity
        key={item.id}
        style={st.accidentCard}
        onPress={() => navigation.navigate('AccidentCaseDetail', { accidentId: item.id })}
        activeOpacity={0.7}
      >
        {/* 좌측 상태 바 */}
        <View style={[st.statusBar, { backgroundColor: statusConf.color }]} />

        <View style={st.cardBody}>
          {/* 상단: 차량번호 + 상태 + 과실 */}
          <View style={st.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={st.carNumber}>{carLabel}</Text>
              {carModel ? <Text style={st.carModel}>{carModel}</Text> : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 6 }}>
              {item.fault_type && (
                <View style={[st.tag, { backgroundColor: faultColor + '18' }]}>
                  <Text style={[st.tagText, { color: faultColor }]}>{item.fault_type}</Text>
                </View>
              )}
              <View style={[st.tag, { backgroundColor: statusConf.bg }]}>
                <Text style={[st.tagText, { color: statusConf.color }]}>{statusConf.label}</Text>
              </View>
            </View>
          </View>

          {/* 중간: 사고 정보 */}
          <View style={st.cardInfo}>
            <View style={st.infoRow}>
              <Icon name="calendar-outline" size={13} color={Colors.steel[400]} />
              <Text style={st.infoText}>
                {item.accident_date}
                {item.accident_time ? ` ${item.accident_time}` : ''}
                {urgency === 'today' && <Text style={{ color: '#dc2626', fontWeight: '700' }}> (오늘)</Text>}
                {urgency === 'recent' && <Text style={{ color: '#d97706' }}> ({daysAgo}일전)</Text>}
              </Text>
            </View>

            <View style={st.infoRow}>
              <Icon name="location-outline" size={13} color={Colors.steel[400]} />
              <Text style={st.infoText} numberOfLines={1}>
                {item.region_sido ? `[${item.region_sido}] ` : ''}
                {item.accident_location || '위치 미상'}
              </Text>
            </View>

            {item.client_name && (
              <View style={st.infoRow}>
                <Icon name="business-outline" size={13} color={Colors.steel[400]} />
                <Text style={st.infoText}>{item.client_name}</Text>
                {item.settlement_type && (
                  <Text style={st.settlementTag}>{item.settlement_type}</Text>
                )}
              </View>
            )}

            <View style={st.infoRow}>
              <Icon name="person-outline" size={13} color={Colors.steel[400]} />
              <Text style={st.infoText}>
                {item.driver_name || '운전자 미상'}
                {item.insurance_company ? ` · ${item.insurance_company}` : ''}
              </Text>
            </View>

            {item.repair_shop_name ? (
              <View style={st.infoRow}>
                <Icon name="build-outline" size={13} color={Colors.steel[400]} />
                <Text style={st.infoText}>{item.repair_shop_name}</Text>
              </View>
            ) : null}
          </View>

          {/* 하단: 배정 정보 */}
          {item.assignment_rule && (
            <View style={st.assignmentInfo}>
              <Icon name="git-branch-outline" size={12} color={Colors.steel[400]} />
              <Text style={st.assignmentText}>{item.assignment_rule}</Text>
            </View>
          )}
        </View>

        {/* 우측 화살표 */}
        <View style={st.cardArrow}>
          <Icon name="chevron-forward" size={18} color={Colors.steel[300]} />
        </View>
      </TouchableOpacity>
    )
  }

  // ── 메인 렌더링 ─────────────────────
  if (loading) {
    return (
      <View style={[st.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.steel[500]} />
      </View>
    )
  }

  return (
    <View style={st.container}>
      {/* 헤더 */}
      <View style={st.header}>
        <View>
          <Text style={st.greeting}>
            {profile?.employee_name || '담당자'}님
          </Text>
          <Text style={st.subtitle}>사고 관리 현황</Text>
        </View>

        <TouchableOpacity
          style={st.newReportBtn}
          onPress={() => navigation.navigate('AccidentReport')}
        >
          <Icon name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 통계 카드 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={st.statsScroll}
          contentContainerStyle={{ paddingHorizontal: Spacing.lg }}
        >
          <StatCard
            icon="alert-circle"
            iconColor="#dc2626"
            label="신규접수"
            count={stats.reported}
            onPress={() => setFilter('active')}
          />
          <StatCard
            icon="document-text"
            iconColor="#b45309"
            label="보험접수"
            count={stats.insurance}
            onPress={() => setFilter('active')}
          />
          <StatCard
            icon="construct"
            iconColor="#7c3aed"
            label="수리중"
            count={stats.repairing}
            onPress={() => setFilter('active')}
          />
          <StatCard
            icon="checkmark-done"
            iconColor="#15803d"
            label="처리완료"
            count={stats.settled}
            onPress={() => setFilter('completed')}
          />
        </ScrollView>

        {/* 필터 탭 */}
        <View style={st.filterRow}>
          {(['active', 'all', 'completed'] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[st.filterTab, filter === f && st.filterTabActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[st.filterText, filter === f && st.filterTextActive]}>
                {f === 'active' ? '진행중' : f === 'all' ? '전체' : '완료'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 사고건 목록 */}
        <View style={st.listContainer}>
          {accidents.length === 0 ? (
            <View style={st.emptyState}>
              <Icon name="checkmark-circle-outline" size={48} color={Colors.steel[300]} />
              <Text style={st.emptyText}>
                {filter === 'active' ? '진행 중인 건이 없습니다' : '데이터가 없습니다'}
              </Text>
            </View>
          ) : (
            accidents.map(renderAccidentCard)
          )}
        </View>
      </ScrollView>
    </View>
  )
}

// ── 통계 카드 컴포넌트 ──────────────────

function StatCard({
  icon, iconColor, label, count, onPress,
}: {
  icon: string; iconColor: string; label: string; count: number; onPress: () => void
}) {
  return (
    <TouchableOpacity style={st.statCard} onPress={onPress} activeOpacity={0.8}>
      <View style={[st.statIcon, { backgroundColor: iconColor + '15' }]}>
        <Icon name={icon} size={20} color={iconColor} />
      </View>
      <Text style={st.statCount}>{count}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

// ── 스타일 ────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: 16,
    backgroundColor: '#fff',
  },
  greeting: { fontSize: 22, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  newReportBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center',
  },

  // 통계
  statsScroll: { marginTop: 16 },
  statCard: {
    width: (SCREEN_WIDTH - 64) / 4, minWidth: 80,
    backgroundColor: '#fff', borderRadius: BorderRadius.xl,
    padding: 12, marginRight: 10, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  statIcon: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  statCount: { fontSize: 20, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary, marginTop: 2 },

  // 필터
  filterRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.lg,
    marginTop: 20, marginBottom: 12, gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: BorderRadius.xl, backgroundColor: '#fff',
    borderWidth: 1, borderColor: Colors.steel[200],
  },
  filterTabActive: {
    backgroundColor: Colors.steel[800], borderColor: Colors.steel[800],
  },
  filterText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.steel[500] },
  filterTextActive: { color: '#fff' },

  // 목록
  listContainer: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },

  accidentCard: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderRadius: BorderRadius.xl, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    overflow: 'hidden',
  },
  statusBar: { width: 4 },
  cardBody: { flex: 1, padding: 14 },
  cardArrow: { justifyContent: 'center', paddingRight: 12 },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  carNumber: { fontSize: 16, fontWeight: '800', color: Colors.text },
  carModel: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 10, fontWeight: '700' },

  cardInfo: { gap: 5 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 12, color: Colors.steel[600], flex: 1 },
  settlementTag: {
    fontSize: 10, fontWeight: '700', color: '#0e7490',
    backgroundColor: '#cffafe', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 4, overflow: 'hidden',
  },

  assignmentInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  assignmentText: { fontSize: 10, color: Colors.steel[400] },

  // 빈 상태
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: FontSize.base, color: Colors.steel[400], marginTop: 12 },
})
