'use client'
import { useRef, useEffect, useState, useCallback } from 'react'

interface SignaturePadProps {
  onSignatureChange: (base64: string | null) => void
  width?: number
  height?: number
  disabled?: boolean
}

export default function SignaturePad({ onSignatureChange, width = 340, height = 160, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  // 캔버스 초기화
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // 고해상도 지원
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#1a1a1a'
    // 배경
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }, [width, height])

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }, [])

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setIsDrawing(true)
  }, [disabled, getPos])

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing || disabled) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }, [isDrawing, disabled, getPos])

  const endDraw = useCallback(() => {
    if (!isDrawing) return
    setIsDrawing(false)
    setHasSignature(true)
    // base64 내보내기
    const canvas = canvasRef.current
    if (canvas) {
      const data = canvas.toDataURL('image/png')
      onSignatureChange(data)
    }
  }, [isDrawing, onSignatureChange])

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#1a1a1a'
    setHasSignature(false)
    onSignatureChange(null)
  }, [onSignatureChange])

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className={`border-2 rounded-xl touch-none ${disabled ? 'opacity-50 cursor-not-allowed border-gray-200' : hasSignature ? 'border-steel-400' : 'border-gray-300'}`}
        style={{ width, height }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      {!hasSignature && !disabled && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-gray-300 text-sm font-bold">여기에 서명해주세요</p>
        </div>
      )}
      {hasSignature && !disabled && (
        <button
          onClick={clear}
          className="absolute top-2 right-2 px-2 py-1 bg-white/80 border border-gray-300 rounded-lg text-xs font-bold text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          지우기
        </button>
      )}
    </div>
  )
}
