import { useState } from "react"

const sampleCards = [
  { id: '1', card_company: 'KB국민카드', card_number: '5585-2699-6792-2868', holder_name: '석호민', card_alias: '주식회사 에프엠아이', monthly_limit: 9900000, usage: 0, car: null },
  { id: '2', card_company: 'KB국민카드', card_number: '9410-4999-2915-0851', holder_name: '공용', card_alias: '주식회사 에프엠아이', monthly_limit: 10000000, usage: 0, car: null },
  { id: '3', card_company: 'KB국민카드', card_number: '4265-8694-7021-8819', holder_name: '공용', card_alias: '주식회사 에프엠아이', monthly_limit: 3000000, usage: 150000, car: null },
  { id: '4', card_company: 'KB국민카드', card_number: '9410-4997-8599-5829', holder_name: '공용', card_alias: '탁송팀', monthly_limit: 300000, usage: 45000, car: '101허4230' },
  { id: '5', card_company: 'KB국민카드', card_number: '9410-4993-8512-8847', holder_name: '공용', card_alias: '탁송팀', monthly_limit: 300000, usage: 0, car: null },
  { id: '6', card_company: 'KB국민카드', card_number: '9410-4993-1744-8842', holder_name: '공용', card_alias: '탁송팀', monthly_limit: 300000, usage: 78000, car: '125허2050' },
  { id: '7', card_company: 'KB국민카드', card_number: '9410-4993-2132-4831', holder_name: '공용', card_alias: '탁송팀', monthly_limit: 280000, usage: 0, car: null },
  { id: '8', card_company: 'KB국민카드', card_number: '9410-4994-9807-8897', holder_name: '공용', card_alias: '탁송팀', monthly_limit: 300000, usage: 22000, car: '47하9602' },
  { id: '9', card_company: '우리카드', card_number: '9500-****-****-2756', holder_name: '공용', card_alias: 'CORPORATE 하이패스', monthly_limit: 13000000, usage: 350000, car: null },
  { id: '10', card_company: '우리카드', card_number: '9500-****-****-4331', holder_name: '김준수', card_alias: 'CORPORATE Classic', monthly_limit: 13000000, usage: 1200000, car: null },
]

const mask = (n) => n ? `····${n.replace(/[^0-9*]/g, '').slice(-4)}` : '····'
const fmt = (n) => n ? Number(n).toLocaleString() : '0'
const fmtShort = (n) => {
  if (!n) return '0'
  if (n >= 10000000) return `${(n/10000000).toFixed(0)}천만`
  if (n >= 10000) return `${(n/10000).toFixed(0)}만`
  return fmt(n)
}

const getCardColor = (company) => {
  if (company?.includes('KB') || company?.includes('국민')) return { bg: '#d97706', light: '#fef3c7', text: '#92400e', border: '#fde68a' }
  if (company?.includes('우리')) return { bg: '#0284c7', light: '#e0f2fe', text: '#075985', border: '#bae6fd' }
  if (company?.includes('신한')) return { bg: '#2563eb', light: '#dbeafe', text: '#1e40af', border: '#bfdbfe' }
  if (company?.includes('삼성')) return { bg: '#334155', light: '#f1f5f9', text: '#1e293b', border: '#e2e8f0' }
  return { bg: '#475569', light: '#f8fafc', text: '#334155', border: '#e2e8f0' }
}

const grouped = {}
sampleCards.forEach(c => {
  const g = c.card_alias || '기타'
  if (!grouped[g]) grouped[g] = []
  grouped[g].push(c)
})

// ─── Design 1: 미니 스트립 + 아코디언 ───
function StripAccordion() {
  const [open, setOpen] = useState(null)
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 900, marginBottom: 12, color: '#1e293b' }}>1️⃣ 미니 스트립 + 아코디언</h2>
      {Object.entries(grouped).map(([group, cards]) => {
        const totalUsage = cards.reduce((s, c) => s + c.usage, 0)
        return (
          <div key={group} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, padding: '0 4px' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#1e293b' }}>{group} <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>({cards.length}장)</span></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{fmt(totalUsage)}원 사용</span>
            </div>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              {cards.map((c, i) => {
                const color = getCardColor(c.card_company)
                const isOpen = open === c.id
                const rate = c.monthly_limit ? Math.round((c.usage / c.monthly_limit) * 100) : 0
                return (
                  <div key={c.id}>
                    {/* 스트립 행 */}
                    <div
                      onClick={() => setOpen(isOpen ? null : c.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                        background: isOpen ? '#f8fafc' : 'white',
                        borderTop: i > 0 ? '1px solid #f1f5f9' : 'none',
                        cursor: 'pointer', transition: 'background 0.15s',
                      }}>
                      <div style={{ width: 4, height: 28, borderRadius: 2, background: color.bg, flexShrink: 0 }} />
                      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: '#1e293b', width: 60 }}>{mask(c.card_number)}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', width: 50 }}>{c.holder_name}</span>
                      {c.car && <span style={{ fontSize: 10, background: color.light, color: color.text, padding: '2px 6px', borderRadius: 6, fontWeight: 700, border: `1px solid ${color.border}` }}>🚙{c.car}</span>}
                      <div style={{ flex: 1 }} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', textAlign: 'right', minWidth: 80 }}>{fmt(c.monthly_limit)}원</span>
                      <span style={{ fontSize: 12, color: '#94a3b8', transform: isOpen ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}>▼</span>
                    </div>
                    {/* 펼침 영역 */}
                    {isOpen && (
                      <div style={{ padding: '12px 14px 14px 28px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, marginBottom: 10 }}>
                          <div><span style={{ color: '#94a3b8' }}>카드사</span> <span style={{ fontWeight: 700, color: '#1e293b', marginLeft: 4 }}>{c.card_company}</span></div>
                          <div><span style={{ color: '#94a3b8' }}>카드번호</span> <span style={{ fontWeight: 700, color: '#1e293b', fontFamily: 'monospace', marginLeft: 4 }}>{c.card_number}</span></div>
                          <div><span style={{ color: '#94a3b8' }}>이번달 사용</span> <span style={{ fontWeight: 800, color: '#0f172a', marginLeft: 4 }}>{fmt(c.usage)}원</span></div>
                          {c.car && <div><span style={{ color: '#94a3b8' }}>배치차량</span> <span style={{ fontWeight: 700, color: color.text, marginLeft: 4 }}>🚙 {c.car}</span></div>}
                        </div>
                        {c.monthly_limit > 0 && (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                              <span style={{ color: '#94a3b8' }}>한도 {fmt(c.monthly_limit)}원</span>
                              <span style={{ fontWeight: 800, color: rate >= 80 ? '#ef4444' : rate >= 50 ? '#f59e0b' : '#10b981' }}>{rate}%</span>
                            </div>
                            <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${rate}%`, borderRadius: 3, background: rate >= 80 ? '#ef4444' : rate >= 50 ? '#f59e0b' : '#10b981', transition: 'width 0.5s' }} />
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button style={{ flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>수정</button>
                          <button style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#ef4444', background: '#fef2f2', border: 'none', borderRadius: 8, cursor: 'pointer' }}>삭제</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Design 2: 컴팩트 테이블 ───
function CompactTable() {
  const [open, setOpen] = useState(null)
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 900, marginBottom: 12, color: '#1e293b' }}>2️⃣ 컴팩트 테이블</h2>
      {Object.entries(grouped).map(([group, cards]) => {
        const totalUsage = cards.reduce((s, c) => s + c.usage, 0)
        const totalLimit = cards.reduce((s, c) => s + (c.monthly_limit || 0), 0)
        return (
          <div key={group} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, padding: '8px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#1e293b' }}>{group} <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>{cards.length}장</span></span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{fmt(totalUsage)} / {fmtShort(totalLimit)}원</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: 'white', borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#94a3b8', fontSize: 10, width: 30 }}></th>
                  <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, color: '#94a3b8', fontSize: 10 }}>카드번호</th>
                  <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, color: '#94a3b8', fontSize: 10 }}>명의</th>
                  <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, color: '#94a3b8', fontSize: 10 }}>차량</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#94a3b8', fontSize: 10 }}>사용</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#94a3b8', fontSize: 10 }}>한도</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((c, i) => {
                  const color = getCardColor(c.card_company)
                  const rate = c.monthly_limit ? Math.round((c.usage / c.monthly_limit) * 100) : 0
                  const isOpen = open === c.id
                  return (
                    <>
                      <tr key={c.id} onClick={() => setOpen(isOpen ? null : c.id)}
                        style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', background: isOpen ? '#f8fafc' : 'white' }}>
                        <td style={{ padding: '8px 10px' }}><div style={{ width: 4, height: 20, borderRadius: 2, background: color.bg }} /></td>
                        <td style={{ padding: '8px 6px', fontFamily: 'monospace', fontWeight: 800, color: '#1e293b' }}>{mask(c.card_number)}</td>
                        <td style={{ padding: '8px 6px', fontWeight: 600, color: '#64748b' }}>{c.holder_name}</td>
                        <td style={{ padding: '8px 6px' }}>{c.car ? <span style={{ fontSize: 10, background: color.light, color: color.text, padding: '2px 5px', borderRadius: 5, fontWeight: 700 }}>🚙{c.car}</span> : <span style={{ color: '#cbd5e1', fontSize: 11 }}>-</span>}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, color: c.usage > 0 ? '#0f172a' : '#cbd5e1' }}>{fmt(c.usage)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#64748b' }}>{fmtShort(c.monthly_limit)}</td>
                      </tr>
                      {isOpen && (
                        <tr key={`${c.id}-detail`}>
                          <td colSpan={6} style={{ padding: '10px 14px', background: '#f8fafc' }}>
                            <div style={{ display: 'flex', gap: 16, fontSize: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ color: '#94a3b8' }}>카드사 <span style={{ fontWeight: 700, color: '#1e293b' }}>{c.card_company}</span></span>
                              <span style={{ color: '#94a3b8' }}>번호 <span style={{ fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>{c.card_number}</span></span>
                              {c.monthly_limit > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 120 }}>
                                  <div style={{ flex: 1, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${rate}%`, borderRadius: 3, background: rate >= 80 ? '#ef4444' : rate >= 50 ? '#f59e0b' : '#10b981' }} />
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 800, color: rate >= 80 ? '#ef4444' : '#64748b' }}>{rate}%</span>
                                </div>
                              )}
                              <button style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer' }}>수정</button>
                              <button style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#ef4444', background: '#fef2f2', border: 'none', borderRadius: 6, cursor: 'pointer' }}>삭제</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

// ─── Design 3: 미니카드 그리드 ───
function MiniCardGrid() {
  const [selected, setSelected] = useState(null)
  const sel = sampleCards.find(c => c.id === selected)
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 900, marginBottom: 12, color: '#1e293b' }}>3️⃣ 미니카드 + 클릭 확장</h2>
      {Object.entries(grouped).map(([group, cards]) => (
        <div key={group} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#1e293b', marginBottom: 6 }}>{group} <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>({cards.length}장)</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {cards.map(c => {
              const color = getCardColor(c.card_company)
              const isSel = selected === c.id
              return (
                <div key={c.id} onClick={() => setSelected(isSel ? null : c.id)}
                  style={{
                    borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                    border: isSel ? `2px solid ${color.bg}` : '1px solid #e2e8f0',
                    boxShadow: isSel ? `0 0 0 3px ${color.light}` : 'none',
                    background: 'white', transition: 'all 0.15s',
                  }}>
                  <div style={{ padding: '8px 10px', background: color.bg, color: 'white' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>{mask(c.card_number)}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.8, marginTop: 1 }}>{c.card_company?.replace('카드','')}</div>
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>{c.holder_name}</div>
                    {c.car && <div style={{ fontSize: 9, marginTop: 2, background: color.light, color: color.text, display: 'inline-block', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>🚙{c.car}</div>}
                    <div style={{ fontSize: 12, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{fmtShort(c.monthly_limit)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {/* 선택 모달 */}
      {sel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, width: 360, padding: 0, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ padding: '16px 20px', background: getCardColor(sel.card_company).bg, color: 'white' }}>
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>{sel.card_company}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 900, letterSpacing: 2, marginTop: 4 }}>{sel.card_number}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, opacity: 0.9 }}>{sel.holder_name}</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: '#94a3b8' }}>부서</span><span style={{ fontWeight: 700 }}>{sel.card_alias}</span>
              </div>
              {sel.car && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: '#94a3b8' }}>배치차량</span><span style={{ fontWeight: 700, color: getCardColor(sel.card_company).text }}>🚙 {sel.car}</span>
              </div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: '#94a3b8' }}>이번달 사용</span><span style={{ fontWeight: 900, fontSize: 15 }}>{fmt(sel.usage)}원</span>
              </div>
              {sel.monthly_limit > 0 && (() => {
                const rate = Math.round((sel.usage / sel.monthly_limit) * 100)
                return (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: '#94a3b8' }}>한도 {fmt(sel.monthly_limit)}원</span>
                      <span style={{ fontWeight: 800, color: rate >= 80 ? '#ef4444' : '#10b981' }}>{rate}%</span>
                    </div>
                    <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${rate}%`, borderRadius: 3, background: rate >= 80 ? '#ef4444' : '#10b981' }} />
                    </div>
                  </div>
                )
              })()}
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: 'none', borderRadius: 10, cursor: 'pointer' }}>수정</button>
                <button style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#ef4444', background: '#fef2f2', border: 'none', borderRadius: 10, cursor: 'pointer' }}>삭제</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ───
export default function CardUIPreview() {
  const [tab, setTab] = useState(1)
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4, color: '#0f172a' }}>💳 카드 UI 디자인 비교</h1>
      <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>탭을 눌러 3가지 디자인을 비교해보세요. 카드를 클릭하면 상세 펼침됩니다.</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#f1f5f9', padding: 4, borderRadius: 10 }}>
        {[1, 2, 3].map(n => (
          <button key={n} onClick={() => setTab(n)} style={{
            flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer',
            background: tab === n ? '#0f172a' : 'transparent',
            color: tab === n ? 'white' : '#64748b',
          }}>
            {n === 1 ? '1️⃣ 스트립+아코디언' : n === 2 ? '2️⃣ 컴팩트 테이블' : '3️⃣ 미니카드'}
          </button>
        ))}
      </div>
      {tab === 1 && <StripAccordion />}
      {tab === 2 && <CompactTable />}
      {tab === 3 && <MiniCardGrid />}
    </div>
  )
}