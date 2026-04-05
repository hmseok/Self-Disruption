'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'

// 동적 임포트 (코드 분할)
const QuoteCreator = dynamic(() => import('./QuoteCreator'), { ssr: false })
const QuoteCalculator = dynamic(() => import('../new/QuoteCalculator'), { ssr: false })

type Mode = 'creator' | 'calculator'

export default function QuoteCreatePage() {
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<Mode>('calculator')

  // URL 파라미터로 모드 판별
  useEffect(() => {
    // sessionStorage에 빌더 데이터가 있으면 → 견적서 작성 모드
    const hasBuilderData = !!sessionStorage.getItem('quoteBuilderData')
    const fromBuilder = searchParams.get('from') === 'builder'
    const quoteId = searchParams.get('quote_id')

    if (hasBuilderData || fromBuilder || quoteId) {
      setMode('creator')
    } else {
      setMode('calculator')
    }
  }, [searchParams])

  return (
    <div>
      {/* 모드 전환 탭 */}
      <div className="mb-4 flex gap-1 p-1 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.35)', border: '1px solid rgba(0,0,0,0.05)' }}
      >
        <button
          onClick={() => setMode('calculator')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${
            mode === 'calculator'
              ? 'bg-white/80 text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          상세 산출
          <span className="block text-[10px] font-normal text-gray-400 mt-0.5">비용 항목별 계산</span>
        </button>
        <button
          onClick={() => {
            const hasData = !!sessionStorage.getItem('quoteBuilderData')
            if (!hasData) {
              alert('렌트가 산출 빌더에서 분석을 먼저 진행해주세요.\n상세 산출 또는 렌트가 산출 빌더에서 견적 데이터를 생성한 후 이용 가능합니다.')
              return
            }
            setMode('creator')
          }}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${
            mode === 'creator'
              ? 'bg-white/80 text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          견적서 작성
          <span className="block text-[10px] font-normal text-gray-400 mt-0.5">고객 매칭 + 프리뷰</span>
        </button>
      </div>

      {/* 컴포넌트 렌더링 */}
      {mode === 'calculator' ? <QuoteCalculator /> : <QuoteCreator />}
    </div>
  )
}
