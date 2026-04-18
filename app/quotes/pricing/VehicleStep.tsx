'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { usePricing } from './PricingContext'
import { f, fDate, parseNum, safeNum, formatWonCompact, MAINT_PACKAGE_LABELS } from '@/lib/quote-utils'
import { DOMESTIC_BRANDS, IMPORT_BRAND_PRESETS, IMPORT_BRANDS } from '@/lib/rent-calc-types'
import type { NewCarOption, NewCarColor, NewCarTrim, NewCarVariant } from '@/lib/rent-calc-types'
import { CostBar, Section, InputRow, ResultRow } from './components'

/**
 * VehicleStep — 차량선택 + 차량옵션
 * RentPricingBuilder에서 분리된 Step 1-2 컴포넌트
 */
export default function VehicleStep() {
  const ctx = usePricing()
  const {
    wizardStep, setWizardStep,
    selectedCar, setSelectedCar,
    cars, loading,
    activeTab, setActiveTab,
    lookupMode, setLookupMode,
    newCarBrand, setNewCarBrand,
    newCarModel, setNewCarModel,
    newCarResult, setNewCarResult,
    newCarSelectedTax, setNewCarSelectedTax,
    newCarSelectedFuel, setNewCarSelectedFuel,
    newCarSelectedVariant, setNewCarSelectedVariant,
    newCarSelectedTrim, setNewCarSelectedTrim,
    newCarSelectedOptions, setNewCarSelectedOptions,
    newCarSelectedExterior, setNewCarSelectedExterior,
    newCarSelectedInterior, setNewCarSelectedInterior,
    newCarPurchasePrice, setNewCarPurchasePrice,
    isLookingUp, lookupStage, lookupError, lookupElapsed,
    handleNewCarLookup,
    isParsingQuote, parseStage, parseElapsed,
    savedCarPrices, savedWorksheets,
    isSavingPrice,
    carSearchQuery, setCarSearchQuery,
    isDragging, setIsDragging,
    catalogSearch, setCatalogSearch,
    catalogFilter, setCatalogFilter,
    catalogSort, setCatalogSort,
    showAddPanel, setShowAddPanel,
    checkedRows, setCheckedRows,
    savedPricesOpen, setSavedPricesOpen,
    handleCarSelect,
    handleNewCarAnalysis,
    handleSaveNewCarPrice,
    handleLoadSavedPrice,
    handleDeleteSavedPrice,
    handleDeleteSavedWorksheet,
    handleBulkDeletePrices,
    handleQuoteImageUpload,
    onDropFile,
    factoryPrice, purchasePrice,
    setFactoryPrice, setPurchasePrice,
    calculations,
    saving,
    handleSaveWorksheet,
    dropFileRef,
    currentWorksheetId,
    applyReferenceTableMappings,
  } = ctx

  return (
    <>
      {wizardStep === 'vehicle' && (<>
      {/* ===== 탭 네비게이션 ===== */}
      <div className="flex justify-center mb-6">
        <div className="bg-white/70 backdrop-blur-md border border-black/5 rounded-2xl p-1 inline-flex gap-1 shadow-sm">
          {[
            { id: 'registered' as const, label: '등록차량' },
            { id: 'catalog' as const, label: '카달로그' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === t.id
                  ? 'bg-white/90 text-slate-900 shadow-sm border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== 가격표 드래그앤드롭 업로드 영역 (카달로그에서 + 가격표 추가 클릭 시 펼침) ===== */}
      {activeTab === 'catalog' && showAddPanel && (
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDropFile}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center mb-6 transition-all duration-300 ${
          isParsingQuote
            ? 'border-amber-400 bg-amber-50'
            : isDragging
              ? 'border-steel-500 bg-steel-50 scale-[1.01]'
              : 'border-white/10 bg-white hover:border-steel-300'
        }`}
      >
        <input
          ref={dropFileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={handleQuoteUpload}
          disabled={isParsingQuote}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        {isParsingQuote ? (
          <div className="pointer-events-none">
            <span className="inline-block w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-amber-700 font-bold text-sm">{parseStage || '분석 중...'}</p>
            {parseElapsed > 0 && <p className="text-xs text-amber-500 mt-1">{parseElapsed}초 경과</p>}
            {parseElapsed >= 15 && <p className="text-xs text-slate-500 mt-1">복잡한 가격표는 시간이 더 소요될 수 있습니다</p>}
          </div>
        ) : (
          <div className="pointer-events-none">
            <span className="text-4xl mb-2 block">📄</span>
            <p className="text-slate-400 font-bold text-sm">가격표를 여기에 놓거나 클릭하세요</p>
            <p className="text-xs text-slate-500 mt-2">PDF · 이미지(JPG, PNG) → AI 자동 분석 후 저장 목록에 추가</p>
          </div>
        )}
      </div>
      )}

      {/* ===== 카달로그 통합 리스트 (Compact Row + 검색/필터) ===== */}
      {activeTab === 'catalog' && (() => {
        // 1) 두 소스를 단일 행 모델로 정규화
        type Row = {
          id: string
          kind: 'worksheet' | 'price'
          brand: string
          model: string
          trim: string
          year: number | string
          number: string
          isUsed: boolean | undefined
          rent: number | null
          updatedAt: string
          orphan: boolean
          raw: any
        }
        const wsRows: Row[] = savedWorksheets.map((ws: any) => {
          const car = ws.cars
          const nc = ws.newcar_info
          const orphan = !car && !nc?.brand && !nc?.model
          return {
            id: `ws-${ws.id}`,
            kind: 'worksheet' as const,
            brand: car?.brand || nc?.brand || (orphan ? '미분류' : '기타'),
            model: car?.model || nc?.model || '차종 미확인',
            trim: car?.trim || nc?.trim || '',
            year: car?.year || nc?.year || '',
            number: car?.number || '',
            isUsed: car?.is_used,
            rent: ws.suggested_rent ? Math.round(ws.suggested_rent) : null,
            updatedAt: ws.updated_at || ws.created_at,
            orphan,
            raw: ws,
          }
        })
        // 동일 (브랜드|모델|연식) 중복 제거 — 최신 updated_at만 유지
        const spDedup = new Map<string, any>()
        savedCarPrices.forEach((sp: any) => {
          const key = `${(sp.brand || '').trim().toLowerCase()}|${(sp.model || '').trim().toLowerCase()}|${sp.year || ''}`
          const prev = spDedup.get(key)
          const cur = new Date(sp.updated_at || sp.created_at).getTime()
          const prevT = prev ? new Date(prev.updated_at || prev.created_at).getTime() : -1
          if (!prev || cur > prevT) spDedup.set(key, sp)
        })
        const spRows: Row[] = Array.from(spDedup.values()).map((sp: any) => ({
          id: `sp-${sp.id}`,
          kind: 'price' as const,
          brand: sp.brand || '기타',
          model: sp.model || '',
          trim: sp.price_data?.variants?.length ? `${sp.price_data.variants.length}차종` : '',
          year: sp.year || '',
          number: '',
          isUsed: undefined,
          rent: null,
          updatedAt: sp.updated_at || sp.created_at,
          orphan: false,
          raw: sp,
        }))
        const all: Row[] =
          catalogFilter === 'worksheets' ? wsRows :
          catalogFilter === 'prices' ? spRows :
          [...wsRows, ...spRows]

        // 2) 검색 필터 (브랜드/모델/트림/번호판)
        const q = catalogSearch.trim().toLowerCase()
        const filtered = q
          ? all.filter(r =>
              r.brand.toLowerCase().includes(q) ||
              r.model.toLowerCase().includes(q) ||
              r.trim.toLowerCase().includes(q) ||
              r.number.toLowerCase().includes(q)
            )
          : all

        // 3) 정렬
        const sorted = [...filtered].sort((a, b) => {
          if (catalogSort === 'price_asc')  return (a.rent || Infinity) - (b.rent || Infinity)
          if (catalogSort === 'price_desc') return (b.rent || -Infinity) - (a.rent || -Infinity)
          if (catalogSort === 'brand')      return a.brand.localeCompare(b.brand, 'ko')
          // recent
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        })

        // 4) 브랜드별 그룹 (정렬 모드가 brand이면 그룹 헤더 강조)
        const byBrand: Record<string, Row[]> = {}
        sorted.forEach(r => { (byBrand[r.brand] = byBrand[r.brand] || []).push(r) })
        const brandOrder = Object.keys(byBrand).sort((a, b) => {
          if (a === '미분류') return 1
          if (b === '미분류') return -1
          return a.localeCompare(b, 'ko')
        })

        const totalAll = wsRows.length + spRows.length
        if (totalAll === 0) return null

      return (
      <div className="rounded-2xl border border-black/[0.06] mb-6 overflow-hidden" style={{ background: 'rgba(255,255,255,0.72)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
        {/* Header — 항상 펼침 (Compact Row가 작아서 접을 필요 없음) */}
        <div className="w-full px-5 py-3 border-b border-black/5 flex items-center justify-between gap-3 bg-gray-50/40">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
            <span className="font-black text-slate-700 text-sm shrink-0">📋 저장 목록</span>
            <span className="bg-indigo-100 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0">
              {sorted.length}{q || catalogFilter !== 'all' ? ` / ${totalAll}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {checkedRows.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-200 transition-colors"
              >
                선택 삭제 ({checkedRows.size})
              </button>
            )}
          </div>
        </div>

        {/* Toolbar: 검색 + 필터 칩 + 정렬 */}
        <div className="px-5 py-3 border-b border-black/5 flex items-center gap-2 flex-wrap bg-white/60">
          {/* 검색 */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="브랜드, 모델, 트림, 차량번호 검색..."
              className="w-full pl-8 pr-3 py-2 text-xs font-semibold rounded-lg border border-black/[0.06] outline-none focus:border-indigo-300"
              style={{ background: 'rgba(255,255,255,0.4)', boxShadow: 'inset 2px 2px 4px rgba(140,170,210,0.10)' }}
            />
          </div>
          {/* 필터 칩 */}
          <div className="flex items-center gap-1 bg-gray-100/70 rounded-lg p-0.5">
            {([
              ['all', '전체', wsRows.length + spRows.length],
              ['worksheets', '🧮 워크시트', wsRows.length],
              ['prices', '🚘 가격표', spRows.length],
            ] as const).map(([key, label, cnt]) => (
              <button
                key={key}
                onClick={() => setCatalogFilter(key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                  catalogFilter === key ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label} <span className="text-slate-400">{cnt}</span>
              </button>
            ))}
          </div>
          {/* 정렬 */}
          <select
            value={catalogSort}
            onChange={(e) => setCatalogSort(e.target.value as any)}
            className="text-[11px] font-bold text-slate-600 border border-black/[0.06] rounded-lg px-2 py-1.5 bg-white outline-none cursor-pointer"
          >
            <option value="recent">최근순</option>
            <option value="brand">브랜드순</option>
            <option value="price_desc">렌트가↓</option>
            <option value="price_asc">렌트가↑</option>
          </select>
          {/* + 가격표 추가 (AI 조회 / 견적서 업로드 패널 토글) */}
          <button
            onClick={() => setShowAddPanel(v => !v)}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${
              showAddPanel
                ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
            }`}
            title="견적서 업로드 또는 AI로 신차 가격표 조회"
          >
            {showAddPanel ? '✕ 추가 패널 닫기' : '+ 가격표 추가'}
          </button>
        </div>

        {/* Body: 결과 없음 / Compact Row 그룹 */}
        {sorted.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400 text-xs">
            {q ? `"${catalogSearch}" 검색 결과 없음` : '항목이 없습니다'}
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04]">
            {brandOrder.map(brand => {
              const rows = byBrand[brand]
              return (
                <div key={`grp-${brand}`}>
                  {/* 브랜드 그룹 헤더 */}
                  <div className="px-5 py-1.5 bg-slate-50/60 flex items-center gap-2">
                    <span className={`text-[10px] font-black ${brand === '미분류' ? 'text-slate-400' : 'text-slate-500'}`}>
                      {brand === '미분류' ? '🕳️ 미분류' : brand}
                    </span>
                    <span className="text-[10px] text-slate-400">{rows.length}</span>
                  </div>
                  {/* 행들 */}
                  {rows.map(row => {
                    const isPrice = row.kind === 'price'
                    const isSelected = isPrice && newCarResult && newCarResult.brand === row.brand && (
                      newCarResult.model === row.model ||
                      (newCarResult.model_detail || newCarResult.model) === row.model ||
                      row.model?.startsWith(newCarResult.model)
                    )
                    const handleClick = () => {
                      if (row.orphan) return
                      if (row.kind === 'worksheet') {
                        const ws = row.raw
                        const carId = ws.cars?.id
                        if (carId) handleCarSelect(String(carId))
                        router.push(`/quotes/create?worksheet_id=${ws.id}&car_id=${carId || ''}`)
                      } else {
                        handleLoadSavedPrice(row.raw)
                      }
                    }
                    return (
                      <div
                        key={row.id}
                        className={`group px-5 py-2.5 grid gap-x-3 gap-y-0.5 transition-colors ${
                          row.orphan ? 'cursor-default opacity-60'
                          : isSelected ? 'bg-indigo-50/70 cursor-pointer'
                          : 'cursor-pointer hover:bg-indigo-50/40'
                        }`}
                        style={{
                          gridTemplateColumns: '20px 24px minmax(0, 1fr) 100px 76px 24px',
                          gridTemplateRows: 'auto auto',
                        }}
                      >
                        {/* ── Line 1 ── */}
                        {/* 체크박스 */}
                        <div className="self-center" style={{ gridColumn: 1, gridRow: 1 }}>
                          <input
                            type="checkbox"
                            checked={checkedRows.has(row.id)}
                            onChange={(e) => {
                              e.stopPropagation()
                              setCheckedRows(prev => {
                                const next = new Set(prev)
                                if (next.has(row.id)) next.delete(row.id)
                                else next.add(row.id)
                                return next
                              })
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 cursor-pointer"
                          />
                        </div>
                        {/* 아이콘 */}
                        <span
                          className={`text-sm self-center ${row.orphan ? 'text-slate-300' : isPrice ? 'text-indigo-500' : 'text-steel-500'}`}
                          style={{ gridColumn: 2, gridRow: 1 }}
                          onClick={handleClick}
                        >
                          {row.orphan ? '🕳️' : isPrice ? '🚘' : '🧮'}
                        </span>
                        {/* 모델명 + 번호판 + 뱃지 */}
                        <div
                          className="min-w-0 flex items-center gap-1.5 flex-wrap"
                          style={{ gridColumn: 3, gridRow: 1 }}
                          onClick={handleClick}
                        >
                          <span className={`font-black text-[13px] ${row.orphan ? 'italic text-slate-400' : 'text-slate-800'}`}>
                            {row.model || '차종 미확인'}
                          </span>
                          {row.number && <span className="text-[10px] font-bold text-steel-600">[{row.number}]</span>}
                          {row.year && <span className="text-[10px] text-slate-500">{row.year}년</span>}
                          {row.isUsed !== undefined && (
                            <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${row.isUsed ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                              {row.isUsed ? '중고' : '신차'}
                            </span>
                          )}
                          {isPrice && (
                            row.raw.source?.includes('견적서') ? (
                              <span className="text-[9px] px-1 py-0.5 rounded font-bold bg-emerald-50 text-emerald-600">견적서</span>
                            ) : (
                              <span className="text-[9px] px-1 py-0.5 rounded font-bold bg-violet-50 text-violet-600">AI</span>
                            )
                          )}
                          {isPrice && row.raw.price_data?.variants?.length > 0 && (
                            <span className="text-[9px] text-slate-400 font-bold">{row.raw.price_data.variants.length}차종</span>
                          )}
                          {isSelected && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">선택</span>}
                        </div>
                        {/* 렌트가 */}
                        <div
                          className="text-right text-[11px] font-bold text-emerald-600 tabular-nums self-center whitespace-nowrap"
                          style={{ gridColumn: 4, gridRow: 1 }}
                          onClick={handleClick}
                        >
                          {row.rent ? `${row.rent.toLocaleString()}원` : <span className="text-slate-300">—</span>}
                        </div>
                        {/* 날짜 */}
                        <div
                          className="text-right text-[10px] text-slate-400 tabular-nums self-center whitespace-nowrap"
                          style={{ gridColumn: 5, gridRow: 1 }}
                          onClick={handleClick}
                        >
                          {new Date(row.updatedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                        </div>
                        {/* 삭제 버튼 (모든 행에 hover 시 표시) */}
                        <div className="text-center self-center" style={{ gridColumn: 6, gridRow: 1 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!confirm(`"${row.model || '항목'}" 을(를) 삭제하시겠습니까?`)) return
                              if (isPrice) handleDeleteSavedPrice(row.raw.id)
                              else handleDeleteWorksheet(row.raw.id)
                            }}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all text-xs p-0.5"
                            title="삭제"
                          >
                            ✕
                          </button>
                        </div>
                        {/* ── Line 2 (트림/옵션) ── */}
                        {row.trim && (
                          <div
                            className="text-[10.5px] text-slate-500 leading-snug break-words"
                            style={{ gridColumn: '3 / span 4', gridRow: 2 }}
                            onClick={handleClick}
                          >
                            {row.trim}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        </div>
      );
      })()}

      {/* ===== 등록차량 선택 (보험/가입 페이지 디자인 기준) ===== */}
      {activeTab === 'registered' && (
      <div style={{ background: 'rgba(255,255,255,0.72)', borderRadius: 16, boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.06)', marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b6eb5' }} />
          <h3 style={{ fontWeight: 900, color: '#1f2937', fontSize: 14, margin: 0 }}>🚗 등록차량 선택</h3>
        </div>

        {/* 선택된 차량 표시 */}
        {selectedCar && (
          <div style={{ margin: '16px 24px', padding: 16, background: '#eff6ff', border: '2px solid #60a5fa', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 900, color: '#1e3a5f', fontSize: 18 }}>{selectedCar.brand} {selectedCar.model}</span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{selectedCar.trim || ''}</span>
              {selectedCar.number && <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(59,130,246,0.9)' }}>[{selectedCar.number}]</span>}
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{selectedCar.year}년식</span>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 800, background: selectedCar.is_used ? '#fff7ed' : '#eff6ff', color: selectedCar.is_used ? '#c2410c' : '#1d4ed8' }}>
                {selectedCar.is_used ? '중고' : '신차'}
              </span>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 800, background: selectedCar.is_commercial === false ? '#f0fdfa' : '#f1f5f9', color: selectedCar.is_commercial === false ? '#0f766e' : '#475569' }}>
                {selectedCar.is_commercial === false ? '비영업' : '영업'}
              </span>
              {selectedCar.is_used && selectedCar.purchase_mileage ? (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>구입시 {(selectedCar.purchase_mileage / 10000).toFixed(1)}만km</span>
              ) : null}
            </div>
            <button onClick={() => { setSelectedCar(null); setCarSearchQuery('') }}
              style={{ fontSize: 13, color: '#9ca3af', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>변경</button>
          </div>
        )}

        {/* 차량 미선택 시: KPI + 필터 + 테이블 */}
        {!selectedCar && (
          <div style={{ padding: '16px 24px 24px' }}>
            {/* KPI 카드 */}
            {cars.length > 0 && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 100px', background: '#fff', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, margin: 0 }}>전체 차량</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: '#111827', margin: '4px 0 0' }}>{cars.length}<span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 2 }}>대</span></p>
                </div>
                <div style={{ flex: '1 1 100px', background: '#f0fdf4', padding: '12px 16px', borderRadius: 12, border: '1px solid #dcfce7' }}>
                  <p style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, margin: 0 }}>대기</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: '#15803d', margin: '4px 0 0' }}>{cars.filter(c => c.status === 'available' || !c.status).length}<span style={{ fontSize: 12, color: '#86efac', marginLeft: 2 }}>대</span></p>
                </div>
                <div style={{ flex: '1 1 100px', background: '#eff6ff', padding: '12px 16px', borderRadius: 12, border: '1px solid #bfdbfe' }}>
                  <p style={{ fontSize: 11, color: '#2563eb', fontWeight: 700, margin: 0 }}>렌트중</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8', margin: '4px 0 0' }}>{cars.filter(c => c.status === 'rented').length}<span style={{ fontSize: 12, color: '#93c5fd', marginLeft: 2 }}>대</span></p>
                </div>
              </div>
            )}

            {/* 검색 바 */}
            <input
              type="text"
              placeholder="차량번호, 브랜드, 모델명으로 검색..."
              value={carSearchQuery}
              onChange={(e) => setCarSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10, fontSize: 13, fontWeight: 600, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}
            />

            {/* 차량 테이블 */}
            <div style={{ maxHeight: 420, overflowY: 'auto', overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.72)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.40)', boxShadow: 'inset 2px 2px 4px rgba(140,170,210,0.12)', borderBottom: '2px solid rgba(0,0,0,0.06)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>차량번호</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>브랜드/모델</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>트림</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>연식</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>구분</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>출고가</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>매입가</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {cars
                    .filter(car => {
                      if (!carSearchQuery.trim()) return true
                      const q = carSearchQuery.toLowerCase()
                      return (car.number || '').toLowerCase().includes(q) || (car.brand || '').toLowerCase().includes(q) || (car.model || '').toLowerCase().includes(q) || (car.trim || '').toLowerCase().includes(q)
                    })
                    .map(car => (
                      <tr
                        key={String(car.id)}
                        onClick={() => { handleCarSelect(String(car.id)); setCarSearchQuery('') }}
                        style={{ cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.04)', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f0f7ff')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 900, fontSize: 15, color: '#111827', whiteSpace: 'nowrap', letterSpacing: 1 }}>{car.number || '-'}</td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 800, color: 'rgba(59,130,246,0.9)' }}>{car.brand}</span>
                          <span style={{ marginLeft: 4, fontWeight: 600, color: '#374151' }}>{car.model}</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: 12 }}>{car.trim || '-'}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', color: '#6b7280', fontFamily: 'monospace' }}>{car.year}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800, marginRight: 2, background: car.is_used ? '#fff7ed' : '#eff6ff', color: car.is_used ? '#ea580c' : '#2563eb' }}>
                            {car.is_used ? '중고' : '신차'}
                          </span>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800, background: car.is_commercial === false ? '#f0fdfa' : '#f1f5f9', color: car.is_commercial === false ? '#0d9488' : '#64748b' }}>
                            {car.is_commercial === false ? '비영업' : '영업'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {car.factory_price ? `${Math.round(car.factory_price / 10000).toLocaleString()}만` : '-'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: 'rgba(59,130,246,0.9)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {car.purchase_price ? `${Math.round(car.purchase_price / 10000).toLocaleString()}만` : '-'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {car.status === 'rented'
                            ? <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: '#fef3c7', color: '#d97706' }}>렌트중</span>
                            : <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: '#dcfce7', color: '#16a34a' }}>대기</span>
                          }
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
              {cars.filter(car => {
                if (!carSearchQuery.trim()) return true
                const q = carSearchQuery.toLowerCase()
                return (car.number || '').toLowerCase().includes(q) || (car.brand || '').toLowerCase().includes(q) || (car.model || '').toLowerCase().includes(q) || (car.trim || '').toLowerCase().includes(q)
              }).length === 0 && (
                <p style={{ textAlign: 'center', color: '#9ca3af', padding: '48px 0', fontSize: 13 }}>
                  {carSearchQuery ? '검색 결과가 없습니다' : '등록된 차량이 없습니다'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      )}

        {/* ====== 공통 계층형 선택 UI: 개별소비세 → 유종 → 차종 그룹 → 트림 → 컬러 → 옵션 ====== */}
        {/* 저장목록에서 차량 데이터 선택 시 표시 */}
        {(activeTab === 'newcar' || activeTab === 'catalog') && (lookupMode === 'newcar' || lookupMode === 'saved') && newCarResult && newCarResult.variants?.length > 0 && (() => {
          // 개별소비세 그룹 추출 (중복 제거)
          const taxTypes = [...new Set(
            newCarResult.variants
              .map(v => v.consumption_tax || '')
              .filter(t => t !== '')
          )]
          const hasTaxGroups = taxTypes.length > 1

          // 개별소비세 필터링
          const taxFilteredVariants = hasTaxGroups && newCarSelectedTax
            ? newCarResult.variants.filter(v => v.consumption_tax === newCarSelectedTax)
            : newCarResult.variants

          // 유종 리스트 추출 (개별소비세 필터 적용 후, 중복 제거)
          const fuelTypes = [...new Set(taxFilteredVariants.map(v => v.fuel_type))]
          // 유종 필터링된 차종 그룹
          const filteredVariants = newCarSelectedFuel
            ? taxFilteredVariants.filter(v => v.fuel_type === newCarSelectedFuel)
            : taxFilteredVariants

          // 단계 번호 계산 (개별소비세 있으면 +1)
          const stepOffset = hasTaxGroups ? 1 : 0
          const stepIcons = ['①', '②', '③', '④', '⑤', '⑥']

          return (
          <div className="mt-4 p-5 border border-steel-200 rounded-2xl space-y-4" style={{ background: 'rgba(255,255,255,0.72)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
            {/* 모델 헤더 + 저장 버튼 */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-slate-600">
                {newCarResult.brand} {newCarResult.model} — {newCarResult.year}년식
              </span>
              <span className="text-xs px-2 py-0.5 bg-steel-100 text-steel-700 rounded-full font-bold">
                차종 {newCarResult.variants.length}개
              </span>
              {newCarResult.source?.includes('견적서') && (
                <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold">
                  📄 견적서 추출
                </span>
              )}
              {lookupMode === 'saved' && (
                <button
                  onClick={() => { setNewCarResult(null); setSelectedCar(null) }}
                  className="ml-auto text-xs px-3 py-1 bg-gray-100 text-slate-500 border border-black/[0.06] rounded-lg font-bold hover:bg-gray-100 transition-colors"
                >
                  ✕ 선택 해제
                </button>
              )}
              {lookupMode === 'newcar' && (
                <button
                  onClick={handleSaveCarPrice}
                  disabled={isSavingPrice}
                  className="ml-auto text-xs px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-bold hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                >
                  {isSavingPrice ? '저장 중...' : '💾 가격 저장'}
                </button>
              )}
            </div>

            {/* ── STEP 0 (조건부): 개별소비세 선택 ── */}
            {hasTaxGroups && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">① 개별소비세 선택</label>
                <div className="flex flex-wrap gap-2">
                  {taxTypes.map(tax => (
                    <button
                      key={tax}
                      onClick={() => {
                        setNewCarSelectedTax(tax)
                        setNewCarSelectedFuel('')
                        setNewCarSelectedVariant(null)
                        setNewCarSelectedTrim(null)
                        setNewCarSelectedOptions([])
                        setNewCarSelectedExterior(null)
                        setNewCarSelectedInterior(null)
                        setNewCarPurchasePrice('')
                        setSelectedCar(null)
                        // 해당 세율의 유종이 1개뿐이면 자동 선택
                        const matchedFuels = [...new Set(
                          newCarResult.variants
                            .filter(v => v.consumption_tax === tax)
                            .map(v => v.fuel_type)
                        )]
                        if (matchedFuels.length === 1) {
                          setNewCarSelectedFuel(matchedFuels[0])
                          const matched = newCarResult.variants.filter(v => v.consumption_tax === tax && v.fuel_type === matchedFuels[0])
                          if (matched.length === 1) setNewCarSelectedVariant(matched[0])
                        }
                      }}
                      className={`px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-bold ${
                        newCarSelectedTax === tax
                          ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-md'
                          : 'border-black/[0.06] hover:border-amber-300 bg-white text-slate-600'
                      }`}
                    >
                      <span>🏷️ {tax}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP: 유종(연료) 선택 ── */}
            {(!hasTaxGroups || newCarSelectedTax) && (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">{stepIcons[stepOffset]} 유종 선택</label>
              <div className="flex flex-wrap gap-2">
                {fuelTypes.map(fuel => {
                  const fuelIcon: Record<string, string> = { '휘발유': '⛽', '경유': '🛢️', 'LPG': '🔵', '전기': '⚡', '하이브리드': '🔋' }
                  return (
                    <button
                      key={fuel}
                      onClick={() => {
                        setNewCarSelectedFuel(fuel)
                        setNewCarSelectedVariant(null)
                        setNewCarSelectedTrim(null)
                        setNewCarSelectedOptions([])
                        setNewCarSelectedExterior(null)
                        setNewCarSelectedInterior(null)
                        setNewCarPurchasePrice('')
                        setSelectedCar(null)
                        const matched = taxFilteredVariants.filter(v => v.fuel_type === fuel)
                        if (matched.length === 1) setNewCarSelectedVariant(matched[0])
                      }}
                      className={`px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-bold ${
                        newCarSelectedFuel === fuel
                          ? 'border-steel-500 bg-steel-50 text-steel-700 shadow-md'
                          : 'border-black/[0.06] hover:border-steel-300 bg-white text-slate-600'
                      }`}
                    >
                      <span>{fuelIcon[fuel] || '🚗'} {fuel}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            )}

            {/* ── STEP: 차종 그룹 선택 ── */}
            {newCarSelectedFuel && filteredVariants.length > 1 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">{stepIcons[1 + stepOffset]} 차종 그룹 선택</label>
                <div className="flex flex-wrap gap-2">
                  {filteredVariants.map((v, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setNewCarSelectedVariant(v)
                        setNewCarSelectedTrim(null)
                        setNewCarSelectedOptions([])
                        setNewCarSelectedExterior(null)
                        setNewCarSelectedInterior(null)
                        setNewCarPurchasePrice('')
                        setSelectedCar(null)
                      }}
                      className={`px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-bold ${
                        newCarSelectedVariant?.variant_name === v.variant_name
                          ? 'border-steel-500 bg-steel-50 text-steel-700 shadow-md'
                          : 'border-black/[0.06] hover:border-steel-300 bg-white text-slate-600'
                      }`}
                    >
                      <span>{v.variant_name}</span>
                      <span className="ml-2 text-xs opacity-60">{v.engine_cc > 0 ? `${f(v.engine_cc)}cc` : '전기'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP: 트림 선택 ── */}
            {newCarSelectedVariant && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">
                  {stepIcons[2 + stepOffset]} 트림 선택 — {newCarSelectedVariant.variant_name}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {newCarSelectedVariant.trims.map((trim, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setNewCarSelectedTrim(trim)
                        setNewCarSelectedOptions([])
                        setNewCarSelectedExterior(null)
                        setNewCarSelectedInterior(null)
                        setNewCarPurchasePrice('')
                        setSelectedCar(null)
                        // 트림 선택 시 출고가/매입가 즉시 반영
                        setFactoryPrice(Number(trim.base_price))
                        setPurchasePrice(Number(trim.base_price))
                        // 트림 선택 즉시 차량옵션 스텝으로 이동
                        setWizardStep('options')
                      }}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        newCarSelectedTrim?.name === trim.name
                          ? 'border-steel-500 bg-steel-50 shadow-md'
                          : 'border-black/[0.06] hover:border-steel-300 bg-white'
                      }`}
                    >
                      <p className="font-bold text-slate-700">{trim.name}</p>
                      <p className="text-steel-600 font-bold mt-1">{f(trim.base_price)}원</p>
                      {trim.note && <p className="text-xs text-slate-500 mt-1">{trim.note}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── 트림 선택 시 자동으로 options step 이동 (별도 안내바 불필요) ── */}

            {/* ── STEP: 외장 컬러 선택 (vehicle step에서 숨김) ── */}
            {wizardStep !== 'vehicle' && newCarSelectedTrim && (newCarSelectedTrim.exterior_colors?.length ?? 0) > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">{stepIcons[3 + stepOffset]} 외장 컬러</label>
                <div className="flex flex-wrap gap-2">
                  {newCarSelectedTrim.exterior_colors!.map((color, idx) => (
                    <button
                      key={idx}
                      onClick={() => setNewCarSelectedExterior(
                        newCarSelectedExterior?.name === color.name ? null : color
                      )}
                      className={`px-3 py-2 text-xs rounded-xl border font-bold transition-colors ${
                        newCarSelectedExterior?.name === color.name
                          ? 'bg-gray-100 text-white border-black/[0.06]'
                          : 'bg-white text-slate-400 border-black/[0.06] hover:border-gray-400'
                      }`}
                    >
                      {color.name}
                      {color.code && <span className="ml-1 opacity-60">({color.code})</span>}
                      {color.price > 0 && <span className="ml-1 text-steel-400">+{(color.price).toLocaleString()}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP: 내장 컬러 선택 (vehicle step에서 숨김) ── */}
            {wizardStep !== 'vehicle' && newCarSelectedTrim && (newCarSelectedTrim.interior_colors?.length ?? 0) > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">{stepIcons[4 + stepOffset]} 내장 컬러</label>
                <div className="flex flex-wrap gap-2">
                  {newCarSelectedTrim.interior_colors!.map((color, idx) => (
                    <button
                      key={idx}
                      onClick={() => setNewCarSelectedInterior(
                        newCarSelectedInterior?.name === color.name ? null : color
                      )}
                      className={`px-3 py-2 text-xs rounded-xl border font-bold transition-colors ${
                        newCarSelectedInterior?.name === color.name
                          ? 'bg-gray-100 text-white border-black/[0.06]'
                          : 'bg-white text-slate-400 border-black/[0.06] hover:border-gray-400'
                      }`}
                    >
                      {color.name}
                      {color.code && <span className="ml-1 opacity-60">({color.code})</span>}
                      {color.price > 0 && <span className="ml-1 text-steel-400">+{(color.price).toLocaleString()}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {wizardStep !== 'vehicle' && newCarSelectedTrim && (!newCarSelectedTrim.exterior_colors || newCarSelectedTrim.exterior_colors.length === 0) && (!newCarSelectedTrim.interior_colors || newCarSelectedTrim.interior_colors.length === 0) && (
              <div className="text-xs text-slate-500 bg-gray-50 rounded-xl p-3">
                이 가격표에 컬러 정보가 포함되지 않았습니다. 신차 선택 탭에서 AI 조회하면 컬러가 표시될 수 있습니다.
              </div>
            )}

            {/* ── STEP: 선택 옵션 (vehicle step에서 숨김) ── */}
            {wizardStep !== 'vehicle' && newCarSelectedTrim && newCarSelectedTrim.options?.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">
                  {stepIcons[5 + stepOffset]} 선택 옵션/패키지 <span className="text-slate-500 font-normal">(복수 선택 가능)</span>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {newCarSelectedTrim.options.map((opt, idx) => {
                    const isChecked = newCarSelectedOptions.some(o => o.name === opt.name)
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setNewCarSelectedOptions(prev =>
                            isChecked
                              ? prev.filter(o => o.name !== opt.name)
                              : [...prev, opt]
                          )
                          setNewCarPurchasePrice('')
                          setSelectedCar(null)
                        }}
                        className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                          isChecked
                            ? 'border-steel-500 bg-steel-50'
                            : 'border-black/[0.06] hover:border-steel-300 bg-white'
                        }`}
                      >
                        <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                          isChecked ? 'bg-steel-600 text-white' : 'bg-gray-100 border border-white/10'
                        }`}>
                          {isChecked && <span className="text-xs">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-slate-700">{opt.name}</p>
                          <p className="text-steel-600 font-bold text-sm">+{f(opt.price)}원</p>
                          {opt.description && <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── 최종 가격 요약 + 매입가 + 분석 시작 (vehicle step에서 숨김) ── */}
            {wizardStep !== 'vehicle' && newCarSelectedTrim && (
              <div className="p-4 bg-gray-50 rounded-xl border border-black/[0.06]">
                {/* 가격 요약 */}
                <div className="mb-3 pb-3 border-b border-black/[0.06]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">기본 출고가</span>
                    <span className="font-bold text-slate-600">{f(newCarSelectedTrim.base_price)}원</span>
                  </div>
                  {(newCarSelectedExterior?.price || 0) > 0 && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-slate-500">+ 외장 {newCarSelectedExterior!.name}</span>
                      <span className="font-bold text-steel-600">+{f(newCarSelectedExterior!.price)}원</span>
                    </div>
                  )}
                  {(newCarSelectedInterior?.price || 0) > 0 && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-slate-500">+ 내장 {newCarSelectedInterior!.name}</span>
                      <span className="font-bold text-steel-600">+{f(newCarSelectedInterior!.price)}원</span>
                    </div>
                  )}
                  {newCarSelectedOptions.length > 0 && (
                    <>
                      {newCarSelectedOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm mt-1">
                          <span className="text-slate-500">+ {opt.name}</span>
                          <span className="font-bold text-steel-600">+{f(opt.price)}원</span>
                        </div>
                      ))}
                    </>
                  )}
                  {(newCarSelectedOptions.length > 0 || (newCarSelectedExterior?.price || 0) > 0 || (newCarSelectedInterior?.price || 0) > 0) && (
                    <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-black/[0.06]">
                      <span className="font-bold text-slate-600">최종 출고가</span>
                      <span className="font-bold text-lg text-slate-800">
                        {f(Number(newCarSelectedTrim.base_price) + newCarSelectedOptions.reduce((s, o) => s + Number(o.price), 0) + Number(newCarSelectedExterior?.price || 0) + Number(newCarSelectedInterior?.price || 0))}원
                      </span>
                    </div>
                  )}
                </div>

                {/* 매입 할인 입력 + 분석 시작 */}
                {(() => {
                  const colorExtra = Number(newCarSelectedExterior?.price || 0) + Number(newCarSelectedInterior?.price || 0)
                  const totalFactory = Number(newCarSelectedTrim.base_price) + newCarSelectedOptions.reduce((s, o) => s + Number(o.price), 0) + colorExtra
                  const discountAmt = parseNum(newCarPurchasePrice)
                  const finalPurchase = discountAmt > 0 ? totalFactory - discountAmt : totalFactory
                  return (
                    <>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="font-bold text-slate-600">예상 매입가</span>
                        <span className="font-black text-lg text-slate-800">{f(finalPurchase)}원</span>
                      </div>
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-500 mb-1">
                            할인 금액
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="0"
                              value={newCarPurchasePrice}
                              onChange={(e) => setNewCarPurchasePrice(e.target.value.replace(/[^0-9,]/g, ''))}
                              className="w-full p-3 pr-8 border border-black/[0.06] rounded-lg font-bold text-base focus:border-steel-400 outline-none"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">원</span>
                          </div>
                          {discountAmt > 0 && (
                            <span className="text-[11px] text-steel-600 font-bold mt-1 block">
                              출고가 대비 {(discountAmt / totalFactory * 100).toFixed(1)}% 할인
                            </span>
                          )}
                        </div>
                        <button
                          onClick={handleNewCarAnalysis}
                          className="px-6 py-3 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          분석 시작
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        * 할인 없으면 비워두세요. 매입가 = 출고가 그대로 적용됩니다.
                      </p>
                    </>
                  )
                })()}
              </div>
            )}

            <p className="text-xs text-slate-500 text-right">
              * AI 자동 조회 결과입니다. 실제 출고가와 차이가 있을 수 있습니다.
            </p>
          </div>
          )
        })()}

        {/* 선택된 차량 요약 */}
        {selectedCar && (
          <div className="mt-4">
            <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-black/5 bg-gray-50/50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-steel-500" />
                <span className="text-xs font-bold text-slate-400">
                  {wizardStep === 'vehicle' ? '선택된 차량' : '분석 차량 정보'}
                </span>
                {(lookupMode === 'newcar' || lookupMode === 'saved') && newCarResult && (
                  <span className="text-[10px] px-2 py-0.5 bg-steel-100 text-steel-700 rounded-full font-bold ml-auto">✨ 신차 시뮬레이션</span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100">
                {((lookupMode === 'newcar' || lookupMode === 'saved') && newCarResult ? [
                  { label: '구분', value: '🆕 신차', accent: false },
                  { label: '모델', value: `${selectedCar.brand} ${selectedCar.model}`, accent: true },
                  { label: '트림', value: selectedCar.trim || '-', accent: false },
                  { label: '출고가', value: `${f(selectedCar.factory_price || 0)}원`, accent: true },
                ] : [
                  { label: '차량번호', value: selectedCar.number, accent: true },
                  { label: '모델', value: `${selectedCar.brand} ${selectedCar.model}`, accent: true },
                  { label: '구분', value: `${selectedCar.is_used ? '중고' : '신차'} / ${selectedCar.is_commercial === false ? '비영업' : '영업'}`, accent: false },
                  { label: '연식', value: `${selectedCar.year}년`, accent: false },
                  { label: '주행거리', value: `${f(selectedCar.mileage || 0)}km`, accent: false },
                  ...(selectedCar.is_used && selectedCar.purchase_mileage ? [
                    { label: '구입시 주행', value: `${f(selectedCar.purchase_mileage)}km`, accent: false },
                  ] : []),
                  { label: '매입가', value: `${f(selectedCar.purchase_price)}원`, accent: true },
                ]).map((item: any, i: number) => (
                  <div key={i} className="bg-white px-4 py-3">
                    <span className="text-[10px] text-slate-500 block mb-0.5">{item.label}</span>
                    <span className={`font-bold text-sm ${item.accent ? 'text-slate-800' : 'text-slate-400'}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 차량선택 → 차량옵션 다음 단계 네비게이션 */}
        {selectedCar && wizardStep === 'vehicle' && (
          <div className="max-w-[800px] mx-auto mt-4 flex items-center justify-between bg-blue-50/80 border border-blue-200/60 rounded-xl px-4 py-3">
            <span className="text-xs font-bold text-blue-600">✓ {selectedCar.brand} {selectedCar.model} 선택됨</span>
            <button
              onClick={() => setWizardStep('options')}
              className="px-4 py-1.5 rounded-lg text-white text-xs font-bold hover:opacity-90 transition-opacity"
              style={{ background: '#3b6eb5' }}
            >
              다음: 차량옵션 →
            </button>
          </div>
        )}

        {/* 카탈로그 트림 선택 시 버튼은 카드 안에 포함 (line ~3663) → 하단 fallback 불필요 */}
      </>)}

      {/* ===== Step 2: 차량옵션 (색상 · 패키지 · 매입가) ===== */}
      {wizardStep === 'options' && (<>
        {/* 차량 요약 바 */}
        <div className="mb-4 flex items-center justify-between bg-white/70 backdrop-blur-md border border-black/5 rounded-2xl px-4 py-2.5">
          <div className="flex items-center gap-3 text-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-bold text-slate-700">
              {newCarResult ? `${newCarResult.brand} ${newCarResult.model}` : selectedCar ? `${selectedCar.brand} ${selectedCar.model}` : ''}
            </span>
            {newCarSelectedVariant && (
              <><span className="text-slate-400">·</span><span className="text-slate-500 text-xs">{newCarSelectedVariant.variant_name}</span></>
            )}
            {newCarSelectedTrim && (
              <><span className="text-slate-400">·</span><span className="text-slate-500 text-xs">{newCarSelectedTrim.name}</span></>
            )}
            {selectedCar && !newCarResult && (
              <><span className="text-slate-400">·</span><span className="text-slate-500 text-xs">{selectedCar.year}년 · {selectedCar.number || ''}</span></>
            )}
          </div>
          <button onClick={() => setWizardStep('vehicle')} className="text-xs text-slate-500 hover:text-slate-700 font-bold px-3 py-1 rounded-lg hover:bg-slate-100">
            ← 차량 변경
          </button>
        </div>

        {/* === 신차 카탈로그: 외장/내장/옵션/가격 === */}
        {(lookupMode === 'newcar' || lookupMode === 'saved') && newCarSelectedTrim && (
          <div className="p-5 border border-steel-200 rounded-2xl space-y-4" style={{ background: 'rgba(255,255,255,0.72)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
            {/* 트림 요약 헤더 */}
            <div className="flex items-center gap-3 pb-3 border-b border-black/[0.06]">
              <span className="text-sm font-bold text-slate-600">
                {newCarResult?.brand} {newCarResult?.model} — {newCarSelectedVariant?.variant_name} / {newCarSelectedTrim.name}
              </span>
              <span className="text-xs px-2 py-0.5 bg-steel-100 text-steel-700 rounded-full font-bold">
                기본가 {f(newCarSelectedTrim.base_price)}원
              </span>
            </div>

            {/* 외장 컬러 선택 */}
            {newCarSelectedTrim.exterior_colors?.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">① 외장 컬러</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {newCarSelectedTrim.exterior_colors.map((color: any, idx: number) => (
                    <button key={idx}
                      onClick={() => { setNewCarSelectedExterior(color); setNewCarPurchasePrice(''); setSelectedCar(null) }}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border-2 transition-all text-left ${
                        newCarSelectedExterior?.name === color.name
                          ? 'border-steel-500 bg-steel-50 shadow-md'
                          : 'border-black/[0.06] hover:border-steel-300 bg-white'
                      }`}
                    >
                      {color.hex && <div className="w-6 h-6 rounded-full border border-black/10 shrink-0" style={{ background: color.hex }} />}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-xs text-slate-700 truncate">{color.name}</p>
                        {color.price > 0 && <p className="text-steel-600 font-bold text-xs">+{f(color.price)}원</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 내장 컬러 선택 */}
            {newCarSelectedTrim.interior_colors?.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">② 내장 컬러</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {newCarSelectedTrim.interior_colors.map((color: any, idx: number) => (
                    <button key={idx}
                      onClick={() => { setNewCarSelectedInterior(color); setNewCarPurchasePrice(''); setSelectedCar(null) }}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border-2 transition-all text-left ${
                        newCarSelectedInterior?.name === color.name
                          ? 'border-steel-500 bg-steel-50 shadow-md'
                          : 'border-black/[0.06] hover:border-steel-300 bg-white'
                      }`}
                    >
                      {color.hex && <div className="w-6 h-6 rounded-full border border-black/10 shrink-0" style={{ background: color.hex }} />}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-xs text-slate-700 truncate">{color.name}</p>
                        {color.price > 0 && <p className="text-steel-600 font-bold text-xs">+{f(color.price)}원</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 컬러 정보 없음 안내 */}
            {(!newCarSelectedTrim.exterior_colors || newCarSelectedTrim.exterior_colors.length === 0) && (!newCarSelectedTrim.interior_colors || newCarSelectedTrim.interior_colors.length === 0) && (
              <div className="text-xs text-slate-500 bg-gray-50 rounded-xl p-3">
                이 가격표에 컬러 정보가 포함되지 않았습니다.
              </div>
            )}

            {/* 선택 옵션/패키지 */}
            {newCarSelectedTrim.options?.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">
                  ③ 선택 옵션/패키지 <span className="text-slate-500 font-normal">(복수 선택 가능)</span>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {newCarSelectedTrim.options.map((opt: any, idx: number) => {
                    const isChecked = newCarSelectedOptions.some((o: any) => o.name === opt.name)
                    return (
                      <button key={idx}
                        onClick={() => { setNewCarSelectedOptions((prev: any[]) => isChecked ? prev.filter((o: any) => o.name !== opt.name) : [...prev, opt]); setNewCarPurchasePrice(''); setSelectedCar(null) }}
                        className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                          isChecked ? 'border-steel-500 bg-steel-50' : 'border-black/[0.06] hover:border-steel-300 bg-white'
                        }`}
                      >
                        <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${isChecked ? 'bg-steel-600 text-white' : 'bg-gray-100 border border-white/10'}`}>
                          {isChecked && <span className="text-xs">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-slate-700">{opt.name}</p>
                          <p className="text-steel-600 font-bold text-sm">+{f(opt.price)}원</p>
                          {opt.description && <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 최종 가격 요약 + 매입 할인 + 분석 시작 */}
            <div className="p-4 bg-gray-50 rounded-xl border border-black/[0.06]">
              {/* 가격 요약 */}
              <div className="mb-3 pb-3 border-b border-black/[0.06]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">기본 출고가</span>
                  <span className="font-bold text-slate-600">{f(newCarSelectedTrim.base_price)}원</span>
                </div>
                {(newCarSelectedExterior?.price || 0) > 0 && (
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-slate-500">+ 외장 {newCarSelectedExterior!.name}</span>
                    <span className="font-bold text-steel-600">+{f(newCarSelectedExterior!.price)}원</span>
                  </div>
                )}
                {(newCarSelectedInterior?.price || 0) > 0 && (
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-slate-500">+ 내장 {newCarSelectedInterior!.name}</span>
                    <span className="font-bold text-steel-600">+{f(newCarSelectedInterior!.price)}원</span>
                  </div>
                )}
                {newCarSelectedOptions.length > 0 && newCarSelectedOptions.map((opt: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-sm mt-1">
                    <span className="text-slate-500">+ {opt.name}</span>
                    <span className="font-bold text-steel-600">+{f(opt.price)}원</span>
                  </div>
                ))}
                {(() => {
                  const colorExtra = Number(newCarSelectedExterior?.price || 0) + Number(newCarSelectedInterior?.price || 0)
                  const totalFactory = Number(newCarSelectedTrim.base_price) + newCarSelectedOptions.reduce((s: number, o: any) => s + Number(o.price), 0) + colorExtra
                  return (newCarSelectedOptions.length > 0 || colorExtra > 0) ? (
                    <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-black/[0.06]">
                      <span className="font-bold text-slate-600">최종 출고가</span>
                      <span className="font-bold text-lg text-slate-800">{f(totalFactory)}원</span>
                    </div>
                  ) : null
                })()}
              </div>

              {/* 매입 할인 입력 + 분석 시작 */}
              {(() => {
                const colorExtra = Number(newCarSelectedExterior?.price || 0) + Number(newCarSelectedInterior?.price || 0)
                const totalFactory = Number(newCarSelectedTrim.base_price) + newCarSelectedOptions.reduce((s: number, o: any) => s + Number(o.price), 0) + colorExtra
                const discountAmt = parseNum(newCarPurchasePrice)
                const finalPurchase = discountAmt > 0 ? totalFactory - discountAmt : totalFactory
                return (
                  <>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="font-bold text-slate-600">예상 매입가</span>
                      <span className="font-black text-lg text-slate-800">{f(finalPurchase)}원</span>
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-1">할인 금액</label>
                        <div className="relative">
                          <input type="text" placeholder="0" value={newCarPurchasePrice}
                            onChange={(e) => setNewCarPurchasePrice(e.target.value.replace(/[^0-9,]/g, ''))}
                            className="w-full p-3 pr-8 border border-black/[0.06] rounded-lg font-bold text-base focus:border-steel-400 outline-none" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">원</span>
                        </div>
                        {discountAmt > 0 && (
                          <span className="text-[11px] text-steel-600 font-bold mt-1 block">
                            출고가 대비 {(discountAmt / totalFactory * 100).toFixed(1)}% 할인
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => { handleNewCarAnalysis(); setWizardStep('analysis') }}
                        className="px-6 py-3 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        다음: 상세견적 →
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">* 할인 없으면 비워두세요. 매입가 = 출고가 그대로 적용됩니다.</p>
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {/* === 등록차량: 간단 요약 + 다음 === */}
        {lookupMode === 'registered' && selectedCar && (
          <div className="space-y-4">
            {/* 차량 상세 요약 카드 */}
            <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-black/5 bg-gray-50/50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-slate-400">등록 차량 정보</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100">
                {[
                  { label: '차량번호', value: selectedCar.number, accent: true },
                  { label: '모델', value: `${selectedCar.brand} ${selectedCar.model}`, accent: true },
                  { label: '구분', value: `${selectedCar.is_used ? '중고' : '신차'} / ${selectedCar.is_commercial === false ? '비영업' : '영업'}`, accent: false },
                  { label: '연식', value: `${selectedCar.year}년`, accent: false },
                  { label: '주행거리', value: `${f(selectedCar.mileage || 0)}km`, accent: false },
                  { label: '출고가', value: `${f(selectedCar.factory_price || 0)}원`, accent: false },
                  { label: '매입가', value: `${f(selectedCar.purchase_price)}원`, accent: true },
                  { label: '배기량', value: `${(selectedCar.engine_cc || 0).toLocaleString()}cc`, accent: false },
                ].map((item: any, i: number) => (
                  <div key={i} className="bg-white px-4 py-3">
                    <span className="text-[10px] text-slate-500 block mb-0.5">{item.label}</span>
                    <span className={`font-bold text-sm ${item.accent ? 'text-slate-800' : 'text-slate-400'}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-xs text-emerald-600 font-bold">등록차량은 이미 사양이 확정되어 있습니다. 바로 상세견적으로 이동합니다.</p>
            </div>

            {/* 네비게이션 */}
            <div className="flex justify-between">
              <button onClick={() => setWizardStep('vehicle')} className="text-sm text-slate-500 hover:text-slate-600 font-bold">
                ← 차량 변경
              </button>
              <button onClick={() => setWizardStep('analysis')}
                className="px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 shadow-sm"
                style={{ background: '#3b6eb5' }}>
                다음: 상세견적 →
              </button>
            </div>
          </div>
        )}

        {/* === 신차인데 아직 옵션/가격 확인 전 (selectedCar 있음) → 바로 다음 단계 === */}
        {(lookupMode === 'newcar' || lookupMode === 'saved') && selectedCar && !newCarSelectedTrim && (
          <div className="flex justify-between mt-6">
            <button onClick={() => setWizardStep('vehicle')} className="text-sm text-slate-500 hover:text-slate-600 font-bold">
              ← 차량 변경
            </button>
            <button onClick={() => setWizardStep('analysis')}
              className="px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 shadow-sm"
              style={{ background: '#3b6eb5' }}>
              다음: 상세견적 →
            </button>
          </div>
        )}
      </>)}
    </>
  )
}
