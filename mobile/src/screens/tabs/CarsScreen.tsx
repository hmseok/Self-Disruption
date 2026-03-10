import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import Icon from 'react-native-vector-icons/Ionicons'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Input from '../../components/ui/Input'
import { Colors, FontSize, Spacing, BorderRadius } from '../../constants/theme'
import { DetailStackParamList } from '../../navigation/types'
import { useApp } from '../../context/AppContext'
import { supabase } from '../../lib/supabase'
import type { Car } from '../../lib/types'

// ============================================
// 차량 목록 — 현장직원용 필터 + 롱프레스 퀵액션
// ============================================

type NavigationProp = NativeStackNavigationProp<DetailStackParamList>

const STATUS_TABS = [
  { label: '전체', value: 'all', icon: 'apps' },
  { label: '가용', value: 'available', icon: 'checkmark-circle' },
  { label: '렌트중', value: 'rented', icon: 'key' },
  { label: '정비중', value: 'maintenance', icon: 'construct' },
  { label: '매각', value: 'sold', icon: 'remove-circle' },
]

const STATUS_LABEL: Record<string, string> = {
  available: '가용', rented: '렌트중', maintenance: '정비중', sold: '매각',
}

const STATUS_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'default'> = {
  available: 'success', rented: 'info', maintenance: 'warning', sold: 'danger',
}

export default function CarsScreen() {
  const navigation = useNavigation<NavigationProp>()
  const { company } = useApp()
  const [cars, setCars] = useState<Car[]>([])
  const [filteredCars, setFilteredCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')

  const loadCars = async () => {
    if (!company?.id) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('cars')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
      setCars(data || [])
    } catch (err) {
      console.error('차량 로드 에러:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCars() }, [company?.id])

  useEffect(() => {
    let filtered = cars
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(c => c.status === selectedStatus)
    }
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(c =>
        c.number?.toLowerCase().includes(q) ||
        c.brand?.toLowerCase().includes(q) ||
        c.model?.toLowerCase().includes(q)
      )
    }
    setFilteredCars(filtered)
  }, [search, selectedStatus, cars])

  // 롱프레스 퀵액션
  const showQuickActions = (car: Car) => {
    Alert.alert(
      `${car.number}`,
      `${car.brand} ${car.model}`,
      [
        { text: '인수인계', onPress: () => navigation.navigate('VehicleHandover') },
        { text: '정비요청', onPress: () => navigation.navigate('MaintenanceRequest') },
        { text: '사고접수', onPress: () => navigation.navigate('AccidentReport') },
        { text: '상세보기', onPress: () => navigation.navigate('CarDetail', { id: car.id }) },
        { text: '취소', style: 'cancel' },
      ]
    )
  }

  // 상태별 개수
  const statusCounts: Record<string, number> = { all: cars.length }
  cars.forEach((c) => {
    if (c.status) statusCounts[c.status] = (statusCounts[c.status] || 0) + 1
  })

  const CarItem = ({ car }: { car: Car }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('CarDetail', { id: car.id })}
      onLongPress={() => showQuickActions(car)}
      activeOpacity={0.7}
      delayLongPress={400}
    >
      <Card style={s.carCard}>
        <View style={s.carTop}>
          <View style={s.carMainInfo}>
            <Text style={s.carNumber}>{car.number}</Text>
            <Text style={s.carModel}>{car.brand} {car.model} {car.trim || ''}</Text>
          </View>
          <Badge
            text={STATUS_LABEL[car.status] || car.status}
            variant={STATUS_VARIANT[car.status] || 'default'}
          />
        </View>

        <View style={s.carBottom}>
          <View style={s.carStat}>
            <Icon name="calendar-outline" size={13} color={Colors.textMuted} />
            <Text style={s.carStatText}>{car.year || '-'}년</Text>
          </View>
          <View style={s.carStat}>
            <Icon name="speedometer-outline" size={13} color={Colors.textMuted} />
            <Text style={s.carStatText}>{car.mileage?.toLocaleString() || '-'} km</Text>
          </View>
          <View style={s.carStat}>
            <Icon name="flash-outline" size={13} color={Colors.textMuted} />
            <Text style={s.carStatText}>{car.fuel || '-'}</Text>
          </View>
        </View>

        {/* 퀵 액션 아이콘 */}
        <View style={s.carActions}>
          <TouchableOpacity style={s.carActionBtn} onPress={() => navigation.navigate('VehicleHandover')}>
            <Icon name="swap-horizontal" size={16} color={Colors.info} />
            <Text style={[s.carActionText, { color: Colors.info }]}>인수인계</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.carActionBtn} onPress={() => navigation.navigate('MaintenanceRequest')}>
            <Icon name="construct" size={16} color={Colors.warning} />
            <Text style={[s.carActionText, { color: Colors.warning }]}>정비</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.carActionBtn} onPress={() => navigation.navigate('AccidentReport')}>
            <Icon name="alert-circle" size={16} color={Colors.danger} />
            <Text style={[s.carActionText, { color: Colors.danger }]}>사고</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>차량</Text>
        <Text style={s.count}>{filteredCars.length}대</Text>
      </View>

      <View style={s.content}>
        <Input
          placeholder="차량번호, 브랜드 검색"
          value={search}
          onChangeText={setSearch}
          icon="search"
          style={{ marginBottom: 12 }}
        />

        {/* 상태 탭 */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUS_TABS}
          keyExtractor={item => item.value}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setSelectedStatus(item.value)}
              style={[s.tab, selectedStatus === item.value && s.tabActive]}
            >
              <Icon
                name={item.icon}
                size={14}
                color={selectedStatus === item.value ? '#fff' : Colors.steel[400]}
                style={{ marginRight: 4 }}
              />
              <Text style={[s.tabText, selectedStatus === item.value && s.tabTextActive]}>
                {item.label}
              </Text>
              <Text style={[s.tabCount, selectedStatus === item.value && s.tabCountActive]}>
                {statusCounts[item.value] || 0}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ gap: 8, marginBottom: 16 }}
          style={{ flexGrow: 0 }}
        />

        {/* 차량 리스트 */}
        <FlatList
          data={filteredCars}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => <CarItem car={item} />}
          refreshing={loading}
          onRefresh={loadCars}
          ListEmptyComponent={
            <View style={s.empty}>
              <Icon name="car-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyText}>차량이 없습니다</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg },
  title: { fontSize: FontSize['2xl'], fontWeight: '900', color: Colors.text },
  count: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textSecondary },
  content: { flex: 1, paddingHorizontal: Spacing.lg },

  // 탭
  tab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.steel[700], borderColor: Colors.steel[700] },
  tabText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.white },
  tabCount: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, marginLeft: 4 },
  tabCountActive: { color: 'rgba(255,255,255,0.7)' },

  // 차량 카드
  carCard: { marginBottom: 10 },
  carTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  carMainInfo: { flex: 1 },
  carNumber: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  carModel: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  carBottom: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  carStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  carStatText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },

  // 퀵 액션
  carActions: { flexDirection: 'row', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.steel[100] },
  carActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: BorderRadius.md, backgroundColor: Colors.steel[50] },
  carActionText: { fontSize: FontSize.xs, fontWeight: '700' },

  // 빈 상태
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: FontSize.base, color: Colors.textMuted, marginTop: Spacing.md },
})
