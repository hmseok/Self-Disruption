'use client'

// ───────────────────────────────────────────────────────────────
// Kakao Maps SDK 로더 (자체 주입 방식)
// 페이지에서 ensureKakao() 호출 시 SDK <script> 가 없으면 동적 주입.
// 이미 layout.tsx 등에서 주입돼 있으면 그것을 그대로 사용.
// ───────────────────────────────────────────────────────────────

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kakao: any
  }
}

const SDK_ID = 'kakao-maps-sdk'

let _ready: Promise<typeof window.kakao> | null = null

function injectScript(key: string): void {
  if (document.getElementById(SDK_ID)) return
  const script = document.createElement('script')
  script.id = SDK_ID
  script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&libraries=services,clusterer&autoload=false`
  script.async = true
  document.head.appendChild(script)
}

export function ensureKakao(): Promise<typeof window.kakao> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('SSR에서는 카카오맵을 초기화할 수 없습니다'))
  }
  if (_ready) return _ready

  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
  if (!key) {
    _ready = Promise.reject(new Error('NEXT_PUBLIC_KAKAO_MAP_KEY가 설정되지 않았습니다 — .env.local을 확인하고 dev 서버를 재시작하세요'))
    return _ready
  }

  injectScript(key)

  _ready = new Promise((resolve, reject) => {
    const start = Date.now()
    const tryInit = () => {
      const k = window.kakao
      if (k && k.maps && typeof k.maps.load === 'function') {
        k.maps.load(() => resolve(k))
        return
      }
      if (Date.now() - start > 10_000) {
        reject(new Error(
          '카카오맵 SDK 로드 실패 (10초 타임아웃)\n' +
          '체크리스트:\n' +
          '1) 카카오 콘솔 → JavaScript SDK 도메인에 http://localhost:3000 등록 후 저장했는지\n' +
          '2) .env.local 의 NEXT_PUBLIC_KAKAO_MAP_KEY 값이 정확한 JavaScript 키인지 (REST 키 아님)\n' +
          '3) 브라우저 Network 탭에서 dapi.kakao.com/v2/maps/sdk.js 응답 상태가 200 인지\n' +
          '4) 광고 차단/네트워크 보안 솔루션이 dapi.kakao.com 을 차단하지 않는지'
        ))
        return
      }
      setTimeout(tryInit, 100)
    }
    tryInit()
  })

  return _ready
}

// 주소 → 좌표 변환 (services 라이브러리)
// hotfix 2026-05-09: addressSearch 실패 시 keywordSearch 로 fallback
//   - addressSearch: 표준 주소만 매칭 (구주소/POI/아파트 동호수 fail)
//   - keywordSearch: POI/장소명/키워드 매칭 (더 관대 — 「강남역」「△△아파트」 등 hit)
export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const k = await ensureKakao()
  // 1차: 표준 addressSearch
  const addrResult = await new Promise<{ lat: number; lng: number } | null>(resolve => {
    const geocoder = new k.maps.services.Geocoder()
    geocoder.addressSearch(address, (result: { x: string; y: string }[], status: string) => {
      if (status === k.maps.services.Status.OK && result[0]) {
        resolve({ lat: Number(result[0].y), lng: Number(result[0].x) })
      } else {
        resolve(null)
      }
    })
  })
  if (addrResult) return addrResult

  // 2차: keywordSearch fallback (POI / 장소명 / 키워드)
  return new Promise<{ lat: number; lng: number } | null>(resolve => {
    const places = new k.maps.services.Places()
    places.keywordSearch(address, (result: { x: string; y: string }[], status: string) => {
      if (status === k.maps.services.Status.OK && result[0]) {
        resolve({ lat: Number(result[0].y), lng: Number(result[0].x) })
      } else {
        resolve(null)
      }
    })
  })
}
