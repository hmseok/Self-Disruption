'use client'

import { supabase } from '../../../utils/supabase'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
export const dynamic = "force-dynamic"

// ── 유틸 ──
const f = (n: number) => Math.round(n || 0).toLocaleString()
const fDate = (d: string) => {
  if (!d) return '-'
  const dt = new Date(d)
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`
}
const fDateTime = (d: string) => {
  if (!d) return '-'
  return d.replace('T', ' ').replace(/-/g, '/').slice(0, 16)
}

// ── 타임라인 ──
function InvoiceTimeline({ quoteId }: { quoteId: string }) {
  const [events, setEvents] = useState<any[]>([])
  useEffect(() => {
    if (!quoteId) return
    supabase
      .from('quote_lifecycle_events')
      .select('*')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setEvents(data || []))
  }, [quoteId])
  if (events.length === 0) return null
  const icons: Record<string, string> = { created: '📝', shared: '📤', viewed: '👁️', sent: '📱', signed: '✅', revoked: '🚫' }
  const labels: Record<string, string> = { created: '생성됨', shared: '링크 생성', viewed: '열람', sent: '발송', signed: '서명 완료', revoked: '링크 비활성화' }
  return (
    <div style={{ marginTop: 32, padding: '0 16px' }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: '#374151', marginBottom: 12 }}>타임라인</h3>
      <div style={{ borderLeft: '2px solid #e5e7eb', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map((ev, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 14 }}>{icons[ev.event_type] || '📌'}</span>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{labels[ev.event_type] || ev.event_type}</span>
              {ev.channel && <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>({ev.channel})</span>}
              {ev.recipient && <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 4 }}>{ev.recipient}</span>}
              <div style={{ fontSize: 10, color: '#9ca3af' }}>{new Date(ev.created_at).toLocaleString('ko-KR')}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════
// 청구서 전용 상세 페이지
// ══════════════════════════════════════════════
export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const quoteId = params.id as string
  const printRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [quote, setQuote] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)

  // 공유/발송
  const [shareStatus, setShareStatus] = useState<'none' | 'shared' | 'signed'>('none')
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [sendChannel, setSendChannel] = useState<'copy' | 'sms' | 'kakao' | 'email'>('sms')
  const [sendPhone, setSendPhone] = useState('')
  const [sendEmail, setSendEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  // 상태 업데이트
  const [updating, setUpdating] = useState(false)

  // ── 데이터 로드 ──
  useEffect(() => {
    if (!quoteId) return
    ;(async () => {
      const { data: q, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', quoteId)
        .single()
      if (error || !q) { setLoading(false); return }
      setQuote(q)

      // 회사 정보
      if (q.company_id) {
        const { data: comp } = await supabase
          .from('companies')
          .select('name, phone, address, business_number, representative')
          .eq('id', q.company_id)
          .single()
        setCompany(comp)
      }

      // 공유 상태 확인
      if (q.signed_at) {
        setShareStatus('signed')
      } else if (q.shared_at) {
        setShareStatus('shared')
      }

      // 연락처 자동 채우기
      const phoneMatch = (q.memo || '').match(/연락처:\s*([0-9-]+)/)
      if (phoneMatch) setSendPhone(phoneMatch[1])

      setLoading(false)
    })()
  }, [quoteId])

  // ── memo 파싱 ──
  const parseMemo = useCallback((memo: string) => {
    const carMatch = memo.match(/\[청구서\]\s*(.+?)(?:\s*\||$)/)
    const periodMatch = memo.match(/기간:\s*(.+?)(?:\s*\||$)/)
    const phoneMatch = memo.match(/연락처:\s*(.+?)(?:\s*\||$)/)
    const parts = memo.split('|').map((s: string) => s.trim())
    const userMemo = parts.filter((p: string) => !p.startsWith('[청구서]') && !p.startsWith('기간:') && !p.startsWith('연락처:')).join(' ').trim()
    return {
      car: carMatch?.[1]?.trim() || '-',
      period: periodMatch?.[1]?.trim() || '-',
      phone: phoneMatch?.[1]?.trim() || '',
      memo: userMemo,
    }
  }, [])

  // ── 공유 링크 생성 ──
  const handleShare = useCallback(async () => {
    setShareLoading(true)
    setShowShareModal(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      const res = await fetch(`/api/quotes/${quoteId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ expiryDays: 7 }),
      })
      const data = await res.json()
      if (data.shareUrl) {
        setShareUrl(data.shareUrl)
        setShareStatus('shared')
      } else {
        alert(data.error || '공유 링크 생성 실패')
        setShowShareModal(false)
      }
    } catch {
      alert('서버 오류')
      setShowShareModal(false)
    }
    setShareLoading(false)
  }, [quoteId])

  // ── 메시지 복사 ──
  const handleCopyShareUrl = useCallback((mode: 'link' | 'message') => {
    if (!quote) return
    const parsed = parseMemo(quote.memo || '')
    const rentTotal = quote.rent_fee || 0
    const rentWithVat = Math.round(rentTotal * 1.1)
    if (mode === 'message') {
      const msg = `[에프엠아이 렌터카] 단기렌트 청구서\n${quote.customer_name}님\n차종: ${parsed.car}\n금액: ${f(rentWithVat)}원 (VAT포함)\n\n아래 링크에서 확인해주세요.\n${shareUrl}`
      navigator.clipboard.writeText(msg)
    } else {
      navigator.clipboard.writeText(shareUrl)
    }
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }, [quote, shareUrl, parseMemo])

  // ── 직접 발송 (SMS/카카오/이메일) ──
  const handleDirectSend = useCallback(async () => {
    if (!quote) return
    setSending(true)
    setSendResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      const parsed = parseMemo(quote.memo || '')
      const rentWithVat = Math.round((quote.rent_fee || 0) * 1.1)

      if (sendChannel === 'sms' || sendChannel === 'kakao') {
        if (!sendPhone.trim()) { setSending(false); return alert('전화번호를 입력해주세요.') }
        // Aligo API로 SMS 발송 (링크 포함)
        const phone = sendPhone.replace(/-/g, '')
        const msg = `[에프엠아이 렌터카]\n${quote.customer_name}님 청구서\n차종: ${parsed.car}\n금액: ${f(rentWithVat)}원(VAT포함)\n\n확인 및 서명:\n${shareUrl}`
        const res = await fetch('/api/send-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            phone, message: msg, title: '청구서 안내',
            recipientName: quote.customer_name,
            relatedType: 'invoice', relatedId: quoteId,
          }),
        })
        const result = await res.json()
        setSendResult({ success: result.success, message: result.success ? '문자가 발송되었습니다.' : (result.error || '발송 실패') })
      } else if (sendChannel === 'email') {
        if (!sendEmail.trim()) { setSending(false); return alert('이메일을 입력해주세요.') }
        // /api/quotes/[id]/send 사용
        const res = await fetch(`/api/quotes/${quoteId}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ channel: 'email', email: sendEmail, shareUrl }),
        })
        const result = await res.json()
        setSendResult({ success: result.success, message: result.success ? '이메일이 발송되었습니다.' : (result.error || '발송 실패') })
      }
    } catch (err: any) {
      setSendResult({ success: false, message: err.message || '발송 오류' })
    }
    setSending(false)
  }, [quote, quoteId, sendChannel, sendPhone, sendEmail, shareUrl, parseMemo])

  // ── 링크 비활성화 ──
  const handleRevokeShare = useCallback(async () => {
    if (!confirm('공유 링크를 비활성화하시겠습니까?')) return
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/quotes/${quoteId}/share`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.access_token || ''}` },
    })
    setShareUrl('')
    setShareStatus('none')
    setShowShareModal(false)
    alert('링크가 비활성화되었습니다.')
  }, [quoteId])

  // ── 보관 처리 ──
  const handleArchive = useCallback(async () => {
    if (!confirm('이 청구서를 보관하시겠습니까?')) return
    setUpdating(true)
    await supabase.from('quotes').update({ status: 'archived' }).eq('id', quoteId)
    setQuote((p: any) => ({ ...p, status: 'archived' }))
    setUpdating(false)
  }, [quoteId])

  // ── 로딩 ──
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: '4px solid #2d5fa8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: '#9ca3af', fontWeight: 700 }}>청구서 불러오는 중...</p>
      </div>
    </div>
  )

  if (!quote) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <p style={{ fontWeight: 700, color: '#374151' }}>청구서를 찾을 수 없습니다</p>
        <Link href="/quotes" style={{ color: '#2d5fa8', fontSize: 13, fontWeight: 700, marginTop: 8, display: 'inline-block' }}>← 목록으로</Link>
      </div>
    </div>
  )

  const parsed = parseMemo(quote.memo || '')
  const rentTotal = quote.rent_fee || 0
  const rentVat = Math.round(rentTotal * 0.1)
  const rentWithVat = rentTotal + rentVat

  const statusBadge = quote.signed_at
    ? { label: '서명완료', bg: '#dcfce7', color: '#16a34a', icon: '✅' }
    : quote.shared_at
    ? { label: '발송됨', bg: '#dbeafe', color: '#2563eb', icon: '📤' }
    : { label: '임시저장', bg: '#fef3c7', color: '#d97706', icon: '📝' }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* ── 상단 네비게이션 ── */}
      <div className="no-print" style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/quotes" style={{ color: '#6b7280', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>← 견적관리</Link>
            <span style={{ color: '#d1d5db' }}>/</span>
            <span style={{ color: '#2d5fa8', fontWeight: 800, fontSize: 14 }}>청구서 상세</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => window.print()} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 10, background: '#fff', fontSize: 12, fontWeight: 700, color: '#374151', cursor: 'pointer' }}>🖨️ 인쇄</button>
            <button
              onClick={handleShare}
              style={{
                padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: shareStatus === 'signed' ? '#dcfce7' : shareStatus === 'shared' ? '#dbeafe' : 'linear-gradient(135deg, #2d5fa8, #1e40af)',
                color: shareStatus === 'signed' ? '#16a34a' : shareStatus === 'shared' ? '#2563eb' : '#fff',
              }}
            >
              {shareStatus === 'signed' ? '✅ 서명완료' : shareStatus === 'shared' ? '📤 발송됨' : '📱 청구서 발송'}
            </button>
            <button onClick={handleArchive} disabled={updating || quote.status === 'archived'}
              style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 10, background: '#fff', fontSize: 12, fontWeight: 700, color: '#6b7280', cursor: 'pointer', opacity: (updating || quote.status === 'archived') ? 0.5 : 1 }}
            >🗂️ 보관</button>
          </div>
        </div>
      </div>

      {/* ── 메인 컨텐츠 ── */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        <div ref={printRef} style={{ background: '#fff', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

          {/* ── 헤더 ── */}
          <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5fa8)', color: '#fff', padding: '24px 32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>단기렌트 청구서</h1>
                <p style={{ color: '#93c5fd', fontSize: 11, marginTop: 2 }}>SHORT-TERM RENTAL INVOICE</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: statusBadge.bg, color: statusBadge.color }}>{statusBadge.icon} {statusBadge.label}</span>
                </div>
                <p style={{ color: '#93c5fd', fontSize: 11, marginTop: 6 }}>No. {String(quote.id).slice(0, 8).toUpperCase()}</p>
                <p style={{ color: '#bfdbfe', fontSize: 11 }}>작성일 {fDate(quote.created_at)}</p>
              </div>
            </div>
          </div>

          <div style={{ padding: '28px 32px' }}>

            {/* ── 임차인 / 대차 정보 그리드 ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
              {/* 임차인 */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, paddingBottom: 4, borderBottom: '2px solid #e5e7eb' }}>임차인 정보</div>
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16 }}>
                  <InfoRow label="임차인" value={quote.customer_name || '-'} bold />
                  <InfoRow label="연락처" value={parsed.phone || '-'} />
                </div>
              </div>
              {/* 대차 */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, paddingBottom: 4, borderBottom: '2px solid #e5e7eb' }}>대차 정보</div>
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16 }}>
                  <InfoRow label="차종" value={parsed.car} bold />
                  <InfoRow label="대여기간" value={parsed.period} />
                </div>
              </div>
            </div>

            {/* ── 요금 안내 ── */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>요금 안내</div>
              <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', borderRadius: 16, padding: '24px 28px', color: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ color: '#94a3b8', fontSize: 14 }}>공급가</span>
                  <span style={{ color: '#cbd5e1', fontWeight: 700, fontSize: 16 }}>{f(rentTotal)}원</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #334155' }}>
                  <span style={{ color: '#94a3b8', fontSize: 14 }}>VAT (10%)</span>
                  <span style={{ color: '#cbd5e1', fontWeight: 700, fontSize: 16 }}>{f(rentVat)}원</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>총 청구금액</span>
                  <div>
                    <span style={{ fontSize: 32, fontWeight: 900, color: '#fff' }}>{f(rentWithVat)}</span>
                    <span style={{ color: '#94a3b8', marginLeft: 4 }}>원</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 메모 ── */}
            {parsed.memo && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>메모</div>
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>{parsed.memo}</div>
              </div>
            )}

            {/* ── 서명 영역 (서명 완료 시 표시) ── */}
            {quote.signed_at && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>고객 서명</div>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 28 }}>✅</span>
                  <div>
                    <p style={{ fontWeight: 800, color: '#16a34a', fontSize: 14 }}>서명 완료</p>
                    <p style={{ fontSize: 11, color: '#6b7280' }}>{new Date(quote.signed_at).toLocaleString('ko-KR')}에 서명됨</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── 임대인 (회사) 정보 ── */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>임대인 (렌터카 사업자)</div>
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16 }}>
                <p style={{ fontWeight: 900, fontSize: 14, color: '#111827', marginBottom: 4 }}>{company?.name || '주식회사에프엠아이'}</p>
                {company?.business_number && <p style={{ fontSize: 12, color: '#6b7280' }}>사업자번호: {company.business_number}</p>}
                {company?.phone && <p style={{ fontSize: 12, color: '#6b7280' }}>TEL: {company.phone}</p>}
                {company?.address && <p style={{ fontSize: 12, color: '#6b7280' }}>주소: {company.address}</p>}
                {company?.representative && <p style={{ fontSize: 12, color: '#6b7280' }}>{company.representative}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* ── 타임라인 ── */}
        <InvoiceTimeline quoteId={quoteId} />
      </div>

      {/* ═══════════════════════════════════════
           공유/발송 모달
         ═══════════════════════════════════════ */}
      {showShareModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => { setShowShareModal(false); setSendResult(null) }}
        >
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: 28, maxWidth: 480, width: '100%', margin: '0 16px' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: '#111827', margin: 0 }}>청구서 발송</h3>
              <button onClick={() => { setShowShareModal(false); setSendResult(null) }} style={{ background: 'none', border: 'none', fontSize: 20, color: '#9ca3af', cursor: 'pointer', fontWeight: 700 }}>&times;</button>
            </div>

            {shareLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ width: 32, height: 32, border: '4px solid #2d5fa8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                <p style={{ color: '#9ca3af', fontSize: 13 }}>링크 생성 중...</p>
              </div>
            ) : shareUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* 미리보기 */}
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: '12px 16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{quote.customer_name}</span>
                      <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 8 }}>{parsed.car}</span>
                    </div>
                    <span style={{ fontWeight: 900, fontSize: 18, color: '#2d5fa8' }}>{f(rentWithVat)}원</span>
                  </div>
                </div>

                {/* 채널 선택 */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>발송 방법</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {([
                      { key: 'copy' as const, icon: '📋', label: '복사' },
                      { key: 'sms' as const, icon: '📱', label: '문자' },
                      { key: 'kakao' as const, icon: '💬', label: '카카오톡' },
                      { key: 'email' as const, icon: '📧', label: '이메일' },
                    ]).map(ch => (
                      <button key={ch.key}
                        onClick={() => { setSendChannel(ch.key); setSendResult(null) }}
                        style={{
                          padding: '10px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer', textAlign: 'center',
                          border: sendChannel === ch.key ? '2px solid #2d5fa8' : '2px solid #e5e7eb',
                          background: sendChannel === ch.key ? '#eff6ff' : '#fff',
                          color: sendChannel === ch.key ? '#1d4ed8' : '#6b7280',
                        }}
                      >
                        <span style={{ fontSize: 16, display: 'block', marginBottom: 2 }}>{ch.icon}</span>
                        {ch.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 채널별 입력 */}
                {sendChannel === 'copy' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button onClick={() => handleCopyShareUrl('message')}
                        style={{ padding: '12px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: shareCopied ? '#16a34a' : '#2d5fa8', color: '#fff' }}
                      >{shareCopied ? '✅ 복사됨!' : '💬 메시지 복사'}</button>
                      <button onClick={() => handleCopyShareUrl('link')}
                        style={{ padding: '12px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, border: '1px solid #d1d5db', cursor: 'pointer', background: '#f9fafb', color: '#374151' }}
                      >🔗 링크만 복사</button>
                    </div>
                    <p style={{ fontSize: 10, color: '#9ca3af' }}>복사한 내용을 카카오톡/문자에 붙여넣기하여 전송하세요.</p>
                  </div>
                ) : sendChannel === 'email' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>수신 이메일</label>
                    <input type="email" value={sendEmail} onChange={e => setSendEmail(e.target.value)} placeholder="customer@example.com"
                      style={{ border: '1px solid #d1d5db', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none' }}
                    />
                    <button onClick={handleDirectSend} disabled={sending || !sendEmail}
                      style={{ padding: '12px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: '#2d5fa8', color: '#fff', opacity: (sending || !sendEmail) ? 0.5 : 1 }}
                    >{sending ? '발송 중...' : '📧 이메일 발송'}</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>수신 전화번호</label>
                    <input type="tel" value={sendPhone} onChange={e => setSendPhone(e.target.value)} placeholder="010-1234-5678"
                      style={{ border: '1px solid #d1d5db', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none' }}
                    />
                    <button onClick={handleDirectSend} disabled={sending || !sendPhone}
                      style={{
                        padding: '12px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                        background: sendChannel === 'kakao' ? '#fee500' : '#2d5fa8',
                        color: sendChannel === 'kakao' ? '#3c1e1e' : '#fff',
                        opacity: (sending || !sendPhone) ? 0.5 : 1,
                      }}
                    >{sending ? '발송 중...' : sendChannel === 'kakao' ? '💬 카카오 알림톡 발송' : '📱 문자(SMS) 발송'}</button>
                    {sendChannel === 'kakao' && <p style={{ fontSize: 10, color: '#9ca3af' }}>* 카카오 알림톡 실패 시 자동 SMS 대체 발송</p>}
                  </div>
                )}

                {/* 발송 결과 */}
                {sendResult && (
                  <div style={{
                    borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 700, textAlign: 'center',
                    background: sendResult.success ? '#f0fdf4' : '#fef2f2',
                    color: sendResult.success ? '#16a34a' : '#dc2626',
                    border: `1px solid ${sendResult.success ? '#bbf7d0' : '#fecaca'}`,
                  }}>
                    {sendResult.success ? '✅ ' : '❌ '}{sendResult.message}
                  </div>
                )}

                {/* 하단 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#9ca3af', paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
                  <span>유효기간: 7일</span>
                  <button onClick={handleRevokeShare} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>링크 비활성화</button>
                </div>
              </div>
            ) : (
              <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>공유 링크를 생성할 수 없습니다.</p>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @media print {
          @page { size: A4; margin: 10mm 8mm; }
          html, body { background: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          * { overflow: visible !important; }
        }
      `}</style>
    </div>
  )
}

// ── 공통 정보 행 ──
function InfoRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ width: 72, flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#9ca3af' }}>{label}</span>
      <span style={{ fontSize: 13, color: '#111827', fontWeight: bold ? 900 : 400 }}>{value}</span>
    </div>
  )
}
