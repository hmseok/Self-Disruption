import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import Icon from 'react-native-vector-icons/Ionicons'
import type { MainTabParamList, DetailStackParamList } from './types'
import { Colors, FontSize } from '../constants/theme'

// 탭 화면
import DashboardScreen from '../screens/tabs/DashboardScreen'
import CarsScreen from '../screens/tabs/CarsScreen'
import ScheduleScreen from '../screens/tabs/ScheduleScreen'
import QuotesScreen from '../screens/tabs/QuotesScreen'
import MoreScreen from '../screens/tabs/MoreScreen'

// 기존 상세 화면
import CarDetailScreen from '../screens/detail/CarDetailScreen'
import InsuranceListScreen from '../screens/detail/InsuranceListScreen'
import InsuranceDetailScreen from '../screens/detail/InsuranceDetailScreen'
import QuoteDetailScreen from '../screens/detail/QuoteDetailScreen'
import LoanDetailScreen from '../screens/detail/LoanDetailScreen'
import CustomerDetailScreen from '../screens/detail/CustomerDetailScreen'
import SettingsScreen from '../screens/detail/SettingsScreen'

// 현장직원 화면
import VehicleHandoverScreen from '../screens/detail/VehicleHandoverScreen'
import MaintenanceRequestScreen from '../screens/detail/MaintenanceRequestScreen'
import AccidentReportScreen from '../screens/detail/AccidentReportScreen'
import ExpenseReceiptScreen from '../screens/detail/ExpenseReceiptScreen'

// 사고팀 화면
import AccidentDashboardScreen from '../screens/tabs/AccidentDashboardScreen'
import AccidentCaseDetailScreen from '../screens/detail/AccidentCaseDetailScreen'
import ReportFormScreen from '../screens/detail/ReportFormScreen'

const Tab = createBottomTabNavigator<MainTabParamList>()
const Stack = createNativeStackNavigator<DetailStackParamList>()

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.steel[700],
        tabBarInactiveTintColor: Colors.steel[400],
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.steel[200],
          borderTopWidth: 1,
          height: 85,
          paddingTop: 8,
          paddingBottom: 28,
        },
        tabBarLabelStyle: {
          fontSize: FontSize.xs,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: '홈',
          tabBarIcon: ({ color, size }) => (
            <Icon name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Cars"
        component={CarsScreen}
        options={{
          title: '차량',
          tabBarIcon: ({ color, size }) => (
            <Icon name="car-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{
          title: '일정',
          tabBarIcon: ({ color, size }) => (
            <Icon name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Quotes"
        component={QuotesScreen}
        options={{
          title: '견적',
          tabBarIcon: ({ color, size }) => (
            <Icon name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{
          title: '더보기',
          tabBarIcon: ({ color, size }) => (
            <Icon name="ellipsis-horizontal" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  )
}

export default function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.white },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 16 },
        headerShadowVisible: false,
        headerBackTitle: '뒤로',
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={TabNavigator}
        options={{ headerShown: false }}
      />

      {/* 기존 상세 화면 */}
      <Stack.Screen name="CarDetail" component={CarDetailScreen} options={{ title: '차량 상세' }} />
      <Stack.Screen name="InsuranceList" component={InsuranceListScreen} options={{ title: '보험 관리' }} />
      <Stack.Screen name="InsuranceDetail" component={InsuranceDetailScreen} options={{ title: '보험 상세' }} />
      <Stack.Screen name="QuoteDetail" component={QuoteDetailScreen} options={{ title: '견적 상세' }} />
      <Stack.Screen name="LoanDetail" component={LoanDetailScreen} options={{ title: '대출 상세' }} />
      <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} options={{ title: '고객 상세' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '설정' }} />

      {/* 현장직원 화면 */}
      <Stack.Screen name="VehicleHandover" component={VehicleHandoverScreen} options={{ title: '차량 인수인계' }} />
      <Stack.Screen name="MaintenanceRequest" component={MaintenanceRequestScreen} options={{ title: '정비 요청' }} />
      <Stack.Screen name="AccidentReport" component={AccidentReportScreen} options={{ title: '사고 접수' }} />
      <Stack.Screen name="ExpenseReceipt" component={ExpenseReceiptScreen} options={{ title: '영수증 제출' }} />

      {/* 사고팀 화면 */}
      <Stack.Screen name="AccidentDashboard" component={AccidentDashboardScreen} options={{ title: '사고 관리', headerShown: false }} />
      <Stack.Screen name="AccidentCaseDetail" component={AccidentCaseDetailScreen} options={{ title: '사고건 상세' }} />
      <Stack.Screen name="ReportForm" component={ReportFormScreen} options={({ route }: any) => ({ title: route.params?.reportLabel || '보고서 작성' })} />
    </Stack.Navigator>
  )
}
