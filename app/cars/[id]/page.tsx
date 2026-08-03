'use client'

// 차량 상세 — 2026-08-03 4탭 재정리 (CarDetailV2). 구 CarDetail 은 9단계에서 삭제 예정.
import { useParams } from 'next/navigation'
import CarDetailV2 from './CarDetailV2'

export default function Page() {
  const { id } = useParams()
  return <CarDetailV2 carId={String(id)} />
}
