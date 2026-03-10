import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, RefreshControl, TouchableOpacity, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import Icon from 'react-native-vector-icons/Ionicons'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import { Colors, FontSize, Spacing, BorderRadius } from '../../constants/theme'
import { DetailStackParamList } from '../../navigation/types'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import { getQueueCount } from '../../lib/api'
import type { Car } from '../../lib/types'

// ============================================
// 대시보드 — 현장직원 퀵액션 + KPI + 최근 차량
// ============================================

type NavigationProp = NativeStackNavigationProp<DetailStackParamList>

export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp>()
  const { profile, company, user } = useApp()
  const [stats, setStats] = useState({ cars: 0, insurance: 0, quotes: 0, revenue: 0 })
  const [todayTasks, setTodayTasks] = useState(0)
  const [offlineQueue, setOfflineQueue] = useState(0)
  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const [carsRes, insuranceRes, quotesRes, transactionRes] = await Promise.all([
        supabase.from('cars').select('*').eq('company_id', company.id),
        supabase.from('insurance_contracts').select('*').eq('company_id', company.id),
        supabase.from('quotes').select('*').eq('company_id', company.id),
        supabase.from('transactions')
          .select('amount')
          .eq('company_id', company.id)
          .gte('transaction_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
          .eq('type', 'income'),
      ])

      setCars(carsRes.data || [])
      setStats({
        cars: carsRes.data?.length || 0,
        insurance: insuranceRes.data?.length || 0,
        quotes: quotesRes.data?.length || 0,
        revenue: transactionRes.data?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0,
      })

      // 오늘의 일정 수
      if (user?.id) {
        const today = new Date().toISOString().split('T')[0]
        const { data: scheduleData } = await supabase
          .from('schedules')
          .select('id')
          .eq('user_id', user.id)
          .eq('scheduled_date', today)
          .in('status', ['pending', 'in_progress'])
        setTodayTasks(scheduleData?.length || 0)
      }

      // 오프라인 큐
      const queueCount = await getQueueCount()
      setOfflineQueue(queueCount)
    } catch (err) {
      console.error('대시보드 로드 에러:', err)
    } finally {
      setLoading(false)
    }
  }, [company?.id, user?.id])

  useEffect(() => { loadData() }, [loadData])

  // ── 퀵 액션 ────────────────────────
  const QUICK_ACTIONS = [
    { icon: 'swap-horizontal', label: '인수인계', color: '#2563eb', bg: '#dbeafe', screen: 'VehicleHandover' as const },
    { icon: 'construct', label: '정비요청', color: '#ea580c', bg: '#ffedd5', screen: 'MaintenanceRequest' as const },
    { icon: 'alert-circle', label: '사고접수', color: '#dc2626', bg: '#fee2e2', screen: 'AccidentReport' as const },
    { icon: 'receipt', label: '영수증', color: '#16a34a', bg: '#dcfce7', screen: 'ExpenseReceipt' as const },
  ]

  // ── KPI ─────────────────────────────
  const KPICard = ({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) => (
    <View style={[s.kpiCard, { borderLeftColor: color }]}>
      <View style={[s.kpiIcon, { backgroundColor: color + '20' }]}>
        <Icon name={icon} size={22} color={color} />
      </View>
      <View style={s.kpiContent}>
        <Text style={s.kpiLabel}>{label}</Text>
        <Text style={s.kpiValue}>{value}</Text>
      </View>
    </View>
  )

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>안녕하세요,</Text>
          <Text style={s.title}>{profile?.employee_name || '사용자'}님</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={s.settingsBtn}>
          <Icon name="settings-outline" size={24} color={Colors.steel[700]} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} />}
        style={s.content}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* 오늘의 업무 요약 */}
        {(todayTasks > 0 || offlineQueue > 0) && (
          <View style={s.alertRow}>
            {todayTasks > 0 && (
              <TouchableOpacity style={s.alertCard} onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Schedule' })}>
                <Icon name="calendar" size={18} color="#7c3aed" />
                <Text style={s.alertText}>오늘 업무 <Text style={s.alertCount}>{todayTasks}건</Text></Text>
              </TouchableOpacity>
            )}
            {offlineQueue > 0 && (
              <View style={[s.alertCard, { backgroundColor: '#fef3c7' }]}>
                <Icon name="cloud-offline" size={18} color="#d97706" />
                <Text style={[s.alertText, { color: '#92400e' }]}>대기 중 <Text style={s.alertCount}>{offlineQueue}건</Text></Text>
              </View>
            )}
          </View>
        )}

        {/* 퀵 액션 */}
        <Text style={s.sectionTitle}>빠른 작업</Text>
        <View style={s.quickGrid}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={[s.quickItem, { backgroundColor: action.bg }]}
              onPress={() => {
                if (action.screen) navigation.navigate(action.screen)
                else if (action.tab) (navigation as any).navigate('MainTabs', { screen: action.tab })
              }}
              activeOpacity={0.7}
            >
              <View style={[s.quickIcon, { backgroundColor: action.color + '20' }]}>
                <Icon name={action.icon} size={26} color={action.color} />
              </View>
              <Text style={[s.quickLabel, { color: action.color }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* KPI */}
        <Text style={s.sectionTitle}>현황</Text>
        <View style={s.kpiGrid}>
          <KPICard icon="car" label="차량" value={stats.cars} color={Colors.info} />
          <KPICard icon="shield-checkmark" label="보험" value={stats.insurance} color={Colors.success} />
          <KPICard icon="document-text" label="견적" value={stats.quotes} color={Colors.warning} />
          <KPICard icon="trending-up" label="이번달 수입" value={`₩${(stats.revenue / 1000000).toFixed(1)}M`} color={Colors.steel[600]} />
        </View>

        {/* 최근 차량 */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>최근 차량</Text>
          <TouchableOpacity onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Cars' })}>
            <Text style={s.seeAll}>전체보기</Text>
          </TouchableOpacity>
        </View>
        {cars.slice(0, 3).map(car => (
          <TouchableOpacity
            key={car.id}
            onPress={() => navigation.navigate('CarDetail', { id: car.id })}
            activeOpacity={0.7}
          >
            <Card style={s.carItem}>
              <View style={s.carHeader}>
                <View>
                  <Text style={s.carNumber}>{car.number}</Text>
                  <Text style={s.carModel}>{car.brand} {car.model}</Text>
                </View>
                <Badge text={
                  car.status === 'available' ? '가용' :
                  car.status === 'rented' ? '렌트중' :
                  car.status === 'maintenance' ? '정비중' : '매각'
                } variant={
                  car.status === 'available' ? 'success' :
                  car.status === 'rented' ? 'info' :
                  car.status === 'maintenance' ? 'warning' : 'danger'
                } />
              </View>
              <View style={s.carMeta}>
                <Text style={s.carMetaText}>연식: {car.year || '-'}</Text>
                <Text style={s.carMetaText}>주행: {car.mileage?.toLocaleString() || '-'} km</Text>
              </View>
            </Card>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg },
  greeting: { fontSize: FontSize.sm, color: Colors.textSecondary },
  title: { fontSize: FontSize['2xl'], fontWeight: '900', color: Colors.text },
  settingsBtn: { padding: Spacing.md },
  content: { flex: 1, paddingHorizontal: Spacing.lg },

  // 알림
  alertRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  alertCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: BorderRadius.lg, backgroundColor: '#ede9fe' },
  alertText: { fontSize: FontSize.sm, color: '#5b21b6', fontWeight: '600' },
  alertCount: { fontWeight: '900' },

  // 퀵 액션
  quickGrid: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  quickItem: { flex: 1, alignItems: 'center', paddingVertical: 18, borderRadius: BorderRadius.xl },
  quickIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  quickLabel: { fontSize: FontSize.sm, fontWeight: '800' },

  // 섹션
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  seeAll: { fontSize: FontSize.sm, color: Colors.info, fontWeight: '600' },

  // KPI
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  kpiCard: { flex: 1, minWidth: '45%', flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderLeftWidth: 3, padding: 12, borderWidth: 1, borderColor: Colors.border },
  kpiIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  kpiContent: {},
  kpiLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: 2 },
  kpiValue: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },

  // 차량
  carItem: { marginBottom: 10 },
  carHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  carNumber: { fontSize: FontSize.base, fontWeight: '800', color: Colors.text },
  carModel: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  carMeta: { flexDirection: 'row', gap: Spacing.md },
  carMetaText: { fontSize: FontSize.xs, color: Colors.textMuted },
})
