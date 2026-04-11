'use client'

// ═══════════════════════════════════════════════════════════════
// NeuSearchBar — 뉴모피즘 검색바 + 결과 카운트 + 액션 버튼
// 모든 리스트 페이지 검색/액션 영역 통일 컴포넌트
// ═══════════════════════════════════════════════════════════════

export interface SearchBarAction {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
}

interface NeuSearchBarProps {
  /** 검색어 */
  value: string
  onChange: (value: string) => void
  /** 플레이스홀더 */
  placeholder?: string
  /** 결과 카운트 (예: "검색결과 18대") */
  resultText?: string
  /** 우측 액션 버튼들 */
  actions?: SearchBarAction[]
  /** 추가 필터 영역 (드롭다운 등) */
  extra?: React.ReactNode
}

export default function NeuSearchBar({
  value, onChange, placeholder = '검색...', resultText, actions, extra
}: NeuSearchBarProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
      flexWrap: 'wrap',
    }}>
      {/* 검색 인풋 */}
      <div style={{
        flex: '1 1 200px',
        minWidth: 180,
        position: 'relative',
      }}>
        {/* 돋보기 아이콘 */}
        <svg
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 14,
            height: 14,
            color: '#8aabc7',
          }}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '9px 12px 9px 34px',
            fontSize: 13,
            color: '#1e293b',
            background: 'rgba(255,255,255,0.40)',
            border: '1px solid rgba(0,0,0,0.05)',
            borderRadius: 10,
            outline: 'none',
            boxShadow: 'inset 2px 2px 4px rgba(140,170,210,0.12), inset -2px -2px 4px rgba(255,255,255,0.35)',
            transition: 'box-shadow 0.2s',
          }}
          onFocus={e => { e.currentTarget.style.boxShadow = 'inset 2px 2px 4px rgba(140,170,210,0.12), inset -2px -2px 4px rgba(255,255,255,0.35), 0 0 0 2px rgba(59,110,181,0.15)' }}
          onBlur={e => { e.currentTarget.style.boxShadow = 'inset 2px 2px 4px rgba(140,170,210,0.12), inset -2px -2px 4px rgba(255,255,255,0.35)' }}
        />
      </div>

      {/* 추가 필터 (드롭다운 등) */}
      {extra}

      {/* 결과 카운트 */}
      {resultText && (
        <span style={{ fontSize: 11, color: '#8aabc7', fontWeight: 500, whiteSpace: 'nowrap' }}>
          {resultText}
        </span>
      )}

      {/* 액션 버튼들 */}
      {actions?.map((action, i) => {
        const isPrimary = action.variant === 'primary' || (!action.variant && i === 0)
        const isGhost = action.variant === 'ghost'
        return (
          <button
            key={i}
            onClick={action.onClick}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
              ...(isPrimary ? {
                background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)',
                color: '#fff',
                boxShadow: '3px 3px 8px rgba(140,170,210,0.19), -1px -1px 4px rgba(255,255,255,0.47)',
              } : isGhost ? {
                background: 'transparent',
                color: '#3b6eb5',
              } : {
                background: 'rgba(255,255,255,0.60)',
                color: '#1e293b',
                border: '1px solid rgba(0,0,0,0.06)',
                boxShadow: '2px 2px 6px rgba(140,170,210,0.10), -2px -2px 6px rgba(255,255,255,0.40)',
              }),
            }}
          >
            {action.icon}
            {action.label}
          </button>
        )
      })}
    </div>
  )
}
