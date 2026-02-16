'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useApp } from '../../context/AppContext'

interface CompanyData {
  id: string
  name: string
  business_number: string
  representative: string
  phone: string
  email: string
  address: string
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
  plan: 'free',
  is_active: true,
}

export default function CompanySettingsTab() {
  const supabase = createClientComponentClient()
  const { company, role, adminSelectedCompanyId } = useApp()
  const isGodAdmin = role === 'god_admin'

  const [data, setData] = useState<CompanyData>(DEFAULT_COMPANY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showGuide, setShowGuide] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)
  const [savedData, setSavedData] = useState<CompanyData>(DEFAULT_COMPANY)

  const targetCompanyId = isGodAdmin ? adminSelectedCompanyId : company?.id

  const loadCompany = useCallback(async () => {
    if (!targetCompanyId) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const { data: row, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', targetCompanyId)
        .single()
      if (error) throw error
      if (row) {
        const mapped: CompanyData = {
          id: row.id,
          name: row.name || '',
          business_number: row.business_number || '',
          representative: row.representative || '',
          phone: row.phone || '',
          email: row.email || '',
          address: row.address || '',
          plan: row.plan || 'free',
          is_active: row.is_active ?? true,
        }
        setData(mapped)
        setSavedData(mapped)
      }
    } catch (error) {
      console.error('회사 정보 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, targetCompanyId])

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
      const updatePayload: Record<string, any> = {
        name: data.name,
        business_number: data.business_number,
        representative: data.representative,
        phone: data.phone,
        email: data.email,
        address: data.address,
      }
      const { error } = await supabase
        .from('companies')
        .update(updatePayload)
        .eq('id', targetCompanyId)
      if (error) throw error
      setSavedData(data)
      setHasChanges(false)
      alert('저장되었습니다.')
    } catch (error) {
      console.error('저장 실패:', error)
      alert('저장에 실패했습니다.')
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
        <h3 className="text-sm font-bold text-gray-700 mb-1">회사를 선택하세요</h3>
        <p className="text-xs text-gray-400">
          {isGodAdmin
            ? '상단에서 관리할 회사를 선택하면 해당 회사의 설정을 편집할 수 있습니다.'
            : '회사에 소속되지 않은 계정입니다.'
          }
        </p>
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
              <h3 className="text-sm font-bold text-gray-900">회사 설정</h3>
              <span className={`px-2 py-0.5 text-[10px] font-bold text-white rounded-full ${PLAN_LABELS[data.plan]?.color || 'bg-gray-500'}`}>
                {PLAN_LABELS[data.plan]?.label || data.plan.toUpperCase()}
              </span>
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
          <div>
            <label className="block text-[10px] font-bold text-gray-500 mb-1">주소</label>
            <input
              type="text"
              value={data.address}
              onChange={e => updateField('address', e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-1 focus:ring-gray-400 focus:outline-none"
              placeholder="서울특별시 강남구 ..."
            />
          </div>
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
