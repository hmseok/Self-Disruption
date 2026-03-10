import { AppState, AppStateStatus } from 'react-native'
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { syncOfflineQueue, getQueueCount } from '../lib/api'
import { supabase } from '../lib/supabase'

// ============================================
// 동기화 서비스
// 네트워크 복구 시 자동 전송 + 주기적 데이터 새로고침
// ============================================

const SYNC_INTERVAL = 5 * 60 * 1000        // 5분 마다 데이터 새로고침
const LAST_SYNC_KEY = '@last_sync_timestamp'
const SYNC_STATE_KEY = '@sync_state'

// ── 타입 ───────────────────────────────────

interface SyncState {
  lastSyncAt: string | null
  pendingCount: number
  isSyncing: boolean
  lastError: string | null
}

type SyncEventCallback = (state: SyncState) => void

// ── 싱글톤 서비스 ──────────────────────────

class SyncServiceClass {
  private listeners: Set<SyncEventCallback> = new Set()
  private syncInterval: ReturnType<typeof setInterval> | null = null
  private netInfoUnsubscribe: (() => void) | null = null
  private appStateSubscription: any = null
  private state: SyncState = {
    lastSyncAt: null,
    pendingCount: 0,
    isSyncing: false,
    lastError: null,
  }
  private isInitialized = false

  // ── 초기화/종료 ────────────────────────

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    // 저장된 상태 복원
    try {
      const saved = await AsyncStorage.getItem(SYNC_STATE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        this.state.lastSyncAt = parsed.lastSyncAt || null
      }
    } catch {}

    // 오프라인 큐 카운트
    this.state.pendingCount = await getQueueCount()

    // 네트워크 상태 감지
    this.netInfoUnsubscribe = NetInfo.addEventListener(this.handleNetworkChange)

    // 앱 상태 감지 (포그라운드 복귀 시 동기화)
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange)

    // 주기적 동기화 시작
    this.startPeriodicSync()

    this.isInitialized = true
    this.notifyListeners()
    console.log('[SyncService] 초기화 완료')
  }

  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe()
      this.netInfoUnsubscribe = null
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove()
      this.appStateSubscription = null
    }
    this.listeners.clear()
    this.isInitialized = false
    console.log('[SyncService] 종료')
  }

  // ── 이벤트 리스너 ──────────────────────

  subscribe(callback: SyncEventCallback): () => void {
    this.listeners.add(callback)
    callback(this.state)
    return () => this.listeners.delete(callback)
  }

  private notifyListeners(): void {
    this.listeners.forEach((cb) => {
      try { cb({ ...this.state }) } catch {}
    })
  }

  // ── 네트워크 복구 핸들러 ────────────────

  private handleNetworkChange = async (netState: NetInfoState): Promise<void> => {
    if (netState.isConnected && this.state.pendingCount > 0) {
      console.log('[SyncService] 네트워크 복구 감지 → 큐 동기화')
      await this.syncQueue()
    }
  }

  // ── 앱 상태 변경 핸들러 ──────────────────

  private handleAppStateChange = async (nextState: AppStateStatus): Promise<void> => {
    if (nextState === 'active') {
      // 포그라운드 복귀 시 큐 확인 + 동기화
      this.state.pendingCount = await getQueueCount()
      this.notifyListeners()

      if (this.state.pendingCount > 0) {
        await this.syncQueue()
      }
    }
  }

  // ── 주기적 동기화 ──────────────────────

  private startPeriodicSync(): void {
    if (this.syncInterval) return

    this.syncInterval = setInterval(async () => {
      // 큐 동기화
      const count = await getQueueCount()
      if (count > 0) {
        await this.syncQueue()
      }

      // 마지막 동기화 시간 업데이트
      this.state.lastSyncAt = new Date().toISOString()
      await this.saveState()
      this.notifyListeners()
    }, SYNC_INTERVAL)
  }

  // ── 큐 동기화 실행 ────────────────────

  async syncQueue(): Promise<{ success: number; failed: number }> {
    if (this.state.isSyncing) {
      return { success: 0, failed: 0 }
    }

    this.state.isSyncing = true
    this.state.lastError = null
    this.notifyListeners()

    try {
      const result = await syncOfflineQueue()

      this.state.pendingCount = await getQueueCount()
      this.state.lastSyncAt = new Date().toISOString()
      this.state.isSyncing = false

      if (result.failed > 0) {
        this.state.lastError = `${result.failed}건 동기화 실패`
      }

      await this.saveState()
      this.notifyListeners()

      console.log(`[SyncService] 큐 동기화: 성공 ${result.success}, 실패 ${result.failed}`)
      return result
    } catch (e: any) {
      this.state.isSyncing = false
      this.state.lastError = e.message || '동기화 오류'
      this.notifyListeners()
      return { success: 0, failed: 0 }
    }
  }

  // ── 수동 전체 동기화 ──────────────────

  async fullSync(userId: string, companyId: string): Promise<void> {
    if (this.state.isSyncing) return

    this.state.isSyncing = true
    this.notifyListeners()

    try {
      // 1. 오프라인 큐 동기화
      await this.syncQueue()

      // 2. 주요 데이터 프리페치 (캐시 갱신)
      await Promise.allSettled([
        this.prefetchSchedules(userId, companyId),
        this.prefetchCars(companyId),
      ])

      this.state.lastSyncAt = new Date().toISOString()
      this.state.lastError = null
      await this.saveState()
    } catch (e: any) {
      this.state.lastError = e.message || '전체 동기화 오류'
    } finally {
      this.state.isSyncing = false
      this.notifyListeners()
    }
  }

  // ── 데이터 프리페치 ────────────────────

  private async prefetchSchedules(userId: string, companyId: string): Promise<void> {
    const today = new Date()
    const startOfWeek = new Date(today)
    const dayOfWeek = today.getDay()
    startOfWeek.setDate(today.getDate() - ((dayOfWeek + 6) % 7))
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)

    const startStr = startOfWeek.toISOString().split('T')[0]
    const endStr = endOfWeek.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .gte('scheduled_date', startStr)
      .lte('scheduled_date', endStr)
      .order('scheduled_time', { ascending: true })

    if (!error && data) {
      await AsyncStorage.setItem('@cache_schedules', JSON.stringify({
        data,
        fetchedAt: new Date().toISOString(),
      }))
    }
  }

  private async prefetchCars(companyId: string): Promise<void> {
    const { data, error } = await supabase
      .from('cars')
      .select('id, number, brand, model, trim, year, status, mileage, fuel')
      .eq('company_id', companyId)
      .order('number', { ascending: true })

    if (!error && data) {
      await AsyncStorage.setItem('@cache_cars', JSON.stringify({
        data,
        fetchedAt: new Date().toISOString(),
      }))
    }
  }

  // ── 캐시 읽기 ──────────────────────────

  async getCachedSchedules(): Promise<any[] | null> {
    try {
      const raw = await AsyncStorage.getItem('@cache_schedules')
      if (!raw) return null
      const { data, fetchedAt } = JSON.parse(raw)
      // 1시간 이내 캐시만 사용
      const age = Date.now() - new Date(fetchedAt).getTime()
      if (age > 60 * 60 * 1000) return null
      return data
    } catch {
      return null
    }
  }

  async getCachedCars(): Promise<any[] | null> {
    try {
      const raw = await AsyncStorage.getItem('@cache_cars')
      if (!raw) return null
      const { data, fetchedAt } = JSON.parse(raw)
      const age = Date.now() - new Date(fetchedAt).getTime()
      if (age > 60 * 60 * 1000) return null
      return data
    } catch {
      return null
    }
  }

  // ── 상태 관리 ──────────────────────────

  getState(): SyncState {
    return { ...this.state }
  }

  private async saveState(): Promise<void> {
    try {
      await AsyncStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
        lastSyncAt: this.state.lastSyncAt,
      }))
    } catch {}
  }

  async clearCache(): Promise<void> {
    await AsyncStorage.multiRemove([
      '@cache_schedules',
      '@cache_cars',
      SYNC_STATE_KEY,
      LAST_SYNC_KEY,
    ])
  }
}

// ── 싱글톤 인스턴스 ──────────────────────

export const SyncService = new SyncServiceClass()
export default SyncService
