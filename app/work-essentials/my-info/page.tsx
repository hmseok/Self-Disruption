'use client'

import { useState, useEffect, useCallback } from 'react'
import { auth } from '@/lib/auth-client'
import { useApp } from '../../context/AppContext'

// ════════════════════════════════════════════
// 내 정보 페이지 — 프로필 + 법인카드 관리
// ════════════════════════════════════════════

interface CardItem {
  id: string
  card_name: string
  card_number: string
  card_last4: string
  card_company: string
  is_default: boolean
  created_at: string
}

const CARD_COMPANIES = [
  '삼성카드', '현대카드', '신한카드', 'KB국민카드', '롯데카드',
  'NH농협카드', 'BC카드', '하나카드', '우리카드', '기업은행', '기타',
]

export default function MyInfoPage() {
  const { user, company, role } = useApp()
  const effectiveCompanyId = company?.id

  // 프로필
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  // 법인카드
  const [cards, setCards] = useState<CardItem[]>([])
  const [loadingCards, setLoadingCards] = useState(true)

  // 카드 추가 폼
  const [showAddCard, setShowAddCard] = useState(false)
  const [newCardName, setNewCardName] = useState('')
  const [newCardNumber, setNewCardNumber] = useState('')
  const [newCardCompany, setNewCardCompany] = useState('')
  const [newCardDefault, setNewCardDefault] = useState(false)
  const [cardSaving, setCardSaving] = useState(false)

  const getToken = async () => {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null
    return token || ''
  }

  // 데이터 로드
  const fetchData = useCallback(async () => {
    if (!user) return
    try {
      const token = await getToken()
      const res = await fetch('/api/my-info', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (json.profile) {
        setName(json.profile.employee_name || '')
        setPhone(json.profile.phone || '')
      }
      if (json.cards) setCards(json.cards)
    } catch (e) {
      console.error('내 정보 로드 실패:', e)
    } finally {
      setLoadingCards(false)
    }
  }, [user])

  useEffect(() => { fetchData() }, [fetchData])

  // 프로필 저장
  const saveProfile = async () => {
    setProfileSaving(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/my-info', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ employee_name: name, phone }),
      })
      const json = await res.json()
      if (json.success) alert('프로필이 저장되었습니다.')
      else alert('저장 실패: ' + (json.error || ''))
    } catch {
      alert('저장에 실패했습니다.')
    } finally {
      setProfileSaving(false)
    }
  }

  // 카드번호 포맷 (자동 하이픈)
  const formatCardNumber = (val: string) => {
    const nums = val.replace(/[^0-9]/g, '').slice(0, 16)
    const parts = []
    for (let i = 0; i < nums.length; i += 4) {
      parts.push(nums.slice(i, i + 4))
    }
    return parts.join('-')
  }

  // 카드 추가
  const addCard = async () => {
    if (!newCardNumber.replace(/[^0-9]/g, '')) {
      alert('카드번호를 입력해주세요.')
      return
    }
    setCardSaving(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/my-info/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          card_name: newCardName,
          card_number: newCardNumber,
          card_company: newCardCompany,
          is_default: newCardDefault,
        }),
      })
      const json = await res.json()
      if (json.success) {
        // 기본카드 설정 시 기존 기본 해제 반영
        if (newCardDefault) {
          setCards(prev => prev.map(c => ({ ...c, is_default: false })))
        }
        setCards(prev => [json.data, ...prev])
        setShowAddCard(false)
        setNewCardName('')
        setNewCardNumber('')
        setNewCardCompany('')
        setNewCardDefault(false)
      } else {
        alert('카드 등록 실패: ' + (json.error || ''))
      }
    } catch {
      alert('카드 등록에 실패했습니다.')
    } finally {
      setCardSaving(false)
    }
  }

  // 카드 삭제
  const deleteCard = async (id: string) => {
    if (!confirm('이 카드를 삭제하시겠습니까?')) return
    const token = await getToken()
    await fetch(`/api/my-info/cards?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setCards(prev => prev.filter(c => c.id !== id))
  }

  // 기본카드 설정
  const setDefault = async (id: string) => {
    const token = await getToken()
    const res = await fetch('/api/my-info/cards', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, is_default: true }),
    })
    const json = await res.json()
    if (json.success) {
      setCards(prev => prev.map(c => ({ ...c, is_default: c.id === id })))
    }
  }

  // 카드번호 마스킹 표시
  const maskCardNumber = (num: string) => {
    const clean = num.replace(/[^0-9]/g, '')
    if (clean.length >= 8) {
      return `${clean.slice(0, 4)}-****-****-${clean.slice(-4)}`
    }
    return num
  }

  if (!user) return null

  // ── admin 회사 미선택 시 차단 ──
  if (!company) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px', minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500 }}>
          <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>🏢</span>
          <p style={{ fontWeight: 700, color: '#374151', fontSize: 16, marginBottom: 8 }}>좌측 상단에서 회사를 먼저 선택해주세요</p>
          <p style={{ color: '#9ca3af', fontSize: 13 }}>내 정보는 회사 기준으로 관리됩니다</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>

      {/* ── 프로필 섹션 ── */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '28px 24px', marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 4, marginTop: 0 }}>내 프로필</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>기본 정보를 확인하고 수정할 수 있습니다</p>

        <div style={{ display: 'grid', gap: 16 }}>
          {/* 이메일 (읽기전용) */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, display: 'block' }}>이메일</label>
            <input
              value={user.email || ''}
              disabled
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, background: '#f8fafc', color: '#94a3b8', boxSizing: 'border-box' }}
            />
          </div>

          {/* 회사 (읽기전용) */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, display: 'block' }}>소속 회사</label>
            <input
              value={company?.name || '미배정'}
              disabled
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, background: '#f8fafc', color: '#94a3b8', boxSizing: 'border-box' }}
            />
          </div>

          {/* 이름 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, display: 'block' }}>이름</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력하세요"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>

          {/* 연락처 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, display: 'block' }}>연락처</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ marginTop: 20, textAlign: 'right' }}>
          <button
            onClick={saveProfile}
            disabled={profileSaving}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none',
              background: profileSaving ? '#94a3b8' : '#2563eb', color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: profileSaving ? 'default' : 'pointer',
            }}
          >
            {profileSaving ? '저장 중...' : '프로필 저장'}
          </button>
        </div>
      </div>

      {/* ── 법인카드 섹션 ── */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '28px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', margin: 0 }}>법인카드 관리</h2>
          <button
            onClick={() => setShowAddCard(!showAddCard)}
            style={{
              padding: '8px 16px', borderRadius: 10, border: 'none',
              background: showAddCard ? '#e2e8f0' : '#2563eb', color: showAddCard ? '#475569' : '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {showAddCard ? '취소' : '+ 카드 추가'}
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
          법인카드를 등록하면 영수증 제출 시 카드번호가 자동으로 매칭됩니다
        </p>

        {/* 카드 추가 폼 */}
        {showAddCard && (
          <div style={{ background: '#f0f9ff', borderRadius: 12, padding: '20px', marginBottom: 20, border: '1px solid #bae6fd' }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 4, display: 'block' }}>카드 이름 (선택)</label>
                  <input
                    value={newCardName}
                    onChange={(e) => setNewCardName(e.target.value)}
                    placeholder="예: 업무용 카드"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #bae6fd', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 4, display: 'block' }}>카드사</label>
                  <select
                    value={newCardCompany}
                    onChange={(e) => setNewCardCompany(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #bae6fd', fontSize: 13, background: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="">카드사 선택</option>
                    {CARD_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 4, display: 'block' }}>카드번호 *</label>
                <input
                  value={newCardNumber}
                  onChange={(e) => setNewCardNumber(formatCardNumber(e.target.value))}
                  placeholder="0000-0000-0000-0000"
                  maxLength={19}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #bae6fd', fontSize: 15, fontWeight: 600, letterSpacing: 1, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={newCardDefault}
                  onChange={(e) => setNewCardDefault(e.target.checked)}
                  id="default-card"
                  style={{ width: 16, height: 16 }}
                />
                <label htmlFor="default-card" style={{ fontSize: 13, color: '#0369a1', fontWeight: 600, cursor: 'pointer' }}>
                  기본 카드로 설정
                </label>
              </div>
              <button
                onClick={addCard}
                disabled={cardSaving}
                style={{
                  padding: '10px 0', borderRadius: 10, border: 'none',
                  background: cardSaving ? '#94a3b8' : '#0369a1', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: cardSaving ? 'default' : 'pointer',
                }}
              >
                {cardSaving ? '등록 중...' : '카드 등록'}
              </button>
            </div>
          </div>
        )}

        {/* 등록된 카드 목록 */}
        {loadingCards ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>
        ) : cards.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💳</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>등록된 법인카드가 없습니다</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>카드를 등록하면 영수증 제출 시 자동 매칭됩니다</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {cards.map(card => (
              <div
                key={card.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '16px 20px', borderRadius: 12,
                  background: card.is_default ? '#f0f9ff' : '#f8fafc',
                  border: card.is_default ? '2px solid #2563eb' : '1px solid #e2e8f0',
                }}
              >
                {/* 카드 아이콘 */}
                <div style={{
                  width: 48, height: 32, borderRadius: 6,
                  background: card.is_default ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'linear-gradient(135deg, #64748b, #475569)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{ color: '#fff', fontSize: 10, fontWeight: 800 }}>{card.card_last4}</span>
                </div>

                {/* 카드 정보 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{card.card_name}</span>
                    {card.is_default && (
                      <span style={{ fontSize: 10, fontWeight: 800, background: '#2563eb', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>기본</span>
                    )}
                    {card.card_company && (
                      <span style={{ fontSize: 11, color: '#64748b' }}>{card.card_company}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 13, color: '#64748b', fontFamily: 'monospace' }}>{maskCardNumber(card.card_number)}</span>
                </div>

                {/* 액션 버튼 */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {!card.is_default && (
                    <button
                      onClick={() => setDefault(card.id)}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                    >
                      기본 설정
                    </button>
                  )}
                  <button
                    onClick={() => deleteCard(card.id)}
                    style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'none', fontSize: 14, color: '#ef4444', cursor: 'pointer' }}
                    title="삭제"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
