'use client'

import { useEffect, useState, useCallback } from 'react'
import { useDaumPostcodePopup } from 'react-daum-postcode'
import { useApp } from '../../context/AppContext'

interface CompanyData {
  id: string
  name: string
  business_number: string
  representative: string
  phone: string
  email: string
  address: string
  address_detail: string
  plan: string
  is_active: boolean
}

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free: { label: 'FREE', color: 'bg-gray-500' },
  basic: { label: 'BASIC', color: 'bg-green-500' },
  pro: { label: 'PRO', color: 'bg-blue-500' },
  max: { label: 'MAX', color: 'bg-gradient-to-r from-yellow-500 to-amber-500' },
}

const DEFAULT_COMPANY: CompanyData = {
  id: '',
  name: '',
  business_number: '',
  representative: '',
  phone: '',
  email: '',
  address: '',
  address_detail: '',
  plan: 'free',
  is_active: true,
}

export default function CompanySettingsTab() {
  const { company, role, adminSelectedCompanyId, refreshAuth } = useApp()
  const isGodAdmin = role === 'god_admin'
  const openPostcode = useDaumPostcodePopup()

  const [data, setData] = useState<CompanyData>(DEFAULT_COMPANY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showGuide, setShowGuide] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)
  const [savedData, setSavedData] = useState<CompanyData>(DEFAULT_COMPANY)

  // 일반 사용자: 본인 회사만 편집, god_admin: 선택한 회사 편집
  const targetCompanyId = isGodAdmin ? (adminSelectedCompanyId || company?.id) : company?.id

  const loadCompany = useCallback(async () => {
    if (!targetCompanyId) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const res = await fetch(`/api/company?id=${targetCompanyId}`)
      if (!res.ok) throw new Error((await res.json()).error || '로드 실패')
      const row = await res.json()
      const mapped: CompanyData = {
        id: row.id,
        name: row.name || '',
        business_number: row.business_number || '',
        representative: row.representative || '',
        phone: row.phone || '',
        email: row.email || '',
        address: row.address || '',
        address_detail: row.address_detail || '',
        plan: row.plan || 'free',
        is_active: row.is_active ?? true,
      }
      setData(mapped)
      setSavedData(mapped)
    } catch (error) {
      console.error('회사 정보 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }, [targetCompanyId])

  useEffect(() => { loadCompany() }, [loadCompany])

  const updateField = (field: keyof CompanyData, value: any) => {
    setData(prev => {
      const updated = { ...prev, [field]: value }
      setHasChanges(JSON.stringify(updated) !== JSON.stringify(savedData))
      return updated
    })
  }

  const handleSave = async () => {
    if (!targetCompanyId) return
    try {
      setSaving(true)
      const res = await fetch('/api/company', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetCompanyId,
          name: data.name,
          business_number: data.business_number,
          representative: data.representative,
          phone: data.phone,
          email: data.email,
          address: data.address,
          address_detail: data.address_detail,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '저장 실패')
      if (result.missingColumns?.length > 0) {
        console.warn('[CompanySettings] 없는 컬럼(수동추가 필요):', result.missingColumns)
      }
      setSavedData(data)
      setHasChanges(false)
      if (refreshAuth) await refreshAuth()
      alert('저장되었습니다.' + (result.missingColumns?.length > 0 ? `\n(일부 필드는 DB 컬럼 추가 필요: ${result.missingColumns.join(', ')})` : ''))
    } catch (error: any) {
      console.error('저장 실패:', error)
      alert('저장에 실패했습니다: ' + (error.message || ''))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setData(savedData)
    setHasChanges(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
      </div>
    )
  }

  if (!targetCompanyId) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <span className="text-4xl block mb-3">🏢</span>
        <h3 className="text-sm font-bold text-gray-700 mb-1">회사 정보를 불러올 수 없습니다</h3>
        <p className="text-xs text-gray-400">소속된 회사가 없거나 로그인 정보를 확인해주세요.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 가이드 배너 */}
      {showGuide && (
        <div className="bg-gradient-to-r from-slate-50 to-zinc-50 rounded-2xl p-5 border border-slate-200">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏢</span>
              <h3 className="text-sm font-bold text-gray-900">{data.name || '회사 정보'}</h3>
            </div>
            <button onClick={() => setShowGuide(false)} className="text-gray-400 hover:text-gray-600 text-xs">닫기</button>
          </div>
          <div className="text-xs">
            <div className="bg-white/70 rounded-xl p-3">
              <p className="font-bold text-gray-800 mb-1">사업자 정보 관리</p>
              <p className="text-gray-600 leading-relaxed">
                회사명, 사업자번호, 대표자 등 기본 사업자 정보를 관리합니다.
                여기서 입력한 정보가 견적서와 계약서에 임대인(회사) 정보로 인쇄됩니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 기본 정보 카드 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-1 h-4 bg-gray-900 rounded-full inline-block" />
          기본 사업자 정보
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 mb-1">회사명</label>
            <input
              type="text"
              value={data.name}
              onChange={e => updateField('name', e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-1 focus:ring-gray-400 focus:outline-none"
              placeholder="(주)렌터카모빌리티"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 mb-1">사업자등록번호</label>
            <input
              type="text"
              value={data.business_number}
              onChange={e => updateField('business_number', e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-1 focus:ring-gray-400 focus:outline-none"
              placeholder="000-00-00000"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 mb-1">대표자</label>
            <input
              type="text"
              value={data.representative}
              onChange={e => updateField('representative', e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-1 focus:ring-gray-400 focus:outline-none"
              placeholder="홍길동"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 mb-1">연락처</label>
            <input
              type="text"
              value={data.phone}
              onChange={e => updateField('phone', e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-1 focus:ring-gray-400 focus:outline-none"
              placeholder="02-0000-0000"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 mb-1">이메일</label>
            <input
              type="text"
              value={data.email}
              onChange={e => updateField('email', e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-1 focus:ring-gray-400 focus:outline-none"
              placeholder="info@rentcar.co.kr"
            />
          </div>
        </div>
        {/* 주소 (전체 너비) */}
        <div className="mt-4">
          <label className="block text-[10px] font-bold text-gray-500 mb-1">주소</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={data.address}
              readOnly
              className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 text-gray-700 focus:outline-none cursor-pointer"
              placeholder="주소 검색을 눌러주세요"
              onClick={() => openPostcode({
                onComplete: (addr: any) => {
                  updateField('address', addr.roadAddress || addr.jibunAddress || addr.address)
                },
              })}
            />
            <button
              type="button"
              onClick={() => openPostcode({
                onComplete: (addr: any) => {
                  updateField('address', addr.roadAddress || addr.jibunAddress || addr.address)
                },
              })}
              className="px-3 py-2 text-xs font-bold bg-gray-900 text-white rounded-xl hover:bg-gray-700 whitespace-nowrap"
            >
              주소 검색
            </button>
          </div>
          <input
            type="text"
            value={data.address_detail}
            onChange={e => updateField('address_detail', e.target.value)}
            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-1 focus:ring-gray-400 focus:outline-none"
            placeholder="상세주소 (동/호수 등)"
          />
        </div>
      </div>

      {/* 저장 버튼 바 */}
      {hasChanges && (
        <div className="sticky bottom-4 z-30">
          <div className="bg-gray-900 text-white rounded-2xl shadow-lg p-4 flex items-center justify-between max-w-[1400px] mx-auto">
            <p className="text-xs font-semibold">변경사항이 있습니다</p>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-xs font-semibold bg-gray-700 rounded-lg hover:bg-gray-600"
              >
                되돌리기
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 text-xs font-bold bg-white text-gray-900 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
