import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Linking, Alert, ActivityIndicator, Platform,
} from 'react-native'
import Icon from 'react-native-vector-icons/Ionicons'
import { useNavigation } from '@react-navigation/native'
import { Colors, FontSize, Spacing, BorderRadius } from '../../constants/theme'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import type { Schedule, ScheduleTaskType, ScheduleStatus } from '../../lib/types'

// ============================================
// 배차/일정 화면 (탭)
// 주간 일정 카드 뷰 + 업무 시작/완료 처리
// ============================================

const TASK_TYPE_CONFIG: Record<ScheduleTaskType, { label: string; icon: string; color: string }> = {
  pickup: { label: '픽업', icon: 'arrow-down-circle', color: '#2563eb' },
  delivery: { label: '배차', icon: 'arrow-up-circle', color: '#16a34a' },
  inspection: { label: '검수', icon: 'search', color: '#9333ea' },
  maintenance: { label: '정비', icon: 'construct', color: '#ea580c' },
  accident_check: { label: '사고확인', icon: 'alert-circle', color: '#dc2626' },
  return: { label: '반납', icon: 'return-down-back', color: '#0891b2' },
  other: { label: '기타', icon: 'ellipsis-horizontal', color: '#64748b' },
}

const STATUS_CONFIG: Record<ScheduleStatus, { label: string; variant: 'default' | 'info' | 'success' | 'warning' | 'danger' }> = {
  pending: { label: '대기', variant: 'default' },
  in_progress: { label: '진행중', variant: 'info' },
  completed: { label: '완료', variant: 'success' },
  cancelled: { label: '취소', variant: 'danger' },
  rescheduled: { label: '변경', variant: 'warning' },
}

// 날짜 헬퍼
function getWeekDays(baseDate: Date): { date: Date; label: string; dayName: string; isToday: boolean }[] {
  const dayOfWeek = baseDate.getDay()
  const monday = new Date(baseDate)
  monday.setDate(baseDate.getDate() - ((dayOfWeek + 6) % 7))

  const days = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dayNames = ['월', '화', '수', '목', '금', '토', '일']

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    d.setHours(0, 0, 0, 0)
    days.push({
      date: d,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      dayName: dayNames[i],
      isToday: d.getTime() === today.getTime(),
    })
  }
  return days
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export default function ScheduleScreen() {
  const navigation = useNavigation<any>()
  const { user, profile } = useApp()
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [weekDays, setWeekDays] = useState(getWeekDays(new Date()))

  // ── 데이터 로드 ────────────────────
  const loadSchedules = useCallback(async () => {
    if (!user?.id || !profile?.company_id) return

    try {
      // 해당 주의 월~일 범위
      const startDate = formatDate(weekDays[0].date)
      const endDate = formatDate(weekDays[6].date)

      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('user_id', user.id)
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
        .order('scheduled_time', { ascending: true })

      if (!error && data) {
        setSchedules(data)
      }
    } catch (e) {
      console.error('일정 로드 오류:', e)
    }
  }, [user, profile, weekDays])

  useEffect(() => {
    setLoading(true)
    loadSchedules().finally(() => setLoading(false))
  }, [loadSchedules])

  const onRefresh = async () => {
    setRefreshing(true)
    await loadSchedules()
    setRefreshing(false)
  }

  // ── 주 변경 ────────────────────────
  const changeWeek = (direction: number) => {
    const newDate = new Date(weekDays[0].date)
    newDate.setDate(newDate.getDate() + direction * 7)
    setWeekDays(getWeekDays(newDate))
    setSelectedDate(newDate)
  }

  // ── 오늘의 일정 필터 ────────────────
  const todayStr = formatDate(selectedDate)
  const todaySchedules = schedules.filter((s) => s.scheduled_date === todayStr)
  const pendingCount = todaySchedules.filter((s) => s.status === 'pending').length
  const inProgressCount = todaySchedules.filter((s) => s.status === 'in_progress').length

  // ── 업무 시작/완료 ──────────────────
  const updateStatus = async (scheduleId: string, newStatus: ScheduleStatus) => {
    try {
      const updates: any = { status: newStatus }
      if (newStatus === 'in_progress') updates.started_at = new Date().toISOString()
      if (newStatus === 'completed') updates.completed_at = new Date().toISOString()

      await supabase.from('schedules').update(updates).eq('id', scheduleId)
      await loadSchedules()
    } catch (e) {
      Alert.alert('오류', '상태 변경에 실패했습니다.')
    }
  }

  // ── 전화/네비 ──────────────────────
  const callCustomer = (phone: string) => {
    Linking.openURL(`tel:${phone}`)
  }

  const openNavigation = (address: string) => {
    const encoded = encodeURIComponent(address)
    const url = Platform.OS === 'ios'
      ? `maps:?q=${encoded}`
      : `geo:0,0?q=${encoded}`
    Linking.openURL(url).catch(() => {
      // 카카오맵 폴백
      Linking.openURL(`kakaomap://search?q=${encoded}`).catch(() => {
        Alert.alert('오류', '지도 앱을 열 수 없습니다.')
      })
    })
  }

  // ── 렌더링 ─────────────────────────
  return (
    <View style={st.container}>
      {/* 헤더 */}
      <View style={st.header}>
        <Text style={st.headerTitle}>일정</Text>
        <View style={st.headerStats}>
          {pendingCount > 0 && <Badge text={`대기 ${pendingCount}`} variant="warning" size="md" />}
          {inProgressCount > 0 && <Badge text={`진행 ${inProgressCount}`} variant="info" size="md" />}
        </View>
      </View>

      {/* 주간 날짜 선택 */}
      <View style={st.weekBar}>
        <TouchableOpacity onPress={() => changeWeek(-1)} style={st.weekArrow}>
          <Icon name="chevron-back" size={20} color={Colors.steel[500]} />
        </TouchableOpacity>
        <View style={st.weekDays}>
          {weekDays.map((day) => {
            const isSelected = formatDate(day.date) === formatDate(selectedDate)
            const hasSchedule = schedules.some((s) => s.scheduled_date === formatDate(day.date))
            return (
              <TouchableOpacity
                key={day.label}
                style={[st.dayItem, isSelected && st.dayItemSelected, day.isToday && !isSelected && st.dayItemToday]}
                onPress={() => setSelectedDate(day.date)}
              >
                <Text style={[st.dayName, isSelected && st.dayNameSelected]}>{day.dayName}</Text>
                <Text style={[st.dayNumber, isSelected && st.dayNumberSelected]}>{day.date.getDate()}</Text>
                {hasSchedule && <View style={[st.dayDot, isSelected && st.dayDotSelected]} />}
              </TouchableOpacity>
            )
          })}
        </View>
        <TouchableOpacity onPress={() => changeWeek(1)} style={st.weekArrow}>
          <Icon name="chevron-forward" size={20} color={Colors.steel[500]} />
        </TouchableOpacity>
      </View>

      {/* 일정 리스트 */}
      <ScrollView
        style={st.flex}
        contentContainerStyle={st.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} color={Colors.steel[500]} />
        ) : todaySchedules.length === 0 ? (
          <View style={st.empty}>
            <Icon name="calendar-outline" size={48} color={Colors.steel[300]} />
            <Text style={st.emptyText}>오늘 예정된 업무가 없습니다</Text>
            <Text style={st.emptyHint}>
              {formatDate(selectedDate) === formatDate(new Date()) ? '오늘은 편히 쉬세요!' : `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일`}
            </Text>
          </View>
        ) : (
          todaySchedules.map((schedule) => {
            const typeConfig = TASK_TYPE_CONFIG[schedule.task_type] || TASK_TYPE_CONFIG.other
            const statusConfig = STATUS_CONFIG[schedule.status] || STATUS_CONFIG.pending

            return (
              <Card key={schedule.id} style={st.scheduleCard}>
                {/* 상단: 유형 + 시간 + 상태 */}
                <View style={st.cardHeader}>
                  <View style={[st.typeIcon, { backgroundColor: typeConfig.color + '15' }]}>
                    <Icon name={typeConfig.icon} size={20} color={typeConfig.color} />
                  </View>
                  <View style={st.cardHeaderInfo}>
                    <Text style={st.cardTitle}>{schedule.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Badge text={typeConfig.label} variant="default" />
                      {schedule.scheduled_time && (
                        <Text style={st.cardTime}>{schedule.scheduled_time}</Text>
                      )}
                    </View>
                  </View>
                  <Badge text={statusConfig.label} variant={statusConfig.variant} size="md" />
                </View>

                {/* 차량/고객 정보 */}
                {(schedule.customer_name || schedule.car_id) && (
                  <View style={st.cardInfo}>
                    {schedule.customer_name && (
                      <View style={st.infoRow}>
                        <Icon name="person-outline" size={14} color={Colors.textSecondary} />
                        <Text style={st.infoText}>{schedule.customer_name}</Text>
                      </View>
                    )}
                    {schedule.location_address && (
                      <View style={st.infoRow}>
                        <Icon name="location-outline" size={14} color={Colors.textSecondary} />
                        <Text style={st.infoText} numberOfLines={1}>{schedule.location_address}</Text>
                      </View>
                    )}
                    {schedule.description && (
                      <Text style={st.cardDesc} numberOfLines={2}>{schedule.description}</Text>
                    )}
                  </View>
                )}

                {/* 액션 버튼 */}
                <View style={st.cardActions}>
                  {schedule.customer_phone && (
                    <TouchableOpacity style={st.actionBtn} onPress={() => callCustomer(schedule.customer_phone!)}>
                      <Icon name="call" size={18} color={Colors.success} />
                      <Text style={[st.actionText, { color: Colors.success }]}>전화</Text>
                    </TouchableOpacity>
                  )}
                  {schedule.location_address && (
                    <TouchableOpacity style={st.actionBtn} onPress={() => openNavigation(schedule.location_address!)}>
                      <Icon name="navigate" size={18} color={Colors.info} />
                      <Text style={[st.actionText, { color: Colors.info }]}>길안내</Text>
                    </TouchableOpacity>
                  )}
                  {schedule.status === 'pending' && (
                    <TouchableOpacity
                      style={[st.actionBtn, st.actionBtnPrimary]}
                      onPress={() => updateStatus(schedule.id!, 'in_progress')}
                    >
                      <Icon name="play" size={18} color="#fff" />
                      <Text style={[st.actionText, { color: '#fff' }]}>시작</Text>
                    </TouchableOpacity>
                  )}
                  {schedule.status === 'in_progress' && (
                    <TouchableOpacity
                      style={[st.actionBtn, st.actionBtnSuccess]}
                      onPress={() => updateStatus(schedule.id!, 'completed')}
                    >
                      <Icon name="checkmark" size={18} color="#fff" />
                      <Text style={[st.actionText, { color: '#fff' }]}>완료</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Card>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}

const st = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.background },

  // 헤더
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, backgroundColor: '#fff' },
  headerTitle: { fontSize: FontSize['2xl'], fontWeight: '900', color: Colors.text },
  headerStats: { flexDirection: 'row', gap: 8 },

  // 주간 선택
  weekBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  weekArrow: { padding: 8 },
  weekDays: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  dayItem: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: BorderRadius.lg, minWidth: 36 },
  dayItemSelected: { backgroundColor: Colors.info },
  dayItemToday: { backgroundColor: Colors.steel[100] },
  dayName: { fontSize: 10, color: Colors.textSecondary, fontWeight: '600' },
  dayNameSelected: { color: 'rgba(255,255,255,0.8)' },
  dayNumber: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginTop: 2 },
  dayNumberSelected: { color: '#fff' },
  dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.info, marginTop: 3 },
  dayDotSelected: { backgroundColor: '#fff' },

  // 리스트
  listContent: { padding: Spacing.lg, paddingBottom: 100 },

  // 빈 상태
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textSecondary, marginTop: 16 },
  emptyHint: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },

  // 일정 카드
  scheduleCard: { marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  typeIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardHeaderInfo: { flex: 1 },
  cardTitle: { fontSize: FontSize.base, fontWeight: '800', color: Colors.text },
  cardTime: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },

  cardInfo: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.steel[100] },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  infoText: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1 },
  cardDesc: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },

  // 액션
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.steel[100] },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.lg, backgroundColor: Colors.steel[50] },
  actionBtnPrimary: { backgroundColor: Colors.info },
  actionBtnSuccess: { backgroundColor: Colors.success },
  actionText: { fontSize: FontSize.sm, fontWeight: '700' },
})
