'use client'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import RentalContractPaper from '../components/RentalContractPaper'
import RentalContractTerms from '../components/RentalContractTerms'

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  draft: { label: '초안', bg: '#f3f4f6', color: '#6b7280' },
  pending_sign: { label: '서명대기', bg: '#fef08a', color: '#92400e' },
  signed: { label: '서명완료', bg: '#dbeafe', color: '#1e40af' },
  in_use: { label: '배차중', bg: '#dcfce7', color: '#166534' },
  returned: { label: '반납', bg: '#f1f5f9', color: '#475569' },
  cancelled: { label: '취소', bg: '#fee2e2', color: '#991b1b' },
}

export default function EContractDetailPage() {
  const { company } = useApp()
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string
  const [contract, setContract] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'info' | 'preview'>('info')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const { data } = await supabase.from('short_term_rental_contracts').select('*').eq('id', id).single()
      setContract(data)
      setLoading(false)
    })()
  }, [id])

  const f = (n?: number) => n != null ? Math.round(n).toLocaleString() : '-'
  const dt = (s?: string) => s ? s.replace('T', ' ').slice(0, 16) : '-'

  const handleStatusChange = async (newStatus: string) => {
    if (!contract) return
    const { error } = await supabase.from('short_term_rental_contracts').update({ status: newStatus }).eq('id', id)
    if (!error) setContract({ ...contract, status: newStatus })
  }

  const handleCopySignLink = () => {
    const url = `${process.env.NEXT_PUBLIC_BASE_URL || window.location.origin}/e-contract/${id}/sign`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 16px', textAlign: 'center', color: '#9ca3af' }}>로딩 중...</div>
  if (!contract) return <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 16px', textAlign: 'center', color: '#9ca3af' }}>계약서를 찾을 수 없습니다.</div>

  const st = STATUS_MAP[contract.status] || STATUS_MAP.draft

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px', minHeight: '100vh', background: '#f9fafb' }}>
      {/* 브레드크럼 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
        <span style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer' }} onClick={() => router.push('/e-contract')}>영업</span>
        <span style={{ fontSize: 13, color: '#d1d5db' }}>&gt;</span>
        <span style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer' }} onClick={() => router.push('/e-contract')}>전자계약서</span>
        <span style={{ fontSize: 13, color: '#d1d5db' }}>&gt;</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{contract.contract_number || '상세'}</span>
      </div>

      {/* 상단 카드: 요약 + 액션 */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 16, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#111827' }}>{contract.renter_name}</span>
            </div>
            <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#6b7280' }}>
              <span>🚗 {contract.car_model || '-'} ({contract.car_number || '-'})</span>
              <span>📅 {dt(contract.dispatch_at)} ~ {dt(contract.return_at)}</span>
              <span>💰 {f(contract.total_amount)}원</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {contract.status === 'draft' && (
              <>
                <button onClick={() => router.push(`/e-contract/create?edit=${id}`)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>✏️ 수정</button>
                <button onClick={() => handleStatusChange('pending_sign')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2d5fa8', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>📤 발송하기</button>
              </>
            )}
            {contract.status === 'pending_sign' && (
              <>
                <button onClick={handleCopySignLink} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {copied ? '✅ 복사됨!' : '🔗 서명링크 복사'}
                </button>
                <button onClick={() => handleStatusChange('pending_sign')} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>📧 재발송</button>
              </>
            )}
            {contract.status === 'signed' && (
              <button onClick={() => handleStatusChange('in_use')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>🚗 배차 시작</button>
            )}
            {contract.status === 'in_use' && (
              <button onClick={() => handleStatusChange('returned')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#475569', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>📋 반납 처리</button>
            )}
            {contract.signed_pdf_url && (
              <a href={contract.signed_pdf_url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', color: '#374151' }}>📄 서명PDF 다운</a>
            )}
            {!['cancelled', 'returned'].includes(contract.status) && (
              <button onClick={() => { if (confirm('계약을 취소하시겠습니까?')) handleStatusChange('cancelled') }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #fee2e2', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#dc2626' }}>취소</button>
            )}
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['info', 'preview'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 20px', borderRadius: '8px 8px 0 0', border: 'none', background: tab === t ? '#fff' : '#e5e7eb', fontWeight: tab === t ? 700 : 500, fontSize: 13, cursor: 'pointer', color: tab === t ? '#111827' : '#6b7280', borderBottom: tab === t ? '2px solid #2d5fa8' : '2px solid transparent' }}>
            {t === 'info' ? '📋 계약 정보' : '📄 계약서 미리보기'}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      {tab === 'info' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* 임차인 정보 */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#111827', marginBottom: 12, borderLeft: '4px solid #3b82f6', paddingLeft: 10 }}>임차인 정보</h3>
            {[
              ['이름', contract.renter_name], ['연락처', contract.renter_phone], ['생년월일', contract.renter_birth],
              ['주소', contract.renter_address], ['면허번호', contract.renter_license_no], ['면허구분', contract.renter_license_type],
            ].map(([label, val]) => (
              <div key={label as string} style={{ display: 'flex', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ width: 80, color: '#6b7280', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                <span style={{ color: '#111827' }}>{val || '-'}</span>
              </div>
            ))}
          </div>
          {/* 대차 정보 */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#111827', marginBottom: 12, borderLeft: '4px solid #f59e0b', paddingLeft: 10 }}>대차 정보</h3>
            {[
              ['차종', contract.car_model], ['차량번호', contract.car_number], ['유종', contract.car_fuel_type],
              ['대여일시', dt(contract.dispatch_at)], ['반납예정', dt(contract.return_at)],
              ['배차유류', contract.dispatch_fuel], ['배차km', contract.dispatch_km],
            ].map(([label, val]) => (
              <div key={label as string} style={{ display: 'flex', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ width: 80, color: '#6b7280', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                <span style={{ color: '#111827' }}>{val || '-'}</span>
              </div>
            ))}
          </div>
          {/* 보험 정보 */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#111827', marginBottom: 12, borderLeft: '4px solid #10b981', paddingLeft: 10 }}>보험 정보</h3>
            {[
              ['가입연령', `만 ${contract.ins_min_age || 26}세 이상`],
              ['자차한도', contract.ins_own_limit], ['자차면책', contract.ins_own_deductible],
              ['대인한도', contract.ins_person_limit], ['대물한도', contract.ins_property_limit],
              ['자손한도', contract.ins_injury_limit],
            ].map(([label, val]) => (
              <div key={label as string} style={{ display: 'flex', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ width: 80, color: '#6b7280', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                <span style={{ color: '#111827' }}>{val || '-'}</span>
              </div>
            ))}
          </div>
          {/* 요금/서명 */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#111827', marginBottom: 12, borderLeft: '4px solid #8b5cf6', paddingLeft: 10 }}>요금 / 계약</h3>
            {[
              ['총요금', `${f(contract.total_amount)}원`],
              ['대여시간', contract.rental_hours],
              ['담당자', contract.staff_name],
              ['연락처', contract.staff_phone],
              ['서명일시', contract.signed_at ? dt(contract.signed_at) : '미서명'],
              ['작성일', dt(contract.created_at)],
            ].map(([label, val]) => (
              <div key={label as string} style={{ display: 'flex', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ width: 80, color: '#6b7280', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                <span style={{ color: '#111827', fontWeight: label === '총요금' ? 900 : 400 }}>{val || '-'}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
          <div style={{ transform: 'scale(0.7)', transformOrigin: 'top center' }}>
            <RentalContractPaper data={contract} />
          </div>
          <div style={{ transform: 'scale(0.7)', transformOrigin: 'top center' }}>
            <RentalContractTerms companyName={contract.company_name} renterName={contract.renter_name} signatureUrl={contract.terms_signature_url} />
          </div>
        </div>
      )}
    </div>
  )
}
