'use client'

// ═══════════════════════════════════════════════════════════════
// 인사 마스터 — 프리랜서 탭 (2026-08-08 재작성, 구 화면 로직 승계)
// 3.3% 사업소득 인력. 지급 처리는 급여 운영(/hr/payroll)에서.
// 데이터: /api/freelancers (CRUD·UPSERT) · /api/finance/parse-freelancers (파일 파싱)
// ═══════════════════════════════════════════════════════════════

import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import NeuDataTable, { TableColumn } from '@/app/components/NeuDataTable'
import DcToolbar from '@/app/components/DcToolbar'
import { getAuthHeader } from '@/app/utils/auth-client'
import { COLORS } from '@/app/utils/ui-tokens'
import { Badge, cardS, inputS, lblS, btnPrimaryS, btnGhostS } from './hr-shared'

type Freelancer = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  bank_name?: string | null
  account_number?: string | null
  account_holder?: string | null
  reg_number?: string | null
  tax_type?: string | null
  service_type?: string | null
  is_active: boolean | number
  memo?: string | null
}

type BulkRow = Record<string, any> & { _row: number; _status: 'ready' | 'update' | 'duplicate' | 'saved' | 'error'; _note: string }

const FL_EMPTY = {
  name: '', phone: '', email: '', bank_name: 'KB국민은행', account_number: '',
  account_holder: '', reg_number: '', tax_type: '사업소득(3.3%)', service_type: '기타',
  is_active: true, memo: '',
}

type Props = {
  freelancers: Freelancer[]
  loading: boolean
  onChanged: () => void
  showToast: (text: string, tone?: 'success' | 'error') => void
}

export default function FreelancerTab({ freelancers, loading, onChanged, showToast }: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')

  // ── 개별 등록/수정 폼 ──
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...FL_EMPTY })
  const [saving, setSaving] = useState(false)

  // ── 일괄 등록 ──
  const [showBulk, setShowBulk] = useState(false)
  const [bulkData, setBulkData] = useState<BulkRow[]>([])
  const [bulkLogs, setBulkLogs] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const rows = useMemo(() => {
    let list = freelancers
    if (statusFilter === 'active') list = list.filter(f => !!f.is_active)
    else if (statusFilter === 'inactive') list = list.filter(f => !f.is_active)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(f => [f.name, f.phone, f.service_type].filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
    return list
  }, [freelancers, statusFilter, search])

  const activeCount = freelancers.filter(f => !!f.is_active).length

  const openForm = (f?: Freelancer) => {
    if (f) {
      setEditingId(f.id)
      setForm({
        name: f.name || '', phone: f.phone || '', email: f.email || '',
        bank_name: f.bank_name || 'KB국민은행', account_number: f.account_number || '',
        account_holder: f.account_holder || '', reg_number: f.reg_number || '',
        tax_type: f.tax_type || '사업소득(3.3%)', service_type: f.service_type || '기타',
        is_active: f.is_active !== false && f.is_active !== 0, memo: f.memo || '',
      })
    } else {
      setEditingId(null)
      setForm({ ...FL_EMPTY })
    }
    setShowForm(true)
  }

  const saveForm = async () => {
    if (!form.name.trim()) { showToast('이름은 필수입니다', 'error'); return }
    setSaving(true)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await getAuthHeader()) }
      const res = editingId
        ? await fetch(`/api/freelancers/${editingId}`, { method: 'PATCH', headers, body: JSON.stringify(form) })
        : await fetch('/api/freelancers', { method: 'POST', headers, body: JSON.stringify(form) })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        showToast((editingId ? '수정 실패: ' : '등록 실패: ') + (j.error || res.statusText), 'error')
        return
      }
      showToast(editingId ? '프리랜서 정보가 수정되었습니다' : '프리랜서가 등록되었습니다')
      setShowForm(false)
      onChanged()
    } catch (e: any) {
      showToast('저장 실패: ' + e.message, 'error')
    } finally { setSaving(false) }
  }

  const toggleActive = async (f: Freelancer) => {
    try {
      const res = await fetch(`/api/freelancers/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ is_active: !f.is_active }),
      })
      if (!res.ok) { showToast('상태 변경에 실패했습니다', 'error'); return }
      onChanged()
    } catch { showToast('상태 변경 중 오류가 발생했습니다', 'error') }
  }

  // ── 엑셀 양식/명단 ──
  const downloadTemplate = () => {
    const sample = [
      { '이름': '홍길동', '연락처': '010-1234-5678', '이메일': 'hong@email.com', '은행': 'KB국민은행', '계좌번호': '123-456-789012', '예금주': '홍길동', '주민번호': '', '세금유형': '사업소득(3.3%)', '업종': '탁송', '메모': '' },
    ]
    const ws = XLSX.utils.json_to_sheet(sample)
    ws['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '프리랜서')
    XLSX.writeFile(wb, '프리랜서_등록양식.xlsx')
  }

  const downloadList = () => {
    if (freelancers.length === 0) { showToast('등록된 프리랜서가 없습니다', 'error'); return }
    const data = freelancers.map(f => ({
      '이름': f.name || '', '연락처': f.phone || '', '이메일': f.email || '',
      '은행': f.bank_name || '', '계좌번호': f.account_number || '', '예금주': f.account_holder || '',
      '주민번호': f.reg_number || '', '세금유형': f.tax_type || '', '업종': f.service_type || '',
      '상태': f.is_active ? '활성' : '비활성', '메모': f.memo || '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '프리랜서')
    XLSX.writeFile(wb, `프리랜서_명단_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── 파일 파싱 (AI 우선 · 엑셀 폴백) ──
  const parseWithAi = async (file: File): Promise<any[]> => {
    setBulkLogs(prev => [...prev, '파일 분석 중…'])
    try {
      let content = ''
      let mimeType = file.type
      let isText = false
      if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
        const ab = await file.arrayBuffer()
        const wb = XLSX.read(ab, { type: 'array' })
        content = wb.SheetNames.map(name => `--- 시트: ${name} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`).join('\n\n')
        isText = true
      } else {
        content = await new Promise<string>(resolve => {
          const r = new FileReader()
          r.onload = () => resolve((r.result as string).split(',')[1])
          r.readAsDataURL(file)
        })
      }
      const res = await fetch('/api/finance/parse-freelancers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ content, mimeType, isText }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.results?.length > 0) {
          setBulkLogs(prev => [...prev, `${data.results.length}명 추출 완료`])
          return data.results
        }
      }
      setBulkLogs(prev => [...prev, '자동 분석 결과가 없어 기본 파싱으로 전환합니다'])
    } catch {
      setBulkLogs(prev => [...prev, '자동 분석 실패 — 기본 파싱으로 전환합니다'])
    }
    return []
  }

  const parseExcelFallback = async (file: File): Promise<any[]> => {
    const ab = await file.arrayBuffer()
    const wb = XLSX.read(ab, { type: 'array' })
    let all: any[] = []
    for (const sheetName of wb.SheetNames) {
      const sheetRows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
      all = [...all, ...sheetRows.map((row: any, i: number) => ({
        name: String(row['이름'] || row['성명'] || row['name'] || '').trim(),
        phone: String(row['연락처'] || row['전화번호'] || '').trim(),
        email: row['이메일'] || row['email'] || '',
        bank_name: row['은행'] || 'KB국민은행',
        account_number: String(row['계좌번호'] || '').trim(),
        account_holder: row['예금주'] || String(row['이름'] || '').trim(),
        reg_number: String(row['주민번호'] || row['사업자번호'] || '').trim(),
        tax_type: row['세금유형'] || '사업소득(3.3%)',
        service_type: row['업종'] || '기타',
        is_active: true, memo: row['메모'] || '',
        _row: i + 2, _status: 'ready' as const, _note: '',
      })).filter(r => r.name)]
    }
    return all
  }

  const applyDuplicateCheck = (parsed: BulkRow[]) => {
    const existing: Record<string, Freelancer> = {}
    for (const f of freelancers) {
      existing[`${f.name}|${f.phone || ''}`] = f
      if (!existing[f.name]) existing[f.name] = f
    }
    const seen = new Set<string>()
    let dup = 0, upd = 0, fresh = 0
    for (const item of parsed) {
      const key = `${item.name}|${item.phone || ''}`
      if (existing[key] || existing[item.name]) { item._status = 'update'; item._note = '동일 이름 — 업데이트'; upd++ }
      else if (seen.has(key)) { item._status = 'duplicate'; item._note = '파일 내 중복'; dup++ }
      else { item._status = 'ready'; fresh++ }
      seen.add(key)
    }
    const parts = [`${parsed.length}명 파싱`]
    if (fresh) parts.push(`신규 ${fresh}명`)
    if (upd) parts.push(`업데이트 ${upd}명`)
    if (dup) parts.push(`파일 내 중복 ${dup}명 제외`)
    setBulkLogs(prev => [...prev, parts.join(' · ')])
  }

  const processFiles = async (files: File[]) => {
    setBulkBusy(true)
    setBulkLogs([`${files.length}개 파일 선택됨`])
    setBulkData([])
    try {
      let all: BulkRow[] = []
      for (const file of files) {
        setBulkLogs(prev => [...prev, `${file.name} (${(file.size / 1024).toFixed(1)}KB)`])
        const aiParsed = await parseWithAi(file)
        if (aiParsed.length > 0) {
          all = [...all, ...aiParsed.map((item: any, i: number) => ({
            name: String(item.name || '').trim(),
            phone: String(item.phone || '').trim(),
            email: item.email || '',
            bank_name: item.bank_name || 'KB국민은행',
            account_number: String(item.account_number || '').trim(),
            account_holder: item.account_holder || String(item.name || '').trim(),
            reg_number: String(item.reg_number || '').trim(),
            tax_type: item.tax_type || '사업소득(3.3%)',
            service_type: item.service_type || '기타',
            is_active: true, memo: item.memo || '',
            _row: i + 1, _status: 'ready' as const, _note: '',
          })).filter((r: any) => r.name)]
        } else if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
          all = [...all, ...(await parseExcelFallback(file))]
        }
      }
      if (all.length === 0) { setBulkLogs(prev => [...prev, '파싱된 데이터가 없습니다']); return }
      applyDuplicateCheck(all)
      setBulkData(all)
    } finally { setBulkBusy(false) }
  }

  const saveBulk = async () => {
    const toSave = bulkData.filter(d => d._status === 'ready' || d._status === 'update')
    if (toSave.length === 0) { showToast('저장할 데이터가 없습니다', 'error'); return }
    const newCnt = toSave.filter(d => d._status === 'ready').length
    const updCnt = toSave.filter(d => d._status === 'update').length
    if (!confirm(`신규 ${newCnt}명${updCnt ? ` + 업데이트 ${updCnt}명` : ''} 진행하시겠습니까?`)) return
    setBulkBusy(true)
    let saved = 0, updated = 0
    try {
      const headers = { 'Content-Type': 'application/json', ...(await getAuthHeader()) }
      for (const item of toSave) {
        const wasUpdate = item._status === 'update'
        const { _row, _status, _note, ...payload } = item
        try {
          const res = await fetch('/api/freelancers', { method: 'POST', headers, body: JSON.stringify({ ...payload, upsert: true }) })
          const json = await res.json().catch(() => ({}))
          if (json.error) { item._status = 'error'; item._note = json.error }
          else if (json.upserted === 'updated' || wasUpdate) { item._status = 'saved'; item._note = '업데이트 완료'; updated++ }
          else { item._status = 'saved'; item._note = '신규 등록 완료'; saved++ }
        } catch (e: any) {
          item._status = 'error'; item._note = e.message
        }
      }
      setBulkData([...bulkData])
      const summary = [saved > 0 ? `신규 ${saved}명` : null, updated > 0 ? `업데이트 ${updated}명` : null].filter(Boolean).join(' · ')
      setBulkLogs(prev => [...prev, summary ? `저장 완료 — ${summary}` : '저장 완료'])
      if (saved + updated > 0) { showToast(`프리랜서 ${saved + updated}명이 반영되었습니다`); onChanged() }
    } finally { setBulkBusy(false) }
  }

  const columns: TableColumn<Freelancer>[] = [
    {
      key: 'name', label: '이름', width: '24%',
      sortBy: (f) => f.name || '',
      render: (f) => (
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{f.name}</div>
          <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 }}>{f.tax_type || '사업소득(3.3%)'}</div>
        </div>
      ),
    },
    {
      key: 'service', label: '업무', width: 100,
      sortBy: (f) => f.service_type || '',
      render: (f) => <span style={{ fontSize: 12.5 }}>{f.service_type || '기타'}</span>,
    },
    {
      key: 'phone', label: '연락처', width: 130,
      sortBy: (f) => f.phone || '',
      render: (f) => f.phone
        ? <span style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{f.phone}</span>
        : <span style={{ fontSize: 11.5, color: COLORS.textDim }}>미입력</span>,
    },
    {
      key: 'account', label: '계좌', width: '26%', hideOnMobile: true,
      sortBy: (f) => f.bank_name || '',
      render: (f) => f.account_number
        ? <span style={{ fontSize: 12.5 }}>{[f.bank_name, f.account_number].filter(Boolean).join(' ')}</span>
        : <span style={{ fontSize: 11.5, color: COLORS.textDim }}>미입력</span>,
    },
    {
      key: 'active', label: '상태', width: 84, align: 'center',
      sortBy: (f) => (f.is_active ? 0 : 1),
      render: (f) => (
        <button onClick={(e) => { e.stopPropagation(); toggleActive(f) }}
          title={f.is_active ? '비활성으로 전환' : '활성으로 전환'}
          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
          {f.is_active
            ? <Badge label="활성" bg={COLORS.bgGreen} fg={COLORS.success} />
            : <Badge label="비활성" bg={COLORS.borderFaint} fg={COLORS.textDim} />}
        </button>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DcToolbar
        search={search} onSearchChange={setSearch} placeholder="이름 · 연락처 · 업종 검색"
        filters={[
          { key: 'all', label: '전체', count: freelancers.length },
          { key: 'active', label: '활성', count: activeCount },
          { key: 'inactive', label: '비활성', count: freelancers.length - activeCount },
        ]}
        activeFilter={statusFilter}
        onFilterChange={(k) => setStatusFilter(k as any)}
        trailing={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={downloadList} style={{ ...btnGhostS, padding: '7px 12px', fontSize: 12.5 }}>명단 내려받기</button>
            <button onClick={() => { setShowBulk(true); setBulkData([]); setBulkLogs([]) }} style={{ ...btnGhostS, padding: '7px 12px', fontSize: 12.5 }}>파일로 일괄 등록</button>
            <button onClick={() => openForm()} style={{ ...btnPrimaryS, padding: '7px 14px', fontSize: 12.5 }}>+ 프리랜서 등록</button>
          </div>
        }
      />
      <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: -4 }}>
        용역비 지급 처리는 급여 운영 화면에서 진행합니다
      </div>
      <NeuDataTable
        columns={columns}
        data={rows}
        rowKey={(f) => f.id}
        onRowClick={(f) => openForm(f)}
        loading={loading}
        emptyMessage={search ? '검색 결과가 없습니다' : '등록된 프리랜서가 없습니다'}
        mobileCard={{
          title: (f) => f.name,
          subtitle: (f) => [f.service_type, f.phone].filter(Boolean).join(' · '),
          trailing: (f) => f.is_active
            ? <Badge label="활성" bg={COLORS.bgGreen} fg={COLORS.success} />
            : <Badge label="비활성" bg={COLORS.borderFaint} fg={COLORS.textDim} />,
        }}
      />

      {/* 개별 등록/수정 모달 */}
      {showForm && (
        <div onClick={() => !saving && setShowForm(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.24)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ ...cardS, width: 520, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', borderRadius: 14, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>{editingId ? '프리랜서 수정' : '프리랜서 등록'}</h2>
              <button onClick={() => setShowForm(false)}
                style={{ border: 'none', background: COLORS.borderFaint, borderRadius: 8, width: 30, height: 30, fontSize: 15, color: COLORS.textSecondary, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={lblS}>이름 *</label><input style={inputS} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div><label style={lblS}>연락처</label><input style={inputS} value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <div><label style={lblS}>이메일</label><input style={inputS} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div><label style={lblS}>업종</label><input style={inputS} value={form.service_type} onChange={e => setForm(p => ({ ...p, service_type: e.target.value }))} /></div>
              <div><label style={lblS}>은행</label><input style={inputS} value={form.bank_name} onChange={e => setForm(p => ({ ...p, bank_name: e.target.value }))} /></div>
              <div><label style={lblS}>계좌번호</label><input style={inputS} value={form.account_number} onChange={e => setForm(p => ({ ...p, account_number: e.target.value }))} /></div>
              <div><label style={lblS}>예금주</label><input style={inputS} value={form.account_holder} onChange={e => setForm(p => ({ ...p, account_holder: e.target.value }))} /></div>
              <div><label style={lblS}>주민·사업자번호</label><input style={inputS} value={form.reg_number} onChange={e => setForm(p => ({ ...p, reg_number: e.target.value }))} /></div>
              <div><label style={lblS}>세금유형</label>
                <select style={inputS} value={form.tax_type} onChange={e => setForm(p => ({ ...p, tax_type: e.target.value }))}>
                  <option value="사업소득(3.3%)">사업소득(3.3%)</option>
                  <option value="기타소득(8.8%)">기타소득(8.8%)</option>
                  <option value="세금계산서">세금계산서</option>
                </select>
              </div>
              <div><label style={lblS}>상태</label>
                <select style={inputS} value={form.is_active ? '1' : '0'} onChange={e => setForm(p => ({ ...p, is_active: e.target.value === '1' }))}>
                  <option value="1">활성</option>
                  <option value="0">비활성</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lblS}>메모</label><input style={inputS} value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowForm(false)} style={btnGhostS}>취소</button>
              <button onClick={saveForm} disabled={saving} style={btnPrimaryS}>{saving ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 등록 모달 */}
      {showBulk && (
        <div onClick={() => !bulkBusy && setShowBulk(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.24)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ ...cardS, width: 720, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', borderRadius: 14, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>프리랜서 일괄 등록</h2>
              <button onClick={() => setShowBulk(false)}
                style={{ border: 'none', background: COLORS.borderFaint, borderRadius: 8, width: 30, height: 30, fontSize: 15, color: COLORS.textSecondary, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={() => fileRef.current?.click()} disabled={bulkBusy} style={btnPrimaryS}>파일 선택</button>
              <button onClick={downloadTemplate} style={btnGhostS}>등록 양식 내려받기</button>
              <input ref={fileRef} type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg" style={{ display: 'none' }}
                onChange={e => {
                  const files = Array.from(e.target.files || [])
                  if (files.length > 0) processFiles(files)
                  e.target.value = ''
                }} />
            </div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>
              엑셀·CSV·PDF·사진에서 이름과 계좌 정보를 자동으로 읽습니다 · 동일 이름은 업데이트로 처리됩니다
            </div>
            {bulkLogs.length > 0 && (
              <div style={{ background: '#fafbfc', border: `1px solid ${COLORS.borderFaint}`, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: COLORS.textSecondary, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {bulkLogs.map((log, i) => <span key={i}>{log}</span>)}
              </div>
            )}
            {bulkData.length > 0 && (
              <>
                <div style={{ ...cardS, boxShadow: 'none', marginBottom: 12, maxHeight: 320, overflowY: 'auto' }}>
                  {bulkData.map((row, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: `1px solid ${COLORS.borderFaint}`, fontSize: 12.5 }}>
                      <span style={{ flex: '0 0 90px', fontWeight: 700 }}>{row.name}</span>
                      <span style={{ flex: '0 0 110px', color: COLORS.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{row.phone || '—'}</span>
                      <span style={{ flex: 1, color: COLORS.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[row.bank_name, row.account_number].filter(Boolean).join(' ') || '계좌 미입력'}
                      </span>
                      {row._status === 'ready' && <Badge label="신규" bg={COLORS.bgGreen} fg={COLORS.success} />}
                      {row._status === 'update' && <Badge label="업데이트" bg={COLORS.bgBlue} fg={COLORS.primary} />}
                      {row._status === 'duplicate' && <Badge label="중복 제외" bg={COLORS.bgAmber} fg={COLORS.warning} />}
                      {row._status === 'saved' && <Badge label="저장됨" bg={COLORS.bgGreen} fg={COLORS.success} />}
                      {row._status === 'error' && <Badge label={row._note || '오류'} bg={COLORS.bgRed} fg={COLORS.danger} />}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button onClick={() => setShowBulk(false)} style={btnGhostS}>닫기</button>
                  <button onClick={saveBulk} disabled={bulkBusy} style={btnPrimaryS}>
                    {bulkBusy ? '처리 중…' : '일괄 저장'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
