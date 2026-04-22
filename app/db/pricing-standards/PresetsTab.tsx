'use client'

/**
 * 영업 프리셋 관리 탭 (#39 Phase 1b)
 *  - sales_presets 테이블 CRUD
 *  - 표준/할인/프리미엄 3종 기본 시드 + 사용자 정의 추가 가능
 *  - 심플 견적 작성 시 프리셋 선택 → 마진율/관리비/할인율 자동 적용
 */

import { useEffect, useState } from 'react'
import {
  fetchPricingStandardsData,
  updatePricingStandardsRow,
  insertPricingStandardsRows,
  deletePricingStandardsRow,
} from '@/app/utils/pricing-standards'

interface SalesPreset {
  id: string
  name: string
  label: string
  description: string | null
  is_default: number | boolean
  loan_interest_rate: number | null
  margin_rate: number | null
  overhead_rate: number | null
  risk_reserve_rate: number | null
  deposit_discount_rate: number | null
  prepayment_discount_rate: number | null
  default_deposit: number | null
  sort_order: number
  is_active: number | boolean
  created_at?: string
  updated_at?: string
}

const NUMERIC_FIELDS: Array<{
  key: keyof SalesPreset
  label: string
  unit: string
  hint: string
}> = [
  { key: 'loan_interest_rate', label: '대출금리', unit: '%', hint: '빈 값이면 business_rules.LOAN_INTEREST_RATE 기본값' },
  { key: 'margin_rate', label: '마진율', unit: '%', hint: '프리셋별 수익 확보 목표치' },
  { key: 'overhead_rate', label: '관리비율', unit: '%', hint: '간접비 배분율' },
  { key: 'risk_reserve_rate', label: '리스크 적립율', unit: '%', hint: '사고/수리 대비 여유' },
  { key: 'deposit_discount_rate', label: '보증금 할인율', unit: '%/천만', hint: '보증금 1천만당 월 할인율' },
  { key: 'prepayment_discount_rate', label: '선납 할인율', unit: '%', hint: '선납금 기준 할인율' },
  { key: 'default_deposit', label: '기본 보증금', unit: '원', hint: '프리셋 선택 시 자동 입력될 보증금' },
]

// 프리셋 컬러 토큰 (이름 기반 자동 매칭)
function presetTone(name: string): { border: string; accent: string; chip: string } {
  if (name.includes('할인')) {
    return {
      border: 'rgba(59,130,246,0.22)',
      accent: '#2563eb',
      chip: 'rgba(59,130,246,0.10)',
    }
  }
  if (name.includes('프리미엄')) {
    return {
      border: 'rgba(139,92,246,0.25)',
      accent: '#7c3aed',
      chip: 'rgba(139,92,246,0.10)',
    }
  }
  // 표준 + 사용자 정의
  return {
    border: 'rgba(34,197,94,0.22)',
    accent: '#16a34a',
    chip: 'rgba(34,197,94,0.10)',
  }
}

export default function PresetsTab() {
  const [presets, setPresets] = useState<SalesPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchPricingStandardsData('sales_presets')
      // number 캐스팅 (DECIMAL/JSON → 숫자)
      const normalized: SalesPreset[] = (data || []).map((r: any) => ({
        ...r,
        loan_interest_rate: r.loan_interest_rate != null ? Number(r.loan_interest_rate) : null,
        margin_rate: r.margin_rate != null ? Number(r.margin_rate) : null,
        overhead_rate: r.overhead_rate != null ? Number(r.overhead_rate) : null,
        risk_reserve_rate: r.risk_reserve_rate != null ? Number(r.risk_reserve_rate) : null,
        deposit_discount_rate: r.deposit_discount_rate != null ? Number(r.deposit_discount_rate) : null,
        prepayment_discount_rate: r.prepayment_discount_rate != null ? Number(r.prepayment_discount_rate) : null,
        default_deposit: r.default_deposit != null ? Number(r.default_deposit) : null,
        sort_order: Number(r.sort_order ?? 0),
        is_default: !!r.is_default,
        is_active: r.is_active == null ? true : !!r.is_active,
      }))
      setPresets(normalized)
    } catch (e: any) {
      setError(e?.message || '프리셋 로딩 실패')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(id: string, field: keyof SalesPreset, value: any) {
    try {
      await updatePricingStandardsRow('sales_presets', id, { [field]: value })
      setPresets(prev => prev.map(p => (p.id === id ? { ...p, [field]: value } : p)))
      setSavedId(id)
      setTimeout(() => setSavedId(null), 1500)
    } catch (e: any) {
      setError(e?.message || '저장 실패')
    }
  }

  async function handleAdd() {
    const name = window.prompt('새 프리셋 이름을 입력하세요 (예: 계약직우대)')
    if (!name || !name.trim()) return
    const trimmed = name.trim()
    if (presets.some(p => p.name === trimmed)) {
      alert('이미 존재하는 이름입니다')
      return
    }
    try {
      const newRow = {
        id: crypto.randomUUID(),
        name: trimmed,
        label: `${trimmed} (사용자정의)`,
        description: '사용자 정의 프리셋',
        is_default: 0,
        loan_interest_rate: null,
        margin_rate: 10.0,
        overhead_rate: 5.0,
        risk_reserve_rate: 2.0,
        deposit_discount_rate: 1.5,
        prepayment_discount_rate: 3.0,
        default_deposit: 500000,
        sort_order: (presets.at(-1)?.sort_order || 0) + 10,
        is_active: 1,
      }
      await insertPricingStandardsRows('sales_presets', [newRow])
      await load()
    } catch (e: any) {
      setError(e?.message || '추가 실패')
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`'${name}' 프리셋을 삭제할까요?`)) return
    try {
      await deletePricingStandardsRow('sales_presets', id)
      setPresets(prev => prev.filter(p => p.id !== id))
    } catch (e: any) {
      setError(e?.message || '삭제 실패')
    }
  }

  async function handleSetDefault(id: string) {
    // 기본 프리셋은 하나만 — 모두 0으로 클리어 후 해당 id만 1로 설정
    try {
      const others = presets.filter(p => p.is_default && p.id !== id)
      await Promise.all(others.map(p =>
        updatePricingStandardsRow('sales_presets', p.id, { is_default: 0 })
      ))
      await updatePricingStandardsRow('sales_presets', id, { is_default: 1 })
      setPresets(prev => prev.map(p => ({ ...p, is_default: p.id === id })))
    } catch (e: any) {
      setError(e?.message || '기본 프리셋 지정 실패')
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border p-8 text-center"
        style={{ background: 'rgba(255,255,255,0.72)', borderColor: 'rgba(0,0,0,0.06)' }}
      >
        <p className="text-slate-400 text-sm">프리셋 로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 헤더 + 가이드 + 추가 버튼 */}
      <div className="rounded-2xl p-5 border"
        style={{
          background: 'rgba(255,255,255,0.72)',
          borderColor: 'rgba(0,0,0,0.06)',
          boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)',
        }}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🎯</span>
              <h3 className="text-sm font-bold text-slate-800">영업 프리셋 관리</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono text-slate-500"
                style={{ background: 'rgba(0,0,0,0.04)' }}
              >
                sales_presets
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              심플 견적 작성 시 선택하는 가격 정책 프리셋입니다. 표준/할인/프리미엄 3종이 기본 제공되며,
              영업 정책에 따라 사용자 정의 프리셋을 추가할 수 있습니다. 빈 값(NULL)은 기본설정 탭의 business_rules 값이 자동 적용됩니다.
            </p>
          </div>
          <button
            onClick={handleAdd}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors"
            style={{
              background: 'rgba(59,130,246,0.10)',
              color: '#2563eb',
              border: '1px solid rgba(59,130,246,0.25)',
            }}
          >
            + 프리셋 추가
          </button>
        </div>

        {error && (
          <div className="mt-3 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            {error}
          </div>
        )}
      </div>

      {/* 프리셋 카드 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {presets.length === 0 && (
          <div className="col-span-full rounded-2xl p-8 text-center border"
            style={{ background: 'rgba(255,255,255,0.60)', borderColor: 'rgba(0,0,0,0.06)' }}
          >
            <p className="text-slate-500 text-sm">
              등록된 프리셋이 없습니다. 마이그레이션 SQL을 실행해 시드 3종을 추가하거나
              상단 <strong>+ 프리셋 추가</strong> 버튼을 눌러주세요.
            </p>
          </div>
        )}

        {presets.map(p => {
          const tone = presetTone(p.name)
          const isSaved = savedId === p.id
          return (
            <div key={p.id} className="rounded-2xl p-5 border"
              style={{
                background: 'rgba(255,255,255,0.72)',
                borderColor: tone.border,
                boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)',
              }}
            >
              {/* 상단 — 이름 + 기본 뱃지 + 액션 */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-bold" style={{ color: tone.accent }}>
                      {p.label || p.name}
                    </span>
                    {!!p.is_default && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: tone.chip, color: tone.accent }}
                      >
                        기본
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {p.description || '—'}
                  </p>
                </div>

                <div className="flex flex-col gap-1 flex-shrink-0">
                  {!p.is_default && (
                    <button onClick={() => handleSetDefault(p.id)}
                      className="text-[10px] px-2 py-0.5 rounded text-slate-500 hover:text-slate-700"
                      style={{ background: 'rgba(0,0,0,0.03)' }}
                    >
                      기본 지정
                    </button>
                  )}
                  <button onClick={() => handleDelete(p.id, p.name)}
                    className="text-[10px] px-2 py-0.5 rounded hover:text-red-600"
                    style={{ color: '#94a3b8' }}
                  >
                    삭제
                  </button>
                </div>
              </div>

              {/* 수치 필드 그리드 */}
              <div className="grid grid-cols-2 gap-2">
                {NUMERIC_FIELDS.map(f => {
                  const v = p[f.key] as number | null
                  return (
                    <div key={f.key} className="rounded-lg p-2"
                      style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.04)' }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-slate-500 font-semibold">{f.label}</span>
                        <span className="text-[9px] text-slate-400">{f.unit}</span>
                      </div>
                      <input type="number" step="0.01"
                        defaultValue={v ?? ''}
                        placeholder="—"
                        title={f.hint}
                        onBlur={(e) => {
                          const raw = e.target.value
                          const next = raw === '' ? null : parseFloat(raw)
                          if (next !== v) handleSave(p.id, f.key, next)
                        }}
                        className="w-full px-2 py-1 text-xs font-semibold rounded outline-none focus:ring-2"
                        style={{
                          background: 'rgba(255,255,255,0.75)',
                          border: '1px solid rgba(0,0,0,0.05)',
                          color: '#0f172a',
                        }}
                      />
                    </div>
                  )
                })}
              </div>

              {/* 푸터 — 정렬 순서 + 저장됨 */}
              <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400">
                <span>정렬: {p.sort_order}</span>
                {isSaved && <span style={{ color: tone.accent }}>💾 저장됨</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
