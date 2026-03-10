import { useState, useCallback, useRef, useEffect } from 'react'
import { Platform, Alert } from 'react-native'
import Geolocation from '@react-native-community/geolocation'
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'

// ============================================
// useLocation 훅
// 위치 조회, 추적, 정확도 경고, 주소 변환
// 사고 접수 시 좌표 자동 기록 지원
// ============================================

export interface LocationCoordinates {
  latitude: number
  longitude: number
  accuracy: number
  altitude?: number
  speed?: number
  timestamp?: number
}

export interface LocationWithAddress extends LocationCoordinates {
  address?: string           // 역지오코딩 결과
}

export interface LocationState {
  location: LocationCoordinates | null
  address: string | null
  tracking: boolean
  accuracyWarning: string | null

  // 기본 기능
  getCurrentLocation: () => Promise<LocationWithAddress | null>
  startTracking: (intervalMs?: number) => Promise<void>
  stopTracking: () => void
  saveLocation: (coords: LocationCoordinates) => Promise<boolean>

  // 확장 기능
  reverseGeocode: (lat: number, lng: number) => Promise<string | null>
  getDistanceTo: (targetLat: number, targetLng: number) => number | null
  isWithinRadius: (targetLat: number, targetLng: number, radiusMeters: number) => boolean | null
}

// 정확도 기준 (미터)
const ACCURACY_GOOD = 20
const ACCURACY_ACCEPTABLE = 50
const ACCURACY_POOR = 100

function getAccuracyWarning(accuracy: number): string | null {
  if (accuracy <= ACCURACY_GOOD) return null
  if (accuracy <= ACCURACY_ACCEPTABLE) return '위치 정확도가 보통입니다 (±' + Math.round(accuracy) + 'm)'
  if (accuracy <= ACCURACY_POOR) return '위치 정확도가 낮습니다 (±' + Math.round(accuracy) + 'm). 개방된 장소로 이동해주세요.'
  return '위치 정확도가 매우 낮습니다 (±' + Math.round(accuracy) + 'm). GPS 신호를 확인해주세요.'
}

// 두 좌표 간 거리 계산 (Haversine, 미터)
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // 지구 반지름 (미터)
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export const useLocation = (): LocationState => {
  const { user, profile } = useApp()
  const [location, setLocation] = useState<LocationCoordinates | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [tracking, setTracking] = useState(false)
  const [accuracyWarning, setAccuracyWarning] = useState<string | null>(null)
  const watchIdRef = useRef<number | null>(null)

  // ── 권한 요청 ──────────────────────────

  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      const permission = Platform.OS === 'ios'
        ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
        : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION

      const checkResult = await check(permission)

      if (checkResult === RESULTS.GRANTED) return true

      if (checkResult === RESULTS.DENIED) {
        const requestResult = await request(permission)
        if (requestResult === RESULTS.GRANTED) return true
      }

      if (checkResult === RESULTS.BLOCKED || checkResult === RESULTS.UNAVAILABLE) {
        Alert.alert(
          '위치 권한 필요',
          '이 기능을 사용하려면 설정에서 위치 권한을 허용해주세요.',
          [{ text: '확인' }]
        )
        return false
      }

      return false
    } catch (error) {
      console.error('위치 권한 요청 오류:', error)
      return false
    }
  }

  // ── 역지오코딩 (좌표 → 주소) ─────────────

  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string | null> => {
    try {
      // Kakao 역지오코딩 API (한국 주소에 최적화)
      // 카카오 키가 없으면 Google 사용
      const response = await fetch(
        `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}&input_coord=WGS84`,
        {
          headers: {
            Authorization: 'KakaoAK 1234567890', // TODO: 실제 Kakao REST API 키로 교체
          },
        }
      )

      if (!response.ok) {
        // Kakao 실패 시 Nominatim(OSM) 폴백
        const osmRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ko`
        )
        if (osmRes.ok) {
          const osmData = await osmRes.json()
          return osmData.display_name || null
        }
        return null
      }

      const data = await response.json()
      if (data.documents && data.documents.length > 0) {
        const doc = data.documents[0]
        if (doc.road_address) {
          return doc.road_address.address_name
        }
        if (doc.address) {
          return doc.address.address_name
        }
      }

      return null
    } catch (error) {
      console.error('역지오코딩 오류:', error)
      return null
    }
  }, [])

  // ── 현재 위치 조회 ─────────────────────

  const getCurrentLocation = useCallback(async (): Promise<LocationWithAddress | null> => {
    try {
      const hasPermission = await requestLocationPermission()
      if (!hasPermission) return null

      return new Promise((resolve) => {
        Geolocation.getCurrentPosition(
          async (position) => {
            const coords: LocationCoordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude ?? undefined,
              speed: position.coords.speed ?? undefined,
              timestamp: position.timestamp,
            }

            setLocation(coords)

            // 정확도 경고 업데이트
            const warning = getAccuracyWarning(coords.accuracy)
            setAccuracyWarning(warning)

            // 주소 변환
            const addr = await reverseGeocode(coords.latitude, coords.longitude)
            setAddress(addr)

            resolve({ ...coords, address: addr || undefined })
          },
          (error) => {
            console.error('현재 위치 조회 실패:', error)
            Alert.alert('오류', '현재 위치를 가져올 수 없습니다.')
            resolve(null)
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 10000,
          }
        )
      })
    } catch (error) {
      console.error('getCurrentLocation 오류:', error)
      return null
    }
  }, [reverseGeocode])

  // ── 위치 DB 저장 ───────────────────────

  const saveLocation = useCallback(
    async (coords: LocationCoordinates): Promise<boolean> => {
      if (!user?.id || !profile?.company_id) return false

      try {
        const { error } = await supabase.from('location_history').insert([
          {
            user_id: user.id,
            company_id: profile.company_id,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            created_at: new Date().toISOString(),
          },
        ])

        if (error) {
          console.error('위치 저장 오류:', error.message)
          return false
        }
        return true
      } catch (error) {
        console.error('위치 저장 예외:', error)
        return false
      }
    },
    [user, profile]
  )

  // ── 위치 추적 ──────────────────────────

  const startTracking = useCallback(
    async (intervalMs: number = 30000): Promise<void> => {
      try {
        const hasPermission = await requestLocationPermission()
        if (!hasPermission) return

        if (watchIdRef.current !== null) {
          console.warn('이미 위치 추적 중입니다.')
          return
        }

        setTracking(true)

        watchIdRef.current = Geolocation.watchPosition(
          async (position) => {
            const coords: LocationCoordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude ?? undefined,
              speed: position.coords.speed ?? undefined,
              timestamp: position.timestamp,
            }

            setLocation(coords)
            setAccuracyWarning(getAccuracyWarning(coords.accuracy))
            await saveLocation(coords)
          },
          (error) => {
            console.error('위치 추적 오류:', error)
            setTracking(false)
          },
          {
            enableHighAccuracy: true,
            distanceFilter: 10,
            interval: intervalMs,
            maximumAge: 0,
          }
        )
      } catch (error) {
        console.error('startTracking 오류:', error)
        setTracking(false)
      }
    },
    [saveLocation]
  )

  const stopTracking = useCallback((): void => {
    if (watchIdRef.current !== null) {
      Geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setTracking(false)
  }, [])

  // ── 거리/반경 계산 ─────────────────────

  const getDistanceTo = useCallback(
    (targetLat: number, targetLng: number): number | null => {
      if (!location) return null
      return haversineDistance(location.latitude, location.longitude, targetLat, targetLng)
    },
    [location]
  )

  const isWithinRadius = useCallback(
    (targetLat: number, targetLng: number, radiusMeters: number): boolean | null => {
      const distance = getDistanceTo(targetLat, targetLng)
      if (distance === null) return null
      return distance <= radiusMeters
    },
    [getDistanceTo]
  )

  // ── 클린업 ─────────────────────────────

  useEffect(() => {
    return () => { stopTracking() }
  }, [stopTracking])

  return {
    location,
    address,
    tracking,
    accuracyWarning,
    getCurrentLocation,
    startTracking,
    stopTracking,
    saveLocation,
    reverseGeocode,
    getDistanceTo,
    isWithinRadius,
  }
}
