import React, { useEffect, useRef } from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useNavigation, NavigationContainerRef } from '@react-navigation/native'
import type { RootStackParamList } from './types'
import { useApp } from '../context/AppContext'
import { SyncService } from '../services/SyncService'
import { useNotifications } from '../hooks/useNotifications'

import AuthNavigator from './AuthNavigator'
import MainNavigator from './MainNavigator'

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function AppNavigator() {
  const { user, profile } = useApp()
  const { pendingNavigation, clearPendingNavigation } = useNotifications()
  const navigationRef = useRef<any>(null)

  // SyncService 초기화/종료
  useEffect(() => {
    if (user?.id) {
      SyncService.initialize()
    }
    return () => {
      SyncService.destroy()
    }
  }, [user?.id])

  // 로그인 후 전체 동기화
  useEffect(() => {
    if (user?.id && profile?.company_id) {
      SyncService.fullSync(user.id, profile.company_id)
    }
  }, [user?.id, profile?.company_id])

  // 알림 딥링크 네비게이션 처리
  useEffect(() => {
    if (pendingNavigation && user) {
      // 약간의 딜레이 후 네비게이션 (화면 준비 대기)
      const timer = setTimeout(() => {
        try {
          if (navigationRef.current) {
            navigationRef.current.navigate(
              pendingNavigation.screen,
              pendingNavigation.params
            )
          }
        } catch (e) {
          console.error('[AppNavigator] 딥링크 네비게이션 오류:', e)
        }
        clearPendingNavigation()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [pendingNavigation, user, clearPendingNavigation])

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <Stack.Screen name="Main" component={MainNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  )
}
