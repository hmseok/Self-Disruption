'use client'

// ═══════════════════════════════════════════════════════════════
// NeuDataTable — 뉴모피즘 데이터 테이블
// 데스크탑 테이블 + 모바일 카드 리스트 자동 전환
// 모든 리스트 페이지 데이터 영역 통일 컴포넌트
// ═══════════════════════════════════════════════════════════════

export interface TableColumn<T> {
  key: string
  label: string
  /** 컬럼 너비 (px 또는 %) */
  width?: string | number
  /** 텍스트 정렬 */
  align?: 'left' | 'center' | 'right'
  /** 셀 렌더링 — 커스텀 렌더 지원 */
  render: (row: T, index: number) => React.ReactNode
  /** 모바일에서 숨기기 */
  hideOnMobile?: boolean
  /** 모바일 카드에서 표시 순서 (0이면 미표시) */
  mobileOrder?: number
}

export interface MobileCardConfig<T> {
  /** 카드 제목 (보통 이름, 번호 등) */
  title: (row: T) => React.ReactNode
  /** 카드 부제목 */
  subtitle?: (row: T) => React.ReactNode
  /** 카드 우측 값 (금액, 상태 등) */
  trailing?: (row: T) => React.ReactNode
  /** 카드 하단 뱃지/태그 행 */
  badges?: (row: T) => React.ReactNode
}

interface NeuDataTableProps<T> {
  columns: TableColumn<T>[]
  data: T[]
  /** 행 고유 키 */
  rowKey: (row: T) => string | number
  /** 행 클릭 */
  onRowClick?: (row: T) => void
  /** 빈 데이터 메시지 */
  emptyIcon?: string
  emptyMessage?: string
  /** 모바일 카드 렌더링 설정 */
  mobileCard?: MobileCardConfig<T>
  /** 로딩 상태 */
  loading?: boolean
  /** 최대 높이 (스크롤) */
  maxHeight?: number | string
}

export default function NeuDataTable<T>({
  columns, data, rowKey, onRowClick,
  emptyIcon = '📋', emptyMessage = '데이터가 없습니다',
  mobileCard, loading, maxHeight,
}: NeuDataTableProps<T>) {

  if (loading) {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.72)',
        borderRadius: 16,
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '6px 6px 18px rgba(140,170,210,0.14), -6px -6px 18px rgba(255,255,255,0.47)',
        padding: 40,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: '#8aabc7', fontWeight: 500 }}>
          불러오는 중...
        </div>
      </div>
    )
  }

  if (!data.length) {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.72)',
        borderRadius: 16,
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '6px 6px 18px rgba(140,170,210,0.14), -6px -6px 18px rgba(255,255,255,0.47)',
        padding: '40px 20px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>{emptyIcon}</div>
        <div style={{ fontSize: 13, color: '#8aabc7', fontWeight: 500 }}>{emptyMessage}</div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.72)',
      borderRadius: 16,
      border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '6px 6px 18px rgba(140,170,210,0.14), -6px -6px 18px rgba(255,255,255,0.47)',
      overflow: 'hidden',
    }}>
      {/* ── 데스크탑 테이블 ── */}
      <div
        className="hidden md:block"
        style={{ overflowX: 'auto', maxHeight: maxHeight || 'none' }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{
              borderBottom: '1px solid rgba(0,0,0,0.06)',
            }}>
              {columns.filter(c => !c.hideOnMobile || true).map(col => (
                <th
                  key={col.key}
                  style={{
                    padding: '12px 14px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#64748b',
                    textAlign: col.align || 'left',
                    whiteSpace: 'nowrap',
                    background: 'rgba(255,255,255,0.40)',
                    letterSpacing: '0.02em',
                    width: col.width,
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                style={{
                  borderBottom: i < data.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => {
                  if (onRowClick) e.currentTarget.style.background = 'rgba(59,110,181,0.03)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    style={{
                      padding: '12px 14px',
                      fontSize: 13,
                      color: '#1e293b',
                      textAlign: col.align || 'left',
                      verticalAlign: 'middle',
                    }}
                  >
                    {col.render(row, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 모바일 카드 리스트 ── */}
      <div className="md:hidden">
        {data.map((row, i) => (
          <div
            key={rowKey(row)}
            onClick={() => onRowClick?.(row)}
            style={{
              padding: '14px 16px',
              borderBottom: i < data.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
              cursor: onRowClick ? 'pointer' : 'default',
            }}
          >
            {mobileCard ? (
              // 커스텀 모바일 카드 레이아웃
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2440' }}>
                      {mobileCard.title(row)}
                    </div>
                    {mobileCard.subtitle && (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        {mobileCard.subtitle(row)}
                      </div>
                    )}
                  </div>
                  {mobileCard.trailing && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {mobileCard.trailing(row)}
                    </div>
                  )}
                </div>
                {mobileCard.badges && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {mobileCard.badges(row)}
                  </div>
                )}
              </div>
            ) : (
              // 기본 모바일 레이아웃 (컬럼 기반)
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {columns.filter(c => c.mobileOrder !== 0).map(col => (
                  <div key={col.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#64748b', fontWeight: 500 }}>{col.label}</span>
                    <span style={{ color: '#1e293b' }}>{col.render(row, i)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
