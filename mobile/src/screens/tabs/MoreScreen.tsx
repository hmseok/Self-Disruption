import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import Icon from 'react-native-vector-icons/Ionicons'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { Colors, FontSize, Spacing, BorderRadius } from '../../constants/theme'
import { DetailStackParamList } from '../../navigation/types'
import { useApp } from '../../context/AppContext'
import { getQueueCount, syncOfflineQueue } from '../../lib/api'

// ============================================
// 더보기 — 현장직원용 메뉴 + 오프라인 동기화
// ============================================

type NavigationProp = NativeStackNavigationProp<DetailStackParamList>

export default function MoreScreen() {
  const navigation = useNavigation<NavigationProp>()
  const { profile, company, role, signOut } = useApp()
  const [loggingOut, setLoggingOut] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [queueCount, setQueueCount] = useState(0)

  useEffect(() => {
    getQueueCount().then(setQueueCount)
  }, [])

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true)
          try { await signOut() } catch { setLoggingOut(false) }
        },
      },
    ])
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await syncOfflineQueue()
      const newCount = await getQueueCount()
      setQueueCount(newCount)
      Alert.alert('동기화 완료', `성공: ${result.success}건, 실패: ${result.failed}건`)
    } catch {
      Alert.alert('오류', '동기화 중 오류가 발생했습니다.')
    } finally {
      setSyncing(false)
    }
  }

  const isMaster = role === 'master' || role === 'god_admin'

  const MenuSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={s.menuSection}>
      <Text style={s.menuSectionTitle}>{title}</Text>
      <View style={s.menuGroup}>{children}</View>
    </View>
  )

  const MenuItem = ({ icon, label, onPress, badge, color }: {
    icon: string; label: string; onPress: () => void; badge?: string; color?: string
  }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={s.menuItem}>
      <View style={[s.menuIconWrap, { backgroundColor: (color || Colors.steel[500]) + '15' }]}>
        <Icon name={icon} size={20} color={color || Colors.steel[600]} />
      </View>
      <Text style={s.menuLabel}>{label}</Text>
      <View style={s.menuRight}>
        {badge && <Badge text={badge} variant="danger" />}
        <Icon name="chevron-forward" size={18} color={Colors.textMuted} />
      </View>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={s.container}>
      <ScrollView style={s.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* 프로필 카드 */}
        <Card style={s.profileCard}>
          <View style={s.profileRow}>
            <View style={s.avatarWrap}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, s.avatarPlaceholder]}>
                  <Icon name="person" size={28} color="#fff" />
                </View>
              )}
            </View>
            <View style={s.profileInfo}>
              <Text style={s.profileName}>{profile?.employee_name || '사용자'}</Text>
              <Text style={s.profileEmail}>{profile?.email}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                <Badge text={company?.name || '회사'} variant="default" />
                <Badge
                  text={role === 'god_admin' ? '관리자' : role === 'master' ? '마스터' : '직원'}
                  variant={role === 'god_admin' ? 'danger' : role === 'master' ? 'info' : 'default'}
                />
              </View>
            </View>
          </View>
        </Card>

        {/* 오프라인 동기화 */}
        {queueCount > 0 && (
          <Card style={[s.syncCard]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="cloud-offline" size={22} color="#d97706" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: FontSize.sm, fontWeight: '700', color: '#92400e' }}>
                  오프라인 대기 중 {queueCount}건
                </Text>
                <Text style={{ fontSize: FontSize.xs, color: '#b45309' }}>
                  네트워크 연결 시 자동 전송됩니다
                </Text>
              </View>
              <Button title="동기화" size="sm" onPress={handleSync} loading={syncing} />
            </View>
          </Card>
        )}

        {/* 현장 업무 */}
        <MenuSection title="현장 업무">
          <MenuItem icon="swap-horizontal" label="인수인계" color="#2563eb" onPress={() => navigation.navigate('VehicleHandover')} />
          <MenuItem icon="construct" label="정비 요청" color="#ea580c" onPress={() => navigation.navigate('MaintenanceRequest')} />
          <MenuItem icon="alert-circle" label="사고 접수" color="#dc2626" onPress={() => navigation.navigate('AccidentReport')} />
          <MenuItem icon="receipt" label="영수증 제출" color="#16a34a" onPress={() => navigation.navigate('ExpenseReceipt')} />
        </MenuSection>

        {/* 관리 */}
        <MenuSection title="관리">
          <MenuItem icon="shield-checkmark-outline" label="보험 관리" onPress={() => navigation.navigate('InsuranceList')} />
          <MenuItem icon="people-outline" label="고객 관리" onPress={() => navigation.navigate('CustomerDetail', { id: 1 })} />
          {isMaster && (
            <MenuItem icon="people-circle-outline" label="조직 관리" onPress={() => Alert.alert('준비 중', '조직 관리 기능이 준비 중입니다.')} />
          )}
        </MenuSection>

        {/* 설정 */}
        <MenuSection title="설정">
          <MenuItem icon="person-outline" label="내 정보" onPress={() => navigation.navigate('Settings')} />
          <MenuItem icon="notifications-outline" label="알림 설정" onPress={() => Alert.alert('준비 중', '알림 설정 기능이 준비 중입니다.')} />
          <MenuItem icon="help-circle-outline" label="도움말" onPress={() => Alert.alert('도움말', '문의: 010-9828-9500')} />
        </MenuSection>

        {/* 앱 정보 */}
        <View style={s.infoSection}>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>앱 버전</Text>
            <Text style={s.infoValue}>2.0.0</Text>
          </View>
        </View>

        {/* 로그아웃 */}
        <Button
          title="로그아웃"
          onPress={handleLogout}
          variant="danger"
          fullWidth
          loading={loggingOut}
          style={{ marginTop: 8 }}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },

  // 프로필
  profileCard: { marginBottom: 20 },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { marginRight: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.steel[300] },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  profileEmail: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },

  // 동기화
  syncCard: { marginBottom: 20, backgroundColor: '#fffbeb' },

  // 메뉴 섹션
  menuSection: { marginBottom: 20 },
  menuSectionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, paddingLeft: 4 },
  menuGroup: { backgroundColor: '#fff', borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.steel[100] },
  menuIconWrap: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  menuLabel: { flex: 1, fontSize: FontSize.base, fontWeight: '600', color: Colors.text },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // 앱 정보
  infoSection: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  infoValue: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
})
