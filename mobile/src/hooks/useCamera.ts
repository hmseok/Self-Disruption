import { useState, useCallback, useRef } from 'react'
import { Platform, Alert } from 'react-native'
import { launchCamera, launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker'
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions'
import { useApp } from '../context/AppContext'
import { uploadFile, uploadFiles } from '../lib/api'
import type { PhotoMetadata, PhotoType } from '../lib/types'

// ============================================
// useCamera 훅
// 단일/다중 사진 촬영, 갤러리 선택, 배치 업로드
// 차량 검수용 360도 촬영 지원
// ============================================

export interface ImageData {
  uri: string | null
  width?: number
  height?: number
  fileName?: string
  size?: number
  type?: string
}

export interface CameraState {
  // 단일 촬영/선택
  takePhoto: () => Promise<ImageData | null>
  pickImage: () => Promise<ImageData | null>
  pickMultipleImages: (maxCount?: number) => Promise<ImageData[]>

  // 다중 사진 관리
  capturedPhotos: PhotoMetadata[]
  addPhoto: (photo: PhotoMetadata) => void
  removePhoto: (index: number) => void
  clearPhotos: () => void

  // 업로드
  uploadSingle: (uri: string, bucket: string, path: string) => Promise<string | null>
  uploadAllPhotos: (bucket: string, basePath: string) => Promise<PhotoMetadata[]>

  // 상태
  uploading: boolean
  uploadProgress: { completed: number; total: number }
}

// 차량 검수용 360도 촬영 라벨
export const INSPECTION_LABELS = [
  { key: 'front', label: '전면' },
  { key: 'rear', label: '후면' },
  { key: 'left', label: '좌측' },
  { key: 'right', label: '우측' },
  { key: 'interior', label: '실내' },
  { key: 'odometer', label: '주행거리' },
] as const

export const useCamera = (): CameraState => {
  const { user, profile } = useApp()
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 })
  const [capturedPhotos, setCapturedPhotos] = useState<PhotoMetadata[]>([])

  // ── 권한 요청 ──────────────────────────

  const requestCameraPermission = async (): Promise<boolean> => {
    try {
      const permission = Platform.OS === 'ios'
        ? PERMISSIONS.IOS.CAMERA
        : PERMISSIONS.ANDROID.CAMERA

      const checkResult = await check(permission)

      if (checkResult === RESULTS.GRANTED) return true

      if (checkResult === RESULTS.DENIED) {
        const requestResult = await request(permission)
        if (requestResult === RESULTS.GRANTED) return true
      }

      if (checkResult === RESULTS.BLOCKED || checkResult === RESULTS.UNAVAILABLE) {
        Alert.alert('카메라 권한 필요', '설정에서 카메라 권한을 허용해주세요.')
        return false
      }

      return false
    } catch (error) {
      console.error('카메라 권한 요청 오류:', error)
      return false
    }
  }

  const requestPhotoLibraryPermission = async (): Promise<boolean> => {
    try {
      const permission = Platform.OS === 'ios'
        ? PERMISSIONS.IOS.PHOTO_LIBRARY
        : PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE

      const checkResult = await check(permission)

      if (checkResult === RESULTS.GRANTED) return true

      if (checkResult === RESULTS.DENIED) {
        const requestResult = await request(permission)
        if (requestResult === RESULTS.GRANTED) return true
      }

      if (checkResult === RESULTS.BLOCKED || checkResult === RESULTS.UNAVAILABLE) {
        Alert.alert('사진 라이브러리 권한 필요', '설정에서 사진 라이브러리 권한을 허용해주세요.')
        return false
      }

      return false
    } catch (error) {
      console.error('사진 라이브러리 권한 요청 오류:', error)
      return false
    }
  }

  // ── 이미지 추출 헬퍼 ───────────────────

  const extractImageData = (response: ImagePickerResponse): ImageData | null => {
    if (response.didCancel) return null

    if (response.errorCode) {
      console.error('이미지 선택 오류:', response.errorMessage)
      Alert.alert('오류', '이미지를 선택할 수 없습니다.')
      return null
    }

    if (!response.assets || response.assets.length === 0) return null

    const asset = response.assets[0]
    return {
      uri: asset.uri || null,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName,
      size: asset.fileSize,
      type: asset.type,
    }
  }

  const extractMultipleImageData = (response: ImagePickerResponse): ImageData[] => {
    if (response.didCancel || response.errorCode || !response.assets) return []

    return response.assets.map((asset) => ({
      uri: asset.uri || null,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName,
      size: asset.fileSize,
      type: asset.type,
    }))
  }

  // ── 단일 촬영/선택 ─────────────────────

  const takePhoto = useCallback(async (): Promise<ImageData | null> => {
    try {
      const hasPermission = await requestCameraPermission()
      if (!hasPermission) return null

      return new Promise((resolve) => {
        launchCamera(
          {
            mediaType: 'photo',
            quality: 0.8,
            maxWidth: 1920,
            maxHeight: 1920,
            cameraType: 'back',
            saveToPhotos: true,
            includeExtra: true,
          },
          (response) => resolve(extractImageData(response))
        )
      })
    } catch (error) {
      console.error('카메라 실행 오류:', error)
      Alert.alert('오류', '카메라를 실행할 수 없습니다.')
      return null
    }
  }, [])

  const pickImage = useCallback(async (): Promise<ImageData | null> => {
    try {
      const hasPermission = await requestPhotoLibraryPermission()
      if (!hasPermission) return null

      return new Promise((resolve) => {
        launchImageLibrary(
          {
            mediaType: 'photo',
            quality: 0.8,
            maxWidth: 1920,
            maxHeight: 1920,
            selectionLimit: 1,
          },
          (response) => resolve(extractImageData(response))
        )
      })
    } catch (error) {
      console.error('이미지 라이브러리 실행 오류:', error)
      Alert.alert('오류', '이미지 라이브러리를 열 수 없습니다.')
      return null
    }
  }, [])

  const pickMultipleImages = useCallback(async (maxCount: number = 10): Promise<ImageData[]> => {
    try {
      const hasPermission = await requestPhotoLibraryPermission()
      if (!hasPermission) return []

      return new Promise((resolve) => {
        launchImageLibrary(
          {
            mediaType: 'photo',
            quality: 0.8,
            maxWidth: 1920,
            maxHeight: 1920,
            selectionLimit: maxCount,
          },
          (response) => resolve(extractMultipleImageData(response))
        )
      })
    } catch (error) {
      console.error('다중 이미지 선택 오류:', error)
      return []
    }
  }, [])

  // ── 다중 사진 관리 ─────────────────────

  const addPhoto = useCallback((photo: PhotoMetadata) => {
    setCapturedPhotos((prev) => [...prev, photo])
  }, [])

  const removePhoto = useCallback((index: number) => {
    setCapturedPhotos((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clearPhotos = useCallback(() => {
    setCapturedPhotos([])
  }, [])

  // ── 업로드 ─────────────────────────────

  const uploadSingle = useCallback(
    async (uri: string, bucket: string, path: string): Promise<string | null> => {
      if (!user?.id || !profile?.company_id) {
        Alert.alert('오류', '사용자 정보가 없어 업로드할 수 없습니다.')
        return null
      }

      setUploading(true)
      try {
        const fullPath = `${profile.company_id}/${user.id}/${path}`
        const result = await uploadFile(uri, bucket, fullPath)

        if (result.error) {
          Alert.alert('오류', result.error)
          return null
        }

        return result.data?.publicUrl || null
      } finally {
        setUploading(false)
      }
    },
    [user, profile]
  )

  // 저장된 모든 사진을 배치 업로드
  const uploadAllPhotos = useCallback(
    async (bucket: string, basePath: string): Promise<PhotoMetadata[]> => {
      if (!user?.id || !profile?.company_id) {
        Alert.alert('오류', '사용자 정보가 없어 업로드할 수 없습니다.')
        return capturedPhotos
      }

      const photosToUpload = capturedPhotos.filter((p) => !p.uploaded && p.uri)
      if (photosToUpload.length === 0) return capturedPhotos

      setUploading(true)
      setUploadProgress({ completed: 0, total: photosToUpload.length })

      try {
        const files = photosToUpload.map((photo, index) => {
          const ext = photo.uri.split('.').pop() || 'jpg'
          const fileName = `${photo.label || index}_${Date.now()}.${ext}`
          const storagePath = `${profile.company_id}/${basePath}/${fileName}`
          return { uri: photo.uri, storagePath }
        })

        const results = await uploadFiles(files, bucket, (completed, total) => {
          setUploadProgress({ completed, total })
        })

        // 업로드 결과를 사진 메타데이터에 반영
        const updatedPhotos = capturedPhotos.map((photo) => {
          if (photo.uploaded) return photo

          const uploadIndex = photosToUpload.indexOf(photo)
          if (uploadIndex === -1) return photo

          const result = results[uploadIndex]
          if (result && result.publicUrl) {
            return { ...photo, publicUrl: result.publicUrl, uploaded: true }
          }
          return photo
        })

        setCapturedPhotos(updatedPhotos)
        return updatedPhotos
      } catch (error) {
        console.error('배치 업로드 오류:', error)
        Alert.alert('오류', '사진 업로드 중 일부가 실패했습니다.')
        return capturedPhotos
      } finally {
        setUploading(false)
        setUploadProgress({ completed: 0, total: 0 })
      }
    },
    [user, profile, capturedPhotos]
  )

  return {
    takePhoto,
    pickImage,
    pickMultipleImages,
    capturedPhotos,
    addPhoto,
    removePhoto,
    clearPhotos,
    uploadSingle,
    uploadAllPhotos,
    uploading,
    uploadProgress,
  }
}
